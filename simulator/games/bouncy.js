// simulator/games/bouncy.js — 几何弹射（重制）
// 12 关弹球谜题：瞄准线预告两次反弹；墙会反弹、玻璃一碰就碎、镜面直角折射、炸药桶连锁；子弹有限
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, L = 6, R = 234, T = 26, B = 304, GX = 120, GY = 296, BR = 3.5;

  // w: 墙 [x,y,w,h]；g: 玻璃；m: 镜面 [x,y,'/'或'\\']；t: 目标 [x,y,(vx,range)]；x: 炸药 [x,y]
  const LEVELS = [
    { name: '热身', shots: 3, t: [[120, 80]] },
    { name: '借墙', shots: 3, w: [[30, 150, 130, 10]], t: [[70, 80]] },
    { name: '一箭双雕', shots: 2, w: [[100, 120, 40, 10]], t: [[60, 70], [180, 70]] },
    { name: '炸药桶', shots: 1, g: [[80, 100, 80, 8]], x: [[120, 70]], t: [[92, 60], [148, 60], [120, 40]] },
    { name: '镜子', shots: 3, w: [[20, 40, 10, 140], [30, 170, 60, 10]], m: [[120, 200, '\\']], t: [[45, 90]] },
    { name: '玻璃屋', shots: 3, g: [[40, 70, 60, 8], [140, 70, 60, 8], [40, 70, 8, 60], [192, 70, 8, 60]], t: [[70, 100], [170, 100], [120, 50]] },
    { name: '走廊', shots: 3, w: [[60, 60, 10, 180], [170, 60, 10, 180]], t: [[30, 70], [210, 70], [120, 50]] },
    { name: '移动靶', shots: 3, w: [[40, 150, 60, 8], [140, 150, 60, 8]], t: [[120, 70, 0.8, 80], [120, 110, -1, 70]] },
    { name: '双镜', shots: 2, w: [[100, 40, 40, 150]], m: [[40, 220, '/'], [200, 220, '\\']], t: [[40, 60], [200, 60]] },
    { name: '连环爆', shots: 2, x: [[60, 90], [120, 70], [180, 90]], g: [[20, 120, 200, 8]], t: [[40, 60], [90, 50], [150, 50], [200, 60], [120, 40]] },
    { name: '迷宫', shots: 4, w: [[20, 200, 150, 8], [70, 130, 150, 8], [20, 70, 150, 8]], m: [[220, 230, '/']], t: [[40, 100], [200, 40], [120, 160]] },
    { name: '终局', shots: 4, w: [[110, 60, 20, 20]], g: [[30, 140, 60, 8], [150, 140, 60, 8]], x: [[120, 110]], m: [[30, 240, '/'], [210, 240, '\\']], t: [[60, 50], [180, 50], [90, 100], [150, 100], [120, 40], [30, 100], [210, 100]] }
  ];

  A.define({
    id: 'bouncy',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, level: 1, multi: 0, clear: false });
      const g = { t: 0, li: 0, ang: -Math.PI / 2, shots: 0, ball: null, walls: [], mirrors: [], targets: [], tnt: [], hearts: 3, state: 'aim', stateT: 0, hitThisShot: 0, turnV: 0 };

      function load() {
        const lv = LEVELS[g.li];
        g.shots = lv.shots; g.ball = null; g.state = 'aim'; g.stateT = 0;
        g.walls = (lv.w || []).map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], glass: false }))
          .concat((lv.g || []).map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], glass: true })));
        g.mirrors = (lv.m || []).map((a) => ({ x: a[0], y: a[1], k: a[2], cd: 0 }));
        g.targets = (lv.t || []).map((a) => ({ x: a[0], y: a[1], x0: a[0], vx: a[2] || 0, range: a[3] || 0, t: 0, dead: false }));
        g.tnt = (lv.x || []).map((a) => ({ x: a[0], y: a[1], dead: false }));
        st.level = g.li + 1;
      }
      load();

      // 物理：返回一步是否碰撞，并修改 b
      function step(b, sim) {
        const nx = b.x + b.vx, ny = b.y + b.vy;
        let bounced = false;
        if (nx < L + BR) { b.vx = Math.abs(b.vx); bounced = true; }
        else if (nx > R - BR) { b.vx = -Math.abs(b.vx); bounced = true; }
        if (ny < T + BR) { b.vy = Math.abs(b.vy); bounced = true; }
        for (const w of g.walls) {
          if (w.dead) continue;
          if (nx + BR > w.x && nx - BR < w.x + w.w && ny + BR > w.y && ny - BR < w.y + w.h) {
            const wasX = b.x + BR > w.x && b.x - BR < w.x + w.w;
            if (wasX) b.vy = -b.vy; else b.vx = -b.vx;
            bounced = true;
            if (w.glass && !sim) { w.dead = true; fx.debris(w.x + w.w / 2, w.y + w.h / 2, ['#bfefff', '#fff', '#7cc7ff'], 16); sfx.noise(0.2, { vol: 0.2, f: 4000, hp: true }); }
            else if (w.glass && sim) return 'stop';
            break;
          }
        }
        for (const m of g.mirrors) {
          if (b.lastM === m) { if (Math.abs(nx - m.x) < 10 && Math.abs(ny - m.y) < 10) continue; b.lastM = null; }
          if (Math.abs(nx - m.x) < 8 && Math.abs(ny - m.y) < 8) {
            b.lastM = m;
            const vx = b.vx, vy = b.vy;
            if (m.k === '/') { b.vx = -vy; b.vy = -vx; } else { b.vx = vy; b.vy = vx; }
            b.x = m.x; b.y = m.y;
            if (!sim) { sfx.tone(1500, 0.06, { vol: 0.05 }); fx.spark(m.x, m.y, '#7cc7ff', 6); }
            return 'mirror';
          }
        }
        if (!bounced) { b.x = nx; b.y = ny; }
        return bounced ? 'bounce' : null;
      }

      function explode(x, y) {
        fx.burst(x, y, 30, ['#fff', '#ffd23f', '#ff7b3a', '#ff3b3b'], { speed: 4, life: 30 });
        fx.ring(x, y, '#ffd23f', 42); fx.addShake(8); fx.hitstop(4); sfx.boom(true);
        for (const t of g.targets) if (!t.dead && U.dist(t.x, t.y, x, y) < 44) killTarget(t);
        for (const w of g.walls) if (w.glass && !w.dead && U.dist(w.x + w.w / 2, w.y + w.h / 2, x, y) < 50) { w.dead = true; fx.debris(w.x + w.w / 2, w.y, ['#bfefff', '#fff'], 8); }
        for (const k of g.tnt) if (!k.dead && U.dist(k.x, k.y, x, y) < 48) { k.dead = true; explode(k.x, k.y); }
      }
      function killTarget(t) {
        t.dead = true; g.hitThisShot++;
        st.multi = Math.max(st.multi, g.hitThisShot);
        const pts = 300 * g.hitThisShot;
        st.score += pts;
        fx.floatText(t.x, t.y - 10, g.hitThisShot > 1 ? 'x' + g.hitThisShot + ' +' + pts : '+' + pts, '#ffd23f', 9);
        fx.burst(t.x, t.y, 14, ['#ff5a5a', '#fff', '#ffd23f'], { speed: 3 });
        sfx.combo(g.hitThisShot + 2);
      }

      function update(input) {
        g.t++;
        for (const t of g.targets) if (t.vx && !t.dead) { t.t++; t.x = t.x0 + Math.sin(t.t / 60 * t.vx) * t.range; }
        for (const m of g.mirrors) if (m.cd > 0) m.cd--;
        if (g.state === 'aim') {
          const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
          if (input.upP || input.downP) g.turnV = 0.006;
          if (dir) { g.turnV = Math.min(0.035, g.turnV + 0.0012); g.ang += dir * g.turnV; } else g.turnV = 0;
          g.ang = U.clamp(g.ang, -Math.PI + 0.12, -0.12);
          if (input.okP && g.shots > 0) {
            g.shots--; g.hitThisShot = 0;
            g.ball = { x: GX, y: GY - 8, vx: Math.cos(g.ang) * 4.2, vy: Math.sin(g.ang) * 4.2, bounces: 0, life: 900 };
            g.state = 'fly'; sfx.tone(300, 0.1, { type: 'square', vol: 0.1, to: 900 }); fx.addShake(2);
          }
        } else if (g.state === 'fly') {
          const b = g.ball;
          for (let s = 0; s < 2; s++) {
            const r = step(b, false);
            if (r === 'bounce') { b.bounces++; sfx.tone(400 + b.bounces * 60, 0.04, { type: 'square', vol: 0.05 }); fx.spark(b.x, b.y, '#fff', 3); }
            for (const t of g.targets) if (!t.dead && U.circ(b.x, b.y, BR, t.x, t.y, 8)) killTarget(t);
            for (const k of g.tnt) if (!k.dead && U.circ(b.x, b.y, BR, k.x, k.y, 8)) { k.dead = true; explode(k.x, k.y); }
          }
          if (--b.life <= 0 || b.bounces > 14 || b.y > B + 10) { g.ball = null; g.state = 'check'; g.stateT = 0; }
        } else if (g.state === 'check') {
          if (++g.stateT > 20) {
            const left = g.targets.filter((t) => !t.dead).length;
            if (left === 0) {
              const bonus = 1000 + g.shots * 500;
              st.score += bonus; g.state = 'clear'; g.stateT = 0;
              fx.say('第 ' + (g.li + 1) + ' 关 通过  +' + bonus, '#7dffb3', 90); sfx.clear();
            } else if (g.shots <= 0) {
              g.hearts--; g.state = 'fail'; g.stateT = 0;
              fx.say(g.hearts > 0 ? '子弹用完了，重来' : '没机会了', '#ff6b6b', 90); sfx.hurt();
            } else g.state = 'aim';
          }
        } else if (g.state === 'clear') {
          if (++g.stateT > 100) {
            g.li++;
            if (g.li >= LEVELS.length) { st.clear = true; st.score += g.hearts * 2000; api.end({ clear: true, clearText: '全部通关!' }); g.state = 'done'; return; }
            load();
          }
        } else if (g.state === 'fail') {
          if (++g.stateT > 100) { if (g.hearts <= 0) { api.end(); g.state = 'done'; } else load(); }
        }
      }

      function preview(ctx) {
        const b = { x: GX, y: GY - 8, vx: Math.cos(g.ang) * 4.2, vy: Math.sin(g.ang) * 4.2 };
        let n = 0;
        ctx.fillStyle = 'rgba(124,199,255,.8)';
        for (let i = 0; i < 260 && n < 2; i++) {
          const r = step(b, true);
          if (r === 'stop') break;
          if (r) n++;
          if (i % 4 === 0) { ctx.globalAlpha = 1 - i / 300; ctx.fillRect(b.x - 1, b.y - 1, 2, 2); }
        }
        ctx.globalAlpha = 1;
      }

      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#16123a', '#0a0a1e']); ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(139,139,255,.08)';
        for (let x = L; x < R; x += 12) { ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); }
        for (let y = T; y < B; y += 12) { ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); }
        ctx.strokeStyle = '#8b8bff'; ctx.lineWidth = 2; ctx.strokeRect(L - 1, T - 1, R - L + 2, B - T + 10); ctx.lineWidth = 1;
        for (const w of g.walls) {
          if (w.dead) continue;
          if (w.glass) { ctx.fillStyle = 'rgba(191,239,255,.35)'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = '#bfefff'; ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(w.x + 2, w.y + 1, Math.min(8, w.w - 4), 1); }
          else { ctx.fillStyle = '#5a5a7a'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = '#8a8ab0'; ctx.fillRect(w.x, w.y, w.w, 2); ctx.fillStyle = '#3a3a52'; ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2); }
        }
        for (const m of g.mirrors) {
          ctx.strokeStyle = '#7cc7ff'; ctx.lineWidth = 3; ctx.beginPath();
          if (m.k === '/') { ctx.moveTo(m.x - 9, m.y + 9); ctx.lineTo(m.x + 9, m.y - 9); } else { ctx.moveTo(m.x - 9, m.y - 9); ctx.lineTo(m.x + 9, m.y + 9); }
          ctx.stroke(); ctx.lineWidth = 1;
        }
        for (const k of g.tnt) {
          if (k.dead) continue;
          ctx.fillStyle = '#c0301a'; D.rrect(ctx, k.x - 7, k.y - 8, 14, 16, 3); ctx.fill();
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(k.x - 7, k.y - 2, 14, 3);
          D.text(ctx, 'TNT', k.x, k.y + 7, { size: 5, color: '#fff', align: 'center' });
        }
        for (const t of g.targets) {
          if (t.dead) continue;
          const p = 1 + Math.sin(g.t / 8 + t.x) * 0.08;
          ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(t.x, t.y, 8 * p, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, 5 * p, 0, 7); ctx.fill();
          ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(t.x, t.y, 2.5 * p, 0, 7); ctx.fill();
        }
        if (g.state === 'aim') preview(ctx);
        if (g.ball) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, BR, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(g.ball.x - 1, g.ball.y - 2, 1.5, 1.5); }
        // 发射器
        ctx.fillStyle = '#2a2a4a'; ctx.beginPath(); ctx.arc(GX, GY + 8, 14, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(GX, GY); ctx.rotate(g.ang + Math.PI / 2);
        ctx.fillStyle = '#8b8bff'; ctx.fillRect(-3, -14, 6, 14); ctx.fillStyle = '#fff'; ctx.fillRect(-3, -14, 6, 2);
        ctx.restore();
        // HUD
        D.text(ctx, '第 ' + (g.li + 1) + ' 关 · ' + LEVELS[Math.min(g.li, LEVELS.length - 1)].name, 8, 17, { size: 9, color: '#fff' });
        D.text(ctx, U.fmt(st.score), W - 8, 17, { size: 9, color: '#ffd23f', align: 'right' });
        for (let i = 0; i < g.shots; i++) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(14 + i * 10, H - 8, 3.5, 0, 7); ctx.fill(); }
        D.text(ctx, '♥'.repeat(Math.max(0, g.hearts)), W - 8, H - 3, { size: 9, color: '#ff8a80', align: 'right' });
        if (g.t > 0 && g.t < 200 && g.li === 0) D.text(ctx, '虚线预告两次反弹', 120, 200, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
