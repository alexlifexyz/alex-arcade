// main/demo_thunder.c —— 《雷霆战机：大像素街机版》(Thunder Striker Arcade)
// 100% 还原 simulator/index.html 的全屏复古大像素画风、极速连发、浓郁16kHz街机音效与底部操作指引。
#include "demo.h"
#include "thunder_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_thunder";

typedef enum {
    SND_NONE = 0,
    SND_LASER,
    SND_WAVE,
    SND_FIRE,
    SND_SHIELD,
    SND_PAUSE,
    SND_HIT,
    SND_EXPLODE,
    SND_EXPLODE_BIG,
    SND_BOMB,
    SND_POWERUP,
    SND_GAMEOVER
} thunder_snd_t;

static thunder_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_playfield;
static lv_obj_t *s_hud_score;
static lv_obj_t *s_hud_bomb;
static lv_obj_t *s_hud_boss;
static lv_obj_t *s_hud_hints;
static lv_obj_t *s_gameover_box;
static lv_obj_t *s_gameover_score;
static lv_obj_t *s_pause_box;
static lv_obj_t *s_pause_vol_label;
static lv_timer_t *s_game_timer;

static int s_last_score = -1;
static int s_last_bomb = -1;
static bool s_last_boss = false;
static uint8_t s_volume = 80;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_snd_task;
static int s_flash_timer = 0;
static int s_up_hold_ticks = 0;
static int s_down_hold_ticks = 0;

