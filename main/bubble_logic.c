// main/bubble_logic.c —— 《飞针破泡录》(Bubble Needle) 核心游戏算法引擎实现
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，与硬件完全解耦。
#include "bubble_logic.h"
#include <math.h>
#include <string.h>

#define DEG_TO_RAD (3.14159265358979323846f / 180.0f)
#define TWO_PI     (6.28318530717958647692f)

// 内部快速 PRNG (Xorshift32，保证跨平台确定性与零堆分配)
static inline uint32_t bubble_rng_next(bubble_game_t *g)
{
    uint32_t x = g->rng_state;
    if (x == 0) {
        x = 0x12345678;
    }
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    g->rng_state = x;
    return x;
}

static inline float bubble_rng_float(bubble_game_t *g, float min_val, float max_val)
{
    uint32_t r = bubble_rng_next(g);
    float norm = (float)(r & 0xFFFF) / 65535.0f;
    return min_val + norm * (max_val - min_val);
}

// 内部音效压入队列
static void bubble_sound_enqueue(bubble_game_t *g, bubble_sound_t snd)
{
    if (!g || snd == BUBBLE_SND_NONE) {
        return;
    }
    g->pending_sound = snd;
    if (g->sound_q.count < BUBBLE_MAX_SOUND_QUEUE) {
        g->sound_q.queue[g->sound_q.tail] = snd;
        g->sound_q.tail = (uint8_t)((g->sound_q.tail + 1) % BUBBLE_MAX_SOUND_QUEUE);
        g->sound_q.count++;
    }
}

// 内部粒子生成
static void bubble_spawn_particles(bubble_game_t *g, bubble_particle_type_t type, float x, float y, int count)
{
    if (!g || count <= 0) {
        return;
    }
    for (int i = 0; i < count; i++) {
        for (int p_idx = 0; p_idx < BUBBLE_MAX_PARTICLES; p_idx++) {
            if (!g->particles[p_idx].active) {
                bubble_particle_t *p = &g->particles[p_idx];
                p->active = true;
                p->type = type;
                p->x = x;
                p->y = y;
                float angle = bubble_rng_float(g, 0.0f, TWO_PI);
                float speed = bubble_rng_float(g, 30.0f, 130.0f);
                p->vx = cosf(angle) * speed;
                p->vy = sinf(angle) * speed;
                p->life_ms = bubble_rng_float(g, 200.0f, 450.0f);
                p->max_life_ms = p->life_ms;
                p->size = bubble_rng_float(g, 2.0f, 4.0f);
                break;
            }
        }
    }
}

