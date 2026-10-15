// main/bouncy_logic.c —— 《回声几何弹射枪》(Bouncy Blaster / 橡胶弹球大师) 核心算法实现
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏) 设计。
// 纯 C11 编写，零动态堆分配 (Zero malloc/free)，无外部依赖。

#include "bouncy_logic.h"
#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

#define EPSILON 1e-4f

// 内部轻量伪随机数生成器 (LCG)
static uint32_t bb_rand_next(uint32_t *state)
{
    *state = (*state * 1664525u + 1013904223u);
    return *state;
}

static float bb_rand_range(uint32_t *state, float min_v, float max_v)
{
    uint32_t r = bb_rand_next(state) >> 16;
    float norm = (float)r / 65535.0f;
    return min_v + norm * (max_v - min_v);
}

// 音效推入环形队列
static void bb_push_sound(bouncy_game_t *g, bouncy_sound_t snd)
{
    if (snd == BB_SND_NONE) return;
    int next = (g->sound_tail + 1) % BB_MAX_SOUND_QUEUE;
    if (next != g->sound_head) {
        g->sound_queue[g->sound_tail] = snd;
        g->sound_tail = next;
    }
}

bouncy_sound_t bouncy_pop_sound(bouncy_game_t *g)
{
    if (!g || g->sound_head == g->sound_tail) {
        return BB_SND_NONE;
    }
    bouncy_sound_t snd = g->sound_queue[g->sound_head];
    g->sound_head = (g->sound_head + 1) % BB_MAX_SOUND_QUEUE;
    return snd;
}

// 粒子分配与重置
static void bb_spawn_particle(bouncy_game_t *g, bouncy_particle_type_t type,
                              float x, float y, float vx, float vy,
                              float life_ms, float rot_speed, uint8_t color)
{
    for (int i = 0; i < BB_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            g->particles[i].active = true;
            g->particles[i].type = type;
            g->particles[i].x = x;
            g->particles[i].y = y;
            g->particles[i].vx = vx;
            g->particles[i].vy = vy;
            g->particles[i].life_ms = life_ms;
            g->particles[i].max_life_ms = life_ms;
            g->particles[i].rotation_deg = 0.0f;
            g->particles[i].rot_speed = rot_speed;
            g->particles[i].color_type = color;
            break;
        }
    }
}

// 生成亮黄反弹火星
static void bb_spawn_spark_burst(bouncy_game_t *g, float x, float y, float nx, float ny, int count)
{
    for (int i = 0; i < count; i++) {
        float angle_spread = bb_rand_range(&g->rng_state, -0.8f, 0.8f);
        float base_ang = atan2f(ny, nx);
        float ang = base_ang + angle_spread;
        float speed = bb_rand_range(&g->rng_state, 60.0f, 220.0f);
        float vx = cosf(ang) * speed;
        float vy = sinf(ang) * speed;
        float life = bb_rand_range(&g->rng_state, 120.0f, 320.0f);
        bb_spawn_particle(g, BB_PART_SPARK, x, y, vx, vy, life, 0.0f, 0);
    }
}

// 2D 向量与几何基础计算
static inline float vec_dot(float x1, float y1, float x2, float y2)
{
    return x1 * x2 + y1 * y2;
}

static inline float vec_len_sq(float x, float y)
{
    return x * x + y * y;
}

// 射线相交结果结构
typedef struct {
    bool hit;
    float t;              // 沿射线距离
    float hx;             // 碰撞点 X
    float hy;             // 碰撞点 Y
    float nx;             // 反射法向 X
    float ny;             // 反射法向 Y
    int obj_kind;         // 0: 边界, 1: 障碍板, 2: 目标敌人, 3: 炸药桶, 4: 特工头部
    int obj_index;        // 对象在池中的索引
    bool is_shield_hit;   // 是否击中防弹盾正面
} ray_hit_t;

// 射线与线段相交检测
static bool ray_intersect_segment(float px, float py, float dx, float dy,
                                  float x1, float y1, float x2, float y2,
                                  float *out_t, float *out_nx, float *out_ny)
{
    float sx = x2 - x1;
    float sy = y2 - y1;
    float denom = dx * sy - dy * sx;
    if (fabsf(denom) < 1e-6f) {
        return false; // 平行
    }

    float t = ((x1 - px) * sy - (y1 - py) * sx) / denom;
    float u = ((x1 - px) * dy - (y1 - py) * dx) / denom;

    if (t > EPSILON && u >= 0.0f && u <= 1.0f) {
        *out_t = t;
        // 线段法向量归一化
        float len = sqrtf(sx * sx + sy * sy);
        if (len < 1e-6f) return false;
        float nx = -sy / len;
        float ny = sx / len;
        // 确保法向朝向入射射线
        if (vec_dot(dx, dy, nx, ny) > 0.0f) {
            nx = -nx;
            ny = -ny;
        }
        *out_nx = nx;
        *out_ny = ny;
        return true;
    }
    return false;
}

// 射线与圆相交检测
static bool ray_intersect_circle(float px, float py, float dx, float dy,
                                 float cx, float cy, float radius,
                                 float *out_t, float *out_nx, float *out_ny)
{
    float vx = cx - px;
    float vy = cy - py;
    float proj = vec_dot(vx, vy, dx, dy);
    if (proj <= 0.0f) {
        return false;
    }

    float dist_sq = vec_len_sq(vx, vy) - proj * proj;
    float r_sq = radius * radius;
    if (dist_sq > r_sq) {
        return false;
    }

    float offset = sqrtf(r_sq - dist_sq);
    float t = proj - offset;
    if (t > EPSILON) {
        *out_t = t;
        float hit_x = px + t * dx;
        float hit_y = py + t * dy;
        float nx = (hit_x - cx) / radius;
        float ny = (hit_y - cy) / radius;
        if (vec_dot(dx, dy, nx, ny) > 0.0f) {
            nx = -nx;
            ny = -ny;
        }
        *out_nx = nx;
        *out_ny = ny;
        return true;
    }
    return false;
}

