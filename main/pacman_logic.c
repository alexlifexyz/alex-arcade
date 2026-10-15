// main/pacman_logic.c —— 《吃豆人极速版 (PAC-MAN Neo-Neon)》核心物理、迷宫与幽灵 AI 状态机实现
#include "pacman_logic.h"
#include <string.h>
#include <stdlib.h>
#include <math.h>

// 经典 24 列 x 23 行垂直对称吃豆人迷宫模板
// 0: 空地, 1: 墙体, 2: 豆子, 3: 大力丸, 4: 幽灵房门
static const uint8_t MAZE_TEMPLATE[PAC_MAP_ROWS][PAC_MAP_COLS] = {
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    {  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 }, // 0
    {  1, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1 }, // 1 (角放大力丸)
    {  1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1 }, // 2
    {  1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1 }, // 3
    {  1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1 }, // 4
    {  1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1 }, // 5
    {  1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1 }, // 6
    {  1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1 }, // 7
    {  0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0 }, // 8
    {  1, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 4, 4, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 1 }, // 9 (幽灵房顶)
    {  0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0 }, // 10 (左右穿屏通道)
    {  1, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 1 }, // 11
    {  0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0 }, // 12
    {  1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1 }, // 13
    {  1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1 }, // 14
    {  1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 1 }, // 15
    {  1, 3, 2, 2, 1, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 1, 2, 2, 3, 1 }, // 16 (吃豆人出生点 11, 16)
    {  1, 1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1, 1 }, // 17
    {  1, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1 }, // 18
    {  1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1 }, // 19
    {  1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1 }, // 20
    {  1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1 }, // 21
    {  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 }  // 22
};

static inline int dist_sq(int x1, int y1, int x2, int y2) {
    int dx = x1 - x2;
    int dy = y1 - y2;
    return dx * dx + dy * dy;
}

bool pac_is_wall(const pac_game_t *game, int col, int row, bool is_ghost) {
    if (col < 0 || col >= PAC_MAP_COLS) {
        // 左右穿屏通道 (Row 10) 允许自由穿行
        if (row == 10) return false;
        return true;
    }
    if (row < 0 || row >= PAC_MAP_ROWS) return true;

    uint8_t t = game->map[row][col];
    if (t == PAC_TILE_WALL) return true;
    if (t == PAC_TILE_GATE) {
        // 只有幽灵在回巢或出门时可以通过房门，吃豆人不可入内
        return !is_ghost;
    }
    return false;
}

uint8_t pac_get_tile(const pac_game_t *game, int col, int row) {
    if (col < 0 || col >= PAC_MAP_COLS || row < 0 || row >= PAC_MAP_ROWS) {
        return PAC_TILE_WALL;
    }
    return game->map[row][col];
}

void pac_reset_positions(pac_game_t *game) {
    // 吃豆人出生在 Row 16, Col 11.5
    game->pacman.x = 11 * PAC_TILE_SIZE + 5;
    game->pacman.y = 16 * PAC_TILE_SIZE;
    game->pacman.dir = PAC_DIR_LEFT;
    game->pacman.desired_dir = PAC_DIR_LEFT;
    game->pacman.speed = 2;
    game->pacman.boosting = false;
    game->pacman.boost_energy = PAC_BOOST_MAX;
    game->pacman.anim_frame = 0;

    // 幽灵初始化
    // 0: Blinky (红) - 立即在巢穴外 (Row 8, Col 11) 追杀
    game->ghosts[0].id = GHOST_COLOR_RED;
    game->ghosts[0].x = 11 * PAC_TILE_SIZE + 5;
    game->ghosts[0].y = 8 * PAC_TILE_SIZE;
    game->ghosts[0].dir = PAC_DIR_LEFT;
    game->ghosts[0].mode = GHOST_MODE_CHASE;
    game->ghosts[0].speed = 2;
    game->ghosts[0].house_timer = 0;
    game->ghosts[0].anim_frame = 0;

    // 1: Pinky (粉) - 巢穴内等待 2 秒出门
    game->ghosts[1].id = GHOST_COLOR_PINK;
    game->ghosts[1].x = 10 * PAC_TILE_SIZE;
    game->ghosts[1].y = 10 * PAC_TILE_SIZE;
    game->ghosts[1].dir = PAC_DIR_UP;
    game->ghosts[1].mode = GHOST_MODE_HOUSE;
    game->ghosts[1].speed = 2;
    game->ghosts[1].house_timer = 60; // 1.5 秒后出门
    game->ghosts[1].anim_frame = 0;

    // 2: Inky (青) - 巢穴内等待 4 秒出门
    game->ghosts[2].id = GHOST_COLOR_CYAN;
    game->ghosts[2].x = 12 * PAC_TILE_SIZE;
    game->ghosts[2].y = 10 * PAC_TILE_SIZE;
    game->ghosts[2].dir = PAC_DIR_UP;
    game->ghosts[2].mode = GHOST_MODE_HOUSE;
    game->ghosts[2].speed = 2;
    game->ghosts[2].house_timer = 140; // 3.5 秒后出门
    game->ghosts[2].anim_frame = 0;

    // 3: Clyde (橙) - 巢穴内等待 6 秒出门
    game->ghosts[3].id = GHOST_COLOR_ORANGE;
    game->ghosts[3].x = 11 * PAC_TILE_SIZE;
    game->ghosts[3].y = 10 * PAC_TILE_SIZE;
    game->ghosts[3].dir = PAC_DIR_UP;
    game->ghosts[3].mode = GHOST_MODE_HOUSE;
    game->ghosts[3].speed = 2;
    game->ghosts[3].house_timer = 220; // 5.5 秒后出门
    game->ghosts[3].anim_frame = 0;

    game->frighten_timer = 0;
    game->ghosts_eaten_combo = 200;
}

