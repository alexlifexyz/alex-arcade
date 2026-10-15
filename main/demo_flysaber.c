// main/demo_flysaber.c —— 《果蝇光剑：神经反射》(FlySaber: 140K Synapse Reflex)
#include "demo.h"
#include "flysaber_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_flysaber";

static flysaber_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_hud_score;
static lv_obj_t *s_hud_sync;
static lv_obj_t *s_hud_neuro;
static lv_obj_t *s_canvas;
static lv_obj_t *s_guide_label;
static lv_timer_t *s_game_timer;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_snd_task;

// 240x250 画布缓冲 (RGB565)
#define CANVAS_W 240
#define CANVAS_H 250
#define CANVAS_BUF_SIZE (CANVAS_W * CANVAS_H * 2)
static uint8_t s_canvas_buf[CANVAS_BUF_SIZE];

static void send_sound(flysaber_snd_t snd)
{
    if (s_snd_queue && snd != FLYSABER_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

static void flysaber_audio_task(void *arg)
{
    (void)arg;
    flysaber_snd_t snd;
    int16_t buf[256];

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == FLYSABER_SND_NONE) continue;
            bsp_audio_set_format(16000, 16, 1);
            bsp_audio_set_volume(90);

            if (snd == FLYSABER_SND_SLASH_BLUE) {
                // 左刀蓝光高频挥砍风声 (1200Hz -> 600Hz 快速下扫)
                for (int i = 0; i < 140; i++) {
                    int period = 13 + (i * 14 / 140);
                    buf[i] = (i % period < period / 2) ? 4500 : -4500;
                }
                bsp_audio_write(buf, 140 * sizeof(int16_t));
            } else if (snd == FLYSABER_SND_SLASH_RED) {
                // 右刀红光低沉挥砍风声 (800Hz -> 350Hz 下扫)
                for (int i = 0; i < 150; i++) {
                    int period = 20 + (i * 25 / 150);
                    buf[i] = (i % period < period / 2) ? 5000 : -5000;
                }
                bsp_audio_write(buf, 150 * sizeof(int16_t));
            } else if (snd == FLYSABER_SND_HIT_PERFECT) {
                // 完美晶体切中：双音谐波共鸣 (880Hz + 1760Hz 玻璃质感)
                for (int i = 0; i < 200; i++) {
                    int amp = 6000 - i * 28;
                    int16_t s1 = (i % 18 < 9) ? amp : -amp;
                    int16_t s2 = (i % 9 < 4) ? (amp / 2) : (-amp / 2);
                    buf[i] = (s1 + s2) / 2;
                }
                bsp_audio_write(buf, 200 * sizeof(int16_t));
            } else if (snd == FLYSABER_SND_HIT_GOOD) {
                // 普通切中音
                for (int i = 0; i < 100; i++) {
                    int amp = 5000 - i * 40;
                    buf[i] = (i % 14 < 7) ? amp : -amp;
                }
                bsp_audio_write(buf, 100 * sizeof(int16_t));
            } else if (snd == FLYSABER_SND_MISS) {
                // 突触失同步蜂鸣 (低频短路杂音)
                for (int i = 0; i < 160; i++) {
                    buf[i] = (i % 60 < 30) ? 4500 : -4500;
                }
                bsp_audio_write(buf, 160 * sizeof(int16_t));
            } else if (snd == FLYSABER_SND_OVERDRIVE) {
                // 神经超频激活：升调琶音爆发 (440 -> 660 -> 880 -> 1320Hz)
                int freqs[] = { 440, 660, 880, 1320 };
                for (int f = 0; f < 4; f++) {
                    int period = 16000 / freqs[f];
                    for (int i = 0; i < 150; i++) {
                        buf[i] = (i % period < period / 2) ? 6500 : -6500;
                    }
                    bsp_audio_write(buf, 150 * sizeof(int16_t));
                    vTaskDelay(pdMS_TO_TICKS(25));
                }
            } else if (snd == FLYSABER_SND_GAMEOVER) {
                // 神经连接断开
                int freqs[] = { 493, 440, 392, 330 };
                for (int f = 0; f < 4; f++) {
                    int period = 16000 / freqs[f];
                    for (int i = 0; i < 200; i++) {
                        buf[i] = (i % period < period / 2) ? 5500 : -5500;
                    }
                    bsp_audio_write(buf, 200 * sizeof(int16_t));
                    vTaskDelay(pdMS_TO_TICKS(50));
                }
            }
        }
    }
}

