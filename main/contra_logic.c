#include "contra_logic.h"
#include <math.h>
#include <string.h>

static inline bool check_collision(float x1, float y1, int w1, int h1,
                                   float x2, float y2, int w2, int h2)
{
    return (x1 < x2 + (float)w2 &&
            x1 + (float)w1 > x2 &&
            y1 < y2 + (float)h2 &&
            y1 + (float)h1 > y2);
}

static bool spawn_player_bullet(contra_game_t *g, float x, float y, float vx, float vy,
                                int dmg, bool piercing, int w, int h, contra_weapon_t wt)
{
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        if (!g->player_bullets[i].active) {
            contra_bullet_t *b = &g->player_bullets[i];
            b->x = x;
            b->y = y;
            b->vx = vx;
            b->vy = vy;
            b->dmg = dmg;
            b->piercing = piercing;
            b->w = w;
            b->h = h;
            b->weapon_type = wt;
            b->hit_mask = 0;
            b->active = true;
            return true;
        }
    }
    return false;
}

static bool spawn_enemy_bullet(contra_game_t *g, float x, float y, float vx, float vy,
                               int dmg, int w, int h)
{
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        if (!g->enemy_bullets[i].active) {
            contra_bullet_t *b = &g->enemy_bullets[i];
            b->x = x;
            b->y = y;
            b->vx = vx;
            b->vy = vy;
            b->dmg = dmg;
            b->piercing = false;
            b->w = w;
            b->h = h;
            b->hit_mask = 0;
            b->active = true;
            return true;
        }
    }
    return false;
}

void contra_logic_init(contra_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    g->player_w = CONTRA_PLAYER_WIDTH;
    g->player_h = CONTRA_PLAYER_STAND_H;
    g->player_x = 40.0f;
    g->player_y = CONTRA_GROUND_Y - (float)CONTRA_PLAYER_STAND_H;
    g->player_vx = 0.0f;
    g->player_vy = 0.0f;

    g->player_hp = 3;
    g->player_max_hp = 3;
    g->lives = 3;
    g->invincible_timer_ms = 0;

    g->is_crouching = false;
    g->is_jumping = false;
    g->is_grounded = true;

    g->aim_dir = CONTRA_AIM_FORWARD;
    g->facing_dir = 1; // 默认面朝右侧
    g->weapon_type = CONTRA_WEAPON_NORMAL;
    g->fire_cooldown_ms = 0;
    g->bombs = 2;

    g->score = 0;
    g->game_time_ms = 0;
    g->paused = false;
    g->game_over = false;
    g->victory = false;
}

void contra_logic_move_left(contra_game_t *g)
{
    if (!g || g->is_crouching) return;
    g->player_vx = -CONTRA_PLAYER_SPEED;
    g->facing_dir = -1;
}

void contra_logic_move_right(contra_game_t *g)
{
    if (!g || g->is_crouching) return;
    g->player_vx = CONTRA_PLAYER_SPEED;
    g->facing_dir = 1;
}

void contra_logic_stop_x(contra_game_t *g)
{
    if (!g) return;
    g->player_vx = 0.0f;
}

void contra_logic_jump(contra_game_t *g)
{
    if (!g || !g->is_grounded || g->is_crouching) return;
    g->player_vy = -CONTRA_JUMP_SPEED;
    g->is_jumping = true;
    g->is_grounded = false;
}

void contra_logic_crouch(contra_game_t *g, bool crouch)
{
    if (!g || !g->is_grounded) return;
    g->is_crouching = crouch;
    if (crouch) {
        g->player_h = CONTRA_PLAYER_CROUCH_H;
        g->player_y = CONTRA_GROUND_Y - (float)CONTRA_PLAYER_CROUCH_H;
        g->player_vx = 0.0f;
    } else {
        g->player_h = CONTRA_PLAYER_STAND_H;
        g->player_y = CONTRA_GROUND_Y - (float)CONTRA_PLAYER_STAND_H;
    }
}

void contra_logic_aim(contra_game_t *g, contra_aim_t aim)
{
    if (!g) return;
    g->aim_dir = aim;
}