void pac_init_game(pac_game_t *game, int stage) {
    if (!game) return;
    memset(game, 0, sizeof(pac_game_t));

    game->stage = stage > 0 ? stage : 1;
    game->score = 0;
    game->lives = 3;
    game->game_over = false;
    game->victory = false;
    game->paused = false;
    game->ticks = 0;
    game->last_sound = PAC_EVT_START;
    game->fruit_timer = 400; // 约 10 秒后刷新第一颗水果
    game->fruit_active = false;
    game->fruit_x = 11 * PAC_TILE_SIZE + 5;
    game->fruit_y = 12 * PAC_TILE_SIZE;

    // 复制迷宫瓦片并统计豆子
    game->remaining_dots = 0;
    for (int r = 0; r < PAC_MAP_ROWS; r++) {
        for (int c = 0; c < PAC_MAP_COLS; c++) {
            uint8_t t = MAZE_TEMPLATE[r][c];
            game->map[r][c] = t;
            if (t == PAC_TILE_DOT || t == PAC_TILE_ENERGIZER) {
                game->remaining_dots++;
            }
        }
    }

    pac_reset_positions(game);
}

// 顺时针转向 90 度 (上 -> 右 -> 下 -> 左 -> 上)
void pac_input_turn_cw(pac_game_t *game) {
    if (!game || game->game_over || game->paused) return;
    pac_dir_t current = game->pacman.desired_dir;
    pac_dir_t next;
    switch (current) {
        case PAC_DIR_UP:    next = PAC_DIR_RIGHT; break;
        case PAC_DIR_RIGHT: next = PAC_DIR_DOWN;  break;
        case PAC_DIR_DOWN:  next = PAC_DIR_LEFT;  break;
        case PAC_DIR_LEFT:  next = PAC_DIR_UP;    break;
        default:            next = PAC_DIR_RIGHT; break;
    }
    game->pacman.desired_dir = next;
}

// 逆时针转向 90 度 (上 -> 左 -> 下 -> 右 -> 上)
void pac_input_turn_ccw(pac_game_t *game) {
    if (!game || game->game_over || game->paused) return;
    pac_dir_t current = game->pacman.desired_dir;
    pac_dir_t next;
    switch (current) {
        case PAC_DIR_UP:    next = PAC_DIR_LEFT;  break;
        case PAC_DIR_LEFT:  next = PAC_DIR_DOWN;  break;
        case PAC_DIR_DOWN:  next = PAC_DIR_RIGHT; break;
        case PAC_DIR_RIGHT: next = PAC_DIR_UP;    break;
        default:            next = PAC_DIR_LEFT;  break;
    }
    game->pacman.desired_dir = next;
}

