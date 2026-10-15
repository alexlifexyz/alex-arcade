// main/battlecity_logic.c —— 《经典坦克大战 1990 (Battle City Neo)》核心算法与物理引擎
#include "battlecity_logic.h"
#include <string.h>
#include <stdlib.h>

// ============================================================================
// 经典关卡预设地图 (15 列 x 17 行)
// 0=空, 1=砖, 2=钢, 3=水, 4=草, 5=冰, 6=基地
// ============================================================================
static const uint8_t STAGE_1_MAP[BC_MAP_ROWS][BC_MAP_COLS] = {
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14
    {  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }, // Row 0 (敌军 3 个出生点: 0, 7, 14)
    {  0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0 }, // Row 1
    {  0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0 }, // Row 2
    {  0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0 }, // Row 3
    {  0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0 }, // Row 4
    {  0, 2, 0, 2, 0, 3, 3, 3, 3, 3, 0, 2, 0, 2, 0 }, // Row 5 (中央水面)
    {  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }, // Row 6
    {  1, 1, 0, 4, 4, 0, 1, 1, 1, 0, 4, 4, 0, 1, 1 }, // Row 7 (草丛埋伏区)
    {  1, 1, 0, 4, 4, 0, 1, 0, 1, 0, 4, 4, 0, 1, 1 }, // Row 8
    {  0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0 }, // Row 9
    {  0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0 }, // Row 10
    {  0, 1, 0, 1, 1, 0, 5, 5, 5, 0, 1, 1, 0, 1, 0 }, // Row 11 (中央冰面)
    {  0, 1, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 1, 0 }, // Row 12
    {  0, 2, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 2, 0 }, // Row 13
    {  0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0 }, // Row 14 (基地外围防线)
    {  0, 0, 0, 0, 0, 0, 1, 6, 1, 0, 0, 0, 0, 0, 0 }, // Row 15 (基地雄鹰在 7, 15)
    {  0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0 }  // Row 16 (基地底座砖墙)
};

