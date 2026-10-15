// main/demo_thunderracer.c —— 《雷霆飞车：极速武装》(Thunder Racer Arcade)
// 基于零 DRAM 开销的原生 LVGL 9.x 矢量绘制，带 16kHz 街机风音频合成、3车道平滑变道、车载导弹与近身超车。
#include "demo.h"
#include "thunderracer_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_thunderracer";

#define SCREEN_W 240
#define SCREEN_H 320

typedef enum {
    TR_SND_NONE = 0,
    TR_SND_LANE,
    TR_SND_MISSILE,
    TR_SND_EXPLODE,
    TR_SND_NITRO,
    TR_SND_NEARMISS,
    TR_SND_GAMEOVER
} racer_snd_t;

static thunderracer_game_t s_game;
static lv_obj_t *s_scr;
static lv_obj_t *s_playfield;
static lv_obj_t *s_hud_score;
static lv_obj_t *s_hud_speed;
static lv_obj_t *s_hud_shield;
static lv_obj_t *s_hud_nitro;
static lv_obj_t *s_hud_hints;
static lv_obj_t *s_gameover_box;
static lv_obj_t *s_pause_box = NULL;
static lv_obj_t *s_pause_vol_label = NULL;
static uint8_t s_volume = 80;
static int s_up_hold_ticks = 0;
static int s_down_hold_ticks = 0;
static lv_timer_t *s_game_timer;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_snd_task;
static uint32_t s_frame_tick = 0;

static void send_racer_sound(racer_snd_t snd)
{
    if (s_snd_queue) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 独立后台音效合成任务 (16kHz 8-bit/16-bit 街机音效)
static void racer_audio_task(void *arg)
{
    (void)arg;
    racer_snd_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(85);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == TR_SND_NONE) continue;

            if (snd == TR_SND_LANE) {
                // 变道微啸声 (350Hz 快速衰减)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 380.0f - t * 180.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 5000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == TR_SND_MISSILE) {
                // 导弹发射 (800Hz 下降至 200Hz)
                const int total = 1200;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 820.0f - t * 600.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7500.0f;
                    buf[i % 256] = (int16_t)((phase < 0.5f ? 1 : -1) * amp);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == TR_SND_EXPLODE) {
                // 白噪声爆炸声
                const int total = 3200;
                int16_t last_sample = 0;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * (1.0f - t) * 9000.0f;
                    int16_t raw_noise = (int16_t)(((rand() % 65536) - 32768) * amp / 32768.0f);
                    last_sample = (int16_t)((last_sample * 3 + raw_noise) / 4);
                    buf[i % 256] = last_sample;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == TR_SND_NITRO) {
                // 氮气爆发充能蜂鸣
                const int total = 2400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 220.0f + t * 440.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.5f) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == TR_SND_NEARMISS) {
                // 近身超车轻快叮咚 (587Hz -> 880Hz)
                const int freqs[] = { 587, 880 };
                for (int f = 0; f < 2; f++) {
                    const int total = 600;
                    float phase = 0.0f;
                    float freq = (float)freqs[f];
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
                    vTaskDelay(pdMS_TO_TICKS(5));
                }
            }
        }
    }
}

