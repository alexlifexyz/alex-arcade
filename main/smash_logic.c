// main/smash_logic.c —— 《万物皆可敲》(Smash Frenzy) 核心算法与状态机实现
// 专为 ESP32-C3 打造的纯 C11 引擎：零 malloc/free、无硬件依赖、物理粒子池与屏幕震颤。

#include "smash_logic.h"
#include <string.h>
#include <math.h>

// 默认震颤衰减系数
#define SMASH_SHAKE_DECAY_RATE       14.0f

// 目标物静态初始属性模板表 (5种趣味解压物品)
static const smash_target_t s_target_templates[SMASH_TARGET_COUNT] = {
    [SMASH_TARGET_RAW_EGG] = {
        .type = SMASH_TARGET_RAW_EGG,
        .name = "Raw Egg",
        .max_hp = 100.0f,
        .current_hp = 100.0f,
        .damage_ratio = 0.0f,
        .stage = SMASH_STAGE_INTACT,
        .stage_thresholds = { 0.25f, 0.55f, 0.85f, 1.0f },
        .is_destroyed = false,
        .base_score = 300,
        .x = SMASH_TARGET_CENTER_X,
        .y = SMASH_TARGET_CENTER_Y,
        .w = 54.0f,
        .h = 68.0f,
        .wobble_angle = 0.0f,
        .squash_scale_y = 1.0f
    },
    [SMASH_TARGET_GOLDEN_EGG] = {
        .type = SMASH_TARGET_GOLDEN_EGG,
        .name = "Golden Egg",
        .max_hp = 220.0f,
        .current_hp = 220.0f,
        .damage_ratio = 0.0f,
        .stage = SMASH_STAGE_INTACT,
        .stage_thresholds = { 0.25f, 0.50f, 0.80f, 1.0f },
        .is_destroyed = false,
        .base_score = 1000,
        .x = SMASH_TARGET_CENTER_X,
        .y = SMASH_TARGET_CENTER_Y,
        .w = 54.0f,
        .h = 68.0f,
        .wobble_angle = 0.0f,
        .squash_scale_y = 1.0f
    },
    [SMASH_TARGET_WATERMELON] = {
        .type = SMASH_TARGET_WATERMELON,
        .name = "Big Watermelon",
        .max_hp = 320.0f,
        .current_hp = 320.0f,
        .damage_ratio = 0.0f,
        .stage = SMASH_STAGE_INTACT,
        .stage_thresholds = { 0.20f, 0.45f, 0.75f, 1.0f },
        .is_destroyed = false,
        .base_score = 600,
        .x = SMASH_TARGET_CENTER_X,
        .y = SMASH_TARGET_CENTER_Y,
        .w = 80.0f,
        .h = 80.0f,
        .wobble_angle = 0.0f,
        .squash_scale_y = 1.0f
    },
    [SMASH_TARGET_VINTAGE_CLOCK] = {
        .type = SMASH_TARGET_VINTAGE_CLOCK,
        .name = "Vintage Clock",
        .max_hp = 500.0f,
        .current_hp = 500.0f,
        .damage_ratio = 0.0f,
        .stage = SMASH_STAGE_INTACT,
        .stage_thresholds = { 0.30f, 0.60f, 0.85f, 1.0f },
        .is_destroyed = false,
        .base_score = 850,
        .x = SMASH_TARGET_CENTER_X,
        .y = SMASH_TARGET_CENTER_Y,
        .w = 72.0f,
        .h = 76.0f,
        .wobble_angle = 0.0f,
        .squash_scale_y = 1.0f
    },
    [SMASH_TARGET_PUNCH_CARD_MACHINE] = {
        .type = SMASH_TARGET_PUNCH_CARD_MACHINE,
        .name = "Punch Card Machine",
        .max_hp = 900.0f,
        .current_hp = 900.0f,
        .damage_ratio = 0.0f,
        .stage = SMASH_STAGE_INTACT,
        .stage_thresholds = { 0.20f, 0.50f, 0.75f, 1.0f },
        .is_destroyed = false,
        .base_score = 1500,
        .x = SMASH_TARGET_CENTER_X,
        .y = SMASH_TARGET_CENTER_Y,
        .w = 84.0f,
        .h = 92.0f,
        .wobble_angle = 0.0f,
        .squash_scale_y = 1.0f
    }
};

