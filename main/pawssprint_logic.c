// main/pawssprint_logic.c —— 《短腿爪爪运动会》算法逻辑实现
#include "pawssprint_logic.h"
#include <string.h>
#include <math.h>

static const float LANES_X[PS_LANE_COUNT] = { PS_LANE_0_X, PS_LANE_1_X, PS_LANE_2_X };

static const ps_char_info_t S_CHARS[PS_CHAR_COUNT] = {
    {
        .name = "CORGI",
        .sub = "Peach Butt Sprinter",
        .tag = "Sunny Energy",
        .body_color = 0xF59E0B,   // 活力琥珀金
        .belly_color = 0xFFFFFF,  // 蜜桃雪白肚
        .accent_color = 0xB45309  // 焦糖大耳朵
    },
    {
        .name = "SHIBA",
        .sub = "Airplane Ears Smiler",
        .tag = "Healing Smile",
        .body_color = 0xD97706,   // 暖栗柴犬黄
        .belly_color = 0xFEF3C7,  // 奶油奶白腹
        .accent_color = 0x92400E  // 卷尾巴焦糖
    },
    {
        .name = "SEAL",
        .sub = "Mochi DuangDuang",
        .tag = "Soft Snowball",
        .body_color = 0xCBD5E1,   // 雪白冰晶蓝灰
        .belly_color = 0xF8FAFC,  // 珍珠糯米白
        .accent_color = 0x94A3B8  // 鳍片点缀
    },
    {
        .name = "PENGUIN",
        .sub = "Belly Slider Gent",
        .tag = "Arctic Gent",
        .body_color = 0x1E293B,   // 绅士曜石黑
        .belly_color = 0xFFFFFF,  // 纯白小燕尾
        .accent_color = 0xF97316  // 甜橙小肉爪
    }
};

static const char *S_QUOTES[] = {
    "Take a break whenever you need!\nYou are the cutest runner in the world.",
    "No need to rush for 1st place!\nYour short paws are already shining bright.",
    "Even slipping on a banana peel\nis just a lovely cheerful pirouette~",
    "Leave all worries on the track,\nand bring warm fluffy hugs back home!",
    "Breathe deeply! Soft furry friends\nare always here waiting for you."
};
#define QUOTE_COUNT ((int)(sizeof(S_QUOTES) / sizeof(S_QUOTES[0])))

static inline uint32_t ps_rand(ps_game_t *game)
{
    game->rng_state = game->rng_state * 1664525u + 1013904223u;
    return game->rng_state;
}

static inline float ps_randf(ps_game_t *game, float min_v, float max_v)
{
    float norm = (float)(ps_rand(game) & 0xFFFF) / 65535.0f;
    return min_v + norm * (max_v - min_v);
}

const ps_char_info_t *pawssprint_get_char_info(ps_char_type_t ch)
{
    if (ch >= PS_CHAR_COUNT) ch = PS_CHAR_CORGI;
    return &S_CHARS[ch];
}

const char *pawssprint_get_quote(int index)
{
    if (index < 0 || index >= QUOTE_COUNT) index = 0;
    return S_QUOTES[index];
}

int pawssprint_get_quote_count(void)
{
    return QUOTE_COUNT;
}

void pawssprint_init(ps_game_t *game, uint32_t seed)
{
    memset(game, 0, sizeof(ps_game_t));
    game->rng_state = (seed == 0) ? 0x20260919 : seed;
    game->state = PS_STATE_TITLE;
    game->selected_char = PS_CHAR_CORGI;

    game->lane = 1;
    game->x = LANES_X[1];
    game->target_x = LANES_X[1];
    game->y = PS_PLAYER_Y;
    game->squash_x = 1.0f;
    game->squash_y = 1.0f;
    game->speed = 160.0f;
}

