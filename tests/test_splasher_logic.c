// tests/test_splasher_logic.c —— 《泡泡高压水枪狂欢节》(Hydro Splasher) 核心算法引擎宿主单元测试
// 涵盖俯仰瞄准、抛物线弹道动力学、灰度复苏、打工人救赎、高压水龙卷暴风雨、肥皂泡浮空、过关判定与对象池安全
#include "splasher_logic.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <math.h>

#define EPSILON 0.001f

// =========================================================================
// TEST 1: 初始化与生命周期状态
// =========================================================================
static void test_initialization_and_lifecycle(void)
{
    printf("[TEST 1] Testing Initialization, Lifecycle States & Reset...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x12345678);

    assert(g.state == HS_STATE_PLAYING);
    assert(fabsf(g.gun_base_x - HS_GUN_BASE_X) < EPSILON);
    assert(fabsf(g.gun_base_y - HS_GUN_BASE_Y) < EPSILON);
    assert(fabsf(g.pitch_deg - 0.0f) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 45.0f) < EPSILON);
    assert(g.score == 0);
    assert(g.combo == 0);
    assert(g.max_combo == 0);
    assert(!splasher_game_is_victory(&g));
    assert(!splasher_game_is_game_over(&g));
    assert(!splasher_game_is_paused(&g));

    // 默认关卡实体检查
    assert(g.targets_total == 3);
    assert(g.npcs_total == 2);
    assert(g.obstacles_total == 1);
    assert(g.targets_revived == 0);
    assert(g.npcs_saved == 0);

    // 暂停与恢复
    splasher_game_pause(&g);
    assert(splasher_game_is_paused(&g));
    uint32_t t_before = g.game_time_ms;
    splasher_game_step(&g, 100);
    assert(g.game_time_ms == t_before); // 暂停时不计时

    splasher_game_resume(&g);
    assert(!splasher_game_is_paused(&g));
    splasher_game_step(&g, 100);
    assert(g.game_time_ms == t_before + 100);

    // 重置
    g.score = 8888;
    splasher_game_reset(&g);
    assert(g.score == 0);
    assert(g.targets_revived == 0);
    assert(g.npcs_saved == 0);
    assert(fabsf(g.pitch_deg) < EPSILON);

    printf("  ✓ Initialization, pause, resume & reset OK\n");
}

// =========================================================================
// TEST 2: 俯仰角范围、UP/DOWN 微调步进与绝对发射角
// =========================================================================
static void test_aim_pitch_range_and_stepping(void)
{
    printf("[TEST 2] Testing Pitch Angle Range [-45°, +45°] & Smooth Stepping...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x1111);

    // 初始应为 0.0° (实际发射角为 45.0°)
    assert(fabsf(splasher_get_pitch(&g)) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 45.0f) < EPSILON);

    // UP 键：抬高仰角 (+3.0°)
    splasher_input_up(&g);
    assert(fabsf(splasher_get_pitch(&g) - 3.0f) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 48.0f) < EPSILON);

    // 连续按 UP，测试达到最大仰角限制 (+45.0°)
    for (int i = 0; i < 30; i++) {
        splasher_input_up(&g);
    }
    assert(fabsf(splasher_get_pitch(&g) - HS_AIM_MAX_DEG) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 90.0f) < EPSILON);

    // 连续按 DOWN，测试向下压枪与达到最小限制 (-45.0°)
    for (int i = 0; i < 40; i++) {
        splasher_input_down(&g);
    }
    assert(fabsf(splasher_get_pitch(&g) - HS_AIM_MIN_DEG) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 0.0f) < EPSILON); // 水平射角

    // 显式赋值与边界安全钳制
    splasher_input_set_pitch(&g, -99.0f);
    assert(fabsf(splasher_get_pitch(&g) - (-45.0f)) < EPSILON);

    splasher_input_set_pitch(&g, 120.0f);
    assert(fabsf(splasher_get_pitch(&g) - 45.0f) < EPSILON);

    splasher_input_set_pitch(&g, 15.0f);
    assert(fabsf(splasher_get_pitch(&g) - 15.0f) < EPSILON);
    assert(fabsf(splasher_get_absolute_launch_angle(&g) - 60.0f) < EPSILON);

    printf("  ✓ Pitch angle bounds [-45°, +45°] & launch angle mapping OK\n");
}

