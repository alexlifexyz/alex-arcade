// tests/test_pacman_logic.c —— 《吃豆人极速版 (PAC-MAN Neo-Neon)》主机端纯 C11 单元测试套件
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "pacman_logic.h"

static void test_initialization(void) {
    printf("[TEST 1] Testing PAC-MAN Neo-Neon Initialization...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    assert(g.stage == 1);
    assert(g.score == 0);
    assert(g.lives == 3);
    assert(g.game_over == false);
    assert(g.victory == false);
    assert(g.remaining_dots > 100); // 迷宫内有上百颗豆子
    assert(g.frighten_timer == 0);

    // 检查吃豆人初始位置与方向
    assert(g.pacman.dir == PAC_DIR_LEFT);
    assert(g.pacman.speed == 2);
    assert(g.pacman.boost_energy == PAC_BOOST_MAX);

    // 检查 4 只幽灵初始化
    assert(g.ghosts[0].id == GHOST_COLOR_RED);
    assert(g.ghosts[0].mode == GHOST_MODE_CHASE); // 红幽灵开局即在房外
    assert(g.ghosts[1].id == GHOST_COLOR_PINK);
    assert(g.ghosts[1].mode == GHOST_MODE_HOUSE); // 其他幽灵在房内
    assert(g.ghosts[2].id == GHOST_COLOR_CYAN);
    assert(g.ghosts[3].id == GHOST_COLOR_ORANGE);

    printf("  ✓ Maze loaded with %d dots, Pacman and 4 ghosts properly positioned\n", g.remaining_dots);
}

static void test_movement_and_turn(void) {
    printf("[TEST 2] Testing Steering Controls & 180 Emergency Turn...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    // 初始朝向为 LEFT
    assert(g.pacman.dir == PAC_DIR_LEFT);
    assert(g.pacman.desired_dir == PAC_DIR_LEFT);

    // 顺时针旋转 (LEFT -> UP -> RIGHT -> DOWN -> LEFT)
    pac_input_turn_cw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_UP);
    pac_input_turn_cw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_RIGHT);
    pac_input_turn_cw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_DOWN);
    pac_input_turn_cw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_LEFT);

    // 逆时针旋转 (LEFT -> DOWN -> RIGHT -> UP -> LEFT)
    pac_input_turn_ccw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_DOWN);
    pac_input_turn_ccw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_RIGHT);
    pac_input_turn_ccw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_UP);
    pac_input_turn_ccw(&g);
    assert(g.pacman.desired_dir == PAC_DIR_LEFT);

    // 180度紧急掉头 (瞬时生效)
    g.pacman.dir = PAC_DIR_LEFT;
    pac_input_turn_180(&g);
    assert(g.pacman.dir == PAC_DIR_RIGHT);
    assert(g.pacman.desired_dir == PAC_DIR_RIGHT);

    pac_input_turn_180(&g);
    assert(g.pacman.dir == PAC_DIR_LEFT);

    printf("  ✓ Clockwise, counter-clockwise and instant 180-degree turn verified OK\n");
}

