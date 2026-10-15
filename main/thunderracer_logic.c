#include "thunderracer_logic.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

void thunderracer_init(thunderracer_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    g->target_lane = 1; // 默认居中车道 (0: 左, 1: 中, 2: 右)
    g->lane_x = TR_LANE_X_MID;
    g->current_speed = TR_SPEED_BASE;
    g->max_speed = TR_SPEED_MAX_NORMAL;
    g->min_speed = TR_SPEED_MIN;

    g->shield = TR_INIT_SHIELD;
    g->max_shield = TR_MAX_SHIELD;
    g->nitro = TR_INIT_NITRO;
    g->max_nitro = TR_MAX_NITRO;
    g->ammo = TR_INIT_AMMO;
    g->max_ammo = TR_MAX_AMMO;

    g->nitro_active = false;
    g->invincible_timer = 0;
    g->screen_shake = 0;
    g->game_over = false;
    g->paused = false;

    g->score = 0;
    g->distance = 0;
    g->near_miss_count = 0;
    g->smash_count = 0;
    g->vehicles_destroyed = 0;
    g->tick_count = 0;
    g->spawn_timer = 0;
    g->drop_counter = 0;
    g->near_miss_combo = 0;
    g->near_miss_combo_timer = 0;
    g->max_near_miss_combo = 0;
    g->night_mode = false;

    for (int i = 0; i < TR_MAX_VEHICLES; i++) {
        g->vehicles[i].active = false;
    }
    for (int i = 0; i < TR_MAX_MISSILES; i++) {
        g->missiles[i].active = false;
    }
    for (int i = 0; i < TR_MAX_ITEMS; i++) {
        g->items[i].active = false;
    }
    for (int i = 0; i < TR_MAX_PARTICLES; i++) {
        g->particles[i].active = false;
    }
}

float thunderracer_lane_to_x(int lane)
{
    if (lane <= 0) return TR_LANE_X_LEFT;
    if (lane >= 2) return TR_LANE_X_RIGHT;
    return TR_LANE_X_MID;
}

void thunderracer_calc_coord(float track_x, float z, int *out_x, int *out_y, int *out_w, int *out_h)
{
    float depth = 1.0f - z;
    if (depth < 0.0f) depth = 0.0f;
    if (depth > 1.2f) depth = 1.2f;

    // 纵深透视映射 (非线性透视增强流速感)
    float depth_curved = depth * depth;
    int y = (int)(32.0f + depth_curved * (238.0f - 32.0f));

    // 赛道宽度随视深展开 (地平线 18px -> 近景 100px)
    float half_track_w = 18.0f + depth * 82.0f;
    float center_x = (float)TR_SCREEN_W / 2.0f;
    float obj_x = center_x + track_x * half_track_w;

    int w = (int)(10.0f + depth * 32.0f);
    int h = (int)(6.0f + depth * 22.0f);

    if (out_x) *out_x = (int)(obj_x - (float)w / 2.0f);
    if (out_y) *out_y = (int)(y - (float)h / 2.0f);
    if (out_w) *out_w = w;
    if (out_h) *out_h = h;
}

void thunderracer_steer_left(thunderracer_game_t *g)
{
    if (!g || g->game_over || g->paused) return;
    if (g->target_lane > 0) {
        g->target_lane--;
    }
}

void thunderracer_steer_right(thunderracer_game_t *g)
{
    if (!g || g->game_over || g->paused) return;
    if (g->target_lane < TR_NUM_LANES - 1) {
        g->target_lane++;
    }
}

bool thunderracer_fire_missile(thunderracer_game_t *g)
{
    if (!g || g->game_over || g->paused || g->ammo <= 0) return false;
    for (int i = 0; i < TR_MAX_MISSILES; i++) {
        if (!g->missiles[i].active) {
            g->missiles[i].active = true;
            g->missiles[i].x = g->lane_x;
            g->missiles[i].z = 0.04f;
            g->missiles[i].speed = 0.08f;
            g->missiles[i].damage = 1;
            g->missiles[i].guided = true;
            g->ammo--;
            g->snd_missile = true;
            return true;
        }
    }
    return false;
}

bool thunderracer_trigger_nitro(thunderracer_game_t *g)
{
    if (!g || g->game_over || g->paused) return false;
    if (g->nitro < TR_NITRO_MIN_TRIGGER) return false;
    g->nitro_active = true;
    g->snd_nitro = true;
    return true;
}

void thunderracer_toggle_pause(thunderracer_game_t *g)
{
    if (!g || g->game_over) return;
    g->paused = !g->paused;
}

void thunderracer_accelerate(thunderracer_game_t *g, float amount)
{
    if (!g || g->game_over || g->paused) return;
    float cap = g->nitro_active ? TR_SPEED_MAX_NITRO : g->max_speed;
    g->current_speed += amount;
    if (g->current_speed > cap) g->current_speed = cap;
}

