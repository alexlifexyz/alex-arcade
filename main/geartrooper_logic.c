// main/geartrooper_logic.c —— 《齿轮骑兵：蒸汽狂飙》(Gear Cavalry: Turbo Surge)
// 极致速度感、零卡顿、高爽度割草跑酷状态机。
#include "geartrooper_logic.h"
#include <string.h>
#include <math.h>

#define GRAVITY             1100.0f
#define SLIDE_DURATION_MS   380
#define LANCE_DURATION_MS   320
#define INVULN_DURATION_MS  1200
#define SPAWN_INTERVAL_MS   1100

// 快速伪随机数发生器
static inline uint32_t gt_rand(gt_game_t *game)
{
    game->rng_state = game->rng_state * 1664525u + 1013904223u;
    return game->rng_state;
}

// AABB 矩形碰撞检测
bool geartrooper_check_collision(float x1, float y1, float w1, float h1, float x2, float y2, float w2, float h2)
{
    return (x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2);
}

// 激发粒子 (零动态堆分配，循环对象池)
void geartrooper_emit_particle(gt_game_t *game, gt_part_type_t type, float x, float y, float vx, float vy, uint32_t color)
{
    if (!game) return;
    for (int i = 0; i < GT_MAX_PARTICLES; i++) {
        if (!game->particles[i].active) {
            game->particles[i].active = true;
            game->particles[i].type = type;
            game->particles[i].x = x;
            game->particles[i].y = y;
            game->particles[i].vx = vx;
            game->particles[i].vy = vy;
            game->particles[i].life = 1.0f;
            game->particles[i].decay = (type == PART_STEAM) ? 0.045f : 0.065f;
            game->particles[i].color = color;
            break;
        }
    }
}

// 生成敌兵
void geartrooper_spawn_enemy(gt_game_t *game, gt_enemy_type_t type, float x, float y)
{
    if (!game) return;
    for (int i = 0; i < GT_MAX_ENEMIES; i++) {
        if (!game->enemies[i].active) {
            game->enemies[i].active = true;
            game->enemies[i].type = type;
            game->enemies[i].x = x;
            game->enemies[i].y = y;
            game->enemies[i].anim_tick = 0;

            if (type == ENEMY_SPIDER) {
                // 地面快速发条蜘蛛
                game->enemies[i].vx = -180.0f;
                game->enemies[i].vy = 0.0f;
                game->enemies[i].hp = 1;
                game->enemies[i].max_hp = 1;
            } else if (type == ENEMY_FALCON) {
                // 空中低空掠过飞隼
                game->enemies[i].vx = -150.0f;
                game->enemies[i].vy = 0.0f;
                game->enemies[i].hp = 1;
                game->enemies[i].max_hp = 1;
            } else if (type == ENEMY_GOLEM) {
                // 重型带盾机甲傀儡
                game->enemies[i].vx = -100.0f;
                game->enemies[i].vy = 0.0f;
                game->enemies[i].hp = 2;
                game->enemies[i].max_hp = 2;
            }
            break;
        }
    }
}

// 初始化游戏状态
void geartrooper_init(gt_game_t *game, uint32_t seed)
{
    if (!game) return;
    memset(game, 0, sizeof(gt_game_t));
    game->rng_state = (seed == 0) ? 0x1234ABCD : seed;
    game->y = GT_GROUND_Y;
    game->vy = 0.0f;
    game->stance = STANCE_RUN;
    game->air_jumps_left = 1;
    game->world_speed = 220; // 极速疾驰

    game->lance_extended = false;
    game->lance_reach_px = 42; // 常驻超长锋刃

    game->gear_rpm = 160;
    game->steam_psi = 0;
    game->hp = 5;
    game->max_hp = 5;

    // 初始化 4 组地表咬合大齿轮
    game->gears[0] = (gt_gear_t){ .x = 35.0f,  .y = 265.0f, .radius = 24.0f, .angle_deg = 0.0f,  .speed_deg = 180.0f, .teeth_count = 8 };
    game->gears[1] = (gt_gear_t){ .x = 95.0f,  .y = 265.0f, .radius = 20.0f, .angle_deg = 22.0f, .speed_deg = -210.0f, .teeth_count = 8 };
    game->gears[2] = (gt_gear_t){ .x = 160.0f, .y = 265.0f, .radius = 26.0f, .angle_deg = 45.0f, .speed_deg = 160.0f, .teeth_count = 8 };
    game->gears[3] = (gt_gear_t){ .x = 225.0f, .y = 265.0f, .radius = 22.0f, .angle_deg = 15.0f, .speed_deg = -190.0f, .teeth_count = 8 };
}

