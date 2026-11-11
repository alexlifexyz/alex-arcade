/**
 * core.js - 《绿色兵团》(Rush'n Attack / rush-nes) 掌机内核适配器
 *
 * 遵循避坑全书规范:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 经典动作射击按键映射:
 *    - 正圆 A 键: 跳跃 (Jump)
 *    - 正圆 B 键: 出刀突刺 (Knife Stab) / 火箭筒、手雷、手枪攻击
 * 3. 细长中文胶囊键 (「选择」与「开始」，8帧按压缓冲，大热区，严禁标投币)
 * 4. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧【复位】(reset标准契约+纯内存重置预热直出标题)、右侧【声音】(四重硬件静音锁)
 * 5. 设置与声音彻底解耦，内核严禁私绑任何底栏 DOM 事件
 * 6. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 7. 开机 25 帧秒开预热穿透 (保证首屏 0.1s 直出全彩 RUSH'N ATTACK 经典大标题)
 * 8. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 9. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 10. 保持原汁原味机台纯净逻辑，零虚假特权
 */

(function() {
  "use strict";

  // NES 标准按键索引 (JSNES 规范)
  const NES_BTN = {
    a: 0,      // A 键: 跳跃 (Jump)
    b: 1,      // B 键: 出刀突刺 (Knife Stab) / 特殊武器
    select: 2, // 选择键: 模式切换 (Select)
    start: 3,  // 开始键: 暂停 / 确认 / 开始游戏 (Start)
    up: 4,     // 上: 爬梯子 (Climb)
    down: 5,   // 下: 趴下匍匐前行 / 避开子弹与迫击炮 (Crouch)
    left: 6,   // 左: 向左跑动
    right: 7   // 右: 向右跑动
  };

  // 原始按键状态
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

  // 胶囊键缓冲守卫 (8帧脉冲防漏按)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 画面渲染尺寸
  const SCREEN_WIDTH = 256;
  const SCREEN_HEIGHT = 240;

  // 离屏渲染缓冲
  const offscreenCanvas = (typeof document !== "undefined" && document.createElement)
    ? document.createElement("canvas")
    : { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => null };
  offscreenCanvas.width = SCREEN_WIDTH;
  offscreenCanvas.height = SCREEN_HEIGHT;
  const offscreenCtx = (typeof offscreenCanvas.getContext === "function")
    ? offscreenCanvas.getContext("2d", { alpha: false })
    : null;
  const offscreenImageData = offscreenCtx
    ? offscreenCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT)
    : { data: new Uint32Array(SCREEN_WIDTH * SCREEN_HEIGHT) };
  const offscreenBuf32 = new Uint32Array(offscreenImageData.data.buffer);

  // 模拟器实例引用与 ROM 二进制缓存
  let nes = null;
  let cachedRomBinary = null;

  // 运行速度倍率与时间积分
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

  // Web Audio 环形缓冲区 (32768)
  const AUDIO_BUF_SIZE = 32768;
  const audioRingL = new Float32Array(AUDIO_BUF_SIZE);
  const audioRingR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioMediaDest = null;
  let audioPrimes = 0;
  let isMute = false;
  let audioCallbacks = 0;

  // 初始化 Web Audio
  function initAudioContext() {
    if (audioCtx) return;
    const AudioContextClass = (typeof window !== "undefined")
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return;

    try {
      try {
        audioCtx = new AudioContextClass({ sampleRate: 44100 });
      } catch (_) {
        audioCtx = new AudioContextClass();
      }

      if (typeof audioCtx.createScriptProcessor === "function") {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
      } else if (typeof audioCtx.createJavaScriptNode === "function") {
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

  // 激活音频 (移动端手势破冰)
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

    // 移动端 1 采样静音通电
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

  // 全手势事件监听
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // 音频处理回调 (四重静音锁保证)
  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;

    if (isMute) {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    const avail = (audioWritePtr - audioReadPtr + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
    if (avail < count) {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    for (let i = 0; i < count; i++) {
      outL[i] = audioRingL[audioReadPtr];
      outR[i] = audioRingR[audioReadPtr];
      audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
    }
  }

  // 音频采样写入环形缓冲
  function handleAudioSample(left, right) {
    if (isMute) return;
    audioRingL[audioWritePtr] = left;
    audioRingR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
  }

  // 画面像素渲染写入
  function renderVideoFrame(buffer) {
    if (!offscreenBuf32 || !buffer) return;
    for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
      offscreenBuf32[i] = 0xFF000000 | buffer[i];
    }
    if (offscreenCtx) {
      offscreenCtx.putImageData(offscreenImageData, 0, 0);
    }
  }

  // 步进预热秒开标题画面
  function warmUpToTitle(nesInst) {
    if (!nesInst) return;
    try {
      for (let f = 0; f < 25; f++) {
        nesInst.frame();
      }
    } catch (e) {
      console.warn("预热步进警告:", e);
    }
  }

  // 获取 JSNES 构造函数
  function getNESClass() {
    if (typeof NES_MODULE !== "undefined" && NES_MODULE) {
      return NES_MODULE.default || NES_MODULE.NES || NES_MODULE;
    }
    if (typeof window !== "undefined") {
      if (window.NES_MODULE) {
        return window.NES_MODULE.default || window.NES_MODULE.NES || window.NES_MODULE;
      }
      if (window.jsnes && window.jsnes.NES) {
        return window.jsnes.NES;
      }
    }
    return null;
  }

  // 实例化 JSNES
  function createNESInstance(NESClass) {
    return new NESClass({
      onFrame: renderVideoFrame,
      onAudioSample: handleAudioSample
    });
  }

  // 主循环推进逻辑
  function tick() {
    if (!nes) return;

    // 1. 胶囊键缓冲处理
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 映射按键至 NES Controller 1
    const setBtn = (btnIdx, isDown) => {
      if (isDown) {
        nes.buttonDown(1, btnIdx);
      } else {
        nes.buttonUp(1, btnIdx);
      }
    };

    setBtn(NES_BTN.a, rawButtons.a);
    setBtn(NES_BTN.b, rawButtons.b);
    setBtn(NES_BTN.select, effectiveSelect);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.up, rawButtons.up);
    setBtn(NES_BTN.down, rawButtons.down);
    setBtn(NES_BTN.left, rawButtons.left);
    setBtn(NES_BTN.right, rawButtons.right);

    // 3. 3× 加速时间积分步进
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

  // 导出核心实例对象
  const coreInstance = {
    id: "rush-nes",
    name: "绿色兵团",

    // 外壳布局规范: 标准两键掌机 + 经典十字键
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "B" }, // B 出刀刺杀 / 武器攻击
        { id: "a", key: "A", label: "A" }  // A 跳跃
      ],
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },

    boot: function(arg1, arg2) {
      const romData = typeof arg1 === "string" ? arg1 : (typeof window !== "undefined" ? (window.ROM_DATA || window.RUSH_ROM_BASE64) : null);
      const host = (arg2 && typeof arg2 === "object") ? arg2 : ((arg1 && typeof arg1 === "object") ? arg1 : null);

      if (!romData) {
        console.error("ROM 数据为空，无法启动绿色兵团");
        return;
      }

      const NESClass = getNESClass();
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NESClass missing)");
        return;
      }

      nes = createNESInstance(NESClass);

      try {
        cachedRomBinary = (typeof atob === "function")
          ? atob(romData)
          : Buffer.from(romData, "base64").toString("binary");
      } catch (e) {
        console.error("ROM 解码失败:", e);
        return;
      }

      try {
        nes.loadROM(cachedRomBinary);
      } catch (e) {
        console.error("绿色兵团 ROM 加载失败:", e);
        return;
      }

      // 开机秒开预热穿透：25 帧步进直出全彩大标题
      warmUpToTitle(nes);

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    },

    reset: function() {
      if (!cachedRomBinary) {
        console.warn("无 ROM 缓存，无法重置");
        return;
      }
      const NESClass = getNESClass();
      if (!NESClass) return;

      // 纯内存重置
      nes = createNESInstance(NESClass);
      try {
        nes.loadROM(cachedRomBinary);
      } catch (e) {
        console.error("重置加载 ROM 失败:", e);
        return;
      }

      // 重置按键状态与缓冲
      Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
      startHoldFrames = 0;
      selectHoldFrames = 0;
      accumulator = 0;
      lastTime = 0;

      // 清空音频环形缓冲区
      audioWritePtr = 0;
      audioReadPtr = 0;
      audioRingL.fill(0);
      audioRingR.fill(0);

      // 预热秒开大标题
      warmUpToTitle(nes);

      // 激活声音
      activateAudio();
    },

    tick: tick,

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    },

    setButton: function(btn, isDown) {
      if (!btn) return;
      const b = String(btn).toLowerCase().replace(/^btn-/, "");
      if (rawButtons.hasOwnProperty(b)) {
        rawButtons[b] = !!isDown;
        if (isDown) {
          if (b === "start") startHoldFrames = 8;
          if (b === "select") selectHoldFrames = 8;
          activateAudio();
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

    setSpeed: function(mul) {
      speedMultiplier = Math.max(1, Math.min(3, Number(mul) || 1));
      accumulator = 0;
      lastTime = 0;
      return speedMultiplier;
    },

    setSpeedMultiplier: function(mul) {
      return this.setSpeed(mul);
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    toggleSpeed: function() {
      const newSpd = (speedMultiplier === 1) ? 3 : 1;
      return this.setSpeed(newSpd);
    },

    isMuted: function() {
      return isMute;
    },

    isMute: function() {
      return isMute;
    },

    setMute: function(val) {
      isMute = !!val;
      if (isMute) {
        audioWritePtr = 0;
        audioReadPtr = 0;
        audioRingL.fill(0);
        audioRingR.fill(0);
      }
      return isMute;
    },

    setMuted: function(val) {
      return this.setMute(val);
    },

    toggleMute: function() {
      return this.setMute(!isMute);
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    connectRecordingAudio: function() {
      activateAudio();
      if (!audioCtx) initAudioContext();
      if (!audioCtx) return null;

      try {
        if (!audioMediaDest && typeof audioCtx.createMediaStreamDestination === "function") {
          audioMediaDest = audioCtx.createMediaStreamDestination();
          if (audioScriptNode) {
            audioScriptNode.connect(audioMediaDest);
          }
        }
        if (audioMediaDest && audioMediaDest.stream) {
          const tracks = audioMediaDest.stream.getAudioTracks();
          if (tracks && tracks.length > 0) {
            return tracks[0];
          }
        }
      } catch (e) {
        console.warn("connectRecordingAudio error:", e);
      }
      return null;
    },

    audioDiag: function() {
      return {
        audioCtxState: audioCtx ? audioCtx.state : "none",
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
        audioReadPtr = audioWritePtr;
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
