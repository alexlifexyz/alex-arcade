// simulator/games/huddle.js — 午后温泉（重制：萌物合成）
// UP/DOWN 移动，OK 放下一只；两只一样的碰到就抱成更大的一只；温泉溢出警戒线太久就结束
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, L = 28, R = 212, BOT = 304, LINE = 128;
  const KINDS = [
    { name: '小鸡', r: 10, c: '#ffe066', ear: 0 },
    { name: '仓鼠', r: 13, c: '#f4b27a', ear: 1 },
    { name: '猫咪', r: 17, c: '#f08a30', ear: 2 },
    { name: '柴犬', r: 21, c: '#e8a050', ear: 2 },
    { name: '海豹', r: 26, c: '#b8c4d0', ear: 0 },
    { name: '熊猫', r: 31, c: '#f4f4f4', ear: 1, patch: '#2a2a34' },
    { name: '水豚', r: 37, c: '#a0703a', ear: 1 },
    { name: '大白熊', r: 45, c: '#ffffff', ear: 1 }
  ];

  A.define({
    id: 'huddle',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, best: 0, merges: 0 });
      const g = { t: 0, x: 120, cur: U.randi(0, 1), next: U.randi(0, 1), cool: 0, balls: [], danger: 0, over: false, overT: 0, chain: 0, chainT: 0, steam: [] };
      for (let i = 0; i < 16; i++) g.steam.push({ x: U.rand(L, R), y: U.rand(40, 300), s: U.rand(0.2, 0.5) });

      function drop() {
        const k = KINDS[g.cur];
        g.balls.push({ x: U.clamp(g.x + U.rand(-0.6, 0.6), L + k.r, R - k.r), y: 58, vx: 0, vy: 0, k: g.cur, age: 0, squish: 0 });
        g.cur = g.next; g.next = U.randi(0, Math.min(3, 1 + Math.floor(st.merges / 15)));
        g.cool = 26; sfx.tone(500, 0.06, { type: 'sine', vol: 0.08, to: 300 });
      }
      function merge(a, b) {
        const nk = a.k + 1;
        a.dead = b.dead = true;
        g.chain = g.chainT > 0 ? g.chain + 1 : 1; g.chainT = 50;
        if (nk >= KINDS.length) {
          st.score += 5000; fx.say('大白熊抱团成功! +5000', '#ffd23f', 90); fx.flash('#fff', 0.5);
          fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 50, ['#ff8fc7', '#fff', '#ffd23f'], { speed: 5, life: 50 });
          sfx.clear(); return;
        }
        const n = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: -1, k: nk, age: 0, squish: 1 };
        g.balls.push(n);
        st.merges++; st.best = Math.max(st.best, nk);
        const pts = (nk + 1) * (nk + 1) * 2 * g.chain;
        st.score += pts;
        fx.floatText(n.x, n.y - KINDS[nk].r - 4, (g.chain > 1 ? '连抱 x' + g.chain + ' ' : '') + '+' + pts, '#fff', g.chain > 1 ? 10 : 8);
        fx.burst(n.x, n.y, 10 + nk * 2, ['#ff8fc7', '#fff', KINDS[nk].c], { speed: 2 + nk * 0.3, life: 26 });
        sfx.combo(nk * 2 + g.chain);
        if (nk >= 5) { fx.say(KINDS[nk].name + '!', '#ffd23f', 50); fx.addShake(nk - 3); }
      }

      function physics() {
        const bs = g.balls;
        for (const b of bs) { b.vy += 0.22; b.vx *= 0.99; b.vy *= 0.995; b.x += b.vx; b.y += b.vy; b.age++; if (b.squish > 0) b.squish -= 0.05; }
        for (let it = 0; it < 4; it++) {
          for (let i = 0; i < bs.length; i++) {
            const a = bs[i]; if (a.dead) continue;
            const ra = KINDS[a.k].r;
            if (a.x < L + ra) { a.x = L + ra; a.vx *= -0.3; }
            if (a.x > R - ra) { a.x = R - ra; a.vx *= -0.3; }
            if (a.y > BOT - ra) { a.y = BOT - ra; a.vy *= -0.2; a.vx *= 0.95; }
            for (let j = i + 1; j < bs.length; j++) {
              const b = bs[j]; if (b.dead) continue;
              const rb = KINDS[b.k].r, dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = ra + rb;
              if (d2 < rr * rr && d2 > 0.0001) {
                if (a.k === b.k && a.k < KINDS.length - 1 && it === 0) { merge(a, b); break; }
                const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, ny = dy / d;
                const ma = ra * ra, mb = rb * rb, ta = mb / (ma + mb), tb = ma / (ma + mb);
                a.x -= nx * push * 2 * ta; a.y -= ny * push * 2 * ta; b.x += nx * push * 2 * tb; b.y += ny * push * 2 * tb;
                const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (rv < 0) { const imp = rv * 1.05; a.vx += nx * imp * ta; a.vy += ny * imp * ta; b.vx -= nx * imp * tb; b.vy -= ny * imp * tb; }
              }
            }
          }
          g.balls = bs.filter((b) => !b.dead);
        }
      }

      function update(input) {
        g.t++;
        for (const s of g.steam) { s.y -= s.s; s.x += Math.sin((g.t + s.y) / 30) * 0.2; if (s.y < 30) { s.y = 300; s.x = U.rand(L, R); } }
        if (g.over) { physics(); if (++g.overT === 80) api.end({ overText: '温泉挤满了' }); return; }
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        g.x = U.clamp(g.x + dir * 2.6, L + KINDS[g.cur].r, R - KINDS[g.cur].r);
        if (g.cool > 0) g.cool--;
        if (input.okP && g.cool === 0) drop();
        physics();
        if (g.chainT > 0 && --g.chainT === 0) g.chain = 0;
        // 溢出判定：已稳定的萌物超过警戒线
        const over = g.balls.some((b) => b.age > 90 && b.y - KINDS[b.k].r < LINE);
        g.danger = over ? g.danger + 1 : Math.max(0, g.danger - 2);
        if (g.danger > 150) { g.over = true; sfx.over(); fx.say('溢出来了', '#ff5a5a', 80); }
      }

      function critter(ctx, x, y, k, sq, t) {
        const K = KINDS[k], r = K.r;
        ctx.save(); ctx.translate(x, y); ctx.scale(1 + sq * 0.15, 1 - sq * 0.15);
        if (K.ear === 2) { ctx.fillStyle = K.c; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.4); ctx.lineTo(-r * 0.55, -r * 1.05); ctx.lineTo(-r * 0.15, -r * 0.7); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.4); ctx.lineTo(r * 0.55, -r * 1.05); ctx.lineTo(r * 0.15, -r * 0.7); ctx.fill(); }
        if (K.ear === 1) { ctx.fillStyle = K.patch || K.c; ctx.beginPath(); ctx.arc(-r * 0.62, -r * 0.62, r * 0.3, 0, 7); ctx.arc(r * 0.62, -r * 0.62, r * 0.3, 0, 7); ctx.fill(); }
        ctx.fillStyle = K.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.stroke();
        if (K.patch) { ctx.fillStyle = K.patch; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.05, r * 0.2, r * 0.26, -0.4, 0, 7); ctx.ellipse(r * 0.35, -r * 0.05, r * 0.2, r * 0.26, 0.4, 0, 7); ctx.fill(); }
        const blink = (t + k * 37) % 180 < 6;
        ctx.fillStyle = K.patch ? '#fff' : '#2a1a10';
        if (blink) { ctx.fillRect(-r * 0.42, -r * 0.05, r * 0.22, 1.5); ctx.fillRect(r * 0.2, -r * 0.05, r * 0.22, 1.5); }
        else { ctx.beginPath(); ctx.arc(-r * 0.33, -r * 0.05, Math.max(1.2, r * 0.1), 0, 7); ctx.arc(r * 0.33, -r * 0.05, Math.max(1.2, r * 0.1), 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,120,150,.55)'; ctx.beginPath(); ctx.arc(-r * 0.55, r * 0.2, r * 0.14, 0, 7); ctx.arc(r * 0.55, r * 0.2, r * 0.14, 0, 7); ctx.fill();
        ctx.fillStyle = k === 0 ? '#ff8a30' : '#2a1a10'; ctx.beginPath(); ctx.arc(0, r * 0.18, Math.max(1, r * 0.08), 0, 7); ctx.fill();
        if (k >= 3) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.fillRect(-r * 0.3, -r * 0.95, r * 0.6, r * 0.18); ctx.globalAlpha = 1; } // 头顶小毛巾
        ctx.restore();
      }
      function mini(ctx, x, y, k, size) { ctx.save(); ctx.translate(x, y); const sc = size / KINDS[k].r; ctx.scale(sc, sc); critter(ctx, 0, 0, k, 0, g.t); ctx.restore(); }
      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#ffd0e0', '#ffb3c8']); ctx.fillRect(0, 0, W, H);
        // 木桶温泉
        ctx.fillStyle = '#8a5a2b'; ctx.fillRect(L - 8, LINE - 20, R - L + 16, BOT - LINE + 28);
        ctx.fillStyle = D.vgrad(ctx, LINE, BOT, ['#9ee0ff', '#5ab8e8']); ctx.fillRect(L, LINE - 12, R - L, BOT - LINE + 12);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let x = L; x < R; x += 16) ctx.fillRect(x + ((g.t >> 3) % 2) * 4, LINE - 12, 8, 2);
        ctx.fillStyle = '#6a4020'; for (let y = LINE; y < BOT; y += 40) { ctx.fillRect(L - 8, y, 8, 4); ctx.fillRect(R, y, 8, 4); }
        for (const s of g.steam) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); }
        // 警戒线
        ctx.strokeStyle = g.danger > 0 && (g.t >> 3) % 2 ? '#ff3b5a' : 'rgba(255,59,90,.45)'; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(L, LINE); ctx.lineTo(R, LINE); ctx.stroke(); ctx.setLineDash([]);
        for (const b of g.balls) critter(ctx, b.x, b.y, b.k, b.squish, g.t);
        // 投放器
        if (g.cool === 0) {
          ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(g.x, 58); ctx.lineTo(g.x, BOT); ctx.stroke(); ctx.setLineDash([]);
          critter(ctx, g.x, 58, g.cur, 0, g.t);
        }
        ctx.fillStyle = '#6a4020'; ctx.fillRect(L, 30, R - L, 3);
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 18, { size: 10, color: '#6a1a3a' });
        D.text(ctx, '下一只', W - 50, 16, { size: 7, color: '#6a1a3a', align: 'center' });
        mini(ctx, W - 22, 16, g.next, 10);
        // 进化图鉴
        for (let i = 0; i < KINDS.length; i++) { ctx.globalAlpha = i <= st.best ? 1 : 0.3; mini(ctx, 14 + i * 16, H - 8, i, 6); }
        ctx.globalAlpha = 1;
        if (g.danger > 30) D.text(ctx, '快溢出来了!', W / 2, LINE - 26, { size: 11, color: '#ff3b5a', align: 'center', outline: '#fff' });
        if (g.t > 0 && g.t < 240) D.text(ctx, '一样的两只碰到会抱成更大的一只', W / 2, 200, { size: 9, color: '#fff', align: 'center', outline: '#6a1a3a' });
      }
      return { update, draw };
    }
  });
})();
