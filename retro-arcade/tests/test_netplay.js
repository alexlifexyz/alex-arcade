// tests/test_netplay.js
// WebRTC 联机模块纯内存单测：房间号、pad 清洗、8向滑动、动态按键规格、多指追踪、2P断线释放
'use strict';

const assert = require('assert');
const Netplay = require('../shared/web/netplay.js');
const Bridge = require('../shared/web/input-bridge.js');

console.log('--- 测试 1: 通用房间号前缀 ---');
{
  const id = Netplay.generateRoomId();
  assert.match(id, /^PLAY-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/, '房间号应为通用 PLAY-XXXX 格式');
  console.log('PASS: roomId =', id);
}

console.log('--- 测试 2: sanitizePad 清洗弹窗对象与函数 ---');
{
  const dirtyPad = {
    layout: 'diamond',
    stick: true,
    actions: [{ id: 'y', label: '攻击', key: 'Y' }],
    capsules: [
      { id: 'coin', label: '投币 25¢', follow: { title: '弹窗', fn: () => {} } },
      { id: 'start', label: '1P 开始' }
    ],
    shoulders: [{ id: 'l', label: 'L' }]
  };
  const clean = Netplay.sanitizePad(dirtyPad);
  assert.strictEqual(clean.capsules[0].follow, undefined, '应剔除 follow 对象');
  assert.strictEqual(JSON.stringify(clean).indexOf('弹窗'), -1);
  assert.strictEqual(clean.shoulders.length, 1);
  console.log('PASS: pad 可安全 JSON 序列化');
}

console.log('--- 测试 3: D-Pad 8 方向滑动与中心死区 ---');
{
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0, 0), []);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0.1, -0.1), []);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0.9, 0), ['right']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0.7, 0.7), ['down', 'right']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0, 0.9), ['down']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(-0.7, 0.7), ['down', 'left']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(-0.9, 0), ['left']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(-0.7, -0.7), ['up', 'left']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0, -0.9), ['up']);
  assert.deepStrictEqual(Netplay.resolveDpadDirections(0.7, -0.7), ['up', 'right']);
  console.log('PASS: 8 方向与死区解算正确');
}

console.log('--- 测试 4: 多游戏动态按键规格 (2键/3键/4键菱形/6键街机/肩键) ---');
{
  // 两键且输入顺序为 a, b 时，仍保证 b 在左、a 在右
  const two = Netplay.buildClientButtonSpecs({
    layout: 'two-button',
    actions: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    capsules: [{ id: 'select', label: '选择' }, { id: 'start', label: '开始' }]
  });
  assert.strictEqual(two.layoutMode, 'two');
  assert.strictEqual(two.actions[0].id, 'b');
  assert.strictEqual(two.actions[0].slot, 'left');
  assert.strictEqual(two.actions[1].id, 'a');
  assert.strictEqual(two.actions[1].slot, 'right');

  // 三键 (如松鼠大作战)
  const three = Netplay.buildClientButtonSpecs({
    layout: 'two-button',
    actions: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'x', label: 'X' }]
  });
  assert.strictEqual(three.layoutMode, 'three');
  assert.strictEqual(three.actions.length, 3);

  // 4 键菱形 + 街机投币标签规整
  const diamond = Netplay.buildClientButtonSpecs({
    layout: 'diamond',
    actions: [
      { id: 'b', label: '开火', key: 'Y' },
      { id: 'a', label: '跳跃', key: 'B' },
      { id: 'tb', label: '连发', key: 'X' },
      { id: 'ta', label: '连跳', key: 'A' }
    ],
    capsules: [{ id: 'coin', label: '投币 25¢' }, { id: 'start', label: '1P 开始' }],
    shoulders: [{ id: 'l', label: 'l' }, { id: 'r', label: 'r' }]
  });
  assert.strictEqual(diamond.layoutMode, 'diamond');
  assert.strictEqual(diamond.actions[0].slot, 'left');   // Y -> left
  assert.strictEqual(diamond.actions[1].slot, 'bottom'); // B -> bottom
  assert.strictEqual(diamond.actions[2].slot, 'top');    // X -> top
  assert.strictEqual(diamond.actions[3].slot, 'right');  // A -> right
  assert.strictEqual(diamond.capsules[0].label, '投币');
  assert.strictEqual(diamond.capsules[1].label, '开始');
  assert.strictEqual(diamond.shoulders[0].label, 'L');

  // 6 键街机 (街霸2)
  const six = Netplay.buildClientButtonSpecs({
    layout: 'six',
    actions: [
      { id: 'lp', label: '轻拳', row: 0, col: 0 },
      { id: 'mp', label: '中拳', row: 0, col: 1 },
      { id: 'hp', label: '重拳', row: 0, col: 2 },
      { id: 'lk', label: '轻脚', row: 1, col: 0 },
      { id: 'mk', label: '中脚', row: 1, col: 1 },
      { id: 'hk', label: '重脚', row: 1, col: 2 }
    ]
  });
  assert.strictEqual(six.layoutMode, 'six');
  assert.strictEqual(six.actions[5].slot, 'grid-1-2');
  console.log('PASS: 全平台按键规格构建正确');
}