// 内部气泡刺破与连锁引爆核心
static void bubble_pop_internal(bubble_game_t *g, int b_idx)
{
    if (!g || b_idx < 0 || b_idx >= BUBBLE_MAX_BUBBLES) {
        return;
    }
    bubble_t *b = &g->bubbles[b_idx];
    if (!b->active) {
        return;
    }

    b->active = false;
    g->bubbles_popped++;

    // 连击步步爬升
    g->combo_count++;
    g->combo_timer_ms = BUBBLE_COMBO_TIMEOUT_MS;
    if (g->combo_count > g->max_combo) {
        g->max_combo = g->combo_count;
    }

    // 连破音阶递增 (POP_1 ~ POP_5)
    bubble_sound_t pop_snd = BUBBLE_SND_POP_1;
    if (g->combo_count == 2) {
        pop_snd = BUBBLE_SND_POP_2;
    } else if (g->combo_count == 3) {
        pop_snd = BUBBLE_SND_POP_3;
    } else if (g->combo_count == 4) {
        pop_snd = BUBBLE_SND_POP_4;
    } else if (g->combo_count >= 5) {
        pop_snd = BUBBLE_SND_POP_5;
    }

    // 分数计算 (基础分 * 连击乘数)
    uint32_t base_score = 100;
    if (b->type == BUBBLE_TYPE_HARDENED) {
        base_score = 250;
    } else if (b->type == BUBBLE_TYPE_THUNDER) {
        base_score = 150;
    } else if (b->type == BUBBLE_TYPE_FROZEN) {
        base_score = 150;
    } else if (b->type == BUBBLE_TYPE_GOLD) {
        base_score = 500;
    }
    g->score += base_score * g->combo_count;

    // 针对各类型特殊破裂处理
    switch (b->type) {
    case BUBBLE_TYPE_RAINBOW:
        bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, b->x, b->y, 8);
        bubble_sound_enqueue(g, pop_snd);
        break;

    case BUBBLE_TYPE_HARDENED:
        bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, b->x, b->y, 10);
        bubble_sound_enqueue(g, pop_snd);
        break;

    case BUBBLE_TYPE_GOLD:
        bubble_spawn_particles(g, BUBBLE_PART_GOLD_SHINE, b->x, b->y, 12);
        bubble_sound_enqueue(g, BUBBLE_SND_COIN);
        bubble_sound_enqueue(g, pop_snd);
        g->score += 500; // 金币额外掉落大奖
        break;

    case BUBBLE_TYPE_FROZEN:
        bubble_spawn_particles(g, BUBBLE_PART_ICE_CRYSTAL, b->x, b->y, 12);
        g->freeze_timer_ms = BUBBLE_FREEZE_DURATION_MS;
        bubble_sound_enqueue(g, BUBBLE_SND_FREEZE);
        bubble_sound_enqueue(g, pop_snd);
        break;

    case BUBBLE_TYPE_THUNDER: {
        bubble_spawn_particles(g, BUBBLE_PART_LIGHTNING_SPARK, b->x, b->y, 16);
        bubble_sound_enqueue(g, BUBBLE_SND_THUNDER_BLAST);
        bubble_sound_enqueue(g, pop_snd);

        // 电弧引爆周围范围气泡 (连锁引爆)
        float cx = b->x;
        float cy = b->y;
        for (int other_idx = 0; other_idx < BUBBLE_MAX_BUBBLES; other_idx++) {
            if (other_idx == b_idx) {
                continue;
            }
            bubble_t *ob = &g->bubbles[other_idx];
            if (!ob->active) {
                continue;
            }
            float dx = ob->x - cx;
            float dy = ob->y - cy;
            float dist_sq = dx * dx + dy * dy;
            float blast_r = BUBBLE_THUNDER_RADIUS + ob->radius;
            if (dist_sq <= blast_r * blast_r) {
                if (ob->type == BUBBLE_TYPE_HARDENED) {
                    ob->hp--;
                    if (ob->hp <= 0) {
                        bubble_pop_internal(g, other_idx);
                    } else {
                        bubble_sound_enqueue(g, BUBBLE_SND_HARD_HIT);
                        bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, ob->x, ob->y, 4);
                    }
                } else {
                    bubble_pop_internal(g, other_idx);
                }
            }
        }
        break;
    }
    }
}

// =========================================================================
// 核心生命周期 API 实现
// =========================================================================
void bubble_game_init(bubble_game_t *g, uint32_t seed)
{
    if (!g) {
        return;
    }
    memset(g, 0, sizeof(*g));
    g->state = BUBBLE_STATE_PLAYING;
    g->rng_state = (seed != 0) ? seed : 0x20260919;

    g->base_x = BUBBLE_BASE_X;
    g->base_y = BUBBLE_BASE_Y;
    g->aim_angle_deg = 0.0f; // 垂直向上

    g->lives = BUBBLE_DEFAULT_LIVES;
    g->spawn_interval_ms = BUBBLE_SPAWN_INTERVAL_MS;
    g->spawn_timer_ms = 0;
}

void bubble_game_reset(bubble_game_t *g)
{
    if (!g) {
        return;
    }
    uint32_t saved_seed = g->rng_state;
    bubble_game_init(g, saved_seed);
}