void pawssprint_start(ps_game_t *game)
{
    game->state = PS_STATE_PLAYING;
    game->lane = 1;
    game->x = LANES_X[1];
    game->target_x = LANES_X[1];
    game->y = PS_PLAYER_Y;
    game->jump_z = 0.0f;
    game->jump_v = 0.0f;
    game->is_jumping = false;
    game->slip_timer_ms = 0.0f;
    game->spin_angle = 0.0f;
    game->squash_x = 1.0f;
    game->squash_y = 1.0f;
    game->run_frame = 0.0f;

    game->speed = 160.0f;
    game->distance_m = 0.0f;
    game->bones_count = 0;
    game->slips_count = 0;
    game->road_offset = 0.0f;

    game->spawn_obs_timer_ms = 0.0f;
    game->spawn_pickup_timer_ms = 0.0f;
    game->paw_timer_ms = 0.0f;
    game->dive_timer_ms = 0.0f;

    // 清空对象池
    memset(game->obstacles, 0, sizeof(game->obstacles));
    memset(game->pickups, 0, sizeof(game->pickups));
    memset(game->paw_prints, 0, sizeof(game->paw_prints));
    memset(game->feathers, 0, sizeof(game->feathers));

    game->pending_sound = PS_SND_JUMP;
}

void pawssprint_reset_to_title(ps_game_t *game)
{
    game->state = PS_STATE_TITLE;
    game->pending_sound = PS_SND_PATA;
}

static void spawn_obstacle(ps_game_t *game)
{
    // 寻找空闲槽位
    for (int i = 0; i < PS_MAX_OBSTACLES; i++) {
        if (!game->obstacles[i].active) {
            int lane = ps_rand(game) % 3;
            uint32_t r = ps_rand(game) % 100;
            ps_obs_type_t t = PS_OBS_BANANA;
            if (r < 50) {
                t = PS_OBS_BANANA;
            } else if (r < 75) {
                t = PS_OBS_ROOMBA;
            } else {
                t = PS_OBS_MUD;
            }
            game->obstacles[i].active = true;
            game->obstacles[i].type = t;
            game->obstacles[i].lane = lane;
            game->obstacles[i].x = LANES_X[lane];
            game->obstacles[i].y = -24.0f;
            break;
        }
    }
}

static void spawn_pickup(ps_game_t *game)
{
    for (int i = 0; i < PS_MAX_PICKUPS; i++) {
        if (!game->pickups[i].active) {
            int lane = ps_rand(game) % 3;
            uint32_t r = ps_rand(game) % 100;
            game->pickups[i].active = true;
            game->pickups[i].type = (r < 25) ? PS_PICKUP_HEART : PS_PICKUP_BONE;
            game->pickups[i].lane = lane;
            game->pickups[i].x = LANES_X[lane];
            game->pickups[i].y = -24.0f;
            game->pickups[i].bob_phase = ps_randf(game, 0.0f, 6.28f);
            break;
        }
    }
}

static void spawn_paw_print(ps_game_t *game)
{
    for (int i = 0; i < PS_MAX_PAW_PRINTS; i++) {
        if (!game->paw_prints[i].active) {
            game->paw_prints[i].active = true;
            game->paw_prints[i].x = game->x + ps_randf(game, -4.0f, 4.0f);
            game->paw_prints[i].y = game->y + 12.0f;
            game->paw_prints[i].life = 1.0f;
            break;
        }
    }
}

