// tests/test_laser_cat_logic.c —— 《猫猫激光笔指挥官》(Laser Pointer Commander) 宿主单元测试
// 纯 C11 编写，严格验证状态机、光学反射、猫群动力学、推箱物理与通电过关判定。

#include "laser_cat_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

#define EPSILON 0.001f

// =========================================================================
// 测试 1：初始化、生命周期与重置测试
// =========================================================================
static void test_initialization_and_lifecycle(void) {
    printf("[TEST 1] Testing Initialization, Lifecycle & Reset...\n");
    lc_game_t g;
    lc_game_init(&g, 0xACE12345);

    assert(g.state == LC_STATE_PLAYING);
    assert(fabsf(g.emitter_x - LC_EMITTER_DEFAULT_X) < EPSILON);
    assert(fabsf(g.emitter_y - LC_EMITTER_DEFAULT_Y) < EPSILON);
    assert(fabsf(g.aim_angle_deg - 0.0f) < EPSILON);
    assert(g.laser_mode == LC_LASER_OFF);
    assert(!g.spot.active);
    assert(lc_get_active_cats_count(&g) == 0);
    assert(lc_get_active_crates_count(&g) == 0);
    assert(lc_get_active_particles_count(&g) == 0);
    assert(!lc_game_is_victory(&g));
    assert(!lc_game_is_game_over(&g));
    assert(!lc_game_is_paused(&g));

    // 测试暂停与恢复
    lc_game_pause(&g);
    assert(lc_game_is_paused(&g));
    uint32_t t_before = g.game_time_ms;
    lc_game_step(&g, 50);
    assert(g.game_time_ms == t_before); // 暂停时不推进时间

    lc_game_resume(&g);
    assert(!lc_game_is_paused(&g));
    lc_game_step(&g, 50);
    assert(g.game_time_ms == t_before + 50);

    // 测试重置
    g.total_batteries = 5;
    g.powered_batteries = 2;
    lc_game_reset(&g);
    assert(g.total_batteries == 0);
    assert(g.powered_batteries == 0);
    assert(g.state == LC_STATE_PLAYING);
    assert(lc_get_active_cats_count(&g) == 0);

    printf("  ✓ Lifecycle, pause, resume & reset OK\n");
}

// =========================================================================
// 测试 2：激光发射角度步进、覆盖范围与边界夹紧测试
// =========================================================================
static void test_aim_angle_and_stepping(void) {
    printf("[TEST 2] Testing Aim Angle Stepping (2.5°), 180° Fan Range & Clamping...\n");
    lc_game_t g;
    lc_game_init(&g, 0x1111);

    // 初始朝向为 0° (竖直向上)
    assert(fabsf(g.aim_angle_deg) < EPSILON);

    // UP 键：向左微调 2.5°
    lc_input_up(&g);
    assert(fabsf(g.aim_angle_deg - (-2.5f)) < EPSILON);

    // 连续按 UP 键 50 次，验证到达并锁定在极左边界 -90.0°
    for (int i = 0; i < 50; i++) {
        lc_input_up(&g);
    }
    assert(fabsf(g.aim_angle_deg - LC_AIM_ANGLE_MIN_DEG) < EPSILON);
    assert(g.aim_angle_deg >= LC_AIM_ANGLE_MIN_DEG);

    // 连续按 DOWN 键 100 次，验证穿过 0° 并锁定在极右边界 +90.0°
    for (int i = 0; i < 100; i++) {
        lc_input_down(&g);
    }
    assert(fabsf(g.aim_angle_deg - LC_AIM_ANGLE_MAX_DEG) < EPSILON);
    assert(g.aim_angle_deg <= LC_AIM_ANGLE_MAX_DEG);

    // 显式角度设置测试
    lc_input_set_aim_angle(&g, -120.0f);
    assert(fabsf(g.aim_angle_deg - (-90.0f)) < EPSILON);

    lc_input_set_aim_angle(&g, 135.0f);
    assert(fabsf(g.aim_angle_deg - 90.0f) < EPSILON);

    lc_input_set_aim_angle(&g, 35.0f);
    assert(fabsf(g.aim_angle_deg - 35.0f) < EPSILON);

    printf("  ✓ Aim angle range [-90.0°, +90.0°] with 2.5° stepping OK\n");
}

