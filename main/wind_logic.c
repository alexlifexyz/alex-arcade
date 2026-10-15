// main/wind_logic.c —— 《风与纸翼》(Wind Rider) 纯 C 状态机算法引擎实现
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计
#include "wind_logic.h"

// 内部宏定义与数学常数
#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

#define WIND_RAD_TO_DEG (180.0f / M_PI)
#define WIND_DEG_TO_RAD (M_PI / 180.0f)
#define WIND_SKY_PHASE_DISTANCE 1600.0f // 每一个天色时段对应的飞行距离 (px)

// 伪随机数生成 (Xorshift32，保证平台无关性与确定性)
static uint32_t wind_xorshift32(wind_game_t *g)
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

static float wind_rand_range(wind_game_t *g, float min_val, float max_val)
{
    uint32_t r = wind_xorshift32(g) & 0xFFFF;
    float t = (float)r / 65535.0f;
    return min_val + t * (max_val - min_val);
}

// 纯数学平滑山丘地形高度 (Y向下增大，Y越小地势越高)
float wind_get_ground_height(float distance)
{
    // 三重不同周期与相位的平滑正弦谐波复合，生成连绵起伏、大山谷与平缓坡地
    // 波长 1: ~1000px, 振幅 42px (大山谷/长坡)
    // 波长 2: ~360px,  振幅 22px (起伏丘陵)
    // 波长 3: ~120px,  振幅 7px  (平滑微起伏质感)
    float h1 = sinf(distance * 0.006283f) * 42.0f;
    float h2 = sinf(distance * 0.017453f + 1.25f) * 22.0f;
    float h3 = cosf(distance * 0.052359f) * 7.0f;
    return WIND_BASE_GROUND_Y + h1 + h2 + h3;
}

// 地表切线斜率解析导数 (dy/dx)
float wind_get_ground_slope(float distance)
{
    float d1 = 0.006283f * 42.0f * cosf(distance * 0.006283f);
    float d2 = 0.017453f * 22.0f * cosf(distance * 0.017453f + 1.25f);
    float d3 = -0.052359f * 7.0f * sinf(distance * 0.052359f);
    return d1 + d2 + d3;
}

// 静态粒子池管理
static void wind_spawn_particle(wind_game_t *g, wind_part_type_t type, float x, float y,
                                float vx, float vy, float life_ms, float size, uint32_t color)
{
    int slot = -1;
    float min_life = 999999.0f;

    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            slot = i;
            break;
        }
        if (g->particles[i].life_ms < min_life) {
            min_life = g->particles[i].life_ms;
            slot = i;
        }
    }

    if (slot >= 0) {
        wind_particle_t *p = &g->particles[slot];
        p->active = true;
        p->type = type;
        p->x = x;
        p->y = y;
        p->vx = vx;
        p->vy = vy;
        p->life_ms = life_ms;
        p->max_life_ms = life_ms;
        p->size = size;
        p->color_rgb = color;
    }
}

// 更新所有活跃粒子
static void wind_update_particles(wind_game_t *g, float dt)
{
    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        wind_particle_t *p = &g->particles[i];
        if (!p->active) {
            continue;
        }

        p->life_ms -= dt * 1000.0f;
        if (p->life_ms <= 0.0f) {
            p->active = false;
            continue;
        }

        p->x += p->vx * dt;
        p->y += p->vy * dt;

        // 根据不同微粒种类施加微量环境阻力或重力
        if (p->type == WIND_PART_GRASS) {
            p->vy += 220.0f * dt; // 草屑微小重力下坠
            p->vx *= (1.0f - 1.5f * dt);
        } else if (p->type == WIND_PART_DANDELION_SEED) {
            p->vy += sinf(p->x * 0.05f) * 12.0f * dt; // 绒毛轻微上下荡漾
        } else if (p->type == WIND_PART_RING_BURST) {
            p->vx *= (1.0f - 2.0f * dt);
            p->vy *= (1.0f - 2.0f * dt);
        }
    }
}

// 尾迹节点管理
static void wind_update_trail(wind_game_t *g, float dt)
{
    // 每隔一定步长在机尾压入一个新节点
    g->trail_head = (g->trail_head + 1) % WIND_MAX_TRAIL;
    g->trail[g->trail_head].x = g->x;
    g->trail[g->trail_head].y = g->y;
    g->trail[g->trail_head].alpha = 1.0f;

    // 衰减所有节点透明度
    for (int i = 0; i < WIND_MAX_TRAIL; i++) {
        if (g->trail[i].alpha > 0.0f) {
            g->trail[i].alpha -= dt * 2.2f;
            if (g->trail[i].alpha < 0.0f) {
                g->trail[i].alpha = 0.0f;
            }
        }
    }
}