// ============================================================================
// 辅助计算工具函数
// ============================================================================
static inline int clamp_val(int v, int min, int max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

static bool check_aabb(int x1, int y1, int w1, int h1,
                       int x2, int y2, int w2, int h2) {
    return (x1 < x2 + w2) && (x1 + w1 > x2) &&
           (y1 < y2 + h2) && (y1 + h1 > y2);
}

// ============================================================================
// 瓦片与砖块查询与物理破坏
// ============================================================================
bc_tile_type_t bc_get_tile(const bc_game_t *game, int col, int row) {
    if (!game || col < 0 || col >= BC_MAP_COLS || row < 0 || row >= BC_MAP_ROWS) {
        return BC_TILE_STEEL; // 越界按不可摧毁的钢壁阻挡
    }
    return (bc_tile_type_t)game->map_tiles[row][col];
}

bool bc_destroy_sub_brick(bc_game_t *game, int col, int row, int pixel_x, int pixel_y, bc_dir_t bullet_dir) {
    if (!game || col < 0 || col >= BC_MAP_COLS || row < 0 || row >= BC_MAP_ROWS) {
        return false;
    }
    if (game->map_tiles[row][col] != BC_TILE_BRICK) {
        return false;
    }

    uint8_t sub = game->sub_bricks[row][col];
    if (sub == 0) {
        game->map_tiles[row][col] = BC_TILE_EMPTY;
        return false;
    }

    int rel_x = pixel_x - (col * BC_TILE_SIZE);
    int rel_y = pixel_y - (row * BC_TILE_SIZE);
    rel_x = clamp_val(rel_x, 0, BC_TILE_SIZE - 1);
    rel_y = clamp_val(rel_y, 0, BC_TILE_SIZE - 1);

    // 针对炮弹飞行方向进行真实的半砖消解
    // 例如从下往上打：优先摧毁下半部的两个子块 (BL, BR)
    if (bullet_dir == BC_DIR_UP) {
        if (sub & (BC_SUB_BL | BC_SUB_BR)) {
            sub &= ~(BC_SUB_BL | BC_SUB_BR);
        } else {
            sub &= ~(BC_SUB_TL | BC_SUB_TR);
        }
    } else if (bullet_dir == BC_DIR_DOWN) {
        if (sub & (BC_SUB_TL | BC_SUB_TR)) {
            sub &= ~(BC_SUB_TL | BC_SUB_TR);
        } else {
            sub &= ~(BC_SUB_BL | BC_SUB_BR);
        }
    } else if (bullet_dir == BC_DIR_LEFT) {
        if (sub & (BC_SUB_TR | BC_SUB_BR)) {
            sub &= ~(BC_SUB_TR | BC_SUB_BR);
        } else {
            sub &= ~(BC_SUB_TL | BC_SUB_BL);
        }
    } else if (bullet_dir == BC_DIR_RIGHT) {
        if (sub & (BC_SUB_TL | BC_SUB_BL)) {
            sub &= ~(BC_SUB_TL | BC_SUB_BL);
        } else {
            sub &= ~(BC_SUB_TR | BC_SUB_BR);
        }
    } else {
        // 根据相对坐标单点削减
        if (rel_x < 8 && rel_y < 8) sub &= ~BC_SUB_TL;
        else if (rel_x >= 8 && rel_y < 8) sub &= ~BC_SUB_TR;
        else if (rel_x < 8 && rel_y >= 8) sub &= ~BC_SUB_BL;
        else sub &= ~BC_SUB_BR;
    }

    game->sub_bricks[row][col] = sub;
    if (sub == 0) {
        game->map_tiles[row][col] = BC_TILE_EMPTY;
    }
    return true;
}

// 检查某个矩形区域与地图中不可通行地貌的碰撞
static bool is_blocked_by_terrain(const bc_game_t *game, int x, int y, int w, int h, bool is_bullet) {
    if (x < 0 || x + w > BC_PLAYFIELD_W || y < 0 || y + h > BC_PLAYFIELD_H) {
        return true; // 出界阻挡
    }

    int start_col = x / BC_TILE_SIZE;
    int end_col = (x + w - 1) / BC_TILE_SIZE;
    int start_row = y / BC_TILE_SIZE;
    int end_row = (y + h - 1) / BC_TILE_SIZE;

    for (int r = start_row; r <= end_row; r++) {
        for (int c = start_col; c <= end_col; c++) {
            bc_tile_type_t t = bc_get_tile(game, c, r);
            if (t == BC_TILE_EMPTY || t == BC_TILE_FOREST || t == BC_TILE_ICE) {
                continue; // 坦克与子弹均可穿行
            }
            if (t == BC_TILE_WATER) {
                if (is_bullet) continue; // 子弹可自由飞过水面
                return true;             // 坦克不能入水
            }
            if (t == BC_TILE_BRICK) {
                uint8_t sub = game->sub_bricks[r][c];
                if (sub == 0) continue;
                // 进一步检查子砖是否真的在坦克/子弹包围盒内
                int tile_x = c * BC_TILE_SIZE;
                int tile_y = r * BC_TILE_SIZE;
                if ((sub & BC_SUB_TL) && check_aabb(x, y, w, h, tile_x, tile_y, 8, 8)) return true;
                if ((sub & BC_SUB_TR) && check_aabb(x, y, w, h, tile_x + 8, tile_y, 8, 8)) return true;
                if ((sub & BC_SUB_BL) && check_aabb(x, y, w, h, tile_x, tile_y + 8, 8, 8)) return true;
                if ((sub & BC_SUB_BR) && check_aabb(x, y, w, h, tile_x + 8, tile_y + 8, 8, 8)) return true;
                continue;
            }
            if (t == BC_TILE_STEEL || t == BC_TILE_BASE) {
                return true;
            }
        }
    }
    return false;
}

// ============================================================================
// 初始化与重置游戏
// ============================================================================
void bc_init_game(bc_game_t *game, uint8_t stage) {
    if (!game) return;
    memset(game, 0, sizeof(bc_game_t));

    game->stage = stage ? stage : 1;
    game->score = 0;
    game->base_alive = true;
    game->enemies_left_in_stage = BC_TOTAL_ENEMIES;
    game->spawn_timer = 30; // 1 秒后刷第一只怪
    game->auto_fire_p1 = false;
    game->p1_lives = 3;
    game->p2_lives = 3;
    game->last_sound = BC_EVT_START;

    // 复制地图模板
    for (int r = 0; r < BC_MAP_ROWS; r++) {
        for (int c = 0; c < BC_MAP_COLS; c++) {
            game->map_tiles[r][c] = STAGE_1_MAP[r][c];
            if (STAGE_1_MAP[r][c] == BC_TILE_BRICK) {
                game->sub_bricks[r][c] = BC_SUB_FULL;
            } else {
                game->sub_bricks[r][c] = 0;
            }
        }
    }

    // 初始化 1P 玩家
    game->p1.active = true;
    game->p1.type = BC_TANK_PLAYER_1;
    game->p1.x = 4 * BC_TILE_SIZE + 1; // col 4, row 15
    game->p1.y = 15 * BC_TILE_SIZE + 1;
    game->p1.dir = BC_DIR_UP;
    game->p1.tier = 1;
    game->p1.speed = 6; // 基础移速提升至 6px/帧 (极速冲锋)
    game->p1.invincible_time = 90; // 3 秒无敌罩

    // 2P 玩家初始就绪备用
    game->p2.active = false;
    game->p2.type = BC_TANK_PLAYER_2;
    game->p2.x = 10 * BC_TILE_SIZE + 1;
    game->p2.y = 15 * BC_TILE_SIZE + 1;
    game->p2.dir = BC_DIR_UP;
    game->p2.tier = 1;
    game->p2.speed = 6;
}

// 顺时针单键旋转 90 度 (上 -> 右 -> 下 -> 左)
void bc_player_turn_clockwise(bc_game_t *game, uint8_t player_id) {
    if (!game || game->game_over || game->paused) return;
    bc_tank_t *tank = (player_id == 1) ? &game->p1 : &game->p2;
    if (!tank->active) return;
    bc_dir_t new_dir = (bc_dir_t)((tank->dir + 1) % 4);
    bc_player_turn(game, player_id, new_dir);
}

// 坦克朝向控制与网格对齐辅助 (Grid-Snap)
void bc_player_turn(bc_game_t *game, uint8_t player_id, bc_dir_t dir) {
    if (!game || game->game_over || game->paused) return;
    bc_tank_t *tank = (player_id == 1) ? &game->p1 : &game->p2;
    if (!tank->active) return;

    tank->dir = dir;
    // 转向时对垂直轴坐标做 ±4px 顺滑网格吸附，防止卡入墙体夹角
    if (dir == BC_DIR_UP || dir == BC_DIR_DOWN) {
        int rem = tank->x % BC_TILE_SIZE;
        if (rem <= 4) tank->x -= rem;
        else if (rem >= BC_TILE_SIZE - 4) tank->x += (BC_TILE_SIZE - rem);
    } else {
        int rem = tank->y % BC_TILE_SIZE;
        if (rem <= 4) tank->y -= rem;
        else if (rem >= BC_TILE_SIZE - 4) tank->y += (BC_TILE_SIZE - rem);
    }
}

void bc_player_move(bc_game_t *game, uint8_t player_id, bool moving) {
    if (!game || game->game_over || game->paused) return;
    bc_tank_t *tank = (player_id == 1) ? &game->p1 : &game->p2;
    if (!tank->active) return;
    tank->moving = moving;
}

// 开火射击 (按一次必出一发，无需等上一发打碎或消失，支持畅快连续倾泻火力)
void bc_player_fire(bc_game_t *game, uint8_t player_id) {
    if (!game || game->game_over || game->paused) return;
    bc_tank_t *tank = (player_id == 1) ? &game->p1 : &game->p2;
    if (!tank->active) return;

    // 统计当前玩家已发射在场子弹，放宽到 8 发同屏狂轰！
    int count = 0;
    for (int i = 0; i < BC_MAX_BULLETS; i++) {
        if (game->bullets[i].active && game->bullets[i].from_player && game->bullets[i].owner_id == player_id) {
            count++;
        }
    }
    if (count >= 8) return; // 容纳 8 发同屏连射

    // 寻空闲子弹槽位
    for (int i = 0; i < BC_MAX_BULLETS; i++) {
        if (!game->bullets[i].active) {
            game->bullets[i].active = true;
            game->bullets[i].from_player = true;
            game->bullets[i].owner_id = player_id;
            game->bullets[i].dir = tank->dir;
            // 超高速重炮：普通 9px/帧，升级 12px/帧 (飞过全屏只需 0.5 秒)
            game->bullets[i].speed = (tank->tier >= 2) ? 12 : 9;
            game->bullets[i].pierce_steel = (tank->tier >= 4);

            // 根据坦克朝向算出枪口发射点
            if (tank->dir == BC_DIR_UP) {
                game->bullets[i].x = tank->x + (BC_TANK_SIZE / 2);
                game->bullets[i].y = tank->y - 2;
            } else if (tank->dir == BC_DIR_DOWN) {
                game->bullets[i].x = tank->x + (BC_TANK_SIZE / 2);
                game->bullets[i].y = tank->y + BC_TANK_SIZE + 2;
            } else if (tank->dir == BC_DIR_LEFT) {
                game->bullets[i].x = tank->x - 2;
                game->bullets[i].y = tank->y + (BC_TANK_SIZE / 2);
            } else {
                game->bullets[i].x = tank->x + BC_TANK_SIZE + 2;
                game->bullets[i].y = tank->y + (BC_TANK_SIZE / 2);
            }

            tank->shoot_cooldown = 0; // 零装填冷却，按一次必出一次
            game->last_sound = BC_EVT_FIRE;
            break;
        }
    }
}

void bc_player_toggle_autofire(bc_game_t *game, uint8_t player_id) {
    if (!game) return;
    if (player_id == 1) {
        game->auto_fire_p1 = !game->auto_fire_p1;
    }
}

// ============================================================================
// 道具系统
// ============================================================================
void bc_apply_item(bc_game_t *game, bc_item_type_t type, uint8_t player_id) {
    if (!game) return;
    bc_tank_t *tank = (player_id == 1) ? &game->p1 : &game->p2;

    game->last_sound = BC_EVT_POWERUP;
    game->score += 500;

    switch (type) {
        case BC_ITEM_STAR:
            if (tank->tier < 4) tank->tier++;
            if (tank->tier >= 2) tank->speed = 5; // 升级加速至 5px/帧
            break;
        case BC_ITEM_BOMB:
            // 轰爆当前所有在场敌军
            for (int i = 0; i < BC_MAX_ENEMIES; i++) {
                if (game->enemies[i].active) {
                    game->enemies[i].active = false;
                    game->score += 200;
                }
            }
            game->last_sound = BC_EVT_EXPLODE;
            break;
        case BC_ITEM_CLOCK:
            game->freeze_timer = 300; // 冻结 10 秒
            break;
        case BC_ITEM_HELMET:
            tank->invincible_time = 300; // 无敌 10 秒
            break;
        case BC_ITEM_SHOVEL:
            // 基地加固为钢板防线
            game->shovel_timer = 450; // 15 秒
            game->map_tiles[14][6] = BC_TILE_STEEL;
            game->map_tiles[14][7] = BC_TILE_STEEL;
            game->map_tiles[14][8] = BC_TILE_STEEL;
            game->map_tiles[15][6] = BC_TILE_STEEL;
            game->map_tiles[15][8] = BC_TILE_STEEL;
            game->map_tiles[16][6] = BC_TILE_STEEL;
            game->map_tiles[16][8] = BC_TILE_STEEL;
            break;
        case BC_ITEM_GUN:
            tank->tier = 4;
            tank->speed = 6; // 满级神装 6px/帧疾驰 (极速狂飙)
            break;
        case BC_ITEM_LIFE:
            if (player_id == 1) game->p1_lives++;
            else game->p2_lives++;
            game->last_sound = BC_EVT_BONUS_LIFE;
            break;
        default:
            break;
    }
}

// 掉落新随机道具
static void spawn_random_item(bc_game_t *game) {
    for (int i = 0; i < BC_MAX_ITEMS; i++) {
        if (!game->items[i].active) {
            game->items[i].active = true;
            // 随机道具类型 (1..7)
            game->items[i].type = (bc_item_type_t)(1 + (rand() % 7));
            game->items[i].x = 16 + (rand() % (BC_PLAYFIELD_W - 32));
            game->items[i].y = 16 + (rand() % (BC_PLAYFIELD_H - 48));
            game->items[i].lifetime = 600; // 20 秒
            game->items[i].blink = false;
            break;
        }
    }
}

// ============================================================================
// 敌军 AI 与刷新逻辑
// ============================================================================
static void spawn_enemy(bc_game_t *game) {
    if (game->enemies_left_in_stage == 0) return;

    for (int i = 0; i < BC_MAX_ENEMIES; i++) {
        if (!game->enemies[i].active) {
            // 三个顶部刷新点 (左, 中, 右)
            static const int spawn_cols[3] = { 0, 7, 13 };
            int pt = rand() % 3;
            int sx = spawn_cols[pt] * BC_TILE_SIZE;
            int sy = 0;

            // 检查出生点是否已被其他坦克占据
            bool occupied = false;
            for (int j = 0; j < BC_MAX_ENEMIES; j++) {
                if (game->enemies[j].active && check_aabb(sx, sy, BC_TANK_SIZE, BC_TANK_SIZE,
                                                         game->enemies[j].x, game->enemies[j].y, BC_TANK_SIZE, BC_TANK_SIZE)) {
                    occupied = true; break;
                }
            }
            if (occupied) return;

            game->enemies[i].active = true;
            game->enemies[i].x = sx;
            game->enemies[i].y = sy;
            game->enemies[i].dir = BC_DIR_DOWN;
            game->enemies[i].invincible_time = 0;
            game->enemies[i].anim_frame = 0;

            // 随机分配敌军类型 (移速大幅优化，告别慢吞吞)
            int r = rand() % 10;
            if (r < 4) {
                game->enemies[i].type = BC_TANK_BASIC;
                game->enemies[i].speed = 2; // 兵坦移速提升至 2
                game->enemies[i].tier = 1;
            } else if (r < 7) {
                game->enemies[i].type = BC_TANK_FAST;
                game->enemies[i].speed = 4; // 疾风突击车提速至 4 (极速突袭)
                game->enemies[i].tier = 1;
            } else if (r < 9) {
                game->enemies[i].type = BC_TANK_POWER;
                game->enemies[i].speed = 3; // 高爆坦提速至 3
                game->enemies[i].tier = 1;
            } else {
                game->enemies[i].type = BC_TANK_ARMOR;
                game->enemies[i].speed = 2; // 重装泰坦提速至 2
                game->enemies[i].tier = 3; // 重装坦耐打
            }

            // 1/4 概率为红闪发光怪
            game->enemies[i].flashing = (rand() % 4 == 0);
            game->enemies_left_in_stage--;
            break;
        }
    }
}

// ============================================================================
// 主物理循环推进 (bc_tick)
// ============================================================================
void bc_tick(bc_game_t *game) {
    if (!game || game->game_over || game->paused) return;

    game->ticks++;
    game->last_sound = BC_EVT_NONE;

    // 1. 铲子倒计时与恢复
    if (game->shovel_timer > 0) {
        game->shovel_timer--;
        if (game->shovel_timer == 0) {
            // 恢复基地砖墙
            const int r_list[] = {14, 14, 14, 15, 15, 16, 16};
            const int c_list[] = { 6,  7,  8,  6,  8,  6,  8};
            for (size_t k = 0; k < sizeof(r_list)/sizeof(r_list[0]); k++) {
                int r = r_list[k], c = c_list[k];
                game->map_tiles[r][c] = BC_TILE_BRICK;
                game->sub_bricks[r][c] = BC_SUB_FULL;
            }
        }
    }

    // 2. 敌军冰冻倒计时
    if (game->freeze_timer > 0) {
        game->freeze_timer--;
    }

    // 3. 玩家 1 状态更新
    if (game->p1.active) {
        if (game->p1.invincible_time > 0) game->p1.invincible_time--;
        if (game->p1.shoot_cooldown > 0) game->p1.shoot_cooldown--;

        // 自动射击特性 (连发节奏更爽快)
        if (game->auto_fire_p1 && (game->ticks % 6 == 0)) {
            bc_player_fire(game, 1);
        }

        // 移动判定 (逐像素精准推进，彻底消除大步长卡墙角，手感极其丝滑顺畅)
        if (game->p1.moving) {
            game->p1.anim_frame ^= 1;
            int spd = game->p1.speed;
            for (int s = 0; s < spd; s++) {
                int nx = game->p1.x;
                int ny = game->p1.y;
                if (game->p1.dir == BC_DIR_UP) ny -= 1;
                else if (game->p1.dir == BC_DIR_DOWN) ny += 1;
                else if (game->p1.dir == BC_DIR_LEFT) nx -= 1;
                else nx += 1;

                if (!is_blocked_by_terrain(game, nx, ny, BC_TANK_SIZE, BC_TANK_SIZE, false)) {
                    game->p1.x = nx;
                    game->p1.y = ny;
                } else {
                    break; // 贴紧障碍物边缘停止，绝不卡死
                }
            }
        }
    }

    // 4. 敌军生成与 AI 更新 (加快刷新频率，战场更紧凑刺激)
    if (game->enemies_left_in_stage > 0) {
        if (game->spawn_timer > 0) game->spawn_timer--;
        else {
            spawn_enemy(game);
            game->spawn_timer = 40; // 约 1.2 秒刷一只怪，节奏大提速
        }
    }

    // 敌军行动
    if (game->freeze_timer == 0) {
        for (int i = 0; i < BC_MAX_ENEMIES; i++) {
            bc_tank_t *e = &game->enemies[i];
            if (!e->active) continue;

            if (e->shoot_cooldown > 0) e->shoot_cooldown--;

            // 随机换向或遇到阻挡换向
            if (rand() % 30 == 0) {
                // 疾风坦克更倾向于向下
                if (e->type == BC_TANK_FAST && (rand() % 3 == 0)) {
                    e->dir = BC_DIR_DOWN;
                } else {
                    e->dir = (bc_dir_t)(rand() % 4);
                }
            }

            int spd = e->speed;
            bool moved = false;
            for (int s = 0; s < spd; s++) {
                int nx = e->x;
                int ny = e->y;
                if (e->dir == BC_DIR_UP) ny -= 1;
                else if (e->dir == BC_DIR_DOWN) ny += 1;
                else if (e->dir == BC_DIR_LEFT) nx -= 1;
                else nx += 1;

                if (!is_blocked_by_terrain(game, nx, ny, BC_TANK_SIZE, BC_TANK_SIZE, false)) {
                    e->x = nx;
                    e->y = ny;
                    moved = true;
                } else {
                    break;
                }
            }

            if (moved) {
                e->anim_frame ^= 1;
            } else {
                // 撞墙立即换向
                e->dir = (bc_dir_t)(rand() % 4);
            }

            // 敌方随机开火
            if (e->shoot_cooldown == 0 && (rand() % 25 == 0)) {
                for (int b = 0; b < BC_MAX_BULLETS; b++) {
                    if (!game->bullets[b].active) {
                        game->bullets[b].active = true;
                        game->bullets[b].from_player = false;
                        game->bullets[b].owner_id = 3 + i;
                        game->bullets[b].dir = e->dir;
                        game->bullets[b].speed = (e->type == BC_TANK_POWER) ? 7 : 5;
                        game->bullets[b].pierce_steel = false;
                        game->bullets[b].x = e->x + BC_TANK_SIZE / 2;
                        game->bullets[b].y = e->y + BC_TANK_SIZE / 2;
                        e->shoot_cooldown = 20; // 冷却缩减至 20 帧
                        break;
                    }
                }
            }
        }
    }

    // 5. 子弹飞行与碰撞检测
    for (int i = 0; i < BC_MAX_BULLETS; i++) {
        bc_bullet_t *b = &game->bullets[i];
        if (!b->active) continue;

        int nx = b->x;
        int ny = b->y;
        if (b->dir == BC_DIR_UP) ny -= b->speed;
        else if (b->dir == BC_DIR_DOWN) ny += b->speed;
        else if (b->dir == BC_DIR_LEFT) nx -= b->speed;
        else nx += b->speed;

        // 边界销毁
        if (nx < 0 || nx >= BC_PLAYFIELD_W || ny < 0 || ny >= BC_PLAYFIELD_H) {
            b->active = false;
            continue;
        }

        b->x = nx;
        b->y = ny;

        // 子弹互相抵消机制 (弹道对撞)
        for (int j = i + 1; j < BC_MAX_BULLETS; j++) {
            if (game->bullets[j].active && (b->from_player != game->bullets[j].from_player)) {
                if (abs(b->x - game->bullets[j].x) <= 6 && abs(b->y - game->bullets[j].y) <= 6) {
                    b->active = false;
                    game->bullets[j].active = false;
                    game->last_sound = BC_EVT_HIT_STEEL;
                    break;
                }
            }
        }
        if (!b->active) continue;

        // 击中地图地形瓦片
        int col = b->x / BC_TILE_SIZE;
        int row = b->y / BC_TILE_SIZE;
        bc_tile_type_t t = bc_get_tile(game, col, row);

        if (t == BC_TILE_BRICK) {
            bc_destroy_sub_brick(game, col, row, b->x, b->y, b->dir);
            b->active = false;
            game->last_sound = BC_EVT_HIT_BRICK;
            continue;
        } else if (t == BC_TILE_STEEL) {
            if (b->pierce_steel) {
                game->map_tiles[row][col] = BC_TILE_EMPTY;
                game->last_sound = BC_EVT_EXPLODE;
            } else {
                game->last_sound = BC_EVT_HIT_STEEL;
            }
            b->active = false;
            continue;
        } else if (t == BC_TILE_BASE) {
            // 击中基地雄鹰！
            game->base_alive = false;
            game->game_over = true;
            game->last_sound = BC_EVT_BASE_HIT;
            b->active = false;
            continue;
        }

        // 玩家子弹打击敌军
        if (b->from_player) {
            for (int k = 0; k < BC_MAX_ENEMIES; k++) {
                bc_tank_t *e = &game->enemies[k];
                if (e->active && check_aabb(b->x - 2, b->y - 2, 4, 4, e->x, e->y, BC_TANK_SIZE, BC_TANK_SIZE)) {
                    b->active = false;
                    if (e->tier > 1) {
                        e->tier--; // 重装甲受损
                        game->last_sound = BC_EVT_HIT_STEEL;
                    } else {
                        e->active = false;
                        game->score += 100;
                        game->last_sound = BC_EVT_EXPLODE;
                        if (e->flashing) {
                            spawn_random_item(game);
                        }
                    }
                    break;
                }
            }
        } else {
            // 敌方子弹打击玩家 1
            if (game->p1.active && check_aabb(b->x - 2, b->y - 2, 4, 4, game->p1.x, game->p1.y, BC_TANK_SIZE, BC_TANK_SIZE)) {
                b->active = false;
                if (game->p1.invincible_time == 0) {
                    game->last_sound = BC_EVT_EXPLODE;
                    if (game->p1_lives > 1) {
                        game->p1_lives--;
                        game->p1.x = 4 * BC_TILE_SIZE + 1;
                        game->p1.y = 15 * BC_TILE_SIZE + 1;
                        game->p1.dir = BC_DIR_UP;
                        game->p1.invincible_time = 90; // 3 秒无敌
                    } else {
                        game->p1.active = false;
                        game->p1_lives = 0;
                        if (!game->p2.active || game->p2_lives == 0) {
                            game->game_over = true;
                        }
                    }
                }
            }
        }
    }

    // 6. 道具拾取与寿命衰减
    for (int i = 0; i < BC_MAX_ITEMS; i++) {
        bc_item_t *it = &game->items[i];
        if (!it->active) continue;

        if (it->lifetime > 0) {
            it->lifetime--;
            it->blink = (it->lifetime < 100) && ((it->lifetime / 8) % 2 == 0);
        } else {
            it->active = false;
            continue;
        }

        // 玩家 1 拾取检测
        if (game->p1.active && check_aabb(it->x, it->y, 16, 16, game->p1.x, game->p1.y, BC_TANK_SIZE, BC_TANK_SIZE)) {
            bc_apply_item(game, it->type, 1);
            it->active = false;
        }
    }

    // 7. 胜负检测
    if (!game->base_alive || (game->p1_lives == 0 && (!game->p2_active || game->p2_lives == 0))) {
        game->game_over = true;
    } else if (game->enemies_left_in_stage == 0) {
        bool all_dead = true;
        for (int i = 0; i < BC_MAX_ENEMIES; i++) {
            if (game->enemies[i].active) {
                all_dead = false; break;
            }
        }
        if (all_dead) {
            game->victory = true;
        }
    }
}

// ============================================================================
// ESP-NOW 无感双机网络协议封包与解包实现
// ============================================================================
size_t bc_pack_beacon(bc_net_packet_t *pkt, const uint8_t mac[6], uint8_t stage, uint8_t role) {
    if (!pkt) return 0;
    pkt->magic = BC_NET_MAGIC;
    pkt->version = BC_NET_VER;
    pkt->pkt_type = BC_PKT_BEACON;
    pkt->seq = 0;
    if (mac) memcpy(pkt->payload.beacon.mac, mac, 6);
    pkt->payload.beacon.stage = stage;
    pkt->payload.beacon.role = role;
    return sizeof(bc_net_packet_t);
}

size_t bc_pack_sync(bc_net_packet_t *pkt, const bc_game_t *game) {
    if (!pkt || !game) return 0;
    pkt->magic = BC_NET_MAGIC;
    pkt->version = BC_NET_VER;
    pkt->pkt_type = BC_PKT_SYNC_STATE;
    pkt->seq = game->ticks;
    pkt->payload.sync.p1_x = game->p1.x;
    pkt->payload.sync.p1_y = game->p1.y;
    pkt->payload.sync.p1_dir = (uint8_t)game->p1.dir;
    pkt->payload.sync.p1_tier = game->p1.tier;
    pkt->payload.sync.p1_lives = game->p1_lives;
    pkt->payload.sync.p2_x = game->p2.x;
    pkt->payload.sync.p2_y = game->p2.y;
    pkt->payload.sync.p2_dir = (uint8_t)game->p2.dir;
    pkt->payload.sync.p2_tier = game->p2.tier;
    pkt->payload.sync.p2_lives = game->p2_lives;
    pkt->payload.sync.base_alive = game->base_alive ? 1 : 0;
    pkt->payload.sync.score = (uint16_t)(game->score > 65535 ? 65535 : game->score);
    pkt->payload.sync.remaining_enemies = game->enemies_left_in_stage;
    return sizeof(bc_net_packet_t);
}

size_t bc_pack_input(bc_net_packet_t *pkt, uint8_t dir, uint8_t moving, uint8_t fire) {
    if (!pkt) return 0;
    pkt->magic = BC_NET_MAGIC;
    pkt->version = BC_NET_VER;
    pkt->pkt_type = BC_PKT_CLIENT_INPUT;
    pkt->seq = 0;
    pkt->payload.input.dir = dir;
    pkt->payload.input.moving = moving;
    pkt->payload.input.fire = fire;
    return sizeof(bc_net_packet_t);
}

bool bc_unpack_sync(bc_game_t *game, const bc_net_packet_t *pkt) {
    if (!game || !pkt) return false;
    if (pkt->magic != BC_NET_MAGIC || pkt->version != BC_NET_VER || pkt->pkt_type != BC_PKT_SYNC_STATE) {
        return false;
    }
    game->p1.x = pkt->payload.sync.p1_x;
    game->p1.y = pkt->payload.sync.p1_y;
    game->p1.dir = (bc_dir_t)pkt->payload.sync.p1_dir;
    game->p1.tier = pkt->payload.sync.p1_tier;
    game->p1_lives = pkt->payload.sync.p1_lives;

    game->p2.x = pkt->payload.sync.p2_x;
    game->p2.y = pkt->payload.sync.p2_y;
    game->p2.dir = (bc_dir_t)pkt->payload.sync.p2_dir;
    game->p2.tier = pkt->payload.sync.p2_tier;
    game->p2_lives = pkt->payload.sync.p2_lives;

    game->base_alive = (pkt->payload.sync.base_alive != 0);
    game->score = pkt->payload.sync.score;
    game->enemies_left_in_stage = pkt->payload.sync.remaining_enemies;
    return true;
}
