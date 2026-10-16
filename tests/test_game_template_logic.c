#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "game_template_logic.h"

// 把一个掉落物直接放到篮子口上方,方便做确定性断言:
// 不依赖随机掉落,就能精确验证“接到”和“漏掉”两条路径。
static void place_item(tpl_game_t *g, int slot, int8_t lane, bool bomb, float y)
{
    g->items[slot].active = true;
    g->items[slot].lane = lane;
    g->items[slot].bomb = bomb;
    g->items[slot].y = y;
}

// 清空对象池,避免上一段测试遗留的掉落物干扰下一段。
static void clear_items(tpl_game_t *g)
{
    memset(g->items, 0, sizeof(g->items));
}

int main(void)
{
    printf("[TEST] Testing Game Template (Fruit Catch) Logic...\n");

    tpl_game_t g = {0};

    // 1. 初始化:停在 READY,篮子居中,心是满的
    tpl_logic_init_ctx(&g);
    assert(g.state == TPL_STATE_READY);
    assert(g.lane == TPL_LANES / 2);
    assert(g.lives == TPL_START_LIVES);
    assert(g.level == 1);
    assert(g.score == 0);
    assert(g.fall_speed == TPL_FALL_SPEED);
    assert(g.spawn_interval_ms == TPL_SPAWN_MS);
    printf("  ✓ 1. Initialization OK\n");

    // 2. READY 状态下不推进:没按 OK 之前东西不会动
    place_item(&g, 0, 0, false, 10.0f);
    tpl_logic_update_ctx(&g, 100);
    assert(g.items[0].y == 10.0f);
    assert(g.elapsed_ms == 0);
    printf("  ✓ 2. READY Freezes The World OK\n");

    // 3. OK 开局;READY 下移动无效,PLAYING 下左右移动并在边界停住
    tpl_logic_init_ctx(&g);
    tpl_logic_move_ctx(&g, -1);
    assert(g.lane == TPL_LANES / 2); // READY 不响应移动
    tpl_logic_confirm_ctx(&g);
    assert(g.state == TPL_STATE_PLAYING);
    tpl_logic_move_ctx(&g, -1);
    assert(g.lane == 0);
    tpl_logic_move_ctx(&g, -1);
    assert(g.lane == 0);             // 撞墙停住,不绕回右边
    tpl_logic_move_ctx(&g, +1);
    tpl_logic_move_ctx(&g, +1);
    assert(g.lane == TPL_LANES - 1);
    tpl_logic_move_ctx(&g, +1);
    assert(g.lane == TPL_LANES - 1);
    printf("  ✓ 3. Confirm Starts & Lane Clamping OK\n");

    // 4. 接到水果:加分、出事件、掉落物离场
    tpl_logic_init_ctx(&g);
    tpl_logic_confirm_ctx(&g);
    clear_items(&g);
    place_item(&g, 0, g.lane, false, TPL_BASKET_Y - TPL_ITEM_SIZE + 2.0f);
    tpl_logic_update_ctx(&g, 16);
    assert(g.score == TPL_FRUIT_SCORE);
    assert(g.fx_catch == 1);
    assert(!g.items[0].active);
    assert(g.lives == TPL_START_LIVES);
    printf("  ✓ 4. Catching Fruit Scores OK\n");

    // 5. 接到炸弹:扣一颗心,不加分
    clear_items(&g);
    g.fx_catch = 0;
    uint32_t score_before = g.score;
    place_item(&g, 0, g.lane, true, TPL_BASKET_Y - TPL_ITEM_SIZE + 2.0f);
    tpl_logic_update_ctx(&g, 16);
    assert(g.lives == TPL_START_LIVES - 1);
    assert(g.score == score_before);
    assert(g.fx_bomb == 1);
    assert(g.fx_catch == 0);
    printf("  ✓ 5. Catching A Bomb Costs A Life OK\n");

    // 6. 漏掉水果不罚:只报事件,心和分都不动(零挫败基调)
    clear_items(&g);
    g.fx_miss = 0;
    int8_t lives_before = g.lives;
    score_before = g.score;
    place_item(&g, 0, (int8_t)((g.lane + 1) % TPL_LANES), false, (float)TPL_SCREEN_H - 1.0f);
    tpl_logic_update_ctx(&g, 100);
    assert(!g.items[0].active);
    assert(g.fx_miss == 1);
    assert(g.lives == lives_before);
    assert(g.score == score_before);
    printf("  ✓ 6. Missing Fruit Is Not Punished OK\n");

    // 7. 升级:分数到线后下落更快、掉落更密,且不超过最快上限
    tpl_logic_init_ctx(&g);
    tpl_logic_confirm_ctx(&g);
    for (int i = 0; i < TPL_LEVEL_UP_SCORE / TPL_FRUIT_SCORE; i++) {
        clear_items(&g);
        place_item(&g, 0, g.lane, false, TPL_BASKET_Y - TPL_ITEM_SIZE + 2.0f);
        tpl_logic_update_ctx(&g, 16);
    }
    assert(g.score == (uint32_t)TPL_LEVEL_UP_SCORE);
    assert(g.level == 2);
    assert(g.fall_speed > TPL_FALL_SPEED);
    assert(g.spawn_interval_ms < TPL_SPAWN_MS);
    assert(g.spawn_interval_ms >= TPL_SPAWN_MS_MIN);
    printf("  ✓ 7. Level Up Raises Difficulty OK\n");

    // 8. 心掉光 -> GAMEOVER 并刷新最高分;再按 OK 可以重开
    tpl_logic_init_ctx(&g);
    tpl_logic_confirm_ctx(&g);
    clear_items(&g);
    place_item(&g, 0, g.lane, false, TPL_BASKET_Y - TPL_ITEM_SIZE + 2.0f);
    tpl_logic_update_ctx(&g, 16);
    for (int i = 0; i < TPL_START_LIVES; i++) {
        clear_items(&g);
        place_item(&g, 0, g.lane, true, TPL_BASKET_Y - TPL_ITEM_SIZE + 2.0f);
        tpl_logic_update_ctx(&g, 16);
    }
    assert(g.lives == 0);
    assert(g.state == TPL_STATE_GAMEOVER);
    assert(g.high_score == (uint32_t)TPL_FRUIT_SCORE);
    tpl_logic_update_ctx(&g, 100);   // GAMEOVER 之后世界也不再推进
    assert(g.state == TPL_STATE_GAMEOVER);
    tpl_logic_confirm_ctx(&g);
    assert(g.state == TPL_STATE_PLAYING);
    assert(g.lives == TPL_START_LIVES);
    assert(g.score == 0);
    assert(g.high_score == (uint32_t)TPL_FRUIT_SCORE); // 最高分跨局保留
    printf("  ✓ 8. Game Over & High Score Retention OK\n");

    // 9. 自动掉落:到点就从池里放一个,池是固定大小、永不越界
    tpl_logic_init_ctx(&g);
    tpl_logic_set_seed_ctx(&g, 20261016u);
    tpl_logic_confirm_ctx(&g);
    tpl_logic_update_ctx(&g, TPL_SPAWN_MS);
    int active = 0;
    for (int i = 0; i < TPL_MAX_ITEMS; i++) {
        if (g.items[i].active) {
            active++;
            assert(g.items[i].lane >= 0 && g.items[i].lane < TPL_LANES);
        }
    }
    assert(active == 1);
    printf("  ✓ 9. Timed Spawn Uses The Fixed Pool OK\n");

    // 10. 同一个种子必须复现同一局:主机测试和设备上跑出来是一样的
    tpl_game_t a = {0};
    tpl_game_t b = {0};
    tpl_logic_init_ctx(&a);
    tpl_logic_init_ctx(&b);
    tpl_logic_set_seed_ctx(&a, 99u);
    tpl_logic_set_seed_ctx(&b, 99u);
    tpl_logic_confirm_ctx(&a);
    tpl_logic_confirm_ctx(&b);
    for (int i = 0; i < 400; i++) {
        tpl_logic_update_ctx(&a, 25);
        tpl_logic_update_ctx(&b, 25);
    }
    assert(a.score == b.score);
    assert(a.lives == b.lives);
    assert(a.rng_state == b.rng_state);
    for (int i = 0; i < TPL_MAX_ITEMS; i++) {
        assert(a.items[i].active == b.items[i].active);
        assert(a.items[i].lane == b.items[i].lane);
    }
    printf("  ✓ 10. Same Seed Replays The Same Round OK\n");

    // 11. 轨道中心 X:渲染层和逻辑层共用这一个算法,并且输入越界也安全
    assert(tpl_logic_lane_center_x(0) < tpl_logic_lane_center_x(1));
    assert(tpl_logic_lane_center_x(1) < tpl_logic_lane_center_x(TPL_LANES - 1));
    assert(tpl_logic_lane_center_x(-5) == tpl_logic_lane_center_x(0));
    assert(tpl_logic_lane_center_x(99) == tpl_logic_lane_center_x(TPL_LANES - 1));
    printf("  ✓ 11. Lane Geometry Helper OK\n");

    // 12. 空指针保护:渲染层在清屏竞态里传 NULL 不应崩
    tpl_logic_init_ctx(NULL);
    tpl_logic_update_ctx(NULL, 16);
    tpl_logic_move_ctx(NULL, 1);
    tpl_logic_confirm_ctx(NULL);
    tpl_logic_restart_ctx(NULL);
    tpl_logic_set_seed_ctx(NULL, 1u);
    printf("  ✓ 12. NULL Context Guards OK\n");

    // 13. 默认实例 API:渲染层走这条路,和上下文 API 行为一致
    tpl_logic_init();
    assert(tpl_logic_get_state()->state == TPL_STATE_READY);
    tpl_logic_confirm();
    assert(tpl_logic_get_state()->state == TPL_STATE_PLAYING);
    tpl_logic_move(-1);
    assert(tpl_logic_get_state()->lane == 0);
    tpl_logic_update(16);
    assert(tpl_logic_get_state()->elapsed_ms == 16);
    printf("  ✓ 13. Default Instance API OK\n");

    printf(">>> ALL GAME TEMPLATE LOGIC HOST TESTS PASSED! <<<\n");
    return 0;
}
