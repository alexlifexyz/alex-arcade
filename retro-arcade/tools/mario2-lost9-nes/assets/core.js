// Mario 2 (The Lost Levels) NES Core Adapter (GGEMU_CORE for JSNES)
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
  let infiniteLivesEnabled = false;
  let infiniteJumpEnabled = false;

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    dash_jump: false,
    ta: false,
    select: false,
    start: false
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

  // 音频系统 (44100Hz 双声道环形缓冲区 + 线性重采样)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioPrimes = 0;
  let isMuted = false;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    if (isMuted) {
      outL.fill(0);
      outR.fill(0);
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
      } catch (e) {}
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

  ["touchstart", "touchend", "click", "keydown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      initAudioContext();
    }, { capture: true, passive: true });
  });

  // 键盘映射
  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    KeyJ: "b",         // B 奔跑/火球
    KeyK: "a",         // A 跳跃
    KeyU: "dash_jump", // X 冲刺大跳宏
    KeyI: "ta",        // Y 连跳
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

  // 动作键定义（右侧 4 键钻石布局）
  const ACTIONS = [
    { id: "b", label: "奔跑/火球", key: "B" },
    { id: "a", label: "跳跃", key: "A" }
  ];

  window.GGEMU_CORE = {
    id: "mario2-lost9-nes",
    name: "超级马力欧：失落第九关",
    jumpToWorld9: jumpToWorld9,
    pad: {
      stick: false,
      layout: "two-button",
      actions: ACTIONS,
      geom: { rf: 0.75, sx: 1.6, sy: 1.3, dy: 0, hit: 18 },
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

        const rawBin = atob(romBase64 || window.MARIO2_ROM_BASE64 || window.ROM_DATA || "");
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热步进：先跑 60 帧度过开机淡入，然后模拟按 START 16 帧进入关卡，再跑 120 帧直达 1-1 地面
        try {
          for (let f = 0; f < 60; f++) nes.frame();
          nes.buttonDown(1, NES_BTN.start);
          for (let f = 0; f < 16; f++) nes.frame();
          nes.buttonUp(1, NES_BTN.start);
          for (let f = 0; f < 120; f++) nes.frame();
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }
        audioReadPtr = audioWritePtr;

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("Mario 2 boot failed:", err);
        if (host && typeof host.toast === "function") {
          host.toast("游戏启动失败：" + err.message);
        }
      }
    },

    tick: function() {
      if (!isBooted || isPaused) return;
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

        // 若处于标题等待状态且玩家按键，智能代按 START 进关
        if (nes.cpu && nes.cpu.mem && nes.cpu.mem[0x0770] === 0 && (rawButtons.a || rawButtons.b)) {
          setBtn(NES_BTN.start, true);
        }

        // A 判定 (跳跃)
        setBtn(NES_BTN.a, !!rawButtons.a);

        // B 判定 (奔跑/火球)
        setBtn(NES_BTN.b, !!rawButtons.b);
      }

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        applyGuideNotes();
        nes.frame();
        handlePhysicsAndJump();
        fpsFrames++;
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }

      if (now - lastFpsTime >= 1000) {
        window.__mario2Fps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
        fpsFrames = 0;
        lastFpsTime = now;
      }
    },

    setButton: function(btnId, isPressed) {
      const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      if (rawButtons.hasOwnProperty(norm)) {
        rawButtons[norm] = !!isPressed;
      }
      if (nes) {
        const btnIndex = NES_BTN[norm];
        if (btnIndex !== undefined) {
          if (isPressed) {
            nes.buttonDown(1, btnIndex);
          } else {
            nes.buttonUp(1, btnIndex);
          }
        }
      }
    },

    setPaused: function(paused) {
      isPaused = !!paused;
    },

    isPaused: function() {
      return isPaused;
    },

    setSpeed: function(mul) {
      speedMultiplier = mul || 1;
    },

    setSpeedMultiplier: function(mul) {
      speedMultiplier = mul || 1;
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    setMute: function(muted) {
      isMuted = !!muted;
      if (isMuted) {
        audioReadPtr = audioWritePtr;
      }
    },

    setMuted: function(muted) {
      isMuted = !!muted;
      if (isMuted) {
        audioReadPtr = audioWritePtr;
      }
    },

    isMuted: function() {
      return isMuted;
    },

    cheatInfiniteLives: function() {
      infiniteLivesEnabled = false;
      return false;
    },

    isInfiniteLives: function() {
      return infiniteLivesEnabled;
    },

    cheatInfiniteJump: function() {
      infiniteJumpEnabled = false;
      return false;
    },

    isInfiniteJump: function() {
      return infiniteJumpEnabled;
    },

    cheatFireMario: function() {
    },

    saveState: function() {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function(state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
    },

    reset: function() {
      if (!nes) return;
      try {
        nes.reloadROM();
        // 预热步进：先跑 60 帧度过开机淡入，然后模拟按 START 16 帧进入关卡，再跑 120 帧直达 1-1 地面
        for (let f = 0; f < 60; f++) nes.frame();
        nes.buttonDown(1, NES_BTN.start);
        for (let f = 0; f < 16; f++) nes.frame();
        nes.buttonUp(1, NES_BTN.start);
        for (let f = 0; f < 120; f++) nes.frame();
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("Mario2 reset fail:", e);
      }
    },

    activateAudio: initAudioContext,

    resumeAudio: function() {
      if (audioCtx && audioCtx.state !== "running") {
        audioCtx.resume().catch(() => {});
      }
    },

    connectRecordingAudio: function() {
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

    audioDiag: function() {
      return {
        audio: audioCtx ? audioCtx.state : "none",
        audioRate: audioCtx ? audioCtx.sampleRate : 0,
        audioNode: !!audioScriptNode
      };
    },

    exportState: function() {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "mario2-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function(raw) {
      if (!nes) throw new Error("游戏未运行");
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (obj && obj.sys && obj.sys !== "mario2-nes") {
        throw new Error("存档与当前游戏不匹配");
      }
      nes.fromJSON(obj.state || obj);
    }
  };

  window.__marioDebug = {
    nes: () => nes
  };

  let lastTime = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let lastFpsTime = 0;

  let greenMushroomGuard = false;
  let fireFlowerGuard = false;

  let stageCleared = false;
  let clearedArea = 0;

  function applyGuideNotes() {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    const mem = nes.cpu.mem;

    // 突破第九世界 9-1 官方原地循环限制：通关旗杆后自动平滑推进至 9-2、9-3、9-4
    if (mem[0x075F] === 8) {
      const playerState = mem[0x000E];
      // 触碰旗杆滑下或走入城堡时，标记通关
      if (playerState >= 3 && playerState <= 5) {
        if (!stageCleared) {
          stageCleared = true;
          clearedArea = mem[0x075C];
        }
      }

      // 当关卡结算结束，屏幕切入重载新关卡时 (OperMode_Task === 0)
      if (stageCleared && mem[0x0772] === 0) {
        stageCleared = false;
        if (clearedArea < 3) {
          const nextArea = clearedArea + 1;
          mem[0x075F] = 8;
          mem[0x075C] = nextArea;
          mem[0x0760] = nextArea;
          mem[0x0746] = 0;
          mem[0x075A] = 9;
          toast("过关！顺利进入 9-" + (nextArea + 1) + "！");
        } else {
          toast("恭喜！第九世界四大水下关卡全部通关！");
        }
      }
    }

    if (mem[0x0770] !== 1) return;
    if (greenMushroomGuard) {
      if (mem[0x075A] < 9) mem[0x075A] = 9; // 绿蘑菇守护：始终保持充盈生命，绝不 Game Over
    }
    if (fireFlowerGuard) {
      if (mem[0x0756] < 2) mem[0x0756] = 2; // 火焰花常驻
      mem[0x0754] = 0;
    }
  }

  function handlePhysicsAndJump() {
    if (!infiniteJumpEnabled) return;
  }

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      const p = buffer[i];
      const r = (p >> 16) & 0xff;
      const g = (p >> 8) & 0xff;
      const b = p & 0xff;
      pixelBuf[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > 8000) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function() { t.className = "toast"; }, 1800);
  }

  function jumpToWorld9(subLevel) {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    greenMushroomGuard = true;
    fireFlowerGuard = true;
    stageCleared = false;
    const mem = nes.cpu.mem;
    const targetArea = (typeof subLevel === "number" && subLevel >= 0 && subLevel <= 3) ? subLevel : 0;
    mem[0x075F] = 8; // World 9 (0-indexed: 8 是 World 9)
    mem[0x075C] = targetArea; // 0: 9-1, 1: 9-2, 2: 9-3, 3: 9-4
    mem[0x0760] = targetArea;
    mem[0x0746] = 0; // 检查点重置
    mem[0x075A] = 9; // 绿蘑菇守护：始终保持充盈生命
    mem[0x0756] = 2; // 火焰花形态
    mem[0x0770] = 1; // Game mode
    mem[0x0772] = 0; // 立即触发关卡初始化例程
    mem[0x0710] = 2; // ScreenRoutineTask = 2
    mem[0x0712] = 1; // ChangeAreaTimer = 1 瞬发切关，下一帧立刻重新加载关卡
    const names = ["9-1 奇幻水下平原", "9-2 深海水下大探索", "9-3 奇幻悬崖跳跃", "9-4 水下最终决战城堡"];
    toast("已成功进入 " + names[targetArea] + "！");
    var modal = document.getElementById("guide-modal");
    if (modal) modal.style.display = "none";
  }

  function bindGuide() {
    var modal = document.getElementById("guide-modal");
    var openBtn = document.getElementById("btn-guide");
    var closeBtn = document.getElementById("guide-close");
    var jumpBtn91 = document.getElementById("btn-jump-world9-1");
    var jumpBtn92 = document.getElementById("btn-jump-world9-2");
    var jumpBtn93 = document.getElementById("btn-jump-world9-3");
    var jumpBtn94 = document.getElementById("btn-jump-world9-4");
    var jumpBtnLegacy = document.getElementById("btn-jump-world9");
    var onBtn = document.getElementById("btn-guard-on");
    var offBtn = document.getElementById("btn-guard-off");

    if (openBtn && modal) {
      function openModal(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        modal.style.display = "flex";
      }
      openBtn.addEventListener("click", openModal);
      openBtn.addEventListener("touchend", openModal);
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener("click", function(ev) {
        if (ev) ev.stopPropagation();
        modal.style.display = "none";
      });
    }
    if (modal) {
      modal.addEventListener("click", function(ev) {
        if (ev.target === modal) modal.style.display = "none";
      });
    }

    function bindSubJump(btn, idx) {
      if (!btn) return;
      btn.addEventListener("click", function(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        jumpToWorld9(idx);
      });
      btn.addEventListener("touchend", function(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        jumpToWorld9(idx);
      });
    }
    bindSubJump(jumpBtn91, 0);
    bindSubJump(jumpBtn92, 1);
    bindSubJump(jumpBtn93, 2);
    bindSubJump(jumpBtn94, 3);
    bindSubJump(jumpBtnLegacy, 0);
    if (onBtn) {
      function doOn(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        greenMushroomGuard = true;
        fireFlowerGuard = true;
        if (nes && nes.cpu && nes.cpu.mem) {
          nes.cpu.mem[0x075A] = 9;
          nes.cpu.mem[0x0756] = 2;
        }
        toast("绿蘑菇加护已开启");
        if (modal) modal.style.display = "none";
      }
      onBtn.addEventListener("click", doOn);
      onBtn.addEventListener("touchend", doOn);
    }
    if (offBtn) {
      function doOff(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        greenMushroomGuard = false;
        fireFlowerGuard = false;
        toast("已回到原版机台难度");
        if (modal) modal.style.display = "none";
      }
      offBtn.addEventListener("click", doOff);
      offBtn.addEventListener("touchend", doOff);
    }
  }

  bindGuide();
})();
