// 双截龙 III：罗塞塔之石 (Double Dragon III: The Sacred Stones NES) 核心适配器 (GGEMU_CORE for JSNES)
// 遵循 AGENTS.md 规范：标准两键掌机 (B拳击武器、A踢腿起跳) + 纯净原版运行 + 标准4键底栏 + 59s 立体声录屏分流
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
  let jumpHoldFrames = 0;

  // 旋风腿智能宏
  let spMacroTick = -1;

  // 虚拟按键状态跟踪 (红白机经典动作四键布局：直拳、踢腿、跳跃、旋风腿)
  const rawButtons = {
    up: false,      // 向上移动
    down: false,    // 向下移动 / 下蹲
    left: false,    // 向左奔跑
    right: false,   // 向右突进
    punch: false,   // 直拳 (映射至 NES A 键)
    kick: false,    // 踢腿 (映射至 NES B 键)
    jump: false,    // 跳跃 (同时按下 NES A + B)
    sp: false,      // 一键旋风腿
    select: false,  // 换人菜单 / 切换武器
    start: false    // 开始 / 暂停
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

    // 2. 跳跃 6 帧脉冲缓冲
    const effectiveJump = rawButtons.jump || (jumpHoldFrames > 0);
    if (jumpHoldFrames > 0) jumpHoldFrames--;

    // 3. 旋风腿智能宏判定 (原地起跳并在滞空最高点按 B)
    let macroPressA = false;
    let macroPressB = false;
    let suppressHoriz = false;

    if (rawButtons.sp) {
      if (spMacroTick < 0) spMacroTick = 0;
      spMacroTick++;
      const m = spMacroTick % 36;
      if (m < 5) {
        // 0-4 帧：原地同时按 A+B 起跳，抑制水平方向
        macroPressA = true;
        macroPressB = true;
        suppressHoriz = true;
      } else if (m >= 15 && m <= 22) {
        // 15-22 帧：滞空最高点按 B 键打出旋风腿！
        macroPressB = true;
      }
    } else {
      spMacroTick = -1;
    }

    // 4. 将按键状态写入 NES 控制器
    const setBtn = (btnIndex, isDown) => {
      if (isDown) {
        nes.buttonDown(1, btnIndex);
      } else {
        nes.buttonUp(1, btnIndex);
      }
    };

    setBtn(NES_BTN.up, rawButtons.up);
    setBtn(NES_BTN.down, rawButtons.down);
    setBtn(NES_BTN.left, suppressHoriz ? false : rawButtons.left);
    setBtn(NES_BTN.right, suppressHoriz ? false : rawButtons.right);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // NES A 键 (原版双截龙3卡带：A = 直拳出拳 / 夺取敌人武器并挥舞)
    const isPunchDown = rawButtons.punch || effectiveJump || macroPressA;
    setBtn(NES_BTN.a, isPunchDown);

    // NES B 键 (原版双截龙3卡带：B = 侧踢飞腿 / 滞空最高点旋风腿)
    const isKickDown = rawButtons.kick || effectiveJump || macroPressB;
    setBtn(NES_BTN.b, isKickDown);

    // 4. 3× 加速时间积分步进 (严格遵守公式：增量乘以倍率)
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
    id: "dd3-nes",
    name: "双截龙 III",
    pad: {
      layout: "diamond",
      stick: true,
      actions: [
        { id: "sp", key: "X", label: "旋风腿" },    // 上：一键旋风腿
        { id: "punch", key: "Y", label: "直拳" }, // 左：重拳直击 / 夺取武器 (NES A 键)
        { id: "kick", key: "A", label: "踢腿" },  // 右：踢腿飞脚 (NES B 键)
        { id: "jump", key: "B", label: "跳跃" }   // 下：纵身起跳 (NES A+B 键)
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
        console.error("ROM_DATA 为空，无法启动双截龙 III");
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

      // 轻量预热步进：执行 20 帧预热，直接秒出全彩 DOUBLE DRAGON III 标题画面，杜绝黑屏等待
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

    setButton: function(btn, pressed) {
      if (!btn) return;
      const b = String(btn).toLowerCase().replace(/^btn-/, "");
      if (b === "up") rawButtons.up = !!pressed;
      else if (b === "down") rawButtons.down = !!pressed;
      else if (b === "left") rawButtons.left = !!pressed;
      else if (b === "right") rawButtons.right = !!pressed;
      else if (b === "punch" || b === "y") rawButtons.punch = !!pressed;
      else if (b === "kick" || b === "a") rawButtons.kick = !!pressed;
      else if (b === "jump") {
        rawButtons.jump = !!pressed;
        if (pressed) jumpHoldFrames = 6;
      } else if (b === "sp" || b === "x") {
        rawButtons.sp = !!pressed;
      } else if (b === "start") {
        rawButtons.start = !!pressed;
        if (pressed) startHoldFrames = 8;
      } else if (b === "select") {
        rawButtons.select = !!pressed;
        if (pressed) selectHoldFrames = 8;
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
})();
