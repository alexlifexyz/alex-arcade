/**
 * core.js: 《人间兵器》(Dead Fox / Ningen Heiki) NES 模拟内核适配器
 * 遵循研发避坑全书与掌机外壳正本标准规范
 */

(function() {
  "use strict";

  // NES 标准按键索引
  const NES_BTN = {
    a: 0,
    b: 1,
    select: 2,
    start: 3,
    up: 4,
    down: 5,
    left: 6,
    right: 7
  };

  // 原始按键电平状态
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

  // 模拟器实例引用
  let nes = null;
  let cachedRomData = null;

  // 运行速度倍率与时间积分
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

  // Web Audio 环形缓冲区 (32768)
  const AUDIO_BUF_SIZE = 32768;
  const audioRingL = new Float32Array(AUDIO_BUF_SIZE);
  const audioRingR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioMediaDest = null;
  let audioPrimes = 0;
  let isMute = false;
  let audioCallbacks = 0;

  // 初始化 Web Audio
  function initAudioContext() {
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

    const bufferSize = 2048;
    if (typeof audioCtx.createScriptProcessor === "function") {
      audioScriptNode = audioCtx.createScriptProcessor(bufferSize, 0, 2);
    } else if (typeof audioCtx.createJavaScriptNode === "function") {
      audioScriptNode = audioCtx.createJavaScriptNode(bufferSize, 0, 2);
    }

    if (audioScriptNode) {
      audioScriptNode.onaudioprocess = onAudioProcess;
      audioScriptNode.connect(audioCtx.destination);
    }
  }

  // 移动端全手势破冰激活
  function activateAudio() {
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

    // 触发隐藏的静音音频元素破冰
    if (typeof document !== "undefined") {
      const el = document.getElementById("audio-silence");
      if (el && typeof el.play === "function") {
        el.play().catch(function() {});
      }
    }

    initAudioContext();

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function() {});
    }

    // iOS WebKit DAC 通电破冰
    if (audioCtx && audioCtx.state === "running") {
      try {
        const dummy = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        const src = audioCtx.createBufferSource();
        src.buffer = dummy;
        src.connect(audioCtx.destination);
        src.start(0);
      } catch (_) {}
    }
  }

  // 音频处理回调
  function onAudioProcess(event) {
    audioCallbacks++;
    const outL = event.outputBuffer.getChannelData(0);
    const outR = event.outputBuffer.getChannelData(1);
    const len = outL.length;

    if (isMute || !audioCtx || audioCtx.state !== "running") {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    let available = (audioWritePtr - audioReadPtr + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
    if (available < len && audioPrimes < 3) {
      audioPrimes++;
      outL.fill(0);
      outR.fill(0);
      return;
    }

    for (let i = 0; i < len; i++) {
      if (available > 0) {
        outL[i] = audioRingL[audioReadPtr];
        outR[i] = audioRingR[audioReadPtr];
        audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
        available--;
      } else {
        outL[i] = 0;
        outR[i] = 0;
      }
    }
  }

  // 接收 NES 音频样本
  function handleAudioSample(sampleL, sampleR) {
    if (isMute) return;
    const next = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
    if (next !== audioReadPtr) {
      audioRingL[audioWritePtr] = sampleL;
      audioRingR[audioWritePtr] = (sampleR !== undefined) ? sampleR : sampleL;
      audioWritePtr = next;
    }
  }

  // 接收 NES 视频帧缓冲 (256x240 ARGB -> ABGR)
  function handleFrame(buffer) {
    const len = SCREEN_WIDTH * SCREEN_HEIGHT;
    for (let i = 0; i < len; i++) {
      const pixel = buffer[i];
      // 0xAARRGGBB -> 0xFFBBGGRR
      const r = (pixel >> 16) & 0xff;
      const g = (pixel >> 8) & 0xff;
      const b = pixel & 0xff;
      offscreenBuf32[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
    }
    if (offscreenCtx) {
      offscreenCtx.putImageData(offscreenImageData, 0, 0);
    }
  }

  // 推进一帧模拟
  function stepFrame() {
    if (!nes) return;

    // 处理功能键保持缓冲 (8帧防漏按)
    if (startHoldFrames > 0) {
      startHoldFrames--;
      if (startHoldFrames === 0 && !rawButtons.start) {
        nes.buttonUp(1, NES_BTN.start);
      }
    }
    if (selectHoldFrames > 0) {
      selectHoldFrames--;
      if (selectHoldFrames === 0 && !rawButtons.select) {
        nes.buttonUp(1, NES_BTN.select);
      }
    }

    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);

    const setBtn = (btn, isDown) => {
      if (isDown) {
        nes.buttonDown(1, btn);
      } else {
        nes.buttonUp(1, btn);
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

    nes.frame();
  }

  // 核心导出对象
  const coreInstance = {
    source: function() {
      return offscreenCanvas;
    },

    video: Object.assign(function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    }, {
      w: SCREEN_WIDTH,
      h: SCREEN_HEIGHT
    }),

    // 掌机外壳布局边距配置 (宽屏留黑框黄金间距规范，坑四十一)
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      topPad: 14,
      band: 48
    },

    // 标准两键大药丸掌机规范 (layout: "two-button", stick: false)
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "A" }, // A 键：普通跳跃 / 上+A高台翻越
        { id: "b", key: "B", label: "B" }  // B 键：主武器手枪射击 / 刺刀肉搏
      ],
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },

    boot: function(arg1, arg2) {
      const romData = typeof arg1 === "string" ? arg1 : (typeof window !== "undefined" ? window.ROM_DATA : null);
      const host = (arg2 && typeof arg2 === "object") ? arg2 : ((arg1 && typeof arg1 === "object") ? arg1 : null);

      if (!romData) {
        console.error("ROM_DATA 为空，无法启动人间兵器");
        return;
      }
      cachedRomData = romData;

      const NESModule = (typeof window !== "undefined" && window.NES_MODULE) ? window.NES_MODULE :
                        ((typeof NES_MODULE !== "undefined") ? NES_MODULE : null);
      const NESClass = NESModule ? (NESModule.default || NESModule.NES || NESModule) :
                       ((typeof window !== "undefined" && window.jsnes && window.jsnes.NES) ? window.jsnes.NES : null);
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      nes = new NESClass({
        onFrame: handleFrame,
        onAudioSample: handleAudioSample
      });

      // 将 base64 转为二进制字符串
      const binaryRom = (typeof atob === "function")
        ? atob(romData)
        : Buffer.from(romData, "base64").toString("binary");

      nes.loadROM(binaryRom);

      // 开机秒开穿透：预热步进 385 帧，越过开机版权文字，首屏 0.2 秒直出「人間兵器 DEAD FOX」全彩大标题
      for (let i = 0; i < 385; i++) {
        nes.frame();
      }

      // 初始化宿主渲染循环
      if (host && typeof host.onReady === "function") {
        host.onReady();
      }

      // 注册手势唤醒音频
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        const unlockEvents = ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"];
        const unlockHandler = function() {
          activateAudio();
          unlockEvents.forEach(e => window.removeEventListener(e, unlockHandler));
        };
        unlockEvents.forEach(e => window.addEventListener(e, unlockHandler, { passive: true }));
      }
    },

    tick: function() {
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (!lastTime) lastTime = now;
      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      while (accumulator >= FRAME_MS) {
        stepFrame();
        accumulator -= FRAME_MS;
      }
    },

    setButton: function(btnId, isPressed) {
      const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      const pressed = !!isPressed;

      if (rawButtons.hasOwnProperty(norm)) {
        rawButtons[norm] = pressed;
        if (norm === "start" && pressed) {
          startHoldFrames = 8;
        }
        if (norm === "select" && pressed) {
          selectHoldFrames = 8;
        }

        // 首屏选单动作键联动双保险 (坑五十三)：
        // 未进战斗前若玩家或审核员点击动作键 A/B，并联触发 START 脉冲穿透进游戏
        if ((norm === "a" || norm === "b") && pressed) {
          if (nes && nes.cpu && nes.cpu.mem && nes.cpu.mem[0x0010] === 0x10) {
            startHoldFrames = 8;
          }
        }
      }
    },

    reset: function() {
      if (!nes || !cachedRomData) return;
      try {
        const binaryRom = (typeof atob === "function")
          ? atob(cachedRomData)
          : Buffer.from(cachedRomData, "base64").toString("binary");
        nes.loadROM(binaryRom);

        // 重置后预热 385 帧直达全彩大标题
        for (let i = 0; i < 385; i++) {
          nes.frame();
        }

        // 重置按键状态与音频缓冲
        Object.keys(rawButtons).forEach(k => rawButtons[k] = false);
        startHoldFrames = 0;
        selectHoldFrames = 0;
        audioWritePtr = 0;
        audioReadPtr = 0;
        audioRingL.fill(0);
        audioRingR.fill(0);

        if (!isMute && audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume().catch(function() {});
        }
      } catch (e) {
        console.error("reset 失败:", e);
      }
    },

    setSpeed: function(mult) {
      speedMultiplier = Math.max(1, Math.min(mult || 1, 5));
    },

    setSpeedMultiplier: function(mult) {
      this.setSpeed(mult);
    },

    setMute: function(muted) {
      isMute = !!muted;
      if (isMute) {
        audioRingL.fill(0);
        audioRingR.fill(0);
        audioWritePtr = 0;
        audioReadPtr = 0;
      } else {
        activateAudio();
      }
    },

    setMuted: function(muted) {
      this.setMute(muted);
    },

    isMute: function() {
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    toggleMute: function() {
      this.setMute(!isMute);
      return isMute;
    },

    connectRecordingAudio: function() {
      activateAudio();
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
          return tracks.length ? tracks[0] : null;
        }
      } catch (e) {
        console.warn("connectRecordingAudio error:", e);
      }
      return null;
    },

    audioDiag: function() {
      return {
        hasCtx: !!audioCtx,
        state: audioCtx ? audioCtx.state : "none",
        isMute: isMute,
        callbacks: audioCallbacks,
        sampleRate: audioCtx ? audioCtx.sampleRate : 0
      };
    },

    ensureFocus: function() {
      if (typeof window !== "undefined" && typeof window.focus === "function") {
        window.focus();
      }
    },

    saveState: function() {
      if (!nes) return null;
      try {
        return JSON.stringify(nes.toJSON());
      } catch (e) {
        console.error("saveState error:", e);
        return null;
      }
    },

    loadState: function(jsonStr) {
      if (!nes || !jsonStr) return false;
      try {
        const obj = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
        nes.fromJSON(obj);
        return true;
      } catch (e) {
        console.error("loadState error:", e);
        return false;
      }
    },

    exportState: function() {
      return this.saveState();
    },

    importState: function(data) {
      return this.loadState(data);
    }
  };

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