static void test_dot_eating_and_energizer(void) {
    printf("[TEST 3] Testing Dot Consumption & Power Pellet Energizer Mode...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    int initial_dots = g.remaining_dots;

    // 将吃豆人放到一个放置小豆子的格子上 (例如 Row 16, Col 13)
    g.pacman.x = 13 * PAC_TILE_SIZE;
    g.pacman.y = 16 * PAC_TILE_SIZE;
    g.pacman.dir = PAC_DIR_RIGHT;
    g.pacman.desired_dir = PAC_DIR_RIGHT;
    g.map[16][13] = PAC_TILE_DOT;

    pac_tick(&g);

    // 应该吃掉小豆子，得分 +10
    assert(g.score == 10);
    assert(g.remaining_dots == initial_dots - 1);
    assert(g.map[16][13] == PAC_TILE_EMPTY);
    assert(g.last_sound == PAC_EVT_WAKA);

    // 将吃豆人移动到大力丸格子上 (Row 1, Col 1)
    g.pacman.x = 1 * PAC_TILE_SIZE;
    g.pacman.y = 1 * PAC_TILE_SIZE;
    g.map[1][1] = PAC_TILE_ENERGIZER;

    pac_tick(&g);

    // 得分 +50，剩余豆子减 1，触发惊恐模式
    assert(g.score == 60);
    assert(g.map[1][1] == PAC_TILE_EMPTY);
    assert(g.frighten_timer == PAC_FRIGHTEN_TIME);
    assert(g.ghosts_eaten_combo == 200);
    assert(g.last_sound == PAC_EVT_ENERGIZER);

    // 红幽灵应变为 FRIGHTENED 惊恐蓝化状态
    assert(g.ghosts[0].mode == GHOST_MODE_FRIGHTENED);

    printf("  ✓ Dot eating (+10), Energizer (+50) & Ghost blue fright mode verified OK\n");
}

static void test_frightened_ghost_eating_combo(void) {
    printf("[TEST 4] Testing Ghost Annihilation & Combo Score Multiplier...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    // 开启惊恐模式
    g.frighten_timer = 200;
    g.ghosts_eaten_combo = 200;
    g.ghosts[0].mode = GHOST_MODE_FRIGHTENED;
    g.ghosts[0].x = 50;
    g.ghosts[0].y = 50;

    g.pacman.x = 50;
    g.pacman.y = 50;
    g.map[5][5] = PAC_TILE_EMPTY; // 确保不吃豆子干扰得分
    g.score = 0;

    // 运行一帧，吃豆人咬碎红幽灵
    pac_tick(&g);

    assert(g.ghosts[0].mode == GHOST_MODE_EATEN); // 变为眼睛模式
    assert(g.score == 200);                       // 首杀 +200
    assert(g.ghosts_eaten_combo == 400);          // 下一次翻倍为 400
    assert(g.last_sound == PAC_EVT_EAT_GHOST);

    // 紧接着吃第二只蓝化幽灵
    g.ghosts[1].mode = GHOST_MODE_FRIGHTENED;
    g.ghosts[1].x = g.pacman.x;
    g.ghosts[1].y = g.pacman.y;
    int c = (g.pacman.x + 4) / PAC_TILE_SIZE;
    int r = (g.pacman.y + 4) / PAC_TILE_SIZE;
    g.map[r][c] = PAC_TILE_EMPTY;

    pac_tick(&g);
    assert(g.ghosts[1].mode == GHOST_MODE_EATEN);
    assert(g.score == 600);                       // 200 + 400 = 600
    assert(g.ghosts_eaten_combo == 800);          // 下一次翻倍为 800

    printf("  ✓ Ghost eaten combo: 200 -> 400 -> 800 score multiplier OK\n");
}

static void test_boost_sprint_mechanic(void) {
    printf("[TEST 5] Testing Nitro Boost Sprint Dynamics & Energy Drain...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    assert(g.pacman.boosting == false);
    assert(g.pacman.speed == 2);
    assert(g.pacman.boost_energy == PAC_BOOST_MAX);

    // 触发冲刺
    pac_input_trigger_boost(&g);
    assert(g.pacman.boosting == true);

    // 推进数帧，验证速度提升至 4px，能量持续消耗
    pac_tick(&g);
    assert(g.pacman.speed == 4);
    assert(g.pacman.boost_energy < PAC_BOOST_MAX);

    // 消耗完能量自动解除冲刺
    g.pacman.boost_energy = 2;
    pac_tick(&g);
    assert(g.pacman.boosting == false);
    assert(g.pacman.speed == 2);

    printf("  ✓ Nitro Boost double-speed (4px/frame) and energy cycle verified OK\n");
}

static void test_fruit_and_victory(void) {
    printf("[TEST 6] Testing Tactical Fruit Drop & Level Clear Victory...\n");
    pac_game_t g;
    pac_init_game(&g, 1);

    // 模拟水果刷新并被吃掉
    g.fruit_active = true;
    g.fruit_x = 80;
    g.fruit_y = 80;
    g.pacman.x = 80;
    g.pacman.y = 80;
    int prev_score = g.score;

    pac_tick(&g);
    assert(g.fruit_active == false);
    assert(g.score == prev_score + 200);
    assert(g.last_sound == PAC_EVT_EAT_FRUIT);

    // 模拟吃完全部豆子
    g.remaining_dots = 1;
    g.map[1][2] = PAC_TILE_DOT;
    g.pacman.x = 2 * PAC_TILE_SIZE;
    g.pacman.y = 1 * PAC_TILE_SIZE;

    pac_tick(&g);
    assert(g.remaining_dots == 0);
    assert(g.victory == true);
    assert(g.last_sound == PAC_EVT_CLEAR);

    printf("  ✓ Fruit pickup (+200) and full-map dots clear victory verified OK\n");
}

int main(void) {
    printf("=======================================================\n");
    printf("     PAC-MAN Neo-Neon (吃豆人极速版) Unit Test Suite    \n");
    printf("=======================================================\n");

    test_initialization();
    test_movement_and_turn();
    test_dot_eating_and_energizer();
    test_frightened_ghost_eating_combo();
    test_boost_sprint_mechanic();
    test_fruit_and_victory();

    printf("=======================================================\n");
    printf("   ✓ [PASS] All 6 PAC-MAN Neo-Neon Unit Tests Passed!  \n");
    printf("=======================================================\n");
    return 0;
}
