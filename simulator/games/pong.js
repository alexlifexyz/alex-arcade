// simulator/games/pong.js — 变异乒乓（重制）
// 竖版对战：UP/DOWN 移拍，球到拍前按 OK 扣杀；中场变异方块改变球；七分一局，连胜三个对手通关
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, PY = 292, AY = 30, TOP = 20, BOT = 310;
  const FOES = [
    { name: '海绵小白', color: '#7cc7ff', speed: 1.7, err: 26, smash: 0.05 },
    { name: '螃蟹教练', color: '#ff8a5a', speed: 2.3, err: 16, smash: 0.15 },
    { name: '章鱼大王', color: '#b58cff', speed: 3.0, err: 8, smash: 0.3 }
  ];
  const MUT = [
    { k: 'big', icon: '⬤', name: '巨球', c: '#ffd23f' },
    { k: 'split', icon: '⁂', name: '分裂', c: '#7dffb3' },
    { k: 'curve', icon: '↻', name: '香蕉球', c: '#ff8fc7' },
    { k: 'fast', icon: '⚡', name: '光速', c: '#38e1ff' },
    { k: 'shrink', icon: '↔', name: '缩拍', c: '#ff5a5a' }
  ];

  A.define({
    id: 'pong',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, wins: 0, perfect: 0 });
      const g = { t: 0, foe: 0, me: 0, them: 0, serveT: 60, server: 1, balls: [], block: null, blockT: 120, shrinkMe: 0, shrinkThem: 0, armed: 0, msgT: 0, match: 'play', matchT: 0, trail: [] };
      const pad = { x: 120, w: 46, vx: 0 };
      const ai = { x: 120, w: 46, target: 120, react: 0 };

      function serve() {
        g.balls = [{ x: 120, y: g.server > 0 ? PY - 12 : AY + 12, vx: U.rand(-1.2, 1.2), vy: g.server > 0 ? -2.6 : 2.6, r: 3.5, spin: 0, last: g.server > 0 ? 'me' : 'ai', sp: 2.9 }];
        sfx.beep(880);
      }
      function pointTo(who) {
        if (who === 'me') { g.me++; st.score += 300; fx.say('得分!', '#7dffb3', 50); sfx.pickup(); }
        else { g.them++; fx.say('失分', '#ff6b6b', 50); sfx.hurt(); fx.addShake(5); }
        g.balls = []; g.serveT = 70; g.server = who === 'me' ? -1 : 1;
        if (g.me >= 7 || g.them >= 7) {
          g.match = g.me >= 7 ? 'win' : 'lose'; g.matchT = 0;
          if (g.me >= 7) { st.wins++; st.score += 2000 * (g.foe + 1); sfx.clear(); fx.burst(120, 160, 50, ['#ffd23f', '#7dffb3', '#fff', FOES[g.foe].color], { speed: 5, gravity: 0.08, life: 60 }); }
          else sfx.over();
        }
      }
      function hitBy(b, who, px, pw, smash) {
        const off = U.clamp((b.x - px) / (pw / 2), -1, 1);
        b.sp = Math.min(6.5, b.sp + 0.18);
        let spd = b.sp * (smash ? (smash === 2 ? 1.75 : 1.45) : 1);
        const ang = off * 1.0;
        b.vx = Math.sin(ang) * spd;
        b.vy = (who === 'me' ? -1 : 1) * Math.cos(ang) * spd;
        b.last = who;
        if (b.curve) b.spin = (Math.random() < 0.5 ? -1 : 1) * 0.06;
        if (smash) {
          fx.burst(b.x, b.y, smash === 2 ? 22 : 12, ['#fff', '#ffd23f', '#38e1ff'], { speed: 3.5 });
          fx.addShake(smash === 2 ? 6 : 3); fx.hitstop(smash === 2 ? 5 : 2);
          sfx.tone(smash === 2 ? 1400 : 1000, 0.1, { type: 'square', vol: 0.09, to: 300 });
          if (who === 'me') { const pts = smash === 2 ? 150 : 60; st.score += pts; fx.floatText(b.x, b.y - 12, smash === 2 ? '完美扣杀 +' + pts : '扣杀 +' + pts, '#ffd23f', 9); if (smash === 2) st.perfect++; }
        } else sfx.tone(who === 'me' ? 520 : 440, 0.05, { type: 'square', vol: 0.07 });
      }
      function mutate(b, m) {
        fx.ring(g.block.x, g.block.y, m.c, 30); fx.say(m.name + '!', m.c, 50); sfx.power();
        if (m.k === 'big') b.r = 7;
        else if (m.k === 'split') g.balls.push({ x: b.x, y: b.y, vx: -b.vx + U.rand(-0.5, 0.5), vy: b.vy, r: b.r, spin: 0, last: b.last, sp: b.sp });
        else if (m.k === 'curve') { b.curve = true; b.spin = (U.chance(0.5) ? -1 : 1) * 0.06; }
        else if (m.k === 'fast') { b.vx *= 1.45; b.vy *= 1.45; }
        else if (m.k === 'shrink') { if (b.last === 'me') g.shrinkThem = 600; else g.shrinkMe = 600; }
        g.block = null; g.blockT = U.randi(200, 360);
      }

      function update(input) {
        g.t++;
        if (g.match !== 'play') {
          if (++g.matchT > 150 || (g.matchT > 50 && input.okP)) {
            if (g.match === 'lose') { api.end({ overText: '输给了' + FOES[g.foe].name }); g.match = 'done'; return; }
            if (g.match === 'win') {
              g.foe++;
              if (g.foe >= FOES.length) { api.end({ clear: true, clearText: '乒乓之王!' }); g.match = 'done'; return; }
              g.me = 0; g.them = 0; g.match = 'play'; g.serveT = 90; g.server = 1; g.shrinkMe = g.shrinkThem = 0; g.block = null;
              fx.say('对手：' + FOES[g.foe].name, FOES[g.foe].color, 90);
            }
          }
          return;
        }
        const F = FOES[g.foe];
        // 玩家球拍
        const dir = (input.up ? -1 : 0) + (input.down ? 1 : 0);
        pad.vx = U.approach(pad.vx, dir * 4.2, 0.7);
        pad.w = g.shrinkMe > 0 ? 28 : 46;
        pad.x = U.clamp(pad.x + pad.vx, pad.w / 2 + 4, W - pad.w / 2 - 4);
        if (input.okP) g.armed = 14;
        if (g.armed > 0) g.armed--;
        if (g.shrinkMe > 0) g.shrinkMe--;
        if (g.shrinkThem > 0) g.shrinkThem--;
        ai.w = g.shrinkThem > 0 ? 28 : 46;

        if (g.serveT > 0) { if (--g.serveT === 0) serve(); }

        // AI：追最近的来球
        let tb = null;
        for (const b of g.balls) if (b.vy < 0 && (!tb || b.y < tb.y)) tb = b;
        if (--ai.react <= 0) {
          ai.react = 8;
          if (tb) {
            const tt = (tb.y - AY) / -tb.vy;
            let px = tb.x + tb.vx * tt;
            while (px < 0 || px > W) px = px < 0 ? -px : 2 * W - px;
            ai.target = px + U.rand(-F.err, F.err);
          } else ai.target = 120;
        }
        ai.x = U.clamp(U.approach(ai.x, ai.target, F.speed), ai.w / 2 + 4, W - ai.w / 2 - 4);

        // 变异方块
        if (!g.block && g.balls.length && --g.blockT <= 0) g.block = { x: U.rand(40, 200), y: U.rand(130, 190), m: U.pick(MUT), t: 0 };
        if (g.block) g.block.t++;

        for (const b of g.balls) {
          if (b.curve) b.vx += b.spin;
          b.x += b.vx; b.y += b.vy;
          if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.tick(); }
          if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx.tick(); }
          if (g.block && Math.abs(b.x - g.block.x) < 9 + b.r && Math.abs(b.y - g.block.y) < 9 + b.r) mutate(b, g.block.m);
          // 玩家接球
          if (b.vy > 0 && b.y + b.r >= PY - 3 && b.y < PY + 6 && Math.abs(b.x - pad.x) < pad.w / 2 + b.r) {
            b.y = PY - 3 - b.r;
            const perfect = g.armed > 0 && g.armed >= 8;
            hitBy(b, 'me', pad.x, pad.w, g.armed > 0 ? (perfect ? 2 : 1) : 0);
            g.armed = 0;
          }
          if (b.vy < 0 && b.y - b.r <= AY + 3 && b.y > AY - 6 && Math.abs(b.x - ai.x) < ai.w / 2 + b.r) {
            b.y = AY + 3 + b.r;
            hitBy(b, 'ai', ai.x, ai.w, U.chance(F.smash) ? 1 : 0);
          }
          if (b.y > BOT) b.out = 'ai';
          if (b.y < TOP) b.out = 'me';
        }
        g.trail.push(g.balls.map((b) => ({ x: b.x, y: b.y, r: b.r })));
        if (g.trail.length > 6) g.trail.shift();
        const out = g.balls.find((b) => b.out);
        if (out) {
          g.balls = g.balls.filter((b) => !b.out);
          if (g.balls.length === 0) pointTo(out.out);
        }
      }

      function paddle(ctx, x, y, w, c) {
        ctx.fillStyle = 'rgba(0,0,0,.3)'; D.rrect(ctx, x - w / 2 + 2, y + 2, w, 6, 3); ctx.fill();
        ctx.fillStyle = c; D.rrect(ctx, x - w / 2, y, w, 6, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x - w / 2 + 3, y + 1, w - 6, 1);
      }
      function draw(ctx) {
        const F = FOES[Math.min(g.foe, 2)];
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#0b3a2a', '#0f5a3a', '#0b3a2a']); ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.strokeRect(6, TOP, W - 12, BOT - TOP); ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(6, 165); ctx.lineTo(W - 6, 165); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(120, TOP); ctx.lineTo(120, BOT); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
        // 比分
        D.text(ctx, String(g.them), W - 14, 150, { size: 26, color: 'rgba(255,255,255,.25)', align: 'right' });
        D.text(ctx, String(g.me), W - 14, 200, { size: 26, color: 'rgba(255,255,255,.25)', align: 'right' });
        // 变异块
        if (g.block) {
          const b = g.block, s = 9 + Math.sin(b.t / 6);
          ctx.fillStyle = b.m.c; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(b.x, b.y, s + 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          D.panel(ctx, b.x - s, b.y - s, s * 2, s * 2, { r: 4, fill: b.m.c, stroke: '#fff', lw: 1 });
          D.text(ctx, b.m.icon, b.x, b.y + 4, { size: 11, color: '#111', align: 'center' });
        }
        // 扣杀提示区
        const near = g.balls.some((b) => b.vy > 0 && b.y > PY - 40 && b.y < PY);
        if (near) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(pad.x, PY, pad.w / 2 + 6, Math.PI, 0); ctx.stroke(); }
        // 球
        g.trail.forEach((tr, i) => tr.forEach((b) => { ctx.fillStyle = 'rgba(255,255,255,' + (i / 20) + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }));
        for (const b of g.balls) {
          ctx.fillStyle = b.curve ? '#ff8fc7' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(b.x + 1, b.y + 1, b.r * 0.5, 0, 7); ctx.fill();
        }
        paddle(ctx, ai.x, AY - 3, ai.w, F.color);
        paddle(ctx, pad.x, PY - 3, pad.w, g.armed > 0 ? '#ffd23f' : '#f3ece0');
        // HUD
        D.text(ctx, F.name, 10, 13, { size: 9, color: F.color });
        D.text(ctx, '第 ' + (g.foe + 1) + '/3 位对手', W - 8, 13, { size: 8, color: '#fff', align: 'right' });
        D.text(ctx, U.fmt(st.score), 10, H - 1, { size: 8, color: '#fff' });
        if (g.serveT > 0 && g.match === 'play') D.text(ctx, g.server > 0 ? '你发球' : '对手发球', 120, 170, { size: 10, color: '#fff', align: 'center', outline: '#000' });
        if (g.match === 'win' || g.match === 'lose') {
          D.panel(ctx, 30, 120, 180, 80, {});
          D.text(ctx, g.match === 'win' ? '胜利! ' + g.me + ' : ' + g.them : '惜败 ' + g.me + ' : ' + g.them, 120, 152, { size: 14, color: g.match === 'win' ? '#7dffb3' : '#ff6b6b', align: 'center' });
          D.text(ctx, g.match === 'win' ? (g.foe < 2 ? '下一位：' + FOES[g.foe + 1].name : '三连胜！') : '再接再厉', 120, 176, { size: 10, color: '#fff', align: 'center' });
        }
        if (g.t > 0 && g.t < 200) D.text(ctx, '球到拍前按 OK = 扣杀', 120, 250, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
