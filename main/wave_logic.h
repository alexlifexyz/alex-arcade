// main/wave_logic.h —— 《浪涌漫游者》(Wave Walker) 核心算法引擎
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
// 游戏特色：
// 1. 平滑正弦波浪数学模型：双谐波动态海浪曲线与精确解析切线角度；
// 2. 经典 3 键精妙冲浪微操：
//    - DOWN 顺坡压板加速俯冲 (Down-pump Boost)，逆坡阻水；
//    - OK 浪尖借冲力跃浪腾空 (Crest Launch)；
//    - 空中 UP/DOWN 键触发 360° 滑稽大翻滚特技 (Flip Stunts)；
//    - 入水前 OK 键微调对齐浪面：偏差 <= 35° 达成“完美切水入浪”爆发七彩水花与二次冲刺；
//      偏差大触发搞笑“肚皮啪叽拍水”减速甩头；
// 3. 动态水面漂浮物与障碍：调皮小螃蟹、漂流木、浮游发光水母；
// 4. 收集物：五角海星、珍珠贝壳；
// 5. 纯 C11 编写，零堆分配，与硬件及显示驱动解耦。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕规格
#define WAVE_SCREEN_W          240
#define WAVE_SCREEN_H          320

// 小海獭角色尺寸与基准配置
#define WAVE_OTTER_X           64.0f    // 小海獭屏幕水平基准位置 (px)
#define WAVE_OTTER_W           22.0f    // 海獭碰撞盒宽度 (px)
#define WAVE_OTTER_H           16.0f    // 海獭碰撞盒高度 (px)
#define WAVE_BOARD_LEN         30.0f    // 冲浪板长度 (px)

// 对象池上限
#define WAVE_MAX_OBSTACLES     6
#define WAVE_MAX_ITEMS         6
#define WAVE_MAX_PARTICLES     32

// 物理与动力学常量
#define WAVE_SPEED_MIN         80.0f    // 极小保底速度 (px/s)
#define WAVE_SPEED_BASE        160.0f   // 基础巡航速度 (px/s)
#define WAVE_SPEED_MAX         440.0f   // 极限俯冲/冲刺速度 (px/s)
#define WAVE_GRAVITY           850.0f   // 空中重力加速度 (px/s^2)
#define WAVE_PUMP_ACCEL        520.0f   // 顺坡压板重力加速推力增益 (px/s^2)
#define WAVE_JUMP_BASE_VY      -320.0f  // 基础起跳纵向冲量初速度 (px/s)
#define WAVE_AIR_ROT_SPEED     800.0f   // 空中翻滚旋转角速度 (deg/s)

// 海浪数学模型参数
#define WAVE_BASE_Y            210.0f   // 海平面基准基线 Y
#define WAVE_AMP_1             34.0f    // 主波浪振幅
#define WAVE_LEN_1             190.0f   // 主波浪波长
#define WAVE_SPEED_1           35.0f    // 主波浪推进相位速度
#define WAVE_AMP_2             11.0f    // 次级谐波波纹振幅
#define WAVE_LEN_2             85.0f    // 次级谐波波长
#define WAVE_SPEED_2           55.0f    // 次级谐波推进相位速度

// 判定角度阈值
#define WAVE_PERFECT_ENTRY_DEG 35.0f    // 完美切水入浪最大容许夹角差 (度)
#define WAVE_SLOPE_DOWN_MIN    0.06f    // 顺坡有效倾斜斜率阈值

// 游戏生命周期状态
typedef enum {
    WAVE_GAME_READY = 0,     // 待机准备状态 (静候起浪)
    WAVE_GAME_PLAYING,       // 冲浪奔行中
    WAVE_GAME_OVER           // 体力耗尽沉水结算
} wave_game_state_t;

// 小海獭运动姿态
typedef enum {
    WAVE_OTTER_SURFING = 0,  // 海面贴水滑行
    WAVE_OTTER_PUMPING,      // 顺坡压板加速俯冲 (压低重心)
    WAVE_OTTER_AIRBORNE,     // 浪尖腾空特技跃起
    WAVE_OTTER_DAZED         // 肚皮拍水后的搞笑甩头减速
} wave_otter_state_t;

// 障碍物类型
typedef enum {
    WAVE_OBS_NONE = 0,
    WAVE_OBS_CRAB,           // 调皮小螃蟹 (随浪起伏，贴水阻挡)
    WAVE_OBS_DRIFTWOOD,      // 漂流木 (横卧海面，需腾空跳过)
    WAVE_OBS_JELLYFISH       // 浮游发光水母 (空中浮动，触碰麻痹)
} wave_obs_type_t;

// 收集品类型
typedef enum {
    WAVE_ITEM_NONE = 0,
    WAVE_ITEM_STARFISH,      // 五角海星 (+10分)
    WAVE_ITEM_SHELL          // 珍珠贝壳 (+50分，可回复生命)
} wave_item_type_t;

// 粒子类型
typedef enum {
    WAVE_PART_NONE = 0,
    WAVE_PART_WATER_SPLASH,  // 普通滑水溅射水滴
    WAVE_PART_PUMP_SPRAY,    // 顺坡压板高压喷射尾迹
    WAVE_PART_RAINBOW_SPLASH,// 完美切水七彩彩虹水花
    WAVE_PART_BELLY_SPLASH,  // 肚皮拍水搞笑扩散大浪花
    WAVE_PART_STAR_SPARKLE   // 收集品星芒闪烁微粒
} wave_part_type_t;

