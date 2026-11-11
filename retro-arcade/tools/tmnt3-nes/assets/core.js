!function () {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;
  const FPS = 60;
  const FRAME_MS = 1000 / FPS;

  // NES 标准手柄映射码
  const NES_BTN = {
    a: 0,       // 跳跃
    b: 1,       // 攻击
    select: 2,  // 选人
    start: 3,   // 开始/暂停
    up: 4,      // 向上移动
    down: 5,    // 向下移动
    left: 6,    // 向左移动
    right: 7    // 向右移动
  };

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  let turboTimer = 0;

  // 按键防漏保底计数器 (确保真机轻点也能维持 8 帧被 NES CPU 完整采样)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;
  let superHoldFrames = 0;

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

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
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

  function initAudioContext() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    if (window.xhs && window.xhs.miniTool) {
      try {
        if (typeof window.xhs.miniTool.enableAudio === "function") {
          window.xhs.miniTool.enableAudio();
        }
      } catch (_) {}
    }

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
      audioCtx.resume().catch(() => {});
    }

    // 播放 1 个采样的静音 BufferSource，强制唤醒底层音频硬件
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (audioCtx && !audioScriptNode) {
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

  // 虚拟按键原始状态表
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,      // NES A 跳跃
    b: false,      // NES B 攻击
    select: false, // 选人
    start: false,  // 开始/暂停
    sp: false,     // X 极速连击
    ab: false      // A 一键绝招宏 (A+B)
  };

  // 胶囊功能键定义 (对齐标杆：选择与开始)
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义 (对齐四键动作版标杆：上连发X、左轻击Y、右必杀A、下跳跃B)
  const ACTIONS = [
    { id: "sp", label: "连发", key: "X" },
    { id: "b", label: "攻击", key: "Y" },
    { id: "ab", label: "必杀", key: "A" },
    { id: "jump", label: "跳跃", key: "B" }
  ];

  window.GGEMU_CORE = {
    id: "tmnt3-nes",
    name: "忍者神龟3：曼哈顿计划",
    pad: {
      stick: true,
      layout: "diamond",
      actions: ACTIONS,
      geom: { rf: 0.62, dd: 1.5, hit: 10 },
      capsules: CAPSULES
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

    connectRecordingAudio: function () {
      if (!audioCtx || !audioScriptNode) {
        initAudioContext();
      }
      if (audioCtx && audioCtx.state !== "running") {
        audioCtx.resume().catch(() => {});
      }
      if (!audioCtx || !audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks.length ? tracks[0] : null;
      } catch (err) {
        console.warn("connectRecordingAudio error:", err);
        return null;
      }
    },

    audioDiag: function () {
      return {
        audio: audioCtx ? audioCtx.state : "none",
        audioRate: audioCtx ? audioCtx.sampleRate : 0,
        audioNode: !!audioScriptNode
      };
    },

    // 即时存档与读档标准接口
    saveState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function (state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
    },

    getState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    exportState: function () {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "tmnt3-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function (stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj && obj.state) {
        nes.fromJSON(obj.state);
      } else {
        throw new Error("存档格式错误");
      }
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
          : (typeof window.TMNT3_ROM_BASE64 === "string" && window.TMNT3_ROM_BASE64.length > 100)
            ? window.TMNT3_ROM_BASE64
            : (typeof window.ROM_DATA === "string" && window.ROM_DATA.length > 100)
              ? window.ROM_DATA
              : "";

        const rawBin = atob(rawBase64);
        if (!rawBin || rawBin.length < 16000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热 10 帧让 PPU 图层就绪
        for (let f = 0; f < 10; f++) nes.frame();
        audioReadPtr = audioWritePtr;

        isPaused = false;
        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("忍者神龟3启动异常:", err);
        if (host && typeof host.onError === "function") {
          host.onError(err);
        }
      }
    },

    tick: function () {
      if (!isBooted || !nes || isPaused) return;

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        return;
      }
      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTimer = (turboTimer + 1) % 6;
      // 极速连击 X 键：每 3 帧交替触发攻击
      const turboAttack = rawButtons.sp && (turboTimer < 3);

      // 处理【开始】与【选择】的按键保底，确保真机轻按 100% 被 NES 读到
      const effectiveStart = rawButtons.start || (startHoldFrames > 0);
      if (startHoldFrames > 0) startHoldFrames--;

      const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
      if (selectHoldFrames > 0) selectHoldFrames--;

      // 一键必杀绝招宏：同时触发 A(跳跃) + B(攻击)
      const isSuperActive = rawButtons.ab || (superHoldFrames > 0);
      if (superHoldFrames > 0) superHoldFrames--;

      const setBtn = (btnIndex, isDown) => {
        if (isDown) {
          nes.buttonDown(1, btnIndex);
        } else {
          nes.buttonUp(1, btnIndex);
        }
      };

      // 方向摇杆
      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);

      // 选择与开始
      setBtn(NES_BTN.select, effectiveSelect);
      setBtn(NES_BTN.start, effectiveStart);

      // 动作按键：跳跃(A) 与 攻击(B)
      const finalJump = rawButtons.jump || rawButtons.a || isSuperActive;
      const finalAttack = rawButtons.b || turboAttack || isSuperActive;
      setBtn(NES_BTN.a, finalJump);
      setBtn(NES_BTN.b, finalAttack);

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

    setSpeed: function (mul) {
      speedMultiplier = Math.max(1, mul || 1);
    },

    getSpeed: function () {
      return speedMultiplier;
    },

    setButton: function (btn, down) {
      activateAudio();

      if (btn === "start") {
        rawButtons.start = down;
        if (down) startHoldFrames = 8;
      } else if (btn === "select") {
        rawButtons.select = down;
        if (down) selectHoldFrames = 8;
      } else if (btn === "ab") {
        rawButtons.ab = down;
        if (down) superHoldFrames = 6; // 维持 6 帧确保绝招 100% 触发
      } else if (btn === "jump") {
        rawButtons.jump = down;
        rawButtons.a = down;
      } else if (btn === "sp") {
        rawButtons.sp = down;
      } else if (btn === "b") {
        rawButtons.b = down;
      } else if (btn === "a") {
        rawButtons.ab = down;
        if (down) superHoldFrames = 6;
      } else if (rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = down;
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
    }
  };
}();