// 重置气流环到玩家前方安全高度
static void wind_respawn_ring(wind_game_t *g, int index, float start_x)
{
    wind_ring_t *ring = &g->rings[index];
    ring->active = true;
    ring->passed = false;
    ring->x = start_x;
    ring->radius = 18.0f;
    ring->pulse_phase = wind_rand_range(g, 0.0f, 6.28f);

    // 计算放置点的地表高度，将环放置在山丘上空 60 ~ 130 像素之间
    float gh = wind_get_ground_height(ring->x);
    float target_y = gh - wind_rand_range(g, 65.0f, 130.0f);
    if (target_y < 45.0f) {
        target_y = 45.0f;
    }
    ring->y = target_y;
}

// 重置收集物到玩家前方
static void wind_respawn_collectible(wind_game_t *g, int index, float start_x)
{
    wind_collectible_t *c = &g->collectibles[index];
    c->active = true;
    c->collected = false;
    c->x = start_x;
    c->bob_phase = wind_rand_range(g, 0.0f, 6.28f);

    float gh = wind_get_ground_height(c->x);

    // 约 35% 概率为风之水晶，65% 为蒲公英飞絮
    if ((wind_xorshift32(g) % 100) < 35) {
        c->type = WIND_COLLECT_CRYSTAL;
        // 水晶常置于波峰上空或山谷高处
        c->base_y = gh - wind_rand_range(g, 50.0f, 110.0f);
    } else {
        c->type = WIND_COLLECT_DANDELION;
        // 蒲公英常置于丘陵起伏面或低空
        c->base_y = gh - wind_rand_range(g, 22.0f, 65.0f);
    }

    if (c->base_y < 35.0f) {
        c->base_y = 35.0f;
    }
    c->y = c->base_y;
}

// 初始化状态机
void wind_init(wind_game_t *g, uint32_t seed)
{
    if (!g) {
        return;
    }

    g->rng_state = (seed != 0) ? seed : 0x20260919;

    g->x = 0.0f;
    g->y = wind_get_ground_height(0.0f) - 60.0f; // 起始位于空中
    g->vx = WIND_CRUISE_SPEED_X;
    g->vy = -40.0f;                              // 起步微仰起飞
    g->pitch_deg = 5.0f;
    g->pitch_trim = 0.0f;
    g->pitch_hold = 0;
    g->stance = WIND_STANCE_SOAR;
    g->is_ok_holding = false;
    g->on_ground = false;
    g->energy = 100.0f;
    g->boost_timer_ms = 0.0f;
    g->dive_charge_ms = 0.0f;

    g->distance = 0.0f;
    g->score = 0;
    g->dandelion_count = 0;
    g->crystal_count = 0;
    g->ring_combo = 0;
    g->max_ring_combo = 0;
    g->max_altitude = WIND_SCREEN_H - g->y;
    g->flight_time_s = 0.0f;
    g->sky_phase = WIND_SKY_GOLDEN_DAWN;
    g->sky_progress = 0.0f;

    g->pending_sound = WIND_SND_NONE;
    g->trail_head = 0;

    // 清空粒子与尾迹
    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        g->particles[i].active = false;
    }
    for (int i = 0; i < WIND_MAX_TRAIL; i++) {
        g->trail[i].x = g->x;
        g->trail[i].y = g->y;
        g->trail[i].alpha = 0.0f;
    }

    // 初始化前方气流环
    float ring_x = 180.0f;
    for (int i = 0; i < WIND_MAX_RINGS; i++) {
        wind_respawn_ring(g, i, ring_x);
        ring_x += wind_rand_range(g, 180.0f, 260.0f);
    }

    // 初始化前方收集物
    float item_x = 90.0f;
    for (int i = 0; i < WIND_MAX_COLLECTIBLES; i++) {
        wind_respawn_collectible(g, i, item_x);
        item_x += wind_rand_range(g, 80.0f, 140.0f);
    }
}