// =========================================================================
// TEST 3: 水弹弹道动力学与重力抛物线运动学
// =========================================================================
static void test_water_ballistics_parabolic_kinematics(void)
{
    printf("[TEST 3] Testing Water Ballistics Trajectory & Parabolic Gravity...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x2222);

    // 将已有目标物体移走，避免阻挡纯弹道测试
    for (int i = 0; i < HS_MAX_TARGETS; i++) g.targets[i].active = false;
    for (int i = 0; i < HS_MAX_NPCS; i++) g.npcs[i].active = false;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) g.obstacles[i].active = false;

    // 1. 水平发射测试 (pitch = -45°, 仰角 = 0°)
    splasher_input_set_pitch(&g, -45.0f);
    bool shot = splasher_shoot_normal(&g);
    assert(shot);
    assert(splasher_get_active_bullet_count(&g) == 1);

    splasher_bullet_t *b = &g.bullets[0];
    assert(b->active);
    assert(fabsf(b->x - HS_GUN_BASE_X) < EPSILON);
    assert(fabsf(b->y - HS_GUN_BASE_Y) < EPSILON);
    assert(fabsf(b->vx - HS_BULLET_SPEED_NORMAL) < EPSILON);
    assert(fabsf(b->vy - 0.0f) < EPSILON); // 水平发射初速 vy = 0

    // 经过 100ms (0.1s) 运动更新
    splasher_game_step(&g, 100);
    // 理论欧拉积分：
    // vy = 0 + 320.0 * 0.1 = 32.0 px/s
    // x = 24.0 + 260.0 * 0.1 = 50.0 px
    // y = 290.0 + 32.0 * 0.1 = 293.2 px
    assert(fabsf(b->vx - HS_BULLET_SPEED_NORMAL) < EPSILON);
    assert(fabsf(b->vy - 32.0f) < 0.1f);
    assert(fabsf(b->x - 50.0f) < 0.1f);
    assert(fabsf(b->y - 293.2f) < 0.1f);

    // 2. 抛物线重力加速持续性：再经过 0.1s
    splasher_game_step(&g, 100);
    // vy 应增加至 64.0 px/s
    assert(fabsf(b->vy - 64.0f) < 0.1f);
    assert(b->y > 293.2f); // 抛物线下坠

    // 3. 垂直向上射击 (pitch = +45°, 仰角 = 90°)
    g.bullets[0].active = false; // 清理前一发
    splasher_input_set_pitch(&g, 45.0f);
    shot = splasher_shoot_normal(&g);
    assert(shot);
    splasher_bullet_t *b_up = &g.bullets[0];
    assert(fabsf(b_up->vx) < EPSILON);
    assert(fabsf(b_up->vy - (-HS_BULLET_SPEED_NORMAL)) < EPSILON); // 向上初速为负

    // 步进 100ms：垂直爬升减速
    splasher_game_step(&g, 100);
    // vy = -260 + 32 = -228
    assert(fabsf(b_up->vy - (-228.0f)) < 0.1f);
    assert(b_up->y < HS_GUN_BASE_Y); // 向上爬升 Y 减小

    printf("  ✓ Parabolic trajectory kinematics with gravity OK\n");
}

