// main/smash_logic.h —— 《万物皆可敲》(Smash Frenzy) 核心状态机与物理算法引擎
// 专为 ESP32-C3 极简三键 (UP / DOWN / OK) 与零动态堆分配 (Zero malloc) 打造。
// 适配 240x320 竖屏与 ES8311 ASMR 音频引擎。

#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕分辨率与世界基准
#define SMASH_SCREEN_W              240
#define SMASH_SCREEN_H              320

// 物理与对象池限制
#define SMASH_MAX_PARTICLES         64
#define SMASH_STAGE_THRESHOLDS_NUM  4
#define SMASH_COMBO_TIMEOUT_MS      2000.0f  // 2秒内未击中则连击重置
#define SMASH_RESPAWN_DELAY_MS      600.0f   // 击碎物品后的刷新等待时间

// 目标物基准位置 (居中偏下)
#define SMASH_TARGET_CENTER_X       120.0f
#define SMASH_TARGET_CENTER_Y       190.0f
#define SMASH_GROUND_Y              280.0f

// 目标物类型 (至少5种)
typedef enum {
    SMASH_TARGET_RAW_EGG = 0,         // 生鸡蛋: 脆壳、蛋黄流淌、蛋清飞溅
    SMASH_TARGET_GOLDEN_EGG,          // 金蛋: 坚硬金壳、金光闪烁、超高得分
    SMASH_TARGET_WATERMELON,          // 大西瓜: 爽脆多汁、红浆爆裂、黑籽飞散
    SMASH_TARGET_VINTAGE_CLOCK,       // 复古发条闹钟: 金属外壳、发条弹簧、铜齿轮乱飞
    SMASH_TARGET_PUNCH_CARD_MACHINE,  // 打卡机: 解压硬核目标、按键飞崩、电路芯片电火花
    SMASH_TARGET_COUNT
} smash_target_type_t;

// 4 种打击工具
typedef enum {
    SMASH_TOOL_WOODEN_MALLET = 0,     // 木槌: 攻速快、CD短、均衡轻巧
    SMASH_TOOL_INFLATABLE_HAMMER,     // 充气爱心锤: 超高弹力、产生飘动爱心、连击累积加成
    SMASH_TOOL_THOR_HAMMER,           // 雷神重锤: 伤害极高、附带雷暴闪电、蓄力暴击倍率极高
    SMASH_TOOL_GREEN_SLIPPER,         // 绿色人字拖: 搞笑啪啪啪极速连打、双倍连击累积
    SMASH_TOOL_COUNT
} smash_tool_type_t;

// 目标物破损阶段 (0~100%)
typedef enum {
    SMASH_STAGE_INTACT = 0,           // 完好无损 (0%)
    SMASH_STAGE_SLIGHT_CRACK,         // 轻微裂纹 (1% ~ 25%)
    SMASH_STAGE_DEEP_CRACK,           // 深度开裂 (26% ~ 60%)
    SMASH_STAGE_SEVERE,               // 濒临破碎 (61% ~ 99%)
    SMASH_STAGE_DESTROYED             // 彻底粉碎 (100%)
} smash_stage_t;

// 工具姿态动作状态
typedef enum {
    SMASH_TOOL_STANCE_IDLE = 0,       // 悬浮待机
    SMASH_TOOL_STANCE_CHARGING,       // 抬高蓄力 (伴随震动)
    SMASH_TOOL_STANCE_SMASHING,       // 快速下砸
    SMASH_TOOL_STANCE_REBOUND         // 受击反弹后摇
} smash_tool_stance_t;

// 游戏全局运行状态
typedef enum {
    SMASH_STATE_PLAYING = 0,          // 敲击游玩中
    SMASH_STATE_PAUSED,               // 暂停状态
    SMASH_STATE_CLEAR_WAIT            // 物品已粉碎，等待刷新下一个物品
} smash_state_t;

