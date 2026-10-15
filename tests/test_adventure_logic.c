#include <assert.h>
#include <stdio.h>
#include "adventure_logic.h"

static void test_initialization(void)
{
    adventure_game_t g;
    adventure_logic_init(&g);

    assert(g.player.lives == 3);
    assert(g.player.stamina == 100.0f);
    assert(g.player.score == 0);
    assert(g.player.weapon == ADV_WEAPON_AXE);
    assert(g.player.is_alive == true);
    assert(g.player.on_ground == true);
    assert(!g.player.is_jumping);
    assert(!g.game_over);
    assert(g.player.facing == 1);
    assert(g.player.y == ADVENTURE_GROUND_Y - (float)g.player.h);

    for (int i = 0; i < ADVENTURE_MAX_PROJECTILES; i++) {
        assert(!g.projectiles[i].active);
    }
    for (int i = 0; i < ADVENTURE_MAX_ENEMIES; i++) {
        assert(!g.enemies[i].active);
    }
    for (int i = 0; i < ADVENTURE_MAX_ITEMS; i++) {
        assert(!g.items[i].active);
    }

    printf("  ✓ Initialization OK (Coordinates, 3 Lives, 100 Stamina, Axe Ready)\n");
}

static void test_movement_and_jump_physics(void)
{
    adventure_game_t g;
    adventure_logic_init(&g);

    // 1. 测试向左退后与左边缘阻挡
    for (int i = 0; i < 30; i++) {
        adventure_logic_action(&g, ADV_ACTION_UP);
    }
    assert(g.player.x == 0.0f);
    assert(g.player.facing == -1);

    // 2. 测试向右前进与右边缘阻挡
    for (int i = 0; i < 40; i++) {
        adventure_logic_action(&g, ADV_ACTION_DOWN);
    }
    float max_x = (float)(ADVENTURE_SCREEN_W - g.player.w);
    assert(g.player.x == max_x);
    assert(g.player.facing == 1);

    // 3. 测试起跳垂直速度与空中禁止二段跳
    g.player.x = 50.0f;
    bool jumped = adventure_logic_action(&g, ADV_ACTION_JUMP);
    assert(jumped);
    assert(g.player.is_jumping);
    assert(!g.player.on_ground);
    assert(g.player.vy < 0.0f);

    bool jumped_again = adventure_logic_action(&g, ADV_ACTION_JUMP);
    assert(!jumped_again);

    // 4. 重力物理模拟：上升后下落，最终精准着陆
    float initial_y = g.player.y;
    adventure_logic_update(&g, 100);
    assert(g.player.y < initial_y); // 垂直上升

    for (int step = 0; step < 80; step++) {
        adventure_logic_update(&g, 20);
        if (g.player.on_ground) break;
    }

    assert(g.player.on_ground);
    assert(!g.player.is_jumping);
    assert(g.player.vy == 0.0f);
    assert(g.player.y == ADVENTURE_GROUND_Y - (float)g.player.h);

    printf("  ✓ Movement (UP/DOWN) & Jump Gravity Landing Physics OK\n");
}

