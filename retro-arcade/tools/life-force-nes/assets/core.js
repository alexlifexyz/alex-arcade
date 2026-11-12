// 沙罗曼蛇：生命力量 (Life Force USA NES) 核心适配器 (GGEMU_CORE for JSNES)
// 遵循 AGENTS.md 规范：
// 1. 标准两键大药丸掌机 (A 开火、B 升级)
// 2. 双层底栏标准契约 (reset + setMute/isMuted)
// 3. 59s 立体声录屏分流与四重硬件静音锁
// 4. 严禁内核私自监听底栏 DOM
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
  let cachedRomBinary = null;
  let isBooted = false;
  let isPaused = false;
  let isMute = false;
  let speedMultiplier = 1;

  // 无限命特权开关 (默认关闭保持原汁原味机台难度，支持双向随时开启/取消)
  let cheatActive = false;
  let savedLives = 2; // 原版 1P 默认 2 (3条命)

  // START / SELECT 8 帧按压防漏脉冲缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (Player 1)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 开火射击
    b: false,     // 胶囊升级 / 副武器
    select: false,
    start: false
  };

  // 2P 控制器状态跟踪 (双手柄独立)
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  const rawButtonsP2 = {
    up: false, down: false, left: false, right: false,
    a: false, b: false, ta: false, tb: false, jump: false,
    select: false, start: false
  };

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

  // Web Audio 与录屏音轨
  let audioCtx = null;
  let audioScriptNode = null;
  let audioMediaDest = null;
  let audioMasterGain = null;
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
      if (audioCtx.createGain) {
        audioMasterGain = audioCtx.createGain();
        audioMasterGain.gain.value = isMute ? 0 : 1.0;
        audioMasterGain.connect(audioCtx.destination);
      }

      if (audioCtx.createScriptProcessor) {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
      } else if (audioCtx.createJavaScriptNode) {
        audioScriptNode = audioCtx.createJavaScriptNode(2048, 0, 2);
      }
      if (audioScriptNode) {
        audioScriptNode.onaudioprocess = onAudioProcess;
        if (audioMasterGain) {
          audioScriptNode.connect(audioMasterGain);
        } else {
          audioScriptNode.connect(audioCtx.destination);
        }
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
    if (!pixelBuf || !offscreenCtx) return;
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xFF000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  let accumulator = 0;
  let lastTime = 0;

  function tick() {
    if (!isBooted || !nes || isPaused) return;

    if (startHoldFrames > 0) startHoldFrames--;
    if (selectHoldFrames > 0) selectHoldFrames--;

    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);

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
    setBtn(NES_BTN.a, rawButtons.a);
    setBtn(NES_BTN.b, rawButtons.b);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

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

    // 特权常驻守护：开启特权时持续锁定 99 命
    if (cheatActive && nes && nes.cpu && nes.cpu.mem) {
      if (nes.cpu.mem[0x0034] !== 99) nes.cpu.mem[0x0034] = 99;
      if (nes.cpu.mem[0x0035] !== 99) nes.cpu.mem[0x0035] = 99;
      if (nes.cpu.mem[0x06ED] > 0 && nes.cpu.mem[0x06ED] !== 99) nes.cpu.mem[0x06ED] = 99;
    }
  }

  function getNESClass() {
    const NESModule = (typeof window !== "undefined" && window.NES_MODULE) ? window.NES_MODULE :
                      ((typeof NES_MODULE !== "undefined") ? NES_MODULE : null);
    return NESModule ? (NESModule.default || NESModule.NES || NESModule) :
           ((typeof window !== "undefined" && window.jsnes && window.jsnes.NES) ? window.jsnes.NES : null);
  }

  function createNESInstance(NESClass) {
    return new NESClass({
      onFrame: renderVideoFrame,
      onAudioSample: handleAudioSample
    });
  }

  const coreInstance = {
    id: "life-force-nes",
    name: "沙罗曼蛇：生命力量",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "开火" }, // B 键主炮开火射击 (原版 FC 经典人机工效主拇指落点)
        { id: "a", key: "A", label: "升级" }  // A 键胶囊能量升级 (右上升级副按键)
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
        console.error("ROM_DATA 为空，无法启动生命力量");
        return;
      }

      const NESClass = getNESClass();
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      nes = createNESInstance(NESClass);

      try {
        cachedRomBinary = (typeof atob === "function") ? atob(romData) : (typeof Buffer !== "undefined" ? Buffer.from(romData, "base64").toString("binary") : null);
        nes.loadROM(cachedRomBinary);
      } catch (err) {
        console.error("ROM 加载失败:", err);
        return;
      }

      isBooted = true;

      // 步进穿透：25 帧秒开标题 + 8 帧 START 脉冲 + 140 帧直达第一关太空有机体战场，战机立即可控
      try {
        for (let f = 0; f < 25; f++) nes.frame();
        nes.buttonDown(1, NES_BTN.start);
        for (let f = 0; f < 8; f++) nes.frame();
        nes.buttonUp(1, NES_BTN.start);
        for (let f = 0; f < 140; f++) nes.frame();
      } catch (e) {
        console.warn("预热步进警告:", e);
      }

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }

      // 开机贴心操作指引
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        setTimeout(function() {
          const toast = document.getElementById("toast");
          if (toast) {
            toast.textContent = "战机已出击！十字键机动，B 键开火射击，A 键胶囊升级！";
            toast.classList.add("show");
            setTimeout(function() { toast.classList.remove("show"); }, 3200);
          }
        }, 300);
      }

      if (typeof localStorage !== "undefined") {
        isMute = localStorage.getItem("ggemu_mute") === "true";
      }
      if (audioMasterGain) {
        audioMasterGain.gain.value = isMute ? 0 : 1.0;
      }
    },

    reset: function() {
      if (!cachedRomBinary) {
        console.warn("无 ROM 缓存，无法重置");
        return;
      }
      const NESClass = getNESClass();
      if (!NESClass) return;

      nes = createNESInstance(NESClass);
      try {
        nes.loadROM(cachedRomBinary);
      } catch (e) {
        console.error("重置加载 ROM 失败:", e);
        return;
      }

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

      // 纯内存重置后同步步进穿透直达第一关实战
      try {
        for (let f = 0; f < 25; f++) nes.frame();
        nes.buttonDown(1, NES_BTN.start);
        for (let f = 0; f < 8; f++) nes.frame();
        nes.buttonUp(1, NES_BTN.start);
        for (let f = 0; f < 140; f++) nes.frame();
      } catch (e) {
        console.warn("重置步进警告:", e);
      }

      if (cheatActive) {
        applyRomCheatPatch(true);
        applyRamLives(true);
      }
    },

    tick: tick,

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
      if (audioMasterGain) {
        audioMasterGain.gain.value = isMute ? 0 : 1.0;
      }
      if (isMute) {
        audioRingL.fill(0);
        audioRingR.fill(0);
        audioReadPtr = audioWritePtr;
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
      }
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    isMute: function() {
      return isMute;
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
        const raw = JSON.stringify(nes.toJSON());
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.compressToUTF16 === "function") {
          return "LZ:" + window.LZString.compressToUTF16(raw);
        }
        return raw;
      } catch (e) {
        console.error("saveState error:", e);
        return null;
      }
    },

    loadState: function(stateData) {
      if (!nes || !stateData) return false;
      try {
        let jsonStr = stateData;
        if (typeof stateData === "string" && stateData.startsWith("LZ:")) {
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

    importState: function(data) {
      return this.loadState(data);
    },

    setCheat: function(active) {
      cheatActive = !!active;
      applyRomCheatPatch(cheatActive);
      applyRamLives(cheatActive);
      return cheatActive;
    },

    isCheat: function() {
      return cheatActive;
    },

    toggleCheat: function() {
      return this.setCheat(!cheatActive);
    }
  };

  // ROM 补丁与 RAM 锁命特权双保险机制
  // $c345 处的原指令为: DEC $34, X (0xD6 0x34)
  // 特权补丁替换为: BIT $34 (0x24 0x34)，死亡不减命
  function applyRomCheatPatch(enable) {
    if (!nes || !nes.rom || !nes.rom.rom) return;
    const lastBank = nes.rom.rom[nes.rom.rom.length - 1];
    if (!lastBank) return;
    const offset = 0xc345 - 0xc000;
    lastBank[offset] = enable ? 0x24 : 0xd6;
  }

  function applyRamLives(enable) {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    if (enable) {
      nes.cpu.mem[0x0034] = 99; // 1P 99命
      nes.cpu.mem[0x0035] = 99; // 2P 99命
      if (nes.cpu.mem[0x06ED] > 0) nes.cpu.mem[0x06ED] = 99;
    } else {
      nes.cpu.mem[0x0034] = 2;  // 恢复经典原版 2 命
      nes.cpu.mem[0x0035] = 2;
      if (nes.cpu.mem[0x06ED] > 0) nes.cpu.mem[0x06ED] = 2;
    }
  }

  // 绑定第二层独立特权按钮 (#btn-cheat)
  function bindCheatButton() {
    if (typeof document === "undefined") return;
    const btn = document.getElementById("btn-cheat");
    if (!btn) return;
    let touchHandled = 0;

    function showToast(text) {
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = text;
        toast.classList.add("show");
        setTimeout(function() { toast.classList.remove("show"); }, 2600);
      }
    }

    function handleToggle(e) {
      if (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
      }
      const active = coreInstance.toggleCheat();
      if (active) {
        btn.classList.add("is-active");
        btn.textContent = "无限命";
        showToast("已激活无限命特权：锁定 99 命 + 战机不坠毁！");
      } else {
        btn.classList.remove("is-active");
        btn.textContent = "特权";
        showToast("已关闭特权，恢复经典 2 命机台挑战！");
      }
    }

    btn.addEventListener("touchend", function(e) {
      touchHandled = Date.now();
      handleToggle(e);
    }, { passive: false });

    btn.addEventListener("click", function(e) {
      if (Date.now() - touchHandled < 400) return;
      handleToggle(e);
    });
  }

  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindCheatButton);
    } else {
      bindCheatButton();
    }
  }

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
