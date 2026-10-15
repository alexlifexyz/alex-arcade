// main/splasher_logic.c —— 《泡泡高压水枪狂欢节》(Hydro Splasher / 颜料大作战) 核心算法引擎实现
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK, ES8311音频) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无外部依赖。
#include "splasher_logic.h"
#include <string.h>

#define PI_CONST 3.14159265358979323846f

// =========================================================================
// 内部轻量伪随机数发生器 (LCG)
// =========================================================================
static inline uint32_t splasher_rand(splasher_game_t *g)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return g->rng_state;
}

// =========================================================================
// 几何碰撞辅助函数
// =========================================================================
static inline bool circle_intersects_rect(float cx, float cy, float r,
                                         float rx, float ry, float rw, float rh)
{
    float nearest_x = cx;
    if (nearest_x < rx) nearest_x = rx;
    else if (nearest_x > rx + rw) nearest_x = rx + rw;

    float nearest_y = cy;
    if (nearest_y < ry) nearest_y = ry;
    else if (nearest_y > ry + rh) nearest_y = ry + rh;

    float dx = cx - nearest_x;
    float dy = cy - nearest_y;
    return (dx * dx + dy * dy) <= (r * r);
}

static inline bool rect_intersects_rect(float x1, float y1, float w1, float h1,
                                       float x2, float y2, float w2, float h2)
{
    return (x1 < x2 + w2 && x1 + w1 > x2 &&
            y1 < y2 + h2 && y1 + h1 > y2);
}

// =========================================================================
// 内部粒子生成
// =========================================================================
static void spawn_particle(splasher_game_t *g, hs_particle_type_t type,
                           float x, float y, float vx, float vy,
                           float gravity, float max_life_ms, float size, hs_color_t color)
{
    for (int i = 0; i < HS_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            g->particles[i].active = true;
            g->particles[i].type = type;
            g->particles[i].x = x;
            g->particles[i].y = y;
            g->particles[i].vx = vx;
            g->particles[i].vy = vy;
            g->particles[i].gravity = gravity;
            g->particles[i].life_ms = 0.0f;
            g->particles[i].max_life_ms = max_life_ms;
            g->particles[i].size = size;
            g->particles[i].color = color;
            return;
        }
    }
}

// 爆射七彩颜料喷墨粒子群
static void burst_paint_particles(splasher_game_t *g, float x, float y, hs_color_t color, int count)
{
    for (int i = 0; i < count; i++) {
        uint32_t r = splasher_rand(g);
        float angle = (float)(r % 360) * (PI_CONST / 180.0f);
        float speed = 40.0f + (float)(r % 120);
        float vx = cosf(angle) * speed;
        float vy = sinf(angle) * speed - 20.0f;
        float life = 300.0f + (float)(r % 300);
        float size = 2.0f + (float)(r % 3);
        hs_color_t c = (i % 2 == 0) ? color : (hs_color_t)(r % HS_COLOR_COUNT);
        spawn_particle(g, HS_PART_COLOR_INK, x, y, vx, vy, 180.0f, life, size, c);
    }
}

// 生成肥皂泡泡光斑粒子群
static void burst_soap_bubbles(splasher_game_t *g, float x, float y, int count)
{
    for (int i = 0; i < count; i++) {
        uint32_t r = splasher_rand(g);
        float vx = -30.0f + (float)(r % 60);
        float vy = -50.0f - (float)(r % 60);
        float life = 500.0f + (float)(r % 400);
        float size = 3.0f + (float)(r % 4);
        spawn_particle(g, HS_PART_SOAP_FOAM, x, y, vx, vy, -20.0f, life, size, HS_COLOR_CYAN);
    }
}

