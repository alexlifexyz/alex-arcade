// 32 位掌机动作探索巅峰神作《恶魔城：月轮 中文版》(Castlevania: Circle of the Moon Chinese) GBA 掌机驱动
// 遵循 AGENTS.md 避坑准则与官方沙盒规范：
// 曜石黑钻石四键（下黄跳跃、右红挥鞭、上绿副武器、左蓝冲刺）+ 顶部双肩键（L冲刺、R激活DSS）+ 十字键
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;
  var targetRomBuffer = null;

  // 攻略护佑状态（默认关闭，支持双向切换）
  var guideActive = false;

  // 1. 初始化掌机按键配置与布局 (严格对齐 GBA 原版两键 + 顶部双肩键人机工效规范)
  var padConfig = {
    name: '恶魔城月轮',
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
    // 右侧大药丸胶囊底座包裹 A、B 两个标准正圆按键（半径 24px，中心距 >= 76.8px，绝不粘连）：
    // btn-a: A 键 (黄色，映射至 GBA 原生 A 键，主拇指自然落点：起跳与选单确认)
    // btn-b: B 键 (红色，映射至 GBA 原生 B 键，挥鞭攻击与选单取消)
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
      case 'a': return gba.keypad.A;       // 跳跃 / 确认 -> GBA A
      case 'b': return gba.keypad.B;       // 挥鞭 / 取消 -> GBA B
      case 'l': return gba.keypad.L;       // 顶部左肩键 L -> 冲刺 Dash
      case 'r': return gba.keypad.R;       // 顶部右肩键 R -> DSS 魔法激活
      case 'select': return gba.keypad.SELECT;
      case 'start': return gba.keypad.START;
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

  // 4. PC 实体物理键盘纯内存映射监听 (杜绝 input 焦点劫持)
  function handleKeyEvent(e, isPressed) {
    if (!gba) return;
    var action = null;
    if (e.code) {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': action = 'up'; break;
        case 'KeyS': case 'ArrowDown': action = 'down'; break;
        case 'KeyA': case 'ArrowLeft': action = 'left'; break;
        case 'KeyD': case 'ArrowRight': action = 'right'; break;
        case 'KeyK': case 'KeyX': action = 'btn-b'; break; // 跳跃
        case 'KeyJ': case 'KeyZ': action = 'btn-a'; break; // 挥鞭
        case 'KeyI': case 'KeyC': action = 'btn-x'; break; // 副武器
        case 'KeyU': case 'KeyA': action = 'btn-y'; break; // 冲刺
        case 'KeyQ': action = 'btn-l'; break;             // L 冲刺
        case 'KeyE': action = 'btn-r'; break;             // R 激活 DSS
        case 'Enter': action = 'btn-start'; break;
        case 'ShiftLeft': case 'ShiftRight': case 'Space': action = 'btn-select'; break;
        default: break;
      }
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

  // 5. 开机秒开穿透机制 (跳过 Konami 开场直接进入 100% 全彩大标题画面)
  function pulseBoot() {
    if (!gba || !gba.keypad) return;
    try {
      gba.keypad.currentDown = 0x03FF;
      for (var f = 0; f < 360; f++) {
        // 在 140~160 帧按 START 跳过 GameBoy 启动，在 220~240 帧按 START 跳过 Konami 版权
        if ((f >= 140 && f <= 160) || (f >= 220 && f <= 240)) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.START);
        } else {
          gba.keypad.currentDown |= (1 << gba.keypad.START);
        }
        gba.step();
      }
      gba.keypad.currentDown = 0x03FF;
      for (var s = 0; s < 40; s++) {
        gba.step();
      }
    } catch (e) {
      console.warn('开机预热轻微异常:', e);
    }
  }

  // 6. 核心驱动对外接口
  var coreInstance = {
    name: '恶魔城月轮',
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

      if (!gba) {
        gba = new window.GameBoyAdvance();
        if (canvas) {
          gba.setCanvas(canvas);
        }
      }

      try {
        var savedMute = localStorage.getItem('moon_mute') || localStorage.getItem('ggemu_mute');
        if (savedMute !== null) {
          isMute = (savedMute === 'true');
        }
      } catch (e) {}
      if (gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }

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

      targetRomBuffer = targetRom;
      var ok = gba.setRom(targetRom);
      if (!ok) {
        console.error('GBA 引擎载入 ROM 失败');
        if (hostCallbacks && hostCallbacks.toast) {
          hostCallbacks.toast('ROM 校验失败');
        }
        return;
      }

      // 执行秒开穿透
      pulseBoot();

      console.log('恶魔城月轮 中文版 GBA 引擎初始化成功，准备就绪');
      if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
        hostCallbacks.onReady();
      }
    },

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

    reset: function() {
      if (!gba) return;
      try {
        if (gba.audio) gba.audio.writeEnable(1);
        var rom = targetRomBuffer || window.ROM_DATA || window.ROM_BUFFER;
        if (rom) {
          gba.setRom(rom);
        }
        pulseBoot();
        console.log('恶魔城月轮 中文版 一键复位重启成功');
      } catch (e) {
        console.warn('reset warning:', e);
      }
    },

    tick: function() {
      if (!gba) return;
      var steps = speedMultiplier || 1;
      for (var s = 0; s < steps; s++) {
        gba.step();
      }

      // 攻略功能：原版机制守护（全卡片刻印与月神护佑）
      if (guideActive && gba.mmu && gba.mmu.memory) {
        try {
          var wram = new Uint8Array(gba.mmu.memory[gba.mmu.REGION_WORKING_RAM]);
          // 全卡片刻印 (Action Cards 10张, Attribute Cards 10张: 0x03FF)
          wram[0xAC] = 0xFF;
          wram[0xAD] = 0x03;
          wram[0xAE] = 0xFF;
          wram[0xAF] = 0x03;

          // 月神护佑：保持健康生命与魔法
          var maxHp = wram[0x92] | (wram[0x93] << 8);
          if (maxHp > 0) {
            wram[0x90] = wram[0x92];
            wram[0x91] = wram[0x93];
          }
          var maxMp = wram[0x96] | (wram[0x97] << 8);
          if (maxMp > 0) {
            wram[0x94] = wram[0x96];
            wram[0x95] = wram[0x97];
          }
        } catch (_) {}
      }
    },

    setButton: function(btnId, pressed) {
      activateAudio();

      var keyIndex = mapButtonToGbaKey(btnId);
      if (keyIndex >= 0 && gba && gba.keypad) {
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
        localStorage.setItem('moon_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (e) {}
      return isMute;
    },

    isMuted: function() {
      return isMute;
    },

    setMute: function(mute) {
      isMute = !!mute;
      if (gba && gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }
      try {
        localStorage.setItem('moon_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (e) {}
      return isMute;
    },

    resumeAudio: function() {
      activateAudio();
    },

    activateAudio: function() {
      activateAudio();
    },

    audioDiag: function() {
      return { ok: true, isMute: isMute };
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
          // 核心加固：连接微弱静音源驱动 WebKit 的 AudioTrack 时基，防止录制初期或静音时 muxer 出现 0 字节
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
        if (tracks && tracks.length > 0 && tracks[0].readyState === "live") {
          return tracks[0];
        }
        return null;
      } catch (err) {
        console.error("接入录制音轨失败:", err);
        return null;
      }
    },

    getAudioNode: function() {
      return this.connectRecordingAudio();
    },

    // 攻略功能状态切换接口 (默认关闭，支持双向切换)
    setGuideActive: function(active) {
      guideActive = !!active;
      return guideActive;
    },

    isGuideActive: function() {
      return guideActive;
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

  // 绑定底栏攻略弹窗交互逻辑 (完整接入小红书关注作者与移动端双事件)
  function initGuideUI() {
    if (typeof document === 'undefined') return;
    var btnGuide = document.getElementById('btn-guide');
    var modal = document.getElementById('guide-modal');
    var closeBtn = document.getElementById('guide-close');
    var btnOn = document.getElementById('btn-guide-on');
    var btnOff = document.getElementById('btn-guide-off');

    function showToast(msg) {
      if (typeof window !== 'undefined' && window.toast) {
        window.toast(msg);
      } else if (hostCallbacks && hostCallbacks.toast) {
        hostCallbacks.toast(msg);
      } else {
        var t = document.getElementById('toast');
        if (t) {
          t.textContent = msg;
          t.style.display = 'block';
          setTimeout(function() { t.style.display = 'none'; }, 2000);
        }
      }
    }

    function openModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (modal) modal.style.display = 'flex';
    }

    function closeModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (modal) modal.style.display = 'none';
    }

    if (btnGuide) {
      btnGuide.addEventListener('click', openModal);
      btnGuide.addEventListener('touchend', openModal);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
      closeBtn.addEventListener('touchend', closeModal);
    }
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal(e);
      });
    }

    var followStarting = false;
    function handleFollow(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (followStarting) return;
      followStarting = true;

      var mt = (typeof window !== 'undefined' && window.xhs) ? window.xhs.miniTool : null;
      var settled = false;

      function grant() {
        if (settled) return;
        settled = true;
        followStarting = false;
        coreInstance.setGuideActive(true);
        showToast('月神护佑与全卡片已刻印');
        closeModal();
      }

      function deny() {
        if (settled) return;
        followStarting = false;
        if (mt && typeof mt.getFollowStatus === 'function') {
          try {
            mt.getFollowStatus({
              success: function(res) {
                var st = res && (res.followStatus !== undefined ? res.followStatus : res.status);
                if (st > 0) {
                  grant();
                } else {
                  showToast('关注作者后即可激活月神护佑');
                }
              },
              fail: function() {
                showToast('关注作者后即可激活月神护佑');
              }
            });
            return;
          } catch (_) {}
        }
        // 开发预览环境或无桥接环境直接激活体验
        grant();
      }

      if (!mt || typeof mt.followAuthor !== 'function') {
        deny();
        return;
      }

      try {
        var ret = mt.followAuthor({
          success: function() { grant(); },
          fail: function() { deny(); }
        });
        if (ret && typeof ret.then === 'function') {
          ret.then(function() { grant(); }, function() { deny(); });
        }
      } catch (_) {
        deny();
      }
    }

    if (btnOn) {
      btnOn.addEventListener('click', handleFollow);
      btnOn.addEventListener('touchend', handleFollow);
    }

    if (btnOff) {
      function handleOff(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        coreInstance.setGuideActive(false);
        showToast('已恢复原版机台难度');
        closeModal();
      }
      btnOff.addEventListener('click', handleOff);
      btnOff.addEventListener('touchend', handleOff);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGuideUI);
    } else {
      initGuideUI();
    }
  }

  // 全局挂载内核适配器
  if (typeof window !== 'undefined') {
    window.GGEMU_CORE = coreInstance;
    window.GBA_CORE = coreInstance;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = coreInstance;
  }
})();
