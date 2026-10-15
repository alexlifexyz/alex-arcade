// main/cyber_runner_logic.c —— 《霓虹疾行：影刃闪现》V2.0 核心引擎实现
#include "cyber_runner_logic.h"
#include <string.h>
#include <math.h>

#define CR_GRAVITY          1350.0f  // 紧凑干脆的重力加速度 (px/s^2)
#define CR_BASE_SPEED       180.0f   // 初始场景滚动速度 (px/s)
#define CR_MAX_SPEED        320.0f   // 极限奔跑速度

static inline uint32_t cr_rand(cr_game_t *g)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return g->rng_state;
}

bool cyber_runner_check_box(float x1, float y1, float w1, float h1,
                            float x2, float y2, float w2, float h2)
{
    return (x1 < x2 + w2) && (x1 + w1 > x2) &&
           (y1 < y2 + h2) && (y1 + h1 > y2);
}

void cyber_runner_emit_particle(cr_game_t *g, cr_part_type_t type,
                                float x, float y, float vx, float vy, uint32_t color)
{
    for (int i = 0; i < CR_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            g->particles[i].active = true;
            g->particles[i].type = type;
            g->particles[i].x = x;
            g->particles[i].y = y;
            g->particles[i].vx = vx;
            g->particles[i].vy = vy;
            g->particles[i].life = 1.0f;
            g->particles[i].decay = (type == CR_PART_SPARK) ? 2.5f : 3.5f;
            g->particles[i].color = color;
            break;
        }
    }
}

static void spawn_hazard_or_item(cr_game_t *g, cr_building_t *b)
{
    if (b->w < 90.0f || b->is_glass) return;

    uint32_t r = cr_rand(g) % 100;

    if (r < 55) {
        // 55% 生成敌人或障碍 (无人机、低位尖刺、高位横梁)
        for (int i = 0; i < CR_MAX_HAZARDS; i++) {
            if (!g->hazards[i].active) {
                g->hazards[i].active = true;
                g->hazards[i].state_tick = 0;
                g->hazards[i].bob_phase = 0.0f;

                uint32_t ht = cr_rand(g) % 4;
                if (ht == 0 || ht == 3) {
                    // 浮游无人机 (空中巡逻，月牙光刃可直接击爆！)
                    g->hazards[i].type = CR_HAZARD_DRONE;
                    g->hazards[i].w = 18.0f;
                    g->hazards[i].h = 14.0f;
                    g->hazards[i].x = b->x + b->w * 0.5f;
                    g->hazards[i].y = b->y - 32.0f;
                } else if (ht == 1) {
                    // 低位尖刺/横梁 (需一段小跳跃过)
                    g->hazards[i].type = CR_HAZARD_LASER_LOW;
                    g->hazards[i].w = 16.0f;
                    g->hazards[i].h = 10.0f;
                    g->hazards[i].x = b->x + b->w * 0.55f;
                    g->hazards[i].y = b->y - g->hazards[i].h;
                } else {
                    // 高位激光/路障 (留出底部供滑铲穿行)
                    g->hazards[i].type = CR_HAZARD_LASER_HIGH;
                    g->hazards[i].w = 16.0f;
                    g->hazards[i].h = 10.0f;
                    g->hazards[i].x = b->x + b->w * 0.5f;
                    g->hazards[i].y = b->y - 28.0f;
                }
                break;
            }
        }
    } else if (r < 75) {
        // 20% 生成排风口超导弹射器
        for (int i = 0; i < CR_MAX_HAZARDS; i++) {
            if (!g->hazards[i].active) {
                g->hazards[i].active = true;
                g->hazards[i].type = CR_HAZARD_VENT;
                g->hazards[i].w = 20.0f;
                g->hazards[i].h = 6.0f;
                g->hazards[i].x = b->x + b->w * 0.45f;
                g->hazards[i].y = b->y - g->hazards[i].h;
                g->hazards[i].state_tick = 0;
                break;
            }
        }
    } else if (r < 95) {
        // 20% 生成收集道具
        for (int i = 0; i < CR_MAX_ITEMS; i++) {
            if (!g->items[i].active) {
                g->items[i].active = true;
                uint32_t it = cr_rand(g) % 10;
                if (it < 6) {
                    g->items[i].type = CR_ITEM_DATA_GEM;
                } else if (it < 9) {
                    g->items[i].type = CR_ITEM_BATTERY;
                } else {
                    g->items[i].type = CR_ITEM_SHIELD;
                }
                g->items[i].x = b->x + b->w * 0.5f;
                g->items[i].y = b->y - 22.0f;
                g->items[i].bob_phase = 0.0f;
                break;
            }
        }
    }
}

