// main/splasher_logic.h —— 《泡泡高压水枪狂欢节》(Hydro Splasher / 颜料大作战) 核心算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK, ES8311音频) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，与硬件和平台解耦。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

// =========================================================================
// 屏幕规格与发射基座参数
// =========================================================================
#define HS_SCREEN_W                 240
#define HS_SCREEN_H                 320

// 主角手持高压水枪底座位置 (左下方)
#define HS_GUN_BASE_X               24.0f
#define HS_GUN_BASE_Y               290.0f

// 枪口俯仰角限制 (-45.0° ~ +45.0°)
#define HS_AIM_MIN_DEG              (-45.0f)
#define HS_AIM_MAX_DEG              (45.0f)
#define HS_AIM_STEP_DEG             (3.0f)

// 发射基准仰角：实际向右上方绝对射角 alpha = HS_AIM_BASE_DEG + pitch_deg (0.0° ~ 90.0°)
// pitch = -45° 时为 0° 水平平射；pitch = 0° 时为 45° 经典抛射；pitch = +45° 时为 90° 垂直上射
#define HS_AIM_BASE_DEG             (45.0f)

// =========================================================================
// 水弹抛物线物理常数
// =========================================================================
#define HS_GRAVITY                  320.0f  // 重力加速度 (px/s^2)
#define HS_BULLET_SPEED_NORMAL      260.0f  // 普通水球初速 (px/s)
#define HS_BULLET_RADIUS            5.0f    // 水球碰撞半径 (px)

// =========================================================================
// 高压泵蓄力与水龙卷参数
// =========================================================================
#define HS_CHARGE_TIME_MS           600     // 水枪高压泵充能满所需毫秒数
#define HS_PUMP_HISS_INTERVAL_MS    150     // 充能期间水泵增压嗤嗤声音效间隔
#define HS_TORNADO_SPEED_X          420.0f  // 水龙卷横向推进速度 (px/s)
#define HS_TORNADO_DURATION_MS      800     // 水龙卷全屏暴风雨持续时间 (ms)
#define HS_TORNADO_WIDTH            60.0f   // 水龙卷横扫有效碰撞宽度 (px)

// =========================================================================
// 肥皂泡浮空物理参数
// =========================================================================
#define HS_BUBBLE_FLOAT_VY          (-65.0f)// 肥皂泡浮升速度 (px/s, 负值向上漂)
#define HS_OBSTACLE_HIT_THRESHOLD   2       // 重型路障承受击中包裹气泡阈值

// =========================================================================
// 静态对象池容量限制 (Zero dynamic malloc)
// =========================================================================
#define HS_MAX_BULLETS              16      // 水弹对象池
#define HS_MAX_TARGETS              8       // 场景黑白灰目标物体池
#define HS_MAX_NPCS                 6       // 打工人 NPC 对象池
#define HS_MAX_OBSTACLES            4       // 重型路障对象池
#define HS_MAX_PARTICLES            64      // 七彩颜料与水花粒子池
#define HS_MAX_SOUND_QUEUE          16      // 音效队列容量

// =========================================================================
// 枚举定义
// =========================================================================

// 游戏主状态
typedef enum {
    HS_STATE_READY = 0,     // 准备开局
    HS_STATE_PLAYING,       // 喷墨激战中
    HS_STATE_PAUSED,        // 暂停
    HS_STATE_VICTORY,       // 城市全复苏大狂欢胜利
    HS_STATE_GAMEOVER       // 游戏结束结算
} hs_game_state_t;

// 七彩颜料色谱
typedef enum {
    HS_COLOR_RED = 0,       // 热情红
    HS_COLOR_ORANGE,        // 活力橙
    HS_COLOR_YELLOW,        // 阳光黄
    HS_COLOR_GREEN,         // 生机绿
    HS_COLOR_CYAN,          // 清新青
    HS_COLOR_BLUE,          // 湛蓝海
    HS_COLOR_PURPLE,        // 幻梦紫
    HS_COLOR_COUNT
} hs_color_t;

// 灰度复苏物体类型 (办公室与街道沉闷道具)
typedef enum {
    HS_TARGET_PLANT = 0,    // 沉闷黑白盆栽 -> 完全复苏后开出七彩鲜花
    HS_TARGET_NEON_SIGN,    // 灰暗霓虹灯牌 -> 完全复苏后亮起闪烁彩光
    HS_TARGET_COFFEE_BAR,   // 冷清咖啡吧台 -> 完全复苏后冒出浓郁彩烟与旗帜
    HS_TARGET_CLOCK_TOWER   // 停摆灰色时钟 -> 完全复苏后指针欢快飞转
} hs_target_type_t;

