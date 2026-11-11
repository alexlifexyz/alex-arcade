// 《名将》CPS1 驱动 captcomm。画面保持原生宽屏，不改成 4:3。
// 钻石四键：Y 攻击、B 跳跃、A 必杀（第三键）、X 连发。动作键不触发 START。
(function () {
  "use strict";

  let vidW = 384;
  let vidH = 224;
  let orient = 0;
  let rotCanvas = null;
  let rotCtx = null;
  const AUDIO_RATE = 44100;
  let emu = null;
  let isStarted = false;
  let isCrashed = false;
  let speedMultiplier = 1;
  let frameIntervalMs = 1000 / 59.63;

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = vidW;
  offscreenCanvas.height = vidH;
  const offscreenCtx = offscreenCanvas.getContext("2d");
  let imgData = null;

  function base64ToUint8Array(b64) {
    const binStr = window.atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToBase64(u8) {
    let str = "";
    const CHUNK_SIZE = 32768;
    for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
      str += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK_SIZE));
    }
    return window.btoa(str);
  }

  const wasiImports = {
    clock_time_get: function () { return 0; },
    fd_close: function () { return 8; },
    fd_fdstat_get: function () { return 8; },
    fd_fdstat_set_flags: function () { return 8; },
    fd_prestat_get: function () { return 8; },
    fd_prestat_dir_name: function () { return 8; },
    fd_read: function () { return 8; },
    fd_seek: function () { return 8; },
    fd_write: function () { return 8; },
    path_open: function () { return 44; },
    proc_exit: function () { throw new Error("内核退出"); }
  };

  const btnState = {};
  const holdBuffer = {};

  // 本 CPS1 端口的 g_frame 掩码：bit4/5 为前两键，bit6 开始，bit7 投币，bit16 为第三键。
  const BTN_ATTACK = 16;
  const BTN_JUMP = 32;
  const BTN_SPECIAL = 65536;
  const BTN_START = 64;
  const BTN_COIN = 128;

  const BTN_MAP = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    y: BTN_ATTACK,
    b: BTN_JUMP,
    a: BTN_SPECIAL,
    attack: BTN_ATTACK,
    jump: BTN_JUMP,
    special: BTN_SPECIAL,
    start: BTN_START,
    coin: BTN_COIN
  };

  let turboCounter = 0;

  function computeInputs() {
    let mask = 0;
    for (const k in btnState) {
      if (k === "x" || k === "burst") continue;
      if ((btnState[k] || (holdBuffer[k] && holdBuffer[k] > 0)) && BTN_MAP[k]) {
        mask |= BTN_MAP[k];
      }
    }
    const turboOn = !!(btnState.x || btnState.burst || (holdBuffer.x > 0) || (holdBuffer.burst > 0));
    if (turboOn && ((turboCounter >> 1) & 1) === 0) {
      mask |= BTN_ATTACK;
    }
    if ((mask & 3) === 3) mask &= ~3;
    if ((mask & 12) === 12) mask &= ~12;
    return mask;
  }

  const KEY_MAP = {
    38: "up", 87: "up",
    40: "down", 83: "down",
    37: "left", 65: "left",
    39: "right", 68: "right",
    74: "y",
    75: "b",
    76: "a",
    85: "x",
    53: "coin",
    13: "start",
    49: "start"
  };

  function setButton(btnId, isPressed) {
    const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
    btnState[norm] = !!isPressed;
    if (isPressed && (norm === "start" || norm === "coin" || norm === "select")) {
      holdBuffer[norm] = 8;
    }
  }

  window.addEventListener("keydown", function (e) {
    const btn = KEY_MAP[e.keyCode];
    if (btn) {
      setButton(btn, true);
      if (e.preventDefault) e.preventDefault();
    }
  });

  window.addEventListener("keyup", function (e) {
    const btn = KEY_MAP[e.keyCode];
    if (btn) {
      setButton(btn, false);
      if (e.preventDefault) e.preventDefault();
    }
  });

  const RING_SIZE = 32768;
  const ringL = new Float32Array(RING_SIZE);
  const ringR = new Float32Array(RING_SIZE);
  let ringWrite = 0;
  let ringRead = 0;
  let audioCtx = null;
  let scriptNode = null;
  let masterGainNode = null;
  let recDest = null;
  let audioCallbacks = 0;
  let primeCount = 0;
  let isMuted = false;

  function availableAudioSamples() {
    return (ringWrite - Math.floor(ringRead) + RING_SIZE) % RING_SIZE;
  }

  function sampleAudio() {
    if (!scriptNode || !emu) return;
    const len = emu.g_audiolen();
    if (len <= 0) return;
    const audioData = new Int16Array(emu.memory.buffer, emu.g_audio(), 2 * len);
    const step = speedMultiplier > 1 ? speedMultiplier : 1;
    if (availableAudioSamples() > 8820) return;
    for (let i = 0; i < len; i += step) {
      ringL[ringWrite] = audioData[2 * i] / 32768;
      ringR[ringWrite] = audioData[2 * i + 1] / 32768;
      ringWrite = (ringWrite + 1) & (RING_SIZE - 1);
    }
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
    const ratio = AUDIO_RATE / (audioCtx ? audioCtx.sampleRate : AUDIO_RATE);
    for (let i = 0; i < outL.length; i++) {
      if (availableAudioSamples() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const idx = Math.floor(ringRead);
      const frac = ringRead - idx;
      const nextIdx = (idx + 1) & (RING_SIZE - 1);
      outL[i] = ringL[idx] + (ringL[nextIdx] - ringL[idx]) * frac;
      outR[i] = ringR[idx] + (ringR[nextIdx] - ringR[idx]) * frac;
      ringRead += ratio;
      if (ringRead >= RING_SIZE) ringRead -= RING_SIZE;
    }
  }

  function configureAudioSession() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (e) {}
  }

  function activateAudio() {
    if (isMuted) return;
    configureAudioSession();
    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      scriptNode = null;
      masterGainNode = null;
    }
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        audioCtx = null;
        return;
      }
      if (typeof audioCtx.createScriptProcessor !== "function") return;
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = isMuted ? 0 : 1;
      masterGainNode.connect(audioCtx.destination);
    }

    const resumePromise = audioCtx.state === "running" ? null : audioCtx.resume();

    if (audioCtx && primeCount < 6) {
      primeCount++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        if (dummy.start) dummy.start(0);
        else if (dummy.noteOn) dummy.noteOn(0);
      } catch (e) {}
    }

    try {
      if (window.xhs && window.xhs.miniTool && typeof window.xhs.miniTool.enableAudio === "function") {
        window.xhs.miniTool.enableAudio();
      }
    } catch (e) {}

    Promise.resolve(resumePromise).then(function () {
      if (audioCtx && audioCtx.state === "running" && !scriptNode) {
        scriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        scriptNode.onaudioprocess = onAudioProcess;
        if (masterGainNode) {
          scriptNode.connect(masterGainNode);
        } else {
          scriptNode.connect(audioCtx.destination);
        }
        if (recDest) {
          try { scriptNode.connect(recDest); } catch (e) {}
        }
        ringRead = ringWrite;
      }
    }).catch(function () {});
  }

  const AUDIO_GESTURES = ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"];
  AUDIO_GESTURES.forEach(function (evt) {
    document.addEventListener(evt, function () {
      if (!isMuted && (!scriptNode || primeCount < 6 || (audioCtx && audioCtx.state !== "running"))) {
        activateAudio();
      }
    }, true);
  });

  let lastFrameTime = 0;
  let accumTime = 0;
  let fpsFrameCount = 0;
  let lastFpsTime = 0;

  function renderFrame() {
    if (!emu || !imgData) return;
    const vPtr = emu.g_video();
    const vBytes = new Uint8Array(emu.memory.buffer, vPtr, vidW * vidH * 4);
    imgData.data.set(vBytes);

    if (orient & 1) {
      rotCtx.putImageData(imgData, 0, 0);
      if (orient & 2) {
        offscreenCtx.setTransform(0, 1, -1, 0, vidH, 0);
      } else {
        offscreenCtx.setTransform(0, -1, 1, 0, 0, vidW);
      }
      offscreenCtx.drawImage(rotCanvas, 0, 0);
      offscreenCtx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      offscreenCtx.putImageData(imgData, 0, 0);
    }
  }

  let statePtr = 0;
  let stateAllocSize = 0;

  function saveNativeState() {
    const sz = emu.g_state_size();
    if (sz !== stateAllocSize) {
      if (statePtr) emu.g_free(statePtr);
      statePtr = emu.g_malloc(sz);
      stateAllocSize = sz;
    }
    emu.g_state_save(statePtr);
    return new Uint8Array(emu.memory.buffer, statePtr, sz).slice();
  }

  function loadNativeState(bytes) {
    const sz = emu.g_state_size();
    if (bytes.length !== sz) throw new Error("存档与当前游戏不匹配");
    if (sz !== stateAllocSize) {
      if (statePtr) emu.g_free(statePtr);
      statePtr = emu.g_malloc(sz);
      stateAllocSize = sz;
    }
    new Uint8Array(emu.memory.buffer, statePtr, sz).set(bytes);
    emu.g_state_load(statePtr);
    ringRead = ringWrite;
    renderFrame();
  }

  let initialCleanState = null;

  function stepFrames(count, mask) {
    for (let f = 0; f < count; f++) {
      emu.g_frame(mask, f === count - 1 ? 1 : 0);
    }
  }

  function visibleRatio() {
    renderFrame();
    if (!imgData || !imgData.data) return 0;
    const data = imgData.data;
    let lit = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 16) {
      samples++;
      if (data[i] || data[i + 1] || data[i + 2]) lit++;
    }
    return samples ? lit / samples : 0;
  }

  const padConfig = {
    name: "名将",
    stick: true,
    layout: "diamond",
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    actions: [
      { id: "y", label: "攻击", key: "Y" },
      { id: "b", label: "跳跃", key: "B" },
      { id: "a", label: "必杀", key: "A" },
      { id: "x", label: "连发", key: "X" }
    ],
    geom: { rf: 0.62, dd: 1.5, hit: 14 },
    capsules: [
      { id: "coin", label: "投币", follow: { soft: true, title: "关注一下，币接着投", body: "关注作者，下次打开还能接着投。", hint: "先玩再关，这局照样能投", cancelText: "先玩再关", okText: "关注继续" } },
      { id: "start", label: "开始" }
    ]
  };

  function boot(romBase64, host) {
    if (romBase64 && typeof romBase64 === "object" && !host) {
      host = romBase64;
      romBase64 = null;
    }
    if (typeof romBase64 !== "string" || !romBase64) {
      romBase64 = (typeof window !== "undefined" && window.ROM_DATA) || "";
    }
    if (!host || typeof host !== "object") host = {};

    try {
      configureAudioSession();
      const romBytes = base64ToUint8Array(romBase64);
      const magic = String.fromCharCode(romBytes[0], romBytes[1], romBytes[2], romBytes[3]);
      if (magic !== "GGP1" && magic !== "GGP2") {
        throw new Error("ROM 包格式不对, 请用 build_rom.js 重新打包");
      }

      const driverName = "captcomm";
      let headerOffset = 24;
      if (magic === "GGP1") headerOffset = 8;

      const dv = new DataView(romBytes.buffer, romBytes.byteOffset, romBytes.byteLength);
      const romCount = dv.getUint32(4, true);

      emu = window.GGEMU_CPS1_CREATE(wasiImports);
      emu._initialize();

      let p = headerOffset + 8 * romCount;
      for (let i = 0; i < romCount; i++) {
        const loadAddr = dv.getUint32(headerOffset + 8 * i, true);
        const size = dv.getUint32(headerOffset + 4 + 8 * i, true);
        const ptr = emu.g_malloc(size);
        new Uint8Array(emu.memory.buffer, ptr, size).set(romBytes.subarray(p, p + size));
        emu.g_addrom(ptr, size, loadAddr | 0);
        p += size;
      }

      const pDriver = emu.g_malloc(driverName.length + 1);
      const driverBytes = new Uint8Array(emu.memory.buffer, pDriver, driverName.length + 1);
      for (let i = 0; i < driverName.length; i++) {
        driverBytes[i] = driverName.charCodeAt(i);
      }
      driverBytes[driverName.length] = 0;

      const initRes = emu.g_init(AUDIO_RATE, pDriver);
      if (initRes !== 0) throw new Error("内核初始化失败(" + initRes + ")");

      frameIntervalMs = 100000 / emu.g_fps();
      vidW = emu.g_width();
      vidH = emu.g_height();
      orient = emu.g_orient();

      if (orient & 1) {
        rotCanvas = document.createElement("canvas");
        rotCanvas.width = vidW;
        rotCanvas.height = vidH;
        rotCtx = rotCanvas.getContext("2d");
        offscreenCanvas.width = vidH;
        offscreenCanvas.height = vidW;
      } else {
        offscreenCanvas.width = vidW;
        offscreenCanvas.height = vidH;
      }
      imgData = offscreenCtx.createImageData(vidW, vidH);

      // 自检画面几乎全黑。步进到全彩标题再交给外壳，避免首屏被当成卡死。
      stepFrames(30, 0);
      stepFrames(12, BTN_COIN);
      stepFrames(8, 0);
      stepFrames(12, BTN_START);
      stepFrames(20, 0);
      let warmed = 0;
      while (warmed < 1500 && visibleRatio() < 0.22) {
        stepFrames(30, 0);
        warmed += 30;
      }
      renderFrame();

      initialCleanState = saveNativeState();
      isStarted = true;
    } catch (err) {
      if (host && typeof host.toast === "function") {
        host.toast("模拟器启动失败：" + (err && err.message ? err.message : err));
      }
      console.error("boot error:", err);
    }

    if (host && typeof host.onReady === "function") {
      host.onReady();
    }
  }

  function tick() {
    if (!isStarted || isCrashed) return;
    if (typeof document !== "undefined" && document.hidden) {
      lastFrameTime = 0;
      accumTime = 0;
      return;
    }
    const now = performance.now();
    if (!lastFrameTime) {
      lastFrameTime = now;
      lastFpsTime = now;
      return;
    }
    const dt = Math.min(now - lastFrameTime, 250) * speedMultiplier;
    lastFrameTime = now;
    accumTime += dt;

    const maxSteps = 3 * speedMultiplier;
    let steps = 0;
    try {
      while (accumTime >= frameIntervalMs && steps < maxSteps) {
        accumTime -= frameIntervalMs;
        const isLastStep = !(accumTime >= frameIntervalMs && steps + 1 < maxSteps);

        emu.g_frame(computeInputs(), isLastStep ? 1 : 0);

        for (const k in holdBuffer) {
          if (holdBuffer[k] > 0) holdBuffer[k]--;
        }
        turboCounter++;

        sampleAudio();
        if (isLastStep) {
          renderFrame();
        }
        steps++;
      }
      if (accumTime >= frameIntervalMs) {
        accumTime = 0;
      }
      fpsFrameCount += steps;
      if (now - lastFpsTime >= 1000) {
        window.__cps1Fps = Math.round((fpsFrameCount * 1000) / (now - lastFpsTime));
        fpsFrameCount = 0;
        lastFpsTime = now;
      }
    } catch (err) {
      isCrashed = true;
      console.error("tick error:", err);
      if (window.GGEMU_TOAST) {
        window.GGEMU_TOAST("模拟器出错：" + (err && err.message ? err.message : err));
      }
    }
  }

  window.GGEMU_CORE = {
    id: "cps1",
    name: "名将",
    pad: padConfig,
    video: function () {
      return { w: vidW, h: vidH };
    },
    source: function () {
      return offscreenCanvas;
    },
    boot: boot,
    tick: tick,
    setButton: setButton,
    activateAudio: activateAudio,
    resumeAudio: activateAudio,
    isMuted: function () {
      return isMuted;
    },
    setMute: function (flag) {
      isMuted = !!flag;
      if (masterGainNode) {
        masterGainNode.gain.value = isMuted ? 0 : 1;
      }
      if (isMuted) {
        ringRead = ringWrite;
        for (let i = 0; i < RING_SIZE; i++) {
          ringL[i] = 0;
          ringR[i] = 0;
        }
      }
    },
    audioDiag: function () {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!scriptNode,
        primes: primeCount,
        fps: window.__cps1Fps || 0
      };
    },
    reset: function () {
      if (!emu || !initialCleanState) return;
      try {
        loadNativeState(initialCleanState);
        ringRead = ringWrite = 0;
        for (let i = 0; i < RING_SIZE; i++) {
          ringL[i] = 0;
          ringR[i] = 0;
        }
        for (const k in btnState) btnState[k] = false;
        for (const k in holdBuffer) holdBuffer[k] = 0;
        stepFrames(15, 0);
        renderFrame();
        lastFrameTime = 0;
        accumTime = 0;
        isCrashed = false;
      } catch (err) {
        console.error("reset error:", err);
      }
    },
    exportState: function () {
      if (!isStarted) throw new Error("游戏尚未启动");
      return JSON.stringify({
        v: 1,
        sys: "cps1",
        game: "captcomm",
        s: uint8ArrayToBase64(saveNativeState())
      });
    },
    importState: function (jsonStr) {
      const stateObj = JSON.parse(jsonStr);
      if (stateObj.v !== 1 || stateObj.sys !== "cps1") {
        throw new Error("存档版本不兼容");
      }
      loadNativeState(base64ToUint8Array(stateObj.s));
      isCrashed = false;
    },
    setSpeed: function (mult) {
      speedMultiplier = (mult && mult > 1) ? mult : 1;
    },
    setSpeedMultiplier: function (mult) {
      speedMultiplier = (mult && mult > 1) ? mult : 1;
    },
    connectRecordingAudio: function () {
      if (isMuted) return null;
      activateAudio();
      if (audioCtx && audioCtx.state !== "running" && typeof audioCtx.resume === "function") {
        try { audioCtx.resume(); } catch (e) {}
      }
      if (!audioCtx || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      if (!recDest) {
        try {
          recDest = audioCtx.createMediaStreamDestination();
          if (scriptNode) {
            scriptNode.connect(recDest);
          }
        } catch (e) {
          return null;
        }
      }
      const tracks = recDest.stream.getAudioTracks();
      return tracks && tracks.length ? tracks[0] : null;
    }
  };
})();
