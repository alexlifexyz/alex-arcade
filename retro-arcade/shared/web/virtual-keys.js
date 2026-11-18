// shared/web/virtual-keys.js
// 虚拟键 / 手机触控手柄：按 GGEMU_CORE.pad 动态生成人体工学触控手柄（8向滑动十字键 + 动作键 + 功能胶囊键），
// 支持 Pointer Events 多指同按与拇指连续滑动，统一走输入桥 core.setButton。
// createTracker 与 layout 保持纯逻辑（无 DOM），可在 Node 里做多指断言。
(function (root) {
  'use strict';

  // 键帽上显示的键盘提示（与内核自带 KEY_MAP 对齐）
  var KEY_LABELS = {
    up: 'W/↑', down: 'S/↓', left: 'A/←', right: 'D/→',
    a: 'K', b: 'J', tb: 'U', ta: 'I',
    x: 'U', y: 'J', l: 'Q', r: 'E',
    select: 'Shift', start: 'Enter', coin: '5',
    lp: 'U', mp: 'I', hp: 'O', lk: 'J', mk: 'K', hk: 'L'
  };

  var DIR_SYMBOLS = {
    up: '▲',
    down: '▼',
    left: '◀',
    right: '▶'
  };

  var DPAD_SECTORS = [
    ['right'],
    ['down', 'right'],
    ['down'],
    ['down', 'left'],
    ['left'],
    ['up', 'left'],
    ['up'],
    ['up', 'right']
  ];

  function resolveDpadDirections(nx, ny, deadzone) {
    var dz = typeof deadzone === 'number' ? deadzone : 0.22;
    var mag = Math.sqrt(nx * nx + ny * ny);
    if (!isFinite(mag) || mag < dz) return [];
    var sector = (Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) % 8 + 8) % 8;
    return DPAD_SECTORS[sector].slice();
  }

  function createTracker(bridge) {
    var pointers = {}; // pointerId -> norm
    var counts = {};   // norm -> 按住的指针数
    var dpadHeld = {}; // dir -> true (供 8 向滑动十字键独立管理)

    function press(pointerId, norm) {
      if (!norm) return false;
      var prev = pointers[pointerId];
      if (prev === norm) return false;
      if (prev != null) release(pointerId);
      pointers[pointerId] = norm;
      counts[norm] = (counts[norm] || 0) + 1;
      if (counts[norm] === 1) bridge.press(norm);
      return true;
    }

    function release(pointerId) {
      var norm = pointers[pointerId];
      if (norm == null) return false;
      delete pointers[pointerId];
      counts[norm] = Math.max(0, (counts[norm] || 1) - 1);
      if (counts[norm] === 0) bridge.release(norm);
      return true;
    }

    function setDpadDirs(nextDirs) {
      var nextMap = {};
      if (Array.isArray(nextDirs)) {
        for (var i = 0; i < nextDirs.length; i++) {
          if (nextDirs[i]) nextMap[nextDirs[i]] = true;
        }
      }
      var prevKeys = Object.keys(dpadHeld);
      for (var p = 0; p < prevKeys.length; p++) {
        var dir = prevKeys[p];
        if (!nextMap[dir]) {
          delete dpadHeld[dir];
          bridge.release(dir, true);
        }
      }
      var nextKeys = Object.keys(nextMap);
      for (var n = 0; n < nextKeys.length; n++) {
        var nd = nextKeys[n];
        if (!dpadHeld[nd]) {
          dpadHeld[nd] = true;
          bridge.press(nd);
        }
      }
    }

    function releaseAll() {
      setDpadDirs([]);
      var ids = Object.keys(pointers);
      for (var i = 0; i < ids.length; i++) release(ids[i]);
      return ids.length;
    }

    return {
      press: press,
      release: release,
      setDpadDirs: setDpadDirs,
      releaseAll: releaseAll,
      active: function () { return Object.keys(pointers).length + Object.keys(dpadHeld).length; },
      heldNorms: function () {
        var out = Object.keys(counts).filter(function (k) { return counts[k] > 0; });
        Object.keys(dpadHeld).forEach(function (d) {
          if (out.indexOf(d) < 0) out.push(d);
        });
        return out;
      },
      countFor: function (norm) { return (counts[norm] || 0) + (dpadHeld[norm] ? 1 : 0); }
    };
  }

  // 按 pad 布局生成按键清单（保留百分比坐标供单测与诊断使用）
  function layout(keymap) {
    var out = [];
    var dirs = {
      left: [3, 10], right: [14, 10], up: [8.5, 21], down: [8.5, 1]
    };
    keymap.order.forEach(function (norm) {
      var e = keymap.map[norm];
      if (e.kind === 'direction' && dirs[norm]) {
        out.push({ norm: norm, kind: 'direction', left: dirs[norm][0], bottom: dirs[norm][1] });
      }
    });

    var actions = keymap.order.filter(function (n) { return keymap.map[n].kind === 'action'; });
    if (actions.length >= 6) {
      for (var s = 0; s < actions.length; s++) {
        out.push({
          norm: actions[s], kind: 'action',
          left: 58 + (s % 3) * 13,
          bottom: s < 3 ? 22 : 8
        });
      }
    } else if (actions.length === 4) {
      var diamond = [[76, 6], [88, 17], [76, 28], [64, 17]];
      for (var d = 0; d < 4; d++) {
        out.push({ norm: actions[d], kind: 'action', left: diamond[d][0], bottom: diamond[d][1] });
      }
    } else {
      for (var t = 0; t < actions.length; t++) {
        out.push({ norm: actions[t], kind: 'action', left: 74 + t * 13, bottom: 12 + t * 12 });
      }
    }

    var caps = keymap.order.filter(function (n) { return keymap.map[n].kind === 'capsule'; });
    for (var c = 0; c < caps.length; c++) {
      out.push({ norm: caps[c], kind: 'capsule', left: 38 + c * 12, bottom: 2 });
    }
    return out;
  }

  function formatCapsuleText(norm, rawLabel) {
    var n = String(norm || '').toLowerCase();
    if (n === 'coin') return '投币';
    if (n === 'select') return '选择';
    if (n === 'start') return '开始';
    return String(rawLabel || norm).replace(/\s*25¢/g, '').replace(/^1P\s*/i, '');
  }

  function render(container, keymap) {
    if (!container) return 0;
    container.innerHTML = '';
    var items = layout(keymap);

    // 1. 左侧 8 向连续滑动十字键底座 (.vk-dpad)
    var dpadWrap = document.createElement('div');
    dpadWrap.className = 'vk-dpad';
    dpadWrap.setAttribute('data-vk-dpad', '1');
    var dpadCore = document.createElement('div');
    dpadCore.className = 'vk-dpad-pivot';
    dpadWrap.appendChild(dpadCore);

    var dirItems = items.filter(function (i) { return i.kind === 'direction'; });
    dirItems.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vkey vk-dir vk-dir-' + item.norm;
      btn.setAttribute('data-kind', 'direction');
      btn.setAttribute('data-vk', 'direction');
      btn.setAttribute('data-norm', item.norm);
      var text = document.createElement('span');
      text.textContent = DIR_SYMBOLS[item.norm] || item.norm;
      btn.appendChild(text);
      dpadWrap.appendChild(btn);
    });
    container.appendChild(dpadWrap);

    // 2. 中间功能胶囊键区 (.vk-capsules: 选择/投币 + 开始)
    var capWrap = document.createElement('div');
    capWrap.className = 'vk-capsules';
    var capItems = items.filter(function (i) { return i.kind === 'capsule'; });
    capItems.forEach(function (item) {
      var entry = keymap.map[item.norm];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vkey vk-cap';
      btn.setAttribute('data-kind', 'capsule');
      btn.setAttribute('data-vk', 'capsule');
      btn.setAttribute('data-norm', item.norm);
      var text = document.createElement('span');
      text.textContent = formatCapsuleText(item.norm, entry && entry.label);
      btn.appendChild(text);
      capWrap.appendChild(btn);
    });
    container.appendChild(capWrap);

    // 3. 右侧人体工学动作键区 (.vk-actions: 自适应 2键 / 3键 / 4键菱形 / 6键街机)
    var actItems = items.filter(function (i) { return i.kind === 'action'; });
    var shoulders = actItems.filter(function (i) { return i.norm === 'l' || i.norm === 'r'; });
    var mainActs = actItems.filter(function (i) { return i.norm !== 'l' && i.norm !== 'r'; });
    if (mainActs.length === 0) mainActs = actItems;

    if (shoulders.length > 0 && mainActs.length !== actItems.length) {
      var shWrap = document.createElement('div');
      shWrap.className = 'vk-shoulders';
      shoulders.forEach(function (item) {
        var entry = keymap.map[item.norm];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vkey vk-shoulder vk-shoulder-' + item.norm;
        btn.setAttribute('data-kind', 'action');
        btn.setAttribute('data-vk', 'action');
        btn.setAttribute('data-norm', item.norm);
        var text = document.createElement('span');
        text.textContent = (entry && entry.label) || item.norm.toUpperCase();
        btn.appendChild(text);
        shWrap.appendChild(btn);
      });
      container.appendChild(shWrap);
    }

    var layoutMode = mainActs.length >= 6 ? 'six' : (mainActs.length === 4 ? 'diamond' : (mainActs.length === 3 ? 'three' : 'two'));
    var actWrap = document.createElement('div');
    actWrap.className = 'vk-actions vk-layout-' + layoutMode;

    // 两键模式下确保左下方为主拇指落点 B，右上方为副键 A
    var orderedActs = mainActs.slice();
    if (layoutMode === 'two' && orderedActs.length === 2) {
      if (orderedActs[0].norm === 'a' && orderedActs[1].norm === 'b') {
        orderedActs = [orderedActs[1], orderedActs[0]];
      }
    }

    var slotNames = layoutMode === 'diamond'
      ? ['bottom', 'right', 'top', 'left']
      : (layoutMode === 'three' ? ['bottom', 'right', 'top'] : ['left', 'right']);

    orderedActs.forEach(function (item, idx) {
      var entry = keymap.map[item.norm];
      var slot = layoutMode === 'six' ? ('grid-' + idx) : (slotNames[idx] || ('slot-' + idx));
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vkey vk-act vk-slot-' + slot;
      btn.setAttribute('data-kind', 'action');
      btn.setAttribute('data-vk', 'action');
      btn.setAttribute('data-norm', item.norm);
      var text = document.createElement('span');
      text.textContent = (entry && entry.label) || item.norm.toUpperCase();
      btn.appendChild(text);
      var hint = document.createElement('small');
      hint.textContent = KEY_LABELS[item.norm] || '';
      btn.appendChild(hint);
      actWrap.appendChild(btn);
    });
    container.appendChild(actWrap);

    return items.length;
  }

  function attach(container, tracker) {
    if (!container || typeof container.addEventListener !== 'function') return false;
    if (container._vkAttached) return true;
    container._vkAttached = true;

    function paintDpadDirs(dirs) {
      var map = {};
      for (var i = 0; i < dirs.length; i++) map[dirs[i]] = true;
      var dirBtns = container.querySelectorAll('.vk-dir');
      for (var j = 0; j < dirBtns.length; j++) {
        var norm = dirBtns[j].getAttribute('data-norm');
        dirBtns[j].classList.toggle('down', !!map[norm]);
      }
    }

    var dpadPointerId = null;

    function updateDpadFromEvent(dpadEl, e) {
      var rect = dpadEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var nx = (e.clientX - cx) / (rect.width / 2);
      var ny = (e.clientY - cy) / (rect.height / 2);
      var dirs = resolveDpadDirections(nx, ny, 0.2);
      if (typeof tracker.setDpadDirs === 'function') {
        tracker.setDpadDirs(dirs);
      }
      paintDpadDirs(dirs);
    }

    function findKey(e) {
      var t = e.target;
      return t && t.closest ? t.closest('.vkey') : null;
    }

    var pointerBtnMap = {};

    container.addEventListener('pointerdown', function (e) {
      var dpadEl = e.target && e.target.closest ? e.target.closest('[data-vk-dpad]') : null;
      if (dpadEl) {
        e.preventDefault();
        if (dpadPointerId != null && dpadPointerId !== e.pointerId) return;
        dpadPointerId = e.pointerId;
        try { dpadEl.setPointerCapture(e.pointerId); } catch (_) {}
        updateDpadFromEvent(dpadEl, e);
        return;
      }

      var btn = findKey(e);
      if (!btn) return;
      e.preventDefault();
      var norm = btn.getAttribute('data-norm');
      if (tracker.press(e.pointerId, norm)) {
        pointerBtnMap[e.pointerId] = btn;
        btn.classList.add('down');
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      }
    });

    container.addEventListener('pointermove', function (e) {
      if (dpadPointerId != null && e.pointerId === dpadPointerId) {
        var dpadEl = container.querySelector('[data-vk-dpad]');
        if (dpadEl) {
          e.preventDefault();
          updateDpadFromEvent(dpadEl, e);
        }
      }
    });

    function up(e) {
      if (dpadPointerId != null && e.pointerId === dpadPointerId) {
        dpadPointerId = null;
        if (typeof tracker.setDpadDirs === 'function') {
          tracker.setDpadDirs([]);
        }
        paintDpadDirs([]);
        return;
      }
      var prevBtn = pointerBtnMap[e.pointerId] || findKey(e);
      delete pointerBtnMap[e.pointerId];
      if (tracker.release(e.pointerId) && prevBtn) {
        var norm = prevBtn.getAttribute('data-norm');
        if (!norm || tracker.countFor(norm) === 0) {
          prevBtn.classList.remove('down');
        }
      }
    }

    container.addEventListener('pointerup', up);
    container.addEventListener('pointercancel', up);
    container.addEventListener('lostpointercapture', up);
    return true;
  }

  var api = {
    KEY_LABELS: KEY_LABELS,
    resolveDpadDirections: resolveDpadDirections,
    createTracker: createTracker,
    layout: layout,
    render: render,
    attach: attach
  };
  root.WEB_VIRTUAL_KEYS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