static void send_sound(thunder_snd_t snd)
{
    if (s_snd_queue) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 独立后台音效合成任务 (16kHz 8-bit/16-bit 浓郁街机音色，无杂音阻塞)
static void thunder_audio_task(void *arg)
{
    (void)arg;
    thunder_snd_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == SND_NONE) continue;

            if (snd == SND_LASER) {
                // 经典街机激光扫频 (880Hz 指数衰减至 180Hz，长 80ms，清脆有力)
                const int total = 1280; // 80ms at 16kHz
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 880.0f * powf(180.0f / 880.0f, t);
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7500.0f;
                    buf[i % 256] = (int16_t)((2.0f * phase - 1.0f) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_WAVE) {
                // S型波动刃声波扫频 (颤音激光，科幻蜂鸣 800Hz~1300Hz)
                const int total = 1400; // ~90ms
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 900.0f + 350.0f * sinf(t * 30.0f);
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_FIRE) {
                // 烈焰爆破呼啸低鸣 (爆燃冲击波 300Hz~80Hz)
                const int total = 1600; // 100ms
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 280.0f - t * 200.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float noise = ((rand() % 4000) - 2000) * (1.0f - t);
                    float amp = (1.0f - t) * 8000.0f;
                    buf[i % 256] = (int16_t)(sinf(phase * 6.28318f) * amp + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_SHIELD) {
                // 离子护盾能量吸收晶鸣 (高音上扬 600Hz -> 1400Hz)
                const int total = 1200;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 600.0f + t * 800.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.5f) * 6500.0f;
                    buf[i % 256] = (int16_t)(sinf(phase * 6.28318f) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_PAUSE) {
                // 经典街机暂停叮咚声 (880Hz + 1320Hz)
                const int freqs[] = { 880, 1320 };
                for (int f = 0; f < 2; f++) {
                    const int total = 800; // 50ms
                    float phase = 0.0f;
                    float freq = (float)freqs[f];
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
                    vTaskDelay(pdMS_TO_TICKS(10));
                }
            } else if (snd == SND_HIT) {
                // 击中金属短鸣 (三角波 400Hz 快速衰减至 100Hz，长 40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 400.0f - t * 300.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6500.0f;
                    float tri = (phase < 0.5f) ? (4.0f * phase - 1.0f) : (3.0f - 4.0f * phase);
                    buf[i % 256] = (int16_t)(tri * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_EXPLODE || snd == SND_EXPLODE_BIG) {
                // 真实街机低通滤波白噪声爆炸 (小怪 220ms，大怪/Boss 400ms)
                bool is_big = (snd == SND_EXPLODE_BIG);
                const int total = is_big ? 5600 : 3200;
                int16_t last_sample = 0;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * (1.0f - t) * (is_big ? 11000.0f : 8000.0f);
                    int16_t raw_noise = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                    last_sample = (int16_t)((last_sample * 3 + raw_noise) / 4);
                    buf[i % 256] = last_sample;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == SND_BOMB) {
                // 全屏核弹毁天灭地三重连环大爆炸 (连续 3 段低频震爆)
                for (int round = 0; round < 3; round++) {
                    const int total = 3600;
                    int16_t last_sample = 0;
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        float amp = (1.0f - t) * (1.0f - t) * 12000.0f;
                        int16_t raw_noise = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                        last_sample = (int16_t)((last_sample * 2 + raw_noise) / 3);
                        buf[i % 256] = last_sample;
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                    vTaskDelay(pdMS_TO_TICKS(35));
                }
            } else if (snd == SND_POWERUP) {
                // 欢快 4 音阶连击拾取声 (440, 554, 659, 880Hz)
                const int freqs[] = { 440, 554, 659, 880 };
                for (int f = 0; f < 4; f++) {
                    const int total = 800;
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
                    vTaskDelay(pdMS_TO_TICKS(15));
                }
            } else if (snd == SND_GAMEOVER) {
                // 战机坠落哀鸣音阶 (392, 349, 311, 261Hz)
                const int freqs[] = { 392, 349, 311, 261 };
                for (int f = 0; f < 4; f++) {
                    const int total = 1600;
                    float phase = 0.0f;
                    float freq = (float)freqs[f];
                    for (int i = 0; i < total; i++) {
                        float t = (float)i / (float)total;
                        phase += (freq / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = (1.0f - t) * 7500.0f;
                        buf[i % 256] = (int16_t)((2.0f * phase - 1.0f) * amp);
                        if ((i % 256) == 255 || i == total - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                    vTaskDelay(pdMS_TO_TICKS(30));
                }
            }
        }
    }
}

// 快速色块光栅化填充 (直连 LVGL 当前渲染切片，0 额外内存消耗)
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t hex_color)
{
    if (x >= SCREEN_W || y >= SCREEN_H || x + w <= 0 || y + h <= 0) return;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > SCREEN_W) w = SCREEN_W - x;
    if (y + h > SCREEN_H) h = SCREEN_H - y;
    if (w <= 0 || h <= 0) return;

    lv_area_t coords = { x, y, x + w - 1, y + h - 1 };
    lv_draw_fill_dsc_t dsc;
    lv_draw_fill_dsc_init(&dsc);
    dsc.color = lv_color_hex(hex_color);
    dsc.opa = LV_OPA_COVER;
    dsc.radius = 0;
    lv_draw_fill(layer, &dsc, &coords);
}

// 绘制红心生命图标 (7x6 经典像素心)
static void draw_heart(lv_layer_t *layer, int x, int y, bool filled)
{
    uint32_t col = filled ? 0xFF2244 : 0x441122;
    draw_box(layer, x + 1, y, 2, 1, col);
    draw_box(layer, x + 4, y, 2, 1, col);
    draw_box(layer, x, y + 1, 7, 2, col);
    draw_box(layer, x + 1, y + 3, 5, 1, col);
    draw_box(layer, x + 2, y + 4, 3, 1, col);
    draw_box(layer, x + 3, y + 5, 1, 1, col);
}

// 游戏画布主绘制回调 (每帧直接光栅化渲染)
static void on_playfield_draw(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    int ox = 0, oy = 0;
    if (s_game.screen_shake > 0) {
        ox = (rand() % s_game.screen_shake) - (s_game.screen_shake / 2);
        oy = (rand() % s_game.screen_shake) - (s_game.screen_shake / 2);
    }

    // 0. 全屏核弹白光闪烁
    if (s_flash_timer > 0) {
        draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0xFFFFFF);
        return;
    }

    // 1. 深邃星空背景与滚动星辰
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x080C16);
    for (int i = 0; i < THUNDER_MAX_STARS; i++) {
        draw_box(layer, (int)s_game.stars[i].x + ox, (int)s_game.stars[i].y + oy,
                 s_game.stars[i].size, s_game.stars[i].size, s_game.stars[i].color);
    }

    // 2. 玩家战机 (30x28 像素，带双喷射火焰、机翼、座舱光晕)
    if (!s_game.game_over) {
        bool flash_hide = (s_game.invincible_timer > 0 && (s_game.invincible_timer / 4) % 2 == 0);
        if (!flash_hide) {
            int px = (int)s_game.player_x + ox;
            int py = (int)s_game.player_y + oy;

            // 双尾喷动态尾焰
            int flame_h = 6 + (s_game.wave_tick % 3) * 3;
            draw_box(layer, px + 9, py + 26, 4, flame_h, 0xFF9900);
            draw_box(layer, px + 17, py + 26, 4, flame_h, 0xFF9900);
            draw_box(layer, px + 10, py + 26, 2, flame_h - 2, 0xFFEA00);
            draw_box(layer, px + 18, py + 26, 2, flame_h - 2, 0xFFEA00);

            // 玩家战机掠翼与机身
            draw_box(layer, px + 11, py + 2, 8, 24, 0x0077AA);
            draw_box(layer, px + 13, py + 0, 4, 16, 0x00E5FF);
            draw_box(layer, px + 2, py + 14, 26, 8, 0x00AACC);
            draw_box(layer, px + 0, py + 18, 30, 6, 0x0088BB);

            // 翼尖金色双联激光炮口
            draw_box(layer, px + 0, py + 12, 3, 6, 0xFFD928);
            draw_box(layer, px + 27, py + 12, 3, 6, 0xFFD928);

            // 晶透橙色座舱盖与反光高光
            draw_box(layer, px + 12, py + 8, 6, 8, 0xFFAA00);
            draw_box(layer, px + 14, py + 9, 2, 4, 0xFFFFFF);

            // 双子浮游僚机卫星 (左/右悬浮护卫)
            if (s_game.has_wingman) {
                // 左僚机
                int lwx = px - 12;
                int lwy = py + 8 + (s_game.wave_tick % 4);
                draw_box(layer, lwx + 2, lwy, 2, 6, 0x00E5FF);
                draw_box(layer, lwx, lwy + 2, 6, 2, 0x00E5FF);
                draw_box(layer, lwx + 2, lwy + 2, 2, 2, 0xFFFFFF);
                // 右僚机
                int rwx = px + 36;
                int rwy = py + 8 + ((s_game.wave_tick + 2) % 4);
                draw_box(layer, rwx + 2, rwy, 2, 6, 0x00E5FF);
                draw_box(layer, rwx, rwy + 2, 6, 2, 0x00E5FF);
                draw_box(layer, rwx + 2, rwy + 2, 2, 2, 0xFFFFFF);
            }

            // 离子护盾能量光晕力场 (若有护盾时环绕战机)
            if (s_game.shield > 0) {
                uint32_t sc = (s_game.wave_tick % 4 < 2) ? 0x00E5FF : 0x88FFFF;
                // 护盾力场四角包络
                draw_box(layer, px - 6, py - 4, 6, 2, sc);
                draw_box(layer, px - 6, py - 4, 2, 6, sc);
                draw_box(layer, px + 30, py - 4, 6, 2, sc);
                draw_box(layer, px + 34, py - 4, 2, 6, sc);
                draw_box(layer, px - 6, py + 26, 6, 2, sc);
                draw_box(layer, px - 6, py + 22, 2, 6, sc);
                draw_box(layer, px + 30, py + 26, 6, 2, sc);
                draw_box(layer, px + 34, py + 22, 2, 6, sc);
            }
        }
    }

    // 3. 玩家子弹 (三大弹道：S型波动、炼狱烈焰、贯穿激光)
    for (int i = 0; i < THUNDER_MAX_BULLETS; i++) {
        if (s_game.bullets[i].active) {
            bullet_t *b = &s_game.bullets[i];
            int bx = (int)b->x + ox;
            int by = (int)b->y + oy;
            int bw = b->w;
            int bh = b->h;

            if (b->traj == BULLET_TRAJ_WAVE) {
                // S型波动刃：碧翠霓虹回旋光刃 + 亮白晶核
                draw_box(layer, bx - 1, by - 1, bw + 2, bh + 2, 0x00FFCC);
                draw_box(layer, bx, by, bw, bh, 0xFFFFFF);
            } else if (b->traj == BULLET_TRAJ_FIRE) {
                // 炼狱烈焰弹：狂暴爆燃火球 (外烈红 + 中橙黄 + 内白热)
                draw_box(layer, bx - 1, by - 1, bw + 2, bh + 2, 0xFF2200);
                draw_box(layer, bx, by, bw, bh, 0xFF9900);
                if (bw > 4 && bh > 4) {
                    draw_box(layer, bx + 2, by + 2, bw - 4, bh - 4, 0xFFFF66);
                }
            } else {
                // 直线高能激光 / 歼星光束
                if (b->dmg >= 8) {
                    draw_box(layer, bx - 1, by - 1, bw + 2, bh + 2, 0xFF00BB);
                    draw_box(layer, bx, by, bw, bh, 0xFFFFFF);
                } else if (b->dmg >= 4) {
                    draw_box(layer, bx, by, bw, bh, b->color);
                    if (bw > 3 && bh > 4) {
                        draw_box(layer, bx + 1, by + 1, bw - 2, bh - 2, 0xFFFFFF);
                    }
                } else {
                    draw_box(layer, bx, by, bw, bh, b->color);
                }
            }
        }
    }

    // 4. 敌机编队 (烈隼隐形战机、幻翼机械飞龙、重装巡洋堡垒、星海利维坦龙神)
    for (int i = 0; i < THUNDER_MAX_ENEMIES; i++) {
        if (s_game.enemies[i].active) {
            enemy_t *e = &s_game.enemies[i];
            int ex = (int)e->x + ox;
            int ey = (int)e->y + oy;

            if (e->type == ENEMY_FALCON) {
                // 烈隼三角隐形战机 (26x24, 极具现代战机质感)
                // 机头雷达与座舱
                draw_box(layer, ex + 11, ey + 0, 4, 18, 0x00E5FF);
                draw_box(layer, ex + 12, ey + 4, 2, 6, 0xFFFFFF);
                // 大后掠三角主翼
                draw_box(layer, ex + 6, ey + 8, 14, 8, 0x1A3355);
                draw_box(layer, ex + 0, ey + 14, 26, 6, 0x2A4D77);
                // 翼尖红色挂载导弹
                draw_box(layer, ex + 0, ey + 12, 2, 6, 0xFF2233);
                draw_box(layer, ex + 24, ey + 12, 2, 6, 0xFF2233);
                // 双发尾部喷管火光
                draw_box(layer, ex + 9, ey + 22, 3, 2, 0xFF7700);
                draw_box(layer, ex + 14, ey + 22, 3, 2, 0xFF7700);
            } else if (e->type == ENEMY_WYVERN) {
                // 幻翼机械飞龙/生化翼兽 (32x28, 动态扇翅飞行)
                bool flap = (e->anim_tick % 12 < 6);
                // 生化龙首与发光复眼
                draw_box(layer, ex + 13, ey + 2, 6, 12, 0x8822AA);
                draw_box(layer, ex + 14, ey + 4, 4, 4, 0xFF00AA);
                draw_box(layer, ex + 15, ey + 5, 2, 2, 0xFFFFFF);
                // 动态扇动蝠翼
                if (flap) {
                    // 展翅上扬姿态
                    draw_box(layer, ex + 2, ey + 2, 12, 6, 0xAA33CC);
                    draw_box(layer, ex + 18, ey + 2, 12, 6, 0xAA33CC);
                    draw_box(layer, ex + 0, ey + 6, 32, 6, 0x771199);
                } else {
                    // 扑翼下划姿态
                    draw_box(layer, ex + 4, ey + 10, 24, 6, 0xAA33CC);
                    draw_box(layer, ex + 0, ey + 14, 32, 6, 0x771199);
                }
                // 龙尾节肢
                draw_box(layer, ex + 14, ey + 18, 4, 8, 0x661188);
                // 血条
                draw_box(layer, ex + 4, ey - 6, 24, 3, 0x000000);
                if (e->max_hp > 0) {
                    int hp_w = (e->hp * 24) / e->max_hp;
                    if (hp_w > 0) draw_box(layer, ex + 4, ey - 6, hp_w, 3, 0xCC22EE);
                }
            } else if (e->type == ENEMY_FORTRESS) {
                // 空中重装巡洋堡垒 (36x30, 巨舰重甲)
                draw_box(layer, ex + 8, ey + 0, 20, 26, 0x445566);
                draw_box(layer, ex + 2, ey + 8, 32, 14, 0x334455);
                draw_box(layer, ex + 0, ey + 14, 36, 8, 0x223344);
                // 双联旋转重炮口
                draw_box(layer, ex + 10, ey + 24, 4, 6, 0x8899AA);
                draw_box(layer, ex + 22, ey + 24, 4, 6, 0x8899AA);
                // 舰桥能量指示
                draw_box(layer, ex + 14, ey + 10, 8, 6, 0xFFD928);
                // 血条
                draw_box(layer, ex + 6, ey - 6, 24, 3, 0x000000);
                if (e->max_hp > 0) {
                    int hp_w = (e->hp * 24) / e->max_hp;
                    if (hp_w > 0) draw_box(layer, ex + 6, ey - 6, hp_w, 3, 0xFF3344);
                }
            } else {
                // 星海利维坦龙神 BOSS (68x50, 霸气巨龙母舰)
                bool boss_flap = (e->anim_tick % 20 < 10);
                // 巨型龙躯脊梁与生化熔炉核心
                draw_box(layer, ex + 24, ey + 0, 20, 44, 0x331155);
                draw_box(layer, ex + 28, ey + 8, 12, 16, 0xFF0066);
                draw_box(layer, ex + 31, ey + 12, 6, 8, 0xFFFFFF);
                // 龙神巨翼
                if (boss_flap) {
                    draw_box(layer, ex + 4, ey + 8, 60, 16, 0x662288);
                    draw_box(layer, ex + 0, ey + 14, 68, 12, 0x8833BB);
                } else {
                    draw_box(layer, ex + 6, ey + 16, 56, 18, 0x662288);
                    draw_box(layer, ex + 0, ey + 22, 68, 12, 0x8833BB);
                }
                // 龙头主炮与双翼能量晶柱
                draw_box(layer, ex + 28, ey + 36, 12, 10, 0x00FFFF);
                draw_box(layer, ex + 8, ey + 26, 6, 8, 0xFFD928);
                draw_box(layer, ex + 54, ey + 26, 6, 8, 0xFFD928);
            }
        }
    }

    // 5. 敌机子弹 (发光红光球，红外壳 + 亮白内芯)
    for (int i = 0; i < THUNDER_MAX_ENEMY_BULLETS; i++) {
        if (s_game.enemy_bullets[i].active) {
            int bx = (int)s_game.enemy_bullets[i].x + ox;
            int by = (int)s_game.enemy_bullets[i].y + oy;
            int bw = s_game.enemy_bullets[i].w;
            int bh = s_game.enemy_bullets[i].h;
            draw_box(layer, bx - 1, by - 1, bw + 2, bh + 2, 0xFF2255);
            draw_box(layer, bx, by, bw, bh, 0xFFFFFF);
        }
    }

    // 6. 掉落补给道具 [P] [W] [F] [S] [B] [H]
    for (int i = 0; i < THUNDER_MAX_ITEMS; i++) {
        if (s_game.items[i].active) {
            int ix = (int)s_game.items[i].x + ox;
            int iy = (int)s_game.items[i].y + oy;
            uint32_t col = 0xFFFFFF;
            if (s_game.items[i].type == ITEM_TYPE_POWER)  col = 0xFFD928;
            else if (s_game.items[i].type == ITEM_TYPE_WAVE)   col = 0x00FFCC;
            else if (s_game.items[i].type == ITEM_TYPE_FIRE)   col = 0xFF4400;
            else if (s_game.items[i].type == ITEM_TYPE_SHIELD) col = 0x00BFFF;
            else if (s_game.items[i].type == ITEM_TYPE_BOMB)   col = 0xFF2255;
            else if (s_game.items[i].type == ITEM_TYPE_HEAL)   col = 0x33EE55;

            // 白框 + 色块底
            draw_box(layer, ix, iy, 14, 14, 0xFFFFFF);
            draw_box(layer, ix + 2, iy + 2, 10, 10, col);

            // 内部像素字母
            if (s_game.items[i].type == ITEM_TYPE_POWER) { // 'P'
                draw_box(layer, ix + 4, iy + 4, 2, 6, 0x000000);
                draw_box(layer, ix + 6, iy + 4, 3, 2, 0x000000);
                draw_box(layer, ix + 7, iy + 5, 2, 2, 0x000000);
                draw_box(layer, ix + 6, iy + 6, 3, 2, 0x000000);
            } else if (s_game.items[i].type == ITEM_TYPE_WAVE) { // 'W'
                draw_box(layer, ix + 4, iy + 4, 2, 5, 0x000000);
                draw_box(layer, ix + 8, iy + 4, 2, 5, 0x000000);
                draw_box(layer, ix + 6, iy + 6, 2, 3, 0x000000);
            } else if (s_game.items[i].type == ITEM_TYPE_FIRE) { // 'F'
                draw_box(layer, ix + 4, iy + 4, 2, 6, 0x000000);
                draw_box(layer, ix + 6, iy + 4, 3, 2, 0x000000);
                draw_box(layer, ix + 6, iy + 6, 2, 2, 0x000000);
            } else if (s_game.items[i].type == ITEM_TYPE_SHIELD) { // 'S'
                draw_box(layer, ix + 4, iy + 4, 5, 2, 0x000000);
                draw_box(layer, ix + 4, iy + 6, 5, 2, 0x000000);
                draw_box(layer, ix + 4, iy + 8, 5, 2, 0x000000);
                draw_box(layer, ix + 4, iy + 5, 2, 2, 0x000000);
                draw_box(layer, ix + 7, iy + 7, 2, 2, 0x000000);
            } else if (s_game.items[i].type == ITEM_TYPE_BOMB) { // 'B'
                draw_box(layer, ix + 4, iy + 4, 2, 6, 0x000000);
                draw_box(layer, ix + 6, iy + 4, 3, 2, 0x000000);
                draw_box(layer, ix + 6, iy + 6, 3, 2, 0x000000);
                draw_box(layer, ix + 6, iy + 8, 3, 2, 0x000000);
            } else { // 'H'
                draw_box(layer, ix + 4, iy + 4, 2, 6, 0x000000);
                draw_box(layer, ix + 8, iy + 4, 2, 6, 0x000000);
                draw_box(layer, ix + 6, iy + 6, 2, 2, 0x000000);
            }
        }
    }

    // 7. 爆炸碎屑与火花粒子
    for (int i = 0; i < THUNDER_MAX_PARTICLES; i++) {
        if (s_game.particles[i].life > 0) {
            int px = (int)s_game.particles[i].x + ox;
            int py = (int)s_game.particles[i].y + oy;
            int ps = s_game.particles[i].size;
            draw_box(layer, px, py, ps, ps, s_game.particles[i].color);
        }
    }

    // 8. 顶部半透 HUD 背景栏
    draw_box(layer, 0, 0, SCREEN_W, 22, 0x050812);

    // 8.1 玩家红心生命绘制 (在 HUD 中间动态居中)
    int heart_pitch = 10;
    int total_heart_w = s_game.player_max_hp * heart_pitch - 3;
    int start_heart_x = (SCREEN_W - total_heart_w) / 2;
    for (int h = 0; h < s_game.player_max_hp; h++) {
        draw_heart(layer, start_heart_x + h * heart_pitch, 8, h < s_game.player_hp);
    }

    // 8.2 武器强化法宝限时倒计时条 (满格 300 ticks = 10 秒，实时倒计时)
    if (s_game.buff_timer > 0) {
        int bar_max_w = 56;
        int bar_w = (s_game.buff_timer * bar_max_w) / 300;
        uint32_t buff_col = (s_game.weapon_style == WEAPON_STYLE_FIRE) ? 0xFF3300 :
                            ((s_game.weapon_style == WEAPON_STYLE_WAVE) ? 0x00FFCC : 0xFFD928);
        draw_box(layer, (SCREEN_W - bar_max_w) / 2, 20, bar_max_w, 3, 0x112233);
        if (bar_w > 0) {
            draw_box(layer, (SCREEN_W - bar_max_w) / 2, 20, bar_w, 3, buff_col);
        }
    }

    // 8.3 BOSS 预警血条
    if (s_game.boss_active && s_game.boss_idx >= 0 && s_game.enemies[s_game.boss_idx].active) {
        enemy_t *b = &s_game.enemies[s_game.boss_idx];
        draw_box(layer, 20, 26, 200, 8, 0x000000);
        if (b->max_hp > 0) {
            int bar_w = (b->hp * 196) / b->max_hp;
            if (bar_w > 0) draw_box(layer, 22, 28, bar_w, 4, 0xFF0055);
        }
    }

    // 9. 底部半透明操作提示栏
    draw_box(layer, 0, 302, SCREEN_W, 18, 0x050812);
}

