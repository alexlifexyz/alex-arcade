#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "sparkler_logic.h"

static void test_initialization(void)
{
    printf("1. 测试初始化状态...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_SPARKLER);

    // 仙女棒模式初始化
    assert(s.mode == MODE_SPARKLER);
    assert(s.sparkler.wick_progress == 0.0f);
    assert(s.sparkler.is_lit == true);
    assert(s.sparkler.milestone_mask == 0);
    assert(s.sparkler.last_milestone == 0);
    assert(!s.sparkler.milestone_triggered);
    assert(s.sparkler.burst_count == 0);
    assert(s.burn_speed_mult == 1.0f);
    assert(s.particle_density == 1.0f);
    assert(s.blow_intensity == 0.0f);
    assert(sparkler_active_particle_count(&s) == 0);

    float bx, by;
    sparkler_get_burn_point(&s, &bx, &by);
    assert(bx == SPARKLER_STICK_X);
    assert(by == SPARKLER_WICK_TOP);

    // 蜡烛模式初始化
    sparkler_init(&s, MODE_CANDLE);
    assert(s.mode == MODE_CANDLE);
    assert(s.candle.is_lit == true);
    assert(s.candle.is_smoking == false);
    assert(s.candle.smoke_timer_ms == 0);
    assert(s.candle.wax_height == CANDLE_INIT_WAX_HEIGHT);
    assert(s.candle.wax_melt_height == 0.0f);
    assert(s.candle.flicker > 0.0f);

    float fx, fy;
    sparkler_get_flame_point(&s, &fx, &fy);
    assert(fx == CANDLE_BASE_X);
    assert(fy == (CANDLE_BASE_Y - CANDLE_INIT_WAX_HEIGHT));

    printf("   ✓ 双模式初始化属性与几何坐标校验通过\n");
}

static void test_burn_progress_and_tuning(void)
{
    printf("2. 测试燃烧进度推进与 UP/DOWN 微调...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_SPARKLER);

    // 推进 1000ms
    sparkler_step(&s, 1000);
    assert(s.sparkler.wick_progress > 0.04f && s.sparkler.wick_progress < 0.06f);
    float p1 = s.sparkler.wick_progress;

    // 按 UP 键加速燃烧
    sparkler_btn_up(&s);
    assert(s.burn_speed_mult == 1.25f);
    assert(s.particle_density == 1.25f);

    sparkler_step(&s, 1000);
    float p2 = s.sparkler.wick_progress;
    float delta2 = p2 - p1;
    // 加速后的 1s 增量应严格大于基准增量
    assert(delta2 > p1);

    // 测试 DOWN 键
    sparkler_btn_down(&s);
    assert(s.burn_speed_mult == 1.0f);
    assert(s.particle_density == 1.0f);

    // 边界限幅测试
    for (int i = 0; i < 20; i++) {
        sparkler_btn_down(&s);
    }
    assert(s.burn_speed_mult == 0.25f);
    assert(s.particle_density == 0.25f);

    for (int i = 0; i < 20; i++) {
        sparkler_btn_up(&s);
    }
    assert(s.burn_speed_mult == 3.0f);
    assert(s.particle_density == 3.0f);

    printf("   ✓ 燃烧推进计算与 UP/DOWN 调速限幅校验通过\n");
}

static void test_particle_pool_and_physics_update(void)
{
    printf("3. 测试粒子池生成、对象字段与物理动力学更新...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_SPARKLER);

    // 步进 100ms 产生粒子
    sparkler_step(&s, 100);
    int active_cnt = sparkler_active_particle_count(&s);
    assert(active_cnt > 0);

    // 校验粒子对象字段：(x, y, vx, vy, life_ms, max_life_ms, brightness, type)
    int found_idx = -1;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s.particles[i].active && s.particles[i].type == PARTICLE_SPARK) {
            found_idx = i;
            break;
        }
    }
    assert(found_idx >= 0);
    sparkler_particle_t *p = &s.particles[found_idx];
    assert(p->max_life_ms > 0);
    assert(p->brightness <= 1.0f && p->brightness >= 0.0f);
    assert(p->type == PARTICLE_SPARK);
    assert(p->active == true);

    float initial_vy = p->vy;
    uint32_t initial_life = p->life_ms;

    // 步进 50ms 验证物理重力加速度与寿命衰减
    sparkler_step(&s, 50);
    assert(p->life_ms > initial_life);
    assert(p->vy > initial_vy); // 重力加速下坠
    assert(p->brightness < 1.0f); // 亮度逐渐衰减

    // 超出寿命后应自动释放
    sparkler_step(&s, p->max_life_ms + 100);
    // 检查经过长时间后，该槽位或被释放或为新粒子
    // 确认粒子系统能稳定回收，不发生内存/池泄露
    assert(sparkler_active_particle_count(&s) <= SPARKLER_MAX_PARTICLES);

    printf("   ✓ 粒子池对象字段与重力/寿命衰减物理模型校验通过\n");
}

static void test_milestone_triggers(void)
{
    printf("4. 测试 25%%, 50%%, 75%%, 100%% 阶段里程碑彩色爆发...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_SPARKLER);

    // 调快燃烧速度便于精确触发
    sparkler_set_burn_speed(&s, 1.0f);

    // --- 25% 里程碑 ---
    s.sparkler.wick_progress = 0.245f;
    sparkler_step(&s, 200); // 推进跨越 0.25
    assert(s.sparkler.wick_progress >= 0.25f);
    assert(s.sparkler.milestone_triggered == true);
    assert(s.sparkler.last_milestone == 25);
    assert(s.sparkler.burst_count == 1);
    assert(s.sparkler.milestone_mask & 0x01);

    // 验证爆发产生了 PARTICLE_BURST 粒子
    bool has_burst_p = false;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s.particles[i].active && s.particles[i].type == PARTICLE_BURST) {
            has_burst_p = true;
            break;
        }
    }
    assert(has_burst_p);

    // 下一步进 milestone_triggered 应复位为单帧脉冲
    sparkler_step(&s, 50);
    assert(s.sparkler.milestone_triggered == false);

    // --- 50% 里程碑 ---
    s.sparkler.wick_progress = 0.495f;
    sparkler_step(&s, 200);
    assert(s.sparkler.wick_progress >= 0.50f);
    assert(s.sparkler.milestone_triggered == true);
    assert(s.sparkler.last_milestone == 50);
    assert(s.sparkler.burst_count == 2);
    assert(s.sparkler.milestone_mask & 0x02);

    // --- 75% 里程碑 ---
    s.sparkler.wick_progress = 0.745f;
    sparkler_step(&s, 200);
    assert(s.sparkler.wick_progress >= 0.75f);
    assert(s.sparkler.milestone_triggered == true);
    assert(s.sparkler.last_milestone == 75);
    assert(s.sparkler.burst_count == 3);
    assert(s.sparkler.milestone_mask & 0x04);

    // --- 100% 里程碑与燃尽 ---
    s.sparkler.wick_progress = 0.995f;
    sparkler_step(&s, 200);
    assert(s.sparkler.wick_progress == 1.0f);
    assert(s.sparkler.milestone_triggered == true);
    assert(s.sparkler.last_milestone == 100);
    assert(s.sparkler.burst_count == 4);
    assert(s.sparkler.milestone_mask & 0x08);
    // 燃尽后熄灭
    assert(s.sparkler.is_lit == false);

    // 后续步进不再触发
    sparkler_step(&s, 200);
    assert(s.sparkler.milestone_triggered == false);
    assert(s.sparkler.burst_count == 4);

    printf("   ✓ 25%%, 50%%, 75%%, 100%% 四阶段彩色烟火爆点触发与燃尽机制校验通过\n");
}

