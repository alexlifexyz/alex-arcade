// main/cyber_runner_logic.h —— 《霓虹疾行：影刃闪现》(Cyber Courier: Phantom Dash) V2.0 核心引擎
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
// V2.0 革新：
// 1. 影刃拔刀斩 / 锁定瞬影突进 (OK 键)：斩爆浮游无人机与机关，触发击破重置 (Kill Reset 刷新二段跳与闪现)！
// 2. 贴墙减速下滑 (Wall Slide) 与蹬墙反弹大跳 (Wall Kick)：撞墙不暴毙，按 UP 救援翻越大厦！
// 3. 土狼时间 (Coyote Time) 与输入预缓冲 (Jump Buffering)：极致丝滑跳跃手感。
// 4. 地面滑铲与空中重力俯冲下砸 (Dive Slam) 释放冲击波。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CR_SCREEN_W          240
#define CR_SCREEN_H          320

#define CR_PLAYER_X          48    // 玩家在屏幕上的基准横向锚点
#define CR_PLAYER_W          26    // 玩家站立宽度 (阿童木 2.5 头身饱满比例)
#define CR_PLAYER_H          42    // 玩家站立高度 (脚底严丝合缝贴合大楼屋顶)
#define CR_SLIDE_H           20    // 滑铲高度 (低姿态)

#define CR_MAX_BUILDINGS     5     // 循环建筑平台池
#define CR_MAX_HAZARDS       6     // 动态障碍/陷阱池 (激光、无人机、排风口)
#define CR_MAX_ITEMS         6     // 收集物池 (数据晶体、电池、护盾)
#define CR_MAX_PROJECTILES   4     // 玩家发射的月牙光刃/飞刀池
#define CR_MAX_PARTICLES     32    // 动态微粒池
#define CR_MAX_AFTERIMAGES   3     // 幽灵闪现残影数量
#define CR_MAX_SCARF_NODES   5     // 围巾物理飘带节点

// 角色动作姿态
typedef enum {
    CR_STANCE_RUN = 0,       // 楼顶疾跑
    CR_STANCE_JUMP,          // 一段起跳
    CR_STANCE_DOUBLE_JUMP,   // 二段喷气腾跃
    CR_STANCE_BLINK,         // 空中幽灵闪现 / 影刃突进斩
    CR_STANCE_WALL_SLIDE,    // 贴墙下滑 (减速60%，按 UP 触发蹬墙跳)
    CR_STANCE_SLIDE,         // 地面贴地滑铲 (火花四溅钻低位)
    CR_STANCE_DIVE,          // 空中极速俯冲 (下坠砸地激发震荡波)
    CR_STANCE_FALL           // 踏空边缘坠落
} cr_stance_t;

// 陷阱/机关类型
typedef enum {
    CR_HAZARD_NONE = 0,
    CR_HAZARD_LASER_LOW,     // 低位激光横梁 (需起跳躲避)
    CR_HAZARD_LASER_HIGH,    // 高位激光横梁 (需滑铲钻过)
    CR_HAZARD_LASER_WALL,    // 全高阻断激光墙 (必须空中闪现虚化穿透)
    CR_HAZARD_DRONE,         // 浮游巡逻无人机 (可规避或被月牙光刃击爆)
    CR_HAZARD_VENT           // 超导排风口 (踏上触发强力腾空弹射)
} cr_hazard_type_t;

// 道具类型
typedef enum {
    CR_ITEM_NONE = 0,
    CR_ITEM_DATA_GEM,        // 赛博数据晶体 (+50分, 累积连击)
    CR_ITEM_BATTERY,         // 能量电池 (充满 3 格闪现能量)
    CR_ITEM_SHIELD           // 磁暴护盾 (免受一次非坠落伤害)
} cr_item_type_t;

// 粒子类型
typedef enum {
    CR_PART_NONE = 0,
    CR_PART_SPARK,           // 滑铲/贴墙火花 (抛物线)
    CR_PART_NEON_BURST,      // 闪现虚化/晶体拾取霓虹微粒
    CR_PART_EXPLOSION,       // 无人机被斩爆机械碎片
    CR_PART_VENT_STEAM,      // 排风口上升气流线
    CR_PART_SHOCKWAVE        // 俯冲砸地扩散冲击波
} cr_part_type_t;

// 音效事件 (供 I2S 音频任务无锁并发播放)
typedef enum {
    CR_SND_NONE = 0,
    CR_SND_JUMP,             // 离子起跳 (脉冲升频)
    CR_SND_AIR_BOOST,        // 二段火箭靴喷火腾跃
    CR_SND_BLINK,            // 幽灵闪现电子穿梭滑音
    CR_SND_WALL_KICK,        // 蹬墙反弹跳金属铮鸣
    CR_SND_SLASH_HIT,        // 月牙光刃击爆目标的爽脆切削声
    CR_SND_SLIDE,            // 贴地滑铲高频摩擦
    CR_SND_DIVE_SLAM,        // 俯冲砸地震地轰鸣
    CR_SND_GEM,              // 拾取数据晶体双音和弦
    CR_SND_DRONE_POP,        // 无人机爆裂音
    CR_SND_VENT_BOOST,       // 排风口暴风喷射音
    CR_SND_HURT,             // 受创警报音
    CR_SND_GAMEOVER          // 坠入深渊 / 离线停机
} cr_sound_t;

