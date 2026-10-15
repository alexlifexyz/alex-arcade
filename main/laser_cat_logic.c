// main/laser_cat_logic.c —— 《猫猫激光笔指挥官》(Laser Pointer Commander) 核心算法引擎实现
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无 ESP-IDF/LVGL/FreeRTOS 依赖。

#include "laser_cat_logic.h"
#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

// =========================================================================
// 内部轻量级辅助与数学函数
// =========================================================================

static inline float lc_deg_to_rad(float deg) {
    return deg * (M_PI / 180.0f);
}

static inline float lc_clamp(float val, float min_val, float max_val) {
    if (val < min_val) return min_val;
    if (val > max_val) return max_val;
    return val;
}

static inline float lc_vec2_len_sq(lc_vec2_t v) {
    return v.x * v.x + v.y * v.y;
}

static inline float lc_vec2_len(lc_vec2_t v) {
    return sqrtf(lc_vec2_len_sq(v));
}

static inline float lc_vec2_dot(lc_vec2_t a, lc_vec2_t b) {
    return a.x * b.x + a.y * b.y;
}

static inline lc_vec2_t lc_vec2_norm(lc_vec2_t v) {
    float l = lc_vec2_len(v);
    if (l > 1e-6f) {
        return (lc_vec2_t){ v.x / l, v.y / l };
    }
    return (lc_vec2_t){ 0.0f, 0.0f };
}

// 快速伪随机数生成器 (LCG)
static uint32_t lc_rand(lc_game_t *g) {
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return g->rng_state;
}

static float lc_rand_range(lc_game_t *g, float min_v, float max_v) {
    uint32_t r = lc_rand(g) & 0x7FFFFFFFu;
    float f = (float)r / (float)0x7FFFFFFFu;
    return min_v + f * (max_v - min_v);
}

// =========================================================================
// 音效环形队列操作
// =========================================================================

void lc_sound_enqueue(lc_game_t *g, lc_sound_t sound) {
    if (sound == LC_SND_NONE) return;
    if (g->sound_q.count >= LC_MAX_SOUND_QUEUE) {
        // 队列满时挤出最旧音效
        g->sound_q.head = (g->sound_q.head + 1) % LC_MAX_SOUND_QUEUE;
        g->sound_q.count--;
    }
    g->sound_q.queue[g->sound_q.tail] = sound;
    g->sound_q.tail = (g->sound_q.tail + 1) % LC_MAX_SOUND_QUEUE;
    g->sound_q.count++;
}

lc_sound_t lc_sound_dequeue(lc_game_t *g) {
    if (g->sound_q.count == 0) return LC_SND_NONE;
    lc_sound_t s = g->sound_q.queue[g->sound_q.head];
    g->sound_q.head = (g->sound_q.head + 1) % LC_MAX_SOUND_QUEUE;
    g->sound_q.count--;
    return s;
}

lc_sound_t lc_sound_peek(const lc_game_t *g) {
    if (g->sound_q.count == 0) return LC_SND_NONE;
    return g->sound_q.queue[g->sound_q.head];
}

void lc_sound_clear(lc_game_t *g) {
    g->sound_q.head = 0;
    g->sound_q.tail = 0;
    g->sound_q.count = 0;
}

// =========================================================================
// 粒子系统管理
// =========================================================================

static void lc_particle_spawn(lc_game_t *g, lc_particle_type_t type,
                              float x, float y, float vx, float vy,
                              float life_ms, float size) {
    for (int i = 0; i < LC_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            g->particles[i].active = true;
            g->particles[i].type = type;
            g->particles[i].x = x;
            g->particles[i].y = y;
            g->particles[i].vx = vx;
            g->particles[i].vy = vy;
            g->particles[i].life_ms = life_ms;
            g->particles[i].max_life_ms = life_ms;
            g->particles[i].size = size;
            return;
        }
    }
}

static void lc_particles_update(lc_game_t *g, uint32_t dt_ms) {
    float dt = (float)dt_ms / 1000.0f;
    for (int i = 0; i < LC_MAX_PARTICLES; i++) {
        if (g->particles[i].active) {
            g->particles[i].x += g->particles[i].vx * dt;
            g->particles[i].y += g->particles[i].vy * dt;
            if (g->particles[i].life_ms <= (float)dt_ms) {
                g->particles[i].active = false;
            } else {
                g->particles[i].life_ms -= (float)dt_ms;
            }
        }
    }
}

// =========================================================================
// 几何与光学射线反射计算
// =========================================================================

bool lc_reflect_vector(lc_vec2_t dir, lc_vec2_t normal, lc_vec2_t *out_dir) {
    if (!out_dir) return false;
    lc_vec2_t n = lc_vec2_norm(normal);
    if (lc_vec2_len_sq(n) < 1e-6f) return false;

    float dot = lc_vec2_dot(dir, n);
    // 确保法向量与入射向量异向
    if (dot > 0.0f) {
        n.x = -n.x;
        n.y = -n.y;
        dot = -dot;
    }
    out_dir->x = dir.x - 2.0f * dot * n.x;
    out_dir->y = dir.y - 2.0f * dot * n.y;
    *out_dir = lc_vec2_norm(*out_dir);
    return true;
}