void bubble_game_pause(bubble_game_t *g)
{
    if (g && g->state == BUBBLE_STATE_PLAYING) {
        g->state = BUBBLE_STATE_PAUSED;
    }
}

void bubble_game_resume(bubble_game_t *g)
{
    if (g && g->state == BUBBLE_STATE_PAUSED) {
        g->state = BUBBLE_STATE_PLAYING;
    }
}

bool bubble_game_is_game_over(const bubble_game_t *g)
{
    return (g && g->state == BUBBLE_STATE_GAMEOVER);
}

bool bubble_game_is_paused(const bubble_game_t *g)
{
    return (g && g->state == BUBBLE_STATE_PAUSED);
}

// =========================================================================
// 用户交互与按键输入实现
// =========================================================================
void bubble_input_up(bubble_game_t *g)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING) {
        return;
    }
    g->aim_angle_deg -= BUBBLE_AIM_STEP_DEG;
    if (g->aim_angle_deg < BUBBLE_AIM_MIN_DEG) {
        g->aim_angle_deg = BUBBLE_AIM_MIN_DEG;
    }
}

void bubble_input_down(bubble_game_t *g)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING) {
        return;
    }
    g->aim_angle_deg += BUBBLE_AIM_STEP_DEG;
    if (g->aim_angle_deg > BUBBLE_AIM_MAX_DEG) {
        g->aim_angle_deg = BUBBLE_AIM_MAX_DEG;
    }
}

void bubble_input_set_aim_angle(bubble_game_t *g, float angle_deg)
{
    if (!g) {
        return;
    }
    if (angle_deg < BUBBLE_AIM_MIN_DEG) {
        angle_deg = BUBBLE_AIM_MIN_DEG;
    } else if (angle_deg > BUBBLE_AIM_MAX_DEG) {
        angle_deg = BUBBLE_AIM_MAX_DEG;
    }
    g->aim_angle_deg = angle_deg;
}

void bubble_input_ok_press(bubble_game_t *g)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING) {
        return;
    }
    g->ok_pressed = true;
    g->charge_time_ms = 0;
    g->is_charged = false;
}

void bubble_input_ok_release(bubble_game_t *g)
{
    if (!g || !g->ok_pressed) {
        return;
    }
    g->ok_pressed = false;
    if (g->is_charged) {
        bubble_shoot_charged(g);
    } else {
        bubble_shoot_normal(g);
    }
    g->charge_time_ms = 0;
    g->is_charged = false;
}

bool bubble_shoot_normal(bubble_game_t *g)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING) {
        return false;
    }
    for (int i = 0; i < BUBBLE_MAX_NEEDLES; i++) {
        if (!g->needles[i].active) {
            bubble_needle_t *n = &g->needles[i];
            n->active = true;
            n->type = BUBBLE_NEEDLE_NORMAL;
            n->x = g->base_x;
            n->y = g->base_y;
            float rad = g->aim_angle_deg * DEG_TO_RAD;
            n->vx = BUBBLE_NEEDLE_SPEED_NORMAL * sinf(rad);
            n->vy = -BUBBLE_NEEDLE_SPEED_NORMAL * cosf(rad);
            n->radius = BUBBLE_NEEDLE_RADIUS_NORMAL;
            n->length = BUBBLE_NEEDLE_LENGTH_NORMAL;
            n->hit_count = 0;
            n->bounce_count = 0;
            n->hit_bubble_mask = 0;

            g->needles_fired++;
            bubble_sound_enqueue(g, BUBBLE_SND_SHOOT);
            return true;
        }
    }
    return false;
}

