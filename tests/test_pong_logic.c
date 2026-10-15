#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "pong_logic.h"

int main(void)
{
    printf("[TEST] Testing Chaos Pong Pure C11 Game Logic...\n");

    pong_game_t g;
    pong_logic_init(&g);

    // 1. 初始化状态验证 (240x320 竖屏、挡板居中、0:0发球就绪、默认球体)
    assert(PONG_SCREEN_W == 240);
    assert(PONG_SCREEN_H == 320);
    assert(PONG_WINNING_SCORE == 5);
    assert(g.player_score == 0);
    assert(g.ai_score == 0);
    assert(g.state == PONG_STATE_SERVE);
    assert(g.winner == PONG_WINNER_NONE);
    assert(g.serve_owner == PONG_SIDE_PLAYER);
    assert(g.player_paddle_x == 120.0f);
    assert(g.player_paddle_y == 300.0f);
    assert(g.ai_paddle_x == 120.0f);
    assert(g.ai_paddle_y == 20.0f);
    assert(g.balls[0].active == true);
    assert(g.balls[1].active == false);
    assert(g.balls[0].mutation == PONG_MUTATION_NORMAL);
    assert(g.balls[0].radius == PONG_BALL_DEFAULT_RADIUS);
    assert(g.last_sweet_spot == false);
    printf("  ✓ Initialization & Default Layout OK (240x320, 0:0 Serve Ready)\n");

    // 2. 按键输入与挡板屏幕边界限制 (UP向左，DOWN向右，不能越出屏幕边缘)
    for (int i = 0; i < 60; i++) {
        pong_logic_input(&g, PONG_KEY_UP, true);
    }
    assert(g.player_paddle_x >= g.player_paddle_w / 2.0f);
    pong_logic_input(&g, PONG_KEY_UP, false);

    for (int i = 0; i < 120; i++) {
        pong_logic_input(&g, PONG_KEY_DOWN, true);
    }
    assert(g.player_paddle_x <= PONG_SCREEN_W - g.player_paddle_w / 2.0f);
    pong_logic_input(&g, PONG_KEY_DOWN, false);

    // 发球准备阶段，球跟随玩家挡板水平联动
    pong_logic_update(&g, 16);
    assert(g.balls[0].x == g.player_paddle_x);
    printf("  ✓ Key Input & Screen Clamping (UP-Left, DOWN-Right) OK\n");

    // 3. OK 键发球测试
    pong_logic_input(&g, PONG_KEY_OK, true);
    pong_logic_input(&g, PONG_KEY_OK, false);
    assert(g.state == PONG_STATE_PLAYING);
    assert(g.balls[0].vy < 0.0f); // 向上飞向对手
    assert(g.snd_serve == true);
    printf("  ✓ Serve Action via OK Key OK\n");

    // 4. 左右球体边界反弹测试 (Wall Bouncing)
    // 左墙反弹
    g.balls[0].x = 6.0f;
    g.balls[0].y = 150.0f;
    g.balls[0].vx = -120.0f;
    g.balls[0].vy = -100.0f;
    pong_logic_update(&g, 50);
    assert(g.balls[0].vx > 0.0f);
    assert(g.balls[0].x >= g.balls[0].radius);
    assert(g.snd_hit_wall == true);

    // 右墙反弹
    g.balls[0].x = 236.0f;
    g.balls[0].y = 150.0f;
    g.balls[0].vx = 120.0f;
    g.balls[0].vy = -100.0f;
    pong_logic_update(&g, 50);
    assert(g.balls[0].vx < 0.0f);
    assert(g.balls[0].x <= PONG_SCREEN_W - g.balls[0].radius);
    assert(g.snd_hit_wall == true);
    printf("  ✓ Left/Right Wall Bounce Physics & Sound Event OK\n");

    // 5. 挡板接球与反弹角度偏移 (Paddle Deflection & Angles)
    // 5.1 正中心反弹：vx 保持接近 0，vy 垂直向上
    pong_logic_init(&g);
    g.state = PONG_STATE_PLAYING;
    g.player_paddle_x = 120.0f;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 290.0f;
    g.balls[0].vx = 0.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40);
    assert(g.balls[0].vy < 0.0f);
    assert(fabsf(g.balls[0].vx) < 1e-2f);
    assert(g.snd_hit_paddle == true);
    assert(g.rally_hits == 1);

    // 5.2 击中挡板右半部：角度向右偏转 (vx > 0)
    g.balls[0].x = 135.0f; // 相对中心向右 15px
    g.balls[0].y = 290.0f;
    g.balls[0].vx = 0.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40);
    assert(g.balls[0].vy < 0.0f);
    assert(g.balls[0].vx > 20.0f);

    // 5.3 击中挡板左半部：角度向左偏转 (vx < 0)
    g.balls[0].x = 105.0f; // 相对中心向左 15px
    g.balls[0].y = 290.0f;
    g.balls[0].vx = 0.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40);
    assert(g.balls[0].vy < 0.0f);
    assert(g.balls[0].vx < -20.0f);

    // 5.4 AI 挡板反弹：球向上飞向对方，碰撞后向下反弹 (vy > 0)
    g.ai_paddle_x = 120.0f;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 30.0f;
    g.balls[0].vx = 0.0f;
    g.balls[0].vy = -200.0f;
    pong_logic_update(&g, 40);
    assert(g.balls[0].vy > 0.0f);
    assert(g.snd_hit_paddle == true);
    printf("  ✓ Paddle Collision & Deflection Angle Offsets (Center/Left/Right/AI) OK\n");

    // 6. 接球瞬间切削加转机制 (Slice / Spin Shot)
    pong_logic_init(&g);
    g.state = PONG_STATE_PLAYING;
    g.player_paddle_x = 120.0f;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 290.0f;
    g.balls[0].vx = 0.0f;
    g.balls[0].vy = 200.0f;

    // 玩家按 OK 触发切球窗口，并向左移按 UP
    pong_logic_input(&g, PONG_KEY_UP, true);
    pong_logic_input(&g, PONG_KEY_OK, true);
    assert(g.slice_timer_ms > 0);
    pong_logic_update(&g, 40);
    assert(g.slice_hit_count == 1);
    assert(g.last_slice_hit == true);
    assert(g.snd_slice == true);
    assert(g.balls[0].vx < -50.0f); // 受到切削获得强烈向左初速
    assert(g.balls[0].curve_accel < 0.0f); // 产生侧旋加速度
    pong_logic_input(&g, PONG_KEY_UP, false);
    pong_logic_input(&g, PONG_KEY_OK, false);
    printf("  ✓ Slicing & Spin Acceleration Mechanism (OK + Movement) OK\n");

    // 7. AI 自动跟随与反应延迟测试 (AI Tracking & Reaction Delay)
    pong_logic_init(&g);
    g.state = PONG_STATE_PLAYING;
    g.ai_paddle_x = 120.0f;
    // 球飞向对方并位于右侧 x=200
    g.balls[0].x = 200.0f;
    g.balls[0].y = 120.0f;
    g.balls[0].vy = -180.0f;
    g.ai_reaction_timer_ms = 0;

    // 前 20ms（小于 60ms 反应延迟），AI 目标尚未更新到新位置
    pong_logic_update(&g, 20);
    assert(g.ai_target_x == 120.0f);

    // 超过反应延迟后，目标更新并以平滑速度向右追踪，非瞬间移动
    pong_logic_update(&g, 60);
    assert(g.ai_target_x == 200.0f);
    assert(g.ai_paddle_x > 120.0f);
    assert(g.ai_paddle_x < 200.0f);
    printf("  ✓ AI Autonomous Tracking & Latency Delay Response OK\n");

    // 8. 变异机制与五大形态测试 (Mutations: Normal, Mega, Hyper, Curve, Dual)
    // 8.1 MEGA_BALL (巨大化慢速)
    pong_trigger_mutation(&g, PONG_MUTATION_MEGA_BALL);
    assert(g.balls[0].mutation == PONG_MUTATION_MEGA_BALL);
    assert(g.balls[0].radius == PONG_BALL_MEGA_RADIUS);
    assert(g.snd_mutation == true);

    // 8.2 HYPER_SPEED (超光速疾驰)
    float spd_before = fabsf(g.balls[0].vy);
    pong_trigger_mutation(&g, PONG_MUTATION_HYPER_SPEED);
    assert(g.balls[0].mutation == PONG_MUTATION_HYPER_SPEED);
    assert(g.balls[0].radius == PONG_BALL_HYPER_RADIUS);
    assert(fabsf(g.balls[0].vy) > spd_before);

    // 8.3 CURVE_BALL (带切向旋转弧线)
    pong_trigger_mutation(&g, PONG_MUTATION_CURVE_BALL);
    assert(g.balls[0].mutation == PONG_MUTATION_CURVE_BALL);
    assert(fabsf(g.balls[0].curve_accel) > 0.0f);
    float vx_prev = g.balls[0].vx;
    pong_logic_update(&g, 40);
    assert(g.balls[0].vx != vx_prev); // 水平速度由于切向加速度持续变化

    // 8.4 DUAL_BALL (分裂双球)
    pong_trigger_mutation(&g, PONG_MUTATION_DUAL_BALL);
    assert(g.balls[0].mutation == PONG_MUTATION_DUAL_BALL);
    assert(g.balls[1].active == true);
    assert(g.balls[1].mutation == PONG_MUTATION_DUAL_BALL);

    // 8.5 碰撞往返达到阈值自动触发随机变异
    pong_logic_init(&g);
    g.state = PONG_STATE_PLAYING;
    g.mutation_threshold = 4;
    g.rally_hits = 3;
    g.balls[0].mutation = PONG_MUTATION_NORMAL;
    g.player_paddle_x = 120.0f;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 290.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40); // 触发第 4 次击球
    assert(g.rally_hits == 4);
    assert(g.balls[0].mutation != PONG_MUTATION_NORMAL); // 发生变异！
    assert(g.snd_mutation == true);
    printf("  ✓ Chaos Mutations (Mega, Hyper, Curve, Dual & Auto-trigger) OK\n");

    // 9. 计分系统与回合重置 (Scoring & Round Reset)
    // 9.1 球飞出顶部 (y < 0)：玩家得 1 分，回合重置到发球准备，变异状态重置
    pong_logic_init(&g);
    g.state = PONG_STATE_PLAYING;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 2.0f;
    g.balls[0].vy = -200.0f;
    pong_logic_update(&g, 40);
    assert(g.player_score == 1);
    assert(g.ai_score == 0);
    assert(g.snd_score == true);
    assert(g.state == PONG_STATE_SERVE);
    assert(g.serve_owner == PONG_SIDE_PLAYER);
    assert(g.rally_hits == 0);
    assert(g.balls[0].mutation == PONG_MUTATION_NORMAL);

    // 9.2 球飞出底部 (y > 320)：对方 AI 得 1 分
    g.state = PONG_STATE_PLAYING;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 318.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40);
    assert(g.player_score == 1);
    assert(g.ai_score == 1);
    assert(g.snd_score == true);
    assert(g.state == PONG_STATE_SERVE);
    assert(g.serve_owner == PONG_SIDE_AI);
    printf("  ✓ Score Awarding & Round Reset Mechanics OK\n");

    // 10. 终局胜利判定 (Game Over: 先得 5 分胜出)
    // 玩家先得 5 分
    g.player_score = 4;
    g.ai_score = 3;
    g.state = PONG_STATE_PLAYING;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 2.0f;
    g.balls[0].vy = -200.0f;
    pong_logic_update(&g, 40);
    assert(g.player_score == 5);
    assert(g.state == PONG_STATE_GAME_OVER);
    assert(g.winner == PONG_WINNER_PLAYER);
    assert(g.snd_gameover == true);

    // 游戏结束后按 OK 重新开局
    pong_logic_input(&g, PONG_KEY_OK, true);
    assert(g.state == PONG_STATE_SERVE);
    assert(g.player_score == 0);
    assert(g.ai_score == 0);

    // AI 先得 5 分
    g.player_score = 1;
    g.ai_score = 4;
    g.state = PONG_STATE_PLAYING;
    g.balls[0].x = 120.0f;
    g.balls[0].y = 318.0f;
    g.balls[0].vy = 200.0f;
    pong_logic_update(&g, 40);
    assert(g.ai_score == 5);
    assert(g.state == PONG_STATE_GAME_OVER);
    assert(g.winner == PONG_WINNER_AI);
    assert(g.snd_gameover == true);
    printf("  ✓ Final Victory & Match End Trigger (First to 5 Points) OK\n");

    printf("[PASS] All Chaos Pong Pure C11 Unit Tests Passed!\n");
    return 0;
}
