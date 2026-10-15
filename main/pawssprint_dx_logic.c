// main/pawssprint_dx_logic.c —— 《短腿爪爪运动会·进化版》(Paws Sprint DX) 纯 C 状态机算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 打造。
// 纯 C11 编写，零动态堆内存分配 (Zero malloc/free)，无外部框架依赖。
#include "pawssprint_dx_logic.h"
#include <string.h>

// 车道物理中线常数
static const float s_lane_centers[PSDX_LANE_COUNT] = {
    PSDX_LANE_0_X, // 50.0f
    PSDX_LANE_1_X, // 120.0f
    PSDX_LANE_2_X  // 190.0f
};

// 伪随机数发生器 (自举线性同余 LCG 算法，无标准库依赖)
static uint32_t psdx_lcg_rand(psdx_game_t *g)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return g->rng_state;
}

static float psdx_lcg_randf(psdx_game_t *g, float min_val, float max_val)
{
    uint32_t r = psdx_lcg_rand(g);
    float norm = (float)(r & 0xFFFF) / 65535.0f;
    return min_val + norm * (max_val - min_val);
}

// ============================================================================
// 车道几何工具函数
// ============================================================================
float psdx_get_lane_center_x(int lane)
{
    if (lane < 0) {
        lane = 0;
    }
    if (lane >= PSDX_LANE_COUNT) {
        lane = PSDX_LANE_COUNT - 1;
    }
    return s_lane_centers[lane];
}

// ============================================================================
// 音效环形队列管理 (无锁并发与高效安全弹出)
// ============================================================================
void psdx_sound_push(psdx_game_t *g, psdx_sound_t snd)
{
    if (snd == PSDX_SND_NONE || g == NULL) {
        return;
    }
    if (g->sound_queue.count >= PSDX_MAX_SOUND_QUEUE) {
        // 队列满则安全覆盖最老事件，确保高燃音效不丢失
        g->sound_queue.head = (g->sound_queue.head + 1) % PSDX_MAX_SOUND_QUEUE;
        g->sound_queue.count--;
    }
    g->sound_queue.events[g->sound_queue.tail] = snd;
    g->sound_queue.tail = (g->sound_queue.tail + 1) % PSDX_MAX_SOUND_QUEUE;
    g->sound_queue.count++;
}

psdx_sound_t psdx_sound_pop(psdx_game_t *g)
{
    if (g == NULL || g->sound_queue.count == 0) {
        return PSDX_SND_NONE;
    }
    psdx_sound_t snd = g->sound_queue.events[g->sound_queue.head];
    g->sound_queue.head = (g->sound_queue.head + 1) % PSDX_MAX_SOUND_QUEUE;
    g->sound_queue.count--;
    return snd;
}

bool psdx_sound_has_events(const psdx_game_t *g)
{
    return (g != NULL && g->sound_queue.count > 0);
}

// ============================================================================
// 粒子池管理 (零 malloc，槽位重用与衰减回收)
// ============================================================================
psdx_particle_t *psdx_spawn_particle(psdx_game_t *g, psdx_part_type_t type,
                                     float x, float y, float vx, float vy,
                                     float size, uint32_t life_ms)
{
    if (g == NULL || type == PSDX_PART_NONE) {
        return NULL;
    }

    int chosen_slot = -1;
    uint32_t oldest_life = 0;

    // 优先寻找空闲槽位；若满则查找寿命最长者覆盖
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) {
            chosen_slot = i;
            break;
        }
        if (g->particles[i].life_ms > oldest_life) {
            oldest_life = g->particles[i].life_ms;
            chosen_slot = i;
        }
    }

    if (chosen_slot < 0) {
        chosen_slot = 0;
    }

    psdx_particle_t *p = &g->particles[chosen_slot];
    p->active = true;
    p->type = type;
    p->x = x;
    p->y = y;
    p->vx = vx;
    p->vy = vy;
    p->size = size;
    p->rotation_deg = 0.0f;
    p->rot_speed = psdx_lcg_randf(g, -180.0f, 180.0f);
    p->life_ms = 0;
    p->max_life_ms = (life_ms > 0) ? life_ms : 400;
    return p;
}

void psdx_clear_all_particles(psdx_game_t *g)
{
    if (g == NULL) return;
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        g->particles[i].active = false;
    }
}

