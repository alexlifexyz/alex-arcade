// main/demo_pawssprint.c —— 《短腿爪爪运动会》(Paws Sprint: Fluffy Runner) 掌机固件驱动
// 极致流畅 40 FPS，零动态内存开销，原生 LVGL 9.x 矢量合批绘制，16kHz 萌宠拟音合成器。
#include "demo.h"
#include "pawssprint_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_pawssprint";

#define SCREEN_W 240
#define SCREEN_H 320

static ps_game_t     s_game;
static lv_obj_t     *s_scr = NULL;
static lv_obj_t     *s_playfield = NULL;

// HUD 标签
static lv_obj_t     *s_hud_dist = NULL;
static lv_obj_t     *s_hud_bones = NULL;

// 标题选人界面控件
static lv_obj_t     *s_title_box = NULL;
static lv_obj_t     *s_title_lbl = NULL;
static lv_obj_t     *s_title_name = NULL;
static lv_obj_t     *s_title_sub = NULL;
static lv_obj_t     *s_title_hint = NULL;

// 扑向大抱枕提示
static lv_obj_t     *s_dive_lbl = NULL;

// 结算与治愈签界面控件
static lv_obj_t     *s_res_box = NULL;
static lv_obj_t     *s_res_title = NULL;
static lv_obj_t     *s_res_stats = NULL;
static lv_obj_t     *s_res_pet = NULL;
static lv_obj_t     *s_res_quote_hdr = NULL;
static lv_obj_t     *s_res_quote = NULL;
static lv_obj_t     *s_res_hint = NULL;

static lv_timer_t   *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint8_t       s_volume = 85;

