// tests/test_keyboard.js
'use strict';

const assert = require('assert');
const B = require('../shared/web/input-bridge.js');
const K = require('../shared/web/keyboard.js');

const PAD_NES = {
  layout: 'two-button',
  stick: false,
  actions: [{ id: 'b', label: 'B' }, { id: 'a', label: 'A' }],
  capsules: [{ id: 'select', label: 'SELECT' }, { id: 'start', label: 'START' }]
};

const PAD_ARCADE_4 = {
  layout: 'diamond',
  stick: true,
  actions: [
    { id: 'y', label: '攻击' },
    { id: 'b', label: '跳跃' },
    { id: 'a', label: '必杀' },
    { id: 'x', label: '连发' }
  ],
  capsules: [{ id: 'coin', label: '投币' }, { id: 'start', label: '开始' }]
};

const PAD_CPS1_SIX = {
  layout: 'six',
  stick: true,
  actions: [
    { id: 'lp', label: '轻拳' }, { id: 'mp', label: '中拳' }, { id: 'hp', label: '重拳' },
    { id: 'lk', label: '轻脚' }, { id: 'mk', label: '中脚' }, { id: 'hk', label: '重脚' }
  ],
  capsules: [{ id: 'coin', label: '投币' }, { id: 'start', label: '开始' }]
};

function makeHarness(pad) {
  let clock = 0;
  const calls = [];
  const core = {
    setButton(id, pressed, player) {
      calls.push({ id: id, pressed: pressed, player: player, t: clock });
    }
  };
  const timers = [];
  const bridge = B.createBridge({
    core: core,
    pad: pad,
    holdMs: 150,
    now: () => clock,
    setTimeout: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ id, due: clock + ms, fn, cancelled: false });
      return id;
    },
    clearTimeout: (id) => {
      const t = timers.find(x => x.id === id);
      if (t) t.cancelled = true;
    }
  });
  const listeners = {};
  const mockWin = {
    addEventListener(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); },
    removeEventListener(evt, fn) {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    }
  };
  let activeElement = null;
  const mockDoc = {
    get activeElement() { return activeElement; },
    getElementById() { return null; }
  };
  const kbd = K.createKeyboard({ bridge: bridge, window: mockWin, document: mockDoc });
  kbd.attach();

  function pressKey(code, state = { prevented: false, stopped: false }) {
    (listeners['keydown'] || []).forEach(fn => fn({
      code: code,
      preventDefault: () => { state.prevented = true; },
      stopImmediatePropagation: () => { state.stopped = true; }
    }));
  }

  function releaseKey(code, state = { prevented: false, stopped: false }) {
    (listeners['keyup'] || []).forEach(fn => fn({
      code: code,
      preventDefault: () => { state.prevented = true; },
      stopImmediatePropagation: () => { state.stopped = true; }
    }));
  }

  return {
    kbd,
    calls,
    pressKey,
    releaseKey,
    advance: (ms) => {
      clock += ms;
      timers.forEach(t => { if (!t.cancelled && t.due <= clock) { t.cancelled = true; t.fn(); } });
    },
    setActiveElement: (el) => { activeElement = el; }
  };
}

console.log('--- 测试 1: NES 1P 键盘映射 (J=B主键, K=A副键, 0ms即时松开, stopImmediatePropagation) ---');
{
  const h = makeHarness(PAD_NES);
  const st = { prevented: false, stopped: false };

  h.pressKey('Enter', st);
  assert.strictEqual(st.prevented, true, 'Enter 应 preventDefault');
  assert.strictEqual(st.stopped, true, 'Enter 应 stopImmediatePropagation 阻断双触发');
  assert.deepStrictEqual(h.calls[0], { id: 'start', pressed: true, player: 1, t: 0 });

  h.pressKey('KeyJ');
  assert.deepStrictEqual(h.calls[1], { id: 'b', pressed: true, player: 1, t: 0 }, 'J 应对应左键 B');

  // 仅隔 20ms 松开 J：动作键必须 0ms 立即释放，不等 150ms Hold Buffer
  h.advance(20);
  h.releaseKey('KeyJ');
  assert.deepStrictEqual(h.calls[2], { id: 'b', pressed: false, player: 1, t: 20 }, '动作键松手应即时释放');

  h.pressKey('KeyK');
  assert.deepStrictEqual(h.calls[3], { id: 'a', pressed: true, player: 1, t: 20 }, 'K 应对应右键 A');
  console.log('PASS: NES 1P 映射与 0ms 即时释放验证通过');
}

console.log('--- 测试 2: 四键街机 (J=攻击y, K=跳b, L=必杀a, U=连发x, 5/Space=投币) ---');
{
  const h = makeHarness(PAD_ARCADE_4);
  h.pressKey('KeyJ');
  assert.strictEqual(h.calls[0].id, 'y', '四键街机 J 必须为普通攻击 y，绝不能误触扣血必杀 a');
  h.pressKey('KeyK');
  assert.strictEqual(h.calls[1].id, 'b');
  h.pressKey('KeyL');
  assert.strictEqual(h.calls[2].id, 'a');
  h.pressKey('KeyU');
  assert.strictEqual(h.calls[3].id, 'x');
  h.pressKey('Digit5');
  assert.strictEqual(h.calls[4].id, 'coin');
  console.log('PASS: 四键街机动作与投币映射无串键');
}

console.log('--- 测试 3: 六键格斗街机 (U/I/O 轻中重拳, J/K/L 轻中重脚) ---');
{
  const h = makeHarness(PAD_CPS1_SIX);
  ['KeyU', 'KeyI', 'KeyO', 'KeyJ', 'KeyK', 'KeyL'].forEach(c => h.pressKey(c));
  assert.deepStrictEqual(h.calls.map(c => c.id), ['lp', 'mp', 'hp', 'lk', 'mk', 'hk']);
  console.log('PASS: 六键街霸拳脚全部精准可达');
}

console.log('--- 测试 4: 2P 小键盘双打与输入框焦点放行 ---');
{
  const h = makeHarness(PAD_NES);
  h.pressKey('Numpad8');
  h.pressKey('Numpad1');
  h.pressKey('Numpad3');
  assert.deepStrictEqual(h.calls.map(c => ({ id: c.id, p: c.player })), [
    { id: 'up', p: 2 },
    { id: 'b', p: 2 },
    { id: 'a', p: 2 }
  ]);

  const countBefore = h.calls.length;
  h.setActiveElement({ tagName: 'INPUT' });
  const st = { prevented: false, stopped: false };
  h.pressKey('KeyW', st);
  assert.strictEqual(st.prevented, false);
  assert.strictEqual(h.calls.length, countBefore);
  console.log('PASS: 2P 小键盘与输入框焦点保护通过');
}

console.log('ALL KEYBOARD TESTS PASSED!');
