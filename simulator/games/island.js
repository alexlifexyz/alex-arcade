// simulator/games/island.js — 冒险岛（重制）
// 自动奔跑 + 体力持续下降 → 吃水果续命；蛋里开石斧/滑板/蜂蜜；旗子存档；分区越来越快
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, S = 1.5, VW = 160, VH = 214, T = 16, FLOOR = 182, PX = 44;

  const SP = {
    run1: ['....aaaa....', '...abbbba...', '..abbbbbbaa.', '..acccccc...', '..acdccdc...', '...cccccc...', '..eeeeeee...', '.cceeeeecc..', '.c.eeeee.c..', '...fffff....', '...cc..cc...', '..hh....hh..'],
    run2: ['....aaaa....', '...abbbba...', '..abbbbbbaa.', '..acccccc...', '..acdccdc...', '...cccccc...', '..eeeeeee...', '..ceeeeec...', '..ceeeeec...', '...fffff....', '....cccc....', '....hhh.....'],
    jump: ['....aaaa....', '...abbbba...', '..abbbbbbaa.', '..acccccc...', '..acdccdc...', 'c..cccccc..c', '.ceeeeeeec..', '...eeeeee...', '...eeeeee...', '...fffff....', '..cc...cc...', '.hh.....hh..'],
    pal: { a: '#7a1010', b: '#e0342f', c: '#ffc98a', d: '#1a1a1a', e: '#ffffff', f: '#3cae4a', h: '#7a4a1a' },
    snail: ['....aaaa....', '...abbbba...', '..abbccbba..', '..abcbbcba..', '..abbccbba..', 'e..abbbba...', 'ee..aaaa....', 'dddddddddd..', '.dddddddddd.'],
    snailPal: { a: '#6a2a8a', b: '#c07ae0', c: '#f0d0ff', d: '#9ad05a', e: '#9ad05a' },
    frog: ['..aa....aa..', '.abba..abba.', '.abbaaaabba.', 'aabbbbbbbbaa', 'abbbccccbbba', 'abbccccccbba', '.abbbbbbbba.', 'aa.a....a.aa'],
    frogPal: { a: '#1f5a1f', b: '#4ac24a', c: '#d8f0a0' },
    bird: ['..a.........', '.aba....aa..', 'abbbaaaabba.', '.abbbbbbbbbc', '..abbbbbba..', '...aa..aa...'],
    birdPal: { a: '#3a1a6a', b: '#7a5ae0', c: '#ffb000' },
    egg: ['...aaaa...', '..abbbba..', '.abbcbbba.', '.abbbbcba.', 'abcbbbbbba', 'abbbbcbbba', 'abbbbbbcba', '.abcbbbba.', '..abbbba..', '...aaaa...'],
    eggPal: { a: '#8a7a5a', b: '#fff8e8', c: '#ff8ac0' },
    axe: ['..aa..', '.abba.', 'abbbc.', '.aacc.', '...cc.', '...cc.'],
    axePal: { a: '#555', b: '#aaa', c: '#8a5a2b' },
    apple: ['...a....', '..bba...', '.bbbbbb.', 'bbcbbbbb', 'bbbbbbbb', 'bbbbbbbb', '.bbbbbb.', '..bbbb..'],
    applePal: { a: '#3a7a1a', b: '#e0342f', c: '#ffb3b3' },
    banana: ['......a.', '.....bb.', '....bbb.', '...bbbb.', '..bbbb..', 'bbbbb...', '.bbb....'],
    bananaPal: { a: '#6a4a1a', b: '#ffd23f' },
    melon: ['..aaaa..', '.abcbca.', 'abcbcbca', 'acbcbcba', 'abcbcbca', '.acbcba.', '..aaaa..'],
    melonPal: { a: '#1f5a1f', b: '#4ac24a', c: '#2a8a2a' },
    pine: ['..a.a...', '...a....', '.bbbbb..', 'bcbcbcb.', 'bbcbcbb.', 'bcbcbcb.', '.bbbbb..'],
    pinePal: { a: '#3a9a2a', b: '#e0a020', c: '#8a5a10' }
  };
  const FRUITS = [
    { k: 'apple', e: 1, s: 50 }, { k: 'banana', e: 1, s: 100 }, { k: 'pine', e: 2, s: 200 }, { k: 'melon', e: 3, s: 500 }
  ];
  const THEMES = [
    { sky: ['#6ec6ff', '#d9f2ff'], hill: '#7fcf7f', hill2: '#5fb05f', grass: '#3cae4a', dirt: '#b87838', dirt2: '#9a6028', name: 'SUNNY FOREST' },
    { sky: ['#ffb36e', '#ffe6c2'], hill: '#e0a860', hill2: '#c88c48', grass: '#e8c060', dirt: '#d8a060', dirt2: '#b88040', name: 'GOLDEN BEACH' },
    { sky: ['#2a2a5a', '#6a5aa0'], hill: '#3a3a70', hill2: '#2a2a58', grass: '#6a8ae0', dirt: '#4a4a7a', dirt2: '#3a3a64', name: 'MOONLIT CAVE' },
    { sky: ['#bfe6ff', '#ffffff'], hill: '#dfefff', hill2: '#c0d8f0', grass: '#ffffff', dirt: '#8aa8c8', dirt2: '#7090b0', name: 'SNOW PEAK' }
  ];

  A.define({
    id: 'adventure',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, area: 1, fruit: 0, axeKills: 0 });

      const g = {
        t: 0, cam: 0, cols: [], genX: 0, ents: [], axes: [], area: 1, areaLen: 230, areaStart: 0, check: 0,
        areaBegin: 0, lives: 3, energy: 16, drainT: 0, over: false, overT: 0, dieT: 0, banner: 0
      };
      const p = { x: 40, y: 0, vy: 0, ground: true, axe: false, board: false, honey: 0, jumpHeld: 0, anim: 0, inv: 0, dash: false, throwT: 0 };

      // ---------------- 地形生成（按列）
      const colTop = (h) => FLOOR - (h - 1) * T;
      function pushCol(h) { g.cols.push(h); }
      function difficulty() { return Math.min(1, (g.cols.length - g.areaStart) / g.areaLen * 0.6 + (g.area - 1) * 0.25); }
      function genChunk() {
        const c0 = g.cols.length, d = difficulty();
        const h = g.cols.length ? Math.max(1, g.cols[g.cols.length - 1] || 1) : 1;
        const inArea = c0 - g.areaStart;
        if (inArea >= g.areaLen) { // 分区终点
          for (let i = 0; i < 14; i++) pushCol(1);
          g.ents.push({ kind: 'goal', x: (c0 + 6) * T, y: colTop(1) });
          g.areaStart = g.cols.length;
          return;
        }
        if (c0 > 20 && Math.floor(inArea / 115) !== Math.floor((inArea + 12) / 115) && inArea > 20) {
          for (let i = 0; i < 8; i++) pushCol(1);
          g.ents.push({ kind: 'flag', x: (c0 + 3) * T, y: colTop(1), col: c0 + 3 });
          return;
        }
        const r = Math.random();
        const n = U.randi(6, 10);
        if (c0 < 16) { for (let i = 0; i < 16; i++) pushCol(1); fruitsLine(c0 + 6, 5, colTop(1) - 24); return; }
        if (r < 0.2) { // 坑
          const gap = U.randi(2, 2 + Math.round(d * 2));
          for (let i = 0; i < 3; i++) pushCol(h);
          for (let i = 0; i < gap; i++) pushCol(0);
          for (let i = 0; i < 4; i++) pushCol(h);
          fruitsArc(c0 + 3, gap + 1, colTop(h) - 30);
        } else if (r < 0.32) { // 台阶
          const nh = U.clamp(h + U.pick([-1, 1, 1]), 1, 3);
          for (let i = 0; i < 4; i++) pushCol(h);
          for (let i = 0; i < n; i++) pushCol(nh);
          if (U.chance(0.5)) enemy(c0 + 4 + n - 2, nh);
        } else if (r < 0.46) { // 敌人
          for (let i = 0; i < n + 2; i++) pushCol(h);
          enemy(c0 + 4, h);
          if (d > 0.3 && U.chance(0.5)) enemy(c0 + 8, h);
          if (U.chance(0.4)) fruitsLine(c0 + 2, 2, colTop(h) - 20);
        } else if (r < 0.56) { // 火堆 / 石头
          for (let i = 0; i < n; i++) pushCol(h);
          g.ents.push({ kind: U.chance(0.55) ? 'fire' : 'rock', x: (c0 + 4) * T + 2, y: colTop(h) });
          fruitsArc(c0 + 3, 3, colTop(h) - 34);
        } else if (r < 0.66) { // 浮台过长坑
          const gap = U.randi(5, 7);
          for (let i = 0; i < 3; i++) pushCol(h);
          for (let i = 0; i < gap; i++) pushCol(0);
          for (let i = 0; i < 3; i++) pushCol(h);
          g.ents.push({ kind: 'plat', x: (c0 + 3 + 1) * T, y: colTop(h) - 30, w: (gap - 2) * T, vx: d > 0.4 ? 0.4 : 0, x0: (c0 + 4) * T, range: 16 });
          fruitsLine(c0 + 4, gap - 2, colTop(h) - 50);
        } else if (r < 0.74) { // 蛋
          for (let i = 0; i < n; i++) pushCol(h);
          g.ents.push({ kind: 'egg', x: (c0 + 4) * T, y: colTop(h) - 10, hits: 0 });
        } else if (r < 0.84) { // 鸟群
          for (let i = 0; i < n + 3; i++) pushCol(h);
          const k = 1 + (d > 0.4 ? 1 : 0);
          for (let i = 0; i < k; i++) g.ents.push({ kind: 'bird', x: (c0 + 8 + i * 5) * T, y: colTop(h) - U.rand(40, 70), baseY: 0, t: U.rand(0, 6), hp: 1 });
          fruitsLine(c0 + 2, 3, colTop(h) - 18);
        } else { // 平地水果大丰收
          for (let i = 0; i < n; i++) pushCol(h);
          fruitsArc(c0 + 1, n - 2, colTop(h) - 26);
        }
      }
      function enemy(col, h) {
        const d = difficulty();
        const kind = U.chance(0.35 + d * 0.3) ? 'frog' : 'snail';
        g.ents.push({ kind, x: col * T, y: colTop(h), vx: kind === 'snail' ? -0.35 : 0, vy: 0, t: U.randi(0, 60), hp: 1 });
      }
      function fruit(col, y) { const f = FRUITS[Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : Math.random() < 0.7 ? 2 : 3]; g.ents.push({ kind: 'fruit', f, x: col * T + 4, y }); }
      function fruitsLine(c, n, y) { for (let i = 0; i < n; i++) fruit(c + i, y); }
      function fruitsArc(c, n, y) { for (let i = 0; i < n; i++) fruit(c + i, y - Math.sin((i + 0.5) / n * Math.PI) * 26); }

      const heightAt = (x) => { const c = Math.floor(x / T); return c < 0 ? 1 : (g.cols[c] == null ? 1 : g.cols[c]); };
      const groundAt = (x) => { const h = heightAt(x); return h === 0 ? 9999 : colTop(h); };

      function reset(fromCheck) {
        const c = fromCheck ? g.check : 0;
        p.x = c * T + 8; p.y = groundAt(p.x + 6) - 16; p.vy = 0; p.ground = true;
        p.board = false; p.honey = 0; p.inv = 90;
        g.energy = 16; g.drainT = 0;
        g.axes = [];
        // 清掉复活点附近的敌人
        g.ents = g.ents.filter((e) => !((e.kind === 'snail' || e.kind === 'frog' || e.kind === 'bird') && Math.abs(e.x - p.x) < 100));
      }
      while (g.cols.length < 40) genChunk();
      reset(false);

      function die(reason) {
        if (g.dieT > 0) return;
        g.dieT = 80; p.vy = -4; sfx.hurt(); fx.addShake(6);
        fx.say(reason, '#ff6b6b', 60);
      }
      function addScore(n, x, y, c) { st.score += n; if (x != null) fx.floatText(SX(x), SY(y), '' + n, c || '#fff'); }
      const SX = (x) => (x - g.cam) * S, SY = (y) => y * S;

      // ---------------- update
      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 60) api.end(); return; }
        if (g.dieT > 0) {
          p.vy += 0.25; p.y += p.vy;
          if (--g.dieT === 0) {
            g.lives--;
            if (g.lives < 0) { g.over = true; return; }
            reset(true);
          }
          return;
        }
        while (g.cols.length * T < g.cam + VW * 2) genChunk();

        // 体力
        const drainEvery = Math.max(70, (p.dash ? 70 : 130) - (g.area - 1) * 10);
        if (++g.drainT >= drainEvery) { g.drainT = 0; g.energy--; if (g.energy <= 3) sfx.beep(330); }
        if (g.energy <= 0) { die('体力耗尽'); return; }

        // 速度
        p.dash = input.down && !p.board;
        const base = 1.5 + (g.area - 1) * 0.12;
        const spd = p.board ? base + 1 : p.dash ? base + 1.1 : base;
        // 水平移动 + 撞墙
        const nx = p.x + spd;
        const frontTop = groundAt(nx + 12);
        if (frontTop < p.y + 16 - 4 && heightAt(nx + 12) > 0) { /* 撞到台阶，停住 */ }
        else p.x = nx;
        p.anim += spd;

        // 跳
        if (input.okP && p.ground) { p.vy = -4.6; p.ground = false; p.jumpHeld = 0; sfx.jump(); }
        if (!p.ground) {
          if (input.ok && p.vy < 0 && p.jumpHeld < 16) { p.jumpHeld++; p.vy += 0.18; } else p.vy += 0.42;
          p.vy = Math.min(p.vy, 7);
        }
        const oldBottom = p.y + 16;
        p.y += p.vy;
        // 落地：地面 + 浮台
        let floor = Math.min(groundAt(p.x + 3), groundAt(p.x + 9));
        for (const e of g.ents) if (e.kind === 'plat' && p.x + 10 > e.x && p.x + 2 < e.x + e.w && oldBottom <= e.y + 1 && p.vy >= 0) floor = Math.min(floor, e.y);
        if (p.y + 16 >= floor && oldBottom <= floor + 6) {
          if (!p.ground && p.vy > 2) sfx.land();
          p.y = floor - 16; p.vy = 0; p.ground = true;
        } else if (p.y + 16 < floor - 1) p.ground = false;
        if (p.y > VH + 20) { die('掉进坑里'); return; }

        // 扔斧头
        if (p.throwT > 0) p.throwT--;
        if (input.upP) {
          if (p.axe && p.throwT <= 0 && g.axes.length < 2) { g.axes.push({ x: p.x + 10, y: p.y + 2, vx: 3.6 + spd, vy: -2.6, rot: 0 }); p.throwT = 12; sfx.whoosh(); }
          else if (!p.axe) fx.floatText(SX(p.x + 6), SY(p.y - 6), '没有石斧', '#ccc', 8);
        }
        for (let i = g.axes.length - 1; i >= 0; i--) {
          const a = g.axes[i]; a.x += a.vx; a.vy += 0.25; a.y += a.vy; a.rot += 0.4;
          if (a.y > VH || a.x > g.cam + VW + 20) { g.axes.splice(i, 1); continue; }
          for (const e of g.ents) {
            if ((e.kind === 'snail' || e.kind === 'frog' || e.kind === 'bird' || e.kind === 'rock') && !e.dead && Math.abs(a.x - (e.x + 6)) < 10 && Math.abs(a.y - (e.y - 6)) < 12) {
              e.dead = true; g.axes.splice(i, 1);
              if (e.kind !== 'rock') { st.axeKills++; addScore(e.kind === 'bird' ? 200 : 100, e.x, e.y - 10); }
              else addScore(50, e.x, e.y - 10);
              fx.burst(SX(e.x + 6), SY(e.y - 6), 12, ['#fff', '#ffd23f', e.kind === 'frog' ? '#4ac24a' : '#c07ae0'], { speed: 2.5 });
              sfx.boom(false);
              break;
            }
          }
        }

        if (p.honey > 0) p.honey--;
        if (p.inv > 0) p.inv--;

        // 实体
        const px = p.x, py = p.y;
        for (const e of g.ents) {
          if (e.dead) continue;
          if (e.x < g.cam - 60) { e.dead = true; continue; }
          if (e.x > g.cam + VW + 40) continue;
          if (e.kind === 'snail') { e.x += e.vx; e.y = groundAt(e.x + 6); if (e.y > 2000) e.dead = true; }
          else if (e.kind === 'frog') { e.t++; if (e.t % 90 === 0) e.vy = -4; e.vy += 0.3; e.y = Math.min(e.y + e.vy, groundAt(e.x + 6)); if (e.y >= groundAt(e.x + 6)) e.vy = 0; }
          else if (e.kind === 'bird') { e.t += 0.05; e.x -= 0.9; if (!e.baseY) e.baseY = e.y; e.y = e.baseY + Math.sin(e.t * 2) * 14; }
          else if (e.kind === 'plat' && e.vx) { e.t = (e.t || 0) + 1; const dx = Math.sin(e.t / 60) * e.range; const nx2 = e.x0 + dx; if (p.ground && Math.abs(p.y + 16 - e.y) < 2 && p.x + 10 > e.x && p.x + 2 < e.x + e.w) p.x += nx2 - e.x; e.x = nx2; }

          // 碰撞
          const hx = e.x, hy = e.y;
          const touch = (w, h) => px + 11 > hx && px + 1 < hx + w && py + 16 > hy - h && py < hy;
          if (e.kind === 'fruit') {
            if (px + 12 > e.x && px < e.x + 8 && py + 16 > e.y && py < e.y + 8) {
              e.dead = true; st.fruit++;
              g.energy = Math.min(16, g.energy + e.f.e);
              addScore(e.f.s, e.x, e.y, '#ffd23f');
              sfx.coin(); fx.spark(SX(e.x + 4), SY(e.y + 4), '#ffd23f', 5);
            }
          } else if (e.kind === 'egg') {
            if (px + 12 > e.x && px < e.x + 10 && py + 16 > e.y && py < e.y + 10) {
              if (!e.cracked) {
                e.cracked = true; e.item = U.pick(['axe', 'axe', 'board', 'honey', 'eggplant']);
                fx.burst(SX(e.x + 5), SY(e.y + 5), 14, ['#fff8e8', '#ff8ac0'], { speed: 2.5 }); sfx.pickup();
                e.y -= 8;
              } else if (!e.taken) {
                e.taken = true; e.dead = true;
                if (e.item === 'axe') { p.axe = true; fx.say('石斧！UP 扔出', '#ffd23f', 70); }
                else if (e.item === 'board') { p.board = true; fx.say('滑板！能挡一次', '#7cc7ff', 70); }
                else if (e.item === 'honey') { p.honey = 480; fx.say('蜂蜜无敌！', '#ffd23f', 70); }
                else { g.energy = Math.max(1, g.energy - 4); fx.say('糟了，是茄子…', '#b58cff', 70); sfx.hurt(); }
                if (e.item !== 'eggplant') sfx.power();
                addScore(300, e.x, e.y);
              }
            }
          } else if (e.kind === 'flag') {
            if (px > e.x && g.check < e.col) { g.check = e.col; fx.say('存档点', '#7dffb3', 50); sfx.select(); addScore(500); }
          } else if (e.kind === 'goal') {
            if (px > e.x && !e.done) {
              e.done = true; g.area++; st.area = g.area; g.check = Math.floor(e.x / T); g.areaBegin = g.check;
              addScore(3000 * (g.area - 1) + g.energy * 100);
              fx.say('AREA ' + g.area + '  ' + THEMES[(g.area - 1) % 4].name, '#ffd23f', 110);
              sfx.clear(); fx.flash('#fff', 0.4);
            }
          } else if (e.kind === 'snail' || e.kind === 'frog' || e.kind === 'bird' || e.kind === 'fire' || e.kind === 'rock') {
            const w = e.kind === 'fire' ? 12 : 12, h = e.kind === 'bird' ? 10 : e.kind === 'rock' ? 8 : 12;
            const hit = e.kind === 'bird' ? (px + 11 > hx && px + 1 < hx + 12 && py + 16 > hy && py < hy + 8) : touch(w, h);
            if (hit) {
              if (e.kind === 'rock') {
                e.dead = true; g.energy = Math.max(0, g.energy - 2); p.vy = -2; p.ground = false;
                fx.floatText(SX(px + 6), SY(py - 6), '绊倒 -体力', '#ff9a9a', 8); sfx.thud();
              } else if (p.honey > 0 && e.kind !== 'fire') {
                e.dead = true; addScore(200, e.x, e.y - 10, '#ffd23f'); fx.burst(SX(e.x + 6), SY(e.y - 6), 12, ['#ffd23f', '#fff']); sfx.boom(false);
              } else if (p.inv > 0 || p.honey > 0) {
                // 无敌期穿过
              } else if (p.board) {
                p.board = false; p.inv = 60; fx.say('滑板碎了！', '#7cc7ff', 50); sfx.hurt(); fx.addShake(4);
                if (e.kind !== 'fire') e.dead = true;
              } else { die(e.kind === 'fire' ? '被火烫到' : '被撞倒了'); return; }
            }
          }
        }
        g.ents = g.ents.filter((e) => !e.dead);

        // 镜头
        g.cam = Math.max(g.cam, p.x - PX);
        st.score = Math.max(st.score, 0);
        if (g.t % 30 === 0) st.score += 10;
      }

      // ---------------- draw
      function draw(ctx) {
        const th = THEMES[(g.area - 1) % 4];
        ctx.save(); ctx.scale(S, S);
        const W = VW, H = VH;
        ctx.fillStyle = D.vgrad(ctx, 0, H, th.sky); ctx.fillRect(0, 0, W, H);
        // 远山
        for (let layer = 0; layer < 2; layer++) {
          const par = layer ? 0.4 : 0.2, col = layer ? th.hill2 : th.hill, base = layer ? 160 : 140, amp = layer ? 22 : 34;
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 8) { const wx = x + g.cam * par; ctx.lineTo(x, base - Math.abs(Math.sin(wx / (layer ? 47 : 83))) * amp); }
          ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
        }
        // 云
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        for (let i = 0; i < 4; i++) { const x = U.wrap(i * 90 - g.cam * 0.1, W + 80) - 40; D.rrect(ctx, x, 30 + i * 16, 34, 9, 4.5); ctx.fill(); }

        // 地面
        const c0 = Math.floor(g.cam / T), c1 = c0 + Math.ceil(W / T) + 1;
        for (let c = c0; c <= c1; c++) {
          const h = g.cols[c]; if (!h) continue;
          const x = c * T - g.cam, top = colTop(h);
          ctx.fillStyle = th.dirt; ctx.fillRect(x, top, T, H - top);
          ctx.fillStyle = th.dirt2; for (let y = top + 8; y < H; y += 8) ctx.fillRect(x + ((y / 8 + c) % 2 ? 2 : 9), y, 4, 3);
          ctx.fillStyle = th.grass; ctx.fillRect(x, top, T, 4);
          ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, top, T, 1);
        }
        // 实体
        for (const e of g.ents) {
          const x = e.x - g.cam; if (x < -40 || x > W + 40) continue;
          if (e.kind === 'fruit') D.sprite(ctx, SP[e.f.k], SP[e.f.k + 'Pal'], x, e.y + Math.sin((g.t + e.x) / 10) * 1.5, {});
          else if (e.kind === 'snail') D.sprite(ctx, SP.snail, SP.snailPal, x, e.y - 9, {});
          else if (e.kind === 'frog') D.sprite(ctx, SP.frog, SP.frogPal, x, e.y - 8, {});
          else if (e.kind === 'bird') D.sprite(ctx, SP.bird, SP.birdPal, x, e.y, { flip: false });
          else if (e.kind === 'rock') { ctx.fillStyle = '#6a6a72'; D.rrect(ctx, x, e.y - 8, 12, 8, 3); ctx.fill(); ctx.fillStyle = '#9a9aa2'; ctx.fillRect(x + 2, e.y - 7, 5, 2); }
          else if (e.kind === 'fire') {
            ctx.fillStyle = '#6a3a1a'; ctx.fillRect(x - 1, e.y - 3, 14, 3);
            const f = Math.sin(g.t / 3 + e.x) * 2;
            ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(x, e.y - 3); ctx.quadraticCurveTo(x + 6 + f, e.y - 22, x + 12, e.y - 3); ctx.fill();
            ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x + 3, e.y - 3); ctx.quadraticCurveTo(x + 6 - f, e.y - 14, x + 9, e.y - 3); ctx.fill();
          } else if (e.kind === 'egg') {
            if (!e.cracked) D.sprite(ctx, SP.egg, SP.eggPal, x, e.y + Math.sin(g.t / 8) * 1, {});
            else {
              const icon = { axe: '🪓', board: '🛹', honey: '🍯', eggplant: '🍆' }[e.item];
              D.text(ctx, icon, x + 5, e.y + 10 + Math.sin(g.t / 6) * 2, { size: 12, align: 'center' });
            }
          } else if (e.kind === 'plat') {
            ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, e.y, e.w, 6);
            ctx.fillStyle = '#b87838'; ctx.fillRect(x, e.y, e.w, 2);
            for (let i = 4; i < e.w; i += 10) { ctx.fillStyle = '#6a4020'; ctx.fillRect(x + i, e.y + 2, 1, 4); }
          } else if (e.kind === 'flag') {
            ctx.fillStyle = '#ddd'; ctx.fillRect(x, e.y - 36, 2, 36);
            ctx.fillStyle = g.check >= e.col ? '#7dffb3' : '#ff5a5a'; ctx.beginPath(); ctx.moveTo(x + 2, e.y - 36); ctx.lineTo(x + 16, e.y - 31); ctx.lineTo(x + 2, e.y - 26); ctx.fill();
          } else if (e.kind === 'goal') {
            ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, e.y - 40, 4, 40); ctx.fillRect(x + 30, e.y - 40, 4, 40);
            D.panel(ctx, x - 6, e.y - 50, 46, 16, { r: 3, fill: '#ffd23f', stroke: '#8a5a10' });
            D.text(ctx, 'GOAL', x + 17, e.y - 38, { size: 9, color: '#5a3a08', align: 'center' });
          }
        }
        // 斧头
        for (const a of g.axes) { ctx.save(); ctx.translate(a.x - g.cam, a.y); ctx.rotate(a.rot); D.sprite(ctx, SP.axe, SP.axePal, 0, 0, { center: true, scale: 1.4 }); ctx.restore(); }
        // 玩家
        const blink = (p.inv > 0 && (g.t >> 2) % 2);
        if (!blink) {
          const x = p.x - g.cam, y = p.y;
          const fr = !p.ground ? SP.jump : ((p.anim / 8) | 0) % 2 ? SP.run1 : SP.run2;
          const pal = p.honey > 0 && (g.t >> 2) % 2 ? Object.assign({}, SP.pal, { b: '#ffd23f', e: '#fff2a8' }) : SP.pal;
          if (p.board) { ctx.fillStyle = '#2f7be0'; D.rrect(ctx, x - 2, y + 15, 16, 3, 1); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x, y + 18, 3, 2); ctx.fillRect(x + 9, y + 18, 3, 2); }
          D.sprite(ctx, fr, pal, x, y + (p.board ? -2 : 0) + (g.dieT > 0 ? 0 : 0), { flip: false });
          if (p.axe) D.sprite(ctx, SP.axe, SP.axePal, x - 3, y + 4, { scale: 0.8 });
          if (p.dash && p.ground && g.t % 3 === 0) fx.burst((x + 2) * S, (y + 15) * S, 2, ['#e8d8b0', '#fff'], { speed: 1.2, angle: Math.PI, spread: 1, life: 10 });
        }
        ctx.restore();
        drawHud(ctx, th);
      }

      function drawHud(ctx, th) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, 30);
        D.text(ctx, U.fmt(st.score), 6, 12, { size: 10, color: '#fff' });
        D.text(ctx, 'AREA ' + g.area, W / 2, 12, { size: 8, color: '#ffd23f', align: 'center' });
        D.text(ctx, '♥' + Math.max(0, g.lives), W - 6, 12, { size: 10, color: '#ff8a80', align: 'right' });
        // 体力条（16 格）
        D.text(ctx, '体力', 6, 26, { size: 8, color: '#fff' });
        for (let i = 0; i < 16; i++) {
          const on = i < g.energy;
          ctx.fillStyle = on ? (g.energy <= 4 ? ((g.t >> 3) % 2 ? '#ff5a5a' : '#ffd23f') : '#ffd23f') : 'rgba(255,255,255,.18)';
          ctx.fillRect(32 + i * 8, 19, 6, 7);
        }
        const icons = (p.axe ? '🪓' : '') + (p.board ? '🛹' : '') + (p.honey > 0 ? '🍯' : '');
        if (icons) D.text(ctx, icons, W - 6, 27, { size: 9, align: 'right' });
        // 分区进度
        const prog = U.clamp((p.x / T - g.areaBegin) / (g.areaLen + 20), 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, H - 3, W, 3);
        ctx.fillStyle = '#7dffb3'; ctx.fillRect(0, H - 3, W * prog, 3);
        if (g.t > 0 && g.t < 220) D.text(ctx, '吃水果续体力 · 按住 OK 跳更高', W / 2, 120, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
