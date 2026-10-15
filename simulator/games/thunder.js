// simulator/games/thunder.js — 雷霆战机（重制）
// 核心循环：自动开火 + 左右走位 → 擦弹充能炸弹 → 金币连锁涨价 → 关底 BOSS → 下一关更难
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, PY = 286;

  const SP = {
    ship: [
      '......a......',
      '.....aba.....',
      '.....aca.....',
      '....abcba....',
      '....abcba....',
      '...aabbbaa...',
      '..aabbbbbaa..',
      '.aabdbbbdbaa.',
      'aabbbbbbbbbaa',
      'abbaabbbaabba',
      'aa..aa.aa..aa',
      '....e...e....'
    ],
    shipPal: { a: '#16264a', b: '#d8ecff', c: '#38e1ff', d: '#ff5a5a', e: '#ffd23f' },
    dart: [
      'a.........a',
      'ab.......ba',
      'abb.....bba',
      '.abbcccbba.',
      '..abcdcba..',
      '...abbba...',
      '....aba....',
      '.....a.....'
    ],
    dartPal: { a: '#2a0c16', b: '#ff6b6b', c: '#ffb3b3', d: '#ffd23f' },
    red: [
      '...aaaaa...',
      '..abbbbba..',
      '.abbcccbba.',
      'abbcdddcbba',
      'abbcdddcbba',
      '.abbcccbba.',
      '..abbbbba..',
      '...aaaaa...'
    ],
    redPal: { a: '#3a0a0a', b: '#e0342f', c: '#ff8a4c', d: '#fff2a8' },
    heavy: [
      '....aaaa.......aaaa....',
      '...abbbba.....abbbba...',
      '..abbccbba...abbccbba..',
      '.abbbbbbbaaaaabbbbbbba.',
      'abbbbbbbbbbbbbbbbbbbbba',
      'abdbbbbbbbccccbbbbbbdba',
      'abbbbbbbbccddccbbbbbbba',
      '.abbbbbbbccddccbbbbbba.',
      '..aabbbbbbccccbbbbbaa..',
      '....aabbbbbbbbbbbaa....',
      '......aaabbbbbaaa......',
      '.........aeeea.........'
    ],
    heavyPal: { a: '#1c1030', b: '#7c5cff', c: '#b9a6ff', d: '#ff5ad2', e: '#ffd23f' },
    turret: [
      '..aaaaaaa..',
      '.abbbbbbba.',
      'abbcccccbba',
      'abcdddddcba',
      'abcdeeedcba',
      'abcdeeedcba',
      'abcdddddcba',
      'abbcccccbba',
      '.abbbbbbba.',
      '..aaaaaaa..'
    ],
    turretPal: { a: '#12200f', b: '#556b2f', c: '#8aa05a', d: '#3b4a22', e: '#ffd23f' },
    medal: ['.aaa.', 'abbba', 'abcba', 'abbba', '.aaa.'],
    medalPal: { a: '#8a5a10', b: '#ffd23f', c: '#fff6c8' }
  };

  const THEMES = [
    { top: '#0b1b3a', bot: '#1d4e7a', star: '#cfe8ff', name: 'OCEAN SKY' },
    { top: '#2a0f22', bot: '#7a2b3f', star: '#ffd0e0', name: 'CRIMSON DUSK' },
    { top: '#050612', bot: '#1b1240', star: '#b9a6ff', name: 'DEEP SPACE' },
    { top: '#0c1a10', bot: '#23452a', star: '#c8ffd0', name: 'JUNGLE BASE' }
  ];

  A.define({
    id: 'thunder',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, bosses: 0, graze: 0, medal: 0, kills: 0, stage: 1 });

      const g = {
        t: 0, stage: 1, stageT: 0, diff: 1,
        p: { x: W / 2, vx: 0, inv: 120, alive: true, respawn: 0, power: 1, fireT: 0, missileT: 0, tilt: 0 },
        lives: 3, bombs: 2, grazeMeter: 0, medalValue: 100, nextExtend: 30000,
        shots: [], ebul: [], enemies: [], items: [], stars: [], clouds: [],
        boss: null, bossWarn: 0, clearT: 0, bombT: 0, scroll: 0, over: false
      };
      for (let i = 0; i < 70; i++) g.stars.push({ x: U.rand(0, W), y: U.rand(0, H), z: U.rand(0.3, 1.6) });
      for (let i = 0; i < 5; i++) g.clouds.push({ x: U.rand(-40, W), y: U.rand(0, H), w: U.rand(50, 110), s: U.rand(0.6, 1.2) });

      // ---------------------------------------------------------------- helpers
      function addScore(n, x, y, color) {
        st.score += n;
        if (x != null) fx.floatText(x, y, '' + n, color || '#fff');
        if (st.score >= g.nextExtend) {
          g.nextExtend += g.nextExtend < 80000 ? 50000 : 100000;
          g.lives = Math.min(6, g.lives + 1);
          fx.say('1UP!', '#7dffb3'); sfx.power();
        }
      }
      function aimAt(x, y, speed, spread, n, color) {
        const a0 = Math.atan2(PY - y, g.p.x - x);
        n = n || 1; spread = spread || 0;
        for (let i = 0; i < n; i++) {
          const a = a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
          ebullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, color);
        }
      }
      function ring(x, y, n, speed, off, color) {
        for (let i = 0; i < n; i++) {
          const a = (off || 0) + i * Math.PI * 2 / n;
          ebullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, color);
        }
      }
      function ebullet(x, y, vx, vy, color) {
        if (g.ebul.length > 320) return;
        g.ebul.push({ x, y, vx, vy, r: 3, c: color || '#ff5ad2', grazed: false });
      }

      // ---------------------------------------------------------------- enemies
      function spawn(type, o) {
        const d = g.diff;
        const base = {
          dart: { hp: 1, w: 14, h: 11, score: 120 },
          red: { hp: 3, w: 11, h: 8, score: 300 },
          heavy: { hp: 34, w: 23, h: 12, score: 2500 },
          turret: { hp: 7, w: 11, h: 10, score: 800 },
          mine: { hp: 4, w: 9, h: 9, score: 400 }
        }[type];
        const e = Object.assign({ type, t: 0, flash: 0, fireT: U.randi(40, 90) / d, x: 0, y: -12, vx: 0, vy: 0 }, base, o);
        e.maxHp = e.hp;
        g.enemies.push(e);
        return e;
      }

      function waveDarts() {
        const side = U.chance(0.5) ? -1 : 1, n = 5 + Math.min(4, g.stage);
        const x0 = U.rand(40, 200);
        for (let i = 0; i < n; i++) {
          spawn('dart', { x: x0, y: -12 - i * 16, path: 'dive', curve: side * U.rand(0.012, 0.022), vy: 1.6 + g.diff * 0.25, delay: 0 });
        }
      }
      function waveSwoop() {
        const fromLeft = U.chance(0.5), n = 6;
        for (let i = 0; i < n; i++) {
          spawn('dart', { path: 'swoop', dir: fromLeft ? 1 : -1, delay: i * 10, x: fromLeft ? -10 : W + 10, y: 30, t: -i * 10 });
        }
      }
      function waveRed() {
        const y = U.rand(50, 110), fromLeft = U.chance(0.5), grp = { left: 5, id: Math.random() };
        for (let i = 0; i < 5; i++) {
          spawn('red', { path: 'line', dir: fromLeft ? 1 : -1, x: fromLeft ? -12 - i * 20 : W + 12 + i * 20, y, baseY: y, grp });
        }
      }
      function waveHeavy() { spawn('heavy', { path: 'hover', x: U.rand(50, 190), y: -16, targetY: U.rand(60, 95) }); }
      function waveTurrets() {
        const n = U.randi(2, 3);
        for (let i = 0; i < n; i++) spawn('turret', { path: 'ground', x: 30 + i * (180 / (n - 1 || 1)) + U.rand(-10, 10), y: -12 - i * 30 });
      }
      function waveMines() {
        for (let i = 0; i < 4; i++) spawn('mine', { path: 'drift', x: U.rand(20, 220), y: -10 - i * 34, vy: 0.7, vx: U.rand(-0.3, 0.3) });
      }
      const WAVES = [
        [waveDarts, 4], [waveSwoop, 3], [waveRed, 2.2], [waveTurrets, 1.6], [waveMines, 1.2], [waveHeavy, 1]
      ];
      function pickWave() {
        const pool = WAVES.filter(([f]) => !(f === waveHeavy && g.enemies.some((e) => e.type === 'heavy')));
        const tot = pool.reduce((s, w) => s + w[1], 0);
        let r = Math.random() * tot;
        for (const [f, w] of pool) { if ((r -= w) <= 0) return f; }
        return waveDarts;
      }

      function updateEnemy(e) {
        e.t++;
        if (e.t < 0) return;
        const d = g.diff;
        switch (e.path) {
          case 'dive':
            e.vx += (g.p.x > e.x ? 1 : -1) * 0.02 + e.curve;
            e.vx = U.clamp(e.vx, -1.6, 1.6);
            e.x += e.vx; e.y += e.vy;
            break;
          case 'swoop': {
            const k = e.t / 150;
            e.x = e.dir > 0 ? -10 + k * (W + 20) : W + 10 - k * (W + 20);
            e.y = 30 + Math.sin(k * Math.PI) * 150;
            if (k > 1.05) e.dead = true;
            break;
          }
          case 'line':
            e.x += e.dir * 1.3;
            e.y = e.baseY + Math.sin(e.t / 18) * 12;
            if ((e.dir > 0 && e.x > W + 120) || (e.dir < 0 && e.x < -120)) e.dead = true;
            break;
          case 'hover':
            if (e.y < e.targetY) e.y += 1.2;
            else { e.x += Math.sin(e.t / 50) * 0.8; }
            if (e.t > 520) e.y += 1.4;
            break;
          case 'ground':
            e.y += 0.9;
            break;
          case 'drift':
            e.x += e.vx; e.y += e.vy;
            break;
        }
        if (e.y > H + 30 || e.x < -150 || e.x > W + 150) e.dead = true;
        // 开火（离玩家太近不开，保证公平）
        if (e.y > 8 && e.y < 210 && --e.fireT <= 0) {
          if (e.type === 'dart') { if (U.chance(0.45 * d)) aimAt(e.x, e.y + 4, 1.7 + d * 0.3); e.fireT = 999; }
          else if (e.type === 'red') { e.fireT = 999; }
          else if (e.type === 'turret') { aimAt(e.x, e.y, 1.8 + d * 0.3, 0.3, d > 1.4 ? 3 : 1, '#ffd23f'); e.fireT = 70 / d; }
          else if (e.type === 'heavy') {
            const ph = (e.t / 60 | 0) % 3;
            if (ph === 2) ring(e.x, e.y + 6, 10 + g.stage * 2, 1.3 + d * 0.2, e.t / 20, '#ff5ad2');
            else aimAt(e.x, e.y + 8, 1.9 + d * 0.3, 0.9, 5, '#ffb000');
            e.fireT = 55 / d;
          } else if (e.type === 'mine') { e.fireT = 999; }
        }
      }

      function killEnemy(e, byBomb) {
        e.dead = true;
        st.kills++;
        const big = e.type === 'heavy';
        fx.burst(e.x, e.y, big ? 30 : 12, ['#fff', '#ffd23f', '#ff7b3a', '#ff3b3b'], { speed: big ? 4 : 3, life: big ? 34 : 22 });
        fx.ring(e.x, e.y, '#ffd23f', big ? 40 : 18);
        sfx.boom(big);
        if (big) { fx.addShake(6); fx.hitstop(3); }
        addScore(e.score * (byBomb ? 0.5 : 1) | 0, e.x, e.y - 6, big ? '#ffd23f' : '#fff');
        // 掉落
        const mcount = big ? 5 : e.type === 'turret' ? 2 : U.chance(0.35) ? 1 : 0;
        for (let i = 0; i < mcount; i++) g.items.push({ kind: 'medal', x: e.x + U.rand(-8, 8), y: e.y, vy: -1.5 - U.rand(0, 1), vx: U.rand(-0.6, 0.6) });
        if (big && U.chance(0.6)) g.items.push({ kind: 'P', x: e.x, y: e.y, vy: -1.4, vx: 0 });
        if (e.type === 'mine') ring(e.x, e.y, 8, 1.3, 0, '#7dffb3');
        if (e.grp) {
          e.grp.left--;
          if (e.grp.left === 0) {
            g.items.push({ kind: g.p.power < 5 ? 'P' : 'B', x: e.x, y: e.y, vy: -1.4, vx: 0 });
            addScore(2000, e.x, e.y - 18, '#7dffb3');
            fx.say('FORMATION BONUS', '#7dffb3', 50);
          }
        }
      }

      // ---------------------------------------------------------------- boss
      function spawnBoss() {
        const hp = 700 * (1 + 0.45 * (g.stage - 1));
        g.boss = { x: W / 2, y: -50, hp, maxHp: hp, t: 0, phase: 0, flash: 0, vx: 0.7, dying: 0 };
        g.bossWarn = 110;
        sfx.tone(220, 0.5, { type: 'sawtooth', vol: 0.12 }); sfx.tone(220, 0.5, { type: 'sawtooth', vol: 0.12, delay: 0.6 });
      }
      function updateBoss(b) {
        b.t++;
        if (b.dying) {
          b.dying++;
          if (b.dying % 6 === 0) {
            const x = b.x + U.rand(-30, 30), y = b.y + U.rand(-16, 16);
            fx.burst(x, y, 14, ['#fff', '#ffd23f', '#ff7b3a']); sfx.boom(false); fx.addShake(4);
          }
          if (b.dying > 100) {
            fx.burst(b.x, b.y, 80, ['#fff', '#ffd23f', '#ff7b3a', '#ff3b3b', '#38e1ff'], { speed: 6, life: 50 });
            fx.flash('#fff', 0.9); fx.addShake(14); sfx.boom(true);
            for (let i = 0; i < 16; i++) g.items.push({ kind: 'medal', x: b.x + U.rand(-30, 30), y: b.y, vy: -2 - U.rand(0, 2), vx: U.rand(-1.2, 1.2) });
            g.items.push({ kind: 'B', x: b.x, y: b.y, vy: -1.5, vx: 0 });
            addScore(20000 * g.stage, b.x, b.y, '#ffd23f');
            st.bosses++;
            g.boss = null;
            g.clearT = 170;
            fx.say('STAGE ' + g.stage + ' CLEAR', '#7dffb3', 120);
            sfx.clear();
          }
          return;
        }
        if (b.y < 58) { b.y += 1; return; }
        const k = b.hp / b.maxHp;
        const phase = k > 0.66 ? 0 : k > 0.33 ? 1 : 2;
        if (phase !== b.phase) { b.phase = phase; fx.say(phase === 1 ? 'BOSS ANGRY!' : 'FINAL FORM!', '#ff5a5a', 60); g.ebul.length = 0; fx.flash('#ff5a5a', 0.3); }
        b.x += b.vx * (1 + phase * 0.4);
        if (b.x < 50 || b.x > W - 50) b.vx = -b.vx;
        const d = g.diff, t = b.t;
        if (phase === 0) {
          if (t % 50 === 0) aimAt(b.x, b.y + 16, 2 + d * 0.3, 1.1, 7, '#ff5ad2');
          if (t % 50 === 25) { aimAt(b.x - 28, b.y + 10, 2.4 + d * 0.3, 0, 1, '#ffd23f'); aimAt(b.x + 28, b.y + 10, 2.4 + d * 0.3, 0, 1, '#ffd23f'); }
        } else if (phase === 1) {
          if (t % 6 === 0) {
            const a = t * 0.09;
            ebullet(b.x, b.y + 10, Math.cos(a) * 1.6, Math.sin(a) * 1.6 + 0.4, '#b9a6ff');
            ebullet(b.x, b.y + 10, Math.cos(a + Math.PI) * 1.6, Math.sin(a + Math.PI) * 1.6 + 0.4, '#b9a6ff');
          }
          if (t % 70 === 0) aimAt(b.x, b.y + 16, 2.6 + d * 0.3, 0.5, 3, '#ffd23f');
        } else {
          if (t % 40 === 0) ring(b.x, b.y + 8, 16 + g.stage * 2, 1.5 + d * 0.2, t / 30, '#ff5a5a');
          if (t % 12 === 0) aimAt(b.x + U.rand(-30, 30), b.y + 14, 2.8 + d * 0.3, 0, 1, '#ffd23f');
        }
      }

      // ---------------------------------------------------------------- player
      function hitPlayer() {
        const p = g.p;
        p.alive = false; p.respawn = 90;
        fx.burst(p.x, PY, 40, ['#fff', '#38e1ff', '#ffd23f', '#ff5a5a'], { speed: 5, life: 40 });
        fx.ring(p.x, PY, '#38e1ff', 50);
        fx.flash('#ff3b3b', 0.45); fx.addShake(10); fx.hitstop(6);
        sfx.boom(true); sfx.hurt();
        g.lives--;
        p.power = Math.max(1, p.power - 1);
        g.medalValue = 100;
        g.ebul.length = 0;
        if (g.lives < 0) g.over = true;
      }
      function bomb() {
        if (g.bombs <= 0 || !g.p.alive || g.bombT > 0) return;
        g.bombs--; g.bombT = 70; g.p.inv = Math.max(g.p.inv, 110);
        fx.flash('#fff', 0.8); fx.addShake(12); sfx.boom(true); sfx.power();
        fx.ring(g.p.x, PY, '#fff', 180); fx.ring(g.p.x, PY, '#38e1ff', 120);
        for (const b of g.ebul) { fx.spark(b.x, b.y, '#ffd23f', 1); addScore(10); }
        g.ebul.length = 0;
        for (const e of g.enemies) { e.hp -= 30; if (e.hp <= 0 && !e.dead) killEnemy(e, true); }
        if (g.boss && !g.boss.dying) { g.boss.hp -= g.boss.maxHp * 0.06; g.boss.flash = 8; }
      }
      function fire() {
        const p = g.p, pw = p.power;
        const add = (dx, vx, dmg) => g.shots.push({ x: p.x + dx, y: PY - 8, vx, vy: -7, dmg: dmg || 1, kind: 'v' });
        add(-3, 0); add(3, 0);
        if (pw >= 2) { add(-6, -0.7); add(6, 0.7); }
        if (pw >= 4) { add(-8, -1.5); add(8, 1.5); }
        if (pw >= 3 && g.t % 12 === 0) { add(-12, -0.2, 2); add(12, 0.2, 2); }
        if (pw >= 5 && --p.missileT <= 0) {
          p.missileT = 24;
          g.shots.push({ x: p.x - 10, y: PY, vx: -1.5, vy: -2, dmg: 4, kind: 'm' });
          g.shots.push({ x: p.x + 10, y: PY, vx: 1.5, vy: -2, dmg: 4, kind: 'm' });
        }
        if (g.t % 12 === 0) sfx.pew(1 + pw * 0.05);
      }

      // ---------------------------------------------------------------- update
      function update(input) {
        g.t++; g.stageT++;
        const p = g.p;
        g.scroll += 1.2;

        // 关卡节奏：60 秒杂兵 → BOSS → 过关
        if (g.clearT > 0) {
          if (--g.clearT === 0) {
            g.stage++; st.stage = g.stage; g.stageT = 0; g.diff = 1 + 0.28 * (g.stage - 1);
            fx.say('STAGE ' + g.stage, '#ffd23f', 90);
          }
        } else if (!g.boss && g.stageT < 3300) {
          const gap = Math.max(55, 120 - g.stage * 10);
          if (g.stageT > 60 && g.stageT % gap === 0) pickWave()();
          if (g.stageT % 1100 === 0) waveHeavy();
        } else if (!g.boss && g.stageT === 3360) {
          spawnBoss();
        }
        if (g.bossWarn > 0) g.bossWarn--;

        // 玩家移动
        if (p.alive) {
          const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
          const target = dir * 2.9;
          p.vx = U.approach(p.vx, target, dir ? 0.55 : 0.8);
          p.x = U.clamp(p.x + p.vx, 8, W - 8);
          p.tilt = U.approach(p.tilt, dir, 0.2);
          if (input.okP) bomb();
          if (g.t % 6 === 0) fire();
          if (p.inv > 0) p.inv--;
        } else if (--p.respawn <= 0) {
          if (g.lives >= 0) { p.alive = true; p.inv = 150; p.x = W / 2; g.bombs = Math.max(g.bombs, 2); }
        }
        if (g.bombT > 0) g.bombT--;

        // 玩家子弹
        for (let i = g.shots.length - 1; i >= 0; i--) {
          const s = g.shots[i];
          if (s.kind === 'm') {
            let tgt = null, bd = 1e9;
            for (const e of g.enemies) { const dd = U.dist(s.x, s.y, e.x, e.y); if (e.t >= 0 && dd < bd) { bd = dd; tgt = e; } }
            if (!tgt && g.boss && !g.boss.dying) tgt = g.boss;
            if (tgt) { const a = Math.atan2(tgt.y - s.y, tgt.x - s.x); s.vx += Math.cos(a) * 0.5; s.vy += Math.sin(a) * 0.5; }
            const sp = Math.hypot(s.vx, s.vy); if (sp > 5) { s.vx *= 5 / sp; s.vy *= 5 / sp; }
          }
          s.x += s.vx; s.y += s.vy;
          let gone = s.y < -10 || s.x < -10 || s.x > W + 10;
          if (!gone) {
            for (const e of g.enemies) {
              if (e.dead || e.t < 0) continue;
              if (Math.abs(s.x - e.x) < e.w / 2 + 2 && Math.abs(s.y - e.y) < e.h / 2 + 3) {
                e.hp -= s.dmg; e.flash = 3; gone = true;
                fx.spark(s.x, s.y, '#fff', 2);
                if (e.hp <= 0) killEnemy(e);
                break;
              }
            }
          }
          const b = g.boss;
          if (!gone && b && !b.dying && b.y > 20 && Math.abs(s.x - b.x) < 34 && Math.abs(s.y - b.y) < 18) {
            b.hp -= s.dmg; b.flash = 2; gone = true; fx.spark(s.x, s.y, '#ffd23f', 2);
            if (g.t % 4 === 0) addScore(10);
            if (b.hp <= 0) { b.dying = 1; g.ebul.length = 0; fx.say('BOSS DOWN!', '#ffd23f', 90); }
          }
          if (gone) g.shots.splice(i, 1);
        }

        // 敌人
        for (const e of g.enemies) { updateEnemy(e); if (e.flash > 0) e.flash--; }
        // 敌机撞玩家
        if (p.alive && p.inv <= 0) {
          for (const e of g.enemies) {
            if (!e.dead && e.t >= 0 && Math.abs(e.x - p.x) < e.w / 2 && Math.abs(e.y - PY) < e.h / 2 + 2) { e.hp = 0; killEnemy(e); hitPlayer(); break; }
          }
        }
        g.enemies = g.enemies.filter((e) => !e.dead);
        if (g.boss) { updateBoss(g.boss); if (g.boss && g.boss.flash > 0) g.boss.flash--; }

        // 敌弹 + 擦弹
        for (let i = g.ebul.length - 1; i >= 0; i--) {
          const b = g.ebul[i];
          b.x += b.vx; b.y += b.vy;
          if (b.x < -8 || b.x > W + 8 || b.y < -8 || b.y > H + 8) { g.ebul.splice(i, 1); continue; }
          if (!p.alive) continue;
          const dx = b.x - p.x, dy = b.y - PY, d2 = dx * dx + dy * dy;
          if (d2 < 2.6 * 2.6 + b.r * b.r && p.inv <= 0) { g.ebul.splice(i, 1); hitPlayer(); break; }
          if (!b.grazed && d2 < 13 * 13) {
            b.grazed = true; st.graze++;
            g.grazeMeter++;
            addScore(50);
            fx.spark(p.x + dx * 0.5, PY + dy * 0.5, '#38e1ff', 3);
            sfx.tone(1800, 0.03, { vol: 0.03 });
            if (g.grazeMeter >= 24) {
              g.grazeMeter = 0;
              if (g.bombs < 5) { g.bombs++; fx.floatText(p.x, PY - 18, '+BOMB', '#38e1ff', 9); sfx.pickup(); }
              else addScore(3000, p.x, PY - 18, '#38e1ff');
            }
          }
        }

        // 道具
        for (let i = g.items.length - 1; i >= 0; i--) {
          const it = g.items[i];
          it.vy = Math.min(1.6, it.vy + 0.06); it.x += it.vx; it.y += it.vy; it.vx *= 0.98;
          // 接近玩家时吸附
          if (p.alive && U.dist(it.x, it.y, p.x, PY) < 34) { it.x += (p.x - it.x) * 0.2; it.y += (PY - it.y) * 0.2; }
          if (p.alive && Math.abs(it.x - p.x) < 10 && Math.abs(it.y - PY) < 10) {
            if (it.kind === 'medal') {
              addScore(g.medalValue, it.x, it.y - 8, '#ffd23f');
              st.medal = Math.max(st.medal, g.medalValue);
              g.medalValue = Math.min(1000, g.medalValue + 100);
              sfx.coin();
            } else if (it.kind === 'P') {
              if (p.power < 5) { p.power++; fx.say('POWER UP', '#38e1ff', 50); sfx.power(); }
              else addScore(5000, it.x, it.y, '#38e1ff');
            } else if (it.kind === 'B') {
              g.bombs = Math.min(5, g.bombs + 1); sfx.pickup(); fx.floatText(it.x, it.y, '+BOMB', '#38e1ff', 9);
            }
            g.items.splice(i, 1);
            continue;
          }
          if (it.y > H + 10) {
            if (it.kind === 'medal' && g.medalValue > 100) { g.medalValue = 100; fx.floatText(W / 2, H - 20, 'CHAIN LOST', '#ff6b6b'); }
            g.items.splice(i, 1);
          }
        }

        // 背景
        for (const s of g.stars) { s.y += s.z * 0.9; if (s.y > H) { s.y = 0; s.x = U.rand(0, W); } }
        for (const c of g.clouds) { c.y += c.s * 1.6; if (c.y > H + 30) { c.y = -30; c.x = U.rand(-40, W); c.w = U.rand(50, 110); } }

        if (g.over && !p.alive && p.respawn <= 30) api.end();
      }

      // ---------------------------------------------------------------- draw
      function draw(ctx) {
        const th = THEMES[(g.stage - 1) % THEMES.length];
        ctx.fillStyle = D.vgrad(ctx, 0, H, [th.top, th.bot]);
        ctx.fillRect(0, 0, W, H);
        // 地面纹理（缓慢卷动的网格）
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        const off = (g.scroll * 0.9) % 32;
        for (let y = off - 32; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        for (const s of g.stars) { ctx.fillStyle = th.star; ctx.globalAlpha = 0.25 + s.z * 0.4; ctx.fillRect(s.x, s.y, s.z > 1.2 ? 2 : 1, s.z > 1 ? 2 : 1); }
        ctx.globalAlpha = 1;
        for (const c of g.clouds) { ctx.fillStyle = 'rgba(255,255,255,.05)'; D.rrect(ctx, c.x, c.y, c.w, 14, 7); ctx.fill(); }

        // 地面炮台在最下层
        for (const e of g.enemies) if (e.type === 'turret') drawEnemy(ctx, e);
        // 道具
        for (const it of g.items) {
          if (it.kind === 'medal') {
            const sq = Math.abs(Math.sin(g.t / 5 + it.x));
            ctx.save(); ctx.translate(it.x, it.y); ctx.scale(0.4 + sq * 0.6, 1);
            D.sprite(ctx, SP.medal, SP.medalPal, 0, 0, { scale: 1.4, center: true });
            ctx.restore();
          } else {
            const c = it.kind === 'P' ? '#ff5a5a' : '#38e1ff';
            D.panel(ctx, it.x - 7, it.y - 7, 14, 14, { r: 3, fill: c, stroke: '#fff', lw: 1 });
            D.text(ctx, it.kind, it.x, it.y + 4, { size: 8, color: '#fff', align: 'center' });
          }
        }
        for (const e of g.enemies) if (e.type !== 'turret') drawEnemy(ctx, e);
        if (g.boss) drawBoss(ctx, g.boss);

        // 玩家子弹
        for (const s of g.shots) {
          if (s.kind === 'm') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(s.x - 1.5, s.y - 3, 3, 6); ctx.fillStyle = 'rgba(255,120,40,.6)'; ctx.fillRect(s.x - 1, s.y + 3, 2, 4); }
          else { ctx.fillStyle = s.dmg > 1 ? '#7dffb3' : '#bff4ff'; ctx.fillRect(s.x - 1, s.y - 5, 2, 9); ctx.fillStyle = 'rgba(56,225,255,.35)'; ctx.fillRect(s.x - 2, s.y - 3, 4, 7); }
        }
        // 玩家
        const p = g.p;
        if (p.alive && !(p.inv > 0 && (g.t >> 2) % 2)) {
          const fl = 3 + (g.t % 4 < 2 ? 2 : 0);
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(p.x - 3, PY + 7, 2, fl); ctx.fillRect(p.x + 1, PY + 7, 2, fl);
          ctx.fillStyle = '#ff7b3a'; ctx.fillRect(p.x - 3, PY + 7 + fl, 2, 2); ctx.fillRect(p.x + 1, PY + 7 + fl, 2, 2);
          ctx.save(); ctx.translate(p.x, PY); ctx.scale(1 - Math.abs(p.tilt) * 0.18, 1);
          D.sprite(ctx, SP.ship, SP.shipPal, 0, 0, { scale: 1.3, center: true });
          ctx.restore();
          // 判定点：有子弹靠近时才显示
          const near = g.ebul.some((b) => Math.abs(b.x - p.x) < 30 && Math.abs(b.y - PY) < 30);
          if (near) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, PY, 2.2, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff5a5a'; ctx.stroke(); }
        }
        // 敌弹（最上层，保证看得清）
        for (const b of g.ebul) {
          ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, 7); ctx.fill();
        }

        // BOSS 警告
        if (g.bossWarn > 0 && (g.bossWarn >> 3) % 2) {
          ctx.fillStyle = 'rgba(255,40,40,.22)'; ctx.fillRect(0, 130, W, 40);
          D.text(ctx, 'WARNING', W / 2, 150, { size: 16, color: '#ff5a5a', align: 'center', outline: '#000' });
          D.text(ctx, '巨型敌机接近', W / 2, 165, { size: 9, color: '#ffd0d0', align: 'center' });
        }
        drawHud(ctx);
      }

      function drawEnemy(ctx, e) {
        if (e.t < 0) return;
        const tint = e.flash > 0 ? '#ffffff' : null;
        if (e.type === 'dart') D.sprite(ctx, SP.dart, SP.dartPal, e.x, e.y, { scale: 1.5, center: true, tint });
        else if (e.type === 'red') { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(g.t / 10); D.sprite(ctx, SP.red, SP.redPal, 0, 0, { scale: 1.2, center: true, tint }); ctx.restore(); }
        else if (e.type === 'heavy') {
          D.sprite(ctx, SP.heavy, SP.heavyPal, e.x, e.y, { scale: 1.3, center: true, tint });
          D.bar(ctx, e.x - 14, e.y - 12, 28, 2, e.hp / e.maxHp, '#ff5ad2', 'rgba(0,0,0,.5)');
        } else if (e.type === 'turret') {
          D.sprite(ctx, SP.turret, SP.turretPal, e.x, e.y, { scale: 1.4, center: true, tint });
          const a = Math.atan2(PY - e.y, g.p.x - e.x);
          ctx.strokeStyle = '#2b3a18'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10); ctx.stroke(); ctx.lineWidth = 1;
        } else if (e.type === 'mine') {
          const r = 5 + Math.sin(g.t / 6) * 0.8;
          ctx.fillStyle = tint || '#1f3a2c'; ctx.beginPath(); ctx.arc(e.x, e.y, r + 2, 0, 7); ctx.fill();
          ctx.fillStyle = tint || '#7dffb3'; ctx.beginPath(); ctx.arc(e.x, e.y, r - 1, 0, 7); ctx.fill();
          for (let i = 0; i < 6; i++) { const a = i * 1.047 + g.t / 30; ctx.fillRect(e.x + Math.cos(a) * (r + 3) - 1, e.y + Math.sin(a) * (r + 3) - 1, 2, 2); }
        }
      }

      function drawBoss(ctx, b) {
        const x = b.x, y = b.y, fl = b.flash > 0 && (g.t % 2 === 0);
        const body = fl ? '#fff' : ['#3b2a6e', '#6e2a3b', '#2a4a6e', '#3b5a2a'][(g.stage - 1) % 4];
        const trim = fl ? '#fff' : '#ffd23f';
        ctx.save();
        if (b.dying) ctx.translate(U.rand(-2, 2), U.rand(-2, 2));
        // 机翼
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(x - 52, y - 4); ctx.lineTo(x - 18, y - 16); ctx.lineTo(x - 14, y + 14); ctx.lineTo(x - 44, y + 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 52, y - 4); ctx.lineTo(x + 18, y - 16); ctx.lineTo(x + 14, y + 14); ctx.lineTo(x + 44, y + 10); ctx.closePath(); ctx.fill();
        // 机身
        D.rrect(ctx, x - 20, y - 22, 40, 44, 10); ctx.fill();
        ctx.strokeStyle = trim; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
        // 炮口
        ctx.fillStyle = '#111';
        ctx.fillRect(x - 30, y + 6, 5, 8); ctx.fillRect(x + 25, y + 6, 5, 8); ctx.fillRect(x - 3, y + 16, 6, 9);
        // 核心
        const pulse = 4 + Math.sin(g.t / 5) * 1.5 + b.phase;
        ctx.fillStyle = b.phase === 2 ? '#ff3b3b' : b.phase === 1 ? '#ff9a3b' : '#38e1ff';
        ctx.beginPath(); ctx.arc(x, y, pulse + 3, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, pulse - 1, 0, 7); ctx.fill();
        ctx.restore();
        // 血条
        if (!b.dying) {
          D.text(ctx, 'BOSS', 8, 27, { size: 8, color: '#ff5a5a' });
          D.bar(ctx, 36, 21, W - 44, 5, b.hp / b.maxHp, b.phase === 2 ? '#ff3b3b' : '#ffd23f', 'rgba(0,0,0,.6)');
        }
      }

      function drawHud(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, 16);
        D.text(ctx, U.fmt(st.score), 5, 12, { size: 10, color: '#fff' });
        D.text(ctx, 'ST' + g.stage, 112, 12, { size: 8, color: '#ffd23f', align: 'center' });
        for (let i = 0; i < Math.min(5, g.lives); i++) D.sprite(ctx, SP.ship, SP.shipPal, W - 12 - i * 11, 3, { scale: 0.7 });
        // 左下：炸弹；右下：擦弹条与金币单价
        for (let i = 0; i < g.bombs; i++) {
          ctx.fillStyle = '#38e1ff'; ctx.beginPath(); ctx.arc(10 + i * 11, H - 10, 4, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(9 + i * 11, H - 16, 2, 3);
        }
        D.text(ctx, 'GRAZE', W - 76, H - 12, { size: 7, color: '#38e1ff' });
        D.bar(ctx, W - 76, H - 9, 70, 3, g.grazeMeter / 24, '#38e1ff', 'rgba(255,255,255,.12)');
        D.sprite(ctx, SP.medal, SP.medalPal, W - 76, H - 26, { scale: 1.2 });
        D.text(ctx, g.medalValue >= 1000 ? 'MAX 1000' : '' + g.medalValue, W - 66, H - 20, { size: 8, color: g.medalValue >= 1000 ? '#ffd23f' : '#fff3c4' });
        if (g.t > 0 && g.t < 220) {
          D.text(ctx, '贴着子弹飞 = 擦弹充能炸弹', W / 2, 220, { size: 9, color: '#bff4ff', align: 'center', outline: '#000' });
        }
      }

      return { update, draw };
    }
  });
})();
