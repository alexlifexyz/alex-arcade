#pragma once

#include <stdbool.h>
#include <stdint.h>

#define CONTRA_SCREEN_W 240
#define CONTRA_SCREEN_H 320
#define CONTRA_GROUND_Y 270.0f

#define CONTRA_MAX_PLAYER_BULLETS 48
#define CONTRA_MAX_ENEMY_BULLETS  32
#define CONTRA_MAX_ENEMIES        16
#define CONTRA_MAX_ITEMS          8

#define CONTRA_PLAYER_WIDTH       16
#define CONTRA_PLAYER_STAND_H     30
#define CONTRA_PLAYER_CROUCH_H    16
#define CONTRA_JUMP_SPEED         280.0f
#define CONTRA_GRAVITY            650.0f
#define CONTRA_PLAYER_SPEED       110.0f
#define CONTRA_INVINCIBLE_TIME_MS 1500

// 武器类型
typedef enum {
    CONTRA_WEAPON_NORMAL = 0,    // 普通枪 (单发子弹)
    CONTRA_WEAPON_SPREAD,        // S 弹 (Spread 3 向扇形散射)
    CONTRA_WEAPON_LASER,         // L 弹 (Laser 贯穿高伤害激光)
    CONTRA_WEAPON_MACHINEGUN,    // M 弹 (Machine gun 密集高射速)
} contra_weapon_t;

// 掉落道具/徽章类型
typedef enum {
    CONTRA_BADGE_NONE = 0,
    CONTRA_BADGE_S,              // S 弹徽章 (升级 Spread)
    CONTRA_BADGE_L,              // L 弹徽章 (升级 Laser)
    CONTRA_BADGE_M,              // M 弹徽章 (升级 Machine gun)
    CONTRA_BADGE_BOMB,           // 炸药补给
    CONTRA_BADGE_BARRIER         // 无敌护盾力场
} contra_badge_t;

// 瞄准朝向
typedef enum {
    CONTRA_AIM_FORWARD = 0,      // 平射 (水平向前)
    CONTRA_AIM_UP,               // 仰射 (垂直向上)
    CONTRA_AIM_UP_DIAG,          // 斜上45度射击
    CONTRA_AIM_DOWN,             // 俯射 (空中垂直向下)
    CONTRA_AIM_DOWN_DIAG         // 斜下45度射击
} contra_aim_t;

// 子弹实体
typedef struct {
    float x, y;
    float vx, vy;
    int w, h;
    int dmg;
    bool piercing;
    bool active;
    contra_weapon_t weapon_type;
    uint32_t hit_mask;           // 贯穿弹已击中敌人的 bitmask，防止同目标单帧重复判定
} contra_bullet_t;

// 敌人类型
typedef enum {
    CONTRA_ENEMY_TURRET = 0,     // 固定地堡旋转炮台
    CONTRA_ENEMY_FOOT_SOLDIER,   // 巡逻步兵
    CONTRA_ENEMY_CAPSULE,        // 飞行武器胶囊
    CONTRA_ENEMY_BOSS,           // 关底机械 BOSS
} contra_enemy_type_t;

// BOSS 战斗阶段 (多段血量与攻击形态)
typedef enum {
    BOSS_PHASE_DEAD = 0,
    BOSS_PHASE_1_ARMORED = 1,    // Phase 1: 双副炮掩护开火 (101~150 HP)
    BOSS_PHASE_2_EXPOSED = 2,    // Phase 2: 外壳崩解，核心暴露，上下悬浮扇形散射 (51~100 HP)
    BOSS_PHASE_3_ENRAGED = 3,    // Phase 3: 狂暴超频，高速突进 + 密集全弹发射 (1~50 HP)
} contra_boss_phase_t;

// 敌人实体
typedef struct {
    float x, y;
    float vx, vy;
    int w, h;
    int hp;
    int max_hp;
    contra_enemy_type_t type;
    bool active;

    // 状态与定时器
    int attack_timer_ms;
    int move_timer_ms;
    int patrol_dir;              // -1: 左, +1: 右
    float turret_angle;          // 炮台角度 (弧度)

    // 胶囊特有
    contra_badge_t drop_badge;
    float capsule_base_y;
    float capsule_phase;

    // BOSS 特有
    contra_boss_phase_t boss_phase;
} contra_enemy_t;

// 掉落道具实体
typedef struct {
    float x, y;
    float vy;
    int w, h;
    contra_badge_t badge;
    bool active;
} contra_item_t;

// 音效触发事件集合
typedef struct {
    bool snd_fire;
    bool snd_spread;
    bool snd_laser;
    bool snd_hit;
    bool snd_explode;
    bool snd_boss_hit;
    bool snd_boss_dead;
    bool snd_upgrade;
    bool snd_player_hit;
    bool snd_player_die;
} contra_sound_events_t;

// 游戏核心上下文
typedef struct {
    // 玩家属性
    float player_x;
    float player_y;
    float player_vx;
    float player_vy;
    int player_w;
    int player_h;
    int player_hp;
    int player_max_hp;
    int lives;
    int invincible_timer_ms;
    bool is_crouching;
    bool is_jumping;
    bool is_grounded;
    contra_aim_t aim_dir;
    int facing_dir;              // 1: 右, -1: 左
    contra_weapon_t weapon_type;
    int fire_cooldown_ms;
    int bombs;

    // 按键瞬时状态
    bool key_up;
    bool key_down;
    bool key_ok;

    // 实体池
    contra_bullet_t player_bullets[CONTRA_MAX_PLAYER_BULLETS];
    contra_bullet_t enemy_bullets[CONTRA_MAX_ENEMY_BULLETS];
    contra_enemy_t enemies[CONTRA_MAX_ENEMIES];
    contra_item_t items[CONTRA_MAX_ITEMS];

    // 全局状态
    int score;
    int combo;
    int combo_timer_ms;
    int max_combo;
    uint32_t game_time_ms;
    bool paused;
    bool game_over;
    bool victory;

    // 音效事件触发
    contra_sound_events_t snd;
} contra_game_t;

// 核心游戏生命周期
void contra_logic_init(contra_game_t *g);
void contra_logic_update(contra_game_t *g, uint32_t dt_ms);
bool contra_logic_fire(contra_game_t *g);

// 按键接口
void contra_logic_btn_up(contra_game_t *g, bool pressed);
void contra_logic_btn_down(contra_game_t *g, bool pressed);
void contra_logic_btn_ok(contra_game_t *g, bool pressed);

// 玩家精准动作接口
void contra_logic_move_left(contra_game_t *g);
void contra_logic_move_right(contra_game_t *g);
void contra_logic_stop_x(contra_game_t *g);
void contra_logic_jump(contra_game_t *g);
void contra_logic_crouch(contra_game_t *g, bool crouch);
void contra_logic_aim(contra_game_t *g, contra_aim_t aim);
bool contra_logic_throw_bomb(contra_game_t *g);

// 实体生成辅助接口
int contra_logic_spawn_enemy(contra_game_t *g, contra_enemy_type_t type, float x, float y);
int contra_logic_spawn_capsule(contra_game_t *g, float x, float y, contra_badge_t badge);
int contra_logic_spawn_boss(contra_game_t *g, float x, float y, int max_hp);
int contra_logic_spawn_item(contra_game_t *g, contra_badge_t badge, float x, float y);
