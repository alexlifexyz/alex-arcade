// main/main.c —— FoloToy AI Passport BSP 驱动参考示例:初始化 + 菜单 + 按键分发。
//
// 按键语义(全局统一):
//   上/下 短按   菜单中=移动选中项;演示页中=该页自定义
//   确定  短按   菜单中=进入选中项;演示页中=该页自定义
//   确定  长按   演示页中=返回菜单(由本文件统一拦截)
#include "bsp_i2c.h"
#include "bsp_display.h"
#include "bsp_button.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_pins.h"      // 错误日志里要打印 BSP_LCD_* 引脚号
#include "demo.h"
#include "ui_pixel.h"
#include "lvgl.h"
#include "esp_log.h"
#include "esp_sleep.h"

static const char *TAG = "main";

static const demo_entry_t DEMOS[] = {
    { "Wave Walker", demo_wave_enter,         demo_wave_exit,         demo_wave_key         },
    { "Wind Rider",   demo_wind_enter,         demo_wind_exit,         demo_wind_key         },
    { "Paws Sprint", demo_pawssprint_enter,   demo_pawssprint_exit,   demo_pawssprint_key   },
    { "Runner",      demo_cyber_runner_enter, demo_cyber_runner_exit, demo_cyber_runner_key },
    { "Cavalry",     demo_geartrooper_enter,  demo_geartrooper_exit,  demo_geartrooper_key  },
    { "Neon Pop",    demo_match3_enter,       demo_match3_exit,       demo_match3_key       },
    { "Tank 1990",   demo_battlecity_enter,   demo_battlecity_exit,   demo_battlecity_key   },
    { "Island",      demo_adventure_enter,    demo_adventure_exit,    demo_adventure_key    },
    { "Contra",      demo_contra_enter,       demo_contra_exit,       demo_contra_key       },
    { "Racer",       demo_thunderracer_enter, demo_thunderracer_exit, demo_thunderracer_key },
    { "Striker",     demo_thunder_enter,      demo_thunder_exit,      demo_thunder_key      },
};
#define DEMO_COUNT (sizeof(DEMOS) / sizeof(DEMOS[0]))

// 各外设初始化结果:失败的项在菜单里标 [FAIL] 且不允许进入。
static bool s_ok[DEMO_COUNT];

static lv_obj_t *s_menu_scr;
static lv_obj_t *s_cards[DEMO_COUNT];
static lv_obj_t *s_rows[DEMO_COUNT];
static lv_obj_t *s_mascot;
static int  s_sel = 0;             // 当前选中项 (默认停在第一项)
static int  s_active = -1;         // 当前所在演示页;-1 = 在菜单

static void menu_refresh(void) {
    for (size_t i = 0; i < DEMO_COUNT; i++) {
        lv_label_set_text_fmt(s_rows[i], "%s%s",
                              DEMOS[i].name,
                              s_ok[i] ? "" : "  [FAIL]");
        ui_pixel_set_selected(s_cards[i], (int)i == s_sel, s_ok[i]);
        lv_obj_set_style_text_color(s_rows[i],
            s_ok[i] ? lv_color_hex(UI_INK) : lv_color_hex(0x7A2020), 0);
    }
}