// 打工人 NPC 服装与心理状态
typedef enum {
    HS_NPC_COSTUME_SUIT = 0,// 沉闷黑白西装 (紧绷疲惫)
    HS_NPC_COSTUME_HAWAIIAN // 热情夏威夷花衬衫 (换装解放)
} hs_npc_costume_t;

typedef enum {
    HS_NPC_STATE_TIRED_WALKING = 0, // 行色匆匆，面无表情低头赶路
    HS_NPC_STATE_DANCING            // 洗去疲惫，原地/小步开怀跳舞欢呼
} hs_npc_state_t;

// 重型路障类型 (需肥皂泡包裹浮空飘离)
typedef enum {
    HS_OBSTACLE_SAFE = 0,   // 重型铁皮文件保险柜
    HS_OBSTACLE_CONTAINER,  // 废弃生锈集装箱
    HS_OBSTACLE_CART        // 沉重堆叠杂物推车
} hs_obstacle_type_t;

// 粒子类型
typedef enum {
    HS_PART_NONE = 0,
    HS_PART_WATER_DROP,     // 晶莹水珠
    HS_PART_COLOR_INK,      // 七彩喷墨飞溅粒子
    HS_PART_SOAP_FOAM,      // 肥皂泡泡光斑
    HS_PART_CONFETTI        // 狂欢派对彩纸花瓣 / 音符
} hs_particle_type_t;

// 音效事件队列 (针对 ES8311 音频任务消费)
typedef enum {
    HS_SND_NONE = 0,
    HS_SND_SHOOT_NORMAL,    // 普通水球发射噗嗤声
    HS_SND_PUMP_HISS,       // 水泵增压高压充能嗤嗤声
    HS_SND_WATER_POP,       // 水球爆裂噗嗤声
    HS_SND_PAINT_SPLASH,    // 喷漆飞溅音 (色彩饱和度跃迁爆开)
    HS_SND_HAWAIIAN_CHEER,  // 夏威夷欢呼吉他琶音
    HS_SND_WHISTLE,         // 派对狂欢口哨声
    HS_SND_TORNADO_BURST,   // 超高压水龙卷暴风雨呼啸轰鸣
    HS_SND_BUBBLE_WRAP,     // 巨型肥皂泡包裹与浮空轻响
    HS_SND_STAGE_CLEAR,     // 场景全复苏胜利欢呼
    HS_SND_GAMEOVER         // 狂欢落幕悲鸣
} hs_sound_t;

// =========================================================================
// 实体结构体定义
// =========================================================================

// 水弹实体
typedef struct {
    bool active;
    float x;
    float y;
    float vx;               // 水平飞行速度 (px/s)
    float vy;               // 垂直飞行速度 (px/s)
    float radius;           // 碰撞判定半径
    hs_color_t color;       // 所带颜料色彩
} splasher_bullet_t;

// 灰度复苏物体实体
typedef struct {
    bool active;
    hs_target_type_t type;
    float x;                // 左上角 X
    float y;                // 左上角 Y
    float w;                // 碰撞盒宽度
    float h;                // 碰撞盒高度
    float saturation;       // 色彩饱和度 (0.0f ~ 1.0f, 初始为 0.0f)
    bool is_fully_revived;  // 是否达到 100% 饱和度完全复苏 (开花/灯亮)
    uint32_t hit_count;     // 被水弹命中次数
    hs_color_t dominant_color; // 主要浸润颜料颜色
} splasher_target_t;

// 打工人 NPC 实体
typedef struct {
    bool active;
    hs_npc_costume_t costume;
    hs_npc_state_t state;
    float x;
    float y;
    float w;
    float h;
    float vx;               // 赶路移动速度 (px/s)
    float min_x;            // 巡逻折返左边界
    float max_x;            // 巡逻折返右边界
    float dance_timer_ms;   // 跳舞欢呼累计时间
    float dance_phase;      // 律动相位
} splasher_npc_t;

// 重型路障实体 (支持肥皂泡浮空机制)
typedef struct {
    bool active;
    hs_obstacle_type_t type;
    float x;
    float y;
    float w;
    float h;
    float vx;               // 横向推力速度
    float vy;               // 垂直速度 (肥皂泡包裹后为向上负值浮升)
    int hit_count;          // 承受击中次数
    bool is_bubbled;        // 是否被巨型肥皂泡包裹悬浮
    float bubble_radius;    // 包裹泡泡当前半径
} splasher_obstacle_t;

// 超高压水龙卷实体
typedef struct {
    bool active;
    float x;
    float y;
    float vx;
    float width;
    float height;
    uint32_t life_ms;
    uint32_t max_life_ms;
} splasher_tornado_t;

// 动态粒子实体
typedef struct {
    bool active;
    hs_particle_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float gravity;
    float life_ms;
    float max_life_ms;
    float size;
    hs_color_t color;
} splasher_particle_t;

