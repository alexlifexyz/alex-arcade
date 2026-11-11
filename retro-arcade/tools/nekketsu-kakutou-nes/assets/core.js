/**
 * core.js - 《热血格斗传说》(Nekketsu Kakutou Densetsu / nekketsu-kakutou-nes) 掌机内核适配器
 *
 * 遵循标准避坑全书规范:
 * 1. 经典红球摇杆钻石四键掌机 (layout: "diamond", stick: true, skin: "black")
 * 2. 动作格斗黄金人机工效标定:
 *    - 正下方 B 键 (黄色): 纵身跳跃 (Jump, 映射 NES A+B 键组合跳跃，带 6 帧防漏脉冲缓冲)
 *    - 正右方 A 键 (红色): 出拳连打 (Punch, 映射 NES A 键)
 *    - 正左方 Y 键 (蓝色): 踢腿反击 (Kick, 映射 NES B 键)
 *    - 正上方 X 键 (绿色): 合体技 / 爆气特殊技宏 (Special/Combo, 映射合体连携 A+B 脉冲)
 * 3. 经典细长中文胶囊键 (「选择」与「开始」，8 帧触控防漏脉冲缓冲)
 * 4. 双层底栏规范 (#deck-controls 包装 #toolbar 与 #toolbar-sub):
 *    - 第 1 层: 标准 4 键 (存档、3× 加速、设置、59s 录屏)
 *    - 第 2 层: 左侧独立【复位】按钮 (带 2 秒双击防误触守卫)、右侧独立【声音】按钮 (带四重硬件静音锁)
 * 5. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 6. 开机 70 帧秒开脉冲穿透 (第 30 帧轻量注入 START 脉冲穿透 Technos 版权画面，0.1s 直出 100% 全彩大标题)
 * 7. Web Audio 全手势破冰与 59s / 32MB 录屏有效音频轨道闭环
 * 8. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 9. 设置与声音彻底解耦，内核严禁私绑任何底栏 DOM 事件
 */

