// main/wave_logic.c —— 《浪涌漫游者》(Wave Walker) 核心算法引擎实现
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
#include "wave_logic.h"
#include <string.h>
#include <math.h>

#ifndef M_PI_F
#define M_PI_F 3.14159265358979323846f
#endif

// 伪随机数发生器 (轻量快速确定性 LCG)
static uint32_t wave_rand(wave_game_t *game) {
    game->rng_state = game->rng_state * 1664525u + 1013904223u;
    return game->rng_state;
}

static float wave_randf(wave_game_t *game, float min_val, float max_val) {
    float r = (float)(wave_rand(game) & 0xFFFF) / 65535.0f;
    return min_val + r * (max_val - min_val);
}

// 粒子发射辅助函数
static void wave_spawn_particle(wave_game_t *game, wave_part_type_t type,
                                float x, float y, float vx, float vy,
                                float life_ms, float size) {
    for (int i = 0; i < WAVE_MAX_PARTICLES; i++) {
        if (!game->particles[i].active) {
            game->particles[i].active = true;
            game->particles[i].type = type;
            game->particles[i].x = x;
            game->particles[i].y = y;
            game->particles[i].vx = vx;
            game->particles[i].vy = vy;
            game->particles[i].life_ms = life_ms;
            game->particles[i].max_life_ms = life_ms;
            game->particles[i].size = size;
            break;
        }
    }
}

// 平滑动态正弦海浪数学模型
float wave_get_surface_y(float x, float time) {
    float k1 = (2.0f * M_PI_F) / WAVE_LEN_1;
    float w1 = k1 * WAVE_SPEED_1;
    float phase1 = k1 * x - w1 * time;

    float k2 = (2.0f * M_PI_F) / WAVE_LEN_2;
    float w2 = k2 * WAVE_SPEED_2;
    float phase2 = k2 * x - w2 * time;

    return WAVE_BASE_Y + WAVE_AMP_1 * sinf(phase1) + WAVE_AMP_2 * sinf(phase2);
}

float wave_get_slope(float x, float time) {
    float k1 = (2.0f * M_PI_F) / WAVE_LEN_1;
    float w1 = k1 * WAVE_SPEED_1;
    float phase1 = k1 * x - w1 * time;

    float k2 = (2.0f * M_PI_F) / WAVE_LEN_2;
    float w2 = k2 * WAVE_SPEED_2;
    float phase2 = k2 * x - w2 * time;

    return (WAVE_AMP_1 * k1 * cosf(phase1)) + (WAVE_AMP_2 * k2 * cosf(phase2));
}

float wave_get_tangent_angle(float x, float time) {
    float slope = wave_get_slope(x, time);
    return atan2f(slope, 1.0f) * (180.0f / M_PI_F);
}

float wave_get_game_surface_y(const wave_game_t *game, float screen_x) {
    if (!game) return WAVE_BASE_Y;
    return wave_get_surface_y(screen_x + game->distance, game->time_sec);
}

float wave_get_game_tangent_angle(const wave_game_t *game, float screen_x) {
    if (!game) return 0.0f;
    return wave_get_tangent_angle(screen_x + game->distance, game->time_sec);
}

