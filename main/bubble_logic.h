// main/bubble_logic.h —— 《飞针破泡录》(Bubble Needle) 核心游戏算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无 ESP-IDF/LVGL/FreeRTOS 依赖。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕规格
#define BUBBLE_SCREEN_W              240
#define BUBBLE_SCREEN_H              320

// 发射底座与瞄准参数
#define BUBBLE_BASE_X                120.0f
#define BUBBLE_BASE_Y                305.0f
#define BUBBLE_AIM_MIN_DEG           (-60.0f)
#define BUBBLE_AIM_MAX_DEG           (60.0f)
#define BUBBLE_AIM_STEP_DEG          (3.0f)

// 蓄力参数
#define BUBBLE_CHARGE_TIME_MS        600     // 蓄力 600ms 发射旋风大钢针

// 对象池容量 (静态固定分配)
#define BUBBLE_MAX_NEEDLES           8       // 飞针对象池容量
#define BUBBLE_MAX_BUBBLES           32      // 气泡对象池容量
#define BUBBLE_MAX_PARTICLES         64      // 水花/火花粒子池容量
#define BUBBLE_MAX_SOUND_QUEUE       16      // 音效事件队列容量

// 飞针物理属性
#define BUBBLE_NEEDLE_SPEED_NORMAL   380.0f  // 普通飞针初速 (px/s)
#define BUBBLE_NEEDLE_SPEED_CHARGED  540.0f  // 旋风大钢针初速 (px/s)
#define BUBBLE_NEEDLE_RADIUS_NORMAL  3.0f    // 普通飞针碰撞半径
#define BUBBLE_NEEDLE_RADIUS_CHARGED 6.0f    // 旋风大钢针碰撞半径
#define BUBBLE_NEEDLE_LENGTH_NORMAL  14.0f   // 普通飞针身长
#define BUBBLE_NEEDLE_LENGTH_CHARGED 24.0f   // 旋风大钢针身长

// 玩法特效参数
#define BUBBLE_THUNDER_RADIUS        65.0f   // 雷云泡电弧引爆半径 (px)
#define BUBBLE_FREEZE_DURATION_MS    3000    // 冰冻泡减速持续时间 3秒
#define BUBBLE_COMBO_TIMEOUT_MS      2000    // 连击判定保持时间 2秒
#define BUBBLE_DEFAULT_LIVES         3       // 默认生命数 (允许漏掉3个气泡)
#define BUBBLE_SPAWN_INTERVAL_MS     1100    // 默认生成气泡间隔

// 游戏状态
typedef enum {
    BUBBLE_STATE_READY = 0,     // 准备开局
    BUBBLE_STATE_PLAYING,       // 激战中
    BUBBLE_STATE_PAUSED,        // 暂停中
    BUBBLE_STATE_GAMEOVER       // 游戏结束结算
} bubble_state_t;

// 气泡特色类型
typedef enum {
    BUBBLE_TYPE_RAINBOW = 0,    // 普通薄膜彩虹泡 (一击即破)
    BUBBLE_TYPE_HARDENED,       // 双层硬化泡 (需命中2次破壳)
    BUBBLE_TYPE_THUNDER,        // 雷云泡 (释放电弧引爆周围气泡)
    BUBBLE_TYPE_FROZEN,         // 冰冻泡 (全屏气泡悬停减速3秒)
    BUBBLE_TYPE_GOLD            // 金币泡 (刺破获得额外奖励高分)
} bubble_type_t;

// 飞针类型
typedef enum {
    BUBBLE_NEEDLE_NORMAL = 0,   // 短按普通单发飞针
    BUBBLE_NEEDLE_PIERCING      // 长按蓄力“旋风大钢针”，穿透全屏
} bubble_needle_type_t;

// 粒子类型
typedef enum {
    BUBBLE_PART_NONE = 0,
    BUBBLE_PART_WATER_SPLASH,   // 水花水珠飞溅
    BUBBLE_PART_LIGHTNING_SPARK,// 雷电电弧火花
    BUBBLE_PART_ICE_CRYSTAL,    // 冰晶碎屑
    BUBBLE_PART_GOLD_SHINE,     // 金币光点
    BUBBLE_PART_RING            // 破裂冲击环
} bubble_particle_type_t;

// 音效事件 (供 I2S 音频任务无锁并发队列消费)
typedef enum {
    BUBBLE_SND_NONE = 0,
    BUBBLE_SND_SHOOT,           // 发射普通飞针
    BUBBLE_SND_SHOOT_CHARGED,   // 发射旋风大钢针
    BUBBLE_SND_WALL_BOUNCE,     // 侧壁反弹金属清脆音
    BUBBLE_SND_POP_1,           // 连破音阶 1 (Do)
    BUBBLE_SND_POP_2,           // 连破音阶 2 (Re)
    BUBBLE_SND_POP_3,           // 连破音阶 3 (Mi)
    BUBBLE_SND_POP_4,           // 连破音阶 4 (Fa)
    BUBBLE_SND_POP_5,           // 连破音阶 5 (Sol及以上高潮音)
    BUBBLE_SND_HARD_HIT,        // 双层硬化泡外层破裂破壳音
    BUBBLE_SND_THUNDER_BLAST,   // 雷云泡电弧连锁引爆震鸣
    BUBBLE_SND_FREEZE,          // 冰冻冰封凝结音
    BUBBLE_SND_COIN,            // 金币泡破裂金币掉落音
    BUBBLE_SND_COMBO_BREAK,     // 连击脱靶中断音
    BUBBLE_SND_GAMEOVER         // 游戏结束悲鸣
} bubble_sound_t;

