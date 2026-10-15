// main/demo_contra.c —— 《口袋魂斗罗 HD》(Pocket Contra HD)
// 基于零 DRAM 开销的原生 LVGL 9.x 矢量绘制，带 16kHz 街机风音频合成、翻滚跳跃、匍匐避弹、S/L/M/P 武器徽章磁吸、多阶段机械 BOSS 与全屏炸弹。
#include "demo.h"
#include "contra_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_contra";

#define SCREEN_W 240
#define SCREEN_H 320

typedef enum {
    CONTRA_SND_NONE = 0,
    CONTRA_SND_FIRE,
    CONTRA_SND_SPREAD,
    CONTRA_SND_LASER,
    CONTRA_SND_HIT,
    CONTRA_SND_EXPLODE,
    CONTRA_SND_BOSS_HIT,
    CONTRA_SND_BOSS_DEAD,
    CONTRA_SND_UPGRADE,
    CONTRA_SND_BOMB,
    CONTRA_SND_JUMP,
    CONTRA_SND_HURT,
    CONTRA_SND_GAMEOVER
} contra_snd_t;

static contra_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_playfield;
static lv_obj_t *s_hud_score;
static lv_obj_t *s_hud_weapon;
static lv_obj_t *s_hud_lives;
static lv_obj_t *s_hud_bombs;
static lv_obj_t *s_hud_hints;
static lv_obj_t *s_gameover_box = NULL;
static lv_obj_t *s_victory_box = NULL;
static lv_obj_t *s_pause_box = NULL;
static lv_obj_t *s_pause_vol_label = NULL;
static uint8_t s_volume = 80;
static bool s_paused = false;

static lv_timer_t *s_game_timer = NULL;
static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t s_snd_task = NULL;

static uint32_t s_frame_tick = 0;
static uint32_t s_spawn_soldier_timer = 0;
static uint32_t s_spawn_capsule_timer = 0;
static uint32_t s_spawn_turret_timer = 0;
static float s_jump_rot = 0.0f;
static bool s_boss_spawned = false;
static int s_muzzle_flash_frames = 0;

