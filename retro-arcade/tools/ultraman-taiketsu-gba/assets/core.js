// 32 位掌机巅峰神作《光之英雄传说 中文版》掌机驱动
// 遵循 AGENTS.md 规范：两键十字掌机 + 双肩键 + 环形缓冲区音频 + 59s 录屏分流 + 全键盘/蓝牙手柄支持
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;

  // 1. 初始化掌机按键配置与布局 (严格遵循两键十字掌机形态规范：layout: "two-button", stick: false)
  var padConfig = {
    name: '光之英雄传说 中文版',
    layout: 'two-button',
    stick: false,
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    // 人机工效设计：
    // 右侧双圆键大药丸底座：
    // btn-a: key "A", label "A", color "yellow"（映射至 GBA 原生 A 键 keypad.A，轻拳/确认）
    // btn-b: key "B", label "B", color "red"（映射至 GBA 原生 B 键 keypad.B，重击/踢腿）
    actions: [
      { id: 'btn-a', key: 'A', label: 'A', color: 'yellow' },
      { id: 'btn-b', key: 'B', label: 'B', color: 'red' }
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

  // 2. 键位映射表 (映射至 GBA 硬件键位索引)
  function mapButtonToGbaKey(rawBtnId) {
    if (!gba || !gba.keypad) return -1;
    var norm = String(rawBtnId || "").toLowerCase().replace(/^btn-/, "");
    switch (norm) {
      case 'up': return gba.keypad.UP;
      case 'down': return gba.keypad.DOWN;
      case 'left': return gba.keypad.LEFT;
      case 'right': return gba.keypad.RIGHT;
      case 'a': return gba.keypad.A;       // A 键轻击/确认
      case 'b': return gba.keypad.B;       // B 键重击/取消
      case 'l': return gba.keypad.L;       // 顶部左肩键 L (防御/蓄力)
      case 'r': return gba.keypad.R;       // 顶部右肩键 R (必杀切换)
      case 'select': return gba.keypad.SELECT; // 选择键
      case 'start': return gba.keypad.START;   // 开始键
      case 'gba-a': return gba.keypad.A;
      case 'gba-b': return gba.keypad.B;
      case 'gba-l': return gba.keypad.L;
      case 'gba-r': return gba.keypad.R;
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

    if (gba && gba.audio && gba.audio.context) {
      var ctx = gba.audio.context;
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume().catch(function() {});
      }
      if (gba.audio && !gba.audio.enabled) {
        gba.audio.writeEnable(1);
      }
      if (audioPrimes < 3 && ctx.state === 'running') {
        try {
          var buf = ctx.createBuffer(1, 1, 22050);
          var src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
          audioPrimes++;
        } catch (_) {}
      }
      if (recAudioDest) {
        if (gba.audio.connectRecordingAudio) {
          try { gba.audio.connectRecordingAudio(recAudioDest); } catch (_) {}
        }
        if (gba.audio.jsAudio) {
          try { gba.audio.jsAudio.connect(recAudioDest); } catch (_) {}
        }
      }
    }
  }

  // 4. PC 实体物理键盘纯内存映射监听 (杜绝 input 焦点劫持与软键盘弹出)
  function handleKeyEvent(e, isPressed) {
    if (!gba) return;
    var action = null;
    if (e.code) {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': action = 'up'; break;
        case 'KeyS': case 'ArrowDown': action = 'down'; break;
        case 'KeyA': case 'ArrowLeft': action = 'left'; break;
        case 'KeyD': case 'ArrowRight': action = 'right'; break;
        case 'KeyJ': case 'KeyZ': action = 'b'; break;
        case 'KeyK': case 'KeyX': action = 'a'; break;
        case 'KeyU': case 'KeyQ': action = 'l'; break;
        case 'KeyI': case 'KeyE': action = 'r'; break;
        case 'Enter': action = 'start'; break;
        case 'ShiftLeft': case 'ShiftRight': case 'Space': action = 'select'; break;
        default: break;
      }
    } else if (e.key) {
      if (e.key === 'ArrowUp') action = 'up';
      else if (e.key === 'ArrowDown') action = 'down';
      else if (e.key === 'ArrowLeft') action = 'left';
      else if (e.key === 'ArrowRight') action = 'right';
      else if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') action = 'b';
      else if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') action = 'a';
      else if (e.key === 'u' || e.key === 'U') action = 'l';
      else if (e.key === 'i' || e.key === 'I') action = 'r';
      else if (e.key === 'Enter') action = 'start';
      else if (e.key === 'Shift') action = 'select';
    }

    if (action) {
      coreInstance.setButton(action, isPressed);
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', function(e) { handleKeyEvent(e, true); }, false);
    window.addEventListener('keyup', function(e) { handleKeyEvent(e, false); }, false);
  }

  // 5. 核心驱动对外接口
  var coreInstance = {
    name: '光之英雄传说 中文版',
    pad: padConfig,

    video: function() {
      return { w: 240, h: 160 };
    },

    source: function() {
      return canvas;
    },

    ensureFocus: function() {
      if (typeof window !== 'undefined' && typeof window.focus === 'function') {
        try { window.focus(); } catch (_) {}
      }
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
          if (document.body && document.body.appendChild) {
            document.body.appendChild(canvas);
          }
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

      // 读取用户偏好静音设置
      try {
        var savedMute = localStorage.getItem('ultraman_taiketsu_mute') || localStorage.getItem('ggemu_mute');
        if (savedMute !== null) {
          isMute = (savedMute === 'true');
        }
      } catch (e) {}
      if (gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }

      // 处理 ROM 数据加载
      var targetRom = romData || window.ROM_DATA || window.ROM_BUFFER;
      if (!targetRom && window.ROM_READY && typeof window.ROM_READY.then === 'function') {
        window.ROM_READY.then(function(buf) {
          coreInstance.boot(buf, host);
        });
        return;
      }

      // Base64 解码支持
      if (typeof targetRom === 'string') {
        try {
          var binaryString = atob(targetRom);
          var len = binaryString.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          targetRom = bytes.buffer;
        } catch (err) {
          console.error('Base64 ROM 解码失败:', err);
        }
      }

      if (!targetRom) {
        console.error('未找到有效的 ROM 数据');
        if (hostCallbacks && hostCallbacks.toast) {
          hostCallbacks.toast('ROM 数据加载失败');
        }
        return;
      }

      var ok = gba.setRom(targetRom);
      if (!ok) {
        console.error('GBA 引擎载入 ROM 失败');
        if (hostCallbacks && hostCallbacks.toast) {
          hostCallbacks.toast('ROM 校验失败');
        }
        return;
      }

      // 开机秒开穿透：执行预热脉冲步进，穿透启动版权画面，0.2秒内直达全彩标题画面
      try {
        for (var f = 0; f < 350; f++) {
          if (f % 40 < 15) {
            gba.keypad.currentDown &= ~(1 << gba.keypad.START);
            gba.keypad.currentDown &= ~(1 << gba.keypad.A);
          } else {
            gba.keypad.currentDown |= (1 << gba.keypad.START);
            gba.keypad.currentDown |= (1 << gba.keypad.A);
          }
          gba.step();
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
        for (var s = 0; s < 10; s++) {
          gba.step();
        }
      } catch (errStep) {
        console.warn('开机预热轻微异常:', errStep);
      }

      // 确保按键初始化为全部未按下状态 (Active-Low: 0x03FF)
      if (gba.keypad) {
        gba.keypad.currentDown = 0x03FF;
      }

      console.log('光之英雄传说 中文版 GBA 引擎初始化成功，准备就绪');
      if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
        hostCallbacks.onReady();
      }
    },

    // 兼容 init 调用
    init: function(gameCanvas) {
      if (gameCanvas) canvas = gameCanvas;
      coreInstance.boot(window.ROM_DATA || window.ROM_BUFFER, {
        onReady: function() {
          if (animFrameId) cancelAnimationFrame(animFrameId);
          function loop() {
            coreInstance.tick();
            animFrameId = requestAnimationFrame(loop);
          }
          animFrameId = requestAnimationFrame(loop);
        }
      });
    },

    // 一键复位纯内存标准契约
    reset: function() {
      if (!gba) return;
      try {
        if (gba.audio) gba.audio.writeEnable(1);
        var rom = window.ROM_DATA || window.ROM_BUFFER;
        if (rom) {
          gba.setRom(rom);
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
        for (var f = 0; f < 100; f++) {
          gba.step();
        }
        console.log('光之英雄传说 中文版 一键复位重启成功');
      } catch (e) {
        console.warn('reset warning:', e);
      }
    },

    // 帧步进接口 (由 shell.js 的 Ae() 循环每帧调用)
    tick: function() {
      if (!gba) return;
      var steps = speedMultiplier || 1;
      for (var s = 0; s < steps; s++) {
        gba.step();
      }
    },

    // 按键输入分发 (遵循 GBA 硬件 Active-Low 规范)
    setButton: function(btnId, pressed) {
      activateAudio();

      var keyIndex = mapButtonToGbaKey(btnId);
      if (keyIndex >= 0 && gba && gba.keypad) {
        // GBA 硬件 KEYINPUT: 0 代表按下，1 代表松开
        if (pressed) {
          gba.keypad.currentDown &= ~(1 << keyIndex);
        } else {
          gba.keypad.currentDown |= (1 << keyIndex);
        }
      }
    },

    setSpeed: function(mul) {
      speedMultiplier = mul || 1;
    },

    setSpeedMultiplier: function(mul) {
      speedMultiplier = mul || 1;
    },

    getSpeedMultiplier: function() {
      return speedMultiplier;
    },

    toggleMute: function() {
      isMute = !isMute;
      if (gba && gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }
      try {
        localStorage.setItem('ultraman_taiketsu_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (e) {}
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (!gba || !gba.audio) return null;
      var ctx = gba.audio.context;
      if (ctx && ctx.state !== "running") {
        ctx.resume().catch(function() {});
      }
      if (gba.audio && !gba.audio.enabled) {
        gba.audio.writeEnable(1);
      }
      if (destNode) {
        recAudioDest = destNode;
        if (gba.audio.connectRecordingAudio) {
          try { gba.audio.connectRecordingAudio(destNode); } catch (_) {}
        }
        if (gba.audio.jsAudio) {
          try { gba.audio.jsAudio.connect(destNode); } catch (_) {}
        }
        return null;
      }
      if (!ctx || typeof ctx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        if (!recAudioDest) {
          recAudioDest = ctx.createMediaStreamDestination();
          // 加固：微弱静音源驱动 WebKit AudioTrack 时钟，彻底杜绝录制初期静音导致 muxer 0 字节
          try {
            var silentGain = ctx.createGain();
            silentGain.gain.value = 0;
            var osc = ctx.createOscillator();
            osc.connect(silentGain);
            silentGain.connect(recAudioDest);
            osc.start(0);
          } catch (_) {}
        }
        if (gba.audio.connectRecordingAudio) {
          try { gba.audio.connectRecordingAudio(recAudioDest); } catch (_) {}
        }
        if (gba.audio.jsAudio) {
          try { gba.audio.jsAudio.connect(recAudioDest); } catch (_) {}
        }
        var tracks = recAudioDest.stream ? recAudioDest.stream.getAudioTracks() : null;
        return (tracks && tracks.length && tracks[0].readyState === "live") ? tracks[0] : null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    getAudioNode: function() {
      return this.connectRecordingAudio();
    },

    resumeAudio: function() {
      activateAudio();
    },

    // 即时存读档标准契约 (LZ-String 压缩防撑爆 LocalStorage)
    exportState: function() {
      if (!gba || typeof gba.freeze !== 'function') return null;
      try {
        var state = gba.freeze();
        var jsonStr = JSON.stringify(state);
        if (typeof window !== "undefined" && window.LZString && window.LZString.compressToBase64) {
          return window.LZString.compressToBase64(jsonStr);
        }
        return jsonStr;
      } catch (e) {
        console.error('即时存档失败:', e);
        return null;
      }
    },

    importState: function(compressed) {
      if (!gba || !compressed) return false;
      try {
        var jsonStr = compressed;
        if (typeof window !== "undefined" && window.LZString && window.LZString.decompressFromBase64) {
          var decompB64 = window.LZString.decompressFromBase64(compressed);
          if (decompB64) jsonStr = decompB64;
        }
        var state = JSON.parse(jsonStr);
        gba.defrost(state);
        if (gba.audio) gba.audio.writeEnable(1);
        return true;
      } catch (e) {
        console.error('即时读档失败:', e);
        return false;
      }
    },

    saveState: function() {
      if (!gba || typeof gba.freeze !== 'function') return null;
      try {
        var state = gba.freeze();
        var jsonStr = JSON.stringify(state);
        if (typeof window !== "undefined" && window.LZString && window.LZString.compressToBase64) {
          return window.LZString.compressToBase64(jsonStr);
        }
        return jsonStr;
      } catch (e) {
        console.error('即时存档失败:', e);
        return null;
      }
    },

    loadState: function(compressed) {
      if (!gba || !compressed) return false;
      try {
        var jsonStr = compressed;
        if (typeof window !== "undefined" && window.LZString && window.LZString.decompressFromBase64) {
          var decompB64 = window.LZString.decompressFromBase64(compressed);
          if (decompB64) jsonStr = decompB64;
        }
        var state = JSON.parse(jsonStr);
        gba.defrost(state);
        if (gba.audio) gba.audio.writeEnable(1);
        return true;
      } catch (e) {
        console.error('即时读档失败:', e);
        return false;
      }
    },

    destroy: function() {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (gba) {
        if (gba.audio && gba.audio.clear) gba.audio.clear();
        gba = null;
      }
      recAudioDest = null;
    }
  };

  // 全局挂载内核适配器
  if (typeof window !== 'undefined') {
    window.GGEMU_CORE = coreInstance;
    window.GBA_CORE = coreInstance;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = coreInstance;
  }
})();
