// SNK 官方正统掌机巅峰续作《合金弹头：第二任务》(mslug2nd-ngpc) 掌机驱动内核
// 严格遵循规范：红球摇杆 + 钻石四键 + 32768 环形缓冲区音频 + 59s 立体声录屏音轨 + 双层底栏解耦
(function() {
  'use strict';

  var NGPC_W = 160;
  var NGPC_H = 152;

  var mod = null;
  var screenCanvas = null;
  var screenCtx = null;
  var isBooted = false;
  var isMute = false;
  var speedMultiplier = 1;
  var hostCallbacks = null;

  var baseSnapshot = null;
  var romPtr = 0;
  var romLen = 0;

  // 1. 掌机按键定义与视口边距规范 (diamond 红球摇杆掌机 + 52px 视口安全带)
  // 下开火、左跳跃、上手雷、右连发
  var padConfig = {
    name: '合金弹头：第二任务',
    layout: 'diamond',
    stick: true,
    layoutConfig: {
      screenInset: 14,
      bezelInset: 6,
      bezelAbove: 72,
      band: 52,        // 充足的 52px 高度，保证横屏/配色按钮居中且上下各有 15px 安全间隙
      topPad: 12
    },
    actions: [
      { id: 'btn-fire', key: 'B', label: '开火', sub: '射击', color: 'red' },
      { id: 'btn-jump', key: 'Y', label: '跳跃', sub: '起跳', color: 'yellow' },
      { id: 'btn-bomb', key: 'X', label: '手雷', sub: '战术', color: 'green' },
      { id: 'btn-rapid', key: 'A', label: '连发', sub: '连射', color: 'blue' }
    ],
    capsules: [
      { id: 'btn-option', label: '选项', key: 'Option' },
      { id: 'btn-start', label: '开始', key: 'Start' }
    ]
  };

  // 2. 按键状态与硬件位映射
  // NGPC 硬件按键位映射：
  // bit 0 (1 << 0 = 0x01): 跳跃 (实机卡带跳跃键，B 键)
  // bit 3 (1 << 3 = 0x08): Option 键 (战术手雷/暂停/选项)
  // bit 4 (1 << 4 = 0x10): 上 (UP)
  // bit 5 (1 << 5 = 0x20): 下 (DOWN)
  // bit 6 (1 << 6 = 0x40): 左 (LEFT)
  // bit 7 (1 << 7 = 0x80): 右 (RIGHT)
  // bit 8 (1 << 8 = 0x100): 开火/射击 (实机卡带开火键，A 键)
  var BIT_JUMP = 0;
  var BIT_OPTION = 3;
  var BIT_UP = 4;
  var BIT_DOWN = 5;
  var BIT_LEFT = 6;
  var BIT_RIGHT = 7;
  var BIT_FIRE = 8;

  var keyState = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
    fire: false,
    bomb: false,
    option: false,
    rapid: false
  };

  var turboTick = 0;
  var optionPulseTimer = null;
  var bombPulseTimer = null;

  function triggerOptionPulse(durationMs) {
    if (optionPulseTimer) clearTimeout(optionPulseTimer);
    keyState.option = true;
    updateInputMask();
    optionPulseTimer = setTimeout(function() {
      keyState.option = false;
      updateInputMask();
      optionPulseTimer = null;
    }, durationMs || 120);
  }

  function triggerBombPulse() {
    if (bombPulseTimer) clearTimeout(bombPulseTimer);
    keyState.bomb = true;
    updateInputMask();
    bombPulseTimer = setTimeout(function() {
      keyState.bomb = false;
      updateInputMask();
      bombPulseTimer = null;
    }, 80);
  }

  function updateInputMask() {
    if (!mod || typeof mod._set_input !== 'function') return;
    var mask = 0;
    if (keyState.jump) mask |= (1 << BIT_JUMP);
    if (keyState.option) mask |= (1 << BIT_OPTION);
    if (keyState.up) mask |= (1 << BIT_UP);
    if (keyState.down) mask |= (1 << BIT_DOWN);
    if (keyState.left) mask |= (1 << BIT_LEFT);
    if (keyState.right) mask |= (1 << BIT_RIGHT);

    // 2 代战术手雷：Option 投掷手雷
    if (keyState.bomb) {
      mask |= (1 << BIT_OPTION);
    }

    // 开火或连射宏
    var fireActive = keyState.fire;
    if (keyState.rapid) {
      turboTick++;
      if ((turboTick % 4) < 2) {
        fireActive = true;
      }
    }
    if (fireActive) mask |= (1 << BIT_FIRE);

    mod._set_input(mask);
  }

  // 3. Web Audio 32768 环形缓冲区音频架构与录屏分流
  var AUDIO_BUF_SIZE = 32768;
  var sampleBufL = new Float32Array(AUDIO_BUF_SIZE);
  var sampleBufR = new Float32Array(AUDIO_BUF_SIZE);
  var audioWritePtr = 0;
  var audioReadPtr = 0;
  var audioCtx = null;
  var audioScriptNode = null;
  var audioPrimes = 0;
  var audioCallbacks = 0;
  var recAudioDest = null;

  try {
    var savedMute = localStorage.getItem('mslug2nd_mute') || localStorage.getItem('ggemu_mute');
    if (savedMute !== null) {
      isMute = (savedMute === 'true');
    }
  } catch (_) {}

  function audioAvailable() {
    return (audioWritePtr - Math.floor(audioReadPtr) + AUDIO_BUF_SIZE) % AUDIO_BUF_SIZE;
  }

  function onAudioProcess(e) {
    audioCallbacks++;
    var outL = e.outputBuffer.getChannelData(0);
    var outR = e.outputBuffer.getChannelData(1);

    if (isMute) {
      for (var i = 0; i < outL.length; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return;
    }

    var ratio = 44100 / (audioCtx ? audioCtx.sampleRate : 44100);

    for (var j = 0; j < outL.length; j++) {
      if (audioAvailable() < 2) {
        outL[j] = 0;
        outR[j] = 0;
        continue;
      }
      var r = Math.floor(audioReadPtr);
      var frac = audioReadPtr - r;
      var nextR = (r + 1) & (AUDIO_BUF_SIZE - 1);
      outL[j] = sampleBufL[r] + (sampleBufL[nextR] - sampleBufL[r]) * frac;
      outR[j] = sampleBufR[r] + (sampleBufR[nextR] - sampleBufR[r]) * frac;
      audioReadPtr += ratio;
      if (audioReadPtr >= AUDIO_BUF_SIZE) {
        audioReadPtr -= AUDIO_BUF_SIZE;
      }
    }
  }

  function ensureAudioNodes() {
    if (!audioCtx) return;
    if (!audioScriptNode && typeof audioCtx.createScriptProcessor === 'function') {
      try {
        audioScriptNode = audioCtx.createScriptProcessor(2048, 0, 2);
        audioScriptNode.onaudioprocess = onAudioProcess;
        audioScriptNode.connect(audioCtx.destination);
        if (recAudioDest) {
          try { audioScriptNode.connect(recAudioDest); } catch (_) {}
        }
        audioReadPtr = audioWritePtr;
      } catch (e) {
        console.warn('createScriptProcessor 失败:', e);
      }
    }
  }

  function initAudioContext() {
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {}

    if (audioCtx && audioCtx.state === 'closed') {
      audioCtx = null;
      audioScriptNode = null;
    }
    if (!audioCtx && typeof window !== 'undefined') {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        try {
          audioCtx = new AC();
        } catch (_) {}
      }
    }

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(function() {
        ensureAudioNodes();
      }).catch(function() {});
    }

    // 播放 1 个采样的静音 BufferSource，强制唤醒底层移动端 DAC 硬件通电
    if (audioCtx && audioPrimes < 5) {
      audioPrimes++;
      try {
        var dummy = audioCtx.createBufferSource();
        dummy.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        dummy.connect(audioCtx.destination);
        dummy.start(0);
      } catch (_) {}
    }

    ensureAudioNodes();
  }

  function activateAudio() {
    if (isMute) return;
    try {
      if (typeof window !== 'undefined' && window.xhs && window.xhs.miniTool && typeof window.xhs.miniTool.enableAudio === 'function') {
        window.xhs.miniTool.enableAudio();
      }
      initAudioContext();
    } catch (_) {}
  }

  // 绑定全手势捕获破冰
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    ['touchstart', 'touchend', 'touchmove', 'click', 'keydown', 'mousedown'].forEach(function(evt) {
      document.addEventListener(evt, function() {
        activateAudio();
      }, { capture: true, passive: true });
    });
  }

  // 引擎声音采样推入回调
  function onAudioPush(ptr, frames) {
    if (!mod || !mod.HEAPU8 || frames <= 0) return;
    var i16 = new Int16Array(mod.HEAPU8.buffer, ptr, frames * 2);
    for (var i = 0; i < frames; i++) {
      sampleBufL[audioWritePtr] = i16[i * 2] / 32768.0;
      sampleBufR[audioWritePtr] = i16[i * 2 + 1] / 32768.0;
      audioWritePtr = (audioWritePtr + 1) & (AUDIO_BUF_SIZE - 1);
    }
  }

  function showToast(msg) {
    if (typeof document === 'undefined') return;
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function() {
      t.classList.remove('show');
    }, 2000);
  }

  // 4. 核心驱动对外接口
  var coreInstance = {
    name: '合金弹头：第二任务',
    pad: padConfig,

    video: function() {
      return { w: NGPC_W, h: NGPC_H };
    },

    source: function() {
      if (mod && mod._off) return mod._off;
      if (screenCanvas) return screenCanvas;
      if (typeof document !== 'undefined') {
        return document.getElementById('screen');
      }
      return null;
    },

    boot: function(romData, host) {
      hostCallbacks = host || {};
      if (isBooted && mod) {
        if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
          hostCallbacks.onReady();
        }
        return;
      }

      if (typeof document !== 'undefined') {
        screenCanvas = document.getElementById('screen');
        if (!screenCanvas) {
          screenCanvas = document.createElement('canvas');
          screenCanvas.id = 'screen';
          screenCanvas.width = NGPC_W;
          screenCanvas.height = NGPC_H;
        }
        screenCtx = screenCanvas.getContext('2d');
      }

      var rawRom = null;
      if (romData instanceof ArrayBuffer) {
        rawRom = new Uint8Array(romData);
      } else if (romData instanceof Uint8Array) {
        rawRom = romData;
      } else if (typeof window !== 'undefined' && window.ROM_BUFFER) {
        rawRom = new Uint8Array(window.ROM_BUFFER);
      } else if (typeof window !== 'undefined' && window.ROM_DATA) {
        rawRom = new Uint8Array(window.ROM_DATA);
      }

      if (!rawRom || rawRom.length < 1000) {
        console.error('ROM 数据缺失或未就绪');
        return;
      }

      activateAudio();

      var createModuleFn = (typeof window !== 'undefined' && window.createNgpcModule)
        ? window.createNgpcModule
        : (typeof global !== 'undefined' && global.createNgpcModule ? global.createNgpcModule : null);

      if (typeof createModuleFn !== 'function') {
        console.error('createNgpcModule 未定义，无法启动 NGPC 引擎');
        return;
      }

      var moduleConfig = {
        canvas: screenCanvas,
        noInitialRun: true,
        audioPush: onAudioPush,
        onRuntimeInitialized: function() {
          try {
            mod._main(0, 0);
          } catch (e) {
            console.warn('_main 初始化提示:', e);
          }

          romLen = rawRom.length;
          romPtr = mod._malloc(romLen);
          mod.HEAPU8.set(rawRom, romPtr);
          var loadRes = mod._load_rom(romPtr, romLen);
          console.log('NGPC 卡带载入状态:', loadRes);

          // 记录初始快照用于极速复位与增量存档
          baseSnapshot = new Uint8Array(mod.HEAPU8.slice(0, romPtr));
          isBooted = true;

          // 绝不调用 pauseMainLoop()，让 WASM 内部 requestAnimationFrame 满速流畅驱动

          // 开机秒开穿透机制（遵循 pitfalls.md 规则 8）：
          // Option + Fire 双键快速步进穿透版权画面与开场故事，首屏极速直出全彩主标题画面
          var pulseCount = 0;
          var pulseTimer = setInterval(function() {
            pulseCount++;
            if (pulseCount % 2 === 1) {
              keyState.fire = true;
              keyState.option = true;
            } else {
              keyState.fire = false;
              keyState.option = false;
            }
            updateInputMask();
            if (pulseCount >= 12) {
              clearInterval(pulseTimer);
              keyState.fire = false;
              keyState.option = false;
              updateInputMask();
            }
          }, 150);

          if (hostCallbacks && typeof hostCallbacks.onReady === 'function') {
            hostCallbacks.onReady();
          }
        }
      };

      mod = createModuleFn(moduleConfig);
      if (typeof window !== 'undefined') {
        window.__mod = mod;
      }
    },

    setButton: function(btnId, pressed) {
      if (!btnId) return;
      var norm = String(btnId).toLowerCase().replace(/^btn-/, '');
      var isDown = !!pressed;

      switch (norm) {
        // 摇杆方向
        case 'up':
          keyState.up = isDown;
          break;
        case 'down':
          keyState.down = isDown;
          break;
        case 'left':
          keyState.left = isDown;
          break;
        case 'right':
          keyState.right = isDown;
          break;

        // 下键：开火 (对应 bit 8，在标题/菜单阶段点开火同时注入开始脉冲)
        case 'fire':
        case 'b':
          keyState.fire = isDown;
          if (isDown) {
            triggerOptionPulse(120);
          }
          break;

        // 左键：跳跃 (对应 bit 0)
        case 'jump':
        case 'y':
          keyState.jump = isDown;
          break;

        // 上键：战术手雷 (采用 80ms 脉冲防漏防长按暂停)
        case 'bomb':
        case 'x':
        case 'grenade':
          if (isDown) {
            triggerBombPulse();
          }
          break;

        // 右键：连射宏
        case 'rapid':
        case 'a':
        case 'turbo':
          keyState.rapid = isDown;
          break;

        // 胶囊键：选项/暂停/开始 (施加 140ms 防漏缓冲)
        case 'option':
        case 'start':
        case 'select':
          if (isDown) {
            triggerOptionPulse(140);
          }
          break;

        default:
          break;
      }

      updateInputMask();
    },

    tick: function(dt) {
      if (!isBooted || !mod) return;
      updateInputMask();
      if (speedMultiplier > 1 && typeof mod.stepFrame === 'function') {
        for (var s = 1; s < speedMultiplier; s++) {
          mod.stepFrame();
        }
      }
    },

    setSpeedMultiplier: function(mult) {
      speedMultiplier = Math.max(1, Math.min(mult || 1, 3));
      showToast(speedMultiplier > 1 ? ('已开启 ' + speedMultiplier + '× 极速模式') : '已恢复 1× 原生速度');
    },

    setSpeed: function(mult) {
      coreInstance.setSpeedMultiplier(mult);
    },

    setMute: function(mute) {
      isMute = !!mute;
      try {
        localStorage.setItem('mslug2nd_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (_) {}
      if (isMute) {
        audioReadPtr = audioWritePtr;
      }
      // 严格遵照指示：开机静默就绪，不要弹任何“游戏声音已开启”干扰用户！
    },

    setMuted: function(mute) {
      coreInstance.setMute(mute);
    },

    isMuted: function() {
      return isMute;
    },

    reset: function() {
      if (!mod || !baseSnapshot || !isBooted) return;
      try {
        mod.HEAPU8.set(baseSnapshot, 0);
        keyState.up = false;
        keyState.down = false;
        keyState.left = false;
        keyState.right = false;
        keyState.jump = false;
        keyState.fire = false;
        keyState.bomb = false;
        keyState.option = false;
        keyState.rapid = false;
        updateInputMask();

        // 重启开机穿透脉冲
        var pCount = 0;
        var pTimer = setInterval(function() {
          pCount++;
          if (pCount % 2 === 1) {
            keyState.option = true;
            keyState.fire = true;
          } else {
            keyState.option = false;
            keyState.fire = false;
          }
          updateInputMask();
          if (pCount >= 12) {
            clearInterval(pTimer);
            keyState.option = false;
            keyState.fire = false;
            updateInputMask();
          }
        }, 150);

        activateAudio();
        showToast('已复位到开机初始状态');
      } catch (e) {
        console.error('复位异常:', e);
      }
    },

    exportState: function() {
      if (!mod || !mod.HEAPU8 || !baseSnapshot) return null;
      try {
        var cur = mod.HEAPU8.subarray(0, romPtr);
        var blockSize = 1024;
        var numBlocks = Math.ceil(romPtr / blockSize);
        var diffBlocks = [];

        for (var b = 0; b < numBlocks; b++) {
          var start = b * blockSize;
          var end = Math.min(start + blockSize, romPtr);
          var isDiff = false;
          for (var i = start; i < end; i++) {
            if (cur[i] !== baseSnapshot[i]) {
              isDiff = true;
              break;
            }
          }
          if (isDiff) {
            var chunk = cur.subarray(start, end);
            var binStr = '';
            for (var c = 0; c < chunk.length; c++) {
              binStr += String.fromCharCode(chunk[c]);
            }
            diffBlocks.push({ idx: b, data: btoa(binStr) });
          }
        }

        var payload = {
          magic: 'MSLUG2ND_DIFF_V1',
          time: Date.now(),
          romLen: romLen,
          blocks: diffBlocks
        };

        var rawStr = JSON.stringify(payload);
        if (typeof window !== 'undefined' && window.LZString && typeof window.LZString.compressToBase64 === 'function') {
          return window.LZString.compressToBase64(rawStr);
        }
        return btoa(rawStr);
      } catch (e) {
        console.error('exportState 失败:', e);
        return null;
      }
    },

    importState: function(stateStr) {
      if (!mod || !mod.HEAPU8 || !baseSnapshot || !stateStr) return false;
      try {
        var rawStr = null;
        if (typeof window !== 'undefined' && window.LZString && typeof window.LZString.decompressFromBase64 === 'function') {
          rawStr = window.LZString.decompressFromBase64(stateStr);
        }
        if (!rawStr) {
          rawStr = atob(stateStr);
        }
        var payload = JSON.parse(rawStr);
        if (!payload || payload.magic !== 'MSLUG2ND_DIFF_V1' || !Array.isArray(payload.blocks)) {
          return false;
        }

        // 先恢复纯净基准快照
        mod.HEAPU8.set(baseSnapshot, 0);

        // 应用差异块
        var blockSize = 1024;
        for (var i = 0; i < payload.blocks.length; i++) {
          var blk = payload.blocks[i];
          var binStr = atob(blk.data);
          var offset = blk.idx * blockSize;
          for (var j = 0; j < binStr.length; j++) {
            mod.HEAPU8[offset + j] = binStr.charCodeAt(j);
          }
        }

        activateAudio();
        showToast('读档成功');
        return true;
      } catch (e) {
        console.error('importState 失败:', e);
        return false;
      }
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    connectRecordingAudio: function() {
      activateAudio();
      try {
        if (!audioCtx) initAudioContext();
        if (audioCtx) {
          if (!recAudioDest && typeof audioCtx.createMediaStreamDestination === 'function') {
            recAudioDest = audioCtx.createMediaStreamDestination();
            if (audioScriptNode) {
              try { audioScriptNode.connect(recAudioDest); } catch (_) {}
            }
          }
          if (recAudioDest && recAudioDest.stream) {
            var tracks = recAudioDest.stream.getAudioTracks();
            if (tracks && tracks.length > 0) {
              return tracks[0];
            }
          }
        }
      } catch (e) {
        console.warn('connectRecordingAudio 失败:', e);
      }
      return null;
    },

    audioDiag: function() {
      return {
        '声道采样写入': audioWritePtr,
        '声道采样读取': Math.floor(audioReadPtr),
        '回调次数': audioCallbacks,
        '静音状态': isMute ? '已静音' : '开启',
        'DAC通电': audioPrimes > 0 ? '已通电' : '未就绪'
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.GGEMU_CORE = coreInstance;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = coreInstance;
  }
})();
