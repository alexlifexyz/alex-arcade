// simulator/games/splasher.js — 水枪狂欢节（重制）
// 60 秒射击馆：窗口和街上冒出灰扑扑的打工人，抛物线水弹命中就换上花衬衫跳舞；墙面被一点点涂上颜色
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, GX = 120, GY = 300, GRAV = 0.09;
  const PAINT = ['#ff4d6d', '#ffb020', '#3ee07a', '#38b8ff', '#b06bff', '#ff6be0', '#22d3ee'];
  const WINDOWS = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) WINDOWS.push({ x: 30 + c * 60, y: 60 + r * 52 });
  const STREET = 244;

  A.define({
    id: 'splasher',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, hits: 0, maxCombo: 0 });
      const g = { t: 0, ang: -Math.PI / 2, drops: [], people: [], splats: [], combo: 0, fireT: 0, spawnT: 30, turnV: 0 };
      const busy = new Set();

      function spawn() {
        const r = Math.random();
        if (r < 0.62) {
          const free = WINDOWS.map((w, i) => i).filter((i) => !busy.has(i));
          if (!free.length) return;
          const i = U.pick(free); busy.add(i);
          const kind = U.chance(0.12) ? 'boss' : U.chance(0.16) ? 'cat' : 'worker';
          g.people.push({ kind, win: i, x: WINDOWS[i].x, y: WINDOWS[i].y + 26, pop: 0, life: U.randi(110, 200) - Math.min(60, g.t / 60), happy: 0 });
        } else {
          const left = U.chance(0.5);
          const kind = U.chance(0.1) ? 'boss' : U.chance(0.15) ? 'cat' : 'worker';
          g.people.push({ kind, x: left ? -12 : W + 12, y: STREET, vx: (left ? 1 : -1) * U.rand(0.5, 1.1), walk: true, pop: 1, life: 999, happy: 0 });
        }
      }
      function fire() {
        const sp = 5.2;
        g.drops.push({ x: GX + Math.cos(g.ang) * 16, y: GY + Math.sin(g.ang) * 16, vx: Math.cos(g.ang) * sp, vy: Math.sin(g.ang) * sp, c: U.pick(PAINT) });
        sfx.noise(0.08, { vol: 0.08, f: 3000 });
      }
      function splat(x, y, c, big) {
        g.splats.push({ x, y, c, r: big ? U.rand(9, 14) : U.rand(4, 7), a: U.rand(0, 6) });
        if (g.splats.length > 160) g.splats.shift();
      }

      function update(input) {
        g.t++;
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        if (input.upP || input.downP) g.turnV = 0.012;
        if (dir) { g.turnV = Math.min(0.04, g.turnV + 0.0015); g.ang += dir * g.turnV; } else g.turnV = 0;
        g.ang = U.clamp(g.ang, -Math.PI + 0.25, -0.25);
        if (input.okP) { fire(); g.fireT = 12; }
        else if (input.ok && --g.fireT <= 0) { fire(); g.fireT = 9; }

        if (--g.spawnT <= 0) { spawn(); g.spawnT = Math.max(18, 48 - g.t / 90); }

        for (const p of g.people) {
          if (p.pop < 1) p.pop = Math.min(1, p.pop + 0.12);
          if (p.walk) { p.x += p.vx * (p.happy ? 0.3 : 1); if (p.x < -20 || p.x > W + 20) p.gone = true; }
          if (p.happy > 0) { p.happy++; if (!p.walk && p.happy > 70) p.gone = true; }
          else if (!p.walk && --p.life <= 0) p.gone = true;
          if (p.gone && p.win != null) busy.delete(p.win);
        }
        g.people = g.people.filter((p) => !p.gone);

        for (const d of g.drops) {
          d.vy += GRAV; d.x += d.vx; d.y += d.vy;
          if (d.x < -10 || d.x > W + 10 || d.y > H) { d.gone = true; if (d.y > H - 30) { g.combo = 0; } continue; }
          for (const p of g.people) {
            if (p.happy || p.pop < 0.6) continue;
            const hy = p.y - 16, hh = p.kind === 'cat' ? 12 : 22;
            if (Math.abs(d.x - p.x) < 9 && d.y > hy && d.y < hy + hh) {
              d.gone = true;
              if (p.kind === 'cat') {
                p.happy = 1; g.combo = 0; st.score = Math.max(0, st.score - 300);
                fx.floatText(p.x, hy - 6, '喵！-300', '#ff6b6b', 9); sfx.tone(900, 0.2, { type: 'sine', vol: 0.08, to: 1400 });
              } else {
                p.happy = 1; p.shirt = d.c;
                g.combo++; st.hits++; st.maxCombo = Math.max(st.maxCombo, g.combo);
                const pts = (p.kind === 'boss' ? 500 : 100) * Math.min(10, g.combo);
                st.score += pts;
                fx.floatText(p.x, hy - 6, (g.combo > 1 ? 'x' + g.combo + ' ' : '') + '+' + pts, p.kind === 'boss' ? '#ffd23f' : '#fff', p.kind === 'boss' ? 10 : 8);
                fx.burst(p.x, hy + 8, 14, [d.c, '#fff', U.pick(PAINT)], { speed: 3 });
                sfx.combo(g.combo);
                if (p.kind === 'boss') { fx.say('老板也放假了!', '#ffd23f', 60); fx.addShake(4); }
                for (let k = 0; k < 3; k++) splat(p.x + U.rand(-16, 16), hy + U.rand(-8, 20), d.c, true);
              }
              break;
            }
          }
          if (d.gone) continue;
          // 打到墙：留下颜料
          if (d.y < STREET - 20 && d.y > 36 && U.chance(0.04)) { splat(d.x, d.y, d.c, false); }
        }
        g.drops = g.drops.filter((d) => !d.gone);
      }

      function person(ctx, p) {
        const s = p.pop, x = p.x, y = p.y;
        const dance = p.happy ? Math.sin(p.happy / 3) * 3 : 0;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, s);
        if (p.kind === 'cat') {
          ctx.fillStyle = p.happy ? '#ffb020' : '#7a7a86';
          ctx.beginPath(); ctx.ellipse(0, -6, 8, 6, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(-5, -16); ctx.lineTo(-2, -10); ctx.fill();
          ctx.beginPath(); ctx.moveTo(7, -9); ctx.lineTo(5, -16); ctx.lineTo(2, -10); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(-4, -8, 2, 2); ctx.fillRect(2, -8, 2, 2);
          ctx.restore(); return;
        }
        const gray = p.kind === 'boss' ? '#8a7a4a' : '#6a6a74';
        ctx.fillStyle = p.happy ? p.shirt : gray;
        ctx.fillRect(-7 + dance * 0.3, -16, 14, 16);
        if (p.happy) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(-5 + (i % 2) * 6, -14 + i * 4, 3, 2); }
        else { ctx.fillStyle = '#3a3a44'; ctx.fillRect(-1, -16, 2, 10); }
        ctx.fillStyle = p.happy ? '#ffd0a0' : '#b8b0a8';
        ctx.beginPath(); ctx.arc(dance * 0.5, -22, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#222';
        if (p.happy) { ctx.fillRect(-3 + dance * 0.5, -24, 2, 1); ctx.fillRect(1 + dance * 0.5, -24, 2, 1); ctx.fillRect(-2 + dance * 0.5, -20, 4, 1.5); }
        else { ctx.fillRect(-3, -23, 2, 2); ctx.fillRect(1, -23, 2, 2); ctx.fillRect(-2, -19, 4, 1); }
        if (p.kind === 'boss') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6 + dance * 0.5, -29, 12, 3); }
        if (p.happy) { ctx.strokeStyle = p.shirt; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -14); ctx.lineTo(-12, -22 + dance); ctx.moveTo(7, -14); ctx.lineTo(12, -22 - dance); ctx.stroke(); ctx.lineWidth = 1; }
        ctx.restore();
      }

      function draw(ctx) {
        const colorful = Math.min(1, st.hits / 40);
        ctx.fillStyle = D.vgrad(ctx, 0, H, colorful > 0.5 ? ['#7ad0ff', '#d8f2ff'] : ['#9aa4b0', '#cfd6de']); ctx.fillRect(0, 0, W, H);
        // 楼
        ctx.fillStyle = '#5a6070'; ctx.fillRect(10, 34, 220, STREET - 30);
        ctx.fillStyle = '#4a5060'; ctx.fillRect(10, 34, 220, 6);
        for (const s of g.splats) { ctx.fillStyle = s.c; ctx.globalAlpha = 0.75; ctx.beginPath(); for (let k = 0; k < 7; k++) { const a = s.a + k * 0.9, r = s.r * (0.6 + ((k * 37) % 5) / 8); ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
        for (const w of WINDOWS) {
          ctx.fillStyle = '#2a2e3a'; ctx.fillRect(w.x - 16, w.y - 4, 32, 34);
          ctx.fillStyle = '#8a92a4'; ctx.fillRect(w.x - 18, w.y + 30, 36, 3);
        }
        for (const p of g.people) if (!p.walk) { ctx.save(); ctx.beginPath(); ctx.rect(p.x - 16, WINDOWS[p.win].y - 4, 32, 34); ctx.clip(); person(ctx, p); ctx.restore(); }
        // 街道
        ctx.fillStyle = '#3a3e48'; ctx.fillRect(0, STREET, W, H - STREET);
        ctx.fillStyle = '#e8e8e8'; for (let x = 0; x < W; x += 30) ctx.fillRect(x + 6, STREET + 30, 16, 3);
        ctx.fillStyle = '#6a6e78'; ctx.fillRect(0, STREET, W, 4);
        for (const p of g.people) if (p.walk) person(ctx, p);
        // 瞄准弧线
        let x = GX + Math.cos(g.ang) * 16, y = GY + Math.sin(g.ang) * 16, vx = Math.cos(g.ang) * 5.2, vy = Math.sin(g.ang) * 5.2;
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 40; i++) { vy += GRAV; x += vx; y += vy; if (i % 3 === 0) ctx.fillRect(x - 1, y - 1, 2, 2); if (y > H || x < 0 || x > W) break; }
        for (const d of g.drops) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(d.x - 1.5, d.y - 2, 1.5, 1.5); }
        // 水枪
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(GX, GY + 8, 14, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(GX, GY); ctx.rotate(g.ang);
        ctx.fillStyle = '#0284c7'; D.rrect(ctx, 0, -5, 20, 10, 3); ctx.fill(); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(16, -5, 4, 10);
        ctx.restore();
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, 22);
        D.text(ctx, U.fmt(st.score), 6, 15, { size: 10, color: '#fff' });
        D.text(ctx, '染色 ' + st.hits, W / 2, 15, { size: 9, color: '#7dffb3', align: 'center' });
        if (g.combo > 1) D.text(ctx, 'COMBO x' + g.combo, W - 6, 15, { size: 9, color: '#ffd23f', align: 'right' });
        if (g.t > 0 && g.t < 200) D.text(ctx, '别打猫！金帽老板 5 倍分', W / 2, 228, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
