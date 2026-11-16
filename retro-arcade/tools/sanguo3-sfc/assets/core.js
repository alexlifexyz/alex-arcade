/**
 * core.js - 《三国志3 中文版》(sanguo3-sfc) 掌机内核适配器
 *
 * 研发规范与契约实现:
 * 1. 标准钻石四键掌机 (layout: "diamond", stick: false)
 * 2. 细长中文胶囊功能键 (「选择」与「开始」，8 帧触控防漏脉冲缓冲)
 * 3. A 键确认，B 键取消，X 键缩放/信息，Y 键辅助，L/R 切换都市/武将
 * 4. 3× 加速单步推进: speedMultiplier > 1 时单帧额外执行 (speedMultiplier - 1) 次单步推进
 * 5. 开机 750 帧秒开脉冲穿透，直达 100% 全彩大标题与激昂背景音乐
 * 6. 现代 32768 环形缓冲区 (Ring Buffer) + Ping-Pong 双缓冲精准翻转推流 (比率 0.99)
 * 7. onaudioprocess 线性插值重采样 (36000Hz -> 44100Hz/48000Hz)
 * 8. iOS WebKit 6 阶段 DAC 通电破冰 + navigator.audioSession + 小红书 enableAudio 穿透
 * 9. 四重硬件级静音锁 + 59s / 32MB 录屏音频闭环 (connectRecordingAudio)
 * 10. 即时存档/读档标准双接口契约 (exportState / importState) 配合 lzstring 压缩
 * 11. core.reset() 纯内存重置并预热秒开标题
 * 12. 设置与声音彻底解耦，严禁私自监听底栏 DOM
 */

