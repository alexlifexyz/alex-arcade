// main/demo_pacman.c —— 《吃豆人极速版 (PAC-MAN Neo-Neon)》
// 零 DRAM 紧凑 LVGL 9.x 原生光栅化绘制，16kHz 经典街机音效合成，40 FPS 极速跟手
#include "demo.h"
#include "pacman_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_pacman";

#define SCREEN_W 240
#define SCREEN_H 320

// 音频系统
static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static uint8_t       s_volume = 80;

// 游戏全局实例与 LVGL 对象
static pac_game_t    s_game;
static lv_obj_t     *s_scr = NULL;
static lv_obj_t     *s_canvas = NULL;
static lv_timer_t   *s_game_timer = NULL;
static lv_obj_t     *s_gameover_box = NULL;
static lv_obj_t     *s_victory_box = NULL;
static bool          s_paused = false;

static uint32_t      s_frame_tick = 0;
static uint32_t      s_last_up_tick = 0;
static uint32_t      s_last_down_tick = 0;
static uint32_t      s_last_ok_tick = 0;

// ============================================================================
// 音频合成系统 (16kHz 16-bit 经典红白机/街机风合成音)
// ============================================================================
static void send_sound(pac_sound_evt_t snd) {
    if (s_snd_queue && snd != PAC_EVT_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

static void pacman_audio_task(void *arg) {
    (void)arg;
    pac_sound_evt_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == PAC_EVT_NONE) continue;

            if (snd == PAC_EVT_WAKA) {
                // 吃豆人经典 "waka-waka" 双音交替方波 (440Hz -> 587Hz)
                static int waka_phase = 0;
                float freq = (waka_phase % 2 == 0) ? 440.0f : 587.0f;
                waka_phase++;
                int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - (float)i / (float)total) * 4500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PAC_EVT_ENERGIZER) {
                // 吃大力丸：重低音升调颤音
                int total = 1200;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 220.0f + t * 440.0f + sinf(t * 40.0f) * 40.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PAC_EVT_EAT_GHOST) {
                // 咬碎幽灵：急速升华高频和弦 (880Hz -> 1760Hz)
                int total = 800;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 880.0f + t * 880.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.5f) * 6500.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PAC_EVT_EAT_FRUIT) {
                // 吃水果：清脆双音三连音
                const float freqs[] = { 523.0f, 659.0f, 784.0f, 1046.0f };
                for (int n = 0; n < 4; n++) {
                    int note_len = 250;
                    float phase = 0.0f;
                    for (int i = 0; i < note_len; i++) {
                        phase += (freqs[n] / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = 5500.0f * (1.0f - (float)i / (float)note_len);
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == note_len - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == PAC_EVT_DEATH) {
                // 丧命：经典下潜悲伤滑音 (700Hz -> 100Hz)
                int total = 2400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 700.0f - t * 600.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == PAC_EVT_START || snd == PAC_EVT_CLEAR) {
                // 开场曲 / 通关胜利和弦
                const float freqs[] = { 587.0f, 659.0f, 784.0f, 880.0f, 1046.0f };
                for (int n = 0; n < 5; n++) {
                    int note_len = 300;
                    float phase = 0.0f;
                    for (int i = 0; i < note_len; i++) {
                        phase += (freqs[n] / 16000.0f);
                        if (phase >= 1.0f) phase -= 1.0f;
                        float amp = 6000.0f * (1.0f - (float)i / (float)note_len);
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == note_len - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// 零 DRAM 矩形快速矢量绘制
// ============================================================================
static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t rgb) {
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

// 绘制大嘴吃豆人 (带张合动画与方向朝向)
static void draw_pacman(lv_layer_t *layer, const pac_player_t *p) {
    int px = p->x;
    int py = PAC_OFFSET_Y + p->y;

    // 金黄圆形车身主体 (10x10)
    uint32_t yellow = p->boosting ? 0xFFEA00 : 0xFACC15;
    draw_box(layer, px + 2, py, 6, 10, yellow);
    draw_box(layer, px, py + 2, 10, 6, yellow);
    draw_box(layer, px + 1, py + 1, 8, 8, yellow);

    // 冲刺光晕
    if (p->boosting) {
        uint32_t aura = ((s_frame_tick / 2) % 2 == 0) ? 0x00E5FF : 0xF59E0B;
        draw_box(layer, px - 1, py - 1, 12, 1, aura);
        draw_box(layer, px - 1, py + 10, 12, 1, aura);
    }

    // 经典三角形张嘴遮罩 (黑底)
    if (p->anim_frame > 0) {
        int mouth_depth = (p->anim_frame == 2) ? 4 : 2;
        if (p->dir == PAC_DIR_RIGHT) {
            draw_box(layer, px + 10 - mouth_depth, py + 3, mouth_depth, 4, 0x000000);
            draw_box(layer, px + 10 - mouth_depth - 1, py + 4, 1, 2, 0x000000);
        } else if (p->dir == PAC_DIR_LEFT) {
            draw_box(layer, px, py + 3, mouth_depth, 4, 0x000000);
            draw_box(layer, px + mouth_depth, py + 4, 1, 2, 0x000000);
        } else if (p->dir == PAC_DIR_UP) {
            draw_box(layer, px + 3, py, 4, mouth_depth, 0x000000);
            draw_box(layer, px + 4, py + mouth_depth, 2, 1, 0x000000);
        } else if (p->dir == PAC_DIR_DOWN) {
            draw_box(layer, px + 3, py + 10 - mouth_depth, 4, mouth_depth, 0x000000);
            draw_box(layer, px + 4, py + 10 - mouth_depth - 1, 2, 1, 0x000000);
        }
    }
}

// 绘制经典幽灵 (波浪裙摆与大白眼睛)
static void draw_ghost(lv_layer_t *layer, const pac_ghost_t *g, int frighten_timer) {
    int gx = g->x;
    int gy = PAC_OFFSET_Y + g->y;

    if (g->mode == GHOST_MODE_EATEN) {
        // 只剩一双漂浮的大眼睛 (回巢中)
        draw_box(layer, gx + 1, gy + 2, 3, 4, 0xFFFFFF);
        draw_box(layer, gx + 6, gy + 2, 3, 4, 0xFFFFFF);
        draw_box(layer, gx + 2, gy + 3, 2, 2, 0x2563EB); // 蓝瞳孔
        draw_box(layer, gx + 7, gy + 3, 2, 2, 0x2563EB);
        return;
    }

    uint32_t body_col = 0xEF4444;
    if (g->mode == GHOST_MODE_FRIGHTENED) {
        // 惊恐深蓝变色，最后 2 秒白蓝交替闪烁
        if (frighten_timer < 80 && ((s_frame_tick / 4) % 2 == 0)) {
            body_col = 0xF1F5F9; // 亮白预警
        } else {
            body_col = 0x1D4ED8; // 经典惊恐幽蓝
        }
    } else {
        // 各幽灵专色
        if (g->id == GHOST_COLOR_RED)         body_col = 0xEF4444; // Blinky 鲜红
        else if (g->id == GHOST_COLOR_PINK)   body_col = 0xEC4899; // Pinky 艳粉
        else if (g->id == GHOST_COLOR_CYAN)   body_col = 0x06B6D4; // Inky 青蓝
        else if (g->id == GHOST_COLOR_ORANGE) body_col = 0xF97316; // Clyde 明橙
    }

    // 圆弧穹顶与躯干 (10x10)
    draw_box(layer, gx + 2, gy, 6, 2, body_col);
    draw_box(layer, gx + 1, gy + 1, 8, 2, body_col);
    draw_box(layer, gx, gy + 2, 10, 6, body_col);

    // 幽灵底部裙摆波浪交替
    int wave = g->anim_frame ? 1 : 0;
    if (wave == 0) {
        draw_box(layer, gx, gy + 8, 2, 2, body_col);
        draw_box(layer, gx + 4, gy + 8, 2, 2, body_col);
        draw_box(layer, gx + 8, gy + 8, 2, 2, body_col);
    } else {
        draw_box(layer, gx + 2, gy + 8, 2, 2, body_col);
        draw_box(layer, gx + 6, gy + 8, 2, 2, body_col);
    }

    // 幽灵双眼 (惊恐态时为惊吓圆嘴，普通时为大白眼球)
    if (g->mode == GHOST_MODE_FRIGHTENED) {
        draw_box(layer, gx + 2, gy + 3, 2, 2, 0xF8FAFC);
        draw_box(layer, gx + 6, gy + 3, 2, 2, 0xF8FAFC);
        draw_box(layer, gx + 3, gy + 6, 4, 1, 0xF8FAFC); // 惊恐波浪嘴
    } else {
        // 根据朝向偏移瞳孔
        int ex = (g->dir == PAC_DIR_RIGHT) ? 1 : ((g->dir == PAC_DIR_LEFT) ? -1 : 0);
        int ey = (g->dir == PAC_DIR_DOWN) ? 1 : ((g->dir == PAC_DIR_UP) ? -1 : 0);

        draw_box(layer, gx + 1, gy + 2, 3, 4, 0xFFFFFF);
        draw_box(layer, gx + 6, gy + 2, 3, 4, 0xFFFFFF);
        draw_box(layer, gx + 2 + ex, gy + 3 + ey, 2, 2, 0x1E293B);
        draw_box(layer, gx + 7 + ex, gy + 3 + ey, 2, 2, 0x1E293B);
    }
}

// 绘制方向指示罗盘 (底部右侧)
static void draw_dir_indicator(lv_layer_t *layer, int x, int y, pac_dir_t dir) {
    draw_box(layer, x, y, 16, 16, 0x1E293B);
    draw_box(layer, x + 1, y + 1, 14, 14, 0x0F172A);

    uint32_t col = 0xFACC15;
    if (dir == PAC_DIR_UP) {
        draw_box(layer, x + 7, y + 3, 2, 10, col);
        draw_box(layer, x + 5, y + 5, 6, 2, col);
    } else if (dir == PAC_DIR_RIGHT) {
        draw_box(layer, x + 3, y + 7, 10, 2, col);
        draw_box(layer, x + 9, y + 5, 2, 6, col);
    } else if (dir == PAC_DIR_DOWN) {
        draw_box(layer, x + 7, y + 3, 2, 10, col);
        draw_box(layer, x + 5, y + 9, 6, 2, col);
    } else if (dir == PAC_DIR_LEFT) {
        draw_box(layer, x + 3, y + 7, 10, 2, col);
        draw_box(layer, x + 5, y + 5, 2, 6, col);
    }
}

// ============================================================================
// 主画面重绘回调 (LVGL 9.x)
// ============================================================================
static void pacman_draw_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_DRAW_MAIN) return;

    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 顶部 HUD (0 ~ 24px)
    draw_box(layer, 0, 0, SCREEN_W, 24, 0x0F172A);
    draw_box(layer, 0, 23, SCREEN_W, 1, 0x2563EB); // 霓虹蓝底边

    // 生命图标 (小吃豆人点阵)
    for (int l = 0; l < s_game.lives && l < 4; l++) {
        int lx = 10 + l * 12;
        draw_box(layer, lx, 7, 8, 8, 0xFACC15);
        draw_box(layer, lx + 5, 9, 3, 4, 0x0F172A); // 小嘴巴
    }

    // 得分点阵
    // 粗体百位/千位得分标示
    int sc = s_game.score;
    int digit_x = 100;
    for (int d = 0; d < 5; d++) {
        int val = (sc / (int)pow(10, 4 - d)) % 10;
        uint32_t col = (s_game.score > 0) ? 0xF8FAFC : 0x64748B;
        draw_box(layer, digit_x + d * 8, 8, 5, 7, col);
        if (val == 0) draw_box(layer, digit_x + d * 8 + 1, 10, 3, 3, 0x0F172A);
    }

    // 关卡指示
    draw_box(layer, 180, 8, 12, 8, 0x10B981); // 绿牌 STAGE
    for (int st = 0; st < s_game.stage && st < 4; st++) {
        draw_box(layer, 200 + st * 6, 9, 4, 6, 0xFACC15);
    }

    // 2. 迷宫游戏区背景 (深黑)
    draw_box(layer, 0, PAC_OFFSET_Y, SCREEN_W, PAC_PLAYFIELD_H, 0x000000);

    // 3. 迷宫瓦片渲染
    for (int r = 0; r < PAC_MAP_ROWS; r++) {
        for (int c = 0; c < PAC_MAP_COLS; c++) {
            uint8_t t = s_game.map[r][c];
            if (t == PAC_TILE_EMPTY) continue;

            int px = c * PAC_TILE_SIZE;
            int py = PAC_OFFSET_Y + r * PAC_TILE_SIZE;

            if (t == PAC_TILE_WALL) {
                // 霓虹赛博深蓝实心砖 + 浅青高光边缘
                draw_box(layer, px, py, 10, 10, 0x1E3A8A);
                draw_box(layer, px + 1, py + 1, 8, 8, 0x1D4ED8);
            } else if (t == PAC_TILE_DOT) {
                // 小黄豆 (2x2 明黄核心)
                draw_box(layer, px + 4, py + 4, 2, 2, 0xFDE047);
            } else if (t == PAC_TILE_ENERGIZER) {
                // 能量大力丸 (6x6 闪烁大金豆)
                if ((s_frame_tick / 6) % 2 == 0) {
                    draw_box(layer, px + 2, py + 2, 6, 6, 0xFACC15);
                    draw_box(layer, px + 3, py + 3, 4, 4, 0xFEF08A);
                } else {
                    draw_box(layer, px + 3, py + 3, 4, 4, 0xF59E0B);
                }
            } else if (t == PAC_TILE_GATE) {
                // 幽灵房粉色激光门
                draw_box(layer, px, py + 4, 10, 2, 0xF472B6);
            }
        }
    }

    // 4. 水果奖励渲染
    if (s_game.fruit_active) {
        int fx = s_game.fruit_x;
        int fy = PAC_OFFSET_Y + s_game.fruit_y;
        // 樱桃红果实 + 绿梗
        draw_box(layer, fx + 1, fy + 4, 4, 4, 0xEF4444);
        draw_box(layer, fx + 5, fy + 5, 4, 4, 0xDC2626);
        draw_box(layer, fx + 3, fy + 1, 3, 3, 0x22C55E);
    }

    // 5. 吃豆人主角渲染
    draw_pacman(layer, &s_game.pacman);

    // 6. 四大幽灵渲染
    for (int i = 0; i < PAC_MAX_GHOSTS; i++) {
        draw_ghost(layer, &s_game.ghosts[i], s_game.frighten_timer);
    }

    // 7. 底部状态栏 (298 ~ 320px)
    draw_box(layer, 0, 298, SCREEN_W, 2, 0x1E3A8A);
    draw_box(layer, 0, 300, SCREEN_W, 20, 0x0F172A);

    // 氮气能量槽
    draw_box(layer, 10, 306, 102, 8, 0x334155);
    int bar_w = s_game.pacman.boost_energy;
    uint32_t bar_col = s_game.pacman.boosting ? 0x00E5FF : 0xFACC15;
    if (bar_w > 0) {
        draw_box(layer, 11, 307, bar_w, 6, bar_col);
    }

    // 惊恐状态倒计时提示
    if (s_game.frighten_timer > 0) {
        draw_box(layer, 125, 304, 60, 12, 0x1D4ED8);
        int rem_bar = (s_game.frighten_timer * 56) / PAC_FRIGHTEN_TIME;
        draw_box(layer, 127, 306, rem_bar, 8, 0x93C5FD);
    }

    // 右下角车头方向罗盘 (指示当前期望拐弯方向)
    draw_dir_indicator(layer, 218, 302, s_game.pacman.desired_dir);
}

// ============================================================================
// 游戏主物理刷新定时器 (40 FPS 丝滑更新)
// ============================================================================
static void pacman_timer_cb(lv_timer_t *timer) {
    (void)timer;
    if (s_paused) return;

    s_frame_tick++;

    // 推进核心物理与幽灵 AI
    pac_tick(&s_game);

    // 音效分发
    if (s_game.last_sound != PAC_EVT_NONE) {
        send_sound(s_game.last_sound);
    }

    // 胜负状态检查与弹窗
    if (s_game.game_over && !s_gameover_box) {
        s_gameover_box = lv_obj_create(s_scr);
        lv_obj_set_size(s_gameover_box, 200, 100);
        lv_obj_center(s_gameover_box);
        lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x0F172A), 0);
        lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xEF4444), 0);
        lv_obj_set_style_border_width(s_gameover_box, 3, 0);

        lv_obj_t *lbl = lv_label_create(s_gameover_box);
        lv_label_set_text(lbl, "GAME OVER!\nOUT OF LIVES\n[OK] RESTART");
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xF87171), 0);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    } else if (s_game.victory && !s_victory_box) {
        s_victory_box = lv_obj_create(s_scr);
        lv_obj_set_size(s_victory_box, 200, 100);
        lv_obj_center(s_victory_box);
        lv_obj_set_style_bg_color(s_victory_box, lv_color_hex(0x0F172A), 0);
        lv_obj_set_style_border_color(s_victory_box, lv_color_hex(0xFACC15), 0);
        lv_obj_set_style_border_width(s_victory_box, 3, 0);

        lv_obj_t *lbl = lv_label_create(s_victory_box);
        lv_label_set_text(lbl, "STAGE CLEARED!\nALL DOTS EATEN!\n[OK] NEXT STAGE");
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFDE047), 0);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    }

    if (s_canvas) {
        lv_obj_invalidate(s_canvas);
    }
}