// 4 种打击工具静态配置表
static const smash_tool_prop_t s_tool_props[SMASH_TOOL_COUNT] = {
    [SMASH_TOOL_WOODEN_MALLET] = {
        .type = SMASH_TOOL_WOODEN_MALLET,
        .name = "Wooden Mallet",
        .base_damage = 38.0f,
        .crit_multiplier = 2.8f,
        .cooldown_ms = 110,
        .combo_gain = 1.0f,
        .combo_score_mult = 1.0f,
        .elasticity = 1.0f,
        .charge_rate = 1.3f
    },
    [SMASH_TOOL_INFLATABLE_HAMMER] = {
        .type = SMASH_TOOL_INFLATABLE_HAMMER,
        .name = "Inflatable Hammer",
        .base_damage = 22.0f,
        .crit_multiplier = 2.2f,
        .cooldown_ms = 90,
        .combo_gain = 1.5f,
        .combo_score_mult = 1.3f,
        .elasticity = 1.9f,
        .charge_rate = 1.6f
    },
    [SMASH_TOOL_THOR_HAMMER] = {
        .type = SMASH_TOOL_THOR_HAMMER,
        .name = "Thor Hammer",
        .base_damage = 95.0f,
        .crit_multiplier = 4.8f,
        .cooldown_ms = 300,
        .combo_gain = 1.0f,
        .combo_score_mult = 1.5f,
        .elasticity = 2.4f,
        .charge_rate = 0.85f
    },
    [SMASH_TOOL_GREEN_SLIPPER] = {
        .type = SMASH_TOOL_GREEN_SLIPPER,
        .name = "Green Slipper",
        .base_damage = 18.0f,
        .crit_multiplier = 2.0f,
        .cooldown_ms = 65,
        .combo_gain = 2.0f,
        .combo_score_mult = 2.0f,
        .elasticity = 0.8f,
        .charge_rate = 2.4f
    }
};

// 内部伪随机发生器 (LCG)
static inline uint32_t smash_rand(smash_game_t *g)
{
    g->rng_state = g->rng_state * 1664525u + 1013904223u;
    return g->rng_state;
}

static inline float smash_rand_float(smash_game_t *g, float min, float max)
{
    uint32_t r = smash_rand(g) & 0xFFFF;
    return min + ((float)r / 65535.0f) * (max - min);
}

// 触发音频事件
static inline void smash_trigger_sound(smash_game_t *g, smash_sound_t snd)
{
    g->pending_sound = snd;
    g->sound_seq++;
}

// 静态工具属性查询
const smash_tool_prop_t* smash_get_tool_prop(smash_tool_type_t tool)
{
    if (tool >= SMASH_TOOL_COUNT) {
        return &s_tool_props[SMASH_TOOL_WOODEN_MALLET];
    }
    return &s_tool_props[tool];
}

// 粒子发射到静态对象池
void smash_emit_particle(smash_game_t *game, smash_part_type_t type,
                        float x, float y, float vx, float vy,
                        float size, uint32_t color, float bounce, float gravity)
{
    for (int i = 0; i < SMASH_MAX_PARTICLES; i++) {
        if (!game->particles[i].active) {
            smash_particle_t *p = &game->particles[i];
            p->active = true;
            p->type = type;
            p->x = x;
            p->y = y;
            p->vx = vx;
            p->vy = vy;
            p->gravity = gravity;
            p->bounce = bounce;
            p->life = 1.0f;
            p->decay = smash_rand_float(game, 1.2f, 2.5f);
            p->size = size;
            p->rot_deg = smash_rand_float(game, 0.0f, 360.0f);
            p->rot_speed = smash_rand_float(game, -360.0f, 360.0f);
            p->color = color;
            break;
        }
    }
}

