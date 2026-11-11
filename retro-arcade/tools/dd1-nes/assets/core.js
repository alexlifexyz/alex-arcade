/**
 * core.js - 《双截龙》(Double Dragon / dd1-nes) 掌机内核适配器
 *
 * 遵循避坑全书与参考双截龙二经典动作人机工效规范:
 * 1. 经典钻石四键掌机 + 红球摇杆 (layout: "diamond", stick: true)
 * 2. 经典横版格斗动作按键人机工效标定:
 *    - 正下方 B 键: 【跳跃】(Jump，内部映射为 NES A + B 同时按下，起跳与飞踢瞬发)
 *    - 正右方 A 键: 【出拳】(Punch / 抓发膝顶 / 投技 / 捡拾武器，NES A 键)
 *    - 正左方 Y 键: 【踢腿】(Kick，NES B 键)
 *    - 正上方 X 键: 【连发】(Turbo，快速连击轰杀敌人)
 * 3. 细长中文胶囊键 (「选择」与「开始」，8帧按压缓冲，大热区，严禁标投币)
 * 4. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧【复位】(reset标准契约+纯内存重置预热直出标题)、右侧【声音】(四重硬件静音锁)
 * 5. 设置与声音彻底解耦，内核严禁私绑任何底栏 DOM 事件
 * 6. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 7. 开机 80 帧轻量秒开预热穿透 (保证首屏 0.1s 直出全彩 DOUBLE DRAGON 经典街机大标题)
 * 8. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 9. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 10. 保持原汁原味机台纯净逻辑，零虚假特权
 */