void thunderracer_brake(thunderracer_game_t *g, float amount)
{
    if (!g || g->game_over || g->paused) return;
    g->current_speed -= amount;
    if (g->current_speed < g->min_speed) g->current_speed = g->min_speed;
}

void thunderracer_handle_input(thunderracer_game_t *g, tr_key_t key, tr_key_event_t ev)
{
    if (!g) return;
    if (g->game_over) {
        if (key == TR_KEY_OK && (ev == TR_KEY_EV_PRESS || ev == TR_KEY_EV_CLICK)) {
            thunderracer_init(g);
        }
        return;
    }

    if (key == TR_KEY_UP && (ev == TR_KEY_EV_PRESS || ev == TR_KEY_EV_CLICK)) {
        thunderracer_steer_left(g);
    } else if (key == TR_KEY_DOWN && (ev == TR_KEY_EV_PRESS || ev == TR_KEY_EV_CLICK)) {
        thunderracer_steer_right(g);
    } else if (key == TR_KEY_OK) {
        if (ev == TR_KEY_EV_CLICK || ev == TR_KEY_EV_PRESS) {
            thunderracer_fire_missile(g);
        } else if (ev == TR_KEY_EV_DOUBLE_CLICK || ev == TR_KEY_EV_LONG_PRESS) {
            thunderracer_trigger_nitro(g);
        }
    }
}

bool thunderracer_spawn_vehicle(thunderracer_game_t *g, tr_vehicle_type_t type, int lane, float z, float speed, int hp)
{
    if (!g) return false;
    for (int i = 0; i < TR_MAX_VEHICLES; i++) {
        if (!g->vehicles[i].active) {
            g->vehicles[i].active = true;
            g->vehicles[i].type = type;
            g->vehicles[i].lane = lane;
            g->vehicles[i].target_lane = lane;
            g->vehicles[i].x = thunderracer_lane_to_x(lane);
            g->vehicles[i].target_x = g->vehicles[i].x;
            g->vehicles[i].z = z;
            g->vehicles[i].speed = speed;
            g->vehicles[i].hp = hp;
            g->vehicles[i].max_hp = hp;
            g->vehicles[i].behavior_timer = 0;
            g->vehicles[i].near_miss_triggered = false;
            return true;
        }
    }
    return false;
}

bool thunderracer_spawn_item(thunderracer_game_t *g, tr_item_type_t type, float x, float z)
{
    if (!g) return false;
    for (int i = 0; i < TR_MAX_ITEMS; i++) {
        if (!g->items[i].active) {
            g->items[i].active = true;
            g->items[i].type = type;
            g->items[i].x = x;
            g->items[i].z = z;
            return true;
        }
    }
    return false;
}