static void send_sound(ps_sound_t snd)
{
    if (s_snd_queue && snd != PS_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 快速后台音效合成任务 (16kHz 16-bit 萌宠治愈拟音，清脆低延迟)
static void pawssprint_audio_task(void *arg)
{
    (void)arg;
    ps_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(40)) == pdTRUE) {
            if (snd == PS_SND_NONE) continue;

            if (snd == PS_SND_PATA) {
                // 肉垫踏步声 (短促温和低频微敲击, 14ms)
                const int total = 224;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 260.0f - t * 140.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 3500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PS_SND_JUMP) {
                // Q弹起跳 (Boing~ 升频方波, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 380.0f + t * 520.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 5500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PS_SND_SLIP) {
                // 滑稽香蕉皮旋转下滑哨音 (650Hz -> 220Hz 锯齿波, 45ms)
                const int total = 720;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 650.0f - t * 430.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.8f) * 6000.0f;
                    buf[i % 256] = (int16_t)((phase * 2.0f - 1.0f) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PS_SND_BONE) {
                // 骨头清脆叮咚 (双频和弦 784Hz + 1046Hz, 30ms)
                const int total = 480;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p1 += 784.0f / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f;
                    p2 += 1046.0f / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f;
                    float amp = (1.0f - t) * 4500.0f;
                    int16_t s1 = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (p2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PS_SND_HEART) {
                // 爱心欢快晶莹音 (升琶音 880Hz -> 1320Hz, 35ms)
                const int total = 560;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p1 += (880.0f + t * 440.0f) / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f;
                    p2 += (1320.0f + t * 220.0f) / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f;
                    float amp = (1.0f - t) * 5000.0f;
                    int16_t s1 = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (p2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PS_SND_CUSHION_DIVE) {
                // 扑倒蓬松抱枕 (沉闷松软 POOF 噪声 + 胜利和弦, 120ms)
                const int total = 1920;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 3000) - 1500;
                    float noise_amp = expf(-t * 8.0f);
                    int16_t n_val = (int16_t)(noise * noise_amp);

                    p1 += 523.25f / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f;
                    p2 += 659.25f / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f;
                    float tone_amp = (1.0f - t) * 4500.0f;
                    int16_t t_val = ((p1 < 0.5f ? 1 : -1) + (p2 < 0.5f ? 1 : -1)) * (int16_t)(tone_amp * 0.5f);

                    buf[i % 256] = n_val + t_val;
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

static inline void draw_round_border(lv_layer_t *layer, int x, int y, int w, int h, int radius,
                                     uint32_t bg_hex, int border_w, uint32_t border_hex)
{
    if (w <= 0 || h <= 0) return;
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(bg_hex);
    dsc.bg_opa = LV_OPA_COVER;
    dsc.radius = radius;
    dsc.border_width = border_w;
    dsc.border_color = lv_color_hex(border_hex);
    lv_area_t coords = {
        .x1 = x,
        .y1 = y,
        .x2 = x + w - 1,
        .y2 = y + h - 1,
    };
    lv_draw_rect(layer, &dsc, &coords);
}

// 绘制巨型柔软大抱枕 (Cushion)
static void draw_big_cushion(lv_layer_t *layer, int cx, int cy)
{
    draw_round_box(layer, cx - 76, cy + 24, 152, 22, 11, 0x4D7C0F);
    draw_round_border(layer, cx - 80, cy - 24, 160, 56, 18, 0xFCE7F3, 3, 0xF472B6);
    draw_round_box(layer, cx - 12, cy - 8, 11, 11, 5, 0xFB7185);
    draw_round_box(layer, cx + 1,  cy - 8, 11, 11, 5, 0xFB7185);
    draw_round_box(layer, cx - 6,  cy - 2, 12, 10, 3, 0xFB7185);
    draw_round_box(layer, cx - 60, cy - 18, 30, 6, 3, 0xFFFFFF);
}

// 2D 旋转坐标映射
static inline void rot_pt(float cx, float cy, float ox, float oy, float cos_a, float sin_a, int *rx, int *ry)
{
    *rx = (int)(cx + ox * cos_a - oy * sin_a);
    *ry = (int)(cy + ox * sin_a + oy * cos_a);
}

static inline void draw_rot_round_box(lv_layer_t *layer, float cx, float cy,
                                      float ox, float oy, float w, float h,
                                      int radius, uint32_t color_hex,
                                      float cos_a, float sin_a)
{
    int rx, ry;
    rot_pt(cx, cy, ox, oy, cos_a, sin_a, &rx, &ry);
    draw_round_box(layer, rx - (int)(w * 0.5f), ry - (int)(h * 0.5f), (int)w, (int)h, radius, color_hex);
}

static inline void draw_rot_box(lv_layer_t *layer, float cx, float cy,
                                float ox, float oy, float w, float h,
                                uint32_t color_hex,
                                float cos_a, float sin_a)
{
    int rx, ry;
    rot_pt(cx, cy, ox, oy, cos_a, sin_a, &rx, &ry);
    draw_box(layer, rx - (int)(w * 0.5f), ry - (int)(h * 0.5f), (int)w, (int)h, color_hex);
}

// 绘制超萌萌宠正面脸部与动态身体
static void draw_animal(lv_layer_t *layer, int x, int y, ps_char_type_t ch,
                        float sx, float sy, float angle, float run_frame)
{
    float s = (sx + sy) * 0.5f;
    float bob = sinf(run_frame) * 2.5f * s;
    float p1 = sinf(run_frame * 1.5f) * 3.5f * s;

    float cx = (float)x;
    float cy = (float)y + bob;
    float cos_a = cosf(angle);
    float sin_a = sinf(angle);

    // 地面软影
    draw_round_box(layer, x - (int)(16.0f * s), y + (int)(12.0f * s),
                   (int)(32.0f * s), (int)(8.0f * s), 4, 0x4D7C0F);

    if (ch == PS_CHAR_CORGI) {
        // ============================================================
        // 1. 柯基·球球 (CORGI)：大尖立耳 + 额头白鼻梁 + 大眼高光 + 粉舌头
        // ============================================================
        // 左右大立耳 (外耳焦糖褐，内耳粉嫩嫩)
        draw_rot_round_box(layer, cx, cy, -11.0f * s, -14.0f * s, 10.0f * s, 16.0f * s, 4, 0xB45309, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, -11.0f * s, -13.0f * s, 6.0f * s, 10.0f * s, 3, 0xFBCFE8, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +11.0f * s, -14.0f * s, 10.0f * s, 16.0f * s, 4, 0xB45309, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +11.0f * s, -13.0f * s, 6.0f * s, 10.0f * s, 3, 0xFBCFE8, cos_a, sin_a);

        // 金黄圆润大萌脸
        draw_rot_round_box(layer, cx, cy, 0, 0, 28.0f * s, 24.0f * s, 11, 0xF59E0B, cos_a, sin_a);

        // 额头与鼻梁正中纯白斑条 (Blaze)
        draw_rot_round_box(layer, cx, cy, 0, 0, 8.0f * s, 16.0f * s, 4, 0xFFFFFF, cos_a, sin_a);
        // 白口吻
        draw_rot_round_box(layer, cx, cy, 0, 5.0f * s, 16.0f * s, 11.0f * s, 5, 0xFFFFFF, cos_a, sin_a);

        // 黑色大眼睛带闪亮双高光
        draw_rot_round_box(layer, cx, cy, -7.0f * s, -1.0f * s, 5.0f * s, 6.0f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -8.0f * s, -2.5f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -6.5f * s, 0.5f * s, 1.0f * s, 1.0f * s, 0xFFFFFF, cos_a, sin_a);

        draw_rot_round_box(layer, cx, cy, +7.0f * s, -1.0f * s, 5.0f * s, 6.0f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +6.0f * s, -2.5f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +7.5f * s, 0.5f * s, 1.0f * s, 1.0f * s, 0xFFFFFF, cos_a, sin_a);

        // 粉扑扑大腮红
        draw_rot_round_box(layer, cx, cy, -10.5f * s, 4.0f * s, 5.5f * s, 4.0f * s, 2, 0xFB7185, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +10.5f * s, 4.0f * s, 5.5f * s, 4.0f * s, 2, 0xFB7185, cos_a, sin_a);

        // 黑色湿润小倒三角鼻头
        draw_rot_round_box(layer, cx, cy, 0, 3.0f * s, 4.0f * s, 3.0f * s, 1, 0x1E293B, cos_a, sin_a);

        // 欢快伸出的小粉舌头
        draw_rot_round_box(layer, cx, cy, 0, 7.5f * s, 4.5f * s, 5.0f * s, 2, 0xFB7185, cos_a, sin_a);

        // 前方两只雪白小肉爪踏步
        draw_rot_round_box(layer, cx, cy, -8.0f * s, 13.0f * s + p1, 6.0f * s, 6.0f * s, 3, 0xFFFFFF, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +8.0f * s, 13.0f * s - p1, 6.0f * s, 6.0f * s, 3, 0xFFFFFF, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, -8.0f * s, 14.0f * s + p1, 3.0f * s, 2.5f * s, 1, 0xFBCFE8, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +8.0f * s, 14.0f * s - p1, 3.0f * s, 2.5f * s, 1, 0xFBCFE8, cos_a, sin_a);

    } else if (ch == PS_CHAR_SHIBA) {
        // ============================================================
        // 2. 柴犬·阿柴 (SHIBA)：三角飞机耳 + 灵魂白豆豆眉 + 治愈微笑
        // ============================================================
        // 飞机三角耳
        draw_rot_round_box(layer, cx, cy, -11.0f * s, -11.0f * s, 9.0f * s, 11.0f * s, 3, 0xB45309, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, -10.0f * s, -10.0f * s, 5.0f * s, 7.0f * s, 2, 0xFEF3C7, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +11.0f * s, -11.0f * s, 9.0f * s, 11.0f * s, 3, 0xB45309, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +10.0f * s, -10.0f * s, 5.0f * s, 7.0f * s, 2, 0xFEF3C7, cos_a, sin_a);

        // 暖栗黄大饼脸
        draw_rot_round_box(layer, cx, cy, 0, 0, 28.0f * s, 24.0f * s, 12, 0xD97706, cos_a, sin_a);

        // 鼓鼓的奶油白脸颊与下巴
        draw_rot_round_box(layer, cx, cy, 0, 4.5f * s, 22.0f * s, 14.0f * s, 7, 0xFEF3C7, cos_a, sin_a);

        // 柴犬灵魂：两颗雪白圆圆豆豆眉 (Maro)
        draw_rot_round_box(layer, cx, cy, -6.5f * s, -6.0f * s, 4.5f * s, 3.5f * s, 2, 0xFFFFFF, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +6.5f * s, -6.0f * s, 4.5f * s, 3.5f * s, 2, 0xFFFFFF, cos_a, sin_a);

        // 治愈大眼带高光
        draw_rot_round_box(layer, cx, cy, -6.5f * s, -1.0f * s, 5.0f * s, 5.5f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -7.5f * s, -2.0f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +6.5f * s, -1.0f * s, 5.0f * s, 5.5f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +5.5f * s, -2.0f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);

        // 暖粉元气大腮红
        draw_rot_round_box(layer, cx, cy, -10.5f * s, 4.0f * s, 6.0f * s, 4.5f * s, 2, 0xFB7185, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +10.5f * s, 4.0f * s, 6.0f * s, 4.5f * s, 2, 0xFB7185, cos_a, sin_a);

        // 黑色小鼻头与微笑嘴角
        draw_rot_round_box(layer, cx, cy, 0, 3.0f * s, 4.0f * s, 3.0f * s, 1, 0x1E293B, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, 0, 5.5f * s, 4.0f * s, 1.5f * s, 0x92400E, cos_a, sin_a);

        // 黄毛白手套小爪爪踏步
        draw_rot_round_box(layer, cx, cy, -8.0f * s, 13.0f * s + p1, 6.0f * s, 6.0f * s, 3, 0xFEF3C7, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +8.0f * s, 13.0f * s - p1, 6.0f * s, 6.0f * s, 3, 0xFEF3C7, cos_a, sin_a);

    } else if (ch == PS_CHAR_SEAL) {
        // ============================================================
        // 3. 海豹·糯米 (SEAL)：糯米大雪球 + 无辜水灵大黑眼 + 可爱小胡须
        // ============================================================
        // 纯白糯米圆团子身躯
        draw_rot_round_box(layer, cx, cy, 0, 0, 30.0f * s, 26.0f * s, 13, 0xF8FAFC, cos_a, sin_a);

        // 无辜大圆眼 (超萌水汪汪大黑眸 + 双层高光)
        draw_rot_round_box(layer, cx, cy, -7.0f * s, -2.0f * s, 7.0f * s, 7.0f * s, 3, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -8.5f * s, -3.5f * s, 2.5f * s, 2.5f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -6.0f * s, -0.5f * s, 1.5f * s, 1.5f * s, 0xFFFFFF, cos_a, sin_a);

        draw_rot_round_box(layer, cx, cy, +7.0f * s, -2.0f * s, 7.0f * s, 7.0f * s, 3, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +5.5f * s, -3.5f * s, 2.5f * s, 2.5f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +8.0f * s, -0.5f * s, 1.5f * s, 1.5f * s, 0xFFFFFF, cos_a, sin_a);

        // 黑色椭圆鼻头
        draw_rot_round_box(layer, cx, cy, 0, 2.5f * s, 4.5f * s, 3.5f * s, 2, 0x334155, cos_a, sin_a);

        // 软萌小胡须
        draw_rot_box(layer, cx, cy, -10.0f * s, 2.0f * s, 5.0f * s, 1.5f * s, 0x94A3B8, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -10.0f * s, 4.5f * s, 5.0f * s, 1.5f * s, 0x94A3B8, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +10.0f * s, 2.0f * s, 5.0f * s, 1.5f * s, 0x94A3B8, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +10.0f * s, 4.5f * s, 5.0f * s, 1.5f * s, 0x94A3B8, cos_a, sin_a);

        // 樱花粉大腮红
        draw_rot_round_box(layer, cx, cy, -11.0f * s, 3.5f * s, 6.0f * s, 5.0f * s, 3, 0xFBCFE8, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +11.0f * s, 3.5f * s, 6.0f * s, 5.0f * s, 3, 0xFBCFE8, cos_a, sin_a);

        // 左右挥舞拍打的小白鳍手
        draw_rot_round_box(layer, cx, cy, -15.0f * s, 3.0f * s + p1, 7.0f * s, 5.0f * s, 2, 0xE2E8F0, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +15.0f * s, 3.0f * s - p1, 7.0f * s, 5.0f * s, 2, 0xE2E8F0, cos_a, sin_a);

    } else if (ch == PS_CHAR_PENGUIN) {
        // ============================================================
        // 4. 企鹅·波波 (PENGUIN)：黑曜石小披风 + 桃心白脸 + 橙色小嘴 + 领结
        // ============================================================
        // 黑头罩与身体
        draw_rot_round_box(layer, cx, cy, 0, 0, 28.0f * s, 26.0f * s, 12, 0x1E293B, cos_a, sin_a);

        // 桃心形雪白大脸蛋
        draw_rot_round_box(layer, cx, cy, 0, 1.0f * s, 20.0f * s, 20.0f * s, 10, 0xFFFFFF, cos_a, sin_a);

        // 呆萌大黑眼
        draw_rot_round_box(layer, cx, cy, -6.0f * s, -2.0f * s, 5.0f * s, 5.0f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, -7.0f * s, -3.0f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +6.0f * s, -2.0f * s, 5.0f * s, 5.0f * s, 2, 0x0F172A, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +5.0f * s, -3.0f * s, 2.0f * s, 2.0f * s, 0xFFFFFF, cos_a, sin_a);

        // 亮橙色立体小尖嘴 (Beak)
        draw_rot_round_box(layer, cx, cy, 0, 2.0f * s, 7.0f * s, 4.5f * s, 2, 0xF97316, cos_a, sin_a);

        // 呆萌绅士红色小领结
        draw_rot_box(layer, cx, cy, -2.5f * s, 6.5f * s, 3.0f * s, 3.0f * s, 0xEF4444, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, +2.5f * s, 6.5f * s, 3.0f * s, 3.0f * s, 0xEF4444, cos_a, sin_a);
        draw_rot_box(layer, cx, cy, 0, 6.5f * s, 2.0f * s, 2.0f * s, 0xFCA5A5, cos_a, sin_a);

        // 粉嫩小腮红
        draw_rot_round_box(layer, cx, cy, -9.0f * s, 2.0f * s, 4.5f * s, 3.5f * s, 2, 0xFB7185, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +9.0f * s, 2.0f * s, 4.5f * s, 3.5f * s, 2, 0xFB7185, cos_a, sin_a);

        // 黑色小短翅膀扑腾
        draw_rot_round_box(layer, cx, cy, -14.0f * s, 1.0f * s + p1, 5.0f * s, 10.0f * s, 2, 0x1E293B, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +14.0f * s, 1.0f * s - p1, 5.0f * s, 10.0f * s, 2, 0x1E293B, cos_a, sin_a);

        // 橙黄小脚蹼踏步
        draw_rot_round_box(layer, cx, cy, -6.0f * s, 13.0f * s + p1, 6.0f * s, 5.0f * s, 2, 0xF97316, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, +6.0f * s, 13.0f * s - p1, 6.0f * s, 5.0f * s, 2, 0xF97316, cos_a, sin_a);
    }

    // ============================================================
    // 旋转特技特效：踩香蕉皮华丽 360° 打转时的眩晕旋转金星
    // ============================================================
    if (angle > 0.05f) {
        for (int st = 0; st < 3; st++) {
            float sa = angle * 2.5f + (float)st * 2.094f;
            float star_ox = cosf(sa) * (20.0f * s);
            float star_oy = -22.0f * s + sinf(sa) * (7.0f * s);
            draw_rot_box(layer, cx, cy, star_ox, star_oy, 5.0f * s, 5.0f * s, 0xFDE047, 1.0f, 0.0f);
            draw_rot_box(layer, cx, cy, star_ox, star_oy - 2.0f * s, 2.0f * s, 7.0f * s, 0xFACC15, 1.0f, 0.0f);
            draw_rot_box(layer, cx, cy, star_ox - 2.0f * s, star_oy, 7.0f * s, 2.0f * s, 0xFACC15, 1.0f, 0.0f);
        }
    }
}

// 核心合批渲染回调 (LV_EVENT_DRAW_MAIN)
static void on_draw_playfield(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);

    // 1. 赛道与绿茵背景
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x65A30D);
    draw_box(layer, 20, 0, 200, SCREEN_H, 0xFEF3C7);

    int off = (int)s_game.road_offset;
    for (int y = -32 + off; y < SCREEN_H; y += 32) {
        bool red = ((y - off) / 32) % 2 == 0;
        uint32_t col = red ? 0xF43F5E : 0xFFFFFF;
        draw_box(layer, 14, y, 6, 32, col);
        draw_box(layer, 220, y, 6, 32, col);
    }

    for (int y = -32 + off; y < SCREEN_H; y += 24) {
        draw_box(layer, 84, y, 2, 12, 0xFCD34D);
        draw_box(layer, 154, y, 2, 12, 0xFCD34D);
    }

    // 2. 地面小肉垫爪印
    for (int i = 0; i < PS_MAX_PAW_PRINTS; i++) {
        ps_paw_print_t *p = &s_game.paw_prints[i];
        if (!p->active) continue;
        int px = (int)p->x;
        int py = (int)p->y;
        draw_round_box(layer, px - 2, py - 2, 5, 4, 2, 0xD97706);
        draw_box(layer, px - 4, py - 5, 2, 2, 0xD97706);
        draw_box(layer, px - 1, py - 6, 2, 2, 0xD97706);
        draw_box(layer, px + 2, py - 5, 2, 2, 0xD97706);
    }

    // 3. 障碍物渲染
    for (int i = 0; i < PS_MAX_OBSTACLES; i++) {
        ps_obstacle_t *o = &s_game.obstacles[i];
        if (!o->active) continue;
        int ox = (int)o->x;
        int oy = (int)o->y;

        if (o->type == PS_OBS_BANANA) {
            draw_round_box(layer, ox - 6, oy - 2, 12, 5, 2, 0xFACC15);
            draw_round_box(layer, ox - 8, oy - 6, 5, 5, 2, 0xFACC15);
            draw_round_box(layer, ox + 3, oy - 6, 5, 5, 2, 0xFACC15);
            draw_box(layer, ox - 2, oy + 2, 4, 2, 0x854D0E);
        } else if (o->type == PS_OBS_ROOMBA) {
            draw_round_box(layer, ox - 11, oy - 11, 22, 22, 11, 0x334155);
            draw_round_box(layer, ox - 4, oy - 4, 8, 8, 4, 0x38BDF8);
            draw_box(layer, ox - 8, oy + 5, 16, 2, 0x1E293B);
        } else if (o->type == PS_OBS_MUD) {
            draw_round_box(layer, ox - 13, oy - 6, 26, 12, 6, 0x78350F);
        }
    }

    // 4. 收集品渲染
    for (int i = 0; i < PS_MAX_PICKUPS; i++) {
        ps_pickup_t *p = &s_game.pickups[i];
        if (!p->active) continue;
        int px = (int)p->x;
        int bob = (int)(sinf(p->bob_phase) * 3.0f);
        int py = (int)p->y + bob;

        if (p->type == PS_PICKUP_BONE) {
            draw_box(layer, px - 6, py - 2, 12, 4, 0xFFFFFF);
            draw_round_box(layer, px - 8, py - 5, 5, 5, 2, 0xFFFFFF);
            draw_round_box(layer, px - 8, py,     5, 5, 2, 0xFFFFFF);
            draw_round_box(layer, px + 3, py - 5, 5, 5, 2, 0xFFFFFF);
            draw_round_box(layer, px + 3, py,     5, 5, 2, 0xFFFFFF);
        } else {
            draw_round_box(layer, px - 6, py - 5, 6, 6, 3, 0xF43F5E);
            draw_round_box(layer, px,     py - 5, 6, 6, 3, 0xF43F5E);
            draw_box(layer, px - 4, py, 8, 4, 0xF43F5E);
            draw_box(layer, px - 2, py + 3, 4, 3, 0xF43F5E);
        }
    }

    // 5. 终点大抱枕
    if (s_game.distance_m > (PS_TOTAL_DIST_M - 40)) {
        float cushion_y = (float)(PS_TOTAL_DIST_M - s_game.distance_m) * 6.0f;
        draw_big_cushion(layer, 120, (int)cushion_y);
    }

    // 6. 游戏进行中玩家
    if (s_game.state == PS_STATE_PLAYING) {
        int px = (int)s_game.x;
        int py = (int)s_game.y - (int)s_game.jump_z;
        draw_animal(layer, px, py, s_game.selected_char,
                    s_game.squash_x, s_game.squash_y,
                    s_game.spin_angle, s_game.run_frame);
    }

    // 7. 终点慢镜头飞扑 (PS_STATE_DIVE)
    if (s_game.state == PS_STATE_DIVE) {
        draw_big_cushion(layer, 120, 170);

        float prog = s_game.dive_timer_ms / 1800.0f;
        if (prog > 1.0f) prog = 1.0f;
        int dive_y = (int)(75.0f + prog * 95.0f);
        float dive_scale = 1.6f - prog * 0.2f;

        draw_animal(layer, 120, dive_y, s_game.selected_char,
                    dive_scale, dive_scale, 0.0f, 0.0f);

        for (int i = 0; i < PS_MAX_FEATHERS; i++) {
            ps_feather_t *f = &s_game.feathers[i];
            if (!f->active) continue;
            draw_round_box(layer, (int)f->x, (int)f->y,
                           (int)f->size, (int)(f->size * 0.5f), 2, f->color);
        }

        draw_round_border(layer, 16, 26, 208, 36, 10, 0x0F172A, 2, 0xF472B6);
    }

    // 8. 选人与结算卡片底衬
    if (s_game.state == PS_STATE_TITLE) {
        draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x0F172A);
        draw_round_border(layer, 24, 72, 192, 156, 16, 0x1E293B, 2, 0xF472B6);

        draw_animal(layer, 120, 126, s_game.selected_char, 1.8f, 1.8f, 0.0f, s_game.run_frame);

        // 左右切换三角
        draw_box(layer, 38, 122, 4, 8, 0x38BDF8);
        draw_box(layer, 198, 122, 4, 8, 0x38BDF8);

    } else if (s_game.state == PS_STATE_RESULT) {
        draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x0F172A);
        draw_round_border(layer, 16, 44, 208, 76, 10, 0x1E293B, 2, 0xF472B6);
        draw_round_border(layer, 16, 130, 208, 120, 12, 0xFDF2F8, 2, 0xFB7185);
    }
}

