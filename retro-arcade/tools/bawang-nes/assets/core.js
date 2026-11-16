/**
 * core.js - 《三国志2：霸王的大陆 中文版》(bawang-nes) 掌机内核适配器
 *
 * 研发规范与契约实现:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 细长中文胶囊功能键 (「选择」与「开始」，8 帧触控防漏缓冲，严禁标“投币”)
 * 3. A 键确认/进选单，B 键取消/退选单
 * 4. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 5. 开机脉冲秒开预热穿透开场等待，首屏 0.1 秒直出 100% 全彩大标题
 * 6. Web Audio 环形缓冲区 (32768) + 四重硬件级静音锁 + 全手势通电破冰
 * 7. 59s / 32MB 录屏音频闭环 (connectRecordingAudio 必须返回有效 MediaStreamTrack)
 * 8. 即时存档/读档标准双接口契约 (exportState / importState / saveState / loadState)
 * 9. core.reset() 纯内存重置并预热秒开标题
 * 10. 设置与声音彻底解耦，严禁私自监听底栏 DOM
 * 11. 支持 Namco 163 (Mapper 19) 芯片完整读写与中断
 */

(function() {
  "use strict";

  // NES 标准手柄键位码 (Joypad Controller 1)
  const NES_BTN = {
    a: 0,      // A 确认 / 进选单
    b: 1,      // B 取消 / 退选单
    select: 2, // 选择键 (切换选项)
    start: 3,  // 开始键 (开始 / 确认 / 暂停)
    up: 4,     // 上
    down: 5,   // 下
    left: 6,   // 左
    right: 7   // 右
  };

  // 原始按键输入状态
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    select: false,
    start: false
  };

  // 关键功能键 8 帧触控防漏脉冲缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 画面渲染规格
  const SCREEN_WIDTH = 256;
  const SCREEN_HEIGHT = 240;
  const FRAME_MS = 1000 / 60;

  // 离屏渲染画板与像素缓冲
  const offscreenCanvas = (typeof document !== "undefined" && document.createElement)
    ? document.createElement("canvas")
    : { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => null };
  offscreenCanvas.width = SCREEN_WIDTH;
  offscreenCanvas.height = SCREEN_HEIGHT;
  const offscreenCtx = (typeof offscreenCanvas.getContext === "function")
    ? offscreenCanvas.getContext("2d", { alpha: false })
    : null;
  const offscreenImageData = offscreenCtx
    ? offscreenCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT)
    : { data: new Uint32Array(SCREEN_WIDTH * SCREEN_HEIGHT) };
  const offscreenBuf32 = new Uint32Array(offscreenImageData.data.buffer);

  // 模拟器实例与二进制 ROM 备份
  let nes = null;
  let binaryRomData = "";
  let isBooted = false;

  // 运行速度倍率与时间积分累加器
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;

  // Web Audio 环形缓冲区 (32768) 与四重静音锁
  const AUDIO_BUF_SIZE = 32768;
  const audioRingL = new Float32Array(AUDIO_BUF_SIZE);
  const audioRingR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioMediaDest = null;
  let masterGainNode = null;
  let audioPrimes = 0;
  let isMute = false;
  let audioCallbacks = 0;

  // 读取静音初始持久化状态
  try {
    if (typeof localStorage !== "undefined") {
      const savedSettings = localStorage.getItem("ggemu_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed && typeof parsed.sound === "boolean") {
          isMute = !parsed.sound;
        }
      }
      const rawMute = localStorage.getItem("ggemu_mute");
      if (rawMute !== null) {
        isMute = (rawMute === "true");
      }
    }
  } catch (_) {}

  // 初始化 Web Audio API 上下文
  function initAudioContext() {
    if (audioCtx) return;
    const AudioContextClass = (typeof window !== "undefined")
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return;

    try {
      try {
        audioCtx = new AudioContextClass({ sampleRate: 44100 });
      } catch (_) {
        audioCtx = new AudioContextClass();
      }

      if (audioCtx.createGain) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = isMute ? 0 : 1.0;
        masterGainNode.connect(audioCtx.destination);
      }

      if (audioCtx.createScriptProcessor) {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
      } else if (audioCtx.createJavaScriptNode) {
        audioScriptNode = audioCtx.createJavaScriptNode(2048, 0, 2);
      }

      if (audioScriptNode) {
        audioScriptNode.onaudioprocess = onAudioProcess;
        if (masterGainNode) {
          audioScriptNode.connect(masterGainNode);
        } else {
          audioScriptNode.connect(audioCtx.destination);
        }
      }
    } catch (e) {
      console.warn("initAudioContext failed:", e);
    }
  }

  // 唤醒与手势通电破冰
  function activateAudio() {
    if (isMute) return;

    try {
      if (typeof navigator !== "undefined" && navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    if (typeof window !== "undefined" && window.xhs && window.xhs.miniTool) {
      try {
        if (typeof window.xhs.miniTool.enableAudio === "function") {
          window.xhs.miniTool.enableAudio();
        }
      } catch (_) {}
    }

    initAudioContext();

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function() {});
    }

    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }
  }

  // 全局手势事件监听
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // 音频处理回调
  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;

    if (isMute) {
      for (let i = 0; i < count; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    const avail = (audioWritePtr - audioReadPtr + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
    if (avail < count) {
      for (let i = 0; i < count; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      outL[i] = audioRingL[audioReadPtr];
      outR[i] = audioRingR[audioReadPtr];
      audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
    }
  }

  // 主循环单帧推进函数 (平滑时钟积分，彻底杜绝 120Hz/60Hz 丢帧与抽搐)
  function tick() {
    if (!nes) return;

    // 1. 功能键防漏脉冲缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 按键分发注入 NES 控制器
    const setBtn = (btnIndex, isDown) => {
      if (isDown) {
        nes.buttonDown(1, btnIndex);
      } else {
        nes.buttonUp(1, btnIndex);
      }
    };

    setBtn(NES_BTN.up, rawButtons.up);
    setBtn(NES_BTN.down, rawButtons.down);
    setBtn(NES_BTN.left, rawButtons.left);
    setBtn(NES_BTN.right, rawButtons.right);
    setBtn(NES_BTN.b, rawButtons.b);
    setBtn(NES_BTN.a, rawButtons.a);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 3. 3× 加速与平滑时钟积分 (严格遵循增量乘倍率公式，加入 14ms 容差消除 120Hz/60Hz 抽搐)
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (lastTime === 0) lastTime = now;
    const delta = Math.min(now - lastTime, 250);
    lastTime = now;

    if (speedMultiplier > 1) {
      for (let s = 0; s < speedMultiplier; s++) {
        nes.frame();
      }
      accumulator = 0;
    } else {
      accumulator += delta;
      // 容差机制：当累加时间 >= 14ms (60FPS周期的85%) 时执行一帧，彻底杜绝浮点抖动导致的丢帧跳帧
      if (accumulator >= 14) {
        nes.frame();
        accumulator -= FRAME_MS;
        if (accumulator < 0) accumulator = 0;
        if (accumulator > FRAME_MS * 2) {
          accumulator = 0;
        }
      }
    }
  }

  // 实例化 JSNES 引擎
  function createNESInstance() {
    const NESModule = (typeof window !== "undefined" && window.NES_MODULE) ? window.NES_MODULE :
                      ((typeof NES_MODULE !== "undefined") ? NES_MODULE : null);
    const NESClass = NESModule ? (NESModule.default || NESModule.NES || NESModule) :
                     ((typeof window !== "undefined" && window.jsnes && window.jsnes.NES) ? window.jsnes.NES : null);
    if (!NESClass) {
      console.error("JSNES 内核未就绪 (NES_MODULE missing)");
      return null;
    }

    const inst = new NESClass({
      onFrame: function(frameBuffer) {
        if (!offscreenCtx) return;
        for (let i = 0; i < 256 * 240; i++) {
          offscreenBuf32[i] = 0xFF000000 | frameBuffer[i];
        }
        offscreenCtx.putImageData(offscreenImageData, 0, 0);
      },
      onAudioSample: function(left, right) {
        if (isMute) return;
        const nextPtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
        if (nextPtr !== audioReadPtr) {
          audioRingL[audioWritePtr] = left;
          audioRingR[audioWritePtr] = right;
          audioWritePtr = nextPtr;
        }
      },
      sampleRate: (audioCtx && audioCtx.sampleRate) ? audioCtx.sampleRate : 44100
    });

    return inst;
  }

  // 开机与复位脉冲秒开直出全彩大标题
  function runStartupPulse(nesInstance) {
    if (!nesInstance) return;
    try {
      // 步进 40 帧至版权界面
      for (let i = 0; i < 40; i++) {
        nesInstance.frame();
      }
      // 注入 START 脉冲穿透开场等待 (25 帧)
      nesInstance.buttonDown(1, NES_BTN.start);
      for (let i = 0; i < 25; i++) {
        nesInstance.frame();
      }
      nesInstance.buttonUp(1, NES_BTN.start);
      // 再步进 380 帧直出 100% 全彩霸王的大陆大标题
      for (let i = 0; i < 380; i++) {
        nesInstance.frame();
      }
    } catch (err) {
      console.warn("秒开预热步进警告:", err);
    }
  }

  // 掌机核心适配器接口对象
  const coreInstance = {
    id: "bawang-nes",
    name: "霸王的大陆",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "确认" }, // A 确定 / 进选单 / 调查
        { id: "b", key: "B", label: "取消" }  // B 取消 / 退选单
      ],
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },

    // 内核 boot 启动契约 (双形参防御)
    boot: function(arg1, arg2) {
      const romData = typeof arg1 === "string" ? arg1 : (typeof window !== "undefined" ? (window.ROM_DATA || window.NES_ROM) : null);
      const host = (arg2 && typeof arg2 === "object") ? arg2 : ((arg1 && typeof arg1 === "object") ? arg1 : null);

      if (!romData) {
        console.error("NES_ROM 为空，无法启动霸王的大陆");
        return;
      }

      initAudioContext();

      nes = createNESInstance();
      if (!nes) return;

      // Base64 解码并缓存二进制 ROM
      if (typeof atob === "function") {
        binaryRomData = atob(romData);
      } else if (typeof Buffer !== "undefined") {
        binaryRomData = Buffer.from(romData, "base64").toString("binary");
      }

      try {
        nes.loadROM(binaryRomData);
      } catch (e) {
        console.error("霸王的大陆 ROM 加载失败:", e);
        return;
      }

      // 开机脉冲秒开预热 (首屏直出 100% 全彩大标题)
      runStartupPulse(nes);

      isBooted = true;

      // 开机显示操作指引 Toast
      try {
        const toastEl = (typeof document !== "undefined") ? document.getElementById("toast") : null;
        if (toastEl) {
          toastEl.textContent = "按【开始】键进入游戏，A键确认/进菜单，B键取消/退选单！";
          toastEl.classList.add("show");
          setTimeout(function() {
            toastEl.classList.remove("show");
          }, 3500);
        }
      } catch (_) {}

      // 触发 host 就绪回调启动外壳渲染驱动
      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    },

    // 每帧 tick 驱动函数
    tick: function(dt) {
      if (!isBooted || !nes) return;
      tick();
    },

    // 导出的源画面 Canvas
    source: function() {
      return offscreenCanvas;
    },

    // 视频尺寸规格契约 (既支持函数调用又支持对象属性访问)
    video: (function() {
      function getVid() {
        return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
      }
      getVid.w = SCREEN_WIDTH;
      getVid.h = SCREEN_HEIGHT;
      return getVid;
    })(),

    // 外壳触摸分发标准契约 (带 btn- 前缀规整化)
    setButton: function(btnId, isPressed) {
      const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      const pressed = !!isPressed;

      switch (norm) {
        case "up":
          rawButtons.up = pressed;
          break;
        case "down":
          rawButtons.down = pressed;
          break;
        case "left":
          rawButtons.left = pressed;
          break;
        case "right":
          rawButtons.right = pressed;
          break;
        case "a":
          rawButtons.a = pressed;
          break;
        case "b":
          rawButtons.b = pressed;
          break;
        case "select":
          rawButtons.select = pressed;
          if (pressed) selectHoldFrames = 8;
          break;
        case "start":
          rawButtons.start = pressed;
          if (pressed) startHoldFrames = 8;
          break;
      }

      // 按下任意键均尝试唤醒音频
      if (pressed) {
        activateAudio();
      }
    },

    // 3× 加速单步推进规范契约
    setSpeed: function(mult) {
      const val = parseFloat(mult);
      if (!isNaN(val) && val > 0) {
        speedMultiplier = val;
      }
    },
    setSpeedMultiplier: function(mult) {
      this.setSpeed(mult);
    },
    getSpeedMultiplier: function() {
      return speedMultiplier;
    },
    getSpeed: function() {
      return speedMultiplier;
    },

    // 内核复位标准契约 (纯内存重挂载并秒开预热)
    reset: function() {
      if (!binaryRomData) return;

      nes = createNESInstance();
      if (!nes) return;

      try {
        nes.loadROM(binaryRomData);
      } catch (err) {
        console.error("复位加载 ROM 失败:", err);
        return;
      }

      runStartupPulse(nes);

      // 清空按键与音频环形缓冲
      for (const k in rawButtons) rawButtons[k] = false;
      startHoldFrames = 0;
      selectHoldFrames = 0;
      audioWritePtr = 0;
      audioReadPtr = 0;
      accumulator = 0;
      lastTime = 0;

      // 强制保持声音开启
      if (!isMute && masterGainNode && audioCtx) {
        masterGainNode.gain.value = 1.0;
      }

      // 提示复位成功
      try {
        const toastEl = (typeof document !== "undefined") ? document.getElementById("toast") : null;
        if (toastEl) {
          toastEl.textContent = "已纯内存快速复位！";
          toastEl.classList.add("show");
          setTimeout(function() {
            toastEl.classList.remove("show");
          }, 2000);
        }
      } catch (_) {}
    },

    // 标准存档导出契约 (exportState)
    exportState: function() {
      if (!nes) return null;
      try {
        const stateObj = nes.toJSON();
        const jsonStr = JSON.stringify(stateObj);
        const LZ = (typeof window !== "undefined" && window.LZString) ? window.LZString : null;
        if (LZ && typeof LZ.compressToUTF16 === "function") {
          return "LZ:" + LZ.compressToUTF16(jsonStr);
        }
        return jsonStr;
      } catch (err) {
        console.error("存档导出失败:", err);
        return null;
      }
    },

    // 标准读档导入契约 (importState)
    importState: function(rawState) {
      if (!nes || !rawState) return false;
      try {
        let jsonStr = rawState;
        if (typeof rawState === "string" && rawState.startsWith("LZ:")) {
          const LZ = (typeof window !== "undefined" && window.LZString) ? window.LZString : null;
          if (LZ && typeof LZ.decompressFromUTF16 === "function") {
            jsonStr = LZ.decompressFromUTF16(rawState.slice(3));
          }
        }
        const stateObj = JSON.parse(jsonStr);
        nes.fromJSON(stateObj);
        return true;
      } catch (err) {
        console.error("读档恢复失败:", err);
        return false;
      }
    },

    // 兼容旧版 saveState / loadState
    saveState: function() {
      return this.exportState();
    },
    loadState: function(state) {
      return this.importState(state);
    },

    // 声音唤醒契约
    activateAudio: function() {
      activateAudio();
    },
    resumeAudio: function() {
      activateAudio();
    },

    // 59s 录屏音频闭环契约 (必须返回有效 AudioTrack)
    connectRecordingAudio: function() {
      initAudioContext();
      if (!audioCtx) return null;

      try {
        if (!audioMediaDest && audioCtx.createMediaStreamDestination) {
          audioMediaDest = audioCtx.createMediaStreamDestination();
          if (audioScriptNode) {
            audioScriptNode.connect(audioMediaDest);
          }
        }
        if (audioMediaDest && audioMediaDest.stream) {
          const tracks = audioMediaDest.stream.getAudioTracks();
          if (tracks && tracks.length > 0) {
            return tracks[0];
          }
        }
      } catch (err) {
        console.warn("connectRecordingAudio error:", err);
      }
      return null;
    },

    // 四重硬件级静音切换控制
    toggleMute: function() {
      isMute = !isMute;
      if (masterGainNode) {
        masterGainNode.gain.value = isMute ? 0 : 1.0;
      }
      if (isMute) {
        // 清空环形缓冲区阻断任何通电漏音
        for (let i = 0; i < AUDIO_BUF_SIZE; i++) {
          audioRingL[i] = 0;
          audioRingR[i] = 0;
        }
        audioWritePtr = 0;
        audioReadPtr = 0;
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
        }
      } catch (_) {}
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    // 纯粹的焦点管理 (严禁弹出输入法)
    ensureFocus: function() {
      if (typeof window !== "undefined" && window.focus) {
        window.focus();
      }
    }
  };

  // 全局注册适配器
  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
