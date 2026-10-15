#pragma once

#include <stdbool.h>
#include <stdint.h>

#define FLYSABER_SCREEN_W 240
#define FLYSABER_CANVAS_H 250

#define FLYSABER_MAX_BLOCKS    12
#define FLYSABER_MAX_PARTICLES 24

// 视觉与判定几何常量
#define FLYSABER_VP_X       120
#define FLYSABER_VP_Y       20
#define FLYSABER_DEST_LEFT  55
#define FLYSABER_DEST_RIGHT 185
#define FLYSABER_DEST_CTR   120
#define FLYSABER_DEST_Y     225
#define FLYSABER_STRIKE_T   0.85f

// 判定轨道
typedef enum {
    FLYSABER_LANE_LEFT = 0,   // 左眼通路 (R7 感受野 / 蓝色)
    FLYSABER_LANE_RIGHT = 1,  // 右眼通路 (R8 感受野 / 红色)
    FLYSABER_LANE_CENTER = 2, // 中央神经突触核心 (双目会聚 / 紫金双色)
} flysaber_lane_t;

// 方块类型
typedef enum {
    FLYSABER_BLOCK_BLUE = 0,  // 蓝色方块 (UP 键左刀劈砍)
    FLYSABER_BLOCK_RED = 1,   // 红色方块 (DOWN 键右刀劈砍)
    FLYSABER_BLOCK_DUAL = 2,  // 双色核心 (OK 键双刀合击)
    FLYSABER_BLOCK_SPIKE = 3, // 神经杂波尖刺 (避开不砍，砍中扣血)
} flysaber_block_type_t;

// 打击判定结果
typedef enum {
    FLYSABER_HIT_NONE = 0,
    FLYSABER_HIT_PERFECT,
    FLYSABER_HIT_GOOD,
    FLYSABER_HIT_MISS,
    FLYSABER_HIT_WRONG,
    FLYSABER_HIT_SPIKE,
} flysaber_hit_result_t;

// 音效触发事件
typedef enum {
    FLYSABER_SND_NONE = 0,
    FLYSABER_SND_SLASH_BLUE,
    FLYSABER_SND_SLASH_RED,
    FLYSABER_SND_HIT_PERFECT,
    FLYSABER_SND_HIT_GOOD,
    FLYSABER_SND_MISS,
    FLYSABER_SND_OVERDRIVE,
    FLYSABER_SND_GAMEOVER,
} flysaber_snd_t;

// 粒子
typedef struct {
    float x, y;
    float vx, vy;
    int life;
    int max_life;
    uint32_t color;
    bool active;
} flysaber_particle_t;

// 空间方块
typedef struct {
    float progress;               // 0.0 (远景消失点) -> 1.0 (判定线) -> 1.15 (出界)
    float speed;
    flysaber_lane_t lane;
    flysaber_block_type_t type;
    bool active;
    bool sliced;
} flysaber_block_t;

// 游戏核心数据结构
typedef struct {
    // 玩家状态
    int sync_hp;                  // 突触同步率 (0 ~ 100), 初始 100
    int max_sync_hp;              // 100
    int lives;                    // 突触复苏生命数 (初始 3 条命)
    int max_lives;                // 3
    int score;
    int combo;
    int max_combo;
    int overdrive_gauge;          // 神经动作电位蓄力 (0 ~ 100)
    bool is_overdrive;            // 是否处于“果蝇子弹时间/神经超频”
    int overdrive_timer;          // 超频倒计时帧

    // 刀光动画帧计时
    int slash_left_timer;
    int slash_right_timer;
    int slash_dual_timer;

    // 实体与粒子池
    flysaber_block_t blocks[FLYSABER_MAX_BLOCKS];
    flysaber_particle_t particles[FLYSABER_MAX_PARTICLES];

    // 节拍生成与时间步
    int tick_count;
    int spawn_timer;
    int pattern_step;

    // 反馈与音效事件
    flysaber_hit_result_t last_hit_result;
    int hit_result_timer;
    flysaber_snd_t pending_snd;

    bool game_over;
} flysaber_game_t;

void flysaber_init(flysaber_game_t *g);
void flysaber_step(flysaber_game_t *g);

// 输入操作
void flysaber_slash_left(flysaber_game_t *g);   // UP 键
void flysaber_slash_right(flysaber_game_t *g);  // DOWN 键
void flysaber_slash_dual(flysaber_game_t *g);   // OK 键 (双刀合击 / 激活超频)

// 坐标映射助手 (脱离图形库的纯数学计算，方便测试与渲染)
void flysaber_calc_pos(float progress, flysaber_lane_t lane, int *out_x, int *out_y, int *out_w, int *out_h);