void pawssprint_step(ps_game_t *game, uint32_t dt_ms)
{
    float dt = (float)dt_ms / 1000.0f;
    game->tick_count++;

    // Q 弹形变平滑衰减复原
    game->squash_x += (1.0f - game->squash_x) * (0.16f * (float)dt_ms / 25.0f);
    game->squash_y += (1.0f - game->squash_y) * (0.16f * (float)dt_ms / 25.0f);

    if (game->state == PS_STATE_PLAYING) {
        game->run_frame += dt * 10.0f;

        // 车道横向平滑插值变道
        game->x += (game->target_x - game->x) * (0.28f * (float)dt_ms / 25.0f);

        // 跳跃重力学
        if (game->is_jumping) {
            game->jump_z += game->jump_v * dt;
            game->jump_v -= 820.0f * dt; // 重力加速度
            if (game->jump_z <= 0.0f) {
                game->jump_z = 0.0f;
                game->jump_v = 0.0f;
                game->is_jumping = false;
                game->squash_x = 1.25f;
                game->squash_y = 0.78f;
                game->pending_sound = PS_SND_PATA;
            }
        }

        // 踩香蕉皮华丽旋转滑行
        if (game->slip_timer_ms > 0.0f) {
            game->slip_timer_ms -= (float)dt_ms;
            game->spin_angle += dt * 14.0f;
            game->speed = 100.0f; // 趣味滑行微减速
        } else {
            game->spin_angle = 0.0f;
            // 速度随着距离平滑成长 (160 ~ 230 px/s)
            float progress = game->distance_m / (float)PS_TOTAL_DIST_M;
            if (progress > 1.0f) progress = 1.0f;
            game->speed = 160.0f + progress * 70.0f;
        }

        // 里程步进与赛道滚动
        float step_px = game->speed * dt;
        game->distance_m += step_px * 0.08f;
        game->road_offset += step_px;
        while (game->road_offset >= 32.0f) {
            game->road_offset -= 32.0f;
        }

        // 步频肉垫爪印生成
        game->paw_timer_ms += (float)dt_ms;
        if (game->paw_timer_ms >= 200.0f) {
            game->paw_timer_ms = 0.0f;
            spawn_paw_print(game);
        }

        // 爪印滚动与消散
        for (int i = 0; i < PS_MAX_PAW_PRINTS; i++) {
            if (game->paw_prints[i].active) {
                game->paw_prints[i].y += step_px;
                game->paw_prints[i].life -= dt * 0.75f;
                if (game->paw_prints[i].y > 330.0f || game->paw_prints[i].life <= 0.0f) {
                    game->paw_prints[i].active = false;
                }
            }
        }

        // 生成障碍物 (距终点前 40m 停止刷新，留白给大抱枕)
        game->spawn_obs_timer_ms += (float)dt_ms;
        if (game->spawn_obs_timer_ms >= 1200.0f && game->distance_m < (PS_TOTAL_DIST_M - 40)) {
            game->spawn_obs_timer_ms = 0.0f;
            spawn_obstacle(game);
        }

        // 生成收集品
        game->spawn_pickup_timer_ms += (float)dt_ms;
        if (game->spawn_pickup_timer_ms >= 850.0f && game->distance_m < (PS_TOTAL_DIST_M - 30)) {
            game->spawn_pickup_timer_ms = 0.0f;
            spawn_pickup(game);
        }

        // 更新障碍物
        for (int i = 0; i < PS_MAX_OBSTACLES; i++) {
            ps_obstacle_t *o = &game->obstacles[i];
            if (!o->active) continue;
            o->y += step_px;

            // 碰撞检测 (跳跃时可安全越过)
            if (o->y > (game->y - 20.0f) && o->y < (game->y + 20.0f) &&
                fabsf(o->x - game->x) < 22.0f) {
                if (!game->is_jumping && game->jump_z < 12.0f) {
                    o->active = false;
                    if (o->type == PS_OBS_BANANA) {
                        game->slip_timer_ms = 850.0f;
                        game->slips_count++;
                        game->squash_x = 1.35f;
                        game->squash_y = 0.70f;
                        game->pending_sound = PS_SND_SLIP;
                    } else if (o->type == PS_OBS_ROOMBA) {
                        // 扫地机撞弹变道
                        game->lane = (game->lane == 1) ? ((ps_rand(game) % 2) ? 0 : 2) : 1;
                        game->target_x = LANES_X[game->lane];
                        game->slip_timer_ms = 450.0f;
                        game->slips_count++;
                        game->pending_sound = PS_SND_SLIP;
                    } else if (o->type == PS_OBS_MUD) {
                        game->slip_timer_ms = 350.0f;
                        game->pending_sound = PS_SND_PATA;
                    }
                }
            }

            if (o->y > 340.0f) {
                o->active = false;
            }
        }

        // 更新收集品
        for (int i = 0; i < PS_MAX_PICKUPS; i++) {
            ps_pickup_t *p = &game->pickups[i];
            if (!p->active) continue;
            p->y += step_px;
            p->bob_phase += dt * 4.0f;

            if (p->y > (game->y - 24.0f) && p->y < (game->y + 24.0f) &&
                fabsf(p->x - game->x) < 22.0f) {
                p->active = false;
                if (p->type == PS_PICKUP_BONE) {
                    game->bones_count += 1;
                    game->pending_sound = PS_SND_BONE;
                } else {
                    game->bones_count += 3;
                    game->squash_x = 0.8f;
                    game->squash_y = 1.35f;
                    game->pending_sound = PS_SND_HEART;
                }
            }

            if (p->y > 340.0f) {
                p->active = false;
            }
        }

        // 终点飞扑触发：500m 到达！
        if (game->distance_m >= (float)PS_TOTAL_DIST_M) {
            game->state = PS_STATE_DIVE;
            game->dive_timer_ms = 0.0f;
            game->pending_sound = PS_SND_CUSHION_DIVE;
            game->quote_index = (int)(ps_rand(game) % QUOTE_COUNT);

            // 炸裂蓬松彩色羽毛
            const uint32_t f_colors[4] = { 0xFFFFFF, 0xFBCFE8, 0xFEF08A, 0xE0E7FF };
            for (int i = 0; i < PS_MAX_FEATHERS; i++) {
                float angle = ps_randf(game, 0.0f, 6.283f);
                float spd = ps_randf(game, 40.0f, 130.0f);
                game->feathers[i].active = true;
                game->feathers[i].x = 120.0f;
                game->feathers[i].y = 160.0f;
                game->feathers[i].vx = cosf(angle) * spd;
                game->feathers[i].vy = sinf(angle) * spd - 35.0f;
                game->feathers[i].rot = ps_randf(game, 0.0f, 3.14f);
                game->feathers[i].vrot = ps_randf(game, -4.0f, 4.0f);
                game->feathers[i].size = ps_randf(game, 5.0f, 10.0f);
                game->feathers[i].life = 1.0f;
                game->feathers[i].color = f_colors[ps_rand(game) % 4];
            }
        }

    } else if (game->state == PS_STATE_DIVE) {
        game->dive_timer_ms += (float)dt_ms;

        // 羽毛飘零物理
        for (int i = 0; i < PS_MAX_FEATHERS; i++) {
            ps_feather_t *f = &game->feathers[i];
            if (!f->active) continue;
            f->x += f->vx * dt;
            f->y += f->vy * dt;
            f->vy += 45.0f * dt; // 微重力下落
            f->rot += f->vrot * dt;
            f->life -= dt * 0.45f;
            if (f->life <= 0.0f || f->y > 330.0f) {
                f->active = false;
            }
        }

        // 飞扑动画 2.4 秒后进入温馨结算
        if (game->dive_timer_ms >= 2400.0f) {
            game->state = PS_STATE_RESULT;
        }
    }
}