// 40 FPS 主驱动定时器
static void on_timer(lv_timer_t *timer)
{
    (void)timer;

    // 步进核心逻辑 (25ms = 40 FPS)
    pawssprint_step(&s_game, 25);

    // 音效事件触发
    if (s_game.pending_sound != PS_SND_NONE) {
        send_sound(s_game.pending_sound);
        s_game.pending_sound = PS_SND_NONE;
    }

    // 刷新 HUD
    if (s_hud_dist && s_hud_bones) {
        if (s_game.state == PS_STATE_PLAYING) {
            lv_obj_clear_flag(s_hud_dist, LV_OBJ_FLAG_HIDDEN);
            lv_obj_clear_flag(s_hud_bones, LV_OBJ_FLAG_HIDDEN);
            lv_label_set_text_fmt(s_hud_dist, "%dm / 500m", (int)s_game.distance_m);
            lv_label_set_text_fmt(s_hud_bones, "BONES: %d", (int)s_game.bones_count);
        } else {
            lv_obj_add_flag(s_hud_dist, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(s_hud_bones, LV_OBJ_FLAG_HIDDEN);
        }
    }

    // 状态机 UI 显示切换
    if (s_game.state == PS_STATE_TITLE) {
        if (s_title_box) lv_obj_clear_flag(s_title_box, LV_OBJ_FLAG_HIDDEN);
        if (s_dive_lbl)  lv_obj_add_flag(s_dive_lbl, LV_OBJ_FLAG_HIDDEN);
        if (s_res_box)   lv_obj_add_flag(s_res_box, LV_OBJ_FLAG_HIDDEN);

        const ps_char_info_t *info = pawssprint_get_char_info(s_game.selected_char);
        if (s_title_name) lv_label_set_text(s_title_name, info->name);
        if (s_title_sub)  lv_label_set_text_fmt(s_title_sub, "%s\n[%s]", info->sub, info->tag);

    } else if (s_game.state == PS_STATE_PLAYING) {
        if (s_title_box) lv_obj_add_flag(s_title_box, LV_OBJ_FLAG_HIDDEN);
        if (s_dive_lbl)  lv_obj_add_flag(s_dive_lbl, LV_OBJ_FLAG_HIDDEN);
        if (s_res_box)   lv_obj_add_flag(s_res_box, LV_OBJ_FLAG_HIDDEN);

    } else if (s_game.state == PS_STATE_DIVE) {
        if (s_title_box) lv_obj_add_flag(s_title_box, LV_OBJ_FLAG_HIDDEN);
        if (s_dive_lbl)  lv_obj_clear_flag(s_dive_lbl, LV_OBJ_FLAG_HIDDEN);
        if (s_res_box)   lv_obj_add_flag(s_res_box, LV_OBJ_FLAG_HIDDEN);

    } else if (s_game.state == PS_STATE_RESULT) {
        if (s_title_box) lv_obj_add_flag(s_title_box, LV_OBJ_FLAG_HIDDEN);
        if (s_dive_lbl)  lv_obj_add_flag(s_dive_lbl, LV_OBJ_FLAG_HIDDEN);
        if (s_res_box)   lv_obj_clear_flag(s_res_box, LV_OBJ_FLAG_HIDDEN);

        const ps_char_info_t *info = pawssprint_get_char_info(s_game.selected_char);
        if (s_res_stats) {
            lv_label_set_text_fmt(s_res_stats, "BONES: %d     SLIPS: %d",
                                  (int)s_game.bones_count, (int)s_game.slips_count);
        }
        if (s_res_pet) {
            lv_label_set_text_fmt(s_res_pet, "PET: %s", info->name);
        }
        if (s_res_quote) {
            lv_label_set_text(s_res_quote, pawssprint_get_quote(s_game.quote_index));
        }
    }

    // 触发画布重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 统一演示入口：建屏、启动后台任务与定时器
void demo_pawssprint_enter(void)
{
    // 初始化算法逻辑
    pawssprint_init(&s_game, 0x20260919);

    // 启动音频队列与任务
    s_snd_queue = xQueueCreate(16, sizeof(ps_sound_t));
    s_audio_running = true;
    xTaskCreate(pawssprint_audio_task, "ps_audio", 4096, NULL, 5, &s_snd_task);

    // 构建界面主屏
    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x65A30D), 0);
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
    lv_obj_set_style_text_color(s_hud_dist, lv_color_hex(0x17202A), 0);
    lv_obj_align(s_hud_dist, LV_ALIGN_TOP_LEFT, 24, 6);
    lv_label_set_text(s_hud_dist, "0m / 500m");

    s_hud_bones = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_bones, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_bones, lv_color_hex(0xD97706), 0);
    lv_obj_align(s_hud_bones, LV_ALIGN_TOP_RIGHT, -24, 6);
    lv_label_set_text(s_hud_bones, "BONES: 0");

    // -------------------------------------------------------------
    // 标题选人界面浮层
    // -------------------------------------------------------------
    s_title_box = lv_obj_create(s_scr);
    lv_obj_set_size(s_title_box, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_title_box, 0, 0);
    lv_obj_set_style_bg_opa(s_title_box, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_title_box, 0, 0);
    lv_obj_clear_flag(s_title_box, LV_OBJ_FLAG_SCROLLABLE);

    s_title_lbl = lv_label_create(s_title_box);
    lv_obj_set_style_text_font(s_title_lbl, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(s_title_lbl, lv_color_hex(0xF472B6), 0);
    lv_obj_align(s_title_lbl, LV_ALIGN_TOP_MID, 0, 24);
    lv_label_set_text(s_title_lbl, "PAWS SPRINT");

    s_title_name = lv_label_create(s_title_box);
    lv_obj_set_style_text_font(s_title_name, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_title_name, lv_color_hex(0xFDE047), 0);
    lv_obj_align(s_title_name, LV_ALIGN_TOP_MID, 0, 160);
    lv_label_set_text(s_title_name, "CORGI");

    s_title_sub = lv_label_create(s_title_box);
    lv_obj_set_style_text_font(s_title_sub, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_title_sub, lv_color_hex(0xE2E8F0), 0);
    lv_obj_set_style_text_align(s_title_sub, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_title_sub, LV_ALIGN_TOP_MID, 0, 180);
    lv_label_set_text(s_title_sub, "Peach Butt Sprinter\n[Sunny Energy]");

    s_title_hint = lv_label_create(s_title_box);
    lv_obj_set_style_text_font(s_title_hint, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_title_hint, lv_color_hex(0x38BDF8), 0);
    lv_obj_align(s_title_hint, LV_ALIGN_BOTTOM_MID, 0, -22);
    lv_label_set_text(s_title_hint, "UP/DN: PET   OK: RUN");

    // -------------------------------------------------------------
    // 终点飞扑横幅
    // -------------------------------------------------------------
    s_dive_lbl = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_dive_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_dive_lbl, lv_color_hex(0xFCE7F3), 0);
    lv_obj_align(s_dive_lbl, LV_ALIGN_TOP_MID, 0, 34);
    lv_label_set_text(s_dive_lbl, "POOF!! FLUFFY DIVE!!");
    lv_obj_add_flag(s_dive_lbl, LV_OBJ_FLAG_HIDDEN);

    // -------------------------------------------------------------
    // 结算与治愈签浮层
    // -------------------------------------------------------------
    s_res_box = lv_obj_create(s_scr);
    lv_obj_set_size(s_res_box, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_res_box, 0, 0);
    lv_obj_set_style_bg_opa(s_res_box, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_res_box, 0, 0);
    lv_obj_clear_flag(s_res_box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s_res_box, LV_OBJ_FLAG_HIDDEN);

    s_res_title = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_title, lv_color_hex(0xF472B6), 0);
    lv_obj_align(s_res_title, LV_ALIGN_TOP_MID, 0, 52);
    lv_label_set_text(s_res_title, "* PERFECT FINISH! 500m *");

    s_res_pet = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_pet, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_pet, lv_color_hex(0x38BDF8), 0);
    lv_obj_align(s_res_pet, LV_ALIGN_TOP_MID, 0, 72);
    lv_label_set_text(s_res_pet, "PET: CORGI");

    s_res_stats = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_stats, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_stats, lv_color_hex(0xFDE047), 0);
    lv_obj_align(s_res_stats, LV_ALIGN_TOP_MID, 0, 92);
    lv_label_set_text(s_res_stats, "BONES: 0     SLIPS: 0");

    s_res_quote_hdr = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_quote_hdr, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_quote_hdr, lv_color_hex(0xBE185D), 0);
    lv_obj_align(s_res_quote_hdr, LV_ALIGN_TOP_MID, 0, 142);
    lv_label_set_text(s_res_quote_hdr, "[ HEALING NOTE ]");

    s_res_quote = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_quote, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_quote, lv_color_hex(0x334155), 0);
    lv_obj_set_style_text_align(s_res_quote, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(s_res_quote, 180);
    lv_obj_align(s_res_quote, LV_ALIGN_TOP_MID, 0, 168);
    lv_label_set_text(s_res_quote, "Take a break whenever you need!\nYou are the cutest runner.");

    s_res_hint = lv_label_create(s_res_box);
    lv_obj_set_style_text_font(s_res_hint, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_res_hint, lv_color_hex(0xFACC15), 0);
    lv_obj_align(s_res_hint, LV_ALIGN_BOTTOM_MID, 0, -22);
    lv_label_set_text(s_res_hint, "OK: REPLAY   UP/DN: PET");

    // 载入屏幕
    lv_screen_load(s_scr);

    // 启动 40 FPS 驱动定时器
    s_game_timer = lv_timer_create(on_timer, 25, NULL);
}