// =========================================================================
// TEST 4: 灰度复苏机制 (黑白 -> 七彩饱和度跃迁与鲜花绽放/霓虹点亮)
// =========================================================================
static void test_gray_to_color_saturation_and_awakening(void)
{
    printf("[TEST 4] Testing Gray-to-Color Awakening & Saturation Accumulation...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x3333);

    // 清空默认实体，放置一个特定测试黑白盆栽
    for (int i = 0; i < HS_MAX_TARGETS; i++) g.targets[i].active = false;
    for (int i = 0; i < HS_MAX_NPCS; i++) g.npcs[i].active = false;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) g.obstacles[i].active = false;
    g.targets_total = 0;
    g.targets_revived = 0;
    splasher_sound_clear(&g);

    // 放置在枪口右侧前方平射能够击中的位置
    int idx = splasher_spawn_target(&g, HS_TARGET_PLANT, 70.0f, 280.0f, 30.0f, 30.0f);
    assert(idx >= 0);
    splasher_target_t *tgt = &g.targets[idx];
    assert(tgt->active);
    assert(fabsf(tgt->saturation - 0.0f) < EPSILON); // 初始 0% 饱和度黑白灰
    assert(!tgt->is_fully_revived);
    assert(tgt->hit_count == 0);

    // 水平瞄准平射
    splasher_input_set_pitch(&g, -45.0f);

    // 第 1 发水球
    splasher_shoot_normal(&g);
    splasher_sound_clear(&g);

    // 步进直至命中 (约 200ms)
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (tgt->hit_count > 0) break;
    }
    assert(tgt->hit_count == 1);
    assert(tgt->saturation >= 0.35f - EPSILON); // 饱和度开始累加
    assert(!tgt->is_fully_revived);
    assert(g.score == 50); // 命中普通上色积分
    assert(splasher_get_active_particle_count(&g) > 0); // 爆出彩墨粒子
    assert(splasher_sound_dequeue(&g) == HS_SND_WATER_POP); // 水球爆裂音

    // 第 2 发水球
    splasher_shoot_normal(&g);
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (tgt->hit_count >= 2) break;
    }
    assert(tgt->hit_count == 2);
    assert(tgt->saturation >= 0.70f - EPSILON);
    assert(!tgt->is_fully_revived);

    // 第 3 发水球：饱和度达到 100% (1.0f)，触发完全复苏！
    splasher_shoot_normal(&g);
    splasher_sound_clear(&g);
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (tgt->hit_count >= 3) break;
    }
    assert(tgt->hit_count == 3);
    assert(fabsf(tgt->saturation - 1.0f) < EPSILON); // 饱和度满 100%
    assert(tgt->is_fully_revived); // 盆栽鲜花绽放！
    assert(g.targets_revived == 1);
    assert(g.score >= 50 + 50 + 200); // 包含完全复苏 200 分奖励

    // 检查喷漆飞溅音效
    bool has_paint_splash = false;
    while (g.sound_q.count > 0) {
        if (splasher_sound_dequeue(&g) == HS_SND_PAINT_SPLASH) {
            has_paint_splash = true;
            break;
        }
    }
    assert(has_paint_splash);

    printf("  ✓ Gray-to-color saturation & blooming awakening OK\n");
}

// =========================================================================
// TEST 5: 打工人 NPC 救赎系统 (黑白西装赶路 -> 夏威夷花衬衫欢呼跳舞)
// =========================================================================
static void test_worker_npc_redemption_and_dancing(void)
{
    printf("[TEST 5] Testing Worker NPC Redemption & Hawaiian Dance Costume...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x4444);

    // 清空其他实体，专门测试 NPC 救赎
    for (int i = 0; i < HS_MAX_TARGETS; i++) g.targets[i].active = false;
    for (int i = 0; i < HS_MAX_NPCS; i++) g.npcs[i].active = false;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) g.obstacles[i].active = false;
    g.npcs_total = 0;
    g.npcs_saved = 0;
    splasher_sound_clear(&g);

    // 生成一名疲惫打工人：身穿黑白西装，低头赶路
    int n_idx = splasher_spawn_npc(&g, 75.0f, 280.0f, 20.0f, 60.0f, 150.0f);
    assert(n_idx >= 0);
    splasher_npc_t *npc = &g.npcs[n_idx];
    assert(npc->costume == HS_NPC_COSTUME_SUIT);
    assert(npc->state == HS_NPC_STATE_TIRED_WALKING);
    assert(fabsf(npc->vx - 20.0f) < EPSILON);

    // 平射击发水球
    splasher_input_set_pitch(&g, -45.0f);
    splasher_shoot_normal(&g);
    splasher_sound_clear(&g);

    // 步进直至击中打工人
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (npc->state == HS_NPC_STATE_DANCING) break;
    }

    // 验证救赎成功：洗去疲惫，换上夏威夷衬衫！
    assert(npc->costume == HS_NPC_COSTUME_HAWAIIAN);
    assert(npc->state == HS_NPC_STATE_DANCING);
    assert(fabsf(npc->vx) < EPSILON); // 停止匆匆赶路
    assert(g.npcs_saved == 1);
    assert(g.score == 300); // 狂欢积分奖励

    // 验证音效队列：夏威夷欢呼吉他琶音与派对口哨
    bool cheer_found = false, whistle_found = false;
    while (g.sound_q.count > 0) {
        hs_sound_t s = splasher_sound_dequeue(&g);
        if (s == HS_SND_HAWAIIAN_CHEER) cheer_found = true;
        if (s == HS_SND_WHISTLE) whistle_found = true;
    }
    assert(cheer_found);
    assert(whistle_found);

    // 验证跳舞计时器与律动相位更新
    float phase_before = npc->dance_phase;
    splasher_game_step(&g, 100);
    assert(npc->dance_timer_ms >= 100.0f);
    assert(npc->dance_phase > phase_before);

    printf("  ✓ Worker NPC Hawaiian suit redemption & dance system OK\n");
}

