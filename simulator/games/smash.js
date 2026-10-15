// simulator/games/smash.js — 万物皆可敲（重制：三洞打地鼠）
// 左中右三个洞对应 UP / OK / DOWN：冒出来的闹钟、打卡机、蚊子统统敲掉；别敲小猫；连击 20 进入狂热
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, HX = [48, 120, 192], HY = 236;
  const KEYS = ['up', 'ok', 'down'];
  const TARGETS = [
    { id: 'clock', name: '闹钟', c: '#ff5a5a', pts: 100 },
    { id: 'punch', name: '打卡机', c: '#8aa0c0', pts: 120 },
    { id: 'mosq', name: '蚊子', c: '#3a3a4a', pts: 150 },
    { id: 'egg', name: '鸡蛋', c: '#fff4d8', pts: 80 },
    { id: 'gold', name: '金猪', c: '#ffd23f', pts: 500 }
  ];
  const FRIEND = { id: 'cat', name: '小猫', c: '#f08a30' };

  A.define({
    id: 'smash',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, hits: 0, maxCombo: 0, fevers: 0 });
      const g = { t: 0, holes: [null, null, null], hammer: [0, 0, 0], lives: 5, combo: 0, fever: 0, spawnT: 50, speed: 1, over: false, overT: 0, splats: [], shake: [0, 0, 0] };

      function spawn() {
        const free = [0, 1, 2].filter((i) => !g.holes[i]);
        if (!free.length) return;
        const i = U.pick(free);
        const friend = U.chance(Math.min(0.28, 0.1 + g.t / 20000));
        const T = friend ? FRIEND : (U.chance(0.06) ? TARGETS[4] : U.pick(TARGETS.slice(0, 4)));
        const up = Math.max(34, 90 - g.t / 60) / (g.fever > 0 ? 1.3 : 1);
        g.holes[i] = { T, friend, life: up, max: up, rise: 0, hit: false, down: 0 };
      }
      function whack(i) {
        g.hammer[i] = 12;
        const o = g.holes[i];
        if (!o || o.hit || o.rise < 0.5) {
          sfx.thud(); g.combo = 0; g.shake[i] = 6;
          fx.floatText(HX[i], HY - 20, '空', '#aaa', 8);
          return;
        }
        o.hit = true; o.down = 14;
        if (o.friend) {
          g.lives--; g.combo = 0; g.fever = 0;
          sfx.tone(900, 0.25, { type: 'sine', vol: 0.1, to: 1500 }); fx.flash('#ff8a30', 0.3); fx.addShake(6);
          fx.floatText(HX[i], HY - 40, '喵!! 别敲我', '#ff8a30', 10);
          if (g.lives <= 0) { g.over = true; sfx.over(); }
          return;
        }
        g.combo++; st.hits++; st.maxCombo = Math.max(st.maxCombo, g.combo);
        if (g.combo % 20 === 0) { g.fever = 360; st.fevers++; fx.say('狂热模式! 双倍分', '#ff5ad2', 70); sfx.power(); fx.flash('#ff5ad2', 0.3); }
        const mul = (1 + Math.floor(g.combo / 10)) * (g.fever > 0 ? 2 : 1);
        const pts = o.T.pts * mul;
        st.score += pts;
        const perfect = o.rise > 0.95 && o.life > o.max * 0.5;
        fx.floatText(HX[i], HY - 44, (perfect ? '快! ' : '') + '+' + pts, o.T.id === 'gold' ? '#ffd23f' : '#fff', o.T.id === 'gold' ? 12 : 9);
        const cols = o.T.id === 'egg' ? ['#ffd23f', '#fff4d8', '#fff'] : o.T.id === 'gold' ? ['#ffd23f', '#fff', '#ff8a30'] : [o.T.c, '#fff', '#ffd23f'];
        fx.debris(HX[i], HY - 22, cols, o.T.id === 'gold' ? 30 : 16);
        g.splats.push({ x: HX[i] + U.rand(-10, 10), y: HY + 16, c: cols[0], life: 200 });
        sfx.combo(Math.min(18, g.combo)); fx.addShake(o.T.id === 'gold' ? 8 : 3); fx.hitstop(2);
      }

      function update(input) {
        g.t++;
        if (g.over) { if (++g.overT === 60) api.end({ overText: '五颗心用完了' }); return; }
        if (input.upP) whack(0);
        if (input.okP) whack(1);
        if (input.downP) whack(2);
        for (let i = 0; i < 3; i++) {
          if (g.hammer[i] > 0) g.hammer[i]--;
          if (g.shake[i] > 0) g.shake[i]--;
          const o = g.holes[i];
          if (!o) continue;
          if (o.hit) { if (--o.down <= 0) g.holes[i] = null; continue; }
          o.rise = Math.min(1, o.rise + 0.18);
          if (--o.life <= 0) {
            o.rise -= 0.3;
            if (o.rise <= 0) {
              g.holes[i] = null;
              if (!o.friend) { g.lives--; g.combo = 0; g.fever = 0; sfx.hurt(); fx.floatText(HX[i], HY - 30, o.T.name + '溜了!', '#ff6b6b', 9); if (g.lives <= 0) { g.over = true; sfx.over(); } }
            }
          }
        }
        if (g.fever > 0) g.fever--;
        if (--g.spawnT <= 0) { spawn(); if (g.t > 1200 && U.chance(0.3)) spawn(); g.spawnT = Math.max(16, 52 - g.t / 90) * (g.fever > 0 ? 0.7 : 1); }
        for (const s of g.splats) s.life--;
        g.splats = g.splats.filter((s) => s.life > 0);
        st.score += 0;
      }

      function thing(ctx, o, x, y) {
        const T = o.T;
        if (T.id === 'cat') {
          ctx.fillStyle = T.c; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x - 11, y - 22); ctx.lineTo(x - 3, y - 13); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x + 14, y - 6); ctx.lineTo(x + 11, y - 22); ctx.lineTo(x + 3, y - 13); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y + 5, 8, 6, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 7, y - 3, 3, 3); ctx.fillRect(x + 4, y - 3, 3, 3);
          ctx.fillStyle = '#ff7a9a'; ctx.fillRect(x - 1, y + 2, 2, 2);
          D.text(ctx, '♥', x + 16, y - 16, { size: 10, color: '#ff7a9a' });
        } else if (T.id === 'clock') {
          ctx.fillStyle = T.c; ctx.beginPath(); ctx.arc(x - 11, y - 14, 5, 0, 7); ctx.arc(x + 11, y - 14, 5, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
          ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 8); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 2); ctx.stroke(); ctx.lineWidth = 1;
          if ((g.t >> 2) % 2) { ctx.strokeStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(x, y, 20, -2.5, -0.6); ctx.stroke(); }
        } else if (T.id === 'punch') {
          ctx.fillStyle = T.c; D.rrect(ctx, x - 15, y - 16, 30, 32, 4); ctx.fill();
          ctx.fillStyle = '#1a2a3a'; ctx.fillRect(x - 11, y - 12, 22, 9);
          D.text(ctx, '09:01', x, y - 5, { size: 6, color: '#ff5a5a', align: 'center' });
          ctx.fillStyle = '#5a6a80'; ctx.fillRect(x - 8, y + 2, 16, 3);
          D.text(ctx, '周一', x, y + 13, { size: 7, color: '#fff', align: 'center' });
        } else if (T.id === 'mosq') {
          ctx.fillStyle = 'rgba(200,220,255,.7)'; const f = Math.sin(g.t) * 4;
          ctx.beginPath(); ctx.ellipse(x - 8, y - 8 + f, 9, 4, -0.4, 0, 7); ctx.ellipse(x + 8, y - 8 - f, 9, 4, 0.4, 0, 7); ctx.fill();
          ctx.fillStyle = T.c; ctx.beginPath(); ctx.ellipse(x, y, 5, 11, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - 3, y - 9, 2, 2); ctx.fillRect(x + 1, y - 9, 2, 2);
          ctx.strokeStyle = T.c; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 20); ctx.stroke();
        } else if (T.id === 'egg') {
          ctx.fillStyle = T.c; ctx.beginPath(); ctx.ellipse(x, y, 12, 16, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 5, y - 2, 2, 3); ctx.fillRect(x + 3, y - 2, 2, 3);
          ctx.strokeStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(x, y + 4, 3, 0.2, 2.9); ctx.stroke();
        } else if (T.id === 'gold') {
          ctx.fillStyle = T.c; ctx.beginPath(); ctx.ellipse(x, y, 18, 14, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.ellipse(x + 12, y + 2, 6, 5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#8a5a10'; ctx.fillRect(x + 10, y, 2, 3); ctx.fillRect(x + 14, y, 2, 3); ctx.fillRect(x + 2, y - 6, 3, 3);
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y - 10, 5, 2);
        }
      }
      function draw(ctx) {
        const fv = g.fever > 0;
        ctx.fillStyle = D.vgrad(ctx, 0, H, fv ? ['#3a0a3a', '#8a1a6a'] : ['#2a3a5a', '#4a6a8a']); ctx.fillRect(0, 0, W, H);
        // 办公室背景
        ctx.fillStyle = fv ? 'rgba(255,90,210,.15)' : 'rgba(255,255,255,.06)';
        for (let i = 0; i < 4; i++) ctx.fillRect(14 + i * 56, 40, 46, 70);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(0, HY + 10, W, H - HY);
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(0, HY + 10, W, 4);
        for (const s of g.splats) { ctx.globalAlpha = s.life / 200; ctx.fillStyle = s.c; ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 4, 0, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 3; i++) {
          const x = HX[i] + (g.shake[i] ? U.rand(-2, 2) : 0);
          // 洞
          ctx.fillStyle = '#1a0e06'; ctx.beginPath(); ctx.ellipse(x, HY + 10, 30, 10, 0, 0, 7); ctx.fill();
          const o = g.holes[i];
          if (o) {
            const rise = o.hit ? Math.max(0, o.down / 14) : Math.max(0, o.rise);
            ctx.save(); ctx.beginPath(); ctx.rect(x - 40, HY - 60, 80, 70); ctx.clip();
            const y = HY + 20 - rise * 36;
            if (o.hit) { ctx.translate(x, y); ctx.scale(1.3, 0.5); ctx.translate(-x, -y); }
            thing(ctx, o, x, y);
            ctx.restore();
            // 剩余时间环
            if (!o.hit && !o.friend && o.rise >= 1) { ctx.strokeStyle = o.life < o.max * 0.3 ? '#ff5a5a' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, HY - 18, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (o.life / o.max)); ctx.stroke(); ctx.lineWidth = 1; }
          }
          ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.ellipse(x, HY + 14, 32, 7, 0, 0, Math.PI); ctx.fill();
          // 锤子
          const hm = g.hammer[i] / 12;
          ctx.save(); ctx.translate(x + 26, HY - 60); ctx.rotate(-0.9 + (1 - hm) * 0 + hm * 1.1);
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-2, 0, 4, 34);
          ctx.fillStyle = fv ? '#ff5ad2' : '#c8c8d8'; D.rrect(ctx, -12, 30, 24, 14, 3); ctx.fill();
          ctx.restore();
          // 键位
          D.panel(ctx, HX[i] - 17, H - 30, 34, 16, { r: 4, fill: i === 1 ? '#8a5a10' : '#2a2230', stroke: 'rgba(255,255,255,.3)', lw: 1 });
          D.text(ctx, ['UP', 'OK', 'DN'][i], HX[i], H - 18, { size: 8, color: '#fff', align: 'center' });
        }
        D.text(ctx, U.fmt(st.score), 8, 18, { size: 11, color: '#fff' });
        for (let i = 0; i < 5; i++) D.text(ctx, '♥', W - 12 - i * 13, 18, { size: 10, color: i < g.lives ? '#ff6b6b' : 'rgba(255,255,255,.2)', align: 'center' });
        if (g.combo > 1) D.text(ctx, g.combo + ' 连击  x' + (1 + Math.floor(g.combo / 10)) * (fv ? 2 : 1), W / 2, 136, { size: 12, color: fv ? '#ff5ad2' : '#ffd23f', align: 'center', outline: '#000' });
        if (fv) D.bar(ctx, 40, 146, 160, 4, g.fever / 360, '#ff5ad2');
        D.bar(ctx, 8, 26, 80, 3, (g.combo % 20) / 20, '#ff5ad2', 'rgba(255,255,255,.15)');
        if (g.t > 0 && g.t < 240) D.text(ctx, '左中右 = UP / OK / DN · 别敲小猫', W / 2, 120, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
