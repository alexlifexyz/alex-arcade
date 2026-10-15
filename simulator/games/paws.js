// simulator/games/paws.js — 短腿爪爪运动会（重制）
// 选人 → 三场杯赛；三条跑道换道、跳栏、躲泥坑香蕉皮、吃骨头攒涡轮；空中再按 OK 涡轮冲刺
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, PY = 236, PXM = 14;
  const LANES = [60, 120, 180];
  const RACES = [420, 560, 700];
  const CHARS = [
    { id: 'corgi', name: '柯基', perk: '涡轮更持久', body: '#f0a040', belly: '#fff4e0', ear: '#c87020', speed: 1, turbo: 130 },
    { id: 'shiba', name: '柴犬', perk: '跑得更快', body: '#e8b060', belly: '#fff', ear: '#a86a20', speed: 1.05, turbo: 95 },
    { id: 'seal', name: '小海豹', perk: '泥坑不减速', body: '#b8c4d0', belly: '#e8eef4', ear: '#8a96a2', speed: 1, turbo: 95, mud: true },
    { id: 'peng', name: '企鹅', perk: '香蕉皮不打滑', body: '#2a2e3a', belly: '#f4f4f4', ear: '#2a2e3a', speed: 1, turbo: 95, banana: true }
  ];

  A.define({
    id: 'pawssprint',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, wins: 0, cup: false, bones: 0 });
      const g = { t: 0, phase: 'select', sel: 0, race: 0, obs: [], runners: [], finish: [], resultT: 0, countT: 0, charges: 0, boneBits: 0 };
      let me = null;

      function drawDog(ctx, c, x, y, s, t, opts) {
        opts = opts || {};
        const bob = Math.sin(t / 3) * 1.2 * s;
        ctx.save(); ctx.translate(x, y + bob); ctx.scale(s, s);
        if (opts.spin) ctx.rotate(opts.spin);
        // 影子
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 11 + (opts.z || 0), 11, 4, 0, 0, 7); ctx.fill();
        ctx.translate(0, -(opts.z || 0));
        // 脚
        const k = Math.sin(t / 2.5) * 3;
        ctx.fillStyle = c.ear;
        ctx.fillRect(-8, 6 + k, 4, 5); ctx.fillRect(4, 6 - k, 4, 5);
        // 身体
        ctx.fillStyle = c.body; ctx.beginPath(); ctx.ellipse(0, 3, 10, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = c.belly; ctx.beginPath(); ctx.ellipse(0, 5, 6, 5, 0, 0, 7); ctx.fill();
        // 头
        ctx.fillStyle = c.body; ctx.beginPath(); ctx.arc(0, -8, 8, 0, 7); ctx.fill();
        if (c.id === 'corgi' || c.id === 'shiba') {
          ctx.fillStyle = c.ear;
          ctx.beginPath(); ctx.moveTo(-7, -11); ctx.lineTo(-5, -20); ctx.lineTo(-1, -13); ctx.fill();
          ctx.beginPath(); ctx.moveTo(7, -11); ctx.lineTo(5, -20); ctx.lineTo(1, -13); ctx.fill();
        }
        if (c.id === 'peng') { ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.ellipse(0, -6, 5.5, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb000'; ctx.fillRect(-2, -5, 4, 2); }
        ctx.fillStyle = c.belly; ctx.beginPath(); ctx.ellipse(0, -5, 4.5, 3.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-4, -10, 2, 2); ctx.fillRect(2, -10, 2, 2); ctx.fillRect(-1, -6, 2, 1.5);
        if (opts.tongue) { ctx.fillStyle = '#ff7a9a'; ctx.fillRect(-1, -4.5, 2, 3); }
        ctx.fillStyle = 'rgba(255,120,150,.5)'; ctx.fillRect(-6.5, -7, 2, 1.5); ctx.fillRect(4.5, -7, 2, 1.5);
        if (opts.me) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-3, -25); ctx.lineTo(3, -25); ctx.lineTo(0, -21); ctx.fill(); }
        ctx.restore();
      }

      function setupRace() {
        const len = RACES[g.race];
        g.len = len; g.obs = []; g.finish = []; g.countT = 150; g.phase = 'count';
        let d = 30;
        while (d < len - 20) {
          const kinds = ['hurdle', 'mud', 'banana'];
          const n = U.chance(0.25 + g.race * 0.12) ? 2 : 1;
          const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, n);
          for (const l of lanes) g.obs.push({ kind: U.pick(kinds), lane: l, d });
          const free = [0, 1, 2].filter((l) => !lanes.includes(l));
          if (free.length && U.chance(0.7)) for (let k = 0; k < 3; k++) g.obs.push({ kind: 'bone', lane: U.pick(free), d: d + 4 + k * 3 });
          if (U.chance(0.12)) g.obs.push({ kind: 'pad', lane: U.pick(free.length ? free : [1]), d: d + 8 });
          d += U.rand(14, 22) - g.race * 1.5;
        }
        const others = CHARS.filter((c) => c !== me.c);
        g.runners = [me].concat(others.map((c, i) => ({ c, ai: true, lane: [0, 2, 1][i], x: LANES[[0, 2, 1][i]], dist: 0, speed: 0, slow: 0, z: 0, vz: 0, turbo: 0, t: 0, skill: 0.93 + g.race * 0.035 + i * 0.012 })));
        me.dist = 0; me.speed = 0; me.lane = 1; me.x = LANES[1]; me.z = 0; me.vz = 0; me.slow = 0; me.spin = 0; me.turbo = 0; me.done = false;
        for (const r of g.runners) r.done = false;
      }

      function hitObstacle(r, o) {
        if (r.turbo > 0) {
          if (o.kind === 'hurdle' && !o.broken) { o.broken = true; if (!r.ai) { fx.burst(r.x, PY - 6, 14, ['#fff', '#e0342f']); sfx.boom(false); fx.addShake(4); st.score += 80; } }
          return;
        }
        if (o.kind === 'hurdle') { r.slow = 45; r.speed *= 0.2; if (!r.ai) { fx.floatText(r.x, PY - 30, '绊倒!', '#ff6b6b'); sfx.hurt(); fx.addShake(5); } }
        else if (o.kind === 'mud' && !r.c.mud) { r.mud = 50; if (!r.ai) { fx.floatText(r.x, PY - 30, '泥坑!', '#a0703a'); sfx.tone(160, 0.2, { type: 'sawtooth', vol: 0.06 }); } }
        else if (o.kind === 'banana' && !r.c.banana) { r.spin = 50; r.speed *= 0.4; if (!r.ai) { fx.floatText(r.x, PY - 30, '打滑!', '#ffd23f'); sfx.tone(900, 0.3, { type: 'sine', vol: 0.06, to: 200 }); } }
      }

      function stepRunner(r, input) {
        r.t++;
        const base = 0.16 * r.c.speed * (r.ai ? r.skill : 1);
        let target = base;
        if (r.mud > 0) { r.mud--; target *= 0.55; }
        if (r.spin > 0) { r.spin--; target *= 0.35; }
        if (r.slow > 0) { r.slow--; target *= 0.3; }
        if (r.turbo > 0) { r.turbo--; target *= 1.75; }
        if (r.pad > 0) { r.pad--; target *= 1.4; }
        r.speed = U.approach(r.speed, target, r.slow > 0 ? 0.01 : 0.004);
        if (!r.done) r.dist += r.speed;
        // 跳
        if (r.z > 0 || r.vz > 0) { r.vz -= 0.22; r.z = Math.max(0, r.z + r.vz); if (r.z === 0) r.vz = 0; }

        if (r.ai && !r.done) {
          // 橡皮筋：落后太多略微加速
          const gap = me.dist - r.dist;
          r.skill = U.clamp(r.skill + (gap > 25 ? 0.0004 : gap < -25 ? -0.0004 : 0), 0.88, 1.12);
          // 看前方障碍：随机决定跳 / 换道
          const ahead = g.obs.find((o) => o.lane === r.lane && o.kind !== 'bone' && o.kind !== 'pad' && !o.broken && o.d - r.dist > 1 && o.d - r.dist < 5);
          if (ahead && !r.decided) {
            r.decided = ahead;
            const roll = Math.random();
            if (roll < 0.5 + g.race * 0.1) { if (r.z === 0) r.vz = 3.2; }
            else if (roll < 0.8) { r.lane = U.clamp(r.lane + U.pick([-1, 1]), 0, 2); }
          }
          if (r.decided && r.decided.d < r.dist) r.decided = null;
          if (U.chance(0.002 + g.race * 0.001) && r.turbo === 0) r.turbo = 80;
        }
        r.x = U.approach(r.x, LANES[r.lane], 5);

        // 碰撞（只在地面上）
        for (const o of g.obs) {
          if (o.lane !== r.lane || Math.abs(o.d - r.dist) > 0.9) continue;
          if (o.kind === 'bone') {
            if (!r.ai && !o.got && r.z < 12) {
              o.got = true; st.bones++; st.score += 50; g.boneBits++;
              sfx.coin(); fx.spark(r.x, PY - 8, '#fff', 5);
              if (g.boneBits >= 3) { g.boneBits = 0; if (g.charges < 3) { g.charges++; fx.floatText(r.x, PY - 36, '涡轮 +1', '#38e1ff', 9); sfx.pickup(); } }
            }
            continue;
          }
          if (o.kind === 'pad') { if (r.z < 4 && !r['pad' + o.d]) { r['pad' + o.d] = 1; r.pad = 60; if (!r.ai) { sfx.power(); fx.floatText(r.x, PY - 30, '加速带!', '#7dffb3'); } } continue; }
          if (r.z > 6) { if (!r.ai && !o['jumped']) { o.jumped = true; st.score += 50; } continue; }
          if (!r['hit' + o.d + o.lane]) { r['hit' + o.d + o.lane] = 1; hitObstacle(r, o); }
        }
        if (!r.done && r.dist >= g.len) {
          r.done = true; g.finish.push(r);
          if (!r.ai) {
            const place = g.finish.length;
            st.score += [3000, 2000, 1000, 300][place - 1];
            if (place === 1) st.wins++;
            fx.say(['第 1 名!', '第 2 名', '第 3 名', '第 4 名'][place - 1], place === 1 ? '#ffd23f' : place === 2 ? '#e0e0e0' : '#ff9a6a', 100);
            if (place <= 2) sfx.clear(); else sfx.over();
            fx.burst(W / 2, 80, 40, ['#ffd23f', '#ff8fc7', '#7cc7ff', '#7dffb3', '#fff'], { speed: 4, gravity: 0.1, life: 60 });
            g.phase = 'finish'; g.resultT = 0;
          }
        }
      }

      function update(input) {
        g.t++;
        if (g.phase === 'select') {
          if (input.upP) { g.sel = (g.sel + 3) % 4; sfx.move(); }
          if (input.downP) { g.sel = (g.sel + 1) % 4; sfx.move(); }
          if (input.okP) { me = { c: CHARS[g.sel], me: true, t: 0 }; sfx.select(); setupRace(); }
          return;
        }
        if (g.phase === 'count') {
          g.countT--;
          if (g.countT % 50 === 0 && g.countT > 0) sfx.beep(660);
          if (g.countT === 0) { g.phase = 'race'; sfx.go(); }
          for (const r of g.runners) r.t++;
          return;
        }
        if (g.phase === 'race' || g.phase === 'finish') {
          if (g.phase === 'race') {
            if (input.upP && me.lane > 0) { me.lane--; sfx.move(); }
            if (input.downP && me.lane < 2) { me.lane++; sfx.move(); }
            if (input.okP) {
              if (me.z === 0) { me.vz = 3.3; sfx.jump(); }
              else if (g.charges > 0 && me.turbo === 0) { g.charges--; me.turbo = me.c.turbo; me.vz = Math.max(me.vz, 1); sfx.whoosh(); sfx.power(); fx.flash('#38e1ff', 0.25); fx.say('小短腿涡轮!', '#38e1ff', 50); }
            }
          }
          for (const r of g.runners) stepRunner(r, input);
          if (me.turbo > 0 && g.t % 2 === 0) fx.burst(me.x, PY + 8, 2, ['#38e1ff', '#fff'], { speed: 2, angle: Math.PI / 2, spread: 0.8, life: 14 });
          if (g.phase === 'finish') {
            g.resultT++;
            if (g.resultT > 220 || (g.resultT > 60 && input.okP)) {
              // 没跑完的按距离排名
              const rest = g.runners.filter((r) => !r.done).sort((a, b) => b.dist - a.dist);
              g.finish = g.finish.concat(rest);
              const place = g.finish.indexOf(me) + 1;
              if (place > 2) { api.end({ overText: '止步第 ' + (g.race + 1) + ' 场' }); g.phase = 'done'; return; }
              g.race++;
              if (g.race >= 3) { st.cup = true; st.score += 5000; api.end({ clear: true, clearText: '捧起奖杯!' }); g.phase = 'done'; return; }
              setupRace();
              fx.say('第 ' + (g.race + 1) + ' 场  ' + RACES[g.race] + 'm', '#ffd23f', 90);
            }
          }
        }
      }

      function draw(ctx) {
        if (g.phase === 'select') return drawSelect(ctx);
        const cam = me.dist;
        // 草地 + 跑道
        ctx.fillStyle = '#6ccf5a'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#5cbf4a'; for (let y = -U.wrap(-cam * PXM, 40); y < H; y += 40) ctx.fillRect(0, y, W, 20);
        ctx.fillStyle = '#f0d8b0'; ctx.fillRect(28, 0, 184, H);
        ctx.fillStyle = '#e8c898'; for (let y = -U.wrap(-cam * PXM, 16); y < H; y += 16) ctx.fillRect(28, y, 184, 2);
        ctx.fillStyle = '#fff'; for (const x of [90, 150]) for (let y = -U.wrap(-cam * PXM, 28); y < H; y += 28) ctx.fillRect(x - 1, y, 2, 14);
        ctx.fillStyle = '#fff'; ctx.fillRect(28, 0, 3, H); ctx.fillRect(209, 0, 3, H);
        // 观众旗子
        for (let i = 0; i < 12; i++) { const y = U.wrap(i * 40 + cam * PXM * 1, H + 40) - 20; ctx.fillStyle = ['#ff5a5a', '#ffd23f', '#7cc7ff', '#ff8fc7'][i % 4]; ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(20, y + 5); ctx.lineTo(8, y + 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(232, y + 20); ctx.lineTo(220, y + 25); ctx.lineTo(232, y + 30); ctx.fill(); }
        // 终点线
        const fy = PY - (g.len - cam) * PXM;
        if (fy > -20 && fy < H + 20) { for (let i = 0; i < 23; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(28 + i * 8, fy + j * 6, 8, 6); } D.text(ctx, 'FINISH', W / 2, fy - 6, { size: 10, color: '#e0342f', align: 'center', outline: '#fff' }); }
        // 障碍物
        for (const o of g.obs) {
          const y = PY - (o.d - cam) * PXM; if (y < -20 || y > H + 20 || o.got) continue;
          const x = LANES[o.lane];
          if (o.kind === 'hurdle') {
            if (o.broken) continue;
            ctx.fillStyle = '#fff'; ctx.fillRect(x - 20, y - 4, 40, 5); ctx.fillStyle = '#e0342f'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 20 + k * 10, y - 4, 5, 5);
            ctx.fillStyle = '#888'; ctx.fillRect(x - 20, y, 2, 6); ctx.fillRect(x + 18, y, 2, 6);
          } else if (o.kind === 'mud') { ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.ellipse(x, y, 20, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#a0703a'; ctx.beginPath(); ctx.ellipse(x - 5, y - 2, 6, 2, 0, 0, 7); ctx.fill(); }
          else if (o.kind === 'banana') { D.text(ctx, '🍌', x, y + 4, { size: 14, align: 'center' }); }
          else if (o.kind === 'bone') {
            ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y - 1.5, 12, 3);
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 6, y - 2, 2.2, 0, 7); ctx.arc(x + s * 6, y + 2, 2.2, 0, 7); ctx.fill(); }
          } else if (o.kind === 'pad') { ctx.fillStyle = '#7dffb3'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 10, y + 6 - k * 6); ctx.lineTo(x, y - k * 6); ctx.lineTo(x + 10, y + 6 - k * 6); ctx.lineTo(x + 10, y + 9 - k * 6); ctx.lineTo(x, y + 3 - k * 6); ctx.lineTo(x - 10, y + 9 - k * 6); ctx.fill(); } }
        }
        // 选手（按 y 排序）
        const list = g.runners.map((r) => ({ r, y: PY - (r.dist - cam) * PXM })).sort((a, b) => a.y - b.y);
        for (const { r, y } of list) {
          if (y < -30 || y > H + 30) continue;
          drawDog(ctx, r.c, r.x, y, r === me ? 1.25 : 1.1, r.t, { z: r.z * 1.3, me: r === me, tongue: r.speed > 0.15, spin: r.spin > 0 ? r.spin / 3 : 0 });
          if (r.turbo > 0) { ctx.strokeStyle = 'rgba(56,225,255,.7)'; ctx.beginPath(); ctx.arc(r.x, y - r.z * 1.3, 16, 0, 7); ctx.stroke(); }
        }
        // 屏幕外的对手提示
        for (const r of g.runners) {
          if (r === me) continue;
          const y = PY - (r.dist - cam) * PXM;
          if (y < 0) { D.text(ctx, '▲' + r.c.name, r.x, 30, { size: 8, color: '#fff', align: 'center', outline: '#000' }); }
          else if (y > H) { D.text(ctx, '▼' + r.c.name, r.x, H - 30, { size: 8, color: '#fff', align: 'center', outline: '#000' }); }
        }
        // HUD
        const rank = 1 + g.runners.filter((r) => r !== me && (r.dist > me.dist || (r.done && !me.done))).length;
        const rk = g.finish.includes(me) ? g.finish.indexOf(me) + 1 : rank;
        D.panel(ctx, 4, 4, 58, 34, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: rk === 1 ? '#ffd23f' : 'rgba(255,255,255,.3)' });
        D.text(ctx, rk + ['ST', 'ND', 'RD', 'TH'][rk - 1], 33, 28, { size: 18, color: rk === 1 ? '#ffd23f' : '#fff', align: 'center' });
        D.text(ctx, '第 ' + (g.race + 1) + '/3 场', W / 2, 14, { size: 9, color: '#fff', align: 'center', outline: '#000' });
        const prog = U.clamp(me.dist / g.len, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(70, 22, 100, 6);
        for (const r of g.runners) { ctx.fillStyle = r === me ? '#ffd23f' : r.c.body; ctx.fillRect(70 + U.clamp(r.dist / g.len, 0, 1) * 96, 20, 4, 10); }
        D.text(ctx, Math.max(0, Math.ceil(g.len - me.dist)) + 'm', W / 2, 40, { size: 8, color: '#fff', align: 'center', outline: '#000' });
        D.panel(ctx, W - 62, 4, 58, 34, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: 'rgba(56,225,255,.6)' });
        D.text(ctx, '涡轮', W - 33, 16, { size: 8, color: '#38e1ff', align: 'center' });
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < g.charges ? '#38e1ff' : 'rgba(255,255,255,.2)'; ctx.fillRect(W - 54 + i * 16, 22, 12, 6); }
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < g.boneBits ? '#fff' : 'rgba(255,255,255,.2)'; ctx.fillRect(W - 50 + i * 14, 31, 8, 2); }
        if (g.phase === 'count') {
          const n = Math.ceil(g.countT / 50);
          D.text(ctx, n > 0 ? String(n) : 'GO!', W / 2, 150, { size: 36, color: '#fff', align: 'center', outline: '#e0342f', lw: 6 });
          if (g.race === 0) D.text(ctx, '跳起来再按 OK = 涡轮冲刺', W / 2, 180, { size: 9, color: '#fff', align: 'center', outline: '#000' });
        }
        if (g.phase === 'finish' && g.resultT > 40) drawResults(ctx);
      }
      function drawResults(ctx) {
        const order = g.finish.concat(g.runners.filter((r) => !r.done).sort((a, b) => b.dist - a.dist));
        D.panel(ctx, 30, 90, 180, 130, {});
        D.text(ctx, '第 ' + (g.race + 1) + ' 场 成绩', W / 2, 110, { size: 11, color: '#ffd23f', align: 'center' });
        order.forEach((r, i) => {
          const y = 132 + i * 20;
          drawDog(ctx, r.c, 60, y, 0.7, g.t, {});
          D.text(ctx, (i + 1) + '.  ' + r.c.name + (r === me ? '（你）' : ''), 76, y + 4, { size: 10, color: r === me ? '#ffd23f' : '#fff' });
        });
        D.text(ctx, g.resultT > 60 ? 'OK 继续' : '', W / 2, 212, { size: 9, color: '#b8ad9c', align: 'center' });
      }
      function drawSelect(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#ffd9ec', '#ffb3d6']); ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc((i * 47) % W, (i * 71 + g.t * 0.3) % H, 3, 0, 7); ctx.fill(); }
        D.text(ctx, '选择你的小短腿', W / 2, 44, { size: 14, color: '#6a1a4a', align: 'center' });
        CHARS.forEach((c, i) => {
          const y = 76 + i * 56, on = i === g.sel;
          D.panel(ctx, 24, y, 192, 48, { r: 10, fill: on ? '#fff' : 'rgba(255,255,255,.55)', stroke: on ? '#e0342f' : 'rgba(0,0,0,.1)', lw: on ? 2 : 1 });
          drawDog(ctx, c, 52, y + 28, on ? 1.5 : 1.3, on ? g.t : 0, { tongue: on });
          D.text(ctx, c.name, 80, y + 22, { size: 13, color: '#3a1a2a' });
          D.text(ctx, c.perk, 80, y + 38, { size: 9, color: '#8a4a6a' });
          if (on) D.text(ctx, '◀', 206, y + 29, { size: 10, color: '#e0342f', align: 'right' });
        });
        D.text(ctx, 'UP / DOWN 选择 · OK 出发', W / 2, 310, { size: 9, color: '#6a1a4a', align: 'center' });
      }

      return { update, draw };
    }
  });
})();