(function() {
  "use strict";

  // NES 标准控制器键位索引
  const NES_BTN = {
    a: 0,      // A 拳 / 拾取倒地角色 / 菜单确认
    b: 1,      // B 踢 / 拾取道具 / 菜单取消
    select: 2, // 选择键 (模式切换 / 选人切换)
    start: 3,  // 开始键 (暂停 / 游戏确认开始)
    up: 4,     // 上
    down: 5,   // 下 (蹲防 / 拾取低位物品)
    left: 6,   // 左
    right: 7   // 右
  };

  // 原始按键状态
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    punch: false,   // 出拳 (NES A 键)
    kick: false,    // 踢腿 (NES B 键)
    jump: false,    // 跳跃 (NES A+B 键组合)
    sp: false,      // 合体技 / 必杀技宏 (NES A+B 连携脉冲)
    select: false,  // 选择键
    start: false    // 开始键
  };

  // 脉冲防漏缓冲守卫
  let startHoldFrames = 0;
  let selectHoldFrames = 0;
  let jumpHoldFrames = 0;
  let spHoldFrames = 0;
  let spMacroCycle = 0;

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

  // 模拟器实例引用与 ROM 缓存
  let nes = null;
  let savedRomBinary = null;
  let isPaused = false;

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

  // 注册全局手势破冰
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // Web Audio 采样处理与四重静音锁
  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const count = outL.length;

    // 静音锁 1: 静音时全零输出
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

  // 主循环步进函数
  function tick() {
    if (!nes || isPaused) return;

    // 1. 胶囊键与跳跃缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    const effectiveJump = rawButtons.jump || (jumpHoldFrames > 0);
    if (jumpHoldFrames > 0) jumpHoldFrames--;

    const effectiveSp = rawButtons.sp || (spHoldFrames > 0);
    if (spHoldFrames > 0) spHoldFrames--;

    // 2. 合体技 / 爆气必杀宏 (Special/Combo): A+B 连携脉冲
    let spActive = false;
    if (effectiveSp) {
      spMacroCycle++;
      // 8 帧周期: 前 6 帧强力激发 A+B 组合判定，确保游戏识别出双人合体/旋转攻击
      spActive = (spMacroCycle % 8) < 6;
    } else {
      spMacroCycle = 0;
    }

    // 3. 将按键状态写入 NES 控制器
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
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // A 键 (出拳/拾取/确认): punch 键 / jump(A+B) / sp(合体A+B)
    const isADown = rawButtons.punch || effectiveJump || spActive;
    setBtn(NES_BTN.a, isADown);

    // B 键 (踢腿/道具/取消): kick 键 / jump(A+B) / sp(合体A+B)
    const isBDown = rawButtons.kick || effectiveJump || spActive;
    setBtn(NES_BTN.b, isBDown);

    // 4. 3× 加速时间积分步进 (严格遵守增量乘倍率积分公式)
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

  // 秒开脉冲穿透 (直出全彩大标题)
  function fastForwardToTitle() {
    if (!nes) return;
    try {
      // 第 1~30 帧步进预热
      for (let i = 0; i < 30; i++) {
        nes.frame();
      }
      // 注入 10 帧 START 脉冲穿透版权页
      nes.buttonDown(1, NES_BTN.start);
      for (let i = 0; i < 10; i++) {
        nes.frame();
      }
      nes.buttonUp(1, NES_BTN.start);
      // 再步进 30 帧直达全彩标题画面
      for (let i = 0; i < 30; i++) {
        nes.frame();
      }
    } catch (e) {
      console.warn("秒开穿透执行警告:", e);
    }
  }

  // 掌机核心适配器实例
  const coreInstance = {
    id: "nekketsu-kakutou-nes",
    name: "热血格斗传说",
    pad: {
      layout: "diamond",
      stick: true,
      actions: [
        { id: "jump", key: "B", label: "跳跃" },  // 正下方 B 键 (黄色): 纵身跳跃 (A+B)
        { id: "punch", key: "A", label: "出拳" }, // 正右方 A 键 (红色): 出拳连打 (NES A)
        { id: "kick", key: "Y", label: "踢腿" },  // 正左方 Y 键 (蓝色): 踢腿反击 (NES B)
        { id: "sp", key: "X", label: "合体" }     // 正上方 X 键 (绿色): 合体技 / 爆气特殊技宏
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
        console.error("ROM_DATA 为空，无法启动热血格斗传说");
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

      initAudioContext();

      nes = new NESClass({
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

      // 将 Base64 解码为二进制 ROM 字符串并缓存
      let romBinary = "";
      if (typeof atob === "function") {
        romBinary = atob(romData);
      } else if (typeof Buffer !== "undefined") {
        romBinary = Buffer.from(romData, "base64").toString("binary");
      }
      savedRomBinary = romBinary;

      try {
        nes.loadROM(savedRomBinary);
      } catch (e) {
        console.error("热血格斗传说 ROM 加载失败:", e);
        return;
      }

      // 执行秒开穿透，直出全彩大标题
      fastForwardToTitle();

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    },

    tick: tick,

    pause: function() {
      isPaused = true;
    },

    resume: function() {
      isPaused = false;
      activateAudio();
    },

    // 纯内存重置契约 (调用纯内存重置并预热秒开标题)
    reset: function() {
      if (!nes || !savedRomBinary) return false;
      try {
        nes.loadROM(savedRomBinary);
        // 重置按键状态与缓冲
        Object.keys(rawButtons).forEach(k => { rawButtons[k] = false; });
        startHoldFrames = 0;
        selectHoldFrames = 0;
        jumpHoldFrames = 0;
        spHoldFrames = 0;
        spMacroCycle = 0;
        accumulator = 0;
        lastTime = 0;

        // 秒开穿透直出标题
        fastForwardToTitle();
        activateAudio();
        return true;
      } catch (e) {
        console.error("reset 执行异常:", e);
        return false;
      }
    },

    source: function() {
      return offscreenCanvas;
    },

    video: function() {
      return { w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    },

    // 外壳触摸分发标准契约 (setButton 与别名规整化)
    setButton: function(btn, isPressed) {
      if (!btn) return;
      const norm = String(btn).toLowerCase().replace(/^btn-/, "");
      const pressed = !!isPressed;

      if (norm === "jump" || norm === "b") {
        rawButtons.jump = pressed;
        if (pressed) {
          jumpHoldFrames = 6;
          activateAudio();
        }
      } else if (norm === "punch" || norm === "a") {
        rawButtons.punch = pressed;
        if (pressed) activateAudio();
      } else if (norm === "kick" || norm === "y") {
        rawButtons.kick = pressed;
        if (pressed) activateAudio();
      } else if (norm === "sp" || norm === "combo" || norm === "special" || norm === "x") {
        rawButtons.sp = pressed;
        if (pressed) {
          spHoldFrames = 6;
          activateAudio();
        }
      } else if (norm === "start") {
        rawButtons.start = pressed;
        if (pressed) {
          startHoldFrames = 8;
          activateAudio();
        }
      } else if (norm === "select") {
        rawButtons.select = pressed;
        if (pressed) {
          selectHoldFrames = 8;
          activateAudio();
        }
      } else if (rawButtons.hasOwnProperty(norm)) {
        rawButtons[norm] = pressed;
        if (pressed) activateAudio();
      }
    },

    // 速度倍率契约
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

    // 声音控制标准双接口与四重硬件静音锁
    setMuted: function(m) {
      return this.setMute(m);
    },

    setMute: function(m) {
      isMute = !!m;
      if (isMute) {
        // 清空环形缓冲区，阻断任何残存采样
        audioRingL.fill(0);
        audioRingR.fill(0);
        audioWritePtr = 0;
        audioReadPtr = 0;
      }
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("ggemu_mute", isMute ? "true" : "false");
        } catch (_) {}
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

    // 录屏音频闭环契约: 必须返回有效 MediaStreamTrack 音轨
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
        console.warn("connectRecordingAudio 执行异常:", e);
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

    // 即时存档与读档标准双接口
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