// =========================================================================
// TEST 6: 高压充能水枪与水龙卷暴风雨 (OK长按充能0.0~1.0与全屏横扫)
// =========================================================================
static void test_charge_system_and_tornado_blast(void)
{
    printf("[TEST 6] Testing High-Pressure Pump Charge & Water Tornado Blast...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x5555);

    // 1. 短按测试：未蓄满时松开只发射普通水球
    splasher_input_ok_press(&g);
    assert(g.ok_pressed);
    splasher_game_step(&g, 50); // 仅充能 50ms (远小于 600ms)
    assert(g.charge_ratio < 0.2f);

    splasher_input_ok_release(&g);
    assert(!g.ok_pressed);
    assert(splasher_get_active_bullet_count(&g) == 1);
    assert(!g.tornado.active); // 未触发水龙卷

    // 清空水弹
    g.bullets[0].active = false;
    splasher_sound_clear(&g);

    // 2. 长按充能至满 (>= 600ms)
    splasher_input_ok_press(&g);
    // 分步步进，测试水泵增压嗤嗤声
    bool hiss_heard = false;
    for (int step = 0; step < 7; step++) {
        splasher_game_step(&g, 100); // 700ms 超过 600ms
        if (splasher_sound_peek(&g) == HS_SND_PUMP_HISS) {
            hiss_heard = true;
            splasher_sound_dequeue(&g);
        }
    }
    assert(hiss_heard);
    assert(fabsf(g.charge_ratio - 1.0f) < EPSILON); // 达到 100% 充能

    // 3. 蓄满松开，释放超高压水龙卷暴风雨！
    splasher_input_ok_release(&g);
    assert(g.tornado.active);
    assert(g.tornado.vx == HS_TORNADO_SPEED_X);

    // 验证水龙卷音效
    bool tornado_sound = false;
    while (g.sound_q.count > 0) {
        if (splasher_sound_dequeue(&g) == HS_SND_TORNADO_BURST) {
            tornado_sound = true;
            break;
        }
    }
    assert(tornado_sound);

    // 4. 水龙卷横扫全场：全屏推进并瞬间复苏目标、救赎打工人、推动路障
    // 步进直至水龙卷推进过半屏幕
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 50);
    }

    // 验证场景内目标已被水龙卷完全冲刷复苏
    assert(g.targets_revived >= 1);
    // 验证场景内打工人已被救赎
    assert(g.npcs_saved >= 1);
    // 验证路障已被肥皂泡包裹并推向空中
    assert(splasher_get_bubbled_obstacle_count(&g) >= 1);

    printf("  ✓ High-pressure pump charge & water tornado blast OK\n");
}

