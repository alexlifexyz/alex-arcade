// tests/test_pawssprint_logic.c —— 《短腿爪爪运动会》核心逻辑单元测试
#include "pawssprint_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

int main(void)
{
    printf("=======================================================\n");
    printf("     Starting Paws Sprint Logic Unit Tests             \n");
    printf("=======================================================\n");

    ps_game_t g;

    // [TEST 1] 初始化系统与角色切换验证
    printf("[TEST 1] Testing Initialization & Pet Selection...\n");
    pawssprint_init(&g, 0x12345678);
    assert(g.state == PS_STATE_TITLE);
    assert(g.selected_char == PS_CHAR_CORGI);
    assert(g.lane == 1);
    assert(g.x == PS_LANE_1_X);

    // 选人切换
    pawssprint_input_down(&g);
    assert(g.selected_char == PS_CHAR_SHIBA);
    pawssprint_input_down(&g);
    assert(g.selected_char == PS_CHAR_SEAL);
    pawssprint_input_down(&g);
    assert(g.selected_char == PS_CHAR_PENGUIN);
    pawssprint_input_down(&g);
    assert(g.selected_char == PS_CHAR_CORGI); // 循环回到第一个
    pawssprint_input_up(&g);
    assert(g.selected_char == PS_CHAR_PENGUIN); // 向上切换
    printf("  ✓ Pet cycle selection OK\n");

    // [TEST 2] 游戏开跑与平滑三车道变道
    printf("[TEST 2] Testing Start Game & 3-Lane Movement...\n");
    pawssprint_input_ok(&g); // 开始比赛
    assert(g.state == PS_STATE_PLAYING);
    assert(g.lane == 1);
    assert(g.distance_m == 0.0f);
    assert(g.bones_count == 0);
    assert(g.slips_count == 0);

    // 向左变道
    pawssprint_input_up(&g);
    assert(g.lane == 0);
    assert(g.target_x == PS_LANE_0_X);
    assert(g.pending_sound == PS_SND_PATA);

    // 边界检测：已经在最左车道，按 UP 不能溢出
    pawssprint_input_up(&g);
    assert(g.lane == 0);

    // 向右变道
    pawssprint_input_down(&g);
    assert(g.lane == 1);
    pawssprint_input_down(&g);
    assert(g.lane == 2);
    assert(g.target_x == PS_LANE_2_X);

    // 边界检测：已经在最右车道，按 DOWN 不能溢出
    pawssprint_input_down(&g);
    assert(g.lane == 2);
    printf("  ✓ 3-lane movement & boundary checks OK\n");

    // [TEST 3] 跳跃物理与落地 Q 弹
    printf("[TEST 3] Testing Jump Physics & Landing Squash...\n");
    pawssprint_input_ok(&g);
    assert(g.is_jumping == true);
    assert(g.jump_v > 0.0f);
    assert(g.pending_sound == PS_SND_JUMP);

    // 步进数帧，上升再回落
    for (int i = 0; i < 20; i++) {
        pawssprint_step(&g, 25);
    }
    // 落地后恢复
    for (int i = 0; i < 40; i++) {
        pawssprint_step(&g, 25);
    }
    assert(g.is_jumping == false);
    assert(g.jump_z == 0.0f);
    printf("  ✓ Jump physics and landing recovery OK\n");

    // [TEST 4] 障碍物碰撞：香蕉皮 360° 滑行旋转与 0 惩罚治愈机制
    printf("[TEST 4] Testing Banana Slip 360 Spin (Zero Penalties)...\n");
    // 在玩家位置放香蕉皮
    g.lane = 1;
    g.target_x = PS_LANE_1_X;
    g.x = PS_LANE_1_X;
    g.y = PS_PLAYER_Y;
    g.obstacles[0].active = true;
    g.obstacles[0].type = PS_OBS_BANANA;
    g.obstacles[0].lane = 1;
    g.obstacles[0].x = PS_LANE_1_X;
    g.obstacles[0].y = PS_PLAYER_Y;

    pawssprint_step(&g, 25);
    assert(g.obstacles[0].active == false); // 踩中香蕉皮
    assert(g.slip_timer_ms > 0.0f);
    assert(g.slips_count == 1);
    assert(g.pending_sound == PS_SND_SLIP);

    // 打转持续 800ms
    float old_angle = g.spin_angle;
    pawssprint_step(&g, 100);
    assert(g.spin_angle > old_angle);
    printf("  ✓ Banana slip spin & zero penalties OK\n");

    // [TEST 5] 骨头与爱心收集
    printf("[TEST 5] Testing Bones & Hearts Pickups...\n");
    g.lane = 1;
    g.target_x = PS_LANE_1_X;
    g.x = PS_LANE_1_X;
    g.y = PS_PLAYER_Y;
    g.pickups[0].active = true;
    g.pickups[0].type = PS_PICKUP_BONE;
    g.pickups[0].lane = 1;
    g.pickups[0].x = PS_LANE_1_X;
    g.pickups[0].y = PS_PLAYER_Y;

    pawssprint_step(&g, 25);
    assert(g.pickups[0].active == false);
    assert(g.bones_count == 1);
    assert(g.pending_sound == PS_SND_BONE);

    // 爱心
    g.pickups[1].active = true;
    g.pickups[1].type = PS_PICKUP_HEART;
    g.pickups[1].lane = 1;
    g.pickups[1].x = PS_LANE_1_X;
    g.pickups[1].y = PS_PLAYER_Y;

    pawssprint_step(&g, 25);
    assert(g.pickups[1].active == false);
    assert(g.bones_count == 4); // +3
    assert(g.pending_sound == PS_SND_HEART);
    printf("  ✓ Bone & heart pickup scoring OK\n");

    // [TEST 6] 500m 终点蓬松大抱枕飞扑 (Cushion Dive)
    printf("[TEST 6] Testing Cushion Dive & Feather Explosion at 500m...\n");
    g.distance_m = 499.9f;
    pawssprint_step(&g, 25);

    assert(g.state == PS_STATE_DIVE);
    assert(g.pending_sound == PS_SND_CUSHION_DIVE);
    assert(g.feathers[0].active == true);
    assert(g.feathers[31].active == true);

    // 慢动作播放结束进入结算
    for (int i = 0; i < 110; i++) {
        pawssprint_step(&g, 25);
    }
    assert(g.state == PS_STATE_RESULT);
    assert(pawssprint_get_quote(g.quote_index) != NULL);
    printf("  ✓ Cushion dive feather explosion & healing card OK\n");

    // [TEST 7] 结算界面按 OK 再次畅玩
    printf("[TEST 7] Testing Replay from Results...\n");
    pawssprint_input_ok(&g);
    assert(g.state == PS_STATE_PLAYING);
    assert(g.distance_m == 0.0f);
    printf("  ✓ Instant replay from results OK\n");

    printf("=======================================================\n");
    printf("   ✓ [PASS] All 7 Paws Sprint Unit Tests Passed!       \n");
    printf("=======================================================\n");
    return 0;
}