// 生成夏威夷狂欢音符与彩花粒子群
static void burst_hawaiian_confetti(splasher_game_t *g, float x, float y, int count)
{
    for (int i = 0; i < count; i++) {
        uint32_t r = splasher_rand(g);
        float vx = -50.0f + (float)(r % 100);
        float vy = -90.0f - (float)(r % 80);
        float life = 600.0f + (float)(r % 400);
        float size = 2.5f + (float)(r % 3);
        hs_color_t c = (hs_color_t)(r % HS_COLOR_COUNT);
        spawn_particle(g, HS_PART_CONFETTI, x, y, vx, vy, 120.0f, life, size, c);
    }
}

// =========================================================================
// 音效事件队列
// =========================================================================
bool splasher_sound_enqueue(splasher_game_t *g, hs_sound_t snd)
{
    if (!g || snd == HS_SND_NONE) return false;
    if (g->sound_q.count >= HS_MAX_SOUND_QUEUE) {
        // 队列满，覆盖最旧项
        g->sound_q.head = (uint8_t)((g->sound_q.head + 1) % HS_MAX_SOUND_QUEUE);
        g->sound_q.count--;
    }
    g->sound_q.queue[g->sound_q.tail] = snd;
    g->sound_q.tail = (uint8_t)((g->sound_q.tail + 1) % HS_MAX_SOUND_QUEUE);
    g->sound_q.count++;
    return true;
}

hs_sound_t splasher_sound_dequeue(splasher_game_t *g)
{
    if (!g || g->sound_q.count == 0) return HS_SND_NONE;
    hs_sound_t snd = g->sound_q.queue[g->sound_q.head];
    g->sound_q.head = (uint8_t)((g->sound_q.head + 1) % HS_MAX_SOUND_QUEUE);
    g->sound_q.count--;
    return snd;
}

hs_sound_t splasher_sound_peek(const splasher_game_t *g)
{
    if (!g || g->sound_q.count == 0) return HS_SND_NONE;
    return g->sound_q.queue[g->sound_q.head];
}

void splasher_sound_clear(splasher_game_t *g)
{
    if (!g) return;
    g->sound_q.head = 0;
    g->sound_q.tail = 0;
    g->sound_q.count = 0;
}

// =========================================================================
// 核心生命周期
// =========================================================================
void splasher_game_init(splasher_game_t *g, uint32_t seed)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    g->state = HS_STATE_PLAYING;
    g->rng_state = (seed != 0) ? seed : 0x20260919u;

    g->gun_base_x = HS_GUN_BASE_X;
    g->gun_base_y = HS_GUN_BASE_Y;
    g->pitch_deg = 0.0f; // 默认基准发射仰角 (45°)

    g->ok_pressed = false;
    g->charge_time_ms = 0;
    g->charge_ratio = 0.0f;
    g->pump_hiss_timer_ms = 0;

    g->score = 0;
    g->combo = 0;
    g->max_combo = 0;
    g->combo_timer_ms = 0;
    g->game_time_ms = 0;

    g->targets_total = 0;
    g->targets_revived = 0;
    g->npcs_total = 0;
    g->npcs_saved = 0;
    g->obstacles_total = 0;
    g->obstacles_cleared = 0;
    g->revival_progress = 0.0f;

    g->current_color = HS_COLOR_RED;
    splasher_sound_clear(g);

    // 预设第 1 关默认办公室与街道黑白场景
    // 1. 盆栽 (沉闷黑白 -> 鲜花绽放)
    splasher_spawn_target(g, HS_TARGET_PLANT, 100.0f, 220.0f, 20.0f, 24.0f);
    // 2. 霓虹灯牌 (灰暗 -> 绚烂光彩)
    splasher_spawn_target(g, HS_TARGET_NEON_SIGN, 150.0f, 80.0f, 32.0f, 18.0f);
    // 3. 咖啡吧台
    splasher_spawn_target(g, HS_TARGET_COFFEE_BAR, 180.0f, 170.0f, 26.0f, 22.0f);

    // 4. 打工人 NPC (黑白西装疲惫打工人巡逻赶路)
    splasher_spawn_npc(g, 80.0f, 270.0f, 25.0f, 60.0f, 140.0f);
    splasher_spawn_npc(g, 160.0f, 270.0f, -20.0f, 130.0f, 210.0f);

    // 5. 重型障碍物 (铁皮保险柜挡路)
    splasher_spawn_obstacle(g, HS_OBSTACLE_SAFE, 120.0f, 266.0f, 24.0f, 24.0f);
}

