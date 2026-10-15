#include "roulette_logic.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

const char *roulette_item_name(item_type_t item)
{
    switch (item) {
    case ITEM_BEER:      return "BEER";
    case ITEM_MAGNIFIER: return "GLASS";
    case ITEM_SAW:       return "SAW";
    case ITEM_CIGARETTE: return "CIG";
    case ITEM_HANDCUFFS: return "CUFF";
    default:             return "NONE";
    }
}

void roulette_init(roulette_game_t *g)
{
    if (!g) return;
    memset(g, 0, sizeof(*g));
    g->player_max_hp = 4;
    g->player_hp = 4;
    g->dealer_max_hp = 4;
    g->dealer_hp = 4;
    g->round_number = 1;
    roulette_load_chamber(g);
}

void roulette_load_chamber(roulette_game_t *g)
{
    if (!g) return;

    // 每一轮子弹配置
    int live = 1, blank = 2;
    if (g->round_number == 1) {
        live = 1 + (rand() % 2); // 1~2 实弹
        blank = 2;
    } else if (g->round_number == 2) {
        live = 2;
        blank = 2;
    } else {
        live = 2 + (rand() % 2); // 2~3 实弹
        blank = 2 + (rand() % 2); // 2~3 空弹
    }

    g->total_shells = live + blank;
    if (g->total_shells > ROULETTE_MAX_SHELLS) {
        g->total_shells = ROULETTE_MAX_SHELLS;
    }
    g->live_count = live;
    g->blank_count = blank;
    g->shell_index = 0;

    // 装填弹药
    for (int i = 0; i < live; i++) {
        g->chamber[i] = SHELL_LIVE;
    }
    for (int i = live; i < g->total_shells; i++) {
        g->chamber[i] = SHELL_BLANK;
    }

    // 洗牌 (Fisher-Yates Shuffle)
    for (int i = g->total_shells - 1; i > 0; i--) {
        int j = rand() % (i + 1);
        shell_type_t tmp = g->chamber[i];
        g->chamber[i] = g->chamber[j];
        g->chamber[j] = tmp;
    }

    // 发放道具 (给玩家和恶魔补充新道具)
    for (int i = 0; i < ROULETTE_MAX_ITEMS; i++) {
        if (g->player_items[i] == ITEM_NONE && (rand() % 100 < 70)) {
            g->player_items[i] = (item_type_t)(1 + (rand() % (ITEM_COUNT - 1)));
        }
        if (g->dealer_items[i] == ITEM_NONE && (rand() % 100 < 70)) {
            g->dealer_items[i] = (item_type_t)(1 + (rand() % (ITEM_COUNT - 1)));
        }
    }

    g->is_sawed = false;
    g->peeked_current = false;
    g->phase = PHASE_PLAYER_TURN;
    snprintf(g->message, sizeof(g->message), "ROUND %d: %d LIVE, %d BLANK",
             g->round_number, g->live_count, g->blank_count);
}

