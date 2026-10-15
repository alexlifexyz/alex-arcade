#include "adventure_logic.h"
#include <math.h>
#include <string.h>

bool adventure_check_aabb(float x1, float y1, int w1, int h1,
                          float x2, float y2, int w2, int h2)
{
    return (x1 < x2 + (float)w2 &&
            x1 + (float)w1 > x2 &&
            y1 < y2 + (float)h2 &&
            y1 + (float)h1 > y2);
}

void adventure_logic_init(adventure_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));

    // 玩家初始状态
    g->player.w = ADVENTURE_PLAYER_W;
    g->player.h = ADVENTURE_PLAYER_H;
    g->player.x = 24.0f;
    g->player.y = ADVENTURE_GROUND_Y - (float)g->player.h;
    g->player.vx = 0.0f;
    g->player.vy = 0.0f;
    g->player.facing = 1; // 默认面朝右侧
    g->player.is_jumping = false;
    g->player.on_ground = true;
    g->player.stamina = ADVENTURE_MAX_STAMINA;
    g->player.lives = ADVENTURE_INIT_LIVES;
    g->player.score = 0;
    g->player.weapon = ADV_WEAPON_AXE; // 默认石斧
    g->player.invincible_timer_ms = 0;
    g->player.is_alive = true;

    g->player.combo = 0;
    g->player.combo_timer_ms = 0;
    g->player.max_combo = 0;

    g->game_over = false;
    g->game_time_ms = 0;
    g->shoot_cooldown_ms = 0;
}

void adventure_logic_restart(adventure_game_t *g)
{
    adventure_logic_init(g);
}

void adventure_logic_set_weapon(adventure_game_t *g, adventure_weapon_t weapon)
{
    if (!g) return;
    g->player.weapon = weapon;
}

bool adventure_logic_spawn_enemy(adventure_game_t *g, adventure_enemy_type_t type, float x, float y)
{
    if (!g) return false;

    for (int i = 0; i < ADVENTURE_MAX_ENEMIES; i++) {
        adventure_enemy_t *e = &g->enemies[i];
        if (!e->active) {
            e->type = type;
            e->x = x;
            e->y = y;
            e->state_timer = 0.0f;
            e->active = true;

            switch (type) {
                case ADV_ENEMY_SNAIL:
                    e->w = 20;
                    e->h = 14;
                    e->hp = 1;
                    e->max_hp = 1;
                    e->vx = -35.0f;
                    e->vy = 0.0f;
                    e->score_value = 100;
                    e->on_ground = true;
                    e->base_y = y;
                    break;
                case ADV_ENEMY_FROG:
                    e->w = 18;
                    e->h = 18;
                    e->hp = 1;
                    e->max_hp = 1;
                    e->vx = 0.0f;
                    e->vy = 0.0f;
                    e->score_value = 200;
                    e->on_ground = true;
                    e->base_y = y;
                    break;
                case ADV_ENEMY_BIRD:
                    e->w = 20;
                    e->h = 14;
                    e->hp = 1;
                    e->max_hp = 1;
                    e->vx = -75.0f;
                    e->vy = 0.0f;
                    e->score_value = 300;
                    e->on_ground = false;
                    e->base_y = y;
                    break;
            }
            return true;
        }
    }
    return false;
}