// 零 DRAM 开销纯矩形快速绘制
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t rgb)
{
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

// LVGL 9.x 矢量即时绘制回调
static void playfield_draw_cb(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_DRAW_MAIN) return;

    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    lv_obj_t *obj = lv_event_get_target(e);
    int ox = lv_obj_get_x(obj);
    int oy = lv_obj_get_y(obj);

    // 1. 夜空与赛博公路背景 (里程达到阈值后切夜间配色)
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, s_game.night_mode ? 0x02040A : 0x060A14);

    // 透视公路 (梯形渲染：顶部宽 80，底部宽 240)
    draw_box(layer, ox + 0, oy + 40, SCREEN_W, SCREEN_H - 40,
             s_game.night_mode ? 0x0B1220 : 0x1A2333);

    // 斑马线路牙石 (红白相间滚动)
    int curb_step = (s_frame_tick * 8) % 30;
    for (int y = 40; y < SCREEN_H; y += 24) {
        int py = y + curb_step;
        if (py > SCREEN_H) py -= (SCREEN_H - 40);
        uint32_t cc = ((y / 24) % 2 == 0) ? 0xFF3344 : 0xFFFFFF;
        draw_box(layer, ox + 0, oy + py, 14, 16, cc);
        draw_box(layer, ox + SCREEN_W - 14, oy + py, 14, 16, cc);
    }

    // 车道虚线 (三车道两条黄虚线)
    int dash_step = (s_frame_tick * 10) % 32;
    for (int y = 40; y < SCREEN_H; y += 32) {
        int dy = y + dash_step;
        if (dy > SCREEN_H) dy -= (SCREEN_H - 40);
        draw_box(layer, ox + 80, oy + dy, 4, 16, 0xFFD700);
        draw_box(layer, ox + 156, oy + dy, 4, 16, 0xFFD700);
    }

    // 2. 前方交通车辆
    for (int i = 0; i < TR_MAX_VEHICLES; i++) {
        if (s_game.vehicles[i].active) {
            tr_vehicle_t *v = &s_game.vehicles[i];
            int vx, vy, vw, vh;
            thunderracer_calc_coord(v->x, v->z, &vx, &vy, &vw, &vh);
            vx += ox;
            vy += oy;

            int cw = vw;
            int ch = vh;
            if (cw < 10) cw = 10;
            if (ch < 14) ch = 14;

            if (v->type == TR_VEHICLE_POLICE) {
                // 黑白特勤警车 (车顶红蓝爆闪)
                draw_box(layer, vx, vy, cw, ch, 0x111111);
                draw_box(layer, vx + cw/4, vy + ch/4, cw/2, ch/2, 0xFFFFFF);
                bool blink = ((s_frame_tick / 4) % 2 == 0);
                draw_box(layer, vx + cw/2 - 4, vy + ch/2 - 2, 4, 4, blink ? 0xFF0033 : 0x0066FF);
                draw_box(layer, vx + cw/2, vy + ch/2 - 2, 4, 4, blink ? 0x0066FF : 0xFF0033);
            } else if (v->type == TR_VEHICLE_WEAVER) {
                // 黄色运动轿跑
                draw_box(layer, vx, vy, cw, ch, 0xF59E0B);
                draw_box(layer, vx + cw/4, vy + ch/4, cw/2, ch/3, 0x1E293B);
            } else {
                // 红色慢速民用巡航车
                draw_box(layer, vx, vy, cw, ch, 0xEF4444);
                draw_box(layer, vx + cw/4, vy + ch/4, cw/2, ch/3, 0x1E293B);
            }
        }
    }

    // 3. 玩家发射的前向飞弹
    for (int i = 0; i < TR_MAX_MISSILES; i++) {
        if (s_game.missiles[i].active) {
            tr_missile_t *m = &s_game.missiles[i];
            int mx, my, mw, mh;
            thunderracer_calc_coord(m->x, m->z, &mx, &my, &mw, &mh);
            mx += ox;
            my += oy;
            draw_box(layer, mx + mw/2 - 2, my, 4, 12, 0x00FFFF);
            draw_box(layer, mx + mw/2 - 1, my + 4, 2, 8, 0xFFFFFF);
        }
    }

    // 4. 掉落道具 (红心、氮气瓶、飞弹包)
    for (int i = 0; i < TR_MAX_ITEMS; i++) {
        if (s_game.items[i].active) {
            tr_item_t *it = &s_game.items[i];
            int ix, iy, iw, ih;
            thunderracer_calc_coord(it->x, it->z, &ix, &iy, &iw, &ih);
            ix += ox;
            iy += oy;
            uint32_t color = (it->type == TR_ITEM_HEART) ? 0xFF3344 :
                             (it->type == TR_ITEM_NITRO) ? 0x00FF88 : 0xFFD700;
            draw_box(layer, ix + iw/2 - 6, iy + ih/2 - 6, 12, 12, color);
        }
    }

    // 5. 玩家超跑战车 (底部真实立体渲染，撞毁时不消失并呈现爆裂烟火)
    int px, py, pw, ph;
    thunderracer_calc_coord(s_game.lane_x, 0.05f, &px, &py, &pw, &ph);
    px += ox;
    py += oy;
    int pcx = px + pw / 2;
    int pcy = py + ph / 2;

    bool is_nitro = s_game.nitro_active;

    if (!s_game.game_over) {
        // 正常行驶时的尾部双排气火焰
        int flame_h = is_nitro ? 18 + (s_frame_tick % 4) * 4 : 8 + (s_frame_tick % 3) * 2;
        uint32_t flame_color = is_nitro ? 0x00FFFF : 0xFF5500;
        draw_box(layer, pcx - 7, pcy + 18, 4, flame_h, flame_color);
        draw_box(layer, pcx + 3, pcy + 18, 4, flame_h, flame_color);
        draw_box(layer, pcx - 6, pcy + 18, 2, flame_h - 3, 0xFFFFFF);
        draw_box(layer, pcx + 4, pcy + 18, 2, flame_h - 3, 0xFFFFFF);
    } else {
        // 撞毁后的受创烟熏与爆炸飞火残骸 (车身依然清晰可见，绝不凭空消失)
        draw_box(layer, pcx - 14, pcy - 12, 28, 24, 0x222222);
        draw_box(layer, pcx - 8 + (s_frame_tick % 5), pcy - 14, 8, 8, 0xFF3300);
        draw_box(layer, pcx + 2 - (s_frame_tick % 4), pcy - 16, 6, 10, 0xFFD700);
    }

    // 4 只宽轮毂
    draw_box(layer, pcx - 16, pcy - 14, 4, 10, 0x111111);
    draw_box(layer, pcx + 12, pcy - 14, 4, 10, 0x111111);
    draw_box(layer, pcx - 17, pcy + 8, 5, 12, 0x111111);
    draw_box(layer, pcx + 12, pcy + 8, 5, 12, 0x111111);

    // 流线碳纤维车身主体
    uint32_t body_color = s_game.game_over ? 0x475569 : (is_nitro ? 0xFF0055 : 0x00E5FF);
    draw_box(layer, pcx - 12, pcy - 16, 24, 32, body_color);
    draw_box(layer, pcx - 6, pcy - 20, 12, 6, body_color); // 尖车头

    // 黑色挡风玻璃
    draw_box(layer, pcx - 6, pcy - 6, 12, 12, 0x0B1626);
    draw_box(layer, pcx - 4, pcy - 4, 8, 3, s_game.game_over ? 0x1E293B : 0x38BDF8);

    // 尾部 GT 扰流尾翼
    draw_box(layer, pcx - 14, pcy + 14, 28, 4, s_game.game_over ? 0x334155 : 0xFFD700);

    // 碰撞受创无敌闪烁力场
    if (!s_game.game_over && s_game.invincible_timer > 0 && ((s_game.invincible_timer / 3) % 2 == 0)) {
        draw_box(layer, pcx - 18, pcy - 22, 36, 2, 0xFFFFFF);
        draw_box(layer, pcx - 18, pcy + 22, 36, 2, 0xFFFFFF);
    }
}