console.log('--- 测试 5: 客户端滑动发包去重与多指独立追踪 ---');
{
  const sent = [];
  const sender = Netplay.createClientInputSender((btn, pressed) => sent.push({ btn, pressed }));

  // 滑动：right -> up+right -> up -> 松开
  sender.setDpadDirs(['right']);
  sender.setDpadDirs(['right']); // 重复无发包
  sender.setDpadDirs(['up', 'right']);
  sender.setDpadDirs(['up']);
  sender.setDpadDirs([]);

  assert.deepStrictEqual(sent, [
    { btn: 'right', pressed: true },
    { btn: 'up', pressed: true },
    { btn: 'right', pressed: false },
    { btn: 'up', pressed: false }
  ]);

  // 双指同按一个动作键 + 断线 releaseAll
  sent.length = 0;
  sender.pressButton(1, 'a');
  sender.pressButton(2, 'a');
  sender.pressButton(3, 'b');
  sender.setDpadDirs(['left']);
  assert.deepStrictEqual(sent, [
    { btn: 'a', pressed: true },
    { btn: 'b', pressed: true },
    { btn: 'left', pressed: true }
  ]);

  sent.length = 0;
  sender.releaseButton(1); // 第2根手指还在按 a，不发 false
  assert.strictEqual(sent.length, 0);
  sender.releaseAll();
  assert.deepStrictEqual(sent.map(x => x.btn).sort(), ['a', 'b', 'left']);
  assert.ok(sent.every(x => x.pressed === false));
  console.log('PASS: D-Pad 滑动去重、多指引用计数与全释放正确');
}

console.log('--- 测试 6: 房主端 2P 断线释放不影响 1P 按键 ---');
{
  const coreLog = [];
  const core = {
    setButton(id, pressed, player) {
      coreLog.push({ id, pressed, player });
    }
  };
  const bridge = Bridge.createBridge({
    core,
    pad: {
      layout: 'two-button',
      actions: [{ id: 'b', label: 'B' }, { id: 'a', label: 'A' }],
      capsules: [{ id: 'select', label: '选择' }, { id: 'start', label: '开始' }]
    },
    holdMs: 150
  });

  bridge.press('up', 1);
  bridge.press('left', 2);
  bridge.press('b', 2);
  coreLog.length = 0;

  // 2P 断线调用 releaseAll(2)
  const released = bridge.releaseAll(2);
  assert.strictEqual(released, 2);
  assert.deepStrictEqual(coreLog, [
    { id: 'left', pressed: false, player: 2 },
    { id: 'b', pressed: false, player: 2 }
  ]);
  // 1P 按键仍在
  assert.deepStrictEqual(bridge.held(), ['up']);
  console.log('PASS: 2P 断线全释放完全隔离 1P 状态');
}

console.log('ALL NETPLAY TESTS PASSED!');