// 专属特效发射器
static void smash_spawn_egg_particles(smash_game_t *g, float x, float y, int count, bool is_golden)
{
    uint32_t yolk_color = is_golden ? 0xFFD700 : 0xFFA500;
    uint32_t shell_color = is_golden ? 0xDAA520 : 0xFDF5E6;

    for (int i = 0; i < count; i++) {
        float angle = smash_rand_float(g, 0.0f, 6.283185f);
        float speed = smash_rand_float(g, 40.0f, 220.0f);
        float vx = cosf(angle) * speed;
        float vy = sinf(angle) * speed - 60.0f; // 向上爆起

        int r = (int)(smash_rand(g) % 3);
        if (r == 0) {
            // 蛋黄液滴：粘稠流淌、低弹跳
            smash_emit_particle(g, SMASH_PART_EGG_YOLK, x, y, vx * 0.7f, vy * 0.8f,
                                smash_rand_float(g, 4.0f, 7.0f), yolk_color, 0.12f, 750.0f);
        } else if (r == 1) {
            // 蛋清：微滴
            smash_emit_particle(g, SMASH_PART_EGG_WHITE, x, y, vx * 0.9f, vy * 0.9f,
                                smash_rand_float(g, 2.5f, 4.5f), 0xFFFFFF, 0.10f, 650.0f);
        } else {
            // 蛋壳碎屑：自转弹跳
            smash_emit_particle(g, SMASH_PART_EGG_SHELL, x, y, vx * 1.2f, vy * 1.1f,
                                smash_rand_float(g, 3.0f, 5.5f), shell_color, 0.45f, 850.0f);
        }
    }
}

static void smash_spawn_melon_particles(smash_game_t *g, float x, float y, int count)
{
    for (int i = 0; i < count; i++) {
        float angle = smash_rand_float(g, 0.0f, 6.283185f);
        float speed = smash_rand_float(g, 60.0f, 260.0f);
        float vx = cosf(angle) * speed;
        float vy = sinf(angle) * speed - 80.0f;

        int r = (int)(smash_rand(g) % 4);
        if (r <= 1) {
            // 鲜红西瓜汁爆浆
            smash_emit_particle(g, SMASH_PART_MELON_JUICE, x, y, vx, vy,
                                smash_rand_float(g, 3.5f, 6.5f), 0xFF1443, 0.15f, 600.0f);
        } else if (r == 2) {
            // 黑色西瓜籽
            smash_emit_particle(g, SMASH_PART_MELON_SEED, x, y, vx * 1.1f, vy * 1.2f,
                                smash_rand_float(g, 2.0f, 3.5f), 0x1A1A1A, 0.50f, 800.0f);
        } else {
            // 翠绿西瓜皮
            smash_emit_particle(g, SMASH_PART_CHIP, x, y, vx * 0.8f, vy * 0.9f,
                                smash_rand_float(g, 4.0f, 7.0f), 0x228B22, 0.35f, 750.0f);
        }
    }
}

static void smash_spawn_clock_particles(smash_game_t *g, float x, float y, int count)
{
    for (int i = 0; i < count; i++) {
        float angle = smash_rand_float(g, 0.0f, 6.283185f);
        float speed = smash_rand_float(g, 80.0f, 280.0f);
        float vx = cosf(angle) * speed;
        float vy = sinf(angle) * speed - 100.0f;

        int r = (int)(smash_rand(g) % 3);
        if (r == 0) {
            // 黄铜齿轮
            smash_emit_particle(g, SMASH_PART_GEAR, x, y, vx, vy,
                                smash_rand_float(g, 5.0f, 8.0f), 0xDAA520, 0.60f, 900.0f);
        } else if (r == 1) {
            // 螺旋弹簧 (极具弹性)
            smash_emit_particle(g, SMASH_PART_SPRING, x, y, vx * 1.2f, vy * 1.3f,
                                smash_rand_float(g, 4.0f, 6.0f), 0xC0C0C0, 0.75f, 850.0f);
        } else {
            // 表盘玻璃碎屑
            smash_emit_particle(g, SMASH_PART_CHIP, x, y, vx * 0.9f, vy * 0.8f,
                                smash_rand_float(g, 2.5f, 4.5f), 0xE0FFFF, 0.40f, 800.0f);
        }
    }
}

