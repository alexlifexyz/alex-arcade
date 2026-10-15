// simulator/games/racer.js — 雷霆飞车（重制）
// 伪 3D 分段公路：弯道离心、坡道、车流、擦车攒氮气、检查点续时
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320;
  const SEG = 200, ROADW = 1100, CAMH = 900, DEPTH = 0.84, DRAW = 110, HOR = 132;
  const MAXS = SEG * 60, ACC = MAXS / 5, OFF_DEC = -MAXS / 2.5, OFF_LIM = MAXS * 0.45, CENTRI = 0.32;
  const CP_EVERY = 1500;

  const CAR = [
    '....aaaaaaaaaaaaaaaa....',
    '...abbbbbbbbbbbbbbbba...',
    '..abccccccccccccccccba..',
    '..abcddcccccccccccccba..',
    '.abbbbbbbbbbbbbbbbbbbba.',
    'abhbbbbbbbbbbbbbbbbbbhba',
    'abeebbbbbbbbbbbbbbbbeeba',
    'abeebbbbbffffffbbbbbeeba',
    'abbbbbbbbbbbbbbbbbbbbbba',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'aggga..............aggga',
    '.gga................gga.'
  ];
  const PAL_PLAYER = { a: '#1a0a0a', b: '#e0342f', c: '#1d2433', d: '#6f86b3', e: '#ffd23f', f: '#eeeeee', g: '#111', h: '#ff8a80' };
  const PAL_CARS = [
    { a: '#0a0f1a', b: '#2f7be0', c: '#1d2433', d: '#6f86b3', e: '#ff4040', f: '#ddd', g: '#111', h: '#8fbfff' },
    { a: '#1a160a', b: '#f0c14b', c: '#1d2433', d: '#6f86b3', e: '#ff4040', f: '#ddd', g: '#111', h: '#fff2a8' },
    { a: '#0a1a10', b: '#36b37e', c: '#1d2433', d: '#6f86b3', e: '#ff4040', f: '#ddd', g: '#111', h: '#9ff0c8' },
    { a: '#1a1a1a', b: '#e8e8e8', c: '#1d2433', d: '#6f86b3', e: '#ff4040', f: '#aaa', g: '#111', h: '#fff' },
    { a: '#1a0a1a', b: '#b04fe0', c: '#1d2433', d: '#6f86b3', e: '#ff4040', f: '#ddd', g: '#111', h: '#e0b0ff' }
  ];
  const TRUCK = [
    '.aaaaaaaaaaaaaaaaaaaaaa.',
    'abbbbbbbbbbbbbbbbbbbbbba',
    'abccccccccccccccccccccba',
    'abcbbbbbbbbbbbbbbbbbbcba',
    'abcbbbbbbbbbbbbbbbbbbcba',
    'abcbbbbbbbbbbbbbbbbbbcba',
    'abccccccccccccccccccccba',
    'abbbbbbbbbbbbbbbbbbbbbba',
    'abeebbbbbbbbbbbbbbbbeeba',
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    'aggga..............aggga'
  ];
  const PAL_TRUCK = { a: '#111', b: '#c8581e', c: '#8a3a12', e: '#ff4040', g: '#111' };
  const PALM = [
    '..aa....aa..',
    '.aabba.aabb.',
    'aab..aab..ba',
    '.....cc.....',
    '....bcca....',
    '...b.cc.a...',
    '.....cc.....',
    '.....dc.....',
    '.....cd.....',
    '.....dc.....',
    '.....cd.....',
    '.....dc.....',
    '.....cd.....',
    '....dccd....'
  ];
  const PAL_PALM = { a: '#1f7a3a', b: '#3cc26a', c: '#8a5a2b', d: '#6b421d' };
  const LAMP = ['aaaa.', 'a.bb.', 'a....', 'a....', 'a....', 'a....', 'a....', 'a....', 'a....', 'a....', 'a....', 'aa...'];
  const PAL_LAMP = { a: '#555a66', b: '#fff2a8' };

  const THEMES = [
    { name: 'SUNNY COAST', sky: ['#4aa8ff', '#bfe6ff'], grass: ['#3fae4a', '#379a41'], rumble: ['#fff', '#e0342f'], road: ['#6b6b73', '#65656c'], lane: '#fff', fog: '#bfe6ff', far: '#2e7d8a', sun: '#fff6c8', side: 'palm' },
    { name: 'SUNSET BLVD', sky: ['#5b2a86', '#ff8a4c'], grass: ['#c98a3a', '#b87c32'], rumble: ['#fff', '#6b2a86'], road: ['#5a4a58', '#544451'], lane: '#ffe6a8', fog: '#ff9a5a', far: '#7a2b5a', sun: '#ffd23f', side: 'palm' },
    { name: 'NEON NIGHT', sky: ['#050612', '#1b1240'], grass: ['#0d0f24', '#0a0c1e'], rumble: ['#ff3bd4', '#38e1ff'], road: ['#1c1c2a', '#191926'], lane: '#38e1ff', fog: '#1b1240', far: '#2a1a5a', sun: '#ff3bd4', side: 'lamp' },
    { name: 'DESERT RUN', sky: ['#f5a142', '#ffe2a8'], grass: ['#e0b060', '#d6a652'], rumble: ['#fff', '#8a5a2b'], road: ['#8a7a6a', '#837365'], lane: '#fff', fog: '#ffe2a8', far: '#b0703a', sun: '#fff', side: 'palm' }
  ];

  A.define({
    id: 'thunderracer',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, checkpoints: 0, nearMiss: 0, topSpeed: 0, dist: 0 });

      // ------------------------------------------------ 赛道生成
      const segs = [];
      const lastY = () => (segs.length ? segs[segs.length - 1].p2.y : 0);
      function addSeg(curve, y) {
        const n = segs.length;
        segs.push({ i: n, curve, p1: { y: lastY(), z: n * SEG, cam: {}, scr: {} }, p2: { y, z: (n + 1) * SEG, cam: {}, scr: {} }, sprites: [], color: Math.floor(n / 3) % 2, clip: 0 });
      }
      const easeIn = (a, b, t) => a + (b - a) * t * t;
      const easeIO = (a, b, t) => a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
      function addRoad(enter, hold, leave, curve, hill) {
        const y0 = lastY(), y1 = y0 + hill * SEG, tot = enter + hold + leave;
        for (let i = 0; i < enter; i++) addSeg(easeIn(0, curve, i / enter), easeIO(y0, y1, i / tot));
        for (let i = 0; i < hold; i++) addSeg(curve, easeIO(y0, y1, (enter + i) / tot));
        for (let i = 0; i < leave; i++) addSeg(easeIO(curve, 0, i / leave), easeIO(y0, y1, (enter + hold + i) / tot));
      }
      addRoad(40, 60, 40, 0, 0);
      while (segs.length < 5600) {
        const r = Math.random();
        const len = U.randi(25, 60);
        if (r < 0.25) addRoad(len, len, len, 0, U.pick([0, 0, 15, -15, 30, -30]));
        else if (r < 0.75) addRoad(len, len * 1.4 | 0, len, U.pick([-1, 1]) * U.rand(2, 5.5), U.pick([0, 20, -20, 0]));
        else addRoad(20, 30, 20, U.pick([-1, 1]) * U.rand(4, 6), 0);
      }
      addRoad(40, 40, 60, 0, -lastY() / SEG);
      const N = segs.length, TRACK = N * SEG;
      // 路边装饰（大幅稀释，远离赛道边缘，留出宽阔视野与缓冲区）
      for (let i = 30; i < N; i += U.randi(35, 55)) {
        const side = U.chance(0.5) ? -1 : 1;
        segs[i].sprites.push({ kind: 'deco', off: side * U.rand(2.2, 3.4) });
      }

      // ------------------------------------------------ 状态
      const g = {
        pos: 0, x: 0, speed: 0, dist: 0, time: 600, nitro: 50, nitroOn: false,
        cpIndex: 1, cpNextSeg: CP_EVERY, cpBonus: 30, theme: 0,
        skyOff: 0, bump: 0, crash: 0, chain: 0, chainT: 0, lastSteer: 0, t: 0, over: false, overT: 0,
        decoCooldown: 0,
        cars: []
      };
      const playerZ = CAMH * DEPTH;
      function addCar(z) {
        const truck = U.chance(0.2);
        g.cars.push({
          z: z == null ? U.rand(20, N) * SEG : z,
          off: U.pick([-0.66, 0, 0.66]) + U.rand(-0.08, 0.08),
          speed: MAXS * (truck ? U.rand(0.22, 0.32) : U.rand(0.3, 0.5)),
          truck, pal: U.randi(0, PAL_CARS.length - 1), passed: false, w: truck ? 0.42 : 0.34, flyT: 0, laneT: U.randi(100, 400)
        });
      }
      for (let i = 0; i < 70; i++) addCar();

      const segAt = (z) => segs[Math.floor(U.wrap(z, TRACK) / SEG) % N];

      // ------------------------------------------------ update
      function update(input) {
        g.t++;
        if (g.decoCooldown > 0) g.decoCooldown--;
        const dt = 1 / 60;
        const pct = g.speed / MAXS;
        const pseg = segAt(g.pos + playerZ);

        if (g.over) {
          g.speed = Math.max(0, g.speed - MAXS * dt * 0.8);
          g.pos = U.wrap(g.pos + g.speed * dt, TRACK);
          if (++g.overT === 80) api.end({ overText: 'TIME UP' });
          return;
        }

        // 转向：出界或低速时提供强效脱困敏捷度，彻底防止打不动方向
        let dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        if (api.demo) { const want = -pseg.curve * 0.12; dir = g.x > want + 0.15 ? -1 : g.x < want - 0.15 ? 1 : 0; }
        const returning = (g.x > 1 && dir < 0) || (g.x < -1 && dir > 0);
        const steerRate = returning ? 3.4 : 2.4;
        const steer = dt * steerRate * Math.max(0.7, Math.min(1.2, pct + 0.45));
        g.x += dir * steer;
        g.lastSteer = U.approach(g.lastSteer, dir, 0.2);
        // 离心力：赛道内感受推背离心，出界时大幅削弱，避免车子被死死往外拉扯打转
        const centriFactor = Math.abs(g.x) > 1 ? 0.35 : 0.8;
        g.x -= dt * 2.0 * pct * pseg.curve * CENTRI * centriFactor;

        // 氮气
        g.nitroOn = input.ok && g.nitro > 0 && g.crash <= 0;
        if (g.nitroOn) { g.nitro = Math.max(0, g.nitro - 0.55); if (g.t % 6 === 0) fx.burst(W / 2 + U.rand(-10, 10), H - 20, 3, ['#38e1ff', '#fff', '#b58cff'], { speed: 2, angle: Math.PI / 2, spread: 1, life: 14 }); }
        else g.nitro = Math.min(100, g.nitro + 0.035);
        if (input.okP && g.nitro > 0) sfx.whoosh();

        const cap = g.nitroOn ? MAXS * 1.3 : MAXS;
        if (g.crash > 0) { g.crash--; g.speed = U.approach(g.speed, MAXS * 0.35, ACC * dt); }
        else g.speed = g.speed < cap ? g.speed + ACC * dt * (g.nitroOn ? 1.8 : 1) : U.approach(g.speed, cap, ACC * dt * 2);

        // 越界
        const off = Math.abs(g.x) > 1;
        if (off) {
          if (g.speed > OFF_LIM) g.speed += OFF_DEC * dt;
          g.bump = (g.t % 4 < 2) ? 1.5 : -1.5;
          if (g.t % 3 === 0) fx.burst(W / 2 + U.rand(-20, 20), H - 16, 2, [THEMES[g.theme].grass[0], '#8a6a3a'], { speed: 2, angle: -Math.PI / 2, spread: 2, life: 16, gravity: 0.2 });
          // 撞路边树木：带有防连撞冷却，且智能向内侧弹回赛道方向，保留动力绝不卡死
          if (g.decoCooldown <= 0) {
            for (const s of pseg.sprites) {
              if (Math.abs(g.x - s.off) < 0.28) {
                g.speed = Math.max(MAXS * 0.38, g.speed * 0.75);
                g.x += (g.x > 0 ? -0.25 : 0.25);
                g.decoCooldown = 35;
                fx.addShake(6);
                sfx.thud();
                break;
              }
            }
          }
        } else g.bump = 0;
        g.x = U.clamp(g.x, -2.6, 2.6);
        g.speed = U.clamp(g.speed, 0, MAXS * 1.3);

        const move = g.speed * dt;
        g.pos = U.wrap(g.pos + move, TRACK);
        g.dist += move;
        g.skyOff += pseg.curve * pct * 0.003;

        const kmh = Math.round(pct * 280);
        st.topSpeed = Math.max(st.topSpeed, kmh);
        st.dist = Math.floor(g.dist / 50);
        st.score = st.dist * 2 + Math.floor(g.bonus || 0);

        // 车流
        for (const c of g.cars) {
          if (c.flyT > 0) { c.flyT--; continue; }
          const oldZ = c.z;
          c.z = U.wrap(c.z + c.speed * dt, TRACK);
          if (--c.laneT <= 0) { c.laneT = U.randi(150, 400); c.target = U.pick([-0.66, 0, 0.66]); }
          if (c.target != null) c.off = U.approach(c.off, c.target, 0.006);
          // 与玩家的相对位置（考虑绕圈）
          let rel = U.wrap(c.z - (g.pos + playerZ), TRACK); if (rel > TRACK / 2) rel -= TRACK;
          let relOld = U.wrap(oldZ - (g.pos - move + playerZ), TRACK); if (relOld > TRACK / 2) relOld -= TRACK;
          const dx = Math.abs(c.off - g.x);
          if (rel < SEG * 0.6 && rel > -SEG * 0.3 && dx < c.w + 0.06) {
            // 相撞
            if (g.nitroOn) {
              c.flyT = 90; c.z = U.wrap(c.z + SEG * 60, TRACK);
              addBonus(500, '撞飞!', '#38e1ff');
              fx.burst(W / 2, H - 70, 24, ['#fff', '#ffd23f', '#38e1ff'], { speed: 4 }); fx.addShake(8); sfx.boom(false);
              g.speed *= 0.85;
            } else {
              g.speed = Math.min(g.speed, c.speed * 0.8);
              g.crash = 40; g.chain = 0;
              g.x += g.x > c.off ? 0.25 : -0.25;
              c.z = U.wrap(c.z + SEG * 3, TRACK);
              fx.addShake(10); fx.flash('#ff3b3b', 0.35); fx.hitstop(4); sfx.hurt();
              fx.burst(W / 2, H - 60, 18, ['#fff', '#ffd23f', '#ff5a5a'], { speed: 4 });
            }
            continue;
          }
          // 擦车：从前方变到后方
          if (!c.passed && relOld >= 0 && rel < 0) {
            c.passed = true;
            if (dx < c.w + 0.38 && g.crash <= 0) {
              g.chain++; g.chainT = 150; st.nearMiss++;
              const v = 150 * g.chain;
              addBonus(v, g.chain > 1 ? '擦车 x' + g.chain : '擦车!', '#7dffb3');
              g.nitro = Math.min(100, g.nitro + 18);
              sfx.combo(g.chain);
            }
          }
          if (rel > 0) c.passed = false;
        }
        if (g.chainT > 0 && --g.chainT === 0) g.chain = 0;
        // 车流密度随检查点增加
        if (g.cars.length < 70 + g.cpIndex * 10 && g.t % 30 === 0) addCar(U.wrap(g.pos + SEG * U.randi(150, 400), TRACK));

        // 检查点
        const segDone = g.dist / SEG;
        if (segDone >= g.cpNextSeg) {
          st.checkpoints++; g.cpIndex++;
          g.time += g.cpBonus; g.cpBonus = Math.max(14, g.cpBonus - 2);
          g.cpNextSeg += CP_EVERY;
          g.theme = (g.theme + 1) % THEMES.length;
          addBonus(1000 * st.checkpoints, '', '#ffd23f');
          fx.say('CHECKPOINT +' + (g.cpBonus + 2) + 's', '#ffd23f', 90);
          fx.flash('#fff', 0.4); sfx.clear();
        }

        // 计时
        g.time -= dt;
        if (g.time <= 10 && Math.ceil(g.time) !== Math.ceil(g.time + dt)) sfx.tick();
        if (g.time <= 0) { g.time = 0; g.over = true; sfx.over(); }

        // 引擎声
        if (g.t % 8 === 0) sfx.tone(60 + pct * 140 + (g.nitroOn ? 60 : 0), 0.12, { type: 'sawtooth', vol: 0.018 });
      }
      function addBonus(v, label, color) {
        g.bonus = (g.bonus || 0) + v;
        fx.floatText(W / 2, H - 92, (label ? label + ' ' : '') + '+' + v, color, 10);
      }

      // ------------------------------------------------ draw
      function project(p, cx, cy, cz) {
        p.cam.x = -cx; p.cam.y = p.y - cy; p.cam.z = p.z - cz;
        const s = DEPTH / p.cam.z;
        p.scr.scale = s;
        p.scr.x = Math.round(W / 2 + s * p.cam.x * W / 2);
        p.scr.y = Math.round(HOR - s * p.cam.y * H / 2);
        p.scr.w = Math.round(s * ROADW * W / 2);
      }
      function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, c) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
      }
      function draw(ctx) {
        const th = THEMES[g.theme];
        // 天空
        ctx.fillStyle = D.vgrad(ctx, 0, HOR + 20, th.sky); ctx.fillRect(0, 0, W, HOR + 40);
        // 太阳 / 月亮
        const sx = 170 - (g.skyOff * 60 % 400);
        ctx.fillStyle = th.sun; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(U.wrap(sx, 400) - 80, HOR - 60, 20, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        // 远山 / 天际线
        ctx.fillStyle = th.far;
        const off = U.wrap(g.skyOff * 120, 240);
        for (let k = -1; k < 2; k++) {
          const bx = k * 240 - off;
          if (g.theme === 2) {
            for (let i = 0; i < 12; i++) { const h = 16 + ((i * 37) % 30); ctx.fillRect(bx + i * 20, HOR - h, 16, h + 10); ctx.fillStyle = '#ff3bd4'; if (i % 3 === 0) ctx.fillRect(bx + i * 20 + 4, HOR - h + 4, 2, 2); ctx.fillStyle = th.far; }
          } else {
            ctx.beginPath(); ctx.moveTo(bx, HOR + 10);
            for (let i = 0; i <= 12; i++) ctx.lineTo(bx + i * 20, HOR - 10 - Math.abs(Math.sin(i * 1.7)) * 26);
            ctx.lineTo(bx + 240, HOR + 10); ctx.closePath(); ctx.fill();
          }
        }

        // 路面
        const base = segAt(g.pos), bp = (g.pos % SEG) / SEG;
        const pseg = segAt(g.pos + playerZ), pp = ((g.pos + playerZ) % SEG) / SEG;
        const py = U.lerp(pseg.p1.y, pseg.p2.y, pp);
        let maxy = H, x = 0, dx = -(base.curve * bp);
        ctx.fillStyle = th.grass[0]; ctx.fillRect(0, HOR - 10, W, H - HOR + 10);
        for (let n = 0; n < DRAW; n++) {
          const s = segs[(base.i + n) % N];
          const looped = s.i < base.i;
          project(s.p1, g.x * ROADW - x, py + CAMH, g.pos - (looped ? TRACK : 0));
          project(s.p2, g.x * ROADW - x - dx, py + CAMH, g.pos - (looped ? TRACK : 0));
          x += dx; dx += s.curve;
          s.clip = maxy; s.fog = n / DRAW;
          if (s.p1.cam.z <= DEPTH || s.p2.scr.y >= s.p1.scr.y || s.p2.scr.y >= maxy) continue;
          const a = s.p1.scr, b = s.p2.scr;
          const r1 = a.w / 6, r2 = b.w / 6;
          ctx.fillStyle = th.grass[s.color]; ctx.fillRect(0, b.y, W, a.y - b.y + 1);
          poly(ctx, a.x - a.w - r1, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w - r2, b.y, th.rumble[s.color]);
          poly(ctx, a.x + a.w + r1, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w + r2, b.y, th.rumble[s.color]);
          poly(ctx, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, th.road[s.color]);
          if (s.color) {
            const l1 = a.w / 40, l2 = b.w / 40;
            for (const k of [-1 / 3, 1 / 3]) {
              const ax = a.x + a.w * 2 * k, bx = b.x + b.w * 2 * k;
              poly(ctx, ax - l1, a.y, ax + l1, a.y, bx + l2, b.y, bx - l2, b.y, th.lane);
            }
          }
          // 检查点地面线
          const cpIdx = g.cpNextSeg % N;
          if (s.i === cpIdx) poly(ctx, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, (g.t >> 3) % 2 ? '#fff' : '#111');
          if (s.fog > 0.35) { ctx.globalAlpha = Math.min(0.85, (s.fog - 0.35) * 1.4); ctx.fillStyle = th.fog; ctx.fillRect(0, b.y, W, a.y - b.y + 1); ctx.globalAlpha = 1; }
          maxy = b.y;
        }

        // 精灵：由远到近
        const carsBySeg = new Map();
        for (const c of g.cars) {
          if (c.flyT > 0) continue;
          const idx = Math.floor(c.z / SEG) % N;
          if (!carsBySeg.has(idx)) carsBySeg.set(idx, []);
          carsBySeg.get(idx).push(c);
        }
        for (let n = DRAW - 1; n > 0; n--) {
          const s = segs[(base.i + n) % N];
          if (s.p1.cam.z <= DEPTH) continue;
          const sc = s.p1.scr.scale;
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, s.clip); ctx.clip();
          for (const sp of s.sprites) {
            const X = s.p1.scr.x + sc * sp.off * ROADW * W / 2;
            const Y = s.p1.scr.y;
            if (th.side === 'lamp') { const w = sc * 380 * W / 2, h = w * 12 / 5; D.sprite(ctx, LAMP, PAL_LAMP, X - (sp.off < 0 ? 0 : w), Y - h, { scale: w / 5, flip: sp.off > 0 }); if (w > 3) { ctx.fillStyle = 'rgba(255,242,168,.25)'; ctx.beginPath(); ctx.arc(X + (sp.off < 0 ? w * 0.6 : -w * 0.6), Y - h + w * 0.3, w * 0.9, 0, 7); ctx.fill(); } }
            else { const w = sc * 520 * W / 2; D.sprite(ctx, PALM, PAL_PALM, X - w / 2, Y - w * 14 / 12, { scale: w / 12 }); }
          }
          // 检查点门
          if (s.i === g.cpNextSeg % N) {
            const X = s.p1.scr.x, Y = s.p1.scr.y, w = s.p1.scr.w * 1.15, h = w * 0.55;
            ctx.fillStyle = '#222'; ctx.fillRect(X - w, Y - h, Math.max(1, w * 0.05), h); ctx.fillRect(X + w - w * 0.05, Y - h, Math.max(1, w * 0.05), h);
            ctx.fillStyle = '#ffd23f'; ctx.fillRect(X - w, Y - h, w * 2, h * 0.22);
            if (w > 30) D.text(ctx, 'CHECKPOINT', X, Y - h + h * 0.18, { size: Math.max(6, Math.min(14, w / 7)), color: '#140d08', align: 'center' });
          }
          const cs = carsBySeg.get(s.i);
          if (cs) for (const c of cs) {
            const X = s.p1.scr.x + sc * c.off * ROADW * W / 2;
            const w = sc * 360 * W / 2 * (c.truck ? 1.15 : 1);
            const rows = c.truck ? TRUCK : CAR, pal = c.truck ? PAL_TRUCK : PAL_CARS[c.pal];
            D.sprite(ctx, rows, pal, X - w / 2, s.p1.scr.y - w * rows.length / 24, { scale: w / 24 });
          }
          ctx.restore();
        }

        // 玩家车
        const bob = g.speed > 100 && g.t % 6 < 3 ? 1 : 0;
        const px = W / 2 + g.lastSteer * 4, pyy = H - 42 + bob + g.bump;
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(px, pyy + 22, 34, 5, 0, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(px, pyy); ctx.rotate(g.lastSteer * 0.05);
        D.sprite(ctx, CAR, PAL_PLAYER, -36, 0, { scale: 3 });
        if (g.nitroOn) { ctx.fillStyle = (g.t % 4 < 2) ? '#38e1ff' : '#fff'; ctx.fillRect(-28, 30, 8, 6 + (g.t % 3) * 2); ctx.fillRect(20, 30, 8, 6 + (g.t % 3) * 2); }
        ctx.restore();
        if (g.crash > 0 && (g.t >> 2) % 2) { ctx.fillStyle = 'rgba(255,60,60,.15)'; ctx.fillRect(0, 0, W, H); }
        // 氮气速度线
        if (g.nitroOn) {
          ctx.strokeStyle = 'rgba(255,255,255,.35)';
          for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + g.t; const r = 60 + ((g.t * 9 + i * 40) % 120); ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r, HOR + Math.sin(a) * r * 0.8); ctx.lineTo(W / 2 + Math.cos(a) * (r + 30), HOR + Math.sin(a) * (r + 30) * 0.8); ctx.stroke(); }
        }
        drawHud(ctx);
      }

      function drawHud(ctx) {
        // 时间（支持分秒显示，如 10:00）
        const low = g.time < 10;
        const sec = Math.max(0, Math.ceil(g.time));
        const timeStr = sec >= 60 ? (Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')) : String(sec);
        D.panel(ctx, W / 2 - 34, 4, 68, 26, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: low ? '#ff5a5a' : 'rgba(255,255,255,.25)' });
        D.text(ctx, 'TIME', W / 2, 12, { size: 6, color: '#ffd23f', align: 'center' });
        D.text(ctx, timeStr, W / 2, 27, { size: 14, color: low && (g.t >> 3) % 2 ? '#ff5a5a' : '#fff', align: 'center' });
        // 分数 / 距离
        D.text(ctx, U.fmt(st.score), 6, 14, { size: 9, color: '#fff', outline: '#000' });
        D.text(ctx, (st.dist / 1000).toFixed(1) + ' km', 6, 25, { size: 7, color: '#ffd23f', outline: '#000' });
        D.text(ctx, THEMES[g.theme].name, W - 6, 14, { size: 7, color: '#fff', align: 'right', outline: '#000' });
        D.text(ctx, 'CP ' + st.checkpoints, W - 6, 25, { size: 7, color: '#7dffb3', align: 'right', outline: '#000' });
        // 速度表 + 氮气
        const kmh = Math.round(g.speed / MAXS * 280);
        D.panel(ctx, 4, H - 36, 64, 32, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: 'rgba(255,255,255,.2)' });
        D.text(ctx, String(kmh), 36, H - 16, { size: 14, color: kmh > 290 ? '#38e1ff' : '#fff', align: 'center' });
        D.text(ctx, 'KM/H', 36, H - 7, { size: 6, color: '#aaa', align: 'center' });
        D.panel(ctx, W - 68, H - 36, 64, 32, { r: 6, fill: 'rgba(0,0,0,.55)', stroke: 'rgba(255,255,255,.2)' });
        D.text(ctx, 'NITRO', W - 36, H - 24, { size: 7, color: '#38e1ff', align: 'center' });
        D.bar(ctx, W - 62, H - 18, 52, 6, g.nitro / 100, g.nitroOn ? '#fff' : '#38e1ff', 'rgba(255,255,255,.15)');
        if (g.chain > 1) D.text(ctx, 'CHAIN x' + g.chain, W / 2, 46, { size: 10, color: '#7dffb3', align: 'center', outline: '#000' });
        if (g.t > 0 && g.t < 200) D.text(ctx, '贴着车流擦过去 = 攒氮气', W / 2, 190, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }

      return { update, draw };
    }
  });
})();
