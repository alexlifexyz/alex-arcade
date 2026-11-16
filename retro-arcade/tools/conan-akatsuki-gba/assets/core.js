// 32 位掌机巅峰 ARPG 神作《名侦探柯南 黎明之碑 中文版》(Shining Soul II Chinese) 掌机驱动
// 遵循 AGENTS.md 规范：超任钻石四键掌机 + 双肩键 + 十字键 + 环形缓冲区音频 + 59s 录屏分流 + 通关攻略笔记
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;
  var guideNotesActive = false;

  // 1. 初始化掌机按键配置与布局 (遵循超任经典灰紫主题 + 钻石四键形态规范：layout: "diamond", stick: false)
  var padConfig = {
    name: '名侦探柯南 黎明之碑',
    layout: 'diamond',
    stick: false,
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    // 人机工效设计：
    // 钻石四键：
    // btn-b (黄色): 正下方施法 / 快捷补给 (映射至 GBA 原生 B 键)
    // btn-a (红色): 正右方主武器蓄力攻击 (映射至 GBA 原生 A 键)
    // btn-x (绿色): 正上方副武器 / 快捷使用 (映射至 GBA 原生 B 键)
    // btn-y (蓝色): 正左方状态查看 / 背包装备 (映射至 GBA 原生 SELECT 键)
    actions: [
      {
            "id": "btn-b",
            "key": "B",
            "label": "B",
            "color": "yellow"
      },
      {
            "id": "btn-a",
            "key": "A",
            "label": "A",
            "color": "red"
      },
      {
            "id": "btn-x",
            "key": "X",
            "label": "X",
            "color": "green"
      },
      {
            "id": "btn-y",
            "key": "Y",
            "label": "Y",
            "color": "blue"
      }
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
      case 'a': return gba.keypad.A;       // 主武器蓄力攻击 / 确认
      case 'b': return gba.keypad.B;       // 施法 / 快捷补给 / 取消
      case 'x': return gba.keypad.L;       // 副武器 / 快捷补给
      case 'y': return gba.keypad.R;  // 状态查看 / 背包装备
      case 'l': return gba.keypad.L;       // 切换道具栏
      case 'r': return gba.keypad.R;       // 切换技能栏
      case 'select': return gba.keypad.SELECT;
      case 'start': return gba.keypad.START;
      case 'gba-a': return gba.keypad.A;
      case 'gba-b': return gba.keypad.B;
      case 'gba-l': return gba.keypad.L;
      case 'gba-r': return gba.keypad.R;
      default: return -1;
    }
  }

  // 3. 音频激活与录屏流分流
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

  // 4. PC 实体物理键盘纯内存映射监听
  function handleKeyEvent(e, isPressed) {
    if (!gba) return;
    var action = null;
    if (e.code) {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': action = 'up'; break;
        case 'KeyS': case 'ArrowDown': action = 'down'; break;
        case 'KeyA': case 'ArrowLeft': action = 'left'; break;
        case 'KeyD': case 'ArrowRight': action = 'right'; break;
        case 'KeyK': case 'KeyX': action = 'a'; break;
        case 'KeyJ': case 'KeyZ': action = 'b'; break;
        case 'KeyU': action = 'x'; break;
        case 'KeyI': action = 'y'; break;
        case 'KeyQ': action = 'l'; break;
        case 'KeyE': action = 'r'; break;
        case 'Enter': action = 'start'; break;
        case 'ShiftLeft': case 'ShiftRight': case 'Space': action = 'select'; break;
        default: break;
      }
    } else if (e.key) {
      if (e.key === 'ArrowUp') action = 'up';
      else if (e.key === 'ArrowDown') action = 'down';
      else if (e.key === 'ArrowLeft') action = 'left';
      else if (e.key === 'ArrowRight') action = 'right';
      else if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') action = 'a';
      else if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') action = 'b';
      else if (e.key === 'u' || e.key === 'U') action = 'x';
      else if (e.key === 'i' || e.key === 'I') action = 'y';
      else if (e.key === 'q' || e.key === 'Q') action = 'l';
      else if (e.key === 'e' || e.key === 'E') action = 'r';
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

  // 5. 轻量消息提示
  function showToast(msg) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function() {
      el.classList.remove('show');
    }, 2000);
  }

  // 6. 攻略笔记交互逻辑
  function bindGuideModal() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('guide-modal');
    var openBtn = document.getElementById('btn-guide');
    var closeBtn = document.getElementById('guide-close');
    var onBtn = document.getElementById('btn-guide-on');
    var offBtn = document.getElementById('btn-guide-off');
    if (!openBtn || !modal) return;

    function openModal(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      modal.style.display = 'flex';
    }

    openBtn.addEventListener('click', openModal);
    openBtn.addEventListener('touchend', openModal);

    if (closeBtn) {
      closeBtn.addEventListener('click', function(ev) {
        if (ev) ev.stopPropagation();
        modal.style.display = 'none';
      });
    }

    modal.addEventListener('click', function(ev) {
      if (ev.target === modal) {
        modal.style.display = 'none';
      }
    });

    if (offBtn) {
      offBtn.addEventListener('click', function(ev) {
        if (ev) ev.stopPropagation();
        guideNotesActive = false;
        showToast('已回到原版走法');
        modal.style.display = 'none';
      });
    }

    if (onBtn) {
      var followStarting = false;
      onBtn.addEventListener('click', function(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        if (followStarting) return;
        followStarting = true;

        var mt = window.xhs && window.xhs.miniTool;
        var settled = false;

        function grant() {
          if (settled) return;
          settled = true;
          guideNotesActive = true;
          showToast('笔记走法已打开');
          modal.style.display = 'none';
          followStarting = false;
        }

        function deny() {
          if (settled) return;
          followStarting = false;
          if (mt && typeof mt.getFollowStatus === 'function') {
            mt.getFollowStatus({
              success: function(res) {
                var st = res && (res.followStatus !== undefined ? res.followStatus : res.status);
                if (st > 0) {
                  grant();
                } else {
                  showToast('还没关注，走法先不动');
                }
              },
              fail: function() {
                showToast('还没关注，走法先不动');
              }
            });
            return;
          }
          // 在无桥接环境（如浏览器预览）直接激活体验
          grant();
        }

        if (!mt || typeof mt.followAuthor !== 'function') {
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

  // 7. 核心驱动对外接口
  var coreInstance = {
    name: '名侦探柯南 黎明之碑',
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

      // 准备离屏画布
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

      // 绑定攻略弹窗
      bindGuideModal();

      // 读取静音设置
      try {
        var savedMute = localStorage.getItem('shining_soul2_mute') || localStorage.getItem('ggemu_mute');
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

      // 开机秒开穿透：执行预热脉冲步进（跳过 Sega/Atlus 标志），0.2秒内直达100%着色全彩大标题
      try {
        for (var f = 0; f < 720; f++) {
          if (f % 40 < 20) {
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

      console.log('名侦探柯南 黎明之碑 中文版 GBA 引擎初始化成功，准备就绪');
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
        // 秒开预热步进
        for (var f = 0; f < 720; f++) {
          if (f % 40 < 20) {
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
        console.log('名侦探柯南 黎明之碑 中文版 一键复位重启成功');
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

    // 按键输入分发 (遵循 GBA 硬件 Active-Low 规范与前缀规整化)
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
        localStorage.setItem('shining_soul2_mute', String(isMute));
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
        }
        if (gba.audio.connectRecordingAudio) {
          try { gba.audio.connectRecordingAudio(recAudioDest); } catch (_) {}
        }
        if (gba.audio.jsAudio) {
          try { gba.audio.jsAudio.connect(recAudioDest); } catch (_) {}
        }
        var tracks = recAudioDest.stream ? recAudioDest.stream.getAudioTracks() : null;
        return tracks && tracks.length ? tracks[0] : null;
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
      return coreInstance.exportState();
    },

    loadState: function(compressed) {
      return coreInstance.importState(compressed);
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
