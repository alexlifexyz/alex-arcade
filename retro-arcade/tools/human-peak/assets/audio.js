/**
 * audio.js
 * 《人类极限挑战》电影级 Web Audio 触感科技音效引擎
 * 采用双声道混合合成：重低音物理打击 + 晶体瞬态高频 + 电光多重泛音和弦
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PeakAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  let audioCtx = null;
  let isMuted = false;

  function getAudioContext() {
    if (!audioCtx && (typeof window !== "undefined")) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // 1. 高级机械轴触感打击音 (Sub-bass 低音下潜 + 晶体清脆短脉冲)
  function playTap() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 分量 A: 重低音物理击发 (Sub-bass Thump)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(130, t);
    subOsc.frequency.exponentialRampToValueAtTime(45, t + 0.045);
    subGain.gain.setValueAtTime(0.28, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(t);
    subOsc.stop(t + 0.045);

    // 分量 B: 晶体金属瞬态 (High Click)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = "triangle";
    clickOsc.frequency.setValueAtTime(1400, t);
    clickOsc.frequency.exponentialRampToValueAtTime(700, t + 0.02);
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(t);
    clickOsc.stop(t + 0.02);
  }

  // 2. 专注凝视心跳双音 (低频双脉冲 "咚...咚...")
  function playReady() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    [0, 0.09].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + delay;
      const vol = idx === 0 ? 0.25 : 0.16;

      osc.type = "sine";
      osc.frequency.setValueAtTime(75, st);
      osc.frequency.exponentialRampToValueAtTime(42, st + 0.08);

      gain.gain.setValueAtTime(vol, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(st);
      osc.stop(st + 0.08);
    });
  }

  // 3. 绿光瞬发通电激发音 (三重电光科技和弦 1046Hz, 1318Hz, 1568Hz)
  function playGreen() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const freqs = [1046.5, 1318.5, 1567.98]; // C6, E6, G6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.09);

      gain.gain.setValueAtTime(0.18 / (idx + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  }

  // 4. 抢跑与失误阻尼音
  function playWarning() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.setValueAtTime(110, t + 0.08);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // 5. 突破纪录未来科技升级和弦 (C5 -> E5 -> G5 -> B5 -> C6)
  function playWin() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99, 987.77, 1046.50];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.06;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.22, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(st);
      osc.stop(st + 0.3);
    });
  }

  // 6. 相机截屏快门机械咔嚓音
  function playShutter() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 第一声微小预咔
    const click1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    click1.type = "sine";
    click1.frequency.setValueAtTime(800, t);
    gain1.gain.setValueAtTime(0.2, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    click1.connect(gain1);
    gain1.connect(ctx.destination);
    click1.start(t);
    click1.stop(t + 0.015);

    // 第二声主快门合拢
    const click2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    click2.type = "triangle";
    click2.frequency.setValueAtTime(320, t + 0.035);
    gain2.gain.setValueAtTime(0.25, t + 0.035);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    click2.connect(gain2);
    gain2.connect(ctx.destination);
    click2.start(t + 0.035);
    click2.stop(t + 0.08);
  }

  function playTick(isLast) {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isLast ? 1320 : 880, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  function toggleMute() {
    isMuted = !isMuted;
    return isMuted;
  }

  return {
    playTap: playTap,
    playReady: playReady,
    playGreen: playGreen,
    playWarning: playWarning,
    playWin: playWin,
    playShutter: playShutter,
    playTick: playTick,
    toggleMute: toggleMute,
    isMuted: () => isMuted
  };
});
