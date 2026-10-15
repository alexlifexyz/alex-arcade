// main/demo_roulette.c —— 《恶魔轮盘赌：赛博对决》(Cyber Buckshot Roulette)
#include "demo.h"
#include "roulette_logic.h"
#include "bsp_display.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "ui_pixel.h"
#include "lvgl.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include <stdio.h>
#include <string.h>

static const char *TAG __attribute__((unused)) = "demo_roulette";

typedef enum {
    SFX_NONE = 0,
    SFX_CLICK, // 空弹咔哒
    SFX_BOOM,  // 实弹轰鸣
    SFX_RACK,  // 上膛/退弹
    SFX_WIN,   // 获胜旋律
    SFX_LOSE,  // 失败低鸣
} sfx_t;

static roulette_game_t s_game;
static bool s_selecting_item = false;
static int s_item_cursor = 0;

static lv_obj_t *s_scr;
static lv_obj_t *s_top_bar;
static lv_obj_t *s_battery_label;
static lv_obj_t *s_chamber_label;
static lv_obj_t *s_dealer_panel;
static lv_obj_t *s_dealer_hp_label;
static lv_obj_t *s_dealer_items_label;
static lv_obj_t *s_dealer_msg_label;
static lv_obj_t *s_center_panel;
static lv_obj_t *s_gun_status_label;
static lv_obj_t *s_shot_result_label;
static lv_obj_t *s_player_panel;
static lv_obj_t *s_player_hp_label;
static lv_obj_t *s_player_items_label;
static lv_obj_t *s_guide_label;

static lv_timer_t *s_timer;
static QueueHandle_t s_sfx_queue;
static TaskHandle_t s_sfx_task;
static int s_ai_delay_ticks = 0;
static int s_flash_ticks = 0;

static void queue_sfx(sfx_t sfx)
{
    if (s_sfx_queue) {
        xQueueSend(s_sfx_queue, &sfx, 0);
    }
}

static void audio_worker_task(void *arg)
{
    (void)arg;
    sfx_t sfx;
    int16_t buf[256];

    while (1) {
        if (xQueueReceive(s_sfx_queue, &sfx, portMAX_DELAY) == pdTRUE) {
            if (sfx == SFX_NONE) continue;
            bsp_audio_set_format(16000, 16, 1);
            bsp_audio_set_volume(90);

            if (sfx == SFX_CLICK) {
                // 机械金属清脆咔哒声 (25ms 高频窄脉冲)
                for (int i = 0; i < 200; i++) {
                    buf[i] = (i % 8 < 4) ? 7000 : -7000;
                }
                bsp_audio_write(buf, 200 * sizeof(int16_t));
            } else if (sfx == SFX_BOOM) {
                // 实弹开火爆炸声 (250ms 衰减低音)
                for (int c = 0; c < 15; c++) {
                    int amp = 9000 - c * 550;
                    if (amp < 0) amp = 0;
                    for (int i = 0; i < 256; i++) {
                        buf[i] = (int16_t)(((rand() % 65536) - 32768) * amp / 32768);
                    }
                    bsp_audio_write(buf, 256 * sizeof(int16_t));
                }
            } else if (sfx == SFX_RACK) {
                // 退膛上膛咔咔两声
                for (int i = 0; i < 150; i++) buf[i] = (i % 12 < 6) ? 5000 : -5000;
                bsp_audio_write(buf, 150 * sizeof(int16_t));
                vTaskDelay(pdMS_TO_TICKS(40));
                for (int i = 0; i < 180; i++) buf[i] = (i % 10 < 5) ? 6000 : -6000;
                bsp_audio_write(buf, 180 * sizeof(int16_t));
            } else if (sfx == SFX_WIN) {
                // 胜利三音阶
                int tones[] = { 1000, 1300, 1600, 2000 };
                for (int t = 0; t < 4; t++) {
                    int period = 16000 / tones[t];
                    int phase = 0;
                    for (int i = 0; i < 256; i++) {
                        buf[i] = (phase < period / 2) ? 6000 : -6000;
                        if (++phase >= period) phase = 0;
                    }
                    bsp_audio_write(buf, 256 * sizeof(int16_t));
                    vTaskDelay(pdMS_TO_TICKS(50));
                }
            } else if (sfx == SFX_LOSE) {
                // 失败下行低音
                int tones[] = { 800, 600, 450, 300 };
                for (int t = 0; t < 4; t++) {
                    int period = 16000 / tones[t];
                    int phase = 0;
                    for (int i = 0; i < 256; i++) {
                        buf[i] = (phase < period / 2) ? 6000 : -6000;
                        if (++phase >= period) phase = 0;
                    }
                    bsp_audio_write(buf, 256 * sizeof(int16_t));
                    vTaskDelay(pdMS_TO_TICKS(70));
                }
            }
        }
    }
}

