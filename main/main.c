// main/main.c —— FoloToy AI Passport 街机掌机:初始化 + 菜单行为 + 按键分发。
//
// 游戏列表不在这里:纯数据表在 main/game_catalog.c(主机测试能编),函数指针表在
// main/game_registry.c(只属于固件)。本文件只管菜单怎么动。
//
// 按键语义(全局统一):
//   上/下 短按   菜单中=移动选中项;演示页中=该页自定义
//   确定  短按   菜单中=进入选中项;演示页中=该页自定义
//   确定  长按   菜单中=跳到下一个分类的第一项;演示页中=返回菜单(本文件统一拦截)
#include "bsp_i2c.h"
#include "bsp_display.h"
#include "bsp_button.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_pins.h"      // 错误日志里要打印 BSP_LCD_* 引脚号
#include "demo.h"
#include "game_catalog.h"
#include "game_registry.h"
#include "ui_pixel.h"
#include "lvgl.h"
#include "esp_log.h"
#include "esp_sleep.h"

static const char *TAG = "main";

// 菜单是一个固定 8 行的滚动窗口:选中项保持在窗口内,碰到边缘时窗口跟着滚,
// 两端循环。卡片高度不再随项数压缩,所以再加游戏也不会把字挤扁。
// 几何:标题牌占到 y≈45,草地从 y=286 开始,8 行占 52..272(阴影到 278),
// 吉祥物从 280 起站在草地上,不和列表重叠。
#define MENU_VISIBLE_ROWS 8
#define MENU_CARD_X       16
#define MENU_CARD_W       208
#define MENU_CARD_H       24
#define MENU_STEP_Y       28
#define MENU_START_Y      52
#define MENU_MASCOT_X     101
#define MENU_MASCOT_Y     280

static bool s_games_enabled;       // 按键初始化失败时菜单整列标 [FAIL] 且不许进入

static lv_obj_t *s_menu_scr;
static lv_obj_t *s_cards[MENU_VISIBLE_ROWS];
static lv_obj_t *s_rows[MENU_VISIBLE_ROWS];
static lv_obj_t *s_counter;        // 右上角 "12/15" 位置指示
static lv_obj_t *s_category;       // 草地左侧显示选中项的分类
static lv_obj_t *s_mascot;
static int  s_rows_shown;          // = min(游戏数, MENU_VISIBLE_ROWS)
static int  s_sel = 0;             // 当前选中项 (默认停在第一项)
static int  s_top = 0;            // 窗口里第一行对应的游戏下标
static int  s_active = -1;         // 当前所在演示页;-1 = 在菜单

static int menu_count(void)
{
    return (int)game_registry_count();
}

// 把窗口挪到能看见选中项的位置。两端循环靠的是 s_sel 自己回绕,窗口只负责跟上。
static void menu_scroll_into_view(void)
{
    int count = menu_count();

    if (count <= MENU_VISIBLE_ROWS) {
        s_top = 0;
        return;
    }
    if (s_sel < s_top) {
        s_top = s_sel;
    }
    if (s_sel >= s_top + MENU_VISIBLE_ROWS) {
        s_top = s_sel - MENU_VISIBLE_ROWS + 1;
    }
    if (s_top > count - MENU_VISIBLE_ROWS) {
        s_top = count - MENU_VISIBLE_ROWS;
    }
    if (s_top < 0) {
        s_top = 0;
    }
}

static void menu_refresh(void)
{
    menu_scroll_into_view();

    for (int row = 0; row < s_rows_shown; row++) {
        int index = s_top + row;
        const game_catalog_entry_t *entry = game_registry_catalog((size_t)index);
        const game_registry_entry_t *game = game_registry_entry((size_t)index);
        // 注册表和目录表错位时(开机日志里已经报过)退回显示 id,菜单照样能用。
        const char *name = (entry != NULL) ? entry->name
                                           : ((game != NULL) ? game->id : "?");

        lv_label_set_text_fmt(s_rows[row], "%s%s",
                              name, s_games_enabled ? "" : "  [FAIL]");
        ui_pixel_set_selected(s_cards[row], index == s_sel, s_games_enabled);
        lv_obj_set_style_text_color(s_rows[row],
            s_games_enabled ? lv_color_hex(UI_INK) : lv_color_hex(0x7A2020), 0);
    }

    lv_label_set_text_fmt(s_counter, "%d/%d", s_sel + 1, menu_count());

    const game_catalog_entry_t *selected = game_registry_catalog((size_t)s_sel);
    lv_label_set_text(s_category,
                      (selected != NULL) ? game_category_label(selected->category)
                                         : "?");
}