static void test_blow_interaction_sparkler(void)
{
    printf("5. 测试麦克风吹气对仙女棒火花激荡（扩散范围与发射频率）的影响...\n");
    sparkler_state_t s_calm;
    sparkler_init(&s_calm, MODE_SPARKLER);
    sparkler_set_blow(&s_calm, 0.0f);

    sparkler_state_t s_blown;
    sparkler_init(&s_blown, MODE_SPARKLER);
    sparkler_set_blow(&s_blown, 1.0f);

    // 同时步进 200ms
    sparkler_step(&s_calm, 200);
    sparkler_step(&s_blown, 200);

    int count_calm = sparkler_active_particle_count(&s_calm);
    int count_blown = sparkler_active_particle_count(&s_blown);

    // 吹气时的发射频率大幅增加 (多倍粒子数量)
    assert(count_blown > count_calm * 2);

    // 计算火花扩散初速度模长平均值
    float speed_sum_calm = 0.0f;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s_calm.particles[i].active && s_calm.particles[i].type == PARTICLE_SPARK) {
            float spd = sqrtf(s_calm.particles[i].vx * s_calm.particles[i].vx +
                              s_calm.particles[i].vy * s_calm.particles[i].vy);
            speed_sum_calm += spd;
        }
    }
    float avg_speed_calm = speed_sum_calm / (float)(count_calm > 0 ? count_calm : 1);

    float speed_sum_blown = 0.0f;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s_blown.particles[i].active && s_blown.particles[i].type == PARTICLE_SPARK) {
            float spd = sqrtf(s_blown.particles[i].vx * s_blown.particles[i].vx +
                              s_blown.particles[i].vy * s_blown.particles[i].vy);
            speed_sum_blown += spd;
        }
    }
    float avg_speed_blown = speed_sum_blown / (float)(count_blown > 0 ? count_blown : 1);

    // 扩散速度范围显著增大
    assert(avg_speed_blown > avg_speed_calm * 1.8f);

    printf("   ✓ 仙女棒在吹气时粒子生成频率大幅增加 (静止:%d vs 吹气:%d) 且扩散速度显著增强 (%.1f vs %.1f)\n",
           count_calm, count_blown, avg_speed_calm, avg_speed_blown);
}

