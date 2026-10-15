// main/demo_adventure.c —— 《像素冒险岛 HD》(Pixel Adventure Island HD 豪华典藏版)
// 基于零 DRAM 开销的原生 LVGL 9.x 矢量即时绘制，包含经典全套热带水果盛宴、武器徽章升级、滑板无敌冲撞、16kHz 街机风音频合成。
#include "demo.h"
#include "adventure_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_adventure";

#define SCREEN_W 240
#define SCREEN_H 320
#define TOP_HUD_H 26

typedef enum {
    ADV_SND_NONE = 0,
    ADV_SND_JUMP,
    ADV_SND_THROW,
    ADV_SND_HIT,
    ADV_SND_KILL,
    ADV_SND_FRUIT,
    ADV_SND_POWER,
    ADV_SND_HURT,
    ADV_SND_EGG,
    ADV_SND_SKATE,
    ADV_SND_GAMEOVER
} adv_snd_t;

static adventure_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_playfield;
static lv_obj_t *s_hud_score;
static lv_obj_t *s_hud_weapon;
static lv_obj_t *s_hud_lives;
static lv_obj_t *s_hud_stamina;
static lv_obj_t *s_hud_hints;
static lv_obj_t *s_gameover_box;
static lv_obj_t *s_pause_box = NULL;
static lv_obj_t *s_pause_vol_label = NULL;
static uint8_t s_volume = 80;
static bool s_paused = false;

static int s_up_hold_ticks = 0;
static int s_down_hold_ticks = 0;
static lv_timer_t *s_game_timer;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_snd_task;
static uint32_t s_frame_tick = 0;
static uint32_t s_spawn_enemy_timer = 0;
static uint32_t s_spawn_item_timer = 0;

static void send_adv_sound(adv_snd_t snd)
{
    if (s_snd_queue) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 独立后台音效合成任务 (16kHz 16-bit 街机音效)
static void adv_audio_task(void *arg)
{
    (void)arg;
    adv_snd_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(85);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd != ADV_SND_NONE) {
                if (snd == ADV_SND_JUMP) {
                    // 跳跃上升音阶 (260Hz -> 620Hz)
                    const int total = 960;
                    float phase = 0.0f;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float freq = 260.0f + t * 360.0f;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t) * 6500.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                } else if (snd == ADV_SND_THROW) {
                    // 投掷破空声 (540Hz 下降至 220Hz)
                    const int total = 800;
                    float phase = 0.0f;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float freq = 540.0f - t * 320.0f;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t) * 5500.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                } else if (snd == ADV_SND_KILL) {
                    // 踩踏与击杀清脆双音 (587Hz -> 880Hz)
                    const int freqs[] = { 587, 880 };
                    for (int f = 0; f < 2; f++) {
                        const int total = 640;
                        float phase = 0.0f;
                        float freq = (float)freqs[f];
                        for (int i = 0; i < total; i++) {
                            float t = (float)i / (float)total;
                            phase += (freq / 16000.0f);
                            if (phase >= 1.0f) phase -= 1.0f;
                            float amp = (1.0f - t) * 7000.0f;
                            buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                            if ((i % 256) == 255 || i == total - 1) {
                                bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                            }
                        }
                    }
                } else if (snd == ADV_SND_FRUIT) {
                    // 吃水果欢快音阶 (1046Hz -> 1318Hz)
                    const int total = 640;
                    float phase = 0.0f;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float freq = 1046.0f + t * 272.0f;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t) * 6000.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                } else if (snd == ADV_SND_POWER) {
                    // 武器升级与牛奶三音阶 (659Hz -> 880Hz -> 1174Hz)
                    const int freqs[] = { 659, 880, 1174 };
                    for (int f = 0; f < 3; f++) {
                        const int total = 500;
                        float phase = 0.0f;
                        float freq = (float)freqs[f];
                        for (int i = 0; i < total; i++) {
                            float t = (float)i / (float)total;
                            phase += (freq / 16000.0f);
                            if (phase >= 1.0f) phase -= 1.0f;
                            float amp = (1.0f - t) * 6500.0f;
                            buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                            if ((i % 256) == 255 || i == total - 1) {
                                bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                            }
                        }
                    }
                } else if (snd == ADV_SND_SKATE) {
                    // 滑板极速旋转蜂鸣
                    const int total = 1800;
                    float phase = 0.0f;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float freq = 440.0f + sinf(t * 20.0f) * 120.0f;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t * 0.5f) * 7000.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                } else if (snd == ADV_SND_EGG) {
                    // 恐龙蛋 1UP 和弦 (523 -> 659 -> 784 -> 1046)
                    const int chord[] = { 523, 659, 784, 1046 };
                    for (int c = 0; c < 4; c++) {
                        const int total = 500;
                        float phase = 0.0f;
                        float freq = (float)chord[c];
                        for (int i = 0; i < total; i++) {
                            float t = (float)i / (float)total;
                            phase += (freq / 16000.0f);
                            if (phase >= 1.0f) phase -= 1.0f;
                            float amp = (1.0f - t) * 7500.0f;
                            buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                            if ((i % 256) == 255 || i == total - 1) {
                                bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                            }
                        }
                    }
                } else if (snd == ADV_SND_HURT) {
                    // 受伤低沉蜂鸣
                    const int total = 1600;
                    int16_t last_sample = 0;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float amp = (1.0f - t) * 8000.0f;
                        int16_t raw_noise = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                        last_sample = (int16_t)((last_sample * 2 + raw_noise) / 3);
                        buf[i % 256] = last_sample;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                } else if (snd == ADV_SND_GAMEOVER) {
                    // 游戏结束悲伤音阶 (392, 370, 349, 330)
                    const int sad[] = { 392, 370, 349, 330 };
                    for (int s = 0; s < 4; s++) {
                        const int total = 900;
                        float phase = 0.0f;
                        float freq = (float)sad[s];
                        for (int i = 0; i < total; i++) {
                            float t = (float)i / (float)total;
                            phase += (freq / 16000.0f);
                            if (phase >= 1.0f) phase -= 1.0f;
                            float amp = (1.0f - t) * 6000.0f;
                            buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                            if ((i % 256) == 255 || i == total - 1) {
                                bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                            }
                        }
                    }
                }
            }
        }
    }
}

