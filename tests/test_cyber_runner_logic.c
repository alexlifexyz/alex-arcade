// tests/test_cyber_runner_logic.c —— 《霓虹疾行：影刃闪现》V2.0 核心逻辑单元测试
#include "cyber_runner_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

int main(void)
{
    printf("=======================================================\n");
    printf("  Starting Cyber Runner V2.0 (Phantom Dash) Unit Tests \n");
    printf("=======================================================\n");

    cr_game_t g;

    // [TEST 1] 初始化系统验证
    printf("[TEST 1] Testing Initialization & Rooftop Systems...\n");
    cyber_runner_init(&g, 0x12345678);
    assert(g.stance == CR_STANCE_RUN);
    assert(g.y == g.buildings[0].y);
    assert(g.hp == 3);
    assert(g.max_hp == 3);
    assert(g.blink_charges == 3);
    assert(g.air_jumps_left == 1);
    assert(!g.phase_shift);
    assert(!g.is_wall_sliding);
    assert(!g.game_over);
    printf("  ✓ Initial values, 3-charge blink & buildings ready OK\n");

    // [TEST 2] 地面跳跃与土狼时间 (Coyote Time) 验证
    printf("[TEST 2] Testing Ground Jump & Coyote Time...\n");
    cyber_runner_init(&g, 0x1111);
    cyber_runner_input_up(&g);
    assert(g.stance == CR_STANCE_JUMP);
    assert(g.vy < -300.0f);
    assert(g.pending_sound == CR_SND_JUMP);

    // 运行数帧进入空中
    cyber_runner_step(&g, 25);
    cyber_runner_step(&g, 25);
    assert(g.y < g.buildings[0].y);

    // 空中二段跳 (阿童木火箭靴喷火腾跃)
    cyber_runner_input_up(&g);
    assert(g.stance == CR_STANCE_DOUBLE_JUMP);
    assert(g.air_jumps_left == 0);
    assert(g.vy < -300.0f);
    assert(g.pending_sound == CR_SND_AIR_BOOST);

    // 测试土狼时间：模拟刚踏出边缘
    cyber_runner_init(&g, 0x1112);
    g.y = g.buildings[0].y;
    g.stance = CR_STANCE_FALL;
    g.coyote_timer_ms = 100; // 离台 100ms 内
    cyber_runner_input_up(&g);
    assert(g.stance == CR_STANCE_JUMP); // 依然允许起跳！
    assert(g.coyote_timer_ms == 0);
    printf("  ✓ Ground jump, double jump & coyote time OK\n");

    // [TEST 3] 贴墙下滑 (Wall Slide) 与蹬墙反弹大跳 (Wall Kick)
    printf("[TEST 3] Testing Wall Slide & Wall Kick Mechanics...\n");
    cyber_runner_init(&g, 0x2222);
    // 模拟主角在空中，正面撞向一座比当前低处大厦更高的墙壁
    g.stance = CR_STANCE_FALL;
    g.y = 245.0f; // 处于大楼侧面
    g.vy = 200.0f;
    g.buildings[1].x = (float)CR_PLAYER_X + (float)CR_PLAYER_W; // 墙面恰好贴在主角右侧
    g.buildings[1].y = 210.0f; // 顶层在上方

    cyber_runner_step(&g, 25);
    assert(g.is_wall_sliding == true);
    assert(g.stance == CR_STANCE_WALL_SLIDE);
    assert(g.vy <= 90.0f); // 显著减速下滑！

    // 此时按下 UP 触发【蹬墙跳】！
    cyber_runner_input_up(&g);
    assert(g.is_wall_sliding == false);
    assert(g.stance == CR_STANCE_JUMP);
    assert(g.vy < -340.0f); // 紧凑反弹腾空
    assert(g.air_jumps_left == 1); // 刷新二段跳
    assert(g.pending_sound == CR_SND_WALL_KICK);
    printf("  ✓ Wall slide slow-fall & wall kick rescue leap OK\n");

    // [TEST 4] 月牙光刃发射 (Crescent Moon Blade) 与远程击碎无人机
    printf("[TEST 4] Testing Crescent Moon Blade Projectile & Slicing...\n");
    cyber_runner_init(&g, 0x3333);
    g.air_jumps_left = 0; // 消耗掉二段跳

    // 在远处 100px 放置一架无人机
    g.hazards[0].active = true;
    g.hazards[0].type = CR_HAZARD_DRONE;
    g.hazards[0].x = (float)CR_PLAYER_X + 100.0f;
    g.hazards[0].y = g.y - 20.0f;
    g.hazards[0].w = 18.0f;
    g.hazards[0].h = 14.0f;

    // 按下 OK 键发射月牙光刃
    cyber_runner_input_ok(&g);
    assert(g.projectiles[0].active == true);
    assert(g.projectiles[0].vx > 300.0f);

    // 光刃向前飞掠命中远处无人机
    for (int step = 0; step < 10; step++) {
        cyber_runner_step(&g, 25);
    }
    assert(g.hazards[0].active == false); // 远处无人机被飞来的月牙光刃斩爆！
    assert(g.air_jumps_left == 1);        // 击毁敌人奖励刷新二段跳！
    printf("  ✓ Crescent Moon Blade firing, flight slicing & kill-reset OK\n");

    // [TEST 5] 地面滑铲与空中重力俯冲下砸 (Dive Slam) 冲击波
    printf("[TEST 5] Testing Slide & Dive Slam Shockwave...\n");
    cyber_runner_init(&g, 0x4444);
    // 地面按 DOWN -> 滑铲
    cyber_runner_input_down(&g);
    assert(g.stance == CR_STANCE_SLIDE);
    assert(g.stance_timer_ms > 300);

    // 起跳后在空中按 DOWN -> 俯冲砸地
    cyber_runner_input_up(&g);
    cyber_runner_step(&g, 50);
    cyber_runner_input_down(&g);
    assert(g.stance == CR_STANCE_DIVE);
    assert(g.vy > 600.0f);

    // 在地面附近放置低位激光，测试落地冲击波摧毁机关
    g.hazards[0].active = true;
    g.hazards[0].type = CR_HAZARD_LASER_LOW;
    g.hazards[0].x = (float)CR_PLAYER_X + 30.0f;
    g.hazards[0].y = g.buildings[0].y - 8.0f;
    g.hazards[0].w = 14.0f;
    g.hazards[0].h = 8.0f;

    // 落地砸地
    g.y = g.buildings[0].y;
    cyber_runner_step(&g, 25);
    assert(g.shockwave_active == true);
    assert(g.hazards[0].active == false); // 地面机关被冲击波粉碎
    assert(g.pending_sound == CR_SND_DIVE_SLAM);
    printf("  ✓ Slide crouch & dive slam shockwave obliteration OK\n");

    // [TEST 6] 超导排风口与电池收集
    printf("[TEST 6] Testing Superconductor Vent & Battery Item...\n");
    cyber_runner_init(&g, 0x5555);
    g.hazards[0].active = true;
    g.hazards[0].type = CR_HAZARD_VENT;
    g.hazards[0].x = (float)CR_PLAYER_X;
    g.hazards[0].y = g.y - 6.0f;
    g.hazards[0].w = 20.0f;
    g.hazards[0].h = 8.0f;

    cyber_runner_step(&g, 25);
    assert(g.vy < -500.0f);
    assert(g.pending_sound == CR_SND_VENT_BOOST);
    printf("  ✓ Superconductor vent launch OK\n");

    // [TEST 7] 坠落深渊与重启
    printf("[TEST 7] Testing Fatal Fall & Reboot...\n");
    cyber_runner_init(&g, 0x6666);
    g.y = (float)CR_SCREEN_H + 20.0f;
    cyber_runner_step(&g, 25);
    assert(g.game_over == true);
    assert(g.pending_sound == CR_SND_GAMEOVER);

    cyber_runner_input_ok(&g);
    assert(g.game_over == false);
    assert(g.hp == 3);
    printf("  ✓ Fatal fall & clean reboot OK\n");

    printf("=======================================================\n");
    printf("   ✓ [PASS] All 7 Cyber Runner V2.0 Unit Tests Passed! \n");
    printf("=======================================================\n");
    return 0;
}
