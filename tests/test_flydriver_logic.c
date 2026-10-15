#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "flydriver_logic.h"

int main(void)
{
    printf("[TEST] Testing FlyDriver Optic Flow Racer Logic...\n");

    flydriver_game_t g;
    flydriver_init(&g);

    // 1. 初始化检查
    assert(g.shields == 6);
    assert(g.player_speed >= 200.0f);
    assert(g.score == 0);
    assert(g.distance == 0);
    assert(!g.nitro_active);
    assert(!g.game_over);
    printf("  ✓ Initialization OK\n");

    // 2. 验证左右变道与边界限制
    for (int i = 0; i < 10; i++) flydriver_steer_left(&g);
    assert(g.player_x >= -0.85f);
    assert(g.steer_dir == -1);

    for (int i = 0; i < 20; i++) flydriver_steer_right(&g);
    assert(g.player_x <= 0.85f);
    assert(g.steer_dir == 1);
    printf("  ✓ Steering & Track Boundary Clamping OK\n");

    // 3. 验证 3D 透视坐标映射
    int x_far, y_far, w_far, h_far;
    flydriver_calc_coord(0.0f, 1.0f, 0.0f, &x_far, &y_far, &w_far, &h_far);

    int x_near, y_near, w_near, h_near;
    flydriver_calc_coord(0.0f, 0.0f, 0.0f, &x_near, &y_near, &w_near, &h_near);

    assert(y_near > y_far);
    assert(w_near > w_far);
    assert(h_near > h_far);
    printf("  ✓ 3D Perspective Projection Scale OK\n");

    // 4. 验证光子氮气爆发机制
    g.nitro_gauge = 30; // 低于 40 不能触发
    flydriver_trigger_nitro(&g);
    assert(!g.nitro_active);

    g.nitro_gauge = 60; // 满足蓄力要求
    flydriver_trigger_nitro(&g);
    assert(g.nitro_active == true);
    assert(g.player_speed >= 400.0f);
    assert(g.nitro_gauge == 0);
    assert(g.invincible_timer > 0);
    printf("  ✓ Warp Nitro Boost Activation OK\n");

    // 5. 验证氮气状态下撞毁敌车 (Warp Smash)
    g.traffic[0].active = true;
    g.traffic[0].x = g.player_x;
    g.traffic[0].z = 0.05f; // 正好在判定线上
    g.traffic[0].type = TRAFFIC_SCOUT;
    int prev_score = g.score;
    int prev_shields = g.shields;

    flydriver_step(&g);
    assert(g.traffic[0].active == false); // 被撞毁
    assert(g.shields == prev_shields);    // 护盾无损
    assert(g.score > prev_score);
    printf("  ✓ Nitro Invincible Ramming (Smash) OK\n");

    // 6. 验证极限贴身超车 (Near Miss)
    flydriver_init(&g);
    g.player_x = 0.0f;
    g.traffic[0].active = true;
    g.traffic[0].x = 0.40f; // 处于擦身而非相撞区间 (0.25 < dx <= 0.50)
    g.traffic[0].z = 0.05f;
    g.traffic[0].type = TRAFFIC_SCOUT;

    int prev_nitro = g.nitro_gauge;
    flydriver_step(&g);
    assert(g.traffic[0].near_miss_counted == true);
    assert(g.near_miss_count == 1);
    assert(g.nitro_gauge > prev_nitro);
    printf("  ✓ Near-Miss Overtake Reward OK\n");

    // 7. 验证常规碰撞扣护盾与阵亡
    flydriver_init(&g);
    g.player_x = 0.0f;
    g.shields = 1;
    g.invincible_timer = 0;
    g.traffic[0].active = true;
    g.traffic[0].x = 0.0f; // 直接正碰
    g.traffic[0].z = 0.05f;
    g.traffic[0].type = TRAFFIC_TRUCK;

    flydriver_step(&g);
    assert(g.shields == 0);
    assert(g.game_over == true);
    assert(g.player_speed <= 150.0f);
    printf("  ✓ Collision Shield Damage & Game Over State OK\n");

    printf("[PASS] All FlyDriver Optic Flow Racer Unit Tests Passed!\n");
    return 0;
}
