#include "flydriver_logic.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

void flydriver_init(flydriver_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    g->player_x = 0.0f;
    g->player_speed = 220.0f;
    g->target_speed = 260.0f;
    g->steer_dir = 0;
    g->steer_timer = 0;

    g->nitro_gauge = 40;
    g->nitro_active = false;
    g->nitro_timer = 0;

    g->shields = 6;
    g->max_shields = 6;
    g->invincible_timer = 0;
    g->crash_flash = 0;

    g->track_curve = 0.0f;
    g->target_curve = 0.0f;
    g->curve_timer = 0;
    g->track_offset = 0.0f;

    g->score = 0;
    g->distance = 0;
    g->near_miss_count = 0;
    g->tick_count = 0;
    g->spawn_timer = 0;

    g->pending_snd = FLYDRIVER_SND_NONE;
    g->feedback_timer = 0;
    g->feedback_color = 0x00E5FF;
    strcpy(g->feedback_text, "ENGINE READY");

    g->game_over = false;
}

void flydriver_calc_coord(float track_x, float z, float curve, int *out_x, int *out_y, int *out_w, int *out_h)
{
    float depth = 1.0f - z;
    if (depth < 0.0f) depth = 0.0f;
    if (depth > 1.2f) depth = 1.2f;

    // 纵深透视映射
    float depth_curved = depth * depth;
    int y = (int)(25.0f + depth_curved * (215.0f - 25.0f));

    // 弯道动态偏移
    float curve_shift = (1.0f - depth) * curve * 42.0f;
    float center_x = 120.0f + curve_shift;

    // 赛道宽度随视深由小放大 (地平线 16px -> 近景 190px)
    float half_track_w = 14.0f + depth * 86.0f;
    float obj_x = center_x + track_x * half_track_w;

    int w = (int)(6.0f + depth * 28.0f);
    int h = (int)(4.0f + depth * 20.0f);

    if (out_x) *out_x = (int)(obj_x - (float)w / 2.0f);
    if (out_y) *out_y = (int)(y - (float)h / 2.0f);
    if (out_w) *out_w = w;
    if (out_h) *out_h = h;
}

static void spawn_particles(flydriver_game_t *g, float x, float y, uint32_t color, int count)
{
    for (int c = 0; c < count; c++) {
        for (int i = 0; i < FLYDRIVER_MAX_PARTICLES; i++) {
            if (!g->particles[i].active) {
                g->particles[i].active = true;
                g->particles[i].x = x;
                g->particles[i].y = y;
                float angle = (float)(rand() % 360) * 3.14159f / 180.0f;
                float spd = 2.0f + (float)(rand() % 35) / 10.0f;
                g->particles[i].vx = cosf(angle) * spd;
                g->particles[i].vy = sinf(angle) * spd;
                g->particles[i].life = 10 + (rand() % 6);
                g->particles[i].max_life = g->particles[i].life;
                g->particles[i].color = color;
                break;
            }
        }
    }
}

static void spawn_traffic(flydriver_game_t *g)
{
    for (int i = 0; i < FLYDRIVER_MAX_TRAFFIC; i++) {
        if (!g->traffic[i].active) {
            g->traffic[i].active = true;
            g->traffic[i].z = 1.0f; // 远景地平线
            g->traffic[i].near_miss_counted = false;

            // 4条常规车道分布 (-0.6, -0.2, 0.2, 0.6)
            static const float LANES[] = { -0.65f, -0.25f, 0.25f, 0.65f };
            g->traffic[i].x = LANES[rand() % 4];

            int roll = rand() % 100;
            if (roll < 45) {
                g->traffic[i].type = TRAFFIC_SCOUT;
                g->traffic[i].speed = 170.0f + (float)(rand() % 30);
            } else if (roll < 75) {
                g->traffic[i].type = TRAFFIC_TRUCK;
                g->traffic[i].speed = 130.0f + (float)(rand() % 20);
            } else if (roll < 90) {
                g->traffic[i].type = TRAFFIC_BOOST_PAD;
                g->traffic[i].speed = 0.0f; // 静止在地面
            } else {
                g->traffic[i].type = TRAFFIC_LASER_GATE;
                g->traffic[i].speed = 0.0f;
                g->traffic[i].gate_open = (rand() % 2 == 0);
            }
            break;
        }
    }
}