// =========================================================================
// 测试 3：光学物理与镜面反射计算测试
// =========================================================================
static void test_optical_reflection_math(void) {
    printf("[TEST 3] Testing Optical Physics, Law of Reflection & Ray Tracing...\n");

    // 1. 纯向量反射数学测试
    // 入射方向向下 (0, 1)，水平镜面法线向上 (0, -1)，反射后应向上 (0, -1)
    lc_vec2_t in_dir = { 0.0f, 1.0f };
    lc_vec2_t normal = { 0.0f, -1.0f };
    lc_vec2_t out_dir;
    bool ok = lc_reflect_vector(in_dir, normal, &out_dir);
    assert(ok);
    assert(fabsf(out_dir.x - 0.0f) < EPSILON);
    assert(fabsf(out_dir.y - (-1.0f)) < EPSILON);

    // 45° 入射角反射测试：入射向右上 (1, -1)，法线向左 (-1, 0)
    in_dir = (lc_vec2_t){ 1.0f, -1.0f };
    normal = (lc_vec2_t){ -1.0f, 0.0f };
    ok = lc_reflect_vector(in_dir, normal, &out_dir);
    assert(ok);
    // 反射后应向左上 (-1, -1) 归一化
    float inv_sqrt2 = 1.0f / sqrtf(2.0f);
    assert(fabsf(out_dir.x - (-inv_sqrt2)) < EPSILON);
    assert(fabsf(out_dir.y - (-inv_sqrt2)) < EPSILON);

    // 2. 场景内镜面多段反射射线追踪
    lc_game_t g;
    lc_game_init(&g, 0x2222);

    // 发射源设在 (120, 300)
    g.emitter_x = 120.0f;
    g.emitter_y = 300.0f;
    lc_input_set_aim_angle(&g, 0.0f); // 竖直向上发射 (dy = -1)

    // 在正前方 (120, 150) 处放置倾斜 45° 的反光板 (法线向右下: 0.7071, 0.7071)
    // 线段横截: (90, 120) -> (150, 180)
    lc_mirror_add(&g, 90.0f, 120.0f, 150.0f, 180.0f, 0.7071f, 0.7071f);

    // 开启强功率连续激光
    lc_laser_set_continuous(&g, true);
    assert(g.laser_mode == LC_LASER_CONTINUOUS);
    assert(g.spot.active);

    // 应该产生至少 2 段光线折线：
    // 第一段：从 (120, 300) 向上射到镜面
    // 第二段：被 45° 镜面反射向右，最终射到右侧壁 x = 240 形成光斑
    assert(g.ray_segment_count >= 2);
    assert(g.ray_segments[0].hit_mirror == true);
    assert(fabsf(g.spot.pos.x - (float)LC_SCREEN_W) < 1.0f);

    printf("  ✓ Vector reflection and scene mirror raycast OK\n");
}

// =========================================================================
// 测试 4：OK 键按键状态机 (短按脉冲引诱 vs 长按强功率连续)
// =========================================================================
static void test_ok_button_pulse_and_continuous(void) {
    printf("[TEST 4] Testing OK Button Press Dynamics (Pulse vs Continuous)...\n");
    lc_game_t g;
    lc_game_init(&g, 0x3333);

    // 1. 短按测试 (< 250ms)
    lc_input_ok_press(&g);
    assert(g.ok_pressed);
    lc_game_step(&g, 100); // 维持 100ms
    lc_input_ok_release(&g);

    // 应触发短按脉冲引诱
    assert(g.laser_mode == LC_LASER_PULSE);
    assert(g.spot.active);
    assert(fabsf(g.spot.intensity - 0.5f) < EPSILON);
    assert(g.laser_timer_ms == LC_PULSE_DURATION_MS);

    // 经过持续时间后脉冲自动关闭
    lc_game_step(&g, LC_PULSE_DURATION_MS + 50);
    assert(g.laser_mode == LC_LASER_OFF);
    assert(!g.spot.active);

    // 2. 长按测试 (>= 250ms)
    lc_input_ok_press(&g);
    lc_game_step(&g, 260); // 持续 260ms
    assert(g.laser_mode == LC_LASER_CONTINUOUS);
    assert(g.spot.active);
    assert(fabsf(g.spot.intensity - 1.0f) < EPSILON);

    // 释放长按键
    lc_input_ok_release(&g);
    assert(g.laser_mode == LC_LASER_OFF);
    assert(!g.spot.active);

    printf("  ✓ OK button short pulse & long press continuous switching OK\n");
}

