// main/match3_logic.c —— 《赛博晶核消消乐》核心独立算法与状态机实现
#include "match3_logic.h"
#include <string.h>

// 动画时长常量 (毫秒)，极速灵敏，绝不拖泥带水
#define DURATION_SWAP_MS  120 // 交换滑步仅 120ms
#define DURATION_CLEAR_MS 140 // 消除闪烁仅 140ms
#define DURATION_DROP_MS  130 // 下落填充仅 130ms
#define DURATION_REVERT_MS 90 // 无效回弹仅 90ms

// 轻量级确定性伪随机数生成器 (XORShift32)
static uint32_t m3_rand(match3_game_t *game)
{
    if (game->rng_state == 0) game->rng_state = 0x12345678;
    uint32_t x = game->rng_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    game->rng_state = x;
    return x;
}

static match3_gem_type_t m3_random_color(match3_game_t *game)
{
    return (match3_gem_type_t)((m3_rand(game) % MATCH3_GEM_TYPES) + 1);
}

// 检查某个位置邻居坐标是否合法
static bool get_neighbor_coord(int r, int c, match3_dir_t dir, int *out_r, int *out_c)
{
    int nr = r;
    int nc = c;
    switch (dir) {
        case DIR_UP:    nr = r - 1; break;
        case DIR_RIGHT: nc = c + 1; break;
        case DIR_DOWN:  nr = r + 1; break;
        case DIR_LEFT:  nc = c - 1; break;
        default: return false;
    }
    if (nr < 0 || nr >= MATCH3_ROWS || nc < 0 || nc >= MATCH3_COLS) {
        return false;
    }
    *out_r = nr;
    *out_c = nc;
    return true;
}

// 查找当前点最近的有效邻居方向
static bool find_first_valid_neighbor(int r, int c, match3_dir_t start_dir, match3_dir_t *out_dir, int *out_r, int *out_c)
{
    for (int i = 0; i < DIR_COUNT; i++) {
        match3_dir_t d = (match3_dir_t)((start_dir + i) % DIR_COUNT);
        int nr, nc;
        if (get_neighbor_coord(r, c, d, &nr, &nc)) {
            *out_dir = d;
            *out_r = nr;
            *out_c = nc;
            return true;
        }
    }
    return false;
}

// 快速检查是否存在任意 3 连 (用于开局防三消和死局验证)
static bool check_simple_matches(const match3_gem_t board[MATCH3_ROWS][MATCH3_COLS])
{
    // 横向扫描
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS - 2; c++) {
            match3_gem_type_t col = match3_get_color(board[r][c]);
            if (col != GEM_NONE &&
                col == match3_get_color(board[r][c + 1]) &&
                col == match3_get_color(board[r][c + 2])) {
                return true;
            }
        }
    }
    // 纵向扫描
    for (int c = 0; c < MATCH3_COLS; c++) {
        for (int r = 0; r < MATCH3_ROWS - 2; r++) {
            match3_gem_type_t col = match3_get_color(board[r][c]);
            if (col != GEM_NONE &&
                col == match3_get_color(board[r + 1][c]) &&
                col == match3_get_color(board[r + 2][c])) {
                return true;
            }
        }
    }
    return false;
}