static void draw_rect_canvas(int x, int y, int w, int h, lv_color_t color)
{
    if (x >= CANVAS_W || y >= CANVAS_H || w <= 0 || h <= 0) return;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > CANVAS_W) w = CANVAS_W - x;
    if (y + h > CANVAS_H) h = CANVAS_H - y;
    if (w <= 0 || h <= 0) return;

    lv_layer_t layer;
    lv_canvas_init_layer(s_canvas, &layer);
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = color;
    dsc.border_width = 0;
    dsc.radius = 0;

    lv_area_t coords;
    coords.x1 = x;
    coords.y1 = y;
    coords.x2 = x + w - 1;
    coords.y2 = y + h - 1;

    lv_draw_rect(&layer, &dsc, &coords);
    lv_canvas_finish_layer(s_canvas, &layer);
}

static void render_flysaber_scene(void)
{
    if (!s_canvas) return;

    // 1. 背景清屏 (深空视神经隧道黑 / 超频金光网格)
    lv_color_t bg_col = s_game.is_overdrive ? lv_color_hex(0x1B1404) : lv_color_hex(0x070611);
    lv_canvas_fill_bg(s_canvas, bg_col, LV_OPA_COVER);

    // 2. 绘制 3D 透视隧道引导线与纵深脉冲环
    lv_color_t grid_col = s_game.is_overdrive ? lv_color_hex(0x664400) : lv_color_hex(0x1A1B30);
    lv_color_t track_blue = s_game.is_overdrive ? lv_color_hex(0x886611) : lv_color_hex(0x003366);
    lv_color_t track_red = s_game.is_overdrive ? lv_color_hex(0x995511) : lv_color_hex(0x661122);

    // 远小近大的两道主要光轨底线
    for (int step = 0; step < 16; step++) {
        float p = (float)step / 16.0f;
        int lx, ly, rx, ry, cx, cy;
        flysaber_calc_pos(p, FLYSABER_LANE_LEFT, &lx, &ly, NULL, NULL);
        flysaber_calc_pos(p, FLYSABER_LANE_RIGHT, &rx, &ry, NULL, NULL);
        flysaber_calc_pos(p, FLYSABER_LANE_CENTER, &cx, &cy, NULL, NULL);

        draw_rect_canvas(lx - 1, ly, 3, 2, track_blue);
        draw_rect_canvas(rx - 1, ry, 3, 2, track_red);
        draw_rect_canvas(cx, cy, 2, 2, grid_col);
    }

    // 飞驰向前的横向深度环
    int ring_offset = (s_game.tick_count * 2) % 36;
    for (int r = 0; r < 4; r++) {
        float p = (float)(r * 36 + ring_offset) / 144.0f;
        if (p >= 0.05f && p <= 1.0f) {
            int y = (int)(FLYSABER_VP_Y + p * p * (FLYSABER_DEST_Y - FLYSABER_VP_Y));
            int span = (int)(20 + p * 180);
            int start_x = 120 - span / 2;
            draw_rect_canvas(start_x, y, span, 1, grid_col);
        }
    }

    // 3. 判定击打线 (Strike Laser Zone)
    int strike_y = 196;
    draw_rect_canvas(20, strike_y, 200, 2, lv_color_hex(0x334466));
    // 左轨蓝色判定靶点 (UP)
    draw_rect_canvas(42, strike_y - 2, 26, 6, lv_color_hex(0x00AACC));
    draw_rect_canvas(44, strike_y - 1, 22, 4, lv_color_hex(0x00E5FF));
    // 右轨红色判定靶点 (DOWN)
    draw_rect_canvas(172, strike_y - 2, 26, 6, lv_color_hex(0xCC2244));
    draw_rect_canvas(174, strike_y - 1, 22, 4, lv_color_hex(0xFF3366));
    // 中轨双刀核心靶点 (OK)
    draw_rect_canvas(109, strike_y - 2, 22, 6, lv_color_hex(0xAA00DD));
    draw_rect_canvas(111, strike_y - 1, 18, 4, lv_color_hex(0xFFD700));

    // 4. 绘制迎面袭来的方块
    for (int i = 0; i < FLYSABER_MAX_BLOCKS; i++) {
        if (!s_game.blocks[i].active || s_game.blocks[i].sliced) continue;

        flysaber_block_t *b = &s_game.blocks[i];
        int bx, by, bw, bh;
        flysaber_calc_pos(b->progress, b->lane, &bx, &by, &bw, &bh);

        if (b->type == FLYSABER_BLOCK_BLUE) {
            // 蓝色方块 (带高亮边框与立体侧面)
            draw_rect_canvas(bx, by, bw, bh, lv_color_hex(0x0055AA));
            draw_rect_canvas(bx + 1, by + 1, bw - 2, bh - 2, lv_color_hex(0x00E5FF));
            // 内部白色劈砍箭头向右
            if (bw > 10 && bh > 8) {
                draw_rect_canvas(bx + bw / 2 - 2, by + bh / 2 - 1, 4, 2, lv_color_hex(0xFFFFFF));
            }
        } else if (b->type == FLYSABER_BLOCK_RED) {
            // 红色方块
            draw_rect_canvas(bx, by, bw, bh, lv_color_hex(0x991122));
            draw_rect_canvas(bx + 1, by + 1, bw - 2, bh - 2, lv_color_hex(0xFF2255));
            // 内部白色劈砍箭头向左
            if (bw > 10 && bh > 8) {
                draw_rect_canvas(bx + bw / 2 - 2, by + bh / 2 - 1, 4, 2, lv_color_hex(0xFFFFFF));
            }
        } else if (b->type == FLYSABER_BLOCK_DUAL) {
            // 紫金双色核心
            draw_rect_canvas(bx, by, bw, bh, lv_color_hex(0xD000FF));
            draw_rect_canvas(bx + 2, by + 2, bw - 4, bh - 4, lv_color_hex(0xFFD700));
        } else if (b->type == FLYSABER_BLOCK_SPIKE) {
            // 危险尖刺障碍 (黑黄警示)
            draw_rect_canvas(bx, by, bw, bh, lv_color_hex(0xFF9900));
            draw_rect_canvas(bx + 2, by + 2, bw - 4, bh - 4, lv_color_hex(0x111111));
            if (bw > 8 && bh > 6) {
                draw_rect_canvas(bx + bw / 2 - 1, by + 2, 2, bh - 4, lv_color_hex(0xFF0000));
            }
        }
    }

    // 5. 绘制粒子飞溅
    for (int i = 0; i < FLYSABER_MAX_PARTICLES; i++) {
        if (s_game.particles[i].active) {
            flysaber_particle_t *p = &s_game.particles[i];
            draw_rect_canvas((int)p->x, (int)p->y, 3, 3, lv_color_hex(p->color));
        }
    }

    // 6. 绘制角色：机械果蝇机甲 (Drosophila Cyber Drone)
    if (!s_game.game_over) {
        int fx = 120;
        int fy = 216;

        // 高频振翅 (偶数帧与奇数帧小幅偏移)
        int wing_offset = (s_game.tick_count % 2 == 0) ? -2 : 1;
        // 左翼 (微透光蓝)
        draw_rect_canvas(fx - 24, fy - 6 + wing_offset, 18, 5, lv_color_hex(0x0088BB));
        draw_rect_canvas(fx - 20, fy - 8 + wing_offset, 12, 3, lv_color_hex(0x00E5FF));
        // 右翼 (微透光红)
        draw_rect_canvas(fx + 6, fy - 6 + wing_offset, 18, 5, lv_color_hex(0xBB2244));
        draw_rect_canvas(fx + 8, fy - 8 + wing_offset, 12, 3, lv_color_hex(0xFF3366));

        // 胸节与腹部
        draw_rect_canvas(fx - 6, fy - 3, 12, 14, lv_color_hex(0x334455));
        draw_rect_canvas(fx - 4, fy + 11, 8, 10, lv_color_hex(0x223040));
        // 头部
        draw_rect_canvas(fx - 5, fy - 9, 10, 6, lv_color_hex(0x445566));

        // 果蝇复眼 (双目光谱传感器 R7·蓝 / R8·红)
        draw_rect_canvas(fx - 8, fy - 9, 4, 6, lv_color_hex(0x00E5FF));
        draw_rect_canvas(fx + 4, fy - 9, 4, 6, lv_color_hex(0xFF2255));

        // 等离子光剑 (左蓝右红)
        if (s_game.slash_left_timer > 0) {
            // 左刀大幅度横扫弧光
            draw_rect_canvas(fx - 58, fy - 26, 44, 4, lv_color_hex(0x00E5FF));
            draw_rect_canvas(fx - 48, fy - 22, 36, 5, lv_color_hex(0xFFFFFF));
            draw_rect_canvas(fx - 36, fy - 16, 26, 6, lv_color_hex(0x00AACC));
        } else {
            // 常态左刀微抬
            draw_rect_canvas(fx - 18, fy - 14, 4, 12, lv_color_hex(0x00E5FF));
            draw_rect_canvas(fx - 22, fy - 22, 5, 10, lv_color_hex(0x00CCFF));
        }

        if (s_game.slash_right_timer > 0) {
            // 右刀大幅度横扫弧光
            draw_rect_canvas(fx + 14, fy - 26, 44, 4, lv_color_hex(0xFF2255));
            draw_rect_canvas(fx + 12, fy - 22, 36, 5, lv_color_hex(0xFFFFFF));
            draw_rect_canvas(fx + 10, fy - 16, 26, 6, lv_color_hex(0xCC2244));
        } else {
            // 常态右刀微抬
            draw_rect_canvas(fx + 14, fy - 14, 4, 12, lv_color_hex(0xFF2255));
            draw_rect_canvas(fx + 17, fy - 22, 5, 10, lv_color_hex(0xFF4477));
        }

        // 双刀合击 X 交叉爆发光效
        if (s_game.slash_dual_timer > 0) {
            draw_rect_canvas(fx - 20, fy - 28, 40, 6, lv_color_hex(0xFFD700));
            draw_rect_canvas(fx - 14, fy - 34, 28, 16, lv_color_hex(0xD000FF));
            draw_rect_canvas(fx - 4, fy - 38, 8, 24, lv_color_hex(0xFFFFFF));
        }
    }

    // 7. 神经超频提示条
    if (s_game.is_overdrive) {
        if ((s_game.tick_count / 3) % 2 == 0) {
            draw_rect_canvas(40, 24, 160, 16, lv_color_hex(0xFFD700));
        }
    }
}