void splasher_game_reset(splasher_game_t *g)
{
    if (!g) return;
    uint32_t current_seed = g->rng_state;
    splasher_game_init(g, current_seed);
}

void splasher_game_pause(splasher_game_t *g)
{
    if (g && g->state == HS_STATE_PLAYING) {
        g->state = HS_STATE_PAUSED;
    }
}

void splasher_game_resume(splasher_game_t *g)
{
    if (g && g->state == HS_STATE_PAUSED) {
        g->state = HS_STATE_PLAYING;
    }
}

bool splasher_game_is_victory(const splasher_game_t *g)
{
    return g && (g->state == HS_STATE_VICTORY);
}

bool splasher_game_is_game_over(const splasher_game_t *g)
{
    return g && (g->state == HS_STATE_GAMEOVER);
}

bool splasher_game_is_paused(const splasher_game_t *g)
{
    return g && (g->state == HS_STATE_PAUSED);
}

// =========================================================================
// 交互与按键输入实现
// =========================================================================
void splasher_input_up(splasher_game_t *g)
{
    if (!g) return;
    g->pitch_deg += HS_AIM_STEP_DEG;
    if (g->pitch_deg > HS_AIM_MAX_DEG) {
        g->pitch_deg = HS_AIM_MAX_DEG;
    }
}

void splasher_input_down(splasher_game_t *g)
{
    if (!g) return;
    g->pitch_deg -= HS_AIM_STEP_DEG;
    if (g->pitch_deg < HS_AIM_MIN_DEG) {
        g->pitch_deg = HS_AIM_MIN_DEG;
    }
}

void splasher_input_set_pitch(splasher_game_t *g, float pitch_deg)
{
    if (!g) return;
    if (pitch_deg < HS_AIM_MIN_DEG) pitch_deg = HS_AIM_MIN_DEG;
    if (pitch_deg > HS_AIM_MAX_DEG) pitch_deg = HS_AIM_MAX_DEG;
    g->pitch_deg = pitch_deg;
}

float splasher_get_pitch(const splasher_game_t *g)
{
    return g ? g->pitch_deg : 0.0f;
}

float splasher_get_absolute_launch_angle(const splasher_game_t *g)
{
    if (!g) return 0.0f;
    return HS_AIM_BASE_DEG + g->pitch_deg;
}

void splasher_input_ok_press(splasher_game_t *g)
{
    if (!g || g->state != HS_STATE_PLAYING) return;
    g->ok_pressed = true;
    g->charge_time_ms = 0;
    g->charge_ratio = 0.0f;
    g->pump_hiss_timer_ms = 0;
}

void splasher_input_ok_release(splasher_game_t *g)
{
    if (!g || g->state != HS_STATE_PLAYING || !g->ok_pressed) return;
    g->ok_pressed = false;

    if (g->charge_ratio >= 0.95f) {
        // 蓄满高压泵，释放超高压水龙卷暴风雨！
        splasher_release_tornado(g);
    } else {
        // 短按或未蓄满，单发普通水球
        splasher_shoot_normal(g);
    }

    g->charge_time_ms = 0;
    g->charge_ratio = 0.0f;
    g->pump_hiss_timer_ms = 0;
}

