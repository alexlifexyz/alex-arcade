// main/demo_cyber_runner.c —— 《霓虹疾行：影刃闪现》(Cyber Courier: Phantom Dash) 掌机固件驱动
// 极致流畅 40 FPS，零卡顿合批矢量图元与视差天际线，超轻量三键机动连招，16kHz 赛博合成器音效。
#include "demo.h"
#include "cyber_runner_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_cyber_runner";

#define SCREEN_W 240
#define SCREEN_H 320

static cr_game_t    s_game;
static lv_obj_t    *s_scr = NULL;
static lv_obj_t    *s_playfield = NULL;
static lv_obj_t    *s_hud_score = NULL;
static lv_obj_t    *s_hud_hp = NULL;
static lv_obj_t    *s_hud_blink = NULL;
static lv_obj_t    *s_hud_combo = NULL;
static lv_obj_t    *s_gameover_box = NULL;
static lv_timer_t  *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint8_t       s_volume = 85;

static void send_sound(cr_sound_t snd)
{
    if (s_snd_queue && snd != CR_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 快速后台音效合成任务 (16kHz 16-bit 赛博合成器音效，清脆低延迟)
static void cyber_runner_audio_task(void *arg)
{
    (void)arg;
    cr_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(40)) == pdTRUE) {
            if (snd == CR_SND_NONE) continue;

            if (snd == CR_SND_JUMP) {
                // 离子起跳 (350Hz -> 850Hz 快速升频方波, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 350.0f + t * 500.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_AIR_BOOST) {
                // 二段喷气腾空 (双频调制短脉冲, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 600.0f + t * 400.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 1600) - 800;
                    float amp = (1.0f - t) * 6500.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_BLINK) {
                // 幽灵闪现电子虚化滑音 (1300Hz -> 300Hz 强混响方波, 38ms)
                const int total = 600;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 1300.0f - t * 1000.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.7f) * 7000.0f;
                    buf[i % 256] = (phase < 0.4f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_SLIDE) {
                // 贴地滑铲摩擦 (高频白噪切削, 30ms)
                const int total = 480;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 5000) - 2500;
                    buf[i % 256] = (int16_t)(noise * (1.0f - t));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_WALL_KICK) {
                // 蹬墙反弹跳金属铮鸣 (450Hz -> 900Hz 快速升频, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 450.0f + t * 450.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_SLASH_HIT) {
                // 影刃斩爆目标 (爽脆金属切削+双频炸裂, 40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 1200.0f - t * 800.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 4000) - 2000;
                    float amp = (1.0f - t * 0.8f) * 8500.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.4f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_DIVE_SLAM) {
                // 俯冲砸地震地轰鸣 (低频低通爆震, 45ms)
                const int total = 720;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 180.0f - t * 100.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 4500) - 2250;
                    float amp = (1.0f - t) * 8000.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_DRONE_POP) {
                // 闪现穿爆无人机炸裂音 (高低频爆裂, 35ms)
                const int total = 560;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 300.0f - t * 200.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 3600) - 1800;
                    float amp = (1.0f - t) * 8000.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_VENT_BOOST) {
                // 排风口暴风喷射音 (低沉上升风鸣, 40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 180.0f + t * 450.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 2400) - 1200;
                    float amp = (1.0f - t) * 6500.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_GEM) {
                // 拾取数据晶体双音和弦 (880Hz + 1320Hz, 30ms)
                const int total = 480;
                float p1 = 0.0f, p2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    p1 += 880.0f / 16000.0f; if (p1 >= 1.0f) p1 -= 1.0f;
                    p2 += 1320.0f / 16000.0f; if (p2 >= 1.0f) p2 -= 1.0f;
                    float amp = (1.0f - t) * 4000.0f;
                    int16_t s1 = (p1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (p2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_HURT) {
                // 受创警报音 (160Hz 尖锐锯齿音, 35ms)
                const int total = 560;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    phase += 160.0f / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (int16_t)((phase * 2.0f - 1.0f) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CR_SND_GAMEOVER) {
                // 坠落停机 (下行滑音 600Hz -> 80Hz, 80ms)
                const int total = 1280;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 600.0f - t * 520.0f;
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

// 快速绘制填充矩形
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

// 高性能合批渲染回调 (LV_EVENT_DRAW_MAIN)
static void on_draw_playfield(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);

    // 1. 极简暗夜深空背景 (纯粹、深邃、完全退居幕后，绝不争抢视觉焦点)
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x0A0712);

    // 2. 远景极暗大厦剪影 (极简深暗轮廓，仅提供微弱视差纵深，无任何刺眼发光点)
    int far_off = (int)s_game.bg_far_scroll_px;
    for (int bx = -60; bx < SCREEN_W + 60; bx += 64) {
        int sx = bx - (far_off % 64);
        int bw = 38;
        int bh = 160;
        int by = 80;
        draw_box(layer, sx, by, bw, bh, 0x0E0B18);
        draw_box(layer, sx + 2, by - 8, 2, 8, 0x0E0B18);
    }

    // 3. 中景暗调大厦 (低对比深暗剪影)
    int mid_off = (int)s_game.bg_mid_scroll_px;
    for (int bx = -80; bx < SCREEN_W + 80; bx += 88) {
        int sx = bx - (mid_off % 88);
        draw_box(layer, sx, 130, 48, 140, 0x0C0916);
    }

    // 4. 前景建筑屋顶平台 (沉稳纯净深黑平台 + 极简清晰的平台边缘)
    for (int i = 0; i < CR_MAX_BUILDINGS; i++) {
        cr_building_t *b = &s_game.buildings[i];
        if (!b->active) continue;

        int bx = (int)b->x;
        int by = (int)b->y;
        int bw = (int)b->w;
        int bh = (int)b->h;

        if (bx + bw < 0 || bx >= SCREEN_W) continue;

        if (b->is_glass && b->crumbled) {
            draw_box(layer, bx, by + 4, bw, bh - 4, 0x06040A);
            continue;
        }

        // 大楼主体 (深邃纯净暗色，完全不抢镜)
        uint32_t body_col = b->is_glass ? 0x0E0B16 : 0x120F1E;
        draw_box(layer, bx, by + 2, bw, bh - 2, body_col);

        // 屋顶平台边缘 (清晰功能性边缘，一眼看清落点即可，不晃眼)
        if (b->is_glass) {
            uint32_t glass_edge = (b->crumble_timer_ms > 0) ? 0xEF4444 : 0xDB2777;
            draw_box(layer, bx, by, bw, 2, glass_edge);
        } else {
            // 经典屋顶：1px 细白高光线 + 1px 青色边缘线，功能明确、干净利落
            draw_box(layer, bx, by, bw, 1, 0xE2E8F0);
            draw_box(layer, bx, by + 1, bw, 1, 0x0891B2);
        }
    }

    // 6. 俯冲震荡波渲染 (Shockwave on Ground)
    if (s_game.shockwave_active && s_game.shockwave_timer_ms > 0) {
        int swx = (int)s_game.shockwave_x;
        int swy = (int)s_game.shockwave_y;
        int swr = (int)s_game.shockwave_radius;
        draw_box(layer, swx - swr, swy - 3, swr * 2, 5, 0x00FFFF);
        draw_box(layer, swx - swr + 2, swy - 2, (swr - 2) * 2, 3, 0xFFFFFF);
    }

    // 7. 陷阱与机关渲染
    for (int i = 0; i < CR_MAX_HAZARDS; i++) {
        cr_hazard_t *h = &s_game.hazards[i];
        if (!h->active) continue;

        int hx = (int)h->x;
        int hy = (int)h->y;
        int hw = (int)h->w;
        int hh = (int)h->h;

        if (hx + hw < 0 || hx >= SCREEN_W) continue;

        if (h->type == CR_HAZARD_LASER_LOW || h->type == CR_HAZARD_LASER_HIGH) {
            // 脉冲激光束 (白色高能芯 + 艳红外焰 + 左右金属发射极)
            draw_box(layer, hx, hy + 1, hw, 4, 0xFF0055);
            draw_box(layer, hx, hy + 2, hw, 2, 0xFFFFFF);
            draw_box(layer, hx - 2, hy, 3, hh, 0x64748B);
            draw_box(layer, hx + hw - 1, hy, 3, hh, 0x64748B);
        } else if (h->type == CR_HAZARD_LASER_WALL) {
            // 全高阻断激光墙 (纯白能量芯 + 烈红高光)
            draw_box(layer, hx, hy, hw, hh, 0xBE123C);
            draw_box(layer, hx + 1, hy, hw - 2, hh, 0xFF0055);
            draw_box(layer, hx + 2, hy, 2, hh, 0xFFFFFF);
            // 上下发射极
            draw_box(layer, hx - 2, hy, hw + 4, 4, 0x020617);
            draw_box(layer, hx - 2, hy + hh - 4, hw + 4, 4, 0x020617);
        } else if (h->type == CR_HAZARD_DRONE) {
            // 浮游侦察无人机 (亮黄警示机壳 + 闪烁红眼 + 旋转青翼)
            draw_box(layer, hx, hy, hw, hh, 0x020617); // 黑色外框
            draw_box(layer, hx + 2, hy + 2, hw - 4, hh - 4, 0xFACC15);
            // 闪烁红色侦测眼
            draw_box(layer, hx + hw/2 - 2, hy + hh/2 - 2, 4, 4, 0xFF0000);
            draw_box(layer, hx + hw/2 - 1, hy + hh/2 - 1, 2, 2, 0xFFFFFF);
            // 两侧发光旋翼
            draw_box(layer, hx - 3, hy + 1, 4, 2, 0x00FFFF);
            draw_box(layer, hx + hw - 1, hy + 1, 4, 2, 0x00FFFF);

            // ★ 影刃锁定指示框 (进入 75px 斩杀范围高亮菱形标记)
            if (hx >= CR_PLAYER_X - 10 && hx <= CR_PLAYER_X + 75) {
                draw_box(layer, hx - 2, hy - 2, hw + 4, 1, 0x00FFFF);
                draw_box(layer, hx - 2, hy + hh + 1, hw + 4, 1, 0x00FFFF);
                draw_box(layer, hx - 2, hy - 2, 1, hh + 4, 0x00FFFF);
                draw_box(layer, hx + hw + 1, hy - 2, 1, hh + 4, 0x00FFFF);
            }
        } else if (h->type == CR_HAZARD_VENT) {
            // 超导排风口
            draw_box(layer, hx, hy, hw, hh, 0x334155);
            draw_box(layer, hx + 2, hy + 1, hw - 4, hh - 2, 0x00FFFF);
            // 向上喷气气流
            if (s_game.tick_count % 2 == 0) {
                draw_box(layer, hx + 5, hy - 10, 2, 10, 0xFFFFFF);
                draw_box(layer, hx + hw - 7, hy - 14, 2, 14, 0x67E8F9);
            }
        }
    }

    // 8. 收集道具渲染
    for (int i = 0; i < CR_MAX_ITEMS; i++) {
        cr_item_t *it = &s_game.items[i];
        if (!it->active) continue;

        int ix = (int)it->x;
        int iy = (int)(it->y + sinf(it->bob_phase) * 3.0f);
        if (ix < -10 || ix > SCREEN_W + 10) continue;

        if (it->type == CR_ITEM_DATA_GEM) {
            // 菱形数据晶体 (璀璨电光青 + 白核心)
            draw_box(layer, ix - 3, iy - 4, 6, 8, 0x00FFFF);
            draw_box(layer, ix - 1, iy - 2, 2, 4, 0xFFFFFF);
        } else if (it->type == CR_ITEM_BATTERY) {
            // 能量电池 (翡翠绿 + 荧光充能条)
            draw_box(layer, ix - 4, iy - 4, 8, 8, 0x10B981);
            draw_box(layer, ix - 2, iy - 2, 4, 4, 0x6EE7B7);
        } else if (it->type == CR_ITEM_SHIELD) {
            // 磁暴护盾球
            draw_box(layer, ix - 5, iy - 5, 10, 10, 0x00FFFF);
            draw_box(layer, ix - 3, iy - 3, 6, 6, 0xFFFFFF);
        }
    }

    // 9. 月牙光刃 / 飞刀投射物渲染 (Crescent Moon Blade)
    for (int i = 0; i < CR_MAX_PROJECTILES; i++) {
        cr_projectile_t *p = &s_game.projectiles[i];
        if (!p->active) continue;

        int cx = (int)p->x;
        int cy = (int)p->y;
        if (cx < -10 || cx > SCREEN_W + 10) continue;

        // 旋转相位 (0 ~ 7)
        int phase = ((int)p->rot_deg / 45) % 8;

        // 颜色定义：月光金 + 纯白锋刃 + 电光青晕
        const uint32_t COL_BLADE_GOLD = 0xFACC15;
        const uint32_t COL_BLADE_WHT  = 0xFFFFFF;
        const uint32_t COL_BLADE_CYAN = 0x38BDF8;

        // 旋转弦月像素画法 (外凸内凹弦月弧刃)
        if (phase == 0 || phase == 4) {
            // 水平向右弧刃 (开角向左)
            draw_box(layer, cx - 2, cy - 6, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx,     cy - 5, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx + 2, cy - 3, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx + 3, cy - 1, 3, 3, COL_BLADE_WHT);
            draw_box(layer, cx + 2, cy + 2, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx,     cy + 4, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx - 2, cy + 5, 2, 2, COL_BLADE_CYAN);
            // 内弧与光芒
            draw_box(layer, cx + 1, cy - 2, 2, 5, COL_BLADE_WHT);
        } else if (phase == 2 || phase == 6) {
            // 垂直向上弧刃
            draw_box(layer, cx - 6, cy - 2, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx - 5, cy,     2, 3, COL_BLADE_GOLD);
            draw_box(layer, cx - 3, cy + 2, 2, 3, COL_BLADE_GOLD);
            draw_box(layer, cx - 1, cy + 3, 3, 3, COL_BLADE_WHT);
            draw_box(layer, cx + 2, cy + 2, 2, 3, COL_BLADE_GOLD);
            draw_box(layer, cx + 4, cy,     2, 3, COL_BLADE_GOLD);
            draw_box(layer, cx + 5, cy - 2, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx - 2, cy + 1, 5, 2, COL_BLADE_WHT);
        } else if (phase == 1 || phase == 5) {
            // 斜上 45 度飞旋
            draw_box(layer, cx - 4, cy - 5, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx - 2, cy - 4, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx + 1, cy - 2, 3, 3, COL_BLADE_GOLD);
            draw_box(layer, cx + 3, cy + 1, 3, 3, COL_BLADE_WHT);
            draw_box(layer, cx + 2, cy + 4, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx,     cy - 1, 3, 3, COL_BLADE_WHT);
        } else {
            // 斜下 45 度飞旋
            draw_box(layer, cx + 4, cy - 5, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx + 1, cy - 3, 3, 3, COL_BLADE_GOLD);
            draw_box(layer, cx - 1, cy,     3, 3, COL_BLADE_WHT);
            draw_box(layer, cx - 3, cy + 2, 3, 2, COL_BLADE_GOLD);
            draw_box(layer, cx - 5, cy + 4, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx - 1, cy - 1, 3, 3, COL_BLADE_WHT);
        }

        // 月牙后方流光微粒
        if (s_game.tick_count % 2 == 0) {
            draw_box(layer, cx - 6, cy - 1, 2, 2, COL_BLADE_CYAN);
            draw_box(layer, cx - 10, cy, 1, 1, COL_BLADE_GOLD);
        }
    }

    // 10. 极速冲刺/闪现破空流光线 (Aero Speed Streaks) —— 彻底消除纯黄色大方块，呈现流线型音爆光轨！
    for (int i = 0; i < CR_MAX_AFTERIMAGES; i++) {
        cr_afterimage_t *img = &s_game.afterimages[i];
        if (img->alpha > 0.15f) {
            int ax = (int)img->x;
            int ay = (int)img->y - CR_PLAYER_H;
            // 绘制 3 条极细高光的金色/青蓝破空速度线，轻盈通透
            draw_box(layer, ax - 12, ay + 14, 18, 1, 0xFACC15);
            draw_box(layer, ax - 6,  ay + 24, 22, 1, 0xFFFFFF);
            draw_box(layer, ax - 16, ay + 34, 16, 1, 0x38BDF8);
        }
    }

    // 11. 玩家主角 —— 【阿童木 / 超级飞人】(Astro Boy Super Flyer)
    // 经典前后翘尖角大发型 + 阳光清澈大眼睛(带纯白大高光球) + 健美身躯 + 经典大红短裤 + 翠绿腰带黄金扣 + 高筒大红火箭靴与强力喷火长焰！
    bool blink_hide = (s_game.invuln_timer_ms > 0 && (s_game.tick_count % 3 == 0));
    if (!blink_hide) {
        int px = (int)((float)CR_PLAYER_X + s_game.render_x_offset);
        int ph = (s_game.stance == CR_STANCE_SLIDE) ? CR_SLIDE_H : CR_PLAYER_H;
        int py = (int)(s_game.y - (float)ph);

        // 阿童木经典纯正配色
        const uint32_t COL_HAIR_DARK   = 0x0F172A; // 乌黑发色
        const uint32_t COL_HAIR_LIGHT  = 0x334155; // 发顶发丝高光
        const uint32_t COL_SKIN_BASE   = 0xFED7AA; // 阳光少年肤色
        const uint32_t COL_SKIN_SHADOW = 0xFDBA74; // 面部/下颌修容阴影
        const uint32_t COL_EYE_PUPIL   = 0x000000; // 英雄大眼球/黑眼眶
        const uint32_t COL_EYE_GLEAM   = 0xFFFFFF; // 晶莹大高光圆点
        const uint32_t COL_BELT_GRN    = 0x10B981; // 翡翠绿腰带
        const uint32_t COL_BELT_GOLD   = 0xFACC15; // 纯金腰带方扣
        const uint32_t COL_SHORTS_RED  = 0xEF4444; // 经典纯正大红短裤
        const uint32_t COL_BOOT_RED    = 0xDC2626; // 经典正红火箭靴
        const uint32_t COL_BOOT_TOP    = 0xFFFFFF; // 火箭靴白折边
        const uint32_t COL_BOOT_NOZZLE = 0x475569; // 靴底坚固金属喷气口
        const uint32_t COL_FLAME_CORE  = 0xFFFFFF; // 尾焰纯白热核
        const uint32_t COL_FLAME_MID   = 0xFACC15; // 尾焰金黄主束
        const uint32_t COL_FLAME_OUT   = 0xF97316; // 尾焰炽橙外焰

        if (s_game.stance == CR_STANCE_SLIDE) {
            // ==========================================
            // 1) 地面贴地极速滑铲 (超低姿态飞驰，身后火箭靴强力喷火推进)
            // ==========================================
            // 头部前探与双尖发型
            draw_box(layer, px + 22, py + 1, 4, 3, COL_HAIR_DARK); // 前额翘角
            draw_box(layer, px + 14, py + 1, 9, 10, COL_HAIR_DARK); // 脑后黑发
            draw_box(layer, px + 17, py + 4, 8, 8, COL_SKIN_BASE);  // 脸庞
            draw_box(layer, px + 20, py + 5, 4, 5, COL_EYE_PUPIL);  // 大眼睛
            draw_box(layer, px + 21, py + 5, 2, 2, COL_EYE_GLEAM);  // 晶莹高光点

            // 水平流线身躯与绿腰带、红短裤
            draw_box(layer, px + 8, py + 6, 9, 8, COL_SKIN_BASE);
            draw_box(layer, px + 5, py + 6, 3, 8, COL_BELT_GRN);
            draw_box(layer, px + 6, py + 8, 2, 4, COL_BELT_GOLD);
            draw_box(layer, px + 1, py + 6, 4, 8, COL_SHORTS_RED);

            // 笔直后伸的大红火箭靴
            draw_box(layer, px - 6, py + 7, 7, 6, COL_BOOT_RED);
            draw_box(layer, px - 8, py + 7, 2, 6, COL_BOOT_NOZZLE);

            // 火箭靴向后水平强力喷火长焰 (14px)
            draw_box(layer, px - 18, py + 8, 10, 4, COL_FLAME_OUT);
            draw_box(layer, px - 14, py + 8, 6, 3, COL_FLAME_MID);
            draw_box(layer, px - 11, py + 9, 3, 2, COL_FLAME_CORE);
            draw_box(layer, px + 6,  py + 18, 8, 2, 0xFFFFFF); // 地面火花
        } else if (s_game.stance == CR_STANCE_WALL_SLIDE) {
            // ==========================================
            // 2) 贴墙下滑姿态 (单手撑墙，外侧脚喷火缓冲)
            // ==========================================
            // 经典阿童木发型
            draw_box(layer, px + 3,  py - 3, 5, 4, COL_HAIR_DARK); // 脑后后翘大尖角
            draw_box(layer, px + 14, py - 1, 4, 3, COL_HAIR_DARK); // 前额小尖角
            draw_box(layer, px + 5,  py + 1, 12, 10, COL_HAIR_DARK);
            draw_box(layer, px + 8,  py + 4, 9, 8, COL_SKIN_BASE);
            draw_box(layer, px + 12, py + 5, 4, 5, COL_EYE_PUPIL);
            draw_box(layer, px + 13, py + 5, 2, 2, COL_EYE_GLEAM);

            // 身躯与服饰
            draw_box(layer, px + 5, py + 14, 11, 8, COL_SKIN_BASE);
            draw_box(layer, px + 5, py + 22, 11, 3, COL_BELT_GRN);
            draw_box(layer, px + 9, py + 22, 3, 3, COL_BELT_GOLD);
            draw_box(layer, px + 5, py + 25, 11, 6, COL_SHORTS_RED);

            // 撑墙手臂
            draw_box(layer, px + 16, py + 15, 6, 4, COL_SKIN_BASE);

            // 大红火箭靴
            draw_box(layer, px + 6, py + 31, 8, 8, COL_BOOT_RED);
            draw_box(layer, px + 6, py + 39, 8, 2, COL_BOOT_NOZZLE);

            // 贴墙剧烈摩擦火花
            int spk_x = px + CR_PLAYER_W - 1;
            draw_box(layer, spk_x, py + 18, 3, 3, 0xFFFFFF);
            draw_box(layer, spk_x, py + 26, 3, 5, 0xFACC15);
            // 靴底缓冲火花
            draw_box(layer, px + 8, py + 41, 5, 3, COL_FLAME_MID);
        } else if (s_game.stance == CR_STANCE_RUN) {
            // ==========================================
            // 3) 楼顶极速疾跑 (饱满生动的 2.5 头身阿童木形象)
            // ==========================================
            int run_frame = (s_game.tick_count / 3) % 4;

            // ★★★ 头部与经典阿童木发型 (饱满立体，绝非单像素) ★★★
            // 1. 脑后冲天耸立大后角 (阿童木第一剪影特征)
            draw_box(layer, px + 2, py - 4, 4, 4, COL_HAIR_DARK);
            draw_box(layer, px + 4, py - 1, 6, 4, COL_HAIR_DARK);
            draw_box(layer, px + 5, py + 1, 4, 3, COL_HAIR_LIGHT); // 尖角发丝高光
            // 2. 前额向前挑起的小帅发角
            draw_box(layer, px + 16, py - 2, 4, 4, COL_HAIR_DARK);
            draw_box(layer, px + 18, py + 1, 3, 3, COL_HAIR_DARK);
            // 3. 乌黑发冠主体与高光
            draw_box(layer, px + 5, py + 2, 14, 6, COL_HAIR_DARK);
            draw_box(layer, px + 8, py + 2, 7, 2, COL_HAIR_LIGHT);
            draw_box(layer, px + 4, py + 7, 5, 7, COL_HAIR_DARK);

            // 4. 阳光英雄面庞 (肉色大面积展现)
            draw_box(layer, px + 9,  py + 7, 12, 9, COL_SKIN_BASE);
            draw_box(layer, px + 11, py + 15, 7, 2, COL_SKIN_SHADOW);
            draw_box(layer, px + 18, py + 13, 2, 1, 0xEA580C); // 自信微笑嘴角

            // 5. 传神英雄大眼睛 (5x7 像素，纯白大高光球，清澈灵动！)
            draw_box(layer, px + 13, py + 7, 6, 7, COL_EYE_PUPIL);
            draw_box(layer, px + 14, py + 12, 4, 2, 0xF8FAFC); // 眼白
            draw_box(layer, px + 14, py + 8, 3, 3, COL_EYE_GLEAM); // 白色晶莹反光高光！
            draw_box(layer, px + 12, py + 7, 6, 1, COL_EYE_PUPIL); // 浓密上睫毛

            // ★★★ 健美少年胸腹部与手臂摆动 ★★★
            draw_box(layer, px + 7, py + 16, 12, 8, COL_SKIN_BASE);
            draw_box(layer, px + 9, py + 19, 8, 1, COL_SKIN_SHADOW);

            // 摆臂动作
            if (run_frame == 0 || run_frame == 1) {
                draw_box(layer, px + 17, py + 18, 6, 4, COL_SKIN_BASE); // 前伸摆臂
                draw_box(layer, px + 22, py + 17, 3, 4, COL_SKIN_BASE); // 握拳
                draw_box(layer, px + 2,  py + 17, 5, 4, COL_SKIN_BASE); // 后摆小臂
            } else {
                draw_box(layer, px + 18, py + 16, 5, 4, COL_SKIN_BASE);
                draw_box(layer, px + 2,  py + 18, 6, 4, COL_SKIN_BASE);
            }

            // ★★★ 标志性绿腰带与纯金方扣 ★★★
            draw_box(layer, px + 6,  py + 24, 14, 3, COL_BELT_GRN);
            draw_box(layer, px + 11, py + 23, 4, 4, COL_BELT_GOLD);
            draw_box(layer, px + 12, py + 24, 2, 2, 0xFFFFFF); // 金扣高光

            // ★★★ 经典大红战斗短裤 ★★★
            draw_box(layer, px + 6, py + 27, 14, 6, COL_SHORTS_RED);
            draw_box(layer, px + 12, py + 29, 1, 4, 0x991B1B); // 裤管分缝

            // ★★★ 经典高筒大红火箭长靴 (双腿大步交替) ★★★
            if (run_frame == 0) {
                // 前蹬后迈
                draw_box(layer, px + 13, py + 33, 8, 2, COL_BOOT_TOP);
                draw_box(layer, px + 13, py + 35, 8, 5, COL_BOOT_RED);
                draw_box(layer, px + 13, py + 40, 8, 2, COL_BOOT_NOZZLE);

                draw_box(layer, px + 2,  py + 32, 7, 2, COL_BOOT_TOP);
                draw_box(layer, px + 1,  py + 34, 7, 5, COL_BOOT_RED);
                draw_box(layer, px + 1,  py + 39, 7, 2, COL_BOOT_NOZZLE);
                draw_box(layer, px - 1,  py + 41, 3, 2, COL_FLAME_MID); // 脚跟推进微火花
            } else if (run_frame == 1 || run_frame == 3) {
                // 腾空交会
                draw_box(layer, px + 8, py + 33, 8, 2, COL_BOOT_TOP);
                draw_box(layer, px + 8, py + 35, 8, 5, COL_BOOT_RED);
                draw_box(layer, px + 8, py + 40, 8, 2, COL_BOOT_NOZZLE);
            } else {
                // 后蹬前迈 (左右反向)
                draw_box(layer, px + 2,  py + 33, 7, 2, COL_BOOT_TOP);
                draw_box(layer, px + 2,  py + 35, 7, 5, COL_BOOT_RED);
                draw_box(layer, px + 2,  py + 40, 7, 2, COL_BOOT_NOZZLE);

                draw_box(layer, px + 13, py + 32, 8, 2, COL_BOOT_TOP);
                draw_box(layer, px + 14, py + 34, 8, 5, COL_BOOT_RED);
                draw_box(layer, px + 14, py + 39, 8, 2, COL_BOOT_NOZZLE);
                draw_box(layer, px + 16, py + 41, 3, 2, COL_FLAME_MID);
            }
        } else {
            // ==========================================
            // 4) 空中飞跃 / 两段跳 / 俯冲 —— 【超级飞人冲天飞行姿态】！
            // ==========================================
            // ★ 经典前后双尖角
            draw_box(layer, px + 2,  py - 4, 4, 4, COL_HAIR_DARK); // 冲天耸立后角
            draw_box(layer, px + 4,  py - 1, 6, 4, COL_HAIR_DARK);
            draw_box(layer, px + 5,  py + 1, 4, 3, COL_HAIR_LIGHT);
            draw_box(layer, px + 16, py - 2, 4, 4, COL_HAIR_DARK); // 前额微翘角
            draw_box(layer, px + 18, py + 1, 3, 3, COL_HAIR_DARK);
            draw_box(layer, px + 5,  py + 2, 14, 6, COL_HAIR_DARK);
            draw_box(layer, px + 8,  py + 2, 7, 2, COL_HAIR_LIGHT);

            // ★ 英雄大眼睛 (英姿飒爽向前看)
            draw_box(layer, px + 9,  py + 7, 12, 9, COL_SKIN_BASE);
            draw_box(layer, px + 13, py + 7, 6, 7, COL_EYE_PUPIL);
            draw_box(layer, px + 14, py + 12, 4, 2, 0xF8FAFC);
            draw_box(layer, px + 14, py + 8, 3, 3, COL_EYE_GLEAM); // 灵动白色大高光！

            // ★★★ 超级飞人前冲飞拳！(标志性超人向前直拳飞行出拳) ★★★
            draw_box(layer, px + 19, py + 16, 7, 4, COL_SKIN_BASE); // 前伸直臂
            draw_box(layer, px + 25, py + 15, 5, 6, COL_SKIN_BASE); // 英雄握拳
            draw_box(layer, px + 26, py + 16, 2, 2, 0xFFFFFF);     // 拳峰高光

            // 健美身躯与绿腰带黄金扣
            draw_box(layer, px + 7,  py + 16, 12, 8, COL_SKIN_BASE);
            draw_box(layer, px + 6,  py + 24, 14, 3, COL_BELT_GRN);
            draw_box(layer, px + 11, py + 23, 4, 4, COL_BELT_GOLD);
            draw_box(layer, px + 12, py + 24, 2, 2, 0xFFFFFF);

            // 经典大红短裤
            draw_box(layer, px + 6, py + 27, 14, 6, COL_SHORTS_RED);
            draw_box(layer, px + 12, py + 29, 1, 4, 0x991B1B);

            // 飞行收腿姿态：双腿向后斜下方并拢，高筒红靴靴口白边分明
            draw_box(layer, px + 11, py + 33, 7, 2, COL_BOOT_TOP);
            draw_box(layer, px + 11, py + 35, 7, 6, COL_BOOT_RED);
            draw_box(layer, px + 11, py + 40, 7, 2, COL_BOOT_NOZZLE);

            draw_box(layer, px + 2,  py + 32, 7, 2, COL_BOOT_TOP);
            draw_box(layer, px + 2,  py + 34, 7, 6, COL_BOOT_RED);
            draw_box(layer, px + 2,  py + 39, 7, 2, COL_BOOT_NOZZLE);

            // ★★★ 超级飞人核心灵魂：厚实震撼的火箭靴炽热喷火尾焰！★★★
            if (s_game.stance == CR_STANCE_DOUBLE_JUMP) {
                // 两段跳 (Double Jump)：双管粗壮巨型火箭长焰 (长达 18 像素！)
                // 前靴烈焰
                draw_box(layer, px + 11, py + 42, 7, 8, COL_FLAME_OUT);
                draw_box(layer, px + 12, py + 42, 5, 14, COL_FLAME_MID);
                draw_box(layer, px + 13, py + 42, 3, 18, COL_FLAME_CORE);
                // 后靴烈焰
                draw_box(layer, px + 2,  py + 41, 7, 8, COL_FLAME_OUT);
                draw_box(layer, px + 3,  py + 41, 5, 14, COL_FLAME_MID);
                draw_box(layer, px + 4,  py + 41, 3, 18, COL_FLAME_CORE);
            } else if (s_game.stance == CR_STANCE_DIVE) {
                // 俯冲砸地：火箭靴向上全功率反冲排火
                draw_box(layer, px + 11, py + 22, 6, 9, COL_FLAME_OUT);
                draw_box(layer, px + 12, py + 20, 4, 11, COL_FLAME_MID);
                draw_box(layer, px + 13, py + 18, 2, 13, COL_FLAME_CORE);
            } else {
                // 一段跳或浮空：平稳火箭推进尾焰 (9 像素长)
                draw_box(layer, px + 12, py + 42, 5, 5, COL_FLAME_OUT);
                draw_box(layer, px + 13, py + 42, 3, 9, COL_FLAME_MID);
                draw_box(layer, px + 14, py + 42, 1, 7, COL_FLAME_CORE);

                draw_box(layer, px + 3,  py + 41, 5, 5, COL_FLAME_OUT);
                draw_box(layer, px + 4,  py + 41, 3, 9, COL_FLAME_MID);
                draw_box(layer, px + 5,  py + 41, 1, 7, COL_FLAME_CORE);
            }
        }

        // 磁暴护盾外圈
        if (s_game.has_shield) {
            draw_box(layer, px - 4, py - 6, CR_PLAYER_W + 8, 2, 0x00FFFF);
            draw_box(layer, px - 4, py + ph + 2, CR_PLAYER_W + 8, 2, 0x00FFFF);
            draw_box(layer, px - 4, py - 6, 2, ph + 10, 0x00FFFF);
            draw_box(layer, px + CR_PLAYER_W + 2, py - 6, 2, ph + 10, 0x00FFFF);
        }
    }

    // 12. 飘逸流光绯红围巾 (Vivid Fluorescent Scarf) —— 强烈视觉引导与灵动信标
    uint32_t scarf_col  = 0xFF1760; // 鲜艳荧光玫红外圈
    uint32_t scarf_core = 0xFFA8C4; // 耀眼粉白内芯
    for (int i = 0; i < CR_MAX_SCARF_NODES; i++) {
        int nx = (int)s_game.scarf[i].x;
        int ny = (int)s_game.scarf[i].y;
        int sw = (i == 0) ? 6 : (6 - i * 1);
        if (sw < 3) sw = 3;
        draw_box(layer, nx, ny - 1, sw, 4, scarf_col);
        draw_box(layer, nx + 1, ny, sw - 2, 2, scarf_core);
    }

    // 12. 粒子微粒绘制
    for (int i = 0; i < CR_MAX_PARTICLES; i++) {
        cr_particle_t *p = &s_game.particles[i];
        if (!p->active) continue;

        int px = (int)p->x;
        int py = (int)p->y;
        if (px >= 0 && px < SCREEN_W && py >= 0 && py < SCREEN_H) {
            int sz = (p->type == CR_PART_EXPLOSION) ? 3 : 2;
            draw_box(layer, px, py, sz, sz, p->color);
        }
    }
}

// 40 FPS 主游戏循环
static void on_timer(lv_timer_t *timer)
{
    (void)timer;

    // 1. 步进核心算法 (25ms = 40FPS)
    cyber_runner_step(&s_game, 25);

    // 2. 音效队列分发
    if (s_game.pending_sound != CR_SND_NONE) {
        send_sound(s_game.pending_sound);
        s_game.pending_sound = CR_SND_NONE;
    }

    // 3. 刷新 HUD 显示
    if (s_hud_score) {
        lv_label_set_text_fmt(s_hud_score, "%ldm  %ld", (long)s_game.distance_m, (long)s_game.score);
    }

    if (s_hud_hp) {
        char hp_buf[32] = {0};
        int pos = 0;
        for (int i = 0; i < s_game.max_hp; i++) {
            pos += snprintf(hp_buf + pos, sizeof(hp_buf) - pos, "%s",
                            (i < s_game.hp) ? "♥" : "♡");
        }
        if (s_game.has_shield) {
            snprintf(hp_buf + pos, sizeof(hp_buf) - pos, " [S]");
        }
        lv_label_set_text(s_hud_hp, hp_buf);
    }

    if (s_hud_blink) {
        // 闪现充能电量显示
        char blk_buf[16] = {0};
        snprintf(blk_buf, sizeof(blk_buf), "⚡%d", s_game.blink_charges);
        lv_label_set_text(s_hud_blink, blk_buf);
    }

    if (s_hud_combo) {
        if (s_game.combo_count > 1) {
            lv_obj_clear_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
            lv_label_set_text_fmt(s_hud_combo, "x%d ECHO", (int)s_game.combo_count);
        } else {
            lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);
        }
    }

    // 4. Game Over 弹窗
    if (s_game.game_over) {
        if (!s_gameover_box) {
            s_gameover_box = lv_obj_create(s_scr);
            lv_obj_set_size(s_gameover_box, 200, 100);
            lv_obj_center(s_gameover_box);
            lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x0F172A), 0);
            lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xF43F5E), 0);
            lv_obj_set_style_border_width(s_gameover_box, 2, 0);

            lv_obj_t *l1 = lv_label_create(s_gameover_box);
            lv_label_set_text(l1, "SIGNAL LOST");
            lv_obj_set_style_text_color(l1, lv_color_hex(0xF43F5E), 0);
            lv_obj_align(l1, LV_ALIGN_TOP_MID, 0, 4);

            lv_obj_t *l2 = lv_label_create(s_gameover_box);
            lv_label_set_text_fmt(l2, "%ldm / %ld PTS", (long)s_game.distance_m, (long)s_game.score);
            lv_obj_set_style_text_color(l2, lv_color_hex(0x38BDF8), 0);
            lv_obj_align(l2, LV_ALIGN_CENTER, 0, 0);

            lv_obj_t *l3 = lv_label_create(s_gameover_box);
            lv_label_set_text(l3, "PRESS OK TO REBOOT");
            lv_obj_set_style_text_color(l3, lv_color_hex(0x94A3B8), 0);
            lv_obj_align(l3, LV_ALIGN_BOTTOM_MID, 0, -2);
        }
    } else {
        if (s_gameover_box) {
            lv_obj_del(s_gameover_box);
            s_gameover_box = NULL;
        }
    }

    // 5. 触发画布重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 统一演示入口：建屏、启动后台任务与定时器
