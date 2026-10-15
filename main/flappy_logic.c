#include "flappy_logic.h"
#include <math.h>
#include <string.h>

// 全局默认游戏上下文实例
static flappy_game_t s_default_game;

// 线性同余发生器 (LCG) 伪随机数计算
static float flappy_rand_range(flappy_game_t *g, float min_val, float max_val)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    float norm = (float)(g->rng_state & 0x7FFFFFFFu) / (float)0x7FFFFFFFu;
    return min_val + norm * (max_val - min_val);
}

// 重置/初始化管道池
static void flappy_reset_pipes(flappy_game_t *g)
{
    for (int i = 0; i < FLAPPY_MAX_PIPES; i++) {
        g->pipes[i].active = true;
        g->pipes[i].width = FLAPPY_PIPE_W;
        g->pipes[i].gap_height = g->default_gap_height;
        g->pipes[i].gap_y = flappy_rand_range(g, FLAPPY_MIN_GAP_Y, FLAPPY_MAX_GAP_Y);
        g->pipes[i].gap_base_y = g->pipes[i].gap_y;
        g->pipes[i].gap_osc_amp = 0.0f;
        g->pipes[i].gap_osc_phase = 0.0f;
        g->pipes[i].x = (float)FLAPPY_SCREEN_W + 20.0f + (float)i * FLAPPY_PIPE_SPACING;
        g->pipes[i].passed = false;
        g->pipes[i].golden = false;
    }
}

// 精确 AABB 矩形碰撞检测 (地面、天花板、上下水管)
bool flappy_logic_check_collision_ctx(const flappy_game_t *g)
{
    if (!g) {
        return false;
    }

    // 1. 地面碰撞 (小鸟底部到达或陷入地面)
    if (g->y + g->h >= (float)FLAPPY_GROUND_Y) {
        return true;
    }

    // 2. 天花板碰撞 (小鸟顶部超出天花板)
    if (g->y <= 0.0f) {
        return true;
    }

    // 3. 水管障碍物碰撞
    float bx0 = g->x;
    float bx1 = g->x + g->w;
    float by0 = g->y;
    float by1 = g->y + g->h;

    for (int i = 0; i < FLAPPY_MAX_PIPES; i++) {
        const flappy_pipe_t *p = &g->pipes[i];
        if (!p->active) {
            continue;
        }

        float px0 = p->x;
        float px1 = p->x + p->width;

        // 水平投影重叠判断
        if (bx1 > px0 && bx0 < px1) {
            // 上水管矩形: [px0, 0, width, gap_y]
            if (by0 < p->gap_y) {
                return true;
            }

            // 下水管矩形: [px0, gap_y + gap_height, width, FLAPPY_GROUND_Y - (gap_y + gap_height)]
            float bot_pipe_top = p->gap_y + p->gap_height;
            if (by1 > bot_pipe_top) {
                return true;
            }
        }
    }

    return false;
}

// 初始化独立实例 (全新初始化)
void flappy_logic_init_ctx(flappy_game_t *g)
{
    if (!g) {
        return;
    }

    memset(g, 0, sizeof(*g));

    g->x = FLAPPY_BIRD_X;
    g->y = FLAPPY_BIRD_INIT_Y;
    g->w = FLAPPY_BIRD_W;
    g->h = FLAPPY_BIRD_H;
    g->vy = 0.0f;
    g->gravity = FLAPPY_GRAVITY;
    g->flap_impulse = FLAPPY_FLAP_IMPULSE;
    g->rotation = 0.0f;

    g->pipe_speed = FLAPPY_PIPE_SPEED;
    g->default_gap_height = FLAPPY_PIPE_GAP_H;

    g->is_night = false;
    g->wind_x = 0.0f;
    g->turbulence_force = 0.0f;
    g->turbulence_phase = 0.0f;
    g->drag_coeff = 0.0012f;
    g->turbulence_enabled = true;

    g->score = 0;
    g->high_score = 0;
    g->golden_count = 0;
    g->state = FLAPPY_STATE_PLAYING;
    g->game_over = false;

    g->rng_state = 123456789u;
    flappy_reset_pipes(g);
}