bool adventure_logic_spawn_item(adventure_game_t *g, adventure_item_type_t type, float x, float y)
{
    if (!g) return false;

    for (int i = 0; i < ADVENTURE_MAX_ITEMS; i++) {
        adventure_item_t *it = &g->items[i];
        if (!it->active) {
            it->type = type;
            it->x = x;
            it->y = y;
            it->vx = 0.0f;
            it->vy = -60.0f; // 略微向上跳跃弹跳弹出
            it->on_ground = false;
            it->active = true;

            switch (type) {
                case ADV_ITEM_BANANA:
                    it->w = 14; it->h = 14; it->restore_stamina = 20.0f; it->score_value = 100; break;
                case ADV_ITEM_PINEAPPLE:
                    it->w = 16; it->h = 18; it->restore_stamina = 50.0f; it->score_value = 300; break;
                case ADV_ITEM_EGG:
                    it->w = 16; it->h = 16; it->restore_stamina = 10.0f; it->score_value = 500; break;
                case ADV_ITEM_APPLE:
                    it->w = 14; it->h = 14; it->restore_stamina = 25.0f; it->score_value = 150; break;
                case ADV_ITEM_STRAWBERRY:
                    it->w = 14; it->h = 14; it->restore_stamina = 15.0f; it->score_value = 200; break;
                case ADV_ITEM_WATERMELON:
                    it->w = 16; it->h = 14; it->restore_stamina = 35.0f; it->score_value = 250; break;
                case ADV_ITEM_GRAPE:
                    it->w = 14; it->h = 16; it->restore_stamina = 30.0f; it->score_value = 220; break;
                case ADV_ITEM_MILK:
                    it->w = 14; it->h = 18; it->restore_stamina = 100.0f; it->score_value = 500; break;
                case ADV_ITEM_BADGE_A:
                    it->w = 16; it->h = 16; it->restore_stamina = 10.0f; it->score_value = 250; break;
                case ADV_ITEM_BADGE_K:
                    it->w = 16; it->h = 16; it->restore_stamina = 10.0f; it->score_value = 350; break;
                case ADV_ITEM_BADGE_P:
                    it->w = 16; it->h = 16; it->restore_stamina = 10.0f; it->score_value = 500; break;
                case ADV_ITEM_SKATEBOARD:
                    it->w = 18; it->h = 10; it->restore_stamina = 20.0f; it->score_value = 800; break;
            }
            return true;
        }
    }
    return false;
}

void adventure_logic_move_left(adventure_game_t *g)
{
    if (!g || g->game_over || !g->player.is_alive) return;
    g->player.facing = -1;
    g->player.x -= ADVENTURE_MOVE_STEP;
    if (g->player.x < 0.0f) {
        g->player.x = 0.0f;
    }
}

void adventure_logic_move_right(adventure_game_t *g)
{
    if (!g || g->game_over || !g->player.is_alive) return;
    g->player.facing = 1;
    g->player.x += ADVENTURE_MOVE_STEP;
    float max_x = (float)(ADVENTURE_SCREEN_W - g->player.w);
    if (g->player.x > max_x) {
        g->player.x = max_x;
    }
}

bool adventure_logic_jump(adventure_game_t *g)
{
    if (!g || g->game_over || !g->player.is_alive) return false;

    if (g->player.on_ground && !g->player.is_jumping) {
        g->player.vy = ADVENTURE_JUMP_VELOCITY;
        g->player.is_jumping = true;
        g->player.on_ground = false;
        g->events.jump = true;
        return true;
    }
    return false;
}

bool adventure_logic_throw(adventure_game_t *g)
{
    if (!g || g->game_over || !g->player.is_alive) return false;
    if (g->player.weapon == ADV_WEAPON_NONE) return false;
    if (g->shoot_cooldown_ms > 0) return false;

    for (int i = 0; i < ADVENTURE_MAX_PROJECTILES; i++) {
        adventure_projectile_t *p = &g->projectiles[i];
        if (!p->active) {
            p->active = true;
            p->type = g->player.weapon;
            p->hits = 0;

            float dir = (float)g->player.facing;
            p->x = g->player.x + (dir > 0 ? (float)g->player.w : -8.0f);
            p->y = g->player.y + 4.0f;

            switch (g->player.weapon) {
                case ADV_WEAPON_AXE:
                    p->w = 12;
                    p->h = 12;
                    p->damage = 1;
                    p->piercing = false;
                    p->vx = dir * 160.0f;
                    p->vy = -140.0f; // 抛物线向上投出后自然受重力下坠
                    p->gravity = 480.0f;
                    break;
                case ADV_WEAPON_KNIFE:
                    p->w = 14;
                    p->h = 6;
                    p->damage = 1;
                    p->piercing = false;
                    p->vx = dir * 360.0f; // 水平高速直线
                    p->vy = 0.0f;
                    p->gravity = 0.0f;
                    break;
                case ADV_WEAPON_MOON_BLADE:
                    p->w = 16;
                    p->h = 16;
                    p->damage = 2;
                    p->piercing = true;   // 贯穿穿透
                    p->vx = dir * 240.0f;
                    p->vy = 0.0f;
                    p->gravity = 0.0f;
                    break;
                case ADV_WEAPON_NONE:
                default:
                    p->active = false;
                    return false;
            }

            g->shoot_cooldown_ms = ADVENTURE_SHOOT_COOLDOWN;
            g->events.throw_weapon = true;
            return true;
        }
    }
    return false;
}