static void recycle_building(cr_game_t *g, int idx)
{
    float max_right = 0.0f;
    float last_y = 220.0f;
    for (int i = 0; i < CR_MAX_BUILDINGS; i++) {
        if (g->buildings[i].active && (g->buildings[i].x + g->buildings[i].w > max_right)) {
            max_right = g->buildings[i].x + g->buildings[i].w;
            last_y = g->buildings[i].y;
        }
    }

    float gap = 36.0f + (float)(cr_rand(g) % 36); // 36 ~ 72 px
    float width = 130.0f + (float)(cr_rand(g) % 90); // 130 ~ 220 px
    
    float dy = ((float)(cr_rand(g) % 64) - 32.0f);
    float target_y = last_y + dy;
    if (target_y < 190.0f) target_y = 190.0f;
    if (target_y > 255.0f) target_y = 255.0f;

    cr_building_t *b = &g->buildings[idx];
    b->active = true;
    b->x = max_right + gap;
    b->y = target_y;
    b->w = width;
    b->h = (float)CR_SCREEN_H - target_y + 10.0f;
    b->crumble_timer_ms = 0.0f;
    b->crumbled = false;
    b->win_seed = cr_rand(g);

    if (g->distance_m > 120 && (cr_rand(g) % 100 < 18)) {
        b->is_glass = true;
    } else {
        b->is_glass = false;
    }

    spawn_hazard_or_item(g, b);
}

void cyber_runner_init(cr_game_t *g, uint32_t seed)
{
    memset(g, 0, sizeof(cr_game_t));
    g->rng_state = seed ? seed : 0x20260919;
    g->world_speed = CR_BASE_SPEED;
    g->hp = 3;
    g->max_hp = 3;
    g->blink_charges = 3;
    g->air_jumps_left = 1;
    g->stance = CR_STANCE_RUN;

    float start_xs[CR_MAX_BUILDINGS] = { 0.0f, 190.0f, 360.0f, 530.0f, 710.0f };
    float start_ys[CR_MAX_BUILDINGS] = { 230.0f, 220.0f, 240.0f, 215.0f, 230.0f };
    float start_ws[CR_MAX_BUILDINGS] = { 170.0f, 150.0f, 150.0f, 160.0f, 160.0f };

    for (int i = 0; i < CR_MAX_BUILDINGS; i++) {
        g->buildings[i].active = true;
        g->buildings[i].x = start_xs[i];
        g->buildings[i].y = start_ys[i];
        g->buildings[i].w = start_ws[i];
        g->buildings[i].h = (float)CR_SCREEN_H - start_ys[i] + 10.0f;
        g->buildings[i].is_glass = false;
        g->buildings[i].crumbled = false;
        g->buildings[i].win_seed = cr_rand(g);
    }

    // 初始建筑障碍与道具布置 (开局丰富生动，不再空洞)
    // 建筑 1: 放置低位能量尖刺 + 金色数据晶体
    g->hazards[0].active = true;
    g->hazards[0].type = CR_HAZARD_LASER_LOW;
    g->hazards[0].x = g->buildings[1].x + 75.0f;
    g->hazards[0].y = g->buildings[1].y - 10.0f;
    g->hazards[0].w = 16.0f;
    g->hazards[0].h = 10.0f;

    g->items[0].active = true;
    g->items[0].type = CR_ITEM_DATA_GEM;
    g->items[0].x = g->buildings[1].x + 40.0f;
    g->items[0].y = g->buildings[1].y - 24.0f;

    // 建筑 2: 放置浮游侦察无人机 (正对射程，供发射月牙光刃斩爆！)
    g->hazards[1].active = true;
    g->hazards[1].type = CR_HAZARD_DRONE;
    g->hazards[1].x = g->buildings[2].x + 70.0f;
    g->hazards[1].y = g->buildings[2].y - 34.0f;
    g->hazards[1].w = 18.0f;
    g->hazards[1].h = 14.0f;

    // 建筑 3: 放置超导排风口与电池
    g->hazards[2].active = true;
    g->hazards[2].type = CR_HAZARD_VENT;
    g->hazards[2].x = g->buildings[3].x + 65.0f;
    g->hazards[2].y = g->buildings[3].y - 6.0f;
    g->hazards[2].w = 20.0f;
    g->hazards[2].h = 6.0f;

    g->items[1].active = true;
    g->items[1].type = CR_ITEM_BATTERY;
    g->items[1].x = g->buildings[3].x + 120.0f;
    g->items[1].y = g->buildings[3].y - 24.0f;

    // 建筑 4: 巡逻无人机
    g->hazards[3].active = true;
    g->hazards[3].type = CR_HAZARD_DRONE;
    g->hazards[3].x = g->buildings[4].x + 80.0f;
    g->hazards[3].y = g->buildings[4].y - 36.0f;
    g->hazards[3].w = 18.0f;
    g->hazards[3].h = 14.0f;

    g->y = g->buildings[0].y;
    g->vy = 0.0f;

    for (int i = 0; i < CR_MAX_SCARF_NODES; i++) {
        g->scarf[i].x = (float)(CR_PLAYER_X - i * 6);
        g->scarf[i].y = g->y - 20.0f;
    }
}

