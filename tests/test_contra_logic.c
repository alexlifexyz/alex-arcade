#include <assert.h>
#include <stdio.h>
#include <math.h>
#include "contra_logic.h"

static void test_initialization(void)
{
    printf("  -> Testing contra initialization...\n");
    contra_game_t g;
    contra_logic_init(&g);

    assert(g.player_hp == 3);
    assert(g.player_max_hp == 3);
    assert(g.lives == 3);
    assert(g.invincible_timer_ms == 0);
    assert(g.is_crouching == false);
    assert(g.is_jumping == false);
    assert(g.is_grounded == true);
    assert(g.weapon_type == CONTRA_WEAPON_NORMAL);
    assert(g.player_w == CONTRA_PLAYER_WIDTH);
    assert(g.player_h == CONTRA_PLAYER_STAND_H);
    assert(g.player_y == CONTRA_GROUND_Y - (float)CONTRA_PLAYER_STAND_H);
    assert(g.score == 0);
    assert(!g.game_over);
    assert(!g.victory);
    printf("  ✓ Initialization OK\n");
}

static void test_movement_and_crouch(void)
{
    printf("  -> Testing movement, jumping, and crouching...\n");
    contra_game_t g;
    contra_logic_init(&g);

    // 1. 测试左右移动与边界限制
    contra_logic_move_left(&g);
    assert(g.facing_dir == -1);
    assert(g.player_vx < 0.0f);
    // 更新多次，移动到最左侧
    for (int i = 0; i < 30; i++) {
        contra_logic_update(&g, 20);
    }
    assert(g.player_x == 0.0f);

    contra_logic_move_right(&g);
    assert(g.facing_dir == 1);
    assert(g.player_vx > 0.0f);
    for (int i = 0; i < 150; i++) {
        contra_logic_update(&g, 20);
    }
    assert(g.player_x == (float)(CONTRA_SCREEN_W - g.player_w));
    contra_logic_stop_x(&g);
    assert(g.player_vx == 0.0f);

    // 2. 测试跳跃与重力回落
    g.player_x = 50.0f;
    contra_logic_btn_up(&g, true);
    contra_logic_btn_up(&g, false);
    assert(g.is_jumping == true);
    assert(g.is_grounded == false);
    assert(g.player_vy < 0.0f);

    // 向上跳跃过程
    float initial_y = g.player_y;
    contra_logic_update(&g, 100);
    assert(g.player_y < initial_y); // 升空

    // 持续下落直到着地
    for (int i = 0; i < 50; i++) {
        contra_logic_update(&g, 20);
    }
    assert(g.is_grounded == true);
    assert(g.is_jumping == false);
    assert(g.player_y == CONTRA_GROUND_Y - (float)CONTRA_PLAYER_STAND_H);

    // 3. 测试下蹲与子弹闪避机制
    // 站立时：高 30，Y 坐标 240~270
    // 下蹲时：高 16，Y 坐标 254~270
    // 在 Y=246 处发射高度为 4 的敌方平飞子弹 (Y 范围 246~250)
    // 站立状态应命中，下蹲状态应完美躲过！

    // 情况 A：站立状态受击
    g.invincible_timer_ms = 0;
    g.player_hp = 3;
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x + 5.0f;
    g.enemy_bullets[0].y = 246.0f;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].vx = -50.0f;
    g.enemy_bullets[0].vy = 0.0f;
    g.enemy_bullets[0].dmg = 1;
    contra_logic_update(&g, 10);
    assert(g.player_hp == 2); // 站立被击中！
    assert(g.enemy_bullets[0].active == false);

    // 情况 B：下蹲状态闪避
    g.invincible_timer_ms = 0;
    g.player_hp = 3;
    contra_logic_btn_down(&g, true); // 按下 DOWN 键下蹲
    assert(g.is_crouching == true);
    assert(g.player_h == CONTRA_PLAYER_CROUCH_H);
    assert(g.player_y == CONTRA_GROUND_Y - (float)CONTRA_PLAYER_CROUCH_H);

    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x + 5.0f;
    g.enemy_bullets[0].y = 246.0f;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].vx = -50.0f;
    g.enemy_bullets[0].vy = 0.0f;
    g.enemy_bullets[0].dmg = 1;
    contra_logic_update(&g, 10);
    assert(g.player_hp == 3); // 成功躲过，无伤！
    assert(g.enemy_bullets[0].active == true);

    contra_logic_btn_down(&g, false); // 松开恢复站立
    assert(g.is_crouching == false);
    assert(g.player_h == CONTRA_PLAYER_STAND_H);

    printf("  ✓ Movement, Jump Gravity & Crouch Bullet Evasion OK\n");
}

