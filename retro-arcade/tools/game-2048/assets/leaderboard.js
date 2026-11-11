/**
 * leaderboard.js
 * 2048 小红书原生排行榜联动控制组件
 * 对接 window.xhsBridge.submitScore / getRankList / getMyRank
 * 支持极速响应、离屏 Canvas 640x800 高颜值战绩海报生成、postNote / share 笔记发布与新局秒开
 */
(function() {
  "use strict";

  var BOARD_ID = 1; // 榜位 1: 2048 全国高分榜
  var currentPeriod = "day"; // 默认展示今日榜
  var latestGameScore = 0;
  var latestMaxTile = 2;
  var resetArmed = false;
  var resetTimer = null;

  var modal = null;
  var scoreEl = null;
  var posEl = null;
  var listEl = null;
  var tabBtns = [];

  function getBind() {
    return window.bindAction || window.bindClick || function(el, fn) {
      if (typeof el === "string") el = document.getElementById(el);
      if (el) el.addEventListener("click", fn);
    };
  }

  function cssColor(name, fallback) {
    var value = "";
    try {
      value = getComputedStyle(document.body).getPropertyValue(name).trim();
    } catch (e) {}
    return value || fallback;
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return "rgba(245, 194, 231, " + alpha + ")";
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function currentPosterTheme() {
    var style = getComputedStyle(document.body);
    var gradient = style.getPropertyValue("--bg-gradient") || "";
    var stops = gradient.match(/#[0-9a-fA-F]{3,8}/g) || [];
    var latte = document.body.classList.contains("theme-latte");
    return {
      bgTop: stops[0] || (latte ? "#ffffff" : "#1e1e2e"),
      bgBottom: stops[1] || (latte ? "#f4efe6" : "#11111b"),
      board: cssColor("--board-bg", latte ? "#eee9e0" : "#1e1e2e"),
      cell: cssColor("--cell-bg", latte ? "#ded7cb" : "#313147"),
      text: cssColor("--text-primary", latte ? "#4a453e" : "#cdd6f4"),
      muted: cssColor("--text-secondary", latte ? "#8c8273" : "#a6adc8"),
      accent: cssColor("--c-tile-2048", latte ? "#e6b800" : "#f5c2e7"),
      inkDark: cssColor("--tile-text-dark", latte ? "#4a453e" : "#181825"),
      inkLight: cssColor("--tile-text-light", "#ffffff"),
      super: cssColor("--c-tile-super", "#ffd54f")
    };
  }

  function tileInk(value, theme) {
    if (value >= 128 && value < 2048) return theme.inkLight;
    return theme.inkDark;
  }

  // 战报跟当前主题走：暗夜用莫兰迪，奶咖用燕麦色，方块色与棋盘 CSS 变量一致。
  function generateShareCard(score, maxTile, grid) {
    try {
      var theme = currentPosterTheme();
      var card = document.createElement("canvas");
      card.width = 640;
      card.height = 800;
      var ctx = card.getContext("2d");

      var grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 800);

      ctx.strokeStyle = hexToRgba(theme.accent, 0.45);
      ctx.lineWidth = 3;
      ctx.strokeRect(16, 16, 608, 768);

      ctx.fillStyle = theme.text;
      ctx.font = "900 36px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("经典 2048", 320, 72);

      ctx.fillStyle = theme.accent;
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("全国高分排行榜 · 终局战报", 320, 106);

      var boardX = 140;
      var boardY = 135;
      var boardSize = 360;
      var cellSize = (boardSize - 20) / 4;

      ctx.fillStyle = theme.board;
      ctx.fillRect(boardX, boardY, boardSize, boardSize);
      ctx.strokeStyle = hexToRgba(theme.accent, 0.28);
      ctx.lineWidth = 2;
      ctx.strokeRect(boardX, boardY, boardSize, boardSize);

      if (grid && grid.cells) {
        for (var x = 0; x < 4; x++) {
          for (var y = 0; y < 4; y++) {
            var cell = grid.cells[x][y];
            var cx = boardX + 4 + x * (cellSize + 4);
            var cy = boardY + 4 + y * (cellSize + 4);
            if (cell && cell.value) {
              var tileBg = cssColor("--c-tile-" + cell.value, theme.super);
              ctx.fillStyle = tileBg;
              ctx.fillRect(cx, cy, cellSize, cellSize);
              ctx.fillStyle = tileInk(cell.value, theme);
              ctx.font = "bold 20px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(cell.value, cx + cellSize / 2, cy + cellSize / 2);
            } else {
              ctx.fillStyle = theme.cell;
              ctx.fillRect(cx, cy, cellSize, cellSize);
            }
          }
        }
      }

      var cardY = 525;
      ctx.fillStyle = hexToRgba(theme.accent, 0.16);
      ctx.fillRect(60, cardY, 520, 115);
      ctx.strokeStyle = hexToRgba(theme.accent, 0.55);
      ctx.lineWidth = 2;
      ctx.strokeRect(60, cardY, 520, 115);

      ctx.fillStyle = theme.muted;
      ctx.font = "16px sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.fillText("本局最终得分", 320, cardY + 36);

      ctx.fillStyle = theme.text;
      ctx.font = "900 48px sans-serif";
      ctx.fillText(Number(score || 0).toLocaleString() + " 分", 320, cardY + 92);

      ctx.fillStyle = theme.text;
      ctx.font = "16px sans-serif";
      ctx.fillText("最大合成方块: [" + (maxTile || 2) + "]", 320, 680);

      ctx.fillStyle = theme.muted;
      ctx.font = "14px sans-serif";
      ctx.fillText("Alex 游戏百宝箱", 320, 742);

      return card.toDataURL("image/png");
    } catch (e) {
      console.warn("generateShareCard error:", e);
      return null;
    }
  }

  function initUI() {
    modal = document.getElementById("leaderboard-modal");
    if (!modal) return;
    modal.style.display = "none";

    scoreEl = document.getElementById("my-rank-score");
    posEl = document.getElementById("my-rank-pos");
    listEl = document.getElementById("rank-list-items");
    tabBtns = Array.from(document.querySelectorAll(".rank-tab"));

    var bind = getBind();

    // 绑定关闭
    bind("leaderboard-close", hideLeaderboard);

    // 绑定再来一局
    bind("btn-rank-restart", function() {
      hideLeaderboard();
      if (window.g2048UI && typeof window.g2048UI.handleRestart === "function") {
        window.g2048UI.handleRestart();
      } else if (window.g2048Game) {
        window.g2048Game.restart();
      }
    });

    // 绑定发笔记晒战绩 (对齐小红书官方 postNote 与 share 规范)
    bind("btn-rank-share", shareCurrentScore);
    bind("btn-win-share", shareCurrentScore);
    bind("btn-share", shareCurrentScore);

    // 绑定 Tab 切换
    tabBtns.forEach(function(btn) {
      bind(btn, function() {
        tabBtns.forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        currentPeriod = btn.getAttribute("data-period") || "day";
        refreshRankList();
      });
    });

    // 点击蒙层背景关闭
    modal.addEventListener("click", function(e) {
      if (Date.now() - leaderboardOpenedAt < 450) return;
      if (e.target === modal) hideLeaderboard();
    });
  }

  function shareCurrentScore() {
    var score = latestGameScore || (window.g2048Game ? window.g2048Game.score : 0) || 0;
    if (window.g2048Game && typeof window.g2048Game.getMaxTileValue === "function") {
      latestMaxTile = window.g2048Game.getMaxTileValue();
    }
    var maxTile = latestMaxTile || 2;
    var grid = window.g2048Game ? window.g2048Game.grid : null;
    var cardImg = generateShareCard(score, maxTile, grid);

    var titles = [
      "2048挑战极限" + score + "分",
      "合成方块突破" + maxTile + "高分",
      "全国2048排行榜冲榜" + score + "分"
    ];
    var title = titles[Math.floor(Math.random() * titles.length)];
    var text = "经典2048极简现代版，极限丝滑手感斩获 " + score + " 分！合出 [" + maxTile + "] 达成高光时刻，快来小工具全国排行榜比比谁更强吧！ #小红书小工具 #2048 #益智游戏 #高分挑战 #打卡";

    var tool = window.xhs && window.xhs.miniTool;
    if (tool && typeof tool.postNote === "function") {
      var payload = {
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
        if (window.showToast) window.showToast("笔记发布页已唤起！");
      }).catch(function(err) {
        console.warn("postNote fail:", err);
        if (typeof tool.share === "function" && cardImg) {
          tool.share({ type: "image", image_resource: cardImg });
        } else if (window.showToast) {
          window.showToast("请在小红书 App 中点击右上角发笔记分享战绩！");
        }
      });
    } else if (tool && typeof tool.share === "function") {
      if (cardImg) {
        tool.share({ type: "image", image_resource: cardImg });
      } else {
        tool.share({ type: "card" });
      }
    } else if (window.showToast) {
      window.showToast("请在小红书 App 中点击右上角发笔记分享战绩！");
    }
  }

  // 刷新排行榜列表
  function refreshRankList() {
    if (!listEl) return;
    listEl.innerHTML = '<div class="rank-loading">正在拉取最新榜单数据...</div>';

    Promise.all([
      window.xhsBridge.getMyRank({ board: BOARD_ID, period: currentPeriod }),
      window.xhsBridge.getRankList({ board: BOARD_ID, period: currentPeriod })
    ]).then(function(res) {
      var myRes = res[0];
      var listRes = res[1];

      if ((listRes && listRes.unauthorized) || (myRes && myRes.unauthorized)) {
        if (scoreEl) scoreEl.textContent = Number(latestGameScore || 0).toLocaleString() + " 分";
        if (posEl) posEl.textContent = "未获得头像昵称授权，全国榜暂不可用";
        listEl.innerHTML = '<div class="rank-empty">未获得头像昵称授权，全国榜暂不可用。授权后显示平台下发的昵称；榜单带有头像地址时才显示头像，否则显示昵称首字。</div>';
        return;
      }

      if (posEl && scoreEl) {
        var bestScore = (myRes && myRes.score) ? myRes.score : latestGameScore;
        scoreEl.textContent = Number(bestScore || 0).toLocaleString() + " 分";

        if (myRes && myRes.status === "EXACT" && myRes.rank) {
          posEl.textContent = "全国排名: 第 " + myRes.rank + " 名";
        } else if (myRes && myRes.status === "OVER_LIMIT") {
          posEl.textContent = "全国排名: 500+";
        } else if (bestScore > 0) {
          posEl.textContent = "成绩已记录，排名以官方榜为准";
        } else {
          posEl.textContent = "完成一局后自动上榜";
        }
      }

      var data = (listRes && listRes.data) || [];
      if (!data.length) {
        var emptyText = listRes && listRes.offline
          ? "当前为本地预览榜，真机以小红书官方榜为准。"
          : "暂无上榜记录，快来成为第一个打榜王者！";
        listEl.innerHTML = '<div class="rank-empty">' + emptyText + '</div>';
        return;
      }

      var myRank = myRes && myRes.status === "EXACT" ? Number(myRes.rank) : 0;
      var html = listRes && listRes.offline
        ? '<div class="rank-empty">当前为本地预览榜，真机以小红书官方榜为准。</div>'
        : "";
      data.slice(0, 50).forEach(function(item) {
        var isTop3 = item.rank <= 3;
        var rankClass = isTop3 ? "top-" + item.rank : "";
        var badge = item.rank === 1 ? "冠" : item.rank === 2 ? "亚" : item.rank === 3 ? "季" : item.rank;
        var uName = officialNickname(item);
        var avatarUrl = rowAvatarSrc(item);
        var isMe = myRank > 0 && Number(item.rank) === myRank;
        var rowClass = isMe ? "rank-item is-me" : "rank-item";

        html += '<div class="' + rowClass + '">' +
          '<div class="rank-num ' + rankClass + '">' + badge + '</div>' +
          '<div class="rank-user-box">' + avatarHtml(uName, avatarUrl) +
            '<div class="rank-user">' + escapeHtml(uName) + '</div>' +
          '</div>' +
          '<div class="rank-score">' + Number(item.score || 0).toLocaleString() + ' 分</div>' +
        '</div>';
      });
      listEl.innerHTML = html;
      bindAvatarFallback(listEl);
    }).catch(function(err) {
      console.warn("拉取排行榜异常:", err);
      listEl.innerHTML = '<div class="rank-empty">暂未能连通网络，已为您保留本地战报。</div>';
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function officialNickname(item) {
    var name = item && (item.nickname || item.nickName);
    if (name == null || String(name).trim() === "") return "未公开昵称";
    return String(name);
  }

  function rowAvatarSrc(item) {
    if (!item) return "";
    var bag = [item];
    if (item.user) bag.push(item.user);
    if (item.userInfo) bag.push(item.userInfo);
    for (var i = 0; i < bag.length; i++) {
      var row = bag[i];
      var candidates = [row.avatar, row.avatarUrl, row.avatar_url];
      for (var j = 0; j < candidates.length; j++) {
        var src = candidates[j];
        if (typeof src !== "string") continue;
        var trimmed = src.trim();
        if (!trimmed || trimmed.length > 2048 || /^javascript:/i.test(trimmed)) continue;
        if (/^(https?:|data:image\/|blob:)/i.test(trimmed)) return trimmed;
        if (trimmed.charAt(0) === "/" || trimmed.indexOf("./") === 0) return trimmed;
      }
    }
    return "";
  }

  function avatarHtml(name, src) {
    var letter = escapeHtml(String(name || "匿").slice(0, 1));
    var placeholder = '<div class="rank-avatar-placeholder">' + letter + '</div>';
    if (!src) return placeholder;
    return '<img class="rank-avatar" src="' + escapeHtml(src) + '" alt="" />' +
      '<div class="rank-avatar-placeholder" style="display:none;">' + letter + '</div>';
  }

  function bindAvatarFallback(root) {
    var imgs = root.querySelectorAll(".rank-avatar");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.style.display = "none";
        var next = this.nextElementSibling;
        if (next) next.style.display = "flex";
      });
    }
  }

  var leaderboardOpenedAt = 0;

  function showLeaderboard(score) {
    if (score !== undefined) {
      latestGameScore = Math.max(latestGameScore, score);
    }
    if (window.g2048Game) {
      latestMaxTile = window.g2048Game.getMaxTileValue();
    }
    if (!modal) initUI();
    if (!modal) return;

    leaderboardOpenedAt = Date.now();
    modal.style.display = "flex";
    modal.classList.add("open");
    refreshRankList();
  }

  function hideLeaderboard() {
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("open");
    }
  }

  window.onGame2048Over = function(result) {
    var finalScore = (result && result.score) || 0;
    var maxTile = (result && result.maxTile) || 2;
    latestGameScore = Math.max(latestGameScore, finalScore);
    latestMaxTile = Math.max(latestMaxTile, maxTile);

    if (finalScore > 0 && window.xhsBridge) {
      window.xhsBridge.submitScore({
        board: BOARD_ID,
        score: finalScore
      }).catch(function() {});
    }

    setTimeout(function() {
      showLeaderboard(finalScore);
    }, 500);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }

  window.openLeaderboard = showLeaderboard;
  window.hideLeaderboard = hideLeaderboard;
})();