static void menu_build(void)
{
    int count = menu_count();

    s_rows_shown = (count < MENU_VISIBLE_ROWS) ? count : MENU_VISIBLE_ROWS;
    if (s_sel >= count) {
        s_sel = 0;
    }

    s_menu_scr = ui_pixel_screen_create("ARCADE");

    for (int row = 0; row < s_rows_shown; row++) {
        int y = MENU_START_Y + row * MENU_STEP_Y;
        s_cards[row] = ui_pixel_panel_create(s_menu_scr, MENU_CARD_X, y,
                                             MENU_CARD_W, MENU_CARD_H, UI_PAPER);
        lv_obj_set_style_pad_top(s_cards[row], 1, 0);
        lv_obj_set_style_pad_bottom(s_cards[row], 1, 0);
        s_rows[row] = lv_label_create(s_cards[row]);
        lv_obj_set_style_text_font(s_rows[row], &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(s_rows[row], LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(s_rows[row]);
    }

    // 标题牌右边的空位放 "12/15",一眼就知道列表还有多长。
    lv_obj_t *badge = ui_pixel_panel_create(s_menu_scr, 164, 12, 60, 26, UI_PAPER);
    s_counter = lv_label_create(badge);
    lv_obj_set_style_text_font(s_counter, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_counter, lv_color_hex(UI_INK), 0);
    lv_obj_center(s_counter);

    // 草地左侧写当前分类,长按 OK 跳分类时能看见自己跳到了哪儿。
    s_category = ui_pixel_label(s_menu_scr, "", &lv_font_montserrat_14, UI_PAPER);
    lv_obj_set_pos(s_category, 10, 295);

    s_mascot = ui_pixel_mascot_create(s_menu_scr, MENU_MASCOT_X, MENU_MASCOT_Y);

    menu_refresh();
    lv_screen_load(s_menu_scr);
}

static void enter_menu(void)
{
    s_active = -1;
    menu_build();
}

void bsp_demo_return_to_menu(void)
{
    if (s_active >= 0) {
        int old_active = s_active;
        s_active = -1;
        enter_menu();
        const game_registry_entry_t *game = game_registry_entry((size_t)old_active);
        if (game != NULL) {
            game->exit();
        }
    }
}

static void menu_open_selected(void)
{
    const game_registry_entry_t *game = game_registry_entry((size_t)s_sel);

    if (game == NULL) {
        return;
    }
    s_active = s_sel;
    ui_pixel_mascot_jump(s_mascot);

    lv_obj_t *old_menu = s_menu_scr;
    s_menu_scr = NULL;
    s_mascot = NULL;
    s_counter = NULL;
    s_category = NULL;
    game->enter();
    if (old_menu) {
        lv_obj_delete(old_menu);
    }
}

// 按键回调运行在 button 组件的任务里,操作 LVGL 必须加锁。
static void on_key(bsp_btn_t btn, bsp_btn_ev_t ev, void *user)
{
    (void)user;
    if (!bsp_lvgl_lock(500)) return;

    if (s_active >= 0) {
        // 仅 OK 键长按全局拦截返回主菜单。纸飞机俯冲、海獭压板都只吃短于这个
        // 阈值的按住;到点一律回列表,不再给个别游戏另开更长的退出计时。
        if (btn == BSP_BTN_OK && ev == BSP_BTN_LONG) {
            bsp_demo_return_to_menu();
        } else {
            const game_registry_entry_t *game = game_registry_entry((size_t)s_active);
            if (game != NULL) {
                game->key(btn, ev);
            }
        }
    } else if (ev == BSP_BTN_CLICK) {
        // 主菜单状态:每次点击精确步进一项,绝不跳格连跳!
        int count = menu_count();
        if (btn == BSP_BTN_UP) {
            s_sel = (s_sel + count - 1) % count;
            menu_refresh();
            ui_pixel_mascot_jump(s_mascot);
        } else if (btn == BSP_BTN_DOWN) {
            s_sel = (s_sel + 1) % count;
            menu_refresh();
            ui_pixel_mascot_jump(s_mascot);
        } else if (btn == BSP_BTN_OK && s_games_enabled) {
            menu_open_selected();
        }
    } else if (ev == BSP_BTN_LONG && btn == BSP_BTN_OK) {
        // 菜单里长按 OK = 跳到下一个分类的第一项,一长串列表变成几次短跳。
        // 游戏里长按 OK 仍然是返回菜单,语义不冲突:两边不会同时在。
        s_sel = (int)game_catalog_next_category_start((size_t)s_sel);
        menu_refresh();
        ui_pixel_mascot_jump(s_mascot);
    }
    bsp_lvgl_unlock();
}

void app_main(void)
{
    ESP_LOGI(TAG, "FoloToy AI Passport 街机掌机启动");
    esp_sleep_wakeup_cause_t wakeup = esp_sleep_get_wakeup_cause();
    if (wakeup != ESP_SLEEP_WAKEUP_UNDEFINED) {
        ESP_LOGI(TAG, "休眠唤醒原因: %d", wakeup);
    }

    if (!game_registry_validate()) {
        ESP_LOGE(TAG, "游戏注册表和目录表对不上,菜单会退回显示 id");
    }

    bsp_i2c_init();
    bsp_i2c_scan();

    // 屏幕是本固件的 UI 载体,失败就没有菜单可言
    if (bsp_display_init() != ESP_OK || !bsp_lvgl_init()) {
        ESP_LOGE(TAG, "显示/LVGL 初始化失败,无法继续。"
                      "检查 SPI 接线(MOSI=%d SCLK=%d CS=%d DC=%d BL=%d)",
                 BSP_LCD_MOSI, BSP_LCD_SCLK, BSP_LCD_CS, BSP_LCD_DC, BSP_LCD_BL);
        return;
    }
    bsp_display_backlight(100);

    bool btn_ok = (bsp_button_init(on_key, NULL) == ESP_OK);
    bool audio_ok = (bsp_audio_init() == ESP_OK);
    bool bat_ok = (bsp_battery_init() == ESP_OK);
    ESP_LOGI(TAG, "外设: 按键=%d 音频=%d 电池=%d", btn_ok, audio_ok, bat_ok);

    s_games_enabled = btn_ok;

    if (bsp_lvgl_lock(1000)) {
        s_sel = 0; // 默认停在第一项
        s_top = 0;
        enter_menu();
        bsp_lvgl_unlock();
    }

    ESP_LOGI(TAG, "街机就绪,主菜单已载入,%d 款游戏,首项: %s",
             menu_count(), game_catalog_entries()[0].name);
}
