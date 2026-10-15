// simulator/games/contra.js — 口袋魂斗罗（重制）
// 自动卷轴跑射：枪一直在打，UP 斜上瞄准，DOWN 卧倒，OK 空翻跳；胶囊换枪；关底拆炮台墙
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, S = 1.5, VW = 160, VH = 214, T = 16, FLOOR = 176, PSX = 34;

  const SP = {
    run1: ['....aaa.....', '...abbba....', '...acccaeee.', '...acdca....', '....ccc.....', '..ffffff....', '.cffffffgggg', '.c.ffff.....', '...hhhh.....', '...hh.hh....', '..hh...hh...', '.ii.....ii..'],
    run2: ['....aaa.....', '...abbba....', '...acccaeee.', '...acdca....', '....ccc.....', '..ffffff....', '..cfffffgggg', '..cffff.....', '...hhhh.....', '....hhh.....', '....hh.h....', '...ii..ii...'],
    up: ['.........g..', '....aaa.g...', '...abbbag...', '...acccg....', '...acdga....', '....cgc.....', '..ffffff....', '.cffffff....', '...hhhh.....', '...hh.hh....', '..hh...hh...', '.ii.....ii..'],
    prone: ['............', '............', '............', '............', '............', '............', '............', '............', '.aaa........', 'abbbffffhhii', 'acccffffhhii', '.cc..gggggg.'],
    ball: ['...aaaa...', '..abbbba..', '.affffffa.', 'affcffcffa', 'afhhffhhfa', 'afhhffhhfa', 'affcffcffa', '.affffffa.', '..aiiiia..', '...aaaa...'],
    pal: { a: '#2a1a1a', b: '#e0342f', c: '#ffc98a', d: '#1a1a1a', e: '#e0342f', f: '#3a5ab0', g: '#9aa0aa', h: '#5a4a3a', i: '#222' },
    sold1: ['....aaa.....', '...abbba....', '...accca....', '...acdca....', '....ccc.....', '..ffffff....', 'gggfffffc...', '....ffffc...', '....hhhh....', '...hh.hh....', '..hh...hh...', '..ii...ii...'],
    sold2: ['....aaa.....', '...abbba....', '...accca....', '...acdca....', '....ccc.....', '..ffffff....', 'gggfffffc...', '....ffffc...', '....hhhh....', '....hhh.....', '....h.hh....', '...ii.ii....'],
    soldPal: { a: '#1a1a1a', b: '#6a7a4a', c: '#e8b888', d: '#1a1a1a', f: '#8a8a6a', g: '#666', h: '#5a5a4a', i: '#222' },
    capsule: ['..aaaa..', '.abbbba.', 'accbbcca', 'abbccbba', 'accbbcca', '.abbbba.', '..aaaa..'],
    capPal: { a: '#3a1a1a', b: '#ff5a5a', c: '#ffd23f' }
  };
  const WEAP = {
    N: { rate: 9, name: '步枪', color: '#fff' },
    M: { rate: 5, name: '机枪', color: '#ffd23f' },
    S: { rate: 13, name: '散弹', color: '#ff5a5a' },
    L: { rate: 22, name: '激光', color: '#38e1ff' }
  };
  const THEMES = [
    { sky: ['#1a2a4a', '#3a6a8a'], far: '#1f4a3a', near: '#2a6a3a', ground: '#5a4a2a', top: '#4ac24a', name: '丛林' },
    { sky: ['#2a1a1a', '#6a3a2a'], far: '#4a2a2a', near: '#6a3a2a', ground: '#4a4a52', top: '#8a8a92', name: '基地' },
    { sky: ['#5a7aa0', '#d8e8f8'], far: '#8aa8c8', near: '#c8d8e8', ground: '#6a7a8a', top: '#ffffff', name: '雪原' }
  ];

  A.define({
    id: 'contra',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, bosses: 0, gotS: false, kills: 0, stage: 1 });
      const g = {
        t: 0, cam: 0, speed: 1.05, stage: 1, cols: [], plats: [], ents: [], shots: [], ebul: [], caps: [],
        lives: 3, boss: null, bossAt: 0, stageLen: 210, stageStart: 0, weapon: 'N', fireT: 0, clearT: 0, over: false, overT: 0,
        nextExtend: 20000, spawnT: 60
      };
      const p = { y: 0, vy: 0, ground: true, prone: false, aimUp: false, inv: 120, dead: 0, anim: 0 };
      const SX = (x) => (x - g.cam) * S, SY = (y) => y * S;
      const colTop = (h) => FLOOR - (h - 1) * T;

      // ---------------- 地形
      function genChunk() {
        const c0 = g.cols.length, inS = c0 - g.stageStart;
        const h = g.cols.length ? (g.cols[c0 - 1] || 1) : 1;
        const push = (hh, n) => { for (let i = 0; i < n; i++) g.cols.push(hh); };
        if (inS >= g.stageLen) { push(1, 30); g.bossAt = (c0 + 4) * T; g.stageStart = g.cols.length + 1000; return; }
        if (c0 < 14) { push(1, 14); return; }
        const r = Math.random();
        if (r < 0.18) { push(h, 3); push(0, U.randi(2, 3)); push(h, 3); }
        else if (r < 0.34) { const nh = U.clamp(h + U.pick([-1, 1]), 1, 2); push(h, 2); push(nh, U.randi(6, 10)); }
        else if (r < 0.5) { push(h, 10); g.plats.push({ x: (c0 + 2) * T, y: colTop(h) - 44, w: T * 5 }); }
        else push(h, U.randi(6, 10));
      }
      const heightAt = (x) => { const c = Math.floor(x / T); return g.cols[c] == null ? 1 : g.cols[c]; };
      const groundAt = (x) => { const hh = heightAt(x); return hh === 0 ? 9999 : colTop(hh); };
      while (g.cols.length < 30) genChunk();
      p.y = groundAt(g.cam + PSX) - 20;

      // ---------------- 敌人
      function spawnEnemy() {
        const d = 1 + (g.stage - 1) * 0.3 + Math.min(1, (g.cam / T - (g.stageStartCol || 0)) / g.stageLen) * 0.4;
        const x = g.cam + VW + 10;
        const r = Math.random();
        if (r < 0.42) {
          const n = U.randi(1, d > 1.3 ? 3 : 2);
          for (let i = 0; i < n; i++) g.ents.push({ kind: 'runner', x: x + i * 16, y: groundAt(x) - 20, vx: -0.9 - Math.random() * 0.3, vy: 0, hp: 1, t: 0 });
        } else if (r < 0.62) {
          // 高处狙击手（需要抬枪）
          const pl = g.plats.find((q) => q.x > g.cam + VW * 0.6 && q.x < g.cam + VW + 40 && !q.taken);
          if (pl) { pl.taken = true; g.ents.push({ kind: 'sniper', x: pl.x + pl.w / 2, y: pl.y - 20, hp: 2, t: U.randi(0, 40), onPlat: pl }); }
          else g.ents.push({ kind: 'rifle', x: x, y: groundAt(x) - 20, hp: 2, t: U.randi(0, 40) });
        } else if (r < 0.78) {
          g.ents.push({ kind: 'turret', x: x, y: groundAt(x) - 14, hp: 6, t: 0 });
        } else if (r < 0.9) {
          g.ents.push({ kind: 'rifle', x: x, y: groundAt(x) - 20, hp: 2, t: U.randi(0, 40) });
        } else {
          g.caps.push({ x: x, y: U.rand(40, 90), t: 0, hp: 1, letter: U.pick(['S', 'S', 'M', 'L', 'M']) });
        }
      }
      function ebullet(x, y, tx, ty, spd, c) {
        const a = Math.atan2(ty - y, tx - x);
        g.ebul.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, c: c || '#ff5a5a' });
      }

      // ---------------- BOSS：炮台墙
      function startBoss() {
        const hp = 60 + g.stage * 20;
        g.boss = { x: g.cam + VW - 44, core: hp, coreMax: hp, cannons: [{ y: 60, hp: 12, t: 0 }, { y: 110, hp: 12, t: 30 }], t: 0, dying: 0 };
        fx.say('WARNING  防御墙', '#ff5a5a', 100);
        sfx.tone(200, 0.4, { type: 'sawtooth', vol: 0.12 }); sfx.tone(200, 0.4, { type: 'sawtooth', vol: 0.12, delay: 0.5 });
      }

      function playerBox() {
        const x = g.cam + PSX;
        if (p.prone && p.ground) return { x: x - 6, y: p.y + 12, w: 16, h: 8 };
        if (!p.ground) return { x: x - 5, y: p.y + 4, w: 10, h: 12 };
        return { x: x - 4, y: p.y + 2, w: 8, h: 18 };
      }
      function hurt() {
        if (p.inv > 0 || p.dead) return;
        p.dead = 70; p.vy = -4;
        sfx.hurt(); fx.addShake(8); fx.flash('#ff3b3b', 0.35); fx.hitstop(5);
        fx.burst(SX(g.cam + PSX), SY(p.y + 10), 20, ['#fff', '#ff5a5a', '#ffd23f'], { speed: 3 });
        g.lives--; g.weapon = 'N'; g.ebul.length = 0;
      }
      function addScore(n, x, y, c) {
        st.score += n; if (x != null) fx.floatText(SX(x), SY(y), '' + n, c || '#fff');
        if (st.score >= g.nextExtend) { g.nextExtend += 30000; g.lives++; fx.say('1UP', '#7dffb3', 50); sfx.power(); }
      }
      function fire() {
        const x = g.cam + PSX + 6;
        let y = p.y + 8, ang = 0;
        if (p.prone && p.ground) { y = p.y + 15; }
        else if (p.aimUp) { ang = p.ground ? -Math.PI / 4 : -Math.PI / 4; y = p.y + 2; }
        const wk = g.weapon, spd = 5;
        const add = (a, kind) => g.shots.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, kind: kind || wk, life: 60 });
        if (wk === 'S') { for (let i = -2; i <= 2; i++) add(ang + i * 0.16); sfx.pew(0.8); }
        else if (wk === 'L') { add(ang, 'L'); sfx.tone(1400, 0.12, { type: 'sawtooth', vol: 0.04, to: 500 }); }
        else { add(ang); sfx.pew(wk === 'M' ? 1.2 : 1); }
      }

      // ---------------- update
      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 60) api.end(); return; }
        if (g.clearT > 0) {
          g.cam += g.speed * 1.5;
          if (--g.clearT === 0) {
            g.stage++; st.stage = g.stage; g.stageStart = g.cols.length; g.stageStartCol = g.cols.length;
            fx.say('STAGE ' + g.stage + '  ' + THEMES[(g.stage - 1) % 3].name, '#ffd23f', 100);
          }
        }
        while (g.cols.length * T < g.cam + VW * 2) genChunk();

        // 卷轴
        if (!g.boss && g.clearT === 0) {
          if (g.bossAt && g.cam + VW >= g.bossAt + 60) { g.cam = g.bossAt + 60 - VW; startBoss(); }
          else g.cam += g.speed;
        }
        const px = g.cam + PSX;

        // 死亡动画
        if (p.dead > 0) {
          p.vy += 0.3; p.y += p.vy;
          if (--p.dead === 0) {
            if (g.lives < 0) { g.over = true; return; }
            p.y = 20; p.vy = 0; p.inv = 150; p.ground = false;
          }
        } else {
          p.prone = input.down && p.ground;
          p.aimUp = input.up;
          if (input.okP && p.ground) { p.vy = -5.4; p.ground = false; sfx.jump(); }
          if (!p.ground) { p.vy += input.ok && p.vy < 0 ? 0.24 : 0.36; if (input.down) p.vy += 0.15; }
          const oldB = p.y + 20;
          p.y += p.vy;
          let floor = groundAt(px);
          for (const q of g.plats) if (px > q.x && px < q.x + q.w && oldB <= q.y + 2 && p.vy >= 0 && !(input.down && p.ground)) floor = Math.min(floor, q.y);
          if (p.y + 20 >= floor && oldB <= floor + 8) { if (!p.ground) sfx.land(); p.y = floor - 20; p.vy = 0; p.ground = true; }
          else if (p.y + 20 < floor - 1) p.ground = false;
          // 被墙挡：跳上一级台阶
          const front = groundAt(px + 8);
          if (p.ground && front < p.y + 20 - 2 && front < 9000) { p.y = front - 20; }
          if (p.y > VH + 30) { p.inv = 0; hurt(); p.dead = 40; }
          if (p.inv > 0) p.inv--;
          p.anim += g.boss ? 0 : 1;
          if (--g.fireT <= 0) { g.fireT = WEAP[g.weapon].rate; fire(); }
        }

        // 敌人生成
        if (!g.boss && g.clearT === 0 && --g.spawnT <= 0) { spawnEnemy(); g.spawnT = Math.max(28, 70 - g.stage * 8 - U.randi(0, 20)); }

        // 子弹
        for (let i = g.shots.length - 1; i >= 0; i--) {
          const s = g.shots[i];
          s.x += s.vx; s.y += s.vy; s.life--;
          let gone = s.life <= 0 || s.x > g.cam + VW + 10 || s.y < -10 || s.y > VH;
          if (!gone && groundAt(s.x) < s.y && s.y > 0) gone = true;
          const pierce = s.kind === 'L';
          if (!gone) {
            for (const e of g.ents) {
              if (e.dead || (pierce && e.hitBy === s)) continue;
              const bw = e.kind === 'turret' ? 14 : 10, bh = e.kind === 'turret' ? 14 : 20;
              if (s.x > e.x - bw / 2 && s.x < e.x + bw / 2 && s.y > e.y && s.y < e.y + bh) {
                e.hp -= pierce ? 3 : 1; e.flash = 3; e.hitBy = s;
                if (e.hp <= 0) killEnemy(e);
                if (!pierce) { gone = true; break; }
              }
            }
            for (const c of g.caps) {
              if (!c.dead && Math.abs(s.x - c.x) < 8 && Math.abs(s.y - c.y) < 7) {
                c.dead = true; gone = !pierce;
                g.ents.push({ kind: 'item', x: c.x, y: c.y, vy: -2, letter: c.letter });
                fx.burst(SX(c.x), SY(c.y), 12, ['#ffd23f', '#ff5a5a', '#fff']); sfx.boom(false);
              }
            }
            const b = g.boss;
            if (b && !b.dying) {
              for (const cn of b.cannons) {
                if (cn.hp > 0 && s.x > b.x - 8 && s.x < b.x + 10 && Math.abs(s.y - cn.y) < 8) {
                  cn.hp -= pierce ? 3 : 1; cn.flash = 3; gone = !pierce;
                  if (cn.hp <= 0) { fx.burst(SX(b.x), SY(cn.y), 20, ['#fff', '#ffd23f', '#ff7b3a']); sfx.boom(true); addScore(2000, b.x, cn.y); fx.addShake(6); }
                }
              }
              if (!gone && s.x > b.x + 4 && s.y > colTop(1) - 34 && s.y < colTop(1)) {
                b.core -= pierce ? 3 : 1; b.flash = 3; gone = true;
                if (b.core <= 0) { b.dying = 1; g.ebul.length = 0; }
              }
            }
          }
          if (gone) g.shots.splice(i, 1);
        }

        // 敌人逻辑
        const pb = playerBox();
        for (const e of g.ents) {
          if (e.dead) continue;
          if (e.flash > 0) e.flash--;
          e.t = (e.t || 0) + 1;
          if (e.x < g.cam - 30) { e.dead = true; continue; }
          if (e.kind === 'runner') {
            e.x += e.vx;
            const gy = groundAt(e.x);
            if (gy > 9000) { e.vy += 0.3; e.y += e.vy; if (e.y > VH) e.dead = true; }
            else if (gy < e.y + 20 - 4) { e.vy = -4; e.y += e.vy; }
            else { e.vy += 0.3; e.y = Math.min(e.y + e.vy, gy - 20); if (e.y >= gy - 20) e.vy = 0; }
          } else if (e.kind === 'rifle' || e.kind === 'sniper') {
            if (e.t % Math.max(50, 90 - g.stage * 10) === 30 && e.x < g.cam + VW - 10 && p.dead === 0) ebullet(e.x - 4, e.y + 6, px, p.y + 10, 1.6 + g.stage * 0.15);
          } else if (e.kind === 'turret') {
            if (e.t % Math.max(45, 80 - g.stage * 8) === 20 && e.x < g.cam + VW - 10 && p.dead === 0) ebullet(e.x, e.y + 5, px, p.y + 10, 1.9 + g.stage * 0.15, '#ffd23f');
          } else if (e.kind === 'item') {
            e.vy += 0.15; e.y += e.vy; e.x -= 0.2;
            const gy = groundAt(e.x); if (e.y + 8 > gy) { e.y = gy - 8; e.vy = 0; }
            if (Math.abs(e.x - px) < 10 && e.y + 8 > pb.y && e.y < pb.y + pb.h + 4) {
              e.dead = true; g.weapon = e.letter;
              if (e.letter === 'S') st.gotS = true;
              fx.say(WEAP[e.letter].name + ' ' + e.letter, WEAP[e.letter].color, 60); sfx.power();
              addScore(1000);
            }
            continue;
          }
          // 碰到玩家
          if (e.kind !== 'item' && p.dead === 0) {
            const bw = e.kind === 'turret' ? 14 : 8;
            if (U.hit(pb, { x: e.x - bw / 2, y: e.y + 2, w: bw, h: e.kind === 'turret' ? 12 : 16 })) hurt();
          }
        }
        g.ents = g.ents.filter((e) => !e.dead);
        // 胶囊
        for (const c of g.caps) { c.t++; c.x -= 0.4; c.y += Math.sin(c.t / 12) * 0.8; if (c.x < g.cam - 20) c.dead = true; }
        g.caps = g.caps.filter((c) => !c.dead);

        // 敌弹
        for (let i = g.ebul.length - 1; i >= 0; i--) {
          const b = g.ebul[i];
          b.x += b.vx; b.y += b.vy;
          if (b.x < g.cam - 10 || b.x > g.cam + VW + 10 || b.y < -10 || b.y > VH) { g.ebul.splice(i, 1); continue; }
          if (p.dead === 0 && b.x > pb.x && b.x < pb.x + pb.w && b.y > pb.y && b.y < pb.y + pb.h) { g.ebul.splice(i, 1); hurt(); break; }
        }

        // BOSS
        const b = g.boss;
        if (b) {
          b.t++;
          if (b.flash > 0) b.flash--;
          if (b.dying) {
            b.dying++;
            if (b.dying % 5 === 0) { fx.burst(SX(b.x + U.rand(-10, 40)), SY(U.rand(40, 180)), 14, ['#fff', '#ffd23f', '#ff7b3a']); sfx.boom(false); fx.addShake(4); }
            if (b.dying > 90) {
              fx.flash('#fff', 0.8); sfx.boom(true); fx.addShake(14);
              addScore(10000 * g.stage, b.x, 100, '#ffd23f');
              st.bosses++; g.boss = null; g.bossAt = 0; g.clearT = 160;
              fx.say('STAGE CLEAR', '#7dffb3', 120); sfx.clear();
            }
          } else {
            for (const cn of b.cannons) {
              if (cn.flash > 0) cn.flash--;
              if (cn.hp > 0 && (b.t + cn.t) % Math.max(40, 70 - g.stage * 8) === 0) {
                ebullet(b.x - 6, cn.y, px, p.y + 10, 2 + g.stage * 0.2, '#ffd23f');
                if (g.stage > 1) ebullet(b.x - 6, cn.y, px, p.y - 10, 2 + g.stage * 0.2, '#ffd23f');
              }
            }
            if (b.t % 100 === 50) for (let k = 0; k < 2; k++) g.ents.push({ kind: 'runner', x: b.x - 4, y: colTop(1) - 20 - k * 4, vx: -1.1, vy: 0, hp: 1, t: 0 });
          }
        }
        st.score = Math.max(0, st.score);
      }
      function killEnemy(e) {
        e.dead = true; st.kills++;
        const sc = { runner: 100, rifle: 200, sniper: 300, turret: 500 }[e.kind] || 100;
        addScore(sc, e.x, e.y);
        fx.burst(SX(e.x), SY(e.y + 10), e.kind === 'turret' ? 20 : 10, ['#fff', '#ffd23f', '#ff7b3a'], { speed: 2.5 });
        sfx.boom(e.kind === 'turret');
        if (e.onPlat) e.onPlat.taken = false;
      }

      // ---------------- draw
      function draw(ctx) {
        const th = THEMES[(g.stage - 1) % 3];
        ctx.save(); ctx.scale(S, S);
        ctx.fillStyle = D.vgrad(ctx, 0, VH, th.sky); ctx.fillRect(0, 0, VW, VH);
        // 远景树林
        for (let layer = 0; layer < 2; layer++) {
          const par = layer ? 0.5 : 0.25, col = layer ? th.near : th.far, base = layer ? 150 : 130;
          ctx.fillStyle = col;
          for (let i = -1; i < 9; i++) {
            const x = i * 24 - U.wrap(g.cam * par, 24);
            const hh = 30 + ((Math.floor((g.cam * par) / 24) + i) * 17 % 5) * 8;
            ctx.fillRect(x + 8, base - hh, 6, hh + 60);
            ctx.beginPath(); ctx.arc(x + 11, base - hh, 12, 0, 7); ctx.fill();
          }
        }
        // 地面
        const c0 = Math.floor(g.cam / T);
        for (let c = c0; c <= c0 + 11; c++) {
          const h = g.cols[c]; if (!h) continue;
          const x = c * T - g.cam, top = colTop(h);
          ctx.fillStyle = th.ground; ctx.fillRect(x, top, T, VH - top);
          ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 3, top + 8, 4, 3); ctx.fillRect(x + 10, top + 18, 4, 3);
          ctx.fillStyle = th.top; ctx.fillRect(x, top, T, 3);
        }
        for (const q of g.plats) {
          const x = q.x - g.cam; if (x > VW || x + q.w < 0) continue;
          ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x, q.y, q.w, 5); ctx.fillStyle = th.top; ctx.fillRect(x, q.y, q.w, 2);
          ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 4, q.y + 5, 2, 40); ctx.fillRect(x + q.w - 6, q.y + 5, 2, 40);
        }
        // BOSS 墙
        const b = g.boss;
        if (b) {
          const x = b.x - g.cam, fl = b.flash > 0;
          ctx.fillStyle = '#3a3a44'; ctx.fillRect(x, 30, VW - x + 10, colTop(1) - 30);
          ctx.fillStyle = '#4a4a56'; for (let y = 34; y < colTop(1); y += 12) ctx.fillRect(x + 2, y, VW - x, 2);
          for (const cn of b.cannons) {
            if (cn.hp <= 0) { ctx.fillStyle = '#222'; ctx.fillRect(x - 4, cn.y - 5, 12, 10); continue; }
            ctx.fillStyle = cn.flash > 0 ? '#fff' : '#8a8a92'; ctx.fillRect(x - 10, cn.y - 3, 14, 6);
            ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(x + 4, cn.y, 5, 0, 7); ctx.fill();
          }
          const cy = colTop(1) - 30;
          ctx.fillStyle = fl ? '#fff' : (g.t >> 3) % 2 ? '#ff3b3b' : '#ff8a3b';
          D.rrect(ctx, x + 6, cy, 22, 26, 4); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 17, cy + 13, 5, 0, 7); ctx.fill();
        }
        // 敌人
        for (const e of g.ents) {
          const x = e.x - g.cam;
          const tint = e.flash > 0 ? '#fff' : null;
          if (e.kind === 'runner') D.sprite(ctx, (e.t >> 3) % 2 ? SP.sold1 : SP.sold2, SP.soldPal, x - 6, e.y + 8, { flip: true, tint });
          else if (e.kind === 'rifle' || e.kind === 'sniper') D.sprite(ctx, SP.sold1, e.kind === 'sniper' ? Object.assign({}, SP.soldPal, { b: '#a03a3a', f: '#7a4a4a' }) : SP.soldPal, x - 6, e.y + 8, { flip: true, tint });
          else if (e.kind === 'turret') {
            ctx.fillStyle = tint || '#5a5a64'; ctx.fillRect(x - 7, e.y, 14, 14);
            ctx.fillStyle = tint || '#8a8a92'; ctx.beginPath(); ctx.arc(x, e.y + 6, 5, 0, 7); ctx.fill();
            const a = Math.atan2(p.y + 10 - (e.y + 6), g.cam + PSX - e.x);
            ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, e.y + 6); ctx.lineTo(x + Math.cos(a) * 10, e.y + 6 + Math.sin(a) * 10); ctx.stroke(); ctx.lineWidth = 1;
          } else if (e.kind === 'item') {
            D.panel(ctx, x - 6, e.y, 12, 10, { r: 2, fill: '#ff5a5a', stroke: '#fff', lw: 0.8 });
            D.text(ctx, e.letter, x, e.y + 8, { size: 7, color: '#fff', align: 'center' });
          }
        }
        for (const c of g.caps) D.sprite(ctx, SP.capsule, SP.capPal, c.x - g.cam - 4, c.y - 4, {});
        // 子弹
        for (const s of g.shots) {
          const x = s.x - g.cam;
          if (s.kind === 'L') { ctx.strokeStyle = '#38e1ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x - s.vx * 2, s.y - s.vy * 2); ctx.stroke(); ctx.lineWidth = 1; }
          else { ctx.fillStyle = s.kind === 'S' ? '#ff8a8a' : s.kind === 'M' ? '#ffd23f' : '#fff'; ctx.fillRect(x - 1, s.y - 1, s.kind === 'S' ? 3 : 2, s.kind === 'S' ? 3 : 2); }
        }
        for (const e of g.ebul) { ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(e.x - g.cam, e.y, 2, 0, 7); ctx.fill(); }
        // 玩家
        if (!(p.inv > 0 && (g.t >> 2) % 2)) {
          const x = PSX - 6;
          if (p.dead > 0) { ctx.save(); ctx.translate(PSX, p.y + 10); ctx.rotate(p.dead / 6); D.sprite(ctx, SP.run1, SP.pal, -6, -6, {}); ctx.restore(); }
          else if (!p.ground) { ctx.save(); ctx.translate(PSX, p.y + 10); ctx.rotate(g.t / 3); D.sprite(ctx, SP.ball, SP.pal, 0, 0, { center: true }); ctx.restore(); }
          else if (p.prone) D.sprite(ctx, SP.prone, SP.pal, x, p.y + 8, {});
          else if (p.aimUp) D.sprite(ctx, SP.up, SP.pal, x, p.y + 8, {});
          else D.sprite(ctx, (p.anim >> 3) % 2 ? SP.run1 : SP.run2, SP.pal, x, p.y + 8, {});
        }
        ctx.restore();
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, 18);
        D.text(ctx, U.fmt(st.score), 6, 13, { size: 10, color: '#fff' });
        D.text(ctx, 'STAGE ' + g.stage, W / 2, 13, { size: 8, color: '#ffd23f', align: 'center' });
        for (let i = 0; i < Math.min(6, Math.max(0, g.lives)); i++) { ctx.fillStyle = '#7cc7ff'; ctx.fillRect(W - 10 - i * 8, 5, 5, 8); }
        D.panel(ctx, 4, H - 22, 58, 18, { r: 4, fill: 'rgba(0,0,0,.55)', stroke: WEAP[g.weapon].color });
        D.text(ctx, g.weapon + ' ' + WEAP[g.weapon].name, 33, H - 9, { size: 9, color: WEAP[g.weapon].color, align: 'center' });
        if (g.boss && !g.boss.dying) { D.text(ctx, 'CORE', 70, H - 9, { size: 8, color: '#ff5a5a' }); D.bar(ctx, 100, H - 15, 130, 6, g.boss.core / g.boss.coreMax, '#ff5a5a', 'rgba(0,0,0,.5)'); }
        else { const prog = U.clamp((g.cam / T - (g.stageStartCol || 0)) / (g.stageLen + 4), 0, 1); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(70, H - 13, 160, 4); ctx.fillStyle = '#7cc7ff'; ctx.fillRect(70, H - 13, 160 * prog, 4); }
        if (g.t > 0 && g.t < 220) D.text(ctx, '按住 UP 斜上射击 · 按住 DOWN 卧倒', W / 2, 110, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
