// simulator/games/shyfish.js — 会躲起来的鱼（重制：猜猜鱼在哪）
// 小金鱼钻进三个贝壳之一，贝壳开始换位；停下后用 UP / OK / DOWN 选左中右。越往后换得越快，还会有冒充的红鱼
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, SX = [52, 120, 188], SY = 206;

  A.define({
    id: 'fish',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, round: 0, streak: 0, maxStreak: 0 });
      // slots[i] = 贝壳 id 当前所在位置；shells[id] = { pos(0-2), x }
      const g = { t: 0, phase: 'show', pT: 0, round: 0, lives: 3, shells: [0, 1, 2].map((i) => ({ pos: i, x: SX[i], y: SY, lift: 0 })), fishIn: 1, decoyIn: -1, swaps: [], swap: null, fish: { x: 120, y: 120 }, pick: -1, bubbles: [], peek: 0, timeLeft: 0 };

      function newRound() {
        g.round++; st.round = g.round;
        g.phase = 'show'; g.pT = 0; g.pick = -1;
        g.fishIn = U.randi(0, 2);
        g.decoyIn = g.round >= 4 && U.chance(0.6) ? U.pick([0, 1, 2].filter((i) => i !== g.fishIn)) : -1;
        const n = Math.min(14, 2 + g.round);
        g.speed = Math.min(0.2, 0.05 + g.round * 0.012);
        g.swaps = [];
        for (let i = 0; i < n; i++) { const a = U.randi(0, 2); let b = U.randi(0, 1); if (b >= a) b++; g.swaps.push([a, b]); }
        for (const s of g.shells) s.lift = 1;
        g.fish = { x: 120, y: 90 }; g.dfish = { x: U.pick([20, 220]), y: 110 };
      }
      newRound();

      const shellAt = (pos) => g.shells.findIndex((s) => s.pos === pos);

      function update(input) {
        g.t++; g.pT++;
        for (const b of g.bubbles) { b.y -= b.s; b.x += Math.sin((g.t + b.y) / 12) * 0.3; }
        g.bubbles = g.bubbles.filter((b) => b.y > 40);
        if (g.t % 20 === 0) g.bubbles.push({ x: U.rand(10, 230), y: 300, s: U.rand(0.4, 1), r: U.rand(1, 3) });
        if (g.phase === 'show') {
          // 鱼游到目标贝壳上方，然后钻进去
          const tx = g.shells[g.fishIn].x;
          g.fish.x += (tx - g.fish.x) * 0.06; g.fish.y += (SY - 10 - g.fish.y) * (g.pT > 50 ? 0.08 : 0.01);
          if (g.decoyIn >= 0) { const dx = g.shells[g.decoyIn].x; g.dfish.x += (dx - g.dfish.x) * 0.06; g.dfish.y += (SY - 10 - g.dfish.y) * (g.pT > 50 ? 0.08 : 0.01); }
          if (g.pT === 70) { for (const s of g.shells) s.lift = 0; sfx.tone(300, 0.1, { type: 'sine', vol: 0.1 }); }
          if (g.pT > 90) { g.phase = 'shuffle'; g.pT = 0; }
          return;
        }
        if (g.phase === 'shuffle') {
          if (!g.swap) {
            const s = g.swaps.shift();
            if (!s) { g.phase = 'pick'; g.pT = 0; g.timeLeft = Math.max(180, 420 - g.round * 20); fx.say('鱼在哪?', '#ffd23f', 40); return; }
            const a = shellAt(s[0]), b = shellAt(s[1]);
            g.swap = { a, b, k: 0, ax: g.shells[a].x, bx: g.shells[b].x, up: U.chance(0.5) ? 1 : -1 };
            sfx.tone(700 + U.randi(0, 5) * 60, 0.05, { type: 'square', vol: 0.04 });
          }
          const w = g.swap;
          w.k = Math.min(1, w.k + g.speed);
          const e = U.outCubic(w.k), A_ = g.shells[w.a], B_ = g.shells[w.b];
          A_.x = U.lerp(w.ax, w.bx, e); B_.x = U.lerp(w.bx, w.ax, e);
          const arc = Math.sin(e * Math.PI) * 22;
          A_.y = SY - arc * w.up; B_.y = SY + arc * w.up * 0.6;
          if (w.k >= 1) {
            const pa = A_.pos; A_.pos = B_.pos; B_.pos = pa;
            A_.x = SX[A_.pos]; B_.x = SX[B_.pos]; A_.y = B_.y = SY;
            g.swap = null;
          }
          // 早期关卡：鱼偶尔吐个泡泡暴露位置
          if (g.round <= 3 && g.t % 50 === 0) g.bubbles.push({ x: g.shells[g.fishIn].x, y: g.shells[g.fishIn].y - 16, s: 0.8, r: 3, hint: true });
          return;
        }
        if (g.phase === 'pick') {
          const choose = input.upP ? 0 : input.okP ? 1 : input.downP ? 2 : -1;
          if (--g.timeLeft <= 0 && choose < 0) { resolve(-1); return; }
          if (choose >= 0) resolve(choose);
          return;
        }
        if (g.phase === 'reveal') {
          if (g.pT > 100) {
            if (g.lives <= 0) { g.phase = 'done'; api.end({ overText: '鱼躲得太好了' }); return; }
            newRound();
          }
        }
      }
      function resolve(pos) {
        g.pick = pos; g.phase = 'reveal'; g.pT = 0;
        for (const s of g.shells) s.lift = 1;
        const right = pos >= 0 && shellAt(pos) === g.fishIn;
        if (right) {
          g.streak = (g.streak || 0) + 1; st.streak = g.streak; st.maxStreak = Math.max(st.maxStreak, g.streak);
          const pts = 100 * g.round * Math.min(5, g.streak) + Math.floor(g.timeLeft / 3);
          st.score += pts;
          fx.say('找到啦! +' + pts, '#7dffb3', 60); sfx.combo(4 + g.streak);
          fx.burst(SX[pos], SY - 20, 24, ['#ffd23f', '#ff8a30', '#fff'], { speed: 3 });
        } else {
          g.lives--; g.streak = 0; st.streak = 0;
          const isDecoy = pos >= 0 && shellAt(pos) === g.decoyIn;
          fx.say(pos < 0 ? '时间到' : isDecoy ? '那是冒充的红鱼!' : '空的…', '#ff6b6b', 60); sfx.hurt(); fx.addShake(4);
        }
      }

      function goldfish(ctx, x, y, dir, color, t) {
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        const wag = Math.sin(t / 4) * 3;
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-16, -6 + wag); ctx.lineTo(-16, 6 + wag); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -2, 3, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(6, -2, 1.5, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-4, -5, 6, 2);
        ctx.restore();
      }
      function shell(ctx, s, id) {
        const open = s.lift;
        ctx.save(); ctx.translate(s.x, s.y);
        // 里面的东西（打开时可见）
        if (open > 0 && (g.phase === 'reveal' || g.phase === 'show')) {
          if (id === g.fishIn && g.phase === 'reveal') goldfish(ctx, 0, -6, 1, '#ffb020', g.t);
          else if (id === g.decoyIn && g.phase === 'reveal') goldfish(ctx, 0, -6, -1, '#e0342f', g.t);
          else if (g.phase === 'reveal') D.text(ctx, '·', 0, -2, { size: 10, color: '#fff', align: 'center' });
        }
        ctx.fillStyle = '#e8b8a0'; ctx.beginPath(); ctx.ellipse(0, 6, 26, 8, 0, 0, 7); ctx.fill();
        ctx.rotate(-open * 0.5);
        ctx.fillStyle = '#ffd0c0';
        ctx.beginPath(); ctx.moveTo(-26, 4); ctx.quadraticCurveTo(-24, -26, 0, -26); ctx.quadraticCurveTo(24, -26, 26, 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#d89080'; ctx.lineWidth = 1.5;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 9, 3); ctx.lineTo(k * 5, -22); ctx.stroke(); }
        ctx.lineWidth = 1;
        ctx.restore();
      }
      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#2ab0e0', '#0a5a8a', '#06304a']); ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 4; i++) { const x = 20 + i * 60 + Math.sin(g.t / 70 + i) * 10; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 50, H); ctx.lineTo(x + 20, H); ctx.fill(); }
        ctx.fillStyle = '#d8c090'; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 226 + Math.sin(x / 25) * 4); ctx.lineTo(W, H); ctx.fill();
        for (let i = 0; i < 6; i++) { const x = 10 + i * 44; ctx.strokeStyle = '#2a8a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 232); ctx.quadraticCurveTo(x + Math.sin(g.t / 30 + i) * 8, 200, x + Math.sin(g.t / 20 + i) * 6, 170 - (i % 3) * 14); ctx.stroke(); }
        ctx.lineWidth = 1;
        for (const b of g.bubbles) { ctx.strokeStyle = b.hint ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); }
        g.shells.forEach((s, id) => shell(ctx, s, id));
        if (g.phase === 'show') {
          goldfish(ctx, g.fish.x, g.fish.y, g.fish.x < g.shells[g.fishIn].x ? 1 : -1, '#ffb020', g.t);
          if (g.decoyIn >= 0) goldfish(ctx, g.dfish.x, g.dfish.y, g.dfish.x < g.shells[g.decoyIn].x ? 1 : -1, '#e0342f', g.t + 20);
        }
        if (g.phase === 'pick') {
          for (let i = 0; i < 3; i++) {
            D.panel(ctx, SX[i] - 17, 250, 34, 16, { r: 4, fill: i === 1 ? '#8a5a10' : '#2a2230', stroke: 'rgba(255,255,255,.4)', lw: 1 });
            D.text(ctx, ['UP', 'OK', 'DN'][i], SX[i], 262, { size: 8, color: '#fff', align: 'center' });
          }
          D.bar(ctx, 40, 276, 160, 4, g.timeLeft / Math.max(180, 420 - g.round * 20), '#ffd23f');
        }
        if (g.phase === 'reveal' && g.pick >= 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(SX[g.pick], SY - 6, 32, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
        D.text(ctx, U.fmt(st.score), 8, 18, { size: 10, color: '#fff' });
        D.text(ctx, '第 ' + g.round + ' 轮', W / 2, 18, { size: 10, color: '#ffd23f', align: 'center' });
        for (let i = 0; i < 3; i++) D.text(ctx, '🐟', W - 14 - i * 16, 19, { size: 10, align: 'center', color: '#fff' });
        if (g.lives < 3) for (let i = g.lives; i < 3; i++) { ctx.fillStyle = 'rgba(6,48,74,.75)'; ctx.fillRect(W - 22 - i * 16, 8, 16, 14); }
        if ((g.streak || 0) > 1) D.text(ctx, '连中 ' + g.streak, W / 2, 36, { size: 9, color: '#7dffb3', align: 'center' });
        if (g.phase === 'show') D.text(ctx, g.decoyIn >= 0 ? '盯住金色那条，别被红鱼骗了' : '盯住小金鱼钻进哪个贝壳', W / 2, 60, { size: 9, color: '#fff', align: 'center', outline: '#06304a' });
      }
      return { update, draw };
    }
  });
})();
