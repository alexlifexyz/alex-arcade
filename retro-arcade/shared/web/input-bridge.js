// shared/web/input-bridge.js
// 统一输入桥：把「逻辑键」翻译成该游戏 GGEMU_CORE.pad 里的原始按键 id，
// 唯一出口是 core.setButton(rawId, pressed)。
// 键盘沿用各内核自带的 KEY_MAP，本桥绝不监听 keydown/keyup，避免双份输入。
// 虚拟键（步骤 4）与 Gamepad（步骤 5）都接在这里；本模块不依赖 DOM，可在 Node 里纯内存测试。
(function (root) {
  'use strict';

  var DIRECTIONS = ['up', 'down', 'left', 'right'];
  var DEFAULT_HOLD_MS = 150; // 约 8 帧 @60fps，防极短轻触漏帧

  function normalizeId(raw) {
    return String(raw == null ? '' : raw).toLowerCase().replace(/^btn-/, '');
  }

  // 逻辑键表：norm -> { rawId, norm, label, kind }
  // 下发必须用 rawId：CPS1 的 setButton 只认 'lp'/'coin' 这类原值，传规整化后的 id 会失效。
  function buildKeymap(pad) {
    var map = {};
    var order = [];
    function add(rawId, label, kind) {
      if (!rawId) return;
      var norm = normalizeId(rawId);
      if (!norm) return;
      if (!map[norm]) {
        map[norm] = { rawId: rawId, norm: norm, label: label || norm, kind: kind };
        order.push(norm);
      }
    }
    for (var d = 0; d < DIRECTIONS.length; d++) {
      add(DIRECTIONS[d], DIRECTIONS[d], 'direction');
    }
    var groups = [['actions', 'action'], ['capsules', 'capsule'], ['shoulders', 'shoulder']];
    for (var g = 0; g < groups.length; g++) {
      var list = (pad && pad[groups[g][0]]) || [];
      for (var i = 0; i < list.length; i++) {
        add(list[i].id, list[i].label, groups[g][1]);
      }
    }
    return { map: map, order: order };
  }

  function createBridge(opts) {
    opts = opts || {};
    var core = opts.core || null;
    var keymap = buildKeymap(opts.pad);
    var holdMs = typeof opts.holdMs === 'number' ? opts.holdMs : DEFAULT_HOLD_MS;
    var now = opts.now || function () { return Date.now(); };
    var setTimer = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimeout || function (id) { return clearTimeout(id); };
    var held = {}; // key: norm + '@' + player -> { since, pendingRelease, entry, norm, player }
    var log = [];  // 下发记录，供测试与页面诊断

    function send(entry, pressed, player) {
      if (!core || typeof core.setButton !== 'function') return false;
      var p = player || 1;
      try {
        core.setButton(entry.rawId, !!pressed, p);
        log.push({ id: entry.rawId, pressed: !!pressed, player: p, t: now() });
        return true;
      } catch (err) {
        log.push({ id: entry.rawId, error: String(err), player: p, t: now() });
        return false;
      }
    }

    function press(normOrRaw, player) {
      var p = player || 1;
      var norm = normalizeId(normOrRaw);
      var entry = keymap.map[norm];
      if (!entry) return false;
      var key = norm + '@' + p;
      var h = held[key];
      if (h && h.pendingRelease) {
        clearTimer(h.pendingRelease);
        h.pendingRelease = null;
      }
      if (!h) {
        held[key] = { since: now(), pendingRelease: null, entry: entry, norm: norm, player: p };
        send(entry, true, p);
      }
      return true;
    }

    function release(normOrRaw, immediate, player) {
      var p = player || 1;
      var norm = normalizeId(normOrRaw);
      var entry = keymap.map[norm];
      var key = norm + '@' + p;
      var h = held[key];
      if (!entry || !h) return false;
      var wait = holdMs - (now() - h.since);
      if (!immediate && wait > 0) {
        if (h.pendingRelease) clearTimer(h.pendingRelease);
        h.pendingRelease = setTimer(function () {
          var cur = held[key];
          if (!cur) return;
          delete held[key];
          send(entry, false, p);
        }, wait);
        return true;
      }
      if (h.pendingRelease) {
        clearTimer(h.pendingRelease);
        h.pendingRelease = null;
      }
      delete held[key];
      send(entry, false, p);
      return true;
    }

    function releaseAll(targetPlayer) {
      var filterPlayer = (typeof targetPlayer === 'number') ? targetPlayer : null;
      var keys = Object.keys(held);
      var count = 0;
      for (var i = 0; i < keys.length; i++) {
        var h = held[keys[i]];
        if (!h) continue;
        if (filterPlayer && h.player !== filterPlayer) continue;
        if (h.pendingRelease) clearTimer(h.pendingRelease);
        delete held[keys[i]];
        send(h.entry, false, h.player);
        count++;
      }
      return count;
    }

    function attach(win, doc, frame) {
      if (!win || typeof win.addEventListener !== 'function') return false;
      win.addEventListener('blur', releaseAll);
      win.addEventListener('webplayer:modechange', releaseAll);
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', function () {
          if (doc.hidden) releaseAll();
        });
      }
      if (frame && typeof frame.addEventListener === 'function') {
        frame.addEventListener('load', releaseAll);
      }
      // 故意不注册 keydown / keyup：内核自带 KEY_MAP 已经在 iframe 内推动游戏。
      return true;
    }

    return {
      keymap: keymap,
      press: press,
      release: release,
      releaseAll: releaseAll,
      handleBlur: releaseAll,
      handleModeChange: releaseAll,
      handleReload: releaseAll,
      held: function () { return Object.keys(held).map(function (k) { return held[k].norm; }); },
      log: log,
      holdMs: holdMs,
      attach: attach,
      setCore: function (c) { core = c; },
      setPad: function (p) { releaseAll(); keymap = buildKeymap(p); },
      getKeymap: function () { return keymap; },
      getCore: function () { return core; }
    };
  }

  function focusIframe(frame) {
    if (!frame || !frame.contentWindow) return false;
    try {
      frame.contentWindow.focus();
      return true;
    } catch (err) {
      return false;
    }
  }

  var api = {
    normalizeId: normalizeId,
    buildKeymap: buildKeymap,
    createBridge: createBridge,
    focusIframe: focusIframe,
    DIRECTIONS: DIRECTIONS,
    DEFAULT_HOLD_MS: DEFAULT_HOLD_MS
  };

  root.WEB_INPUT_BRIDGE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
