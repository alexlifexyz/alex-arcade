// 超级马力欧大陆2 DX 全彩版 (Super Mario Land 2 DX) 核心适配器 (GGEMU_CORE for Game Boy Color)
// 遵循 AGENTS.md 规范：标准两键外壳 + 32768 环形缓冲区音频 + 59s 立体声录屏分流 + 纯内存复位
(function() {
  "use strict";

  const GB_W = 160;
  const GB_H = 144;
  const FPS = 60;
  const FRAME_MS = 1000 / FPS;

  let offscreenCanvas = null;
  let offscreenCtx = null;

  if (typeof document !== "undefined" && document.createElement) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = GB_W;
    offscreenCanvas.height = GB_H;
    offscreenCtx = offscreenCanvas.getContext("2d");
  }

  let gb = null;
  let isBooted = false;
  let isPaused = false;
  let isMute = false;
  let speedMultiplier = 1;
  let binaryRomStr = "";

  // START / SELECT 按压缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (两键经典布局)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // A 跳跃 / 兔耳滑翔
    b: false,     // B 冲刺 / 旋风旋转下砸
    select: false,
    start: false
  };

  // Game Boy Joypad 键位索引:
  // 0: Right, 1: Left, 2: Up, 3: Down, 4: A, 5: B, 6: Select, 7: Start
  const GB_KEYS = {
    right: 0,
    left: 1,
    up: 2,
    down: 3,
    a: 4,
    b: 5,
    select: 6,
    start: 7
  };

  // 现代 Web Audio 环形缓冲区音频架构
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;

  let audioCtx = null;
  let audioScriptNode = null;
  let recDestNode = null;
  let audioPrimes = 0;

  function pushAudioSamples(interleaved) {
    if (isMute) return;
    const len = interleaved.length;
    for (let i = 0; i < len; i += 2) {
      const nextW = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
      if (nextW === audioReadPtr) break;
      sampleBufL[audioWritePtr] = interleaved[i];
      sampleBufR[audioWritePtr] = interleaved[i + 1] !== undefined ? interleaved[i + 1] : interleaved[i];
      audioWritePtr = nextW;
    }
  }

  function audioAvailable() {
    return (audioWritePtr - audioReadPtr) & (AUDIO_BUF_SIZE - 1);
  }

  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;

    if (isMute || !isBooted) {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    const avail = audioAvailable();
    if (avail < count) {
      for (let i = 0; i < count; i++) {
        if (audioReadPtr !== audioWritePtr) {
          outL[i] = sampleBufL[audioReadPtr];
          outR[i] = sampleBufR[audioReadPtr];
          audioReadPtr = (audioReadPtr + 1) & (AUDIO_BUF_SIZE - 1);
        } else {
          outL[i] = 0;
          outR[i] = 0;
        }
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      outL[i] = sampleBufL[audioReadPtr];
      outR[i] = sampleBufR[audioReadPtr];
      audioReadPtr = (audioReadPtr + 1) & (AUDIO_BUF_SIZE - 1);
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

    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          audioCtx = new AudioCtx({ sampleRate: 44100 });
        } catch (_) {
          audioCtx = new AudioCtx();
        }
      }
    }

    if (audioCtx && audioCtx.state !== "running") {
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

    if (audioCtx && !audioScriptNode) {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("[GB CORE] createScriptProcessor error:", e);
      }
    }

    if (typeof window !== "undefined") {
      window.__gbAudioContext = audioCtx;
      window.__gbAudioNode = audioScriptNode;
    }
  }

  function connectRecordingAudio() {
    activateAudio();
    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().catch(function() {});
    }
    if (!audioCtx || !audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
      return null;
    }
    try {
      if (!recDestNode) {
        recDestNode = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(recDestNode);
      }
      const tracks = recDestNode.stream.getAudioTracks();
      return tracks && tracks.length ? tracks[0] : null;
    } catch (err) {
      console.warn("[GB CORE] connectRecordingAudio error:", err);
      return null;
    }
  }

  function audioDiag() {
    return {
      ok: !!(audioCtx && audioCtx.state === "running"),
      contextState: audioCtx ? audioCtx.state : "none",
      sampleRate: audioCtx ? audioCtx.sampleRate : 0,
      bufferAvailable: audioAvailable(),
      primes: audioPrimes
    };
  }

  // base64 转二进制字符串
  function base64ToBinary(b64) {
    if (typeof atob === "function") {
      return atob(b64);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("binary");
    }
    return "";
  }

  // 核心 boot 启动契约
  function boot(romBase64, host) {
    if (isBooted && gb) {
      if (host && typeof host.onReady === "function") host.onReady();
      return;
    }

    let romStr = "";
    if (typeof romBase64 === "string" && romBase64.length > 0) {
      romStr = base64ToBinary(romBase64);
    } else if (typeof window !== "undefined" && window.ROM_DATA) {
      romStr = base64ToBinary(window.ROM_DATA);
    }
    binaryRomStr = romStr;

    if (!offscreenCanvas) {
      if (typeof document !== "undefined" && document.createElement) {
        offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = GB_W;
        offscreenCanvas.height = GB_H;
        offscreenCtx = offscreenCanvas.getContext("2d");
      }
    }

    const GameBoyCoreClass = (typeof window !== "undefined" && window.GameBoyCore) ? window.GameBoyCore : null;
    if (!GameBoyCoreClass) {
      console.error("[GB CORE] GameBoyCore class not found!");
      return;
    }

    // 设置项：跳过 boot ROM 直接开机，开启彩色化
    if (typeof window !== "undefined" && window.gbSettings) {
      window.gbSettings[1] = false; // 不等待滚动 logo
      window.gbSettings[4] = true;  // 彩色化渲染
    }

    try {
      gb = new GameBoyCoreClass(offscreenCanvas, romStr);
      gb.start();

      // 强制声音总开关开启
      if (typeof window !== "undefined" && window.gbSettings) {
        window.gbSettings[0] = true;
      }

      // 接管内核 audioHandle 直通环形缓冲区
      gb.audioHandle = {
        writeAudioNoCallback: function(buffer) {
          pushAudioSamples(buffer);
        },
        remainingBuffer: function() {
          return audioAvailable();
        },
        register: function() {},
        unregister: function() {}
      };

      // 关键解除内核暂停位：清空 bit 2 允许 run() 执行 CPU 迭代循环
      gb.stopEmulator &= 1;

      // 开机秒开穿透机制：步进 60 迭代让标题画面瞬时直出
      for (let i = 0; i < 60; i++) {
        gb.run();
      }

      isBooted = true;
      console.log("[GB CORE] 《超级马力欧大陆2 DX》模拟内核加载并启动就绪");

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    } catch (e) {
      console.error("[GB CORE] 启动失败:", e);
    }
  }

  // 纯内存复位契约
  function reset() {
    if (!binaryRomStr) return;
    try {
      console.log("[GB CORE] 执行纯内存复位");
      const GameBoyCoreClass = (typeof window !== "undefined" && window.GameBoyCore) ? window.GameBoyCore : null;
      if (!GameBoyCoreClass) return;

      if (typeof window !== "undefined" && window.gbSettings) {
        window.gbSettings[1] = false;
        window.gbSettings[4] = true;
        window.gbSettings[0] = !isMute;
      }

      gb = new GameBoyCoreClass(offscreenCanvas, binaryRomStr);
      gb.start();

      gb.audioHandle = {
        writeAudioNoCallback: function(buffer) {
          pushAudioSamples(buffer);
        },
        remainingBuffer: function() {
          return audioAvailable();
        },
        register: function() {},
        unregister: function() {}
      };

      gb.stopEmulator &= 1;

      // 清空按键与状态
      startHoldFrames = 0;
      selectHoldFrames = 0;
      for (const k in rawButtons) rawButtons[k] = false;

      // 开机秒开穿透机制：步进 60 迭代让标题画面瞬时直出
      for (let i = 0; i < 60; i++) {
        gb.run();
      }

      activateAudio();
      console.log("[GB CORE] 纯内存复位成功完成，回到开局");
    } catch (e) {
      console.error("[GB CORE] reset 失败:", e);
    }
  }

  // 核心帧循环 tick()
  let lastTime = 0;
  let accumulator = 0;

  function tick() {
    if (!isBooted || !gb || isPaused) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!lastTime) lastTime = now;

    // dt 必须乘以速度倍率 (避坑红线第4条)
    const dt = Math.min(now - lastTime, 250) * speedMultiplier;
    lastTime = now;
    accumulator += dt;

    const maxSteps = 4 * speedMultiplier;
    let steps = 0;

    while (accumulator >= FRAME_MS && steps < maxSteps) {
      // 处理 START/SELECT 缓冲
      if (startHoldFrames > 0) {
        gb.JoyPadEvent(GB_KEYS.start, true);
        startHoldFrames--;
      } else if (!rawButtons.start) {
        gb.JoyPadEvent(GB_KEYS.start, false);
      }

      if (selectHoldFrames > 0) {
        gb.JoyPadEvent(GB_KEYS.select, true);
        selectHoldFrames--;
      } else if (!rawButtons.select) {
        gb.JoyPadEvent(GB_KEYS.select, false);
      }

      // 守护声音开关
      if (typeof window !== "undefined" && window.gbSettings && !isMute) {
        window.gbSettings[0] = true;
      }

      // 执行两步内核迭代完成一整帧
      gb.run();
      gb.run();

      accumulator -= FRAME_MS;
      steps++;
    }
  }

  // 掌机外壳按键核心契约 setButton(btnId, isPressed)
  function setButton(btnId, pressed) {
    if (!btnId) return;
    activateAudio();
    const norm = String(btnId).toLowerCase().replace(/^btn-/, "");
    const isDown = !!pressed;

    if (norm === "start") {
      rawButtons.start = isDown;
      if (isDown) startHoldFrames = 8;
      if (gb) gb.JoyPadEvent(GB_KEYS.start, isDown || startHoldFrames > 0);
      return;
    }

    if (norm === "select") {
      rawButtons.select = isDown;
      if (isDown) selectHoldFrames = 8;
      if (gb) gb.JoyPadEvent(GB_KEYS.select, isDown || selectHoldFrames > 0);
      return;
    }

    if (GB_KEYS[norm] !== undefined) {
      rawButtons[norm] = isDown;
      if (gb) gb.JoyPadEvent(GB_KEYS[norm], isDown);
    }
  }

  // 兼容按键响应
  function buttonDown(name) {
    setButton(name, true);
  }

  function buttonUp(name) {
    setButton(name, false);
  }

  function setSpeed(multiplier) {
    speedMultiplier = Math.max(1, Math.min(Number(multiplier) || 1, 3));
  }

  function isMuted() {
    return isMute;
  }

  function setMute(mute) {
    isMute = !!mute;
    if (isMute) {
      audioWritePtr = 0;
      audioReadPtr = 0;
    } else {
      activateAudio();
    }
    try {
      localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
    } catch (_) {}
  }

  // 标准存档与读档契约 (exportState / importState)
  function exportState() {
    if (!gb) return null;
    try {
      const stateObj = gb.saveState();
      const json = JSON.stringify(stateObj);
      if (typeof window !== "undefined" && window.LZString) {
        return window.LZString.compressToUTF16(json);
      }
      return json;
    } catch (e) {
      console.error("[GB CORE] exportState 失败:", e);
      return null;
    }
  }

  function importState(raw) {
    if (!gb || !raw) return false;
    try {
      let json = raw;
      if (typeof window !== "undefined" && window.LZString) {
        const decomp = window.LZString.decompressFromUTF16(raw);
        if (decomp) json = decomp;
      }
      const stateObj = JSON.parse(json);
      gb.returnFromState(stateObj);
      activateAudio();
      return true;
    } catch (e) {
      console.error("[GB CORE] importState 失败:", e);
      return false;
    }
  }

  // 全手势捕获破冰
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // 掌机核心导出契约
  window.GGEMU_CORE = {
    name: "超级马力欧大陆2 DX",
    video: function() {
      return { w: GB_W, h: GB_H };
    },
    source: function() {
      return offscreenCanvas;
    },
    pad: {
      name: "超级马力欧大陆2 DX",
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "跳跃", sub: "滑翔", color: "red" },
        { id: "b", key: "B", label: "冲刺", sub: "旋转", color: "yellow" }
      ],
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },
    boot: boot,
    reset: reset,
    tick: tick,
    setButton: setButton,
    buttonDown: buttonDown,
    buttonUp: buttonUp,
    setSpeed: setSpeed,
    setSpeedMultiplier: setSpeed,
    isMuted: isMuted,
    setMuted: setMute,
    setMute: setMute,
    exportState: exportState,
    importState: importState,
    connectRecordingAudio: connectRecordingAudio,
    activateAudio: activateAudio,
    resumeAudio: activateAudio,
    audioDiag: audioDiag
  };
})();
