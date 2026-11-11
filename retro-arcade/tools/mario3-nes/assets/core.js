// Super Mario Bros. 3 NES Core Adapter (GGEMU_CORE for JSNES)
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
  let racoonFlyAlwaysEnabled = false;

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
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

  // 手机端音频缓冲与立体声调度
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioCallbacks = 0;
  let recDestNode = null;
  let audioPrimes = 0;

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
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
      }
    }
  }

  function activateAudio() {
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
      } catch (_) {}
    }

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

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function() {});
    }

    // 播放 1 个采样的静音 BufferSource，强制激活移动端底层硬件
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (audioCtx && !audioScriptNode) {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        if (recDestNode) {
          try { audioScriptNode.connect(recDestNode); } catch (_) {}
        }
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
  }

  // 手机全手势捕获监听，用户任意点触瞬间激活 WebAudio
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

  // 键盘映射
  const KEY_MAP = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
    KeyJ: "b", KeyK: "a",
    ShiftLeft: "select", ShiftRight: "select",
    Enter: "start"
  };

  window.addEventListener("keydown", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) { rawButtons[btn] = true; e.preventDefault(); }
  });

  window.addEventListener("keyup", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) { rawButtons[btn] = false; e.preventDefault(); }
  });

  // 掌机外壳规范：两键倾斜布局 (A在右上、B在左下)
  const CAPSULES = [
    { id: "select", label: "SELECT" },
    { id: "start", label: "START" }
  ];

  const ACTIONS = [
    { id: "a", label: "A", key: "A" },
    { id: "b", label: "B", key: "B" }
  ];

  function renderVideoFrame(buffer) {
    if (!buffer) return;
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xFF000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    const nextPtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
    if (nextPtr === Math.floor(audioReadPtr)) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = nextPtr;
  }

  function decodeBase64ToBinary(b64) {
    const binStr = atob(b64);
    const len = binStr.length;
    let s = "";
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(binStr.charCodeAt(i));
    }
    return s;
  }

  function applyResidentCheats() {
  }

  let lastTime = 0;
  let accumulator = 0;

  window.GGEMU_CORE = {
    id: "mario3-nes",
    name: "超级马里奥兄弟3",
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

        const romData = (typeof romBase64 === "string") ? romBase64 : window.ROM_DATA;
        const binaryString = decodeBase64ToBinary(romData);
        nes.loadROM(binaryString);
        isBooted = true;

        if (host && host.onReady) {
          host.onReady();
        }
        if (host && host.toast) {
          setTimeout(() => {
            host.toast("按 START 进入大地图，开启经典背景音乐！");
          }, 800);
        }
      } catch (err) {
        console.error("马里奥3代内核启动失败:", err);
        if (host && host.toast) {
          host.toast("模拟器启动失败：" + (err && err.message ? err.message : err));
        }
      }
    },

    tick: function() {
      if (!nes || isPaused || !isBooted) return;

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        return;
      }

      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      // 按键输入分发至 NES 控制器 1
      const ctrl = nes.controllers[1];
      const setBtn = (btnIdx, pressed) => {
        if (pressed) ctrl.buttonDown(btnIdx);
        else ctrl.buttonUp(btnIdx);
      };

      setBtn(NES_BTN.start, rawButtons.start);
      setBtn(NES_BTN.select, rawButtons.select);
      setBtn(NES_BTN.a, rawButtons.a);
      setBtn(NES_BTN.b, rawButtons.b);
      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);

      let stepCount = 0;
      const maxSteps = 4 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        stepCount++;
        applyResidentCheats();
        nes.frame();
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    setButton: function(btnId, pressed) {
      activateAudio();
      const val = !!pressed;
      if (btnId in rawButtons) {
        rawButtons[btnId] = val;
      }
    },

    setSpeed: function(speed) {
      speedMultiplier = speed > 1 ? speed : 1;
    },

    setMuted: function(muted) {
      if (audioCtx) {
        if (muted && audioCtx.state === "running") {
          audioCtx.suspend().catch(function() {});
        } else if (!muted && audioCtx.state === "suspended") {
          audioCtx.resume().catch(function() {});
        }
      }
    },

    isVipActive: function() {
      return infiniteLivesEnabled && racoonFlyAlwaysEnabled;
    },

    setVipActive: function() {
      infiniteLivesEnabled = false;
      racoonFlyAlwaysEnabled = false;
      applyResidentCheats();
    },

    exportState: function() {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "mario3-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function(stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = typeof stateStr === "string" ? JSON.parse(stateStr) : stateStr;
      if (obj.sys !== "mario3-nes" || !obj.state) {
        throw new Error("存档格式不兼容");
      }
      nes.fromJSON(obj.state);
      applyResidentCheats();
      return true;
    },

    activateAudio: activateAudio,

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (!audioCtx) return null;
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(function() {});
      }
      if (!audioScriptNode) {
        try {
          audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
          audioScriptNode.onaudioprocess = onAudioProcess;
          audioScriptNode.connect(audioCtx.destination);
          audioReadPtr = audioWritePtr;
        } catch (e) {
          console.warn("createScriptProcessor fail:", e);
        }
      }
      if (destNode) {
        recDestNode = destNode;
        if (audioScriptNode) {
          try { audioScriptNode.connect(destNode); } catch (_) {}
        }
        return null;
      }
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

    audioDiag: function() {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes
      };
    },

    resumeAudio: function() {
      activateAudio();
    }
  };
})();