static void update_ui(void)
{
    if (!s_scr) return;

    // 1. 电量显示
    int soc = bsp_battery_soc();
    if (soc >= 0 && soc <= 100) {
        lv_label_set_text_fmt(s_battery_label, "BAT: %d%%", soc);
    } else {
        lv_label_set_text(s_battery_label, "BAT: --");
    }

    // 2. 弹仓概况
    lv_label_set_text_fmt(s_chamber_label,
        "ROUND %d | LIVE: #ff3344 %d#  BLANK: #00e5ff %d#",
        s_game.round_number, s_game.live_count, s_game.blank_count);

    // 3. 恶魔状态
    char hp_str[32] = {0};
    for (int i = 0; i < s_game.dealer_max_hp; i++) {
        strcat(hp_str, (i < s_game.dealer_hp) ? "[*]" : "[ ]");
    }
    lv_label_set_text_fmt(s_dealer_hp_label, "DEMON HP: %s (%d/%d)",
                          hp_str, s_game.dealer_hp, s_game.dealer_max_hp);

    char dealer_items[48] = "ITEMS: ";
    for (int i = 0; i < ROULETTE_MAX_ITEMS; i++) {
        if (s_game.dealer_items[i] != ITEM_NONE) {
            strcat(dealer_items, roulette_item_name(s_game.dealer_items[i]));
            strcat(dealer_items, " ");
        }
    }
    lv_label_set_text(s_dealer_items_label, dealer_items);
    lv_label_set_text(s_dealer_msg_label, s_game.message);

    // 4. 枪支与状态
    if (s_game.is_sawed) {
        lv_label_set_text(s_gun_status_label, ">> SHOTGUN (SAWED: 2X DMG) <<");
        lv_obj_set_style_text_color(s_gun_status_label, lv_color_hex(0xFF9900), 0);
    } else {
        lv_label_set_text(s_gun_status_label, "== 12-GAUGE SHOTGUN ==");
        lv_obj_set_style_text_color(s_gun_status_label, lv_color_hex(0xCCCCCC), 0);
    }

    // 5. 玩家状态
    char p_hp_str[32] = {0};
    for (int i = 0; i < s_game.player_max_hp; i++) {
        strcat(p_hp_str, (i < s_game.player_hp) ? "[*]" : "[ ]");
    }
    lv_label_set_text_fmt(s_player_hp_label, "YOU HP:   %s (%d/%d)",
                          p_hp_str, s_game.player_hp, s_game.player_max_hp);

    // 玩家道具栏 (若在选道具模式则高亮)
    char p_items[64] = "ITEMS: ";
    for (int i = 0; i < ROULETTE_MAX_ITEMS; i++) {
        if (s_selecting_item && i == s_item_cursor) {
            strcat(p_items, ">");
            strcat(p_items, roulette_item_name(s_game.player_items[i]));
            strcat(p_items, "< ");
        } else {
            strcat(p_items, "[");
            strcat(p_items, roulette_item_name(s_game.player_items[i]));
            strcat(p_items, "] ");
        }
    }
    lv_label_set_text(s_player_items_label, p_items);

    // 6. 底部操作指引
    if (s_game.phase == PHASE_GAME_WIN) {
        lv_label_set_text(s_guide_label, "VICTORY! YOU SURVIVED!\n[OK] TO PLAY AGAIN");
        lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x00FF66), 0);
    } else if (s_game.phase == PHASE_GAME_LOSE) {
        lv_label_set_text(s_guide_label, "DEFEAT! DEMON CLAIMS YOUR SOUL\n[OK] TO RETRY");
        lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFF3333), 0);
    } else if (s_selecting_item) {
        lv_label_set_text(s_guide_label, "UP/DOWN: SELECT ITEM | OK: USE\nLONG OK: CANCEL");
        lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFFCC00), 0);
    } else if (s_game.phase == PHASE_PLAYER_TURN) {
        lv_label_set_text(s_guide_label, "UP: SHOOT SELF (BONUS TURN)\nDOWN: SHOOT DEMON | OK: ITEMS");
        lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFFFFFF), 0);
    } else {
        lv_label_set_text(s_guide_label, "DEMON IS THINKING...\nWAIT FOR OPPONENT MOVE");
        lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xAAAAAA), 0);
    }
}

