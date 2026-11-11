/**
 * core.js - 《蜘蛛侠：邪恶六人组的归来》(spiderman-nes) 掌机内核适配器
 *
 * 研发规范与契约实现:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 细长中文胶囊功能键 (「选择」与「开始」，8 帧触控防漏缓冲，严禁标“投币”)
 * 3. A 键跳跃 (Jump)、B 键拳脚飞踢 (Punch/Kick)
 * 4. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 5. 开机 175 帧轻量秒开预热穿透版权等待，首屏 0.2 秒直出 100% 全彩大标题
 * 6. Web Audio 环形缓冲区 (32768) + 四重硬件级静音锁 + 全手势通电破冰
 * 7. 59s / 32MB 录屏音频闭环 (connectRecordingAudio 必须返回有效 MediaStreamTrack)
 * 8. 即时存档/读档标准双接口契约 (exportState / importState / saveState / loadState)
 * 9. core.reset() 纯内存重置并预热秒开标题
 * 10. 设置与声音彻底解耦，严禁私自监听底栏 DOM
 */

(function() {
  "use strict";

  // NES 标准手柄键位码 (Joypad Controller 1)
  const NES_BTN = {
    a: 0,      // A 跳跃 (Jump)
    b: 1,      // B 拳脚击打 / 飞踢 (Punch/Kick)
    select: 2, // 选择键 (单人/双人选择或蛛丝切换)
    start: 3,  // 开始键 (暂停 / 确认)
    up: 4,     // 上 (攀爬建筑墙壁/电缆)
    down: 5,   // 下 (下蹲防御 / 扫堂腿)
    left: 6,   // 左 (移动)
    right: 7   // 右 (移动)
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
    }
  } catch (_) {}

  // 初始化 Web Audio 音频链路
  function initAudioContext() {
    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      audioScriptNode = null;
      masterGainNode = null;
    }
    if (audioCtx) return;

    const AudioContextClass = (typeof window !== "undefined")
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return;

    try {
      audioCtx = new AudioContextClass({ latencyHint: "interactive" });
    } catch (_) {
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn("AudioContext 初始化失败:", e);
        return;
      }
    }

    if (!audioCtx) return;

    // 创建主音量控制节点 (硬件级静音锁之一)
    try {
      if (typeof audioCtx.createGain === "function") {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = isMute ? 0 : 1;
        masterGainNode.connect(audioCtx.destination);
      }
    } catch (_) {}

    const bufferSize = 2048;
    try {
      if (typeof audioCtx.createScriptProcessor === "function") {
        audioScriptNode = audioCtx.createScriptProcessor(bufferSize, 0, 2);
      } else if (typeof audioCtx.createJavaScriptNode === "function") {
        audioScriptNode = audioCtx.createJavaScriptNode(bufferSize, 0, 2);
      }
    } catch (e) {
      console.warn("createScriptProcessor 异常:", e);
    }

    if (audioScriptNode) {
      audioScriptNode.onaudioprocess = onAudioProcess;
      if (masterGainNode) {
        audioScriptNode.connect(masterGainNode);
      } else {
        audioScriptNode.connect(audioCtx.destination);
      }
    }
  }

  // 移动端全手势破冰唤醒
  function activateAudio() {
    if (isMute) return; // 静音守卫：静音状态严禁意外通电出声

    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
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

    // 播放 1 个采样的静音 BufferSource，强制通电激活 iOS/Android 底层 DAC
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

  // 挂载手机端全手势捕获
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // Web Audio 采样流处理器
  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;

    // 四重静音锁：静音时严格全零输出
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

    return new NESClass({
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
  }

  // 掌机核心适配器接口对象
  const coreInstance = {
    id: "spiderman-nes",
    name: "蜘蛛侠：邪恶六人组",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "A" }, // A 跳跃 (Jump)
        { id: "b", key: "B", label: "B" }  // B 直拳飞踢 (Punch/Kick)
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
        console.error("ROM_DATA 为空，无法启动蜘蛛侠");
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
        console.error("蜘蛛侠 ROM 加载失败:", e);
        return;
      }

      // 开机 175 帧秒开预热穿透 (直接跃过数秒版权屏，首屏直出 100% 全彩大标题)
      try {
        for (let i = 0; i < 175; i++) {
          nes.frame();
        }
      } catch (err) {
        console.warn("秒开预热步进警告:", err);
      }

      isBooted = true;

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

    // 外壳触摸分发标准契约 (带前缀规整化与防漏缓冲)
    setButton: function(btn, isDown) {
      if (!btn) return;
      const b = String(btn).toLowerCase().replace(/^btn-/, "");
      if (rawButtons.hasOwnProperty(b)) {
        rawButtons[b] = !!isDown;
        if (isDown) {
          if (b === "start") startHoldFrames = 8;
          if (b === "select") selectHoldFrames = 8;
          activateAudio();
        }
      }
    },

    // 运行速度控制双接口契约
    setSpeed: function(mul) {
      speedMultiplier = Math.max(1, Math.min(3, mul || 1));
      accumulator = 0;
      lastTime = 0;
    },

    setSpeedMultiplier: function(mul) {
      this.setSpeed(mul);
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    toggleSpeed: function() {
      const newSpd = (speedMultiplier === 1) ? 3 : 1;
      this.setSpeed(newSpd);
      return newSpd;
    },

    // 四重硬件级静音控制
    setMute: function(mute) {
      isMute = !!mute;
      if (masterGainNode) {
        masterGainNode.gain.value = isMute ? 0 : 1;
      }
      if (isMute) {
        audioReadPtr = audioWritePtr;
      } else {
        activateAudio();
      }
      return isMute;
    },

    setMuted: function(mute) {
      return this.setMute(mute);
    },

    isMuted: function() {
      return isMute;
    },

    toggleMute: function() {
      return this.setMute(!isMute);
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    // 录屏音频接入标准契约 (必须返回有效 MediaStreamTrack 音轨)
    connectRecordingAudio: function() {
      activateAudio();
      if (!audioCtx) initAudioContext();
      if (!audioCtx) return null;

      try {
        if (!audioMediaDest && typeof audioCtx.createMediaStreamDestination === "function") {
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
      } catch (e) {
        console.warn("connectRecordingAudio error:", e);
      }
      return null;
    },

    audioDiag: function() {
      return {
        audioCtxState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        primes: audioPrimes,
        writePtr: audioWritePtr,
        readPtr: audioReadPtr,
        isMute: isMute
      };
    },

    // 内核复位标准契约 (纯内存重挂载并秒开预热)
    reset: function() {
      if (!binaryRomData) return;

      nes = createNESInstance();
      if (!nes) return;

      try {
        nes.loadROM(binaryRomData);
      } catch (e) {
        console.error("复位 loadROM 失败:", e);
        return;
      }

      // 清空按键与环形缓冲区
      Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
      startHoldFrames = 0;
      selectHoldFrames = 0;
      audioReadPtr = audioWritePtr;
      accumulator = 0;
      lastTime = 0;
      speedMultiplier = 1;

      // 预热 175 帧秒开直出标题
      try {
        for (let i = 0; i < 175; i++) {
          nes.frame();
        }
      } catch (e) {
        console.warn("复位预热警告:", e);
      }
    },

    // 存档与读档契约 (带 LZString 离线压缩防配额超限)
    saveState: function() {
      if (!nes) return null;
      try {
        const jsonStr = JSON.stringify(nes.toJSON());
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.compressToUTF16 === "function") {
          return "LZ:" + window.LZString.compressToUTF16(jsonStr);
        }
        return jsonStr;
      } catch (e) {
        console.error("saveState error:", e);
        return null;
      }
    },

    loadState: function(stateData) {
      if (!nes || !stateData) return false;
      try {
        let jsonStr = stateData;
        if (typeof stateData === "string" && stateData.indexOf("LZ:") === 0) {
          if (typeof window !== "undefined" && window.LZString && typeof window.LZString.decompressFromUTF16 === "function") {
            jsonStr = window.LZString.decompressFromUTF16(stateData.slice(3));
          }
        }
        const obj = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
        nes.fromJSON(obj);
        audioReadPtr = audioWritePtr;
        return true;
      } catch (e) {
        console.error("loadState error:", e);
        return false;
      }
    },

    exportState: function() {
      return this.saveState();
    },

    importState: function(raw) {
      return this.loadState(raw);
    }
  };

  // 全局挂载与模块导出
  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
