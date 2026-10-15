// main/demo_flappy.c —— 《像素飞鸟 HD》(Flappy Bird HD: Gravity Rush)
// 基于零 DRAM 开销的原生 LVGL 9.x 矢量即时绘制，包含昼夜模式交替、金色水管双倍积分、
// 上下浮动乱流、经典三键点火拍翅与 16kHz 街机风芯片音效。
#include "demo.h"
#include "flappy_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_flappy";

#define SCREEN_W 240
#define SCREEN_H 320

typedef enum {
    FLAPPY_SND_NONE = 0,
    FLAPPY_SND_FLAP,
    FLAPPY_SND_SCORE,
    FLAPPY_SND_GOLDEN,
    FLAPPY_SND_HIT,
    FLAPPY_SND_DIE
} flappy_snd_t;

static flappy_game_t s_game;
static lv_obj_t     *s_scr = NULL;
static lv_obj_t     *s_playfield = NULL;
static lv_timer_t   *s_game_timer = NULL;

static lv_obj_t     *s_hud_score_cont = NULL;
static lv_obj_t     *s_hud_score_lbl  = NULL;
static lv_obj_t     *s_hud_best_cont   = NULL;
static lv_obj_t     *s_hud_best_lbl   = NULL;

static lv_obj_t     *s_ready_card      = NULL;
static lv_obj_t     *s_ready_hint_lbl  = NULL;

static lv_obj_t     *s_gameover_card   = NULL;
static lv_obj_t     *s_go_score_lbl    = NULL;
static lv_obj_t     *s_go_best_lbl     = NULL;
static lv_obj_t     *s_go_hint_lbl     = NULL;

static int           s_last_rendered_score = -1;
static int           s_last_rendered_best  = -1;
static flappy_state_t s_last_rendered_state = (flappy_state_t)-1;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;

static uint32_t      s_frame_tick = 0;
static uint8_t       s_volume = 85;