void cyber_runner_input_up(cr_game_t *g)
{
    if (g->game_over) {
        cyber_runner_init(g, g->tick_count + 1);
        return;
    }

    // 1. 贴墙下滑状态下的【蹬墙反弹大跳 (Wall Kick)】！
    if (g->is_wall_sliding) {
        g->is_wall_sliding = false;
        g->stance = CR_STANCE_JUMP;
        g->vy = -360.0f;             // 紧凑反弹腾空
        g->render_x_offset = 24.0f;  // 冲上大厦平台
        g->air_jumps_left = 1;       // 刷新空中二段跳
        g->pending_sound = CR_SND_WALL_KICK;

        for (int p = 0; p < 8; p++) {
            cyber_runner_emit_particle(g, CR_PART_SPARK,
                                       (float)CR_PLAYER_X + (float)CR_PLAYER_W,
                                       g->y - 12.0f,
                                       -50.0f - (float)(cr_rand(g) % 40),
                                       -30.0f - (float)(cr_rand(g) % 30),
                                       0x00FFFF);
        }
        return;
    }

    // 2. 地面起跳 (含土狼时间 Coyote Time 判定，跳跃高度不过高，干脆利落)
    if (g->stance == CR_STANCE_RUN || g->stance == CR_STANCE_SLIDE || g->coyote_timer_ms > 0) {
        g->stance = CR_STANCE_JUMP;
        g->vy = -330.0f;
        g->air_jumps_left = 1;
        g->coyote_timer_ms = 0;
        g->pending_sound = CR_SND_JUMP;
        cyber_runner_emit_particle(g, CR_PART_SPARK, CR_PLAYER_X + 6, g->y, -40.0f, 10.0f, 0x00FFFF);
    } else if (g->air_jumps_left > 0) {
        // 3. 空中两段跳 (阿童木火箭靴强力喷气二段腾跃)
        g->air_jumps_left = 0;
        g->stance = CR_STANCE_DOUBLE_JUMP;
        g->vy = -310.0f;
        g->pending_sound = CR_SND_AIR_BOOST;
        // 火箭尾焰推进粒子 (金黄 + 纯白)
        for (int i = 0; i < 6; i++) {
            cyber_runner_emit_particle(g, CR_PART_SPARK,
                                       CR_PLAYER_X + 6, g->y + 4,
                                       ((float)(cr_rand(g) % 40) - 20.0f),
                                       80.0f + (float)(cr_rand(g) % 50),
                                       0xFACC15);
        }
    } else {
        // 4. 输入预缓冲 (即将着陆时按键)
        g->jump_buffer_ms = 120;
    }
}

void cyber_runner_input_down(cr_game_t *g)
{
    if (g->game_over) return;

    if (g->is_wall_sliding) {
        // 贴墙时加速下滑
        g->vy = 280.0f;
        return;
    }

    if (g->stance == CR_STANCE_RUN) {
        // 地面极速滑铲
        g->stance = CR_STANCE_SLIDE;
        g->stance_timer_ms = 420;
        g->pending_sound = CR_SND_SLIDE;
        cyber_runner_emit_particle(g, CR_PART_SPARK, CR_PLAYER_X, g->y, -70.0f, -20.0f, 0xF59E0B);
    } else if (g->stance == CR_STANCE_JUMP || g->stance == CR_STANCE_DOUBLE_JUMP ||
               g->stance == CR_STANCE_FALL || g->stance == CR_STANCE_BLINK) {
        // 空中急降俯冲下砸 (Dive Slam)
        g->stance = CR_STANCE_DIVE;
        g->vy = 650.0f;
    }
}