// 飞针实体
typedef struct {
    bool active;
    bubble_needle_type_t type;
    float x;
    float y;
    float vx;                   // 水平飞行速度 (px/s)
    float vy;                   // 垂直飞行速度 (px/s)
    float radius;               // 碰撞检测半径
    float length;               // 渲染用飞针长度
    uint32_t hit_count;         // 本次射击命中的气泡总数
    uint32_t bounce_count;      // 侧壁反弹次数
    uint32_t hit_bubble_mask;   // 穿透针位掩码：防止单针在同一气泡多帧重复触发伤害
} bubble_needle_t;

// 气泡实体
typedef struct {
    bool active;
    bubble_type_t type;
    float x;
    float y;
    float vx;                   // 横向扰动漂移速度
    float vy;                   // 垂直向上浮升速度 (负值)
    float base_vy;              // 固有浮升基速 (用于解除冰冻恢复)
    float radius;               // 气泡半径
    int hp;                     // 当前生命值 (普通1, 硬化2)
    int max_hp;                 // 初始生命值
    float wobble_phase;         // 正弦波漂移相位 (rad)
    float wobble_speed;         // 漂移角速度
    float wobble_amp;           // 漂移振幅 (px)
} bubble_t;

// 动态粒子实体
typedef struct {
    bool active;
    bubble_particle_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life_ms;
    float max_life_ms;
    float size;
} bubble_particle_t;

// 音效环形队列
typedef struct {
    bubble_sound_t queue[BUBBLE_MAX_SOUND_QUEUE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
} bubble_sound_queue_t;

// 核心游戏状态机
typedef struct {
    bubble_state_t state;
    uint32_t rng_state;

    // 发射底座与瞄准
    float base_x;
    float base_y;
    float aim_angle_deg;        // -60° ~ +60°，0° 为竖直向上

    // 蓄力射击逻辑
    bool ok_pressed;
    uint32_t charge_time_ms;
    bool is_charged;            // 蓄力达到阈值

    // 局内数据与积分
    int lives;                  // 剩余生命心数 (逃出顶部扣除)
    uint32_t score;             // 累计得分
    uint32_t max_combo;         // 单局最高连击
    uint32_t combo_count;       // 当前连击数
    uint32_t combo_timer_ms;    // 连击时间窗口倒计时

    // 局势与特效计时
    uint32_t freeze_timer_ms;   // 全屏气泡冰冻剩余时间 (ms)
    uint32_t spawn_timer_ms;    // 下一个气泡生成计时
    uint32_t spawn_interval_ms; // 气泡生成间隔 (动态递减提速)
    uint32_t game_time_ms;      // 游戏运行累计时长

    // 统计指标
    uint32_t bubbles_popped;    // 刺破气泡总数
    uint32_t bubbles_escaped;   // 漏过顶部气泡数
    uint32_t needles_fired;     // 射击次数

    // 音效通知
    bubble_sound_t pending_sound; // 兼容直接单音轮询
    bubble_sound_queue_t sound_q;// 完整音效队列

    // 静态对象池
    bubble_needle_t needles[BUBBLE_MAX_NEEDLES];
    bubble_t bubbles[BUBBLE_MAX_BUBBLES];
    bubble_particle_t particles[BUBBLE_MAX_PARTICLES];
} bubble_game_t;

// =========================================================================
// 核心生命周期 API
// =========================================================================
void bubble_game_init(bubble_game_t *g, uint32_t seed);
void bubble_game_reset(bubble_game_t *g);
void bubble_game_pause(bubble_game_t *g);
void bubble_game_resume(bubble_game_t *g);
void bubble_game_step(bubble_game_t *g, uint32_t dt_ms);
bool bubble_game_is_game_over(const bubble_game_t *g);
bool bubble_game_is_paused(const bubble_game_t *g);

// =========================================================================
// 用户交互与按键输入 API
// =========================================================================
void bubble_input_up(bubble_game_t *g);              // UP 键：瞄准角度微调向左 (-步进，平滑步进)
void bubble_input_down(bubble_game_t *g);            // DOWN 键：瞄准角度微调向右 (+步进，平滑步进)
void bubble_input_set_aim_angle(bubble_game_t *g, float angle_deg); // 显式设置瞄准角 (-60° ~ +60°)

void bubble_input_ok_press(bubble_game_t *g);        // OK 键按下：开启蓄力计时
void bubble_input_ok_release(bubble_game_t *g);      // OK 键释放：判定短按/长按并击发

bool bubble_shoot_normal(bubble_game_t *g);         // 快速单发普通飞针
bool bubble_shoot_charged(bubble_game_t *g);        // 击发旋风大钢针 (穿透全屏)

// =========================================================================
// 音效事件处理 API
// =========================================================================
bubble_sound_t bubble_sound_dequeue(bubble_game_t *g);
bubble_sound_t bubble_sound_peek(const bubble_game_t *g);
void bubble_sound_clear(bubble_game_t *g);

// =========================================================================
// 气泡与实体管理 (用于单元测试与关卡编排)
// =========================================================================
int bubble_spawn(bubble_game_t *g, bubble_type_t type, float x, float y, float vy, float radius);
int bubble_get_active_count(const bubble_game_t *g);
int bubble_get_needle_count(const bubble_game_t *g);
int bubble_get_particle_count(const bubble_game_t *g);
bool bubble_is_frozen(const bubble_game_t *g);

#ifdef __cplusplus
}
#endif
