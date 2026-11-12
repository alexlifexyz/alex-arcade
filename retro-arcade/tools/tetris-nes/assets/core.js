// Tetris NES Core Adapter (GGEMU_CORE for JSNES)
(function() {
  "use strict";

  const NES_W = 256;
  const NES_H = 240;
  const FPS = 60;
  const FRAME_MS = 1000 / FPS;

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = NES_W;
  offscreenCanvas.height = NES_H;
  const offscreenCtx = offscreenCanvas.getContext("2d", { alpha: false });
  const imgData = offscreenCtx.createImageData(NES_W, NES_H);
  const pixelBuf = new Uint32Array(imgData.data.buffer);

  let nes = null;
  let isBooted = false;
  let isPaused = false;
  let speedMultiplier = 1;
  let turboTick = 0;
  let hardDropFrames = 0;

  // 俄罗斯方块得分与游戏状态监控（对接小红书全国排行榜）
  let inGameSession = false;
  let lastScore = 0;
  let lastGameOverReported = 0;

  // 虚拟按键状态跟踪
  const rawButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    hard_drop: false,
    fast_drop: false,
    select: false,
    start: false
  };

  // 2P 控制器状态跟踪 (双手柄独立)
  let startHoldFramesP2 = 0;
  let selectHoldFramesP2 = 0;
  const rawButtonsP2 = {
    up: false, down: false, left: false, right: false,
    a: false, b: false, ta: false, tb: false, jump: false,
    select: false, start: false
  };

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

  // WebAudio 直连扬声器（适配小红书移动端与静音开关）
  const AUDIO_BUF_SIZE = 32768;
  const sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  const sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  let audioWritePtr = 0;
  let audioReadPtr = 0;
  let audioCtx = null;
  let audioScriptNode = null;
  let audioCallbacks = 0;
  let audioSamples = 0;
  let audioPeak = 0;
  let isAudioMuted = false;

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);

    if (isAudioMuted) {
      for (let i = 0; i < outL.length; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    const rate = audioCtx && audioCtx.sampleRate ? audioCtx.sampleRate : 44100;
    const ratio = 44100 / rate;

    for (let i = 0; i < outL.length; i++) {
      if (audioAvailable() < 2) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const r = Math.floor(audioReadPtr);
      const frac = audioReadPtr - r;
      const nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      const left = sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac;
      const right = sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac;
      outL[i] = left;
      outR[i] = right;
      if (left > audioPeak) audioPeak = left;
      if (-left > audioPeak) audioPeak = -left;
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
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
        try {
          audioCtx = new AC({ sampleRate: 44100 });
        } catch (_) {
          audioCtx = new AC();
        }
      } catch (_) {
        audioCtx = null;
        return;
      }
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn("createScriptProcessor fail:", e);
      }
    }
    if (audioCtx && audioCtx.state !== "running") {
      audioCtx.resume().catch(function() {});
    }
  }

  ["touchstart", "touchend", "click", "keydown"].forEach((evt) => {
    document.addEventListener(evt, () => {
      initAudioContext();
    }, { capture: true, passive: true });
  });
  // 键盘映射
  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    KeyJ: "b",         // B 逆时针旋转
    KeyK: "a",         // A 顺时针旋转
    KeyU: "hard_drop", // X 瞬降宏
    KeyI: "fast_drop", // Y 极速下落
    ShiftLeft: "select",
    ShiftRight: "select",
    Enter: "start"
  };

  window.addEventListener("keydown", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) {
      rawButtons[btn] = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    const btn = KEY_MAP[e.code];
    if (btn) {
      rawButtons[btn] = false;
      e.preventDefault();
    }
  });

  // 胶囊功能键定义
  const CAPSULES = [
    { id: "select", label: "选择" },
    { id: "start", label: "开始" }
  ];

  // 动作键定义（右侧 4 键钻石布局）
  // A: 顺时针旋转（右旋）
  // B: 逆时针旋转（左旋）
  // X: 瞬降宏 (Hard Drop)
  // Y: 极速下落 (Fast Drop)
  // 动作键定义：单颗超大【旋转】按键 (顺时针旋转，符合拇指盲操最佳手感)
  const ACTIONS = [
    { id: "a", label: "旋转", key: "A" }
  ];
  window.GGEMU_CORE = {
    id: "tetris-nes",
    name: "经典俄罗斯方块",
    pad: {
      stick: false,
      layout: "single",
      actions: ACTIONS,
      geom: { rf: 0.8, sx: 2.4, sy: 2.0, dy: 0, hit: 20 },
      capsules: CAPSULES
    },

    video: function() {
      return { w: NES_W, h: NES_H };
    },

    source: function() {
      return offscreenCanvas;
    },

    boot: function(romBase64, host) {
      try {
        initAudioContext();
        if (!window.NES_MODULE || !window.NES_MODULE.default) {
          throw new Error("JSNES 内核未就绪 (NES_MODULE missing)");
        }
        const NESClass = window.NES_MODULE.default;

        nes = new NESClass({
          onFrame: renderVideoFrame,
          onAudioSample: handleAudioSample,
          sampleRate: 44100
        });

        const rawBin = atob(romBase64 || window.TETRIS_ROM_BASE64 || window.ROM_DATA || "");
        if (!rawBin || rawBin.length < 1000) {
          throw new Error("ROM 数据异常或缺失");
        }

        nes.loadROM(rawBin);
        isBooted = true;

        // 核心修复：JSNES PPU 在写 $2006 (如调色板) 后会污染 Nametable 高位寄存器 (regV/regH/cntV/cntH)
        // 并在随后写两次 $2005 恢复滚动时未能恢复基准 Nametable，导致错误渲染全黑空白页。
        // 挂钩 scrollWrite 与 renderBgScanline，确保 Base Nametable 正确对齐至 $2000 寄存器。
        try {
          const ppu = nes.ppu;
          const origScrollWrite = ppu.scrollWrite;
          ppu.scrollWrite = function(val) {
            origScrollWrite.call(this, val);
            if (this.firstWrite) {
              this.regV = (this.f_nTblAddress >> 1) & 1;
              this.regH = this.f_nTblAddress & 1;
              this.cntV = this.regV;
              this.cntH = this.regH;
            }
          };

          const origRenderBgScanline = ppu.renderBgScanline;
          ppu.renderBgScanline = function(t, scanline) {
            if (scanline === 0 || scanline === 20) {
              this.regV = (this.f_nTblAddress >> 1) & 1;
              this.regH = this.f_nTblAddress & 1;
              this.cntV = this.regV;
              this.cntH = this.regH;
            }
            return origRenderBgScanline.apply(this, arguments);
          };
        } catch (patchErr) {
          console.warn("PPU Nametable patch failed:", patchErr);
        }

        // 预热步进：度过前 540 帧版权画面，直接停在经典 TETRIS 瓦西里大教堂标题画面
        try {
          for (let f = 0; f < 560; f++) nes.frame();
        } catch (e) {
          console.warn("Pre-render frame warn:", e);
        }
        audioReadPtr = audioWritePtr;

        if (host && typeof host.onReady === "function") {
          host.onReady();
        }
      } catch (err) {
        console.error("Tetris boot failed:", err);
        if (host && typeof host.toast === "function") {
          host.toast("游戏启动失败：" + err.message);
        }
      }
    },

    tick: function() {
      if (!isBooted || isPaused) return;
      const isHeadless = navigator.webdriver || !window.chrome || /HeadlessChrome/.test(navigator.userAgent);
      if (document.hidden && !isHeadless) {
        lastTime = 0;
        accumulator = 0;
        return;
      }

      const now = performance.now();
      if (!lastTime) {
        lastTime = now;
        lastFpsTime = now;
        return;
      }

      const dt = Math.min(now - lastTime, 250) * speedMultiplier;
      lastTime = now;
      accumulator += dt;

      turboTick++;

      if (rawButtons.hard_drop) {
        hardDropFrames = 15; // 触发 15 帧极速下落冲刺
      }

      if (nes) {
        const setBtn = (btnIndex, isDown) => {
          if (isDown) {
            nes.buttonDown(1, btnIndex);
          } else {
            nes.buttonUp(1, btnIndex);
          }
        };

        // D-Pad
        setBtn(NES_BTN.up, rawButtons.up);
        setBtn(NES_BTN.left, rawButtons.left);
        setBtn(NES_BTN.right, rawButtons.right);

        // 下落判定：普通下、瞬降宏中或极速连降
        let isDownPressed = rawButtons.down;
        if (hardDropFrames > 0) {
          isDownPressed = (hardDropFrames % 2 === 0);
          hardDropFrames--;
        } else if (rawButtons.fast_drop) {
          isDownPressed = (turboTick % 2 === 0);
        }
        setBtn(NES_BTN.down, isDownPressed);

        // Select & Start
        setBtn(NES_BTN.select, rawButtons.select);
        setBtn(NES_BTN.start, rawButtons.start);

        // 旋转
        setBtn(NES_BTN.a, rawButtons.a);
        setBtn(NES_BTN.b, rawButtons.b);
      }

      let stepCount = 0;
      const maxSteps = 3 * speedMultiplier;
      while (accumulator >= FRAME_MS && stepCount < maxSteps) {
        accumulator -= FRAME_MS;
        nes.frame();
        fpsFrames++;
        stepCount++;
      }

      if (accumulator >= FRAME_MS) {
        accumulator = 0;
      }

      // 实时监控俄罗斯方块内存得分与游戏结束状态
      if (nes && nes.cpu && nes.cpu.mem) {
        const m = nes.cpu.mem;
        const mode = m[0xC0];
        const playState = m[0x48];
        const bcd = (b) => ((b >> 4) & 0xF) * 10 + (b & 0xF);
        const curScore = bcd(m[0x55]) * 10000 + bcd(m[0x54]) * 100 + bcd(m[0x53]);
        const curLines = bcd(m[0x51]) * 100 + bcd(m[0x50]);
        const curLevel = m[0x44] || 0;

        if (curScore > lastScore) {
          lastScore = curScore;
        }

        if (mode === 4 && (playState === 1 || playState === 4)) {
          inGameSession = true;
        }

        if (inGameSession && (playState === 10 || (mode !== 4 && mode !== 5))) {
          inGameSession = false;
          const finalScore = lastScore;
          const nowMs = Date.now();
          if (finalScore >= 0 && nowMs - lastGameOverReported > 2000) {
            lastGameOverReported = nowMs;
            if (typeof window.onTetrisGameOver === "function") {
              window.onTetrisGameOver({ score: finalScore, lines: curLines, level: curLevel });
            }
          }
        }
      }

      if (now - lastFpsTime >= 1000) {
        window.__tetrisFps = Math.round((fpsFrames * 1000) / (now - lastFpsTime));
        fpsFrames = 0;
        lastFpsTime = now;
      }
    },

    setButton: function(btn, pressed, player) {
      if (!btn) return;
      const isP2 = (player === 2 || String(btn).startsWith("p2_"));
      const b = String(btn).toLowerCase().replace(/^btn-/, "").replace(/^p[12]_/, "");
      const target = isP2 ? rawButtonsP2 : rawButtons;
      if (b === "up") target.up = !!pressed;
      else if (b === "down") target.down = !!pressed;
      else if (b === "left") target.left = !!pressed;
      else if (b === "right") target.right = !!pressed;
      else if (b === "a") target.a = !!pressed;
      else if (b === "b") target.b = !!pressed;
      else if (b === "ta") target.ta = !!pressed;
      else if (b === "tb") target.tb = !!pressed;
      else if (b === "jump") target.jump = !!pressed;
      else if (b === "start") {
        target.start = !!pressed;
        if (pressed) {
          if (isP2) startHoldFramesP2 = 8;
          else {
            try { startHoldFrames = 8; } catch(_) {}
          }
        }
      } else if (b === "select") {
        target.select = !!pressed;
        if (pressed) {
          if (isP2) selectHoldFramesP2 = 8;
          else {
            try { selectHoldFrames = 8; } catch(_) {}
          }
        }
      }
    },

    setPaused: function(paused) {
      isPaused = !!paused;
    },

    isPaused: function() {
      return isPaused;
    },

    setSpeed: function(mul) {
      speedMultiplier = mul || 1;
    },

    getSpeed: function() {
      return speedMultiplier;
    },

    saveState: function() {
      if (!nes) throw new Error("游戏未运行");
      return nes.toJSON();
    },

    loadState: function(state) {
      if (!nes) throw new Error("游戏未运行");
      if (!state) throw new Error("存档格式不兼容");
      nes.fromJSON(state);
    },

    exportState: function() {
      if (!nes) throw new Error("游戏未运行");
      return JSON.stringify({
        v: 1,
        sys: "tetris-nes",
        t: Date.now(),
        state: nes.toJSON()
      });
    },

    importState: function(raw) {
      if (!nes) throw new Error("游戏未运行");
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (obj && obj.sys && obj.sys !== "tetris-nes") {
        throw new Error("存档与当前游戏不匹配");
      }
      nes.fromJSON(obj.state || obj);
    },

    reset: function() {
      if (nes) {
        lastScore = 0;
        inGameSession = false;
        nes.reloadROM();
        try {
          for (let f = 0; f < 560; f++) nes.frame();
        } catch (e) {}
        audioReadPtr = audioWritePtr;
      }
    },

    isMuted: function() {
      return isAudioMuted;
    },

    setMute: function(m) {
      isAudioMuted = !!m;
      if (isAudioMuted) {
        audioReadPtr = audioWritePtr;
      }
    },

    activateAudio: initAudioContext,

    resumeAudio: function() {
      if (audioCtx && audioCtx.state !== "running") {
        audioCtx.resume().catch(() => {});
      }
    },

    connectRecordingAudio: function() {
      if (!audioCtx || !audioScriptNode) {
        initAudioContext();
      }
      if (!audioCtx || !audioScriptNode || typeof audioCtx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        const dest = audioCtx.createMediaStreamDestination();
        audioScriptNode.connect(dest);
        const tracks = dest.stream.getAudioTracks();
        return tracks.length ? tracks[0] : null;
      } catch (err) {
        console.warn("connectRecordingAudio error:", err);
        return null;
      }
    },

    audioDiag: function() {
      return {
        audio: audioCtx ? audioCtx.state : "none",
        audioRate: audioCtx ? audioCtx.sampleRate : 0,
        audioNode: !!audioScriptNode
      };
    },

    getScore: function() {
      if (!nes || !nes.cpu || !nes.cpu.mem) return lastScore;
      const m = nes.cpu.mem;
      const bcd = (b) => ((b >> 4) & 0xF) * 10 + (b & 0xF);
      const s = bcd(m[0x55]) * 10000 + bcd(m[0x54]) * 100 + bcd(m[0x53]);
      return Math.max(s, lastScore);
    },

    getLines: function() {
      if (!nes || !nes.cpu || !nes.cpu.mem) return 0;
      const m = nes.cpu.mem;
      const bcd = (b) => ((b >> 4) & 0xF) * 10 + (b & 0xF);
      return bcd(m[0x51]) * 100 + bcd(m[0x50]);
    },

    getLevel: function() {
      if (!nes || !nes.cpu || !nes.cpu.mem) return 0;
      return nes.cpu.mem[0x44] || 0;
    },

    triggerGameOver: function(manualScore) {
      const s = manualScore !== undefined ? manualScore : this.getScore();
      if (typeof window.onTetrisGameOver === "function") {
        window.onTetrisGameOver({ score: s, lines: this.getLines(), level: this.getLevel() });
      }
    }
  };

  let lastTime = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let lastFpsTime = 0;

  function renderVideoFrame(buffer) {
    for (let i = 0; i < NES_W * NES_H; i++) {
      const p = buffer[i];
      const r = (p >> 16) & 0xff;
      const g = (p >> 8) & 0xff;
      const b = p & 0xff;
      pixelBuf[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
    offscreenCtx.putImageData(imgData, 0, 0);
  }

  function handleAudioSample(left, right) {
    audioSamples++;
    const a = Math.abs(left) > Math.abs(right) ? Math.abs(left) : Math.abs(right);
    if (a > audioPeak) audioPeak = a;
    if (audioAvailable() > AUDIO_BUF_SIZE - 4096) return;
    sampleBufL[audioWritePtr] = left;
    sampleBufR[audioWritePtr] = right;
    audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
  }

  window.GGEMU_AUDIO = {
    diag: function() {
      return {
        audio: audioCtx ? audioCtx.state : "none",
        audioRate: audioCtx ? audioCtx.sampleRate : 0,
        audioNode: !!audioScriptNode,
        audioCallbacks: audioCallbacks,
        audioSamples: audioSamples,
        audioPeak: Math.round(audioPeak * 1000) / 1000
      };
    }
  };
})();