static void smash_spawn_punch_particles(smash_game_t *g, float x, float y, int count)
{
    for (int i = 0; i < count; i++) {
        float angle = smash_rand_float(g, 0.0f, 6.283185f);
        float speed = smash_rand_float(g, 90.0f, 300.0f);
        float vx = cosf(angle) * speed;
        float vy = sinf(angle) * speed - 110.0f;

        int r = (int)(smash_rand(g) % 3);
        if (r == 0) {
            // 电子芯片与按键外壳
            smash_emit_particle(g, SMASH_PART_CHIP, x, y, vx, vy,
                                smash_rand_float(g, 4.0f, 7.5f), 0x2E3440, 0.40f, 850.0f);
        } else if (r == 1) {
            // 绿色电路板残片
            smash_emit_particle(g, SMASH_PART_CHIP, x, y, vx * 0.8f, vy * 0.9f,
                                smash_rand_float(g, 3.5f, 6.0f), 0x2E8B57, 0.45f, 800.0f);
        } else {
            // 电火花
            smash_emit_particle(g, SMASH_PART_SPARK, x, y, vx * 1.3f, vy * 1.3f,
                                smash_rand_float(g, 2.0f, 3.5f), 0x00E5FF, 0.10f, 400.0f);
        }
    }
}

static void smash_spawn_tool_particles(smash_game_t *g, smash_tool_type_t tool, float x, float y)
{
    if (tool == SMASH_TOOL_INFLATABLE_HAMMER) {
        // 爱心微粒漂浮
        for (int i = 0; i < 4; i++) {
            float vx = smash_rand_float(g, -35.0f, 35.0f);
            float vy = smash_rand_float(g, -80.0f, -40.0f);
            smash_emit_particle(g, SMASH_PART_HEART, x, y, vx, vy,
                                smash_rand_float(g, 5.0f, 8.0f), 0xFF69B4, 0.0f, -30.0f); // 向上升腾
        }
    } else if (tool == SMASH_TOOL_THOR_HAMMER) {
        // 雷神重锤电弧
        for (int i = 0; i < 6; i++) {
            float vx = smash_rand_float(g, -120.0f, 120.0f);
            float vy = smash_rand_float(g, -120.0f, 120.0f);
            smash_emit_particle(g, SMASH_PART_SPARK, x, y, vx, vy,
                                smash_rand_float(g, 2.5f, 4.0f), 0x76FF03, 0.0f, 100.0f);
        }
    }
}

static void smash_spawn_target_debris(smash_game_t *g, smash_target_type_t type,
                                      float x, float y, int count)
{
    switch (type) {
    case SMASH_TARGET_RAW_EGG:
        smash_spawn_egg_particles(g, x, y, count, false);
        break;
    case SMASH_TARGET_GOLDEN_EGG:
        smash_spawn_egg_particles(g, x, y, count, true);
        break;
    case SMASH_TARGET_WATERMELON:
        smash_spawn_melon_particles(g, x, y, count);
        break;
    case SMASH_TARGET_VINTAGE_CLOCK:
        smash_spawn_clock_particles(g, x, y, count);
        break;
    case SMASH_TARGET_PUNCH_CARD_MACHINE:
        smash_spawn_punch_particles(g, x, y, count);
        break;
    default:
        break;
    }
}

// 根据当前破损比例更新阶段
static void smash_update_target_stage(smash_game_t *g)
{
    smash_target_t *t = &g->target;
    smash_stage_t old_stage = t->stage;

    if (t->current_hp <= 0.0f || t->damage_ratio >= 1.0f) {
        t->stage = SMASH_STAGE_DESTROYED;
        t->is_destroyed = true;
    } else if (t->damage_ratio >= t->stage_thresholds[2]) {
        t->stage = SMASH_STAGE_SEVERE;
    } else if (t->damage_ratio >= t->stage_thresholds[1]) {
        t->stage = SMASH_STAGE_DEEP_CRACK;
    } else if (t->damage_ratio >= t->stage_thresholds[0]) {
        t->stage = SMASH_STAGE_SLIGHT_CRACK;
    } else {
        t->stage = SMASH_STAGE_INTACT;
    }

    // 若破裂阶段跃迁且未完全破坏，触发破壳/裂纹声音
    if (t->stage > old_stage && t->stage != SMASH_STAGE_DESTROYED) {
        if (t->type == SMASH_TARGET_RAW_EGG || t->type == SMASH_TARGET_GOLDEN_EGG) {
            smash_trigger_sound(g, SMASH_SND_CRACK);
        }
    }
}