int psdx_get_active_particle_count(const psdx_game_t *g)
{
    if (g == NULL) return 0;
    int count = 0;
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        if (g->particles[i].active) {
            count++;
        }
    }
    return count;
}

// ============================================================================
// 赛道物件池管理
// ============================================================================
psdx_object_t *psdx_spawn_object(psdx_game_t *g, psdx_object_type_t type, int lane, float y)
{
    if (g == NULL || type == PSDX_OBJ_NONE) {
        return NULL;
    }

    if (lane < 0) lane = 0;
    if (lane >= PSDX_LANE_COUNT) lane = PSDX_LANE_COUNT - 1;

    int slot = -1;
    for (int i = 0; i < PSDX_MAX_TRACK_OBJECTS; i++) {
        if (!g->objects[i].active) {
            slot = i;
            break;
        }
    }

    if (slot < 0) {
        return NULL; // 池满
    }

    psdx_object_t *obj = &g->objects[slot];
    obj->active = true;
    obj->type = type;
    obj->lane = lane;
    obj->x = psdx_get_lane_center_x(lane);
    obj->y = y;
    obj->collected = false;
    obj->smashed = false;

    // 默认各类物件物理碰撞盒大小
    switch (type) {
    case PSDX_OBJ_HURDLE:
        obj->w = 46.0f;
        obj->h = 16.0f;
        break;
    case PSDX_OBJ_MUD:
        obj->w = 42.0f;
        obj->h = 24.0f;
        break;
    case PSDX_OBJ_BANANA:
        obj->w = 24.0f;
        obj->h = 24.0f;
        break;
    case PSDX_OBJ_BONE:
        obj->w = 24.0f;
        obj->h = 20.0f;
        break;
    case PSDX_OBJ_COIN:
        obj->w = 22.0f;
        obj->h = 22.0f;
        break;
    case PSDX_OBJ_CUSHION:
        obj->w = 190.0f; // 终点大抱枕横跨全道
        obj->h = 60.0f;
        obj->x = psdx_get_lane_center_x(1); // 居中于 Lane 1
        break;
    default:
        obj->w = 24.0f;
        obj->h = 24.0f;
        break;
    }

    return obj;
}

void psdx_clear_all_objects(psdx_game_t *g)
{
    if (g == NULL) return;
    for (int i = 0; i < PSDX_MAX_TRACK_OBJECTS; i++) {
        g->objects[i].active = false;
    }
}

int psdx_get_active_object_count(const psdx_game_t *g)
{
    if (g == NULL) return 0;
    int count = 0;
    for (int i = 0; i < PSDX_MAX_TRACK_OBJECTS; i++) {
        if (g->objects[i].active) {
            count++;
        }
    }
    return count;
}

// ============================================================================
// 游戏初始化、重置与角色控制
// ============================================================================
void psdx_game_init(psdx_game_t *g, uint32_t seed)
{
    if (g == NULL) return;
    memset(g, 0, sizeof(psdx_game_t));

    g->state = PSDX_STATE_RUNNING;
    g->rng_state = (seed != 0) ? seed : 0x20260919u;
    g->track_length = PSDX_DEFAULT_TRACK_LENGTH;
    g->next_spawn_distance = 180.0f;
    g->cushion_spawned = false;
    g->current_speed = PSDX_SPEED_NORMAL;

    // 玩家默认状态 (初始居中 Lane 1: X=120)
    g->player.char_type = PSDX_CHAR_CORGI;
    g->player.current_lane = 1;
    g->player.target_lane = 1;
    g->player.x = PSDX_LANE_1_X;
    g->player.y = PSDX_PLAYER_BASE_Y;
    g->player.is_switching_lane = false;

    g->player.jump_z = 0.0f;
    g->player.jump_vz = 0.0f;
    g->player.is_jumping = false;

    g->player.is_turbo = false;
    g->player.turbo_timer_ms = 0;
    g->player.ok_press_duration = 0;
    g->player.last_ok_press_time = 0;
    g->player.ok_is_down = false;

    g->player.is_spinning = false;
    g->player.spin_timer_ms = 0;
    g->player.spin_angle_deg = 0.0f;

    g->player.blink_state = PSDX_BLINK_OPEN;
    g->player.blink_timer_ms = 2800;
    g->player.tongue_state = PSDX_TONGUE_PANT;
    g->player.tongue_offset_x = 0.0f;
    g->player.ear_bounce_y = 0.0f;
    g->player.paw_phase = 0.0f;
    g->player.paw_step_count = 0;

    g->player.is_cushion_diving = false;
    g->player.cushion_dive_scale = 1.0f;

    psdx_clear_all_objects(g);
    psdx_clear_all_particles(g);
}

