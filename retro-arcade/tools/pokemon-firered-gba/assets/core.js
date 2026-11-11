// 官方正统 32 位掌机巅峰神作《宝可梦：火红 中文版》(Pokemon FireRed Chinese) 掌机驱动
// 遵循 AGENTS.md 规范：红球摇杆 + 钻石四键 + 双肩键 + 环形缓冲区音频 + 59s 录屏分流
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;

  // 1. 初始化掌机按键配置与布局 (严格遵循 diamond 钻石四键规范，GBA 宽屏紧凑自适应，中文胶囊键)
  var padConfig = {
    name: '宝可梦：火红 中文版',
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
    // 正下方黄色 B 键：对话 / 调查 / 选招 / 确认（映射至 GBA 原生 A 键，大拇指最自然落点）
    // 正右方红色 A 键：取消 / 穿风速鞋按住奔跑（映射至 GBA 原生 B 键）
    // 正上方绿色 X 键：快捷道具一键使用（映射至 GBA 原生 SELECT 键）
    // 正左方蓝色 Y 键：呼出主菜单（映射至 GBA 原生 START 键）
    actions: [
      { id: 'btn-b', key: 'B', label: '确认', sub: '对话', color: 'yellow' },
      { id: 'btn-a', key: 'A', label: '取消', sub: '奔跑', color: 'red' },
      { id: 'btn-x', key: 'X', label: '道具', sub: '快捷', color: 'green' },
      { id: 'btn-y', key: 'Y', label: '菜单', sub: '主单', color: 'blue' }
    ],
    shoulders: [
      { id: 'btn-l', label: 'L 帮助' },
      { id: 'btn-r', label: 'R 翻页' }
    ],
    capsules: [
      { id: 'btn-select', label: '道具' },
      { id: 'btn-start', label: '菜单' }
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
      case 'b': return gba.keypad.A;       // 正下方黄色 B 键 -> 对话 / 调查 / 选招 / 确认 (GBA 原生 A 键)
      case 'a': return gba.keypad.B;       // 正右方红色 A 键 -> 取消 / 风速鞋奔跑 (GBA 原生 B 键)
      case 'x': return gba.keypad.SELECT;  // 正上方绿色 X 键 -> 快捷道具一键使用 (GBA 原生 SELECT 键)
      case 'y': return gba.keypad.START;   // 正左方蓝色 Y 键 -> 呼出主菜单 (GBA 原生 START 键)
      case 'start': return gba.keypad.START;
      case 'select': return gba.keypad.SELECT;
      case 'l': return gba.keypad.L;       // 顶部左肩键 L
      case 'r': return gba.keypad.R;       // 顶部右肩键 R
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

  // 4. 核心驱动对外接口
  var coreInstance = {
    name: '宝可梦：火红 中文版',
    pad: padConfig,

    video: function() {
      return { w: 240, h: 160 };
    },

    source: function() {
      return canvas;
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
        var savedMute = localStorage.getItem('pokemon_firered_mute') || localStorage.getItem('ggemu_mute');
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

      // 开机秒开穿透：执行轻量预热步进，直达 Game Freak 星星聚集全彩开场
      try {
        for (var f = 0; f < 120; f++) {
          gba.step();
        }
      } catch (errStep) {
        console.warn('开机预热轻微异常:', errStep);
      }

      // 确保按键初始化为全部未按下状态 (Active-Low: 0x03FF)
      if (gba.keypad) {
        gba.keypad.currentDown = 0x03FF;
      }

      console.log('宝可梦：火红 中文版 GBA 引擎初始化成功，准备就绪');
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
        for (var f = 0; f < 120; f++) {
          gba.step();
        }
        console.log('宝可梦：火红 中文版 一键复位重启成功');
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

    setMuted: function(mute) {
      coreInstance.setMute(mute);
    },

    setMute: function(mute) {
      isMute = !!mute;
      try {
        localStorage.setItem('pokemon_firered_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (e) {}
      if (gba && gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }
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
          gba.audio.connectRecordingAudio(destNode);
        }
        return null;
      }
      if (!ctx || typeof ctx.createMediaStreamDestination !== "function") {
        return null;
      }
      try {
        var dest = ctx.createMediaStreamDestination();
        if (gba.audio.jsAudio) {
          gba.audio.jsAudio.connect(dest);
        }
        var tracks = dest.stream.getAudioTracks();
        return tracks && tracks.length ? tracks[0] : null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    activateAudio: function() {
      activateAudio();
    },

    resumeAudio: function() {
      activateAudio();
    },

    audioDiag: function() {
      var ctx = gba && gba.audio ? gba.audio.context : null;
      return {
        ok: !!ctx && ctx.state === "running",
        contextState: ctx ? ctx.state : "none",
        sampleRate: ctx ? ctx.sampleRate : 0,
        nodeAttached: !!(gba && gba.audio && gba.audio.jsAudio),
        primes: audioPrimes
      };
    },

    exportState: function() {
      if (!gba) throw new Error('游戏未运行');
      return JSON.stringify({
        v: 1,
        sys: 'pokemon-firered-gba',
        t: Date.now(),
        state: coreInstance.saveState()
      });
    },

    importState: function(stateStr) {
      if (!gba) throw new Error('游戏未运行');
      var obj = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
      if (obj.sys !== 'pokemon-firered-gba' || !obj.state) {
        throw new Error('存档格式不兼容');
      }
      var ok = coreInstance.loadState(obj.state);
      if (!ok) throw new Error('读档失败');
      return true;
    },

    saveState: function() {
      if (!gba) return null;
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
