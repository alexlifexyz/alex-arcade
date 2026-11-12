!function () {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;

  // NES 标准手柄按键索引
  const NES_BTN = {
    a: 0,       // 腿击 (踢)
    b: 1,       // 拳击 (打)
    select: 2,  // 选择
    start: 3,   // 开始 / 暂停
    up: 4,      // 向上跳跃
    down: 5,    // 下蹲防守
    left: 6,    // 向左移动 / 后退防御
    right: 7    // 向右移动 / 进攻突进
  };

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let turboTimer = 0;
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

  // 按键防漏保底计数器 (确保真机轻点也能维持 8 帧被 NES CPU 完整采样)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 特权金手指状态 (开机读取持久化记忆)
  let vipUnlocked = false;
  try {
    vipUnlocked = localStorage.getItem("kof_vip_granted") === "true";
  } catch (_) {}

  // 静音状态 (由设置面板独立控制)
  let isMuted = false;

  // 离线渲染画板
  const offscreen = document.createElement("canvas");
  offscreen.width = NES_W;
  offscreen.height = NES_H;
  const offscreenCtx = offscreen.getContext("2d");
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  // 音频系统 (44100Hz 双声道环形缓冲区，支持真机硬件自适应采样、增益放大与立体声录屏)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioCallbacks = 0;
  let audioPrimes = 0;
  let audioPeak = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;
    const rate = audioCtx && audioCtx.sampleRate ? audioCtx.sampleRate : 44100;
    const ratio = 44100 / rate;

    for (let i = 0; i < count; i++) {
      if (isMuted || !isBooted || isPaused) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      if (audioAvailable() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const r = Math.floor(audioReadPtr);
      const frac = audioReadPtr - r;
      const nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      // 增强 2.2 倍增益，让移动端真机外放震撼饱满，并做安全防破音限幅
      let left = (sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac) * 2.2;
      let right = (sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac) * 2.2;
      if (left > 1.0) left = 1.0; else if (left < -1.0) left = -1.0;
      if (right > 1.0) right = 1.0; else if (right < -1.0) right = -1.0;
      outL[i] = left;
      outR[i] = right;
      const curMax = Math.max(Math.abs(left), Math.abs(right));
      if (curMax > audioPeak) audioPeak = curMax;

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
      } catch (e) {
        audioCtx = null;
        return;
      }
    }

    // 只要有 audioCtx 且未建节点，立即同步创建并连接，绝不等待 state === 'running'
    if (audioCtx && !audioScriptNode) {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        window.__ggemuAudioNode = audioScriptNode; // 防止垃圾回收
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }

    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().then(() => {
        if (audioScriptNode) {
          try { audioScriptNode.connect(audioCtx.destination); } catch (_) {}
        }
      }).catch(() => {});
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

  function activateAudio() {
    initAudioContext();
  }

  ["touchstart", "touchend", "click", "keydown", "mousedown", "pointerdown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      initAudioContext();
    }, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      initAudioContext();
    }
  });

  // 虚拟按键状态缓存
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    x: false,       // 极速连击
    y: false,       // 拳击 (NES B)
    b: false,       // 腿击 (NES A)
    a: false,       // 必杀/爆气宏 (NES A+B)
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

  // 胶囊功能键定义 (对齐标杆：选择与开始)
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义 (对齐四键动作版标杆：上连发X、左拳击Y、下腿击B、右必杀A)
  const ACTIONS = [
    { id: "x", label: "连发", key: "X" },
    { id: "y", label: "拳", key: "Y" },
    { id: "b", label: "腿", key: "B" },
    { id: "a", label: "必杀", key: "A" }
  ];

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      const p = buffer[i];
      const r = (p >> 16) & 0xff;
      const g = (p >> 8) & 0xff;
      const b = p & 0xff;
      pixelBuf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  window.GGEMU_CORE = {
    id: "kof-nes",
    name: "拳皇 97 经典格斗",
    pad: {
      stick: true,
      layout: "diamond",
      actions: ACTIONS,
      geom: { rf: 0.62, dd: 1.5, hit: 10 },
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

    connectRecordingAudio: function () {
      if (!audioCtx || !audioScriptNode) {
        initAudioContext();
      }
      if (!audioCtx) return null;
      try {
        const dest = audioCtx.createMediaStreamDestination();
        if (audioScriptNode) {
          audioScriptNode.connect(dest);
        }
        const tracks = dest.stream.getAudioTracks();
        if (tracks && tracks.length > 0) {
          return tracks[0];
        }
      } catch (e) {
        console.warn("connectRecordingAudio 异常:", e);
      }
      return null;
    },

    saveState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function (state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
      audioReadPtr = audioWritePtr;
    },

    getState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    exportState: function () {
      if (!nes) throw new Error("游戏未运行");
      const json = JSON.stringify(nes.toJSON());
      if (window.LZString && typeof window.LZString.compressToUTF16 === "function") {
        return window.LZString.compressToUTF16(json);
      }
      return json;
    },

    importState: function (compressed) {
      if (!nes) throw new Error("游戏未运行");
      if (!compressed) throw new Error("存档数据为空");
      let json = compressed;
      if (window.LZString && typeof window.LZString.decompressFromUTF16 === "function") {
        const decomp = window.LZString.decompressFromUTF16(compressed);
        if (decomp) json = decomp;
      }
      const data = JSON.parse(json);
      nes.fromJSON(data);
      audioReadPtr = audioWritePtr;
    },

    setSpeed: function (multiplier) {
      const num = Number(multiplier);
      if (!isNaN(num) && num >= 1 && num <= 5) {
        speedMultiplier = num;
      }
    },

    getSpeed: function () {
      return speedMultiplier;
    },

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

    setVip: function (enabled) {
      vipUnlocked = !!enabled;
      try {
        localStorage.setItem("kof_vip_granted", vipUnlocked ? "true" : "false");
      } catch (_) {}
      toast(vipUnlocked ? "已激活金钟罩锁血 + 无限能量满气" : "已恢复原生挑战模式");
    },

    toggleVip: function () {
      this.setVip(!vipUnlocked);
      return vipUnlocked;
    },

    isVip: function () {
      return vipUnlocked;
    },

    setMuted: function (muted) {
      isMuted = !!muted;
    },

    isMuted: function () {
      return isMuted;
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

        const rawBase64 = (typeof romBase64 === "string" && romBase64.length > 100)
          ? romBase64
          : (typeof window.KOF_ROM_BASE64 === "string" && window.KOF_ROM_BASE64.length > 100)
            ? window.KOF_ROM_BASE64
            : (typeof window.ROM_DATA === "string" && window.ROM_DATA.length > 100)
              ? window.ROM_DATA
              : "";

        const rawBin = atob(rawBase64);
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 镜像缺失，请检查 rom.js");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热 5 帧
        for (let i = 0; i < 5; i++) {
          nes.frame();
        }

        console.log("拳皇 97 JSNES 内核启动成功");
        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("boot 启动失败:", err);
        throw err;
      }
    },

    tick: function () {
      if (!isBooted || !nes || isPaused) return;

      turboTimer = (turboTimer + 1) % 6;
      const turboB = rawButtons.x && (turboTimer < 3);
      const isPunch = rawButtons.y || turboB || rawButtons.a;
      const isKick = rawButtons.b || rawButtons.a;

      // 8 帧按键防漏保底
      const effectiveStart = rawButtons.start || (startHoldFrames > 0);
      if (startHoldFrames > 0) startHoldFrames--;

      const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
      if (selectHoldFrames > 0) selectHoldFrames--;

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
      setBtn(NES_BTN.b, isPunch);
      setBtn(NES_BTN.a, isKick);
      setBtn(NES_BTN.start, effectiveStart);
      setBtn(NES_BTN.select, effectiveSelect);

      // 4. 特权金手指注入 (VIP 状态感知与对决常驻满血)
      if (vipUnlocked && nes.cpu && nes.cpu.mem) {
        const mem = nes.cpu.mem;
        if (mem[0x00d0] > 0 && mem[0x00d0] < 16) {
          mem[0x00d0] = 16;
        }
      }

      // 5. 步进帧循环 (支持 3x 加速)
      const steps = Math.max(1, Math.min(5, speedMultiplier));
      for (let s = 0; s < steps; s++) {
        nes.frame();
      }
    },

    step: function () {
      return this.tick();
    },

    audioDiag: function () {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes,
        peak: Math.round(audioPeak * 1000) / 1000
      };
    }
  };

  // 绑定秘籍特权弹窗与关注系统
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 2500);
  }

  function bindCheatGuide() {
    const modal = document.getElementById("cheat-modal");
    const openBtn = document.getElementById("btn-cheat");
    const closeBtn = document.getElementById("modal-close");
    const followBtn = document.getElementById("btn-follow-author");

    function updateFollowButtonUI() {
      if (!followBtn) return;
      if (vipUnlocked) {
        followBtn.textContent = "已激活锁血无敌 · 点击取消特权";
        followBtn.style.background = "linear-gradient(135deg, #2b9b48 0%, #1c7430 100%)";
      } else {
        followBtn.textContent = "开启锁血无敌+无限能量 · 关注作者解锁特权";
        followBtn.style.background = "linear-gradient(135deg, #e8473b 0%, #d0222b 100%)";
      }
      if (openBtn) {
        openBtn.style.background = vipUnlocked ? "#2b9b48" : "";
        openBtn.style.color = vipUnlocked ? "#ffffff" : "";
      }
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", function () {
        modal.style.display = "flex";
        updateFollowButtonUI();
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", function () {
        modal.style.display = "none";
      });
    }

    if (followBtn) {
      followBtn.addEventListener("click", function () {
        // 双向切换特权
        window.GGEMU_CORE.toggleVip();
        updateFollowButtonUI();

        // 静默唤起小红书关注作者组件
        const xhs = window.xhs && window.xhs.miniTool;
        if (xhs && typeof xhs.followAuthor === "function") {
          try {
            xhs.followAuthor({
              success: function () { toast("关注成功！常驻对战特权已生效"); },
              fail: function () {}
            });
          } catch (_) {}
        }
      });
    }

    updateFollowButtonUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCheatGuide);
  } else {
    bindCheatGuide();
  }
}();