void contra_logic_btn_up(contra_game_t *g, bool pressed)
{
    if (!g) return;
    g->key_up = pressed;
    if (pressed) {
        if (g->is_grounded && !g->is_crouching) {
            contra_logic_jump(g);
        } else {
            g->aim_dir = CONTRA_AIM_UP;
        }
    } else {
        if (g->aim_dir == CONTRA_AIM_UP) {
            g->aim_dir = CONTRA_AIM_FORWARD;
        }
    }
}

void contra_logic_btn_down(contra_game_t *g, bool pressed)
{
    if (!g) return;
    g->key_down = pressed;
    if (pressed) {
        if (g->is_grounded) {
            contra_logic_crouch(g, true);
        } else {
            g->aim_dir = CONTRA_AIM_DOWN;
        }
    } else {
        if (g->is_grounded) {
            contra_logic_crouch(g, false);
        }
        if (g->aim_dir == CONTRA_AIM_DOWN) {
            g->aim_dir = CONTRA_AIM_FORWARD;
        }
    }
}

void contra_logic_btn_ok(contra_game_t *g, bool pressed)
{
    if (!g) return;
    g->key_ok = pressed;
    if (pressed) {
        contra_logic_fire(g);
    }
}

bool contra_logic_fire(contra_game_t *g)
{
    if (!g || g->fire_cooldown_ms > 0 || g->game_over || g->victory) return false;

    float dir_x = 0.0f, dir_y = 0.0f;
    switch (g->aim_dir) {
        case CONTRA_AIM_UP:
            dir_x = 0.0f;
            dir_y = -1.0f;
            break;
        case CONTRA_AIM_DOWN:
            dir_x = 0.0f;
            dir_y = 1.0f;
            break;
        case CONTRA_AIM_UP_DIAG:
            dir_x = (g->facing_dir > 0) ? 0.7071f : -0.7071f;
            dir_y = -0.7071f;
            break;
        case CONTRA_AIM_DOWN_DIAG:
            dir_x = (g->facing_dir > 0) ? 0.7071f : -0.7071f;
            dir_y = 0.7071f;
            break;
        case CONTRA_AIM_FORWARD:
        default:
            dir_x = (g->facing_dir > 0) ? 1.0f : -1.0f;
            dir_y = 0.0f;
            break;
    }

    float sx = (g->facing_dir > 0) ? (g->player_x + (float)g->player_w) : (g->player_x - 6.0f);
    float sy = g->player_y + 10.0f;
    if (g->is_crouching) {
        sy = g->player_y + 6.0f;
    }
    if (g->aim_dir == CONTRA_AIM_UP) {
        sx = g->player_x + (float)g->player_w / 2.0f - 2.0f;
        sy = g->player_y - 6.0f;
    } else if (g->aim_dir == CONTRA_AIM_DOWN) {
        sx = g->player_x + (float)g->player_w / 2.0f - 2.0f;
        sy = g->player_y + (float)g->player_h + 2.0f;
    }

    switch (g->weapon_type) {
        case CONTRA_WEAPON_NORMAL:
            spawn_player_bullet(g, sx, sy, dir_x * 320.0f, dir_y * 320.0f, 1, false, 4, 4, CONTRA_WEAPON_NORMAL);
            g->fire_cooldown_ms = 180;
            g->snd.snd_fire = true;
            break;

        case CONTRA_WEAPON_SPREAD: {
            // 中心子弹
            spawn_player_bullet(g, sx, sy, dir_x * 300.0f, dir_y * 300.0f, 2, false, 6, 6, CONTRA_WEAPON_SPREAD);
            // 扇形向上 18 度 (+0.314 rad)
            const float cos_a = 0.9511f;
            const float sin_a = 0.3090f;
            float vx_up = (dir_x * cos_a - dir_y * (-sin_a)) * 300.0f;
            float vy_up = (dir_x * (-sin_a) + dir_y * cos_a) * 300.0f;
            spawn_player_bullet(g, sx, sy, vx_up, vy_up, 2, false, 6, 6, CONTRA_WEAPON_SPREAD);
            // 扇形向下 18 度 (-0.314 rad)
            float vx_dn = (dir_x * cos_a - dir_y * sin_a) * 300.0f;
            float vy_dn = (dir_x * sin_a + dir_y * cos_a) * 300.0f;
            spawn_player_bullet(g, sx, sy, vx_dn, vy_dn, 2, false, 6, 6, CONTRA_WEAPON_SPREAD);

            g->fire_cooldown_ms = 220;
            g->snd.snd_spread = true;
            break;
        }

        case CONTRA_WEAPON_LASER: {
            int bw = 18;
            int bh = 6;
            if (fabsf(dir_y) > 0.8f) {
                bw = 6;
                bh = 18;
            }
            spawn_player_bullet(g, sx, sy, dir_x * 450.0f, dir_y * 450.0f, 4, true, bw, bh, CONTRA_WEAPON_LASER);
            g->fire_cooldown_ms = 250;
            g->snd.snd_laser = true;
            break;
        }

        case CONTRA_WEAPON_MACHINEGUN:
            spawn_player_bullet(g, sx, sy, dir_x * 380.0f, dir_y * 380.0f, 1, false, 5, 5, CONTRA_WEAPON_MACHINEGUN);
            g->fire_cooldown_ms = 75; // 极高射速
            g->snd.snd_fire = true;
            break;
    }

    return true;
}