static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;

    if (!s_game.game_over) {
        thunder_step(&s_game);

        if (s_flash_timer > 0) s_flash_timer--;

        // 音频事件派发
        if (s_game.snd_explode_big) {
            send_sound(SND_EXPLODE_BIG);
        } else if (s_game.snd_explode) {
            send_sound(SND_EXPLODE);
        }

        if (s_game.snd_laser) send_sound(SND_LASER);
        if (s_game.snd_wave) send_sound(SND_WAVE);
        if (s_game.snd_fire) send_sound(SND_FIRE);
        if (s_game.snd_shield) send_sound(SND_SHIELD);
        if (s_game.snd_pause) send_sound(SND_PAUSE);
        if (s_game.snd_hit) send_sound(SND_HIT);
        if (s_game.snd_powerup) send_sound(SND_POWERUP);

        // 长按平滑极速移动 (无需反复抬手点击，按住持续滑行)
        if (!s_game.paused) {
            int mv = bsp_button_read_mv();
            if (mv >= 0 && mv < 150) { // 按住 UP 键
                s_up_hold_ticks++;
                if (s_up_hold_ticks > 4) { // 按住超 120ms 开始持续平滑滑行
                    thunder_move_left(&s_game);
                }
            } else {
                s_up_hold_ticks = 0;
            }

            if (mv >= 150 && mv < 447) { // 按住 DOWN 键
                s_down_hold_ticks++;
                if (s_down_hold_ticks > 4) { // 按住超 120ms 开始持续平滑滑行
                    thunder_move_right(&s_game);
                }
            } else {
                s_down_hold_ticks = 0;
            }
        }

        // 暂停状态控制弹窗显隐与音量刷新
        if (s_pause_box) {
            if (s_game.paused) {
                lv_obj_remove_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
                if (s_pause_vol_label) {
                    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
                }
            } else {
                lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
        }

        // 仅在值变动时刷新 HUD 文本，消除不必要的布局开销
        if (s_game.score != s_last_score) {
            s_last_score = s_game.score;
            lv_label_set_text_fmt(s_hud_score, "SCORE:%d", s_game.score);
        }
        if (s_game.bombs != s_last_bomb) {
            s_last_bomb = s_game.bombs;
            lv_label_set_text_fmt(s_hud_bomb, "BOMB:x%d", s_game.bombs);
        }

        if (s_game.boss_active != s_last_boss) {
            s_last_boss = s_game.boss_active;
            if (s_game.boss_active) {
                lv_obj_remove_flag(s_hud_boss, LV_OBJ_FLAG_HIDDEN);
            } else {
                lv_obj_add_flag(s_hud_boss, LV_OBJ_FLAG_HIDDEN);
            }
        }

        if (s_game.game_over) {
            send_sound(SND_GAMEOVER);
            lv_label_set_text_fmt(s_gameover_score, "FINAL SCORE: %d", s_game.score);
            lv_obj_remove_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);
        }
    }

    // 触发画布重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