// 射线与单向防弹盾及目标相交判断
static bool check_target_ray_hit(const bouncy_target_t *tgt,
                                 float px, float py, float dx, float dy,
                                 float *out_t, float *out_nx, float *out_ny,
                                 bool *out_is_shield)
{
    if (!tgt->active || !tgt->alive) return false;

    float t, nx, ny;
    if (!ray_intersect_circle(px, py, dx, dy, tgt->x, tgt->y, tgt->radius, &t, &nx, &ny)) {
        return false;
    }

    *out_t = t;
    *out_nx = nx;
    *out_ny = ny;

    if (tgt->has_shield) {
        // 计算入射角与盾牌法向内积
        // dx, dy 与 shield_n 夹角：若迎面射向盾牌正面，则 vec_dot(dx, dy, shield_nx, shield_ny) < 0
        float dot_in = vec_dot(dx, dy, tgt->shield_nx, tgt->shield_ny);
        float cos_thresh = cosf((180.0f - tgt->shield_angle_span) * (float)M_PI / 180.0f);
        if (dot_in < cos_thresh) {
            // 处于盾牌正面防御扇区
            *out_is_shield = true;
            *out_nx = tgt->shield_nx;
            *out_ny = tgt->shield_ny;
            return true;
        }
    }
    *out_is_shield = false;
    return true;
}

// 场景单次光线追踪碰撞查询
static ray_hit_t bb_raycast_scene(const bouncy_game_t *g, float px, float py, float dx, float dy, bool check_agent)
{
    ray_hit_t best_hit;
    best_hit.hit = false;
    best_hit.t = 1e9f;
    best_hit.hx = 0;
    best_hit.hy = 0;
    best_hit.nx = 0;
    best_hit.ny = 0;
    best_hit.obj_kind = -1;
    best_hit.obj_index = -1;
    best_hit.is_shield_hit = false;

    // 1. 三面墙壁检测 (左、右、顶)
    // 左墙 x = BB_BULLET_RADIUS
    float r = BB_BULLET_RADIUS;
    if (dx < -EPSILON) {
        float t = (r - px) / dx;
        if (t > EPSILON && t < best_hit.t) {
            best_hit.hit = true;
            best_hit.t = t;
            best_hit.nx = 1.0f;
            best_hit.ny = 0.0f;
            best_hit.obj_kind = 0;
        }
    }
    // 右墙 x = BB_SCREEN_W - r
    if (dx > EPSILON) {
        float t = (BB_SCREEN_W - r - px) / dx;
        if (t > EPSILON && t < best_hit.t) {
            best_hit.hit = true;
            best_hit.t = t;
            best_hit.nx = -1.0f;
            best_hit.ny = 0.0f;
            best_hit.obj_kind = 0;
        }
    }
    // 顶墙 y = r
    if (dy < -EPSILON) {
        float t = (r - py) / dy;
        if (t > EPSILON && t < best_hit.t) {
            best_hit.hit = true;
            best_hit.t = t;
            best_hit.nx = 0.0f;
            best_hit.ny = 1.0f;
            best_hit.obj_kind = 0;
        }
    }

    // 2. 障碍物碰撞检测
    for (int i = 0; i < BB_MAX_OBSTACLES; i++) {
        const bouncy_obstacle_t *obs = &g->obstacles[i];
        if (!obs->active || obs->destroyed) continue;

        if (obs->type == BB_OBS_WALL || obs->type == BB_OBS_SHIELD_WALL || obs->type == BB_OBS_DESTRUCTIBLE_BLOCK) {
            // AABB 矩形四周四条边
            float lines[4][4] = {
                { obs->x, obs->y, obs->x + obs->w, obs->y },                  // 顶边
                { obs->x + obs->w, obs->y, obs->x + obs->w, obs->y + obs->h },// 右边
                { obs->x + obs->w, obs->y + obs->h, obs->x, obs->y + obs->h },// 底边
                { obs->x, obs->y + obs->h, obs->x, obs->y }                   // 左边
            };
            for (int e = 0; e < 4; e++) {
                float t, nx, ny;
                if (ray_intersect_segment(px, py, dx, dy, lines[e][0], lines[e][1], lines[e][2], lines[e][3], &t, &nx, &ny)) {
                    if (t < best_hit.t) {
                        best_hit.hit = true;
                        best_hit.t = t;
                        best_hit.nx = nx;
                        best_hit.ny = ny;
                        best_hit.obj_kind = 1;
                        best_hit.obj_index = i;
                        best_hit.is_shield_hit = false;
                    }
                }
            }
        } else if (obs->type == BB_OBS_PRISM_45_SLASH) {
            // 45° 斜面棱镜：线段由 (x, y + h) 到 (x + w, y)
            float t, nx, ny;
            if (ray_intersect_segment(px, py, dx, dy, obs->x, obs->y + obs->h, obs->x + obs->w, obs->y, &t, &nx, &ny)) {
                if (t < best_hit.t) {
                    best_hit.hit = true;
                    best_hit.t = t;
                    best_hit.nx = nx;
                    best_hit.ny = ny;
                    best_hit.obj_kind = 1;
                    best_hit.obj_index = i;
                    best_hit.is_shield_hit = false;
                }
            }
        } else if (obs->type == BB_OBS_PRISM_45_BACKSLASH) {
            // 45° 斜面棱镜：线段由 (x, y) 到 (x + w, y + h)
            float t, nx, ny;
            if (ray_intersect_segment(px, py, dx, dy, obs->x, obs->y, obs->x + obs->w, obs->y + obs->h, &t, &nx, &ny)) {
                if (t < best_hit.t) {
                    best_hit.hit = true;
                    best_hit.t = t;
                    best_hit.nx = nx;
                    best_hit.ny = ny;
                    best_hit.obj_kind = 1;
                    best_hit.obj_index = i;
                    best_hit.is_shield_hit = false;
                }
            }
        }
    }

    // 3. 炸药桶碰撞检测
    for (int i = 0; i < BB_MAX_BARRELS; i++) {
        const bouncy_barrel_t *b = &g->barrels[i];
        if (!b->active || b->exploded) continue;
        float t, nx, ny;
        if (ray_intersect_circle(px, py, dx, dy, b->x, b->y, b->radius, &t, &nx, &ny)) {
            if (t < best_hit.t) {
                best_hit.hit = true;
                best_hit.t = t;
                best_hit.nx = nx;
                best_hit.ny = ny;
                best_hit.obj_kind = 3;
                best_hit.obj_index = i;
                best_hit.is_shield_hit = false;
            }
        }
    }

    // 4. 目标敌人检测 (含正面防弹盾判定)
    for (int i = 0; i < BB_MAX_TARGETS; i++) {
        const bouncy_target_t *tgt = &g->targets[i];
        if (!tgt->active || !tgt->alive) continue;
        float t, nx, ny;
        bool is_shield = false;
        if (check_target_ray_hit(tgt, px, py, dx, dy, &t, &nx, &ny, &is_shield)) {
            if (t < best_hit.t) {
                best_hit.hit = true;
                best_hit.t = t;
                best_hit.nx = nx;
                best_hit.ny = ny;
                best_hit.obj_kind = 2;
                best_hit.obj_index = i;
                best_hit.is_shield_hit = is_shield;
            }
        }
    }

    // 5. 特工头部碰撞 (搞笑自伤判定，仅在至少反射 1 次后检测)
    if (check_agent) {
        float t, nx, ny;
        if (ray_intersect_circle(px, py, dx, dy, g->agent.head_x, g->agent.head_y, g->agent.head_radius, &t, &nx, &ny)) {
            if (t < best_hit.t) {
                best_hit.hit = true;
                best_hit.t = t;
                best_hit.nx = nx;
                best_hit.ny = ny;
                best_hit.obj_kind = 4;
                best_hit.obj_index = 0;
                best_hit.is_shield_hit = false;
            }
        }
    }

    if (best_hit.hit) {
        best_hit.hx = px + best_hit.t * dx;
        best_hit.hy = py + best_hit.t * dy;
    }
    return best_hit;
}