// =========================================================================
// 测试 5：猫群 AI 动力学与不同性格状态流转 (橘猫/奶牛/黑猫)
// =========================================================================
static void test_cat_ai_dynamics_and_personalities(void) {
    printf("[TEST 5] Testing Cat Pack AI Dynamics, Personalities & State Flow...\n");
    lc_game_t g;
    lc_game_init(&g, 0x4444);

    // 加入 3 只不同性格大头猫咪
    int c_orange = lc_cat_add(&g, LC_CAT_ORANGE, 100.0f, 200.0f);
    int c_cow    = lc_cat_add(&g, LC_CAT_COW,    120.0f, 200.0f);
    int c_black  = lc_cat_add(&g, LC_CAT_BLACK,  140.0f, 200.0f);

    assert(c_orange >= 0 && c_cow >= 0 && c_black >= 0);
    assert(lc_get_active_cats_count(&g) == 3);

    // 初始均应为 IDLE
    assert(g.cats[c_orange].state == LC_CAT_STATE_IDLE);
    assert(g.cats[c_cow].state == LC_CAT_STATE_IDLE);
    assert(g.cats[c_black].state == LC_CAT_STATE_IDLE);

    // 开启连续激光，光斑出现在 (120, 100)
    g.emitter_x = 120.0f;
    g.emitter_y = 300.0f;
    lc_input_set_aim_angle(&g, 0.0f);
    lc_laser_set_continuous(&g, true);

    // 猫群感知到红点，全部进入 ALERT
    lc_game_step(&g, 20);
    assert(g.cats[c_orange].state == LC_CAT_STATE_ALERT);
    assert(g.cats[c_cow].state == LC_CAT_STATE_ALERT);
    assert(g.cats[c_black].state == LC_CAT_STATE_ALERT);

    // 奶牛猫反应最快 (60ms)，黑猫中等 (100ms)，橘猫最慢 (180ms)
    lc_game_step(&g, 50); // 累计 70ms：奶牛猫应进入 WIGGLE 摇屁股
    assert(g.cats[c_cow].state == LC_CAT_STATE_WIGGLE);
    assert(g.cats[c_orange].state == LC_CAT_STATE_ALERT);

    lc_game_step(&g, 50); // 累计 120ms：黑猫进入 WIGGLE
    assert(g.cats[c_black].state == LC_CAT_STATE_WIGGLE);

    lc_game_step(&g, 80); // 累计 200ms：橘猫也进入 WIGGLE
    assert(g.cats[c_orange].state == LC_CAT_STATE_WIGGLE);

    // 摇屁股蓄势完成后爆发飞扑 POUNCE (奶牛猫摇摆时长仅 120ms，率先扑出)
    lc_game_step(&g, 100);
    assert(g.cats[c_cow].state == LC_CAT_STATE_POUNCE);
    assert(g.pounces_count >= 1);

    printf("  ✓ Cat personalities, response latency & state transitions OK\n");
}

// =========================================================================
// 测试 6：飞扑推箱位移碰撞物理与推力加成
// =========================================================================
static void test_pounce_crate_collision_and_push(void) {
    printf("[TEST 6] Testing Pounce Crate Collision Impulse & Push Dynamics...\n");
    lc_game_t g;
    lc_game_init(&g, 0x5555);

    // 在 (120, 200) 放置一只橘猫胖墩 (推力最强)
    int cat_id = lc_cat_add(&g, LC_CAT_ORANGE, 120.0f, 200.0f);
    // 在正前方 (120, 160) 放置一个木箱
    int crate_id = lc_crate_add(&g, false, 120.0f, 160.0f, 20.0f, 20.0f, 1.5f);

    assert(cat_id >= 0 && crate_id >= 0);
    assert(g.crates[crate_id].vx == 0.0f && g.crates[crate_id].vy == 0.0f);

    // 强行赋予猫咪向正上方飞扑速度
    g.cats[cat_id].state = LC_CAT_STATE_POUNCE;
    g.cats[cat_id].vx = 0.0f;
    g.cats[cat_id].vy = -200.0f;

    // 单步推进 100ms
    lc_game_step(&g, 100);

    // 验证：猫咪碰撞到了箱子，箱子获得了向上的冲击速度 (vy < 0)
    assert(g.crates[crate_id].vy < -10.0f);
    assert(g.boxes_pushed_count > 0);
    assert(g.cats[cat_id].has_pounced_hit == true);

    // 继续迭代让箱子受地面阻尼减速
    float initial_vy = g.crates[crate_id].vy;
    lc_game_step(&g, 200);
    assert(fabsf(g.crates[crate_id].vy) < fabsf(initial_vy)); // 阻尼衰减

    printf("  ✓ Pounce crate collision momentum transfer & friction damping OK\n");
}

