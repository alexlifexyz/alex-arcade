// simulator/games/runner.js — 赛博信使（重制）
// 霓虹屋顶跑酷：OK 跳（二段跳），DOWN 滑铲 / 空中急坠，UP 影刃冲刺斩无人机（斩中刷新冲刺与二段跳）
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320, S = 1.5, VW = 160, VH = 214, PX = 42;

  const RUN1 = ['...aaa....', '..abbba...', '..abcca...', '...aaa....', '..ddddd...', '.dddddde..', 'e.dddd.e..', '..ffff....', '..f..ff...', '.ff....f..', '.g.....gg.'];
  const RUN2 = ['...aaa....', '..abbba...', '..abcca...', '...aaa....', '..ddddd...', '..ddddde..', '..edddd...', '...fff....', '...ff.f...', '...f.ff...', '..gg..g...'];
  const JUMP = ['...aaa....', '..abbba...', '..abcca...', '...aaa....', 'e.ddddd.e.', '.edddddde.', '..dddd....', '..ffff....', '.ff..ff...', '.f....f...', 'gg....gg..'];
  const SLIDE = ['..........', '..........', '..........', '..........', '..........', '.....aaa..', '....abbba.', 'eddddabcca', '.ddddffaa.', 'ffffff....', 'gg....gg..'];
  const PAL = { a: '#1a1030', b: '#38e1ff', c: '#ff3bd4', d: '#2a2a4a', e: '#8a8aa8', f: '#1a1a2e', g: '#38e1ff' };
  const DRONE = ['..a.....a..', '.aaa...aaa.', '..bbbbbbb..', '.bbcccccbb.', 'bbcdddddcbb', '.bbcccccbb.', '..bb.e.bb..', '.....e.....'];
  const DPAL = { a: '#8a8aa8', b: '#3a3a5a', c: '#ff3b5a', d: '#ffd0d8', e: '#ff3b5a' };

  A.define({
    id: 'cyberrunner',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, dist: 0, kills: 0, maxChain: 0 });
      const g = { t: 0, cam: 0, speed: 2.1, blds: [], obs: [], drones: [], rain: [], hp: 3, over: false, overT: 0, chain: 0, genX: 0, bonus: 0 };
      const p = { y: 100, vy: 0, ground: true, jumps: 2, slide: 0, dash: 0, dashCool: 0, inv: 60, anim: 0, holdJ: 0 };
      const SX = (x) => (x - g.cam) * S, SY = (y) => y * S;
      for (let i = 0; i < 60; i++) g.rain.push({ x: U.rand(0, W), y: U.rand(0, H), s: U.rand(5, 9) });

      function genBuilding() {
        const last = g.blds[g.blds.length - 1];
        const diff = Math.min(1, st.dist / 3000);
        const gap = last ? U.rand(20, 34 + diff * 26) * (g.speed / 2.1) : 0;
        const x = last ? last.x + last.w + gap : -20;
        const w = last ? U.rand(110, 220) - diff * 40 : 320;
        const top = last ? U.clamp(last.top + U.rand(-26, 26), 110, 176) : 150;
        const b = { x, w, top, hue: U.pick(['#ff3bd4', '#38e1ff', '#b58cff', '#ffd23f']), win: U.randi(0, 999) };
        g.blds.push(b);
        if (!last) return;
        // 在楼顶上放障碍
        let ox = x + 40;
        while (ox < x + w - 30) {
          const r = Math.random();
          if (r < 0.28) g.obs.push({ kind: 'crate', x: ox, y: top, w: 10, h: 12 });
          else if (r < 0.46 + diff * 0.1) g.obs.push({ kind: 'laser', x: ox, y: top - 26, w: 8, h: 12 });
          else if (r < 0.7) g.drones.push({ x: ox + 20, y: top - U.rand(26, 50), baseY: 0, t: U.rand(0, 6), hp: 1 });
          ox += U.rand(60, 110) - diff * 20;
        }
      }
      while (g.blds.length < 4) genBuilding();
      p.y = g.blds[0].top - 16;

      const buildingAt = (x) => g.blds.find((b) => x >= b.x && x <= b.x + b.w);

      function hurt(why) {
        if (p.inv > 0 || p.dash > 0) return;
        g.hp--; p.inv = 90; g.chain = 0;
        sfx.hurt(); fx.addShake(7); fx.flash('#ff3b5a', 0.3); fx.hitstop(4);
        fx.floatText(SX(g.cam + PX), SY(p.y) - 10, why, '#ff8a9a', 9);
        g.speed = Math.max(2.1, g.speed * 0.85);
        if (g.hp <= 0) { g.over = true; sfx.boom(true); }
      }

      function update(input) {
        g.t++;
        if (g.over) { p.vy += 0.3; p.y += p.vy; if (++g.overT === 60) api.end({ overText: 'SIGNAL LOST' }); return; }
        g.speed = Math.min(4.2, g.speed + 0.0009);
        const move = p.dash > 0 ? g.speed * 2.4 : g.speed;
        g.cam += move;
        st.dist = Math.floor(g.cam / 4);
        st.score = st.dist * 5 + g.bonus;
        while (g.blds[g.blds.length - 1].x < g.cam + VW * 2) genBuilding();
        g.blds = g.blds.filter((b) => b.x + b.w > g.cam - 40);
        const px = g.cam + PX;

        // 冲刺
        if (p.dashCool > 0) p.dashCool--;
        if (input.upP && p.dash === 0 && p.dashCool === 0) { p.dash = 16; p.dashCool = 50; p.vy = 0; sfx.whoosh(); fx.burst(SX(px), SY(p.y + 8), 10, ['#38e1ff', '#ff3bd4', '#fff'], { speed: 2.5, angle: Math.PI, spread: 1 }); }
        if (p.dash > 0) { p.dash--; if (g.t % 2 === 0) fx.burst(SX(px - 4), SY(p.y + 8), 2, ['#38e1ff', '#ff3bd4'], { speed: 1, life: 12 }); }

        // 跳 / 滑 / 急坠
        if (input.okP && p.jumps > 0 && p.dash === 0) {
          p.vy = p.ground ? -4.6 : -4.2; p.jumps--; p.ground = false; p.slide = 0; p.holdJ = 0;
          sfx.jump(); if (p.jumps === 0) fx.ring(SX(px), SY(p.y + 14), '#38e1ff', 14);
        }
        if (input.downP) {
          if (p.ground) { p.slide = 34; sfx.noise(0.15, { vol: 0.08, f: 2500 }); }
          else if (p.dash === 0) p.vy = Math.max(p.vy, 5.5);
        }
        if (p.slide > 0) p.slide--;
        if (p.dash === 0) {
          if (input.ok && p.vy < 0 && p.holdJ < 12) { p.holdJ++; p.vy += 0.17; } else p.vy += 0.36;
          p.vy = Math.min(p.vy, 7);
        }
        const oldB = p.y + 16;
        p.y += p.dash > 0 ? 0 : p.vy;
        const b = buildingAt(px);
        if (b && p.y + 16 >= b.top && oldB <= b.top + 7 && p.vy >= 0) {
          if (!p.ground) { sfx.land(); if (p.vy > 5) fx.burst(SX(px), SY(b.top), 6, ['#38e1ff'], { speed: 1.5, angle: -Math.PI / 2, spread: 2, life: 12 }); }
          p.y = b.top - 16; p.vy = 0; p.ground = true; p.jumps = 2;
          if (g.chain > 0) g.chain = 0;
        } else if (!b || p.y + 16 < b.top - 1) p.ground = false;
        // 撞楼墙（楼比你高）
        const bf = buildingAt(px + 6);
        if (bf && bf !== b && bf.top < p.y + 12 && p.dash === 0) { p.y = bf.top - 16; p.vy = 0; hurt('撞墙!'); }
        if (p.y > VH + 20) { g.hp = 1; p.inv = 0; hurt('坠落!'); p.y = VH + 40; return; }
        if (p.inv > 0) p.inv--;
        p.anim += move;

        // 障碍
        const sliding = p.slide > 0 && p.ground;
        const box = sliding ? { x: px - 6, y: p.y + 8, w: 12, h: 8 } : { x: px - 4, y: p.y + 1, w: 8, h: 15 };
        for (const o of g.obs) {
          if (o.hit || o.x < g.cam - 20 || o.x > g.cam + VW + 20) continue;
          const ob = o.kind === 'crate' ? { x: o.x, y: o.y - o.h, w: o.w, h: o.h } : { x: o.x, y: o.y, w: o.w, h: o.h };
          if (U.hit(box, ob)) {
            if (p.dash > 0 && o.kind === 'crate') { o.hit = true; g.bonus += 100; fx.debris(SX(o.x + 5), SY(o.y - 6), ['#8a6a3a', '#5a4020', '#fff'], 10); sfx.boom(false); continue; }
            o.hit = true; hurt(o.kind === 'laser' ? '激光!' : '绊倒!');
          }
        }
        // 无人机
        for (const d of g.drones) {
          if (d.dead) continue;
          d.t += 0.06; if (!d.baseY) d.baseY = d.y; d.y = d.baseY + Math.sin(d.t) * 6;
          if (d.x < g.cam - 20) { d.dead = true; continue; }
          const dx = d.x - px, dy = d.y - (p.y + 8);
          if (Math.abs(dx) < (p.dash > 0 ? 14 : 8) && Math.abs(dy) < (p.dash > 0 ? 14 : 9)) {
            if (p.dash > 0 || (p.vy > 1 && dy > 2)) {
              d.dead = true; st.kills++; g.chain++; st.maxChain = Math.max(st.maxChain, g.chain);
              const pts = 200 * g.chain; g.bonus += pts;
              p.dashCool = 0; p.jumps = 2; if (p.dash === 0) p.vy = -3.5;
              fx.burst(SX(d.x), SY(d.y), 18, ['#ff3b5a', '#fff', '#ffd23f'], { speed: 3 });
              fx.floatText(SX(d.x), SY(d.y) - 12, (g.chain > 1 ? '连斩x' + g.chain + ' ' : '') + '+' + pts, '#ff3bd4', 9);
              sfx.combo(g.chain + 3); fx.hitstop(3); fx.addShake(3);
            } else if (p.inv <= 0) { d.dead = true; hurt('无人机!'); }
          }
        }
        g.obs = g.obs.filter((o) => o.x > g.cam - 30);
        g.drones = g.drones.filter((d) => !d.dead);
        for (const r of g.rain) { r.y += r.s; r.x -= 1.5; if (r.y > H) { r.y = -10; r.x = U.rand(0, W + 40); } }
      }

      function draw(ctx) {
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#0a0418', '#2a0e3a', '#5a1a4a']); ctx.fillRect(0, 0, W, H);
        // 月亮
        ctx.fillStyle = '#ffd0f0'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(190, 60, 18, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        // 远景楼群
        for (let layer = 0; layer < 2; layer++) {
          const par = layer ? 0.35 : 0.15, base = layer ? 250 : 220;
          const col = layer ? '#1a0a2e' : '#24103e';
          for (let i = -1; i < 14; i++) {
            const seed = Math.floor(g.cam * par / 22) + i;
            const x = i * 22 - U.wrap(g.cam * par, 22);
            const h = 60 + ((seed * 37) % 7) * 18 + layer * 20;
            ctx.fillStyle = col; ctx.fillRect(x, base - h, 20, h + 80);
            ctx.fillStyle = layer ? 'rgba(56,225,255,.35)' : 'rgba(255,59,212,.25)';
            for (let wy = base - h + 6; wy < base; wy += 10) if (((seed + wy) * 13) % 5 < 2) ctx.fillRect(x + 4 + ((wy * 7) % 10), wy, 3, 4);
          }
        }
        // 雨
        ctx.strokeStyle = 'rgba(180,200,255,.18)';
        for (const r of g.rain) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 3, r.y + 7); ctx.stroke(); }

        ctx.save(); ctx.scale(S, S);
        for (const b of g.blds) {
          const x = b.x - g.cam; if (x > VW || x + b.w < 0) continue;
          ctx.fillStyle = '#0e0a1a'; ctx.fillRect(x, b.top, b.w, VH - b.top);
          ctx.fillStyle = b.hue; ctx.fillRect(x, b.top, b.w, 1.5);
          ctx.globalAlpha = 0.5; ctx.fillRect(x, b.top, 1, VH - b.top); ctx.fillRect(x + b.w - 1, b.top, 1, VH - b.top); ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          for (let wy = b.top + 10; wy < VH; wy += 14) for (let wx = x + 6; wx < x + b.w - 6; wx += 12) if (((wx - x + b.win) * 7 + wy) % 5 < 2) ctx.fillRect(wx, wy, 5, 6);
          // 招牌
          if (b.w > 150) { ctx.fillStyle = b.hue; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(g.t / 10 + b.win); ctx.fillRect(x + 20, b.top + 14, 30, 10); ctx.globalAlpha = 1; }
        }
        for (const o of g.obs) {
          if (o.hit) continue;
          const x = o.x - g.cam; if (x < -20 || x > VW + 20) continue;
          if (o.kind === 'crate') { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x, o.y - o.h, o.w, o.h); ctx.strokeStyle = '#ffd23f'; ctx.strokeRect(x + 0.5, o.y - o.h + 0.5, o.w - 1, o.h - 1); ctx.beginPath(); ctx.moveTo(x, o.y - o.h); ctx.lineTo(x + o.w, o.y); ctx.stroke(); }
          else {
            ctx.fillStyle = '#555'; ctx.fillRect(x, o.y - 4, 2, 30); ctx.fillRect(x + o.w - 2, o.y - 4, 2, 30);
            ctx.fillStyle = (g.t >> 2) % 2 ? '#ff3b5a' : '#ff8a9a'; ctx.fillRect(x, o.y + 2, o.w, 2); ctx.fillRect(x, o.y + 7, o.w, 2);
            ctx.globalAlpha = 0.3; ctx.fillRect(x - 2, o.y, o.w + 4, 11); ctx.globalAlpha = 1;
          }
        }
        for (const d of g.drones) D.sprite(ctx, DRONE, DPAL, d.x - g.cam, d.y, { center: true });
        // 玩家
        if (!(p.inv > 0 && (g.t >> 2) % 2) || g.over) {
          const fr = p.slide > 0 && p.ground ? SLIDE : !p.ground ? JUMP : (p.anim >> 3) % 2 ? RUN1 : RUN2;
          if (p.dash > 0) { ctx.globalAlpha = 0.35; D.sprite(ctx, fr, PAL, PX - 14, p.y + 5, {}); D.sprite(ctx, fr, PAL, PX - 9, p.y + 5, {}); ctx.globalAlpha = 1; }
          D.sprite(ctx, fr, PAL, PX - 5, p.y + 5, {});
          if (p.dash > 0) { ctx.strokeStyle = '#38e1ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(PX - 4, p.y + 9); ctx.lineTo(PX + 16, p.y + 9); ctx.stroke(); ctx.lineWidth = 1; }
        }
        ctx.restore();
        // HUD
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, 20);
        D.text(ctx, U.fmt(st.score), 6, 14, { size: 10, color: '#fff' });
        D.text(ctx, st.dist + 'm', W / 2, 14, { size: 9, color: '#38e1ff', align: 'center' });
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < g.hp ? '#ff3bd4' : 'rgba(255,255,255,.2)'; ctx.fillRect(W - 12 - i * 10, 6, 7, 8); }
        D.text(ctx, '影刃', 6, H - 10, { size: 8, color: '#38e1ff' });
        D.bar(ctx, 30, H - 16, 50, 5, p.dashCool > 0 ? 1 - p.dashCool / 50 : 1, p.dashCool > 0 ? '#5a6a8a' : '#38e1ff');
        D.text(ctx, '跳 ' + '●'.repeat(p.jumps) + '○'.repeat(2 - p.jumps), W - 6, H - 10, { size: 8, color: '#fff', align: 'right' });
        if (g.chain > 1) D.text(ctx, '连斩 x' + g.chain, W / 2, 40, { size: 12, color: '#ff3bd4', align: 'center', outline: '#000' });
        if (g.t > 0 && g.t < 240) D.text(ctx, 'UP 冲刺斩无人机 · DOWN 滑过激光', W / 2, 90, { size: 9, color: '#fff', align: 'center', outline: '#000' });
      }
      return { update, draw };
    }
  });
})();