void demo_cyber_runner_enter(void)
{
    // 初始化算法逻辑
    cyber_runner_init(&s_game, 0x20260919);

    // 启动音频队列与任务
    s_snd_queue = xQueueCreate(16, sizeof(cr_sound_t));
    s_audio_running = true;
    xTaskCreate(cyber_runner_audio_task, "cr_audio", 3072, NULL, 5, &s_snd_task);

    // 构建界面
    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x1A102F), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    // 全屏画布
    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_add_event_cb(s_playfield, on_draw_playfield, LV_EVENT_DRAW_MAIN, NULL);

    // 顶部 HUD 标签
    s_hud_score = lv_label_create(s_scr);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xF8FAFC), 0);
    lv_obj_align(s_hud_score, LV_ALIGN_TOP_LEFT, 8, 6);
    lv_label_set_text(s_hud_score, "0m  0");

    s_hud_blink = lv_label_create(s_scr);
    lv_obj_set_style_text_color(s_hud_blink, lv_color_hex(0x38BDF8), 0);
    lv_obj_align(s_hud_blink, LV_ALIGN_TOP_MID, -20, 6);
    lv_label_set_text(s_hud_blink, "⚡3");

    s_hud_hp = lv_label_create(s_scr);
    lv_obj_set_style_text_color(s_hud_hp, lv_color_hex(0xF43F5E), 0);
    lv_obj_align(s_hud_hp, LV_ALIGN_TOP_RIGHT, -8, 6);
    lv_label_set_text(s_hud_hp, "♥♥♥");

    s_hud_combo = lv_label_create(s_scr);
    lv_obj_set_style_text_color(s_hud_combo, lv_color_hex(0xFDE047), 0);
    lv_obj_align(s_hud_combo, LV_ALIGN_TOP_RIGHT, -8, 22);
    lv_obj_add_flag(s_hud_combo, LV_OBJ_FLAG_HIDDEN);

    // 载入屏幕
    lv_disp_load_scr(s_scr);

    // 启动 40 FPS 驱动定时器
    s_game_timer = lv_timer_create(on_timer, 25, NULL);
}