static void test_weapons_and_bullets(void)
{
    printf("  -> Testing weapons, bullet pooling, and trajectories...\n");
    contra_game_t g;
    contra_logic_init(&g);

    // 1. 普通枪 Normal Gun 单发
    g.weapon_type = CONTRA_WEAPON_NORMAL;
    assert(contra_logic_fire(&g) == true);
    assert(g.snd.snd_fire == true);
    assert(g.player_bullets[0].active == true);
    assert(g.player_bullets[0].dmg == 1);
    assert(g.player_bullets[0].piercing == false);
    assert(g.player_bullets[0].vx == 320.0f);
    assert(g.player_bullets[0].vy == 0.0f);
    assert(g.fire_cooldown_ms == 180);
    // 冷却期间无法连开
    assert(contra_logic_fire(&g) == false);

    // 2. S 弹 Spread Gun 3 向扇形散射
    contra_logic_init(&g);
    g.weapon_type = CONTRA_WEAPON_SPREAD;
    assert(contra_logic_fire(&g) == true);
    assert(g.snd.snd_spread == true);
    int spread_bullets = 0;
    bool has_up = false, has_center = false, has_down = false;
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        if (g.player_bullets[i].active) {
            spread_bullets++;
            if (g.player_bullets[i].vy < -10.0f) has_up = true;
            else if (g.player_bullets[i].vy > 10.0f) has_down = true;
            else has_center = true;
        }
    }
    assert(spread_bullets == 3);
    assert(has_up && has_center && has_down);

    // 3. L 弹 Laser 贯穿高伤害
    contra_logic_init(&g);
    g.weapon_type = CONTRA_WEAPON_LASER;
    assert(contra_logic_fire(&g) == true);
    assert(g.snd.snd_laser == true);
    assert(g.player_bullets[0].active == true);
    assert(g.player_bullets[0].dmg == 4);
    assert(g.player_bullets[0].piercing == true);

    // 验证 L 弹穿透多个敌人
    int e1 = contra_logic_spawn_enemy(&g, CONTRA_ENEMY_TURRET, 80.0f, g.player_bullets[0].y - 5.0f);
    int e2 = contra_logic_spawn_enemy(&g, CONTRA_ENEMY_TURRET, 140.0f, g.player_bullets[0].y - 5.0f);
    assert(e1 >= 0 && e2 >= 0);
    assert(g.enemies[e1].hp == 6);
    assert(g.enemies[e2].hp == 6);

    // 让激光穿透第一个敌人
    g.player_bullets[0].x = 82.0f;
    contra_logic_update(&g, 10);
    assert(g.enemies[e1].hp == 2); // 6 - 4 = 2
    assert(g.player_bullets[0].active == true); // 贯穿弹保持存活！

    // 让激光继续前进穿透第二个敌人
    g.player_bullets[0].x = 142.0f;
    contra_logic_update(&g, 10);
    assert(g.enemies[e2].hp == 2); // 6 - 4 = 2
    assert(g.player_bullets[0].active == true); // 仍然存活！

    // 4. M 弹 Machine Gun 高射速密集开火
    contra_logic_init(&g);
    g.weapon_type = CONTRA_WEAPON_MACHINEGUN;
    g.key_ok = true; // 按住开火键
    assert(contra_logic_fire(&g) == true);
    assert(g.fire_cooldown_ms == 75); // 75ms 超短冷却

    // 模拟 300ms，应当连射多发机枪弹
    for (int t = 0; t < 6; t++) {
        contra_logic_update(&g, 50);
    }
    int m_count = 0;
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        if (g.player_bullets[i].active && g.player_bullets[i].weapon_type == CONTRA_WEAPON_MACHINEGUN) {
            m_count++;
        }
    }
    assert(m_count >= 4);

    // 5. 子弹对象池越界回收测试
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        if (g.player_bullets[i].active) {
            g.player_bullets[i].x = (float)CONTRA_SCREEN_W + 50.0f; // 强制越界
        }
    }
    contra_logic_update(&g, 10);
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        assert(g.player_bullets[i].active == false); // 全部被回收
    }

    printf("  ✓ Normal, Spread-3, Laser Piercing, Machine Gun & Pool Recycle OK\n");
}

