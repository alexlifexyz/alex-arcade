// main/demo_match3.c —— 《赛博晶核消消乐》(Cyber Match-3: Neon Pop) 固件实现
// 零 DRAM 显存开销即时矢量绘制，极致灵敏三键操控(UP/DOWN/OK)，16kHz 街机复古合成音效。
#include "demo.h"
#include "match3_logic.h"
#include "bsp_display.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_button.h"
#include "lvgl.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

static const char *TAG __attribute__((unused)) = "demo_match3";

#define SCREEN_W 240
#define SCREEN_H 320

// 棋盘几何尺寸 (居中显示，完美贴合 240x320 屏)
#define BOARD_X      12
#define BOARD_Y      50
#define CELL_W       36
#define CELL_H       31
#define GEM_PAD_X    2
#define GEM_PAD_Y    2

static match3_game_t s_game;
static lv_obj_t     *s_scr = NULL;
static lv_obj_t     *s_playfield = NULL;
static lv_timer_t   *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint32_t      s_frame_tick = 0;
static uint8_t       s_volume = 85;

// 独立后台音效合成任务 (16kHz 16-bit 街机芯片音效)
static void match3_audio_task(void *arg)
{
    (void)arg;
    match3_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(50)) == pdTRUE) {
            if (snd == M3_SND_NONE) continue;

            if (snd == M3_SND_CURSOR) {
                // 微弱清脆咔哒 (800Hz 方波, 12ms)
                const int total = 192;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * 3500.0f;
                    buf[i % 256] = ((i / 10) % 2 == 0) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == M3_SND_LOCK) {
                // 锁定双音 (600Hz -> 1000Hz, 30ms)
                const int total = 480;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 600.0f + t * 400.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.3f) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == M3_SND_SWAP) {
                // 极速滑步 (400Hz -> 750Hz, 40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 400.0f + t * 350.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)5000 : -(int16_t)5000;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == M3_SND_MATCH) {
                // 消除升调经典叮咚 (523Hz C5 -> 659Hz E5 -> 784Hz G5, 70ms)
                const int total = 1120;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = (t < 0.33f) ? 523.0f : (t < 0.66f ? 659.0f : 784.0f);
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.5f) * 7500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == M3_SND_SPECIAL_SPAWN || snd == M3_SND_SPECIAL_EXPLODE) {
                // 爆炸与全屏能量声 (高八度扫频 + 白噪声, 120ms)
                const int total = 1920;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 1200.0f - t * 800.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int16_t tone = (phase < 0.5f) ? 6000 : -6000;
                    int16_t noise = (int16_t)((rand() % 8000) - 4000);
                    float amp = (1.0f - t) * 0.8f;
                    buf[i % 256] = (int16_t)((tone * 0.6f + noise * 0.4f) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == M3_SND_INVALID) {
                // 弹回顿挫低音 (220Hz -> 140Hz, 40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 220.0f - t * 80.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            }
        }
    }
    vTaskDelete(NULL);
}