void flydriver_step(flydriver_game_t *g)
{
    if (!g || g->game_over) return;

    g->tick_count++;

    // 1. 计时器衰减
    if (g->steer_timer > 0) {
        g->steer_timer--;
        if (g->steer_timer <= 0) g->steer_dir = 0;
    }
    if (g->invincible_timer > 0) g->invincible_timer--;
    if (g->crash_flash > 0) g->crash_flash--;
    if (g->feedback_timer > 0) g->feedback_timer--;

    // 2. 氮气加速逻辑
    if (g->nitro_active) {
        g->nitro_timer--;
        g->player_speed = 420.0f;
        if (g->nitro_timer <= 0) {
            g->nitro_active = false;
            g->player_speed = g->target_speed;
        }
    } else {
        // 常规速度逐渐向目标速度逼近
        if (g->player_speed < g->target_speed) {
            g->player_speed += 1.8f;
        } else if (g->player_speed > g->target_speed + 5.0f) {
            g->player_speed -= 2.5f;
        }
        // 高速巡航自动缓慢蓄力氮气
        if (g->tick_count % 5 == 0 && g->nitro_gauge < 100) {
            g->nitro_gauge++;
        }
    }

    // 目标巡航速度随总里程缓慢递增 (难度平滑爬升)
    g->target_speed = 260.0f + (float)(g->distance / 800) * 10.0f;
    if (g->target_speed > 350.0f) g->target_speed = 350.0f;

    // 里程与积分累加
    int dist_delta = (int)(g->player_speed * 0.035f);
    g->distance += dist_delta;
    g->score += (int)(g->player_speed * 0.04f) * (g->nitro_active ? 3 : 1);

    // 赛道斑马线纵深平移速度
    g->track_offset += g->player_speed * 0.005f;
    if (g->track_offset > 1.0f) g->track_offset -= 1.0f;

    // 3. 动态弯道物理
    g->curve_timer++;
    if (g->curve_timer >= 140) {
        g->curve_timer = 0;
        int r = (rand() % 3) - 1; // -1, 0, 1
        g->target_curve = (float)r * 0.75f;
    }
    // 平滑插值至目标弯道
    g->track_curve += (g->target_curve - g->track_curve) * 0.03f;

    // 弯道离心力微幅推向外侧
    g->player_x -= g->track_curve * 0.006f;

    // 4. 果蝇仿生光流场自动居中偏航保护 (Optic Flow Centering Reflex)
    if (g->player_x < -0.75f) {
        g->player_x += 0.015f; // 靠左边缘时产生右推光流
    } else if (g->player_x > 0.75f) {
        g->player_x -= 0.015f; // 靠右边缘时产生左推光流
    }
    if (g->player_x < -0.85f) g->player_x = -0.85f;
    if (g->player_x > 0.85f) g->player_x = 0.85f;

    // 5. 交通车辆生成器
    g->spawn_timer++;
    int spawn_interval = (g->player_speed > 360.0f) ? 18 : 26;
    if (g->spawn_timer >= spawn_interval) {
        g->spawn_timer = 0;
        spawn_traffic(g);
    }

    // 6. 交通更新与碰撞 / 极限超车判定
    for (int i = 0; i < FLYDRIVER_MAX_TRAFFIC; i++) {
        if (!g->traffic[i].active) continue;

        flydriver_traffic_t *t = &g->traffic[i];
        float rel_speed = (g->player_speed - t->speed) / 2200.0f;
        if (rel_speed < 0.01f) rel_speed = 0.01f;
        float prev_z = t->z;
        t->z -= rel_speed;

        // 判定车身相交 (当前在窗口内，或者本帧高速掠过车身位置)
        bool in_hit_zone = (t->z <= 0.18f && t->z >= -0.18f) || (prev_z >= 0.0f && t->z <= 0.0f);
        if (in_hit_zone) {
            float dx = fabsf(g->player_x - t->x);
            float hit_box = (t->type == TRAFFIC_TRUCK) ? 0.36f :
                            ((t->type == TRAFFIC_LASER_GATE) ? 0.40f : 0.28f);

            if (dx <= hit_box) {
                if (t->type == TRAFFIC_BOOST_PAD) {
                    // 踩上光子加速带 (提速 + 充能 + 修复 1 点护盾)
                    g->player_speed = 400.0f;
                    g->nitro_gauge = (g->nitro_gauge + 25 > 100) ? 100 : g->nitro_gauge + 25;
                    if (g->shields < g->max_shields) g->shields++;
                    g->score += 300;
                    g->pending_snd = FLYDRIVER_SND_BOOST_PAD;
                    g->feedback_timer = 15;
                    g->feedback_color = 0x00E5FF;
                    strcpy(g->feedback_text, "BOOST PAD! +1 SHIELD");
                    t->active = false;
                } else if (g->nitro_active) {
                    // 氮气无敌冲刺：撞毁阻挡车辆！
                    g->score += 600;
                    int ox, oy;
                    flydriver_calc_coord(t->x, t->z, g->track_curve, &ox, &oy, NULL, NULL);
                    spawn_particles(g, (float)ox, (float)oy, 0xFFD700, 10);
                    g->pending_snd = FLYDRIVER_SND_CRASH;
                    g->feedback_timer = 18;
                    g->feedback_color = 0xFFD700;
                    strcpy(g->feedback_text, "WARP SMASH! +600");
                    t->active = false;
                } else if (g->invincible_timer <= 0) {
                    // 常规碰撞：扣除 1 点护盾
                    g->shields--;
                    g->crash_flash = 5;
                    g->invincible_timer = 48; // 给予更充分的受创无敌保护 (48 帧 / 1.7 秒)
                    g->player_speed = 140.0f; // 温和降速
                    g->pending_snd = FLYDRIVER_SND_CRASH;
                    g->feedback_timer = 20;
                    g->feedback_color = 0xFF3333;
                    strcpy(g->feedback_text, "COLLISION! -1 SHIELD");

                    int ox, oy;
                    flydriver_calc_coord(t->x, t->z, g->track_curve, &ox, &oy, NULL, NULL);
                    spawn_particles(g, (float)ox, (float)oy, 0xFF2255, 8);

                    if (g->shields <= 0) {
                        g->shields = 0;
                        g->game_over = true;
                        g->pending_snd = FLYDRIVER_SND_GAMEOVER;
                    }
                    t->active = false;
                }
            } else if (dx <= 0.52f && !t->near_miss_counted && t->type != TRAFFIC_BOOST_PAD) {
                // 极限贴身超车 (Near Miss) 获得果蝇神经反应奖励！
                t->near_miss_counted = true;
                g->near_miss_count++;
                g->score += 250;
                g->nitro_gauge = (g->nitro_gauge + 15 > 100) ? 100 : g->nitro_gauge + 15;
                // 每 2 次极限超车自动修复 1 点护盾
                if (g->near_miss_count % 2 == 0 && g->shields < g->max_shields) {
                    g->shields++;
                }
                g->pending_snd = FLYDRIVER_SND_NEARMISS;
                g->feedback_timer = 15;
                g->feedback_color = 0x33FF66;
                strcpy(g->feedback_text, "NEAR MISS! +15% NITRO");
            }
        }

        // 超车飞离视野后回收
        if (t->z < -0.25f) {
            t->active = false;
        }
    }

    // 7. 粒子衰减
    for (int i = 0; i < FLYDRIVER_MAX_PARTICLES; i++) {
        if (!g->particles[i].active) continue;
        g->particles[i].x += g->particles[i].vx;
        g->particles[i].y += g->particles[i].vy;
        g->particles[i].life--;
        if (g->particles[i].life <= 0) {
            g->particles[i].active = false;
        }
    }
}

