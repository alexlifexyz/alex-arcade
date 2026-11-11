/**
 * game.js
 * 《人类极限挑战》核心挑战引擎
 * 包含三大挑战模态：
 * 1. 神经反应测试 (Reaction Time Test, ms)
 * 2. 10秒极限手速 (CPS Speed Tap)
 * 3. 瞬间记忆矩阵 (Chimp Memory Test)
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PeakGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  // 当前模式: 'reaction' | 'cps' | 'memory'
  let currentMode = "reaction";

  // 1. 反应测试状态变量
  let reactionState = "idle"; // 'idle' | 'waiting' | 'ready' | 'result' | 'failed'
  let reactionTimer = null;
  let reactionStartTime = 0;
  let lastReactionScore = 0; // ms

  // 2. CPS 手速测试状态变量
  let cpsState = "idle"; // 'idle' | 'tapping' | 'finished'
  let cpsClicks = 0;
  let cpsStartTime = 0;
  const CPS_DURATION = 10000; // 10秒
  let cpsRafId = null;
  let lastCpsScore = 0; // clicks
  let lastCpsRate = 0; // cps

  // 3. 记忆矩阵状态变量
  let memoryState = "idle"; // 'idle' | 'active' | 'finished'
  let memoryLevel = 1; // 当前难度级数
  let memoryTargetCount = 3; // 需记忆数字个数
  let memoryGrid = []; // { id, num, isRevealed, isCorrect, isWrong }
  let memoryNextExpected = 1;
  let lastMemoryScore = 0; // 最高通过关卡数

  // 事件回调
  let onStateChangeCallback = null;
  let onFinishCallback = null;

  function init(callbacks) {
    if (callbacks) {
      onStateChangeCallback = callbacks.onStateChange;
      onFinishCallback = callbacks.onFinish;
    }
    setMode("reaction");
  }

  function setMode(mode) {
    currentMode = mode;
    cleanupTimers();

    if (mode === "reaction") {
      reactionState = "idle";
    } else if (mode === "cps") {
      cpsState = "idle";
      cpsClicks = 0;
    } else if (mode === "memory") {
      memoryState = "idle";
      memoryLevel = 1;
      memoryTargetCount = 3;
    }

    notifyState();
  }

  function cleanupTimers() {
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = null;
    if (cpsRafId) cancelAnimationFrame(cpsRafId);
    cpsRafId = null;
  }

  function notifyState(extra) {
    if (onStateChangeCallback) {
      onStateChangeCallback(Object.assign({
        mode: currentMode,
        reaction: { state: reactionState, score: lastReactionScore },
        cps: { state: cpsState, clicks: cpsClicks, score: lastCpsScore, rate: lastCpsRate },
        memory: { state: memoryState, level: memoryLevel, grid: memoryGrid, score: lastMemoryScore }
      }, extra || {}));
    }
  }

  // ==========================================
  // 1. 神经反应速度测试逻辑 (Reaction Time)
  // ==========================================
  function handleReactionTap() {
    const audio = window.PeakAudio;

    // 如果当前已经是结算结果状态，严禁随便点击重新触发！必须点右上角关闭或再测一次
    if (reactionState === "result") {
      return;
    }

    if (reactionState === "idle" || reactionState === "failed") {
      // 启动专注等待
      reactionState = "waiting";
      if (audio) audio.playReady();
      notifyState();

      // 随机 2.2s ~ 5.0s 后变绿
      const delay = Math.floor(Math.random() * 2800) + 2200;
      reactionTimer = setTimeout(() => {
        reactionState = "ready";
        reactionStartTime = performance.now();
        if (audio) audio.playGreen();
        notifyState();
      }, delay);
    } else if (reactionState === "waiting") {
      // 提前抢跑 (防作弊)
      if (reactionTimer) clearTimeout(reactionTimer);
      reactionTimer = null;
      reactionState = "failed";
      if (audio) audio.playWarning();
      notifyState({ message: "抢跑了！请专注等待屏幕变绿瞬间再点击" });
    } else if (reactionState === "ready") {
      // 成功测得毫秒数
      const elapsed = Math.round(performance.now() - reactionStartTime);
      reactionState = "result";
      lastReactionScore = elapsed;
      if (audio) audio.playWin();

      let rankTitle = "常人标准反应";
      let beatPct = 60;
      if (elapsed < 185) {
        rankTitle = "超神神经反射";
        beatPct = 99.4;
      } else if (elapsed < 225) {
        rankTitle = "电竞级瞬发反应";
        beatPct = 95.8;
      } else if (elapsed < 265) {
        rankTitle = "敏锐年轻反射";
        beatPct = 82.5;
      } else if (elapsed > 330) {
        rankTitle = "疲劳熬夜状态";
        beatPct = 25.0;
      }

      notifyState({ rankTitle: rankTitle, beatPct: beatPct });

      if (onFinishCallback) {
        onFinishCallback({
          mode: "reaction",
          score: elapsed,
          unit: "ms",
          rankTitle: rankTitle,
          beatPct: beatPct
        });
      }
    }
  }

  // ==========================================
  // 2. 10秒手速极限狂点逻辑 (CPS Speed Tap)
  // ==========================================
  let cpsFinishCooldownUntil = 0; // 冷却时间戳，防止 10 秒倒计时结束瞬间惯性连击误触发重开

  function handleCpsTap() {
    const audio = window.PeakAudio;
    const now = performance.now();

    // 如果处于结算结果状态或冷却保护期，严禁随便点击重开！
    if (cpsState === "finished" || now < cpsFinishCooldownUntil) {
      return;
    }

    if (cpsState === "idle") {
      cpsState = "tapping";
      cpsClicks = 1;
      cpsStartTime = performance.now();
      if (audio) audio.playTap();

      // 启动高精度倒计时循环
      const updateTick = () => {
        if (cpsState !== "tapping") return;
        const elapsed = performance.now() - cpsStartTime;
        const remain = Math.max(0, (CPS_DURATION - elapsed) / 1000);

        if (remain <= 0) {
          finishCpsTest();
        } else {
          notifyState({ remainSeconds: remain.toFixed(1) });
          cpsRafId = requestAnimationFrame(updateTick);
        }
      };
      cpsRafId = requestAnimationFrame(updateTick);
      notifyState({ remainSeconds: "10.0" });
    } else if (cpsState === "tapping") {
      cpsClicks++;
      if (audio) audio.playTap();
      const elapsed = Math.max(0.001, (performance.now() - cpsStartTime) / 1000);
      const currentRate = (cpsClicks / elapsed).toFixed(1);
      notifyState({ currentRate: currentRate });
    }
  }

  function finishCpsTest() {
    cpsState = "finished";
    cpsFinishCooldownUntil = performance.now() + 1000; // 冷却保护 1000ms，吞掉结束瞬间的狂点惯性
    if (cpsRafId) cancelAnimationFrame(cpsRafId);
    cpsRafId = null;

    const audio = window.PeakAudio;
    if (audio) audio.playWin();

    lastCpsScore = cpsClicks;
    lastCpsRate = (cpsClicks / 10.0).toFixed(1);

    let rankTitle = "佛系温和手速";
    let beatPct = 55.0;
    if (cpsClicks >= 105) {
      rankTitle = "无影手速狂魔";
      beatPct = 99.2;
    } else if (cpsClicks >= 85) {
      rankTitle = "电竞级暴击手速";
      beatPct = 94.6;
    } else if (cpsClicks >= 65) {
      rankTitle = "高能敏捷手速";
      beatPct = 78.0;
    }

    notifyState({ rankTitle: rankTitle, beatPct: beatPct });

    if (onFinishCallback) {
      onFinishCallback({
        mode: "cps",
        score: lastCpsScore,
        rate: lastCpsRate,
        unit: "次",
        rankTitle: rankTitle,
        beatPct: beatPct
      });
    }
  }

  // ==========================================
  // 3. 瞬间闪烁记忆矩阵逻辑 (Memory Matrix)
  // ==========================================
  function startMemoryLevel(lvl) {
    memoryLevel = lvl || 1;
    memoryState = "active";
    memoryTargetCount = Math.min(2 + memoryLevel, 8); // 3 到 8 个数字
    memoryNextExpected = 1;

    // 9 宫格 (3x3) 随机分配数字
    const totalCells = 9;
    const indices = [];
    for (let i = 0; i < totalCells; i++) indices.push(i);

    // 洗牌选出目标位置
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    memoryGrid = [];
    for (let i = 0; i < totalCells; i++) {
      memoryGrid.push({
        id: i,
        num: null,
        isRevealed: false,
        isCorrect: false,
        isWrong: false
      });
    }

    // 分配 1 ~ memoryTargetCount
    for (let n = 1; n <= memoryTargetCount; n++) {
      const cellIdx = indices[n - 1];
      memoryGrid[cellIdx].num = n;
      memoryGrid[cellIdx].isRevealed = true; // 初始全展示
    }

    notifyState();
  }

  function handleMemoryCellClick(cellIdx) {
    if (memoryState !== "active") return;
    const cell = memoryGrid[cellIdx];
    if (!cell || !cell.num) return; // 点中空格忽略

    const audio = window.PeakAudio;

    if (cell.num === memoryNextExpected) {
      // 点击正确
      if (audio) audio.playTap();
      cell.isCorrect = true;

      // 如果点击了 1，其他目标数字立刻隐藏变空白
      if (memoryNextExpected === 1) {
        memoryGrid.forEach(c => {
          if (c.num && c.num > 1) {
            c.isRevealed = false; // 变空白隐藏
          }
        });
      }

      memoryNextExpected++;

      // 本关所有数字点完 -> 过关！
      if (memoryNextExpected > memoryTargetCount) {
        lastMemoryScore = memoryLevel;
        if (audio) audio.playTick(true);
        setTimeout(() => {
          startMemoryLevel(memoryLevel + 1);
        }, 350);
      } else {
        notifyState();
      }
    } else {
      // 点错失误 -> 结算
      if (audio) audio.playWarning();
      cell.isWrong = true;
      memoryState = "finished";

      // 翻开所有真实数字
      memoryGrid.forEach(c => {
        if (c.num) c.isRevealed = true;
      });

      lastMemoryScore = Math.max(1, memoryLevel - 1);

      let rankTitle = "优秀瞬时记忆";
      let beatPct = 65.0;
      if (lastMemoryScore >= 7) {
        rankTitle = "超强大脑天才";
        beatPct = 99.1;
      } else if (lastMemoryScore >= 5) {
        rankTitle = "电竞级记忆极限";
        beatPct = 88.5;
      }

      notifyState({ rankTitle: rankTitle, beatPct: beatPct });

      if (onFinishCallback) {
        onFinishCallback({
          mode: "memory",
          score: lastMemoryScore,
          unit: "关",
          rankTitle: rankTitle,
          beatPct: beatPct
        });
      }
    }
  }

  function handleStageTap() {
    if (currentMode === "reaction") {
      handleReactionTap();
    } else if (currentMode === "cps") {
      handleCpsTap();
    } else if (currentMode === "memory") {
      if (memoryState === "idle") {
        startMemoryLevel(1);
      }
    }
  }

  function resetCurrentMode() {
    setMode(currentMode);
  }

  return {
    init: init,
    setMode: setMode,
    getMode: () => currentMode,
    getState: () => ({
      mode: currentMode,
      reaction: { state: reactionState, score: lastReactionScore },
      cps: { state: cpsState, clicks: cpsClicks, score: lastCpsScore, rate: lastCpsRate },
      memory: { state: memoryState, level: memoryLevel, grid: memoryGrid, score: lastMemoryScore }
    }),
    handleStageTap: handleStageTap,
    handleMemoryCellClick: handleMemoryCellClick,
    resetCurrentMode: resetCurrentMode
  };
});