// 重置游戏为初始状态
void wind_reset(wind_game_t *g)
{
    if (!g) {
        return;
    }
    uint32_t seed = g->rng_state;
    wind_init(g, seed);
}

// OK 按键响应：收翼俯冲 / 迎风展翼
void wind_input_ok(wind_game_t *g, bool pressed)
{
    if (!g) {
        return;
    }

    if (pressed && !g->is_ok_holding) {
        // 首次按下 OK：收紧双翼，进入下潜俯冲。俯冲优先于之前没松开的抬头。
        g->pitch_hold = 0;
        g->is_ok_holding = true;
        g->dive_charge_ms = 0.0f;
        if (!g->on_ground) {
            g->stance = WIND_STANCE_DIVE;
            g->pending_sound = WIND_SND_DIVE;
        }
    } else if (!pressed && g->is_ok_holding) {
        // 松开 OK：迎风大展双翼！蓄积的动能和下坡速度化为升力呼啸冲天
        g->is_ok_holding = false;
        if (g->on_ground) {
            // 如果在地面脱离冲锋，顺着斜坡顺畅腾空
            float slope = wind_get_ground_slope(g->x);
            if (slope < 0.2f && g->vx > WIND_MIN_SPEED_X + 20.0f) {
                g->on_ground = false;
                g->vy = fminf(-160.0f, -g->vx * 0.85f);
                g->stance = WIND_STANCE_SOAR;
                g->pending_sound = WIND_SND_SOAR;
            }
        } else {
            // 在空中展翼翱翔
            g->stance = WIND_STANCE_SOAR;
            if (g->dive_charge_ms > 250.0f && g->vx > 180.0f) {
                // 深度蓄力俯冲后的展翼大腾跃
                g->vy = fminf(g->vy, -220.0f);
                g->pending_sound = WIND_SND_SOAR;
            }
        }
        g->dive_charge_ms = 0.0f;
    }
}

// UP 键微调仰角 (抬机头，获取额外升力)
void wind_input_pitch_up(wind_game_t *g)
{
    if (!g) {
        return;
    }
    g->pitch_trim = fminf(g->pitch_trim + 7.5f, 25.0f);
    if (!g->on_ground && g->vy > -180.0f) {
        // 瞬间微升力
        g->vy -= 28.0f;
    } else if (g->on_ground && g->vx > WIND_MIN_SPEED_X + 15.0f) {
        // 草地滑行中按 UP：迎风直接抬头冲云腾飞！
        g->on_ground = false;
        g->vy = fminf(-160.0f, -g->vx * 0.75f);
        g->stance = WIND_STANCE_SOAR;
        g->pending_sound = WIND_SND_SOAR;
    }
}

// DOWN 键微调俯角 (低机头，以高度换取前向速度)
void wind_input_pitch_down(wind_game_t *g)
{
    if (!g) {
        return;
    }
    g->pitch_trim = fmaxf(g->pitch_trim - 7.5f, -25.0f);
    if (!g->on_ground) {
        g->vy += 22.0f;
        g->vx = fminf(g->vx + 15.0f, WIND_MAX_SPEED_X);
    }
}

void wind_input_pitch_hold(wind_game_t *g, int dir)
{
    if (!g) {
        return;
    }
    if (dir > 0) {
        g->pitch_hold = 1;
    } else if (dir < 0) {
        g->pitch_hold = -1;
    } else {
        g->pitch_hold = 0;
    }
}

// 消费待播放音频
wind_sound_t wind_consume_sound(wind_game_t *g)
{
    if (!g) {
        return WIND_SND_NONE;
    }
    wind_sound_t s = g->pending_sound;
    g->pending_sound = WIND_SND_NONE;
    return s;
}

