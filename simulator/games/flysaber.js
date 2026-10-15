// simulator/games/flysaber.js — 果蝇光剑（重制：节奏劈砍）
// 自带合成音乐：方块踩着节拍飞来，UP 蓝刀、DOWN 红刀、OK 劈金色核心；别砍炸弹。三首曲子越来越快
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, VX = 120, VY = 40, HITY = 252, LEAD = 70;
  const SONGS = [
    { name: 'NEON BUGS', bpm: 104, bars: 14, dens: 0.55, key: 220 },
    { name: 'COMPOUND EYE', bpm: 122, bars: 16, dens: 0.7, key: 247 },
    { name: 'HYPER FLIGHT', bpm: 140, bars: 18, dens: 0.85, key: 262 }
  ];
  const SCALE = [0, 3, 5, 7, 10, 12, 15];
  const LANES = { up: { x: 70, c: '#38b8ff', key: 'up' }, down: { x: 170, c: '#ff4d6d', key: 'down' }, ok: { x: 120, c: '#ffd23f', key: 'ok' } };

  A.define({
    id: 'flysaber',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, maxCombo: 0, perfect: 0, songs: 0 });
      const g = { t: 0, si: 0, songT: 0, notes: [], combo: 0, hp: 100, judge: null, judgeT: 0, slash: { up: 0, down: 0, ok: 0 }, state: 'intro', stateT: 0, beat: 0, glow: 0, over: false };

      function buildSong() {
        const s = SONGS[g.si], spb = 3600 / s.bpm; // 每拍帧数
        const rnd = U.seeded(1234 + g.si * 77);
        g.spb = spb; g.notes = []; g.songT = -90; g.beat = -1;
        const beats = s.bars * 4;
        for (let b = 4; b < beats - 2; b++) {
          for (let half = 0; half < 2; half++) {
            if (half && rnd() > s.dens * 0.45) continue;
            if (!half && rnd() > s.dens + 0.2) continue;
            const r = rnd();
            const lane = r < 0.4 ? 'up' : r < 0.8 ? 'down' : 'ok';
            const bomb = b > 12 && rnd() < 0.08;
            g.notes.push({ at: Math.round((b + half * 0.5) * spb), lane, bomb, hit: false, missed: false });
          }
        }
        g.songLen = Math.round(beats * spb) + 60;
      }
      buildSong();

      function music() {
        const s = SONGS[g.si];
        const b = Math.floor(g.songT / g.spb);
        if (g.songT < 0 || b === g.beat || g.songT > g.songLen - 60) return;
        g.beat = b; g.glow = 1;
        sfx.tone(110, 0.12, { type: 'sine', vol: 0.3, to: 45 });                 // kick
        if (b % 2 === 1) sfx.noise(0.08, { vol: 0.12, f: 5000, hp: true });       // snare/hat
        const root = s.key * Math.pow(2, [0, 0, -4, -2][(b >> 2) % 4] / 12);
        sfx.tone(root / 2, g.spb / 60 * 0.9, { type: 'triangle', vol: 0.08 });    // bass
        if ((b * 7) % 5 < 3) sfx.tone(root * Math.pow(2, SCALE[(b * 5 + (b >> 2)) % SCALE.length] / 12), 0.12, { type: 'square', vol: 0.035 });
      }

      function judge(lane) {
        g.slash[lane] = 10;
        let best = null, bd = 99;
        for (const n of g.notes) {
          if (n.hit || n.missed || n.lane !== lane) continue;
          const d = Math.abs(n.at - g.songT);
          if (d < bd) { bd = d; best = n; }
        }
        if (!best || bd > 12) { sfx.tone(lane === 'up' ? 1200 : lane === 'down' ? 800 : 1000, 0.06, { type: 'sawtooth', vol: 0.03, to: 400 }); return; }
        best.hit = true;
        const x = LANES[lane].x;
        if (best.bomb) {
          g.hp -= 20; g.combo = 0; show('炸弹!', '#ff3b3b');
          sfx.boom(false); fx.addShake(8); fx.flash('#ff3b3b', 0.3);
          fx.burst(x, HITY, 20, ['#666', '#ff3b3b', '#fff'], { speed: 3 });
          return;
        }
        const perfect = bd <= 4;
        g.combo++; st.maxCombo = Math.max(st.maxCombo, g.combo);
        const mul = Math.min(4, 1 + Math.floor(g.combo / 10));
        const pts = (perfect ? 300 : 120) * mul;
        st.score += pts;
        if (perfect) { st.perfect++; g.hp = Math.min(100, g.hp + 2); show('PERFECT', '#7dffb3'); }
        else show('GOOD', '#ffd23f');
        fx.burst(x, HITY, perfect ? 22 : 12, [LANES[lane].c, '#fff'], { speed: perfect ? 4 : 3 });
        if (perfect) fx.ring(x, HITY, LANES[lane].c, 26);
        sfx.tone(lane === 'up' ? 880 : lane === 'down' ? 660 : 1320, 0.07, { type: 'square', vol: 0.06 });
      }
      function show(t, c) { g.judge = { t, c }; g.judgeT = 24; }

      function update(input) {
        g.t++;
        for (const k of ['up', 'down', 'ok']) if (g.slash[k] > 0) g.slash[k]--;
        if (g.judgeT > 0) g.judgeT--;
        g.glow = Math.max(0, g.glow - 0.06);
        if (g.state === 'intro') { if (++g.stateT > 80) g.state = 'play'; g.songT++; return; }
        if (g.state === 'result') {
          if (++g.stateT > 150 || (g.stateT > 50 && input.okP)) {
            g.si++;
            if (g.si >= SONGS.length) { api.end({ clear: true, clearText: '全曲通关!' }); g.state = 'done'; return; }
            buildSong(); g.state = 'intro'; g.stateT = 0;
          }
          return;
        }
        if (g.state !== 'play') return;
        g.songT++;
        music();
        if (input.upP) judge('up');
        if (input.downP) judge('down');
        if (input.okP) judge('ok');
        for (const n of g.notes) {
          if (!n.hit && !n.missed && g.songT - n.at > 12) {
            n.missed = true;
            if (!n.bomb) { g.combo = 0; g.hp -= 8; show('MISS', '#ff6b6b'); sfx.tone(140, 0.1, { type: 'sawtooth', vol: 0.05 }); }
          }
        }
        if (g.hp <= 0) { g.state = 'done'; sfx.over(); api.end({ overText: '神经断连' }); return; }
        if (g.songT >= g.songLen) {
          st.songs++; const bonus = 2000 * (g.si + 1) + Math.round(g.hp) * 20; st.score += bonus;
          g.state = 'result'; g.stateT = 0; sfx.clear(); fx.say(SONGS[g.si].name + ' CLEAR +' + bonus, '#7dffb3', 110);
        }
      }

      function pos(n) {
        const k = 1 - (n.at - g.songT) / LEAD;        // 0 远 → 1 判定线
        const e = k * k;
        const x = VX + (LANES[n.lane].x - VX) * e;
        const y = VY + (HITY - VY) * e;
        return { x, y, s: 0.2 + 0.8 * e, k };
      }
      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#0a0418', '#1a0a30', '#06030e']); ctx.fillRect(0, 0, W, H);
        // 轨道
        ctx.strokeStyle = 'rgba(181,140,255,' + (0.25 + g.glow * 0.4) + ')';
        for (const k of ['up', 'ok', 'down']) { ctx.beginPath(); ctx.moveTo(VX, VY); ctx.lineTo(LANES[k].x + (LANES[k].x - VX) * 0.3, H); ctx.stroke(); }
        for (let i = 0; i < 8; i++) {
          const k = ((i / 8) + (g.songT / g.spb) / 8) % 1, e = k * k, y = VY + (HITY - VY) * e;
          ctx.globalAlpha = e * 0.5; ctx.fillStyle = '#b58cff'; ctx.fillRect(VX - 100 * e - 10, y, 200 * e + 20, 1);
        }
        ctx.globalAlpha = 1;
        // 判定线
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + g.glow * 0.5) + ')'; ctx.fillRect(20, HITY - 1, 200, 2);
        for (const k of ['up', 'ok', 'down']) {
          const L = LANES[k];
          ctx.strokeStyle = L.c; ctx.lineWidth = g.slash[k] ? 3 : 1.5; ctx.globalAlpha = g.slash[k] ? 1 : 0.5;
          ctx.strokeRect(L.x - 16, HITY - 12, 32, 24); ctx.globalAlpha = 1; ctx.lineWidth = 1;
          D.text(ctx, k === 'up' ? 'UP' : k === 'down' ? 'DN' : 'OK', L.x, HITY + 26, { size: 8, color: L.c, align: 'center' });
        }
        // 方块（远→近）
        const vis = g.notes.filter((n) => !n.hit && !n.missed && n.at - g.songT < LEAD && n.at - g.songT > -12).sort((a, b) => b.at - a.at);
        for (const n of vis) {
          const p = pos(n), s = 13 * p.s;
          if (n.bomb) {
            ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 7); ctx.fill();
            ctx.fillStyle = '#ff3b3b'; for (let i = 0; i < 8; i++) { const a = i * 0.785 + g.t * 0.05; ctx.fillRect(p.x + Math.cos(a) * s - 1.5, p.y + Math.sin(a) * s - 1.5, 3, 3); }
            continue;
          }
          const c = LANES[n.lane].c;
          ctx.fillStyle = c; ctx.globalAlpha = 0.3; ctx.fillRect(p.x - s - 3, p.y - s - 3, s * 2 + 6, s * 2 + 6); ctx.globalAlpha = 1;
          ctx.fillStyle = c; ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          if (n.lane === 'ok') { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.45, 0, 7); ctx.fill(); }
          else { ctx.beginPath(); const d = n.lane === 'up' ? -1 : 1; ctx.moveTo(p.x + d * s * 0.5, p.y - s * 0.5); ctx.lineTo(p.x - d * s * 0.5, p.y); ctx.lineTo(p.x + d * s * 0.5, p.y + s * 0.5); ctx.fill(); }
        }
        // 光剑挥砍
        for (const k of ['up', 'down', 'ok']) {
          if (!g.slash[k]) continue;
          const L = LANES[k], a = g.slash[k] / 10;
          ctx.strokeStyle = L.c; ctx.lineWidth = 4 * a; ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(L.x, HITY + 30, 36, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 1;
        }
        // HUD
        const s = SONGS[Math.min(g.si, SONGS.length - 1)];
        D.text(ctx, '♪ ' + s.name, 8, 16, { size: 9, color: '#b58cff' });
        D.text(ctx, U.fmt(st.score), W - 8, 16, { size: 10, color: '#fff', align: 'right' });
        D.bar(ctx, 8, 22, 224, 3, U.clamp(g.songT / g.songLen, 0, 1), '#b58cff');
        D.text(ctx, 'SYNC', 8, H - 6, { size: 7, color: '#aaa' });
        D.bar(ctx, 34, H - 11, 90, 5, g.hp / 100, g.hp < 30 ? '#ff3b3b' : '#7dffb3');
        if (g.combo > 1) D.text(ctx, g.combo + ' COMBO  x' + Math.min(4, 1 + Math.floor(g.combo / 10)), W - 8, H - 6, { size: 9, color: '#ffd23f', align: 'right' });
        if (g.judgeT > 0) { ctx.globalAlpha = Math.min(1, g.judgeT / 8); D.text(ctx, g.judge.t, W / 2, 200 - (24 - g.judgeT), { size: 14, color: g.judge.c, align: 'center', outline: '#000' }); ctx.globalAlpha = 1; }
        if (g.state === 'intro') {
          D.text(ctx, '第 ' + (g.si + 1) + ' 首', W / 2, 120, { size: 10, color: '#fff', align: 'center' });
          D.text(ctx, s.name, W / 2, 142, { size: 16, color: '#b58cff', align: 'center', outline: '#000' });
          D.text(ctx, s.bpm + ' BPM · 蓝 UP  金 OK  红 DN', W / 2, 162, { size: 9, color: '#fff', align: 'center' });
        }
      }
      return { update, draw };
    }
  });
})();