bool splasher_shoot_normal(splasher_game_t *g)
{
    if (!g || g->state != HS_STATE_PLAYING) return false;

    // 寻找空闲水弹槽位
    for (int i = 0; i < HS_MAX_BULLETS; i++) {
        if (!g->bullets[i].active) {
            float abs_angle_deg = HS_AIM_BASE_DEG + g->pitch_deg; // 0.0° ~ 90.0°
            float rad = abs_angle_deg * (PI_CONST / 180.0f);

            g->bullets[i].active = true;
            g->bullets[i].x = g->gun_base_x;
            g->bullets[i].y = g->gun_base_y;
            g->bullets[i].vx = HS_BULLET_SPEED_NORMAL * cosf(rad);
            g->bullets[i].vy = -HS_BULLET_SPEED_NORMAL * sinf(rad); // 屏幕向上为负 Y
            g->bullets[i].radius = HS_BULLET_RADIUS;
            g->bullets[i].color = g->current_color;

            // 轮换下一个喷漆色彩
            g->current_color = (hs_color_t)((g->current_color + 1) % HS_COLOR_COUNT);

            // 音效事件
            splasher_sound_enqueue(g, HS_SND_SHOOT_NORMAL);
            return true;
        }
    }
    return false;
}

bool splasher_release_tornado(splasher_game_t *g)
{
    if (!g || g->state != HS_STATE_PLAYING) return false;

    g->tornado.active = true;
    g->tornado.x = g->gun_base_x;
    g->tornado.y = 0.0f;
    g->tornado.vx = HS_TORNADO_SPEED_X;
    g->tornado.width = HS_TORNADO_WIDTH;
    g->tornado.height = HS_SCREEN_H;
    g->tornado.life_ms = 0;
    g->tornado.max_life_ms = HS_TORNADO_DURATION_MS;

    // 激发大量水花粒子
    for (int i = 0; i < 20; i++) {
        uint32_t r = splasher_rand(g);
        float vx = 120.0f + (float)(r % 280);
        float vy = -60.0f - (float)(r % 180);
        float py = 100.0f + (float)(r % 180);
        spawn_particle(g, HS_PART_WATER_DROP, g->gun_base_x, py, vx, vy, 200.0f, 600.0f, 3.5f, HS_COLOR_BLUE);
    }

    splasher_sound_enqueue(g, HS_SND_TORNADO_BURST);
    return true;
}

// =========================================================================
// 关卡编排与查询
// =========================================================================
int splasher_spawn_target(splasher_game_t *g, hs_target_type_t type, float x, float y, float w, float h)
{
    if (!g) return -1;
    for (int i = 0; i < HS_MAX_TARGETS; i++) {
        if (!g->targets[i].active) {
            g->targets[i].active = true;
            g->targets[i].type = type;
            g->targets[i].x = x;
            g->targets[i].y = y;
            g->targets[i].w = w;
            g->targets[i].h = h;
            g->targets[i].saturation = 0.0f;
            g->targets[i].is_fully_revived = false;
            g->targets[i].hit_count = 0;
            g->targets[i].dominant_color = HS_COLOR_RED;
            g->targets_total++;
            return i;
        }
    }
    return -1;
}

int splasher_spawn_npc(splasher_game_t *g, float x, float y, float vx, float min_x, float max_x)
{
    if (!g) return -1;
    for (int i = 0; i < HS_MAX_NPCS; i++) {
        if (!g->npcs[i].active) {
            g->npcs[i].active = true;
            g->npcs[i].costume = HS_NPC_COSTUME_SUIT;
            g->npcs[i].state = HS_NPC_STATE_TIRED_WALKING;
            g->npcs[i].x = x;
            g->npcs[i].y = y;
            g->npcs[i].w = 16.0f;
            g->npcs[i].h = 24.0f;
            g->npcs[i].vx = vx;
            g->npcs[i].min_x = min_x;
            g->npcs[i].max_x = max_x;
            g->npcs[i].dance_timer_ms = 0.0f;
            g->npcs[i].dance_phase = 0.0f;
            g->npcs_total++;
            return i;
        }
    }
    return -1;
}

