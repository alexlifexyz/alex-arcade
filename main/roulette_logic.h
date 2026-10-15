#pragma once

#include <stdbool.h>
#include <stdint.h>

#define ROULETTE_MAX_SHELLS 8
#define ROULETTE_MAX_ITEMS  4

typedef enum {
    SHELL_BLANK = 0, // 空包弹
    SHELL_LIVE  = 1, // 实弹
} shell_type_t;

typedef enum {
    ITEM_NONE = 0,
    ITEM_BEER,       // 易拉罐: 退出当前弹膛子弹
    ITEM_MAGNIFIER,  // 放大镜: 查看当前弹膛子弹
    ITEM_SAW,        // 手锯: 下一次实弹伤害翻倍 (1 -> 2)
    ITEM_CIGARETTE,  // 香烟: 回复 1 点生命
    ITEM_HANDCUFFS,  // 手铐: 锁住对方，跳过其下一回合
    ITEM_COUNT,
} item_type_t;

typedef enum {
    TARGET_SELF = 0,     // 对自己开火
    TARGET_OPPONENT = 1, // 对对手开火
} fire_target_t;

typedef enum {
    PHASE_PLAYER_TURN = 0, // 玩家回合
    PHASE_DEALER_TURN,     // 恶魔回合
    PHASE_GAME_WIN,        // 玩家获胜
    PHASE_GAME_LOSE,       // 恶魔获胜 (玩家阵亡)
} game_phase_t;

typedef struct {
    bool is_live;
    int damage;
    bool extra_turn;
    bool chamber_emptied;
    bool game_over;
    char detail[48];
} shot_result_t;

typedef struct {
    int player_hp;
    int player_max_hp;
    int dealer_hp;
    int dealer_max_hp;

    shell_type_t chamber[ROULETTE_MAX_SHELLS];
    int total_shells;
    int shell_index;
    int live_count;
    int blank_count;

    item_type_t player_items[ROULETTE_MAX_ITEMS];
    item_type_t dealer_items[ROULETTE_MAX_ITEMS];

    bool is_sawed;
    bool dealer_cuffed;
    bool player_cuffed;
    bool peeked_current;
    shell_type_t peeked_shell;

    game_phase_t phase;
    int round_number;
    char message[64];
} roulette_game_t;

// 游戏逻辑纯函数接口 (可脱离硬件进行主机单测)
void roulette_init(roulette_game_t *g);
void roulette_load_chamber(roulette_game_t *g);
bool roulette_use_item(roulette_game_t *g, int item_idx, bool is_player, char *out_desc);
shot_result_t roulette_fire(roulette_game_t *g, fire_target_t target, bool is_player);
void roulette_dealer_ai_step(roulette_game_t *g, shot_result_t *out_shot, char *out_action);
const char *roulette_item_name(item_type_t item);