static void send_contra_sound(contra_snd_t snd)
{
    if (s_snd_queue) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 独立后台音效合成任务 (16kHz 16-bit 复古街机音效)
static void contra_audio_task(void *arg)
{
    (void)arg;
    contra_snd_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == CONTRA_SND_NONE) continue;

            if (snd == CONTRA_SND_FIRE) {
                // 普通枪清脆射击声 (640Hz -> 240Hz 快速下潜方波)
                const int total = 700;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 640.0f - t * 400.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_SPREAD) {
                // S 散弹破空重音 (三和弦爆裂 780Hz -> 320Hz)
                const int total = 900;
                float phase1 = 0.0f, phase2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float f1 = 780.0f - t * 460.0f;
                    float f2 = 520.0f - t * 300.0f;
                    phase1 += (f1 / 16000.0f); if (phase1 >= 1.0f) phase1 -= 1.0f;
                    phase2 += (f2 / 16000.0f); if (phase2 >= 1.0f) phase2 -= 1.0f;
                    float amp = (1.0f - t) * 4500.0f;
                    int16_t s1 = (phase1 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    int16_t s2 = (phase2 < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    buf[i % 256] = (s1 + s2) / 2;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_LASER) {
                // L 激光贯穿高频音 (1400Hz -> 420Hz 锐利扫频)
                const int total = 1100;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 1400.0f - t * 980.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6500.0f;
                    buf[i % 256] = (phase < 0.3f) ? (int16_t)amp : -(int16_t)(amp * 0.7f);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_JUMP) {
                // 空中翻滚跳跃 (220Hz -> 540Hz 上升音阶)
                const int total = 800;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 220.0f + t * 320.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 5500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_EXPLODE) {
                // 敌人炸裂白噪音爆破
                const int total = 1400;
                int16_t last = 0;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * 7500.0f;
                    int16_t r = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                    last = (int16_t)((last * 3 + r) / 4);
                    buf[i % 256] = last;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_UPGRADE) {
                // 经典武器吃徽章 1UP 琶音 (C5 -> E5 -> G5 -> C6)
                const int notes[] = { 523, 659, 784, 1046 };
                for (int n = 0; n < 4; n++) {
                    const int total = 420;
                    float phase = 0.0f;
                    float freq = (float)notes[n];
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t * 0.6f) * 7000.0f;
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == CONTRA_SND_BOMB) {
                // 全屏炸弹超重低音轰鸣
                const int total = 3200;
                int16_t last = 0;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * 9000.0f;
                    int16_t r = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                    last = (int16_t)((last + r) / 2);
                    buf[i % 256] = last;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_BOSS_HIT) {
                // BOSS 受击金属重击
                const int total = 600;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 130.0f + t * 40.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_BOSS_DEAD) {
                // 关底 BOSS 爆炸连环毁灭
                for (int round = 0; round < 3; round++) {
                    const int total = 1200;
                    int16_t last = 0;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float amp = (1.0f - t) * 8500.0f;
                        int16_t r = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                        last = (int16_t)((last * 2 + r) / 3);
                        buf[i % 256] = last;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == CONTRA_SND_HURT) {
                // 玩家受创蜂鸣
                const int total = 1200;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 180.0f - t * 80.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == CONTRA_SND_GAMEOVER) {
                // 游戏结束低沉悲伤旋律
                const int sad[] = { 349, 330, 311, 294 };
                for (int s = 0; s < 4; s++) {
                    const int total = 800;
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

// 像素字母绘制 (S, L, M, P, B)
static void draw_badge_letter(lv_layer_t *layer, int x, int y, char letter, uint32_t color)
{
    switch (letter) {
        case 'S':
            draw_box(layer, x, y, 6, 2, color);
            draw_box(layer, x, y + 2, 2, 2, color);
            draw_box(layer, x, y + 4, 6, 2, color);
            draw_box(layer, x + 4, y + 6, 2, 2, color);
            draw_box(layer, x, y + 8, 6, 2, color);
            break;
        case 'L':
            draw_box(layer, x + 1, y, 2, 10, color);
            draw_box(layer, x + 1, y + 8, 6, 2, color);
            break;
        case 'M':
            draw_box(layer, x, y, 2, 10, color);
            draw_box(layer, x + 6, y, 2, 10, color);
            draw_box(layer, x + 2, y + 2, 2, 2, color);
            draw_box(layer, x + 4, y + 2, 2, 2, color);
            draw_box(layer, x + 3, y + 4, 2, 2, color);
            break;
        case 'P':
            draw_box(layer, x + 1, y, 2, 10, color);
            draw_box(layer, x + 3, y, 4, 2, color);
            draw_box(layer, x + 5, y + 2, 2, 3, color);
            draw_box(layer, x + 3, y + 5, 4, 2, color);
            break;
        case 'B':
            draw_box(layer, x + 1, y, 2, 10, color);
            draw_box(layer, x + 3, y, 3, 2, color);
            draw_box(layer, x + 5, y + 1, 2, 3, color);
            draw_box(layer, x + 3, y + 4, 3, 2, color);
            draw_box(layer, x + 5, y + 5, 2, 3, color);
            draw_box(layer, x + 3, y + 8, 3, 2, color);
            break;
        default:
            break;
    }
}

// 绘制掉落的升级徽章 (带上下浮动与金色闪烁外框)
static void draw_badge(lv_layer_t *layer, int x, int y, contra_badge_t badge)
{
    // 上下 2px 轻盈浮动
    int float_y = ((s_frame_tick / 6) % 2) * 2;
    int by = y + float_y;

    // 金黄与银白边框交替闪烁，增强醒目度
    uint32_t border_col = ((s_frame_tick / 4) % 2 == 0) ? 0xFBBF24 : 0xE2E8F0;
    draw_box(layer, x, by, 16, 16, border_col);
    draw_box(layer, x + 1, by + 1, 14, 14, 0x0F172A);

    uint32_t bg_col = 0x334155;
    char code = ' ';
    switch (badge) {
        case CONTRA_BADGE_S: bg_col = 0xEF4444; code = 'S'; break; // 散弹红
        case CONTRA_BADGE_L: bg_col = 0x06B6D4; code = 'L'; break; // 激光青
        case CONTRA_BADGE_M: bg_col = 0xF59E0B; code = 'M'; break; // 机枪橙
        case CONTRA_BADGE_BARRIER: bg_col = 0x3B82F6; code = 'P'; break; // 护盾蓝
        case CONTRA_BADGE_BOMB: bg_col = 0x10B981; code = 'B'; break; // 炸弹绿
        default: break;
    }

    draw_box(layer, x + 2, by + 2, 12, 12, bg_col);
    draw_badge_letter(layer, x + 4, by + 3, code, 0xFFFFFF);
}

// 绘制主角魂斗罗战士 (红头带比尔·雷泽：带持续冲锋步态、波浪翻卷红头带与开火等离子枪口火光)
static void draw_contra_soldier(lv_layer_t *layer, const contra_game_t *g)
{
    int px = (int)g->player_x;
    int py = (int)g->player_y;

    // 无敌闪烁
    if (g->invincible_timer_ms > 0 && ((g->invincible_timer_ms / 60) % 2 == 0)) {
        return;
    }

    // 护盾光环力场 (P 徽章)
    if (g->invincible_timer_ms > 2000) {
        int aura_pulse = (s_frame_tick * 4) % 6;
        draw_box(layer, px - 4 - aura_pulse / 2, py - 4 - aura_pulse / 2,
                 g->player_w + 8 + aura_pulse, g->player_h + 8 + aura_pulse, 0x00E5FF);
        draw_box(layer, px - 2, py - 2, g->player_w + 4, g->player_h + 4, 0x0A1020);
    }

    if (g->is_jumping) {
        // 空中空翻翻滚团 (红色头带 + 蓝色裤子旋转球体)
        int rot_frame = ((int)(s_jump_rot * 4.0f)) % 4;
        draw_box(layer, px + 1, py + 1, 14, 14, 0xEF4444);
        if (rot_frame == 0) {
            draw_box(layer, px + 3, py + 3, 10, 6, 0xFDBA74);
            draw_box(layer, px + 3, py + 8, 10, 5, 0x2563EB);
        } else if (rot_frame == 1) {
            draw_box(layer, px + 3, py + 3, 5, 10, 0xFDBA74);
            draw_box(layer, px + 8, py + 3, 5, 10, 0x2563EB);
        } else if (rot_frame == 2) {
            draw_box(layer, px + 3, py + 3, 10, 5, 0x2563EB);
            draw_box(layer, px + 3, py + 8, 10, 6, 0xFDBA74);
        } else {
            draw_box(layer, px + 3, py + 3, 5, 10, 0x2563EB);
            draw_box(layer, px + 8, py + 3, 5, 10, 0xFDBA74);
        }
        return;
    }

    if (g->is_crouching) {
        // 匍匐射击姿势 (贴地卧倒，枪口平指前方)
        // 飘逸红头带
        draw_box(layer, px - 5, py + 2, 6, 3, 0xEF4444);
        draw_box(layer, px - 8, py + 3, 4, 2, 0xEF4444);
        // 头部与面容
        draw_box(layer, px + 1, py + 1, 8, 6, 0xFDBA74);
        draw_box(layer, px + 1, py + 1, 8, 2, 0xEF4444); // 头带
        // 上半身肌肉
        draw_box(layer, px + 6, py + 4, 10, 6, 0xFDBA74);
        // 蓝色战裤
        draw_box(layer, px, py + 8, 14, 8, 0x2563EB);
        // 步枪
        draw_box(layer, px + 12, py + 6, 14, 3, 0x475569);
        draw_box(layer, px + 18, py + 4, 3, 3, 0x94A3B8);

        // 匍匐开火枪口闪光
        if (s_muzzle_flash_frames > 0) {
            draw_box(layer, px + 26, py + 4, 7, 7, 0xFACC15);
            draw_box(layer, px + 28, py + 6, 3, 3, 0xFFFFFF);
        }
        return;
    }

    // 正常站立 / 奔跑冲锋射击状态 (基于全局帧时钟呈现充满张力的 4 步动态循环)
    int run_step = (s_frame_tick / 4) % 4;
    int body_y_offset = (run_step == 1) ? 1 : ((run_step == 3) ? -1 : 0);

    // 1. 经典红色长飘带 (4 帧波浪动态剧烈迎风翻卷)
    static const int ribbon_offsets[4] = { 0, -2, -1, 1 };
    int ry = py + 2 + ribbon_offsets[run_step];
    draw_box(layer, px - 5, ry, 6, 3, 0xEF4444);
    draw_box(layer, px - 9, ry + ((run_step % 2) ? 1 : -1), 4, 2, 0xEF4444);

    // 2. 头部头带
    draw_box(layer, px + 2, py + body_y_offset, 12, 4, 0xEF4444);

    // 3. 脸庞与双眼
    draw_box(layer, px + 3, py + 4 + body_y_offset, 10, 7, 0xFDBA74);
    draw_box(layer, px + 8, py + 5 + body_y_offset, 2, 2, 0x000000);

    // 4. 肌肉躯干与金色子弹背带
    draw_box(layer, px + 2, py + 11 + body_y_offset, 12, 8, 0xFDBA74);
    draw_box(layer, px + 4, py + 12 + body_y_offset, 2, 2, 0xFBBF24);
    draw_box(layer, px + 6, py + 14 + body_y_offset, 2, 2, 0xFBBF24);
    draw_box(layer, px + 8, py + 16 + body_y_offset, 2, 2, 0xFBBF24);

    // 5. 蓝色军裤
    draw_box(layer, px + 3, py + 19 + body_y_offset, 10, 6, 0x2563EB);

    // 6. 奔跑步态动态渲染 (双腿交替大跨步迈进，活力四射)
    if (run_step == 0) {
        // 左脚前跨，右脚后蹬
        draw_box(layer, px + 1, py + 24, 5, 6, 0x1E293B);
        draw_box(layer, px + 9, py + 25, 5, 5, 0x1E293B);
    } else if (run_step == 1) {
        // 双脚微屈触地，身体微沉 1 像素
        draw_box(layer, px + 3, py + 25, 4, 5, 0x1E293B);
        draw_box(layer, px + 7, py + 25, 4, 5, 0x1E293B);
    } else if (run_step == 2) {
        // 右脚前跨，左脚后蹬
        draw_box(layer, px + 8, py + 24, 5, 6, 0x1E293B);
        draw_box(layer, px, py + 25, 5, 5, 0x1E293B);
    } else {
        // 双脚腾空交替，身体微扬 1 像素
        draw_box(layer, px + 2, py + 23, 4, 6, 0x1E293B);
        draw_box(layer, px + 8, py + 24, 4, 5, 0x1E293B);
    }

    // 7. 枪械与开火枪口爆裂火光
    if (g->aim_dir == CONTRA_AIM_UP) {
        draw_box(layer, px + 8, py - 10 + body_y_offset, 4, 14, 0x475569);
        draw_box(layer, px + 7, py - 12 + body_y_offset, 6, 3, 0x94A3B8);
        if (s_muzzle_flash_frames > 0) {
            // 垂直向上等离子十字爆闪火光
            draw_box(layer, px + 6, py - 18 + body_y_offset, 8, 6, 0xFACC15);
            draw_box(layer, px + 8, py - 20 + body_y_offset, 4, 10, 0xFFFFFF);
        }
    } else {
        draw_box(layer, px + 10, py + 12 + body_y_offset, 14, 4, 0x475569);
        draw_box(layer, px + 14, py + 9 + body_y_offset, 3, 4, 0x94A3B8);
        draw_box(layer, px + 22, py + 13 + body_y_offset, 4, 2, 0xCBD5E1);
        if (s_muzzle_flash_frames > 0) {
            // 水平向前爆裂等离子十字星芒火光
            draw_box(layer, px + 26, py + 11 + body_y_offset, 7, 6, 0xFACC15);
            draw_box(layer, px + 28, py + 9 + body_y_offset, 3, 10, 0xFFFFFF);
        }
    }
}

// 绘制敌人实体
static void draw_contra_enemies(lv_layer_t *layer, const contra_game_t *g)
{
    for (int i = 0; i < CONTRA_MAX_ENEMIES; i++) {
        const contra_enemy_t *e = &g->enemies[i];
        if (!e->active) continue;

        int ex = (int)e->x;
        int ey = (int)e->y;

        if (e->type == CONTRA_ENEMY_FOOT_SOLDIER) {
            // 红色突击步兵奔跑迈步冲锋动画
            int e_run = ((s_frame_tick + i * 2) / 4) % 2;
            draw_box(layer, ex + 2, ey, 10, 6, 0xDC2626); // 红头盔
            draw_box(layer, ex + 4, ey + 6, 6, 4, 0xFDBA74); // 脸部
            draw_box(layer, ex + 1, ey + 10, 12, 8, 0xDC2626); // 红色战斗服
            // 双腿交替大步迈进
            if (e_run == 0) {
                draw_box(layer, ex + 1, ey + 18, 5, 8, 0x1E293B);
                draw_box(layer, ex + 7, ey + 18, 4, 6, 0x1E293B);
            } else {
                draw_box(layer, ex + 6, ey + 18, 5, 8, 0x1E293B);
                draw_box(layer, ex + 2, ey + 18, 4, 6, 0x1E293B);
            }
            draw_box(layer, ex - 6, ey + 11, 8, 3, 0x475569); // 突击步枪向前
        } else if (e->type == CONTRA_ENEMY_CAPSULE) {
            // 红隼飞行武器补给舱 (上下悬停正弦波平滑起伏 + 推进光焰双色跳动)
            int wing = ((s_frame_tick / 3) % 2 == 0) ? -2 : 2;
            int float_y = (int)(sinf((float)s_frame_tick * 0.15f) * 4.0f);
            int cy = ey + float_y;
            draw_box(layer, ex + 2, cy, 16, 12, 0xF43F5E); // 核心机体
            draw_box(layer, ex, cy + 3, 20, 6, 0xE11D48);
            draw_box(layer, ex + 6, cy + 2, 8, 8, 0xFFFFFF); // 核心玻璃罩
            // 双色跳动等离子尾焰
            int flame_len = ((s_frame_tick / 2) % 2 == 0) ? 7 : 10;
            draw_box(layer, ex + 20, cy + 4, flame_len, 4, 0x00E5FF);
            draw_box(layer, ex + 20, cy + 5, flame_len - 2, 2, 0xFFFFFF);
            draw_box(layer, ex + 6, cy - 4 + wing, 8, 4, 0x38BDF8);
            draw_box(layer, ex + 6, cy + 12 - wing, 8, 4, 0x38BDF8);
        } else if (e->type == CONTRA_ENEMY_TURRET) {
            // 地堡双管旋转加农炮台
            draw_box(layer, ex, ey + 8, 24, 16, 0x334155);
            draw_box(layer, ex + 4, ey + 2, 16, 12, 0x64748B);
            // 炮管朝向玩家
            float dx = (g->player_x + 8) - (e->x + 12);
            float dy = (g->player_y + 15) - (e->y + 12);
            float dist = sqrtf(dx * dx + dy * dy);
            if (dist > 1.0f) {
                int bx = ex + 12 + (int)((dx / dist) * 12.0f);
                int by = ey + 12 + (int)((dy / dist) * 12.0f);
                draw_box(layer, bx - 2, by - 2, 6, 6, 0x94A3B8);
            }
        } else if (e->type == CONTRA_ENEMY_BOSS) {
            // 关底机械巨兽：阴影要塞 BOSS
            // 主要机械框架
            draw_box(layer, ex, ey, 42, 56, 0x1E293B);
            draw_box(layer, ex + 4, ey + 4, 34, 48, 0x334155);

            if (e->boss_phase == BOSS_PHASE_1_ARMORED) {
                // Phase 1: 重装甲防护 + 双侧自动加农副炮
                draw_box(layer, ex + 8, ey + 12, 26, 32, 0x475569);
                draw_box(layer, ex - 6, ey + 10, 8, 6, 0x94A3B8);
                draw_box(layer, ex - 6, ey + 40, 8, 6, 0x94A3B8);
                // 警示双黄灯
                draw_box(layer, ex + 10, ey + 8, 6, 4, 0xFACC15);
                draw_box(layer, ex + 26, ey + 8, 6, 4, 0xFACC15);
            } else if (e->boss_phase == BOSS_PHASE_2_EXPOSED) {
                // Phase 2: 外壳崩解，异形能量核心暴露闪烁
                draw_box(layer, ex + 12, ey + 16, 18, 24, 0xDC2626);
                draw_box(layer, ex + 16, ey + 20, 10, 16, 0xFF4466);
                draw_box(layer, ex - 4, ey + 24, 6, 6, 0x00E5FF);
            } else if (e->boss_phase == BOSS_PHASE_3_ENRAGED) {
                // Phase 3: 超频狂暴形态，电弧与核心剧烈脉冲
                bool pulse = ((s_frame_tick / 2) % 2 == 0);
                draw_box(layer, ex + 8, ey + 12, 26, 32, pulse ? 0xEF4444 : 0xFACC15);
                draw_box(layer, ex + 14, ey + 18, 14, 20, 0xFFFFFF);
                // 电光火花
                draw_box(layer, ex - 4, ey + 10, 4, 4, 0x00E5FF);
                draw_box(layer, ex - 6, ey + 42, 6, 4, 0x00E5FF);
            }

            // BOSS 血条显示 (顶部宽条)
            draw_box(layer, ex, ey - 8, 42, 4, 0x0A0505);
            int hp_w = (e->max_hp > 0) ? (e->hp * 42 / e->max_hp) : 0;
            if (hp_w > 42) hp_w = 42;
            if (hp_w < 0) hp_w = 0;
            draw_box(layer, ex, ey - 8, hp_w, 4, 0xEF4444);
        }
    }
}

// 绘制玩家与敌方子弹
static void draw_contra_bullets(lv_layer_t *layer, const contra_game_t *g)
{
    // 1. 玩家子弹
    for (int i = 0; i < CONTRA_MAX_PLAYER_BULLETS; i++) {
        const contra_bullet_t *b = &g->player_bullets[i];
        if (!b->active) continue;

        int bx = (int)b->x;
        int by = (int)b->y;

        if (b->weapon_type == CONTRA_WEAPON_SPREAD) {
            // S 弹：燃烧赤红大型能量弹丸
            draw_box(layer, bx, by, 6, 6, 0xEF4444);
            draw_box(layer, bx + 1, by + 1, 4, 4, 0xFFFFFF);
        } else if (b->weapon_type == CONTRA_WEAPON_LASER) {
            // L 弹：高能霓虹蓝贯穿光束
            draw_box(layer, bx, by, b->w, b->h, 0x00E5FF);
            draw_box(layer, bx + 1, by + 1, (b->w > 2 ? b->w - 2 : 1), (b->h > 2 ? b->h - 2 : 1), 0xFFFFFF);
        } else if (b->weapon_type == CONTRA_WEAPON_MACHINEGUN) {
            // M 弹：高速密集金黄穿甲弹
            draw_box(layer, bx, by, 6, 3, 0xFBBF24);
            draw_box(layer, bx + 2, by + 1, 2, 1, 0xFFFFFF);
        } else {
            // 普通白黄能量光弹
            draw_box(layer, bx, by, 4, 4, 0xFACC15);
            draw_box(layer, bx + 1, by + 1, 2, 2, 0xFFFFFF);
        }
    }

    // 2. 敌人子弹 (红色等离子光球)
    for (int i = 0; i < CONTRA_MAX_ENEMY_BULLETS; i++) {
        const contra_bullet_t *eb = &g->enemy_bullets[i];
        if (!eb->active) continue;
        int ebx = (int)eb->x;
        int eby = (int)eb->y;
        draw_box(layer, ebx, eby, 6, 6, 0xFF2222);
        draw_box(layer, ebx + 2, eby + 2, 2, 2, 0xFFFFFF);
    }
}

// 绘制主战场画布
static void playfield_draw_cb(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_DRAW_MAIN) return;

    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 深邃异星军港夜空 (从 y=26 顶部 HUD 栏下方开始绘制，确保绝不遮挡顶部状态栏)
    draw_box(layer, 0, 26, SCREEN_W, (int)CONTRA_GROUND_Y - 26, 0x070D18);

    // 远景通讯天线与红色防空警示信标 (带呼吸扩散光晕脉冲)
    int beacon_pulse = (s_frame_tick / 4) % 4;
    draw_box(layer, 180, 52, 2, 60, 0x334155);
    draw_box(layer, 177, 72, 8, 2, 0x334155);
    draw_box(layer, 179 - beacon_pulse, 49 - beacon_pulse, 4 + beacon_pulse * 2, 4 + beacon_pulse * 2, 0x7F1D1D);
    draw_box(layer, 179, 49, 4, 4, 0xEF4444);

    // 工业要塞巨型金属管道背景
    int pipe_scroll = (s_frame_tick) % 120;
    for (int p = -1; p < 3; p++) {
        int px = p * 120 - pipe_scroll;
        draw_box(layer, px, 150, 80, 16, 0x1E293B);
        draw_box(layer, px + 20, 130, 10, 20, 0x0F172A);
    }

    // 要塞工业排气散热涡轮 (4 扇叶高速动态旋转)
    int fan_frame = (s_frame_tick / 2) % 4;
    draw_box(layer, 85, 108, 22, 22, 0x0F172A);
    draw_box(layer, 87, 110, 18, 18, 0x1E293B);
    if (fan_frame == 0 || fan_frame == 2) {
        draw_box(layer, 95, 110, 2, 18, 0x64748B);
        draw_box(layer, 87, 118, 18, 2, 0x64748B);
    } else {
        draw_box(layer, 89, 112, 14, 14, 0x475569);
    }
    draw_box(layer, 94, 117, 4, 4, 0x00E5FF); // 核心霓虹高能指示灯

    // 2. 机械要塞地表 (金属甲板 + 危险黄色斜纹)
    draw_box(layer, 0, (int)CONTRA_GROUND_Y, SCREEN_W, 10, 0x334155); // 甲板主体
    draw_box(layer, 0, (int)CONTRA_GROUND_Y, SCREEN_W, 2, 0x00E5FF);  // 顶部发光霓虹地线
    draw_box(layer, 0, (int)CONTRA_GROUND_Y + 10, SCREEN_W, SCREEN_H - (int)CONTRA_GROUND_Y - 10, 0x0F172A);

    // 滚动地表甲板铆钉与格栅 (营造自动前进动感)
    int deck_scroll = (s_frame_tick * 3) % 24;
    for (int gx = -deck_scroll; gx < SCREEN_W; gx += 24) {
        draw_box(layer, gx, (int)CONTRA_GROUND_Y + 4, 8, 3, 0x1E293B);
    }

    // 地表高速后退机械摩擦火花微粒
    if ((s_frame_tick % 4) < 2) {
        int spark_x = (s_frame_tick * 11) % SCREEN_W;
        draw_box(layer, spark_x, (int)CONTRA_GROUND_Y + 1, 3, 2, 0xFACC15);
    }

    // 3. 绘制掉落武器徽章
    for (int i = 0; i < CONTRA_MAX_ITEMS; i++) {
        if (s_game.items[i].active) {
            draw_badge(layer, (int)s_game.items[i].x, (int)s_game.items[i].y, s_game.items[i].badge);
        }
    }

    // 4. 绘制敌军实体 (步兵、飞鹰补给机、炮台、关底 BOSS)
    draw_contra_enemies(layer, &s_game);

    // 5. 绘制主角魂斗罗战士
    draw_contra_soldier(layer, &s_game);

    // 6. 绘制所有子弹火线
    draw_contra_bullets(layer, &s_game);
}

// 游戏主逻辑心跳 (30ms)
static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    if (s_muzzle_flash_frames > 0) {
        s_muzzle_flash_frames--;
    }

    if (!s_paused) {
        // 翻滚跳跃动画角度累加
        if (s_game.is_jumping) {
            s_jump_rot += 0.35f;
        } else {
            s_jump_rot = 0.0f;
        }

        // 自动向前推进：若站在地面且未下蹲，角色自动稳步向右行进至安全交火线 (x = 48)
        if (s_game.is_grounded && !s_game.is_crouching) {
            if (s_game.player_x < 48.0f) {
                s_game.player_x += 0.35f;
            }
        }

        // 硬件按键实时电平采样，支持持续匍匐与按住连发射击
        int mv = bsp_button_read_mv();
        bool up_held = (mv >= 0 && mv < 150);
        bool dn_held = (mv >= 150 && mv < 447);
        bool ok_held = (mv >= 447 && mv < 1900);

        if (dn_held) {
            contra_logic_btn_down(&s_game, true);
        } else if (s_game.is_crouching) {
            contra_logic_btn_down(&s_game, false);
        }

        if (!up_held && s_game.key_up) {
            contra_logic_btn_up(&s_game, false);
        }

        if (ok_held) {
            if (s_game.fire_cooldown_ms == 0) {
                contra_logic_fire(&s_game);
            }
        } else {
            if (s_game.key_ok) {
                contra_logic_btn_ok(&s_game, false);
            }
        }

        // 步进核心物理与战斗逻辑
        contra_logic_update(&s_game, 30);

        // 敌人与战机波次生成逻辑 (紧凑热血的 1.2s 步兵刷新间隔)
        s_spawn_soldier_timer += 30;
        if (s_spawn_soldier_timer >= 1200) {
            s_spawn_soldier_timer = 0;
            int active_soldiers = 0;
            for (int i = 0; i < CONTRA_MAX_ENEMIES; i++) {
                if (s_game.enemies[i].active && s_game.enemies[i].type == CONTRA_ENEMY_FOOT_SOLDIER) {
                    active_soldiers++;
                }
            }
            if (active_soldiers < 3) {
                contra_logic_spawn_enemy(&s_game, CONTRA_ENEMY_FOOT_SOLDIER, SCREEN_W + 10, CONTRA_GROUND_Y - 26);
            }
        }

        s_spawn_capsule_timer += 30;
        if (s_spawn_capsule_timer >= 3200) {
            s_spawn_capsule_timer = 0;
            contra_badge_t badges[] = { CONTRA_BADGE_S, CONTRA_BADGE_L, CONTRA_BADGE_M, CONTRA_BADGE_BARRIER, CONTRA_BADGE_BOMB };
            contra_badge_t b = badges[rand() % 5];
            contra_logic_spawn_capsule(&s_game, SCREEN_W + 20, 130 + (rand() % 50), b);
        }

        s_spawn_turret_timer += 30;
        if (s_spawn_turret_timer >= 5500) {
            s_spawn_turret_timer = 0;
            contra_logic_spawn_enemy(&s_game, CONTRA_ENEMY_TURRET, SCREEN_W + 15, CONTRA_GROUND_Y - 24);
        }

        // 达到 600 分激活召唤关底机械 BOSS！
        if (s_game.score >= 600 && !s_boss_spawned) {
            s_boss_spawned = true;
            contra_logic_spawn_boss(&s_game, 185.0f, 180.0f, 150);
        }

        // 开火瞬间点亮枪口等离子火光 (2帧闪光)
        if (s_game.snd.snd_fire || s_game.snd.snd_spread || s_game.snd.snd_laser) {
            s_muzzle_flash_frames = 2;
        }

        // 音效事件触发分发
        if (s_game.snd.snd_fire)       send_contra_sound(CONTRA_SND_FIRE);
        if (s_game.snd.snd_spread)     send_contra_sound(CONTRA_SND_SPREAD);
        if (s_game.snd.snd_laser)      send_contra_sound(CONTRA_SND_LASER);
        if (s_game.snd.snd_explode)    send_contra_sound(CONTRA_SND_EXPLODE);
        if (s_game.snd.snd_upgrade)    send_contra_sound(CONTRA_SND_UPGRADE);
        if (s_game.snd.snd_boss_hit)   send_contra_sound(CONTRA_SND_BOSS_HIT);
        if (s_game.snd.snd_boss_dead)  send_contra_sound(CONTRA_SND_BOSS_DEAD);
        if (s_game.snd.snd_player_hit) send_contra_sound(CONTRA_SND_HURT);
        if (s_game.snd.snd_player_die) send_contra_sound(CONTRA_SND_GAMEOVER);
    }

    // 更新顶部 HUD 仪表
    if (s_hud_score) {
        char buf[32];
        if (s_game.combo > 1) {
            snprintf(buf, sizeof(buf), "x%d %d", s_game.combo, s_game.score);
        } else {
            snprintf(buf, sizeof(buf), "SCORE:%d", s_game.score);
        }
        lv_label_set_text(s_hud_score, buf);
        lv_obj_set_style_text_color(s_hud_score,
            s_game.combo > 1 ? lv_color_hex(0x00E5FF) : lv_color_hex(0xFFD700), 0);
    }

    if (s_hud_weapon) {
        const char *wstr = "[N]";
        uint32_t wcol = 0xE2E8F0;
        if (s_game.weapon_type == CONTRA_WEAPON_SPREAD)     { wstr = "[S]"; wcol = 0xEF4444; }
        else if (s_game.weapon_type == CONTRA_WEAPON_LASER) { wstr = "[L]"; wcol = 0x00E5FF; }
        else if (s_game.weapon_type == CONTRA_WEAPON_MACHINEGUN) { wstr = "[M]"; wcol = 0xF59E0B; }
        lv_label_set_text(s_hud_weapon, wstr);
        lv_obj_set_style_text_color(s_hud_weapon, lv_color_hex(wcol), 0);
    }

    if (s_hud_lives) {
        char buf[32];
        int l = s_game.lives;
        if (l <= 0) snprintf(buf, sizeof(buf), "DEAD");
        else if (l == 1) snprintf(buf, sizeof(buf), "HP:*");
        else if (l == 2) snprintf(buf, sizeof(buf), "HP:**");
        else snprintf(buf, sizeof(buf), "HP:***");
        lv_label_set_text(s_hud_lives, buf);
    }

    if (s_hud_bombs) {
        char buf[32];
        snprintf(buf, sizeof(buf), "B:%d", s_game.bombs);
        lv_label_set_text(s_hud_bombs, buf);
    }

    // 游戏结束弹窗
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
        lv_label_set_text(lbl, "MISSION FAILED!\nPress OK to Restart");
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFF4466), 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    } else if (!s_game.game_over && s_gameover_box) {
        lv_obj_delete(s_gameover_box);
        s_gameover_box = NULL;
    }

    // 通关胜利弹窗
    if (s_game.victory && !s_victory_box) {
        s_victory_box = lv_obj_create(s_scr);
        lv_obj_set_size(s_victory_box, 200, 84);
        lv_obj_center(s_victory_box);
        lv_obj_set_style_bg_color(s_victory_box, lv_color_hex(0x05140A), 0);
        lv_obj_set_style_bg_opa(s_victory_box, LV_OPA_90, 0);
        lv_obj_set_style_border_color(s_victory_box, lv_color_hex(0x22C55E), 0);
        lv_obj_set_style_border_width(s_victory_box, 2, 0);
        lv_obj_clear_flag(s_victory_box, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *lbl = lv_label_create(s_victory_box);
        lv_label_set_text(lbl, "FORTRESS CRUSHED!\nPress OK for Next Wave");
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0x00E5FF), 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    } else if (!s_game.victory && s_victory_box) {
        lv_obj_delete(s_victory_box);
        s_victory_box = NULL;
    }

    lv_obj_invalidate(s_playfield);
}

// 演示页进入
void demo_contra_enter(void)
{
    ESP_LOGI(TAG, "启动《口袋魂斗罗 HD》");
    contra_logic_init(&s_game);
    s_paused = false;
    s_boss_spawned = false;

    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(16, sizeof(contra_snd_t));
        xTaskCreate(contra_audio_task, "contra_audio", 4096, NULL, 5, &s_snd_task);
    }

    s_scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x070D18), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(s_playfield, playfield_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 顶部 HUD 状态栏 (纯黑背景 + 底部隔线，100% 不透明，零内边距防止字体被裁切)
    lv_obj_t *hud_bar = lv_obj_create(s_scr);
    lv_obj_set_size(hud_bar, SCREEN_W, 26);
    lv_obj_set_pos(hud_bar, 0, 0);
    lv_obj_set_style_bg_color(hud_bar, lv_color_hex(0x050B14), 0);
    lv_obj_set_style_bg_opa(hud_bar, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(hud_bar, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(hud_bar, lv_color_hex(0x1E293B), 0);
    lv_obj_set_style_border_width(hud_bar, 1, 0);
    lv_obj_set_style_pad_all(hud_bar, 0, 0);
    lv_obj_clear_flag(hud_bar, LV_OBJ_FLAG_SCROLLABLE);

    s_hud_score = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_score, "SCORE:0");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xFFD700), 0);
    lv_obj_set_pos(s_hud_score, 8, 5);

    s_hud_weapon = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_weapon, "[N]");
    lv_obj_set_style_text_font(s_hud_weapon, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_weapon, lv_color_hex(0x00E5FF), 0);
    lv_obj_set_pos(s_hud_weapon, 110, 5);

    s_hud_lives = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_lives, "HP:***");
    lv_obj_set_style_text_font(s_hud_lives, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_lives, lv_color_hex(0xFF4466), 0);
    lv_obj_set_pos(s_hud_lives, 150, 5);

    s_hud_bombs = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_bombs, "B:2");
    lv_obj_set_style_text_font(s_hud_bombs, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_bombs, lv_color_hex(0x10B981), 0);
    lv_obj_set_pos(s_hud_bombs, 205, 5);

    // 底部操作提示
    s_hud_hints = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_hints, 0, 303);
    lv_obj_set_size(s_hud_hints, 240, 16);
    lv_obj_set_style_text_align(s_hud_hints, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_hud_hints, "UP:JUMP  DN:CROUCH  OK:FIRE");
    lv_obj_set_style_text_font(s_hud_hints, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hints, lv_color_hex(0xFFD700), 0);

    // 暂停半透明浮层
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
    s_victory_box = NULL;
    lv_screen_load(s_scr);

    s_game_timer = lv_timer_create(game_timer_cb, 30, NULL);
}

