#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕与画布尺寸
#define TR_SCREEN_W              240
#define TR_SCREEN_H              320
#define TR_CANVAS_H              250

// 赛道车道数量与横向坐标
#define TR_NUM_LANES             3
#define TR_LANE_X_LEFT           (-0.65f)
#define TR_LANE_X_MID            (0.0f)
#define TR_LANE_X_RIGHT          (0.65f)
#define TR_LANE_SMOOTH_FACTOR    0.25f

// 对象池容量
#define TR_MAX_VEHICLES          8
#define TR_MAX_MISSILES          8
#define TR_MAX_ITEMS             4
#define TR_MAX_PARTICLES         20

// 速度常数 (km/h)
#define TR_SPEED_MIN             80.0f
#define TR_SPEED_BASE            180.0f
#define TR_SPEED_MAX_NORMAL      260.0f
#define TR_SPEED_MAX_NITRO       420.0f
#define TR_ACCEL_RATE            1.5f
#define TR_DECEL_RATE            3.5f

// 玩家基础数值
#define TR_MAX_SHIELD            100
#define TR_MAX_NITRO             100.0f
#define TR_MAX_AMMO              20
#define TR_INIT_SHIELD           100
#define TR_INIT_NITRO            50.0f
#define TR_INIT_AMMO             8
#define TR_NITRO_MIN_TRIGGER     30.0f
#define TR_NITRO_DRAIN_PER_TICK  1.2f
#define TR_INVINCIBLE_FRAMES     30

// 碰撞与近身超车判定阈值
#define TR_COLLISION_DZ          0.08f
#define TR_COLLISION_DX          0.22f
#define TR_NEARMISS_DX_MIN       0.22f
#define TR_NEARMISS_DX_MAX       0.60f

// 分数与奖励
#define TR_SCORE_PASS            50
#define TR_SCORE_NEARMISS        250
#define TR_SCORE_SMASH           500
#define TR_SCORE_SLOW_CAR        100
#define TR_SCORE_WEAVER_CAR      200
#define TR_SCORE_POLICE_CAR      350
#define TR_SCORE_ITEM            150
#define TR_NITRO_REWARD_NEARMISS 20.0f
#define TR_NEARMISS_COMBO_FRAMES 90
#define TR_NIGHT_DISTANCE        1800

// 交通车辆类型
typedef enum {
    TR_VEHICLE_SLOW = 0,    // 前方慢速民用车/货车 (低速, 1 HP)
    TR_VEHICLE_WEAVER,      // 横向变道干扰车 (中速, 2 HP, 周期性切换车道)
    TR_VEHICLE_POLICE,      // 拦截警车/重装特勤车 (高速, 3 HP, 变道阻截)
} tr_vehicle_type_t;

// 掉落道具类型
typedef enum {
    TR_ITEM_HEART = 0,      // 红心 (修补护盾 +30)
    TR_ITEM_NITRO,          // 氮气瓶 (充能氮气 +35)
    TR_ITEM_AMMO,           // 导弹补给 (+5 弹药)
} tr_item_type_t;

// 按键与事件枚举 (硬件无关接口, 兼容 BSP 按键定义)
typedef enum {
    TR_KEY_UP = 0,          // 左切车道
    TR_KEY_DOWN = 1,        // 右切车道
    TR_KEY_OK = 2,          // 飞弹/氮气
} tr_key_t;

typedef enum {
    TR_KEY_EV_PRESS = 0,
    TR_KEY_EV_CLICK = 1,
    TR_KEY_EV_DOUBLE_CLICK = 2,
    TR_KEY_EV_LONG_PRESS = 3,
} tr_key_event_t;

// 车载飞弹实体
typedef struct {
    float x;                // 横向位置 (-1.0 ~ +1.0)
    float z;                // 纵深深度 (0.0 车头 ~ 1.0 远景)
    float speed;            // 推进速度 (dz/tick)
    int damage;             // 威力
    bool active;            // 活跃状态
    bool guided;            // 开启微导向追踪
} tr_missile_t;

// 掉落道具实体
typedef struct {
    float x;
    float z;
    tr_item_type_t type;
    bool active;
} tr_item_t;

// 交通/敌对车辆实体
typedef struct {
    float x;                // 当前横向位置
    float target_x;         // 目标横向位置 (变道平滑用)
    float z;                // 纵深距离 (0.0 车身位置 ~ 1.0 远景地平线)
    float speed;            // 自身行驶车速 (km/h)
    int lane;               // 当前所在车道 (0..TR_NUM_LANES-1)
    int target_lane;        // 目标车道
    int hp;                 // 当前生命值
    int max_hp;             // 最大生命值
    tr_vehicle_type_t type; // 车辆类型
    int behavior_timer;     // AI 行为计时器
    bool near_miss_triggered; // 本次接近是否已计分
    bool active;            // 活跃状态
} tr_vehicle_t;