// 核心数学模块：预先计算并获取未来 2~3 次反射路径虚线关键拐点 (用户严格指定接口)
int bouncy_get_trajectory_points(const bouncy_game_t *g, bouncy_point_t *points, int max_points)
{
    if (!g || !points || max_points < 2) return 0;

    bouncy_traj_point_t detailed_pts[BB_MAX_TRAJ_POINTS];
    int count = bouncy_get_trajectory_detailed(g, detailed_pts, BB_MAX_TRAJ_POINTS, BB_TRAJECTORY_MAX_REFLECT);

    int n = (count < max_points) ? count : max_points;
    for (int i = 0; i < n; i++) {
        points[i].x = detailed_pts[i].x;
        points[i].y = detailed_pts[i].y;
    }
    return n;
}

// 高级详尽弹道预判接口
int bouncy_get_trajectory_detailed(const bouncy_game_t *g, bouncy_traj_point_t *points, int max_points, int max_reflections)
{
    if (!g || !points || max_points < 2 || max_reflections < 1) return 0;

    // 起始点：特工枪口
    float cur_x = g->agent.gun_x;
    float cur_y = g->agent.gun_y;

    float rad = g->aim_angle_deg * (float)M_PI / 180.0f;
    float cur_dx = cosf(rad);
    float cur_dy = -sinf(rad); // 屏幕坐标系向上为负

    int pt_count = 0;
    points[pt_count].x = cur_x;
    points[pt_count].y = cur_y;
    points[pt_count].is_reflection = false;
    points[pt_count].is_hit_target = false;
    points[pt_count].is_hit_barrel = false;
    points[pt_count].is_hit_agent = false;
    points[pt_count].nx = 0.0f;
    points[pt_count].ny = 0.0f;
    pt_count++;

    int bounces = 0;
    while (bounces <= max_reflections && pt_count < max_points) {
        bool allow_self_hit = (bounces >= 1);
        ray_hit_t hit = bb_raycast_scene(g, cur_x, cur_y, cur_dx, cur_dy, allow_self_hit);

        if (!hit.hit) {
            // 未撞到任何物体，延伸到屏幕边沿终点
            points[pt_count].x = cur_x + cur_dx * 300.0f;
            points[pt_count].y = cur_y + cur_dy * 300.0f;
            points[pt_count].is_reflection = false;
            points[pt_count].is_hit_target = false;
            points[pt_count].is_hit_barrel = false;
            points[pt_count].is_hit_agent = false;
            points[pt_count].nx = 0.0f;
            points[pt_count].ny = 0.0f;
            pt_count++;
            break;
        }

        points[pt_count].x = hit.hx;
        points[pt_count].y = hit.hy;
        points[pt_count].nx = hit.nx;
        points[pt_count].ny = hit.ny;
        points[pt_count].is_reflection = (hit.obj_kind <= 1 || hit.is_shield_hit);
        points[pt_count].is_hit_target = (hit.obj_kind == 2 && !hit.is_shield_hit);
        points[pt_count].is_hit_barrel = (hit.obj_kind == 3);
        points[pt_count].is_hit_agent = (hit.obj_kind == 4);
        pt_count++;

        // 若撞到目标(绕后击破)、炸药桶或特工自身，弹道终止
        if (points[pt_count - 1].is_hit_target ||
            points[pt_count - 1].is_hit_barrel ||
            points[pt_count - 1].is_hit_agent) {
            break;
        }

        // 计算反射向量: R = D - 2 * (D . N) * N
        float dot = vec_dot(cur_dx, cur_dy, hit.nx, hit.ny);
        cur_dx = cur_dx - 2.0f * dot * hit.nx;
        cur_dy = cur_dy - 2.0f * dot * hit.ny;

        // 归一化反射方向
        float len = sqrtf(cur_dx * cur_dx + cur_dy * cur_dy);
        if (len > 1e-6f) {
            cur_dx /= len;
            cur_dy /= len;
        }

        // 碰撞点微移，防止自碰撞
        cur_x = hit.hx + cur_dx * 0.15f;
        cur_y = hit.hy + cur_dy * 0.15f;
        bounces++;
    }

    return pt_count;
}

