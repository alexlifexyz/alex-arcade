// simulator/games-impl.js —— Alex Arcade 柜机玩法实现集合
(function(global) {
  'use strict';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function drawLetterBadge(ctx, x, y, letter) {
    const bob = Math.sin(Date.now() / 110) * 3;
    ctx.fillStyle = '#1a0508';
    ctx.fillRect(x - 10, y - 10 + bob, 20, 20);
    ctx.fillStyle = '#e11d2a';
    ctx.fillRect(x - 9, y - 9 + bob, 18, 18);
    ctx.fillStyle = '#fff7ed';
    ctx.fillRect(x - 7, y - 7 + bob, 14, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(letter, x, y + 5 + bob);
    ctx.textAlign = 'left';
  }

  function drawOver(ctx, title, score) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(18, 92, 204, 128);
    ctx.strokeStyle = '#f0c14b';
    ctx.strokeRect(18.5, 92.5, 203, 127);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(title, 120, 122);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('SCORE ' + score, 120, 148);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('OK TO RETRY', 120, 178);
    ctx.textAlign = 'left';
  }

  const GAMES = {
    // ==========================================
    // 1. 雷霆飞车：极速武装 (Thunder Racer HD)
    // ==========================================
    thunderracer: {
      init() {
        this.speed = 180;
        this.minSpeed = 120;
        this.maxSpeed = 260;
        this.shield = 100;
        this.nitro = 50;
        this.ammo = 8;
        this.nitroActive = false;
        this.score = 0;
        this.lane = 1;
        this.laneX = 0;
        this.targetX = 0;
        this.vehicles = [];
        this.missiles = [];
        this.items = [];
        this.distance = 0;
        this.dead = false;
        this.combo = 0;
        this.comboTimer = 0;
        this.shake = 0;
        this.invincible = 0;
        this.rechargeTimer = 0;
      },
      onOk(snd, fx) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        // 0ms 触底开火发射高爆飞弹
        this.fireMissile(snd, fx);
      },
      fireMissile(snd, fx) {
        if (this.dead) return;
        if (this.missiles.length < 8) {
          this.missiles.push({ x: this.laneX, z: 0.05, speed: 0.08, active: true });
          if (snd) snd.playMissile();
          if (this.ammo > 0) this.ammo--;
        }
      },
      triggerNitro(snd) {
        if (this.dead || this.nitro < 30) return;
        this.nitroActive = true;
        if (snd) snd.playNitro();
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        const k = dt / 16.6;
        this.distance += this.speed * 0.02 * k;

        // 弹药被动充能 (每 0.9s 自动充能 1 发，上限 8 发)
        this.rechargeTimer += dt;
        if (this.rechargeTimer > 900) {
          this.rechargeTimer = 0;
          if (this.ammo < 8) this.ammo++;
        }

        // 氮气充能与消耗
        if (keys.okHold) {
          if (!this.nitroActive && this.nitro >= 30) this.triggerNitro(snd);
        }
        if (this.nitroActive) {
          this.nitro -= 1.2 * k;
          this.speed = Math.min(320, this.speed + 3.0 * k);
          if (this.nitro <= 0) { this.nitro = 0; this.nitroActive = false; }
        } else {
          if (this.speed > 180) this.speed -= 1.0 * k;
        }

        // 车道切换
        if (keys.upEdge) { this.lane = Math.max(0, this.lane - 1); if (snd) snd.playClick(); }
        if (keys.downEdge) { this.lane = Math.min(2, this.lane + 1); if (snd) snd.playClick(); }
        const targets = [-0.65, 0.0, 0.65];
        this.targetX = targets[this.lane];
        this.laneX += (this.targetX - this.laneX) * 0.25 * k;

        if (this.invincible > 0) this.invincible -= dt;
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) this.combo = 0;
        }

        // 刷新前车
        if (Math.random() < 0.045 && this.vehicles.length < 5) {
          const l = Math.floor(Math.random() * 3);
          const types = ['police', 'fast', 'slow'];
          const t = types[Math.floor(Math.random() * types.length)];
          this.vehicles.push({
            type: t,
            lane: l,
            x: targets[l],
            z: 1.0,
            speed: t === 'police' ? 140 : (t === 'fast' ? 120 : 90),
            hp: t === 'police' ? 3 : 1,
            nearMissed: false
          });
        }

        // 前车推进与碰撞/擦车判定
        for (let i = this.vehicles.length - 1; i >= 0; i--) {
          const v = this.vehicles[i];
          const relSpeed = (this.speed - v.speed) / 100;
          v.z -= 0.015 * relSpeed * k;

          // 近身超车 (Near-Miss)
          if (!v.nearMissed && v.z < 0.12 && v.z > 0.02 && Math.abs(v.x - this.laneX) > 0.25 && Math.abs(v.x - this.laneX) < 0.8) {
            v.nearMissed = true;
            this.combo++;
            this.comboTimer = 1800;
            const pts = 200 * this.combo;
            this.score += pts;
            this.nitro = Math.min(100, this.nitro + 15);
            if (fx) {
              fx.floatText(120, 160, `NEAR-MISS x${this.combo}! +${pts}`, '#00e5ff');
              fx.burst(120, 200, 10, ['#00e5ff', '#ffd700']);
            }
            if (snd) snd.playCoin();
          }

          // 撞车判定
          if (v.z < 0.08 && v.z > 0.01 && Math.abs(v.x - this.laneX) < 0.35) {
            if (this.nitroActive) {
              // 氮气撞飞前车
              this.vehicles.splice(i, 1);
              this.score += 500;
              if (fx) { fx.burst(120, 220, 20, ['#ff0055', '#ff9900', '#fff']); fx.shake = 10; }
              if (snd) snd.playExplode(true);
              continue;
            } else if (this.invincible <= 0) {
              // 撞击扣损护盾
              this.shield -= (v.type === 'police' ? 35 : 20);
              this.invincible = 900;
              this.speed = Math.max(this.minSpeed, this.speed - 50);
              this.vehicles.splice(i, 1);
              if (fx) { fx.shake = 12; fx.burst(120, 220, 15, ['#ef4444', '#ffaa00']); }
              if (snd) snd.playHit();
              if (this.shield <= 0) {
                this.shield = 0;
                this.dead = true;
                if (snd) snd.playGameOver();
              }
              continue;
            }
          }

          if (v.z < -0.1) this.vehicles.splice(i, 1);
        }

        // 飞弹向前推进
        for (let i = this.missiles.length - 1; i >= 0; i--) {
          const m = this.missiles[i];
          m.z += m.speed * k;
          let hit = false;
          for (let j = this.vehicles.length - 1; j >= 0; j--) {
            const v = this.vehicles[j];
            if (Math.abs(v.z - m.z) < 0.08 && Math.abs(v.x - m.x) < 0.35) {
              v.hp--;
              hit = true;
              if (v.hp <= 0) {
                this.vehicles.splice(j, 1);
                this.score += 350;
                if (fx) fx.burst(120 + v.x * 90, 180, 16, ['#ffd700', '#ff3344', '#fff']);
                if (snd) snd.playExplode(false);
              } else {
                if (snd) snd.playHit();
              }
              break;
            }
          }
          if (hit || m.z > 1.1) this.missiles.splice(i, 1);
        }
      },
      render(ctx, frame) {
        // 透视公路渲染
        ctx.fillStyle = '#060a14';
        ctx.fillRect(0, 0, 240, 320);

        // 公路梯形地面
        ctx.fillStyle = '#1a2333';
        ctx.beginPath();
        ctx.moveTo(80, 40); ctx.lineTo(160, 40);
        ctx.lineTo(240, 320); ctx.lineTo(0, 320);
        ctx.closePath(); ctx.fill();

        // 斑马线与车道虚线
        const dashOffset = (frame * 10) % 32;
        ctx.fillStyle = '#ffd700';
        for (let y = 40; y < 320; y += 32) {
          const py = y + dashOffset;
          if (py < 320) {
            const w = 4;
            const progress = (py - 40) / 280;
            const lx1 = 120 - (20 + progress * 58);
            const lx2 = 120 + (20 + progress * 58);
            ctx.fillRect(lx1 - w/2, py, w, 14);
            ctx.fillRect(lx2 - w/2, py, w, 14);
          }
        }

        // 前方交通车辆
        for (const v of this.vehicles) {
          const depth = 1.0 - v.z;
          const y = 40 + depth * depth * 220;
          const halfW = 18 + depth * 80;
          const x = 120 + v.x * halfW;
          const w = 12 + depth * 28;
          const h = 10 + depth * 22;

          ctx.fillStyle = v.type === 'police' ? '#111' : (v.type === 'fast' ? '#ef4444' : '#f59e0b');
          ctx.fillRect(x - w/2, y - h/2, w, h);
          if (v.type === 'police') {
            ctx.fillStyle = (frame % 8 < 4) ? '#ff0033' : '#0066ff';
            ctx.fillRect(x - 3, y - h/2 - 2, 6, 3);
          }
        }

        // 飞弹
        ctx.fillStyle = '#00ffff';
        for (const m of this.missiles) {
          const depth = 1.0 - m.z;
          const y = 40 + depth * depth * 220;
          const halfW = 18 + depth * 80;
          const x = 120 + m.x * halfW;
          ctx.fillRect(x - 2, y - 6, 4, 10);
        }

        // 玩家赛车 (永不消失，撞毁展现战损起火残骸)
        const px = 120 + this.laneX * 95;
        const py = 240;

        if (this.dead) {
          // 战损起火残骸
          ctx.fillStyle = '#222';
          ctx.fillRect(px - 14, py - 12, 28, 24);
          ctx.fillStyle = '#ff3300';
          ctx.fillRect(px - 8 + (frame % 5), py - 14, 8, 8);
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(px + 2 - (frame % 4), py - 16, 6, 10);
        } else {
          // 尾焰
          const flameH = this.nitroActive ? 18 + (frame % 4) * 4 : 8 + (frame % 3) * 2;
          ctx.fillStyle = this.nitroActive ? '#00ffff' : '#ff5500';
          ctx.fillRect(px - 7, py + 16, 4, flameH);
          ctx.fillRect(px + 3, py + 16, 4, flameH);
        }

        // 4只车轮与流线车体
        ctx.fillStyle = '#111';
        ctx.fillRect(px - 16, py - 14, 4, 10);
        ctx.fillRect(px + 12, py - 14, 4, 10);
        ctx.fillRect(px - 17, py + 6, 5, 12);
        ctx.fillRect(px + 12, py + 6, 5, 12);

        const bodyColor = this.dead ? '#475569' : (this.nitroActive ? '#ff0055' : '#00e5ff');
        ctx.fillStyle = bodyColor;
        ctx.fillRect(px - 12, py - 16, 24, 32);
        ctx.fillRect(px - 6, py - 20, 12, 6);

        // 挡风玻璃
        ctx.fillStyle = '#0b1626';
        ctx.fillRect(px - 6, py - 6, 12, 12);
        ctx.fillStyle = this.dead ? '#1e293b' : '#38bdf8';
        ctx.fillRect(px - 4, py - 4, 8, 3);

        // 尾翼
        ctx.fillStyle = this.dead ? '#334155' : '#ffd700';
        ctx.fillRect(px - 14, py + 12, 28, 4);

        // 受创无敌力场圈
        if (!this.dead && this.invincible > 0 && Math.floor(this.invincible / 100) % 2 === 0) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - 18, py - 22, 36, 42);
        }

        // 顶部 HUD (防遮挡安全边距布局)
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`SCORE:${this.score}`, 12, 18);
        ctx.fillStyle = this.nitroActive ? '#00ffff' : '#22c55e';
        ctx.fillText(`${Math.floor(this.speed)}KM/H`, 95, 18);
        ctx.fillStyle = this.shield > 30 ? '#38bdf8' : '#ef4444';
        ctx.fillText(`HP:${this.shield}%`, 172, 18);

        // 死亡弹窗
        if (this.dead) {
          ctx.fillStyle = 'rgba(10,5,5,0.9)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.fillRect(25, 110, 190, 80);
          ctx.strokeRect(25, 110, 190, 80);
          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('CAR CRASHED!', 120, 140);
          ctx.fillStyle = '#fff';
          ctx.font = '11px monospace';
          ctx.fillText('Press OK to Respawn', 120, 164);
          ctx.textAlign = 'left';
        }
      }
    },

    // ==========================================
    // 2. 雷霆战机：大像素版 (Thunder Striker HD)
    // ==========================================
    thunder: {
      init() {
        this.player = {
          x: 105,
          y: 260,
          w: 30,
          h: 28,
          hp: 5,
          maxHp: 5,
          shield: 0,         // 离子护盾 (0~2)
          bombs: 2,          // 全屏核弹
          weaponLevel: 0,    // 0: 平民经典双发机枪; 拾取法宝限时强化!
          weaponStyle: 'vulcan', // 'vulcan' | 'wave' | 'fire'
          hasWingman: false, // 双子浮游僚机卫星
          buffTimer: 0,      // 限时法宝倒计时 (ticks)
          combo: 0,
          comboTimer: 0,
          invincibleTimer: 0,
          shootTimer: 0,
          speed: 3.8
        };
        this.stars = [];
        for (let i = 0; i < 36; i++) {
          this.stars.push({
            x: Math.random() * 240,
            y: Math.random() * 320,
            s: 0.8 + Math.random() * 2.5,
            c: Math.random() > 0.5 ? '#00e5ff' : '#ffffff'
          });
        }
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.items = [];
        this.score = 0;
        this.dead = false;
        this.boss = null;
        this.waveTick = 0;
        this.flashTimer = 0;
      },
      onOk(snd, fx) {
        if (this.dead) {
          this.init();
          if (snd) snd.playClick();
          return;
        }
        // 释放全屏核弹 [B]
        if (this.player.bombs > 0) {
          this.player.bombs--;
          this.flashTimer = 10;
          if (snd) {
            if (snd.playBomb) snd.playBomb();
            else snd.playExplode(true);
          }
          if (fx) {
            fx.shake = 22;
            fx.burst(120, 160, 45, ['#00e5ff', '#ffd700', '#ff0055', '#ffffff']);
            fx.text(120, 150, 'SUPER BOMB!!', '#ff0055');
          }
          // 清空敌机所有子弹
          this.enemyBullets = [];
          // 对全体敌机造成重创
          for (const e of this.enemies) {
            e.hp -= 12;
            if (fx) fx.burst(e.x + e.w / 2, e.y + e.h / 2, 16, ['#ff3344', '#ffea00']);
            if (e.hp <= 0) {
              this.score += (e.type === 'fortress' ? 120 : 60);
            }
          }
          this.enemies = this.enemies.filter(e => e.hp > 0);
          if (this.boss) {
            this.boss.hp -= 20;
            if (fx) fx.burst(this.boss.x + this.boss.w / 2, this.boss.y + this.boss.h / 2, 35, ['#ff0055', '#ffd700']);
            if (this.boss.hp <= 0) {
              this.score += 2500;
              this.boss = null;
            }
          }
        }
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        const k = dt / 16.6;
        const p = this.player;
        this.waveTick++;

        if (this.flashTimer > 0) this.flashTimer--;
        if (p.invincibleTimer > 0) p.invincibleTimer -= dt;
        if (p.comboTimer > 0) {
          p.comboTimer -= dt;
          if (p.comboTimer <= 0) p.combo = 0;
        }

        // 限时强化武器法宝倒计时 (10秒 = 约600帧/10000ms)
        if (p.buffTimer > 0) {
          p.buffTimer -= dt;
          if (p.buffTimer <= 0) {
            p.weaponLevel = 0;
            p.weaponStyle = 'vulcan';
            p.hasWingman = false;
            if (fx) fx.text(p.x + 15, p.y - 10, 'BUFF EXPIRED', '#94a3b8');
          }
        }

        // 1. 星空滚动
        for (const s of this.stars) {
          s.y += s.s * k;
          if (s.y > 320) {
            s.y = 0;
            s.x = Math.random() * 240;
          }
        }

        // 2. 玩家4向机动移动
        if (keys.left || (keys.up && !keys.down && !keys.left && !keys.right)) {
          p.x -= p.speed * k;
        }
        if (keys.right || (keys.down && !keys.up && !keys.left && !keys.right)) {
          p.x += p.speed * k;
        }
        // 当按键包含明确上下时支持纵深机动
        if (keys.up && (keys.left || keys.right)) p.y -= (p.speed * 0.9) * k;
        if (keys.down && (keys.left || keys.right)) p.y += (p.speed * 0.9) * k;
        p.x = clamp(p.x, 4, 240 - p.w - 4);
        p.y = clamp(p.y, 45, 275);

        // 3. 玩家自动开火
        p.shootTimer += dt;
        const shootInterval = (p.weaponLevel > 0) ? 130 : 160;
        if (p.shootTimer >= shootInterval) {
          p.shootTimer = 0;

          if (p.weaponLevel === 0) {
            // 平民基础机枪：双发细光 (伤害 1)
            this.bullets.push({ x: p.x + 6, y: p.y - 2, w: 3, h: 10, vy: -9.5, dmg: 1, color: '#00e5ff' });
            this.bullets.push({ x: p.x + 20, y: p.y - 2, w: 3, h: 10, vy: -9.5, dmg: 1, color: '#00e5ff' });
            if (snd) snd.playLaser();
          } else if (p.weaponStyle === 'wave') {
            // 限时法宝 [W]：幻影 S 型正弦蛇形波刃 (S弯全屏舞动，穿甲)
            this.bullets.push({ x: p.x + 8, y: p.y - 2, w: 6, h: 12, vy: -9.0, dmg: 3, color: '#00ffcc', traj: 'wave', phase: 0, baseX: p.x + 8 });
            this.bullets.push({ x: p.x + 18, y: p.y - 2, w: 6, h: 12, vy: -9.0, dmg: 3, color: '#00ffcc', traj: 'wave', phase: Math.PI, baseX: p.x + 18 });
            this.bullets.push({ x: p.x + 2, y: p.y, w: 5, h: 10, vy: -8.5, dmg: 2, color: '#88ff00', traj: 'wave', phase: Math.PI * 0.5, baseX: p.x + 2 });
            this.bullets.push({ x: p.x + 24, y: p.y, w: 5, h: 10, vy: -8.5, dmg: 2, color: '#88ff00', traj: 'wave', phase: Math.PI * 1.5, baseX: p.x + 24 });
            if (snd) {
              if (snd.playWave) snd.playWave();
              else snd.playLaser();
            }
          } else if (p.weaponStyle === 'fire') {
            // 限时法宝 [F]：炼狱爆轰烈焰火球 (狂暴火球贯穿破甲)
            this.bullets.push({ x: p.x + 11, y: p.y - 4, w: 8, h: 12, vy: -8.5, dmg: 4, color: '#ff3300', traj: 'fire', piercing: true });
            this.bullets.push({ x: p.x + 3, y: p.y - 1, w: 6, h: 10, vy: -8.0, vx: -0.8, dmg: 2, color: '#ff6600', traj: 'fire' });
            this.bullets.push({ x: p.x + 21, y: p.y - 1, w: 6, h: 10, vy: -8.0, vx: 0.8, dmg: 2, color: '#ff6600', traj: 'fire' });
            if (snd) {
              if (snd.playFire) snd.playFire();
              else snd.playLaser();
            }
          } else {
            // 限时法宝 [P]：超能突击神火激光 (扇形 4 连发巨炮)
            this.bullets.push({ x: p.x + 10, y: p.y - 3, w: 5, h: 14, vy: -10.0, vx: -0.4, dmg: 3, color: '#ffea00' });
            this.bullets.push({ x: p.x + 16, y: p.y - 3, w: 5, h: 14, vy: -10.0, vx: 0.4, dmg: 3, color: '#ffea00' });
            this.bullets.push({ x: p.x + 2, y: p.y, w: 4, h: 12, vy: -9.5, vx: -1.6, dmg: 2, color: '#00e5ff' });
            this.bullets.push({ x: p.x + 24, y: p.y, w: 4, h: 12, vy: -9.5, vx: 1.6, dmg: 2, color: '#00e5ff' });
            if (snd) snd.playLaser();
          }

          // 双子浮游僚机卫星协同开火
          if (p.hasWingman) {
            this.bullets.push({ x: p.x - 10, y: p.y + 8, w: 3, h: 8, vy: -9.5, vx: -0.8, dmg: 1, color: '#00e5ff' });
            this.bullets.push({ x: p.x + 36, y: p.y + 8, w: 3, h: 8, vy: -9.5, vx: 0.8, dmg: 1, color: '#00e5ff' });
          }
        }

        // 4. 玩家子弹移动
        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const b = this.bullets[i];
          b.y += b.vy * k;
          if (b.traj === 'wave') {
            b.phase = (b.phase || 0) + 0.32 * k;
            b.baseX = (b.baseX || b.x) + (b.vx || 0) * k;
            b.x = b.baseX + Math.sin(b.phase) * 18;
          } else if (b.vx) {
            b.x += b.vx * k;
          }
          if (b.y < -20 || b.x < -20 || b.x > 260) {
            this.bullets.splice(i, 1);
          }
        }

        // 5. 敌机子弹移动与碰撞玩家
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
          const eb = this.enemyBullets[i];
          eb.x += eb.vx * k;
          eb.y += eb.vy * k;
          if (eb.y > 330 || eb.x < -10 || eb.x > 250) {
            this.enemyBullets.splice(i, 1);
            continue;
          }
          // 击中玩家判定
          if (p.invincibleTimer <= 0 &&
              eb.x < p.x + p.w - 4 && eb.x + eb.w > p.x + 4 &&
              eb.y < p.y + p.h - 4 && eb.y + eb.h > p.y + 4) {
            this.enemyBullets.splice(i, 1);
            if (p.shield > 0) {
              p.shield--;
              p.invincibleTimer = 900;
              if (snd) {
                if (snd.playShield) snd.playShield();
                else snd.playHit();
              }
              if (fx) {
                fx.shake = 8;
                fx.burst(p.x + p.w / 2, p.y + p.h / 2, 16, ['#00e5ff', '#88ffff', '#ffffff']);
                fx.text(p.x + 15, p.y - 12, 'SHIELD BLOCK!', '#00e5ff');
              }
            } else {
              p.hp--;
              p.invincibleTimer = 1100;
              if (snd) snd.playHit();
              if (fx) {
                fx.shake = 12;
                fx.burst(p.x + p.w / 2, p.y + p.h / 2, 18, ['#ff3344', '#ffaa00']);
              }
              if (p.hp <= 0) {
                this.dead = true;
                if (snd) snd.playGameOver();
              }
            }
          }
        }

        // 6. 掉落法宝道具推进与拾取
        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          it.y += 1.4 * k;
          if (it.y > 330) {
            this.items.splice(i, 1);
            continue;
          }
          // 拾取碰撞
          if (it.x < p.x + p.w && it.x + it.w > p.x &&
              it.y < p.y + p.h && it.y + it.h > p.y) {
            this.items.splice(i, 1);
            if (snd) snd.playPowerup();
            this.score += 50;

            if (it.type === 'P') {
              p.weaponStyle = 'vulcan';
              p.weaponLevel = 2;
              p.hasWingman = true;
              p.buffTimer = 12000;
              if (fx) { fx.text(p.x + 15, p.y - 14, '突击神火 [P] !!', '#ffea00'); fx.burst(p.x + 15, p.y, 15, ['#ffea00', '#fff']); }
            } else if (it.type === 'W') {
              p.weaponStyle = 'wave';
              p.weaponLevel = 2;
              p.hasWingman = true;
              p.buffTimer = 12000;
              if (fx) { fx.text(p.x + 15, p.y - 14, '幻影波动 [W] !!', '#00ffcc'); fx.burst(p.x + 15, p.y, 15, ['#00ffcc', '#fff']); }
            } else if (it.type === 'F') {
              p.weaponStyle = 'fire';
              p.weaponLevel = 2;
              p.hasWingman = false;
              p.buffTimer = 12000;
              if (fx) { fx.text(p.x + 15, p.y - 14, '炼狱烈焰 [F] !!', '#ff3300'); fx.burst(p.x + 15, p.y, 15, ['#ff3300', '#ffea00']); }
            } else if (it.type === 'S') {
              if (p.shield < 2) p.shield++;
              if (fx) { fx.text(p.x + 15, p.y - 14, '离子护盾 [S] +1', '#00bfff'); fx.burst(p.x + 15, p.y, 15, ['#00e5ff', '#fff']); }
            } else if (it.type === 'B') {
              p.bombs++;
              if (fx) { fx.text(p.x + 15, p.y - 14, '核弹补给 [B] +1', '#ff0055'); fx.burst(p.x + 15, p.y, 15, ['#ff0055', '#fff']); }
            } else if (it.type === 'H') {
              if (p.hp < p.maxHp) p.hp++;
              if (fx) { fx.text(p.x + 15, p.y - 14, '机身维修 [H] +1', '#22c55e'); fx.burst(p.x + 15, p.y, 15, ['#22c55e', '#fff']); }
            }
          }
        }

        // 7. 生成敌机编队
        if (!this.boss && (this.waveTick % 45 === 0) && this.enemies.length < 6) {
          const r = Math.random();
          let type = 'falcon';
          let w = 26, h = 24, hp = 2, vy = 2.2;
          if (r < 0.4) {
            type = 'falcon'; // 烈隼三角隐形战机
            w = 26; h = 24; hp = 2; vy = 2.4;
          } else if (r < 0.75) {
            type = 'wyvern'; // 幻翼机械飞龙 (扇翅动态)
            w = 32; h = 28; hp = 4; vy = 1.8;
          } else {
            type = 'fortress'; // 空中巡洋堡垒 (厚血重舰)
            w = 36; h = 30; hp = 6; vy = 1.2;
          }
          this.enemies.push({
            type,
            x: 15 + Math.random() * (240 - w - 30),
            y: -35,
            w, h, hp, maxHp: hp,
            vy,
            vx: (Math.random() - 0.5) * 1.2,
            shootTimer: 25 + Math.floor(Math.random() * 40),
            animTick: Math.floor(Math.random() * 20)
          });
        }

        // 8. 召唤星海利维坦巨型龙神 BOSS
        if (!this.boss && this.score >= 280 && this.waveTick > 300) {
          this.boss = {
            type: 'boss',
            x: 86,
            y: -55,
            targetY: 36,
            w: 68,
            h: 50,
            hp: 60,
            maxHp: 60,
            vx: 1.4,
            vy: 0.9,
            shootTimer: 35,
            animTick: 0
          };
          if (fx) {
            fx.shake = 16;
            fx.text(120, 100, 'WARNING: LEVIATHAN BOSS!', '#ff0055');
          }
        }

        // BOSS 行为
        if (this.boss) {
          const b = this.boss;
          b.animTick++;
          if (b.y < b.targetY) b.y += b.vy * k;
          b.x += b.vx * k;
          if (b.x < 10 || b.x > 240 - b.w - 10) b.vx = -b.vx;

          b.shootTimer--;
          if (b.shootTimer <= 0 && b.y >= b.targetY) {
            b.shootTimer = 38;
            // 4 发散射弹幕
            const spreads = [-1.4, -0.5, 0.5, 1.4];
            for (const sp of spreads) {
              this.enemyBullets.push({
                x: b.x + b.w / 2 - 3,
                y: b.y + b.h - 4,
                w: 6, h: 6,
                vx: sp, vy: 2.8
              });
            }
          }
        }

        // 9. 敌机逻辑与射击
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          e.animTick++;
          e.x += e.vx * k;
          e.y += e.vy * k;
          if (e.x < 4 || e.x > 240 - e.w - 4) e.vx = -e.vx;

          // 敌机开火
          e.shootTimer--;
          if (e.shootTimer <= 0 && e.y > 10 && e.y < 230) {
            if (e.type === 'wyvern') {
              e.shootTimer = 55;
              this.enemyBullets.push({
                x: e.x + e.w / 2 - 3,
                y: e.y + e.h,
                w: 6, h: 6,
                vx: (p.x > e.x ? 0.9 : -0.9),
                vy: 2.6
              });
            } else {
              e.shootTimer = 65;
              this.enemyBullets.push({
                x: e.x + e.w / 2 - 2,
                y: e.y + e.h,
                w: 5, h: 5,
                vx: 0,
                vy: 2.5
              });
            }
          }

          // 碰撞玩家
          if (p.invincibleTimer <= 0 &&
              e.x < p.x + p.w && e.x + e.w > p.x &&
              e.y < p.y + p.h && e.y + e.h > p.y) {
            if (p.shield > 0) {
              p.shield--;
              p.invincibleTimer = 900;
              if (snd) snd.playHit();
              if (fx) {
                fx.shake = 10;
                fx.burst(p.x + p.w / 2, p.y + p.h / 2, 16, ['#00e5ff', '#fff']);
                fx.text(p.x + 15, p.y - 12, 'SHIELD ABSORB!', '#00e5ff');
              }
            } else {
              p.hp--;
              p.invincibleTimer = 1100;
              if (snd) snd.playHit();
              if (fx) {
                fx.shake = 14;
                fx.burst(p.x + p.w / 2, p.y + p.h / 2, 16, ['#ff3344', '#ffaa00']);
              }
              if (p.hp <= 0) {
                this.dead = true;
                if (snd) snd.playGameOver();
              }
            }
            e.hp -= 3;
            if (e.hp <= 0) {
              this.enemies.splice(i, 1);
              continue;
            }
          }

          if (e.y > 330) {
            this.enemies.splice(i, 1);
            continue;
          }

          // 玩家子弹命中敌机
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            const b = this.bullets[j];
            if (b.x < e.x + e.w && b.x + b.w > e.x &&
                b.y < e.y + e.h && b.y + b.h > e.y) {
              if (!b.piercing) this.bullets.splice(j, 1);
              e.hp -= (b.dmg || 1);
              if (snd) snd.playHit();

              if (e.hp <= 0) {
                this.enemies.splice(i, 1);
                p.combo++;
                p.comboTimer = 2200;
                const mult = p.combo > 8 ? 3 : (p.combo > 3 ? 2 : 1);
                const baseScore = e.type === 'fortress' ? 40 : (e.type === 'wyvern' ? 30 : 20);
                this.score += baseScore * mult;

                if (fx) {
                  const colors = e.type === 'wyvern' ? ['#aa00ff', '#ff00aa', '#ffffff'] : ['#ffaa00', '#ffd700', '#ffffff'];
                  fx.burst(e.x + e.w / 2, e.y + e.h / 2, 18, colors);
                  if (mult > 1) fx.text(e.x + e.w / 2, e.y, `${p.combo} COMBO! x${mult}`, '#ffea00');
                }
                if (snd) snd.playExplode(e.type === 'fortress');

                // 40% 几率掉落 6 种法宝道具之一
                if (Math.random() < 0.42) {
                  const dice = Math.random();
                  let itType = 'P';
                  if (dice < 0.26) itType = 'P';
                  else if (dice < 0.48) itType = 'W';
                  else if (dice < 0.68) itType = 'F';
                  else if (dice < 0.82) itType = 'S';
                  else if (dice < 0.92) itType = 'B';
                  else itType = 'H';

                  this.items.push({
                    type: itType,
                    x: e.x + e.w / 2 - 7,
                    y: e.y,
                    w: 14, h: 14
                  });
                }
                break;
              }
            }
          }
        }

        // 10. 玩家子弹打击 BOSS
        if (this.boss) {
          const b = this.boss;
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            const pb = this.bullets[j];
            if (pb.x < b.x + b.w && pb.x + pb.w > b.x &&
                pb.y < b.y + b.h && pb.y + pb.h > b.y) {
              if (!pb.piercing) this.bullets.splice(j, 1);
              b.hp -= (pb.dmg || 1);
              if (snd) snd.playHit();
              if (b.hp <= 0) {
                this.score += 2500;
                if (fx) {
                  fx.shake = 24;
                  fx.burst(b.x + b.w / 2, b.y + b.h / 2, 50, ['#ff0055', '#ffd700', '#00e5ff', '#ffffff']);
                  fx.text(120, 140, 'BOSS DESTROYED!!', '#ffd700');
                }
                if (snd) snd.playExplode(true);
                this.boss = null;
                break;
              }
            }
          }
        }
      },
      render(ctx, frame, fx) {
        // 全屏核弹白光
        if (this.flashTimer > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 240, 320);
          return;
        }

        // 深邃星空背景
        ctx.fillStyle = '#060814';
        ctx.fillRect(0, 0, 240, 320);

        // 星空滚动
        for (const s of this.stars) {
          ctx.fillStyle = s.c;
          ctx.fillRect(s.x, s.y, s.s > 2 ? 2 : 1, s.s > 2 ? 2 : 1);
        }

        const p = this.player;

        // 绘制子弹 (三大流派武器特效)
        for (const b of this.bullets) {
          if (b.traj === 'wave') {
            // S型波动刃：霓虹碧翠外缘 + 亮白晶核
            ctx.fillStyle = '#00ffcc';
            ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(b.x, b.y, b.w, b.h);
          } else if (b.traj === 'fire') {
            // 炼狱火球：外圈烈红 + 内层炽黄
            ctx.fillStyle = '#ff2200';
            ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
            ctx.fillStyle = '#ffea00';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(b.x + 2, b.y + 2, Math.max(2, b.w - 4), Math.max(2, b.h - 4));
          } else {
            // 直线激光
            ctx.fillStyle = b.color || '#ffea00';
            ctx.fillRect(b.x, b.y, b.w, b.h);
          }
        }

        // 绘制敌机子弹 (发光红光弹)
        for (const eb of this.enemyBullets) {
          ctx.fillStyle = '#ff2255';
          ctx.fillRect(eb.x - 1, eb.y - 1, eb.w + 2, eb.h + 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(eb.x, eb.y, eb.w, eb.h);
        }

        // 绘制掉落法宝道具 [P] [W] [F] [S] [B] [H]
        for (const it of this.items) {
          let col = '#ffd928';
          if (it.type === 'P') col = '#ffd928';
          else if (it.type === 'W') col = '#00ffcc';
          else if (it.type === 'F') col = '#ff4400';
          else if (it.type === 'S') col = '#00bfff';
          else if (it.type === 'B') col = '#ff2255';
          else if (it.type === 'H') col = '#22c55e';

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(it.x, it.y, 14, 14);
          ctx.fillStyle = col;
          ctx.fillRect(it.x + 2, it.y + 2, 10, 10);
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(it.type, it.x + 7, it.y + 10);
        }
        ctx.textAlign = 'left';

        // 绘制普通敌机
        for (const e of this.enemies) {
          if (e.type === 'falcon') {
            // 烈隼三角隐形战机
            ctx.fillStyle = '#00e5ff';
            ctx.fillRect(e.x + 11, e.y, 4, 16);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(e.x + 4, e.y + 8, 18, 8);
            ctx.fillStyle = '#334155';
            ctx.fillRect(e.x, e.y + 14, 26, 6);
            // 翼尖导弹
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x, e.y + 12, 2, 6);
            ctx.fillRect(e.x + 24, e.y + 12, 2, 6);
          } else if (e.type === 'wyvern') {
            // 幻翼机械飞龙 (动态扇翅扑动)
            const flap = (Math.floor(e.animTick / 6) % 2 === 0);
            ctx.fillStyle = '#9333ea';
            ctx.fillRect(e.x + 13, e.y + 2, 6, 12);
            ctx.fillStyle = '#ec4899';
            ctx.fillRect(e.x + 14, e.y + 4, 4, 4);
            if (flap) {
              ctx.fillStyle = '#a855f7';
              ctx.fillRect(e.x + 2, e.y + 2, 12, 6);
              ctx.fillRect(e.x + 18, e.y + 2, 12, 6);
              ctx.fillStyle = '#7e22ce';
              ctx.fillRect(e.x, e.y + 6, 32, 6);
            } else {
              ctx.fillStyle = '#a855f7';
              ctx.fillRect(e.x + 4, e.y + 10, 24, 6);
              ctx.fillStyle = '#7e22ce';
              ctx.fillRect(e.x, e.y + 14, 32, 6);
            }
            // 飞龙小血条
            ctx.fillStyle = '#000';
            ctx.fillRect(e.x + 4, e.y - 5, 24, 3);
            ctx.fillStyle = '#d946ef';
            ctx.fillRect(e.x + 4, e.y - 5, (e.hp / e.maxHp) * 24, 3);
          } else {
            // 空中巡洋堡垒
            ctx.fillStyle = '#475569';
            ctx.fillRect(e.x + 6, e.y, 24, 24);
            ctx.fillStyle = '#334155';
            ctx.fillRect(e.x, e.y + 10, 36, 12);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(e.x + 14, e.y + 8, 8, 6);
            // 堡垒血条
            ctx.fillStyle = '#000';
            ctx.fillRect(e.x + 6, e.y - 5, 24, 3);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x + 6, e.y - 5, (e.hp / e.maxHp) * 24, 3);
          }
        }

        // 绘制星海利维坦 BOSS
        if (this.boss) {
          const b = this.boss;
          const flap = (Math.floor(b.animTick / 10) % 2 === 0);
          ctx.fillStyle = '#311042';
          ctx.fillRect(b.x + 24, b.y, 20, 44);
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(b.x + 28, b.y + 8, 12, 16);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(b.x + 31, b.y + 12, 6, 8);

          // 龙神巨翼
          if (flap) {
            ctx.fillStyle = '#6b21a8';
            ctx.fillRect(b.x + 4, b.y + 8, 60, 16);
            ctx.fillStyle = '#9333ea';
            ctx.fillRect(b.x, b.y + 14, 68, 12);
          } else {
            ctx.fillStyle = '#6b21a8';
            ctx.fillRect(b.x + 6, b.y + 16, 56, 18);
            ctx.fillStyle = '#9333ea';
            ctx.fillRect(b.x, b.y + 22, 68, 12);
          }
          // 龙头主炮与两翼能量晶柱
          ctx.fillStyle = '#00e5ff';
          ctx.fillRect(b.x + 28, b.y + 36, 12, 10);
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(b.x + 8, b.y + 26, 6, 8);
          ctx.fillRect(b.x + 54, b.y + 26, 6, 8);

          // 顶部全幅 BOSS 血条
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(20, 32, 200, 7);
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(20, 32, Math.max(0, (b.hp / b.maxHp) * 200), 7);
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 1;
          ctx.strokeRect(20, 32, 200, 7);
        }

        // 绘制玩家战机
        if (!this.dead) {
          const flash = (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 100) % 2 === 0);
          if (!flash) {
            // 双尾喷射火焰动画
            const flameH = 6 + (Math.floor(frame / 4) % 3) * 3;
            ctx.fillStyle = '#ff9900';
            ctx.fillRect(p.x + 9, p.y + 26, 4, flameH);
            ctx.fillRect(p.x + 17, p.y + 26, 4, flameH);
            ctx.fillStyle = '#ffea00';
            ctx.fillRect(p.x + 10, p.y + 26, 2, flameH - 2);
            ctx.fillRect(p.x + 18, p.y + 26, 2, flameH - 2);

            // 主机身掠翼
            ctx.fillStyle = '#0077aa';
            ctx.fillRect(p.x + 11, p.y + 2, 8, 24);
            ctx.fillStyle = '#00e5ff';
            ctx.fillRect(p.x + 13, p.y, 4, 16);
            ctx.fillStyle = '#00aacc';
            ctx.fillRect(p.x + 2, p.y + 14, 26, 8);
            ctx.fillRect(p.x, p.y + 18, 30, 6);

            // 翼尖金色双联主炮
            ctx.fillStyle = '#ffd928';
            ctx.fillRect(p.x, p.y + 12, 3, 6);
            ctx.fillRect(p.x + 27, p.y + 12, 3, 6);

            // 晶透橙座舱盖高光
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(p.x + 12, p.y + 8, 6, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(p.x + 14, p.y + 9, 2, 4);

            // 双子浮游僚机卫星
            if (p.hasWingman) {
              const lwy = p.y + 8 + (Math.floor(frame / 6) % 3);
              const rwy = p.y + 8 + ((Math.floor(frame / 6) + 1) % 3);
              // 左僚机
              ctx.fillStyle = '#00e5ff';
              ctx.fillRect(p.x - 12, lwy, 6, 6);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(p.x - 10, lwy + 2, 2, 2);
              // 右僚机
              ctx.fillStyle = '#00e5ff';
              ctx.fillRect(p.x + 36, rwy, 6, 6);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(p.x + 38, rwy + 2, 2, 2);
            }

            // 离子护盾等离子呼吸力场光环
            if (p.shield > 0) {
              ctx.strokeStyle = (Math.floor(frame / 5) % 2 === 0) ? '#00e5ff' : '#88ffff';
              ctx.lineWidth = 2;
              ctx.strokeRect(p.x - 5, p.y - 5, p.w + 10, p.h + 10);
            }
          }
        }

        // 顶部 HUD
        ctx.fillStyle = 'rgba(6,8,20,0.88)';
        ctx.fillRect(0, 0, 240, 28);
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`SCORE:${this.score}`, 8, 18);

        // 生命红心
        for (let i = 0; i < p.maxHp; i++) {
          ctx.fillStyle = (i < p.hp) ? '#ef4444' : '#334155';
          ctx.fillRect(115 + i * 9, 11, 7, 7);
        }

        // 护盾指示
        if (p.shield > 0) {
          ctx.fillStyle = '#00e5ff';
          ctx.fillText(`🛡️${p.shield}`, 165, 18);
        }

        // 核弹指示
        ctx.fillStyle = '#ff0055';
        ctx.fillText(`💣${p.bombs}`, 200, 18);

        // 限时强化武器倒计时微条
        if (p.buffTimer > 0) {
          const ratio = p.buffTimer / 12000;
          ctx.fillStyle = '#ffea00';
          ctx.fillRect(0, 27, 240 * ratio, 2);
        }

        // 死亡画面
        if (this.dead) {
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(25, 105, 190, 95);
          ctx.fillStyle = '#ff3344';
          ctx.font = 'bold 16px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('STRIKER DOWN!', 120, 138);
          ctx.fillStyle = '#ffd700';
          ctx.font = '12px monospace';
          ctx.fillText(`FINAL SCORE: ${this.score}`, 120, 160);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '11px monospace';
          ctx.fillText('Press OK to Deploy Again', 120, 182);
          ctx.textAlign = 'left';
        }
      }
    },

    // ==========================================
    // Battle City Neo (1990)
    // ==========================================
    battlecity: {
      init() {
        this.cols = 15; this.rows = 17; this.tSize = 16;
        this.map = [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,1,0,1,0,1,0,2,0,1,0,1,0,1,0],
          [0,1,0,1,0,1,0,2,0,1,0,1,0,1,0],
          [0,1,0,1,0,1,0,0,0,1,0,1,0,1,0],
          [0,1,0,1,0,1,0,0,0,1,0,1,0,1,0],
          [0,2,0,2,0,3,3,3,3,3,0,2,0,2,0],
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [1,1,0,4,4,0,1,1,1,0,4,4,0,1,1],
          [1,1,0,4,4,0,1,0,1,0,4,4,0,1,1],
          [0,0,0,0,0,0,1,0,1,0,0,0,0,0,0],
          [0,1,0,1,1,0,0,0,0,0,1,1,0,1,0],
          [0,1,0,1,1,0,5,5,5,0,1,1,0,1,0],
          [0,1,0,0,0,0,5,5,5,0,0,0,0,1,0],
          [0,2,0,1,1,0,0,0,0,0,1,1,0,2,0],
          [0,0,0,1,1,0,1,1,1,0,1,1,0,0,0],
          [0,0,0,0,0,0,1,6,1,0,0,0,0,0,0],
          [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0]
        ];
        this.sub = Array.from({ length: 17 }, (v, r) =>
          Array.from({ length: 15 }, (vv, c) => this.map[r][c] === 1 ? 0x0F : 0)
        );
        this.p = {
          x: 4 * 16 + 1, y: 15 * 16 + 1, dir: 0, tier: 1, speed: 2,
          lives: 3, score: 0, inv: 90, cooldown: 0, moving: false, anim: 0, autoFire: false
        };
        this.enemies = []; this.bullets = []; this.items = [];
        this.enemiesLeft = 16; this.spawnTimer = 25; this.freezeTimer = 0;
        this.shovelTimer = 0; this.baseAlive = true; this.dead = false; this.win = false;
        this.ticks = 0; this.lastOkTime = 0; this.score = 0;
      },
      onOk(snd, fx) {
        if (this.dead || this.win) { this.init(); if (snd) snd.playClick(); return; }
        const now = Date.now();
        if (now - this.lastOkTime < 280) {
          this.p.autoFire = !this.p.autoFire;
          if (fx) fx.float(this.p.x, this.p.y + 10, this.p.autoFire ? 'AUTO ON' : 'AUTO OFF', '#ffd928');
        }
        this.lastOkTime = now;
        this.fire(this.p, true, 1, snd);
      },
      fire(tank, isPlayer, id, snd) {
        if (tank.cooldown > 0) return;
        const count = this.bullets.filter(b => b.fromPlayer === isPlayer && b.owner === id).length;
        const maxAllowed = isPlayer ? (tank.tier >= 3 ? 2 : 1) : 1;
        if (count >= maxAllowed) return;
        const spd = isPlayer ? (tank.tier >= 2 ? 6 : 4) : (tank.type === 'power' ? 5.5 : 3.5);
        const pierce = isPlayer && tank.tier >= 4;
        let bx = tank.x + 7, by = tank.y + 7;
        if (tank.dir === 0) by = tank.y - 2;
        else if (tank.dir === 1) bx = tank.x + 16;
        else if (tank.dir === 2) by = tank.y + 16;
        else bx = tank.x - 2;
        this.bullets.push({ x: bx, y: by, dir: tank.dir, speed: spd, fromPlayer: isPlayer, owner: id, pierce });
        tank.cooldown = 12;
        if (isPlayer && snd) snd.playShoot(pierce ? 'laser' : 'normal');
      },
      checkBlocked(x, y, w, h, isBullet) {
        if (x < 0 || x + w > 240 || y < 0 || y + h > 272) return true;
        const c1 = Math.floor(x / 16), c2 = Math.floor((x + w - 1) / 16);
        const r1 = Math.floor(y / 16), r2 = Math.floor((y + h - 1) / 16);
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            if (r < 0 || r >= 17 || c < 0 || c >= 15) return true;
            const t = this.map[r][c];
            if (t === 0 || t === 4 || t === 5) continue;
            if (t === 3) { if (isBullet) continue; else return true; }
            if (t === 1) {
              const sub = this.sub[r][c];
              if (sub === 0) continue;
              const tx = c * 16, ty = r * 16;
              if ((sub & 1) && x < tx + 8 && x + w > tx && y < ty + 8 && y + h > ty) return true;
              if ((sub & 2) && x < tx + 16 && x + w > tx + 8 && y < ty + 8 && y + h > ty) return true;
              if ((sub & 4) && x < tx + 8 && x + w > tx && y < ty + 16 && y + h > ty + 8) return true;
              if ((sub & 8) && x < tx + 16 && x + w > tx + 8 && y < ty + 16 && y + h > ty + 8) return true;
              continue;
            }
            if (t === 2 || t === 6) return true;
          }
        }
        return false;
      },
      destroySubBrick(c, r, dir) {
        let sub = this.sub[r][c];
        if (!sub) { this.map[r][c] = 0; return; }
        if (dir === 0) {
          if (sub & 0x0C) sub &= ~0x0C; else sub &= ~0x03;
        } else if (dir === 2) {
          if (sub & 0x03) sub &= ~0x03; else sub &= ~0x0C;
        } else if (dir === 3) {
          if (sub & 0x0A) sub &= ~0x0A; else sub &= ~0x05;
        } else {
          if (sub & 0x05) sub &= ~0x05; else sub &= ~0x0A;
        }
        this.sub[r][c] = sub;
        if (sub === 0) this.map[r][c] = 0;
      },
      applyItem(type, snd, fx) {
        if (snd) snd.playPower();
        this.p.score += 500;
        this.score = this.p.score;
        if (type === 'star') {
          if (this.p.tier < 4) this.p.tier++;
          if (this.p.tier >= 2) this.p.speed = 2.5;
          if (fx) fx.float(this.p.x, this.p.y, 'UPGRADE', '#ffd928');
        } else if (type === 'bomb') {
          this.enemies.forEach(e => {
            this.p.score += 200;
            if (fx) fx.burst(e.x + 7, e.y + 31, 14, ['#ff4444', '#ffd928', '#ffffff']);
          });
          this.enemies = [];
          this.score = this.p.score;
          if (snd) snd.playExplode();
          if (fx) { fx.shake = 10; fx.float(120, 140, 'BOMB', '#ff4444'); }
        } else if (type === 'clock') {
          this.freezeTimer = 300;
          if (fx) fx.float(this.p.x, this.p.y, 'FROZEN', '#38bdf8');
        } else if (type === 'helmet') {
          this.p.inv = 300;
          if (fx) fx.float(this.p.x, this.p.y, 'SHIELD', '#00e5ff');
        } else if (type === 'shovel') {
          this.shovelTimer = 450;
          [[14,6],[14,7],[14,8],[15,6],[15,8],[16,6],[16,8]].forEach(([r, c]) => { this.map[r][c] = 2; });
          if (fx) fx.float(120, 240, 'STEEL', '#94a3b8');
        } else if (type === 'gun') {
          this.p.tier = 4; this.p.speed = 2.8;
          if (fx) fx.float(this.p.x, this.p.y, 'MAX', '#a855f7');
        } else if (type === 'life') {
          this.p.lives++;
          if (snd) snd.playEat();
          if (fx) fx.float(this.p.x, this.p.y, '1-UP', '#ec4899');
        }
      },
      spawnEnemy(fx) {
        if (this.enemiesLeft <= 0 || this.enemies.length >= 4) return;
        const pts = [0, 7, 13];
        const col = pts[(Math.random() * 3) | 0];
        const sx = col * 16, sy = 0;
        if (this.enemies.some(e => Math.abs(e.x - sx) < 16 && Math.abs(e.y - sy) < 16)) return;
        const r = Math.random();
        let type = 'basic', spd = 1.2, hp = 1;
        if (r < 0.35) { type = 'basic'; spd = 1.2; }
        else if (r < 0.65) { type = 'fast'; spd = 2.6; }
        else if (r < 0.85) { type = 'power'; spd = 1.8; }
        else { type = 'armor'; spd = 1.2; hp = 3; }
        const flashing = Math.random() < 0.28;
        this.enemies.push({
          x: sx, y: sy, dir: 2, type, speed: spd, hp, flashing,
          cooldown: 30, anim: 0, active: true
        });
        this.enemiesLeft--;
        if (fx) fx.burst(sx + 7, sy + 31, 8, ['#ffffff', '#00e5ff']);
      },
      snapTurn(axis) {
        const rem = axis % 16;
        if (rem <= 4) return axis - rem;
        if (rem >= 12) return axis + (16 - rem);
        return axis;
      },
      update(dt, keys, snd, fx) {
        if (this.dead || this.win) return;
        this.ticks++;
        if (this.shovelTimer > 0) {
          this.shovelTimer--;
          if (this.shovelTimer === 0) {
            [[14,6],[14,7],[14,8],[15,6],[15,8],[16,6],[16,8]].forEach(([r, c]) => {
              this.map[r][c] = 1; this.sub[r][c] = 0x0F;
            });
          }
        }
        if (this.freezeTimer > 0) this.freezeTimer--;

        if (keys.upEdge) {
          this.p.dir = (this.p.dir + 3) % 4;
          if (this.p.dir === 0 || this.p.dir === 2) this.p.x = this.snapTurn(this.p.x);
          else this.p.y = this.snapTurn(this.p.y);
        }
        if (keys.downEdge) {
          this.p.dir = (this.p.dir + 1) % 4;
          if (this.p.dir === 0 || this.p.dir === 2) this.p.x = this.snapTurn(this.p.x);
          else this.p.y = this.snapTurn(this.p.y);
        }

        const isDriving = keys.up || keys.down;
        this.p.moving = isDriving;
        if (isDriving) {
          this.p.anim ^= 1;
          let nx = this.p.x, ny = this.p.y;
          const s = this.p.speed;
          if (this.p.dir === 0) ny -= s;
          else if (this.p.dir === 1) nx += s;
          else if (this.p.dir === 2) ny += s;
          else nx -= s;
          if (!this.checkBlocked(nx, ny, 14, 14, false)) {
            this.p.x = nx; this.p.y = ny;
          }
        }

        if (this.p.cooldown > 0) this.p.cooldown--;
        if (this.p.inv > 0) this.p.inv--;
        if (this.p.autoFire && (this.ticks % 10 === 0)) this.fire(this.p, true, 1, snd);

        if (this.enemiesLeft > 0) {
          if (--this.spawnTimer <= 0) {
            this.spawnEnemy(fx);
            this.spawnTimer = 80;
          }
        }

        if (this.freezeTimer === 0) {
          this.enemies.forEach(e => {
            if (!e.active) return;
            if (--e.cooldown <= 0 && Math.random() < 0.04) {
              this.fire(e, false, 2, snd);
              e.cooldown = 45;
            }
            if (Math.random() < 0.03) {
              e.dir = (e.type === 'fast' && Math.random() < 0.5) ? 2 : ((Math.random() * 4) | 0);
            }
            let nx = e.x, ny = e.y;
            if (e.dir === 0) ny -= e.speed;
            else if (e.dir === 1) nx += e.speed;
            else if (e.dir === 2) ny += e.speed;
            else nx -= e.speed;
            if (!this.checkBlocked(nx, ny, 14, 14, false)) {
              e.x = nx; e.y = ny; e.anim ^= 1;
            } else {
              e.dir = (Math.random() * 4) | 0;
            }
          });
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const b = this.bullets[i];
          if (!b) continue;
          if (b.dir === 0) b.y -= b.speed;
          else if (b.dir === 1) b.x += b.speed;
          else if (b.dir === 2) b.y += b.speed;
          else b.x -= b.speed;

          if (b.x < 0 || b.x >= 240 || b.y < 0 || b.y >= 272) {
            this.bullets.splice(i, 1); continue;
          }

          let clashed = false;
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            if (i === j || !this.bullets[j]) continue;
            const ob = this.bullets[j];
            if (b.fromPlayer === ob.fromPlayer) continue;
            if (Math.abs(b.x - ob.x) < 6 && Math.abs(b.y - ob.y) < 6) {
              const hi = Math.max(i, j), lo = Math.min(i, j);
              this.bullets.splice(hi, 1);
              this.bullets.splice(lo, 1);
              if (fx) fx.burst(b.x, b.y + 24, 4, ['#ffffff', '#facc15']);
              if (snd) snd.playSpark();
              clashed = true; break;
            }
          }
          if (clashed) continue;

          const col = Math.floor(b.x / 16), row = Math.floor(b.y / 16);
          if (row >= 0 && row < 17 && col >= 0 && col < 15) {
            const t = this.map[row][col];
            if (t === 1) {
              this.destroySubBrick(col, row, b.dir);
              this.bullets.splice(i, 1);
              if (snd) snd.playSpark();
              if (fx) fx.burst(b.x, b.y + 24, 5, ['#dc2626', '#b91c1c', '#ffffff']);
              continue;
            } else if (t === 2) {
              if (b.pierce) {
                this.map[row][col] = 0;
                if (snd) snd.playExplode();
                if (fx) fx.burst(b.x, b.y + 24, 8, ['#cbd5e1', '#ffffff']);
              } else if (snd) snd.playSpark();
              this.bullets.splice(i, 1);
              continue;
            } else if (t === 6) {
              this.baseAlive = false;
              this.dead = true;
              this.bullets.splice(i, 1);
              if (snd) snd.playGameOver();
              if (fx) { fx.shake = 16; fx.burst(b.x, b.y + 24, 25, ['#dc2626', '#ff4444', '#000000']); }
              continue;
            }
          }

          if (b.fromPlayer) {
            let hitEnemy = false;
            for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
              const e = this.enemies[eIdx];
              if (b.x >= e.x && b.x <= e.x + 14 && b.y >= e.y && b.y <= e.y + 14) {
                this.bullets.splice(i, 1);
                if (--e.hp <= 0) {
                  e.active = false;
                  this.enemies.splice(eIdx, 1);
                  this.p.score += 100;
                  this.score = this.p.score;
                  if (snd) snd.playExplode();
                  if (fx) { fx.shake = 6; fx.burst(e.x + 7, e.y + 31, 14, ['#ff4444', '#ffd928', '#ffffff']); }
                  if (e.flashing) {
                    const types = ['star', 'bomb', 'clock', 'helmet', 'shovel', 'gun', 'life'];
                    this.items.push({
                      x: 20 + Math.random() * 200, y: 20 + Math.random() * 220,
                      type: types[(Math.random() * types.length) | 0], life: 500
                    });
                  }
                } else if (snd) snd.playSpark();
                hitEnemy = true; break;
              }
            }
            if (hitEnemy) continue;
          } else if (b.x >= this.p.x && b.x <= this.p.x + 14 && b.y >= this.p.y && b.y <= this.p.y + 14) {
            this.bullets.splice(i, 1);
            if (this.p.inv <= 0) {
              if (snd) snd.playHurt();
              if (fx) { fx.shake = 8; fx.burst(this.p.x + 7, this.p.y + 31, 12, ['#ef4444', '#ffd928']); }
              if (--this.p.lives <= 0) {
                this.dead = true;
                if (snd) snd.playGameOver();
              } else {
                this.p.x = 4 * 16 + 1; this.p.y = 15 * 16 + 1;
                this.p.dir = 0; this.p.inv = 90;
              }
            }
          }
        }

        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          if (--it.life <= 0) { this.items.splice(i, 1); continue; }
          if (Math.abs(this.p.x - it.x) < 14 && Math.abs(this.p.y - it.y) < 14) {
            this.applyItem(it.type, snd, fx);
            this.items.splice(i, 1);
          }
        }

        this.score = this.p.score;
        if (this.enemiesLeft === 0 && this.enemies.length === 0) {
          this.win = true;
          if (snd) snd.playPower();
        }
      },
      render(ctx) {
        ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, 240, 320);
        for (let r = 0; r < 17; r++) {
          for (let c = 0; c < 15; c++) {
            const t = this.map[r][c];
            const px = c * 16, py = 24 + r * 16;
            if (t === 1) {
              const sub = this.sub[r][c];
              ctx.fillStyle = '#b91c1c';
              if (sub & 1) { ctx.fillRect(px, py, 7, 7); ctx.fillStyle = '#dc2626'; ctx.fillRect(px + 1, py + 1, 5, 2); ctx.fillStyle = '#b91c1c'; }
              if (sub & 2) { ctx.fillRect(px + 8, py, 7, 7); ctx.fillStyle = '#dc2626'; ctx.fillRect(px + 9, py + 1, 5, 2); ctx.fillStyle = '#b91c1c'; }
              if (sub & 4) { ctx.fillRect(px, py + 8, 7, 7); ctx.fillStyle = '#dc2626'; ctx.fillRect(px + 1, py + 9, 5, 2); ctx.fillStyle = '#b91c1c'; }
              if (sub & 8) { ctx.fillRect(px + 8, py + 8, 7, 7); ctx.fillStyle = '#dc2626'; ctx.fillRect(px + 9, py + 9, 5, 2); ctx.fillStyle = '#b91c1c'; }
            } else if (t === 2) {
              ctx.fillStyle = '#94a3b8'; ctx.fillRect(px, py, 16, 16);
              ctx.fillStyle = '#cbd5e1'; ctx.fillRect(px + 1, py + 1, 14, 14);
              ctx.fillStyle = '#475569'; ctx.fillRect(px + 7, py, 2, 16); ctx.fillRect(px, py + 7, 16, 2);
            } else if (t === 3) {
              ctx.fillStyle = '#0284c7'; ctx.fillRect(px, py, 16, 16);
              ctx.fillStyle = '#38bdf8';
              if (((this.ticks / 8) | 0) % 2) ctx.fillRect(px + 2, py + 4, 8, 2);
              else ctx.fillRect(px + 6, py + 10, 8, 2);
            } else if (t === 5) {
              ctx.fillStyle = '#bae6fd'; ctx.fillRect(px, py, 16, 16);
              ctx.fillStyle = '#f0f9ff'; ctx.fillRect(px + 2, py + 2, 4, 1);
            } else if (t === 6) {
              if (this.baseAlive) {
                ctx.fillStyle = '#f59e0b'; ctx.fillRect(px + 4, py + 2, 8, 4);
                ctx.fillStyle = '#d97706'; ctx.fillRect(px + 2, py + 6, 12, 6);
                ctx.fillStyle = '#78350f'; ctx.fillRect(px + 4, py + 12, 8, 4);
              } else {
                ctx.fillStyle = '#334155'; ctx.fillRect(px + 2, py + 4, 12, 8);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(px + 6, py + 6, 4, 4);
              }
            }
          }
        }

        this.items.forEach(it => {
          if (it.life < 100 && ((it.life / 6) | 0) % 2) return;
          const iy = 24 + it.y;
          ctx.fillStyle = '#facc15'; ctx.fillRect(it.x, iy, 14, 14);
          ctx.fillStyle = '#0f172a'; ctx.fillRect(it.x + 1, iy + 1, 12, 12);
          ctx.fillStyle = '#facc15'; ctx.font = 'bold 9px monospace';
          const map = { star: '*', bomb: 'B', clock: 'T', helmet: 'H', shovel: 'S', gun: 'G', life: '+' };
          ctx.fillText(map[it.type] || '?', it.x + 3, iy + 11);
        });

        this.enemies.forEach(e => {
          if (!e.active) return;
          const ey = 24 + e.y;
          const col = e.flashing ? ((((this.ticks / 3) | 0) % 2) ? '#dc2626' : '#fde047') :
            (e.type === 'fast' ? '#ef4444' : (e.type === 'power' ? '#0284c7' : (e.hp >= 3 ? '#15803d' : '#94a3b8')));
          ctx.fillStyle = '#1e293b';
          if (e.dir === 0 || e.dir === 2) {
            ctx.fillRect(e.x, ey, 3, 14); ctx.fillRect(e.x + 11, ey, 3, 14);
            ctx.fillStyle = col; ctx.fillRect(e.x + 3, ey + 2, 8, 10);
            ctx.fillStyle = '#e2e8f0';
            if (e.dir === 0) ctx.fillRect(e.x + 6, ey - 3, 2, 5); else ctx.fillRect(e.x + 6, ey + 12, 2, 5);
          } else {
            ctx.fillRect(e.x, ey, 14, 3); ctx.fillRect(e.x, ey + 11, 14, 3);
            ctx.fillStyle = col; ctx.fillRect(e.x + 2, ey + 3, 10, 8);
            ctx.fillStyle = '#e2e8f0';
            if (e.dir === 3) ctx.fillRect(e.x - 3, ey + 6, 5, 2); else ctx.fillRect(e.x + 12, ey + 6, 5, 2);
          }
        });

        {
          const p = this.p, py = 24 + p.y;
          if (p.inv > 0) {
            ctx.strokeStyle = (((this.ticks / 3) | 0) % 2) ? '#00e5ff' : '#facc15';
            ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 2, py - 2, 18, 18);
          }
          ctx.fillStyle = '#78350f';
          if (p.dir === 0 || p.dir === 2) {
            ctx.fillRect(p.x, py, 3, 14); ctx.fillRect(p.x + 11, py, 3, 14);
            ctx.fillStyle = '#f59e0b'; ctx.fillRect(p.x + 3, py + 2, 8, 10);
            ctx.fillStyle = '#e2e8f0';
            if (p.dir === 0) ctx.fillRect(p.x + 6, py - 3, 2, 5); else ctx.fillRect(p.x + 6, py + 12, 2, 5);
          } else {
            ctx.fillRect(p.x, py, 14, 3); ctx.fillRect(p.x, py + 11, 14, 3);
            ctx.fillStyle = '#f59e0b'; ctx.fillRect(p.x + 2, py + 3, 10, 8);
            ctx.fillStyle = '#e2e8f0';
            if (p.dir === 3) ctx.fillRect(p.x - 3, py + 6, 5, 2); else ctx.fillRect(p.x + 12, py + 6, 5, 2);
          }
        }

        for (let r = 0; r < 17; r++) {
          for (let c = 0; c < 15; c++) {
            if (this.map[r][c] === 4) {
              const px = c * 16, py = 24 + r * 16;
              ctx.fillStyle = '#15803d'; ctx.fillRect(px, py, 16, 16);
              ctx.fillStyle = '#22c55e'; ctx.fillRect(px + 2, py + 2, 6, 5); ctx.fillRect(px + 8, py + 8, 6, 5);
            }
          }
        }

        this.bullets.forEach(b => {
          ctx.fillStyle = b.fromPlayer ? (b.pierce ? '#00e5ff' : '#facc15') : '#ef4444';
          ctx.fillRect(b.x - 1, 24 + b.y - 1, 3, 3);
        });

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, 240, 22);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#ffd928'; ctx.fillText('SC ' + this.p.score, 6, 15);
        ctx.fillStyle = '#ef4444'; ctx.fillText('LIVES ' + this.p.lives, 86, 15);
        ctx.fillStyle = '#facc15'; ctx.fillText('*' + this.p.tier, 126, 15);
        ctx.fillStyle = '#38bdf8'; ctx.fillText('EN ' + (this.enemiesLeft + this.enemies.length), 154, 15);

        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 298, 240, 22);
        ctx.fillStyle = '#334155'; ctx.fillRect(0, 298, 240, 1);
        ctx.font = 'bold 9px monospace';
        if (this.p.autoFire) { ctx.fillStyle = '#f59e0b'; ctx.fillText('[AUTO]', 6, 312); }
        if (this.freezeTimer > 0) { ctx.fillStyle = '#38bdf8'; ctx.fillText('[FROZEN]', 56, 312); }
        if (this.shovelTimer > 0) { ctx.fillStyle = '#94a3b8'; ctx.fillText('[STEEL]', 118, 312); }
        if (this.p.inv > 0) { ctx.fillStyle = '#00e5ff'; ctx.fillText('[SHIELD]', 176, 312); }

        if (this.dead) drawOver(ctx, 'BASE DESTROYED', this.p.score);
        else if (this.win) drawOver(ctx, 'STAGE CLEARED', this.p.score);
      }
    },

    // ==========================================
    // 3. 像素冒险岛 HD (Adventure Island HD)
    // ==========================================
    adventure: {
      init() {
        this.p = { x: 72, y: 240, vy: 0, onGround: true, stamina: 100, lives: 3, score: 0, weapon: 'A', combo: 0, comboT: 0, inv: 0 };
        this.axes = [];
        this.enemies = [];
        this.items = [{ x: 180, y: 236, type: 'banana' }];
        this.scroll = 0;
        this.dead = false;
        this.spawn = 0;
      },
      onOk(snd, fx) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        if (this.p.onGround) {
          this.p.vy = -8.4;
          this.p.onGround = false;
          if (snd) snd.playJump();
        } else {
          const w = this.p.weapon;
          if (w === 'K') this.axes.push({ x: this.p.x + 12, y: this.p.y - 6, vx: 8.2, vy: 0, rot: 0, t: 'K', pierce: false });
          else if (w === 'P') this.axes.push({ x: this.p.x + 12, y: this.p.y - 8, vx: 6.4, vy: 0, rot: 0, t: 'P', pierce: true });
          else this.axes.push({ x: this.p.x + 12, y: this.p.y - 8, vx: 5.6, vy: -3.4, rot: 0, t: 'A', pierce: false });
          if (snd) snd.playLaser();
        }
      },
      kill(e, bonus, snd, fx) {
        e.dead = true;
        this.p.combo = this.p.comboT > 0 ? this.p.combo + 1 : 1;
        this.p.comboT = 1100;
        const add = (bonus + (e.score || 200)) * (this.p.combo > 1 ? this.p.combo : 1);
        this.p.score += add;
        if (fx) {
          fx.burst(e.x, e.y, 8, ['#ffd928', '#ff5533', '#fff']);
          fx.floatText(e.x, e.y - 10, this.p.combo > 1 ? 'x' + this.p.combo : '+' + add, '#ffd928');
        }
        if (snd) snd.playExplode(false);
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        const p = this.p, k = dt / 16.6;
        if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
        if (p.inv > 0) p.inv -= dt;
        const sprint = keys.down, brake = keys.up;
        const worldSpd = sprint ? 3.1 : brake ? 0.35 : 1.7;
        this.scroll += worldSpd * k;
        if (sprint) { p.x += 1.1 * k; p.stamina -= 0.02 * k; }
        else if (brake) p.x -= 2.0 * k;
        else p.x += 0.35 * k;
        p.x = clamp(p.x, 28, 168);
        p.y += p.vy * k; p.vy += 0.42 * k;
        if (p.y >= 240) { p.y = 240; p.vy = 0; p.onGround = true; }
        p.stamina = Math.max(0, p.stamina - 0.03 * k);
        if (p.stamina <= 0) {
          p.lives--; p.stamina = 100; p.inv = 1200;
          if (snd) snd.playHit(); if (fx) fx.shake = 5;
          if (p.lives <= 0) { this.dead = true; if (snd) snd.playGameOver(); }
        }
        for (let i = this.axes.length - 1; i >= 0; i--) {
          const a = this.axes[i];
          a.x += a.vx * k; a.y += a.vy * k;
          if (a.t === 'A') a.vy += 0.26 * k;
          a.rot += (a.t === 'P' ? 0.5 : 0.38) * k;
          if (a.y > 280 || a.x > 255) this.axes.splice(i, 1);
        }
        this.spawn += dt;
        if (this.spawn > 900 && this.enemies.length < 4) {
          this.spawn = 0;
          const r = Math.random();
          const type = r > 0.7 ? 'bird' : r > 0.4 ? 'frog' : 'snail';
          this.enemies.push({ x: 250, y: type === 'bird' ? 150 + Math.random() * 40 : 244, type, score: type === 'bird' ? 300 : type === 'frog' ? 200 : 100, hop: 0, vy: 0, dead: false });
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (e.dead) { this.enemies.splice(i, 1); continue; }
          e.x -= (worldSpd + 0.35) * k;
          if (e.type === 'bird') e.y += Math.sin(this.scroll * 0.04 + e.x) * 0.4;
          if (e.type === 'frog') {
            e.hop += dt;
            if (e.hop > 900) { e.vy = -6; e.hop = 0; }
            e.y += e.vy; e.vy += 0.28;
            if (e.y > 244) { e.y = 244; e.vy = 0; }
          }
          for (let j = this.axes.length - 1; j >= 0; j--) {
            const a = this.axes[j];
            if (Math.abs(a.x - e.x) < 16 && Math.abs(a.y - e.y) < 16) {
              if (!a.pierce) this.axes.splice(j, 1);
              this.kill(e, 0, snd, fx);
              break;
            }
          }
          if (!e.dead && Math.abs(p.x - e.x) < 14 && Math.abs(p.y - e.y) < 18) {
            if (!p.onGround && p.vy > 1.2 && p.y < e.y) {
              this.kill(e, 50, snd, fx); p.vy = -6.2; p.onGround = false;
            } else if (p.inv <= 0) {
              p.lives--; p.inv = 1400; p.combo = 0;
              if (snd) snd.playHit(); if (fx) fx.shake = 6;
              if (p.lives <= 0) { this.dead = true; if (snd) snd.playGameOver(); }
            }
          }
          if (e.x < -24) this.enemies.splice(i, 1);
        }
        if (Math.random() < 0.014 && this.items.length < 3) {
          const t = Math.random();
          const type = t > 0.88 ? 'egg' : t > 0.72 ? 'P' : t > 0.58 ? 'K' : t > 0.46 ? 'A' : t > 0.23 ? 'pine' : 'banana';
          this.items.push({ x: 252, y: 236, type });
        }
        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          it.x -= worldSpd * k;
          if (Math.abs(p.x - it.x) < 18 && Math.abs(p.y - it.y) < 24) {
            if (it.type === 'egg') { p.lives++; p.score += 500; if (snd) snd.playCoin(); if (fx) fx.floatText(it.x, it.y, '1UP', '#ff66aa'); }
            else if (it.type === 'A' || it.type === 'K' || it.type === 'P') {
              p.weapon = it.type; p.score += 250; if (snd) snd.playCoin(); if (fx) fx.floatText(it.x, it.y, '[' + it.type + ']', '#ffd928');
            } else {
              p.stamina = Math.min(100, p.stamina + (it.type === 'banana' ? 25 : 50));
              p.score += it.type === 'banana' ? 100 : 300; if (snd) snd.playCoin();
            }
            this.items.splice(i, 1);
          } else if (it.x < -20) this.items.splice(i, 1);
        }
      },
      render(ctx) {
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(0, 0, 240, 320);
        ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 252, 240, 68);
        ctx.fillStyle = '#78350f'; ctx.fillRect(0, 266, 240, 54);
        const palm = this.scroll % 90;
        ctx.fillStyle = '#14532d';
        for (let i = 0; i < 4; i++) {
          const px = ((i * 90 - palm) % 360 + 360) % 360 - 20;
          ctx.fillRect(px + 18, 200, 6, 52);
        }
        for (const it of this.items) {
          if (it.type === 'A' || it.type === 'K' || it.type === 'P') drawLetterBadge(ctx, it.x, it.y, it.type);
          else if (it.type === 'egg') { ctx.fillStyle = '#f8f1d0'; ctx.fillRect(it.x - 5, it.y - 8, 10, 14); }
          else { ctx.fillStyle = it.type === 'pine' ? '#ffaa00' : '#ffe600'; ctx.fillRect(it.x - 5, it.y - 6, 12, 10); }
        }
        for (const e of this.enemies) {
          if (e.type === 'frog') { ctx.fillStyle = '#3dba4a'; ctx.fillRect(e.x - 8, e.y - 8, 16, 12); }
          else if (e.type === 'bird') { ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.fillStyle = '#a0522d'; ctx.beginPath(); ctx.arc(e.x, e.y - 2, 8, 0, Math.PI * 2); ctx.fill(); }
        }
        for (const a of this.axes) {
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
          ctx.fillStyle = a.t === 'P' ? '#e879f9' : a.t === 'K' ? '#cbd5e1' : '#cccccc';
          ctx.fillRect(-8, -3, 16, 6);
          ctx.restore();
        }
        const p = this.p;
        if (p.inv <= 0 || ((Date.now() / 80) | 0) % 2) {
          ctx.fillStyle = '#ff2233'; ctx.fillRect(p.x - 6, p.y - 20, 14, 5);
          ctx.fillStyle = '#ffcc99'; ctx.fillRect(p.x - 5, p.y - 15, 11, 8);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 5, p.y - 6, 12, 10);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 240, 22);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#ffd928'; ctx.fillText('SC ' + p.score, 6, 15);
        ctx.fillStyle = '#ff4466'; ctx.fillText('HP ' + '♥'.repeat(Math.max(0, p.lives)), 86, 15);
        ctx.fillStyle = '#ffd928'; ctx.fillText('[' + p.weapon + ']', 132, 15);
        ctx.fillStyle = '#111827'; ctx.fillRect(158, 7, 74, 10);
        ctx.fillStyle = p.stamina > 30 ? '#22c55e' : '#ef4444';
        ctx.fillRect(159, 8, Math.max(0, 72 * (p.stamina / 100)), 8);
        if (this.dead) drawOver(ctx, 'GAME OVER', p.score);
      }
    },

    // ==========================================
    // 4. 口袋魂斗罗 HD (Pocket Contra HD)
    // ==========================================
    contra: {
      init() {
        this.p = { x: 48, y: 250, vy: 0, crouch: false, jump: false, hp: 6, gun: 'N', score: 0, inv: 0, cool: 0 };
        this.bullets = []; this.eb = []; this.enemies = [{ x: 210, y: 250, hp: 2 }];
        this.cap = { x: 260, y: 148, a: true, item: null };
        this.scroll = 0; this.dead = false; this.win = false; this.fireHold = 0;
      },
      fire(snd) {
        const p = this.p;
        if (p.cool > 0) return;
        const y = p.crouch ? p.y + 2 : p.y - 4;
        if (p.gun === 'S') {
          this.bullets.push({ x: p.x + 14, y, vx: 6.4, vy: -1.5, t: 'S' });
          this.bullets.push({ x: p.x + 14, y, vx: 7.1, vy: 0, t: 'S' });
          this.bullets.push({ x: p.x + 14, y, vx: 6.4, vy: 1.5, t: 'S' });
          p.cool = 140;
        } else if (p.gun === 'L') {
          this.bullets.push({ x: p.x + 14, y, vx: 10, vy: 0, t: 'L', pierce: true });
          p.cool = 160;
        } else if (p.gun === 'M') {
          this.bullets.push({ x: p.x + 14, y, vx: 8.4, vy: 0, t: 'M' });
          p.cool = 55;
        } else {
          this.bullets.push({ x: p.x + 14, y, vx: 7.2, vy: 0, t: 'N' });
          p.cool = 110;
        }
        if (snd) snd.playLaser();
      },
      onOk(snd, fx) {
        if (this.dead || this.win) { this.init(); if (snd) snd.playClick(); return; }
        this.fire(snd);
      },
      update(dt, keys, snd, fx) {
        if (this.dead || this.win) return;
        const p = this.p, k = dt / 16.6;
        this.scroll += 1.2 * k;
        if (p.cool > 0) p.cool -= dt;
        if (p.inv > 0) p.inv -= dt;
        p.crouch = keys.down && !p.jump;
        if (!p.crouch && !p.jump) p.x = Math.min(96, p.x + 0.22 * k);
        if (keys.upEdge && !p.jump) { p.vy = -8.4; p.jump = true; if (snd) snd.playJump(); }
        if (keys.ok) { this.fireHold += dt; if (this.fireHold > 80) this.fire(snd); }
        else this.fireHold = 0;
        if (p.jump) {
          p.y += p.vy * k; p.vy += 0.44 * k;
          if (p.y >= 250) { p.y = 250; p.vy = 0; p.jump = false; }
        }
        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const b = this.bullets[i];
          b.x += b.vx * k; b.y += b.vy * k;
          if (b.x > 255 || b.y < 0 || b.y > 320) this.bullets.splice(i, 1);
        }
        for (let i = this.eb.length - 1; i >= 0; i--) {
          const eb = this.eb[i];
          eb.x += eb.vx * k;
          const top = p.crouch ? p.y - 2 : p.y - 18;
          if (p.inv <= 0 && Math.abs(eb.x - p.x) < 10 && eb.y >= top && eb.y <= p.y + 10) {
            this.eb.splice(i, 1); p.hp--; p.inv = 1000;
            if (snd) snd.playHit(); if (fx) fx.shake = 5;
            if (p.hp <= 0) { this.dead = true; if (snd) snd.playGameOver(); }
          } else if (eb.x < -12) this.eb.splice(i, 1);
        }
        if (Math.random() < 0.018 && this.enemies.length < 4) this.enemies.push({ x: 255, y: 250, hp: 2 });
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          e.x -= 1.15 * k;
          if (Math.random() < 0.02) this.eb.push({ x: e.x - 8, y: e.y - 6, vx: -3.7 });
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            const b = this.bullets[j];
            if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 16) {
              e.hp--; if (!b.pierce) this.bullets.splice(j, 1);
              if (e.hp <= 0) {
                this.enemies.splice(i, 1); p.score += 150;
                if (fx) fx.burst(e.x, e.y, 7, ['#ff3344', '#ffd928']);
                if (snd) snd.playExplode(false);
              }
              break;
            }
          }
          if (e.x < -20) this.enemies.splice(i, 1);
        }
        if (this.cap.a) {
          this.cap.x -= 1.35 * k;
          this.cap.y = 148 + Math.sin(this.scroll * 0.05) * 16;
          for (let j = this.bullets.length - 1; j >= 0; j--) {
            const b = this.bullets[j];
            if (Math.abs(b.x - this.cap.x) < 16 && Math.abs(b.y - this.cap.y) < 12) {
              this.cap.a = false; this.bullets.splice(j, 1);
              const guns = ['S', 'L', 'M', 'P'];
              this.cap.item = { x: this.cap.x, y: this.cap.y, t: guns[(Math.random() * 4) | 0], vy: 1.6 };
              if (snd) snd.playCoin();
              break;
            }
          }
          if (this.cap.x < -30) { this.cap.x = 280; this.cap.a = true; }
        }
        if (this.cap.item) {
          const it = this.cap.item;
          it.y += it.vy * k; it.vy += 0.18 * k;
          if (it.y >= 248) { it.y = 248; it.vy = 0; }
          it.x += (p.x + 10 - it.x) * (it.vy === 0 ? 0.28 : 0.1);
          if (Math.abs(p.x - it.x) < 28 && Math.abs(p.y - it.y) < 28) {
            if (it.t === 'P') { p.inv = 2200; p.score += 400; if (fx) fx.floatText(it.x, it.y, '[P] SHIELD', '#60a5fa'); }
            else { p.gun = it.t; p.score += 300; if (fx) fx.floatText(it.x, it.y, '[' + it.t + ']', '#ffd928'); }
            this.cap.item = null; if (snd) snd.playCoin();
          }
        }
      },
      render(ctx) {
        ctx.fillStyle = '#06101e'; ctx.fillRect(0, 0, 240, 320);
        ctx.fillStyle = '#1b4d24'; ctx.fillRect(0, 260, 240, 60);
        const p = this.p;
        if (p.inv <= 0 || ((Date.now() / 70) | 0) % 2) {
          ctx.fillStyle = '#ff2233'; ctx.fillRect(p.x - 6, p.crouch ? p.y - 4 : p.y - 18, 12, 4);
          ctx.fillStyle = '#ffaa66'; ctx.fillRect(p.x - 5, p.crouch ? p.y - 2 : p.y - 14, 10, 7);
          ctx.fillStyle = '#0055ff'; ctx.fillRect(p.x - 6, p.crouch ? p.y + 4 : p.y - 7, p.crouch ? 18 : 12, p.crouch ? 8 : 14);
        }
        for (const b of this.bullets) {
          ctx.fillStyle = b.t === 'L' ? '#00ffff' : b.t === 'S' ? '#ff2222' : '#ffd700';
          ctx.fillRect(b.x - (b.t === 'L' ? 12 : 3), b.y - 2, b.t === 'L' ? 24 : 7, 4);
        }
        ctx.fillStyle = '#fff';
        for (const eb of this.eb) ctx.fillRect(eb.x - 3, eb.y - 3, 6, 6);
        ctx.fillStyle = '#cc2222';
        for (const e of this.enemies) ctx.fillRect(e.x - 6, e.y - 14, 12, 18);
        if (this.cap.a) {
          ctx.fillStyle = '#ff0055'; ctx.fillRect(this.cap.x - 12, this.cap.y - 6, 24, 12);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.fillText('FALCON', this.cap.x - 12, this.cap.y + 3);
        }
        if (this.cap.item) drawLetterBadge(ctx, this.cap.item.x, this.cap.item.y, this.cap.item.t);
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 240, 22);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#ffd928'; ctx.fillText('SC ' + p.score, 6, 15);
        ctx.fillStyle = '#00e5ff'; ctx.fillText('[' + p.gun + '] ' + '♥'.repeat(Math.max(0, p.hp)), 92, 15);
        if (this.dead) drawOver(ctx, 'MISSION FAILED', p.score);
        if (this.win) drawOver(ctx, 'STAGE CLEAR', p.score);
      }
    },

    // ==========================================
    // 5. 果蝇光剑：神经脉冲 (FlySaber HD)
    // ==========================================
    flysaber: {
      init() {
        this.score = 0;
        this.combo = 0;
        this.blocks = [];
        this.spawn = 0;
        this.dead = false;
        this.overdrive = 0;
        this.hp = 3;
      },
      onOk(snd, fx) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        // 双刀合击中央核心 / 神经超频
        let hit = false;
        for (let i = this.blocks.length - 1; i >= 0; i--) {
          const b = this.blocks[i];
          if (b.type === 'core' && b.z < 0.25 && b.z > 0.0) {
            this.blocks.splice(i, 1);
            hit = true;
            this.score += 500;
            this.combo++;
            if (fx) fx.burst(120, 220, 18, ['#ffd700', '#fff']);
            if (snd) snd.playSlash(true);
            break;
          }
        }
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        const k = dt / 16.6;
        this.spawn += dt;
        if (this.spawn > 550) {
          this.spawn = 0;
          const r = Math.random();
          const type = r < 0.45 ? 'blue' : (r < 0.9 ? 'red' : 'core');
          this.blocks.push({ type, z: 1.0, side: type === 'blue' ? -1 : (type === 'red' ? 1 : 0) });
        }

        // UP 挥砍蓝剑
        if (keys.upEdge) {
          if (snd) snd.playSlash(true);
          for (let i = this.blocks.length - 1; i >= 0; i--) {
            const b = this.blocks[i];
            if (b.type === 'blue' && b.z < 0.28 && b.z > 0.0) {
              this.blocks.splice(i, 1);
              this.score += 200;
              this.combo++;
              if (fx) fx.burst(60, 220, 12, ['#00e5ff', '#fff']);
              break;
            }
          }
        }

        // DOWN 挥砍红剑
        if (keys.downEdge) {
          if (snd) snd.playSlash(false);
          for (let i = this.blocks.length - 1; i >= 0; i--) {
            const b = this.blocks[i];
            if (b.type === 'red' && b.z < 0.28 && b.z > 0.0) {
              this.blocks.splice(i, 1);
              this.score += 200;
              this.combo++;
              if (fx) fx.burst(180, 220, 12, ['#ff0055', '#fff']);
              break;
            }
          }
        }

        // 方块推进
        for (let i = this.blocks.length - 1; i >= 0; i--) {
          const b = this.blocks[i];
          b.z -= 0.02 * k;
          if (b.z < -0.05) {
            this.blocks.splice(i, 1);
            this.combo = 0;
            this.hp--;
            if (snd) snd.playHit();
            if (this.hp <= 0) { this.dead = true; if (snd) snd.playGameOver(); }
          }
        }
      },
      render(ctx, frame) {
        ctx.fillStyle = '#06040e';
        ctx.fillRect(0, 0, 240, 320);

        // 3D 霓虹轨道
        ctx.strokeStyle = '#331155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(120, 60); ctx.lineTo(10, 320);
        ctx.moveTo(120, 60); ctx.lineTo(230, 320);
        ctx.stroke();

        // 飞入方块
        for (const b of this.blocks) {
          const depth = 1.0 - b.z;
          const y = 60 + depth * depth * 230;
          const x = 120 + b.side * (depth * 90);
          const size = 10 + depth * 28;

          ctx.fillStyle = b.type === 'blue' ? '#00e5ff' : (b.type === 'red' ? '#ff0055' : '#ffd700');
          ctx.fillRect(x - size/2, y - size/2, size, size);
        }

        // 光剑
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(40, 260, 6, 45);
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(194, 260, 6, 45);

        // HUD
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(`SCORE:${this.score}`, 10, 18);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`COMBO:${this.combo}`, 110, 18);
        ctx.fillStyle = '#ff0055';
        ctx.fillText(`HP:${this.hp}`, 190, 18);

        if (this.dead) {
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(30, 110, 180, 80);
          ctx.fillStyle = '#d000ff';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SYNAPSE CUT!', 120, 142);
          ctx.font = '11px monospace';
          ctx.fillText('Press OK to Revive', 120, 166);
          ctx.textAlign = 'left';
        }
      }
    },

    // ==========================================
    // 6. 果蝇超跑：极速狂飙 (FlyDriver HD)
    // ==========================================
    flydriver: {
      init() {
        this.lane = 1;
        this.laneX = 0;
        this.speed = 180;
        this.score = 0;
        this.dead = false;
        this.cars = [];
      },
      onOk(snd, fx) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        this.speed = 280;
        if (snd) snd.playNitro();
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        const k = dt / 16.6;
        if (keys.upEdge) { this.lane = Math.max(0, this.lane - 1); if (snd) snd.playClick(); }
        if (keys.downEdge) { this.lane = Math.min(2, this.lane + 1); if (snd) snd.playClick(); }
        const targets = [-0.65, 0, 0.65];
        this.laneX += (targets[this.lane] - this.laneX) * 0.25 * k;

        if (this.speed > 180) this.speed -= 1.0 * k;
        this.score += Math.floor(this.speed * 0.05 * k);

        if (Math.random() < 0.04 && this.cars.length < 4) {
          const l = Math.floor(Math.random() * 3);
          this.cars.push({ x: targets[l], z: 1.0 });
        }

        for (let i = this.cars.length - 1; i >= 0; i--) {
          const c = this.cars[i];
          c.z -= 0.02 * (this.speed / 180) * k;
          if (c.z < 0.08 && c.z > 0.01 && Math.abs(c.x - this.laneX) < 0.35) {
            this.dead = true;
            if (fx) fx.shake = 12;
            if (snd) snd.playExplode(true);
          }
          if (c.z < -0.1) this.cars.splice(i, 1);
        }
      },
      render(ctx, frame) {
        ctx.fillStyle = '#060814';
        ctx.fillRect(0, 0, 240, 320);

        // 赛道
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.moveTo(80, 50); ctx.lineTo(160, 50);
        ctx.lineTo(230, 320); ctx.lineTo(10, 320);
        ctx.closePath(); ctx.fill();

        for (const c of this.cars) {
          const depth = 1.0 - c.z;
          const y = 50 + depth * depth * 230;
          const x = 120 + c.x * (20 + depth * 80);
          const w = 12 + depth * 24;
          const h = 10 + depth * 18;
          ctx.fillStyle = '#ffd700';
          ctx.fillRect(x - w/2, y - h/2, w, h);
        }

        const px = 120 + this.laneX * 90;
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(px - 14, 240, 28, 36);

        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`SCORE:${this.score}`, 10, 18);
        ctx.fillStyle = '#22c55e';
        ctx.fillText(`${Math.floor(this.speed)}KM/H`, 150, 18);

        if (this.dead) {
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(30, 110, 180, 80);
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('CRASHED!', 120, 142);
          ctx.font = '11px monospace';
          ctx.fillText('Press OK to Retry', 120, 166);
          ctx.textAlign = 'left';
        }
      }
    },

    // ==========================================
    // 7. 像素飞鸟：重力狂飙 (Flappy Bird HD)
    // ==========================================
    flappy: {
      init() {
        this.y = 150; this.vy = 0; this.rot = 0; this.score = 0; this.dead = false; this.ready = true;
        this.gapH = 95; this.speed = 1.55;
        this.pipes = [
          { x: 260, gapY: 140, osc: 0, golden: false, scored: false },
          { x: 390, gapY: 168, osc: 0, golden: false, scored: false },
          { x: 520, gapY: 120, osc: 0, golden: false, scored: false }
        ];
      },
      onOk(snd) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        this.ready = false; this.vy = -5.0;
        if (snd) snd.playJump();
      },
      update(dt, keys, snd, fx) {
        if (this.dead || this.ready) return;
        const k = dt / 16.6;
        this.y += this.vy * k; this.vy += 0.28 * k;
        this.rot = clamp(this.vy * 0.1, -0.5, 1.0);
        if (this.y >= 284 || this.y <= 10) { this.dead = true; if (snd) snd.playGameOver(); if (fx) fx.shake = 5; return; }
        this.speed = Math.min(2.4, 1.55 + this.score * 0.03);
        for (const p of this.pipes) {
          p.x -= this.speed * k;
          if (this.score >= 8) p.gapY += Math.sin((p.osc += 0.04 * k)) * 0.55;
          p.gapY = clamp(p.gapY, 80, 210);
          if (!p.scored && p.x < 50) {
            p.scored = true; this.score += p.golden ? 2 : 1;
            if (snd) snd.playCoin();
            if (p.golden && fx) fx.floatText(60, this.y, 'GOLD +2', '#ffd928');
          }
          if (p.x < 74 && p.x > 34) {
            if (this.y - 7 < p.gapY - this.gapH / 2 || this.y + 7 > p.gapY + this.gapH / 2) {
              this.dead = true; if (snd) snd.playGameOver(); if (fx) fx.shake = 5;
            }
          }
          if (p.x < -44) {
            let maxX = 0; for (const q of this.pipes) if (q.x > maxX) maxX = q.x;
            p.x = maxX + 130; p.gapY = 90 + Math.random() * 110; p.scored = false;
            p.golden = this.score >= 5 && Math.random() < 0.18;
            this.gapH = Math.max(68, 95 - this.score * 0.7);
          }
        }
      },
      render(ctx) {
        const night = (this.score % 20) >= 10;
        ctx.fillStyle = night ? '#0b1626' : '#38bdf8'; ctx.fillRect(0, 0, 240, 320);
        if (night) {
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 18; i++) ctx.fillRect((i * 37) % 240, 12 + (i * 13) % 80, 2, 2);
        }
        for (const p of this.pipes) {
          const topH = p.gapY - this.gapH / 2, btmY = p.gapY + this.gapH / 2;
          ctx.fillStyle = p.golden ? '#eab308' : '#22c55e';
          ctx.fillRect(p.x, 0, 34, topH); ctx.fillRect(p.x, btmY, 34, 290 - btmY);
          ctx.fillStyle = p.golden ? '#a16207' : '#15803d';
          ctx.fillRect(p.x - 3, topH - 14, 40, 14); ctx.fillRect(p.x - 3, btmY, 40, 14);
        }
        ctx.fillStyle = '#eab308'; ctx.fillRect(0, 290, 240, 30);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 290, 240, 6);
        ctx.save(); ctx.translate(60, this.y); ctx.rotate(this.rot);
        ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5500'; ctx.fillRect(6, -2, 7, 6);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
        ctx.fillText(this.score, 120, 48); ctx.textAlign = 'left';
        if (this.ready) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(40, 140, 160, 36);
          ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
          ctx.fillText('OK TO FLAP', 120, 162); ctx.textAlign = 'left';
        }
        if (this.dead) drawOver(ctx, 'GAME OVER', this.score);
      }
    },

    // ==========================================
    // 8. 变异乒乓：混沌球局 (Chaos Pong HD)
    // ==========================================
    pong: {
      init() {
        this.px = 120; this.ax = 120; this.pw = 52;
        this.ps = 0; this.as = 0; this.round = 0; this.state = 'serve'; this.winner = 0; this.slice = 0;
        this.balls = [{ x: 120, y: 268, vx: 1.5, vy: -2.1, r: 5, type: 'NORMAL', a: true }];
      },
      onOk(snd) {
        if (this.winner) { this.init(); if (snd) snd.playClick(); return; }
        if (this.state === 'serve') { this.state = 'play'; if (snd) snd.playCoin(); }
        else this.slice = 10;
      },
      mutate(b, snd, fx) {
        if (this.round === 0 || this.round % 4) return;
        const types = ['MEGA', 'HYPER', 'CURVE', 'DUAL'];
        b.type = types[(Math.random() * types.length) | 0];
        if (snd) snd.playCoin();
        if (fx) fx.floatText(120, 160, b.type, '#ffd928');
        if (b.type === 'MEGA') { b.r = 12; b.vy *= 0.78; }
        if (b.type === 'HYPER') { b.r = 3.5; b.vy *= 1.28; }
        if (b.type === 'DUAL' && this.balls.length < 2) {
          this.balls.push({ x: b.x, y: b.y, vx: -b.vx || 2, vy: b.vy * 0.95, r: 5, type: 'DUAL', a: true });
        }
      },
      update(dt, keys, snd, fx) {
        if (this.winner) return;
        const k = dt / 16.6;
        if (keys.up) this.px = Math.max(30, this.px - 4.1 * k);
        if (keys.down) this.px = Math.min(210, this.px + 4.1 * k);
        if (this.state === 'serve') { this.balls[0].x = this.px; return; }
        if (this.slice > 0) this.slice--;
        let alive = 0;
        for (const b of this.balls) {
          if (!b.a) continue; alive++;
          if (b.type === 'CURVE') b.vx += Math.sin(b.y * 0.04) * 0.12;
          b.x += b.vx * k; b.y += b.vy * k;
          if (b.x <= b.r || b.x >= 240 - b.r) { b.vx = -b.vx; if (snd) snd.playHit(); }
          if (b.y >= 292 - b.r && b.y <= 304 && b.vy > 0 && b.x > this.px - this.pw / 2 && b.x < this.px + this.pw / 2) {
            const off = (b.x - this.px) / (this.pw / 2);
            b.vy = -Math.abs(b.vy) * 1.03;
            b.vx += off * 1.15;
            if (Math.abs(off) < 0.18 && this.slice <= 0) { b.vy *= 1.12; if (snd) snd.playCoin(); if (fx) fx.floatText(b.x, 280, 'SMASH', '#00e5ff'); }
            else if (this.slice > 0) { b.vx += keys.up ? -2.2 : keys.down ? 2.2 : off * 1.4; b.type = 'CURVE'; if (snd) snd.playLaser(); }
            else if (snd) snd.playHit();
            this.round++; this.mutate(b, snd, fx);
          }
          if (b.y <= 28 + b.r && b.y >= 16 && b.vy < 0 && b.x > this.ax - this.pw / 2 && b.x < this.ax + this.pw / 2) {
            b.vy = Math.abs(b.vy) * 1.03; this.round++; this.mutate(b, snd, fx); if (snd) snd.playHit();
          }
          if (b.y > 330) { b.a = false; this.as++; if (snd) snd.playHit(); }
          else if (b.y < -10) { b.a = false; this.ps++; if (snd) snd.playCoin(); }
        }
        const liveX = this.balls.reduce((s, b) => b.a ? b.x : s, 120);
        this.ax += (liveX - this.ax) * 0.075;
        if (this.ps >= 5) { this.winner = 1; if (snd) snd.playCoin(); }
        if (this.as >= 5) { this.winner = -1; if (snd) snd.playGameOver(); }
        if (alive === 0 && !this.winner) {
          this.balls = [{ x: this.px, y: 268, vx: 1.5, vy: -2.1, r: 5, type: 'NORMAL', a: true }];
          this.state = 'serve'; this.round = 0;
        }
      },
      render(ctx) {
        ctx.fillStyle = '#062817'; ctx.fillRect(0, 0, 240, 320);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(0, 160); ctx.lineTo(240, 160); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = 'bold 24px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillText(this.as, 20, 140); ctx.fillText(this.ps, 20, 195);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(this.ax - this.pw / 2, 20, this.pw, 8);
        ctx.fillStyle = '#00e5ff'; ctx.fillRect(this.px - this.pw / 2, 292, this.pw, 8);
        for (const b of this.balls) {
          if (!b.a) continue;
          ctx.fillStyle = b.type === 'MEGA' ? '#f59e0b' : b.type === 'HYPER' ? '#00ffff' : b.type === 'CURVE' ? '#a78bfa' : '#ffffff';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        }
        if (this.state === 'serve') {
          ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
          ctx.fillText('OK TO SERVE', 120, 176); ctx.textAlign = 'left';
        }
        if (this.winner) drawOver(ctx, this.winner > 0 ? 'YOU WIN' : 'CPU WINS', this.ps + '-' + this.as);
      }
    },

    // ==========================================
    // 9. 恶魔轮盘：生死对决 (Buckshot Roulette)
    // ==========================================
    roulette: {
      init() {
        this.pLife = 4;
        this.dLife = 4;
        this.shells = [];
        this.turn = 'player'; // player / dealer
        this.saw = false;
        this.msg = 'ROUND START';
        this.dead = false;
        this.reload();
      },
      reload() {
        this.shells = [true, false, true, false, true, false].sort(() => Math.random() - 0.5);
        this.msg = 'CHAMBER LOADED';
      },
      onOk(snd, fx) {
        if (this.dead) { this.init(); if (snd) snd.playClick(); return; }
        // 对准自己射击
        if (this.turn !== 'player') return;
        const live = this.shells.pop();
        if (live) {
          const dmg = this.saw ? 2 : 1;
          this.pLife -= dmg;
          this.msg = 'BANG! IT WAS LIVE!';
          if (snd) snd.playExplode(true);
          if (fx) fx.shake = 15;
          this.turn = 'dealer';
        } else {
          this.msg = 'CLICK! BLANK! EXTRA TURN!';
          if (snd) snd.playCoin();
        }
        this.saw = false;
        this.check();
      },
      shootDealer(snd, fx) {
        if (this.dead || this.turn !== 'player') return;
        const live = this.shells.pop();
        if (live) {
          const dmg = this.saw ? 2 : 1;
          this.dLife -= dmg;
          this.msg = 'BOOM! HIT DEALER!';
          if (snd) snd.playExplode(true);
          if (fx) fx.shake = 12;
        } else {
          this.msg = 'CLICK... BLANK!';
          if (snd) snd.playClick();
        }
        this.saw = false;
        this.turn = 'dealer';
        this.check();
      },
      check() {
        if (this.pLife <= 0 || this.dLife <= 0) {
          this.dead = true;
          this.msg = this.pLife <= 0 ? 'YOU LOST TO DEMON' : 'YOU DEFEATED DEMON!';
        } else if (this.shells.length === 0) {
          this.reload();
        }
      },
      update(dt, keys, snd, fx) {
        if (this.dead) return;
        if (keys.downEdge && this.turn === 'player') {
          this.shootDealer(snd, fx);
        }
        if (keys.upEdge && this.turn === 'player') {
          this.saw = true;
          this.msg = 'SAW EQUIPPED (2X DMG)';
          if (snd) snd.playClick();
        }

        // 恶魔行动
        if (this.turn === 'dealer' && !this.dead) {
          setTimeout(() => {
            if (this.dead) return;
            const live = this.shells.pop();
            if (live) {
              this.pLife -= 1;
              this.msg = 'DEALER SHOT YOU: LIVE!';
              if (snd) snd.playExplode(true);
            } else {
              this.msg = 'DEALER SHOT YOU: BLANK!';
              if (snd) snd.playClick();
            }
            this.turn = 'player';
            this.check();
          }, 800);
          this.turn = 'waiting';
        }
      },
      render(ctx) {
        ctx.fillStyle = '#0a0505';
        ctx.fillRect(0, 0, 240, 320);

        // 恶魔
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(120, 90, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(108, 85, 6, 6);
        ctx.fillRect(126, 85, 6, 6);

        // 桌面散弹枪
        ctx.fillStyle = '#334155';
        ctx.fillRect(70, 180, 100, 16);
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(50, 184, 25, 12);

        // 状态文字
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 240, 26);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#ef4444';
        ctx.fillText(`DEMON HP:${this.dLife}`, 10, 18);
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(`YOU HP:${this.pLife}`, 160, 18);

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'center';
        ctx.fillText(this.msg, 120, 230);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`SHELLS LEFT: ${this.shells.length}`, 120, 250);
        ctx.font = '10px monospace';
        ctx.fillText('UP: Saw (2x) | DN: Shoot Demon | OK: Shoot Self', 120, 275);
        ctx.textAlign = 'left';
      }
    },

    // ==========================================
    // 10. 星火仙女棒与赛博烛火 (Sparkler & Candle)
    // ==========================================
    sparkler: {
      init() {
        this.mode = 'sparkler';
        this.parts = [];
        this.wick = 0; this.lit = true; this.speed = 1; this.mask = 0;
        this.wax = 108; this.blow = 0; this.smoke = 0; this.t = 0;
      },
      onOk(snd) {
        if (this.mode === 'sparkler' && !this.lit) { this.wick = 0; this.lit = true; this.mask = 0; if (snd) snd.playCoin(); return; }
        if (this.mode === 'candle' && !this.lit) { this.lit = true; this.smoke = 0; if (snd) snd.playCoin(); return; }
        this.mode = this.mode === 'sparkler' ? 'candle' : 'sparkler';
        this.lit = true; this.wick = 0; this.wax = 108; this.mask = 0;
        if (snd) snd.playCoin();
      },
      spawn(x, y, n, type, cols) {
        for (let i = 0; i < n && this.parts.length < 160; i++) {
          const ang = Math.random() * Math.PI * 2;
          const burst = type === 'burst';
          const sp = (burst ? 4.2 : type === 'smoke' ? 0.5 : 2.4) * (0.35 + Math.random());
          this.parts.push({
            x, y, px: x, py: y,
            vx: Math.cos(ang) * sp + this.blow * 1.8,
            vy: Math.sin(ang) * sp - this.blow * 2.2,
            life: burst ? 1 : type === 'smoke' ? 1.4 : 0.85 + Math.random() * 0.4,
            max: 1, t: type, s: burst ? 3 : 1.6,
            c: cols[(Math.random() * cols.length) | 0]
          });
        }
      },
      glow(ctx, x, y, r, col) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      },
      update(dt, keys, snd, fx) {
        const k = dt / 16.6;
        this.t += dt;
        if (keys.upEdge) this.speed = Math.min(3, this.speed + 0.25);
        if (keys.downEdge) this.speed = Math.max(0.35, this.speed - 0.25);
        this.blow = keys.blow ? Math.min(1, this.blow + 0.05) : Math.max(0, this.blow - 0.04);
        if (this.mode === 'sparkler' && this.lit) {
          this.wick += 0.0015 * this.speed * k;
          if (this.wick >= 1) { this.wick = 1; this.lit = false; if (snd) snd.playExplode(false); }
          const y = 52 + this.wick * 188;
          this.spawn(120, y, 8 + (this.blow * 10) | 0, 'spark', ['#ffffff', '#fff4c2', '#ffe066', '#ffb703', '#fb8500']);
          [0.25, 0.5, 0.75, 1].forEach((m, i) => {
            if (this.wick >= m && (this.mask & (1 << i)) === 0) {
              this.mask |= 1 << i;
              const pal = [['#FFD700', '#FFFFFF'], ['#00FFFF', '#38BDF8'], ['#FF4D8D', '#FFFFFF'], ['#FF3333', '#33FF66', '#FFFF00']][i];
              this.spawn(120, y, 42, 'burst', pal); if (snd) snd.playCoin(); if (fx) fx.shake = 4;
            }
          });
        }
        if (this.mode === 'candle') {
          const fy = 248 - this.wax;
          if (this.lit) {
            this.wax = Math.max(26, this.wax - 0.018 * this.speed * k);
            this.spawn(120 + this.blow * 10, fy - 8, 3, 'spark', ['#fff7ed', '#ffd166', '#fb923c']);
            if (this.blow > 0.7) { this.smoke += dt; if (this.smoke > 220) { this.lit = false; if (snd) snd.playHit(); } }
            else this.smoke = 0;
          } else this.spawn(120, fy - 4, 2, 'smoke', ['#cbd5e1', '#94a3b8']);
        }
        for (let i = this.parts.length - 1; i >= 0; i--) {
          const p = this.parts[i];
          p.px = p.x; p.py = p.y;
          p.x += p.vx * k; p.y += p.vy * k;
          p.vy += (p.t === 'smoke' ? -0.05 : 0.09) * k;
          p.life -= 0.028 * k;
          if (p.life <= 0) this.parts.splice(i, 1);
        }
      },
      render(ctx) {
        const grd = ctx.createLinearGradient(0, 0, 0, 320);
        grd.addColorStop(0, '#07060f'); grd.addColorStop(1, '#12080a');
        ctx.fillStyle = grd; ctx.fillRect(0, 0, 240, 320);
        if (this.mode === 'sparkler') {
          const y = 52 + this.wick * 188;
          ctx.fillStyle = '#6b3f1f'; ctx.fillRect(116, 246, 8, 30);
          ctx.fillStyle = '#c4a574'; ctx.fillRect(118, y, 4, 252 - y);
          ctx.fillStyle = '#1f2937'; ctx.fillRect(118, 40, 4, Math.max(0, y - 40));
          if (this.lit) {
            ctx.globalCompositeOperation = 'lighter';
            this.glow(ctx, 120, y, 28 + this.blow * 10, 'rgba(255,180,40,0.28)');
            this.glow(ctx, 120, y, 12, 'rgba(255,255,220,0.85)');
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = this.lit ? '#ffd928' : '#6b7280';
          ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
          ctx.fillText(this.lit ? ((this.wick * 100) | 0) + '%' : 'BURNT OUT', 120, 24);
        } else {
          const fy = 248 - this.wax, lean = this.blow * 10;
          ctx.fillStyle = '#9a3412'; ctx.fillRect(108, fy, 24, this.wax + 4);
          ctx.fillStyle = '#fde68a'; ctx.fillRect(109, fy - 3, 22, 7);
          if (this.lit) {
            const flick = Math.sin(this.t / 70) * 2;
            ctx.globalCompositeOperation = 'lighter';
            this.glow(ctx, 120 + lean * 0.4, fy - 18 + flick, 34, 'rgba(255,140,40,0.32)');
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.moveTo(120 + lean, fy - 6);
            ctx.quadraticCurveTo(112 + lean, fy - 18 + flick, 120 + lean, fy - 34 + flick);
            ctx.quadraticCurveTo(128 + lean, fy - 18 + flick, 120 + lean, fy - 6);
            ctx.fill();
            ctx.fillStyle = '#fff7ed';
            ctx.beginPath();
            ctx.moveTo(120 + lean, fy - 8);
            ctx.quadraticCurveTo(116 + lean, fy - 16, 120 + lean, fy - 24);
            ctx.quadraticCurveTo(124 + lean, fy - 16, 120 + lean, fy - 8);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.fillStyle = this.lit ? '#fdba74' : '#94a3b8';
          ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
          ctx.fillText(this.lit ? 'CANDLE' : 'SMOKING', 120, 24);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.parts) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.strokeStyle = p.c; ctx.fillStyle = p.c; ctx.lineWidth = p.s;
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace';
        ctx.fillText('SPD ' + this.speed.toFixed(2) + (this.blow > 0.05 ? '  BLOW' : ''), 8, 312);
      }
    },

    // ==========================================
    // 11. 世界时钟：跨时区罗盘 (World Timezone)
    // ==========================================
    worldtime: {
      init() {
        this.cities = [
          { name: 'BEIJING', cn: '北京', off: 8 },
          { name: 'TOKYO', cn: '东京', off: 9 },
          { name: 'LONDON', cn: '伦敦', off: 0 },
          { name: 'PARIS', cn: '巴黎', off: 1 },
          { name: 'DUBAI', cn: '迪拜', off: 4 },
          { name: 'NEW YORK', cn: '纽约', off: -5 },
          { name: 'SAN FRAN', cn: '旧金山', off: -8 },
          { name: 'SYDNEY', cn: '悉尼', off: 10 }
        ];
        this.idx = 0; this.view = 0;
      },
      onOk(snd) { this.view ^= 1; if (snd) snd.playClick(); },
      local(c, date) {
        const utc = date.getTime() + date.getTimezoneOffset() * 60000;
        return new Date(utc + 3600000 * c.off);
      },
      update(dt, keys, snd) {
        if (keys.upEdge) { this.idx = (this.idx + this.cities.length - 1) % this.cities.length; if (snd) snd.playClick(); }
        if (keys.downEdge) { this.idx = (this.idx + 1) % this.cities.length; if (snd) snd.playClick(); }
      },
      render(ctx) {
        const now = new Date(), c = this.cities[this.idx], ct = this.local(c, now);
        const hr = ct.getHours(), min = ct.getMinutes(), sec = ct.getSeconds();
        const solar = hr >= 6 && hr < 18, dusk = hr >= 18 && hr < 20;
        ctx.fillStyle = solar ? '#1d4ed8' : dusk ? '#7c2d12' : '#020617';
        ctx.fillRect(0, 0, 240, 320);
        if (this.view === 0) {
          ctx.fillStyle = solar ? '#93c5fd' : '#1e293b';
          ctx.beginPath(); ctx.arc(120, 168, 78, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffd928'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(120, 168, 78, 0, Math.PI * 2); ctx.stroke();
          const hAng = ((hr % 12) + min / 60) * 30 * Math.PI / 180;
          const mAng = (min + sec / 60) * 6 * Math.PI / 180;
          const sAng = sec * 6 * Math.PI / 180;
          const hand = (ang, len, w, col) => {
            ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
            ctx.moveTo(120, 168); ctx.lineTo(120 + Math.sin(ang) * len, 168 - Math.cos(ang) * len); ctx.stroke();
          };
          hand(hAng, 36, 4, '#0f172a'); hand(mAng, 52, 3, '#1e293b'); hand(sAng, 60, 1.5, '#ef4444');
          ctx.fillStyle = '#ffd928'; ctx.beginPath(); ctx.arc(120, 168, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
          ctx.fillText(c.cn + '  ' + c.name, 120, 36);
          ctx.font = 'bold 22px monospace';
          ctx.fillText(String(hr).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0'), 120, 58);
          ctx.fillStyle = '#ffd928'; ctx.font = '10px monospace';
          ctx.fillText(solar ? 'DAY' : dusk ? 'DUSK' : 'NIGHT', 120, 74);
          ctx.fillStyle = '#94a3b8'; ctx.fillText('OK MATRIX', 120, 288);
        } else {
          ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
          ctx.fillText('MEETING MATRIX  @' + c.name, 120, 20);
          let bestH = 9, bestN = -1;
          const rows = [];
          for (let h = 8; h <= 18; h++) {
            let n = 0; const cells = [];
            for (const city of this.cities) {
              let lh = h + (city.off - c.off);
              if (lh < 0) lh += 24; if (lh >= 24) lh -= 24;
              const biz = lh >= 9 && lh < 18; if (biz) n++;
              cells.push({ lh, biz });
            }
            rows.push({ h, n, cells });
            if (n > bestN) { bestN = n; bestH = h; }
          }
          rows.forEach((r, i) => {
            const y = 36 + i * 22;
            ctx.fillStyle = r.h === bestH ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.04)';
            ctx.fillRect(6, y, 228, 20);
            ctx.fillStyle = r.h === bestH ? '#86efac' : '#94a3b8';
            ctx.textAlign = 'left'; ctx.font = '9px monospace';
            ctx.fillText(String(r.h).padStart(2, '0'), 10, y + 14);
            this.cities.forEach((city, ci) => {
              const cell = r.cells[ci];
              const x = 36 + ci * 25;
              ctx.fillStyle = cell.biz ? '#22c55e' : '#334155';
              ctx.fillRect(x, y + 4, 22, 12);
              ctx.fillStyle = '#fff'; ctx.font = '7px monospace';
              ctx.fillText(String(cell.lh).padStart(2, '0'), x + 3, y + 13);
            });
          });
          ctx.fillStyle = '#ffd928'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
          ctx.fillText('BEST OVERLAP ' + String(bestH).padStart(2, '0') + ':00', 120, 300);
        }
        ctx.textAlign = 'left'; ctx.lineWidth = 1;
      }
    },

    fish: {
      init() {
        this.x = 110; this.y = 150; this.tx = 140; this.ty = 160;
        this.attention = 0.72; this.mood = 'curious'; this.vis = 'full';
        this.idle = 0; this.moodT = 0; this.night = false;
        this.arrived = false; this.face = false; this.left = false;
        this.startle = 0; this.cool = 0; this.voiceHold = 0;
        this.bubbles = []; this.t = 0;
        this.hideX = 208; this.hideY = 214; this.viewX = 120; this.viewY = 168;
      },
      notice(delta) {
        this.attention = clamp(this.attention + delta, 0, 1);
        this.idle = 0; this.voiceHold = 0;
        if (this.mood === 'startled') return;
        if (this.mood === 'hiding' || this.mood === 'sleep') { this.setMood('peek'); return; }
        if (this.mood === 'peek') { this.setMood(this.attention >= 0.55 ? 'attend' : 'curious'); return; }
        if (this.attention >= 0.55) this.setMood('attend');
      },
      setMood(m) {
        if (this.mood === m) return;
        this.mood = m; this.moodT = 0; this.arrived = false; this.face = false;
        if (m === 'hiding') { this.tx = this.hideX; this.ty = this.hideY; if (this.attention > 0.22) this.attention = 0.22; }
        else if (m === 'peek') { this.tx = this.hideX - 18; this.ty = this.hideY - 6; }
        else if (m === 'attend') { this.tx = this.viewX; this.ty = this.viewY; }
        else if (m === 'startled') {
          this.startle = 1400; this.cool = 700; this.vis = 'full';
          this.tx = 40 + Math.random() * 150; this.ty = 70 + Math.random() * 160;
        } else if (m === 'sleep') { this.tx = this.hideX; this.ty = this.hideY; }
        else { this.tx = 40 + Math.random() * 150; this.ty = 70 + Math.random() * 160; }
      },
      onOk(snd) { this.notice(0.45); if (snd) snd.playCoin(); },
      box(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
      weeds(ctx, right, night, t) {
        const base = right ? 198 : 4, n = right ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const x = base + i * 5;
          const h = 70 + ((i * 17) % 40) + (right ? 18 : 0);
          const sway = Math.sin(t / 220 + i) * 3;
          this.box(ctx, x + sway, 292 - h, 3, h, night ? '#14532d' : (i & 1 ? '#166534' : '#4ade80'));
        }
      },
      drawFish(ctx, t) {
        const cx = this.x | 0, cy = this.y | 0;
        if (this.vis === 'tail') {
          const wag = Math.sin(t / 80) * 3;
          this.box(ctx, cx - 14, cy - 3 + wag, 10, 4, '#f59e0b');
          this.box(ctx, cx - 6, cy - 1, 5, 5, '#ea580c');
          return;
        }
        if (this.vis === 'peek') {
          this.box(ctx, cx - 6, cy - 4, 8, 10, '#f97316');
          this.box(ctx, cx - 5, cy - 3, 5, 5, '#fff');
          this.box(ctx, cx - 3, cy - 2, 3, 3, '#0f172a');
          return;
        }
        if (this.face) {
          this.box(ctx, cx - 8, cy - 8, 16, 16, '#f97316');
          this.box(ctx, cx - 7, cy - 5, 6, 6, '#fff');
          this.box(ctx, cx + 1, cy - 5, 6, 6, '#fff');
          this.box(ctx, cx - 5, cy - 3, 3, 3, '#0f172a');
          this.box(ctx, cx + 3, cy - 3, 3, 3, '#0f172a');
          return;
        }
        const dir = this.left ? -1 : 1;
        this.box(ctx, cx - dir * 12 - (this.left ? 8 : 0), cy - 4, 8, 8, '#f59e0b');
        this.box(ctx, cx - 8, cy - 7, 18, 14, '#f97316');
        this.box(ctx, cx - 5, cy + 1, 11, 6, '#ffedd5');
        this.box(ctx, cx + dir * 6 - 2, cy - 4, 5, 5, '#fff');
        this.box(ctx, cx + dir * 6, cy - 3, 3, 3, '#0f172a');
      },
      update(dt, keys, snd) {
        this.t += dt; this.idle += dt; this.moodT += dt;
        this.attention = clamp(this.attention - 0.008 * dt / 1000, 0, 1);
        if (this.cool > 0) this.cool -= dt;
        if (keys.upEdge) this.notice(0.18);
        if (keys.downEdge) this.night = !this.night;
        if (keys.voice) {
          this.voiceHold += dt;
          if (this.voiceHold >= 280) this.notice(0.35);
        } else this.voiceHold = Math.max(0, this.voiceHold - dt);
        if (keys.blow && this.cool <= 0) {
          this.attention *= 0.7; this.idle = 0; this.setMood('startled');
          if (snd) snd.playHit();
        }
        if (this.mood === 'startled') {
          this.startle -= dt;
          if (this.startle <= 0) this.setMood(this.attention < 0.18 ? 'hiding' : 'curious');
          else if ((this.moodT | 0) % 180 < dt) {
            this.tx = 40 + Math.random() * 150; this.ty = 70 + Math.random() * 160; this.arrived = false;
          }
        } else if (this.mood !== 'hiding' && this.mood !== 'peek' && this.mood !== 'sleep') {
          if (this.idle >= 30000) this.setMood('hiding');
          else if (this.night && this.idle >= 20000) this.setMood('sleep');
          else if (this.mood === 'attend' && this.attention < 0.55) this.setMood('curious');
        }
        const speeds = { curious: 22, attend: 36, hiding: 48, startled: 96, peek: 10, sleep: 48 };
        const sp = speeds[this.mood] || 22;
        const dx = this.tx - this.x, dy = this.ty - this.y, d2 = dx * dx + dy * dy;
        if (d2 < 9) this.arrived = true;
        else {
          const d = Math.sqrt(d2);
          this.x += (dx / d) * sp * dt / 1000;
          this.y += (dy / d) * sp * dt / 1000;
          this.left = dx < 0; this.arrived = false;
        }
        if (this.mood === 'attend') {
          this.vis = 'full';
          if (this.arrived) { this.face = true; this.y = this.ty + Math.sin(this.t / 280) * 3; }
        } else if (this.mood === 'hiding' || this.mood === 'sleep') {
          if (this.arrived) { this.vis = 'tail'; this.left = true; this.y = this.ty + Math.sin(this.t / 400) * 2; }
          else this.vis = 'full';
        } else if (this.mood === 'peek') { this.vis = 'peek'; this.left = true; this.face = this.arrived; }
        else this.vis = 'full';
        this.x = clamp(this.x, 28, (this.mood === 'hiding' || this.mood === 'sleep') ? 212 : 196);
        this.y = clamp(this.y, 56, 248);
        if (Math.random() < dt / ((this.mood === 'attend') ? 900 : 2200)) {
          this.bubbles.push({ x: this.x, y: this.y, vy: -20, life: 1 });
        }
        this.bubbles = this.bubbles.filter(b => {
          b.y += b.vy * dt / 1000; b.life -= dt / 2800; return b.life > 0 && b.y > 28;
        });
      },
      render(ctx) {
        const night = this.night;
        const g = ctx.createLinearGradient(0, 0, 0, 320);
        g.addColorStop(0, night ? '#020617' : '#082f49');
        g.addColorStop(1, night ? '#155e75' : '#0ea5e9');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 240, 320);
        this.box(ctx, 0, 18, 240, 3, night ? '#1e293b' : '#7dd3fc');
        this.box(ctx, 0, 288, 240, 32, night ? '#44403c' : '#a16207');
        this.weeds(ctx, false, night, this.t);
        this.drawFish(ctx, this.t);
        this.weeds(ctx, true, night, this.t);
        this.bubbles.forEach(b => { this.box(ctx, b.x, b.y, 3, 3, '#e0f2fe'); });
        this.box(ctx, 0, 0, 240, 6, '#0f172a');
        ctx.fillStyle = '#fde68a'; ctx.font = 'bold 11px monospace';
        const label = { curious: 'SWIM', attend: 'HELLO', hiding: 'HIDING', peek: 'PEEK', startled: '!!!', sleep: 'ZZZ' }[this.mood];
        ctx.fillText(label, 10, 18);
        ctx.fillStyle = '#bae6fd'; ctx.font = '9px monospace';
        ctx.fillText(night ? 'OK CALL  UP TAP  DN DAY' : 'OK CALL  UP TAP  DN NIGHT', 10, 312);
      }
    },

    // ==========================================
    // 13. 赛博晶核消消乐：极速连击 (Cyber Match-3)
    // ==========================================
    match3: {
      init() {
        this.rows = 7; this.cols = 6;
        this.board = [];
        this.cr = 3; this.cc = 2; // 光标位置
        this.sr = -1; this.sc = -1; // 选中位置
        this.dir = 1; // 0:上, 1:右, 2:下, 3:左
        this.tr = 3; this.tc = 3; // 交换目标位置
        this.state = 'select_src'; // select_src, select_dir, anim_swap, anim_clear, anim_drop, gameover, victory
        this.timer = 0;
        this.score = 0;
        this.moves = 25;
        this.targetScore = 15000;
        this.combo = 0;
        this.fever = 0;
        this.feverActive = false;
        this.feverTime = 0;
        this.clearMask = Array(7).fill(0).map(() => Array(6).fill(false));
        this.tick = 0;

        // 生成初始棋盘，无自然三消
        let attempts = 0;
        while (attempts++ < 30) {
          for (let r = 0; r < this.rows; r++) {
            this.board[r] = [];
            for (let c = 0; c < this.cols; c++) {
              let color = 0;
              do {
                color = 1 + Math.floor(Math.random() * 5);
              } while (
                (r >= 2 && (this.board[r - 1][c] & 0x0F) === color && (this.board[r - 2][c] & 0x0F) === color) ||
                (c >= 2 && (this.board[r][c - 1] & 0x0F) === color && (this.board[r][c - 2] & 0x0F) === color)
              );
              this.board[r][c] = color;
            }
          }
          if (this.hasMoves()) break;
        }
      },

      hasMoves() {
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if (c + 1 < this.cols) {
              this.swapRaw(r, c, r, c + 1);
              const m = this.checkSimple();
              this.swapRaw(r, c, r, c + 1);
              if (m) return true;
            }
            if (r + 1 < this.rows) {
              this.swapRaw(r, c, r + 1, c);
              const m = this.checkSimple();
              this.swapRaw(r, c, r + 1, c);
              if (m) return true;
            }
          }
        }
        return false;
      },

      swapRaw(r1, c1, r2, c2) {
        const t = this.board[r1][c1];
        this.board[r1][c1] = this.board[r2][c2];
        this.board[r2][c2] = t;
      },

      checkSimple() {
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols - 2; c++) {
            const k = this.board[r][c] & 0x0F;
            if (k && k === (this.board[r][c + 1] & 0x0F) && k === (this.board[r][c + 2] & 0x0F)) return true;
          }
        }
        for (let c = 0; c < this.cols; c++) {
          for (let r = 0; r < this.rows - 2; r++) {
            const k = this.board[r][c] & 0x0F;
            if (k && k === (this.board[r + 1][c] & 0x0F) && k === (this.board[r + 2][c] & 0x0F)) return true;
          }
        }
        return false;
      },

      calcNeighbor(r, c, d) {
        let nr = r, nc = c;
        if (d === 0) nr--; else if (d === 1) nc++; else if (d === 2) nr++; else if (d === 3) nc--;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) return { r: nr, c: nc };
        return null;
      },

      onOk(snd, fx) {
        if (this.state === 'gameover' || this.state === 'victory') {
          this.init();
          if (snd) snd.playCoin();
          return;
        }
        if (this.state === 'select_src') {
          this.sr = this.cr; this.sc = this.cc;
          for (let i = 0; i < 4; i++) {
            const n = this.calcNeighbor(this.sr, this.sc, (1 + i) % 4);
            if (n) { this.dir = (1 + i) % 4; this.tr = n.r; this.tc = n.c; break; }
          }
          this.state = 'select_dir';
          if (snd) snd.playJump();
        } else if (this.state === 'select_dir') {
          this.state = 'anim_swap';
          this.timer = 0;
          if (snd) snd.playMissile();
        }
      },

      scanMatches() {
        const mark = Array(7).fill(0).map(() => Array(6).fill(false));
        let count = 0;
        // 横向
        for (let r = 0; r < this.rows; r++) {
          let c = 0;
          while (c < this.cols) {
            const col = this.board[r][c] & 0x0F;
            if (!col) { c++; continue; }
            let len = 1;
            while (c + len < this.cols && (this.board[r][c + len] & 0x0F) === col) len++;
            if (len >= 3) {
              for (let i = 0; i < len; i++) { mark[r][c + i] = true; count++; }
              if (len === 4) this.board[r][c + 1] = col | 0x10; // 横激光
              else if (len >= 5) this.board[r][c + 2] = 0x80;    // 彩虹核
            }
            c += len;
          }
        }
        // 纵向
        for (let c = 0; c < this.cols; c++) {
          let r = 0;
          while (r < this.rows) {
            const col = this.board[r][c] & 0x0F;
            if (!col) { r++; continue; }
            let len = 1;
            while (r + len < this.rows && (this.board[r + len][c] & 0x0F) === col) len++;
            if (len >= 3) {
              for (let i = 0; i < len; i++) { if (!mark[r + i][c]) { mark[r + i][c] = true; count++; } }
              if (len === 4) this.board[r + 1][c] = col | 0x20; // 纵激光
              else if (len >= 5) this.board[r + 2][c] = 0x80;
            }
            r += len;
          }
        }
        this.clearMask = mark;
        return count;
      },

      applyGravity() {
        for (let c = 0; c < this.cols; c++) {
          let wr = this.rows - 1;
          for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r][c]) {
              if (wr !== r) { this.board[wr][c] = this.board[r][c]; this.board[r][c] = 0; }
              wr--;
            }
          }
          while (wr >= 0) {
            this.board[wr][c] = 1 + Math.floor(Math.random() * 5);
            wr--;
          }
        }
      },

      update(dt, keys, snd, fx) {
        this.tick++;
        if (this.feverActive) {
          this.feverTime -= dt;
          if (this.feverTime <= 0) { this.feverActive = false; this.fever = 0; }
        }

        if (this.state === 'select_src') {
          if (keys.downEdge) {
            this.cc++; if (this.cc >= this.cols) { this.cc = 0; this.cr++; if (this.cr >= this.rows) this.cr = 0; }
            if (snd) snd.playJump();
          } else if (keys.upEdge) {
            this.cc--; if (this.cc < 0) { this.cc = this.cols - 1; this.cr--; if (this.cr < 0) this.cr = this.rows - 1; }
            if (snd) snd.playJump();
          }
        } else if (this.state === 'select_dir') {
          if (keys.downEdge) {
            for (let i = 1; i <= 4; i++) {
              const nd = (this.dir + i) % 4;
              const n = this.calcNeighbor(this.sr, this.sc, nd);
              if (n) { this.dir = nd; this.tr = n.r; this.tc = n.c; if (snd) snd.playJump(); break; }
            }
          } else if (keys.upEdge) {
            for (let i = 1; i <= 4; i++) {
              const nd = (this.dir + 4 - i) % 4;
              const n = this.calcNeighbor(this.sr, this.sc, nd);
              if (n) { this.dir = nd; this.tr = n.r; this.tc = n.c; if (snd) snd.playJump(); break; }
            }
          }
        } else if (this.state === 'anim_swap') {
          this.timer += dt;
          if (this.timer >= 120) {
            this.swapRaw(this.sr, this.sc, this.tr, this.tc);
            const matches = this.scanMatches();
            if (matches > 0) {
              this.moves--;
              this.state = 'anim_clear';
              this.timer = 0;
              this.combo = 1;
              const add = matches * 100 * (this.feverActive ? 2 : 1);
              this.score += add;
              if (fx) {
                fx.burst(12 + this.tc * 36 + 18, 50 + this.tr * 31 + 15, 14);
                fx.floatText(120, 160, `+${add}`, '#fde047');
              }
              if (snd) snd.playCoin();
              if (!this.feverActive) {
                this.fever += matches * 4;
                if (this.fever >= 100) { this.fever = 100; this.feverActive = true; this.feverTime = 8000; }
              }
            } else {
              // 换回
              this.swapRaw(this.sr, this.sc, this.tr, this.tc);
              this.state = 'select_src';
              if (snd) snd.playHit();
            }
          }
        } else if (this.state === 'anim_clear') {
          this.timer += dt;
          if (this.timer >= 140) {
            for (let r = 0; r < this.rows; r++) {
              for (let c = 0; c < this.cols; c++) {
                if (this.clearMask[r][c]) {
                  this.board[r][c] = 0;
                  this.clearMask[r][c] = false;
                  if (fx && Math.random() < 0.5) fx.burst(12 + c * 36 + 18, 50 + r * 31 + 15, 6);
                }
              }
            }
            this.state = 'anim_drop';
            this.timer = 0;
          }
        } else if (this.state === 'anim_drop') {
          this.timer += dt;
          if (this.timer >= 130) {
            this.applyGravity();
            const cascade = this.scanMatches();
            if (cascade > 0) {
              this.combo++;
              const add = cascade * 150 * this.combo * (this.feverActive ? 2 : 1);
              this.score += add;
              this.state = 'anim_clear';
              this.timer = 0;
              if (snd) snd.playCoin();
              if (fx) fx.floatText(120, 140, `COMBO x${this.combo}!`, '#38bdf8');
            } else {
              this.combo = 0;
              if (this.score >= this.targetScore) this.state = 'victory';
              else if (this.moves <= 0) this.state = 'gameover';
              else {
                if (!this.hasMoves()) this.init();
                this.state = 'select_src';
              }
            }
          }
        }
      },

      render(ctx) {
        // 背景
        ctx.fillStyle = '#0a0f1d';
        ctx.fillRect(0, 0, 240, 320);

        // 顶部 HUD
        ctx.fillStyle = '#111827';
        ctx.fillRect(8, 8, 140, 32);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(8, 8, 140, 2);
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`SCORE ${this.score}`, 14, 28);

        ctx.fillStyle = '#111827';
        ctx.fillRect(154, 8, 78, 32);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(154, 8, 78, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillText(`MV ${this.moves}`, 162, 28);

        // Fever 能量条
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(8, 42, 224, 4);
        const fw = (this.fever * 224) / 100;
        if (fw > 0) {
          ctx.fillStyle = this.feverActive ? '#ef4444' : '#06b6d4';
          ctx.fillRect(8, 42, fw, 4);
        }

        // 棋盘背景网格
        ctx.fillStyle = '#161e2e';
        ctx.fillRect(10, 48, 6 * 36 + 4, 7 * 31 + 4);

        const gemColors = ['', '#ef4444', '#0284c7', '#22c55e', '#eab308', '#a855f7'];
        const hiColors  = ['', '#fca5a5', '#7dd3fc', '#86efac', '#fef08a', '#e9d5ff'];

        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            const gx = 12 + c * 36;
            const gy = 50 + r * 31;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(gx, gy, 36, 31);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(gx + 1, gy + 1, 34, 29);

            const gem = this.board[r][c];
            if (!gem) continue;
            const col = gem & 0x0F;
            const spec = gem & 0xF0;

            const isFlash = (this.state === 'anim_clear' && this.clearMask[r][c]);
            if (isFlash) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(gx + 2, gy + 2, 32, 27);
              continue;
            }

            if (spec === 0x80) {
              // 彩虹核
              ctx.fillStyle = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'][Math.floor(this.tick / 4) % 6];
            } else {
              ctx.fillStyle = gemColors[col] || '#38bdf8';
            }
            ctx.fillRect(gx + 3, gy + 3, 30, 25);
            ctx.fillStyle = hiColors[col] || '#ffffff';
            ctx.fillRect(gx + 4, gy + 4, 28, 2);
            ctx.fillRect(gx + 4, gy + 6, 2, 21);

            if (spec === 0x10) {
              // 横激光
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(gx + 6, gy + 14, 24, 3);
            } else if (spec === 0x20) {
              // 纵激光
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(gx + 16, gy + 6, 3, 19);
            }
          }
        }

        // 光标指示
        if (this.state === 'select_src') {
          const cx = 12 + this.cc * 36;
          const cy = 50 + this.cr * 31;
          ctx.strokeStyle = (Math.floor(this.tick / 4) % 2 === 0) ? '#fbbf24' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx + 1, cy + 1, 34, 29);
        } else if (this.state === 'select_dir') {
          const sx = 12 + this.sc * 36;
          const sy = 50 + this.sr * 31;
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
          ctx.strokeRect(sx + 1, sy + 1, 34, 29);

          const tx = 12 + this.tc * 36;
          const ty = 50 + this.tr * 31;
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
          ctx.strokeRect(tx + 1, ty + 1, 34, 29);
        }

        // 底部提示
        ctx.fillStyle = '#0b1329';
        ctx.fillRect(0, 280, 240, 40);
        ctx.fillStyle = '#64748b';
        ctx.font = '9px monospace';
        if (this.state === 'select_src') {
          ctx.fillText('OK LOCK  UP/DN MOVE', 14, 300);
        } else if (this.state === 'select_dir') {
          ctx.fillText('OK SWAP  UP/DN CHOOSE DIR', 14, 300);
        }

        if (this.state === 'gameover') drawOver(ctx, 'OUT OF MOVES', this.score);
        if (this.state === 'victory') drawOver(ctx, 'STAGE CLEAR', this.score);
      }
    },

    // --- 14. 齿轮骑兵：蒸汽狂飙 (Gear Cavalry: Turbo Surge) ---
    gearcavalry: {
      init() {
        this.y = 200;
        this.vy = 0;
        this.stance = 'run'; // 'run', 'jump', 'air_boost', 'plunge', 'slide'
        this.stanceTimer = 0;
        this.airJumps = 1;
        this.lanceExtended = false;
        this.lanceTimer = 0;
        this.lanceReach = 42;
        this.shockwave = { active: false, x: 0, r: 0, timer: 0 };
        this.hp = 5;
        this.score = 0;
        this.steam = 0; // 0 ~ 100 PSI
        this.overdrive = false;
        this.overdriveTimer = 0;
        this.invuln = 0;
        this.combo = 0;
        this.tick = 0;
        this.dead = false;
        this.scroll = 0;

        // 4 组地面咬合旋转大齿轮
        this.gears = [
          { x: 35,  y: 265, r: 24, a: 0, spd: 5.0 },
          { x: 95,  y: 265, r: 20, a: 20, spd: -6.0 },
          { x: 160, y: 265, r: 26, a: 45, spd: 4.5 },
          { x: 225, y: 265, r: 22, a: 10, spd: -5.5 }
        ];

        this.enemies = [];
        this.particles = [];
        this.spawnTimer = 0;
      },
      btn(code, snd, fx) {
        if (this.dead) {
          if (code === 'ok') {
            this.init();
            if (snd && snd.playJump) snd.playJump();
          }
          return;
        }

        if (code === 'up') {
          if (this.y >= 198) {
            // 地面起跳
            this.vy = -420;
            this.stance = 'jump';
            this.airJumps = 1;
            if (snd && snd.playJump) snd.playJump();
            this.emitSteam(50, 210, -30, -20);
          } else if (this.airJumps > 0) {
            // 空中二段跳！
            this.vy = -380;
            this.stance = 'air_boost';
            this.airJumps = 0;
            if (snd && snd.playJump) snd.playJump();
            this.emitSteam(55, this.y + 10, 0, 40);
          }
        } else if (code === 'down') {
          if (this.y < 196) {
            // 空中千斤坠重锤下刺！
            this.vy = 680;
            this.stance = 'plunge';
            if (snd && snd.playLaser) snd.playLaser();
          } else {
            // 地面涡轮滑铲
            this.stance = 'slide';
            this.stanceTimer = 16;
            if (snd && snd.playLaser) snd.playLaser();
            this.emitSparks(65, 216, 6);
          }
        } else if (code === 'ok') {
          if (this.steam >= 60 && !this.overdrive) {
            // 开启狂暴蒸汽过载！
            this.overdrive = true;
            this.overdriveTimer = 180;
            this.steam = 0;
            if (snd && snd.playPower) snd.playPower();
            if (fx) { fx.shake = 12; fx.flash = 6; }
          } else {
            // 骑枪超压加力暴刺！
            this.lanceExtended = true;
            this.lanceTimer = 14;
            this.lanceReach = 72;
            if (snd && snd.playLaser) snd.playLaser();
          }
        }
      },
      emitSteam(x, y, vx, vy) {
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            type: 'steam', x, y,
            vx: vx + (Math.random() * 20 - 10),
            vy: vy + (Math.random() * 20 - 10),
            life: 1.0, decay: 0.04
          });
        }
      },
      emitSparks(x, y, count) {
        for (let i = 0; i < count; i++) {
          this.particles.push({
            type: 'spark', x, y,
            vx: -90 - Math.random() * 70,
            vy: -30 - Math.random() * 50,
            life: 1.0, decay: 0.06,
            color: Math.random() > 0.4 ? '#fbbf24' : '#ef4444'
          });
        }
      },
      update(snd, fx) {
        if (this.dead) return;
        this.tick++;
        const dt = 0.025;
        this.scroll = (this.scroll + 6) % 32;

        if (this.invuln > 0) this.invuln--;
        if (this.overdrive) {
          if (--this.overdriveTimer <= 0) {
            this.overdrive = false;
          }
        }

        // 齿轮旋转
        for (const g of this.gears) {
          g.a = (g.a + g.spd) % 360;
        }

        // 竖直重力与砸地冲击波判定
        if (this.y < 200 || this.vy !== 0) {
          this.vy += 1050 * dt;
          this.y += this.vy * dt;
          if (this.y >= 200) {
            this.y = 200;
            this.vy = 0;

            if (this.stance === 'plunge') {
              // 砸地触发地脉冲击波！
              this.shockwave.active = true;
              this.shockwave.x = 75;
              this.shockwave.r = 20;
              this.shockwave.timer = 10;
              if (snd && snd.playHit) snd.playHit();
              if (fx) fx.shake = 8;
              this.emitSparks(85, 218, 10);
            }

            this.stance = 'run';
            this.airJumps = 1;
          }
        }

        // 冲击波扩散
        if (this.shockwave.active) {
          this.shockwave.r += 12;
          if (--this.shockwave.timer <= 0) this.shockwave.active = false;
        }

        // 动作计时
        if (this.stance === 'slide') {
          if (--this.stanceTimer <= 0) this.stance = 'run';
          if (this.tick % 2 === 0) this.emitSparks(65, 218, 2);
        }
        if (this.lanceExtended) {
          if (--this.lanceTimer <= 0) {
            this.lanceExtended = false;
            this.lanceReach = 42;
          }
        } else {
          this.lanceReach = 42;
        }

        // 排气管喷白烟
        if (this.tick % 3 === 0) {
          this.emitSteam(35, this.y - 18, -35, -20);
        }

        // 密集出怪
        if (++this.spawnTimer > 45) {
          this.spawnTimer = 0;
          const r = Math.random();
          if (r < 0.45) {
            this.enemies.push({ type: 'spider', x: 250, y: 204, vx: -180, hp: 1 });
          } else if (r < 0.8) {
            this.enemies.push({ type: 'falcon', x: 250, y: 140 + Math.random() * 25, vx: -150, hp: 1 });
          } else {
            this.enemies.push({ type: 'golem', x: 250, y: 188, vx: -100, hp: 2 });
          }
        }

        // 碰撞判定
        const px = 45;
        const py = (this.stance === 'slide') ? this.y + 8 : this.y - 16;
        const pw = 34;
        const ph = (this.stance === 'slide') ? 14 : 34;

        const lanceX = 45 + 24;
        const lanceY = (this.stance === 'slide') ? this.y + 8 : this.y - 8;
        const lanceW = this.lanceReach;
        const lanceH = 16;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          e.x += e.vx * dt;
          if (e.x < -30) { this.enemies.splice(i, 1); continue; }

          const ew = (e.type === 'golem') ? 26 : 18;
          const eh = (e.type === 'golem') ? 30 : 16;

          // A. 冲击波击杀
          if (this.shockwave.active && (e.type === 'spider' || e.type === 'golem')) {
            if (e.x >= this.shockwave.x && e.x <= this.shockwave.x + this.shockwave.r) {
              this.enemies.splice(i, 1);
              this.score += 200;
              this.combo++;
              this.steam = Math.min(100, this.steam + 25);
              if (snd && snd.playHit) snd.playHit();
              this.emitSparks(e.x + 8, e.y + 8, 8);
              continue;
            }
          }

          // B. 骑枪正面刺穿 (一击致命)
          if (lanceX < e.x + ew && lanceX + lanceW > e.x && lanceY < e.y + eh && lanceY + lanceH > e.y) {
            if (this.overdrive || --e.hp <= 0) {
              this.enemies.splice(i, 1);
              this.score += (e.type === 'golem' ? 350 : 150) * (this.combo > 0 ? this.combo : 1);
              this.combo++;
              this.steam = Math.min(100, this.steam + 20);
              if (snd && snd.playHit) snd.playHit();
              this.emitSparks(e.x + 8, e.y + 8, 8);
              continue;
            } else {
              e.x += 20; // 击退
              if (snd && snd.playHit) snd.playHit();
              continue;
            }
          }

          // C. 滑铲碾碎发条蜘蛛
          if (this.stance === 'slide' && e.type === 'spider') {
            if (px < e.x + ew && px + pw > e.x && py < e.y + eh && py + ph > e.y) {
              this.enemies.splice(i, 1);
              this.score += 180 * (this.combo > 0 ? this.combo : 1);
              this.combo++;
              this.steam = Math.min(100, this.steam + 20);
              if (snd && snd.playHit) snd.playHit();
              this.emitSparks(e.x + 8, e.y + 8, 8);
              continue;
            }
          }

          // D. 玩家碰撞
          if (px < e.x + ew && px + pw > e.x && py < e.y + eh && py + ph > e.y) {
            if (this.overdrive) {
              this.enemies.splice(i, 1);
              this.score += 300;
              this.combo++;
              if (snd && snd.playHit) snd.playHit();
              this.emitSparks(e.x + 8, e.y + 8, 12);
              if (fx) fx.shake = 6;
            } else if (this.invuln <= 0) {
              this.hp--;
              this.invuln = 45;
              this.combo = 0;
              if (snd && snd.playHurt) snd.playHurt();
              if (fx) { fx.shake = 8; fx.burst(px + 16, py + 16, 10, ['#ef4444', '#fbbf24']); }
              if (this.hp <= 0) {
                this.hp = 0;
                this.dead = true;
                if (snd && snd.playGameOver) snd.playGameOver();
              }
            }
          }
        }

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.type === 'spark') p.vy += 450 * dt;
          p.life -= p.decay;
          if (p.life <= 0) this.particles.splice(i, 1);
        }
      },
      render(ctx) {
        // 1. 深邃工坊背景
        ctx.fillStyle = '#110e0c';
        ctx.fillRect(0, 0, 240, 320);

        // 2. 远景速度线
        ctx.fillStyle = '#2a221a';
        ctx.fillRect((80 - this.scroll * 2 + 240) % 240, 70, 80, 2);
        ctx.fillRect((180 - this.scroll * 2 + 240) % 240, 110, 100, 2);
        ctx.fillRect((30 - this.scroll * 2 + 240) % 240, 150, 70, 2);

        // 3. 地表黄铜轨道
        ctx.fillStyle = '#d97706';
        ctx.fillRect(0, 220, 240, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(0, 223, 240, 2);
        ctx.fillStyle = '#1c1815';
        ctx.fillRect(0, 225, 240, 75);

        // 地面极速飞掠线条
        ctx.fillStyle = '#44372c';
        for (let gx = -32; gx < 240; gx += 32) {
          ctx.fillRect(gx + this.scroll, 228, 14, 2);
        }

        // 4. 地面 4 组大齿轮 (交替闪烁，超强动态旋转感)
        const phase = Math.floor(this.tick / 2) % 4;
        for (const g of this.gears) {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(g.x - g.r + 3, g.y - g.r + 3, (g.r - 3) * 2, (g.r - 3) * 2);
          ctx.fillStyle = '#f59e0b';
          if (phase === 0 || phase === 2) {
            ctx.fillRect(g.x - 3, g.y - g.r - 2, 6, 4);
            ctx.fillRect(g.x - 3, g.y + g.r - 2, 6, 4);
            ctx.fillRect(g.x - g.r - 2, g.y - 3, 4, 6);
            ctx.fillRect(g.x + g.r - 2, g.y - 3, 4, 6);
          } else {
            const d = Math.floor(g.r * 0.7);
            ctx.fillRect(g.x - d - 2, g.y - d - 2, 4, 4);
            ctx.fillRect(g.x + d - 2, g.y - d - 2, 4, 4);
            ctx.fillRect(g.x - d - 2, g.y + d - 2, 4, 4);
            ctx.fillRect(g.x + d - 2, g.y + d - 2, 4, 4);
          }
          ctx.fillStyle = '#110e0c';
          ctx.fillRect(g.x - 3, g.y - 3, 6, 6);
        }

        // 5. 冲击波
        if (this.shockwave.active) {
          ctx.fillStyle = '#fde047';
          ctx.fillRect(this.shockwave.x, 216, this.shockwave.r, 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(this.shockwave.x + this.shockwave.r, 212, 6, 14);
        }

        // 6. 粒子
        for (const p of this.particles) {
          if (p.type === 'steam') {
            ctx.fillStyle = `rgba(240, 244, 248, ${Math.max(0, p.life * 0.75)})`;
            ctx.fillRect(p.x - 2, p.y - 2, 5, 5);
          } else {
            ctx.fillStyle = p.color || '#fbbf24';
            ctx.fillRect(p.x, p.y, 2, 2);
          }
        }

        // 7. 敌兵
        for (const e of this.enemies) {
          if (e.type === 'spider') {
            ctx.fillStyle = '#334155'; ctx.fillRect(e.x + 2, e.y + 4, 14, 8);
            ctx.fillStyle = '#f59e0b'; ctx.fillRect(e.x + 6, e.y, 6, 4);
            ctx.fillStyle = '#1e293b'; ctx.fillRect(e.x, e.y + 10, 4, 5); ctx.fillRect(e.x + 14, e.y + 10, 4, 5);
            ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x + 2, e.y + 6, 3, 3);
          } else if (e.type === 'falcon') {
            const w = (this.tick % 2 === 0) ? -3 : 3;
            ctx.fillStyle = '#94a3b8'; ctx.fillRect(e.x, e.y + w, 18, 3);
            ctx.fillStyle = '#dc2626'; ctx.fillRect(e.x + 4, e.y + 3, 12, 8);
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(e.x + 1, e.y + 5, 4, 3);
          } else if (e.type === 'golem') {
            ctx.fillStyle = '#1e293b'; ctx.fillRect(e.x, e.y + 6, 24, 22);
            ctx.fillStyle = '#92400e'; ctx.fillRect(e.x + 4, e.y + 10, 16, 14);
            ctx.fillStyle = '#475569'; ctx.fillRect(e.x + 4, e.y, 16, 6);
            ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x + 6, e.y + 2, 12, 3);
          }
        }

        // 8. 战马与骑手
        if (this.invuln <= 0 || Math.floor(this.tick / 3) % 2 === 0) {
          const px = 45;
          const py = Math.floor(this.y);
          const armorCol = this.overdrive ? '#38bdf8' : '#b45309';
          const steelCol = this.overdrive ? '#e0f2fe' : '#475569';
          const glowCol  = this.overdrive ? '#ffffff' : '#fbbf24';

          if (this.stance === 'slide') {
            ctx.fillStyle = steelCol; ctx.fillRect(px - 6, py + 10, 36, 12);
            ctx.fillStyle = armorCol; ctx.fillRect(px + 2, py + 8, 26, 8);
            ctx.fillStyle = armorCol; ctx.fillRect(px + 28, py + 8, 12, 8);
            ctx.fillStyle = glowCol;  ctx.fillRect(px + 36, py + 10, 3, 3);
            ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 8, py + 4, 14, 6);
            ctx.fillStyle = '#f97316'; ctx.fillRect(px - 18, py + 14, 16, 4);
            // 骑枪
            ctx.fillStyle = steelCol; ctx.fillRect(px + 26, py + 10, this.lanceReach, 4);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 26 + this.lanceReach - 2, py + 8, 8, 8);
          } else {
            // 马身
            ctx.fillStyle = steelCol; ctx.fillRect(px - 4, py - 4, 30, 18);
            ctx.fillStyle = armorCol; ctx.fillRect(px, py - 6, 24, 18);
            ctx.fillStyle = '#334155'; ctx.fillRect(px - 8, py - 14, 5, 12);
            ctx.fillStyle = glowCol;  ctx.fillRect(px - 9, py - 16, 7, 3);
            // 骑士
            ctx.fillStyle = '#1e293b'; ctx.fillRect(px + 4, py - 18, 14, 14);
            ctx.fillStyle = armorCol; ctx.fillRect(px + 8, py - 24, 10, 10);
            ctx.fillStyle = glowCol;  ctx.fillRect(px + 14, py - 21, 4, 2);
            // 马头
            ctx.fillStyle = armorCol; ctx.fillRect(px + 20, py - 14, 10, 14);
            ctx.fillStyle = armorCol; ctx.fillRect(px + 24, py - 20, 12, 12);
            ctx.fillStyle = glowCol;  ctx.fillRect(px + 32, py - 18, 4, 3);
            // 蹄腿
            const leg = (Math.floor(this.tick / 2) % 2 === 0) ? 4 : -4;
            ctx.fillStyle = steelCol;
            ctx.fillRect(px + 18 + leg, py + 14, 5, 8);
            ctx.fillRect(px - 2 - leg, py + 14, 5, 8);

            // 骑枪
            if (this.stance === 'plunge') {
              ctx.fillStyle = steelCol; ctx.fillRect(px + 26, py + 2, 18, 18);
              ctx.fillStyle = '#fde047'; ctx.fillRect(px + 34, py + 10, 16, 16);
              ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 44, py + 20, 14, 14);
            } else {
              ctx.fillStyle = steelCol; ctx.fillRect(px + 26, py - 8, this.lanceReach, 5);
              ctx.fillStyle = glowCol;  ctx.fillRect(px + 32, py - 7, this.lanceReach - 8, 3);
              ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 24 + this.lanceReach, py - 10, 8, 9);
              if (this.lanceExtended) {
                ctx.fillStyle = '#38bdf8'; ctx.fillRect(px + 30 + this.lanceReach, py - 12, 6, 13);
              }
            }
          }
        }

        // 9. 顶部 HUD
        ctx.fillStyle = 'rgba(28, 24, 21, 0.9)';
        ctx.fillRect(0, 0, 240, 36);
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 240, 36);

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px monospace';
        ctx.fillText(`SCR:${this.score}  x${this.combo > 1 ? this.combo : 1}`, 6, 14);

        ctx.fillStyle = '#22c55e';
        let hpStr = 'HP:';
        for (let i = 0; i < 5; i++) hpStr += (i < this.hp) ? '#' : '.';
        ctx.fillText(hpStr, 150, 14);

        if (this.overdrive) {
          ctx.fillStyle = (Math.floor(this.tick / 2) % 2 === 0) ? '#38bdf8' : '#ffffff';
          ctx.fillText('>>> TURBO SURGE! <<<', 6, 28);
        } else if (this.steam >= 60) {
          ctx.fillStyle = (Math.floor(this.tick / 4) % 2 === 0) ? '#fbbf24' : '#ef4444';
          ctx.fillText('[OK] OVERDRIVE READY!', 6, 28);
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`STEAM: ${this.steam} PSI`, 6, 28);
        }

        // 底部提示
        ctx.fillStyle = '#d97706';
        ctx.font = '9px monospace';
        ctx.fillText('UP:JUMP/2ND  DN:PLUNGE/SLIDE  OK:OVERDRIVE', 6, 312);

        if (this.dead) drawOver(ctx, 'CORE SHUTDOWN', this.score);
      }
    },

    // --- 15. 霓虹疾行：影刃闪现 V2.0 (Cyber Courier: Phantom Dash) ---
    cyberrunner: {
      init() {
        this.y = 230;
        this.vy = 0;
        this.renderXOff = 0;
        this.stance = 'run'; // 'run', 'jump', 'double_jump', 'wall_slide', 'slide', 'dive', 'blink', 'fall'
        this.stanceTimer = 0;
        this.airJumps = 1;
        this.blinkCharges = 3;
        this.blinkRecharge = 0;
        this.phaseShift = false;
        this.phaseTimer = 0;

        this.isWallSliding = false;
        this.coyoteTimer = 0;
        this.jumpBuffer = 0;

        this.slashActive = false;
        this.slashTimer = 0;
        this.slashStart = { x: 0, y: 0 };
        this.slashTarget = { x: 0, y: 0 };

        this.shockwaveActive = false;
        this.shockwaveTimer = 0;
        this.shockwaveX = 0;
        this.shockwaveY = 0;
        this.shockwaveR = 0;

        this.hp = 3;
        this.maxHp = 3;
        this.shield = false;
        this.score = 0;
        this.dist = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.invuln = 0;
        this.dead = false;

        this.speed = 180;
        this.bgFar = 0;
        this.bgMid = 0;
        this.tick = 0;

        // 初始大楼
        this.buildings = [
          { x: 0, y: 230, w: 170, glass: false, crumble: 0, fallen: false },
          { x: 190, y: 220, w: 150, glass: false, crumble: 0, fallen: false },
          { x: 360, y: 240, w: 150, glass: false, crumble: 0, fallen: false },
          { x: 530, y: 215, w: 160, glass: false, crumble: 0, fallen: false },
          { x: 710, y: 230, w: 160, glass: false, crumble: 0, fallen: false }
        ];

        // 初始障碍物与道具 (开局生动丰富)
        this.hazards = [
          { type: 'laser_low', x: 190 + 75, y: 220 - 10, w: 16, h: 10, active: true },
          { type: 'drone', x: 360 + 70, y: 240 - 34, w: 18, h: 14, bob: 0, active: true },
          { type: 'vent', x: 530 + 65, y: 215 - 6, w: 20, h: 6, active: true },
          { type: 'drone', x: 710 + 80, y: 230 - 36, w: 18, h: 14, bob: 0, active: true }
        ];
        this.items = [
          { type: 'gem', x: 190 + 40, y: 220 - 24, bob: 0, active: true },
          { type: 'battery', x: 530 + 120, y: 215 - 24, bob: 0, active: true }
        ];
        this.projectiles = [];
        this.particles = [];
        this.afterimages = [];

        // 围巾质点
        this.scarf = [];
        for (let i = 0; i < 5; i++) {
          this.scarf.push({ x: 48 - i * 6, y: 210 });
        }
      },

      key(btn, down, snd, fx) {
        if (!down) return;
        if (this.dead) {
          if (btn === 'ok' || btn === 'up') this.init();
          return;
        }

        if (btn === 'up') {
          if (this.isWallSliding) {
            // 蹬墙反弹跳 (Wall Kick)!
            this.isWallSliding = false;
            this.stance = 'jump';
            this.vy = -360;
            this.airJumps = 1;
            if (snd) snd.playJump();
            if (fx) {
              fx.burst(64, this.y - 12, 10, ['#facc15', '#ffffff']);
              fx.float(54, this.y - 20, 'WALL KICK!', '#facc15');
            }
          } else if (this.stance === 'run' || this.stance === 'slide' || this.coyoteTimer > 0) {
            this.coyoteTimer = 0;
            this.stance = 'jump';
            this.vy = -330;
            this.airJumps = 1;
            if (snd) snd.playJump();
            if (fx) fx.burst(50, this.y, 6, ['#facc15', '#ffffff']);
          } else if (this.airJumps > 0) {
            // 阿童木火箭靴喷火腾跃两段跳
            this.airJumps = 0;
            this.stance = 'double_jump';
            this.vy = -310;
            if (snd) snd.playJump();
            if (fx) fx.burst(52, this.y + 4, 10, ['#facc15', '#f97316', '#ffffff']);
          } else {
            this.jumpBuffer = 0.12;
          }
        } else if (btn === 'down') {
          if (this.stance === 'run') {
            this.stance = 'slide';
            this.stanceTimer = 0.42;
            if (snd) snd.playLaser();
            if (fx) fx.burst(44, this.y, 6, ['#f97316', '#facc15']);
          } else if (this.stance === 'jump' || this.stance === 'double_jump' || this.stance === 'blink' || this.stance === 'fall' || this.stance === 'wall_slide') {
            this.stance = 'dive';
            this.vy = 650;
            this.isWallSliding = false;
          }
        } else if (btn === 'ok') {
          // ★★★ 发射向前飞旋的月牙光刃 / 飞刀 (Crescent Moon Blade) ★★★
          const px = 48 + this.renderXOff;
          const py = this.y - 15;

          if (this.projectiles.length < 4) {
            this.projectiles.push({
              x: px + 16,
              y: py + 2,
              vx: 420,
              rot: 0,
              life: 0.7,
              active: true
            });
          }

          let target = null;
          let minDist = 999;
          for (const h of this.hazards) {
            if (!h.active) continue;
            if (h.x >= px - 10 && h.x <= px + 75 && h.y + h.h >= py - 20 && h.y <= py + 45) {
              const d = h.x - px;
              if (d < minDist) { minDist = d; target = h; }
            }
          }

          this.slashActive = true;
          this.slashTimer = 0.12;
          this.slashStart = { x: px, y: py };

          if (target) {
            target.active = false;
            this.slashTarget = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
            this.score += 200 * (1 + this.combo);
            this.combo++;
            this.comboTimer = 3.0;
            // 杀怪刷新二段跳 (Kill Reset)
            this.airJumps = 1;
            if (this.blinkCharges < 3) this.blinkCharges++;
            this.vy = -310;
            this.renderXOff = 36;
            this.phaseShift = true;
            this.phaseTimer = 0.18;
            this.stance = 'jump';
            if (snd) snd.playExplode(false);
            if (fx) {
              fx.burst(target.x + target.w / 2, target.y + target.h / 2, 14, ['#facc15', '#ffffff', '#ef4444']);
              fx.float(target.x, target.y - 12, 'SLASH!', '#facc15');
            }
          } else {
            this.slashTarget = { x: px + 60, y: py };
            if (snd) snd.playLaser();
            if (this.blinkCharges > 0 && !this.phaseShift) {
              this.blinkCharges--;
              this.phaseShift = true;
              this.phaseTimer = 0.18;
              this.stance = 'blink';
              this.vy = 0;
              this.renderXOff = 36;
              this.afterimages = [
                { x: 32, y: this.y, alpha: 0.8, col: '#facc15' },
                { x: 20, y: this.y, alpha: 0.6, col: '#ef4444' },
                { x: 8,  y: this.y, alpha: 0.4, col: '#38bdf8' }
              ];
              if (fx) fx.burst(54, this.y - 14, 10, ['#facc15', '#ef4444', '#ffffff']);
            }
          }
        }
      },

      update(dt, snd, fx) {
        if (this.dead) return;
        this.tick++;

        if (this.speed < 320) this.speed += 0.8 * dt;
        const dx = this.speed * dt;
        this.dist += Math.floor(dx * 0.12);
        this.score += Math.floor(dx * 0.2);

        this.bgFar = (this.bgFar + dx * 0.15) % 240;
        this.bgMid = (this.bgMid + dx * 0.45) % 240;

        if (this.invuln > 0) this.invuln -= dt;
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) this.combo = 0;
        }

        if (this.slashActive) {
          this.slashTimer -= dt;
          if (this.slashTimer <= 0) this.slashActive = false;
        }
        if (this.shockwaveActive) {
          this.shockwaveTimer -= dt;
          this.shockwaveR += 140 * dt;
          if (this.shockwaveTimer <= 0) this.shockwaveActive = false;
        }

        // 闪现充能
        if (this.blinkCharges < 3 && (this.stance === 'run' || this.stance === 'slide')) {
          this.blinkRecharge += dt;
          if (this.blinkRecharge >= 4.0) {
            this.blinkCharges++;
            this.blinkRecharge = 0;
          }
        }

        // 闪现相位
        if (this.phaseShift) {
          this.renderXOff *= 0.88;
          this.phaseTimer -= dt;
          if (this.phaseTimer <= 0) {
            this.phaseShift = false;
            if (this.stance === 'blink') this.stance = 'fall';
          }
        }

        // 滑铲
        if (this.stance === 'slide') {
          this.stanceTimer -= dt;
          if (this.stanceTimer <= 0) this.stance = 'run';
        }

        // 重力物理 (贴墙下滑时减速 60%)
        const prevY = this.y;
        if (!this.phaseShift && this.stance !== 'run' && this.stance !== 'slide') {
          if (this.isWallSliding) {
            if (this.vy > 90) this.vy = 90;
            else this.vy += (1350 * 0.35) * dt;
          } else {
            this.vy += 1350 * dt;
          }
          this.y += this.vy * dt;
        }

        // 大楼位移与着陆
        let onGround = false;
        let groundY = 999;
        let wallTouched = false;
        let maxRight = 0;
        let lastY = 220;

        for (const b of this.buildings) {
          b.x -= dx;
          if (b.x + b.w > maxRight) { maxRight = b.x + b.w; lastY = b.y; }

          // A. 楼顶着陆 (脚部碰撞盒范围：48+4=52 到 48+22=70)
          if (!b.fallen && b.x <= 70 && (b.x + b.w) >= 52) {
            if (prevY <= b.y + 5 && this.y >= b.y - 2) {
              onGround = true;
              groundY = b.y;
              if (b.glass) {
                b.crumble += dt;
                if (b.crumble >= 0.35) {
                  b.fallen = true;
                  if (fx) fx.burst(b.x + b.w / 2, b.y, 10, ['#00ffff', '#ffffff']);
                }
              }
            }
          }

          // B. 侧面撞击大楼 -> 贴墙下滑 (Wall Slide)
          if (!onGround && (this.stance === 'jump' || this.stance === 'double_jump' || this.stance === 'fall' || this.stance === 'wall_slide')) {
            const playerRight = 48 + 26;
            if (b.x <= playerRight + 3 && b.x >= playerRight - 6) {
              if (this.y > b.y + 6 && this.y < b.y + 120) {
                wallTouched = true;
              }
            }
          }
        }

        // 贴墙下滑状态
        if (wallTouched && !onGround) {
          this.isWallSliding = true;
          this.stance = 'wall_slide';
          if (this.vy > 90) this.vy = 90;
        } else {
          this.isWallSliding = false;
        }

        // 回收大楼
        for (let i = 0; i < this.buildings.length; i++) {
          const b = this.buildings[i];
          if (b.x + b.w < -20) {
            const gap = 36 + Math.floor(Math.random() * 36);
            const w = 130 + Math.floor(Math.random() * 90);
            const dy = (Math.random() * 70) - 35;
            let targetY = lastY + dy;
            if (targetY < 190) targetY = 190;
            if (targetY > 255) targetY = 255;

            b.x = maxRight + gap;
            b.y = targetY;
            b.w = w;
            b.glass = (this.dist > 120 && Math.random() < 0.18);
            b.crumble = 0;
            b.fallen = false;
            maxRight = b.x + b.w;
            lastY = b.y;

            // 障碍与道具生成 (丰富多彩)
            if (w >= 90 && !b.glass) {
              const r = Math.random();
              if (r < 0.55) {
                const ht = Math.floor(Math.random() * 3);
                if (ht === 0) {
                  this.hazards.push({ type: 'laser_low', x: b.x + b.w * 0.55, y: b.y - 10, w: 16, h: 10, active: true });
                } else if (ht === 1) {
                  this.hazards.push({ type: 'laser_high', x: b.x + b.w * 0.5, y: b.y - 28, w: 16, h: 10, active: true });
                } else {
                  this.hazards.push({ type: 'drone', x: b.x + b.w * 0.5, y: b.y - 34, w: 18, h: 14, bob: 0, active: true });
                }
              } else if (r < 0.75) {
                this.hazards.push({ type: 'vent', x: b.x + b.w * 0.45, y: b.y - 6, w: 20, h: 6, active: true });
              } else if (r < 0.95) {
                const it = Math.random();
                const type = it < 0.6 ? 'gem' : (it < 0.9 ? 'battery' : 'shield');
                this.items.push({ type, x: b.x + b.w * 0.5, y: b.y - 22, bob: 0, active: true });
              }
            }
          }
        }

        if (onGround) {
          if (this.stance === 'dive') {
            this.shockwaveActive = true;
            this.shockwaveTimer = 0.25;
            this.shockwaveX = 48 + 9;
            this.shockwaveY = groundY;
            this.shockwaveR = 10;
            if (snd) snd.playExplode(false);
            if (fx) fx.burst(52, groundY, 12, ['#00ffff', '#ffffff']);
            // 俯冲震荡波砸碎周围地面陷阱
            for (const h of this.hazards) {
              if (h.active && Math.abs(h.y - groundY) < 15 && Math.abs(h.x - (48 + 9)) < 65) {
                h.active = false;
                this.score += 100;
              }
            }
          }
          this.y = groundY;
          this.vy = 0;
          this.airJumps = 1;
          if (this.stance !== 'slide') this.stance = 'run';
          if (this.jumpBuffer > 0) {
            this.stance = 'jump';
            this.vy = -330;
            this.airJumps = 1;
            this.jumpBuffer = 0;
            if (snd) snd.playJump();
          }
        } else {
          if (this.stance === 'run' || this.stance === 'slide') {
            this.stance = 'fall';
            this.coyoteTimer = 0.12;
          }
        }

        if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
        if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

        // 掉落深渊
        if (this.y > 330) {
          this.dead = true;
          if (snd) snd.playExplode(true);
          return;
        }

        // 月牙光刃 / 飞刀投射物更新与命中检测
        for (const p of this.projectiles) {
          if (!p.active) continue;
          p.x += p.vx * dt;
          p.rot = (p.rot + 720 * dt) % 360;
          p.life -= dt;
          if (p.life <= 0 || p.x > 260) { p.active = false; continue; }

          for (const h of this.hazards) {
            if (!h.active) continue;
            if (p.x + 7 > h.x && p.x - 7 < h.x + h.w && p.y + 7 > h.y && p.y - 7 < h.y + h.h) {
              if (h.type === 'drone' || h.type === 'laser_low' || h.type === 'laser_high') {
                h.active = false;
                p.active = false;
                this.score += 200 * (1 + this.combo);
                this.combo++;
                this.comboTimer = 3.0;
                this.airJumps = 1; // 杀怪刷新二段跳！
                if (snd) snd.playExplode(false);
                if (fx) {
                  fx.burst(h.x + h.w / 2, h.y + h.h / 2, 12, ['#facc15', '#ffffff', '#ef4444']);
                  fx.float(h.x, h.y - 12, 'SLASH!', '#facc15');
                }
                break;
              }
            }
          }
        }

        // 障碍检测
        const px = 48 + this.renderXOff;
        const pw = 26;
        const ph = (this.stance === 'slide') ? 20 : 42;
        const py = this.y - ph;

        for (const h of this.hazards) {
          if (!h.active) continue;
          h.x -= dx;
          if (h.type === 'drone') {
            h.bob = (h.bob || 0) + dt * 3.5;
            h.y += Math.sin(h.bob) * 0.8;
          }
          if (h.x + h.w < -20) { h.active = false; continue; }

          if (px < h.x + h.w && px + pw > h.x && py < h.y + h.h && py + ph > h.y) {
            if (h.type === 'vent') {
              this.vy = -560;
              this.stance = 'jump';
              this.airJumps = 1;
              if (snd) snd.playMissile();
              if (fx) fx.burst(h.x + 10, h.y, 8, ['#00ffff', '#ffffff']);
            } else if (h.type === 'drone') {
              if (this.phaseShift) {
                h.active = false;
                this.score += 200 * (1 + this.combo);
                this.combo++;
                this.comboTimer = 3.0;
                this.airJumps = 1;
                if (snd) snd.playExplode(false);
                if (fx) fx.burst(h.x + 8, h.y + 7, 12, ['#00ffff', '#ffffff']);
              } else if (this.invuln <= 0) {
                this.takeDamage(snd, fx);
              }
            } else if (h.type === 'laser_wall' || h.type === 'laser_low' || h.type === 'laser_high') {
              if (this.phaseShift) {
                this.score += 50;
                this.combo++;
                this.comboTimer = 2.0;
              } else if (this.invuln <= 0) {
                this.takeDamage(snd, fx);
              }
            }
          }
        }

        // 道具拾取
        for (const it of this.items) {
          if (!it.active) continue;
          it.x -= dx;
          it.bob = (it.bob || 0) + dt * 4;
          const iy = it.y + Math.sin(it.bob) * 3;
          if (it.x < -20) { it.active = false; continue; }

          if (px < it.x + 10 && px + pw > it.x - 6 && py < iy + 10 && py + ph > iy - 6) {
            it.active = false;
            if (snd) snd.playCoin();
            if (it.type === 'gem') {
              this.score += 50 * (1 + this.combo);
              this.combo++;
              this.comboTimer = 2.5;
              if (fx) fx.float(it.x, iy, '+50', '#00ffff');
            } else if (it.type === 'battery') {
              this.blinkCharges = 3;
              this.score += 100;
              if (fx) fx.float(it.x, iy, 'FULL ⚡', '#10b981');
            } else if (it.type === 'shield') {
              this.shield = true;
              this.score += 150;
              if (fx) fx.float(it.x, iy, 'SHIELD', '#00ffff');
            }
          }
        }

        // 围巾物理
        this.scarf[0].x = px + 6;
        this.scarf[0].y = py + 14;
        for (let i = 1; i < this.scarf.length; i++) {
          const tx = this.scarf[i - 1].x - 5.5;
          const wave = Math.sin(this.tick * 0.25 + i * 0.8) * 2.2;
          const ty = this.scarf[i - 1].y + wave + (this.vy * 0.015);
          this.scarf[i].x += (tx - this.scarf[i].x) * 0.65;
          this.scarf[i].y += (ty - this.scarf[i].y) * 0.55;
        }

        // 残影衰减
        for (const img of this.afterimages) {
          if (img.alpha > 0) img.alpha -= dt * 4;
        }
      },

      takeDamage(snd, fx) {
        if (this.shield) {
          this.shield = false;
          this.invuln = 1.2;
          if (snd) snd.playLaser();
          if (fx) fx.burst(52, this.y - 15, 8, ['#00ffff', '#ffffff']);
        } else {
          this.hp--;
          this.combo = 0;
          this.invuln = 1.5;
          if (snd) snd.playLaser();
          if (fx) fx.burst(52, this.y - 15, 10, ['#ff0055', '#ef4444']);
          if (this.hp <= 0) {
            this.dead = true;
            if (snd) snd.playExplode(true);
          }
        }
      },

      render(ctx) {
        // 1. 极简暗夜深空背景 (纯粹、深邃、完全退居幕后，绝不争抢视觉焦点)
        ctx.fillStyle = '#0a0712'; ctx.fillRect(0, 0, 240, 320);

        // 2. 远景极暗大厦剪影 (极简深暗轮廓，仅提供微弱视差纵深，无任何刺眼发光点)
        const farOff = Math.floor(this.bgFar);
        for (let bx = -60; bx < 300; bx += 64) {
          const sx = bx - (farOff % 64);
          ctx.fillStyle = '#0e0b18';
          ctx.fillRect(sx, 80, 38, 160);
          ctx.fillRect(sx + 2, 72, 2, 8);
        }

        // 3. 中景暗调大厦 (低对比深暗剪影)
        const midOff = Math.floor(this.bgMid);
        for (let bx = -80; bx < 320; bx += 88) {
          const sx = bx - (midOff % 88);
          ctx.fillStyle = '#0c0916';
          ctx.fillRect(sx, 130, 48, 140);
        }

        // 4. 前景建筑屋顶平台 (沉稳纯净深黑平台 + 极简清晰的平台边缘)
        for (const b of this.buildings) {
          if (b.x + b.w < 0 || b.x >= 240) continue;
          if (b.glass && b.fallen) {
            ctx.fillStyle = '#06040a';
            ctx.fillRect(b.x, b.y + 4, b.w, 320 - b.y);
            continue;
          }

          ctx.fillStyle = b.glass ? '#0e0b16' : '#120f1e';
          ctx.fillRect(b.x, b.y + 2, b.w, 320 - b.y);

          // 屋顶平台边缘 (清晰功能性边缘，一眼看清落点即可，不晃眼)
          if (b.glass) {
            ctx.fillStyle = (b.crumble > 0) ? '#ef4444' : '#db2777';
            ctx.fillRect(b.x, b.y, b.w, 2);
          } else {
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(b.x, b.y, b.w, 1);
            ctx.fillStyle = '#0891b2'; ctx.fillRect(b.x, b.y + 1, b.w, 1);
          }
        }

        // 6. 俯冲震荡波
        if (this.shockwaveActive && this.shockwaveTimer > 0) {
          ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(this.shockwaveX, this.shockwaveY, this.shockwaveR, 4, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // 7. 陷阱与无人机
        for (const h of this.hazards) {
          if (!h.active || h.x + h.w < 0 || h.x > 240) continue;
          if (h.type === 'laser_low' || h.type === 'laser_high') {
            ctx.fillStyle = '#ff0055'; ctx.fillRect(h.x, h.y + 1, h.w, 4);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(h.x, h.y + 2, h.w, 2);
            ctx.fillStyle = '#64748b'; ctx.fillRect(h.x - 2, h.y, 3, h.h); ctx.fillRect(h.x + h.w - 1, h.y, 3, h.h);
          } else if (h.type === 'laser_wall') {
            ctx.fillStyle = '#be123c'; ctx.fillRect(h.x, h.y, h.w, h.h);
            ctx.fillStyle = '#ff0055'; ctx.fillRect(h.x + 1, h.y, h.w - 2, h.h);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(h.x + 2, h.y, 2, h.h);
          } else if (h.type === 'drone') {
            ctx.fillStyle = '#020617'; ctx.fillRect(h.x, h.y, h.w, h.h);
            ctx.fillStyle = '#facc15'; ctx.fillRect(h.x + 2, h.y + 2, h.w - 4, h.h - 4);
            ctx.fillStyle = '#ff0000'; ctx.fillRect(h.x + h.w / 2 - 2, h.y + h.h / 2 - 2, 4, 4);
            ctx.fillStyle = '#00ffff'; ctx.fillRect(h.x - 3, h.y + 1, 4, 2); ctx.fillRect(h.x + h.w - 1, h.y + 1, 4, 2);

            // 影刃锁定菱形框
            const px = 48 + this.renderXOff;
            if (h.x >= px - 10 && h.x <= px + 75) {
              ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1;
              ctx.strokeRect(h.x - 2, h.y - 2, h.w + 4, h.h + 4);
            }
          } else if (h.type === 'vent') {
            ctx.fillStyle = '#334155'; ctx.fillRect(h.x, h.y, h.w, h.h);
            ctx.fillStyle = '#00ffff'; ctx.fillRect(h.x + 2, h.y + 1, h.w - 4, h.h - 2);
            if (this.tick % 2 === 0) {
              ctx.fillStyle = '#ffffff'; ctx.fillRect(h.x + 5, h.y - 10, 2, 10);
            }
          }
        }

        // 8. 道具
        for (const it of this.items) {
          if (!it.active || it.x < -10 || it.x > 250) continue;
          const iy = it.y + Math.sin(it.bob || 0) * 3;
          if (it.type === 'gem') {
            ctx.fillStyle = '#00ffff'; ctx.fillRect(it.x - 3, iy - 4, 6, 8);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(it.x - 1, iy - 2, 2, 4);
          } else if (it.type === 'battery') {
            ctx.fillStyle = '#10b981'; ctx.fillRect(it.x - 4, iy - 4, 8, 8);
            ctx.fillStyle = '#6ee7b7'; ctx.fillRect(it.x - 2, iy - 2, 4, 4);
          } else if (it.type === 'shield') {
            ctx.fillStyle = '#00ffff'; ctx.fillRect(it.x - 5, iy - 5, 10, 10);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(it.x - 3, iy - 3, 6, 6);
          }
        }

        // 9. 月牙光刃 / 飞刀投射物渲染 (Crescent Moon Blade)
        for (const p of this.projectiles) {
          if (!p.active) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rot * Math.PI) / 180);

          // 月牙弧刃：外圈金黄 + 纯白锋刃
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(0, 0, 7, -Math.PI * 0.4, Math.PI * 0.4, false);
          ctx.arc(2, 0, 5, Math.PI * 0.4, -Math.PI * 0.4, true);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 6, -Math.PI * 0.25, Math.PI * 0.25, false);
          ctx.arc(1.5, 0, 4.5, Math.PI * 0.25, -Math.PI * 0.25, true);
          ctx.closePath();
          ctx.fill();

          // 两侧尖端高光
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-2, -6, 2, 2);
          ctx.fillRect(-2, 5, 2, 2);

          ctx.restore();
        }

        // 10. 极速冲刺/闪现破空流光线 (Aero Speed Streaks) —— 彻底消除纯黄色大方块，呈现流线型音爆光轨！
        for (const img of this.afterimages) {
          if (img.alpha > 0.15) {
            const ax = Math.floor(img.x);
            const ay = Math.floor(img.y - 42);
            ctx.globalAlpha = img.alpha;
            ctx.fillStyle = '#facc15'; ctx.fillRect(ax - 12, ay + 14, 18, 1);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(ax - 6,  ay + 24, 22, 1);
            ctx.fillStyle = '#38bdf8'; ctx.fillRect(ax - 16, ay + 34, 16, 1);
            ctx.globalAlpha = 1.0;
          }
        }

        // 11. 玩家主角 —— 【阿童木 / 超级飞人】(Astro Boy Super Flyer)
        // 经典前后翘尖角大发型 + 阳光清澈大眼睛(带纯白大高光球) + 健美身躯 + 经典大红短裤 + 翠绿腰带黄金扣 + 高筒大红火箭靴与强力喷火长焰！
        const hideBlink = (this.invuln > 0 && Math.floor(this.tick / 3) % 2 === 0);
        if (!hideBlink) {
          const px = 48 + this.renderXOff;
          const ph = (this.stance === 'slide') ? 20 : 42;
          const py = this.y - ph;

          // 阿童木经典纯正配色
          const COL_HAIR_DARK   = '#0f172a'; // 乌黑发色
          const COL_HAIR_LIGHT  = '#334155'; // 发顶发丝高光
          const COL_SKIN_BASE   = '#fed7aa'; // 阳光少年肤色
          const COL_SKIN_SHADOW = '#fdba74'; // 面部/下颌修容阴影
          const COL_EYE_PUPIL   = '#000000'; // 英雄大眼球/黑眼眶
          const COL_EYE_GLEAM   = '#ffffff'; // 晶莹大高光圆点
          const COL_BELT_GRN    = '#10b981'; // 翡翠绿腰带
          const COL_BELT_GOLD   = '#facc15'; // 纯金腰带方扣
          const COL_SHORTS_RED  = '#ef4444'; // 经典纯正大红短裤
          const COL_BOOT_RED    = '#dc2626'; // 经典正红火箭靴
          const COL_BOOT_TOP    = '#ffffff'; // 火箭靴白折边
          const COL_BOOT_NOZZLE = '#475569'; // 靴底坚固金属喷气口
          const COL_FLAME_CORE  = '#ffffff'; // 尾焰纯白热核
          const COL_FLAME_MID   = '#facc15'; // 尾焰金黄主束
          const COL_FLAME_OUT   = '#f97316'; // 尾焰炽橙外焰

          if (this.stance === 'slide') {
            // 1) 地面贴地极速滑铲 (超低姿态飞驰，身后火箭靴强力喷火推进)
            // 头部前探与双尖发型
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 22, py + 1, 4, 3); // 前额翘角
            ctx.fillRect(px + 14, py + 1, 9, 10); // 脑后黑发
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 17, py + 4, 8, 8);  // 脸庞
            ctx.fillStyle = COL_EYE_PUPIL;
            ctx.fillRect(px + 20, py + 5, 4, 5);  // 大眼睛
            ctx.fillStyle = COL_EYE_GLEAM;
            ctx.fillRect(px + 21, py + 5, 2, 2);  // 晶莹高光点

            // 水平流线身躯与绿腰带、红短裤
            ctx.fillStyle = COL_SKIN_BASE;  ctx.fillRect(px + 8, py + 6, 9, 8);
            ctx.fillStyle = COL_BELT_GRN;   ctx.fillRect(px + 5, py + 6, 3, 8);
            ctx.fillStyle = COL_BELT_GOLD;  ctx.fillRect(px + 6, py + 8, 2, 4);
            ctx.fillStyle = COL_SHORTS_RED; ctx.fillRect(px + 1, py + 6, 4, 8);

            // 笔直后伸的大红火箭靴
            ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px - 6, py + 7, 7, 6);
            ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px - 8, py + 7, 2, 6);

            // 火箭靴向后水平强力喷火长焰 (14px)
            ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px - 18, py + 8, 10, 4);
            ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px - 14, py + 8, 6, 3);
            ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px - 11, py + 9, 3, 2);
            ctx.fillStyle = '#ffffff';      ctx.fillRect(px + 6,  py + 18, 8, 2); // 地面火花
          } else if (this.stance === 'wall_slide') {
            // 2) 贴墙下滑姿态 (单手撑墙，外侧脚喷火缓冲)
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 3,  py - 3, 5, 4); // 脑后后翘大尖角
            ctx.fillRect(px + 14, py - 1, 4, 3); // 前额小尖角
            ctx.fillRect(px + 5,  py + 1, 12, 10);
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 8,  py + 4, 9, 8);
            ctx.fillStyle = COL_EYE_PUPIL;
            ctx.fillRect(px + 12, py + 5, 4, 5);
            ctx.fillStyle = COL_EYE_GLEAM;
            ctx.fillRect(px + 13, py + 5, 2, 2);

            // 身躯与服饰
            ctx.fillStyle = COL_SKIN_BASE;  ctx.fillRect(px + 5, py + 14, 11, 8);
            ctx.fillStyle = COL_BELT_GRN;   ctx.fillRect(px + 5, py + 22, 11, 3);
            ctx.fillStyle = COL_BELT_GOLD;  ctx.fillRect(px + 9, py + 22, 3, 3);
            ctx.fillStyle = COL_SHORTS_RED; ctx.fillRect(px + 5, py + 25, 11, 6);

            // 撑墙手臂
            ctx.fillStyle = COL_SKIN_BASE;  ctx.fillRect(px + 16, py + 15, 6, 4);

            // 大红火箭靴
            ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 6, py + 31, 8, 8);
            ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 6, py + 39, 8, 2);

            // 贴墙剧烈摩擦火花
            const spk_x = px + 26 - 1;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(spk_x, py + 18, 3, 3);
            ctx.fillStyle = '#facc15'; ctx.fillRect(spk_x, py + 26, 3, 5);
            ctx.fillStyle = COL_FLAME_MID; ctx.fillRect(px + 8, py + 41, 5, 3);
          } else if (this.stance === 'run') {
            // 3) 楼顶极速疾跑 (饱满生动的 2.5 头身阿童木形象)
            const runFrame = Math.floor(this.tick / 3) % 4;

            // 1. 脑后冲天耸立大后角 (阿童木第一剪影特征)
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 2, py - 4, 4, 4);
            ctx.fillRect(px + 4, py - 1, 6, 4);
            ctx.fillStyle = COL_HAIR_LIGHT;
            ctx.fillRect(px + 5, py + 1, 4, 3); // 尖角发丝高光
            // 2. 前额向前挑起的小帅发角
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 16, py - 2, 4, 4);
            ctx.fillRect(px + 18, py + 1, 3, 3);
            // 3. 乌黑发冠主体与高光
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 5, py + 2, 14, 6);
            ctx.fillStyle = COL_HAIR_LIGHT;
            ctx.fillRect(px + 8, py + 2, 7, 2);
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 4, py + 7, 5, 7);

            // 4. 阳光英雄面庞 (肉色大面积展现)
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 9, py + 7, 12, 9);
            ctx.fillStyle = COL_SKIN_SHADOW;
            ctx.fillRect(px + 11, py + 15, 7, 2);
            ctx.fillStyle = '#ea580c'; // 自信微笑嘴角
            ctx.fillRect(px + 18, py + 13, 2, 1);

            // 5. 传神英雄大眼睛 (5x7 像素，纯白大高光球，清澈灵动！)
            ctx.fillStyle = COL_EYE_PUPIL;
            ctx.fillRect(px + 13, py + 7, 6, 7);
            ctx.fillStyle = '#f8fafc'; // 眼白
            ctx.fillRect(px + 14, py + 12, 4, 2);
            ctx.fillStyle = COL_EYE_GLEAM; // 白色晶莹反光高光！
            ctx.fillRect(px + 14, py + 8, 3, 3);
            ctx.fillStyle = COL_EYE_PUPIL; // 浓密上睫毛
            ctx.fillRect(px + 12, py + 7, 6, 1);

            // 健美少年胸腹部与手臂摆动
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 7, py + 16, 12, 8);
            ctx.fillStyle = COL_SKIN_SHADOW;
            ctx.fillRect(px + 9, py + 19, 8, 1);

            if (runFrame === 0 || runFrame === 1) {
              ctx.fillStyle = COL_SKIN_BASE;
              ctx.fillRect(px + 17, py + 18, 6, 4); // 前伸摆臂
              ctx.fillRect(px + 22, py + 17, 3, 4); // 握拳
              ctx.fillRect(px + 2,  py + 17, 5, 4); // 后摆小臂
            } else {
              ctx.fillStyle = COL_SKIN_BASE;
              ctx.fillRect(px + 18, py + 16, 5, 4);
              ctx.fillRect(px + 2,  py + 18, 6, 4);
            }

            // 绿腰带与纯金方扣
            ctx.fillStyle = COL_BELT_GRN;  ctx.fillRect(px + 6, py + 24, 14, 3);
            ctx.fillStyle = COL_BELT_GOLD; ctx.fillRect(px + 11, py + 23, 4, 4);
            ctx.fillStyle = '#ffffff';     ctx.fillRect(px + 12, py + 24, 2, 2); // 金扣高光

            // 经典大红战斗短裤
            ctx.fillStyle = COL_SHORTS_RED; ctx.fillRect(px + 6, py + 27, 14, 6);
            ctx.fillStyle = '#991b1b';      ctx.fillRect(px + 12, py + 29, 1, 4); // 裤管分缝

            // 经典高筒大红火箭长靴 (双腿大步交替)
            if (runFrame === 0) {
              ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 13, py + 33, 8, 2);
              ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 13, py + 35, 8, 5);
              ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 13, py + 40, 8, 2);

              ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 2,  py + 32, 7, 2);
              ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 1,  py + 34, 7, 5);
              ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 1,  py + 39, 7, 2);
              ctx.fillStyle = COL_FLAME_MID;   ctx.fillRect(px - 1,  py + 41, 3, 2); // 脚跟推进微火花
            } else if (runFrame === 1 || runFrame === 3) {
              ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 8, py + 33, 8, 2);
              ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 8, py + 35, 8, 5);
              ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 8, py + 40, 8, 2);
            } else {
              ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 2,  py + 33, 7, 2);
              ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 2,  py + 35, 7, 5);
              ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 2,  py + 40, 7, 2);

              ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 13, py + 32, 8, 2);
              ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 14, py + 34, 8, 5);
              ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 14, py + 39, 8, 2);
              ctx.fillStyle = COL_FLAME_MID;   ctx.fillRect(px + 16, py + 41, 3, 2);
            }
          } else {
            // 4) 空中飞跃 / 两段跳 / 俯冲 —— 【超级飞人冲天飞行姿态】！
            // 经典前后双尖角
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 2, py - 4, 4, 4); // 冲天耸立后角
            ctx.fillRect(px + 4, py - 1, 6, 4);
            ctx.fillStyle = COL_HAIR_LIGHT;
            ctx.fillRect(px + 5, py + 1, 4, 3);
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 16, py - 2, 4, 4); // 前额微翘角
            ctx.fillRect(px + 18, py + 1, 3, 3);
            ctx.fillStyle = COL_HAIR_DARK;
            ctx.fillRect(px + 5, py + 2, 14, 6);
            ctx.fillStyle = COL_HAIR_LIGHT;
            ctx.fillRect(px + 8, py + 2, 7, 2);

            // 英雄大眼睛 (英姿飒爽向前看)
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 9, py + 7, 12, 9);
            ctx.fillStyle = COL_EYE_PUPIL;
            ctx.fillRect(px + 13, py + 7, 6, 7);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(px + 14, py + 12, 4, 2);
            ctx.fillStyle = COL_EYE_GLEAM;
            ctx.fillRect(px + 14, py + 8, 3, 3);

            // 超级飞人前冲飞拳！(标志性超人向前直拳飞行出拳)
            ctx.fillStyle = COL_SKIN_BASE;
            ctx.fillRect(px + 19, py + 16, 7, 4); // 前伸直臂
            ctx.fillRect(px + 25, py + 15, 5, 6); // 英雄握拳
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px + 26, py + 16, 2, 2); // 拳峰高光

            // 健美身躯与绿腰带黄金扣
            ctx.fillStyle = COL_SKIN_BASE;  ctx.fillRect(px + 7,  py + 16, 12, 8);
            ctx.fillStyle = COL_BELT_GRN;   ctx.fillRect(px + 6,  py + 24, 14, 3);
            ctx.fillStyle = COL_BELT_GOLD;  ctx.fillRect(px + 11, py + 23, 4, 4);
            ctx.fillStyle = '#ffffff';      ctx.fillRect(px + 12, py + 24, 2, 2);

            // 经典大红短裤
            ctx.fillStyle = COL_SHORTS_RED; ctx.fillRect(px + 6, py + 27, 14, 6);
            ctx.fillStyle = '#991b1b';      ctx.fillRect(px + 12, py + 29, 1, 4);

            // 飞行收腿姿态：双腿向后斜下方并拢，高筒红靴靴口白边分明
            ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 11, py + 33, 7, 2);
            ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 11, py + 35, 7, 6);
            ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 11, py + 40, 7, 2);

            ctx.fillStyle = COL_BOOT_TOP;    ctx.fillRect(px + 2,  py + 32, 7, 2);
            ctx.fillStyle = COL_BOOT_RED;    ctx.fillRect(px + 2,  py + 34, 7, 6);
            ctx.fillStyle = COL_BOOT_NOZZLE; ctx.fillRect(px + 2,  py + 39, 7, 2);

            // ★★★ 火箭靴推进尾焰 ★★★
            if (this.stance === 'double_jump') {
              // 两段跳：双管粗壮巨型火箭长焰 (长达 18 像素！)
              ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px + 11, py + 42, 7, 8);
              ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px + 12, py + 42, 5, 14);
              ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px + 13, py + 42, 3, 18);

              ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px + 2,  py + 41, 7, 8);
              ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px + 3,  py + 41, 5, 14);
              ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px + 4,  py + 41, 3, 18);
            } else if (this.stance === 'dive') {
              ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px + 11, py + 22, 6, 9);
              ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px + 12, py + 20, 4, 11);
              ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px + 13, py + 18, 2, 13);
            } else {
              // 一段跳或浮空：平稳火箭推进尾焰 (9 像素长)
              ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px + 12, py + 42, 5, 5);
              ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px + 13, py + 42, 3, 9);
              ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px + 14, py + 42, 1, 7);

              ctx.fillStyle = COL_FLAME_OUT;  ctx.fillRect(px + 3,  py + 41, 5, 5);
              ctx.fillStyle = COL_FLAME_MID;  ctx.fillRect(px + 4,  py + 41, 3, 9);
              ctx.fillStyle = COL_FLAME_CORE; ctx.fillRect(px + 5,  py + 41, 1, 7);
            }
          }

          if (this.shield) {
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
            ctx.strokeRect(px - 4, py - 4, 34, ph + 8);
          }
        }

        // 12. 飘逸流光绯红围巾 (高亮发光玫红)
        for (let i = 0; i < this.scarf.length; i++) {
          const sw = Math.max(3, 6 - i);
          ctx.fillStyle = '#ff1760';
          ctx.fillRect(this.scarf[i].x, this.scarf[i].y - 1, sw, 4);
          ctx.fillStyle = '#ffa8c4';
          ctx.fillRect(this.scarf[i].x + 1, this.scarf[i].y, sw - 2, 2);
        }

        // 12. HUD
        ctx.fillStyle = 'rgba(26, 16, 47, 0.85)';
        ctx.fillRect(0, 0, 240, 32);
        ctx.fillStyle = '#f8fafc'; ctx.font = '11px monospace';
        ctx.fillText(`${this.dist}m  ${this.score}`, 8, 14);

        ctx.fillStyle = '#00ffff';
        ctx.fillText(`⚡${this.blinkCharges}`, 110, 14);

        ctx.fillStyle = '#ff0055';
        let hpStr = '';
        for (let i = 0; i < this.maxHp; i++) hpStr += (i < this.hp) ? '♥' : '♡';
        if (this.shield) hpStr += ' [S]';
        ctx.fillText(hpStr, 180, 14);

        if (this.combo > 1) {
          ctx.fillStyle = '#fde047'; ctx.font = '10px monospace';
          ctx.fillText(`x${this.combo} ECHO`, 180, 26);
        }

        ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace';
        ctx.fillText('UP:JUMP/KICK  DN:SLIDE/DIVE  OK:BLADE SLASH', 6, 312);

        if (this.dead) drawOver(ctx, 'SIGNAL LOST', this.score);
      }
    }
  };

  global.GAMES = GAMES;

})(typeof window !== 'undefined' ? window : this);
