// simulator/games/tank.js — 坦克大战（重制）
// 三键坦克：自动前进，UP/DOWN 在下个格点左/右拐，OK 开炮，按住 OK 原地停车连射
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320;
  const C = 8, COLS = 26, ROWS = 32, OX = 16, OY = 28; // 8px 小格，13x16 大格
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 上右下左

  const MAPS = [
    [
      '.............',
      '.B.B.B.B.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.BSB.B.B.',
      '.B.B.....B.B.',
      '.....B.B.....',
      'S.BB.....BB.S',
      '.....B.B.....',
      '.B.B.BBB.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.....B.B.',
      'TT.........TT',
      '.B.B.BBB.B.B.',
      '.B.B.....B.B.',
      '.....BBB.....',
      '.....BEB.....'
    ],
    [
      '...S...S.....',
      '.BB.S...S.BB.',
      '.BB.....W.BB.',
      '....BB.WWW...',
      'SS..B........',
      '....T.B..BBSS',
      '.TT..BB..B...',
      'TTTT..W..BB..',
      'TT.WWWW...BB.',
      '....T...S....',
      '.BB.T..SS.BB.',
      '.B...BB.S.BB.',
      '.B.S..B......',
      '.....S..B.S..',
      '.....BBB.....',
      '.....BEB.....'
    ],
    [
      '....TTTTT....',
      '.SS.TBBBT.SS.',
      '....TB.BT....',
      'BB..T...T..BB',
      '..WW.....WW..',
      '.B..BB.BB..B.',
      '.B.TT...TT.B.',
      '.S.TTSSSTT.S.',
      '.B.TT...TT.B.',
      '.B..BB.BB..B.',
      '..WW.....WW..',
      'BB..T.S.T..BB',
      '....T...T....',
      '.SS.......SS.',
      '.....BBB.....',
      '.....BEB.....'
    ]
  ];
  const ETYPES = {
    basic: { speed: 0.55, hp: 1, score: 100, bullet: 2.4, color: '#b8c0cc' },
    fast: { speed: 1.15, hp: 1, score: 200, bullet: 2.6, color: '#e8f0ff' },
    power: { speed: 0.6, hp: 1, score: 300, bullet: 3.8, color: '#9ec5ff' },
    armor: { speed: 0.45, hp: 4, score: 400, bullet: 2.6, color: '#7fae6a' }
  };
  const ITEMS = ['star', 'grenade', 'helmet', 'clock', 'shovel', 'tank'];
  const ITEM_ICON = { star: '★', grenade: '✸', helmet: '⛨', clock: '◷', shovel: '⛏', tank: '♥' };

  A.define({
    id: 'battlecity',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, kills: 0, stage: 1, tier: 0 });
      const g = { t: 0, stage: 1, lives: 3, grid: null, tanks: [], bullets: [], item: null, freeze: 0, shovel: 0, baseAlive: true,
        left: 20, spawnT: 60, onField: 0, spawnIdx: 0, clearT: 0, overT: 0, over: false, queue: [] };
      let player = null;

      function loadStage() {
        const m = MAPS[(g.stage - 1) % MAPS.length];
        g.grid = [];
        for (let r = 0; r < ROWS; r++) { g.grid.push(new Array(COLS).fill(0)); }
        for (let r = 0; r < 16; r++) for (let c = 0; c < 13; c++) {
          const ch = m[r][c];
          const v = ch === 'B' ? 1 : ch === 'S' ? 2 : ch === 'W' ? 3 : ch === 'T' ? 4 : ch === 'E' ? 9 : 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g.grid[r * 2 + dy][c * 2 + dx] = v;
        }
        g.tanks = g.tanks.filter((t) => t.player);
        g.bullets = []; g.item = null; g.freeze = 0; g.shovel = 0;
        g.left = 20; g.spawnT = 60; g.spawnIdx = 0; g.baseAlive = true;
        g.order = buildOrder();
        if (!player) spawnPlayer(); else { player.x = 8 * C; player.y = 30 * C; player.dir = 0; player.shield = 180; }
      }
      function buildOrder() {
        const s = g.stage, list = [];
        const mix = s === 1 ? [14, 4, 2, 0] : s === 2 ? [10, 4, 4, 2] : s === 3 ? [6, 6, 4, 4] : [4, 6, 5, 5];
        ['basic', 'fast', 'power', 'armor'].forEach((k, i) => { for (let j = 0; j < mix[i]; j++) list.push(k); });
        for (let i = list.length - 1; i > 0; i--) { const j = U.randi(0, i); [list[i], list[j]] = [list[j], list[i]]; }
        return list;
      }
      function spawnPlayer() {
        player = { player: true, x: 8 * C, y: 30 * C, dir: 0, speed: 1.1, moving: true, cool: 0, shield: 180, tier: player ? 0 : 0, hp: 1, anim: 0, holdT: 0, spawnT: 0 };
        g.tanks.push(player);
      }

      // ---------------- 地图查询
      const cellAt = (px, py) => {
        const c = Math.floor(px / C), r = Math.floor(py / C);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 2;
        return g.grid[r][c];
      };
      const solidForTank = (v) => v === 1 || v === 2 || v === 3 || v === 9;
      function blocked(t, nx, ny) {
        if (nx < 0 || ny < 0 || nx > COLS * C - 16 || ny > ROWS * C - 16) return true;
        for (let yy = ny; yy < ny + 16; yy += 7.99) for (let xx = nx; xx < nx + 16; xx += 7.99) {
          if (solidForTank(cellAt(xx, yy))) return true;
        }
        if (solidForTank(cellAt(nx + 15.9, ny + 15.9))) return true;
        for (const o of g.tanks) {
          if (o === t || o.dead || o.spawnT > 0) continue;
          if (nx < o.x + 16 && nx + 16 > o.x && ny < o.y + 16 && ny + 16 > o.y) {
            // 允许已经重叠的坦克分开
            if (!(t.x < o.x + 16 && t.x + 16 > o.x && t.y < o.y + 16 && t.y + 16 > o.y)) return true;
          }
        }
        return false;
      }
      function tryMove(t, sp) {
        const [dx, dy] = DIRS[t.dir];
        // 转弯时自动对齐到 8px
        if (dx) t.y = snap(t.y); else t.x = snap(t.x);
        const nx = t.x + dx * sp, ny = t.y + dy * sp;
        if (!blocked(t, nx, ny)) { t.x = nx; t.y = ny; t.anim++; return true; }
        return false;
      }
      const snap = (v) => { const s = Math.round(v / C) * C; return Math.abs(s - v) < 4 ? s : v; };
      const aligned = (t) => Math.abs(t.x - Math.round(t.x / C) * C) < 1.2 && Math.abs(t.y - Math.round(t.y / C) * C) < 1.2;

      function fire(t) {
        const max = t.player && t.tier >= 2 ? 2 : 1;
        if (t.cool > 0 || g.bullets.filter((b) => b.owner === t).length >= max) return false;
        const [dx, dy] = DIRS[t.dir];
        const spd = t.player ? (t.tier >= 1 ? 4.6 : 3.2) : ETYPES[t.type].bullet;
        g.bullets.push({ x: t.x + 8 + dx * 8, y: t.y + 8 + dy * 8, dx, dy, spd, owner: t, player: !!t.player, steel: t.player && t.tier >= 3 });
        t.cool = t.player ? (t.tier >= 1 ? 10 : 16) : 30;
        if (t.player) sfx.pew(0.7);
        return true;
      }

      function hitCells(b) {
        // 子弹前方横向 2 格（16px 宽的一条）
        const px = b.x + b.dx * 2, py = b.y + b.dy * 2;
        const cells = b.dx ? [[px, py - 4], [px, py + 3]] : [[px - 4, py], [px + 3, py]];
        let hit = false;
        for (const [x, y] of cells) {
          const c = Math.floor(x / C), r = Math.floor(y / C);
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) { hit = true; continue; }
          const v = g.grid[r][c];
          if (v === 1) { g.grid[r][c] = 0; hit = true; fx.burst(OX + c * C + 4, OY + r * C + 4, 4, ['#b5502e', '#7a2e18', '#d9a07a'], { speed: 1.6, life: 14 }); }
          else if (v === 2) { if (b.steel) { g.grid[r][c] = 0; fx.spark(OX + c * C + 4, OY + r * C + 4, '#ddd', 5); } hit = true; }
          else if (v === 9) { hit = true; if (!b.player) destroyBase(); }
        }
        if (hit) sfx.tone(b.player ? 180 : 140, 0.05, { type: 'square', vol: 0.05 });
        return hit;
      }
      function destroyBase() {
        if (!g.baseAlive) return;
        g.baseAlive = false;
        for (let r = 30; r < 32; r++) for (let c = 12; c < 14; c++) g.grid[r][c] = 0;
        fx.burst(OX + 13 * C, OY + 31 * C, 40, ['#fff', '#ffd23f', '#ff5a5a'], { speed: 4, life: 40 });
        fx.addShake(12); fx.flash('#ff3b3b', 0.5); sfx.boom(true);
        g.over = true;
        fx.say('基地被摧毁', '#ff5a5a', 120);
      }

      function spawnEnemy() {
        const pts = [0, 12, 24];
        const px = pts[g.spawnIdx % 3] * C; g.spawnIdx++;
        const type = g.order.shift() || 'basic';
        const bonus = [4, 11, 18].includes(20 - g.left + 1);
        const e = Object.assign({ type, x: px, y: 0, dir: 2, cool: U.randi(30, 80), anim: 0, spawnT: 50, bonus, think: U.randi(20, 60) }, { hp: ETYPES[type].hp, maxHp: ETYPES[type].hp });
        g.tanks.push(e);
        g.left--;
      }

      function killTank(t, byPlayer) {
        t.dead = true;
        fx.burst(OX + t.x + 8, OY + t.y + 8, 20, ['#fff', '#ffd23f', '#ff7b3a', '#ff3b3b'], { speed: 3.2, life: 26 });
        fx.ring(OX + t.x + 8, OY + t.y + 8, '#ffd23f', 20);
        sfx.boom(false);
        if (t.player) {
          fx.addShake(10); fx.flash('#ff3b3b', 0.35); sfx.hurt();
          g.lives--;
          if (g.lives < 0) { g.over = true; fx.say('坦克全灭', '#ff5a5a', 120); }
          else { const tier = player.tier; player = null; spawnPlayer(); player.tier = Math.max(0, tier - 1); st.tier = player.tier; }
          return;
        }
        if (byPlayer) {
          st.kills++;
          const sc = ETYPES[t.type].score;
          st.score += sc;
          fx.floatText(OX + t.x + 8, OY + t.y, '' + sc, '#fff');
          fx.addShake(3);
        }
        if (t.bonus) dropItem();
      }
      function dropItem() {
        for (let k = 0; k < 40; k++) {
          const x = U.randi(1, 23) * C, y = U.randi(2, 25) * C;
          const v = cellAt(x + 4, y + 4);
          if (v === 0 || v === 4) { g.item = { kind: U.pick(ITEMS), x, y, t: 900 }; sfx.pickup(); return; }
        }
      }
      function takeItem(kind) {
        st.score += 500;
        fx.floatText(OX + g.item.x + 8, OY + g.item.y, '500', '#ffd23f');
        const names = { star: '主炮升级', grenade: '全屏爆破', helmet: '护盾', clock: '时间冻结', shovel: '钢铁基地', tank: '奖命 +1' };
        fx.say(names[kind], '#ffd23f', 60);
        sfx.power();
        if (kind === 'star') { player.tier = Math.min(3, player.tier + 1); st.tier = Math.max(st.tier, player.tier); }
        else if (kind === 'grenade') { for (const t of g.tanks) if (!t.player && !t.dead && t.spawnT <= 0) killTank(t, true); fx.flash('#fff', 0.6); fx.addShake(10); }
        else if (kind === 'helmet') player.shield = 600;
        else if (kind === 'clock') g.freeze = 480;
        else if (kind === 'shovel') { setBaseWall(2); g.shovel = 900; }
        else if (kind === 'tank') g.lives++;
        g.item = null;
      }
      function setBaseWall(v) {
        const cells = [];
        for (let r = 28; r < 32; r++) for (let c = 10; c < 16; c++) if (!(r >= 30 && c >= 12 && c <= 13)) cells.push([r, c]);
        for (const [r, c] of cells) { if (g.grid[r][c] !== 9) { const occupied = g.tanks.some((t) => !t.dead && t.x < (c + 1) * C && t.x + 16 > c * C && t.y < (r + 1) * C && t.y + 16 > r * C); if (!occupied) g.grid[r][c] = v; } }
        for (let r = 30; r < 32; r++) for (let c = 12; c < 14; c++) if (g.baseAlive) g.grid[r][c] = 9;
      }

      loadStage();

      // ---------------- update
      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 90) api.end({ overText: g.baseAlive ? 'GAME OVER' : 'BASE LOST' }); updateBullets(); return; }
        if (g.clearT > 0) {
          if (--g.clearT === 0) { g.stage++; st.stage = g.stage; loadStage(); fx.say('STAGE ' + g.stage, '#ffd23f', 90); }
          return;
        }

        // ---- 玩家
        const p = player;
        if (p && !p.dead) {
          if (p.cool > 0) p.cool--;
          if (p.shield > 0) p.shield--;
          if (input.upP) g.queue.push(-1);
          if (input.downP) g.queue.push(1);
          if (g.queue.length > 2) g.queue.shift();
          if (input.okP) fire(p);
          p.holdT = input.ok ? p.holdT + 1 : 0;
          const hold = p.holdT > 9;
          if (hold && p.cool <= 0) fire(p);
          // 执行转向（对齐格点时）
          if (g.queue.length && (aligned(p) || !p.moving)) {
            const turn = g.queue.shift();
            p.dir = (p.dir + turn + 4) % 4;
            p.x = snap(p.x); p.y = snap(p.y);
            sfx.move();
          }
          if (!hold) { p.moving = tryMove(p, p.speed); if (!p.moving && g.t % 4 === 0) p.x = snap(p.x); }
          else p.moving = false;
          // 道具
          if (g.item && p.x < g.item.x + 16 && p.x + 16 > g.item.x && p.y < g.item.y + 16 && p.y + 16 > g.item.y) takeItem(g.item.kind);
        }

        // ---- 敌人出场
        const onField = g.tanks.filter((t) => !t.player && !t.dead).length;
        if (g.left > 0 && onField < Math.min(4, 2 + g.stage) && --g.spawnT <= 0) { spawnEnemy(); g.spawnT = Math.max(60, 150 - g.stage * 20); }
        if (g.left === 0 && onField === 0 && !g.over) {
          g.clearT = 150; st.score += 1000 * g.stage;
          fx.say('STAGE CLEAR  +' + (1000 * g.stage), '#7dffb3', 130); sfx.clear();
          return;
        }

        // ---- 敌人 AI
        for (const e of g.tanks) {
          if (e.player || e.dead) continue;
          if (e.spawnT > 0) { e.spawnT--; continue; }
          if (g.freeze > 0) continue;
          const T = ETYPES[e.type];
          if (e.cool > 0) e.cool--;
          const moved = tryMove(e, T.speed);
          if (--e.think <= 0 || !moved) {
            if (aligned(e) || !moved) {
              e.think = U.randi(40, 120);
              // 偏向基地和玩家
              const r = Math.random();
              let want;
              if (r < 0.25) want = 2;
              else if (r < 0.6 && p) want = Math.abs(p.x - e.x) > Math.abs(p.y - e.y) ? (p.x > e.x ? 1 : 3) : (p.y > e.y ? 2 : 0);
              else want = U.randi(0, 3);
              if (!moved && want === e.dir) want = (e.dir + (U.chance(0.5) ? 1 : 3)) % 4;
              e.dir = want; e.x = snap(e.x); e.y = snap(e.y);
            }
          }
          // 开火：对准玩家或基地时更爱开
          const lined = p && ((Math.abs(p.x - e.x) < 8 && ((e.dir === 2 && p.y > e.y) || (e.dir === 0 && p.y < e.y))) || (Math.abs(p.y - e.y) < 8 && ((e.dir === 1 && p.x > e.x) || (e.dir === 3 && p.x < e.x))));
          if (e.cool <= 0 && (lined ? U.chance(0.2) : U.chance(0.02 + g.stage * 0.004))) fire(e);
        }
        if (g.freeze > 0) g.freeze--;
        if (g.shovel > 0 && --g.shovel === 0) setBaseWall(1);
        if (g.item && --g.item.t <= 0) g.item = null;

        updateBullets();
        g.tanks = g.tanks.filter((t) => !t.dead || t.player && t === player);
      }

      function updateBullets() {
        for (let i = g.bullets.length - 1; i >= 0; i--) {
          const b = g.bullets[i];
          let gone = false;
          for (let s = 0; s < 2 && !gone; s++) {
            b.x += b.dx * b.spd / 2; b.y += b.dy * b.spd / 2;
            if (b.x < 0 || b.y < 0 || b.x > COLS * C || b.y > ROWS * C) { gone = true; fx.spark(OX + U.clamp(b.x, 0, COLS * C), OY + U.clamp(b.y, 0, ROWS * C), '#fff', 3); break; }
            if (hitCells(b)) { gone = true; break; }
            // 子弹对撞
            for (const o of g.bullets) {
              if (o !== b && !o.gone && o.player !== b.player && Math.abs(o.x - b.x) < 4 && Math.abs(o.y - b.y) < 4) { o.gone = true; gone = true; fx.spark(OX + b.x, OY + b.y, '#fff', 4); }
            }
            if (gone) break;
            for (const t of g.tanks) {
              if (t.dead || t === b.owner || t.spawnT > 0) continue;
              if (b.player === !!t.player) continue;
              if (b.x > t.x && b.x < t.x + 16 && b.y > t.y && b.y < t.y + 16) {
                gone = true;
                if (t.player) { if (t.shield <= 0) killTank(t); else fx.spark(OX + b.x, OY + b.y, '#7dffb3', 4); }
                else {
                  t.hp--; fx.spark(OX + b.x, OY + b.y, '#fff', 5);
                  if (t.bonus) { t.bonus = false; dropItem(); }
                  if (t.hp <= 0) killTank(t, true); else sfx.tone(300, 0.05, { vol: 0.06 });
                }
                break;
              }
            }
          }
          if (gone || b.gone) g.bullets.splice(i, 1);
        }
      }

      // ---------------- draw
      function drawCell(ctx, v, c, r) {
        const x = OX + c * C, y = OY + r * C;
        if (v === 1) {
          ctx.fillStyle = '#9a3f1f'; ctx.fillRect(x, y, C, C);
          ctx.fillStyle = '#c8643a'; ctx.fillRect(x, y, C - 1, 3); ctx.fillRect(x + ((r % 2) ? 0 : 4), y + 4, 3, 3); ctx.fillRect(x + ((r % 2) ? 4 : 0), y + 4, 3, 3);
          ctx.fillStyle = '#5a2310'; ctx.fillRect(x, y + 3, C, 1); ctx.fillRect(x, y + 7, C, 1);
        } else if (v === 2) {
          ctx.fillStyle = '#9aa3ad'; ctx.fillRect(x, y, C, C);
          ctx.fillStyle = '#e6ebf0'; ctx.fillRect(x + 1, y + 1, 5, 5);
          ctx.fillStyle = '#6a737d'; ctx.fillRect(x + 2, y + 2, 4, 4);
        } else if (v === 3) {
          ctx.fillStyle = '#1f5fbf'; ctx.fillRect(x, y, C, C);
          ctx.fillStyle = '#6fb3ff'; const o = ((g.t >> 4) + c + r) % 2;
          ctx.fillRect(x + 1 + o * 3, y + 2, 3, 1); ctx.fillRect(x + 4 - o * 3, y + 5, 3, 1);
        }
      }
      function drawTank(ctx, t) {
        const x = OX + t.x + 8, y = OY + t.y + 8;
        if (t.spawnT > 0) {
          const k = (t.spawnT >> 2) % 4;
          ctx.fillStyle = '#fff';
          D.star(ctx, x, y, 3 + k * 2, '#fff');
          return;
        }
        let body, dark;
        if (t.player) { body = '#f0c14b'; dark = '#8a5a10'; }
        else {
          const T = ETYPES[t.type];
          body = t.bonus && (g.t >> 3) % 2 ? '#ff4a4a' : t.type === 'armor' ? ['#7fae6a', '#c9a55a', '#b8c0cc', '#e0e0e0'][4 - t.hp] || T.color : T.color;
          dark = '#3a4250';
        }
        ctx.save(); ctx.translate(x, y); ctx.rotate(t.dir * Math.PI / 2);
        // 履带
        ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-8, -8, 4, 16); ctx.fillRect(4, -8, 4, 16);
        ctx.fillStyle = dark;
        const off = (t.anim >> 1) % 3;
        for (let i = -8 + off; i < 8; i += 3) { ctx.fillRect(-8, i, 4, 1); ctx.fillRect(4, i, 4, 1); }
        // 车身
        ctx.fillStyle = body; ctx.fillRect(-5, -5, 10, 11);
        ctx.fillStyle = dark; ctx.fillRect(-5, 4, 10, 2);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-5, -5, 10, 1);
        // 炮塔 + 炮管
        ctx.fillStyle = dark; ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = body; ctx.fillRect(-2, -2, 4, 4);
        ctx.fillStyle = t.player && t.tier >= 3 ? '#fff' : dark; ctx.fillRect(-1, -10, 2, 8);
        if (t.player && t.tier >= 1) { ctx.fillStyle = '#fff'; ctx.fillRect(-1, -10, 2, 2); }
        ctx.restore();
        if (t.shield > 0 && (g.t >> 1) % 2) { ctx.strokeStyle = '#7dffb3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke(); }
      }
      function draw(ctx) {
        ctx.fillStyle = '#5a5a5a'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0b0b0e'; ctx.fillRect(OX, OY, COLS * C, ROWS * C);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const v = g.grid[r][c]; if (v && v !== 4 && v !== 9) drawCell(ctx, v, c, r); }
        // 基地
        const bx = OX + 12 * C, by = OY + 30 * C;
        if (g.baseAlive) {
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.moveTo(bx + 8, by + 1); ctx.lineTo(bx + 15, by + 6); ctx.lineTo(bx + 12, by + 7); ctx.lineTo(bx + 13, by + 14); ctx.lineTo(bx + 3, by + 14); ctx.lineTo(bx + 4, by + 7); ctx.lineTo(bx + 1, by + 6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#8a5a10'; ctx.fillRect(bx + 6, by + 5, 4, 3); ctx.fillRect(bx + 4, by + 14, 8, 2);
        } else { ctx.fillStyle = '#444'; ctx.fillRect(bx + 2, by + 8, 12, 8); ctx.fillStyle = '#222'; ctx.fillRect(bx + 4, by + 10, 8, 4); }
        // 道具
        if (g.item && (g.item.t > 180 || (g.t >> 3) % 2)) {
          const ix = OX + g.item.x, iy = OY + g.item.y;
          D.panel(ctx, ix, iy, 16, 16, { r: 3, fill: '#ff4a4a', stroke: '#fff', lw: 1 });
          D.text(ctx, ITEM_ICON[g.item.kind], ix + 8, iy + 12, { size: 11, color: '#fff', align: 'center', bold: true });
        }
        for (const t of g.tanks) if (!t.dead) drawTank(ctx, t);
        for (const b of g.bullets) { ctx.fillStyle = b.player ? '#fff' : '#ffb3b3'; ctx.fillRect(OX + b.x - 1.5, OY + b.y - 1.5, 3, 3); }
        // 树丛盖在坦克上
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g.grid[r][c] === 4) {
          const x = OX + c * C, y = OY + r * C;
          ctx.fillStyle = '#1f6e2a'; ctx.fillRect(x, y, C, C);
          ctx.fillStyle = '#3fae4a'; ctx.fillRect(x + 1, y + 1, 3, 3); ctx.fillRect(x + 4, y + 4, 3, 3);
          ctx.fillStyle = '#8be08f'; ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 4, y + 4, 1, 1);
        }
        if (g.freeze > 0) { ctx.fillStyle = 'rgba(120,180,255,.08)'; ctx.fillRect(OX, OY, COLS * C, ROWS * C); }
        // HUD
        D.text(ctx, U.fmt(st.score), 6, 17, { size: 10, color: '#fff' });
        D.text(ctx, 'STAGE ' + g.stage, W / 2, 17, { size: 9, color: '#ffd23f', align: 'center' });
        D.text(ctx, '♥' + Math.max(0, g.lives), W - 6, 17, { size: 10, color: '#ff8a80', align: 'right' });
        // 底部：剩余敌人 + 火力
        const y0 = OY + ROWS * C + 6;
        D.text(ctx, '敌人', 6, y0 + 10, { size: 8, color: '#ddd' });
        for (let i = 0; i < g.left; i++) { ctx.fillStyle = '#222'; ctx.fillRect(30 + (i % 10) * 9, y0 + 2 + Math.floor(i / 10) * 9, 7, 7); ctx.fillStyle = '#b8c0cc'; ctx.fillRect(31 + (i % 10) * 9, y0 + 3 + Math.floor(i / 10) * 9, 5, 5); }
        D.text(ctx, '火力', 130, y0 + 10, { size: 8, color: '#ddd' });
        for (let i = 0; i < 3; i++) D.star(ctx, 160 + i * 12, y0 + 6, 5, player && player.tier > i ? '#ffd23f' : null, 'rgba(255,255,255,.4)');
        if (g.freeze > 0) D.text(ctx, '冻结 ' + Math.ceil(g.freeze / 60), W - 6, y0 + 10, { size: 8, color: '#9ec5ff', align: 'right' });
        else if (g.shovel > 0) D.text(ctx, '钢墙 ' + Math.ceil(g.shovel / 60), W - 6, y0 + 10, { size: 8, color: '#ddd', align: 'right' });
        if (g.t > 0 && g.t < 240 && g.stage === 1) D.text(ctx, '提前按 UP / DOWN，路口自动拐弯', W / 2, 190, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