static void adventure_register_kill(adventure_game_t *g, int score_value)
{
    g->player.combo++;
    if (g->player.combo > g->player.max_combo) {
        g->player.max_combo = g->player.combo;
    }
    g->player.combo_timer_ms = ADVENTURE_COMBO_WINDOW_MS;
    int mul = (g->player.combo > 1) ? g->player.combo : 1;
    g->player.score += score_value * mul;
    g->events.enemy_killed = true;
}

bool adventure_logic_action(adventure_game_t *g, adventure_action_t action)
{
    if (!g) return false;

    switch (action) {
        case ADV_ACTION_UP:
            adventure_logic_move_left(g);
            return true;
        case ADV_ACTION_DOWN:
            adventure_logic_move_right(g);
            return true;
        case ADV_ACTION_JUMP:
            return adventure_logic_jump(g);
        case ADV_ACTION_THROW:
            return adventure_logic_throw(g);
        case ADV_ACTION_OK: {
            bool ok_acted = false;
            if (g->player.on_ground) {
                ok_acted |= adventure_logic_jump(g);
            }
            ok_acted |= adventure_logic_throw(g);
            return ok_acted;
        }
        default:
            return false;
    }
}

void adventure_logic_update(adventure_game_t *g, uint32_t dt_ms)
{
    if (!g) return;

    // 清空单帧瞬时事件
    memset(&g->events, 0, sizeof(g->events));

    if (g->game_over) return;

    g->game_time_ms += dt_ms;

    // 冷却与无敌计时扣减
    if (g->shoot_cooldown_ms > (int)dt_ms) {
        g->shoot_cooldown_ms -= (int)dt_ms;
    } else {
        g->shoot_cooldown_ms = 0;
    }

    if (g->player.invincible_timer_ms > (int)dt_ms) {
        g->player.invincible_timer_ms -= (int)dt_ms;
    } else {
        g->player.invincible_timer_ms = 0;
    }

    if (g->player.combo_timer_ms > (int)dt_ms) {
        g->player.combo_timer_ms -= (int)dt_ms;
    } else if (g->player.combo_timer_ms > 0) {
        g->player.combo_timer_ms = 0;
        g->player.combo = 0;
    }

    if (g->player.has_skateboard) {
        if (g->player.skateboard_timer_ms > (int)dt_ms) {
            g->player.skateboard_timer_ms -= (int)dt_ms;
        } else {
            g->player.has_skateboard = false;
            g->player.skateboard_timer_ms = 0;
        }
    }

    // 微步积分模拟，避免高速物理穿模
    uint32_t remaining_ms = dt_ms;
    while (remaining_ms > 0) {
        uint32_t step_ms = (remaining_ms > 20) ? 20 : remaining_ms;
        remaining_ms -= step_ms;
        float dt = (float)step_ms / 1000.0f;

        // 1. 体力扣减 (饥饿机制)
        if (g->player.is_alive) {
            g->player.stamina -= ADVENTURE_STAMINA_DRAIN * dt;
            if (g->player.stamina <= 0.0f) {
                g->player.lives--;
                g->events.player_hurt = true;
                if (g->player.lives > 0) {
                    g->player.stamina = ADVENTURE_MAX_STAMINA;
                    g->player.invincible_timer_ms = ADVENTURE_INVINCIBLE_MS;
                } else {
                    g->player.stamina = 0.0f;
                    g->player.lives = 0;
                    g->player.is_alive = false;
                    g->game_over = true;
                    g->events.game_over = true;
                    return;
                }
            }
        }

        // 2. 玩家垂直重力与地面物理
        if (!g->player.on_ground) {
            g->player.vy += ADVENTURE_GRAVITY * dt;
            g->player.y += g->player.vy * dt;
            if (g->player.y + (float)g->player.h >= ADVENTURE_GROUND_Y) {
                g->player.y = ADVENTURE_GROUND_Y - (float)g->player.h;
                g->player.vy = 0.0f;
                g->player.is_jumping = false;
                g->player.on_ground = true;
            }
        }

        // 3. 投射物移动与碰撞
        for (int i = 0; i < ADVENTURE_MAX_PROJECTILES; i++) {
            adventure_projectile_t *p = &g->projectiles[i];
            if (!p->active) continue;

            p->x += p->vx * dt;
            p->vy += p->gravity * dt;
            p->y += p->vy * dt;

            // 越界销毁
            if (p->x < -30.0f || p->x > (float)ADVENTURE_SCREEN_W + 30.0f ||
                p->y < -50.0f || p->y > (float)ADVENTURE_SCREEN_H + 20.0f) {
                p->active = false;
                continue;
            }

            for (int j = 0; j < ADVENTURE_MAX_ENEMIES; j++) {
                adventure_enemy_t *e = &g->enemies[j];
                if (!e->active) continue;

                if (adventure_check_aabb(p->x, p->y, p->w, p->h,
                                         e->x, e->y, e->w, e->h)) {
                    e->hp -= p->damage;
                    p->hits++;
                    g->events.hit_enemy = true;

                    if (e->hp <= 0) {
                        e->active = false;
                        adventure_register_kill(g, e->score_value);
                    }

                    if (!p->piercing) {
                        p->active = false;
                        break;
                    }
                }
            }
        }

        // 4. 敌人行为更新与与玩家碰撞
        for (int i = 0; i < ADVENTURE_MAX_ENEMIES; i++) {
            adventure_enemy_t *e = &g->enemies[i];
            if (!e->active) continue;

            e->state_timer += dt;

            switch (e->type) {
                case ADV_ENEMY_SNAIL:
                    e->x += e->vx * dt;
                    e->y = ADVENTURE_GROUND_Y - (float)e->h;
                    break;
                case ADV_ENEMY_FROG:
                    if (e->on_ground) {
                        if (e->state_timer >= 1.2f) {
                            e->vy = -270.0f;
                            e->vx = -55.0f;
                            e->on_ground = false;
                            e->state_timer = 0.0f;
                        }
                    } else {
                        e->vy += ADVENTURE_GRAVITY * dt;
                        e->x += e->vx * dt;
                        e->y += e->vy * dt;
                        if (e->y + (float)e->h >= ADVENTURE_GROUND_Y) {
                            e->y = ADVENTURE_GROUND_Y - (float)e->h;
                            e->vy = 0.0f;
                            e->vx = 0.0f;
                            e->on_ground = true;
                        }
                    }
                    break;
                case ADV_ENEMY_BIRD:
                    e->x += e->vx * dt;
                    e->y = e->base_y + sinf(e->state_timer * 4.0f) * 16.0f;
                    break;
            }

            // 走出屏幕左侧边缘自动回收
            if (e->x < -50.0f) {
                e->active = false;
                continue;
            }

            // 触碰玩家：滑板撞击 / 下落踩踏 / 受伤
            if (g->player.is_alive &&
                adventure_check_aabb(g->player.x, g->player.y, g->player.w, g->player.h,
                                     e->x, e->y, e->w, e->h)) {
                float player_bottom = g->player.y + (float)g->player.h;
                float enemy_mid = e->y + (float)e->h * 0.5f;

                if (g->player.has_skateboard) {
                    // 滑板冲撞击碎一切敌人
                    e->active = false;
                    g->events.stomp = true;
                    g->events.hit_enemy = true;
                    adventure_register_kill(g, e->score_value + 100);
                } else if (g->player.vy > 40.0f && player_bottom <= enemy_mid + 6.0f) {
                    e->active = false;
                    g->player.vy = ADVENTURE_STOMP_BOUNCE;
                    g->player.on_ground = false;
                    g->player.is_jumping = true;
                    g->events.stomp = true;
                    g->events.hit_enemy = true;
                    adventure_register_kill(g, e->score_value + 50);
                } else if (g->player.invincible_timer_ms <= 0) {
                    g->player.lives--;
                    g->events.player_hurt = true;
                    g->player.combo = 0;
                    g->player.combo_timer_ms = 0;
                    if (g->player.lives > 0) {
                        g->player.invincible_timer_ms = ADVENTURE_INVINCIBLE_MS;
                        g->player.stamina = ADVENTURE_MAX_STAMINA;
                    } else {
                        g->player.lives = 0;
                        g->player.is_alive = false;
                        g->game_over = true;
                        g->events.game_over = true;
                        return;
                    }
                }
            }
        }

        // 5. 补给水果与道具物理与拾取
        for (int i = 0; i < ADVENTURE_MAX_ITEMS; i++) {
            adventure_item_t *it = &g->items[i];
            if (!it->active) continue;

            if (!it->on_ground) {
                it->vy += ADVENTURE_GRAVITY * dt;
                it->x += it->vx * dt;
                it->y += it->vy * dt;
                if (it->y + (float)it->h >= ADVENTURE_GROUND_Y) {
                    it->y = ADVENTURE_GROUND_Y - (float)it->h;
                    it->vy = 0.0f;
                    it->vx = 0.0f;
                    it->on_ground = true;
                }
            } else {
                // 地面道具随世界卷轴平滑向左滚动
                it->x -= (g->player.has_skateboard ? 80.0f : 50.0f) * dt;
                if (it->x < -30.0f) {
                    it->active = false;
                    continue;
                }
            }

            // 玩家拾取判定
            if (g->player.is_alive &&
                adventure_check_aabb(g->player.x, g->player.y, g->player.w, g->player.h,
                                     it->x, it->y, it->w, it->h)) {
                g->player.stamina += it->restore_stamina;
                if (g->player.stamina > ADVENTURE_MAX_STAMINA) {
                    g->player.stamina = ADVENTURE_MAX_STAMINA;
                }
                g->player.score += it->score_value;
                g->events.pickup_fruit = true;

                if (it->type == ADV_ITEM_EGG) {
                    g->player.lives++;
                    g->events.extra_life = true;
                } else if (it->type == ADV_ITEM_BADGE_A) {
                    g->player.weapon = ADV_WEAPON_AXE;
                    g->events.weapon_upgraded = true;
                } else if (it->type == ADV_ITEM_BADGE_K) {
                    g->player.weapon = ADV_WEAPON_KNIFE;
                    g->events.weapon_upgraded = true;
                } else if (it->type == ADV_ITEM_BADGE_P) {
                    g->player.weapon = ADV_WEAPON_MOON_BLADE;
                    g->events.weapon_upgraded = true;
                } else if (it->type == ADV_ITEM_MILK) {
                    g->player.stamina = ADVENTURE_MAX_STAMINA;
                    g->events.milk_full = true;
                } else if (it->type == ADV_ITEM_SKATEBOARD) {
                    g->player.has_skateboard = true;
                    g->player.skateboard_timer_ms = 8000;
                    g->events.skateboard_start = true;
                }
                it->active = false;
            }
        }
    }
}
