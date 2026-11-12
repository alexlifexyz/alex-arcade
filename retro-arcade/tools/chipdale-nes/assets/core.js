!function () {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;

  // NES 标准手柄按键索引
  const NES_BTN = {
    a: 0,       // 跳跃
    b: 1,       // 搬运木箱 / 投掷 / 藏入木箱防守
    select: 2,  // 选择
    start: 3,   // 开始 / 暂停
    up: 4,      // 向上举箱 / 向上投掷
    down: 5,    // 趴下蹲伏 / 藏进箱子躲避敌人攻击
    left: 6,    // 向左跑
    right: 7    // 向右跑
  };

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let turboTimer = 0;
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

  // 按键防漏保底计数器 (确保真机轻点也能维持 8 帧被 NES CPU 完整采样)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 静音状态 (由设置面板独立控制)
  let isMuted = false;

  // 离线渲染画板
  const offscreen = document.createElement("canvas");
  offscreen.width = NES_W;
  offscreen.height = NES_H;
  const offscreenCtx = offscreen.getContext("2d");
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  // 音频系统 (44100Hz 双声道环形缓冲区，对齐成熟稳定驱动)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioPrimes = 0;
  let audioCallbacks = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);

    if (isMuted) {
      for (let i = 0; i < outL.length; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    const ratio = 44100 / (audioCtx ? audioCtx.sampleRate : 44100);

    for (let i = 0; i < outL.length; i++) {
      if (audioAvailable() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const r = Math.floor(audioReadPtr);
      const frac = audioReadPtr - r;
      const nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      outL[i] = sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac;
      outR[i] = sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac;
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
      }
    }
  }

  function ensureAudioNodes() {
    if (!audioCtx) return;
    if (!audioScriptNode && typeof audioCtx.createScriptProcessor === "function") {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
  }

  function initAudioContext() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      audioScriptNode = null;
    }
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        audioCtx = new AC();
      } catch (e) {
        return;
      }
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(() => {
        ensureAudioNodes();
      }).catch(() => {});
    }

    // 播放 1 个采样的静音 BufferSource，强制彻底唤醒 iOS 底层物理音频硬件
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    ensureAudioNodes();
  }

  function activateAudio() {
    try {
      initAudioContext();
    } catch (_) {}
  }

  // 手机全事件捕获监听，用户任意点触瞬间激活 WebAudio
  ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      activateAudio();
    }, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      activateAudio();
    }
  });

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  // 虚拟按键状态缓存
  const rawButtons = {
    a: false,
    b: false,
    x: false,     // Turbo B (极速连投/连抓)
    select: false,
    start: false,
    up: false,
    down: false,
    left: false,
    right: false
  };

  // 2P 控制器状态跟踪 (双手柄独立)
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  const rawButtonsP2 = {
    up: false, down: false, left: false, right: false,
    a: false, b: false, ta: false, tb: false, jump: false,
    select: false, start: false
  };

  // 全局暴露 GGEMU_CORE 内核适配器
  window.GGEMU_CORE = {
    // 经典 FC 两键布局规范（遵从 AGENTS.md）
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", label: "A", sub: "跳跃", col: 2, row: 1 },
        { id: "b", label: "B", sub: "搬箱/投掷", col: 1, row: 2 },
        { id: "x", label: "X", sub: "连发", col: 2, row: 0 }
      ],
      capsules: [
        { id: "select", label: "SELECT", width: 44 },
        { id: "start", label: "START", width: 44 }
      ]
    },

    video: function () {
      return { w: NES_W, h: NES_H };
    },

    source: function () {
      return offscreen;
    },

    activateAudio: activateAudio,
    resumeAudio: function () {
      if (audioCtx && audioCtx.state !== "running") {
        audioCtx.resume().catch(() => {});
      }
    },

    setMuted: function (m) {
      isMuted = !!m;
    },

    isMuted: function () {
      return isMuted;
    },

    saveState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function (state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
      audioReadPtr = audioWritePtr;
    },

    getState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    exportState: function () {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "chipdale-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function (stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj && obj.state) {
        nes.fromJSON(obj.state);
        audioReadPtr = audioWritePtr;
      } else {
        throw new Error("存档格式错误");
      }
    },

    captureScreen: function () {
      if (!nes) throw new Error("游戏未运行");
      return offscreen;
    },

    renderTo: function (ctx, x, y, w, h) {
      if (!nes) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, NES_W, NES_H, x, y, w, h);
    },

    getNativeResolution: function () {
      return { width: NES_W, height: NES_H };
    },

    boot: function (romBase64, host) {
      isPaused = false;
      try {
        activateAudio();
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          sampleRate: 44100
        });

        const rawBase64 = (typeof romBase64 === "string" && romBase64.length > 100)
          ? romBase64
          : (typeof window.CHIPDALE_ROM_BASE64 === "string" && window.CHIPDALE_ROM_BASE64.length > 100)
            ? window.CHIPDALE_ROM_BASE64
            : (typeof window.ROM_DATA === "string" && window.ROM_DATA.length > 100)
              ? window.ROM_DATA
              : "";

        const rawBin = atob(rawBase64);
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 镜像缺失，请检查 rom.js");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热 5 帧完成 PPU 图层就绪并开始播放经典开场背景音
        for (let f = 0; f < 5; f++) nes.frame();
        audioReadPtr = audioWritePtr;

        lastTime = performance.now();
        isPaused = false;
        console.log("松鼠大作战 JSNES 内核启动成功");

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("boot 启动失败:", err);
        if (host && typeof host.onError === "function") {
          host.onError(err);
        }
        throw err;
      }
    },

    tick: function (forcedTime) {
      if (!isBooted || !nes || isPaused) return;

      const now = (typeof forcedTime === "number") ? forcedTime : performance.now();
      if (!lastTime) {
        lastTime = now - FRAME_MS;
      }
      const dt = Math.min(Math.max(now - lastTime, 0), 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTimer = (turboTimer + 1) % 6;
      const turboPulse = rawButtons.x && (turboTimer < 3);

      // 8 帧按键防漏保底
      const effectiveStart = rawButtons.start || (startHoldFrames > 0);
      if (startHoldFrames > 0) startHoldFrames--;

      const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
      if (selectHoldFrames > 0) selectHoldFrames--;

      // 严格使用 JSNES 标准按键 API
      const setBtn = (btnIndex, isDown) => {
        if (isDown) {
          nes.buttonDown(1, btnIndex);
        } else {
          nes.buttonUp(1, btnIndex);
        }
      };

      setBtn(NES_BTN.start, effectiveStart);
      setBtn(NES_BTN.select, effectiveSelect);
      setBtn(NES_BTN.a, rawButtons.a);
      setBtn(NES_BTN.b, rawButtons.b || turboPulse);
      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        stepCount++;
        nes.frame();
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    step: function (forcedTime) {
      return this.tick(forcedTime);
    },

    setSpeed: function (mul) {
      speedMultiplier = Math.max(1, mul || 1);
    },

    getSpeed: function () {
      return speedMultiplier;
    },

    setButton: function(btn, pressed, player) {
      if (!btn) return;
      const isP2 = (player === 2 || String(btn).startsWith("p2_"));
      const b = String(btn).toLowerCase().replace(/^btn-/, "").replace(/^p[12]_/, "");
      const target = isP2 ? rawButtonsP2 : rawButtons;
      if (b === "up") target.up = !!pressed;
      else if (b === "down") target.down = !!pressed;
      else if (b === "left") target.left = !!pressed;
      else if (b === "right") target.right = !!pressed;
      else if (b === "a") target.a = !!pressed;
      else if (b === "b") target.b = !!pressed;
      else if (b === "ta") target.ta = !!pressed;
      else if (b === "tb") target.tb = !!pressed;
      else if (b === "jump") target.jump = !!pressed;
      else if (b === "start") {
        target.start = !!pressed;
        if (pressed) {
          if (isP2) startHoldFramesP2 = 8;
          else {
            try { startHoldFrames = 8; } catch(_) {}
          }
        }
      } else if (b === "select") {
        target.select = !!pressed;
        if (pressed) {
          if (isP2) selectHoldFramesP2 = 8;
          else {
            try { selectHoldFrames = 8; } catch(_) {}
          }
        }
      }
    },

    setPause: function (p) {
      isPaused = p;
    },

    isPaused: function () {
      return isPaused;
    },

    reset: function () {
      if (nes) {
        nes.reset();
        audioReadPtr = audioWritePtr;
      }
    },

    // 录屏音频接入接口：将实时 WebAudio 输出流分流提供给 MediaRecorder
    connectRecordingAudio: function () {
      initAudioContext();
      if (!audioCtx) return null;
      ensureAudioNodes();
      if (!audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks && tracks.length ? tracks[0] : null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    audioDiag: function () {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes
      };
    }
  };
}();
