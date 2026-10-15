// simulator/games/lasercat.js — 猫猫激光笔（重制）
// 八个房间的推箱谜题：激光打到墙上的红点就是猫要扑的地方；猫撞箱子会把它推走，把电池箱推进插槽
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, L = 8, R = 232, T = 30, B = 286, OX = 120, OY = 302, BOX = 16;

  const ROOMS = [
    { name: '客厅', box: [120, 160], sock: [120, 60], cats: [[120, 240]] },
    { name: '走廊', box: [130, 150], sock: [40, 150], cats: [[200, 150]] },
    { name: '书房', box: [90, 120], sock: [200, 60], cats: [[60, 230]], walls: [[150, 110, 10, 90]] },
    { name: '厨房', box: [120, 200], sock: [200, 70], cats: [[70, 250]], walls: [[40, 130, 130, 10]] },
    { name: '双猫', box: [120, 140], sock: [40, 50], cats: [[90, 240], [160, 240]], walls: [[160, 70, 10, 140]] },
    { name: 'Z 字道', box: [60, 240], sock: [200, 50], cats: [[30, 270]], walls: [[8, 190, 150, 10], [82, 110, 150, 10]] },
    { name: '柜子迷宫', box: [120, 230], sock: [120, 50], cats: [[40, 250], [200, 250]], walls: [[60, 150, 40, 10], [140, 150, 40, 10], [100, 90, 40, 10]] },
    { name: '猫爬架', box: [50, 90], sock: [200, 250], cats: [[40, 250], [200, 60]], walls: [[90, 60, 10, 110], [140, 140, 10, 110], [8, 200, 60, 10]] }
  ];

  A.define({
    id: 'lasercat',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, level: 1, fast: false, clear: false });
      const g = { t: 0, li: 0, ang: -Math.PI / 2, laser: false, dot: { x: 120, y: 30 }, cats: [], box: null, sock: null, walls: [], roomT: 0, state: 'play', stateT: 0, resetT: 0, turnV: 0 };

      function load() {
        const r = ROOMS[g.li];
        g.box = { x: r.box[0], y: r.box[1] };
        g.sock = { x: r.sock[0], y: r.sock[1] };
        g.cats = r.cats.map((c, i) => ({ x: c[0], y: c[1], vx: 0, vy: 0, wig: 0, tx: 0, ty: 0, face: 1, color: i ? '#2a2a34' : '#f08a30' }));
        g.walls = (r.walls || []).map((w) => ({ x: w[0], y: w[1], w: w[2], h: w[3] }));
        g.roomT = 0; g.state = 'play'; g.stateT = 0; st.level = g.li + 1;
      }
      load();

      const inWall = (x, y) => x < L || x > R || y < T || y > B || g.walls.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
      const boxHits = (bx, by) => {
        const h = BOX / 2;
        if (bx - h < L || bx + h > R || by - h < T || by + h > B) return true;
        return g.walls.some((w) => bx + h > w.x && bx - h < w.x + w.w && by + h > w.y && by - h < w.y + w.h);
      };
      const catHitsWall = (x, y) => {
        const r = 7;
        if (x - r < L || x + r > R || y - r < T || y + r > B) return true;
        return g.walls.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
      };
      const catOnBox = (x, y) => Math.abs(x - g.box.x) < BOX / 2 + 6 && Math.abs(y - g.box.y) < BOX / 2 + 6;

      function castLaser() {
        const dx = Math.cos(g.ang), dy = Math.sin(g.ang);
        let x = OX, y = OY - 6;
        for (let i = 0; i < 400; i++) {
          const nx = x + dx * 2, ny = y + dy * 2;
          if (inWall(nx, ny)) break;
          x = nx; y = ny;
        }
        g.dot.x = x; g.dot.y = y;
      }

      function moveCat(c, mx, my) {
        // x 轴
        if (mx) {
          const nx = c.x + mx;
          if (!catHitsWall(nx, c.y)) {
            if (catOnBox(nx, c.y) && Math.abs(c.y - g.box.y) < BOX / 2 + 4) {
              const bx = g.box.x + mx;
              if (!boxHits(bx, g.box.y)) { g.box.x = bx; c.x = nx; if (g.t % 10 === 0) sfx.tone(200, 0.04, { type: 'square', vol: 0.04 }); }
            } else c.x = nx;
          }
        }
        if (my) {
          const ny = c.y + my;
          if (!catHitsWall(c.x, ny)) {
            if (catOnBox(c.x, ny) && Math.abs(c.x - g.box.x) < BOX / 2 + 4) {
              const by = g.box.y + my;
              if (!boxHits(g.box.x, by)) { g.box.y = by; c.y = ny; if (g.t % 10 === 0) sfx.tone(200, 0.04, { type: 'square', vol: 0.04 }); }
            } else c.y = ny;
          }
        }
      }

      function update(input) {
        g.t++;
        if (g.state === 'clear') {
          g.box.x = U.approach(g.box.x, g.sock.x, 1); g.box.y = U.approach(g.box.y, g.sock.y, 1);
          if (++g.stateT > 110) {
            g.li++;
            if (g.li >= ROOMS.length) { st.clear = true; api.end({ clear: true, clearText: '全屋通电!' }); g.state = 'done'; return; }
            load(); fx.say('房间 ' + (g.li + 1) + ' · ' + ROOMS[g.li].name, '#ffd23f', 80);
          }
          return;
        }
        if (g.state === 'done') return;
        g.roomT++;
        // 同时按住 UP+DOWN 重置房间
        if (input.up && input.down) { if (++g.resetT === 40) { load(); fx.say('重置房间', '#fff', 40); sfx.select(); } }
        else g.resetT = 0;
        const dir = (input.up && !input.down ? -1 : 0) + (input.down && !input.up ? 1 : 0);
        if (input.upP || input.downP) g.turnV = 0.008;
        if (dir) { g.turnV = Math.min(0.03, g.turnV + 0.001); g.ang += dir * g.turnV; } else g.turnV = 0;
        g.ang = U.clamp(g.ang, -Math.PI + 0.1, -0.1);
        const was = g.laser;
        g.laser = input.ok;
        castLaser();
        if (g.laser && !was) sfx.tone(1800, 0.05, { type: 'sine', vol: 0.04 });

        for (const c of g.cats) {
          if (g.laser) {
            const moved = Math.hypot(g.dot.x - c.tx, g.dot.y - c.ty);
            if (moved > 40 && c.wig <= 0) { c.wig = 18; c.tx = g.dot.x; c.ty = g.dot.y; }
            if (c.wig > 0) { c.wig--; c.tx = g.dot.x; c.ty = g.dot.y; c.vx *= 0.8; c.vy *= 0.8; }
            else {
              const dx = g.dot.x - c.x, dy = g.dot.y - c.y, d = Math.hypot(dx, dy);
              const sp = d > 30 ? 2.1 : 1.2;
              if (d > 3) { c.vx = U.approach(c.vx, dx / d * sp, 0.25); c.vy = U.approach(c.vy, dy / d * sp, 0.25); }
              else { c.vx *= 0.7; c.vy *= 0.7; }
              c.tx = g.dot.x; c.ty = g.dot.y;
            }
          } else { c.vx *= 0.85; c.vy *= 0.85; }
          if (Math.abs(c.vx) > 0.1) c.face = Math.sign(c.vx);
          moveCat(c, c.vx, c.vy);
        }
        // 通电
        if (Math.abs(g.box.x - g.sock.x) < 7 && Math.abs(g.box.y - g.sock.y) < 7) {
          const secs = g.roomT / 60;
          const pts = 2000 + Math.max(0, Math.round((60 - secs) * 40));
          st.score += pts;
          if (secs < 20) st.fast = true;
          g.state = 'clear'; g.stateT = 0;
          fx.say('通电！+' + pts, '#38e1ff', 90); fx.flash('#38e1ff', 0.35); sfx.clear();
          fx.burst(g.sock.x, g.sock.y, 30, ['#38e1ff', '#fff', '#ffd23f'], { speed: 3.5 });
        }
        if (g.roomT > 90 * 60) { api.end({ overText: '时间到' }); g.state = 'done'; }
      }

      function drawCat(ctx, c) {
        const wig = c.wig > 0 ? Math.sin(g.t * 1.2) * 2 : 0;
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.face, 1);
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 7, 8, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.ellipse(-2 + wig, 1, 7, 6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8 + wig, 0); ctx.quadraticCurveTo(-13 + wig, -8, -9 + wig * 2, -12); ctx.stroke(); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(5, -3, 5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(3, -12); ctx.lineTo(6, -7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(9, -12); ctx.lineTo(9, -5); ctx.fill();
        ctx.fillStyle = '#fef08a'; ctx.fillRect(5, -5, 2, 2); ctx.fillRect(8, -5, 1.5, 2);
        ctx.fillStyle = '#111'; ctx.fillRect(5.5, -5, 1, 2);
        ctx.restore();
      }
      function draw(ctx) {
        // 地板
        ctx.fillStyle = '#6a3e1e'; ctx.fillRect(0, 0, W, H);
        for (let y = T; y < B; y += 14) { ctx.fillStyle = (y / 14) % 2 ? '#7a4a24' : '#744520'; ctx.fillRect(L, y, R - L, 14); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(L, y, R - L, 1); }
        ctx.strokeStyle = '#3a200e'; ctx.lineWidth = 4; ctx.strokeRect(L - 2, T - 2, R - L + 4, B - T + 4); ctx.lineWidth = 1;
        // 地毯
        ctx.fillStyle = 'rgba(255,120,150,.15)'; D.rrect(ctx, 60, 110, 120, 90, 20); ctx.fill();
        for (const w of g.walls) { ctx.fillStyle = '#e8d8c0'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = '#c8b8a0'; ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3); }
        // 插槽
        const s = g.sock;
        ctx.fillStyle = g.state === 'clear' ? '#38e1ff' : '#1e293b'; ctx.fillRect(s.x - 11, s.y - 11, 22, 22);
        ctx.strokeStyle = '#ffd23f'; ctx.setLineDash([3, 3]); ctx.strokeRect(s.x - 11.5, s.y - 11.5, 23, 23); ctx.setLineDash([]);
        D.text(ctx, '⚡', s.x, s.y + 4, { size: 10, align: 'center', color: '#ffd23f' });
        // 箱子
        const bx = g.box.x, by = g.box.y;
        ctx.fillStyle = '#b45309'; ctx.fillRect(bx - 8, by - 8, 16, 16);
        ctx.fillStyle = '#d97706'; ctx.fillRect(bx - 8, by - 8, 16, 3);
        ctx.strokeStyle = '#78350f'; ctx.strokeRect(bx - 7.5, by - 7.5, 15, 15);
        ctx.fillStyle = '#fde047'; ctx.fillRect(bx - 3, by - 4, 6, 8); ctx.fillStyle = '#78350f'; ctx.fillRect(bx - 1, by - 6, 2, 2);
        // 引导线：箱子到插槽
        ctx.strokeStyle = 'rgba(255,210,63,.2)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]);
        for (const c of g.cats) drawCat(ctx, c);
        // 激光
        ctx.save(); ctx.translate(OX, OY); ctx.rotate(g.ang);
        ctx.fillStyle = '#334155'; D.rrect(ctx, -2, -4, 18, 8, 3); ctx.fill(); ctx.fillStyle = '#ef4444'; ctx.fillRect(14, -2, 3, 4);
        ctx.restore();
        if (g.laser) {
          ctx.strokeStyle = 'rgba(255,0,60,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(OX, OY - 6); ctx.lineTo(g.dot.x, g.dot.y); ctx.stroke(); ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(255,0,60,.35)'; ctx.beginPath(); ctx.arc(g.dot.x, g.dot.y, 7, 0, 7); ctx.fill();
          ctx.fillStyle = '#ff1a4a'; ctx.beginPath(); ctx.arc(g.dot.x, g.dot.y, 3, 0, 7); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(OX, OY - 6); ctx.lineTo(g.dot.x, g.dot.y); ctx.stroke(); ctx.setLineDash([]);
        }
        // HUD
        D.text(ctx, '房间 ' + (g.li + 1) + '/8 · ' + ROOMS[Math.min(g.li, 7)].name, 8, 20, { size: 9, color: '#fff' });
        D.text(ctx, U.fmt(st.score), W - 8, 20, { size: 9, color: '#ffd23f', align: 'right' });
        const left = Math.max(0, 90 - Math.floor(g.roomT / 60));
        D.text(ctx, left + 's', W - 8, H - 3, { size: 9, color: left < 15 ? '#ff6b6b' : '#fff', align: 'right' });
        D.text(ctx, '同时按住 UP+DOWN 重置', 8, H - 3, { size: 7, color: 'rgba(255,255,255,.6)' });
        if (g.resetT > 0) D.bar(ctx, 60, 150, 120, 5, g.resetT / 40, '#fff');
        if (g.t > 0 && g.t < 220 && g.li === 0) D.text(ctx, '按住 OK 打红点，猫会扑过去', 120, 100, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
