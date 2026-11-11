/**
 * audio.js
 * 纯 Web Audio 极简木质打击乐与和弦合成音效
 * 具备 iOS WebKit 硬件通电破冰与小红书容器 enableAudio 契约
 */
(function(root) {
  "use strict";

  var ctx = null;
  var isMuted = false;
  var unlocked = false;

  try {
    isMuted = localStorage.getItem("g2048_sound_muted") === "1";
  } catch(e) {}

  function getAudioContext() {
    if (!ctx) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    return ctx;
  }

  // 深度唤醒硬件 DAC
  function unlock() {
    if (window.xhs && window.xhs.miniTool && typeof window.xhs.miniTool.enableAudio === "function") {
      try { window.xhs.miniTool.enableAudio(); } catch(e) {}
    }

    var ac = getAudioContext();
    if (!ac) return;

    if (ac.state === "suspended") {
      try { ac.resume(); } catch(e) {}
    }

    if (!unlocked) {
      try {
        var dummy = ac.createBuffer(1, 1, 22050);
        var src = ac.createBufferSource();
        src.buffer = dummy;
        src.connect(ac.destination);
        src.start(0);
        unlocked = true;
      } catch(e) {}
    }
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    ["touchstart", "touchend", "touchmove", "click", "keydown", "mousedown"].forEach(function(evt) {
      window.addEventListener(evt, unlock, { once: false, passive: true });
    });
  }

  var Sound = {
    isMuted: function() {
      return isMuted;
    },
    setMute: function(muted) {
      isMuted = !!muted;
      try {
        localStorage.setItem("g2048_sound_muted", isMuted ? "1" : "0");
      } catch(e) {}
    },
    unlock: unlock,

    // 滑动微风清脆音
    playSlide: function() {
      if (isMuted) return;
      unlock();
      var ac = getAudioContext();
      if (!ac) return;
      if (ac.state === "suspended") {
        try { ac.resume(); } catch(e) {}
      }

      try {
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = "sine";
        var t = ac.currentTime;
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(480, t + 0.08);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.08);
      } catch(e) {}
    },

    // 方块合并马林巴木质打击音 (音高根据数值提升，清晰通透)
    playMerge: function(val) {
      if (isMuted) return;
      unlock();
      var ac = getAudioContext();
      if (!ac) return;
      if (ac.state === "suspended") {
        try { ac.resume(); } catch(e) {}
      }

      try {
        var baseFreq = 329.63; // E4
        var pitchMap = {
          4: 349.23,   // F4
          8: 392.00,   // G4
          16: 440.00,  // A4
          32: 493.88,  // B4
          64: 523.25,  // C5
          128: 587.33, // D5
          256: 659.25, // E5
          512: 698.46, // F5
          1024: 783.99,// G5
          2048: 880.00 // A5
        };
        var freq = pitchMap[val] || (baseFreq * Math.min(val / 4, 3.5));
        var t = ac.currentTime;

        var osc1 = ac.createOscillator();
        var osc2 = ac.createOscillator();
        var gain = ac.createGain();

        osc1.type = "triangle";
        osc2.type = "sine";
        osc1.frequency.setValueAtTime(freq, t);
        osc2.frequency.setValueAtTime(freq * 2.01, t);

        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ac.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.22);
        osc2.stop(t + 0.22);
      } catch(e) {}
    },

    // 达成 2048 华丽升阶和弦
    playVictory: function() {
      if (isMuted) return;
      unlock();
      var ac = getAudioContext();
      if (!ac) return;
      if (ac.state === "suspended") {
        try { ac.resume(); } catch(e) {}
      }

      try {
        var notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach(function(f, idx) {
          var t = ac.currentTime + idx * 0.09;
          var osc = ac.createOscillator();
          var gain = ac.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.connect(gain);
          gain.connect(ac.destination);
          osc.start(t);
          osc.stop(t + 0.35);
        });
      } catch(e) {}
    }
  };

  root.Sound = Sound;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Sound;
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));