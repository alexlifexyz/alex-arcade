#include "flysaber_logic.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

// 预设计划节拍模式表
static const struct {
    flysaber_lane_t lane;
    flysaber_block_type_t type;
} S_PATTERNS[] = {
    { FLYSABER_LANE_LEFT,   FLYSABER_BLOCK_BLUE },
    { FLYSABER_LANE_RIGHT,  FLYSABER_BLOCK_RED },
    { FLYSABER_LANE_LEFT,   FLYSABER_BLOCK_BLUE },
    { FLYSABER_LANE_LEFT,   FLYSABER_BLOCK_BLUE },
    { FLYSABER_LANE_RIGHT,  FLYSABER_BLOCK_RED },
    { FLYSABER_LANE_RIGHT,  FLYSABER_BLOCK_RED },
    { FLYSABER_LANE_CENTER, FLYSABER_BLOCK_DUAL },
    { FLYSABER_LANE_LEFT,   FLYSABER_BLOCK_SPIKE },
    { FLYSABER_LANE_RIGHT,  FLYSABER_BLOCK_RED },
    { FLYSABER_LANE_RIGHT,  FLYSABER_BLOCK_SPIKE },
    { FLYSABER_LANE_LEFT,   FLYSABER_BLOCK_BLUE },
    { FLYSABER_LANE_CENTER, FLYSABER_BLOCK_DUAL },
};
#define PATTERN_COUNT (sizeof(S_PATTERNS) / sizeof(S_PATTERNS[0]))

void flysaber_init(flysaber_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    g->sync_hp = 100;
    g->max_sync_hp = 100;
    g->lives = 3;
    g->max_lives = 3;
    g->score = 0;
    g->combo = 0;
    g->max_combo = 0;
    g->overdrive_gauge = 0;
    g->is_overdrive = false;
    g->overdrive_timer = 0;

    g->slash_left_timer = 0;
    g->slash_right_timer = 0;
    g->slash_dual_timer = 0;

    g->tick_count = 0;
    g->spawn_timer = 0;
    g->pattern_step = 0;

    g->last_hit_result = FLYSABER_HIT_NONE;
    g->hit_result_timer = 0;
    g->pending_snd = FLYSABER_SND_NONE;

    g->game_over = false;
}

void flysaber_calc_pos(float progress, flysaber_lane_t lane, int *out_x, int *out_y, int *out_w, int *out_h)
{
    float p = progress;
    if (p < 0.0f) p = 0.0f;

    float dest_x = (lane == FLYSABER_LANE_LEFT) ? FLYSABER_DEST_LEFT :
                   ((lane == FLYSABER_LANE_RIGHT) ? FLYSABER_DEST_RIGHT : FLYSABER_DEST_CTR);

    // 透视非线性投影模拟 (EMD 空间纵深)
    float curved_p = p * (0.4f + 0.6f * p);

    float cx = (float)FLYSABER_VP_X + curved_p * (dest_x - (float)FLYSABER_VP_X);
    float cy = (float)FLYSABER_VP_Y + curved_p * ((float)FLYSABER_DEST_Y - (float)FLYSABER_VP_Y);

    int w = (int)(6.0f + curved_p * 26.0f);
    int h = (int)(4.0f + curved_p * 18.0f);

    if (out_x) *out_x = (int)(cx - (float)w / 2.0f);
    if (out_y) *out_y = (int)(cy - (float)h / 2.0f);
    if (out_w) *out_w = w;
    if (out_h) *out_h = h;
}

static void apply_sync_damage(flysaber_game_t *g, int dmg)
{
    g->sync_hp -= dmg;
    if (g->sync_hp <= 0) {
        if (g->lives > 1) {
            g->lives--;
            g->sync_hp = 75; // 复苏恢复至 75%
            g->is_overdrive = true;
            g->overdrive_timer = 60; // 赠送 2 秒子弹时间防护
            g->last_hit_result = FLYSABER_HIT_PERFECT;
            g->hit_result_timer = 20;
            g->pending_snd = FLYSABER_SND_OVERDRIVE;
        } else {
            g->lives = 0;
            g->sync_hp = 0;
            g->game_over = true;
            g->pending_snd = FLYSABER_SND_GAMEOVER;
        }
    }
}

