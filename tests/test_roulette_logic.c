#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "roulette_logic.h"

int main(void)
{
    printf("[TEST] Testing Roulette Logic...\n");

    roulette_game_t g;
    roulette_init(&g);

    // 1. 验证初始化状态
    assert(g.player_hp == 4);
    assert(g.dealer_hp == 4);
    assert(g.round_number == 1);
    assert(g.total_shells >= 3);
    assert(g.live_count + g.blank_count == g.total_shells);
    assert(g.phase == PHASE_PLAYER_TURN);
    printf("  ✓ Initialization OK\n");

    // 2. 模拟确定性弹仓测试
    g.chamber[0] = SHELL_BLANK;
    g.chamber[1] = SHELL_LIVE;
    g.chamber[2] = SHELL_BLANK;
    g.total_shells = 3;
    g.shell_index = 0;
    g.live_count = 1;
    g.blank_count = 2;

    // 玩家对自己开火 (当前是 BLANK)
    shot_result_t res1 = roulette_fire(&g, TARGET_SELF, true);
    assert(!res1.is_live);
    assert(res1.damage == 0);
    assert(res1.extra_turn == true);
    assert(g.player_hp == 4); // 无扣血
    assert(g.phase == PHASE_PLAYER_TURN); // 依旧是玩家回合
    printf("  ✓ Shoot Self (Blank) -> Extra Turn OK\n");

    // 玩家使用手锯
    g.player_items[0] = ITEM_SAW;
    char desc[48];
    assert(roulette_use_item(&g, 0, true, desc) == true);
    assert(g.is_sawed == true);

    // 玩家对恶魔开火 (当前是 LIVE)
    shot_result_t res2 = roulette_fire(&g, TARGET_OPPONENT, true);
    assert(res2.is_live);
    assert(res2.damage == 2); // 锯子双倍伤害
    assert(g.dealer_hp == 2);
    assert(g.phase == PHASE_DEALER_TURN); // 切换至恶魔回合
    printf("  ✓ Shoot Demon (Live + Saw) -> 2 Damage & Turn Switch OK\n");

    // 恶魔使用香烟回复 1 点生命
    g.dealer_items[0] = ITEM_CIGARETTE;
    assert(roulette_use_item(&g, 0, false, desc) == true);
    assert(g.dealer_hp == 3);
    printf("  ✓ Demon Item (Cigarette +1 HP) OK\n");

    // 恶魔开火 (第 3 发是 BLANK，恶魔射击玩家)
    shot_result_t res3 = roulette_fire(&g, TARGET_OPPONENT, false);
    assert(!res3.is_live);
    assert(res3.damage == 0);
    // 弹仓打空，应自动触发重新装填并进入下一轮
    assert(res3.chamber_emptied == true);
    assert(g.round_number == 2);
    printf("  ✓ Chamber empty -> Auto reload & Next round OK\n");

    // 3. 胜利与失败边界测试
    g.player_hp = 1;
    g.dealer_hp = 4;
    g.chamber[0] = SHELL_LIVE;
    g.total_shells = 1;
    g.shell_index = 0;
    g.is_sawed = false;
    shot_result_t lose_shot = roulette_fire(&g, TARGET_SELF, true);
    assert(lose_shot.game_over == true);
    assert(g.phase == PHASE_GAME_LOSE);
    printf("  ✓ Player HP 0 -> GAME LOSE OK\n");

    g.dealer_hp = 1;
    g.player_hp = 4;
    g.chamber[0] = SHELL_LIVE;
    g.total_shells = 1;
    g.shell_index = 0;
    shot_result_t win_shot = roulette_fire(&g, TARGET_OPPONENT, true);
    assert(win_shot.game_over == true);
    assert(g.phase == PHASE_GAME_WIN);
    printf("  ✓ Demon HP 0 -> GAME WIN OK\n");

    printf("[PASS] All Roulette Logic Tests Passed Successfully!\n");
    return 0;
}
