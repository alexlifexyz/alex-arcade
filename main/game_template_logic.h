#pragma once

// main/game_template_logic.h —— 新游戏脚手架:「接水果」最小可玩模型。
//
// 这个文件是“照着抄”的起点,不进固件菜单,但进主机测试门禁,所以它永远可编译、
// 可运行。新增游戏的流程见 docs/development/new-game-guide.md。
//
// 分层约定(全仓库一致):
//   <game>_logic.c/h   纯逻辑:不碰 LVGL、不碰 ESP-IDF、不 malloc、可在电脑上测
//   demo_<game>.c      渲染层:只读逻辑状态画画,只把按键翻译成 logic 调用
//
// 给小朋友:只改下面「可以随便改的数字」,存盘,跑一次测试,就能看出变化。

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ======================= 可以随便改的数字 =======================
#define TPL_START_LIVES      3      // 开局有几颗心
#define TPL_FRUIT_SCORE      10     // 接到一个水果加几分
#define TPL_BOMB_PERCENT     20     // 掉下来的东西里有百分之几是炸弹 (0~100)
#define TPL_FALL_SPEED       90.0f  // 东西下落的初始速度 (像素/秒)
#define TPL_SPEED_PER_LEVEL  18.0f  // 每升一级,下落速度加多少
#define TPL_LEVEL_UP_SCORE   100    // 攒够多少分升一级
#define TPL_SPAWN_MS         900u   // 每隔多少毫秒掉一个新东西
#define TPL_SPAWN_MS_MIN     320u   // 掉落间隔最快到多少毫秒为止
// ===============================================================

// 屏幕与布局基准 (FoloToy AI Passport 240x320 竖屏基准)
#define TPL_SCREEN_W         240
#define TPL_SCREEN_H         320
#define TPL_LANES            3                  // 三条轨道,刚好配三个按键的手感
#define TPL_LANE_W           (TPL_SCREEN_W / TPL_LANES)
#define TPL_BASKET_Y         268.0f             // 篮子口的 Y 坐标
#define TPL_CATCH_BAND       26.0f              // 篮子口的接住判定高度
#define TPL_MAX_ITEMS        6                  // 同屏最多几个掉落物 (固定对象池,不 malloc)
#define TPL_ITEM_SIZE        22.0f              // 掉落物边长,渲染层也用这个值

// 游戏状态枚举
typedef enum {
    TPL_STATE_READY = 0,    // 待开始,等一次 OK
    TPL_STATE_PLAYING = 1,  // 游戏中
    TPL_STATE_GAMEOVER = 2  // 心掉光了
} tpl_state_t;

// 单个掉落物。对象池里复用,active=false 表示这个格子空着。
typedef struct {
    float y;        // 当前高度 (px, 从屏幕顶部往下增长)
    int8_t lane;    // 所在轨道 0..TPL_LANES-1
    bool  bomb;     // true = 炸弹,接到扣心
    bool  active;   // 是否在场
} tpl_item_t;

// 游戏核心数据模型。渲染层只读这个结构体,不自己存状态。
typedef struct {
    tpl_state_t state;
    int8_t   lane;                       // 篮子所在轨道
    int8_t   lives;                      // 剩余心数
    int8_t   level;                      // 当前等级,从 1 开始
    uint32_t score;
    uint32_t high_score;
    float    fall_speed;                 // 当前下落速度 (px/s)
    uint32_t spawn_interval_ms;          // 当前掉落间隔
    uint32_t spawn_timer_ms;             // 距离下一次掉落还剩多少
    uint32_t elapsed_ms;                 // 本局已进行时长
    uint32_t rng_state;                  // LCG 伪随机种子,保证可复现
    tpl_item_t items[TPL_MAX_ITEMS];

    // 本帧发生的一次性事件,给渲染层放音效/粒子用。渲染层读完要自己清零。
    uint8_t fx_catch;                    // 接到水果的次数
    uint8_t fx_bomb;                     // 接到炸弹的次数
    uint8_t fx_miss;                     // 水果落地漏掉的次数 (不扣心,只是提示)
} tpl_game_t;

// --- 默认实例 API:渲染层用这一组,省去自己持有上下文 ---
void tpl_logic_init(void);
void tpl_logic_update(uint32_t dt_ms);
void tpl_logic_move(int dir);
void tpl_logic_confirm(void);
tpl_game_t *tpl_logic_get_state(void);

// --- 上下文 API:主机测试用这一组,一局一个独立上下文 ---
void tpl_logic_init_ctx(tpl_game_t *g);
void tpl_logic_update_ctx(tpl_game_t *g, uint32_t dt_ms);
void tpl_logic_move_ctx(tpl_game_t *g, int dir);      // dir<0 左移, dir>0 右移
void tpl_logic_confirm_ctx(tpl_game_t *g);            // READY=开始, GAMEOVER=重开
void tpl_logic_restart_ctx(tpl_game_t *g);
void tpl_logic_set_seed_ctx(tpl_game_t *g, uint32_t seed);

// 轨道中心的 X 坐标。渲染层画篮子和掉落物都用它,避免两边各算一套。
float tpl_logic_lane_center_x(int8_t lane);

#ifdef __cplusplus
}
#endif
