// tests/test_battlecity_logic.c —— 《经典坦克大战 1990 (Battle City Neo)》主机端单元测试
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "battlecity_logic.h"

static void test_initialization(void) {
    printf("[TEST 1] Testing Battle City Neo Initialization...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    assert(g.stage == 1);
    assert(g.score == 0);
    assert(g.base_alive == true);
    assert(g.p1_lives == 3);
    assert(g.p2_lives == 3);
    assert(g.p1.active == true);
    assert(g.p1.tier == 1);
    assert(g.p1.invincible_time == 90);
    assert(g.enemies_left_in_stage == BC_TOTAL_ENEMIES);
    assert(g.game_over == false);
    assert(g.victory == false);

    // 检查基地雄鹰位置 (col 7, row 15)
    assert(bc_get_tile(&g, 7, 15) == BC_TILE_BASE);
    // 基地四周被砖墙保护
    assert(bc_get_tile(&g, 6, 15) == BC_TILE_BRICK);
    assert(bc_get_tile(&g, 8, 15) == BC_TILE_BRICK);
    assert(bc_get_tile(&g, 7, 14) == BC_TILE_BRICK);

    printf("  ✓ Map grid, base eagle, P1 coordinates and state initialized OK\n");
}

static void test_sub_brick_destruction(void) {
    printf("[TEST 2] Testing 8x8 Sub-tile Brick Destruction Physics...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // 找一个初始完整的砖块，例如 col 1, row 1
    assert(bc_get_tile(&g, 1, 1) == BC_TILE_BRICK);
    assert(g.sub_bricks[1][1] == BC_SUB_FULL); // 0x0F

    // 1. 从下方打一炮 (dir = UP)：应先打碎下半部 (BL, BR)
    bool hit = bc_destroy_sub_brick(&g, 1, 1, 16 + 8, 16 + 12, BC_DIR_UP);
    assert(hit == true);
    assert(g.sub_bricks[1][1] == (BC_SUB_TL | BC_SUB_TR)); // 仅剩上半部
    assert(bc_get_tile(&g, 1, 1) == BC_TILE_BRICK); // 依然是砖块

    // 2. 再次从下方打一炮 (dir = UP)：打碎剩余的上半部，瓦片变为 EMPTY
    hit = bc_destroy_sub_brick(&g, 1, 1, 16 + 8, 16 + 4, BC_DIR_UP);
    assert(hit == true);
    assert(g.sub_bricks[1][1] == 0);
    assert(bc_get_tile(&g, 1, 1) == BC_TILE_EMPTY); // 彻底炸穿变空地

    printf("  ✓ Sub-brick 8x8 progressive notch destruction & tile-empty transition OK\n");
}

static void test_steel_and_tier4_pierce(void) {
    printf("[TEST 3] Testing Steel Defense & Tier 4 Super Heavy Tank Pierce...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // col 7, row 1 是钢板 (BC_TILE_STEEL)
    assert(bc_get_tile(&g, 7, 1) == BC_TILE_STEEL);

    // 普通玩家 (Tier 1) 的炮弹打在钢板上：无法破坏钢板
    g.p1.x = 7 * BC_TILE_SIZE + 1;
    g.p1.y = 2 * BC_TILE_SIZE + 1; // 位于钢板下方
    g.p1.dir = BC_DIR_UP;
    g.p1.tier = 1;
    g.p1.shoot_cooldown = 0;

    bc_player_fire(&g, 1);
    assert(g.bullets[0].active == true);
    assert(g.bullets[0].pierce_steel == false);

    // 模拟子弹飞向钢板并命中
    for (int t = 0; t < 10; t++) {
        bc_tick(&g);
    }
    // 钢板仍然存在，子弹已销毁
    assert(bc_get_tile(&g, 7, 1) == BC_TILE_STEEL);

    // 升级为 Tier 4 (破坏者)，发射穿甲炮弹
    g.p1.tier = 4;
    g.p1.shoot_cooldown = 0;
    bc_player_fire(&g, 1);
    // 找到新激活的子弹
    int bullet_idx = -1;
    for (int b = 0; b < BC_MAX_BULLETS; b++) {
        if (g.bullets[b].active) { bullet_idx = b; break; }
    }
    assert(bullet_idx >= 0);
    assert(g.bullets[bullet_idx].pierce_steel == true);

    // 推进子弹命中钢板
    for (int t = 0; t < 15; t++) {
        bc_tick(&g);
    }
    // 钢板已被 Tier 4 穿甲弹彻底轰毁变为空地！
    assert(bc_get_tile(&g, 7, 1) == BC_TILE_EMPTY);

    printf("  ✓ Steel armor ricochet & Tier 4 star piercing annihilation OK\n");
}

static void test_movement_and_grid_snap(void) {
    printf("[TEST 4] Testing Tank Movement, Steering & Grid-Snap Alignment...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // 在平原空地上做转向与对齐测试 (col 0, row 6)
    g.p1.x = 4; // 微小偏移 4px
    g.p1.y = 6 * BC_TILE_SIZE;
    g.p1.dir = BC_DIR_DOWN;

    // 当转向 UP 时，x 坐标有 4px 偏移，会自动平滑吸附到最近的整格 0
    bc_player_turn(&g, 1, BC_DIR_UP);
    assert(g.p1.dir == BC_DIR_UP);
    assert(g.p1.x == 0); // 网格对齐生效

    // 测试单键顺时针转向：UP -> RIGHT -> DOWN -> LEFT -> UP
    bc_player_turn_clockwise(&g, 1);
    assert(g.p1.dir == BC_DIR_RIGHT);
    bc_player_turn_clockwise(&g, 1);
    assert(g.p1.dir == BC_DIR_DOWN);
    bc_player_turn_clockwise(&g, 1);
    assert(g.p1.dir == BC_DIR_LEFT);
    bc_player_turn_clockwise(&g, 1);
    assert(g.p1.dir == BC_DIR_UP);

    // 测试移动
    bc_player_move(&g, 1, true);
    assert(g.p1.moving == true);
    int old_y = g.p1.y;
    bc_tick(&g);
    assert(g.p1.y < old_y); // 向上推进 (6px/帧)
    assert(old_y - g.p1.y == 6);

    bc_player_move(&g, 1, false);
    assert(g.p1.moving == false);

    // 测试快速连发：初始 Tier 1 即可同时射出 2 发子弹
    g.p1.shoot_cooldown = 0;
    bc_player_fire(&g, 1);
    assert(g.bullets[0].active == true);
    g.p1.shoot_cooldown = 0; // 短冷却后立即补发第 2 发
    bc_player_fire(&g, 1);
    assert(g.bullets[1].active == true); // 成功连发！无需等上一发打碎或飞出屏幕

    printf("  ✓ Tank clockwise steering, throttle movement and multi-bullet rapid fire OK\n");
}

static void test_bullet_clash(void) {
    printf("[TEST 5] Testing Opposing Bullets Mutual Annihilation (Clash)...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // 在同屏生成两发迎面相撞的子弹
    g.bullets[0].active = true;
    g.bullets[0].from_player = true;
    g.bullets[0].x = 100;
    g.bullets[0].y = 120;
    g.bullets[0].dir = BC_DIR_UP;
    g.bullets[0].speed = 4;

    g.bullets[1].active = true;
    g.bullets[1].from_player = false;
    g.bullets[1].x = 100;
    g.bullets[1].y = 126;
    g.bullets[1].dir = BC_DIR_DOWN;
    g.bullets[1].speed = 4;

    // 运行一帧，两发对冲子弹应撞毁对消
    bc_tick(&g);
    assert(g.bullets[0].active == false);
    assert(g.bullets[1].active == false);

    printf("  ✓ Opposing bullet clash and cancellation OK\n");
}

static void test_item_powerups(void) {
    printf("[TEST 6] Testing Powerup Drops & Item Effects...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // 1. 测试星星升级 (Star)
    assert(g.p1.tier == 1);
    bc_apply_item(&g, BC_ITEM_STAR, 1);
    assert(g.p1.tier == 2);
    assert(g.score == 500);

    // 2. 测试炸弹全灭 (Bomb)
    g.enemies[0].active = true;
    g.enemies[1].active = true;
    bc_apply_item(&g, BC_ITEM_BOMB, 1);
    assert(g.enemies[0].active == false);
    assert(g.enemies[1].active == false);

    // 3. 测试时钟冻结 (Clock)
    bc_apply_item(&g, BC_ITEM_CLOCK, 1);
    assert(g.freeze_timer == 300);

    // 4. 测试钢盔无敌 (Helmet)
    bc_apply_item(&g, BC_ITEM_HELMET, 1);
    assert(g.p1.invincible_time == 300);

    // 5. 测试铁铲基地加固 (Shovel)
    bc_apply_item(&g, BC_ITEM_SHOVEL, 1);
    assert(g.shovel_timer == 450);
    assert(bc_get_tile(&g, 7, 14) == BC_TILE_STEEL); // 变成钢板
    // 推进 450 帧后，钢板自动复原为砖墙
    for (int f = 0; f < 450; f++) {
        bc_tick(&g);
    }
    assert(g.shovel_timer == 0);
    assert(bc_get_tile(&g, 7, 14) == BC_TILE_BRICK); // 恢复砖墙

    // 6. 测试加命 (Life)
    int old_lives = g.p1_lives;
    bc_apply_item(&g, BC_ITEM_LIFE, 1);
    assert(g.p1_lives == old_lives + 1);

    printf("  ✓ Star, Bomb, Clock, Helmet, Shovel, and Life powerups OK\n");
}

static void test_base_destruction_and_game_over(void) {
    printf("[TEST 7] Testing Base Eagle Destruction & Game Over Trigger...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    assert(g.base_alive == true);
    assert(g.game_over == false);

    // 模拟一枚敌方子弹直接命中基地雄鹰 (col 7, row 15 -> pixel 7*16+8, 15*16+8)
    g.bullets[0].active = true;
    g.bullets[0].from_player = false;
    g.bullets[0].x = 7 * BC_TILE_SIZE + 8;
    g.bullets[0].y = 15 * BC_TILE_SIZE + 4;
    g.bullets[0].dir = BC_DIR_DOWN;
    g.bullets[0].speed = 4;

    bc_tick(&g);
    assert(g.base_alive == false);
    assert(g.game_over == true);

    printf("  ✓ Eagle destruction immediately triggers GAME OVER state OK\n");
}

static void test_espnow_packet_serialization(void) {
    printf("[TEST 8] Testing ESP-NOW Wireless Co-op Packet Serialization...\n");
    bc_game_t g;
    bc_init_game(&g, 1);

    // 1. 测试 Beacon 握手包
    bc_net_packet_t pkt;
    uint8_t mac[6] = {0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC};
    size_t sz = bc_pack_beacon(&pkt, mac, 1, 1);
    assert(sz == sizeof(bc_net_packet_t));
    assert(pkt.magic == BC_NET_MAGIC);
    assert(pkt.pkt_type == BC_PKT_BEACON);
    assert(memcmp(pkt.payload.beacon.mac, mac, 6) == 0);
    assert(pkt.payload.beacon.stage == 1);
    assert(pkt.payload.beacon.role == 1);

    // 2. 测试 2P 输入上报包
    sz = bc_pack_input(&pkt, (uint8_t)BC_DIR_RIGHT, 1, 1);
    assert(sz == sizeof(bc_net_packet_t));
    assert(pkt.pkt_type == BC_PKT_CLIENT_INPUT);
    assert(pkt.payload.input.dir == (uint8_t)BC_DIR_RIGHT);
    assert(pkt.payload.input.moving == 1);
    assert(pkt.payload.input.fire == 1);

    // 3. 测试 Host 全局状态同步包
    g.p1.x = 120;
    g.p1.y = 80;
    g.p1.tier = 3;
    g.score = 2500;
    sz = bc_pack_sync(&pkt, &g);
    assert(sz == sizeof(bc_net_packet_t));

    // 在 Client 端解包
    bc_game_t client_g;
    memset(&client_g, 0, sizeof(client_g));
    bool ok = bc_unpack_sync(&client_g, &pkt);
    assert(ok == true);
    assert(client_g.p1.x == 120);
    assert(client_g.p1.y == 80);
    assert(client_g.p1.tier == 3);
    assert(client_g.score == 2500);

    printf("  ✓ ESP-NOW beacon, input, and state-sync packet codec verified OK\n");
}

int main(void) {
    printf("\n=======================================================\n");
    printf("   Battle City Neo (经典坦克大战 1990) Unit Test Suite   \n");
    printf("=======================================================\n");

    test_initialization();
    test_sub_brick_destruction();
    test_steel_and_tier4_pierce();
    test_movement_and_grid_snap();
    test_bullet_clash();
    test_item_powerups();
    test_base_destruction_and_game_over();
    test_espnow_packet_serialization();

    printf("\n=======================================================\n");
    printf("   ✓ [PASS] All 8 Battle City Neo Unit Tests Passed!   \n");
    printf("=======================================================\n\n");
    return 0;
}
