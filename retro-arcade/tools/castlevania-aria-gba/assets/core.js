// 《恶魔城 晓月圆舞曲》(Castlevania: Aria of Sorrow) GBA 掌机驱动
// 钻石四键：下黄跳跃 = GBA A，右红攻击 = GBA B，上绿后撤 = L，左蓝魂技 = R
// Active-Low：currentDown 初始 0x03FF，按下 &= ~，松开 |=。无特权，不改 ROM。
(function() {
  'use strict';

  var gba = null;
  var canvas = null;
  var isMute = false;
  var speedMultiplier = 1;
  var animFrameId = null;
  var recAudioDest = null;
  var hostCallbacks = null;
  var holdLeft = { start: 0, select: 0 };
  var romCache = null;

  var padConfig = {
    name: '晓月圆舞曲',
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
      { id: 'btn-b', key: 'B', label: '跳跃', color: 'yellow' },
      { id: 'btn-a', key: 'A', label: '攻击', color: 'red' },
      { id: 'btn-x', key: 'X', label: '后撤', color: 'green' },
      { id: 'btn-y', key: 'Y', label: '魂技', color: 'blue' }
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

  function mapButtonToGbaKey(btnId) {
    if (!gba || !gba.keypad) return -1;
    var norm = String(btnId || '').toLowerCase().replace(/^btn-/, '');
    switch (norm) {
      case 'up': return gba.keypad.UP;
      case 'down': return gba.keypad.DOWN;
      case 'left': return gba.keypad.LEFT;
      case 'right': return gba.keypad.RIGHT;
      case 'b': return gba.keypad.A;
      case 'a': return gba.keypad.B;
      case 'x': return gba.keypad.L;
      case 'y': return gba.keypad.R;
      case 'l': return gba.keypad.L;
      case 'r': return gba.keypad.R;
      case 'select': return gba.keypad.SELECT;
      case 'start': return gba.keypad.START;
      default: return -1;
    }
  }

  function pressKey(keyIndex, down) {
    if (!gba || !gba.keypad || keyIndex < 0) return;
    if (down) gba.keypad.currentDown &= ~(1 << keyIndex);
    else gba.keypad.currentDown |= (1 << keyIndex);
  }

  function pulseBoot() {
    if (!gba || !gba.keypad) return;
    gba.keypad.currentDown = 0x03FF;
    var i;
    for (i = 0; i < 200; i++) gba.step();
    pressKey(gba.keypad.START, true);
    for (i = 0; i < 12; i++) gba.step();
    pressKey(gba.keypad.START, false);
    for (i = 0; i < 20; i++) gba.step();
    pressKey(gba.keypad.A, true);
    for (i = 0; i < 12; i++) gba.step();
    pressKey(gba.keypad.A, false);
    for (i = 0; i < 30; i++) gba.step();
    gba.keypad.currentDown = 0x03FF;
  }

  var audioPrimes = 0;
  function activateAudio() {
    if (isMute) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (_) {}
    if (typeof window !== 'undefined' && window.xhs && window.xhs.miniTool) {
      try {
        if (typeof window.xhs.miniTool.enableAudio === 'function') {
          window.xhs.miniTool.enableAudio();
        }
      } catch (_) {}
    }
    if (!gba || !gba.audio) return;
    var ctx = gba.audio.context;
    if (ctx && ctx.state !== 'running') ctx.resume().catch(function() {});
    if (ctx && gba.audio.jsAudio) {
      try { gba.audio.jsAudio.connect(ctx.destination); } catch (_) {}
    }
    if (gba.audio && !gba.audio.enabled) gba.audio.writeEnable(1);
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

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    ['touchstart', 'touchend', 'touchmove', 'click', 'keydown', 'mousedown'].forEach(function(evt) {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  function decodeRom(targetRom) {
    if (typeof targetRom !== 'string') return targetRom;
    var binaryString = atob(targetRom);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }

  var coreInstance = {
    name: '晓月圆舞曲',
    pad: padConfig,

    video: function() { return { w: 240, h: 160 }; },
    source: function() { return canvas; },

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
          if (document.body) document.body.appendChild(canvas);
        } else {
          canvas.width = 240;
          canvas.height = 160;
        }
      }
      if (!gba) {
        gba = new window.GameBoyAdvance();
        if (canvas) gba.setCanvas(canvas);
      }
      try {
        var savedMute = localStorage.getItem('castlevania_aria_gba_mute') || localStorage.getItem('ggemu_mute');
        if (savedMute !== null) isMute = (savedMute === 'true');
      } catch (e) {}
      if (gba.audio && gba.audio.setMute) gba.audio.setMute(isMute);

      var targetRom = romData || window.ROM_DATA || window.ROM_BUFFER;
      if (!targetRom && window.ROM_READY && typeof window.ROM_READY.then === 'function') {
        window.ROM_READY.then(function(buf) { coreInstance.boot(buf, host); });
        return;
      }
      try { targetRom = decodeRom(targetRom); } catch (err) {
        console.error('Base64 ROM 解码失败:', err);
      }
      if (!targetRom) {
        if (hostCallbacks && hostCallbacks.toast) hostCallbacks.toast('ROM 数据加载失败');
        return;
      }
      romCache = targetRom;
      var ok = gba.setRom(targetRom);
      if (!ok) {
        if (hostCallbacks && hostCallbacks.toast) hostCallbacks.toast('ROM 校验失败');
        return;
      }
      try { pulseBoot(); } catch (errStep) { console.warn('开机预热轻微异常:', errStep); }
      if (gba.audio) gba.audio.writeEnable(1);
      if (hostCallbacks && typeof hostCallbacks.onReady === 'function') hostCallbacks.onReady();
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
        var raw = romCache || window.ROM_DATA || window.ROM_BUFFER;
        if (raw) gba.setRom(raw);
        holdLeft.start = 0;
        holdLeft.select = 0;
        pulseBoot();
      } catch (e) {
        console.warn('reset warning:', e);
      }
    },

    tick: function() {
      if (!gba) return;
      if (holdLeft.start > 0) {
        holdLeft.start--;
        pressKey(gba.keypad.START, true);
        if (holdLeft.start === 0) pressKey(gba.keypad.START, false);
      }
      if (holdLeft.select > 0) {
        holdLeft.select--;
        pressKey(gba.keypad.SELECT, true);
        if (holdLeft.select === 0) pressKey(gba.keypad.SELECT, false);
      }
      var steps = speedMultiplier || 1;
      for (var s = 0; s < steps; s++) gba.step();
    },

    setButton: function(btnId, pressed) {
      activateAudio();
      var norm = String(btnId || '').toLowerCase().replace(/^btn-/, '');
      if (norm === 'start' || norm === 'select') {
        if (pressed) holdLeft[norm] = 8;
        var keyIndex = mapButtonToGbaKey(btnId);
        pressKey(keyIndex, !!pressed);
        return;
      }
      var key = mapButtonToGbaKey(btnId);
      pressKey(key, !!pressed);
    },

    setSpeed: function(mul) { speedMultiplier = mul || 1; },
    setSpeedMultiplier: function(mul) { speedMultiplier = mul || 1; },
    setMuted: function(mute) { coreInstance.setMute(mute); },

    setMute: function(mute) {
      isMute = !!mute;
      try {
        localStorage.setItem('castlevania_aria_gba_mute', String(isMute));
        localStorage.setItem('ggemu_mute', String(isMute));
      } catch (e) {}
      if (gba && gba.audio && gba.audio.setMute) gba.audio.setMute(isMute);
    },

    isMuted: function() { return isMute; },

    connectRecordingAudio: function(destNode) {
      activateAudio();
      if (!gba || !gba.audio) return null;
      var ctx = gba.audio.context;
      if (ctx && ctx.state !== 'running') ctx.resume().catch(function() {});
      if (!gba.audio.enabled) gba.audio.writeEnable(1);
      if (destNode) {
        recAudioDest = destNode;
        if (gba.audio.connectRecordingAudio) gba.audio.connectRecordingAudio(destNode);
        return null;
      }
      if (!ctx || typeof ctx.createMediaStreamDestination !== 'function') return null;
      try {
        var dest = ctx.createMediaStreamDestination();
        if (gba.audio.jsAudio) gba.audio.jsAudio.connect(dest);
        var tracks = dest.stream.getAudioTracks();
        return tracks && tracks.length ? tracks[0] : null;
      } catch (err) {
        console.error('接入录制音轨失败:', err);
        return null;
      }
    },

    activateAudio: activateAudio,
    resumeAudio: activateAudio,

    audioDiag: function() {
      var ctx = gba && gba.audio ? gba.audio.context : null;
      return {
        ok: !!ctx && ctx.state === 'running',
        contextState: ctx ? ctx.state : 'none',
        sampleRate: ctx ? ctx.sampleRate : 0,
        nodeAttached: !!(gba && gba.audio && gba.audio.jsAudio),
        primes: audioPrimes
      };
    },

    exportState: function() {
      if (!gba) throw new Error('游戏未运行');
      return JSON.stringify({ v: 1, sys: 'castlevania-aria-gba', t: Date.now(), state: coreInstance.saveState() });
    },

    importState: function(stateStr) {
      if (!gba) throw new Error('游戏未运行');
      var obj = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
      if (obj.sys !== 'castlevania-aria-gba' || !obj.state) throw new Error('存档格式不兼容');
      if (!coreInstance.loadState(obj.state)) throw new Error('读档失败');
      return true;
    },

    saveState: function() {
      if (!gba) return null;
      try {
        var jsonStr = JSON.stringify(gba.freeze());
        if (typeof window !== 'undefined' && window.LZString && window.LZString.compressToBase64) {
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
        if (typeof window !== 'undefined' && window.LZString && window.LZString.decompressFromBase64) {
          var decomp = window.LZString.decompressFromBase64(compressed);
          if (decomp) jsonStr = decomp;
        }
        gba.defrost(JSON.parse(jsonStr));
        if (gba.audio) gba.audio.writeEnable(1);
        return true;
      } catch (e) {
        console.error('即时读档失败:', e);
        return false;
      }
    },

    destroy: function() {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = null;
      gba = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.GGEMU_CORE = coreInstance;
    window.GBA_CORE = coreInstance;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = coreInstance;
})();