// UP 键：地面跃马腾空；空中再按二段蒸汽喷气跳！
void geartrooper_input_up(gt_game_t *game)
{
    if (!game) return;
    if (game->game_over) {
        geartrooper_init(game, game->rng_state + 1);
        game->pending_sound = GT_SND_JUMP;
        return;
    }

    if (game->y >= GT_GROUND_Y - 2.0f) {
        // 地面一段大跳
        game->vy = -420.0f;
        game->stance = STANCE_JUMP;
        game->air_jumps_left = 1;
        game->pending_sound = GT_SND_JUMP;
        // 起跳喷气
        geartrooper_emit_particle(game, PART_STEAM, GT_HORSE_X + 8, GT_GROUND_Y + 4, -40.0f, -20.0f, 0xFFFFFF);
    } else if (game->air_jumps_left > 0) {
        // 空中二段蒸汽喷射跳！
        game->vy = -380.0f;
        game->stance = STANCE_AIR_BOOST;
        game->air_jumps_left = 0;
        game->pending_sound = GT_SND_JUMP;
        // 蹄底剧烈喷气爆发
        for (int i = 0; i < 4; i++) {
            geartrooper_emit_particle(game, PART_STEAM, GT_HORSE_X + 12, game->y + 12, -30.0f + (gt_rand(game) % 20), 40.0f + (gt_rand(game) % 30), 0xE2E8F0);
        }
    }
}

// DOWN 键：空中重装下刺砸地；地面涡轮极速滑铲！
void geartrooper_input_down(gt_game_t *game)
{
    if (!game || game->game_over) return;

    if (game->y < GT_GROUND_Y - 4.0f) {
        // 空中千斤坠下刺重击！
        game->vy = 680.0f;
        game->stance = STANCE_PLUNGE;
        game->pending_sound = GT_SND_STEAM_BLOW;
    } else {
        // 地面涡轮火花滑铲！
        game->stance = STANCE_SLIDE;
        game->stance_timer_ms = 0;
        game->pending_sound = GT_SND_SLIDE;
        // 贴地火花迸发
        for (int i = 0; i < 6; i++) {
            geartrooper_emit_particle(game, PART_SPARK, GT_HORSE_X + 24, GT_GROUND_Y + 12, -120.0f - (gt_rand(game) % 80), -30.0f - (gt_rand(game) % 50), 0xFBBF24);
        }
    }
}

// OK 键：加力延展螺旋骑枪 (超远贯穿)；达到 60 PSI 即可手动触发狂暴过载！
void geartrooper_input_ok(gt_game_t *game)
{
    if (!game) return;

    if (game->game_over) {
        geartrooper_init(game, game->rng_state + 1);
        game->pending_sound = GT_SND_JUMP;
        return;
    }

    if (game->steam_psi >= 60 && !game->overdrive_active) {
        // 开启狂暴蒸汽过载！
        game->overdrive_active = true;
        game->overdrive_ms = 4500;
        game->world_speed = 340;
        game->steam_psi = 0;
        game->pending_sound = GT_SND_OVERDRIVE;
        // 喷射耀斑粒子
        for (int i = 0; i < 8; i++) {
            geartrooper_emit_particle(game, PART_SPARK, GT_HORSE_X + 16, game->y, (float)(gt_rand(game) % 160 - 80), -60.0f - (gt_rand(game) % 60), 0x38BDF8);
        }
    } else {
        // 骑枪加力暴刺！
        game->lance_extended = true;
        game->lance_timer_ms = 0;
        game->lance_reach_px = 72;
        game->pending_sound = GT_SND_LANCE;
    }
}

