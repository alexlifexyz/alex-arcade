// 官方正统 32 位横版跳跃巅峰神作《超级马里奥前进 4：超级马里奥兄弟 3》(Super Mario Advance 4: Super Mario Bros. 3) 掌机驱动
// 遵循 AGENTS.md 规范：红球摇杆 + 钻石四键（跳跃/奔跑/旋跳/狸猫）+ 32768 环形缓冲区音频 + 59s 录屏分流
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;
  var targetRomData = null;

  // 物理按键状态与 8 帧防漏缓冲
  var physicalKeys = {};
  var holdBuffers = {
    start: 0,
    select: 0
  };

  // 1. 初始化掌机按键配置与布局 (严格遵循 diamond 钻石四键规范，GBA 宽屏紧凑自适应，中文胶囊键)
  var padConfig = {
    name: '超级马里奥3Advance',
    layout: 'diamond',
    stick: true,
    layoutConfig: {
      screenInset: 22,
      bezelInset: 10,
      bezelAbove: 72,
      band: 48,
      topPad: 14
    },
    actions: [
      { id: 'btn-b', key: 'B', label: '跳跃', sub: '起跳', color: 'yellow' },
      { id: 'btn-a', key: 'A', label: '奔跑', sub: '加速', color: 'red' },
      { id: 'btn-x', key: 'X', label: '旋跳', sub: '大跳', color: 'green' },
      { id: 'btn-y', key: 'Y', label: '狸猫', sub: '滑翔', color: 'blue' }
    ],
    capsules: [
      { id: 'btn-select', label: '选择' },
      { id: 'btn-start', label: '开始' }
    ]
  };

  // 2. 键位映射表 (映射至 GBA 硬件键位索引)
  function mapButtonToGbaKey(btnId) {
    if (!gba || !gba.keypad) return -1;
    var norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
    switch (norm) {
      case 'up': return gba.keypad.UP;
      case 'down': return gba.keypad.DOWN;
      case 'left': return gba.keypad.LEFT;
      case 'right': return gba.keypad.RIGHT;
      case 'b': return gba.keypad.A;       // 正下方 B 键 -> 普通跳跃 (GBA 原生 A 键)
      case 'a': return gba.keypad.B;       // 正右方 A 键 -> 奔跑/吃怪/拿物 (GBA 原生 B 键)
      case 'x': return gba.keypad.R;       // 正上方 X 键 -> 旋跳/特殊 (GBA 原生 R 键)
      case 'y': return gba.keypad.B;       // 正左方 Y 键 -> 狸猫摇尾巴/飞天滑翔 (GBA 原生 B 键)
      case 'start': return gba.keypad.START;
      case 'select': return gba.keypad.SELECT;
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
    name: '超级马里奥3Advance',
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
        var savedMute = localStorage.getItem('mario_advance4_gba_mute') || localStorage.getItem('ggemu_mute');
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

      targetRomData = targetRom;
      var ok = gba.setRom(targetRom);
      if (!ok) {
        console.error('GBA 引擎载入 ROM 失败');
        if (hostCallbacks && hostCallbacks.toast) {
          hostCallbacks.toast('ROM 校验失败');
        }
        return;
      }

      // 开机预热：直达开场全彩准备就绪状态
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

      console.log('超级马里奥前进 4 模拟引擎初始化成功，准备就绪');
      coreInstance._gba = gba;
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
      console.log('执行超级马里奥前进 4 内存复位');
      try {
        var rom = targetRomData || window.ROM_BUFFER || window.ROM_DATA;
        if (rom) {
          gba.setRom(rom);
        }
        if (gba.keypad) {
          gba.keypad.currentDown = 0x03FF;
        }
        holdBuffers.start = 0;
        holdBuffers.select = 0;
        physicalKeys = {};
        if (gba.audio && !isMute) {
          gba.audio.writeEnable(1);
        }
        for (var f = 0; f < 120; f++) {
          gba.step();
        }
        console.log('超级马里奥前进 4 复位成功，重新就绪');
      } catch (e) {
        console.error('复位失败:', e);
      }
    },

    // 逐帧步进渲染循环
    tick: function() {
      if (!gba) return;
      try {
        // 处理功能键 8 帧防漏缓冲
        if (holdBuffers.start > 0) {
          holdBuffers.start--;
          if (holdBuffers.start === 0 && !physicalKeys['start']) {
            if (gba.keypad) gba.keypad.currentDown |= (1 << gba.keypad.START);
          }
        }
        if (holdBuffers.select > 0) {
          holdBuffers.select--;
          if (holdBuffers.select === 0 && !physicalKeys['select']) {
            if (gba.keypad) gba.keypad.currentDown |= (1 << gba.keypad.SELECT);
          }
        }

        // 多倍速推进
        var steps = Math.max(1, Math.min(speedMultiplier, 3));
        for (var s = 0; s < steps; s++) {
          gba.step();
        }
      } catch (err) {
        // 容错防 crash
      }
    },

    // 掌机外壳按键核心契约 setButton(btnId, isPressed)
    setButton: function(btnId, pressed) {
      activateAudio();
      var norm = String(btnId || "").toLowerCase().replace(/^btn-/, "");
      physicalKeys[norm] = !!pressed;

      if (norm === 'start') {
        if (pressed) {
          holdBuffers.start = 8;
          if (gba && gba.keypad) gba.keypad.currentDown &= ~(1 << gba.keypad.START);
        } else if (holdBuffers.start <= 0) {
          if (gba && gba.keypad) gba.keypad.currentDown |= (1 << gba.keypad.START);
        }
        return;
      }

      if (norm === 'select') {
        if (pressed) {
          holdBuffers.select = 8;
          if (gba && gba.keypad) gba.keypad.currentDown &= ~(1 << gba.keypad.SELECT);
        } else if (holdBuffers.select <= 0) {
          if (gba && gba.keypad) gba.keypad.currentDown |= (1 << gba.keypad.SELECT);
        }
        return;
      }

      var keyIdx = mapButtonToGbaKey(btnId);
      if (keyIdx >= 0 && gba && gba.keypad) {
        // GBA KEYINPUT 寄存器为 Active-Low (0 代表按下，1 代表松开)
        if (pressed) {
          gba.keypad.currentDown &= ~(1 << keyIdx);
        } else {
          gba.keypad.currentDown |= (1 << keyIdx);
        }
      }
    },

    // 兼容按键事件响应
    buttonDown: function(btnId) {
      coreInstance.setButton(btnId, true);
    },

    buttonUp: function(btnId) {
      coreInstance.setButton(btnId, false);
    },

    setSpeed: function(mul) {
      speedMultiplier = mul || 1;
    },

    setSpeedMultiplier: function(mul) {
      speedMultiplier = mul || 1;
    },

    isMuted: function() {
      return isMute;
    },

    setMuted: function(mute) {
      coreInstance.setMute(mute);
    },

    setMute: function(mute) {
      isMute = !!mute;
      try {
        localStorage.setItem('mario_advance4_gba_mute', isMute ? 'true' : 'false');
        localStorage.setItem('ggemu_mute', isMute ? 'true' : 'false');
      } catch (e) {}
      if (gba && gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }
      if (!isMute) {
        activateAudio();
      }
    },

    exportState: function() {
      if (!gba) return null;
      try {
        var rawState = gba.freeze();
        var jsonStr = JSON.stringify(rawState);
        if (typeof window.LZString !== 'undefined') {
          return window.LZString.compressToUTF16(jsonStr);
        }
        return jsonStr;
      } catch (e) {
        console.error('存档导出失败:', e);
        return null;
      }
    },

    importState: function(compressed) {
      if (!gba || !compressed) return false;
      try {
        var jsonStr = compressed;
        if (typeof window.LZString !== 'undefined') {
          var decomp = window.LZString.decompressFromUTF16(compressed);
          if (decomp) jsonStr = decomp;
        }
        var rawState = JSON.parse(jsonStr);
        gba.defrost(rawState);
        if (gba.audio && !isMute) {
          gba.audio.writeEnable(1);
        }
        return true;
      } catch (e) {
        console.error('存档读入失败:', e);
        return false;
      }
    },

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (!gba || !gba.audio) return null;

      if (!destNode && typeof AudioContext !== "undefined" && gba.audio.context) {
        if (!recAudioDest) {
          recAudioDest = gba.audio.context.createMediaStreamDestination();
        }
        destNode = recAudioDest;
      }

      if (gba.audio.connectRecordingAudio && destNode) {
        gba.audio.connectRecordingAudio(destNode);
      }

      if (destNode && destNode.stream) {
        var tracks = destNode.stream.getAudioTracks();
        if (tracks && tracks.length > 0) {
          return tracks[0];
        }
      }
      return null;
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,
    audioDiag: function() {
      return {
        isMute: isMute,
        hasGba: !!gba,
        hasAudio: !!(gba && gba.audio),
        ctxState: (gba && gba.audio && gba.audio.context) ? gba.audio.context.state : "none",
        enabled: (gba && gba.audio) ? gba.audio.enabled : false
      };
    }
  };

  window.GGEMU_CORE = coreInstance;
})();
