/**
 * core.js - 《魔界村》(Makaimura / makaimura-nes) 掌机内核适配器
 *
 * 遵循标准避坑全书规范:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 经典按键人机工效:
 *    - 正圆 A 键: 跳跃 (Jump)
 *    - 正圆 B 键: 攻击 / 投掷武器 (Attack / Throw Weapon)
 * 3. 细长中文胶囊键 (「选择」与「开始」，8帧按压缓冲，大热区)
 * 4. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧【复位】(reset标准契约+纯内存重置预热)、右侧【声音】(四重硬件静音锁)
 * 5. 设置与声音彻底解耦，内核严禁私绑任何底栏 DOM 事件
 * 6. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 7. 开机 60 帧秒开预热穿透 (保证首屏 0.1s 直出全彩汉字大标题「魔界村」)
 * 8. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 9. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 10. 保持原汁原味机台纯净逻辑，零虚假特权
 */

(function() {
  "use strict";

  // NES 标准按键索引
  const NES_BTN = {
    a: 0,      // A 键: 跳跃
    b: 1,      // B 键: 攻击投掷武器
    select: 2, // 选择键: 模式切换
    start: 3,  // 开始键: 暂停 / 确认
    up: 4,     // 上: 爬梯子
    down: 5,   // 下: 下蹲 / 爬梯子下
    left: 6,   // 左: 向左跑
    right: 7   // 右: 向右跑
  };

  // 原始按键状态
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

  // 胶囊键缓冲守卫 (8帧脉冲防漏按)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 画面渲染尺寸
  const SCREEN_WIDTH = 256;
  const SCREEN_HEIGHT = 240;

  // 离屏渲染缓冲
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

  // 模拟器实例与状态
  let nes = null;
  let binaryRomData = "";
  let isBooted = false;

  // 运行速度倍率与时间累加
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

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

  // 读取持久化静音状态
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

      if (audioCtx) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = isMute ? 0 : 1;
        masterGainNode.connect(audioCtx.destination);

        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(masterGainNode);
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

  // 主循环推进
  function tick() {
    if (!nes) return;

    // 1. 胶囊键防漏按缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 注入按键至 NES 控制器
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

    // 3. 3× 加速时间积分推进
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

  // 创建 JSNES 实例
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
        for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
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
      sampleRate: 44100
    });

    return inst;
  }

  // 核心外壳接口导出
  const GGEMU_CORE = {
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", label: "跳跃", key: "x", color: "red" },
        { id: "b", label: "攻击", key: "z", color: "yellow" }
      ],
      capsules: [
        { id: "select", label: "选择", key: "Shift" },
        { id: "start", label: "开始", key: "Enter" }
      ]
    },

    boot: function(romBase64, host) {
      if (isBooted) return;
      isBooted = true;

      const rawB64 = romBase64 || (typeof window !== "undefined" && (window.ROM_DATA || window.GGEMU_ROM_B64)) || "";
      if (!rawB64) {
        console.error("boot 失败: 未提供 ROM 数据");
        return;
      }

      try {
        if (typeof atob === "function") {
          binaryRomData = atob(rawB64);
        } else if (typeof Buffer !== "undefined") {
          binaryRomData = Buffer.from(rawB64, "base64").toString("binary");
        }
      } catch (e) {
        console.error("ROM Base64 解码失败:", e);
        return;
      }

      nes = createNESInstance();
      if (!nes) return;

      try {
        nes.loadROM(binaryRomData);
      } catch (e) {
        console.error("JSNES loadROM 失败:", e);
        return;
      }

      // 开机 60 帧秒开预热穿透，直出大字红底汉字「魔界村」
      try {
        for (let i = 0; i < 60; i++) {
          nes.frame();
        }
      } catch (_) {}

      // 触发外壳就绪回调
      if (host && typeof host.onReady === "function") {
        host.onReady();
      }

      // 激活声音并输出首屏画面
      activateAudio();
    },

    reset: function() {
      if (!binaryRomData) return;
      nes = createNESInstance();
      if (!nes) return;

      try {
        nes.loadROM(binaryRomData);
      } catch (e) {
        console.error("重置加载 ROM 失败:", e);
        return;
      }

      Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
      startHoldFrames = 0;
      selectHoldFrames = 0;
      accumulator = 0;
      lastTime = 0;

      audioWritePtr = 0;
      audioReadPtr = 0;
      audioRingL.fill(0);
      audioRingR.fill(0);

      try {
        for (let i = 0; i < 60; i++) {
          nes.frame();
        }
      } catch (_) {}

      activateAudio();
    },

    tick: tick,

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    },

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

    isMuted: function() {
      return isMute;
    },

    setMute: function(val) {
      isMute = !!val;
      if (isMute) {
        audioWritePtr = 0;
        audioReadPtr = 0;
        audioRingL.fill(0);
        audioRingR.fill(0);
        if (masterGainNode) masterGainNode.gain.value = 0;
      } else {
        if (masterGainNode) masterGainNode.gain.value = 1;
      }
      return isMute;
    },

    setMuted: function(val) {
      return this.setMute(val);
    },

    toggleMute: function() {
      return this.setMute(!isMute);
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

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

    exportState: function() {
      if (!nes) return null;
      try {
        const jsonStr = JSON.stringify(nes.toJSON());
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.compressToBase64 === "function") {
          return "lz:" + window.LZString.compressToBase64(jsonStr);
        }
        return jsonStr;
      } catch (e) {
        console.error("exportState error:", e);
        return null;
      }
    },

    importState: function(raw) {
      if (!nes || !raw) return false;
      try {
        let jsonStr = raw;
        if (raw.startsWith("lz:") && typeof window !== "undefined" && window.LZString) {
          jsonStr = window.LZString.decompressFromBase64(raw.slice(3));
        }
        const obj = JSON.parse(jsonStr);
        nes.fromJSON(obj);
        return true;
      } catch (e) {
        console.error("importState error:", e);
        return false;
      }
    },

    saveState: function() {
      return this.exportState();
    },

    loadState: function(raw) {
      return this.importState(raw);
    }
  };

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = GGEMU_CORE;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = GGEMU_CORE;
  }
})();