// 音效事件
typedef enum {
    WAVE_SND_NONE = 0,
    WAVE_SND_SURF_RUSH,      // 波浪冲刷 / 顺坡加速疾驰声
    WAVE_SND_LAUNCH,         // 浪尖腾空跃起啸叫
    WAVE_SND_TRICK_SWOOSH,   // 空中特技旋转嗖嗖声
    WAVE_SND_PERFECT_ENTRY,  // 完美切水入浪水滴琶音
    WAVE_SND_BELLY_FLOP,     // 肚皮拍水咕噜声
    WAVE_SND_STAR_COLLECT,   // 拾取海星清脆水滴声
    WAVE_SND_SHELL_COLLECT,  // 拾取珍珠贝壳悦耳和弦
    WAVE_SND_HIT_OBSTACLE,   // 触碰障碍受创吃痛叫声
    WAVE_SND_GAMEOVER        // 沉水力竭游戏结束音
} wave_sound_t;

// 障碍物实体
typedef struct {
    bool active;
    wave_obs_type_t type;
    float x;                 // 世界绝对 X 坐标
    float y;                 // 纵向 Y 坐标
    float w;                 // 碰撞宽度
    float h;                 // 碰撞高度
    float anim_phase;        // 摆动浮动动画相位
    bool floats_on_surface;  // 是否依附波浪上下起伏
} wave_obs_t;

// 收集品实体
typedef struct {
    bool active;
    wave_item_type_t type;
    float x;                 // 世界绝对 X 坐标
    float y;                 // 纵向 Y 坐标
    float r;                 // 拾取有效半径
    float anim_timer;        // 悬浮律动计时
} wave_item_t;

// 粒子实体
typedef struct {
    bool active;
    wave_part_type_t type;
    float x;                 // 屏幕相对 X
    float y;                 // 屏幕相对 Y
    float vx;                // 速度 X (px/s)
    float vy;                // 速度 Y (px/s)
    float life_ms;           // 剩余生命时间 (ms)
    float max_life_ms;       // 总生命时间 (ms)
    float size;              // 粒子尺寸
} wave_particle_t;

// 游戏核心状态机结构体
typedef struct {
    wave_game_state_t game_state;
    wave_otter_state_t otter_state;

    // 海獭物理量
    float x;                 // 屏幕横坐标 (固定为 WAVE_OTTER_X)
    float y;                 // 屏幕垂直坐标 (贴水或空中)
    float vy;                // 纵向垂直速度 (px/s)
    float speed;             // 水平冲浪滑行速度 (px/s)
    float board_angle;       // 当前板面角度 (度数，顺时针为正)

    // 空中特技与翻滚
    float air_rotation;      // 本次腾空累计空中旋转度数
    int stunt_flips;         // 本次腾空已翻满 360° 的次数
    float air_rot_vel;       // 空中翻滚自转角速度 (deg/s)

    // 状态计时器 (毫秒)
    float daze_timer_ms;     // 肚皮拍水眩晕计时
    float boost_timer_ms;    // 完美切水爆发冲刺计时
    float invuln_timer_ms;   // 受击无敌闪烁计时
    float time_sec;          // 全局运行时间 (秒)
    float distance;          // 累计冲浪位移 (px)

    // 控制输入状态
    bool is_down_pressed;    // DOWN 键当前是否按住
    bool ok_leveling;        // OK 按住时，空中持续把板面对齐浪面

    // 属性与计分
    int hp;                  // 当前生命值 (初始 3)
    int max_hp;              // 最大生命值 (3)
    uint32_t score;          // 累计得分
    int starfish_count;      // 收集海星总数
    int shell_count;         // 收集贝壳总数
    int combo;               // 连续完美入浪连击数
    int max_combo;           // 历史最高连击

    // 音效通知队列
    wave_sound_t pending_sound;

    // 静态对象池 (零动态堆分配)
    wave_obs_t obstacles[WAVE_MAX_OBSTACLES];
    wave_item_t items[WAVE_MAX_ITEMS];
    wave_particle_t particles[WAVE_MAX_PARTICLES];

    // 生成管线管理
    float next_spawn_dist;   // 下一次生成实体的世界距离
    uint32_t rng_state;      // 伪随机数种子 (LCG)
} wave_game_t;

// 核心生命周期与更新接口
void wave_init(wave_game_t *game, uint32_t seed);
void wave_step(wave_game_t *game, uint32_t dt_ms);

// 平滑动态正弦海浪数学模型接口
float wave_get_surface_y(float x, float time);
float wave_get_slope(float x, float time);
float wave_get_tangent_angle(float x, float time);

// 游戏世界坐标系波浪计算辅助
float wave_get_game_surface_y(const wave_game_t *game, float screen_x);
float wave_get_game_tangent_angle(const wave_game_t *game, float screen_x);

// 按键输入交互接口 (UP / DOWN / OK)
void wave_input_up(wave_game_t *game);
void wave_input_down(wave_game_t *game);
void wave_input_down_press(wave_game_t *game);
void wave_input_down_release(wave_game_t *game);
void wave_input_ok(wave_game_t *game);
void wave_input_ok_hold(wave_game_t *game, bool held);

// 音效事件读取与清除
wave_sound_t wave_consume_sound(wave_game_t *game);

// 辅助算法工具函数
bool wave_is_down_slope(float tangent_angle);
float wave_angle_normalize_180(float deg);
float wave_angle_difference(float deg_a, float deg_b);

#ifdef __cplusplus
}
#endif