int splasher_spawn_obstacle(splasher_game_t *g, hs_obstacle_type_t type, float x, float y, float w, float h)
{
    if (!g) return -1;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) {
        if (!g->obstacles[i].active) {
            g->obstacles[i].active = true;
            g->obstacles[i].type = type;
            g->obstacles[i].x = x;
            g->obstacles[i].y = y;
            g->obstacles[i].w = w;
            g->obstacles[i].h = h;
            g->obstacles[i].vx = 0.0f;
            g->obstacles[i].vy = 0.0f;
            g->obstacles[i].hit_count = 0;
            g->obstacles[i].is_bubbled = false;
            g->obstacles[i].bubble_radius = 0.0f;
            g->obstacles_total++;
            return i;
        }
    }
    return -1;
}

int splasher_get_active_bullet_count(const splasher_game_t *g)
{
    if (!g) return 0;
    int count = 0;
    for (int i = 0; i < HS_MAX_BULLETS; i++) {
        if (g->bullets[i].active) count++;
    }
    return count;
}

int splasher_get_active_particle_count(const splasher_game_t *g)
{
    if (!g) return 0;
    int count = 0;
    for (int i = 0; i < HS_MAX_PARTICLES; i++) {
        if (g->particles[i].active) count++;
    }
    return count;
}

int splasher_get_revived_target_count(const splasher_game_t *g)
{
    return g ? (int)g->targets_revived : 0;
}

int splasher_get_saved_npc_count(const splasher_game_t *g)
{
    return g ? (int)g->npcs_saved : 0;
}

int splasher_get_bubbled_obstacle_count(const splasher_game_t *g)
{
    if (!g) return 0;
    int count = 0;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) {
        if (g->obstacles[i].active && g->obstacles[i].is_bubbled) count++;
    }
    return count;
}

float splasher_get_revival_progress(const splasher_game_t *g)
{
    return g ? g->revival_progress : 0.0f;
}