static void menu_build(void) {
    s_menu_scr = ui_pixel_screen_create("ARCADE");

    int card_h = (DEMO_COUNT >= 11) ? 19 : ((DEMO_COUNT >= 10) ? 20 : ((DEMO_COUNT > 8) ? 23 : ((DEMO_COUNT > 7) ? 26 : ((DEMO_COUNT > 5) ? 30 : 34))));
    int step_y = (DEMO_COUNT >= 11) ? 23 : ((DEMO_COUNT >= 10) ? 24 : ((DEMO_COUNT > 8) ? 27 : ((DEMO_COUNT > 7) ? 31 : ((DEMO_COUNT > 5) ? 36 : 42))));
    int start_y = (DEMO_COUNT >= 11) ? 26 : ((DEMO_COUNT >= 10) ? 30 : ((DEMO_COUNT > 8) ? 34 : ((DEMO_COUNT > 7) ? 36 : ((DEMO_COUNT > 5) ? 42 : 46))));

    for (size_t i = 0; i < DEMO_COUNT; i++) {
        int x = 16;
        int y = start_y + (int)i * step_y;
        s_cards[i] = ui_pixel_panel_create(s_menu_scr, x, y, 208, card_h, UI_PAPER);
        if (DEMO_COUNT > 8) {
            lv_obj_set_style_pad_top(s_cards[i], 1, 0);
            lv_obj_set_style_pad_bottom(s_cards[i], 1, 0);
        }
        s_rows[i] = lv_label_create(s_cards[i]);
        lv_obj_set_style_text_font(s_rows[i], &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(s_rows[i], LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(s_rows[i]);
    }

    int mascot_y = (DEMO_COUNT >= 11) ? 280 : ((DEMO_COUNT >= 10) ? 275 : ((DEMO_COUNT > 7) ? 286 : 268));
    s_mascot = ui_pixel_mascot_create(s_menu_scr, 101, mascot_y);

    menu_refresh();
    lv_screen_load(s_menu_scr);
}

static void enter_menu(void) {
    s_active = -1;
    menu_build();
}

void bsp_demo_return_to_menu(void) {
    if (s_active >= 0) {
        int old_active = s_active;
        s_active = -1;
        enter_menu();
        DEMOS[old_active].exit();
    }
}

// 按键回调运行在 button 组件的任务里,操作 LVGL 必须加锁。
static void on_key(bsp_btn_t btn, bsp_btn_ev_t ev, void *user) {
    (void)user;
    if (!bsp_lvgl_lock(500)) return;

    if (s_active >= 0) {
        // 仅 OK 键长按全局拦截返回主菜单。纸飞机俯冲、海獭压板都只吃短于这个
        // 阈值的按住；到点一律回列表，不再给个别游戏另开更长的退出计时。
        if (btn == BSP_BTN_OK && ev == BSP_BTN_LONG) {
            bsp_demo_return_to_menu();
        } else {
            DEMOS[s_active].key(btn, ev);
        }
    } else {
        // 主菜单状态：每次点击精确步进一项，绝不跳格连跳！
        if (ev == BSP_BTN_CLICK) {
            if (btn == BSP_BTN_UP) {
                s_sel = (s_sel + DEMO_COUNT - 1) % DEMO_COUNT;
                menu_refresh();
                ui_pixel_mascot_jump(s_mascot);
            } else if (btn == BSP_BTN_DOWN) {
                s_sel = (s_sel + 1) % DEMO_COUNT;
                menu_refresh();
                ui_pixel_mascot_jump(s_mascot);
            } else if (btn == BSP_BTN_OK && s_ok[s_sel]) {
                s_active = s_sel;
                ui_pixel_mascot_jump(s_mascot);
                lv_obj_t *old_menu = s_menu_scr;
                s_menu_scr = NULL;
                s_mascot = NULL;
                DEMOS[s_active].enter();
                if (old_menu) {
                    lv_obj_delete(old_menu);
                }
            }
        }
    }
    bsp_lvgl_unlock();
}

void app_main(void) {
    ESP_LOGI(TAG, "FoloToy AI Passport 街机掌机启动");
    esp_sleep_wakeup_cause_t wakeup = esp_sleep_get_wakeup_cause();
    if (wakeup != ESP_SLEEP_WAKEUP_UNDEFINED) {
        ESP_LOGI(TAG, "休眠唤醒原因: %d", wakeup);
    }

    bsp_i2c_init();
    bsp_i2c_scan();

    // 屏幕是本 demo 的 UI 载体,失败就没有菜单可言
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

    for (size_t i = 0; i < DEMO_COUNT; i++) {
        s_ok[i] = btn_ok;
    }

    if (bsp_lvgl_lock(1000)) {
        s_sel = 0; // 默认选中 Tank 1990
        enter_menu();
        bsp_lvgl_unlock();
    }

    ESP_LOGI(TAG, "街机就绪，主菜单已载入，首项: %s", DEMOS[0].name);
}
