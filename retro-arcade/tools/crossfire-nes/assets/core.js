/**
 * core.js - 《脱狱2：血火纵横》(Cross Fire / crossfire-nes) 掌机内核适配器
 *
 * 遵循标准避坑全书规范:
 * 1. 标准两键大药丸掌机 (layout: "two-button", stick: false)
 * 2. 经典动作按键映射:
 *    - 正圆 B 键: 拳击 / 开火 (Attack / Fire)
 *    - 正圆 A 键: 跳跃 / 翻越攀爬 (Jump)
 * 3. 细长中文胶囊键 (「选择」与「开始」，8 帧按压防漏缓冲，大热区，严禁标投币)
 * 4. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧【复位】(纯内存重置+预热直出大标题)、中间【攻略】(通关笔记+双向硬派走法)、右侧【声音】(四重硬件静音锁)
 * 5. 设置与声音彻底解耦，外壳设置弹窗零声音选项，内核严禁私绑设置 DOM
 * 6. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 7. 开机 90 帧轻量秒开预热穿透 (保证首屏 0.1s 直出 100% 全彩经典 CROSS FIRE 大标题)
 * 8. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 9. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 10. 攻略笔记特权双向性 (默认关闭 guideNotesActive = false，界面不出现敏感词，支持随时开启与还原)
 */

