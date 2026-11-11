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
  let infiniteLivesEnabled = false;
  let fireAlwaysEnabled = false;
  let jumpBoostEnabled = false;
  let prevPlayerState = 0;

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

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
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
      outL[i] = left;
      outR[i] = right;
      if (left > audioPeak) audioPeak = left;
      if (-left > audioPeak) audioPeak = -left;
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

  // 键盘映射（支持桌面无头与开发者测试）
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
    KeyI: "ta",        // Y 连跳 Turbo A
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
    id: "mario-nes",
    name: "超级马里奥兄弟",
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
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热步进 70 帧跳过淡入黑屏，直接就绪主菜单
        try {
          for (let f = 0; f < 70; f++) {
            nes.frame();
          }
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }
        // 预热帧已经把开场采样写进缓冲。从当前写指针开播，避免一开声先放一段过期采样。
        audioReadPtr = audioWritePtr;

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("Mario boot failed:", err);
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

        setBtn(NES_BTN.a, rawButtons.a || rawButtons.dash_jump || (rawButtons.ta && (turboTick % 4 < 2)));
        setBtn(NES_BTN.b, rawButtons.b || rawButtons.dash_jump);
      }

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        applyResidentCheats();
        nes.frame();
        applyJumpBoost();
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
      if (rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = !!pressed;
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

    getSpeed: function() {
      return speedMultiplier;
    },

    cheatInfiniteLives: function(enable) {
      infiniteLivesEnabled = (enable !== false);
      applyResidentCheats();
      return infiniteLivesEnabled;
    },

    cheatFireMario: function(enable) {
      fireAlwaysEnabled = (enable !== false);
      applyResidentCheats();
      return fireAlwaysEnabled;
    },

    cheatJumpBoost: function(enable) {
      jumpBoostEnabled = (enable !== false);
      return jumpBoostEnabled;
    },

    grantPrivileges: function() {
      infiniteLivesEnabled = true;
      fireAlwaysEnabled = true;
      jumpBoostEnabled = true;
      applyResidentCheats();
      return true;
    },

    cheatStarPower: function() {
      if (nes && nes.cpu && nes.cpu.mem) {
        nes.cpu.mem[0x079F] = 0x80; // 无敌星倒计时
      }
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
      if (nes) {
        nes.reloadROM();
      }
    },

    resumeAudio: function() {
      initAudioContext();
    }
  };

  let lastTime = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let lastFpsTime = 0;

  function signedByte(v) {
    return (v & 0x80) ? v - 256 : v;
  }

  // 关注之后才开：生命低于 9 就补回；玩家可控时维持大火球（大个子 + 火球）。默认关着，开局是小个子。
  function applyResidentCheats() {
    if (!nes || !nes.cpu || !nes.cpu.mem) return;
    const mem = nes.cpu.mem;
    if (mem[0x0770] !== 1) return;
    if (infiniteLivesEnabled && mem[0x075A] < 9) {
      mem[0x075A] = 9;
    }
    const eng = mem[0x000E];
    if (fireAlwaysEnabled && (eng === 7 || eng === 8)) {
      mem[0x0756] = 2;
      mem[0x0754] = 0;
    }
  }

  // 起跳那一帧游戏写好向上速度后，再乘 1.4。站立满跳从 64 像素到约 125 像素，点按仍是小跳。
  function applyJumpBoost() {
    if (!nes || !nes.cpu || !nes.cpu.mem) {
      prevPlayerState = 0;
      return;
    }
    const mem = nes.cpu.mem;
    const state = mem[0x001D];
    if (jumpBoostEnabled && mem[0x0770] === 1 && mem[0x000E] === 8 && state === 1 && prevPlayerState !== 1) {
      const v = signedByte(mem[0x009F]);
      if (v < 0 && v > -20) {
        let nv = Math.round(v * 1.4);
        if (nv < -14) nv = -14;
        mem[0x009F] = nv & 0xff;
      }
    }
    prevPlayerState = state;
  }

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
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
        infiniteLives: infiniteLivesEnabled,
        fireAlways: fireAlwaysEnabled,
        jumpBoost: jumpBoostEnabled,
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

  function followStatus(res) {
    if (!res) return -1;
    if (typeof res.follow_status === "number") return res.follow_status;
    if (res.data && typeof res.data.follow_status === "number") return res.data.follow_status;
    return -1;
  }

  function bindCheatGuide() {
    var modal = document.getElementById("cheat-modal");
    var openBtn = document.getElementById("btn-cheat");
    var closeBtn = document.getElementById("modal-close");
    var follow = document.getElementById("btn-follow-author");
    if (!openBtn || !modal) return;
    function openModal(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      modal.style.display = "flex";
    }
    openBtn.addEventListener("click", openModal);
    openBtn.addEventListener("touchend", openModal);
    if (closeBtn) {
      closeBtn.addEventListener("click", function (ev) {
        if (ev) ev.stopPropagation();
        modal.style.display = "none";
      });
    }
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) modal.style.display = "none";
    });
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
        infiniteLivesEnabled = true;
        fireAlwaysEnabled = true;
        jumpBoostEnabled = true;
        applyResidentCheats();
        toast("已关注。火球、加倍跳和无限命已打开");
        modal.style.display = "none";
      }
      function deny() {
        if (settled) return;
        if (mt && typeof mt.getFollowStatus === "function") {
          mt.getFollowStatus({
            success: function (res) {
              if (followStatus(res) > 0) grant();
              else toast("关注没完成，特权还没开");
            },
            fail: function () { toast("关注没完成，特权还没开"); }
          });
          return;
        }
        toast("请用小红书打开，点关注后才会打开特权");
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

  bindCheatGuide();
})();