// 射线与线段求交
static bool lc_ray_intersect_segment(lc_vec2_t p, lc_vec2_t d,
                                      lc_vec2_t a, lc_vec2_t b,
                                      float *out_t, lc_vec2_t *out_pt) {
    float vx = b.x - a.x;
    float vy = b.y - a.y;
    float det = d.x * vy - d.y * vx;
    if (fabsf(det) < 1e-6f) return false;

    float wx = a.x - p.x;
    float wy = a.y - p.y;
    float t = (wx * vy - wy * vx) / det;
    float s = (wx * d.y - wy * d.x) / det;

    if (t > 0.15f && s >= 0.0f && s <= 1.0f) {
        if (out_t) *out_t = t;
        if (out_pt) {
            out_pt->x = p.x + t * d.x;
            out_pt->y = p.y + t * d.y;
        }
        return true;
    }
    return false;
}

// 射线与 AABB 矩形求交 (返回最小正 t)
static bool lc_ray_intersect_aabb(lc_vec2_t p, lc_vec2_t d,
                                  float cx, float cy, float w, float h,
                                  float *out_t, lc_vec2_t *out_pt) {
    float left   = cx - w * 0.5f;
    float right  = cx + w * 0.5f;
    float top    = cy - h * 0.5f;
    float bottom = cy + h * 0.5f;

    lc_vec2_t p1 = { left, top };
    lc_vec2_t p2 = { right, top };
    lc_vec2_t p3 = { right, bottom };
    lc_vec2_t p4 = { left, bottom };

    float min_t = 1e9f;
    lc_vec2_t best_pt = { 0.0f, 0.0f };
    bool hit = false;

    float t;
    lc_vec2_t hit_pt;
    if (lc_ray_intersect_segment(p, d, p1, p2, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p2, p3, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p4, p3, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p1, p4, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }

    if (hit) {
        if (out_t) *out_t = min_t;
        if (out_pt) *out_pt = best_pt;
        return true;
    }
    return false;
}

// 射线与屏幕四边界求交
static bool lc_ray_intersect_screen(lc_vec2_t p, lc_vec2_t d,
                                    float *out_t, lc_vec2_t *out_pt) {
    lc_vec2_t p_tl = { 0.0f, 0.0f };
    lc_vec2_t p_tr = { (float)LC_SCREEN_W, 0.0f };
    lc_vec2_t p_br = { (float)LC_SCREEN_W, (float)LC_SCREEN_H };
    lc_vec2_t p_bl = { 0.0f, (float)LC_SCREEN_H };

    float min_t = 1e9f;
    lc_vec2_t best_pt = { 0.0f, 0.0f };
    bool hit = false;

    float t;
    lc_vec2_t hit_pt;
    if (lc_ray_intersect_segment(p, d, p_tl, p_tr, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p_tr, p_br, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p_bl, p_br, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }
    if (lc_ray_intersect_segment(p, d, p_tl, p_bl, &t, &hit_pt) && t < min_t) {
        min_t = t; best_pt = hit_pt; hit = true;
    }

    if (hit) {
        if (out_t) *out_t = min_t;
        if (out_pt) *out_pt = best_pt;
        return true;
    }
    return false;
}

// 全局激光折线与光斑重算
int lc_recalculate_laser(lc_game_t *g) {
    g->ray_segment_count = 0;
    if (g->laser_mode == LC_LASER_OFF) {
        g->spot.active = false;
        return 0;
    }

    lc_vec2_t cur_origin = { g->emitter_x, g->emitter_y };
    // 0° 为竖直向上 (-Y)，-90° 为向左，+90° 为向右
    float rad = lc_deg_to_rad(g->aim_angle_deg);
    lc_vec2_t cur_dir = { sinf(rad), -cosf(rad) };
    cur_dir = lc_vec2_norm(cur_dir);

    int segments_done = 0;
    int hit_crate_idx = -1;

    for (int step = 0; step < LC_MAX_RAY_SEGMENTS; step++) {
        float closest_t = 1e9f;
        lc_vec2_t hit_point = { 0.0f, 0.0f };
        int hit_type = 0; // 1: screen boundary, 2: crate, 3: mirror
        int mirror_idx = -1;
        lc_vec2_t mirror_normal = { 0.0f, 0.0f };

        // 1. 检查镜面反光板
        for (int m = 0; m < LC_MAX_MIRRORS; m++) {
            if (g->mirrors[m].active) {
                float t;
                lc_vec2_t pt;
                if (lc_ray_intersect_segment(cur_origin, cur_dir,
                                             g->mirrors[m].p1, g->mirrors[m].p2,
                                             &t, &pt)) {
                    if (t < closest_t) {
                        closest_t = t;
                        hit_point = pt;
                        hit_type = 3;
                        mirror_idx = m;
                        mirror_normal = g->mirrors[m].normal;
                    }
                }
            }
        }

        // 2. 检查木箱/电池箱阻挡
        for (int c = 0; c < LC_MAX_CRATES; c++) {
            if (g->crates[c].active) {
                float t;
                lc_vec2_t pt;
                if (lc_ray_intersect_aabb(cur_origin, cur_dir,
                                          g->crates[c].x, g->crates[c].y,
                                          g->crates[c].w, g->crates[c].h,
                                          &t, &pt)) {
                    if (t < closest_t) {
                        closest_t = t;
                        hit_point = pt;
                        hit_type = 2;
                        hit_crate_idx = c;
                    }
                }
            }
        }

        // 3. 若未阻挡，检查屏幕边界
        if (closest_t >= 1e8f) {
            float t;
            lc_vec2_t pt;
            if (lc_ray_intersect_screen(cur_origin, cur_dir, &t, &pt)) {
                closest_t = t;
                hit_point = pt;
                hit_type = 1;
            } else {
                // 逃逸退化终止
                hit_point.x = cur_origin.x + cur_dir.x * 300.0f;
                hit_point.y = cur_origin.y + cur_dir.y * 300.0f;
                hit_type = 1;
            }
        }

        // 记录折线段
        g->ray_segments[g->ray_segment_count].start = cur_origin;
        g->ray_segments[g->ray_segment_count].end = hit_point;
        g->ray_segments[g->ray_segment_count].hit_mirror = (hit_type == 3);
        g->ray_segment_count++;
        segments_done++;

        if (hit_type == 3 && mirror_idx >= 0) {
            // 发生镜面反射，折射新射线
            lc_vec2_t reflect_d;
            if (lc_reflect_vector(cur_dir, mirror_normal, &reflect_d)) {
                cur_dir = reflect_d;
                // 从交点稍向前偏移避免原地自交
                cur_origin.x = hit_point.x + cur_dir.x * 0.2f;
                cur_origin.y = hit_point.y + cur_dir.y * 0.2f;
                continue;
            }
        }

        // 撞击箱子或屏幕边界，光斑生成在此处，终止光线追踪
        g->spot.active = true;
        g->spot.pos = hit_point;
        g->spot.intensity = (g->laser_mode == LC_LASER_CONTINUOUS) ? 1.0f : 0.5f;
        g->spot.on_crate = (hit_type == 2);
        g->spot.crate_index = hit_crate_idx;
        break;
    }

    return segments_done;
}

// =========================================================================
// 实体工厂与关卡编排
// =========================================================================

int lc_cat_add(lc_game_t *g, lc_cat_type_t type, float x, float y) {
    for (int i = 0; i < LC_MAX_CATS; i++) {
        if (!g->cats[i].active) {
            g->cats[i].active = true;
            g->cats[i].type = type;
            g->cats[i].state = LC_CAT_STATE_IDLE;
            g->cats[i].x = x;
            g->cats[i].y = y;
            g->cats[i].vx = 0.0f;
            g->cats[i].vy = 0.0f;
            g->cats[i].facing_angle_deg = -90.0f; // 初始面朝上方
            g->cats[i].alert_timer_ms = 0;
            g->cats[i].wiggle_timer_ms = 0;
            g->cats[i].wiggle_phase = 0.0f;
            g->cats[i].state_timer_ms = 0;
            g->cats[i].target_spot = (lc_vec2_t){ x, y };
            g->cats[i].has_pounced_hit = false;

            // 根据性格配置动力学参数
            if (type == LC_CAT_ORANGE) {
                g->cats[i].radius = 12.0f;
                g->cats[i].mass = 2.6f;
                g->cats[i].speed_max = 90.0f;
                g->cats[i].pounce_speed = 220.0f;
                g->cats[i].push_force = 3.2f;      // 重装坦克推力最强
                g->cats[i].perception_range = 210.0f;
            } else if (type == LC_CAT_COW) {
                g->cats[i].radius = 10.0f;
                g->cats[i].mass = 1.8f;
                g->cats[i].speed_max = 160.0f;
                g->cats[i].pounce_speed = 330.0f;    // 狂暴冲锋速度极快
                g->cats[i].push_force = 2.0f;
                g->cats[i].perception_range = 230.0f;
            } else { // LC_CAT_BLACK
                g->cats[i].radius = 9.0f;
                g->cats[i].mass = 1.2f;
                g->cats[i].speed_max = 140.0f;
                g->cats[i].pounce_speed = 270.0f;
                g->cats[i].push_force = 1.3f;
                g->cats[i].perception_range = 290.0f; // 刺客视距最远
            }
            return i;
        }
    }
    return -1;
}

int lc_crate_add(lc_game_t *g, bool is_battery, float x, float y, float w, float h, float mass) {
    for (int i = 0; i < LC_MAX_CRATES; i++) {
        if (!g->crates[i].active) {
            g->crates[i].active = true;
            g->crates[i].is_battery = is_battery;
            g->crates[i].x = x;
            g->crates[i].y = y;
            g->crates[i].w = w;
            g->crates[i].h = h;
            g->crates[i].vx = 0.0f;
            g->crates[i].vy = 0.0f;
            g->crates[i].mass = (mass > 0.1f) ? mass : 1.5f;
            g->crates[i].friction = 5.0f; // 地面摩擦阻尼
            g->crates[i].is_powered = false;
            g->crates[i].slot_id = -1;

            if (is_battery) {
                g->total_batteries++;
            }
            return i;
        }
    }
    return -1;
}

int lc_slot_add(lc_game_t *g, float x, float y, float w, float h) {
    for (int i = 0; i < LC_MAX_SLOTS; i++) {
        if (!g->slots[i].active) {
            g->slots[i].active = true;
            g->slots[i].x = x;
            g->slots[i].y = y;
            g->slots[i].w = w;
            g->slots[i].h = h;
            g->slots[i].is_filled = false;
            return i;
        }
    }
    return -1;
}

int lc_mirror_add(lc_game_t *g, float x1, float y1, float x2, float y2, float nx, float ny) {
    for (int i = 0; i < LC_MAX_MIRRORS; i++) {
        if (!g->mirrors[i].active) {
            g->mirrors[i].active = true;
            g->mirrors[i].p1 = (lc_vec2_t){ x1, y1 };
            g->mirrors[i].p2 = (lc_vec2_t){ x2, y2 };
            g->mirrors[i].normal = lc_vec2_norm((lc_vec2_t){ nx, ny });
            g->mirrors[i].angle_deg = 0.0f;
            g->mirrors[i].target_angle_deg = 0.0f;
            return i;
        }
    }
    return -1;
}

int lc_switch_add(lc_game_t *g, float x, float y, float w, float h, lc_switch_type_t type, int target_mirror_id) {
    for (int i = 0; i < LC_MAX_SWITCHES; i++) {
        if (!g->switches[i].active) {
            g->switches[i].active = true;
            g->switches[i].x = x;
            g->switches[i].y = y;
            g->switches[i].w = w;
            g->switches[i].h = h;
            g->switches[i].is_on = false;
            g->switches[i].type = type;
            g->switches[i].target_mirror_id = target_mirror_id;
            return i;
        }
    }
    return -1;
}

int lc_roomba_add(lc_game_t *g, float x, float y, float vx, float patrol_min_x, float patrol_max_x) {
    for (int i = 0; i < LC_MAX_ROOMBAS; i++) {
        if (!g->roombas[i].active) {
            g->roombas[i].active = true;
            g->roombas[i].x = x;
            g->roombas[i].y = y;
            g->roombas[i].radius = 14.0f;
            g->roombas[i].vx = vx;
            g->roombas[i].vy = 0.0f;
            g->roombas[i].patrol_min_x = patrol_min_x;
            g->roombas[i].patrol_max_x = patrol_max_x;
            g->roombas[i].is_stunned = false;
            g->roombas[i].stun_timer_ms = 0;
            return i;
        }
    }
    return -1;
}

// 关卡 1：新手教学关 (橘猫、单电池箱、正上方卡槽)
void lc_load_level_1(lc_game_t *g) {
    lc_game_reset(g);
    // 放入橘猫胖墩
    lc_cat_add(g, LC_CAT_ORANGE, 120.0f, 240.0f);
    // 放入一个能量电池箱在中央
    lc_crate_add(g, true, 120.0f, 160.0f, 24.0f, 24.0f, 2.0f);
    // 目标通电卡槽设在靠顶部
    lc_slot_add(g, 120.0f, 60.0f, 28.0f, 28.0f);
    lc_recalculate_laser(g);
}

// 关卡 2：反光镜与高处开关 (反光板折射激光到箱子背后，拍开关改变反光镜)
void lc_load_level_2(lc_game_t *g) {
    lc_game_reset(g);
    // 奶牛猫与黑猫
    lc_cat_add(g, LC_CAT_COW, 60.0f, 250.0f);
    lc_cat_add(g, LC_CAT_BLACK, 180.0f, 250.0f);

    // 电池箱放在右侧障碍后
    lc_crate_add(g, true, 180.0f, 130.0f, 22.0f, 22.0f, 1.8f);
    // 卡槽在左上方
    lc_slot_add(g, 60.0f, 50.0f, 26.0f, 26.0f);

    // 添加倾斜 45° 金属反光镜 (折射激光到右侧)
    // 线段 (30, 110) -> (90, 50), 法线 (1, 1)
    int m_id = lc_mirror_add(g, 30.0f, 110.0f, 90.0f, 50.0f, 0.7071f, 0.7071f);

    // 高处机关开关 (撞击后切换镜面)
    lc_switch_add(g, 210.0f, 40.0f, 18.0f, 18.0f, LC_SWITCH_TOGGLE_MIRROR, m_id);
    lc_recalculate_laser(g);
}

// 关卡 3：猫群大协同 (橘猫、奶牛、黑猫，巡逻扫地机干扰，双电池箱)
void lc_load_level_3(lc_game_t *g) {
    lc_game_reset(g);
    lc_cat_add(g, LC_CAT_ORANGE, 50.0f, 260.0f);
    lc_cat_add(g, LC_CAT_COW, 120.0f, 260.0f);
    lc_cat_add(g, LC_CAT_BLACK, 190.0f, 260.0f);

    // 2 个电池箱
    lc_crate_add(g, true, 70.0f, 170.0f, 22.0f, 22.0f, 2.2f);
    lc_crate_add(g, true, 170.0f, 170.0f, 22.0f, 22.0f, 2.2f);

    // 2 个卡槽
    lc_slot_add(g, 70.0f, 50.0f, 26.0f, 26.0f);
    lc_slot_add(g, 170.0f, 50.0f, 26.0f, 26.0f);

    // 巡逻扫地机横穿中央走道 (y = 110)
    lc_roomba_add(g, 120.0f, 110.0f, 50.0f, 30.0f, 210.0f);

    lc_recalculate_laser(g);
}

// =========================================================================
// 核心生命周期接口
// =========================================================================

void lc_game_init(lc_game_t *g, uint32_t seed) {
    if (!g) return;
    memset(g, 0, sizeof(lc_game_t));
    g->rng_state = (seed != 0) ? seed : 0x12345678u;
    g->emitter_x = LC_EMITTER_DEFAULT_X;
    g->emitter_y = LC_EMITTER_DEFAULT_Y;
    g->aim_angle_deg = 0.0f;
    g->laser_mode = LC_LASER_OFF;
    g->state = LC_STATE_PLAYING;
}

void lc_game_reset(lc_game_t *g) {
    if (!g) return;
    uint32_t seed = g->rng_state;
    lc_game_init(g, seed);
}

void lc_game_pause(lc_game_t *g) {
    if (g && g->state == LC_STATE_PLAYING) {
        g->state = LC_STATE_PAUSED;
    }
}

void lc_game_resume(lc_game_t *g) {
    if (g && g->state == LC_STATE_PAUSED) {
        g->state = LC_STATE_PLAYING;
    }
}

bool lc_game_is_victory(const lc_game_t *g) {
    return g ? (g->state == LC_STATE_VICTORY) : false;
}

bool lc_game_is_game_over(const lc_game_t *g) {
    return g ? (g->state == LC_STATE_GAMEOVER) : false;
}

bool lc_game_is_paused(const lc_game_t *g) {
    return g ? (g->state == LC_STATE_PAUSED) : false;
}

int lc_get_active_cats_count(const lc_game_t *g) {
    if (!g) return 0;
    int cnt = 0;
    for (int i = 0; i < LC_MAX_CATS; i++) {
        if (g->cats[i].active) cnt++;
    }
    return cnt;
}

int lc_get_active_crates_count(const lc_game_t *g) {
    if (!g) return 0;
    int cnt = 0;
    for (int i = 0; i < LC_MAX_CRATES; i++) {
        if (g->crates[i].active) cnt++;
    }
    return cnt;
}

int lc_get_active_particles_count(const lc_game_t *g) {
    if (!g) return 0;
    int cnt = 0;
    for (int i = 0; i < LC_MAX_PARTICLES; i++) {
        if (g->particles[i].active) cnt++;
    }
    return cnt;
}

// =========================================================================
// 用户交互与按键输入
// =========================================================================

void lc_input_up(lc_game_t *g) {
    if (!g || g->state != LC_STATE_PLAYING) return;
    g->aim_angle_deg -= LC_AIM_ANGLE_STEP_DEG;
    if (g->aim_angle_deg < LC_AIM_ANGLE_MIN_DEG) {
        g->aim_angle_deg = LC_AIM_ANGLE_MIN_DEG;
    }
    lc_recalculate_laser(g);
}

void lc_input_down(lc_game_t *g) {
    if (!g || g->state != LC_STATE_PLAYING) return;
    g->aim_angle_deg += LC_AIM_ANGLE_STEP_DEG;
    if (g->aim_angle_deg > LC_AIM_ANGLE_MAX_DEG) {
        g->aim_angle_deg = LC_AIM_ANGLE_MAX_DEG;
    }
    lc_recalculate_laser(g);
}

void lc_input_set_aim_angle(lc_game_t *g, float deg) {
    if (!g) return;
    g->aim_angle_deg = lc_clamp(deg, LC_AIM_ANGLE_MIN_DEG, LC_AIM_ANGLE_MAX_DEG);
    lc_recalculate_laser(g);
}

void lc_input_ok_press(lc_game_t *g) {
    if (!g || g->state != LC_STATE_PLAYING) return;
    g->ok_pressed = true;
    g->ok_hold_time_ms = 0;
}

void lc_input_ok_release(lc_game_t *g) {
    if (!g || g->state != LC_STATE_PLAYING) return;
    if (!g->ok_pressed) return;

    if (g->ok_hold_time_ms < LC_LONG_PRESS_THRESHOLD_MS) {
        // 短按 OK：单点引诱模式 (瞬间短脉冲)
        lc_laser_trigger_pulse(g);
    } else {
        // 长按松手：关闭连续强功率激光
        g->laser_mode = LC_LASER_OFF;
        g->spot.active = false;
        lc_recalculate_laser(g);
    }
    g->ok_pressed = false;
    g->ok_hold_time_ms = 0;
}

void lc_laser_trigger_pulse(lc_game_t *g) {
    if (!g) return;
    g->laser_mode = LC_LASER_PULSE;
    g->laser_timer_ms = LC_PULSE_DURATION_MS;
    lc_sound_enqueue(g, LC_SND_LASER_HUM);
    lc_recalculate_laser(g);
    // 生成光斑火花粒子
    if (g->spot.active) {
        lc_particle_spawn(g, LC_PART_LASER_SPARK, g->spot.pos.x, g->spot.pos.y,
                          lc_rand_range(g, -30.0f, 30.0f), lc_rand_range(g, -30.0f, 30.0f),
                          300.0f, 2.0f);
    }
}

void lc_laser_set_continuous(lc_game_t *g, bool on) {
    if (!g) return;
    if (on) {
        if (g->laser_mode != LC_LASER_CONTINUOUS) {
            g->laser_mode = LC_LASER_CONTINUOUS;
            lc_sound_enqueue(g, LC_SND_LASER_HIGH);
        }
    } else {
        g->laser_mode = LC_LASER_OFF;
        g->spot.active = false;
    }
    lc_recalculate_laser(g);
}

// =========================================================================
// 动力学与 AI 状态机更新
// =========================================================================

static void lc_cats_update_ai(lc_game_t *g, uint32_t dt_ms) {
    float dt = (float)dt_ms / 1000.0f;
    bool has_spot = (g->spot.active && g->laser_mode != LC_LASER_OFF);
    lc_vec2_t spot_pos = g->spot.pos;

    for (int i = 0; i < LC_MAX_CATS; i++) {
        lc_cat_t *cat = &g->cats[i];
        if (!cat->active) continue;

        cat->state_timer_ms += dt_ms;

        // 计算与激光光斑的距离与朝向
        float dx = spot_pos.x - cat->x;
        float dy = spot_pos.y - cat->y;
        float dist_to_spot = sqrtf(dx * dx + dy * dy);

        switch (cat->state) {
            case LC_CAT_STATE_IDLE: {
                // 闲置漫步，微小浮动
                cat->vx *= 0.90f;
                cat->vy *= 0.90f;
                cat->x += cat->vx * dt;
                cat->y += cat->vy * dt;

                // 若激光开启且在感知范围内，发现红点转入 ALERT
                if (has_spot && dist_to_spot <= cat->perception_range) {
                    cat->state = LC_CAT_STATE_ALERT;
                    cat->state_timer_ms = 0;
                    cat->alert_timer_ms = dt_ms;
                    cat->facing_angle_deg = atan2f(dy, dx) * (180.0f / M_PI);
                    lc_sound_enqueue(g, LC_SND_CAT_PATTER);
                }
                break;
            }

            case LC_CAT_STATE_ALERT: {
                cat->vx *= 0.80f;
                cat->vy *= 0.80f;

                if (!has_spot) {
                    // 红点消失，失望转回闲置
                    cat->state = LC_CAT_STATE_IDLE;
                    cat->state_timer_ms = 0;
                    break;
                }

                cat->facing_angle_deg = atan2f(dy, dx) * (180.0f / M_PI);
                cat->alert_timer_ms += dt_ms;

                // 响应延迟判定：奶牛猫最急，黑猫敏捷，橘猫最淡定
                uint32_t alert_delay = (cat->type == LC_CAT_COW) ? 60 :
                                       ((cat->type == LC_CAT_BLACK) ? 100 : 180);

                if (cat->alert_timer_ms >= alert_delay) {
                    if (g->laser_mode == LC_LASER_CONTINUOUS) {
                        // 强功率连续激光：进入屁股摇摆蓄势待发
                        cat->state = LC_CAT_STATE_WIGGLE;
                        cat->state_timer_ms = 0;
                        cat->wiggle_timer_ms = 0;
                        cat->wiggle_phase = 0.0f;
                        lc_sound_enqueue(g, LC_SND_CAT_WIGGLE);
                    } else if (g->laser_mode == LC_LASER_PULSE) {
                        // 单点弱脉冲：小跑试探拍击
                        cat->state = LC_CAT_STATE_PROBE;
                        cat->state_timer_ms = 0;
                    }
                }
                break;
            }

            case LC_CAT_STATE_WIGGLE: {
                if (!has_spot) {
                    cat->state = LC_CAT_STATE_IDLE;
                    break;
                }
                // 屁股摇摆动画相位推进
                cat->wiggle_timer_ms += dt_ms;
                cat->wiggle_phase += (float)dt_ms * 0.035f;

                uint32_t wiggle_duration = (cat->type == LC_CAT_COW) ? 160 :
                                           ((cat->type == LC_CAT_BLACK) ? 220 : 360);

                if (cat->wiggle_timer_ms >= wiggle_duration) {
                    // 蓄力完毕，爆发极速飞扑！
                    cat->state = LC_CAT_STATE_POUNCE;
                    cat->state_timer_ms = 0;
                    cat->target_spot = spot_pos;
                    cat->has_pounced_hit = false;

                    // 计算飞扑初速度
                    lc_vec2_t dir = lc_vec2_norm((lc_vec2_t){ dx, dy });
                    cat->vx = dir.x * cat->pounce_speed;
                    cat->vy = dir.y * cat->pounce_speed;

                    g->pounces_count++;
                    lc_sound_enqueue(g, LC_SND_CAT_PATTER);

                    // 起跳爪尘粒子
                    lc_particle_spawn(g, LC_PART_CAT_PAW_DUST, cat->x, cat->y,
                                      -dir.x * 20.0f, -dir.y * 20.0f, 350.0f, 3.0f);
                }
                break;
            }

            case LC_CAT_STATE_PROBE: {
                // 小跑试探：以平缓速度靠近光斑
                if (!has_spot || dist_to_spot < 16.0f) {
                    // 到了光斑跟前小跳拍击，随后恢复
                    cat->vx = 0.0f;
                    cat->vy = 0.0f;
                    cat->state = LC_CAT_STATE_REST;
                    cat->state_timer_ms = 0;
                    lc_sound_enqueue(g, LC_SND_POUNCE_THUD);
                    lc_particle_spawn(g, LC_PART_CAT_PAW_DUST, cat->x, cat->y, 0.0f, 0.0f, 200.0f, 2.0f);
                    break;
                }
                lc_vec2_t dir = lc_vec2_norm((lc_vec2_t){ dx, dy });
                cat->vx = dir.x * (cat->speed_max * 0.8f);
                cat->vy = dir.y * (cat->speed_max * 0.8f);
                cat->x += cat->vx * dt;
                cat->y += cat->vy * dt;
                break;
            }

            case LC_CAT_STATE_POUNCE: {
                // 飞扑高速运动
                cat->x += cat->vx * dt;
                cat->y += cat->vy * dt;
                // 空气摩擦微弱衰减
                cat->vx *= 0.985f;
                cat->vy *= 0.985f;

                // 1. 与箱子的推击碰撞检测
                for (int c = 0; c < LC_MAX_CRATES; c++) {
                    lc_crate_t *crate = &g->crates[c];
                    if (!crate->active || crate->is_powered) continue;

                    // 圆与矩形碰撞判定
                    float half_w = crate->w * 0.5f;
                    float half_h = crate->h * 0.5f;
                    float test_x = lc_clamp(cat->x, crate->x - half_w, crate->x + half_w);
                    float test_y = lc_clamp(cat->y, crate->y - half_h, crate->y + half_h);

                    float dist_x = cat->x - test_x;
                    float dist_y = cat->y - test_y;
                    float d_sq = dist_x * dist_x + dist_y * dist_y;

                    if (d_sq < (cat->radius * cat->radius)) {
                        // 发生猛烈冲击！猫咪动量传递给箱子
                        float pounce_mag = lc_vec2_len((lc_vec2_t){ cat->vx, cat->vy });
                        lc_vec2_t push_dir = lc_vec2_norm((lc_vec2_t){ cat->vx, cat->vy });
                        if (lc_vec2_len_sq(push_dir) < 1e-4f) {
                            push_dir = (lc_vec2_t){ 0.0f, -1.0f };
                        }

                        // 冲量传递计算公式：猫质量 * 推力加成 * 扑击速度 / 箱子质量
                        float impulse = (cat->mass * cat->push_force * pounce_mag) / (crate->mass * 1.3f);
                        crate->vx += push_dir.x * impulse;
                        crate->vy += push_dir.y * impulse;

                        cat->has_pounced_hit = true;
                        g->boxes_pushed_count++;

                        // 音效与尘屑粒子
                        lc_sound_enqueue(g, LC_SND_BOX_SCRAPE);
                        lc_sound_enqueue(g, LC_SND_POUNCE_THUD);
                        lc_particle_spawn(g, LC_PART_BOX_DUST, test_x, test_y,
                                          push_dir.x * 30.0f, push_dir.y * 30.0f, 400.0f, 3.5f);

                        // 猫咪冲击后阻尼减速转入落地恢复
                        cat->vx = -push_dir.x * 30.0f;
                        cat->vy = -push_dir.y * 30.0f;
                        cat->state = LC_CAT_STATE_REST;
                        cat->state_timer_ms = 0;
                        break;
                    }
                }

                if (cat->state != LC_CAT_STATE_POUNCE) break;

                // 2. 与机关开关碰撞 (猫咪飞扑拍下开关)
                for (int s = 0; s < LC_MAX_SWITCHES; s++) {
                    lc_switch_t *sw = &g->switches[s];
                    if (!sw->active) continue;

                    float half_w = sw->w * 0.5f;
                    float half_h = sw->h * 0.5f;
                    float test_x = lc_clamp(cat->x, sw->x - half_w, sw->x + half_w);
                    float test_y = lc_clamp(cat->y, sw->y - half_h, sw->y + half_h);
                    float d_sq = (cat->x - test_x) * (cat->x - test_x) + (cat->y - test_y) * (cat->y - test_y);

                    if (d_sq < (cat->radius * cat->radius)) {
                        sw->is_on = !sw->is_on;
                        lc_sound_enqueue(g, LC_SND_SWITCH_CLICK);

                        // 若有关联反光镜，翻转反光镜法向量或角度
                        if (sw->target_mirror_id >= 0 && sw->target_mirror_id < LC_MAX_MIRRORS) {
                            lc_mirror_t *m = &g->mirrors[sw->target_mirror_id];
                            if (m->active) {
                                // 调转镜面角度
                                float nx = m->normal.x;
                                float ny = m->normal.y;
                                m->normal.x = -ny;
                                m->normal.y = nx; // 旋转 90 度
                            }
                        }

                        cat->state = LC_CAT_STATE_REST;
                        cat->state_timer_ms = 0;
                        break;
                    }
                }

                if (cat->state != LC_CAT_STATE_POUNCE) break;

                // 3. 与巡逻扫地机碰撞 (猫咪飞扑踩停扫地机器人)
                for (int r = 0; r < LC_MAX_ROOMBAS; r++) {
                    lc_roomba_t *rb = &g->roombas[r];
                    if (!rb->active || rb->is_stunned) continue;

                    float r_dist_sq = (cat->x - rb->x) * (cat->x - rb->x) + (cat->y - rb->y) * (cat->y - rb->y);
                    float comb_r = cat->radius + rb->radius;
                    if (r_dist_sq < (comb_r * comb_r)) {
                        rb->is_stunned = true;
                        rb->stun_timer_ms = 4500; // 踩停关机 4.5 秒
                        rb->vx = 0.0f;
                        lc_sound_enqueue(g, LC_SND_ROOMBA_STUN);
                        lc_particle_spawn(g, LC_PART_ROOMBA_SPARK, rb->x, rb->y, 0.0f, -40.0f, 500.0f, 3.0f);

                        cat->state = LC_CAT_STATE_REST;
                        cat->state_timer_ms = 0;
                        break;
                    }
                }

                if (cat->state != LC_CAT_STATE_POUNCE) break;

                // 4. 抵达光斑终点或飞扑耗尽
                float current_pounce_speed = lc_vec2_len((lc_vec2_t){ cat->vx, cat->vy });
                if (dist_to_spot < 12.0f || current_pounce_speed < 40.0f || cat->state_timer_ms > 1200) {
                    cat->vx = 0.0f;
                    cat->vy = 0.0f;
                    cat->state = LC_CAT_STATE_REST;
                    cat->state_timer_ms = 0;
                    lc_sound_enqueue(g, LC_SND_POUNCE_THUD);
                    lc_particle_spawn(g, LC_PART_CAT_PAW_DUST, cat->x, cat->y, 0.0f, 0.0f, 300.0f, 3.0f);
                }
                break;
            }

            case LC_CAT_STATE_REST: {
                cat->vx *= 0.7f;
                cat->vy *= 0.7f;
                if (cat->state_timer_ms > 350) {
                    cat->state = LC_CAT_STATE_IDLE;
                    cat->state_timer_ms = 0;
                }
                break;
            }
        }

        // 限制猫咪在屏幕内
        cat->x = lc_clamp(cat->x, cat->radius, (float)LC_SCREEN_W - cat->radius);
        cat->y = lc_clamp(cat->y, cat->radius, (float)LC_SCREEN_H - cat->radius);
    }
}

// =========================================================================
// 扫地机器人更新
// =========================================================================

static void lc_roombas_update(lc_game_t *g, uint32_t dt_ms) {
    float dt = (float)dt_ms / 1000.0f;
    for (int i = 0; i < LC_MAX_ROOMBAS; i++) {
        lc_roomba_t *rb = &g->roombas[i];
        if (!rb->active) continue;

        if (rb->is_stunned) {
            if (rb->stun_timer_ms <= dt_ms) {
                rb->is_stunned = false;
                rb->stun_timer_ms = 0;
                rb->vx = 45.0f; // 重启巡逻
            } else {
                rb->stun_timer_ms -= dt_ms;
            }
            continue;
        }

        rb->x += rb->vx * dt;
        // 巡逻到达边界调头
        if (rb->x <= rb->patrol_min_x) {
            rb->x = rb->patrol_min_x;
            rb->vx = fabsf(rb->vx);
            lc_sound_enqueue(g, LC_SND_ROOMBA_BUMP);
        } else if (rb->x >= rb->patrol_max_x) {
            rb->x = rb->patrol_max_x;
            rb->vx = -fabsf(rb->vx);
            lc_sound_enqueue(g, LC_SND_ROOMBA_BUMP);
        }
    }
}

// =========================================================================
// 箱子滑动物理与通电卡槽过关判定
// =========================================================================

static void lc_crates_update(lc_game_t *g, uint32_t dt_ms) {
    float dt = (float)dt_ms / 1000.0f;

    for (int i = 0; i < LC_MAX_CRATES; i++) {
        lc_crate_t *crate = &g->crates[i];
        if (!crate->active) continue;

        if (crate->is_powered) {
            // 已锁入卡槽并通电，不再移动
            crate->vx = 0.0f;
            crate->vy = 0.0f;
            continue;
        }

        // 速度位移与地面阻尼衰减
        crate->x += crate->vx * dt;
        crate->y += crate->vy * dt;

        float damping = 1.0f - (crate->friction * dt);
        if (damping < 0.0f) damping = 0.0f;
        crate->vx *= damping;
        crate->vy *= damping;

        if (fabsf(crate->vx) < 1.0f) crate->vx = 0.0f;
        if (fabsf(crate->vy) < 1.0f) crate->vy = 0.0f;

        // 屏幕边界限制
        float half_w = crate->w * 0.5f;
        float half_h = crate->h * 0.5f;
        if (crate->x - half_w < 0.0f) {
            crate->x = half_w;
            crate->vx = 0.0f;
        } else if (crate->x + half_w > (float)LC_SCREEN_W) {
            crate->x = (float)LC_SCREEN_W - half_w;
            crate->vx = 0.0f;
        }
        if (crate->y - half_h < 0.0f) {
            crate->y = half_h;
            crate->vy = 0.0f;
        } else if (crate->y + half_h > (float)LC_SCREEN_H) {
            crate->y = (float)LC_SCREEN_H - half_h;
            crate->vy = 0.0f;
        }

        // 若为能量电池箱，检测是否推入目标卡槽
        if (crate->is_battery) {
            for (int s = 0; s < LC_MAX_SLOTS; s++) {
                lc_slot_t *slot = &g->slots[s];
                if (!slot->active || slot->is_filled) continue;

                // 距离卡槽中心小于阈值即被吸附通电
                float dist_to_slot = hypotf(crate->x - slot->x, crate->y - slot->y);
                if (dist_to_slot < 14.0f) {
                    crate->x = slot->x;
                    crate->y = slot->y;
                    crate->vx = 0.0f;
                    crate->vy = 0.0f;
                    crate->is_powered = true;
                    crate->slot_id = s;
                    slot->is_filled = true;
                    g->powered_batteries++;

                    lc_sound_enqueue(g, LC_SND_SLOT_POWERED);
                    // 迸发通电蓝色电弧火花粒子
                    for (int p = 0; p < 8; p++) {
                        lc_particle_spawn(g, LC_PART_ELECTRIC_ARC, slot->x, slot->y,
                                          lc_rand_range(g, -60.0f, 60.0f),
                                          lc_rand_range(g, -60.0f, 60.0f),
                                          500.0f, 3.0f);
                    }
                    break;
                }
            }
        }
    }

    // 过关判定：所有电池箱通电
    if (g->state == LC_STATE_PLAYING && g->total_batteries > 0) {
        if (g->powered_batteries >= g->total_batteries) {
            g->state = LC_STATE_VICTORY;
            lc_sound_enqueue(g, LC_SND_VICTORY_MEOW);
        }
    }
}

// =========================================================================
// 全局单步迭代 Tick
// =========================================================================

void lc_game_step(lc_game_t *g, uint32_t dt_ms) {
    if (!g || g->state != LC_STATE_PLAYING) return;

    g->game_time_ms += dt_ms;

    // 1. 处理 OK 键蓄力与模式切换
    if (g->ok_pressed) {
        g->ok_hold_time_ms += dt_ms;
        if (g->ok_hold_time_ms >= LC_LONG_PRESS_THRESHOLD_MS) {
            // 达到长按阈值，切换至强功率连续激光
            if (g->laser_mode != LC_LASER_CONTINUOUS) {
                g->laser_mode = LC_LASER_CONTINUOUS;
                lc_sound_enqueue(g, LC_SND_LASER_HIGH);
            }
        }
    }

    // 2. 脉冲激光倒计时维护
    if (g->laser_mode == LC_LASER_PULSE) {
        if (g->laser_timer_ms <= dt_ms) {
            g->laser_mode = LC_LASER_OFF;
            g->laser_timer_ms = 0;
            g->spot.active = false;
        } else {
            g->laser_timer_ms -= dt_ms;
        }
    }

    // 3. 激光与反射光线追踪重算
    lc_recalculate_laser(g);

    // 4. 扫地机器人巡逻更新
    lc_roombas_update(g, dt_ms);

    // 5. 箱子物理运动与通电判定更新
    lc_crates_update(g, dt_ms);

    // 6. 猫群 AI 状态机更新
    lc_cats_update_ai(g, dt_ms);

    // 7. 粒子生命周期推进
    lc_particles_update(g, dt_ms);
}
