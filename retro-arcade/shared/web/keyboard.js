// shared/web/keyboard.js
// 网页播放器 PC 键盘输入绑定：将物理按键按当前游戏 pad 智能映射为逻辑键并下发至 input-bridge。
// 采用捕获阶段唯一接管 + stopImmediatePropagation，彻底阻断与底层 iframe 的双份按键冲突；
// 方向与动作键松手 0ms 即时释放（不挂 150ms Hold Buffer），保证坦克微操与马里奥轻跳跟手。
(function (root) {
  'use strict';

  var DIR_MAP_P1 = {
    'KeyW': 'up', 'ArrowUp': 'up',
    'KeyS': 'down', 'ArrowDown': 'down',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right'
  };

  var FUNC_MAP_P1 = {
    'KeyQ': 'l',
    'KeyE': 'r',
    'Enter': 'start',
    'Digit1': 'start',
    'Space': 'select',
    'ShiftLeft': 'select',
    'ShiftRight': 'select',
    'Digit5': 'coin'
  };

  var DIR_MAP_P2 = {
    'Numpad8': 'up',
    'Numpad5': 'down',
    'Numpad2': 'down',
    'Numpad4': 'left',
    'Numpad6': 'right'
  };

  var FUNC_MAP_P2 = {
    'NumpadEnter': 'start',
    'NumpadAdd': 'select'
  };

  function normalizeCode(e) {
    if (e.code) return e.code;
    var k = String(e.key || '').toLowerCase();
    var fallback = {
      'enter': 'Enter',
      ' ': 'Space', 'space': 'Space', 'spacebar': 'Space',
      'shift': 'ShiftLeft',
      'w': 'KeyW', 's': 'KeyS', 'a': 'KeyA', 'd': 'KeyD',
      'j': 'KeyJ', 'k': 'KeyK', 'l': 'KeyL',
      'u': 'KeyU', 'i': 'KeyI', 'o': 'KeyO',
      'z': 'KeyZ', 'x': 'KeyX', 'c': 'KeyC', 'v': 'KeyV',
      'q': 'KeyQ', 'e': 'KeyE',
      '1': 'Digit1', '5': 'Digit5',
      'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown',
      'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight'
    };
    return fallback[k] || '';
  }

  function detectLayoutFamily(keymap) {
    var m = (keymap && keymap.map) || {};
    if (m.lp && m.lk) return 'six';
    if (m.y && m.b && m.a) return 'arcade4';
    if (m.tb || m.ta) return 'turbo4';
    return 'standard';
  }

  function resolveCapsuleAlias(norm, m) {
    if (m[norm]) return norm;
    if (norm === 'select' && m.coin) return 'coin';
    if (norm === 'coin' && m.select) return 'select';
    return norm;
  }

  function resolveP1(code, keymap) {
    var m = (keymap && keymap.map) || {};
    if (DIR_MAP_P1[code]) return DIR_MAP_P1[code];
    if (FUNC_MAP_P1[code]) return resolveCapsuleAlias(FUNC_MAP_P1[code], m);

    var family = detectLayoutFamily(keymap);
    if (family === 'six') {
      var sixMap = {
        'KeyU': 'lp', 'KeyI': 'mp', 'KeyO': 'hp',
        'KeyJ': 'lk', 'KeyK': 'mk', 'KeyL': 'hk',
        'KeyZ': 'lk', 'KeyX': 'mk', 'KeyC': 'hk'
      };
      return sixMap[code] || null;
    }
    if (family === 'arcade4') {
      var arcMap = {
        'KeyJ': 'y', 'KeyZ': 'y',
        'KeyK': 'b', 'KeyX': 'b',
        'KeyL': 'a', 'KeyC': 'a',
        'KeyU': 'x', 'KeyV': 'x', 'KeyI': 'a'
      };
      return arcMap[code] || null;
    }
    if (family === 'turbo4') {
      var tbMap = {
        'KeyJ': 'b', 'KeyZ': 'b',
        'KeyK': 'a', 'KeyX': 'a',
        'KeyU': 'tb', 'KeyC': 'tb',
        'KeyI': 'ta', 'KeyV': 'ta', 'KeyL': 'a'
      };
      return tbMap[code] || null;
    }

    // 标准两键 / 三键 (FC / GB / GBA：J=左键B开火/冲刺，K=右键A跳跃/单发，与虚拟键标注一致)
    var stdMap = {
      'KeyJ': m.b ? 'b' : (keymap && keymap.order ? keymap.order.find(function (n) { return m[n].kind === 'action'; }) : 'b'),
      'KeyZ': m.b ? 'b' : 'a',
      'KeyK': m.a ? 'a' : 'b',
      'KeyX': m.a ? 'a' : 'b',
      'KeyL': m.a ? 'a' : null,
      'KeyU': m.x ? 'x' : (m.tb ? 'tb' : null),
      'KeyC': m.x ? 'x' : null,
      'KeyI': m.y ? 'y' : (m.ta ? 'ta' : null),
      'KeyV': m.y ? 'y' : null
    };
    return stdMap[code] || null;
  }

  function resolveP2(code, keymap) {
    var m = (keymap && keymap.map) || {};
    if (DIR_MAP_P2[code]) return DIR_MAP_P2[code];
    if (FUNC_MAP_P2[code]) return resolveCapsuleAlias(FUNC_MAP_P2[code], m);

    var family = detectLayoutFamily(keymap);
    if (family === 'six') {
      var six2 = { 'Numpad1': 'lk', 'Numpad3': 'mk', 'Numpad0': 'lp', 'NumpadDecimal': 'hp' };
      return six2[code] || null;
    }
    if (family === 'arcade4') {
      var arc2 = { 'Numpad1': 'y', 'Numpad3': 'b', 'Numpad0': 'a', 'NumpadDecimal': 'x' };
      return arc2[code] || null;
    }
    if (family === 'turbo4') {
      var tb2 = { 'Numpad1': 'b', 'Numpad3': 'a', 'Numpad0': 'tb', 'NumpadDecimal': 'ta' };
      return tb2[code] || null;
    }
    var std2 = {
      'Numpad1': m.b ? 'b' : 'a',
      'Numpad3': m.a ? 'a' : 'b',
      'Numpad0': m.x ? 'x' : 'a',
      'NumpadDecimal': m.y ? 'y' : 'b'
    };
    return std2[code] || null;
  }

  function describeHint(keymap) {
    var m = (keymap && keymap.map) || {};
    var family = detectLayoutFamily(keymap);
    var coinHint = m.coin ? '5/Shift/空格 投币' : 'Shift 选择';
    if (family === 'six') {
      return '键盘：WASD/方向键移动 · U/I/O 轻中重拳 · J/K/L 轻中重脚 · Enter 开始 · ' + coinHint;
    }
    if (family === 'arcade4') {
      return '键盘：WASD/方向键移动 · J 攻击 · K 跳跃 · L 必杀 · U 连发 · Enter 开始 · ' + coinHint;
    }
    if (family === 'turbo4') {
      return '键盘：WASD/方向键移动 · J 开火 · K 跳跃 · U 连发 · I 连跳 · Enter 开始 · ' + coinHint;
    }
    return '键盘：WASD/方向键移动 · J 主键(B) · K 副键(A) · Enter 开始 · ' + coinHint;
  }

  function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var tag = String(el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function createKeyboard(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var attachedTargets = [];

    function isInputFocused(e) {
      if (e && isEditableElement(e.target)) return true;
      if (doc && isEditableElement(doc.activeElement)) return true;
      return false;
    }

    function stopEvent(e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      else if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    function isCapsuleNorm(norm, keymap) {
      var m = (keymap && keymap.map) || {};
      if (m[norm] && m[norm].kind === 'capsule') return true;
      return norm === 'start' || norm === 'select' || norm === 'coin';
    }

    function onKeyDown(e) {
      if (!e || isInputFocused(e) || !bridge) return;
      var code = normalizeCode(e);
      if (!code) return;
      var keymap = bridge.getKeymap();

      var p1Norm = resolveP1(code, keymap);
      if (p1Norm && bridge.press(p1Norm, 1)) {
        stopEvent(e);
        return;
      }

      var p2Norm = resolveP2(code, keymap);
      if (p2Norm && bridge.press(p2Norm, 2)) {
        stopEvent(e);
      }
    }

    function onKeyUp(e) {
      if (!e || isInputFocused(e) || !bridge) return;
      var code = normalizeCode(e);
      if (!code) return;
      var keymap = bridge.getKeymap();

      var p1Norm = resolveP1(code, keymap);
      if (p1Norm && keymap.map[p1Norm]) {
        bridge.release(p1Norm, !isCapsuleNorm(p1Norm, keymap), 1);
        stopEvent(e);
        return;
      }

      var p2Norm = resolveP2(code, keymap);
      if (p2Norm && keymap.map[p2Norm]) {
        bridge.release(p2Norm, !isCapsuleNorm(p2Norm, keymap), 2);
        stopEvent(e);
      }
    }

    function addTarget(target) {
      if (!target || typeof target.addEventListener !== 'function') return;
      if (attachedTargets.indexOf(target) >= 0) return;
      target.addEventListener('keydown', onKeyDown, { capture: true, passive: false });
      target.addEventListener('keyup', onKeyUp, { capture: true, passive: false });
      attachedTargets.push(target);
    }

    function attach() {
      detach();
      addTarget(win);
      try {
        var frame = doc && typeof doc.getElementById === 'function' ? doc.getElementById('game-frame') : null;
        if (frame && frame.contentWindow && frame.contentWindow !== win) {
          addTarget(frame.contentWindow);
        }
      } catch (_) {}
    }

    function detach() {
      for (var i = 0; i < attachedTargets.length; i++) {
        var t = attachedTargets[i];
        try {
          t.removeEventListener('keydown', onKeyDown, { capture: true });
          t.removeEventListener('keyup', onKeyUp, { capture: true });
          t.removeEventListener('keydown', onKeyDown);
          t.removeEventListener('keyup', onKeyUp);
        } catch (_) {}
      }
      attachedTargets = [];
    }

    return {
      attach: attach,
      detach: detach,
      setBridge: function (b) { bridge = b; },
      onKeyDown: onKeyDown,
      onKeyUp: onKeyUp
    };
  }

  var api = {
    detectLayoutFamily: detectLayoutFamily,
    resolveP1: resolveP1,
    resolveP2: resolveP2,
    describeHint: describeHint,
    createKeyboard: createKeyboard
  };

  root.WEB_KEYBOARD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