// 零 DRAM 开销纯矩形快速绘制
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t rgb)
{
    if (x >= SCREEN_W || y >= SCREEN_H || x + w <= 0 || y + h <= 0) return;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > SCREEN_W) w = SCREEN_W - x;
    if (y + h > SCREEN_H) h = SCREEN_H - y;
    if (w <= 0 || h <= 0) return;

    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(rgb);
    dsc.bg_opa = LV_OPA_COVER;
    dsc.border_width = 0;

    lv_area_t a;
    a.x1 = x;
    a.y1 = y;
    a.x2 = x + w - 1;
    a.y2 = y + h - 1;
    lv_draw_rect(layer, &dsc, &a);
}

// 绘制字母徽章 [A] / [K] / [P]
static void draw_badge(lv_layer_t *layer, int x, int y, char letter, uint32_t color)
{
    // 徽章外框
    draw_box(layer, x - 1, y - 1, 16, 16, 0x000000);
    draw_box(layer, x, y, 14, 14, color);
    draw_box(layer, x + 1, y + 1, 12, 2, 0xFFFFFF); // 顶部高光

    // 绘制像素字母
    if (letter == 'A') {
        draw_box(layer, x + 5, y + 3, 4, 2, 0xFFFFFF);
        draw_box(layer, x + 3, y + 5, 3, 7, 0xFFFFFF);
        draw_box(layer, x + 8, y + 5, 3, 7, 0xFFFFFF);
        draw_box(layer, x + 5, y + 7, 4, 2, 0xFFFFFF);
    } else if (letter == 'K') {
        draw_box(layer, x + 3, y + 3, 3, 9, 0xFFFFFF);
        draw_box(layer, x + 8, y + 3, 3, 3, 0xFFFFFF);
        draw_box(layer, x + 6, y + 6, 3, 3, 0xFFFFFF);
        draw_box(layer, x + 8, y + 9, 3, 3, 0xFFFFFF);
    } else if (letter == 'P') {
        draw_box(layer, x + 3, y + 3, 3, 9, 0xFFFFFF);
        draw_box(layer, x + 6, y + 3, 4, 2, 0xFFFFFF);
        draw_box(layer, x + 8, y + 5, 3, 3, 0xFFFFFF);
        draw_box(layer, x + 6, y + 7, 4, 2, 0xFFFFFF);
    }
}

