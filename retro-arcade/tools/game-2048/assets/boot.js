/**
 * boot.js
 * 2048 启动、触控与视口适配。
 * 必须外置：小红书容器 CSP 不执行 index.html 里的内联脚本。
 * 内联脚本被丢弃时，GameManager 不会创建，棋盘没有数字，按钮也没有监听。
 */
(function(root) {
  "use strict";

  function showError(prefix, err) {
    var box = document.getElementById("debug-error-box");
    if (!box) return;
    var msg = err && err.message ? err.message : String(err || "");
    box.style.display = "block";
    box.textContent = prefix + msg;
  }

  root.addEventListener("error", function(e) {
    showError("Err: ", e && (e.message || e.error || e));
  });
  root.addEventListener("unhandledrejection", function(e) {
    var reason = e && e.reason;
    showError("Rej: ", reason || e);
  });

  root.bindAction = function(target, handler) {
    var el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el || el.getAttribute("data-bound") === "1") return;
    el.setAttribute("data-bound", "1");
    var lastTrigger = 0;
    var lastPointer = 0;

    function doAction(e) {
      var now = Date.now();
      if (now - lastTrigger < 50) return;
      lastTrigger = now;
      if (root.Sound) {
        try { root.Sound.unlock(); } catch (err) {}
      }
      try {
        handler(e);
      } catch (err) {
        showError("Btn: ", err);
      }
    }

    function press() { el.classList.add("btn-pressed"); }
    function release() { el.classList.remove("btn-pressed"); }

    function fromTouch(e) {
      lastPointer = Date.now();
      release();
      if (e && e.cancelable && (e.type === "touchend" || (e.type === "pointerup" && e.pointerType === "touch"))) {
        try { e.preventDefault(); } catch (err) {}
      }
      doAction(e);
    }

    if (root.PointerEvent) {
      el.addEventListener("pointerdown", press);
      el.addEventListener("pointerup", fromTouch);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", release);
    }

    el.addEventListener("touchstart", press, { passive: true });
    el.addEventListener("touchend", fromTouch, { passive: false });
    el.addEventListener("touchcancel", release, { passive: true });
    el.addEventListener("click", function(e) {
      if (Date.now() - lastPointer < 700) return;
      doAction(e);
    });
  };

  root.bindClick = root.bindAction;
  root.bindFastClick = root.bindAction;

  function buttonBottom(button) {
    if (!button || typeof button.bottom !== "number") return 0;
    return button.bottom;
  }

  function applyWindowInsets() {
    var tool = root.xhs && root.xhs.miniTool;
    if (!tool || typeof tool.getWindowInfo !== "function") return;
    var pending = tool.getWindowInfo();
    if (!pending || typeof pending.then !== "function") return;
    pending.then(function(info) {
      if (!info) return;
      var top = 0;
      if (typeof info.statusBarHeight === "number") top = info.statusBarHeight;
      if (info.safeArea && typeof info.safeArea.top === "number") {
        top = Math.max(top, info.safeArea.top);
      }
      var menu = info.menuButtons || {};
      top = Math.max(top, buttonBottom(menu.back), buttonBottom(menu.me), buttonBottom(menu.share));
      var app = document.getElementById("app");
      if (app && top > 0) {
        app.style.paddingTop = Math.ceil(top + 12) + "px";
      }
      fitBoard();
    }).catch(function() {});
  }

  function fitBoard() {
    var board = document.getElementById("game-container");
    var stage = document.getElementById("stage-area");
    if (!board || !stage) return;
    board.style.width = "100%";
    board.style.height = "0px";
    board.style.paddingBottom = "0px";
    var availW = stage.clientWidth || board.parentNode.clientWidth || 300;
    var availH = stage.clientHeight || availW;
    var size = Math.floor(Math.min(availW, availH > 80 ? availH : availW, 360));
    if (size < 140) size = Math.floor(Math.min(availW, 360));
    board.style.width = size + "px";
    board.style.height = size + "px";
    if (root.g2048UI && typeof root.g2048UI.relayout === "function") {
      root.g2048UI.relayout();
    }
  }

  root.fit2048Board = fitBoard;

  function initApp() {
    if (root.Sound) {
      try { root.Sound.unlock(); } catch (e) {}
    }

    var game = new root.GameManager(4, "g2048_state");
    var ui = new root.UIManager(game);
    root.g2048Game = game;
    root.g2048UI = ui;
    fitBoard();

    root.bindAction("btn-dir-left", function() { ui.handleMove(3); });
    root.bindAction("btn-dir-up", function() { ui.handleMove(0); });
    root.bindAction("btn-dir-down", function() { ui.handleMove(2); });
    root.bindAction("btn-dir-right", function() { ui.handleMove(1); });

    root.bindAction("btn-bar-undo", function() { ui.handleUndo(); });

    var btnTheme = document.getElementById("btn-theme");
    if (btnTheme) {
      var currentTheme = "catppuccin";
      try { currentTheme = localStorage.getItem("g2048_theme") || "catppuccin"; } catch (e) {}

      var updateThemeUI = function(theme) {
        if (theme === "latte") {
          document.body.classList.add("theme-latte");
          btnTheme.textContent = "暗夜";
        } else {
          document.body.classList.remove("theme-latte");
          btnTheme.textContent = "奶咖";
        }
      };
      updateThemeUI(currentTheme);

      root.bindAction("btn-theme", function() {
        var isLatte = document.body.classList.contains("theme-latte");
        var nextTheme = isLatte ? "catppuccin" : "latte";
        updateThemeUI(nextTheme);
        try { localStorage.setItem("g2048_theme", nextTheme); } catch (e) {}
        if (root.Sound) { try { root.Sound.playSlide(); } catch (e) {} }
        root.showToast(nextTheme === "latte" ? "已切换至燕麦奶咖主题" : "已切换至莫兰迪暗夜主题");
      });
    }

    var guideModal = document.getElementById("guide-modal");
    var guideOpenedAt = 0;
    function closeGuide() {
      if (!guideModal) return;
      guideModal.style.display = "none";
      guideModal.classList.remove("open");
    }
    root.bindAction("btn-guide", function() {
      if (!guideModal) return;
      guideOpenedAt = Date.now();
      guideModal.style.display = "flex";
      guideModal.classList.add("open");
    });
    root.bindAction("guide-close", closeGuide);
    if (guideModal) {
      guideModal.addEventListener("click", function(e) {
        if (Date.now() - guideOpenedAt < 450) return;
        if (e.target === guideModal) closeGuide();
      });
    }

    root.bindAction("btn-bar-restart", function() { ui.handleRestart(); });

    var btnReset = document.getElementById("btn-reset");
    var resetArmed = false;
    var resetTimer = null;
    if (btnReset) {
      root.bindAction("btn-reset", function() {
        if (!resetArmed) {
          resetArmed = true;
          btnReset.textContent = "确认重置？";
          btnReset.classList.add("btn-armed");
          root.showToast("再次点击以确认重置当前对局");
          if (root.Sound) { try { root.Sound.playSlide(); } catch (e) {} }
          clearTimeout(resetTimer);
          resetTimer = setTimeout(function() {
            resetArmed = false;
            btnReset.textContent = "复位";
            btnReset.classList.remove("btn-armed");
          }, 4000);
        } else {
          resetArmed = false;
          clearTimeout(resetTimer);
          btnReset.textContent = "复位";
          btnReset.classList.remove("btn-armed");
          ui.handleRestart();
          root.showToast("已重置对局");
        }
      });
    }

    root.bindAction("btn-leaderboard", function() {
      if (root.openLeaderboard) root.openLeaderboard(game.score);
    });

    var btnSound = document.getElementById("btn-sound");
    if (btnSound) {
      var updateSoundUI = function() {
        var muted = root.Sound && root.Sound.isMuted();
        btnSound.textContent = muted ? "静音" : "声音";
        btnSound.style.opacity = muted ? "0.6" : "1";
      };
      updateSoundUI();
      root.bindAction("btn-sound", function() {
        if (!root.Sound) return;
        var nextMuted = !root.Sound.isMuted();
        root.Sound.setMute(nextMuted);
        updateSoundUI();
        if (!nextMuted) {
          try { root.Sound.playSlide(); } catch (e) {}
        }
        root.showToast(nextMuted ? "已静音" : "声音已开启");
      });
    }

    applyWindowInsets();
    root.addEventListener("resize", fitBoard);
    root.addEventListener("orientationchange", function() {
      setTimeout(fitBoard, 60);
    });
    setTimeout(fitBoard, 60);
    setTimeout(function() {
      var tiles = document.querySelectorAll("#tile-container .tile-inner");
      if (!tiles.length && root.g2048UI) {
        root.g2048UI.handleRestart();
        fitBoard();
      }
    }, 240);
  }

  root.showToast = function(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(root._toastTimer);
    root._toastTimer = setTimeout(function() {
      t.classList.remove("show");
    }, 1800);
  };

  function start() {
    try {
      initApp();
    } catch (err) {
      showError("Boot: ", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : this);