static void spawn_particles(flysaber_game_t *g, float x, float y, uint32_t color, int count)
{
    for (int c = 0; c < count; c++) {
        for (int i = 0; i < FLYSABER_MAX_PARTICLES; i++) {
            if (!g->particles[i].active) {
                g->particles[i].active = true;
                g->particles[i].x = x;
                g->particles[i].y = y;
                float angle = (float)(rand() % 360) * 3.14159f / 180.0f;
                float spd = 2.0f + (float)(rand() % 40) / 10.0f;
                g->particles[i].vx = cosf(angle) * spd;
                g->particles[i].vy = sinf(angle) * spd;
                g->particles[i].life = 10 + (rand() % 6);
                g->particles[i].max_life = g->particles[i].life;
                g->particles[i].color = color;
                break;
            }
        }
    }
}

static void spawn_block(flysaber_game_t *g)
{
    for (int i = 0; i < FLYSABER_MAX_BLOCKS; i++) {
        if (!g->blocks[i].active) {
            g->blocks[i].active = true;
            g->blocks[i].sliced = false;
            g->blocks[i].progress = 0.0f;

            // 基础速度随得分轻微增加
            float base_speed = 0.022f + ((float)(g->score / 4000)) * 0.003f;
            if (base_speed > 0.045f) base_speed = 0.045f;
            g->blocks[i].speed = base_speed;

            // 根据节拍表读取
            g->blocks[i].lane = S_PATTERNS[g->pattern_step].lane;
            g->blocks[i].type = S_PATTERNS[g->pattern_step].type;

            g->pattern_step = (g->pattern_step + 1) % PATTERN_COUNT;
            break;
        }
    }
}

void flysaber_step(flysaber_game_t *g)
{
    if (!g || g->game_over) return;

    g->tick_count++;

    // 1. 挥刀计时衰减
    if (g->slash_left_timer > 0) g->slash_left_timer--;
    if (g->slash_right_timer > 0) g->slash_right_timer--;
    if (g->slash_dual_timer > 0) g->slash_dual_timer--;
    if (g->hit_result_timer > 0) g->hit_result_timer--;

    // 2. 超频神经倒计时
    if (g->is_overdrive) {
        g->overdrive_timer--;
        if (g->overdrive_timer <= 0) {
            g->is_overdrive = false;
            g->overdrive_timer = 0;
        }
    }

    // 3. 节拍生成器
    g->spawn_timer++;
    int spawn_threshold = (g->score > 3000) ? 18 : ((g->score > 1000) ? 22 : 28);
    if (g->is_overdrive) spawn_threshold = (int)(spawn_threshold * 1.5f);

    if (g->spawn_timer >= spawn_threshold) {
        g->spawn_timer = 0;
        spawn_block(g);
    }

    // 4. 更新方块位置与判定
    float speed_factor = g->is_overdrive ? 0.45f : 1.0f; // 超频时时间减速 55%

    for (int i = 0; i < FLYSABER_MAX_BLOCKS; i++) {
        if (!g->blocks[i].active) continue;

        flysaber_block_t *b = &g->blocks[i];
        b->progress += b->speed * speed_factor;

        // 超过判定线且未被切中 -> 判定为 MISS / 漏击
        if (b->progress > 1.08f) {
            if (!b->sliced) {
                if (b->type == FLYSABER_BLOCK_SPIKE) {
                    // 尖刺成功躲过，给予微弱神经奖励
                    g->score += 20;
                } else {
                    // 普通方块漏切，温和扣减突触同步率 (从 15 降为 6)
                    g->combo = 0;
                    g->last_hit_result = FLYSABER_HIT_MISS;
                    g->hit_result_timer = 14;
                    g->pending_snd = FLYSABER_SND_MISS;
                    apply_sync_damage(g, 6);
                }
            }
            b->active = false;
        }
    }

    // 5. 更新粒子
    for (int i = 0; i < FLYSABER_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) continue;
        g->particles[i].x += g->particles[i].vx;
        g->particles[i].y += g->particles[i].vy;
        g->particles[i].life--;
        if (g->particles[i].life <= 0) {
            g->particles[i].active = false;
        }
    }
}

