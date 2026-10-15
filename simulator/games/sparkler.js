// simulator/games/sparkler.js — 仙女棒（重制：烟花大会）
// 左中右三根发射筒对应 UP / OK / DOWN：烟花飞到光圈里再按就炸开，越准越大；连续完美会攒满压轴大烟花
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, TX = [52, 120, 188], APEX = 104, BASE = 292;
  const PALETTES = [['#ff4d6d', '#ffd23f'], ['#38b8ff', '#bff4ff'], ['#7dffb3', '#fff'], ['#ff6be0', '#b06bff'], ['#ffb020', '#ff4d6d'], ['#fff', '#ffd23f']];

  A.define({
    id: 'sparkler',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, perfect: 0, maxCombo: 0, finales: 0 });
      const g = { t: 0, rockets: [], shells: [], sparks: [], duds: 0, combo: 0, finale: 0, finaleT: 0, spawnT: 60, stars: [], over: false, overT: 0, judge: null, judgeT: 0 };
      for (let i = 0; i < 50; i++) g.stars.push({ x: U.rand(0, W), y: U.rand(0, 220), b: U.rand(0.2, 0.8) });

      function launch() {
        const tube = U.randi(0, 2);
        if (g.rockets.some((r) => r.tube === tube && r.y > APEX + 80)) return;
        const speed = Math.min(1.8, 1 + g.t / 5000);
        g.rockets.push({ tube, y: BASE, vy: -(3.2 + U.rand(0, 0.12)) * speed, g: 0.028 * speed * speed, pal: U.pick(PALETTES), trail: [] });
        sfx.tone(200, 0.3, { type: 'sawtooth', vol: 0.03, to: 900 });
      }
      function burst(x, y, pal, size, perfect) {
        const n = Math.round(30 * size);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, sp = (1.2 + Math.random() * 0.6) * (1.4 + size);
          g.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 60 + size * 20, max: 60 + size * 20, c: pal[i % 2], tw: perfect && i % 3 === 0 });
        }
        if (perfect) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.sparks.push({ x, y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: 90, max: 90, c: '#fff', tw: true }); }
        sfx.boom(size > 1.2);
        sfx.tone(1400 + Math.random() * 400, 0.3, { type: 'triangle', vol: 0.03, to: 600, delay: 0.1 });
      }
      function fire(tube) {
        // 找这根筒里最接近光圈的烟花
        let best = null, bd = 1e9;
        for (const r of g.rockets) if (r.tube === tube && !r.done) { const d = Math.abs(r.y - APEX); if (d < bd) { bd = d; best = r; } }
        if (!best || bd > 46) { sfx.tick(); show('太早了', '#aaa'); return; }
        best.done = true;
        const x = TX[tube];
        if (bd <= 8) {
          g.combo++; st.perfect++; st.maxCombo = Math.max(st.maxCombo, g.combo);
          g.finale = Math.min(100, g.finale + 12);
          const pts = 300 * Math.min(6, 1 + Math.floor(g.combo / 5));
          st.score += pts; show('完美 +' + pts, '#ffd23f');
          burst(x, best.y, best.pal, 1.6, true); fx.addShake(3);
        } else if (bd <= 22) {
          g.combo++; st.maxCombo = Math.max(st.maxCombo, g.combo); g.finale = Math.min(100, g.finale + 5);
          const pts = 120 * Math.min(6, 1 + Math.floor(g.combo / 5)); st.score += pts; show('漂亮 +' + pts, '#7dffb3');
          burst(x, best.y, best.pal, 1.1, false);
        } else {
          g.combo = 0; st.score += 30; show('勉强', '#aaa');
          burst(x, best.y, best.pal, 0.6, false);
        }
        if (g.finale >= 100 && g.finaleT === 0) { g.finaleT = 150; g.finale = 0; st.finales++; st.score += 3000; fx.say('压轴大烟花! +3000', '#ffd23f', 90); sfx.clear(); }
      }
      function show(t, c) { g.judge = { t, c }; g.judgeT = 30; }

      function update(input) {
        g.t++;
        if (g.judgeT > 0) g.judgeT--;
        for (const s of g.sparks) { s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.03; s.x += s.vx; s.y += s.vy; s.life--; }
        g.sparks = g.sparks.filter((s) => s.life > 0);
        if (g.finaleT > 0) { g.finaleT--; if (g.finaleT % 8 === 0) burst(U.rand(30, 210), U.rand(50, 150), U.pick(PALETTES), U.rand(1, 1.8), true); }
        if (g.over) { if (++g.overT === 90) api.end({ overText: '烟花放完了' }); return; }
        if (input.upP) fire(0);
        if (input.okP) fire(1);
        if (input.downP) fire(2);
        if (--g.spawnT <= 0) { launch(); if (g.t > 1500 && U.chance(0.25)) launch(); g.spawnT = Math.max(24, 70 - g.t / 60); }
        for (const r of g.rockets) {
          if (r.done) continue;
          r.vy += r.g; r.y += r.vy;
          r.trail.push(r.y); if (r.trail.length > 10) r.trail.shift();
          if (r.vy > 0.4 || r.y < 20) {
            r.done = true; g.duds++; g.combo = 0; show('哑炮!', '#ff6b6b');
            g.sparks.push({ x: TX[r.tube], y: r.y, vx: 0, vy: 0.5, life: 30, max: 30, c: '#888' });
            sfx.tone(120, 0.2, { type: 'sine', vol: 0.08 });
            if (g.duds >= 5) { g.over = true; sfx.over(); }
          }
        }
        g.rockets = g.rockets.filter((r) => !r.done);
      }

      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#050616', '#141040', '#2a1a4a']); ctx.fillRect(0, 0, W, H);
        for (const s of g.stars) { ctx.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(g.t / 20 + s.x)); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, 1, 1); }
        ctx.globalAlpha = 1;
        // 城市剪影与河面倒影
        ctx.fillStyle = '#0a0a1a';
        for (let i = 0; i < 12; i++) { const h = 16 + ((i * 37) % 5) * 7; ctx.fillRect(i * 20, 262 - h, 18, h); }
        ctx.fillStyle = '#0a1030'; ctx.fillRect(0, 262, W, 58);
        // 火花
        for (const s of g.sparks) {
          const a = s.life / s.max;
          ctx.globalAlpha = s.tw ? a * (0.5 + 0.5 * Math.sin(g.t + s.x)) : a;
          ctx.fillStyle = s.c; ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
          if (s.y < 262) { ctx.globalAlpha *= 0.25; ctx.fillRect(s.x - 1, 524 - s.y, 2, 1); }
        }
        ctx.globalAlpha = 1;
        // 光圈
        for (let i = 0; i < 3; i++) {
          const near = g.rockets.some((r) => r.tube === i && Math.abs(r.y - APEX) < 22);
          ctx.strokeStyle = near ? '#ffd23f' : 'rgba(255,255,255,.25)'; ctx.lineWidth = near ? 2 : 1;
          ctx.beginPath(); ctx.arc(TX[i], APEX, 10, 0, 7); ctx.stroke();
          ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(TX[i], APEX, 24, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        }
        // 火箭
        for (const r of g.rockets) {
          const x = TX[r.tube];
          r.trail.forEach((y, i) => { ctx.globalAlpha = i / 10; ctx.fillStyle = '#ffb020'; ctx.fillRect(x - 1, y + 4, 2, 3); });
          ctx.globalAlpha = 1;
          ctx.fillStyle = r.pal[0]; ctx.fillRect(x - 2, r.y - 4, 4, 8);
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, r.y - 5, 2, 2);
        }
        // 发射筒
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#6a2a2a'; ctx.fillRect(TX[i] - 6, BASE - 6, 12, 22);
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(TX[i] - 6, BASE - 6, 12, 2);
          D.panel(ctx, TX[i] - 15, H - 18, 30, 14, { r: 4, fill: i === 1 ? '#8a5a10' : '#2a2230', stroke: 'rgba(255,255,255,.3)', lw: 1 });
          D.text(ctx, ['UP', 'OK', 'DN'][i], TX[i], H - 8, { size: 7, color: '#fff', align: 'center' });
        }
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 16, { size: 10, color: '#fff' });
        for (let i = 0; i < 5; i++) { ctx.fillStyle = i < 5 - g.duds ? '#ffd23f' : 'rgba(255,255,255,.15)'; ctx.fillRect(W - 12 - i * 9, 8, 6, 9); }
        D.text(ctx, '压轴', 8, 32, { size: 8, color: '#ff6be0' });
        D.bar(ctx, 32, 26, 80, 5, g.finale / 100, '#ff6be0');
        if (g.combo > 1) D.text(ctx, g.combo + ' 连发', W - 8, 32, { size: 9, color: '#ffd23f', align: 'right' });
        if (g.judgeT > 0) { ctx.globalAlpha = Math.min(1, g.judgeT / 10); D.text(ctx, g.judge.t, W / 2, 62, { size: 12, color: g.judge.c, align: 'center', outline: '#000' }); ctx.globalAlpha = 1; }
        if (g.t > 0 && g.t < 240) D.text(ctx, '烟花飞进光圈时按对应的键', W / 2, 180, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
