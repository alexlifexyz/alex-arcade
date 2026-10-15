#pragma once

#include <stdbool.h>
#include <stdint.h>

#define PONG_SCREEN_W              240
#define PONG_SCREEN_H              320
#define PONG_WINNING_SCORE         5

#define PONG_PADDLE_W              50.0f
#define PONG_PADDLE_H              8.0f
#define PONG_PLAYER_PADDLE_Y       300.0f
#define PONG_AI_PADDLE_Y           20.0f

#define PONG_PLAYER_SPEED          220.0f
#define PONG_AI_DEFAULT_SPEED      160.0f
#define PONG_AI_REACTION_DELAY_MS  60

#define PONG_BASE_SPEED_Y          190.0f
#define PONG_BALL_DEFAULT_RADIUS   4.0f
#define PONG_BALL_MEGA_RADIUS      10.0f
#define PONG_BALL_HYPER_RADIUS     3.5f

#define PONG_SLICE_WINDOW_MS       250
#define PONG_MAX_BALLS             2
#define PONG_DEFAULT_RALLY_MUTATION 4

typedef enum {
    PONG_MUTATION_NORMAL = 0,     // 标准球 (Normal)
    PONG_MUTATION_MEGA_BALL,      // 巨大化慢速球 (Mega Ball)
    PONG_MUTATION_HYPER_SPEED,    // 超光速球 (Hyper Speed)
    PONG_MUTATION_CURVE_BALL,     // 带切向旋转弧线球 (Curve Ball)
    PONG_MUTATION_DUAL_BALL,      // 分裂双球 (Dual Ball)
    PONG_MUTATION_COUNT,
} pong_mutation_t;

typedef enum {
    PONG_KEY_UP = 0,    // 挡板左移
    PONG_KEY_DOWN,      // 挡板右移
    PONG_KEY_OK,        // 发球 / 接球切削加转
} pong_key_t;

typedef enum {
    PONG_STATE_SERVE = 0,
    PONG_STATE_PLAYING,
    PONG_STATE_GAME_OVER,
} pong_state_t;

typedef enum {
    PONG_SIDE_PLAYER = 0,
    PONG_SIDE_AI,
} pong_side_t;

typedef enum {
    PONG_WINNER_NONE = 0,
    PONG_WINNER_PLAYER,
    PONG_WINNER_AI,
} pong_winner_t;

typedef struct {
    float x;
    float y;
    float vx;
    float vy;
    float radius;
    pong_mutation_t mutation;
    bool active;
    float curve_accel;
    float curve_dir;
    float curve_timer;
} pong_ball_t;

typedef struct {
    // 挡板参数 (中心坐标与尺寸)
    float player_paddle_x;
    float player_paddle_y;
    float player_paddle_w;
    float player_paddle_h;
    float player_speed;

    float ai_paddle_x;
    float ai_paddle_y;
    float ai_paddle_w;
    float ai_paddle_h;
    float ai_speed;
    float ai_target_x;
    int ai_reaction_timer_ms;
    int ai_reaction_delay_ms;

    // 球体池 (支持 DUAL_BALL 分裂)
    pong_ball_t balls[PONG_MAX_BALLS];

    // 记分与对局状态
    int player_score;
    int ai_score;
    pong_state_t state;
    pong_winner_t winner;
    pong_side_t serve_owner;
    pong_side_t last_scorer;
    int serve_timer_ms;

    // 回合与变异统计
    int rally_hits;
    int total_hits;
    int mutation_threshold;

    // 切削加转状态
    int slice_timer_ms;
    int slice_hit_count;
    bool last_slice_hit;
    bool last_sweet_spot;   // 挡板甜区抽射

    // 输入按键状态
    bool key_up;
    bool key_down;
    bool key_ok;

    // 瞬时音效/事件标记
    bool snd_hit_paddle;
    bool snd_hit_wall;
    bool snd_score;
    bool snd_slice;
    bool snd_mutation;
    bool snd_serve;
    bool snd_gameover;
    bool snd_power;         // 甜区抽射

    // 随机数发生器内部状态 (保证宿主单测和嵌入式确定性)
    uint32_t rng_state;
} pong_game_t;

void pong_logic_init(pong_game_t *g);
void pong_logic_update(pong_game_t *g, int dt_ms);
void pong_logic_input(pong_game_t *g, pong_key_t key, bool pressed);

// 辅助与状态操控函数 (方便单元测试与交互)
void pong_serve(pong_game_t *g);
void pong_trigger_mutation(pong_game_t *g, pong_mutation_t mutation);
void pong_move_paddle_left(pong_game_t *g, float dt_sec);
void pong_move_paddle_right(pong_game_t *g, float dt_sec);
const char *pong_mutation_name(pong_mutation_t mutation);