void thunderracer_step(thunderracer_game_t *g)
{
    if (!g || g->game_over || g->paused) return;

    // 清空单帧触发音效
    g->snd_missile = false;
    g->snd_hit = false;
    g->snd_explode = false;
    g->snd_nitro = false;
    g->snd_smash = false;
    g->snd_near_miss = false;
    g->snd_item = false;
    g->snd_crash = false;
    g->snd_gameover = false;

    // 运行帧数累加与计时器衰减
    g->tick_count++;
    if (g->invincible_timer > 0) g->invincible_timer--;
    if (g->screen_shake > 0) g->screen_shake--;
    if (g->near_miss_combo_timer > 0) {
        g->near_miss_combo_timer--;
        if (g->near_miss_combo_timer == 0) {
            g->near_miss_combo = 0;
        }
    }
    g->night_mode = ((g->distance / TR_NIGHT_DISTANCE) % 2) == 1;

    // 战术充能：每 30 帧 (约 0.9s) 自动装填 1 发飞弹 (上限为初始 8 发)
    if (g->tick_count % 30 == 0 && g->ammo < TR_INIT_AMMO) {
        g->ammo++;
    }

    // 1. 车道平滑横向移动
    float target_x = thunderracer_lane_to_x(g->target_lane);
    float lane_diff = target_x - g->lane_x;
    if (fabsf(lane_diff) < 0.01f) {
        g->lane_x = target_x;
    } else {
        g->lane_x += lane_diff * TR_LANE_SMOOTH_FACTOR;
    }

    // 2. 氮气爆发与速度管理
    if (g->nitro_active) {
        g->current_speed += 12.0f;
        if (g->current_speed > TR_SPEED_MAX_NITRO) {
            g->current_speed = TR_SPEED_MAX_NITRO;
        }
        g->nitro -= TR_NITRO_DRAIN_PER_TICK;
        if (g->nitro <= 0.0f) {
            g->nitro = 0.0f;
            g->nitro_active = false;
        }
    } else {
        if (g->current_speed > g->max_speed) {
            g->current_speed -= TR_DECEL_RATE;
            if (g->current_speed < g->max_speed) {
                g->current_speed = g->max_speed;
            }
        } else if (g->current_speed < g->max_speed) {
            g->current_speed += TR_ACCEL_RATE;
            if (g->current_speed > g->max_speed) {
                g->current_speed = g->max_speed;
            }
        }
    }
    if (g->current_speed < g->min_speed) {
        g->current_speed = g->min_speed;
    }

    // 3. 里程与自然巡航得分
    g->distance += (int)(g->current_speed * 0.02f);
    g->score += (int)(g->current_speed * 0.005f);

    // 4. 车载飞弹更新与碰撞命中
    for (int i = 0; i < TR_MAX_MISSILES; i++) {
        tr_missile_t *m = &g->missiles[i];
        if (!m->active) continue;

        // 微导向锁定追踪
        if (m->guided) {
            float best_dist = 999.0f;
            float target_tgt_x = m->x;
            bool target_found = false;
            for (int j = 0; j < TR_MAX_VEHICLES; j++) {
                tr_vehicle_t *v = &g->vehicles[j];
                if (v->active && v->z > m->z && (v->z - m->z) < 0.6f) {
                    float lateral_dist = fabsf(v->x - m->x);
                    if (lateral_dist < 0.5f && (v->z - m->z) < best_dist) {
                        best_dist = v->z - m->z;
                        target_tgt_x = v->x;
                        target_found = true;
                    }
                }
            }
            if (target_found) {
                float mdx = target_tgt_x - m->x;
                if (fabsf(mdx) > 0.02f) {
                    m->x += (mdx > 0.0f ? 0.025f : -0.025f);
                } else {
                    m->x = target_tgt_x;
                }
            }
        }

        m->z += m->speed;
        if (m->z > 1.05f) {
            m->active = false;
            continue;
        }

        // 碰撞飞弹与敌车
        for (int j = 0; j < TR_MAX_VEHICLES; j++) {
            tr_vehicle_t *v = &g->vehicles[j];
            if (!v->active) continue;

            if (fabsf(m->z - v->z) < 0.06f && fabsf(m->x - v->x) < 0.25f) {
                m->active = false;
                v->hp -= m->damage;
                g->snd_hit = true;
                if (v->hp <= 0) {
                    v->active = false;
                    g->vehicles_destroyed++;
                    g->snd_explode = true;
                    int add_score = (v->type == TR_VEHICLE_POLICE) ? TR_SCORE_POLICE_CAR :
                                    (v->type == TR_VEHICLE_WEAVER ? TR_SCORE_WEAVER_CAR : TR_SCORE_SLOW_CAR);
                    g->score += add_score;
                    // 掉落补给道具
                    tr_item_type_t drop_type = (tr_item_type_t)((g->drop_counter++) % 3);
                    thunderracer_spawn_item(g, drop_type, v->x, v->z);
                }
                break;
            }
        }
    }

    // 5. 交通车辆 AI 行为与碰撞/超车判定
    for (int i = 0; i < TR_MAX_VEHICLES; i++) {
        tr_vehicle_t *v = &g->vehicles[i];
        if (!v->active) continue;

        // AI 行为更新
        if (v->type == TR_VEHICLE_WEAVER) {
            v->behavior_timer++;
            if (v->behavior_timer >= 60) {
                v->behavior_timer = 0;
                int next_lane = (v->lane == 0) ? 1 : ((v->lane == 2) ? 1 : ((rand() % 2 == 0) ? 0 : 2));
                v->lane = next_lane;
                v->target_x = thunderracer_lane_to_x(next_lane);
            }
            float cdx = v->target_x - v->x;
            if (fabsf(cdx) < 0.01f) {
                v->x = v->target_x;
            } else {
                v->x += cdx * 0.12f;
            }
        } else if (v->type == TR_VEHICLE_POLICE) {
            if (v->z > 0.1f && v->z < 0.65f) {
                float cdx = g->lane_x - v->x;
                if (fabsf(cdx) > 0.04f) {
                    v->x += (cdx > 0.0f ? 0.012f : -0.012f);
                }
            }
        }

        // 相对流速运动
        float rel_spd = g->current_speed - v->speed;
        float dz = rel_spd / 10000.0f;
        v->z -= dz;

        // 与玩家的碰撞及近身超车判定
        if (v->z >= -0.04f && v->z <= 0.10f) {
            float dx = fabsf(g->lane_x - v->x);

            // A. 碰撞判定
            if (dx < TR_COLLISION_DX) {
                if (g->nitro_active) {
                    // 氮气无敌冲撞 (Smash)
                    v->active = false;
                    g->smash_count++;
                    g->score += TR_SCORE_SMASH;
                    g->screen_shake = 10;
                    g->snd_smash = true;
                    tr_item_type_t drop_type = (tr_item_type_t)((g->drop_counter++) % 3);
                    thunderracer_spawn_item(g, drop_type, v->x, 0.05f);
                } else if (g->invincible_timer > 0) {
                    // 处于受创保护期，不重复扣血
                } else {
                    // 普通撞击扣损护盾
                    int dmg = (v->type == TR_VEHICLE_POLICE) ? 35 : ((v->type == TR_VEHICLE_WEAVER) ? 25 : 20);
                    g->shield -= dmg;
                    v->active = false;
                    g->screen_shake = 8;
                    g->current_speed = (g->current_speed - 60.0f < g->min_speed) ? g->min_speed : (g->current_speed - 60.0f);
                    if (g->shield <= 0) {
                        g->shield = 0;
                        g->game_over = true;
                        g->snd_gameover = true;
                    } else {
                        g->snd_crash = true;
                        g->invincible_timer = TR_INVINCIBLE_FRAMES;
                    }
                }
            }
            // B. 近身超车 (Near-Miss) 判定
            else if (dx >= TR_NEARMISS_DX_MIN && dx <= TR_NEARMISS_DX_MAX) {
                if (!v->near_miss_triggered && g->current_speed > v->speed) {
                    v->near_miss_triggered = true;
                    g->near_miss_count++;
                    if (g->near_miss_combo_timer > 0) {
                        g->near_miss_combo++;
                    } else {
                        g->near_miss_combo = 1;
                    }
                    if (g->near_miss_combo > g->max_near_miss_combo) {
                        g->max_near_miss_combo = g->near_miss_combo;
                    }
                    g->near_miss_combo_timer = TR_NEARMISS_COMBO_FRAMES;
                    int mul = (g->near_miss_combo > 1) ? g->near_miss_combo : 1;
                    g->score += TR_SCORE_NEARMISS * mul;
                    g->nitro += TR_NITRO_REWARD_NEARMISS + (float)(mul - 1) * 4.0f;
                    if (g->nitro > g->max_nitro) {
                        g->nitro = g->max_nitro;
                    }
                    g->snd_near_miss = true;
                }
            }
        }

        // 超出边界回收
        if (v->z < -0.15f) {
            if (v->active) {
                g->score += TR_SCORE_PASS;
                v->active = false;
            }
        } else if (v->z > 1.3f) {
            v->active = false;
        }
    }

    // 6. 道具飘落与拾取判定
    for (int i = 0; i < TR_MAX_ITEMS; i++) {
        tr_item_t *item = &g->items[i];
        if (!item->active) continue;

        item->z -= (g->current_speed / 12000.0f);

        if (item->z >= -0.04f && item->z <= 0.10f && fabsf(g->lane_x - item->x) < 0.28f) {
            if (item->type == TR_ITEM_HEART) {
                g->shield += 30;
                if (g->shield > g->max_shield) g->shield = g->max_shield;
            } else if (item->type == TR_ITEM_NITRO) {
                g->nitro += 35.0f;
                if (g->nitro > g->max_nitro) g->nitro = g->max_nitro;
            } else if (item->type == TR_ITEM_AMMO) {
                g->ammo += 5;
                if (g->ammo > g->max_ammo) g->ammo = g->max_ammo;
            }
            g->score += TR_SCORE_ITEM;
            g->snd_item = true;
            item->active = false;
            continue;
        }

        if (item->z < -0.15f) {
            item->active = false;
        }
    }

    // 7. 周期性自动生成前行车辆
    g->spawn_timer++;
    if (g->spawn_timer >= 45) {
        g->spawn_timer = 0;
        int lane = rand() % TR_NUM_LANES;
        bool blocked = false;
        for (int j = 0; j < TR_MAX_VEHICLES; j++) {
            if (g->vehicles[j].active && g->vehicles[j].lane == lane && g->vehicles[j].z > 0.70f) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            int r = rand() % 100;
            tr_vehicle_type_t vtype = TR_VEHICLE_SLOW;
            float spd = 100.0f;
            int hp = 1;
            if (r < 50) {
                vtype = TR_VEHICLE_SLOW;
                spd = 90.0f + (float)(rand() % 25);
                hp = 1;
            } else if (r < 80) {
                vtype = TR_VEHICLE_WEAVER;
                spd = 130.0f + (float)(rand() % 30);
                hp = 2;
            } else {
                vtype = TR_VEHICLE_POLICE;
                spd = 180.0f + (float)(rand() % 30);
                hp = 3;
            }
            thunderracer_spawn_vehicle(g, vtype, lane, 1.0f, spd, hp);
        }
    }
}
