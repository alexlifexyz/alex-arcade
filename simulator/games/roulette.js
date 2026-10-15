// simulator/games/roulette.js — 恶魔轮盘（重制）
// 霰弹心理战：每轮公布实弹 / 空包数量后打乱；你和恶魔轮流开枪，也可以打自己赌空包换额外回合
// 道具：放大镜看当前弹 · 锯子下一枪双倍 · 啤酒退一发 · 香烟回 1 血 · 手铐让恶魔跳过一回合
(function () {
  'use strict';
  const A = window.Arcade, U = A.U, D = A.D;
  const W = 240, H = 320;
  const ITEMS = {
    glass: { icon: '🔍', name: '放大镜', tip: '看当前这发' },
    saw: { icon: '🪚', name: '锯子', tip: '下一枪伤害翻倍' },
    beer: { icon: '🍺', name: '啤酒', tip: '退掉当前这发' },
    smoke: { icon: '🚬', name: '香烟', tip: '回复 1 点血' },
    cuffs: { icon: '⛓️', name: '手铐', tip: '恶魔跳过下回合' }
  };
  const KEYS = Object.keys(ITEMS);
  const DEVILS = [
    { name: '小恶魔', hp: 3, items: 1, color: '#ff6b6b', smart: 0.6 },
    { name: '双角魔', hp: 4, items: 2, color: '#c04ae0', smart: 0.8 },
    { name: '深渊庄家', hp: 5, items: 3, color: '#ff3b3b', smart: 1 }
  ];

  A.define({
    id: 'roulette',
    create(api) {
      const fx = api.fx, sfx = api.sfx, st = api.stats;
      Object.assign(st, { score: 0, wins: 0, selfBlank: 0, clear: false });
      const g = {
        t: 0, di: 0, me: { hp: 4, max: 4, items: [] }, dv: { hp: 3, max: 3, items: [] },
        shells: [], known: null, dvKnown: null, saw: false, cuffed: false, turn: 'me', sel: 0,
        msg: '', msgC: '#fff', wait: 0, next: null, anim: null, reveal: null, phase: 'intro', introT: 0
      };

      function say(m, c) { g.msg = m; g.msgC = c || '#fff'; }
      function deal(side, n) { for (let i = 0; i < n; i++) if (side.items.length < 6) side.items.push(U.pick(KEYS)); }
      function loadGun() {
        const n = U.randi(2, 8);
        const live = U.clamp(Math.round(n * U.rand(0.3, 0.6)), 1, n - 1);
        g.shells = [];
        for (let i = 0; i < n; i++) g.shells.push(i < live);
        for (let i = n - 1; i > 0; i--) { const j = U.randi(0, i); [g.shells[i], g.shells[j]] = [g.shells[j], g.shells[i]]; }
        g.known = null; g.dvKnown = null;
        g.reveal = { live, blank: n - live, t: 150 };
        deal(g.me, 2); deal(g.dv, DEVILS[g.di].items);
        say(live + ' 发实弹 · ' + (n - live) + ' 发空包', '#ffd23f');
        sfx.seq([300, 0, 300], 0.08, { type: 'square', vol: 0.08 });
      }
      function startDevil() {
        const d = DEVILS[g.di];
        g.dv = { hp: d.hp, max: d.hp, items: [] };
        g.me.hp = g.me.max; g.me.items = g.me.items.slice(0, 3);
        g.turn = 'me'; g.saw = false; g.cuffed = false; g.sel = 0;
        loadGun();
      }
      startDevil();

      const actions = () => ['shootDevil', 'shootSelf'].concat(g.me.items.map((k, i) => 'item:' + i));
      function later(frames, fn) { g.wait = frames; g.next = fn; }

      function fire(shooter, target) {
        const live = g.shells.shift();
        const dmg = g.saw ? 2 : 1;
        g.saw = false; g.known = null; g.dvKnown = null;
        g.anim = { shooter, target, live, t: 0 };
        if (live) {
          sfx.boom(true); fx.addShake(12); fx.flash('#fff', 0.7); fx.hitstop(6);
          const side = target === 'me' ? g.me : g.dv;
          side.hp = Math.max(0, side.hp - dmg);
          fx.burst(120, target === 'me' ? 250 : 80, 30, ['#ff3b3b', '#fff', '#ffd23f'], { speed: 4 });
          say(target === 'me' ? '砰！你受了 ' + dmg + ' 点伤' : '砰！恶魔受了 ' + dmg + ' 点伤', '#ff6b6b');
          if (target === 'dv' && shooter === 'me') st.score += 300 * dmg;
        } else {
          sfx.tone(1400, 0.05, { type: 'square', vol: 0.08 }); sfx.tone(900, 0.05, { type: 'square', vol: 0.06, delay: 0.06 });
          say('咔哒……空包', '#9ae6b4');
          if (shooter === 'me' && target === 'me') { st.selfBlank++; st.score += 200; }
        }
        // 决定下一回合
        later(70, () => {
          g.anim = null;
          if (g.me.hp <= 0) { g.phase = 'lost'; say('你倒下了', '#ff3b3b'); sfx.over(); later(90, () => api.end({ overText: '输给了' + DEVILS[g.di].name })); return; }
          if (g.dv.hp <= 0) {
            st.wins++; st.score += 2000 * (g.di + 1) + g.me.hp * 300;
            fx.say('击败 ' + DEVILS[g.di].name + '!', '#ffd23f', 90); sfx.clear();
            g.phase = 'won';
            later(110, () => {
              g.di++;
              if (g.di >= DEVILS.length) { st.clear = true; api.end({ clear: true, clearText: '恶魔全灭!' }); g.phase = 'done'; return; }
              g.phase = 'intro'; g.introT = 0; startDevil();
            });
            return;
          }
          if (g.shells.length === 0) loadGun();
          const extra = !live && shooter === target;
          if (shooter === 'me') {
            if (extra) g.turn = 'me';
            else if (g.cuffed) { g.cuffed = false; g.turn = 'me'; say('恶魔被铐住了，你继续', '#7cc7ff'); }
            else g.turn = 'dv';
          } else {
            g.turn = extra ? 'dv' : 'me';
          }
          g.sel = 0;
          if (g.turn === 'dv') devilThink(40);
        });
      }

      function useItem(side, idx, who) {
        const k = side.items.splice(idx, 1)[0];
        const name = ITEMS[k].name;
        sfx.pickup();
        if (k === 'glass') {
          if (who === 'me') { g.known = g.shells[0]; say('放大镜：这发是' + (g.known ? '实弹' : '空包'), g.known ? '#ff6b6b' : '#9ae6b4'); }
          else { g.dvKnown = g.shells[0]; say('恶魔用放大镜看了一眼……', '#ffd0d0'); }
        } else if (k === 'saw') { g.saw = true; say((who === 'me' ? '你' : '恶魔') + '锯短了枪管：下一枪 2 倍', '#ffd23f'); }
        else if (k === 'beer') {
          const s = g.shells.shift(); g.known = null; g.dvKnown = null;
          say((who === 'me' ? '你' : '恶魔') + '退出一发' + (s ? '实弹' : '空包'), s ? '#ff6b6b' : '#9ae6b4');
          if (g.shells.length === 0) loadGun();
        } else if (k === 'smoke') { side.hp = Math.min(side.max, side.hp + 1); say((who === 'me' ? '你' : '恶魔') + '抽了根烟 +1 血', '#7dffb3'); }
        else if (k === 'cuffs') {
          if (who === 'me') { g.cuffed = true; say('手铐：恶魔下回合动不了', '#7cc7ff'); }
          else say('恶魔把玩着手铐……没用上', '#ffd0d0');
        }
        return name;
      }

      function devilThink(delay) {
        later(delay, () => {
          const d = DEVILS[g.di], dv = g.dv;
          const live = g.shells.filter((s) => s).length, n = g.shells.length;
          const p = g.dvKnown != null ? (g.dvKnown ? 1 : 0) : live / n;
          // 先用道具
          const has = (k) => dv.items.indexOf(k);
          if (dv.hp < dv.max && has('smoke') >= 0) { useItem(dv, has('smoke'), 'dv'); return devilThink(55); }
          if (g.dvKnown == null && has('glass') >= 0 && U.chance(d.smart)) { useItem(dv, has('glass'), 'dv'); return devilThink(55); }
          if (p >= 0.99 && has('saw') >= 0 && !g.saw) { useItem(dv, has('saw'), 'dv'); return devilThink(55); }
          if (p > 0.3 && p < 0.7 && has('beer') >= 0 && U.chance(0.5 * d.smart)) { useItem(dv, has('beer'), 'dv'); return devilThink(55); }
          // 开枪
          const shootYou = p > 0.5 || (p === 0.5 && U.chance(0.6)) || (U.chance(1 - d.smart) && U.chance(0.5));
          say(DEVILS[g.di].name + (shootYou ? '把枪口对准了你……' : '把枪口对准了自己……'), '#ffd0d0');
          later(50, () => fire('dv', shootYou ? 'me' : 'dv'));
        });
      }

      function update(input) {
        g.t++;
        if (g.reveal && g.reveal.t > 0) g.reveal.t--;
        if (g.anim) g.anim.t++;
        if (g.phase === 'intro') { if (++g.introT > 90) g.phase = 'play'; return; }
        if (g.wait > 0) { if (--g.wait === 0 && g.next) { const f = g.next; g.next = null; f(); } return; }
        if (g.phase !== 'play' || g.turn !== 'me') return;
        const acts = actions();
        if (input.upP) { g.sel = (g.sel + acts.length - 1) % acts.length; sfx.move(); }
        if (input.downP) { g.sel = (g.sel + 1) % acts.length; sfx.move(); }
        g.sel = Math.min(g.sel, acts.length - 1);
        if (input.okP) {
          const a = acts[g.sel];
          if (a === 'shootDevil') { say('你把枪口对准了恶魔……'); later(30, () => fire('me', 'dv')); }
          else if (a === 'shootSelf') { say('你把枪口对准了自己……'); later(40, () => fire('me', 'me')); }
          else { useItem(g.me, +a.split(':')[1], 'me'); g.sel = 0; }
        }
      }

      function heart(ctx, x, y, on, c) {
        ctx.fillStyle = on ? c : 'rgba(255,255,255,.15)';
        ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x + 1, y - 4); ctx.lineTo(x + 3, y - 9); ctx.lineTo(x - 3, y - 1); ctx.lineTo(x, y - 1); ctx.closePath(); ctx.fill();
      }
      function draw(ctx) {
        const d = DEVILS[Math.min(g.di, 2)];
        ctx.fillStyle = D.vgrad(ctx, 0, H, ['#1a0505', '#0a0303']); ctx.fillRect(0, 0, W, H);
        // 吊灯
        ctx.fillStyle = 'rgba(255,200,120,.08)'; ctx.beginPath(); ctx.moveTo(120, 0); ctx.lineTo(20, 200); ctx.lineTo(220, 200); ctx.fill();
        // 恶魔
        const bob = Math.sin(g.t / 20) * 2, hit = g.anim && g.anim.live && g.anim.target === 'dv' && g.anim.t < 20;
        ctx.save(); ctx.translate(120 + (hit ? U.rand(-3, 3) : 0), 70 + bob);
        ctx.fillStyle = hit ? '#fff' : d.color;
        ctx.beginPath(); ctx.moveTo(-26, -18); ctx.lineTo(-34, -42); ctx.lineTo(-14, -26); ctx.fill();
        ctx.beginPath(); ctx.moveTo(26, -18); ctx.lineTo(34, -42); ctx.lineTo(14, -26); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, 30, 28, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1a0505';
        const look = g.turn === 'dv' ? 0 : Math.sin(g.t / 40) * 3;
        ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(-6, -2); ctx.lineTo(-16, 4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, -6); ctx.lineTo(6, -2); ctx.lineTo(16, 4); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-13 + look, -3, 3, 3); ctx.fillRect(10 + look, -3, 3, 3);
        ctx.fillStyle = '#1a0505'; ctx.beginPath(); ctx.moveTo(-14, 12); ctx.quadraticCurveTo(0, 22, 14, 12); ctx.quadraticCurveTo(0, 16, -14, 12); ctx.fill();
        ctx.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * 5 - 1, 13, 2, 3);
        ctx.restore();
        D.text(ctx, d.name, 120, 116, { size: 10, color: d.color, align: 'center' });
        for (let i = 0; i < g.dv.max; i++) heart(ctx, 120 - (g.dv.max - 1) * 7 + i * 14, 132, i < g.dv.hp, '#ff5a5a');
        // 恶魔道具
        g.dv.items.forEach((k, i) => D.text(ctx, ITEMS[k].icon, 20 + i * 18, 22, { size: 11 }));
        // 桌子 + 枪
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 146, W, 60);
        ctx.fillStyle = '#3a2414'; ctx.fillRect(0, 146, W, 3);
        const aim = g.anim ? (g.anim.target === 'dv' ? -1 : 1) : (g.turn === 'me' ? 0 : 0);
        ctx.save(); ctx.translate(120, 176); ctx.rotate(aim * 0.9 + Math.sin(g.t / 30) * 0.02);
        ctx.fillStyle = '#6a4a2a'; D.rrect(ctx, -46, -5, 28, 10, 3); ctx.fill();
        ctx.fillStyle = '#4a5260'; ctx.fillRect(-20, -4, g.saw ? 44 : 64, 8);
        ctx.fillStyle = '#2a2e3a'; ctx.fillRect(-20, 2, g.saw ? 44 : 64, 2);
        if (g.anim && g.anim.live && g.anim.t < 8) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(g.saw ? 26 : 46, 0, 10, 0, 7); ctx.fill(); }
        ctx.restore();
        // 弹仓（剩余发数）
        D.text(ctx, '剩 ' + g.shells.length + ' 发', 12, 162, { size: 8, color: '#c8b8a0' });
        if (g.known != null) D.text(ctx, '当前：' + (g.known ? '实弹' : '空包'), W - 10, 162, { size: 8, color: g.known ? '#ff6b6b' : '#9ae6b4', align: 'right' });
        if (g.reveal && g.reveal.t > 0) {
          const k = g.reveal;
          const total = k.live + k.blank;
          for (let i = 0; i < total; i++) {
            const x = 120 - total * 7 + i * 14 + 7;
            ctx.fillStyle = i < k.live ? '#e0342f' : '#3a7ae0'; D.rrect(ctx, x - 4, 190, 8, 14, 2); ctx.fill();
            ctx.fillStyle = '#d8b050'; ctx.fillRect(x - 4, 200, 8, 4);
          }
        }
        // 消息
        D.text(ctx, g.msg, 120, 222, { size: 10, color: g.msgC, align: 'center' });
        // 玩家区
        D.text(ctx, '你', 14, 246, { size: 10, color: '#fff' });
        for (let i = 0; i < g.me.max; i++) heart(ctx, 36 + i * 14, 246, i < g.me.hp, '#7cc7ff');
        D.text(ctx, U.fmt(st.score), W - 10, 246, { size: 9, color: '#ffd23f', align: 'right' });
        if (g.phase === 'play' && g.turn === 'me' && g.wait === 0) {
          const acts = actions();
          const label = (a) => a === 'shootDevil' ? '朝恶魔开枪' : a === 'shootSelf' ? '朝自己开枪（空包再来）' : ITEMS[g.me.items[+a.split(':')[1]]].icon + ' ' + ITEMS[g.me.items[+a.split(':')[1]]].name + ' · ' + ITEMS[g.me.items[+a.split(':')[1]]].tip;
          const start = U.clamp(g.sel - 2, 0, Math.max(0, acts.length - 4));
          acts.slice(start, start + 4).forEach((a, j) => {
            const i = start + j, y = 256 + j * 15, on = i === g.sel;
            if (on) { ctx.fillStyle = 'rgba(255,210,63,.18)'; ctx.fillRect(8, y, W - 16, 14); }
            D.text(ctx, (on ? '▶ ' : '   ') + label(a), 14, y + 11, { size: 9, color: on ? '#ffd23f' : a.startsWith('shoot') ? '#fff' : '#c8b8a0' });
          });
        } else if (g.turn === 'dv' && g.phase === 'play') D.text(ctx, '恶魔的回合……', 120, 280, { size: 10, color: '#ffd0d0', align: 'center' });
        if (g.phase === 'intro') {
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 130, W, 60);
          D.text(ctx, '第 ' + (g.di + 1) + ' 位：' + d.name, 120, 158, { size: 14, color: d.color, align: 'center' });
          D.text(ctx, '血量 ' + d.hp + ' · 看好子弹数再开枪', 120, 178, { size: 9, color: '#fff', align: 'center' });
        }
      }
      return { update, draw };
    }
  });
})();
