// tests/test_geartrooper_logic.c —— 《齿轮骑兵：蒸汽狂飙》核心算法单元测试
#include "geartrooper_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

int main(void)
{
    printf("=======================================================\n");
    printf("  Starting Gear Cavalry: Turbo Surge Unit Tests        \n");
    printf("=======================================================\n");

    gt_game_t g;

    // [TEST 1] 初始化校验
    printf("[TEST 1] Testing Initialization & Ground Systems...\n");
    geartrooper_init(&g, 0x12345678);
    assert(g.y == GT_GROUND_Y);
    assert(g.vy == 0.0f);
    assert(g.stance == STANCE_RUN);
    assert(g.air_jumps_left == 1);
    assert(g.hp == 5);
    assert(g.steam_psi == 0);
    assert(g.world_speed == 220);
    assert(g.lance_reach_px == 42); // 常驻锋芒
    printf("  ✓ Initial values & double jump & constant lance ready OK\n");

    // [TEST 2] 一段大跳与二段蒸汽喷气跳
    printf("[TEST 2] Testing Jump and Air Boost (Double Jump)...\n");
    geartrooper_init(&g, 0x1234);
    geartrooper_input_up(&g);
    assert(g.stance == STANCE_JUMP);
    assert(g.vy < -400.0f);

    // 运行 5 帧进入空中
    geartrooper_step(&g, 25);
    assert(g.y < GT_GROUND_Y);

    // 在空中再次按 UP -> 触发二段蒸汽喷气跳！
    geartrooper_input_up(&g);
    assert(g.stance == STANCE_AIR_BOOST);
    assert(g.air_jumps_left == 0);
    assert(g.vy < -300.0f);
    printf("  ✓ Ground jump & mid-air steam air boost OK\n");

    // [TEST 3] 重装下刺与着地地脉冲击波 (Shockwave)
    printf("[TEST 3] Testing Steam Plunge & Ground Shockwave...\n");
    geartrooper_init(&g, 0x9999);
    g.y = 150.0f; // 处于空中
    geartrooper_input_down(&g);
    assert(g.stance == STANCE_PLUNGE);
    assert(g.vy > 600.0f); // 超速下坠

    // 落地砸地
    while (g.y < GT_GROUND_Y) {
        geartrooper_step(&g, 25);
    }
    geartrooper_step(&g, 25);
    assert(g.shockwave_active == true);
    assert(g.shockwave_radius >= 20.0f);
    printf("  ✓ Steam plunge high-speed dive & shockwave detonation OK\n");

    // [TEST 4] 常驻正面骑枪贯穿与击杀充能
    printf("[TEST 4] Testing Constant Lance Front Penetration...\n");
    geartrooper_init(&g, 0x7777);
    // 生成飞隼在长枪前方
    geartrooper_spawn_enemy(&g, ENEMY_FALCON, GT_HORSE_X + 40, GT_GROUND_Y - 8);
    assert(g.enemies[0].active == true);

    geartrooper_step(&g, 25);
    // 敌兵进入长枪判定区，直接被正面贯穿秒杀！
    assert(g.enemies[0].active == false);
    assert(g.score > 0);
    assert(g.steam_psi >= 20); // 迅速充能
    assert(g.combo_count == 1);
    printf("  ✓ Front-facing constant lance penetration & turbo charging OK\n");

    // [TEST 5] 贴地滑铲与发条蜘蛛碾碎
    printf("[TEST 5] Testing Turbo Slide Spider Shredding...\n");
    geartrooper_init(&g, 0x6666);
    geartrooper_spawn_enemy(&g, ENEMY_SPIDER, GT_HORSE_X + 20, GT_GROUND_Y + 2);
    geartrooper_input_down(&g);
    assert(g.stance == STANCE_SLIDE);

    geartrooper_step(&g, 25);
    assert(g.enemies[0].active == false);
    assert(g.combo_count == 1);
    printf("  ✓ Low stance turbo slide shredding OK\n");

    // [TEST 6] 狂暴蒸汽过载与无敌撞杀
    printf("[TEST 6] Testing Steam Overdrive Trigger & Ramming...\n");
    geartrooper_init(&g, 0x5555);
    g.steam_psi = 70; // 达到 60 PSI 以上
    geartrooper_input_ok(&g);
    assert(g.overdrive_active == true);
    assert(g.world_speed == 340); // 极速狂飙

    // 面前放置铁傀儡，直接撞死！
    geartrooper_spawn_enemy(&g, ENEMY_GOLEM, GT_HORSE_X + 10, GT_GROUND_Y - 10);
    geartrooper_step(&g, 25);
    assert(g.enemies[0].active == false);
    assert(g.hp == 5); // 毫发无损
    printf("  ✓ Overdrive activation, speed surge & invincible ramming OK\n");

    // [TEST 7] 伤害与游戏结束重启
    printf("[TEST 7] Testing Damage, Invulnerability & Restart...\n");
    geartrooper_init(&g, 0x4444);
    geartrooper_spawn_enemy(&g, ENEMY_GOLEM, GT_HORSE_X - 6, GT_GROUND_Y - 10);
    geartrooper_step(&g, 25);
    assert(g.hp == 4);
    assert(g.invuln_timer_ms > 0);

    g.hp = 1;
    g.invuln_timer_ms = 0;
    geartrooper_step(&g, 25);
    assert(g.hp == 0);
    assert(g.game_over == true);

    // 按 OK 重启
    geartrooper_input_ok(&g);
    assert(g.game_over == false);
    assert(g.hp == 5);
    printf("  ✓ Hurt invulnerability, game over & instant restart OK\n");

    printf("=======================================================\n");
    printf("   ✓ [PASS] All 7 Gear Cavalry Turbo Unit Tests OK!    \n");
    printf("=======================================================\n");
    return 0;
}
