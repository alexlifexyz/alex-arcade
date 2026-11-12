// 赤色要塞 (Jackal NES) 核心适配器 (GGEMU_CORE for JSNES)
// 两键掌机。A 为副武器，B 为机枪。不改命数，不改武器，不改进场过场。
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
  let lives99 = false;
  let stockLives = 5;
  const LIFE_SITES = [
    { cpu: 0xE8DA, bank: 0x28DA },
    { cpu: 0xED15, bank: 0x2D15 }
  ];

  // START / SELECT 8 帧按压缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (原生标准两键布局)
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

  // 2P START / SELECT 8 帧按压缓冲与按键状态跟踪
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  const rawButtonsP2 = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
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
    audioRingL[audioWritePtr] = left;
    audioRingR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
  }

  function renderVideoFrame(buffer) {
    if (!pixelBuf || !buffer) return;
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xFF000000 | buffer[i];
    }
    if (offscreenCtx) {
      offscreenCtx.putImageData(imgData, 0, 0);
    }
  }

  let lastTime = 0;
  let accumulator = 0;

  function lifeSitesIntact(mem) {
    for (let i = 0; i < LIFE_SITES.length; i++) {
      const addr = LIFE_SITES[i].cpu;
      const op = mem[addr];
      const arg = mem[addr + 1];
      const original = op === 0xD6 && arg === 0x31;
      const patched = op === 0xEA && arg === 0xEA;
      if (!original && !patched) return false;
    }
    return true;
  }

  function syncLifePatch() {
    if (!nes || !nes.cpu || !nes.rom || !nes.rom.rom || !nes.rom.rom[7]) return false;
    const mem = nes.cpu.mem;
    const bank = nes.rom.rom[7];
    if (!lifeSitesIntact(mem)) return false;
    const b0 = lives99 ? 0xEA : 0xD6;
    const b1 = lives99 ? 0xEA : 0x31;
    for (let i = 0; i < LIFE_SITES.length; i++) {
      const site = LIFE_SITES[i];
      mem[site.cpu] = b0;
      mem[site.cpu + 1] = b1;
      bank[site.bank] = b0;
      bank[site.bank + 1] = b1;
    }
    return true;
  }

  function guardLives() {
    if (!lives99 || !nes || !nes.cpu) return;
    const lives = nes.cpu.mem[0x0031];
    if (lives > 0 && lives < 90) nes.cpu.mem[0x0031] = 99;
  }

  function tick() {
    if (!isBooted || isPaused) return;

    // 1. 8 帧按键防漏缓冲 (1P 与 2P)
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    const effectiveStartP2 = rawButtonsP2.start || (startHoldFramesP2 > 0);
    if (startHoldFramesP2 > 0) startHoldFramesP2--;

    const effectiveSelectP2 = rawButtonsP2.select || (selectHoldFramesP2 > 0);
    if (selectHoldFramesP2 > 0) selectHoldFramesP2--;

    // 2. 将按键状态写入 NES 控制器 (1P & 2P 双人手柄完全独立)
    const setBtn = (playerIndex, btnIndex, isDown) => {
      if (isDown) {
        nes.buttonDown(playerIndex, btnIndex);
      } else {
        nes.buttonUp(playerIndex, btnIndex);
      }
    };

    setBtn(1, NES_BTN.up, rawButtons.up);
    setBtn(1, NES_BTN.down, rawButtons.down);
    setBtn(1, NES_BTN.left, rawButtons.left);
    setBtn(1, NES_BTN.right, rawButtons.right);
    setBtn(1, NES_BTN.b, rawButtons.b);
    setBtn(1, NES_BTN.a, rawButtons.a);
    setBtn(1, NES_BTN.start, effectiveStart);
    setBtn(1, NES_BTN.select, effectiveSelect);

    setBtn(2, NES_BTN.up, rawButtonsP2.up);
    setBtn(2, NES_BTN.down, rawButtonsP2.down);
    setBtn(2, NES_BTN.left, rawButtonsP2.left);
    setBtn(2, NES_BTN.right, rawButtonsP2.right);
    setBtn(2, NES_BTN.b, rawButtonsP2.b);
    setBtn(2, NES_BTN.a, rawButtonsP2.a);
    setBtn(2, NES_BTN.start, effectiveStartP2);
    setBtn(2, NES_BTN.select, effectiveSelectP2);

    if (lives99) {
      if (!syncLifePatch()) lives99 = false;
      else guardLives();
    }

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
    id: "jackal-nes",
    name: "赤色要塞",
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
        console.error("ROM_DATA 为空，无法启动赤色要塞");
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
      lastTime = 0;
      accumulator = 0;

      // 预热 30 帧跨越开机黑屏，瞬出全彩标题画面
      try {
        for (let f = 0; f < 30; f++) {
          nes.frame();
        }
      } catch (e) {
        console.warn("预热步进警告:", e);
      }

      if (lives99) syncLifePatch();

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }

      if (typeof localStorage !== "undefined") {
        isMute = localStorage.getItem("ggemu_mute") === "true";
      }
    },

    tick: tick,

    setButton: function(btn, pressed, player) {
      if (!btn) return;
      const p = (player === 2 || String(btn).startsWith("p2_")) ? 2 : 1;
      const b = String(btn).toLowerCase().replace(/^btn-/, "").replace(/^p[12]_/, "");
      const target = (p === 2) ? rawButtonsP2 : rawButtons;
      if (b === "up") target.up = !!pressed;
      else if (b === "down") target.down = !!pressed;
      else if (b === "left") target.left = !!pressed;
      else if (b === "right") target.right = !!pressed;
      else if (b === "a") target.a = !!pressed; // A 键抛炸药包
      else if (b === "b") target.b = !!pressed; // B 键打子弹
      else if (b === "start") {
        target.start = !!pressed;
        if (pressed) {
          if (p === 2) startHoldFramesP2 = 8;
          else startHoldFrames = 8;
        }
      } else if (b === "select") {
        target.select = !!pressed;
        if (pressed) {
          if (p === 2) selectHoldFramesP2 = 8;
          else selectHoldFrames = 8;
        }
      }
    },

    setStick: function(dx, dy) {
      const THRESHOLD = 0.35;
      rawButtons.left = dx < -THRESHOLD;
      rawButtons.right = dx > THRESHOLD;
      rawButtons.up = dy < -THRESHOLD;
      rawButtons.down = dy > THRESHOLD;
    },

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: NES_W, h: NES_H };
    },

    setSpeed: function(mul) {
      speedMultiplier = Number(mul) || 1;
      return speedMultiplier;
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    toggleSpeed: function() {
      if (speedMultiplier === 1) speedMultiplier = 3;
      else speedMultiplier = 1;
      return speedMultiplier;
    },

    setPaused: function(p) {
      isPaused = !!p;
      if (!isPaused) lastTime = 0;
    },

    isPaused: function() {
      return isPaused;
    },

    setMute: function(m) {
      isMute = !!m;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
      }
      return isMute;
    },

    isMute: function() {
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    reset: function() {
      lives99 = false;
      speedMultiplier = 1;
      Object.keys(rawButtons).forEach(k => rawButtons[k] = false);
      Object.keys(rawButtonsP2).forEach(k => rawButtonsP2[k] = false);
      startHoldFrames = 0;
      selectHoldFrames = 0;
      startHoldFramesP2 = 0;
      selectHoldFramesP2 = 0;
      const rom = (typeof window !== "undefined" && window.ROM_DATA) ? window.ROM_DATA : null;
      this.boot(rom);
      if (!isMute) activateAudio();
    },

    toggleMute: function() {
      return this.setMute(!isMute);
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    connectRecordingAudio: function() {
      activateAudio();
      if (!audioCtx) return null;
      try {
        if (!recDestNode && audioCtx.createMediaStreamDestination) {
          recDestNode = audioCtx.createMediaStreamDestination();
          if (audioScriptNode) {
            audioScriptNode.connect(recDestNode);
          }
        }
        if (recDestNode && recDestNode.stream) {
          const tracks = recDestNode.stream.getAudioTracks();
          if (tracks && tracks.length > 0) return tracks[0];
        }
      } catch (err) {
        console.warn("connectRecordingAudio error:", err);
      }
      return null;
    },

    audioDiag: function() {
      return {
        ok: !!(audioCtx && audioScriptNode),
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        primes: audioPrimes,
        writePtr: audioWritePtr,
        readPtr: audioReadPtr,
        isMute: isMute
      };
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
        if (lives99) syncLifePatch();
        return true;
      } catch (e) {
        console.error("loadState error:", e);
        return false;
      }
    },

    setLives99: function(enable) {
      const next = !!enable;
      if (!nes || !nes.cpu) {
        lives99 = next;
        return lives99;
      }
      if (next === lives99) return lives99;
      if (next) {
        const cur = nes.cpu.mem[0x0031];
        if (cur > 0 && cur < 90) stockLives = cur;
        lives99 = true;
        if (!syncLifePatch()) {
          lives99 = false;
          return false;
        }
        guardLives();
      } else {
        lives99 = false;
        syncLifePatch();
        const lives = nes.cpu.mem[0x0031];
        if (lives >= 90) nes.cpu.mem[0x0031] = stockLives;
      }
      return lives99;
    },

    setGuideNotes: function(enable) {
      return this.setLives99(enable);
    },

    isGuideNotes: function() {
      return lives99;
    },

    isLives99: function() {
      return lives99;
    },

    peek: function(addr) {
      if (!nes || !nes.cpu) return -1;
      return nes.cpu.mem[addr & 0xFFFF] & 0xFF;
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
