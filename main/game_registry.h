// main/game_registry.h —— 街机游戏注册表：每个 id 对应的 enter / exit / key。
//
// 这是接一个新页面的唯一入口：game_registry.c 的表里加一行，顺序和
// main/game_catalog.c 保持一致。注册表碰 bsp_button_t，所以只属于固件，
// 不进主机测试；能被主机测试编起来的那一半在 main/game_catalog.h。
//
// main.c 只管菜单行为，从这里按下标取名字、分类和三个函数。
#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "bsp_button.h"
#include "game_catalog.h"

typedef struct {
    const char *id;                               // 与目录表同一个 id
    void (*enter)(void);                          // 建自己的屏并载入
    void (*exit)(void);                           // 删屏、停定时器、释放资源
    void (*key)(bsp_btn_t btn, bsp_btn_ev_t ev);  // 收按键(长按确定已被 main 拦截)
} game_registry_entry_t;

size_t                       game_registry_count(void);
const game_registry_entry_t *game_registry_entry(size_t index);

// 注册表第 index 项在目录表里的那一条；对不上就返回 NULL。
const game_catalog_entry_t *game_registry_catalog(size_t index);

// 注册表与目录表必须是同序一一对应。不对就把每处错位打到日志里并返回 false，
// 这样「加了注册行忘了加目录行」在开机日志里就能看见，而不是菜单上少一格。
bool game_registry_validate(void);