// 紧急调头 180 度 (逆向倒退)
void pac_input_turn_180(pac_game_t *game) {
    if (!game || game->game_over || game->paused) return;
    pac_dir_t opp = PAC_DIR_NONE;
    switch (game->pacman.dir) {
        case PAC_DIR_UP:    opp = PAC_DIR_DOWN;  break;
        case PAC_DIR_DOWN:  opp = PAC_DIR_UP;    break;
        case PAC_DIR_LEFT:  opp = PAC_DIR_RIGHT; break;
        case PAC_DIR_RIGHT: opp = PAC_DIR_LEFT;  break;
        default: break;
    }
    if (opp != PAC_DIR_NONE) {
        game->pacman.dir = opp;
        game->pacman.desired_dir = opp;
    }
}

// 触发氮气冲刺 (加速到 4px/帧)
void pac_input_trigger_boost(pac_game_t *game) {
    if (!game || game->game_over || game->paused) return;
    if (game->pacman.boost_energy >= 30) {
        game->pacman.boosting = true;
    }
}

// 检查某个实体以指定方向能否移动一步 (碰撞判定)
static bool can_move_in_dir(const pac_game_t *game, int x, int y, pac_dir_t dir, bool is_ghost) {
    int col = x / PAC_TILE_SIZE;
    int row = y / PAC_TILE_SIZE;
    int rem_x = x % PAC_TILE_SIZE;
    int rem_y = y % PAC_TILE_SIZE;

    // 左右穿屏隧道
    if (row == 10 && (col <= 0 || col >= PAC_MAP_COLS - 1)) {
        if (dir == PAC_DIR_LEFT || dir == PAC_DIR_RIGHT) return true;
    }

    if (dir == PAC_DIR_UP) {
        if (rem_x != 0 && rem_x != PAC_TILE_SIZE - 1) {
            // 水平未对齐时无法向上拐入
            if (rem_x > 2 && rem_x < PAC_TILE_SIZE - 2) return false;
        }
        return !pac_is_wall(game, col, row - 1, is_ghost);
    } else if (dir == PAC_DIR_DOWN) {
        if (rem_x != 0 && rem_x != PAC_TILE_SIZE - 1) {
            if (rem_x > 2 && rem_x < PAC_TILE_SIZE - 2) return false;
        }
        return !pac_is_wall(game, col, row + 1, is_ghost);
    } else if (dir == PAC_DIR_LEFT) {
        if (rem_y != 0 && rem_y != PAC_TILE_SIZE - 1) {
            if (rem_y > 2 && rem_y < PAC_TILE_SIZE - 2) return false;
        }
        return !pac_is_wall(game, col - 1, row, is_ghost);
    } else if (dir == PAC_DIR_RIGHT) {
        if (rem_y != 0 && rem_y != PAC_TILE_SIZE - 1) {
            if (rem_y > 2 && rem_y < PAC_TILE_SIZE - 2) return false;
        }
        return !pac_is_wall(game, col + 1, row, is_ghost);
    }
    return false;
}