// 游戏逻辑定时器 (30ms 刷新循环)
static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    thunderracer_step(&s_game);

    if (s_game.snd_missile)   send_racer_sound(TR_SND_MISSILE);
    if (s_game.snd_explode)   send_racer_sound(TR_SND_EXPLODE);
    if (s_game.snd_near_miss) send_racer_sound(TR_SND_NEARMISS);
    if (s_game.snd_nitro)     send_racer_sound(TR_SND_NITRO);
    if (s_game.snd_crash)     send_racer_sound(TR_SND_EXPLODE);
    if (s_game.snd_gameover)  send_racer_sound(TR_SND_GAMEOVER);

    // 更新 HUD (精简文本与安全边距，绝不出界遮挡)
    if (s_hud_score) {
        char buf[32];
        if (s_game.near_miss_combo > 1) {
            snprintf(buf, sizeof(buf), "x%d %ld", s_game.near_miss_combo, (long)s_game.score);
        } else {
            snprintf(buf, sizeof(buf), "SCORE:%ld", (long)s_game.score);
        }
        lv_label_set_text(s_hud_score, buf);
        lv_obj_set_style_text_color(s_hud_score,
            s_game.near_miss_combo > 1 ? lv_color_hex(0x00E5FF) : lv_color_hex(0xFFD700), 0);
    }
    if (s_hud_speed) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%dKM/H", (int)s_game.current_speed);
        lv_label_set_text(s_hud_speed, buf);
        lv_obj_set_style_text_color(s_hud_speed, s_game.nitro_active ? lv_color_hex(0x00FFFF) : lv_color_hex(0x22C55E), 0);
    }
    if (s_hud_shield) {
        char buf[32];
        snprintf(buf, sizeof(buf), "HP:%d%%", (int)s_game.shield);
        lv_label_set_text(s_hud_shield, buf);
        lv_obj_set_style_text_color(s_hud_shield, s_game.shield > 30 ? lv_color_hex(0x38BDF8) : lv_color_hex(0xEF4444), 0);
    }

    // 长按检测连续变道
    if (!s_game.paused && !s_game.game_over) {
        int mv = bsp_button_read_mv();
        if (mv >= 0 && mv < 150) { // 按住 UP 键
            s_up_hold_ticks++;
            if (s_up_hold_ticks > 6 && (s_up_hold_ticks % 5 == 0)) {
                thunderracer_steer_left(&s_game);
                send_racer_sound(TR_SND_LANE);
            }
        } else {
            s_up_hold_ticks = 0;
        }

        if (mv >= 150 && mv < 447) { // 按住 DOWN 键
            s_down_hold_ticks++;
            if (s_down_hold_ticks > 6 && (s_down_hold_ticks % 5 == 0)) {
                thunderracer_steer_right(&s_game);
                send_racer_sound(TR_SND_LANE);
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

    // 阵亡撞毁醒目弹窗 (提示按 OK 立即复活重生)
    if (s_game.game_over && !s_gameover_box) {
        s_gameover_box = lv_obj_create(s_scr);
        lv_obj_set_size(s_gameover_box, 190, 80);
        lv_obj_center(s_gameover_box);
        lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x0a0505), 0);
        lv_obj_set_style_bg_opa(s_gameover_box, LV_OPA_90, 0);
        lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xEF4444), 0);
        lv_obj_set_style_border_width(s_gameover_box, 2, 0);
        lv_obj_clear_flag(s_gameover_box, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *lbl = lv_label_create(s_gameover_box);
        lv_label_set_text(lbl, "CAR CRASHED!\nPress OK to Respawn");
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFFD700), 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    } else if (!s_game.game_over && s_gameover_box) {
        lv_obj_delete(s_gameover_box);
        s_gameover_box = NULL;
    }

    lv_obj_invalidate(s_playfield);
}

