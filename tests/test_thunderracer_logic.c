#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "thunderracer_logic.h"

static void test_initialization(void)
{
    printf("[TEST 1] Game Initialization...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    assert(g.target_lane == 1);
    assert(fabsf(g.lane_x - TR_LANE_X_MID) < 0.001f);
    assert(fabsf(g.current_speed - TR_SPEED_BASE) < 0.001f);
    assert(fabsf(g.max_speed - TR_SPEED_MAX_NORMAL) < 0.001f);
    assert(fabsf(g.min_speed - TR_SPEED_MIN) < 0.001f);
    assert(g.shield == 100);
    assert(g.max_shield == 100);
    assert(fabsf(g.nitro - 50.0f) < 0.001f);
    assert(fabsf(g.max_nitro - 100.0f) < 0.001f);
    assert(g.ammo == 8);
    assert(g.max_ammo == 20);
    assert(!g.nitro_active);
    assert(!g.game_over);
    assert(!g.paused);
    assert(g.score == 0);
    assert(g.distance == 0);
    assert(g.near_miss_count == 0);
    assert(g.smash_count == 0);
    assert(g.vehicles_destroyed == 0);

    for (int i = 0; i < TR_MAX_VEHICLES; i++) assert(!g.vehicles[i].active);
    for (int i = 0; i < TR_MAX_MISSILES; i++) assert(!g.missiles[i].active);
    for (int i = 0; i < TR_MAX_ITEMS; i++) assert(!g.items[i].active);

    printf("  ✓ Initialization values & entity pools OK\n");
}

static void test_lane_switching_and_bounds(void)
{
    printf("[TEST 2] Smooth Lane Switching & Boundary Clamping...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 从中间车道 (1) 切换到左车道 (0)
    thunderracer_steer_left(&g);
    assert(g.target_lane == 0);

    // 验证平滑插值过程
    float prev_x = g.lane_x;
    thunderracer_step(&g);
    assert(g.lane_x < prev_x); // 横向向左平滑偏移
    assert(g.lane_x > TR_LANE_X_LEFT);

    // 运行若干步，最终平滑对齐左车道目标
    for (int i = 0; i < 25; i++) {
        thunderracer_step(&g);
    }
    assert(fabsf(g.lane_x - TR_LANE_X_LEFT) < 0.001f);

    // 2. 边界限制：在最左车道继续按左，不能越界
    thunderracer_steer_left(&g);
    assert(g.target_lane == 0);
    thunderracer_step(&g);
    assert(fabsf(g.lane_x - TR_LANE_X_LEFT) < 0.001f);

    // 3. 向右切换至中间车道 (1)，再切至右车道 (2)
    thunderracer_steer_right(&g);
    assert(g.target_lane == 1);
    for (int i = 0; i < 25; i++) {
        thunderracer_step(&g);
    }
    assert(fabsf(g.lane_x - TR_LANE_X_MID) < 0.001f);

    thunderracer_steer_right(&g);
    assert(g.target_lane == 2);
    for (int i = 0; i < 25; i++) {
        thunderracer_step(&g);
    }
    assert(fabsf(g.lane_x - TR_LANE_X_RIGHT) < 0.001f);

    // 4. 边界限制：在最右车道继续按右，不能越界
    thunderracer_steer_right(&g);
    assert(g.target_lane == 2);
    thunderracer_step(&g);
    assert(fabsf(g.lane_x - TR_LANE_X_RIGHT) < 0.001f);

    printf("  ✓ Smooth Lane Interpolation & Track Bounds Clamping OK\n");
}

static void test_speed_acceleration_and_clamping(void)
{
    printf("[TEST 3] Acceleration, Deceleration & Speed Limits...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 自然巡航加速直到达到极速上限 (260 km/h)
    for (int i = 0; i < 100; i++) {
        thunderracer_step(&g);
    }
    assert(fabsf(g.current_speed - TR_SPEED_MAX_NORMAL) < 0.001f);

    // 2. 强制加速不能突破常态极速
    thunderracer_accelerate(&g, 50.0f);
    assert(g.current_speed <= TR_SPEED_MAX_NORMAL);

    // 3. 刹车减速与最低速度下限 (80 km/h)
    thunderracer_brake(&g, 150.0f);
    assert(fabsf(g.current_speed - 110.0f) < 0.001f);

    thunderracer_brake(&g, 100.0f);
    assert(fabsf(g.current_speed - TR_SPEED_MIN) < 0.001f);

    // 再次下探刹车不低于最低限速
    thunderracer_brake(&g, 50.0f);
    assert(fabsf(g.current_speed - TR_SPEED_MIN) < 0.001f);

    // 4. 停止刹车后自适应恢复提速
    thunderracer_step(&g);
    assert(g.current_speed > TR_SPEED_MIN);

    printf("  ✓ Speed Dynamics & Max/Min Speed Constraints OK\n");
}

static void test_missile_launch_and_destruction(void)
{
    printf("[TEST 4] Missile Firing & Enemy Destruction...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 成功发射飞弹消耗弹药
    assert(g.ammo == 8);
    bool fired = thunderracer_fire_missile(&g);
    assert(fired == true);
    assert(g.ammo == 7);
    assert(g.snd_missile == true);
    assert(g.missiles[0].active == true);
    assert(fabsf(g.missiles[0].x - g.lane_x) < 0.001f);

    // 2. 在中路前方生成一辆慢速车 (1 HP)
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 1, 0.16f, 90.0f, 1);
    assert(g.vehicles[0].active == true);

    int prev_score = g.score;
    // 步进使飞弹向前推进并击中慢速车
    for (int i = 0; i < 5; i++) {
        thunderracer_step(&g);
        if (!g.vehicles[0].active) break;
    }

    assert(g.vehicles[0].active == false); // 前车被炸毁
    assert(g.vehicles_destroyed == 1);
    assert(g.score > prev_score);
    assert(g.snd_explode == true);

    // 验证击毁后掉落了补给道具
    bool found_item = false;
    for (int i = 0; i < TR_MAX_ITEMS; i++) {
        if (g.items[i].active) {
            found_item = true;
            break;
        }
    }
    assert(found_item == true);

    // 3. 弹药耗尽时无法开火
    g.ammo = 0;
    assert(thunderracer_fire_missile(&g) == false);

    printf("  ✓ Forward Missile Guidance, Collision Damage & Item Drop OK\n");
}

static void test_nitro_boost_and_smash(void)
{
    printf("[TEST 5] Nitro Boost & Invincible Smash Mechanism...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 氮气值不足无法激活 (< 30)
    g.nitro = 25.0f;
    assert(thunderracer_trigger_nitro(&g) == false);
    assert(!g.nitro_active);

    // 2. 氮气充足激活超光速冲刺
    g.nitro = 60.0f;
    assert(thunderracer_trigger_nitro(&g) == true);
    assert(g.nitro_active == true);
    assert(g.snd_nitro == true);

    // 步进使得速度突破常态极速
    for (int i = 0; i < 15; i++) {
        thunderracer_step(&g);
    }
    assert(g.current_speed > TR_SPEED_MAX_NORMAL);

    // 3. 无敌冲撞测试 (Smash)：在同车道迎面撞击敌方警车
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_POLICE, 1, 0.04f, 150.0f, 3);
    assert(g.vehicles[0].active == true);

    int shield_before = g.shield;
    int score_before = g.score;
    thunderracer_step(&g);

    // 敌车被直接撞飞摧毁，玩家护盾毫发无损！
    assert(g.vehicles[0].active == false);
    assert(g.shield == shield_before);
    assert(g.smash_count == 1);
    assert(g.score >= score_before + TR_SCORE_SMASH);
    assert(g.snd_smash == true);

    // 4. 氮气持续消耗直到耗尽退出冲刺模式
    while (g.nitro_active) {
        thunderracer_step(&g);
    }
    assert(fabsf(g.nitro - 0.0f) < 0.001f);
    assert(g.nitro_active == false);

    printf("  ✓ Warp Nitro Boost & Ramming (Smash) Invincibility OK\n");
}

static void test_near_miss_detection(void)
{
    printf("[TEST 6] Near-Miss Overtake Detection & Nitro Reward...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 玩家居中车道 (x = 0.0f)，高速巡航 240 km/h
    g.current_speed = 240.0f;
    g.lane_x = 0.0f;
    g.target_lane = 1;

    // 在右侧邻车道稍微贴近侧身处放置慢速车 (x = 0.35f, 处在 [0.22, 0.60] 擦车区间)
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 2, 0.05f, 90.0f, 1);
    g.vehicles[0].x = 0.35f;

    float prev_nitro = g.nitro;
    int prev_score = g.score;
    int prev_nm = g.near_miss_count;

    thunderracer_step(&g);

    // 触发极限近身超车判定
    assert(g.vehicles[0].near_miss_triggered == true);
    assert(g.near_miss_count == prev_nm + 1);
    assert(g.nitro > prev_nitro);
    assert(g.score >= prev_score + TR_SCORE_NEARMISS);
    assert(g.snd_near_miss == true);

    // 下一帧同一次超车不得重复刷分
    thunderracer_step(&g);
    assert(g.near_miss_count == prev_nm + 1);

    printf("  ✓ Near-Miss Lateral Proximity Detection & Single Trigger OK\n");
}

static void test_shield_depletion_and_game_over(void)
{
    printf("[TEST 7] Shield Damage & Game Over State...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 常规碰撞扣减护盾与击退速度
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 1, 0.04f, 100.0f, 1);
    g.lane_x = 0.0f;
    g.vehicles[0].x = 0.0f;
    g.shield = 100;
    g.invincible_timer = 0;

    thunderracer_step(&g);
    assert(g.shield == 80); // 100 - 20 = 80
    assert(g.invincible_timer > 0);
    assert(g.snd_crash == true);
    assert(g.game_over == false);

    // 2. 护盾耗尽阵亡与游戏结束冻结
    g.shield = 15;
    g.invincible_timer = 0;
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 1, 0.04f, 100.0f, 1);
    g.vehicles[0].x = 0.0f;

    thunderracer_step(&g);
    assert(g.shield == 0);
    assert(g.game_over == true);
    assert(g.snd_gameover == true);

    // 验证游戏结束状态下时钟与动作冻结
    int frozen_ticks = g.tick_count;
    thunderracer_step(&g);
    assert(g.tick_count == frozen_ticks);

    // 3. 游戏结束后按 OK 键重新初始化
    thunderracer_handle_input(&g, TR_KEY_OK, TR_KEY_EV_CLICK);
    assert(g.game_over == false);
    assert(g.shield == 100);

    printf("  ✓ Shield Damage Absorption, Game Over & Reset Flow OK\n");
}

static void test_item_pickup_system(void)
{
    printf("[TEST 8] Item Drops & Pickup Functionality...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // 1. 拾取红心回复护盾
    g.shield = 50;
    thunderracer_spawn_item(&g, TR_ITEM_HEART, g.lane_x, 0.04f);
    thunderracer_step(&g);
    assert(g.shield == 80);
    assert(g.snd_item == true);
    assert(!g.items[0].active);

    // 2. 拾取氮气瓶充能
    g.nitro = 30.0f;
    thunderracer_spawn_item(&g, TR_ITEM_NITRO, g.lane_x, 0.04f);
    thunderracer_step(&g);
    assert(fabsf(g.nitro - 65.0f) < 0.001f);

    // 3. 拾取弹药补给
    g.ammo = 5;
    thunderracer_spawn_item(&g, TR_ITEM_AMMO, g.lane_x, 0.04f);
    thunderracer_step(&g);
    assert(g.ammo == 10);

    printf("  ✓ Heart, Nitro & Ammo Item Pickups OK\n");
}

static void test_perspective_projection_math(void)
{
    printf("[TEST 9] 3D Perspective Projection Scale...\n");
    int x_far, y_far, w_far, h_far;
    thunderracer_calc_coord(0.0f, 1.0f, &x_far, &y_far, &w_far, &h_far);

    int x_near, y_near, w_near, h_near;
    thunderracer_calc_coord(0.0f, 0.0f, &x_near, &y_near, &w_near, &h_near);

    assert(y_near > y_far);
    assert(w_near > w_far);
    assert(h_near > h_far);

    printf("  ✓ Perspective Scale & Screen Coordinate Projection OK\n");
}

static void test_key_input_dispatch(void)
{
    printf("[TEST 10] Key Input Event Dispatching...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    // UP 键左切车道
    thunderracer_handle_input(&g, TR_KEY_UP, TR_KEY_EV_PRESS);
    assert(g.target_lane == 0);

    // DOWN 键右切车道
    thunderracer_handle_input(&g, TR_KEY_DOWN, TR_KEY_EV_PRESS);
    assert(g.target_lane == 1);

    // OK 短按开火发射飞弹
    int prev_ammo = g.ammo;
    thunderracer_handle_input(&g, TR_KEY_OK, TR_KEY_EV_CLICK);
    assert(g.ammo == prev_ammo - 1);

    // OK 双击释放氮气爆发
    g.nitro = 60.0f;
    thunderracer_handle_input(&g, TR_KEY_OK, TR_KEY_EV_DOUBLE_CLICK);
    assert(g.nitro_active == true);

    printf("  ✓ UP/DOWN/OK Button Event Handling OK\n");
}

static void test_near_miss_combo_and_night(void)
{
    printf("[TEST 11] Near-Miss Combo Chain & Night Cycle...\n");
    thunderracer_game_t g;
    thunderracer_init(&g);

    g.current_speed = 240.0f;
    g.lane_x = 0.0f;
    g.target_lane = 1;

    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 2, 0.05f, 90.0f, 1);
    g.vehicles[0].x = 0.35f;
    thunderracer_step(&g);
    assert(g.near_miss_combo == 1);
    assert(g.score >= TR_SCORE_NEARMISS);

    // 连击窗口内再擦一辆，分数按 2x 叠加
    int score_after_first = g.score;
    thunderracer_spawn_vehicle(&g, TR_VEHICLE_SLOW, 0, 0.05f, 90.0f, 1);
    g.vehicles[1].x = -0.35f;
    g.vehicles[1].near_miss_triggered = false;
    thunderracer_step(&g);
    assert(g.near_miss_combo == 2);
    assert(g.max_near_miss_combo == 2);
    assert(g.score >= score_after_first + TR_SCORE_NEARMISS * 2);

    g.distance = TR_NIGHT_DISTANCE;
    thunderracer_step(&g);
    assert(g.night_mode == true);

    printf("  ✓ Near-Miss Combo Multiplier & Night Mode OK\n");
}

int main(void)
{
    printf("\n=======================================================\n");
    printf("  Starting Thunder Racer: Speed Armament Unit Tests    \n");
    printf("=======================================================\n\n");

    test_initialization();
    test_lane_switching_and_bounds();
    test_speed_acceleration_and_clamping();
    test_missile_launch_and_destruction();
    test_nitro_boost_and_smash();
    test_near_miss_detection();
    test_shield_depletion_and_game_over();
    test_item_pickup_system();
    test_perspective_projection_math();
    test_key_input_dispatch();
    test_near_miss_combo_and_night();

    printf("\n=======================================================\n");
    printf("  ✓ [PASS] All 11 Thunder Racer Unit Tests Passed!     \n");
    printf("=======================================================\n\n");
    return 0;
}
