#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕与布局基准 (FoloToy AI Passport 240x320 竖屏基准)
#define FLAPPY_SCREEN_W        240
#define FLAPPY_SCREEN_H        320
#define FLAPPY_GROUND_H        40
#define FLAPPY_GROUND_Y        (FLAPPY_SCREEN_H - FLAPPY_GROUND_H) // 280

// 小鸟物理与尺寸
#define FLAPPY_BIRD_X          50.0f   // 固定水平渲染基准位置
#define FLAPPY_BIRD_INIT_Y     130.0f  // 初始垂直高度
#define FLAPPY_BIRD_W          20.0f   // 碰撞矩形宽度
#define FLAPPY_BIRD_H          16.0f   // 碰撞矩形高度

#define FLAPPY_GRAVITY         750.0f  // 重力加速度 (px/s^2)
#define FLAPPY_FLAP_IMPULSE    (-250.0f) // 跳跃点火初速度冲量 (px/s, 负值为向上)
#define FLAPPY_MAX_FALL_SPEED  380.0f  // 终端下坠速度限制 (px/s)
#define FLAPPY_ROTATION_UP     (-25.0f)// 点火抬头倾角 (度)
#define FLAPPY_ROTATION_DOWN   (75.0f) // 俯冲最大倾角 (度)
#define FLAPPY_ROTATION_SPEED  260.0f  // 低头旋转角速度 (度/s)

// 水管障碍物管道系统
#define FLAPPY_MAX_PIPES       3       // 水管循环对象池容量
#define FLAPPY_PIPE_W          38.0f   // 水管碰撞矩形宽度
#define FLAPPY_PIPE_GAP_H      85.0f   // 默认安全缝隙净空高度
#define FLAPPY_PIPE_SPEED      80.0f   // 默认水管向左推进速度 (px/s)
#define FLAPPY_PIPE_SPEED_MAX  140.0f  // 难度爬升后的水管速度上限
#define FLAPPY_PIPE_SPACING    125.0f  // 相邻水管水平间距
#define FLAPPY_MIN_GAP_Y       30.0f   // 缝隙顶部最小 Y
#define FLAPPY_MAX_GAP_Y       (FLAPPY_GROUND_Y - FLAPPY_PIPE_GAP_H - 30.0f) // 165.0f
#define FLAPPY_MIN_GAP_H       62.0f   // 难度爬升后的最小缝隙

// 游戏状态枚举
typedef enum {
    FLAPPY_STATE_READY = 0,    // 就绪悬停，等待首次点火
    FLAPPY_STATE_PLAYING = 1,  // 游戏中
    FLAPPY_STATE_GAMEOVER = 2  // 碰撞阵亡
} flappy_state_t;

// 水管实体定义
typedef struct {
    float x;           // 水管左上角水平坐标
    float gap_y;       // 上水管下沿 Y 坐标 (即缝隙顶部)
    float gap_base_y;  // 缝隙基准高度 (振荡前)
    float gap_height;  // 缝隙净空高度 (上水管下沿至下水管上沿)
    float gap_osc_amp; // 垂直振荡幅度 (0 为静止水管)
    float gap_osc_phase;
    float width;       // 水管矩形宽度
    bool passed;       // 小鸟中心线是否已穿过并计分
    bool active;       // 是否处于激活状态
    bool golden;       // 金水管：穿越得 2 分
} flappy_pipe_t;

// 游戏核心数据模型
typedef struct {
    // 角色物理
    float y;                 // 垂直位置 Y (px)
    float vy;                // 垂直速度 (px/s, 向下为正)
    float gravity;           // 重力加速度 (px/s^2)
    float flap_impulse;      // 跳跃初速度冲量 (px/s, 负值为向上)
    float rotation;          // 倾斜角度 (度, 负数为抬头, 正数为俯冲)
    float x;                 // 水平基准位置 (px)
    float w;                 // 碰撞体宽度
    float h;                 // 碰撞体高度

    // 管道系统
    flappy_pipe_t pipes[FLAPPY_MAX_PIPES];
    float pipe_speed;        // 管道平移速度 (px/s)
    float default_gap_height;// 默认缝隙高度

    // 动态环境
    bool is_night;           // 昼夜模式切换标志 (false: 昼, true: 夜)
    float wind_x;            // 水平微风阻力
    float turbulence_force;  // 当前垂直乱流扰动加速度 (px/s^2)
    float turbulence_phase;  // 乱流相位计时
    float drag_coeff;        // 空气阻力系数
    bool turbulence_enabled; // 是否启用微扰系统

    // 计分与状态
    int score;               // 当前得分
    int high_score;          // 历史最高分
    int golden_count;        // 本局穿越金水管次数
    flappy_state_t state;    // 游戏状态
    bool game_over;          // 是否已死亡 (兼容 state == GAMEOVER)
    uint32_t state_time_ms;  // 当前状态持续毫秒数
    uint32_t total_time_ms;  // 游戏累计运行毫秒数

    // 随机数发生器状态
    uint32_t rng_state;

    // 音效 / 事件触发单帧标志
    bool snd_flap;           // 触发点火拍翅音效
    bool snd_score;          // 触发成功穿越计分音效
    bool snd_hit;            // 触发撞击音效
    bool snd_die;            // 触发阵亡坠落音效
    bool snd_golden;         // 触发金水管加分音效
} flappy_game_t;

// ================= 全局默认实例标准接口 =================
void flappy_logic_init(void);
void flappy_logic_update(uint32_t dt_ms);
void flappy_logic_flap(void);
flappy_game_t *flappy_logic_get_state(void);

// ================= 结构体多实例 / 单测注入接口 =================
void flappy_logic_init_ctx(flappy_game_t *g);
void flappy_logic_update_ctx(flappy_game_t *g, uint32_t dt_ms);
void flappy_logic_flap_ctx(flappy_game_t *g);
void flappy_logic_restart_ctx(flappy_game_t *g);
void flappy_logic_set_seed_ctx(flappy_game_t *g, uint32_t seed);
bool flappy_logic_check_collision_ctx(const flappy_game_t *g);

#ifdef __cplusplus
}
#endif