// LVGL 9.x 矢量即时绘制回调
static void playfield_draw_cb(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_DRAW_MAIN) return;

    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 顶部专用 HUD 遮蔽保护栏 (保证绝不遮挡文字)
    draw_box(layer, 0, 0, SCREEN_W, TOP_HUD_H, 0x060D1A);
    draw_box(layer, 0, TOP_HUD_H - 1, SCREEN_W, 1, 0xF59E0B); // 金色分割线

    // 2. 热带海岛蔚蓝天空 (从 y = 26 开始，安全避开顶部 HUD)
    draw_box(layer, 0, TOP_HUD_H, SCREEN_W, (int)ADVENTURE_GROUND_Y - TOP_HUD_H, 0x38BDF8);

    // 远景白云与山脉
    int cloud_offset = (s_frame_tick / 2) % (SCREEN_W + 60);
    draw_box(layer, SCREEN_W - cloud_offset, 48, 48, 14, 0xE0F2FE);
    draw_box(layer, SCREEN_W - cloud_offset + 8, 42, 32, 10, 0xF0F9FF);

    // 远景碧绿海岛群山
    draw_box(layer, 0, 210, 60, 50, 0x0D9488);
    draw_box(layer, 120, 190, 80, 70, 0x0F766E);

    // 椰子树随卷轴滚动
    int tree_scroll = (s_frame_tick * (s_game.player.has_skateboard ? 4 : 2)) % 180;
    for (int t = 0; t < 3; t++) {
        int tx = ((t * 90 - tree_scroll) % 270 + 270) % 270 - 20;
        // 树干
        draw_box(layer, tx + 14, 195, 6, 65, 0x78350F);
        // 椰子树冠 (深绿草木)
        draw_box(layer, tx, 175, 34, 20, 0x166534);
        draw_box(layer, tx + 6, 170, 22, 8, 0x15803D);
        draw_box(layer, tx + 12, 185, 4, 4, 0x451A03); // 椰子果
    }

    // 3. 地面与沙滩泥土 (地表纹理随奔跑高速向左卷动)
    draw_box(layer, 0, (int)ADVENTURE_GROUND_Y, SCREEN_W, 14, 0x22C55E); // 草原顶层
    draw_box(layer, 0, (int)ADVENTURE_GROUND_Y + 14, SCREEN_W, SCREEN_H - (int)ADVENTURE_GROUND_Y - 14, 0x854D0E); // 热带沙土

    // 动效：地表高速卷轴动态草尖与碎石纹理
    int ground_scroll = (int)(s_frame_tick * (s_game.player.has_skateboard ? 6 : 4)) % 24;
    for (int gx = -ground_scroll; gx < SCREEN_W + 24; gx += 24) {
        // 翠绿草尖细节 (深浅交替)
        draw_box(layer, gx + 2, (int)ADVENTURE_GROUND_Y + 2, 6, 4, 0x15803D);
        draw_box(layer, gx + 12, (int)ADVENTURE_GROUND_Y + 6, 4, 3, 0x16A34A);
        // 泥土层鹅卵石与沙土暗纹
        draw_box(layer, gx + 6, (int)ADVENTURE_GROUND_Y + 18, 5, 3, 0x5C240A);
        draw_box(layer, gx + 16, (int)ADVENTURE_GROUND_Y + 28, 7, 4, 0x451A03);
    }

    // 4. 绘制丰富的水果盛宴与特殊道具
    for (int i = 0; i < ADVENTURE_MAX_ITEMS; i++) {
        adventure_item_t *it = &s_game.items[i];
        if (!it->active) continue;
        int ix = (int)it->x;
        int iy = (int)it->y;

        switch (it->type) {
            case ADV_ITEM_BANANA:
                // 🍌 香蕉：弧形亮黄 + 绿茎 + 棕尖
                draw_box(layer, ix + 2, iy + 2, 10, 5, 0xFACC15);
                draw_box(layer, ix, iy, 4, 3, 0x15803D);
                draw_box(layer, ix + 10, iy + 4, 3, 2, 0x78350F);
                break;
            case ADV_ITEM_APPLE:
                // 🍎 红苹果：圆润红果身 + 绿小叶 + 棕果梗
                draw_box(layer, ix + 2, iy + 3, 10, 10, 0xEF4444);
                draw_box(layer, ix + 5, iy, 2, 4, 0x78350F);
                draw_box(layer, ix + 7, iy + 1, 4, 2, 0x22C55E);
                draw_box(layer, ix + 3, iy + 4, 2, 2, 0xFCA5A5); // 高光
                break;
            case ADV_ITEM_STRAWBERRY:
                // 🍓 草莓：鲜艳草莓红 + 锯齿绿帽子 + 芝麻小黄点
                draw_box(layer, ix + 2, iy + 4, 10, 8, 0xF43F5E);
                draw_box(layer, ix + 4, iy + 10, 6, 3, 0xF43F5E);
                draw_box(layer, ix + 1, iy + 2, 12, 3, 0x16A34A);
                draw_box(layer, ix + 4, iy + 6, 2, 2, 0xFEF08A);
                draw_box(layer, ix + 8, iy + 7, 2, 2, 0xFEF08A);
                break;
            case ADV_ITEM_WATERMELON:
                // 🍉 西瓜：经典绿皮 + 白边 + 鲜红瓜瓤 + 黑籽
                draw_box(layer, ix, iy + 9, 16, 4, 0x15803D);     // 绿皮
                draw_box(layer, ix + 1, iy + 7, 14, 2, 0xDCFCE7); // 白瓤
                draw_box(layer, ix + 2, iy + 2, 12, 5, 0xEF4444); // 红瓤
                draw_box(layer, ix + 4, iy + 4, 2, 2, 0x000000); // 瓜籽
                draw_box(layer, ix + 9, iy + 4, 2, 2, 0x000000);
                break;
            case ADV_ITEM_PINEAPPLE:
                // 🍍 菠萝：金黄凤梨身 + 菱格暗斑 + 凤尾冠
                draw_box(layer, ix + 2, iy + 5, 12, 12, 0xF59E0B);
                draw_box(layer, ix + 4, iy, 8, 5, 0x15803D);
                draw_box(layer, ix + 4, iy + 7, 2, 2, 0x92400E);
                draw_box(layer, ix + 9, iy + 9, 2, 2, 0x92400E);
                break;
            case ADV_ITEM_GRAPE:
                // 🍇 紫葡萄：晶莹紫葡萄串 + 浅绿藤蔓
                draw_box(layer, ix + 5, iy, 4, 3, 0x15803D);
                draw_box(layer, ix + 2, iy + 3, 10, 5, 0x9333EA);
                draw_box(layer, ix + 4, iy + 8, 6, 5, 0x7E22CE);
                draw_box(layer, ix + 6, iy + 13, 3, 3, 0x6B21A8);
                break;
            case ADV_ITEM_MILK:
                // 🥛 牛奶瓶：纯白牛奶瓶 + 蓝瓶盖
                draw_box(layer, ix + 2, iy + 4, 10, 12, 0xFFFFFF);
                draw_box(layer, ix + 4, iy + 1, 6, 3, 0x0284C7);
                draw_box(layer, ix + 4, iy + 7, 6, 4, 0x38BDF8); // 标签
                break;
            case ADV_ITEM_EGG:
                // 🥚 金光恐龙蛋：金光闪烁巨蛋 + 高光
                draw_box(layer, ix + 2, iy, 12, 16, 0xFEF08A);
                draw_box(layer, ix, iy + 4, 16, 10, 0xF59E0B);
                draw_box(layer, ix + 4, iy + 2, 4, 4, 0xFFFFFF); // 闪耀高光
                break;
            case ADV_ITEM_BADGE_A:
                draw_badge(layer, ix, iy, 'A', 0xEF4444);
                break;
            case ADV_ITEM_BADGE_K:
                draw_badge(layer, ix, iy, 'K', 0x0284C7);
                break;
            case ADV_ITEM_BADGE_P:
                draw_badge(layer, ix, iy, 'P', 0x9333EA);
                break;
            case ADV_ITEM_SKATEBOARD:
                // 🛹 滑板：红身 + 银灰轮子
                draw_box(layer, ix, iy + 2, 18, 4, 0xEF4444);
                draw_box(layer, ix + 2, iy + 6, 4, 4, 0xE2E8F0);
                draw_box(layer, ix + 12, iy + 6, 4, 4, 0xE2E8F0);
                break;
        }
    }

    // 5. 绘制敌人 (蜗牛/青蛙/飞鸟)
    for (int i = 0; i < ADVENTURE_MAX_ENEMIES; i++) {
        adventure_enemy_t *e = &s_game.enemies[i];
        if (!e->active) continue;
        int ex = (int)e->x;
        int ey = (int)e->y;

        if (e->type == ADV_ENEMY_SNAIL) {
            // 蜗牛：棕褐色坚硬螺旋壳 + 浅黄身躯
            draw_box(layer, ex + 4, ey, 14, 12, 0x92400E);
            draw_box(layer, ex, ey + 6, 8, 8, 0xFDE68A);
            draw_box(layer, ex + 1, ey + 4, 2, 3, 0x000000); // 触角
        } else if (e->type == ADV_ENEMY_FROG) {
            // 青蛙：翠绿跳跃体型 + 萌萌大眼
            draw_box(layer, ex + 2, ey + 4, 14, 12, 0x16A34A);
            draw_box(layer, ex + 2, ey + 2, 5, 5, 0xFFFFFF);
            draw_box(layer, ex + 13, ey + 2, 5, 5, 0xFFFFFF);
            draw_box(layer, ex + 2, ey + 3, 2, 2, 0x000000);
            draw_box(layer, ex + 14, ey + 3, 2, 2, 0x000000);
        } else if (e->type == ADV_ENEMY_BIRD) {
            // 飞鸟：红色羽翼 + 金黄鸟嘴 + 动态振翅
            draw_box(layer, ex + 4, ey + 2, 12, 8, 0xEF4444);
            draw_box(layer, ex, ey + 4, 6, 4, 0xFBBF24); // 鸟喙
            int wing = ((s_frame_tick / 4) % 2 == 0) ? -4 : 4;
            draw_box(layer, ex + 8, ey + 4 + wing, 8, 4, 0xDC2626); // 翅膀
        }
    }

    // 6. 绘制投射物 (石斧/飞刀/月亮刃)
    for (int i = 0; i < ADVENTURE_MAX_PROJECTILES; i++) {
        adventure_projectile_t *p = &s_game.projectiles[i];
        if (!p->active) continue;
        int px = (int)p->x;
        int py = (int)p->y;

        if (p->type == ADV_WEAPON_AXE) {
            // 旋转石斧：银灰石刃 + 木柄
            draw_box(layer, px, py, 6, 12, 0x78350F); // 柄
            draw_box(layer, px + 2, py + 2, 8, 8, 0x94A3B8); // 斧刃
        } else if (p->type == ADV_WEAPON_KNIFE) {
            // 高速飞刀：银白疾速直线刃
            draw_box(layer, px, py + 2, 14, 4, 0xF1F5F9);
            draw_box(layer, px, py + 2, 4, 4, 0x475569);
        } else if (p->type == ADV_WEAPON_MOON_BLADE) {
            // 月影刃：霓虹炫紫全屏贯穿回旋飞刃
            draw_box(layer, px, py, 14, 14, 0xE879F9);
            draw_box(layer, px + 3, py + 3, 8, 8, 0x38BDF8);
        }
    }

    // 7. 绘制玩家 (高桥名人：红帽子 + 草裙 + 滑板)
    if (s_game.player.is_alive) {
        bool show_player = true;
        if (s_game.player.invincible_timer_ms > 0 && ((s_game.player.invincible_timer_ms / 60) % 2 == 0)) {
            show_player = false;
        }

        if (show_player) {
            int px = (int)s_game.player.x;
            int py = (int)s_game.player.y;

            // 动态步态与上下颠簸 (奔跑时有起伏律动)
            int run_frame = (s_frame_tick / 3) % 4;
            int bob = (run_frame % 2 == 1 && s_game.player.on_ground && !s_game.player.has_skateboard) ? 1 : 0;
            py += bob;

            // 若有滑板：滑板底座、旋转轮轴与喷射尾焰
            if (s_game.player.has_skateboard) {
                // 红色冲浪板板身
                draw_box(layer, px - 3, py + 22, 22, 4, 0xEF4444);
                draw_box(layer, px + 1, py + 21, 14, 2, 0xFCA5A5); // 板面防滑垫
                // 旋转轮轴
                uint32_t wheel_col1 = (s_frame_tick % 2 == 0) ? 0xFFFFFF : 0x94A3B8;
                uint32_t wheel_col2 = (s_frame_tick % 2 == 0) ? 0x94A3B8 : 0xFFFFFF;
                draw_box(layer, px, py + 25, 4, 3, wheel_col1);
                draw_box(layer, px + 13, py + 25, 4, 3, wheel_col2);
                // 极速冲刺连续喷射火花尾焰
                int spark_x = px - 6 - (s_frame_tick % 3) * 3;
                draw_box(layer, spark_x, py + 22, 4, 3, 0xF59E0B);
                draw_box(layer, spark_x - 3, py + 23, 3, 2, 0xEF4444);
                // 破空疾风线
                if (s_frame_tick % 2 == 0) {
                    draw_box(layer, px - 12, py + 8, 8, 1, 0xE0F2FE);
                    draw_box(layer, px - 16, py + 16, 10, 1, 0xE0F2FE);
                }
            }

            // 红色鸭舌帽
            draw_box(layer, px + 2, py, 12, 5, 0xEF4444);
            draw_box(layer, px + 8, py + 3, 6, 2, 0xEF4444); // 鸭舌

            // 脸部与大眼
            draw_box(layer, px + 3, py + 5, 10, 7, 0xFDBA74);
            draw_box(layer, px + 8, py + 6, 2, 3, 0x000000);

            // 肌肉上身
            draw_box(layer, px + 3, py + 12, 10, 5, 0xFDBA74);

            // 摆臂动作 (奔跑时拳头前后摆动)
            int arm_x = px + 8 + ((run_frame == 0 || run_frame == 1) ? 2 : -2);
            draw_box(layer, arm_x, py + 12, 3, 4, 0xFDBA74);

            // 碧绿草裙 / 短裤 (奔跑迎风摆动)
            int skirt_w = (run_frame % 2 == 0) ? 13 : 11;
            draw_box(layer, px + 2, py + 17, skirt_w, 4, 0x15803D);

            // 奔跑步态小脚 (4 段动态交替踢踏)
            if (s_game.player.has_skateboard) {
                // 踏上滑板双膝微屈
                draw_box(layer, px + 2, py + 19, 4, 3, 0x78350F);
                draw_box(layer, px + 10, py + 19, 4, 3, 0x78350F);
            } else if (s_game.player.on_ground) {
                if (run_frame == 0) {
                    draw_box(layer, px + 1, py + 21, 4, 3, 0x78350F); // 前跨
                    draw_box(layer, px + 9, py + 20, 4, 3, 0x5C240A); // 后蹬
                } else if (run_frame == 1) {
                    draw_box(layer, px + 4, py + 21, 4, 3, 0x78350F);
                    draw_box(layer, px + 8, py + 21, 4, 3, 0x5C240A);
                } else if (run_frame == 2) {
                    draw_box(layer, px + 9, py + 21, 4, 3, 0x78350F); // 后蹬
                    draw_box(layer, px + 1, py + 20, 4, 3, 0x5C240A); // 前跨
                } else {
                    draw_box(layer, px + 6, py + 21, 4, 3, 0x78350F);
                    draw_box(layer, px + 3, py + 21, 4, 3, 0x5C240A);
                }
            } else {
                // 空中跳跃腾空姿势
                draw_box(layer, px + 1, py + 20, 4, 4, 0x78350F);
                draw_box(layer, px + 8, py + 19, 4, 4, 0x78350F);
            }
        }
    }
}