// 触发敲击命中计算
static void smash_do_strike(smash_game_t *game, float charge_val)
{
    if (game->state != SMASH_STATE_PLAYING && game->state != SMASH_STATE_CLEAR_WAIT) {
        return;
    }

    // 仍在冷却中则丢弃打击
    if (game->tool_cooldown_ms > 0.0f) {
        return;
    }

    // 目标若已碎裂，仅挥空
    if (game->target.is_destroyed) {
        smash_trigger_sound(game, SMASH_SND_SWING);
        game->tool_cooldown_ms = (float)s_tool_props[game->current_tool].cooldown_ms;
        return;
    }

    const smash_tool_prop_t *prop = &s_tool_props[game->current_tool];
    bool is_crit = (charge_val >= 0.98f);

    // 基础伤害与蓄力加成
    float dmg_mult = 1.0f;
    if (is_crit) {
        dmg_mult = prop->crit_multiplier;
    } else if (charge_val > 0.05f) {
        dmg_mult = 1.0f + charge_val * (prop->crit_multiplier - 1.0f);
    }
    float final_damage = prop->base_damage * dmg_mult;

    // 连击统计
    game->total_smashes++;
    game->combo_count += (uint32_t)prop->combo_gain;
    if (game->combo_count > game->max_combo) {
        game->max_combo = game->combo_count;
    }
    game->combo_timer_ms = SMASH_COMBO_TIMEOUT_MS;

    // 达成 10/25/50 连击时播放里程碑激励音
    if (game->combo_count == 10 || game->combo_count == 25 || game->combo_count == 50) {
        smash_trigger_sound(game, SMASH_SND_COMBO_STREAK);
    }

    // 得分累加 (连击滚雪球机制)
    float combo_factor = 1.0f + ((float)game->combo_count * 0.05f);
    uint32_t gain_score = (uint32_t)(final_damage * combo_factor * prop->combo_score_mult);
    if (is_crit) {
        gain_score += 200;
        game->crit_hits++;
        game->crit_flash_timer_ms = 120.0f;
    }
    game->score += gain_score;

    // 扣除目标血量
    game->target.current_hp -= final_damage;
    if (game->target.current_hp < 0.0f) {
        game->target.current_hp = 0.0f;
    }
    game->target.damage_ratio = (game->target.max_hp - game->target.current_hp) / game->target.max_hp;

    // 受击物理挤压形变与晃动
    game->target.squash_scale_y = is_crit ? 0.58f : (0.85f - 0.2f * charge_val);
    float wobble_mag = (is_crit ? 28.0f : (10.0f + 18.0f * charge_val));
    game->target.wobble_angle = ((smash_rand(game) & 1) ? 1.0f : -1.0f) * wobble_mag;

    // 屏幕震颤激发
    float base_shake = is_crit ? 22.0f : (3.5f + 10.0f * charge_val);
    game->shake.intensity = base_shake * prop->elasticity;

    // 破裂阶段流转
    smash_update_target_stage(game);

    // 音效分发
    if (is_crit) {
        smash_trigger_sound(game, SMASH_SND_CRIT_BOOM);
    } else {
        // 根据工具特性与目标类型发出最逼真的 ASMR
        if (game->current_tool == SMASH_TOOL_INFLATABLE_HAMMER) {
            smash_trigger_sound(game, SMASH_SND_INFLATABLE_SQUEAK);
        } else if (game->current_tool == SMASH_TOOL_GREEN_SLIPPER) {
            smash_trigger_sound(game, SMASH_SND_SLIPPER_SLAP);
        } else {
            switch (game->target.type) {
            case SMASH_TARGET_RAW_EGG:
            case SMASH_TARGET_GOLDEN_EGG:
                if (game->target.stage >= SMASH_STAGE_DEEP_CRACK) {
                    smash_trigger_sound(game, SMASH_SND_EGG_SPLASH);
                } else {
                    smash_trigger_sound(game, SMASH_SND_CRACK);
                }
                break;
            case SMASH_TARGET_WATERMELON:
                smash_trigger_sound(game, SMASH_SND_MELON_BURST);
                break;
            case SMASH_TARGET_VINTAGE_CLOCK:
                smash_trigger_sound(game, SMASH_SND_CLOCK_GEAR);
                break;
            case SMASH_TARGET_PUNCH_CARD_MACHINE:
                smash_trigger_sound(game, SMASH_SND_PUNCH_CRUSH);
                break;
            default:
                smash_trigger_sound(game, SMASH_SND_SWING);
                break;
            }
        }
    }

    // 粒子生成
    int debris_count = is_crit ? 24 : (5 + (int)(charge_val * 10.0f));
    smash_spawn_target_debris(game, game->target.type, game->target.x, game->target.y, debris_count);
    smash_spawn_tool_particles(game, game->current_tool, game->target.x, game->target.y);

    if (is_crit) {
        // 全屏冲击波环形光圈粒子
        smash_emit_particle(game, SMASH_PART_SHOCKWAVE, game->target.x, game->target.y,
                            0.0f, 0.0f, 15.0f, 0xFFFFFF, 0.0f, 0.0f);
    }

    // 目标彻底被摧毁处理
    if (game->target.is_destroyed) {
        game->total_destroyed++;
        game->score += game->target.base_score * (1 + game->combo_count / 3);
        smash_trigger_sound(game, SMASH_SND_DESTROY);

        // 最终大爆浆
        smash_spawn_target_debris(game, game->target.type, game->target.x, game->target.y, 32);

        game->state = SMASH_STATE_CLEAR_WAIT;
        game->respawn_timer_ms = SMASH_RESPAWN_DELAY_MS;
    }

    // 设置工具挥动后摇动作与冷却
    game->tool_stance = SMASH_TOOL_STANCE_SMASHING;
    game->tool_anim_timer_ms = 90.0f;
    game->tool_cooldown_ms = (float)prop->cooldown_ms;
}

