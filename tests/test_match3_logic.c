// tests/test_match3_logic.c —— 《赛博晶核消消乐》核心算法与状态机单元测试
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "match3_logic.h"

int main(void)
{
    printf("=======================================================\n");
    printf("  Starting Cyber Match-3 (Neon Pop) Unit Test Suite   \n");
    printf("=======================================================\n");

    match3_game_t g;

    // [TEST 1] 初始化与棋盘生成
    printf("[TEST 1] Testing Initialization & Board Generation...\n");
    match3_init(&g, 12345, 25, 15000);
    assert(g.state == STATE_SELECT_SRC);
    assert(g.moves_left == 25);
    assert(g.target_score == 15000);
    assert(g.score == 0);
    assert(g.combo_count == 0);
    assert(g.cursor_r == MATCH3_ROWS / 2);
    assert(g.cursor_c == MATCH3_COLS / 2);

    // 验证棋盘方块均在 1~5 范围，且绝无开局自然三连
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            match3_gem_type_t col = match3_get_color(g.board[r][c]);
            assert(col >= GEM_RED && col <= GEM_PURPLE);
            assert(match3_get_special(g.board[r][c]) == SPECIAL_NONE);
        }
    }
    // 检查初始盘面无自然三消
    match3_match_result_t init_mr;
    assert(!match3_find_matches(&g, &init_mr));
    // 检查初始盘面一定存在至少一个可消除解
    assert(match3_has_valid_moves(&g));
    printf("  ✓ Initialization values & valid playable start board OK\n");

    // [TEST 2] 三键输入与导航
    printf("[TEST 2] Testing 3-Button Input & Direction Navigation...\n");
    int init_cr = g.cursor_r;
    int init_cc = g.cursor_c;

    // 按 DOWN 顺移
    match3_input_down(&g);
    assert(g.cursor_c == init_cc + 1);
    assert(g.pending_sound == M3_SND_CURSOR);

    // 按 UP 逆移
    match3_input_up(&g);
    assert(g.cursor_c == init_cc && g.cursor_r == init_cr);

    // 按 OK 选中当前基准块
    match3_input_ok(&g);
    assert(g.state == STATE_SELECT_DIR);
    assert(g.selected_r == init_cr && g.selected_c == init_cc);
    assert(g.pending_sound == M3_SND_LOCK);

    // 在 SELECT_DIR 状态按 DOWN / UP 轮换邻居方向
    match3_dir_t d1 = g.target_dir;
    match3_input_down(&g);
    assert(g.target_dir != d1 || (init_cr == 0 && init_cc == 0)); // 确保方向被切换
    match3_input_up(&g);
    assert(g.target_dir == d1);
    printf("  ✓ UP/DOWN/OK smooth cursor navigation & target selection OK\n");

    // [TEST 3] 基础 3 连消除与匹配检测
    printf("[TEST 3] Testing Horizontal & Vertical 3-Matches...\n");
    // 人工构造一行三连
    memset(g.board, 0, sizeof(g.board));
    g.board[2][1] = match3_make_gem(GEM_RED, SPECIAL_NONE);
    g.board[2][2] = match3_make_gem(GEM_RED, SPECIAL_NONE);
    g.board[2][3] = match3_make_gem(GEM_RED, SPECIAL_NONE);
    g.board[2][0] = match3_make_gem(GEM_BLUE, SPECIAL_NONE);
    g.board[2][4] = match3_make_gem(GEM_GREEN, SPECIAL_NONE);

    match3_match_result_t mr;
    bool found = match3_find_matches(&g, &mr);
    assert(found == true);
    assert(mr.count == 3);
    assert(g.clear_mask[2][1] && g.clear_mask[2][2] && g.clear_mask[2][3]);
    assert(!g.clear_mask[2][0] && !g.clear_mask[2][4]);
    printf("  ✓ Horizontal 3-gem match detection & clear mask OK\n");

    // [TEST 4] 4 连生成激光核与 5 连生成彩虹星核
    printf("[TEST 4] Testing 4-Match Laser & 5-Match Rainbow Core Generation...\n");
    memset(g.board, 0, sizeof(g.board));
    // 构造横向 4 连
    g.board[1][0] = match3_make_gem(GEM_BLUE, SPECIAL_NONE);
    g.board[1][1] = match3_make_gem(GEM_BLUE, SPECIAL_NONE);
    g.board[1][2] = match3_make_gem(GEM_BLUE, SPECIAL_NONE);
    g.board[1][3] = match3_make_gem(GEM_BLUE, SPECIAL_NONE);

    found = match3_find_matches(&g, &mr);
    assert(found == true);
    assert(mr.has_laser == true);
    assert(match3_get_special(g.board[1][1]) == SPECIAL_ROW_LASER);

    // 构造纵向 5 连
    memset(g.board, 0, sizeof(g.board));
    for (int r = 1; r <= 5; r++) {
        g.board[r][2] = match3_make_gem(GEM_YELLOW, SPECIAL_NONE);
    }
    found = match3_find_matches(&g, &mr);
    assert(found == true);
    assert(mr.has_rainbow == true);
    assert(match3_get_special(g.board[3][2]) == SPECIAL_RAINBOW);
    printf("  ✓ Special 4-gem Row Laser & 5-gem Rainbow Core generated OK\n");

    // [TEST 5] 重力下落与填充
    printf("[TEST 5] Testing Gravity Fall & Top Refill...\n");
    memset(g.board, 0, sizeof(g.board));
    // 底部留空，上方放宝石
    g.board[0][0] = match3_make_gem(GEM_PURPLE, SPECIAL_NONE);
    g.board[1][0] = match3_make_gem(GEM_GREEN, SPECIAL_NONE);
    g.board[2][0] = GEM_NONE;
    g.board[3][0] = GEM_NONE;
    g.board[4][0] = GEM_NONE;
    g.board[5][0] = GEM_NONE;
    g.board[6][0] = GEM_NONE;

    bool moved = match3_apply_gravity(&g);
    assert(moved == true);
    // 最底两格必须是原本的 PURPLE 和 GREEN
    assert(match3_get_color(g.board[6][0]) == GEM_GREEN);
    assert(match3_get_color(g.board[5][0]) == GEM_PURPLE);
    // 顶部必须填充好新的非空方块
    for (int r = 0; r < MATCH3_ROWS; r++) {
        assert(g.board[r][0] != GEM_NONE);
    }
    printf("  ✓ Column stack compression & top randomized refill OK\n");

    // [TEST 6] 状态机动画与有效/无效交换
    printf("[TEST 6] Testing State Machine & Swap Cascade Step...\n");
    match3_init(&g, 999, 25, 10000);
    g.board[3][1] = match3_make_gem(GEM_RED, SPECIAL_NONE);
    g.board[3][2] = match3_make_gem(GEM_RED, SPECIAL_NONE);
    g.board[3][3] = match3_make_gem(GEM_BLUE, SPECIAL_NONE); // 与下一行 (4,3) RED 交换将形成3连
    g.board[4][3] = match3_make_gem(GEM_RED, SPECIAL_NONE);

    g.state = STATE_SELECT_DIR;
    g.selected_r = 3; g.selected_c = 3;
    g.target_r = 4;   g.target_c = 3;

    // 触发交换
    match3_input_ok(&g);
    assert(g.state == STATE_ANIM_SWAP);

    // 步进 130ms 完成交换
    match3_step(&g, 130);
    // 交换后应当形成红宝石3连，进入 CLEAR 状态
    assert(g.state == STATE_ANIM_CLEAR);
    assert(g.moves_left == 24);
    assert(g.score > 0);

    // 步进 150ms 完成闪烁消除，进入 DROP 状态
    match3_step(&g, 150);
    assert(g.state == STATE_ANIM_DROP);

    // 步进 140ms 完成重力掉落，返回 SELECT_SRC 状态或连续级联
    match3_step(&g, 140);
    assert(g.state == STATE_SELECT_SRC || g.state == STATE_ANIM_CLEAR);
    printf("  ✓ Swap -> Match -> Clear -> Drop -> Cascade pipeline OK\n");

    // [TEST 7] 死局检测与洗牌
    printf("[TEST 7] Testing Deadlock Detection & Auto Shuffle...\n");
    // 棋盘全填不同交替颜色，使其绝无任何有效移动
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            g.board[r][c] = match3_make_gem((match3_gem_type_t)(((r * 2 + c) % MATCH3_GEM_TYPES) + 1), SPECIAL_NONE);
        }
    }
    // 调用洗牌，断言能成功恢复为有解盘面
    match3_shuffle(&g);
    assert(match3_has_valid_moves(&g));
    match3_match_result_t check_mr;
    assert(!match3_find_matches(&g, &check_mr));
    printf("  ✓ Deadlock detection & board auto-reshuffle verified OK\n");

    printf("=======================================================\n");
    printf("   ✓ [PASS] All 7 Cyber Match-3 Unit Tests Passed!     \n");
    printf("=======================================================\n");

    return 0;
}
