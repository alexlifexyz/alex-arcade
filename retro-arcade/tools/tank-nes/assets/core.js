// 坦克大战 1990 (Tank 1990 NES) 核心适配器 (GGEMU_CORE for JSNES)
// 遵循 AGENTS.md 规范：
// 1. 标准两键大药丸掌机 (A 开火、B 连射开火)
// 2. 双层底栏标准契约 (reset + setMute/isMuted + btn-guide 攻略弹窗)
// 3. 59s 立体声录屏分流与四重硬件静音锁
// 4. 严禁内核私自监听底栏 DOM
// 5. 结算与 Game Over 状态机智能穿透（杜绝卡死点不动）
// 6. 重装战备补给（满级三星碎铁重炮、战车编制常驻）
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
    if (offscreenCtx) {
      offscreenCtx.imageSmoothingEnabled = false;
    }
    imgData = offscreenCtx.createImageData(NES_W, NES_H);
    pixelBuf = new Uint32Array(imgData.data.buffer);
  }

  let nes = null;
  let cachedRomBinary = null;
  let isBooted = false;
  let isPaused = false;
  let isMute = false;
  let speedMultiplier = 1;
  let rapidFireCount = 0;

  // 攻略战备加护标志：默认关闭（保持原汁原味战役难度）
  let cheatActive = false;
  try {
    if (typeof localStorage !== "undefined") {
      cheatActive = localStorage.getItem("tank_cheat") === "true";
    }
  } catch (_) {}

  // START / SELECT 按压防漏脉冲缓冲（增至 16 帧确保 100% 轮询响应）
  let startHoldFrames = 0;
  let selectHoldFrames = 0;
  let startCooldownFrames = 0;
  let stageSelectStayFrames = 0;
  let prevTitleNav = false;

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 开火
    b: false,     // 连射开火
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
  let inTick = false;

  function tick() {
    if (!isBooted || !nes || isPaused || inTick) return;
    inTick = true;
    try {
      if (startCooldownFrames > 0) startCooldownFrames--;
      if (startHoldFrames > 0) {
        startHoldFrames--;
        if (startHoldFrames === 0) startCooldownFrames = 8;
      }
      if (selectHoldFrames > 0) selectHoldFrames--;

    // 1) 标题画面防崩溃守护与直觉按键支持（RAM 0x00 === 32）：
    //    - 锁定 0x0a/0x0d/0x0e 闲置倒计时，彻底根治标题画面停留 ~9.5 秒进入合卡演示模式触发 $3a 非法指令崩溃；
    //    - 标题画面按 W/S 或 上/下 方向键自动触发 SELECT 脉冲切换 1 PLAYER / 2 PLAYERS；
    //    - 标题画面按 J/K(A/B) 同样可触发 START 进关。
    // 2) 选关/结算画面（RAM 0x00 === 192）配合 8 帧低电平冷却窗，无论点按还是长按都能稳定产生 0->1 上升沿。
    try {
      if (nes.mmap && typeof nes.mmap.load === "function") {
        const state0 = nes.mmap.load(0x00);
        if (state0 === 32) {
          stageSelectStayFrames = 0;
          if (nes.mmap.load(0x01) === 255) {
            nes.mmap.write(0x0a, 0);
            nes.mmap.write(0x0b, 0);
          }

          const navDown = !!(rawButtons.up || rawButtons.down || rawButtonsP2.up || rawButtonsP2.down);
          if (navDown && !prevTitleNav && selectHoldFrames === 0) {
            selectHoldFrames = 6;
          }
          prevTitleNav = navDown;

          if ((rawButtons.a || rawButtons.b || rawButtonsP2.a || rawButtonsP2.b) && startHoldFrames === 0 && startCooldownFrames === 0) {
            startHoldFrames = 16;
          }
        } else {
          prevTitleNav = false;
        }

        if (state0 === 192) {
          stageSelectStayFrames++;
          const isRealBrowser = (typeof window !== "undefined" && typeof window.HTMLCanvasElement !== "undefined");
          const autoStageConfirm = isRealBrowser && nes.mmap.load(0x01) === 255 && stageSelectStayFrames === 36;
          const userInteracted = rawButtons.a || rawButtons.b || rawButtons.up || rawButtons.down || rawButtons.left || rawButtons.right || rawButtons.start ||
                                 rawButtonsP2.a || rawButtonsP2.b || rawButtonsP2.start;
          if ((userInteracted || autoStageConfirm) && startHoldFrames === 0 && startCooldownFrames === 0) {
            startHoldFrames = 16;
          }
        } else {
          stageSelectStayFrames = 0;
        }

        // 攻略战备常驻守护：开启重装战备补给后，出战即满级三星碎铁重炮，且战车编制常驻
        if (cheatActive) {
          // 1P 坦克等级（0xA8）：3 为手枪三星满级重炮（双发连射+破铁碎砖）
          const p1Level = nes.mmap.load(0xA8);
          if (p1Level < 3) {
            nes.mmap.write(0xA8, 3);
          }
          // 1P 剩余生命（0x51）：战斗中生命常驻保持 >= 8
          const p1Lives = nes.mmap.load(0x51);
          if (p1Lives < 8 && p1Lives > 0) {
            nes.mmap.write(0x51, 8);
          }
          // 2P 坦克等级（0xA9）与剩余生命（0x52）
          const p2Level = nes.mmap.load(0xA9);
          if (p2Level < 3) {
            nes.mmap.write(0xA9, 3);
          }
          const p2Lives = nes.mmap.load(0x52);
          if (p2Lives < 8 && p2Lives > 0) {
            nes.mmap.write(0x52, 8);
          }
        }
      }
    } catch (_) {}

    const effectiveStart = (startCooldownFrames > 0) ? false : (rawButtons.start || (startHoldFrames > 0));
    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);

    // 连发逻辑：B 键按住时以 4 帧周期高速连发，A 键为单发点射
    rapidFireCount++;
    const isRapid = rawButtons.b && (rapidFireCount % 4 < 2);
    const fireA = rawButtons.a || isRapid;

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
    setBtn(NES_BTN.a, fireA);
    setBtn(NES_BTN.b, false); // 严格保持 B 硬件断开，杜绝与 A 键同时激活产生平行双发
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 2P 独立按键状态与连发逻辑
    if (startHoldFramesP2 > 0) startHoldFramesP2--;
    if (selectHoldFramesP2 > 0) selectHoldFramesP2--;
    const effectiveStartP2 = rawButtonsP2.start || (startHoldFramesP2 > 0);
    const effectiveSelectP2 = rawButtonsP2.select || (selectHoldFramesP2 > 0);
    const isRapidP2 = (rawButtonsP2.b || rawButtonsP2.tb) && (rapidFireCount % 4 < 2);
    const fireAP2 = rawButtonsP2.a || rawButtonsP2.ta || isRapidP2;

    const setBtn2 = (btnIndex, isDown) => {
      if (isDown) {
        nes.buttonDown(2, btnIndex);
      } else {
        nes.buttonUp(2, btnIndex);
      }
    };

    setBtn2(NES_BTN.up, rawButtonsP2.up);
    setBtn2(NES_BTN.down, rawButtonsP2.down);
    setBtn2(NES_BTN.left, rawButtonsP2.left);
    setBtn2(NES_BTN.right, rawButtonsP2.right);
    setBtn2(NES_BTN.a, fireAP2);
    setBtn2(NES_BTN.b, false);
    setBtn2(NES_BTN.start, effectiveStartP2);
    setBtn2(NES_BTN.select, effectiveSelectP2);

    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (lastTime === 0) lastTime = now;
    const dt = Math.min(now - lastTime, 250) * speedMultiplier;
    lastTime = now;
    accumulator += dt;

    const maxSteps = 4 * speedMultiplier;
    let steps = 0;
    while (accumulator >= FRAME_MS && steps < maxSteps) {
      try {
        nes.frame();
      } catch (err) {
        console.warn("nes.frame 异常守护:", err);
        if (nes && nes.crashed && typeof coreInstance.reset === "function") {
          try { coreInstance.reset(); } catch (_) {}
        }
        break;
      }
      accumulator -= FRAME_MS;
      steps++;
    }
  } finally {
    inTick = false;
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

  function setupGuide() {
    if (typeof document === "undefined") return;
    const btnGuide = document.getElementById("btn-guide");
    const guideModal = document.getElementById("guide-modal");
    const guideClose = document.getElementById("guide-close");
    const btnGuideOn = document.getElementById("btn-guide-on");
    const btnGuideOff = document.getElementById("btn-guide-off");

    function showToast(msg) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => { toast.classList.remove("show"); }, 2000);
    }

    if (btnGuide && guideModal) {
      btnGuide.addEventListener("click", function() {
        guideModal.style.display = "flex";
      });
    }

    if (guideClose && guideModal) {
      guideClose.addEventListener("click", function() {
        guideModal.style.display = "none";
      });
    }

    if (guideModal) {
      guideModal.addEventListener("click", function(e) {
        if (e.target === guideModal) {
          guideModal.style.display = "none";
        }
      });
    }

    if (btnGuideOn) {
      btnGuideOn.addEventListener("click", function() {
        const xhs = window.xhs && window.xhs.miniTool;
        const enableSupply = function() {
          cheatActive = true;
          try {
            if (typeof localStorage !== "undefined") {
              localStorage.setItem("tank_cheat", "true");
            }
          } catch (_) {}
          showToast("已开启重装战备补给");
          if (guideModal) guideModal.style.display = "none";
        };

        if (xhs && typeof xhs.followAuthor === "function") {
          Promise.resolve(xhs.followAuthor()).then(enableSupply, enableSupply);
        } else {
          enableSupply();
        }
      });
    }

    if (btnGuideOff) {
      btnGuideOff.addEventListener("click", function() {
        cheatActive = false;
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("tank_cheat", "false");
          }
        } catch (_) {}
        showToast("已恢复原版战役难度");
        if (guideModal) guideModal.style.display = "none";
      });
    }
  }

  const coreInstance = {
    id: "tank-nes",
    name: "坦克大战 1990",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "B", sub: "连射" }, // B 连射开火
        { id: "a", key: "A", label: "A", sub: "单发" }  // A 单发开火
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
        console.error("ROM_DATA 为空，无法启动坦克大战 1990");
        return;
      }

      const NESClass = getNESClass();
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      nes = createNESInstance(NESClass);

      try {
        cachedRomBinary = (typeof atob === "function") ? atob(romData) : Buffer.from(romData, "base64").toString("binary");
        nes.loadROM(cachedRomBinary);
      } catch (err) {
        console.error("ROM 加载失败:", err);
        return;
      }

      isBooted = true;

      // 预热步进：先跑 60 帧进入变种选单，按 7 次 UP 从魔改 Tank H 切换至正统经典 Tank A
      try {
        for (let f = 0; f < 60; f++) nes.frame();
        for (let i = 0; i < 7; i++) {
          nes.buttonDown(1, NES_BTN.up);
          for (let f = 0; f < 16; f++) nes.frame();
          nes.buttonUp(1, NES_BTN.up);
          for (let f = 0; f < 16; f++) nes.frame();
        }
        // 按 START 确认 Tank A 变种
        nes.buttonDown(1, NES_BTN.start);
        for (let f = 0; f < 8; f++) nes.frame();
        nes.buttonUp(1, NES_BTN.start);
        // 跑 270 帧拉起卷帘，直出 TANK 1990 全彩大标题
        for (let f = 0; f < 270; f++) nes.frame();
      } catch (e) {
        console.warn("预热步进警告:", e);
      }

      setupGuide();

      if (host && typeof host.onReady === "function") {
        host.onReady();
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

      // 秒开大标题预热：60 帧 + 7 次 UP 切换至 Tank A + START 确认 + 270 帧拉帘
      for (let f = 0; f < 60; f++) nes.frame();
      for (let i = 0; i < 7; i++) {
        nes.buttonDown(1, NES_BTN.up);
        for (let f = 0; f < 16; f++) nes.frame();
        nes.buttonUp(1, NES_BTN.up);
        for (let f = 0; f < 16; f++) nes.frame();
      }
      nes.buttonDown(1, NES_BTN.start);
      for (let f = 0; f < 8; f++) nes.frame();
      nes.buttonUp(1, NES_BTN.start);
      for (let f = 0; f < 270; f++) nes.frame();
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
          if (isP2) startHoldFramesP2 = 16;
          else {
            try { startHoldFrames = 16; } catch(_) {}
          }
        }
      } else if (b === "select") {
        target.select = !!pressed;
        if (pressed) {
          if (isP2) selectHoldFramesP2 = 16;
          else {
            try { selectHoldFrames = 16; } catch(_) {}
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

    getNES: function() {
      return nes;
    },

    getCheatActive: function() {
      return cheatActive;
    },

    setCheat: function(active) {
      cheatActive = !!active;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("tank_cheat", cheatActive ? "true" : "false");
        }
      } catch (_) {}
      return cheatActive;
    },

    toggleCheat: function() {
      return this.setCheat(!cheatActive);
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
    }
  };

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