// 月牙光刃 / 飞刀投射物
typedef struct {
    bool active;
    float x;                 // 飞行中心 X
    float y;                 // 飞行中心 Y
    float vx;                // 横向飞行速度 (px/s)
    float vy;                // 纵向轻微浮动
    float life_ms;           // 剩余生命周期 (ms)
    float rot_deg;           // 自转角度 (0 ~ 360)
} cr_projectile_t;

// 建筑屋顶实体
typedef struct {
    bool active;
    float x;                 // 左上角 X (随视口向左滚动)
    float y;                 // 屋顶上表面 Y (190 ~ 255)
    float w;                 // 屋顶宽度 (120 ~ 240)
    float h;                 // 建筑深度 (固定延伸到底部 320)
    bool is_glass;           // 是否为全息易碎天窗
    float crumble_timer_ms;  // 踏上后的碎裂倒计时 (350ms 后坍塌)
    bool crumbled;           // 是否已崩塌穿透
    uint32_t win_seed;       // 楼体发光窗户伪随机种子
} cr_building_t;

// 陷阱/机关实体
typedef struct {
    bool active;
    cr_hazard_type_t type;
    float x;
    float y;
    float w;
    float h;
    float bob_phase;         // 无人机上下浮动相位
    uint32_t state_tick;
} cr_hazard_t;

// 收集品实体
typedef struct {
    bool active;
    cr_item_type_t type;
    float x;
    float y;
    float bob_phase;
} cr_item_t;

// 粒子实体
typedef struct {
    bool active;
    cr_part_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life;              // 0.0 ~ 1.0
    float decay;             // 衰减速度
    uint32_t color;          // RGB888
} cr_particle_t;

// 幽灵闪现残影节点
typedef struct {
    float x;
    float y;
    float alpha;             // 残影透明度
    uint32_t color;
} cr_afterimage_t;

// 围巾质点节点 (流光飘带)
typedef struct {
    float x;
    float y;
} cr_scarf_node_t;

// 核心游戏上下文
typedef struct {
    // 玩家角色
    float y;
    float vy;
    float render_x_offset;   // 闪现突进时的视觉横向拉伸偏移
    cr_stance_t stance;
    uint32_t stance_timer_ms;
    int air_jumps_left;      // 剩余二段跳次数 (默认 1)
    int blink_charges;       // 剩余闪现充能 (0 ~ 3)
    float blink_recharge_ms; // 闪现充能计时
    bool phase_shift;        // 闪现无敌与虚化穿透状态
    uint32_t phase_timer_ms; // 虚化剩余毫秒

    // V2 连招与手感系统
    uint32_t coyote_timer_ms;    // 土狼时间 (离台 100ms 内依然允许跳跃)
    uint32_t jump_buffer_ms;     // 跳跃缓冲 (落地前 100ms 预按自动起跳)
    bool is_wall_sliding;        // 是否处于贴墙下滑状态
    float wall_slide_y;          // 贴墙基准
    bool slash_active;           // 影刃斩击弧光显示帧
    uint32_t slash_timer_ms;
    float slash_start_x;
    float slash_start_y;
    float slash_target_x;
    float slash_target_y;
    bool shockwave_active;       // 俯冲砸地冲击波
    uint32_t shockwave_timer_ms;
    float shockwave_x;
    float shockwave_y;
    float shockwave_radius;

    // 围巾与残影
    cr_scarf_node_t scarf[CR_MAX_SCARF_NODES];
    cr_afterimage_t afterimages[CR_MAX_AFTERIMAGES];

    // 速度感与视差
    float world_speed;       // 当前滚动速度 (px/s，起始 170，随距离提升)
    float bg_far_scroll_px;  // 远景晚霞天际线偏移
    float bg_mid_scroll_px;  // 中景摩天大楼剪影偏移

    // 生命与积分
    int hp;
    int max_hp;
    bool has_shield;         // 磁暴护盾
    uint32_t score;
    uint32_t distance_m;     // 奔跑米数
    uint32_t combo_count;    // 极限连击数
    uint32_t combo_timer_ms; // 连击有效倒计时
    uint32_t invuln_timer_ms;// 受创闪烁无敌

    // 游戏状态
    bool game_over;
    cr_sound_t pending_sound;

    // 对象池
    cr_building_t buildings[CR_MAX_BUILDINGS];
    cr_hazard_t hazards[CR_MAX_HAZARDS];
    cr_item_t items[CR_MAX_ITEMS];
    cr_projectile_t projectiles[CR_MAX_PROJECTILES];
    cr_particle_t particles[CR_MAX_PARTICLES];

    // 随机数与时钟
    uint32_t rng_state;
    uint32_t tick_count;
} cr_game_t;

// API 接口声明
void cyber_runner_init(cr_game_t *game, uint32_t seed);
void cyber_runner_step(cr_game_t *game, uint32_t dt_ms);

// 三键输入分发
void cyber_runner_input_up(cr_game_t *game);
void cyber_runner_input_down(cr_game_t *game);
void cyber_runner_input_ok(cr_game_t *game);

// 辅助算法
bool cyber_runner_check_box(float x1, float y1, float w1, float h1,
                            float x2, float y2, float w2, float h2);
void cyber_runner_emit_particle(cr_game_t *game, cr_part_type_t type,
                                float x, float y, float vx, float vy, uint32_t color);

#ifdef __cplusplus
}
#endif
