// Contra NES Core Adapter (GGEMU_CORE for JSNES)
(function() {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;
  const FPS = 60;
  const FRAME_MS = 1000 / FPS;

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = NES_W;
  offscreenCanvas.height = NES_H;
  const offscreenCtx = offscreenCanvas.getContext("2d", { alpha: false });
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let speedMultiplier = 1;
  let turboTick = 0;
  let infiniteLivesEnabled = true; // 默认开启 100 条命特权守护！开局即享 100 命畅爽割草

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    tb: false, // Turbo B
    ta: false, // Turbo A
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

  // 音频系统 (44100Hz 双声道环形缓冲区)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioCallbacks = 0;
  let audioPrimes = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
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

    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (audioCtx && audioCtx.state === "running" && !audioScriptNode) {
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

  ["touchend", "click", "keydown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      initAudioContext();
    }, { capture: true, passive: true });
  });

  // 主循环时钟
  let lastTime = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let lastFpsTime = 0;

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > 8000) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  // 键盘映射（支持桌面电脑测试与外接键盘）
  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    KeyJ: "b",       // B 开火
    KeyK: "a",       // A 跳跃
    KeyU: "tb",      // Turbo B
    KeyI: "ta",      // Turbo A
    ShiftLeft: "select",
    ShiftRight: "select",
    Enter: "start"
  };

  window.addEventListener("keydown", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) {
      rawButtons[btn] = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) {
      rawButtons[btn] = false;
      e.preventDefault();
    }
  });

  // 胶囊功能键定义
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义（右侧 4 键钻石排列：开火、跳跃、连发、连跳）
  // 遵循 SNES / FC 掌机人体工学：Y为开火，B为跳跃，X为连发，A为连跳
  const ACTIONS = [
    { id: "b", label: "开火", key: "Y" },
    { id: "a", label: "跳跃", key: "B" },
    { id: "tb", label: "连发", key: "X" },
    { id: "ta", label: "连跳", key: "A" }
  ];

  window.GGEMU_CORE = {
    id: "contra-nes",
    name: "魂斗罗初代",
    pad: {
      stick: true,
      layout: "diamond",
      actions: ACTIONS,
      // 放大右侧菱形四键尺寸（按键半径与底盘体量与左侧方向键1:1均衡对齐，相邻间距保持清晰舒展）
      geom: { rf: 0.68, dd: 1.63, hit: 10 },
      capsules: CAPSULES
    },

    video: function() {
      return { w: NES_W, h: NES_H };
    },

    source: function() {
      return offscreenCanvas;
    },

    boot: function(romBase64, host) {
      try {
        initAudioContext();
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          sampleRate: 44100
        });

        // 将 Base64 解码为二进制字符串
        const rawBin = atob(romBase64 || window.CONTRA_ROM_BASE64 || "");
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热步进 160 帧，直接跳过复位黑屏，让魂斗罗标题画面就绪
        try {
          for (let f = 0; f < 160; f++) {
            nes.frame();
          }
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("Contra boot failed:", err);
        if (host && typeof host.toast === "function") {
          host.toast("游戏启动失败：" + err.message);
        }
      }
    },

    tick: function() {
      if (!isBooted || isPaused) return;
      // 在移动端退到后台时节省算力，但无头测试与自动化截屏时保障步进
      const isHeadless = navigator.webdriver || !window.chrome || /HeadlessChrome/.test(navigator.userAgent);
      if (document.hidden && !isHeadless) {
        lastTime = 0;
        accumulator = 0;
        return;
      }

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        lastFpsTime = now;
        return;
      }

      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTick++;

      // 同步控制器按键状态给 NES
      if (nes) {
        const setBtn = (btnIndex, isDown) => {
          if (isDown) {
            nes.buttonDown(1, btnIndex);
          } else {
            nes.buttonUp(1, btnIndex);
          }
        };

        // D-Pad
        setBtn(NES_BTN.up, rawButtons.up);
        setBtn(NES_BTN.down, rawButtons.down);
        setBtn(NES_BTN.left, rawButtons.left);
        setBtn(NES_BTN.right, rawButtons.right);

        // Select & Start
        setBtn(NES_BTN.select, rawButtons.select);
        setBtn(NES_BTN.start, rawButtons.start);

        // A 与 Turbo A（高频自动跳跃）
        const isADown = rawButtons.a || (rawButtons.ta && (turboTick % 4 < 2));
        setBtn(NES_BTN.a, isADown);

        // B 与 Turbo B（高频自动秒速开火）
        const isBDown = rawButtons.b || (rawButtons.tb && (turboTick % 4 < 2));
        setBtn(NES_BTN.b, isBDown);

        // 100 条生命特权守护 (当进入关卡或死亡复活时，自动维持 99 剩余生命，即总共 100 命)
        if (infiniteLivesEnabled && nes.cpu && nes.cpu.mem) {
          if (nes.cpu.mem[0x0032] < 90) {
            nes.cpu.mem[0x0032] = 99;
          }
        }
      }

      // 执行物理帧步进
      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        nes.frame();
        fpsFrames++;
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }

      if (now - lastFpsTime >= 1000) {
        window.__contraFps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
        fpsFrames = 0;
        lastFpsTime = now;
      }
    },

    setButton: function(name, isDown) {
      if (rawButtons.hasOwnProperty(name)) {
        rawButtons[name] = !!isDown;
      }
    },

    activateAudio: initAudioContext,

    resumeAudio: function() {
      if (audioCtx && audioCtx.state !== "running") {
        audioCtx.resume().catch(() => {});
      }
    },

    setSpeed: function(speed) {
      speedMultiplier = Math.max(1, speed || 1);
    },

    exportState: function() {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "contra-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function(stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj.sys !== "contra-nes" || !obj.state) {
        throw new Error("存档格式不兼容");
      }
      nes.fromJSON(obj.state);
    },

    // 经典魂斗罗特权作弊
    cheat100Lives: function(enable) {
      infiniteLivesEnabled = (enable !== false);
      if (nes && nes.cpu && nes.cpu.mem) {
        nes.cpu.mem[0x0032] = infiniteLivesEnabled ? 99 : 2;
      }
      return infiniteLivesEnabled;
    },

    cheat30Lives: function() {
      if (!nes || !nes.cpu || !nes.cpu.mem) return false;
      // 魂斗罗 NES 1P 生命数地址：$0032
      // 设为 29 实际对应 30 条命
      nes.cpu.mem[0x0032] = 29;
      return true;
    },

    cheatWeapon: function(type) {
      if (!nes || !nes.cpu || !nes.cpu.mem) return false;
      // $00AA: 0=普通, 1=机枪M, 2=激光L, 3=散弹S, 4=火球F
      const weaponMap = { m: 1, l: 2, s: 3, f: 4 };
      const val = weaponMap[type] || 3;
      nes.cpu.mem[0x00AA] = val;
      return true;
    },

    cheatInvincible: function() {
      if (!nes || !nes.cpu || !nes.cpu.mem) return false;
      // $00B0: 无敌闪烁倒计时
      nes.cpu.mem[0x00B0] = 0xff;
      return true;
    },

    connectRecordingAudio: function() {
      if (!audioCtx || !audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks.length ? tracks[0] : null;
      } catch (_) {
        return null;
      }
    }
  };

  // 扩展全局调试与秘籍联动对象
  window.__contraDebug = {
    nes: () => nes,
    cheat100Lives: (enable) => window.GGEMU_CORE.cheat100Lives(enable),
    cheat30Lives: () => window.GGEMU_CORE.cheat30Lives(),
    cheatSpreadGun: () => window.GGEMU_CORE.cheatWeapon("s"),
    cheatInvincible: () => window.GGEMU_CORE.cheatInvincible()
  };

  window.__contraCheat = {
    setLives: (n) => (n >= 100 ? window.GGEMU_CORE.cheat100Lives(true) : window.GGEMU_CORE.cheat30Lives()),
    setWeapon: (w) => window.GGEMU_CORE.cheatWeapon(w ? w.toLowerCase() : "s"),
    diag: () => ({
      lives: nes && nes.cpu && nes.cpu.mem ? nes.cpu.mem[0x0032] : null,
      weapon: nes && nes.cpu && nes.cpu.mem ? nes.cpu.mem[0x00AA] : null,
      infiniteLives: infiniteLivesEnabled
    })
  };
})();
