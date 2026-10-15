#pragma once

#include <stdbool.h>
#include <stdint.h>

#define FLYDRIVER_SCREEN_W   240
#define FLYDRIVER_CANVAS_H   250

#define FLYDRIVER_MAX_TRAFFIC   6
#define FLYDRIVER_MAX_PARTICLES 20

// 障碍物 / 道具类型
typedef enum {
    TRAFFIC_SCOUT = 0, // 极速纳米侦察车 (绿光)
    TRAFFIC_TRUCK = 1, // 重型突触阻挡车 (红光，体型宽大)
    TRAFFIC_BOOST_PAD = 2, // 金色光子弹射加速带
    TRAFFIC_LASER_GATE = 3, // 高能激光闸门 (周期性开闭)
} flydriver_obj_type_t;

// 音效事件
typedef enum {
    FLYDRIVER_SND_NONE = 0,
    FLYDRIVER_SND_DRIFT,
    FLYDRIVER_SND_NITRO,
    FLYDRIVER_SND_BOOST_PAD,
    FLYDRIVER_SND_NEARMISS,
    FLYDRIVER_SND_CRASH,
    FLYDRIVER_SND_GAMEOVER,
} flydriver_snd_t;

// 交通实体
typedef struct {
    float x;      // 赛道水平坐标 (-1.0 最左 ~ +1.0 最右)
    float z;      // 纵深距离 (0.0 车身位置 ~ 1.0 远景地平线)
    float speed;  // 相对车速
    int type;     // flydriver_obj_type_t
    bool active;
    bool gate_open; // 激光闸门状态
    bool near_miss_counted;
} flydriver_traffic_t;

// 视流光点粒子
typedef struct {
    float x, y;
    float vx, vy;
    int life;
    int max_life;
    uint32_t color;
    bool active;
} flydriver_particle_t;

// 赛车主游戏数据模型
typedef struct {
    // 玩家车辆状态
    float player_x;       // -0.85 ~ +0.85 (0.0 为赛道中央)
    float player_speed;   // 当前速度 (km/h, 0 ~ 450)
    float target_speed;   // 巡航基准速度
    int steer_dir;        // -1: 左倾漂移, 0: 直行, +1: 右倾漂移
    int steer_timer;

    int nitro_gauge;      // 光子氮气蓄力 (0 ~ 100)
    bool nitro_active;    // 氮气超频状态
    int nitro_timer;      // 氮气剩余持续帧数

    int shields;          // 护盾生命值 (0 ~ 6, 扩充生命上限)
    int max_shields;      // 6
    int invincible_timer; // 受创或喷射时的无敌帧
    int crash_flash;      // 碰撞红光闪烁帧

    // 赛道与环境
    float track_curve;    // 当前弯道曲率 (-1.0 左弯 ~ +1.0 右弯)
    float target_curve;   // 目标曲率
    int curve_timer;
    float track_offset;   // 赛道纵向地平线位移 (动态地面斑马线动画)

    // 统计数据
    int score;
    int distance;         // 行驶里程 (米)
    int near_miss_count;  // 极限擦车次数
    int tick_count;
    int spawn_timer;

    // 实体池
    flydriver_traffic_t traffic[FLYDRIVER_MAX_TRAFFIC];
    flydriver_particle_t particles[FLYDRIVER_MAX_PARTICLES];

    // 反馈与音效
    flydriver_snd_t pending_snd;
    int feedback_timer;
    char feedback_text[24];
    uint32_t feedback_color;

    bool game_over;
} flydriver_game_t;

void flydriver_init(flydriver_game_t *g);
void flydriver_step(flydriver_game_t *g);

// 输入操作
void flydriver_steer_left(flydriver_game_t *g);   // UP 键
void flydriver_steer_right(flydriver_game_t *g);  // DOWN 键
void flydriver_trigger_nitro(flydriver_game_t *g);// OK 键 (爆发光子氮气)

// 坐标映射辅助 (将赛道 -1.0~1.0, z: 0.0~1.0 映射到画布像素坐标)
void flydriver_calc_coord(float track_x, float z, float curve, int *out_x, int *out_y, int *out_w, int *out_h);
