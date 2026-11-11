/**
 * core.js - 《激龟快打》(Teenage Mutant Ninja Turtles: Tournament Fighters) 掌机内核适配器
 *
 * 遵循标准避坑全书规范:
 * 1. 经典红球摇杆钻石四键掌机 (layout: "diamond", stick: true, skin: "black")
 * 2. 动作键人机工效标定:
 *    - 正下方 B 键 (黄色): 跳跃 (Jump，映射 NES A 键，手柄最省力主按键)
 *    - 正右方 A 键 (红色): 攻击出拳 (Attack/Punch，映射 NES B 键)
 *    - 正上方 X 键 (绿色): 重击踢腿 (Hard Attack/Kick)
 *    - 正左方 Y 键 (蓝色): 能量必杀绝招宏 (Super Special)
 *    - 细长中文胶囊键: 「选择」与「开始」，8帧触控防漏按压缓冲
 * 3. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧独立【复位】(带双击防误触+纯内存重置预热)、右侧独立【声音】(四重硬件静音锁)
 * 4. 设置与声音彻底解耦，内核严禁私绑任何底栏 DOM 事件
 * 5. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 6. 开机 25 帧轻量秒开预热穿透，首屏直出高保真画面
 * 7. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 8. 即时存档/读档标准双接口 (exportState / importState / saveState / loadState)
 * 9. 原版 100% 纯净逻辑，零虚假特权
 */