static void test_capsule_and_upgrade(void)
{
    printf("  -> Testing flying capsule and badge upgrade...\n");
    contra_game_t g;
    contra_logic_init(&g);

    // 1. 生成飞行武器胶囊，携带 S 弹徽章
    int c_idx = contra_logic_spawn_capsule(&g, 120.0f, 60.0f, CONTRA_BADGE_S);
    assert(c_idx >= 0);
    assert(g.enemies[c_idx].active == true);
    assert(g.enemies[c_idx].hp == 1);
    assert(g.enemies[c_idx].drop_badge == CONTRA_BADGE_S);

    // 更新模拟正弦飞行
    float prev_x = g.enemies[c_idx].x;
    contra_logic_update(&g, 20);
    assert(g.enemies[c_idx].x < prev_x);

    // 2. 发射子弹击落胶囊
    g.player_bullets[0].active = true;
    g.player_bullets[0].x = g.enemies[c_idx].x;
    g.player_bullets[0].y = g.enemies[c_idx].y;
    g.player_bullets[0].w = 6;
    g.player_bullets[0].h = 6;
    g.player_bullets[0].dmg = 1;
    g.player_bullets[0].piercing = false;

    contra_logic_update(&g, 10);
    assert(g.enemies[c_idx].active == false); // 胶囊被击毁
    assert(g.snd.snd_explode == true);

    // 3. 验证徽章道具掉落
    bool found_item = false;
    int item_idx = -1;
    for (int i = 0; i < CONTRA_MAX_ITEMS; i++) {
        if (g.items[i].active && g.items[i].badge == CONTRA_BADGE_S) {
            found_item = true;
            item_idx = i;
            break;
        }
    }
    assert(found_item && item_idx >= 0);

    // 4. 道具掉落地面并被玩家拾取升级
    while (g.items[item_idx].vy > 0.0f) {
        contra_logic_update(&g, 30);
    }
    assert(g.items[item_idx].y == CONTRA_GROUND_Y - (float)g.items[item_idx].h);

    // 玩家移动过去拾取
    g.player_x = g.items[item_idx].x;
    contra_logic_update(&g, 10);
    assert(g.items[item_idx].active == false); // 道具被拾取
    assert(g.weapon_type == CONTRA_WEAPON_SPREAD); // 武器成功升级为 Spread 弹！
    assert(g.snd.snd_upgrade == true);
    assert(g.score >= 700); // 胶囊200 + 道具500

    // 5. 验证 L 弹徽章升级
    contra_logic_spawn_item(&g, CONTRA_BADGE_L, g.player_x, g.player_y);
    contra_logic_update(&g, 10);
    assert(g.weapon_type == CONTRA_WEAPON_LASER);

    // 6. 验证 M 弹徽章升级
    contra_logic_spawn_item(&g, CONTRA_BADGE_M, g.player_x, g.player_y);
    contra_logic_update(&g, 10);
    assert(g.weapon_type == CONTRA_WEAPON_MACHINEGUN);

    // 7. 落地徽章自动滑向玩家（无前进键也能吃到 L/P）
    contra_logic_init(&g);
    g.player_x = 40.0f;
    int far = contra_logic_spawn_item(&g, CONTRA_BADGE_L, 180.0f, CONTRA_GROUND_Y - 12.0f);
    assert(far >= 0);
    g.items[far].vy = 0.0f;
    g.items[far].y = CONTRA_GROUND_Y - (float)g.items[far].h;
    float far_x = g.items[far].x;
    for (int i = 0; i < 120; i++) {
        contra_logic_update(&g, 20);
        if (!g.items[far].active) break;
    }
    assert(!g.items[far].active);
    assert(g.weapon_type == CONTRA_WEAPON_LASER);
    assert(far_x > g.player_x); // 确实是从远处滑过来的
    printf("  ✓ Flying Capsule Shootdown, S/L/M Upgrades & Ground Badge Magnet OK\n");
}