static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;

    if (!s_game.game_over) {
        flysaber_step(&s_game);

        // 处理音效队列
        if (s_game.pending_snd != FLYSABER_SND_NONE) {
            send_sound(s_game.pending_snd);
            s_game.pending_snd = FLYSABER_SND_NONE;
        }

        // 刷新顶部 HUD
        lv_label_set_text_fmt(s_hud_score, "SCORE:%d", s_game.score);

        // 突触同步率与复苏条数 (HP & LIVES)
        lv_label_set_text_fmt(s_hud_sync, "HP:%d%% x%d", s_game.sync_hp, s_game.lives);
        lv_color_t sync_col = (s_game.sync_hp > 50) ? lv_color_hex(0x33FF66) :
                              ((s_game.sync_hp > 25) ? lv_color_hex(0xFFAA00) : lv_color_hex(0xFF3333));
        lv_obj_set_style_text_color(s_hud_sync, sync_col, 0);

        // 神经电位 (NEURO / OVERDRIVE)
        if (s_game.is_overdrive) {
            lv_label_set_text(s_hud_neuro, "BURST 3x!");
            lv_obj_set_style_text_color(s_hud_neuro, lv_color_hex(0xFFD700), 0);
        } else if (s_game.overdrive_gauge >= 100) {
            lv_label_set_text(s_hud_neuro, "[OK] READY");
            lv_obj_set_style_text_color(s_hud_neuro, lv_color_hex(0xFFD700), 0);
        } else {
            lv_label_set_text_fmt(s_hud_neuro, "AP:%d%%", s_game.overdrive_gauge);
            lv_obj_set_style_text_color(s_hud_neuro, lv_color_hex(0x00E5FF), 0);
        }

        // 底部提示根据连击与判定变化
        if (s_game.hit_result_timer > 0) {
            if (s_game.last_hit_result == FLYSABER_HIT_PERFECT) {
                lv_label_set_text_fmt(s_guide_label, ">> PERFECT REFLEX! << COMBO x%d", s_game.combo);
                lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFFD700), 0);
            } else if (s_game.last_hit_result == FLYSABER_HIT_GOOD) {
                lv_label_set_text_fmt(s_guide_label, "GOOD HIT! COMBO x%d", s_game.combo);
                lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x33FF66), 0);
            } else if (s_game.last_hit_result == FLYSABER_HIT_MISS) {
                lv_label_set_text(s_guide_label, "SYNAPSE MISS! COMBO BROKEN");
                lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFF4444), 0);
            } else if (s_game.last_hit_result == FLYSABER_HIT_WRONG) {
                lv_label_set_text(s_guide_label, "WRONG COLOR! R7/R8 MISMATCH");
                lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFF2255), 0);
            } else if (s_game.last_hit_result == FLYSABER_HIT_SPIKE) {
                lv_label_set_text(s_guide_label, "HAZARD SPIKE HIT! AVOID SPIKES");
                lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFFAA00), 0);
            }
        } else {
            lv_label_set_text(s_guide_label, "UP: BLUE (R7) | DOWN: RED (R8)\nOK: DUAL / OVERDRIVE");
            lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x00E5FF), 0);
        }

        if (s_game.game_over) {
            send_sound(FLYSABER_SND_GAMEOVER);
            lv_label_set_text(s_guide_label, "140K SYNAPSE LOST! PRESS [OK] RETRY");
            lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFF3333), 0);
        }
    }

    render_flysaber_scene();
}