static void send_sound(flappy_snd_t snd)
{
    if (s_snd_queue) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 独立后台音效合成任务 (16kHz 16-bit 街机芯片音效)
static void flappy_audio_task(void *arg)
{
    (void)arg;
    flappy_snd_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(50)) == pdTRUE) {
            if (snd == FLAPPY_SND_NONE) continue;

            if (snd == FLAPPY_SND_FLAP) {
                // 拍翅急促哨声 (620Hz -> 920Hz 快速扫频, 35ms)
                const int total = 560;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 620.0f + t * 300.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.4f) * 6500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == FLAPPY_SND_SCORE) {
                // 穿过普通水管清脆叮咚 (988Hz B5 40ms -> 1318Hz E6 70ms)
                const int freqs[] = { 988, 1318 };
                const int lens[]  = { 640, 1120 };
                for (int note = 0; note < 2; note++) {
                    float phase = 0.0f;
                    float freq = (float)freqs[note];
                    for (int i = 0; i < lens[note]; i++) {
                        float t = (float)i / (float)lens[note];
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t * 0.7f) * 7500.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == lens[note] - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == FLAPPY_SND_GOLDEN) {
                // 金水管三连音琶音 (784Hz G5 -> 988Hz B5 -> 1318Hz E6 -> 1568Hz G6)
                const int freqs[] = { 784, 988, 1318, 1568 };
                for (int note = 0; note < 4; note++) {
                    float phase = 0.0f;
                    float freq = (float)freqs[note];
                    const int len = 700;
                    for (int i = 0; i < len; i++) {
                        float t = (float)i / (float)len;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t * 0.6f) * 8500.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == len - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == FLAPPY_SND_HIT) {
                // 撞击闷响白噪声 (40ms)
                const int total = 700;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * 9000.0f;
                    int16_t raw_noise = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                    buf[i % 256] = raw_noise;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == FLAPPY_SND_DIE) {
                // 坠落低鸣 (380Hz -> 90Hz 衰减, 150ms)
                const int total = 2400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 380.0f - t * 290.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * (1.0f - t) * 7500.0f;
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

// 零 DRAM 开销原生 LVGL 9.x 矢量即时绘制矩形辅助 (带屏幕视口安全裁切，防止下溢与溢出)
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t hex_color)
{
    if (w <= 0 || h <= 0) return;
    if (x < 0) {
        w += x;
        x = 0;
        if (w <= 0) return;
    }
    if (y < 0) {
        h += y;
        y = 0;
        if (h <= 0) return;
    }
    if (x >= SCREEN_W || y >= SCREEN_H) return;
    if (x + w > SCREEN_W) w = SCREEN_W - x;
    if (y + h > SCREEN_H) h = SCREEN_H - y;
    if (w <= 0 || h <= 0) return;

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

// 绘制像素飞鸟 (具有 3 帧动态振翅、眼睛、高光与仰俯角度)
static void draw_bird(lv_layer_t *layer, int bx, int by, float rotation, uint32_t tick, bool is_diving)
{
    // 旋转姿态偏移：俯冲时身体略低头，仰冲时嘴巴抬高
    int pitch_offset = (int)(rotation / 25.0f);
    if (pitch_offset > 3) pitch_offset = 3;
    if (pitch_offset < -2) pitch_offset = -2;

    // 1. 身体主干 (20x16 经典明黄椭圆像素)
    draw_box(layer, bx + 2, by + 1, 16, 14, 0xFACC15);
    draw_box(layer, bx + 4, by, 12, 16, 0xFACC15);

    // 2. 腹部亮奶油白高光
    draw_box(layer, bx + 4, by + 9, 8, 5, 0xFEF9C3);

    // 3. 动态羽翼振翅 (3 帧循环)
    int wing_frame = (tick / 3) % 3;
    if (is_diving) wing_frame = 0; // 俯冲收翅
    if (wing_frame == 0) {
        // 收翅/下拍
        draw_box(layer, bx + 2, by + 6, 7, 5, 0xEAB308);
        draw_box(layer, bx + 3, by + 10, 5, 2, 0xCA8A04);
    } else if (wing_frame == 1) {
        // 平展中位
        draw_box(layer, bx + 1, by + 4, 8, 5, 0xEAB308);
        draw_box(layer, bx + 2, by + 8, 6, 2, 0xCA8A04);
    } else {
        // 振翅高扬
        draw_box(layer, bx + 2, by + 2, 8, 5, 0xEAB308);
        draw_box(layer, bx + 3, by + 1, 6, 2, 0xFDE047);
    }

    // 4. 大眼睛与灵动黑眼珠
    int eye_x = bx + 12;
    int eye_y = by + 2 + pitch_offset;
    draw_box(layer, eye_x, eye_y, 6, 7, 0xFFFFFF);
    draw_box(layer, eye_x + 3, eye_y + 2, 3, 4, 0x0F172A);
    draw_box(layer, eye_x + 4, eye_y + 2, 1, 1, 0xFFFFFF); // 眼神光

    // 5. 橘红性感鸟嘴 (上喙与下喙)
    int beak_x = bx + 16;
    int beak_y = by + 6 + pitch_offset;
    draw_box(layer, beak_x, beak_y, 6, 4, 0xEA580C);
    draw_box(layer, beak_x, beak_y + 4, 5, 3, 0xC2410C);
    draw_box(layer, beak_x + 1, beak_y + 2, 5, 1, 0x7C2D12); // 嘴缝
}

// 绘制水管柱体与凸缘法兰
static void draw_pipe(lv_layer_t *layer, const flappy_pipe_t *p)
{
    if (!p->active) return;
    int px = (int)p->x;
    int gap_top = (int)p->gap_y;
    int gap_bot = (int)(p->gap_y + p->gap_height);
    int pw = (int)p->width; // 38
    int cap_h = 14;
    int cap_overhang = 3;

    // 颜色搭配方案 (普通绿水管 vs 金色水管)
    uint32_t c_body      = p->golden ? 0xFACC15 : 0x73BF2E;
    uint32_t c_highlight = p->golden ? 0xFEF08A : 0x9EE644;
    uint32_t c_shadow    = p->golden ? 0xCA8A04 : 0x558022;
    uint32_t c_rim       = p->golden ? 0x854D0E : 0x2E4A10;

    // ----------------- 上水管 (从 0 延伸至 gap_top) -----------------
    if (gap_top > 0) {
        int body_h = gap_top - cap_h;
        if (body_h > 0) {
            // 管身
            draw_box(layer, px, 0, pw, body_h, c_body);
            draw_box(layer, px + 3, 0, 5, body_h, c_highlight);
            draw_box(layer, px + pw - 6, 0, 5, body_h, c_shadow);
            draw_box(layer, px, 0, 1, body_h, c_rim);
            draw_box(layer, px + pw - 1, 0, 1, body_h, c_rim);
        }
        // 上水管管口凸缘法兰
        int cy = gap_top - cap_h;
        int cx = px - cap_overhang;
        int cw = pw + cap_overhang * 2;
        draw_box(layer, cx, cy, cw, cap_h, c_body);
        draw_box(layer, cx + 3, cy, 5, cap_h, c_highlight);
        draw_box(layer, cx + cw - 7, cy, 5, cap_h, c_shadow);
        draw_box(layer, cx, cy, cw, 1, c_rim);
        draw_box(layer, cx, cy + cap_h - 1, cw, 1, c_rim);
        draw_box(layer, cx, cy, 1, cap_h, c_rim);
        draw_box(layer, cx + cw - 1, cy, 1, cap_h, c_rim);
    }

    // ----------------- 下水管 (从 gap_bot 延伸至地面 280) -----------------
    if (gap_bot < FLAPPY_GROUND_Y) {
        int cx = px - cap_overhang;
        int cw = pw + cap_overhang * 2;
        int cy = gap_bot;
        // 下水管管口凸缘法兰
        draw_box(layer, cx, cy, cw, cap_h, c_body);
        draw_box(layer, cx + 3, cy, 5, cap_h, c_highlight);
        draw_box(layer, cx + cw - 7, cy, 5, cap_h, c_shadow);
        draw_box(layer, cx, cy, cw, 1, c_rim);
        draw_box(layer, cx, cy + cap_h - 1, cw, 1, c_rim);
        draw_box(layer, cx, cy, 1, cap_h, c_rim);
        draw_box(layer, cx + cw - 1, cy, 1, cap_h, c_rim);

        // 管身
        int body_y = gap_bot + cap_h;
        int body_h = FLAPPY_GROUND_Y - body_y;
        if (body_h > 0) {
            draw_box(layer, px, body_y, pw, body_h, c_body);
            draw_box(layer, px + 3, body_y, 5, body_h, c_highlight);
            draw_box(layer, px + pw - 6, body_y, 5, body_h, c_shadow);
            draw_box(layer, px, body_y, 1, body_h, c_rim);
            draw_box(layer, px + pw - 1, body_y, 1, body_h, c_rim);
        }
    }

    // 金色水管环绕闪烁火花 ✨
    if (p->golden) {
        int spark_y = gap_top + (int)p->gap_height / 2;
        int spark_tick = (s_frame_tick + (int)p->x) % 16;
        if (spark_tick < 8) {
            draw_box(layer, px + 4, spark_y - 12, 3, 3, 0xFFFFFF);
            draw_box(layer, px + pw - 6, spark_y + 10, 3, 3, 0xFEF08A);
        }
    }
}

// 核心帧即时渲染主函数
static void playfield_draw_cb(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    bool is_night = s_game.is_night;

    // 1. 天空背景色
    uint32_t sky_color = is_night ? 0x0B1329 : 0x62B8D2;
    draw_box(layer, 0, 0, SCREEN_W, FLAPPY_GROUND_Y, sky_color);

    // 2. 远景自然天象 (白天白云太阳 vs 夜晚繁星弯月)
    if (!is_night) {
        // 白天金灿灿暖阳
        draw_box(layer, 185, 25, 26, 26, 0xFDE047);
        draw_box(layer, 183, 27, 30, 22, 0xFACC15);
        // 远景飘动白云
        int cloud_x1 = ((int)(s_frame_tick * 0.4f)) % (SCREEN_W + 80) - 40;
        int cloud_x2 = ((int)(s_frame_tick * 0.2f + 120)) % (SCREEN_W + 80) - 40;
        // 云朵 1
        draw_box(layer, SCREEN_W - cloud_x1, 55, 48, 16, 0xE0F2FE);
        draw_box(layer, SCREEN_W - cloud_x1 + 8, 48, 32, 10, 0xF8FAFC);
        // 云朵 2
        draw_box(layer, SCREEN_W - cloud_x2, 110, 56, 18, 0xBAE6FD);
        draw_box(layer, SCREEN_W - cloud_x2 + 10, 102, 36, 12, 0xF0F9FF);
        // 远景城市剪影
        for (int i = 0; i < 7; i++) {
            int bx = i * 36;
            int bh = 30 + ((i * 17) % 25);
            draw_box(layer, bx, FLAPPY_GROUND_Y - bh, 32, bh, 0x4794AB);
            draw_box(layer, bx + 6, FLAPPY_GROUND_Y - bh + 6, 6, 8, 0x73C5DC);
        }
    } else {
        // 夜空皎洁月亮
        draw_box(layer, 188, 22, 22, 22, 0xFEF08A);
        draw_box(layer, 183, 20, 18, 26, sky_color); // 镂空弯月
        // 璀璨繁星
        for (int i = 0; i < 12; i++) {
            int sx = (i * 21 + 13) % (SCREEN_W - 10);
            int sy = (i * 19 + 7) % 180;
            int blink = (s_frame_tick + i * 3) % 12;
            if (blink > 3) {
                draw_box(layer, sx, sy, 2, 2, (blink > 8) ? 0xFFFFFF : 0x94A3B8);
            }
        }
        // 深蓝城市夜景
        for (int i = 0; i < 7; i++) {
            int bx = i * 36;
            int bh = 35 + ((i * 19) % 30);
            draw_box(layer, bx, FLAPPY_GROUND_Y - bh, 32, bh, 0x1E293B);
            // 亮着灯的黄色小窗户
            if ((i + s_frame_tick / 60) % 2 == 0) {
                draw_box(layer, bx + 8, FLAPPY_GROUND_Y - bh + 8, 4, 4, 0xFDE047);
                draw_box(layer, bx + 18, FLAPPY_GROUND_Y - bh + 16, 4, 4, 0xFDE047);
            }
        }
    }

    // 3. 绘制障碍物管道系统
    for (int i = 0; i < FLAPPY_MAX_PIPES; i++) {
        draw_pipe(layer, &s_game.pipes[i]);
    }

    // 4. 地面地表 (草皮层 + 泥土滚动条带)
    draw_box(layer, 0, FLAPPY_GROUND_Y, SCREEN_W, 2, 0x3F6212); // 草皮上沿暗线
    draw_box(layer, 0, FLAPPY_GROUND_Y + 2, SCREEN_W, 12, 0x65A30D); // 亮绿草坪
    draw_box(layer, 0, FLAPPY_GROUND_Y + 14, SCREEN_W, SCREEN_H - FLAPPY_GROUND_Y - 14, 0x78350F); // 坚实泥土

    // 地面高频卷轴斜纹动效 (随小鸟飞行极速后退)
    int ground_offset = (int)(s_frame_tick * 3) % 20;
    for (int gx = -ground_offset; gx < SCREEN_W + 20; gx += 20) {
        draw_box(layer, gx, FLAPPY_GROUND_Y + 14, 8, SCREEN_H - FLAPPY_GROUND_Y - 14, 0x5C240A);
        draw_box(layer, gx + 2, FLAPPY_GROUND_Y + 4, 6, 4, 0x4D7C0F); // 草坪暗斑
    }

    // 5. 绘制核心主角小鸟
    draw_bird(layer, (int)s_game.x, (int)s_game.y, s_game.rotation, s_frame_tick, (s_game.vy > 120.0f));
}

// 游戏核心 30ms 循环定时器回调 (约 33 FPS)
static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    if (s_game.state == FLAPPY_STATE_READY) {
        // 悬停轻微正弦浮动 (模拟待机浮游)
        s_game.y = FLAPPY_BIRD_INIT_Y + sinf((float)s_frame_tick * 0.15f) * 6.0f;
    } else {
        flappy_logic_update_ctx(&s_game, 30);
    }

    // 触发声音事件分发
    if (s_game.snd_flap) {
        send_sound(FLAPPY_SND_FLAP);
        s_game.snd_flap = false;
    }
    if (s_game.snd_score) {
        send_sound(FLAPPY_SND_SCORE);
        s_game.snd_score = false;
    }
    if (s_game.snd_golden) {
        send_sound(FLAPPY_SND_GOLDEN);
        s_game.snd_golden = false;
    }
    if (s_game.snd_hit) {
        send_sound(FLAPPY_SND_HIT);
        s_game.snd_hit = false;
    }
    if (s_game.snd_die) {
        send_sound(FLAPPY_SND_DIE);
        s_game.snd_die = false;
    }

    // 状态切换与 UI 浮层联动
    if (s_game.state != s_last_rendered_state) {
        s_last_rendered_state = s_game.state;
        if (s_game.state == FLAPPY_STATE_READY) {
            if (s_ready_card) lv_obj_remove_flag(s_ready_card, LV_OBJ_FLAG_HIDDEN);
            if (s_gameover_card) lv_obj_add_flag(s_gameover_card, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_score_cont) lv_obj_add_flag(s_hud_score_cont, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_best_cont) lv_obj_remove_flag(s_hud_best_cont, LV_OBJ_FLAG_HIDDEN);
        } else if (s_game.state == FLAPPY_STATE_PLAYING) {
            if (s_ready_card) lv_obj_add_flag(s_ready_card, LV_OBJ_FLAG_HIDDEN);
            if (s_gameover_card) lv_obj_add_flag(s_gameover_card, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_score_cont) lv_obj_remove_flag(s_hud_score_cont, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_best_cont) lv_obj_remove_flag(s_hud_best_cont, LV_OBJ_FLAG_HIDDEN);
        } else if (s_game.state == FLAPPY_STATE_GAMEOVER) {
            if (s_ready_card) lv_obj_add_flag(s_ready_card, LV_OBJ_FLAG_HIDDEN);
            if (s_gameover_card) lv_obj_remove_flag(s_gameover_card, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_score_cont) lv_obj_add_flag(s_hud_score_cont, LV_OBJ_FLAG_HIDDEN);
            if (s_hud_best_cont) lv_obj_remove_flag(s_hud_best_cont, LV_OBJ_FLAG_HIDDEN);
            if (s_go_score_lbl) lv_label_set_text_fmt(s_go_score_lbl, "SCORE: %d", s_game.score);
            if (s_go_best_lbl) lv_label_set_text_fmt(s_go_best_lbl, "BEST: %d", s_game.high_score);
        }
    }

    // 分数更新
    if (s_game.score != s_last_rendered_score) {
        s_last_rendered_score = s_game.score;
        if (s_hud_score_lbl) {
            lv_label_set_text_fmt(s_hud_score_lbl, "%d", s_game.score);
        }
    }
    if (s_game.high_score != s_last_rendered_best) {
        s_last_rendered_best = s_game.high_score;
        if (s_hud_best_lbl) {
            lv_label_set_text_fmt(s_hud_best_lbl, "HI: %d", s_game.high_score);
        }
    }

    // 呼吸提示动效
    if (s_game.state == FLAPPY_STATE_READY && s_ready_hint_lbl) {
        bool blink = (s_frame_tick / 15) % 2 == 0;
        lv_obj_set_style_text_color(s_ready_hint_lbl, blink ? lv_color_hex(0x4ADE80) : lv_color_hex(0x15803D), 0);
    } else if (s_game.state == FLAPPY_STATE_GAMEOVER && s_go_hint_lbl) {
        bool blink = (s_frame_tick / 12) % 2 == 0;
        lv_obj_set_style_text_color(s_go_hint_lbl, blink ? lv_color_hex(0x22C55E) : lv_color_hex(0x166534), 0);
    }

    // 标记画布重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// ============================================================================
// 统一外部接口 (在 demo.h 中声明并在 main.c DEMOS[] 中调度)
// ============================================================================

void demo_flappy_enter(void)
{
    ESP_LOGI(TAG, "启动《像素飞鸟 HD》演示页面");
    flappy_logic_init_ctx(&s_game);
    s_game.state = FLAPPY_STATE_READY;
    s_frame_tick = 0;
    s_last_rendered_score = -1;
    s_last_rendered_best = -1;
    s_last_rendered_state = (flappy_state_t)-1;

    // 1. 创建底层全屏屏幕
    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x000000), 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);

    // 2. 矢量渲染画布
    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_style_pad_all(s_playfield, 0, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_add_event_cb(s_playfield, playfield_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 3. 顶栏实时得分 (居中浮动药丸徽章)
    s_hud_score_cont = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_hud_score_cont);
    lv_obj_set_size(s_hud_score_cont, 84, 34);
    lv_obj_align(s_hud_score_cont, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_set_style_bg_color(s_hud_score_cont, lv_color_hex(0x0F172A), 0);
    lv_obj_set_style_bg_opa(s_hud_score_cont, LV_OPA_80, 0);
    lv_obj_set_style_border_color(s_hud_score_cont, lv_color_hex(0xFACC15), 0);
    lv_obj_set_style_border_width(s_hud_score_cont, 2, 0);
    lv_obj_set_style_radius(s_hud_score_cont, 17, 0);
    lv_obj_add_flag(s_hud_score_cont, LV_OBJ_FLAG_HIDDEN); // 开局就绪时隐藏

    s_hud_score_lbl = lv_label_create(s_hud_score_cont);
    lv_obj_center(s_hud_score_lbl);
    lv_obj_set_style_text_font(s_hud_score_lbl, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(s_hud_score_lbl, lv_color_hex(0xFFFFFF), 0);
    lv_label_set_text(s_hud_score_lbl, "0");

    // 4. 顶栏最高分 (右上角小徽章)
    s_hud_best_cont = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_hud_best_cont);
    lv_obj_set_size(s_hud_best_cont, 70, 24);
    lv_obj_align(s_hud_best_cont, LV_ALIGN_TOP_RIGHT, -6, 8);
    lv_obj_set_style_bg_color(s_hud_best_cont, lv_color_hex(0x0F172A), 0);
    lv_obj_set_style_bg_opa(s_hud_best_cont, LV_OPA_70, 0);
    lv_obj_set_style_border_color(s_hud_best_cont, lv_color_hex(0x64748B), 0);
    lv_obj_set_style_border_width(s_hud_best_cont, 1, 0);
    lv_obj_set_style_radius(s_hud_best_cont, 12, 0);

    s_hud_best_lbl = lv_label_create(s_hud_best_cont);
    lv_obj_center(s_hud_best_lbl);
    lv_obj_set_style_text_font(s_hud_best_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_best_lbl, lv_color_hex(0xFBBF24), 0);
    lv_label_set_text(s_hud_best_lbl, "HI: 0");

    // 5. 开局就绪提示卡片
    s_ready_card = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_ready_card);
    lv_obj_set_size(s_ready_card, 206, 120);
    lv_obj_align(s_ready_card, LV_ALIGN_CENTER, 0, -16);
    lv_obj_set_style_bg_color(s_ready_card, lv_color_hex(0x0F172A), 0);
    lv_obj_set_style_bg_opa(s_ready_card, LV_OPA_90, 0);
    lv_obj_set_style_border_color(s_ready_card, lv_color_hex(0xFACC15), 0);
    lv_obj_set_style_border_width(s_ready_card, 2, 0);
    lv_obj_set_style_radius(s_ready_card, 14, 0);

    lv_obj_t *ready_title = lv_label_create(s_ready_card);
    lv_obj_align(ready_title, LV_ALIGN_TOP_MID, 0, 10);
    lv_obj_set_style_text_font(ready_title, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(ready_title, lv_color_hex(0xFACC15), 0);
    lv_label_set_text(ready_title, "FLAPPY BIRD");

    s_ready_hint_lbl = lv_label_create(s_ready_card);
    lv_obj_align(s_ready_hint_lbl, LV_ALIGN_CENTER, 0, 6);
    lv_obj_set_style_text_font(s_ready_hint_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_ready_hint_lbl, lv_color_hex(0x4ADE80), 0);
    lv_label_set_text(s_ready_hint_lbl, "PRESS OK TO FLAP");

    lv_obj_t *ready_sub = lv_label_create(s_ready_card);
    lv_obj_align(ready_sub, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_set_style_text_font(ready_sub, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(ready_sub, lv_color_hex(0x94A3B8), 0);
    lv_label_set_text(ready_sub, "UP/DN: MENU");

    // 6. 阵亡结算卡片
    s_gameover_card = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_gameover_card);
    lv_obj_set_size(s_gameover_card, 206, 140);
    lv_obj_align(s_gameover_card, LV_ALIGN_CENTER, 0, -10);
    lv_obj_set_style_bg_color(s_gameover_card, lv_color_hex(0x180808), 0);
    lv_obj_set_style_bg_opa(s_gameover_card, LV_OPA_90, 0);
    lv_obj_set_style_border_color(s_gameover_card, lv_color_hex(0xEF4444), 0);
    lv_obj_set_style_border_width(s_gameover_card, 2, 0);
    lv_obj_set_style_radius(s_gameover_card, 14, 0);
    lv_obj_add_flag(s_gameover_card, LV_OBJ_FLAG_HIDDEN); // 初始隐藏

    lv_obj_t *go_title = lv_label_create(s_gameover_card);
    lv_obj_align(go_title, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_set_style_text_font(go_title, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(go_title, lv_color_hex(0xEF4444), 0);
    lv_label_set_text(go_title, "GAME OVER");

    s_go_score_lbl = lv_label_create(s_gameover_card);
    lv_obj_align(s_go_score_lbl, LV_ALIGN_TOP_MID, 0, 38);
    lv_obj_set_style_text_font(s_go_score_lbl, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(s_go_score_lbl, lv_color_hex(0xFFFFFF), 0);
    lv_label_set_text(s_go_score_lbl, "SCORE: 0");

    s_go_best_lbl = lv_label_create(s_gameover_card);
    lv_obj_align(s_go_best_lbl, LV_ALIGN_TOP_MID, 0, 68);
    lv_obj_set_style_text_font(s_go_best_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_go_best_lbl, lv_color_hex(0xFBBF24), 0);
    lv_label_set_text(s_go_best_lbl, "BEST: 0");

    s_go_hint_lbl = lv_label_create(s_gameover_card);
    lv_obj_align(s_go_hint_lbl, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_set_style_text_font(s_go_hint_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_go_hint_lbl, lv_color_hex(0x22C55E), 0);
    lv_label_set_text(s_go_hint_lbl, "OK: REPLAY | UP/DN: MENU");


    // 7. 启动音频队列与独立合成任务
    s_audio_running = true;
    s_snd_queue = xQueueCreate(16, sizeof(flappy_snd_t));
    xTaskCreate(flappy_audio_task, "flappy_audio", 4096, NULL, 5, &s_snd_task);

    // 8. 启动核心物理定时器 (30ms 步进)
    s_game_timer = lv_timer_create(game_timer_cb, 30, NULL);

    lv_screen_load(s_scr);
}

void demo_flappy_exit(void)
{
    ESP_LOGI(TAG, "退出《像素飞鸟 HD》演示页面");

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

    s_hud_score_cont = NULL;
    s_hud_score_lbl  = NULL;
    s_hud_best_cont  = NULL;
    s_hud_best_lbl   = NULL;
    s_ready_card     = NULL;
    s_ready_hint_lbl = NULL;
    s_gameover_card  = NULL;
    s_go_score_lbl   = NULL;
    s_go_best_lbl    = NULL;
    s_go_hint_lbl    = NULL;
    s_last_rendered_score = -1;
    s_last_rendered_best  = -1;
    s_last_rendered_state = (flappy_state_t)-1;
}

void demo_flappy_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 按下即刻响应跳跃，抬手不重复触发
    if (ev == BSP_BTN_PRESS) {
        static uint32_t s_last_btn_tick = 0;
        uint32_t now = esp_log_timestamp();
        if (now - s_last_btn_tick < 60) return;
        s_last_btn_tick = now;

        if (s_game.state == FLAPPY_STATE_GAMEOVER) {
            if (btn == BSP_BTN_OK) {
                flappy_logic_restart_ctx(&s_game);
                s_game.state = FLAPPY_STATE_READY;
            } else {
                bsp_demo_return_to_menu();
            }
        } else if (s_game.state == FLAPPY_STATE_READY) {
            if (btn == BSP_BTN_OK) {
                s_game.state = FLAPPY_STATE_PLAYING;
                flappy_logic_flap_ctx(&s_game);
            } else {
                bsp_demo_return_to_menu();
            }
        } else if (s_game.state == FLAPPY_STATE_PLAYING) {
            flappy_logic_flap_ctx(&s_game);
        }
    }
}


