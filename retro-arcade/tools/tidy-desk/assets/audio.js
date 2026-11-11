/**
 * audio.js
 * 《沉浸式桌面收纳家》纯 Web Audio 拟真音效合成引擎
 * 针对解压强迫症设计：超逼真清脆磁吸咔嗒声、轻柔气泡拾起、风铃转动与八音盒治愈通关和弦
 * 零外部音频文件依赖，首屏毫秒级响应
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TidyAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  let audioCtx = null;
  let isMuted = false;

  try {
    isMuted = localStorage.getItem("tidy_desk_sound_muted") === "1";
  } catch (_) {}

  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // 移动端手势唤醒与硬件 DAC 破冰
  function activateAudio() {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const dummy = ctx.createBuffer(1, 1, 44100);
      const src = ctx.createBufferSource();
      src.buffer = dummy;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
  }

  if (typeof document !== "undefined") {
    ["touchstart", "touchend", "click", "mousedown"].forEach(evt => {
      document.addEventListener(evt, activateAudio, { capture: true, passive: true });
    });
  }

  return {
    activateAudio: activateAudio,

    isMuted: function() {
      return isMuted;
    },

    setMute: function(muted) {
      isMuted = !!muted;
      try {
        localStorage.setItem("tidy_desk_sound_muted", isMuted ? "1" : "0");
      } catch (_) {}
    },

    toggleMute: function() {
      this.setMute(!isMuted);
      return isMuted;
    },

    // 1. 物体拾起：轻快饱满的治愈气泡升调音
    playPick: function() {
      if (isMuted) return;
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.08);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    },

    // 2. 磁吸卡位：极度清脆爽快的微拟物木质/磁吸咔嗒声（双脉冲高阻尼）
    playSnap: function() {
      if (isMuted) return;
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 主点击脉冲
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(240, now + 0.04);

      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.06);

      // 微木盒共鸣回响
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1420, now + 0.015);
      osc2.frequency.exponentialRampToValueAtTime(620, now + 0.055);

      gain2.gain.setValueAtTime(0.01, now);
      gain2.gain.setValueAtTime(0.25, now + 0.015);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.015);
      osc2.stop(now + 0.08);

      // 尝试触发小红书客户端短振动
      if (typeof window !== "undefined" && window.xhsBridge && typeof window.xhsBridge.vibrate === "function") {
        window.xhsBridge.vibrate("light");
      }
    },

    // 3. 旋转微调：风铃般的灵动滑动音
    playRotate: function() {
      if (isMuted) return;
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.07);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    },

    // 4. 重叠碰撞/无法放下：柔和阻尼拒绝低音
    playError: function() {
      if (isMuted) return;
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    },

    // 5. 完美收纳过关：高贵治愈的八音盒五和弦连奏
    playWin: function() {
      if (isMuted) return;
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      // C大调琶音 (C5, E5, G5, B5, C6)
      const freqs = [523.25, 659.25, 783.99, 987.77, 1046.50];
      freqs.forEach((freq, idx) => {
        const start = now + idx * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.24, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.48);
      });

      if (typeof window !== "undefined" && window.xhsBridge && typeof window.xhsBridge.vibrate === "function") {
        window.xhsBridge.vibrate("heavy");
      }
    }
  };
});
