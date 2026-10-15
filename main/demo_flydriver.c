// main/demo_flydriver.c —— 《果蝇视流超跑：光流极速》(FlyDriver: Optic Flow Turbo)
#include "demo.h"
#include "flydriver_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_flydriver";

static flydriver_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_hud_spd;
static lv_obj_t *s_hud_shield;
static lv_obj_t *s_hud_nitro;
static lv_obj_t *s_canvas;
static lv_obj_t *s_guide_label;
static lv_timer_t *s_game_timer;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_snd_task;

#define CANVAS_W 240
#define CANVAS_H 250
#define CANVAS_BUF_SIZE (CANVAS_W * CANVAS_H * 2)
static uint8_t s_canvas_buf[CANVAS_BUF_SIZE];

static void send_sound(flydriver_snd_t snd)
{
    if (s_snd_queue && snd != FLYDRIVER_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

static void flydriver_audio_task(void *arg)
{
    (void)arg;
    flydriver_snd_t snd;
    int16_t buf[256];

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == FLYDRIVER_SND_NONE) continue;
            bsp_audio_set_format(16000, 16, 1);
            bsp_audio_set_volume(90);

            if (snd == FLYDRIVER_SND_DRIFT) {
                // 轮胎摩擦/气动微喷 (白噪声切音)
                for (int i = 0; i < 100; i++) {
                    buf[i] = (int16_t)(((rand() % 65536) - 32768) * 3500 / 32768);
                }
                bsp_audio_write(buf, 100 * sizeof(int16_t));
            } else if (snd == FLYDRIVER_SND_NEARMISS) {
                // 极限超车多普勒呼啸 (快速升降频 900Hz -> 450Hz)
                for (int i = 0; i < 160; i++) {
                    int period = 18 + (i * 18 / 160);
                    buf[i] = (i % period < period / 2) ? 4500 : -4500;
                }
                bsp_audio_write(buf, 160 * sizeof(int16_t));
            } else if (snd == FLYDRIVER_SND_BOOST_PAD) {
                // 踩上加速带清脆提示音
                int freqs[] = { 659, 880, 1318 };
                for (int f = 0; f < 3; f++) {
                    int period = 16000 / freqs[f];
                    for (int i = 0; i < 80; i++) {
                        buf[i] = (i % period < period / 2) ? 5500 : -5500;
                    }
                    bsp_audio_write(buf, 80 * sizeof(int16_t));
                }
            } else if (snd == FLYDRIVER_SND_NITRO) {
                // 氮气爆发喷气爆音
                for (int i = 0; i < 240; i++) {
                    int amp = 7500 - i * 25;
                    buf[i] = (int16_t)(((rand() % 65536) - 32768) * amp / 32768);
                }
                bsp_audio_write(buf, 240 * sizeof(int16_t));
            } else if (snd == FLYDRIVER_SND_CRASH) {
                // 碰撞金属震荡
                for (int i = 0; i < 200; i++) {
                    int period = 24 + (rand() % 16);
                    buf[i] = (i % period < period / 2) ? 6000 : -6000;
                }
                bsp_audio_write(buf, 200 * sizeof(int16_t));
            } else if (snd == FLYDRIVER_SND_GAMEOVER) {
                // 引擎熄火悲伤音调
                int freqs[] = { 349, 293, 246, 196 };
                for (int f = 0; f < 4; f++) {
                    int period = 16000 / freqs[f];
                    for (int i = 0; i < 180; i++) {
                        buf[i] = (i % period < period / 2) ? 5000 : -5000;
                    }
                    bsp_audio_write(buf, 180 * sizeof(int16_t));
                    vTaskDelay(pdMS_TO_TICKS(40));
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

static void render_flydriver_scene(void)
{
    if (!s_canvas) return;

    // 1. 天空与远景地平线 (赛博深紫黑夜 / 碰撞红闪)
    lv_color_t sky_col = (s_game.crash_flash > 0) ? lv_color_hex(0x551111) :
                         (s_game.nitro_active ? lv_color_hex(0x180D2B) : lv_color_hex(0x060814));
    lv_canvas_fill_bg(s_canvas, sky_col, LV_OPA_COVER);

    // 远景地平线网格
    draw_rect_canvas(0, 24, 240, 1, lv_color_hex(0x334466));

    // 2. 伪 3D 赛道梯形与动态斑马线路面
    // 细分成 18 个深度层级
    int num_segments = 18;
    for (int seg = num_segments - 1; seg >= 0; seg--) {
        float z = (float)seg / (float)num_segments;
        float depth = 1.0f - z;
        int y = (int)(25.0f + depth * depth * (215.0f - 25.0f));
        int next_y = (int)(25.0f + (depth + 1.0f / num_segments) * (depth + 1.0f / num_segments) * (215.0f - 25.0f));
        int seg_h = next_y - y + 1;
        if (seg_h <= 0) seg_h = 1;

        float curve_shift = (1.0f - depth) * s_game.track_curve * 42.0f;
        int cx = 120 + (int)curve_shift;
        int half_w = (int)(14.0f + depth * 86.0f);

        // 动态路面黑灰交替交替条纹 (根据 track_offset)
        bool stripe_dark = (((int)((depth * 6.0f) + s_game.track_offset * 3.0f)) % 2 == 0);
        lv_color_t road_col = stripe_dark ? lv_color_hex(0x121424) : lv_color_hex(0x191C30);
        if (s_game.nitro_active) {
            road_col = stripe_dark ? lv_color_hex(0x28123B) : lv_color_hex(0x3B1956);
        }
        draw_rect_canvas(cx - half_w, y, half_w * 2, seg_h, road_col);

        // 路肩红白 / 蓝白交替减速带
        lv_color_t curb_col = stripe_dark ? lv_color_hex(0x00E5FF) : lv_color_hex(0xFF2255);
        int curb_w = (int)(2.0f + depth * 5.0f);
        draw_rect_canvas(cx - half_w - curb_w, y, curb_w, seg_h, curb_col);
        draw_rect_canvas(cx + half_w, y, curb_w, seg_h, curb_col);

        // 赛道中央虚线
        if (depth > 0.2f && !stripe_dark) {
            draw_rect_canvas(cx - 1, y, 2, seg_h, lv_color_hex(0xFFFFFF));
        }

        // 两侧视流线条 (Optic Flow Streaks)
        if (seg % 3 == 0) {
            int flow_left = cx - half_w - curb_w - (int)(depth * 18.0f);
            int flow_right = cx + half_w + curb_w + (int)(depth * 18.0f);
            lv_color_t flow_col = s_game.nitro_active ? lv_color_hex(0xFFD700) : lv_color_hex(0x335588);
            draw_rect_canvas(flow_left, y, (int)(1 + depth * 3), 1, flow_col);
            draw_rect_canvas(flow_right, y, (int)(1 + depth * 3), 1, flow_col);
        }
    }

    // 3. 绘制交通与障碍物
    for (int i = 0; i < FLYDRIVER_MAX_TRAFFIC; i++) {
        if (!s_game.traffic[i].active) continue;

        flydriver_traffic_t *t = &s_game.traffic[i];
        int tx, ty, tw, th;
        flydriver_calc_coord(t->x, t->z, s_game.track_curve, &tx, &ty, &tw, &th);

        if (t->type == TRAFFIC_SCOUT) {
            // 敏捷侦察车 (青绿色车身 + 尾部绿双灯)
            draw_rect_canvas(tx, ty, tw, th, lv_color_hex(0x118844));
            draw_rect_canvas(tx + 1, ty + 1, tw - 2, th - 2, lv_color_hex(0x22DD66));
            if (tw > 8) {
                draw_rect_canvas(tx + 2, ty + th - 2, 2, 2, lv_color_hex(0x00FF88));
                draw_rect_canvas(tx + tw - 4, ty + th - 2, 2, 2, lv_color_hex(0x00FF88));
            }
        } else if (t->type == TRAFFIC_TRUCK) {
            // 重型突触阻挡车 (深红高大车身 + 警告尾灯)
            draw_rect_canvas(tx, ty - 2, tw, th + 2, lv_color_hex(0x881122));
            draw_rect_canvas(tx + 2, ty, tw - 4, th - 2, lv_color_hex(0xFF2244));
            if (tw > 10) {
                draw_rect_canvas(tx + 2, ty + th - 2, 3, 2, lv_color_hex(0xFFAA00));
                draw_rect_canvas(tx + tw - 5, ty + th - 2, 3, 2, lv_color_hex(0xFFAA00));
            }
        } else if (t->type == TRAFFIC_BOOST_PAD) {
            // 金色光子弹射加速带
            draw_rect_canvas(tx, ty, tw, th / 2 + 1, lv_color_hex(0xD0A000));
            draw_rect_canvas(tx + 1, ty + 1, tw - 2, th / 2 - 1, lv_color_hex(0xFFD700));
        } else if (t->type == TRAFFIC_LASER_GATE) {
            // 激光光闸
            draw_rect_canvas(tx, ty - 4, 3, th + 6, lv_color_hex(0x555577));
            draw_rect_canvas(tx + tw - 3, ty - 4, 3, th + 6, lv_color_hex(0x555577));
            draw_rect_canvas(tx + 3, ty, tw - 6, 2, lv_color_hex(0xFF0044));
        }
    }

    // 4. 粒子飞溅
    for (int i = 0; i < FLYDRIVER_MAX_PARTICLES; i++) {
        if (s_game.particles[i].active) {
            flydriver_particle_t *p = &s_game.particles[i];
            draw_rect_canvas((int)p->x, (int)p->y, 3, 3, lv_color_hex(p->color));
        }
    }

    // 5. 绘制玩家赛博果蝇超跑 (Drosophila Aero Supercar)
    if (!s_game.game_over) {
        int px, py, pw, ph;
        flydriver_calc_coord(s_game.player_x, 0.0f, s_game.track_curve, &px, &py, &pw, &ph);
        pw = 32;
        ph = 22;
        px = px - 2; // 居中微调

        // 无敌闪烁
        bool hide = (s_game.invincible_timer > 0 && (s_game.invincible_timer % 2 == 0));
        if (!hide) {
            // 尾部排气喷焰
            int flame_len = s_game.nitro_active ? 14 : (5 + (s_game.tick_count % 3) * 2);
            lv_color_t flame_col = s_game.nitro_active ? lv_color_hex(0xFFD700) : lv_color_hex(0xFF8800);
            draw_rect_canvas(px + 7, py + ph, 4, flame_len, flame_col);
            draw_rect_canvas(px + pw - 11, py + ph, 4, flame_len, flame_col);

            // 车辆外壳轮廓 (青灰赛博合金)
            draw_rect_canvas(px + 4, py + 2, pw - 8, ph - 2, lv_color_hex(0x223048));
            draw_rect_canvas(px + 2, py + 8, pw - 4, ph - 10, lv_color_hex(0x192233));

            // 果蝇空气动力学定风翼 (左倾/右倾漂移姿态)
            int wing_dy = (s_game.steer_dir == -1) ? -2 : ((s_game.steer_dir == 1) ? 2 : 0);
            draw_rect_canvas(px, py + 6 + wing_dy, 4, 10, lv_color_hex(0x00E5FF));
            draw_rect_canvas(px + pw - 4, py + 6 - wing_dy, 4, 10, lv_color_hex(0x00E5FF));

            // 双座舱传感器复眼 (R7 蓝 / R8 红)
            draw_rect_canvas(px + 9, py + 5, 5, 6, lv_color_hex(0x00E5FF));
            draw_rect_canvas(px + pw - 14, py + 5, 5, 6, lv_color_hex(0xFF3366));

            // 引擎盖与车尾刹车条
            draw_rect_canvas(px + 8, py + ph - 4, pw - 16, 2, lv_color_hex(0xFF2233));
        }
    }
}

static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;

    if (!s_game.game_over) {
        flydriver_step(&s_game);

        if (s_game.pending_snd != FLYDRIVER_SND_NONE) {
            send_sound(s_game.pending_snd);
            s_game.pending_snd = FLYDRIVER_SND_NONE;
        }

        // 刷新 HUD
        lv_label_set_text_fmt(s_hud_spd, "%d KM/H", (int)s_game.player_speed);

        // 护盾生命 (0 ~ 6 格)
        char shield_str[32] = {0};
        for (int i = 0; i < s_game.max_shields; i++) {
            strcat(shield_str, (i < s_game.shields) ? "[*]" : "[ ]");
        }
        lv_label_set_text_fmt(s_hud_shield, "%s", shield_str);
        lv_obj_set_style_text_color(s_hud_shield, (s_game.shields >= 3) ? lv_color_hex(0x33FF66) :
                                    ((s_game.shields >= 2) ? lv_color_hex(0xFFAA00) : lv_color_hex(0xFF3333)), 0);

        // 氮气蓄力
        if (s_game.nitro_active) {
            lv_label_set_text(s_hud_nitro, "WARP 3x!");
            lv_obj_set_style_text_color(s_hud_nitro, lv_color_hex(0xFFD700), 0);
        } else if (s_game.nitro_gauge >= 40) {
            lv_label_set_text_fmt(s_hud_nitro, "[OK] NITRO %d%%", s_game.nitro_gauge);
            lv_obj_set_style_text_color(s_hud_nitro, lv_color_hex(0xFFD700), 0);
        } else {
            lv_label_set_text_fmt(s_hud_nitro, "NITRO:%d%%", s_game.nitro_gauge);
            lv_obj_set_style_text_color(s_hud_nitro, lv_color_hex(0x00E5FF), 0);
        }

        // 底部提示
        if (s_game.feedback_timer > 0) {
            lv_label_set_text(s_guide_label, s_game.feedback_text);
            lv_obj_set_style_text_color(s_guide_label, lv_color_hex(s_game.feedback_color), 0);
        } else {
            lv_label_set_text_fmt(s_guide_label, "DIST: %dm | SCORE: %d\nUP: STEER L | DOWN: STEER R | OK: NITRO",
                                  s_game.distance, s_game.score);
            lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x00E5FF), 0);
        }

        if (s_game.game_over) {
            send_sound(FLYDRIVER_SND_GAMEOVER);
            lv_label_set_text(s_guide_label, "CAR DESTROYED! PRESS [OK] RETRY");
            lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0xFF3333), 0);
        }
    }

    render_flydriver_scene();
}

