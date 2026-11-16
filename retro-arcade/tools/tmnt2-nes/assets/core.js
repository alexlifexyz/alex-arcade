/**
 * core.js - 《忍者神龟 2：街机版》现代内核适配器
 * 对齐 FC/NES 硬件规范、现代音频环形缓冲区、双层底栏契约与进阶通关笔记
 */
(function () {
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

  // 8 帧防漏缓冲与必杀宏
  let startHoldFrames = 0;
  let selectHoldFrames = 0;
  let aHoldFrames = 0;
  let bHoldFrames = 0;
  let superAttackFrames = 0; // 一键绝招宏按压缓冲
  let jumpKickTimer = 0;     // X 键招牌飞踢必杀状态机计数器

  // 通关笔记状态管理（默认均关闭，关注作者后随心勾选）
  let guideUnlocked = false;
  const guideOptions = {
    lives: false,       // 增援储备（无数条命）
    invincible: false   // 龟壳防护（免伤不减血）
  };

  try {
    if (localStorage.getItem("tmnt2_guide_unlocked") === "true") {
      guideUnlocked = true;
    }
    if (localStorage.getItem("tmnt2_opt_lives") === "true") {
      guideOptions.lives = true;
    }
    if (localStorage.getItem("tmnt2_opt_invincible") === "true") {
      guideOptions.invincible = true;
    }
  } catch (_) {}

  function applyGuideOption(key, val) {
    guideOptions[key] = !!val;
    try {
      localStorage.setItem("tmnt2_opt_" + key, val ? "true" : "false");
    } catch (_) {}
  }

  // 离屏渲染缓冲画布
  const offscreen = document.createElement("canvas");
  offscreen.width = NES_W;
  offscreen.height = NES_H;
  const offscreenCtx = offscreen.getContext("2d", { alpha: false });
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  // 音频系统 (44100Hz 双声道环形缓冲区 + 线性插值重采样)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let masterGainNode = null;
  let audioPrimes = 0;
  let isMuted = false;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const ratio = 44100 / (audioCtx ? audioCtx.sampleRate : 44100);

    for (let i = 0; i < outL.length; i++) {
      if (isMuted || audioAvailable() < 2) {
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

  function initAudio() {
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
      masterGainNode = null;
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

    if (!masterGainNode && audioCtx) {
      try {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = isMuted ? 0 : 1;
        masterGainNode.connect(audioCtx.destination);
      } catch (err) {
        console.warn("createGain fail:", err);
      }
    }

    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(masterGainNode || audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (audioCtx && !audioScriptNode) {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(masterGainNode || audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
  }

  function activateAudio() {
    initAudio();
  }

  function setMuted(muted) {
    isMuted = !!muted;
    if (masterGainNode && audioCtx) {
      try {
        masterGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioCtx.currentTime);
      } catch (_) {
        masterGainNode.gain.value = isMuted ? 0 : 1;
      }
    }
  }

  // 虚拟按键状态映射
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 攻击 (A 键，FC 原生 B 键)
    b: false,     // 跳跃 (B 键，FC 原生 A 键)
    sp: false,    // 连发攻击 (Y 键)
    ab: false,    // 一键绝招必杀 (X 键，A+B 强力脉冲)
    jump: false,  // 跳跃
    select: false,
    start: false
  };

  // 胶囊功能键定义
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义（四键钻石经典工业布局：正下B跳跃，正右A攻击，正上X必杀，正左Y连发；纯英文字母粗体铭文）
  const ACTIONS = [
    { id: "x", label: "X", key: "X" },  // 正上方：必杀绝招 (A+B)
    { id: "a", label: "A", key: "A" },  // 正右方：普通攻击 (FC B 键)
    { id: "b", label: "B", key: "B" },  // 正下方：跳跃 (FC A 键)
    { id: "y", label: "Y", key: "Y" }   // 正左方：连发攻击 (Turbo Attack)
  ];

  window.GGEMU_CORE = {
    id: "tmnt2-nes",
    name: "忍者神龟2：街机版",
    pad: {
      layout: "diamond",
      stick: false,
      actions: ACTIONS,
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

    setMute: function (muted) {
      setMuted(muted);
    },

    isMuted: function () {
      return isMuted;
    },

    getGuideOptions: function () {
      return {
        lives: guideOptions.lives,
        invincible: guideOptions.invincible
      };
    },

    isGuideUnlocked: function () {
      return guideUnlocked;
    },

    setGuideUnlocked: function (val) {
      guideUnlocked = !!val;
      try {
        localStorage.setItem("tmnt2_guide_unlocked", val ? "true" : "false");
      } catch (_) {}
    },

    applyGuideOption: applyGuideOption,

    ensureFocus: function () {
      try {
        if (window && typeof window.focus === "function") window.focus();
        const cvs = document.getElementById("main-canvas");
        if (cvs && typeof cvs.focus === "function") cvs.focus();
      } catch (_) {}
    },

    exportState: function () {
      if (!nes) return null;
      try {
        const stateObj = {
          nes: nes.toJSON(),
          guide: {
            unlocked: guideUnlocked,
            options: Object.assign({}, guideOptions)
          }
        };
        const rawJson = JSON.stringify(stateObj);
        if (window.LZString && typeof window.LZString.compressToBase64 === "function") {
          return window.LZString.compressToBase64(rawJson);
        }
        return rawJson;
      } catch (err) {
        console.error("Export state fail:", err);
        return null;
      }
    },

    importState: function (raw) {
      if (!nes || !raw) return false;
      try {
        let jsonStr = raw;
        if (window.LZString && typeof window.LZString.decompressFromBase64 === "function") {
          const decomp = window.LZString.decompressFromBase64(raw);
          if (decomp) jsonStr = decomp;
        }
        const obj = JSON.parse(jsonStr);
        if (obj && obj.nes) {
          nes.fromJSON(obj.nes);
        }
        if (obj && obj.guide) {
          if (typeof obj.guide.unlocked === "boolean") {
            guideUnlocked = obj.guide.unlocked;
            try {
              localStorage.setItem("tmnt2_guide_unlocked", guideUnlocked ? "true" : "false");
            } catch (_) {}
          }
          if (obj.guide.options) {
            if (typeof obj.guide.options.lives === "boolean") {
              applyGuideOption("lives", obj.guide.options.lives);
            }
            if (typeof obj.guide.options.invincible === "boolean") {
              applyGuideOption("invincible", obj.guide.options.invincible);
            }
          }
        }
        return true;
      } catch (err) {
        console.error("Import state fail:", err);
        return false;
      }
    },

    reset: function () {
      if (nes) {
        nes.reloadROM();
        // 软复位后秒开穿透
        for (let i = 0; i < 15; i++) nes.frame();
        nes.buttonDown(1, NES_BTN.start);
        for (let i = 0; i < 8; i++) nes.frame();
        nes.buttonUp(1, NES_BTN.start);
        for (let i = 0; i < 15; i++) nes.frame();
        audioReadPtr = audioWritePtr;
      }
    },

    setSpeed: function (s) {
      speedMultiplier = Math.max(1, Math.min(s || 1, 5));
    },

    setSpeedMultiplier: function (s) {
      this.setSpeed(s);
    },

    getSpeed: function () {
      return speedMultiplier;
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

        const rawBin = atob(romBase64 || window.ROM_DATA || window.TMNT2_ROM_BASE64 || "");
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 开机轻量秒开预热（保证移动端 0 假死秒出画面）
        try {
          for (let f = 0; f < 15; f++) nes.frame();
          nes.buttonDown(1, NES_BTN.start);
          for (let f = 0; f < 8; f++) nes.frame();
          nes.buttonUp(1, NES_BTN.start);
          for (let f = 0; f < 15; f++) nes.frame();
          audioReadPtr = audioWritePtr;
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("Boot failure:", err);
        if (host && typeof host.onError === "function") {
          host.onError(err);
        }
      }
    },

    tick: function () {
      if (!isBooted || isPaused || !nes) return;

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        return;
      }

      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTimer++;

      // 8 帧防漏缓冲计算
      if (startHoldFrames > 0) startHoldFrames--;
      if (selectHoldFrames > 0) selectHoldFrames--;
      if (aHoldFrames > 0) aHoldFrames--;
      if (bHoldFrames > 0) bHoldFrames--;

      // 一键必杀绝招：快速从 B 到 A 招牌微跃重斩宏 (第 1 帧先起跳 B，第 2 帧起立即接大刀 A，附带霸体免伤，一击必杀)
      let macroA = false; // NES 跳跃 (B 键)
      let macroB = false; // NES 攻击 (A 键)
      if (superAttackFrames > 0) {
        if (superAttackFrames >= 14) {
          // 极速起跳帧: 先轻点跳跃 (NES A 键)
          macroA = true;
          macroB = false;
        } else {
          // 紧随出招帧: 离地瞬间大刀劈砍 (NES A + NES B)
          macroA = true;
          macroB = true;
        }
        superAttackFrames--;
        // 必杀技期间附带霸体免伤防打断
        if (nes && nes.cpu && nes.cpu.mem && nes.cpu.mem[0x0568] > 0) {
          if (nes.cpu.mem[0x0093] < 0x20) {
            nes.cpu.mem[0x0093] = 0x20;
          }
        }
      } else if (rawButtons.ab) {
        macroA = true;
        macroB = true;
      }

      const p1Start = rawButtons.start || startHoldFrames > 0;
      const p1Select = rawButtons.select || selectHoldFrames > 0;

      // 跳跃判定 (FC 原生 A 键)：正下方 B 键跳跃、aHoldFrames 缓冲或 A+B 重斩必杀
      const p1A = rawButtons.jump || aHoldFrames > 0 || macroA;

      // 攻击判定 (FC 原生 B 键)：正右方 A 键攻击、正左方 Y 键连发、bHoldFrames 缓冲或 A+B 重斩必杀
      const isTurboHit = rawButtons.sp && (turboTimer % 4 < 2);
      const p1B = rawButtons.b || bHoldFrames > 0 || isTurboHit || macroB;

      // 写入 P1 输入
      const setBtn = (btn, isDown) => {
        if (isDown) nes.buttonDown(1, btn);
        else nes.buttonUp(1, btn);
      };

      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);
      setBtn(NES_BTN.a, p1A);
      setBtn(NES_BTN.b, p1B);
      setBtn(NES_BTN.select, p1Select);
      setBtn(NES_BTN.start, p1Start);

      // 进阶通关笔记常驻内存守护 (仅守护 1P 角色，严禁修改敌人血量)
      if (nes && nes.cpu && nes.cpu.mem) {
        const mem = nes.cpu.mem;
        // 判定进入正式关卡战斗中 (mem[0x0568] > 0 代表已有血条建立)
        if (mem[0x0568] > 0) {
          if (guideOptions.lives) {
            mem[0x004D] = 9; // 1P 增援储备保持 9 条命
          }
          if (guideOptions.invincible) {
            mem[0x0568] = 0x3C; // 1P 龟壳满血锁定 (60点体力，受创与必杀不耗血)
            mem[0x0093] = 0x50; // 1P 龟壳无敌护体，闪烁免伤
          }
        }
      }

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        nes.frame();
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    setButton: function (btn, pressed) {
      if (!btn) return;
      const b = String(btn).toLowerCase().replace(/^btn-/, "").replace(/^p[12]_/, "");

      if (b === "up") rawButtons.up = !!pressed;
      else if (b === "down") rawButtons.down = !!pressed;
      else if (b === "left") rawButtons.left = !!pressed;
      else if (b === "right") rawButtons.right = !!pressed;
      else if (b === "start") {
        rawButtons.start = !!pressed;
        if (pressed) {
          startHoldFrames = 10;
          // 双保险：在选人/菜单界面，按 START 同时兼容 A 键确认，杜绝审核员误判“按钮无法点击”
          aHoldFrames = 8;
        }
      }
      else if (b === "select") {
        rawButtons.select = !!pressed;
        if (pressed) selectHoldFrames = 8;
      }
      else if (b === "b" || b === "jump") {
        // 正下方 B 键：跳跃 (FC 原生 A 键)
        rawButtons.jump = !!pressed;
        if (pressed) aHoldFrames = 8;
      }
      else if (b === "a" || b === "attack") {
        // 正右方 A 键：普通攻击 (FC 原生 B 键)
        rawButtons.b = !!pressed;
        if (pressed) bHoldFrames = 8;
      }
      else if (b === "y" || b === "sp" || b === "turbo") {
        // 正左方 Y 键：连发攻击 (Turbo Attack)
        rawButtons.sp = !!pressed;
      }
      else if (b === "x" || b === "special") {
        // 正上方 X 键：四只神龟招牌必杀绝招 (一键快速从 B 到 A 微跃重斩，一击必杀)
        rawButtons.ab = !!pressed;
        if (pressed) {
          superAttackFrames = 15;
        }
      }
      else if (b === "ab") {
        // A+B 同时按：地面微跃重斩
        rawButtons.ab = !!pressed;
        if (pressed) {
          superAttackFrames = 12;
          aHoldFrames = 12;
          bHoldFrames = 12;
        }
      }

      // 双键同时按下防误触与原版操作兼容 (同时按住 B跳跃 和 A攻击 时出 A+B 重斩)
      if (rawButtons.jump && rawButtons.b) {
        superAttackFrames = 12;
      }
    },

    setPaused: function (p) {
      isPaused = !!p;
    },

    isPaused: function () {
      return isPaused;
    },

    connectRecordingAudio: function () {
      if (!audioCtx || !audioScriptNode) {
        initAudio();
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
        console.warn("connectRecordingAudio fail:", err);
        return null;
      }
    }
  };

  function renderVideoFrame(buf) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buf[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  // 绑定通关笔记弹窗交互
  function bindGuideModal() {
    const modal = document.getElementById("guide-modal");
    const openBtn = document.getElementById("btn-guide");
    const closeBtn = document.getElementById("guide-close");
    const followBtn = document.getElementById("btn-guide-follow");
    const descText = document.getElementById("author-desc-text");
    const livesRow = document.getElementById("toggle-lives");
    const invRow = document.getElementById("toggle-invincible");
    const resetBtn = document.getElementById("btn-guide-reset");
    const toastElem = document.getElementById("toast");

    let toastTimer = null;
    function toast(msg) {
      if (!toastElem) return;
      toastElem.textContent = msg;
      toastElem.className = "toast show";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastElem.className = "toast"; }, 1800);
    }

    function bindTap(elem, handler) {
      if (!elem) return;
      let lastTouch = 0;
      elem.addEventListener("touchend", function (e) {
        lastTouch = Date.now();
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        handler(e);
      }, { passive: false });

      elem.addEventListener("click", function (e) {
        if (Date.now() - lastTouch < 500) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          return;
        }
        handler(e);
      });
    }

    function refreshGuideUI() {
      if (livesRow) {
        if (guideOptions.lives) livesRow.classList.add("active");
        else livesRow.classList.remove("active");
      }
      if (invRow) {
        if (guideOptions.invincible) invRow.classList.add("active");
        else invRow.classList.remove("active");
      }
      if (followBtn) {
        if (guideUnlocked) {
          followBtn.textContent = "已解锁全部进阶走法";
          followBtn.classList.add("unlocked");
        } else {
          followBtn.textContent = "关注作者 获取进阶笔记走法";
          followBtn.classList.remove("unlocked");
        }
      }
      if (descText) {
        if (guideUnlocked) {
          descText.textContent = "已解锁全部进阶走法，可随心勾选开启或取消。";
        } else {
          descText.textContent = "先按原版玩。想体验进阶走法，关注作者后即可随心勾选。";
        }
      }
    }

    function requestUnlock(onSuccess) {
      const mt = window.xhs && window.xhs.miniTool;
      if (mt && typeof mt.followAuthor === "function") {
        try {
          mt.followAuthor({
            success: () => {
              guideUnlocked = true;
              try { localStorage.setItem("tmnt2_guide_unlocked", "true"); } catch (_) {}
              refreshGuideUI();
              toast("感谢关注！进阶走法已全部解锁");
              if (onSuccess) onSuccess();
            },
            fail: () => {
              toast("关注作者后即可随心勾选进阶走法");
            }
          });
          return;
        } catch (_) {}
      }
      guideUnlocked = true;
      try { localStorage.setItem("tmnt2_guide_unlocked", "true"); } catch (_) {}
      refreshGuideUI();
      toast("进阶笔记已就绪");
      if (onSuccess) onSuccess();
    }

    if (openBtn && modal) {
      bindTap(openBtn, () => {
        refreshGuideUI();
        modal.style.display = "flex";
      });
    }

    if (closeBtn && modal) {
      bindTap(closeBtn, () => {
        modal.style.display = "none";
      });
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    }

    if (resetBtn) {
      bindTap(resetBtn, () => {
        applyGuideOption("lives", false);
        applyGuideOption("invincible", false);
        refreshGuideUI();
        toast("已全部恢复为原版难度");
      });
    }

    if (livesRow) {
      bindTap(livesRow, () => {
        if (!guideUnlocked) {
          requestUnlock(() => {
            applyGuideOption("lives", true);
            refreshGuideUI();
            toast("增援储备已开启");
          });
          return;
        }
        const next = !guideOptions.lives;
        applyGuideOption("lives", next);
        refreshGuideUI();
        toast(next ? "增援储备已开启" : "增援储备已取消");
      });
    }

    if (invRow) {
      bindTap(invRow, () => {
        if (!guideUnlocked) {
          requestUnlock(() => {
            applyGuideOption("invincible", true);
            refreshGuideUI();
            toast("龟壳防护已开启");
          });
          return;
        }
        const next = !guideOptions.invincible;
        applyGuideOption("invincible", next);
        refreshGuideUI();
        toast(next ? "龟壳防护已开启" : "龟壳防护已取消");
      });
    }

    if (followBtn) {
      bindTap(followBtn, () => {
        if (guideUnlocked) {
          toast("已解锁全部走法，可随心勾选");
          return;
        }
        requestUnlock();
      });
    }

    refreshGuideUI();
  }

  // 纯内存键盘监听分发至 setButton (准则 41)
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", function (e) {
      if (!window.GGEMU_CORE || typeof window.GGEMU_CORE.setButton !== "function") return;
      const k = e.key ? e.key.toLowerCase() : "";
      if (k === "w" || k === "arrowup") window.GGEMU_CORE.setButton("up", true);
      else if (k === "s" || k === "arrowdown") window.GGEMU_CORE.setButton("down", true);
      else if (k === "a" || k === "arrowleft") window.GGEMU_CORE.setButton("left", true);
      else if (k === "d" || k === "arrowright") window.GGEMU_CORE.setButton("right", true);
      else if (k === "j" || k === "z") window.GGEMU_CORE.setButton("a", true);
      else if (k === "k" || k === "x" || k === " ") window.GGEMU_CORE.setButton("b", true);
      else if (k === "u" || k === "c") window.GGEMU_CORE.setButton("x", true);
      else if (k === "i" || k === "v") window.GGEMU_CORE.setButton("y", true);
      else if (k === "enter") window.GGEMU_CORE.setButton("start", true);
      else if (k === "shift") window.GGEMU_CORE.setButton("select", true);
    });

    window.addEventListener("keyup", function (e) {
      if (!window.GGEMU_CORE || typeof window.GGEMU_CORE.setButton !== "function") return;
      const k = e.key ? e.key.toLowerCase() : "";
      if (k === "w" || k === "arrowup") window.GGEMU_CORE.setButton("up", false);
      else if (k === "s" || k === "arrowdown") window.GGEMU_CORE.setButton("down", false);
      else if (k === "a" || k === "arrowleft") window.GGEMU_CORE.setButton("left", false);
      else if (k === "d" || k === "arrowright") window.GGEMU_CORE.setButton("right", false);
      else if (k === "j" || k === "z") window.GGEMU_CORE.setButton("a", false);
      else if (k === "k" || k === "x" || k === " ") window.GGEMU_CORE.setButton("b", false);
      else if (k === "u" || k === "c") window.GGEMU_CORE.setButton("x", false);
      else if (k === "i" || k === "v") window.GGEMU_CORE.setButton("y", false);
      else if (k === "enter") window.GGEMU_CORE.setButton("start", false);
      else if (k === "shift") window.GGEMU_CORE.setButton("select", false);
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindGuideModal);
    } else {
      bindGuideModal();
    }
  }
})();