// 统一退出接口：清理全部定时器、任务与图层
void demo_cyber_runner_exit(void)
{
    // 停止定时器
    if (s_game_timer) {
        lv_timer_del(s_game_timer);
        s_game_timer = NULL;
    }

    // 停止音频后台任务
    s_audio_running = false;
    if (s_snd_queue) {
        cr_sound_t stop = CR_SND_NONE;
        xQueueSend(s_snd_queue, &stop, 0);
        vTaskDelay(pdMS_TO_TICKS(50));
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    s_snd_task = NULL;

    // 清空对象句柄
    s_playfield = NULL;
    s_hud_score = NULL;
    s_hud_hp = NULL;
    s_hud_blink = NULL;
    s_hud_combo = NULL;
    s_gameover_box = NULL;

    // 删除主屏
    if (s_scr) {
        lv_obj_del(s_scr);
        s_scr = NULL;
    }
}

// 三键输入响应 (非阻塞)
void demo_cyber_runner_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) return;

    if (btn == BSP_BTN_UP) {
        cyber_runner_input_up(&s_game);
    } else if (btn == BSP_BTN_DOWN) {
        cyber_runner_input_down(&s_game);
    } else if (btn == BSP_BTN_OK) {
        cyber_runner_input_ok(&s_game);
    }
}