// ============================================================================
// 按键交互逻辑
// UP 键: 顺时针旋转 90 度 (上 -> 右 -> 下 -> 左 -> 上)
// DOWN 键: 逆时针旋转 90 度 (上 -> 左 -> 下 -> 右 -> 上)
// OK 键: 单击 = 紧急调头 180 度; 双击 = 开启超频冲刺 (Nitro Boost); 长按 = 统一返回
// ============================================================================
void demo_pacman_key(bsp_btn_t btn, bsp_btn_ev_t ev) {
    if (s_game.game_over || s_game.victory) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_gameover_box) { lv_obj_delete(s_gameover_box); s_gameover_box = NULL; }
            if (s_victory_box) { lv_obj_delete(s_victory_box); s_victory_box = NULL; }
            int next_st = s_game.victory ? (s_game.stage + 1) : 1;
            pac_init_game(&s_game, next_st);
            send_sound(PAC_EVT_START);
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        // 顺时针旋转 (严格按下响应，防抖 150ms，转弯极度精准利落)
        if (ev == BSP_BTN_PRESS) {
            if (s_frame_tick - s_last_up_tick < 6) return;
            s_last_up_tick = s_frame_tick;
            pac_input_turn_cw(&s_game);
        }
    } else if (btn == BSP_BTN_DOWN) {
        // 逆时针旋转
        if (ev == BSP_BTN_PRESS) {
            if (s_frame_tick - s_last_down_tick < 6) return;
            s_last_down_tick = s_frame_tick;
            pac_input_turn_ccw(&s_game);
        }
    } else if (btn == BSP_BTN_OK) {
        if (ev == BSP_BTN_PRESS) {
            if (s_frame_tick - s_last_ok_tick < 6) return;
            s_last_ok_tick = s_frame_tick;
            // 单击：180 度紧急掉头逃命！
            pac_input_turn_180(&s_game);
        } else if (ev == BSP_BTN_DOUBLE) {
            // 双击：氮气超频短距冲刺！
            pac_input_trigger_boost(&s_game);
        }
    }
}

