// main/match3_logic.h —— 《赛博晶核消消乐》(Cyber Match-3: Neon Pop) 核心独立算法与状态机
// 专为 ESP32-C3 极简三键(UP/DOWN/OK)与零动态堆分配(Zero malloc)设计。
// 涵盖 6x7 矩阵连通分支消除、4/5连激光与炸弹生成、重力级联掉落与死局自动洗牌。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define MATCH3_COLS 6
#define MATCH3_ROWS 7
#define MATCH3_GEM_TYPES 5   // 5种基础宝石元素: 1~5

// 宝石类型枚举 (基础颜色 1~5)
typedef enum {
    GEM_NONE   = 0,
    GEM_RED    = 1, // 烈焰红
    GEM_BLUE   = 2, // 冰霜蓝
    GEM_GREEN  = 3, // 翡翠绿
    GEM_YELLOW = 4, // 电浆黄
    GEM_PURPLE = 5, // 虚空紫
} match3_gem_type_t;

// 特殊宝石能力掩码 (高4位)
#define SPECIAL_NONE        0x00
#define SPECIAL_ROW_LASER   0x10 // 消除整行
#define SPECIAL_COL_LASER   0x20 // 消除整列
#define SPECIAL_BOMB        0x40 // 3x3范围十字爆破
#define SPECIAL_RAINBOW     0x80 // 全场同色全消彩虹核

// 宝石数据定义: 低4位为颜色类型, 高4位为特殊属性
typedef uint8_t match3_gem_t;

static inline match3_gem_type_t match3_get_color(match3_gem_t g) {
    return (match3_gem_type_t)(g & 0x0F);
}

static inline uint8_t match3_get_special(match3_gem_t g) {
    return (g & 0xF0);
}

static inline match3_gem_t match3_make_gem(match3_gem_type_t c, uint8_t special) {
    return (match3_gem_t)((c & 0x0F) | (special & 0xF0));
}

// 邻居交换方向 (顺时针: 上 -> 右 -> 下 -> 左)
typedef enum {
    DIR_UP    = 0,
    DIR_RIGHT = 1,
    DIR_DOWN  = 2,
    DIR_LEFT  = 3,
    DIR_COUNT = 4
} match3_dir_t;

// 游戏状态机
typedef enum {
    STATE_SELECT_SRC = 0, // 自由选块态: UP/DOWN 线性移动光标, OK 选定基准块
    STATE_SELECT_DIR,     // 定向交换态: UP/DOWN 顺/逆时针挑选邻居, OK 执行交换
    STATE_ANIM_SWAP,      // 交换动画进行中 (若无效自动弹回)
    STATE_ANIM_CLEAR,     // 消除高亮闪烁中 (爆炸粒子触发)
    STATE_ANIM_DROP,      // 重力掉落填充中
    STATE_GAMEOVER,       // 步数耗尽结算
    STATE_VICTORY         // 目标达成胜利
} match3_state_t;

// 音效触发事件类型 (供 UI 任务或音频任务播放，完全解耦)
typedef enum {
    M3_SND_NONE = 0,
    M3_SND_CURSOR,        // 光标移动微滴答
    M3_SND_LOCK,          // 选中基准块咔哒
    M3_SND_SWAP,          // 交换滑步
    M3_SND_INVALID,       // 无法消除弹回低音
    M3_SND_MATCH,         // 消除连击 (随 combo 升调)
    M3_SND_SPECIAL_SPAWN, // 4/5连生成特殊宝石欢呼
    M3_SND_SPECIAL_EXPLODE, // 激光/炸弹/彩虹全屏爆炸
    M3_SND_SHUFFLE,       // 死局自动重新洗牌
    M3_SND_GAMEOVER       // 游戏结束
} match3_sound_t;

// 匹配记录结果结构体
typedef struct {
    uint8_t count;
    uint8_t cells[MATCH3_ROWS * MATCH3_COLS][2]; // [i][0]=row, [i][1]=col
    bool has_laser;
    bool has_bomb;
    bool has_rainbow;
} match3_match_result_t;

// 核心游戏上下文
typedef struct {
    match3_gem_t board[MATCH3_ROWS][MATCH3_COLS];
    
    // 光标位置
    int cursor_r;
    int cursor_c;

    // 选中基准块位置
    int selected_r;
    int selected_c;

    // 交换目标方向 (DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT)
    match3_dir_t target_dir;
    int target_r;
    int target_c;

    // 状态机
    match3_state_t state;
    uint32_t anim_timer_ms;

    // 计分与连击
    uint32_t score;
    uint32_t moves_left;
    uint32_t target_score;
    uint32_t combo_count;
    uint32_t fever_energy;   // 0 ~ 100 狂暴能量槽
    bool fever_active;
    uint32_t fever_timer_ms;

    // 消除标记位图 (用于闪烁动画)
    bool clear_mask[MATCH3_ROWS][MATCH3_COLS];

    // 交换动画进度 (0.0 ~ 1.0)
    float swap_progress;
    bool swap_is_revert;

    // 待播音效
    match3_sound_t pending_sound;

    // 伪随机数种子 (保证确定性与轻量)
    uint32_t rng_state;
} match3_game_t;

// 核心 API 声明 (全部零 malloc、轻量可重入)
void match3_init(match3_game_t *game, uint32_t seed, uint32_t initial_moves, uint32_t target_score);
void match3_step(match3_game_t *game, uint32_t dt_ms);

// 按键输入分发
void match3_input_up(match3_game_t *game);
void match3_input_down(match3_game_t *game);
void match3_input_ok(match3_game_t *game);

// 算法检测接口 (公开便于 Host 单测)
bool match3_find_matches(match3_game_t *game, match3_match_result_t *result);
bool match3_apply_gravity(match3_game_t *game);
bool match3_has_valid_moves(const match3_game_t *game);
void match3_shuffle(match3_game_t *game);
bool match3_try_swap(match3_game_t *game, int r1, int c1, int r2, int c2);

#ifdef __cplusplus
}
#endif
