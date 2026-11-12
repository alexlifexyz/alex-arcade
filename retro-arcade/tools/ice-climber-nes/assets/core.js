// 敲冰块 / 爱斯基摩人 (Ice Climber NES) 核心适配器 (GGEMU_CORE for JSNES)
// 遵循 AGENTS.md 规范：标准两键掌机 (A跳跃攀登、B木槌碎冰) + 纯净原版运行 + 标准4键底栏 + 59s 立体声录屏分流
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

  // START / SELECT 8 帧按压缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (红白机标准两键布局)
  const rawButtons = {
    up: false,
    down: false,    // 下蹲
    left: false,    // 向左跑动
    right: false,   // 向右跑动
    a: false,       // A 跳跃向上破冰攀登
    b: false,       // B 挥木槌击碎冰层/击退海豹飞鸟
    select: false,  // 选择 1P / 2P
    start: false    // 开始 / 暂停
  };

  // 2P 控制器状态跟踪 (双手柄独立)
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  const rawButtonsP2 = {
    up: false, down: false, left: false, right: false,
    a: false, b: false, ta: false, tb: false, jump: false,
    select: false, start: false
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

  // 时间积分步进循环 (100% 纯净原版执行，无任何内存篡改)
  let lastTime = 0;
  let accumulator = 0;

  function tick() {
    if (!isBooted || isPaused) return;

    // 1. 8 帧按键防漏缓冲
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 将按键状态写入 NES 控制器
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
    setBtn(NES_BTN.b, rawButtons.b);
    setBtn(NES_BTN.a, rawButtons.a);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 3. 3× 加速时间积分步进 (严格遵守公式：增量乘以倍率)
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
    id: "ice-climber-nes",
    name: "敲冰块",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "B" }, // B 挥木槌碎冰 / 击退海豹与飞鸟
        { id: "a", key: "A", label: "A" }  // A 跳跃攀登
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
        console.error("ROM_DATA 为空，无法启动敲冰块");
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

      // 轻量预热步进：执行 20 帧预热，直接秒出敲冰块 20000+ 像素全彩标题画面，杜绝黑屏等待
      try {
        for (let f = 0; f < 20; f++) {
          nes.frame();
        }
      } catch (e) {
        console.warn("预热步进警告:", e);
      }

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
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
      }
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

  // 绑定 DOM 交互控制面板 (标准4键底栏：存档、3× 加速、设置、59s 录屏)
  if (typeof document !== "undefined") {
    function initUI() {
      const btnSave = document.getElementById("btn-save");
      const btnFast = document.getElementById("btn-fast");
      const btnSettings = document.getElementById("btn-settings");
      const toast = document.getElementById("toast");

      function showToast(text, duration) {
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add("show");
        setTimeout(function() {
          toast.classList.remove("show");
        }, duration || 2000);
      }

      if (btnSave) {
        let savedState = null;
        btnSave.addEventListener("click", function() {
          if (!savedState) {
            savedState = coreInstance.saveState();
            if (savedState) {
              btnSave.textContent = "读档";
              showToast("雪山登山进度已即时保存！再次点击可立即读档");
            }
          } else {
            const ok = coreInstance.loadState(savedState);
            if (ok) {
              btnSave.textContent = "存档";
              savedState = null;
              showToast("已成功读取存档记录！");
            }
          }
        });
      }

      if (btnFast) {
        btnFast.addEventListener("click", function() {
          const spd = coreInstance.toggleSpeed();
          if (spd > 1) {
            btnFast.classList.add("active");
            showToast("已开启 3× 极速模式！");
          } else {
            btnFast.classList.remove("active");
            showToast("已恢复 1× 正常速度");
          }
        });
      }

      if (btnSettings) {
        btnSettings.addEventListener("click", function() {
          const mute = coreInstance.toggleMute();
          if (mute) {
            showToast("游戏声音已静音");
          } else {
            showToast("游戏声音已开启");
          }
        });
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initUI);
    } else {
      initUI();
    }
  }
})();
