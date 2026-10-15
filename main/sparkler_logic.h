#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SPARKLER_SCREEN_W 240
#define SPARKLER_SCREEN_H 320

#define SPARKLER_MAX_PARTICLES 128

// 仙女棒几何尺寸 (像素)
#define SPARKLER_STICK_X       120.0f
#define SPARKLER_WICK_TOP       60.0f
#define SPARKLER_WICK_BOTTOM   240.0f
#define SPARKLER_BASE_BURN_RATE 0.05f  // 基准燃烧速度 (每秒推进 5% 进度，约 20 秒燃尽)

// 蜡烛几何与物理参数
#define CANDLE_BASE_X          120.0f
#define CANDLE_BASE_Y          250.0f
#define CANDLE_INIT_WAX_HEIGHT 100.0f
#define CANDLE_MIN_WAX_HEIGHT   20.0f
#define CANDLE_MELT_RATE         1.2f  // 蜡油融化速度 (px/秒)
#define CANDLE_SMOKE_DURATION_MS 1500  // 熄灭后冒烟持续时间 (ms)
#define CANDLE_BLOW_EXTINGUISH_THRESHOLD 0.70f // 吹气熄灭阈值
#define CANDLE_BLOW_EXTINGUISH_HOLD_MS    200  // 吹气熄灭持续时间 (ms)

// 模式枚举
typedef enum {
    MODE_SPARKLER = 0, // 仙女棒燃烧模式
    MODE_CANDLE = 1,   // 蜡烛燃烧模式
} sparkler_mode_t;

// 粒子类型枚举
typedef enum {
    PARTICLE_SPARK = 0, // 仙女棒普通金黄飞溅火花
    PARTICLE_BURST = 1, // 里程碑爆发高能彩色火花
    PARTICLE_SMOKE = 2, // 熄灭冒烟微粒 (青烟/灰白)
    PARTICLE_EMBER = 3, // 掉落灰烬火星 (暗红)
} sparkler_particle_type_t;

// 粒子对象池结构体 (x, y, vx, vy, life_ms, max_life_ms, brightness, type)
typedef struct {
    float x;
    float y;
    float vx;
    float vy;
    uint32_t life_ms;
    uint32_t max_life_ms;
    float brightness; // 0.0f ~ 1.0f 亮度衰减
    uint8_t type;     // sparkler_particle_type_t
    bool active;      // 是否激活
    uint32_t color;   // RGB888 颜色
} sparkler_particle_t;

// 仙女棒系统状态
typedef struct {
    float wick_progress;      // 燃烧进度 (0.0f 到 1.0f)
    bool is_lit;              // 是否正在燃烧 (燃尽后为 false)
    uint8_t milestone_mask;   // 里程碑位掩码 (bit0: 25%, bit1: 50%, bit2: 75%, bit3: 100%)
    int last_milestone;       // 最近触发的里程碑 (25, 50, 75, 100，未触发为 0)
    bool milestone_triggered; // 当前帧是否触发了里程碑爆发事件 (单帧脉冲)
    int burst_count;          // 爆发触发总次数 (0 ~ 4)
    float spawn_accum;        // 粒子发射浮点累加器
} sparkler_wand_t;

// 蜡烛系统状态
typedef struct {
    bool is_lit;              // 是否点燃
    bool is_smoking;          // 是否处于冒烟状态
    uint32_t smoke_timer_ms;  // 冒烟剩余时间 (ms)
    float wax_height;         // 剩余蜡烛蜡身高度 (px)
    float wax_melt_height;    // 蜡油融化高度 / 累积融深 (px)
    float flicker;            // 火苗晃动幅度 (0.0f ~ 1.0f)
    float flame_angle;        // 火苗倾斜角度 (度数)
    uint32_t blow_hold_ms;    // 猛吹 (> 0.7) 累积持续时间 (ms)
    uint32_t smoke_accum_ms;  // 冒烟微粒发射计时
} candle_t;

// 游戏总状态机
typedef struct {
    sparkler_mode_t mode;     // 当前模式 (MODE_SPARKLER 或 MODE_CANDLE)
    
    // 麦克风吹气互动输入
    float blow_intensity;     // 吹气强度 (0.0f ~ 1.0f)
    
    // 参数微调 (通过 UP/DOWN 调节)
    float burn_speed_mult;    // 燃烧速度倍率 (0.25f ~ 3.0f, 默认 1.0f)
    float particle_density;   // 粒子密度倍率 (0.25f ~ 3.0f, 默认 1.0f)
    
    // 双模式子状态
    sparkler_wand_t sparkler;
    candle_t candle;
    
    // 粒子对象池
    sparkler_particle_t particles[SPARKLER_MAX_PARTICLES];
    
    // 运行指标与时间
    uint32_t rng_state;       // 轻量伪随机数生成器状态
    uint32_t tick_count;      // 步进帧计数
    uint32_t total_time_ms;   // 总累计运行时间 (ms)
} sparkler_state_t;

// 核心生命周期接口
void sparkler_init(sparkler_state_t *s, sparkler_mode_t mode);
void sparkler_step(sparkler_state_t *s, uint32_t dt_ms);
void sparkler_switch_mode(sparkler_state_t *s, sparkler_mode_t mode);
void sparkler_reignite(sparkler_state_t *s);

// 麦克风互动接口
void sparkler_set_blow(sparkler_state_t *s, float blow_intensity);

// 按键接口
void sparkler_btn_ok(sparkler_state_t *s);
void sparkler_btn_up(sparkler_state_t *s);
void sparkler_btn_down(sparkler_state_t *s);

// 参数调节接口
void sparkler_set_burn_speed(sparkler_state_t *s, float speed_mult);
void sparkler_set_particle_density(sparkler_state_t *s, float density_mult);

// 状态与视觉坐标查询辅助接口
int sparkler_active_particle_count(const sparkler_state_t *s);
void sparkler_get_burn_point(const sparkler_state_t *s, float *out_x, float *out_y);
void sparkler_get_flame_point(const sparkler_state_t *s, float *out_x, float *out_y);

#ifdef __cplusplus
}
#endif
