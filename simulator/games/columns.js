// simulator/games/columns.js — 霓虹宝石（重制「赛博消消乐」）
// 三键友好：三颗一组下落，UP/DOWN 左右移，OK 轮换，按住 OK 加速；横竖斜连三即消，连锁倍率
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, COLS = 6, ROWS = 13, CS = 20, OX = 14, OY = 40;
  const GEMS = [
    { c: '#ff4d6d', d: '#a0102e', l: '#ffc2cf' },
    { c: '#ffb020', d: '#a06000', l: '#ffe6a8' },
    { c: '#3ee07a', d: '#108a3a', l: '#bff7d4' },
    { c: '#38b8ff', d: '#0a5aa0', l: '#c2ecff' },
    { c: '#b06bff', d: '#5a1aa0', l: '#e6ccff' },
    { c: '#ff6be0', d: '#a01a80', l: '#ffd0f4' }
  ];
  const MAGIC = 9;

  A.define({
    id: 'match3',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, maxChain: 0, cleared: 0, level: 1 });
      const grid = []; for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(-1));
      const g = { t: 0, level: 1, piece: null, next: null, fallT: 0, lock: 0, state: 'fall', anim: 0, marks: null, chain: 0, sinceMagic: 0, over: false, overT: 0, drop: [] };
      const nColors = () => (g.level >= 4 ? 6 : 5);
      function newPiece() {
        g.sinceMagic++;
        if (g.sinceMagic >= 20 && U.chance(0.35)) { g.sinceMagic = 0; return { gems: [MAGIC, MAGIC, MAGIC], magic: true }; }
        return { gems: [U.randi(0, nColors() - 1), U.randi(0, nColors() - 1), U.randi(0, nColors() - 1)] };
      }
      function spawn() {
        const p = g.next || newPiece();
        g.next = newPiece();
        g.piece = { gems: p.gems, magic: p.magic, c: 2, r: -2 };
        g.fallT = 0; g.lock = 0;
        if (grid[0][2] >= 0 || grid[1] && grid[1][2] >= 0 && grid[0][2] >= 0) { g.over = true; sfx.over(); fx.say('堆满了', '#ff5a5a', 90); }
      }
      const cellFree = (r, c) => c >= 0 && c < COLS && r < ROWS && (r < 0 || grid[r][c] < 0);
      const canPlace = (r, c) => cellFree(r, c) && cellFree(r + 1, c) && cellFree(r + 2, c);
      const fallDelay = () => Math.max(5, 40 - g.level * 4);

      function lockPiece() {
        const p = g.piece;
        if (p.r < 0 && p.r + 0 < 0) { /* 顶部溢出 */ }
        if (p.magic) {
          // 魔法宝石：清掉下方那颗宝石的全部同色
          const below = p.r + 3 < ROWS ? grid[p.r + 3][p.c] : -1;
          const marks = grid.map((row) => row.map(() => false));
          let n = 0;
          if (below >= 0) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === below) { marks[r][c] = true; n++; }
          g.piece = null;
          fx.flash('#fff', 0.5); fx.say(n ? '魔法宝石 x' + n : '魔法宝石落空', '#fff', 60); sfx.power();
          if (n) { g.marks = marks; g.state = 'clear'; g.anim = 0; g.chain = 1; st.score += n * 30 * g.level; }
          else { g.state = 'fall'; spawn(); }
          return;
        }
        for (let i = 0; i < 3; i++) {
          const r = p.r + i;
          if (r < 0) { g.over = true; sfx.over(); fx.say('堆满了', '#ff5a5a', 90); return; }
          grid[r][p.c] = p.gems[i];
        }
        sfx.thud();
        g.piece = null; g.chain = 0;
        resolve();
      }
      function findMatches() {
        const marks = grid.map((row) => row.map(() => false));
        let any = false;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const v = grid[r][c]; if (v < 0) continue;
          for (const [dr, dc] of dirs) {
            let n = 1;
            while (true) { const rr = r + dr * n, cc = c + dc * n; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || grid[rr][cc] !== v) break; n++; }
            if (n >= 3) { any = true; for (let k = 0; k < n; k++) marks[r + dr * k][c + dc * k] = true; }
          }
        }
        return any ? marks : null;
      }
      function resolve() {
        const m = findMatches();
        if (m) {
          g.chain++; st.maxChain = Math.max(st.maxChain, g.chain);
          let n = 0; m.forEach((row) => row.forEach((v) => { if (v) n++; }));
          const pts = n * 10 * g.level * g.chain * (n > 3 ? 2 : 1);
          st.score += pts;
          g.marks = m; g.state = 'clear'; g.anim = 0;
          sfx.combo(g.chain * 2 + n);
          const lbl = g.chain > 1 ? g.chain + ' 连锁! +' + pts : '+' + pts;
          fx.floatText(OX + COLS * CS / 2, OY + 110, lbl, g.chain > 1 ? '#ffd23f' : '#fff', g.chain > 1 ? 12 : 9);
          if (g.chain >= 3) { fx.addShake(3 + g.chain); fx.flash(GEMS[(g.chain) % 6].c, 0.2); }
        } else {
          g.state = 'fall';
          spawn();
        }
      }
      function collapse() {
        let n = 0;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g.marks[r][c]) {
          const v = grid[r][c];
          fx.burst(OX + c * CS + CS / 2, OY + r * CS + CS / 2, 8, [GEMS[v] ? GEMS[v].c : '#fff', '#fff'], { speed: 3, life: 24 });
          grid[r][c] = -1; n++;
        }
        st.cleared += n;
        const lv = 1 + Math.floor(st.cleared / 30);
        if (lv > g.level) { g.level = lv; st.level = lv; fx.say('LEVEL ' + lv, '#38e1ff', 70); sfx.power(); }
        for (let c = 0; c < COLS; c++) {
          let w = ROWS - 1;
          for (let r = ROWS - 1; r >= 0; r--) if (grid[r][c] >= 0) { const v = grid[r][c]; grid[r][c] = -1; grid[w][c] = v; w--; }
        }
        g.marks = null;
      }

      spawn();

      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 70) api.end({ overText: 'GAME OVER' }); return; }
        if (g.state === 'clear') {
          if (++g.anim >= 20) { collapse(); g.state = 'settle'; g.anim = 0; }
          return;
        }
        if (g.state === 'settle') { if (++g.anim >= 8) resolve(); return; }
        const p = g.piece; if (!p) return;
        if (input.upP && canPlace(p.r, p.c - 1)) { p.c--; sfx.move(); g.lock = Math.min(g.lock, 10); }
        if (input.downP && canPlace(p.r, p.c + 1)) { p.c++; sfx.move(); g.lock = Math.min(g.lock, 10); }
        // 按住方向键连续移动
        if ((input.upT > 14 && input.upT % 5 === 0) && canPlace(p.r, p.c - 1)) p.c--;
        if ((input.downT > 14 && input.downT % 5 === 0) && canPlace(p.r, p.c + 1)) p.c++;
        if (input.okP && !p.magic) { p.gems.unshift(p.gems.pop()); sfx.tone(1200, 0.04, { vol: 0.05 }); }
        const soft = input.okT > 10;
        const delay = soft ? 2 : fallDelay();
        if (++g.fallT >= delay) {
          g.fallT = 0;
          if (canPlace(p.r + 1, p.c)) { p.r++; g.lock = 0; if (soft) st.score += 1; }
          else if (++g.lock >= (soft ? 1 : 2)) lockPiece();
        }
      }

      function gem(ctx, v, x, y, s, alpha) {
        if (v === MAGIC) {
          const hue = (g.t * 6) % 360;
          ctx.fillStyle = 'hsl(' + hue + ',90%,60%)';
          ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, 7); ctx.fill();
          return;
        }
        const G = GEMS[v];
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.fillStyle = G.d; D.rrect(ctx, x - s, y - s, s * 2, s * 2, 4); ctx.fill();
        ctx.fillStyle = G.c; D.rrect(ctx, x - s + 2, y - s + 2, s * 2 - 4, s * 2 - 4, 3); ctx.fill();
        // 切面
        ctx.fillStyle = G.l; ctx.globalAlpha *= 0.8;
        ctx.beginPath(); ctx.moveTo(x - s + 3, y - s + 3); ctx.lineTo(x + s - 5, y - s + 3); ctx.lineTo(x, y - 1); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - s + 4, y - s + 4, 3, 3);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(x - s + 3, y + s - 3); ctx.lineTo(x + s - 3, y + s - 3); ctx.lineTo(x, y + 1); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#12051f', '#0a0a24']); ctx.fillRect(0, 0, W, H);
        // 背景光斑
        for (let i = 0; i < 6; i++) { ctx.fillStyle = GEMS[i].c; ctx.globalAlpha = 0.06; ctx.beginPath(); ctx.arc((i * 83 + g.t * 0.2) % W, 60 + (i * 97) % 240, 40, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        // 井
        D.panel(ctx, OX - 4, OY - 4, COLS * CS + 8, ROWS * CS + 8, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: 'rgba(255,90,210,.7)', lw: 2 });
        ctx.strokeStyle = 'rgba(255,255,255,.04)';
        for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(OX + c * CS, OY); ctx.lineTo(OX + c * CS, OY + ROWS * CS); ctx.stroke(); }
        // 落点影子
        const p = g.piece;
        if (p) {
          let r = p.r; while (canPlace(r + 1, p.c)) r++;
          ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(OX + p.c * CS, OY + Math.max(0, r) * CS, CS, CS * 3);
        }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const v = grid[r][c]; if (v < 0) continue;
          const marked = g.marks && g.marks[r][c];
          const x = OX + c * CS + CS / 2, y = OY + r * CS + CS / 2;
          if (marked) { const k = g.anim / 20; gem(ctx, v, x, y, (CS / 2 - 1) * (1 + k * 0.3), (g.anim >> 1) % 2 ? 1 : 0.4); }
          else gem(ctx, v, x, y, CS / 2 - 1);
        }
        if (p) for (let i = 0; i < 3; i++) { const r = p.r + i; if (r >= 0) gem(ctx, p.gems[i], OX + p.c * CS + CS / 2, OY + r * CS + CS / 2, CS / 2 - 1); }
        // 顶部警戒线
        ctx.fillStyle = 'rgba(255,60,60,.25)'; ctx.fillRect(OX, OY + 2 * CS - 1, COLS * CS, 1);

        // 侧栏
        const sx = OX + COLS * CS + 14, sw = W - sx - 8;
        D.text(ctx, 'NEON GEMS', sx + sw / 2, 22, { size: 9, color: '#ff6be0', align: 'center' });
        D.panel(ctx, sx, 32, sw, 80, { r: 6, fill: 'rgba(0,0,0,.45)', stroke: 'rgba(255,255,255,.15)' });
        D.text(ctx, 'NEXT', sx + sw / 2, 46, { size: 7, color: '#aaa', align: 'center' });
        if (g.next) for (let i = 0; i < 3; i++) gem(ctx, g.next.gems[i], sx + sw / 2, 60 + i * 16, 7);
        const row = (label, val, y, c) => { D.text(ctx, label, sx + 4, y, { size: 7, color: '#aaa' }); D.text(ctx, val, sx + sw - 4, y + 13, { size: 12, color: c || '#fff', align: 'right' }); };
        row('SCORE', U.fmt(st.score), 130, '#fff');
        row('LEVEL', String(g.level), 164, '#38e1ff');
        row('宝石', String(st.cleared), 198, '#3ee07a');
        row('最大连锁', String(st.maxChain), 232, '#ffd23f');
        D.bar(ctx, sx + 4, 258, sw - 8, 4, (st.cleared % 30) / 30, '#38e1ff');
        D.text(ctx, '下一级', sx + sw / 2, 272, { size: 7, color: '#aaa', align: 'center' });
        D.text(ctx, '斜线也算!', sx + sw / 2, 300, { size: 8, color: '#ff6be0', align: 'center' });
      }

      return { update, draw };
    }
  });
})();