static inline void send_sound(match3_sound_t snd)
{
    if (s_snd_queue && snd != M3_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 零 DRAM 显存开销即时矩形绘制
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t hex_color)
{
    if (w <= 0 || h <= 0) return;
    if (x < 0) { w += x; x = 0; if (w <= 0) return; }
    if (y < 0) { h += y; y = 0; if (h <= 0) return; }
    if (x >= SCREEN_W || y >= SCREEN_H) return;
    if (x + w > SCREEN_W) w = SCREEN_W - x;
    if (y + h > SCREEN_H) h = SCREEN_H - y;

    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(hex_color);
    dsc.bg_opa = LV_OPA_COVER;
    dsc.border_width = 0;
    lv_area_t coords = {
        .x1 = x,
        .y1 = y,
        .x2 = x + w - 1,
        .y2 = y + h - 1,
    };
    lv_draw_rect(layer, &dsc, &coords);
}

// 绘制单颗精致像素晶核 (立体高光、切角倒边与特殊属性标识)
static void draw_gem(lv_layer_t *layer, int x, int y, int w, int h, match3_gem_t gem, bool flash)
{
    match3_gem_type_t col = match3_get_color(gem);
    uint8_t spec = match3_get_special(gem);

    if (col == GEM_NONE && spec != SPECIAL_RAINBOW) return;

    if (flash) {
        // 消除闪烁高白态
        draw_box(layer, x, y, w, h, 0xFFFFFF);
        draw_box(layer, x + 2, y + 2, w - 4, h - 4, 0xFDE047);
        return;
    }

    uint32_t bg_hex = 0x1E293B;
    uint32_t face_hex = 0x38BDF8;
    uint32_t hi_hex = 0xBAE6FD;
    uint32_t shadow_hex = 0x0369A1;

    switch (col) {
        case GEM_RED:    // 烈焰红
            bg_hex = 0x7F1D1D; face_hex = 0xEF4444; hi_hex = 0xFCA5A5; shadow_hex = 0x991B1B; break;
        case GEM_BLUE:   // 冰霜蓝
            bg_hex = 0x0C4A6E; face_hex = 0x0284C7; hi_hex = 0x7DD3FC; shadow_hex = 0x075985; break;
        case GEM_GREEN:  // 翡翠绿
            bg_hex = 0x14532D; face_hex = 0x22C55E; hi_hex = 0x86EFAC; shadow_hex = 0x16A34A; break;
        case GEM_YELLOW: // 电浆金
            bg_hex = 0x713F12; face_hex = 0xEAB308; hi_hex = 0xFEF08A; shadow_hex = 0xCA8A04; break;
        case GEM_PURPLE: // 虚空紫
            bg_hex = 0x4C1D95; face_hex = 0xA855F7; hi_hex = 0xE9D5FF; shadow_hex = 0x7E22CE; break;
        default: break;
    }

    if (spec == SPECIAL_RAINBOW) {
        // 彩虹星核: 动态流动彩虹
        uint32_t rainbow_colors[6] = {0xEF4444, 0xF97316, 0xEAB308, 0x22C55E, 0x06B6D4, 0x8B5CF6};
        face_hex = rainbow_colors[(s_frame_tick / 4) % 6];
        hi_hex = 0xFFFFFF;
        shadow_hex = 0x1E1B4B;
    }

    // 1. 宝石外层暗切角底座
    draw_box(layer, x + 2, y, w - 4, h, bg_hex);
    draw_box(layer, x, y + 2, w, h - 4, bg_hex);

    // 2. 宝石主晶面 (立体切面)
    draw_box(layer, x + 2, y + 2, w - 4, h - 4, face_hex);

    // 3. 顶部/左部立体高光棱线
    draw_box(layer, x + 3, y + 3, w - 6, 2, hi_hex);
    draw_box(layer, x + 3, y + 5, 2, h - 10, hi_hex);

    // 4. 底部/右部深色阴影棱线
    draw_box(layer, x + 3, y + h - 5, w - 6, 2, shadow_hex);
    draw_box(layer, x + w - 5, y + 5, 2, h - 10, shadow_hex);

    // 5. 特殊宝石标志符绘制
    if (spec == SPECIAL_ROW_LASER) {
        // 横向激光线
        draw_box(layer, x + 4, y + h / 2 - 1, w - 8, 3, 0xFFFFFF);
    } else if (spec == SPECIAL_COL_LASER) {
        // 纵向激光线
        draw_box(layer, x + w / 2 - 1, y + 4, 3, h - 8, 0xFFFFFF);
    } else if (spec == SPECIAL_BOMB) {
        // 十字炸弹核
        draw_box(layer, x + w / 2 - 4, y + h / 2 - 4, 8, 8, 0x000000);
        draw_box(layer, x + w / 2 - 3, y + h / 2 - 3, 6, 6, 0xFFFFFF);
    } else if (spec == SPECIAL_RAINBOW) {
        // 彩虹核心耀斑
        draw_box(layer, x + w / 2 - 3, y + h / 2 - 3, 6, 6, 0xFFFFFF);
    }
}

// 主画布绘制回调 (LV_EVENT_DRAW_MAIN)
static void on_draw_playfield(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);

    // 1. 背景沉浸深黑
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x0A0F1D);

    // 2. 顶部 HUD
    // 分数板与步数
    draw_box(layer, 8, 8, 140, 32, 0x111827);
    draw_box(layer, 8, 8, 140, 2, 0x38BDF8); // 顶边高亮

    draw_box(layer, 154, 8, 78, 32, 0x111827);
    draw_box(layer, 154, 8, 78, 2, 0xF59E0B);

    // 狂暴能量条 (Fever Bar)
    draw_box(layer, 8, 42, 224, 4, 0x1F2937);
    int fever_w = (s_game.fever_energy * 224) / 100;
    uint32_t fever_color = s_game.fever_active ? 0xEF4444 : 0x06B6D4;
    if (fever_w > 0) {
        draw_box(layer, 8, 42, fever_w, 4, fever_color);
    }

    // 3. 棋盘底衬与网格槽位
    draw_box(layer, BOARD_X - 2, BOARD_Y - 2, MATCH3_COLS * CELL_W + 4, MATCH3_ROWS * CELL_H + 4, 0x161E2E);
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            int gx = BOARD_X + c * CELL_W;
            int gy = BOARD_Y + r * CELL_H;
            draw_box(layer, gx, gy, CELL_W, CELL_H, 0x0F172A);
            draw_box(layer, gx + 1, gy + 1, CELL_W - 2, CELL_H - 2, 0x1E293B);
        }
    }

    // 4. 绘制全部宝石 (支持平滑交换插值)
    for (int r = 0; r < MATCH3_ROWS; r++) {
        for (int c = 0; c < MATCH3_COLS; c++) {
            match3_gem_t gem = s_game.board[r][c];
            if (gem == GEM_NONE) continue;

            int gx = BOARD_X + c * CELL_W + GEM_PAD_X;
            int gy = BOARD_Y + r * CELL_H + GEM_PAD_Y;
            int gw = CELL_W - GEM_PAD_X * 2;
            int gh = CELL_H - GEM_PAD_Y * 2;

            // 如果处于交换状态，处理位置位移动画
            if (s_game.state == STATE_ANIM_SWAP) {
                float p = s_game.swap_progress;
                if (r == s_game.selected_r && c == s_game.selected_c) {
                    int tx = BOARD_X + s_game.target_c * CELL_W + GEM_PAD_X;
                    int ty = BOARD_Y + s_game.target_r * CELL_H + GEM_PAD_Y;
                    gx = (int)(gx + (tx - gx) * p);
                    gy = (int)(gy + (ty - gy) * p);
                } else if (r == s_game.target_r && c == s_game.target_c) {
                    int tx = BOARD_X + s_game.selected_c * CELL_W + GEM_PAD_X;
                    int ty = BOARD_Y + s_game.selected_r * CELL_H + GEM_PAD_Y;
                    gx = (int)(gx + (tx - gx) * p);
                    gy = (int)(gy + (ty - gy) * p);
                }
            }

            bool flash = (s_game.state == STATE_ANIM_CLEAR && s_game.clear_mask[r][c]);
            draw_gem(layer, gx, gy, gw, gh, gem, flash);
        }
    }

    // 5. 绘制光标与指示框 (无阻塞极速反馈)
    if (s_game.state == STATE_SELECT_SRC) {
        // 自由光标: 金黄发光边框 + 4 拐角像素重音
        int cx = BOARD_X + s_game.cursor_c * CELL_W;
        int cy = BOARD_Y + s_game.cursor_r * CELL_H;
        // 呼吸效果
        uint32_t cursor_col = ((s_frame_tick / 4) % 2 == 0) ? 0xFBBF24 : 0xF59E0B;
        draw_box(layer, cx, cy, CELL_W, 2, cursor_col);
        draw_box(layer, cx, cy + CELL_H - 2, CELL_W, 2, cursor_col);
        draw_box(layer, cx, cy, 2, CELL_H, cursor_col);
        draw_box(layer, cx + CELL_W - 2, cy, 2, CELL_H, cursor_col);
    } else if (s_game.state == STATE_SELECT_DIR) {
        // 基准锁定框 (绿/紫脉冲)
        int sx = BOARD_X + s_game.selected_c * CELL_W;
        int sy = BOARD_Y + s_game.selected_r * CELL_H;
        draw_box(layer, sx, sy, CELL_W, 2, 0x10B981);
        draw_box(layer, sx, sy + CELL_H - 2, CELL_W, 2, 0x10B981);
        draw_box(layer, sx, sy, 2, CELL_H, 0x10B981);
        draw_box(layer, sx + CELL_W - 2, sy, 2, CELL_H, 0x10B981);

        // 目标邻居框 (青蓝高亮 + 动感提示)
        int tx = BOARD_X + s_game.target_c * CELL_W;
        int ty = BOARD_Y + s_game.target_r * CELL_H;
        draw_box(layer, tx, ty, CELL_W, 2, 0x38BDF8);
        draw_box(layer, tx, ty + CELL_H - 2, CELL_W, 2, 0x38BDF8);
        draw_box(layer, tx, ty, 2, CELL_H, 0x38BDF8);
        draw_box(layer, tx + CELL_W - 2, ty, 2, CELL_H, 0x38BDF8);
    }

    // 6. 底部提示栏
    draw_box(layer, 0, 280, SCREEN_W, 40, 0x0B1329);
    draw_box(layer, 0, 280, SCREEN_W, 1, 0x1E293B);
}

