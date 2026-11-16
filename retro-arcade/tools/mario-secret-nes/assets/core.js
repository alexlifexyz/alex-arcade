// Mario NES Core Adapter (GGEMU_CORE for JSNES)
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
  let starGuard = false;
  let fireFlower = false;
  let lightJump = false;
  let prevPlayerState = 0;
  // 水下秘境状态：开机即入 World -1，关卡数据换成真正的水下关（ROM 数据层换关）
  let secretMode = false;
  let endingShown = false;
  let secretNotify = null;
  let romSourceBase64 = "";
  let rawOrigBase64 = "";      // 未经补丁的原始 ROM，原地重建时用它重走一遍开机
  let pendingTourReg = null;   // 地址栏写不进去时的备用站点（容器可能锁住 location）

  // ROM 补丁：不改地形表结构，只拨两根「指针」，让引擎自己按原生流程加载水下关卡
  // 0x1CCC = $9CBC  World1Areas[0]，1-1 的 AreaPointer：0x25(地面) -> 0x01(7-2 的水下区域)
  // 0x1CE8 = $9CD8  世界号 36 越界读 WorldAddrOffsets 落到的字节：0x29 -> 0x07（指向同一份水下数据）
  const PATCH_SEED_AREA = 0x1ccc;
  const PATCH_W36_CHAIN = 0x1ce8;
  const SECRET_AREA_POINTER = 0x01;
  const W36_CHAIN_OFFSET = 0x07;

  // 秘境巡游：世界号越过 8 之后，引擎按 $9CB4(WorldAddrOffsets)[世界号] + 面号
  // 去 $9CBC(AreaAddrOffsets) 取「这块区域是哪一面」，越界读出来的字节全是表外的垃圾，
  // 于是长出一批配色/地形错配的坏关卡。这里按同样的算法把同一份数据算出来。
  const WORLD_ADDR_TABLE = 0x1cc4;
  const AREA_ADDR_TABLE = 0x1ccc;
  const TOUR_FIRST_WORLD = 9;
  const TOUR_LAST_WORLD = 255;

  // 巡游站点：把 82 个不同的越界指针逐个跑过一遍，能正常显示又配色离谱的那一批。
  // 每项 = [世界号, 面号, 关卡指针]。世界号与面号就是画面上状态栏写的那个真号。
  const TOUR_STOPS = [
    [11, 0, 0xa9],
    [12, 1, 0xaa],
    [12, 2, 0xb3],
    [14, 3, 0x37],
    [16, 0, 0x01],
    [16, 1, 0x1f],
    [16, 2, 0x3c],
    [19, 2, 0x05],
    [19, 3, 0x33],
    [21, 0, 0x2c],
    [21, 2, 0x2a],
    [21, 3, 0x31],
    [23, 2, 0x8a],
    [23, 3, 0x19],
    [28, 1, 0x9b],
    [30, 0, 0x0a],
    [30, 2, 0x59],
    [33, 3, 0xac],
    [34, 1, 0x1d],
    [34, 2, 0x36],
    [34, 3, 0x9d]
  ];


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
  const holdBuffer = { start: 0, select: 0 };

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

  // 手机 WebView 静音开关默认吃掉普通网页声。要在创建上下文前把会话设成 playback。
  // 扬声器必须马上接上。等 state 变成 running 再接，小红书里会一直停在 suspended，整段没声。
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioCallbacks = 0;
  let audioSamples = 0;
  let audioPeak = 0;
  let isMuted = false;
  // 重建 NES 期间的临时静音：避免把旧关卡/预跑阶段的采样当成声音吐出来（真机上表现为“嘟嘟嘟”）。
  let audioSilenceUntil = 0;
  let audioFadeUntil = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    let tapAcc = window.__audioTap ? 0 : null;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    if (isMuted) {
      outL.fill(0);
      outR.fill(0);
      return;
    }
    const nowMs = (window.performance && performance.now) ? performance.now() : Date.now();
    if (nowMs < audioSilenceUntil) {
      outL.fill(0);
      outR.fill(0);
      audioReadPtr = audioWritePtr;
      return;
    }
    const fadeSpan = audioFadeUntil - audioSilenceUntil;
    const fadeGain = (nowMs < audioFadeUntil && fadeSpan > 0)
      ? Math.max(0, Math.min(1, (nowMs - audioSilenceUntil) / fadeSpan))
      : 1;
    const rate = audioCtx && audioCtx.sampleRate ? audioCtx.sampleRate : 44100;
    const ratio = 44100 / rate;

    for (let i = 0; i < outL.length; i++) {
      if (audioAvailable() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const r = Math.floor(audioReadPtr);
      const frac = audioReadPtr - r;
      const nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      const left = sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac;
      const right = sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac;
      outL[i] = left * fadeGain;
      outR[i] = right * fadeGain;
      if (tapAcc !== null) tapAcc += outL[i] * outL[i];
      if (left > audioPeak) audioPeak = left;
      if (-left > audioPeak) audioPeak = -left;
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
      }
    }
    if (tapAcc !== null) {
      const t = (window.performance && performance.now) ? performance.now() : Date.now();
      window.__audioTap.push([Math.round(t), Math.round(Math.sqrt(tapAcc / outL.length) * 1000)]);
      if (window.__audioTap.length > 400) window.__audioTap.shift();
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
        try {
          audioCtx = new AC({ sampleRate: 44100 });
        } catch (_) {
          audioCtx = new AC();
        }
      } catch (_) {
        audioCtx = null;
        return;
      }
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().catch(function() {});
    }
  }

  ["touchend", "click", "keydown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      initAudioContext();
    }, { capture: true, passive: true });
  });

  // 多维全兼容键盘映射解析（数字 keyCode + 字符 key + 物理 code 三重兜底，彻底解决移动端蓝牙键盘 e.code 缺失与输入法拦截）
  function resolveKeyAction(e) {
    const codeNum = e.keyCode || e.which;
    const KEYCODE_MAP = {
      87: "up",         // W
      38: "up",         // ↑
      83: "down",       // S
      40: "down",       // ↓
      65: "left",       // A
      37: "left",       // ←
      68: "right",      // D
      39: "right",      // →
      74: "b",          // J 奔跑/火球
      75: "a",          // K 跳跃
      32: "a",          // Space 空格跳跃
      13: "start",      // Enter 回车开始/暂停
      16: "select",     // Shift 选择
      85: "dash_jump",  // U 冲刺大跳
      73: "ta"          // I 连跳
    };
    if (codeNum && KEYCODE_MAP[codeNum]) return KEYCODE_MAP[codeNum];

    const keyStr = (e.key || "").toLowerCase();
    const KEYSTR_MAP = {
      w: "up", arrowup: "up",
      s: "down", arrowdown: "down",
      a: "left", arrowleft: "left",
      d: "right", arrowright: "right",
      j: "b", k: "a", " ": "a", spacebar: "a",
      enter: "start", shift: "select",
      u: "dash_jump", i: "ta"
    };
    if (keyStr && KEYSTR_MAP[keyStr]) return KEYSTR_MAP[keyStr];

    const codeStr = e.code || "";
    const CODE_MAP = {
      KeyW: "up", ArrowUp: "up",
      KeyS: "down", ArrowDown: "down",
      KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right",
      KeyJ: "b", KeyK: "a", Space: "a",
      Enter: "start", ShiftLeft: "select", ShiftRight: "select",
      KeyU: "dash_jump", KeyI: "ta"
    };
    return CODE_MAP[codeStr] || null;
  }

  function handleKeyDown(e) {
    const act = resolveKeyAction(e);
    if (act) {
      rawButtons[act] = true;
      if (act === "start") holdBuffer.start = 12;
      if (act === "select") holdBuffer.select = 12;
      if (e.cancelable) e.preventDefault();
    }
  }

  function handleKeyUp(e) {
    const act = resolveKeyAction(e);
    if (act) {
      rawButtons[act] = false;
      if (e.cancelable) e.preventDefault();
    }
  }

  // 字符输入双保险：针对移动端蓝牙键盘被系统拼音输入法截获为文本输入的兜底转换
  const CHAR_TO_ACTION = {
    w: "up", s: "down", a: "left", d: "right",
    j: "b", k: "a", " ": "a", u: "dash_jump", i: "ta"
  };

  function triggerKeyPulse(action, durationMs) {
    if (!action) return;
    rawButtons[action] = true;
    if (action === "start") holdBuffer.start = 12;
    if (action === "select") holdBuffer.select = 12;
    setTimeout(() => {
      rawButtons[action] = false;
    }, durationMs || 100);
  }

  // 全局键盘捕获监听 (纯内存分发，无 input 劫持)
  window.addEventListener("keydown", handleKeyDown, { capture: true });
  document.addEventListener("keydown", handleKeyDown, { capture: true });
  window.addEventListener("keyup", handleKeyUp, { capture: true });
  document.addEventListener("keyup", handleKeyUp, { capture: true });

  function ensureFocus() {
    try {
      const c = document.getElementById("main-canvas");
      if (c && typeof c.focus === "function") c.focus();
      else if (window && typeof window.focus === "function") window.focus();
    } catch (_) {}
  }
  ["touchstart", "touchend", "click", "mousedown"].forEach(evt => {
    document.addEventListener(evt, ensureFocus, { passive: true });
  });

  // 胶囊功能键定义 (对齐用户图 1 标杆：SELECT 与 START)
  const CAPSULES = [
    { id: "select", label: "SELECT" },
    { id: "start", label: "START" }
  ];

  // 动作键定义 (对齐用户图 1 标杆：倾斜大双键 A 与 B)
  const ACTIONS = [
    { id: "a", label: "A", key: "A" },
    { id: "b", label: "B", key: "B" }
  ];

  window.GGEMU_CORE = {
    id: "mario-secret-nes",
    name: "超级马力欧：水下秘境",
    jumpToWaterWorld: jumpToWaterWorld,
    ensureFocus: ensureFocus,
    pad: {
      stick: false,
      layout: "two-button",
      actions: ACTIONS,
      geom: { rf: 0.75, dd: 1.5, hit: 12 },
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
        // 重建开始：从这一刻到重建完成都不出声，屏幕上的预热帧也不放声音。
        audioSilenceUntil = ((window.performance && performance.now) ? performance.now() : Date.now()) + 3000;
        audioFadeUntil = 0;
        window.__audioDiag = { bootStart: ((window.performance && performance.now) ? performance.now() : Date.now()) };
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          sampleRate: 44100
        });

        const rawBin = atob(romBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "");
        romSourceBase64 = (typeof romBase64 === "string" && romBase64) ? romBase64 : (window.MARIO_ROM_BASE64 || window.ROM_DATA || "");
        if (!rawOrigBase64) rawOrigBase64 = romSourceBase64;
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        const tour = readTourReg();
        const bootMode = tour ? "glitch" : readBootMode();
        const plain = bootMode === "plain";
        if (tour) {
          const st = tourStop(tour.w, tour.a);
          nes.loadROM(glitchRomBinary(st[0], st[1], st[2]));
        } else {
          nes.loadROM(plain ? rawBin : secretRomBinary());
        }
        isBooted = true;

        // 预热步进：跑 60 帧度过开机淡入，按 START 16 帧进入关卡，再跑 220 帧让关卡完全载入。
        // 秘境模式下再把世界号拨到 36，让原版状态栏自己写出「WORLD  -1」，再跑 60 帧稳画面。
        try {
          for (let f = 0; f < 60; f++) nes.frame();
          nes.buttonDown(1, NES_BTN.start);
          for (let f = 0; f < 16; f++) nes.frame();
          nes.buttonUp(1, NES_BTN.start);
          for (let f = 0; f < 220; f++) nes.frame();
          if (tour) {
            const st0 = tourStop(tour.w, tour.a);
            enterGlitchWorld(st0[0], st0[1], false);
            for (let f = 0; f < 90; f++) nes.frame();
            const dead = isDeadLevel();
            const skip = tour.skip || 0;
            if (dead && skip < 8) {
              setTimeout(function () {
                glideToNeighbor(tour.w, tour.a, 1, skip + 1);
              }, 40);
              return;
            }
            if (dead) toast("这一面在真机上也跑不动，翻过去也一样，继续下一面吧");
          } else if (plain) {
            secretMode = false;
            hideTourBar();
          } else {
            enterSecretWorld(false);
            for (let f = 0; f < 60; f++) nes.frame();
          }
          // 这次开局已经用完，标记回默认的秘境模式：下次被容器重新加载时仍然从 -1 开局
          try { sessionStorage.setItem("marioBootMode", "secret"); } catch (e) {}
          if (!tour) {
            try {
              if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
            } catch (e) {}
          }
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }
        // 预热帧已经把开场采样写进缓冲。这里把环形缓冲整体清零并让读指针追上写指针，
        // 否则重建前残留的旧采样会被反复读出，就是真机上那串“嘟嘟嘟”。
        sampleBufL.fill(0);
        sampleBufR.fill(0);
        audioReadPtr = audioWritePtr;
        // 缓冲清零后仍然会有一小段“上一首的尾音/重复音”从新引擎里出来（APU 起手状态），
        // 这里再把起声点往后放 700ms，这段时间的音频直接丢弃，之后 300ms 淡入。
        audioSilenceUntil = ((window.performance && performance.now) ? performance.now() : Date.now()) + 700;
        audioFadeUntil = audioSilenceUntil + 300;
        window.__audioDiag.bootEnd = ((window.performance && performance.now) ? performance.now() : Date.now());
        window.__audioDiag.silenceUntil = audioSilenceUntil;
        window.__audioDiag.fadeUntil = audioFadeUntil;

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
        hideVeil();
      } catch (err) {
        console.error("Mario boot failed:", err);
        hideVeil();
        // 重建失败也要把声音放开，否则会一直哑着。
        audioSilenceUntil = ((window.performance && performance.now) ? performance.now() : Date.now());
        audioFadeUntil = audioSilenceUntil + 200;
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

        // Select & Start (带 12 帧脉冲防漏缓冲)
        const isSel = rawButtons.select || (holdBuffer.select > 0);
        const isSt = rawButtons.start || (holdBuffer.start > 0);
        if (holdBuffer.select > 0) holdBuffer.select--;
        if (holdBuffer.start > 0) holdBuffer.start--;
        setBtn(NES_BTN.select, isSel);
        setBtn(NES_BTN.start, isSt);

        // 若处于标题等待状态且玩家按键，智能代按 START 进关
        if (nes.cpu && nes.cpu.mem && nes.cpu.mem[0x0770] === 0 && (rawButtons.a || rawButtons.b)) {
          setBtn(NES_BTN.start, true);
        }

        setBtn(NES_BTN.a, rawButtons.a || rawButtons.dash_jump || (rawButtons.ta && (turboTick % 4 < 2)));
        setBtn(NES_BTN.b, rawButtons.b || rawButtons.dash_jump);
      }

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        applyGuideNotes();
        nes.frame();
        applyLightJump();
        applySecretFrame();
        fpsFrames++;
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }

      if (now - lastFpsTime >= 1000) {
        window.__marioFps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
        fpsFrames = 0;
        lastFpsTime = now;
      }
    },

    setButton: function(btn, pressed) {
      const b = String(btn || "").toLowerCase().replace(/^btn-/, "");
      if (rawButtons.hasOwnProperty(b)) {
        rawButtons[b] = !!pressed;
        if (pressed && (b === "start" || b === "select")) {
          holdBuffer[b] = 12;
        }
        if (nes) {
          const btnIdx = NES_BTN[b];
          if (typeof btnIdx === "number") {
            if (pressed) {
              nes.buttonDown(1, btnIdx);
            } else {
              nes.buttonUp(1, btnIdx);
            }
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

    saveState: function() {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function(state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
    },

    exportState: function() {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "mario-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function(stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj.sys !== "mario-nes" || !obj.state) {
        throw new Error("存档格式不兼容");
      }
      nes.fromJSON(obj.state);
      prevPlayerState = nes.cpu && nes.cpu.mem ? nes.cpu.mem[0x001D] : 0;
    },

    activateAudio: initAudioContext,

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
    },

    reset: function() {
      resetToSecret();
    },

    resumeAudio: function() {
      initAudioContext();
    },

    // 专属核心方法：直达传说中的隐藏第 9 关 · 水下负一关秘境 (World -1)
    jumpToWorldMinus1: function() {
      resetToSecret();
      if (secretNotify) secretNotify("已潜入隐藏第 9 关 · 水下负一关秘境");
    },

    // 重返原版 1-1（真正的原生关卡重载，不做任何假切关）
    restartOriginal: function() {
      secretMode = false;
      hideEnding();
      hideTourBar();
      isPaused = false;
      if (coldReboot("plain")) return;
      if (secretNotify) secretNotify("请重新打开本工具，即可回到原版 1-1");
    },

    jumpToLevel: function(w, a, name) {
      if (typeof w === "number" && w === 36) {
        enterSecretWorld(true);
        return;
      }
      jumpToWaterWorld(w, a, name);
    }
  };

  let lastTime = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let lastFpsTime = 0;

  function signedByte(v) {
    return (v & 0x80) ? v - 256 : v;
  }

  function applyGuideNotes() {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    const mem = nes.cpu.mem;

    // 仅在正常游戏进行中 (OperMode === 1) 提供温和的通关笔记加护，杜绝任何帧级盲目强写关卡与区域指针
    if (mem[0x0770] !== 1) return;
    if (starGuard) {
      if (mem[0x075A] < 9) mem[0x075A] = 9; // 绿蘑菇加护：生命数始终保持充盈
    }
    if (fireFlower) {
      if (mem[0x0756] < 2) mem[0x0756] = 2; // 火焰花常驻守护：随时发射火球
      mem[0x0754] = 0;
    }
  }

  function applyLightJump() {
    if (!nes || !nes.cpu || !nes.cpu.mem) {
      prevPlayerState = 0;
      return;
    }
    const mem = nes.cpu.mem;
    const state = mem[0x001D];
    if (lightJump && mem[0x0770] === 1 && mem[0x000E] === 8 && state === 1 && prevPlayerState !== 1) {
      const v = signedByte(mem[0x009F]);
      if (v < 0 && v > -20) {
        let nv = Math.round(v * 1.4);
        if (nv < -14) nv = -14;
        mem[0x009F] = nv & 0xff;
      }
    }
    prevPlayerState = state;
  }

  // 开局模式走三重通道：URL 片段（任何容器里都读得到）> sessionStorage > 默认秘境。
  // 官方模拟器把工具跑在 sandbox 里，sessionStorage 可能整块不可用，只靠它换关会失灵。
  function readBootMode() {
    try {
      const hash = (window.location.hash || "").toLowerCase();
      if (hash.indexOf("plain") >= 0) return "plain";
      if (hash.indexOf("secret") >= 0) return "secret";
    } catch (e) {}
    try {
      return sessionStorage.getItem("marioBootMode") || "secret";
    } catch (e) {
      return "secret";
    }
  }

  // 刷新被容器拦下时的兜底：原地重建一台 NES，重走一遍开机预热，效果等同冷启动
  function softReboot(mode) {
    try {
      if (typeof window.MARIO_ROM_BASE64 === "string" || typeof window.ROM_DATA === "string") {
        isBooted = false;
        isPaused = false;
        secretMode = false;
        hideEnding();
        window.GGEMU_CORE.boot(window.MARIO_ROM_BASE64 || window.ROM_DATA);
      }
    } catch (e) {
      console.warn("soft reboot failed:", e);
    }
  }

  // 换关：不刷新页面。容器（小红书小工具、官方模拟器）会拦 location.reload()，
  // 刷新失败时直接弹「资源下载失败，检查网络后重试」，所以改成原地重建一台 NES：
  // 写进地址栏片段记下开局，再让 boot 用原始 ROM 重走一遍开机预热，效果等同冷启动。
  function writeModeHash(hash) {
    try {
      history.replaceState(null, "", window.location.pathname + window.location.search + hash);
      return true;
    } catch (e) {}
    try {
      window.location.hash = hash;
      return true;
    } catch (e) {}
    return false;
  }

  function coldReboot(mode) {
    pendingTourReg = null;
    try { sessionStorage.setItem("marioBootMode", mode); } catch (e) {}
    writeModeHash("#mario-" + mode);
    const raw = rawOrigBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "";
    if (!raw) {
      if (secretNotify) secretNotify("换关失败，请退出后重新打开本工具");
      return false;
    }
    isBooted = false;
    isPaused = false;
    secretMode = false;
    hideEnding();
    hideTourBar();
    showVeil("正在回到原版关卡…");
    afterPaint(function () {
      try {
        window.GGEMU_CORE.boot(raw);
      } catch (e) {
        console.warn("cold reboot failed:", e);
        hideVeil();
        if (secretNotify) secretNotify("换关失败，请退出后重新打开本工具");
      }
    });
    return true;
  }

  // 从地址栏读巡游进度： #glitch-<世界号>-<面号>，末尾的 -k<n> 是这一面自动跳过的次数
  function readTourReg() {
    try {
      const m = /#glitch-(\d+)-(\d+)(?:-k(\d+))?/.exec(window.location.hash || "");
      if (!m) return pendingTourReg;
      pendingTourReg = null;
      const w = Math.max(TOUR_FIRST_WORLD, Math.min(TOUR_LAST_WORLD, parseInt(m[1], 10) || TOUR_FIRST_WORLD));
      const a = Math.max(0, Math.min(3, parseInt(m[2], 10) || 0));
      return { w: w, a: a, skip: m[3] ? parseInt(m[3], 10) : 0 };
    } catch (e) {
      return null;
    }
  }

  // 复刻引擎的取面算法：AreaPointer = AreaAddrOffsets[WorldAddrOffsets[世界号] + 面号]
  // 世界号超过 8 时两个下标都在越界读，读到的就是 ROM 表后面那些字节 —— 坏关卡就是这么长出来的。
  function glitchAreaPointer(w, a) {
    const raw = atob(romSourceBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "");
    if (!raw || raw.length < AREA_ADDR_TABLE + 300) return SECRET_AREA_POINTER;
    const slot = raw.charCodeAt(WORLD_ADDR_TABLE + w) & 0xff;
    const ptr = raw.charCodeAt(AREA_ADDR_TABLE + slot + a) & 0xff;
    return ptr;
  }

  function glitchRomBinary(w, a, apOverride) {
    const raw = atob(romSourceBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "");
    if (!raw || raw.length < 1000) return "";
    const ap = (typeof apOverride === "number" && apOverride >= 0) ? apOverride : glitchAreaPointer(w, a);
    let s = raw.slice(0, PATCH_SEED_AREA) + String.fromCharCode(ap) + raw.slice(PATCH_SEED_AREA + 1);
    // 世界 36 那面正好是水下负一关，顺手把 36 号世界的重载链路也补齐，和单独进 -1 时的行为一致
    if (ap === SECRET_AREA_POINTER) {
      s = s.slice(0, PATCH_W36_CHAIN) + String.fromCharCode(W36_CHAIN_OFFSET) + s.slice(PATCH_W36_CHAIN + 1);
    }
    return s;
  }

  // 状态栏的世界号是「世界号 + 1」：0 画成 1、8 画成 9、9 画成 A、35 画成 Z，36 之后是空白格
  function worldChar(w) {
    const d = w + 1;
    if (d >= 1 && d <= 9) return String(d);
    if (d >= 10 && d <= 35) return String.fromCharCode(64 + (d - 9)); // 10 -> A
    return "";
  }

  function worldGlyph(w) {
    const d = w + 1;
    if (d >= 1 && d <= 9) return 0x00 + d;
    if (d >= 10 && d <= 35) return 0x09 + (d - 9);  // A 起排
    return 0x24;                                     // 空白格
  }

  function glitchName(w, a) {
    if (w === 36) return "水下负一关";
    const c = worldChar(w);
    return "坏世界 " + (c || String(w)) + "-" + (a + 1);
  }

  function tourIndex(w, a) {
    for (let i = 0; i < TOUR_STOPS.length; i++) {
      if (TOUR_STOPS[i][0] === w && TOUR_STOPS[i][1] === a) return i;
    }
    return -1;
  }

  function tourStop(w, a) {
    const i = tourIndex(w, a);
    if (i >= 0) return TOUR_STOPS[i];
    // 地址栏里是站点表外的旧编号时，落到表里最近的一站，保证每一屏都是精选面
    for (let k = 0; k < TOUR_STOPS.length; k++) {
      const st = TOUR_STOPS[k];
      if (st[0] > w || (st[0] === w && st[1] >= a)) return st;
    }
    return TOUR_STOPS[TOUR_STOPS.length - 1];
  }

  function updateTourBar(w, a) {
    const bar = document.getElementById("tour-bar");
    const label = document.getElementById("tour-label");
    const i = tourIndex(w, a);
    const pos = i >= 0 ? (i + 1) + "/" + TOUR_STOPS.length + " 站 · " : "";
    const mark = (w === 23 && a === 2) ? "（粉红拼图）" : "";
    if (label) label.textContent = pos + glitchName(w, a) + mark;
    if (bar) bar.className = "tour-on";
  }

  function hideTourBar() {
    const bar = document.getElementById("tour-bar");
    if (bar) bar.className = "";
  }

  // 进到坏世界这一面：地形/配色本来就是补丁给的，这里只把世界号与面号写进状态栏
  function enterGlitchWorld(w, a, announce) {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    secretMode = false;
    endingShown = false;
    isPaused = false;
    hideEnding();
    const mem = nes.cpu.mem;
    mem[0x075F] = w;
    mem[0x075A] = 9;
    mem[0x075C] = a;
    try {
      const nt = nes.ppu && nes.ppu.nameTable && nes.ppu.nameTable[0];
      if (nt && nt.tile) {
        nt.tile[3 * 32 + 19] = worldGlyph(w);
        nt.tile[3 * 32 + 20] = 0x28;
        nt.tile[3 * 32 + 21] = (a + 1) & 0x0f;
      }
    } catch (e) {}
    updateTourBar(w, a);
    if (announce && secretNotify) secretNotify("已进入 " + glitchName(w, a));
  }

  // 判断这一面是不是「跑不动」：整屏黑、或者引擎根本没进游戏模式
  function isDeadLevel() {
    if (!nes || !nes.cpu || !nes.cpu.mem) return true;
    const mem = nes.cpu.mem;
    if (mem[0x0770] !== 1) return true;
    const buf = nes.ppu && nes.ppu.buffer;
    if (!buf) return true;
    let lit = 0;
    let samples = 0;
    for (let i = 0; i < buf.length; i += 7) {
      samples++;
      if ((buf[i] & 0x00ffffff) !== 0) lit++;
    }
    if (!samples) return true;
    if (lit / samples < 0.01) return true;
    // 出生点没落地（0,0）说明这一面根本放不下马里奥，直接跳
    if (mem[0x0086] === 0 && mem[0x00CE] === 0) return true;
    return false;
  }

  // 算下一面：在当前站点表里前后挪一格
  function neighborReg(w, a, dir) {
    const i = tourIndex(w, a);
    if (i < 0) return { w: TOUR_STOPS[0][0], a: TOUR_STOPS[0][1], edge: false };
    const n = Math.max(0, Math.min(TOUR_STOPS.length - 1, i + dir));
    return { w: TOUR_STOPS[n][0], a: TOUR_STOPS[n][1], edge: n === i };
  }

  function glideToNeighbor(w, a, dir, skip) {
    const next = neighborReg(w, a, dir);
    if (next.edge) {
      toast(dir > 0 ? "已经是最后一站了" : "已经是第一站了");
      return;
    }
    goGlitch(next.w, next.a, skip || 0);
  }

  // 巡游换面：同样是原地重建，绝不刷新页面
  function goGlitch(w, a, skip) {
    const hash = "#glitch-" + w + "-" + a + (skip ? ("-k" + skip) : "");
    try { sessionStorage.setItem("marioBootMode", "secret"); } catch (e) {}
    const ok = writeModeHash(hash);
    pendingTourReg = ok ? null : { w: w, a: a, skip: skip || 0 };
    const raw = rawOrigBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "";
    if (!raw) {
      toast("换面失败，请退出后重新打开本工具");
      return false;
    }
    // 点下去先有反应：画遮罩 → 下一帧重建 → 重建结束再收遮罩
    showVeil(skip ? "正在跳过跑不动的黑屏面…" : "正在翻阅这一站…");
    afterPaint(function () {
      isBooted = false;
      isPaused = false;
      hideEnding();
      try {
        window.GGEMU_CORE.boot(raw);
      } catch (e) {
        console.warn("tour switch failed:", e);
        hideVeil();
        toast("换面失败，请退出后重新打开本工具");
      }
    });
    return true;
  }

  // 真正的水下关由 ROM 数据层给出，画面本身就是原版海水蓝＋绿色珊瑚，不再叠任何滤镜
  function secretRomBinary() {
    const raw = atob(romSourceBase64 || window.MARIO_ROM_BASE64 || window.ROM_DATA || "");
    if (!raw || raw.length < 1000) return "";
    let s = raw.slice(0, PATCH_SEED_AREA) + String.fromCharCode(SECRET_AREA_POINTER) + raw.slice(PATCH_SEED_AREA + 1);
    s = s.slice(0, PATCH_W36_CHAIN) + String.fromCharCode(W36_CHAIN_OFFSET) + s.slice(PATCH_W36_CHAIN + 1);
    return s;
  }

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  // 进入秘境：关卡数据已经是真正的水下区域，这里只把世界号拨成 36，让原版状态栏画出 WORLD  -1
  function enterSecretWorld(announce) {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    setGuideNotes(true);
    hideTourBar();
    secretMode = true;
    endingShown = false;
    isPaused = false;
    hideEnding();
    const mem = nes.cpu.mem;
    mem[0x075F] = 36; // World -1
    mem[0x075A] = 9;  // 生命数补满，方便反复探索
    // 原版状态栏的世界号是照着 WorldNumber 画的：36 在字体表里正好是空白格，
    // 画出来就是「 -1」。预热时 HUD 已经按「1-1」画过一版，这里把世界位改回空白格，立刻对上传说。
    try {
      const nt = nes.ppu && nes.ppu.nameTable && nes.ppu.nameTable[0];
      if (nt && nt.tile) nt.tile[3 * 32 + 19] = 0x24;
    } catch (e) {}
    if (announce && secretNotify) secretNotify("已潜入隐藏第 9 关 · 水下负一关秘境");
  }

  // 每帧的秘境维护：只在关卡切换那一刻收束成「秘境终章」，其余全程交给原版引擎
  function applySecretFrame() {
    if (!secretMode || !nes || !nes.cpu || !nes.cpu.mem) return;
    if (endingShown) return;
    const mem = nes.cpu.mem;
    if (mem[0x0770] !== 1) return;
    if (mem[0x075F] !== 36) return;

    // ChangeAreaTimer 一响，说明水下关的出口水管已经把切关流程踢起来了，就地收束
    if (mem[0x0712] !== 0 && mem[0x00CE] >= 24) {
      showEnding();
      return;
    }
    // 兜底：万一关卡号被推进，也立刻拦下，绝不让它去跑越界的区域加载
    if (mem[0x075C] !== 0) {
      showEnding();
      return;
    }
  }

  function showEnding() {
    if (endingShown) return;
    endingShown = true;
    isPaused = true;
    const panel = document.getElementById("secret-ending");
    if (panel) {
      panel.style.display = "flex";
    } else if (secretNotify) {
      secretNotify("秘境通关！你摸到了红白机最深的那个角落");
    }
  }

  function hideEnding() {
    const panel = document.getElementById("secret-ending");
    if (panel) panel.style.display = "none";
    endingShown = false;
  }

  function bindEnding() {
    var panel = document.getElementById("secret-ending");
    if (!panel) return;
    var again = document.getElementById("ending-again");
    var orig = document.getElementById("ending-original");
    var close = document.getElementById("ending-close");
    function againHandler(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      hideEnding();
      isPaused = false;
      resetToSecret();
    }
    function origHandler(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      hideEnding();
      isPaused = false;
      window.GGEMU_CORE.restartOriginal();
    }
    if (again) {
      again.addEventListener("click", againHandler);
      again.addEventListener("touchend", againHandler);
    }
    if (orig) {
      orig.addEventListener("click", origHandler);
      orig.addEventListener("touchend", origHandler);
    }
    if (close) {
      close.addEventListener("click", function (ev) {
        if (ev) ev.stopPropagation();
        // 终章面板出现时引擎正处在越界切关的瞬间，直接继续会跑出破碎画面，所以关闭即重新潜入
        hideEnding();
        isPaused = false;
        resetToSecret();
      });
    }
  }

  function resetToSecret() {
    hideEnding();
    isPaused = false;
    if (coldReboot("secret")) return;
    if (secretNotify) secretNotify("请重新打开本工具，即可回到 World -1");
  }

  function handleAudioSample(left, right) {
    audioSamples++;
    const a = Math.abs(left) > Math.abs(right) ? Math.abs(left) : Math.abs(right);
    if (a > audioPeak) audioPeak = a;
    // 快写满就丢新采样，避免写指针套圈盖掉正在播的声音。
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  window.__marioDebug = {
    nes: function() { return nes; },
    diag: function() {
      const mem = nes && nes.cpu && nes.cpu.mem;
      if (!mem) return null;
      const ys = mem[0x009F];
      return {
        mode: mem[0x0770],
        eng: mem[0x000E],
        state: mem[0x001D],
        size: mem[0x0754],
        power: mem[0x0756],
        lives: mem[0x075A],
        y: mem[0x00CE],
        ys: (ys & 0x80) ? ys - 256 : ys,
        fire: mem[0x0024],
        audio: audioCtx ? audioCtx.state : "none",
        audioRate: audioCtx ? audioCtx.sampleRate : 0,
        audioNode: !!audioScriptNode,
        audioCallbacks: audioCallbacks,
        audioSamples: audioSamples,
        audioPeak: Math.round(audioPeak * 1000) / 1000
      };
    }
  };

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 1800);
  }

  // 换关遮罩：重建引擎会占满主线程一两秒，先把「有反应」画出来再动手
  var veilTimer = null;
  function showVeil(msg) {
    var v = document.getElementById("switch-veil");
    if (!v) return;
    var t = document.getElementById("switch-veil-text");
    if (t) t.textContent = msg || "正在翻阅这一站…";
    v.style.display = "flex";
    if (veilTimer) { clearTimeout(veilTimer); veilTimer = null; }
    // 兜底：任何异常都不让遮罩永久挡住页面
    veilTimer = setTimeout(function () {
      veilTimer = null;
      var box = document.getElementById("switch-veil");
      if (box) box.style.display = "none";
    }, 6000);
  }

  function hideVeil() {
    var v = document.getElementById("switch-veil");
    if (v) v.style.display = "none";
    if (veilTimer) { clearTimeout(veilTimer); veilTimer = null; }
  }

  // 先让浏览器画出遮罩，下一帧再执行重建
  function afterPaint(fn) {
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { setTimeout(fn, 0); });
    } else {
      setTimeout(fn, 0);
    }
  }

  function followStatus(res) {
    if (!res) return -1;
    if (typeof res.follow_status === "number") return res.follow_status;
    if (res.data && typeof res.data.follow_status === "number") return res.data.follow_status;
    return -1;
  }

  function setGuideNotes(on) {
    starGuard = !!on;
    fireFlower = !!on;
    lightJump = !!on;
    if (on) applyGuideNotes();
  }

  function jumpToWaterWorld(worldIdx, areaIdx, levelName) {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    if (worldIdx === 36) {
      resetToSecret();
      toast("已潜入隐藏第 9 关 · 水下负一关秘境");
      var m0 = document.getElementById("guide-modal");
      if (m0) m0.style.display = "none";
      return;
    }
    secretMode = false;
    setGuideNotes(true);
    const mem = nes.cpu.mem;
    mem[0x075F] = (worldIdx != null) ? worldIdx : 1; // 0-indexed World
    mem[0x075C] = (areaIdx != null) ? areaIdx : 0;   // 0-indexed Area
    mem[0x0760] = (areaIdx != null) ? areaIdx : 0;
    mem[0x0753] = 0;  // 严禁篡改区域指针，严格置零恢复 8-4 原生生成流程，杜绝控制器碰撞死锁！
    mem[0x0752] = 0;  // 清除副房间入口，避免出生在水管小黑屋
    mem[0x0746] = 0;  // 检查点重置
    mem[0x075A] = 9;  // 绿蘑菇守护：始终保持充盈生命
    mem[0x0756] = 2;  // 火焰花形态，随时发射火球
    mem[0x0770] = 1;  // Game mode
    mem[0x0772] = 0;  // 立即触发关卡初始化例程
    mem[0x0710] = 2;  // ScreenRoutineTask = 2
    mem[0x0712] = 1;  // ChangeAreaTimer = 1 瞬发切关，下一帧立刻重新加载关卡
    toast("已成功进入 " + (levelName || "目标关卡") + "！");
    var modal = document.getElementById("guide-modal");
    if (modal) modal.style.display = "none";
  }

  function bindGuide() {
    secretNotify = toast;
    bindEnding();
    var modal = document.getElementById("guide-modal");
    var openBtn = document.getElementById("btn-guide");
    var closeBtn = document.getElementById("guide-close");
    var follow = document.getElementById("btn-guide-on");
    var offBtn = document.getElementById("btn-guide-off");
    if (!openBtn || !modal) return;

    function bindJumpBtn(id, w, a, name) {
      var btn = document.getElementById(id);
      if (!btn) return;
      bindTap(btn, function () { jumpToWaterWorld(w, a, name); });
    }

    // 统一点击入口：touchend 里 preventDefault 直接吃掉浏览器补发的 click，
    // 再加一个 900ms 时间窗兜底。绝不用「计数」记状态 —— 一旦某次手势只有 touchend
    // 没有 click，计数会一直不归零，之后每次真实 click 都被吞，按钮就“点不动”了。
    function bindTap(el, fn) {
      if (!el) return;
      var busy = false;
      var lastTouch = 0;
      function fire(ev) {
        if (busy) return;
        busy = true;
        try { fn(ev); } finally { setTimeout(function () { busy = false; }, 260); }
      }
      el.addEventListener("touchend", function (ev) {
        if (ev && ev.cancelable) ev.preventDefault();
        if (ev) ev.stopPropagation();
        lastTouch = Date.now();
        fire(null);
      }, { passive: false });
      el.addEventListener("click", function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (Date.now() - lastTouch < 900) return;
        fire(null);
      });
    }

    // 核心绑定：秘境巡游 / 重回水下负一关 / 重玩原版 1-1
    var tourBtn = document.getElementById("btn-jump-tour");
    if (tourBtn) {
      var tourHandler = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        modal.style.display = "none";
        goGlitch(TOUR_STOPS[0][0], TOUR_STOPS[0][1], 0);
      };
      bindTap(tourBtn, tourHandler);
    }

    var pinkBtn = document.getElementById("btn-jump-pink");
    if (pinkBtn) {
      var pinkHandler = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        modal.style.display = "none";
        goGlitch(23, 2, 0);
      };
      bindTap(pinkBtn, pinkHandler);
    }

    var tourPrev = document.getElementById("tour-prev");
    var tourNext = document.getElementById("tour-next");
    var tourExit = document.getElementById("tour-exit");
    function stepTour(dir) {
      var reg = readTourReg() || { w: TOUR_FIRST_WORLD, a: 0, skip: 0 };
      glideToNeighbor(reg.w, reg.a, dir, 0);
    }
    bindTap(tourPrev, function () { stepTour(-1); });
    bindTap(tourNext, function () { stepTour(1); });
    bindTap(tourExit, function () { window.GGEMU_CORE.restartOriginal(); });

    bindJumpBtn("btn-jump-minus1", 36, 0, "传说中的【隐藏第 9 关：水下负一关秘境】(World -1)");
    var origBtn = document.getElementById("btn-jump-world1");
    if (origBtn) {
      bindTap(origBtn, function () {
        modal.style.display = "none";
        window.GGEMU_CORE.restartOriginal();
      });
    }

    bindTap(openBtn, function () { modal.style.display = "flex"; });
    if (closeBtn) {
      bindTap(closeBtn, function () { modal.style.display = "none"; });
    }
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) modal.style.display = "none";
    });
    if (offBtn) {
      offBtn.addEventListener("click", function (ev) {
        if (ev) ev.stopPropagation();
        setGuideNotes(false);
        toast("已回到原版走法");
        modal.style.display = "none";
      });
    }
    if (!follow) return;
    var followStarted = false;
    function onFollow(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (followStarted) return;
      followStarted = true;
      var mt = window.xhs && window.xhs.miniTool;
      var settled = false;
      function grant() {
        if (settled) return;
        settled = true;
        setGuideNotes(true);
        toast("笔记走法已打开");
        modal.style.display = "none";
        followStarted = false;
      }
      function deny() {
        if (settled) return;
        followStarted = false;
        if (mt && typeof mt.getFollowStatus === "function") {
          mt.getFollowStatus({
            success: function (res) {
              if (followStatus(res) > 0) grant();
              else toast("还没关注，走法先不动");
            },
            fail: function () { toast("还没关注，走法先不动"); }
          });
          return;
        }
        toast("用小红书打开后，关注了才会换成笔记走法");
      }
      if (!mt || typeof mt.followAuthor !== "function") {
        deny();
        return;
      }
      try {
        var ret = mt.followAuthor({
          success: function () { grant(); },
          fail: function () { deny(); }
        });
        if (ret && typeof ret.then === "function") ret.then(function () { grant(); }, function () { deny(); });
      } catch (err) {
        deny();
      }
    }
    follow.addEventListener("click", onFollow);
    follow.addEventListener("touchend", onFollow);
  }

  bindGuide();
})();