(function() {
  "use strict";

  // SFC 手柄按键掩码定义 (Super Nintendo Controller 1)
  const SFC_BTN_MASK = {
    up: 2048,
    down: 1024,
    left: 512,
    right: 256,
    a: 128,      // A 键: 确认 / 选择指令
    b: 32768,    // B 键: 取消 / 返回上级
    x: 64,       // X 键: 地图信息 / 缩放
    y: 16384,    // Y 键: 辅助功能 / 状态
    l: 32,       // L 键: 切换上一个都市
    r: 16,       // R 键: 切换下一个都市
    start: 4096, // 开始键: 确定 / 推进
    select: 8192 // 选择键: 辅助切换
  };

  // 原始按键状态
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false
  };

  // 功能键 8 帧触控防漏缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 画面渲染规格 (SFC 标准解析度: 256x224)
  const SCREEN_WIDTH = 256;
  const SCREEN_HEIGHT = 224;

  // 模拟器状态与时间累加
  let isBooted = false;
  let speedMultiplier = 1;
  let hostCallbacks = null;

  // ==========================================
  // 现代 32768 环形缓冲区 (Ring Buffer) 音频架构
  // ==========================================
  const RING_SIZE = 32768;
  const ringBufferL = new Float32Array(RING_SIZE);
  const ringBufferR = new Float32Array(RING_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0.0;
  let lastTogglePos = -1;
  let primeCount = 0;

  let audioCtx = null;
  let audioScriptNode = null;
  let masterGainNode = null;
  let mediaStreamDest = null;
  let isMute = false;

  // 读取持久化静音配置
  try {
    if (typeof localStorage !== "undefined") {
      const savedSettings = localStorage.getItem("ggemu_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed && typeof parsed.sound === "boolean") {
          isMute = !parsed.sound;
        }
      }
    }
  } catch (_) {}

  // 掌机外壳按键布局配置 (严格遵守 diamond 规范与黄金自适应黑框间距)
  const padConfig = {
    name: "三国志3",
    layout: "diamond",
    stick: false,
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    actions: [
      { id: "btn-b", key: "B", label: "B", color: "yellow" },
      { id: "btn-a", key: "A", label: "A", color: "red" },
      { id: "btn-x", key: "X", label: "X", color: "green" },
      { id: "btn-y", key: "Y", label: "Y", color: "blue" }
    ],
    capsules: [
      { id: "btn-select", label: "选择" },
      { id: "btn-start", label: "开始" }
    ],
    shoulders: [
      { id: "btn-l", label: "L" },
      { id: "btn-r", label: "R" }
    ]
  };

  // Base64 转 ArrayBuffer
  function base64ToArrayBuffer(base64) {
    const binaryStr = window.atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Ping-Pong 双缓冲精准翻转推流 (比率严格保持 1:1 杜绝重复帧与积压)
  function pushAudioSamples(ptr, heapF32) {
    if (!ptr || !heapF32) return;
    const mod = window.SuperNintendoModule;
    if (!mod || !mod.HEAP8) return;

    const h32 = new Int32Array(mod.HEAP8.buffer);
    const curToggle = h32[24052];
    if (curToggle === lastTogglePos) {
      // 这一帧 C 内核在累加未产出新 2048 块，直接跳过
      return;
    }
    lastTogglePos = curToggle;

    const soundBuf = new Float32Array(heapF32.buffer, ptr, 4096);
    for (let i = 0; i < 2048; i++) {
      ringBufferL[audioWritePtr] = soundBuf[i];
      ringBufferR[audioWritePtr] = soundBuf[i + 2048];
      audioWritePtr = (audioWritePtr + 1) & (RING_SIZE - 1);
    }
  }

  // 挂载全局音频钩子，接收 sfc.min.js 的音频数据
  window.SUPERNINTENDO_AUDIO_HOOK = pushAudioSamples;

  // onaudioprocess 线性插值重采样回调
  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const outLen = outL.length;

    // 四重硬件级静音锁
    if (isMute) {
      for (let i = 0; i < outLen; i++) {
        outL[i] = 0.0;
        outR[i] = 0.0;
      }
      return;
    }

    const hostSampleRate = (audioCtx && audioCtx.sampleRate) ? audioCtx.sampleRate : 44100;
    const sfcSampleRate = 36000;
    const step = sfcSampleRate / hostSampleRate;

    // 计算当前环形缓冲区内可用采样量
    let available = audioWritePtr - Math.floor(audioReadPtr);
    if (available < 0) available += RING_SIZE;

    // 缓冲区保护: 若积压严重 (超过 16384 样本)，追赶丢弃旧样本
    if (available > 16384) {
      audioReadPtr = (audioWritePtr - 4096 + RING_SIZE) & (RING_SIZE - 1);
      available = 4096;
    }

    // 若样本过少 (不足 64 样本)，静音填充防爆音
    if (available < 64) {
      for (let i = 0; i < outLen; i++) {
        outL[i] = 0.0;
        outR[i] = 0.0;
      }
      return;
    }

    // 线性插值重采样
    for (let i = 0; i < outLen; i++) {
      const idx0 = Math.floor(audioReadPtr);
      const idx1 = (idx0 + 1) & (RING_SIZE - 1);
      const frac = audioReadPtr - idx0;

      const sL0 = ringBufferL[idx0];
      const sL1 = ringBufferL[idx1];
      const sR0 = ringBufferR[idx0];
      const sR1 = ringBufferR[idx1];

      outL[i] = sL0 + (sL1 - sL0) * frac;
      outR[i] = sR0 + (sR1 - sR0) * frac;

      audioReadPtr = (audioReadPtr + step) % RING_SIZE;
    }
  }

  // 手势破冰与 iOS WebKit DAC 强力通电激活
  function activateAudio() {
    if (isMute) return;

    // 1. iOS AudioSession 提权至 playback (穿透 iPhone 侧边静音物理开关)
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    // 2. 借助 audio 标签唤醒系统媒体通道
    try {
      if (typeof document !== "undefined") {
        const bgmEl = document.getElementById("bgm-unlocker");
        if (bgmEl && bgmEl.paused) {
          bgmEl.play().catch(function() {});
        }
      }
    } catch (_) {}

    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      audioScriptNode = null;
      masterGainNode = null;
    }

    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        audioCtx = new AudioContextClass();
      } catch (_) {
        audioCtx = null;
        return;
      }

      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = isMute ? 0.0 : 1.0;
      masterGainNode.connect(audioCtx.destination);
    }

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function() {});
    }

    // 3. 移动端 WebKit DAC 通电破冰 (播放 1 样本微脉冲解锁 CoreAudio 硬件总线)
    if (audioCtx && primeCount < 6) {
      primeCount++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        dummy.connect(audioCtx.destination);
        if (dummy.start) dummy.start(0);
        else if (dummy.noteOn) dummy.noteOn(0);
      } catch (_) {}
    }

    // 4. 小红书客户端沙盒静音锁穿透
    try {
      if (typeof window !== "undefined" && window.xhs && window.xhs.miniTool && typeof window.xhs.miniTool.enableAudio === "function") {
        window.xhs.miniTool.enableAudio();
      }
    } catch (_) {}

    // 5. 关键：在当前手势调用栈内直接同步创建并挂载 scriptNode，绝不使用 Promise.then 异步延迟
    if (audioCtx && !audioScriptNode) {
      try {
        if (typeof audioCtx.createScriptProcessor === "function") {
          audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
          audioScriptNode.onaudioprocess = onAudioProcess;
          if (masterGainNode) {
            audioScriptNode.connect(masterGainNode);
          } else {
            audioScriptNode.connect(audioCtx.destination);
          }
          if (mediaStreamDest && masterGainNode) {
            try { masterGainNode.connect(mediaStreamDest); } catch (_) {}
          }
          audioReadPtr = audioWritePtr;
        }
      } catch (e) {
        console.warn("[SFC Audio] createScriptProcessor error:", e);
      }
    }
  }

  // 注册全量手势监听 (捕获阶段，防止被 preventDefault 吞没)
  if (typeof window !== "undefined") {
    const AUDIO_GESTURES = ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"];
    AUDIO_GESTURES.forEach(function(evt) {
      window.addEventListener(evt, function() {
        if (!audioScriptNode || primeCount < 6 || (audioCtx && audioCtx.state !== "running")) {
          activateAudio();
        }
      }, { passive: true, capture: true });
      document.addEventListener(evt, function() {
        if (!audioScriptNode || primeCount < 6 || (audioCtx && audioCtx.state !== "running")) {
          activateAudio();
        }
      }, { passive: true, capture: true });
    });
  }

  // 同步按键掩码至全局变量
  function syncKeyInput() {
    let mask = 0;
    if (rawButtons.up) mask |= SFC_BTN_MASK.up;
    if (rawButtons.down) mask |= SFC_BTN_MASK.down;
    if (rawButtons.left) mask |= SFC_BTN_MASK.left;
    if (rawButtons.right) mask |= SFC_BTN_MASK.right;
    if (rawButtons.a) mask |= SFC_BTN_MASK.a;
    if (rawButtons.b) mask |= SFC_BTN_MASK.b;
    if (rawButtons.x) mask |= SFC_BTN_MASK.x;
    if (rawButtons.y) mask |= SFC_BTN_MASK.y;
    if (rawButtons.l) mask |= SFC_BTN_MASK.l;
    if (rawButtons.r) mask |= SFC_BTN_MASK.r;

    // 叠加 8 帧防漏缓冲与 START/A 键双保险 (避坑指南第32条: 确保菜单确认100%响应)
    if (rawButtons.start || startHoldFrames > 0) {
      mask |= (SFC_BTN_MASK.start | SFC_BTN_MASK.a);
    }
    if (rawButtons.select || selectHoldFrames > 0) {
      mask |= SFC_BTN_MASK.select;
    }

    window.SUPERNINTENDO_KEY_INPUT_1 = mask;
    window.SUPERNINTENDO_KEY_INPUT_2 = 0;
  }

  // 掌机内核导出对象
  const coreInstance = {
    name: "三国志3",

    // 按键布局与工业设计规范配置
    get pad() {
      return padConfig;
    },

    // 离屏渲染源与规格契约 (支持函数调用与属性访问)
    source: function() {
      return window.SUPERNINTENDO_CANVAS || null;
    },

    video: function() {
      return {
        w: SCREEN_WIDTH,
        h: SCREEN_HEIGHT
      };
    },

    // 内核初始化与启动契约
    boot: function(romBase64, host) {
      hostCallbacks = host || null;

      // 提取 ROM 数据
      let targetRomBase64 = "";
      if (typeof romBase64 === "string" && romBase64.length > 100) {
        targetRomBase64 = romBase64;
      } else if (typeof window.ROM_DATA === "string" && window.ROM_DATA.length > 100) {
        targetRomBase64 = window.ROM_DATA;
      } else if (typeof window.SANGUO3_ROM_B64 === "string" && window.SANGUO3_ROM_B64.length > 100) {
        targetRomBase64 = window.SANGUO3_ROM_B64;
      }

      if (!targetRomBase64) {
        console.error("[SFC Core] Missing valid ROM base64 data");
        return;
      }

      const romBuffer = base64ToArrayBuffer(targetRomBase64);

      // 异步守护等待 asm.js 模块完全初始化
      const waitAndBoot = function() {
        const mod = window.SuperNintendoModule;
        if (!mod || typeof mod._my_malloc !== "function" || typeof mod._startWithRom !== "function") {
          setTimeout(waitAndBoot, 30);
          return;
        }

        try {
          // 确保 DOM 容器存在
          let containerEl = document.getElementById("sfc-container") || document.getElementById("sfc-viewport-container");
          if (!containerEl && typeof document.createElement === "function") {
            try {
              containerEl = document.createElement("div");
              containerEl.id = "sfc-container";
              containerEl.style.display = "none";
              (document.body || document.documentElement || document).appendChild(containerEl);
            } catch (_) {}
          }
          const targetContainerId = (containerEl && typeof containerEl.id === "string" && containerEl.id) ? containerEl.id : "sfc-container";

          // 挂载 ROM 并初始化模拟器
          if (typeof window.embedSuperNintendo === "function") {
            window.embedSuperNintendo({
              name: "三国志3",
              rom: romBuffer,
              container: targetContainerId
            });
          }

          // 核心 1250 帧秒开脉冲穿透: 周期性脉冲穿透 KOEI 开头与漫长文字滚屏，直达 100% 全彩大菜单
          if (typeof window.stepSuperNintendoFrame === "function") {
            for (let f = 0; f < 1250; f++) {
              if (f % 60 < 15) {
                window.SUPERNINTENDO_KEY_INPUT_1 = SFC_BTN_MASK.start;
              } else {
                window.SUPERNINTENDO_KEY_INPUT_1 = 0;
              }
              window.stepSuperNintendoFrame();
            }
            window.SUPERNINTENDO_KEY_INPUT_1 = 0;
          }

          isBooted = true;

          // 尝试手势激活
          activateAudio();

          // 触发外壳就绪渲染循环
          if (hostCallbacks && typeof hostCallbacks.onReady === "function") {
            hostCallbacks.onReady();
          }
        } catch (err) {
          console.error("[SFC Core] Boot exception:", err);
          if (hostCallbacks && typeof hostCallbacks.onReady === "function") {
            hostCallbacks.onReady();
          }
        }
      };

      waitAndBoot();
      return true;
    },

    // 外壳触摸分发标准契约 (setButton 与前缀规整化)
    setButton: function(btnId, isPressed) {
      if (isPressed) {
        activateAudio();
      }

      const norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      const pressed = !!isPressed;

      if (rawButtons.hasOwnProperty(norm)) {
        rawButtons[norm] = pressed;

        // 家用机功能键 8 帧防漏缓冲
        if (norm === "start" && pressed) {
          startHoldFrames = 8;
        }
        if (norm === "select" && pressed) {
          selectHoldFrames = 8;
        }

        syncKeyInput();
      }
    },

    // 外壳主循环驱动契约 (单步推进与加速时间积分)
    tick: function() {
      // 维护 8 帧防漏缓冲倒计时
      let holdChanged = false;
      if (startHoldFrames > 0 && !rawButtons.start) {
        startHoldFrames--;
        holdChanged = true;
      }
      if (selectHoldFrames > 0 && !rawButtons.select) {
        selectHoldFrames--;
        holdChanged = true;
      }
      if (holdChanged) {
        syncKeyInput();
      }

      // 3× 加速真实单步推进
      if (speedMultiplier > 1 && typeof window.stepSuperNintendoFrame === "function") {
        const extraSteps = speedMultiplier - 1;
        for (let i = 0; i < extraSteps; i++) {
          window.stepSuperNintendoFrame();
        }
      }
    },

    // 速度倍率设置契约
    setSpeed: function(multiplier) {
      speedMultiplier = Math.max(1, Math.min(3, multiplier || 1));
    },

    setSpeedMultiplier: function(multiplier) {
      this.setSpeed(multiplier);
    },

    // 纯内存即时存档导出契约
    exportState: function() {
      try {
        if (typeof window.getSuperNintendoState === "function") {
          const stateBuf = window.getSuperNintendoState();
          if (!stateBuf || !stateBuf.length) return null;

          let binaryStr = "";
          const len = stateBuf.length;
          const chunkSize = 8192;
          for (let i = 0; i < len; i += chunkSize) {
            const chunk = stateBuf.subarray(i, Math.min(i + chunkSize, len));
            binaryStr += String.fromCharCode.apply(null, chunk);
          }

          if (window.LZString && typeof window.LZString.compressToBase64 === "function") {
            return window.LZString.compressToBase64(binaryStr);
          }
          return window.btoa(binaryStr);
        }
      } catch (e) {
        console.error("[SFC exportState error]", e);
      }
      return null;
    },

    // 纯内存即时存档载入契约
    importState: function(rawStateStr) {
      try {
        if (!rawStateStr || typeof window.setSuperNintendoState !== "function") return false;

        let binaryStr = "";
        if (window.LZString && typeof window.LZString.decompressFromBase64 === "function") {
          binaryStr = window.LZString.decompressFromBase64(rawStateStr);
        }
        if (!binaryStr) {
          binaryStr = window.atob(rawStateStr);
        }
        if (!binaryStr) return false;

        const len = binaryStr.length;
        const stateBuf = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          stateBuf[i] = binaryStr.charCodeAt(i);
        }

        const ok = window.setSuperNintendoState(stateBuf);
        return !!ok;
      } catch (e) {
        console.error("[SFC importState error]", e);
        return false;
      }
    },

    // 纯内存重置复位契约
    reset: function() {
      try {
        if (typeof window.resetSuperNintendo === "function") {
          window.resetSuperNintendo();
        }

        // 清理按键状态
        for (const k in rawButtons) {
          if (rawButtons.hasOwnProperty(k)) rawButtons[k] = false;
        }
        startHoldFrames = 0;
        selectHoldFrames = 0;
        window.SUPERNINTENDO_KEY_INPUT_1 = 0;

        // 秒开穿透步进 1250 帧直达全彩中文主菜单
        if (typeof window.stepSuperNintendoFrame === "function") {
          for (let f = 0; f < 1250; f++) {
            if (f % 60 < 15) {
              window.SUPERNINTENDO_KEY_INPUT_1 = SFC_BTN_MASK.start;
            } else {
              window.SUPERNINTENDO_KEY_INPUT_1 = 0;
            }
            window.stepSuperNintendoFrame();
          }
          window.SUPERNINTENDO_KEY_INPUT_1 = 0;
        }

        // 重新确保声音状态
        if (masterGainNode) {
          masterGainNode.gain.value = isMute ? 0.0 : 1.0;
        }

        return true;
      } catch (err) {
        console.error("[SFC reset error]", err);
        return false;
      }
    },

    // 59s 录屏音频闭环契约
    connectRecordingAudio: function() {
      activateAudio();
      if (!audioCtx) return null;

      try {
        if (!mediaStreamDest && audioCtx.createMediaStreamDestination) {
          mediaStreamDest = audioCtx.createMediaStreamDestination();
          if (masterGainNode) {
            masterGainNode.connect(mediaStreamDest);
          }
        }
        if (mediaStreamDest && mediaStreamDest.stream) {
          const tracks = mediaStreamDest.stream.getAudioTracks();
          if (tracks && tracks.length > 0) {
            return tracks[0];
          }
        }
      } catch (err) {
        console.warn("[SFC connectRecordingAudio error]", err);
      }
      return null;
    },

    // 手势破冰与音频恢复接口
    activateAudio: function() {
      activateAudio();
    },
    resumeAudio: function() {
      activateAudio();
    },

    // 适配 shell.js 的声音控制双向契约 (setMuted / setMute / setSound / toggleMute)
    setMuted: function(muted) {
      isMute = !!muted;
      window.SUPERNINTENDO_SOUND_ENABLED = !isMute;
      if (masterGainNode) {
        masterGainNode.gain.value = isMute ? 0.0 : 1.0;
      }
      if (!isMute) activateAudio();
    },

    setMute: function(muted) {
      this.setMuted(muted);
    },

    setSound: function(enabled) {
      this.setMuted(!enabled);
    },

    toggleMute: function() {
      this.setMuted(!isMute);
      return isMute;
    },

    // 焦点纯粹性契约
    ensureFocus: function() {
      if (typeof window !== "undefined" && window.focus) {
        try { window.focus(); } catch (_) {}
      }
    }
  };

  // 全局导出适配器
  window.GGEMU_CORE = coreInstance;
})();