void psdx_game_reset(psdx_game_t *g)
{
    if (g == NULL) return;
    psdx_char_type_t saved_char = g->player.char_type;
    uint32_t saved_rng = g->rng_state;
    float saved_track_len = g->track_length;

    psdx_game_init(g, saved_rng);
    g->player.char_type = saved_char;
    g->track_length = saved_track_len;
}

void psdx_game_set_character(psdx_game_t *g, psdx_char_type_t char_type)
{
    if (g != NULL) {
        g->player.char_type = char_type;
    }
}

void psdx_game_set_track_length(psdx_game_t *g, float length_px)
{
    if (g != NULL && length_px > 300.0f) {
        g->track_length = length_px;
    }
}

void psdx_game_pause(psdx_game_t *g)
{
    if (g != NULL && g->state == PSDX_STATE_RUNNING) {
        g->state = PSDX_STATE_PAUSED;
    }
}

void psdx_game_resume(psdx_game_t *g)
{
    if (g != NULL && g->state == PSDX_STATE_PAUSED) {
        g->state = PSDX_STATE_RUNNING;
    }
}

bool psdx_game_is_running(const psdx_game_t *g)
{
    return (g != NULL && g->state == PSDX_STATE_RUNNING);
}

bool psdx_game_is_victory(const psdx_game_t *g)
{
    return (g != NULL && g->state == PSDX_STATE_VICTORY);
}

// ============================================================================
// 输入处理 (UP/DOWN 精准单车道切道与边界阻拦，OK 短按起跳与长按/双击涡轮狂蹬)
// ============================================================================
void psdx_input_up(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    // UP 键向上/左切一条车道：稳固只减 1，绝对不连跳，Lane 0 处边界严密阻拦
    if (g->player.target_lane > 0) {
        g->player.target_lane--;
        g->player.is_switching_lane = true;
        psdx_sound_push(g, PSDX_SND_LANE_SWITCH);
    }
}

void psdx_input_down(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    // DOWN 键向下/右切一条车道：稳固只加 1，绝对不连跳，Lane 2 处边界严密阻拦
    if (g->player.target_lane < PSDX_LANE_COUNT - 1) {
        g->player.target_lane++;
        g->player.is_switching_lane = true;
        psdx_sound_push(g, PSDX_SND_LANE_SWITCH);
    }
}

void psdx_input_set_lane(psdx_game_t *g, int lane)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    if (lane < 0) lane = 0;
    if (lane >= PSDX_LANE_COUNT) lane = PSDX_LANE_COUNT - 1;
    if (g->player.target_lane != lane) {
        g->player.target_lane = lane;
        g->player.is_switching_lane = true;
        psdx_sound_push(g, PSDX_SND_LANE_SWITCH);
    }
}

void psdx_trigger_jump(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    // 旋转或大抱枕飞扑中禁止起跳；地面状态起跳
    if (!g->player.is_jumping && !g->player.is_spinning && !g->player.is_cushion_diving) {
        g->player.is_jumping = true;
        g->player.jump_z = 0.0f;
        g->player.jump_vz = PSDX_JUMP_INITIAL_VZ;
        psdx_sound_push(g, PSDX_SND_JUMP);
    }
}

void psdx_trigger_turbo(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    if (!g->player.is_cushion_diving) {
        g->player.is_turbo = true;
        g->player.turbo_timer_ms = PSDX_TURBO_DURATION_MS;
        g->player.tongue_state = PSDX_TONGUE_HAPPY;
        psdx_sound_push(g, PSDX_SND_TURBO_START);

        // 启动瞬间爆出一圈加速星芒粒子
        for (int i = 0; i < 6; i++) {
            float ang = (float)i * (6.2831853f / 6.0f);
            psdx_spawn_particle(g, PSDX_PART_TURBO_SPARK,
                                g->player.x, g->player.y + 8.0f,
                                cosf(ang) * 50.0f, sinf(ang) * 40.0f + 20.0f,
                                3.5f, 320);
        }
    }
}