static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;

    // 屏幕开枪闪烁效果恢复
    if (s_flash_ticks > 0) {
        s_flash_ticks--;
        if (s_flash_ticks == 0) {
            lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x0A0D14), 0);
        }
    }

    // 恶魔 AI 思考与执行时钟
    if (s_game.phase == PHASE_DEALER_TURN) {
        s_ai_delay_ticks++;
        if (s_ai_delay_ticks >= 20) { // 约 1.0 秒思考
            s_ai_delay_ticks = 0;
            shot_result_t shot;
            char action_desc[64] = {0};
            memset(&shot, 0, sizeof(shot));
            roulette_dealer_ai_step(&s_game, &shot, action_desc);

            if (action_desc[0] != '\0') {
                lv_label_set_text(s_shot_result_label, action_desc);
            }
            if (shot.damage > 0) {
                queue_sfx(SFX_BOOM);
                lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x550000), 0);
                s_flash_ticks = 4;
            } else if (!shot.is_live && (shot.detail[0] != '\0')) {
                queue_sfx(SFX_CLICK);
            }

            if (shot.chamber_emptied) {
                queue_sfx(SFX_RACK);
            }
            if (s_game.phase == PHASE_GAME_WIN) {
                queue_sfx(SFX_WIN);
            } else if (s_game.phase == PHASE_GAME_LOSE) {
                queue_sfx(SFX_LOSE);
            }

            update_ui();
        }
    }
}