static void test_turret_and_boss(void)
{
    printf("  -> Testing bunker turret destruction and multi-phase BOSS...\n");
    contra_game_t g;
    contra_logic_init(&g);

    // 1. 地堡旋转炮台测试
    int t_idx = contra_logic_spawn_enemy(&g, CONTRA_ENEMY_TURRET, 180.0f, CONTRA_GROUND_Y - 24.0f);
    assert(t_idx >= 0);
    assert(g.enemies[t_idx].hp == 6);

    // 模拟炮台攻击发射子弹
    g.enemies[t_idx].attack_timer_ms = 10;
    contra_logic_update(&g, 20);
    bool enemy_shot = false;
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        if (g.enemy_bullets[i].active) {
            enemy_shot = true;
            assert(g.enemy_bullets[i].vx < 0.0f); // 向左侧玩家射击
            break;
        }
    }
    assert(enemy_shot);

    // 子弹击中炮台扣血直至被毁
    for (int hit = 0; hit < 6; hit++) {
        g.player_bullets[0].active = true;
        g.player_bullets[0].x = g.enemies[t_idx].x;
        g.player_bullets[0].y = g.enemies[t_idx].y;
        g.player_bullets[0].w = 4;
        g.player_bullets[0].h = 4;
        g.player_bullets[0].dmg = 1;
        g.player_bullets[0].piercing = false;
        contra_logic_update(&g, 10);
    }
    assert(g.enemies[t_idx].active == false); // 炮台被彻底击毁
    assert(g.snd.snd_explode == true);

    // 2. 关底机械 BOSS 多段血量与攻击阶段测试
    int boss_idx = contra_logic_spawn_boss(&g, 180.0f, 100.0f, 150);
    assert(boss_idx >= 0);
    contra_enemy_t *boss = &g.enemies[boss_idx];
    assert(boss->hp == 150);
    assert(boss->boss_phase == BOSS_PHASE_1_ARMORED);

    // 阶段 1: 双副炮掩护开火 (150 HP)
    boss->attack_timer_ms = 10;
    contra_logic_update(&g, 20);
    int p1_bullets = 0;
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        if (g.enemy_bullets[i].active) p1_bullets++;
    }
    assert(p1_bullets >= 2); // 阶段1发射双副炮

    // 扣血 55 点 (HP 降为 95)，进入阶段 2 (Exposed Core)
    boss->hp = 95;
    contra_logic_update(&g, 10);
    assert(boss->boss_phase == BOSS_PHASE_2_EXPOSED);

    // 阶段 2 攻击: 扇形散射
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) g.enemy_bullets[i].active = false;
    boss->attack_timer_ms = 10;
    contra_logic_update(&g, 20);
    int p2_bullets = 0;
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        if (g.enemy_bullets[i].active) p2_bullets++;
    }
    assert(p2_bullets >= 3); // 阶段2发射 3 向散射

    // 扣血 50 点 (HP 降为 45)，进入阶段 3 (Enraged Overdrive)
    boss->hp = 45;
    contra_logic_update(&g, 10);
    assert(boss->boss_phase == BOSS_PHASE_3_ENRAGED);

    // 阶段 3 攻击: 超频狂暴全弹发射
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) g.enemy_bullets[i].active = false;
    boss->attack_timer_ms = 10;
    contra_logic_update(&g, 20);
    int p3_bullets = 0;
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        if (g.enemy_bullets[i].active) p3_bullets++;
    }
    assert(p3_bullets >= 3);

    // 最后一击摧毁 BOSS (HP 归 0)
    boss->hp = 2;
    g.player_bullets[0].active = true;
    g.player_bullets[0].x = boss->x;
    g.player_bullets[0].y = boss->y;
    g.player_bullets[0].w = 8;
    g.player_bullets[0].h = 8;
    g.player_bullets[0].dmg = 4;
    g.player_bullets[0].piercing = false;

    contra_logic_update(&g, 10);
    assert(boss->active == false);
    assert(boss->boss_phase == BOSS_PHASE_DEAD);
    assert(g.victory == true); // 击败关底 BOSS，通关胜利！
    assert(g.snd.snd_boss_dead == true);
    assert(g.score >= 5000);

    printf("  ✓ Turret Destruction & BOSS Multi-Phase Transitions & Victory OK\n");
}