// 重新开始游戏 (保留历史最高分)
void flappy_logic_restart_ctx(flappy_game_t *g)
{
    if (!g) {
        return;
    }
    int saved_high_score = g->high_score;
    flappy_logic_init_ctx(g);
    g->high_score = saved_high_score;
}

// 设置随机数种子
void flappy_logic_set_seed_ctx(flappy_game_t *g, uint32_t seed)
{
    if (g) {
        g->rng_state = seed ? seed : 123456789u;
    }
}

// 跳跃点火
void flappy_logic_flap_ctx(flappy_game_t *g)
{
    if (!g) {
        return;
    }

    if (g->state == FLAPPY_STATE_READY) {
        g->state = FLAPPY_STATE_PLAYING;
        g->vy = g->flap_impulse;
        g->rotation = FLAPPY_ROTATION_UP;
        g->snd_flap = true;
    } else if (g->state == FLAPPY_STATE_PLAYING && !g->game_over) {
        g->vy = g->flap_impulse;
        g->rotation = FLAPPY_ROTATION_UP;
        g->snd_flap = true;
    }
}

// 推进游戏物理与实体循环
void flappy_logic_update_ctx(flappy_game_t *g, uint32_t dt_ms)
{
    if (!g || dt_ms == 0) {
        return;
    }

    float dt = (float)dt_ms / 1000.0f;

    g->total_time_ms += dt_ms;
    g->state_time_ms += dt_ms;

    // 清理上一帧单触发音效标志
    g->snd_flap = false;
    g->snd_score = false;
    g->snd_hit = false;
    g->snd_die = false;
    g->snd_golden = false;

    // 死亡状态处理：管道冻结停止，若在半空则受重力自然下落触地
    if (g->state == FLAPPY_STATE_GAMEOVER || g->game_over) {
        if (g->y + g->h < (float)FLAPPY_GROUND_Y) {
            g->vy += g->gravity * dt;
            if (g->vy > FLAPPY_MAX_FALL_SPEED) {
                g->vy = FLAPPY_MAX_FALL_SPEED;
            }
            g->y += g->vy * dt;
            g->rotation = FLAPPY_ROTATION_DOWN;
            if (g->y + g->h >= (float)FLAPPY_GROUND_Y) {
                g->y = (float)FLAPPY_GROUND_Y - g->h;
                g->vy = 0.0f;
            }
        }
        return;
    }

    if (g->state == FLAPPY_STATE_READY) {
        g->rotation = 0.0f;
        g->vy = 0.0f;
        return;
    }

    // --- FLAPPY_STATE_PLAYING 物理运动与管道推进 ---

    // 1. 动态环境微扰系统 (风阻与复合乱流)
    if (g->turbulence_enabled) {
        g->turbulence_phase += dt * 3.0f;
        g->turbulence_force = 16.0f * sinf(g->turbulence_phase) +
                              8.0f * sinf(g->turbulence_phase * 2.3f + 0.8f);
    } else {
        g->turbulence_force = 0.0f;
    }

    // 空气风阻微扰
    float drag = 0.0f;
    if (g->drag_coeff > 0.0f) {
        drag = g->drag_coeff * g->vy * fabsf(g->vy);
    }

    // 垂直加速度与速度更新
    float a_y = g->gravity + g->turbulence_force - drag;
    g->vy += a_y * dt;
    if (g->vy > FLAPPY_MAX_FALL_SPEED) {
        g->vy = FLAPPY_MAX_FALL_SPEED;
    }

    // 垂直位置更新
    g->y += g->vy * dt;

    // 俯仰角模拟 (下落时渐进低头，直到最大角度)
    if (g->vy >= 0.0f) {
        g->rotation += FLAPPY_ROTATION_SPEED * dt;
        if (g->rotation > FLAPPY_ROTATION_DOWN) {
            g->rotation = FLAPPY_ROTATION_DOWN;
        }
    }

    // 2. 管道系统水平移动与循环对象池
    float bird_mid_x = g->x + g->w * 0.5f;

    for (int i = 0; i < FLAPPY_MAX_PIPES; i++) {
        flappy_pipe_t *p = &g->pipes[i];
        if (!p->active) {
            continue;
        }

        // 水平向左推移
        p->x -= g->pipe_speed * dt;

        // 垂直振荡 (高分后的活水管)
        if (p->gap_osc_amp > 0.5f) {
            p->gap_osc_phase += dt * 2.4f;
            float max_gap_y = (float)FLAPPY_GROUND_Y - p->gap_height - 30.0f;
            p->gap_y = p->gap_base_y + sinf(p->gap_osc_phase) * p->gap_osc_amp;
            if (p->gap_y < FLAPPY_MIN_GAP_Y) {
                p->gap_y = FLAPPY_MIN_GAP_Y;
            } else if (p->gap_y > max_gap_y) {
                p->gap_y = max_gap_y;
            }
        }

        // 穿过水管中心线计分
        float pipe_mid_x = p->x + p->width * 0.5f;
        if (!p->passed && bird_mid_x >= pipe_mid_x) {
            p->passed = true;
            int add = p->golden ? 2 : 1;
            g->score += add;
            g->snd_score = true;
            if (p->golden) {
                g->golden_count++;
                g->snd_golden = true;
            }
            if (g->score > g->high_score) {
                g->high_score = g->score;
            }
            // 昼夜模式自动切换 (每 10 分切换一次)
            g->is_night = ((g->score / 10) % 2 == 1);
            // 分数越高水管越快，封顶避免不可读
            g->pipe_speed = FLAPPY_PIPE_SPEED + (float)g->score * 1.8f;
            if (g->pipe_speed > FLAPPY_PIPE_SPEED_MAX) {
                g->pipe_speed = FLAPPY_PIPE_SPEED_MAX;
            }
        }

        // 移出屏幕左侧后在右侧重新生成 (循环复用)
        if (p->x + p->width < 0.0f) {
            float max_x = (float)FLAPPY_SCREEN_W;
            for (int j = 0; j < FLAPPY_MAX_PIPES; j++) {
                if (g->pipes[j].active && g->pipes[j].x > max_x) {
                    max_x = g->pipes[j].x;
                }
            }
            p->x = max_x + FLAPPY_PIPE_SPACING;
            p->passed = false;

            float shrink = (float)g->score * 0.85f;
            if (shrink > (g->default_gap_height - FLAPPY_MIN_GAP_H)) {
                shrink = g->default_gap_height - FLAPPY_MIN_GAP_H;
            }
            p->gap_height = g->default_gap_height - shrink;

            float max_gap_y = (float)FLAPPY_GROUND_Y - p->gap_height - 30.0f;
            p->gap_base_y = flappy_rand_range(g, FLAPPY_MIN_GAP_Y, max_gap_y);
            p->gap_y = p->gap_base_y;
            p->gap_osc_phase = 0.0f;
            p->gap_osc_amp = (g->score >= 8) ? 10.0f : 0.0f;
            p->golden = (g->score >= 5) && ((g->rng_state & 7u) == 0u);
        }
    }

    // 3. 精确碰撞检测判定
    if (flappy_logic_check_collision_ctx(g)) {
        g->state = FLAPPY_STATE_GAMEOVER;
        g->game_over = true;
        g->snd_hit = true;
        g->snd_die = true;

        if (g->y + g->h >= (float)FLAPPY_GROUND_Y) {
            g->y = (float)FLAPPY_GROUND_Y - g->h;
            g->vy = 0.0f;
        }
    }
}

// 全局默认上下文标准接口实现
void flappy_logic_init(void)
{
    flappy_logic_init_ctx(&s_default_game);
}

void flappy_logic_update(uint32_t dt_ms)
{
    flappy_logic_update_ctx(&s_default_game, dt_ms);
}

void flappy_logic_flap(void)
{
    flappy_logic_flap_ctx(&s_default_game);
}

flappy_game_t *flappy_logic_get_state(void)
{
    return &s_default_game;
}