// 扫描全场匹配，记录消除坐标与特殊宝石生成
bool match3_find_matches(match3_game_t *game, match3_match_result_t *result)
{
    if (!result) return false;
    memset(result, 0, sizeof(match3_match_result_t));

    bool marked[MATCH3_ROWS][MATCH3_COLS] = {false};
    bool is_h_match[MATCH3_ROWS][MATCH3_COLS] = {false};
    bool is_v_match[MATCH3_ROWS][MATCH3_COLS] = {false};

    // 1. 扫描所有横向 3 连及以上
    for (int r = 0; r < MATCH3_ROWS; r++) {
        int c = 0;
        while (c < MATCH3_COLS) {
            match3_gem_type_t col = match3_get_color(game->board[r][c]);
            if (col == GEM_NONE) { c++; continue; }

            int match_len = 1;
            while (c + match_len < MATCH3_COLS &&
                   match3_get_color(game->board[r][c + match_len]) == col) {
                match_len++;
            }

            if (match_len >= 3) {
                for (int i = 0; i < match_len; i++) {
                    marked[r][c + i] = true;
                    is_h_match[r][c + i] = true;
                }
                // 4连生成横向激光核
                if (match_len == 4) {
                    game->board[r][c + 1] = match3_make_gem(col, SPECIAL_ROW_LASER);
                    result->has_laser = true;
                } else if (match_len >= 5) {
                    // 5连生成全彩虹星核
                    game->board[r][c + 2] = match3_make_gem(GEM_NONE, SPECIAL_RAINBOW);
                    result->has_rainbow = true;
                }
            }
            c += match_len;
        }
    }

    // 2. 扫描所有纵向 3 连及以上
    for (int c = 0; c < MATCH3_COLS; c++) {
        int r = 0;
        while (r < MATCH3_ROWS) {
            match3_gem_type_t col = match3_get_color(game->board[r][c]);
            if (col == GEM_NONE) { r++; continue; }

            int match_len = 1;
            while (r + match_len < MATCH3_ROWS &&
                   match3_get_color(game->board[r + match_len][c]) == col) {
                match_len++;
            }

            if (match_len >= 3) {
                for (int i = 0; i < match_len; i++) {
                    marked[r + i][c] = true;
                    is_v_match[r + i][c] = true;
                }
                if (match_len == 4) {
                    game->board[r + 1][c] = match3_make_gem(col, SPECIAL_COL_LASER);
                    result->has_laser = true;
                } else if (match_len >= 5) {
                    game->board[r + 2][c] = match3_make_gem(GEM_NONE, SPECIAL_RAINBOW);
                    result->has_rainbow = true;
                }
            }
            r += match_len;
        }
    }

    // 3. 交叉点检测 (T型或L型5连生成十字炸弹)
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            if (is_h_match[r][c] && is_v_match[r][c]) {
                match3_gem_type_t col = match3_get_color(game->board[r][c]);
                game->board[r][c] = match3_make_gem(col, SPECIAL_BOMB);
                result->has_bomb = true;
            }
        }
    }

    // 4. 展开特殊宝石效果连锁
    bool extra_added = true;
    while (extra_added) {
        extra_added = false;
        for (int r = 0; r < MATCH3_ROWS; r++) {
            for (int c = 0; c < MATCH3_COLS; c++) {
                if (!marked[r][c]) continue;
                uint8_t spec = match3_get_special(game->board[r][c]);

                if (spec == SPECIAL_ROW_LASER) {
                    for (int j = 0; j < MATCH3_COLS; j++) {
                        if (!marked[r][j]) { marked[r][j] = true; extra_added = true; }
                    }
                } else if (spec == SPECIAL_COL_LASER) {
                    for (int i = 0; i < MATCH3_ROWS; i++) {
                        if (!marked[i][c]) { marked[i][c] = true; extra_added = true; }
                    }
                } else if (spec == SPECIAL_BOMB) {
                    for (int dr = -1; dr <= 1; dr++) {
                        for (int dc = -1; dc <= 1; dc++) {
                            int nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < MATCH3_ROWS && nc >= 0 && nc < MATCH3_COLS) {
                                if (!marked[nr][nc]) { marked[nr][nc] = true; extra_added = true; }
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. 将标记的格子收集入结果结构
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            if (marked[r][c]) {
                result->cells[result->count][0] = (uint8_t)r;
                result->cells[result->count][1] = (uint8_t)c;
                result->count++;
                game->clear_mask[r][c] = true;
            } else {
                game->clear_mask[r][c] = false;
            }
        }
    }

    return (result->count > 0);
}

// 重力下落与填充
bool match3_apply_gravity(match3_game_t *game)
{
    bool moved = false;
    for (int c = 0; c < MATCH3_COLS; c++) {
        // 从底往上压实非空宝石
        int write_r = MATCH3_ROWS - 1;
        for (int r = MATCH3_ROWS - 1; r >= 0; r--) {
            if (game->board[r][c] != GEM_NONE) {
                if (write_r != r) {
                    game->board[write_r][c] = game->board[r][c];
                    game->board[r][c] = GEM_NONE;
                    moved = true;
                }
                write_r--;
            }
        }
        // 顶部空位填充新宝石
        while (write_r >= 0) {
            game->board[write_r][c] = match3_make_gem(m3_random_color(game), SPECIAL_NONE);
            write_r--;
            moved = true;
        }
    }
    return moved;
}

// 尝试在当前盘面上交换两块并检查是否有效
bool match3_try_swap(match3_game_t *game, int r1, int c1, int r2, int c2)
{
    // 彩虹星核特殊判定: 彩虹核与任意颜色交换均直接有效
    if (match3_get_special(game->board[r1][c1]) == SPECIAL_RAINBOW ||
        match3_get_special(game->board[r2][c2]) == SPECIAL_RAINBOW) {
        return true;
    }

    // 临时交换
    match3_gem_t tmp = game->board[r1][c1];
    game->board[r1][c1] = game->board[r2][c2];
    game->board[r2][c2] = tmp;

    bool has_match = check_simple_matches(game->board);

    // 换回
    game->board[r2][c2] = game->board[r1][c1];
    game->board[r1][c1] = tmp;

    return has_match;
}

// 死局检测: 扫描是否有任何有效一步
bool match3_has_valid_moves(const match3_game_t *game)
{
    match3_gem_t temp[MATCH3_ROWS][MATCH3_COLS];
    memcpy(temp, game->board, sizeof(temp));

    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            // 检查右邻居
            if (c + 1 < MATCH3_COLS) {
                match3_gem_t t = temp[r][c]; temp[r][c] = temp[r][c + 1]; temp[r][c + 1] = t;
                if (check_simple_matches(temp)) return true;
                t = temp[r][c]; temp[r][c] = temp[r][c + 1]; temp[r][c + 1] = t;
            }
            // 检查下邻居
            if (r + 1 < MATCH3_ROWS) {
                match3_gem_t t = temp[r][c]; temp[r][c] = temp[r + 1][c]; temp[r + 1][c] = t;
                if (check_simple_matches(temp)) return true;
                t = temp[r][c]; temp[r][c] = temp[r + 1][c]; temp[r + 1][c] = t;
            }
        }
    }
    return false;
}

// 重新洗牌
void match3_shuffle(match3_game_t *game)
{
    int attempts = 0;
    while (attempts++ < 100) {
        // Fisher-Yates 随机打乱
        for (int i = (MATCH3_ROWS * MATCH3_COLS) - 1; i > 0; i--) {
            int j = m3_rand(game) % (i + 1);
            int r1 = i / MATCH3_COLS, c1 = i % MATCH3_COLS;
            int r2 = j / MATCH3_COLS, c2 = j % MATCH3_COLS;
            match3_gem_t tmp = game->board[r1][c1];
            game->board[r1][c1] = game->board[r2][c2];
            game->board[r2][c2] = tmp;
        }

        // 打乱后必须无自发三连，且至少有1个有效移动
        if (!check_simple_matches(game->board) && match3_has_valid_moves(game)) {
            break;
        }
    }
    game->pending_sound = M3_SND_SHUFFLE;
}

// 初始化游戏上下文
void match3_init(match3_game_t *game, uint32_t seed, uint32_t initial_moves, uint32_t target_score)
{
    if (!game) return;
    memset(game, 0, sizeof(match3_game_t));
    game->rng_state = (seed == 0) ? 0x98765432 : seed;
    game->moves_left = (initial_moves == 0) ? 25 : initial_moves;
    game->target_score = (target_score == 0) ? 15000 : target_score;
    game->state = STATE_SELECT_SRC;
    game->cursor_r = MATCH3_ROWS / 2;
    game->cursor_c = MATCH3_COLS / 2;
    game->selected_r = -1;
    game->selected_c = -1;

    // 填充无初始三连的棋盘
    int safety = 0;
    while (safety++ < 50) {
        for (int r = 0; r < MATCH3_ROWS; r++) {
            for (int c = 0; c < MATCH3_COLS; c++) {
                match3_gem_type_t col;
                int retries = 0;
                do {
                    col = m3_random_color(game);
                    retries++;
                } while (retries < 20 &&
                        ((r >= 2 && match3_get_color(game->board[r - 1][c]) == col && match3_get_color(game->board[r - 2][c]) == col) ||
                         (c >= 2 && match3_get_color(game->board[r][c - 1]) == col && match3_get_color(game->board[r][c - 2]) == col)));
                game->board[r][c] = match3_make_gem(col, SPECIAL_NONE);
            }
        }
        if (match3_has_valid_moves(game)) break;
    }
}

// UP 按键输入
void match3_input_up(match3_game_t *game)
{
    if (!game) return;

    if (game->state == STATE_SELECT_SRC) {
        // 自由光标逆移一格
        game->cursor_c--;
        if (game->cursor_c < 0) {
            game->cursor_c = MATCH3_COLS - 1;
            game->cursor_r--;
            if (game->cursor_r < 0) {
                game->cursor_r = MATCH3_ROWS - 1;
            }
        }
        game->pending_sound = M3_SND_CURSOR;
    } else if (game->state == STATE_SELECT_DIR) {
        // 定向邻居逆时针轮换
        match3_dir_t d = game->target_dir;
        for (int i = 1; i <= DIR_COUNT; i++) {
            match3_dir_t nd = (match3_dir_t)((d + DIR_COUNT - i) % DIR_COUNT);
            int nr, nc;
            if (get_neighbor_coord(game->selected_r, game->selected_c, nd, &nr, &nc)) {
                game->target_dir = nd;
                game->target_r = nr;
                game->target_c = nc;
                game->pending_sound = M3_SND_CURSOR;
                break;
            }
        }
    }
}

// DOWN 按键输入
void match3_input_down(match3_game_t *game)
{
    if (!game) return;

    if (game->state == STATE_SELECT_SRC) {
        // 自由光标顺移一格
        game->cursor_c++;
        if (game->cursor_c >= MATCH3_COLS) {
            game->cursor_c = 0;
            game->cursor_r++;
            if (game->cursor_r >= MATCH3_ROWS) {
                game->cursor_r = 0;
            }
        }
        game->pending_sound = M3_SND_CURSOR;
    } else if (game->state == STATE_SELECT_DIR) {
        // 定向邻居顺时针轮换
        match3_dir_t d = game->target_dir;
        for (int i = 1; i <= DIR_COUNT; i++) {
            match3_dir_t nd = (match3_dir_t)((d + i) % DIR_COUNT);
            int nr, nc;
            if (get_neighbor_coord(game->selected_r, game->selected_c, nd, &nr, &nc)) {
                game->target_dir = nd;
                game->target_r = nr;
                game->target_c = nc;
                game->pending_sound = M3_SND_CURSOR;
                break;
            }
        }
    }
}

// OK 按键输入
void match3_input_ok(match3_game_t *game)
{
    if (!game) return;

    if (game->state == STATE_SELECT_SRC) {
        // 锁定当前选中的基准块
        game->selected_r = game->cursor_r;
        game->selected_c = game->cursor_c;
        match3_dir_t out_d;
        int out_r, out_c;
        if (find_first_valid_neighbor(game->selected_r, game->selected_c, DIR_RIGHT, &out_d, &out_r, &out_c)) {
            game->target_dir = out_d;
            game->target_r = out_r;
            game->target_c = out_c;
            game->state = STATE_SELECT_DIR;
            game->pending_sound = M3_SND_LOCK;
        }
    } else if (game->state == STATE_SELECT_DIR) {
        // 执行选定方向交换
        game->state = STATE_ANIM_SWAP;
        game->anim_timer_ms = 0;
        game->swap_progress = 0.0f;
        game->swap_is_revert = false;
        game->pending_sound = M3_SND_SWAP;
    } else if (game->state == STATE_GAMEOVER || game->state == STATE_VICTORY) {
        // 重开一局
        match3_init(game, game->rng_state + 1, 25, 15000);
        game->pending_sound = M3_SND_LOCK;
    }
}

// 核心帧步进函数 (可在 LVGL timer 或游戏循环中以 20~30ms 均匀调用)
void match3_step(match3_game_t *game, uint32_t dt_ms)
{
    if (!game) return;

    // 狂暴模式倒计时
    if (game->fever_active) {
        if (game->fever_timer_ms > dt_ms) {
            game->fever_timer_ms -= dt_ms;
        } else {
            game->fever_active = false;
            game->fever_energy = 0;
        }
    }

    switch (game->state) {
        case STATE_ANIM_SWAP: {
            game->anim_timer_ms += dt_ms;
            game->swap_progress = (float)game->anim_timer_ms / (float)DURATION_SWAP_MS;
            if (game->swap_progress >= 1.0f) {
                // 交换动画结束，交换数据并判定
                int r1 = game->selected_r, c1 = game->selected_c;
                int r2 = game->target_r, c2 = game->target_c;
                match3_gem_t tmp = game->board[r1][c1];
                game->board[r1][c1] = game->board[r2][c2];
                game->board[r2][c2] = tmp;

                // 彩虹星核特殊处理
                if (match3_get_special(game->board[r1][c1]) == SPECIAL_RAINBOW ||
                    match3_get_special(game->board[r2][c2]) == SPECIAL_RAINBOW) {
                    match3_gem_type_t clear_color = match3_get_color(game->board[r1][c1]);
                    if (clear_color == GEM_NONE) clear_color = match3_get_color(game->board[r2][c2]);

                    for (int r = 0; r < MATCH3_ROWS; r++) {
                        for (int c = 0; c < MATCH3_COLS; c++) {
                            if (match3_get_color(game->board[r][c]) == clear_color ||
                                match3_get_special(game->board[r][c]) == SPECIAL_RAINBOW) {
                                game->clear_mask[r][c] = true;
                            }
                        }
                    }
                    if (game->moves_left > 0) game->moves_left--;
                    game->state = STATE_ANIM_CLEAR;
                    game->anim_timer_ms = 0;
                    game->combo_count = 1;
                    game->pending_sound = M3_SND_SPECIAL_EXPLODE;
                    break;
                }

                match3_match_result_t mr;
                if (match3_find_matches(game, &mr)) {
                    // 有效消除！消耗步数
                    if (game->moves_left > 0) game->moves_left--;
                    game->state = STATE_ANIM_CLEAR;
                    game->anim_timer_ms = 0;
                    game->combo_count = 1;

                    // 计算积分与狂暴槽
                    uint32_t base_score = mr.count * 100;
                    if (game->fever_active) base_score *= 2;
                    game->score += base_score;

                    if (!game->fever_active) {
                        game->fever_energy += mr.count * 4;
                        if (game->fever_energy >= 100) {
                            game->fever_energy = 100;
                            game->fever_active = true;
                            game->fever_timer_ms = 8000; // 8秒狂暴
                        }
                    }

                    if (mr.has_laser || mr.has_bomb || mr.has_rainbow) {
                        game->pending_sound = M3_SND_SPECIAL_SPAWN;
                    } else {
                        game->pending_sound = M3_SND_MATCH;
                    }
                } else {
                    // 无效移动，回弹
                    game->board[r2][c2] = game->board[r1][c1];
                    game->board[r1][c1] = tmp;
                    game->state = STATE_SELECT_SRC;
                    game->pending_sound = M3_SND_INVALID;
                }
            }
            break;
        }

        case STATE_ANIM_CLEAR: {
            game->anim_timer_ms += dt_ms;
            if (game->anim_timer_ms >= DURATION_CLEAR_MS) {
                // 将标记消除的格子置空
                for (int r = 0; r < MATCH3_ROWS; r++) {
                    for (int c = 0; c < MATCH3_COLS; c++) {
                        if (game->clear_mask[r][c]) {
                            game->board[r][c] = GEM_NONE;
                            game->clear_mask[r][c] = false;
                        }
                    }
                }
                // 进入下落填充动画
                game->state = STATE_ANIM_DROP;
                game->anim_timer_ms = 0;
            }
            break;
        }

        case STATE_ANIM_DROP: {
            game->anim_timer_ms += dt_ms;
            if (game->anim_timer_ms >= DURATION_DROP_MS) {
                // 执行下落与新块填充
                match3_apply_gravity(game);

                // 检查级联连续消除 (Cascading Combo)
                match3_match_result_t cascade_mr;
                if (match3_find_matches(game, &cascade_mr)) {
                    game->combo_count++;
                    uint32_t cascade_score = cascade_mr.count * 150 * game->combo_count;
                    if (game->fever_active) cascade_score *= 2;
                    game->score += cascade_score;
                    game->state = STATE_ANIM_CLEAR;
                    game->anim_timer_ms = 0;
                    game->pending_sound = M3_SND_MATCH;
                } else {
                    // 连锁结束，检查胜负条件与死局
                    game->combo_count = 0;
                    if (game->score >= game->target_score) {
                        game->state = STATE_VICTORY;
                        game->pending_sound = M3_SND_SPECIAL_SPAWN;
                    } else if (game->moves_left == 0) {
                        game->state = STATE_GAMEOVER;
                        game->pending_sound = M3_SND_GAMEOVER;
                    } else {
                        if (!match3_has_valid_moves(game)) {
                            match3_shuffle(game);
                        }
                        game->state = STATE_SELECT_SRC;
                    }
                }
            }
            break;
        }

        default:
            break;
    }
}
