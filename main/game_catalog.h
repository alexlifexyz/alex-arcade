// main/game_catalog.h —— 街机游戏目录：纯数据表。
//
// 这里只有 id、显示名和分类，没有任何 ESP-IDF / LVGL 类型，所以主机测试
// (tests/test_game_catalog.c) 能直接把它编起来，断言 id 不重复、名字装得下
// 菜单卡片、分类合法。
//
// id 与浏览器街机 simulator/catalog.js 的 id 对齐，这样「掌机和浏览器对不上
// 游戏库」是能被人一眼比出来的，而不是埋在两份互不相干的数组里。
//
// 函数指针（每个 id 的 enter / exit / key）在 main/game_registry.h，只属于固件。
#pragma once

#include <stdbool.h>
#include <stddef.h>

// 浏览器目录里定义好的六个分类（simulator/catalog.js 的 G.CATEGORIES 去掉 'all'）。
// 菜单里长按 OK 会跳到下一个分类的第一项，所以目录表按分类分组排列。
typedef enum {
    GAME_CAT_SHOOT = 0,
    GAME_CAT_ACTION,
    GAME_CAT_RACE,
    GAME_CAT_PUZZLE,
    GAME_CAT_RHYTHM,
    GAME_CAT_CASUAL,
    GAME_CAT_COUNT,
} game_category_t;

// 菜单卡片宽 208 px，去掉 3 px 描边和内边距后可用约 194 px；菜单字体
// lv_font_montserrat_14 下，名字里会出现的那些字形（A-Z a-z 0-9 空格）最宽的
// 一个约 12 px，194 / 12 ≈ 16。现有名字最长 11 个字符，留足了余量。
#define GAME_NAME_MAX_CHARS 16

typedef struct {
    const char     *id;        // 与 simulator/catalog.js 对齐
    const char     *name;      // 菜单上显示的名字
    game_category_t category;
} game_catalog_entry_t;

// 整张目录表，按分类分组。
const game_catalog_entry_t *game_catalog_entries(void);
size_t                      game_catalog_count(void);

// 按 id 查；没有就返回 NULL。
const game_catalog_entry_t *game_catalog_find(const char *id);

// 分类的英文短名，越界返回 "?"。
const char *game_category_label(game_category_t category);

// 从 from 开始往后（到尾部回绕）找到的第一个「分类和 from 不同」的条目下标，
// 也就是下一个分类的第一项。表里只有一个分类时返回 from 本身。
// from 越界时返回 0。
size_t game_catalog_next_category_start(size_t from);
