// 经典泡泡龙 (Classic Bubble Bobble GBC) 核心适配器 (GGEMU_CORE for Game Boy Color)
// 遵循 AGENTS.md 规范：标准两键外壳 + 32768 环形缓冲区音频 + 59s 立体声录屏分流 + 纯内存复位 + 四重静音锁
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
    a: false,     // A 吐泡泡
    b: false,     // B 跳跃
    select: false,// 选择
    start: false  // 开始
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
      console.warn("[GB AUDIO] initAudioContext failed:", e);
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

  function connectRecordingAudio() {
    activateAudio();
    if (!audioCtx) initAudioContext();
    if (!audioCtx) return null;

    try {
      if (!recDestNode && typeof audioCtx.createMediaStreamDestination === "function") {
        recDestNode = audioCtx.createMediaStreamDestination();
        if (audioScriptNode) {
          audioScriptNode.connect(recDestNode);
        }
      }
      if (recDestNode && recDestNode.stream) {
        const tracks = recDestNode.stream.getAudioTracks();
        if (tracks && tracks.length > 0) {
          return tracks[0];
        }
      }
    } catch (err) {
      console.warn("[GB AUDIO] connectRecordingAudio error:", err);
    }
    return null;
  }

  function audioDiag() {
    return {
      audioCtxState: audioCtx ? audioCtx.state : "none",
      sampleRate: audioCtx ? audioCtx.sampleRate : 0,
      audioPrimes: audioPrimes,
      writePtr: audioWritePtr,
      readPtr: audioReadPtr,
      isMute: isMute,
      available: audioAvailable()
    };
  }

  function toBinaryString(data) {
    if (!data) return "";
    if (typeof data === "string") return data;
    let u8 = null;
    if (data instanceof Uint8Array) {
      u8 = data;
    } else if (data && data.buffer instanceof ArrayBuffer) {
      u8 = new Uint8Array(data.buffer);
    } else if (data instanceof ArrayBuffer) {
      u8 = new Uint8Array(data);
    }
    if (u8) {
      let str = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < u8.length; i += CHUNK) {
        str += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
      }
      return str;
    }
    return "";
  }

  // 核心 boot 启动契约
  function boot(romInput, host) {
    if (isBooted && gb) {
      if (host && typeof host.onReady === "function") host.onReady();
      return;
    }

    const src = romInput || (typeof window !== "undefined" ? (window.ROM_BUFFER || window.ROM_DATA) : null);
    binaryRomStr = toBinaryString(src);

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
      gb = new GameBoyCoreClass(offscreenCanvas, binaryRomStr);
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

      // 开机秒开穿透机制：步进 60 迭代让全彩标题画面瞬时直出
      for (let i = 0; i < 60; i++) {
        gb.run();
      }

      isBooted = true;
      console.log("[GB CORE] 《经典泡泡龙》GBC 模拟内核加载并启动就绪");

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
      console.log("[GB CORE] 纯内存复位成功完成，回到泡泡龙标题开局");
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

  function setStick(dx, dy) {
    const THRESHOLD = 0.35;
    setButton("left", dx < -THRESHOLD);
    setButton("right", dx > THRESHOLD);
    setButton("up", dy < -THRESHOLD);
    setButton("down", dy > THRESHOLD);
  }

  function buttonDown(name) {
    setButton(name, true);
  }

  function buttonUp(name) {
    setButton(name, false);
  }

  function setSpeed(multiplier) {
    speedMultiplier = Math.max(1, Math.min(Number(multiplier) || 1, 3));
  }

  function getSpeed() {
    return speedMultiplier;
  }

  function toggleSpeed() {
    const newSpd = (speedMultiplier === 1) ? 3 : 1;
    setSpeed(newSpd);
    return newSpd;
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
    id: "bubble-bobble-gbc",
    name: "经典泡泡龙 (Classic Bubble Bobble)",
    video: function() {
      return { w: GB_W, h: GB_H };
    },
    source: function() {
      return offscreenCanvas;
    },
    pad: {
      name: "经典泡泡龙",
      layout: "two-button",
      stick: false,
      actions: [
        { id: "a", key: "A", label: "A", sub: "吐泡泡", color: "green" },
        { id: "b", key: "B", label: "B", sub: "跳跃", color: "yellow" }
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
    setStick: setStick,
    buttonDown: buttonDown,
    buttonUp: buttonUp,
    setSpeed: setSpeed,
    setSpeedMultiplier: setSpeed,
    getSpeed: getSpeed,
    toggleSpeed: toggleSpeed,
    isMuted: isMuted,
    isMute: isMuted,
    setMuted: setMute,
    setMute: setMute,
    toggleMute: function() {
      setMute(!isMute);
      return isMute;
    },
    saveState: exportState,
    loadState: importState,
    exportState: exportState,
    importState: importState,
    connectRecordingAudio: connectRecordingAudio,
    activateAudio: activateAudio,
    resumeAudio: activateAudio,
    audioDiag: audioDiag
  };
})();
