// simulator/games/flydriver.js — 果蝇超跑（重制：光速隧道）
// 管道隧道里 360° 绕圈：UP/DOWN 沿管壁转动（整个世界跟着旋转），OK 按住加速；躲障碍环，吃能量球
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, CX = 120, CY = 150, N = 12, R = 150, FAR = 30;
  const TAU = Math.PI * 2;

  A.define({
    id: 'flydriver',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, dist: 0, nearMiss: 0, orbs: 0 });
      const g = { t: 0, ang: 0, lane: 0, speed: 0.16, z: 0, rows: [], nextRow: 6, energy: 60, boost: false, shield: 3, inv: 60, over: false, overT: 0, hue: 190, pulse: 0, chain: 0, flash: 0, holdT: 0 };
      const laneAng = (l) => U.wrap(l, N) * TAU / N;

      function pattern(z) {
        const d = Math.min(1, st.dist / 4000);
        const r = Math.random();
        let blocks = [];
        const base = U.randi(0, N - 1);
        if (r < 0.3) { const w = U.randi(2, 4 + Math.round(d * 3)); for (let i = 0; i < w; i++) blocks.push(base + i); }
        else if (r < 0.55) { const gap = U.randi(3, 4) - (d > 0.5 ? 1 : 0); for (let i = gap; i < N; i++) blocks.push(base + i); }
        else if (r < 0.75) { for (let i = 0; i < N; i += 2) blocks.push(base + i); }
        else { for (let i = 0; i < 3; i++) blocks.push(base + i * 4); }
        g.rows.push({ z, lanes: new Set(blocks.map((b) => U.wrap(b, N))), passed: false, kind: 'wall' });
        // 能量球放在空位
        const free = []; for (let i = 0; i < N; i++) if (!g.rows[g.rows.length - 1].lanes.has(i)) free.push(i);
        if (free.length && U.chance(0.6)) g.rows.push({ z: z + 2.5, lanes: new Set([U.pick(free)]), kind: 'orb' });
      }
      for (let z = 8; z < FAR; z += 5) pattern(z);

      function project(lane, z) {
        const a = laneAng(lane) - g.ang + Math.PI / 2;
        const s = 1 / (1 + z * 0.35);
        return { x: CX + Math.cos(a) * R * s, y: CY + Math.sin(a) * R * s * 0.95, s };
      }

      function update(input) {
        g.t++;
        if (g.over) { g.speed *= 0.95; if (++g.overT === 70) api.end({ overText: '隧道撞毁' }); return; }
        // 转动：点一下转一格，按住连续转
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        if (input.upP) { g.lane--; g.holdT = 0; sfx.tick(); }
        if (input.downP) { g.lane++; g.holdT = 0; sfx.tick(); }
        if (dir) { g.holdT++; if (g.holdT > 12 && g.holdT % 5 === 0) { g.lane += dir; sfx.tick(); } }
        const target = g.lane * TAU / N;
        g.ang += (target - g.ang) * 0.3;
        g.boost = input.ok && g.energy > 0;
        if (g.boost) { g.energy = Math.max(0, g.energy - 0.6); if (g.t % 3 === 0) fx.burst(CX + U.rand(-8, 8), 296, 2, ['#38e1ff', '#fff'], { speed: 2, angle: Math.PI / 2, spread: 1, life: 12 }); }
        if (input.okP && g.energy > 0) sfx.whoosh();
        const base = Math.min(0.42, 0.16 + st.dist / 20000);
        g.speed = U.approach(g.speed, base * (g.boost ? 1.7 : 1), 0.004);
        g.z += g.speed; st.dist = Math.floor(g.z * 10);
        st.score = st.dist * 2 + (g.bonus || 0);
        if (g.inv > 0) g.inv--;
        if (g.flash > 0) g.flash--;
        g.hue = (190 + st.dist / 40) % 360;
        g.pulse = Math.max(0, g.pulse - 0.05); if (g.t % 30 === 0) g.pulse = 1;
        if (g.t % 30 === 0) sfx.tone(55 + (g.boost ? 30 : 0), 0.15, { type: 'sine', vol: 0.12 });

        const myLane = U.wrap(Math.round(g.ang / (TAU / N)), N);
        for (const r of g.rows) {
          r.z -= g.speed;
          if (!r.passed && r.z <= 0.2) {
            r.passed = true;
            if (r.kind === 'orb') {
              if (r.lanes.has(myLane)) { st.orbs++; g.energy = Math.min(100, g.energy + 20); g.bonus = (g.bonus || 0) + 100; sfx.pickup(); fx.burst(CX, 290, 12, ['#7dffb3', '#fff'], { speed: 3 }); fx.floatText(CX, 260, '+能量', '#7dffb3', 9); }
            } else if (r.lanes.has(myLane)) {
              if (g.inv <= 0) {
                g.shield--; g.inv = 70; g.chain = 0; g.speed *= 0.5; g.flash = 12;
                sfx.hurt(); fx.addShake(10); fx.flash('#ff3b5a', 0.4); fx.hitstop(5);
                fx.burst(CX, 285, 24, ['#ff3b5a', '#fff', '#ffd23f'], { speed: 4 });
                if (g.shield <= 0) { g.over = true; sfx.boom(true); }
              }
            } else {
              // 擦边：旁边一格有墙
              if (r.lanes.has(U.wrap(myLane + 1, N)) || r.lanes.has(U.wrap(myLane - 1, N))) {
                g.chain++; st.nearMiss++; const v = 50 * g.chain; g.bonus = (g.bonus || 0) + v;
                g.energy = Math.min(100, g.energy + 6);
                fx.floatText(CX, 250, '擦边 x' + g.chain, '#38e1ff', 9); sfx.combo(g.chain);
              }
            }
          }
        }
        g.rows = g.rows.filter((r) => r.z > -1);
        const far = g.rows.reduce((m, r) => Math.max(m, r.z), 0);
        if (far < FAR) pattern(far + Math.max(3, 5.5 - st.dist / 2000));
      }

      function draw(ctx) {
        const hue = g.hue;
        ctx.fillStyle = '#04030a'; ctx.fillRect(0, 0, W, H);
        // 管壁环
        for (let k = 0; k < 18; k++) {
          const z = k * 1.6 - (g.z % 1.6);
          if (z < 0) continue;
          const s = 1 / (1 + z * 0.35);
          ctx.strokeStyle = 'hsla(' + hue + ',90%,' + (40 + g.pulse * 20 * s) + '%,' + Math.min(1, s * 1.4) + ')';
          ctx.lineWidth = Math.max(0.5, 2 * s);
          ctx.beginPath();
          for (let i = 0; i <= N; i++) { const p = project(i - 0.5, z); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
          ctx.stroke();
        }
        // 纵向线
        ctx.lineWidth = 1;
        for (let i = 0; i < N; i++) {
          const a = project(i - 0.5, 0), b = project(i - 0.5, FAR);
          ctx.strokeStyle = 'hsla(' + (hue + 40) + ',80%,50%,.25)';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        // 障碍（远→近）
        const rows = g.rows.slice().sort((a, b) => b.z - a.z);
        for (const r of rows) {
          if (r.z < 0 || r.z > FAR) continue;
          for (const l of r.lanes) {
            const p1 = project(l - 0.45, r.z), p2 = project(l + 0.45, r.z);
            const q1 = project(l - 0.45, r.z + 0.6), q2 = project(l + 0.45, r.z + 0.6);
            const s = p1.s;
            if (r.kind === 'orb') {
              const c = project(l, r.z);
              ctx.fillStyle = '#7dffb3'; ctx.globalAlpha = Math.min(1, s * 2); ctx.beginPath(); ctx.arc(c.x, c.y, 10 * s + 1, 0, 7); ctx.fill();
              ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c.x, c.y, 4 * s + 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
              continue;
            }
            ctx.globalAlpha = Math.min(1, s * 2.2);
            ctx.fillStyle = 'hsl(' + ((hue + 160) % 360) + ',90%,' + (35 + s * 25) + '%)';
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q1.x, q1.y); ctx.closePath(); ctx.fill();
            // 朝内的高墙面
            const i1 = { x: CX + (p1.x - CX) * 0.8, y: CY + (p1.y - CY) * 0.8 }, i2 = { x: CX + (p2.x - CX) * 0.8, y: CY + (p2.y - CY) * 0.8 };
            ctx.fillStyle = 'hsl(' + ((hue + 160) % 360) + ',90%,' + (20 + s * 30) + '%)';
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(i2.x, i2.y); ctx.lineTo(i1.x, i1.y); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        // 飞船（固定在底部）
        const bob = Math.sin(g.t / 6) * 1.5;
        if (!(g.inv > 0 && (g.t >> 2) % 2) || g.over) {
          ctx.save(); ctx.translate(CX, 284 + bob);
          ctx.fillStyle = g.flash ? '#fff' : '#e8f0ff';
          ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(18, 8); ctx.lineTo(6, 4); ctx.lineTo(0, 10); ctx.lineTo(-6, 4); ctx.lineTo(-18, 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'hsl(' + hue + ',90%,60%)'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.fill();
          ctx.fillStyle = g.boost ? '#fff' : '#38e1ff'; ctx.fillRect(-5, 8, 3, 4 + (g.t % 3) * (g.boost ? 4 : 1)); ctx.fillRect(2, 8, 3, 4 + (g.t % 3) * (g.boost ? 4 : 1));
          ctx.restore();
        }
        if (g.boost) { ctx.strokeStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + g.t * 0.1; const r1 = 40 + (g.t * 7 + i * 30) % 100; ctx.beginPath(); ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1); ctx.lineTo(CX + Math.cos(a) * (r1 + 20), CY + Math.sin(a) * (r1 + 20)); ctx.stroke(); } }
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 16, { size: 10, color: '#fff', outline: '#000' });
        D.text(ctx, Math.round(g.speed * 900) + ' km/h', W - 8, 16, { size: 9, color: '#38e1ff', align: 'right', outline: '#000' });
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < g.shield ? '#38e1ff' : 'rgba(255,255,255,.15)'; ctx.fillRect(8 + i * 12, 24, 9, 4); }
        D.text(ctx, '能量', 8, H - 8, { size: 8, color: '#7dffb3' });
        D.bar(ctx, 34, H - 14, 70, 5, g.energy / 100, g.boost ? '#fff' : '#7dffb3');
        if (g.chain > 1) D.text(ctx, '擦边 x' + g.chain, W - 8, H - 8, { size: 9, color: '#38e1ff', align: 'right' });
        if (g.t > 0 && g.t < 220) D.text(ctx, 'UP / DOWN 沿管壁转圈 · 按住 OK 加速', CX, 200, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
