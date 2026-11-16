/**
 * core.js - 《脱狱》(P.O.W. - Prisoners of War / pow-nes) 掌机内核适配器
 *
 * 遵循标准避坑全书规范:
 * 1. 经典钻石四键掌机 (layout: "diamond", stick: false)
 * 2. 字母极简按键映射 (纯字母 B / A / X / Y):
 *    - 正下方 B 键: 拳击 / 刺刀 / 射击 (Attack / Fire)
 *    - 正右方 A 键: 踢腿 (Kick)
 *    - 正上方 X 键: 一键跳跃回旋踢 (Jump Kick, 触发 A+B)
 *    - 正左方 Y 键: 一键跳跃回旋踢 (Jump Kick, 触发 A+B)
 * 3. 细长中文胶囊键 (「选择」与「开始」，8 帧按压防漏缓冲，大热区，严禁标投币)
 * 4. 双层底栏标准契约:
 *    - 第 1 层: 存档、3× 加速、设置、59s 录制
 *    - 第 2 层: 左侧【复位】(纯内存重置+480帧预热直出大标题)、中间【攻略】(通关笔记+双向硬派走法)、右侧【声音】(四重硬件静音锁)
 * 5. 设置与声音彻底解耦，外壳设置弹窗零声音选项，内核严禁私绑设置 DOM
 * 6. 3× 加速时间积分公式: dt = Math.min(now - lastTime, 250) * speedMultiplier
 * 7. 开机 480 帧轻量秒开预热穿透 (保证首屏 0.15s 直出 100% 全彩经典 SNK 脱狱大标题)
 * 8. Web Audio 全手势破冰与 59s / 32MB 录屏音频闭环 (connectRecordingAudio 返回有效音轨)
 * 9. 即时存档/读档标准契约 (exportState / importState / saveState / loadState)
 * 10. 攻略笔记特权双向性 (默认关闭 guideNotesActive = false，界面不出现敏感词，支持随时开启与还原)
 */

