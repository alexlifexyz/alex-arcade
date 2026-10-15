// main/pacman_logic.h —— 《吃豆人极速版 (PAC-MAN Neo-Neon)》核心物理、迷宫与幽灵 AI 状态机
#pragma once

#include <stdbool.h>
#include <stdint.h>

#define PAC_SCREEN_W       240
#define PAC_SCREEN_H       320
#define PAC_HUD_H          24
#define PAC_BOTTOM_H       20
#define PAC_PLAYFIELD_Y    24
#define PAC_PLAYFIELD_W    240
#define PAC_PLAYFIELD_H    276

#define PAC_MAP_COLS       24
#define PAC_MAP_ROWS       23
#define PAC_TILE_SIZE      10 // 10x10 像素一个网格瓦片
#define PAC_OFFSET_X       0
#define PAC_OFFSET_Y       24

#define PAC_MAX_GHOSTS     4
#define PAC_FRIGHTEN_TIME  320 // 惊恐状态持续时间 (约 8 秒 @40FPS)
#define PAC_BOOST_MAX      100 // 氮气能量槽上限

typedef enum {
    PAC_DIR_NONE = 0,
    PAC_DIR_UP,
    PAC_DIR_RIGHT,
    PAC_DIR_DOWN,
    PAC_DIR_LEFT
} pac_dir_t;

typedef enum {
    PAC_TILE_EMPTY = 0,
    PAC_TILE_WALL,       // 霓虹不可穿行墙体
    PAC_TILE_DOT,        // 小黄豆 (+10分)
    PAC_TILE_ENERGIZER,  // 大力丸 (+50分，幽灵蓝化)
    PAC_TILE_GATE,       // 幽灵巢穴门 (仅幽灵可通过)
    PAC_TILE_FRUIT       // 战术水果 (+200分)
} pac_tile_t;

typedef enum {
    GHOST_COLOR_RED = 0,    // Blinky - 追击
    GHOST_COLOR_PINK,       // Pinky  - 伏击包抄
    GHOST_COLOR_CYAN,       // Inky   - 巡航夹击
    GHOST_COLOR_ORANGE      // Clyde  - 胆怯游荡
} pac_ghost_id_t;

typedef enum {
    GHOST_MODE_CHASE = 0,   // 常规追击
    GHOST_MODE_FRIGHTENED,  // 惊恐逃跑 (蓝化可反吃)
    GHOST_MODE_EATEN,       // 只剩眼睛飞回基地
    GHOST_MODE_HOUSE        // 在巢穴等待出门
} pac_ghost_mode_t;

typedef enum {
    PAC_EVT_NONE = 0,
    PAC_EVT_START,
    PAC_EVT_WAKA,
    PAC_EVT_ENERGIZER,
    PAC_EVT_EAT_GHOST,
    PAC_EVT_EAT_FRUIT,
    PAC_EVT_DEATH,
    PAC_EVT_CLEAR
} pac_sound_evt_t;

typedef struct {
    int x;                 // 精确像素坐标
    int y;
    pac_dir_t dir;         // 当前行进方向
    pac_dir_t desired_dir; // 预输入缓存方向
    int speed;             // 当前移速 (基础 2，冲刺 4)
    bool boosting;         // 是否处于氮气超频状态
    int boost_energy;      // 氮气能量 (0..100)
    int anim_frame;        // 大嘴张合动画帧 (0:闭嘴, 1:半张, 2:大张)
} pac_player_t;

typedef struct {
    int x;
    int y;
    pac_dir_t dir;
    pac_ghost_mode_t mode;
    pac_ghost_id_t id;
    int speed;             // 移速 (正常 2, 惊恐 1, 眼睛 4)
    int house_timer;       // 巢穴滞留倒计时
    int anim_frame;
} pac_ghost_t;

typedef struct {
    uint8_t map[PAC_MAP_ROWS][PAC_MAP_COLS];
    int remaining_dots;
    int score;
    int high_score;
    int lives;
    int stage;
    bool game_over;
    bool victory;
    bool paused;
    uint32_t ticks;
    pac_sound_evt_t last_sound;

    pac_player_t pacman;
    pac_ghost_t ghosts[PAC_MAX_GHOSTS];

    int frighten_timer;    // 惊恐倒计时
    int ghosts_eaten_combo;// 单次大力丸连续吃幽灵连击倍数 (200, 400, 800, 1600)
    int fruit_timer;       // 水果出现倒计时
    bool fruit_active;
    int fruit_x;
    int fruit_y;
} pac_game_t;

// 游戏逻辑主接口
void pac_init_game(pac_game_t *game, int stage);
void pac_reset_positions(pac_game_t *game);
void pac_tick(pac_game_t *game);

// 按键输入
void pac_input_turn_cw(pac_game_t *game);   // UP 键: 顺时针转向 90 度
void pac_input_turn_ccw(pac_game_t *game);  // DOWN 键: 逆时针转向 90 度
void pac_input_turn_180(pac_game_t *game);  // OK 键: 紧急调头 180 度
void pac_input_trigger_boost(pac_game_t *game); // 双击 OK: 开启氮气冲刺

// 辅助查询
bool pac_is_wall(const pac_game_t *game, int col, int row, bool is_ghost);
uint8_t pac_get_tile(const pac_game_t *game, int col, int row);