void demo_thunder_enter(void)
{
    thunder_init(&s_game);
    s_flash_timer = 0;
    s_last_score = -1;
    s_last_bomb = -1;
    s_last_boss = false;

    // 音频任务与队列
    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(8, sizeof(thunder_snd_t));
        xTaskCreate(thunder_audio_task, "thunder_snd", 3072, NULL, 5, &s_snd_task);
    }

    s_scr = lv_obj_create(NULL);
    lv_obj_remove_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x080C16), 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);

    // 1. 全屏游戏主画板 (240x320)
    s_playfield = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_playfield);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_add_event_cb(s_playfield, on_playfield_draw, LV_EVENT_DRAW_MAIN, NULL);

    // 2. HUD 顶栏标签
    s_hud_score = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_score, 6, 4);
    lv_label_set_text(s_hud_score, "SCORE:0");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xFFFFFF), 0);

    s_hud_bomb = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_bomb, 172, 4);
    lv_label_set_text(s_hud_bomb, "BOMB:x2");
    lv_obj_set_style_text_font(s_hud_bomb, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_bomb, lv_color_hex(0x00E5FF), 0);

    s_hud_boss = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_boss, 46, 22);
    lv_label_set_text(s_hud_boss, "WARNING: CYBER BOSS");
    lv_obj_set_style_text_font(s_hud_boss, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_boss, lv_color_hex(0xFF0055), 0);
    lv_obj_add_flag(s_hud_boss, LV_OBJ_FLAG_HIDDEN);

    // 3. 底部按键操作提示 (清晰明了)
    s_hud_hints = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_hints, 0, 303);
    lv_obj_set_size(s_hud_hints, 240, 16);
    lv_obj_set_style_text_align(s_hud_hints, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_hud_hints, "UP:L  DN:R  HOLD:RUN  OK:BOMB");
    lv_obj_set_style_text_font(s_hud_hints, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hints, lv_color_hex(0xFFD928), 0);

    // 4. GAME OVER 结算遮罩容器
    s_gameover_box = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_gameover_box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(s_gameover_box, 200, 140);
    lv_obj_center(s_gameover_box);
    lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(s_gameover_box, LV_OPA_80, 0);
    lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xFF3344), 0);
    lv_obj_set_style_border_width(s_gameover_box, 2, 0);
    lv_obj_set_style_radius(s_gameover_box, 10, 0);

    lv_obj_t *title = lv_label_create(s_gameover_box);
    lv_label_set_text(title, "MISSION FAILED");
    lv_obj_set_style_text_color(title, lv_color_hex(0xFF3344), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 10);

    s_gameover_score = lv_label_create(s_gameover_box);
    lv_label_set_text(s_gameover_score, "FINAL SCORE: 0");
    lv_obj_set_style_text_color(s_gameover_score, lv_color_hex(0xFFD928), 0);
    lv_obj_set_style_text_font(s_gameover_score, &lv_font_montserrat_14, 0);
    lv_obj_align(s_gameover_score, LV_ALIGN_CENTER, 0, -6);

    lv_obj_t *hint = lv_label_create(s_gameover_box);
    lv_label_set_text(hint, "PRESS [OK] RETRY");
    lv_obj_set_style_text_color(hint, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(hint, &lv_font_montserrat_14, 0);
    lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -10);

    lv_obj_add_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);

    // 5. 暂停面板遮罩容器
    s_pause_box = lv_obj_create(s_scr);
    lv_obj_remove_flag(s_pause_box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(s_pause_box, 204, 136);
    lv_obj_center(s_pause_box);
    lv_obj_set_style_bg_color(s_pause_box, lv_color_hex(0x050814), 0);
    lv_obj_set_style_bg_opa(s_pause_box, LV_OPA_90, 0);
    lv_obj_set_style_border_color(s_pause_box, lv_color_hex(0x00E5FF), 0);
    lv_obj_set_style_border_width(s_pause_box, 2, 0);
    lv_obj_set_style_radius(s_pause_box, 10, 0);

    lv_obj_t *p_title = lv_label_create(s_pause_box);
    lv_label_set_text(p_title, "GAME PAUSED");
    lv_obj_set_style_text_color(p_title, lv_color_hex(0x00E5FF), 0);
    lv_obj_set_style_text_font(p_title, &lv_font_montserrat_14, 0);
    lv_obj_align(p_title, LV_ALIGN_TOP_MID, 0, 8);

    s_pause_vol_label = lv_label_create(s_pause_box);
    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
    lv_obj_set_style_text_color(s_pause_vol_label, lv_color_hex(0xFFD928), 0);
    lv_obj_set_style_text_font(s_pause_vol_label, &lv_font_montserrat_14, 0);
    lv_obj_align(s_pause_vol_label, LV_ALIGN_CENTER, 0, -10);

    lv_obj_t *p_vol_hint = lv_label_create(s_pause_box);
    lv_label_set_text(p_vol_hint, "UP: VOL+   DN: VOL-");
    lv_obj_set_style_text_color(p_vol_hint, lv_color_hex(0xAAAAAA), 0);
    lv_obj_set_style_text_font(p_vol_hint, &lv_font_montserrat_14, 0);
    lv_obj_align(p_vol_hint, LV_ALIGN_CENTER, 0, 12);

    lv_obj_t *p_hint = lv_label_create(s_pause_box);
    lv_label_set_text(p_hint, "PRESS [OK] RESUME");
    lv_obj_set_style_text_color(p_hint, lv_color_hex(0x00FFCC), 0);
    lv_obj_set_style_text_font(p_hint, &lv_font_montserrat_14, 0);
    lv_obj_align(p_hint, LV_ALIGN_BOTTOM_MID, 0, -6);

    lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);

    s_game_timer = lv_timer_create(game_timer_cb, 30, NULL);
    lv_screen_load(s_scr);
}