void demo_roulette_enter(void)
{
    roulette_init(&s_game);
    s_selecting_item = false;
    s_item_cursor = 0;
    s_ai_delay_ticks = 0;
    s_flash_ticks = 0;

    // 创建音频工作队列与任务
    if (!s_sfx_queue) {
        s_sfx_queue = xQueueCreate(8, sizeof(sfx_t));
        xTaskCreate(audio_worker_task, "roulette_sfx", 3072, NULL, 5, &s_sfx_task);
    }
    queue_sfx(SFX_RACK);

    // 主屏幕背景 (暗色赛博风格)
    s_scr = lv_obj_create(NULL);
    lv_obj_remove_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x0A0D14), 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);
    lv_obj_set_style_pad_all(s_scr, 6, 0);

    // 1. 顶栏 (标题 + 电量)
    s_top_bar = lv_label_create(s_scr);
    lv_obj_set_pos(s_top_bar, 8, 6);
    lv_label_set_text(s_top_bar, "CYBER ROULETTE");
    lv_obj_set_style_text_font(s_top_bar, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_top_bar, lv_color_hex(0xFF4455), 0);

    s_battery_label = lv_label_create(s_scr);
    lv_obj_set_pos(s_battery_label, 165, 6);
    lv_label_set_text(s_battery_label, "BAT: --");
    lv_obj_set_style_text_font(s_battery_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_battery_label, lv_color_hex(0x8899AA), 0);

    // 2. 弹仓状态框
    s_chamber_label = lv_label_create(s_scr);
    lv_label_set_recolor(s_chamber_label, true);
    lv_obj_set_pos(s_chamber_label, 8, 28);
    lv_obj_set_size(s_chamber_label, 224, 24);
    lv_obj_set_style_text_font(s_chamber_label, &lv_font_montserrat_14, 0);

    // 3. 恶魔面板
    s_dealer_panel = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_dealer_panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(s_dealer_panel, 8, 56);
    lv_obj_set_size(s_dealer_panel, 224, 80);
    lv_obj_set_style_bg_color(s_dealer_panel, lv_color_hex(0x18141D), 0);
    lv_obj_set_style_border_color(s_dealer_panel, lv_color_hex(0x662233), 0);
    lv_obj_set_style_border_width(s_dealer_panel, 1, 0);
    lv_obj_set_style_pad_all(s_dealer_panel, 4, 0);

    s_dealer_hp_label = lv_label_create(s_dealer_panel);
    lv_obj_set_pos(s_dealer_hp_label, 4, 2);
    lv_obj_set_style_text_font(s_dealer_hp_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_dealer_hp_label, lv_color_hex(0xFF3344), 0);

    s_dealer_items_label = lv_label_create(s_dealer_panel);
    lv_obj_set_pos(s_dealer_items_label, 4, 22);
    lv_obj_set_style_text_font(s_dealer_items_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_dealer_items_label, lv_color_hex(0x99AABB), 0);

    s_dealer_msg_label = lv_label_create(s_dealer_panel);
    lv_obj_set_pos(s_dealer_msg_label, 4, 42);
    lv_obj_set_size(s_dealer_msg_label, 212, 32);
    lv_obj_set_style_text_font(s_dealer_msg_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_dealer_msg_label, lv_color_hex(0xDDEEFF), 0);

    // 4. 中间射击与枪管展示
    s_center_panel = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_center_panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(s_center_panel, 8, 142);
    lv_obj_set_size(s_center_panel, 224, 52);
    lv_obj_set_style_bg_color(s_center_panel, lv_color_hex(0x111622), 0);
    lv_obj_set_style_border_color(s_center_panel, lv_color_hex(0x223344), 0);
    lv_obj_set_style_border_width(s_center_panel, 1, 0);
    lv_obj_set_style_pad_all(s_center_panel, 4, 0);

    s_gun_status_label = lv_label_create(s_center_panel);
    lv_obj_set_pos(s_gun_status_label, 4, 2);
    lv_obj_set_style_text_font(s_gun_status_label, &lv_font_montserrat_14, 0);

    s_shot_result_label = lv_label_create(s_center_panel);
    lv_obj_set_pos(s_shot_result_label, 4, 24);
    lv_obj_set_size(s_shot_result_label, 212, 22);
    lv_obj_set_style_text_font(s_shot_result_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_shot_result_label, lv_color_hex(0x00E5FF), 0);
    lv_label_set_text(s_shot_result_label, "WEAPON LOADED");

    // 5. 玩家状态面板
    s_player_panel = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_player_panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(s_player_panel, 8, 200);
    lv_obj_set_size(s_player_panel, 224, 60);
    lv_obj_set_style_bg_color(s_player_panel, lv_color_hex(0x131A18), 0);
    lv_obj_set_style_border_color(s_player_panel, lv_color_hex(0x225533), 0);
    lv_obj_set_style_border_width(s_player_panel, 1, 0);
    lv_obj_set_style_pad_all(s_player_panel, 4, 0);

    s_player_hp_label = lv_label_create(s_player_panel);
    lv_obj_set_pos(s_player_hp_label, 4, 2);
    lv_obj_set_style_text_font(s_player_hp_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_player_hp_label, lv_color_hex(0x33DD66), 0);

    s_player_items_label = lv_label_create(s_player_panel);
    lv_obj_set_pos(s_player_items_label, 4, 26);
    lv_obj_set_style_text_font(s_player_items_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_player_items_label, lv_color_hex(0xEEDD88), 0);

    // 6. 底部操作指引
    s_guide_label = lv_label_create(s_scr);
    lv_obj_set_pos(s_guide_label, 8, 268);
    lv_obj_set_size(s_guide_label, 224, 46);
    lv_obj_set_style_text_align(s_guide_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(s_guide_label, &lv_font_montserrat_14, 0);

    update_ui();

    // 启动 50ms 刷新定时器
    s_timer = lv_timer_create(game_timer_cb, 50, NULL);
    lv_screen_load(s_scr);
}

