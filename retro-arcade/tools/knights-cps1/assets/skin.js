// tools/wof-cps1/assets/skin.js: 街机机台操控台专属皮肤引擎 (Arcade Control Deck V2)
!function() {
  "use strict";

  const themes = [
    {
      id: "arcade_noir",
      name: "机厅黑金",
      light: false,
      body: "#141518",
      deck: "#1a1b1f",
      bezel: "#08080a",
      accent: "#f5a623",
      chrome: "#4a4d57",
      btn: {
        Y: "#d32f2f", // 攻击：赤红
        B: "#1976d2", // 跳跃：街机蓝
        A: "#fbc02d", // 必杀：金黄
        X: "#8e24aa"  // 连发：电光紫
      },
      coinColor: "#e65100", // 投币灯橙红
      startColor: "#ffffff", // 开始键象牙白
      knob: "#e53935", // 摇杆经典正红
      text: "rgba(255,255,255,0.92)"
    },
    {
      id: "astro_classic",
      name: "卡普空白",
      light: true,
      body: "#e9ebf0",
      deck: "#f2f4f8",
      bezel: "#121418",
      accent: "#0284c7",
      chrome: "#94a3b8",
      btn: {
        Y: "#ec4899", // 攻击：樱花粉
        B: "#10b981", // 跳跃：薄荷绿
        A: "#eab308", // 必杀：柠檬黄
        X: "#38bdf8"  // 连发：天蓝
      },
      coinColor: "#059669", // 经典街机翠绿
      startColor: "#facc15", // 鲜黄开始键
      knob: "#10b981", // 荧光绿摇杆
      text: "rgba(30,41,59,0.92)"
    },
    {
      id: "red_cliff",
      name: "赤壁烈焰",
      light: false,
      body: "#200e0e",
      deck: "#2a1212",
      bezel: "#0a0505",
      accent: "#d48834",
      chrome: "#633c2e",
      btn: {
        Y: "#dc2626", // 攻击：战火赤红
        B: "#2563eb", // 跳跃：战袍苍蓝
        A: "#eab308", // 必杀：帅旗金黄
        X: "#9333ea"  // 连发：紫气东来
      },
      coinColor: "#b45309", // 战火古金
      startColor: "#b91c1c", // 朱红战鼓方键
      knob: "#f59e0b", // 琥珀金流光摇杆
      text: "rgba(255,255,255,0.92)"
    },
    {
      id: "cyber_neon",
      name: "赛博霓虹",
      light: false,
      body: "#120c1f",
      deck: "#181029",
      bezel: "#06040a",
      accent: "#06b6d4",
      chrome: "#473b66",
      btn: {
        Y: "#f43f5e", // 荧光粉
        B: "#06b6d4", // 电光青
        A: "#facc15", // 日光黄
        X: "#a855f7"  // 荧光紫
      },
      coinColor: "#8b5cf6", // 霓虹紫
      startColor: "#00f0ff", // 电光青
      knob: "#00f0ff", // 电光青夜光摇杆
      text: "rgba(255,255,255,0.92)"
    }
  ];

  function hexToRgb(hex) {
    const val = parseInt(hex.slice(1), 16);
    return [(val >> 16) & 255, (val >> 8) & 255, val & 255];
  }

  function adjustColor(hex, factor) {
    const rgb = hexToRgb(hex);
    const target = factor < 0 ? 0 : 255;
    const mag = Math.abs(factor);
    return "rgb(" + rgb.map(c => Math.round(c + (target - c) * mag)).join(",") + ")";
  }

  function createCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  }

  // 绘制金属六角螺栓
  function drawRivet(ctx, x, y, r) {
    ctx.save();
    ctx.beginPath();
    circle(ctx, x, y, r);
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, "#8a90a0");
    grad.addColorStop(0.5, "#3d404a");
    grad.addColorStop(1, "#1c1e22");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.65, y);
    ctx.lineTo(x + r * 0.65, y);
    ctx.stroke();
    ctx.restore();
  }

  // 绘制操控台上的街机实体功能微动按钮 (横屏 / 配色)
  function drawPillButton(ctx, box, label, type, active) {
    if (!box) return;
    const x = box.x;
    const y = box.y;
    const w = box.w;
    const h = box.h;
    ctx.save();

    // 1. 底座凹槽外框 (加固底座，带立体微投影)
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 6);
    const fGrad = ctx.createLinearGradient(0, y, 0, y + h);
    fGrad.addColorStop(0, "#2c2e36");
    fGrad.addColorStop(0.5, "#181a1f");
    fGrad.addColorStop(1, "#101114");
    ctx.fillStyle = fGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 2. 微动键帽面板
    ctx.save();
    const btnY = y + 2.5;
    const btnH = h - 5;
    const btnX = x + 2.5;
    const btnW = w - 5;
    ctx.beginPath();
    roundRect(ctx, btnX, btnY, btnW, btnH, 4);

    const bGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
    if (type === "orient") {
      // 横竖屏按钮：科技深钛蓝
      bGrad.addColorStop(0, "#2b3b52");
      bGrad.addColorStop(0.5, "#1c2534");
      bGrad.addColorStop(1, "#131b26");
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.strokeStyle = active ? "#38bdf8" : "rgba(56,189,248,0.5)";
    } else {
      // 换肤按键：流金炫彩机甲
      bGrad.addColorStop(0, "#3e3224");
      bGrad.addColorStop(0.5, "#251d14");
      bGrad.addColorStop(1, "#18130d");
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(245,166,35,0.5)";
    }
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. 顶部微弱高光边
    ctx.beginPath();
    ctx.moveTo(btnX + 4, btnY + 1);
    ctx.lineTo(btnX + btnW - 4, btnY + 1);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. 文字 (加粗 12px 铭文)
    ctx.font = '700 12px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(label, x + w / 2, btnY + btnH / 2 + 1.2);
    ctx.fillStyle = type === "orient" ? "#e0f2fe" : "#fef08a";
    ctx.fillText(label, x + w / 2, btnY + btnH / 2 + 0.5);
    ctx.restore();
  }

  function renderBackdrop(w, h, vp, theme, config) {
    const dpr = vp.dpr || 1;
    const canvas = createCanvas(w * dpr, h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const hit = vp.hitboxes;
    const isLand = !!vp.landscape;

    // 1. 底座背景材质
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, theme.body);
    bgGrad.addColorStop(0.3, theme.deck);
    bgGrad.addColorStop(0.7, theme.deck);
    bgGrad.addColorStop(1, adjustColor(theme.body, -0.2));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. 碳纤金属微纹理
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.2);
    }
    ctx.restore();

    // 3. 屏幕边框 (Bezel)
    const bezel = vp.bezel;
    if (bezel) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.beginPath();
      roundRect(ctx, bezel.x - 2, bezel.y - 2, bezel.w + 4, bezel.h + 4, 16);
      ctx.fillStyle = "#0c0d10";
      ctx.fill();
      ctx.restore();

      const bGrad = ctx.createLinearGradient(0, bezel.y, 0, bezel.y + bezel.h);
      bGrad.addColorStop(0, "#1d1f26");
      bGrad.addColorStop(0.08, theme.bezel);
      bGrad.addColorStop(0.92, theme.bezel);
      bGrad.addColorStop(1, "#18191f");
      ctx.beginPath();
      roundRect(ctx, bezel.x, bezel.y, bezel.w, bezel.h, 14);
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 屏幕顶部复古金属标牌 (仅竖屏)
      if (!isLand && hit.game && hit.game.y - bezel.y >= 26) {
        const plateW = Math.min(bezel.w - 80, 240);
        const plateH = 20;
        const plateX = bezel.x + (bezel.w - plateW) / 2;
        const plateY = bezel.y + 6;
        
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, plateX, plateY, plateW, plateH, 4);
        const pGrad = ctx.createLinearGradient(0, plateY, 0, plateY + plateH);
        pGrad.addColorStop(0, "#2c2e36");
        pGrad.addColorStop(0.5, "#18191d");
        pGrad.addColorStop(1, "#23252b");
        ctx.fillStyle = pGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(245,166,35,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        drawRivet(ctx, plateX + 8, plateY + plateH / 2, 2.2);
        drawRivet(ctx, plateX + plateW - 8, plateY + plateH / 2, 2.2);

        ctx.font = '700 10px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffd54f";
        ctx.fillText("KNIGHTS OF THE ROUND · CPS-1", plateX + plateW / 2, plateY + plateH / 2 + 0.5);
        ctx.restore();
      }
    }

    // 4. 游戏屏幕下凹 CRT 黑边
    if (hit.game) {
      const g = hit.game;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, g.x - 3, g.y - 3, g.w + 6, g.h + 6, 6);
      ctx.fillStyle = "#000000";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 5. 操控台金属分割铝条、螺栓与按键
    if (hit.controls) {
      const cy = hit.controls.y - 6;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(8, cy + 5, w - 16, 3);

      const sGrad = ctx.createLinearGradient(0, cy, 0, cy + 5);
      sGrad.addColorStop(0, "#5a5e6b");
      sGrad.addColorStop(0.35, "#8a90a0");
      sGrad.addColorStop(0.7, "#42454f");
      sGrad.addColorStop(1, "#27292e");
      ctx.fillStyle = sGrad;
      ctx.fillRect(6, cy, w - 12, 5);

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(6, cy, w - 12, 0.8);

      drawRivet(ctx, 18, cy + 2.5, 3.2);
      drawRivet(ctx, w - 18, cy + 2.5, 3.2);

      // 分割条下方居中的专属铭牌文字
      const slogan = config.slogan || "Alex 游戏百宝箱";
      ctx.font = '600 10px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("ARCADE MASTER · " + slogan, w / 2, cy + 18);
      ctx.restore();
    }

    // 6. 绘制 [横屏] 与 [配色] 按钮
    if (hit.orientBtn) {
      drawPillButton(ctx, hit.orientBtn, isLand ? "竖屏" : "横屏", "orient", isLand);
    }
    if (hit.skinBtn) {
      drawPillButton(ctx, hit.skinBtn, "换肤", "skin", false);
    }

    // 7. 摇杆底座：八角防尘挡圈
    if (hit.dpadCenter) {
      const c = hit.dpadCenter;
      const r = c.size * 1.55;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.beginPath();
      circle(ctx, c.x, c.y, r);
      const dGrad = ctx.createRadialGradient(c.x, c.y - 10, 5, c.x, c.y, r);
      dGrad.addColorStop(0, "#2c2e35");
      dGrad.addColorStop(0.7, "#16171b");
      dGrad.addColorStop(1, "#0d0e10");
      ctx.fillStyle = dGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      circle(ctx, c.x, c.y, r * 0.75);
      ctx.fillStyle = "#0c0d0f";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 四方向指示微箭头
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      const d = r * 0.88;
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(pt => {
        const ax = c.x + pt[0] * d;
        const ay = c.y + pt[1] * d;
        const ang = Math.atan2(pt[1], pt[0]);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(3, 0);
        ctx.lineTo(-3, -3);
        ctx.lineTo(-3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    }

    return canvas;
  }

  function createButtonSprite(w, h, padding, drawFn, dpr) {
    const c = createCanvas((w + 2 * padding) * dpr, (h + 2 * padding) * dpr);
    c.cssW = w + 2 * padding;
    c.cssH = h + 2 * padding;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.translate(padding, padding);
    drawFn(ctx);
    return c;
  }

  function renderSprites(vp, theme, config) {
    const dpr = vp.dpr || 1;
    const hit = vp.hitboxes;
    const sprites = {};
    const pad = 12;

    // 1. 三和微动大按钮 (Sanwa Pushbuttons)
    config.actions.forEach(act => {
      const hb = hit[act.id];
      if (!hb) return;
      const r = hb.r;
      const baseCol = theme.btn[act.key] || theme.btn.Y || "#d32f2f";

      const makeState = (isDown) => createButtonSprite(2 * r, 2 * r, pad, ctx => {
        const offset = isDown ? 2.5 : 0;
        
        // (1) 外圈安装卡环 (Bezel Rim)
        ctx.save();
        ctx.shadowColor = isDown ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.6)";
        ctx.shadowBlur = isDown ? 3 : 7;
        ctx.shadowOffsetY = isDown ? 1 : 4;
        ctx.beginPath();
        circle(ctx, r, r, r + 2.5);
        const rimGrad = ctx.createLinearGradient(r, 0, r, 2 * r);
        rimGrad.addColorStop(0, "#4a4d58");
        rimGrad.addColorStop(0.5, "#25272e");
        rimGrad.addColorStop(1, "#18191d");
        ctx.fillStyle = rimGrad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        circle(ctx, r, r, r + 1.2);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // (2) 按钮中心凹面键帽 (Plunger)
        const pR = r - 3;
        const cy = r + offset;
        ctx.save();
        ctx.beginPath();
        circle(ctx, r, cy, pR);
        const pGrad = ctx.createRadialGradient(r - pR * 0.25, cy - pR * 0.35, 1, r, cy, pR);
        if (isDown) {
          pGrad.addColorStop(0, adjustColor(baseCol, -0.3));
          pGrad.addColorStop(1, adjustColor(baseCol, -0.6));
        } else {
          pGrad.addColorStop(0, adjustColor(baseCol, 0.45));
          pGrad.addColorStop(0.55, baseCol);
          pGrad.addColorStop(1, adjustColor(baseCol, -0.35));
        }
        ctx.fillStyle = pGrad;
        ctx.fill();

        ctx.strokeStyle = adjustColor(baseCol, -0.5);
        ctx.lineWidth = 1;
        ctx.stroke();

        if (!isDown) {
          ctx.clip();
          const hl = ctx.createRadialGradient(r - pR * 0.3, cy - pR * 0.45, 0, r - pR * 0.3, cy - pR * 0.45, pR * 0.85);
          hl.addColorStop(0, "rgba(255,255,255,0.55)");
          hl.addColorStop(0.6, "rgba(255,255,255,0.1)");
          hl.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = hl;
          ctx.fillRect(r - pR, cy - pR, 2 * pR, 2 * pR);
        } else {
          ctx.beginPath();
          circle(ctx, r, cy, pR);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fill();
        }
        ctx.restore();

        // (3) 文字标签
        ctx.save();
        ctx.font = '700 ' + Math.round(Math.max(12, r * 0.54)) + 'px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillText(act.label, r, r + offset + 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(act.label, r, r + offset + 1);
        ctx.restore();
      }, dpr);

      sprites[act.id] = {
        x: hb.x - r - pad,
        y: hb.y - r - pad,
        up: makeState(false),
        down: makeState(true)
      };
    });

    // 2. 街机超大立体发光投币器与 1P 开始键 (放大版: w=92, h=36)
    config.capsules.forEach(cap => {
      const hb = hit[cap.id];
      if (!hb) return;
      const w = hb.w;
      const h = hb.h;
      const isCoin = cap.id === "coin";

      const makeState = (isDown) => createButtonSprite(w, h, pad, ctx => {
        const offset = isDown ? 2 : 0;
        
        if (isCoin) {
          // (A) 投币器 (Coin Entry / Reject Button)
          // 1. 底盘外框加固槽
          ctx.save();
          ctx.shadowColor = isDown ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)";
          ctx.shadowBlur = isDown ? 3 : 8;
          ctx.shadowOffsetY = isDown ? 1 : 4;
          ctx.beginPath();
          roundRect(ctx, 0, 0, w, h, 6);
          const fGrad = ctx.createLinearGradient(0, 0, 0, h);
          fGrad.addColorStop(0, "#2c2e36");
          fGrad.addColorStop(0.5, "#181a1f");
          fGrad.addColorStop(1, "#101114");
          ctx.fillStyle = fGrad;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          // 2. 发光按键面板
          const btnY = 3 + offset;
          const btnH = h - 6;
          ctx.save();
          const baseColor = theme.coinColor || "#e65100";
          const cGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
          if (isDown) {
            cGrad.addColorStop(0, adjustColor(baseColor, -0.4));
            cGrad.addColorStop(1, adjustColor(baseColor, -0.1));
          } else {
            cGrad.addColorStop(0, adjustColor(baseColor, 0.4));
            cGrad.addColorStop(0.5, baseColor);
            cGrad.addColorStop(1, adjustColor(baseColor, -0.3));
          }
          ctx.beginPath();
          roundRect(ctx, 3, btnY, w - 6, btnH, 4);
          ctx.fillStyle = cGrad;
          ctx.fill();
          ctx.strokeStyle = isDown ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // 3. 投币孔槽 (Coin Slot)
          const slotW = w - 24;
          const slotH = 2.5;
          const slotX = (w - slotW) / 2;
          const slotY = btnY + 7;
          ctx.fillStyle = "#110502";
          ctx.fillRect(slotX, slotY, slotW, slotH);
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect(slotX, slotY + slotH, slotW, 0.8);

          // 4. 文字
          ctx.font = '700 13px -apple-system, "PingFang SC", sans-serif';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillText("投币 25¢", w / 2, btnY + btnH * 0.65 + 1);
          ctx.fillStyle = "#ffffff";
          ctx.fillText("投币 25¢", w / 2, btnY + btnH * 0.65);
          ctx.restore();

        } else {
          // (B) 1P 开始键 (1P START)
          // 1. 底盘外框加固槽
          ctx.save();
          ctx.shadowColor = isDown ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)";
          ctx.shadowBlur = isDown ? 3 : 8;
          ctx.shadowOffsetY = isDown ? 1 : 4;
          ctx.beginPath();
          roundRect(ctx, 0, 0, w, h, 6);
          const fGrad = ctx.createLinearGradient(0, 0, 0, h);
          fGrad.addColorStop(0, "#2c2e36");
          fGrad.addColorStop(0.5, "#181a1f");
          fGrad.addColorStop(1, "#101114");
          ctx.fillStyle = fGrad;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.18)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          // 2. 街机方形键帽
          const btnY = 3 + offset;
          const btnH = h - 6;
          ctx.save();
          const startCol = theme.startColor || "#ffffff";
          const sGrad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
          if (isDown) {
            sGrad.addColorStop(0, adjustColor(startCol, -0.3));
            sGrad.addColorStop(1, adjustColor(startCol, -0.1));
          } else {
            sGrad.addColorStop(0, adjustColor(startCol, 0.2));
            sGrad.addColorStop(0.7, startCol);
            sGrad.addColorStop(1, adjustColor(startCol, -0.2));
          }
          ctx.beginPath();
          roundRect(ctx, 3, btnY, w - 6, btnH, 4);
          ctx.fillStyle = sGrad;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // 3. 1P 人形街机小图标与文字
          ctx.font = '700 13px -apple-system, "PingFang SC", sans-serif';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#141518";
          ctx.fillText("1P 开始", w / 2, btnY + btnH / 2 + 0.5);
          ctx.restore();
        }
      }, dpr);

      sprites[cap.id] = {
        x: hb.x - pad,
        y: hb.y - pad,
        up: makeState(false),
        down: makeState(true)
      };
    });

    // 3. 街机大圆球摇杆
    if (hit.dpadCenter) {
      const c = hit.dpadCenter;
      const ballR = c.size * 0.94;

      const knobImg = createButtonSprite(2 * ballR, 2 * ballR, pad, ctx => {
        // 镀铬镜面钢杆
        ctx.save();
        const sGrad = ctx.createLinearGradient(ballR - 6, 0, ballR + 6, 0);
        sGrad.addColorStop(0, "#888c99");
        sGrad.addColorStop(0.3, "#ffffff");
        sGrad.addColorStop(0.7, "#a0a5b5");
        sGrad.addColorStop(1, "#50535e");
        ctx.fillStyle = sGrad;
        ctx.fillRect(ballR - 5, ballR, 10, ballR);
        ctx.restore();

        // 3D 街机大圆球
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.65)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
        ctx.beginPath();
        circle(ctx, ballR, ballR, ballR);
        const knobCol = theme.knob || "#e53935";
        const bGrad = ctx.createRadialGradient(ballR - ballR * 0.35, ballR - ballR * 0.38, ballR * 0.05, ballR, ballR, ballR);
        bGrad.addColorStop(0, adjustColor(knobCol, 0.45));
        bGrad.addColorStop(0.4, knobCol);
        bGrad.addColorStop(0.85, adjustColor(knobCol, -0.45));
        bGrad.addColorStop(1, adjustColor(knobCol, -0.75));
        ctx.fillStyle = bGrad;
        ctx.fill();
        ctx.restore();

        // 球面高光镜面反光
        ctx.save();
        ctx.beginPath();
        ctx.arc(ballR - ballR * 0.35, ballR - ballR * 0.38, ballR * 0.35, 0, 2 * Math.PI);
        const hlGrad = ctx.createRadialGradient(ballR - ballR * 0.35, ballR - ballR * 0.38, 0, ballR - ballR * 0.35, ballR - ballR * 0.38, ballR * 0.35);
        hlGrad.addColorStop(0, "rgba(255,255,255,0.85)");
        hlGrad.addColorStop(0.4, "rgba(255,255,255,0.3)");
        hlGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hlGrad;
        ctx.fill();
        ctx.restore();
      }, dpr);

      sprites.__knob = {
        img: knobImg,
        cx: c.x,
        cy: c.y,
        travel: c.size * 0.72
      };
    }

    return sprites;
  }

  function findTheme(id) {
    for (let i = 0; i < themes.length; i++) {
      if (themes[i].id === id) return themes[i];
    }
    return themes[0];
  }

  window.GGEMU_SKIN = {
    themes: themes,
    layout: {
      bezelInset: 12,
      screenInset: 24,
      bezelAbove: 72,
      band: 36,
      topPad: 16
    },
    storageKey: "arcade_skin_theme",
    find: findTheme,
    build: function(vp, themeId, config) {
      const theme = findTheme(themeId);
      return {
        theme: theme,
        bg: renderBackdrop(vp.w, vp.h, vp, theme, config),
        sprites: renderSprites(vp, theme, config)
      };
    },
    draw: function(ctx, skin, vp, state, frameCanvas) {
      const hit = vp.hitboxes;
      // 1. 绘制机台背景
      ctx.drawImage(skin.bg, 0, 0, vp.w, vp.h);

      // 2. 绘制游戏画面
      if (frameCanvas && hit.game) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(frameCanvas, hit.game.x, hit.game.y, hit.game.w, hit.game.h);
        ctx.imageSmoothingEnabled = true;
      }

      // 3. 绘制按键 Sprites
      const sprites = skin.sprites;
      Object.keys(sprites).forEach(key => {
        if (key === "__knob") return;
        const s = sprites[key];
        const isDown = state[key];
        const img = isDown ? s.down : s.up;
        ctx.drawImage(img, s.x, s.y, img.cssW, img.cssH);
      });

      // 4. 绘制大圆球摇杆
      const knob = sprites.__knob;
      if (knob) {
        const stick = vp.stick || { x: 0, y: 0 };
        const kx = knob.cx + stick.x * knob.travel - knob.img.cssW / 2;
        const ky = knob.cy + stick.y * knob.travel - knob.img.cssH / 2;
        ctx.drawImage(knob.img, kx, ky, knob.img.cssW, knob.img.cssH);
      }
    }
  };
}();