void cyber_runner_input_ok(cr_game_t *g)
{
    if (g->game_over) {
        cyber_runner_init(g, g->tick_count + 1);
        return;
    }

    float px = (float)CR_PLAYER_X + g->render_x_offset;
    float py = g->y - (float)CR_PLAYER_H;

    // ★★★ 核心武器创新：发射向前飞旋的【月牙光刃 / 飞刀光波】(Crescent Moon Blade)！★★★
    for (int i = 0; i < CR_MAX_PROJECTILES; i++) {
        if (!g->projectiles[i].active) {
            g->projectiles[i].active = true;
            g->projectiles[i].x = px + 18.0f;
            g->projectiles[i].y = py + 24.0f;
            g->projectiles[i].vx = 420.0f;
            g->projectiles[i].vy = 0.0f;
            g->projectiles[i].life_ms = 700.0f;
            g->projectiles[i].rot_deg = 0.0f;
            break;
        }
    }

    g->slash_active = true;
    g->slash_timer_ms = 90; // 弧光显示时长
    g->slash_start_x = px;
    g->slash_start_y = py + 24.0f;

    // 寻找前方 75px 内的可斩击目标 (无人机或激光)
    int target_idx = -1;
    float min_dist = 999.0f;

    for (int i = 0; i < CR_MAX_HAZARDS; i++) {
        cr_hazard_t *h = &g->hazards[i];
        if (!h->active) continue;

        if (h->x >= px - 10.0f && h->x <= px + 75.0f &&
            h->y + h->h >= py - 20.0f && h->y <= py + (float)CR_PLAYER_H + 25.0f) {
            float d = h->x - px;
            if (d < min_dist) {
                min_dist = d;
                target_idx = i;
            }
        }
    }

    if (target_idx >= 0) {
        // === 命中近距目标！触发【月牙斩爆 (Target Slice)】===
        cr_hazard_t *target = &g->hazards[target_idx];
        target->active = false; // 目标直接斩裂消灭！

        g->slash_target_x = target->x + target->w * 0.5f;
        g->slash_target_y = target->y + target->h * 0.5f;

        g->score += 200 * (1 + g->combo_count);
        g->combo_count++;
        g->combo_timer_ms = 3000;
        g->pending_sound = CR_SND_SLASH_HIT;

        // ★★★ 爽快机制：斩杀刷新二段跳 (Kill Reset) ★★★
        g->air_jumps_left = 1; // 刷新二段跳！
        if (g->blink_charges < 3) g->blink_charges++; // 回充 1 格瞬移能量！
        g->vy = -310.0f;       // 借力紧凑爆跃升空！
        g->render_x_offset = 36.0f;
        g->phase_shift = true;
        g->phase_timer_ms = 180;
        g->stance = CR_STANCE_JUMP;

        // 斩裂金光与机械爆破粒子
        for (int p = 0; p < 12; p++) {
            cyber_runner_emit_particle(g, CR_PART_EXPLOSION,
                                       target->x + target->w * 0.5f,
                                       target->y + target->h * 0.5f,
                                       ((float)(cr_rand(g) % 140) - 70.0f),
                                       ((float)(cr_rand(g) % 140) - 70.0f),
                                       0xFACC15);
        }
    } else {
        // 远程投掷月牙光刃 + 破空声
        g->slash_target_x = px + 60.0f;
        g->slash_target_y = py + 24.0f;
        g->pending_sound = CR_SND_SLASH_HIT;

        if (g->blink_charges > 0 && !g->phase_shift) {
            g->blink_charges--;
            g->phase_shift = true;
            g->phase_timer_ms = 180;
            g->stance = CR_STANCE_BLINK;
            g->vy = 0.0f;
            g->render_x_offset = 36.0f;
            g->pending_sound = CR_SND_BLINK;

            for (int i = 0; i < CR_MAX_AFTERIMAGES; i++) {
                g->afterimages[i].x = (float)CR_PLAYER_X - (float)(i + 1) * 12.0f;
                g->afterimages[i].y = g->y;
                g->afterimages[i].alpha = 0.85f - (float)i * 0.25f;
                g->afterimages[i].color = 0xFACC15;
            }

            for (int i = 0; i < 6; i++) {
                cyber_runner_emit_particle(g, CR_PART_NEON_BURST,
                                           CR_PLAYER_X + 10, g->y - 14,
                                           ((float)(cr_rand(g) % 80) - 40.0f),
                                           ((float)(cr_rand(g) % 80) - 40.0f),
                                           0xFACC15);
            }
        }
    }
}

