// tests/test_wind_logic.c —— 《风与纸翼》(Wind Rider) 核心逻辑单元测试
#include "wind_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>

static void test_initialization(void)
{
    printf("[TEST 1] Testing Initialization & Initial State...\n");
    wind_game_t g;
    wind_init(&g, 0x12345678);

    assert(g.distance == 0.0f);
    assert(g.x == 0.0f);
    assert(g.y < wind_get_ground_height(0.0f)); // 起始于空中
    assert(g.vx >= WIND_CRUISE_SPEED_X);
    assert(g.stance == WIND_STANCE_SOAR);
    assert(!g.is_ok_holding);
    assert(!g.on_ground);
    assert(g.score == 0);
    assert(g.dandelion_count == 0);
    assert(g.crystal_count == 0);
    assert(g.ring_combo == 0);
    assert(g.sky_phase == WIND_SKY_GOLDEN_DAWN);
    assert(g.pending_sound == WIND_SND_NONE);

    // 检查气流环与收集物池初始激活
    int active_rings = 0;
    for (int i = 0; i < WIND_MAX_RINGS; i++) {
        if (g.rings[i].active) {
            active_rings++;
            assert(g.rings[i].x > g.x); // 全部在前方
        }
    }
    assert(active_rings == WIND_MAX_RINGS);

    int active_items = 0;
    for (int i = 0; i < WIND_MAX_COLLECTIBLES; i++) {
        if (g.collectibles[i].active) {
            active_items++;
        }
    }
    assert(active_items == WIND_MAX_COLLECTIBLES);

    printf("  ✓ Initial values, zero malloc object pools & sky phase OK\n");
}

static void test_terrain_math(void)
{
    printf("[TEST 2] Testing Smooth Mathematical Hill Terrain & Slope Derivative...\n");

    // 1. 测试地表高度范围平滑连续
    for (float d = 0.0f; d < 3000.0f; d += 25.0f) {
        float h = wind_get_ground_height(d);
        assert(h >= 140.0f && h <= 300.0f); // 确保在竖屏合理范围内
    }

    // 2. 验证解析斜率导数与中心数值有限差分导数的精确一致性
    float eps = 0.05f;
    for (float d = 10.0f; d < 2000.0f; d += 73.0f) {
        float slope_analytical = wind_get_ground_slope(d);
        float h_plus = wind_get_ground_height(d + eps);
        float h_minus = wind_get_ground_height(d - eps);
        float slope_numerical = (h_plus - h_minus) / (2.0f * eps);

        float diff = fabsf(slope_analytical - slope_numerical);
        assert(diff < 0.005f); // 误差小于 0.005，导数精确无误
    }

    printf("  ✓ Mathematical composite sine terrain & slope derivative verification OK\n");
}

static void test_dive_acceleration(void)
{
    printf("[TEST 3] Testing OK Button Tuck Wings Fast Dive Mechanics...\n");
    wind_game_t g;
    wind_init(&g, 0x1111);

    // 起始状态置于高空
    g.y = 80.0f;
    g.vy = 0.0f;
    g.vx = WIND_CRUISE_SPEED_X;

    // 按下 OK 键：收拢双翼俯冲
    wind_input_ok(&g, true);
    assert(g.is_ok_holding == true);
    assert(g.stance == WIND_STANCE_DIVE);
    assert(wind_consume_sound(&g) == WIND_SND_DIVE);

    // 步进 100ms
    wind_step(&g, 100);

    // 下降速度显著增加 (重力加速)
    assert(g.vy > 30.0f);
    assert(g.dive_charge_ms > 0.0f);
    assert(g.stance == WIND_STANCE_DIVE);

    printf("  ✓ Dive posture, sound event and downward acceleration OK\n");
}

static void test_soar_lift(void)
{
    printf("[TEST 4] Testing Release OK Wings Expansion & Soaring Lift...\n");
    wind_game_t g;
    wind_init(&g, 0x2222);

    // 模拟一段高速俯冲下潜
    g.y = 120.0f;
    g.vx = 220.0f;
    g.vy = 100.0f;
    wind_input_ok(&g, true);
    wind_step(&g, 150);
    wind_step(&g, 150);

    // 松开 OK 键：迎风张开双翼
    wind_input_ok(&g, false);
    assert(!g.is_ok_holding);
    assert(g.stance == WIND_STANCE_SOAR);
    assert(wind_consume_sound(&g) == WIND_SND_SOAR);

    // 步进几帧，动能转化为升力
    float old_y = g.y;
    wind_step(&g, 50);
    // vy 被向上升力托举，升空冲云
    assert(g.vy < 0.0f);
    assert(g.y <= old_y + 5.0f);

    printf("  ✓ Release OK wings lift burst & soaring leap OK\n");
}