// 统一退出接口：清理全部定时器、任务与图层
void demo_pawssprint_exit(void)
{
    // 停止定时器
    if (s_game_timer) {
        lv_timer_del(s_game_timer);
        s_game_timer = NULL;
    }

    // 停止音频后台任务
    s_audio_running = false;
    if (s_snd_queue) {
        ps_sound_t stop = PS_SND_NONE;
        xQueueSend(s_snd_queue, &stop, 0);
        vTaskDelay(pdMS_TO_TICKS(50));
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    s_snd_task = NULL;

    // 清空对象句柄
    s_playfield = NULL;
    s_hud_dist = NULL;
    s_hud_bones = NULL;
    s_title_box = NULL;
    s_title_lbl = NULL;
    s_title_name = NULL;
    s_title_sub = NULL;
    s_title_hint = NULL;
    s_dive_lbl = NULL;
    s_res_box = NULL;
    s_res_title = NULL;
    s_res_stats = NULL;
    s_res_pet = NULL;
    s_res_quote_hdr = NULL;
    s_res_quote = NULL;
    s_res_hint = NULL;

    // 删除主屏
    if (s_scr) {
        lv_obj_del(s_scr);
        s_scr = NULL;
    }
}

// 三键输入响应 (仅响应 CLICK，杜绝双事件触发导致跳过中间车道)
void demo_pawssprint_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_CLICK) return;

    if (btn == BSP_BTN_UP) {
        pawssprint_input_up(&s_game);
    } else if (btn == BSP_BTN_DOWN) {
        pawssprint_input_down(&s_game);
    } else if (btn == BSP_BTN_OK) {
        pawssprint_input_ok(&s_game);
    }
}