// 获取沿预判弹道的等间距虚线小圆点
int bouncy_get_aim_dots(const bouncy_game_t *g, bouncy_point_t *dots, int max_dots, float step_dist)
{
    if (!g || !dots || max_dots <= 0 || step_dist < 1.0f) return 0;

    bouncy_point_t poly[BB_MAX_TRAJ_POINTS];
    int poly_count = bouncy_get_trajectory_points(g, poly, BB_MAX_TRAJ_POINTS);
    if (poly_count < 2) return 0;

    int dot_count = 0;
    float carry = 0.0f;

    for (int i = 0; i < poly_count - 1; i++) {
        float x1 = poly[i].x;
        float y1 = poly[i].y;
        float x2 = poly[i + 1].x;
        float y2 = poly[i + 1].y;

        float seg_len = sqrtf((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        if (seg_len < 1e-4f) continue;

        float udx = (x2 - x1) / seg_len;
        float udy = (y2 - y1) / seg_len;

        float d = carry;
        while (d <= seg_len && dot_count < max_dots) {
            dots[dot_count].x = x1 + udx * d;
            dots[dot_count].y = y1 + udy * d;
            dot_count++;
            d += step_dist;
        }
        carry = d - seg_len;
    }
    return dot_count;
}

// 炸药桶范围爆炸连锁逻辑
static void bb_explode_barrel(bouncy_game_t *g, int barrel_idx)
{
    if (barrel_idx < 0 || barrel_idx >= BB_MAX_BARRELS) return;
    bouncy_barrel_t *bar = &g->barrels[barrel_idx];
    if (!bar->active || bar->exploded) return;

    bar->exploded = true;
    g->barrels_exploded++;
    g->score += 300;
    bb_push_sound(g, BB_SND_BARREL_BOOM);

    // 生成大量爆炸火焰与碎片粒子
    for (int i = 0; i < 16; i++) {
        float ang = bb_rand_range(&g->rng_state, 0.0f, (float)M_PI * 2.0f);
        float spd = bb_rand_range(&g->rng_state, 80.0f, 260.0f);
        bb_spawn_particle(g, BB_PART_EXPLOSION_FLAME,
                          bar->x, bar->y,
                          cosf(ang) * spd, sinf(ang) * spd,
                          bb_rand_range(&g->rng_state, 300.0f, 600.0f),
                          bb_rand_range(&g->rng_state, -180.0f, 180.0f), 1);
    }

    float blast_r_sq = bar->blast_radius * bar->blast_radius;

    // 1. 炸死范围内的所有敌人
    for (int i = 0; i < BB_MAX_TARGETS; i++) {
        bouncy_target_t *tgt = &g->targets[i];
        if (tgt->active && tgt->alive) {
            float dist_sq = vec_len_sq(tgt->x - bar->x, tgt->y - bar->y);
            if (dist_sq <= blast_r_sq) {
                tgt->alive = false;
                g->targets_remaining--;
                g->score += tgt->score_value;
                bb_push_sound(g, BB_SND_TARGET_DESTROY);
                // 击杀碎屑
                for (int p = 0; p < 8; p++) {
                    float ang = bb_rand_range(&g->rng_state, 0.0f, (float)M_PI * 2.0f);
                    float spd = bb_rand_range(&g->rng_state, 50.0f, 180.0f);
                    bb_spawn_particle(g, BB_PART_TARGET_SHARD, tgt->x, tgt->y,
                                      cosf(ang) * spd, sinf(ang) * spd, 400.0f, 0.0f, 0);
                }
            }
        }
    }

    // 2. 摧毁范围内的可破坏掩体
    for (int i = 0; i < BB_MAX_OBSTACLES; i++) {
        bouncy_obstacle_t *obs = &g->obstacles[i];
        if (obs->active && !obs->destroyed && obs->type == BB_OBS_DESTRUCTIBLE_BLOCK) {
            float center_x = obs->x + obs->w * 0.5f;
            float center_y = obs->y + obs->h * 0.5f;
            float dist_sq = vec_len_sq(center_x - bar->x, center_y - bar->y);
            if (dist_sq <= blast_r_sq) {
                obs->destroyed = true;
                // 木箱爆炸碎片
                for (int p = 0; p < 6; p++) {
                    float ang = bb_rand_range(&g->rng_state, 0.0f, (float)M_PI * 2.0f);
                    float spd = bb_rand_range(&g->rng_state, 40.0f, 150.0f);
                    bb_spawn_particle(g, BB_PART_SMOKE, center_x, center_y,
                                      cosf(ang) * spd, sinf(ang) * spd, 350.0f, 0.0f, 3);
                }
            }
        }
    }

    // 3. 连环引爆附近的炸药桶 (递归连锁)
    for (int i = 0; i < BB_MAX_BARRELS; i++) {
        if (i == barrel_idx) continue;
        bouncy_barrel_t *other = &g->barrels[i];
        if (other->active && !other->exploded) {
            float dist_sq = vec_len_sq(other->x - bar->x, other->y - bar->y);
            if (dist_sq <= blast_r_sq) {
                bb_explode_barrel(g, i); // 连环引爆
            }
        }
    }
}

// 搞笑自伤判定触发
static void bb_trigger_self_harm(bouncy_game_t *g)
{
    g->self_hits++;
    g->agent.sunglasses_on = false;
    g->agent.is_dizzy = true;
    g->agent.dizzy_timer_ms = BB_AGENT_DIZZY_DURATION_MS;

    bb_push_sound(g, BB_SND_SUNGLASSES_FLY);

    // 墨镜化为高速旋转抛物线粒子高高抛飞
    float fly_vx = bb_rand_range(&g->rng_state, 40.0f, 90.0f);
    if ((g->self_hits & 1) == 0) fly_vx = -fly_vx;
    bb_spawn_particle(g, BB_PART_SUNGLASSES,
                      g->agent.head_x, g->agent.head_y - 2.0f,
                      fly_vx, -200.0f, 1200.0f, 480.0f, 2);

    // 冒金星粒子
    for (int i = 0; i < 4; i++) {
        float ang = bb_rand_range(&g->rng_state, 0.0f, (float)M_PI * 2.0f);
        bb_spawn_particle(g, BB_PART_SPARK,
                          g->agent.head_x, g->agent.head_y,
                          cosf(ang) * 40.0f, sinf(ang) * 40.0f, 600.0f, 180.0f, 0);
    }
}

// 加载关卡内置数据
bool bouncy_load_level(bouncy_game_t *g, int level)
{
    if (!g || level < 1 || level > BB_MAX_LEVELS) return false;

    g->current_level = level;
    g->ammo_remaining = BB_DEFAULT_AMMO;
    g->stars_earned = 0;
    g->state = BB_STATE_AIMING;
    g->aim_angle_deg = BB_AIM_DEFAULT_DEG;
    g->targets_remaining = 0;
    g->barrels_exploded = 0;
    g->total_bounces = 0;

    // 重置特工主角
    g->agent.x = BB_AGENT_X;
    g->agent.y = BB_AGENT_Y;
    g->agent.gun_x = BB_AGENT_X;
    g->agent.gun_y = BB_AGENT_Y + BB_AGENT_GUN_OFFSET_Y;
    g->agent.head_x = BB_AGENT_X;
    g->agent.head_y = BB_AGENT_Y + BB_AGENT_HEAD_OFFSET_Y;
    g->agent.head_radius = BB_AGENT_HEAD_RADIUS;
    g->agent.sunglasses_on = true;
    g->agent.is_dizzy = false;
    g->agent.dizzy_timer_ms = 0;

    // 清空对象池
    memset(g->bullets, 0, sizeof(g->bullets));
    memset(g->obstacles, 0, sizeof(g->obstacles));
    memset(g->targets, 0, sizeof(g->targets));
    memset(g->barrels, 0, sizeof(g->barrels));
    memset(g->particles, 0, sizeof(g->particles));
    g->sound_head = 0;
    g->sound_tail = 0;

    switch (level) {
        case 1: {
            // Level 1: "折射入门" (Ceiling Ricochet 101)
            // 敌人躲在正中央正前方钢板后面，正射被挡，通过天花板反弹绕后击毙
            g->obstacles[0].active = true;
            g->obstacles[0].type = BB_OBS_WALL;
            g->obstacles[0].x = 70.0f;
            g->obstacles[0].y = 150.0f;
            g->obstacles[0].w = 100.0f;
            g->obstacles[0].h = 14.0f;

            g->targets[0].active = true;
            g->targets[0].alive = true;
            g->targets[0].x = 120.0f;
            g->targets[0].y = 80.0f;
            g->targets[0].radius = 10.0f;
            g->targets[0].has_shield = false;
            g->targets[0].score_value = 500;
            g->targets_remaining = 1;
            break;
        }

        case 2: {
            // Level 2: "掩体盲区与防弹盾" (Behind The Shield)
            // 敌人手持防弹盾正对下方 (shield_ny = 1.0f)，从正面射击反弹无伤
            // 必须射向侧壁与天花板，由上方绕后切入击杀
            g->targets[0].active = true;
            g->targets[0].alive = true;
            g->targets[0].x = 180.0f;
            g->targets[0].y = 90.0f;
            g->targets[0].radius = 11.0f;
            g->targets[0].has_shield = true;
            g->targets[0].shield_nx = -0.5f;
            g->targets[0].shield_ny = 0.866f; // 正面朝向左下方
            g->targets[0].shield_angle_span = 70.0f; // 140° 防护扇区
            g->targets[0].score_value = 600;
            g->targets_remaining = 1;

            // 侧翼反射钢板
            g->obstacles[0].active = true;
            g->obstacles[0].type = BB_OBS_WALL;
            g->obstacles[0].x = 20.0f;
            g->obstacles[0].y = 100.0f;
            g->obstacles[0].w = 12.0f;
            g->obstacles[0].h = 80.0f;
            break;
        }

        case 3: {
            // Level 3: "斜面棱镜转折射" (Prism 45° Deflection)
            // 场中放置 45° 斜面棱镜，水平射入后 90° 直角变轨直冲深处目标
            g->obstacles[0].active = true;
            g->obstacles[0].type = BB_OBS_PRISM_45_SLASH;
            g->obstacles[0].x = 160.0f;
            g->obstacles[0].y = 70.0f;
            g->obstacles[0].w = 40.0f;
            g->obstacles[0].h = 40.0f;

            // 深处掩体内部敌人
            g->targets[0].active = true;
            g->targets[0].alive = true;
            g->targets[0].x = 60.0f;
            g->targets[0].y = 50.0f;
            g->targets[0].radius = 10.0f;
            g->targets[0].has_shield = false;
            g->targets[0].score_value = 700;
            g->targets_remaining = 1;
            break;
        }

        case 4: {
            // Level 4: "炸药桶连锁轰鸣" (Barrel Chain Boom)
            // 敌人躲在厚墙掩体后，外侧有一连串炸药桶引燃连锁反应消灭目标
            g->obstacles[0].active = true;
            g->obstacles[0].type = BB_OBS_WALL;
            g->obstacles[0].x = 50.0f;
            g->obstacles[0].y = 90.0f;
            g->obstacles[0].w = 140.0f;
            g->obstacles[0].h = 16.0f;

            // 炸药桶 A (可被反弹命中)
            g->barrels[0].active = true;
            g->barrels[0].exploded = false;
            g->barrels[0].x = 40.0f;
            g->barrels[0].y = 130.0f;
            g->barrels[0].radius = 8.5f;
            g->barrels[0].blast_radius = 55.0f;

            // 炸药桶 B (受 A 波及连环引爆)
            g->barrels[1].active = true;
            g->barrels[1].exploded = false;
            g->barrels[1].x = 75.0f;
            g->barrels[1].y = 100.0f;
            g->barrels[1].radius = 8.5f;
            g->barrels[1].blast_radius = 55.0f;

            // 炸药桶 C (受 B 波及连环引爆，覆盖敌人1)
            g->barrels[2].active = true;
            g->barrels[2].exploded = false;
            g->barrels[2].x = 115.0f;
            g->barrels[2].y = 85.0f;
            g->barrels[2].radius = 8.5f;
            g->barrels[2].blast_radius = 55.0f;

            // 掩体内部敌人
            g->targets[0].active = true;
            g->targets[0].alive = true;
            g->targets[0].x = 90.0f;
            g->targets[0].y = 60.0f;
            g->targets[0].radius = 10.0f;
            g->targets[0].has_shield = false;
            g->targets[0].score_value = 800;

            g->targets[1].active = true;
            g->targets[1].alive = true;
            g->targets[1].x = 135.0f;
            g->targets[1].y = 60.0f;
            g->targets[1].radius = 10.0f;
            g->targets[1].has_shield = false;
            g->targets[1].score_value = 800;
            g->targets_remaining = 2;
            break;
        }

        case 5: {
            // Level 5: "几何大师与危险自伤" (Grand Ricochet & Agent Risk)
            // 包含双重斜面棱镜、可破坏掩体、炸药桶与防弹盾双敌人
            g->obstacles[0].active = true;
            g->obstacles[0].type = BB_OBS_PRISM_45_BACKSLASH;
            g->obstacles[0].x = 30.0f;
            g->obstacles[0].y = 90.0f;
            g->obstacles[0].w = 35.0f;
            g->obstacles[0].h = 35.0f;

            g->obstacles[1].active = true;
            g->obstacles[1].type = BB_OBS_DESTRUCTIBLE_BLOCK;
            g->obstacles[1].x = 140.0f;
            g->obstacles[1].y = 120.0f;
            g->obstacles[1].w = 60.0f;
            g->obstacles[1].h = 16.0f;

            g->barrels[0].active = true;
            g->barrels[0].exploded = false;
            g->barrels[0].x = 170.0f;
            g->barrels[0].y = 145.0f;
            g->barrels[0].radius = 9.0f;
            g->barrels[0].blast_radius = 65.0f;

            g->targets[0].active = true;
            g->targets[0].alive = true;
            g->targets[0].x = 170.0f;
            g->targets[0].y = 70.0f;
            g->targets[0].radius = 10.0f;
            g->targets[0].has_shield = true;
            g->targets[0].shield_nx = 0.0f;
            g->targets[0].shield_ny = 1.0f; // 正面朝下防弹
            g->targets[0].shield_angle_span = 75.0f;
            g->targets[0].score_value = 1000;
            g->targets_remaining = 1;
            break;
        }

        default:
            return false;
    }

    return true;
}

void bouncy_game_init(bouncy_game_t *g, uint32_t seed)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));
    g->rng_state = (seed != 0) ? seed : 0xACE1ACE1u;
    g->score = 0;
    g->self_hits = 0;
    bouncy_load_level(g, 1);
}