// 初始化状态机
void smash_init(smash_game_t *game, uint32_t seed)
{
    memset(game, 0, sizeof(smash_game_t));
    game->rng_state = (seed != 0) ? seed : 0xA5A55A5A;
    game->state = SMASH_STATE_PLAYING;
    game->current_tool = SMASH_TOOL_WOODEN_MALLET;
    game->tool_stance = SMASH_TOOL_STANCE_IDLE;
    game->shake.decay_rate = SMASH_SHAKE_DECAY_RATE;

    smash_set_target(game, SMASH_TARGET_RAW_EGG);
}

// 重置游戏
void smash_reset(smash_game_t *game)
{
    uint32_t preserved_seed = game->rng_state;
    smash_init(game, preserved_seed);
}

// 设置目标物
void smash_set_target(smash_game_t *game, smash_target_type_t type)
{
    if (type >= SMASH_TARGET_COUNT) {
        type = SMASH_TARGET_RAW_EGG;
    }
    game->target = s_target_templates[type];
    game->target_order_index = (uint32_t)type;
    game->target.damage_ratio = 0.0f;
    game->target.is_destroyed = false;
    game->target.stage = SMASH_STAGE_INTACT;
    game->state = SMASH_STATE_PLAYING;
}

// 轮流切换下一个目标物
void smash_next_target(smash_game_t *game)
{
    uint32_t next = (game->target_order_index + 1) % SMASH_TARGET_COUNT;
    smash_set_target(game, (smash_target_type_t)next);
}

// 切换工具 (UP 键)
void smash_switch_tool_prev(smash_game_t *game)
{
    game->current_tool = (smash_tool_type_t)((game->current_tool + SMASH_TOOL_COUNT - 1) % SMASH_TOOL_COUNT);
    game->is_charging = false;
    game->charge_ratio = 0.0f;
    game->tool_stance = SMASH_TOOL_STANCE_IDLE;
    smash_trigger_sound(game, SMASH_SND_TOOL_SWITCH);
}

// 切换工具 (DOWN 键)
void smash_switch_tool_next(smash_game_t *game)
{
    game->current_tool = (smash_tool_type_t)((game->current_tool + 1) % SMASH_TOOL_COUNT);
    game->is_charging = false;
    game->charge_ratio = 0.0f;
    game->tool_stance = SMASH_TOOL_STANCE_IDLE;
    smash_trigger_sound(game, SMASH_SND_TOOL_SWITCH);
}

