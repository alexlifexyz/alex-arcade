// shared/web/test_input.js
// 输入桥纯内存断言（Node 直接跑，不需要 DOM / 浏览器）。
// 步骤 2 覆盖：键表、规整化、全键释放、Hold Buffer、原始 id 下发、键盘不重复绑定。
// 步骤 4 追加 pointer 多指用例，步骤 5 追加 Gamepad mock 用例。
'use strict';

const assert = require('assert');
const B = require('./input-bridge.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  PASS ' + name);
}

// 三种真实形态的 pad（与 tools/*/assets/core.js 里 GGEMU_CORE.pad 一致）
const PAD_TWO = {
  layout: 'two-button',
  stick: false,
  actions: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  capsules: [{ id: 'select', label: 'SELECT' }, { id: 'start', label: 'START' }]
};
const PAD_DIAMOND = {
  layout: 'diamond',
  stick: true,
  actions: [
    { id: 'btn-b', label: '射击' }, { id: 'btn-a', label: '跳跃' },
    { id: 'btn-x', label: '手雷' }, { id: 'btn-y', label: '辅助' }
  ],
  capsules: [{ id: 'btn-select', label: '选择' }, { id: 'btn-start', label: '开始' }]
};
const PAD_SIX = {
  layout: 'six',
  stick: true,
  actions: [
    { id: 'lp', label: '轻拳' }, { id: 'mp', label: '中拳' }, { id: 'hp', label: '重拳' },
    { id: 'lk', label: '轻脚' }, { id: 'mk', label: '中脚' }, { id: 'hk', label: '重脚' }
  ],
  capsules: [{ id: 'coin', label: '投币' }, { id: 'start', label: '开始' }]
};

function harness(pad) {
  let t = 0;
  let seq = 1;
  const timers = {};
  const calls = [];
  const core = {
    setButton(id, pressed) { calls.push({ id: id, pressed: pressed, t: t }); }
  };
  const bridge = B.createBridge({
    core: core,
    pad: pad,
    holdMs: 150,
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = seq++;
      timers[id] = { fn: fn, at: t + ms };
      return id;
    },
    clearTimeout: (id) => { delete timers[id]; }
  });
  function advance(ms) {
    t += ms;
    Object.keys(timers).forEach((id) => {
      if (timers[id] && timers[id].at <= t) {
        const fn = timers[id].fn;
        delete timers[id];
        fn();
      }
    });
  }
  return { bridge: bridge, calls: calls, advance: advance, core: core };
}

