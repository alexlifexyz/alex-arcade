// shared/web/gamepad.js
// 蓝牙手柄：浏览器标准 Gamepad 映射，轮询只在状态变化时经输入桥 setButton 下发。
// 支持双手柄独立映射（1P 与 2P），纯逻辑（getGamepads 可注入），可在 Node 里做映射 / 边沿 / 断开断言。
(function (root) {
  'use strict';

  var ACTION_BUTTONS = [1, 0, 3, 2, 4, 5, 6, 7]; // B / A / Y / X / 肩键补六键
  var DIRECTION_BUTTONS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  var DEFAULT_DEADZONE = 0.25;

  function buildBindings(keymap) {
    var buttonToNorm = {};
    var used = {};

    // 方向键（手柄十字键）
    Object.keys(DIRECTION_BUTTONS).forEach(function (idx) {
      var norm = DIRECTION_BUTTONS[idx];
      if (keymap.map[norm]) {
        buttonToNorm[idx] = norm;
        used[idx] = true;
      }
    });

    // 功能键：8 选择 / 投币，9 开始
    var order = keymap.order;
    var pick = function (names) {
      for (var i = 0; i < order.length; i++) {
        if (names.indexOf(order[i]) >= 0 && keymap.map[order[i]].kind === 'capsule') return order[i];
      }
      return null;
    };
    var first = pick(['select', 'coin']);
    var start = pick(['start']);
    if (first) buttonToNorm[8] = first;
    if (start) buttonToNorm[9] = start;
    // 没有标准命名时，按 capsules 顺序补 8 / 9
    var caps = order.filter(function (n) { return keymap.map[n].kind === 'capsule'; });
    if (!first && caps[0]) buttonToNorm[8] = caps[0];
    if (!start && caps[1]) buttonToNorm[9] = caps[1];

    // 动作键：按 pad 顺序分配，避开已占用
    var actions = order.filter(function (n) { return keymap.map[n].kind === 'action'; });
    var cursor = 0;
    for (var a = 0; a < actions.length; a++) {
      while (cursor < ACTION_BUTTONS.length && buttonToNorm[ACTION_BUTTONS[cursor]]) cursor++;
      if (cursor >= ACTION_BUTTONS.length) break;
      buttonToNorm[ACTION_BUTTONS[cursor]] = actions[a];
      cursor++;
    }
    return { buttonToNorm: buttonToNorm, actions: actions, caps: caps };
  }

  function createGamepad(opts) {
    opts = opts || {};
    var bridge = opts.bridge;
    var keymap = opts.keymap;
    var bindings = buildBindings(keymap);
    var deadzone = typeof opts.deadzone === 'number' ? opts.deadzone : DEFAULT_DEADZONE;
    var getGamepads = opts.getGamepads || function () {
      return (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    };
    var secure = typeof opts.isSecure === 'boolean'
      ? opts.isSecure
      : (typeof window !== 'undefined' ? !!window.isSecureContext : true);

    var prevPads = [{}, {}]; // 索引 0: 1P, 索引 1: 2P
    var padInfo = [{ connected: false, id: '', active: 0 }, { connected: false, id: '', active: 0 }];

    function buttonPressed(pad, idx) {
      var b = pad.buttons && pad.buttons[idx];
      if (!b) return false;
      return !!(b.pressed || (typeof b.value === 'number' && b.value > 0.5));
    }

    function desiredSet(pad) {
      var set = {};
      Object.keys(bindings.buttonToNorm).forEach(function (idx) {
        if (buttonPressed(pad, idx)) set[bindings.buttonToNorm[idx]] = true;
      });
      var axes = pad.axes || [];
      var ax = axes[0] || 0;
      var ay = axes[1] || 0;
      if (ax < -deadzone && keymap.map.left) set.left = true;
      if (ax > deadzone && keymap.map.right) set.right = true;
      if (ay < -deadzone && keymap.map.up) set.up = true;
      if (ay > deadzone && keymap.map.down) set.down = true;
      return set;
    }

    function releasePad(pIdx) {
      var p = pIdx + 1;
      var prev = prevPads[pIdx] || {};
      Object.keys(prev).forEach(function (norm) {
        if (prev[norm]) bridge.release(norm, true, p);
      });
      prevPads[pIdx] = {};
      padInfo[pIdx] = { connected: false, id: '', active: 0 };
    }

    function poll() {
      var rawPads = [];
      try { rawPads = getGamepads() || []; } catch (err) { rawPads = []; }
      var activePads = [];
      for (var i = 0; i < rawPads.length; i++) {
        if (rawPads[i] && rawPads[i].connected !== false) {
          activePads.push(rawPads[i]);
        }
      }

      for (var pIdx = 0; pIdx < 2; pIdx++) {
        var pad = activePads[pIdx];
        var p = pIdx + 1;
        var prev = prevPads[pIdx] || {};

        if (!pad) {
          if (padInfo[pIdx].connected) releasePad(pIdx);
          continue;
        }

        padInfo[pIdx].connected = true;
        padInfo[pIdx].id = pad.id ? pad.id.split('(')[0].trim() : (pad.index != null ? String(pad.index) : 'gamepad' + p);

        var desired = desiredSet(pad);
        Object.keys(desired).forEach(function (norm) {
          if (!prev[norm]) { bridge.press(norm, p); prev[norm] = true; }
        });
        Object.keys(prev).forEach(function (norm) {
          if (prev[norm] && !desired[norm]) { bridge.release(norm, false, p); prev[norm] = false; }
        });
        prevPads[pIdx] = prev;
        padInfo[pIdx].active = Object.keys(prev).filter(function (n) { return prev[n]; }).length;
      }
      return status();
    }

    function status() {
      var connCount = (padInfo[0].connected ? 1 : 0) + (padInfo[1].connected ? 1 : 0);
      var summary = '';
      if (connCount === 0) {
        summary = '未检测到手柄';
      } else if (connCount === 1) {
        summary = '1P: ' + padInfo[0].id + (padInfo[0].active ? ' (' + padInfo[0].active + ' 键按住)' : '');
      } else {
        summary = '1P: ' + padInfo[0].id + ' | 2P: ' + padInfo[1].id;
      }
      return {
        connected: connCount > 0,
        count: connCount,
        secure: secure,
        id: padInfo[0].connected ? padInfo[0].id : (padInfo[1].connected ? padInfo[1].id : ''),
        summary: summary,
        p1: padInfo[0],
        p2: padInfo[1],
        active: padInfo[0].active + padInfo[1].active,
        bindings: bindings.buttonToNorm
      };
    }

    return {
      poll: poll,
      status: status,
      disconnect: function () { releasePad(0); releasePad(1); },
      bindings: bindings,
      deadzone: deadzone
    };
  }

  var api = {
    buildBindings: buildBindings,
    createGamepad: createGamepad,
    ACTION_BUTTONS: ACTION_BUTTONS,
    DIRECTION_BUTTONS: DIRECTION_BUTTONS,
    DEFAULT_DEADZONE: DEFAULT_DEADZONE
  };
  root.WEB_GAMEPAD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