// 演示页退出
void demo_contra_exit(void)
{
    ESP_LOGI(TAG, "退出《口袋魂斗罗 HD》");
    if (s_game_timer) {
        lv_timer_delete(s_game_timer);
        s_game_timer = NULL;
    }
    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
        s_hud_score = NULL;
        s_hud_weapon = NULL;
        s_hud_lives = NULL;
        s_hud_bombs = NULL;
        s_hud_hints = NULL;
        s_pause_box = NULL;
        s_pause_vol_label = NULL;
        s_gameover_box = NULL;
        s_victory_box = NULL;
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
void demo_contra_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 游戏结束或胜利结算：按 OK 重新进入战场
    if (s_game.game_over || s_game.victory) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            contra_logic_init(&s_game);
            s_boss_spawned = false;
            if (s_gameover_box) {
                lv_obj_delete(s_gameover_box);
                s_gameover_box = NULL;
            }
            if (s_victory_box) {
                lv_obj_delete(s_victory_box);
                s_victory_box = NULL;
            }
        }
        return;
    }

    // 暂停菜单音量调节与恢复
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

    // 正常战斗按键处理
    if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK) {
            contra_logic_btn_ok(&s_game, true);
        } else if (ev == BSP_BTN_DOUBLE) {
            // 双击 OK 投掷全屏炸弹清屏
            if (s_game.bombs > 0 && contra_logic_throw_bomb(&s_game)) {
                send_contra_sound(CONTRA_SND_BOMB);
            }
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK) {
            contra_logic_btn_up(&s_game, true);
            send_contra_sound(CONTRA_SND_JUMP);
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
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK || ev == BSP_BTN_LONG) {
            contra_logic_btn_down(&s_game, true);
        }
    }
}
