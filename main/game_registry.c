// main/game_registry.c —— 街机游戏注册表，见 game_registry.h。
#include "game_registry.h"

#include <string.h>

#include "demo.h"
#include "esp_log.h"

static const char *TAG = "game_registry";

// 顺序必须和 main/game_catalog.c 的 CATALOG 完全一致，game_registry_validate()
// 开机时会把这件事核一遍。
static const game_registry_entry_t REGISTRY[] = {
    // 射击
    { "thunder",      demo_thunder_enter,      demo_thunder_exit,      demo_thunder_key      },
    { "battlecity",   demo_battlecity_enter,   demo_battlecity_exit,   demo_battlecity_key   },
    { "contra",       demo_contra_enter,       demo_contra_exit,       demo_contra_key       },
    // 动作
    { "adventure",    demo_adventure_enter,    demo_adventure_exit,    demo_adventure_key    },
    { "cyberrunner",  demo_cyber_runner_enter, demo_cyber_runner_exit, demo_cyber_runner_key },
    { "gearcavalry",  demo_geartrooper_enter,  demo_geartrooper_exit,  demo_geartrooper_key  },
    { "pacman",       demo_pacman_enter,       demo_pacman_exit,       demo_pacman_key       },
    // 竞速
    { "thunderracer", demo_thunderracer_enter, demo_thunderracer_exit, demo_thunderracer_key },
    { "pawssprint",   demo_pawssprint_enter,   demo_pawssprint_exit,   demo_pawssprint_key   },
    { "wave",         demo_wave_enter,         demo_wave_exit,         demo_wave_key         },
    { "flydriver",    demo_flydriver_enter,    demo_flydriver_exit,    demo_flydriver_key    },
    // 益智
    { "match3",       demo_match3_enter,       demo_match3_exit,       demo_match3_key       },
    // 节奏
    { "flysaber",     demo_flysaber_enter,     demo_flysaber_exit,     demo_flysaber_key     },
    // 休闲
    { "wind",         demo_wind_enter,         demo_wind_exit,         demo_wind_key         },
    { "flappy",       demo_flappy_enter,       demo_flappy_exit,       demo_flappy_key       },
    { "fish",         demo_fish_enter,         demo_fish_exit,         demo_fish_key         },
    { "roulette",     demo_roulette_enter,     demo_roulette_exit,     demo_roulette_key     },
};

#define REGISTRY_COUNT (sizeof(REGISTRY) / sizeof(REGISTRY[0]))

size_t game_registry_count(void)
{
    return REGISTRY_COUNT;
}

const game_registry_entry_t *game_registry_entry(size_t index)
{
    if (index >= REGISTRY_COUNT) {
        return NULL;
    }
    return &REGISTRY[index];
}

const game_catalog_entry_t *game_registry_catalog(size_t index)
{
    if (index >= REGISTRY_COUNT) {
        return NULL;
    }
    const game_catalog_entry_t *entries = game_catalog_entries();
    if (index < game_catalog_count() &&
        strcmp(entries[index].id, REGISTRY[index].id) == 0) {
        return &entries[index];
    }
    return game_catalog_find(REGISTRY[index].id);
}

bool game_registry_validate(void)
{
    bool ok = true;

    if (REGISTRY_COUNT != game_catalog_count()) {
        ESP_LOGE(TAG, "注册表 %u 项，目录表 %u 项，对不上",
                 (unsigned)REGISTRY_COUNT, (unsigned)game_catalog_count());
        ok = false;
    }

    const game_catalog_entry_t *entries = game_catalog_entries();
    for (size_t i = 0; i < REGISTRY_COUNT; i++) {
        if (i >= game_catalog_count()) {
            ESP_LOGE(TAG, "注册表第 %u 项 '%s' 在目录表里没有对应行",
                     (unsigned)i, REGISTRY[i].id);
            ok = false;
            continue;
        }
        if (strcmp(entries[i].id, REGISTRY[i].id) != 0) {
            ESP_LOGE(TAG, "第 %u 项错位：目录 '%s' / 注册表 '%s'",
                     (unsigned)i, entries[i].id, REGISTRY[i].id);
            ok = false;
        }
        if (REGISTRY[i].enter == NULL || REGISTRY[i].exit == NULL ||
            REGISTRY[i].key == NULL) {
            ESP_LOGE(TAG, "'%s' 少了 enter/exit/key", REGISTRY[i].id);
            ok = false;
        }
    }

    for (size_t i = REGISTRY_COUNT; i < game_catalog_count(); i++) {
        ESP_LOGE(TAG, "目录表第 %u 项 '%s' 没有注册 enter/exit/key",
                 (unsigned)i, entries[i].id);
        ok = false;
    }

    return ok;
}