void demo_thunder_exit(void)
{
    if (s_game_timer) {
        lv_timer_delete(s_game_timer);
        s_game_timer = NULL;
    }
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
        s_playfield = s_hud_score = s_hud_bomb = s_hud_boss = s_hud_hints = s_gameover_box = s_gameover_score = s_pause_box = s_pause_vol_label = NULL;
    }
}

void demo_thunder_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 游戏结束状态
    if (s_game.game_over) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            thunder_init(&s_game);
            s_flash_timer = 0;
            s_last_score = -1;
            s_last_bomb = -1;
            s_last_boss = false;
            if (s_gameover_box) {
                lv_obj_add_flag(s_gameover_box, LV_OBJ_FLAG_HIDDEN);
            }
        }
        return;
    }

    // 暂停设置状态：UP/DOWN 调音量，OK 恢复游戏
    if (s_game.paused) {
        if (btn == BSP_BTN_UP && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume <= 90) s_volume += 10; else s_volume = 100;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
            send_sound(SND_HIT);
        } else if (btn == BSP_BTN_DOWN && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume >= 10) s_volume -= 10; else s_volume = 0;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
            send_sound(SND_HIT);
        } else if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_DOUBLE)) {
            thunder_toggle_pause(&s_game);
            if (s_pause_box) {
                lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
            send_sound(SND_PAUSE);
        }
        return;
    }

    // 正常战斗进行中
    // OK 键：双击暂停；单击核弹
    if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_DOUBLE) {
            thunder_toggle_pause(&s_game);
            if (s_pause_box) {
                if (s_pause_vol_label) {
                    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
                }
                lv_obj_remove_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
            send_sound(SND_PAUSE);
        } else if (ev == BSP_BTN_CLICK) {
            if (thunder_use_bomb(&s_game)) {
                s_flash_timer = 3;
                send_sound(SND_BOMB);
            }
        }
        return;
    }

    // UP 键：按一次即刻向左移动 (0ms 延迟响应，长按持续连移在 timer_cb 中处理)
    if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS) {
            thunder_move_left(&s_game);
        }
    }
    // DOWN 键：按一次即刻向右移动 (0ms 延迟响应，长按持续连移在 timer_cb 中处理)
    else if (btn == BSP_BTN_DOWN) {
        if (ev == BSP_BTN_PRESS) {
            thunder_move_right(&s_game);
        }
    }
}
