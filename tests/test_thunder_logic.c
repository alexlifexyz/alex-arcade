#include <assert.h>
#include <stdio.h>
#include "thunder_logic.h"

int main(void)
{
    printf("[TEST] Testing Thunder Striker Logic...\n");

    thunder_game_t g;
    thunder_init(&g);

    // 1. 验证初始状态 (5 HP, 2 核弹, 0 护盾, 基础平民战机)
    assert(g.player_hp == 5);
    assert(g.player_max_hp == 5);
    assert(g.shield == 0);
    assert(g.bombs == 2);
    assert(g.weapon_level == 0);
    assert(g.has_wingman == false);
    assert(g.buff_timer == 0);
    assert(!g.paused);
    assert(g.score == 0);
    assert(!g.game_over);
    printf("  ✓ Initialization OK (5 HP, 2 Bombs, Base Guns, No Buff)\n");

    // 2. 验证全向 4 向移动与边界限制 (上下左右)
    for (int i = 0; i < 30; i++) thunder_move_left(&g);
    assert(g.player_x >= 4.0f);

    for (int i = 0; i < 40; i++) thunder_move_right(&g);
    assert(g.player_x <= SCREEN_W - g.player_w - 4.0f);

    for (int i = 0; i < 30; i++) thunder_move_up(&g);
    assert(g.player_y >= 45.0f);

    for (int i = 0; i < 40; i++) thunder_move_down(&g);
    assert(g.player_y <= 275.0f);
    printf("  ✓ 4-Direction Movement & Screen Clamping (Up/Down/Left/Right) OK\n");

    // 3. 验证暂停功能
    thunder_toggle_pause(&g);
    assert(g.paused == true);
    float before_y = g.player_y;
    thunder_move_up(&g);
    assert(g.player_y == before_y); // 暂停时禁止移动
    thunder_step(&g);
    assert(g.wave_tick == 0);       // 暂停时游戏时钟冻结
    thunder_toggle_pause(&g);
    assert(g.paused == false);
    printf("  ✓ Game Pause & Freeze Logic OK\n");

    // 4. 验证开局基础平民机枪双发 (伤害 1，无秒杀)
    g.shoot_timer = THUNDER_SHOOT_INTERVAL - 1;
    thunder_step(&g);
    int bullet_count = 0;
    for (int i = 0; i < THUNDER_MAX_BULLETS; i++) {
        if (g.bullets[i].active) bullet_count++;
    }
    assert(bullet_count == 2); // 基础双发细光
    printf("  ✓ Base 2-Way Machine Gun Spawning OK\n");

    // 4.1 验证捡法宝强化与限时倒计时衰减 (15秒后自动复原)
    g.items[0].active = true;
    g.items[0].type = ITEM_TYPE_POWER;
    g.items[0].w = 14;
    g.items[0].h = 14;
    g.items[0].x = g.player_x;
    g.items[0].y = g.player_y;
    thunder_step(&g);
    assert(g.weapon_level == 2);
    assert(g.has_wingman == true);
    assert(g.buff_timer > 280); // 10秒倒计时 (300 ticks)
    // 推进倒计时至过期
    g.buff_timer = 1;
    thunder_step(&g);
    assert(g.weapon_level == 0); // 自动复原基础状态
    assert(g.has_wingman == false);
    printf("  ✓ Timed Powerup & Expiry Reset Logic OK\n");

    // 5. 验证 S型波与烈焰弹道
    g.weapon_style = WEAPON_STYLE_WAVE;
    g.weapon_level = 2;
    g.buff_timer = 300;
    g.shoot_timer = THUNDER_SHOOT_INTERVAL - 1;
    thunder_step(&g);
    bool found_wave = false;
    for (int i = 0; i < THUNDER_MAX_BULLETS; i++) {
        if (g.bullets[i].active && g.bullets[i].traj == BULLET_TRAJ_WAVE) {
            found_wave = true;
            break;
        }
    }
    assert(found_wave);
    printf("  ✓ S-Curve Wavy Bullet Trajectory OK\n");

    // 6. 验证高能子弹秒杀飞龙 (4 HP)
    g.weapon_level = 3;
    g.weapon_style = WEAPON_STYLE_VULCAN;
    g.enemies[1].active = true;
    g.enemies[1].type = ENEMY_WYVERN;
    g.enemies[1].hp = 4;
    g.enemies[1].w = 32;
    g.enemies[1].h = 28;
    g.enemies[1].x = 100.0f;
    g.enemies[1].y = 100.0f;
    g.bullets[0].active = true;
    g.bullets[0].x = 110.0f;
    g.bullets[0].y = 105.0f;
    g.bullets[0].w = 8;
    g.bullets[0].h = 16;
    g.bullets[0].vx = 0;
    g.bullets[0].vy = -14.0f;
    g.bullets[0].dmg = 4;
    g.bullets[0].traj = BULLET_TRAJ_LINE;
    g.bullets[0].piercing = false;
    thunder_step(&g);
    assert(!g.enemies[1].active);
    printf("  ✓ High-Tier Bullet One-Shot Instakill (4 HP Wyvern) OK\n");

    // 7. 验证护盾抵挡伤害
    g.shield = 1;
    g.player_hp = 5;
    g.invincible_timer = 0;
    g.enemies[0].active = true;
    g.enemies[0].w = 20;
    g.enemies[0].h = 20;
    g.enemies[0].x = g.player_x;
    g.enemies[0].y = g.player_y;
    thunder_step(&g);
    assert(g.shield == 0);
    assert(g.player_hp == 5); // 护盾吸收伤害，血量不减！
    printf("  ✓ Ion Shield Damage Absorption OK\n");

    // 8. 验证全屏核弹清屏效果
    g.bombs = 2;
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[1].active = true;
    g.enemies[0].active = true;
    g.enemies[0].hp = 5;
    assert(thunder_use_bomb(&g) == true);
    assert(g.bombs == 1);
    assert(!g.enemy_bullets[0].active);
    assert(!g.enemy_bullets[1].active);
    assert(!g.enemies[0].active);
    printf("  ✓ Screen-Clearing Mega Bomb OK\n");

    // 9. 验证玩家阵亡
    g.shield = 0;
    g.invincible_timer = 0;
    g.player_hp = 1;
    g.enemies[0].active = true;
    g.enemies[0].w = 20;
    g.enemies[0].h = 20;
    g.enemies[0].x = g.player_x;
    g.enemies[0].y = g.player_y;
    thunder_step(&g);
    assert(g.player_hp == 0);
    assert(g.game_over == true);
    printf("  ✓ Damage & Game Over State OK\n");

    printf("[PASS] All Thunder Striker Unit Tests Passed!\n");
    return 0;
}
