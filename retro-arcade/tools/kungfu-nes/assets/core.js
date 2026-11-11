!function () {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;

  // NES 标准手柄映射码
  const NES_BTN = {
    a: 0,       // 腿攻
    b: 1,       // 拳攻
    select: 2,  // 选择 (选择难度 Level 1/2)
    start: 3,   // 开始
    up: 4,      // 上跳
    down: 5,    // 下蹲
    left: 6,    // 左走
    right: 7    // 右走
  };

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let turboTimer = 0;
  let speedMultiplier = 1;
  let lastTime = 0;
  let accumulator = 0;
  const FRAME_MS = 1000 / 60;

  // 按键防漏保底计数器 (确保真机轻点也能维持 8 帧被 NES CPU 完整采样)
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 特权金手指状态 (开机读取持久化记忆)
  let vipUnlocked = false;
  try {
    vipUnlocked = localStorage.getItem("kungfu_vip_granted") === "true";
  } catch (_) {}

  // 离线渲染画板
  const offscreen = document.createElement("canvas");
  offscreen.width = NES_W;
  offscreen.height = NES_H;
  const offscreenCtx = offscreen.getContext("2d");
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  // 音频系统 (44100Hz 双声道环形缓冲区，对齐成熟稳定驱动)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioPrimes = 0;
  let audioCallbacks = 0;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const ratio = 44100 / (audioCtx ? audioCtx.sampleRate : 44100);

    for (let i = 0; i < outL.length; i++) {
      if (audioAvailable() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const r = Math.floor(audioReadPtr);
      const frac = audioReadPtr - r;
      const nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      outL[i] = sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac;
      outR[i] = sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac;
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
      }
    }
  }

  function ensureAudioNodes() {
    if (!audioCtx) return;
    if (!audioScriptNode && typeof audioCtx.createScriptProcessor === "function") {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
  }

  function initAudioContext() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      audioScriptNode = null;
    }
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        audioCtx = new AC();
      } catch (e) {
        return;
      }
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(() => {
        ensureAudioNodes();
      }).catch(() => {});
    }

    // 播放 1 个采样的静音 BufferSource，强制彻底唤醒 iOS 底层物理音频硬件
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    ensureAudioNodes();
  }

  function activateAudio() {
    try {
      initAudioContext();
    } catch (_) {}
  }

  // 手机全事件捕获监听，用户任意点触瞬间激活 WebAudio
  ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      activateAudio();
    }, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      activateAudio();
    }
  });

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      pixelBuf[i] = 0xff000000 | buffer[i];
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  // 虚拟按键原始状态表
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // NES A 腿攻
    b: false,     // NES B 拳攻
    select: false,
    start: false,
    sp: false     // X 极速连发
  };

  // 胶囊功能键定义 (对齐标杆：选择与开始)
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义 (对齐四键动作版标杆：上连发X、左拳攻Y、右必杀A、下腿功B)
  const ACTIONS = [
    { id: "sp", label: "连发", key: "X" },
    { id: "b", label: "拳攻", key: "Y" },
    { id: "a", label: "必杀", key: "A" },
    { id: "jump", label: "腿功", key: "B" }
  ];

  window.GGEMU_CORE = {
    id: "kungfu-nes",
    name: "功夫 (Yie Ar Kung-Fu)",
    pad: {
      stick: true,
      layout: "diamond",
      actions: ACTIONS,
      geom: { rf: 0.62, dd: 1.5, hit: 10 },
      capsules: CAPSULES
    },

    video: function () {
      return { w: NES_W, h: NES_H };
    },

    source: function () {
      return offscreen;
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    // 即时存档与读档标准接口
    saveState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function (state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
    },

    getState: function () {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    exportState: function () {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "kungfu-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function (stateStr) {
      if (!nes) throw new Error("游戏未运行");
      const obj = JSON.parse(stateStr);
      if (obj && obj.state) {
        nes.fromJSON(obj.state);
      } else {
        throw new Error("存档格式错误");
      }
    },

    boot: function (romBase64, host) {
      isPaused = false;
      try {
        activateAudio();
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          sampleRate: 44100
        });

        const rawBase64 = (typeof romBase64 === "string" && romBase64.length > 100)
          ? romBase64
          : (typeof window.KUNGFU_ROM_BASE64 === "string" && window.KUNGFU_ROM_BASE64.length > 100)
            ? window.KUNGFU_ROM_BASE64
            : (typeof window.ROM_DATA === "string" && window.ROM_DATA.length > 100)
              ? window.ROM_DATA
              : "";

        const rawBin = atob(rawBase64);
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 预热仅运行 5 帧完成 PPU 图层就绪，完好停留在标题画面并播放开场神曲
        for (let f = 0; f < 5; f++) nes.frame();
        audioReadPtr = audioWritePtr;

        isPaused = false;
        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("功夫内核启动异常:", err);
        if (host && typeof host.onError === "function") {
          host.onError(err);
        }
      }
    },

    tick: function () {
      if (!isBooted || !nes || isPaused) return;

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        return;
      }
      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTimer = (turboTimer + 1) % 6;
      // 极速连击 X 键：每 3 帧交替触发拳攻
      const turboPunch = rawButtons.sp && (turboTimer < 3);

      // 处理【开始】与【选择】的按键保底，确保真机轻按 100% 被 NES 读到
      const effectiveStart = rawButtons.start || (startHoldFrames > 0);
      if (startHoldFrames > 0) startHoldFrames--;

      const effectiveSelect = rawButtons.select || (selectHoldFrames > 0);
      if (selectHoldFrames > 0) selectHoldFrames--;

      // 严格使用 JSNES 标准按键 API：按下调用 buttonDown，松开调用 buttonUp！
      const setBtn = (btnIndex, isDown) => {
        if (isDown) {
          nes.buttonDown(1, btnIndex);
        } else {
          nes.buttonUp(1, btnIndex);
        }
      };

      // 方向摇杆
      setBtn(NES_BTN.up, rawButtons.up);
      setBtn(NES_BTN.down, rawButtons.down);
      setBtn(NES_BTN.left, rawButtons.left);
      setBtn(NES_BTN.right, rawButtons.right);

      // 选择与开始
      setBtn(NES_BTN.select, effectiveSelect);
      setBtn(NES_BTN.start, effectiveStart);

      // 动作按键：A 腿攻 / 必杀，B 拳攻 / 极速连发
      setBtn(NES_BTN.a, rawButtons.a || rawButtons.jump);
      setBtn(NES_BTN.b, rawButtons.b || turboPunch);

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        stepCount++;

        if (nes.cpu && nes.cpu.mem) {
          const mem = nes.cpu.mem;
          const phase = mem[0x0000];

          // 1. 标题画面永驻守护：在标题画面 ($00 === 1) 时维持倒计时，绝不让游戏自动跳进烦人的 Demo 假赛演示！
          if (phase === 1) {
            mem[0x0002] = 200;
          }

          // 2. 核心控制权铁律：$0066 在 ROM 中 0 代表玩家手柄控制，1 代表电脑自动演示控制！
          // 必须永远强制锁为 0，绝对不让电脑接管主角！确保 100% 由玩家亲自操控！
          mem[0x0066] = 0;

          // 3. 全局金钟罩铁布衫、一击必杀与 99 命常驻守护
          if (vipUnlocked) {
            mem[0x0060] = 99; // 99 命常驻守护，永不掉命
            // 核心修复：功夫真正的搏斗对战阶段为 phase === 5！
            // 只要敌方尚未倒地 (mem[0x00DC] < 9)，即为正式搏击期：
            // 1) 金钟罩：主角受创格数锁定为 0 (mem[0x00DB] = 0)，受创硬直清零 (mem[0x00D8] = 0)，站桩硬刚不倒地不后仰；
            // 2) 一击必杀：主角拳腿招式命中敌方 (mem[0x00DC] > 0)，敌方受创直接拉满 9 判定 KO 倒地！
            // 3) 结算放行：一旦敌方倒地 (mem[0x00DC] >= 9)，游戏进入通关奖励加分结算，立即放行 mem[0x00DB]，
            // 绝不在结算期锁 0，使原生血量折算顺畅完成并自然进入下一关！
            if (phase === 5 && mem[0x00DC] < 9) {
              mem[0x00DB] = 0;  // 主角受创累加器锁定为 0，站桩无敌不倒地
              mem[0x00D8] = 0;  // 清空受创硬直标志，挨打不后退
              // 一击必杀：敌方受到任何有效打击，受创立即拉满 9 判定 KO 倒地！
              if (mem[0x00DC] > 0) {
                mem[0x00DC] = 9;
              }
            }
          } else {
            // 普通模式：取消特权后恢复原生挑战难度，不对血量与受创做任何干预
            if (mem[0x0060] > 9) {
              mem[0x0060] = 3;
            }
          }
        }

        nes.frame();
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }
    },

    setSpeed: function (mul) {
      speedMultiplier = Math.max(1, mul || 1);
    },

    getSpeed: function () {
      return speedMultiplier;
    },

    setButton: function (btn, down) {
      activateAudio();

      if (btn === "start") {
        rawButtons.start = down;
        if (down) startHoldFrames = 8; // 保底维持 8 帧，确保 100% 触发进关
      } else if (btn === "select") {
        rawButtons.select = down;
        if (down) selectHoldFrames = 8; // 保底维持 8 帧，确保 100% 切换难度
      } else if (btn === "jump") {
        rawButtons.jump = down;
        rawButtons.a = down;
      } else if (btn === "sp") {
        rawButtons.sp = down;
      } else if (btn === "punch" || btn === "b") {
        rawButtons.b = down;
      } else if (btn === "a") {
        rawButtons.a = down;
      } else if (rawButtons.hasOwnProperty(btn)) {
        rawButtons[btn] = down;
      }
    },

    setPause: function (p) {
      isPaused = p;
    },

    isPaused: function () {
      return isPaused;
    },

    reset: function () {
      if (nes) {
        nes.reset();
        audioReadPtr = audioWritePtr;
      }
    },

    connectRecordingAudio: function () {
      initAudioContext();
      if (!audioCtx) return null;
      ensureAudioNodes();
      if (!audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks && tracks.length ? tracks[0] : null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    audioDiag: function () {
      return {
        ok: audioCallbacks > 0 && !!audioCtx && audioCtx.state === "running",
        contextState: audioCtx ? audioCtx.state : "none",
        sampleRate: audioCtx ? audioCtx.sampleRate : 0,
        callbacks: audioCallbacks,
        nodeAttached: !!audioScriptNode,
        primes: audioPrimes
      };
    },

    // 特权控制接口：可开启、可取消、可查询
    toggleCheat: function () {
      return toggleVip();
    },
    setCheat: function (enable) {
      return setVip(enable);
    },
    isCheatEnabled: function () {
      return vipUnlocked;
    }
  };

  // 全局调试与测试辅助接口
  window.__kungfuDebug = {
    nes: function () { return nes; },
    toggleCheat: function () { return toggleVip(); },
    setCheat: function (enable) { return setVip(enable); },
    isCheatEnabled: function () { return vipUnlocked; }
  };

  // 绑定秘籍特权弹窗与双向切换系统
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 2500);
  }

  function updateFollowButtonUI() {
    const followBtn = document.getElementById("btn-follow-author");
    const openBtn = document.getElementById("btn-cheat");
    if (followBtn) {
      if (vipUnlocked) {
        followBtn.textContent = "已激活金钟罩 · 点击取消特权";
        followBtn.style.background = "linear-gradient(135deg, #2b9b48 0%, #1c7430 100%)";
      } else {
        followBtn.textContent = "点击开启金钟罩 · 99命无敌对战";
        followBtn.style.background = "linear-gradient(135deg, #e8473b 0%, #d0222b 100%)";
      }
    }
    if (openBtn) {
      if (vipUnlocked) {
        openBtn.style.background = "linear-gradient(135deg, #2b9b48 0%, #1c7430 100%)";
        openBtn.style.color = "#ffffff";
      } else {
        openBtn.style.background = "";
        openBtn.style.color = "";
      }
    }
  }

  function setVip(enable, silent) {
    vipUnlocked = !!enable;
    try {
      localStorage.setItem("kungfu_vip_granted", vipUnlocked ? "true" : "false");
    } catch (_) {}
    const mt = window.xhs && window.xhs.miniTool;
    if (mt && typeof mt.setStorage === "function") {
      try {
        mt.setStorage({ key: "kungfu_vip_granted", data: vipUnlocked ? "true" : "false" });
      } catch (_) {}
    }
    // 如果关闭特权，当前若是 99 命，重置为正常生命数 3 命，受创不再锁定
    if (!vipUnlocked && nes && nes.cpu && nes.cpu.mem) {
      if (nes.cpu.mem[0x0060] > 9) {
        nes.cpu.mem[0x0060] = 3;
      }
    }
    updateFollowButtonUI();
    if (!silent) {
      if (vipUnlocked) {
        toast("金钟罩铁布衫+99命已开启！主角站桩无敌");
      } else {
        toast("特权已关闭，已恢复正常对战挑战");
      }
    }
    return vipUnlocked;
  }

  function toggleVip() {
    const modal = document.getElementById("cheat-modal");
    if (vipUnlocked) {
      // 当前开启 -> 取消关闭特权
      setVip(false);
    } else {
      // 当前关闭 -> 尝试调起小红书关注并开启特权
      const mt = window.xhs && window.xhs.miniTool;
      if (mt && typeof mt.followAuthor === "function") {
        try {
          mt.followAuthor({
            success: function () {},
            fail: function () {}
          });
        } catch (_) {}
      }
      setVip(true);
    }
    setTimeout(function () {
      if (modal) modal.style.display = "none";
    }, 600);
    return vipUnlocked;
  }

  function bindCheatGuide() {
    const modal = document.getElementById("cheat-modal");
    const openBtn = document.getElementById("btn-cheat");
    const closeBtn = document.getElementById("modal-close");
    const followBtn = document.getElementById("btn-follow-author");

    if (openBtn && modal) {
      function openModal(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        updateFollowButtonUI();
        modal.style.display = "flex";
      }
      openBtn.addEventListener("click", openModal);
      openBtn.addEventListener("touchend", openModal);
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", function (ev) {
        if (ev) ev.stopPropagation();
        modal.style.display = "none";
      });
    }

    if (modal) {
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal) modal.style.display = "none";
      });
    }

    if (!followBtn) return;

    function onFollowClick(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      toggleVip();
    }

    followBtn.addEventListener("click", onFollowClick);
    followBtn.addEventListener("touchend", onFollowClick);
    updateFollowButtonUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCheatGuide);
  } else {
    bindCheatGuide();
  }
}();
