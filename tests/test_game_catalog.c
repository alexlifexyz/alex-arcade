// tests/test_game_catalog.c —— 游戏目录表的主机测试。
// 门禁按约定把 tests/test_<name>.c 和 main/<name>.c 配对，所以这个文件一出现
// 就自动进 ./tools/validate.sh --static，验证脚本不需要改。
//
// 这里守的是「表本身不许出错」这几条：id 不重复、名字装得下菜单卡片、分类合法、
// 按分类分组（长按 OK 跳分类依赖这个顺序）。
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "game_catalog.h"

int main(void)
{
    printf("[TEST] Testing Arcade Game Catalog...\n");

    const game_catalog_entry_t *entries = game_catalog_entries();
    size_t count = game_catalog_count();

    // 1. 表不是空的，而且指针拿得到
    assert(entries != NULL);
    assert(count > 0);
    printf("  ✓ 1. Catalog is non-empty (%u entries)\n", (unsigned)count);

    // 2. 每一条的 id 和 name 都在，而且不是空串
    for (size_t i = 0; i < count; i++) {
        assert(entries[i].id != NULL);
        assert(entries[i].name != NULL);
        assert(entries[i].id[0] != '\0');
        assert(entries[i].name[0] != '\0');
    }
    printf("  ✓ 2. Every entry has a non-empty id and name\n");

    // 3. id 不重复：掌机和浏览器对不上游戏库是靠 id 比的，id 撞了就比不出来
    for (size_t i = 0; i < count; i++) {
        for (size_t j = i + 1; j < count; j++) {
            if (strcmp(entries[i].id, entries[j].id) == 0) {
                printf("  ✗ duplicate id '%s' at %u and %u\n",
                       entries[i].id, (unsigned)i, (unsigned)j);
                assert(0 && "duplicate catalog id");
            }
        }
    }
    printf("  ✓ 3. All ids are unique\n");

    // 4. id 只用小写字母和数字：和 simulator/catalog.js 的写法一致，
    //    免得一边写 cyberrunner、一边写 cyber_runner
    for (size_t i = 0; i < count; i++) {
        for (const char *c = entries[i].id; *c != '\0'; c++) {
            bool lower = (*c >= 'a' && *c <= 'z');
            bool digit = (*c >= '0' && *c <= '9');
            if (!lower && !digit) {
                printf("  ✗ id '%s' has illegal character '%c'\n",
                       entries[i].id, *c);
                assert(0 && "catalog id must be lowercase alphanumeric");
            }
        }
    }
    printf("  ✓ 4. All ids are lowercase alphanumeric\n");

    // 5. 名字装得下菜单卡片：超了就是屏幕上被截断
    for (size_t i = 0; i < count; i++) {
        size_t len = strlen(entries[i].name);
        if (len > GAME_NAME_MAX_CHARS) {
            printf("  ✗ name '%s' is %u chars, menu fits %u\n",
                   entries[i].name, (unsigned)len,
                   (unsigned)GAME_NAME_MAX_CHARS);
            assert(0 && "catalog name too long for the menu card");
        }
    }
    printf("  ✓ 5. Every name fits the %u-char menu card\n",
           (unsigned)GAME_NAME_MAX_CHARS);

    // 6. 名字也不重复：两行一样的字菜单上没法选
    for (size_t i = 0; i < count; i++) {
        for (size_t j = i + 1; j < count; j++) {
            if (strcmp(entries[i].name, entries[j].name) == 0) {
                printf("  ✗ duplicate name '%s'\n", entries[i].name);
                assert(0 && "duplicate catalog name");
            }
        }
    }
    printf("  ✓ 6. All names are unique\n");

    // 7. 分类合法，而且每个分类都有英文短名
    for (size_t i = 0; i < count; i++) {
        assert(entries[i].category >= 0);
        assert(entries[i].category < GAME_CAT_COUNT);
        assert(strcmp(game_category_label(entries[i].category), "?") != 0);
    }
    assert(strcmp(game_category_label(GAME_CAT_COUNT), "?") == 0);
    assert(strcmp(game_category_label((game_category_t)-1), "?") == 0);
    printf("  ✓ 7. Categories are valid and labelled\n");

    // 8. 按分类分组：同一个分类的条目必须连在一起，否则长按 OK 跳分类会在
    //    同一个分类里来回跳
    {
        bool seen[GAME_CAT_COUNT] = {false};
        game_category_t prev = entries[0].category;
        seen[prev] = true;
        for (size_t i = 1; i < count; i++) {
            if (entries[i].category != prev) {
                if (seen[entries[i].category]) {
                    printf("  ✗ category %s reappears at entry %u ('%s')\n",
                           game_category_label(entries[i].category),
                           (unsigned)i, entries[i].id);
                    assert(0 && "catalog must be grouped by category");
                }
                seen[entries[i].category] = true;
                prev = entries[i].category;
            }
        }
    }
    printf("  ✓ 8. Catalog is grouped by category\n");

    // 9. 按 id 查得到，查不到的返回 NULL，NULL 进去不炸
    for (size_t i = 0; i < count; i++) {
        const game_catalog_entry_t *found = game_catalog_find(entries[i].id);
        assert(found == &entries[i]);
    }
    assert(game_catalog_find("no_such_game") == NULL);
    assert(game_catalog_find("") == NULL);
    assert(game_catalog_find(NULL) == NULL);
    printf("  ✓ 9. Lookup by id works, misses return NULL\n");

    // 10. 跳分类：落点一定是那个分类的第一项，而且一路跳下去能回到出发点
    for (size_t i = 0; i < count; i++) {
        size_t next = game_catalog_next_category_start(i);
        assert(next < count);
        assert(entries[next].category != entries[i].category);
        // 落点是该分类的第一项：它前面一项（回绕）必须是别的分类
        size_t before = (next + count - 1) % count;
        assert(entries[before].category != entries[next].category);
    }
    printf("  ✓ 10. Next-category jump lands on a category's first entry\n");

    // 11. 一路跳分类能把所有分类走遍，并且回到出发分类
    {
        size_t i = 0;
        size_t hops = 0;
        game_category_t first = entries[0].category;
        do {
            i = game_catalog_next_category_start(i);
            hops++;
            assert(hops <= GAME_CAT_COUNT);
        } while (entries[i].category != first);
        assert(i == 0);
        printf("  ✓ 11. %u category hops cycle back to the first entry\n",
               (unsigned)hops);
    }

    // 12. 越界的 from 不炸
    assert(game_catalog_next_category_start(count) == 0);
    assert(game_catalog_next_category_start(count + 99) == 0);
    printf("  ✓ 12. Out-of-range jump input is clamped\n");

    printf("\n>>> ALL GAME CATALOG HOST TESTS PASSED! <<<\n");
    return 0;
}