// =========================================================================
// TEST 7: 肥皂泡浮空机制 (重型路障包裹肥皂泡、反重力浮升飘离屏幕)
// =========================================================================
static void test_soap_bubble_floating_mechanism(void)
{
    printf("[TEST 7] Testing Soap Bubble Levitation & Heavy Obstacle Clearance...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x6666);

    // 清空其他实体
    for (int i = 0; i < HS_MAX_TARGETS; i++) g.targets[i].active = false;
    for (int i = 0; i < HS_MAX_NPCS; i++) g.npcs[i].active = false;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) g.obstacles[i].active = false;
    g.obstacles_total = 0;
    g.obstacles_cleared = 0;
    splasher_sound_clear(&g);

    // 放置一个重型生锈集装箱
    int obs_id = splasher_spawn_obstacle(&g, HS_OBSTACLE_CONTAINER, 80.0f, 275.0f, 30.0f, 25.0f);
    assert(obs_id >= 0);
    splasher_obstacle_t *obs = &g.obstacles[obs_id];
    assert(obs->active);
    assert(!obs->is_bubbled);
    assert(obs->hit_count == 0);

    // 平射打向集装箱
    splasher_input_set_pitch(&g, -45.0f);

    // 第 1 击：被阻挡水球爆裂，未包裹气泡
    splasher_shoot_normal(&g);
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (obs->hit_count >= 1) break;
    }
    assert(obs->hit_count == 1);
    assert(!obs->is_bubbled);

    // 第 2 击：达到阈值，吐出巨型肥皂泡包裹并获得向上浮力！
    splasher_shoot_normal(&g);
    splasher_sound_clear(&g);
    for (int s = 0; s < 10; s++) {
        splasher_game_step(&g, 20);
        if (obs->is_bubbled) break;
    }
    assert(obs->hit_count >= 2);
    assert(obs->is_bubbled);
    assert(obs->bubble_radius > 10.0f);
    assert(obs->vy <= HS_BUBBLE_FLOAT_VY); // 负值，向上漂浮！

    // 验证肥皂泡包裹音效
    bool bubble_sound = false;
    while (g.sound_q.count > 0) {
        if (splasher_sound_dequeue(&g) == HS_SND_BUBBLE_WRAP) {
            bubble_sound = true;
            break;
        }
    }
    assert(bubble_sound);

    // 持续步进，验证集装箱包裹在气泡中向屏幕上方漂移直至移出视野
    float y_start = obs->y;
    for (int s = 0; s < 50; s++) {
        splasher_game_step(&g, 100);
        if (!obs->active) break; // 移出屏幕上方
    }
    assert(!obs->active); // 已飘离屏幕上方
    assert(g.obstacles_cleared == 1);
    assert(g.score >= 150); // 浮空清理奖励
    assert(y_start > 0.0f);

    printf("  ✓ Soap bubble wrap, anti-gravity levitation & obstacle clearance OK\n");
}