// 找到对应轨道中最接近判定线的活跃未切方块
static int find_target_block(flysaber_game_t *g, flysaber_lane_t lane)
{
    int best_idx = -1;
    float min_dist = 999.0f;

    for (int i = 0; i < FLYSABER_MAX_BLOCKS; i++) {
        if (g->blocks[i].active && !g->blocks[i].sliced && g->blocks[i].lane == lane) {
            float dist = fabsf(g->blocks[i].progress - FLYSABER_STRIKE_T);
            if (dist < min_dist) {
                min_dist = dist;
                best_idx = i;
            }
        }
    }
    return best_idx;
}

static void apply_slice_hit(flysaber_game_t *g, int idx, uint32_t fx_color)
{
    flysaber_block_t *b = &g->blocks[idx];
    float diff = fabsf(b->progress - FLYSABER_STRIKE_T);

    b->sliced = true;
    b->active = false;

    int bx, by, bw, bh;
    flysaber_calc_pos(b->progress, b->lane, &bx, &by, &bw, &bh);
    spawn_particles(g, (float)(bx + bw / 2), (float)(by + bh / 2), fx_color, 8);

    if (diff <= 0.08f) { // PERFECT 黄金反射窗口
        int pts = g->is_overdrive ? 300 : 100;
        g->score += pts;
        g->combo++;
        if (!g->is_overdrive) {
            g->overdrive_gauge += 10;
            if (g->overdrive_gauge > 100) g->overdrive_gauge = 100;
        }
        g->sync_hp += 8;
        if (g->sync_hp > 100) g->sync_hp = 100;

        if (g->combo > 0 && g->combo % 15 == 0 && g->lives < g->max_lives) {
            g->lives++;
        }

        g->last_hit_result = FLYSABER_HIT_PERFECT;
        g->hit_result_timer = 16;
        g->pending_snd = FLYSABER_SND_HIT_PERFECT;
    } else { // GOOD 命中窗口
        int pts = g->is_overdrive ? 150 : 50;
        g->score += pts;
        g->combo++;
        if (!g->is_overdrive) {
            g->overdrive_gauge += 5;
            if (g->overdrive_gauge > 100) g->overdrive_gauge = 100;
        }
        g->sync_hp += 4;
        if (g->sync_hp > 100) g->sync_hp = 100;

        g->last_hit_result = FLYSABER_HIT_GOOD;
        g->hit_result_timer = 12;
        g->pending_snd = FLYSABER_SND_HIT_GOOD;
    }

    if (g->combo > g->max_combo) {
        g->max_combo = g->combo;
    }
}

void flysaber_slash_left(flysaber_game_t *g)
{
    if (!g || g->game_over) return;
    g->slash_left_timer = 5;

    int idx = find_target_block(g, FLYSABER_LANE_LEFT);
    if (idx < 0) {
        g->pending_snd = FLYSABER_SND_SLASH_BLUE;
        return;
    }

    flysaber_block_t *b = &g->blocks[idx];
    float diff = fabsf(b->progress - FLYSABER_STRIKE_T);

    if (diff <= 0.18f) {
        if (b->type == FLYSABER_BLOCK_SPIKE) {
            // 误砍尖刺 (温和扣 8 点)
            g->combo = 0;
            g->last_hit_result = FLYSABER_HIT_SPIKE;
            g->hit_result_timer = 15;
            g->pending_snd = FLYSABER_SND_MISS;
            b->active = false;
            apply_sync_damage(g, 8);
        } else if (b->type == FLYSABER_BLOCK_BLUE) {
            apply_slice_hit(g, idx, 0x00E5FF); // 霓虹蓝光粒子
        } else {
            // 砍错颜色 (轻微扣 4 点)
            g->combo = 0;
            g->last_hit_result = FLYSABER_HIT_WRONG;
            g->hit_result_timer = 14;
            g->pending_snd = FLYSABER_SND_MISS;
            b->active = false;
            apply_sync_damage(g, 4);
        }
    } else {
        g->pending_snd = FLYSABER_SND_SLASH_BLUE;
    }
}

