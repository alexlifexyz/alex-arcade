// Double Dragon II: The Revenge NES Core Adapter (GGEMU_CORE for JSNES)
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
  let spMacroTick = -1;
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 右攻 (NES A)
    b: false,     // 左攻 (NES B)
    jump: false,  // 起跳 (A+B 同时)
    sp: false,    // 一键旋风腿 / 升龙飞膝智能宏
    select: false,
    start: false
  };

  // 2P 虚拟按键状态与缓冲 (双手柄独立)
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  let spMacroTickP2 = -1;
  const rawButtonsP2 = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 右攻 (NES A)
    b: false,     // 左攻 (NES B)
    jump: false,  // 起跳 (A+B 同时)
    sp: false,    // 一键旋风腿 / 升龙飞膝智能宏
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

  // 音频系统 (44100Hz 双声道环形缓冲区与四重硬件静音锁)
  const AUDIO_BUF_SIZE = 32768;
  const audioRingL = new Float32Array(AUDIO_BUF_SIZE);
  const audioRingR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let masterGainNode = null;
  let audioScriptNode = null;
  let recDestNode = null;
  let audioCallbacks = 0;
  let audioPrimes = 0;

  let isMute = false;
  try {
    isMute = (typeof localStorage !== "undefined" && localStorage.getItem("ggemu_mute") === "true");
  } catch (_) {}

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
    if (avail > count * 8) {
      audioReadPtr = (audioWritePtr - count * 2 + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
    } else if (avail < count) {
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
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = isMute ? 0 : 1;
        masterGainNode.connect(audioCtx.destination);
      }
      if (audioCtx.createScriptProcessor) {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
      } else if (audioCtx.createJavaScriptNode) {
        audioScriptNode = audioCtx.createJavaScriptNode(2048, 0, 2);
      }
      if (audioScriptNode) {
        audioScriptNode.onaudioprocess = onAudioProcess;
        if (masterGainNode) {
          audioScriptNode.connect(masterGainNode);
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
        dummy.connect(masterGainNode || audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  function renderVideoFrame(buffer) {
    if (!pixelBuf || !buffer) return;
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    if (offscreenCtx) {
      offscreenCtx.putImageData(imgData, 0, 0);
    }
  }

  function handleAudioSample(left, right) {
    if (isMute) return;
    audioRingL[audioWritePtr] = left;
    audioRingR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
  }

  // 键盘映射（支持桌面电脑调试与外接键盘）
  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    KeyJ: "b",        // B 攻击
    KeyK: "a",        // A 必杀
    KeyU: "sp",       // X 一键旋风腿
    KeySpace: "jump", // 空格 起跳
    KeyI: "jump",     // I 起跳
    ShiftLeft: "select",
    ShiftRight: "select",
    Enter: "start"
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", (e) => {
      const btn = KEY_MAP[e.code];
      if (btn) {
        rawButtons[btn] = true;
        if (btn === "start") startHoldFrames = 8;
        if (btn === "select") selectHoldFrames = 8;
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
  }

  // 胶囊功能键定义 (标准家用机规范：选择与开始)
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义 (经典四键布局：上连发X、左攻击Y、右必杀A、下跳跃B)
  const ACTIONS = [
    { id: "sp", label: "连发", key: "X" },
    { id: "b", label: "攻击", key: "Y" },
    { id: "a", label: "必杀", key: "A" },
    { id: "jump", label: "跳跃", key: "B" }
  ];

  let lastTime = 0;
  let accumulator = 0;

  const coreInstance = {
    id: "dd2-nes",
    name: "双截龙 II：复仇",
    pad: {
      stick: true,
      layout: "diamond",
      actions: ACTIONS,
      geom: { rf: 0.62, dd: 1.5, hit: 10 },
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

        // 将 Base64 解码为二进制字符串
        const rawBin = atob(romBase64 || window.DD2_ROM_BASE64 || "");
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 开机秒开穿透机制：预热步进 80 帧，越过版权文字等待，直出全彩震撼标题画面
        try {
          for (let f = 0; f < 80; f++) {
            nes.frame();
          }
        } catch (_) {}

        isPaused = false;
        lastTime = performance.now();
        accumulator = 0;

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("boot failed:", err);
        if (host && typeof host.toast === "function") {
          host.toast("游戏启动失败: " + err.message);
        } else {
          alert("游戏启动失败: " + err.message);
        }
      }
    },

    pause: function() {
      isPaused = true;
    },

    resume: function() {
      isPaused = false;
      activateAudio();
    },

    reset: function() {
      if (!nes) return false;
      try {
        Object.keys(rawButtons).forEach(k => rawButtons[k] = false);
        Object.keys(rawButtonsP2).forEach(k => rawButtonsP2[k] = false);
        startHoldFrames = 0;
        selectHoldFrames = 0;
        startHoldFramesP2 = 0;
        selectHoldFramesP2 = 0;
        spMacroTick = -1;
        spMacroTickP2 = -1;
        if (typeof nes.reloadROM === "function") {
          nes.reloadROM();
        } else if (typeof nes.reset === "function") {
          nes.reset();
        }
        // 秒开穿透 80 帧直出标题画面
        for (let f = 0; f < 80; f++) {
          nes.frame();
        }
        accumulator = 0;
        lastTime = performance.now();
        activateAudio();
        return true;
      } catch (err) {
        console.error("游戏复位失败:", err);
        return false;
      }
    },

    tick: function() {
      if (!isBooted || isPaused || !nes) return;

      const now = performance.now();
      if (!lastTime) lastTime = now;
      let delta = now - lastTime;
      lastTime = now;

      if (delta > 200) delta = 200;
      accumulator += delta * speedMultiplier;

      turboTick++;

      // 旋风腿与升龙飞膝智能宏时钟步进 (1P 与 2P)
      let macroPressA = false;
      let macroPressB = false;

      if (rawButtons.sp) {
        if (spMacroTick < 0) spMacroTick = 0;
        spMacroTick++;
        const m = spMacroTick % 36;
        if (m < 4) {
          macroPressA = true;
          macroPressB = true;
        } else if (m >= 15 && m <= 22) {
          macroPressA = true;
          macroPressB = true;
        } else if (m >= 29 && m <= 34) {
          macroPressA = true;
          macroPressB = true;
        }
      } else {
        spMacroTick = -1;
      }

      let macroPressAP2 = false;
      let macroPressBP2 = false;

      if (rawButtonsP2.sp) {
        if (spMacroTickP2 < 0) spMacroTickP2 = 0;
        spMacroTickP2++;
        const m2 = spMacroTickP2 % 36;
        if (m2 < 4) {
          macroPressAP2 = true;
          macroPressBP2 = true;
        } else if (m2 >= 15 && m2 <= 22) {
          macroPressAP2 = true;
          macroPressBP2 = true;
        } else if (m2 >= 29 && m2 <= 34) {
          macroPressAP2 = true;
          macroPressBP2 = true;
        }
      } else {
        spMacroTickP2 = -1;
      }

      // 按键防漏 8 帧缓冲 (1P & 2P)
      const effectiveStart = rawButtons.start || (startHoldFrames > 0);
      if (startHoldFrames > 0) startHoldFrames--;

      const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
      if (selectHoldFrames > 0) selectHoldFrames--;

      const effectiveStartP2 = rawButtonsP2.start || (startHoldFramesP2 > 0);
      if (startHoldFramesP2 > 0) startHoldFramesP2--;

      const effectiveSelectP2 = rawButtonsP2.select || (selectHoldFramesP2 > 0);
      if (selectHoldFramesP2 > 0) selectHoldFramesP2--;

      // 同步控制器按键状态至 JSNES (1P & 2P 双人手柄完全独立)
      const setBtn = (playerIndex, btnIndex, isDown) => {
        if (isDown) {
          nes.buttonDown(playerIndex, btnIndex);
        } else {
          nes.buttonUp(playerIndex, btnIndex);
        }
      };

      // 1P 控制器同步
      setBtn(1, NES_BTN.up, rawButtons.up);
      setBtn(1, NES_BTN.down, rawButtons.down);
      setBtn(1, NES_BTN.left, rawButtons.left);
      setBtn(1, NES_BTN.right, rawButtons.right);
      setBtn(1, NES_BTN.select, effectiveSelect);
      setBtn(1, NES_BTN.start, effectiveStart);
      const isADown = rawButtons.a || rawButtons.jump || macroPressA;
      setBtn(1, NES_BTN.a, isADown);
      const isBDown = rawButtons.b || rawButtons.jump || macroPressB;
      setBtn(1, NES_BTN.b, isBDown);

      // 2P 控制器同步
      setBtn(2, NES_BTN.up, rawButtonsP2.up);
      setBtn(2, NES_BTN.down, rawButtonsP2.down);
      setBtn(2, NES_BTN.left, rawButtonsP2.left);
      setBtn(2, NES_BTN.right, rawButtonsP2.right);
      setBtn(2, NES_BTN.select, effectiveSelectP2);
      setBtn(2, NES_BTN.start, effectiveStartP2);
      const isADownP2 = rawButtonsP2.a || rawButtonsP2.jump || macroPressAP2;
      setBtn(2, NES_BTN.a, isADownP2);
      const isBDownP2 = rawButtonsP2.b || rawButtonsP2.jump || macroPressBP2;
      setBtn(2, NES_BTN.b, isBDownP2);

      // 执行物理帧步进
      let stepCount = 0;
      const maxSteps = 4 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        nes.frame();
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    setButton: function(name, isDown, player) {
      if (!name) return;
      const p = (player === 2 || String(name).startsWith("p2_")) ? 2 : 1;
      const b = String(name).toLowerCase().replace(/^btn-/, "").replace(/^p[12]_/, "");
      const target = (p === 2) ? rawButtonsP2 : rawButtons;
      if (target.hasOwnProperty(b)) {
        target[b] = !!isDown;
        if (b === "start" && isDown) {
          if (p === 2) startHoldFramesP2 = 8;
          else startHoldFrames = 8;
        }
        if (b === "select" && isDown) {
          if (p === 2) selectHoldFramesP2 = 8;
          else selectHoldFrames = 8;
        }
      }
    },

    setSpeed: function(speed) {
      speedMultiplier = Math.max(1, speed || 1);
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    // 声音控制标准契约
    setMuted: function(m) {
      return this.setMute(m);
    },

    setMute: function(m) {
      isMute = !!m;
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
        } catch (_) {}
      }
      if (masterGainNode && masterGainNode.gain) {
        try {
          masterGainNode.gain.value = isMute ? 0 : 1;
        } catch (_) {}
      }
      if (isMute) {
        audioWritePtr = 0;
        audioReadPtr = 0;
        audioRingL.fill(0);
        audioRingR.fill(0);
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

    // 录屏音轨接入契约
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

    // 存档与读档标准契约
    saveState: function() {
      if (!nes) return null;
      try {
        return JSON.stringify({
          v: 1,
          sys: "dd2-nes",
          t: Date.now(),
          state: nes.toJSON()
        });
      } catch (e) {
        console.error("saveState error:", e);
        return null;
      }
    },

    loadState: function(jsonStr) {
      if (!nes || !jsonStr) return false;
      try {
        const obj = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
        if (obj.sys && obj.sys !== "dd2-nes") {
          throw new Error("存档格式不兼容");
        }
        nes.fromJSON(obj.state || obj);
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
