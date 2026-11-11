// 官方正统 32 位经典战棋神作《最终幻想战略版A》掌机驱动
// 遵循 AGENTS.md 规范：红球摇杆 + 钻石四键（确认/取消/视角/单位）+ 8帧胶囊缓冲 + 32768 环形缓冲区音频 + 59s 立体声录屏分流
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var recAudioDest = null;
  var hostCallbacks = null;

  // 胶囊键 8 帧防漏缓冲守卫
  var startHoldFrames = 0;
  var selectHoldFrames = 0;
  var rawKeyStates = {};

  // 1. 初始化掌机按键配置与布局 (严格遵循 diamond 钻石四键规范，GBA 宽屏紧凑自适应，中文胶囊键)
  var padConfig = {
    name: '最终幻想战略版A',
    layout: 'diamond',
    stick: true,
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    // 人机工效设计：
    // 正下方黄色主键：确认 / 执行指令 / 调查 (GBA 原生 A 键)
    // 正右方红色副键：取消 / 返回选单 (GBA 原生 B 键)
    // 正上方绿色按键：视角切换 / 地图信息 (GBA 原生 R 键)
    // 正左方蓝色按键：单位轮换 / 属性查看 (GBA 原生 L 键)
    actions: [
      { id: 'btn-b', key: 'B', label: '确认', sub: '指令', color: 'yellow' },
      { id: 'btn-a', key: 'A', label: '取消', sub: '返回', color: 'red' },
      { id: 'btn-x', key: 'X', label: '视角', sub: 'R键', color: 'green' },
      { id: 'btn-y', key: 'Y', label: '单位', sub: 'L键', color: 'blue' }
    ],
    shoulders: [
      { id: 'btn-l', label: 'L' },
      { id: 'btn-r', label: 'R' }
    ],
    capsules: [
      { id: 'btn-select', label: '选择' },
      { id: 'btn-start', label: '开始' }
    ]
  };

  // 2. 键位映射表 (前缀规整化，映射至 GBA 硬件键位索引)
  function mapButtonToGbaKey(rawBtnId) {
    if (!gba || !gba.keypad) return -1;
    var norm = String(rawBtnId || "").toLowerCase().replace(/^btn-/, "");
    switch (norm) {
      case 'up': return gba.keypad.UP;
      case 'down': return gba.keypad.DOWN;
      case 'left': return gba.keypad.LEFT;
      case 'right': return gba.keypad.RIGHT;
      // 正下方黄色主键 -> 确认 / 执行指令 (GBA 原生 A 键)
      case 'b': return gba.keypad.A;
      // 正右方红色副键 -> 取消 / 返回 (GBA 原生 B 键)
      case 'a': return gba.keypad.B;
      // 正上方绿色按键 -> 视角切换 (GBA 原生 R 键)
      case 'x': return gba.keypad.R;
      // 正左方蓝色按键 -> 单位轮换 (GBA 原生 L 键)
      case 'y': return gba.keypad.L;
      // 实体顶部肩键
      case 'l': return gba.keypad.L;
      case 'r': return gba.keypad.R;
      // 经典胶囊键
      case 'select': return gba.keypad.SELECT;
      case 'start': return gba.keypad.START;
      default: return -1;
    }
  }

  // 3. 音频手势激活与录屏流分流
  var audioPrimes = 0;
  function activateAudio() {
    if (isMute) return;
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

    if (!gba || !gba.audio) return;
    var ctx = gba.audio.context;

    if (ctx && ctx.state !== "running") {
      ctx.resume().catch(function() {});
    }

    if (ctx && gba.audio.jsAudio) {
      try {
        gba.audio.jsAudio.connect(ctx.destination);
      } catch (_) {}
    }

    if (gba.audio && !gba.audio.enabled) {
      gba.audio.writeEnable(1);
    }

    // 播放 1 个采样的静音 BufferSource，强制激活移动端 WebKit 底层硬件通电
    if (ctx && audioPrimes < 5) {
      audioPrimes++;
      try {
        var dummy = ctx.createBufferSource();
        dummy.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
        dummy.connect(ctx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    if (recAudioDest && gba.audio.connectRecordingAudio) {
      gba.audio.connectRecordingAudio(recAudioDest);
    }
  }

  // 绑定全手势捕获破冰
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  // 4. 秒开穿透步进函数 (280 帧预热直达全彩大标题)
  function fastForwardToTitle(emulator) {
    if (!emulator) return;
    try {
      for (var f = 0; f < 280; f++) {
        // 在第 60、120、180、240 帧轻按 START 穿透厂商商标
        if (f === 60 || f === 120 || f === 180 || f === 240) {
          emulator.keypad.currentDown &= ~(1 << emulator.keypad.START);
          emulator.keypad.currentDown &= ~(1 << emulator.keypad.A);
        } else {
          emulator.keypad.currentDown |= (1 << emulator.keypad.START);
          emulator.keypad.currentDown |= (1 << emulator.keypad.A);
        }
        emulator.step();
      }
      emulator.keypad.currentDown = 0x03FF;
    } catch (e) {
      console.warn("秒开穿透遇到异常:", e);
    }
  }

  // 5. 统一核心驱动接口暴露 (GGEMU_CORE 标准协议)
  var coreInstance = {
    pad: padConfig,

    source: function() {
      return canvas;
    },

    video: function() {
      return { w: 240, h: 160 };
    },

    boot: function(romData, host) {
      hostCallbacks = host || {};

      // 准备离屏/主画布
      if (!canvas && typeof document !== 'undefined') {
        canvas = document.getElementById('screen');
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'screen';
          canvas.width = 240;
          canvas.height = 160;
          canvas.style.display = 'none';
          document.body.appendChild(canvas);
        } else {
          canvas.width = 240;
          canvas.height = 160;
        }
      }

      // 实例化 GBA 引擎
      if (!gba) {
        gba = new window.GameBoyAdvance();
        if (canvas) {
          gba.setCanvas(canvas);
        }
      }

      function onRomBufferReady(buf) {
        try {
          gba.setRom(buf);
          fastForwardToTitle(gba);
          if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
            hostCallbacks.onReady();
          }
          console.log('最终幻想战略版A 模拟引擎初始化成功，准备就绪');
        } catch (err) {
          console.error('加载最终幻想战略版A ROM 失败:', err);
        }
      }

      if (window.ROM_BUFFER) {
        onRomBufferReady(window.ROM_BUFFER);
      } else if (window.ROM_READY && typeof window.ROM_READY.then === 'function') {
        window.ROM_READY.then(onRomBufferReady).catch(function(e) {
          console.error('ROM_READY rejected:', e);
        });
      } else {
        var timer = setInterval(function() {
          if (window.ROM_BUFFER) {
            clearInterval(timer);
            onRomBufferReady(window.ROM_BUFFER);
          }
        }, 30);
      }
    },

    tick: function(dt) {
      if (!gba) return;

      // 胶囊键防漏按缓冲衰减与电平保持
      if (startHoldFrames > 0) {
        startHoldFrames--;
        gba.keypad.currentDown &= ~(1 << gba.keypad.START);
      } else if (!rawKeyStates['start']) {
        gba.keypad.currentDown |= (1 << gba.keypad.START);
      }

      if (selectHoldFrames > 0) {
        selectHoldFrames--;
        gba.keypad.currentDown &= ~(1 << gba.keypad.SELECT);
      } else if (!rawKeyStates['select']) {
        gba.keypad.currentDown |= (1 << gba.keypad.SELECT);
      }

      var steps = Math.max(1, Math.min(speedMultiplier, 5));
      for (var s = 0; s < steps; s++) {
        gba.step();
      }
    },

    setButton: function(btnId, isPressed) {
      if (!gba || !gba.keypad) return;
      var norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      rawKeyStates[norm] = !!isPressed;

      // 8 帧防漏缓冲脉冲注入
      if (isPressed) {
        if (norm === 'start') startHoldFrames = 8;
        if (norm === 'select') selectHoldFrames = 8;
      }

      var keyIndex = mapButtonToGbaKey(btnId);
      if (keyIndex < 0) return;

      // Active-Low: 0 为按下, 1 为松开
      if (isPressed) {
        gba.keypad.currentDown &= ~(1 << keyIndex);
      } else {
        // 如果是 start/select 且处于 8 帧脉冲缓冲期，暂不释放
        if (norm === 'start' && startHoldFrames > 0) return;
        if (norm === 'select' && selectHoldFrames > 0) return;
        gba.keypad.currentDown |= (1 << keyIndex);
      }

      if (isPressed && !isMute) {
        activateAudio();
      }
    },

    setSpeed: function(mult) {
      speedMultiplier = Math.max(1, Math.min(Number(mult) || 1, 5));
      console.log('游戏速度设为:', speedMultiplier);
    },

    setSpeedMultiplier: function(mult) {
      this.setSpeed(mult);
    },

    reset: function() {
      if (!gba) return;
      try {
        if (window.ROM_BUFFER) {
          gba.setRom(window.ROM_BUFFER);
          gba.keypad.currentDown = 0x03FF;
          startHoldFrames = 0;
          selectHoldFrames = 0;
          rawKeyStates = {};
          fastForwardToTitle(gba);
          if (gba.audio && !isMute) {
            gba.audio.writeEnable(1);
          }
          console.log('最终幻想战略版A 一键复位重启成功');
        }
      } catch (e) {
        console.error('复位失败:', e);
      }
    },

    exportState: function() {
      if (!gba || !gba.mmu) return null;
      try {
        var sram = gba.mmu.save;
        if (!sram || !sram.view) return null;
        var bytes = new Uint8Array(sram.view);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        var rawB64 = btoa(bin);
        if (typeof LZString !== 'undefined' && LZString.compressToUTF16) {
          return "LZ:" + LZString.compressToUTF16(rawB64);
        }
        return rawB64;
      } catch (e) {
        console.error('导存档失败:', e);
        return null;
      }
    },

    importState: function(stateData) {
      if (!gba || !gba.mmu || !stateData) return false;
      try {
        var b64 = stateData;
        if (typeof stateData === 'string' && stateData.indexOf("LZ:") === 0) {
          if (typeof LZString !== 'undefined' && LZString.decompressFromUTF16) {
            b64 = LZString.decompressFromUTF16(stateData.substring(3));
          }
        }
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        if (gba.mmu.save && gba.mmu.save.view) {
          new Uint8Array(gba.mmu.save.view).set(bytes);
          return true;
        }
        return false;
      } catch (e) {
        console.error('读存档失败:', e);
        return false;
      }
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    isMuted: function() {
      return isMute;
    },

    setMute: function(mute) {
      isMute = !!mute;
      if (!gba || !gba.audio) return;
      if (isMute) {
        gba.audio.writeEnable(0);
      } else {
        gba.audio.writeEnable(1);
        activateAudio();
      }
    },

    audioDiag: function() {
      var info = {
        "状态": (gba && gba.audio && gba.audio.enabled) ? "已启用" : "未启用",
        "静音": isMute ? "是" : "否"
      };
      if (gba && gba.audio && gba.audio.context) {
        info["上下文状态"] = gba.audio.context.state;
        info["采样率"] = gba.audio.context.sampleRate;
      }
      return info;
    },

    connectRecordingAudio: function(destNode) {
      if (destNode) {
        recAudioDest = destNode;
      }
      activateAudio();
      if (gba && gba.audio && gba.audio.connectRecordingAudio) {
        try {
          var track = gba.audio.connectRecordingAudio(destNode);
          if (track) return track;
        } catch (_) {}
      }
      if (gba && gba.audio && gba.audio.context) {
        var ctx = gba.audio.context;
        if (!recAudioDest) {
          recAudioDest = ctx.createMediaStreamDestination();
        }
        if (gba.audio.jsAudio) {
          try {
            gba.audio.jsAudio.connect(recAudioDest);
          } catch (_) {}
        }
        if (recAudioDest.stream && recAudioDest.stream.getAudioTracks().length > 0) {
          return recAudioDest.stream.getAudioTracks()[0];
        }
      }
      return null;
    }
  };

  window.GGEMU_CORE = coreInstance;
})();