void flysaber_slash_right(flysaber_game_t *g)
{
    if (!g || g->game_over) return;
    g->slash_right_timer = 5;

    int idx = find_target_block(g, FLYSABER_LANE_RIGHT);
    if (idx < 0) {
        g->pending_snd = FLYSABER_SND_SLASH_RED;
        return;
    }

    flysaber_block_t *b = &g->blocks[idx];
    float diff = fabsf(b->progress - FLYSABER_STRIKE_T);

    if (diff <= 0.18f) {
        if (b->type == FLYSABER_BLOCK_SPIKE) {
            g->combo = 0;
            g->last_hit_result = FLYSABER_HIT_SPIKE;
            g->hit_result_timer = 15;
            g->pending_snd = FLYSABER_SND_MISS;
            b->active = false;
            apply_sync_damage(g, 8);
        } else if (b->type == FLYSABER_BLOCK_RED) {
            apply_slice_hit(g, idx, 0xFF3355); // 霓虹红光粒子
        } else {
            g->combo = 0;
            g->last_hit_result = FLYSABER_HIT_WRONG;
            g->hit_result_timer = 14;
            g->pending_snd = FLYSABER_SND_MISS;
            b->active = false;
            apply_sync_damage(g, 4);
        }
    } else {
        g->pending_snd = FLYSABER_SND_SLASH_RED;
    }
}

void flysaber_slash_dual(flysaber_game_t *g)
{
    if (!g || g->game_over) return;

    g->slash_dual_timer = 6;
    g->slash_left_timer = 6;
    g->slash_right_timer = 6;

    // 1. 若超频电位已满，触发【果蝇子弹时间/神经超频】
    if (g->overdrive_gauge >= 100) {
        g->is_overdrive = true;
        g->overdrive_timer = 120; // 持续 120 帧 (约 4~5 秒)
        g->overdrive_gauge = 0;
        g->last_hit_result = FLYSABER_HIT_PERFECT;
        g->hit_result_timer = 20;
        g->pending_snd = FLYSABER_SND_OVERDRIVE;

        // 瞬间全屏切割所有非尖刺方块！
        for (int i = 0; i < FLYSABER_MAX_BLOCKS; i++) {
            if (g->blocks[i].active && !g->blocks[i].sliced && g->blocks[i].type != FLYSABER_BLOCK_SPIKE) {
                apply_slice_hit(g, i, 0xFFD700); // 金色爆发粒子
            }
        }
        return;
    }

    // 2. 双刀常规合击：判定中央双色核心方块
    int center_idx = find_target_block(g, FLYSABER_LANE_CENTER);
    bool hit_something = false;

    if (center_idx >= 0) {
        flysaber_block_t *b = &g->blocks[center_idx];
        float diff = fabsf(b->progress - FLYSABER_STRIKE_T);
        if (diff <= 0.18f) {
            apply_slice_hit(g, center_idx, 0xD000FF); // 紫色粒子
            hit_something = true;
        }
    }

    // 3. 同时斩切处于判定窗口的左右两侧方块 (双刀全斩)
    int l_idx = find_target_block(g, FLYSABER_LANE_LEFT);
    int r_idx = find_target_block(g, FLYSABER_LANE_RIGHT);

    if (l_idx >= 0 && g->blocks[l_idx].type == FLYSABER_BLOCK_BLUE) {
        if (fabsf(g->blocks[l_idx].progress - FLYSABER_STRIKE_T) <= 0.18f) {
            apply_slice_hit(g, l_idx, 0x00E5FF);
            hit_something = true;
        }
    }
    if (r_idx >= 0 && g->blocks[r_idx].type == FLYSABER_BLOCK_RED) {
        if (fabsf(g->blocks[r_idx].progress - FLYSABER_STRIKE_T) <= 0.18f) {
            apply_slice_hit(g, r_idx, 0xFF3355);
            hit_something = true;
        }
    }

    if (!hit_something) {
        g->pending_snd = FLYSABER_SND_SLASH_BLUE;
    }
}