// 单帧步进主逻辑
void geartrooper_step(gt_game_t *game, uint32_t dt_ms)
{
    if (!game || game->game_over) return;

    float dt = (float)dt_ms / 1000.0f;
    game->tick_count++;

    // 1. 无敌时间与过载倒计时
    if (game->invuln_timer_ms > dt_ms) {
        game->invuln_timer_ms -= dt_ms;
    } else {
        game->invuln_timer_ms = 0;
    }

    if (game->overdrive_active) {
        game->world_speed = 340; // 过载狂飙速度
        if (game->overdrive_ms > dt_ms) {
            game->overdrive_ms -= dt_ms;
        } else {
            game->overdrive_active = false;
            game->overdrive_ms = 0;
            game->world_speed = 220;
        }
    } else {
        game->world_speed = 220;
    }

    // 2. 视差滚动与行进距离
    game->distance_m += (uint32_t)(game->world_speed * dt);
    game->ground_scroll_px = (game->ground_scroll_px + (int)(game->world_speed * dt)) % 32;
    game->bg_scroll_px = (game->bg_scroll_px + (int)(game->world_speed * 0.4f * dt)) % 48;

    // 3. 齿轮旋转
    for (int i = 0; i < GT_MAX_GEARS; i++) {
        game->gears[i].angle_deg += game->gears[i].speed_deg * dt;
        if (game->gears[i].angle_deg >= 360.0f) game->gears[i].angle_deg -= 360.0f;
        if (game->gears[i].angle_deg < 0.0f) game->gears[i].angle_deg += 360.0f;
    }

    // 4. 竖直物理 (重力、起跳与下刺)
    if (game->y < GT_GROUND_Y || game->vy != 0.0f) {
        game->vy += GRAVITY * dt;
        game->y += game->vy * dt;

        if (game->y >= GT_GROUND_Y) {
            game->y = GT_GROUND_Y;
            game->vy = 0.0f;

            if (game->stance == STANCE_PLUNGE) {
                // --- 砸地触发地脉冲击波 (Shockwave) ---
                game->shockwave_active = true;
                game->shockwave_x = GT_HORSE_X + 20.0f;
                game->shockwave_radius = 20.0f;
                game->shockwave_timer_ms = 220;
                game->pending_sound = GT_SND_STEAM_BLOW;

                // 砸地四向飞溅火花与烟气
                for (int k = 0; k < 8; k++) {
                    geartrooper_emit_particle(game, PART_SPARK, GT_HORSE_X + 30, GT_GROUND_Y + 10, 60.0f + (gt_rand(game) % 80), -40.0f - (gt_rand(game) % 40), 0xFBBF24);
                    geartrooper_emit_particle(game, PART_STEAM, GT_HORSE_X + 20, GT_GROUND_Y + 4, -40.0f - (gt_rand(game) % 40), -30.0f - (gt_rand(game) % 30), 0xFFFFFF);
                }
            }

            game->stance = STANCE_RUN;
            game->air_jumps_left = 1;
        }
    }

    // 5. 下刺震地冲击波扩散
    if (game->shockwave_active) {
        game->shockwave_radius += 240.0f * dt;
        if (game->shockwave_timer_ms > dt_ms) {
            game->shockwave_timer_ms -= dt_ms;
        } else {
            game->shockwave_active = false;
        }
    }

    // 6. 滑铲持续倒计时
    if (game->stance == STANCE_SLIDE) {
        game->stance_timer_ms += dt_ms;
        if (game->stance_timer_ms >= SLIDE_DURATION_MS) {
            game->stance = STANCE_RUN;
        }
        // 滑铲中喷射火花
        if (game->tick_count % 2 == 0) {
            geartrooper_emit_particle(game, PART_SPARK, GT_HORSE_X + 28, GT_GROUND_Y + 12, -90.0f - (gt_rand(game) % 50), -20.0f, 0xF59E0B);
        }
    }

    // 7. 骑枪加力延伸倒计时
    if (game->lance_extended) {
        game->lance_timer_ms += dt_ms;
        if (game->lance_timer_ms >= LANCE_DURATION_MS) {
            game->lance_extended = false;
            game->lance_reach_px = 42;
        }
    } else {
        game->lance_reach_px = 42;
    }

    // 8. 战马烟囱周期排气
    if (game->tick_count % 3 == 0) {
        geartrooper_emit_particle(game, PART_STEAM, GT_HORSE_X - 10.0f, game->y - 18.0f, -40.0f - (gt_rand(game) % 30), -30.0f - (gt_rand(game) % 20), 0xF1F5F9);
    }

    // 9. 敌兵生成循环 (更加密集爽快的节奏)
    game->enemy_spawn_timer_ms += dt_ms;
    if (game->enemy_spawn_timer_ms >= SPAWN_INTERVAL_MS) {
        game->enemy_spawn_timer_ms = 0;
        uint32_t r = gt_rand(game) % 100;
        if (r < 45) {
            // 地面发条机械蜘蛛
            geartrooper_spawn_enemy(game, ENEMY_SPIDER, GT_SCREEN_W + 10, GT_GROUND_Y + 2);
        } else if (r < 80) {
            // 空中齿轮飞隼 (高度 140 ~ 170)
            float fy = 140.0f + (gt_rand(game) % 30);
            geartrooper_spawn_enemy(game, ENEMY_FALCON, GT_SCREEN_W + 10, fy);
        } else {
            // 重装铁傀儡
            geartrooper_spawn_enemy(game, ENEMY_GOLEM, GT_SCREEN_W + 10, GT_GROUND_Y - 18);
        }
    }

    // 10. 敌兵运动与打击判定
    // 玩家骑兵判定框
    float px = GT_HORSE_X;
    float py = (game->stance == STANCE_SLIDE) ? (game->y + 8) : (game->y - 16);
    float pw = 34.0f;
    float ph = (game->stance == STANCE_SLIDE) ? 14.0f : 34.0f;

    // 骑枪锋刃判定框 (常驻前伸超长贯穿刃)
    float lance_x = GT_HORSE_X + 22.0f;
    float lance_y = (game->stance == STANCE_SLIDE) ? (game->y + 8) : (game->y - 8);
    float lance_w = (float)game->lance_reach_px;
    float lance_h = 16.0f;

    for (int i = 0; i < GT_MAX_ENEMIES; i++) {
        if (!game->enemies[i].active) continue;
        gt_enemy_t *e = &game->enemies[i];
        e->x += e->vx * dt;
        e->anim_tick++;

        // 移出屏幕左侧回收
        if (e->x < -40.0f) {
            e->active = false;
            continue;
        }

        float ew = (e->type == ENEMY_GOLEM) ? 26.0f : 18.0f;
        float eh = (e->type == ENEMY_GOLEM) ? 32.0f : 16.0f;

        // A. 震地冲击波摧毁地面敌兵 (全屏下刺秒杀)
        if (game->shockwave_active && (e->type == ENEMY_SPIDER || e->type == ENEMY_GOLEM)) {
            if (e->x >= game->shockwave_x && e->x <= game->shockwave_x + game->shockwave_radius) {
                e->active = false;
                game->score += 200;
                game->combo_count++;
                game->steam_psi += 25;
                if (game->steam_psi > 100) game->steam_psi = 100;
                game->pending_sound = GT_SND_HIT;
                for (int k = 0; k < 8; k++) {
                    geartrooper_emit_particle(game, PART_SPARK, e->x + 8, e->y + 8, 40.0f, -60.0f - (gt_rand(game) % 40), 0xF59E0B);
                }
                continue;
            }
        }

        // B. 骑枪正面刺穿敌兵
        if (geartrooper_check_collision(lance_x, lance_y, lance_w, lance_h, e->x, e->y, ew, eh)) {
            if (game->overdrive_active) {
                e->hp = 0; // 狂暴过载状态一击秒杀！
            } else {
                e->hp--;
            }
            if (e->hp <= 0) {
                e->active = false;
                uint32_t reward = (e->type == ENEMY_GOLEM) ? 350 : 150;
                game->combo_count++;
                game->score += reward * (game->combo_count > 1 ? game->combo_count : 1);
                game->steam_psi += (e->type == ENEMY_GOLEM) ? 35 : 20;
                if (game->steam_psi >= 100) {
                    game->steam_psi = 100;
                    // 满气自动触发狂暴过载！
                    if (!game->overdrive_active) {
                        game->overdrive_active = true;
                        game->overdrive_ms = 4000;
                        game->pending_sound = GT_SND_OVERDRIVE;
                    }
                } else {
                    game->pending_sound = GT_SND_HIT;
                }

                // 爆破火花微粒
                for (int k = 0; k < 6; k++) {
                    geartrooper_emit_particle(game, PART_SPARK, e->x + 8, e->y + 8, -40.0f - (gt_rand(game) % 60), -50.0f - (gt_rand(game) % 50), 0xFBBF24);
                }
            } else {
                // 击退被击中的重装敌兵
                e->x += 20.0f;
                game->pending_sound = GT_SND_HIT;
            }
            continue;
        }

        // C. 贴地滑铲碾碎蜘蛛
        if (game->stance == STANCE_SLIDE && e->type == ENEMY_SPIDER) {
            if (geartrooper_check_collision(px, py, pw, ph, e->x, e->y, ew, eh)) {
                e->active = false;
                game->combo_count++;
                game->score += 180 * (game->combo_count > 1 ? game->combo_count : 1);
                game->steam_psi += 20;
                if (game->steam_psi > 100) game->steam_psi = 100;
                game->pending_sound = GT_SND_HIT;
                for (int k = 0; k < 6; k++) {
                    geartrooper_emit_particle(game, PART_SPARK, e->x + 8, e->y + 8, -60.0f, -40.0f - (gt_rand(game) % 40), 0xEF4444);
                }
                continue;
            }
        }

        // D. 撞击玩家本体
        if (geartrooper_check_collision(px, py, pw, ph, e->x, e->y, ew, eh)) {
            if (game->overdrive_active) {
                // 狂暴过载全速撞毁一切！
                e->active = false;
                game->score += 300;
                game->combo_count++;
                game->pending_sound = GT_SND_HIT;
                for (int k = 0; k < 8; k++) {
                    geartrooper_emit_particle(game, PART_SPARK, e->x + 8, e->y + 8, (float)(gt_rand(game) % 120 - 60), -70.0f, 0x38BDF8);
                }
            } else if (game->invuln_timer_ms == 0) {
                // 承受伤害
                game->hp--;
                game->invuln_timer_ms = INVULN_DURATION_MS;
                game->combo_count = 0;
                game->pending_sound = GT_SND_HURT;
                if (game->hp <= 0) {
                    game->hp = 0;
                    game->game_over = true;
                    game->pending_sound = GT_SND_GAMEOVER;
                }
            }
        }
    }

    // 11. 更新粒子物理与衰减
    for (int i = 0; i < GT_MAX_PARTICLES; i++) {
        if (!game->particles[i].active) continue;
        gt_particle_t *p = &game->particles[i];
        p->x += p->vx * dt;
        p->y += p->vy * dt;
        if (p->type == PART_SPARK) p->vy += 450.0f * dt;
        p->life -= p->decay;
        if (p->life <= 0.0f) p->active = false;
    }
}
