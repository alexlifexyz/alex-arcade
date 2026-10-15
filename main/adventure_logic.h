#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// 屏幕几何与游戏世界配置 (匹配 FoloToy AI Passport ST7789P3 240x320 竖屏)
#define ADVENTURE_SCREEN_W        240
#define ADVENTURE_SCREEN_H        320
#define ADVENTURE_GROUND_Y        260.0f

// 对象池最大容量
#define ADVENTURE_MAX_PROJECTILES 16
#define ADVENTURE_MAX_ENEMIES     12
#define ADVENTURE_MAX_ITEMS       8

// 玩家物理与数值常量
#define ADVENTURE_PLAYER_W        16
#define ADVENTURE_PLAYER_H        24
#define ADVENTURE_INIT_LIVES      3
#define ADVENTURE_MAX_STAMINA     100.0f
#define ADVENTURE_STAMINA_DRAIN   2.5f     // 每秒体力消耗值 (无补给可坚持 40 秒)
#define ADVENTURE_GRAVITY         750.0f   // 重力加速度 (像素/秒^2)
#define ADVENTURE_JUMP_VELOCITY   (-330.0f)// 起跳初始垂直速度
#define ADVENTURE_MOVE_STEP       8.0f     // 单次按键移动步长
#define ADVENTURE_SHOOT_COOLDOWN  180      // 武器投掷冷却 (毫秒)
#define ADVENTURE_INVINCIBLE_MS   2000     // 受伤无敌时间 (毫秒)
#define ADVENTURE_COMBO_WINDOW_MS 1800     // 连击窗口 (毫秒)
#define ADVENTURE_STOMP_BOUNCE    (-220.0f)// 踩踏敌人后的反弹初速

// 武器类型
typedef enum {
    ADV_WEAPON_NONE = 0,    // 赤手空拳
    ADV_WEAPON_AXE,         // 石斧：抛物线轨迹，触敌造成伤害并销毁
    ADV_WEAPON_KNIFE,       // 飞刀：水平高速直线，触敌造成伤害并销毁
    ADV_WEAPON_MOON_BLADE,  // 月亮刃：水平穿透飞刃，贯穿多个敌人不消失
} adventure_weapon_t;

// 敌人类型
typedef enum {
    ADV_ENEMY_SNAIL = 0,    // 蜗牛：地面低速巡逻爬行
    ADV_ENEMY_FROG,         // 跳跃青蛙：地面周期性蓄力起跳
    ADV_ENEMY_BIRD,         // 空中飞鸟：高空正弦波平飞
} adventure_enemy_type_t;

// 补给道具类型 (丰富经典水果盛宴 + 武器徽章 + 金蛋 + 牛奶 + 滑板)
typedef enum {
    ADV_ITEM_BANANA = 0,    // 香蕉：恢复体力 20 点，+100 分
    ADV_ITEM_PINEAPPLE,     // 菠萝：恢复体力 50 点，+300 分
    ADV_ITEM_EGG,           // 恐龙蛋：额外生命 +1，+1000 分
    ADV_ITEM_APPLE,         // 红苹果：恢复体力 25 点，+150 分
    ADV_ITEM_STRAWBERRY,    // 草莓：恢复体力 15 点，+200 分
    ADV_ITEM_WATERMELON,    // 西瓜：恢复体力 35 点，+250 分
    ADV_ITEM_GRAPE,         // 葡萄：恢复体力 30 点，+220 分
    ADV_ITEM_MILK,          // 牛奶瓶：体力瞬间回满 100%，+500 分
    ADV_ITEM_BADGE_A,       // 武器徽章 [A]：石斧，+250 分
    ADV_ITEM_BADGE_K,       // 武器徽章 [K]：直线飞刀，+350 分
    ADV_ITEM_BADGE_P,       // 武器徽章 [P]：贯穿月刃，+500 分
    ADV_ITEM_SKATEBOARD,    // 滑板：极速冲刺且撞怪无敌，+800 分
} adventure_item_type_t;

// 按键输入行为
typedef enum {
    ADV_ACTION_UP = 0,      // UP 键：左退 / 减速
    ADV_ACTION_DOWN,        // DOWN 键：右进 / 加速
    ADV_ACTION_JUMP,        // OK 键短按：跳跃
    ADV_ACTION_THROW,       // OK 键投掷：投掷当前武器
    ADV_ACTION_OK,          // 通用 OK 键：地面跳跃且有武器时投掷
} adventure_action_t;

#define ADV_ACTION_LEFT  ADV_ACTION_UP
#define ADV_ACTION_RIGHT ADV_ACTION_DOWN