static void test_pitch_adjustment(void)
{
    printf("[TEST 5] Testing Pitch Angle Fine-Tuning (UP/DOWN Buttons)...\n");
    wind_game_t g;
    wind_init(&g, 0x3333);
    g.y = 100.0f;
    g.vy = 0.0f;

    // 按下 UP 抬头微调
    wind_input_pitch_up(&g);
    assert(g.pitch_trim > 0.0f);
    assert(g.vy < 0.0f); // 向上微升力

    // 按下 DOWN 低头微调
    wind_input_pitch_down(&g);
    wind_input_pitch_down(&g);
    assert(g.pitch_trim < 0.0f);

    printf("  ✓ UP/DOWN pitch trim control OK\n");
}

static void test_pitch_hold_and_late_release(void)
{
    printf("[TEST 5b] Testing held pitch and dive release after a long press...\n");
    wind_game_t g;
    wind_init(&g, 0x5151);
    g.y = 80.0f;
    g.vy = 0.0f;
    g.vx = WIND_CRUISE_SPEED_X;
    wind_input_pitch_hold(&g, 1);

    float y0 = g.y;
    wind_step(&g, 200);
    assert(g.pitch_hold == 1);
    assert(g.pitch_trim > 5.0f);
    assert(g.y < y0);

    wind_input_pitch_hold(&g, 0);
    assert(g.pitch_hold == 0);

    // 长于菜单长按阈值的俯冲，松开后必须退出俯冲，不能卡在收翼状态。
    wind_init(&g, 0x5152);
    g.y = 70.0f;
    g.vx = 200.0f;
    g.vy = 0.0f;
    wind_input_ok(&g, true);
    wind_step(&g, 400);
    wind_step(&g, 400);
    wind_step(&g, 400);
    assert(g.is_ok_holding);
    assert(g.dive_charge_ms >= 1000.0f);
    wind_input_ok(&g, false);
    assert(!g.is_ok_holding);

    printf("  ✓ Held nose-up and late dive release OK\n");
}

static void test_never_crash_ground_glide(void)
{
    printf("[TEST 6] Testing Never-Crash Safe Ground Glide Mechanics...\n");
    wind_game_t g;
    wind_init(&g, 0x4444);

    // 模拟以高速直接撞向地面
    float ground_y = wind_get_ground_height(g.x);
    g.y = ground_y + 50.0f; // 深度落入地表下方
    g.vy = 250.0f;          // 极速下坠

    wind_step(&g, 20);

    // 核心安全准则：绝不坠毁死亡！顺势吸附到地面滑行
    assert(g.on_ground == true);
    ground_y = wind_get_ground_height(g.x);
    assert(fabsf(g.y - ground_y) < 0.001f);
    assert(g.stance == WIND_STANCE_GLIDE);

    // 验证产生了草屑微粒
    bool found_grass_part = false;
    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        if (g.particles[i].active && g.particles[i].type == WIND_PART_GRASS) {
            found_grass_part = true;
            break;
        }
    }
    assert(found_grass_part == true);

    // 测试下坡顺坡按住 OK 加速
    // 寻找一段明显的下坡 (slope > 0.2)
    float test_x = 0.0f;
    while (wind_get_ground_slope(test_x) < 0.25f && test_x < 2000.0f) {
        test_x += 20.0f;
    }
    g.x = test_x;
    g.y = wind_get_ground_height(test_x);
    g.vx = 100.0f;
    wind_input_ok(&g, true); // 按住 OK 顺坡俯冲加速
    wind_step(&g, 30);
    assert(g.vx > 100.0f); // 顺坡势能转化为巨大动能！

    printf("  ✓ Crash-proof grass glide, grass sparks and slope acceleration OK\n");
}

static void test_wind_ring_burst(void)
{
    printf("[TEST 7] Testing Wind Rings Passing & Sonic Boost Burst...\n");
    wind_game_t g;
    wind_init(&g, 0x5555);

    // 在飞机正前方 15 像素处精准布置一个气流环
    g.rings[0].active = true;
    g.rings[0].passed = false;
    g.rings[0].x = g.x + 15.0f;
    g.rings[0].y = g.y;
    g.rings[0].radius = 18.0f;

    float initial_vx = g.vx;
    uint32_t initial_score = g.score;

    // 步进 100ms (以 ~120px/s 速度前进 ~12px，穿过环)
    wind_step(&g, 100);

    // 验证穿环触发
    assert(g.rings[0].passed == true);
    assert(g.ring_combo == 1);
    assert(g.score > initial_score);
    assert(g.boost_timer_ms > 0.0f);
    assert(g.vx > initial_vx + 50.0f); // 极速冲刺爆发
    assert(wind_consume_sound(&g) == WIND_SND_RING); // 清脆风铃声

    // 验证爆裂出气旋光环微粒
    bool found_ring_part = false;
    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        if (g.particles[i].active && g.particles[i].type == WIND_PART_RING_BURST) {
            found_ring_part = true;
            break;
        }
    }
    assert(found_ring_part == true);

    printf("  ✓ Wind ring collision, chime sound, combo bonus and burst particles OK\n");
}