(function() {
  "use strict";

  // NES 标准按键索引 (JSNES 规范)
  const NES_BTN = {
    a: 0,      // A 键: 跳跃 (Jump)
    b: 1,      // B 键: 拳击 / 开火 (Attack / Fire)
    select: 2, // 选择键: 单双人切换
    start: 3,  // 开始键: 选单确认 / 暂停
    up: 4,     // 上: 向上攀爬管道
    down: 5,   // 下: 下蹲
    left: 6,   // 左: 向左疾走
    right: 7   // 右: 向右疾走
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

  // 胶囊键缓冲守卫 (8 帧脉冲防漏按)
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

  // 攻略笔记特权状态 (默认关闭，原汁原味机台难度)
  let guideNotesActive = false;

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

  // Toast 提示
  let toastTimer = null;
  function showToast(msg) {
    if (typeof document === "undefined") return;
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

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

  // 秒开预热步进：90 帧直出经典大标题全彩画面
  function warmUpToTitle(targetNes) {
    if (!targetNes) return;
    try {
      for (let f = 1; f <= 90; f++) {
        targetNes.frame();
      }
    } catch (err) {
      console.warn("预热步进警告:", err);
    }
  }

  // 绑定通关笔记攻略弹窗交互
  function bindGuideModal() {
    if (typeof document === "undefined") return;
    const modal = document.getElementById("guide-modal");
    const openBtn = document.getElementById("btn-guide");
    const closeBtn = document.getElementById("guide-close");
    const onBtn = document.getElementById("btn-guide-on");
    const offBtn = document.getElementById("btn-guide-off");
    if (!openBtn || !modal) return;

    function openModal(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      activateAudio();
      modal.style.display = "flex";
    }

    openBtn.addEventListener("click", openModal);
    openBtn.addEventListener("touchend", openModal);

    if (closeBtn) {
      closeBtn.addEventListener("click", function(ev) {
        if (ev) ev.stopPropagation();
        modal.style.display = "none";
      });
    }

    modal.addEventListener("click", function(ev) {
      if (ev.target === modal) {
        modal.style.display = "none";
      }
    });

    if (offBtn) {
      offBtn.addEventListener("click", function(ev) {
        if (ev) ev.stopPropagation();
        coreInstance.setGuideNotes(false);
        showToast("已回到原版走法");
        modal.style.display = "none";
      });
    }

    if (onBtn) {
      let followStarting = false;
      onBtn.addEventListener("click", function(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        if (followStarting) return;
        followStarting = true;

        const mt = window.xhs && window.xhs.miniTool;
        let settled = false;

        function grant() {
          if (settled) return;
          settled = true;
          coreInstance.setGuideNotes(true);
          showToast("笔记走法已打开");
          modal.style.display = "none";
          followStarting = false;
        }

        function deny() {
          if (settled) return;
          followStarting = false;
          if (mt && typeof mt.getFollowStatus === "function") {
            mt.getFollowStatus({
              success: function(res) {
                const st = res && (res.followStatus !== undefined ? res.followStatus : res.status);
                if (st > 0) {
                  grant();
                } else {
                  showToast("还没关注，走法先不动");
                }
              },
              fail: function() {
                showToast("还没关注，走法先不动");
              }
            });
            return;
          }
          // 无端内 SDK 桥接环境（如浏览器预览）直接激活体验
          grant();
        }

        if (!mt || typeof mt.followAuthor !== "function") {
          deny();
          return;
        }

        try {
          mt.followAuthor({
            success: function() { grant(); },
            fail: function() { deny(); }
          });
        } catch (_) {
          deny();
        }
      });
    }
  }

  // 攻略走法特权内存守护与双向切换
  function applyGuideNotesInTick() {
    if (!nes || !guideNotesActive) return;
    try {
      const mem = nes.cpu.mem;
      // 当游戏处于关卡进行中状态时 (0x39 === 2 为落地战斗实战)
      if (mem && mem[0x39] === 2) {
        // 1. 后方整备：保持 9 次作战突击机会
        if (mem[0x5c1] < 9) {
          mem[0x5c1] = 9;
        }
        // 2. 充沛体力：保持 4 格满负荷作战体能
        if (mem[0x5c2] < 4) {
          mem[0x5c2] = 4;
        }
        // 3. 精锐枪械：手持 5 级精锐自动突击步枪
        if (mem[0x5c4] < 5) {
          mem[0x5c4] = 5;
        }
      }
    } catch (_) {}
  }

  // 主循环步进函数
  function tick() {
    if (!nes) return;

    // 1. 胶囊键缓冲衰减
    const effectiveStart = rawButtons.start || (startHoldFrames > 0);
    if (startHoldFrames > 0) startHoldFrames--;

    const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
    if (selectHoldFrames > 0) selectHoldFrames--;

    // 2. 将按键状态写入 NES 控制器
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
    setBtn(NES_BTN.b, rawButtons.b);
    setBtn(NES_BTN.a, rawButtons.a);
    setBtn(NES_BTN.start, effectiveStart);
    setBtn(NES_BTN.select, effectiveSelect);

    // 3. 攻略笔记走法实时守护
    applyGuideNotesInTick();

    // 4. 3× 加速时间积分步进 (增量乘倍率)
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
    id: "crossfire-nes",
    name: "脱狱2：血火纵横",
    pad: {
      layout: "two-button",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "攻击" }, // B 键: 拳击 / 夺枪射击
        { id: "a", key: "A", label: "跳跃" }  // A 键: 跳跃 / 翻越攀爬
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
        console.error("ROM_DATA 为空，无法启动《脱狱2》");
        return;
      }

      const NESClass = getNESClass();
      if (!NESClass) {
        console.error("JSNES 内核未就绪 (NES_MODULE missing)");
        return;
      }

      initAudioContext();
      nes = createNESInstance(NESClass);

      // 解码 Base64 为二进制 ROM 并加载
      if (typeof atob === "function") {
        cachedRomBinary = atob(romData);
      } else if (typeof Buffer !== "undefined") {
        cachedRomBinary = Buffer.from(romData, "base64").toString("binary");
      }

      try {
        nes.loadROM(cachedRomBinary);
      } catch (e) {
        console.error("脱狱2 ROM 加载失败:", e);
        return;
      }

      // 开机秒开预热穿透：步进至经典全彩大标题
      warmUpToTitle(nes);

      // 绑定攻略弹窗交互
      bindGuideModal();

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

    // 攻略笔记特权控制方法 (双向可开可关)
    isGuideNotesActive: function() {
      return guideNotesActive;
    },

    setGuideNotes: function(active) {
      guideNotesActive = !!active;
      // 开启时立即实施一次补给
      if (guideNotesActive) {
        applyGuideNotesInTick();
      }
      return guideNotesActive;
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
        isMute: isMute,
        guideNotesActive: guideNotesActive
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