static void test_weapons_and_combat(void)
{
    adventure_game_t g;

    // 1. 石斧：重力抛物线轨迹，触敌造成伤害并销毁
    adventure_logic_init(&g);
    adventure_logic_set_weapon(&g, ADV_WEAPON_AXE);
    g.player.x = 30.0f;
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_SNAIL, 150.0f, ADVENTURE_GROUND_Y - 14.0f);

    bool threw_axe = adventure_logic_action(&g, ADV_ACTION_THROW);
    assert(threw_axe);
    assert(g.projectiles[0].active);
    assert(g.projectiles[0].gravity > 0.0f);

    float vy_prev = g.projectiles[0].vy;
    adventure_logic_update(&g, 50);
    assert(g.projectiles[0].vy > vy_prev); // 重力加速下沉

    for (int i = 0; i < 50; i++) {
        adventure_logic_update(&g, 20);
        if (!g.enemies[0].active) break;
    }
    assert(!g.enemies[0].active);
    assert(!g.projectiles[0].active); // 普通武器触敌销毁
    assert(g.player.score == 100);
    printf("  ✓ Parabolic Stone Axe Trajectory & Hit OK\n");

    // 2. 飞刀：水平高速直线，触敌造成伤害并销毁
    adventure_logic_init(&g);
    adventure_logic_set_weapon(&g, ADV_WEAPON_KNIFE);
    g.player.x = 20.0f;
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_FROG, 140.0f, g.player.y + 4.0f);

    bool threw_knife = adventure_logic_action(&g, ADV_ACTION_THROW);
    assert(threw_knife);
    assert(g.projectiles[0].active);
    assert(g.projectiles[0].gravity == 0.0f);
    float knife_y0 = g.projectiles[0].y;

    adventure_logic_update(&g, 60);
    assert(g.projectiles[0].y == knife_y0); // 严格水平直线飞行

    for (int i = 0; i < 40; i++) {
        adventure_logic_update(&g, 20);
        if (!g.enemies[0].active) break;
    }
    assert(!g.enemies[0].active);
    assert(!g.projectiles[0].active);
    assert(g.player.score == 200);
    printf("  ✓ Fast Straight Knife Trajectory & Hit OK\n");

    // 3. 月亮刃：水平穿透飞刃，贯穿多个敌人不消失
    adventure_logic_init(&g);
    adventure_logic_set_weapon(&g, ADV_WEAPON_MOON_BLADE);
    g.player.x = 20.0f;
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_BIRD, 80.0f, g.player.y + 4.0f);
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_BIRD, 140.0f, g.player.y + 4.0f);

    bool threw_moon = adventure_logic_action(&g, ADV_ACTION_THROW);
    assert(threw_moon);
    assert(g.projectiles[0].active);
    assert(g.projectiles[0].piercing == true);

    // 击中第一个飞鸟
    for (int i = 0; i < 30; i++) {
        adventure_logic_update(&g, 20);
        if (!g.enemies[0].active) break;
    }
    assert(!g.enemies[0].active);
    assert(g.projectiles[0].active); // 月亮刃不销毁！
    assert(g.projectiles[0].hits >= 1);

    // 继续飞行击中第二个飞鸟
    for (int i = 0; i < 30; i++) {
        adventure_logic_update(&g, 20);
        if (!g.enemies[1].active) break;
    }
    assert(!g.enemies[1].active);
    assert(g.projectiles[0].hits >= 2);
    printf("  ✓ Piercing Moon Blade Multi-Enemy Penetration OK\n");
}

static void test_fruit_supply_stamina_recovery(void)
{
    adventure_game_t g;
    adventure_logic_init(&g);

    // 1. 香蕉补给：+20 体力，+100 积分
    g.player.stamina = 40.0f;
    adventure_logic_spawn_item(&g, ADV_ITEM_BANANA, g.player.x, g.player.y);
    int prev_score = g.player.score;

    adventure_logic_update(&g, 20);
    assert(g.player.stamina >= 59.9f && g.player.stamina <= 60.1f);
    assert(g.player.score == prev_score + 100);
    assert(!g.items[0].active);

    // 2. 菠萝补给：+50 体力，上限钳制在 100
    g.player.stamina = 70.0f;
    adventure_logic_spawn_item(&g, ADV_ITEM_PINEAPPLE, g.player.x, g.player.y);
    prev_score = g.player.score;

    adventure_logic_update(&g, 20);
    assert(g.player.stamina == 100.0f);
    assert(g.player.score == prev_score + 300);
    assert(!g.items[0].active);

    printf("  ✓ Fruit Supply (Banana/Pineapple) Stamina Recovery & Score OK\n");
}