function eventTarget(props) {
  const handlers = {};
  return Object.assign({
    addEventListener(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    fire(name, evt) { (handlers[name] || []).forEach((fn) => fn(evt || { type: name })); },
    handlers: handlers
  }, props || {});
}

console.log('input-bridge 纯内存断言');

test('normalizeId 去 btn- 前缀、忽略大小写与空值', () => {
  assert.strictEqual(B.normalizeId('btn-B'), 'b');
  assert.strictEqual(B.normalizeId('BTN-Start'), 'start');
  assert.strictEqual(B.normalizeId('lp'), 'lp');
  assert.strictEqual(B.normalizeId(null), '');
  assert.strictEqual(B.normalizeId(''), '');
});

test('buildKeymap 两键 / 四键 / 六键数量与种类正确', () => {
  const k2 = B.buildKeymap(PAD_TWO);
  assert.deepStrictEqual(k2.order.slice(0, 4), ['up', 'down', 'left', 'right']);
  assert.strictEqual(k2.order.length, 8);
  assert.ok(k2.map.a && k2.map.b && k2.map.select && k2.map.start);
  assert.strictEqual(k2.map.up.kind, 'direction');

  const k4 = B.buildKeymap(PAD_DIAMOND);
  assert.strictEqual(k4.order.length, 10);
  assert.strictEqual(k4.map.b.rawId, 'btn-b');
  assert.strictEqual(k4.map.start.rawId, 'btn-start');
  assert.strictEqual(k4.map.b.kind, 'action');

  const k6 = B.buildKeymap(PAD_SIX);
  assert.strictEqual(k6.order.length, 12);
  assert.ok(k6.map.lp && k6.map.hk && k6.map.coin);
  assert.strictEqual(k6.map.coin.kind, 'capsule');
});

test('press / release 下发的是内核认识的原始 id', () => {
  const h = harness(PAD_DIAMOND);
  h.bridge.press('b');
  assert.deepStrictEqual(h.calls[0], { id: 'btn-b', pressed: true, t: 0 });
  h.bridge.release('BTN-B', true);
  assert.deepStrictEqual(h.calls[1], { id: 'btn-b', pressed: false, t: 0 });

  const h6 = harness(PAD_SIX);
  h6.bridge.press('lp');
  h6.bridge.press('coin');
  assert.deepStrictEqual(h6.calls.map((c) => c.id), ['lp', 'coin']);
  assert.strictEqual(h6.bridge.press('不存在的键'), false);
});

test('Hold Buffer：轻触至少保持 150ms，不提前松开', () => {
  const h = harness(PAD_TWO);
  h.bridge.press('a');
  h.bridge.release('a');
  assert.strictEqual(h.calls.length, 1);
  assert.strictEqual(h.calls[0].pressed, true);
  h.advance(100);
  assert.strictEqual(h.calls.length, 1);
  h.advance(50);
  assert.strictEqual(h.calls.length, 2);
  assert.strictEqual(h.calls[1].pressed, false);
  assert.deepStrictEqual(h.bridge.held(), []);
});

test('pending 释放期间再次按下会取消，不误发 false', () => {
  const h = harness(PAD_TWO);
  h.bridge.press('a');
  h.bridge.release('a');
  h.bridge.press('a');
  h.advance(300);
  assert.strictEqual(h.calls.length, 1);
  assert.deepStrictEqual(h.bridge.held(), ['a']);
  h.bridge.release('a');
  assert.strictEqual(h.calls.length, 2);
  assert.strictEqual(h.calls[1].pressed, false);
});

test('releaseAll 清空按住状态、取消 pending、不重复发 false', () => {
  const h = harness(PAD_DIAMOND);
  h.bridge.press('up');
  h.bridge.press('b');
  h.bridge.press('start');
  h.bridge.release('b'); // 留一个 pending
  assert.strictEqual(h.bridge.releaseAll(), 3);
  assert.deepStrictEqual(h.bridge.held(), []);
  assert.strictEqual(h.calls.filter((c) => !c.pressed).length, 3);
  h.advance(500);
  assert.strictEqual(h.calls.filter((c) => !c.pressed).length, 3);
});

test('失焦 / 切模式 / iframe 重载三个入口都全键释放', () => {
  ['handleBlur', 'handleModeChange', 'handleReload'].forEach((name) => {
    const h = harness(PAD_TWO);
    h.bridge.press('up');
    h.bridge.press('a');
    h.bridge[name]();
    assert.deepStrictEqual(h.bridge.held(), []);
    assert.strictEqual(h.calls.filter((c) => !c.pressed).length, 2);
  });
});

test('attach 绑定 blur / 模式 / 可见性 / load，且绝不绑 keydown / keyup', () => {
  let focused = 0;
  const win = eventTarget();
  const doc = eventTarget({ hidden: false });
  const frame = eventTarget({ contentWindow: { focus() { focused++; } } });
  const h = harness(PAD_TWO);
  assert.strictEqual(h.bridge.attach(win, doc, frame), true);
  assert.ok(!win.handlers.keydown, '网页层不得重复绑定 keydown');
  assert.ok(!win.handlers.keyup, '网页层不得重复绑定 keyup');

  h.bridge.press('a'); win.fire('blur'); assert.deepStrictEqual(h.bridge.held(), []);
  h.bridge.press('a'); win.fire('webplayer:modechange'); assert.deepStrictEqual(h.bridge.held(), []);
  h.bridge.press('a'); doc.hidden = true; doc.fire('visibilitychange'); assert.deepStrictEqual(h.bridge.held(), []);
  h.bridge.press('a'); frame.fire('load'); assert.deepStrictEqual(h.bridge.held(), []);

  assert.strictEqual(B.focusIframe(frame), true);
  assert.strictEqual(focused, 1);
  assert.strictEqual(B.focusIframe(null), false);
});

test('setPad 换游戏时先释放旧键再重建键表', () => {
  const h = harness(PAD_TWO);
  h.bridge.press('a');
  h.bridge.setPad(PAD_SIX);
  assert.deepStrictEqual(h.bridge.held(), []);
  assert.ok(h.bridge.getKeymap().map.lp);
  assert.strictEqual(h.bridge.getKeymap().map.a, undefined);
});

test('内核 setButton 抛错或缺 core 时桥不崩溃', () => {
  const bad = B.createBridge({
    core: { setButton() { throw new Error('boom'); } },
    pad: PAD_TWO,
    now: () => 0
  });
  assert.doesNotThrow(() => bad.press('a'));
  assert.ok(bad.log[0].error);

  const none = B.createBridge({ pad: PAD_TWO });
  assert.strictEqual(none.press('a'), true);
  assert.strictEqual(none.log.length, 0);
});

// ---- 步骤 4：虚拟键多指 ----
const VK = require('./virtual-keys.js');
const GP = require('./gamepad.js');

test('虚拟键布局：动作 / 功能 / 方向数量与 pad 一致', () => {
  const k6 = B.buildKeymap(PAD_SIX);
  const items = VK.layout(k6);
  assert.strictEqual(items.filter((i) => i.kind === 'action').length, 6);
  assert.strictEqual(items.filter((i) => i.kind === 'capsule').length, 2);
  assert.strictEqual(items.filter((i) => i.kind === 'direction').length, 4);
});

test('虚拟键多指：两指同按一键只发一次 true，全松开才 false', () => {
  const h = harness(PAD_DIAMOND);
  const t = VK.createTracker(h.bridge);
  t.press(1, 'b');
  t.press(2, 'b');
  assert.strictEqual(h.calls.filter((c) => c.pressed && c.id === 'btn-b').length, 1);
  assert.strictEqual(t.countFor('b'), 2);
  t.release(1);
  h.advance(200);
  assert.strictEqual(h.calls.filter((c) => !c.pressed).length, 0);
  t.release(2);
  h.advance(200);
  assert.strictEqual(h.calls.filter((c) => !c.pressed && c.id === 'btn-b').length, 1);
  assert.deepStrictEqual(t.heldNorms(), []);
});

test('虚拟键多指：不同键可同时按住，releaseAll 全释放', () => {
  const h = harness(PAD_DIAMOND);
  const t = VK.createTracker(h.bridge);
  t.press(1, 'up');
  t.press(2, 'b');
  t.press(3, 'start');
  assert.deepStrictEqual(t.heldNorms().sort(), ['b', 'start', 'up']);
  assert.strictEqual(t.active(), 3);
  t.releaseAll();
  h.advance(200);
  assert.strictEqual(t.active(), 0);
  assert.strictEqual(h.calls.filter((c) => !c.pressed).length, 3);
});

// ---- 步骤 5：Gamepad ----
test('Gamepad 标准映射：方向 / 功能键 / 六键动作都按 pad 生成', () => {
  const k2 = B.buildKeymap(PAD_TWO);
  const b2 = GP.buildBindings(k2);
  assert.strictEqual(b2.buttonToNorm[12], 'up');
  assert.strictEqual(b2.buttonToNorm[15], 'right');
  assert.strictEqual(b2.buttonToNorm[8], 'select');
  assert.strictEqual(b2.buttonToNorm[9], 'start');
  const b6 = GP.buildBindings(B.buildKeymap(PAD_SIX));
  assert.strictEqual(b6.buttonToNorm[8], 'coin');
  const mappedActions = Object.keys(b6.buttonToNorm)
    .filter((k) => b6.actions.indexOf(b6.buttonToNorm[k]) >= 0);
  assert.strictEqual(mappedActions.length, 6);
});

test('Gamepad 边沿触发、摇杆死区与断开全释放', () => {
  const h = harness(PAD_DIAMOND);
  let pad = {
    id: 'mock-pad',
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0.1, 0.1] // 小于死区，不应触发方向
  };
  const gp = GP.createGamepad({
    bridge: h.bridge,
    keymap: h.bridge.getKeymap(),
    getGamepads: () => [pad],
    isSecure: true
  });
  gp.poll();
  assert.strictEqual(gp.status().connected, true);
  assert.strictEqual(h.calls.length, 0, '死区内的摇杆不应触发');

  pad.buttons[12].pressed = true; // 十字键上
  pad.buttons[1].pressed = true;  // 第一个动作键 -> btn-b
  gp.poll();
  assert.deepStrictEqual(h.calls.filter((c) => c.pressed).map((c) => c.id).sort(), ['btn-b', 'up']);
  const before = h.calls.length;
  gp.poll();
  assert.strictEqual(h.calls.length, before, '状态未变化不应重复下发');

  pad.axes[0] = -0.8; // 摇杆左
  gp.poll();
  assert.ok(h.calls.some((c) => c.id === 'left' && c.pressed));

  pad = null; // 手柄断开
  gp.poll();
  h.advance(200);
  assert.strictEqual(gp.status().connected, false);
  assert.ok(h.calls.filter((c) => !c.pressed).length >= 3, '断开时所有按住的键都要释放');
});

console.log('\n输入桥 / 虚拟键 / 手柄：' + passed + ' 组断言全部 PASS');