// 单帧事件反馈标志（用于驱动 UI 特效与蜂鸣器音效）
typedef struct {
    bool jump;
    bool throw_weapon;
    bool hit_enemy;
    bool enemy_killed;
    bool pickup_fruit;
    bool player_hurt;
    bool game_over;
    bool stomp;             // 踩踏击杀
    bool extra_life;        // 拾取恐龙蛋
    bool weapon_upgraded;   // 拾取武器徽章 [A]/[K]/[P]
    bool milk_full;         // 牛奶全满体力
    bool skateboard_start;  // 踏上滑板
} adventure_events_t;

// 投射物结构体
typedef struct {
    float x, y;
    float vx, vy;
    float gravity;          // 重力加速度 (石斧使用，飞刀/月亮刃为 0)
    int w, h;               // 碰撞盒宽高
    int damage;             // 杀伤力
    adventure_weapon_t type;// 投射物所属武器类型
    bool piercing;          // 是否具有穿透属性 (月亮刃为 true)
    int hits;               // 已击中敌人数
    bool active;            // 池活跃标记
} adventure_projectile_t;

// 敌人实体结构体
typedef struct {
    float x, y;
    float vx, vy;
    int w, h;
    int hp;
    int max_hp;
    int score_value;
    adventure_enemy_type_t type;
    float state_timer;      // 行为计时器 (青蛙起跳、飞鸟振翅/正弦波)
    float base_y;           // 飞鸟飞行基准高度
    bool on_ground;         // 是否着地
    bool active;            // 池活跃标记
} adventure_enemy_t;

// 补给道具结构体
typedef struct {
    float x, y;
    float vx, vy;
    int w, h;
    adventure_item_type_t type;
    float restore_stamina;  // 体力回复量
    int score_value;        // 捡起获得积分
    bool on_ground;
    bool active;
} adventure_item_t;

// 玩家状态结构体
typedef struct {
    float x, y;             // 玩家左上角物理坐标
    float vx, vy;           // 玩家速度矢量
    int w, h;               // 玩家碰撞盒大小
    int facing;             // 面向朝向 (-1 为左, +1 为右)
    bool is_jumping;        // 是否处于跳跃/空中状态
    bool on_ground;         // 是否着地
    float stamina;          // 体力/饥饿值 (0.0f ~ 100.0f)
    int lives;              // 剩余生命数
    int score;              // 当前积分
    adventure_weapon_t weapon; // 当前拥有的武器类型
    int invincible_timer_ms;// 受伤无敌剩余时间 (毫秒)
    bool is_alive;          // 是否存活
    int combo;              // 当前连击数 (窗口内连续击杀)
    int combo_timer_ms;     // 连击窗口剩余时间
    int max_combo;          // 本局最高连击
    bool has_skateboard;    // 是否装备滑板
    int skateboard_timer_ms;// 滑板剩余无敌冲刺时间
} adventure_player_t;

// 游戏完整运行时上下文
typedef struct {
    adventure_player_t player;

    // 对象池
    adventure_projectile_t projectiles[ADVENTURE_MAX_PROJECTILES];
    adventure_enemy_t enemies[ADVENTURE_MAX_ENEMIES];
    adventure_item_t items[ADVENTURE_MAX_ITEMS];

    // 全局状态
    bool game_over;
    uint32_t game_time_ms;
    int shoot_cooldown_ms;

    // 事件通知结构
    adventure_events_t events;
} adventure_game_t;

// 核心循环与接口
void adventure_logic_init(adventure_game_t *g);
void adventure_logic_restart(adventure_game_t *g);
void adventure_logic_update(adventure_game_t *g, uint32_t dt_ms);
bool adventure_logic_action(adventure_game_t *g, adventure_action_t action);

// 具体动作接口
void adventure_logic_move_left(adventure_game_t *g);
void adventure_logic_move_right(adventure_game_t *g);
bool adventure_logic_jump(adventure_game_t *g);
bool adventure_logic_throw(adventure_game_t *g);

// 实体生成与管理辅助接口
bool adventure_logic_spawn_enemy(adventure_game_t *g, adventure_enemy_type_t type, float x, float y);
bool adventure_logic_spawn_item(adventure_game_t *g, adventure_item_type_t type, float x, float y);
void adventure_logic_set_weapon(adventure_game_t *g, adventure_weapon_t weapon);

// AABB 碰撞检测数学工具函数
bool adventure_check_aabb(float x1, float y1, int w1, int h1,
                          float x2, float y2, int w2, int h2);

#ifdef __cplusplus
}
#endif
