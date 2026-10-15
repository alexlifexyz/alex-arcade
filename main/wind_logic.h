// main/wind_logic.h —— 《风与纸翼》(Wind Rider) 纯 C 状态机算法引擎
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计
// 极致心流与翱翔体验，永不坠毁死亡机制，纯数学平滑山丘地形与流体力学升力模拟
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕规格 (ESP32-C3 240x320 竖屏)
#define WIND_SCREEN_W           240
#define WIND_SCREEN_H           320

// 纸飞机在屏幕上的水平锚定基准 (留出右侧前瞻视野)
#define WIND_PLAYER_SCREEN_X    56.0f

// 物理学常数与极值限制
#define WIND_BASE_GROUND_Y      220.0f   // 地形平均基准高度
#define WIND_MIN_ALTITUDE_Y     15.0f    // 飞行高度上限 (靠近屏幕顶部)
#define WIND_CRUISE_SPEED_X     120.0f   // 默认水平巡航速度 (px/s)
#define WIND_MIN_SPEED_X        60.0f    // 最低保底速度 (确保永不卡死停滞)
#define WIND_MAX_SPEED_X        360.0f   // 冲刺最大水平速度 (px/s)
#define WIND_GRAVITY_NORMAL     260.0f   // 常态重力加速度 (px/s^2)
#define WIND_GRAVITY_DIVE       620.0f   // 按住 OK 极速俯冲重力加速度 (px/s^2)
#define WIND_LIFT_FACTOR        0.58f    // 迎风机翼升力转换系数
#define WIND_GLIDE_FRICTION     0.985f   // 草地滑行摩擦保留系数

// 静态对象池容量限制 (Zero dynamic malloc)
#define WIND_MAX_RINGS          6        // 气流环对象池
#define WIND_MAX_COLLECTIBLES   12       // 收集物对象池 (蒲公英飞絮/风之水晶)
#define WIND_MAX_PARTICLES      36       // 动态粒子池 (草屑/尾迹/气流爆裂/星光)
#define WIND_MAX_TRAIL          16       // 飞机后方翼尖风痕节点池

// 纸飞机飞行动作姿态
typedef enum {
    WIND_STANCE_SOAR = 0,    // 展翼高空自由翱翔 (平稳升力平衡)
    WIND_STANCE_DIVE,        // 收拢双翼急速俯冲 (蓄积动能势能)
    WIND_STANCE_GLIDE,       // 贴地草坪滑行冲刺 (草屑飞扬，不伤机身)
    WIND_STANCE_BOOST        // 穿环疾速狂飙 (气流风痕环绕)
} wind_stance_t;

// 收集物类型
typedef enum {
    WIND_COLLECT_NONE = 0,
    WIND_COLLECT_DANDELION,  // 蒲公英飞絮 (+10分，恢复微量风能)
    WIND_COLLECT_CRYSTAL     // 风之水晶 (+50分，高空或谷底丰厚回馈)
} wind_collect_type_t;

// 粒子类型
typedef enum {
    WIND_PART_NONE = 0,
    WIND_PART_TRAIL,         // 纸飞机翼尖划过的白色空气切线
    WIND_PART_GRASS,         // 贴地滑行激起的翡翠色草屑碎叶
    WIND_PART_RING_BURST,    // 穿过气流光环爆裂的气旋辉光
    WIND_PART_CRYSTAL_SPARK, // 水晶拾取迸射的七彩星芒
    WIND_PART_DANDELION_SEED // 蒲公英绒毛随风轻扬
} wind_part_type_t;

// 日夜与天色心流流转阶段 (随总飞行距离循环变化)
typedef enum {
    WIND_SKY_GOLDEN_DAWN = 0, // 晨曦金辉 (温暖朝霞，金光洒满山脊)
    WIND_SKY_CRIMSON_SUNSET,  // 落日紫霞 (瑰丽晚霞，粉紫渐变)
    WIND_SKY_TWILIGHT,        // 暮色幽蓝 (静谧黛蓝，远山成影)
    WIND_SKY_STARRY_NIGHT,    // 璀璨星空 (深邃夜空，银河繁星)
    WIND_SKY_AURORA_DAWN,     // 极光拂晓 (绚烂极光漫卷，重归晨光)
    WIND_SKY_PHASE_COUNT
} wind_sky_phase_t;

// 音效触发事件 (供音频模块无锁读取)
typedef enum {
    WIND_SND_NONE = 0,
    WIND_SND_DIVE,           // 俯冲破风呼啸声
    WIND_SND_SOAR,           // 展翼升空翱翔声
    WIND_SND_RING,           // 穿过气流光环的空灵清脆风铃音
    WIND_SND_GLIDE,          // 草地贴地滑行沙沙声
    WIND_SND_CRYSTAL,        // 拾取风之水晶叮咚和弦
    WIND_SND_DANDELION       // 拾取蒲公英柔和绒音
} wind_sound_t;

// 上升气流光环结构
typedef struct {
    bool active;
    float x;                 // 世界横坐标
    float y;                 // 世界纵坐标
    float radius;            // 判定半径
    bool passed;             // 是否已经被穿过
    float pulse_phase;       // 呼吸脉动相位
} wind_ring_t;

