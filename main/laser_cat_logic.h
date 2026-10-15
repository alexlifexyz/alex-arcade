// main/laser_cat_logic.h —— 《猫猫激光笔指挥官》(Laser Pointer Commander) 核心算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无 ESP-IDF/LVGL/FreeRTOS 依赖。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// =========================================================================
// 屏幕与硬件规格定义
// =========================================================================
#define LC_SCREEN_W                  240
#define LC_SCREEN_H                  320

// 激光笔发射源参数
#define LC_EMITTER_DEFAULT_X         120.0f
#define LC_EMITTER_DEFAULT_Y         310.0f

// 瞄准角度参数 (0°为正上方垂直，-90°为正左方，+90°为正右方，覆盖180°扇形)
#define LC_AIM_ANGLE_MIN_DEG         (-90.0f)
#define LC_AIM_ANGLE_MAX_DEG         (90.0f)
#define LC_AIM_ANGLE_STEP_DEG        (2.5f)

// 按键阈值与持续时间参数
#define LC_LONG_PRESS_THRESHOLD_MS   250     // 长按判定阈值 (ms)：>=250ms 触发强功率连续激光
#define LC_PULSE_DURATION_MS         600     // 短按脉冲引诱激光持续时间 (ms)

// 静态对象池最大容量限制
#define LC_MAX_CATS                  5       // 猫群最大只数 (3~5 只大头猫咪)
#define LC_MAX_CRATES                8       // 木箱/电池箱容量
#define LC_MAX_SLOTS                 4       // 目标通电卡槽容量
#define LC_MAX_MIRRORS               4       // 镜面/反光板容量
#define LC_MAX_SWITCHES              4       // 墙面机关开关容量
#define LC_MAX_ROOMBAS               3       // 巡逻扫地机容量
#define LC_MAX_RAY_SEGMENTS          8       // 激光折线段最大数量 (多重镜面反射)
#define LC_MAX_PARTICLES             64      // 火花/微尘粒子池容量
#define LC_MAX_SOUND_QUEUE           16      // 音效事件环形队列容量

// =========================================================================
// 基础枚举类型
// =========================================================================

// 游戏全局状态
typedef enum {
    LC_STATE_PLAYING = 0,    // 游戏激战中
    LC_STATE_PAUSED,         // 游戏暂停
    LC_STATE_VICTORY,        // 通电成功过关胜利
    LC_STATE_GAMEOVER        // 失败/超时
} lc_state_t;

// 激光发射功率模式
typedef enum {
    LC_LASER_OFF = 0,        // 激光关闭
    LC_LASER_PULSE,          // 短按单点引诱：低功率瞬间脉冲光斑
    LC_LASER_CONTINUOUS      // 长按持续强激光：强功率连续高亮光斑
} lc_laser_mode_t;

// 猫咪性格类型
typedef enum {
    LC_CAT_ORANGE = 0,       // 橘猫胖墩：体沉力猛、起步稍缓、推箱力巨大 (重装坦克)
    LC_CAT_COW,              // 奶牛猫狂躁：神经质、冲刺极速、狂热猛扑 (狂暴冲锋)
    LC_CAT_BLACK             // 黑猫敏捷：视野宽、灵敏敏捷、高跳触碰开关 (刺客飞跃)
} lc_cat_type_t;

// 猫咪 AI 姿态与状态机
typedef enum {
    LC_CAT_STATE_IDLE = 0,   // 闲适状态：闲逛踱步、打哈欠、舔毛
    LC_CAT_STATE_ALERT,      // 警觉姿态：感知红点出现，眼睛收缩、瞳孔锁定
    LC_CAT_STATE_WIGGLE,     // 蓄势姿态：压低身体、屁股左右摇摆 (Butt Wiggle)
    LC_CAT_STATE_PROBE,      // 试探姿态：短按引诱触发，小跑接近并在光斑前小跳试探拍击
    LC_CAT_STATE_POUNCE,     // 猛扑姿态：强功率激发，极速前冲爆发飞扑，带巨大推力
    LC_CAT_STATE_REST        // 恢复姿态：扑击落地喘息、短暂懵圈或爪地
} lc_cat_state_t;

// 机关开关类型
typedef enum {
    LC_SWITCH_TOGGLE_MIRROR = 0, // 切换/旋转反光板角度
    LC_SWITCH_TOGGLE_GATE        // 升降阻隔栏
} lc_switch_type_t;

// 粒子类型
typedef enum {
    LC_PART_NONE = 0,
    LC_PART_LASER_SPARK,     // 光斑散射火花
    LC_PART_CAT_PAW_DUST,    // 猫爪飞扑尘土
    LC_PART_BOX_DUST,        // 箱子摩擦木屑/尘埃
    LC_PART_ELECTRIC_ARC,    // 电池入槽通电电弧
    LC_PART_ROOMBA_SPARK     // 扫地机被踩停故障火花
} lc_particle_type_t;