// 吃豆人物理推进与吃豆判定
static void update_pacman(pac_game_t *game) {
    pac_player_t *p = &game->pacman;

    // 氮气衰减与恢复
    if (p->boosting) {
        p->speed = 4; // 冲刺双倍速
        p->boost_energy -= 2;
        if (p->boost_energy <= 0) {
            p->boost_energy = 0;
            p->boosting = false;
            p->speed = 2;
        }
    } else {
        p->speed = 2; // 常规移速
        if (p->boost_energy < PAC_BOOST_MAX && (game->ticks % 4 == 0)) {
            p->boost_energy++;
        }
    }

    // 预输入拐弯尝试：若期望方向畅通，且在对齐容差范围内，平滑切入新方向
    if (p->desired_dir != p->dir) {
        int rem_x = p->x % PAC_TILE_SIZE;
        int rem_y = p->y % PAC_TILE_SIZE;

        if (p->desired_dir == PAC_DIR_UP || p->desired_dir == PAC_DIR_DOWN) {
            // 水平吸附拐入
            if (rem_x <= 3 || rem_x >= PAC_TILE_SIZE - 3) {
                int target_col = (rem_x <= 3) ? (p->x / PAC_TILE_SIZE) : (p->x / PAC_TILE_SIZE + 1);
                int target_x = target_col * PAC_TILE_SIZE;
                if (can_move_in_dir(game, target_x, p->y, p->desired_dir, false)) {
                    p->x = target_x;
                    p->dir = p->desired_dir;
                }
            }
        } else {
            // 垂直吸附拐入
            if (rem_y <= 3 || rem_y >= PAC_TILE_SIZE - 3) {
                int target_row = (rem_y <= 3) ? (p->y / PAC_TILE_SIZE) : (p->y / PAC_TILE_SIZE + 1);
                int target_y = target_row * PAC_TILE_SIZE;
                if (can_move_in_dir(game, p->x, target_y, p->desired_dir, false)) {
                    p->y = target_y;
                    p->dir = p->desired_dir;
                }
            }
        }
    }

    // 沿当前方向移动一步
    for (int step = 0; step < p->speed; step++) {
        int nx = p->x;
        int ny = p->y;

        if (p->dir == PAC_DIR_UP)    ny -= 1;
        else if (p->dir == PAC_DIR_DOWN)  ny += 1;
        else if (p->dir == PAC_DIR_LEFT)  nx -= 1;
        else if (p->dir == PAC_DIR_RIGHT) nx += 1;

        // 穿屏通道
        if (ny / PAC_TILE_SIZE == 10) {
            if (nx < -PAC_TILE_SIZE) {
                nx = (PAC_MAP_COLS - 1) * PAC_TILE_SIZE;
            } else if (nx > PAC_MAP_COLS * PAC_TILE_SIZE) {
                nx = 0;
            }
        }

        // 碰撞检测：取吃豆人中心点加方向偏移
        int check_col = (nx + 4) / PAC_TILE_SIZE;
        int check_row = (ny + 4) / PAC_TILE_SIZE;

        if (!pac_is_wall(game, check_col, check_row, false)) {
            p->x = nx;
            p->y = ny;
            p->anim_frame = (game->ticks / 2) % 3;
        } else {
            // 撞墙停下
            break;
        }
    }

    // 吃豆与能量丸触发
    int center_col = (p->x + 4) / PAC_TILE_SIZE;
    int center_row = (p->y + 4) / PAC_TILE_SIZE;

    if (center_col >= 0 && center_col < PAC_MAP_COLS && center_row >= 0 && center_row < PAC_MAP_ROWS) {
        uint8_t current_tile = game->map[center_row][center_col];
        if (current_tile == PAC_TILE_DOT) {
            game->map[center_row][center_col] = PAC_TILE_EMPTY;
            game->score += 10;
            game->remaining_dots--;
            game->last_sound = PAC_EVT_WAKA;
        } else if (current_tile == PAC_TILE_ENERGIZER) {
            game->map[center_row][center_col] = PAC_TILE_EMPTY;
            game->score += 50;
            game->remaining_dots--;
            game->frighten_timer = PAC_FRIGHTEN_TIME;
            game->ghosts_eaten_combo = 200; // 重置幽灵连吃奖励
            game->last_sound = PAC_EVT_ENERGIZER;

            // 所有活跃幽灵变蓝并调头
            for (int i = 0; i < PAC_MAX_GHOSTS; i++) {
                if (game->ghosts[i].mode == GHOST_MODE_CHASE) {
                    game->ghosts[i].mode = GHOST_MODE_FRIGHTENED;
                    // 反向逃跑
                    if (game->ghosts[i].dir == PAC_DIR_UP) game->ghosts[i].dir = PAC_DIR_DOWN;
                    else if (game->ghosts[i].dir == PAC_DIR_DOWN) game->ghosts[i].dir = PAC_DIR_UP;
                    else if (game->ghosts[i].dir == PAC_DIR_LEFT) game->ghosts[i].dir = PAC_DIR_RIGHT;
                    else if (game->ghosts[i].dir == PAC_DIR_RIGHT) game->ghosts[i].dir = PAC_DIR_LEFT;
                }
            }
        }
    }

    // 检查通关
    if (game->remaining_dots <= 0) {
        game->victory = true;
        game->last_sound = PAC_EVT_CLEAR;
    }
}