// ASMR 音频事件枚举 (供 ES8311 音频解码任务并发驱动)
typedef enum {
    SMASH_SND_NONE = 0,
    SMASH_SND_SWING,                  // 挥舞破空呼啸声
    SMASH_SND_CRACK,                  // 蛋壳/外壳细微裂纹声
    SMASH_SND_EGG_SPLASH,             // 蛋黄蛋清黏滑爆浆流淌声
    SMASH_SND_MELON_BURST,            // 西瓜多汁脆爽炸开声
    SMASH_SND_CLOCK_GEAR,             // 闹钟齿轮金属弹簧崩开清脆声
    SMASH_SND_PUNCH_CRUSH,            // 打卡机外壳粉碎咔嚓声
    SMASH_SND_INFLATABLE_SQUEAK,      // 充气锤啾啾挤压橡皮声
    SMASH_SND_SLIPPER_SLAP,           // 人字拖啪啪啪极速打脸声
    SMASH_SND_CHARGE_HUM,             // 蓄力电磁升频嗡鸣
    SMASH_SND_CRIT_BOOM,              // 全屏暴击轰鸣震地音
    SMASH_SND_DESTROY,                // 彻底炸裂清屏解压爆破音
    SMASH_SND_TOOL_SWITCH,            // 切换工具轻脆咔哒声
    SMASH_SND_COMBO_STREAK            // 达成连击里程碑激励音
} smash_sound_t;

// 爆浆与碎屑粒子类型
typedef enum {
    SMASH_PART_NONE = 0,
    SMASH_PART_EGG_YOLK,              // 蛋黄液滴 (粘稠流淌、重力下坠、地面低弹跳)
    SMASH_PART_EGG_WHITE,             // 蛋清流质 (透明微滴)
    SMASH_PART_EGG_SHELL,             // 蛋壳碎屑 (白色/金色碎块，带自转)
    SMASH_PART_MELON_JUICE,           // 鲜红西瓜汁 (径向喷洒爆浆)
    SMASH_PART_MELON_SEED,            // 黑色西瓜籽 (椭圆带旋转抛洒)
    SMASH_PART_GEAR,                  // 黄铜金属齿轮 (翻滚弹跳)
    SMASH_PART_SPRING,                // 螺旋弹簧 (高弹性抛射)
    SMASH_PART_CHIP,                  // 塑料碎片与芯片残块
    SMASH_PART_SPARK,                 // 电火花闪烁微粒
    SMASH_PART_HEART,                 // 充气锤爱心微粒 (轻盈上浮)
    SMASH_PART_SHOCKWAVE              // 暴击全屏冲击波光环
} smash_part_type_t;

// 粒子实体结构 (静态池)
typedef struct {
    bool active;
    smash_part_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float gravity;                    // 重力加速度 (px/s^2)
    float bounce;                     // 地面反弹系数 (0.0~0.8)
    float life;                       // 剩余生命 (0.0 ~ 1.0)
    float decay;                      // 每秒生命衰减速度
    float size;                       // 粒子尺寸半径
    float rot_deg;                    // 自转角度 (0 ~ 360)
    float rot_speed;                  // 自转角速度 (deg/s)
    uint32_t color;                   // 24位 RGB 颜色
} smash_particle_t;

// 打击工具静态属性配置
typedef struct {
    smash_tool_type_t type;
    const char *name;                 // 工具显示名称
    float base_damage;                // 基础敲击伤害
    float crit_multiplier;            // 蓄力满暴击倍率
    uint32_t cooldown_ms;             // 挥击冷却时间 (ms)
    float combo_gain;                 // 每次打击增加的连击点
    float combo_score_mult;           // 连击得分加成系数
    float elasticity;                 // 弹性与震颤放大系数
    float charge_rate;                // 蓄力增速 (每秒蓄力值 0.0~1.0)
} smash_tool_prop_t;

// 目标物实时状态结构
typedef struct {
    smash_target_type_t type;
    const char *name;
    float max_hp;
    float current_hp;
    float damage_ratio;               // 破损比例 0.0f ~ 1.0f (0% ~ 100%)
    smash_stage_t stage;              // 当前破坏阶段
    float stage_thresholds[SMASH_STAGE_THRESHOLDS_NUM]; // 阶段阈值比例
    bool is_destroyed;                // 是否已彻底碎裂
    uint32_t base_score;              // 击毁基础得分
    float x, y;                       // 中心锚点
    float w, h;                       // 绘制盒尺寸
    float wobble_angle;               // 受击左右晃动偏角 (deg)
    float squash_scale_y;             // 受击下压形变纵向缩放比例 (1.0 为正常)
} smash_target_t;

