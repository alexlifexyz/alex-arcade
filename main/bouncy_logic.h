// main/bouncy_logic.h —— 《回声几何弹射枪》(Bouncy Blaster / 橡胶弹球大师) 核心状态机算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 打造。
// 纯 C11 编写，零动态堆分配 (Zero malloc/free)，无 ESP-IDF/LVGL/FreeRTOS 依赖。

#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕规格与几何基准
#define BB_SCREEN_W                  240
#define BB_SCREEN_H                  320

// 瞄准角度参数 (以正上方为 90度，向左增大到 170度，向右减小到 10度)
#define BB_AIM_MIN_DEG               10.0f
#define BB_AIM_MAX_DEG               170.0f
#define BB_AIM_STEP_DEG              1.5f     // 高精细 1.5° 步进
#define BB_AIM_DEFAULT_DEG           90.0f    // 默认垂直向上瞄准

// 物理与弹射参数
#define BB_BULLET_SPEED              440.0f   // 橡胶弹极高初速 (px/s)
#define BB_BULLET_RADIUS             3.5f     // 橡胶弹半径
#define BB_MAX_BOUNCES               10       // 最大反弹次数 (8~12次)
#define BB_BOUNCE_RESTITUTION        0.98f    // 橡胶高弹性恢复系数
#define BB_DEFAULT_AMMO              3        // 每关固定弹药数 (3颗橡胶弹)
#define BB_TRAJECTORY_MAX_REFLECT    3        // 预判虚线折射次数 (未来 2~3 次反射)

// 特工参数与搞笑自伤判定
#define BB_AGENT_X                   120.0f   // 特工站立基准 X
#define BB_AGENT_Y                   295.0f   // 特工站立基准 Y
#define BB_AGENT_GUN_OFFSET_Y        (-12.0f) // 枪口相对于站立点垂直偏移
#define BB_AGENT_HEAD_OFFSET_Y       (-18.0f) // 头部相对于站立点垂直偏移
#define BB_AGENT_HEAD_RADIUS         11.0f    // 头部受击判定圆半径 (用于自伤判定)
#define BB_AGENT_DIZZY_DURATION_MS   1500     // 墨镜击飞眩晕持续时间 (ms)

// 对象池固定容量 (Zero malloc 静态分配)
#define BB_MAX_BULLETS               4
#define BB_MAX_OBSTACLES             16
#define BB_MAX_TARGETS               8
#define BB_MAX_BARRELS               6
#define BB_MAX_PARTICLES             64
#define BB_MAX_SOUND_QUEUE           16
#define BB_MAX_LEVELS                5
#define BB_MAX_TRAJ_POINTS           32

// 游戏主状态
typedef enum {
    BB_STATE_AIMING = 0,       // 瞄准阶段：UP/DOWN 调整激光线，OK 击发
    BB_STATE_FIRING,           // 弹射阶段：橡胶弹高速反弹与连锁碰撞中
    BB_STATE_LEVEL_CLEAR,      // 关卡胜利：消灭全场目标，结算星级
    BB_STATE_GAME_OVER,        // 关卡失败：弹药耗尽且仍有目标残留
    BB_STATE_PAUSED            // 游戏暂停
} bouncy_state_t;

// 障碍物/掩体/反射板类型
typedef enum {
    BB_OBS_WALL = 0,           // 刚体钢板墙面 (矩形 AABB 反射)
    BB_OBS_PRISM_45_SLASH,     // 45° 斜面棱镜 (斜率为 +1，从左下到右上，法向朝左上或右下)
    BB_OBS_PRISM_45_BACKSLASH, // 45° 斜面棱镜 (斜率为 -1，从左上到右下，法向朝右上或左下)
    BB_OBS_SHIELD_WALL,        // 防弹单向屏蔽板
    BB_OBS_DESTRUCTIBLE_BLOCK  // 可被炸药桶爆炸波及摧毁的掩体
} bouncy_obs_type_t;

// 音效事件 (环形队列消费)
typedef enum {
    BB_SND_NONE = 0,
    BB_SND_SHOOT,              // 击发特工砰声
    BB_SND_BOUNCE_PITCH_1,     // 反弹金属清脆音阶 1 (叮~ 初次反弹)
    BB_SND_BOUNCE_PITCH_2,     // 反弹金属清脆音阶 2
    BB_SND_BOUNCE_PITCH_3,     // 反弹金属清脆音阶 3
    BB_SND_BOUNCE_PITCH_4,     // 反弹金属清脆音阶 4
    BB_SND_BOUNCE_PITCH_5,     // 反弹金属清脆音阶 5 (反弹频率加速升调)
    BB_SND_SHIELD_RICOCHET,    // 击中正面防弹盾牌无伤弹飞声
    BB_SND_TARGET_DESTROY,     // 目标敌人爆碎破裂音
    BB_SND_BARREL_BOOM,        // 炸药桶轰鸣大爆炸
    BB_SND_SUNGLASSES_FLY,     // 搞笑自伤：墨镜击飞滑稽音
    BB_SND_CLEAR_1STAR,        // 1星通关
    BB_SND_CLEAR_2STAR,        // 2星通关
    BB_SND_CLEAR_3STAR,        // 三星通关高昂号角
    BB_SND_DEFEAT              // 弹药耗尽任务失败悲鸣
} bouncy_sound_t;