bool roulette_use_item(roulette_game_t *g, int item_idx, bool is_player, char *out_desc)
{
    if (!g || item_idx < 0 || item_idx >= ROULETTE_MAX_ITEMS) return false;

    item_type_t *items = is_player ? g->player_items : g->dealer_items;
    item_type_t it = items[item_idx];
    if (it == ITEM_NONE) return false;

    items[item_idx] = ITEM_NONE; // 消耗道具

    switch (it) {
    case ITEM_BEER: { // 退膛
        if (g->shell_index < g->total_shells) {
            shell_type_t ejected = g->chamber[g->shell_index++];
            if (ejected == SHELL_LIVE) g->live_count--;
            else g->blank_count--;
            g->peeked_current = false;
            if (out_desc) {
                snprintf(out_desc, 48, "RACK: EJECTED %s",
                         ejected == SHELL_LIVE ? "LIVE!" : "BLANK");
            }
            if (g->shell_index >= g->total_shells) {
                g->round_number++;
                roulette_load_chamber(g);
            }
        }
        break;
    }
    case ITEM_MAGNIFIER: { // 放大镜
        if (g->shell_index < g->total_shells) {
            g->peeked_current = true;
            g->peeked_shell = g->chamber[g->shell_index];
            if (out_desc) {
                snprintf(out_desc, 48, "MAGNIFIER: NEXT IS %s",
                         g->peeked_shell == SHELL_LIVE ? "LIVE!" : "BLANK");
            }
        }
        break;
    }
    case ITEM_SAW: { // 锯子
        g->is_sawed = true;
        if (out_desc) {
            snprintf(out_desc, 48, "SAW: BARREL SHORTENED (2X DMG)");
        }
        break;
    }
    case ITEM_CIGARETTE: { // 香烟回血
        if (is_player) {
            if (g->player_hp < g->player_max_hp) g->player_hp++;
        } else {
            if (g->dealer_hp < g->dealer_max_hp) g->dealer_hp++;
        }
        if (out_desc) {
            snprintf(out_desc, 48, "CIG: +1 HP RESTORED");
        }
        break;
    }
    case ITEM_HANDCUFFS: { // 手铐
        if (is_player) g->dealer_cuffed = true;
        else g->player_cuffed = true;
        if (out_desc) {
            snprintf(out_desc, 48, "HANDCUFFS: FOE LOCKED");
        }
        break;
    }
    default:
        break;
    }
    return true;
}

shot_result_t roulette_fire(roulette_game_t *g, fire_target_t target, bool is_player)
{
    shot_result_t res;
    memset(&res, 0, sizeof(res));

    if (!g || g->shell_index >= g->total_shells) {
        res.chamber_emptied = true;
        return res;
    }

    shell_type_t shell = g->chamber[g->shell_index++];
    res.is_live = (shell == SHELL_LIVE);
    if (res.is_live) g->live_count--;
    else g->blank_count--;

    int base_dmg = g->is_sawed ? 2 : 1;
    g->is_sawed = false; // 射击后锯子效果失效
    g->peeked_current = false;

    if (res.is_live) {
        res.damage = base_dmg;
        if (is_player) {
            if (target == TARGET_SELF) {
                g->player_hp -= base_dmg;
                snprintf(res.detail, sizeof(res.detail), "BANG! YOU HIT YOURSELF (-%d)", base_dmg);
            } else {
                g->dealer_hp -= base_dmg;
                snprintf(res.detail, sizeof(res.detail), "BANG! HIT DEMON (-%d)", base_dmg);
            }
        } else { // 恶魔开枪
            if (target == TARGET_SELF) {
                g->dealer_hp -= base_dmg;
                snprintf(res.detail, sizeof(res.detail), "BANG! DEMON HIT ITSELF (-%d)", base_dmg);
            } else {
                g->player_hp -= base_dmg;
                snprintf(res.detail, sizeof(res.detail), "BANG! DEMON SHOT YOU (-%d)", base_dmg);
            }
        }
        res.extra_turn = false; // 实弹无论对自己还是对方开枪都不给额外回合
    } else {
        res.damage = 0;
        if (target == TARGET_SELF) {
            // 对自己开火且为空弹：继续拥有当前回合！
            res.extra_turn = true;
            snprintf(res.detail, sizeof(res.detail), "*CLICK* BLANK! TURN CONTINUES");
        } else {
            res.extra_turn = false;
            snprintf(res.detail, sizeof(res.detail), "*CLICK* BLANK! NOTHING HAPPENED");
        }
    }

    // 检查血量胜负
    if (g->player_hp <= 0) {
        g->phase = PHASE_GAME_LOSE;
        res.game_over = true;
        snprintf(g->message, sizeof(g->message), "YOU DIED! DEMON PREVAILS");
        return res;
    }
    if (g->dealer_hp <= 0) {
        g->phase = PHASE_GAME_WIN;
        res.game_over = true;
        snprintf(g->message, sizeof(g->message), "VICTORY! DEMON SLAIN");
        return res;
    }

    // 检查弹仓是否打空
    if (g->shell_index >= g->total_shells) {
        res.chamber_emptied = true;
        g->round_number++;
        roulette_load_chamber(g);
        return res;
    }

    // 回合交替逻辑
    if (res.extra_turn) {
        // 保持原玩家/恶魔回合不变
    } else {
        if (is_player) {
            if (g->dealer_cuffed) {
                g->dealer_cuffed = false; // 解除手铐
                snprintf(g->message, sizeof(g->message), "DEMON CUFFED! YOUR TURN AGAIN");
                g->phase = PHASE_PLAYER_TURN;
            } else {
                g->phase = PHASE_DEALER_TURN;
                snprintf(g->message, sizeof(g->message), "DEMON'S TURN");
            }
        } else {
            if (g->player_cuffed) {
                g->player_cuffed = false; // 解除手铐
                snprintf(g->message, sizeof(g->message), "YOU ARE CUFFED! DEMON CONTINUES");
                g->phase = PHASE_DEALER_TURN;
            } else {
                g->phase = PHASE_PLAYER_TURN;
                snprintf(g->message, sizeof(g->message), "YOUR TURN");
            }
        }
    }

    return res;
}