(function() {
  "use strict";

  // NES 标准按键索引 (JSNES 规范)
  const NES_BTN = {
    a: 0,      // A 键: 踢腿 (Kick)
    b: 1,      // B 键: 拳击 / 刺刀 / 射击 (Attack / Fire)
    select: 2, // 选择键: 模式切换
    start: 3,  // 开始键: 选单确认 / 暂停
    up: 4,     // 上: 向上移动
    down: 5,   // 下: 向下移动
    left: 6,   // 左: 向左疾走
    right: 7   // 右: 向右疾走
  };

  // 原始按键状态 (支持四键 diamond: B, A, X, Y)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
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

    if (!audioCtx) {
      initAudioContext();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  // Web Audio 采样处理回调
  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const len = outL.length;

    // 四重硬件静音锁：静音时直接全零输出
    if (isMute) {
      for (let i = 0; i < len; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    let available = (audioWritePtr - audioReadPtr + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
    if (available < len) {
      audioPrimes++;
      for (let i = 0; i < len; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    for (let i = 0; i < len; i++) {
      outL[i] = audioRingL[audioReadPtr];
      outR[i] = audioRingR[audioReadPtr];
      audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
    }
  }

  // NES 音频采样接收
  function onAudioSample(left, right) {
    if (isMute) return;
    audioRingL[audioWritePtr] = left;
    audioRingR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) % AUDIO_BUF_SIZE;
    if (audioWritePtr === audioReadPtr) {
      audioReadPtr = (audioReadPtr + 1) % AUDIO_BUF_SIZE;
    }
  }

  // 画面像素帧回调
  function onFrame(buffer) {
    let p = 0;
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const pixel = buffer[p];
        const r = pixel & 0xff;
        const g = (pixel >> 8) & 0xff;
        const b = (pixel >> 16) & 0xff;
        offscreenBuf32[p] = (0xff << 24) | (b << 16) | (g << 8) | r;
        p++;
      }
    }
    if (offscreenCtx) {
      offscreenCtx.putImageData(offscreenImageData, 0, 0);
    }
  }

  // 创建 JSNES 实例
  function createNESInstance(NESClass) {
    const inst = new NESClass({
      onFrame: onFrame,
      onAudioSample: onAudioSample,
      sampleRate: (audioCtx && audioCtx.sampleRate) ? audioCtx.sampleRate : 44100
    });
    return inst;
  }

  // 开机秒开预热穿透：步进至经典全彩脱狱大标题
  function warmUpToTitle(nesInstance) {
    if (!nesInstance) return;
    // FC 日版《脱狱》开机有版权与闪电过场，需要 480 帧直达 100% 全彩大标题
    for (let i = 0; i < 480; i++) {
      nesInstance.frame();
    }
  }

  // 绑定通关笔记攻略弹窗与双向切换
  function bindGuideModal() {
    if (typeof document === "undefined") return;

    const btnGuide = document.getElementById("btn-guide");
    const modal = document.getElementById("guide-modal");
    const btnClose = document.getElementById("guide-close");
    const btnOn = document.getElementById("btn-guide-on");
    const btnOff = document.getElementById("btn-guide-off");
    const btnSound = document.getElementById("btn-sound");

    if (btnSound) {
      btnSound.addEventListener("click", () => {
        const muted = coreInstance.toggleMute();
        btnSound.textContent = muted ? "静音" : "声音";
        if (muted) {
          btnSound.classList.add("is-muted");
        } else {
          btnSound.classList.remove("is-muted");
        }
        showToast(muted ? "已静音" : "声音已开启");
      });
    }

    if (!btnGuide || !modal) return;

    btnGuide.addEventListener("click", () => {
      activateAudio();
      modal.style.display = "flex";
    });

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });

    if (btnOff) {
      btnOff.addEventListener("click", () => {
        coreInstance.setGuideNotes(false);
        showToast("已恢复原版机台规则");
        modal.style.display = "none";
      });
    }

    if (btnOn) {
      let followStarting = false;
      btnOn.addEventListener("click", (ev) => {
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
      if (!mem) return;

      // 仅当玩家处于关卡活动状态（体能大于 0 且在游戏中）时生效
      if (mem[0x424] > 0) {
        // 1. 战俘整备：保持 21 次突击作战机会
        if (mem[0x43a] < 21) {
          mem[0x43a] = 21;
        }
        // 2. 充沛体力：保持 32 (0x20) 满负荷作战体能
        if (mem[0x424] < 0x20) {
          mem[0x424] = 0x20;
        }
        // 3. 军用弹药：若已拾取冲锋枪则保持弹药充沛
        const ammo = mem[0x438] & 0x0f;
        if (ammo > 0 && ammo < 9) {
          mem[0x438] = (mem[0x438] & 0xf0) | 0x09;
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
    // X 键与 Y 键映射为一键回旋跳踢 (同时触发 A + B)
    const isA = rawButtons.a || rawButtons.x || rawButtons.y;
    const isB = rawButtons.b || rawButtons.x || rawButtons.y;

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
    setBtn(NES_BTN.b, isB);
    setBtn(NES_BTN.a, isA);
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
    id: "pow-nes",
    name: "脱狱",
    pad: {
      layout: "diamond",
      stick: false,
      actions: [
        { id: "b", key: "B", label: "B" }, // 正下方：出拳 / 刺刀 / 射击
        { id: "a", key: "A", label: "A" }, // 正右方：踢腿
        { id: "x", key: "X", label: "X" }, // 正上方：一键跳跃回旋踢
        { id: "y", key: "Y", label: "Y" }  // 正左方：一键跳跃回旋踢
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
        console.error("ROM_DATA 为空，无法启动《脱狱》");
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
        console.error("脱狱 ROM 加载失败:", e);
        return;
      }

      // 开机秒开预热穿透：步进至经典全彩脱狱大标题
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