// 幽灵在十字路口决策下一步方向
static pac_dir_t ghost_decide_next_dir(const pac_game_t *game, const pac_ghost_t *g) {
    // 目标坐标计算
    int target_x = 0;
    int target_y = 0;

    if (g->mode == GHOST_MODE_EATEN) {
        // 只剩眼睛：极速直奔幽灵巢穴 (Row 9, Col 11)
        target_x = 11 * PAC_TILE_SIZE;
        target_y = 9 * PAC_TILE_SIZE;
    } else if (g->mode == GHOST_MODE_FRIGHTENED) {
        // 惊恐状态：随机选路或远离吃豆人
        target_x = (rand() % PAC_MAP_COLS) * PAC_TILE_SIZE;
        target_y = (rand() % PAC_MAP_ROWS) * PAC_TILE_SIZE;
    } else {
        // 常规追击模式 (各幽灵经典 AI)
        if (g->id == GHOST_COLOR_RED) {
            // Blinky：直追吃豆人当前坐标
            target_x = game->pacman.x;
            target_y = game->pacman.y;
        } else if (g->id == GHOST_COLOR_PINK) {
            // Pinky：瞄准吃豆人前方 4 格预判点
            target_x = game->pacman.x;
            target_y = game->pacman.y;
            if (game->pacman.dir == PAC_DIR_UP) target_y -= 4 * PAC_TILE_SIZE;
            else if (game->pacman.dir == PAC_DIR_DOWN) target_y += 4 * PAC_TILE_SIZE;
            else if (game->pacman.dir == PAC_DIR_LEFT) target_x -= 4 * PAC_TILE_SIZE;
            else if (game->pacman.dir == PAC_DIR_RIGHT) target_x += 4 * PAC_TILE_SIZE;
        } else if (g->id == GHOST_COLOR_CYAN) {
            // Inky：巡航与夹击
            target_x = game->pacman.x;
            target_y = game->pacman.y;
        } else {
            // Clyde：远追近躲 (距离大于 6 格时追，小于 6 格时退回左下角巡逻)
            int d = dist_sq(g->x, g->y, game->pacman.x, game->pacman.y);
            if (d > (6 * PAC_TILE_SIZE) * (6 * PAC_TILE_SIZE)) {
                target_x = game->pacman.x;
                target_y = game->pacman.y;
            } else {
                target_x = 1 * PAC_TILE_SIZE;
                target_y = 21 * PAC_TILE_SIZE;
            }
        }
    }

    // 在 4 个方向中寻找欧几里得距离最近且非反向的方向 (不可 180 度走回头路)
    static const pac_dir_t dirs[4] = { PAC_DIR_UP, PAC_DIR_LEFT, PAC_DIR_DOWN, PAC_DIR_RIGHT };
    pac_dir_t opp = PAC_DIR_NONE;
    if (g->dir == PAC_DIR_UP) opp = PAC_DIR_DOWN;
    else if (g->dir == PAC_DIR_DOWN) opp = PAC_DIR_UP;
    else if (g->dir == PAC_DIR_LEFT) opp = PAC_DIR_RIGHT;
    else if (g->dir == PAC_DIR_RIGHT) opp = PAC_DIR_LEFT;

    pac_dir_t best_dir = PAC_DIR_NONE;
    int min_d = 99999999;

    for (int i = 0; i < 4; i++) {
        pac_dir_t d = dirs[i];
        if (d == opp) continue; // 不可掉头回头

        if (can_move_in_dir(game, g->x, g->y, d, true)) {
            int nx = g->x;
            int ny = g->y;
            if (d == PAC_DIR_UP) ny -= PAC_TILE_SIZE;
            else if (d == PAC_DIR_DOWN) ny += PAC_TILE_SIZE;
            else if (d == PAC_DIR_LEFT) nx -= PAC_TILE_SIZE;
            else nx += PAC_TILE_SIZE;

            int dist = dist_sq(nx, ny, target_x, target_y);
            if (dist < min_d) {
                min_d = dist;
                best_dir = d;
            }
        }
    }

    return (best_dir != PAC_DIR_NONE) ? best_dir : (opp != PAC_DIR_NONE ? opp : PAC_DIR_UP);
}