// =========================================================================
// 测试 7：墙壁高处开关触发与联动反光镜旋转
// =========================================================================
static void test_wall_switch_and_mirror_toggle(void) {
    printf("[TEST 7] Testing Wall Switch Trigger & Linked Mirror Angle Toggle...\n");
    lc_game_t g;
    lc_game_init(&g, 0x6666);

    // 添加反光镜，初始法线为 (1, 0)
    int m_id = lc_mirror_add(&g, 50.0f, 50.0f, 100.0f, 50.0f, 1.0f, 0.0f);
    assert(m_id >= 0);
    assert(fabsf(g.mirrors[m_id].normal.x - 1.0f) < EPSILON);

    // 添加与反光镜联动的机关开关在 (120, 100)
    int sw_id = lc_switch_add(&g, 120.0f, 100.0f, 20.0f, 20.0f, LC_SWITCH_TOGGLE_MIRROR, m_id);
    assert(sw_id >= 0);
    assert(!g.switches[sw_id].is_on);

    // 添加黑猫在 (120, 130)，以飞扑撞击开关
    int cat_id = lc_cat_add(&g, LC_CAT_BLACK, 120.0f, 130.0f);
    g.cats[cat_id].state = LC_CAT_STATE_POUNCE;
    g.cats[cat_id].vx = 0.0f;
    g.cats[cat_id].vy = -150.0f;

    // 运行步进触碰开关
    lc_game_step(&g, 100);

    // 验证开关被拍下开启，并且反光镜法向量被旋转联动
    assert(g.switches[sw_id].is_on == true);
    // 法向量旋转 90 度：原 (1, 0) 变为 (0, 1) 或 (-0, 1)
    assert(fabsf(g.mirrors[m_id].normal.y) > 0.8f);

    printf("  ✓ Wall switch collision & linked mirror toggle OK\n");
}

// =========================================================================
// 测试 8：扫地机器人巡逻与被猫飞扑踩停
// =========================================================================
static void test_roomba_patrol_and_stun(void) {
    printf("[TEST 8] Testing Roomba Sweeper Patrol, Reversal & Cat Stun...\n");
    lc_game_t g;
    lc_game_init(&g, 0x7777);

    // 添加扫地机，在 x=50~150 巡逻，当前位于 145，速度向右 30
    int r_id = lc_roomba_add(&g, 145.0f, 100.0f, 30.0f, 50.0f, 150.0f);
    assert(r_id >= 0);

    // 前进 300ms，应当触碰右边界并自动调头向左 (vx < 0)
    lc_game_step(&g, 300);
    assert(g.roombas[r_id].vx < 0.0f);

    // 添加猫咪在 (100, 140)，向扫地机发起飞扑
    int cat_id = lc_cat_add(&g, LC_CAT_COW, 100.0f, 140.0f);
    g.roombas[r_id].x = 100.0f;
    g.roombas[r_id].y = 100.0f;
    g.cats[cat_id].state = LC_CAT_STATE_POUNCE;
    g.cats[cat_id].vx = 0.0f;
    g.cats[cat_id].vy = -200.0f;

    lc_game_step(&g, 100);

    // 验证扫地机被踩停
    assert(g.roombas[r_id].is_stunned == true);
    assert(g.roombas[r_id].vx == 0.0f);
    assert(g.roombas[r_id].stun_timer_ms > 0);

    printf("  ✓ Roomba patrol turn-around & cat stun mechanics OK\n");
}