void bouncy_game_reset(bouncy_game_t *g)
{
    if (!g) return;
    bouncy_load_level(g, g->current_level);
}

void bouncy_input_aim_up(bouncy_game_t *g)
{
    if (!g || g->state != BB_STATE_AIMING) return;
    g->aim_angle_deg += BB_AIM_STEP_DEG;
    if (g->aim_angle_deg > BB_AIM_MAX_DEG) {
        g->aim_angle_deg = BB_AIM_MAX_DEG;
    }
}

void bouncy_input_aim_down(bouncy_game_t *g)
{
    if (!g || g->state != BB_STATE_AIMING) return;
    g->aim_angle_deg -= BB_AIM_STEP_DEG;
    if (g->aim_angle_deg < BB_AIM_MIN_DEG) {
        g->aim_angle_deg = BB_AIM_MIN_DEG;
    }
}

bool bouncy_input_shoot(bouncy_game_t *g)
{
    if (!g || g->state != BB_STATE_AIMING) return false;
    if (g->ammo_remaining <= 0) return false;

    // 寻找空闲子弹槽位
    bouncy_bullet_t *bullet = NULL;
    for (int i = 0; i < BB_MAX_BULLETS; i++) {
        if (!g->bullets[i].active) {
            bullet = &g->bullets[i];
            break;
        }
    }
    if (!bullet) return false;

    g->ammo_remaining--;
    g->state = BB_STATE_FIRING;

    float rad = g->aim_angle_deg * (float)M_PI / 180.0f;
    bullet->active = true;
    bullet->x = g->agent.gun_x;
    bullet->y = g->agent.gun_y;
    bullet->vx = cosf(rad) * BB_BULLET_SPEED;
    bullet->vy = -sinf(rad) * BB_BULLET_SPEED;
    bullet->radius = BB_BULLET_RADIUS;
    bullet->bounce_count = 0;
    bullet->total_distance = 0.0f;

    bb_push_sound(g, BB_SND_SHOOT);
    return true;
}

