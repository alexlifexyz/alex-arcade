#pragma once

#include <stdbool.h>
#include <stdint.h>

#define SCREEN_W 240
#define SCREEN_H 320

#define THUNDER_MAX_BULLETS       56
#define THUNDER_MAX_ENEMY_BULLETS 20
#define THUNDER_MAX_ENEMIES       8
#define THUNDER_MAX_ITEMS         5
#define THUNDER_MAX_STARS         32
#define THUNDER_MAX_PARTICLES     32
#define THUNDER_SHOOT_INTERVAL    5

typedef enum {
    ENEMY_FALCON = 0,   // 烈隼三角隐形战机 (26x24)
    ENEMY_WYVERN = 1,   // 幻翼机械飞龙/生化蝠翼兽 (32x28, 动态扇翅)
    ENEMY_FORTRESS = 2, // 空中重装巡洋堡垒 (36x30)
    ENEMY_BOSS = 3,     // 星海利维坦龙神 BOSS (68x50)
} enemy_type_t;

typedef enum {
    ITEM_TYPE_POWER = 0, // [P] 升级武器火力 (Level 1~4)
    ITEM_TYPE_BOMB = 1,  // [B] 补充全屏核弹
    ITEM_TYPE_HEAL = 2,  // [H] 回复生命
    ITEM_TYPE_SHIELD = 3,// [S] 离子护盾 (抵挡伤害力场)
    ITEM_TYPE_WAVE = 4,  // [W] 切换/强化 S型蛇形波动弹
    ITEM_TYPE_FIRE = 5,  // [F] 切换/强化 炼狱烈焰爆破弹
} item_type_t;

typedef enum {
    BULLET_TRAJ_LINE = 0, // 直线贯穿光束
    BULLET_TRAJ_WAVE,     // S型蛇形波动 (正弦回旋)
    BULLET_TRAJ_FIRE,     // 炼狱烈焰爆弹 (烈焰火尾与爆炸伤害)
} bullet_traj_t;

typedef enum {
    WEAPON_STYLE_VULCAN = 0, // 突击神火 (直线穿甲巨炮)
    WEAPON_STYLE_WAVE = 1,   // 幻影波动 (S弯全屏舞动)
    WEAPON_STYLE_FIRE = 2,   // 炼狱烈焰 (狂暴火球贯穿)
} weapon_style_t;

typedef struct {
    float x, y;
    float base_x;        // 波动弹基准轴
    float vx, vy;
    int w, h;
    int dmg;
    bullet_traj_t traj;
    float phase;         // S波动相位
    bool piercing;       // 穿透特性
    bool active;
    uint32_t color;
} bullet_t;

typedef struct {
    float x, y;
    float vx, vy;
    int w, h;
    int hp;
    int max_hp;
    enemy_type_t type;
    int shoot_timer;
    int anim_tick;       // 翅膀扇动/推进器喷口动画
    bool active;
} enemy_t;

typedef struct {
    float x, y;
    int w, h;
    item_type_t type;
    bool active;
} thunder_item_t;

typedef struct {
    float x, y;
    float speed;
    uint8_t size;
    uint32_t color;
} star_t;

typedef struct {
    float x, y;
    float vx, vy;
    int life;
    int max_life;
    int size;
    uint32_t color;
} particle_t;

typedef struct {
    // 玩家数据
    float player_x;
    float player_y;
    int player_w;
    int player_h;
    int player_hp;
    int player_max_hp;
    int shield;          // 护盾 (0~2)
    int bombs;
    int weapon_level;    // 1~4
    weapon_style_t weapon_style; // 当前弹道流派
    bool has_wingman;    // 浮游僚机卫星
    int combo;           // 连击数
    int combo_timer;     // 连击衰减计时
    int invincible_timer;
    int shoot_timer;
    int buff_timer;      // 武器强化法宝限时倒计时 (ticks)

    // 暂停状态
    bool paused;

    // 实体池
    bullet_t bullets[THUNDER_MAX_BULLETS];
    bullet_t enemy_bullets[THUNDER_MAX_ENEMY_BULLETS];
    enemy_t enemies[THUNDER_MAX_ENEMIES];
    thunder_item_t items[THUNDER_MAX_ITEMS];

    // 星空与爆炸粒子
    star_t stars[THUNDER_MAX_STARS];
    particle_t particles[THUNDER_MAX_PARTICLES];
    int screen_shake;

    // BOSS
    bool boss_active;
    int boss_idx;

    // 游戏统计
    int score;
    int wave_tick;
    bool game_over;
    bool bomb_triggered; // 全屏核弹白光

    // 音效触发事件
    bool snd_laser;
    bool snd_wave;
    bool snd_fire;
    bool snd_shield;
    bool snd_pause;
    bool snd_hit;
    bool snd_explode;
    bool snd_explode_big;
    bool snd_bomb;
    bool snd_powerup;
    bool snd_gameover;
} thunder_game_t;

void thunder_init(thunder_game_t *g);
void thunder_move_left(thunder_game_t *g);
void thunder_move_right(thunder_game_t *g);
void thunder_move_up(thunder_game_t *g);
void thunder_move_down(thunder_game_t *g);
void thunder_toggle_pause(thunder_game_t *g);
bool thunder_use_bomb(thunder_game_t *g);
void thunder_step(thunder_game_t *g);

