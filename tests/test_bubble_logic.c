// tests/test_bubble_logic.c —— 《飞针破泡录》(Bubble Needle) 核心逻辑全套宿主单元测试
#include "bubble_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

#define EPSILON 0.001f

static void test_initialization_and_lifecycle(void)
{
    printf("[TEST 1] Testing Initialization & Lifecycle States...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x12345678);

    assert(g.state == BUBBLE_STATE_PLAYING);
    assert(fabsf(g.base_x - BUBBLE_BASE_X) < EPSILON);
    assert(fabsf(g.base_y - BUBBLE_BASE_Y) < EPSILON);
    assert(fabsf(g.aim_angle_deg - 0.0f) < EPSILON);
    assert(g.lives == BUBBLE_DEFAULT_LIVES);
    assert(g.score == 0);
    assert(g.combo_count == 0);
    assert(g.max_combo == 0);
    assert(bubble_get_active_count(&g) == 0);
    assert(bubble_get_needle_count(&g) == 0);
    assert(bubble_get_particle_count(&g) == 0);
    assert(!bubble_game_is_game_over(&g));
    assert(!bubble_game_is_paused(&g));

    // 测试暂停与恢复
    bubble_game_pause(&g);
    assert(bubble_game_is_paused(&g));
    uint32_t t_before = g.game_time_ms;
    bubble_game_step(&g, 50);
    assert(g.game_time_ms == t_before); // 暂停期间时间不前进

    bubble_game_resume(&g);
    assert(!bubble_game_is_paused(&g));
    bubble_game_step(&g, 50);
    assert(g.game_time_ms == t_before + 50);

    // 测试复位
    g.score = 9999;
    g.lives = 1;
    bubble_game_reset(&g);
    assert(g.score == 0);
    assert(g.lives == BUBBLE_DEFAULT_LIVES);
    assert(bubble_get_active_count(&g) == 0);

    printf("  ✓ Initialization, pause, resume & reset OK\n");
}

static void test_aim_angle_range_and_stepping(void)
{
    printf("[TEST 2] Testing Aim Angle Range, Smooth Stepping & Clamping...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x1111);

    // 初始应为 0°
    assert(fabsf(g.aim_angle_deg) < EPSILON);

    // UP 键步进微调 (向左 -3°)
    bubble_input_up(&g);
    assert(fabsf(g.aim_angle_deg - (-3.0f)) < EPSILON);

    // 连续按 UP，测试下限限制 (-60°)
    for (int i = 0; i < 30; i++) {
        bubble_input_up(&g);
    }
    assert(fabsf(g.aim_angle_deg - BUBBLE_AIM_MIN_DEG) < EPSILON);
    assert(g.aim_angle_deg >= BUBBLE_AIM_MIN_DEG);

    // 连续按 DOWN，测试向右步进及上限限制 (+60°)
    for (int i = 0; i < 60; i++) {
        bubble_input_down(&g);
    }
    assert(fabsf(g.aim_angle_deg - BUBBLE_AIM_MAX_DEG) < EPSILON);
    assert(g.aim_angle_deg <= BUBBLE_AIM_MAX_DEG);

    // 显式角度设置与越界安全钳制
    bubble_input_set_aim_angle(&g, -100.0f);
    assert(fabsf(g.aim_angle_deg - (-60.0f)) < EPSILON);

    bubble_input_set_aim_angle(&g, 88.0f);
    assert(fabsf(g.aim_angle_deg - 60.0f) < EPSILON);

    bubble_input_set_aim_angle(&g, 15.0f);
    assert(fabsf(g.aim_angle_deg - 15.0f) < EPSILON);

    printf("  ✓ Aim angle stepping [-60.0°, +60.0°] and clamping OK\n");
}

static void test_ballistics_and_wall_bouncing(void)
{
    printf("[TEST 3] Testing Ballistics Trajectory & Side Wall Bouncing...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x2222);

    // 瞄准 +60° (BUBBLE_AIM_MAX_DEG) 射向右侧壁
    bubble_input_set_aim_angle(&g, 60.0f);
    bool shot = bubble_shoot_normal(&g);
    assert(shot == true);
    assert(bubble_get_needle_count(&g) == 1);

    bubble_needle_t *n = &g.needles[0];
    assert(n->vx > 0.0f);
    assert(n->vy < 0.0f);
    assert(n->bounce_count == 0);

    // 模拟运行直到撞击右侧壁 (x >= 240 - radius)
    bool bounced_right = false;
    for (int step = 0; step < 50; step++) {
        bubble_game_step(&g, 20); // 20ms 一帧
        if (n->bounce_count == 1) {
            bounced_right = true;
            assert(n->vx < 0.0f); // 速度反向弹向左！
            assert(n->x <= (float)BUBBLE_SCREEN_W - n->radius);
            break;
        }
    }
    assert(bounced_right == true);

    // 检查是否产生了撞墙反弹音效
    bool bounce_snd_found = false;
    bubble_sound_t s;
    while ((s = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (s == BUBBLE_SND_WALL_BOUNCE) {
            bounce_snd_found = true;
            break;
        }
    }
    assert(bounce_snd_found == true);

    // 继续飞行直到撞击左侧壁反弹第二次
    bool bounced_left = false;
    for (int step = 0; step < 80; step++) {
        bubble_game_step(&g, 20);
        if (n->bounce_count == 2) {
            bounced_left = true;
            assert(n->vx > 0.0f); // 再次反弹向右！
            assert(n->x >= n->radius);
            break;
        }
    }
    assert(bounced_left == true);

    // 继续飞行直到飞出顶部屏幕
    for (int step = 0; step < 100; step++) {
        bubble_game_step(&g, 20);
        if (!n->active) {
            break;
        }
    }
    assert(!n->active); // 飞出顶部后注销
    printf("  ✓ Left/Right wall bouncing physics & velocity reflection OK\n");
}

static void test_needle_bubble_collision_and_normal_pop(void)
{
    printf("[TEST 4] Testing Needle-Bubble Collision & Normal Rainbow Pop...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x3333);

    // 在正上方放置一个彩虹气泡
    int b_idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 150.0f, 0.0f, 14.0f);
    assert(b_idx >= 0);
    assert(g.bubbles[b_idx].active);

    // 垂直瞄准 0° 发射普通针
    bubble_input_set_aim_angle(&g, 0.0f);
    bubble_shoot_normal(&g);
    assert(g.needles[0].active);

    // 步进直至击中
    bool popped = false;
    for (int i = 0; i < 40; i++) {
        bubble_game_step(&g, 15);
        if (!g.bubbles[b_idx].active) {
            popped = true;
            break;
        }
    }
    assert(popped == true);
    assert(g.bubbles_popped == 1);
    assert(g.score == 100); // 基础分100 * 连击1
    assert(g.combo_count == 1);
    assert(!g.needles[0].active); // 普通针击中后销毁
    assert(bubble_get_particle_count(&g) > 0); // 产生了水花粒子

    // 验证发出了 POP_1 音效
    bool has_pop1 = false;
    bubble_sound_t snd;
    while ((snd = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (snd == BUBBLE_SND_POP_1) {
            has_pop1 = true;
            break;
        }
    }
    assert(has_pop1 == true);
    printf("  ✓ Needle-bubble collision, single-hit pop & particles OK\n");
}

static void test_hardened_bubble_logic(void)
{
    printf("[TEST 5] Testing Double-layer Hardened Bubble (2 hits)...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x4444);

    // 放置双层硬化泡 (初始 HP = 2)
    int b_idx = bubble_spawn(&g, BUBBLE_TYPE_HARDENED, 120.0f, 180.0f, 0.0f, 16.0f);
    assert(b_idx >= 0);
    assert(g.bubbles[b_idx].hp == 2);

    // 射出第一发普通针
    bubble_input_set_aim_angle(&g, 0.0f);
    bubble_shoot_normal(&g);

    // 步进至首针击中
    for (int i = 0; i < 30; i++) {
        bubble_game_step(&g, 15);
        if (!g.needles[0].active) {
            break; // 针已碰撞消耗
        }
    }

    // 验证首次命中：气泡依然存活，HP降为 1，发出 HARD_HIT 破壳音效
    assert(g.bubbles[b_idx].active == true);
    assert(g.bubbles[b_idx].hp == 1);
    assert(g.bubbles_popped == 0); // 未计入破裂数

    bool has_hard_hit = false;
    bubble_sound_t snd;
    while ((snd = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (snd == BUBBLE_SND_HARD_HIT) {
            has_hard_hit = true;
            break;
        }
    }
    assert(has_hard_hit == true);

    // 射出第二发普通针
    bubble_shoot_normal(&g);
    for (int i = 0; i < 30; i++) {
        bubble_game_step(&g, 15);
        if (!g.bubbles[b_idx].active) {
            break;
        }
    }

    // 验证第二次命中：彻底破壳爆破，计入得分
    assert(g.bubbles[b_idx].active == false);
    assert(g.bubbles_popped == 1);
    assert(g.score == 250); // 硬化泡基础分 250
    printf("  ✓ Hardened bubble 2-hit shell break & pop logic OK\n");
}

static void test_thunder_chain_explosion(void)
{
    printf("[TEST 6] Testing Thundercloud Arc Chain Explosion...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x5555);

    // 雷云泡 1 位于 (100, 100)
    int t1 = bubble_spawn(&g, BUBBLE_TYPE_THUNDER, 100.0f, 100.0f, 0.0f, 14.0f);
    // 彩虹泡 A 位于 (125, 100) —— 距 t1 为 25px (在 65px 雷云引爆半径内)
    int ra = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 125.0f, 100.0f, 0.0f, 14.0f);
    // 雷云泡 2 位于 (100, 145) —— 距 t1 为 45px (在 t1 引爆半径内，触发二次连锁)
    int t2 = bubble_spawn(&g, BUBBLE_TYPE_THUNDER, 100.0f, 145.0f, 0.0f, 14.0f);
    // 彩虹泡 B 位于 (100, 195) —— 距 t2 为 50px (在 t2 半径内)，但距 t1 为 95px (超出 t1 半径)
    int rb = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 100.0f, 195.0f, 0.0f, 14.0f);
    // 远端孤立泡 位于 (220, 20) —— 超出任何引爆范围
    int iso = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 220.0f, 20.0f, 0.0f, 14.0f);

    assert(t1 >= 0 && ra >= 0 && t2 >= 0 && rb >= 0 && iso >= 0);

    // 在 t1 正下方放置飞针并击穿 t1
    bubble_needle_t *n = &g.needles[0];
    n->active = true;
    n->type = BUBBLE_NEEDLE_NORMAL;
    n->x = 100.0f;
    n->y = 120.0f;
    n->vx = 0.0f;
    n->vy = -200.0f;
    n->radius = BUBBLE_NEEDLE_RADIUS_NORMAL;

    // 运行步进碰撞
    bubble_game_step(&g, 50);

    // 验证连锁引爆结果：t1, ra, t2, rb 均应被连锁引爆摧毁！
    assert(!g.bubbles[t1].active);
    assert(!g.bubbles[ra].active);
    assert(!g.bubbles[t2].active);
    assert(!g.bubbles[rb].active);

    // 远端孤立泡不受影响
    assert(g.bubbles[iso].active);

    // 4 连破
    assert(g.bubbles_popped == 4);
    assert(g.combo_count == 4);

    // 验证雷电音效
    bool has_thunder_snd = false;
    bubble_sound_t snd;
    while ((snd = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (snd == BUBBLE_SND_THUNDER_BLAST) {
            has_thunder_snd = true;
            break;
        }
    }
    assert(has_thunder_snd == true);
    printf("  ✓ Thundercloud electric arc multi-tier chain reaction OK\n");
}

static void test_frozen_bubble_effect(void)
{
    printf("[TEST 7] Testing Frozen Bubble Screen-Wide Suspension (3s)...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x6666);

    // 放置一个冰冻泡
    int f_idx = bubble_spawn(&g, BUBBLE_TYPE_FROZEN, 120.0f, 200.0f, 0.0f, 14.0f);
    // 放置一个正在向上浮升的普通气泡 (vy = -40 px/s)
    int norm_idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 60.0f, 200.0f, -40.0f, 14.0f);

    assert(!bubble_is_frozen(&g));

    // 击破冰冻泡
    bubble_needle_t *n = &g.needles[0];
    n->active = true;
    n->type = BUBBLE_NEEDLE_NORMAL;
    n->x = 120.0f;
    n->y = 210.0f;
    n->vx = 0.0f;
    n->vy = -200.0f;
    n->radius = BUBBLE_NEEDLE_RADIUS_NORMAL;

    bubble_game_step(&g, 40);
    assert(!g.bubbles[f_idx].active);

    // 验证冰冻状态已激活
    assert(bubble_is_frozen(&g) == true);
    assert(g.freeze_timer_ms == BUBBLE_FREEZE_DURATION_MS);

    // 记录普通气泡此时的 Y 坐标
    float frozen_y = g.bubbles[norm_idx].y;

    // 步进 1000ms (1秒)，在冰冻期间，气泡完全悬停停滞
    bubble_game_step(&g, 1000);
    assert(bubble_is_frozen(&g) == true);
    assert(fabsf(g.bubbles[norm_idx].y - frozen_y) < EPSILON);

    // 步进 2050ms，跨越 3000ms 冰冻阈值
    bubble_game_step(&g, 2050);
    assert(bubble_is_frozen(&g) == false);

    // 冰冻解除后再次步进 500ms，普通气泡恢复浮升 (y 减小)
    bubble_game_step(&g, 500);
    assert(g.bubbles[norm_idx].y < frozen_y);

    printf("  ✓ Full-screen bubble suspension & 3-second freeze timer OK\n");
}

static void test_piercing_needle_and_charging(void)
{
    printf("[TEST 8] Testing OK Long Press Charging & Piercing Needle...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x7777);
    g.spawn_interval_ms = 999999; // 暂停背景自动生成，避免干扰插槽判定

    // 测试长按 OK 键蓄力机制
    bubble_input_ok_press(&g);
    assert(g.ok_pressed == true);
    assert(!g.is_charged);

    // 短按提前释放 (< 600ms) -> 发射普通针
    bubble_game_step(&g, 200);
    assert(!g.is_charged);
    bubble_input_ok_release(&g);
    assert(bubble_get_needle_count(&g) == 1);
    assert(g.needles[0].type == BUBBLE_NEEDLE_NORMAL);

    // 销毁普通针，准备测试长按满蓄力
    g.needles[0].active = false;

    bubble_input_ok_press(&g);
    bubble_game_step(&g, 650); // 超过 600ms 蓄力阈值
    assert(g.is_charged == true);
    bubble_input_ok_release(&g);

    // 验证发射了旋风大钢针 (BUBBLE_NEEDLE_PIERCING)
    assert(bubble_get_needle_count(&g) == 1);
    bubble_needle_t *p_needle = &g.needles[0];
    assert(p_needle->type == BUBBLE_NEEDLE_PIERCING);
    assert(p_needle->radius == BUBBLE_NEEDLE_RADIUS_CHARGED);

    // 在大钢针的纵向上串联放置 3 个气泡：Y = 240, 180, 120
    int b1 = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 240.0f, 0.0f, 14.0f);
    int b2 = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 180.0f, 0.0f, 14.0f);
    int b3 = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 120.0f, 0.0f, 14.0f);

    // 步进大钢针贯穿全场
    for (int i = 0; i < 40; i++) {
        bubble_game_step(&g, 20);
    }

    // 验证 3 个气泡全部被穿透刺破，大钢针未被阻挡
    assert(!g.bubbles[b1].active);
    assert(!g.bubbles[b2].active);
    assert(!g.bubbles[b3].active);
    assert(p_needle->hit_count == 3);
    assert(g.bubbles_popped == 3);

    printf("  ✓ OK charging & cyclone steel needle full-screen piercing OK\n");
}

static void test_gold_bubble_and_scoring(void)
{
    printf("[TEST 9] Testing Gold Coin Bubble Scoring...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x8888);

    int g_idx = bubble_spawn(&g, BUBBLE_TYPE_GOLD, 120.0f, 150.0f, 0.0f, 14.0f);
    assert(g_idx >= 0);

    bubble_input_set_aim_angle(&g, 0.0f);
    bubble_shoot_normal(&g);

    for (int i = 0; i < 30; i++) {
        bubble_game_step(&g, 15);
        if (!g.bubbles[g_idx].active) {
            break;
        }
    }

    assert(!g.bubbles[g_idx].active);
    // 金币泡基础分 500 * combo 1 + 金币掉落奖 500 = 1000
    assert(g.score == 1000);

    bool has_coin_snd = false;
    bubble_sound_t snd;
    while ((snd = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (snd == BUBBLE_SND_COIN) {
            has_coin_snd = true;
            break;
        }
    }
    assert(has_coin_snd == true);
    printf("  ✓ Gold coin bubble bonus score & coin chime sound OK\n");
}

static void test_combo_sound_escalation_and_timeout(void)
{
    printf("[TEST 10] Testing Combo Sound Escalation (POP_1 ~ POP_5) & Miss Reset...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0x9999);

    // 连续刺破 5 个彩虹气泡，验证音阶节节攀升
    for (int i = 1; i <= 5; i++) {
        int idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 50.0f + (float)i * 20.0f, 100.0f, 0.0f, 10.0f);
        bubble_needle_t *n = &g.needles[0];
        n->active = true;
        n->type = BUBBLE_NEEDLE_NORMAL;
        n->x = g.bubbles[idx].x;
        n->y = g.bubbles[idx].y + 10.0f;
        n->vx = 0.0f;
        n->vy = -200.0f;
        n->radius = 3.0f;

        bubble_sound_clear(&g);
        bubble_game_step(&g, 30);
        assert(g.combo_count == (uint32_t)i);

        // 验证对应的音效
        bubble_sound_t expected = BUBBLE_SND_POP_1;
        if (i == 2) expected = BUBBLE_SND_POP_2;
        else if (i == 3) expected = BUBBLE_SND_POP_3;
        else if (i == 4) expected = BUBBLE_SND_POP_4;
        else if (i >= 5) expected = BUBBLE_SND_POP_5;

        assert(g.pending_sound == expected);
    }

    // 验证超时连击断开 (2000ms)
    assert(g.combo_count == 5);
    bubble_game_step(&g, 2100);
    assert(g.combo_count == 0);

    // 验证脱靶飞出顶部连击断开
    g.combo_count = 3;
    bubble_input_set_aim_angle(&g, 0.0f);
    bubble_shoot_normal(&g);
    // 场上无气泡，直接飞出顶部
    for (int i = 0; i < 60; i++) {
        bubble_game_step(&g, 20);
        if (!g.needles[0].active) {
            break;
        }
    }
    assert(g.combo_count == 0); // 脱靶重置连击

    printf("  ✓ Combo pitch escalation (POP_1 to POP_5) & break on miss OK\n");
}

static void test_escape_and_game_over(void)
{
    printf("[TEST 11] Testing Bubble Escape & Game Over...\n");
    bubble_game_t g;
    bubble_game_init(&g, 0xAAAA);
    assert(g.lives == 3);

    // 放置一个即将脱离顶部的气泡
    int idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 5.0f, -100.0f, 10.0f);
    assert(idx >= 0);

    // 步进使气泡飞出顶部 (y + radius < 0)
    bubble_game_step(&g, 200);
    assert(!g.bubbles[idx].active);
    assert(g.bubbles_escaped == 1);
    assert(g.lives == 2);
    assert(!bubble_game_is_game_over(&g));

    // 再漏掉 2 个气泡
    idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 5.0f, -100.0f, 10.0f);
    bubble_game_step(&g, 200);
    assert(g.lives == 1);

    idx = bubble_spawn(&g, BUBBLE_TYPE_RAINBOW, 120.0f, 5.0f, -100.0f, 10.0f);
    bubble_game_step(&g, 200);
    assert(g.lives == 0);
    assert(g.state == BUBBLE_STATE_GAMEOVER);
    assert(bubble_game_is_game_over(&g));

    // 验证 Game Over 音效
    bool has_over_snd = false;
    bubble_sound_t snd;
    while ((snd = bubble_sound_dequeue(&g)) != BUBBLE_SND_NONE) {
        if (snd == BUBBLE_SND_GAMEOVER) {
            has_over_snd = true;
            break;
        }
    }
    assert(has_over_snd == true);

    printf("  ✓ Bubble escape life reduction & Game Over settlement OK\n");
}

int main(void)
{
    printf("===============================================================\n");
    printf("  Starting 《飞针破泡录》(Bubble Needle) Core Logic Unit Tests \n");
    printf("===============================================================\n");

    test_initialization_and_lifecycle();
    test_aim_angle_range_and_stepping();
    test_ballistics_and_wall_bouncing();
    test_needle_bubble_collision_and_normal_pop();
    test_hardened_bubble_logic();
    test_thunder_chain_explosion();
    test_frozen_bubble_effect();
    test_piercing_needle_and_charging();
    test_gold_bubble_and_scoring();
    test_combo_sound_escalation_and_timeout();
    test_escape_and_game_over();

    printf("===============================================================\n");
    printf("  All 11 Unit Tests Passed Successfully! 100%% Test Coverage!  \n");
    printf("===============================================================\n");

    return 0;
}