// 核心物理与状态机单步微步进
static void wind_step_sub(wind_game_t *g, uint32_t dt_ms)
{
    if (!g || dt_ms == 0) {
        return;
    }

    float dt = (float)dt_ms / 1000.0f;

    g->flight_time_s += dt;

    // 1. 处理加速状态倒计时
    if (g->boost_timer_ms > 0.0f) {
        g->boost_timer_ms -= (float)dt_ms;
        if (g->boost_timer_ms < 0.0f) {
            g->boost_timer_ms = 0.0f;
        }
    }

    // 2. 获取当前飞行位置处地面高度与坡度
    float ground_y = wind_get_ground_height(g->x);
    float slope = wind_get_ground_slope(g->x);
    float slope_rad = atan2f(slope, 1.0f);

    // 3. 地面接触与核心物理计算
    bool was_on_ground = g->on_ground;
    if (g->y >= ground_y) {
        // === 贴地状态 (永远不坠毁死亡，安全滑行) ===
        g->y = ground_y;
        g->on_ground = true;

        // 初次触地：触发滑行沙沙音效并迸溅一簇草屑
        if (!was_on_ground) {
            g->pending_sound = WIND_SND_GLIDE;
            for (int p = 0; p < 3; p++) {
                wind_spawn_particle(g, WIND_PART_GRASS,
                                    g->x, g->y,
                                    -g->vx * 0.3f + wind_rand_range(g, -35.0f, 35.0f),
                                    wind_rand_range(g, -45.0f, -15.0f),
                                    wind_rand_range(g, 200.0f, 350.0f),
                                    wind_rand_range(g, 2.0f, 3.5f),
                                    0x4CAF50);
            }
        }

        // 斜坡加速机制：
        // slope > 0 为下坡（Y 向下增大），重力分量顺坡加速
        // slope < 0 为上坡，顺坡向上需消耗动能
        float gravity = g->is_ok_holding ? WIND_GRAVITY_DIVE : WIND_GRAVITY_NORMAL;
        float slope_accel = gravity * sinf(slope_rad);

        // 如果按住 OK 键，下坡俯冲收翼加速极其强劲！
        if (g->is_ok_holding) {
            g->stance = WIND_STANCE_DIVE;
            g->dive_charge_ms += (float)dt_ms;
            // 沿坡加速
            g->vx += slope_accel * dt * 1.35f;
        } else {
            g->stance = WIND_STANCE_GLIDE;
            g->vx += slope_accel * dt;
        }

        // 滑行摩擦力微量阻尼
        g->vx *= powf(WIND_GLIDE_FRICTION, dt * 60.0f);

        // 速度下限与上限保证
        if (g->vx < WIND_MIN_SPEED_X) {
            g->vx = WIND_MIN_SPEED_X;
        }
        if (g->vx > WIND_MAX_SPEED_X) {
            g->vx = WIND_MAX_SPEED_X;
        }

        // 贴地速度矢量贴合斜坡切线
        g->vy = g->vx * slope;

        // 按住 UP：草地上持续迎风抬头，速度够就离地。
        if (g->pitch_hold > 0 && !g->is_ok_holding && g->vx > WIND_MIN_SPEED_X + 15.0f) {
            g->on_ground = false;
            g->vy = fminf(-160.0f, -g->vx * 0.75f);
            g->stance = WIND_STANCE_SOAR;
            g->pending_sound = WIND_SND_SOAR;
        }

        // 自动起飞判定：
        // 在上坡段 (slope < -0.08) 且未按住 OK，拥有足够速度时，借势呼啸起飞冲天！
        if (!g->is_ok_holding && slope < -0.10f && g->vx > 130.0f) {
            g->on_ground = false;
            g->vy = fminf(-180.0f, g->vx * slope * 1.15f); // 向上强劲腾空升力
            g->stance = WIND_STANCE_SOAR;
            g->pending_sound = WIND_SND_SOAR;
        }

        // 激扬青翠草屑粒子 (按住下潜或高速时更多)
        if ((wind_xorshift32(g) % 100) < (g->is_ok_holding ? 60 : 30)) {
            wind_spawn_particle(g, WIND_PART_GRASS,
                                g->x, g->y,
                                -g->vx * 0.3f + wind_rand_range(g, -30.0f, 30.0f),
                                wind_rand_range(g, -40.0f, -10.0f),
                                wind_rand_range(g, 180.0f, 320.0f),
                                wind_rand_range(g, 2.0f, 3.5f),
                                0x4CAF50);
        }

        // 机身俯仰角平滑贴合地面
        float target_pitch = -slope_rad * WIND_RAD_TO_DEG;
        g->pitch_deg += (target_pitch - g->pitch_deg) * (1.0f - expf(-10.0f * dt));

    } else {
        // === 空中翱翔状态 ===
        g->on_ground = false;

        float gravity = g->is_ok_holding ? WIND_GRAVITY_DIVE : WIND_GRAVITY_NORMAL;
        float lift = 0.0f;

        if (g->is_ok_holding) {
            // 收翼下潜：几乎无升力，极速下坠蓄势
            g->stance = WIND_STANCE_DIVE;
            g->dive_charge_ms += (float)dt_ms;
            lift = 30.0f; // 极小残余升力
            // 空气阻力减小，微幅向前加速
            g->vx += 25.0f * dt;
        } else {
            // 展翼翱翔：前向速度与机翼产生强大升力
            if (g->boost_timer_ms > 0.0f) {
                g->stance = WIND_STANCE_BOOST;
            } else {
                g->stance = WIND_STANCE_SOAR;
            }

            // 动压升力与迎角计算
            float speed_ratio = g->vx / WIND_CRUISE_SPEED_X;
            lift = WIND_GRAVITY_NORMAL * (speed_ratio * speed_ratio * WIND_LIFT_FACTOR);

            // 俯仰角正迎角带来额外上升力
            if (g->pitch_deg > 0.0f) {
                lift += (g->pitch_deg / 45.0f) * 160.0f;
            }

            // 阻尼回落到巡航速度
            if (g->vx > WIND_CRUISE_SPEED_X && g->boost_timer_ms <= 0.0f) {
                g->vx -= (g->vx - WIND_CRUISE_SPEED_X) * 0.35f * dt;
            }
        }

        // 垂直总合力
        float ay = gravity - lift;
        g->vy += ay * dt;

        // 限制垂直速度极值
        if (g->vy < -280.0f) {
            g->vy = -280.0f;
        }
        if (g->vy > 340.0f) {
            g->vy = 340.0f;
        }

        // 机身俯仰角平滑向速度矢量或微调对齐
        float vel_pitch = -atan2f(g->vy, g->vx) * WIND_RAD_TO_DEG;
        float target_pitch = vel_pitch + g->pitch_trim;
        if (target_pitch > 60.0f) {
            target_pitch = 60.0f;
        }
        if (target_pitch < -60.0f) {
            target_pitch = -60.0f;
        }
        g->pitch_deg += (target_pitch - g->pitch_deg) * (1.0f - expf(-8.0f * dt));

        // 按住 UP/DOWN 时舵面持续给力；松开后微调才回中。
        if (g->pitch_hold > 0 && !g->is_ok_holding) {
            g->pitch_trim = fminf(25.0f, g->pitch_trim + 70.0f * dt);
            if (g->vy > -220.0f) {
                g->vy -= 140.0f * dt;
            }
        } else if (g->pitch_hold < 0 && !g->is_ok_holding) {
            g->pitch_trim = fmaxf(-25.0f, g->pitch_trim - 70.0f * dt);
            g->vy += 90.0f * dt;
            g->vx = fminf(WIND_MAX_SPEED_X, g->vx + 50.0f * dt);
        } else {
            g->pitch_trim *= (1.0f - 1.2f * dt);
        }
    }

    // 全局水平速度极值不变量约束 (确保永不卡滞与数值安全)
    if (g->vx < WIND_MIN_SPEED_X) {
        g->vx = WIND_MIN_SPEED_X;
    }
    if (g->vx > WIND_MAX_SPEED_X) {
        g->vx = WIND_MAX_SPEED_X;
    }

    // 4. 位移更新
    g->x += g->vx * dt;
    float current_ground_y = wind_get_ground_height(g->x);
    if (g->on_ground) {
        g->y = current_ground_y;
    } else {
        g->y += g->vy * dt;
        if (g->y >= current_ground_y) {
            g->y = current_ground_y;
            g->on_ground = true;
        }
    }
    g->distance = g->x;

    // 天空顶部边界限制 (避免飞出屏幕最上方)
    if (g->y < WIND_MIN_ALTITUDE_Y) {
        g->y = WIND_MIN_ALTITUDE_Y;
        if (g->vy < 0.0f) {
            g->vy = 0.0f;
        }
    }

    // 统计最高冲云高度记录
    float current_alt = WIND_SCREEN_H - g->y;
    if (current_alt > g->max_altitude) {
        g->max_altitude = current_alt;
    }

    // 5. 气流光环穿过碰撞判定
    for (int i = 0; i < WIND_MAX_RINGS; i++) {
        wind_ring_t *ring = &g->rings[i];
        if (!ring->active) {
            continue;
        }

        // 环离开屏幕后方很远时在前方重生
        if (ring->x < g->x - 120.0f) {
            // 寻找当前最前方的 X
            float max_x = g->x + 200.0f;
            for (int k = 0; k < WIND_MAX_RINGS; k++) {
                if (g->rings[k].active && g->rings[k].x > max_x) {
                    max_x = g->rings[k].x;
                }
            }
            wind_respawn_ring(g, i, max_x + wind_rand_range(g, 180.0f, 260.0f));
            continue;
        }

        if (!ring->passed) {
            float dx = g->x - ring->x;
            float dy = g->y - ring->y;
            float dist = hypotf(dx, dy);

            if (dist <= ring->radius + 12.0f) {
                // 成功穿过气流环！
                ring->passed = true;
                g->ring_combo++;
                if (g->ring_combo > g->max_ring_combo) {
                    g->max_ring_combo = g->ring_combo;
                }

                // 爆发加速与向上气流托举
                g->boost_timer_ms = 1200.0f;
                g->vx = fminf(WIND_MAX_SPEED_X, g->vx + 110.0f);
                g->vy = fminf(g->vy, -130.0f);
                g->score += 100 * g->ring_combo;
                g->energy = fminf(100.0f, g->energy + 20.0f);

                // 触发清脆风铃音效
                g->pending_sound = WIND_SND_RING;

                // 爆发气旋光环微粒
                for (int p = 0; p < 8; p++) {
                    float angle = (float)p * (M_PI * 2.0f / 8.0f);
                    float spd = wind_rand_range(g, 40.0f, 90.0f);
                    wind_spawn_particle(g, WIND_PART_RING_BURST,
                                        ring->x, ring->y,
                                        cosf(angle) * spd, sinf(angle) * spd,
                                        wind_rand_range(g, 250.0f, 400.0f),
                                        wind_rand_range(g, 3.0f, 5.0f),
                                        0x00E5FF);
                }
            }
        }
    }

    // 6. 收集物拾取判定 (蒲公英飞絮 / 风之水晶)
    for (int i = 0; i < WIND_MAX_COLLECTIBLES; i++) {
        wind_collectible_t *c = &g->collectibles[i];
        if (!c->active) {
            continue;
        }

        // 收集物离开屏幕后方时向前重生
        if (c->x < g->x - 120.0f) {
            float max_x = g->x + 160.0f;
            for (int k = 0; k < WIND_MAX_COLLECTIBLES; k++) {
                if (g->collectibles[k].active && g->collectibles[k].x > max_x) {
                    max_x = g->collectibles[k].x;
                }
            }
            wind_respawn_collectible(g, i, max_x + wind_rand_range(g, 80.0f, 150.0f));
            continue;
        }

        // 上下轻盈浮动
        c->bob_phase += dt * 3.0f;
        c->y = c->base_y + sinf(c->bob_phase) * 6.0f;

        if (!c->collected) {
            float dx = g->x - c->x;
            float dy = g->y - c->y;
            float dist = hypotf(dx, dy);

            if (dist <= 18.0f) {
                // 拾取成功！
                c->collected = true;

                if (c->type == WIND_COLLECT_CRYSTAL) {
                    g->crystal_count++;
                    g->score += 50;
                    g->energy = fminf(100.0f, g->energy + 15.0f);
                    g->pending_sound = WIND_SND_CRYSTAL;

                    // 迸射晶石闪耀微粒
                    for (int p = 0; p < 6; p++) {
                        wind_spawn_particle(g, WIND_PART_CRYSTAL_SPARK,
                                            c->x, c->y,
                                            wind_rand_range(g, -60.0f, 60.0f),
                                            wind_rand_range(g, -70.0f, 30.0f),
                                            wind_rand_range(g, 300.0f, 500.0f),
                                            wind_rand_range(g, 2.5f, 4.0f),
                                            0xFFD700);
                    }
                } else if (c->type == WIND_COLLECT_DANDELION) {
                    g->dandelion_count++;
                    g->score += 10;
                    g->energy = fminf(100.0f, g->energy + 5.0f);
                    g->pending_sound = WIND_SND_DANDELION;

                    // 散开蒲公英细绒毛
                    for (int p = 0; p < 4; p++) {
                        wind_spawn_particle(g, WIND_PART_DANDELION_SEED,
                                            c->x, c->y,
                                            wind_rand_range(g, -20.0f, 40.0f),
                                            wind_rand_range(g, -35.0f, 10.0f),
                                            wind_rand_range(g, 400.0f, 700.0f),
                                            2.0f,
                                            0xFFFFFF);
                    }
                }
            }
        }
    }

    // 7. 更新微粒系统与尾迹
    wind_update_particles(g, dt);
    wind_update_trail(g, dt);

    // 8. 天色日夜心流阶段流转计算
    float total_cycle = WIND_SKY_PHASE_DISTANCE * (float)WIND_SKY_PHASE_COUNT;
    float cycle_pos = fmodf(g->distance, total_cycle);
    if (cycle_pos < 0.0f) {
        cycle_pos += total_cycle;
    }

    int phase_idx = (int)(cycle_pos / WIND_SKY_PHASE_DISTANCE);
    if (phase_idx >= WIND_SKY_PHASE_COUNT) {
        phase_idx = WIND_SKY_PHASE_COUNT - 1;
    }
    float phase_offset = cycle_pos - ((float)phase_idx * WIND_SKY_PHASE_DISTANCE);
    g->sky_phase = (wind_sky_phase_t)phase_idx;
    g->sky_progress = phase_offset / WIND_SKY_PHASE_DISTANCE;
}

