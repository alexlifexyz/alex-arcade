// 超级魂斗罗 (Super C NES) 核心适配器 (GGEMU_CORE for JSNES)
// 两键掌机，原版命数与武器，59s 立体声录屏
(function() {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;
  const FPS = 60;
  const FRAME_MS = 1000 / FPS;

  let offscreenCanvas = null;
  let offscreenCtx = null;
  let imgData = null;
  let pixelBuf = null;

  if (typeof document !== "undefined" && document.createElement) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = NES_W;
    offscreenCanvas.height = NES_H;
    offscreenCtx = offscreenCanvas.getContext("2d", { alpha: false });
    imgData = offscreenCtx.createImageData(NES_W, NES_H);
    pixelBuf = new Uint32Array(imgData.data.buffer);
  }

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let isMute = false;
  let speedMultiplier = 1;
  let turboTick = 0;

  // START / SELECT 8 帧按压缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (四键钻石布局)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // A 跳跃
    b: false,     // B 射击
    tb: false,    // X 连发射击 Turbo B
    ta: false,    // Y 连发跳跃 Turbo A
    select: false,
    start: false
  };

  // NES Controller 映射表 (Player 1)
  // 0: A, 1: B, 2: Select, 3: Start, 4: Up, 5: Down, 6: Left, 7: Right
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

  // Web Audio 状态与录屏流
  let audioCtx = null;
  let audioScriptNode = null;
  let recDestNode = null;
  let audioCallbacks = 0;
  let audioPrimes = 0;
  const AUDIO_BUF_SIZE = 8192;
  const audioRingL = new Float32Array(AUDIO_BUF_SIZE);
  const audioRingR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;

  function initAudioContext() {
    if (audioCtx) return;
    const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return;
    try {
      try {
        audioCtx = new AC({ sampleRate: 44100 });
      } catch (_) {
        audioCtx = new AC();
      }
      if (audioCtx.createScriptProcessor) {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
      } else if (audioCtx.createJavaScriptNode) {
        audioScriptNode = audioCtx.createJavaScriptNode(2048, 0, 2);
      }
      if (audioScriptNode) {
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
      }
    } catch (e) {
      console.warn("initAudioContext failed:", e);
    }
  }

  function activateAudio() {
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

    // 播放 1 个采样的静音 BufferSource，强制激活移动端底层硬件通电
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

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

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

  function handleAudioSample(left, right) {
    if (isMute) return;
    const nextPtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
    if (nextPtr === audioReadPtr) return; // 缓冲区已满
    audioRingL[audioWritePtr] = left;
    audioRingR[audioWritePtr] = right;
    audioWritePtr = nextPtr;
  }

  function renderVideoFrame(buffer) {
    if (!pixelBuf) return;
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xFF000000 | buffer[i];
    }
    if (offscreenCtx && imgData) {
      offscreenCtx.putImageData(imgData, 0, 0);
    }
  }

  let lastTime = 0;
  let accumulator = 0;

  // 主循环调度
  function tick() {
    if (!isBooted || !nes || isPaused) return;

    // 1. 连发按键周期计数 (Turbo A / Turbo B 保持 30Hz 稳定连发)
    turboTick = (turboTick + 1) % 4;
    const isTurboActive = turboTick < 2;

    const btnBActive = rawButtons.b || (rawButtons.tb && isTurboActive);
    const btnAActive = rawButtons.a || (rawButtons.ta && isTurboActive);

    // 2. 8 帧按键防漏缓冲
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 3. 将物理按键状态写入 NES 控制器
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
    setBtn(NES_BTN.b, btnBActive);
    setBtn(NES_BTN.a, btnAActive);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 4. 3× 加速时间积分步进 (严格遵守公式：增量乘以倍率)
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

  // 核心实例
  const coreInstance = {
    id: "super-contra-nes",
    name: "超级魂斗罗",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "B" },
        { id: "a", key: "A", label: "A" }
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
        console.error("ROM_DATA 为空，无法启动超级魂斗罗");
        return;
      }

      const NESModule = (typeof window !== "undefined" && window.NES_MODULE) ? window.NES_MODULE :
                        ((typeof NES_MODULE !== "undefined") ? NES_MODULE : null);
      const NESClass = NESModule ? (NESModule.default || NESModule.NES || NESModule) :
                       ((typeof window !== "undefined" && window.jsnes && window.jsnes.NES) ? window.jsnes.NES : null);
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      nes = new NESClass({
        onFrame: renderVideoFrame,
        onAudioSample: handleAudioSample
      });

      try {
        const binStr = (typeof atob === "function") ? atob(romData) : Buffer.from(romData, "base64").toString("binary");
        nes.loadROM(binStr);
      } catch (err) {
        console.error("ROM 加载失败:", err);
        return;
      }

      isBooted = true;

      // 预热直接穿透开机 8 秒版权等待，首屏瞬间就绪呈现超级魂斗罗经典全彩标题画面
      try {
        for (let f = 0; f < 25; f++) {
          if (f >= 5 && f <= 15) {
            nes.buttonDown(1, NES_BTN.start);
          } else {
            nes.buttonUp(1, NES_BTN.start);
          }
          nes.frame();
        }
        nes.buttonUp(1, NES_BTN.start);
      } catch (e) {
        console.warn("Pre-render frame warn:", e);
      }

      lastTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      accumulator = 0;

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    },

    tick: tick,

    video: function() {
      return { w: NES_W, h: NES_H };
    },

    source: function() {
      return offscreenCanvas;
    },

    setButton: function(btn, pressed) {
      activateAudio();
      const p = !!pressed;
      switch (btn) {
        case "up": rawButtons.up = p; break;
        case "down": rawButtons.down = p; break;
        case "left": rawButtons.left = p; break;
        case "right": rawButtons.right = p; break;
        case "b":
        case "btn-b": rawButtons.b = p; break;
        case "a":
        case "btn-a": rawButtons.a = p; break;
        case "x":
        case "tb":
        case "btn-x": rawButtons.tb = p; break;
        case "y":
        case "ta":
        case "btn-y": rawButtons.ta = p; break;
        case "select":
        case "btn-select":
          rawButtons.select = p;
          if (p) selectHoldFrames = 8;
          break;
        case "start":
        case "btn-start":
          rawButtons.start = p;
          if (p) startHoldFrames = 8;
          break;
      }
    },

    setSpeed: function(mul) {
      speedMultiplier = Math.max(1, Math.min(10, mul || 1));
    },

    setMuted: function(mute) {
      isMute = !!mute;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("super_contra_mute", String(isMute));
        }
      } catch (_) {}
    },

    isMuted: function() {
      return isMute;
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (!audioCtx) return null;
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(function() {});
      }
      if (!audioScriptNode) {
        try {
          audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
          audioScriptNode.onaudioprocess = onAudioProcess;
          audioScriptNode.connect(audioCtx.destination);
          audioReadPtr = audioWritePtr;
        } catch (e) {
          console.warn("createScriptProcessor fail:", e);
        }
      }
      if (destNode) {
        recDestNode = destNode;
        if (audioScriptNode) {
          try { audioScriptNode.connect(destNode); } catch (_) {}
        }
        return null;
      }
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

    audioDiag: function() {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes
      };
    },

    exportState: function() {
      if (!nes) throw new Error("游戏尚未就绪");
      const stateObj = nes.toJSON();
      const json = JSON.stringify(stateObj);
      if (typeof window !== "undefined" && window.LZString && window.LZString.compressToUTF16) {
        return window.LZString.compressToUTF16(json);
      }
      return json;
    },

    importState: function(compressed) {
      if (!nes || !compressed) return false;
      try {
        let jsonStr = compressed;
        if (typeof window !== "undefined" && window.LZString && window.LZString.decompressFromUTF16) {
          const decomp = window.LZString.decompressFromUTF16(compressed);
          if (decomp) jsonStr = decomp;
        }
        const stateObj = JSON.parse(jsonStr);
        nes.fromJSON(stateObj);
        return true;
      } catch (e) {
        console.error("即时读档失败:", e);
        return false;
      }
    }
  };

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
