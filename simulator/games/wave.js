// simulator/games/wave.js — 浪涌漫游者（重制）
// 一键冲浪：按住 OK 顺着浪往下压加速，浪尖松手飞起；空中 UP/DOWN 翻跟头，落地板面对齐才算完美
// 天色会暗下来，跑得够快、过浮标能续上白天
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, PX = 70, G = 0.12;

  A.define({
    id: 'wave',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, dist: 0, flips: 0, perfect: 0 });
      const seeds = [U.rand(0, 6), U.rand(0, 6), U.rand(0, 6)];
      // 海浪高度函数（波长随距离变长，更好飞）
      const wave = (x) => 210 + Math.sin(x / 90 + seeds[0]) * 38 + Math.sin(x / 37 + seeds[1]) * 12 + Math.sin(x / 190 + seeds[2]) * 22;
      const slope = (x) => (wave(x + 1) - wave(x - 1)) / 2;
      const o = { x: 0, y: wave(0) - 2, vx: 2.4, vy: 0, air: false, rot: 0, spin: 0, flips: 0, wipe: 0 };
      const g = { t: 0, day: 50, buoy: 800, camY: 0, zoom: 1, chain: 0, over: false, overT: 0, trail: [], clouds: [], birds: 0 };
      for (let i = 0; i < 6; i++) g.clouds.push({ x: U.rand(0, 400), y: U.rand(30, 120), w: U.rand(30, 70) });

      function land() {
        const a = Math.atan(slope(o.x));
        let diff = U.wrap(o.rot - a + Math.PI, Math.PI * 2) - Math.PI;
        o.air = false; o.y = wave(o.x);
        const flips = Math.floor(Math.abs(o.spin) / (Math.PI * 2) + 0.15);
        if (Math.abs(diff) < 0.55) {
          const down = slope(o.x) > 0;
          const good = down ? '完美落水' : '落水';
          let pts = 100;
          if (flips > 0) { pts += 600 * flips * flips; st.flips += flips; }
          if (down) { st.perfect++; g.chain++; pts *= g.chain; o.vx += 0.8; fx.burst(PX, o.y - g.camY, 14, ['#fff', '#bfeaff'], { speed: 3, angle: -Math.PI / 2, spread: 2 }); sfx.combo(g.chain + 2); }
          else { g.chain = 0; sfx.land(); }
          st.score += pts;
          fx.floatText(PX, (o.y - g.camY) * g.zoom - 30, (flips ? flips + ' 空翻 · ' : '') + good + ' +' + pts, down ? '#ffd23f' : '#fff', flips ? 10 : 8);
          if (flips) fx.say(flips >= 2 ? flips + ' 连空翻!' : '后空翻!', '#ffd23f', 45);
        } else {
          o.wipe = 50; o.vx = Math.max(1.4, o.vx * 0.45); g.chain = 0;
          fx.floatText(PX, (o.y - g.camY) * g.zoom - 30, '翻车!', '#ff6b6b', 10);
          fx.burst(PX, (o.y - g.camY) * g.zoom, 20, ['#fff', '#bfeaff'], { speed: 3 }); sfx.hurt(); fx.addShake(5);
        }
        o.rot = a; o.spin = 0; o.sp = Math.hypot(o.vx, o.vy) * Math.max(0.3, Math.cos(diff));
      }

      function update(input) {
        g.t++;
        if (g.over) { o.vx *= 0.97; o.x += o.vx; o.y = wave(o.x); if (++g.overT === 90) api.end({ clear: true, clearText: '日落了' }); return; }
        const press = input.ok;
        if (o.wipe > 0) o.wipe--;
        if (!o.air) {
          const s = slope(o.x), a = Math.atan(s);
          // 沿坡速度（能量守恒 + 摩擦）：下坡按住加倍，上坡按住反而更慢，不按会慢慢减速
          const mult = press && o.wipe === 0 ? (s > 0 ? 2.6 : 1.4) : 1;
          o.sp = U.clamp((o.sp || 2.4) + Math.sin(a) * G * 3 * mult - (press && s > 0 ? 0.002 : 0.014), 1.2, 9);
          o.vx = o.sp * Math.cos(a);
          const nx = o.x + o.vx;
          const ny = wave(nx);
          // 冲过浪尖：速度够就飞起来
          const vy = (ny - o.y);
          if (!press && s < -0.15 && slope(nx) > s + 0.02 && o.sp > 2.8) {
            o.air = true; o.vy = vy * 1.05 - 0.4; sfx.whoosh();
          }
          o.x = nx; o.y = o.air ? o.y + o.vy : ny;
          o.rot = o.air ? o.rot : a;
          if (g.t % 3 === 0 && o.vx > 3) fx.burst(PX - 6, (o.y - g.camY) * g.zoom + 4, 1, ['#fff'], { speed: 1.2, angle: Math.PI + 0.4, spread: 0.6, life: 14 });
        } else {
          o.vy += G * (press ? 2.2 : 1);
          o.x += o.vx; o.y += o.vy;
          const r = (input.up ? -0.14 : 0) + (input.down ? 0.14 : 0);
          o.rot += r; o.spin += r;
          if (o.y >= wave(o.x)) land();
        }
        st.dist = Math.floor(o.x / 10);
        st.score += Math.floor(o.vx / 3);
        // 天色 / 浮标
        g.day -= 1 / 60;
        if (o.x > g.buoy) { g.day = Math.min(50, g.day + 6); g.buoy += 1600 + o.x * 0.12; fx.say('浮标 +7 秒', '#7dffb3', 60); sfx.pickup(); st.score += 500; }
        if (g.day <= 0) { g.day = 0; g.over = true; sfx.over(); }
        // 镜头：高空时拉远
        const high = Math.max(0, 150 - o.y);
        g.zoom = U.lerp(g.zoom, 1 / (1 + high / 260), 0.08);
        g.camY = U.lerp(g.camY, Math.min(0, o.y - 170), 0.1);
        g.trail.push({ x: o.x, y: o.y }); if (g.trail.length > 14) g.trail.shift();
      }

      function draw(ctx) {
        const k = g.day / 50;
        const sky = k > 0.5 ? ['#4ec0ff', '#ffe6b0'] : k > 0.2 ? ['#ff7a5a', '#ffd08a'] : ['#1a1440', '#7a3a6a'];
        ctx.fillStyle = D.vgrad(ctx, 0, H, sky); ctx.fillRect(0, 0, W, H);
        // 太阳沿弧线下落
        const sy = 40 + (1 - k) * 200;
        ctx.fillStyle = k > 0.3 ? '#fff6c8' : '#ff9a5a'; ctx.beginPath(); ctx.arc(190, sy, 16, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        for (const c of g.clouds) { const x = U.wrap(c.x - o.x * 0.1, W + 80) - 40; D.rrect(ctx, x, c.y, c.w, 10, 5); ctx.fill(); }
        ctx.save();
        ctx.translate(PX, 0); ctx.scale(g.zoom, g.zoom); ctx.translate(-PX, -g.camY);
        const left = o.x - PX / g.zoom - 10, right = o.x + (W - PX) / g.zoom + 10;
        // 远浪
        ctx.fillStyle = k > 0.3 ? 'rgba(20,120,200,.35)' : 'rgba(40,40,120,.4)';
        ctx.beginPath(); ctx.moveTo(PX - 400, 600);
        for (let x = left; x <= right; x += 6) ctx.lineTo(PX + (x - o.x), wave(x * 0.7 + 300) - 30);
        ctx.lineTo(PX + (right - o.x), 600); ctx.fill();
        // 浮标
        const bx = PX + (g.buoy - o.x);
        if (bx < W / g.zoom + 60) { const by = wave(g.buoy); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(bx - 3, by - 16, 6, 16); ctx.fillStyle = '#fff'; ctx.fillRect(bx - 3, by - 11, 6, 3); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(bx, by - 18, 3, 0, 7); ctx.fill(); }
        // 主浪
        const grd = D.vgrad(ctx, 150, 330, k > 0.3 ? ['#2aa8e8', '#0a4a8a'] : ['#3a3a8a', '#10103a']);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.moveTo(PX + (left - o.x), 700);
        for (let x = left; x <= right; x += 4) ctx.lineTo(PX + (x - o.x), wave(x));
        ctx.lineTo(PX + (right - o.x), 700); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = left; x <= right; x += 4) { const y = wave(x); if (x === left) ctx.moveTo(PX + (x - o.x), y); else ctx.lineTo(PX + (x - o.x), y); }
        ctx.stroke(); ctx.lineWidth = 1;
        // 轨迹
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath();
        g.trail.forEach((p, i) => { const X = PX + (p.x - o.x); if (i) ctx.lineTo(X, p.y - 4); else ctx.moveTo(X, p.y - 4); }); ctx.stroke();
        // 海獭
        ctx.save(); ctx.translate(PX, o.y - 4); ctx.rotate(o.rot);
        ctx.fillStyle = '#ffb020'; D.rrect(ctx, -12, 2, 24, 4, 2); ctx.fill();
        ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-12, 3, 24, 1);
        if (o.wipe > 0) ctx.rotate(Math.sin(g.t) * 0.5);
        ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.ellipse(0, -5, 6, 7, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(1, -14, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8c89a'; ctx.beginPath(); ctx.ellipse(3, -12, 3, 2.2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(-1, -17, 6, 2); ctx.fillRect(4, -13, 1.5, 1.5);
        ctx.restore();
        ctx.restore();
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 16, { size: 10, color: '#fff', outline: '#000' });
        D.text(ctx, st.dist + 'm', W - 8, 16, { size: 9, color: '#fff', align: 'right', outline: '#000' });
        D.text(ctx, '☀', 8, 32, { size: 9, color: '#ffd23f' });
        D.bar(ctx, 22, 26, 90, 5, k, k < 0.25 ? '#ff5a5a' : '#ffd23f', 'rgba(0,0,0,.3)');
        D.text(ctx, Math.round(o.vx * 20) + ' km/h', W - 8, 32, { size: 8, color: '#bfeaff', align: 'right', outline: '#000' });
        if (g.chain > 1) D.text(ctx, '完美 x' + g.chain, W / 2, 50, { size: 11, color: '#ffd23f', align: 'center', outline: '#000' });
        if (o.air && Math.abs(o.spin) > 1) D.text(ctx, Math.floor(Math.abs(o.spin) / 6.28 + 0.15) + ' 圈', W / 2, 70, { size: 10, color: '#fff', align: 'center', outline: '#000' });
        if (g.t > 0 && g.t < 260) D.text(ctx, '下坡按住 OK 加速 · 浪尖松手起飞', W / 2, 100, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
