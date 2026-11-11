// 经典格斗正统神作《拳皇 EX2：咆哮之血》(The King of Fighters EX2) 核心控制台逻辑
// 遵循 AGENTS.md 掌机规范：红球摇杆 + 四键钻石布局 + 双向可逆特权金手指 + 59s 立体声录屏分流
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var isVipActive = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var audioActivated = false;
  var hostCallbacks = null;

  var hasSkippedTitleWhiteFlash = false;

  // 1. 初始化掌机按键配置与布局 (严格遵循 diamond 钻石四键规范，放大屏幕可视面积，胶囊键使用中文)
  var padConfig = {
    name: '拳皇EX2：咆哮之血',
    layout: 'diamond',
    stick: true,
    layoutConfig: {
      screenInset: 12,
      bezelInset: 6,
      bezelAbove: 48,
      band: 26,
      topPad: 6
    },
    actions: [
      { id: 'btn-b', key: 'B', label: 'B', sub: '轻拳', color: 'red' },
      { id: 'btn-a', key: 'A', label: 'A', sub: '轻脚', color: 'yellow' },
      { id: 'btn-y', key: 'Y', label: 'L', sub: '重拳', color: 'blue' },
      { id: 'btn-x', key: 'X', label: 'R', sub: '重脚', color: 'green' }
    ],
    shoulders: [
      { id: 'btn-l', label: 'L 援护' },
      { id: 'btn-r', label: 'R 闪避' }
    ],
    capsules: [
      { id: 'btn-select', label: '选择' },
      { id: 'btn-start', label: '开始' }
    ]
  };

  // 2. 键位映射表 (映射至 gbajs 内部键位索引，双向兼容英文与中文标识)
  function mapButtonToGbaKey(btnId) {
    if (!gba || !gba.keypad) return -1;
    switch (btnId) {
      case 'up': return gba.keypad.UP;
      case 'down': return gba.keypad.DOWN;
      case 'left': return gba.keypad.LEFT;
      case 'right': return gba.keypad.RIGHT;
      case 'btn-a': return gba.keypad.A;
      case 'btn-b': return gba.keypad.B;
      case 'btn-y':
      case 'btn-l': return gba.keypad.L;
      case 'btn-x':
      case 'btn-r': return gba.keypad.R;
      case 'btn-start':
      case 'start': return gba.keypad.START;
      case 'btn-select':
      case 'select': return gba.keypad.SELECT;
      default: return -1;
    }
  }

  // 3. 音频手势激活与录屏流分流
  var audioPrimes = 0;
  function activateAudio() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch (_) {}

    if (window.xhs && window.xhs.miniTool) {
      try {
        if (typeof window.xhs.miniTool.enableAudio === "function") {
          window.xhs.miniTool.enableAudio();
        }
      } catch (_) {}
    }

    if (!gba || !gba.audio) return;
    var ctx = gba.audio.context;

    // 只要不是 running 状态 (包括 suspended 和 interrupted)，全部强制 resume
    if (ctx && ctx.state !== "running") {
      ctx.resume().catch(function() {});
    }

    // 确保 GBA 音频节点始终连接到声卡 destination
    if (ctx && gba.audio.jsAudio) {
      try {
        gba.audio.jsAudio.connect(ctx.destination);
      } catch (_) {}
    }

    // 确保 GBA 内部音频引擎始终处于开启状态
    if (gba.audio && !gba.audio.enabled) {
      gba.audio.writeEnable(1);
    }

    // 播放 1 个采样的静音 BufferSource，强制激活移动端底层硬件通电
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

  // 4. 特权金手指注入 (双向可逆实时生效)
  function applyCheats() {
    if (!isVipActive || !gba || !gba.mmu) return;
    try {
      // 1P 锁血常驻满格 (102 = 0x66)
      gba.mmu.store8(0x0200A818, 0x66);
      // 1P 满超必杀能量槽 (随时释放大蛇薙/八稚女)
      gba.mmu.store16(0x0200A7C8, 0x9000);
      gba.mmu.store16(0x0200A830, 0x9000);
      // 1P 援护次数锁定 5 次
      gba.mmu.store8(0x0200A8D7, 0x05);
    } catch (e) {
      // 内存未分配时静默忽略
    }
  }

  // 5. 核心对外导出对象与控制接口
  var coreInstance = {
    name: '拳皇EX2：咆哮之血',
    pad: padConfig,

    video: function() {
      return { w: 240, h: 160 };
    },

    source: function() {
      return canvas;
    },

    boot: function(romData, host) {
      hostCallbacks = host || {};

      // 准备画布
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

      // 读取用户偏好静音设置
      try {
        var savedMute = localStorage.getItem('kof_gba_mute');
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

      // 如果传进来的是 Base64 字符串，解码为 Uint8Array
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

      // 极速冷启动：优先加载全彩标题画面快照 (30ms 秒开，直达全彩标题画面，杜绝开机黑白屏死等)
      var snapshotApplied = false;
      if (window.BOOT_SNAPSHOT) {
        try {
          snapshotApplied = coreInstance.loadState(window.BOOT_SNAPSHOT);
          if (snapshotApplied) {
            // 彻底唤醒快照后的 GBA 音频引擎与寄存器映射
            if (gba.audio) {
              gba.audio.writeEnable(1);
              if (gba.mmu) {
                var soundCntLo = gba.mmu.load16(0x04000080);
                var soundCntHi = gba.mmu.load16(0x04000082);
                gba.audio.writeSoundControlLo(soundCntLo);
                gba.audio.writeSoundControlHi(soundCntHi);
              }
            }
            // 确保按键初始化为全部未按下状态 (Active-Low: 0x03FF)
            if (gba.keypad) {
              gba.keypad.currentDown = 0x03FF;
            }
            gba.step();
            console.log('拳皇 EX2 标题画面快照极速恢复并激活立体声音效就绪 (30ms 瞬开)');
          }
        } catch (snapErr) {
          console.warn('快照恢复跳过，走硬件步进:', snapErr);
        }
      }

      if (!snapshotApplied) {
        try {
          for (var f = 0; f < 140; f++) {
            gba.step();
          }
        } catch (errStep) {
          console.warn('开机预热轻微异常:', errStep);
        }
      }

      console.log('拳皇 EX2 模拟引擎初始化成功，准备就绪');
      if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
        hostCallbacks.onReady();
      }
    },

    // 兼容 init 调用
    init: function(gameCanvas) {
      if (gameCanvas) canvas = gameCanvas;
      coreInstance.boot(window.ROM_DATA || window.ROM_BUFFER, {
        onReady: function() {
          // 独立运行时的自循环帧驱动
          if (animFrameId) cancelAnimationFrame(animFrameId);
          function loop() {
            coreInstance.tick();
            animFrameId = requestAnimationFrame(loop);
          }
          animFrameId = requestAnimationFrame(loop);
        }
      });
    },

    // 帧步进接口 (由 shell.js 的 Ae() 循环每帧调用)
    tick: function() {
      if (!gba) return;
      var steps = speedMultiplier || 1;
      for (var s = 0; s < steps; s++) {
        applyCheats();
        gba.step();
      }
    },

    setButton: function(btnId, pressed) {
      activateAudio();

      // 核心体验防白屏穿透：首次在标题画面按下【开始】(START) 键时，卡带原版会产生 340 帧纯白淡出闪烁
      // 若在移动端低帧率下运行，会导致用户白屏死等 8-10 秒并误判死机；
      // 此处检测到首次按 START 瞬间，注入 16 帧确认脉冲，并在后台瞬间无渲染步进 40 帧进入主模式菜单，
      // 首屏在 35ms 内极速直出全彩主模式菜单（TEAM PLAY / SINGLE PLAY / PRACTICE），彻底告别白屏！
      if ((btnId === 'btn-start' || btnId === 'start') && pressed && !hasSkippedTitleWhiteFlash) {
        hasSkippedTitleWhiteFlash = true;
        if (gba && gba.keypad) {
          gba.keypad.currentDown &= ~(1 << gba.keypad.START); // 低电平有效：置 0 为按下！
          for (var k = 0; k < 16; k++) {
            gba.step();
          }
          gba.keypad.currentDown |= (1 << gba.keypad.START);  // 置 1 为松开！
          for (var w = 0; w < 40; w++) {
            gba.step();
          }
        }
        return;
      }

      var keyIndex = mapButtonToGbaKey(btnId);
      if (keyIndex >= 0 && gba && gba.keypad) {
        // GBA 硬件 KEYINPUT 规范：低电平有效 (Active-Low)
        // 0 代表按下 (pressed === true)，1 代表松开 (pressed === false)
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

    setMuted: function(mute) {
      coreInstance.setMute(mute);
    },

    setMute: function(mute) {
      isMute = !!mute;
      try {
        localStorage.setItem('kof_gba_mute', String(isMute));
      } catch (e) {}
      if (gba && gba.audio && gba.audio.setMute) {
        gba.audio.setMute(isMute);
      }
    },

    isMuted: function() {
      return isMute;
    },

    setVipActive: function(active) {
      isVipActive = !!active;
      console.log('特权金手指已切换为:', isVipActive ? '开启 (锁血满气)' : '关闭 (正常挑战)');
    },

    isVipActive: function() {
      return isVipActive;
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
        sys: 'kof-gba',
        t: Date.now(),
        state: coreInstance.saveState()
      });
    },

    importState: function(stateStr) {
      if (!gba) throw new Error('游戏未运行');
      var obj = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
      if (obj.sys !== 'kof-gba' || !obj.state) {
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
        if (window.LZString && window.LZString.compressToBase64) {
          return window.LZString.compressToBase64(jsonStr);
        }
        if (window.LZString && window.LZString.compressToUTF16) {
          return window.LZString.compressToUTF16(jsonStr);
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
        if (window.LZString && window.LZString.decompressFromBase64) {
          var decompB64 = window.LZString.decompressFromBase64(compressed);
          if (decompB64) jsonStr = decompB64;
        } else if (window.LZString && window.LZString.decompressFromUTF16) {
          var decomp = window.LZString.decompressFromUTF16(compressed);
          if (decomp) jsonStr = decomp;
        }
        var state = JSON.parse(jsonStr);
        gba.defrost(state);
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

  // 全局挂载内核适配器 (同时满足 GGEMU 外壳与 GBA 原生别名)
  window.GGEMU_CORE = coreInstance;
  window.GBA_CORE = coreInstance;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = coreInstance;
  }
})();
