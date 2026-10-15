// main/demo_wind.c —— 《风与纸翼》(Wind Rider) 掌机固件驱动
// 极致心流 40 FPS，零堆内存分配，原生 LVGL 9.x 矢量合批绘制，16kHz 迎风翱翔拟音合成器。
#include "demo.h"
#include "wind_logic.h"
#include "bsp_display.h"
#include "bsp_audio.h"
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

static const char *TAG __attribute__((unused)) = "demo_wind";

#define SCREEN_W 240
#define SCREEN_H 320

static wind_game_t  s_game;
static lv_obj_t    *s_scr = NULL;
static lv_obj_t    *s_playfield = NULL;

// HUD 标签
static lv_obj_t    *s_hud_dist = NULL;
static lv_obj_t    *s_hud_spd = NULL;
static lv_obj_t    *s_hud_combo = NULL;
static lv_obj_t    *s_hint = NULL;

static lv_timer_t  *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint8_t       s_volume = 85;

static void send_sound(wind_sound_t snd)
{
    if (s_snd_queue && snd != WIND_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 快速后台音效合成任务 (16kHz 16-bit 空灵飞行与风息拟音)
static void wind_audio_task(void *arg)
{
    (void)arg;
    wind_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(40)) == pdTRUE) {
            if (snd == WIND_SND_NONE) continue;

            if (snd == WIND_SND_DIVE) {
                // 俯冲破风呼啸声 (降频气流白噪，40ms)
                const int total = 640;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 4200) - 2100;
                    float env = sinf(t * 3.14159f);
                    buf[i % 256] = (int16_t)(noise * env);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WIND_SND_SOAR) {
                // 展翼升空翱翔声 (升频空灵泛音，50ms)
                const int total = 800;
                float p = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 280.0f + t * 440.0f;
                    p += freq / 16000.0f;
                    if (p >= 1.0f) p -= 1.0f;
                    float amp = (1.0f - t) * 4600.0f;
                    buf[i % 256] = (p < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WIND_SND_RING) {
                // 穿透气流光环 (空灵清脆双音风铃，65ms)
                const int total = 1040;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p1 += 1046.5f / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f; // C6
                    p2 += 1318.5f / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f; // E6
                    float amp = expf(-t * 6.0f) * 4500.0f;
                    int16_t s1 = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (p2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WIND_SND_GLIDE) {
                // 草地贴地滑行沙沙声 (柔和轻噪，25ms)
                const int total = 400;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 2600) - 1300;
                    buf[i % 256] = (int16_t)(noise * (1.0f - t * 0.5f));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WIND_SND_CRYSTAL || snd == WIND_SND_DANDELION) {
                // 拾取风之水晶/蒲公英 (清脆高音星芒，30ms)
                const int total = 480;
                float p = 0.0f;
                float f = (snd == WIND_SND_CRYSTAL) ? 1567.98f : 1174.66f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p += f / 16000.0f; if (p >= 1.0f) p -= 1.0f;
                    float amp = (1.0f - t) * 4200.0f;
                    buf[i % 256] = (p < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            }
        }
    }
    vTaskDelete(NULL);
}