// 视觉火花/尾气粒子
typedef struct {
    float x, y;
    float vx, vy;
    int life;
    int max_life;
    uint32_t color;
    bool active;
} tr_particle_t;

// 雷霆飞车游戏主数据模型
typedef struct {
    // 玩家赛车状态
    int target_lane;        // 目标车道 (0: 左, 1: 中, 2: 右)
    float lane_x;           // 平滑横向坐标 (-0.65f ~ +0.65f)
    float current_speed;    // 当前速度 (km/h)
    float max_speed;        // 巡航极速上限 (km/h)
    float min_speed;        // 最低速度 (km/h)
    int shield;             // 护盾耐久度 (0~100)
    int max_shield;         // 护盾上限 (100)
    float nitro;            // 氮气值 (0.0~100.0)
    float max_nitro;        // 氮气上限 (100.0)
    int ammo;               // 导弹弹药量
    int max_ammo;           // 弹药上限 (20)

    // 状态机制
    bool nitro_active;      // 氮气爆发无敌冲刺状态
    int invincible_timer;   // 受创无敌保护帧
    int screen_shake;       // 屏幕震动反馈强度
    bool game_over;         // 游戏结束标志
    bool paused;            // 暂停标志

    // 游戏统计
    int score;              // 当前总得分
    int distance;           // 行驶里程 (米)
    int near_miss_count;    // 极限近身超车次数
    int smash_count;        // 氮气无敌撞飞车辆数
    int vehicles_destroyed; // 飞弹击毁车辆数
    int tick_count;         // 游戏运行总帧数
    int spawn_timer;        // 敌车生成周期计时
    int drop_counter;       // 道具掉落轮转计数器
    int near_miss_combo;    // 近身超车连击 (窗口内连续擦车)
    int near_miss_combo_timer;
    int max_near_miss_combo;
    bool night_mode;        // 夜间赛道 (里程达到阈值后交替)

    // 对象池
    tr_vehicle_t vehicles[TR_MAX_VEHICLES];
    tr_missile_t missiles[TR_MAX_MISSILES];
    tr_item_t items[TR_MAX_ITEMS];
    tr_particle_t particles[TR_MAX_PARTICLES];

    // 音效触发事件 (单帧脉冲标志)
    bool snd_missile;       // 发射飞弹
    bool snd_hit;           // 飞弹命中
    bool snd_explode;       // 击毁爆炸
    bool snd_nitro;         // 氮气爆发开启
    bool snd_smash;         // 氮气撞飞敌车
    bool snd_near_miss;     // 极限擦车
    bool snd_item;          // 拾取道具
    bool snd_crash;         // 碰撞护盾受损
    bool snd_gameover;      // 护盾耗尽阵亡
} thunderracer_game_t;

// 核心生命周期与驱动 API
void thunderracer_init(thunderracer_game_t *g);
void thunderracer_step(thunderracer_game_t *g);
void thunderracer_toggle_pause(thunderracer_game_t *g);

// 输入操作接口
void thunderracer_steer_left(thunderracer_game_t *g);    // UP: 左切车道
void thunderracer_steer_right(thunderracer_game_t *g);   // DOWN: 右切车道
bool thunderracer_fire_missile(thunderracer_game_t *g);  // OK短按: 发射飞弹
bool thunderracer_trigger_nitro(thunderracer_game_t *g); // OK长按/双击: 释放氮气
void thunderracer_handle_input(thunderracer_game_t *g, tr_key_t key, tr_key_event_t ev);

// 加速与制动接口
void thunderracer_accelerate(thunderracer_game_t *g, float amount);
void thunderracer_brake(thunderracer_game_t *g, float amount);

// 辅助算法
float thunderracer_lane_to_x(int lane);
void thunderracer_calc_coord(float track_x, float z, int *out_x, int *out_y, int *out_w, int *out_h);

// 实体生成与管理辅助
bool thunderracer_spawn_vehicle(thunderracer_game_t *g, tr_vehicle_type_t type, int lane, float z, float speed, int hp);
bool thunderracer_spawn_item(thunderracer_game_t *g, tr_item_type_t type, float x, float z);

#ifdef __cplusplus
}
#endif