(function() {
  "use strict";

  // NES 标准按键索引 (JSNES 规范)
  const NES_BTN = {
    a: 0,      // A 键: 出拳 / 抓发膝顶 / 投技 (Punch / Grab / Throw)
    b: 1,      // B 键: 踢腿 (Kick)
    select: 2, // 选择键: 模式切换 (Select)
    start: 3,  // 开始键: 暂停 / 确认 / 开始游戏 (Start)
    up: 4,     // 上: 向上移动
    down: 5,   // 下: 向下移动
    left: 6,   // 左: 向左跑动
    right: 7   // 右: 向右跑动
  };

  // 原始按键状态 (含跳跃与连发)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // 出拳 (NES A)
    b: false,     // 踢腿 (NES B)
    jump: false,  // 跳跃 (同时触发 NES A + B，跳跃与飞踢)
    sp: false,    // 连发 (Turbo)
    select: false,
    start: false
  };

  // 连发节拍器
  let turboTick = 0;

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

  // 激活音频 (全手势破冰与 DAC 通电)
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

  // 挂载全局手势唤醒
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

  // 创建 NES 实例与挂载回调
  function createNESInstance(NESClass) {
    return new NESClass({
      onFrame: function(frameBuffer) {
        if (!offscreenCtx) return;
        for (let i = 0; i < 256 * 240; i++) {
          offscreenBuf32[i] = 0xFF000000 | frameBuffer[i];
        }
        offscreenCtx.putImageData(offscreenImageData, 0, 0);
      },
      onAudioSample: function(left, right) {
        if (isMute) return;
        const nextPtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
        if (nextPtr !== audioReadPtr) {
          audioRingL[audioWritePtr] = left;
          audioRingR[audioWritePtr] = right;
          audioWritePtr = nextPtr;
        }
      },
      sampleRate: (audioCtx && audioCtx.sampleRate) ? audioCtx.sampleRate : 44100
    });
  }

  // 秒开预热步进：穿透开场等待，直接进入经典大标题画面
  function warmUpToTitle(targetNes) {
    if (!targetNes) return;
    try {
      for (let f = 1; f <= 80; f++) {
        targetNes.frame();
      }
    } catch (err) {
      console.warn("预热步进警告:", err);
    }
  }

  // 主循环步进函数
  function tick() {
    if (!nes) return;

    // 1. 胶囊键缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    turboTick++;

    // 2. 将按键状态写入 NES 控制器
    const setBtn = (btnIndex, isDown) => {
      if (isDown) {
        nes.buttonDown(1, btnIndex);
      } else {
        nes.buttonUp(1, btnIndex);
      }
    };

    // 方向键
    setBtn(NES_BTN.up, rawButtons.up);
    setBtn(NES_BTN.down, rawButtons.down);
    setBtn(NES_BTN.left, rawButtons.left);
    setBtn(NES_BTN.right, rawButtons.right);

    // 连发计算 (快速交替出拳)
    const isTurbo = rawButtons.sp && (turboTick % 4 < 2);

    // A 键判定：出拳 / 跳跃 / 连发
    const isADown = rawButtons.a || rawButtons.jump || isTurbo;
    setBtn(NES_BTN.a, isADown);

    // B 键判定：踢腿 / 跳跃
    const isBDown = rawButtons.b || rawButtons.jump;
    setBtn(NES_BTN.b, isBDown);

    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 3. 3× 加速时间积分步进 (严格遵循公式: 增量乘以倍率)
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

  // 获取 JSNES 构造函数
  function getNESClass() {
    const NESModule = (typeof window !== "undefined" && window.NES_MODULE) ? window.NES_MODULE :
                      ((typeof NES_MODULE !== "undefined") ? NES_MODULE : null);
    return NESModule ? (NESModule.default || NESModule.NES || NESModule) :
           ((typeof window !== "undefined" && window.jsnes && window.jsnes.NES) ? window.jsnes.NES : null);
  }

  // 动作键定义 (经典四键布局：上连发X、左踢腿Y、右出拳A、下跳跃B)
  const ACTIONS = [
    { id: "sp", label: "连发", key: "X" },
    { id: "b", label: "踢腿", key: "Y" },
    { id: "a", label: "出拳", key: "A" },
    { id: "jump", label: "跳跃", key: "B" }
  ];

  // 键盘映射（支持桌面调试）
  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    KeyJ: "a",        // J: 出拳 (A)
    KeyK: "b",        // K: 踢腿 (B)
    KeySpace: "jump", // 空格: 跳跃 (A+B)
    KeyI: "jump",     // I: 跳跃 (A+B)
    KeyU: "sp",       // U: 连发 (X)
    ShiftLeft: "select",
    ShiftRight: "select",
    Enter: "start"
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("keydown", function(e) {
      const btn = KEY_MAP[e.code];
      if (btn && rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = true;
        if (btn === "start") startHoldFrames = 8;
        if (btn === "select") selectHoldFrames = 8;
        activateAudio();
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", function(e) {
      const btn = KEY_MAP[e.code];
      if (btn && rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = false;
        e.preventDefault();
      }
    });
  }

  // 核心实例
  const coreInstance = {
    id: "dd1-nes",
    name: "双截龙",
    pad: {
      layout: "diamond",
      stick: true,
      actions: ACTIONS,
      geom: { rf: 0.62, dd: 1.5, hit: 10 },
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ]
    },

    boot: function(arg1, arg2) {
      const romData = typeof arg1 === "string" ? arg1 : (typeof window !== "undefined" ? window.ROM_DATA : null);
      const host = (arg2 && typeof arg2 === "object") ? arg2 : ((arg1 && typeof arg1 === "object") ? arg1 : null);

      if (!romData) {
        console.error("ROM_DATA 为空，无法启动双截龙");
        return;
      }

      const NESClass = getNESClass();
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      initAudioContext();
      nes = createNESInstance(NESClass);

      // 将 Base64 解码为二进制 ROM 并缓存加载
      if (typeof atob === "function") {
        cachedRomBinary = atob(romData);
      } else if (typeof Buffer !== "undefined") {
        cachedRomBinary = Buffer.from(romData, "base64").toString("binary");
      }

      try {
        nes.loadROM(cachedRomBinary);
      } catch (e) {
        console.error("双截龙 ROM 加载失败:", e);
        return;
      }

      // 开机秒开预热穿透：步进至经典大标题画面，首屏 0.1s 直出全彩
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
      turboTick = 0;

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
      speedMultiplier = Math.max(1, Math.min(3, mul || 1));
      accumulator = 0;
      lastTime = 0;
    },

    setSpeedMultiplier: function(mul) {
      this.setSpeed(mul);
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    toggleSpeed: function() {
      const newSpd = (speedMultiplier === 1) ? 3 : 1;
      this.setSpeed(newSpd);
      return newSpd;
    },

    isMuted: function() {
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
