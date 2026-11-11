// shared/web/virtual-keys.js
// 虚拟键：按 GGEMU_CORE.pad 动态生成半透明按键，Pointer Events + pointerId 多指同按，
// 点哪颗等价于按下对应键盘键，统一走输入桥 core.setButton。
// createTracker 是纯逻辑（无 DOM），可在 Node 里做多指断言。
(function (root) {
  'use strict';

  // 键帽上显示的键盘提示（与内核自带 KEY_MAP 对齐）
  var KEY_LABELS = {
    up: 'W/↑', down: 'S/↓', left: 'A/←', right: 'D/→',
    a: 'K', b: 'J', tb: 'U', ta: 'I',
    x: 'U', y: 'J', select: 'Shift', start: 'Enter', coin: '5',
    lp: 'U', mp: 'I', hp: 'O', lk: 'J', mk: 'K', hk: 'L'
  };

  function createTracker(bridge) {
    var pointers = {}; // pointerId -> norm
    var counts = {};   // norm -> 按住的指针数

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

    function releaseAll() {
      var ids = Object.keys(pointers);
      for (var i = 0; i < ids.length; i++) release(ids[i]);
      return ids.length;
    }

    return {
      press: press,
      release: release,
      releaseAll: releaseAll,
      active: function () { return Object.keys(pointers).length; },
      heldNorms: function () {
        return Object.keys(counts).filter(function (k) { return counts[k] > 0; });
      },
      countFor: function (norm) { return counts[norm] || 0; }
    };
  }

  // 按 pad 布局摆放按键（百分比坐标，横竖屏都不溢出）
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
      // 六键街机：两排三列
      for (var s = 0; s < actions.length; s++) {
        out.push({
          norm: actions[s], kind: 'action',
          left: 58 + (s % 3) * 13,
          bottom: s < 3 ? 22 : 8
        });
      }
    } else if (actions.length === 4) {
      // 钻石四键：下 / 右 / 上 / 左
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

  function render(container, keymap) {
    if (!container) return 0;
    container.innerHTML = '';
    var items = layout(keymap);
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vkey';
      btn.setAttribute('data-kind', item.kind);
      btn.setAttribute('data-vk', item.kind);
      btn.setAttribute('data-norm', item.norm);
      btn.style.left = item.left + '%';
      btn.style.bottom = item.bottom + '%';
      var entry = keymap.map[item.norm];
      var text = document.createElement('span');
      text.textContent = (entry && entry.label) || item.norm;
      btn.appendChild(text);
      var hint = document.createElement('small');
      hint.textContent = KEY_LABELS[item.norm] || '';
      btn.appendChild(hint);
      container.appendChild(btn);
    });
    return items.length;
  }

  function attach(container, tracker) {
    if (!container || typeof container.addEventListener !== 'function') return false;
    function findKey(e) {
      var t = e.target;
      return t && t.closest ? t.closest('.vkey') : null;
    }
    container.addEventListener('pointerdown', function (e) {
      var btn = findKey(e);
      if (!btn) return;
      e.preventDefault();
      if (tracker.press(e.pointerId, btn.getAttribute('data-norm'))) {
        btn.classList.add('down');
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    });
    function up(e) {
      var btn = findKey(e);
      if (tracker.release(e.pointerId) && btn) btn.classList.remove('down');
    }
    container.addEventListener('pointerup', up);
    container.addEventListener('pointercancel', up);
    container.addEventListener('lostpointercapture', up);
    return true;
  }

  var api = {
    KEY_LABELS: KEY_LABELS,
    createTracker: createTracker,
    layout: layout,
    render: render,
    attach: attach
  };
  root.WEB_VIRTUAL_KEYS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