// 快速图元绘制辅助
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t color_hex)
{
    if (w <= 0 || h <= 0) return;
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(color_hex);
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

static inline void draw_round_box(lv_layer_t *layer, int x, int y, int w, int h, int radius, uint32_t color_hex)
{
    if (w <= 0 || h <= 0) return;
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(color_hex);
    dsc.bg_opa = LV_OPA_COVER;
    dsc.radius = radius;
    dsc.border_width = 0;
    lv_area_t coords = {
        .x1 = x,
        .y1 = y,
        .x2 = x + w - 1,
        .y2 = y + h - 1,
    };
    lv_draw_rect(layer, &dsc, &coords);
}

// 2D 旋转坐标映射
static inline void rot_pt(float cx, float cy, float ox, float oy, float cos_a, float sin_a, int *rx, int *ry)
{
    *rx = (int)(cx + ox * cos_a - oy * sin_a);
    *ry = (int)(cy + ox * sin_a + oy * cos_a);
}

// 绘制折纸飞机与绯红丝带
static void draw_paper_plane(lv_layer_t *layer, float cx, float cy, float pitch_deg)
{
    float rad = pitch_deg * (3.14159265f / 180.0f);
    float cos_a = cosf(rad);
    float sin_a = sinf(rad);

    // 1. 绯红灵动风痕丝带 (尾后飘逸波浪)
    int r1x, r1y, r2x, r2y, r3x, r3y;
    rot_pt(cx, cy, -14.0f, 0.0f, cos_a, sin_a, &r1x, &r1y);
    rot_pt(cx, cy, -22.0f, -3.0f, cos_a, sin_a, &r2x, &r2y);
    rot_pt(cx, cy, -30.0f, 2.0f, cos_a, sin_a, &r3x, &r3y);
    draw_round_box(layer, r1x - 2, r1y - 2, 8, 4, 2, 0xEF4444);
    draw_round_box(layer, r2x - 2, r2y - 2, 7, 3, 1, 0xF87171);
    draw_round_box(layer, r3x - 2, r3y - 2, 6, 2, 1, 0xFCA5A5);

    // 2. 纸飞机机身核心 (经典白折纸三角翼)
    // 机头到机翼上折线
    for (int step = 0; step < 16; step++) {
        float ox = 14.0f - (float)step * 1.6f;
        float oy_top = -(float)step * 0.45f;
        float oy_bot = +(float)step * 0.45f;
        int px1, py1, px2, py2;
        rot_pt(cx, cy, ox, oy_top, cos_a, sin_a, &px1, &py1);
        rot_pt(cx, cy, ox, oy_bot, cos_a, sin_a, &px2, &py2);
        draw_box(layer, px1, py1, 2, 2, 0xF8FAFC); // 上翼高光白
        draw_box(layer, px2, py2, 2, 2, 0xCBD5E1); // 下翼折纸阴影灰
    }
    // 机脊中线
    int nx, ny;
    rot_pt(cx, cy, 14.0f, 0.0f, cos_a, sin_a, &nx, &ny);
    draw_box(layer, nx - 1, ny - 1, 3, 3, 0xFFFFFF);
}

// 绘制天空、山丘、气流环、收集物与纸飞机
static void on_draw_playfield(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 天色心流渐变背景
    uint32_t top_col, bot_col;
    wind_get_sky_colors(s_game.sky_phase, s_game.sky_progress, &top_col, &bot_col);
    draw_box(layer, 0, 0, SCREEN_W, 120, top_col);
    draw_box(layer, 0, 120, SCREEN_W, 100, bot_col);

    // 2. 远景连绵山丘 (深色半透质感)
    for (int x = 0; x < SCREEN_W; x += 8) {
        float h = wind_get_ground_height((s_game.distance * 0.45f) + (float)x) - 28.0f;
        int gy = (int)h;
        if (gy < 0) gy = 0;
        int dh = SCREEN_H - gy;
        if (dh > 0) {
            draw_box(layer, x, gy, 8, dh, 0x312E81);
        }
    }

    // 3. 近景柔美丘陵草坡 (4 像素平滑矢量列)
    for (int x = 0; x < SCREEN_W; x += 4) {
        float h = wind_get_ground_height(s_game.distance + (float)x);
        int gy = (int)h;
        if (gy < 0) gy = 0;
        int dh = SCREEN_H - gy;
        if (dh > 0) {
            // 草坪明亮顶部线
            draw_box(layer, x, gy, 4, 3, 0x4ADE80);
            // 表层翠绿
            draw_box(layer, x, gy + 3, 4, 18, 0x16A34A);
            // 深邃地脉深绿
            if (dh > 21) {
                draw_box(layer, x, gy + 21, 4, dh - 21, 0x14532D);
            }
        }
    }

    // 4. 气流光环 (Wind Rings)
    for (int i = 0; i < WIND_MAX_RINGS; i++) {
        if (!s_game.rings[i].active) continue;
        float rx = s_game.rings[i].x - s_game.distance;
        if (rx < -30.0f || rx > SCREEN_W + 30.0f) continue;
        int ix = (int)rx;
        int iy = (int)s_game.rings[i].y;
        uint32_t ring_col = s_game.rings[i].passed ? 0x94A3B8 : 0xFACC15;

        // 椭圆光环外圈与内光
        draw_round_box(layer, ix - 12, iy - 22, 24, 44, 12, ring_col);
        draw_round_box(layer, ix - 8, iy - 18, 16, 36, 8, top_col);
    }

    // 5. 收集物绘制：风之水晶 💎 与 蒲公英 🌾
    for (int i = 0; i < WIND_MAX_COLLECTIBLES; i++) {
        if (!s_game.collectibles[i].active) continue;
        float cx = s_game.collectibles[i].x - s_game.distance;
        if (cx < -20.0f || cx > SCREEN_W + 20.0f) continue;
        int ix = (int)cx;
        int iy = (int)s_game.collectibles[i].y;

        if (s_game.collectibles[i].type == WIND_COLLECT_CRYSTAL) {
            // 晶莹菱形水晶
            draw_round_box(layer, ix - 4, iy - 7, 8, 14, 3, 0x38BDF8);
            draw_box(layer, ix - 2, iy - 2, 4, 4, 0xFFFFFF);
        } else if (s_game.collectibles[i].type == WIND_COLLECT_DANDELION) {
            // 金黄蒲公英绒球
            draw_round_box(layer, ix - 5, iy - 5, 10, 10, 5, 0xFEF08A);
            draw_box(layer, ix - 1, iy - 1, 3, 3, 0xF59E0B);
        }
    }

    // 6. 粒子系统绘制 (草屑/尾迹/气流)
    for (int i = 0; i < WIND_MAX_PARTICLES; i++) {
        if (!s_game.particles[i].active) continue;
        int px = (int)s_game.particles[i].x;
        int py = (int)s_game.particles[i].y;
        int sz = (int)s_game.particles[i].size;
        if (sz < 2) sz = 2;
        draw_box(layer, px, py, sz, sz, s_game.particles[i].color_rgb);
    }

    // 7. 纸飞机主角绘制 (固定在 WIND_PLAYER_SCREEN_X 水平线)
    draw_paper_plane(layer, WIND_PLAYER_SCREEN_X, s_game.y, s_game.pitch_deg);
}

// 40 FPS 核心循环
static void on_timer(lv_timer_t *t)
{
    (void)t;

    // 单步物理迭代 (25ms)
    wind_step(&s_game, 25);

    // 捕获并派发音效事件
    wind_sound_t snd = wind_consume_sound(&s_game);
    if (snd != WIND_SND_NONE) {
        send_sound(snd);
    }

    // 更新 HUD
    if (s_hud_dist) {
        lv_label_set_text_fmt(s_hud_dist, "%um", (unsigned int)s_game.distance);
    }
    if (s_hud_spd) {
        int kmh = (int)(s_game.vx * 0.8f);
        lv_label_set_text_fmt(s_hud_spd, "%d km/h", kmh);
    }
    if (s_hud_combo) {
        if (s_game.ring_combo > 1) {
            lv_label_set_text_fmt(s_hud_combo, "x%d RING BOOST!", s_game.ring_combo);
            lv_obj_clear_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (s_hint && s_game.flight_time_s > 4.0f) {
        lv_obj_add_flag(s_hint, LV_OBJ_FLAG_HIDDEN);
    }

    // 请求重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 统一入口：建屏、启动后台音效任务与定时器
void demo_wind_enter(void)
{
    // 初始化算法引擎
    wind_init(&s_game, 0x20260921);

    // 启动音频队列与任务
    s_snd_queue = xQueueCreate(16, sizeof(wind_sound_t));
    s_audio_running = true;
    xTaskCreate(wind_audio_task, "wind_audio", 4096, NULL, 5, &s_snd_task);

    // 构建主屏
    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    // 全屏矢量画布
    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_add_event_cb(s_playfield, on_draw_playfield, LV_EVENT_DRAW_MAIN, NULL);

    // 顶部 HUD 标签
    s_hud_dist = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_dist, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_dist, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(s_hud_dist, LV_ALIGN_TOP_LEFT, 16, 8);
    lv_label_set_text(s_hud_dist, "0m");

    s_hud_spd = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_spd, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_spd, lv_color_hex(0xFDE047), 0);
    lv_obj_align(s_hud_spd, LV_ALIGN_TOP_RIGHT, -16, 8);
    lv_label_set_text(s_hud_spd, "100 km/h");

    s_hud_combo = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_combo, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_combo, lv_color_hex(0x38BDF8), 0);
    lv_obj_align(s_hud_combo, LV_ALIGN_TOP_MID, 0, 26);
    lv_label_set_text(s_hud_combo, "");
    lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);

    s_hint = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hint, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hint, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(s_hint, LV_ALIGN_BOTTOM_MID, 0, -10);
    lv_label_set_text(s_hint, "HOLD OK DIVE   UP/DN NOSE");

    // 载入主屏
    lv_screen_load(s_scr);

    // 启动 40 FPS 定时器
    s_game_timer = lv_timer_create(on_timer, 25, NULL);
}

// 统一退出接口：清理资源与停止任务
void demo_wind_exit(void)
{
    if (s_game_timer) {
        lv_timer_del(s_game_timer);
        s_game_timer = NULL;
    }

    s_audio_running = false;
    if (s_snd_queue) {
        wind_sound_t stop = WIND_SND_NONE;
        xQueueSend(s_snd_queue, &stop, 0);
        vTaskDelay(pdMS_TO_TICKS(50));
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    s_snd_task = NULL;

    s_playfield = NULL;
    s_hud_dist = NULL;
    s_hud_spd = NULL;
    s_hud_combo = NULL;
    s_hint = NULL;

    if (s_scr) {
        lv_obj_del(s_scr);
        s_scr = NULL;
    }
}

// OK 按下收翼俯冲，手指离开的同一刻展翼。CLICK 比松手晚一个连击窗口，长按后根本不发。
// UP / DOWN 按住才持续改俯仰，松手回中。
void demo_wind_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS) {
            wind_input_pitch_hold(&s_game, 0);
            wind_input_ok(&s_game, true);
        } else if (ev == BSP_BTN_RELEASE) {
            wind_input_ok(&s_game, false);
        }
    } else if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS) {
            wind_input_ok(&s_game, false);
            wind_input_pitch_up(&s_game);
            wind_input_pitch_hold(&s_game, 1);
        } else if (ev == BSP_BTN_RELEASE) {
            wind_input_pitch_hold(&s_game, 0);
        }
    } else if (btn == BSP_BTN_DOWN) {
        if (ev == BSP_BTN_PRESS) {
            wind_input_ok(&s_game, false);
            wind_input_pitch_down(&s_game);
            wind_input_pitch_hold(&s_game, -1);
        } else if (ev == BSP_BTN_RELEASE) {
            wind_input_pitch_hold(&s_game, 0);
        }
    }
}