// 刷新定时器 (每 25ms 推进一帧，40 FPS，零卡顿)
static void match3_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    match3_step(&s_game, 25);

    if (s_game.pending_sound != M3_SND_NONE) {
        send_sound(s_game.pending_sound);
        s_game.pending_sound = M3_SND_NONE;
    }

    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 供 demo 统一调用的三键事件分发
void demo_match3_enter(void)
{
    match3_init(&s_game, 0x54321, 25, 15000);

    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x0A0F1D), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(s_playfield, on_draw_playfield, LV_EVENT_DRAW_MAIN, NULL);

    // 启动音频合成任务
    s_audio_running = true;
    s_snd_queue = xQueueCreate(8, sizeof(match3_sound_t));
    xTaskCreate(match3_audio_task, "m3_audio", 4096, NULL, 5, &s_snd_task);

    // 启动 40 FPS 超高灵敏定时器
    s_game_timer = lv_timer_create(match3_timer_cb, 25, NULL);

    lv_screen_load(s_scr);
}

void demo_match3_exit(void)
{
    if (s_game_timer) {
        lv_timer_delete(s_game_timer);
        s_game_timer = NULL;
    }

    s_audio_running = false;
    if (s_snd_task) {
        vTaskDelete(s_snd_task);
        s_snd_task = NULL;
    }
    if (s_snd_queue) {
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }

    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
    }
}

void demo_match3_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 按下瞬间即刻触发，0ms 延迟，手感干脆利落
    if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK) {
        static uint32_t s_last_press_tick = 0;
        uint32_t now = esp_log_timestamp();
        if (now - s_last_press_tick < 40) return; // 40ms 防抖
        s_last_press_tick = now;

        if (btn == BSP_BTN_UP) {
            match3_input_up(&s_game);
        } else if (btn == BSP_BTN_DOWN) {
            match3_input_down(&s_game);
        } else if (btn == BSP_BTN_OK) {
            match3_input_ok(&s_game);
        }

        if (s_game.pending_sound != M3_SND_NONE) {
            send_sound(s_game.pending_sound);
            s_game.pending_sound = M3_SND_NONE;
        }

        if (s_playfield) {
            lv_obj_invalidate(s_playfield);
        }
    }
}
