#include "game_template_logic.h"
#include <string.h>

// 全局默认游戏上下文实例。渲染层通过 tpl_logic_get_state() 读它。
static tpl_game_t s_default_game;

// 线性同余发生器 (LCG)。固定种子就能复现同一局,主机测试靠它做确定性断言。
static uint32_t tpl_rand(tpl_game_t *g)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return (g->rng_state >> 16) & 0x7FFFu;
}

// 取 [0, bound) 的随机整数。bound 必须大于 0。
static int tpl_rand_below(tpl_game_t *g, int bound)
{
    return (int)(tpl_rand(g) % (uint32_t)bound);
}

float tpl_logic_lane_center_x(int8_t lane)
{
    if (lane < 0) {
        lane = 0;
    }
    if (lane >= TPL_LANES) {
        lane = TPL_LANES - 1;
    }
    return (float)lane * (float)TPL_LANE_W + (float)TPL_LANE_W * 0.5f;
}

// 把对象池清空,并把难度参数复位到开局值。
static void tpl_reset_round(tpl_game_t *g)
{
    memset(g->items, 0, sizeof(g->items));
    g->lane = TPL_LANES / 2;
    g->lives = TPL_START_LIVES;
    g->level = 1;
    g->score = 0;
    g->fall_speed = TPL_FALL_SPEED;
    g->spawn_interval_ms = TPL_SPAWN_MS;
    g->spawn_timer_ms = TPL_SPAWN_MS;
    g->elapsed_ms = 0;
    g->fx_catch = 0;
    g->fx_bomb = 0;
    g->fx_miss = 0;
}

void tpl_logic_init_ctx(tpl_game_t *g)
{
    if (!g) {
        return;
    }
    uint32_t keep_high = g->high_score;
    uint32_t keep_seed = g->rng_state;
    memset(g, 0, sizeof(*g));
    g->high_score = keep_high;
    g->rng_state = keep_seed ? keep_seed : 0x1234ABCDu;
    tpl_reset_round(g);
    g->state = TPL_STATE_READY;
}

void tpl_logic_set_seed_ctx(tpl_game_t *g, uint32_t seed)
{
    if (!g) {
        return;
    }
    g->rng_state = seed ? seed : 0x1234ABCDu;
}

void tpl_logic_restart_ctx(tpl_game_t *g)
{
    if (!g) {
        return;
    }
    tpl_reset_round(g);
    g->state = TPL_STATE_PLAYING;
}

void tpl_logic_move_ctx(tpl_game_t *g, int dir)
{
    if (!g || g->state != TPL_STATE_PLAYING || dir == 0) {
        return;
    }
    int next = (int)g->lane + (dir < 0 ? -1 : 1);
    // 走到边上就停住,不绕回另一头:对小朋友来说“撞墙”比“瞬移”好懂。
    if (next < 0) {
        next = 0;
    }
    if (next > TPL_LANES - 1) {
        next = TPL_LANES - 1;
    }
    g->lane = (int8_t)next;
}

void tpl_logic_confirm_ctx(tpl_game_t *g)
{
    if (!g) {
        return;
    }
    if (g->state == TPL_STATE_READY || g->state == TPL_STATE_GAMEOVER) {
        tpl_logic_restart_ctx(g);
    }
}

// 在空闲的池格子里放一个新掉落物。池满就这一轮不掉,不扩容、不 malloc。
static void tpl_spawn_item(tpl_game_t *g)
{
    for (int i = 0; i < TPL_MAX_ITEMS; i++) {
        if (g->items[i].active) {
            continue;
        }
        g->items[i].active = true;
        g->items[i].lane = (int8_t)tpl_rand_below(g, TPL_LANES);
        g->items[i].y = -TPL_ITEM_SIZE;
        g->items[i].bomb = (tpl_rand_below(g, 100) < TPL_BOMB_PERCENT);
        return;
    }
}

// 分数到线就升级:下落更快、掉得更密,但有下限,不会快到没法玩。
static void tpl_apply_level(tpl_game_t *g)
{
    int8_t want_level = (int8_t)(g->score / TPL_LEVEL_UP_SCORE + 1u);
    if (want_level <= g->level) {
        return;
    }
    g->level = want_level;
    g->fall_speed = TPL_FALL_SPEED + TPL_SPEED_PER_LEVEL * (float)(g->level - 1);
    uint32_t step = 60u * (uint32_t)(g->level - 1);
    g->spawn_interval_ms = (TPL_SPAWN_MS > step + TPL_SPAWN_MS_MIN)
                               ? (TPL_SPAWN_MS - step)
                               : TPL_SPAWN_MS_MIN;
}

void tpl_logic_update_ctx(tpl_game_t *g, uint32_t dt_ms)
{
    if (!g || g->state != TPL_STATE_PLAYING || dt_ms == 0) {
        return;
    }

    float dt = (float)dt_ms / 1000.0f;
    g->elapsed_ms += dt_ms;

    // 1. 掉落计时:到点就从池里取一个放到屏幕顶上。
    if (g->spawn_timer_ms <= dt_ms) {
        tpl_spawn_item(g);
        g->spawn_timer_ms = g->spawn_interval_ms;
    } else {
        g->spawn_timer_ms -= dt_ms;
    }

    // 2. 推进每个掉落物,并在篮子口那条带子里做判定。
    for (int i = 0; i < TPL_MAX_ITEMS; i++) {
        tpl_item_t *it = &g->items[i];
        if (!it->active) {
            continue;
        }
        it->y += g->fall_speed * dt;

        bool in_band = (it->y + TPL_ITEM_SIZE >= TPL_BASKET_Y) &&
                       (it->y <= TPL_BASKET_Y + TPL_CATCH_BAND);
        if (in_band && it->lane == g->lane) {
            it->active = false;
            if (it->bomb) {
                // 接到炸弹才扣心。漏掉水果不罚,这是本仓库“零挫败”的基调。
                if (g->lives > 0) {
                    g->lives--;
                }
                if (g->fx_bomb < 255) {
                    g->fx_bomb++;
                }
            } else {
                g->score += TPL_FRUIT_SCORE;
                if (g->fx_catch < 255) {
                    g->fx_catch++;
                }
                tpl_apply_level(g);
            }
            continue;
        }

        if (it->y > (float)TPL_SCREEN_H) {
            it->active = false;
            if (!it->bomb && g->fx_miss < 255) {
                g->fx_miss++;
            }
        }
    }

    // 3. 心掉光就结束,并刷新最高分。
    if (g->lives <= 0) {
        g->state = TPL_STATE_GAMEOVER;
        if (g->score > g->high_score) {
            g->high_score = g->score;
        }
    }
}

void tpl_logic_init(void)
{
    tpl_logic_init_ctx(&s_default_game);
}

void tpl_logic_update(uint32_t dt_ms)
{
    tpl_logic_update_ctx(&s_default_game, dt_ms);
}

void tpl_logic_move(int dir)
{
    tpl_logic_move_ctx(&s_default_game, dir);
}

void tpl_logic_confirm(void)
{
    tpl_logic_confirm_ctx(&s_default_game);
}

tpl_game_t *tpl_logic_get_state(void)
{
    return &s_default_game;
}
