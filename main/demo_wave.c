// main/demo_wave.c —— 《浪涌漫游者》(Wave Walker) 掌机固件驱动
// 极致流畅 40 FPS，零动态堆开销，原生 LVGL 9.x 矢量合批绘制，16kHz 海浪拟音合成器。
#include "demo.h"
#include "wave_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_wave";

#define SCREEN_W 240
#define SCREEN_H 320

static wave_game_t  s_game;
static lv_obj_t    *s_scr = NULL;
static lv_obj_t    *s_playfield = NULL;

// HUD 标签
static lv_obj_t    *s_hud_score = NULL;
static lv_obj_t    *s_hud_dist = NULL;
static lv_obj_t    *s_hud_combo = NULL;
static lv_obj_t    *s_hint = NULL;

// 游戏结束浮层
static lv_obj_t    *s_gameover_box = NULL;
static lv_obj_t    *s_gameover_title = NULL;
static lv_obj_t    *s_gameover_score = NULL;
static lv_obj_t    *s_gameover_hint = NULL;

static lv_timer_t  *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint8_t       s_volume = 85;

static void send_sound(wave_sound_t snd)
{
    if (s_snd_queue && snd != WAVE_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 快速后台音效合成任务 (16kHz 16-bit 冲浪与海洋拟音)
static void wave_audio_task(void *arg)
{
    (void)arg;
    wave_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(40)) == pdTRUE) {
            if (snd == WAVE_SND_NONE) continue;

            if (snd == WAVE_SND_LAUNCH) {
                // 浪尖腾空冲刺啸叫 (升频双正弦，40ms)
                const int total = 640;
                float p1 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 340.0f + t * 620.0f;
                    p1 += freq / 16000.0f;
                    if (p1 >= 1.0f) p1 -= 1.0f;
                    float amp = (1.0f - t * 0.3f) * 4800.0f;
                    buf[i % 256] = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_SURF_RUSH) {
                // 顺坡压板加速冲刷 (海浪白噪，35ms)
                const int total = 560;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 4000) - 2000;
                    float env = (1.0f - t);
                    buf[i % 256] = (int16_t)(noise * env);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_TRICK_SWOOSH) {
                // 空中翻滚特技 (嗖~ 降频滑音，30ms)
                const int total = 480;
                float p1 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 880.0f - t * 450.0f;
                    p1 += freq / 16000.0f;
                    if (p1 >= 1.0f) p1 -= 1.0f;
                    float amp = (1.0f - t) * 4500.0f;
                    buf[i % 256] = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_PERFECT_ENTRY) {
                // 完美切水 (清脆水滴三和弦琶音，70ms)
                const int total = 1120;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq1 = 587.33f + t * 400.0f; // D5 -> G5
                    float freq2 = 880.00f + t * 200.0f; // A5
                    p1 += freq1 / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f;
                    p2 += freq2 / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f;
                    float amp = (1.0f - t) * 4000.0f;
                    int16_t s1 = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (p2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_BELLY_FLOP) {
                // 肚皮啪叽拍水 (低沉水花咕噜声，45ms)
                const int total = 720;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 5000) - 2500;
                    float env = expf(-t * 6.0f);
                    buf[i % 256] = (int16_t)(noise * env);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_STAR_COLLECT || snd == WAVE_SND_SHELL_COLLECT) {
                // 收集星芒/贝壳 (高音叮咚，30ms)
                const int total = 480;
                float p = 0.0f;
                float f = (snd == WAVE_SND_SHELL_COLLECT) ? 1318.5f : 1046.5f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p += f / 16000.0f;
                    if (p >= 1.0f) p -= 1.0f;
                    float amp = (1.0f - t) * 4200.0f;
                    buf[i % 256] = (p < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == WAVE_SND_HIT_OBSTACLE || snd == WAVE_SND_GAMEOVER) {
                // 撞击或沉水力竭 (低频震荡，60ms)
                const int total = 960;
                float p = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 180.0f - t * 90.0f;
                    p += freq / 16000.0f;
                    if (p >= 1.0f) p -= 1.0f;
                    float amp = (1.0f - t) * 5000.0f;
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

static inline void draw_rot_round_box(lv_layer_t *layer, float cx, float cy,
                                      float ox, float oy, float w, float h,
                                      int radius, uint32_t color_hex,
                                      float cos_a, float sin_a)
{
    int rx, ry;
    rot_pt(cx, cy, ox, oy, cos_a, sin_a, &rx, &ry);
    draw_round_box(layer, rx - (int)(w * 0.5f), ry - (int)(h * 0.5f), (int)w, (int)h, radius, color_hex);
}

// 绘制超萌小海獭与冲浪板
static void draw_otter(lv_layer_t *layer, float cx, float cy, float angle_deg, bool dazed, bool is_pumping)
{
    float rad = angle_deg * (3.14159265f / 180.0f);
    float cos_a = cosf(rad);
    float sin_a = sinf(rad);

    // 1. 亮黄色极速冲浪板 (微弧边矩形)
    draw_rot_round_box(layer, cx, cy, 0.0f, 6.0f, 32.0f, 6.0f, 3, 0xFACC15, cos_a, sin_a);
    // 冲浪板防滑条纹
    draw_rot_round_box(layer, cx, cy, -4.0f, 6.0f, 5.0f, 4.0f, 2, 0xF97316, cos_a, sin_a);
    draw_rot_round_box(layer, cx, cy, +4.0f, 6.0f, 5.0f, 4.0f, 2, 0x0284C7, cos_a, sin_a);

    // 2. 小海獭圆滚滚焦糖色身躯
    float body_y = is_pumping ? 0.0f : -4.0f;
    draw_rot_round_box(layer, cx, cy, 0.0f, body_y, 18.0f, 14.0f, 6, 0x854D0E, cos_a, sin_a);
    // 软糯肚皮
    draw_rot_round_box(layer, cx, cy, 2.0f, body_y, 10.0f, 10.0f, 4, 0xFEF08A, cos_a, sin_a);

    // 3. 小海獭萌萌大头
    float head_x = 4.0f;
    float head_y = is_pumping ? -6.0f : -10.0f;
    draw_rot_round_box(layer, cx, cy, head_x, head_y, 14.0f, 12.0f, 5, 0x854D0E, cos_a, sin_a);

    // 左右可爱小圆耳
    draw_rot_round_box(layer, cx, cy, head_x - 4.0f, head_y - 6.0f, 4.0f, 4.0f, 2, 0x713F12, cos_a, sin_a);
    draw_rot_round_box(layer, cx, cy, head_x + 3.0f, head_y - 6.0f, 4.0f, 4.0f, 2, 0x713F12, cos_a, sin_a);

    // 4. 帅气防风墨镜 (酷酷冲浪装备)
    if (!dazed) {
        draw_rot_round_box(layer, cx, cy, head_x + 2.0f, head_y - 1.0f, 11.0f, 5.0f, 2, 0x0F172A, cos_a, sin_a);
        // 墨镜镜面高光 (极速反光)
        draw_rot_round_box(layer, cx, cy, head_x + 3.0f, head_y - 2.0f, 4.0f, 2.0f, 1, 0x38BDF8, cos_a, sin_a);
    } else {
        // 拍水晕眩表情：晕圈眼
        draw_rot_round_box(layer, cx, cy, head_x + 1.0f, head_y - 1.0f, 4.0f, 4.0f, 2, 0x1E293B, cos_a, sin_a);
        draw_rot_round_box(layer, cx, cy, head_x + 5.0f, head_y - 1.0f, 4.0f, 4.0f, 2, 0x1E293B, cos_a, sin_a);
    }

    // 5. 黑色小鼻头与粉红小舌头
    draw_rot_round_box(layer, cx, cy, head_x + 7.0f, head_y + 1.0f, 3.0f, 2.0f, 1, 0x0F172A, cos_a, sin_a);
    draw_rot_round_box(layer, cx, cy, head_x + 6.0f, head_y + 3.0f, 3.0f, 2.0f, 1, 0xFB7185, cos_a, sin_a);

    // 6. 迎风飞扬小肉垫前爪
    draw_rot_round_box(layer, cx, cy, head_x + 8.0f, head_y + 4.0f, 4.0f, 4.0f, 2, 0x713F12, cos_a, sin_a);
}

// 绘制动态海浪与场景
static void on_draw_playfield(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 碧蓝天空与远景日光
    draw_box(layer, 0, 0, SCREEN_W, 140, 0x38BDF8);
    draw_box(layer, 0, 140, SCREEN_W, 70, 0x7DD3FC);

    // 远景暖阳
    draw_round_box(layer, 185, 25, 34, 34, 17, 0xFDE047);
    draw_round_box(layer, 190, 30, 24, 24, 12, 0xFEF08A);

    // 2. 动态双谐波海浪本体 (4 像素竖列密集矢量合批，水面起伏极平滑)
    for (int x = 0; x < SCREEN_W; x += 4) {
        float surf_y = wave_get_game_surface_y(&s_game, (float)x);
        int sy = (int)surf_y;
        if (sy < 0) sy = 0;
        if (sy > SCREEN_H) sy = SCREEN_H;

        // 海浪白沫顶线
        draw_box(layer, x, sy - 2, 4, 3, 0xF0FDF4);
        // 表层浅蓝海水
        int shallow_h = 320 - sy;
        if (shallow_h > 0) {
            draw_box(layer, x, sy + 1, 4, 24, 0x0284C7);
            // 深海湛蓝底色
            if (shallow_h > 24) {
                draw_box(layer, x, sy + 25, 4, shallow_h - 24, 0x0369A1);
            }
        }
    }

    // 3. 障碍物绘制
    for (int i = 0; i < WAVE_MAX_OBSTACLES; i++) {
        if (!s_game.obstacles[i].active) continue;
        float sx = s_game.obstacles[i].x - s_game.distance;
        if (sx < -20.0f || sx > SCREEN_W + 20.0f) continue;

        int ox = (int)sx;
        int oy = (int)s_game.obstacles[i].y;

        if (s_game.obstacles[i].type == WAVE_OBS_CRAB) {
            // 调皮小红蟹
            draw_round_box(layer, ox, oy, 16, 11, 4, 0xEF4444);
            // 左右大钳子
            draw_box(layer, ox - 3, oy - 2, 4, 4, 0xDC2626);
            draw_box(layer, ox + 15, oy - 2, 4, 4, 0xDC2626);
            // 黑豆眼
            draw_box(layer, ox + 3, oy + 2, 2, 3, 0x0F172A);
            draw_box(layer, ox + 11, oy + 2, 2, 3, 0x0F172A);
        } else if (s_game.obstacles[i].type == WAVE_OBS_DRIFTWOOD) {
            // 漂流木
            draw_round_box(layer, ox, oy, 26, 12, 4, 0x78350F);
            draw_box(layer, ox + 4, oy + 3, 18, 2, 0x92400E);
            draw_round_box(layer, ox + 8, oy - 3, 5, 5, 2, 0x15803D); // 附着绿海藻
        } else if (s_game.obstacles[i].type == WAVE_OBS_JELLYFISH) {
            // 浮游荧光水母
            draw_round_box(layer, ox, oy, 14, 10, 5, 0xF472B6);
            draw_box(layer, ox + 2, oy + 10, 2, 6, 0xFB7185);
            draw_box(layer, ox + 6, oy + 10, 2, 7, 0xFB7185);
            draw_box(layer, ox + 10, oy + 10, 2, 6, 0xFB7185);
        }
    }

    // 4. 收集品绘制
    for (int i = 0; i < WAVE_MAX_ITEMS; i++) {
        if (!s_game.items[i].active) continue;
        float sx = s_game.items[i].x - s_game.distance;
        if (sx < -20.0f || sx > SCREEN_W + 20.0f) continue;

        int ix = (int)sx;
        int iy = (int)s_game.items[i].y;

        if (s_game.items[i].type == WAVE_ITEM_STARFISH) {
            // 闪亮五角海星
            draw_round_box(layer, ix - 6, iy - 6, 12, 12, 4, 0xF59E0B);
            draw_round_box(layer, ix - 2, iy - 8, 4, 16, 2, 0xFBBF24);
            draw_round_box(layer, ix - 8, iy - 2, 16, 4, 2, 0xFBBF24);
        } else if (s_game.items[i].type == WAVE_ITEM_SHELL) {
            // 珍珠贝壳
            draw_round_box(layer, ix - 7, iy - 6, 14, 12, 5, 0xE0E7FF);
            draw_box(layer, ix - 5, iy - 4, 10, 2, 0xC7D2FE);
            // 内部珍珠微光
            draw_round_box(layer, ix - 2, iy - 2, 4, 4, 2, 0xFFFFFF);
        }
    }

    // 5. 粒子系统绘制
    for (int i = 0; i < WAVE_MAX_PARTICLES; i++) {
        if (!s_game.particles[i].active) continue;
        int px = (int)s_game.particles[i].x;
        int py = (int)s_game.particles[i].y;
        int sz = (int)s_game.particles[i].size;
        if (sz < 2) sz = 2;

        uint32_t col = 0xFFFFFF;
        if (s_game.particles[i].type == WAVE_PART_PUMP_SPRAY) col = 0xBAE6FD;
        else if (s_game.particles[i].type == WAVE_PART_RAINBOW_SPLASH) col = 0xFACC15;
        else if (s_game.particles[i].type == WAVE_PART_STAR_SPARKLE) col = 0xFDE047;

        draw_box(layer, px, py, sz, sz, col);
    }

    // 6. 主角小海獭绘制
    bool dazed = (s_game.otter_state == WAVE_OTTER_DAZED);
    bool pumping = (s_game.otter_state == WAVE_OTTER_PUMPING);
    draw_otter(layer, s_game.x, s_game.y, s_game.board_angle, dazed, pumping);
}

// 40 FPS 核心帧循环
static void on_timer(lv_timer_t *t)
{
    (void)t;

    // 单步物理迭代 (25ms)
    wave_step(&s_game, 25);

    // 捕获并派发音效事件
    wave_sound_t snd = wave_consume_sound(&s_game);
    if (snd != WAVE_SND_NONE) {
        send_sound(snd);
    }

    // 更新 HUD
    if (s_hud_score) {
        lv_label_set_text_fmt(s_hud_score, "%u", (unsigned int)s_game.score);
    }
    if (s_hud_dist) {
        int m = (int)(s_game.distance / 10.0f);
        lv_label_set_text_fmt(s_hud_dist, "%dm", m);
    }
    if (s_hud_combo) {
        if (s_game.combo > 1) {
            lv_label_set_text_fmt(s_hud_combo, "x%d COMBO!", s_game.combo);
            lv_obj_clear_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
        }
    }

    // 结算界面切换
    if (s_game.game_state == WAVE_GAME_OVER) {
        if (s_gameover_box && lv_obj_has_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN)) {
            lv_obj_clear_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);
            if (s_gameover_score) {
                lv_label_set_text_fmt(s_gameover_score, "SCORE: %u\nDIST: %dm\nSTAR: %d",
                                      (unsigned int)s_game.score,
                                      (int)(s_game.distance / 10.0f),
                                      s_game.starfish_count);
            }
        }
    } else {
        if (s_gameover_box && !lv_obj_has_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN)) {
            lv_obj_add_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (s_hint && s_game.time_sec > 4.0f) {
        lv_obj_add_flag(s_hint, LV_OBJ_FLAG_HIDDEN);
    }

    // 请求重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 统一入口：建屏、启动任务与定时器
void demo_wave_enter(void)
{
    // 初始化核心状态机
    wave_init(&s_game, 0x20260920);

    // 启动后台音效合成队列与任务
    s_snd_queue = xQueueCreate(16, sizeof(wave_sound_t));
    s_audio_running = true;
    xTaskCreate(wave_audio_task, "wave_audio", 4096, NULL, 5, &s_snd_task);

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
    s_hud_score = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0x0F172A), 0);
    lv_obj_align(s_hud_score, LV_ALIGN_TOP_LEFT, 16, 8);
    lv_label_set_text(s_hud_score, "0");

    s_hud_dist = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_dist, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_dist, lv_color_hex(0x0F172A), 0);
    lv_obj_align(s_hud_dist, LV_ALIGN_TOP_RIGHT, -16, 8);
    lv_label_set_text(s_hud_dist, "0m");

    s_hud_combo = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hud_combo, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_combo, lv_color_hex(0xD97706), 0);
    lv_obj_align(s_hud_combo, LV_ALIGN_TOP_MID, 0, 26);
    lv_label_set_text(s_hud_combo, "");
    lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);

    // 结算浮层
    s_gameover_box = lv_obj_create(s_scr);
    lv_obj_set_size(s_gameover_box, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_gameover_box, 0, 0);
    lv_obj_set_style_bg_opa(s_gameover_box, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_gameover_box, 0, 0);
    lv_obj_clear_flag(s_gameover_box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);

    s_gameover_title = lv_label_create(s_gameover_box);
    lv_obj_set_style_text_font(s_gameover_title, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(s_gameover_title, lv_color_hex(0xEF4444), 0);
    lv_obj_align(s_gameover_title, LV_ALIGN_TOP_MID, 0, 80);
    lv_label_set_text(s_gameover_title, "WAVE OVER");

    s_gameover_score = lv_label_create(s_gameover_box);
    lv_obj_set_style_text_font(s_gameover_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_gameover_score, lv_color_hex(0x0F172A), 0);
    lv_obj_set_style_text_align(s_gameover_score, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(s_gameover_score, LV_ALIGN_TOP_MID, 0, 120);

    s_gameover_hint = lv_label_create(s_gameover_box);
    lv_obj_set_style_text_font(s_gameover_hint, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_gameover_hint, lv_color_hex(0x2563EB), 0);
    lv_obj_align(s_gameover_hint, LV_ALIGN_BOTTOM_MID, 0, -30);
    lv_label_set_text(s_gameover_hint, "PRESS OK TO SURF AGAIN");

    s_hint = lv_label_create(s_scr);
    lv_obj_set_style_text_font(s_hint, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hint, lv_color_hex(0x0F172A), 0);
    lv_obj_align(s_hint, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_label_set_text(s_hint, "HOLD DN PUMP   HOLD OK JUMP");

    // 载入主屏
    lv_screen_load(s_scr);

    // 启动 40 FPS 定时器
    s_game_timer = lv_timer_create(on_timer, 25, NULL);
}

// 统一退出接口：清理资源与停止任务
void demo_wave_exit(void)
{
    if (s_game_timer) {
        lv_timer_del(s_game_timer);
        s_game_timer = NULL;
    }

    s_audio_running = false;
    if (s_snd_queue) {
        wave_sound_t stop = WAVE_SND_NONE;
        xQueueSend(s_snd_queue, &stop, 0);
        vTaskDelay(pdMS_TO_TICKS(50));
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    s_snd_task = NULL;

    s_playfield = NULL;
    s_hud_score = NULL;
    s_hud_dist = NULL;
    s_hud_combo = NULL;
    s_gameover_box = NULL;
    s_gameover_title = NULL;
    s_gameover_score = NULL;
    s_gameover_hint = NULL;
    s_hint = NULL;

    if (s_scr) {
        lv_obj_del(s_scr);
        s_scr = NULL;
    }
}

// DOWN 压板跟手指走：按下加速，松开立刻收力。CLICK 在长按后不会再来，板会一直压着。
// OK 按下起跳，按住则空中把板面对齐浪面。
void demo_wave_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS) {
            wave_input_ok_hold(&s_game, false);
            wave_input_down_release(&s_game);
            wave_input_up(&s_game);
        }
    } else if (btn == BSP_BTN_DOWN) {
        if (ev == BSP_BTN_PRESS) {
            wave_input_ok_hold(&s_game, false);
            wave_input_down(&s_game);
        } else if (ev == BSP_BTN_RELEASE) {
            wave_input_down_release(&s_game);
        }
    } else if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS) {
            wave_input_down_release(&s_game);
            wave_input_ok(&s_game);
            wave_input_ok_hold(&s_game, true);
        } else if (ev == BSP_BTN_RELEASE) {
            wave_input_ok_hold(&s_game, false);
        }
    }
}
