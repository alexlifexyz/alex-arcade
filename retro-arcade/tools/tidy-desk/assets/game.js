/**
 * game.js
 * 《沉浸式桌面收纳家》核心游戏引擎 (真机顺滑触控重构版)
 * 特性：
 * 1. 深度适配移动端：点选落子 (Tap-to-Place) 与 全局跟手拖拽 (Global Drag & Drop) 双模无缝支持；
 * 2. 毫秒级智能网格吸附与空位智能寻址；
 * 3. 旋转矩阵变换、微拟物高光矢量绘制、八音盒通关和弦。
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TidyGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  let canvas = null;
  let ctx = null;
  let currentLevelIdx = 0;
  let currentLevel = null;

  // 网格容器参数
  let cellSize = 44;
  let gridOffsetX = 0;
  let gridOffsetY = 0;
  let gridMatrix = []; // [row][col] -> itemId | null

  // 物品运行态对象列表
  let activeItems = [];
  let draggingItem = null;
  let dragOffset = { x: 0, y: 0 };
  let selectedItem = null;

  // 悬浮指示落点
  let hoverCol = -1;
  let hoverRow = -1;

  // 游戏计时与步数
  let startTime = 0;
  let elapsedTime = 0;
  let timerInterval = null;
  let stepsCount = 0;
  let isCompleted = false;

  // 回调挂钩
  let onCompleteCallback = null;
  let onStateChangeCallback = null;

  // 顺时针 90 度旋转矩阵
  function rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const res = [];
    for (let c = 0; c < cols; c++) {
      res[c] = [];
      for (let r = rows - 1; r >= 0; r--) {
        res[c].push(matrix[r][c]);
      }
    }
    return res;
  }

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    if (callbacks) {
      onCompleteCallback = callbacks.onComplete;
      onStateChangeCallback = callbacks.onStateChange;
    }
    bindGlobalEvents();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", () => setTimeout(handleResize, 150));
    handleResize();
  }

  function handleResize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setTimeout(handleResize, 50);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    recalcLayout();
    render();
  }

  function recalcLayout() {
    if (!currentLevel || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const cols = currentLevel.cols;
    const rows = currentLevel.rows;

    // 动态计算适合当前屏幕区域的单元格尺寸，四周预留舒展呼吸感
    const maxGridW = w - 28;
    const maxGridH = h - 24;
    const sizeByW = Math.floor(maxGridW / cols);
    const sizeByH = Math.floor(maxGridH / rows);
    cellSize = Math.min(Math.max(Math.min(sizeByW, sizeByH), 36), 62);

    const totalGridW = cols * cellSize;
    const totalGridH = rows * cellSize;

    gridOffsetX = Math.round((w - totalGridW) / 2);
    gridOffsetY = Math.round((h - totalGridH) / 2);
  }

  function loadLevel(idx) {
    if (!window.TIDY_LEVELS || !window.TIDY_LEVELS[idx]) return;
    currentLevelIdx = idx;
    currentLevel = window.TIDY_LEVELS[idx];
    isCompleted = false;
    stepsCount = 0;
    elapsedTime = 0;
    startTime = Date.now();
    draggingItem = null;
    selectedItem = null;
    hoverCol = -1;
    hoverRow = -1;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!isCompleted) {
        elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        if (onStateChangeCallback) onStateChangeCallback({ time: elapsedTime, steps: stepsCount });
      }
    }, 1000);

    // 初始化网格占用矩阵
    gridMatrix = [];
    for (let r = 0; r < currentLevel.rows; r++) {
      gridMatrix[r] = [];
      for (let c = 0; c < currentLevel.cols; c++) {
        gridMatrix[r][c] = null;
      }
    }

    // 初始化物品运行态
    activeItems = currentLevel.items.map(item => ({
      id: item.id,
      name: item.name,
      shape: JSON.parse(JSON.stringify(item.shape)),
      color: item.color,
      accentColor: item.accentColor,
      detailType: item.detailType,
      isPlaced: false,
      gridCol: -1,
      gridRow: -1,
      rot: 0,
      renderX: 0,
      renderY: 0
    }));

    // 默认选中第一个未放置的物品
    selectedItem = activeItems[0] || null;

    recalcLayout();
    render();
    if (onStateChangeCallback) {
      onStateChangeCallback({
        time: 0,
        steps: 0,
        level: currentLevel,
        items: activeItems,
        selected: selectedItem
      });
    }
  }

  function resetLevel() {
    loadLevel(currentLevelIdx);
  }

  // 检查网格区域是否可放置指定物品
  function canPlace(item, col, row, currentGrid) {
    const grid = currentGrid || gridMatrix;
    const shape = item.shape;
    const itemRows = shape.length;
    const itemCols = shape[0].length;

    if (col < 0 || row < 0 || col + itemCols > currentLevel.cols || row + itemRows > currentLevel.rows) {
      return false;
    }

    for (let r = 0; r < itemRows; r++) {
      for (let c = 0; c < itemCols; c++) {
        if (shape[r][c]) {
          const occ = grid[row + r][col + c];
          if (occ !== null && occ !== item.id) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // 在点击点附近寻找最近合法空位 (智能吸附兜底)
  function findNearestValidSpot(item, targetCol, targetRow) {
    if (canPlace(item, targetCol, targetRow, gridMatrix)) {
      return { col: targetCol, row: targetRow };
    }
    // 搜索以 target 为中心半径 2 内的最佳空位
    for (let dist = 1; dist <= 2; dist++) {
      for (let dr = -dist; dr <= dist; dr++) {
        for (let dc = -dist; dc <= dist; dc++) {
          const c = targetCol + dc;
          const r = targetRow + dr;
          if (canPlace(item, c, r, gridMatrix)) {
            return { col: c, row: r };
          }
        }
      }
    }
    return null;
  }

  // 将物品置入网格
  function placeItem(item, col, row) {
    clearItemFromGrid(item);

    const shape = item.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c]) {
          gridMatrix[row + r][col + c] = item.id;
        }
      }
    }
    item.isPlaced = true;
    item.gridCol = col;
    item.gridRow = row;
    stepsCount++;

    if (window.TidyAudio) window.TidyAudio.playSnap();

    // 放置成功后，自动顺延选中下一个未放置的物品
    const unplaced = activeItems.filter(it => !it.isPlaced && it !== item);
    selectedItem = unplaced.length > 0 ? unplaced[0] : item;

    checkWinCondition();
  }

  // 从网格中取出物品
  function clearItemFromGrid(item) {
    if (!item.isPlaced) return;
    for (let r = 0; r < currentLevel.rows; r++) {
      for (let c = 0; c < currentLevel.cols; c++) {
        if (gridMatrix[r][c] === item.id) {
          gridMatrix[r][c] = null;
        }
      }
    }
    item.isPlaced = false;
    item.gridCol = -1;
    item.gridRow = -1;
  }

  // 一键将当前选中物品放回托盘
  function recallSelectedItem() {
    if (!selectedItem || !selectedItem.isPlaced) return;
    clearItemFromGrid(selectedItem);
    if (window.TidyAudio) window.TidyAudio.playPick();
    render();
    if (onStateChangeCallback) {
      onStateChangeCallback({ items: activeItems, selected: selectedItem });
    }
  }

  // 旋转物品 (顺时针 90 度)
  function rotateItem(item) {
    const target = item || selectedItem;
    if (!target) return;

    const oldShape = target.shape;
    const newShape = rotateMatrix(oldShape);

    if (target.isPlaced) {
      clearItemFromGrid(target);
      const testItem = Object.assign({}, target, { shape: newShape });
      if (canPlace(testItem, target.gridCol, target.gridRow, gridMatrix)) {
        target.shape = newShape;
        target.rot = (target.rot + 90) % 360;
        placeItem(target, target.gridCol, target.gridRow);
        if (window.TidyAudio) window.TidyAudio.playRotate();
      } else {
        // 放不下恢复原形状
        target.shape = oldShape;
        placeItem(target, target.gridCol, target.gridRow);
        if (window.TidyAudio) window.TidyAudio.playError();
      }
    } else {
      target.shape = newShape;
      target.rot = (target.rot + 90) % 360;
      if (window.TidyAudio) window.TidyAudio.playRotate();
    }
    render();
    if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: target });
  }

  // 检查是否全量严丝合缝通关
  function checkWinCondition() {
    const allPlaced = activeItems.every(it => it.isPlaced);
    if (!allPlaced) return;

    let emptyCount = 0;
    for (let r = 0; r < currentLevel.rows; r++) {
      for (let c = 0; c < currentLevel.cols; c++) {
        if (gridMatrix[r][c] === null) emptyCount++;
      }
    }

    if (emptyCount === 0) {
      isCompleted = true;
      if (timerInterval) clearInterval(timerInterval);
      if (window.TidyAudio) window.TidyAudio.playWin();

      const stars = elapsedTime < 60 ? 3 : (elapsedTime < 120 ? 2 : 1);
      const result = {
        levelId: currentLevel.id,
        levelName: currentLevel.name,
        time: elapsedTime,
        steps: stepsCount,
        stars: stars
      };

      if (onCompleteCallback) {
        setTimeout(() => onCompleteCallback(result), 500);
      }
    }
  }

  // 渲染总流程
  function render() {
    if (!ctx || !canvas || !currentLevel) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // 1. 绘制收纳盒实体背景容器与凹槽立体高光
    drawContainerBox();

    // 2. 绘制网格导向线
    drawGridLines();

    // 3. 绘制已放置在收纳盒中的物品
    activeItems.forEach(item => {
      if (item.isPlaced && item !== draggingItem) {
        const x = gridOffsetX + item.gridCol * cellSize;
        const y = gridOffsetY + item.gridRow * cellSize;
        drawItemObject(ctx, item, x, y, false);
      }
    });

    // 4. 吸附投影引导：如果正在拖拽或者选中了未放置的物品
    const guideItem = draggingItem || (selectedItem && !selectedItem.isPlaced ? selectedItem : null);
    if (guideItem) {
      drawSnapGuide(guideItem);
    }

    // 5. 绘制拖拽浮动中的物品 (紧随手指)
    if (draggingItem) {
      drawItemObject(ctx, draggingItem, draggingItem.renderX, draggingItem.renderY, true);
    }
  }

  // 绘制收纳盒立体外壳
  function drawContainerBox() {
    const theme = currentLevel.theme;
    const boxW = currentLevel.cols * cellSize;
    const boxH = currentLevel.rows * cellSize;
    const pad = 10;

    const x = gridOffsetX - pad;
    const y = gridOffsetY - pad;
    const bw = boxW + pad * 2;
    const bh = boxH + pad * 2;

    ctx.save();
    // 盒外投影
    ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;

    // 盒身圆角底盘
    drawRoundRect(ctx, x, y, bw, bh, 16);
    ctx.fillStyle = theme.containerBg;
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = theme.containerBorder;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 内凹阴影线
    ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, gridOffsetX - 1, gridOffsetY - 1, boxW + 2, boxH + 2, 8);
    ctx.stroke();

    ctx.restore();
  }

  // 绘制网格线
  function drawGridLines() {
    const theme = currentLevel.theme;
    const cols = currentLevel.cols;
    const rows = currentLevel.rows;

    ctx.save();
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;

    for (let c = 0; c <= cols; c++) {
      const x = gridOffsetX + c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, gridOffsetY);
      ctx.lineTo(x, gridOffsetY + rows * cellSize);
      ctx.stroke();
    }

    for (let r = 0; r <= rows; r++) {
      const y = gridOffsetY + r * cellSize;
      ctx.beginPath();
      ctx.moveTo(gridOffsetX, y);
      ctx.lineTo(gridOffsetX + cols * cellSize, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 绘制吸附对齐虚线与合法性光晕
  function drawSnapGuide(guideItem) {
    let targetCol = hoverCol;
    let targetRow = hoverRow;

    if (draggingItem) {
      targetCol = Math.round((draggingItem.renderX - gridOffsetX) / cellSize);
      targetRow = Math.round((draggingItem.renderY - gridOffsetY) / cellSize);
    } else if (targetCol < 0 || targetRow < 0) {
      // 若没有特定悬浮点，自动寻找盒内第一个可放置空位给出温馨提示
      for (let r = 0; r < currentLevel.rows; r++) {
        for (let c = 0; c < currentLevel.cols; c++) {
          if (canPlace(guideItem, c, r, gridMatrix)) {
            targetCol = c;
            targetRow = r;
            break;
          }
        }
        if (targetCol >= 0) break;
      }
    }

    if (targetCol < 0 || targetRow < 0) return;

    const isValid = canPlace(guideItem, targetCol, targetRow, gridMatrix);
    const shape = guideItem.shape;
    const itemRows = shape.length;
    const itemCols = shape[0].length;

    if (targetCol >= -1 && targetRow >= -1 && targetCol < currentLevel.cols && targetRow < currentLevel.rows) {
      ctx.save();
      ctx.fillStyle = isValid ? "rgba(34, 197, 94, 0.22)" : "rgba(239, 68, 68, 0.16)";
      ctx.strokeStyle = isValid ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      for (let r = 0; r < itemRows; r++) {
        for (let c = 0; c < itemCols; c++) {
          if (shape[r][c]) {
            const cx = gridOffsetX + (targetCol + c) * cellSize;
            const cy = gridOffsetY + (targetRow + r) * cellSize;
            if (targetCol + c >= 0 && targetCol + c < currentLevel.cols && targetRow + r >= 0 && targetRow + r < currentLevel.rows) {
              drawRoundRect(ctx, cx + 2, cy + 2, cellSize - 4, cellSize - 4, 8);
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      }
      ctx.restore();
    }
  }

  // 绘制物品微拟物图像
  function drawItemObject(ctx, item, x, y, isFloating) {
    const shape = item.shape;
    const rows = shape.length;
    const cols = shape[0].length;
    const w = cols * cellSize;
    const h = rows * cellSize;

    ctx.save();
    ctx.translate(x, y);

    if (isFloating) {
      ctx.scale(1.04, 1.04);
      ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 10;
    } else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
    }

    // 绘制主体色块多边形 (按各占位格子渲染完整或连通块)
    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.accentColor;
    ctx.lineWidth = 2;

    const pad = 2.5;
    drawRoundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 9);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "transparent";

    // 绘制内部微拟物高光与细节
    drawItemDetails(ctx, item, w, h);

    // 选中状态光环
    if (selectedItem === item && !isFloating) {
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      drawRoundRect(ctx, 1, 1, w - 2, h - 2, 10);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 物品细节绘制引擎
  function drawItemDetails(ctx, item, w, h) {
    ctx.save();
    const type = item.detailType;

    if (type === "lipstick") {
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(6, h * 0.45, w - 12, 3);
      ctx.fillStyle = "#e11d48";
      ctx.beginPath();
      ctx.moveTo(w * 0.25, 8);
      ctx.lineTo(w * 0.5, 8);
      ctx.lineTo(w * 0.4, h * 0.4);
      ctx.lineTo(w * 0.15, h * 0.4);
      ctx.closePath();
      ctx.fill();
    } else if (type === "perfume") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(6, 6, w * 0.25, h - 12);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(w / 2 - 8, 3, 16, 5);
    } else if (type === "powder") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === "brush") {
      ctx.fillStyle = "#78350f";
      ctx.fillRect(w / 2 - 3, h * 0.35, 6, h * 0.5);
      ctx.fillStyle = "#fed7aa";
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.28, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "pen") {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(w / 2 - 2, 6, 4, h - 12);
      ctx.fillRect(w / 2 - 6, 6, 12, 3);
    } else if (type === "ruler") {
      ctx.fillStyle = "#64748b";
      const ticks = Math.floor(w / 7);
      for (let i = 1; i < ticks; i++) {
        const th = (i % 5 === 0) ? 8 : 4;
        ctx.fillRect(i * 7, 5, 1.2, th);
      }
    } else if (type === "capsules") {
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(w * 0.2, h * 0.3, w * 0.25, h * 0.4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(w * 0.45, h * 0.3, w * 0.25, h * 0.4);
    } else if (type === "camera") {
      ctx.fillStyle = "#3f3f46";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(w / 2 - 2, h / 2 - 2, Math.min(w, h) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "can") {
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(w / 2, 9, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "strawberries") {
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.moveTo(w / 2, 6);
      ctx.lineTo(w / 2 - 6, 12);
      ctx.lineTo(w / 2 + 6, 12);
      ctx.closePath();
      ctx.fill();
    }

    // 居中标识
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 3;
    ctx.fillText(item.name.slice(0, 4), w / 2, h / 2);

    ctx.restore();
  }

  // 圆角矩形辅助
  function drawRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 全局事件系统：支持点选 (Tap-to-Place) 与 滑动拖拽 (Drag-to-Drop)
  function bindGlobalEvents() {
    let isTouching = false;
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let didMove = false;

    function getCanvasPos(screenX, screenY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: screenX - rect.left,
        y: screenY - rect.top,
        inCanvas: (
          screenX >= rect.left && screenX <= rect.right &&
          screenY >= rect.top && screenY <= rect.bottom
        )
      };
    }

    function onPointerDown(e) {
      if (isCompleted || !canvas) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const cPos = getCanvasPos(clientX, clientY);

      if (!cPos.inCanvas) return;

      isTouching = true;
      didMove = false;
      touchStartTime = Date.now();
      touchStartPos = { x: clientX, y: clientY };

      // 1. 检查是否点击了画布中已放置的物品
      for (let i = activeItems.length - 1; i >= 0; i--) {
        const item = activeItems[i];
        if (item.isPlaced) {
          const ix = gridOffsetX + item.gridCol * cellSize;
          const iy = gridOffsetY + item.gridRow * cellSize;
          const iw = item.shape[0].length * cellSize;
          const ih = item.shape.length * cellSize;

          if (cPos.x >= ix && cPos.x <= ix + iw && cPos.y >= iy && cPos.y <= iy + ih) {
            selectedItem = item;
            draggingItem = item;
            dragOffset = { x: cPos.x - ix, y: cPos.y - iy };
            draggingItem.renderX = ix;
            draggingItem.renderY = iy;
            clearItemFromGrid(item);
            if (window.TidyAudio) window.TidyAudio.playPick();
            render();
            if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: item });
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
      }

      // 2. 如果点击的是空白网格，且当前有选中的未放置物品 -> 准备 Tap-to-Place
      const col = Math.floor((cPos.x - gridOffsetX) / cellSize);
      const row = Math.floor((cPos.y - gridOffsetY) / cellSize);
      hoverCol = col;
      hoverRow = row;
      render();
    }

    function onPointerMove(e) {
      if (isCompleted || !canvas) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const cPos = getCanvasPos(clientX, clientY);

      if (isTouching) {
        const dx = clientX - touchStartPos.x;
        const dy = clientY - touchStartPos.y;
        if (Math.hypot(dx, dy) > 8) {
          didMove = true;
        }
      }

      if (draggingItem) {
        draggingItem.renderX = cPos.x - dragOffset.x;
        draggingItem.renderY = cPos.y - dragOffset.y;
        hoverCol = Math.round((draggingItem.renderX - gridOffsetX) / cellSize);
        hoverRow = Math.round((draggingItem.renderY - gridOffsetY) / cellSize);
        render();
        if (e.cancelable) e.preventDefault();
      } else if (cPos.inCanvas && selectedItem && !selectedItem.isPlaced) {
        // 轻触悬浮引导
        hoverCol = Math.floor((cPos.x - gridOffsetX) / cellSize);
        hoverRow = Math.floor((cPos.y - gridOffsetY) / cellSize);
        render();
      }
    }

    function onPointerUp(e) {
      if (isCompleted || !canvas) return;
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const cPos = getCanvasPos(clientX, clientY);

      if (draggingItem) {
        // 拖拽放置判定
        const targetCol = Math.round((draggingItem.renderX - gridOffsetX) / cellSize);
        const targetRow = Math.round((draggingItem.renderY - gridOffsetY) / cellSize);

        const spot = findNearestValidSpot(draggingItem, targetCol, targetRow);
        if (spot) {
          placeItem(draggingItem, spot.col, spot.row);
        } else {
          // 放不下，退回托盘
          clearItemFromGrid(draggingItem);
          if (window.TidyAudio) window.TidyAudio.playError();
        }
        draggingItem = null;
        hoverCol = -1;
        hoverRow = -1;
        render();
        if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: selectedItem });
        isTouching = false;
        return;
      }

      // 如果不是拖拽，而是快速轻触点击网格 (Tap-to-Place)
      if (isTouching && !didMove && cPos.inCanvas) {
        const clickCol = Math.floor((cPos.x - gridOffsetX) / cellSize);
        const clickRow = Math.floor((cPos.y - gridOffsetY) / cellSize);

        if (selectedItem && !selectedItem.isPlaced) {
          const spot = findNearestValidSpot(selectedItem, clickCol, clickRow);
          if (spot) {
            placeItem(selectedItem, spot.col, spot.row);
            if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: selectedItem });
          } else {
            if (window.TidyAudio) window.TidyAudio.playError();
          }
        }
      }

      isTouching = false;
      hoverCol = -1;
      hoverRow = -1;
      render();
    }

    // Canvas 监听与 window 全局滑动接管 (防止划出屏幕丢事件)
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp, { passive: false });
    window.addEventListener("touchcancel", onPointerUp, { passive: false });

    canvas.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  }

  // 从托盘中拖起未放置物品
  function pickupFromTray(item, screenX, screenY) {
    if (isCompleted || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    draggingItem = item;
    selectedItem = item;
    clearItemFromGrid(item);

    const iw = item.shape[0].length * cellSize;
    const ih = item.shape.length * cellSize;
    dragOffset = { x: iw / 2, y: ih / 2 };
    draggingItem.renderX = screenX - rect.left - iw / 2;
    draggingItem.renderY = screenY - rect.top - ih / 2;

    if (window.TidyAudio) window.TidyAudio.playPick();
    render();
    if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: item });
  }

  return {
    init: init,
    loadLevel: loadLevel,
    resetLevel: resetLevel,
    rotateItem: rotateItem,
    recallSelectedItem: recallSelectedItem,
    pickupFromTray: pickupFromTray,
    getCurrentLevel: () => currentLevel,
    getActiveItems: () => activeItems,
    getSelectedItem: () => selectedItem,
    getTime: () => elapsedTime,
    getSteps: () => stepsCount,
    getCanvas: () => canvas,
    handleResize: handleResize,
    selectItem: (item) => {
      selectedItem = item;
      render();
      if (onStateChangeCallback) onStateChangeCallback({ items: activeItems, selected: item });
    },
    // 单元测试接口
    canPlace: canPlace,
    placeItem: placeItem,
    clearItemFromGrid: clearItemFromGrid,
    checkWinCondition: checkWinCondition
  };
});