// 幽灵 AI 移动与状态机推进
static void update_ghosts(pac_game_t *game) {
    for (int i = 0; i < PAC_MAX_GHOSTS; i++) {
        pac_ghost_t *g = &game->ghosts[i];

        // 1. 巢穴等待与出门
        if (g->mode == GHOST_MODE_HOUSE) {
            if (g->house_timer > 0) {
                g->house_timer--;
                // 在房内上下微跳
                if ((game->ticks / 8) % 2 == 0) g->y = 10 * PAC_TILE_SIZE - 2;
                else g->y = 10 * PAC_TILE_SIZE + 2;
                continue;
            } else {
                // 走出房门
                g->x = 11 * PAC_TILE_SIZE + 5;
                g->y = 8 * PAC_TILE_SIZE;
                g->mode = GHOST_MODE_CHASE;
                g->dir = PAC_DIR_LEFT;
            }
        }

        // 2. 速度设定
        if (g->mode == GHOST_MODE_EATEN) {
            g->speed = 4; // 眼睛极速回巢
            // 检查是否已到达巢穴
            if (abs(g->x - 11 * PAC_TILE_SIZE) <= 4 && abs(g->y - 9 * PAC_TILE_SIZE) <= 4) {
                g->mode = GHOST_MODE_CHASE;
                g->speed = 2;
            }
        } else if (g->mode == GHOST_MODE_FRIGHTENED) {
            // 惊恐变蓝减速 (隔一帧走一步，约 1px/帧)
            g->speed = (game->ticks % 2 == 0) ? 2 : 0;
        } else {
            g->speed = 2; // 常规巡航速度
        }

        // 3. 移动更新
        if (g->speed > 0) {
            int rem_x = g->x % PAC_TILE_SIZE;
            int rem_y = g->y % PAC_TILE_SIZE;

            if (rem_x == 0 && rem_y == 0) {
                g->dir = ghost_decide_next_dir(game, g);
            }

            int nx = g->x;
            int ny = g->y;
            if (g->dir == PAC_DIR_UP) ny -= g->speed;
            else if (g->dir == PAC_DIR_DOWN) ny += g->speed;
            else if (g->dir == PAC_DIR_LEFT) nx -= g->speed;
            else if (g->dir == PAC_DIR_RIGHT) nx += g->speed;

            // 穿屏通道
            if (ny / PAC_TILE_SIZE == 10) {
                if (nx < -PAC_TILE_SIZE) nx = (PAC_MAP_COLS - 1) * PAC_TILE_SIZE;
                else if (nx > PAC_MAP_COLS * PAC_TILE_SIZE) nx = 0;
            }

            g->x = nx;
            g->y = ny;
            g->anim_frame = (game->ticks / 4) % 2;
        }

        // 5. 与吃豆人相撞判定 (AABB 盒约 8x8)
        int p_cx = game->pacman.x + 5;
        int p_cy = game->pacman.y + 5;
        int g_cx = g->x + 5;
        int g_cy = g->y + 5;

        if (abs(p_cx - g_cx) <= 6 && abs(p_cy - g_cy) <= 6) {
            if (g->mode == GHOST_MODE_FRIGHTENED) {
                // 蓝化幽灵被吃豆人一口咬碎！
                g->mode = GHOST_MODE_EATEN;
                game->score += game->ghosts_eaten_combo;
                game->ghosts_eaten_combo *= 2; // 连击得分翻倍: 200 -> 400 -> 800 -> 1600!
                game->last_sound = PAC_EVT_EAT_GHOST;
            } else if (g->mode == GHOST_MODE_CHASE) {
                // 玩家丧命
                game->lives--;
                game->last_sound = PAC_EVT_DEATH;
                if (game->lives <= 0) {
                    game->game_over = true;
                } else {
                    pac_reset_positions(game);
                }
                break;
            }
        }
    }
}

// 主时钟滴答循环 (40 FPS)
void pac_tick(pac_game_t *game) {
    if (!game || game->game_over || game->victory || game->paused) return;

    game->ticks++;
    game->last_sound = PAC_EVT_NONE;

    // 1. 惊恐倒计时推进
    if (game->frighten_timer > 0) {
        game->frighten_timer--;
        if (game->frighten_timer == 0) {
            // 恢复常规追击
            for (int i = 0; i < PAC_MAX_GHOSTS; i++) {
                if (game->ghosts[i].mode == GHOST_MODE_FRIGHTENED) {
                    game->ghosts[i].mode = GHOST_MODE_CHASE;
                }
            }
        }
    }

    // 2. 水果刷新与吃取
    if (game->fruit_timer > 0) {
        game->fruit_timer--;
        if (game->fruit_timer == 0) {
            game->fruit_active = true;
        }
    }
    if (game->fruit_active) {
        // 吃水果判定
        int p_cx = game->pacman.x + 5;
        int p_cy = game->pacman.y + 5;
        if (abs(p_cx - game->fruit_x) <= 8 && abs(p_cy - game->fruit_y) <= 8) {
            game->fruit_active = false;
            game->score += 200;
            game->last_sound = PAC_EVT_EAT_FRUIT;
            game->fruit_timer = 800; // 20 秒后刷新下一颗
        }
    }

    // 3. 吃豆人与幽灵状态更新
    update_pacman(game);
    update_ghosts(game);

    // 4. 最高分同步
    if (game->score > game->high_score) {
        game->high_score = game->score;
    }
}