void bouncy_game_pause(bouncy_game_t *g)
{
    if (g && g->state != BB_STATE_PAUSED) {
        g->state = BB_STATE_PAUSED;
    }
}

void bouncy_game_resume(bouncy_game_t *g)
{
    if (g && g->state == BB_STATE_PAUSED) {
        if (bouncy_get_active_bullet_count(g) > 0) {
            g->state = BB_STATE_FIRING;
        } else {
            g->state = BB_STATE_AIMING;
        }
    }
}

// 物理单步更新
void bouncy_game_step(bouncy_game_t *g, uint32_t dt_ms)
{
    if (!g || g->state == BB_STATE_PAUSED || dt_ms == 0) return;

    g->game_time_ms += dt_ms;
    float dt_sec = (float)dt_ms / 1000.0f;

    // 1. 特工眩晕倒计时
    if (g->agent.is_dizzy) {
        if (dt_ms >= g->agent.dizzy_timer_ms) {
            g->agent.dizzy_timer_ms = 0;
            g->agent.is_dizzy = false;
        } else {
            g->agent.dizzy_timer_ms -= dt_ms;
        }
    }

    // 2. 粒子物理与生命周期更新
    for (int i = 0; i < BB_MAX_PARTICLES; i++) {
        bouncy_particle_t *p = &g->particles[i];
        if (!p->active) continue;

        if (p->type == BB_PART_SUNGLASSES) {
            // 墨镜重力加速度
            p->vy += 450.0f * dt_sec;
        }

        p->x += p->vx * dt_sec;
        p->y += p->vy * dt_sec;
        p->rotation_deg += p->rot_speed * dt_sec;

        // 墨镜落地反弹
        if (p->type == BB_PART_SUNGLASSES && p->y > BB_AGENT_Y + 15.0f && p->vy > 0.0f) {
            p->y = BB_AGENT_Y + 15.0f;
            p->vy = -p->vy * 0.45f;
            p->vx *= 0.6f;
        }

        if ((float)dt_ms >= p->life_ms) {
            p->active = false;
        } else {
            p->life_ms -= (float)dt_ms;
        }
    }

    // 3. 子弹物理更新 (支持高速连续碰撞 CCD 细分步长)
    if (g->state == BB_STATE_FIRING) {
        for (int b = 0; b < BB_MAX_BULLETS; b++) {
            bouncy_bullet_t *bullet = &g->bullets[b];
            if (!bullet->active) continue;

            float move_dist = sqrtf(bullet->vx * bullet->vx + bullet->vy * bullet->vy) * dt_sec;
            float remaining_dist = move_dist;
            float max_substep = 3.0f; // 细分步长，防止穿墙

            while (remaining_dist > 0.0f && bullet->active) {
                float step = (remaining_dist < max_substep) ? remaining_dist : max_substep;
                remaining_dist -= step;

                float spd = sqrtf(bullet->vx * bullet->vx + bullet->vy * bullet->vy);
                if (spd < 1e-4f) {
                    bullet->active = false;
                    break;
                }
                float dir_x = bullet->vx / spd;
                float dir_y = bullet->vy / spd;

                bool allow_self_hit = (bullet->bounce_count >= 1);
                ray_hit_t hit = bb_raycast_scene(g, bullet->x, bullet->y, dir_x, dir_y, allow_self_hit);

                if (hit.hit && hit.t <= step) {
                    // 发生了碰撞
                    bullet->x = hit.hx;
                    bullet->y = hit.hy;
                    bullet->total_distance += hit.t;

                    if (hit.obj_kind == 2 && !hit.is_shield_hit) {
                        // 命中目标敌人无盾部位：击毙！
                        bouncy_target_t *tgt = &g->targets[hit.obj_index];
                        tgt->alive = false;
                        g->targets_remaining--;
                        g->score += tgt->score_value;
                        bb_push_sound(g, BB_SND_TARGET_DESTROY);

                        for (int p = 0; p < 8; p++) {
                            float ang = bb_rand_range(&g->rng_state, 0.0f, (float)M_PI * 2.0f);
                            float pspd = bb_rand_range(&g->rng_state, 60.0f, 180.0f);
                            bb_spawn_particle(g, BB_PART_TARGET_SHARD, tgt->x, tgt->y,
                                              cosf(ang) * pspd, sinf(ang) * pspd, 350.0f, 0.0f, 0);
                        }
                    } else if (hit.obj_kind == 3) {
                        // 命中炸药桶：引爆！
                        bb_explode_barrel(g, hit.obj_index);
                    } else if (hit.obj_kind == 4) {
                        // 搞笑自伤：弹回特工头部击飞墨镜！
                        bb_trigger_self_harm(g);
                        bullet->active = false;
                        break;
                    } else {
                        // 撞到墙壁、刚体障碍物或防弹盾正面：反弹！
                        bullet->bounce_count++;
                        g->total_bounces++;

                        // 镜面反射
                        float dot = vec_dot(dir_x, dir_y, hit.nx, hit.ny);
                        float rx = dir_x - 2.0f * dot * hit.nx;
                        float ry = dir_y - 2.0f * dot * hit.ny;

                        // 弹性速度衰减
                        float new_spd = spd * BB_BOUNCE_RESTITUTION;
                        bullet->vx = rx * new_spd;
                        bullet->vy = ry * new_spd;

                        // 微移避免穿透重叠
                        bullet->x += rx * 0.15f;
                        bullet->y += ry * 0.15f;

                        // 迸发亮黄火星
                        bb_spawn_spark_burst(g, hit.hx, hit.hy, hit.nx, hit.ny, 6);

                        // 音效判定：击中盾牌或按反弹次数加速升调
                        if (hit.is_shield_hit) {
                            bb_push_sound(g, BB_SND_SHIELD_RICOCHET);
                        } else {
                            if (bullet->bounce_count <= 2) {
                                bb_push_sound(g, BB_SND_BOUNCE_PITCH_1);
                            } else if (bullet->bounce_count <= 4) {
                                bb_push_sound(g, BB_SND_BOUNCE_PITCH_2);
                            } else if (bullet->bounce_count <= 6) {
                                bb_push_sound(g, BB_SND_BOUNCE_PITCH_3);
                            } else if (bullet->bounce_count <= 8) {
                                bb_push_sound(g, BB_SND_BOUNCE_PITCH_4);
                            } else {
                                bb_push_sound(g, BB_SND_BOUNCE_PITCH_5);
                            }
                        }

                        // 超过最大反弹次数时消散
                        if (bullet->bounce_count >= BB_MAX_BOUNCES) {
                            bullet->active = false;
                            bb_spawn_particle(g, BB_PART_SMOKE, bullet->x, bullet->y, 0.0f, -20.0f, 300.0f, 0.0f, 3);
                            break;
                        }
                    }
                } else {
                    // 无碰撞推进
                    bullet->x += dir_x * step;
                    bullet->y += dir_y * step;
                    bullet->total_distance += step;
                }

                // 底部出界检查
                if (bullet->y > BB_SCREEN_H + 20.0f || bullet->y < -20.0f) {
                    bullet->active = false;
                    break;
                }
            }
        }

        // 4. 胜负判定 (当场上所有子弹反弹停歇或消散后进行状态裁决)
        if (bouncy_get_active_bullet_count(g) == 0) {
            if (g->targets_remaining <= 0) {
                // 全场敌人肃清：过关胜利！
                g->state = BB_STATE_LEVEL_CLEAR;
                // 剩余弹药转化为星级
                if (g->ammo_remaining >= 2) {
                    g->stars_earned = 3;
                    bb_push_sound(g, BB_SND_CLEAR_3STAR);
                } else if (g->ammo_remaining == 1) {
                    g->stars_earned = 2;
                    bb_push_sound(g, BB_SND_CLEAR_2STAR);
                } else {
                    g->stars_earned = 1;
                    bb_push_sound(g, BB_SND_CLEAR_1STAR);
                }
                g->score += g->stars_earned * 1000;
            } else if (g->ammo_remaining > 0) {
                // 回到瞄准状态继续发射下一颗
                g->state = BB_STATE_AIMING;
            } else {
                // 弹药耗尽且目标仍未消灭：游戏失败
                g->state = BB_STATE_GAME_OVER;
                bb_push_sound(g, BB_SND_DEFEAT);
            }
        }
    }
}

