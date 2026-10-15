// simulator/games-engine.js —— Alex Arcade 11合1 纯前端像素/伪3D游戏引擎
// 零外部依赖 · 纯数学矢量像素绘制 · Web Audio 实时物理合成音效

(function(global) {
  'use strict';

  // --- 1. 高品质 8-Bit / 赛博复古音效合成器 ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }
    init() {
      if (this.muted) return;
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playLaser() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.08);
    }

    playMissile() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(980, t + 0.12);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.12);
    }

    playJump() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.11);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.11);
    }

    playBlink() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(280, t + 0.12);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.12);
    }

    playExplode(isBig = false) {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const dur = isBig ? 0.45 : 0.22;
      const bufSize = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * (isBig ? 0.12 : 0.05)));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isBig ? 550 : 750, t);
      filter.frequency.linearRampToValueAtTime(60, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(isBig ? 0.45 : 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      noise.connect(filter); filter.connect(g); g.connect(this.ctx.destination);
      noise.start(t);
    }

    playCoin() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [987.77, 1318.51].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        g.gain.setValueAtTime(0.18, t + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.12);
      });
    }

    playNitro() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(480, t + 0.28);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.28);
    }

    playSlash(isBlue = true) {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isBlue ? 1100 : 780, t);
      osc.frequency.exponentialRampToValueAtTime(isBlue ? 450 : 280, t + 0.09);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.09);
    }

    playHit() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.06);
    }

    playGameOver() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [392, 349.23, 311.13, 261.63].forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t + idx * 0.12);
        g.gain.setValueAtTime(0.18, t + idx * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 0.18);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t + idx * 0.12); osc.stop(t + idx * 0.12 + 0.18);
      });
    }

    playClick() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.03);
    }

    playWave() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.linearRampToValueAtTime(1350, t + 0.04);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.09);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.09);
    }

    playFire() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.1);
    }

    playShield() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.linearRampToValueAtTime(1450, t + 0.08);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.08);
    }

    playBomb() {
      if (this.muted) return; this.init();
      this.playExplode(true);
      setTimeout(() => this.playExplode(true), 120);
      setTimeout(() => this.playExplode(true), 240);
    }

    playPowerup() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t + idx * 0.045);
        g.gain.setValueAtTime(0.16, t + idx * 0.045);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.045 + 0.07);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t + idx * 0.045); osc.stop(t + idx * 0.045 + 0.07);
      });
    }

    playShoot(kind) {
      if (kind === 'laser') this.playLaser();
      else this.playFire();
    }
    playSpark() { this.playClick(); }
    playPower() { this.playPowerup(); }
    playHurt() { this.playHit(); }
    playEat() { this.playCoin(); }
    playBlip() { this.playClick(); }

    playPop(pitch = 1.0) {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(860 * pitch, t + 0.04);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.05);
    }

    playBounce() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.08);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.08);
    }

    playSplash() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.14);
    }

    playPurr() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, t);
      osc.frequency.linearRampToValueAtTime(740, t + 0.08);
      osc.frequency.linearRampToValueAtTime(460, t + 0.18);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    }

    playClack() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.06);
    }

    playJump() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.12);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.14);
    }

    playSlip() {
      if (this.muted) return; this.init(); if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.linearRampToValueAtTime(220, t + 0.22);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  // --- 2. 炫彩粒子与屏幕震动系统 ---
  class FXEngine {
    constructor() {
      this.particles = [];
      this.floats = [];
      this.shake = 0;
    }
    reset() {
      this.particles = [];
      this.floats = [];
      this.shake = 0;
    }
    burst(x, y, count = 12, colors = ['#00e5ff', '#ff0055', '#ffd700']) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 3.5;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 18 + Math.random() * 14,
          maxLife: 32,
          size: 2 + Math.random() * 3,
          color: colors[i % colors.length]
        });
      }
    }
    floatText(x, y, text, color = '#ffd700') {
      this.floats.push({ x, y, text, color, life: 30, maxLife: 30, vy: -0.9 });
    }
    float(x, y, text, color = '#ffd700') {
      this.floatText(x, y, text, color);
    }
    text(x, y, text, color = '#ffd700') {
      this.floatText(x, y, text, color);
    }
    update() {
      if (this.shake > 0) this.shake *= 0.88;
      if (this.shake < 0.2) this.shake = 0;

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.y += f.vy;
        f.life--;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
    }
    render(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1.0;

      ctx.font = 'bold 12px monospace';
      for (const f of this.floats) {
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1.0;
    }
  }

  // --- 3. 游戏注册表元数据定义 ---
  const GAME_REGISTRY = [
    {
      id: 'pawssprint',
      title: '短腿爪爪运动会：萌宠冲刺',
      subtitle: 'PAWS SPRINT: WHOLESOME DASH',
      icon: '🐾',
      category: 'chill',
      badge: 'NEW 45°',
      difficulty: 1,
      tags: ['45度正面萌脸', '柯基柴犬海豹企鹅', '三轨平滑吸附对齐', '小短腿涡轮狂蹬', '终点大抱枕扑倒'],
      desc: '专为解压与治愈打造的正面萌宠冲刺！45° 视角看清柯基、阿柴与小海豹吐舌表情，三车道绝对平稳吸附绝不跑偏。踩香蕉皮360°原地搞笑旋转，双击OK开启涡轮狂蹬无敌冲撞！',
      upHint: '左道切换 / 选人',
      downHint: '右道切换 / 选人',
      okHint: '起跳跨越 / 涡轮狂蹬 / 飞扑抱枕',
      help: '• <strong>选人界面</strong>：UP/DOWN 挑选萌宠（柯基、柴犬、海豹、企鹅），按 OK 开始！<br>• <strong>比赛奔跑</strong>：UP 向左变道，DOWN 向右变道（按一次稳稳居中对齐，绝不跑偏）。<br>• <strong>短按 OK 键</strong>：起跳跃过跨栏与泥洼。<br>• <strong>双击/长按 OK</strong>：开启【小短腿涡轮狂蹬】双倍极速无敌冲刺！<br>• <strong>终点狂欢</strong>：终点飞扑进蓬松大抱枕炸出漫天彩色羽毛，抽取今日治愈寄语！'
    },
    {
      id: 'smash',
      title: '万物皆可敲：爆浆解压',
      subtitle: 'SMASH FRENZY: STRESS RELIEF',
      icon: '🔨',
      category: 'chill',
      badge: 'NEW ASMR',
      difficulty: 1,
      tags: ['生鸡蛋金蛋西瓜', '蛋黄流屏ASMR', '绿色人字拖雷神锤', '长按全屏暴击震颤'],
      desc: '极致解压物理破坏！换上大拖鞋、充气爱心锤或雷神重锤，疯狂敲碎生鸡蛋、大西瓜、闹钟与周一打卡机。OK 短按快速敲击，长按蓄力全屏暴击，蛋黄顺屏滑落，按一下爽一下！',
      upHint: '切换工具 (木槌/雷神锤)',
      downHint: '切换工具 (充气锤/拖鞋)',
      okHint: '敲击 / 长按蓄力暴击',
      help: '• <strong>UP / DOWN</strong>：循环切换打击工具（木槌、粉色充气锤、雷神大锤、绿色人字拖）。<br>• <strong>OK 键短按</strong>：快速敲击物体，触发 ASMR 破壳声与碎片喷溅！<br>• <strong>OK 键长按</strong>：蓄力暴击！蓄满松开触发全屏巨震，将目标砸成粉碎！'
    },
    {
      id: 'bubble',
      title: '飞针破泡录：连锁消除',
      subtitle: 'BUBBLE NEEDLE: POP FRENZY',
      icon: '🪡',
      category: 'chill',
      badge: 'NEW COMBO',
      difficulty: 2,
      tags: ['左右侧壁反弹物理', '雷云电弧范围连锁', '全屏冰冻定格', '旋风贯穿大钢针'],
      desc: '升华版扎气球与捏泡泡纸！底部发射台角度微调，飞针左右侧壁真实反弹，雷云泡范围连锁引爆，冰冻泡全屏悬停，长按发射旋风大钢针全屏贯通！',
      upHint: '向左调整射角',
      downHint: '向右调整射角',
      okHint: '发射飞针 / 长按贯穿针',
      help: '• <strong>UP / DOWN</strong>：左右微调发射角度（带瞄准线，支持左右墙壁反弹）。<br>• <strong>OK 键短按</strong>：发射快速单发飞针刺破气泡。<br>• <strong>OK 键长按</strong>：蓄力发射【旋风大钢针】，贯穿整列气泡！<br>• 刺破雷云泡引发连锁大爆炸，刺破冰冻泡定格全屏气泡 3 秒。'
    },
    {
      id: 'wind',
      title: '风与纸翼：云海滑翔',
      subtitle: 'WIND RIDER: DREAM GLIDE',
      icon: '🪁',
      category: 'chill',
      badge: 'NEW ZEN',
      difficulty: 1,
      tags: ['永不坠毁死亡', '草地安全滑行', '按住俯冲松开冲天', '风之环音效加速', '晚霞星空心流'],
      desc: '梦境般的心流飞行体验！操控一叶系着绯红丝带的折纸飞机，按住 OK 顺坡极速俯冲下潜，松开 OK 迎风展开直冲云霄。即使落地也只是草地滑行激起草屑，绝无死局挫败！',
      upHint: '机头仰角抬头',
      downHint: '机头俯角压低',
      okHint: '按住俯冲 / 松开冲天',
      help: '• <strong>OK 键按住</strong>：收拢双翼，顺着下坡斜面极速俯冲蓄势！<br>• <strong>OK 键松开</strong>：迎风展翼，借坡度动能化为升力呼啸冲天！<br>• <strong>UP / DOWN</strong>：微调机身俯仰角度，辅助对准上升气流环。<br>• <strong>绝不坠毁</strong>：碰到地面自动变成草地滑行，伴随草屑飞扬，随时可再次起飞。'
    },
    {
      id: 'wave',
      title: '浪涌漫游者：海獭冲浪',
      subtitle: 'WAVE WALKER: LO-FI SURF',
      icon: '🏄',
      category: 'race',
      badge: 'NEW SURF',
      difficulty: 2,
      tags: ['正弦海浪波涌', '顺坡压板推力加速', '浪尖腾空360翻滚', '完美切水二次冲刺'],
      desc: '戴着小墨镜的海獭在动态正弦海浪上惬意冲浪！顺坡按 DOWN 压板重力加速，浪尖按 OK 腾空而起，空中 UP/DOWN 旋转 360° 滑稽特技，落水前按 OK 校正角度完美切水！',
      upHint: '空中顺时针翻滚',
      downHint: '顺坡压板加速 / 逆时针翻滚',
      okHint: '浪尖起跳 / 切水校正',
      help: '• <strong>DOWN 键</strong>：顺坡下滑时按住压板加速，冲出惊人推力！<br>• <strong>OK 键（浪尖瞬间）</strong>：借冲力高高跃起腾空！<br>• <strong>滞空特技</strong>：在空中按 UP 或 DOWN 触发 360° 滑稽大翻滚！<br>• <strong>触水瞬间</strong>：按 OK 摆正板面切水，角度吻合达成【完美切水】二次加速；偏差过大触发【肚皮拍水】搞笑减速。'
    },
    {
      id: 'huddle',
      title: '午后温泉：萌物抱抱团',
      subtitle: 'FLUFFY HUDDLE: ONSEN PETS',
      icon: '🛁',
      category: 'chill',
      badge: 'NEW HEALING',
      difficulty: 1,
      tags: ['柴犬海豹团子猫', 'Q弹果冻物理形变', '相同动物抱团进阶', '长按抚摸治愈短语'],
      desc: '日式露天温泉下的萌宠果冻抱抱团！将圆滚滚的阿柴、海豹、团子猫滑入暖泉，Q 弹挤压形变，相同小动物抱团融合进阶。长按 OK 触发温泉抚摸，冒出暖心人生短语与樱花雨！',
      upHint: '滑轨向左移动',
      downHint: '滑轨向右移动',
      okHint: '投放萌宠 / 长按温泉抚摸',
      help: '• <strong>UP / DOWN</strong>：在温泉池顶部左右滑动落点瞄准导轨。<br>• <strong>OK 键短按</strong>：将当前小动物滑入温泉池，享受水流浮力与果冻碰撞！<br>• <strong>OK 键长按</strong>：触发【温泉轻抚】，全池小动物舒适膨胀，吐出暖心治愈金句！<br>• 相同种类的小动物相撞会自动抱团融合升阶为头戴毛巾享受形态。'
    },
    {
      id: 'lasercat',
      title: '猫猫激光笔指挥官',
      subtitle: 'LASER CAT: POUNCE TACTICS',
      icon: '🐱',
      category: 'action',
      badge: 'NEW TACTICS',
      difficulty: 3,
      tags: ['红外激光多段折射', '猫咪摇屁股猛扑', '借冲击力推箱解谜', '踩停扫地机器人'],
      desc: '手里的枪是一把特工专用红外激光笔！旋转射角在镜面间折射光斑。猫咪看到红点会摇屁股蓄力并疯狂飞扑，利用猫咪的冲击力推翻重箱、拍击高处开关通电过关！',
      upHint: '逆时针调整激光',
      downHint: '顺时针调整激光',
      okHint: '单点引诱 / 长按猛烈飞扑',
      help: '• <strong>UP / DOWN</strong>：旋转调整激光笔射出角度，观察镜面折射光路。<br>• <strong>OK 键短按</strong>：轻点激光，引诱猫咪警惕挪步。<br>• <strong>OK 键长按</strong>：强激光锁定，指挥猫群全速猛扑推倒重箱撞击开关！'
    },
    {
      id: 'splasher',
      title: '泡泡高压水枪狂欢节',
      subtitle: 'HYDRO SPLASHER: COLOR BURST',
      icon: '🔫',
      category: 'shoot',
      badge: 'NEW COLOR',
      difficulty: 2,
      tags: ['重力抛物线水弹', '黑白都市彩色复苏', '打工人换夏威夷衫跳舞', '长按水龙卷暴风雨'],
      desc: '没有杀戮，只有清凉彩墨！黑白灰的沉闷办公室与街头，手持高压水枪喷射抛物线彩墨水弹。被击中的物体瞬间爆开七彩颜料复苏，行色匆匆的打工人秒变夏威夷花衬衫欢呼跳舞！',
      upHint: '水枪仰角调高',
      downHint: '水枪俯角调低',
      okHint: '连发水球 / 长按高压水龙卷',
      help: '• <strong>UP / DOWN</strong>：调节高压水枪发射仰角，瞄准天空与楼顶。<br>• <strong>OK 键短按</strong>：快速发射重力抛物线彩墨水球，洗净阴沉灰度。<br>• <strong>OK 键长按</strong>：水泵充能，释放超高压水龙卷暴风雨，席卷整条街区！'
    },
    {
      id: 'bouncy',
      title: '回声几何弹射枪',
      subtitle: 'BOUNCY BLASTER: TRICK SHOT',
      icon: '🎱',
      category: 'shoot',
      badge: 'NEW TRICK',
      difficulty: 3,
      tags: ['高精激光反射预测线', '超级橡胶10次反弹', '防弹盾牌绕后爆头', '炸药桶连锁AOE'],
      desc: '台球几何与特工神枪手绝配！1.5° 超高精度激光瞄准，实时投射未来 3 次反射虚线。橡胶弹球在钢板与棱镜间疯狂反弹 10 次，隔山打牛绕过正面防弹盾牌一击爆头，引爆炸药桶！',
      upHint: '逆时针精细微调',
      downHint: '顺时针精细微调',
      okHint: '击发超级弹球',
      help: '• <strong>UP / DOWN</strong>：1.5° 微调瞄准激光，观察实时虚线预测弹道。<br>• <strong>OK 键击发</strong>：射出高弹橡胶球，利用墙壁多次反弹绕过正面防盾！<br>• 射中 TNT 炸药桶可引爆周围大片区域。'
    },
    {
      id: 'thunderracer',
      title: '雷霆飞车：极速武装',
      subtitle: 'THUNDER RACER: ARMORED SPEED',
      icon: '🏎️',
      category: 'racing',
      badge: 'HOT FLASHER',
      difficulty: 3,
      tags: ['3D透视公路', '0ms极速飞弹', '氮气超频', '擦车连击'],
      desc: '驾驶重装武装超跑在赛博高速上极速狂飙！0ms触底瞬发高爆飞弹轰碎前车，近身擦车激活倍数连击，按住OK点燃氮气暴走无敌冲撞！',
      upHint: '左变道 (0ms)',
      downHint: '右变道 (0ms)',
      okHint: '极速飞弹 / 长按氮气',
      help: '• <strong>UP / DOWN</strong>：0ms 触底切换车道躲避警车与障碍。<br>• <strong>OK 键连按</strong>：无限战术充能飞弹，按多快射多快！<br>• <strong>OK 键长按</strong>：点燃超频氮气，无敌冲撞沿途一切！<br>• <strong>擦车奖励</strong>：在极限距离超越前车可触发 Near-Miss 积分倍增与能量奖励。'
    },
    {
      id: 'thunder',
      title: '雷霆战机：大像素街机版',
      subtitle: 'THUNDER STRIKER: ARCADE HD',
      icon: '⚡',
      category: 'shooter',
      badge: 'FLAGSHIP',
      difficulty: 3,
      tags: ['三大法宝流派', 'S型蛇形波刃', '炼狱烈焰', '离子护盾力场', '全屏核弹'],
      desc: '全面升级的雷霆战机！三大神装流派：[P]突击神火、[W]幻影S型蛇形波刃、[F]炼狱烈焰。配备[S]离子护盾与双子浮游僚机，决战烈隼机群、动态展翅飞龙与星海利维坦巨龙BOSS！',
      upHint: '左平移走位',
      downHint: '右平移走位',
      okHint: '全屏毁灭核弹',
      help: '• <strong>UP / DOWN</strong>：左右机动避弹（PC键盘支持 ↑↓←→ 全方位走位）。<br>• <strong>三大法宝流派</strong>：[P] 突击神火激光 | [W] 幻影 S 型蛇形回旋波刃 | [F] 炼狱爆轰烈焰火球。<br>• <strong>力场与僚机</strong>：[S] 激活离子护盾防御罩 | 强化时激活双子浮游卫星僚机协同射击。<br>• <strong>OK 键</strong>：释放全屏毁灭核弹，清除全屏敌弹并造成毁灭打击！<br>• <strong>[B] 补充全屏核弹 | [H] 维修机身回复生命</strong>。'
    },
    {
      id: 'battlecity',
      title: '坦克大战 1990',
      subtitle: 'BATTLE CITY NEO',
      icon: '🪖',
      category: 'shooter',
      badge: 'CLASSIC',
      difficulty: 3,
      tags: ['8×8 半砖削减', '钢板穿甲', '基地金鹰', '七种宝箱'],
      desc: '保卫老家雄鹰！UP / DOWN 转向，按住前进，OK 开火。红砖按象限削掉，四星重坦才能打穿钢板。击毁闪光坦克掉升阶、全灭、冻结、无敌、铲固、满级和奖命。',
      upHint: '左转 / 按住前进',
      downHint: '右转 / 按住前进',
      okHint: '开火 / 双击连发',
      help: '• <strong>UP / DOWN</strong>：逆时针 / 顺时针转 90°，按住则沿炮口前进。<br>• <strong>OK</strong>：开火。280ms 内再按一次切换自动连发。<br>• 红砖按 8×8 象限削掉；普通弹打不穿钢板，四星穿甲可以。<br>• 闪光坦克掉宝箱：升阶 / 全灭 / 冻结 / 无敌 / 铲固老家 / 满级 / 奖命。'
    },
    {
      id: 'adventure',
      title: '像素冒险岛 HD',
      subtitle: 'PIXEL ADVENTURE ISLAND',
      icon: '🏝️',
      category: 'action',
      badge: 'CLASSIC',
      difficulty: 2,
      tags: ['经典横版跑酷', '旋转抛物飞斧', '踩踏连跳', '金蛋道具'],
      desc: '重温经典海岛冒险！角色自走狂奔，按UP减速避险，按DOWN加速冲刺，空中按OK投掷旋转战斧，沿途搜集香蕉菠萝保持饱食体力！',
      upHint: '刹车后退',
      downHint: '加速冲刺',
      okHint: '起跳 / 飞斧投掷',
      help: '• 角色<strong>自动向右跑</strong>。UP 刹车后退，DOWN 加速冲刺。<br>• 空中 OK 丢出当前武器。路上红色字母 <strong>A / K / P</strong> 会滚到脚边。<br>• 踩踏蜗牛/青蛙连击加分；金蛋 +1 命。'
    },
    {
      id: 'contra',
      title: '口袋魂斗罗 HD',
      subtitle: 'POCKET CONTRA: CYBER OPS',
      icon: '🔫',
      category: 'action',
      badge: 'HARDCORE',
      difficulty: 4,
      tags: ['横版跳跃射击', 'S弹/激光枪/机枪', '俯卧避弹', '多阶段机械BOSS'],
      desc: '微掌机硬核横版枪战！单兵突入敌方核心基地，跳跃翻滚与卧倒躲避子弹，击落飞行胶囊升级散弹(S)与穿透激光(L)，决战巨型机械BOSS！',
      upHint: '翻滚起跳',
      downHint: '卧倒避弹 / 瞄准',
      okHint: '开火 / 切换武器',
      help: '• 关卡<strong>自动向右推进</strong>。UP 跳，DOWN 匍匐躲弹，OK 开火。<br>• 击落飞鹰掉 <strong>S 散弹 / L 激光 / M 机枪 / P 护盾</strong>，字母会自己滑到脚边。<br>• 下蹲可躲开胸口平飞弹。'
    },
    {
      id: 'flysaber',
      title: '果蝇光剑：神经脉冲',
      subtitle: 'FLYSABER: CYBER RHYTHM',
      icon: '🪰',
      category: 'rhythm',
      badge: 'BIOMIMETIC',
      difficulty: 4,
      tags: ['3D立体节拍', '红蓝双通道', '双刀十字合击', '子弹时间'],
      desc: '基于果蝇全脑连接组仿生设计的 3D 透视节奏劈砍音游！UP挥动蓝刀砍蓝块，DOWN挥动红刀砍红块，OK双刀合璧斩核心，蓄力爆发30ms子弹时间！',
      upHint: '左手蓝光剑 (R7)',
      downHint: '右手红光剑 (R8)',
      okHint: '双刀合击 / 神经超频',
      help: '• <strong>UP 键</strong>：挥动左侧蓝光剑劈斩飞来的蓝色突触块。<br>• <strong>DOWN 键</strong>：挥动右侧红光剑劈斩红色突触块。<br>• <strong>OK 键</strong>：双刀合力劈砍中央金色核心。<br>• 蓄满 100% 神经能量后按 OK，触发 30ms 减速 55% 的极速超频子弹时间！'
    },
    {
      id: 'flydriver',
      title: '果蝇超跑：极速狂飙',
      subtitle: 'FLYDRIVER: OPTIC FLOW RACER',
      icon: '⚡',
      category: 'racing',
      badge: 'OPTIC FLOW',
      difficulty: 3,
      tags: ['光流算法渲染', '极限避障擦车', '曲率隧道', '氮气撞击'],
      desc: '高帧率极速光流伪3D赛车！以果蝇复眼运动感知为算法灵感，在充满未来流光的立体隧道中闪避障碍车，极限近身超车赢取能量与积分！',
      upHint: '向左高速变道',
      downHint: '向右高速变道',
      okHint: '氮气曲率推进',
      help: '• <strong>UP / DOWN</strong>：左右切换赛道躲避前方低速车辆与障碍物。<br>• <strong>极限擦车</strong>：以高速贴身近距离超车，获取 Near-Miss 积分暴击。<br>• <strong>OK 键</strong>：激活氮气曲率推进，赛车进入无敌冲撞冲刺状态！'
    },
    {
      id: 'flappy',
      title: '像素飞鸟：重力狂飙',
      subtitle: 'FLAPPY BIRD HD: GRAVITY RUSH',
      icon: '🐦',
      category: 'casual',
      badge: 'ENDLESS',
      difficulty: 3,
      tags: ['真实重力加速度', '昼夜模式交替', '动态水管振荡', '黄金水管双倍'],
      desc: '经典重力扑翼穿梭！精确像素级碰撞体积检测，每穿过10根水管昼夜模式自动轮换，高分后迎来带有垂直呼吸振荡的黄金高分水管！',
      upHint: '微调平衡',
      downHint: '俯冲加速',
      okHint: '扑翼向上跃升',
      help: '• <strong>OK 键</strong>：轻按向上扑动翅膀克服重力下坠。<br>• 保持平稳节奏穿过上下水管狭窄空隙，避开天花板与地面。<br>• 每 10 分场景自动在白昼与静谧黑夜中平滑交替。<br>• 遇到金光闪烁的黄金水管，成功穿过可一次性奖励双倍积分！'
    },
    {
      id: 'pong',
      title: '变异乒乓：混沌球局',
      subtitle: 'CHAOS PONG: MUTATION BATTLE',
      icon: '🏓',
      category: 'party',
      badge: 'CHAOS AI',
      difficulty: 2,
      tags: ['混沌物理弹射', '巨化/极速/香蕉弧线', '切球旋球削球', '自主对战'],
      desc: '打破传统乒乓物理法则！球体在碰撞中随机触发五大混沌突变：巨型重力球、极速光子球、诡异香蕉弧线球与分身双球，击球瞬间切击可加剧旋转！',
      upHint: '挡板向左平移',
      downHint: '挡板向右平移',
      okHint: '发球 / 极限切旋球',
      help: '• <strong>UP / DOWN</strong>：控制底部防御挡板左右平移接球。<br>• <strong>OK 键</strong>：回合开始时发球；击球瞬间按 OK 可打出高旋转弧线球！<br>• 观察球体突变光芒：紫色巨化、青色极速、黄色香蕉弧线、红光分身双球！'
    },
    {
      id: 'roulette',
      title: '恶魔轮盘：生死对决',
      subtitle: 'BUCKSHOT ROULETTE: NEON DUEL',
      icon: '🎲',
      category: 'party',
      badge: 'PSYCHOLOGY',
      difficulty: 3,
      tags: ['实弹空弹博弈', '霰弹测谎心理战', '手锯双倍威力', '香烟回复战术'],
      desc: '经典的霰弹生死心理博弈！台面上摆着霰弹枪与战术道具，你与恶魔庄家轮流开火。你可以朝对方射击，也可以冒着虚弹风险朝自己射击赢取额外回合！',
      upHint: '选择战术道具',
      downHint: '朝对方恶魔射击',
      okHint: '朝自己射击 / 确认',
      help: '• <strong>DOWN 键</strong>：举枪对准恶魔开火！实弹造成重创，空弹交换回合。<br>• <strong>OK 键</strong>：对准自己开火！若是空弹，本回合不切换，继续由你行动！<br>• <strong>UP 键</strong>：使用放大镜测探当前弹药、手锯使伤害翻倍、香烟回复生命。'
    },
    {
      id: 'fish',
      title: '会躲起来的鱼',
      subtitle: 'HIDING FISH: POCKET BOWL',
      icon: '🐠',
      category: 'creative',
      badge: 'COMPANION',
      difficulty: 1,
      tags: ['对它说话会游过来', '吹气吓跑', '不理就躲进水草', '没有死亡'],
      desc: '鱼缸里只有一条像素鱼。对它说话或按 OK，它会游到玻璃前看着你；轻敲缸壁，藏着的它会探出一只眼；猛吹一口气，它吓得乱窜。长时间不理，它钻进水草，只留下一条晃动的尾巴。没有饥饿，不会死，只有它还在不在看你。',
      upHint: '轻敲缸壁',
      downHint: '白天 / 夜里',
      okHint: '叫它一声 (V说话 / B吹气)',
      help: '• <strong>OK 键</strong>：叫它一声。藏在草里时要叫两回：先探头，再游出来。<br>• <strong>UP 键</strong>：轻敲玻璃。夜里睡着了也可以把它敲醒。<br>• <strong>DOWN 键</strong>：切换白天 / 夜里。夜里安静一会儿它会去草里打盹。<br>• <strong>说话 / V 键</strong>：持续出声，它会游到你面前。<br>• <strong>吹气 / B 键</strong>：猛吹一口，它吓得乱窜，然后可能躲回草里。<br>• 静静看 30 秒，它会害羞地藏起来，只露尾巴。'
    },
    {
      id: 'sparkler',
      title: '星火仙女棒与赛博烛火',
      subtitle: 'SPARKLER & CYBER CANDLE',
      icon: '🎆',
      category: 'creative',
      badge: 'PHYSICAL MIC',
      difficulty: 1,
      tags: ['麦克风真实吹气', '四色烟火爆点', '烛光摇曳物理', '长按重燃'],
      desc: '温暖浪漫的物理粒子互动小品！包含“绚烂仙女棒”与“赛博微光烛火”双模式，对着麦克风吹气（或按B键吹气）火花四溅激荡，猛吹可将蜡烛熄灭并升起缕缕青烟！',
      upHint: '火花燃烧加速',
      downHint: '火花燃烧减速',
      okHint: '切换仙女棒/蜡烛 (按B吹气)',
      help: '• <strong>OK 键</strong>：在【绚烂仙女棒】与【赛博蜡烛】之间双模切换。<br>• <strong>吹气互动</strong>：对着麦克风吹气（或按键盘 <kbd>B</kbd> 键模拟吹气），仙女棒火花狂乱飞舞！<br>• 蜡烛模式下持续猛吹 200ms 可将烛火吹灭，飘出逼真微粒青烟！'
    },
    {
      id: 'worldtime',
      title: '世界时钟：跨时区罗盘',
      subtitle: 'WORLD TIMEZONE COMPANION',
      icon: '⏰',
      category: 'creative',
      badge: 'UTILITY',
      difficulty: 1,
      tags: ['全球城市时区', '昼夜太阳光照', '跨国会议黄金窗口', '指针模拟时钟'],
      desc: '专为全球化极客与出海团队打造的时区对齐罗盘！快速在伦敦、纽约、东京、北京等主流国际都市间轮转，直观指示日出日落昼夜光线，自动推算跨时区会议最佳交集时段！',
      upHint: '上一个国际城市',
      downHint: '下一个国际城市',
      okHint: '推算会议黄金重叠时段',
      help: '• <strong>UP / DOWN</strong>：在全球 12 大国际核心时区都市间自由切换。<br>• 顶部直观展示当前城市的太阳晨昏昼夜轨迹与当地标准时间。<br>• <strong>OK 键</strong>：一键调出跨时区全天候会议对齐矩阵，寻找商务交集重叠黄金时间。'
    },
    {
      id: 'match3',
      title: '赛博晶核消消乐：极速连击',
      subtitle: 'CYBER MATCH-3: NEON POP',
      icon: '💎',
      category: 'chill',
      badge: 'POPULAR',
      difficulty: 2,
      tags: ['三键双步快选', '4/5连激光核与彩虹核', '重力级联掉落', '狂暴连击升调'],
      desc: '专为微掌机三键人机工学定制的赛博霓虹三消！UP/DOWN 线性扫格，OK 锁定方块进入轮盘选向并一键交换。4连合成贯穿激光，5连合成超导彩虹星核，连锁掉落触发持续升调与全屏爆破！',
      upHint: '上移 / 逆时针选向',
      downHint: '下移 / 顺时针选向',
      okHint: '锁定 / 确认交换',
      help: '• <strong>未选中时</strong>：UP/DOWN 快速沿棋盘前后移动光标。<br>• <strong>按 OK 键</strong>：锁定当前宝石，周围出现定向箭头。<br>• <strong>此时按 UP/DOWN</strong>：顺/逆时针切换要交换的相邻方块。<br>• <strong>再次按 OK 键</strong>：确认交换！若未形成消除则自动弹回。<br>• 4 连生成行列激光，5 连生成彩虹全消核！'
    },
    {
      id: 'gearcavalry',
      title: '齿轮骑兵：蒸汽过载',
      subtitle: 'GEAR CAVALRY: STEAM OVERDRIVE',
      icon: '⚙️',
      category: 'action',
      badge: 'STEAMPUNK',
      difficulty: 3,
      tags: ['三键跑酷格斗', '跃马下刺与滑铲', '100PSI蒸汽过载', '黄铜齿轮物理'],
      desc: '蒸汽朋克横版战马破阵动作跑酷！驾驭发条战马在巨型咬合齿轮轴承上疾驰，三键精准切换跃马、下刺、贴地滑铲与长矛突刺。积攒 100 PSI 蒸汽压力开启狂暴过载模式，粉碎一切发条傀儡！',
      upHint: '跃马腾空 / 空中下刺',
      downHint: '俯身滑铲 (碾碎蜘蛛)',
      okHint: '骑枪突刺 / 满气开启过载',
      help: '• <strong>UP 键</strong>：地面按为【跃马跳跃】，空中按为【重骑枪下刺】！<br>• <strong>DOWN 键</strong>：贴地【俯身滑铲】，可高速钻过障碍并碾碎发条蜘蛛。<br>• <strong>OK 键</strong>：向前刺出螺旋骑枪；当蒸汽压力达到 100 PSI 时，按 OK 激活【蒸汽过载】无敌冲撞！'
    },
    {
      id: 'cyberrunner',
      title: '霓虹疾行：影刃闪现',
      subtitle: 'CYBER COURIER: PHANTOM DASH',
      icon: '🥷',
      category: 'action',
      badge: 'CYBERPUNK',
      difficulty: 3,
      tags: ['影刃锁定瞬影斩', '杀怪刷新腾空', '贴墙下滑蹬墙跳', '俯冲震荡波', '赛博高对比霓虹'],
      desc: '赛博朋克大厦屋顶超高机动跑酷！化身穿梭在黄昏天际线上的幽灵信使，二段起跳、贴墙下滑、蹬墙反弹跳、俯冲砸地震荡波。锁定巡逻无人机按 OK 触发【影刃锁定突进斩】，斩爆目标瞬间刷新跳跃与瞬移充能！',
      upHint: '起跳 / 蹬墙反弹跳',
      downHint: '滑铲 / 俯冲砸地震荡波',
      okHint: '影刃突进斩 (杀怪刷新)',
      help: '• <strong>UP 键</strong>：地面【起跳】与【二段跳】；贴墙下滑时按下触发【蹬墙反弹大跳】。<br>• <strong>DOWN 键</strong>：地面【滑铲】；空中按下【极速俯冲】砸地激发震荡波消灭陷阱。<br>• <strong>OK 键</strong>：前方 75px 内锁定无人机时触发【影刃瞬影斩】，直接斩爆目标并【刷新二段跳与回充瞬移能量】，借力爆跃腾空！无目标时触发【幽灵闪现】无敌虚化穿透。'
    }
  ];

  // 挂载全局对象
  global.SoundEngine = SoundEngine;
  global.FXEngine = FXEngine;
  global.GAME_REGISTRY = GAME_REGISTRY;

})(typeof window !== 'undefined' ? window : this);
