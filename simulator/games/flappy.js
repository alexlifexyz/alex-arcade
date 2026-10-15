// simulator/games/flappy.js — 像素飞鸟（重制）
// 一键扑翼 + 管缝金币 + 擦边奖励 + 每 10 根换场景（黄昏 / 夜晚 / 呼吸管 / 金管）+ 结算奖牌
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, GROUND = 280, BX = 64;
  const BIRD = [
    '....aaaaa...',
    '..aabbbbca..',
    '.abbbbbcdca.',
    'aeeebbbcdca.',
    'aeeeebbbccaa',
    'abeeebbaffff',
    '.abbbbaffff.',
    '..aabbbaaa..',
    '....aaa.....'
  ];
  const BIRD2 = [
    '....aaaaa...',
    '..aabbbbca..',
    '.abbbbbcdca.',
    'abbbbbbcdca.',
    'abbbbbbbccaa',
    'aeeeebbaffff',
    'aeeeeaaffff.',
    '.aaaabbaaa..',
    '....aaa.....'
  ];
  const PAL = { a: '#3a2a10', b: '#ffd23f', c: '#fff', d: '#111', e: '#ffec9a', f: '#ff7b3a' };
  const ZONES = [
    { sky: ['#4ec0ff', '#bfeaff'], pipe: '#5ac84a', pipeD: '#3a8a2a', city: '#a8dcf0', name: '晴空' },
    { sky: ['#ff8a5a', '#ffd9a0'], pipe: '#e0a030', pipeD: '#a06a10', city: '#e8a878', name: '黄昏' },
    { sky: ['#0a0e2a', '#2a2a6a'], pipe: '#6a5ae0', pipeD: '#3a2a9a', city: '#1a1a44', name: '夜空', stars: true },
    { sky: ['#1a0a2a', '#6a2a6a'], pipe: '#ffd23f', pipeD: '#b08a10', city: '#3a1a4a', name: '黄金之路', stars: true }
  ];

  A.define({
    id: 'flappy',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, pipes: 0, coins: 0, grazes: 0 });
      const g = { t: 0, y: 150, vy: 0, rot: 0, pipes: [], coins: [], dist: 0, spawnX: 0, dead: false, deadT: 0, zone: 0, zoneFlash: 0, started: false };
      const speed = () => 1.7 + Math.min(0.8, st.pipes * 0.02);
      const gap = () => Math.max(66, 88 - st.pipes * 0.6);

      function spawnPipe() {
        const gp = gap();
        const cy = U.rand(70 + gp / 2, GROUND - 30 - gp / 2);
        const n = g.pipes.length ? g.pipes[g.pipes.length - 1].n + 1 : 1;
        const zone = Math.min(3, Math.floor((n - 1) / 10));
        const moving = n > 20 ? U.rand(8, 18) : 0;
        g.pipes.push({ x: W + 20, cy, gap: gp, n, zone, moving, ph: U.rand(0, 6), passed: false, grazed: false, gold: n > 30 });
        if (U.chance(0.55)) g.coins.push({ x: W + 20 + 13, y: cy + U.rand(-gp / 4, gp / 4), t: 0 });
      }
      function die() {
        if (g.dead) return;
        g.dead = true; g.deadT = 0; g.vy = -3;
        sfx.hurt(); fx.flash('#fff', 0.7); fx.addShake(8); fx.hitstop(4);
      }
      function medal() { const n = st.pipes; return n >= 40 ? '白金' : n >= 30 ? '金牌' : n >= 20 ? '银牌' : n >= 10 ? '铜牌' : ''; }

      function update(input) {
        g.t++;
        let flap = input.okP || input.upP || input.downP;
        if (api.demo) { const nx = g.pipes.find((q) => q.x + 30 > BX); const ty = nx ? nx.cy + 8 : 150; flap = g.y > ty && g.vy > -1; }
        if (g.dead) {
          g.vy = Math.min(7, g.vy + 0.4); g.y = Math.min(GROUND - 6, g.y + g.vy); g.rot = Math.min(Math.PI / 2, g.rot + 0.15);
          if (++g.deadT === 70) { const m = medal(); api.end({ overText: m ? 'GAME OVER · ' + m : 'GAME OVER' }); }
          return;
        }
        if (flap) { g.vy = -5.1; sfx.tone(700, 0.06, { type: 'square', vol: 0.05, to: 1000 }); fx.burst(BX - 6, g.y + 2, 3, ['#fff'], { speed: 1.2, angle: Math.PI * 0.8, spread: 1, life: 12 }); g.started = true; }
        g.vy = Math.min(6.5, g.vy + 0.3);
        g.y += g.vy;
        g.rot = U.clamp(g.vy * 0.09, -0.45, 1.2);
        if (g.y < -10) { g.y = -10; g.vy = 0; }
        if (g.y > GROUND - 6) { g.y = GROUND - 6; die(); return; }

        const sp = speed();
        g.dist += sp;
        if ((g.pipes.length === 0 && g.t > 40) || (g.pipes.length && g.pipes[g.pipes.length - 1].x < W - 118)) spawnPipe();
        for (const p of g.pipes) {
          p.x -= sp;
          if (p.moving) p.cy += Math.cos(g.t / 40 + p.ph) * p.moving / 40;
          const top = p.cy - p.gap / 2, bot = p.cy + p.gap / 2;
          // 碰撞（小鸟判定圆半径 6）
          if (BX + 6 > p.x && BX - 6 < p.x + 26) {
            if (g.y - 5 < top || g.y + 5 > bot) { die(); return; }
            const m = Math.min(g.y - 5 - top, bot - (g.y + 5));
            if (m < 5 && !p.grazed) { p.grazed = true; st.grazes++; st.score += 30; fx.floatText(BX, g.y - 14, '擦边 +30', '#7cc7ff', 8); sfx.tone(1600, 0.04, { vol: 0.04 }); }
          }
          if (!p.passed && p.x + 26 < BX - 6) {
            p.passed = true; st.pipes++;
            const v = p.gold ? 300 : 100;
            st.score += v;
            sfx.coin();
            if (p.gold) fx.floatText(BX, g.y - 20, '金管 +300', '#ffd23f', 9);
            const z = Math.min(3, Math.floor(st.pipes / 10));
            if (z !== g.zone) { g.zone = z; g.zoneFlash = 90; fx.say('进入' + ZONES[z].name, '#fff', 80); sfx.power(); }
          }
        }
        g.pipes = g.pipes.filter((p) => p.x > -40);
        for (const c of g.coins) {
          c.x -= sp; c.t++;
          if (!c.got && Math.abs(c.x - BX) < 10 && Math.abs(c.y - g.y) < 10) {
            c.got = true; st.coins++; st.score += 50;
            fx.spark(c.x, c.y, '#ffd23f', 8); sfx.pickup();
          }
        }
        g.coins = g.coins.filter((c) => c.x > -20 && !c.got);
        if (g.zoneFlash > 0) g.zoneFlash--;
      }

      function drawPipe(ctx, x, y0, y1, z, cap, gold) {
        const Z = ZONES[z];
        const body = gold ? '#ffd23f' : Z.pipe, dark = gold ? '#b08a10' : Z.pipeD;
        ctx.fillStyle = body; ctx.fillRect(x, y0, 26, y1 - y0);
        ctx.fillStyle = dark; ctx.fillRect(x + 20, y0, 6, y1 - y0);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 3, y0, 3, y1 - y0);
        const cy = cap === 'top' ? y1 - 12 : y0;
        ctx.fillStyle = body; ctx.fillRect(x - 3, cy, 32, 12);
        ctx.fillStyle = dark; ctx.fillRect(x + 22, cy, 7, 12);
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeRect(x - 2.5, cy + 0.5, 31, 11);
      }
      function draw(ctx) {
        const Z = ZONES[g.zone];
        ctx.fillStyle = D.vgrad(ctx, 0, GROUND, Z.sky); ctx.fillRect(0, 0, W, GROUND);
        if (Z.stars) { ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = (i * 53 - g.dist * 0.05) % W; ctx.globalAlpha = 0.3 + ((i * 7 + (g.t >> 4)) % 5) / 8; ctx.fillRect(U.wrap(x, W), (i * 37) % 200, 1, 1); } ctx.globalAlpha = 1; }
        // 云与城市
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (let i = 0; i < 5; i++) { const x = U.wrap(i * 70 - g.dist * 0.15, W + 60) - 30; D.rrect(ctx, x, 40 + (i * 29) % 70, 40, 12, 6); ctx.fill(); }
        ctx.fillStyle = Z.city;
        for (let i = 0; i < 14; i++) { const x = U.wrap(i * 20 - g.dist * 0.3, W + 20) - 20; const h = 20 + (i * 13 % 5) * 9; ctx.fillRect(x, GROUND - h, 18, h); }
        // 管子
        for (const p of g.pipes) {
          drawPipe(ctx, p.x, 0, p.cy - p.gap / 2, p.zone, 'top', p.gold);
          drawPipe(ctx, p.x, p.cy + p.gap / 2, GROUND, p.zone, 'bot', p.gold);
        }
        for (const c of g.coins) {
          const sq = Math.abs(Math.cos(c.t / 8));
          ctx.fillStyle = '#b08a10'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5 * sq + 1, 5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 4 * sq + 0.5, 4, 0, 0, 7); ctx.fill();
        }
        // 地面
        ctx.fillStyle = '#ded895'; ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.fillStyle = '#5ac84a'; ctx.fillRect(0, GROUND, W, 6);
        ctx.fillStyle = '#3a8a2a';
        for (let x = -U.wrap(g.dist, 12); x < W; x += 12) ctx.fillRect(x, GROUND + 2, 6, 4);
        ctx.fillStyle = '#c8b870'; for (let x = -U.wrap(g.dist, 24); x < W; x += 24) ctx.fillRect(x, GROUND + 14, 12, 2);
        // 鸟
        ctx.save(); ctx.translate(BX, g.y); ctx.rotate(g.rot);
        D.sprite(ctx, (g.t >> 3) % 2 && !g.dead ? BIRD2 : BIRD, PAL, 0, 0, { center: true, scale: 1.6 });
        ctx.restore();
        // HUD
        D.text(ctx, String(st.pipes), W / 2, 44, { size: 28, color: '#fff', align: 'center', outline: '#3a2a10', lw: 5 });
        D.text(ctx, U.fmt(st.score) + ' 分', W / 2, 60, { size: 9, color: '#fff', align: 'center', outline: '#000' });
        D.text(ctx, '● ' + st.coins, 8, H - 12, { size: 10, color: '#ffd23f', outline: '#3a2a10' });
        const m = medal(); if (m) D.text(ctx, m, W - 8, H - 12, { size: 10, color: m === '白金' ? '#e0f0ff' : m === '金牌' ? '#ffd23f' : m === '银牌' ? '#d0d0d0' : '#d88a4a', align: 'right', outline: '#000' });
        if (!g.started && g.t > 0) D.text(ctx, '点击 / 任意键扑翼', W / 2, 200, { size: 10, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
