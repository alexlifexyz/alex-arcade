/**
 * main.js
 * 《沉浸式桌面收纳家》页面总入口控制器
 */
(function() {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const levelBadge = document.getElementById("level-badge");
  const levelName = document.getElementById("level-name");
  const levelDesc = document.getElementById("level-desc");
  const timerEl = document.getElementById("timer-display");
  const hintTextEl = document.getElementById("hint-text");
  const trayScroll = document.getElementById("tray-scroll");
  const trayStatus = document.getElementById("tray-status");

  const btnRotate = document.getElementById("btn-rotate");
  const btnRecall = document.getElementById("btn-recall");
  const btnReset = document.getElementById("btn-reset");
  const btnLevels = document.getElementById("btn-levels");

  const levelModal = document.getElementById("level-modal");
  const levelModalClose = document.getElementById("level-modal-close");
  const levelListEl = document.getElementById("level-list-items");

  // 格式化秒数为 mm:ss
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  // 极速防抖点击绑定
  function bindFastClick(el, handler) {
    if (!el) return;
    let lastTime = 0;
    const trigger = function(e) {
      if (e) {
        e.stopPropagation();
        if (e.cancelable && e.type === "touchend") e.preventDefault();
      }
      const now = Date.now();
      if (now - lastTime < 250) return;
      lastTime = now;
      handler(e);
    };
    el.addEventListener("touchend", trigger, { passive: false });
    el.addEventListener("click", trigger);
  }

  // 更新托盘展示
  function updateTray(items, selectedItem) {
    if (!trayScroll) return;
    trayScroll.innerHTML = "";

    const unplaced = items.filter(it => !it.isPlaced);
    if (trayStatus) {
      trayStatus.textContent = unplaced.length > 0 ? `待收纳: ${unplaced.length}` : "全部归位！";
      trayStatus.style.color = unplaced.length > 0 ? "#e11d48" : "#16a34a";
    }

    // 更新引导提示文字
    if (hintTextEl) {
      if (unplaced.length === 0) {
        hintTextEl.textContent = "太棒了！所有物品已全部归位，正在结算星级...";
      } else if (selectedItem && !selectedItem.isPlaced) {
        hintTextEl.textContent = `已选中【${selectedItem.name}】，轻触收纳盒网格放入，或点击【旋转】`;
      } else if (selectedItem && selectedItem.isPlaced) {
        hintTextEl.textContent = `已选中盒内【${selectedItem.name}】，可旋转、拖动或点击【放回托盘】`;
      } else {
        hintTextEl.textContent = "轻触托盘物品选中，点击收纳盒网格直接放入";
      }
    }

    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "tray-item" + (item.isPlaced ? " placed" : "") + (item === selectedItem ? " active" : "");

      // 缩略图 Canvas
      const thumb = document.createElement("canvas");
      thumb.className = "tray-item-thumb";
      thumb.width = 44;
      thumb.height = 44;
      const tCtx = thumb.getContext("2d");
      drawThumb(tCtx, item);
      el.appendChild(thumb);

      // 物品名称标签
      const nameTag = document.createElement("span");
      nameTag.className = "tray-item-name";
      nameTag.textContent = item.name.slice(0, 4);
      el.appendChild(nameTag);

      // 轻触选中
      bindFastClick(el, function() {
        window.TidyGame.selectItem(item);
        if (window.TidyAudio) window.TidyAudio.playPick();
      });

      // 支持长按拖起
      let startX = 0;
      let startY = 0;
      let isDraggingFromTray = false;

      el.addEventListener("touchstart", function(e) {
        if (item.isPlaced) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isDraggingFromTray = false;
      }, { passive: true });

      el.addEventListener("touchmove", function(e) {
        if (item.isPlaced || isDraggingFromTray) return;
        const touch = e.touches[0];
        const dy = touch.clientY - startY;
        const dx = touch.clientX - startX;
        // 如果向上拖拽超过 15px 且 y 轴移动大于 x 轴，转入拖拽模式
        if (dy < -15 && Math.abs(dy) > Math.abs(dx)) {
          isDraggingFromTray = true;
          window.TidyGame.pickupFromTray(item, touch.clientX, touch.clientY);
          if (e.cancelable) e.preventDefault();
        }
      }, { passive: false });

      trayScroll.appendChild(el);
    });
  }

  function drawThumb(ctx, item) {
    const shape = item.shape;
    const rows = shape.length;
    const cols = shape[0].length;
    const maxDim = Math.max(rows, cols);
    const size = Math.floor(36 / maxDim);
    const ox = Math.round((44 - cols * size) / 2);
    const oy = Math.round((44 - rows * size) / 2);

    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.accentColor;
    ctx.lineWidth = 1.5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (shape[r][c]) {
          const x = ox + c * size;
          const y = oy + r * size;
          ctx.beginPath();
          ctx.rect(x + 1, y + 1, size - 2, size - 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  // 渲染关卡选择抽屉
  function renderLevelList() {
    if (!levelListEl || !window.TIDY_LEVELS) return;
    levelListEl.innerHTML = "";
    const progress = window.TidyLeaderboard.getUserProgress() || {};
    const curLevel = window.TidyGame.getCurrentLevel();

    window.TIDY_LEVELS.forEach((lvl, idx) => {
      const btn = document.createElement("div");
      btn.className = "level-card-btn" + (curLevel && curLevel.id === lvl.id ? " active" : "");

      const prog = progress[lvl.id];
      const starsStr = prog ? "★".repeat(prog.stars) : "未通关";
      const bestStr = prog ? `${prog.bestTime}s` : "--";

      btn.innerHTML = `
        <div class="level-card-info">
          <div class="level-card-name">第 ${lvl.id} 关 · ${lvl.name}</div>
          <div class="level-card-desc">${lvl.subtitle}</div>
        </div>
        <div class="level-card-best">${starsStr} (${bestStr})</div>
      `;

      bindFastClick(btn, function() {
        if (levelModal) levelModal.style.display = "none";
        window.TidyGame.loadLevel(idx);
      });

      levelListEl.appendChild(btn);
    });
  }

  // 初始化游戏
  function startup() {
    window.TidyGame.init(canvas, {
      onComplete: function(result) {
        window.TidyLeaderboard.recordLevelResult(result);
        window.TidyLeaderboard.showWinModal(result);
      },
      onStateChange: function(state) {
        if (state.time !== undefined && timerEl) {
          timerEl.textContent = formatTime(state.time);
        }
        if (state.level) {
          if (levelBadge) levelBadge.textContent = `第 ${state.level.id} 关`;
          if (levelName) levelName.textContent = state.level.name;
          if (levelDesc) levelDesc.textContent = state.level.subtitle;
        }
        if (state.items) {
          updateTray(state.items, state.selected || window.TidyGame.getSelectedItem());
        }
      }
    });

    window.TidyLeaderboard.bindUI();

    // 绑定底部工具按键
    if (btnRotate) {
      bindFastClick(btnRotate, function() {
        window.TidyGame.rotateItem();
      });
    }

    if (btnRecall) {
      bindFastClick(btnRecall, function() {
        window.TidyGame.recallSelectedItem();
      });
    }

    if (btnReset) {
      bindFastClick(btnReset, function() {
        window.TidyGame.resetLevel();
        window.TidyLeaderboard.showToast("已重置当前收纳关卡");
      });
    }

    if (btnLevels) {
      bindFastClick(btnLevels, function() {
        renderLevelList();
        if (levelModal) levelModal.style.display = "flex";
      });
    }

    if (levelModalClose) {
      bindFastClick(levelModalClose, function() {
        if (levelModal) levelModal.style.display = "none";
      });
    }

    // 强制触发一次视口尺寸更新
    window.TidyGame.handleResize();

    // 加载第 1 关
    window.TidyGame.loadLevel(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startup);
  } else {
    startup();
  }
})();
