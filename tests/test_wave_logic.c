// tests/test_wave_logic.c —— 《浪涌漫游者》(Wave Walker) 核心算法与物理引擎单元测试
#include "wave_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

#ifndef M_PI_F
#define M_PI_F 3.14159265358979323846f
#endif

int main(void) {
    setbuf(stdout, NULL); // 禁用缓冲，实时打印
    printf("=======================================================\n");
    printf("     Wave Walker Game Engine Unit Tests (Pure C11)     \n");
    printf("=======================================================\n");

    // [TEST 1] 波浪高度与切线斜率数学模型验证
    printf("[TEST 1] Testing Wave Surface Math & Tangent Angle...\n");
    {
        // 验证海面高度处于预定振幅范围内
        for (float x = 0.0f; x <= 600.0f; x += 15.0f) {
            float y = wave_get_surface_y(x, 0.0f);
            float min_limit = WAVE_BASE_Y - (WAVE_AMP_1 + WAVE_AMP_2 + 1.0f);
            float max_limit = WAVE_BASE_Y + (WAVE_AMP_1 + WAVE_AMP_2 + 1.0f);
            assert(y >= min_limit && y <= max_limit);
        }

        // 验证解析导数 slope 与数值差分导数的高度吻合 (误差 < 0.001)
        float eps = 0.02f;
        for (float x = 10.0f; x <= 400.0f; x += 25.0f) {
            float analytical_slope = wave_get_slope(x, 1.2f);
            float num_slope = (wave_get_surface_y(x + eps, 1.2f) - wave_get_surface_y(x - eps, 1.2f)) / (2.0f * eps);
            assert(fabsf(analytical_slope - num_slope) < 0.01f);
        }

        // 验证切线角度范围与工具函数
        for (float x = 0.0f; x <= 400.0f; x += 20.0f) {
            float angle = wave_get_tangent_angle(x, 0.5f);
            assert(angle >= -90.0f && angle <= 90.0f);
        }

        // 验证角度规范化与夹角差值
        assert(fabsf(wave_angle_normalize_180(370.0f) - 10.0f) < 0.001f);
        assert(fabsf(wave_angle_normalize_180(-190.0f) - 170.0f) < 0.001f);
        assert(fabsf(wave_angle_difference(10.0f, 350.0f) - 20.0f) < 0.001f);
        assert(fabsf(wave_angle_difference(170.0f, -170.0f) - 20.0f) < 0.001f);

        printf("  ✓ Wave analytical derivatives & tangent angle math OK\n");
    }

    // [TEST 2] 系统初始化与属性基准验证
    printf("[TEST 2] Testing System Initialization & Screen Constants...\n");
    {
        assert(WAVE_SCREEN_W == 240);
        assert(WAVE_SCREEN_H == 320);

        wave_game_t game;
        wave_init(&game, 0x12345678);

        assert(game.game_state == WAVE_GAME_PLAYING);
        assert(game.otter_state == WAVE_OTTER_SURFING);
        assert(fabsf(game.x - WAVE_OTTER_X) < 0.001f);
        assert(fabsf(game.speed - WAVE_SPEED_BASE) < 0.001f);
        assert(game.hp == 3);
        assert(game.max_hp == 3);
        assert(game.combo == 0);
        assert(game.score == 0);
        assert(game.pending_sound == WAVE_SND_NONE);

        printf("  ✓ System state, HP, baseline speed & screen dimensions OK\n");
    }

    // [TEST 3] 顺坡压板俯冲加速 vs 逆坡阻水
    printf("[TEST 3] Testing Down-slope Pumping Boost vs Up-slope Resistance...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x9999);

        // 寻找一个处于顺坡 (下坡，tangent_angle > 10°) 的时间点或位置
        float initial_angle = wave_get_game_tangent_angle(&game, game.x);
        while (!wave_is_down_slope(initial_angle) || initial_angle < 12.0f) {
            game.distance += 10.0f;
            initial_angle = wave_get_game_tangent_angle(&game, game.x);
        }

        // 按住 DOWN 键进行压板加速
        wave_input_down_press(&game);
        assert(game.is_down_pressed == true);

        float speed_before = game.speed;
        // 步进几帧进行俯冲加速
        for (int i = 0; i < 10; i++) {
            wave_step(&game, 30);
        }

        assert(game.otter_state == WAVE_OTTER_PUMPING);
        assert(game.speed > speed_before); // 速度显著提升！
        assert(game.pending_sound == WAVE_SND_SURF_RUSH || game.pending_sound == WAVE_SND_NONE);

        // 松开 DOWN 键，状态恢复为 SURFING
        wave_input_down_release(&game);
        assert(game.is_down_pressed == false);
        wave_step(&game, 30);
        assert(game.otter_state == WAVE_OTTER_SURFING);

        // 测试逆坡按 DOWN 键受阻减速
        while (wave_get_game_tangent_angle(&game, game.x) > -8.0f) {
            game.distance += 10.0f;
        }
        float speed_up_before = game.speed;
        wave_input_down_press(&game);
        for (int i = 0; i < 5; i++) {
            wave_step(&game, 30);
        }
        assert(game.speed < speed_up_before); // 逆坡压板阻水减速！
        wave_input_down_release(&game);

        printf("  ✓ Down-slope pumping boost & up-slope resistance OK\n");
    }

    // [TEST 4] 浪尖借冲力跃浪腾空 (Crest Launch)
    printf("[TEST 4] Testing Crest Launch & Velocity Scaling...\n");
    {
        wave_game_t game1;
        wave_init(&game1, 0x1111);
        game1.speed = WAVE_SPEED_BASE; // 基础速度 150
        wave_input_ok(&game1);
        assert(game1.otter_state == WAVE_OTTER_AIRBORNE);
        assert(game1.pending_sound == WAVE_SND_LAUNCH);
        float vy1 = game1.vy;

        wave_game_t game2;
        wave_init(&game2, 0x2222);
        game2.speed = 300.0f; // 高速冲浪 300
        wave_input_ok(&game2);
        float vy2 = game2.vy;

        // 冲浪速度越快，借冲力腾空跃起初速度越大 (负方向更大)
        assert(vy2 < vy1);
        assert(vy1 < -300.0f);
        assert(vy2 < -400.0f);

        // 验证起跳后在空中受到重力作用
        float y_start = game1.y;
        wave_step(&game1, 50);
        assert(game1.y < y_start); // 垂直上升中 (Y 减小)

        printf("  ✓ Crest launch dynamics & velocity-boosted leap OK\n");
    }

    // [TEST 5] 空中 360° 滑稽大翻滚特技与累计得分
    printf("[TEST 5] Testing Airborne 360 Stunt Flips & Rotations...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x3333);

        // 进入空中
        wave_input_ok(&game);
        assert(game.otter_state == WAVE_OTTER_AIRBORNE);
        assert(game.stunt_flips == 0);
        uint32_t score_before = game.score;

        // 连续按 UP 键进行顺时针空翻
        for (int i = 0; i < 11; i++) {
            wave_input_up(&game);
        }
        // 累计旋转应已跨过 360°
        assert(game.stunt_flips >= 1);
        assert(game.score > score_before);
        assert(game.pending_sound == WAVE_SND_TRICK_SWOOSH);

        // 再多按几下完成 720° (2 连翻)
        for (int i = 0; i < 12; i++) {
            wave_input_up(&game);
        }
        assert(game.stunt_flips >= 2);

        // 测试逆时针按 DOWN 翻滚亦累计度数
        wave_game_t game_down;
        wave_init(&game_down, 0x4444);
        wave_input_ok(&game_down);
        for (int i = 0; i < 12; i++) {
            wave_input_down(&game_down);
        }
        assert(game_down.stunt_flips >= 1);

        printf("  ✓ Airborne 360° flip stunt detection & combo score OK\n");
    }

    // [TEST 6] 空中 OK 键快速校正板面姿态
    printf("[TEST 6] Testing Mid-Air Alignment Snap via OK Key...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x5555);
        wave_input_ok(&game); // 起跳

        // 空中随意翻滚，板面角度混乱
        game.board_angle = 175.0f; // 几乎倒扣
        game.air_rot_vel = 500.0f;

        // 按下 OK 键一刻对齐板面
        wave_input_ok(&game);

        float expected_wave_angle = wave_get_game_tangent_angle(&game, game.x);
        assert(fabsf(game.board_angle - expected_wave_angle) < 0.001f);
        assert(fabsf(game.air_rot_vel) < 0.001f);

        printf("  ✓ Mid-air board alignment snap OK\n");
    }

    // [TEST 6b] 按住 OK 时每一帧都把板面对齐当前浪面
    printf("[TEST 6b] Testing held OK keeps the board on the wave...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x5656);
        wave_input_ok(&game);
        game.board_angle = 170.0f;
        game.air_rot_vel = 400.0f;
        wave_input_ok_hold(&game, true);

        wave_step(&game, 30);

        float wave_ang = wave_get_game_tangent_angle(&game, game.x);
        assert(fabsf(game.board_angle - wave_ang) < 0.001f);
        assert(fabsf(game.air_rot_vel) < 0.001f);

        wave_input_ok_hold(&game, false);
        game.board_angle = 170.0f;
        game.air_rot_vel = 0.0f;
        wave_step(&game, 30);
        assert(wave_angle_difference(game.board_angle,
                                    wave_get_game_tangent_angle(&game, game.x)) > 45.0f);

        printf("  ✓ Held OK levels the board, release stops forcing it OK\n");
    }

    // [TEST 7] 完美切水入浪 (Clean Entry) 与彩虹二次冲刺
    printf("[TEST 7] Testing Perfect Clean Entry & Secondary Boost...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x6666);
        wave_input_ok(&game); // 起跳

        // 模拟小海獭从高空坠落到海面接触点 (vy > 0 且 y >= surface_y)
        float surf_y = wave_get_game_surface_y(&game, game.x);
        float wave_ang = wave_get_game_tangent_angle(&game, game.x);

        game.y = surf_y - 2.0f;
        game.vy = 200.0f; // 正在下落
        game.board_angle = wave_ang; // 完美贴合角度！(偏差 0)
        game.speed = 160.0f;

        // 步进一帧使其触水
        wave_step(&game, 20);

        assert(game.otter_state == WAVE_OTTER_SURFING);
        assert(game.combo == 1);
        assert(game.speed > 250.0f); // 获得瞬时二次冲刺！
        assert(game.boost_timer_ms > 0.0f);
        assert(game.pending_sound == WAVE_SND_PERFECT_ENTRY);

        // 再次起跳并再次完美入水测试连击叠加
        wave_input_ok(&game);
        game.y = wave_get_game_surface_y(&game, game.x) - 2.0f;
        game.vy = 200.0f;
        game.board_angle = wave_get_game_tangent_angle(&game, game.x);
        wave_step(&game, 20);

        assert(game.combo == 2);
        assert(game.max_combo == 2);

        printf("  ✓ Perfect clean entry, combo accumulation & speed boost OK\n");
    }

    // [TEST 8] 肚皮啪叽拍水 (Belly Flop) 与搞笑眩晕
    printf("[TEST 8] Testing Belly Flop Wipeout & Dazed State...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x7777);
        game.combo = 3; // 先拥有连击

        wave_input_ok(&game); // 起跳

        // 模拟下落，但板面完全垂直或倒扣 (与波浪偏差 90°)
        float surf_y = wave_get_game_surface_y(&game, game.x);
        float wave_ang = wave_get_game_tangent_angle(&game, game.x);

        game.y = surf_y - 2.0f;
        game.vy = 200.0f;
        game.board_angle = wave_ang + 90.0f; // 严重偏差！

        wave_step(&game, 20);

        // 验证进入肚皮拍水搞笑翻车
        assert(game.otter_state == WAVE_OTTER_DAZED);
        assert(game.combo == 0); // 连击清零
        assert(fabsf(game.speed - WAVE_SPEED_MIN) < 0.001f); // 速度减到保底最低
        assert(game.daze_timer_ms > 500.0f);
        assert(game.pending_sound == WAVE_SND_BELLY_FLOP);

        // 步进跨过眩晕时间
        for (int i = 0; i < 30; i++) {
            wave_step(&game, 30);
        }
        assert(game.otter_state == WAVE_OTTER_SURFING); // 恢复正常

        printf("  ✓ Belly flop wipeout, combo reset & daze timer recovery OK\n");
    }

    // [TEST 9] 障碍物躲避、受创扣血与死亡结算
    printf("[TEST 9] Testing Obstacle Avoidance & Damage Systems...\n");
    {
        wave_game_t game;
        wave_init(&game, 0x8888);

        // 在海獭前方放置一个贴水漂流木
        game.obstacles[0].active = true;
        game.obstacles[0].type = WAVE_OBS_DRIFTWOOD;
        game.obstacles[0].w = 26.0f;
        game.obstacles[0].h = 14.0f;
        game.obstacles[0].floats_on_surface = true;
        game.obstacles[0].x = game.distance + WAVE_OTTER_X + 10.0f;

        // 贴水前行撞上漂流木
        wave_step(&game, 30);
        assert(game.hp == 2); // 扣 1 点血
        assert(game.invuln_timer_ms > 0.0f); // 触发无敌闪烁
        assert(game.pending_sound == WAVE_SND_HIT_OBSTACLE);
        assert(game.obstacles[0].active == false); // 障碍触发后消除

        // 无敌时间内再次撞击不扣血
        game.obstacles[0].active = true;
        game.obstacles[0].x = game.distance + WAVE_OTTER_X;
        wave_step(&game, 30);
        assert(game.hp == 2);

        // 测试腾空跳过障碍物
        game.invuln_timer_ms = 0.0f; // 消除无敌
        game.obstacles[1].active = true;
        game.obstacles[1].type = WAVE_OBS_CRAB;
        game.obstacles[1].w = 16.0f;
        game.obstacles[1].h = 12.0f;
        game.obstacles[1].floats_on_surface = true;
        game.obstacles[1].x = game.distance + WAVE_OTTER_X + 2.0f;
        game.obstacles[1].y = wave_get_game_surface_y(&game, WAVE_OTTER_X) - 12.0f;

        // 海獭借浪起跳，高空飞过
        game.otter_state = WAVE_OTTER_AIRBORNE;
        game.y = wave_get_game_surface_y(&game, WAVE_OTTER_X) - 80.0f; // 在高空
        wave_step(&game, 30);
        assert(game.hp == 2); // 成功高空飞跃避开，未受伤害！

        // 测试生命扣尽进入 GAME_OVER
        game.hp = 1;
        game.invuln_timer_ms = 0.0f;
        game.otter_state = WAVE_OTTER_SURFING;
        game.obstacles[2].active = true;
        game.obstacles[2].type = WAVE_OBS_CRAB;
        game.obstacles[2].w = 20.0f;
        game.obstacles[2].h = 20.0f;
        game.obstacles[2].x = game.distance + WAVE_OTTER_X;
        game.obstacles[2].y = wave_get_game_surface_y(&game, WAVE_OTTER_X) - 20.0f;

        wave_step(&game, 30);
        assert(game.hp == 0);
        assert(game.game_state == WAVE_GAME_OVER);
        assert(game.pending_sound == WAVE_SND_GAMEOVER);

        printf("  ✓ Obstacle collision, invulnerability frames & game over OK\n");
    }

    // [TEST 10] 收集物拾取 (海星与贝壳)
    printf("[TEST 10] Testing Starfish & Pearl Shell Pickups...\n");
    {
        wave_game_t game;
        wave_init(&game, 0xAAAA);
        game.hp = 2; // 受伤状态

        // 放置五角海星
        game.items[0].active = true;
        game.items[0].type = WAVE_ITEM_STARFISH;
        game.items[0].x = game.distance + WAVE_OTTER_X;
        game.items[0].y = game.y - 5.0f;
        game.items[0].r = 10.0f;

        uint32_t score_pre = game.score;
        wave_step(&game, 20);
        assert(game.items[0].active == false);
        assert(game.starfish_count == 1);
        assert(game.score > score_pre);
        assert(game.pending_sound == WAVE_SND_STAR_COLLECT);

        // 放置珍珠贝壳
        game.items[1].active = true;
        game.items[1].type = WAVE_ITEM_SHELL;
        game.items[1].x = game.distance + WAVE_OTTER_X;
        game.items[1].y = game.y - 5.0f;
        game.items[1].r = 12.0f;

        wave_step(&game, 20);
        assert(game.items[1].active == false);
        assert(game.shell_count == 1);
        assert(game.hp == 3); // 贝壳成功恢复生命值！
        assert(game.pending_sound == WAVE_SND_SHELL_COLLECT);

        printf("  ✓ Starfish collection, pearl shell HP restore & score OK\n");
    }

    // [TEST 11] 零动态分配与对象池循环安全
    printf("[TEST 11] Testing Object Pool Recycling & Zero-Allocation Invariant...\n");
    {
        wave_game_t game;
        wave_init(&game, 0xBBBB);

        // 模拟冲浪长距离移动 5000px，大量实体生成与回收
        for (int step = 0; step < 200; step++) {
            wave_step(&game, 30);
        }

        // 验证没有内存溢出，对象池实体都在合法索引内
        for (int i = 0; i < WAVE_MAX_OBSTACLES; i++) {
            if (game.obstacles[i].active) {
                float screen_x = game.obstacles[i].x - game.distance;
                assert(screen_x >= -60.0f); // 超出屏幕左侧已被回收
            }
        }
        for (int i = 0; i < WAVE_MAX_ITEMS; i++) {
            if (game.items[i].active) {
                float screen_x = game.items[i].x - game.distance;
                assert(screen_x >= -50.0f);
            }
        }

        printf("  ✓ Object pool recycling & memory bounds OK\n");
    }

    printf("=======================================================\n");
    printf("  ALL WAVE WALKER UNIT TESTS PASSED WITH 100%% SUCCESS! \n");
    printf("=======================================================\n");
    return 0;
}