// 音效事件类型 (供 I2S 音频任务无锁队列消费)
typedef enum {
    LC_SND_NONE = 0,
    LC_SND_LASER_HUM,        // 激光发射低功率蜂鸣嗡嗡声
    LC_SND_LASER_HIGH,       // 强功率连续激光增频轰鸣声
    LC_SND_CAT_PATTER,       // 猫爪挠地跑动声
    LC_SND_CAT_WIGGLE,       // 屁股摇摆蓄势声
    LC_SND_POUNCE_THUD,      // 飞扑落地沉闷响声
    LC_SND_BOX_SCRAPE,       // 重木箱/电池箱摩擦滑动声
    LC_SND_SWITCH_CLICK,     // 拍下高处开关清脆咔哒声
    LC_SND_ROOMBA_BUMP,      // 扫地机巡逻撞击调头声
    LC_SND_ROOMBA_STUN,      // 飞扑踩停扫地机机械关闭音
    LC_SND_SLOT_POWERED,     // 电池箱推入卡槽通电充能声
    LC_SND_VICTORY_MEOW      // 全部电池通电胜利欢快喵叫声
} lc_sound_t;

// =========================================================================
// 数学与实体数据结构
// =========================================================================

// 二维向量
typedef struct {
    float x;
    float y;
} lc_vec2_t;

// 激光线段 (支持多段镜面反射)
typedef struct {
    lc_vec2_t start;
    lc_vec2_t end;
    bool hit_mirror;
} lc_ray_segment_t;

// 红外激光光斑
typedef struct {
    bool active;
    lc_vec2_t pos;
    float intensity;         // 0.5f = 短按脉冲, 1.0f = 强功率连续
    bool on_crate;           // 是否照射在箱子上
    int crate_index;         // 照射到的箱子索引
} lc_laser_spot_t;

// 镜面/金属反光板实体
typedef struct {
    bool active;
    lc_vec2_t p1;            // 线段端点 1
    lc_vec2_t p2;            // 线段端点 2
    lc_vec2_t normal;        // 镜面法向量 (单位向量)
    float angle_deg;         // 当前倾角
    float target_angle_deg;  // 机关触发后的目标角度
} lc_mirror_t;

// 箱子实体 (普通木箱 / 能量电池箱)
typedef struct {
    bool active;
    bool is_battery;         // true: 能量电池箱 (过关必需品); false: 普通阻挡箱
    float x;                 // 中心坐标 x
    float y;                 // 中心坐标 y
    float w;                 // 宽度
    float h;                 // 高度
    float vx;                // 滑动速度 vx (px/s)
    float vy;                // 滑动速度 vy (px/s)
    float mass;              // 质量系数 (普通箱 1.2, 电池箱 2.5)
    float friction;          // 滑动阻尼衰减率
    bool is_powered;         // 是否已推入卡槽通电
    int slot_id;             // 锁定的卡槽索引 (-1 为未入槽)
} lc_crate_t;

// 目标通电卡槽实体
typedef struct {
    bool active;
    float x;                 // 中心坐标 x
    float y;                 // 中心坐标 y
    float w;                 // 区域宽
    float h;                 // 区域高
    bool is_filled;          // 是否已填入通电电池
} lc_slot_t;

// 墙壁/高处开关机关实体
typedef struct {
    bool active;
    float x;                 // 中心坐标 x
    float y;                 // 中心坐标 y
    float w;
    float h;
    bool is_on;              // 开关状态
    lc_switch_type_t type;
    int target_mirror_id;    // 关联联动的反光板索引
} lc_switch_t;

// 巡逻扫地机器人实体
typedef struct {
    bool active;
    float x;                 // 中心坐标 x
    float y;                 // 中心坐标 y
    float radius;            // 碰撞半径
    float vx;                // 巡逻速度 (px/s)
    float vy;
    float patrol_min_x;      // 巡逻左边界
    float patrol_max_x;      // 巡逻右边界
    bool is_stunned;         // 是否被猫咪踩停关机
    uint32_t stun_timer_ms;  // 停机倒计时
} lc_roomba_t;

// 猫咪实体
typedef struct {
    bool active;
    lc_cat_type_t type;
    lc_cat_state_t state;
    float x;
    float y;
    float vx;                // 速度 vx (px/s)
    float vy;                // 速度 vy (px/s)
    float facing_angle_deg;  // 面向朝向角
    float radius;            // 碰撞与感知半径
    float mass;              // 身体质量
    float speed_max;         // 寻路最高巡航速度
    float pounce_speed;      // 飞扑瞬时爆发初速度
    float push_force;        // 推箱冲击力加成倍率
    float perception_range;  // 激光光斑有效感知距离

    // 姿态与动作计时
    uint32_t alert_timer_ms;
    uint32_t wiggle_timer_ms;
    float wiggle_phase;      // 屁股摇摆角相位 (rad)
    uint32_t state_timer_ms; // 当前姿态状态维持时间 (ms)
    lc_vec2_t target_spot;   // 飞扑锁定坐标
    bool has_pounced_hit;    // 本次飞扑是否已命中机关/箱子
} lc_cat_t;

// 火花/微尘粒子
typedef struct {
    bool active;
    lc_particle_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life_ms;
    float max_life_ms;
    float size;
} lc_particle_t;