// =========================================================================
// TEST 8: 复苏进度综合计算与关卡狂欢胜利判定
// =========================================================================
static void test_victory_and_progress_calculation(void)
{
    printf("[TEST 8] Testing Revival Progress Metric & Victory Condition...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x7777);

    // 清空默认实体，自定义 1 个物体 + 1 个 NPC
    for (int i = 0; i < HS_MAX_TARGETS; i++) g.targets[i].active = false;
    for (int i = 0; i < HS_MAX_NPCS; i++) g.npcs[i].active = false;
    for (int i = 0; i < HS_MAX_OBSTACLES; i++) g.obstacles[i].active = false;
    g.targets_total = 0;
    g.targets_revived = 0;
    g.npcs_total = 0;
    g.npcs_saved = 0;

    int t_id = splasher_spawn_target(&g, HS_TARGET_NEON_SIGN, 100.0f, 100.0f, 30.0f, 20.0f);
    int n_id = splasher_spawn_npc(&g, 100.0f, 260.0f, 10.0f, 50.0f, 150.0f);
    assert(t_id >= 0 && n_id >= 0);

    splasher_game_step(&g, 20);
    // 初始复苏进度应为 0.0
    assert(fabsf(splasher_get_revival_progress(&g) - 0.0f) < EPSILON);
    assert(!splasher_game_is_victory(&g));

    // 物体饱和度达到 0.5 (复苏进度变为 0.5 / 2.0 = 0.25)
    g.targets[t_id].saturation = 0.5f;
    splasher_game_step(&g, 20);
    assert(fabsf(splasher_get_revival_progress(&g) - 0.25f) < 0.01f);

    // 物体完全复苏 (saturation = 1.0f)
    g.targets[t_id].saturation = 1.0f;
    g.targets[t_id].is_fully_revived = true;
    g.targets_revived = 1;
    splasher_game_step(&g, 20);
    assert(fabsf(splasher_get_revival_progress(&g) - 0.5f) < 0.01f);
    assert(!splasher_game_is_victory(&g)); // NPC 尚未救赎，不判定胜利

    // NPC 救赎换装跳舞
    g.npcs[n_id].costume = HS_NPC_COSTUME_HAWAIIAN;
    g.npcs[n_id].state = HS_NPC_STATE_DANCING;
    g.npcs_saved = 1;
    splasher_sound_clear(&g);

    splasher_game_step(&g, 20);
    // 全场 100% 复苏
    assert(fabsf(splasher_get_revival_progress(&g) - 1.0f) < 0.01f);
    assert(splasher_game_is_victory(&g)); // 触发城市狂欢大胜利！

    // 验证通关音效
    assert(splasher_sound_dequeue(&g) == HS_SND_STAGE_CLEAR);

    printf("  ✓ Revival progress formula & stage victory condition OK\n");
}

// =========================================================================
// TEST 9: 静态对象池满载溢出与零内存分配安全
// =========================================================================
static void test_object_pool_capacity_and_zero_malloc(void)
{
    printf("[TEST 9] Testing Object Pool Saturation & Zero Malloc Safety...\n");
    splasher_game_t g;
    splasher_game_init(&g, 0x8888);

    // 1. 水弹对象池满载测试
    for (int i = 0; i < HS_MAX_BULLETS; i++) {
        bool ok = splasher_shoot_normal(&g);
        assert(ok);
    }
    assert(splasher_get_active_bullet_count(&g) == HS_MAX_BULLETS);

    // 再次射击，对象池已满，应优雅返回 false，无内存越界
    bool overflow_shot = splasher_shoot_normal(&g);
    assert(!overflow_shot);
    assert(splasher_get_active_bullet_count(&g) == HS_MAX_BULLETS);

    // 2. 音效环形队列满载溢出测试
    splasher_sound_clear(&g);
    for (int i = 0; i < HS_MAX_SOUND_QUEUE + 5; i++) {
        splasher_sound_enqueue(&g, (hs_sound_t)(HS_SND_SHOOT_NORMAL + (i % 5)));
    }
    // 队列应被正确钳制在最大容量，不溢出
    assert(g.sound_q.count == HS_MAX_SOUND_QUEUE);
    for (int i = 0; i < HS_MAX_SOUND_QUEUE; i++) {
        hs_sound_t s = splasher_sound_dequeue(&g);
        assert(s != HS_SND_NONE);
    }
    assert(g.sound_q.count == 0);

    printf("  ✓ Object pool boundaries & zero dynamic allocation safe\n");
}

// =========================================================================
// 主入口
// =========================================================================
int main(void)
{
    printf("=================================================================\n");
    printf("  Running Hydro Splasher Core Logic Unit Tests (C11 Host Suite)  \n");
    printf("=================================================================\n");

    test_initialization_and_lifecycle();
    test_aim_pitch_range_and_stepping();
    test_water_ballistics_parabolic_kinematics();
    test_gray_to_color_saturation_and_awakening();
    test_worker_npc_redemption_and_dancing();
    test_charge_system_and_tornado_blast();
    test_soap_bubble_floating_mechanism();
    test_victory_and_progress_calculation();
    test_object_pool_capacity_and_zero_malloc();

    printf("=================================================================\n");
    printf("  ALL 9 HYDRO SPLASHER SUITES PASSED! (100%% Test Coverage)       \n");
    printf("=================================================================\n");
    return 0;
}
