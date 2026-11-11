/**
 * ui.js
 * 2048 现代高颜值纯血旗舰版 - DOM 渲染与手势交互器
 * 负责 60fps 硬件加速平滑动画、严丝合缝栅格坐标计算、手势滑动与触感振动
 */
(function(root) {
  "use strict";

  function UIManager(game) {
    this.game = game;
    this.tileContainer = document.getElementById("tile-container");
    this.scoreElement = document.getElementById("current-score");
    this.bestElement = document.getElementById("best-score");
    this.scoreAddition = document.getElementById("score-addition");
    this.tileMap = {}; // id -> element 缓存，驱动连续平滑滑动动画

    this.setupEvents();
    // 立即执行一次同步渲染，确保 DOM 中 0ms 瞬间就绪数字方块！
    this.renderTilesSync();
    this.update();
  }

  UIManager.prototype.setupEvents = function() {
    var self = this;

    // 触摸手势与鼠标拖拽监听 (绑定在对弈区容器，容错率极高，绝不干扰外部按钮)
    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;
    var isDragging = false;
    var stageArea = document.getElementById("stage-area") || document.getElementById("game-container");

    function processGesture(endX, endY, dur) {
      if (!touchStartX && !touchStartY) return;
      var dx = endX - touchStartX;
      var dy = endY - touchStartY;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);

      // 滑动判定阈值 14px，1200ms 内完成，极速响应，绝不漏划
      if (Math.max(absDx, absDy) > 14 && dur < 1200) {
        if (absDx > absDy) {
          self.handleMove(dx > 0 ? 1 : 3); // 1: 右, 3: 左
        } else {
          self.handleMove(dy > 0 ? 2 : 0); // 2: 下, 0: 上
        }
      } else if (dur < 800) {
        // 轻点/戳击棋盘 (Tap-to-move)：用户直接点击棋盘象限
        var targetContainer = document.getElementById("game-container") || stageArea;
        var rect = targetContainer.getBoundingClientRect();
        var clickX = endX - rect.left;
        var clickY = endY - rect.top;
        var relX = clickX / rect.width;
        var relY = clickY / rect.height;

        // 计算距离上、下、左、右四边的相对距离
        var dTop = relY;
        var dBottom = 1 - relY;
        var dLeft = relX;
        var dRight = 1 - relX;
        var minD = Math.min(dTop, dBottom, dLeft, dRight);

        if (minD === dTop) {
          self.handleMove(0); // 上
        } else if (minD === dBottom) {
          self.handleMove(2); // 下
        } else if (minD === dLeft) {
          self.handleMove(3); // 左
        } else {
          self.handleMove(1); // 右
        }
      }
      touchStartX = 0;
      touchStartY = 0;
      touchStartTime = 0;
      isDragging = false;
    }

    if (stageArea) {
      stageArea.addEventListener("touchstart", function(e) {
        if (root.Sound) { try { root.Sound.unlock(); } catch(err) {} }
        if (e.touches.length > 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }, { passive: true });

      stageArea.addEventListener("touchmove", function(e) {
        if (e.cancelable) e.preventDefault();
      }, { passive: false });

      stageArea.addEventListener("touchend", function(e) {
        if (!touchStartTime) return;
        var endX = e.changedTouches[0].clientX;
        var endY = e.changedTouches[0].clientY;
        processGesture(endX, endY, Date.now() - touchStartTime);
      }, { passive: false });

      stageArea.addEventListener("touchcancel", function() {
        touchStartX = 0;
        touchStartY = 0;
        touchStartTime = 0;
      }, { passive: true });

      // 桌面端鼠标拖拽仿真支持
      stageArea.addEventListener("mousedown", function(e) {
        if (root.Sound) { try { root.Sound.unlock(); } catch(err) {} }
        isDragging = true;
        touchStartX = e.clientX;
        touchStartY = e.clientY;
        touchStartTime = Date.now();
      });

      window.addEventListener("mouseup", function(e) {
        if (!isDragging) return;
        processGesture(e.clientX, e.clientY, Date.now() - touchStartTime);
      });
    }

    // 键盘支持 (桌面调试)
    window.addEventListener("keydown", function(e) {
      var map = { 38: 0, 87: 0, 39: 1, 68: 1, 40: 2, 83: 2, 37: 3, 65: 3 };
      if (map[e.keyCode] !== undefined) {
        e.preventDefault();
        self.handleMove(map[e.keyCode]);
      } else if (e.keyCode === 90 && (e.ctrlKey || e.metaKey)) {
        self.handleUndo();
      }
    });
  };

  UIManager.prototype.handleMove = function(direction) {
    if (this.game.over) return;
    var res = this.game.move(direction);
    if (res.moved) {
      if (root.Sound) { try { root.Sound.playSlide(); } catch(e) {} }

      if (res.mergedValues && res.mergedValues.length > 0) {
        var maxMerged = Math.max.apply(null, res.mergedValues);
        if (root.Sound) { try { root.Sound.playMerge(maxMerged); } catch(e) {} }
        if (window.xhsBridge) { try { window.xhsBridge.vibrate("light"); } catch(e) {} }
      }

      this.update(res.scoreAdded);

      if (res.won) {
        if (root.Sound) { try { root.Sound.playVictory(); } catch(e) {} }
        this.showWinModal();
      }

      if (res.over) {
        this.handleGameOver();
      }
    } else {
      // 触碰不可移动边界，提供即时微震触觉反馈
      var container = document.getElementById("game-container");
      if (container) {
        container.classList.remove("shake");
        void container.offsetWidth;
        container.classList.add("shake");
      }
    }
  };

  UIManager.prototype.handleUndo = function() {
    var success = this.game.undo();
    if (success) {
      this.tileMap = {};
      if (this.tileContainer) {
        this.tileContainer.innerHTML = "";
      }
      if (window.xhsBridge) { try { window.xhsBridge.vibrate("light"); } catch(e) {} }
      if (root.Sound) { try { root.Sound.playSlide(); } catch(e) {} }
      this.renderTilesSync();
      this.update();
      if (window.showToast) window.showToast("已撤回上一步");
    } else {
      if (window.showToast) window.showToast("暂无可撤回步骤 (请先按方向键或滑动走一步)");
    }
  };

  UIManager.prototype.handleRestart = function() {
    this.tileMap = {};
    if (this.tileContainer) {
      this.tileContainer.innerHTML = "";
    }
    this.game.restart();
    this.renderTilesSync();
    this.update();
    if (window.showToast) window.showToast("新一局已就绪！");
  };

  UIManager.prototype.handleGameOver = function() {
    var finalScore = this.game.score;
    var maxTile = this.game.getMaxTileValue();

    setTimeout(function() {
      if (window.onGame2048Over) {
        window.onGame2048Over({
          score: finalScore,
          maxTile: maxTile
        });
      }
    }, 500);
  };

  UIManager.prototype.showWinModal = function() {
    var modal = document.getElementById("win-modal");
    if (modal) {
      modal.style.display = "flex";
      modal.classList.add("open");
      var self = this;
      var bind = window.bindClick || function(el, fn) {
        if (typeof el === "string") el = document.getElementById(el);
        if (el) el.onclick = fn;
      };

      bind("btn-win-keep", function() {
        modal.style.display = "none";
        modal.classList.remove("open");
        self.game.keepPlaying = true;
        self.game.saveState();
      });

      bind("btn-win-rank", function() {
        modal.style.display = "none";
        modal.classList.remove("open");
        self.game.keepPlaying = true;
        self.game.saveState();
        if (window.openLeaderboard) window.openLeaderboard(self.game.score);
      });
    }
  };

  UIManager.prototype.update = function(scoreAdded) {
    var self = this;
    window.requestAnimationFrame(function() {
      if (self.scoreElement) {
        self.scoreElement.textContent = self.game.score.toLocaleString();
      }
      if (self.bestElement) {
        self.bestElement.textContent = self.game.bestScore.toLocaleString();
      }

      if (scoreAdded && scoreAdded > 0 && self.scoreAddition) {
        self.scoreAddition.textContent = "+" + scoreAdded;
        self.scoreAddition.classList.remove("pop");
        void self.scoreAddition.offsetWidth;
        self.scoreAddition.classList.add("pop");
      }

      self.renderTiles();
    });
  };

  // 同步立即全量渲染，0ms 直出数字方块
  UIManager.prototype.renderTilesSync = function() {
    this.renderTiles();
  };

  UIManager.prototype.renderTiles = function() {
    var self = this;
    var currentTiles = {};

    this.game.grid.eachCell(function(x, y, tile) {
      if (tile) {
        currentTiles[tile.id] = tile;
        self.renderTile(tile);
      }
    });

    Object.keys(this.tileMap).forEach(function(id) {
      if (!currentTiles[id]) {
        var el = self.tileMap[id];
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
        delete self.tileMap[id];
      }
    });
  };

  // 双层解耦 DOM 架构：外层负责位移与过渡，内层负责背景、文字与出现缩放
  UIManager.prototype.renderTile = function(tile) {
    var el = this.tileMap[tile.id];

    if (!el) {
      el = document.createElement("div");
      el.className = "tile tile-" + tile.value + " tile-new";
      
      var inner = document.createElement("div");
      inner.className = "tile-inner";
      if (String(tile.value).length >= 3) {
        inner.setAttribute("data-digits", String(tile.value).length);
      }
      inner.textContent = tile.value;
      el.appendChild(inner);

      if (this.tileContainer) {
        this.tileContainer.appendChild(el);
      }
      this.tileMap[tile.id] = el;
      this.positionTile(el, tile.x, tile.y);
    } else {
      this.positionTile(el, tile.x, tile.y);

      var inner = el.querySelector(".tile-inner");
      if (!inner) {
        inner = document.createElement("div");
        inner.className = "tile-inner";
        el.appendChild(inner);
      }

      var currentVal = parseInt(inner.textContent, 10);
      if (currentVal !== tile.value) {
        el.className = "tile tile-" + tile.value + " tile-merged";
        if (String(tile.value).length >= 3) {
          inner.setAttribute("data-digits", String(tile.value).length);
        }
        inner.textContent = tile.value;
      }
    }
  };

  UIManager.prototype.measureCell = function() {
    var box = this.tileContainer;
    var size = box ? box.clientWidth : 0;
    var gap = 8;
    if (size < 40) return { cell: 0, gap: gap };
    return { cell: (size - gap * 3) / 4, gap: gap };
  };

  // 用实测像素定位。部分真机 WebView 会丢弃 transform 里的 calc()，方块会叠在 0,0 且宽高为 0。
  UIManager.prototype.positionTile = function(el, x, y) {
    el.setAttribute("data-x", String(x));
    el.setAttribute("data-y", String(y));
    var m = this.measureCell();
    if (m.cell <= 1) {
      el.style.left = (x * 25) + "%";
      el.style.top = (y * 25) + "%";
      return;
    }
    var px = x * (m.cell + m.gap);
    var py = y * (m.cell + m.gap);
    el.style.width = m.cell + "px";
    el.style.height = m.cell + "px";
    el.style.left = px + "px";
    el.style.top = py + "px";
    el.style.transform = "none";
  };

  UIManager.prototype.relayout = function() {
    var self = this;
    Object.keys(this.tileMap).forEach(function(id) {
      var el = self.tileMap[id];
      if (!el) return;
      var x = parseInt(el.getAttribute("data-x"), 10);
      var y = parseInt(el.getAttribute("data-y"), 10);
      if (isNaN(x) || isNaN(y)) return;
      self.positionTile(el, x, y);
    });
  };

  root.UIManager = UIManager;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));