// 粒子特效类型
typedef enum {
    BB_PART_NONE = 0,
    BB_PART_SPARK,             // 亮黄反弹碰撞火星
    BB_PART_EXPLOSION_FLAME,   // 炸药桶爆炸火球与碎屑
    BB_PART_SMOKE,             // 烟雾消散
    BB_PART_SUNGLASSES,        // 被击飞的特工墨镜 (旋转抛物线)
    BB_PART_TARGET_SHARD       // 敌人破裂碎片
} bouncy_particle_type_t;

// 2D 基础坐标点
typedef struct {
    float x;
    float y;
} bouncy_point_t;

// 弹道预判点详尽信息
typedef struct {
    float x;
    float y;
    bool is_reflection;        // 是否为反射拐点
    bool is_hit_target;        // 是否击中敌人 (预判在此终止)
    bool is_hit_barrel;        // 是否击中炸药桶 (预判在此终止)
    bool is_hit_agent;         // 是否自伤反弹命中特工头部 (自伤危险警告)
    float nx;                  // 拐点处反射法向量 X
    float ny;                  // 拐点处反射法向量 Y
} bouncy_traj_point_t;

// 障碍物/反射板对象
typedef struct {
    bool active;
    bouncy_obs_type_t type;
    float x;                   // AABB 左上角或棱镜包围盒 X
    float y;                   // AABB 左上角或棱镜包围盒 Y
    float w;                   // 宽
    float h;                   // 高
    bool destroyed;            // 是否已被炸药桶摧毁
} bouncy_obstacle_t;

// 目标敌人对象 (含掩体盲区与正面防弹盾判定)
typedef struct {
    bool active;
    bool alive;
    float x;
    float y;
    float radius;              // 敌人本体半径 (例如 9.0f)
    bool has_shield;           // 是否配备防弹盾牌
    float shield_nx;           // 盾牌法向量 X (正面朝向，如 -1.0 表示正朝左)
    float shield_ny;           // 盾牌法向量 Y
    float shield_angle_span;   // 盾牌防御半角 (度，如 65.0f 表示正面 130° 扇区防弹)
    int score_value;           // 击杀分值
} bouncy_target_t;

// 炸药桶对象 (连锁爆炸)
typedef struct {
    bool active;
    bool exploded;
    float x;
    float y;
    float radius;              // 碰撞体半径 (8.0f)
    float blast_radius;        // 爆炸波及半径 (50.0f)
    float fuse_timer_ms;       // 引信/爆炸动画倒计时
} bouncy_barrel_t;

// 橡胶弹对象
typedef struct {
    bool active;
    float x;
    float y;
    float vx;
    float vy;
    float radius;
    int bounce_count;          // 当前反弹次数 (达到 BB_MAX_BOUNCES 消亡)
    float total_distance;      // 飞行总行程
} bouncy_bullet_t;

// 粒子特效对象
typedef struct {
    bool active;
    bouncy_particle_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life_ms;
    float max_life_ms;
    float rotation_deg;
    float rot_speed;
    uint8_t color_type;        // 0: 亮黄, 1: 橙红, 2: 黑色(墨镜), 3: 白色烟雾
} bouncy_particle_t;

// 特工主角结构
typedef struct {
    float x;                   // 站立位置 X
    float y;                   // 站立位置 Y
    float gun_x;               // 枪口坐标 X
    float gun_y;               // 枪口坐标 Y
    float head_x;              // 头部坐标 X
    float head_y;              // 头部坐标 Y
    float head_radius;         // 头部受击半径 (11.0f)
    bool sunglasses_on;        // 墨镜是否佩戴中
    bool is_dizzy;             // 是否被弹球自伤击中眩晕
    uint32_t dizzy_timer_ms;   // 眩晕剩余倒计时 (ms)
} bouncy_agent_t;