// 输入映射
void smash_input_up(smash_game_t *game)
{
    if (game->state == SMASH_STATE_PAUSED) return;
    smash_switch_tool_prev(game);
}

void smash_input_down(smash_game_t *game)
{
    if (game->state == SMASH_STATE_PAUSED) return;
    smash_switch_tool_next(game);
}

// OK 键按下：启动蓄力
void smash_input_ok_down(smash_game_t *game)
{
    if (game->state != SMASH_STATE_PLAYING && game->state != SMASH_STATE_CLEAR_WAIT) {
        return;
    }
    if (game->tool_cooldown_ms > 0.0f) {
        return;
    }
    if (!game->is_charging) {
        game->is_charging = true;
        game->charge_ratio = 0.0f;
        game->charge_timer_ms = 0.0f;
        game->tool_stance = SMASH_TOOL_STANCE_CHARGING;
    }
}

// OK 键松开：根据蓄力值下砸
void smash_input_ok_up(smash_game_t *game)
{
    if (!game->is_charging) {
        return;
    }
    float charge = game->charge_ratio;
    game->is_charging = false;
    game->charge_ratio = 0.0f;
    game->charge_timer_ms = 0.0f;

    smash_do_strike(game, charge);
}

// 短按 OK 敲击
void smash_input_ok_tap(smash_game_t *game)
{
    game->is_charging = false;
    game->charge_ratio = 0.0f;
    game->charge_timer_ms = 0.0f;
    smash_do_strike(game, 0.0f);
}

// 暂停控制
void smash_toggle_pause(smash_game_t *game)
{
    if (game->state == SMASH_STATE_PLAYING || game->state == SMASH_STATE_CLEAR_WAIT) {
        game->state = SMASH_STATE_PAUSED;
    } else if (game->state == SMASH_STATE_PAUSED) {
        game->state = game->target.is_destroyed ? SMASH_STATE_CLEAR_WAIT : SMASH_STATE_PLAYING;
    }
}

void smash_set_pause(smash_game_t *game, bool pause)
{
    if (pause && (game->state == SMASH_STATE_PLAYING || game->state == SMASH_STATE_CLEAR_WAIT)) {
        game->state = SMASH_STATE_PAUSED;
    } else if (!pause && game->state == SMASH_STATE_PAUSED) {
        game->state = game->target.is_destroyed ? SMASH_STATE_CLEAR_WAIT : SMASH_STATE_PLAYING;
    }
}

// 音频消费
smash_sound_t smash_consume_sound(smash_game_t *game)
{
    smash_sound_t s = game->pending_sound;
    game->pending_sound = SMASH_SND_NONE;
    return s;
}

// 查询状态
int smash_get_active_particle_count(const smash_game_t *game)
{
    int count = 0;
    for (int i = 0; i < SMASH_MAX_PARTICLES; i++) {
        if (game->particles[i].active) {
            count++;
        }
    }
    return count;
}

float smash_get_damage_ratio(const smash_game_t *game)
{
    return game->target.damage_ratio;
}

smash_stage_t smash_get_stage(const smash_game_t *game)
{
    return game->target.stage;
}

bool smash_is_target_destroyed(const smash_game_t *game)
{
    return game->target.is_destroyed;
}