// 角度工具函数
float wave_angle_normalize_180(float deg) {
    while (deg > 180.0f) deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

float wave_angle_difference(float deg_a, float deg_b) {
    float na = wave_angle_normalize_180(deg_a);
    float nb = wave_angle_normalize_180(deg_b);
    float diff = fabsf(na - nb);
    if (diff > 180.0f) {
        diff = 360.0f - diff;
    }
    return diff;
}

bool wave_is_down_slope(float tangent_angle) {
    return tangent_angle > (WAVE_SLOPE_DOWN_MIN * (180.0f / M_PI_F));
}

// 初始化
void wave_init(wave_game_t *game, uint32_t seed) {
    if (!game) return;
    memset(game, 0, sizeof(wave_game_t));

    game->rng_state = (seed != 0) ? seed : 0x77617665u; // "wave"
    game->game_state = WAVE_GAME_PLAYING;
    game->otter_state = WAVE_OTTER_SURFING;

    game->x = WAVE_OTTER_X;
    game->speed = WAVE_SPEED_BASE;
    game->y = wave_get_game_surface_y(game, game->x);
    game->board_angle = wave_get_game_tangent_angle(game, game->x);

    game->hp = 3;
    game->max_hp = 3;
    game->score = 0;
    game->combo = 0;
    game->max_combo = 0;

    game->next_spawn_dist = 260.0f;
}

// 音效读取并清除
wave_sound_t wave_consume_sound(wave_game_t *game) {
    if (!game) return WAVE_SND_NONE;
    wave_sound_t snd = game->pending_sound;
    game->pending_sound = WAVE_SND_NONE;
    return snd;
}

// 按键操作：UP
void wave_input_up(wave_game_t *game) {
    if (!game || game->game_state != WAVE_GAME_PLAYING) return;

    if (game->otter_state == WAVE_OTTER_AIRBORNE) {
        // 空中特技：顺时针翻滚
        game->air_rot_vel = +WAVE_AIR_ROT_SPEED;
        // 赋予即时角位移脉冲响应
        game->board_angle += 35.0f;
        game->air_rotation += 35.0f;

        // 检查是否恰好越过一整圈 360°
        int current_full_flips = (int)(fabsf(game->air_rotation) / 360.0f);
        if (current_full_flips > game->stunt_flips) {
            game->stunt_flips = current_full_flips;
            game->score += 100 * game->stunt_flips;
            game->pending_sound = WAVE_SND_TRICK_SWOOSH;
            wave_spawn_particle(game, WAVE_PART_STAR_SPARKLE, game->x, game->y, 0.0f, -40.0f, 350.0f, 3.0f);
        }
    } else if (game->otter_state == WAVE_OTTER_SURFING || game->otter_state == WAVE_OTTER_PUMPING) {
        // 水面按 UP 键：轻盈跃浪 (HOP / JUMP)
        wave_input_ok(game);
    }
}

// 按键操作：DOWN
void wave_input_down(wave_game_t *game) {
    if (!game || game->game_state != WAVE_GAME_PLAYING) return;

    if (game->otter_state == WAVE_OTTER_AIRBORNE) {
        // 空中特技：逆时针翻滚
        game->air_rot_vel = -WAVE_AIR_ROT_SPEED;
        game->board_angle -= 35.0f;
        game->air_rotation -= 35.0f;

        int current_full_flips = (int)(fabsf(game->air_rotation) / 360.0f);
        if (current_full_flips > game->stunt_flips) {
            game->stunt_flips = current_full_flips;
            game->score += 100 * game->stunt_flips;
            game->pending_sound = WAVE_SND_TRICK_SWOOSH;
            wave_spawn_particle(game, WAVE_PART_STAR_SPARKLE, game->x, game->y, 0.0f, -40.0f, 350.0f, 3.0f);
        }
    } else {
        // 水面压板瞬态触发
        wave_input_down_press(game);
    }
}

void wave_input_down_press(wave_game_t *game) {
    if (!game || game->game_state != WAVE_GAME_PLAYING) return;
    game->is_down_pressed = true;

    if (game->otter_state == WAVE_OTTER_SURFING) {
        float wave_angle = wave_get_game_tangent_angle(game, game->x);
        if (wave_is_down_slope(wave_angle)) {
            game->otter_state = WAVE_OTTER_PUMPING;
            game->pending_sound = WAVE_SND_SURF_RUSH;
        }
    }
}

void wave_input_down_release(wave_game_t *game) {
    if (!game) return;
    game->is_down_pressed = false;
    if (game->otter_state == WAVE_OTTER_PUMPING) {
        game->otter_state = WAVE_OTTER_SURFING;
    }
}

void wave_input_ok_hold(wave_game_t *game, bool held) {
    if (!game) return;
    game->ok_leveling = held;
}

// 按键操作：OK
void wave_input_ok(wave_game_t *game) {
    if (!game) return;

    if (game->game_state == WAVE_GAME_READY) {
        game->game_state = WAVE_GAME_PLAYING;
        return;
    }

    if (game->game_state == WAVE_GAME_OVER) {
        wave_init(game, game->rng_state + 1);
        return;
    }

    if (game->otter_state == WAVE_OTTER_SURFING || game->otter_state == WAVE_OTTER_PUMPING) {
        // 水面借浪起跳 (借冲力高高腾空跃起)
        float boost_vy = game->speed * 0.65f;
        game->vy = WAVE_JUMP_BASE_VY - boost_vy;
        game->otter_state = WAVE_OTTER_AIRBORNE;
        game->air_rotation = 0.0f;
        game->stunt_flips = 0;
        game->air_rot_vel = 0.0f;
        game->pending_sound = WAVE_SND_LAUNCH;

        // 起跳水花
        for (int p = 0; p < 4; p++) {
            wave_spawn_particle(game, WAVE_PART_WATER_SPLASH,
                                game->x - 10.0f + (float)p * 5.0f, game->y,
                                -60.0f + (float)p * 30.0f, -80.0f, 280.0f, 2.5f);
        }
    } else if (game->otter_state == WAVE_OTTER_AIRBORNE) {
        // 空中 OK 键：落水入水前一刻快速校正板面角度
        float wave_angle = wave_get_game_tangent_angle(game, game->x);
        game->board_angle = wave_angle;
        game->air_rot_vel = 0.0f;
    }
}

// 生成系统管线
static void wave_spawn_entities(wave_game_t *game) {
    float spawn_world_x = game->distance + WAVE_SCREEN_W + 30.0f;
    uint32_t r = wave_rand(game) % 100;

    if (r < 55) {
        // 生成障碍物
        for (int i = 0; i < WAVE_MAX_OBSTACLES; i++) {
            if (!game->obstacles[i].active) {
                game->obstacles[i].active = true;
                game->obstacles[i].x = spawn_world_x;
                game->obstacles[i].anim_phase = wave_randf(game, 0.0f, 6.28f);

                uint32_t sub = wave_rand(game) % 3;
                if (sub == 0) {
                    // 调皮小螃蟹 (贴水浮动)
                    game->obstacles[i].type = WAVE_OBS_CRAB;
                    game->obstacles[i].w = 16.0f;
                    game->obstacles[i].h = 12.0f;
                    game->obstacles[i].floats_on_surface = true;
                    game->obstacles[i].y = wave_get_surface_y(spawn_world_x, game->time_sec) - 12.0f;
                } else if (sub == 1) {
                    // 漂流木 (横卧海面，需腾空跃过)
                    game->obstacles[i].type = WAVE_OBS_DRIFTWOOD;
                    game->obstacles[i].w = 26.0f;
                    game->obstacles[i].h = 14.0f;
                    game->obstacles[i].floats_on_surface = true;
                    game->obstacles[i].y = wave_get_surface_y(spawn_world_x, game->time_sec) - 14.0f;
                } else {
                    // 浮游发光水母 (浮动于海面上空)
                    game->obstacles[i].type = WAVE_OBS_JELLYFISH;
                    game->obstacles[i].w = 14.0f;
                    game->obstacles[i].h = 16.0f;
                    game->obstacles[i].floats_on_surface = false;
                    float base_y = wave_get_surface_y(spawn_world_x, game->time_sec);
                    game->obstacles[i].y = base_y - wave_randf(game, 35.0f, 65.0f);
                }
                break;
            }
        }
    } else {
        // 生成收集品
        for (int i = 0; i < WAVE_MAX_ITEMS; i++) {
            if (!game->items[i].active) {
                game->items[i].active = true;
                game->items[i].x = spawn_world_x;
                game->items[i].anim_timer = 0.0f;

                uint32_t sub = wave_rand(game) % 4;
                if (sub == 0) {
                    // 珍珠贝壳 (+50分，可回血)
                    game->items[i].type = WAVE_ITEM_SHELL;
                    game->items[i].r = 9.0f;
                    float base_y = wave_get_surface_y(spawn_world_x, game->time_sec);
                    game->items[i].y = base_y - wave_randf(game, 40.0f, 75.0f);
                } else {
                    // 五角海星 (+10分)
                    game->items[i].type = WAVE_ITEM_STARFISH;
                    game->items[i].r = 7.0f;
                    float base_y = wave_get_surface_y(spawn_world_x, game->time_sec);
                    game->items[i].y = base_y - wave_randf(game, 15.0f, 45.0f);
                }
                break;
            }
        }
    }

    game->next_spawn_dist = game->distance + wave_randf(game, 180.0f, 300.0f);
}

// 核心时间步进函数
void wave_step(wave_game_t *game, uint32_t dt_ms) {
    if (!game || dt_ms == 0) return;

    if (dt_ms > 100) dt_ms = 100; // 防单步过长穿透
    float dt = (float)dt_ms / 1000.0f;
    game->time_sec += dt;

    if (game->invuln_timer_ms > 0.0f) {
        game->invuln_timer_ms -= (float)dt_ms;
        if (game->invuln_timer_ms < 0.0f) game->invuln_timer_ms = 0.0f;
    }

    if (game->game_state != WAVE_GAME_PLAYING) {
        // 非游玩状态下仅更新粒子与浮波
        for (int i = 0; i < WAVE_MAX_PARTICLES; i++) {
            if (game->particles[i].active) {
                game->particles[i].life_ms -= (float)dt_ms;
                if (game->particles[i].life_ms <= 0.0f) {
                    game->particles[i].active = false;
                }
            }
        }
        return;
    }

    // 水平位移与得分累计
    game->distance += game->speed * dt;
    game->score += (uint32_t)(game->speed * dt * 0.08f);

    float surface_y = wave_get_game_surface_y(game, game->x);
    float wave_angle = wave_get_game_tangent_angle(game, game->x);
    bool is_down = wave_is_down_slope(wave_angle);

    // 小海獭状态机处理
    switch (game->otter_state) {
        case WAVE_OTTER_DAZED: {
            // 肚皮拍水后的搞笑甩头减速中
            game->y = surface_y;
            game->board_angle = wave_angle;
            game->speed = WAVE_SPEED_MIN;

            game->daze_timer_ms -= (float)dt_ms;
            if (game->daze_timer_ms <= 0.0f) {
                game->daze_timer_ms = 0.0f;
                game->otter_state = WAVE_OTTER_SURFING;
            }
            break;
        }

        case WAVE_OTTER_SURFING:
        case WAVE_OTTER_PUMPING: {
            game->y = surface_y;

            // 板面平滑贴合波浪斜率
            float angle_diff = wave_angle - game->board_angle;
            game->board_angle += angle_diff * 14.0f * dt;

            // 检查 DOWN 键压板与顺坡加速
            if (game->is_down_pressed) {
                if (is_down) {
                    // 顺坡压板重力加速俯冲！
                    game->otter_state = WAVE_OTTER_PUMPING;
                    float rad = wave_angle * (M_PI_F / 180.0f);
                    float slope_sin = sinf(rad);
                    if (slope_sin < 0.2f) slope_sin = 0.2f;

                    float accel = WAVE_PUMP_ACCEL * slope_sin;
                    game->speed += accel * dt;
                    if (game->speed > WAVE_SPEED_MAX) game->speed = WAVE_SPEED_MAX;

                    // 释放压板喷射水流粒子
                    wave_spawn_particle(game, WAVE_PART_PUMP_SPRAY,
                                        game->x - 12.0f, game->y + 2.0f,
                                        -game->speed * 0.4f, -30.0f, 220.0f, 2.5f);

                    if (game->pending_sound == WAVE_SND_NONE) {
                        game->pending_sound = WAVE_SND_SURF_RUSH;
                    }
                } else {
                    // 逆坡按 DOWN：板头阻水减速
                    game->otter_state = WAVE_OTTER_SURFING;
                    game->speed -= 120.0f * dt;
                    if (game->speed < WAVE_SPEED_MIN) game->speed = WAVE_SPEED_MIN;
                }
            } else {
                game->otter_state = WAVE_OTTER_SURFING;
                // 未压板：速度向巡航速度平滑收敛
                if (game->boost_timer_ms > 0.0f) {
                    game->boost_timer_ms -= (float)dt_ms;
                } else {
                    if (game->speed > WAVE_SPEED_BASE) {
                        game->speed -= 55.0f * dt;
                        if (game->speed < WAVE_SPEED_BASE) game->speed = WAVE_SPEED_BASE;
                    } else if (game->speed < WAVE_SPEED_BASE) {
                        game->speed += 45.0f * dt;
                        if (game->speed > WAVE_SPEED_BASE) game->speed = WAVE_SPEED_BASE;
                    }
                }
            }

            // 常规水花微粒
            if ((wave_rand(game) % 10) < 3) {
                wave_spawn_particle(game, WAVE_PART_WATER_SPLASH,
                                    game->x - 8.0f, game->y + 2.0f,
                                    -40.0f, -30.0f, 180.0f, 1.8f);
            }
            break;
        }

        case WAVE_OTTER_AIRBORNE: {
            // 按住 OK：板面跟着浪面走，松手落地就是干净入水。
            if (game->ok_leveling) {
                game->board_angle = wave_angle;
                game->air_rot_vel = 0.0f;
            }

            // 空中抛物线运动
            game->vy += WAVE_GRAVITY * dt;
            game->y += game->vy * dt;

            // 空中自转翻滚
            if (fabsf(game->air_rot_vel) > 1.0f) {
                float rot_delta = game->air_rot_vel * dt;
                game->board_angle += rot_delta;
                game->air_rotation += rot_delta;

                int current_full_flips = (int)(fabsf(game->air_rotation) / 360.0f);
                if (current_full_flips > game->stunt_flips) {
                    game->stunt_flips = current_full_flips;
                    game->score += 100 * game->stunt_flips;
                    game->pending_sound = WAVE_SND_TRICK_SWOOSH;
                    wave_spawn_particle(game, WAVE_PART_STAR_SPARKLE,
                                        game->x, game->y, 0.0f, -40.0f, 350.0f, 3.0f);
                }

                // 旋转阻尼
                game->air_rot_vel *= (1.0f - 0.8f * dt);
            }
            game->board_angle = wave_angle_normalize_180(game->board_angle);

            // 入水接触海面判定
            if (game->y >= surface_y && game->vy > 0.0f) {
                game->y = surface_y;
                game->vy = 0.0f;

                float angle_err = wave_angle_difference(game->board_angle, wave_angle);

                if (angle_err <= WAVE_PERFECT_ENTRY_DEG) {
                    // 【完美切水入浪】
                    game->combo++;
                    if (game->combo > game->max_combo) game->max_combo = game->combo;

                    uint32_t bonus = 120 * game->combo + (uint32_t)(game->stunt_flips * 200 * game->combo);
                    game->score += bonus;

                    // 瞬时二次冲刺
                    game->speed += 130.0f;
                    if (game->speed > WAVE_SPEED_MAX) game->speed = WAVE_SPEED_MAX;
                    game->boost_timer_ms = 850.0f;

                    game->board_angle = wave_angle;
                    game->otter_state = WAVE_OTTER_SURFING;
                    game->pending_sound = WAVE_SND_PERFECT_ENTRY;

                    // 触发七彩彩虹水花
                    for (int p = 0; p < 8; p++) {
                        float pv_x = -70.0f + (float)p * 20.0f;
                        float pv_y = -90.0f - (float)(p % 3) * 20.0f;
                        wave_spawn_particle(game, WAVE_PART_RAINBOW_SPLASH,
                                            game->x, game->y, pv_x, pv_y, 450.0f, 3.0f);
                    }
                } else {
                    // 【肚皮啪叽拍水】
                    game->combo = 0;
                    game->speed = WAVE_SPEED_MIN;
                    game->otter_state = WAVE_OTTER_DAZED;
                    game->daze_timer_ms = 700.0f;
                    game->board_angle = wave_angle;
                    game->pending_sound = WAVE_SND_BELLY_FLOP;

                    // 触发搞笑扩散大水花
                    for (int p = 0; p < 7; p++) {
                        float pv_x = -80.0f + (float)p * 25.0f;
                        float pv_y = -50.0f - (float)(p % 2) * 30.0f;
                        wave_spawn_particle(game, WAVE_PART_BELLY_SPLASH,
                                            game->x, game->y, pv_x, pv_y, 350.0f, 4.0f);
                    }
                }

                game->air_rotation = 0.0f;
                game->air_rot_vel = 0.0f;
                game->stunt_flips = 0;
            }
            break;
        }
    }

    // 实体生成管理
    if (game->distance >= game->next_spawn_dist) {
        wave_spawn_entities(game);
    }

    // 障碍物生命周期与碰撞检测
    float otter_left = game->x - WAVE_OTTER_W * 0.5f;
    float otter_right = game->x + WAVE_OTTER_W * 0.5f;
    float otter_top = game->y - WAVE_OTTER_H;
    float otter_bottom = game->y;

    for (int i = 0; i < WAVE_MAX_OBSTACLES; i++) {
        if (!game->obstacles[i].active) continue;

        // 随浪起伏的物体更新 Y
        if (game->obstacles[i].floats_on_surface) {
            game->obstacles[i].y = wave_get_surface_y(game->obstacles[i].x, game->time_sec) - game->obstacles[i].h;
        }

        float obs_screen_x = game->obstacles[i].x - game->distance;

        // 移出屏幕左侧归还对象池
        if (obs_screen_x < -50.0f) {
            game->obstacles[i].active = false;
            continue;
        }

        // AABB 碰撞检测
        float obs_left = obs_screen_x;
        float obs_right = obs_screen_x + game->obstacles[i].w;
        float obs_top = game->obstacles[i].y;
        float obs_bottom = game->obstacles[i].y + game->obstacles[i].h;

        bool overlap = (otter_left < obs_right && otter_right > obs_left &&
                        otter_top < obs_bottom && otter_bottom > obs_top);

        if (overlap) {
            if (game->invuln_timer_ms <= 0.0f) {
                // 触障受创
                game->hp--;
                game->speed = WAVE_SPEED_MIN;
                game->combo = 0;
                game->invuln_timer_ms = 1200.0f;
                game->pending_sound = WAVE_SND_HIT_OBSTACLE;

                if (game->hp <= 0) {
                    game->hp = 0;
                    game->game_state = WAVE_GAME_OVER;
                    game->pending_sound = WAVE_SND_GAMEOVER;
                }
            }
            game->obstacles[i].active = false;
        }
    }

    // 收集品生命周期与拾取检测
    for (int i = 0; i < WAVE_MAX_ITEMS; i++) {
        if (!game->items[i].active) continue;

        float item_screen_x = game->items[i].x - game->distance;

        if (item_screen_x < -40.0f) {
            game->items[i].active = false;
            continue;
        }

        // 圆心距离拾取检测
        float dx = game->x - item_screen_x;
        float dy = (game->y - WAVE_OTTER_H * 0.5f) - game->items[i].y;
        float dist_sq = dx * dx + dy * dy;
        float collect_r = game->items[i].r + WAVE_OTTER_W * 0.5f;

        if (dist_sq <= collect_r * collect_r) {
            if (game->items[i].type == WAVE_ITEM_STARFISH) {
                game->starfish_count++;
                uint32_t mul = (game->combo > 0) ? (uint32_t)game->combo : 1u;
                game->score += 20 * mul;
                game->pending_sound = WAVE_SND_STAR_COLLECT;
                wave_spawn_particle(game, WAVE_PART_STAR_SPARKLE,
                                    item_screen_x, game->items[i].y,
                                    0.0f, -30.0f, 300.0f, 3.0f);
            } else if (game->items[i].type == WAVE_ITEM_SHELL) {
                game->shell_count++;
                uint32_t mul = (game->combo > 0) ? (uint32_t)game->combo : 1u;
                game->score += 100 * mul;
                if (game->hp < game->max_hp) {
                    game->hp++;
                }
                game->pending_sound = WAVE_SND_SHELL_COLLECT;
                wave_spawn_particle(game, WAVE_PART_RAINBOW_SPLASH,
                                    item_screen_x, game->items[i].y,
                                    0.0f, -50.0f, 400.0f, 3.5f);
            }
            game->items[i].active = false;
        }
    }

    // 粒子系统物理更新
    for (int i = 0; i < WAVE_MAX_PARTICLES; i++) {
        if (!game->particles[i].active) continue;

        game->particles[i].life_ms -= (float)dt_ms;
        if (game->particles[i].life_ms <= 0.0f) {
            game->particles[i].active = false;
            continue;
        }

        game->particles[i].x += game->particles[i].vx * dt;
        game->particles[i].y += game->particles[i].vy * dt;
        game->particles[i].vy += 220.0f * dt; // 粒子轻微重力坠落
    }
}