// 游戏全局上下文核心结构体
typedef struct {
    bouncy_state_t state;
    float aim_angle_deg;       // 当前激光瞄准角度 (10.0° ~ 170.0°)
    int current_level;         // 当前关卡 (1 ~ BB_MAX_LEVELS)
    int ammo_remaining;        // 剩余橡胶弹 (0 ~ BB_DEFAULT_AMMO)
    int stars_earned;          // 通关星级 (1~3 星，0表示未通关)
    int score;                 // 玩家累计得分
    uint32_t game_time_ms;     // 关卡运行时间 (ms)
    uint32_t rng_state;        // 独立伪随机数种子

    // 特工主角
    bouncy_agent_t agent;

    // 静态对象池 (零动态分配)
    bouncy_bullet_t bullets[BB_MAX_BULLETS];
    bouncy_obstacle_t obstacles[BB_MAX_OBSTACLES];
    bouncy_target_t targets[BB_MAX_TARGETS];
    bouncy_barrel_t barrels[BB_MAX_BARRELS];
    bouncy_particle_t particles[BB_MAX_PARTICLES];

    // 音效事件环形队列
    bouncy_sound_t sound_queue[BB_MAX_SOUND_QUEUE];
    int sound_head;
    int sound_tail;

    // 统计数据
    int total_bounces;         // 本局反弹总次数
    int targets_remaining;     // 场上剩余未消灭敌人数量
    int barrels_exploded;      // 已引爆炸药桶数量
    int self_hits;             // 自伤次数 (搞笑墨镜击飞统计)
} bouncy_game_t;

// ============================================================================
// 核心 API 声明
// ============================================================================

/**
 * @brief 初始化游戏全局状态并加载第 1 关
 */
void bouncy_game_init(bouncy_game_t *g, uint32_t seed);

/**
 * @brief 重置当前关卡状态与弹药
 */
void bouncy_game_reset(bouncy_game_t *g);

/**
 * @brief 加载指定关卡 (1 ~ BB_MAX_LEVELS)
 */
bool bouncy_load_level(bouncy_game_t *g, int level);

/**
 * @brief 游戏主循环物理与状态机单步步进 (毫秒)
 */
void bouncy_game_step(bouncy_game_t *g, uint32_t dt_ms);

/**
 * @brief UP 键：瞄准线向上/逆时针旋转步进 (步进 BB_AIM_STEP_DEG 1.5°)
 */
void bouncy_input_aim_up(bouncy_game_t *g);

/**
 * @brief DOWN 键：瞄准线向下/顺时针旋转步进 (步进 BB_AIM_STEP_DEG 1.5°)
 */
void bouncy_input_aim_down(bouncy_game_t *g);

/**
 * @brief OK 键：击发一颗高弹性超级橡胶弹
 * @return true 发射成功；false 弹药不足或当前已处于飞行中
 */
bool bouncy_input_shoot(bouncy_game_t *g);

/**
 * @brief 暂停 / 恢复游戏
 */
void bouncy_game_pause(bouncy_game_t *g);
void bouncy_game_resume(bouncy_game_t *g);

/**
 * @brief 核心数学模块：预先计算并获取未来 2~3 次反射路径虚线关键拐点 (用户严格指定接口)
 * @param g 游戏状态指针
 * @param points 输出点数组缓冲 (坐标格式为 x, y)
 * @param max_points 输出数组最大容量
 * @return 实际生成的折线拐点数量 (包括起点枪口、反射点与终止点)
 */
int bouncy_get_trajectory_points(const bouncy_game_t *g, bouncy_point_t *points, int max_points);

/**
 * @brief 高级详尽弹道预判接口 (包含反射法线、击中目标类别、自伤预警标识)
 */
int bouncy_get_trajectory_detailed(const bouncy_game_t *g, bouncy_traj_point_t *points, int max_points, int max_reflections);

/**
 * @brief 获取沿预判弹道的等间距虚线小圆点 (方便 UI 激光虚线渲染)
 */
int bouncy_get_aim_dots(const bouncy_game_t *g, bouncy_point_t *dots, int max_dots, float step_dist);

/**
 * @brief 音效队列出队 (供音频模块调用)
 */
bouncy_sound_t bouncy_pop_sound(bouncy_game_t *g);

/**
 * @brief 查询状态辅助函数
 */
bool bouncy_is_aiming(const bouncy_game_t *g);
bool bouncy_is_firing(const bouncy_game_t *g);
bool bouncy_is_level_clear(const bouncy_game_t *g);
bool bouncy_is_game_over(const bouncy_game_t *g);
bool bouncy_is_paused(const bouncy_game_t *g);
int bouncy_get_active_bullet_count(const bouncy_game_t *g);
int bouncy_get_active_particle_count(const bouncy_game_t *g);

#ifdef __cplusplus
}
#endif
