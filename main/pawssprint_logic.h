// main/pawssprint_logic.h —— 《短腿爪爪运动会》(Paws Sprint: Fluffy Runner) 核心算法引擎
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
// 游戏特色：
// 1. 0 挫败感萌宠治愈跑酷：撞障碍绝不 Game Over，踩香蕉皮华丽 360° 旋转变舞步！
// 2. 4 只特色萌宠：柯基·球球、柴犬·阿柴、海豹·糯米、企鹅·波波。
// 3. 终点扑向蓬松巨型大抱枕 (Cushion Dive)，羽毛炸裂与温馨治愈签！
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PS_SCREEN_W          240
#define PS_SCREEN_H          320

#define PS_LANE_COUNT        3
#define PS_LANE_0_X          50
#define PS_LANE_1_X          120
#define PS_LANE_2_X          190

#define PS_PLAYER_Y          240
#define PS_TOTAL_DIST_M      500

#define PS_MAX_OBSTACLES     6
#define PS_MAX_PICKUPS       6
#define PS_MAX_PAW_PRINTS    12
#define PS_MAX_FEATHERS      32

// 游戏状态机
typedef enum {
    PS_STATE_TITLE = 0,      // 选人与开始界面
    PS_STATE_PLAYING,        // 3 车道治愈奔跑
    PS_STATE_DIVE,           // 终点慢动作飞扑大抱枕
    PS_STATE_RESULT          // 治愈签与成绩结算
} ps_state_t;

// 4 种角色定义
typedef enum {
    PS_CHAR_CORGI = 0,       // 柯基·球球 (蜜桃臀，活力金黄)
    PS_CHAR_SHIBA,           // 柴犬·阿柴 (飞机耳，治愈微笑)
    PS_CHAR_SEAL,            // 海豹·糯米 (Q弹大白福，软萌雪米团)
    PS_CHAR_PENGUIN,         // 企鹅·波波 (呆萌小绅士，肚皮滑行)
    PS_CHAR_COUNT
} ps_char_type_t;

// 障碍物类型 (0 挫败，仅触发滑稽动作)
typedef enum {
    PS_OBS_NONE = 0,
    PS_OBS_BANANA,           // 香蕉皮：原地 360° 旋转舞步
    PS_OBS_ROOMBA,           // 扫地机：可爱碰撞并变道
    PS_OBS_MUD               // 泥巴小水坑：轻微噗嗤减速
} ps_obs_type_t;

// 收集品类型
typedef enum {
    PS_PICKUP_NONE = 0,
    PS_PICKUP_BONE,          // 骨头 (+1 分)
    PS_PICKUP_HEART          // 爱心 (+3 分，拉伸加速)
} ps_pickup_type_t;

// 音效事件 (供 I2S 音频任务播放)
typedef enum {
    PS_SND_NONE = 0,
    PS_SND_PATA,             // 小爪子肉垫嗒嗒嗒踏步声
    PS_SND_JUMP,             // Q 弹起跳 boing
    PS_SND_SLIP,             // 踩香蕉皮滑稽旋转哨音
    PS_SND_BONE,             // 拾取骨头清脆双音和弦
    PS_SND_HEART,            // 拾取爱心欢快高音
    PS_SND_CUSHION_DIVE      // 沉闷蓬松 POOF 噗嗤 + 胜利琶音
} ps_sound_t;

// 障碍物实体
typedef struct {
    bool active;
    ps_obs_type_t type;
    int lane;
    float x;
    float y;
} ps_obstacle_t;

// 收集品实体
typedef struct {
    bool active;
    ps_pickup_type_t type;
    int lane;
    float x;
    float y;
    float bob_phase;
} ps_pickup_t;

// 地面可爱小爪印
typedef struct {
    bool active;
    float x;
    float y;
    float life;              // 1.0 -> 0.0
} ps_paw_print_t;

// 终点大抱枕飞羽粒子
typedef struct {
    bool active;
    float x;
    float y;
    float vx;
    float vy;
    float rot;
    float vrot;
    float size;
    float life;
    uint32_t color;
} ps_feather_t;

// 角色配置信息
typedef struct {
    const char *name;
    const char *sub;
    const char *tag;
    uint32_t body_color;
    uint32_t belly_color;
    uint32_t accent_color;
} ps_char_info_t;

// 游戏主上下文
typedef struct {
    ps_state_t state;
    ps_char_type_t selected_char;

    // 玩家动态
    int lane;                // 当前车道: 0, 1, 2
    float x;                 // 平滑插值当前 X
    float target_x;          // 目标车道 X
    float y;                 // 玩家锚点 Y
    float jump_z;            // 跳跃垂直高度
    float jump_v;            // 跳跃垂直初速度
    bool is_jumping;
    float slip_timer_ms;     // 踩香蕉皮打转剩余毫秒
    float spin_angle;        // 旋转角度 (弧度)
    float squash_x;          // Q弹横向形变
    float squash_y;          // Q弹纵向形变
    float run_frame;         // 奔跑步伐相位

    // 赛道参数
    float speed;             // 当前速度 (px/s，160 ~ 240)
    float distance_m;        // 已奔跑米数 (0 ~ 500)
    uint32_t bones_count;    // 收集骨头数
    uint32_t slips_count;    // 滑稽平地摔/打转次数
    float road_offset;       // 跑道线滚动偏移

    // 计时器与生成
    float spawn_obs_timer_ms;
    float spawn_pickup_timer_ms;
    float paw_timer_ms;
    float dive_timer_ms;     // 慢动作扑倒倒计时
    int quote_index;         // 结算治愈寄语索引

    // 对象池 (零动态分配)
    ps_obstacle_t  obstacles[PS_MAX_OBSTACLES];
    ps_pickup_t    pickups[PS_MAX_PICKUPS];
    ps_paw_print_t paw_prints[PS_MAX_PAW_PRINTS];
    ps_feather_t   feathers[PS_MAX_FEATHERS];

    // 音频与时钟
    ps_sound_t pending_sound;
    uint32_t rng_state;
    uint32_t tick_count;
} ps_game_t;

// 接口函数
void pawssprint_init(ps_game_t *game, uint32_t seed);
void pawssprint_start(ps_game_t *game);
void pawssprint_reset_to_title(ps_game_t *game);
void pawssprint_step(ps_game_t *game, uint32_t dt_ms);

// 三键输入分发
void pawssprint_input_up(ps_game_t *game);
void pawssprint_input_down(ps_game_t *game);
void pawssprint_input_ok(ps_game_t *game);

// 角色与寄语查询
const ps_char_info_t *pawssprint_get_char_info(ps_char_type_t ch);
const char *pawssprint_get_quote(int index);
int pawssprint_get_quote_count(void);

#ifdef __cplusplus
}
#endif