// =========================================================================
// 核心状态机步进 (Game Step)
// =========================================================================
void splasher_game_step(splasher_game_t *g, uint32_t dt_ms)
{
    if (!g || g->state != HS_STATE_PLAYING || dt_ms == 0) return;

    float dt = (float)dt_ms / 1000.0f;
    g->game_time_ms += dt_ms;

    // 1. 处理 OK 键高压充能
    if (g->ok_pressed) {
        g->charge_time_ms += dt_ms;
        g->charge_ratio = (float)g->charge_time_ms / (float)HS_CHARGE_TIME_MS;
        if (g->charge_ratio > 1.0f) {
            g->charge_ratio = 1.0f;
        }

        g->pump_hiss_timer_ms += dt_ms;
        if (g->pump_hiss_timer_ms >= HS_PUMP_HISS_INTERVAL_MS) {
            g->pump_hiss_timer_ms = 0;
            splasher_sound_enqueue(g, HS_SND_PUMP_HISS);
        }
    }

    // 2. 连击计时器衰减
    if (g->combo_timer_ms > 0) {
        if (dt_ms >= g->combo_timer_ms) {
            g->combo_timer_ms = 0;
            g->combo = 0;
        } else {
            g->combo_timer_ms -= dt_ms;
        }
    }

    // 3. 更新超高压水龙卷暴风雨
    if (g->tornado.active) {
        g->tornado.x += g->tornado.vx * dt;
        g->tornado.life_ms += dt_ms;

        // 水龙卷产生沿途飞溅水花
        if (g->tornado.x < HS_SCREEN_W + 50.0f) {
            spawn_particle(g, HS_PART_WATER_DROP, g->tornado.x,
                           120.0f + (float)(splasher_rand(g) % 150),
                           50.0f + (float)(splasher_rand(g) % 80),
                           -40.0f - (float)(splasher_rand(g) % 60),
                           150.0f, 400.0f, 2.5f, HS_COLOR_CYAN);
        }

        // 水龙卷横扫全屏物体
        // (a) 接触到的所有黑白灰目标物体：瞬间完全复苏
        for (int i = 0; i < HS_MAX_TARGETS; i++) {
            if (g->targets[i].active && !g->targets[i].is_fully_revived) {
                if (rect_intersects_rect(g->tornado.x, g->tornado.y,
                                         g->tornado.width, g->tornado.height,
                                         g->targets[i].x, g->targets[i].y,
                                         g->targets[i].w, g->targets[i].h)) {
                    g->targets[i].saturation = 1.0f;
                    g->targets[i].is_fully_revived = true;
                    g->targets_revived++;
                    g->score += 250;
                    burst_paint_particles(g, g->targets[i].x + g->targets[i].w * 0.5f,
                                          g->targets[i].y + g->targets[i].h * 0.5f,
                                          (hs_color_t)(splasher_rand(g) % HS_COLOR_COUNT), 12);
                    splasher_sound_enqueue(g, HS_SND_PAINT_SPLASH);
                }
            }
        }

        // (b) 接触到的所有打工人 NPC：瞬间救赎换夏威夷衬衫跳舞
        for (int i = 0; i < HS_MAX_NPCS; i++) {
            if (g->npcs[i].active && g->npcs[i].state == HS_NPC_STATE_TIRED_WALKING) {
                if (rect_intersects_rect(g->tornado.x, g->tornado.y,
                                         g->tornado.width, g->tornado.height,
                                         g->npcs[i].x, g->npcs[i].y,
                                         g->npcs[i].w, g->npcs[i].h)) {
                    g->npcs[i].costume = HS_NPC_COSTUME_HAWAIIAN;
                    g->npcs[i].state = HS_NPC_STATE_DANCING;
                    g->npcs[i].vx = 0.0f;
                    g->npcs_saved++;
                    g->score += 350;
                    burst_hawaiian_confetti(g, g->npcs[i].x + g->npcs[i].w * 0.5f,
                                            g->npcs[i].y + g->npcs[i].h * 0.5f, 10);
                    splasher_sound_enqueue(g, HS_SND_HAWAIIAN_CHEER);
                    splasher_sound_enqueue(g, HS_SND_WHISTLE);
                }
            }
        }

        // (c) 接触到的所有重型障碍物：直接包裹巨型肥皂泡并推向右上方浮空！
        for (int i = 0; i < HS_MAX_OBSTACLES; i++) {
            if (g->obstacles[i].active && !g->obstacles[i].is_bubbled) {
                if (rect_intersects_rect(g->tornado.x, g->tornado.y,
                                         g->tornado.width, g->tornado.height,
                                         g->obstacles[i].x, g->obstacles[i].y,
                                         g->obstacles[i].w, g->obstacles[i].h)) {
                    g->obstacles[i].is_bubbled = true;
                    g->obstacles[i].bubble_radius = (g->obstacles[i].w > g->obstacles[i].h ?
                                                     g->obstacles[i].w : g->obstacles[i].h) * 0.8f;
                    g->obstacles[i].vx = 80.0f;
                    g->obstacles[i].vy = HS_BUBBLE_FLOAT_VY * 1.5f; // 水龙卷推力加速升空
                    burst_soap_bubbles(g, g->obstacles[i].x + g->obstacles[i].w * 0.5f,
                                       g->obstacles[i].y + g->obstacles[i].h * 0.5f, 12);
                    splasher_sound_enqueue(g, HS_SND_BUBBLE_WRAP);
                }
            }
        }

        if (g->tornado.life_ms >= g->tornado.max_life_ms || g->tornado.x > HS_SCREEN_W + 80.0f) {
            g->tornado.active = false;
        }
    }

    // 4. 更新水弹弹道运动学与重力抛物线
    for (int i = 0; i < HS_MAX_BULLETS; i++) {
        if (!g->bullets[i].active) continue;

        splasher_bullet_t *b = &g->bullets[i];

        // 欧拉积分：v_y += g * dt, x += v_x * dt, y += v_y * dt
        b->vy += HS_GRAVITY * dt;
        b->x += b->vx * dt;
        b->y += b->vy * dt;

        // 屏幕边界出界判定
        if (b->x < -10.0f || b->x > (float)HS_SCREEN_W + 15.0f ||
            b->y > (float)HS_SCREEN_H + 15.0f || b->y < -60.0f) {
            b->active = false;
            continue;
        }

        // 碰撞检测 A: 灰度复苏物体
        bool hit_detected = false;
        for (int t = 0; t < HS_MAX_TARGETS; t++) {
            splasher_target_t *tgt = &g->targets[t];
            if (!tgt->active) continue;

            if (circle_intersects_rect(b->x, b->y, b->radius, tgt->x, tgt->y, tgt->w, tgt->h)) {
                b->active = false;
                hit_detected = true;
                tgt->hit_count++;
                tgt->dominant_color = b->color;

                // 色彩饱和度累加
                tgt->saturation += 0.35f;
                if (tgt->saturation >= 1.0f) {
                    tgt->saturation = 1.0f;
                    if (!tgt->is_fully_revived) {
                        tgt->is_fully_revived = true;
                        g->targets_revived++;
                        g->score += 200;
                        burst_paint_particles(g, tgt->x + tgt->w * 0.5f, tgt->y + tgt->h * 0.5f, b->color, 12);
                        splasher_sound_enqueue(g, HS_SND_PAINT_SPLASH);
                    }
                } else {
                    g->score += 50;
                    burst_paint_particles(g, b->x, b->y, b->color, 5);
                    splasher_sound_enqueue(g, HS_SND_WATER_POP);
                }

                g->combo++;
                if (g->combo > g->max_combo) g->max_combo = g->combo;
                g->combo_timer_ms = 2000;
                break;
            }
        }
        if (hit_detected) continue;

        // 碰撞检测 B: 打工人 NPC 救赎系统
        for (int n = 0; n < HS_MAX_NPCS; n++) {
            splasher_npc_t *npc = &g->npcs[n];
            if (!npc->active) continue;

            if (circle_intersects_rect(b->x, b->y, b->radius, npc->x, npc->y, npc->w, npc->h)) {
                b->active = false;
                hit_detected = true;

                if (npc->state == HS_NPC_STATE_TIRED_WALKING) {
                    // 瞬间洗去疲惫，换上夏威夷衬衫跳舞！
                    npc->costume = HS_NPC_COSTUME_HAWAIIAN;
                    npc->state = HS_NPC_STATE_DANCING;
                    npc->vx = 0.0f;
                    g->npcs_saved++;
                    g->score += 300;
                    burst_hawaiian_confetti(g, npc->x + npc->w * 0.5f, npc->y + npc->h * 0.5f, 10);
                    splasher_sound_enqueue(g, HS_SND_HAWAIIAN_CHEER);
                    splasher_sound_enqueue(g, HS_SND_WHISTLE);
                } else {
                    // 已在跳舞中，再浇水开怀大笑
                    g->score += 50;
                    burst_paint_particles(g, b->x, b->y, b->color, 4);
                    splasher_sound_enqueue(g, HS_SND_WATER_POP);
                }

                g->combo++;
                if (g->combo > g->max_combo) g->max_combo = g->combo;
                g->combo_timer_ms = 2000;
                break;
            }
        }
        if (hit_detected) continue;

        // 碰撞检测 C: 重型障碍物与肥皂泡机制
        for (int o = 0; o < HS_MAX_OBSTACLES; o++) {
            splasher_obstacle_t *obs = &g->obstacles[o];
            if (!obs->active) continue;

            if (circle_intersects_rect(b->x, b->y, b->radius, obs->x, obs->y, obs->w, obs->h)) {
                b->active = false;
                obs->hit_count++;

                if (!obs->is_bubbled && obs->hit_count >= HS_OBSTACLE_HIT_THRESHOLD) {
                    // 触发肥皂泡包裹机制！
                    obs->is_bubbled = true;
                    obs->bubble_radius = (obs->w > obs->h ? obs->w : obs->h) * 0.75f;
                    obs->vy = HS_BUBBLE_FLOAT_VY;
                    burst_soap_bubbles(g, obs->x + obs->w * 0.5f, obs->y + obs->h * 0.5f, 10);
                    splasher_sound_enqueue(g, HS_SND_BUBBLE_WRAP);
                } else {
                    spawn_particle(g, HS_PART_WATER_DROP, b->x, b->y,
                                   -20.0f, -40.0f, 180.0f, 300.0f, 2.5f, HS_COLOR_CYAN);
                    splasher_sound_enqueue(g, HS_SND_WATER_POP);
                }
                break;
            }
        }
    }

    // 5. 更新重型路障移动 (肥皂泡浮空)
    for (int o = 0; o < HS_MAX_OBSTACLES; o++) {
        splasher_obstacle_t *obs = &g->obstacles[o];
        if (!obs->active) continue;

        if (obs->is_bubbled) {
            obs->x += obs->vx * dt;
            obs->y += obs->vy * dt;

            // 飘离屏幕上方判定
            if (obs->y + obs->h < -20.0f || obs->x > HS_SCREEN_W + 40.0f) {
                obs->active = false;
                g->obstacles_cleared++;
                g->score += 150;
            }
        }
    }

    // 6. 更新打工人 NPC 位置与跳舞律动
    for (int n = 0; n < HS_MAX_NPCS; n++) {
        splasher_npc_t *npc = &g->npcs[n];
        if (!npc->active) continue;

        if (npc->state == HS_NPC_STATE_TIRED_WALKING) {
            npc->x += npc->vx * dt;
            // 巡逻边界折返
            if (npc->x < npc->min_x) {
                npc->x = npc->min_x;
                npc->vx = -npc->vx;
            } else if (npc->x + npc->w > npc->max_x) {
                npc->x = npc->max_x - npc->w;
                npc->vx = -npc->vx;
            }
        } else if (npc->state == HS_NPC_STATE_DANCING) {
            npc->dance_timer_ms += (float)dt_ms;
            npc->dance_phase += 10.0f * dt; // 律动节奏
        }
    }

    // 7. 更新粒子池
    for (int p = 0; p < HS_MAX_PARTICLES; p++) {
        if (!g->particles[p].active) continue;

        splasher_particle_t *part = &g->particles[p];
        part->vy += part->gravity * dt;
        part->x += part->vx * dt;
        part->y += part->vy * dt;
        part->life_ms += (float)dt_ms;

        if (part->life_ms >= part->max_life_ms) {
            part->active = false;
        }
    }

    // 8. 综合复苏率与胜利判定
    float total_saturation = 0.0f;
    for (int t = 0; t < HS_MAX_TARGETS; t++) {
        if (g->targets[t].active) {
            total_saturation += g->targets[t].saturation;
        }
    }

    float total_units = (float)(g->targets_total + g->npcs_total);
    if (total_units > 0.0f) {
        g->revival_progress = (total_saturation + (float)g->npcs_saved) / total_units;
        if (g->revival_progress > 1.0f) g->revival_progress = 1.0f;
    } else {
        g->revival_progress = 1.0f;
    }

    // 关卡胜利判定：所有目标完全复苏 且 所有打工人都被救赎
    if (g->targets_total > 0 && g->npcs_total > 0) {
        if (g->targets_revived >= g->targets_total && g->npcs_saved >= g->npcs_total) {
            if (g->state == HS_STATE_PLAYING) {
                g->state = HS_STATE_VICTORY;
                splasher_sound_enqueue(g, HS_SND_STAGE_CLEAR);
            }
        }
    }
}