static void contra_register_kill(contra_game_t *g, int base_score)
{
    g->combo++;
    if (g->combo > g->max_combo) {
        g->max_combo = g->combo;
    }
    g->combo_timer_ms = 1600;
    int mul = (g->combo > 1) ? g->combo : 1;
    g->score += base_score * mul;
}

bool contra_logic_throw_bomb(contra_game_t *g)
{
    if (!g || g->bombs <= 0) return false;
    g->bombs--;
    g->snd.snd_explode = true;

    // 清空所有敌方子弹
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        g->enemy_bullets[i].active = false;
    }

    // 全屏敌人伤害 10 点
    for (int i = 0; i < CONTRA_MAX_ENEMIES; i++) {
        contra_enemy_t *e = &g->enemies[i];
        if (!e->active) continue;

        e->hp -= 10;
        if (e->hp <= 0) {
            e->hp = 0;
            e->active = false;
            if (e->type == CONTRA_ENEMY_BOSS) {
                e->boss_phase = BOSS_PHASE_DEAD;
                g->victory = true;
                contra_register_kill(g, 5000);
                g->snd.snd_boss_dead = true;
            } else if (e->type == CONTRA_ENEMY_CAPSULE) {
                contra_logic_spawn_item(g, e->drop_badge, e->x, e->y);
                contra_register_kill(g, 200);
            } else {
                contra_register_kill(g, (e->type == CONTRA_ENEMY_TURRET) ? 300 : 100);
            }
        }
    }

    return true;
}

int contra_logic_spawn_enemy(contra_game_t *g, contra_enemy_type_t type, float x, float y)
{
    if (!g) return -1;
    for (int i = 0; i < CONTRA_MAX_ENEMIES; i++) {
        if (!g->enemies[i].active) {
            contra_enemy_t *e = &g->enemies[i];
            memset(e, 0, sizeof(*e));
            e->active = true;
            e->type = type;
            e->x = x;
            e->y = y;

            switch (type) {
                case CONTRA_ENEMY_TURRET:
                    e->w = 24;
                    e->h = 24;
                    e->hp = 6;
                    e->max_hp = 6;
                    e->attack_timer_ms = 1000;
                    break;
                case CONTRA_ENEMY_FOOT_SOLDIER:
                    e->w = 14;
                    e->h = 26;
                    e->hp = 2;
                    e->max_hp = 2;
                    e->patrol_dir = -1;
                    break;
                case CONTRA_ENEMY_CAPSULE:
                    e->w = 20;
                    e->h = 12;
                    e->hp = 1;
                    e->max_hp = 1;
                    e->vx = -70.0f;
                    e->capsule_base_y = y;
                    e->drop_badge = CONTRA_BADGE_S;
                    break;
                case CONTRA_ENEMY_BOSS:
                    e->w = 42;
                    e->h = 56;
                    e->hp = 150;
                    e->max_hp = 150;
                    e->boss_phase = BOSS_PHASE_1_ARMORED;
                    e->vy = 40.0f;
                    e->attack_timer_ms = 900;
                    break;
            }
            return i;
        }
    }
    return -1;
}

