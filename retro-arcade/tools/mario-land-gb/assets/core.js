// 超级马力欧大陆 (Super Mario Land GB) 核心适配器 (GGEMU_CORE for Game Boy)
// 标准两键外壳 + 原版逻辑 + 59s 立体声录屏分流
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

  // START / SELECT 按压缓冲
  let startHoldFrames = 0;
  let selectHoldFrames = 0;

  // 虚拟按键状态跟踪 (两键经典布局)
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,     // A 跳跃
    b: false,     // B 冲刺 / 发射超级弹力球
    select: false,
    start: false
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

  // 现代 Web Audio 环形缓冲区音频架构 (对齐 NES 千锤百炼标准实现)
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioPrimes = 0;
  let recDestNode = null;

  function audioAvailable() {
    return (audioWritePtr - audioReadPtr + AUDIO_BUF_SIZE) & (AUDIO_BUF_SIZE - 1);
  }

  function pushAudioSamples(buffer) {
    if (!buffer) return;
    const len = buffer.length;
    for (let i = 0; i < len; i += 2) {
      if (audioAvailable() >= AUDIO_BUF_SIZE - 2) break;
      sampleBufL[audioWritePtr] = buffer[i];
      sampleBufR[audioWritePtr] = buffer[i + 1];
      audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
    }
  }

  function onAudioProcess(e) {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const nativeRate = (gb && gb.clocksPerSecond && gb.audioResamplerFirstPassFactor)
      ? (gb.clocksPerSecond / gb.audioResamplerFirstPassFactor)
      : 44100;
    const ratio = nativeRate / (audioCtx ? audioCtx.sampleRate : 44100);

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

    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
      audioScriptNode = null;
    }

    if (!audioCtx) {
      const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AC) return;
      try {
        audioCtx = new AC();
      } catch (e) {
        return;
      }
    }

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function() {});
    }

    // 播放 1 个采样的静音 BufferSource，强制唤醒底层移动端 WebKit DAC
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        const dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (audioCtx && !audioScriptNode) {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("[GB CORE] createScriptProcessor error:", e);
      }
    }

    // 同步暴露给全局与外壳诊断
    if (typeof window !== "undefined") {
      window.__gbAudioContext = audioCtx;
      window.__gbAudioNode = audioScriptNode;
    }
  }

  function connectRecordingAudio() {
    activateAudio();
    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().catch(function() {});
    }
    if (!audioCtx || !audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
      return null;
    }
    try {
      if (!recDestNode) {
        recDestNode = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(recDestNode);
      }
      const tracks = recDestNode.stream.getAudioTracks();
      return tracks && tracks.length ? tracks[0] : null;
    } catch (err) {
      console.warn("[GB CORE] connectRecordingAudio error:", err);
      return null;
    }
  }

  function audioDiag() {
    return {
      ok: !!(audioCtx && audioCtx.state === "running"),
      contextState: audioCtx ? audioCtx.state : "none",
      sampleRate: audioCtx ? audioCtx.sampleRate : 0,
      bufferAvailable: audioAvailable(),
      primes: audioPrimes
    };
  }

  // 绑定全局全手势音频解锁
  if (typeof window !== "undefined" && window.addEventListener) {
    const gestures = ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"];
    const unlockHandler = function() {
      activateAudio();
    };
    gestures.forEach(function(evt) {
      window.addEventListener(evt, unlockHandler, { passive: true, capture: true });
    });
    window.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") activateAudio();
    });
  }

  function showToast(msg) {
    if (typeof document === "undefined") return;
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function() {
      t.classList.remove("show");
    }, 2000);
  }

  // base64 转二进制字符串
  function base64ToBinary(b64) {
    if (typeof atob === "function") {
      return atob(b64);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("binary");
    }
    return "";
  }

  // 核心 boot 启动契约
  function boot(romBase64, host) {
    if (isBooted && gb) {
      if (host && typeof host.onReady === "function") host.onReady();
      return;
    }

    let romStr = "";
    if (typeof romBase64 === "string" && romBase64.length > 0) {
      romStr = base64ToBinary(romBase64);
    } else if (typeof window !== "undefined" && window.ROM_DATA) {
      romStr = base64ToBinary(window.ROM_DATA);
    }

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
      gb = new GameBoyCoreClass(offscreenCanvas, romStr);
      gb.start();

      // 关键：强制声音总开关开启，绝不被任何旧库 failureCallback 静音
      if (typeof window !== "undefined" && window.gbSettings) {
        window.gbSettings[0] = true;
      }

      // 彻底接管内核 audioHandle，直通现代 Web Audio 环形缓冲区
      gb.audioHandle = {
        writeAudioNoCallback: function(buffer) {
          pushAudioSamples(buffer);
        },
        remainingBuffer: function() {
          return audioAvailable();
        },
        changeVolume: function() {}
      };

      // 关键解除内核暂停位：清空 bit 2 允许 run() 执行 CPU 迭代循环
      gb.stopEmulator &= 1;

      // 开机秒开穿透机制：步进 60 迭代让标题画面瞬时直出
      for (let i = 0; i < 60; i++) {
        gb.run();
      }

      isBooted = true;

      // 原版机制提示：原版卡带标题画面静音，引导按【开始】进入关卡开启音乐
      showToast("按【开始】进入关卡，开启经典背景音乐！");

      if (host && typeof host.onReady === "function") {
        host.onReady();
      }
    } catch (err) {
      console.error("[GB CORE] boot exception:", err);
      showToast("启动错误: " + err.message);
    }
  }

  // 3× 加速与标准时间积分 tick
  let lastTime = 0;
  let accumulator = 0;

  function tick(timestamp) {
    if (!isBooted || !gb || isPaused) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!lastTime) lastTime = now;

    // 严格遵循避坑准则第 4 条：dt 必须乘以速度倍率
    const dt = Math.min(now - lastTime, 250) * speedMultiplier;
    lastTime = now;
    accumulator += dt;

    const maxSteps = 4 * speedMultiplier;
    let steps = 0;

    while (accumulator >= FRAME_MS && steps < maxSteps) {
      // START / SELECT 按压缓冲维护
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

      // 声音总开关持续守护
      if (typeof window !== "undefined" && window.gbSettings && !isMute) {
        window.gbSettings[0] = true;
      }

      // 执行两步内核迭代完成一整帧 (70224 时钟周期 / 144 扫描线)
      gb.run();
      gb.run();

      accumulator -= FRAME_MS;
      steps++;
    }
  }

  // 按键状态设置契约
  function setButton(btnId, pressed) {
    if (!btnId) return;
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

    if (norm in GB_KEYS) {
      rawButtons[norm] = isDown;
      if (gb) gb.JoyPadEvent(GB_KEYS[norm], isDown);
    }
  }

  // 极速模式切换契约
  function setSpeedMultiplier(mult) {
    speedMultiplier = Math.max(1, Math.min(mult || 1, 5));
    showToast(speedMultiplier > 1 ? ("已开启 " + speedMultiplier + "× 极速模式") : "已恢复 1× 原生速度");
  }

  // 静音控制契约
  function setMute(mute) {
    isMute = !!mute;
    if (gb && typeof gb.changeVolume === "function") {
      if (typeof window !== "undefined" && window.gbSettings) {
        window.gbSettings[3] = isMute ? 0 : 1;
      }
      gb.changeVolume();
    }
    showToast(isMute ? "游戏声音已静音" : "游戏声音已开启");
  }

  // 外壳标准存档/读档契约 (支持3槽位存档、覆盖与存档卡导出导入)
  function exportState() {
    if (!gb) throw new Error("游戏尚未就绪");
    try {
      const gbState = gb.saveState();
      return JSON.stringify({
        v: 1,
        sys: "mario-land-gb",
        t: Date.now(),
        state: gbState
      });
    } catch (e) {
      throw new Error("导出存档失败: " + e.message);
    }
  }

  function importState(raw) {
    if (!gb) throw new Error("游戏尚未就绪");
    try {
      let obj = raw;
      if (typeof raw === "string") {
        obj = JSON.parse(raw);
      }
      if (!obj) throw new Error("存档为空");
      if (obj.sys && obj.sys !== "mario-land-gb") {
        throw new Error("mismatch");
      }
      const stateData = obj.state || obj;
      gb.returnFromState(stateData);
      return true;
    } catch (e) {
      if (e.message === "mismatch") throw e;
      throw new Error("读取存档失败: " + e.message);
    }
  }

  // 内部简易快捷存档
  function saveState() {
    if (!gb) return;
    try {
      const str = exportState();
      localStorage.setItem("mario_land_gb_save", str);
      showToast("即时存档成功！");
    } catch (e) {
      showToast("存档失败: " + e.message);
    }
  }

  function loadState() {
    if (!gb) return;
    try {
      const dataStr = localStorage.getItem("mario_land_gb_save");
      if (!dataStr) {
        showToast("暂无可用的历史存档");
        return;
      }
      importState(dataStr);
      showToast("读档成功！");
    } catch (e) {
      showToast("读档失败: " + e.message);
    }
  }

  // 导出接口对象
  const core = {
    // 掌机外壳契约
    pad: {
      layout: "two-button",
      stick: false,
      capsules: [
        { id: "select", label: "选择" },
        { id: "start", label: "开始" }
      ],
      actions: [
        { id: "b", label: "B" },
        { id: "a", label: "A" }
      ]
    },
    video: function() {
      return { w: GB_W, h: GB_H };
    },
    source: function() {
      return offscreenCanvas;
    },
    boot: boot,
    tick: tick,
    setButton: setButton,
    setSpeedMultiplier: setSpeedMultiplier,
    setMute: setMute,

    // 存档契约 (对接外壳底栏与存档卡)
    exportState: exportState,
    importState: importState,
    saveState: saveState,
    loadState: loadState,

    // 音频契约
    activateAudio: activateAudio,
    resumeAudio: activateAudio,
    connectRecordingAudio: connectRecordingAudio,
    audioDiag: audioDiag,

    // 内部调试句柄
    getGB: function() {
      return gb;
    }
  };

  // 兼容对象属性与函数调用的双重契约
  core.video.w = GB_W;
  core.video.h = GB_H;

  if (typeof window !== "undefined") {
    window.GGEMU_CORE = core;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  }
})();
