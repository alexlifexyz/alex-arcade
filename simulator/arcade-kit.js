// simulator/arcade-kit.js — Alex Arcade 统一引擎
// 60Hz 固定步长 · 三键输入 · 合成音效 · 粒子/震屏/顿帧 · 存档/任务/星星 · 标题/暂停/结算壳层
// 依赖：games-engine.js（旧 SoundEngine / FXEngine / GAME_REGISTRY，供旧玩法兼容）
(function (G) {
  'use strict';

  const W = 240, H = 320, STEP = 1000 / 60;

  // ---------------------------------------------------------------- utils
  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    approach: (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s)),
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    hit: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    circ: (ax, ay, ar, bx, by, br) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by) < (ar + br) * (ar + br),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    wrap: (v, n) => ((v % n) + n) % n,
    seeded(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    dayIndex: () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000),
    fmt: (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  };

  // ---------------------------------------------------------------- save
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  const Save = {
    best: (id) => +LS.get('aa_hs_' + id, 0) || 0,
    setBest(id, s) { if (s > Save.best(id)) { LS.set('aa_hs_' + id, String(Math.floor(s))); return true; } return false; },
    top(id) { try { return JSON.parse(LS.get('aa_top_' + id, '[]')) || []; } catch (e) { return []; } },
    pushTop(id, s) {
      if (!(s > 0)) return -1;
      const list = Save.top(id);
      const entry = { s: Math.floor(s), d: Date.now() };
      list.push(entry);
      list.sort((a, b) => b.s - a.s);
      const cut = list.slice(0, 5);
      LS.set('aa_top_' + id, JSON.stringify(cut));
      return cut.indexOf(entry);
    },
    plays: (id) => +LS.get('aa_pl_' + id, 0) || 0,
    addPlay(id) { LS.set('aa_pl_' + id, String(Save.plays(id) + 1)); },
    mask: (id) => +LS.get('aa_ms_' + id, 0) || 0,
    hasMission: (id, i) => !!(Save.mask(id) & (1 << i)),
    setMission(id, i) { LS.set('aa_ms_' + id, String(Save.mask(id) | (1 << i))); },
    stars(id) { let m = Save.mask(id), n = 0; while (m) { n += m & 1; m >>= 1; } return n; },
    totalStars(ids) { return ids.reduce((s, id) => s + Save.stars(id), 0); },
    last: () => LS.get('aa_last', ''),
    setLast(id) { LS.set('aa_last', id); },
    muted: () => LS.get('aa_mute', '0') === '1',
    setMuted(m) { LS.set('aa_mute', m ? '1' : '0'); },
    daily() { try { return JSON.parse(LS.get('aa_daily', '{}')) || {}; } catch (e) { return {}; } },
    setDaily(o) { LS.set('aa_daily', JSON.stringify(o)); },
    migrate() {
      // 旧 hub.html 用 ft_hs_ 前缀写高分，统一迁移到 aa_hs_
      if (LS.get('aa_migrated', '') === '1') return;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('ft_hs_') === 0) {
            const id = k.slice(6), v = +localStorage.getItem(k) || 0;
            if (v > Save.best(id)) LS.set('aa_hs_' + id, String(v));
          }
        }
      } catch (e) { /* ignore */ }
      LS.set('aa_migrated', '1');
    }
  };

  // ---------------------------------------------------------------- sound
  const Base = G.SoundEngine || class { constructor() { this.ctx = null; this.muted = false; } init() {} };
  class Sfx extends Base {
    constructor() { super(); this.master = null; }
    init() {
      if (this.muted) return;
      if (!this.ctx) {
        const AC = G.AudioContext || G.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.55;
          const comp = this.ctx.createDynamicsCompressor();
          this.master.connect(comp); comp.connect(this.ctx.destination);
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    _out() { return this.master || (this.ctx && this.ctx.destination); }
    tone(f, dur, o) {
      o = o || {};
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime + (o.delay || 0);
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
      const v = o.vol == null ? 0.12 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(g); g.connect(this._out());
      osc.start(t); osc.stop(t + dur + 0.03);
    }
    noise(dur, o) {
      o = o || {};
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime + (o.delay || 0);
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = o.hp ? 'highpass' : 'lowpass';
      f.frequency.setValueAtTime(o.f || 1800, t);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(o.vol == null ? 0.25 : o.vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this._out());
      src.start(t);
    }
    seq(notes, step, o) {
      notes.forEach((f, i) => { if (f) this.tone(f, (o && o.len) || step * 0.9, Object.assign({}, o, { delay: i * step })); });
    }
    // 统一命名音效
    move() { this.tone(660, 0.04, { type: 'square', vol: 0.05 }); }
    select() { this.tone(520, 0.05, { vol: 0.07 }); this.tone(1040, 0.08, { vol: 0.06, delay: 0.04 }); }
    start() { this.seq([523, 659, 784, 1047], 0.07, { type: 'square', vol: 0.08 }); }
    go() { this.tone(784, 0.1, { vol: 0.09 }); this.tone(1568, 0.18, { vol: 0.07, delay: 0.08 }); }
    over() { this.seq([392, 330, 262, 196], 0.12, { type: 'triangle', vol: 0.14 }); }
    clear() { this.seq([523, 659, 784, 1047, 784, 1047, 1319], 0.08, { type: 'square', vol: 0.08 }); }
    record() { this.seq([784, 988, 1175, 1568], 0.06, { type: 'square', vol: 0.08 }); }
    star() { this.seq([1319, 1760, 2093], 0.05, { type: 'triangle', vol: 0.1 }); }
    combo(n) { const f = 440 * Math.pow(2, Math.min(n, 18) / 12); this.tone(f, 0.08, { type: 'square', vol: 0.07 }); this.tone(f * 1.5, 0.07, { type: 'triangle', vol: 0.05, delay: 0.03 }); }
    pickup() { this.tone(880, 0.05, { type: 'square', vol: 0.07 }); this.tone(1320, 0.09, { type: 'square', vol: 0.06, delay: 0.05 }); }
    power() { this.seq([392, 523, 659, 784, 1047], 0.045, { type: 'square', vol: 0.07 }); }
    hurt() { this.tone(220, 0.18, { type: 'sawtooth', vol: 0.13, to: 70 }); this.noise(0.12, { vol: 0.15, f: 900 }); }
    boom(big) { this.noise(big ? 0.55 : 0.22, { vol: big ? 0.5 : 0.28, f: big ? 700 : 1300, to: 60 }); if (big) this.tone(90, 0.4, { type: 'sine', vol: 0.3, to: 35 }); }
    pew(p) { const f = 900 * (p || 1); this.tone(f, 0.06, { type: 'square', vol: 0.035, to: f * 0.45 }); }
    jump() { this.tone(260, 0.12, { type: 'square', vol: 0.07, to: 640 }); }
    land() { this.noise(0.05, { vol: 0.08, f: 500 }); }
    coin() { this.tone(988, 0.05, { type: 'square', vol: 0.06 }); this.tone(1319, 0.12, { type: 'square', vol: 0.06, delay: 0.05 }); }
    tick() { this.tone(1200, 0.02, { type: 'square', vol: 0.03 }); }
    whoosh() { this.noise(0.18, { vol: 0.12, f: 3000, to: 400, hp: false }); }
    thud() { this.tone(120, 0.1, { type: 'sine', vol: 0.2, to: 50 }); }
    beep(f) { this.tone(f || 880, 0.06, { vol: 0.06 }); }
  }

  // ---------------------------------------------------------------- fx
  class FX {
    constructor() { this.reset(); }
    reset() {
      this.particles = []; this.floats = []; this.rings = [];
      this.shake = 0; this.stop = 0; this.flashA = 0; this.flashC = '#fff'; this.banner = null;
    }
    addShake(v) { this.shake = Math.max(this.shake, v); }
    hitstop(f) { this.stop = Math.max(this.stop, f); }
    flash(c, a) { this.flashC = c || '#fff'; this.flashA = a == null ? 0.6 : a; }
    burst(x, y, count, colors, o) {
      count = count || 12; colors = colors || ['#00e5ff', '#ff0055', '#ffd700']; o = o || {};
      const sp = o.speed || 3.2;
      if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 400);
      for (let i = 0; i < count; i++) {
        const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2;
        const s = (0.35 + Math.random() * 0.65) * sp;
        const life = (o.life || 26) * (0.6 + Math.random() * 0.6);
        this.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: o.gravity || 0, drag: o.drag || 0.94,
          life, maxLife: life, size: (o.size || 3) * (0.6 + Math.random() * 0.7), color: colors[i % colors.length]
        });
      }
    }
    spark(x, y, color, n) { this.burst(x, y, n || 6, [color || '#fff'], { speed: 2, life: 14, size: 2 }); }
    debris(x, y, colors, n) { this.burst(x, y, n || 10, colors, { speed: 3.5, gravity: 0.18, life: 40, size: 3, drag: 0.98 }); }
    ring(x, y, color, r) { this.rings.push({ x, y, color: color || '#fff', r: 2, max: r || 30, life: 18, maxLife: 18 }); }
    floatText(x, y, text, color, size) { this.floats.push({ x, y, text: String(text), color: color || '#ffd700', life: 42, maxLife: 42, vy: -0.7, size: size || 8 }); }
    float(x, y, t, c) { this.floatText(x, y, t, c); }
    text(x, y, t, c) { this.floatText(x, y, t, c); }
    say(text, color, frames) { this.banner = { text, color: color || '#ffd928', life: frames || 70, maxLife: frames || 70 }; }
    update() {
      if (this.shake > 0) { this.shake *= 0.86; if (this.shake < 0.25) this.shake = 0; }
      if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.06);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy;
        if (--p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i]; f.y += f.vy; f.vy *= 0.97;
        if (--f.life <= 0) this.floats.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.r += (r.max - r.r) * 0.2;
        if (--r.life <= 0) this.rings.splice(i, 1);
      }
      if (this.banner && --this.banner.life <= 0) this.banner = null;
    }
    render(ctx) {
      for (const r of this.rings) {
        ctx.globalAlpha = r.life / r.maxLife; ctx.strokeStyle = r.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      }
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife * 1.4));
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + 0.6 * p.life / p.maxLife);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      for (const f of this.floats) {
        const a = Math.min(1, f.life / 14);
        ctx.globalAlpha = a;
        D.text(ctx, f.text, f.x, f.y, { size: f.size, color: f.color, align: 'center', outline: '#000' });
      }
      ctx.globalAlpha = 1;
    }
    renderOverlay(ctx) {
      if (this.flashA > 0) { ctx.globalAlpha = this.flashA; ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (this.banner) {
        const b = this.banner, t = 1 - b.life / b.maxLife;
        const sc = t < 0.15 ? U.outBack(t / 0.15) : 1;
        const a = b.life < 12 ? b.life / 12 : 1;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 120); ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-W / 2, -16, W, 30);
        D.text(ctx, b.text, 0, 5, { size: 16, color: b.color, align: 'center', outline: '#000', bold: true });
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- draw
  const PIX = '"Silkscreen", "Zpix", "Courier New", monospace';
  const CJK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const hasCJK = (s) => /[　-鿿＀-￯]/.test(s);
  const D = {
    font(size, bold, s) { return (bold ? 'bold ' : '') + size + 'px ' + (s && hasCJK(s) ? CJK : PIX + ', ' + CJK); },
    text(ctx, s, x, y, o) {
      o = o || {}; s = String(s);
      ctx.font = D.font(o.size || 8, o.bold !== false, s);
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.base || 'alphabetic';
      if (o.outline) { ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.outline; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.lineWidth = 1; }
      if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(s, x + 1, y + 1); }
      ctx.fillStyle = o.color || '#fff';
      ctx.fillText(s, x, y);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    },
    measure(ctx, s, size, bold) { ctx.font = D.font(size || 8, bold !== false, s); return ctx.measureText(s).width; },
    rrect(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    },
    panel(ctx, x, y, w, h, o) {
      o = o || {};
      D.rrect(ctx, x, y, w, h, o.r == null ? 6 : o.r);
      ctx.fillStyle = o.fill || 'rgba(10,8,14,.86)'; ctx.fill();
      if (o.stroke !== false) { ctx.strokeStyle = o.stroke || 'rgba(240,193,75,.8)'; ctx.lineWidth = o.lw || 1.5; ctx.stroke(); ctx.lineWidth = 1; }
    },
    bar(ctx, x, y, w, h, t, fg, bg) {
      ctx.fillStyle = bg || 'rgba(255,255,255,.15)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = fg || '#7dffb3'; ctx.fillRect(x, y, Math.max(0, Math.min(1, t)) * w, h);
    },
    // 像素精灵：rows = ['..aa..', ...]，pal = {a:'#f00'}；缓存到离屏画布
    _cache: new Map(),
    img(rows, pal, flip, tint) {
      const key = rows.join('|') + JSON.stringify(pal) + (flip ? 'f' : '') + (tint || '');
      let c = D._cache.get(key);
      if (!c) {
        const w = rows[0].length, h = rows.length, R = 6; // 离屏 6 倍，缩放显示仍然锐利
        c = document.createElement('canvas'); c.width = w * R; c.height = h * R;
        const g = c.getContext('2d');
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const ch = rows[j][flip ? w - 1 - i : i];
          if (ch === '.' || ch === ' ' || !pal[ch]) continue;
          g.fillStyle = tint || pal[ch];
          g.fillRect(i * R, j * R, R, R);
        }
        c._w = w; c._h = h;
        D._cache.set(key, c);
        if (D._cache.size > 800) D._cache.delete(D._cache.keys().next().value);
      }
      return c;
    },
    sprite(ctx, rows, pal, x, y, o) {
      o = o || {};
      const c = D.img(rows, pal, o.flip, o.tint);
      const w = c._w * (o.scale || 1), h = c._h * (o.scale || 1);
      ctx.drawImage(c, o.center ? x - w / 2 : x, o.center ? y - h / 2 : (o.bottom ? y - h : y), w, h);
    },
    keycap(ctx, x, y, label, color) {
      D.panel(ctx, x, y, 34, 14, { r: 3, fill: color || '#2a2230', stroke: 'rgba(255,255,255,.35)', lw: 1 });
      D.text(ctx, label, x + 17, y + 10, { size: 8, color: '#fff', align: 'center' });
    },
    star(ctx, cx, cy, r, fill, stroke) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    },
    vgrad(ctx, y0, y1, stops) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      return g;
    }
  };

  // ---------------------------------------------------------------- input
  class Input {
    constructor() {
      this.raw = { up: false, down: false, ok: false };
      this.prev = { up: false, down: false, ok: false };
      this.up = this.down = this.ok = false;
      this.upP = this.downP = this.okP = false;
      this.upR = this.downR = this.okR = false;
      this.upT = this.downT = this.okT = 0;
      this.okTap = false; this.okDouble = false;
      this._lastOkTap = -99; this._frame = 0; this._okHeld = 0;
      this._queue = { up: 0, down: 0, ok: 0 }; // 短于一帧的点按也不丢
      this.locked = false;
    }
    set(k, v) {
      if (v && !this.raw[k]) this._queue[k]++;
      this.raw[k] = v;
    }
    step() {
      this._frame++;
      for (const k of ['up', 'down', 'ok']) {
        const down = this.raw[k] || this._queue[k] > 0;
        const was = this.prev[k];
        this[k] = down && !this.locked;
        this[k + 'P'] = !!(down && !was) && !this.locked;
        this[k + 'R'] = !!(!down && was) && !this.locked;
        this[k + 'T'] = down ? this[k + 'T'] + 1 : 0;
        this.prev[k] = down;
        if (this._queue[k] > 0 && !this.raw[k]) { this._queue[k] = 0; this.prev[k] = true; /* 下一帧产生 release */ }
        else this._queue[k] = 0;
      }
      this.okDouble = false;
      if (this.okP) {
        if (this._frame - this._lastOkTap < 16) this.okDouble = true;
        this._lastOkTap = this._frame;
      }
      this.okTap = this.okR && this._okHeld < 14;
      if (this.ok) this._okHeld = this.okT; else if (!this.okR) this._okHeld = 0;
    }
    clear() { this.raw.up = this.raw.down = this.raw.ok = false; this._queue = { up: 0, down: 0, ok: 0 }; }
    legacyKeys() {
      return {
        up: this.up, down: this.down, ok: this.ok,
        upEdge: this.upP, downEdge: this.downP, okEdge: this.okP, okHold: this.okT > 12,
        blow: false, voice: false
      };
    }
  }

  // ---------------------------------------------------------------- registry
  const games = {}; const order = [];
  function define(def) {
    const meta = (G.CATALOG || []).find((c) => c.id === def.id);
    if (meta) def = Object.assign({}, meta, def);
    def.missions = def.missions || [];
    def.ranks = def.ranks || null;
    games[def.id] = def;
    if (order.indexOf(def.id) < 0) order.push(def.id);
    return def;
  }

  // 旧玩法适配：把 games-impl / games-new-impl 的 GAMES[id] 包成统一接口
  function legacy(id, opts) {
    opts = opts || {};
    return define(Object.assign({
      id, legacy: true,
      create(api) {
        const g = G.GAMES[id];
        g.init();
        let overT = 0, ended = false, elapsed = 0;
        const isOver = opts.over || ((x) => !!(x.dead || x.win || x.state === 'gameover' || x.state === 'victory'));
        const scoreOf = opts.score || ((x) => (typeof x.score === 'number' ? x.score : (x.p && typeof x.p.score === 'number' ? x.p.score : 0)));
        return {
          update(input) {
            elapsed++;
            if (input.okP && g.onOk && !ended) g.onOk(api.sfx, api.fx);
            const keys = input.legacyKeys();
            if (ended) { keys.up = keys.down = keys.ok = keys.upEdge = keys.downEdge = keys.okEdge = keys.okHold = false; }
            g.update(STEP, keys, api.sfx, api.fx);
            api.stats.score = Math.max(0, scoreOf(g) | 0);
            api.stats.time = elapsed / 60;
            if (opts.stats) opts.stats(g, api.stats);
            if (!ended && isOver(g)) {
              ended = true; overT = 0;
              api.stats.clear = !!(g.win || g.state === 'victory' || (opts.clear && opts.clear(g)));
            }
            if (ended && ++overT === 50) api.end();
          },
          draw(ctx, frame) {
            ctx.save();
            g.render(ctx, frame, api.fx);
            ctx.restore();
          }
        };
      }
    }, opts));
  }

  // ---------------------------------------------------------------- runner / shell
  function mount(canvas, hooks) {
    hooks = hooks || {};
    const ctx = canvas.getContext('2d');
    const input = new Input();
    const sfx = new Sfx();
    const fx = new FX();
    Save.migrate();
    sfx.muted = Save.muted();

    let S = 2;
    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = G.devicePixelRatio || 1;
      const want = U.clamp(Math.round(((r.width || 240) * dpr) / W), 2, 3);
      if (want !== S || canvas.width !== W * want) { S = want; canvas.width = W * S; canvas.height = H * S; }
    }
    resize();
    G.addEventListener('resize', resize);

    const R = {
      id: null, def: null, game: null, api: null,
      state: 'title', t: 0, frame: 0, paused: false,
      stats: {}, runMissions: [], toasts: [], result: null, countUp: 0,
      input, sfx, fx
    };

    function makeApi() {
      const api = {
        W, H, U, D, fx, sfx, input,
        stats: { score: 0 },
        id: R.id,
        best: Save.best(R.id),
        frame: () => R.frame,
        end(extra) {
          if (R.state !== 'play') return;
          Object.assign(api.stats, extra || {});
          finish();
        },
        toast: (text, color) => pushToast(text, color),
        daily: () => U.dayIndex()
      };
      return api;
    }

    function pushToast(text, color) { R.toasts.push({ text, color: color || '#ffd928', life: 120 }); }

    function load(id) {
      const def = games[id];
      if (!def) return false;
      R.id = id; R.def = def; Save.setLast(id);
      newGame();
      R.state = 'title'; R.t = 0; R.paused = false;
      input.clear(); input.locked = false;
      if (hooks.onLoad) hooks.onLoad(def);
      if (hooks.onState) hooks.onState('title');
      return true;
    }
    function newGame() {
      fx.reset();
      R.api = makeApi();
      R.stats = R.api.stats;
      R.runMissions = R.def.missions.map(() => false);
      R.toasts = [];
      R.result = null;
      try { R.game = R.def.create(R.api); } catch (e) { console.error(e); R.game = null; }
    }
    function begin() {
      newGame();
      R.state = 'ready'; R.t = 0; R.timeLeft = R.def.time || 0;
      sfx.start();
      Save.addPlay(R.id);
      if (hooks.onState) hooks.onState('ready');
    }
    function checkMissions(final) {
      const def = R.def;
      def.missions.forEach((m, i) => {
        if (R.runMissions[i]) return;
        let ok = false;
        try { ok = !!m.test(R.stats, final); } catch (e) { ok = false; }
        if (ok) {
          R.runMissions[i] = true;
          const fresh = !Save.hasMission(R.id, i);
          if (fresh) { Save.setMission(R.id, i); }
          if (!final) { pushToast((fresh ? '★ 任务达成 ' : '✓ ') + m.text, fresh ? '#ffd928' : '#9ae6b4'); if (fresh) sfx.star(); }
          if (hooks.onMission) hooks.onMission(i, fresh);
        }
      });
    }
    function rankOf(score) {
      const r = R.def.ranks;
      if (!r || score <= 0) return null;
      if (score >= r[0]) return 'S';
      if (score >= r[1]) return 'A';
      if (score >= r[2]) return 'B';
      return 'C';
    }
    function finish() {
      const score = Math.floor(R.stats.score || 0);
      const prevBest = Save.best(R.id);
      const starsBefore = Save.stars(R.id);
      checkMissions(true);
      const isNew = score > 0 && Save.setBest(R.id, score);
      const place = Save.pushTop(R.id, score);
      R.result = {
        score, prevBest, isNew, place, rank: rankOf(score), clear: !!R.stats.clear,
        newStars: Save.stars(R.id) - starsBefore, title: R.stats.clear ? (R.stats.clearText || 'CLEAR!') : (R.stats.overText || 'GAME OVER')
      };
      R.state = 'over'; R.t = 0; R.countUp = 0;
      if (R.result.clear) sfx.clear(); else sfx.over();
      if (isNew) setTimeout(() => sfx.record(), 700);
      if (hooks.onEnd) hooks.onEnd(R.result, R.stats);
      if (hooks.onState) hooks.onState('over');
    }

    // ---- 壳层按键：页面按钮 / 键盘都走这里
    function press(k, down) {
      if (down) sfx.init();
      input.set(k, down);
    }
    function pause(v) {
      if (R.state !== 'play' && R.state !== 'ready') return;
      R.paused = v == null ? !R.paused : v;
      input.clear();
      if (hooks.onState) hooks.onState(R.paused ? 'pause' : R.state);
    }
    function restart() { if (!R.def) return; R.paused = false; begin(); }
    function toTitle() { if (!R.def) return; R.paused = false; newGame(); R.state = 'title'; R.t = 0; if (hooks.onState) hooks.onState('title'); }
    function setMuted(m) { sfx.muted = m; Save.setMuted(m); }

    // ---- 主循环：固定 60Hz
    let acc = 0, last = performance.now(), raf = 0;
    function step() {
      input.step();
      R.frame++; R.t++;
      if (R.paused) { if (input.okP) pause(false); return; }
      if (R.state === 'title') {
        if (input.okP && R.t > 8) begin();
        return;
      }
      if (R.state === 'ready') {
        if (R.t === 38) sfx.go();
        if (R.t >= 56) { R.state = 'play'; R.t = 0; if (hooks.onState) hooks.onState('play'); }
        fx.update();
        return;
      }
      if (R.state === 'play') {
        if (fx.stop > 0) { fx.stop--; return; }
        if (R.game) {
          try { R.game.update(input); } catch (e) { console.error(e); R.api.end({ overText: 'ERROR' }); }
        }
        fx.update();
        if (R.def.time && R.state === 'play') {
          R.timeLeft -= 1 / 60;
          if (R.timeLeft <= 5 && Math.ceil(R.timeLeft) !== Math.ceil(R.timeLeft + 1 / 60)) sfx.tick();
          if (R.timeLeft <= 0) { R.timeLeft = 0; R.api.end({ clear: true, clearText: 'TIME UP!' }); }
        }
        if (R.frame % 12 === 0) checkMissions(false);
        for (let i = R.toasts.length - 1; i >= 0; i--) if (--R.toasts[i].life <= 0) R.toasts.splice(i, 1);
        if (hooks.onScore && R.frame % 6 === 0) hooks.onScore(Math.floor(R.stats.score || 0));
        return;
      }
      if (R.state === 'over') {
        R.countUp = Math.min(1, R.countUp + 1 / 45);
        fx.update();
        if (R.t > 40 && input.okP) begin();
      }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      acc += Math.min(100, now - last); last = now;
      let n = 0;
      while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
      if (n === 5) acc = 0;
      render();
    }

    function render() {
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (fx.shake > 0 && !R.paused) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
      if (R.game) { try { R.game.draw(ctx, R.frame); } catch (e) { console.error(e); } }
      ctx.restore();
      ctx.save();
      if (fx.shake > 0 && !R.paused) ctx.translate((Math.random() - 0.5) * fx.shake * 0.5, (Math.random() - 0.5) * fx.shake * 0.5);
      fx.render(ctx);
      ctx.restore();
      fx.renderOverlay(ctx);
      if (R.state === 'play') { if (R.def.time) drawTimer(); drawToasts(); }
      if (R.state === 'title') drawTitle();
      else if (R.state === 'ready') drawReady();
      else if (R.state === 'over') drawOver();
      if (R.paused) drawPause();
    }

    function drawToasts() {
      let y = 44;
      for (const t of R.toasts) {
        const a = Math.min(1, t.life / 15, (120 - t.life) / 8);
        ctx.globalAlpha = a;
        const w = Math.min(228, D.measure(ctx, t.text, 9) + 16);
        D.panel(ctx, (W - w) / 2, y - 11, w, 16, { r: 8, fill: 'rgba(12,10,18,.9)', stroke: t.color });
        D.text(ctx, t.text, W / 2, y + 1, { size: 9, color: t.color, align: 'center' });
        ctx.globalAlpha = 1;
        y += 20;
      }
    }

    function drawTimer() {
      const k = R.timeLeft / R.def.time, low = R.timeLeft < 10;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, H - 4, W, 4);
      ctx.fillStyle = low ? ((R.frame >> 3) % 2 ? '#ff5a5a' : '#ffd928') : '#7dffb3';
      ctx.fillRect(0, H - 4, W * k, 4);
      if (low) D.text(ctx, Math.ceil(R.timeLeft) + 's', W - 4, H - 8, { size: 10, color: '#ff5a5a', align: 'right', outline: '#000' });
    }
    function dim(a) { ctx.fillStyle = 'rgba(6,5,10,' + a + ')'; ctx.fillRect(0, 0, W, H); }

    function drawTitle() {
      const d = R.def, t = R.t;
      dim(0.72);
      // 标题
      const col = d.color || '#f0c14b';
      ctx.fillStyle = col; ctx.globalAlpha = 0.18; ctx.fillRect(0, 22, W, 62); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.fillRect(0, 22, W, 2); ctx.fillRect(0, 82, W, 2);
      D.text(ctx, d.icon || '', W / 2, 44, { size: 18, align: 'center' });
      const tsz = d.title.length > 7 ? 16 : 20;
      D.text(ctx, d.title, W / 2, 68, { size: tsz, color: '#fff', align: 'center', outline: '#000', lw: 4 });
      D.text(ctx, (d.en || '').toUpperCase(), W / 2, 80, { size: 8, color: col, align: 'center' });
      // 一句话
      if (d.pitch) D.text(ctx, d.pitch, W / 2, 102, { size: 10, color: '#e8dcc6', align: 'center' });
      // 操作
      const c = d.controls || {};
      const rows = [['◀ UP', c.up], ['▶ DN', c.down], ['● OK', c.ok]].filter(r => r[1]);
      let y = 118;
      D.panel(ctx, 14, y, W - 28, rows.length * 20 + 10, { fill: 'rgba(0,0,0,.45)', stroke: 'rgba(255,255,255,.15)' });
      y += 6;
      rows.forEach((r, i) => {
        D.keycap(ctx, 22, y + i * 20, r[0], i === 2 ? '#8a5a10' : '#2a2230');
        D.text(ctx, r[1], 64, y + i * 20 + 11, { size: 10, color: '#fff' });
      });
      y += rows.length * 20 + 14;
      // 任务
      if (d.missions.length) {
        D.text(ctx, '本机任务  ' + Save.stars(R.id) + '/' + d.missions.length + ' ★', 20, y + 8, { size: 9, color: col });
        y += 14;
        d.missions.forEach((m, i) => {
          const done = Save.hasMission(R.id, i);
          D.star(ctx, 26, y + 4, 5, done ? '#ffd928' : null, done ? null : 'rgba(255,255,255,.45)');
          D.text(ctx, m.text, 36, y + 8, { size: 9, color: done ? '#ffe9a8' : '#b8ad9c' });
          y += 14;
        });
      }
      // 最佳
      const best = Save.best(R.id);
      D.text(ctx, best ? 'BEST ' + U.fmt(best) : 'NO RECORD YET', W / 2, 282, { size: 8, color: '#9ae6b4', align: 'center' });
      if ((t >> 4) % 2 === 0 || t < 8) {
        D.panel(ctx, 50, 290, 140, 20, { r: 10, fill: col, stroke: false });
        D.text(ctx, '按 OK 开始', W / 2, 304, { size: 11, color: '#140d08', align: 'center' });
      }
    }

    function drawReady() {
      const t = R.t;
      dim(t < 38 ? 0.35 : 0.1);
      const go = t >= 38;
      const k = go ? (t - 38) / 18 : (t % 38) / 38;
      const sc = go ? 1 + k * 0.6 : U.outBack(Math.min(1, t / 12));
      ctx.save(); ctx.translate(W / 2, 150); ctx.scale(sc, sc); ctx.globalAlpha = go ? 1 - k : 1;
      D.text(ctx, go ? 'GO!' : 'READY', 0, 8, { size: go ? 28 : 22, color: go ? '#7dffb3' : '#ffd928', align: 'center', outline: '#000', lw: 5 });
      ctx.restore(); ctx.globalAlpha = 1;
    }

    function drawPause() {
      dim(0.6);
      D.panel(ctx, 40, 116, 160, 82, {});
      D.text(ctx, 'PAUSED', W / 2, 142, { size: 16, color: '#ffd928', align: 'center' });
      D.text(ctx, 'OK 继续', W / 2, 164, { size: 10, color: '#fff', align: 'center' });
      D.text(ctx, 'R 重开 · Esc 退出', W / 2, 184, { size: 9, color: '#b8ad9c', align: 'center' });
    }

    function drawOver() {
      const r = R.result, d = R.def, t = R.t;
      if (!r) return;
      dim(Math.min(0.78, t / 20));
      const e = U.outBack(Math.min(1, t / 18));
      ctx.save(); ctx.translate(W / 2, 160); ctx.scale(e, e); ctx.translate(-W / 2, -160);
      D.panel(ctx, 16, 36, W - 32, 250, { stroke: r.clear ? '#7dffb3' : (d.color || '#f0c14b'), lw: 2 });
      D.text(ctx, r.title, W / 2, 62, { size: 16, color: r.clear ? '#7dffb3' : '#ff6b6b', align: 'center', outline: '#000' });
      const shown = Math.floor(r.score * U.outCubic(R.countUp));
      D.text(ctx, 'SCORE', W / 2, 84, { size: 8, color: '#b8ad9c', align: 'center' });
      D.text(ctx, U.fmt(shown), W / 2, 110, { size: 24, color: '#fff', align: 'center', outline: '#000', lw: 4 });
      if (r.isNew && R.countUp >= 1 && (t >> 3) % 2 === 0) {
        D.text(ctx, '★ NEW RECORD ★', W / 2, 128, { size: 10, color: '#ffd928', align: 'center' });
      } else if (!r.isNew) {
        D.text(ctx, 'BEST ' + U.fmt(Math.max(r.prevBest, r.score)), W / 2, 128, { size: 9, color: '#9ae6b4', align: 'center' });
      }
      // 评级
      if (r.rank && R.countUp >= 1) {
        const rc = { S: '#ffd928', A: '#7dffb3', B: '#7cc7ff', C: '#c9b8a6' }[r.rank];
        const k = Math.min(1, (t - 45) / 10);
        if (k > 0) {
          ctx.save(); ctx.translate(196, 92); ctx.rotate(-0.25); ctx.scale(2 - k, 2 - k); ctx.globalAlpha = k;
          ctx.strokeStyle = rc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
          D.text(ctx, r.rank, 0, 8, { size: 20, color: rc, align: 'center' });
          ctx.restore(); ctx.globalAlpha = 1;
        }
      }
      // 任务
      let y = 150;
      D.text(ctx, '任务', 30, y, { size: 9, color: d.color || '#f0c14b' });
      y += 8;
      d.missions.forEach((m, i) => {
        const done = Save.hasMission(R.id, i), now = R.runMissions[i];
        D.star(ctx, 34, y + 6, 6, done ? '#ffd928' : null, done ? null : 'rgba(255,255,255,.4)');
        D.text(ctx, m.text, 46, y + 10, { size: 9, color: done ? '#ffe9a8' : '#a99e8c' });
        if (now) D.text(ctx, '✓', W - 32, y + 10, { size: 9, color: '#7dffb3', align: 'right' });
        y += 18;
      });
      if (r.newStars > 0) D.text(ctx, '+' + r.newStars + ' ★ 收入囊中', W / 2, y + 12, { size: 10, color: '#ffd928', align: 'center' });
      if (r.place >= 0 && r.place < 5) D.text(ctx, '本机第 ' + (r.place + 1) + ' 名', W / 2, y + 28, { size: 9, color: '#9ae6b4', align: 'center' });
      ctx.restore();
      if (t > 40 && (t >> 4) % 2 === 0) {
        D.panel(ctx, 50, 292, 140, 20, { r: 10, fill: d.color || '#f0c14b', stroke: false });
        D.text(ctx, 'OK 再来一局', W / 2, 306, { size: 11, color: '#140d08', align: 'center' });
      }
    }

    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
    raf = requestAnimationFrame(frame);

    return {
      R, load, press, pause, restart, toTitle, setMuted, resize,
      get state() { return R.paused ? 'pause' : R.state; },
      isMuted: () => sfx.muted,
      destroy() { cancelAnimationFrame(raf); }
    };
  }


  // ---------------------------------------------------------------- demo（大厅缩略图 / 吸引画面）
  // 在独立沙盒里跑一个游戏：静音、随机机器人输入、不写存档。旧玩法共享全局状态，同一时刻只跑一个。
  const silent = new Sfx(); silent.muted = true;
  function demo(id, canvas, opts) {
    opts = opts || {};
    const def = games[id];
    if (!def) return null;
    const ctx = canvas.getContext('2d');
    const input = new Input();
    const fx = new FX();
    let api, game, t = 0, hold = { up: 0, down: 0, ok: 0 }, done = false, raf = 0;
    const seed = U.seeded(opts.seed || 7);
    function fresh() {
      fx.reset(); done = false;
      api = { W, H, U, D, fx, sfx: silent, input, stats: { score: 0 }, id, best: 0, demo: true,
        frame: () => t, toast() {}, daily: () => U.dayIndex(), end() { done = true; } };
      try { game = def.create(api); } catch (e) { game = null; }
    }
    fresh();
    function botStep() {
      for (const k of ['up', 'down', 'ok']) {
        if (hold[k] > 0) hold[k]--;
        else if (seed() < (k === 'ok' ? 0.05 : 0.035)) hold[k] = Math.floor(seed() * (k === 'ok' ? 8 : 30)) + 2;
        input.set(k, hold[k] > 0);
      }
      input.step();
    }
    function tick(n) {
      for (let i = 0; i < n && game; i++) {
        t++; botStep();
        try { game.update(input); } catch (e) { game = null; break; }
        fx.update();
        if (done) { if (opts.loop) fresh(); else break; }
      }
    }
    function draw() {
      const r = canvas.getBoundingClientRect();
      const s = Math.max(1, Math.min(3, Math.round(((r.width || 120) * (G.devicePixelRatio || 1)) / W * 2) / 2));
      if (canvas.width !== Math.round(W * s)) { canvas.width = Math.round(W * s); canvas.height = Math.round(H * s); }
      ctx.setTransform(s, 0, 0, s, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
      if (!game) return;
      try { ctx.save(); game.draw(ctx, t); ctx.restore(); fx.render(ctx); } catch (e) { /* 缩略图失败不影响页面 */ }
    }
    function loop() { tick(1); draw(); raf = requestAnimationFrame(loop); }
    return {
      snapshot(frames) { tick(frames == null ? 240 : frames); draw(); },
      play() { if (!raf) raf = requestAnimationFrame(loop); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      get running() { return !!raf; }
    };
  }

  G.Arcade = { W, H, STEP, U, D, FX, Sfx, Input, Save, define, legacy, games, order, mount, demo };
})(window);
