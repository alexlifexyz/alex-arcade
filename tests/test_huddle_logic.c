// tests/test_huddle_logic.c —— 《柴犬与海豹的午后温泉》(Fluffy Huddle / 萌物抱抱团) 核心单测
// 验证纯 C11 算法状态机、果冻碰撞、浮力动力学、合成进阶、长按抚摸与对象池复用。
#include "huddle_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>
#include <string.h>

#define EPSILON 0.001f

// =========================================================================
// TEST 1: 初始化与生命周期状态测试
// =========================================================================
static void test_initialization_and_lifecycle(void)
{
    printf("[TEST 1] Testing Initialization & Lifecycle States...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x12345678);

    assert(g.state == HUDDLE_STATE_PLAYING);
    assert(g.score == 0);
    assert(g.merge_count == 0);
    assert(g.drop_count == 0);
    assert(g.pet_count == 0);
    assert(g.combo_streak == 0);
    assert(!g.overflow_danger);
    assert(!g.zen_mode);
    assert(!huddle_game_is_game_over(&g));
    assert(!huddle_game_is_paused(&g));

    // 初始对象池为空
    assert(huddle_get_animal_count(&g) == 0);
    assert(huddle_get_particle_count(&g) == 0);

    // 滑轨就绪且位置在居中范围
    assert(g.dropper.ready);
    assert(g.dropper.x >= HUDDLE_RAIL_MIN_X && g.dropper.x <= HUDDLE_RAIL_MAX_X);

    // 测试暂停与恢复
    huddle_game_pause(&g);
    assert(huddle_game_is_paused(&g));
    uint32_t t_before = g.game_time_ms;
    huddle_game_step(&g, 40);
    assert(g.game_time_ms == t_before); // 暂停期间时间不推进

    huddle_game_resume(&g);
    assert(!huddle_game_is_paused(&g));
    huddle_game_step(&g, 40);
    assert(g.game_time_ms == t_before + 40);

    // 测试重置
    g.score = 500;
    g.merge_count = 8;
    huddle_game_reset(&g);
    assert(g.score == 0);
    assert(g.merge_count == 0);
    assert(huddle_get_animal_count(&g) == 0);

    printf("  ✓ Lifecycle, pause, resume & reset OK\n");
}

// =========================================================================
// TEST 2: 顶部滑轨移动限制与边界安全钳制测试
// =========================================================================
static void test_rail_movement_and_clamping(void)
{
    printf("[TEST 2] Testing Rail Movement Clamping & Boundary Safety...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x8888);

    float initial_x = g.dropper.x;

    // UP 键：向左移动
    huddle_input_up(&g);
    assert(g.dropper.x < initial_x);

    // 连续按 UP 键 50 次，验证左边界钳制
    for (int i = 0; i < 50; i++) {
        huddle_input_up(&g);
    }
    float cur_r = huddle_get_species_radius(g.dropper.cur_species, g.dropper.cur_tier);
    float min_limit = HUDDLE_POOL_LEFT + cur_r + 2.0f;
    if (min_limit < HUDDLE_RAIL_MIN_X) min_limit = HUDDLE_RAIL_MIN_X;
    assert(g.dropper.x >= min_limit - EPSILON);

    // 连续按 DOWN 键 80 次，验证向右移动与右边界钳制
    for (int i = 0; i < 80; i++) {
        huddle_input_down(&g);
    }
    float max_limit = HUDDLE_POOL_RIGHT - cur_r - 2.0f;
    if (max_limit > HUDDLE_RAIL_MAX_X) max_limit = HUDDLE_RAIL_MAX_X;
    assert(g.dropper.x <= max_limit + EPSILON);

    // 显式坐标设置与超界安全测试
    huddle_input_set_rail_x(&g, -200.0f);
    assert(g.dropper.x >= min_limit - EPSILON);

    huddle_input_set_rail_x(&g, 999.0f);
    assert(g.dropper.x <= max_limit + EPSILON);

    huddle_input_set_rail_x(&g, 120.0f);
    assert(fabsf(g.dropper.x - 120.0f) < EPSILON);

    printf("  ✓ Rail movement and boundary clamping OK\n");
}

// =========================================================================
// TEST 3: 落水运动学、水流浮力与阻尼测试
// =========================================================================
static void test_water_kinematics_and_buoyancy(void)
{
    printf("[TEST 3] Testing Water Kinematics, Buoyancy & Damping...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x2222);

    // 在滑轨正下方空气中生成一只小海豹 (y=50, 水面在 y=96)
    int slot = huddle_spawn_animal(&g, HUDDLE_SPECIES_SEAL, 1, 120.0f, 50.0f, 0.0f, 0.0f);
    assert(slot >= 0);
    huddle_animal_t *seal = &g.animals[slot];
    assert(!seal->in_water);

    // 步进若干帧，测试空气中重力自由下落加速
    float prev_vy = seal->vy;
    huddle_game_step(&g, 30);
    assert(seal->vy > prev_vy); // 加速下落
    assert(seal->y > 50.0f);

    // 清空当前音效队列
    huddle_sound_clear(&g);

    // 让动物下落穿越水面
    bool splash_sound_detected = false;
    for (int step = 0; step < 60; step++) {
        huddle_game_step(&g, 20);
        while (g.sound_q.count > 0) {
            huddle_sound_t s = huddle_sound_dequeue(&g);
            if (s == HUDDLE_SND_SPLASH) {
                splash_sound_detected = true;
            }
        }
        if (seal->in_water) break;
    }
    assert(seal->in_water);
    assert(splash_sound_detected); // 确认入水噗通声触发
    assert(huddle_get_particle_count(&g) > 0); // 确认激起水花粒子

    // 水中浮力与阻尼：继续模拟 1 秒，速度受阻尼衰减稳定，不发散
    for (int step = 0; step < 50; step++) {
        huddle_game_step(&g, 20);
    }
    assert(seal->y + seal->radius >= HUDDLE_WATER_SURFACE_Y);
    assert(seal->y + seal->radius <= HUDDLE_POOL_BOTTOM);
    assert(fabsf(seal->vy) < 80.0f); // 粘滞阻尼生效，速度平稳

    printf("  ✓ Air gravity, splash sound, water buoyancy & drag OK\n");
}

// =========================================================================
// TEST 4: 果冻弹性形变物理与非融合挤压碰撞测试
// =========================================================================
static void test_jelly_squish_and_elastic_collision(void)
{
    printf("[TEST 4] Testing Jelly Squish & Elastic Collision Dynamics...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x3333);

    // 在池中放置两只不同物种的小动物 (柴犬 vs 海豹，同为 Tier 1，不可融合)
    // 面对面高速相向运动
    int s1 = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 1, 90.0f, 200.0f, 80.0f, 0.0f);
    int s2 = huddle_spawn_animal(&g, HUDDLE_SPECIES_SEAL, 1, 130.0f, 200.0f, -80.0f, 0.0f);
    assert(s1 >= 0 && s2 >= 0);

    huddle_animal_t *shiba = &g.animals[s1];
    huddle_animal_t *seal = &g.animals[s2];

    // 清除音效队列
    huddle_sound_clear(&g);

    bool collision_sound = false;
    bool squish_triggered = false;

    // 运行若干步进直至碰撞发生
    for (int i = 0; i < 30; i++) {
        huddle_game_step(&g, 15);

        // 检查是否发生形变 (果冻 Q 弹挤压使 squish_x 偏离 1.0f)
        if (fabsf(shiba->squish_x - 1.0f) > 0.05f || fabsf(seal->squish_x - 1.0f) > 0.05f) {
            squish_triggered = true;
        }

        while (g.sound_q.count > 0) {
            huddle_sound_t s = huddle_sound_dequeue(&g);
            if (s == HUDDLE_SND_SQUISH) {
                collision_sound = true;
            }
        }
    }

    assert(squish_triggered);
    assert(collision_sound); // 验证 Q 弹挤压音效触发
    // 验证反弹后柴犬向左，海豹向右 (相对速度反向)
    assert(shiba->vx < 0.0f);
    assert(seal->vx > 0.0f);

    // 继续模拟 1 秒，测试弹簧阻尼谐振回复：squish 恢复至接近 1.0f
    for (int i = 0; i < 80; i++) {
        huddle_game_step(&g, 16);
    }
    assert(fabsf(shiba->squish_x - 1.0f) < 0.12f);
    assert(fabsf(shiba->squish_y - 1.0f) < 0.12f);

    printf("  ✓ Jelly squish deformation, spring recovery & bounce OK\n");
}

// =========================================================================
// TEST 5: 两级小动物果冻抱团融合进阶测试 (Tier 1 -> Tier 2 -> Tier 3)
// =========================================================================
static void test_animal_merge_progression(void)
{
    printf("[TEST 5] Testing Two-Tier Animal Merge Progression...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x4444);

    // 阶段一：两只同种柴犬 Tier 1 (幼崽泡汤) 碰撞融合
    int s1 = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 1, 100.0f, 220.0f, 20.0f, 0.0f);
    int s2 = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 1, 115.0f, 220.0f, -20.0f, 0.0f);
    assert(s1 >= 0 && s2 >= 0);

    huddle_sound_clear(&g);
    assert(huddle_get_animal_count(&g) == 2);

    bool merge_sound_detected = false;
    for (int i = 0; i < 20; i++) {
        huddle_game_step(&g, 16);
        while (g.sound_q.count > 0) {
            huddle_sound_t s = huddle_sound_dequeue(&g);
            if (s == HUDDLE_SND_MERGE_ARPEGGIO) {
                merge_sound_detected = true;
            }
        }
        if (huddle_get_animal_count(&g) == 1) break;
    }

    // 验证合并完成
    assert(huddle_get_animal_count(&g) == 1);
    assert(g.merge_count == 1);
    assert(g.score >= 20); // 获得合成积分
    assert(merge_sound_detected); // 确认进阶琶音触发
    assert(huddle_get_particle_count(&g) > 0); // 确认樱花花瓣迸发
    assert(huddle_quote_get_current(&g) != NULL); // 确认触发暖心语录

    // 验证升阶为 Tier 2 ("温泉毛巾"形态)
    huddle_animal_t *merged_shiba = &g.animals[s1];
    assert(merged_shiba->active);
    assert(merged_shiba->tier == 2);
    assert(merged_shiba->radius == huddle_get_species_radius(HUDDLE_SPECIES_SHIBA, 2));

    // 阶段二：生成第二只 Tier 2 柴犬，验证二次融合升阶为 Tier 3 ("樱花头饰"形态)
    // 先让第一只柴犬解除 400ms 的融合锁定
    for (int i = 0; i < 30; i++) {
        huddle_game_step(&g, 20);
    }
    assert(merged_shiba->merge_lock_ms == 0);

    // 在旁边生成另一只柴犬 Tier 2
    int s3 = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 2, merged_shiba->x + 25.0f, merged_shiba->y, -15.0f, 0.0f);
    assert(s3 >= 0);
    assert(huddle_get_animal_count(&g) == 2);

    uint32_t prev_score = g.score;
    merge_sound_detected = false;

    for (int i = 0; i < 25; i++) {
        huddle_game_step(&g, 16);
        while (g.sound_q.count > 0) {
            huddle_sound_t s = huddle_sound_dequeue(&g);
            if (s == HUDDLE_SND_MERGE_ARPEGGIO) {
                merge_sound_detected = true;
            }
        }
        if (huddle_get_animal_count(&g) == 1) break;
    }

    assert(huddle_get_animal_count(&g) == 1);
    assert(g.merge_count == 2);
    assert(g.score > prev_score);
    assert(merged_shiba->tier == 3); // 成功进阶为 Tier 3
    assert(merged_shiba->radius == huddle_get_species_radius(HUDDLE_SPECIES_SHIBA, 3));
    assert(strcmp(huddle_tier_get_title(merged_shiba->tier), "樱花头饰") == 0);

    printf("  ✓ Two-tier progression (Tier 1->2->3), sakura particles & arpeggio OK\n");
}

// =========================================================================
// TEST 6: 长按抚摸互动与暖心语录系统测试
// =========================================================================
static void test_petting_and_healing_quotes(void)
{
    printf("[TEST 6] Testing Petting Long Press & Healing Quotes...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x5555);

    // 1. 短按测试：按下 100ms 即松开，应判定为投放动物
    huddle_input_ok_press(&g);
    huddle_game_step(&g, 100);
    assert(g.drop_count == 0);
    huddle_input_ok_release(&g);
    assert(g.drop_count == 1); // 成功投放小动物
    assert(huddle_get_animal_count(&g) == 1);

    // 2. 长按测试：持续按住超过 HUDDLE_LONG_PRESS_MS (380ms)
    huddle_sound_clear(&g);
    uint32_t score_before = g.score;
    uint32_t pet_before = g.pet_count;

    huddle_input_ok_press(&g);
    huddle_game_step(&g, 200); // 累计 200ms，未达阈值
    assert(g.pet_count == pet_before);

    huddle_game_step(&g, 220); // 累计 420ms，超过阈值，应自动触发抚摸
    assert(g.pet_count == pet_before + 1);
    assert(g.score > score_before);

    // 验证抚摸呼噜声与爱心音效触发
    bool purr_sound = false;
    bool heart_sound = false;
    while (g.sound_q.count > 0) {
        huddle_sound_t s = huddle_sound_dequeue(&g);
        if (s == HUDDLE_SND_PURR) purr_sound = true;
        if (s == HUDDLE_SND_PET_HEART) heart_sound = true;
    }
    assert(purr_sound);
    assert(heart_sound);

    // 验证长按释放后，不会误触发二次投放
    uint32_t drops_before = g.drop_count;
    huddle_input_ok_release(&g);
    assert(g.drop_count == drops_before);

    // 3. 语录测试：验证当前语录文本非空且正确
    const char *quote = huddle_quote_get_current(&g);
    assert(quote != NULL && strlen(quote) > 0);

    // 验证语录保持显示，超时 HUDDLE_QUOTE_DISPLAY_MS 后自动消失
    huddle_game_step(&g, HUDDLE_QUOTE_DISPLAY_MS + 200);
    assert(huddle_quote_get_current(&g) == NULL);

    printf("  ✓ Short press drop vs long press pet, purr sound & quote expiry OK\n");
}

// =========================================================================
// TEST 7: 沉浸放置挂机模式与竹筒添水敲击测试
// =========================================================================
static void test_zen_idle_mode_and_shishi_odoshi(void)
{
    printf("[TEST 7] Testing Zen Mode & Bamboo Shishi-odoshi Clack...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x6666);

    assert(!g.zen_mode);

    // 步进 5100ms (超过 HUDDLE_ZEN_IDLE_TIMEOUT_MS 5000ms)，验证自动激活 Zen Mode
    for (int i = 0; i < 170; i++) {
        huddle_game_step(&g, 30);
    }
    assert(g.zen_mode);

    // 在 Zen 模式下，验证竹筒添水周期清脆敲击声
    huddle_sound_clear(&g);
    bool bamboo_clack = false;
    for (int i = 0; i < 160; i++) { // 模拟约 4800ms，竹筒周期 4500ms
        huddle_game_step(&g, 30);
        while (g.sound_q.count > 0) {
            huddle_sound_t s = huddle_sound_dequeue(&g);
            if (s == HUDDLE_SND_SHISHI_ODOSHI) {
                bamboo_clack = true;
            }
        }
    }
    assert(bamboo_clack);

    // 按下任意键，验证立即唤醒退出 Zen Mode
    huddle_input_up(&g);
    assert(!g.zen_mode);
    assert(g.idle_timer_ms == 0);

    printf("  ✓ Zen mode auto-entry, shishi-odoshi clack & key wakeup OK\n");
}

// =========================================================================
// TEST 8: 满池溢出判定与 GameOver 告警测试
// =========================================================================
static void test_overflow_and_gameover(void)
{
    printf("[TEST 8] Testing Hot Spring Overflow Warning & GameOver...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x7777);

    // 在池中放置支撑动物与堆叠动物，使猫咪堆叠在警戒线 HUDDLE_OVERFLOW_Y (90px) 之上
    int s_base = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 2, 120.0f, 105.0f, 0.0f, 0.0f);
    assert(s_base >= 0);
    g.animals[s_base].age_ms = 1000;

    int slot = huddle_spawn_animal(&g, HUDDLE_SPECIES_CAT, 1, 120.0f, 75.0f, 0.0f, 0.0f);
    assert(slot >= 0);
    huddle_animal_t *cat = &g.animals[slot];
    cat->age_ms = 1000;   // 模拟存活已久已堆叠稳定

    huddle_sound_clear(&g);

    // 步进若干帧，触发溢出告警
    for (int i = 0; i < 5; i++) {
        huddle_game_step(&g, 20);
    }
    assert(g.overflow_danger);

    // 检查是否播放溢出警告音
    bool warn_sound = false;
    while (g.sound_q.count > 0) {
        huddle_sound_t s = huddle_sound_dequeue(&g);
        if (s == HUDDLE_SND_OVERFLOW_WARN) warn_sound = true;
    }
    assert(warn_sound);

    // 持续超时超过 HUDDLE_OVERFLOW_LIMIT_MS (2200ms)，触发 GameOver
    for (int i = 0; i < 60; i++) {
        huddle_game_step(&g, 40);
    }
    assert(huddle_game_is_game_over(&g));

    // 验证播放 GameOver 结算音
    bool over_sound = false;
    while (g.sound_q.count > 0) {
        huddle_sound_t s = huddle_sound_dequeue(&g);
        if (s == HUDDLE_SND_GAMEOVER) over_sound = true;
    }
    assert(over_sound);

    printf("  ✓ Overflow warning & GameOver detection OK\n");
}

// =========================================================================
// TEST 9: 对象池回收与零内存泄漏复用测试
// =========================================================================
static void test_object_pool_reuse_and_stress(void)
{
    printf("[TEST 9] Testing Object Pool Recycling & Zero Memory Leak...\n");
    huddle_game_t g;
    huddle_game_init(&g, 0x9999);

    // 填满整个对象池 (HUDDLE_MAX_ANIMALS = 20)
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        int s = huddle_spawn_animal(&g, (huddle_species_t)(i % HUDDLE_SPECIES_COUNT), 1,
                                    50.0f + (float)(i % 5) * 25.0f, 150.0f + (float)(i / 5) * 30.0f,
                                    0.0f, 0.0f);
        assert(s >= 0);
    }
    assert(huddle_get_animal_count(&g) == HUDDLE_MAX_ANIMALS);

    // 尝试在池满时再次生成，应安全返回 -1，无越界无崩溃
    int overflow_slot = huddle_spawn_animal(&g, HUDDLE_SPECIES_SHIBA, 1, 100.0f, 100.0f, 0.0f, 0.0f);
    assert(overflow_slot == -1);

    // 手动释放其中 3 个槽位，模拟融合消除或回收
    g.animals[2].active = false;
    g.animals[7].active = false;
    g.animals[13].active = false;
    assert(huddle_get_animal_count(&g) == HUDDLE_MAX_ANIMALS - 3);

    // 再次生成，应当成功复用刚才释放的槽位
    int s_new = huddle_spawn_animal(&g, HUDDLE_SPECIES_OTTER, 2, 80.0f, 180.0f, 0.0f, 0.0f);
    assert(s_new == 2 || s_new == 7 || s_new == 13);
    assert(huddle_get_animal_count(&g) == HUDDLE_MAX_ANIMALS - 2);

    // 连续模拟 1000 帧物理，验证数值无 NaN/Inf，运行极度稳定
    for (int i = 0; i < 1000; i++) {
        huddle_game_step(&g, 16);
    }

    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        if (!g.animals[i].active) continue;
        assert(!isnan(g.animals[i].x));
        assert(!isnan(g.animals[i].y));
        assert(!isnan(g.animals[i].vx));
        assert(!isnan(g.animals[i].vy));
        assert(!isnan(g.animals[i].squish_x));
        assert(!isnan(g.animals[i].squish_y));
        assert(g.animals[i].x >= HUDDLE_POOL_LEFT - 1.0f);
        assert(g.animals[i].x <= HUDDLE_POOL_RIGHT + 1.0f);
    }

    printf("  ✓ Object pool recycling & numerical stability stress test OK\n");
}

int main(void)
{
    setbuf(stdout, NULL);
    printf("\n========================================================\n");
    printf(" FLUFFY HUDDLE (萌物抱抱团 / 柴犬与海豹的午后温泉)\n");
    printf(" Core Algorithm & State Machine Host Unit Tests\n");
    printf("========================================================\n\n");

    test_initialization_and_lifecycle();
    test_rail_movement_and_clamping();
    test_water_kinematics_and_buoyancy();
    test_jelly_squish_and_elastic_collision();
    test_animal_merge_progression();
    test_petting_and_healing_quotes();
    test_zen_idle_mode_and_shishi_odoshi();
    test_overflow_and_gameover();
    test_object_pool_reuse_and_stress();

    printf("\n========================================================\n");
    printf(" ALL 9 TEST SUITES PASSED! 100%% SUCCESS!\n");
    printf("========================================================\n\n");

    return 0;
}