static void test_damage_and_invincibility(void)
{
    printf("  -> Testing player damage, invincibility frames, lives & bombs...\n");
    contra_game_t g;
    contra_logic_init(&g);

    assert(g.player_hp == 3);
    assert(g.lives == 3);
    assert(g.invincible_timer_ms == 0);

    // 1. 受到敌方子弹伤害与无敌帧触发
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x;
    g.enemy_bullets[0].y = g.player_y;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].dmg = 1;

    contra_logic_update(&g, 10);
    assert(g.player_hp == 2);
    assert(g.invincible_timer_ms > 0);
    assert(g.snd.snd_player_hit == true);

    // 2. 在无敌帧期间，再次受到攻击不受伤害
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x;
    g.enemy_bullets[0].y = g.player_y;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].dmg = 1;

    contra_logic_update(&g, 50);
    assert(g.player_hp == 2); // 维持 2 点血量，无敌保护生效！
    assert(g.enemy_bullets[0].active == false); // 子弹被抵消

    // 3. 等待无敌保护时间结束
    for (int i = 0; i < 60; i++) {
        contra_logic_update(&g, 30);
    }
    assert(g.invincible_timer_ms == 0);

    // 4. 再次受创直至失去一条命并重生
    g.player_hp = 1;
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x;
    g.enemy_bullets[0].y = g.player_y;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].dmg = 1;

    contra_logic_update(&g, 10);
    assert(g.lives == 2);
    assert(g.player_hp == 3); // 满血重生
    assert(g.invincible_timer_ms > 0); // 重生保护帧

    // 5. 扣完所有生命触发游戏结束
    g.lives = 1;
    g.player_hp = 1;
    g.invincible_timer_ms = 0;
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[0].x = g.player_x;
    g.enemy_bullets[0].y = g.player_y;
    g.enemy_bullets[0].w = 4;
    g.enemy_bullets[0].h = 4;
    g.enemy_bullets[0].dmg = 1;

    contra_logic_update(&g, 10);
    assert(g.lives == 0);
    assert(g.game_over == true);

    // 6. 炸药投掷清屏测试
    contra_logic_init(&g);
    assert(g.bombs == 2);
    contra_logic_spawn_enemy(&g, CONTRA_ENEMY_TURRET, 100.0f, 200.0f);
    g.enemy_bullets[0].active = true;
    g.enemy_bullets[1].active = true;

    assert(contra_logic_throw_bomb(&g) == true);
    assert(g.bombs == 1);
    assert(g.enemy_bullets[0].active == false);
    assert(g.enemy_bullets[1].active == false);
    assert(g.snd.snd_explode == true);

    printf("  ✓ Damage, Invincibility Frames, Lives Respawn & Bombs OK\n");
}

int main(void)
{
    printf("[TEST] Testing Pocket Contra Core Logic...\n");

    test_initialization();
    test_movement_and_crouch();
    test_weapons_and_bullets();
    test_capsule_and_upgrade();
    test_turret_and_boss();
    test_damage_and_invincibility();

    printf("[PASS] All Pocket Contra Core Logic Tests Passed Successfully!\n");
    return 0;
}