static void test_collectibles(void)
{
    printf("[TEST 8] Testing Dandelion Seeds & Wind Crystals Pickup...\n");
    wind_game_t g;
    wind_init(&g, 0x6666);

    // 放置一颗水晶在前方 10px
    g.collectibles[0].active = true;
    g.collectibles[0].collected = false;
    g.collectibles[0].type = WIND_COLLECT_CRYSTAL;
    g.collectibles[0].x = g.x + 10.0f;
    g.collectibles[0].base_y = g.y;
    g.collectibles[0].y = g.y;

    wind_step(&g, 80);

    assert(g.collectibles[0].collected == true);
    assert(g.crystal_count == 1);
    assert(g.score == 50);
    assert(wind_consume_sound(&g) == WIND_SND_CRYSTAL);

    // 放置一颗蒲公英在前方 10px
    g.collectibles[1].active = true;
    g.collectibles[1].collected = false;
    g.collectibles[1].type = WIND_COLLECT_DANDELION;
    g.collectibles[1].x = g.x + 10.0f;
    g.collectibles[1].base_y = g.y;
    g.collectibles[1].y = g.y;

    wind_step(&g, 80);

    assert(g.collectibles[1].collected == true);
    assert(g.dandelion_count == 1);
    assert(g.score == 60);
    assert(wind_consume_sound(&g) == WIND_SND_DANDELION);

    printf("  ✓ Dandelion and crystal pickup, score addition and chime audio OK\n");
}

static void test_sky_phases_and_flow(void)
{
    printf("[TEST 9] Testing Day-Night Flow Cycle & Sky Colors...\n");
    wind_game_t g;
    wind_init(&g, 0x7777);

    // 初始处于晨曦金辉
    assert(g.sky_phase == WIND_SKY_GOLDEN_DAWN);

    // 模拟推进飞行总里程
    g.x = 1600.0f + 10.0f;
    wind_step(&g, 16);
    assert(g.sky_phase == WIND_SKY_CRIMSON_SUNSET);

    g.x = 3200.0f + 10.0f;
    wind_step(&g, 16);
    assert(g.sky_phase == WIND_SKY_TWILIGHT);

    g.x = 4800.0f + 10.0f;
    wind_step(&g, 16);
    assert(g.sky_phase == WIND_SKY_STARRY_NIGHT);

    g.x = 6400.0f + 10.0f;
    wind_step(&g, 16);
    assert(g.sky_phase == WIND_SKY_AURORA_DAWN);

    // 循环重回晨曦
    g.x = 8000.0f + 10.0f;
    wind_step(&g, 16);
    assert(g.sky_phase == WIND_SKY_GOLDEN_DAWN);

    // 验证颜色渐变输出
    uint32_t top_rgb = 0, bot_rgb = 0;
    wind_get_sky_colors(WIND_SKY_GOLDEN_DAWN, 0.5f, &top_rgb, &bot_rgb);
    assert(top_rgb != 0 && bot_rgb != 0);

    printf("  ✓ 5 sky phases flow cycle and RGB color interpolation OK\n");
}

static void test_long_run_stability(void)
{
    printf("[TEST 10] Testing Continuous Long-Distance Flying Stability...\n");
    wind_game_t g;
    wind_init(&g, 0x8888);

    // 模拟连续飞行 3000 帧 (约 60 秒真实时间)
    for (int frame = 0; frame < 3000; frame++) {
        // 模拟玩家偶尔按住 OK 俯冲，偶尔松开翱翔
        if (frame % 200 == 50) {
            wind_input_ok(&g, true);
        } else if (frame % 200 == 120) {
            wind_input_ok(&g, false);
        }

        if (frame % 150 == 20) {
            wind_input_pitch_up(&g);
        } else if (frame % 150 == 80) {
            wind_input_pitch_down(&g);
        }

        wind_step(&g, 20);

        // 验证物理学不变量
        assert(!isnan(g.x) && !isnan(g.y));
        assert(!isnan(g.vx) && !isnan(g.vy));
        assert(g.vx >= WIND_MIN_SPEED_X && g.vx <= WIND_MAX_SPEED_X);
        assert(g.y >= WIND_MIN_ALTITUDE_Y);
        float gh = wind_get_ground_height(g.x);
        assert(g.y <= gh + 0.001f); // 绝不陷入地心深处
    }

    assert(g.distance > 5000.0f);
    assert(g.max_altitude > 0.0f);
    printf("  ✓ Long-run 3000-frame simulation passed without crash or drift\n");
}

int main(void)
{
    printf("===============================================================\n");
    printf("  Starting Wind Rider (风与纸翼) Pure C Core Engine Unit Tests \n");
    printf("===============================================================\n");

    test_initialization();
    test_terrain_math();
    test_dive_acceleration();
    test_soar_lift();
    test_pitch_adjustment();
    test_pitch_hold_and_late_release();
    test_never_crash_ground_glide();
    test_wind_ring_burst();
    test_collectibles();
    test_sky_phases_and_flow();
    test_long_run_stability();

    printf("===============================================================\n");
    printf("  All Wind Rider Unit Tests Passed Successfully! (10/10)       \n");
    printf("===============================================================\n");
    return 0;
}