void roulette_dealer_ai_step(roulette_game_t *g, shot_result_t *out_shot, char *out_action)
{
    if (!g || g->phase != PHASE_DEALER_TURN) return;

    // 1. AI 决策使用道具
    for (int i = 0; i < ROULETTE_MAX_ITEMS; i++) {
        item_type_t it = g->dealer_items[i];
        if (it == ITEM_CIGARETTE && g->dealer_hp < g->dealer_max_hp) {
            char desc[48];
            roulette_use_item(g, i, false, desc);
            if (out_action) snprintf(out_action, 64, "DEMON USED CIG (+1 HP)");
            return;
        }
        if (it == ITEM_HANDCUFFS && !g->player_cuffed) {
            char desc[48];
            roulette_use_item(g, i, false, desc);
            if (out_action) snprintf(out_action, 64, "DEMON USED HANDCUFFS!");
            return;
        }
        if (it == ITEM_MAGNIFIER && !g->peeked_current && (g->total_shells - g->shell_index > 1)) {
            char desc[48];
            roulette_use_item(g, i, false, desc);
            if (out_action) snprintf(out_action, 64, "DEMON PEEKED AT SHELL");
            return;
        }
        if (it == ITEM_SAW && !g->is_sawed && g->peeked_current && g->peeked_shell == SHELL_LIVE) {
            char desc[48];
            roulette_use_item(g, i, false, desc);
            if (out_action) snprintf(out_action, 64, "DEMON SAWED OFF BARREL!");
            return;
        }
    }

    // 2. AI 决定射击目标
    fire_target_t target = TARGET_OPPONENT; // 默认射击玩家

    if (g->peeked_current) {
        // 已看破当前子弹
        if (g->peeked_shell == SHELL_LIVE) {
            target = TARGET_OPPONENT; // 实弹射击玩家
        } else {
            target = TARGET_SELF;     // 空弹射击自己以获取额外回合
        }
    } else {
        // 概率计算
        int remaining = g->total_shells - g->shell_index;
        if (remaining > 0) {
            float live_prob = (float)g->live_count / (float)remaining;
            if (live_prob <= 0.35f) {
                target = TARGET_SELF; // 空弹概率高，博弈自己
            } else {
                target = TARGET_OPPONENT;
            }
        }
    }

    // 执行射击
    shot_result_t res = roulette_fire(g, target, false);
    if (out_shot) *out_shot = res;
    if (out_action) {
        if (target == TARGET_SELF) {
            snprintf(out_action, 64, "DEMON SHOOTS ITSELF: %.40s", res.detail);
        } else {
            snprintf(out_action, 64, "DEMON SHOOTS YOU: %.40s", res.detail);
        }
    }
}