// =========================================================================
// 测试 9：电池箱入槽通电与胜利判定测试
// =========================================================================
static void test_crate_socket_power_and_victory(void) {
    printf("[TEST 9] Testing Battery Socket Slotting, Power Connection & Victory...\n");
    lc_game_t g;
    lc_game_init(&g, 0x8888);

    // 放入 2 个电池箱，2 个卡槽
    int c1 = lc_crate_add(&g, true, 80.0f, 100.0f, 20.0f, 20.0f, 2.0f);
    int c2 = lc_crate_add(&g, true, 160.0f, 100.0f, 20.0f, 20.0f, 2.0f);
    int s1 = lc_slot_add(&g, 80.0f, 50.0f, 24.0f, 24.0f);
    int s2 = lc_slot_add(&g, 160.0f, 50.0f, 24.0f, 24.0f);

    assert(c1 >= 0 && c2 >= 0 && s1 >= 0 && s2 >= 0);
    assert(g.total_batteries == 2);
    assert(g.powered_batteries == 0);
    assert(!lc_game_is_victory(&g));

    // 推送第 1 个电池箱进入第 1 个卡槽
    g.crates[c1].y = 52.0f; // 接近卡槽
    lc_game_step(&g, 50);

    assert(g.crates[c1].is_powered == true);
    assert(g.slots[s1].is_filled == true);
    assert(g.powered_batteries == 1);
    assert(!lc_game_is_victory(&g)); // 尚有 1 个电池未通电，暂不胜利

    // 推送第 2 个电池箱进入第 2 个卡槽
    g.crates[c2].y = 51.0f;
    lc_game_step(&g, 50);

    assert(g.crates[c2].is_powered == true);
    assert(g.slots[s2].is_filled == true);
    assert(g.powered_batteries == 2);
    // 全部通电，过关胜利！
    assert(lc_game_is_victory(&g));

    // 验证胜利音效出队
    bool heard_victory_meow = false;
    lc_sound_t snd;
    while ((snd = lc_sound_dequeue(&g)) != LC_SND_NONE) {
        if (snd == LC_SND_VICTORY_MEOW) {
            heard_victory_meow = true;
        }
    }
    assert(heard_victory_meow);

    printf("  ✓ Battery slotting, electric arc power connection & victory meow OK\n");
}

// =========================================================================
// 测试 10：内置关卡加载完整性与音效队列边界测试
// =========================================================================
static void test_levels_and_sound_queue(void) {
    printf("[TEST 10] Testing Preset Levels Loading & Sound Queue Wrap-around...\n");
    lc_game_t g;

    // 关卡 1 加载
    lc_load_level_1(&g);
    assert(lc_get_active_cats_count(&g) == 1);
    assert(lc_get_active_crates_count(&g) == 1);
    assert(g.total_batteries == 1);

    // 关卡 2 加载
    lc_load_level_2(&g);
    assert(lc_get_active_cats_count(&g) == 2);
    assert(g.mirrors[0].active == true);
    assert(g.switches[0].active == true);

    // 关卡 3 加载
    lc_load_level_3(&g);
    assert(lc_get_active_cats_count(&g) == 3);
    assert(g.total_batteries == 2);
    assert(g.roombas[0].active == true);

    // 音效队列溢出保护测试
    lc_sound_clear(&g);
    assert(lc_sound_dequeue(&g) == LC_SND_NONE);

    // 压入超过队列容量 (16) 的音效
    for (int i = 0; i < 25; i++) {
        lc_sound_enqueue(&g, LC_SND_BOX_SCRAPE);
    }
    assert(g.sound_q.count == LC_MAX_SOUND_QUEUE);
    for (int i = 0; i < LC_MAX_SOUND_QUEUE; i++) {
        assert(lc_sound_dequeue(&g) == LC_SND_BOX_SCRAPE);
    }
    assert(lc_sound_dequeue(&g) == LC_SND_NONE);

    printf("  ✓ Levels loading & sound queue ring buffer safety OK\n");
}

// =========================================================================
// 主测试入口
// =========================================================================
int main(void) {
    printf("=================================================================\n");
    printf("   Running 《猫猫激光笔指挥官》(Laser Pointer Commander) Tests   \n");
    printf("=================================================================\n");

    test_initialization_and_lifecycle();
    test_aim_angle_and_stepping();
    test_optical_reflection_math();
    test_ok_button_pulse_and_continuous();
    test_cat_ai_dynamics_and_personalities();
    test_pounce_crate_collision_and_push();
    test_wall_switch_and_mirror_toggle();
    test_roomba_patrol_and_stun();
    test_crate_socket_power_and_victory();
    test_levels_and_sound_queue();

    printf("=================================================================\n");
    printf("   ALL 10 TESTS PASSED (100%% SUCCESS, 0 WARNINGS, 0 ERRORS)    \n");
    printf("=================================================================\n");
    return 0;
}
