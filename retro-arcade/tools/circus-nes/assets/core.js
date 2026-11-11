!function () {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;

  // NES 标准手柄按键索引
  const NES_BTN = {
    a: 0,       // 跳跃
    b: 1,       // 跳跃 (辅助)
    select: 2,  // 选择 (选择模式 Game A/B)
    start: 3,   // 开始
    up: 4,      // 上
    down: 5,    // 下
    left: 6,    // 左退 / 减速
    right: 7    // 右进 / 加速
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

  // 声音静音控制 (设置面板开关)
  let isMuted = false;
  try {
    isMuted = localStorage.getItem("circus_audio_muted") === "true";
  } catch (_) {}

  // 特权金手指状态 (开机读取持久化记忆)
  let vipUnlocked = false;
  try {
    vipUnlocked = localStorage.getItem("circus_vip_granted") === "true";
  } catch (_) {}

  // 离线渲染画板
  const offscreen = document.createElement("canvas");
  offscreen.width = NES_W;
  offscreen.height = NES_H;
  const offscreenCtx = offscreen.getContext("2d");
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  // 音频系统 (44100Hz 双声道环形缓冲区，对齐成熟稳定驱动)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioPrimes = 0;
  let audioCallbacks = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);

    // 静音状态直接快速清零
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

  function ensureAudioNodes() {
    if (!audioCtx) return;
    if (!audioScriptNode && typeof audioCtx.createScriptProcessor === "function") {
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
      audioCtx.resume().then(() => {
        ensureAudioNodes();
      }).catch(() => {});
    }

    // 播放 1 个采样的静音 BufferSource，强制彻底唤醒 iOS 底层物理音频硬件
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    ensureAudioNodes();
  }

  function activateAudio() {
    try {
      initAudioContext();
    } catch (_) {}
  }

  // 手机全事件捕获监听，用户任意点触瞬间激活 WebAudio
  ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      activateAudio();
    }, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      activateAudio();
    }
  });

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  // 虚拟按键状态缓存
  const rawButtons = {
    a: false,
    b: false,
    x: false,     // Turbo A (极速连发跳跃)
    select: false,
    start: false,
    up: false,
    down: false,
    left: false,
    right: false
  };

  // Game Genie 密码表 (无敌金钟罩与无限命)
  const VIP_GENIE_CODES = [
    "SZETEPSA", // 免疫火圈与火盆碰撞伤害
    "AEETSVZA", // 免疫空翻与障碍撞击伤害
    "AAUNLPPA", // 免疫空中与地面判定受创
    "SXOKYZVG"  // 无限生命 (DEC $60 不生效)
  ];

  function applyVipToNes() {
    if (!nes || !nes.gameGenie) return;
    if (vipUnlocked) {
      VIP_GENIE_CODES.forEach(code => nes.gameGenie.addCode(code));
      nes.gameGenie.setEnabled(true);
      if (nes.cpu && nes.cpu.mem) {
        nes.cpu.mem[0x0060] = 99; // HUD 显示 99 命
      }
    } else {
      nes.gameGenie.setEnabled(false);
      if (nes.cpu && nes.cpu.mem) {
        if (nes.cpu.mem[0x0060] > 4) {
          nes.cpu.mem[0x0060] = 4; // 恢复正常 4 命挑战
        }
      }
    }
  }

  function setVip(enable, silent) {
    vipUnlocked = !!enable;
    try {
      localStorage.setItem("circus_vip_granted", vipUnlocked ? "true" : "false");
    } catch (_) {}
    applyVipToNes();
    if (!silent) {
      toast(vipUnlocked ? "马戏团 VIP 特权已开启！99命金钟罩守护" : "特权已取消，已恢复正常 4 命挑战！");
    }
    return vipUnlocked;
  }

  function toggleVip() {
    return setVip(!vipUnlocked);
  }

  // 全局暴露 GGEMU_CORE 内核适配器
  window.GGEMU_CORE = {
    // 经典 FC 两键布局规范（遵从 AGENTS.md）
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", label: "B", key: "B" },
        { id: "a", label: "A", key: "A" }
      ],
      capsules: [
        { id: "select", label: "SELECT", width: 44 },
        { id: "start", label: "START", width: 44 }
      ]
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

    setMuted: function (m) {
      isMuted = !!m;
      try {
        localStorage.setItem("circus_audio_muted", isMuted ? "true" : "false");
      } catch (_) {}
    },

    isMuted: function () {
      return isMuted;
    },

    setVip: function (enable, silent) {
      return setVip(enable, silent);
    },

    toggleVip: function () {
      return toggleVip();
    },

    isVip: function () {
      return vipUnlocked;
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
      applyVipToNes();
    },

    getState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    exportState: function () {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "circus-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function (stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj && obj.state) {
        nes.fromJSON(obj.state);
        audioReadPtr = audioWritePtr;
        applyVipToNes();
      } else {
        throw new Error("存档格式错误");
      }
    },

    captureScreen: function () {
      if (!nes) throw new Error("游戏未运行");
      return offscreen;
    },

    renderTo: function (ctx, x, y, w, h) {
      if (!nes) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, NES_W, NES_H, x, y, w, h);
    },

    getNativeResolution: function () {
      return { width: NES_W, height: NES_H };
    },

    boot: function (romBase64, host) {
      if (typeof romBase64 === "object" && romBase64 !== null && !host) {
        host = romBase64;
        romBase64 = null;
      }
      if (isBooted) return;
      isBooted = true;

      try {
        initAudioContext();
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          emulateSound: true,
          sampleRate: 44100
        });

        const romB64 = (typeof romBase64 === "string" && romBase64.length > 100)
          ? romBase64
          : (window.CIRCUS_ROM_BASE64 || window.ROM_DATA || "");
        if (!romB64) {
          throw new Error("未找到马戏团 NES ROM 数据 (CIRCUS_ROM_BASE64 missing)");
        }

        const binStr = atob(romB64);
        nes.loadROM(binStr);

        // 应用 VIP 状态 (如果此前已解锁)
        applyVipToNes();

        // 预热步进 10 帧，确保 PPU 调色板与首屏 Tile 加载完毕
        for (let i = 0; i < 10; i++) {
          nes.frame();
        }

        lastTime = performance.now();
        if (host && typeof host.onReady === "function") {
          host.onReady();
        }

        console.log("经典马戏团 1984 JSNES 内核启动成功");
      } catch (err) {
        console.error("马戏团 JSNES 内核启动失败:", err);
        if (host && typeof host.onError === "function") {
          host.onError(err);
        }
      }
    },

    tick: function () {
      if (!nes || isPaused) return;

      const isHeadless = navigator.webdriver || !window.chrome || /HeadlessChrome/.test(navigator.userAgent);
      if (document.hidden && !isHeadless) {
        lastTime = 0;
        accumulator = 0;
        return;
      }

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        return;
      }

      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      // 8 帧按压防漏保底计数递减
      let effectiveStart = rawButtons.start;
      if (startHoldFrames > 0) {
        effectiveStart = true;
        startHoldFrames--;
      }

      let effectiveSelect = rawButtons.select;
      if (selectHoldFrames > 0) {
        effectiveSelect = true;
        selectHoldFrames--;
      }

      // 连发跳跃脉冲计算 (每 4 帧翻转一次，高频连跳)
      turboTimer++;
      const turboPulse = rawButtons.x ? (Math.floor(turboTimer / 4) % 2 === 0) : false;

      // 严格使用 JSNES 标准按键 API
      const ctrl = nes.controllers[1];
      const setBtn = (btnIdx, pressed) => {
        if (pressed) {
          ctrl.buttonDown(btnIdx);
        } else {
          ctrl.buttonUp(btnIdx);
        }
      };

      setBtn(NES_BTN.start, effectiveStart);
      setBtn(NES_BTN.select, effectiveSelect);
      setBtn(NES_BTN.a, rawButtons.a || turboPulse);
      setBtn(NES_BTN.b, rawButtons.b);
      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        stepCount++;

        // 马戏团特权状态守护
        if (nes.cpu && nes.cpu.mem) {
          const mem = nes.cpu.mem;
          if (vipUnlocked) {
            mem[0x0060] = 99; // 99 命常驻守护
            mem[0x000F] = 0;  // 清空受创标志
          }
        }

        nes.frame();
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    setSpeed: function (mul) {
      speedMultiplier = Math.max(1, mul || 1);
    },

    getSpeed: function () {
      return speedMultiplier;
    },

    setButton: function (btn, down) {
      activateAudio();

      if (btn === "start") {
        rawButtons.start = down;
        if (down) startHoldFrames = 8; // 保底维持 8 帧，确保 100% 触发进关
      } else if (btn === "select") {
        rawButtons.select = down;
        if (down) selectHoldFrames = 8; // 保底维持 8 帧
      } else if (btn === "a") {
        rawButtons.a = down;
      } else if (btn === "b") {
        rawButtons.b = down;
      } else if (btn === "x") {
        rawButtons.x = down;
      } else if (rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = down;
      }
    },

    setPause: function (p) {
      isPaused = p;
    },

    isPaused: function () {
      return isPaused;
    },

    reset: function () {
      if (nes) {
        nes.reset();
        audioReadPtr = audioWritePtr;
        applyVipToNes();
      }
    },

    // 录屏音频接入接口：将实时 WebAudio 输出流分流提供给 MediaRecorder
    connectRecordingAudio: function () {
      initAudioContext();
      if (!audioCtx) return null;
      ensureAudioNodes();
      if (!audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks && tracks.length ? tracks[0] : null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    audioDiag: function () {
      return {
        ok: audioCallbacks > 0 && !isMuted && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes,
        muted: isMuted
      };
    }
  };

  // 轻量级 Toast 提示
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 2500);
  }
}();
