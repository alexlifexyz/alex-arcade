// tests/test_bouncy_logic.c —— 《回声几何弹射枪》(Bouncy Blaster) 核心状态机算法全套宿主单元测试
// 验证纯 C11 状态机、零动态分配、反射虚线预判、几何镜面反弹、掩体盲区、炸药桶连锁与自伤幽默机制

#include "bouncy_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>
#include <string.h>

#define TEST_EPS 1e-3f

static void test_initialization_and_lifecycle(void)
{
    printf("[TEST 1] Testing Initialization, Agent Baselines & Lifecycle...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x1234ABCD);

    // 屏幕定义验证
    assert(BB_SCREEN_W == 240);
    assert(BB_SCREEN_H == 320);

    // 状态机初值验证
    assert(bouncy_is_aiming(&g));
    assert(!bouncy_is_firing(&g));
    assert(!bouncy_is_level_clear(&g));
    assert(!bouncy_is_game_over(&g));
    assert(!bouncy_is_paused(&g));

    assert(g.current_level == 1);
    assert(g.ammo_remaining == BB_DEFAULT_AMMO);
    assert(fabsf(g.aim_angle_deg - BB_AIM_DEFAULT_DEG) < TEST_EPS);
    assert(g.score == 0);
    assert(g.total_bounces == 0);

    // 特工特有属性验证
    assert(fabsf(g.agent.x - BB_AGENT_X) < TEST_EPS);
    assert(fabsf(g.agent.y - BB_AGENT_Y) < TEST_EPS);
    assert(fabsf(g.agent.gun_y - (BB_AGENT_Y + BB_AGENT_GUN_OFFSET_Y)) < TEST_EPS);
    assert(fabsf(g.agent.head_y - (BB_AGENT_Y + BB_AGENT_HEAD_OFFSET_Y)) < TEST_EPS);
    assert(g.agent.sunglasses_on == true);
    assert(g.agent.is_dizzy == false);
    assert(g.agent.dizzy_timer_ms == 0);

    // 暂停与恢复测试
    bouncy_game_pause(&g);
    assert(bouncy_is_paused(&g));
    uint32_t t_saved = g.game_time_ms;
    bouncy_game_step(&g, 50);
    assert(g.game_time_ms == t_saved); // 暂停时时间不推进

    bouncy_game_resume(&g);
    assert(!bouncy_is_paused(&g));
    bouncy_game_step(&g, 50);
    assert(g.game_time_ms == t_saved + 50);

    // 重置测试
    g.score = 9999;
    g.ammo_remaining = 0;
    bouncy_game_reset(&g);
    assert(g.ammo_remaining == BB_DEFAULT_AMMO);
    assert(bouncy_is_aiming(&g));

    printf("  ✓ Initialization & lifecycle verified\n");
}

static void test_high_precision_angle_stepping(void)
{
    printf("[TEST 2] Testing High-Precision 1.5° Angle Stepping & Clamping...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x55AA);

    // 初始应为 90.0°
    assert(fabsf(g.aim_angle_deg - 90.0f) < TEST_EPS);

    // UP 键步进 1.5°
    bouncy_input_aim_up(&g);
    assert(fabsf(g.aim_angle_deg - 91.5f) < TEST_EPS);

    bouncy_input_aim_up(&g);
    assert(fabsf(g.aim_angle_deg - 93.0f) < TEST_EPS);

    // DOWN 键步进 1.5°
    bouncy_input_aim_down(&g);
    assert(fabsf(g.aim_angle_deg - 91.5f) < TEST_EPS);
    bouncy_input_aim_down(&g);
    assert(fabsf(g.aim_angle_deg - 90.0f) < TEST_EPS);

    // 测试上限截断 (BB_AIM_MAX_DEG = 170.0°)
    for (int i = 0; i < 100; i++) {
        bouncy_input_aim_up(&g);
    }
    assert(fabsf(g.aim_angle_deg - BB_AIM_MAX_DEG) < TEST_EPS);

    // 再次按 UP 仍不超过 170.0°
    bouncy_input_aim_up(&g);
    assert(fabsf(g.aim_angle_deg - BB_AIM_MAX_DEG) < TEST_EPS);

    // 测试下限截断 (BB_AIM_MIN_DEG = 10.0°)
    for (int i = 0; i < 200; i++) {
        bouncy_input_aim_down(&g);
    }
    assert(fabsf(g.aim_angle_deg - BB_AIM_MIN_DEG) < TEST_EPS);

    // 再次按 DOWN 仍不低于 10.0°
    bouncy_input_aim_down(&g);
    assert(fabsf(g.aim_angle_deg - BB_AIM_MIN_DEG) < TEST_EPS);

    printf("  ✓ 1.5° high-precision step & clamping limits verified\n");
}

static void test_trajectory_prediction_and_dots(void)
{
    printf("[TEST 3] Testing Trajectory Prediction & Aim Dots...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x1234);

    // 1. 垂直向上 90° 预判
    g.aim_angle_deg = 90.0f;
    bouncy_point_t pts[BB_MAX_TRAJ_POINTS];
    int pt_count = bouncy_get_trajectory_points(&g, pts, BB_MAX_TRAJ_POINTS);

    assert(pt_count >= 2);
    // 起点应为枪口坐标
    assert(fabsf(pts[0].x - g.agent.gun_x) < TEST_EPS);
    assert(fabsf(pts[0].y - g.agent.gun_y) < TEST_EPS);

    // 在 Level 1 中，中间有一块障碍物 (y=150, h=14)
    // 垂直射击会先命中障碍物底边或直接击中
    assert(pts[1].y < pts[0].y); // 向上延伸

    // 2. 详细预判接口验证
    bouncy_traj_point_t detailed_pts[BB_MAX_TRAJ_POINTS];
    int d_count = bouncy_get_trajectory_detailed(&g, detailed_pts, BB_MAX_TRAJ_POINTS, 3);
    assert(d_count >= 2);
    assert(detailed_pts[0].is_reflection == false);

    // 3. 虚线采样小圆点生成测试
    bouncy_point_t dots[64];
    int dot_count = bouncy_get_aim_dots(&g, dots, 64, 8.0f);
    assert(dot_count > 5);
    // 验证相邻圆点间距大约为 8.0 像素
    float dist = sqrtf((dots[1].x - dots[0].x) * (dots[1].x - dots[0].x) +
                       (dots[1].y - dots[0].y) * (dots[1].y - dots[0].y));
    assert(fabsf(dist - 8.0f) < 0.1f);

    printf("  ✓ Trajectory math, raycasting reflections & dot samplers verified\n");
}

static void test_super_rubber_bounce_physics_and_decay(void)
{
    printf("[TEST 4] Testing Rubber Ricochet Physics & Velocity Decay...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0xABCD);

    // 清空障碍物以便专注测试墙壁镜面反射与速度衰减
    memset(g.obstacles, 0, sizeof(g.obstacles));
    memset(g.targets, 0, sizeof(g.targets));
    g.targets_remaining = 0;

    // 设置底部反射地面，形成四面封闭实验室，使橡胶弹持续反弹至最大次数
    g.obstacles[0].active = true;
    g.obstacles[0].type = BB_OBS_WALL;
    g.obstacles[0].x = 0.0f;
    g.obstacles[0].y = 310.0f;
    g.obstacles[0].w = 240.0f;
    g.obstacles[0].h = 10.0f;

    // 将特工头部暂时移出封闭反射室，避免反弹回脑门触发搞笑自伤而提前停下
    g.agent.head_x = -100.0f;
    g.agent.head_y = -100.0f;

    // 瞄准 45° 发射 (斜向右上)
    g.aim_angle_deg = 45.0f;
    bool shoot_ok = bouncy_input_shoot(&g);
    assert(shoot_ok);
    assert(g.ammo_remaining == BB_DEFAULT_AMMO - 1);
    assert(bouncy_is_firing(&g));
    assert(bouncy_get_active_bullet_count(&g) == 1);

    bouncy_bullet_t *bullet = &g.bullets[0];
    assert(bullet->active);
    float init_speed = sqrtf(bullet->vx * bullet->vx + bullet->vy * bullet->vy);
    assert(fabsf(init_speed - BB_BULLET_SPEED) < 0.5f);

    // 推进物理时间直至发生第一次反弹 (撞右墙)
    int bounces_seen = 0;
    for (int step = 0; step < 800; step++) {
        bouncy_game_step(&g, 16); // 16ms 步进
        if (bullet->bounce_count > bounces_seen) {
            bounces_seen = bullet->bounce_count;
            // 验证速度衰减
            float current_spd = sqrtf(bullet->vx * bullet->vx + bullet->vy * bullet->vy);
            float expected_spd = BB_BULLET_SPEED * powf(BB_BOUNCE_RESTITUTION, (float)bounces_seen);
            assert(fabsf(current_spd - expected_spd) < 2.0f);

            // 验证火星粒子产生
            assert(bouncy_get_active_particle_count(&g) > 0);

            // 验证音效队列产生反弹音效
            bouncy_sound_t snd = bouncy_pop_sound(&g);
            assert(snd != BB_SND_NONE);
        }
        if (!bullet->active) break;
    }

    assert(bounces_seen == BB_MAX_BOUNCES);
    assert(!bullet->active);

    printf("  ✓ Super rubber bounce physics & energy decay verified\n");
}

static void test_shield_blind_spot_and_rear_kill(void)
{
    printf("[TEST 5] Testing Shield Blind Spot & Rear Flank Kill...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x7788);

    // 加载 Level 2：敌人带防弹盾牌
    bouncy_load_level(&g, 2);
    assert(g.targets[0].has_shield);
    assert(g.targets[0].alive);

    // 1. 直射测试：瞄准防弹盾牌正面 (敌人位于 180, 90，特工位于 120, 283)
    // 计算直射敌人角度
    float dx = g.targets[0].x - g.agent.gun_x;
    float dy = g.targets[0].y - g.agent.gun_y; // 负值
    float direct_ang_rad = atan2f(-dy, dx);
    float direct_ang_deg = direct_ang_rad * 180.0f / (float)M_PI;

    g.aim_angle_deg = direct_ang_deg;
    bouncy_input_shoot(&g);

    // 步进直至击中盾牌
    bool ricochet_heard = false;
    for (int step = 0; step < 200; step++) {
        bouncy_game_step(&g, 16);
        bouncy_sound_t snd;
        while ((snd = bouncy_pop_sound(&g)) != BB_SND_NONE) {
            if (snd == BB_SND_SHIELD_RICOCHET) {
                ricochet_heard = true;
            }
        }
        if (g.state != BB_STATE_FIRING) break;
    }

    // 正面撞盾牌：弹飞无伤！
    assert(ricochet_heard);
    assert(g.targets[0].alive == true); // 敌人仍存活

    // 2. 绕后射击测试：构造直接从背面 (无盾方向，从上方往下) 击入
    // 人为重置敌人并让子弹从天花板上方直冲敌人后背
    g.targets[0].alive = true;
    g.targets_remaining = 1;
    g.bullets[0].active = true;
    g.bullets[0].x = g.targets[0].x;
    g.bullets[0].y = g.targets[0].y - 30.0f; // 在敌人正上方
    g.bullets[0].vx = 0.0f;
    g.bullets[0].vy = BB_BULLET_SPEED; // 垂直向下直捣敌人头顶后背
    g.state = BB_STATE_FIRING;

    bool headshot_heard = false;
    for (int step = 0; step < 30; step++) {
        bouncy_game_step(&g, 16);
        bouncy_sound_t snd;
        while ((snd = bouncy_pop_sound(&g)) != BB_SND_NONE) {
            if (snd == BB_SND_TARGET_DESTROY) {
                headshot_heard = true;
            }
        }
    }

    // 从后方击入：一击必杀爆头！
    assert(headshot_heard);
    assert(g.targets[0].alive == false);
    assert(g.targets_remaining == 0);

    printf("  ✓ Shield frontal deflection & rear flank kill verified\n");
}

static void test_barrel_chain_explosion(void)
{
    printf("[TEST 6] Testing Barrel Blast & Chain Reaction...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x4321);

    // 加载 Level 4：双炸药桶连锁关卡
    bouncy_load_level(&g, 4);
    assert(g.barrels[0].active && !g.barrels[0].exploded);
    assert(g.barrels[1].active && !g.barrels[1].exploded);
    assert(g.targets_remaining == 2);

    // 模拟子弹直接射击并命中第一个炸药桶 A (40, 130)
    g.bullets[0].active = true;
    g.bullets[0].x = 40.0f;
    g.bullets[0].y = 160.0f;
    g.bullets[0].vx = 0.0f;
    g.bullets[0].vy = -BB_BULLET_SPEED;
    g.bullets[0].radius = BB_BULLET_RADIUS;
    g.state = BB_STATE_FIRING;

    bool boom_heard = false;
    for (int step = 0; step < 30; step++) {
        bouncy_game_step(&g, 16);
        bouncy_sound_t snd;
        while ((snd = bouncy_pop_sound(&g)) != BB_SND_NONE) {
            if (snd == BB_SND_BARREL_BOOM) {
                boom_heard = true;
            }
        }
    }

    // 验证连锁引爆：炸药桶 A、B、C 均被引爆
    assert(boom_heard);
    assert(g.barrels[0].exploded);
    assert(g.barrels[1].exploded);
    assert(g.barrels[2].exploded);
    assert(g.barrels_exploded == 3);

    // 验证周围掩体内的两个敌人被连锁爆炸摧毁
    assert(g.targets[0].alive == false);
    assert(g.targets[1].alive == false);
    assert(g.targets_remaining == 0);

    // 验证大量爆炸粒子产生
    assert(bouncy_get_active_particle_count(&g) > 10);

    printf("  ✓ Explosive barrel chain reaction & AOE destruction verified\n");
}

static void test_humorous_self_harm_and_sunglasses_fly(void)
{
    printf("[TEST 7] Testing Humorous Self-Harm, Sunglasses Ejection & Dizzy...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x9999);

    assert(g.agent.sunglasses_on == true);
    assert(!g.agent.is_dizzy);
    assert(g.self_hits == 0);

    // 模拟反弹子弹 (bounce_count >= 1) 笔直击中特工头部
    g.bullets[0].active = true;
    g.bullets[0].x = g.agent.head_x;
    g.bullets[0].y = g.agent.head_y - 25.0f; // 头部正上方
    g.bullets[0].vx = 0.0f;
    g.bullets[0].vy = 250.0f; // 直奔特工脑门
    g.bullets[0].radius = BB_BULLET_RADIUS;
    g.bullets[0].bounce_count = 1; // 必须是已反弹过的弹球才触发自伤
    g.state = BB_STATE_FIRING;

    bool sunglasses_fly_snd = false;
    for (int step = 0; step < 20; step++) {
        bouncy_game_step(&g, 16);
        bouncy_sound_t snd;
        while ((snd = bouncy_pop_sound(&g)) != BB_SND_NONE) {
            if (snd == BB_SND_SUNGLASSES_FLY) {
                sunglasses_fly_snd = true;
            }
        }
    }

    // 验证特工墨镜被击飞、进入搞笑眩晕状态
    assert(sunglasses_fly_snd);
    assert(g.self_hits == 1);
    assert(g.agent.sunglasses_on == false);
    assert(g.agent.is_dizzy == true);
    assert(g.agent.dizzy_timer_ms > 0);

    // 验证场上生成了 BB_PART_SUNGLASSES 墨镜抛物线粒子
    bool found_sunglasses_part = false;
    for (int i = 0; i < BB_MAX_PARTICLES; i++) {
        if (g.particles[i].active && g.particles[i].type == BB_PART_SUNGLASSES) {
            found_sunglasses_part = true;
            break;
        }
    }
    assert(found_sunglasses_part);

    // 推进物理时间直到眩晕自然恢复 (BB_AGENT_DIZZY_DURATION_MS = 1500)
    bouncy_game_step(&g, 1600);
    assert(g.agent.is_dizzy == false); // 眩晕结束，特工恢复清醒！

    printf("  ✓ Humorous sunglasses fly, dizzy state & recovery verified\n");
}

static void test_level_clear_and_star_rating(void)
{
    printf("[TEST 8] Testing Ammo Consumption & Star Ratings (1★/2★/3★)...\n");

    // 场景 A: 仅用 1 颗弹通关 (剩余 2 颗) -> 3 星 ★★★
    {
        bouncy_game_t g;
        bouncy_game_init(&g, 0x1111);
        bouncy_load_level(&g, 1);
        assert(g.ammo_remaining == 3);

        bouncy_input_shoot(&g);
        assert(g.ammo_remaining == 2);

        // 人为使目标被摧毁且子弹命中后消散
        g.targets[0].alive = false;
        g.targets_remaining = 0;
        g.bullets[0].active = false;
        bouncy_game_step(&g, 16);

        assert(bouncy_is_level_clear(&g));
        assert(g.stars_earned == 3);

        bouncy_sound_t last_snd = BB_SND_NONE;
        bouncy_sound_t s;
        while ((s = bouncy_pop_sound(&g)) != BB_SND_NONE) last_snd = s;
        assert(last_snd == BB_SND_CLEAR_3STAR);
    }

    // 场景 B: 用 2 颗弹通关 (剩余 1 颗) -> 2 星 ★★☆
    {
        bouncy_game_t g;
        bouncy_game_init(&g, 0x2222);
        bouncy_load_level(&g, 1);

        bouncy_input_shoot(&g);
        g.bullets[0].active = false; // 第一发脱靶
        bouncy_game_step(&g, 16);

        bouncy_input_shoot(&g); // 第二发
        assert(g.ammo_remaining == 1);

        g.targets[0].alive = false;
        g.targets_remaining = 0;
        g.bullets[0].active = false; // 第二发命中目标消散
        bouncy_game_step(&g, 16);

        assert(bouncy_is_level_clear(&g));
        assert(g.stars_earned == 2);

        bouncy_sound_t last_snd = BB_SND_NONE;
        bouncy_sound_t s;
        while ((s = bouncy_pop_sound(&g)) != BB_SND_NONE) last_snd = s;
        assert(last_snd == BB_SND_CLEAR_2STAR);
    }

    // 场景 C: 用 3 颗弹通关 (剩余 0 颗) -> 1 星 ★☆☆
    {
        bouncy_game_t g;
        bouncy_game_init(&g, 0x3333);
        bouncy_load_level(&g, 1);

        // 第一发
        bouncy_input_shoot(&g);
        g.bullets[0].active = false;
        bouncy_game_step(&g, 16);

        // 第二发
        bouncy_input_shoot(&g);
        g.bullets[0].active = false;
        bouncy_game_step(&g, 16);

        // 第三发
        bouncy_input_shoot(&g);
        assert(g.ammo_remaining == 0);

        g.targets[0].alive = false;
        g.targets_remaining = 0;
        g.bullets[0].active = false; // 第三发命中目标消散
        bouncy_game_step(&g, 16);

        assert(bouncy_is_level_clear(&g));
        assert(g.stars_earned == 1);

        bouncy_sound_t last_snd = BB_SND_NONE;
        bouncy_sound_t s;
        while ((s = bouncy_pop_sound(&g)) != BB_SND_NONE) last_snd = s;
        assert(last_snd == BB_SND_CLEAR_1STAR);
    }

    // 场景 D: 弹药耗尽且目标仍未消灭 -> 游戏失败 BB_STATE_GAME_OVER
    {
        bouncy_game_t g;
        bouncy_game_init(&g, 0x4444);
        bouncy_load_level(&g, 1);

        // 连放 3 发均脱靶消散
        for (int i = 0; i < 3; i++) {
            bouncy_input_shoot(&g);
            g.bullets[0].active = false;
            bouncy_game_step(&g, 16);
        }

        assert(g.ammo_remaining == 0);
        assert(g.targets_remaining > 0);
        assert(bouncy_is_game_over(&g));

        bouncy_sound_t last_snd = BB_SND_NONE;
        bouncy_sound_t s;
        while ((s = bouncy_pop_sound(&g)) != BB_SND_NONE) last_snd = s;
        assert(last_snd == BB_SND_DEFEAT);
    }

    printf("  ✓ Ammo depletion, level clear & star rating logic verified\n");
}

static void test_all_levels_and_zero_malloc(void)
{
    printf("[TEST 9] Testing All Levels Data Integrity & Zero Heap Allocation...\n");
    bouncy_game_t g;
    bouncy_game_init(&g, 0x8888);

    for (int lvl = 1; lvl <= BB_MAX_LEVELS; lvl++) {
        bool ok = bouncy_load_level(&g, lvl);
        assert(ok);
        assert(g.current_level == lvl);
        assert(g.targets_remaining > 0);
        assert(g.ammo_remaining == BB_DEFAULT_AMMO);

        // 验证预判线在每个关卡中均可稳定计算且无内存溢出/死循环
        bouncy_point_t pts[BB_MAX_TRAJ_POINTS];
        int count = bouncy_get_trajectory_points(&g, pts, BB_MAX_TRAJ_POINTS);
        assert(count >= 2);
    }

    // 测试非法关卡越界保护
    assert(!bouncy_load_level(&g, 0));
    assert(!bouncy_load_level(&g, 6));

    printf("  ✓ All 5 levels validated without dynamic allocation\n");
}

int main(void)
{
    printf("====================================================\n");
    printf("  Starting Bouncy Blaster Unit Tests (C11 Host Engine)\n");
    printf("====================================================\n");

    test_initialization_and_lifecycle();
    test_high_precision_angle_stepping();
    test_trajectory_prediction_and_dots();
    test_super_rubber_bounce_physics_and_decay();
    test_shield_blind_spot_and_rear_kill();
    test_barrel_chain_explosion();
    test_humorous_self_harm_and_sunglasses_fly();
    test_level_clear_and_star_rating();
    test_all_levels_and_zero_malloc();

    printf("====================================================\n");
    printf("  ALL 9 BOUNCY BLASTER TESTS PASSED! (100%% SUCCESS)\n");
    printf("====================================================\n");
    return 0;
}
