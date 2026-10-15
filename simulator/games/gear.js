// simulator/games/gear.js — 齿轮骑兵（重制）
// 横版骑枪冲锋：OK 骑枪突刺，UP 跃马（二段），DOWN 地面滑铲 / 空中下刺；击杀攒蒸汽，满压自动过载；每 900m 铁巨人
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, S = 1.5, VW = 160, VH = 214, GROUND = 176, PX = 38;

  const HORSE = [
    '..........aa....',
    '.........abba...',
    '........abbbba..',
    '..aaaaaaabbbcba.',
    '.abbbbbbbbbbaa..',
    'abbbbbbbbbbba...',
    'a.bbbbbbbbbba...',
    '..bddbbbbddb....',
    '..b..b..b..b....',
    '..e..e..e..e....'
  ];
  const HORSE2 = [
    '..........aa....',
    '.........abba...',
    '........abbbba..',
    '..aaaaaaabbbcba.',
    '.abbbbbbbbbbaa..',
    'abbbbbbbbbbba...',
    'a.bbbbbbbbbba...',
    '..bddbbbbddb....',
    '.b...b..b...b...',
    'e....e..e....e..'
  ];
  const HPAL = { a: '#3a2410', b: '#b8864a', c: '#ffd23f', d: '#8a5a2b', e: '#2a2a2a' };
  const KNIGHT = ['..aa..', '.abba.', '.acca.', '..aa..', '.dddd.', 'dddddd', '.dddd.'];
  const KPAL = { a: '#6a6a78', b: '#c8c8d8', c: '#38e1ff', d: '#8a3a2a' };
  const SOLD = ['..aaa..', '.abcba.', '..aaa..', '.ddddd.', 'dd.d.dd', '.ddddd.', '.e...e.', '.e...e.'];
  const SPAL = { a: '#8a6a3a', b: '#ffd23f', c: '#ff3b3b', d: '#6a5a4a', e: '#3a3a3a' };

  A.define({
    id: 'gearcavalry',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, dist: 0, kills: 0, maxCombo: 0, bosses: 0 });
      const g = { t: 0, cam: 0, speed: 1.6, ents: [], pits: [], hp: 3, steam: 0, od: 0, combo: 0, comboT: 0, spawnT: 60, over: false, overT: 0, boss: null, nextBoss: 900 * 4, gears: [] };
      const p = { y: GROUND, vy: 0, ground: true, jumps: 2, slide: 0, plunge: false, lance: 0, lcool: 0, inv: 90, anim: 0 };
      const SX = (x) => (x - g.cam) * S, SY = (y) => y * S;
      for (let i = 0; i < 10; i++) g.gears.push({ x: i * 40, r: U.rand(10, 20), a: U.rand(0, 6), s: U.pick([-1, 1]) * U.rand(0.02, 0.05), y: U.rand(40, 150) });

      const inPit = (x) => g.pits.some((q) => x > q.x && x < q.x + q.w);
      function addScore(n, x, y, c) { st.score += n; if (x != null) fx.floatText(SX(x), SY(y), '+' + n, c || '#fff'); }
      function kill(e, how) {
        e.dead = true; st.kills++;
        g.combo++; g.comboT = 150; st.maxCombo = Math.max(st.maxCombo, g.combo);
        const base = { soldier: 100, shield: 250, spider: 150, bird: 150, barrel: 80 }[e.kind] || 100;
        addScore(base * Math.min(8, g.combo), e.x, e.y - 20, g.combo > 3 ? '#ffd23f' : '#fff');
        if (g.od <= 0) { g.steam = Math.min(100, g.steam + 12); if (g.steam >= 100) { g.od = 300; g.steam = 0; fx.say('蒸汽过载!', '#ff8a3b', 70); sfx.power(); fx.flash('#ff8a3b', 0.3); } }
        fx.debris(SX(e.x), SY(e.y - 8), ['#b8864a', '#ffd23f', '#6a6a78', '#fff'], 14);
        sfx.combo(Math.min(16, g.combo)); fx.hitstop(2); fx.addShake(3);
        if (how) fx.floatText(SX(e.x), SY(e.y - 30), how, '#7cc7ff', 8);
      }
      function hurt() {
        if (p.inv > 0 || g.od > 0) return;
        g.hp--; p.inv = 100; g.combo = 0;
        sfx.hurt(); fx.addShake(8); fx.flash('#ff3b3b', 0.35); fx.hitstop(5);
        if (g.hp <= 0) { g.over = true; sfx.boom(true); }
      }
      function spawn() {
        const x = g.cam + VW + 20;
        const d = Math.min(1, st.dist / 3000);
        const r = Math.random();
        if (r < 0.3) g.ents.push({ kind: 'soldier', x, y: GROUND, vx: -0.4 });
        else if (r < 0.45) g.ents.push({ kind: 'shield', x, y: GROUND, vx: -0.3 });
        else if (r < 0.6) g.ents.push({ kind: 'spider', x, y: GROUND, vx: -0.9 });
        else if (r < 0.75) g.ents.push({ kind: 'bird', x, y: GROUND - 34 - U.rand(0, 14), vx: -0.8, t: 0 });
        else if (r < 0.87) g.ents.push({ kind: 'barrel', x, y: GROUND, vx: -1.4, rot: 0 });
        else if (!inPit(x - 30)) g.pits.push({ x: x + 10, w: U.rand(22, 30 + d * 12) });
        if (d > 0.4 && U.chance(0.3)) g.ents.push({ kind: 'soldier', x: x + 30, y: GROUND, vx: -0.4 });
      }

      function update(input) {
        g.t++;
        if (g.over) { p.vy += 0.3; p.y += p.vy; if (++g.overT === 70) api.end({ overText: '战马倒下了' }); return; }
        const od = g.od > 0;
        if (od) g.od--;
        if (!g.boss) g.speed = Math.min(3, 1.6 + st.dist / 3000);
        const mv = g.boss ? 0 : g.speed * (od ? 1.5 : 1);
        g.cam += mv; st.dist = Math.floor(g.cam / 4);
        const px = g.cam + PX;

        // BOSS
        if (!g.boss && g.cam > g.nextBoss) {
          g.boss = { x: g.cam + VW - 26, hp: 10 + st.bosses * 4, max: 10 + st.bosses * 4, t: 0, open: 0, flash: 0 };
          g.ents = g.ents.filter((e) => e.x < g.cam + VW); fx.say('铁巨人来袭!', '#ff5a5a', 90); sfx.tone(160, 0.5, { type: 'sawtooth', vol: 0.12 });
        }
        // 控制
        if (input.upP && p.jumps > 0) { p.vy = p.ground ? -5 : -4.2; p.ground = false; p.jumps--; p.slide = 0; sfx.jump(); }
        if (input.downP) { if (p.ground) { p.slide = 30; sfx.noise(0.15, { vol: 0.07, f: 2000 }); } else { p.plunge = true; p.vy = 6; sfx.whoosh(); } }
        if (input.okP && p.lcool <= 0) { p.lance = 14; p.lcool = 20; sfx.tone(700, 0.08, { type: 'sawtooth', vol: 0.05, to: 1400 }); }
        if (p.lance > 0) p.lance--; if (p.lcool > 0) p.lcool--; if (p.slide > 0) p.slide--; if (p.inv > 0) p.inv--;
        p.vy += p.plunge ? 0.5 : 0.32; p.y += p.vy;
        if (p.y >= GROUND && !inPit(px)) {
          if (!p.ground) { sfx.land(); if (p.plunge) { fx.ring(SX(px), SY(GROUND), '#7cc7ff', 30); fx.addShake(4); for (const e of g.ents) if (!e.dead && Math.abs(e.x - px) < 28 && e.kind !== 'bird') kill(e, '震地!'); } }
          p.y = GROUND; p.vy = 0; p.ground = true; p.jumps = 2; p.plunge = false;
        } else if (p.y < GROUND - 1 || inPit(px)) p.ground = false;
        if (p.y > VH + 20) { g.hp = 1; p.inv = 0; g.od = 0; hurt(); return; }
        p.anim += mv + 0.5;

        if (!g.boss && --g.spawnT <= 0) { spawn(); g.spawnT = Math.max(32, 80 - st.dist / 60) + U.randi(0, 30); }

        // 判定盒
        const sliding = p.slide > 0 && p.ground;
        const body = sliding ? { x: px - 10, y: p.y - 8, w: 22, h: 8 } : { x: px - 10, y: p.y - 22, w: 20, h: 22 };
        const lance = p.lance > 4 ? { x: px + 8, y: p.y - 22, w: 30, h: 8 } : null;
        for (const e of g.ents) {
          if (e.dead) continue;
          e.x += e.vx; if (e.kind === 'bird') { e.t++; e.y += Math.sin(e.t / 10) * 0.4; }
          if (e.kind === 'barrel') e.rot -= 0.15;
          if (e.x < g.cam - 30) { e.dead = true; continue; }
          const eb = e.kind === 'bird' ? { x: e.x - 7, y: e.y - 6, w: 14, h: 10 } : e.kind === 'spider' ? { x: e.x - 8, y: e.y - 8, w: 16, h: 8 } : e.kind === 'barrel' ? { x: e.x - 7, y: e.y - 14, w: 14, h: 14 } : { x: e.x - 6, y: e.y - 18, w: 12, h: 18 };
          if (od && U.hit(body, eb)) { kill(e, '过载冲撞!'); continue; }
          if (lance && U.hit(lance, eb)) {
            if (e.kind === 'shield') { e.vx = 0.8; e.x += 10; fx.spark(SX(e.x - 6), SY(e.y - 10), '#fff', 6); sfx.tone(1800, 0.05, { vol: 0.05 }); fx.floatText(SX(e.x), SY(e.y - 28), '盾挡! 下刺它', '#ccc', 8); p.lance = 0; }
            else if (e.kind === 'spider') { /* 太矮，骑枪够不着 */ }
            else { kill(e, e.kind === 'bird' ? '挑落!' : null); continue; }
          }
          if (p.plunge && U.hit({ x: px - 10, y: p.y - 8, w: 20, h: 10 }, eb) && e.kind !== 'barrel') { kill(e, '下刺!'); p.vy = -4; p.plunge = false; p.jumps = 1; continue; }
          if (sliding && (e.kind === 'spider') && U.hit(body, eb)) { kill(e, '碾碎!'); continue; }
          if (U.hit(body, eb)) { if (sliding && e.kind === 'bird') continue; hurt(); e.dead = e.kind !== 'shield'; }
        }
        g.ents = g.ents.filter((e) => !e.dead);
        g.pits = g.pits.filter((q) => q.x + q.w > g.cam - 20);
        if (g.comboT > 0 && --g.comboT === 0) g.combo = 0;

        const b = g.boss;
        if (b) {
          b.t++; if (b.flash > 0) b.flash--;
          b.open = (b.t % 120) > 70 ? 1 : 0;
          if (b.t % 90 === 40) g.ents.push({ kind: U.chance(0.5) ? 'barrel' : 'spider', x: b.x - 10, y: GROUND, vx: -1.3, rot: 0 });
          if (b.t % 150 === 100) g.ents.push({ kind: 'bird', x: b.x - 10, y: GROUND - 40, vx: -1.2, t: 0 });
          const core = { x: b.x - 8, y: GROUND - 60, w: 16, h: 16 };
          const hitCore = (lance && U.hit(lance, core)) || (p.plunge && U.hit({ x: px - 10, y: p.y - 8, w: 20, h: 10 }, { x: b.x - 18, y: GROUND - 80, w: 36, h: 10 }));
          if (hitCore && b.flash === 0) {
            if (b.open || p.plunge) {
              b.hp--; b.flash = 20; fx.burst(SX(b.x), SY(GROUND - 52), 16, ['#ffd23f', '#fff', '#ff5a5a']); sfx.boom(false); fx.hitstop(4); fx.addShake(5);
              if (p.plunge) { p.vy = -5; p.plunge = false; p.jumps = 1; }
              if (b.hp <= 0) {
                st.bosses++; addScore(5000 * st.bosses, b.x, GROUND - 60, '#ffd23f');
                fx.burst(SX(b.x), SY(GROUND - 40), 60, ['#fff', '#ffd23f', '#ff7b3a', '#6a6a78'], { speed: 5, life: 50 }); fx.flash('#fff', 0.7); sfx.boom(true); sfx.clear();
                fx.say('铁巨人倒下!', '#7dffb3', 90);
                g.boss = null; g.nextBoss = g.cam + 900 * 4; g.hp = Math.min(3, g.hp + 1);
              }
            } else { fx.spark(SX(b.x - 8), SY(GROUND - 52), '#aaa', 4); sfx.tone(2000, 0.04, { vol: 0.04 }); }
          }
          if (b && U.hit(body, { x: b.x - 20, y: GROUND - 90, w: 40, h: 90 })) { hurt(); }
        }
        for (const q of g.gears) { q.a += q.s; }
      }

      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#2a1a10', '#5a3a1a', '#8a5a2a']); ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.scale(S, S);
        // 背景齿轮
        for (const q of g.gears) {
          const x = U.wrap(q.x - g.cam * 0.3, 200) - 20;
          ctx.save(); ctx.translate(x, q.y); ctx.rotate(q.a);
          ctx.fillStyle = 'rgba(40,24,10,.55)';
          for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -q.r - 4, 4, 6); }
          ctx.beginPath(); ctx.arc(0, 0, q.r, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(90,58,26,.8)'; ctx.beginPath(); ctx.arc(0, 0, q.r * 0.35, 0, 7); ctx.fill();
          ctx.restore();
        }
        // 管道
        ctx.fillStyle = '#4a3018'; for (let i = -1; i < 6; i++) { const x = i * 40 - U.wrap(g.cam * 0.6, 40); ctx.fillRect(x, 120, 6, GROUND - 120); ctx.fillStyle = '#b8864a'; ctx.fillRect(x - 1, 150, 8, 3); ctx.fillStyle = '#4a3018'; }
        // 地面
        ctx.fillStyle = '#3a2410'; ctx.fillRect(0, GROUND, VW, VH - GROUND);
        ctx.fillStyle = '#b8864a'; for (let x = -U.wrap(g.cam, 12); x < VW; x += 12) ctx.fillRect(x, GROUND, 8, 3);
        for (const q of g.pits) { const x = q.x - g.cam; ctx.fillStyle = '#120a04'; ctx.fillRect(x, GROUND, q.w, VH - GROUND); ctx.fillStyle = '#ff7b3a'; ctx.globalAlpha = 0.4; ctx.fillRect(x, VH - 10, q.w, 10); ctx.globalAlpha = 1; }
        // BOSS
        const b = g.boss;
        if (b) {
          const x = b.x - g.cam, fl = b.flash > 0 && (g.t % 4 < 2);
          ctx.fillStyle = fl ? '#fff' : '#5a5a68'; ctx.fillRect(x - 20, GROUND - 90, 40, 90);
          ctx.fillStyle = fl ? '#fff' : '#3a3a48'; ctx.fillRect(x - 26, GROUND - 70, 8, 40); ctx.fillRect(x + 18, GROUND - 70, 8, 40);
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 10, GROUND - 84, 6, 4); ctx.fillRect(x + 4, GROUND - 84, 6, 4);
          ctx.fillStyle = b.open ? ((g.t >> 2) % 2 ? '#ff3b3b' : '#ffd23f') : '#2a2a34';
          ctx.beginPath(); ctx.arc(x, GROUND - 52, 8, 0, 7); ctx.fill();
          if (b.open) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, GROUND - 52, 11, 0, 7); ctx.stroke(); }
        }
        // 敌人
        for (const e of g.ents) {
          const x = e.x - g.cam;
          if (e.kind === 'soldier') D.sprite(ctx, SOLD, SPAL, x - 7, e.y - 18, { scale: 2.2 / 1.9 });
          else if (e.kind === 'shield') { D.sprite(ctx, SOLD, Object.assign({}, SPAL, { d: '#4a5a7a' }), x - 7, e.y - 18, { scale: 2.2 / 1.9 }); ctx.fillStyle = '#9aa0aa'; ctx.fillRect(x - 10, e.y - 18, 4, 16); ctx.fillStyle = '#fff'; ctx.fillRect(x - 10, e.y - 18, 1, 16); }
          else if (e.kind === 'spider') { ctx.fillStyle = '#3a3a48'; ctx.beginPath(); ctx.ellipse(x, e.y - 4, 7, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - 5, e.y - 6, 2, 2); ctx.strokeStyle = '#3a3a48'; for (let k = -1; k <= 1; k += 2) for (let j = 0; j < 3; j++) { const f = Math.sin(g.t / 3 + j) * 2; ctx.beginPath(); ctx.moveTo(x + k * 4, e.y - 4); ctx.lineTo(x + k * (8 + j * 2), e.y - 1 + f); ctx.stroke(); } }
          else if (e.kind === 'bird') { ctx.fillStyle = '#8a8a98'; ctx.beginPath(); ctx.ellipse(x, e.y, 6, 4, 0, 0, 7); ctx.fill(); const f = Math.sin(e.t / 3) * 5; ctx.fillStyle = '#c8c8d8'; ctx.beginPath(); ctx.moveTo(x - 2, e.y); ctx.lineTo(x + 2, e.y - 4 - f); ctx.lineTo(x + 5, e.y); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 8, e.y - 1, 3, 2); }
          else if (e.kind === 'barrel') { ctx.save(); ctx.translate(x, e.y - 7); ctx.rotate(e.rot); ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#b8864a'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke(); ctx.restore(); }
        }
        // 骑士
        if (!(p.inv > 0 && (g.t >> 2) % 2) || g.over) {
          const x = PX, y = p.y, sl = p.slide > 0 && p.ground;
          ctx.save(); ctx.translate(x, y); if (sl) ctx.rotate(-0.25); if (p.plunge) ctx.rotate(0.35);
          if (g.od > 0) { ctx.fillStyle = 'rgba(255,138,59,.35)'; ctx.beginPath(); ctx.arc(0, -12, 18, 0, 7); ctx.fill(); }
          D.sprite(ctx, (p.anim >> 3) % 2 ? HORSE : HORSE2, HPAL, -12, -10, { scale: 1.5 });
          D.sprite(ctx, KNIGHT, KPAL, -2, -22, { scale: 1.4 });
          // 骑枪
          const reach = p.lance > 4 ? 30 : p.lance > 0 ? 18 : 12;
          ctx.fillStyle = '#c8c8d8'; ctx.fillRect(4, -16, reach, 2);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(4 + reach, -18); ctx.lineTo(10 + reach, -15); ctx.lineTo(4 + reach, -12); ctx.fill();
          if (p.lance > 4) { ctx.fillStyle = 'rgba(124,199,255,.5)'; ctx.fillRect(10, -18, reach, 6); }
          ctx.restore();
          if (g.t % 4 === 0 && p.ground && !g.boss) fx.burst(SX(g.cam + PX - 10), SY(GROUND), 1, ['#b8864a'], { speed: 1, angle: Math.PI, spread: 1, life: 10 });
        }
        ctx.restore();
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, 20);
        D.text(ctx, U.fmt(st.score), 6, 14, { size: 10, color: '#fff' });
        D.text(ctx, st.dist + 'm', W / 2, 14, { size: 9, color: '#ffd23f', align: 'center' });
        for (let i = 0; i < 3; i++) D.text(ctx, '♥', W - 10 - i * 12, 14, { size: 10, color: i < g.hp ? '#ff6b6b' : 'rgba(255,255,255,.2)', align: 'center' });
        D.text(ctx, g.od > 0 ? '过载!' : '蒸汽', 6, H - 10, { size: 8, color: g.od > 0 ? '#ff8a3b' : '#fff' });
        D.bar(ctx, 34, H - 16, 80, 6, g.od > 0 ? g.od / 300 : g.steam / 100, g.od > 0 ? '#ff8a3b' : '#ffd23f');
        if (g.combo > 1) D.text(ctx, g.combo + ' 连击', W - 8, H - 10, { size: 10, color: '#ffd23f', align: 'right' });
        if (g.boss) { D.text(ctx, '铁巨人', 8, 34, { size: 8, color: '#ff5a5a' }); D.bar(ctx, 44, 28, 150, 5, g.boss.hp / g.boss.max, '#ff5a5a'); D.text(ctx, '核心发光时戳它 / 下刺头顶', W / 2, 50, { size: 8, color: '#fff', align: 'center', outline: '#000' }); }
        if (g.t > 0 && g.t < 240) D.text(ctx, '盾兵要下刺 · 蜘蛛要滑铲 · 其余骑枪戳', W / 2, 90, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
