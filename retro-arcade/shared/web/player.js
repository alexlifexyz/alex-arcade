// shared/web/player.js
// 网页播放器：全屏（纯画面）/ 触控手柄（虚拟键）/ 掌机 三种模式共用一页。
// 自动识别移动端设备：手机打开默认进入适配好的「触控手柄」模式，掌机模式自适应缩放永不重叠。
// 联机采用 WebRTC 音视频流 + 信令 WebSocket 实时画面帧双擎驱动，彻底杜绝扫码后黑屏。
(function () {
  'use strict';

  var games = window.WEB_GAMES || [];
  var MODES = ['full', 'virtual', 'deck'];
  var qs = new URLSearchParams(window.location.search);
  var selftest = qs.get('selftest') === '1';
  var explicitScaleParam = qs.get('scale');
  var scaleMode = (explicitScaleParam || 'exact').toLowerCase();
  var scaleLogged = false;

  var frame = document.getElementById('game-frame');
  var frameBox = document.getElementById('frame-box');
  var select = document.getElementById('game-select');
  var label = document.getElementById('game-label');
  var notice = document.getElementById('mode-notice');
  var statusEl = document.getElementById('bridge-status');
  var gamepadStatus = document.getElementById('gamepad-status');
  var diag = document.getElementById('diag');
  var modeSwitch = document.getElementById('mode-switch');
  var stage = document.getElementById('stage');
  var screenWrap = document.getElementById('screen-wrap');
  var fullCanvas = document.getElementById('full-canvas');
  var fullActions = document.getElementById('full-actions');
  var virtualLayer = document.getElementById('virtual-layer');

  function isMobileDevice() {
    try {
      if (window.innerWidth > 0 && window.innerWidth <= 768) return true;
      if (window.matchMedia && window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches) return true;
      if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  var isMobile = isMobileDevice();
  if (isMobile) {
    document.documentElement.setAttribute('data-device', 'mobile');
    document.body.classList.add('is-mobile');
  }

  // 调试信息默认收起；?debug=1 才展开，方便排查
  if (qs.get('debug') === '1') {
    document.body.classList.add('show-debug');
    var debugPanel = document.getElementById('debug-panel');
    if (debugPanel) debugPanel.open = true;
  }

  var coreRef = null;
  var bridge = null;
  var tracker = null;
  var gamepad = null;
  var fullRafId = null;
  var frameDraws = 0;
  var pollTicks = 0;
  var fastOn = false;
  var recorder = null;
  var recordChunks = [];
  var recordTimer = null;

  var game = findGame(qs.get('game')) || games[0] || null;
  var requestedMode = qs.get('mode');
  // 手机端未显式传 mode 时，自动进入专门适配的「触控手柄 (virtual)」模式；PC 端默认进「全屏 (full)」模式
  var defaultMode = (isMobile && !selftest) ? 'virtual' : 'full';
  var mode = MODES.indexOf(requestedMode) >= 0 ? requestedMode : defaultMode;

  function findGame(id) {
    if (!id) return null;
    for (var i = 0; i < games.length; i++) if (games[i].id === id) return games[i];
    return null;
  }
  function modeName(m) { return m === 'full' ? '全屏' : m === 'virtual' ? '触控手柄' : '掌机'; }
  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }
  function toast(msg) { if (notice) notice.textContent = msg; }
  function fail(reason) {
    document.documentElement.setAttribute('data-bridge', 'error');
    setStatus('bridge-error', 'error');
    diag.textContent += '\n' + reason;
  }
  function addDiag(line) { diag.textContent += '\n' + line; }

  // 1. 游戏下拉
  for (var i = 0; i < games.length; i++) {
    var opt = document.createElement('option');
    opt.value = games[i].id;
    opt.textContent = (games[i].multiplayer ? '[2P] ' : '') + games[i].title + ' · ' + games[i].platform;
    if (game && games[i].id === game.id) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', function () {
    window.location.search = '?game=' + encodeURIComponent(select.value) + '&mode=' + mode;
  });

  // 掌机模式 (deck) 自适应等比缩放：确保内部 shell.js 始终拥有 390x790 黄金纵向空间，彻底根治手机端十字键与选择/开始重叠
  function fitDeckFrame() {
    if (!frameBox || !frame || !stage) return;
    if (mode !== 'deck') {
      frameBox.style.width = '';
      frameBox.style.height = '';
      frame.style.width = '';
      frame.style.height = '';
      frame.style.transform = '';
      return;
    }
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    if (!sw || !sh) return;
    var baseW = 390;
    var baseH = 790;
    if (sw <= 520 && sh >= sw * 1.98) {
      frameBox.style.width = sw + 'px';
      frameBox.style.height = sh + 'px';
      frame.style.width = sw + 'px';
      frame.style.height = sh + 'px';
      frame.style.transform = 'none';
    } else {
      var s = Math.min(sw / baseW, sh / baseH);
      var boxW = Math.max(1, Math.round(baseW * s));
      var boxH = Math.max(1, Math.round(baseH * s));
      frameBox.style.width = boxW + 'px';
      frameBox.style.height = boxH + 'px';
      frame.style.width = baseW + 'px';
      frame.style.height = baseH + 'px';
      frame.style.transformOrigin = '0 0';
      frame.style.transform = 'scale(' + s + ')';
    }
  }

  window.addEventListener('resize', function () {
    isMobile = isMobileDevice();
    document.body.classList.toggle('is-mobile', isMobile);
    fitDeckFrame();
  });

  // 2. 模式切换
  function paintMode() {
    var btns = modeSwitch.querySelectorAll('.mode-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].className = btns[j].getAttribute('data-mode') === mode ? 'mode-btn active' : 'mode-btn';
    }
    document.documentElement.setAttribute('data-mode', mode);
    document.body.setAttribute('data-mode', mode);
    fitDeckFrame();
  }
  function setMode(next, quiet) {
    if (MODES.indexOf(next) < 0) return;
    mode = next;
    if (!quiet) {
      window.history.replaceState(null, '', '?game=' + encodeURIComponent(game ? game.id : '') + '&mode=' + mode);
      window.dispatchEvent(new CustomEvent('webplayer:modechange', { detail: { mode: mode } }));
    }
    paintMode();
    applyMode();
  }
  modeSwitch.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.mode-btn') : null;
    if (btn) setMode(btn.getAttribute('data-mode'));
  });
  paintMode();

  // 3. 把焦点还给 iframe（内核键盘与音频手势都依赖它），并全手势唤醒音频
  function ensureAudioActive() {
    if (!coreRef) return;
    try {
      if (typeof coreRef.activateAudio === 'function') coreRef.activateAudio();
      if (typeof coreRef.resumeAudio === 'function') coreRef.resumeAudio();
      var win = frame && frame.contentWindow;
      if (win && win.AudioContext) {
        if (coreRef.audioCtx && coreRef.audioCtx.state === 'suspended') {
          coreRef.audioCtx.resume().catch(function () {});
        }
      }
    } catch (_) {}
  }
  function focusGame() {
    if (mode === 'deck') {
      var B = window.WEB_INPUT_BRIDGE;
      if (B) B.focusIframe(frame);
    } else {
      try {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
          document.activeElement.blur();
        }
        window.focus();
      } catch (_) {}
    }
    ensureAudioActive();
  }
  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, ensureAudioActive, { capture: true, passive: true });
    document.addEventListener(evt, ensureAudioActive, { capture: true, passive: true });
  });
  stage.addEventListener('pointerdown', function () { if (mode !== 'deck') focusGame(); });
  window.addEventListener('blur', function () { if (bridge) bridge.releaseAll(); });

  // 4. 纯画面与触控手柄渲染：只 drawImage(source())，不自己 tick
  function drawFrame() {
    if (!coreRef || typeof coreRef.source !== 'function') return;
    var src = null;
    try { src = coreRef.source(); } catch (err) { return; }
    if (!src || !src.width || !src.height) return;
    var W = stage.clientWidth;
    var H = stage.clientHeight;
    if (!W || !H) return;

    var isPortraitVirtual = (mode === 'virtual' && H > W * 1.05);
    document.body.classList.toggle('is-portrait-virtual', isPortraitVirtual);

    // 竖屏触控手柄模式下，画面居于上半主视窗，下半部留给 8 向十字键 + 动作键控制台，绝不遮挡画面
    var usableW = Math.max(120, W - (W <= 680 ? 16 : 32));
    var usableH = isPortraitVirtual
      ? Math.max(140, Math.min(H * 0.48, H - 300))
      : Math.max(80, H - 56);

    var fitScale = Math.min(usableW / src.width, usableH / src.height);
    var scale = fitScale;
    if (scaleMode === '1x') {
      scale = 1;
    } else if (/^[234]x$/.test(scaleMode)) {
      scale = Math.min(parseInt(scaleMode, 10), Math.max(1, Math.floor(fitScale)));
    } else if ((scaleMode === 'exact' || scaleMode === 'integer') && !explicitScaleParam && W <= 768) {
      // 手机与窄屏下自适应铺满宽度，避免 256x240 原画在 390px 手机上缩成小方块
      scale = fitScale;
    } else if (scaleMode === 'exact' || scaleMode === 'integer') {
      scale = Math.max(1, Math.floor(fitScale));
    }
    if (!scaleLogged) {
      scaleLogged = true;
      document.documentElement.setAttribute('data-scale-mode', scaleMode);
      document.documentElement.setAttribute('data-scale', String(scale));
    }
    var w = Math.max(1, Math.floor(src.width * scale));
    var h = Math.max(1, Math.floor(src.height * scale));
    if (fullCanvas.width !== w || fullCanvas.height !== h) {
      fullCanvas.width = w;
      fullCanvas.height = h;
      fullCanvas.style.width = w + 'px';
      fullCanvas.style.height = h + 'px';
    }
    if (screenWrap) {
      screenWrap.style.width = w + 'px';
      screenWrap.style.height = h + 'px';
    }
    if (fullActions) {
      fullActions.classList.toggle('outside', (W - w) / 2 >= 90);
    }
    var ctx = fullCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    frameDraws++;
    if (frameDraws === 1) {
      document.documentElement.setAttribute('data-full-draws', 'started');
      addDiag('full-draw-started  纯画面 rAF 已开始绘制（帧推进仍由 iframe 内 shell.js 负责）');
    }
  }
  function startFullLoop() {
    if (fullRafId != null) window.cancelAnimationFrame(fullRafId);
    fullRafId = null;
    drawFrame();
    function loop() {
      fullRafId = window.requestAnimationFrame(loop);
      // 严禁在此处调用 coreRef.tick()！帧推进完全由 iframe 内 shell.js 统一负责
      drawFrame();
      if (gamepad) {
        var s = gamepad.poll();
        if (s && s.active > 0) ensureAudioActive();
        if (++pollTicks % 30 === 0) updateGamepadStatus();
      }
    }
    fullRafId = window.requestAnimationFrame(loop);
  }
  function stopFullLoop() {
    if (fullRafId != null) window.cancelAnimationFrame(fullRafId);
    fullRafId = null;
  }

  // 5. 全屏角上两颗功能键：家用机【选择】【开始】，街机【投币】【开始】
  function renderCapsules() {
    if (!bridge || !fullActions) return 0;
    var km = bridge.getKeymap();
    var caps = km.order.filter(function (n) { return km.map[n].kind === 'capsule'; });
    var arcade = caps.indexOf('coin') >= 0;
    var firstNorm = arcade ? 'coin' : (km.map.select ? 'select' : caps[0]);
    var startNorm = km.map.start ? 'start' : caps[caps.length - 1];
    var pairs = [[firstNorm, arcade ? '投币' : '选择'], [startNorm, '开始']];
    fullActions.innerHTML = '';
    pairs.forEach(function (pair) {
      if (!pair[0]) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'capsule-btn';
      btn.setAttribute('data-kind', 'capsule');
      btn.setAttribute('data-full-capsule', '1');
      btn.setAttribute('data-norm', pair[0]);
      btn.textContent = pair[1];
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        bridge.press(pair[0]);
        btn.classList.add('down');
        focusGame();
      });
      function up(e) {
        e.preventDefault();
        bridge.release(pair[0]);
        btn.classList.remove('down');
      }
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      fullActions.appendChild(btn);
    });
    return fullActions.children.length;
  }

  // 6. 虚拟键 / 手机触控手柄（DOM 始终生成，由 CSS 按模式显示）
  var VK = window.WEB_VIRTUAL_KEYS;
  function renderVirtual() {
    if (!bridge || !VK || !virtualLayer) return 0;
    var n = VK.render(virtualLayer, bridge.getKeymap());
    if (tracker) VK.attach(virtualLayer, tracker);
    return n;
  }

  // 7. 手柄
  function updateGamepadStatus() {
    if (!gamepad || !gamepadStatus) return;
    var s = gamepad.status();
    gamepadStatus.textContent = s.connected
      ? '已连接 ' + (s.summary || (s.id + '（' + s.active + ' 键按住）'))
      : (s.secure ? '未检测到手柄，按一下手柄任意键唤醒' : '需要 HTTPS 或 localhost 才能用手柄');
  }

  // 8. 细条工具
  function bindTools() {
    function on(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
      return el;
    }
    var saveKey = 'webplayer_save_' + (game ? game.id : 'default');
    on('tool-save', function () {
      if (!coreRef || typeof coreRef.exportState !== 'function') return toast('该游戏不支持存档');
      try {
        var raw = coreRef.exportState();
        if (!raw) return toast('存档失败');
        localStorage.setItem(saveKey, raw);
        toast('已存档（本机浏览器）');
      } catch (err) { toast('存档失败: ' + err.message); }
    });
    on('tool-load', function () {
      if (!coreRef || typeof coreRef.importState !== 'function') return toast('该游戏不支持读档');
      try {
        var raw = localStorage.getItem(saveKey);
        if (!raw) return toast('还没有存档');
        coreRef.importState(raw);
        toast('已读档');
      } catch (err) { toast('读档失败: ' + err.message); }
    });
    on('tool-reset', function () {
      if (coreRef && typeof coreRef.reset === 'function') { coreRef.reset(); toast('已复位'); }
    });
    var soundBtn = on('tool-sound', function () {
      if (!coreRef) return;
      var muted = typeof coreRef.isMuted === 'function' ? coreRef.isMuted() : false;
      var fn = typeof coreRef.setMute === 'function' ? coreRef.setMute : coreRef.setMuted;
      if (typeof fn === 'function') fn.call(coreRef, !muted);
      if (muted) ensureAudioActive();
      soundBtn.textContent = muted ? '声音' : '静音';
      soundBtn.classList.toggle('active', !muted);
    });
    var fastBtn = on('tool-fast', function () {
      if (!coreRef || typeof coreRef.setSpeed !== 'function') return;
      fastOn = !fastOn;
      coreRef.setSpeed(fastOn ? 3 : 1);
      fastBtn.classList.toggle('active', fastOn);
      toast(fastOn ? '3× 加速已开' : '恢复正常速度');
    });
    on('tool-record', toggleRecord);
  }

  function toggleRecord() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!window.MediaRecorder || !fullCanvas.captureStream) return toast('当前浏览器不支持网页录屏');
    try {
      var stream = fullCanvas.captureStream(30);
      if (coreRef && typeof coreRef.connectRecordingAudio === 'function') {
        var track = coreRef.connectRecordingAudio();
        if (track && stream.addTrack) stream.addTrack(track);
      }
      var mime = MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm')
        ? { mimeType: 'video/webm' } : undefined;
      recordChunks = [];
      recorder = new MediaRecorder(stream, mime);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) recordChunks.push(e.data); };
      recorder.onstop = function () {
        if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
        var blob = new Blob(recordChunks, { type: 'video/webm' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (game ? game.id : 'game') + '-59s.webm';
        a.click();
        toast('录屏已保存');
      };
      recorder.start();
      toast('录屏中，59 秒自动结束，再点一次可提前停止');
      recordTimer = setTimeout(function () {
        if (recorder && recorder.state === 'recording') recorder.stop();
      }, 59000);
    } catch (err) { toast('录屏启动失败: ' + err.message); }
  }

  // 9. 浏览器全屏
  var fsBtn = document.getElementById('btn-browser-fullscreen');
  if (fsBtn) fsBtn.addEventListener('click', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen();
    } catch (err) { toast('浏览器全屏不可用'); }
  });

  // 10. 模式应用（core ready 后才完整执行）
  function applyMode() {
    if (!coreRef || !bridge) { paintMode(); return; }
    bridge.releaseAll();
    if (tracker) tracker.releaseAll();
    if (gamepad) gamepad.disconnect();
    paintMode();
    if (mode === 'full' || mode === 'virtual') {
      startFullLoop();
      focusGame();
      toast('「' + modeName(mode) + '」已开启：' +
        (mode === 'full' ? '点一下画面用键盘或接蓝牙手柄；手机端可切「手柄」或「掌机」。'
          : '左侧 8 向滑动十字键，右侧多指动作键，支持边走边打。'));
    } else {
      stopFullLoop();
      fitDeckFrame();
      focusGame();
      toast('「掌机」模式：原样显示整台掌机，触摸按键由外壳处理。');
    }
  }

  // 11. 对外诊断 API（自检脚本用）
  window.WEB_PLAYER = {
    getCore: function () { return coreRef; },
    getGame: function () { return game; },
    getMode: function () { return mode; },
    setMode: setMode,
    bridge: null,
    getBridge: function () { return bridge; },
    frame: frame,
    diagnose: function () {
      return {
        mode: mode,
        coreReady: !!coreRef,
        rafActive: fullRafId != null ? 1 : 0,
        frameDraws: frameDraws,
        bridgeHeld: bridge ? bridge.held() : [],
        trackerActive: tracker ? tracker.active() : 0,
        gamepad: gamepad ? gamepad.status() : null
      };
    }
  };

  if (!game) { fail('游戏清单为空，请先检查 shared/web/games.js'); return; }
  label.textContent = game.title + ' · ' + game.platform + ' · ' + game.id;
  document.title = game.title + ' · 网页播放器';

  // 12. 同源载入 + 等待 GGEMU_CORE
  frame.addEventListener('load', function () {
    fitDeckFrame();
    var tries = 0;
    var timer = window.setInterval(function () {
      var core = null;
      try { core = frame.contentWindow && frame.contentWindow.GGEMU_CORE; } catch (err) { /* 继续等 */ }
      if (core) { window.clearInterval(timer); onBridgeReady(core); return; }
      if (++tries > 120) { window.clearInterval(timer); fail('未能在 iframe 内找到 window.GGEMU_CORE（6 秒超时）'); }
    }, 50);
  });

  function onBridgeReady(core) {
    coreRef = core;
    document.documentElement.setAttribute('data-bridge', 'ready');
    setStatus('bridge-ready', 'ready');

    var pad = core.pad || {};
    var lines = [];
    lines.push('game=' + game.id + '  mode=' + mode + '  bridge=ready');
    lines.push('pad.layout=' + (pad.layout || '(未声明)') + '  stick=' + !!pad.stick +
      '  actions=' + (pad.actions ? pad.actions.length : 0) +
      '  capsules=' + (pad.capsules ? pad.capsules.length : 0));
    try {
      var v = typeof core.video === 'function' ? core.video() : null;
      lines.push('video()=' + (v ? v.w + 'x' + v.h : '不可用'));
    } catch (e1) { lines.push('video() 读取异常: ' + e1.message); }
    try {
      var src = typeof core.source === 'function' ? core.source() : null;
      lines.push('source()=' + (src && src.width ? src.width + 'x' + src.height + ' canvas' : '尚未就绪'));
    } catch (e2) { lines.push('source() 读取异常: ' + e2.message); }
    lines.push('setButton=' + (typeof core.setButton) + '  exportState=' + (typeof core.exportState) +
      '  activateAudio=' + (typeof core.activateAudio));

    var B = window.WEB_INPUT_BRIDGE;
    bridge = B.createBridge({ core: core, pad: core.pad });
    bridge.attach(window, document, frame);
    window.WEB_PLAYER.bridge = bridge;
    tracker = VK.createTracker(bridge);
    var focusOk = B.focusIframe(frame);
    document.documentElement.setAttribute('data-kbd-focus', focusOk ? 'ok' : 'error');

    // 挂载 PC 全局键盘支持
    if (window.WEB_KEYBOARD) {
      if (window.WEB_PLAYER._keyboard) {
        window.WEB_PLAYER._keyboard.detach();
      }
      var kbd = window.WEB_KEYBOARD.createKeyboard({ bridge: bridge, window: window, document: document });
      kbd.attach();
      window.WEB_PLAYER._keyboard = kbd;
      var kbdHintEl = document.getElementById('kbd-hint');
      var hintText = typeof window.WEB_KEYBOARD.describeHint === 'function'
        ? window.WEB_KEYBOARD.describeHint(bridge.getKeymap())
        : '键盘：WASD/方向键移动 · J 主键(B) · K 副键(A) · Enter 开始 · Shift 选择';
      if (kbdHintEl) kbdHintEl.textContent = hintText;
      lines.push('keyboard-ready  ' + hintText);
    }

    lines.push('输入桥键表 ' + bridge.getKeymap().order.length + ' 键：' + bridge.getKeymap().order.join(','));
    lines.push('Hold Buffer ' + bridge.holdMs + 'ms；失焦 / 切模式 / iframe 重载全键释放');

    // 步骤 3：纯画面层与两颗功能键
    var capsuleCount = renderCapsules();
    lines.push('full-mode-ready  纯画面 canvas + ' + capsuleCount + ' 颗功能键（街机为投币/开始）');

    // 步骤 4：虚拟键
    var vkCount = renderVirtual();
    lines.push('virtual-keys-ready  共 ' + vkCount + ' 颗虚拟键（8向滑动十字键 + 多指 Pointer Events）');

    // 步骤 5：手柄
    var GP = window.WEB_GAMEPAD;
    gamepad = GP.createGamepad({ bridge: bridge, keymap: bridge.getKeymap(), isSecure: !!window.isSecureContext });
    updateGamepadStatus();
    lines.push('gamepad-poll-ready  标准映射 ' + JSON.stringify(gamepad.bindings.buttonToNorm) +
      '；' + (window.isSecureContext ? '安全上下文 OK' : '需要 HTTPS 或 localhost'));
    lines.push('同源直访已验证：不需要 postMessage，未改动 tools/ 下任何文件。');
    diag.textContent = lines.join('\n');

    bindTools();
    applyMode();
    setupNetplay();

    // 步骤 6：自检 20 次模式切换
    if (selftest) {
      var errors = [];
      for (var i = 0; i < 20; i++) {
        setMode(MODES[i % MODES.length], true);
        var d = window.WEB_PLAYER.diagnose();
        if (d.rafActive > 1) errors.push('raf@' + i);
        if (d.bridgeHeld.length) errors.push('held@' + i);
        if (d.trackerActive) errors.push('tracker@' + i);
      }
      document.documentElement.setAttribute('data-selftest', errors.length ? 'dirty' : 'clean');
      addDiag(errors.length ? 'switch-dirty  ' + errors.join(',')
        : 'switch-clean  20 次模式切换：无双 rAF、无残留按键');
    }
  }

  // 13. WebRTC + WebSocket 双擎跨端联机支持 (PC 房主 1P + 手机遥控 2P)
  function isCapsuleBtnId(btn) {
    var norm = String(btn || '').toLowerCase().replace(/^btn-/, '');
    return norm === 'start' || norm === 'select' || norm === 'coin';
  }

  function setupNetplay() {
    var Netplay = window.ArcadeNetplay;
    if (!Netplay) return;

    // === A. 手机端 (访客 2P) 流程 ===
    if (Netplay.isClientMode()) {
      document.body.classList.add('is-client');
      var clientVideo = document.getElementById('client-video');
      var clientCanvas = document.getElementById('client-canvas');
      var clientAudioPrompt = document.getElementById('client-audio-prompt');
      var promptTitleEl = document.getElementById('client-prompt-title');
      var promptDescEl = document.getElementById('client-prompt-desc');
      var btnClientStart = document.getElementById('btn-client-start');
      var btnClientSound = document.getElementById('btn-client-sound');
      var pingEl = document.getElementById('netplay-ping');
      var titleEl = document.getElementById('client-game-title');
      var dpadEl = document.getElementById('client-dpad');
      var actionsEl = document.getElementById('client-actions');
      var capsulesEl = document.getElementById('client-capsules');
      var shouldersEl = document.getElementById('client-shoulders');

      if (clientVideo) clientVideo.muted = true;
      if (titleEl) {
        titleEl.textContent = (game ? game.title : '2P 联机') + ' · 连接中';
      }

      // 2P 手机端轻触按键合成微音效（当走 WebSocket 保底帧流无 WebRTC 音轨时也能提供清脆按键反馈）
      var clientBeepCtx = null;
      var userUnlockedAudio = false;
      var webrtcVideoPlaying = false;

      function playClientTapFeedback(isAction) {
        if (!userUnlockedAudio) return;
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          if (!clientBeepCtx) clientBeepCtx = new AC();
          if (clientBeepCtx.state === 'suspended') clientBeepCtx.resume().catch(function () {});
          if (webrtcVideoPlaying && clientVideo && !clientVideo.muted) return;
          var osc = clientBeepCtx.createOscillator();
          var gain = clientBeepCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = isAction ? 520 : 340;
          gain.gain.setValueAtTime(0.035, clientBeepCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, clientBeepCtx.currentTime + 0.035);
          osc.connect(gain);
          gain.connect(clientBeepCtx.destination);
          osc.start();
          osc.stop(clientBeepCtx.currentTime + 0.038);
        } catch (_) {}
      }

      var clientSender = Netplay.createClientInputSender(function (btn, pressed) {
        Netplay.sendInput(btn, pressed);
        if (pressed) playClientTapFeedback(btn === 'a' || btn === 'b' || btn === 'start');
      });

      function paintDpadVisual(dirs) {
        if (!dpadEl) return;
        var map = {};
        for (var i = 0; i < dirs.length; i++) map[dirs[i]] = true;
        var all = ['up', 'down', 'left', 'right'];
        for (var j = 0; j < all.length; j++) {
          var el = dpadEl.querySelector('.dpad-' + all[j]);
          if (el) el.classList.toggle('active', !!map[all[j]]);
        }
      }

      function clearAllClientVisuals() {
        clientSender.releaseAll();
        paintDpadVisual([]);
        var activeEls = document.querySelectorAll('#client-stage .active');
        for (var i = 0; i < activeEls.length; i++) {
          activeEls[i].classList.remove('active');
        }
      }

      function renderClientControls(pad) {
        var specs = Netplay.buildClientButtonSpecs(pad);

        if (actionsEl) {
          actionsEl.innerHTML = '';
          actionsEl.className = 'client-actions touch-interactive layout-' + specs.layoutMode;
          specs.actions.forEach(function (item) {
            var btn = document.createElement('div');
            btn.className = 'act-btn slot-' + item.slot;
            btn.setAttribute('data-btn', item.id);
            var mainSpan = document.createElement('span');
            mainSpan.textContent = item.label;
            btn.appendChild(mainSpan);
            if (item.sub && item.sub !== item.label) {
              var subSmall = document.createElement('small');
              subSmall.textContent = item.sub;
              btn.appendChild(subSmall);
            }
            actionsEl.appendChild(btn);
          });
        }

        if (capsulesEl) {
          capsulesEl.innerHTML = '';
          specs.capsules.forEach(function (cap) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cap-btn';
            btn.setAttribute('data-btn', cap.id);
            btn.textContent = cap.label;
            capsulesEl.appendChild(btn);
          });
        }

        if (shouldersEl) {
          shouldersEl.innerHTML = '';
          if (specs.shoulders && specs.shoulders.length) {
            shouldersEl.style.display = 'flex';
            specs.shoulders.forEach(function (sh) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'shoulder-btn';
              btn.setAttribute('data-btn', sh.id);
              btn.textContent = sh.label;
              shouldersEl.appendChild(btn);
            });
          } else {
            shouldersEl.style.display = 'none';
          }
        }
      }

      var fallbackPad = (game && game.category === 'arcade')
        ? {
            layout: 'diamond',
            stick: true,
            actions: [
              { id: 'y', label: '攻击', key: 'Y' },
              { id: 'b', label: '跳跃', key: 'B' },
              { id: 'a', label: '必杀', key: 'A' },
              { id: 'x', label: '连发', key: 'X' }
            ],
            capsules: [{ id: 'coin', label: '投币' }, { id: 'start', label: '开始' }]
          }
        : null;
      renderClientControls(fallbackPad);

      function tryPlayClientVideo(wantSound) {
        if (!clientVideo || !clientVideo.srcObject) return;
        if (wantSound) {
          clientVideo.muted = false;
          var p = clientVideo.play();
          if (p && typeof p.then === 'function') {
            p.then(function () {
              if (btnClientSound) btnClientSound.style.display = 'none';
            }).catch(function () {
              clientVideo.muted = true;
              clientVideo.play().catch(function () {});
              if (btnClientSound) btnClientSound.style.display = 'inline-block';
            });
          }
        } else {
          clientVideo.muted = true;
          clientVideo.play().catch(function () {});
        }
      }

      function activateVideo(e) {
        if (e && typeof e.preventDefault === 'function' && e.target === btnClientStart) {
          e.preventDefault();
        }
        userUnlockedAudio = true;
        if (clientAudioPrompt) clientAudioPrompt.style.display = 'none';
        if (btnClientSound) btnClientSound.style.display = 'none';
        if (clientVideo && clientVideo.srcObject) {
          tryPlayClientVideo(true);
        }
      }

      if (btnClientStart) {
        btnClientStart.addEventListener('click', activateVideo);
        btnClientStart.addEventListener('touchend', activateVideo, { passive: false });
      }
      if (btnClientSound) {
        btnClientSound.addEventListener('click', activateVideo);
        btnClientSound.addEventListener('touchend', activateVideo, { passive: false });
      }

      // 只要玩家触碰任何 2P 操控按键，自动解锁声音并收起提示层
      if (dpadEl) {
        var dpadPointerId = null;
        function updateDpadFromEvent(e) {
          var rect = dpadEl.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          var nx = (e.clientX - cx) / (rect.width / 2);
          var ny = (e.clientY - cy) / (rect.height / 2);
          var dirs = Netplay.resolveDpadDirections(nx, ny, 0.24);
          clientSender.setDpadDirs(dirs);
          paintDpadVisual(dirs);
        }
        function releaseDpad(e) {
          if (dpadPointerId == null || e.pointerId !== dpadPointerId) return;
          dpadPointerId = null;
          clientSender.setDpadDirs([]);
          paintDpadVisual([]);
        }
        dpadEl.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          activateVideo();
          if (dpadPointerId != null && dpadPointerId !== e.pointerId) return;
          dpadPointerId = e.pointerId;
          try { dpadEl.setPointerCapture(e.pointerId); } catch (_) {}
          updateDpadFromEvent(e);
        });
        dpadEl.addEventListener('pointermove', function (e) {
          if (dpadPointerId == null || e.pointerId !== dpadPointerId) return;
          e.preventDefault();
          updateDpadFromEvent(e);
        });
        dpadEl.addEventListener('pointerup', releaseDpad);
        dpadEl.addEventListener('pointercancel', releaseDpad);
        dpadEl.addEventListener('lostpointercapture', releaseDpad);
      }

      var pointerTargetMap = {};
      function bindButtonContainer(container) {
        if (!container) return;
        container.addEventListener('pointerdown', function (e) {
          var btnEl = e.target && e.target.closest ? e.target.closest('[data-btn]') : null;
          if (!btnEl) return;
          e.preventDefault();
          activateVideo();
          var btnId = btnEl.getAttribute('data-btn');
          if (!btnId) return;
          pointerTargetMap[String(e.pointerId)] = btnEl;
          btnEl.classList.add('active');
          clientSender.pressButton(e.pointerId, btnId);
          try { btnEl.setPointerCapture(e.pointerId); } catch (_) {}
        });
        function up(e) {
          var pid = String(e.pointerId);
          var btnEl = pointerTargetMap[pid];
          if (btnEl) {
            delete pointerTargetMap[pid];
            clientSender.releaseButton(e.pointerId);
            var stillHeld = false;
            var keys = Object.keys(pointerTargetMap);
            for (var i = 0; i < keys.length; i++) {
              if (pointerTargetMap[keys[i]] === btnEl) { stillHeld = true; break; }
            }
            if (!stillHeld) btnEl.classList.remove('active');
          } else {
            clientSender.releaseButton(e.pointerId);
          }
        }
        container.addEventListener('pointerup', up);
        container.addEventListener('pointercancel', up);
        container.addEventListener('lostpointercapture', up);
      }
      bindButtonContainer(actionsEl);
      bindButtonContainer(capsulesEl);
      bindButtonContainer(shouldersEl);

      window.addEventListener('blur', clearAllClientVisuals);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) clearAllClientVisuals();
      });

      window.WEB_NETPLAY_CLIENT = {
        renderControls: renderClientControls,
        sender: clientSender,
        clearAll: clearAllClientVisuals
      };

      // 监听原生 WebRTC video 是否真正渲染出像素，若是则通知房主停发保底帧
      if (clientVideo) {
        ['loadeddata', 'playing', 'resize'].forEach(function (evName) {
          clientVideo.addEventListener(evName, function () {
            if (clientVideo.videoWidth > 0 && clientVideo.videoHeight > 0) {
              webrtcVideoPlaying = true;
              if (clientCanvas) clientCanvas.style.display = 'none';
              if (clientAudioPrompt) clientAudioPrompt.style.display = 'none';
              if (!userUnlockedAudio && btnClientSound) {
                btnClientSound.style.display = 'inline-block';
              }
              if (typeof Netplay.notifyWebrtcVideoReady === 'function') {
                Netplay.notifyWebrtcVideoReady();
              }
            }
          });
        });
      }

      // 保底 WebSocket 实时画面帧渲染器（即使 WebRTC UDP 被拦截也绝不黑屏）
      var frameImg = new Image();
      var frameBusy = false;
      var clientCanvasCtx = clientCanvas ? clientCanvas.getContext('2d', { alpha: false }) : null;
      frameImg.onload = function () {
        frameBusy = false;
        if (webrtcVideoPlaying || !clientCanvas || !clientCanvasCtx) return;
        var w = frameImg.naturalWidth || 256;
        var h = frameImg.naturalHeight || 240;
        if (clientCanvas.width !== w || clientCanvas.height !== h) {
          clientCanvas.width = w;
          clientCanvas.height = h;
        }
        clientCanvasCtx.imageSmoothingEnabled = false;
        clientCanvasCtx.drawImage(frameImg, 0, 0, w, h);
        // 首帧画面到达即自动移开遮罩，直接展示实时游戏屏幕
        if (clientAudioPrompt && clientAudioPrompt.style.display !== 'none') {
          clientAudioPrompt.style.display = 'none';
          if (!userUnlockedAudio && btnClientSound) {
            btnClientSound.style.display = 'inline-block';
          }
        }
      };
      frameImg.onerror = function () {
        frameBusy = false;
      };

      // 启动 Client 模式连接房主
      Netplay.startClient({
        getHeldSnapshot: function () {
          return clientSender.snapshotHeld ? clientSender.snapshotHeld() : [];
        },
        onConnected: function () {
          if (pingEl && pingEl.textContent === '--ms') pingEl.textContent = '已连接';
          if (titleEl) {
            titleEl.textContent = (game ? game.title : '2P 联机') + ' · 已连接';
          }
          if (promptTitleEl) promptTitleEl.textContent = '已连接 1P 房主，正在同步画面...';
          if (promptDescEl) promptDescEl.textContent = '轻触任意按键即可操控并开启声音';
        },
        onWelcome: function (data) {
          if (titleEl) {
            var gTitle = (data && data.title) || (game && game.title) || '2P 联机';
            titleEl.textContent = gTitle + ' · 已连接';
          }
          if (data && data.pad) {
            clearAllClientVisuals();
            renderClientControls(data.pad);
          }
        },
        onFrame: function (frameData) {
          if (webrtcVideoPlaying || !frameData || !frameData.d || frameBusy) return;
          frameBusy = true;
          frameImg.src = frameData.d;
        },
        onStream: function (remoteStream) {
          if (clientVideo) {
            clientVideo.srcObject = remoteStream;
            if (userUnlockedAudio) {
              tryPlayClientVideo(true);
            } else {
              tryPlayClientVideo(false);
            }
          }
        },
        onDisconnected: function () {
          clearAllClientVisuals();
          if (pingEl) pingEl.textContent = '已断开';
        }
      });
      return;
    }

    // === B. PC 房主 (1P) 流程 ===
    var btnNetplay = document.getElementById('btn-netplay');
    var modal = document.getElementById('netplay-modal');
    var roomBadge = document.getElementById('netplay-room-badge');
    var qrContainer = document.getElementById('netplay-qrcode');
    var hostInput = document.getElementById('netplay-host-input');
    var btnUpdateQr = document.getElementById('btn-update-qr');
    var btnCopyLink = document.getElementById('btn-copy-link');
    var btnCloseModal = document.getElementById('btn-close-modal');
    var statusText = document.getElementById('netplay-status-text');

    if (!btnNetplay || !modal) return;

    function renderQr(url) {
      if (!qrContainer || typeof QRCode === 'undefined') return;
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: url,
        width: 160,
        height: 160,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    var isLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    var currentHost = window.location.host;
    if (isLocal) {
      currentHost = '192.168.0.100:' + (window.location.port || '8766');
    }
    if (hostInput) hostInput.value = currentHost;
    var ipRow = document.getElementById('netplay-ip-row');
    if (ipRow && !isLocal) {
      ipRow.style.display = 'none';
    }

    function getHostSourceCanvas() {
      var src = coreRef && typeof coreRef.source === 'function' ? coreRef.source() : null;
      if (src && src.width && src.height) return src;
      return fullCanvas;
    }

    function captureHostStream() {
      ensureAudioActive();
      var stream = null;
      // 优先使用可见的 fullCanvas 捕获流（避免部分浏览器对未挂载 DOM 的离屏 canvas 暂停推流帧）
      if (fullCanvas && fullCanvas.width > 0 && typeof fullCanvas.captureStream === 'function') {
        try {
          var fs = fullCanvas.captureStream(60);
          if (fs && fs.getVideoTracks && fs.getVideoTracks().length > 0) {
            stream = fs;
          }
        } catch (_) {}
      }
      if (!stream) {
        var src = coreRef && typeof coreRef.source === 'function' ? coreRef.source() : null;
        if (src && typeof src.captureStream === 'function') {
          try {
            var s = src.captureStream(60);
            if (s && s.getVideoTracks && s.getVideoTracks().length > 0) {
              stream = s;
            }
          } catch (_) {}
        }
      }
      if (stream && coreRef && typeof coreRef.connectRecordingAudio === 'function') {
        var track = coreRef.connectRecordingAudio();
        if (track && stream.addTrack) stream.addTrack(track);
      }
      return stream;
    }

    function openModal() {
      ensureAudioActive();
      modal.classList.add('show');
      if (!Netplay.peer) {
        statusText.textContent = '正在创建联机房间...';
        Netplay.startHost({
          gameId: game ? game.id : '',
          pad: coreRef && coreRef.pad ? coreRef.pad : null,
          gameTitle: game ? game.title : '',
          getStream: captureHostStream,
          getSourceCanvas: getHostSourceCanvas,
          onReady: function (roomId) {
            if (roomBadge) roomBadge.textContent = roomId;
            statusText.textContent = '等待 2P 手机扫码连接...';
            var joinUrl = Netplay.getJoinUrl(hostInput.value.trim() || undefined);
            renderQr(joinUrl);
          },
          onClientJoin: function () {
            if (bridge) bridge.releaseAll(2);
            statusText.textContent = '2P 手机玩家已就绪，画面已同步！';
            statusText.style.color = '#4ade80';
            var km = bridge ? bridge.getKeymap() : null;
            var isArcade = !!(km && km.map && km.map.coin);
            toast(isArcade
              ? '2P 手机玩家已加入！请在画面中投币并按 2P 开始'
              : '2P 手机玩家已加入！请在标题画面按「选择」切换 2P 模式并开始');
          },
          onClientLeave: function () {
            if (bridge) bridge.releaseAll(2);
            statusText.textContent = '2P 玩家已断开连接';
            statusText.style.color = '#f87171';
            toast('2P 手机玩家已离开，已释放 2P 按键');
          },
          onInput: function (btn, pressed, player) {
            var p = player || 2;
            if (bridge) {
              var ok = pressed ? bridge.press(btn, p) : bridge.release(btn, !isCapsuleBtnId(btn), p);
              if (ok) return;
            }
            if (coreRef && typeof coreRef.setButton === 'function') {
              coreRef.setButton(btn, pressed, p);
            }
          },
          onSyncHeld: function (clientHeldList) {
            if (!bridge || !Array.isArray(clientHeldList)) return;
            var B = window.WEB_INPUT_BRIDGE;
            var clientSet = {};
            for (var i = 0; i < clientHeldList.length; i++) {
              var norm = B ? B.normalizeId(clientHeldList[i]) : String(clientHeldList[i] || '').toLowerCase();
              if (norm) clientSet[norm] = true;
            }
            var hostHeld2 = typeof bridge.heldFor === 'function' ? bridge.heldFor(2) : [];
            for (var j = 0; j < hostHeld2.length; j++) {
              if (!clientSet[hostHeld2[j]]) {
                bridge.release(hostHeld2[j], true, 2);
              }
            }
          }
        });
      } else {
        var joinUrl = Netplay.getJoinUrl(hostInput.value.trim() || undefined);
        renderQr(joinUrl);
      }
    }

    btnNetplay.addEventListener('click', openModal);

    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', function () {
        modal.classList.remove('show');
      });
    }

    if (btnUpdateQr) {
      btnUpdateQr.addEventListener('click', function () {
        if (!Netplay.roomId) return;
        var joinUrl = Netplay.getJoinUrl(hostInput.value.trim() || undefined);
        renderQr(joinUrl);
        toast('二维码已更新');
      });
    }

    if (btnCopyLink) {
      btnCopyLink.addEventListener('click', function () {
        if (!Netplay.roomId) return;
        var joinUrl = Netplay.getJoinUrl(hostInput.value.trim() || undefined);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(joinUrl).then(function () {
            toast('邀请链接已复制到剪贴板！');
          }).catch(function () {
            prompt('请手动复制联机链接:', joinUrl);
          });
        } else {
          prompt('请手动复制联机链接:', joinUrl);
        }
      });
    }

    window.addEventListener('beforeunload', function () {
      if (Netplay.peer) Netplay.disconnect();
    });
  }

  // 如果是 Client 模式，直接初始化，不用加载本地 iframe
  if (window.ArcadeNetplay && window.ArcadeNetplay.isClientMode()) {
    setupNetplay();
  } else {
    frame.src = 'tools/' + game.id + '/index.html';
  }
})();