(function() {
  "use strict";

  // NES 标准按键索引
  const NES_BTN = {
    a: 0,      // A 键: 踢腿 (Kick) / 选单确认
    b: 1,      // B 键: 出拳 (Punch)
    select: 2, // 选择键: 模式切换
    start: 3,  // 开始键: 暂停 / 选单确认 / 开始游戏
    up: 4,     // 上: 跳跃
    down: 5,   // 下: 下蹲
    left: 6,   // 左: 后退防御
    right: 7   // 右: 前进进攻
  };

  // 原始按键状态
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    b: false,      // 正下黄键: 跳跃
    a: false,      // 正右红键: 出拳
    x: false,      // 正上绿键: 重踢
    y: false,      // 正左蓝键: 必杀宏
    select: false,
    start: false
  };

  // 胶囊键缓冲守卫 (8帧脉冲防漏按)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 必杀绝招宏执行状态机
  let specialMacroStep = 0;
  let specialMacroTimer = 0;

  // 画面渲染尺寸
  const SCREEN_WIDTH = 256;
  const SCREEN_HEIGHT = 240;

  // 离屏渲染画板
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
  let audioPrimes = 0;
  let isMute = false;
  let audioCallbacks = 0;
  let audioPeak = 0;

  // 初始化 Web Audio
  function initAudioContext() {
    if (audioCtx) return;
    const AudioContextClass = (typeof window !== "undefined")
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return;

    try {
      audioCtx = new AudioContextClass({ latencyHint: "interactive" });
    } catch (_) {
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn("AudioContext 初始化失败:", e);
        return;
      }
    }

    if (!audioCtx) return;

    const bufferSize = 2048;
    if (typeof audioCtx.createScriptProcessor === "function") {
      audioScriptNode = audioCtx.createScriptProcessor(bufferSize, 0, 2);
    } else if (typeof audioCtx.createJavaScriptNode === "function") {
      audioScriptNode = audioCtx.createJavaScriptNode(bufferSize, 0, 2);
    }

    if (audioScriptNode) {
      audioScriptNode.onaudioprocess = onAudioProcess;
      audioScriptNode.connect(audioCtx.destination);
    }
  }

  // 移动端全手势破冰激活
  function activateAudio() {
    if (isMute) return;

    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
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

    // 四重硬件静音锁：静音时直接全零输出
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
      let l = audioRingL[audioReadPtr] * 1.8;
      let r = audioRingR[audioReadPtr] * 1.8;
      if (l > 1.0) l = 1.0; else if (l < -1.0) l = -1.0;
      if (r > 1.0) r = 1.0; else if (r < -1.0) r = -1.0;
      outL[i] = l;
      outR[i] = r;
      const peak = Math.max(Math.abs(l), Math.abs(r));
      if (peak > audioPeak) audioPeak = peak;
      audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
    }
  }

  // 创建 NES 实例与挂载回调
  function createNESInstance(NESClass) {
    return new NESClass({
      onFrame: function(frameBuffer) {
        if (!offscreenCtx) return;
        for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
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

  // 主循环步进函数
  function tick() {
    if (!nes) return;

    // 1. 胶囊键缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 必杀绝招宏逻辑处理
    let macroDown = false;
    let macroRight = false;
    let macroActionA = false;
    let macroActionB = false;

    if (rawButtons.y) {
      if (specialMacroStep === 0) {
        specialMacroStep = 1;
        specialMacroTimer = 0;
      }
    }

    if (specialMacroStep > 0) {
      specialMacroTimer++;
      // 宏状态机：下(2帧) -> 下前(2帧) -> 前+拳(3帧)
      if (specialMacroStep === 1) {
        macroDown = true;
        if (specialMacroTimer >= 2) {
          specialMacroStep = 2;
          specialMacroTimer = 0;
        }
      } else if (specialMacroStep === 2) {
        macroDown = true;
        macroRight = true;
        if (specialMacroTimer >= 2) {
          specialMacroStep = 3;
          specialMacroTimer = 0;
        }
      } else if (specialMacroStep === 3) {
        macroRight = true;
        macroActionB = true;
        macroActionA = true;
        if (specialMacroTimer >= 3) {
          specialMacroStep = rawButtons.y ? 1 : 0;
          specialMacroTimer = 0;
        }
      }
    }

    // 3. 计算动作键映射真值
    // 正下方 B 键：跳跃 (映射 NES A 键，并在空中起跳)
    const isNES_A = rawButtons.b || rawButtons.x || macroActionA;
    // 正右方 A 键：出拳 (映射 NES B 键)
    const isNES_B = rawButtons.a || macroActionB;
    // 摇杆方向
    const isUp = rawButtons.up;
    const isDown = rawButtons.down || macroDown;
    const isLeft = rawButtons.left;
    const isRight = rawButtons.right || macroRight;

    // 4. 将按键状态写入 NES 控制器
    const setBtn = (btnIndex, isPressed) => {
      if (isPressed) {
        nes.buttonDown(1, btnIndex);
      } else {
        nes.buttonUp(1, btnIndex);
      }
    };

    setBtn(NES_BTN.up, isUp);
    setBtn(NES_BTN.down, isDown);
    setBtn(NES_BTN.left, isLeft);
    setBtn(NES_BTN.right, isRight);
    setBtn(NES_BTN.b, isNES_B);
    setBtn(NES_BTN.a, isNES_A);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 5. 3× 加速时间积分步进 (严格遵循公式: 增量乘以倍率)
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

  // 核心实例
  const coreInstance = {
    id: "tmnt-tournament-nes",
    name: "激龟快打",
    pad: {
      layout: "diamond",
      stick: true,
      actions: [
        { id: "b", key: "B", label: "跳跃" }, // 正下方 B 键 (黄色): 跳跃 (映射 NES A 键)
        { id: "a", key: "A", label: "出拳" }, // 正右方 A 键 (红色): 出拳 (映射 NES B 键)
        { id: "x", key: "X", label: "重踢" }, // 正上方 X 键 (绿色): 重击踢腿 (Hard Attack/Kick)
        { id: "y", key: "Y", label: "必杀" }  // 正左方 Y 键 (蓝色): 能量必杀绝招宏 (Super Special)
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
        console.error("ROM_DATA 为空，无法启动激龟快打");
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
        console.error("激龟快打 ROM 加载失败:", e);
        return;
      }

      // 开机 25 帧轻量秒开预热穿透
      try {
        for (let i = 0; i < 25; i++) {
          nes.frame();
        }
      } catch (err) {
        console.warn("预热步进警告:", err);
      }

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

      // 重置按键状态与宏缓冲
      Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
      startHoldFrames = 0;
      selectHoldFrames = 0;
      specialMacroStep = 0;
      specialMacroTimer = 0;
      accumulator = 0;
      lastTime = 0;

      // 清空音频环形缓冲区
      audioWritePtr = 0;
      audioReadPtr = 0;
      audioRingL.fill(0);
      audioRingR.fill(0);

      // 25 帧预热秒开画面
      try {
        for (let i = 0; i < 25; i++) {
          nes.frame();
        }
      } catch (_) {}

      // 激活声音
      activateAudio();
    },

    tick: tick,

    step: function() {
      return this.tick();
    },

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    },

    setButton: function(btn, isDown) {
      if (!btn) return;
      const b = String(btn).toLowerCase().replace(/^btn-/, "");

      // 别名规整与精准映射
      if (b === "up") rawButtons.up = !!isDown;
      else if (b === "down") rawButtons.down = !!isDown;
      else if (b === "left") rawButtons.left = !!isDown;
      else if (b === "right") rawButtons.right = !!isDown;
      else if (b === "b" || b === "jump") rawButtons.b = !!isDown;
      else if (b === "a" || b === "punch") rawButtons.a = !!isDown;
      else if (b === "x" || b === "kick" || b === "hard") rawButtons.x = !!isDown;
      else if (b === "y" || b === "sp" || b === "special") rawButtons.y = !!isDown;
      else if (b === "start") {
        rawButtons.start = !!isDown;
        if (isDown) startHoldFrames = 8;
      }
      else if (b === "select") {
        rawButtons.select = !!isDown;
        if (isDown) selectHoldFrames = 8;
      }

      if (isDown) {
        activateAudio();
      }
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
        const dest = audioCtx.createMediaStreamDestination();
        if (audioScriptNode) {
          audioScriptNode.connect(dest);
        }
        const tracks = dest.stream.getAudioTracks();
        if (tracks && tracks.length > 0) {
          return tracks[0];
        }
      } catch (e) {
        console.warn("connectRecordingAudio 失败:", e);
      }
      return null;
    },

    saveState: function() {
      if (!nes) return null;
      try {
        return nes.toJSON();
      } catch (e) {
        console.error("saveState 失败:", e);
        return null;
      }
    },

    loadState: function(state) {
      if (!nes || !state) return false;
      try {
        nes.fromJSON(state);
        return true;
      } catch (e) {
        console.error("loadState 失败:", e);
        return false;
      }
    },

    getState: function() {
      return this.saveState();
    },

    exportState: function() {
      if (!nes) return "";
      try {
        const json = JSON.stringify(nes.toJSON());
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.compressToUTF16 === "function") {
          return window.LZString.compressToUTF16(json);
        }
        return json;
      } catch (e) {
        console.error("exportState 失败:", e);
        return "";
      }
    },

    importState: function(raw) {
      if (!nes || !raw) return false;
      try {
        let json = raw;
        if (typeof window !== "undefined" && window.LZString && typeof window.LZString.decompressFromUTF16 === "function") {
          const decomp = window.LZString.decompressFromUTF16(raw);
          if (decomp) json = decomp;
        }
        const state = JSON.parse(json);
        nes.fromJSON(state);
        return true;
      } catch (e) {
        console.error("importState 失败:", e);
        return false;
      }
    },

    audioDiag: function() {
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

  // 挂载至全局命名空间
  if (typeof window !== "undefined") {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = coreInstance;
  }
})();