void flydriver_steer_left(flydriver_game_t *g)
{
    if (!g || g->game_over) return;
    g->player_x -= 0.22f;
    if (g->player_x < -0.85f) g->player_x = -0.85f;
    g->steer_dir = -1;
    g->steer_timer = 5;
    g->pending_snd = FLYDRIVER_SND_DRIFT;
}

void flydriver_steer_right(flydriver_game_t *g)
{
    if (!g || g->game_over) return;
    g->player_x += 0.22f;
    if (g->player_x > 0.85f) g->player_x = 0.85f;
    g->steer_dir = 1;
    g->steer_timer = 5;
    g->pending_snd = FLYDRIVER_SND_DRIFT;
}

void flydriver_trigger_nitro(flydriver_game_t *g)
{
    if (!g || g->game_over) return;
    if (g->nitro_gauge >= 40 && !g->nitro_active) {
        g->nitro_active = true;
        g->nitro_timer = (g->nitro_gauge >= 100) ? 90 : 50;
        g->nitro_gauge = 0;
        g->invincible_timer = g->nitro_timer;
        g->player_speed = 420.0f;
        g->pending_snd = FLYDRIVER_SND_NITRO;
        g->feedback_timer = 20;
        g->feedback_color = 0xFFD700;
        strcpy(g->feedback_text, "WARP NITRO BOOST!!");
    }
}