// 查询状态辅助接口
bool bouncy_is_aiming(const bouncy_game_t *g)
{
    return g && (g->state == BB_STATE_AIMING);
}

bool bouncy_is_firing(const bouncy_game_t *g)
{
    return g && (g->state == BB_STATE_FIRING);
}

bool bouncy_is_level_clear(const bouncy_game_t *g)
{
    return g && (g->state == BB_STATE_LEVEL_CLEAR);
}

bool bouncy_is_game_over(const bouncy_game_t *g)
{
    return g && (g->state == BB_STATE_GAME_OVER);
}

bool bouncy_is_paused(const bouncy_game_t *g)
{
    return g && (g->state == BB_STATE_PAUSED);
}

int bouncy_get_active_bullet_count(const bouncy_game_t *g)
{
    if (!g) return 0;
    int c = 0;
    for (int i = 0; i < BB_MAX_BULLETS; i++) {
        if (g->bullets[i].active) c++;
    }
    return c;
}

int bouncy_get_active_particle_count(const bouncy_game_t *g)
{
    if (!g) return 0;
    int c = 0;
    for (int i = 0; i < BB_MAX_PARTICLES; i++) {
        if (g->particles[i].active) c++;
    }
    return c;
}

int bouncy_get_remaining_targets(const bouncy_game_t *g)
{
    return g ? g->targets_remaining : 0;
}
