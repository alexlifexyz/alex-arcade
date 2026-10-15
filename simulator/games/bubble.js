// simulator/games/bubble.js — 飞针破泡（重制：泡泡射手）
// UP/DOWN 调角度，OK 发射；同色三个连起来就爆，悬空的整片掉下来加倍；每几发天花板往下压一行
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, R = 11, COLS = 10, OX = 10, OY = 30, ROWH = R * 1.73, GX = 120, GY = 292, DEAD = 262;
  const COL = ['#ff4d6d', '#ffb020', '#3ee07a', '#38b8ff', '#b06bff', '#ff6be0'];

  A.define({
    id: 'bubble',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, level: 1, maxDrop: 0, popped: 0 });
      const g = { t: 0, grid: [], rowOff: 0, ang: -Math.PI / 2, shot: null, cur: 0, next: 0, shots: 0, press: 6, drop: 0, falling: [], level: 1, state: 'aim', stateT: 0, turnV: 0 };
      const colors = () => Math.min(6, 3 + g.level);

      const cols = (r) => ((r + g.rowOff) % 2 ? COLS - 1 : COLS);
      const cx = (r, c) => OX + R + c * R * 2 + ((r + g.rowOff) % 2 ? R : 0);
      const cy = (r) => OY + R + r * ROWH + g.drop;

      function fill(rows) {
        g.grid = [];
        for (let r = 0; r < 14; r++) { g.grid.push([]); for (let c = 0; c < COLS; c++) g.grid[r].push(r < rows && c < cols(r) ? U.randi(0, colors() - 1) : -1); }
      }
      function present() { const s = new Set(); g.grid.forEach((row) => row.forEach((v) => { if (v >= 0) s.add(v); })); return [...s]; }
      function pickColor() { const p = present(); return p.length ? U.pick(p) : U.randi(0, colors() - 1); }
      function startLevel() {
        fill(Math.min(8, 3 + g.level)); g.rowOff = 0; g.drop = 0;
        g.press = Math.max(3, 8 - g.level); g.shots = 0;
        g.cur = pickColor(); g.next = pickColor(); st.level = g.level;
      }
      startLevel();

      function neighbors(r, c) {
        const odd = (r + g.rowOff) % 2;
        const d = odd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
        return d.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < g.grid.length && cc >= 0 && cc < cols(rr));
      }
      function snap(x, y) {
        let best = null, bd = 1e9;
        for (let r = 0; r < g.grid.length; r++) for (let c = 0; c < cols(r); c++) {
          if (g.grid[r][c] >= 0) continue;
          const d = (cx(r, c) - x) ** 2 + (cy(r) - y) ** 2;
          if (d < bd) { bd = d; best = [r, c]; }
        }
        return best;
      }
      function place(r, c, v) {
        g.grid[r][c] = v;
        // 同色连通
        const same = [[r, c]], seen = new Set([r + ',' + c]);
        for (let i = 0; i < same.length; i++) for (const [rr, cc] of neighbors(same[i][0], same[i][1])) {
          const k = rr + ',' + cc; if (seen.has(k) || g.grid[rr][cc] !== v) continue; seen.add(k); same.push([rr, cc]);
        }
        if (same.length >= 3) {
          for (const [rr, cc] of same) { popAt(rr, cc, v); g.grid[rr][cc] = -1; }
          st.popped += same.length;
          let pts = same.length * 10 * g.level;
          // 悬空检查
          const keep = new Set(); const q = [];
          for (let c2 = 0; c2 < cols(0); c2++) if (g.grid[0][c2] >= 0) { q.push([0, c2]); keep.add('0,' + c2); }
          for (let i = 0; i < q.length; i++) for (const [rr, cc] of neighbors(q[i][0], q[i][1])) { const k = rr + ',' + cc; if (!keep.has(k) && g.grid[rr][cc] >= 0) { keep.add(k); q.push([rr, cc]); } }
          let dropN = 0;
          for (let rr = 0; rr < g.grid.length; rr++) for (let cc = 0; cc < cols(rr); cc++) if (g.grid[rr][cc] >= 0 && !keep.has(rr + ',' + cc)) {
            g.falling.push({ x: cx(rr, cc), y: cy(rr), vy: U.rand(-1, 0.5), vx: U.rand(-0.8, 0.8), v: g.grid[rr][cc] }); g.grid[rr][cc] = -1; dropN++;
          }
          if (dropN) { pts += dropN * dropN * 20 * g.level; st.maxDrop = Math.max(st.maxDrop, dropN); fx.say('掉落 x' + dropN, '#ffd23f', 50); fx.addShake(3 + Math.min(6, dropN)); }
          st.score += pts;
          fx.floatText(cx(r, c), cy(r) - 12, '+' + pts, dropN ? '#ffd23f' : '#fff', dropN ? 10 : 8);
          sfx.combo(same.length + dropN);
          return true;
        }
        sfx.tone(300, 0.05, { type: 'square', vol: 0.05 });
        return false;
      }
      function popAt(r, c, v) { fx.burst(cx(r, c), cy(r), 8, [COL[v], '#fff'], { speed: 2.5, life: 20 }); }
      function pushRow() {
        g.grid.pop();
        g.rowOff = (g.rowOff + 1) % 2;
        const row = []; for (let c = 0; c < COLS; c++) row.push(c < cols(0) ? U.randi(0, colors() - 1) : -1);
        // 新行 cols(0) 依赖 rowOff，重新按新奇偶生成
        g.grid.unshift(row);
        for (let c = cols(0); c < COLS; c++) g.grid[0][c] = -1;
        fx.addShake(4); sfx.thud();
      }
      function lowest() { let m = -1; g.grid.forEach((row, r) => row.forEach((v) => { if (v >= 0) m = r; })); return m; }

      function update(input) {
        g.t++;
        for (const f of g.falling) { f.vy += 0.3; f.x += f.vx; f.y += f.vy; }
        g.falling = g.falling.filter((f) => f.y < H + 20);
        if (g.state === 'over') { if (++g.stateT === 60) api.end({ overText: '泡泡压下来了' }); return; }
        if (g.state === 'clear') { if (++g.stateT > 100) { g.level++; startLevel(); g.state = 'aim'; fx.say('第 ' + g.level + ' 关', '#38b8ff', 70); } return; }
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        if (input.upP || input.downP) g.turnV = 0.012;
        if (dir) { g.turnV = Math.min(0.045, g.turnV + 0.002); g.ang += dir * g.turnV; } else g.turnV = 0;
        g.ang = U.clamp(g.ang, -Math.PI + 0.15, -0.15);
        if (g.state === 'aim' && input.okP) {
          g.shot = { x: GX, y: GY, vx: Math.cos(g.ang) * 7, vy: Math.sin(g.ang) * 7, v: g.cur };
          g.cur = g.next; g.next = pickColor(); g.state = 'fly'; sfx.tone(600, 0.06, { type: 'square', vol: 0.06, to: 300 });
        }
        if (g.state === 'fly') {
          const s = g.shot;
          for (let k = 0; k < 3 && g.shot; k++) {
            s.x += s.vx / 3; s.y += s.vy / 3;
            if (s.x < OX + R) { s.x = OX + R; s.vx = -s.vx; sfx.tick(); }
            if (s.x > OX + COLS * R * 2 - R) { s.x = OX + COLS * R * 2 - R; s.vx = -s.vx; sfx.tick(); }
            let stick = s.y < cy(0);
            if (!stick) for (let r = 0; r < g.grid.length && !stick; r++) for (let c = 0; c < cols(r); c++) if (g.grid[r][c] >= 0 && (cx(r, c) - s.x) ** 2 + (cy(r) - s.y) ** 2 < (R * 1.8) ** 2) { stick = true; break; }
            if (stick) {
              const cell = snap(s.x, s.y);
              g.shot = null; g.state = 'aim';
              if (!cell) break;
              const popped = place(cell[0], cell[1], s.v);
              if (!popped && ++g.shots >= g.press) { g.shots = 0; pushRow(); }
              if (lowest() >= 0 && cy(lowest()) + R > DEAD) { g.state = 'over'; g.stateT = 0; sfx.over(); fx.flash('#ff3b3b', 0.4); }
              else if (lowest() < 0) { g.state = 'clear'; g.stateT = 0; st.score += 2000 * g.level; fx.say('清屏! +' + 2000 * g.level, '#7dffb3', 90); sfx.clear(); }
            }
          }
        }
      }

      function bubble(ctx, x, y, v, r) {
        r = r || R - 0.5;
        ctx.fillStyle = COL[v]; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(x + 2, y + 2, r * 0.7, 0, 7); ctx.fill();
        ctx.fillStyle = COL[v]; ctx.beginPath(); ctx.arc(x - 1, y - 1, r * 0.72, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, 7); ctx.fill();
      }
      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#0a2a4a', '#1a0a3a']); ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(OX, OY, COLS * R * 2, DEAD - OY);
        // 天花板
        ctx.fillStyle = '#3a4a6a'; ctx.fillRect(OX, OY - 6 + g.drop, COLS * R * 2, 6);
        // 危险线
        ctx.strokeStyle = (g.t >> 4) % 2 ? 'rgba(255,90,90,.6)' : 'rgba(255,90,90,.3)'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(OX, DEAD); ctx.lineTo(OX + COLS * R * 2, DEAD); ctx.stroke(); ctx.setLineDash([]);
        for (let r = 0; r < g.grid.length; r++) for (let c = 0; c < cols(r); c++) if (g.grid[r][c] >= 0) bubble(ctx, cx(r, c), cy(r), g.grid[r][c]);
        for (const f of g.falling) bubble(ctx, f.x, f.y, f.v);
        // 瞄准线（带一次反弹）
        if (g.state === 'aim') {
          let x = GX, y = GY, vx = Math.cos(g.ang) * 4, vy = Math.sin(g.ang) * 4;
          ctx.fillStyle = 'rgba(255,255,255,.6)';
          for (let i = 0; i < 70; i++) {
            x += vx; y += vy;
            if (x < OX + R || x > OX + COLS * R * 2 - R) vx = -vx;
            if (y < OY) break;
            if (i % 3 === 0) ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
        if (g.shot) bubble(ctx, g.shot.x, g.shot.y, g.shot.v);
        // 发射台
        ctx.fillStyle = '#2a3a5a'; ctx.beginPath(); ctx.arc(GX, GY + 16, 22, Math.PI, 0); ctx.fill();
        ctx.save(); ctx.translate(GX, GY); ctx.rotate(g.ang); ctx.fillStyle = '#8aa0c0'; ctx.fillRect(0, -3, 24, 6); ctx.restore();
        if (g.state === 'aim') bubble(ctx, GX, GY, g.cur);
        bubble(ctx, GX + 44, GY + 14, g.next, 7);
        D.text(ctx, 'NEXT', GX + 44, GY + 30, { size: 6, color: '#aaa', align: 'center' });
        // 压顶计数
        for (let i = 0; i < g.press; i++) { ctx.fillStyle = i < g.press - g.shots ? '#ffd23f' : 'rgba(255,255,255,.15)'; ctx.fillRect(14 + i * 7, GY + 12, 5, 5); }
        D.text(ctx, '下压', 14, GY + 26, { size: 7, color: '#aaa' });
        D.text(ctx, U.fmt(st.score), 8, 18, { size: 10, color: '#fff' });
        D.text(ctx, '第 ' + g.level + ' 关', W - 8, 18, { size: 9, color: '#38b8ff', align: 'right' });
        if (g.t > 0 && g.t < 220) D.text(ctx, '三个同色就爆，吊着的一起掉', W / 2, 240, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