bool bubble_shoot_charged(bubble_game_t *g)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING) {
        return false;
    }
    for (int i = 0; i < BUBBLE_MAX_NEEDLES; i++) {
        if (!g->needles[i].active) {
            bubble_needle_t *n = &g->needles[i];
            n->active = true;
            n->type = BUBBLE_NEEDLE_PIERCING;
            n->x = g->base_x;
            n->y = g->base_y;
            float rad = g->aim_angle_deg * DEG_TO_RAD;
            n->vx = BUBBLE_NEEDLE_SPEED_CHARGED * sinf(rad);
            n->vy = -BUBBLE_NEEDLE_SPEED_CHARGED * cosf(rad);
            n->radius = BUBBLE_NEEDLE_RADIUS_CHARGED;
            n->length = BUBBLE_NEEDLE_LENGTH_CHARGED;
            n->hit_count = 0;
            n->bounce_count = 0;
            n->hit_bubble_mask = 0;

            g->needles_fired++;
            bubble_sound_enqueue(g, BUBBLE_SND_SHOOT_CHARGED);
            return true;
        }
    }
    return false;
}

// =========================================================================
// 音效事件处理实现
// =========================================================================
bubble_sound_t bubble_sound_dequeue(bubble_game_t *g)
{
    if (!g || g->sound_q.count == 0) {
        return BUBBLE_SND_NONE;
    }
    bubble_sound_t snd = g->sound_q.queue[g->sound_q.head];
    g->sound_q.head = (uint8_t)((g->sound_q.head + 1) % BUBBLE_MAX_SOUND_QUEUE);
    g->sound_q.count--;
    return snd;
}

bubble_sound_t bubble_sound_peek(const bubble_game_t *g)
{
    if (!g || g->sound_q.count == 0) {
        return BUBBLE_SND_NONE;
    }
    return g->sound_q.queue[g->sound_q.head];
}

void bubble_sound_clear(bubble_game_t *g)
{
    if (!g) {
        return;
    }
    g->sound_q.head = 0;
    g->sound_q.tail = 0;
    g->sound_q.count = 0;
    g->pending_sound = BUBBLE_SND_NONE;
}

// =========================================================================
// 气泡与实体管理实现
// =========================================================================
int bubble_spawn(bubble_game_t *g, bubble_type_t type, float x, float y, float vy, float radius)
{
    if (!g) {
        return -1;
    }
    for (int i = 0; i < BUBBLE_MAX_BUBBLES; i++) {
        if (!g->bubbles[i].active) {
            bubble_t *b = &g->bubbles[i];
            b->active = true;
            b->type = type;
            b->x = x;
            b->y = y;
            b->vx = 0.0f;
            b->vy = vy;
            b->base_vy = vy;
            b->radius = radius;
            b->hp = (type == BUBBLE_TYPE_HARDENED) ? 2 : 1;
            b->max_hp = b->hp;
            b->wobble_phase = bubble_rng_float(g, 0.0f, TWO_PI);
            b->wobble_speed = bubble_rng_float(g, 1.5f, 3.5f);
            b->wobble_amp = bubble_rng_float(g, 6.0f, 15.0f);
            return i;
        }
    }
    return -1;
}

int bubble_get_active_count(const bubble_game_t *g)
{
    if (!g) {
        return 0;
    }
    int count = 0;
    for (int i = 0; i < BUBBLE_MAX_BUBBLES; i++) {
        if (g->bubbles[i].active) {
            count++;
        }
    }
    return count;
}

int bubble_get_needle_count(const bubble_game_t *g)
{
    if (!g) {
        return 0;
    }
    int count = 0;
    for (int i = 0; i < BUBBLE_MAX_NEEDLES; i++) {
        if (g->needles[i].active) {
            count++;
        }
    }
    return count;
}

int bubble_get_particle_count(const bubble_game_t *g)
{
    if (!g) {
        return 0;
    }
    int count = 0;
    for (int i = 0; i < BUBBLE_MAX_PARTICLES; i++) {
        if (g->particles[i].active) {
            count++;
        }
    }
    return count;
}

bool bubble_is_frozen(const bubble_game_t *g)
{
    return (g && g->freeze_timer_ms > 0);
}

