// tests/test_pawssprint_dx_logic.c —— 《短腿爪爪运动会·进化版》(Paws Sprint DX) 纯 C 状态机算法引擎全套宿主单元测试
#include "pawssprint_dx_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

#define EPSILON 0.001f

// ============================================================================
// 测试 1：初始化、重置、几何常量与生命周期
// ============================================================================
static void test_initialization_and_lifecycle(void)
{
    printf("[TEST 1] Testing Initialization, Reset, Lane Geometry & Lifecycle...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x12345678);

    // 屏幕常数与初始状态
    assert(PSDX_SCREEN_W == 240);
    assert(PSDX_SCREEN_H == 320);
    assert(g.state == PSDX_STATE_RUNNING);
    assert(psdx_game_is_running(&g));
    assert(!psdx_game_is_victory(&g));

    // 车道坐标验证
    assert(fabsf(psdx_get_lane_center_x(0) - 50.0f) < EPSILON);
    assert(fabsf(psdx_get_lane_center_x(1) - 120.0f) < EPSILON);
    assert(fabsf(psdx_get_lane_center_x(2) - 190.0f) < EPSILON);

    // 越界钳制车道获取
    assert(fabsf(psdx_get_lane_center_x(-1) - 50.0f) < EPSILON);
    assert(fabsf(psdx_get_lane_center_x(99) - 190.0f) < EPSILON);

    // 玩家初始状态：居中 Lane 1 (X=120, Y=250), 柯基角色
    assert(g.player.char_type == PSDX_CHAR_CORGI);
    assert(g.player.current_lane == 1);
    assert(g.player.target_lane == 1);
    assert(fabsf(g.player.x - 120.0f) < EPSILON);
    assert(fabsf(g.player.y - PSDX_PLAYER_BASE_Y) < EPSILON);
    assert(!g.player.is_switching_lane);
    assert(!g.player.is_jumping);
    assert(!g.player.is_turbo);
    assert(!g.player.is_spinning);
    assert(!g.player.is_cushion_diving);

    // 得分与收集计数清零
    assert(g.score == 0);
    assert(g.bones_collected == 0);
    assert(g.coins_collected == 0);
    assert(g.obstacles_cleared == 0);
    assert(g.bananas_slipped == 0);
    assert(psdx_get_active_object_count(&g) == 0);
    assert(psdx_get_active_particle_count(&g) == 0);

    // 暂停与恢复测试
    psdx_game_pause(&g);
    assert(!psdx_game_is_running(&g));
    uint32_t t_before = g.game_time_ms;
    psdx_game_step(&g, 100);
    assert(g.game_time_ms == t_before); // 暂停时时间不推进

    psdx_game_resume(&g);
    assert(psdx_game_is_running(&g));
    psdx_game_step(&g, 100);
    assert(g.game_time_ms == t_before + 100);

    // 重置测试
    g.score = 999;
    g.bones_collected = 50;
    psdx_game_reset(&g);
    assert(g.score == 0);
    assert(g.bones_collected == 0);
    assert(g.player.current_lane == 1);
    assert(fabsf(g.player.x - 120.0f) < EPSILON);

    printf("  ✓ Init, reset, lane geometry & pause/resume OK\n");
}

// ============================================================================
// 测试 2：按键变道精准居中吸附、单次切道与边界严密阻拦
// ============================================================================
static void test_lane_switching_and_clamping(void)
{
    printf("[TEST 2] Testing Precise Lane Switching, Snap Alignment & Boundary Clamping...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x2222);

    // 1. 初始在 Lane 1 (X=120)
    assert(g.player.target_lane == 1);
    assert(fabsf(g.player.x - 120.0f) < EPSILON);

    // 2. 按 UP 切往左车道 Lane 0 (X=50)
    psdx_input_up(&g);
    assert(g.player.target_lane == 0);
    assert(g.player.is_switching_lane);

    // 步进推进平滑位移与强力吸附
    // 移速 450 px/s，从 120 移到 50 需 70 px，需约 155 ms
    psdx_game_step(&g, 50); // 移动 22.5 px -> 97.5 px
    assert(g.player.x < 120.0f && g.player.x > 50.0f);
    assert(g.player.is_switching_lane);

    psdx_game_step(&g, 150); // 彻底移过并触发强力居中对齐
    assert(fabsf(g.player.x - 50.0f) < EPSILON);
    assert(g.player.current_lane == 0);
    assert(!g.player.is_switching_lane);

    // 3. 边界严密阻拦：在 Lane 0 连续按 10 次 UP 键，绝对不越界
    for (int i = 0; i < 10; i++) {
        psdx_input_up(&g);
    }
    assert(g.player.target_lane == 0);
    psdx_game_step(&g, 100);
    assert(fabsf(g.player.x - 50.0f) < EPSILON);
    assert(g.player.current_lane == 0);

    // 4. DOWN 键切往中间车道 Lane 1 (X=120)
    psdx_input_down(&g);
    assert(g.player.target_lane == 1);
    for (int i = 0; i < 10; i++) {
        psdx_game_step(&g, 20);
    }
    assert(fabsf(g.player.x - 120.0f) < EPSILON);
    assert(g.player.current_lane == 1);
    assert(!g.player.is_switching_lane);

    // 5. DOWN 键切往右车道 Lane 2 (X=190)
    psdx_input_down(&g);
    assert(g.player.target_lane == 2);
    for (int i = 0; i < 10; i++) {
        psdx_game_step(&g, 20);
    }
    assert(fabsf(g.player.x - 190.0f) < EPSILON);
    assert(g.player.current_lane == 2);
    assert(!g.player.is_switching_lane);

    // 6. 边界严密阻拦：在 Lane 2 连续按 10 次 DOWN 键，绝对不越界
    for (int i = 0; i < 10; i++) {
        psdx_input_down(&g);
    }
    assert(g.player.target_lane == 2);
    psdx_game_step(&g, 100);
    assert(fabsf(g.player.x - 190.0f) < EPSILON);
    assert(g.player.current_lane == 2);

    // 7. 单次按键绝不连跳两道：在 Lane 0 按一次 DOWN，只能到 Lane 1，绝不到 Lane 2
    psdx_input_set_lane(&g, 0);
    psdx_game_step(&g, 500); // 移动到 Lane 0
    assert(fabsf(g.player.x - 50.0f) < EPSILON);

    psdx_input_down(&g); // 仅按一次
    assert(g.player.target_lane == 1);
    psdx_game_step(&g, 500);
    assert(fabsf(g.player.x - 120.0f) < EPSILON);
    assert(g.player.current_lane == 1);

    printf("  ✓ Lane switching, snap alignment & boundary clamping OK\n");
}

// ============================================================================
// 测试 3：跳跃 Z 轴抛物线物理、滞空时间与跨越障碍
// ============================================================================
static void test_jump_physics_and_clearing(void)
{
    printf("[TEST 3] Testing Jump Physics, Parabolic Arc, Air Time & Hurdle Clearing...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x3333);

    // 短按起跳：按下并在阈值内松开
    psdx_input_ok_down(&g);
    psdx_game_step(&g, 50); // 按压 50ms (< 250ms)
    psdx_input_ok_up(&g);

    assert(g.player.is_jumping);
    assert(g.player.jump_vz > 0.0f);
    assert(g.player.jump_z >= 0.0f);

    // 步进推进后高度上升
    psdx_game_step(&g, 20);
    assert(g.player.jump_z > 0.0f);

    // 演进观察上升弧线与最高顶点
    float max_z = 0.0f;
    bool reached_hurdle_clearance = false;
    uint32_t jump_duration_ms = 0;

    while (g.player.is_jumping && jump_duration_ms < 2000) {
        psdx_game_step(&g, 20);
        jump_duration_ms += 20;
        if (g.player.jump_z > max_z) {
            max_z = g.player.jump_z;
        }
        if (g.player.jump_z >= PSDX_HURDLE_CLEAR_Z) {
            reached_hurdle_clearance = true;
        }
    }

    // 理论最高点 H = v0^2 / (2g) = 280^2 / 1800 ≈ 43.55 px (欧拉离散积分约为 46.4px)
    assert(max_z >= 38.0f && max_z <= 48.0f);
    assert(reached_hurdle_clearance); // 必须高于跨栏通过阈值 (14px)
    // 理论滞空时间 T = 2 * v0 / g = 2 * 280 / 900 ≈ 0.622 秒 (622ms)
    assert(jump_duration_ms >= 560 && jump_duration_ms <= 680);
    // 落地后必须复位
    assert(!g.player.is_jumping);
    assert(fabsf(g.player.jump_z) < EPSILON);
    assert(fabsf(g.player.jump_vz) < EPSILON);

    // 测试实战：在空中有足够高度跃过跨栏
    psdx_clear_all_objects(&g);
    psdx_spawn_object(&g, PSDX_OBJ_HURDLE, 1, PSDX_PLAYER_BASE_Y - 5.0f);
    psdx_trigger_jump(&g);
    // 让其起跳到高空
    psdx_game_step(&g, 150);
    assert(g.player.jump_z > PSDX_HURDLE_CLEAR_Z);

    uint32_t old_cleared = g.obstacles_cleared;
    psdx_game_step(&g, 10); // 发生碰撞相交检查
    assert(g.obstacles_cleared == old_cleared + 1);

    printf("  ✓ Jump arc, air time, max height (%.1fpx) & clearance OK\n", max_z);
}

// ============================================================================
// 测试 4：小短腿涡轮狂蹬 (Turbo Paw Dash) 无敌冲撞
// ============================================================================
static void test_turbo_paw_dash(void)
{
    printf("[TEST 4] Testing Turbo Paw Dash Activation, Speed Boost & Invincibility Smash...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x4444);

    // 方式 A：长按 OK 键 (> 250ms) 自动触发 Turbo
    psdx_input_ok_down(&g);
    assert(!g.player.is_turbo);
    psdx_game_step(&g, 150);
    assert(!g.player.is_turbo);
    psdx_game_step(&g, 120); // 累计 270ms >= 250ms
    assert(g.player.is_turbo);
    assert(g.player.turbo_timer_ms > 0 && g.player.turbo_timer_ms <= PSDX_TURBO_DURATION_MS);
    assert(fabsf(g.current_speed - PSDX_SPEED_TURBO) < EPSILON); // 双倍极速 320 px/s
    psdx_input_ok_up(&g);

    // 涡轮狂蹬下无敌撞碎跨栏
    psdx_clear_all_objects(&g);
    psdx_object_t *hurdle = psdx_spawn_object(&g, PSDX_OBJ_HURDLE, 1, PSDX_PLAYER_BASE_Y);
    assert(hurdle != NULL);
    assert(!hurdle->smashed);

    uint32_t score_before = g.score;
    uint32_t cleared_before = g.obstacles_cleared;
    psdx_game_step(&g, 20); // 碰撞检测
    assert(hurdle->smashed); // 跨栏被无敌撞碎
    assert(g.score == score_before + 2); // 碎物额外加分
    assert(g.obstacles_cleared == cleared_before + 1);

    // 涡轮狂蹬下无敌冲碎泥洼
    psdx_clear_all_objects(&g);
    psdx_object_t *mud = psdx_spawn_object(&g, PSDX_OBJ_MUD, 1, PSDX_PLAYER_BASE_Y);
    psdx_game_step(&g, 20);
    assert(mud->smashed); // 泥水被踩飞冲碎，不减速

    // 涡轮狂蹬下撞飞香蕉皮 (不触发 360° 旋转)
    psdx_clear_all_objects(&g);
    psdx_object_t *banana = psdx_spawn_object(&g, PSDX_OBJ_BANANA, 1, PSDX_PLAYER_BASE_Y);
    psdx_game_step(&g, 20);
    assert(banana->smashed);
    assert(!g.player.is_spinning); // 涡轮状态不被香蕉皮打断！

    // 涡轮倒计时衰减与自动恢复常速
    psdx_game_step(&g, PSDX_TURBO_DURATION_MS);
    assert(!g.player.is_turbo);
    assert(fabsf(g.current_speed - PSDX_SPEED_NORMAL) < EPSILON);

    // 方式 B：双击快速连按 OK 键激活 Turbo
    psdx_input_ok_down(&g);
    psdx_game_step(&g, 30);
    psdx_input_ok_up(&g);
    psdx_game_step(&g, 50); // 间隔 80ms (< 280ms)
    psdx_input_ok_down(&g); // 第二次按下
    assert(g.player.is_turbo);
    psdx_input_ok_up(&g);

    printf("  ✓ Turbo Paw Dash hold/double-tap, 2x speed & smash OK\n");
}

// ============================================================================
// 测试 5：0 挫败搞笑机关：踩香蕉皮华丽 360° 滑稽原地旋转舞步
// ============================================================================
static void test_banana_peel_spin_mechanism(void)
{
    printf("[TEST 5] Testing 0-Frustration Banana Peel 360° Comic Spin...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x5555);

    // 常态奔跑下踩中香蕉皮
    psdx_clear_all_objects(&g);
    psdx_object_t *banana = psdx_spawn_object(&g, PSDX_OBJ_BANANA, 1, PSDX_PLAYER_BASE_Y);
    assert(banana != NULL);

    psdx_game_step(&g, 20);
    assert(banana->collected);
    assert(g.player.is_spinning);
    assert(g.bananas_slipped == 1);
    assert(g.player.spin_timer_ms > 0);
    assert(fabsf(g.current_speed - PSDX_SPEED_SPIN) < EPSILON);

    // 验证生成了头顶环绕旋转金星粒子
    int star_count = 0;
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        if (g.particles[i].active && g.particles[i].type == PSDX_PART_DIZZY_STAR) {
            star_count++;
        }
    }
    assert(star_count == 5);

    // 旋转进度演进验证 (0° -> 360°)
    psdx_game_step(&g, PSDX_BANANA_SPIN_MS / 2); // 走过半程
    assert(g.player.is_spinning);
    assert(g.player.spin_angle_deg >= 160.0f && g.player.spin_angle_deg <= 200.0f);

    // 走完剩余时间，旋转结束，恢复正常奔跑
    psdx_game_step(&g, PSDX_BANANA_SPIN_MS / 2 + 50);
    assert(!g.player.is_spinning);
    assert(fabsf(g.player.spin_angle_deg) < EPSILON);
    assert(fabsf(g.current_speed - PSDX_SPEED_NORMAL) < EPSILON);
    assert(g.state == PSDX_STATE_RUNNING); // 0 挫败：永不 Game Over，快乐继续！

    printf("  ✓ 0-Frustration Banana 360° comic spin & dizzy stars OK\n");
}

// ============================================================================
// 测试 6：道具收集 (骨头 +1、金币 +5) 与音效反馈
// ============================================================================
static void test_collectibles_and_audio(void)
{
    printf("[TEST 6] Testing Collectibles (Bones +1, Coins +5) & Audio Triggers...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x6666);

    // 1. 拾取香脆肉骨头
    psdx_clear_all_objects(&g);
    psdx_spawn_object(&g, PSDX_OBJ_BONE, 1, PSDX_PLAYER_BASE_Y);
    psdx_game_step(&g, 20);

    assert(g.score == 1);
    assert(g.bones_collected == 1);
    assert(g.player.tongue_state == PSDX_TONGUE_HAPPY); // 萌宠开心开怀吐舌

    // 检查音效队列中是否包含骨头咔嚓声
    bool found_bone_sound = false;
    while (psdx_sound_has_events(&g)) {
        if (psdx_sound_pop(&g) == PSDX_SND_BONE_CRUNCH) {
            found_bone_sound = true;
            break;
        }
    }
    assert(found_bone_sound);

    // 2. 拾取闪闪金币
    psdx_spawn_object(&g, PSDX_OBJ_COIN, 1, PSDX_PLAYER_BASE_Y);
    psdx_game_step(&g, 20);

    assert(g.score == 6); // 1 + 5 = 6
    assert(g.coins_collected == 1);

    bool found_coin_sound = false;
    while (psdx_sound_has_events(&g)) {
        if (psdx_sound_pop(&g) == PSDX_SND_COIN) {
            found_coin_sound = true;
            break;
        }
    }
    assert(found_coin_sound);

    printf("  ✓ Bones (+1pt), Coins (+5pts) & Audio Events OK\n");
}

// ============================================================================
// 测试 7：终点飞扑巨型蓬松羽毛大抱枕 (Cushion Dive) 胜利结算
// ============================================================================
static void test_finish_line_and_cushion_dive(void)
{
    printf("[TEST 7] Testing Finish Line & Cushion Dive Victory Settlement...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x7777);

    // 设置较短赛道里程以便快速到达终点
    psdx_game_set_track_length(&g, 500.0f);
    assert(fabsf(g.track_length - 500.0f) < EPSILON);

    // 推进赛道里程直至终点大抱枕生成
    while (!g.cushion_spawned && g.distance_traveled < 600.0f) {
        psdx_game_step(&g, 50);
    }
    assert(g.cushion_spawned);

    // 检查是否有 CUSHION 物件在赛道上
    bool cushion_found = false;
    for (int i = 0; i < PSDX_MAX_TRACK_OBJECTS; i++) {
        if (g.objects[i].active && g.objects[i].type == PSDX_OBJ_CUSHION) {
            cushion_found = true;
            // 将大抱枕直接移动至角色碰撞判定区
            g.objects[i].y = PSDX_PLAYER_BASE_Y;
            break;
        }
    }
    assert(cushion_found);

    // 触发飞扑相撞
    psdx_game_step(&g, 20);

    assert(g.state == PSDX_STATE_VICTORY);
    assert(psdx_game_is_victory(&g));
    assert(g.player.is_cushion_diving);
    assert(g.player.cushion_dive_scale > 1.0f);
    assert(g.score >= 100); // 包含通关大奖 100 分

    // 验证漫天飞舞蓬松白色羽毛粒子生成
    int feather_count = 0;
    for (int i = 0; i < PSDX_MAX_PARTICLES; i++) {
        if (g.particles[i].active && g.particles[i].type == PSDX_PART_FEATHER) {
            feather_count++;
        }
    }
    assert(feather_count >= 16);

    // 验证沉闷 POOF 声与欢呼喝彩音效
    bool found_poof = false;
    bool found_cheer = false;
    while (psdx_sound_has_events(&g)) {
        psdx_sound_t s = psdx_sound_pop(&g);
        if (s == PSDX_SND_CUSHION_POOF) found_poof = true;
        if (s == PSDX_SND_CHEER) found_cheer = true;
    }
    assert(found_poof);
    assert(found_cheer);

    printf("  ✓ Finish Line Cushion Dive, feathers (count=%d) & POOF sound OK\n", feather_count);
}

// ============================================================================
// 测试 8：4 种角色切换、正面 45° 眨眼与微表情演化
// ============================================================================
static void test_characters_and_micro_expressions(void)
{
    printf("[TEST 8] Testing 4 Character Types & Positive 45° Micro-Expressions...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x8888);

    // 4 种角色支持验证
    psdx_game_set_character(&g, PSDX_CHAR_CORGI);
    assert(g.player.char_type == PSDX_CHAR_CORGI);

    psdx_game_set_character(&g, PSDX_CHAR_SHIBA);
    assert(g.player.char_type == PSDX_CHAR_SHIBA);

    psdx_game_set_character(&g, PSDX_CHAR_SEAL);
    assert(g.player.char_type == PSDX_CHAR_SEAL);

    psdx_game_set_character(&g, PSDX_CHAR_PENGUIN);
    assert(g.player.char_type == PSDX_CHAR_PENGUIN);

    // 眨眼状态机演变测试
    g.player.blink_timer_ms = 80;
    psdx_game_step(&g, 10);
    assert(g.player.blink_state == PSDX_BLINK_CLOSED);

    g.player.blink_timer_ms = 30;
    psdx_game_step(&g, 10);
    assert(g.player.blink_state == PSDX_BLINK_HALF);

    // 肉垫踏步与耳朵摆动测试
    float prev_bounce = g.player.ear_bounce_y;
    psdx_game_step(&g, 60);
    // 奔跑中步伐相位和耳朵高度持续变化
    assert(fabsf(g.player.ear_bounce_y - prev_bounce) > 0.0001f);
    assert(g.player.paw_step_count >= 0);

    printf("  ✓ 4 Characters, Blinking & Ear/Paw micro-expressions OK\n");
}

// ============================================================================
// 测试 9：对象池与粒子池溢出保护与安全生命周期回收
// ============================================================================
static void test_pool_recycling_and_safety(void)
{
    printf("[TEST 9] Testing Object & Particle Pool Boundary & Safety Recycling...\n");
    psdx_game_t g;
    psdx_game_init(&g, 0x9999);

    // 物件超出屏幕底部 (y > 360) 自动回收
    psdx_clear_all_objects(&g);
    psdx_object_t *obj = psdx_spawn_object(&g, PSDX_OBJ_BONE, 0, 300.0f);
    assert(obj != NULL && obj->active);

    psdx_game_step(&g, 500); // 移动 80px -> 380px > 360px
    assert(!obj->active);    // 成功回收

    // 粒子填满并覆盖最老粒子，绝不发生内存越界
    for (int i = 0; i < PSDX_MAX_PARTICLES * 2; i++) {
        psdx_spawn_particle(&g, PSDX_PART_TURBO_SPARK, 100, 100, 0, 0, 3.0f, 200);
    }
    assert(psdx_get_active_particle_count(&g) == PSDX_MAX_PARTICLES);

    // 音效队列填满与溢出保护测试
    for (int i = 0; i < PSDX_MAX_SOUND_QUEUE * 3; i++) {
        psdx_sound_push(&g, PSDX_SND_STEP);
    }
    assert(g.sound_queue.count == PSDX_MAX_SOUND_QUEUE);

    // 成功弹出全部音效
    int popped = 0;
    while (psdx_sound_has_events(&g)) {
        assert(psdx_sound_pop(&g) == PSDX_SND_STEP);
        popped++;
    }
    assert(popped == PSDX_MAX_SOUND_QUEUE);
    assert(psdx_sound_pop(&g) == PSDX_SND_NONE);

    printf("  ✓ Object & Particle zero-malloc pool recycling & queue safety OK\n");
}

// ============================================================================
// 主入口
// ============================================================================
int main(void)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    printf("====================================================================\n");
    printf("《短腿爪爪运动会·进化版》(Paws Sprint DX) 核心算法引擎全套宿主单元测试\n");
    printf("====================================================================\n");

    test_initialization_and_lifecycle();
    test_lane_switching_and_clamping();
    test_jump_physics_and_clearing();
    test_turbo_paw_dash();
    test_banana_peel_spin_mechanism();
    test_collectibles_and_audio();
    test_finish_line_and_cushion_dive();
    test_characters_and_micro_expressions();
    test_pool_recycling_and_safety();

    printf("====================================================================\n");
    printf("🎉 所有 9 组 50+ 个单测断言全部 100%% 成功通过！\n");
    printf("====================================================================\n");
    return 0;
}