// 核心物理与状态机对外步进接口 (采用稳定微步进确保高精度积分与时间守恒)
void wind_step(wind_game_t *g, uint32_t dt_ms)
{
    if (!g || dt_ms == 0) {
        return;
    }

    uint32_t remaining = dt_ms;
    while (remaining > 0) {
        uint32_t step = (remaining > 20) ? 20 : remaining;
        remaining -= step;
        wind_step_sub(g, step);
    }
}

// 颜色通道线性插值辅助函数
static uint8_t wind_lerp_u8(uint8_t a, uint8_t b, float t)
{
    return (uint8_t)((float)a + ((float)b - (float)a) * t);
}

static uint32_t wind_blend_color(uint32_t c1, uint32_t c2, float t)
{
    uint8_t r1 = (c1 >> 16) & 0xFF;
    uint8_t g1 = (c1 >> 8) & 0xFF;
    uint8_t b1 = c1 & 0xFF;

    uint8_t r2 = (c2 >> 16) & 0xFF;
    uint8_t g2 = (c2 >> 8) & 0xFF;
    uint8_t b2 = c2 & 0xFF;

    uint8_t r = wind_lerp_u8(r1, r2, t);
    uint8_t g = wind_lerp_u8(g1, g2, t);
    uint8_t b = wind_lerp_u8(b1, b2, t);

    return ((uint32_t)r << 16) | ((uint32_t)g << 8) | (uint32_t)b;
}

