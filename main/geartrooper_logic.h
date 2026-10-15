// main/geartrooper_logic.h —— 《齿轮骑兵：蒸汽狂飙》(Gear Cavalry: Turbo Surge) 核心算法与高爽度跑酷状态机
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
// 极致速度感：骑枪常驻正面贯穿、二段喷气腾空、砸地下刺冲击波、贴地涡轮滑铲与狂暴过载冲撞。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GT_SCREEN_W 240
#define GT_SCREEN_H 320

#define GT_GROUND_Y     220   // 地面战马站立高度
#define GT_HORSE_X      56    // 骑兵横向锚点
#define GT_MAX_ENEMIES  6     // 静态敌兵池上限
#define GT_MAX_PARTICLES 24   // 静态粒子池上限
#define GT_MAX_GEARS    4     // 地面咬合齿轮数

// 骑兵动作姿态
typedef enum {
    STANCE_RUN = 0,    // 极速冲刺奔跑 (骑枪常驻前伸贯穿)
    STANCE_JUMP,       // 一段腾空跳跃
    STANCE_AIR_BOOST,  // 二段蒸汽喷气冲刺
    STANCE_SLIDE,      // 贴地高速齿轮滑铲 (火花四溅，穿行免伤)
    STANCE_PLUNGE      // 空中重锤下刺坠击 (砸地引发全屏冲击波)
} gt_stance_t;

// 敌兵类型
typedef enum {
    ENEMY_NONE = 0,
    ENEMY_SPIDER,      // 发条机械蜘蛛 (贴地疾走，可被滑铲/下刺碾碎)
    ENEMY_FALCON,      // 机械齿轮飞隼 (空中低空盘旋，可被骑枪刺中)
    ENEMY_GOLEM        // 蒸汽重型铜偶 (重装机甲，长枪两次贯穿或过载撞毁)
} gt_enemy_type_t;

// 粒子类型
typedef enum {
    PART_NONE = 0,
    PART_STEAM,        // 蒸汽喷射气团 (向上飘散消隐)
    PART_SPARK         // 金属摩擦火花 (重力抛物线)
} gt_part_type_t;

// 音效事件触发 (供音频任务无锁并发播放)
typedef enum {
    GT_SND_NONE = 0,
    GT_SND_JUMP,       // 机械跃起 / 二段喷气
    GT_SND_SLIDE,      // 贴地火花滑铲
    GT_SND_LANCE,      // 骑枪爆刺贯穿
    GT_SND_HIT,        // 击碎敌兵铁砧清脆碎裂声
    GT_SND_STEAM_BLOW, // 砸地下刺震地冲击波
    GT_SND_OVERDRIVE,  // 蒸汽狂暴过载全速冲撞
    GT_SND_HURT,       // 受到伤害护盾受损
    GT_SND_GAMEOVER    // 蒸汽泄尽停机
} gt_sound_t;

// 敌兵实体
typedef struct {
    bool active;
    gt_enemy_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    int hp;
    int max_hp;
    uint32_t anim_tick;
} gt_enemy_t;

// 粒子实体
typedef struct {
    bool active;
    gt_part_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life;      // 0.0 ~ 1.0
    float decay;     // 衰减速率
    uint32_t color;  // 十六进制颜色
} gt_particle_t;

// 地面啮合齿轮
typedef struct {
    float x;
    float y;
    float radius;
    float angle_deg;
    float speed_deg;
    int teeth_count;
} gt_gear_t;

// 核心游戏上下文
typedef struct {
    // 玩家骑兵状态
    float y;
    float vy;
    gt_stance_t stance;
    uint32_t stance_timer_ms;
    int air_jumps_left;       // 剩余二段跳次数 (空中 1 次)

    // 骑枪突刺与冲击波
    bool lance_extended;      // OK 键加力延展长矛
    uint32_t lance_timer_ms;
    int lance_reach_px;       // 默认 42px，加力 70px
    bool shockwave_active;    // 下刺砸地冲击波
    float shockwave_x;
    float shockwave_radius;
    uint32_t shockwave_timer_ms;

    // 速度感与视差卷轴
    int world_speed;          // 场景疾驰速度 (px/s)
    int ground_scroll_px;     // 地面卷轴偏移
    int bg_scroll_px;         // 远景视差偏移

    // 战马发条转速与蒸汽压力
    int gear_rpm;             // 战马转速
    int steam_psi;            // 蒸汽压力 (0 ~ 100)
    bool overdrive_active;    // 狂暴过载无敌状态
    uint32_t overdrive_ms;    // 过载剩余时间

    // 生命与积分
    int hp;
    int max_hp;
    uint32_t score;
    uint32_t combo_count;
    uint32_t invuln_timer_ms; // 受创无敌闪烁

    // 游戏状态
    bool game_over;
    uint32_t distance_m;      // 行进距离

    // 实体对象池
    gt_gear_t gears[GT_MAX_GEARS];
    gt_enemy_t enemies[GT_MAX_ENEMIES];
    gt_particle_t particles[GT_MAX_PARTICLES];

    // 音效队列
    gt_sound_t pending_sound;

    // 随机数种子与节拍
    uint32_t rng_state;
    uint32_t tick_count;
    uint32_t enemy_spawn_timer_ms;
} gt_game_t;

// API 接口声明
void geartrooper_init(gt_game_t *game, uint32_t seed);
void geartrooper_step(gt_game_t *game, uint32_t dt_ms);

// 三键输入处理
void geartrooper_input_up(gt_game_t *game);
void geartrooper_input_down(gt_game_t *game);
void geartrooper_input_ok(gt_game_t *game);

// 核心碰撞与算法函数
bool geartrooper_check_collision(float x1, float y1, float w1, float h1, float x2, float y2, float w2, float h2);
void geartrooper_emit_particle(gt_game_t *game, gt_part_type_t type, float x, float y, float vx, float vy, uint32_t color);
void geartrooper_spawn_enemy(gt_game_t *game, gt_enemy_type_t type, float x, float y);

#ifdef __cplusplus
}
#endif
