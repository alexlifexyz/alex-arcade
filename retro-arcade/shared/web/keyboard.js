// shared/web/keyboard.js
// 网页播放器 PC 键盘输入绑定：将键盘按键映射为逻辑键，分发至 input-bridge
// 1P: WASD/方向键移动，J/Z射击，K/X连发，Enter开始，Shift/空格选择/投币
// 2P: 小键盘数字区双打
(function (root) {
  'use strict';

  var KEY_MAP_P1 = {
    // 移动
    'KeyW': 'up', 'ArrowUp': 'up',
    'KeyS': 'down', 'ArrowDown': 'down',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    // 动作 (A: 点射/确认, B: 连发/取消, X/Y: 重拳/辅助)
    'KeyJ': 'a', 'KeyZ': 'a',
    'KeyK': 'b', 'KeyX': 'b',
    'KeyU': 'x', 'KeyC': 'x',
    'KeyI': 'y', 'KeyV': 'y',
    'KeyQ': 'l', 'KeyE': 'r',
    // 功能 (开始 & 投币/选择)
    'Enter': 'start', 'Digit1': 'start',
    'Space': 'select', 'ShiftLeft': 'select', 'ShiftRight': 'select', 'Digit5': 'select'
  };

  var KEY_MAP_P2 = {
    'Numpad8': 'up',
    'Numpad5': 'down', 'Numpad2': 'down',
    'Numpad4': 'left',
    'Numpad6': 'right',
    'Numpad1': 'a',
    'Numpad3': 'b',
    'Numpad0': 'x',
    'NumpadDecimal': 'y',
    'NumpadEnter': 'start',
    'NumpadAdd': 'select'
  };

  function createKeyboard(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);

    function resolveKey(norm, keymap) {
      if (!keymap || !keymap.map) return norm;
      if (keymap.map[norm]) return norm;
      // 智能别名降级：select 没有时寻找 coin
      if (norm === 'select' && keymap.map['coin']) return 'coin';
      if (norm === 'coin' && keymap.map['select']) return 'select';
      return norm;
    }

    function isInputFocused() {
      if (!doc || !doc.activeElement) return false;
      var tag = doc.activeElement.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function onKeyDown(e) {
      if (!e) return;
      if (isInputFocused()) return;
      var code = e.code;
      // 兼容老旧浏览器、Mac/Win 差异以及 key 兜底
      if (!code) {
        var k = String(e.key || '').toLowerCase();
        if (k === 'enter') code = 'Enter';
        else if (k === ' ' || k === 'space' || k === 'spacebar') code = 'Space';
        else if (k === 'shift') code = 'ShiftLeft';
        else if (k === 'w') code = 'KeyW';
        else if (k === 's') code = 'KeyS';
        else if (k === 'a') code = 'KeyA';
        else if (k === 'd') code = 'KeyD';
        else if (k === 'j') code = 'KeyJ';
        else if (k === 'k') code = 'KeyK';
        else if (k === 'arrowup') code = 'ArrowUp';
        else if (k === 'arrowdown') code = 'ArrowDown';
        else if (k === 'arrowleft') code = 'ArrowLeft';
        else if (k === 'arrowright') code = 'ArrowRight';
      }
      var keymap = bridge ? bridge.getKeymap() : null;

      // 检查 1P
      var target1P = KEY_MAP_P1[code];
      if (target1P) {
        var resolved = resolveKey(target1P, keymap);
        if (bridge && bridge.press(resolved, 1)) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
      }

      // 检查 2P
      var target2P = KEY_MAP_P2[code];
      if (target2P) {
        var resolved2 = resolveKey(target2P, keymap);
        if (bridge && bridge.press(resolved2, 2)) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
      }
    }

    function onKeyUp(e) {
      if (!e) return;
      if (isInputFocused()) return;
      var code = e.code;
      if (!code) {
        var k = String(e.key || '').toLowerCase();
        if (k === 'enter') code = 'Enter';
        else if (k === ' ' || k === 'space' || k === 'spacebar') code = 'Space';
        else if (k === 'shift') code = 'ShiftLeft';
        else if (k === 'w') code = 'KeyW';
        else if (k === 's') code = 'KeyS';
        else if (k === 'a') code = 'KeyA';
        else if (k === 'd') code = 'KeyD';
        else if (k === 'j') code = 'KeyJ';
        else if (k === 'k') code = 'KeyK';
        else if (k === 'arrowup') code = 'ArrowUp';
        else if (k === 'arrowdown') code = 'ArrowDown';
        else if (k === 'arrowleft') code = 'ArrowLeft';
        else if (k === 'arrowright') code = 'ArrowRight';
      }
      var keymap = bridge ? bridge.getKeymap() : null;

      var target1P = KEY_MAP_P1[code];
      if (target1P) {
        var resolved = resolveKey(target1P, keymap);
        if (bridge) {
          bridge.release(resolved, false, 1);
          if (typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
      }

      var target2P = KEY_MAP_P2[code];
      if (target2P) {
        var resolved2 = resolveKey(target2P, keymap);
        if (bridge) {
          bridge.release(resolved2, false, 2);
          if (typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
      }
    }

    function attach() {
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('keydown', onKeyDown, { passive: false });
        win.addEventListener('keyup', onKeyUp, { passive: false });
      }
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('keydown', onKeyDown, { passive: false });
        doc.addEventListener('keyup', onKeyUp, { passive: false });
      }
      try {
        var frame = doc && doc.getElementById('game-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.addEventListener('keydown', onKeyDown, { passive: false });
          frame.contentWindow.addEventListener('keyup', onKeyUp, { passive: false });
        }
      } catch (_) {}
    }

    function detach() {
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('keydown', onKeyDown);
        win.removeEventListener('keyup', onKeyUp);
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('keydown', onKeyDown);
        doc.removeEventListener('keyup', onKeyUp);
      }
      try {
        var frame = doc && doc.getElementById('game-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.removeEventListener('keydown', onKeyDown);
          frame.contentWindow.removeEventListener('keyup', onKeyUp);
        }
      } catch (_) {}
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
    KEY_MAP_P1: KEY_MAP_P1,
    KEY_MAP_P2: KEY_MAP_P2,
    createKeyboard: createKeyboard
  };

  root.WEB_KEYBOARD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