int contra_logic_spawn_capsule(contra_game_t *g, float x, float y, contra_badge_t badge)
{
    int idx = contra_logic_spawn_enemy(g, CONTRA_ENEMY_CAPSULE, x, y);
    if (idx >= 0) {
        g->enemies[idx].drop_badge = badge;
    }
    return idx;
}

int contra_logic_spawn_boss(contra_game_t *g, float x, float y, int max_hp)
{
    int idx = contra_logic_spawn_enemy(g, CONTRA_ENEMY_BOSS, x, y);
    if (idx >= 0) {
        g->enemies[idx].hp = max_hp;
        g->enemies[idx].max_hp = max_hp;
        g->enemies[idx].boss_phase = BOSS_PHASE_1_ARMORED;
    }
    return idx;
}

int contra_logic_spawn_item(contra_game_t *g, contra_badge_t badge, float x, float y)
{
    if (!g || badge == CONTRA_BADGE_NONE) return -1;
    for (int i = 0; i < CONTRA_MAX_ITEMS; i++) {
        if (!g->items[i].active) {
            contra_item_t *it = &g->items[i];
            it->active = true;
            it->badge = badge;
            it->x = x;
            it->y = y;
            it->vy = 70.0f;
            it->w = 12;
            it->h = 12;
            return i;
        }
    }
    return -1;
}

