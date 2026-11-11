/**
 * leaderboard.js
 * 小红书原生排行榜联动控制组件
 * 对接 window.xhsBridge.submitScore / getRankList / getMyRank
 * 支持触摸极速响应、高清战绩海报生成、postNote / share 笔记发布与新一局秒开
 */
(function() {
  "use strict";

  const BOARD_ID = 1; // 榜位 1: 全国消除高分榜
  let currentPeriod = "day"; // 默认展示今日榜
  let latestGameScore = 0;
  let resetArmed = false;
  let resetTimer = null;

  // DOM 元素缓存
  let modal = null;
  let scoreEl = null;
  let posEl = null;
  let listEl = null;
  let closeBtn = null;
  let restartBtn = null;
  let shareBtn = null;
  let tabBtns = [];

  // 快速防抖点击绑定，移动端同时响应 touchend 与 click，且阻止冒泡与穿透
  function bindFastClick(el, handler) {
    if (!el) return;
    let lastTime = 0;
    const trigger = function(e) {
      if (e) {
        e.stopPropagation();
        if (e.cancelable && e.type === "touchend") {
          e.preventDefault();
        }
      }
      const now = Date.now();
      if (now - lastTime < 300) return;
      lastTime = now;
      handler(e);
    };
    el.addEventListener("touchend", trigger, { passive: false });
    el.addEventListener("click", trigger);
  }

  // 生成战绩海报卡片 (纯前端离屏 Canvas 绘制)
  function generateShareCard(score, lines, level) {
    try {
      const card = document.createElement("canvas");
      card.width = 640;
      card.height = 800;
      const ctx = card.getContext("2d");

      // 背景渐变
      const grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, "#1a1a24");
      grad.addColorStop(1, "#0d0d12");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 800);

      // 外框线条
      ctx.strokeStyle = "rgba(232, 71, 59, 0.4)";
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 608, 768);

      // 顶部标题
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("经典俄罗斯方块 1989", 320, 70);

      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("全国消除排行榜 · 战绩海报", 320, 105);

      // 截取当前游戏离屏 Canvas 画面
      let offCanvas = null;
      if (window.GGEMU_CORE && typeof window.GGEMU_CORE.source === "function") {
        offCanvas = window.GGEMU_CORE.source();
      }
      if (offCanvas) {
        const gw = 400;
        const gh = Math.round(gw * (240 / 256));
        const gx = (640 - gw) / 2;
        const gy = 140;
        ctx.fillStyle = "#000000";
        ctx.fillRect(gx - 4, gy - 4, gw + 8, gh + 8);
        ctx.drawImage(offCanvas, gx, gy, gw, gh);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 2;
        ctx.strokeRect(gx, gy, gw, gh);
      }

      // 得分卡片
      const cardY = 540;
      ctx.fillStyle = "rgba(232, 71, 59, 0.15)";
      ctx.fillRect(60, cardY, 520, 110);
      ctx.strokeStyle = "#e8473b";
      ctx.lineWidth = 2;
      ctx.strokeRect(60, cardY, 520, 110);

      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "16px sans-serif";
      ctx.fillText("本局最终得分", 320, cardY + 32);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText(`${Number(score || 0).toLocaleString()} 分`, 320, cardY + 82);

      // 消除行数与关卡
      ctx.fillStyle = "#a0a0ab";
      ctx.font = "16px sans-serif";
      ctx.fillText(`消除行数: ${lines || 0} 行   难度等级: Level ${level || 0}`, 320, 680);

      // 底部标语
      ctx.fillStyle = "#888892";
      ctx.font = "14px sans-serif";
      ctx.fillText("Alex 游戏百宝箱 · 玩经典小游戏上小红书 #小红书小工具", 320, 740);

      return card.toDataURL("image/png");
    } catch (e) {
      console.warn("generateShareCard error:", e);
      return null;
    }
  }

  function initUI() {
    modal = document.getElementById("leaderboard-modal");
    if (!modal) return;

    scoreEl = document.getElementById("my-rank-score");
    posEl = document.getElementById("my-rank-pos");
    listEl = document.getElementById("rank-list-items");
    closeBtn = document.getElementById("leaderboard-close");
    restartBtn = document.getElementById("btn-rank-restart");
    shareBtn = document.getElementById("btn-rank-share");
    tabBtns = Array.from(document.querySelectorAll(".rank-tab"));

    // 绑定关闭
    if (closeBtn) {
      bindFastClick(closeBtn, hideLeaderboard);
    }

    // 绑定再来一局
    if (restartBtn) {
      bindFastClick(restartBtn, function() {
        hideLeaderboard();
        if (window.GGEMU_CORE && typeof window.GGEMU_CORE.reset === "function") {
          window.GGEMU_CORE.reset();
          // 自动脉冲推进一次 START，进入模式选择，让玩家秒开新一局
          setTimeout(function() {
            if (window.GGEMU_CORE && typeof window.GGEMU_CORE.setButton === "function") {
              window.GGEMU_CORE.setButton("start", true);
              setTimeout(function() {
                window.GGEMU_CORE.setButton("start", false);
              }, 100);
            }
          }, 150);
          if (window.GGEMU_TOAST) {
            window.GGEMU_TOAST("新对局已就绪！请按开始或旋转按键进入游戏");
          }
        }
      });
    }

    // 绑定发笔记晒成绩 (对齐小红书官方 postNote 与 share 规范)
    if (shareBtn) {
      bindFastClick(shareBtn, function() {
        const score = latestGameScore || 0;
        const lines = (window.GGEMU_CORE && typeof window.GGEMU_CORE.getLines === "function") ? window.GGEMU_CORE.getLines() : 0;
        const level = (window.GGEMU_CORE && typeof window.GGEMU_CORE.getLevel === "function") ? window.GGEMU_CORE.getLevel() : 0;
        const cardImg = generateShareCard(score, lines, level);

        const titles = [
          `俄罗斯方块挑战${score}分`,
          `方块极限消四行${score}分`,
          `全国排行榜冲击${score}分`
        ];
        const title = titles[Math.floor(Math.random() * titles.length)];
        const text = `红白机经典俄罗斯方块，极限手速拿下 ${score} 分！消四行手感拉满，快来小工具全国排行榜比比谁的分数更高吧！ #小红书小工具 #俄罗斯方块 #童年经典游戏 #掌机`;

        const tool = window.xhs && window.xhs.miniTool;
        if (tool && typeof tool.postNote === "function") {
          const payload = {
            title: title,
            content: text,
            pageType: "photo_publish"
          };
          if (cardImg) {
            payload.mediaInfo = {
              image_resources: [{ url: cardImg }]
            };
          }
          tool.postNote(payload).then(function() {
            if (window.GGEMU_TOAST) window.GGEMU_TOAST("笔记发布页已唤起！");
          }).catch(function(err) {
            console.warn("postNote fail:", err);
            if (typeof tool.share === "function" && cardImg) {
              tool.share({ type: "image", image_resource: cardImg });
            } else if (window.GGEMU_TOAST) {
              window.GGEMU_TOAST("请在小红书 App 中点击右上角发笔记分享战绩！");
            }
          });
        } else if (tool && typeof tool.share === "function") {
          if (cardImg) {
            tool.share({ type: "image", image_resource: cardImg });
          } else {
            tool.share({ type: "card" });
          }
        } else if (window.GGEMU_TOAST) {
          window.GGEMU_TOAST("请在小红书 App 中点击右上角发笔记分享战绩！");
        }
      });
    }

    // 绑定 Tab 切换
    tabBtns.forEach(btn => {
      bindFastClick(btn, function() {
        tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentPeriod = btn.getAttribute("data-period") || "day";
        refreshRankList();
      });
    });

    // 点击蒙层外部关闭
    bindFastClick(modal, function(e) {
      if (e.target === modal) {
        hideLeaderboard();
      }
    });

    // 绑定第2层控制栏
    const btnLd = document.getElementById("btn-leaderboard");
    if (btnLd) {
      bindFastClick(btnLd, function() {
        showLeaderboard(latestGameScore);
      });
    }

    // 绑定复位 (2秒双击防误触守卫)
    const btnReset = document.getElementById("btn-reset");
    if (btnReset) {
      const handleReset = function(e) {
        if (e) {
          e.stopPropagation();
          if (e.cancelable && e.type === "touchend") e.preventDefault();
        }
        if (!resetArmed) {
          resetArmed = true;
          if (window.GGEMU_TOAST) window.GGEMU_TOAST("再按一次确认复位游戏");
          clearTimeout(resetTimer);
          resetTimer = setTimeout(function() {
            resetArmed = false;
          }, 2000);
        } else {
          resetArmed = false;
          clearTimeout(resetTimer);
          if (window.GGEMU_CORE && typeof window.GGEMU_CORE.reset === "function") {
            window.GGEMU_CORE.reset();
            if (window.GGEMU_TOAST) window.GGEMU_TOAST("已复位重启");
          }
        }
      };
      btnReset.addEventListener("touchend", handleReset, { passive: false });
      btnReset.addEventListener("click", handleReset);
    }

    // 绑定声音开关
    const btnSound = document.getElementById("btn-sound");
    if (btnSound) {
      let isMuted = false;
      try {
        isMuted = localStorage.getItem("ggemu_sound_muted") === "1";
      } catch (e) {}

      const updateSoundUI = function() {
        if (isMuted) {
          btnSound.textContent = "静音";
          btnSound.style.opacity = "0.6";
        } else {
          btnSound.textContent = "声音";
          btnSound.style.opacity = "1";
        }
      };
      updateSoundUI();
      if (window.GGEMU_CORE && typeof window.GGEMU_CORE.setMute === "function") {
        window.GGEMU_CORE.setMute(isMuted);
      }

      const handleSound = function(e) {
        if (e) {
          e.stopPropagation();
          if (e.cancelable && e.type === "touchend") e.preventDefault();
        }
        isMuted = !isMuted;
        try {
          localStorage.setItem("ggemu_sound_muted", isMuted ? "1" : "0");
        } catch (e) {}
        if (window.GGEMU_CORE && typeof window.GGEMU_CORE.setMute === "function") {
          window.GGEMU_CORE.setMute(isMuted);
        }
        updateSoundUI();
        if (window.GGEMU_TOAST) {
          window.GGEMU_TOAST(isMuted ? "已静音" : "声音已开启");
        }
      };
      btnSound.addEventListener("touchend", handleSound, { passive: false });
      btnSound.addEventListener("click", handleSound);
    }
  }

  // 刷新排行榜列表
  function refreshRankList() {
    if (!listEl) return;
    listEl.innerHTML = '<div class="rank-loading">正在拉取最新榜单数据...</div>';

    // 异步拉取个人与前 100 榜单
    Promise.all([
      window.xhsBridge.getMyRank({ board: BOARD_ID, period: currentPeriod }),
      window.xhsBridge.getRankList({ board: BOARD_ID, period: currentPeriod })
    ]).then(([myRes, listRes]) => {
      // 渲染个人战报
      if (posEl && scoreEl) {
        const bestScore = (myRes && myRes.score) ? myRes.score : latestGameScore;
        scoreEl.textContent = `${bestScore.toLocaleString()} 分`;

        if (myRes && myRes.status === "EXACT" && myRes.rank) {
          posEl.textContent = `全国排名: 第 ${myRes.rank} 名 (超越了 9${Math.min(8, 9 - Math.floor(myRes.rank / 10))}% 的玩家)`;
        } else if (myRes && myRes.status === "OVER_LIMIT") {
          posEl.textContent = "全国排名: 500+ (加油冲榜！)";
        } else if (bestScore > 0) {
          posEl.textContent = "全国排名: 第 1 名 (当前榜首！)";
        } else {
          posEl.textContent = "全国排名: 虚位以待 (完成一局后自动上榜)";
        }
      }

      // 渲染前 100 列表
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
            <div class="rank-user">${escapeHtml(item.nickname || "方块玩家")}</div>
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
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // 打开排行榜
  function showLeaderboard(score) {
    if (score !== undefined) {
      latestGameScore = Math.max(latestGameScore, score);
    }
    if (!modal) initUI();
    if (!modal) return;

    modal.style.display = "flex";
    refreshRankList();
  }

  // 关闭排行榜
  function hideLeaderboard() {
    if (modal) {
      modal.style.display = "none";
    }
  }

  // 监听游戏结束结算
  window.onTetrisGameOver = function(result) {
    const finalScore = (result && result.score) || 0;
    latestGameScore = Math.max(latestGameScore, finalScore);

    // 1. 提交至小红书原生排行榜（自动优雅降级）
    if (finalScore > 0 && window.xhsBridge) {
      window.xhsBridge.submitScore({
        board: BOARD_ID,
        score: finalScore
      }).catch(function() {});
    }

    // 2. 延迟 0.7 秒拉开窗帘动画后自动弹出排行榜
    setTimeout(function() {
      showLeaderboard(finalScore);
    }, 700);
  };

  // 页面加载完成后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }

  // 挂载全局调用
  window.openLeaderboard = showLeaderboard;
  window.hideLeaderboard = hideLeaderboard;
})();
