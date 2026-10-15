#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "flysaber_logic.h"

int main(void)
{
    printf("[TEST] Testing Fruit Fly Saber (FlySaber) Logic...\n");

    flysaber_game_t g;
    flysaber_init(&g);

    // 1. 初始化验证
    assert(g.sync_hp == 100);
    assert(g.score == 0);
    assert(g.combo == 0);
    assert(g.overdrive_gauge == 0);
    assert(!g.is_overdrive);
    assert(!g.game_over);
    printf("  ✓ Initialization OK\n");

    // 2. 验证透视坐标投影计算
    int x0, y0, w0, h0;
    flysaber_calc_pos(0.0f, FLYSABER_LANE_LEFT, &x0, &y0, &w0, &h0);
    assert(w0 >= 4 && h0 >= 4);

    int xs, ys, ws, hs;
    flysaber_calc_pos(FLYSABER_STRIKE_T, FLYSABER_LANE_LEFT, &xs, &ys, &ws, &hs);
    assert(ws > w0 && hs > h0);
    assert(ys > y0);
    printf("  ✓ 3D Perspective Projection Calculation OK\n");

    // 3. 验证左刀劈砍蓝色方块 (UP)
    g.blocks[0].active = true;
    g.blocks[0].sliced = false;
    g.blocks[0].lane = FLYSABER_LANE_LEFT;
    g.blocks[0].type = FLYSABER_BLOCK_BLUE;
    g.blocks[0].progress = FLYSABER_STRIKE_T; // 完美重合位置

    flysaber_slash_left(&g);
    assert(g.blocks[0].sliced == true);
    assert(g.blocks[0].active == false);
    assert(g.last_hit_result == FLYSABER_HIT_PERFECT);
    assert(g.combo == 1);
    assert(g.score == 100);
    assert(g.overdrive_gauge == 10);
    printf("  ✓ Blue Block Perfect Slice (UP) OK\n");

    // 4. 验证右刀劈砍红色方块 (DOWN)
    g.blocks[1].active = true;
    g.blocks[1].sliced = false;
    g.blocks[1].lane = FLYSABER_LANE_RIGHT;
    g.blocks[1].type = FLYSABER_BLOCK_RED;
    g.blocks[1].progress = FLYSABER_STRIKE_T - 0.10f; // GOOD 判定区间

    flysaber_slash_right(&g);
    assert(g.blocks[1].sliced == true);
    assert(g.last_hit_result == FLYSABER_HIT_GOOD);
    assert(g.combo == 2);
    assert(g.score == 150); // 100 + 50
    printf("  ✓ Red Block Good Slice (DOWN) OK\n");

    // 5. 验证误砍颜色惩罚
    g.blocks[2].active = true;
    g.blocks[2].sliced = false;
    g.blocks[2].lane = FLYSABER_LANE_LEFT;
    g.blocks[2].type = FLYSABER_BLOCK_RED; // 左轨出现红方块但用左刀砍
    g.blocks[2].progress = FLYSABER_STRIKE_T;

    int prev_hp = g.sync_hp;
    flysaber_slash_left(&g);
    assert(g.last_hit_result == FLYSABER_HIT_WRONG);
    assert(g.combo == 0); // 断连
    assert(g.sync_hp < prev_hp);
    printf("  ✓ Wrong Color Slice Penalty & Break Combo OK\n");

    // 6. 验证误触尖刺惩罚
    g.blocks[3].active = true;
    g.blocks[3].sliced = false;
    g.blocks[3].lane = FLYSABER_LANE_RIGHT;
    g.blocks[3].type = FLYSABER_BLOCK_SPIKE;
    g.blocks[3].progress = FLYSABER_STRIKE_T;

    prev_hp = g.sync_hp;
    flysaber_slash_right(&g);
    assert(g.last_hit_result == FLYSABER_HIT_SPIKE);
    assert(g.combo == 0);
    assert(g.sync_hp == prev_hp - 8);
    printf("  ✓ Spike Hazard Collision Penalty OK\n");

    // 7. 验证双刀合击与中央方块 (OK)
    g.blocks[4].active = true;
    g.blocks[4].sliced = false;
    g.blocks[4].lane = FLYSABER_LANE_CENTER;
    g.blocks[4].type = FLYSABER_BLOCK_DUAL;
    g.blocks[4].progress = FLYSABER_STRIKE_T;

    flysaber_slash_dual(&g);
    assert(g.blocks[4].sliced == true);
    assert(g.combo == 1);
    printf("  ✓ Dual Blade Center Core Slice (OK) OK\n");

    // 8. 验证超频子弹时间 (Neuro Overdrive)
    g.overdrive_gauge = 100;
    g.blocks[5].active = true;
    g.blocks[5].sliced = false;
    g.blocks[5].lane = FLYSABER_LANE_LEFT;
    g.blocks[5].type = FLYSABER_BLOCK_BLUE;
    g.blocks[5].progress = 0.5f;

    flysaber_slash_dual(&g);
    assert(g.is_overdrive == true);
    assert(g.overdrive_timer > 0);
    assert(g.overdrive_gauge == 0);
    assert(g.blocks[5].sliced == true); // 全屏自动切中
    printf("  ✓ Neuro Overdrive / 30ms Bullet Time OK\n");

    // 9. 验证濒死自动复苏保护与最终 Game Over
    flysaber_init(&g);
    assert(g.lives == 3);
    g.sync_hp = 5;
    g.blocks[0].active = true;
    g.blocks[0].sliced = false;
    g.blocks[0].lane = FLYSABER_LANE_LEFT;
    g.blocks[0].type = FLYSABER_BLOCK_BLUE;
    g.blocks[0].speed = 0.05f;
    g.blocks[0].progress = 1.05f; // 发生漏击

    flysaber_step(&g);
    // 应该触发除颤复苏，消耗 1 条命，血量回升至 75，同时赠送子弹时间！
    assert(g.lives == 2);
    assert(g.sync_hp == 75);
    assert(g.is_overdrive == true);
    printf("  ✓ Emergency Synapse Defibrillator Revive OK\n");

    // 耗尽最后生命，确认 Game Over 触发
    g.lives = 1;
    g.sync_hp = 4;
    g.is_overdrive = false;
    g.blocks[1].active = true;
    g.blocks[1].sliced = false;
    g.blocks[1].lane = FLYSABER_LANE_LEFT;
    g.blocks[1].type = FLYSABER_BLOCK_BLUE;
    g.blocks[1].speed = 0.05f;
    g.blocks[1].progress = 1.05f;
    flysaber_step(&g);
    assert(g.lives == 0);
    assert(g.sync_hp == 0);
    assert(g.game_over == true);
    printf("  ✓ Final Game Over Trigger OK\n");

    printf("[PASS] All Fruit Fly Saber Unit Tests Passed!\n");
    return 0;
}