void demo_roulette_exit(void)
{
    if (s_timer) {
        lv_timer_delete(s_timer);
        s_timer = NULL;
    }
    if (s_sfx_task) {
        vTaskDelete(s_sfx_task);
        s_sfx_task = NULL;
    }
    if (s_sfx_queue) {
        vQueueDelete(s_sfx_queue);
        s_sfx_queue = NULL;
    }
    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_top_bar = s_battery_label = s_chamber_label = NULL;
        s_dealer_panel = s_dealer_hp_label = s_dealer_items_label = s_dealer_msg_label = NULL;
        s_center_panel = s_gun_status_label = s_shot_result_label = NULL;
        s_player_panel = s_player_hp_label = s_player_items_label = s_guide_label = NULL;
    }
}

void demo_roulette_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK && ev != BSP_BTN_LONG) return;

    // 游戏结束状态：任意键重开
    if (s_game.phase == PHASE_GAME_WIN || s_game.phase == PHASE_GAME_LOSE) {
        if (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS) {
            demo_roulette_enter();
        }
        return;
    }

    if (s_game.phase != PHASE_PLAYER_TURN) {
        return; // 非玩家回合不响应按键
    }

    // 模式 A：选择并使用道具
    if (s_selecting_item) {
        if (btn == BSP_BTN_OK && ev == BSP_BTN_LONG) {
            s_selecting_item = false;
            update_ui();
            return;
        }
        if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) return;

        if (btn == BSP_BTN_UP) {
            s_item_cursor = (s_item_cursor + ROULETTE_MAX_ITEMS - 1) % ROULETTE_MAX_ITEMS;
            update_ui();
        } else if (btn == BSP_BTN_DOWN) {
            s_item_cursor = (s_item_cursor + 1) % ROULETTE_MAX_ITEMS;
            update_ui();
        } else if (btn == BSP_BTN_OK) {
            char desc[48] = {0};
            if (roulette_use_item(&s_game, s_item_cursor, true, desc)) {
                queue_sfx(SFX_RACK);
                lv_label_set_text(s_shot_result_label, desc);
            }
            s_selecting_item = false;
            update_ui();
        }
        return;
    }

    // 模式 B：常规射击抉择
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) return;

    if (btn == BSP_BTN_UP) {
        // 对自己开火！
        shot_result_t res = roulette_fire(&s_game, TARGET_SELF, true);
        if (res.is_live) {
            queue_sfx(SFX_BOOM);
            lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x550000), 0);
            s_flash_ticks = 4;
        } else {
            queue_sfx(SFX_CLICK);
        }
        lv_label_set_text(s_shot_result_label, res.detail);

        if (res.chamber_emptied) queue_sfx(SFX_RACK);
        if (s_game.phase == PHASE_GAME_WIN) queue_sfx(SFX_WIN);
        else if (s_game.phase == PHASE_GAME_LOSE) queue_sfx(SFX_LOSE);

        update_ui();
    } else if (btn == BSP_BTN_DOWN) {
        // 对恶魔开火！
        shot_result_t res = roulette_fire(&s_game, TARGET_OPPONENT, true);
        if (res.is_live) {
            queue_sfx(SFX_BOOM);
            lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x442200), 0);
            s_flash_ticks = 4;
        } else {
            queue_sfx(SFX_CLICK);
        }
        lv_label_set_text(s_shot_result_label, res.detail);

        if (res.chamber_emptied) queue_sfx(SFX_RACK);
        if (s_game.phase == PHASE_GAME_WIN) queue_sfx(SFX_WIN);
        else if (s_game.phase == PHASE_GAME_LOSE) queue_sfx(SFX_LOSE);

        update_ui();
    } else if (btn == BSP_BTN_OK) {
        // 进入道具选择模式
        s_selecting_item = true;
        s_item_cursor = 0;
        update_ui();
    }
}