static void apply_damage(cr_game_t *g)
{
    if (g->invuln_timer_ms > 0 || g->phase_shift) return;

    if (g->has_shield) {
        g->has_shield = false;
        g->invuln_timer_ms = 1200;
        g->pending_sound = CR_SND_HURT;
        cyber_runner_emit_particle(g, CR_PART_NEON_BURST, CR_PLAYER_X + 8, g->y - 15, 0, 0, 0x00FFFF);
    } else {
        if (g->hp > 0) g->hp--;
        g->combo_count = 0;
        g->invuln_timer_ms = 1500;
        g->pending_sound = CR_SND_HURT;

        if (g->hp <= 0) {
            g->game_over = true;
            g->pending_sound = CR_SND_GAMEOVER;
        }
    }
}

void cyber_runner_step(cr_game_t *g, uint32_t dt_ms)
{
    if (g->game_over) return;

    float dt = (float)dt_ms / 1000.0f;
    g->tick_count++;

    // 1. 速度增长与行进里程
    if (g->world_speed < CR_MAX_SPEED) {
        g->world_speed += 0.8f * dt;
    }
    float dx = g->world_speed * dt;
    g->distance_m += (uint32_t)(dx * 0.12f);
    g->score += (uint32_t)(dx * 0.2f);

    g->bg_far_scroll_px += dx * 0.15f;
    if (g->bg_far_scroll_px >= 240.0f) g->bg_far_scroll_px -= 240.0f;
    g->bg_mid_scroll_px += dx * 0.45f;
    if (g->bg_mid_scroll_px >= 240.0f) g->bg_mid_scroll_px -= 240.0f;

    // 2. 状态计时器
    if (g->coyote_timer_ms > dt_ms) g->coyote_timer_ms -= dt_ms; else g->coyote_timer_ms = 0;
    if (g->jump_buffer_ms > dt_ms) g->jump_buffer_ms -= dt_ms; else g->jump_buffer_ms = 0;
    if (g->invuln_timer_ms > dt_ms) g->invuln_timer_ms -= dt_ms; else g->invuln_timer_ms = 0;

    if (g->combo_timer_ms > dt_ms) {
        g->combo_timer_ms -= dt_ms;
    } else {
        g->combo_timer_ms = 0;
        g->combo_count = 0;
    }

    if (g->slash_timer_ms > dt_ms) {
        g->slash_timer_ms -= dt_ms;
    } else {
        g->slash_timer_ms = 0;
        g->slash_active = false;
    }

    if (g->shockwave_timer_ms > dt_ms) {
        g->shockwave_timer_ms -= dt_ms;
        g->shockwave_radius += 160.0f * dt;
    } else {
        g->shockwave_timer_ms = 0;
        g->shockwave_active = false;
    }

    // 闪现充能自动缓慢回复 (地面跑动时每 4s 回满一格)
    if (g->blink_charges < 3 && (g->stance == CR_STANCE_RUN || g->stance == CR_STANCE_SLIDE)) {
        g->blink_recharge_ms += (float)dt_ms;
        if (g->blink_recharge_ms >= 4000.0f) {
            g->blink_charges++;
            g->blink_recharge_ms = 0.0f;
        }
    }

    // 虚化闪现状态更新
    if (g->phase_shift) {
        g->render_x_offset *= 0.88f;
        if (g->phase_timer_ms > dt_ms) {
            g->phase_timer_ms -= dt_ms;
        } else {
            g->phase_timer_ms = 0;
            g->phase_shift = false;
            if (g->stance == CR_STANCE_BLINK) {
                g->stance = CR_STANCE_FALL;
            }
        }
    }

    // 滑铲计时
    if (g->stance == CR_STANCE_SLIDE) {
        if (g->stance_timer_ms > dt_ms) {
            g->stance_timer_ms -= dt_ms;
            if (g->tick_count % 3 == 0) {
                cyber_runner_emit_particle(g, CR_PART_SPARK, CR_PLAYER_X + 2, g->y,
                                           -60.0f - (float)(cr_rand(g) % 30),
                                           -10.0f - (float)(cr_rand(g) % 20),
                                           0xF59E0B);
            }
        } else {
            g->stance = CR_STANCE_RUN;
        }
    }

    // 3. 玩家垂直重力计算 (贴墙下滑时减速 60%)
    float prev_y = g->y;
    if (!g->phase_shift && g->stance != CR_STANCE_RUN && g->stance != CR_STANCE_SLIDE) {
        if (g->is_wall_sliding) {
            // 贴墙减速下滑
            if (g->vy > 90.0f) g->vy = 90.0f;
            else g->vy += (CR_GRAVITY * 0.35f) * dt;
        } else {
            g->vy += CR_GRAVITY * dt;
        }
        g->y += g->vy * dt;
    }

    // 4. 建筑滚动、碰撞与贴墙检测
    bool on_ground = false;
    float current_roof_y = 999.0f;
    bool wall_touched = false;

    float foot_x1 = (float)CR_PLAYER_X + 4.0f;
    float foot_x2 = (float)CR_PLAYER_X + 22.0f;

    for (int i = 0; i < CR_MAX_BUILDINGS; i++) {
        cr_building_t *b = &g->buildings[i];
        if (!b->active) continue;

        b->x -= dx;

        // A. 踏在楼顶检测
        if (b->x <= foot_x2 && (b->x + b->w) >= foot_x1 && !b->crumbled) {
            if (prev_y <= b->y + 4.0f && g->y >= b->y - 1.0f) {
                on_ground = true;
                current_roof_y = b->y;

                if (b->is_glass) {
                    b->crumble_timer_ms += (float)dt_ms;
                    if (b->crumble_timer_ms >= 350.0f) {
                        b->crumbled = true;
                        for (int p = 0; p < 8; p++) {
                            cyber_runner_emit_particle(g, CR_PART_NEON_BURST,
                                                       b->x + (float)(cr_rand(g) % (int)b->w),
                                                       b->y,
                                                       ((float)(cr_rand(g) % 60) - 30.0f),
                                                       40.0f + (float)(cr_rand(g) % 40),
                                                       0x00FFFF);
                        }
                    }
                }
            }
        }

        // B. 撞击前方大厦侧壁 -> 触发【贴墙下滑 (Wall Slide)】！
        if (!on_ground && (g->stance == CR_STANCE_JUMP || g->stance == CR_STANCE_DOUBLE_JUMP ||
                           g->stance == CR_STANCE_FALL || g->stance == CR_STANCE_WALL_SLIDE)) {
            float player_right = (float)CR_PLAYER_X + (float)CR_PLAYER_W;
            if (b->x <= player_right + 3.0f && b->x >= player_right - 6.0f) {
                if (g->y > b->y + 6.0f && g->y < b->y + b->h) {
                    wall_touched = true;
                }
            }
        }

        // 回收大楼
        if (b->x + b->w < -20.0f) {
            recycle_building(g, i);
        }
    }

    // 贴墙状态判定
    if (wall_touched && !on_ground) {
        g->is_wall_sliding = true;
        g->stance = CR_STANCE_WALL_SLIDE;
        if (g->vy > 90.0f) g->vy = 90.0f; // 贴墙瞬间受到强力摩擦阻力刹车减速
        if (g->tick_count % 3 == 0) {
            cyber_runner_emit_particle(g, CR_PART_SPARK,
                                       (float)CR_PLAYER_X + (float)CR_PLAYER_W,
                                       g->y - 12.0f,
                                       -30.0f, -15.0f, 0x00FFFF);
        }
    } else {
        g->is_wall_sliding = false;
    }

    // 地面着陆逻辑
    if (on_ground) {
        if (g->stance == CR_STANCE_DIVE) {
            // 俯冲砸地冲击波！
            g->pending_sound = CR_SND_DIVE_SLAM;
            g->shockwave_active = true;
            g->shockwave_timer_ms = 220;
            g->shockwave_radius = 16.0f;
            g->shockwave_x = (float)CR_PLAYER_X + 8.0f;
            g->shockwave_y = current_roof_y;

            for (int p = 0; p < 8; p++) {
                cyber_runner_emit_particle(g, CR_PART_SPARK, CR_PLAYER_X + 8, current_roof_y,
                                           ((float)(cr_rand(g) % 140) - 70.0f),
                                           -30.0f - (float)(cr_rand(g) % 30),
                                           0x00FFFF);
            }

            // 冲击波摧毁附近所有地面激光
            for (int i = 0; i < CR_MAX_HAZARDS; i++) {
                if (g->hazards[i].active && g->hazards[i].type == CR_HAZARD_LASER_LOW) {
                    if (fabsf(g->hazards[i].x - g->shockwave_x) < 55.0f) {
                        g->hazards[i].active = false;
                        g->score += 100;
                    }
                }
            }
        }

        g->y = current_roof_y;
        g->vy = 0.0f;
        g->air_jumps_left = 1;
        g->coyote_timer_ms = 0;

        // 落地跳跃缓冲自动起跳
        if (g->jump_buffer_ms > 0) {
            g->jump_buffer_ms = 0;
            g->stance = CR_STANCE_JUMP;
            g->vy = -330.0f;
            g->pending_sound = CR_SND_JUMP;
        } else if (g->stance != CR_STANCE_SLIDE) {
            g->stance = CR_STANCE_RUN;
        }
    } else {
        if (g->stance == CR_STANCE_RUN || g->stance == CR_STANCE_SLIDE) {
            // 踏空脱离，激活土狼时间 (120ms 容错)
            g->stance = CR_STANCE_FALL;
            g->coyote_timer_ms = 120;
        }
    }

    // 坠入深渊
    if (g->y > (float)CR_SCREEN_H + 10.0f) {
        g->hp = 0;
        g->game_over = true;
        g->pending_sound = CR_SND_GAMEOVER;
        return;
    }

    // 5. 陷阱机关位移与碰撞检测
    float px = (float)CR_PLAYER_X + g->render_x_offset;
    float pw = (float)CR_PLAYER_W;
    float ph = (g->stance == CR_STANCE_SLIDE) ? (float)CR_SLIDE_H : (float)CR_PLAYER_H;
    float py = g->y - ph;

    for (int i = 0; i < CR_MAX_HAZARDS; i++) {
        cr_hazard_t *h = &g->hazards[i];
        if (!h->active) continue;

        h->x -= dx;
        h->state_tick++;

        if (h->type == CR_HAZARD_DRONE) {
            h->bob_phase += dt * 3.5f;
            h->y += sinf(h->bob_phase) * 0.8f;
        }

        if (h->x + h->w < -20.0f) {
            h->active = false;
            continue;
        }

        if (cyber_runner_check_box(px, py, pw, ph, h->x, h->y, h->w, h->h)) {
            if (h->type == CR_HAZARD_VENT) {
                // 超导排风口暴风弹射
                g->vy = -560.0f;
                g->stance = CR_STANCE_JUMP;
                g->air_jumps_left = 1;
                g->pending_sound = CR_SND_VENT_BOOST;
                for (int p = 0; p < 5; p++) {
                    cyber_runner_emit_particle(g, CR_PART_VENT_STEAM,
                                               h->x + 10.0f, h->y,
                                               ((float)(cr_rand(g) % 30) - 15.0f),
                                               -90.0f - (float)(cr_rand(g) % 50),
                                               0x00FFFF);
                }
            } else if (h->type == CR_HAZARD_DRONE) {
                if (g->phase_shift) {
                    h->active = false;
                    g->score += 150 * (1 + g->combo_count);
                    g->combo_count++;
                    g->combo_timer_ms = 2500;
                    g->pending_sound = CR_SND_DRONE_POP;
                    for (int p = 0; p < 8; p++) {
                        cyber_runner_emit_particle(g, CR_PART_EXPLOSION,
                                                   h->x + 8.0f, h->y + 6.0f,
                                                   ((float)(cr_rand(g) % 100) - 50.0f),
                                                   ((float)(cr_rand(g) % 100) - 50.0f),
                                                   0x00FFFF);
                    }
                } else {
                    apply_damage(g);
                }
            } else if (h->type == CR_HAZARD_LASER_WALL ||
                       h->type == CR_HAZARD_LASER_LOW ||
                       h->type == CR_HAZARD_LASER_HIGH) {
                if (g->phase_shift) {
                    g->score += 50;
                    g->combo_count++;
                    g->combo_timer_ms = 2000;
                } else {
                    apply_damage(g);
                }
            }
        }
    }

    // 6. 收集物位移与拾取
    for (int i = 0; i < CR_MAX_ITEMS; i++) {
        cr_item_t *it = &g->items[i];
        if (!it->active) continue;

        it->x -= dx;
        it->bob_phase += dt * 4.0f;
        float draw_y = it->y + sinf(it->bob_phase) * 3.0f;

        if (it->x < -20.0f) {
            it->active = false;
            continue;
        }

        if (cyber_runner_check_box(px, py, pw, ph, it->x - 6.0f, draw_y - 6.0f, 14.0f, 14.0f)) {
            it->active = false;
            g->pending_sound = CR_SND_GEM;
            if (it->type == CR_ITEM_DATA_GEM) {
                g->score += 50 * (1 + g->combo_count);
                g->combo_count++;
                g->combo_timer_ms = 2500;
                cyber_runner_emit_particle(g, CR_PART_NEON_BURST, it->x, draw_y, 0, -20, 0x00FFFF);
            } else if (it->type == CR_ITEM_BATTERY) {
                g->blink_charges = 3;
                g->score += 100;
                cyber_runner_emit_particle(g, CR_PART_NEON_BURST, it->x, draw_y, 0, -30, 0x10B981);
            } else if (it->type == CR_ITEM_SHIELD) {
                g->has_shield = true;
                g->score += 150;
                cyber_runner_emit_particle(g, CR_PART_NEON_BURST, it->x, draw_y, 0, -30, 0x00FFFF);
            }
        }
    }

    // 7. 月牙光刃 / 飞刀物理位移与斩爆碰撞检测
    for (int i = 0; i < CR_MAX_PROJECTILES; i++) {
        cr_projectile_t *p = &g->projectiles[i];
        if (!p->active) continue;

        p->x += p->vx * dt;
        p->y += p->vy * dt;
        p->rot_deg += 720.0f * dt;
        if (p->rot_deg >= 360.0f) p->rot_deg -= 360.0f;

        if (p->life_ms > (float)dt_ms) {
            p->life_ms -= (float)dt_ms;
        } else {
            p->active = false;
            continue;
        }

        if (p->x > (float)CR_SCREEN_W + 20.0f) {
            p->active = false;
            continue;
        }

        // 月牙光刃切削判定 (14x14 判定盒)
        for (int h = 0; h < CR_MAX_HAZARDS; h++) {
            cr_hazard_t *hz = &g->hazards[h];
            if (!hz->active) continue;

            if (cyber_runner_check_box(p->x - 7.0f, p->y - 7.0f, 14.0f, 14.0f,
                                       hz->x, hz->y, hz->w, hz->h)) {
                if (hz->type == CR_HAZARD_DRONE || hz->type == CR_HAZARD_LASER_LOW || hz->type == CR_HAZARD_LASER_HIGH) {
                    hz->active = false; // 切碎消灭敌人！
                    p->active = false;  // 光刃命中后爆散
                    g->score += 200 * (1 + g->combo_count);
                    g->combo_count++;
                    g->combo_timer_ms = 3000;
                    g->air_jumps_left = 1; // 杀怪奖励刷新二段跳！
                    g->pending_sound = CR_SND_SLASH_HIT;

                    for (int pt = 0; pt < 10; pt++) {
                        cyber_runner_emit_particle(g, CR_PART_EXPLOSION,
                                                   hz->x + hz->w * 0.5f,
                                                   hz->y + hz->h * 0.5f,
                                                   ((float)(cr_rand(g) % 120) - 60.0f),
                                                   ((float)(cr_rand(g) % 120) - 60.0f),
                                                   0xFACC15);
                    }
                    break;
                }
            }
        }
    }

    // 8. 围巾动态追随物理模拟
    float neck_x = px + 6.0f;
    float neck_y = py + 14.0f;
    g->scarf[0].x = neck_x;
    g->scarf[0].y = neck_y;

    for (int i = 1; i < CR_MAX_SCARF_NODES; i++) {
        float target_x = g->scarf[i - 1].x - 5.5f;
        float wave = sinf((float)g->tick_count * 0.25f + (float)i * 0.8f) * 2.2f;
        float target_y = g->scarf[i - 1].y + wave + (g->vy * 0.015f);

        g->scarf[i].x += (target_x - g->scarf[i].x) * 0.65f;
        g->scarf[i].y += (target_y - g->scarf[i].y) * 0.55f;
    }

    // 8. 残影衰减
    for (int i = 0; i < CR_MAX_AFTERIMAGES; i++) {
        if (g->afterimages[i].alpha > 0.0f) {
            g->afterimages[i].alpha -= dt * 4.0f;
            if (g->afterimages[i].alpha < 0.0f) g->afterimages[i].alpha = 0.0f;
        }
    }

    // 9. 粒子生命周期
    for (int i = 0; i < CR_MAX_PARTICLES; i++) {
        if (g->particles[i].active) {
            g->particles[i].x += g->particles[i].vx * dt;
            g->particles[i].y += g->particles[i].vy * dt;
            if (g->particles[i].type == CR_PART_SPARK) {
                g->particles[i].vy += 600.0f * dt;
            }
            g->particles[i].life -= g->particles[i].decay * dt;
            if (g->particles[i].life <= 0.0f) {
                g->particles[i].active = false;
            }
        }
    }
}
