// simulator/games/fishhunter.js — 大鱼吃小鱼（新作，对应 games/fish-hunter）
// 小鱼自动巡游：UP/DOWN 上下，OK 掉头冲刺；吃小躲大，连吞有连击，长到 6 级成鱼王反吃鲨鱼
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, TOP = 30, BOTTOM = 296;
  const NEED = [0, 6, 10, 14, 18, 24, 9999];
  const SPECIES = [
    { body: '#ffb020', fin: '#ff7a00', stripe: '#fff3c4' },
    { body: '#38b8ff', fin: '#1a78c0', stripe: '#c2ecff' },
    { body: '#ff6b8a', fin: '#c03a5a', stripe: '#ffd0da' },
    { body: '#7ad07a', fin: '#3a8a3a', stripe: '#d8f5d0' },
    { body: '#b58cff', fin: '#6a3ac0', stripe: '#e6d8ff' }
  ];
  const radiusOf = (lv) => 5 + lv * 3.2;

  A.define({
    id: 'fishhunter',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, level: 1, maxCombo: 0, eaten: 0 });
      const p = { x: 120, y: 160, dir: 1, vx: 0, vy: 0, level: 1, xp: 0, dash: 0, cool: 0, inv: 120, mouth: 0, t: 0 };
      const g = { t: 0, fish: [], jelly: [], bubbles: [], pearls: [], lives: 3, combo: 0, comboT: 0, spawnT: 30, dead: 0, over: false, overT: 0, king: false };
      for (let i = 0; i < 30; i++) g.bubbles.push({ x: U.rand(0, W), y: U.rand(0, H), r: U.rand(1, 3), s: U.rand(0.2, 0.7) });

      function spawnFish() {
        const fromLeft = U.chance(0.5);
        let lv;
        const roll = Math.random();
        if (roll < 0.64) lv = Math.max(0.5, p.level - U.rand(0.4, Math.min(p.level, 2.6)));
        else if (roll < 0.93) lv = p.level + U.rand(1, 2.2);
        else lv = p.level;
        const shark = lv >= 6.5 || (lv > p.level + 1 && U.chance(0.25));
        g.fish.push({
          x: fromLeft ? -30 : W + 30, y: U.rand(TOP + 20, BOTTOM - 20), dir: fromLeft ? 1 : -1,
          lv: shark ? Math.max(lv, 6.5) : lv, spd: U.rand(0.5, 1.1) * (shark ? 1.2 : 1), sp: SPECIES[U.randi(0, SPECIES.length - 1)],
          wob: U.rand(0, 6), shark, chase: shark
        });
      }
      function spawnJelly() { g.jelly.push({ x: U.rand(20, 220), y: BOTTOM + 20, vy: -U.rand(0.3, 0.6), t: U.rand(0, 6) }); }

      function hurt() {
        if (p.inv > 0 || g.dead) return;
        g.lives--; g.dead = 70; g.combo = 0;
        sfx.hurt(); fx.addShake(8); fx.flash('#ff3b3b', 0.4); fx.hitstop(6);
        fx.burst(p.x, p.y, 24, ['#fff', '#ff5a5a', SPECIES[0].body], { speed: 3 });
      }
      function levelUp() {
        p.level++; p.xp = 0; st.level = p.level;
        fx.ring(p.x, p.y, '#7dffb3', 50); fx.flash('#7dffb3', 0.2); sfx.power();
        if (p.level >= 6) { g.king = true; fx.say('鱼王诞生！鲨鱼也能吃了', '#ffd23f', 110); }
        else fx.say('长大了！LV ' + p.level, '#7dffb3', 70);
      }

      function update(input) {
        g.t++; p.t++;
        if (g.over) { if (++g.overT === 60) api.end(); return; }
        if (g.dead > 0) {
          if (--g.dead === 0) {
            if (g.lives < 0) { g.over = true; return; }
            p.x = 120; p.y = 160; p.inv = 150; p.dash = 0;
          }
          return;
        }
        // 控制
        const sp = 1.25 + (p.dash > 0 ? 1.8 : 0);
        if (input.okP && p.cool <= 0) { p.dir = -p.dir; p.dash = 24; p.cool = 36; sfx.whoosh(); fx.burst(p.x - p.dir * 8, p.y, 6, ['#fff', '#bfe9ff'], { speed: 1.5, life: 16 }); }
        if (p.dash > 0) p.dash--;
        if (p.cool > 0) p.cool--;
        p.vx = U.approach(p.vx, p.dir * sp, 0.25);
        const vdir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        p.vy = U.approach(p.vy, vdir * 1.8, 0.22);
        p.x += p.vx; p.y += p.vy;
        const r = radiusOf(p.level);
        if (p.x < r) { p.x = r; p.dir = 1; } if (p.x > W - r) { p.x = W - r; p.dir = -1; }
        p.y = U.clamp(p.y, TOP + r, BOTTOM - r);
        if (p.inv > 0) p.inv--;
        if (p.mouth > 0) p.mouth--;

        // 生成
        if (--g.spawnT <= 0) { spawnFish(); g.spawnT = Math.max(22, 55 - p.level * 4); }
        if (g.t % 360 === 0) spawnJelly();
        if (g.t % 600 === 300) g.pearls.push({ x: U.rand(20, 220), y: BOTTOM - 6, t: 480 });

        // 鱼
        for (const f of g.fish) {
          f.wob += 0.1;
          if (f.chase && !g.king && Math.abs(f.x - p.x) < 120) { f.y += Math.sign(p.y - f.y) * 0.35; }
          f.x += f.dir * f.spd * (f.shark ? 1.1 : 1);
          f.y += Math.sin(f.wob) * 0.3;
          if (f.x < -50 || f.x > W + 50) f.gone = true;
          const fr = radiusOf(f.lv);
          if (U.circ(p.x, p.y, r * 0.8, f.x, f.y, fr * 0.75)) {
            const edible = f.lv < p.level || (g.king && f.shark);
            if (edible) {
              f.gone = true; p.mouth = 10;
              g.combo = g.comboT > 0 ? g.combo + 1 : 1; g.comboT = 100;
              st.maxCombo = Math.max(st.maxCombo, g.combo); st.eaten++;
              const pts = Math.round((f.lv + 1) * 20 * g.combo * (f.shark ? 10 : 1));
              st.score += pts;
              p.xp += Math.max(1, Math.round(f.lv));
              fx.floatText(f.x, f.y - 10, (g.combo > 1 ? 'x' + g.combo + ' ' : '') + '+' + pts, g.combo > 4 ? '#ffd23f' : '#fff', g.combo > 4 ? 10 : 8);
              fx.burst(f.x, f.y, 8, ['#fff', f.sp.body], { speed: 2, life: 18 });
              sfx.combo(g.combo);
              if (f.shark) { fx.addShake(8); fx.say('吃掉鲨鱼！', '#ffd23f', 60); }
              if (p.xp >= NEED[p.level] && p.level < 6) levelUp();
            } else if (f.lv > p.level) hurt();
          }
        }
        g.fish = g.fish.filter((f) => !f.gone);
        if (g.comboT > 0 && --g.comboT === 0) g.combo = 0;
        // 水母
        for (const j of g.jelly) {
          j.t += 0.05; j.y += j.vy + Math.sin(j.t * 3) * 0.2; j.x += Math.sin(j.t) * 0.3;
          if (j.y < -20) j.gone = true;
          if (!j.hit && U.circ(p.x, p.y, r * 0.8, j.x, j.y, 8) && p.inv <= 0) {
            j.hit = true; j.gone = true; p.inv = 60;
            p.xp = Math.max(0, p.xp - 4); g.combo = 0;
            fx.floatText(p.x, p.y - 16, '被蛰了！', '#ff8ad8', 9); fx.flash('#ff8ad8', 0.25); sfx.hurt();
          }
        }
        g.jelly = g.jelly.filter((j) => !j.gone);
        // 珍珠
        for (const q of g.pearls) {
          q.t--; if (q.t <= 0) q.gone = true;
          if (U.circ(p.x, p.y, r, q.x, q.y, 6)) { q.gone = true; st.score += 500; fx.floatText(q.x, q.y - 10, '珍珠 +500', '#fff', 9); sfx.pickup(); fx.spark(q.x, q.y, '#fff', 8); }
        }
        g.pearls = g.pearls.filter((q) => !q.gone);
        for (const b of g.bubbles) { b.y -= b.s; if (b.y < 0) { b.y = H; b.x = U.rand(0, W); } }
      }

      function drawFish(ctx, x, y, rad, dir, sp, t, opts) {
        opts = opts || {};
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        const wag = Math.sin(t * 0.3) * rad * 0.25;
        if (opts.shark) {
          ctx.fillStyle = '#6a7a8a';
          ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.5, rad * 0.6, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-rad * 1.3, 0); ctx.lineTo(-rad * 2.1, -rad * 0.7 + wag); ctx.lineTo(-rad * 1.9, 0); ctx.lineTo(-rad * 2.1, rad * 0.6 + wag); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-rad * 0.2, -rad * 0.5); ctx.lineTo(rad * 0.1, -rad * 1.2); ctx.lineTo(rad * 0.4, -rad * 0.5); ctx.fill();
          ctx.fillStyle = '#dde4ea'; ctx.beginPath(); ctx.ellipse(rad * 0.2, rad * 0.25, rad * 1.1, rad * 0.28, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(rad * 0.9, -rad * 0.15, Math.max(1.5, rad * 0.1), 0, 7); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rad * 0.9, rad * 0.25); ctx.lineTo(rad * 1.35, rad * 0.2); ctx.stroke();
          ctx.restore(); return;
        }
        ctx.fillStyle = sp.fin;
        ctx.beginPath(); ctx.moveTo(-rad * 0.7, 0); ctx.lineTo(-rad * 1.5, -rad * 0.7 + wag); ctx.lineTo(-rad * 1.5, rad * 0.7 + wag); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-rad * 0.2, -rad * 0.6); ctx.lineTo(rad * 0.3, -rad * 1.05); ctx.lineTo(rad * 0.5, -rad * 0.55); ctx.fill();
        ctx.fillStyle = sp.body; ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * 0.72, 0, 0, 7); ctx.fill();
        ctx.fillStyle = sp.stripe; ctx.fillRect(-rad * 0.35, -rad * 0.6, rad * 0.22, rad * 1.2);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(rad * 0.45, -rad * 0.15, Math.max(1.8, rad * 0.24), 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(rad * 0.52, -rad * 0.15, Math.max(1, rad * 0.12), 0, 7); ctx.fill();
        if (opts.mouth) { ctx.fillStyle = '#3a0a1a'; ctx.beginPath(); ctx.moveTo(rad, 0); ctx.lineTo(rad * 0.55, -rad * 0.2); ctx.lineTo(rad * 0.55, rad * 0.25); ctx.fill(); }
        if (opts.crown) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-rad * 0.3, -rad * 0.7); ctx.lineTo(-rad * 0.3, -rad * 1.2); ctx.lineTo(0, -rad * 0.95); ctx.lineTo(rad * 0.2, -rad * 1.3); ctx.lineTo(rad * 0.4, -rad * 0.95); ctx.lineTo(rad * 0.6, -rad * 1.2); ctx.lineTo(rad * 0.6, -rad * 0.7); ctx.fill(); }
        ctx.restore();
      }

      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#1a8ad0', '#0a3a6a', '#061a3a']); ctx.fillRect(0, 0, W, H);
        // 光柱
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let i = 0; i < 4; i++) { const x = 30 + i * 60 + Math.sin(g.t / 80 + i) * 12; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 60, H); ctx.lineTo(x + 30, H); ctx.fill(); }
        // 海底
        ctx.fillStyle = '#c8a86a'; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, BOTTOM + 4 + Math.sin(x / 30) * 4);
        ctx.lineTo(W, H); ctx.fill();
        for (let i = 0; i < 7; i++) { const x = 14 + i * 36; ctx.strokeStyle = '#2a8a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, BOTTOM + 6); ctx.quadraticCurveTo(x + Math.sin(g.t / 30 + i) * 8, BOTTOM - 20, x + Math.sin(g.t / 25 + i) * 5, BOTTOM - 34 - (i % 3) * 8); ctx.stroke(); }
        ctx.lineWidth = 1;
        for (const b of g.bubbles) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); }
        for (const q of g.pearls) { ctx.fillStyle = '#8a6a9a'; ctx.beginPath(); ctx.ellipse(q.x, q.y + 2, 9, 4, 0, 0, 7); ctx.fill(); if (q.t > 100 || (g.t >> 3) % 2) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y - 1, 3.5, 0, 7); ctx.fill(); } }
        for (const j of g.jelly) {
          ctx.fillStyle = 'rgba(255,138,216,.75)'; ctx.beginPath(); ctx.arc(j.x, j.y, 8, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = 'rgba(255,138,216,.6)'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(j.x + k * 4, j.y); ctx.quadraticCurveTo(j.x + k * 4 + Math.sin(g.t / 8 + k) * 3, j.y + 8, j.x + k * 4, j.y + 14); ctx.stroke(); }
        }
        for (const f of g.fish) {
          const rad = radiusOf(f.lv), edible = f.lv < p.level || (g.king && f.shark);
          // 可吃 / 危险 的颜色圈
          ctx.strokeStyle = edible ? 'rgba(125,255,179,.55)' : 'rgba(255,90,90,.55)';
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, rad * (f.shark ? 1.6 : 1.15), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
          drawFish(ctx, f.x, f.y, rad, f.dir, f.sp, g.t + f.wob * 10, { shark: f.shark });
        }
        if (g.dead === 0 && !(p.inv > 0 && (g.t >> 2) % 2)) {
          drawFish(ctx, p.x, p.y, radiusOf(p.level), p.dir, { body: '#ffd23f', fin: '#ff7a00', stripe: '#fff' }, g.t, { mouth: p.mouth > 0, crown: g.king });
          if (p.dash > 0) fx.spark(p.x - p.dir * radiusOf(p.level), p.y, '#fff', 1);
        }
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, 28);
        D.text(ctx, U.fmt(st.score), 6, 12, { size: 10, color: '#fff' });
        D.text(ctx, 'LV ' + p.level + (g.king ? ' 鱼王' : ''), W / 2, 12, { size: 9, color: '#ffd23f', align: 'center' });
        D.text(ctx, '♥' + Math.max(0, g.lives), W - 6, 12, { size: 10, color: '#ff8a80', align: 'right' });
        D.bar(ctx, 6, 18, W - 12, 5, p.level >= 6 ? 1 : p.xp / NEED[p.level], '#7dffb3', 'rgba(255,255,255,.15)');
        if (g.combo > 1) D.text(ctx, g.combo + ' 连吞!', W / 2, 44, { size: 12, color: g.combo > 5 ? '#ffd23f' : '#fff', align: 'center', outline: '#000' });
        if (g.t > 0 && g.t < 220) D.text(ctx, '绿圈能吃 · 红圈快跑', W / 2, 250, { size: 10, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