void psdx_input_ok_down(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    g->player.ok_is_down = true;

    // 双击快速连按检测判定
    uint32_t now = g->game_time_ms;
    if (g->player.last_ok_press_time > 0 &&
        (now - g->player.last_ok_press_time) <= PSDX_TURBO_DOUBLE_TAP_MS) {
        psdx_trigger_turbo(g);
        g->player.last_ok_press_time = 0;
        g->player.ok_press_duration = 0;
    } else {
        g->player.last_ok_press_time = now;
        g->player.ok_press_duration = 0;
    }
}

void psdx_input_ok_up(psdx_game_t *g)
{
    if (g == NULL || g->state != PSDX_STATE_RUNNING) {
        return;
    }
    if (g->player.ok_is_down) {
        g->player.ok_is_down = false;
        // 若在长按阈值内松手且未处于 Turbo 状态，则判定为轻盈短按起跳
        if (!g->player.is_turbo && g->player.ok_press_duration < PSDX_TURBO_HOLD_MS) {
            psdx_trigger_jump(g);
        }
        g->player.ok_press_duration = 0;
    }
}

// ============================================================================
// 游戏主状态机步进 (Game Step)
// ============================================================================
void psdx_game_step(psdx_game_t *g, uint32_t dt_ms)
{
    if (g == NULL || g->state == PSDX_STATE_PAUSED || g->state == PSDX_STATE_GAMEOVER) {
        return;
    }

    float dt_sec = (float)dt_ms / 1000.0f;
    g->game_time_ms += dt_ms;

    // 1. OK 键长按持续计时 (长按达到阈值立即自动激活涡轮狂蹬)
    if (g->player.ok_is_down && !g->player.is_turbo && g->state == PSDX_STATE_RUNNING) {
        g->player.ok_press_duration += dt_ms;
        if (g->player.ok_press_duration >= PSDX_TURBO_HOLD_MS) {
            psdx_trigger_turbo(g);
            g->player.ok_press_duration = 0;
        }
    }

    // 2. 车道平滑移动与强力居中中线吸附 (绝对零跑偏)
    float target_x = psdx_get_lane_center_x(g->player.target_lane);
    float dx = target_x - g->player.x;
    if (fabsf(dx) > 0.0001f) {
        g->player.is_switching_lane = true;
        float move_step = PSDX_LANE_SWITCH_SPEED * dt_sec;
        if (fabsf(dx) <= move_step || fabsf(dx) <= PSDX_SNAP_TOLERANCE) {
            g->player.x = target_x;
            g->player.current_lane = g->player.target_lane;
            g->player.is_switching_lane = false;
        } else {
            g->player.x += (dx > 0.0f ? move_step : -move_step);
        }
    } else {
        g->player.x = target_x;
        g->player.current_lane = g->player.target_lane;
        g->player.is_switching_lane = false;
    }

    // 3. 跳跃 Z 轴物理演进
    if (g->player.is_jumping) {
        g->player.jump_z += g->player.jump_vz * dt_sec;
        g->player.jump_vz -= PSDX_GRAVITY * dt_sec;
        if (g->player.jump_z <= 0.0f) {
            g->player.jump_z = 0.0f;
            g->player.jump_vz = 0.0f;
            g->player.is_jumping = false;
            psdx_sound_push(g, PSDX_SND_LAND);
        }
    }

    // 4. 小短腿涡轮狂蹬 (Turbo Paw Dash) 计时与尾焰粒子
    if (g->player.is_turbo) {
        if (g->player.turbo_timer_ms > dt_ms) {
            g->player.turbo_timer_ms -= dt_ms;
        } else {
            g->player.turbo_timer_ms = 0;
            g->player.is_turbo = false;
        }

        // 狂蹬冲刺尾焰星火
        if ((g->game_time_ms % 60) < dt_ms) {
            psdx_spawn_particle(g, PSDX_PART_TURBO_SPARK,
                                g->player.x + psdx_lcg_randf(g, -10.0f, 10.0f),
                                g->player.y + 12.0f,
                                psdx_lcg_randf(g, -24.0f, 24.0f),
                                psdx_lcg_randf(g, 60.0f, 150.0f),
                                psdx_lcg_randf(g, 2.5f, 4.5f),
                                280);
        }
    }

    // 5. 踩香蕉皮 360° 滑稽原地旋转舞步演进
    if (g->player.is_spinning) {
        if (g->player.spin_timer_ms > dt_ms) {
            g->player.spin_timer_ms -= dt_ms;
            float progress = 1.0f - (float)g->player.spin_timer_ms / (float)PSDX_BANANA_SPIN_MS;
            g->player.spin_angle_deg = progress * PSDX_BANANA_ROTATION_DEG;
        } else {
            g->player.spin_timer_ms = 0;
            g->player.spin_angle_deg = 0.0f;
            g->player.is_spinning = false;
        }
    }

    // 6. 当前卷动速度计算
    if (g->state == PSDX_STATE_VICTORY) {
        g->current_speed = 0.0f;
    } else if (g->player.is_spinning) {
        g->current_speed = PSDX_SPEED_SPIN; // 原地旋转打转时慢速前滑
    } else if (g->player.is_turbo) {
        g->current_speed = PSDX_SPEED_TURBO; // 双倍极速
    } else {
        g->current_speed = PSDX_SPEED_NORMAL; // 常态巡航速度
    }

    // 7. 里程与正面 45° 萌宠微表情更新
    if (g->state == PSDX_STATE_RUNNING) {
        float dist_delta = g->current_speed * dt_sec;
        g->distance_traveled += dist_delta;

        // 肉垫步伐频率与相位更新
        float step_rate = g->current_speed / 24.0f;
        float old_phase = g->player.paw_phase;
        g->player.paw_phase += step_rate * dt_sec;
        if (g->player.paw_phase >= 6.2831853f) {
            g->player.paw_phase -= 6.2831853f;
        }

        // 交替踏地生成小爪印
        if ((old_phase < 3.1415926f && g->player.paw_phase >= 3.1415926f) ||
            (old_phase > 4.7f && g->player.paw_phase < 1.6f)) {
            g->player.paw_step_count++;
            float paw_side = (g->player.paw_step_count % 2 == 0) ? -8.0f : 8.0f;
            psdx_spawn_particle(g, PSDX_PART_PAW_PRINT,
                                g->player.x + paw_side, g->player.y + 14.0f,
                                0.0f, g->current_speed * 0.2f, 3.2f, 400);
            if ((g->player.paw_step_count % 4) == 0 && !g->player.is_jumping) {
                psdx_sound_push(g, PSDX_SND_STEP);
            }
        }

        // 耳朵上下扑棱与吐舌头哈气微摆
        float ear_amp = (g->player.is_turbo ? 5.0f : 3.0f);
        g->player.ear_bounce_y = sinf(g->player.paw_phase * 2.0f) * ear_amp;
        g->player.tongue_offset_x = sinf(g->player.paw_phase) * 2.2f;

        if (g->player.is_spinning) {
            g->player.tongue_state = PSDX_TONGUE_IN;
        } else if (g->player.is_turbo) {
            g->player.tongue_state = PSDX_TONGUE_HAPPY;
        } else {
            g->player.tongue_state = PSDX_TONGUE_PANT;
        }

        // 眨眼微表情倒计时
        if (g->player.blink_timer_ms > dt_ms) {
            g->player.blink_timer_ms -= dt_ms;
            if (g->player.blink_timer_ms < 40) {
                g->player.blink_state = PSDX_BLINK_HALF;
            } else if (g->player.blink_timer_ms < 120) {
                g->player.blink_state = PSDX_BLINK_CLOSED;
            } else if (g->player.blink_timer_ms < PSDX_BLINK_DURATION_MS) {
                g->player.blink_state = PSDX_BLINK_HALF;
            } else {
                g->player.blink_state = PSDX_BLINK_OPEN;
            }
        } else {
            g->player.blink_state = PSDX_BLINK_OPEN;
            g->player.blink_timer_ms = (uint32_t)psdx_lcg_randf(g, PSDX_BLINK_INTERVAL_MIN_MS,
                                                                 PSDX_BLINK_INTERVAL_MAX_MS);
        }

        // 8. 赛道程序化物件生成
        if (g->distance_traveled < g->track_length - 280.0f) {
            if (g->distance_traveled >= g->next_spawn_distance) {
                int spawn_lane = (int)psdx_lcg_rand(g) % PSDX_LANE_COUNT;
                float r = psdx_lcg_randf(g, 0.0f, 100.0f);
                psdx_object_type_t obj_type = PSDX_OBJ_BONE;

                if (r < 25.0f) {
                    obj_type = PSDX_OBJ_HURDLE;
                } else if (r < 45.0f) {
                    obj_type = PSDX_OBJ_MUD;
                } else if (r < 60.0f) {
                    obj_type = PSDX_OBJ_BANANA;
                } else if (r < 80.0f) {
                    obj_type = PSDX_OBJ_BONE;
                } else {
                    obj_type = PSDX_OBJ_COIN;
                }

                psdx_spawn_object(g, obj_type, spawn_lane, -35.0f);
                g->next_spawn_distance += psdx_lcg_randf(g, PSDX_SPAWN_INTERVAL_MIN, PSDX_SPAWN_INTERVAL_MAX);
            }
        } else if (!g->cushion_spawned) {
            // 终点生成巨型蓬松羽毛大抱枕
            psdx_spawn_object(g, PSDX_OBJ_CUSHION, 1, -60.0f);
            g->cushion_spawned = true;
        }
    }

    // 9. 赛道物件运动与碰撞判定
    for (int i = 0; i < PSDX_MAX_TRACK_OBJECTS; i++) {
        psdx_object_t *obj = &g->objects[i];
        if (!obj->active) continue;

        // 赛道向下相对滚动
        obj->y += g->current_speed * dt_sec;

        // 超出屏幕底部则回收
        if (obj->y > PSDX_SCREEN_H + 40.0f) {
            obj->active = false;
            continue;
        }

        // 已被拾取或撞碎则不再判定
        if (obj->collected || obj->smashed) {
            continue;
        }

        // 横向与纵向碰撞盒相交检测
        float max_dx = (obj->type == PSDX_OBJ_CUSHION) ? 100.0f : ((obj->w + PSDX_PLAYER_COLLISION_W) * 0.48f);
        float max_dy = (obj->h + PSDX_PLAYER_COLLISION_H) * 0.48f;

        if (fabsf(obj->x - g->player.x) <= max_dx && fabsf(obj->y - g->player.y) <= max_dy) {
            switch (obj->type) {
            case PSDX_OBJ_BONE:
                obj->collected = true;
                g->score += 1;
                g->bones_collected++;
                g->player.tongue_state = PSDX_TONGUE_HAPPY;
                psdx_sound_push(g, PSDX_SND_BONE_CRUNCH);
                psdx_spawn_particle(g, PSDX_PART_BONE_SPARKLE, obj->x, obj->y,
                                    0.0f, -30.0f, 4.0f, 350);
                break;

            case PSDX_OBJ_COIN:
                obj->collected = true;
                g->score += 5;
                g->coins_collected++;
                psdx_sound_push(g, PSDX_SND_COIN);
                psdx_spawn_particle(g, PSDX_PART_BONE_SPARKLE, obj->x, obj->y,
                                    0.0f, -35.0f, 5.0f, 400);
                break;

            case PSDX_OBJ_HURDLE:
                if (g->player.is_jumping && g->player.jump_z >= PSDX_HURDLE_CLEAR_Z) {
                    // 成功跳跃越过
                    g->obstacles_cleared++;
                } else if (g->player.is_turbo) {
                    // 涡轮双倍极速无敌撞碎
                    obj->smashed = true;
                    g->score += 2;
                    g->obstacles_cleared++;
                    psdx_sound_push(g, PSDX_SND_TURBO_SMASH);
                    for (int k = 0; k < 6; k++) {
                        psdx_spawn_particle(g, PSDX_PART_SPLASH,
                                            obj->x + psdx_lcg_randf(g, -15.0f, 15.0f), obj->y,
                                            psdx_lcg_randf(g, -80.0f, 80.0f),
                                            psdx_lcg_randf(g, -80.0f, 40.0f),
                                            3.0f, 300);
                    }
                } else {
                    // 地面绊倒撞破
                    obj->smashed = true;
                    for (int k = 0; k < 3; k++) {
                        psdx_spawn_particle(g, PSDX_PART_SPLASH,
                                            obj->x + psdx_lcg_randf(g, -10.0f, 10.0f), obj->y,
                                            psdx_lcg_randf(g, -40.0f, 40.0f),
                                            psdx_lcg_randf(g, -40.0f, 20.0f),
                                            2.5f, 250);
                    }
                }
                break;

            case PSDX_OBJ_MUD:
                if (g->player.is_jumping && g->player.jump_z >= 10.0f) {
                    // 成功跳过泥洼
                    g->obstacles_cleared++;
                } else if (g->player.is_turbo) {
                    // 涡轮冲碎泥洼
                    obj->smashed = true;
                    psdx_sound_push(g, PSDX_SND_TURBO_SMASH);
                    for (int k = 0; k < 6; k++) {
                        psdx_spawn_particle(g, PSDX_PART_SPLASH,
                                            obj->x + psdx_lcg_randf(g, -12.0f, 12.0f), obj->y,
                                            psdx_lcg_randf(g, -70.0f, 70.0f),
                                            psdx_lcg_randf(g, -50.0f, 50.0f),
                                            3.2f, 320);
                    }
                } else {
                    // 踩泥水溅射
                    for (int k = 0; k < 4; k++) {
                        psdx_spawn_particle(g, PSDX_PART_SPLASH,
                                            obj->x + psdx_lcg_randf(g, -8.0f, 8.0f), obj->y,
                                            psdx_lcg_randf(g, -35.0f, 35.0f),
                                            psdx_lcg_randf(g, -30.0f, 30.0f),
                                            2.0f, 220);
                    }
                }
                break;

            case PSDX_OBJ_BANANA:
                if (g->player.is_jumping && g->player.jump_z >= 8.0f) {
                    // 跳跃跃过香蕉皮
                } else if (g->player.is_turbo) {
                    // 涡轮撞飞香蕉皮
                    obj->smashed = true;
                    psdx_sound_push(g, PSDX_SND_TURBO_SMASH);
                } else if (!g->player.is_spinning) {
                    // 踩香蕉皮华丽 360° 滑稽原地旋转舞步 (0 挫败设计)
                    obj->collected = true;
                    g->player.is_spinning = true;
                    g->player.spin_timer_ms = PSDX_BANANA_SPIN_MS;
                    g->player.spin_angle_deg = 0.0f;
                    g->bananas_slipped++;
                    g->current_speed = PSDX_SPEED_SPIN;
                    psdx_sound_push(g, PSDX_SND_BANANA_SPIN);

                    // 头顶生成 5 颗旋转金星粒子
                    for (int s = 0; s < 5; s++) {
                        float ang = (float)s * (6.2831853f / 5.0f);
                        psdx_spawn_particle(g, PSDX_PART_DIZZY_STAR,
                                            g->player.x, g->player.y - 18.0f,
                                            cosf(ang) * 45.0f, sinf(ang) * 25.0f,
                                            3.6f, PSDX_BANANA_SPIN_MS);
                    }
                }
                break;

            case PSDX_OBJ_CUSHION:
                // 终点飞扑巨型蓬松羽毛大抱枕 (Cushion Dive)
                if (g->state != PSDX_STATE_VICTORY) {
                    g->state = PSDX_STATE_VICTORY;
                    g->current_speed = 0.0f;
                    g->player.is_cushion_diving = true;
                    g->player.cushion_dive_scale = 1.35f;
                    g->score += 100; // 通关大奖
                    psdx_sound_push(g, PSDX_SND_CUSHION_POOF);
                    psdx_sound_push(g, PSDX_SND_CHEER);

                    // 漫天爆出 24 颗蓬松白羽毛漫天飘舞
                    for (int f = 0; f < 24; f++) {
                        psdx_spawn_particle(g, PSDX_PART_FEATHER,
                                            g->player.x + psdx_lcg_randf(g, -35.0f, 35.0f),
                                            g->player.y - 10.0f + psdx_lcg_randf(g, -15.0f, 15.0f),
                                            psdx_lcg_randf(g, -65.0f, 65.0f),
                                            psdx_lcg_randf(g, -110.0f, -25.0f),
                                            psdx_lcg_randf(g, 3.2f, 5.8f),
                                            1600);
                    }
                }
                break;

            default:
                break;
            }
        }
    }

    // 10. 粒子物理演化与生命周期回收
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        psdx_particle_t *p = &g->particles[i];
        if (!p->active) continue;

        p->x += p->vx * dt_sec;
        p->y += p->vy * dt_sec;
        p->rotation_deg += p->rot_speed * dt_sec;

        // 羽毛飘浮轻盈物理
        if (p->type == PSDX_PART_FEATHER) {
            p->vx *= 0.96f;
            p->vy += 22.0f * dt_sec; // 微重力下坠
            p->x += sinf((float)p->life_ms * 0.008f) * 0.8f;
        }

        p->life_ms += dt_ms;
        if (p->life_ms >= p->max_life_ms) {
            p->active = false;
        }
    }
}