// 音效环形队列
typedef struct {
    hs_sound_t queue[HS_MAX_SOUND_QUEUE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
} splasher_sound_queue_t;

// =========================================================================
// 核心游戏状态机结构体
// =========================================================================
typedef struct {
    hs_game_state_t state;
    uint32_t rng_state;

    // 水枪位置与俯仰角
    float gun_base_x;
    float gun_base_y;
    float pitch_deg;            // 枪口俯仰角: -45.0° ~ +45.0°

    // OK 键高压泵充能系统
    bool ok_pressed;
    uint32_t charge_time_ms;
    float charge_ratio;         // 0.0f ~ 1.0f (达 1.0f 释放水龙卷)
    uint32_t pump_hiss_timer_ms;// 增压音效间隔计时器

    // 统计与分数
    uint32_t score;
    uint32_t combo;
    uint32_t max_combo;
    uint32_t combo_timer_ms;
    uint32_t game_time_ms;

    // 复苏进度与过关判定
    uint32_t targets_total;
    uint32_t targets_revived;
    uint32_t npcs_total;
    uint32_t npcs_saved;
    uint32_t obstacles_total;
    uint32_t obstacles_cleared;
    float revival_progress;     // 综合复苏率 (0.0f ~ 1.0f)

    // 调色盘
    hs_color_t current_color;

    // 音效事件队列
    splasher_sound_queue_t sound_q;

    // 静态对象池 (零动态分配)
    splasher_bullet_t bullets[HS_MAX_BULLETS];
    splasher_target_t targets[HS_MAX_TARGETS];
    splasher_npc_t npcs[HS_MAX_NPCS];
    splasher_obstacle_t obstacles[HS_MAX_OBSTACLES];
    splasher_particle_t particles[HS_MAX_PARTICLES];
    splasher_tornado_t tornado;
} splasher_game_t;

// =========================================================================
// 核心生命周期 API
// =========================================================================
void splasher_game_init(splasher_game_t *g, uint32_t seed);
void splasher_game_reset(splasher_game_t *g);
void splasher_game_pause(splasher_game_t *g);
void splasher_game_resume(splasher_game_t *g);
void splasher_game_step(splasher_game_t *g, uint32_t dt_ms);
bool splasher_game_is_victory(const splasher_game_t *g);
bool splasher_game_is_game_over(const splasher_game_t *g);
bool splasher_game_is_paused(const splasher_game_t *g);

// =========================================================================
// 交互与按键输入 API
// =========================================================================
void splasher_input_up(splasher_game_t *g);             // UP 键：仰角微调抬高 (+3°)
void splasher_input_down(splasher_game_t *g);           // DOWN 键：仰角微调压低 (-3°)
void splasher_input_set_pitch(splasher_game_t *g, float pitch_deg); // 显式设置并在 [-45°, +45°] 钳制
float splasher_get_pitch(const splasher_game_t *g);     // 获取当前俯仰角
float splasher_get_absolute_launch_angle(const splasher_game_t *g); // 获取实际发射仰角 (0° ~ 90°)

void splasher_input_ok_press(splasher_game_t *g);       // 按下 OK：开始高压泵充能
void splasher_input_ok_release(splasher_game_t *g);     // 松开 OK：短按普通水球 / 蓄满释放水龙卷

bool splasher_shoot_normal(splasher_game_t *g);        // 短按单发普通水球
bool splasher_release_tornado(splasher_game_t *g);     // 释放超高压水龙卷暴风雨

// =========================================================================
// 音效事件 API (供音频消费线程使用)
// =========================================================================
hs_sound_t splasher_sound_dequeue(splasher_game_t *g);
hs_sound_t splasher_sound_peek(const splasher_game_t *g);
void splasher_sound_clear(splasher_game_t *g);
bool splasher_sound_enqueue(splasher_game_t *g, hs_sound_t snd);

// =========================================================================
// 关卡编排与实体查询 API (供单元测试与视图渲染使用)
// =========================================================================
int splasher_spawn_target(splasher_game_t *g, hs_target_type_t type, float x, float y, float w, float h);
int splasher_spawn_npc(splasher_game_t *g, float x, float y, float vx, float min_x, float max_x);
int splasher_spawn_obstacle(splasher_game_t *g, hs_obstacle_type_t type, float x, float y, float w, float h);

int splasher_get_active_bullet_count(const splasher_game_t *g);
int splasher_get_active_particle_count(const splasher_game_t *g);
int splasher_get_revived_target_count(const splasher_game_t *g);
int splasher_get_saved_npc_count(const splasher_game_t *g);
int splasher_get_bubbled_obstacle_count(const splasher_game_t *g);
float splasher_get_revival_progress(const splasher_game_t *g);

#ifdef __cplusplus
}
#endif