// 音效环形队列
typedef struct {
    lc_sound_t queue[LC_MAX_SOUND_QUEUE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
} lc_sound_queue_t;

// 游戏全局上下文结构体
typedef struct {
    lc_state_t state;
    uint32_t rng_state;
    uint32_t game_time_ms;

    // 激光发射手枪系统
    float emitter_x;
    float emitter_y;
    float aim_angle_deg;        // -90.0° ~ +90.0° (0° 竖直向上)
    lc_laser_mode_t laser_mode;
    uint32_t laser_timer_ms;    // 脉冲激光剩余维持时间 (ms)

    // OK 按键状态机
    bool ok_pressed;
    uint32_t ok_hold_time_ms;

    // 光学光线追踪与光斑
    lc_ray_segment_t ray_segments[LC_MAX_RAY_SEGMENTS];
    uint8_t ray_segment_count;
    lc_laser_spot_t spot;

    // 静态对象池
    lc_cat_t cats[LC_MAX_CATS];
    lc_crate_t crates[LC_MAX_CRATES];
    lc_slot_t slots[LC_MAX_SLOTS];
    lc_mirror_t mirrors[LC_MAX_MIRRORS];
    lc_switch_t switches[LC_MAX_SWITCHES];
    lc_roomba_t roombas[LC_MAX_ROOMBAS];
    lc_particle_t particles[LC_MAX_PARTICLES];

    // 音效队列
    lc_sound_queue_t sound_q;

    // 关卡数据与统计
    uint32_t total_batteries;   // 场内总电池箱数
    uint32_t powered_batteries; // 已通电电池箱数
    uint32_t boxes_pushed_count;// 箱子被推动次数
    uint32_t pounces_count;     // 猫群飞扑总次数
} lc_game_t;

// =========================================================================
// 核心生命周期 API
// =========================================================================
void lc_game_init(lc_game_t *g, uint32_t seed);
void lc_game_reset(lc_game_t *g);
void lc_game_pause(lc_game_t *g);
void lc_game_resume(lc_game_t *g);
void lc_game_step(lc_game_t *g, uint32_t dt_ms);
bool lc_game_is_victory(const lc_game_t *g);
bool lc_game_is_game_over(const lc_game_t *g);
bool lc_game_is_paused(const lc_game_t *g);

// =========================================================================
// 用户交互与按键输入 API
// =========================================================================
void lc_input_up(lc_game_t *g);                          // UP 键：激光角度向左微调 2.5°
void lc_input_down(lc_game_t *g);                        // DOWN 键：激光角度向右微调 2.5°
void lc_input_set_aim_angle(lc_game_t *g, float deg);    // 显式设置瞄准角度 (-90° ~ +90°)
void lc_input_ok_press(lc_game_t *g);                    // OK 键按下：开启长按蓄力计时
void lc_input_ok_release(lc_game_t *g);                  // OK 键释放：判定短按/长按并击发对应模式

void lc_laser_trigger_pulse(lc_game_t *g);               // 显式触发短按脉冲引诱激光
void lc_laser_set_continuous(lc_game_t *g, bool on);     // 显式开关连续强功率激光

// =========================================================================
// 音效事件管理 API
// =========================================================================
void lc_sound_enqueue(lc_game_t *g, lc_sound_t sound);
lc_sound_t lc_sound_dequeue(lc_game_t *g);
lc_sound_t lc_sound_peek(const lc_game_t *g);
void lc_sound_clear(lc_game_t *g);

// =========================================================================
// 光学物理与反射计算 API
// =========================================================================
bool lc_reflect_vector(lc_vec2_t dir, lc_vec2_t normal, lc_vec2_t *out_dir);
int lc_recalculate_laser(lc_game_t *g); // 重新计算激光折线与光斑位置

// =========================================================================
// 实体与场景管理 API (供关卡编排与单测验证)
// =========================================================================
int lc_cat_add(lc_game_t *g, lc_cat_type_t type, float x, float y);
int lc_crate_add(lc_game_t *g, bool is_battery, float x, float y, float w, float h, float mass);
int lc_slot_add(lc_game_t *g, float x, float y, float w, float h);
int lc_mirror_add(lc_game_t *g, float x1, float y1, float x2, float y2, float nx, float ny);
int lc_switch_add(lc_game_t *g, float x, float y, float w, float h, lc_switch_type_t type, int target_mirror_id);
int lc_roomba_add(lc_game_t *g, float x, float y, float vx, float patrol_min_x, float patrol_max_x);

// 内置关卡加载
void lc_load_level_1(lc_game_t *g); // 基础推箱关卡
void lc_load_level_2(lc_game_t *g); // 反光镜与机关开关关卡
void lc_load_level_3(lc_game_t *g); // 猫群协同与扫地机阻挡高难度关卡

// 状态查询
int lc_get_active_cats_count(const lc_game_t *g);
int lc_get_active_crates_count(const lc_game_t *g);
int lc_get_active_particles_count(const lc_game_t *g);

#ifdef __cplusplus
}
#endif