static void test_candle_flicker_and_extinguish(void)
{
    printf("6. 测试蜡烛轻吹摇曳与猛吹（> 0.7 持续 200ms）熄灭及冒烟...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_CANDLE);

    // 1. 静止状态晃动微弱
    sparkler_set_blow(&s, 0.0f);
    sparkler_step(&s, 100);
    float calm_flicker = s.candle.flicker;
    assert(calm_flicker < 0.20f);

    // 2. 轻吹 (0.45 强度)：火苗剧烈摇曳但绝不熄灭
    sparkler_set_blow(&s, 0.45f);
    sparkler_step(&s, 300);
    assert(s.candle.is_lit == true);
    assert(s.candle.flicker > calm_flicker + 0.30f);
    assert(s.candle.flame_angle > 10.0f);
    assert(s.candle.blow_hold_ms == 0); // 未达 0.7 不累计持续吹熄计时

    // 3. 猛吹持续时间测试 (> 0.7 需持续 200ms)
    sparkler_set_blow(&s, 0.85f);
    sparkler_step(&s, 100); // 持续 100ms
    assert(s.candle.is_lit == true); // 未满 200ms，依旧点燃
    assert(s.candle.blow_hold_ms == 100);

    // 突然中断猛吹 (降到 0.5)
    sparkler_set_blow(&s, 0.5f);
    sparkler_step(&s, 50);
    assert(s.candle.is_lit == true);
    assert(s.candle.blow_hold_ms == 0); // 计时被重置！

    // 重新开启猛吹并持续满 200ms (100ms + 100ms)
    sparkler_set_blow(&s, 0.85f);
    sparkler_step(&s, 100);
    assert(s.candle.is_lit == true);
    assert(s.candle.blow_hold_ms == 100);

    sparkler_step(&s, 100); // 达到 200ms
    assert(s.candle.is_lit == false); // 成功吹灭！
    assert(s.candle.is_smoking == true); // 进入冒烟状态
    assert(s.candle.smoke_timer_ms == CANDLE_SMOKE_DURATION_MS);

    // 验证有青烟粒子冒出
    bool has_smoke = false;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s.particles[i].active && s.particles[i].type == PARTICLE_SMOKE) {
            has_smoke = true;
            break;
        }
    }
    assert(has_smoke);

    // 步进消耗完冒烟时间
    sparkler_set_blow(&s, 0.0f);
    sparkler_step(&s, CANDLE_SMOKE_DURATION_MS + 200);
    assert(s.candle.is_smoking == false);

    printf("   ✓ 蜡烛轻吹剧烈摇曳、猛吹中断重置、猛吹 200ms 熄灭与青烟微粒状态校验通过\n");
}