void contra_logic_update(contra_game_t *g, uint32_t dt_ms)
{
    if (!g || g->paused || g->game_over || g->victory) return;

    memset(&g->snd, 0, sizeof(g->snd));
    g->game_time_ms += dt_ms;
    float dt = (float)dt_ms / 1000.0f;

    // 计时器递减
    if (g->fire_cooldown_ms > 0) {
        g->fire_cooldown_ms = (g->fire_cooldown_ms > (int)dt_ms) ? (g->fire_cooldown_ms - (int)dt_ms) : 0;
    }
    if (g->invincible_timer_ms > 0) {
        g->invincible_timer_ms = (g->invincible_timer_ms > (int)dt_ms) ? (g->invincible_timer_ms - (int)dt_ms) : 0;
    }
    if (g->combo_timer_ms > 0) {
        g->combo_timer_ms = (g->combo_timer_ms > (int)dt_ms) ? (g->combo_timer_ms - (int)dt_ms) : 0;
        if (g->combo_timer_ms == 0) {
            g->combo = 0;
        }
    }

    // 机枪连发
    if (g->key_ok && g->weapon_type == CONTRA_WEAPON_MACHINEGUN && g->fire_cooldown_ms == 0) {
        contra_logic_fire(g);
    }

    // 玩家水平与垂直物理
    g->player_x += g->player_vx * dt;
    if (g->player_x < 0.0f) g->player_x = 0.0f;
    if (g->player_x > (float)(CONTRA_SCREEN_W - g->player_w)) {
        g->player_x = (float)(CONTRA_SCREEN_W - g->player_w);
    }

    if (!g->is_grounded) {
        g->player_vy += CONTRA_GRAVITY * dt;
        g->player_y += g->player_vy * dt;
        if (g->player_y + (float)g->player_h >= CONTRA_GROUND_Y) {
            g->player_y = CONTRA_GROUND_Y - (float)g->player_h;
            g->player_vy = 0.0f;
            g->is_jumping = false;
            g->is_grounded = true;
        }
    } else {
        if (g->is_crouching) {
            g->player_h = CONTRA_PLAYER_CROUCH_H;
            g->player_y = CONTRA_GROUND_Y - (float)CONTRA_PLAYER_CROUCH_H;
        } else {
            g->player_h = CONTRA_PLAYER_STAND_H;
            g->player_y = CONTRA_GROUND_Y - (float)CONTRA_PLAYER_STAND_H;
        }
    }

    // 更新玩家子弹
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        contra_bullet_t *b = &g->player_bullets[i];
        if (!b->active) continue;

        b->x += b->vx * dt;
        b->y += b->vy * dt;

        // 越界回收
        if (b->x < -20.0f || b->x > (float)CONTRA_SCREEN_W + 20.0f ||
            b->y < -20.0f || b->y > (float)CONTRA_SCREEN_H + 20.0f) {
            b->active = false;
            continue;
        }

        // 检测击中敌人
        for (int j = 0; j < CONTRA_MAX_ENEMIES; j++) {
            contra_enemy_t *e = &g->enemies[j];
            if (!e->active) continue;

            if (check_collision(b->x, b->y, b->w, b->h, e->x, e->y, e->w, e->h)) {
                if (b->piercing) {
                    if ((b->hit_mask & (1U << j)) != 0) {
                        continue;
                    }
                    b->hit_mask |= (1U << j);
                }

                e->hp -= b->dmg;
                g->snd.snd_hit = true;

                if (e->hp <= 0) {
                    e->hp = 0;
                    e->active = false;
                    if (e->type == CONTRA_ENEMY_BOSS) {
                        e->boss_phase = BOSS_PHASE_DEAD;
                        g->victory = true;
                        contra_register_kill(g, 5000);
                        g->snd.snd_boss_dead = true;
                    } else if (e->type == CONTRA_ENEMY_CAPSULE) {
                        contra_logic_spawn_item(g, e->drop_badge, e->x, e->y);
                        g->snd.snd_explode = true;
                        contra_register_kill(g, 200);
                    } else {
                        g->snd.snd_explode = true;
                        contra_register_kill(g, (e->type == CONTRA_ENEMY_TURRET) ? 300 : 100);
                    }
                } else if (e->type == CONTRA_ENEMY_BOSS) {
                    g->snd.snd_boss_hit = true;
                }

                if (!b->piercing) {
                    b->active = false;
                    break;
                }
            }
        }
    }

    // 更新敌方子弹
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        contra_bullet_t *eb = &g->enemy_bullets[i];
        if (!eb->active) continue;

        eb->x += eb->vx * dt;
        eb->y += eb->vy * dt;

        if (eb->x < -20.0f || eb->x > (float)CONTRA_SCREEN_W + 20.0f ||
            eb->y < -20.0f || eb->y > (float)CONTRA_SCREEN_H + 20.0f) {
            eb->active = false;
            continue;
        }

        // 击中玩家判定 (考虑站立与下蹲的不同判定盒)
        if (check_collision(eb->x, eb->y, eb->w, eb->h,
                            g->player_x, g->player_y, g->player_w, g->player_h)) {
            eb->active = false;
            if (g->invincible_timer_ms <= 0) {
                g->player_hp -= eb->dmg;
                g->snd.snd_player_hit = true;
                g->invincible_timer_ms = CONTRA_INVINCIBLE_TIME_MS;

                if (g->player_hp <= 0) {
                    g->lives--;
                    g->snd.snd_player_die = true;
                    if (g->lives <= 0) {
                        g->game_over = true;
                    } else {
                        g->player_hp = g->player_max_hp;
                        g->player_x = 40.0f;
                        g->player_y = CONTRA_GROUND_Y - (float)g->player_h;
                        g->invincible_timer_ms = 2500;
                    }
                }
            }
        }
    }

    // 更新敌人行为
    for (int j = 0; j < CONTRA_MAX_ENEMIES; j++) {
        contra_enemy_t *e = &g->enemies[j];
        if (!e->active) continue;

        switch (e->type) {
            case CONTRA_ENEMY_TURRET: {
                e->attack_timer_ms -= (int)dt_ms;
                if (e->attack_timer_ms <= 0) {
                    e->attack_timer_ms = 1200;
                    float pcx = g->player_x + (float)g->player_w / 2.0f;
                    float pcy = g->player_y + (float)g->player_h / 2.0f;
                    float ecx = e->x + (float)e->w / 2.0f;
                    float ecy = e->y + (float)e->h / 2.0f;
                    float dx = pcx - ecx;
                    float dy = pcy - ecy;
                    float dist = sqrtf(dx * dx + dy * dy);
                    if (dist > 0.001f) {
                        float spd = 130.0f;
                        spawn_enemy_bullet(g, ecx - 3.0f, ecy - 3.0f,
                                           (dx / dist) * spd, (dy / dist) * spd, 1, 6, 6);
                    }
                }
                break;
            }

            case CONTRA_ENEMY_FOOT_SOLDIER: {
                e->x += (float)e->patrol_dir * 50.0f * dt;
                if (e->x <= 10.0f) {
                    e->x = 10.0f;
                    e->patrol_dir = 1;
                }
                if (e->x >= (float)(CONTRA_SCREEN_W - e->w - 10)) {
                    e->x = (float)(CONTRA_SCREEN_W - e->w - 10);
                    e->patrol_dir = -1;
                }

                if (check_collision(e->x, e->y, e->w, e->h,
                                    g->player_x, g->player_y, g->player_w, g->player_h)) {
                    if (g->invincible_timer_ms <= 0) {
                        g->player_hp -= 1;
                        g->snd.snd_player_hit = true;
                        g->invincible_timer_ms = CONTRA_INVINCIBLE_TIME_MS;
                        if (g->player_hp <= 0) {
                            g->lives--;
                            g->snd.snd_player_die = true;
                            if (g->lives <= 0) {
                                g->game_over = true;
                            } else {
                                g->player_hp = g->player_max_hp;
                                g->player_x = 40.0f;
                                g->player_y = CONTRA_GROUND_Y - (float)g->player_h;
                                g->invincible_timer_ms = 2500;
                            }
                        }
                    }
                }
                break;
            }

            case CONTRA_ENEMY_CAPSULE: {
                e->x += e->vx * dt;
                e->capsule_phase += 3.5f * dt;
                e->y = e->capsule_base_y + 12.0f * sinf(e->capsule_phase);
                if (e->x < -30.0f || e->x > (float)CONTRA_SCREEN_W + 30.0f) {
                    e->active = false;
                }
                break;
            }

            case CONTRA_ENEMY_BOSS: {
                int mhp = e->max_hp > 0 ? e->max_hp : 150;
                if (e->hp > (mhp * 2) / 3) {
                    e->boss_phase = BOSS_PHASE_1_ARMORED;
                } else if (e->hp > mhp / 3) {
                    e->boss_phase = BOSS_PHASE_2_EXPOSED;
                } else if (e->hp > 0) {
                    e->boss_phase = BOSS_PHASE_3_ENRAGED;
                }

                if (e->boss_phase == BOSS_PHASE_1_ARMORED) {
                    // Phase 1: 双副炮掩护开火
                    e->attack_timer_ms -= (int)dt_ms;
                    if (e->attack_timer_ms <= 0) {
                        e->attack_timer_ms = 900;
                        spawn_enemy_bullet(g, e->x - 6.0f, e->y + 10.0f, -140.0f, 0.0f, 1, 6, 6);
                        spawn_enemy_bullet(g, e->x - 6.0f, e->y + (float)e->h - 16.0f, -140.0f, 0.0f, 1, 6, 6);
                    }
                } else if (e->boss_phase == BOSS_PHASE_2_EXPOSED) {
                    // Phase 2: 上下悬浮，发射扇形散射
                    e->y += e->vy * dt;
                    if (e->y <= 60.0f) {
                        e->y = 60.0f;
                        e->vy = fabsf(e->vy);
                    }
                    if (e->y >= 200.0f) {
                        e->y = 200.0f;
                        e->vy = -fabsf(e->vy);
                    }

                    e->attack_timer_ms -= (int)dt_ms;
                    if (e->attack_timer_ms <= 0) {
                        e->attack_timer_ms = 650;
                        float cy = e->y + (float)e->h / 2.0f;
                        spawn_enemy_bullet(g, e->x - 6.0f, cy, -150.0f, -40.0f, 1, 6, 6);
                        spawn_enemy_bullet(g, e->x - 6.0f, cy, -160.0f, 0.0f, 1, 6, 6);
                        spawn_enemy_bullet(g, e->x - 6.0f, cy, -150.0f, 40.0f, 1, 6, 6);
                    }
                } else if (e->boss_phase == BOSS_PHASE_3_ENRAGED) {
                    // Phase 3: 高速机动与超频弹幕
                    float spd = (e->vy > 0) ? 80.0f : -80.0f;
                    e->y += spd * dt;
                    if (e->y <= 50.0f) {
                        e->y = 50.0f;
                        e->vy = 80.0f;
                    }
                    if (e->y >= 210.0f) {
                        e->y = 210.0f;
                        e->vy = -80.0f;
                    }

                    e->attack_timer_ms -= (int)dt_ms;
                    if (e->attack_timer_ms <= 0) {
                        e->attack_timer_ms = 400;
                        float pcx = g->player_x + (float)g->player_w / 2.0f;
                        float pcy = g->player_y + (float)g->player_h / 2.0f;
                        float ecx = e->x;
                        float ecy = e->y + (float)e->h / 2.0f;
                        float dx = pcx - ecx;
                        float dy = pcy - ecy;
                        float dist = sqrtf(dx * dx + dy * dy);
                        if (dist > 0.001f) {
                            float b_spd = 180.0f;
                            spawn_enemy_bullet(g, ecx - 6.0f, ecy - 3.0f, (dx / dist) * b_spd, (dy / dist) * b_spd, 1, 6, 6);
                            spawn_enemy_bullet(g, ecx - 6.0f, ecy - 3.0f, -160.0f, -60.0f, 1, 6, 6);
                            spawn_enemy_bullet(g, ecx - 6.0f, ecy - 3.0f, -160.0f, 60.0f, 1, 6, 6);
                        }
                    }
                }
                break;
            }
        }
    }

    // 更新掉落道具与玩家拾取
    for (int k = 0; k < CONTRA_MAX_ITEMS; k++) {
        contra_item_t *it = &g->items[k];
        if (!it->active) continue;

        it->y += it->vy * dt;
        if (it->y + (float)it->h >= CONTRA_GROUND_Y) {
            it->y = CONTRA_GROUND_Y - (float)it->h;
            it->vy = 0.0f;
        }

        // 三键没有独立前进：落地后徽章自动滑向玩家，避免打出 L/S/M/P 却捡不到
        if (it->vy == 0.0f) {
            float target_x = g->player_x + (float)g->player_w * 0.5f - (float)it->w * 0.5f;
            float dx = target_x - it->x;
            float step = 95.0f * dt;
            if (dx > step) {
                it->x += step;
            } else if (dx < -step) {
                it->x -= step;
            } else {
                it->x = target_x;
            }
        }

        if (check_collision(it->x, it->y, it->w, it->h,
                            g->player_x, g->player_y, g->player_w, g->player_h)) {
            it->active = false;
            g->score += 500;
            g->snd.snd_upgrade = true;

            switch (it->badge) {
                case CONTRA_BADGE_S:
                    g->weapon_type = CONTRA_WEAPON_SPREAD;
                    break;
                case CONTRA_BADGE_L:
                    g->weapon_type = CONTRA_WEAPON_LASER;
                    break;
                case CONTRA_BADGE_M:
                    g->weapon_type = CONTRA_WEAPON_MACHINEGUN;
                    break;
                case CONTRA_BADGE_BOMB:
                    g->bombs += 2;
                    break;
                case CONTRA_BADGE_BARRIER:
                    g->invincible_timer_ms += 5000;
                    break;
                default:
                    break;
            }
        }
    }
}