// 主步进物理与计时器更新
void smash_step(smash_game_t *game, uint32_t dt_ms)
{
    if (game->state == SMASH_STATE_PAUSED) {
        return;
    }

    float dt_sec = (float)dt_ms / 1000.0f;
    if (dt_sec <= 0.0f) return;

    // 1. 挥击冷却倒计时
    if (game->tool_cooldown_ms > 0.0f) {
        game->tool_cooldown_ms -= (float)dt_ms;
        if (game->tool_cooldown_ms < 0.0f) {
            game->tool_cooldown_ms = 0.0f;
        }
    }

    // 2. 工具动画回位
    if (game->tool_anim_timer_ms > 0.0f) {
        game->tool_anim_timer_ms -= (float)dt_ms;
        if (game->tool_anim_timer_ms <= 0.0f) {
            game->tool_anim_timer_ms = 0.0f;
            if (!game->is_charging) {
                game->tool_stance = SMASH_TOOL_STANCE_IDLE;
            }
        }
    }

    // 3. 目标受击形变与晃动阻尼回弹
    if (game->target.squash_scale_y < 1.0f) {
        game->target.squash_scale_y += (1.0f - game->target.squash_scale_y) * (14.0f * dt_sec);
        if (game->target.squash_scale_y > 0.999f) {
            game->target.squash_scale_y = 1.0f;
        }
    }
    if (fabsf(game->target.wobble_angle) > 0.1f) {
        game->target.wobble_angle *= expf(-10.0f * dt_sec);
    } else {
        game->target.wobble_angle = 0.0f;
    }

    // 4. 连击计时器衰减
    if (game->combo_timer_ms > 0.0f) {
        game->combo_timer_ms -= (float)dt_ms;
        if (game->combo_timer_ms <= 0.0f) {
            game->combo_timer_ms = 0.0f;
            game->combo_count = 0; // 连击重置
        }
    }

    // 5. 蓄力增长与状态处理
    if (game->is_charging) {
        const smash_tool_prop_t *prop = &s_tool_props[game->current_tool];
        game->charge_timer_ms += (float)dt_ms;
        float old_charge = game->charge_ratio;
        game->charge_ratio += dt_sec * prop->charge_rate;

        // 首次蓄满触发蓄力嗡鸣音
        if (old_charge < 1.0f && game->charge_ratio >= 1.0f) {
            smash_trigger_sound(game, SMASH_SND_CHARGE_HUM);
        }
        if (game->charge_ratio > 1.0f) {
            game->charge_ratio = 1.0f;
        }
    }

    // 6. 物品粉碎后重生刷新倒计时
    if (game->state == SMASH_STATE_CLEAR_WAIT) {
        game->respawn_timer_ms -= (float)dt_ms;
        if (game->respawn_timer_ms <= 0.0f) {
            game->respawn_timer_ms = 0.0f;
            smash_next_target(game);
        }
    }

    // 7. 屏幕震颤位移与衰减
    if (game->shake.intensity > 0.2f) {
        game->shake.offset_x = smash_rand_float(game, -game->shake.intensity, game->shake.intensity);
        game->shake.offset_y = smash_rand_float(game, -game->shake.intensity, game->shake.intensity);
        game->shake.intensity *= expf(-game->shake.decay_rate * dt_sec);
        if (game->shake.intensity <= 0.2f) {
            game->shake.intensity = 0.0f;
            game->shake.offset_x = 0.0f;
            game->shake.offset_y = 0.0f;
        }
    } else {
        game->shake.intensity = 0.0f;
        game->shake.offset_x = 0.0f;
        game->shake.offset_y = 0.0f;
    }

    // 8. 暴击闪烁倒计时
    if (game->crit_flash_timer_ms > 0.0f) {
        game->crit_flash_timer_ms -= (float)dt_ms;
        if (game->crit_flash_timer_ms < 0.0f) {
            game->crit_flash_timer_ms = 0.0f;
        }
    }

    // 9. 物理粒子池模拟更新
    for (int i = 0; i < SMASH_MAX_PARTICLES; i++) {
        smash_particle_t *p = &game->particles[i];
        if (!p->active) continue;

        // 运动学更新
        p->x += p->vx * dt_sec;
        p->y += p->vy * dt_sec;
        p->vy += p->gravity * dt_sec;
        p->rot_deg += p->rot_speed * dt_sec;

        // 地面碰撞与弹跳
        if (p->y >= SMASH_GROUND_Y) {
            p->y = SMASH_GROUND_Y;
            if (p->bounce > 0.05f && fabsf(p->vy) > 25.0f) {
                p->vy = -p->vy * p->bounce;
                p->vx *= 0.75f;
            } else {
                p->vy = 0.0f;
                p->vx = 0.0f; // 停止滚动或贴地
            }
        }

        // 生命与衰减
        p->life -= p->decay * dt_sec;
        if (p->life <= 0.0f) {
            p->active = false;
        }
    }
}
