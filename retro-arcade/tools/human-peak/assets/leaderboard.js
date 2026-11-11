/**
 * leaderboard.js
 * 《人类极限挑战》小红书原生端能力联动控制器 (小红书黄金3:4大字爆款战报 · 截屏存相册)
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PeakLeaderboard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  "use strict";

  const BOARD_CPS = 1;       // 榜位 1: 全国手速狂魔榜
  const BOARD_REACTION = 2;  // 榜位 2: 全国反应力神榜
  const BOARD_MEMORY = 3;    // 榜位 3: 瞬时记忆巅峰榜
  const CLOUD_COLLECTION = "human_peak_records";

  let currentBoardType = "cps"; // 'cps' | 'reaction' | 'memory'
  let latestResult = null;
  let userRecords = {
    bestReaction: 0,
    bestCps: 0,
    bestMemory: 0
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
      if (now - lastTime < 250) return;
      lastTime = now;
      handler(e);
    };
    el.addEventListener("touchend", trigger, { passive: false });
    el.addEventListener("click", trigger);
  }

  // 1. 初始化并读取云存储与用户信息
  function initProgress() {
    try {
      const local = localStorage.getItem("human_peak_records");
      if (local) userRecords = JSON.parse(local);
    } catch (_) {}

    if (window.xhsBridge && typeof window.xhsBridge.queryCloudStorage === "function") {
      window.xhsBridge.queryCloudStorage({ collection: CLOUD_COLLECTION }).then(res => {
        if (res && res.items && res.items.length > 0) {
          const cloud = res.items[0];
          if (cloud && typeof cloud === "object") {
            Object.assign(userRecords, cloud);
            saveLocalRecords();
          }
        }
      }).catch(err => {
        console.warn("读取云端成就提示:", err);
      });
    }
  }

  function saveLocalRecords() {
    try {
      localStorage.setItem("human_peak_records", JSON.stringify(userRecords));
    } catch (_) {}
  }

  // 2. 挑战结算记录并上榜
  function recordResult(result) {
    latestResult = result;
    const mode = result.mode;

    if (mode === "reaction") {
      const ms = result.score;
      if (!userRecords.bestReaction || ms < userRecords.bestReaction) {
        userRecords.bestReaction = ms;
      }
      const score = Math.max(0, 1000 - ms);
      if (window.xhsBridge && typeof window.xhsBridge.submitScore === "function") {
        window.xhsBridge.submitScore({ board: BOARD_REACTION, score: score }).catch(() => {});
      }
    } else if (mode === "cps") {
      const clicks = result.score;
      if (clicks > userRecords.bestCps) {
        userRecords.bestCps = clicks;
      }
      if (window.xhsBridge && typeof window.xhsBridge.submitScore === "function") {
        window.xhsBridge.submitScore({ board: BOARD_CPS, score: clicks }).catch(() => {});
      }
    } else if (mode === "memory") {
      const lvl = result.score;
      if (lvl > userRecords.bestMemory) {
        userRecords.bestMemory = lvl;
      }
      if (window.xhsBridge && typeof window.xhsBridge.submitScore === "function") {
        window.xhsBridge.submitScore({ board: BOARD_MEMORY, score: lvl }).catch(() => {});
      }
    }

    saveLocalRecords();

    if (window.xhsBridge && typeof window.xhsBridge.addCloudStorage === "function") {
      window.xhsBridge.addCloudStorage({
        collection: CLOUD_COLLECTION,
        items: [userRecords]
      }).catch(() => {});
    }
  }

  // 3. 1:1 当前卡片框纯净战报海报 (纯黑深邃 · 纯白大字与黑金质感 · 彻底去绿去遮挡)
  function generateResultCard(result) {
    try {
      const card = document.createElement("canvas");
      // 小红书黄金比例 3:4 (720x960)
      card.width = 720;
      card.height = 960;
      const ctx = card.getContext("2d");

      // 1. 深邃暗夜背景底色 (与应用全屏一致)
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, 720, 960);

      // 2. 居中绘制 1:1 当前屏幕大卡片框
      const kx = 44, ky = 48, kw = 632, kh = 864, kr = 28;
      ctx.save();
      ctx.fillStyle = "rgba(12, 18, 34, 0.95)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) {
        ctx.roundRect(kx, ky, kw, kh, kr);
      } else {
        ctx.rect(kx, ky, kw, kh);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 3. 顶部微标 (纯白几何对勾印章 · 0 绿)
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(360, 125, 24, 0, Math.PI * 2);
      ctx.stroke();
      if (ctx.moveTo && ctx.lineTo) {
        ctx.beginPath();
        ctx.moveTo(350, 125);
        ctx.lineTo(357, 133);
        ctx.lineTo(372, 117);
        ctx.stroke();
      }
      ctx.restore();

      // 4. 模式主标题 (纯白 34px 加粗)
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 34px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.textAlign = "center";
      let modeName = "神经反应速度";
      if (result.mode === "cps") modeName = "10 秒极限手速";
      if (result.mode === "memory") modeName = "瞬时记忆极限";
      ctx.fillText(modeName, 360, 200);

      // 5. 副标题 (浅白灰色 17px)
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 17px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("全国巅峰极限认证", 360, 238);

      // 6. 核心大数字 (135px 纯白巨幅粗体 · 纯净通透直出 · 彻底无圆圈无绿光)
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 135px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
      ctx.shadowBlur = 30;
      ctx.fillText(String(result.score), 360, 410);

      // 单位
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 30px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(result.unit || "", 360, 470);
      ctx.restore();

      // 7. 评级大勋章 (黑金底 + 香槟金字 · 0 绿)
      ctx.save();
      ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
      ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
      ctx.lineWidth = 1.5;
      const rx = 160, ry = 530, rw = 400, rh = 62, rr = 31;
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, rr);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 28px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(result.rankTitle || "巅峰神级达人", 360, 572);
      ctx.restore();

      // 8. 超越全国网友横幅 (暗黑微透底 + 纯白大字 · 彻底无绿)
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.2;
      const bx = 110, by = 625, bw = 500, bh = 68, br = 20;
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, bw, bh, br);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 26px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`超越全国 ${result.beatPct || 95.0}% 网友`, 360, 668);
      ctx.restore();

      // 9. 挑战号召语
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "700 20px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("谁能超越我？来小红书挑战我的战绩！", 360, 765);

      // 10. 底部小红书标签
      ctx.fillStyle = "#64748b";
      ctx.font = "600 16px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("#人类极限挑战  #小红书小工具", 360, 835);

      return card.toDataURL("image/png");
    } catch (e) {
      console.warn("generateResultCard err:", e);
      return null;
    }
  }

  // 4. 调用小红书官方 postNote 发笔记
  function shareResultNote(result) {
    const cardDataUrl = generateResultCard(result);
    let title = "测测你的真实神经反射";
    if (result.mode === "reaction") {
      title = `神经反应${result.score}ms谁来挑战`;
    } else if (result.mode === "cps") {
      title = `10秒手速${result.score}次你能超过吗`;
    } else {
      title = `挑战瞬间记忆${result.score}关谁来战`;
    }

    const content = `测出了我的极限成绩：${result.score}${result.unit}！评级【${result.rankTitle}】，超越了全国 ${result.beatPct}% 的网友！不服来小红书挑战我的战绩！ #人类极限挑战 #反应速度测试 #手速测试 #挑战全网 #小红书小工具`;

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
        showToast("笔记发布页已成功唤起！");
      }).catch(err => {
        console.warn("postNote fail:", err);
        if (typeof tool.share === "function" && cardDataUrl) {
          tool.share({ type: "image", image_resource: cardDataUrl });
        } else {
          showToast("请在小红书 App 点击右上角发笔记打卡！");
        }
      });
    } else if (tool && typeof tool.share === "function") {
      if (cardDataUrl) {
        tool.share({ type: "image", image_resource: cardDataUrl });
      } else {
        tool.share({ type: "card" });
      }
    } else {
      showToast("战报已生成，请在小红书 App 内发布！");
    }
  }

  // 5. 一键截屏保存至相册
  function saveScreenshotToAlbum() {
    if (window.PeakAudio) window.PeakAudio.playShutter();

    const res = latestResult || {
      mode: window.PeakGame ? window.PeakGame.getMode() : "reaction",
      score: 188,
      unit: "ms",
      rankTitle: "电竞级瞬发反应",
      beatPct: 95.0
    };

    const cardUrl = generateResultCard(res);
    if (!cardUrl) {
      showToast("截屏生成失败");
      return;
    }

    const tool = window.xhs && window.xhs.miniTool;
    if (tool && typeof tool.saveImageToPhotosAlbum === "function") {
      tool.saveImageToPhotosAlbum({
        filePath: cardUrl
      }).then(() => {
        showToast("战报高清海报已保存至相册！");
      }).catch(() => {
        downloadImage(cardUrl, "human-peak-battle-card.png");
        showToast("战报图片已下载！");
      });
    } else {
      downloadImage(cardUrl, "human-peak-battle-card.png");
      showToast("战报高清海报已保存！");
    }
  }

  function downloadImage(dataUrl, filename) {
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {}
  }

  // 6. 弹窗与 UI 控制
  function showResultModal(result) {
    const modal = document.getElementById("result-modal");
    if (!modal) return;

    const imgEl = document.getElementById("card-preview-img");
    const cardUrl = generateResultCard(result);
    if (imgEl && cardUrl) imgEl.src = cardUrl;

    modal.style.display = "flex";
  }

  function hideResultModal() {
    const modal = document.getElementById("result-modal");
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
    if (!listEl) return;

    let boardId = BOARD_CPS;
    if (currentBoardType === "reaction") boardId = BOARD_REACTION;
    if (currentBoardType === "memory") boardId = BOARD_MEMORY;

    listEl.innerHTML = '<div class="rank-empty">正在拉取全国排位数据...</div>';

    const rankCall = window.xhsBridge && typeof window.xhsBridge.getRankList === "function"
      ? window.xhsBridge.getRankList({ board: boardId, period: "all" })
      : Promise.resolve({ data: [] });
    const mineCall = window.xhsBridge && typeof window.xhsBridge.getMyRank === "function"
      ? window.xhsBridge.getMyRank({ board: boardId, period: "all" })
      : Promise.resolve(null);

    Promise.all([rankCall, mineCall]).then(pair => {
        const res = pair[0] || {};
        const mine = pair[1] || {};
        if (res.unauthorized || mine.unauthorized) {
          listEl.innerHTML = '<div class="rank-empty">未获得头像昵称授权，全国榜暂不可用。授权后展示平台下发的昵称；榜单带有头像地址时才显示头像。</div>';
          return;
        }
        const data = res.data || [];
        if (!data.length) {
          const hint = res.offline ? "当前为本地预览榜，真机以小红书官方榜为准。" : "暂无上榜成绩，快来创造第一个全国记录！";
          listEl.innerHTML = '<div class="rank-empty">' + hint + '</div>';
          return;
        }

        const myRank = mine.status === "EXACT" ? Number(mine.rank) : 0;
        let html = res.offline ? '<div class="rank-empty">当前为本地预览榜，真机以小红书官方榜为准。</div>' : "";
        data.slice(0, 50).forEach(item => {
          const isTop3 = item.rank <= 3;
          const rankClass = isTop3 ? `top-${item.rank}` : "";
          const badge = item.rank === 1 ? "冠" : item.rank === 2 ? "亚" : item.rank === 3 ? "季" : item.rank;
          const uName = officialNickname(item);
          const avatarUrl = rowAvatarSrc(item);
          const isMe = myRank > 0 && Number(item.rank) === myRank;

          let scoreText = `${item.score} 次`;
          if (currentBoardType === "reaction") {
            scoreText = `${1000 - Number(item.score)} ms`;
          } else if (currentBoardType === "memory") {
            scoreText = `第 ${item.score} 关`;
          }

          html += `
            <div class="rank-item${isMe ? " is-me" : ""}">
              <div class="rank-num ${rankClass}">${badge}</div>
              <div class="rank-user-box">
                ${avatarHtml(uName, avatarUrl)}
                <span class="rank-user-name">${escapeHtml(uName)}</span>
              </div>
              <div class="rank-val">${scoreText}</div>
            </div>
          `;
        });
        listEl.innerHTML = html;
        bindAvatarFallback(listEl);
      }).catch(err => {
        console.warn("拉取榜单异常:", err);
        listEl.innerHTML = '<div class="rank-empty">本地单机模式，请连网查看全国排名。</div>';
      });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function officialNickname(item) {
    const name = item && (item.nickname || item.nickName);
    if (name == null || String(name).trim() === "") return "未公开昵称";
    return String(name);
  }

  function rowAvatarSrc(item) {
    if (!item) return "";
    const bag = [item];
    if (item.user) bag.push(item.user);
    if (item.userInfo) bag.push(item.userInfo);
    for (let i = 0; i < bag.length; i++) {
      const row = bag[i];
      const candidates = [row.avatar, row.avatarUrl, row.avatar_url];
      for (let j = 0; j < candidates.length; j++) {
        const src = candidates[j];
        if (typeof src !== "string") continue;
        const trimmed = src.trim();
        if (!trimmed || trimmed.length > 2048 || /^javascript:/i.test(trimmed)) continue;
        if (/^(https?:|data:image\/|blob:)/i.test(trimmed)) return trimmed;
        if (trimmed.charAt(0) === "/" || trimmed.indexOf("./") === 0) return trimmed;
      }
    }
    return "";
  }

  function avatarHtml(name, src) {
    const letter = escapeHtml(String(name || "极").slice(0, 1));
    const placeholder = `<div class="rank-avatar-placeholder">${letter}</div>`;
    if (!src) return placeholder;
    return `<img class="rank-avatar" src="${escapeHtml(src)}" alt="" />` +
      `<div class="rank-avatar-placeholder" style="display:none;">${letter}</div>`;
  }

  function bindAvatarFallback(root) {
    const imgs = root.querySelectorAll(".rank-avatar");
    for (let i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.style.display = "none";
        const next = this.nextElementSibling;
        if (next) next.style.display = "flex";
      });
    }
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function triggerShare() {
    let res = latestResult;
    if (!res) {
      const mode = (window.PeakGame && window.PeakGame.getMode()) || "reaction";
      let score = userRecords.bestReaction || 192;
      let unit = "ms";
      let rankTitle = "超神神经反射";
      let beatPct = 94.6;
      if (mode === "cps") {
        score = userRecords.bestCps || 92;
        unit = "次";
        rankTitle = "手速狂魔";
        beatPct = 93.8;
      } else if (mode === "memory") {
        score = userRecords.bestMemory || 7;
        unit = "关";
        rankTitle = "超强大脑天才";
        beatPct = 92.4;
      }
      res = {
        mode: mode,
        score: score,
        unit: unit,
        rankTitle: rankTitle,
        beatPct: beatPct
      };
    }
    shareResultNote(res);
  }

  function bindUI() {
    initProgress();

    // 绑定发笔记打榜按钮 (主页面框右上角弹出键 + 备用入口)
    const shareBtns = [
      document.getElementById("btn-stage-share"),
      document.getElementById("btn-share-note")
    ];
    shareBtns.forEach(btn => {
      if (btn) bindFastClick(btn, triggerShare);
    });

    // 保存相册
    const btnSavePhoto = document.getElementById("btn-save-photo");
    if (btnSavePhoto) {
      bindFastClick(btnSavePhoto, function() {
        saveScreenshotToAlbum();
      });
    }

    // 重新挑战
    const btnRetry = document.getElementById("btn-retry");
    if (btnRetry) {
      bindFastClick(btnRetry, function() {
        hideResultModal();
        if (window.PeakGame) window.PeakGame.resetCurrentMode();
      });
    }

    const resClose = document.getElementById("result-close");
    if (resClose) bindFastClick(resClose, hideResultModal);

    // 底部主截屏按钮
    const btnScreenshot = document.getElementById("btn-screenshot");
    if (btnScreenshot) {
      bindFastClick(btnScreenshot, function() {
        saveScreenshotToAlbum();
      });
    }

    // 大师榜打开/关闭
    const btnLd = document.getElementById("btn-header-leaderboard");
    if (btnLd) bindFastClick(btnLd, showLeaderboard);

    const ldClose = document.getElementById("leaderboard-close");
    if (ldClose) bindFastClick(ldClose, hideLeaderboard);

    // 榜单三大类型切换
    const tabs = Array.from(document.querySelectorAll(".rank-board-tab"));
    tabs.forEach(tab => {
      bindFastClick(tab, function() {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentBoardType = tab.getAttribute("data-board") || "cps";
        refreshRankList();
      });
    });

    // 声音按钮
    const btnSound = document.getElementById("btn-header-sound");
    if (btnSound && window.PeakAudio) {
      const updateSoundUI = () => {
        const m = window.PeakAudio.isMuted();
        btnSound.textContent = m ? "静音" : "声音";
        btnSound.style.opacity = m ? "0.6" : "1";
      };
      updateSoundUI();
      bindFastClick(btnSound, function() {
        const m = window.PeakAudio.toggleMute();
        updateSoundUI();
        showToast(m ? "声音已静音" : "声音已开启");
      });
    }
  }

  return {
    bindUI: bindUI,
    recordResult: recordResult,
    showResultModal: showResultModal,
    hideResultModal: hideResultModal,
    showLeaderboard: showLeaderboard,
    saveScreenshotToAlbum: saveScreenshotToAlbum,
    shareResultNote: shareResultNote,
    triggerShare: triggerShare,
    getUserRecords: () => userRecords,
    generateResultCard: generateResultCard,
    showToast: showToast
  };
});