// 游戏逻辑定时器 (30ms 刷新循环)
static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    if (!s_paused) {
        // 1. 物理步进
        adventure_logic_update(&s_game, 30);

        // 2. 敌人生成逻辑 (每 1.8 秒刷新一只敌人)
        s_spawn_enemy_timer += 30;
        if (s_spawn_enemy_timer >= 1800) {
            s_spawn_enemy_timer = 0;
            int r = rand() % 100;
            if (r < 40) {
                adventure_logic_spawn_enemy(&s_game, ADV_ENEMY_SNAIL, SCREEN_W + 10, ADVENTURE_GROUND_Y - 14);
            } else if (r < 75) {
                adventure_logic_spawn_enemy(&s_game, ADV_ENEMY_FROG, SCREEN_W + 10, ADVENTURE_GROUND_Y - 18);
            } else {
                adventure_logic_spawn_enemy(&s_game, ADV_ENEMY_BIRD, SCREEN_W + 10, 120 + (rand() % 40));
            }
        }

        // 3. 高频水果与道具盛宴生成逻辑 (每 1.2 秒密集刷新各种水果与神装)
        s_spawn_item_timer += 30;
        if (s_spawn_item_timer >= 1200) {
            s_spawn_item_timer = 0;
            int r = rand() % 100;
            if (r < 20) {
                // 🍌 香蕉
                adventure_logic_spawn_item(&s_game, ADV_ITEM_BANANA, SCREEN_W + 10, ADVENTURE_GROUND_Y - 16);
            } else if (r < 35) {
                // 🍎 苹果
                adventure_logic_spawn_item(&s_game, ADV_ITEM_APPLE, SCREEN_W + 10, ADVENTURE_GROUND_Y - 16);
            } else if (r < 50) {
                // 🍓 草莓
                adventure_logic_spawn_item(&s_game, ADV_ITEM_STRAWBERRY, SCREEN_W + 10, ADVENTURE_GROUND_Y - 16);
            } else if (r < 65) {
                // 🍉 西瓜
                adventure_logic_spawn_item(&s_game, ADV_ITEM_WATERMELON, SCREEN_W + 10, ADVENTURE_GROUND_Y - 16);
            } else if (r < 78) {
                // 🍍 菠萝
                adventure_logic_spawn_item(&s_game, ADV_ITEM_PINEAPPLE, SCREEN_W + 10, ADVENTURE_GROUND_Y - 18);
            } else if (r < 88) {
                // 🍇 葡萄
                adventure_logic_spawn_item(&s_game, ADV_ITEM_GRAPE, SCREEN_W + 10, ADVENTURE_GROUND_Y - 16);
            } else if (r < 93) {
                // 🪓/🗡️/🌙 武器徽章随机升级
                int wr = rand() % 3;
                adventure_item_type_t wt = (wr == 0) ? ADV_ITEM_BADGE_K : (wr == 1) ? ADV_ITEM_BADGE_P : ADV_ITEM_BADGE_A;
                adventure_logic_spawn_item(&s_game, wt, SCREEN_W + 10, ADVENTURE_GROUND_Y - 18);
            } else if (r < 97) {
                // 🥛 牛奶瓶
                adventure_logic_spawn_item(&s_game, ADV_ITEM_MILK, SCREEN_W + 10, ADVENTURE_GROUND_Y - 18);
            } else {
                // 🥚 金光恐龙蛋 或 🛹 滑板
                if ((rand() % 2) == 0) {
                    adventure_logic_spawn_item(&s_game, ADV_ITEM_EGG, SCREEN_W + 10, ADVENTURE_GROUND_Y - 20);
                } else {
                    adventure_logic_spawn_item(&s_game, ADV_ITEM_SKATEBOARD, SCREEN_W + 10, ADVENTURE_GROUND_Y - 14);
                }
            }
        }

        // 4. 事件音频响应
        if (s_game.events.jump)             send_adv_sound(ADV_SND_JUMP);
        if (s_game.events.throw_weapon)     send_adv_sound(ADV_SND_THROW);
        if (s_game.events.enemy_killed)     send_adv_sound(ADV_SND_KILL);
        if (s_game.events.pickup_fruit)     send_adv_sound(ADV_SND_FRUIT);
        if (s_game.events.weapon_upgraded)  send_adv_sound(ADV_SND_POWER);
        if (s_game.events.milk_full)        send_adv_sound(ADV_SND_POWER);
        if (s_game.events.extra_life)       send_adv_sound(ADV_SND_EGG);
        if (s_game.events.skateboard_start) send_adv_sound(ADV_SND_SKATE);
        if (s_game.events.player_hurt)      send_adv_sound(ADV_SND_HURT);
        if (s_game.events.game_over)        send_adv_sound(ADV_SND_GAMEOVER);

        // 5. 按键持续长按平滑移动
        if (s_game.player.is_alive) {
            int mv = bsp_button_read_mv();
            if (mv >= 0 && mv < 150) { // UP 键按住
                s_up_hold_ticks++;
                if (s_up_hold_ticks > 4) {
                    adventure_logic_move_left(&s_game);
                }
            } else {
                s_up_hold_ticks = 0;
            }

            if (mv >= 150 && mv < 447) { // DOWN 键按住
                s_down_hold_ticks++;
                if (s_down_hold_ticks > 4) {
                    adventure_logic_move_right(&s_game);
                }
            } else {
                s_down_hold_ticks = 0;
            }
        }
    }

    // 6. 更新 HUD (保持置顶与清晰边距，保证永不出界遮挡)
    if (s_hud_score) {
        char buf[32];
        if (s_game.player.combo > 1) {
            snprintf(buf, sizeof(buf), "x%d %d", s_game.player.combo, s_game.player.score);
        } else {
            snprintf(buf, sizeof(buf), "SC:%d", s_game.player.score);
        }
        lv_label_set_text(s_hud_score, buf);
        lv_obj_set_style_text_color(s_hud_score,
            s_game.player.combo > 1 ? lv_color_hex(0x00E5FF) : lv_color_hex(0xFFD700), 0);
    }

    if (s_hud_weapon) {
        const char *w_str = (s_game.player.weapon == ADV_WEAPON_MOON_BLADE) ? "[P-MOON]" :
                            (s_game.player.weapon == ADV_WEAPON_KNIFE)      ? "[K-KNIFE]" : "[A-AXE]";
        lv_label_set_text(s_hud_weapon, w_str);
        lv_obj_set_style_text_color(s_hud_weapon,
            (s_game.player.weapon == ADV_WEAPON_MOON_BLADE) ? lv_color_hex(0xE879F9) :
            (s_game.player.weapon == ADV_WEAPON_KNIFE)      ? lv_color_hex(0x38BDF8) : lv_color_hex(0xFFFFFF), 0);
    }

    if (s_hud_lives) {
        char buf[32];
        int lv = s_game.player.lives;
        if (lv <= 0) snprintf(buf, sizeof(buf), "HP:0");
        else if (lv == 1) snprintf(buf, sizeof(buf), "HP:*");
        else if (lv == 2) snprintf(buf, sizeof(buf), "HP:**");
        else snprintf(buf, sizeof(buf), "HP:***");
        lv_label_set_text(s_hud_lives, buf);
    }

    if (s_hud_stamina) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%d%%", (int)s_game.player.stamina);
        lv_label_set_text(s_hud_stamina, buf);
        lv_obj_set_style_text_color(s_hud_stamina,
            s_game.player.stamina > 30.0f ? lv_color_hex(0x22C55E) : lv_color_hex(0xEF4444), 0);
    }

    // 确保文字层始终处于顶层
    if (s_hud_score) lv_obj_move_foreground(s_hud_score);
    if (s_hud_weapon) lv_obj_move_foreground(s_hud_weapon);
    if (s_hud_lives) lv_obj_move_foreground(s_hud_lives);
    if (s_hud_stamina) lv_obj_move_foreground(s_hud_stamina);

    // 7. 游戏结束弹窗
    if (s_game.game_over && !s_gameover_box) {
        s_gameover_box = lv_obj_create(s_scr);
        lv_obj_set_size(s_gameover_box, 200, 84);
        lv_obj_center(s_gameover_box);
        lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x0A0505), 0);
        lv_obj_set_style_bg_opa(s_gameover_box, LV_OPA_90, 0);
        lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xEF4444), 0);
        lv_obj_set_style_border_width(s_gameover_box, 2, 0);
        lv_obj_clear_flag(s_gameover_box, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *lbl = lv_label_create(s_gameover_box);
        lv_label_set_text(lbl, "ISLAND RUN OVER!\nPress OK to Restart");
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFFD700), 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
        lv_obj_move_foreground(s_gameover_box);
    } else if (!s_game.game_over && s_gameover_box) {
        lv_obj_delete(s_gameover_box);
        s_gameover_box = NULL;
    }

    lv_obj_invalidate(s_playfield);
}

