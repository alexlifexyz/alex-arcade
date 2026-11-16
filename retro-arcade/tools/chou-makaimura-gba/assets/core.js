// 32 位掌机动作神作《超魔界村 R》(Super Ghouls 'n Ghosts R) 掌机驱动
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

  // 攻略功能开关：默认关闭（保持原汁原味机台难度）
  var cheatActive = false;

  // 移动端轻触防漏 8 帧缓冲状态机 (Hold Buffer)
  var startHoldFrames = 0;
  var aHoldFrames = 0;
  var selectHoldFrames = 0;
  var bHoldFrames = 0;

  // 1. 初始化掌机按键配置与布局 (两键掌机标准规范：layout: "two-button", stick: false)
  var padConfig = {
    name: '超魔界村 R',
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
    // btn-b: key "B", label "B", color "red"（投掷武器/主攻击）
    // btn-a: key "A", label "A", color "yellow"（跳跃/空中二段跳）
    actions: [
      { id: 'btn-b', key: 'B', label: 'B', color: 'red' },
      { id: 'btn-a', key: 'A', label: 'A', color: 'yellow' }
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
      case 'a': return gba.keypad.A;           // 跳跃/二段跳
      case 'b': return gba.keypad.B;           // 投掷攻击
      case 'l': return gba.keypad.L;           // 左肩键 L
      case 'r': return gba.keypad.R;           // 右肩键 R
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

  // Toast 提示封装
  function showToast(msg) {
    if (typeof document === 'undefined') return;
    var toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(function() {
      toastEl.classList.remove('show');
    }, 2000);
  }

  // 5. 核心驱动对外接口
  var coreInstance = {
    name: '超魔界村 R',
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

      // 读取用户偏好静音设置
      try {
        var savedMute = localStorage.getItem('chou_makaimura_mute') || localStorage.getItem('ggemu_mute');
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

      // 开机秒开穿透：通过精准 START 脉冲穿透 Capcom 标志，0.2 秒直达 100% 全彩大标题
      try {
        for (var f = 0; f < 300; f++) {
          if (f >= 60 && f <= 85) {
            gba.keypad.currentDown &= ~(1 << gba.keypad.START);
          } else {
            gba.keypad.currentDown = 0x03FF;
          }
          gba.step();
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
      } catch (errStep) {
        console.warn('开机预热轻微异常:', errStep);
      }

      if (gba.keypad) {
        gba.keypad.currentDown = 0x03FF;
      }

      console.log('超魔界村 R GBA 引擎初始化成功，准备就绪');
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
        var rom = window.ROM_DATA || window.ROM_BUFFER;
        if (rom) {
          gba.setRom(rom);
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
        // 复位秒开穿透直达全彩标题
        for (var f = 0; f < 300; f++) {
          if (f >= 60 && f <= 85) {
            gba.keypad.currentDown &= ~(1 << gba.keypad.START);
          } else {
            gba.keypad.currentDown = 0x03FF;
          }
          gba.step();
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
        console.log('超魔界村 R 一键复位重启成功');
      } catch (e) {
        console.warn('reset warning:', e);
      }
    },

    tick: function() {
      if (!gba) return;

      // 移动端轻触 8 帧缓冲递减守护 (Hold Buffer)
      if (gba.keypad) {
        if (startHoldFrames > 0) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.START);
          gba.keypad.currentDown &= ~(1 << gba.keypad.A); // 选单确认双保险
          startHoldFrames--;
        }
        if (aHoldFrames > 0) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.A);
          aHoldFrames--;
        }
        if (selectHoldFrames > 0) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.SELECT);
          selectHoldFrames--;
        }
        if (bHoldFrames > 0) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.B);
          bHoldFrames--;
        }
      }

      // 攻略加护机制：身披黄金铠甲与圣光守护
      if (cheatActive && gba.mmu) {
        try {
          // 残机数保持 (0x02005F1C)
          gba.mmu.store8(0x02005F1C, 0x09);
          // 黄金铠甲加护 (0x020214DD = 04, 0x020214BA = 04, 0x020214B2 = 01)
          gba.mmu.store8(0x020214DD, 0x04);
          gba.mmu.store8(0x020214BA, 0x04);
          gba.mmu.store8(0x020214B2, 0x01);
          // 圣光守护 (0x02020463 = 0x66, 0x02020464 = 0xEE)
          gba.mmu.store8(0x02020463, 0x66);
          gba.mmu.store8(0x02020464, 0xEE);
        } catch (_) {}
      }

      var steps = speedMultiplier || 1;
      for (var s = 0; s < steps; s++) {
        gba.step();
      }
    },

    setButton: function(btnId, pressed) {
      activateAudio();

      var norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      var keyIndex = mapButtonToGbaKey(btnId);

      // 处理 8 帧触控防漏缓冲 (Hold Buffer) 与选单确认双保险
      if (pressed) {
        if (norm === 'start') {
          startHoldFrames = 8;
        } else if (norm === 'a') {
          aHoldFrames = 8;
        } else if (norm === 'select') {
          selectHoldFrames = 8;
        } else if (norm === 'b') {
          bHoldFrames = 8;
        }
      }

      if (keyIndex >= 0 && gba && gba.keypad) {
        if (pressed) {
          gba.keypad.currentDown &= ~(1 << keyIndex);
          if (norm === 'start') {
            // 开始键同时注入 A 键确认双保险，杜绝选单按开始无反应
            gba.keypad.currentDown &= ~(1 << gba.keypad.A);
          }
        } else {
          // 松开时若处于缓冲期由 tick() 守护，否则置高电平
          if (norm === 'start' && startHoldFrames > 0) return;
          if (norm === 'a' && aHoldFrames > 0) return;
          if (norm === 'select' && selectHoldFrames > 0) return;
          if (norm === 'b' && bHoldFrames > 0) return;
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
        localStorage.setItem('chou_makaimura_mute', String(isMute));
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

    resumeAudio: function() {
      activateAudio();
    },

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
      return this.exportState();
    },

    loadState: function(compressed) {
      return this.importState(compressed);
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

  // 绑定攻略弹窗交互（符合 AGENTS.md 避坑准则）
  function setupGuide() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('guide-modal');
    var btnOpen = document.getElementById('btn-guide');
    var btnClose = document.getElementById('guide-close');
    var btnOn = document.getElementById('btn-guide-on');
    var btnOff = document.getElementById('btn-guide-off');

    if (!btnOpen || !modal) return;

    function openModal(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      modal.style.display = 'flex';
    }

    btnOpen.addEventListener('click', openModal);
    btnOpen.addEventListener('touchend', openModal);

    function closeModal(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      modal.style.display = 'none';
    }

    if (btnClose) {
      btnClose.addEventListener('click', closeModal);
      btnClose.addEventListener('touchend', closeModal);
    }

    modal.addEventListener('click', function(ev) {
      if (ev.target === modal) closeModal(ev);
    });

    if (btnOff) {
      function handleOff(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        cheatActive = false;
        showToast('已恢复原版机台难度');
        modal.style.display = 'none';
      }
      btnOff.addEventListener('click', handleOff);
      btnOff.addEventListener('touchend', handleOff);
    }

    if (btnOn) {
      var followProcessing = false;
      function onFollow(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        if (followProcessing) return;
        followProcessing = true;

        var mt = window.xhs && window.xhs.miniTool;
        var handled = false;

        function grant() {
          if (handled) return;
          handled = true;
          cheatActive = true;
          showToast('已开启黄金铠甲加护');
          modal.style.display = 'none';
          followProcessing = false;
        }

        function deny() {
          if (handled) return;
          followProcessing = false;
          if (mt && typeof mt.getFollowStatus === 'function') {
            mt.getFollowStatus({
              success: function(res) {
                var st = res && (res.status !== undefined ? res.status : res.followStatus);
                if (st === 1 || st === true) {
                  grant();
                } else {
                  showToast('关注作者后即可获得加护');
                }
              },
              fail: function() {
                showToast('关注作者后即可获得加护');
              }
            });
            return;
          }
          showToast('在小红书中关注作者即可激活加护');
        }

        if (!mt || typeof mt.followAuthor !== 'function') {
          grant(); // 开发预览环境直接激活
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

      btnOn.addEventListener('click', onFollow);
      btnOn.addEventListener('touchend', onFollow);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupGuide);
    } else {
      setupGuide();
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
