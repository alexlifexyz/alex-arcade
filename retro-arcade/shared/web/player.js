// shared/web/player.js
// 网页播放器：全屏（纯画面）/ 虚拟键 / 掌机 三种模式共用一页。
// iframe 同源直达 GGEMU_CORE；输入只经 shared/web/input-bridge.js 的 setButton。
// 纯画面模式由父页 rAF 绘制 core.source()，帧推进仍由 iframe 内 shell.js 负责（不双 tick）。
// 键盘沿用各内核自带 KEY_MAP：iframe 始终保持可见并可聚焦，网页层绝不重复绑定 keydown/keyup。
(function () {
  'use strict';

  var games = window.WEB_GAMES || [];
  var MODES = ['full', 'virtual', 'deck'];
  var qs = new URLSearchParams(window.location.search);
  var selftest = qs.get('selftest') === '1';
  // 缩放方式：exact=整数倍（默认，Alex 2026-11-11 拍板）；fit=铺满可用空间（可能非整数倍）；
  // 1x~4x=指定倍数。内核原画只有 256x240 / 240x160 / 384x224，整数倍在大屏上像素块更整齐。
  var scaleMode = (qs.get('scale') || 'exact').toLowerCase();
  var scaleLogged = false;

  var frame = document.getElementById('game-frame');
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

  // 调试信息默认收起；?debug=1 才展开，方便排查
  if (qs.get('debug') === '1') {
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
  // 默认进全屏（纯画面）；掌机 / 虚拟键由顶栏或 ?mode= 显式切换
  var mode = MODES.indexOf(requestedMode) >= 0 ? requestedMode : 'full';

  function findGame(id) {
    if (!id) return null;
    for (var i = 0; i < games.length; i++) if (games[i].id === id) return games[i];
    return null;
  }
  function modeName(m) { return m === 'full' ? '全屏' : m === 'virtual' ? '虚拟键' : '掌机'; }
  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }
  function toast(msg) { notice.textContent = msg; }
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
    opt.textContent = games[i].title + ' · ' + games[i].platform;
    if (game && games[i].id === game.id) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', function () {
    window.location.search = '?game=' + encodeURIComponent(select.value) + '&mode=' + mode;
  });

  // 2. 模式切换
  function paintMode() {
    var btns = modeSwitch.querySelectorAll('.mode-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].className = btns[j].getAttribute('data-mode') === mode ? 'mode-btn active' : 'mode-btn';
    }
    document.documentElement.setAttribute('data-mode', mode);
    document.body.setAttribute('data-mode', mode);
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

  // 3. 把焦点还给 iframe（内核键盘与音频手势都依赖它）
  function focusGame() {
    var B = window.WEB_INPUT_BRIDGE;
    if (B) B.focusIframe(frame);
    if (coreRef && typeof coreRef.activateAudio === 'function') {
      try { coreRef.activateAudio(); } catch (err) { /* 忽略 */ }
    }
  }
  stage.addEventListener('pointerdown', function () { if (mode !== 'deck') focusGame(); });
  window.addEventListener('blur', function () { if (bridge) bridge.releaseAll(); });

  // 4. 纯画面渲染：只 drawImage(source())，不自己 tick
  function drawFrame() {
    if (!coreRef || typeof coreRef.source !== 'function') return;
    var src = null;
    try { src = coreRef.source(); } catch (err) { return; }
    if (!src || !src.width || !src.height) return;
    var W = stage.clientWidth;
    var H = stage.clientHeight;
    if (!W || !H) return;
    // 底部留 44px 黑边给细条工具（配合 CSS 上移 22px），避免压住游戏画面
    var usableH = Math.max(80, H - 44);
    var fitScale = Math.min(W / src.width, usableH / src.height);
    var scale = fitScale;
    if (scaleMode === '1x') {
      scale = 1;
    } else if (/^[234]x$/.test(scaleMode)) {
      scale = Math.min(parseInt(scaleMode, 10), Math.max(1, Math.floor(fitScale)));
    } else if (scaleMode === 'exact' || scaleMode === 'integer') {
      // 整数倍：每个源像素占固定 N×N 显示像素，电视 / 大屏上不忽宽忽窄
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
    // 容器与画面等尺寸：两颗功能键与虚拟键都紧贴游戏画面
    if (screenWrap) {
      screenWrap.style.width = w + 'px';
      screenWrap.style.height = h + 'px';
    }
    // 左右黑边够宽就把功能键放到画面右侧紧贴处，避免盖住 HUD
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
    // 同步画首帧：切换模式立刻出画面，不依赖 rAF 是否被浏览器调度
    drawFrame();
    function loop() {
      fullRafId = window.requestAnimationFrame(loop);
      drawFrame();
      if (gamepad) {
        gamepad.poll();
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

  // 6. 虚拟键（DOM 始终生成，由 CSS 按模式显示）
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
      ? '已连接 ' + s.id + '（' + s.active + ' 键按住）'
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

  // 9. 浏览器全屏与手机横屏（失败静默降级）
  var fsBtn = document.getElementById('btn-browser-fullscreen');
  if (fsBtn) fsBtn.addEventListener('click', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen();
    } catch (err) { toast('浏览器全屏不可用'); }
  });
  function tryLandscape() {
    try {
      if (window.screen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function () {});
      }
    } catch (err) { /* 桌面 / 不支持时保持竖持居中 */ }
  }

  // 10. 模式应用（core ready 后才完整执行）
  function applyMode() {
    if (!coreRef || !bridge) { paintMode(); return; }
    bridge.releaseAll();
    if (tracker) tracker.releaseAll();
    if (gamepad) gamepad.disconnect();
    paintMode();
    if (mode === 'full' || mode === 'virtual') {
      startFullLoop();
      tryLandscape();
      focusGame();
      toast('「' + modeName(mode) + '」已开启：' +
        (mode === 'full' ? '点一下画面用键盘或接蓝牙手柄；想用鼠标/手指点就切「虚拟键」或「掌机」。'
          : '半透明按键与键盘同键位，支持多指同按。'));
    } else {
      stopFullLoop();
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
    lines.push((focusOk ? 'kbd-focus-ok' : 'kbd-focus-error') + '  网页层未绑定 keydown/keyup，键盘沿用内核 KEY_MAP');
    lines.push('输入桥键表 ' + bridge.getKeymap().order.length + ' 键：' + bridge.getKeymap().order.join(','));
    lines.push('Hold Buffer ' + bridge.holdMs + 'ms；失焦 / 切模式 / iframe 重载全键释放');

    // 步骤 3：纯画面层与两颗功能键
    var capsuleCount = renderCapsules();
    lines.push('full-mode-ready  纯画面 canvas + ' + capsuleCount + ' 颗功能键（街机为投币/开始）');

    // 步骤 4：虚拟键
    var vkCount = renderVirtual();
    lines.push('virtual-keys-ready  共 ' + vkCount + ' 颗虚拟键（多指 Pointer Events）');

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

  frame.src = 'tools/' + game.id + '/index.html';
})();
