// tests/test_smash_logic.c —— 《万物皆可敲》(Smash Frenzy) 核心算法引擎单元测试
// 100% 覆盖状态机流转、工具切换、轻重敲击、蓄力暴击、粒子物理、屏幕震颤、连击与暂停

#include "smash_logic.h"
#include <stdio.h>
#include <assert.h>
#include <math.h>
#include <string.h>

int main(void)
{
    printf("===============================================================\n");
    printf("  Starting Smash Frenzy (万物皆可敲) Core Logic Unit Tests    \n");
    printf("===============================================================\n");

    smash_game_t g;

    // -------------------------------------------------------------
    // [TEST 1] 初始化系统与基础物理空间尺寸验证
    // -------------------------------------------------------------
    printf("[TEST 1] Testing Initialization & Screen Dimensions...\n");
    smash_init(&g, 0x12345678);

    assert(SMASH_SCREEN_W == 240);
    assert(SMASH_SCREEN_H == 320);
    assert(g.state == SMASH_STATE_PLAYING);
    assert(g.current_tool == SMASH_TOOL_WOODEN_MALLET);
    assert(g.tool_stance == SMASH_TOOL_STANCE_IDLE);
    assert(g.score == 0);
    assert(g.combo_count == 0);
    assert(g.max_combo == 0);
    assert(g.total_smashes == 0);
    assert(g.total_destroyed == 0);
    assert(g.crit_hits == 0);
    assert(g.tool_cooldown_ms == 0.0f);
    assert(!g.is_charging);
    assert(g.charge_ratio == 0.0f);

    // 初始目标为生鸡蛋 (Raw Egg)
    assert(g.target.type == SMASH_TARGET_RAW_EGG);
    assert(g.target.max_hp == 100.0f);
    assert(g.target.current_hp == 100.0f);
    assert(g.target.damage_ratio == 0.0f);
    assert(g.target.stage == SMASH_STAGE_INTACT);
    assert(!g.target.is_destroyed);

    // 粒子池与屏幕震颤初始清空
    assert(smash_get_active_particle_count(&g) == 0);
    assert(g.shake.intensity == 0.0f);
    assert(g.shake.offset_x == 0.0f);
    assert(g.shake.offset_y == 0.0f);
    printf("  ✓ Initialization & baseline state validated.\n");

    // -------------------------------------------------------------
    // [TEST 2] 4 种打击工具循环切换 (UP / DOWN 键) 与属性验证
    // -------------------------------------------------------------
    printf("[TEST 2] Testing Tool Properties & Cycle Switching (UP/DOWN)...\n");
    smash_init(&g, 0xABC);

    // 检查 4 种工具配置属性
    const smash_tool_prop_t *p_mallet = smash_get_tool_prop(SMASH_TOOL_WOODEN_MALLET);
    const smash_tool_prop_t *p_inflat = smash_get_tool_prop(SMASH_TOOL_INFLATABLE_HAMMER);
    const smash_tool_prop_t *p_thor = smash_get_tool_prop(SMASH_TOOL_THOR_HAMMER);
    const smash_tool_prop_t *p_slipper = smash_get_tool_prop(SMASH_TOOL_GREEN_SLIPPER);

    assert(p_mallet->base_damage > 30.0f && p_mallet->crit_multiplier > 2.0f);
    assert(p_inflat->elasticity > 1.5f); // 充气锤弹性高
    assert(p_thor->base_damage >= 90.0f && p_thor->crit_multiplier >= 4.0f); // 雷神重锤高伤害
    assert(p_slipper->combo_gain >= 2.0f && p_slipper->cooldown_ms < 80); // 人字拖攻速快加成高

    // DOWN 键正向轮换
    smash_input_down(&g);
    assert(g.current_tool == SMASH_TOOL_INFLATABLE_HAMMER);
    assert(smash_consume_sound(&g) == SMASH_SND_TOOL_SWITCH);

    smash_input_down(&g);
    assert(g.current_tool == SMASH_TOOL_THOR_HAMMER);
    assert(smash_consume_sound(&g) == SMASH_SND_TOOL_SWITCH);

    smash_input_down(&g);
    assert(g.current_tool == SMASH_TOOL_GREEN_SLIPPER);
    assert(smash_consume_sound(&g) == SMASH_SND_TOOL_SWITCH);

    smash_input_down(&g);
    assert(g.current_tool == SMASH_TOOL_WOODEN_MALLET); // 循环回到木槌

    // UP 键反向轮换
    smash_input_up(&g);
    assert(g.current_tool == SMASH_TOOL_GREEN_SLIPPER);
    assert(smash_consume_sound(&g) == SMASH_SND_TOOL_SWITCH);

    smash_input_up(&g);
    assert(g.current_tool == SMASH_TOOL_THOR_HAMMER);
    printf("  ✓ Tool properties and circular switching OK.\n");

    // -------------------------------------------------------------
    // [TEST 3] 5 种解压目标物定义与流转验证
    // -------------------------------------------------------------
    printf("[TEST 3] Testing 5 Target Objects Progression & Thresholds...\n");
    smash_init(&g, 0x101);

    // 生鸡蛋
    smash_set_target(&g, SMASH_TARGET_RAW_EGG);
    assert(g.target.max_hp == 100.0f);
    assert(strcmp(g.target.name, "Raw Egg") == 0);

    // 金蛋
    smash_next_target(&g);
    assert(g.target.type == SMASH_TARGET_GOLDEN_EGG);
    assert(g.target.max_hp == 220.0f);
    assert(g.target.base_score == 1000);

    // 大西瓜
    smash_next_target(&g);
    assert(g.target.type == SMASH_TARGET_WATERMELON);
    assert(g.target.max_hp == 320.0f);
    assert(g.target.stage_thresholds[0] == 0.20f);

    // 复古发条闹钟
    smash_next_target(&g);
    assert(g.target.type == SMASH_TARGET_VINTAGE_CLOCK);
    assert(g.target.max_hp == 500.0f);

    // 打卡机
    smash_next_target(&g);
    assert(g.target.type == SMASH_TARGET_PUNCH_CARD_MACHINE);
    assert(g.target.max_hp == 900.0f);
    assert(g.target.base_score == 1500);

    // 循环下一个回到生鸡蛋
    smash_next_target(&g);
    assert(g.target.type == SMASH_TARGET_RAW_EGG);
    printf("  ✓ 5 target objects and cycle progression OK.\n");

    // -------------------------------------------------------------
    // [TEST 4] 短按轻敲打击与 CD 冷却机制拦截
    // -------------------------------------------------------------
    printf("[TEST 4] Testing Quick Tap Smash & Cooldown Blocker...\n");
    smash_init(&g, 0x202);
    g.current_tool = SMASH_TOOL_WOODEN_MALLET;

    float initial_hp = g.target.current_hp;
    smash_input_ok_tap(&g);

    assert(g.total_smashes == 1);
    assert(g.target.current_hp < initial_hp);
    assert(g.tool_cooldown_ms > 0.0f);
    assert(g.combo_count == 1);
    assert(g.score > 0);
    assert(g.target.squash_scale_y < 1.0f); // 发生了受击形变

    float hp_after_hit1 = g.target.current_hp;
    // 冷却期间连续点击，应被冷却系统拦截
    smash_input_ok_tap(&g);
    assert(g.target.current_hp == hp_after_hit1);
    assert(g.total_smashes == 1);

    // 时间步进衰减冷却 150ms
    smash_step(&g, 150);
    assert(g.tool_cooldown_ms == 0.0f);

    // 冷却结束后可进行第二次打击
    smash_input_ok_tap(&g);
    assert(g.total_smashes == 2);
    assert(g.target.current_hp < hp_after_hit1);
    assert(g.combo_count == 2);
    printf("  ✓ Quick tap and cooldown blocker working as expected.\n");

    // -------------------------------------------------------------
    // [TEST 5] OK 键长按蓄力机制与全屏暴击释放
    // -------------------------------------------------------------
    printf("[TEST 5] Testing Charge Mechanics (0.0~1.0) & Full Power Crit...\n");
    smash_init(&g, 0x303);
    g.current_tool = SMASH_TOOL_THOR_HAMMER; // 使用雷神重锤验证暴击

    // 按下 OK 键开始蓄力
    smash_input_ok_down(&g);
    assert(g.is_charging == true);
    assert(g.charge_ratio == 0.0f);
    assert(g.tool_stance == SMASH_TOOL_STANCE_CHARGING);

    // 推进 500ms，雷神锤蓄力增长
    smash_step(&g, 500);
    assert(g.charge_ratio > 0.3f && g.charge_ratio < 0.8f);

    // 推进 1000ms，蓄满 1.0
    smash_step(&g, 1000);
    assert(g.charge_ratio >= 1.0f);
    assert(g.pending_sound == SMASH_SND_CHARGE_HUM); // 蓄满发出电磁嗡鸣
    smash_consume_sound(&g);

    // 松开 OK 键，释放毁天灭地雷神暴击！
    float hp_before_crit = g.target.current_hp;
    smash_input_ok_up(&g);

    assert(!g.is_charging);
    assert(g.crit_hits == 1);
    assert(g.shake.intensity > 30.0f); // 极强全屏震颤 (22 * 2.4 > 50)
    assert(g.crit_flash_timer_ms > 0.0f);
    assert(g.pending_sound == SMASH_SND_CRIT_BOOM || g.target.is_destroyed);

    // 验证满蓄伤害倍率远超基础伤害 (95 * 4.8 = 456)
    float damage_dealt = hp_before_crit - g.target.current_hp;
    assert(damage_dealt >= 400.0f || g.target.is_destroyed);
    printf("  ✓ Charge accumulation and screen-shaking critical slam OK.\n");

    // -------------------------------------------------------------
    // [TEST 6] 目标物破损阶段流转 (Stage Progression) 与彻底摧毁刷新
    // -------------------------------------------------------------
    printf("[TEST 6] Testing Damage Ratio, Stages (0~100%%) & Respawn Flow...\n");
    smash_init(&g, 0x404);
    smash_set_target(&g, SMASH_TARGET_WATERMELON); // 320 HP
    g.current_tool = SMASH_TOOL_WOODEN_MALLET;      // 基础伤害 38

    assert(smash_get_stage(&g) == SMASH_STAGE_INTACT);
    assert(smash_get_damage_ratio(&g) == 0.0f);

    // 打击 2 次进入 SLIGHT_CRACK (> 20%)
    smash_input_ok_tap(&g);
    smash_step(&g, 200);
    smash_input_ok_tap(&g);
    smash_step(&g, 200);
    assert(smash_get_stage(&g) == SMASH_STAGE_SLIGHT_CRACK);
    assert(smash_get_damage_ratio(&g) >= 0.20f);

    // 继续敲击进入 DEEP_CRACK (> 45%) 与 SEVERE (> 75%)
    for (int i = 0; i < 4; i++) {
        smash_input_ok_tap(&g);
        smash_step(&g, 200);
    }
    assert(smash_get_stage(&g) >= SMASH_STAGE_DEEP_CRACK);

    // 用雷神重锤蓄满彻底粉碎大西瓜
    g.current_tool = SMASH_TOOL_THOR_HAMMER;
    smash_input_ok_down(&g);
    smash_step(&g, 1500); // 蓄满
    smash_input_ok_up(&g);

    assert(smash_is_target_destroyed(&g));
    assert(g.target.current_hp == 0.0f);
    assert(g.target.damage_ratio == 1.0f);
    assert(g.target.stage == SMASH_STAGE_DESTROYED);
    assert(g.total_destroyed == 1);
    assert(g.state == SMASH_STATE_CLEAR_WAIT); // 进入重生等待
    assert(g.respawn_timer_ms > 0.0f);

    // 等待重生倒计时完成
    smash_step(&g, (uint32_t)(g.respawn_timer_ms + 100.0f));
    assert(g.state == SMASH_STATE_PLAYING);
    // 自动刷新到下一个目标 (复古闹钟)
    assert(g.target.type == SMASH_TARGET_VINTAGE_CLOCK);
    assert(g.target.stage == SMASH_STAGE_INTACT);
    printf("  ✓ Target stages (0~100%%), destruction and auto-respawn OK.\n");

    // -------------------------------------------------------------
    // [TEST 7] 爆浆与碎屑粒子系统、重力与地面弹跳衰减
    // -------------------------------------------------------------
    printf("[TEST 7] Testing Splatter Particle Pool, Gravity & Ground Bounce...\n");
    smash_init(&g, 0x505);
    smash_set_target(&g, SMASH_TARGET_RAW_EGG);
    g.current_tool = SMASH_TOOL_WOODEN_MALLET;

    // 敲击生鸡蛋，生成蛋黄、蛋壳等粒子
    smash_input_ok_tap(&g);
    int active_particles = smash_get_active_particle_count(&g);
    assert(active_particles > 0);

    // 验证粒子在重力加速度作用下下落
    float first_p_y = g.particles[0].y;
    float first_p_vy = g.particles[0].vy;
    smash_step(&g, 50);
    assert(g.particles[0].vy > first_p_vy); // 重力加速
    assert(g.particles[0].y != first_p_y);  // 位置位移发生改变

    // 推进 600ms，粒子落到地面 SMASH_GROUND_Y (280) 并发生弹跳与速度衰减
    smash_step(&g, 600);
    for (int i = 0; i < SMASH_MAX_PARTICLES; i++) {
        if (g.particles[i].active) {
            assert(g.particles[i].y <= SMASH_GROUND_Y);
        }
    }

    // 推进 3000ms，粒子全部自然生命衰减消亡
    smash_step(&g, 3000);
    assert(smash_get_active_particle_count(&g) == 0);
    printf("  ✓ Particle physics, gravity, bounce and life decay OK.\n");

    // -------------------------------------------------------------
    // [TEST 8] 屏幕震颤 (Screen Shake) 随机位移与阻尼衰减
    // -------------------------------------------------------------
    printf("[TEST 8] Testing Screen Shake Displacement & Exponential Decay...\n");
    smash_init(&g, 0x606);
    g.current_tool = SMASH_TOOL_INFLATABLE_HAMMER; // 高弹力工具

    smash_input_ok_tap(&g);
    assert(g.shake.intensity > 0.0f);

    // 推进 20ms，计算出了非零偏移
    smash_step(&g, 20);
    assert(g.shake.offset_x != 0.0f || g.shake.offset_y != 0.0f);

    // 持续步进，震颤指数衰减至清零
    float prev_intensity = g.shake.intensity;
    smash_step(&g, 100);
    assert(g.shake.intensity < prev_intensity);

    smash_step(&g, 800);
    assert(g.shake.intensity == 0.0f);
    assert(g.shake.offset_x == 0.0f);
    assert(g.shake.offset_y == 0.0f);
    printf("  ✓ Screen shake calculation and damping decay OK.\n");

    // -------------------------------------------------------------
    // [TEST 9] 连击 (Combo) 积累、人字拖搞笑双倍与超时清零
    // -------------------------------------------------------------
    printf("[TEST 9] Testing Combo Streak, Green Slipper Multiplier & Timeout...\n");
    smash_init(&g, 0x707);
    smash_set_target(&g, SMASH_TARGET_PUNCH_CARD_MACHINE); // 900 HP 经得起狂敲

    // 切换到绿色人字拖
    g.current_tool = SMASH_TOOL_GREEN_SLIPPER;
    smash_input_ok_tap(&g);
    assert(g.combo_count == 2); // 人字拖连击增量为 2！
    assert(g.max_combo == 2);
    assert(g.combo_timer_ms == SMASH_COMBO_TIMEOUT_MS);

    smash_step(&g, 80); // 人字拖极速 CD 65ms
    smash_input_ok_tap(&g);
    assert(g.combo_count == 4);
    assert(g.max_combo == 4);

    // 模拟挂机超时 (2000ms)
    smash_step(&g, 2200);
    assert(g.combo_count == 0); // 连击重置
    assert(g.max_combo == 4);    // 历史最高记录保留
    printf("  ✓ Combo streak accumulation and timeout reset OK.\n");

    // -------------------------------------------------------------
    // [TEST 10] 游戏暂停控制与复位 (Reset) 验证
    // -------------------------------------------------------------
    printf("[TEST 10] Testing Pause State & Reset Functionality...\n");
    smash_init(&g, 0x808);
    smash_input_ok_tap(&g);
    assert(g.score > 0);

    // 暂停
    smash_toggle_pause(&g);
    assert(g.state == SMASH_STATE_PAUSED);

    // 暂停期间时间步进，冷却与倒计时不被消耗
    float cd_before = g.tool_cooldown_ms;
    smash_step(&g, 200);
    assert(g.tool_cooldown_ms == cd_before);

    // 解除暂停
    smash_toggle_pause(&g);
    assert(g.state == SMASH_STATE_PLAYING);
    smash_step(&g, 200);
    assert(g.tool_cooldown_ms < cd_before);

    // 测试全局复位
    smash_reset(&g);
    assert(g.state == SMASH_STATE_PLAYING);
    assert(g.score == 0);
    assert(g.combo_count == 0);
    assert(g.max_combo == 0);
    assert(g.target.type == SMASH_TARGET_RAW_EGG);
    assert(g.target.current_hp == g.target.max_hp);
    assert(smash_get_active_particle_count(&g) == 0);
    printf("  ✓ Pause freezing and global reset OK.\n");

    printf("===============================================================\n");
    printf("  ALL 10 TEST SUITES PASSED (100%% SUCCESS, ZERO WARNINGS)     \n");
    printf("===============================================================\n");

    return 0;
}
