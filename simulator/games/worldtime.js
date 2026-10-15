// simulator/games/worldtime.js — 世界时钟（重制：时差大挑战）
// 看北京时间，答出别的城市几点、是白天还是夜里、谁先过新年；三个选项对应 UP / OK / DOWN，越快分越高
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320;
  // 标准时区（不计夏令时，题目里会写明）
  const CITIES = [
    { n: '北京', o: 8 }, { n: '东京', o: 9 }, { n: '首尔', o: 9 }, { n: '新加坡', o: 8 }, { n: '新德里', o: 5.5 },
    { n: '迪拜', o: 4 }, { n: '莫斯科', o: 3 }, { n: '伦敦', o: 0 }, { n: '巴黎', o: 1 }, { n: '开罗', o: 2 },
    { n: '纽约', o: -5 }, { n: '洛杉矶', o: -8 }, { n: '圣保罗', o: -3 }, { n: '悉尼', o: 10 }, { n: '奥克兰', o: 12 }, { n: '檀香山', o: -10 }
  ];
  const fmt = (h) => { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  const dayOf = (h) => { h = ((h % 24) + 24) % 24; return h >= 6 && h < 18; };

  A.define({
    id: 'worldtime',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, correct: 0, streak: 0, maxStreak: 0 });
      const g = { t: 0, q: null, lives: 3, n: 0, phase: 'ask', pT: 0, pick: -1, time: 0, limit: 0, streak: 0 };

      function makeQ() {
        g.n++;
        const bj = U.randi(0, 23) + (U.chance(0.3) ? 0.5 : 0);
        const type = g.n < 3 ? 0 : U.pick([0, 0, 1, 2, 3]);
        const others = CITIES.filter((c) => c.n !== '北京');
        let q;
        if (type === 0) {
          const c = U.pick(others), ans = bj - 8 + c.o;
          const wrong = new Set();
          while (wrong.size < 2) { const d = U.pick([-12, -6, -3, -2, -1, 1, 2, 3, 6, 13]); const w = fmt(ans + d); if (w !== fmt(ans)) wrong.add(w); }
          const opts = [fmt(ans), ...wrong].sort(() => Math.random() - 0.5);
          q = { text: '北京 ' + fmt(bj) + ' 时', ask: c.n + ' 是几点？', opts, right: opts.indexOf(fmt(ans)), explain: c.n + (c.o - 8 >= 0 ? ' 比北京早 ' : ' 比北京晚 ') + Math.abs(c.o - 8) + ' 小时', city: c };
        } else if (type === 1) {
          const three = others.slice().sort(() => Math.random() - 0.5).slice(0, 3);
          const days = three.map((c) => dayOf(bj - 8 + c.o));
          const want = U.chance(0.5);
          if (!days.includes(want)) { q = null; return makeQ(); }
          if (days.filter((d) => d === want).length > 1) { return makeQ(); }
          q = { text: '北京 ' + fmt(bj) + ' 时', ask: '哪座城市正是' + (want ? '白天？' : '夜里？'), opts: three.map((c) => c.n), right: days.indexOf(want), explain: three.map((c) => c.n + ' ' + fmt(bj - 8 + c.o)).join(' · ') };
        } else if (type === 2) {
          const three = others.slice().sort(() => Math.random() - 0.5).slice(0, 3);
          if (new Set(three.map((c) => c.o)).size < 3) return makeQ();
          const best = three.reduce((m, c, i) => (c.o > three[m].o ? i : m), 0);
          q = { text: '新年倒计时', ask: '哪座城市最先跨年？', opts: three.map((c) => c.n), right: best, explain: '时区越往东越早：' + three.map((c) => c.n + ' UTC' + (c.o >= 0 ? '+' : '') + c.o).join(' · ') };
        } else {
          const c = U.pick(others), diff = c.o - 8;
          const opts = [diff, diff + U.pick([1, 2, 3]), diff - U.pick([1, 2, 3])].map((d) => (d >= 0 ? '早 ' : '晚 ') + Math.abs(d) + ' 小时');
          const uniq = [...new Set(opts)]; if (uniq.length < 3) return makeQ();
          const sh = opts.slice().sort(() => Math.random() - 0.5);
          q = { text: '时差题', ask: c.n + ' 比北京？', opts: sh, right: sh.indexOf(opts[0]), explain: c.n + ' 是 UTC' + (c.o >= 0 ? '+' : '') + c.o + '，北京是 UTC+8' };
        }
        q.bj = bj;
        g.q = q; g.phase = 'ask'; g.pT = 0; g.pick = -1;
        g.limit = Math.max(300, 600 - g.n * 15); g.time = g.limit;
      }
      makeQ();

      function answer(i) {
        g.pick = i; g.phase = 'result'; g.pT = 0;
        if (i === g.q.right) {
          g.streak++; st.correct++; st.streak = g.streak; st.maxStreak = Math.max(st.maxStreak, g.streak);
          const pts = Math.round(100 + g.time / g.limit * 200) * Math.min(5, 1 + Math.floor(g.streak / 3));
          st.score += pts; fx.say('答对 +' + pts, '#7dffb3', 50); sfx.combo(3 + g.streak);
        } else {
          g.lives--; g.streak = 0; st.streak = 0;
          fx.say(i < 0 ? '时间到' : '答错了', '#ff6b6b', 50); sfx.hurt(); fx.addShake(4);
        }
      }

      function update(input) {
        g.t++; g.pT++;
        if (g.phase === 'ask') {
          if (--g.time <= 0) { answer(-1); return; }
          if (g.time < 120 && g.time % 60 === 0) sfx.tick();
          const c = input.upP ? 0 : input.okP ? 1 : input.downP ? 2 : -1;
          if (c >= 0 && g.pT > 15) answer(c);
        } else if (g.phase === 'result') {
          if (g.pT > 110 || (g.pT > 40 && (input.okP || input.upP || input.downP))) {
            if (g.lives <= 0) { g.phase = 'done'; api.end({ overText: '时差把你绕晕了' }); return; }
            makeQ();
          }
        }
      }

      function clock(ctx, x, y, r, h, label) {
        const day = dayOf(h);
        ctx.fillStyle = day ? '#fff6d8' : '#1a2448'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = day ? '#ffb020' : '#7cc7ff'; ctx.lineWidth = 2; ctx.stroke();
        const hh = ((h % 12) + 12) % 12;
        ctx.strokeStyle = day ? '#2a1a10' : '#fff';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(hh / 12 * Math.PI * 2) * r * 0.5, y - Math.cos(hh / 12 * Math.PI * 2) * r * 0.5); ctx.stroke();
        const mm = (h % 1) * 60;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(mm / 60 * Math.PI * 2) * r * 0.8, y - Math.cos(mm / 60 * Math.PI * 2) * r * 0.8); ctx.stroke();
        D.text(ctx, day ? '☀' : '☾', x + r - 2, y - r + 6, { size: 9, color: day ? '#ffb020' : '#ffd23f' });
        if (label) D.text(ctx, label, x, y + r + 12, { size: 9, color: '#fff', align: 'center' });
      }
      function draw(ctx) {
        const q = g.q;
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#0a1a3a', '#1a3a6a']); ctx.fillRect(0, 0, W, H);
        // 昼夜地带（按北京时间推算的太阳直射经度）
        const sunLon = ((12 - (q.bj - 8)) * 15);
        const sx = U.wrap((sunLon + 180) / 360 * W, W);
        const grd = ctx.createLinearGradient(sx - W / 2, 0, sx + W / 2, 0);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(255,210,120,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.fillRect(0, 22, W, 70);
        ctx.fillStyle = 'rgba(255,210,120,.25)'; ctx.fillRect(sx - W / 2 + W, 22, W, 70); ctx.fillRect(sx - W / 2 - W, 22, W, 70);
        // 城市点
        for (const c of CITIES) { const x = U.wrap(((c.o * 15) + 180) / 360 * W, W); ctx.fillStyle = dayOf(q.bj - 8 + c.o) ? '#ffd23f' : '#7cc7ff'; ctx.fillRect(x - 1, 50 + (c.n.length % 3) * 10, 3, 3); }
        D.text(ctx, '☀', sx, 40, { size: 12, color: '#ffd23f', align: 'center' });
        // 题目
        clock(ctx, 60, 128, 26, q.bj, '北京');
        D.text(ctx, q.text, 150, 118, { size: 11, color: '#ffd23f', align: 'center' });
        D.text(ctx, q.ask, 150, 142, { size: 12, color: '#fff', align: 'center' });
        // 选项
        for (let i = 0; i < 3; i++) {
          const y = 176 + i * 34, right = g.phase !== 'ask' && i === q.right, wrong = g.phase !== 'ask' && i === g.pick && i !== q.right;
          D.panel(ctx, 16, y, W - 32, 28, { r: 8, fill: right ? 'rgba(125,255,179,.25)' : wrong ? 'rgba(255,90,90,.25)' : 'rgba(255,255,255,.06)', stroke: right ? '#7dffb3' : wrong ? '#ff6b6b' : 'rgba(255,255,255,.2)' });
          D.panel(ctx, 22, y + 6, 30, 16, { r: 4, fill: i === 1 ? '#8a5a10' : '#2a2230', stroke: false });
          D.text(ctx, ['UP', 'OK', 'DN'][i], 37, y + 18, { size: 7, color: '#fff', align: 'center' });
          D.text(ctx, q.opts[i], 136, y + 19, { size: 12, color: '#fff', align: 'center' });
        }
        if (g.phase === 'ask') D.bar(ctx, 16, 282, W - 32, 5, g.time / g.limit, g.time < 120 ? '#ff6b6b' : '#ffd23f');
        else D.text(ctx, q.explain, W / 2, 290, { size: 8, color: '#bfe0ff', align: 'center' });
        // HUD
        D.text(ctx, U.fmt(st.score), 8, 16, { size: 10, color: '#fff' });
        D.text(ctx, '第 ' + g.n + ' 题', W / 2, 16, { size: 9, color: '#ffd23f', align: 'center' });
        for (let i = 0; i < 3; i++) D.text(ctx, '♥', W - 12 - i * 12, 16, { size: 10, color: i < g.lives ? '#ff6b6b' : 'rgba(255,255,255,.2)', align: 'center' });
        if (g.streak > 1) D.text(ctx, '连对 ' + g.streak, W / 2, 310, { size: 9, color: '#7dffb3', align: 'center' });
        D.text(ctx, '时区按标准时间，不算夏令时', W / 2, 318, { size: 6, color: 'rgba(255,255,255,.35)', align: 'center' });
      }
      return { update, draw };
    }
  });
})();