// 演示页进入
void demo_adventure_enter(void)
{
    ESP_LOGI(TAG, "启动《像素冒险岛 HD》豪华典藏版");
    adventure_logic_init(&s_game);
    s_paused = false;

    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(16, sizeof(adv_snd_t));
        xTaskCreate(adv_audio_task, "adv_audio", 4096, NULL, 5, &s_snd_task);
    }

    s_scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x060A14), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(s_playfield, playfield_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 顶部 HUD 独立标签 (直接挂在 s_scr 最顶层，彻底杜绝任何画面遮盖)
    s_hud_score = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_score, 6, 4);
    lv_label_set_text(s_hud_score, "SC:0");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xFFD700), 0);

    s_hud_weapon = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_weapon, 82, 4);
    lv_label_set_text(s_hud_weapon, "[A-AXE]");
    lv_obj_set_style_text_font(s_hud_weapon, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_weapon, lv_color_hex(0xFFFFFF), 0);

    s_hud_lives = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_lives, 150, 4);
    lv_label_set_text(s_hud_lives, "HP:***");
    lv_obj_set_style_text_font(s_hud_lives, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_lives, lv_color_hex(0xFF4466), 0);

    s_hud_stamina = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_stamina, 202, 4);
    lv_label_set_text(s_hud_stamina, "100%");
    lv_obj_set_style_text_font(s_hud_stamina, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_stamina, lv_color_hex(0x22C55E), 0);

    // 底部操作栏提示
    s_hud_hints = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_hints, 0, 303);
    lv_obj_set_size(s_hud_hints, 240, 16);
    lv_obj_set_style_text_align(s_hud_hints, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_hud_hints, "UP:BACK  DN:RUN  OK:JUMP/THROW");
    lv_obj_set_style_text_font(s_hud_hints, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hints, lv_color_hex(0xFFD700), 0);

    // 暂停半透明弹窗
    s_pause_box = lv_obj_create(s_scr);
    lv_obj_set_size(s_pause_box, 180, 110);
    lv_obj_center(s_pause_box);
    lv_obj_set_style_bg_color(s_pause_box, lv_color_hex(0x0A1020), 0);
    lv_obj_set_style_bg_opa(s_pause_box, LV_OPA_90, 0);
    lv_obj_set_style_border_color(s_pause_box, lv_color_hex(0x00E5FF), 0);
    lv_obj_set_style_border_width(s_pause_box, 2, 0);
    lv_obj_set_style_pad_all(s_pause_box, 8, 0);
    lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *pt = lv_label_create(s_pause_box);
    lv_label_set_text(pt, "-- PAUSED --");
    lv_obj_set_style_text_font(pt, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(pt, lv_color_hex(0xFFD700), 0);
    lv_obj_align(pt, LV_ALIGN_TOP_MID, 0, 2);

    s_pause_vol_label = lv_label_create(s_pause_box);
    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
    lv_obj_set_style_text_font(s_pause_vol_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_pause_vol_label, lv_color_hex(0x00E5FF), 0);
    lv_obj_align(s_pause_vol_label, LV_ALIGN_CENTER, 0, -4);

    lv_obj_t *ph = lv_label_create(s_pause_box);
    lv_label_set_text(ph, "UP/DN: VOL\nOK: RESUME");
    lv_obj_set_style_text_font(ph, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(ph, lv_color_hex(0x94A3B8), 0);
    lv_obj_set_style_text_align(ph, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(ph, LV_ALIGN_BOTTOM_MID, 0, 0);

    s_gameover_box = NULL;
    lv_screen_load(s_scr);

    s_game_timer = lv_timer_create(game_timer_cb, 30, NULL);
}

// 演示页退出
void demo_adventure_exit(void)
{
    ESP_LOGI(TAG, "退出《像素冒险岛 HD》");
    if (s_game_timer) {
        lv_timer_delete(s_game_timer);
        s_game_timer = NULL;
    }
    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
        s_hud_score = NULL;
        s_hud_lives = NULL;
        s_hud_weapon = NULL;
        s_hud_stamina = NULL;
        s_hud_hints = NULL;
        s_pause_box = NULL;
        s_pause_vol_label = NULL;
        s_gameover_box = NULL;
    }
    if (s_snd_queue) {
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    if (s_snd_task) {
        vTaskDelete(s_snd_task);
        s_snd_task = NULL;
    }
}

// 硬件按键分发
void demo_adventure_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 游戏结束状态：按 OK 重生重开
    if (s_game.game_over) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            adventure_logic_restart(&s_game);
            if (s_gameover_box) {
                lv_obj_delete(s_gameover_box);
                s_gameover_box = NULL;
            }
        }
        return;
    }

    // 暂停状态
    if (s_paused) {
        if (btn == BSP_BTN_UP && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume <= 90) s_volume += 10; else s_volume = 100;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
        } else if (btn == BSP_BTN_DOWN && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume >= 10) s_volume -= 10; else s_volume = 0;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
        } else if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            s_paused = false;
            if (s_pause_box) {
                lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
        }
        return;
    }

    // 正常游玩输入
    if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK) {
            adventure_logic_action(&s_game, ADV_ACTION_OK);
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS) {
            adventure_logic_move_left(&s_game);
        } else if (ev == BSP_BTN_DOUBLE) {
            s_paused = true;
            if (s_pause_box) {
                if (s_pause_vol_label) {
                    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
                }
                lv_obj_remove_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
        }
    } else if (btn == BSP_BTN_DOWN) {
        if (ev == BSP_BTN_PRESS) {
            adventure_logic_move_right(&s_game);
        }
    }
}
