// simulator/games-new-impl.js —— 9款全新高品质特色游戏纯前端实现
// 包含：万物皆可敲、飞针破泡录、风与纸翼、浪涌漫游者、午后温泉、短腿爪爪DX、猫猫激光笔、水枪狂欢节、几何弹射枪
// 适配 240x320 竖屏画布 · 3键输入 · 高清大形象 · ASMR音效

(function(global) {
  'use strict';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function drawGameOver(ctx, title, score, sub = 'PRESS OK TO REPLAY') {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 10, 8, 0.88)';
    ctx.fillRect(18, 90, 204, 140);
    ctx.strokeStyle = '#f0c14b';
    ctx.lineWidth = 2;
    ctx.strokeRect(18.5, 90.5, 203, 139);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3d7f';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(title, 120, 122);
    ctx.fillStyle = '#f0c14b';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('SCORE: ' + score, 120, 154);
    ctx.fillStyle = '#c4b49a';
    ctx.font = '10px monospace';
    ctx.fillText(sub, 120, 192);
    ctx.restore();
  }

  const NEW_GAMES = {

    // =========================================================================
    // 1. 万物皆可敲 (Smash Frenzy) —— 极致爆浆解压
    // =========================================================================
    smash: {
      init() {
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.targetIdx = 0;
        this.tools = ['木槌', '爱心充气锤', '雷神重锤', '人字拖'];
        this.toolIdx = 0;
        this.targetTypes = [
          { name: '生鸡蛋', maxHp: 100, color: '#fef3c7', yolk: '#f59e0b', shell: '#fde68a' },
          { name: '金蛋', maxHp: 180, color: '#fef08a', yolk: '#eab308', shell: '#facc15' },
          { name: '大西瓜', maxHp: 240, color: '#15803d', yolk: '#ef4444', shell: '#22c55e' },
          { name: '发条闹钟', maxHp: 160, color: '#94a3b8', yolk: '#cbd5e1', shell: '#64748b' },
          { name: '打卡机', maxHp: 300, color: '#475569', yolk: '#94a3b8', shell: '#334155' }
        ];
        this.hp = this.targetTypes[0].maxHp;
        this.charge = 0;
        this.isCharging = false;
        this.hammerY = 90;
        this.hammerRot = 0;
        this.splatters = [];
        this.particles = [];
      },
      onOk(snd, fx) {
        // 短按普通砸击
        this.hit(1.0, snd, fx);
      },
      hit(pwr, snd, fx) {
        const cur = this.targetTypes[this.targetIdx];
        const dmg = (this.toolIdx === 2 ? 65 : this.toolIdx === 3 ? 35 : 45) * pwr;
        this.hp -= dmg;
        this.combo++;
        this.comboTimer = 2.0;
        this.score += Math.round(dmg * (1 + this.combo * 0.1));
        this.hammerY = 135;
        this.hammerRot = -0.35;

        if (fx) {
          fx.shake = pwr > 1.5 ? 12 : 5;
          fx.floatText(120, 140, pwr > 1.5 ? 'CRIT! -' + Math.round(dmg) : '-' + Math.round(dmg), pwr > 1.5 ? '#ff0055' : '#f0c14b');
        }

        if (snd) {
          if (pwr > 1.5) snd.playExplode();
          else if (this.targetIdx === 0 || this.targetIdx === 1) snd.playPop(1.2);
          else snd.playHit();
        }

        // 飞溅爆浆与碎片
        for (let i = 0; i < (pwr > 1.5 ? 24 : 12); i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 160 * pwr;
          this.particles.push({
            x: 120, y: 190,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 40,
            col: Math.random() < 0.6 ? cur.yolk : cur.shell,
            r: 3 + Math.random() * 5 * pwr,
            life: 1.0
          });
        }

        // 鸡蛋/西瓜蛋黄果汁顺屏滑落
        if (this.targetIdx <= 2) {
          this.splatters.push({
            x: 40 + Math.random() * 160,
            y: 30 + Math.random() * 40,
            len: 25 + Math.random() * 70 * pwr,
            col: cur.yolk,
            w: 4 + Math.random() * 6,
            curY: 0,
            alpha: 1.0
          });
        }

        // 击碎换下一个
        if (this.hp <= 0) {
          if (snd) snd.playCoin();
          this.score += 200 * (this.targetIdx + 1);
          this.targetIdx = (this.targetIdx + 1) % this.targetTypes.length;
          this.hp = this.targetTypes[this.targetIdx].maxHp;
        }
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.upEdge) {
          this.toolIdx = (this.toolIdx - 1 + 4) % 4;
          if (snd) snd.playClick();
        }
        if (keys.downEdge) {
          this.toolIdx = (this.toolIdx + 1) % 4;
          if (snd) snd.playClick();
        }

        // 连击计时
        if (this.comboTimer > 0) {
          this.comboTimer -= sec;
          if (this.comboTimer <= 0) this.combo = 0;
        }

        // 长按蓄力
        if (keys.ok) {
          this.isCharging = true;
          this.charge = Math.min(100, this.charge + 140 * sec);
          this.hammerY = Math.max(50, 90 - this.charge * 0.4);
          this.hammerRot = (Math.random() - 0.5) * (this.charge * 0.005);
        } else {
          if (this.isCharging) {
            // 释放蓄力暴击
            if (this.charge >= 90) {
              this.hit(2.5, snd, fx);
            }
            this.charge = 0;
            this.isCharging = false;
          }
          // 锤子回弹
          this.hammerY += (90 - this.hammerY) * 0.2;
          this.hammerRot += (0 - this.hammerRot) * 0.2;
        }

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx * sec;
          p.y += p.vy * sec;
          p.vy += 450 * sec;
          p.life -= sec * 1.5;
          if (p.life <= 0) this.particles.splice(i, 1);
        }

        // 屏幕滑落液体
        for (let i = this.splatters.length - 1; i >= 0; i--) {
          const s = this.splatters[i];
          s.curY = Math.min(s.len, s.curY + 120 * sec);
          s.alpha -= sec * 0.18;
          if (s.alpha <= 0) this.splatters.splice(i, 1);
        }
      },
      render(ctx) {
        // 背景台面
        ctx.fillStyle = '#1c1514';
        ctx.fillRect(0, 0, 240, 320);
        ctx.fillStyle = '#2d1f1c';
        ctx.fillRect(0, 190, 240, 130);
        ctx.fillStyle = '#45302b';
        ctx.fillRect(0, 188, 240, 4);

        const cur = this.targetTypes[this.targetIdx];
        const ratio = Math.max(0, this.hp / cur.maxHp);

        // 绘制目标实物 (超大细腻图形)
        ctx.save();
        ctx.translate(120, 185);

        if (this.targetIdx === 0 || this.targetIdx === 1) {
          // 生鸡蛋 / 金蛋
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(0, 8, 36, 12, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = cur.shell;
          ctx.beginPath();
          ctx.ellipse(0, -18, 32, 42, 0, 0, Math.PI * 2);
          ctx.fill();

          // 破损裂纹
          if (ratio < 0.75) {
            ctx.strokeStyle = '#854d0e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-10, -25); ctx.lineTo(0, -15); ctx.lineTo(-8, 0); ctx.lineTo(8, 12);
            ctx.stroke();
          }
          if (ratio < 0.4) {
            ctx.fillStyle = cur.yolk;
            ctx.beginPath();
            ctx.arc(4, -8, 12, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (this.targetIdx === 2) {
          // 大西瓜
          ctx.fillStyle = cur.color;
          ctx.beginPath();
          ctx.arc(0, -20, 40, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(-16, -20, 32, -1, 1);
          ctx.arc(16, -20, 32, 2, 4);
          ctx.stroke();
          if (ratio < 0.6) {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(0, -20, 22, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (this.targetIdx === 3) {
          // 发条闹钟
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.arc(0, -24, 36, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(0, -24, 30, 0, Math.PI * 2);
          ctx.fill();
          // 指针
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -24); ctx.lineTo(12, -34);
          ctx.moveTo(0, -24); ctx.lineTo(-8, -20);
          ctx.stroke();
          // 顶部铃铛
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.arc(-26, -56, 12, 0, Math.PI * 2);
          ctx.arc(26, -56, 12, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 周一打卡机
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-35, -60, 70, 68);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-26, -52, 52, 24);
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('9:00 MON', -20, -36);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-22, -18, 44, 4);
        }
        ctx.restore();

        // 绘制锤子/拖鞋工具
        ctx.save();
        ctx.translate(120, this.hammerY);
        ctx.rotate(this.hammerRot);
        if (this.toolIdx === 0) {
          // 木槌
          ctx.fillStyle = '#854d0e';
          ctx.fillRect(-6, 0, 12, 45);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(-24, -18, 48, 22);
        } else if (this.toolIdx === 1) {
          // 粉色爱心充气锤
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(-4, 0, 8, 45);
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(-10, -10, 14, 0, Math.PI * 2);
          ctx.arc(10, -10, 14, 0, Math.PI * 2);
          ctx.fill();
        } else if (this.toolIdx === 2) {
          // 雷神重锤
          ctx.fillStyle = '#334155';
          ctx.fillRect(-5, 0, 10, 50);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(-26, -22, 52, 26);
          ctx.strokeStyle = '#38bdf8';
          ctx.strokeRect(-26, -22, 52, 26);
        } else {
          // 绿色大拖鞋
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.ellipse(0, 0, 18, 38, -0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#facc15';
          ctx.fillRect(-8, -10, 16, 6);
        }
        ctx.restore();

        // 绘制飞溅粒子
        for (const p of this.particles) {
          ctx.fillStyle = p.col;
          ctx.globalAlpha = p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 绘制屏幕流淌液体
        for (const s of this.splatters) {
          ctx.fillStyle = s.col;
          ctx.globalAlpha = s.alpha;
          ctx.fillRect(s.x - s.w / 2, s.y, s.w, s.curY);
          ctx.beginPath();
          ctx.arc(s.x, s.y + s.curY, s.w, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 蓄力环
        if (this.isCharging) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(120, 160, 48, -Math.PI / 2, -Math.PI / 2 + (this.charge / 100) * Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('CHARGING ' + Math.round(this.charge) + '%', 120, 164);
        }

        // 顶部 HUD
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, 240, 32);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE: ' + this.score, 10, 18);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('[' + this.tools[this.toolIdx] + ']', 135, 18);

        // HP 条
        ctx.fillStyle = '#334155';
        ctx.fillRect(10, 24, 220, 4);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(10, 24, 220 * ratio, 4);

        if (this.combo > 1) {
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 12px monospace';
          ctx.fillText('x' + this.combo + ' COMBO!', 10, 48);
        }
      }
    },

    // =========================================================================
    // 2. 飞针破泡录 (Bubble Needle) —— 连锁消除
    // =========================================================================
    bubble: {
      init() {
        this.score = 0;
        this.combo = 0;
        this.aimAngle = 0; // -60 ~ +60 deg
        this.needles = [];
        this.bubbles = [];
        this.particles = [];
        this.spawnTimer = 0;
        this.chargeTimer = 0;
        this.freezeTimer = 0;
      },
      onOk(snd) {
        // 短按发射普通银针
        this.fireNeedle(false, snd);
      },
      fireNeedle(piercing, snd) {
        const rad = (this.aimAngle - 90) * (Math.PI / 180);
        const spd = piercing ? 420 : 320;
        this.needles.push({
          x: 120, y: 295,
          vx: Math.cos(rad) * spd,
          vy: Math.sin(rad) * spd,
          piercing: piercing,
          active: true,
          bounces: 0
        });
        if (snd) {
          if (piercing) snd.playLaser();
          else snd.playShoot();
        }
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.up) this.aimAngle = Math.max(-60, this.aimAngle - 85 * sec);
        if (keys.down) this.aimAngle = Math.min(60, this.aimAngle + 85 * sec);

        // 蓄力大钢针
        if (keys.ok) {
          this.chargeTimer += sec;
          if (this.chargeTimer >= 0.7) {
            this.fireNeedle(true, snd);
            this.chargeTimer = -0.3; // 冷却
            if (fx) fx.shake = 6;
          }
        } else {
          this.chargeTimer = 0;
        }

        // 冻结计时
        if (this.freezeTimer > 0) this.freezeTimer -= sec;

        // 生成气泡
        this.spawnTimer += sec;
        if (this.spawnTimer > 0.85) {
          this.spawnTimer = 0;
          const r = Math.random();
          const type = r < 0.15 ? 'thunder' : r < 0.28 ? 'freeze' : r < 0.42 ? 'coin' : r < 0.65 ? 'hard' : 'normal';
          this.bubbles.push({
            x: 25 + Math.random() * 190,
            y: 330,
            r: type === 'hard' ? 18 : 15,
            type: type,
            hp: type === 'hard' ? 2 : 1,
            drift: Math.random() * Math.PI * 2,
            active: true
          });
        }

        // 更新飞针
        for (let i = this.needles.length - 1; i >= 0; i--) {
          const n = this.needles[i];
          n.x += n.vx * sec;
          n.y += n.vy * sec;
          // 左右反弹
          if (n.x < 8 || n.x > 232) {
            n.vx = -n.vx;
            n.bounces++;
            if (snd) snd.playBounce();
          }
          if (n.y < -20 || n.bounces > 4) {
            this.needles.splice(i, 1);
            continue;
          }

          // 碰撞气泡检测
          for (let b of this.bubbles) {
            if (!b.active) continue;
            const dx = n.x - b.x, dy = n.y - b.y;
            if (dx * dx + dy * dy < (b.r + 6) * (b.r + 6)) {
              b.hp--;
              if (b.hp <= 0) {
                b.active = false;
                this.popBubble(b, snd, fx);
              } else {
                if (snd) snd.playHit();
              }
              if (!n.piercing) {
                this.needles.splice(i, 1);
                break;
              }
            }
          }
        }

        // 更新气泡
        const bSpeed = this.freezeTimer > 0 ? 12 : 55;
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
          const b = this.bubbles[i];
          b.y -= bSpeed * sec;
          b.x += Math.sin((b.drift += 2 * sec)) * 14 * sec;
          if (b.y < -30 || !b.active) {
            this.bubbles.splice(i, 1);
          }
        }

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx * sec; p.y += p.vy * sec;
          p.life -= sec * 2.0;
          if (p.life <= 0) this.particles.splice(i, 1);
        }
      },
      popBubble(b, snd, fx) {
        this.combo++;
        this.score += 50 * this.combo;
        if (snd) snd.playPop(1.0 + Math.min(1.5, this.combo * 0.08));

        // 雷云连锁
        if (b.type === 'thunder') {
          if (fx) { fx.shake = 8; fx.floatText(b.x, b.y, 'CHAIN SHOCK!', '#facc15'); }
          for (let other of this.bubbles) {
            if (other.active && Math.hypot(other.x - b.x, other.y - b.y) < 70) {
              other.active = false;
              this.score += 100;
              this.popBubble(other, snd, fx);
            }
          }
        } else if (b.type === 'freeze') {
          this.freezeTimer = 3.0;
          if (fx) fx.floatText(b.x, b.y, 'FREEZE 3s!', '#38bdf8');
        } else if (b.type === 'coin') {
          this.score += 500;
          if (snd) snd.playCoin();
          if (fx) fx.floatText(b.x, b.y, '+500', '#facc15');
        }

        // 水珠爆裂粒子
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 40 + Math.random() * 90;
          this.particles.push({
            x: b.x, y: b.y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            col: b.type === 'thunder' ? '#facc15' : b.type === 'freeze' ? '#38bdf8' : '#e0f2fe',
            r: 2.5, life: 1.0
          });
        }
      },
      render(ctx) {
        // 背景夜空与微光
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 240, 320);

        // 发射瞄准虚线
        ctx.save();
        ctx.translate(120, 295);
        ctx.rotate((this.aimAngle) * Math.PI / 180);
        ctx.strokeStyle = 'rgba(240, 193, 75, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -90);
        ctx.stroke();

        // 黄铜发射弩
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-8, -12, 16, 24);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, -12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 绘制气泡 (半透明抗锯齿光晕)
        for (const b of this.bubbles) {
          ctx.save();
          ctx.translate(b.x, b.y);
          const col = b.type === 'thunder' ? '#eab308' : b.type === 'freeze' ? '#0284c7' : b.type === 'coin' ? '#ca8a04' : b.type === 'hard' ? '#64748b' : '#38bdf8';
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(0, 0, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = b.type === 'hard' ? 2.5 : 1.2;
          ctx.globalAlpha = 0.85;
          ctx.stroke();
          // 高光点
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-b.r * 0.35, -b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 绘制飞针
        for (const n of this.needles) {
          ctx.save();
          ctx.translate(n.x, n.y);
          const ang = Math.atan2(n.vy, n.vx) + Math.PI / 2;
          ctx.rotate(ang);
          ctx.fillStyle = n.piercing ? '#38bdf8' : '#f8fafc';
          ctx.fillRect(-2, -10, 4, 20);
          ctx.restore();
        }

        // 粒子
        for (const p of this.particles) {
          ctx.fillStyle = p.col;
          ctx.globalAlpha = p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 顶部 HUD
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, 240, 28);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SCORE: ' + this.score, 10, 18);
        if (this.freezeTimer > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('FROZEN ' + this.freezeTimer.toFixed(1) + 's', 140, 18);
        } else if (this.combo > 1) {
          ctx.fillStyle = '#facc15';
          ctx.fillText('x' + this.combo + ' COMBO', 140, 18);
        }
      }
    },

    // =========================================================================
    // 3. 风与纸翼 (Wind Rider) —— 云海心流滑翔
    // =========================================================================
    wind: {
      init() {
        this.dist = 0;
        this.score = 0;
        this.planeY = 140;
        this.planeVy = 0;
        this.planeVx = 120;
        this.pitch = 0;
        this.isDiving = false;
        this.rings = [];
        this.crystals = [];
        this.particles = [];
        this.skyPhase = 0;
      },
      getHeight(x) {
        return 200 + Math.sin(x * 0.007) * 45 + Math.sin(x * 0.018) * 25 + Math.cos(x * 0.003) * 20;
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        this.dist += this.planeVx * sec;
        this.score = Math.round(this.dist / 10);

        const groundY = this.getHeight(this.dist + 50);

        // 操控模型：按住 OK 俯冲下潜，松开迎风抬头翱翔
        if (keys.ok) {
          this.isDiving = true;
          this.diveCharge = (this.diveCharge || 0) + sec;
          this.planeVy += 460 * sec;
          this.planeVx = Math.min(380, this.planeVx + 100 * sec);
          this.pitch = Math.min(0.65, this.pitch + 2.5 * sec);
        } else {
          if (this.isDiving && (this.diveCharge || 0) > 0.15) {
            if (snd) snd.playBounce();
            if (fx) fx.floatText(60, this.planeY - 14, 'SOARING! ✈️', '#38bdf8');
          }
          this.isDiving = false;
          this.diveCharge = 0;
          // 借势转化为升力！
          const lift = (this.planeVx - 75) * 1.75;
          this.planeVy -= lift * sec;
          this.planeVy += 155 * sec; // 自然重力
          this.pitch = Math.max(-0.55, this.pitch - 2.0 * sec);
          this.planeVx = Math.max(90, this.planeVx - 42 * sec);
        }

        if (keys.up) this.pitch -= 0.8 * sec;
        if (keys.down) this.pitch += 0.8 * sec;

        // UP 键按下瞬间：提供瞬间抬头升力；若在草地上则迎风直接冲天起飞！
        if (keys.upEdge) {
          this.pitch = Math.max(-0.65, this.pitch - 0.25);
          if (this.planeY >= groundY - 14) {
            this.planeVy = -180;
            this.planeVx = Math.max(150, this.planeVx);
            if (snd) snd.playJump();
            if (fx) fx.floatText(60, this.planeY - 12, 'LIFT UP! 🍃', '#86efac');
          } else {
            this.planeVy -= 60;
          }
        }

        this.planeY += this.planeVy * sec;

        // 绝不坠毁死亡：贴草地顺势滑行
        if (this.planeY > groundY - 10) {
          this.planeY = groundY - 10;
          this.planeVy = -20;
          this.pitch = Math.max(-0.1, Math.min(0.1, this.pitch));
          // 激起草屑粒子
          if (Math.random() < 0.4) {
            this.particles.push({
              x: 50, y: this.planeY + 6,
              vx: -70 - Math.random() * 50, vy: -25 - Math.random() * 35,
              col: '#86efac', r: 2.5, life: 0.6
            });
          }
        }

        // 周期生成气流光环与风之水晶/蒲公英
        if (this.rings.length < 3) {
          const lastX = this.rings.length ? this.rings[this.rings.length - 1].x : this.dist + 150;
          this.rings.push({
            x: lastX + 180 + Math.random() * 120,
            y: 70 + Math.random() * 85,
            active: true
          });
        }
        if (!this.crystals) this.crystals = [];
        if (this.crystals.length < 4) {
          const lastX = this.crystals.length ? this.crystals[this.crystals.length - 1].x : this.dist + 120;
          this.crystals.push({
            x: lastX + 100 + Math.random() * 90,
            y: 50 + Math.random() * 130,
            type: Math.random() < 0.65 ? 'dandelion' : 'crystal',
            active: true
          });
        }

        // 水晶与蒲公英拾取
        for (const c of this.crystals) {
          if (c.active && Math.abs((this.dist + 50) - c.x) < 22 && Math.abs(this.planeY - c.y) < 22) {
            c.active = false;
            if (c.type === 'crystal') {
              this.score += 50;
              this.planeVx = Math.min(420, this.planeVx + 35);
              if (snd) snd.playCoin();
              if (fx) fx.floatText(60, this.planeY, '+50 💎', '#38bdf8');
            } else {
              this.score += 15;
              if (snd) snd.playClick();
              if (fx) fx.floatText(60, this.planeY, '+15 🌾', '#fef08a');
            }
          }
        }
        this.crystals = this.crystals.filter(c => c.x > this.dist - 80);

        // 穿环检测
        for (const r of this.rings) {
          if (r.active && Math.abs((this.dist + 50) - r.x) < 22 && Math.abs(this.planeY - r.y) < 24) {
            r.active = false;
            this.planeVx = Math.min(420, this.planeVx + 110);
            if (snd) snd.playCoin();
            if (fx) {
              fx.shake = 4;
              fx.floatText(60, this.planeY, 'BOOST!', '#facc15');
            }
          }
        }

        // 移除过路环
        this.rings = this.rings.filter(r => r.x > this.dist - 80);

        // 粒子更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec;
          if (p.life <= 0) this.particles.splice(i, 1);
        }
      },
      render(ctx) {
        // 多层水彩天色渐变
        const grad = ctx.createLinearGradient(0, 0, 0, 320);
        grad.addColorStop(0, '#f97316'); // 暖金夕阳
        grad.addColorStop(0.5, '#db2777'); // 紫霞
        grad.addColorStop(1, '#4c1d95'); // 幽紫夜幕
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 240, 320);

        // 远景连绵山丘
        ctx.fillStyle = 'rgba(76, 29, 149, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, 320);
        for (let px = 0; px <= 240; px += 10) {
          ctx.lineTo(px, this.getHeight((this.dist * 0.4) + px) - 30);
        }
        ctx.lineTo(240, 320);
        ctx.fill();

        // 近景柔和草丘
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.moveTo(0, 320);
        for (let px = 0; px <= 240; px += 6) {
          ctx.lineTo(px, this.getHeight(this.dist + px));
        }
        ctx.lineTo(240, 320);
        ctx.fill();

        // 绘制气流风之环
        for (const r of this.rings) {
          const rx = r.x - this.dist;
          if (rx > -30 && rx < 270) {
            ctx.strokeStyle = r.active ? '#facc15' : 'rgba(250, 204, 21, 0.2)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(rx, r.y, 14, 24, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // 绘制收集品：风之水晶 💎 与 蒲公英 🌾
        if (this.crystals) {
          for (const c of this.crystals) {
            if (!c.active) continue;
            const cx = c.x - this.dist;
            if (cx < -20 || cx > 260) continue;
            ctx.save();
            ctx.translate(cx, c.y);
            if (c.type === 'crystal') {
              // 菱形晶石微光
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(-1, -2, 1.5, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // 蒲公英绒球
              ctx.fillStyle = '#fef08a';
              ctx.beginPath();
              ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            ctx.restore();
          }
        }

        // 绘制折纸飞机与红丝带
        ctx.save();
        ctx.translate(50, this.planeY);
        ctx.rotate(this.pitch);

        // 绯红丝带拖尾
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.quadraticCurveTo(-26, Math.sin(Date.now() * 0.01) * 8, -40, Math.cos(Date.now() * 0.008) * 6);
        ctx.stroke();

        // 白纸飞机机身
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-14, -9); ctx.lineTo(-8, 0);
        ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-14, 9); ctx.lineTo(-8, 0);
        ctx.fill();
        ctx.restore();

        // 粒子
        for (const p of this.particles) {
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // HUD
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(Math.round(this.dist) + 'm  ' + Math.round(this.planeVx) + 'km/h', 12, 22);
        ctx.fillStyle = '#fde047';
        ctx.font = '10px monospace';
        ctx.fillText('HOLD OK: DIVE / RELEASE: SOAR', 12, 36);
      }
    },

    // =========================================================================
    // 4. 浪涌漫游者 (Wave Walker) —— 海獭冲浪 (超灵敏三键优化版)
    // =========================================================================
    wave: {
      init() {
        this.score = 0;
        this.dist = 0;
        this.speed = 180;
        this.airborne = false;
        this.otterY = 180;
        this.otterVy = 0;
        this.rot = 0;
        this.stunts = 0;
        this.combo = 0;
        this.time = 0;
        this.jumpBuffer = 0;      // 跳跃输入缓冲 (秒)
        this.isPumping = false;     // 是否压板冲坡
        this.sparkleTimer = 0;     // 完美切水十字星芒
        this.flopDazed = 0;        // 拍水眨眼计时
        this.particles = [];
        this.pickups = [];
      },
      getWave(x, t) {
        return 180 + Math.sin(x * 0.016 - t * 2.8) * 38 + Math.sin(x * 0.038 - t * 4.2) * 16;
      },
      getSlope(x, t) {
        const dx = 4;
        return (this.getWave(x + dx, t) - this.getWave(x - dx, t)) / (dx * 2);
      },
      onOk(snd, fx) {
        // 实体按键瞬间响应：记录输入缓冲
        this.jumpBuffer = 0.28;
        if (this.airborne) {
          // 空中短按 OK：触发自动切水回正辅助
          const seaY = this.getWave(this.dist, this.time);
          const slope = this.getSlope(this.dist, this.time);
          this.rot = Math.atan(slope);
          if (snd) snd.playClick();
          if (fx) fx.floatText(60, this.otterY - 10, 'ALIGN!', '#38bdf8');
        }
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        this.time += sec;
        this.dist += this.speed * sec;
        this.score = Math.round(this.dist / 4) + this.stunts * 250;

        if (this.sparkleTimer > 0) this.sparkleTimer -= sec;
        if (this.flopDazed > 0) this.flopDazed -= sec;

        const seaY = this.getWave(this.dist, this.time);
        const slope = this.getSlope(this.dist, this.time);

        // 按键输入缓冲衰减 (响应 OK 边沿与 UP 边沿)
        if (keys.okEdge || keys.upEdge) this.jumpBuffer = 0.28;
        if (this.jumpBuffer > 0) this.jumpBuffer -= sec;

        if (!this.airborne) {
          this.otterY = seaY - 8;
          this.rot = Math.atan(slope);

          // DOWN 键压板加速 (Pumping) —— 任何坡度都灵敏响应！
          if (keys.down) {
            this.isPumping = true;
            // 顺下坡冲刺加成
            const slopeBonus = slope > 0 ? (slope * 280) : 60;
            this.speed = Math.min(420, this.speed + (160 + slopeBonus) * sec);
            if (Math.random() < 0.35 && snd) snd.playBounce();
            // 喷溅白沫尾迹
            if (Math.random() < 0.6) {
              this.particles.push({
                x: 40, y: this.otterY + 6,
                vx: -120 - Math.random() * 60, vy: -15 - Math.random() * 25,
                col: '#bae6fd', r: 3.5, life: 0.4
              });
            }
          } else {
            this.isPumping = false;
            // 自然平稳回归巡航速度
            if (this.speed > 180) this.speed -= 40 * sec;
            else if (this.speed < 180) this.speed += 50 * sec;
          }

          // 起跳逻辑 —— 只要有输入缓冲或按下了 UP/OK 即刻起跳，绝对不吞键！
          if (this.jumpBuffer > 0 || keys.okEdge || keys.upEdge) {
            this.jumpBuffer = 0;
            this.airborne = true;
            // 判断是否在浪尖（波峰区域 slope < 0.05 且有一定速度）
            if (slope < 0.05) {
              // 浪尖大暴冲 SUPER LAUNCH!
              this.otterVy = -340 - (this.speed * 0.42);
              if (snd) snd.playJump();
              if (fx) {
                fx.shake = 4;
                fx.floatText(60, this.otterY - 14, 'SUPER LAUNCH! 🚀', '#facc15');
              }
            } else {
              // 波面小跳 OLLIE!
              this.otterVy = -230 - (this.speed * 0.25);
              if (snd) snd.playBounce();
              if (fx) fx.floatText(60, this.otterY - 10, 'HOP! 🏄', '#38bdf8');
            }
          }
        } else {
          // 空中滞空
          this.otterY += this.otterVy * sec;
          this.otterVy += 620 * sec; // 真实水上滞空重力

          // 空中 360° 滑稽大翻滚
          if (keys.up) this.rot += 9.5 * sec;
          if (keys.down) this.rot -= 9.5 * sec;

          // 入水触水检测
          if (this.otterY >= seaY - 8) {
            this.airborne = false;
            this.otterY = seaY - 8;

            const waveAngle = Math.atan(slope);
            // 修复负角度取模 bug：标准最短角差 [-PI, PI]
            let diff = Math.abs(Math.atan2(Math.sin(this.rot - waveAngle), Math.cos(this.rot - waveAngle)));

            if (diff < 0.82) { // 宽容度大幅优化 (~48度以内均算完美切水)
              this.combo++;
              this.stunts++;
              this.speed = Math.min(460, this.speed + 140);
              this.sparkleTimer = 1.0;
              if (snd) snd.playCoin();
              if (fx) {
                fx.shake = 5;
                fx.floatText(50, this.otterY - 20, 'CLEAN ENTRY! +' + (200 + this.combo * 50), '#facc15');
              }
              // 炸开七彩切水浪花
              for (let k = 0; k < 12; k++) {
                const ang = -Math.PI * 0.2 - Math.random() * Math.PI * 0.6;
                const spd = 60 + Math.random() * 80;
                this.particles.push({
                  x: 50, y: this.otterY + 2,
                  vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                  col: ['#38bdf8', '#facc15', '#ffffff', '#a7f3d0'][k % 4],
                  r: 3 + Math.random() * 2, life: 0.5
                });
              }
            } else {
              // 肚皮啪叽拍水搞笑减速 (不致死，可爱微表情扑腾)
              this.speed = 130;
              this.combo = 0;
              this.flopDazed = 1.2;
              if (snd) snd.playHit();
              if (fx) fx.floatText(50, this.otterY - 14, 'BELLY FLOP! 💦', '#f43f5e');
            }
          }
        }

        // 随机生成海面收集品 (海星 ⭐ 与 珍珠贝 🐚)
        if (this.pickups.length < 3) {
          const lastX = this.pickups.length ? this.pickups[this.pickups.length - 1].x : this.dist + 160;
          this.pickups.push({
            x: lastX + 140 + Math.random() * 120,
            type: Math.random() < 0.6 ? 'star' : 'shell',
            active: true
          });
        }
        for (const p of this.pickups) {
          if (p.active && Math.abs((this.dist + 50) - p.x) < 26) {
            p.active = false;
            this.score += p.type === 'star' ? 100 : 250;
            if (snd) snd.playCoin();
            if (fx) fx.floatText(60, this.otterY - 16, p.type === 'star' ? '+100 ⭐' : '+250 🐚', '#fef08a');
          }
        }
        this.pickups = this.pickups.filter(p => p.x > this.dist - 80);

        // 水花粒子运动更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx * sec; p.y += p.vy * sec; p.life -= sec * 2.2;
          if (p.life <= 0) this.particles.splice(i, 1);
        }
      },
      render(ctx) {
        // 晴空海景渐变
        const sky = ctx.createLinearGradient(0, 0, 0, 220);
        sky.addColorStop(0, '#0284c7');
        sky.addColorStop(0.65, '#38bdf8');
        sky.addColorStop(1, '#bae6fd');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 240, 320);

        // 太阳与远景热带海岛小轮廓
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(200, 48, 18, 0, Math.PI * 2);
        ctx.fill();

        // 动态正弦深海波浪层 (双层波浪景深)
        ctx.fillStyle = 'rgba(3, 105, 161, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, 320);
        for (let px = 0; px <= 240; px += 8) {
          ctx.lineTo(px, this.getWave(this.dist * 0.7 - 30 + px, this.time * 0.8) + 14);
        }
        ctx.lineTo(240, 320);
        ctx.fill();

        // 主体蔚蓝海浪
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.moveTo(0, 320);
        for (let px = 0; px <= 240; px += 4) {
          ctx.lineTo(px, this.getWave(this.dist - 50 + px, this.time));
        }
        ctx.lineTo(240, 320);
        ctx.fill();

        // 浪尖白沫描边
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // 绘制海面漂浮收集品 (海星 ⭐ / 贝壳 🐚)
        for (const p of this.pickups) {
          if (!p.active) continue;
          const rx = p.x - this.dist;
          if (rx > -20 && rx < 260) {
            const py = this.getWave(p.x, this.time) - 10;
            ctx.font = '16px sans-serif';
            ctx.fillText(p.type === 'star' ? '⭐' : '🐚', rx - 8, py);
          }
        }

        // 绘制主角小海獭 (大脸萌宠 + 墨镜 + 冲浪板)
        ctx.save();
        ctx.translate(50, this.otterY);
        ctx.rotate(this.rot);

        // 压板动作时冲浪板下沉微倾
        if (this.isPumping) ctx.translate(0, 2);

        // 1. 柠檬黄流线型冲浪板
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.ellipse(0, 9, 26, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(-18, 8, 36, 2); // 冲浪板防滑条

        // 2. 小海獭圆滚滚毛茸茸身体 (栗棕色)
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.ellipse(0, -1, 15, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3. 小海獭奶白/暖米色小肚子
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.ellipse(2, 1, 9, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 4. 萌萌大头 (朝向右侧前进方向)
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.arc(8, -6, 9, 0, Math.PI * 2);
        ctx.fill();

        // 两只小圆耳 (腾空时可爱起伏)
        const earBob = this.airborne ? Math.sin(Date.now() * 0.02) * 2 : 0;
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(4, -13 + earBob, 3.5, 0, Math.PI * 2);
        ctx.arc(12, -13 + earBob, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 暖粉色小鼻头与腮红
        ctx.fillStyle = '#fda4af';
        ctx.beginPath();
        ctx.arc(15, -4, 2, 0, Math.PI * 2); // 小鼻子
        ctx.arc(6, -2, 2.5, 0, Math.PI * 2); // 腮红
        ctx.fill();

        // 5. 墨镜 or 拍水大眼睛
        if (this.flopDazed > 0) {
          // 拍水眨眼晕晕圈
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1.5;
          ctx.strokeText('x_x', 8, -4);
        } else {
          // 酷炫黑色防紫外线墨镜
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(8, -8, 8, 5, 2);
          ctx.fill();
          // 墨镜高光反光
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(10, -7, 2, 3);

          // 完美切水时墨镜闪耀金色十字星芒 ✨
          if (this.sparkleTimer > 0) {
            ctx.fillStyle = '#fde047';
            ctx.fillRect(11, -11, 2, 8);
            ctx.fillRect(8, -8, 8, 2);
          }
        }

        // 6. 前后两只可爱小肉爪爪抓板
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.arc(-8, 6, 3, 0, Math.PI * 2);
        ctx.arc(10, 6, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // 绘制浪花与喷射水沫粒子
        for (const p of this.particles) {
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // 顶部 HUD (清晰高对比度)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(0, 0, 240, 28);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(Math.round(this.dist) + 'm  SCORE:' + this.score, 8, 18);
        ctx.fillStyle = this.speed > 300 ? '#facc15' : '#38bdf8';
        ctx.fillText(Math.round(this.speed) + 'px/s', 180, 18);

        // 底部按键指引微贴士
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 302, 240, 18);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '9px monospace';
        ctx.fillText('DOWN: 压板加速 | OK: 起跳/空中回正', 18, 314);
      }
    },

    // =========================================================================
    // 5. 午后温泉 (Fluffy Huddle) —— 萌物抱抱团
    // =========================================================================
    huddle: {
      init() {
        this.score = 0;
        this.railX = 120;
        this.animals = [];
        this.sakura = [];
        this.quoteText = '今天也辛苦啦，快进来泡个暖洋洋的温泉吧~';
        this.quoteTimer = 4.0;
        this.animalTiers = [
          { name: '柴犬·阿柴', col: '#d97706', ear: '#92400e', r: 16 },
          { name: '海豹·糯米', col: '#f8fafc', ear: '#cbd5e1', r: 20 },
          { name: '团子·折耳猫', col: '#fb923c', ear: '#c2410c', r: 24 },
          { name: '水獭·皮皮', col: '#78350f', ear: '#451a03', r: 28 }
        ];
        this.curTier = 0;
      },
      onOk(snd) {
        // 短按滑入小动物
        this.dropAnimal(snd);
      },
      dropAnimal(snd) {
        if (this.animals.length >= 12) return;
        this.animals.push({
          x: this.railX,
          y: 70,
          vy: 60,
          vx: (Math.random() - 0.5) * 20,
          tier: this.curTier,
          inWater: false,
          squishX: 1.0,
          squishY: 1.0
        });
        this.curTier = Math.floor(Math.random() * 2);
        if (snd) snd.playClack();
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.up) this.railX = Math.max(35, this.railX - 140 * sec);
        if (keys.down) this.railX = Math.min(205, this.railX + 140 * sec);

        // 长按抚摸
        if (keys.okHold) {
          this.quoteText = '无论多忙，别忘了喝杯温水，好好抱抱自己呀~';
          this.quoteTimer = 3.0;
          if (snd && Math.random() < 0.1) snd.playPurr();
        }

        if (this.quoteTimer > 0) this.quoteTimer -= sec;

        const waterY = 110;

        // 更新动物物理
        for (let i = 0; i < this.animals.length; i++) {
          const a = this.animals[i];
          const info = this.animalTiers[a.tier];

          if (a.y < waterY) {
            a.vy += 400 * sec; // 空中重力
          } else {
            if (!a.inWater) {
              a.inWater = true;
              if (snd) snd.playSplash();
              a.squishX = 1.3; a.squishY = 0.7;
            }
            // 水中浮力与阻尼
            a.vy += (waterY + 130 - a.y) * 4 * sec;
            a.vy *= 0.94;
            a.vx *= 0.92;
          }
          a.x += a.vx * sec;
          a.y += a.vy * sec;

          // 温泉池左右与底部边界
          if (a.x < 24 + info.r) { a.x = 24 + info.r; a.vx = -a.vx * 0.5; }
          if (a.x > 216 - info.r) { a.x = 216 - info.r; a.vx = -a.vx * 0.5; }
          if (a.y > 280 - info.r) { a.y = 280 - info.r; a.vy = -a.vy * 0.4; }

          // 果冻弹性回复
          a.squishX += (1.0 - a.squishX) * 6 * sec;
          a.squishY += (1.0 - a.squishY) * 6 * sec;

          // 两两果冻碰撞与融合进阶
          for (let j = i + 1; j < this.animals.length; j++) {
            const b = this.animals[j];
            const bInfo = this.animalTiers[b.tier];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const minDist = info.r + bInfo.r;

            if (dist < minDist && dist > 0.001) {
              // 相同动物抱团融合
              if (a.tier === b.tier && a.tier < 3) {
                a.tier++;
                this.score += (a.tier + 1) * 100;
                this.animals.splice(j, 1);
                if (snd) snd.playCoin();
                if (fx) {
                  fx.floatText(a.x, a.y, 'MERGE! +100', '#f43f5e');
                  fx.shake = 4;
                }
                break;
              }
              // 果冻挤压排斥
              const overlap = (minDist - dist) * 0.5;
              const nx = dx / dist, ny = dy / dist;
              a.x -= nx * overlap; a.y -= ny * overlap;
              b.x += nx * overlap; b.y += ny * overlap;
              a.squishX = 1.2; a.squishY = 0.8;
              b.squishX = 1.2; b.squishY = 0.8;
            }
          }
        }

        // 飘落樱花
        if (Math.random() < 0.15) {
          this.sakura.push({
            x: Math.random() * 240, y: 0,
            vx: 15 + Math.random() * 25, vy: 30 + Math.random() * 30,
            rot: 0, life: 1.0
          });
        }
        for (let i = this.sakura.length - 1; i >= 0; i--) {
          const s = this.sakura[i];
          s.x += s.vx * sec; s.y += s.vy * sec; s.rot += 2 * sec; s.life -= sec * 0.2;
          if (s.y > 320 || s.life <= 0) this.sakura.splice(i, 1);
        }
      },
      render(ctx) {
        // 日式庭院与温暖温泉
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(0, 0, 240, 320);

        // 温泉木池
        ctx.fillStyle = '#78350f';
        ctx.fillRect(16, 95, 208, 195);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(20, 100, 200, 185);

        // 暖蓝温水
        ctx.fillStyle = '#0284c7';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(22, 110, 196, 170);
        ctx.globalAlpha = 1.0;

        // 顶部投放滑轨与当前待放小动物
        ctx.fillStyle = '#b45309';
        ctx.fillRect(30, 48, 180, 6);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(this.railX, 51, 6, 0, Math.PI * 2);
        ctx.fill();

        const pending = this.animalTiers[this.curTier];
        ctx.fillStyle = pending.col;
        ctx.beginPath();
        ctx.arc(this.railX, 68, pending.r * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // 绘制池中小动物
        for (const a of this.animals) {
          const info = this.animalTiers[a.tier];
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.scale(a.squishX, a.squishY);

          // 身体
          ctx.fillStyle = info.col;
          ctx.beginPath();
          ctx.arc(0, 0, info.r, 0, Math.PI * 2);
          ctx.fill();

          // 呆萌脸部
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-info.r * 0.3, -2, 3, 0, Math.PI * 2);
          ctx.arc(info.r * 0.3, -2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(-info.r * 0.3, -2, 1.5, 0, Math.PI * 2);
          ctx.arc(info.r * 0.3, -2, 1.5, 0, Math.PI * 2);
          ctx.fill();

          // 享受头巾
          if (a.tier >= 1) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(-8, -info.r - 2, 16, 6);
          }
          ctx.restore();
        }

        // 飘落樱花
        for (const s of this.sakura) {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.fillStyle = '#f472b6';
          ctx.beginPath();
          ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 治愈语录横幅
        if (this.quoteTimer > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(8, 282, 224, 30);
          ctx.fillStyle = '#fde047';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(this.quoteText, 120, 301);
        }

        // 积分
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SCORE: ' + this.score, 12, 24);
      }
    },

    // =========================================================================
    // 6. 短腿爪爪运动会·进化版 (Paws Sprint DX) —— 正面萌脸冲刺
    // =========================================================================
    pawssprint: {
      init() {
        this.score = 0;
        this.dist = 0;
        this.lane = 1; // 0:左, 1:中, 2:右
        this.lanesX = [50, 120, 190];
        this.x = 120;
        this.y = 240;
        this.jumpZ = 0;
        this.jumpVy = 0;
        this.isJumping = false;
        this.turbo = false;
        this.turboTimer = 0;
        this.slipAngle = 0;
        this.isSlipping = false;
        this.obstacles = [];
        this.bones = [];
        this.feathers = [];
        this.charIdx = 0;
      },
      onOk(snd) {
        if (this.isJumping) return;
        this.isJumping = true;
        this.jumpVy = -320;
        if (snd) snd.playJump();
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        // 变道按键单次吸附
        if (keys.upEdge && this.lane > 0) {
          this.lane--;
          if (snd) snd.playClick();
        }
        if (keys.downEdge && this.lane < 2) {
          this.lane++;
          if (snd) snd.playClick();
        }

        // 强力中线吸附平滑对齐
        const targetX = this.lanesX[this.lane];
        this.x += (targetX - this.x) * 16 * sec;

        // 涡轮狂蹬
        if (keys.okHold && !this.turbo && this.turboTimer <= 0) {
          this.turbo = true;
          this.turboTimer = 2.5;
          if (snd) snd.playNitro();
          if (fx) fx.shake = 5;
        }
        if (this.turboTimer > 0) {
          this.turboTimer -= sec;
          if (this.turboTimer <= 0) this.turbo = false;
        }

        const spd = this.turbo ? 320 : 160;
        this.dist += spd * sec;
        this.score = Math.round(this.dist / 5);

        // 跳跃物理
        if (this.isJumping) {
          this.jumpZ += this.jumpVy * sec;
          this.jumpVy += 800 * sec;
          if (this.jumpZ >= 0) {
            this.jumpZ = 0;
            this.isJumping = false;
          }
        }

        // 香蕉皮搞笑打转
        if (this.isSlipping) {
          this.slipAngle += 14 * sec;
          if (this.slipAngle >= Math.PI * 2) {
            this.slipAngle = 0;
            this.isSlipping = false;
          }
        }

        // 障碍物生成与检测
        if (Math.random() < 0.035) {
          this.obstacles.push({
            x: this.lanesX[Math.floor(Math.random() * 3)],
            y: -20,
            type: Math.random() < 0.5 ? 'banana' : 'hurdle',
            active: true
          });
        }
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
          const o = this.obstacles[i];
          o.y += spd * sec;
          if (o.active && Math.hypot(o.x - this.x, o.y - this.y) < 22) {
            o.active = false;
            if (this.turbo) {
              // 涡轮冲撞直接粉碎障碍！
              if (snd) snd.playExplode();
              if (fx) fx.floatText(this.x, this.y, 'SMASH!', '#facc15');
            } else if (this.isJumping && this.jumpZ < -15) {
              // 成功跃过
            } else {
              // 踩香蕉皮或撞障碍搞笑打转
              this.isSlipping = true;
              if (snd) snd.playSlip();
              if (fx) fx.floatText(this.x, this.y, 'WOOPS!', '#f43f5e');
            }
          }
          if (o.y > 340) this.obstacles.splice(i, 1);
        }
      },
      render(ctx) {
        // 暖黄与青草赛道
        ctx.fillStyle = '#65a30d';
        ctx.fillRect(0, 0, 240, 320);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(20, 0, 200, 320);

        // 跑道分界虚线
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 16]);
        ctx.beginPath();
        ctx.moveTo(85, 0); ctx.lineTo(85, 320);
        ctx.moveTo(155, 0); ctx.lineTo(155, 320);
        ctx.stroke();

        // 障碍物
        for (const o of this.obstacles) {
          if (!o.active) continue;
          if (o.type === 'banana') {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(o.x, o.y, 8, 0, Math.PI);
            ctx.fill();
          } else {
            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(o.x - 14, o.y - 4, 28, 8);
          }
        }

        // 正面 45° 大脸柯基萌宠 (清晰表情，绝不仅看屁股！)
        ctx.save();
        ctx.translate(this.x, this.y + this.jumpZ);
        ctx.rotate(this.slipAngle);

        // 柯基头部
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // 标志性三角形大耳朵
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.moveTo(-16, -6); ctx.lineTo(-12, -26); ctx.lineTo(-4, -8); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(16, -6); ctx.lineTo(12, -26); ctx.lineTo(4, -8); ctx.fill();

        // 白色面部与吐舌头
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 4, 9, 0, Math.PI * 2);
        ctx.fill();
        // 眼睛
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-6, -2, 2.5, 0, Math.PI * 2);
        ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 快乐吐舌
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.ellipse(0, 8, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 240, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(Math.round(this.dist) + 'm  SCORE: ' + this.score, 10, 18);
        if (this.turbo) {
          ctx.fillStyle = '#facc15';
          ctx.fillText('⚡TURBO PAW DASH!', 120, 18);
        }
      }
    },

    // =========================================================================
    // 7. 猫猫激光笔指挥官 (Laser Cat) —— 推箱解谜
    // =========================================================================
    lasercat: {
      init() {
        this.score = 0;
        this.aimAngle = 0; // -60 ~ +60 deg
        this.cats = [
          { x: 60, y: 150, breed: 'orange', state: 'IDLE', pounceT: 0 },
          { x: 180, y: 170, breed: 'black', state: 'IDLE', pounceT: 0 }
        ];
        this.box = { x: 120, y: 120, w: 28, h: 28 };
        this.socket = { x: 120, y: 50, w: 32, h: 32 };
        this.laserOn = false;
        this.laserDot = { x: 120, y: 120 };
        this.won = false;
      },
      onOk(snd) {
        this.laserOn = !this.laserOn;
        if (snd) snd.playLaser();
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.up) this.aimAngle = Math.max(-60, this.aimAngle - 75 * sec);
        if (keys.down) this.aimAngle = Math.min(60, this.aimAngle + 75 * sec);
        this.laserOn = keys.ok || keys.okHold;

        // 计算激光红点位置
        const rad = (this.aimAngle - 90) * Math.PI / 180;
        this.laserDot.x = clamp(120 + Math.cos(rad) * 160, 20, 220);
        this.laserDot.y = clamp(300 + Math.sin(rad) * 160, 30, 290);

        // 猫咪 AI 飞扑追踪
        if (this.laserOn) {
          for (const c of this.cats) {
            const dx = this.laserDot.x - c.x, dy = this.laserDot.y - c.y;
            c.x += dx * 2.5 * sec;
            c.y += dy * 2.5 * sec;

            // 撞击推动箱子
            if (Math.hypot(c.x - this.box.x, c.y - this.box.y) < 26) {
              const bdx = this.box.x - c.x, bdy = this.box.y - c.y;
              const len = Math.hypot(bdx, bdy) || 1;
              this.box.x += (bdx / len) * 80 * sec;
              this.box.y += (bdy / len) * 80 * sec;
              if (snd && Math.random() < 0.1) snd.playHit();
            }
          }
        }

        // 箱子推入卡槽胜利
        if (Math.hypot(this.box.x - this.socket.x, this.box.y - this.socket.y) < 18) {
          if (!this.won) {
            this.won = true;
            this.score += 1000;
            if (snd) snd.playCoin();
            if (fx) fx.floatText(120, 100, 'POWER CONNECTED!', '#38bdf8');
          }
        }
      },
      render(ctx) {
        // 木地板房间
        ctx.fillStyle = '#451a03';
        ctx.fillRect(0, 0, 240, 320);

        // 通电插槽
        ctx.fillStyle = this.won ? '#38bdf8' : '#1e293b';
        ctx.fillRect(this.socket.x - 16, this.socket.y - 16, 32, 32);
        ctx.strokeStyle = '#facc15';
        ctx.strokeRect(this.socket.x - 16, this.socket.y - 16, 32, 32);

        // 电池木箱
        ctx.fillStyle = '#b45309';
        ctx.fillRect(this.box.x - 14, this.box.y - 14, 28, 28);
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', this.box.x, this.box.y + 4);

        // 激光束与光斑
        if (this.laserOn) {
          ctx.strokeStyle = '#ff0055';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(120, 305);
          ctx.lineTo(this.laserDot.x, this.laserDot.y);
          ctx.stroke();

          ctx.fillStyle = '#ff0055';
          ctx.beginPath();
          ctx.arc(this.laserDot.x, this.laserDot.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 猫咪军团
        for (const c of this.cats) {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.fillStyle = c.breed === 'orange' ? '#ea580c' : '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          // 猫耳朵
          ctx.beginPath();
          ctx.moveTo(-10, -6); ctx.lineTo(-12, -18); ctx.lineTo(-2, -10); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(10, -6); ctx.lineTo(12, -18); ctx.lineTo(2, -10); ctx.fill();
          // 大眼睛
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(-5, -2, 3, 0, Math.PI * 2);
          ctx.arc(5, -2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('HOLD OK: RED LASER  UP/DN: AIM', 8, 17);
      }
    },

    // =========================================================================
    // 8. 泡泡高压水枪狂欢节 (Hydro Splasher)
    // =========================================================================
    splasher: {
      init() {
        this.score = 0;
        this.pitch = 0; // -35 ~ +35 deg
        this.waterDrops = [];
        this.npcs = [
          { x: 140, y: 220, happy: false },
          { x: 190, y: 160, happy: false }
        ];
        this.charge = 0;
      },
      onOk(snd) {
        this.fireWater(snd);
      },
      fireWater(snd) {
        const rad = (this.pitch - 45) * Math.PI / 180;
        for (let i = 0; i < 5; i++) {
          this.waterDrops.push({
            x: 35, y: 280,
            vx: Math.cos(rad) * (240 + Math.random() * 40),
            vy: Math.sin(rad) * (240 + Math.random() * 40),
            color: ['#38bdf8', '#f43f5e', '#facc15', '#a855f7'][Math.floor(Math.random() * 4)]
          });
        }
        if (snd) snd.playSplash();
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.up) this.pitch = Math.max(-35, this.pitch - 60 * sec);
        if (keys.down) this.pitch = Math.min(35, this.pitch + 60 * sec);

        // 更新水弹
        for (let i = this.waterDrops.length - 1; i >= 0; i--) {
          const w = this.waterDrops[i];
          w.x += w.vx * sec;
          w.y += w.vy * sec;
          w.vy += 320 * sec; // 重力抛物线

          // 命中 NPC
          for (const n of this.npcs) {
            if (!n.happy && Math.hypot(w.x - n.x, w.y - n.y) < 22) {
              n.happy = true;
              this.score += 300;
              if (snd) snd.playCoin();
              if (fx) fx.floatText(n.x, n.y, 'ALOHA! +300', '#f43f5e');
            }
          }
          if (w.y > 320 || w.x > 240) this.waterDrops.splice(i, 1);
        }
      },
      render(ctx) {
        // 灰白城市背景
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 240, 320);

        // 建筑物轮廓
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(60, 60, 60, 260);
        ctx.fillRect(140, 100, 80, 220);

        // 喷洒水弹
        for (const w of this.waterDrops) {
          ctx.fillStyle = w.color;
          ctx.beginPath();
          ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // 打工人 NPC (未命中为黑白，命中换夏威夷花衬衫跳舞)
        for (const n of this.npcs) {
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.fillStyle = n.happy ? '#f43f5e' : '#475569';
          ctx.fillRect(-8, -16, 16, 24);
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.arc(0, -22, 7, 0, Math.PI * 2);
          ctx.fill();
          if (n.happy) {
            ctx.fillStyle = '#facc15';
            ctx.fillText('🌺', -6, -28);
          }
          ctx.restore();
        }

        // 左下角雨衣主角与水枪
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(25, 290, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(25, 285);
        ctx.rotate((this.pitch - 45) * Math.PI / 180);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, -4, 26, 8);
        ctx.restore();

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('SCORE: ' + this.score + '  UP/DN: PITCH  OK: BLAST', 8, 17);
      }
    },

    // =========================================================================
    // 9. 回声几何弹射枪 (Bouncy Blaster)
    // =========================================================================
    bouncy: {
      init() {
        this.score = 0;
        this.aimAngle = 45; // deg
        this.balls = [];
        this.targets = [
          { x: 180, y: 80, hp: 1, alive: true },
          { x: 70, y: 120, hp: 1, alive: true }
        ];
        this.shields = [
          { x: 150, y: 70, w: 6, h: 40 }
        ];
        this.ammo = 3;
      },
      onOk(snd) {
        if (this.ammo <= 0) return;
        this.ammo--;
        const rad = (this.aimAngle - 90) * Math.PI / 180;
        this.balls.push({
          x: 120, y: 295,
          vx: Math.cos(rad) * 380,
          vy: Math.sin(rad) * 380,
          bounces: 0
        });
        if (snd) snd.playShoot();
      },
      update(dt, keys, snd, fx) {
        const sec = dt / 1000;
        if (keys.up) this.aimAngle = Math.max(15, this.aimAngle - 55 * sec);
        if (keys.down) this.aimAngle = Math.min(165, this.aimAngle + 55 * sec);

        for (let i = this.balls.length - 1; i >= 0; i--) {
          const b = this.balls[i];
          b.x += b.vx * sec;
          b.y += b.vy * sec;

          // 墙壁反弹
          if (b.x < 10 || b.x > 230) {
            b.vx = -b.vx; b.bounces++;
            if (snd) snd.playBounce();
          }
          if (b.y < 10) {
            b.vy = -b.vy; b.bounces++;
            if (snd) snd.playBounce();
          }

          // 护盾反弹
          for (const s of this.shields) {
            if (b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h) {
              b.vx = -b.vx; b.bounces++;
              if (snd) snd.playHit();
            }
          }

          // 命中目标
          for (const t of this.targets) {
            if (t.alive && Math.hypot(b.x - t.x, b.y - t.y) < 18) {
              t.alive = false;
              this.score += 500;
              if (snd) snd.playExplode();
              if (fx) fx.floatText(t.x, t.y, 'HEADSHOT! +500', '#facc15');
            }
          }

          if (b.bounces > 10 || b.y > 320) {
            this.balls.splice(i, 1);
          }
        }
      },
      render(ctx) {
        // 暗夜特工场景
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 240, 320);

        // 激光预测虚线
        ctx.save();
        ctx.translate(120, 295);
        ctx.rotate((this.aimAngle - 90) * Math.PI / 180);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(0, -180);
        ctx.stroke();
        ctx.restore();

        // 绘制防弹护盾
        for (const s of this.shields) {
          ctx.fillStyle = '#64748b';
          ctx.fillRect(s.x, s.y, s.w, s.h);
        }

        // 绘制敌人
        for (const t of this.targets) {
          if (!t.alive) continue;
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
          ctx.fill();
        }

        // 绘制橡胶高弹球
        for (const b of this.balls) {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 特工主角
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(120, 310, 16, 0, Math.PI * 2);
        ctx.fill();

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('SCORE: ' + this.score + '  AMMO: ' + this.ammo, 8, 17);
      }
    }

  };

  // 挂载到全局 GAMES 对象
  if (!global.GAMES) global.GAMES = {};
  Object.assign(global.GAMES, NEW_GAMES);

})(typeof window !== 'undefined' ? window : this);