// 屏幕震颤状态结构
typedef struct {
    float intensity;                  // 当前震颤振幅 (像素)
    float offset_x;                   // 当前帧计算得到的 X 轴偏移
    float offset_y;                   // 当前帧计算得到的 Y 轴偏移
    float decay_rate;                 // 震颤衰减速度 (指数衰减系数)
} smash_shake_t;

// 《万物皆可敲》全局核心状态机
typedef struct {
    smash_state_t state;              // 游戏主状态
    uint32_t score;                   // 当前总得分
    uint32_t combo_count;             // 当前连击次数
    uint32_t max_combo;               // 最大连击记录
    float combo_timer_ms;             // 连击剩余有效倒计时 (ms)
    uint32_t total_smashes;           // 总打击次数
    uint32_t total_destroyed;         // 击碎物品总计数
    uint32_t crit_hits;               // 暴击次数

    // 工具控制与蓄力
    smash_tool_type_t current_tool;
    smash_tool_stance_t tool_stance;
    float tool_cooldown_ms;           // 挥击冷却剩余时间
    bool is_charging;                 // 是否处于按住 OK 蓄力状态
    float charge_ratio;               // 当前蓄力进度 (0.0f ~ 1.0f)
    float charge_timer_ms;            // 蓄力已持续时间 (ms)
    float tool_anim_timer_ms;         // 工具砸下/反弹动画计时 (ms)
    float tool_offset_y;              // 工具绘制位置偏移

    // 目标物
    smash_target_t target;
    uint32_t target_order_index;      // 目标轮询索引
    float respawn_timer_ms;           // 碎裂后刷新等待倒计时

    // 粒子对象池
    smash_particle_t particles[SMASH_MAX_PARTICLES];

    // 屏幕震颤
    smash_shake_t shake;

    // 音频事件
    smash_sound_t pending_sound;
    uint32_t sound_seq;               // 每次产生新音效自增

    // 随机数发生器种子
    uint32_t rng_state;

    // 暴击闪烁特效
    float crit_flash_timer_ms;
} smash_game_t;

// ============================================================================
// 核心外部接口声明
// ============================================================================

// 初始化与复位
void smash_init(smash_game_t *game, uint32_t seed);
void smash_reset(smash_game_t *game);

// 目标物设置与流转
void smash_set_target(smash_game_t *game, smash_target_type_t type);
void smash_next_target(smash_game_t *game);

// 工具切换 (UP / DOWN 键)
void smash_switch_tool_prev(smash_game_t *game);  // UP 键
void smash_switch_tool_next(smash_game_t *game);  // DOWN 键

// 按键输入事件
void smash_input_up(smash_game_t *game);
void smash_input_down(smash_game_t *game);
void smash_input_ok_down(smash_game_t *game);     // OK 键按下: 开始蓄力
void smash_input_ok_up(smash_game_t *game);       // OK 键松开: 释放打击 (轻砸或蓄力暴击)
void smash_input_ok_tap(smash_game_t *game);      // 短按 OK: 直接下砸

// 暂停控制
void smash_toggle_pause(smash_game_t *game);
void smash_set_pause(smash_game_t *game, bool pause);

// 物理与状态帧推进 (dt_ms: 距离上一帧的毫秒数)
void smash_step(smash_game_t *game, uint32_t dt_ms);

// 音频系统消费接口
smash_sound_t smash_consume_sound(smash_game_t *game);

// 静态配置查询
const smash_tool_prop_t* smash_get_tool_prop(smash_tool_type_t tool);

// 状态与查询辅助
int smash_get_active_particle_count(const smash_game_t *game);
float smash_get_damage_ratio(const smash_game_t *game);
smash_stage_t smash_get_stage(const smash_game_t *game);
bool smash_is_target_destroyed(const smash_game_t *game);

// 粒子发射接口 (供内部及特效扩展调用)
void smash_emit_particle(smash_game_t *game, smash_part_type_t type,
                        float x, float y, float vx, float vy,
                        float size, uint32_t color, float bounce, float gravity);

#ifdef __cplusplus
}
#endif