// 演示页进入
void demo_thunderracer_enter(void)
{
    ESP_LOGI(TAG, "启动《雷霆飞车：极速武装》");
    thunderracer_init(&s_game);

    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(16, sizeof(racer_snd_t));
        xTaskCreate(racer_audio_task, "racer_audio", 4096, NULL, 5, &s_snd_task);
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

    // 顶部 HUD
    lv_obj_t *hud_bar = lv_obj_create(s_scr);
    lv_obj_set_size(hud_bar, SCREEN_W, 26);
    lv_obj_set_pos(hud_bar, 0, 4);
    lv_obj_set_style_bg_color(hud_bar, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(hud_bar, LV_OPA_80, 0);
    lv_obj_set_style_border_width(hud_bar, 0, 0);
    lv_obj_clear_flag(hud_bar, LV_OBJ_FLAG_SCROLLABLE);

    s_hud_score = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_score, "SCORE:0");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xFFD700), 0);
    lv_obj_set_pos(s_hud_score, 12, 4);

    s_hud_speed = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_speed, "180KM/H");
    lv_obj_set_style_text_font(s_hud_speed, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_speed, lv_color_hex(0x22C55E), 0);
    lv_obj_set_pos(s_hud_speed, 95, 4);

    s_hud_shield = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_shield, "HP:100%");
    lv_obj_set_style_text_font(s_hud_shield, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_shield, lv_color_hex(0x38BDF8), 0);
    lv_obj_set_pos(s_hud_shield, 168, 4);

    // 底部操作栏提示
    s_hud_hints = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_hints, 0, 303);
    lv_obj_set_size(s_hud_hints, 240, 16);
    lv_obj_set_style_text_align(s_hud_hints, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_hud_hints, "UP:L  DN:R  OK:FIRE  HOLD:NITRO");
    lv_obj_set_style_text_font(s_hud_hints, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hints, lv_color_hex(0xFFD700), 0);

    // 暂停半透明弹窗 (居中，带音量调节与提示)
    s_pause_box = lv_obj_create(s_scr);
    lv_obj_set_size(s_pause_box, 180, 110);
    lv_obj_center(s_pause_box);
    lv_obj_set_style_bg_color(s_pause_box, lv_color_hex(0x0a1020), 0);
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
void demo_thunderracer_exit(void)
{
    ESP_LOGI(TAG, "退出《雷霆飞车：极速武装》");
    if (s_game_timer) {
        lv_timer_delete(s_game_timer);
        s_game_timer = NULL;
    }
    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
        s_hud_score = NULL;
        s_hud_speed = NULL;
        s_hud_shield = NULL;
        s_hud_nitro = NULL;
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

// 硬件按键分发：0ms 触底极速响应 + UP双击暂停 + 音量调节
void demo_thunderracer_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    // 游戏结束状态：按 OK 键即刻满血复活
    if (s_game.game_over) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            thunderracer_init(&s_game);
            if (s_gameover_box) {
                lv_obj_delete(s_gameover_box);
                s_gameover_box = NULL;
            }
        }
        return;
    }

    // 暂停状态：UP/DOWN 调节音量，OK 恢复游戏
    if (s_game.paused) {
        if (btn == BSP_BTN_UP && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume <= 90) s_volume += 10; else s_volume = 100;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
            send_racer_sound(TR_SND_LANE);
        } else if (btn == BSP_BTN_DOWN && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_volume >= 10) s_volume -= 10; else s_volume = 0;
            bsp_audio_set_volume(s_volume);
            if (s_pause_vol_label) {
                lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
            }
            send_racer_sound(TR_SND_LANE);
        } else if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            thunderracer_toggle_pause(&s_game);
            if (s_pause_box) {
                lv_obj_add_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
            send_racer_sound(TR_SND_MISSILE);
        }
        return;
    }

    // 正常比赛进行中
    // OK 键：0ms 触底瞬发飞弹！长按超频氮气加速！(解除双击冲突，连发畅快不卡顿)
    if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS) {
            thunderracer_fire_missile(&s_game);
        } else if (ev == BSP_BTN_LONG) {
            thunderracer_trigger_nitro(&s_game);
        }
        return;
    }

    // UP 键：按一次即刻向左切车道 (0ms 触底响应)；双击暂停
    if (btn == BSP_BTN_UP) {
        if (ev == BSP_BTN_PRESS) {
            thunderracer_steer_left(&s_game);
            send_racer_sound(TR_SND_LANE);
        } else if (ev == BSP_BTN_DOUBLE) {
            thunderracer_toggle_pause(&s_game);
            if (s_pause_box) {
                if (s_pause_vol_label) {
                    lv_label_set_text_fmt(s_pause_vol_label, "VOLUME: %d%%", s_volume);
                }
                lv_obj_remove_flag(s_pause_box, LV_OBJ_FLAG_HIDDEN);
            }
            send_racer_sound(TR_SND_LANE);
        }
    }
    // DOWN 键：按一次即刻向右切车道 (0ms 触底响应)
    else if (btn == BSP_BTN_DOWN) {
        if (ev == BSP_BTN_PRESS) {
            thunderracer_steer_right(&s_game);
            send_racer_sound(TR_SND_LANE);
        }
    }
}
