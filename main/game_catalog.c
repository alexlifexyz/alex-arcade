// main/game_catalog.c —— 街机游戏目录：纯数据表，见 game_catalog.h。
#include "game_catalog.h"

#include <string.h>

// 按分类分组：菜单里长按 OK 跳分类靠的就是这个顺序，分组一乱跳转就乱。
// id 一栏对齐 simulator/catalog.js；name 一栏是掌机菜单上显示的名字，比浏览器
// 的标题短，因为卡片只有 208 px 宽。
// flysaber 和 flydriver 的页面都写好了，但暂时不在表里:demo_flysaber.c 和
// demo_flydriver.c 各自在 .bss 里放了一块 240*250*2 = 120000 字节的静态画布,
// 两块一起把 dram0_0_seg 顶出 129680 字节,链接都过不去。这块板子没有 PSRAM,
// 所以得先把画布改成进页面时申请、退页面时释放(或者改小),才能把它们接回来。
// 这不是 Flash 不够:预算行显示应用分区还剩一大半。
static const game_catalog_entry_t CATALOG[] = {
    // 射击
    { "thunder",      "Striker",        GAME_CAT_SHOOT  },
    { "battlecity",   "Tank 1990",      GAME_CAT_SHOOT  },
    { "contra",       "Contra",         GAME_CAT_SHOOT  },
    // 动作
    { "adventure",    "Island",         GAME_CAT_ACTION },
    { "cyberrunner",  "Runner",         GAME_CAT_ACTION },
    { "gearcavalry",  "Cavalry",        GAME_CAT_ACTION },
    { "pacman",       "Pac Neon",       GAME_CAT_ACTION },
    // 竞速
    { "thunderracer", "Racer",          GAME_CAT_RACE   },
    { "pawssprint",   "Paws Sprint",    GAME_CAT_RACE   },
    { "wave",         "Wave Walker",    GAME_CAT_RACE   },
    // 益智
    { "match3",       "Neon Pop",       GAME_CAT_PUZZLE },
    // 休闲
    { "wind",         "Wind Rider",     GAME_CAT_CASUAL },
    { "flappy",       "Pixel Flappy",   GAME_CAT_CASUAL },
    { "fish",         "Shy Fish",       GAME_CAT_CASUAL },
    { "roulette",     "Devil Roulette", GAME_CAT_CASUAL },
};

#define CATALOG_COUNT (sizeof(CATALOG) / sizeof(CATALOG[0]))

static const char *const CATEGORY_LABELS[GAME_CAT_COUNT] = {
    "Shoot", "Action", "Race", "Puzzle", "Rhythm", "Casual",
};

const game_catalog_entry_t *game_catalog_entries(void)
{
    return CATALOG;
}

size_t game_catalog_count(void)
{
    return CATALOG_COUNT;
}

const game_catalog_entry_t *game_catalog_find(const char *id)
{
    if (id == NULL) {
        return NULL;
    }
    for (size_t i = 0; i < CATALOG_COUNT; i++) {
        if (strcmp(CATALOG[i].id, id) == 0) {
            return &CATALOG[i];
        }
    }
    return NULL;
}

const char *game_category_label(game_category_t category)
{
    if ((int)category < 0 || (int)category >= GAME_CAT_COUNT) {
        return "?";
    }
    return CATEGORY_LABELS[category];
}

size_t game_catalog_next_category_start(size_t from)
{
    if (from >= CATALOG_COUNT) {
        return 0;
    }
    game_category_t here = CATALOG[from].category;
    for (size_t step = 1; step < CATALOG_COUNT; step++) {
        size_t i = (from + step) % CATALOG_COUNT;
        if (CATALOG[i].category != here) {
            return i;
        }
    }
    return from;
}