// 收集物结构 (蒲公英飞絮 / 风之水晶)
typedef struct {
    bool active;
    wind_collect_type_t type;
    float x;                 // 世界横坐标
    float y;                 // 世界纵坐标
    float base_y;            // 浮动中心基准 Y
    float bob_phase;         // 上下轻盈浮动相位
    bool collected;          // 是否已拾取
} wind_collectible_t;

// 动态环境与特效微粒
typedef struct {
    bool active;
    wind_part_type_t type;
    float x;                 // 世界横坐标
    float y;                 // 世界纵坐标
    float vx;                // 速度 X
    float vy;                // 速度 Y
    float life_ms;           // 剩余生命时间
    float max_life_ms;       // 初始总生命时间
    float size;              // 粒子大小
    uint32_t color_rgb;      // 粒子色彩参考值
} wind_particle_t;

// 翼尖飘逸风痕尾迹节点
typedef struct {
    float x;
    float y;
    float alpha;             // 不透明度 (1.0 -> 0.0)
} wind_trail_node_t;

// 纸飞机与风之世界主核心状态机
typedef struct {
    // 纸飞机飞行物理参数
    float x;                 // 世界总距离 / X 坐标 (px)
    float y;                 // 飞机中心 Y 坐标 (0 为天空顶部，320 为屏幕底部)
    float vx;                // 水平飞行速度 (px/s)
    float vy;                // 垂直升降速度 (px/s, 负为上升，正为下降)
    float pitch_deg;         // 机身俯仰角 (-60度 ~ +60度, 负为俯冲低头, 正为仰冲抬头)
    float pitch_trim;        // UP/DOWN 按键输入的俯仰微调偏移量
    int8_t pitch_hold;       // -1 按住低头, 0 未按, +1 按住抬头
    wind_stance_t stance;    // 当前飞行姿态
    bool is_ok_holding;      // OK 键是否保持按下 (收拢双翼下潜蓄力)
    bool on_ground;          // 是否正贴着草地滑行
    float energy;            // 风能储备 (0.0 ~ 100.0)
    float boost_timer_ms;    // 穿环加速冲刺剩余时间 (ms)
    float dive_charge_ms;    // 持续俯冲蓄力时长 (ms)

    // 统计与游戏心流进度
    float distance;          // 总飞行距离 (米 / 像素)
    uint32_t score;          // 探索得分
    uint16_t dandelion_count;// 蒲公英收集数
    uint16_t crystal_count;  // 风之水晶收集数
    uint16_t ring_combo;     // 气流环连续穿过连击数
    uint16_t max_ring_combo; // 最高连击记录
    float max_altitude;      // 最高冲云记录 (Y 最小值对应的飞行高度)
    float flight_time_s;     // 累计飞行秒数
    wind_sky_phase_t sky_phase;     // 当前天色时段
    float sky_progress;      // 当前天色过渡进度 (0.0f ~ 1.0f)

    // 静态对象池
    wind_ring_t rings[WIND_MAX_RINGS];
    wind_collectible_t collectibles[WIND_MAX_COLLECTIBLES];
    wind_particle_t particles[WIND_MAX_PARTICLES];
    wind_trail_node_t trail[WIND_MAX_TRAIL];
    uint8_t trail_head;

    // 伪随机数发生器内部状态 (保证全平台确定性与零依赖)
    uint32_t rng_state;

    // 音频与事件通知
    wind_sound_t pending_sound;
} wind_game_t;

// =========================================================================
// API 核心接口函数声明
// =========================================================================

// 计算世界距离 distance 处的纯数学平滑丘陵地表 Y 坐标
float wind_get_ground_height(float distance);

// 计算世界距离 distance 处的丘陵切线斜率 (dy/dx)
float wind_get_ground_slope(float distance);

// 初始化游戏状态机与静态对象池
void wind_init(wind_game_t *g, uint32_t seed);

// 重置游戏为起始状态
void wind_reset(wind_game_t *g);

// 输入响应：OK 键按下与松开 (true: 收紧双翼俯冲, false: 展开双翼乘风翱翔)
void wind_input_ok(wind_game_t *g, bool pressed);

// 输入响应：UP 键微调抬头仰角 (+微量迎角，获取额外升力)
void wind_input_pitch_up(wind_game_t *g);

// 输入响应：DOWN 键微调低头俯角 (+微量下切角，换取前向重力加速度)
void wind_input_pitch_down(wind_game_t *g);

// 按住抬头/低头。dir 为 +1、0 或 -1，按住期间每帧持续给舵，松开传 0。
void wind_input_pitch_hold(wind_game_t *g, int dir);

// 核心物理与状态机步进 (dt_ms: 步进毫秒数，通常为 16ms 或 20ms)
void wind_step(wind_game_t *g, uint32_t dt_ms);

// 读取并消费待播放的音效事件 (无锁消费)
wind_sound_t wind_consume_sound(wind_game_t *g);

// 获取当前天色天空顶层与底层渐变色彩 (用于渲染器，24-bit 0xRRGGBB)
void wind_get_sky_colors(wind_sky_phase_t phase, float progress, uint32_t *out_top_rgb, uint32_t *out_bot_rgb);

#ifdef __cplusplus
}
#endif
