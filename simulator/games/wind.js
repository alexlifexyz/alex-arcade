// simulator/games/wind.js — 风与纸翼（重制）
// 纸飞机滑翔：UP 抬头、DOWN 压头；俯冲换速度，拉起换高度；穿风环加速，上升气流托举，雷云会打掉速度
// OK 放出一阵顺风（3 次，穿环回复）；贴地滑行会越来越慢，停下就结束
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, PX = 70, GRAV = 0.045;

  A.define({
    id: 'wind',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, dist: 0, rings: 0, maxChain: 0 });
      const seed = U.rand(0, 100);
      const ground = (x) => 290 - Math.max(0, Math.sin(x / 260 + seed) * 40 + Math.sin(x / 90 + seed * 2) * 12);
      const p = { x: 0, y: 110, v: 3.4, pitch: 0, gust: 3, skid: 0, trail: [] };
      const g = { t: 0, objs: [], next: 200, chain: 0, chainT: 0, over: false, overT: 0, camY: 0, hue: 0 };

      function spawn(x) {
        const r = Math.random();
        const gy = ground(x);
        if (r < 0.5) g.objs.push({ kind: 'ring', x, y: U.rand(60, gy - 50), hit: false });
        else if (r < 0.68) g.objs.push({ kind: 'lift', x, y: gy, w: 40 });
        else if (r < 0.82) g.objs.push({ kind: 'storm', x, y: U.rand(50, 170), hit: false });
        else g.objs.push({ kind: 'seed', x, y: U.rand(70, gy - 30), hit: false });
      }

      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 60) api.end({ overText: '纸飞机停下了' }); return; }
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        p.pitch = U.clamp(p.pitch + dir * 0.045, -0.9, 1.0);
        if (!dir) p.pitch *= 0.985;
        // 简化空气动力学：沿机头方向前进，重力分量改变速度；升力随速度
        const a = p.pitch;
        p.v += Math.sin(a) * GRAV * 3.2 - 0.0012 * p.v;
        if (input.okP && p.gust > 0) { p.gust--; p.v += 2.2; sfx.whoosh(); fx.burst(PX - 10, p.y - g.camY, 16, ['#fff', '#bff4e8'], { speed: 3, angle: Math.PI, spread: 1.2 }); fx.say('顺风!', '#bff4e8', 30); }
        p.v = U.clamp(p.v, 0.6, 9);
        const lift = Math.min(1, p.v / 3.2);
        let vy = Math.sin(a) * p.v + 0.1 + GRAV * 14 * (1 - lift);
        let vx = Math.cos(a) * p.v;
        // 失速：太慢机头会自己往下掉
        if (p.v < 1.6) p.pitch = U.approach(p.pitch, 0.7, 0.02);
        p.x += Math.max(0.8, vx);
        p.y += vy;
        if (p.y < 20) { p.y = 20; p.pitch = Math.max(p.pitch, 0); }
        const gy = ground(p.x);
        if (p.y > gy - 4) {
          p.y = gy - 4; p.pitch = Math.min(p.pitch, 0);
          p.v -= 0.03; p.skid++;
          if (g.t % 4 === 0) fx.burst(PX, p.y - g.camY + 3, 2, ['#8ad05a', '#fff'], { speed: 1.4, angle: -2.6, spread: 1, life: 14 });
          if (p.v <= 0.7) { g.over = true; sfx.over(); }
        } else p.skid = 0;
        st.dist = Math.floor(p.x / 10);
        st.score = st.dist + (g.bonus || 0);

        // 物体
        while (g.next < p.x + 400) { spawn(g.next); g.next += U.rand(90, 170); }
        for (const o of g.objs) {
          const dx = o.x - p.x;
          if (o.kind === 'ring' && !o.hit && Math.abs(dx) < 6 && Math.abs(o.y - p.y) < 16) {
            o.hit = true; st.rings++; g.chain++; g.chainT = 240; st.maxChain = Math.max(st.maxChain, g.chain);
            const pts = 100 * g.chain; g.bonus = (g.bonus || 0) + pts;
            p.v += 0.9; if (g.chain % 3 === 0) p.gust = Math.min(3, p.gust + 1);
            fx.ring(PX, o.y - g.camY, '#ffd23f', 24); fx.floatText(PX, o.y - g.camY - 18, (g.chain > 1 ? 'x' + g.chain + ' ' : '') + '+' + pts, '#ffd23f', 9);
            sfx.combo(g.chain);
          } else if (o.kind === 'ring' && !o.hit && dx < -8 && !o.missed) { o.missed = true; }
          if (o.kind === 'lift' && Math.abs(dx) < o.w / 2) { p.y -= 1.6; if (g.t % 5 === 0) fx.spark(PX + U.rand(-8, 8), p.y - g.camY + 10, '#bff4e8', 1); }
          if (o.kind === 'storm' && !o.hit && Math.abs(dx) < 18 && Math.abs(o.y - p.y) < 14) {
            o.hit = true; p.v *= 0.5; g.chain = 0; fx.flash('#fff', 0.5); fx.addShake(8); sfx.boom(false); fx.say('被雷云劈中', '#ff6b6b', 50);
          }
          if (o.kind === 'seed' && !o.hit && Math.abs(dx) < 8 && Math.abs(o.y - p.y) < 10) { o.hit = true; g.bonus = (g.bonus || 0) + 50; sfx.coin(); fx.spark(PX, o.y - g.camY, '#fff', 6); }
        }
        g.objs = g.objs.filter((o) => o.x > p.x - 100);
        if (g.chainT > 0 && --g.chainT === 0) g.chain = 0;
        g.camY = U.lerp(g.camY, U.clamp(p.y - 160, -120, 20), 0.08);
        p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 30) p.trail.shift();
        g.hue = (g.hue + 0.05) % 360;
      }

      function draw(ctx) {
        const t = (st.dist / 400) % 4;
        const skies = [['#8ad8ff', '#fff2d0'], ['#ffb08a', '#ffe0c0'], ['#7a5ab0', '#ffb0a0'], ['#1a2a5a', '#6a8ac0']];
        const sk = skies[Math.floor(t)];
        ctx.fillStyle = D.vgrad(ctx, 0, H, sk); ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(0, -g.camY);
        // 远山
        ctx.fillStyle = 'rgba(80,120,140,.35)';
        ctx.beginPath(); ctx.moveTo(0, 400);
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 240 - Math.abs(Math.sin((x + p.x * 0.3) / 70)) * 60);
        ctx.lineTo(W, 400); ctx.fill();
        // 物体
        for (const o of g.objs) {
          const x = PX + (o.x - p.x);
          if (x < -40 || x > W + 40) continue;
          if (o.kind === 'ring') {
            ctx.strokeStyle = o.hit ? 'rgba(255,210,63,.3)' : '#ffd23f'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(x, o.y, 6, 18, 0, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
          } else if (o.kind === 'lift') {
            ctx.fillStyle = 'rgba(191,244,232,.18)'; ctx.fillRect(x - o.w / 2, 0, o.w, o.y);
            ctx.strokeStyle = 'rgba(255,255,255,.4)';
            for (let k = 0; k < 4; k++) { const yy = U.wrap(o.y - g.t * 2 - k * 50, o.y); ctx.beginPath(); ctx.moveTo(x - 6 + k * 4, yy + 10); ctx.lineTo(x - 6 + k * 4, yy); ctx.stroke(); }
          } else if (o.kind === 'storm') {
            ctx.fillStyle = o.hit ? '#6a6a7a' : '#4a4a5a';
            for (const [dx, dy, r] of [[-10, 0, 10], [0, -5, 12], [11, 0, 9]]) { ctx.beginPath(); ctx.arc(x + dx, o.y + dy, r, 0, 7); ctx.fill(); }
            if ((g.t >> 3) % 5 === 0) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, o.y + 8); ctx.lineTo(x - 4, o.y + 16); ctx.lineTo(x + 2, o.y + 16); ctx.lineTo(x - 2, o.y + 26); ctx.stroke(); ctx.lineWidth = 1; }
          } else if (o.kind === 'seed' && !o.hit) {
            ctx.strokeStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + g.t * 0.02; ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x + Math.cos(a) * 5, o.y + Math.sin(a) * 5); ctx.stroke(); }
          }
        }
        // 地面
        ctx.fillStyle = '#5ab04a';
        ctx.beginPath(); ctx.moveTo(0, 500);
        for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ground(p.x - PX + x));
        ctx.lineTo(W, 500); ctx.fill();
        ctx.fillStyle = '#3a8a3a';
        for (let x = -U.wrap(p.x, 16); x < W; x += 16) ctx.fillRect(x, ground(p.x - PX + x) + 4, 2, 4);
        // 丝带轨迹
        ctx.strokeStyle = 'rgba(255,90,90,.7)'; ctx.lineWidth = 2; ctx.beginPath();
        p.trail.forEach((q, i) => { const x = PX + (q.x - p.x) - 8; if (i) ctx.lineTo(x, q.y + Math.sin(i + g.t / 5) * 2); else ctx.moveTo(x, q.y); });
        ctx.stroke(); ctx.lineWidth = 1;
        // 纸飞机
        ctx.save(); ctx.translate(PX, p.y); ctx.rotate(p.pitch);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-10, -7); ctx.lineTo(-6, 0); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d8e0ea'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, 0); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.restore();
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 16, { size: 10, color: '#fff', outline: '#000' });
        D.text(ctx, st.dist + 'm', W - 8, 16, { size: 9, color: '#fff', align: 'right', outline: '#000' });
        D.text(ctx, '速度', 8, 32, { size: 8, color: '#fff', outline: '#000' });
        D.bar(ctx, 30, 26, 70, 5, p.v / 9, p.v < 1.6 ? '#ff6b6b' : '#7dffb3', 'rgba(0,0,0,.3)');
        for (let i = 0; i < 3; i++) D.text(ctx, '≋', W - 10 - i * 14, 34, { size: 10, color: i < p.gust ? '#bff4e8' : 'rgba(255,255,255,.25)', align: 'center' });
        if (g.chain > 1) D.text(ctx, '风环 x' + g.chain, W / 2, 50, { size: 11, color: '#ffd23f', align: 'center', outline: '#000' });
        if (p.v < 1.6 && g.t % 30 < 20) D.text(ctx, '失速! 压低机头', W / 2, 70, { size: 10, color: '#ff6b6b', align: 'center', outline: '#000' });
        if (g.t > 0 && g.t < 260) D.text(ctx, '俯冲换速度，拉起换高度', W / 2, 110, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
