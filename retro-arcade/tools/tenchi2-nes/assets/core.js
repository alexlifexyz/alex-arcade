/**
 * core.js - 《吞食天地2：诸葛孔明传 中文版》(tenchi2-nes) 掌机内核适配器
 *
 * 研发规范与契约实现:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 细长中文胶囊功能键 (「选择」与「开始」，8 帧触控防漏缓冲，严禁标“投币”)
 * 3. A 键调查/对话/确认，B 键取消/打开菜单
 * 4. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 5. 开机脉冲秒开预热穿透版权等待，首屏 0.1 秒直出 100% 全彩大标题
 * 6. Web Audio 环形缓冲区 (32768) + 四重硬件级静音锁 + 全手势通电破冰
 * 7. 59s / 32MB 录屏音频闭环 (connectRecordingAudio 必须返回有效 MediaStreamTrack)
 * 8. 即时存档/读档标准双接口契约 (exportState / importState / saveState / loadState)
 * 9. core.reset() 纯内存重置并预热秒开标题
 * 10. 设置与声音彻底解耦，严禁私自监听底栏 DOM
 * 11. 支持 MMC3 / Mapper 198 特性 ($5000-$5FFF 扩展 WRAM 读写支持)
 */

(function() {
  "use strict";

  // NES 标准手柄键位码 (Joypad Controller 1)
  const NES_BTN = {
    a: 0,      // A 调查 / 对话 / 确认
    b: 1,      // B 取消 / 菜单
    select: 2, // 选择键 (阵型/成员切换)
    start: 3,  // 开始键 (确认 / 暂停)
    up: 4,     // 上 (向上移动 / 选单)
    down: 5,   // 下 (向下移动 / 选单)
    left: 6,   // 左 (向左移动)
    right: 7   // 右 (向右移动)
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

  // 主循环单帧推进函数
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

    // 3. 3× 加速时间积分步进公式 (增量必须乘以速度倍率)
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (lastTime === 0) lastTime = now;
    const dt = Math.min(now - lastTime, 250) * speedMultiplier;
    lastTime = now;
    accumulator += dt;

    const maxSteps = 4 * speedMultiplier;
    let steps = 0;
    while (accumulator >= FRAME_MS && steps < maxSteps) {
      nes.frame();
      accumulator -= FRAME_MS;
      steps++;
    }
  }

  // 实例化 JSNES 引擎并挂载 Mapper 198 / $5000-$5FFF WRAM 支持
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

  // 挂载 $5000-$5FFF WRAM 读取支持
  function setupMapperHook(nesInstance) {
    if (!nesInstance || !nesInstance.mmap) return;
    const origLoad = nesInstance.mmap.load.bind(nesInstance.mmap);
    nesInstance.mmap.load = function(t) {
      t &= 65535;
      if (t >= 0x5000 && t < 0x6000) {
        return this.nes.cpu.mem[t];
      }
      return origLoad(t);
    };
  }

  // 开机与复位脉冲秒开直出标题画面
  function runStartupPulse(nesInstance) {
    if (!nesInstance) return;
    try {
      // 1. 步进 40 帧进入 CAPCOM 等待界面
      for (let i = 0; i < 40; i++) {
        nesInstance.frame();
      }
      // 2. 注入 8 帧 START 键脉冲穿透版权等待
      nesInstance.buttonDown(1, NES_BTN.start);
      for (let i = 0; i < 8; i++) {
        nesInstance.frame();
      }
      nesInstance.buttonUp(1, NES_BTN.start);
      // 3. 步进 60 帧直出 100% 全彩大标题
      for (let i = 0; i < 60; i++) {
        nesInstance.frame();
      }
    } catch (err) {
      console.warn("秒开预热步进警告:", err);
    }
  }

  // 掌机核心适配器接口对象
  const coreInstance = {
    id: "tenchi2-nes",
    name: "吞食天地2",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "调查" }, // A 调查 / 对话 / 确认
        { id: "b", key: "B", label: "菜单" }  // B 取消 / 呼出系统菜单
      ],
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },

    // 内核 boot 启动契约 (双形参防御)
    boot: function(arg1, arg2) {
      const romData = typeof arg1 === "string" ? arg1 : (typeof window !== "undefined" ? window.ROM_DATA : null);
      const host = (arg2 && typeof arg2 === "object") ? arg2 : ((arg1 && typeof arg1 === "object") ? arg1 : null);

      if (!romData) {
        console.error("ROM_DATA 为空，无法启动吞食天地2");
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
        console.error("吞食天地2 ROM 加载失败:", e);
        return;
      }

      // 挂载 $5000-$5FFF WRAM 支持
      setupMapperHook(nes);

      // 开机脉冲秒开预热 (首屏直出 100% 全彩诸葛孔明传大标题)
      runStartupPulse(nes);

      isBooted = true;

      // 开机显示操作指引 Toast
      try {
        const toastEl = (typeof document !== "undefined") ? document.getElementById("toast") : null;
        if (toastEl) {
          toastEl.textContent = "按【开始】键进入游戏，A键调查/确认，B键菜单/取消！";
          toastEl.classList.add("show");
          setTimeout(function() {
            toastEl.classList.remove("show");
          }, 3500);
        }
      } catch (_) {}

      // 必须确保触发 host.onReady 回调
      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    },

    tick: tick,

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    },

    // 触摸按键分发与前缀规整化 (严禁动作键私绑 START 脉冲)
    setButton: function(btnId, isPressed) {
      if (!btnId) return;
      const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");

      if (norm === "up") {
        rawButtons.up = !!isPressed;
        if (isPressed) rawButtons.down = false;
      } else if (norm === "down") {
        rawButtons.down = !!isPressed;
        if (isPressed) rawButtons.up = false;
      } else if (norm === "left") {
        rawButtons.left = !!isPressed;
        if (isPressed) rawButtons.right = false;
      } else if (norm === "right") {
        rawButtons.right = !!isPressed;
        if (isPressed) rawButtons.left = false;
      } else if (norm === "a") {
        rawButtons.a = !!isPressed;
      } else if (norm === "b") {
        rawButtons.b = !!isPressed;
      } else if (norm === "start") {
        rawButtons.start = !!isPressed;
        if (isPressed) startHoldFrames = 8;
      } else if (norm === "select") {
        rawButtons.select = !!isPressed;
        if (isPressed) selectHoldFrames = 8;
      }
    },

    setStick: function(dx, dy) {
      const THRESHOLD = 0.35;
      rawButtons.left = dx < -THRESHOLD;
      rawButtons.right = dx > THRESHOLD;
      rawButtons.up = dy < -THRESHOLD;
      rawButtons.down = dy > THRESHOLD;
    },

    // 纯内存一键复位
    reset: function() {
      if (!binaryRomData) {
        console.warn("无 ROM 缓存，无法重置");
        return;
      }

      nes = createNESInstance();
      if (!nes) return;

      try {
        nes.loadROM(binaryRomData);
      } catch (e) {
        console.error("重置加载 ROM 失败:", e);
        return;
      }

      setupMapperHook(nes);

      Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
      startHoldFrames = 0;
      selectHoldFrames = 0;
      accumulator = 0;
      lastTime = 0;
      speedMultiplier = 1;

      audioWritePtr = 0;
      audioReadPtr = 0;
      audioRingL.fill(0);
      audioRingR.fill(0);

      // 纯内存重置后同步脉冲秒开标题
      runStartupPulse(nes);

      try {
        const toastEl = (typeof document !== "undefined") ? document.getElementById("toast") : null;
        if (toastEl) {
          toastEl.textContent = "游戏已重置！按【开始】键进入游戏";
          toastEl.classList.add("show");
          setTimeout(function() {
            toastEl.classList.remove("show");
          }, 3000);
        }
      } catch (_) {}
    },

    setSpeed: function(mul) {
      speedMultiplier = Number(mul) || 1;
      return speedMultiplier;
    },

    setSpeedMultiplier: function(mul) {
      speedMultiplier = Number(mul) || 1;
      return speedMultiplier;
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    toggleSpeed: function() {
      speedMultiplier = (speedMultiplier === 1) ? 3 : 1;
      return speedMultiplier;
    },

    setMute: function(mute) {
      isMute = !!mute;
      if (masterGainNode) {
        masterGainNode.gain.value = isMute ? 0 : 1.0;
      }
      if (isMute) {
        audioRingL.fill(0);
        audioRingR.fill(0);
        audioReadPtr = audioWritePtr;
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
        }
      } catch (_) {}
      return isMute;
    },

    setMuted: function(mute) {
      return this.setMute(mute);
    },

    isMuted: function() {
      return isMute;
    },

    activateAudio: function() {
      activateAudio();
    },

    resumeAudio: function() {
      activateAudio();
    },

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (destNode && audioScriptNode) {
        audioScriptNode.connect(destNode);
        return;
      }
      if (!audioCtx) initAudioContext();
      if (!audioCtx) return null;

      if (!audioMediaDest && audioCtx.createMediaStreamDestination) {
        audioMediaDest = audioCtx.createMediaStreamDestination();
        if (audioScriptNode) {
          audioScriptNode.connect(audioMediaDest);
        }
      }
      if (audioMediaDest && audioMediaDest.stream) {
        const tracks = audioMediaDest.stream.getAudioTracks();
        if (tracks && tracks.length > 0) return tracks[0];
      }
      return null;
    },

    exportState: function() {
      if (!nes) return null;
      try {
        const rawJson = JSON.stringify(nes.toJSON());
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.compressToBase64 === "function") {
          return window.LZString.compressToBase64(rawJson);
        }
        return rawJson;
      } catch (e) {
        console.error("exportState failed:", e);
        return null;
      }
    },

    importState: function(raw) {
      if (!nes || !raw) return false;
      try {
        let jsonStr = raw;
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.decompressFromBase64 === "function") {
          const decomp = window.LZString.decompressFromBase64(raw);
          if (decomp) jsonStr = decomp;
        }
        const stateObj = JSON.parse(jsonStr);
        nes.fromJSON(stateObj);
        setupMapperHook(nes);
        return true;
      } catch (e) {
        console.error("importState failed:", e);
        return false;
      }
    },

    saveState: function() {
      return this.exportState();
    },

    loadState: function(raw) {
      return this.importState(raw);
    },

    audioDiag: function() {
      return {
        hasCtx: !!audioCtx,
        state: audioCtx ? audioCtx.state : "none",
        isMute: isMute,
        primes: audioPrimes,
        callbacks: audioCallbacks,
        writePtr: audioWritePtr,
        readPtr: audioReadPtr
      };
    }
  };

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
