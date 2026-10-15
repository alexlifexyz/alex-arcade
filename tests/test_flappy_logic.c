#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "flappy_logic.h"

int main(void)
{
    printf("[TEST] Testing Flappy Bird (Pixel Bird) Logic...\n");

    flappy_game_t g = {0};

    // 1. 初始化验证
    flappy_logic_init_ctx(&g);
    assert(g.state == FLAPPY_STATE_PLAYING);
    assert(!g.game_over);
    assert(g.score == 0);
    assert(g.high_score == 0);
    assert(g.x == FLAPPY_BIRD_X);
    assert(g.y == FLAPPY_BIRD_INIT_Y);
    assert(g.vy == 0.0f);
    assert(g.rotation == 0.0f);
    assert(!g.is_night);
    assert(g.pipes[0].active && g.pipes[1].active && g.pipes[2].active);
    assert(g.pipes[0].x < g.pipes[1].x && g.pipes[1].x < g.pipes[2].x);
    printf("  ✓ 1. Initialization & Initial Pipe Pool OK\n");

    // 2. 自由落体重力下坠测试
    flappy_logic_init_ctx(&g);
    g.turbulence_enabled = false; // 关闭乱流干扰以精确验证纯重力
    float y0 = g.y;
    float vy0 = g.vy;
    flappy_logic_update_ctx(&g, 100); // 运行 100ms (0.1s)
    // 纯重力下: delta_vy = g * dt = 750 * 0.1 = 75 px/s
    assert(g.vy > vy0);
    assert(fabsf(g.vy - (vy0 + g.gravity * 0.1f)) < 0.1f);
    assert(g.y > y0);
    assert(g.rotation > 0.0f); // 重力下落倾角转为俯冲
    printf("  ✓ 2. Free Fall Gravity Drop & Downward Rotation OK\n");

    // 3. 跳跃上升冲量与点火抬头测试
    flappy_logic_init_ctx(&g);
    g.vy = 100.0f; // 模拟原本正在下落
    g.rotation = 45.0f;
    flappy_logic_flap_ctx(&g);
    assert(g.vy == g.flap_impulse); // 瞬时赋予跳跃冲量 (-250.0f)
    assert(g.rotation == FLAPPY_ROTATION_UP); // 瞬时转为抬头 (-25.0f)
    assert(g.snd_flap == true);

    float y_pre_flap = g.y;
    flappy_logic_update_ctx(&g, 50); // 运行 50ms (0.05s)
    assert(g.y < y_pre_flap); // 垂直位移应减小 (向上爬升)
    printf("  ✓ 3. Flap Impulse Upward Jump & Pitch-Up Rotation OK\n");

    // 4. 水管生成、向左平移与对象池循环回收测试
    flappy_logic_init_ctx(&g);
    float p0_init_x = g.pipes[0].x;
    flappy_logic_update_ctx(&g, 100);
    assert(g.pipes[0].x < p0_init_x); // 确认水平向左推移

    // 模拟水管 0 移出屏幕最左侧
    float p2_x = g.pipes[2].x;
    g.pipes[0].x = -g.pipes[0].width - 2.0f;
    g.pipes[0].passed = true;
    // 将小鸟置于屏幕中央安全区域以防测试循环时碰撞
    g.y = 120.0f;
    g.vy = 0.0f;
    g.pipes[1].x = 200.0f;
    g.pipes[1].gap_y = 100.0f;
    g.pipes[1].gap_height = 90.0f;
    flappy_logic_update_ctx(&g, 20);

    // 验证水管 0 被回收重置到队伍末尾 (最右侧)
    assert(g.pipes[0].x > p2_x);
    assert(g.pipes[0].passed == false); // 重置计分标志
    assert(g.pipes[0].gap_height == g.default_gap_height);
    assert(g.pipes[0].gap_y >= FLAPPY_MIN_GAP_Y);
    assert(g.pipes[0].gap_y <= FLAPPY_MAX_GAP_Y);
    printf("  ✓ 4. Pipe Object Pool Translation & Offscreen Recycling OK\n");

    // 5. 精确矩形碰撞检测判定 (地面、天花板、上水管、下水管)
    flappy_logic_init_ctx(&g);
    // 5.1 地面碰撞判定
    g.y = FLAPPY_GROUND_Y - g.h + 1.0f;
    assert(flappy_logic_check_collision_ctx(&g) == true);

    // 5.2 天花板碰撞判定
    g.y = -1.0f;
    assert(flappy_logic_check_collision_ctx(&g) == true);

    // 5.3 上水管碰撞判定
    g.y = 70.0f; // 位于上水管实体区
    g.pipes[0].x = g.x; // 水平重叠
    g.pipes[0].gap_y = 100.0f; // 上水管占据 [0, 100]
    g.pipes[0].gap_height = 80.0f;
    assert(flappy_logic_check_collision_ctx(&g) == true);

    // 5.4 下水管碰撞判定
    g.y = 190.0f; // 位于下水管实体区 (100 + 80 = 180 下方)
    assert(flappy_logic_check_collision_ctx(&g) == true);

    // 5.5 缝隙安全通行 (无碰撞)
    g.y = 120.0f; // 鸟高 16, 占据 [120, 136], 处于缝隙 [100, 180] 内
    assert(flappy_logic_check_collision_ctx(&g) == false);

    // 5.6 碰撞导致游戏失败阵亡
    g.y = 70.0f; // 再次撞上水管
    flappy_logic_update_ctx(&g, 20);
    assert(g.state == FLAPPY_STATE_GAMEOVER);
    assert(g.game_over == true);
    assert(g.snd_hit == true);
    assert(g.snd_die == true);
    printf("  ✓ 5. Precise AABB Collision Detection (Ground, Ceiling, Pipes) OK\n");

    // 6. 成功穿越水管中心线加分与历史最高分测试
    flappy_logic_init_ctx(&g);
    g.gravity = 0.0f; // 冻结重力以专注于水管穿越时序测试
    g.turbulence_enabled = false;
    g.vy = 0.0f;
    g.y = 120.0f; // 鸟位于高度 120 (安全处于缝隙内)

    // 水管中心线初始置于小鸟中心线右侧 2px
    float bird_cx = g.x + g.w * 0.5f;
    g.pipes[0].x = bird_cx - g.pipes[0].width * 0.5f + 2.0f;
    g.pipes[0].gap_y = 90.0f;
    g.pipes[0].gap_height = 90.0f;
    g.pipes[0].passed = false;
    assert(g.score == 0);

    // 推进一帧，水管左移，小鸟中心线超越水管中心线
    flappy_logic_update_ctx(&g, 40); // 移动 80 * 0.04 = 3.2px > 2.0px
    assert(g.pipes[0].passed == true);
    assert(g.score == 1);
    assert(g.high_score == 1);
    assert(g.snd_score == true);

    // 再次更新同一根水管，不能重复加分
    flappy_logic_update_ctx(&g, 40);
    assert(g.score == 1);
    assert(g.high_score == 1);
    printf("  ✓ 6. Centerline Cross Scoring & High Score Tracking OK\n");

    // 7. 动态环境：昼夜模式切换与风阻乱流扰动测试
    flappy_logic_init_ctx(&g);
    assert(g.is_night == false);
    g.score = 9;
    g.gravity = 0.0f;
    g.y = 120.0f;
    g.pipes[0].x = g.x + g.w * 0.5f - g.pipes[0].width * 0.5f + 1.0f;
    g.pipes[0].gap_y = 90.0f;
    g.pipes[0].gap_height = 90.0f;
    g.pipes[0].passed = false;
    flappy_logic_update_ctx(&g, 30);
    assert(g.score == 10);
    assert(g.is_night == true); // 满 10 分切换至黑夜

    // 验证乱流与微扰系统
    flappy_logic_init_ctx(&g);
    assert(g.turbulence_enabled == true);
    flappy_logic_update_ctx(&g, 100);
    assert(g.turbulence_phase > 0.0f);
    assert(fabsf(g.turbulence_force) > 0.0f);
    printf("  ✓ 7. Dynamic Environment (Day/Night Mode & Turbulence) OK\n");

    // 8. 死亡状态机与重启测试
    flappy_logic_init_ctx(&g);
    g.score = 7;
    g.high_score = 7;
    g.y = FLAPPY_GROUND_Y; // 触地阵亡
    flappy_logic_update_ctx(&g, 10);
    assert(g.state == FLAPPY_STATE_GAMEOVER);

    // 验证死亡状态下管道静止、分数冻结
    float frozen_pipe_x = g.pipes[0].x;
    flappy_logic_update_ctx(&g, 100);
    assert(g.pipes[0].x == frozen_pipe_x);
    assert(g.score == 7);

    // 验证死亡状态下按跳跃键无效 (小鸟不会升空)
    float dead_y = g.y;
    flappy_logic_flap_ctx(&g);
    flappy_logic_update_ctx(&g, 50);
    assert(g.y == dead_y);

    // 验证重启游戏后历史最高分得以保留
    flappy_logic_restart_ctx(&g);
    assert(g.state == FLAPPY_STATE_PLAYING);
    assert(g.score == 0);
    assert(g.high_score == 7); // 历史最高分保留
    assert(g.y == FLAPPY_BIRD_INIT_Y);
    printf("  ✓ 8. Death State Machine & High Score Preservation OK\n");

    // 9. 全局默认实例标准 API 验证 (flappy_logic_init / update / flap / get_state)
    flappy_logic_init();
    flappy_game_t *sg = flappy_logic_get_state();
    assert(sg != NULL);
    assert(sg->state == FLAPPY_STATE_PLAYING);
    assert(sg->y == FLAPPY_BIRD_INIT_Y);

    flappy_logic_flap();
    assert(sg->vy == sg->flap_impulse);
    assert(sg->rotation == FLAPPY_ROTATION_UP);

    flappy_logic_update(30);
    assert(sg->y < FLAPPY_BIRD_INIT_Y);
    printf("  ✓ 9. Global Singleton API Standard Interface OK\n");

    // 10. 金水管双倍计分与难度爬升
    flappy_logic_init_ctx(&g);
    g.gravity = 0.0f;
    g.turbulence_enabled = false;
    g.vy = 0.0f;
    g.y = 120.0f;
    float bird_cx2 = g.x + g.w * 0.5f;
    g.pipes[0].x = bird_cx2 - g.pipes[0].width * 0.5f + 2.0f;
    g.pipes[0].gap_y = 90.0f;
    g.pipes[0].gap_base_y = 90.0f;
    g.pipes[0].gap_height = 90.0f;
    g.pipes[0].passed = false;
    g.pipes[0].golden = true;
    flappy_logic_update_ctx(&g, 40);
    assert(g.pipes[0].passed == true);
    assert(g.score == 2);
    assert(g.golden_count == 1);
    assert(g.snd_golden == true);
    assert(g.pipe_speed > FLAPPY_PIPE_SPEED);
    printf("  ✓ 10. Golden Pipe Double Score & Speed Ramp OK\n");

    printf("\n[PASS] All Flappy Bird (Pixel Bird) Unit Tests Passed Successfully!\n");
    return 0;
}