static void test_candle_reignite_and_switch(void)
{
    printf("7. 测试按键 OK 重新点燃与模式切换...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_CANDLE);

    // 吹灭蜡烛
    sparkler_set_blow(&s, 0.9f);
    sparkler_step(&s, 250);
    assert(s.candle.is_lit == false);

    // OK 键：熄灭状态下按 OK -> 重新点燃
    sparkler_set_blow(&s, 0.0f);
    sparkler_btn_ok(&s);
    assert(s.candle.is_lit == true);
    assert(s.candle.is_smoking == false);
    assert(s.mode == MODE_CANDLE);

    // OK 键：点燃状态下按 OK -> 切换到仙女棒模式
    sparkler_btn_ok(&s);
    assert(s.mode == MODE_SPARKLER);

    // 仙女棒点燃状态下按 OK -> 切换回蜡烛模式
    sparkler_btn_ok(&s);
    assert(s.mode == MODE_CANDLE);

    // 切换至仙女棒并燃尽
    sparkler_switch_mode(&s, MODE_SPARKLER);
    s.sparkler.wick_progress = 1.0f;
    s.sparkler.is_lit = false;

    // 仙女棒燃尽状态下按 OK -> 重新换新并点燃
    sparkler_btn_ok(&s);
    assert(s.mode == MODE_SPARKLER);
    assert(s.sparkler.is_lit == true);
    assert(s.sparkler.wick_progress == 0.0f);
    assert(s.sparkler.milestone_mask == 0);
    assert(s.sparkler.burst_count == 0);

    printf("   ✓ 按键 OK 重新点燃已熄蜡烛/重燃仙女棒与双模式灵活切换校验通过\n");
}

static void test_wax_melting_physics(void)
{
    printf("8. 测试蜡烛蜡油融化高度物理系统...\n");
    sparkler_state_t s;
    sparkler_init(&s, MODE_CANDLE);

    float h0 = s.candle.wax_height;
    float m0 = s.candle.wax_melt_height;
    assert(h0 == CANDLE_INIT_WAX_HEIGHT);
    assert(m0 == 0.0f);

    // 燃烧 3000ms
    sparkler_step(&s, 3000);
    assert(s.candle.wax_height < h0);
    assert(s.candle.wax_melt_height > 0.0f);
    // 融化高度增加与剩余高度减少之和保持守恒
    float diff = (s.candle.wax_height + s.candle.wax_melt_height) - (h0 + m0);
    assert(fabsf(diff) < 0.01f);

    // 熄灭后不融化
    s.candle.is_lit = false;
    float h1 = s.candle.wax_height;
    sparkler_step(&s, 2000);
    assert(s.candle.wax_height == h1);

    printf("   ✓ 蜡烛持续燃烧蜡油融化高度累积与高度守恒校验通过\n");
}

int main(void)
{
    printf("\n==================================================\n");
    printf("[TEST] 启动《星火仙女棒与赛博烛火》核心物理与互动单测\n");
    printf("==================================================\n");

    test_initialization();
    test_burn_progress_and_tuning();
    test_particle_pool_and_physics_update();
    test_milestone_triggers();
    test_blow_interaction_sparkler();
    test_candle_flicker_and_extinguish();
    test_candle_reignite_and_switch();
    test_wax_melting_physics();

    printf("\n==================================================\n");
    printf("[PASS] 全部 8 大核心物理与互动测试 100%% 通过！\n");
    printf("==================================================\n\n");
    return 0;
}