// =========================================================================
// 核心逐帧模拟步进 (State Machine Tick)
// =========================================================================
void bubble_game_step(bubble_game_t *g, uint32_t dt_ms)
{
    if (!g || g->state != BUBBLE_STATE_PLAYING || dt_ms == 0) {
        return;
    }

    float dt_sec = (float)dt_ms / 1000.0f;
    g->game_time_ms += dt_ms;

    // 1. 蓄力计时更新
    if (g->ok_pressed) {
        g->charge_time_ms += dt_ms;
        if (g->charge_time_ms >= BUBBLE_CHARGE_TIME_MS) {
            g->is_charged = true;
        }
    }

    // 2. 连击倒计时更新
    if (g->combo_timer_ms > 0) {
        if (g->combo_timer_ms > dt_ms) {
            g->combo_timer_ms -= dt_ms;
        } else {
            g->combo_timer_ms = 0;
            g->combo_count = 0;
        }
    }

    // 3. 冰冻倒计时更新
    if (g->freeze_timer_ms > 0) {
        if (g->freeze_timer_ms > dt_ms) {
            g->freeze_timer_ms -= dt_ms;
        } else {
            g->freeze_timer_ms = 0;
        }
    }

    // 4. 自动生成气泡
    g->spawn_timer_ms += dt_ms;
    if (g->spawn_timer_ms >= g->spawn_interval_ms) {
        g->spawn_timer_ms = 0;
        uint32_t r = bubble_rng_next(g) % 100;
        bubble_type_t t = BUBBLE_TYPE_RAINBOW;
        if (r < 50) {
            t = BUBBLE_TYPE_RAINBOW;
        } else if (r < 68) {
            t = BUBBLE_TYPE_HARDENED;
        } else if (r < 80) {
            t = BUBBLE_TYPE_THUNDER;
        } else if (r < 90) {
            t = BUBBLE_TYPE_FROZEN;
        } else {
            t = BUBBLE_TYPE_GOLD;
        }

        float radius = (t == BUBBLE_TYPE_HARDENED) ? 16.0f : bubble_rng_float(g, 12.0f, 15.0f);
        float sx = bubble_rng_float(g, radius + 10.0f, (float)BUBBLE_SCREEN_W - radius - 10.0f);
        float sy = (float)BUBBLE_SCREEN_H + radius;
        float svy = -bubble_rng_float(g, 26.0f, 44.0f);
        bubble_spawn(g, t, sx, sy, svy, radius);
    }

    // 5. 气泡漂浮与越界判定 (冰冻状态下悬停暂停)
    float speed_scale = (g->freeze_timer_ms > 0) ? 0.0f : 1.0f;
    for (int i = 0; i < BUBBLE_MAX_BUBBLES; i++) {
        bubble_t *b = &g->bubbles[i];
        if (!b->active) {
            continue;
        }

        b->y += b->vy * speed_scale * dt_sec;
        b->wobble_phase += b->wobble_speed * speed_scale * dt_sec;
        b->x += cosf(b->wobble_phase) * b->wobble_amp * speed_scale * dt_sec;

        // 限制在屏幕横向范围内
        if (b->x < b->radius) {
            b->x = b->radius;
        } else if (b->x > (float)BUBBLE_SCREEN_W - b->radius) {
            b->x = (float)BUBBLE_SCREEN_W - b->radius;
        }

        // 气泡逃脱顶部屏幕
        if (b->y + b->radius < 0.0f) {
            b->active = false;
            g->bubbles_escaped++;
            if (g->lives > 0) {
                g->lives--;
                if (g->lives == 0) {
                    g->state = BUBBLE_STATE_GAMEOVER;
                    bubble_sound_enqueue(g, BUBBLE_SND_GAMEOVER);
                }
            }
        }
    }

    // 6. 飞针弹道物理与左右侧壁反弹
    for (int i = 0; i < BUBBLE_MAX_NEEDLES; i++) {
        bubble_needle_t *n = &g->needles[i];
        if (!n->active) {
            continue;
        }

        n->x += n->vx * dt_sec;
        n->y += n->vy * dt_sec;

        // 左侧壁碰撞反弹
        if (n->x - n->radius <= 0.0f) {
            n->x = n->radius;
            n->vx = -n->vx;
            n->bounce_count++;
            bubble_sound_enqueue(g, BUBBLE_SND_WALL_BOUNCE);
            bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, n->x, n->y, 3);
        }
        // 右侧壁碰撞反弹
        else if (n->x + n->radius >= (float)BUBBLE_SCREEN_W) {
            n->x = (float)BUBBLE_SCREEN_W - n->radius;
            n->vx = -n->vx;
            n->bounce_count++;
            bubble_sound_enqueue(g, BUBBLE_SND_WALL_BOUNCE);
            bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, n->x, n->y, 3);
        }

        // 穿出顶部屏幕判定
        if (n->y + n->radius < 0.0f) {
            n->active = false;
            // 若一针未发未命中任何气泡，连击中断
            if (n->hit_count == 0) {
                if (g->combo_count > 0) {
                    bubble_sound_enqueue(g, BUBBLE_SND_COMBO_BREAK);
                }
                g->combo_count = 0;
            }
            continue;
        }

        // 飞出底部屏幕判定
        if (n->y - n->radius > (float)BUBBLE_SCREEN_H) {
            n->active = false;
            continue;
        }

        // 7. 飞针与气泡碰撞检测
        for (int b_idx = 0; b_idx < BUBBLE_MAX_BUBBLES; b_idx++) {
            bubble_t *b = &g->bubbles[b_idx];
            if (!b->active) {
                continue;
            }

            // 针对穿透针，跳过本针已击中过的气泡
            if (n->type == BUBBLE_NEEDLE_PIERCING) {
                if (n->hit_bubble_mask & (1U << b_idx)) {
                    continue;
                }
            }

            float dx = n->x - b->x;
            float dy = n->y - b->y;
            float dist_sq = dx * dx + dy * dy;
            float hit_r = n->radius + b->radius;

            if (dist_sq <= hit_r * hit_r) {
                // 击中！
                n->hit_count++;
                if (n->type == BUBBLE_NEEDLE_PIERCING) {
                    n->hit_bubble_mask |= (1U << b_idx);
                }

                if (b->type == BUBBLE_TYPE_HARDENED) {
                    b->hp--;
                    if (b->hp > 0) {
                        // 首次击中双层硬化泡：外层破裂，暂不消亡
                        bubble_sound_enqueue(g, BUBBLE_SND_HARD_HIT);
                        bubble_spawn_particles(g, BUBBLE_PART_WATER_SPLASH, b->x, b->y, 5);
                        if (n->type == BUBBLE_NEEDLE_NORMAL) {
                            n->active = false;
                            break;
                        }
                        continue;
                    } else {
                        // 第二次击中：破壳爆开
                        bubble_pop_internal(g, b_idx);
                        if (n->type == BUBBLE_NEEDLE_NORMAL) {
                            n->active = false;
                            break;
                        }
                        continue;
                    }
                } else {
                    // 普通、雷云、冰冻、金币泡等一击即破
                    bubble_pop_internal(g, b_idx);
                    if (n->type == BUBBLE_NEEDLE_NORMAL) {
                        n->active = false;
                        break;
                    }
                    continue;
                }
            }
        }
    }

    // 8. 粒子微粒更新
    for (int i = 0; i < BUBBLE_MAX_PARTICLES; i++) {
        bubble_particle_t *p = &g->particles[i];
        if (!p->active) {
            continue;
        }

        p->x += p->vx * dt_sec;
        p->y += p->vy * dt_sec;
        p->vy += 75.0f * dt_sec; // 重力微弱沉降

        if (p->life_ms > (float)dt_ms) {
            p->life_ms -= (float)dt_ms;
        } else {
            p->active = false;
        }
    }
}
