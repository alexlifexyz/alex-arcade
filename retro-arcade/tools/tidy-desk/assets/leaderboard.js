/**
 * leaderboard.js
 * 《沉浸式桌面收纳家》小红书原生端能力联动控制器
 * 包含：云存储进度漫游、全国速通排行榜打榜、拍立得风格战绩海报合成与 postNote 官方发布
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TidyLeaderboard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  const BOARD_ID = 1; // 榜位 1: 全国收纳大师总榜
  const CLOUD_COLLECTION = "tidy_desk_progress";

  let currentPeriod = "day";
  let latestResult = null;
  let userProgress = {}; // { levelId: { stars, bestTime } }

  // 快速防抖点击绑定
  function bindFastClick(el, handler) {
    if (!el) return;
    let lastTime = 0;
    const trigger = function(e) {
      if (e) {
        e.stopPropagation();
        if (e.cancelable && e.type === "touchend") e.preventDefault();
      }
      const now = Date.now();
      if (now - lastTime < 300) return;
      lastTime = now;
      handler(e);
    };
    el.addEventListener("touchend", trigger, { passive: false });
    el.addEventListener("click", trigger);
  }

  // 1. 初始化并从云存储漫游读取玩家进度
  function initProgress() {
    try {
      const local = localStorage.getItem("tidy_desk_progress");
      if (local) userProgress = JSON.parse(local);
    } catch (_) {}

    if (window.xhsBridge && typeof window.xhsBridge.queryCloudStorage === "function") {
      window.xhsBridge.queryCloudStorage({ collection: CLOUD_COLLECTION }).then(res => {
        if (res && res.items && res.items.length > 0) {
          const cloudData = res.items[0];
          if (cloudData && typeof cloudData === "object") {
            Object.assign(userProgress, cloudData);
            saveLocalProgress();
          }
        }
      }).catch(err => {
        console.warn("读取云端进度提示:", err);
      });
    }
  }

  function saveLocalProgress() {
    try {
      localStorage.setItem("tidy_desk_progress", JSON.stringify(userProgress));
    } catch (_) {}
  }

  // 2. 通关后记录星级并静默同步至云存储
  function recordLevelResult(result) {
    latestResult = result;
    const lvlId = result.levelId;
    const prev = userProgress[lvlId] || { stars: 0, bestTime: 9999 };

    const newStars = Math.max(prev.stars, result.stars);
    const newBestTime = Math.min(prev.bestTime, result.time);

    userProgress[lvlId] = {
      stars: newStars,
      bestTime: newBestTime,
      updatedAt: Date.now()
    };
    saveLocalProgress();

    // 同步写入小红书云存储 (跨手机自动漫游恢复)
    if (window.xhsBridge && typeof window.xhsBridge.addCloudStorage === "function") {
      window.xhsBridge.addCloudStorage({
        collection: CLOUD_COLLECTION,
        items: [userProgress]
      }).catch(() => {});
    }

    // 计算全国总积分打榜 (总星级 * 10000 + 剩余耗时奖励)
    let totalStars = 0;
    let totalTime = 0;
    Object.keys(userProgress).forEach(k => {
      totalStars += (userProgress[k].stars || 0);
      totalTime += (userProgress[k].bestTime || 0);
    });

    const rankScore = Math.max(0, totalStars * 1000 - totalTime);
    if (rankScore > 0 && window.xhsBridge && typeof window.xhsBridge.submitScore === "function") {
      window.xhsBridge.submitScore({
        board: BOARD_ID,
        score: rankScore
      }).catch(() => {});
    }
  }

  // 3. 生成高颜值复古拍立得收纳打卡相片 (纯前端离屏 Canvas 渲染)
  function generatePolaroidCard(result) {
    try {
      const card = document.createElement("canvas");
      card.width = 600;
      card.height = 760;
      const ctx = card.getContext("2d");

      // 拍立得经典相纸米白色底色
      ctx.fillStyle = "#faf7f2";
      ctx.fillRect(0, 0, 600, 760);

      // 相框外沿柔和微阴影
      ctx.strokeStyle = "#e7e2d9";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 598, 758);

      // 居中相片区域
      const photoX = 36;
      const photoY = 36;
      const photoW = 528;
      const photoH = 528;

      ctx.fillStyle = "#f0ede6";
      ctx.fillRect(photoX, photoY, photoW, photoH);

      // 截取主游戏画布中当前摆放完成的收纳盒
      const gameCanvas = window.TidyGame ? window.TidyGame.getCanvas() : null;
      if (gameCanvas) {
        ctx.drawImage(gameCanvas, 0, 0, gameCanvas.width, gameCanvas.height, photoX, photoY, photoW, photoH);
      }

      // 相片内沿暗调线
      ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      // 拍立得下方手写质感文字
      ctx.fillStyle = "#292524";
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(result.levelName || "治愈桌面收纳", photoX + 4, 610);

      ctx.fillStyle = "#78716c";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.fillText(`通关用时: ${result.time}秒   操作步数: ${result.steps}步`, photoX + 4, 642);

      // 评级星星徽章
      const stars = result.stars || 3;
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 22px sans-serif";
      let starStr = "";
      for (let s = 0; s < stars; s++) starStr += "★ ";
      ctx.fillText(starStr, photoX + 4, 678);

      // 右下角复古火漆印章印记
      ctx.save();
      ctx.translate(photoX + photoW - 70, 640);
      ctx.rotate(-0.15);
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#e11d48";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("完美收纳", 0, -8);
      ctx.fillText("PASSED", 0, 10);
      ctx.restore();

      // 底部小红书水印标语
      ctx.fillStyle = "#a8a29e";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Alex 游戏百宝箱 · 玩治愈解压小游戏上小红书 #小红书小工具", 300, 725);

      return card.toDataURL("image/png");
    } catch (e) {
      console.warn("generatePolaroidCard error:", e);
      return null;
    }
  }

  // 4. 调用小红书官方 postNote / share 发笔记
  function shareResultNote(result) {
    const cardDataUrl = generatePolaroidCard(result);
    const titles = [
      `${result.levelName}强迫症治愈收纳`,
      `沉浸式${result.levelName}收纳打卡`,
      `挑战${result.time}秒严丝合缝收纳完成`
    ];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const content = `强迫症直接治愈！在小红书沉浸式玩【${result.levelName}】收纳，用时 ${result.time} 秒，严丝合缝填满收纳格的那一刻太解压了！快来比比谁的收纳速度更快吧！ #沉浸式收纳 #桌面收纳 #强迫症解压 #治愈小游戏 #小红书小工具`;

    const tool = window.xhs && window.xhs.miniTool;
    if (tool && typeof tool.postNote === "function") {
      const payload = {
        title: title,
        content: content,
        pageType: "photo_publish"
      };
      if (cardDataUrl) {
        payload.mediaInfo = {
          image_resources: [{ url: cardDataUrl }]
        };
      }
      tool.postNote(payload).then(() => {
        showToast("笔记发布页已唤起！");
      }).catch(err => {
        console.warn("postNote fail:", err);
        if (typeof tool.share === "function" && cardDataUrl) {
          tool.share({ type: "image", image_resource: cardDataUrl });
        } else {
          showToast("请在小红书 App 中点击右上角发笔记打卡！");
        }
      });
    } else if (tool && typeof tool.share === "function") {
      if (cardDataUrl) {
        tool.share({ type: "image", image_resource: cardDataUrl });
      } else {
        tool.share({ type: "card" });
      }
    } else {
      showToast("拍立得打卡照已生成，请在小红书 App 发布笔记！");
    }
  }

  // 5. 弹窗与 UI 控制
  function showWinModal(result) {
    const modal = document.getElementById("win-modal");
    if (!modal) return;

    const imgEl = document.getElementById("win-polaroid-img");
    const captionEl = document.getElementById("win-caption");
    const statEl = document.getElementById("win-stat");
    const starsEl = document.getElementById("win-stars");

    const cardUrl = generatePolaroidCard(result);
    if (imgEl && cardUrl) imgEl.src = cardUrl;
    if (captionEl) captionEl.textContent = `完美收纳 · ${result.levelName}`;
    if (statEl) statEl.textContent = `通关用时: ${result.time}s   操作步数: ${result.steps}步`;
    if (starsEl) {
      let sHtml = "";
      for (let i = 0; i < (result.stars || 3); i++) sHtml += '<span class="win-star">★</span>';
      starsEl.innerHTML = sHtml;
    }

    modal.style.display = "flex";
  }

  function hideWinModal() {
    const modal = document.getElementById("win-modal");
    if (modal) modal.style.display = "none";
  }

  function showLeaderboard() {
    const modal = document.getElementById("leaderboard-modal");
    if (!modal) return;
    modal.style.display = "flex";
    refreshRankList();
  }

  function hideLeaderboard() {
    const modal = document.getElementById("leaderboard-modal");
    if (modal) modal.style.display = "none";
  }

  function refreshRankList() {
    const listEl = document.getElementById("rank-list-items");
    const scoreEl = document.getElementById("my-rank-score");
    const posEl = document.getElementById("my-rank-pos");
    if (!listEl) return;

    listEl.innerHTML = '<div class="rank-loading">正在拉取全国收纳大师榜...</div>';

    Promise.all([
      window.xhsBridge.getMyRank({ board: BOARD_ID, period: currentPeriod }),
      window.xhsBridge.getRankList({ board: BOARD_ID, period: currentPeriod })
    ]).then(([myRes, listRes]) => {
      let totalStars = 0;
      Object.keys(userProgress).forEach(k => {
        totalStars += (userProgress[k].stars || 0);
      });

      if (scoreEl && posEl) {
        scoreEl.textContent = `${totalStars} 星收纳大师`;
        if (myRes && myRes.status === "EXACT" && myRes.rank) {
          posEl.textContent = `全国排名: 第 ${myRes.rank} 名 (超越了 9${Math.min(8, 9 - Math.floor(myRes.rank / 10))}% 的收纳达人)`;
        } else if (totalStars > 0) {
          posEl.textContent = "全国排名: 第 1 名 (当前榜首！)";
        } else {
          posEl.textContent = "全国排名: 虚位以待 (完成收纳后自动上榜)";
        }
      }

      const data = (listRes && listRes.data) || [];
      if (!data.length) {
        listEl.innerHTML = '<div class="rank-empty">暂无上榜记录，快来成为第一个打榜王者！</div>';
        return;
      }

      let html = "";
      data.slice(0, 50).forEach(item => {
        const isTop3 = item.rank <= 3;
        const rankClass = isTop3 ? `top-${item.rank}` : "";
        const badge = item.rank === 1 ? "冠" : item.rank === 2 ? "亚" : item.rank === 3 ? "季" : item.rank;
        const isMe = item.nickname && (item.nickname.indexOf("本机") >= 0 || item.nickname.indexOf("我") >= 0);
        const rowClass = isMe ? "rank-item is-me" : "rank-item";

        html += `
          <div class="${rowClass}">
            <div class="rank-num ${rankClass}">${badge}</div>
            <div class="rank-user">${escapeHtml(item.nickname || "收纳达人")}</div>
            <div class="rank-score">${Number(item.score || 0).toLocaleString()} 分</div>
          </div>
        `;
      });
      listEl.innerHTML = html;
    }).catch(err => {
      console.warn("拉取排行榜异常:", err);
      listEl.innerHTML = '<div class="rank-empty">暂未能连通网络，已为您保留本地战报。</div>';
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  // 初始化 DOM 事件绑定
  function bindUI() {
    initProgress();

    // 胜利弹窗操作
    const btnWinShare = document.getElementById("btn-win-share");
    if (btnWinShare) {
      bindFastClick(btnWinShare, function() {
        if (latestResult) shareResultNote(latestResult);
      });
    }

    const btnWinNext = document.getElementById("btn-win-next");
    if (btnWinNext) {
      bindFastClick(btnWinNext, function() {
        hideWinModal();
        if (window.TidyGame) {
          const cur = window.TidyGame.getCurrentLevel();
          const nextIdx = (cur ? cur.id : 1);
          if (nextIdx < 5) {
            window.TidyGame.loadLevel(nextIdx);
          } else {
            showToast("恭喜已通关全部 5 大主题场景！已为您解锁收纳大师成就！");
            showLeaderboard();
          }
        }
      });
    }

    const winClose = document.getElementById("win-modal-close");
    if (winClose) bindFastClick(winClose, hideWinModal);

    // 排行榜弹窗操作
    const btnLd = document.getElementById("btn-header-leaderboard");
    if (btnLd) bindFastClick(btnLd, showLeaderboard);

    const btnLdClose = document.getElementById("leaderboard-close");
    if (btnLdClose) bindFastClick(btnLdClose, hideLeaderboard);

    const ldTabs = Array.from(document.querySelectorAll(".rank-tab"));
    ldTabs.forEach(tab => {
      bindFastClick(tab, function() {
        ldTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentPeriod = tab.getAttribute("data-period") || "day";
        refreshRankList();
      });
    });

    const btnRankShare = document.getElementById("btn-rank-share");
    if (btnRankShare) {
      bindFastClick(btnRankShare, function() {
        if (latestResult) {
          shareResultNote(latestResult);
        } else {
          showToast("请先完成一局收纳，生成专属打卡相片！");
        }
      });
    }

    // 声音切换
    const btnSound = document.getElementById("btn-header-sound");
    if (btnSound && window.TidyAudio) {
      const updateSoundUI = () => {
        const m = window.TidyAudio.isMuted();
        btnSound.textContent = m ? "静音" : "声音";
        btnSound.style.opacity = m ? "0.6" : "1";
      };
      updateSoundUI();
      bindFastClick(btnSound, function() {
        const m = window.TidyAudio.toggleMute();
        updateSoundUI();
        showToast(m ? "已开启静音" : "声音已开启");
      });
    }
  }

  return {
    initProgress: initProgress,
    bindUI: bindUI,
    recordLevelResult: recordLevelResult,
    generatePolaroidCard: generatePolaroidCard,
    shareResultNote: shareResultNote,
    showWinModal: showWinModal,
    hideWinModal: hideWinModal,
    showLeaderboard: showLeaderboard,
    hideLeaderboard: hideLeaderboard,
    getUserProgress: () => userProgress,
    showToast: showToast
  };
});