void pawssprint_input_up(ps_game_t *game)
{
    if (game->state == PS_STATE_TITLE) {
        game->selected_char = (ps_char_type_t)((game->selected_char + PS_CHAR_COUNT - 1) % PS_CHAR_COUNT);
        game->pending_sound = PS_SND_JUMP;
    } else if (game->state == PS_STATE_PLAYING) {
        if (game->lane > 0) {
            game->lane--;
            game->target_x = LANES_X[game->lane];
            game->squash_x = 1.30f;
            game->squash_y = 0.75f;
            game->pending_sound = PS_SND_PATA;
        }
    } else if (game->state == PS_STATE_RESULT) {
        // 切换角色并直接开跑
        game->selected_char = (ps_char_type_t)((game->selected_char + PS_CHAR_COUNT - 1) % PS_CHAR_COUNT);
        pawssprint_start(game);
    }
}

void pawssprint_input_down(ps_game_t *game)
{
    if (game->state == PS_STATE_TITLE) {
        game->selected_char = (ps_char_type_t)((game->selected_char + 1) % PS_CHAR_COUNT);
        game->pending_sound = PS_SND_JUMP;
    } else if (game->state == PS_STATE_PLAYING) {
        if (game->lane < (PS_LANE_COUNT - 1)) {
            game->lane++;
            game->target_x = LANES_X[game->lane];
            game->squash_x = 1.30f;
            game->squash_y = 0.75f;
            game->pending_sound = PS_SND_PATA;
        }
    } else if (game->state == PS_STATE_RESULT) {
        game->selected_char = (ps_char_type_t)((game->selected_char + 1) % PS_CHAR_COUNT);
        pawssprint_start(game);
    }
}

void pawssprint_input_ok(ps_game_t *game)
{
    if (game->state == PS_STATE_TITLE) {
        pawssprint_start(game);
    } else if (game->state == PS_STATE_PLAYING) {
        // 跳跃
        if (!game->is_jumping && game->slip_timer_ms <= 0.0f) {
            game->is_jumping = true;
            game->jump_v = 360.0f; // 垂直初速度
            game->squash_x = 0.75f;
            game->squash_y = 1.35f;
            game->pending_sound = PS_SND_JUMP;
        }
    } else if (game->state == PS_STATE_DIVE) {
        // 快速跳过慢镜头，直达结算
        game->state = PS_STATE_RESULT;
    } else if (game->state == PS_STATE_RESULT) {
        pawssprint_start(game);
    }
}
