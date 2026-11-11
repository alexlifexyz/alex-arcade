/**
 * main.js
 * 《人类极限挑战》页面主入口逻辑 (首页原位大字版结算 · 零遮挡弹窗)
 */
(function() {
  "use strict";

  const bgCanvas = document.getElementById("bg-canvas");
  const touchStage = document.getElementById("touch-stage");
  const stageVectorIcon = document.getElementById("stage-vector-icon");
  const stageMainText = document.getElementById("stage-main-text");
  const stageSubText = document.getElementById("stage-sub-text");
  const stageBigStat = document.getElementById("stage-big-stat");
  const statVal = document.getElementById("stat-val");
  const statUnit = document.getElementById("stat-unit");
  const stageRankTag = document.getElementById("stage-rank-tag");
  const stageBeatPill = document.getElementById("stage-beat-pill");
  const stageChallengeCall = document.getElementById("stage-challenge-call");
  const memoryGrid = document.getElementById("memory-grid");

  const ctrlGroupIdle = document.getElementById("ctrl-group-idle");
  const ctrlGroupResult = document.getElementById("ctrl-group-result");

  const btnStageAction = document.getElementById("btn-stage-action");
  const btnScreenshot = document.getElementById("btn-screenshot");
  const btnStageShare = document.getElementById("btn-stage-share");
  const btnStageClose = document.getElementById("btn-stage-close");
  const btnShareMain = document.getElementById("btn-share") || document.getElementById("btn-share-main");
  const btnHeaderShare = document.getElementById("btn-header-share");

  const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));

  // 纯 SVG 矢量几何科技微标库 (100% 杜绝任何 emoji)
  const SVG_ICONS = {
    // 准星声光雷达 (反应测试)
    reaction: `
      <svg class="tech-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" />
        <circle cx="24" cy="24" r="13" stroke="currentColor" stroke-width="2" />
        <circle cx="24" cy="24" r="4.5" fill="currentColor" />
        <line x1="24" y1="1" x2="24" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line x1="24" y1="41" x2="24" y2="47" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line x1="1" y1="24" x2="7" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line x1="41" y1="24" x2="47" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    `,
    // 极速刻度表盘 (10秒手速)
    cps: `
      <svg class="tech-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 36 A20 20 0 1 1 41 36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        <line x1="24" y1="24" x2="33" y2="15" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        <circle cx="24" cy="24" r="4" fill="currentColor" />
      </svg>
    `,
    // 矩阵神经节点 (记忆矩阵)
    memory: `
      <svg class="tech-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="20" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="33" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="7" y="20" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="20" y="20" width="9" height="9" rx="2" fill="currentColor" />
        <rect x="33" y="20" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="7" y="33" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="20" y="33" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
        <rect x="33" y="33" width="9" height="9" rx="2" stroke="currentColor" stroke-width="2" />
      </svg>
    `,
    // 警示三角 (失误与抢跑)
    warning: `
      <svg class="tech-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6 L44 41 H4 L24 6 Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
        <line x1="24" y1="18" x2="24" y2="29" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        <circle cx="24" cy="35" r="2" fill="currentColor" />
      </svg>
    `,
    // 巅峰认证印记 (结算成功)
    badge: `
      <svg class="tech-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" />
        <path d="M15 24 L21 30 L33 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `
  };

  function bindFastClick(el, handler) {
    if (!el) return;
    let lastTime = 0;
    const trigger = function(e) {
      if (e) {
        e.stopPropagation();
        if (e.cancelable && e.type === "touchend") e.preventDefault();
      }
      const now = Date.now();
      if (now - lastTime < 200) return;
      lastTime = now;
      handler(e);
    };
    el.addEventListener("touchend", trigger, { passive: false });
    el.addEventListener("click", trigger);
  }

  // 渲染记忆矩阵九宫格
  function renderMemoryGrid(grid) {
    if (!memoryGrid) return;
    memoryGrid.innerHTML = "";

    grid.forEach((cell, idx) => {
      const el = document.createElement("div");
      let cls = "memory-cell";
      if (cell.isRevealed) {
        cls += " revealed";
      } else if (cell.num) {
        cls += " blank";
      }
      if (cell.isCorrect) cls += " correct";
      if (cell.isWrong) cls += " wrong";
      el.className = cls;
      el.textContent = cell.isRevealed && cell.num ? cell.num : "";

      bindFastClick(el, function() {
        window.PeakGame.handleMemoryCellClick(idx);
      });

      memoryGrid.appendChild(el);
    });
  }

  // 状态变更驱动 UI 与 3D 联动 (首页大字版原位呈现)
  function onGameStateUpdate(state) {
    const mode = state.mode;
    touchStage.className = "touch-stage";
    if (btnStageShare) btnStageShare.style.display = "none";
    if (btnStageClose) btnStageClose.style.display = "none";

    const bg = window.PeakBgScene;

    if (mode === "reaction") {
      memoryGrid.style.display = "none";
      const rec = state.reaction;

      if (rec.state === "idle") {
        touchStage.classList.add("state-idle");
        if (bg) bg.setThemeState("idle");
        stageVectorIcon.innerHTML = SVG_ICONS.reaction;
        stageMainText.textContent = "轻触开始测试";
        stageSubText.textContent = "屏幕变绿瞬间以最快速度轻触，测试神经生理极限";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";
        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "flex";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "none";
        btnStageAction.textContent = "立即挑战";
      } else if (rec.state === "waiting") {
        touchStage.classList.add("state-waiting");
        if (bg) bg.setThemeState("waiting");
        stageVectorIcon.innerHTML = SVG_ICONS.reaction;
        stageMainText.textContent = "专注凝视... 等待变绿";
        stageSubText.textContent = "红灯中，千万不要提前点击！";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "flex";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "none";
        btnStageAction.textContent = "等待绿光...";
      } else if (rec.state === "ready") {
        touchStage.classList.add("state-ready");
        if (bg) bg.setThemeState("ready");
        stageVectorIcon.innerHTML = SVG_ICONS.reaction;
        stageMainText.textContent = "现在立刻点击！";
        stageSubText.textContent = "以闪电般速度轻触屏幕！";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        btnStageAction.textContent = "立刻轻触！";
      } else if (rec.state === "failed") {
        touchStage.classList.add("state-failed");
        if (bg) bg.setThemeState("failed");
        stageVectorIcon.innerHTML = SVG_ICONS.warning;
        stageMainText.textContent = "抢跑失误！";
        stageSubText.textContent = state.message || "请在绿灯亮起瞬间点击，轻触重试";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "flex";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "none";
        btnStageAction.textContent = "重新测试";
      } else if (rec.state === "result") {
        // 最好看的大字版结算原位展示
        touchStage.classList.add("state-result");
        if (bg) bg.setThemeState("result");
        stageVectorIcon.innerHTML = SVG_ICONS.badge;
        stageMainText.textContent = "神经反射速度";
        stageSubText.textContent = "全国巅峰极限认证";

        stageBigStat.style.display = "block";
        statVal.textContent = rec.score;
        statUnit.textContent = "ms";

        stageRankTag.style.display = "inline-block";
        stageRankTag.textContent = state.rankTitle || "超神神经反射";

        stageBeatPill.style.display = "inline-block";
        stageBeatPill.textContent = "超越全国 " + (state.beatPct || 92.5) + "% 网友";

        stageChallengeCall.style.display = "block";

        if (btnStageShare) btnStageShare.style.display = "inline-flex";
        if (btnStageClose) btnStageClose.style.display = "inline-flex";
        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "none";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "flex";
        btnStageAction.textContent = "再测一次";
      }
    } else if (mode === "cps") {
      memoryGrid.style.display = "none";
      const cps = state.cps;

      if (cps.state === "idle") {
        touchStage.classList.add("state-idle");
        if (bg) bg.setThemeState("idle");
        stageVectorIcon.innerHTML = SVG_ICONS.cps;
        stageMainText.textContent = "10 秒极限手速测试";
        stageSubText.textContent = "轻触开启 10 秒倒计时，双指狂点刷爆你的最高 CPS";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "flex";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "none";
        btnStageAction.textContent = "开始手速狂点";
      } else if (cps.state === "tapping") {
        touchStage.classList.add("state-ready");
        if (bg) bg.setThemeState("ready");
        stageVectorIcon.innerHTML = SVG_ICONS.cps;
        stageMainText.textContent = "疯狂连击中！";
        stageSubText.textContent = "倒计时: " + (state.remainSeconds || "10.0") + "s · 手速: " + (state.currentRate || "0.0") + " CPS";
        stageBigStat.style.display = "block";
        statVal.textContent = cps.clicks;
        statUnit.textContent = "次";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        btnStageAction.textContent = "连击暴击中！";
      } else if (cps.state === "finished") {
        touchStage.classList.add("state-result");
        if (bg) bg.setThemeState("finished");
        stageVectorIcon.innerHTML = SVG_ICONS.badge;
        stageMainText.textContent = "10 秒极限手速";
        stageSubText.textContent = "平均手速 " + cps.rate + " CPS · 官方认证";

        stageBigStat.style.display = "block";
        statVal.textContent = cps.score;
        statUnit.textContent = "次";

        stageRankTag.style.display = "inline-block";
        stageRankTag.textContent = state.rankTitle || "手速狂魔";

        stageBeatPill.style.display = "inline-block";
        stageBeatPill.textContent = "超越全国 " + (state.beatPct || 90.0) + "% 网友";

        stageChallengeCall.style.display = "block";

        if (btnStageShare) btnStageShare.style.display = "inline-flex";
        if (btnStageClose) btnStageClose.style.display = "inline-flex";
        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "none";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "flex";
        btnStageAction.textContent = "再测一次";
      }
    } else if (mode === "memory") {
      const mem = state.memory;

      if (mem.state === "idle") {
        touchStage.classList.add("state-idle");
        if (bg) bg.setThemeState("idle");
        memoryGrid.style.display = "none";
        stageVectorIcon.innerHTML = SVG_ICONS.memory;
        stageMainText.textContent = "瞬间记忆矩阵测试";
        stageSubText.textContent = "按顺序记住数字位置，点按 1 后数字全部隐藏，凭大脑记忆还原！";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";

        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "flex";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "none";
        btnStageAction.textContent = "开始大脑挑战";
      } else if (mem.state === "active") {
        touchStage.classList.add("state-waiting");
        if (bg) bg.setThemeState("waiting");
        memoryGrid.style.display = "grid";
        stageVectorIcon.innerHTML = SVG_ICONS.memory;
        stageMainText.textContent = "第 " + mem.level + " 关记忆考验";
        stageSubText.textContent = "请依次点击 1, 2, 3... 数字";
        stageBigStat.style.display = "none";
        stageRankTag.style.display = "none";
        stageBeatPill.style.display = "none";
        stageChallengeCall.style.display = "none";
        renderMemoryGrid(mem.grid || []);
        btnStageAction.textContent = "记忆还原中...";
      } else if (mem.state === "finished") {
        touchStage.classList.add("state-result");
        if (bg) bg.setThemeState("result");
        memoryGrid.style.display = "none"; // 结算时隐藏小格子，换成大字版展示！
        stageVectorIcon.innerHTML = SVG_ICONS.badge;
        stageMainText.textContent = "瞬时记忆极限";
        stageSubText.textContent = "超强大脑瞬间闪烁极限挑战";

        stageBigStat.style.display = "block";
        statVal.textContent = mem.score;
        statUnit.textContent = "关";

        stageRankTag.style.display = "inline-block";
        stageRankTag.textContent = state.rankTitle || "超强大脑天才";

        stageBeatPill.style.display = "inline-block";
        stageBeatPill.textContent = "超越全国 " + (state.beatPct || 85.0) + "% 网友";

        stageChallengeCall.style.display = "block";

        if (btnStageShare) btnStageShare.style.display = "inline-flex";
        if (btnStageClose) btnStageClose.style.display = "inline-flex";
        if (ctrlGroupIdle) ctrlGroupIdle.style.display = "none";
        if (ctrlGroupResult) ctrlGroupResult.style.display = "flex";
        btnStageAction.textContent = "再测一次";
      }
    }
  }

  function startup() {
    // 1. 初始化 3D 科技背景
    if (bgCanvas && window.PeakBgScene) {
      window.PeakBgScene.init(bgCanvas);
    }

    // 2. 初始化核心挑战逻辑 (直接原位结算，不弹多余遮挡弹窗！)
    window.PeakGame.init({
      onStateChange: onGameStateUpdate,
      onFinish: function(result) {
        window.PeakLeaderboard.recordResult(result);
      }
    });

    window.PeakLeaderboard.bindUI();

    // 3. 触控大舞台受激与冲击波
    const handleStageTrigger = function(e) {
      if (e.target && (e.target.id === "btn-stage-share" || e.target.id === "btn-stage-close" || (e.target.closest && (e.target.closest("#btn-stage-share") || e.target.closest("#btn-stage-close"))))) return;
      if (e.target && e.target.classList && e.target.classList.contains("memory-cell")) return;

      // 核心防误触保护：处于结算状态时，随便点击大卡片绝对不重新触发测试！
      const state = window.PeakGame.getState();
      const m = state.mode;
      const sub = state[m];
      if (sub && (sub.state === "result" || sub.state === "finished")) {
        return; // 严禁重开！只能点右上角关闭、发笔记打榜或底栏再测一次
      }

      if (window.PeakBgScene) window.PeakBgScene.triggerPulse();
      window.PeakGame.handleStageTap();
      if (e.cancelable && e.type === "touchstart") e.preventDefault();
    };

    touchStage.addEventListener("touchstart", handleStageTrigger, { passive: false });
    touchStage.addEventListener("mousedown", handleStageTrigger);

    // 4. 底部行动按钮 (立即挑战 / 再测一次)
    bindFastClick(btnStageAction, function() {
      const state = window.PeakGame.getState();
      const m = state.mode;
      const sub = state[m];
      if (sub && (sub.state === "result" || sub.state === "finished" || sub.state === "failed")) {
        window.PeakGame.resetCurrentMode();
        return;
      }
      if (window.PeakBgScene) window.PeakBgScene.triggerPulse();
      window.PeakGame.handleStageTap();
    });

    // 5. 主框左上角【发笔记打榜】与右上角【打叉圆形关闭】触发
    const triggerShareFunc = function(e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (window.PeakLeaderboard && typeof window.PeakLeaderboard.triggerShare === "function") {
        window.PeakLeaderboard.triggerShare();
      }
    };
    if (btnStageShare) bindFastClick(btnStageShare, triggerShareFunc);
    if (btnShareMain) bindFastClick(btnShareMain, triggerShareFunc);

    if (btnStageClose) {
      bindFastClick(btnStageClose, function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.PeakGame.resetCurrentMode(); // 擦掉并重置为初始准备状态
      });
    }

    // 6. 截屏保存至相册
    if (btnScreenshot) {
      bindFastClick(btnScreenshot, function() {
        if (window.PeakLeaderboard && typeof window.PeakLeaderboard.saveScreenshotToAlbum === "function") {
          window.PeakLeaderboard.saveScreenshotToAlbum();
        }
      });
    }

    // 7. 模式切换 Tabs
    modeTabs.forEach(tab => {
      bindFastClick(tab, function() {
        modeTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const mode = tab.getAttribute("data-mode");
        window.PeakGame.setMode(mode);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startup);
  } else {
    startup();
  }
})();