// ============================================================================
// 生命周期与演示入口 (demo_enter & demo_exit)
// ============================================================================
void demo_pacman_enter(void) {
    s_scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x000000), 0);

    // 1. 初始化吃豆人第 1 关
    pac_init_game(&s_game, 1);
    s_paused = false;
    s_frame_tick = 0;
    s_last_up_tick = 0;
    s_last_down_tick = 0;
    s_last_ok_tick = 0;
    s_gameover_box = NULL;
    s_victory_box = NULL;

    // 2. 创建主渲染全屏画布
    s_canvas = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_canvas);
    lv_obj_set_size(s_canvas, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_canvas, 0, 0);
    lv_obj_add_event_cb(s_canvas, pacman_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 3. 创建音频队列与后台合成任务
    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(16, sizeof(pac_sound_evt_t));
    }
    if (!s_snd_task) {
        xTaskCreate(pacman_audio_task, "pac_audio", 4096, NULL, 5, &s_snd_task);
    }
    send_sound(PAC_EVT_START);

    // 4. 启动 40 FPS 游戏定时器 (25ms，操作跟手零延迟)
    s_game_timer = lv_timer_create(pacman_timer_cb, 25, NULL);

    // 5. 载入屏幕
    lv_screen_load(s_scr);
}

void demo_pacman_exit(void) {
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
        s_canvas = NULL;
        s_gameover_box = NULL;
        s_victory_box = NULL;
    }
}