void demo_flysaber_enter(void)
{
    flysaber_init(&s_game);

    // 启动音频合成任务
    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(8, sizeof(flysaber_snd_t));
        xTaskCreate(flysaber_audio_task, "flysaber_snd", 3072, NULL, 5, &s_snd_task);
    }

    s_scr = lv_obj_create(NULL);
    lv_obj_remove_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x070611), 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);

    // 1. 顶部 HUD
    s_hud_score = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_score, 6, 6);
    lv_label_set_text(s_hud_score, "SCORE:0");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xFFFFFF), 0);

    s_hud_sync = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_sync, 96, 6);
    lv_label_set_text(s_hud_sync, "SYNC:100%");
    lv_obj_set_style_text_font(s_hud_sync, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_sync, lv_color_hex(0x33FF66), 0);

    s_hud_neuro = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_neuro, 172, 6);
    lv_label_set_text(s_hud_neuro, "AP:0%");
    lv_obj_set_style_text_font(s_hud_neuro, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_neuro, lv_color_hex(0x00E5FF), 0);

    // 2. 游戏画布 (240 x 250)
    s_canvas = lv_canvas_create(s_scr);
    lv_canvas_set_buffer(s_canvas, s_canvas_buf, CANVAS_W, CANVAS_H, LV_COLOR_FORMAT_RGB565);
    lv_obj_set_pos(s_canvas, 0, 26);

    // 3. 底部指南
    s_guide_label = lv_label_create(s_scr);
    lv_obj_set_pos(s_guide_label, 0, 282);
    lv_obj_set_size(s_guide_label, 240, 36);
    lv_obj_set_style_text_align(s_guide_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(s_guide_label, &lv_font_montserrat_14, 0);
    lv_label_set_text(s_guide_label, "UP: BLUE (R7) | DOWN: RED (R8)\nOK: DUAL / OVERDRIVE");
    lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x00E5FF), 0);

    s_game_timer = lv_timer_create(game_timer_cb, 35, NULL); // ~28 FPS 高速刷新
    lv_screen_load(s_scr);
}

void demo_flysaber_exit(void)
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
        s_hud_score = s_hud_sync = s_hud_neuro = s_canvas = s_guide_label = NULL;
    }
}

void demo_flysaber_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) return;

    if (s_game.game_over) {
        if (btn == BSP_BTN_OK) {
            demo_flysaber_enter();
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        flysaber_slash_left(&s_game);
    } else if (btn == BSP_BTN_DOWN) {
        flysaber_slash_right(&s_game);
    } else if (btn == BSP_BTN_OK) {
        flysaber_slash_dual(&s_game);
    }
}
