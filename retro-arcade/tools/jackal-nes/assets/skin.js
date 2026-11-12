/* 两款掌机只维护 shared/deck 这一份，再复制到各工具 assets。
   two-button：十字键 + 右下 AB。diamond+stick：摇杆 + 四键。
   不要用旧的压缩版覆盖这一份。 */
!function() {
  "use strict";

  // 经典主题调色板
  const THEMES = [
    {
      id: "snes",
      name: "超任灰紫",
      light: true,
      body: "#cfcfd6",
      bezel: "#28282c",
      plate: "#b4b1c6",
      groove: "#a19db6",
      btn: { X: "#bdb3f2", Y: "#bdb3f2", A: "#5b2aa8", B: "#5b2aa8" },
      cap: "#8e8e97",
      base: "#bfbfc7",
      knob: "#d0222b",
      text: "rgba(58,58,70,0.78)",
      dpad: { top: "#525160", bottom: "#343340", line: "rgba(255,255,255,0.45)", stroke: "rgba(30,30,40,0.65)" }
    },
    {
      id: "famicom",
      name: "红白机",
      light: true,
      body: "#ebe5d8",
      bezel: "#2e2526",
      plate: "#d6ccb6",
      groove: "#c9bea6",
      btn: { X: "#b8232c", Y: "#b8232c", A: "#b8232c", B: "#b8232c" },
      cap: "#8b2026",
      base: "#d9d1bf",
      knob: "#d0222b",
      text: "rgba(130,32,38,0.85)",
      dpad: { top: "#78242b", bottom: "#4a1418", line: "rgba(255,230,230,0.55)", stroke: "rgba(40,10,12,0.7)" }
    },
    {
      id: "black",
      name: "曜石黑",
      light: false,
      body: "#3a3d44",
      bezel: "#101114",
      plate: "#4a4e56",
      groove: "#34383f",
      btn: { X: "#34363c", Y: "#34363c", A: "#2e3036", B: "#2e3036" },
      cap: "#3a3c42",
      base: "#454850",
      knob: "#d0222b",
      text: "rgba(232,234,238,0.78)",
      dpad: { top: "#32343a", bottom: "#18191c", line: "rgba(255,255,255,0.38)", stroke: "rgba(0,0,0,0.75)" }
    },
    {
      id: "sfc",
      name: "超任彩色",
      light: true,
      body: "#d3d3d8",
      bezel: "#28282c",
      plate: "#bcbcc4",
      groove: "#aaaab3",
      btn: { X: "#2d64cc", Y: "#2b9b48", A: "#d6302b", B: "#f1bf2d" },
      cap: "#8e8e97",
      base: "#c2c2c9",
      knob: "#d0222b",
      text: "rgba(58,58,70,0.78)",
      dpad: { top: "#4e5159", bottom: "#303238", line: "rgba(255,255,255,0.45)", stroke: "rgba(20,22,26,0.65)" }
    },
    {
      id: "mint",
      name: "薄荷绿",
      light: true,
      body: "#bfe2d5",
      bezel: "#22302b",
      plate: "#a2cfbf",
      groove: "#93c2b1",
      btn: { X: "#f4f8f6", Y: "#f4f8f6", A: "#2e8e73", B: "#2e8e73" },
      cap: "#77a796",
      base: "#b0d8c9",
      knob: "#d0222b",
      text: "rgba(28,72,60,0.78)",
      dpad: { top: "#356152", bottom: "#1c382e", line: "rgba(230,255,245,0.5)", stroke: "rgba(15,35,28,0.7)" }
    }
  ];

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  }

  function adjustColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const target = amount < 0 ? 0 : 255;
    const factor = Math.abs(amount);
    return "rgb(" + rgb.map(c => Math.round(c + (target - c) * factor)).join(",") + ")";
  }

  function getLuminance(hex) {
    const rgb = hexToRgb(hex);
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  }

  function createCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function pathRoundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
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

  function pathCircle(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.closePath();
  }

  function pathEllipse(ctx, x, y, rx, ry, rotation) {
    if (ctx.ellipse) {
      ctx.ellipse(x, y, rx, ry, rotation || 0, 0, 2 * Math.PI);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation || 0);
      ctx.scale(rx, ry);
      ctx.arc(0, 0, 1, 0, 2 * Math.PI);
      ctx.restore();
    }
  }

  function pathPill(ctx, x1, y1, x2, y2, r) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.moveTo(x1 + Math.cos(angle + Math.PI / 2) * r, y1 + Math.sin(angle + Math.PI / 2) * r);
    ctx.arc(x1, y1, r, angle + Math.PI / 2, angle + 1.5 * Math.PI);
    ctx.arc(x2, y2, r, angle - Math.PI / 2, angle + Math.PI / 2);
    ctx.closePath();
  }

  const FONT_SANS = '-apple-system, "Helvetica Neue", "PingFang SC", sans-serif';

  // 凹陷底盘绘制 (带柔和下沉阴影与高光)
  function drawRecessedPlate(ctx, pathFn, fillColor, theme, intensity) {
    intensity = intensity || 1;
    ctx.save();
    ctx.beginPath();
    pathFn(ctx);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.clip();

    ctx.beginPath();
    ctx.rect(-5000, -5000, 10000, 10000);
    pathFn(ctx);
    ctx.shadowColor = "rgba(0,0,0," + (0.42 * intensity) + ")";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill("evenodd");
    ctx.restore();

    ctx.save();
    ctx.translate(0, 1);
    ctx.beginPath();
    pathFn(ctx);
    ctx.strokeStyle = theme.light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // 绘制屏幕边框上的旋转与换肤小胶囊
  function drawMiniBtn(ctx, box, text, iconFn) {
    if (!box) return;
    ctx.save();
    ctx.beginPath();
    pathRoundRect(ctx, box.x, box.y, box.w, box.h, box.h / 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (iconFn) iconFn(ctx, box.x + 14, box.y + box.h / 2);
    ctx.font = "11px " + FONT_SANS;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(text, box.x + 25, box.y + box.h / 2 + 0.5);
    ctx.restore();
  }

  function drawRotateIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0.35 * -Math.PI, 1.25 * Math.PI);
    ctx.stroke();
    const a = 0.35 * -Math.PI;
    const lx = x + 5.5 * Math.cos(a);
    const ly = y + 5.5 * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(lx + 3.2, ly - 0.6);
    ctx.lineTo(lx - 0.8, ly - 3.4);
    ctx.lineTo(lx - 0.4, ly + 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSkinIcon(ctx, x, y) {
    const colors = ["#e57373", "#64b5f6", "#81c784", "#ffd54f"];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + (i % 2) * 7 - 3.5, y + 7 * (i >> 1) - 3.5, 3, 0, 2 * Math.PI);
      ctx.fillStyle = colors[i];
      ctx.fill();
    }
  }

  function drawFsIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    const s = 4.2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + 2.5); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + 2.5, y - s);
    ctx.moveTo(x + s - 2.5, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + 2.5);
    ctx.moveTo(x - s, y + s - 2.5); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s + 2.5, y + s);
    ctx.moveTo(x + s - 2.5, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s, y + s - 2.5);
    ctx.stroke();
    ctx.restore();
  }

  // 扬声器打孔
  function drawSpeakerGrille(ctx, x, y, cols, rows) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        pathCircle(ctx, x + 7 * c + (r % 2) * 3.5, y + 6 * r, 1.6);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 胶囊背景尺寸
  function getCapsuleBgSize(box) {
    return { w: box.w + 8, h: 22 };
  }

  // 绘制实体机械十字键背景底座
  function drawCrossDpadBackground(ctx, box, theme) {
    const cx = box.x;
    const cy = box.y;
    const plateR = box.plateR || (1.5 * box.size + 10);

    // 凹陷大底盘 (与右侧大圆盘 1:1 绝对等大，统一使用 theme.plate 呼应主题)
    drawRecessedPlate(ctx, p => pathCircle(p, cx, cy, plateR), theme.plate || adjustColor(theme.body, -0.06), theme, 0.9);

    drawMechanicalCross(ctx, box, theme);
  }

  function pathPlus(ctx, cx, cy, span, thick, rad) {
    if (span <= 0 || thick <= 0) return;
    const hs = span / 2;
    const ht = thick / 2;
    const r = Math.max(0, Math.min(rad || 0, ht * 0.85));
    const L = cx - hs, R = cx + hs, T = cy - hs, B = cy + hs;
    const l = cx - ht, ri = cx + ht, t = cy - ht, b = cy + ht;
    ctx.beginPath();
    ctx.moveTo(l + r, T);
    ctx.lineTo(ri - r, T);
    if (r > 0) ctx.arcTo(ri, T, ri, T + r, r);
    ctx.lineTo(ri, t);
    ctx.lineTo(R - r, t);
    if (r > 0) ctx.arcTo(R, t, R, t + r, r);
    ctx.lineTo(R, b - r);
    if (r > 0) ctx.arcTo(R, b, R - r, b, r);
    ctx.lineTo(ri, b);
    ctx.lineTo(ri, B - r);
    if (r > 0) ctx.arcTo(ri, B, ri - r, B, r);
    ctx.lineTo(l + r, B);
    if (r > 0) ctx.arcTo(l, B, l, B - r, r);
    ctx.lineTo(l, b);
    ctx.lineTo(L + r, b);
    if (r > 0) ctx.arcTo(L, b, L, b - r, r);
    ctx.lineTo(L, t + r);
    if (r > 0) ctx.arcTo(L, t, L + r, t, r);
    ctx.lineTo(l, t);
    ctx.lineTo(l, T + r);
    if (r > 0) ctx.arcTo(l, T, l + r, T, r);
    ctx.closePath();
  }

  function drawMechanicalCross(ctx, box, theme) {
    const cx = box.x;
    const cy = box.y;
    const span = Math.round(box.size * 2.9);
    const thick = Math.round(box.size * 1.05);

    // 根据主题动态提取十字键配色，若未显式指定则根据主题明暗色调自适应
    const dpadTop = (theme.dpad && theme.dpad.top) || (theme.light ? adjustColor(theme.body, -0.62) : "#38393e");
    const dpadBottom = (theme.dpad && theme.dpad.bottom) || (theme.light ? adjustColor(theme.body, -0.78) : "#1e1f23");
    const dpadLine = (theme.dpad && theme.dpad.line) || (theme.light ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.38)");
    const dpadStroke = (theme.dpad && theme.dpad.stroke) || "rgba(0,0,0,0.55)";

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    pathPlus(ctx, cx, cy, span, thick, 12);
    const grad = ctx.createLinearGradient(0, cy - span / 2, 0, cy + span / 2);
    grad.addColorStop(0, dpadTop);
    grad.addColorStop(1, dpadBottom);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    pathPlus(ctx, cx, cy, span, thick, 12);
    ctx.strokeStyle = dpadStroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const groove = Math.round(thick * 0.55);
    const inset = 14;
    ctx.strokeStyle = dpadLine;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - span / 2 + inset, cy);
    ctx.lineTo(cx - groove, cy);
    ctx.moveTo(cx + groove, cy);
    ctx.lineTo(cx + span / 2 - inset, cy);
    ctx.moveTo(cx, cy - span / 2 + inset);
    ctx.lineTo(cx, cy - groove);
    ctx.moveTo(cx, cy + groove);
    ctx.lineTo(cx, cy + span / 2 - inset);
    ctx.stroke();
    ctx.restore();
  }

  // 操控区电路纹。画在底板之上、圆盘之下，圆盘是不透明的，纹路不会穿进按键。
  function drawControlDeckTexture(ctx, width, height, top, theme) {
    if (top > height - 36) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, width, height - top);
    ctx.clip();
    const light = !!theme.light;
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    const span = height - top;
    ctx.strokeStyle = light ? "rgba(92,72,40,0.20)" : "rgba(214,186,112,0.26)";
    for (let r = 0; r < 6; r++) {
      const y = top + 20 + r * (span / 6.4);
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(width * 0.36, y);
      ctx.lineTo(width * 0.36, y + 11);
      ctx.lineTo(width - 22, y + 11);
      ctx.stroke();
    }
    ctx.strokeStyle = light ? "rgba(36,78,58,0.14)" : "rgba(156,176,146,0.18)";
    for (let c = 0; c < 5; c++) {
      const x = 34 + c * ((width - 68) / 5);
      ctx.beginPath();
      ctx.moveTo(x, top + 8);
      ctx.lineTo(x, top + span * 0.42);
      ctx.lineTo(x + 12, top + span * 0.42);
      ctx.lineTo(x + 12, height - 22);
      ctx.stroke();
    }
    ctx.fillStyle = light ? "rgba(70,52,24,0.22)" : "rgba(226,198,122,0.22)";
    for (let i = 0; i < 16; i++) {
      const x = 26 + ((i * 73) % (width - 52));
      const y = top + 14 + ((i * 47) % Math.max(24, span - 36));
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // 构建机身背景底图
  function renderBackground(width, height, env, theme, info) {
    width = Math.max(100, width || 0);
    height = Math.max(100, height || 0);
    const dpr = env.dpr || 1;
    const canvas = createCanvas(width * dpr, height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const hit = env.hitboxes;

    // 1. 机身外壳渐变底板
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, height);
    bodyGrad.addColorStop(0, adjustColor(theme.body, theme.light ? 0.18 : 0.06));
    bodyGrad.addColorStop(1, adjustColor(theme.body, -0.08));
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, 0, width, height);

    // 机身边框高光与阴影轮廓
    ctx.beginPath();
    pathRoundRect(ctx, 3, 3, width - 6, height - 6, 42);
    ctx.strokeStyle = theme.light ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    pathRoundRect(ctx, 7, 7, width - 14, height - 14, 38);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. 屏幕黑框 Bezel
    const bezel = env.bezel;
    if (bezel) {
      ctx.save();
      ctx.beginPath();
      pathRoundRect(ctx, bezel.x - 3, bezel.y - 3, bezel.w + 6, bezel.h + 6, 30);
      ctx.fillStyle = adjustColor(theme.body, -0.18);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      pathRoundRect(ctx, bezel.x, bezel.y, bezel.w, bezel.h, 27);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      const bGrad = ctx.createLinearGradient(0, bezel.y, 0, bezel.y + bezel.h);
      bGrad.addColorStop(0, adjustColor(theme.bezel, 0.1));
      bGrad.addColorStop(1, theme.bezel);
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.restore();

      // 经典通电发光红光指示灯 (POWER LED 带微弱漫反射晕光)
      if (!env.landscape) {
        const ledX = bezel.x + 24, ledY = bezel.y + 18;
        const ledGlow = ctx.createRadialGradient(ledX, ledY, 1, ledX, ledY, 8);
        ledGlow.addColorStop(0, "rgba(255, 60, 40, 0.55)");
        ledGlow.addColorStop(1, "rgba(255, 60, 40, 0)");
        ctx.fillStyle = ledGlow;
        ctx.beginPath();
        pathCircle(ctx, ledX, ledY, 8);
        ctx.fill();

        const ledCore = ctx.createRadialGradient(ledX - 1, ledY - 1, 0.5, ledX, ledY, 3);
        ledCore.addColorStop(0, "#ff8a80");
        ledCore.addColorStop(0.5, "#e53935");
        ledCore.addColorStop(1, "#8b0000");
        ctx.fillStyle = ledCore;
        ctx.beginPath();
        pathCircle(ctx, ledX, ledY, 3);
        ctx.fill();

        ctx.save();
        ctx.font = "600 8px " + FONT_SANS;
        ctx.fillStyle = "rgba(255,255,255,0.42)";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("POWER", ledX + 7, ledY);
        ctx.restore();
      }
    }

    // 游戏屏幕浅灰底框
    if (hit.game) {
      const g = hit.game;
      ctx.save();
      ctx.beginPath();
      pathRoundRect(ctx, g.x - 5, g.y - 5, g.w + 10, g.h + 10, 10);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.restore();
    }

    // 扬声器孔
    if (!env.landscape && hit.game && bezel && (hit.game.y - bezel.y > 40)) {
      const sy = bezel.y + 18;
      drawSpeakerGrille(ctx, bezel.x + 26, sy, 5, 4);
      drawSpeakerGrille(ctx, bezel.x + bezel.w - 26 - 31, sy, 5, 4);
    }

    if (bezel) drawControlDeckTexture(ctx, width, height, bezel.y + bezel.h + 4, theme);

    // 屏幕下方的【横屏】和【配色】按钮
    drawMiniBtn(ctx, hit.orientBtn, env.landscape ? "竖屏" : "横屏", drawRotateIcon);
    if (hit.fsBtn) drawMiniBtn(ctx, hit.fsBtn, "全屏", drawFsIcon);
    drawMiniBtn(ctx, hit.skinBtn, "配色", drawSkinIcon);

    // 确定左右两侧统一的基准大圆底盘半径 (确保 1:1 绝对镜像对称)
    let masterPlateR = 78;
    if (hit.dpadCenter && hit.dpadCenter.size) {
      masterPlateR = Math.round(1.5 * hit.dpadCenter.size + 10);
    } else if (hit.twoButton && hit.twoButton.plateR) {
      masterPlateR = hit.twoButton.plateR;
    } else if (hit.diamond && hit.diamond.plateR) {
      masterPlateR = hit.diamond.plateR;
    }

    // 3. 左侧方向控制区
    const hasStick = !!(info.pad && info.pad.stick);
    if (hit.dpadCenter) {
      const center = hit.dpadCenter;
      const t = 1.5 * center.size; // 金属圆盘半径
      const outerR = masterPlateR;  // 凹陷外大圆半径严格取 masterPlateR

      if (hasStick) {
        // 摇杆模式：绘制外圆凹槽大底盘
        drawRecessedPlate(ctx, p => pathCircle(p, center.x, center.y, outerR), adjustColor(theme.body, -0.06), theme, 0.9);

        // 金属圆盘
        const rGrad = ctx.createRadialGradient(center.x, center.y - 0.2 * t, 0.1 * t, center.x, center.y, t);
        rGrad.addColorStop(0, adjustColor(theme.base, -0.18));
        rGrad.addColorStop(0.75, theme.base);
        rGrad.addColorStop(1, adjustColor(theme.base, theme.light ? 0.25 : 0.08));

        ctx.beginPath();
        pathCircle(ctx, center.x, center.y, t);
        ctx.fillStyle = rGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // 内圈深色小凹槽
        ctx.beginPath();
        pathCircle(ctx, center.x, center.y, 0.55 * t);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fill();

        // 四个黑色方向小三角箭头 (▲ ▼ ◀ ▶)
        ctx.fillStyle = theme.text;
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(dir => {
          const ax = center.x + dir[0] * (t - 9);
          const ay = center.y + dir[1] * (t - 9);
          const ang = Math.atan2(dir[1], dir[0]);
          ctx.beginPath();
          ctx.moveTo(ax + 4 * Math.cos(ang), ay + 4 * Math.sin(ang));
          ctx.lineTo(ax + 4 * Math.cos(ang + 2.4), ay + 4 * Math.sin(ang + 2.4));
          ctx.lineTo(ax + 4 * Math.cos(ang - 2.4), ay + 4 * Math.sin(ang - 2.4));
          ctx.closePath();
          ctx.fill();
        });
      } else {
        // 实体机械十字键模式 (对齐图 1 冒险岛/FC 掌机，底座 1:1 绝对镜像等大)
        drawCrossDpadBackground(ctx, { x: center.x, y: center.y, size: center.size, plateR: outerR }, theme);
      }
    }

    // 4. 右侧动作键区
    // 4.1 四键菱形模式 (Diamond, 对齐图 0 双截龙/恐龙快打)
    const dia = hit.diamond;
    if (dia) {
      // 底座大圆盘半径严格与左侧 1:1 绝对等大
      const plateRadius = masterPlateR;
      drawRecessedPlate(ctx, p => pathCircle(p, dia.x, dia.y, plateRadius), theme.plate, theme, 0.7);

      // 在按键外侧标注 X, Y, A, B 字母
      ctx.save();
      ctx.font = "600 11px " + FONT_SANS;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.text;
      info.actions.forEach(act => {
        const b = hit[act.id];
        if (!b || !act.key) return;
        const ang = Math.atan2(b.y - dia.y, b.x - dia.x) - Math.PI / 4;
        const labelR = dia.r + 7;
        ctx.fillText(act.key, b.x + Math.cos(ang) * labelR, b.y + Math.sin(ang) * labelR);
      });
      ctx.restore();
    }

    // 4.2 双键模式 (Two-Button, A/B 圆形按键，大椭圆/胶囊包裹，外面的大圆去掉)
    const two = hit.twoButton;
    if (two) {
      const xB = two.xB !== undefined ? two.xB : (two.x - 38);
      const yB = two.yB !== undefined ? two.yB : (two.y + 24);
      const xA = two.xA !== undefined ? two.xA : (two.x + 38);
      const yA = two.yA !== undefined ? two.yA : (two.y - 24);
      const pillR = two.pillR || 38;

      // 1. 大椭圆/胶囊底座包裹 A、B 按键 (外面的大圆去掉，完全由大胶囊包裹)
      drawRecessedPlate(ctx, p => pathPill(p, xB, yB, xA, yA, pillR), theme.plate, theme, 0.85);

      // 2. 内圈深色微凹槽，层次分明
      drawRecessedPlate(ctx, p => pathPill(p, xB, yB, xA, yA, pillR - 3), adjustColor(theme.plate, -0.06), theme, 0.65);

      // 3. 胶囊外边缘高光边线
      ctx.save();
      ctx.beginPath();
      pathPill(ctx, xB, yB, xA, yA, pillR);
      ctx.strokeStyle = theme.light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // 5. 中间胶囊按键底座
    info.capsules.map(c => hit[c.id]).filter(capBox => capBox && !capBox.roundCap).forEach(capBox => {
      const bg = getCapsuleBgSize(capBox);
      const cx = capBox.x + capBox.w / 2;
      const cy = capBox.y + capBox.h / 2;
      drawRecessedPlate(ctx, p => pathRoundRect(p, cx - bg.w / 2 - 4, cy - bg.h / 2 - 4, bg.w + 8, bg.h + 8, bg.h / 2 + 4), adjustColor(theme.body, -0.1), theme, 0.7);
    });

    // 6. 顶部 L / R 肩键凹槽底座 (若配置了 shoulders)
    if (info.shoulders && info.shoulders.length) {
      info.shoulders.forEach(sh => {
        const b = hit[sh.id];
        if (!b) return;
        const padGroove = 3;
        const rad = (b.h + 2 * padGroove) / 2;
        drawRecessedPlate(
          ctx,
          p => pathRoundRect(p, b.x - padGroove, b.y - padGroove, b.w + 2 * padGroove, b.h + 2 * padGroove, rad),
          adjustColor(theme.body, -0.12),
          theme,
          0.75
        );
      });
    }

    // 口号标语
    if (hit.sloganAt && info.slogan) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.light ? "rgba(40,40,48,0.88)" : "rgba(255,255,255,0.92)";
      var sloganSize = 12;
      ctx.font = "600 " + sloganSize + "px " + FONT_SANS;
      while (sloganSize > 8 && ctx.measureText(info.slogan).width > hit.sloganAt.maxW) {
        sloganSize -= 1;
        ctx.font = "600 " + sloganSize + "px " + FONT_SANS;
      }
      ctx.fillText(info.slogan, hit.sloganAt.x, hit.sloganAt.y);
      ctx.restore();
    } else if (hit.capsuleRowY !== undefined && info.slogan) {
      ctx.save();
      ctx.font = "11px " + FONT_SANS;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.text;
      const roundTop = info.capsules.map(c => hit[c.id]).filter(c => c && c.roundCap);
      const sloganY = roundTop.length ? Math.min.apply(null, roundTop.map(c => c.y)) - 22 : hit.capsuleRowY - 22;
      ctx.fillText(info.slogan, width / 2, sloganY);
      ctx.restore();
    }

    return canvas;
  }

  // 离屏雪碧图生成器
  let globalDpr = 1;
  function makeSprite(w, h, padding, drawFn) {
    const c = createCanvas((w + 2 * padding) * globalDpr, (h + 2 * padding) * globalDpr);
    c.cssW = w + 2 * padding;
    c.cssH = h + 2 * padding;
    const ctx = c.getContext("2d");
    ctx.scale(globalDpr, globalDpr);
    ctx.translate(padding, padding);
    drawFn(ctx);
    return c;
  }

  // 绘制 3D 圆形动作按键
  function renderActionSprite(ctx, cx, cy, r, colorHex, isDown) {
    const isLight = getLuminance(colorHex) > 0.62;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0," + (isDown ? 0.35 : 0.5) + ")";
    ctx.shadowBlur = isDown ? 2 : 6;
    ctx.shadowOffsetY = isDown ? 1 : 3;

    const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    if (isDown) {
      grad.addColorStop(0, adjustColor(colorHex, -0.25));
      grad.addColorStop(1, adjustColor(colorHex, -0.05));
    } else {
      grad.addColorStop(0, adjustColor(colorHex, isLight ? 0.35 : 0.22));
      grad.addColorStop(0.6, colorHex);
      grad.addColorStop(1, adjustColor(colorHex, -0.28));
    }

    ctx.beginPath();
    pathCircle(ctx, cx, cy, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    pathCircle(ctx, cx, cy, r);
    ctx.strokeStyle = adjustColor(colorHex, -0.45);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (!isDown) {
      ctx.clip();
      const hGrad = ctx.createRadialGradient(cx - 0.3 * r, cy - 0.45 * r, 0, cx - 0.3 * r, cy - 0.45 * r, 0.9 * r);
      hGrad.addColorStop(0, "rgba(255,255,255," + (isLight ? 0.6 : 0.35) + ")");
      hGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hGrad;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  // 绘制 3D 斜向椭圆动作按键 (专用于两键经典掌机 A、B 键)
  function renderEllipseActionSprite(ctx, cx, cy, rx, ry, angle, colorHex, isDown, label) {
    const isLight = getLuminance(colorHex) > 0.62;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // 1. 外部立体阴影
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0," + (isDown ? 0.35 : 0.5) + ")";
    ctx.shadowBlur = isDown ? 2 : 6;
    ctx.shadowOffsetY = isDown ? 1 : 3;

    const grad = ctx.createLinearGradient(0, -ry, 0, ry);
    if (isDown) {
      grad.addColorStop(0, adjustColor(colorHex, -0.25));
      grad.addColorStop(1, adjustColor(colorHex, -0.05));
    } else {
      grad.addColorStop(0, adjustColor(colorHex, isLight ? 0.35 : 0.22));
      grad.addColorStop(0.55, colorHex);
      grad.addColorStop(1, adjustColor(colorHex, -0.28));
    }

    ctx.beginPath();
    pathEllipse(ctx, 0, 0, rx, ry, 0);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 2. 外部暗色倒角边框
    ctx.save();
    ctx.beginPath();
    pathEllipse(ctx, 0, 0, rx, ry, 0);
    ctx.strokeStyle = adjustColor(colorHex, -0.45);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 3. 上边缘饱满内高光 (凸起药丸触感)
    if (!isDown) {
      ctx.clip();
      const hGrad = ctx.createRadialGradient(0, -0.45 * ry, 0, 0, -0.45 * ry, ry);
      hGrad.addColorStop(0, "rgba(255,255,255," + (isLight ? 0.65 : 0.38) + ")");
      hGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hGrad;
      ctx.fillRect(-rx - 2, -ry - 2, 2 * rx + 4, 2 * ry + 4);
    }
    ctx.restore();

    // 4. 按键文本/铭文
    if (label) {
      ctx.save();
      ctx.rotate(-angle * 0.4);
      ctx.font = "800 " + Math.round(Math.max(13, 0.65 * ry)) + "px " + FONT_SANS;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const isLightBg = getLuminance(colorHex) > 0.6;
      ctx.fillStyle = isLightBg ? "rgba(40,30,70,0.8)" : "rgba(255,255,255,0.95)";
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }

    ctx.restore();
  }

  // 构建全部动态精灵雪碧图
  function renderSprites(env, theme, info) {
    globalDpr = env.dpr || 1;
    const hit = env.hitboxes;
    const sprites = {};
    const pad = 12;

    // 1. 动作按键
    info.actions.forEach(act => {
      const b = hit[act.id];
      if (!b) return;
      const color = (theme.btn && theme.btn[act.key]) || theme.btn.A;

      if (b.type === "ellipse") {
        const rx = b.rx || b.r;
        const ry = b.ry || b.r;
        const ang = b.angle || 0;
        const bbW = Math.ceil(Math.sqrt(rx * rx * Math.cos(ang) * Math.cos(ang) + ry * ry * Math.sin(ang) * Math.sin(ang))) + 2;
        const bbH = Math.ceil(Math.sqrt(rx * rx * Math.sin(ang) * Math.sin(ang) + ry * ry * Math.cos(ang) * Math.cos(ang))) + 2;

        const buildBtn = isDown => makeSprite(2 * bbW, 2 * bbH, pad, ctx => {
          const offset = isDown ? 1.5 : 0;
          renderEllipseActionSprite(ctx, bbW, bbH + offset, rx, ry, ang, color, isDown, act.label);
        });

        sprites[act.id] = {
          x: b.x - bbW - pad,
          y: b.y - bbH - pad,
          up: buildBtn(false),
          down: buildBtn(true)
        };
      } else {
        const r = b.r;
        const buildBtn = isDown => makeSprite(2 * r, 2 * r, pad, ctx => {
          const offset = isDown ? 1.5 : 0;
          renderActionSprite(ctx, r, r + offset, r - 1, color, isDown);

          // 按钮文本/铭文 (字母稍微大一点，字号饱满清晰醒目)
          const text = act.label || (hit.twoButton ? (act.key || act.id.toUpperCase()) : "");
          if (text) {
            ctx.save();
            const fontSize = Math.round(hit.twoButton ? Math.max(18, 0.76 * r) : Math.max(14, 0.62 * r));
            ctx.font = "800 " + fontSize + "px " + FONT_SANS;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const isLight = getLuminance(color) > 0.6;
            ctx.fillStyle = isLight ? "rgba(40,30,70,0.88)" : "rgba(255,255,255,0.96)";
            ctx.fillText(text, r, r + offset + 1);
            ctx.restore();
          }
        });

        sprites[act.id] = {
          x: b.x - r - pad,
          y: b.y - r - pad,
          up: buildBtn(false),
          down: buildBtn(true)
        };
      }
    });

    // 2. 实体机械十字键的四臂精灵 (若为十字键模式)
    const hasStick = !!(info.pad && info.pad.stick);
    if (!hasStick && hit.up && hit.down && hit.left && hit.right) {
      const center = hit.dpadCenter || {
        x: (hit.left.x + hit.right.x + hit.right.w) / 2,
        y: (hit.up.y + hit.down.y + hit.down.h) / 2,
        size: Math.max(hit.up.w, hit.up.h)
      };
      const cx = center.x;
      const cy = center.y;
      const size = center.size;
      const span = Math.round(size * 2.9);
      const thick = Math.round(size * 1.05);
      const hs = span / 2;
      const ht = thick / 2;
      const rad = 12;
      const r = Math.max(0, Math.min(rad, ht * 0.85));

      // 十字键按压深度遮罩与下陷颜色 (彻底遮蔽凸起按键与高光中线)
      const pressTop = (theme.dpad && theme.dpad.bottom) ? adjustColor(theme.dpad.bottom, -0.35) : "#101114";
      const pressBottom = (theme.dpad && theme.dpad.bottom) ? adjustColor(theme.dpad.bottom, -0.55) : "#0a0a0d";
      const pressStroke = "rgba(0,0,0,0.85)";

      ["up", "down", "left", "right"].forEach(dir => {
        let bx, by, bw, bh;
        const armLen = Math.max(1, hs - ht + 0.5);
        const armThick = Math.max(1, thick + 1);
        if (dir === "up") {
          // 只覆盖从中心枢轴上缘 (cy - ht) 向上突出的臂身，绝对不侵入中间
          bx = cx - ht - 0.5;
          by = cy - hs - 0.5;
          bw = armThick;
          bh = armLen;
        } else if (dir === "down") {
          // 只覆盖从中心枢轴下缘 (cy + ht) 向下突出的臂身
          bx = cx - ht - 0.5;
          by = cy + ht;
          bw = armThick;
          bh = armLen;
        } else if (dir === "left") {
          // 只覆盖从中心枢轴左缘 (cx - ht) 向左突出的臂身
          bx = cx - hs - 0.5;
          by = cy - ht - 0.5;
          bw = armLen;
          bh = armThick;
        } else if (dir === "right") {
          // 只覆盖从中心枢轴右缘 (cx + ht) 向右突出的臂身
          bx = cx + ht;
          by = cy - ht - 0.5;
          bw = armLen;
          bh = armThick;
        }

        sprites[dir] = {
          x: bx - pad,
          y: by - pad,
          up: makeSprite(bw, bh, pad, () => {}),
          down: makeSprite(bw, bh, pad, ctx => {
            const radArm = Math.max(0, Math.min(r + 0.5, bw / 2, bh / 2));
            ctx.save();
            ctx.beginPath();
            if (dir === "up") {
              // 顶部两角饱满圆角，底部精准平贴中心交叉边缘 (绝不挡到十字键正中心)
              ctx.moveTo(0, bh);
              ctx.lineTo(0, radArm);
              if (radArm > 0) ctx.arcTo(0, 0, radArm, 0, radArm);
              ctx.lineTo(bw - radArm, 0);
              if (radArm > 0) ctx.arcTo(bw, 0, bw, radArm, radArm);
              ctx.lineTo(bw, bh);
            } else if (dir === "down") {
              // 顶部精准平贴中心交叉边缘，底部两角饱满圆角
              ctx.moveTo(0, 0);
              ctx.lineTo(bw, 0);
              ctx.lineTo(bw, bh - radArm);
              if (radArm > 0) ctx.arcTo(bw, bh, bw - radArm, bh, radArm);
              ctx.lineTo(radArm, bh);
              if (radArm > 0) ctx.arcTo(0, bh, 0, bh - radArm, radArm);
            } else if (dir === "left") {
              // 右侧精准平贴中心交叉边缘，左端两角饱满圆角
              ctx.moveTo(bw, 0);
              ctx.lineTo(bw, bh);
              ctx.lineTo(radArm, bh);
              if (radArm > 0) ctx.arcTo(0, bh, 0, bh - radArm, radArm);
              ctx.lineTo(0, radArm);
              if (radArm > 0) ctx.arcTo(0, 0, radArm, 0, radArm);
            } else if (dir === "right") {
              // 左侧精准平贴中心交叉边缘，右端两角饱满圆角
              ctx.moveTo(0, 0);
              ctx.lineTo(bw - radArm, 0);
              if (radArm > 0) ctx.arcTo(bw, 0, bw, radArm, radArm);
              ctx.lineTo(bw, bh - radArm);
              if (radArm > 0) ctx.arcTo(bw, bh, bw - radArm, bh, radArm);
              ctx.lineTo(0, bh);
            }
            ctx.closePath();

            // 1. 深度不透明机械渐变，完全覆盖突出臂表面的亮色与白色刻线
            const grad = ctx.createLinearGradient(0, 0, 0, bh);
            grad.addColorStop(0, pressTop);
            grad.addColorStop(1, pressBottom);
            ctx.fillStyle = grad;
            ctx.fill();

            // 2. 机械深缝与外围阴影
            ctx.strokeStyle = pressStroke;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // 3. 端部微凹沉孔与指腹下陷立体光影
            ctx.save();
            ctx.clip();
            const shadeGrad = ctx.createRadialGradient(bw / 2, bh / 2, 2, bw / 2, bh / 2, Math.max(bw, bh));
            shadeGrad.addColorStop(0, "rgba(0,0,0,0.12)");
            shadeGrad.addColorStop(1, "rgba(0,0,0,0.5)");
            ctx.fillStyle = shadeGrad;
            ctx.fill();
            ctx.restore();

            ctx.restore();
          })
        };
      });
    }

    // 3. 胶囊按键 (投币/开始/SELECT/START)
    info.capsules.forEach(cap => {
      const b = hit[cap.id];
      if (!b) return;
      if (b.roundCap) {
        const W = 62;
        const H = 50;
        const buildRound = isDown => makeSprite(W, H, pad, ctx => {
          const rad = 15;
          const cy = 16;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = isDown ? 2 : 5;
          ctx.shadowOffsetY = isDown ? 1 : 2;
          const gdn = ctx.createRadialGradient(W / 2 - 4, cy - 5, 2, W / 2, cy, rad);
          const capCol = theme.cap || "#3a3c42";
          gdn.addColorStop(0, adjustColor(capCol, isDown ? 0.05 : 0.28));
          gdn.addColorStop(1, adjustColor(capCol, -0.28));
          ctx.beginPath();
          ctx.arc(W / 2, cy, rad, 0, 2 * Math.PI);
          ctx.fillStyle = gdn;
          ctx.fill();
          ctx.restore();
          ctx.font = "600 10px " + FONT_SANS;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = theme.light ? "rgba(40,40,48,0.88)" : "rgba(236,238,242,0.9)";
          ctx.fillText(cap.label, W / 2, 40);
        });
        sprites[cap.id] = {
          x: b.x + b.w / 2 - W / 2 - pad,
          y: b.y - pad,
          up: buildRound(false),
          down: buildRound(true)
        };
        return;
      }
      const bg = getCapsuleBgSize(b);

      const buildCap = isDown => makeSprite(bg.w, bg.h, pad, ctx => {
        const offset = isDown ? 1 : 0;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0," + (isDown ? 0.3 : 0.45) + ")";
        ctx.shadowBlur = isDown ? 2 : 4;
        ctx.shadowOffsetY = isDown ? 1 : 2;

        const grad = ctx.createLinearGradient(0, offset, 0, bg.h + offset);
        grad.addColorStop(0, adjustColor(theme.cap, isDown ? -0.15 : 0.25));
        grad.addColorStop(1, adjustColor(theme.cap, -0.2));

        ctx.beginPath();
        pathRoundRect(ctx, 0, offset, bg.w, bg.h, bg.h / 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        pathRoundRect(ctx, 0, offset, bg.w, bg.h, bg.h / 2);
        ctx.strokeStyle = adjustColor(theme.cap, -0.4);
        ctx.lineWidth = 1;
        ctx.stroke();

        const capFont = cap.label && cap.label.length >= 5 ? "700 10.5px " + FONT_SANS : "600 12px " + FONT_SANS;
        ctx.font = capFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getLuminance(theme.cap) > 0.6 ? "rgba(40,40,48,0.85)" : "rgba(255,255,255,0.92)";
        ctx.fillText(cap.label, bg.w / 2, bg.h / 2 + offset + 0.5);
      });

      sprites[cap.id] = {
        x: b.x + b.w / 2 - bg.w / 2 - pad,
        y: b.y + b.h / 2 - bg.h / 2 - pad,
        up: buildCap(false),
        down: buildCap(true)
      };
    });

    // 4. 摇杆大红球 (仅在摇杆模式下构建)
    if (hasStick && hit.dpadCenter) {
      const t = 1.5 * hit.dpadCenter.size;
      // 球头落在挡圈里，直径接近一颗动作键，底下留一截镀铬杆
      const ballR = 0.34 * t;
      const knobSprite = makeSprite(2 * ballR, 2 * ballR, pad, ctx => {
        const neckW = Math.max(6, ballR * 0.28);
        ctx.save();
        const neck = ctx.createLinearGradient(ballR - neckW / 2, 0, ballR + neckW / 2, 0);
        neck.addColorStop(0, "#6d7280");
        neck.addColorStop(0.35, "#f4f6fb");
        neck.addColorStop(0.7, "#9aa0ae");
        neck.addColorStop(1, "#3e424c");
        ctx.fillStyle = neck;
        ctx.fillRect(ballR - neckW / 2, ballR, neckW, ballR * 0.92);
        ctx.restore();

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;

        const grad = ctx.createRadialGradient(0.7 * ballR, 0.55 * ballR, 0.05 * ballR, ballR, ballR, ballR);
        grad.addColorStop(0, adjustColor(theme.knob, 0.55));
        grad.addColorStop(0.35, adjustColor(theme.knob, 0.12));
        grad.addColorStop(1, theme.knob);

        ctx.beginPath();
        pathCircle(ctx, ballR, ballR, ballR);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // 3D 顶部椭圆高光
        const hGrad = ctx.createRadialGradient(0.68 * ballR, 0.5 * ballR, 0, 0.68 * ballR, 0.5 * ballR, 0.35 * ballR);
        hGrad.addColorStop(0, "rgba(255,255,255,0.75)");
        hGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hGrad;
        ctx.beginPath();
        pathCircle(ctx, 0.68 * ballR, 0.5 * ballR, 0.35 * ballR);
        ctx.fill();
      });

      sprites.__knob = {
        img: knobSprite,
        cx: hit.dpadCenter.x,
        cy: hit.dpadCenter.y,
        travel: 0.42 * t
      };
    }

    // 5. 顶部 L / R 肩键拟物实体精灵 (若配置了 shoulders)
    if (info.shoulders && info.shoulders.length) {
      info.shoulders.forEach(sh => {
        const b = hit[sh.id];
        if (!b) return;
        const rad = b.h / 2;
        const shColor = theme.shoulder || theme.cap || "#3a3c42";

        const buildShoulder = isDown => makeSprite(b.w, b.h, pad, ctx => {
          const offset = isDown ? 1.5 : 0;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0," + (isDown ? 0.35 : 0.5) + ")";
          ctx.shadowBlur = isDown ? 2 : 5;
          ctx.shadowOffsetY = isDown ? 1 : 2.5;

          // 1. 胶囊按键渐变本体 (上方微亮，中间柔和过渡，下方加深立体感)
          const grad = ctx.createLinearGradient(0, offset, 0, b.h + offset);
          grad.addColorStop(0, adjustColor(shColor, isDown ? -0.08 : 0.28));
          grad.addColorStop(0.45, adjustColor(shColor, isDown ? -0.15 : 0.05));
          grad.addColorStop(1, adjustColor(shColor, isDown ? -0.28 : -0.22));

          ctx.beginPath();
          pathRoundRect(ctx, 0, offset, b.w, b.h, rad);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();

          // 2. 边缘深色边框
          ctx.beginPath();
          pathRoundRect(ctx, 0, offset, b.w, b.h, rad);
          ctx.strokeStyle = adjustColor(shColor, -0.38);
          ctx.lineWidth = 1;
          ctx.stroke();

          // 3. 顶部边缘物理高光反光弧线
          if (!isDown) {
            ctx.beginPath();
            pathRoundRect(ctx, 1.5, 1, b.w - 3, b.h * 0.45, rad - 1);
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // 4. 铭文 (加粗清晰饱满的 L 或 R 字母，带下沉微阴影)
          const label = sh.label || (sh.key || sh.id).toUpperCase();
          if (label) {
            ctx.save();
            ctx.font = "800 15px " + FONT_SANS;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const isLight = getLuminance(shColor) > 0.6;
            ctx.fillStyle = isLight ? "rgba(40,30,70,0.85)" : "rgba(255,255,255,0.95)";
            ctx.shadowColor = isLight ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
            ctx.shadowOffsetY = isDown ? 0 : 1;
            ctx.shadowBlur = 1;
            ctx.fillText(label, b.w / 2, b.h / 2 + offset);
            ctx.restore();
          }
        });

        sprites[sh.id] = {
          x: b.x - pad,
          y: b.y - pad,
          up: buildShoulder(false),
          down: buildShoulder(true)
        };
      });
    }

    return sprites;
  }

  function findTheme(id) {
    for (let i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return THEMES[0];
  }

  window.GGEMU_SKIN = {
    themes: THEMES.concat([{ id: "classic", name: "经典" }]),
    layout: { bezelInset: 10, screenInset: 22, bezelAbove: 66, band: 34, topPad: 14 },
    storageKey: "ggemu_skin_pocket",
    find: findTheme,

    build: function(env, themeId, info) {
      const theme = findTheme(themeId);
      return {
        theme: theme,
        bg: renderBackground(env.w, env.h, env, theme, info),
        sprites: renderSprites(env, theme, info)
      };
    },

    draw: function(ctx, skinObj, env, inputs, sourceCanvas) {
      const hit = env.hitboxes;
      // 1. 底图
      ctx.drawImage(skinObj.bg, 0, 0, env.w, env.h);

      // 2. 游戏画面
      if (sourceCanvas && hit.game) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sourceCanvas, hit.game.x, hit.game.y, hit.game.w, hit.game.h);
        ctx.imageSmoothingEnabled = true;
      }

      // 3. 各按键精灵
      const sprites = skinObj.sprites;
      Object.keys(sprites).forEach(key => {
        if (key === "__knob") return;
        const sp = sprites[key];
        const isDown = !!inputs[key];
        const img = isDown ? sp.down : sp.up;
        ctx.drawImage(img, sp.x, sp.y, img.cssW, img.cssH);
      });

      // 4. 摇杆球
      const knob = sprites.__knob;
      if (knob) {
        const stick = env.stick || { x: 0, y: 0 };
        const kx = knob.cx + stick.x * knob.travel - knob.img.cssW / 2;
        const ky = knob.cy + stick.y * knob.travel - knob.img.cssH / 2;
        ctx.drawImage(knob.img, kx, ky, knob.img.cssW, knob.img.cssH);
      }
    }
  };
}();