static void test_stamina_depletion_and_damage(void)
{
    adventure_game_t g;
    adventure_logic_init(&g);

    // 1. 体力自然耗尽扣除生命并重生满体力
    g.player.stamina = 1.0f;
    g.player.lives = 3;
    adventure_logic_update(&g, 500); // 消耗 > 1.25 点体力，触发耗尽扣血

    assert(g.player.lives == 2);
    assert(g.player.stamina >= 95.0f && g.player.stamina <= 100.0f);
    assert(g.player.invincible_timer_ms > 0);
    assert(g.events.player_hurt == true);
    printf("  ✓ Stamina Depletion Triggers Life Deduction & Respawn OK\n");

    // 2. 无敌帧期间免疫怪物碰撞
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_SNAIL, g.player.x, g.player.y);
    adventure_logic_update(&g, 20);
    assert(g.player.lives == 2); // 处于无敌状态，不重复扣血

    // 3. 无敌帧结束后碰撞怪物扣血
    g.player.invincible_timer_ms = 0;
    adventure_logic_update(&g, 20);
    assert(g.player.lives == 1);
    assert(g.player.invincible_timer_ms > 0);
    printf("  ✓ Monster Collision Damage & Invincibility Protection OK\n");

    // 4. 生命值为 0 触发 GAME OVER
    g.player.lives = 1;
    g.player.invincible_timer_ms = 0;
    g.player.stamina = 0.5f;
    adventure_logic_update(&g, 300);

    assert(g.player.lives == 0);
    assert(!g.player.is_alive);
    assert(g.game_over == true);
    assert(g.events.game_over == true);
    printf("  ✓ Zero Lives Triggers Game Over State OK\n");
}

static void test_stomp_combo_and_egg(void)
{
    adventure_game_t g;
    adventure_logic_init(&g);

    // 下落踩踏：从敌人头顶落下应击杀并反弹，而不是扣血
    g.player.x = 80.0f;
    g.player.y = ADVENTURE_GROUND_Y - 36.0f;
    g.player.vy = 180.0f;
    g.player.on_ground = false;
    g.player.is_jumping = true;
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_SNAIL, 80.0f, ADVENTURE_GROUND_Y - 14.0f);

    adventure_logic_update(&g, 20);
    assert(!g.enemies[0].active);
    assert(g.events.stomp);
    assert(g.player.lives == 3);
    assert(g.player.combo == 1);
    assert(g.player.score == 150); // 100 + 50 stomp bonus, combo 1x
    assert(g.player.vy < 0.0f);    // 反弹向上

    // 连击窗口内再杀一只，分数按 2x 计算
    g.player.x = 40.0f;
    g.player.y = ADVENTURE_GROUND_Y - (float)g.player.h;
    g.player.vy = 0.0f;
    g.player.on_ground = true;
    adventure_logic_set_weapon(&g, ADV_WEAPON_KNIFE);
    g.shoot_cooldown_ms = 0;
    adventure_logic_spawn_enemy(&g, ADV_ENEMY_FROG, 90.0f, g.player.y + 4.0f);
    assert(adventure_logic_throw(&g));
    for (int i = 0; i < 40; i++) {
        adventure_logic_update(&g, 20);
        if (g.player.combo >= 2) break;
    }
    assert(g.player.combo == 2);
    assert(g.player.score == 150 + 200 * 2);
    printf("  ✓ Stomp Bounce & Combo Multiplier OK\n");

    // 恐龙蛋：额外生命
    adventure_logic_init(&g);
    g.player.lives = 2;
    adventure_logic_spawn_item(&g, ADV_ITEM_EGG, g.player.x, g.player.y);
    adventure_logic_update(&g, 20);
    assert(g.player.lives == 3);
    assert(g.events.extra_life);
    assert(g.player.score == 500);
    printf("  ✓ Egg Extra Life Pickup OK\n");

    adventure_logic_restart(&g);
    assert(g.player.lives == 3);
    assert(g.player.combo == 0);
    assert(!g.game_over);
    printf("  ✓ Restart Resets Run State OK\n");
}

int main(void)
{
    printf("[TEST] Testing Adventure Island Logic...\n");
    test_initialization();
    test_movement_and_jump_physics();
    test_weapons_and_combat();
    test_fruit_supply_stamina_recovery();
    test_stamina_depletion_and_damage();
    test_stomp_combo_and_egg();
    printf("[PASS] All Adventure Island Unit Tests Passed Successfully!\n");
    return 0;
}