// 获取不同天色时段的天空渐变色 (0xRRGGBB)
void wind_get_sky_colors(wind_sky_phase_t phase, float progress, uint32_t *out_top_rgb, uint32_t *out_bot_rgb)
{
    // 预定义各阶段的关键色 (顶色与底色)
    static const struct {
        uint32_t top;
        uint32_t bot;
    } sky_palette[WIND_SKY_PHASE_COUNT] = {
        // 0: 晨曦金辉 (澄澈浅蓝 -> 金橙朝霞)
        { 0x3A89C9, 0xFDBB2D },
        // 1: 落日紫霞 (深绛紫罗兰 -> 瑰丽夕阳红)
        { 0x6A1B9A, 0xFF5722 },
        // 2: 暮色幽蓝 (深邃暗夜蓝 -> 静谧灰蓝)
        { 0x1A237E, 0x37474F },
        // 3: 璀璨星空 (近黑夜空 -> 银河幽青)
        { 0x0A0E1A, 0x1A2634 },
        // 4: 极光拂晓 (极光幽绿 -> 黎明初露微白)
        { 0x004D40, 0x00B4D8 }
    };

    if (phase >= WIND_SKY_PHASE_COUNT) {
        phase = WIND_SKY_GOLDEN_DAWN;
    }

    uint32_t next_idx = (phase + 1) % WIND_SKY_PHASE_COUNT;

    uint32_t cur_top = sky_palette[phase].top;
    uint32_t cur_bot = sky_palette[phase].bot;
    uint32_t nxt_top = sky_palette[next_idx].top;
    uint32_t nxt_bot = sky_palette[next_idx].bot;

    if (out_top_rgb) {
        *out_top_rgb = wind_blend_color(cur_top, nxt_top, progress);
    }
    if (out_bot_rgb) {
        *out_bot_rgb = wind_blend_color(cur_bot, nxt_bot, progress);
    }
}