void demo_flydriver_enter(void)
{
    flydriver_init(&s_game);

    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(8, sizeof(flydriver_snd_t));
        xTaskCreate(flydriver_audio_task, "flydriver_snd", 3072, NULL, 5, &s_snd_task);
    }

    s_scr = lv_obj_create(NULL);
    lv_obj_remove_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x060814), 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);

    // 1. 顶部 HUD
    s_hud_spd = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_spd, 6, 6);
    lv_label_set_text(s_hud_spd, "220 KM/H");
    lv_obj_set_style_text_font(s_hud_spd, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_spd, lv_color_hex(0xFFFFFF), 0);

    s_hud_shield = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_shield, 92, 6);
    lv_label_set_text(s_hud_shield, "SHIELD:[*][*][*]");
    lv_obj_set_style_text_font(s_hud_shield, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_shield, lv_color_hex(0x33FF66), 0);

    s_hud_nitro = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_nitro, 168, 6);
    lv_label_set_text(s_hud_nitro, "NITRO:40%");
    lv_obj_set_style_text_font(s_hud_nitro, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_nitro, lv_color_hex(0x00E5FF), 0);

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
    lv_label_set_text(s_guide_label, "UP: STEER L | DOWN: STEER R\nOK: WARP NITRO BOOST");
    lv_obj_set_style_text_color(s_guide_label, lv_color_hex(0x00E5FF), 0);

    s_game_timer = lv_timer_create(game_timer_cb, 35, NULL); // ~28 FPS 高速刷新
    lv_screen_load(s_scr);
}

void demo_flydriver_exit(void)
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
        s_hud_spd = s_hud_shield = s_hud_nitro = s_canvas = s_guide_label = NULL;
    }
}

void demo_flydriver_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) return;

    if (s_game.game_over) {
        if (btn == BSP_BTN_OK) {
            demo_flydriver_enter();
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        flydriver_steer_left(&s_game);
    } else if (btn == BSP_BTN_DOWN) {
        flydriver_steer_right(&s_game);
    } else if (btn == BSP_BTN_OK) {
        flydriver_trigger_nitro(&s_game);
    }
}
