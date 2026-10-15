// main/demo_geartrooper.c —— 《齿轮骑兵：蒸汽狂飙》(Gear Cavalry: Turbo Surge) 掌机固件驱动
// 极致流畅 40 FPS，零卡顿合批矢量渲染，超高灵敏三键连招操控，16kHz 街机清脆拟音。
#include "demo.h"
#include "geartrooper_logic.h"
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

static const char *TAG __attribute__((unused)) = "demo_geartrooper";

#define SCREEN_W 240
#define SCREEN_H 320

static gt_game_t    s_game;
static lv_obj_t    *s_scr = NULL;
static lv_obj_t    *s_playfield = NULL;
static lv_obj_t    *s_hud_score = NULL;
static lv_obj_t    *s_hud_hp = NULL;
static lv_obj_t    *s_hud_steam = NULL;
static lv_obj_t    *s_hud_hints = NULL;
static lv_obj_t    *s_gameover_box = NULL;
static lv_timer_t  *s_game_timer = NULL;

static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static volatile bool s_audio_running = false;
static uint32_t      s_frame_tick = 0;
static uint8_t       s_volume = 85;

static void send_sound(gt_sound_t snd)
{
    if (s_snd_queue && snd != GT_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

// 快速后台音效合成任务 (16kHz 16-bit 蒸汽朋克工业音效，极短清脆低延迟)
static void geartrooper_audio_task(void *arg)
{
    (void)arg;
    gt_sound_t snd;
    static int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (s_audio_running) {
        if (xQueueReceive(s_snd_queue, &snd, pdMS_TO_TICKS(40)) == pdTRUE) {
            if (snd == GT_SND_NONE) continue;

            if (snd == GT_SND_JUMP) {
                // 蒸汽跃起清脆喷气 (450Hz -> 900Hz 方波, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 450.0f + t * 500.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_STEAM_BLOW) {
                // 重锤下刺震撼冲击波 (重低音 280Hz -> 60Hz + 爆破, 35ms)
                const int total = 560;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 280.0f - t * 220.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 2000) - 1000;
                    float amp = (1.0f - t) * 7500.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise * (1.0f - t));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_SLIDE) {
                // 贴地火花滑铲 (高频切削摩擦音, 30ms)
                const int total = 480;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = (rand() % 5000) - 2500;
                    buf[i % 256] = (int16_t)(noise * (1.0f - t));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_LANCE) {
                // 骑枪加力超压暴刺 (高速穿透活塞音, 25ms)
                const int total = 400;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 600.0f + t * 600.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_HIT) {
                // 贯穿粉碎打击音 (清脆金属破片, 30ms)
                const int total = 480;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    phase += 800.0f / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    int noise = (rand() % 3000) - 1500;
                    float amp = (1.0f - t) * 8000.0f;
                    buf[i % 256] = (int16_t)(((phase < 0.5f) ? amp : -amp) + noise);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_OVERDRIVE) {
                // 蒸汽过载狂暴警笛 (升调号角, 70ms)
                const int total = 1120;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 650.0f + t * 650.0f;
                    phase += freq / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t * 0.3f) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_HURT) {
                // 护盾受损钝响 (40ms)
                const int total = 640;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    phase += 160.0f / 16000.0f;
                    if (phase >= 1.0f) phase -= 1.0f;
                    buf[i % 256] = (int16_t)((phase < 0.5f ? 6000.0f : -6000.0f) * (1.0f - t));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == GT_SND_GAMEOVER) {
                // 停机泄气 (120ms)
                const int total = 1920;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    int noise = ((rand() % 4000) - 2000);
                    buf[i % 256] = (int16_t)(noise * (1.0f - t));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            }
        }
    }
    vTaskDelete(NULL);
}

// 快速绘制填充矩形 (最精简调用)
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

    // 1. 深邃蒸汽工坊背景
    draw_box(layer, 0, 0, SCREEN_W, SCREEN_H, 0x110E0C);

    // 2. 远景高速视差速度线 (极低开销制造 120km/h 速度感)
    int bg_off = s_game.bg_scroll_px;
    draw_box(layer, (60 - bg_off + 240) % 240, 70, 80, 2, 0x2A221A);
    draw_box(layer, (160 - bg_off + 240) % 240, 100, 100, 2, 0x2A221A);
    draw_box(layer, (20 - bg_off + 240) % 240, 140, 70, 2, 0x2A221A);

    // 3. 地表黄铜轨与钢铁导轨
    // 亮金地表线 (Y = 220)
    draw_box(layer, 0, 220, SCREEN_W, 3, 0xD97706);
    draw_box(layer, 0, 223, SCREEN_W, 2, 0x78350F);
    // 深铁基座
    draw_box(layer, 0, 225, SCREEN_W, 75, 0x1C1815);

    // 地表高速流动速度条纹 (地面极速飞掠感)
    int gr_off = s_game.ground_scroll_px;
    for (int gx = -32; gx < SCREEN_W; gx += 32) {
        draw_box(layer, gx + gr_off, 228, 14, 2, 0x44372C);
        draw_box(layer, gx + gr_off + 8, 236, 8, 2, 0x30251E);
    }

    // 4. 地底 4 组大齿轮 (使用 4 帧循环预设相位，0 浮点开销，极速旋转)
    uint32_t gear_body = 0x78350F;
    uint32_t gear_tooth = 0xF59E0B;
    int phase = (s_game.tick_count / 2) % 4;

    for (int i = 0; i < GT_MAX_GEARS; i++) {
        int cx = (int)s_game.gears[i].x;
        int cy = (int)s_game.gears[i].y;
        int r  = (int)s_game.gears[i].radius;

        // 齿轮主体方芯
        draw_box(layer, cx - r + 3, cy - r + 3, (r - 3) * 2, (r - 3) * 2, gear_body);

        // 轮齿交替闪烁转动
        if (phase == 0 || phase == 2) {
            // 十字齿
            draw_box(layer, cx - 3, cy - r - 2, 6, 4, gear_tooth);
            draw_box(layer, cx - 3, cy + r - 2, 6, 4, gear_tooth);
            draw_box(layer, cx - r - 2, cy - 3, 4, 6, gear_tooth);
            draw_box(layer, cx + r - 2, cy - 3, 4, 6, gear_tooth);
        } else {
            // 对角齿
            int d = (r * 7) / 10;
            draw_box(layer, cx - d - 2, cy - d - 2, 4, 4, gear_tooth);
            draw_box(layer, cx + d - 2, cy - d - 2, 4, 4, gear_tooth);
            draw_box(layer, cx - d - 2, cy + d - 2, 4, 4, gear_tooth);
            draw_box(layer, cx + d - 2, cy + d - 2, 4, 4, gear_tooth);
        }

        // 齿轮轴心暗孔
        draw_box(layer, cx - 3, cy - 3, 6, 6, 0x110E0C);
    }

    // 5. 地脉震地冲击波 (Shockwave)
    if (s_game.shockwave_active) {
        int sx = (int)s_game.shockwave_x;
        int sr = (int)s_game.shockwave_radius;
        draw_box(layer, sx, GT_GROUND_Y - 4, sr, 8, 0xFDE047);
        draw_box(layer, sx + sr, GT_GROUND_Y - 8, 6, 14, 0xFFFFFF); // 冲击波锋面
    }

    // 6. 敌兵合批绘制 (造型分明，低多边形极速绘制)
    for (int i = 0; i < GT_MAX_ENEMIES; i++) {
        if (!s_game.enemies[i].active) continue;
        const gt_enemy_t *e = &s_game.enemies[i];
        int ex = (int)e->x;
        int ey = (int)e->y;

        if (e->type == ENEMY_SPIDER) {
            // 地面发条机械蜘蛛 (黑铁躯体 + 闪耀金发条 + 刺足)
            draw_box(layer, ex + 2, ey + 4, 14, 8, 0x334155);
            draw_box(layer, ex + 6, ey, 6, 4, 0xF59E0B); // 金色发条钮
            draw_box(layer, ex, ey + 10, 4, 5, 0x1E293B);  // 左足
            draw_box(layer, ex + 14, ey + 10, 4, 5, 0x1E293B); // 右足
            draw_box(layer, ex + 2, ey + 6, 3, 3, 0xEF4444); // 红眼
        } else if (e->type == ENEMY_FALCON) {
            // 齿轮机械飞隼 (赤红锐羽 + 机械展翼)
            int wing = (s_game.tick_count % 2 == 0) ? -3 : 3;
            draw_box(layer, ex, ey + wing, 18, 3, 0x94A3B8); // 钢铁飞翼
            draw_box(layer, ex + 4, ey + 3, 12, 8, 0xDC2626); // 战鸟躯干
            draw_box(layer, ex + 1, ey + 5, 4, 3, 0xFBBF24);  // 黄金鸟喙
        } else if (e->type == ENEMY_GOLEM) {
            // 重装铁傀儡 (厚重黑铁盾甲 + 铜核)
            draw_box(layer, ex, ey + 6, 24, 22, 0x1E293B); // 巨型方盾
            draw_box(layer, ex + 4, ey + 10, 16, 14, 0x92400E); // 铜胸甲
            draw_box(layer, ex + 4, ey, 16, 6, 0x475569);  // 铁盔
            draw_box(layer, ex + 6, ey + 2, 12, 3, 0xEF4444); // 猩红目镜光
            // 损伤刻痕
            if (e->hp < e->max_hp) {
                draw_box(layer, ex + 8, ey + 12, 8, 2, 0xFDE047); // 破甲裂痕
            }
        }
    }

    // 7. 玩家战马与蒸汽骑兵 (极致精炼矢量图元，神态生动且极其流畅)
    if (s_game.invuln_timer_ms == 0 || ((s_game.tick_count / 3) % 2 == 0)) {
        int px = GT_HORSE_X;
        int py = (int)s_game.y;

        uint32_t armor_col = s_game.overdrive_active ? 0x38BDF8 : 0xB45309; // 狂暴高能蓝 / 蒸汽黄铜
        uint32_t steel_col = s_game.overdrive_active ? 0xE0F2FE : 0x475569;
        uint32_t glow_col  = s_game.overdrive_active ? 0xFFFFFF : 0xFBBF24;

        if (s_game.stance == STANCE_SLIDE) {
            // --- 涡轮滑铲姿态 (贴地疾冲，低风阻) ---
            draw_box(layer, px - 6, py + 10, 36, 12, steel_col); // 贴地机身
            draw_box(layer, px + 2, py + 8, 26, 8, armor_col);
            draw_box(layer, px + 28, py + 8, 12, 8, armor_col);  // 前伸马头
            draw_box(layer, px + 36, py + 10, 3, 3, glow_col);   // 探照眼
            draw_box(layer, px + 8, py + 4, 14, 6, 0x1E293B);   // 骑士低伏
            // 滑铲喷射地焰
            draw_box(layer, px - 18, py + 14, 16, 4, 0xF97316);
            draw_box(layer, px - 28, py + 15, 10, 2, 0xFDE047);
        } else {
            // --- 奔跑 / 跳跃 / 二段喷气 / 下刺 ---
            // 战马身躯与锅炉
            draw_box(layer, px - 4, py - 4, 30, 18, steel_col);
            draw_box(layer, px, py - 6, 24, 18, armor_col);

            // 战马排气烟囱
            draw_box(layer, px - 8, py - 14, 5, 12, 0x334155);
            draw_box(layer, px - 9, py - 16, 7, 3, glow_col);

            // 骑士重甲
            draw_box(layer, px + 4, py - 18, 14, 14, 0x1E293B);
            draw_box(layer, px + 8, py - 24, 10, 10, armor_col);
            draw_box(layer, px + 14, py - 21, 4, 2, glow_col); // 骑士目镜光

            // 马颈与马首
            draw_box(layer, px + 20, py - 14, 10, 14, armor_col);
            draw_box(layer, px + 24, py - 20, 12, 12, armor_col);
            draw_box(layer, px + 32, py - 18, 4, 3, glow_col); // 战马发光眼

            // 机械蹄腿 (极速迈步)
            int leg = ((s_game.tick_count / 2) % 2 == 0) ? 4 : -4;
            if (s_game.stance == STANCE_JUMP || s_game.stance == STANCE_AIR_BOOST) {
                leg = -3; // 空中展蹄
            }
            draw_box(layer, px + 18 + leg, py + 14, 5, 8, steel_col);
            draw_box(layer, px - 2 - leg, py + 14, 5, 8, steel_col);
        }

        // --- 骑枪渲染 (常驻前伸，威风凛凛) ---
        int lx = px + 26;
        int ly = (s_game.stance == STANCE_SLIDE) ? (py + 10) : (py - 8);
        int lw = s_game.lance_reach_px;

        if (s_game.stance == STANCE_PLUNGE) {
            // 下刺重锤姿态：骑枪朝右下 45° 贯穿流光
            draw_box(layer, lx, ly + 2, 18, 18, steel_col);
            draw_box(layer, lx + 8, ly + 10, 16, 16, 0xFDE047);
            draw_box(layer, lx + 18, ly + 20, 14, 14, 0xFFFFFF); // 陨石枪尖
        } else {
            // 正常前挺 / 加力突刺
            draw_box(layer, lx, ly, lw, 5, steel_col);
            draw_box(layer, lx + 6, ly + 1, lw - 8, 3, glow_col);
            // 枪尖破空风刃 (Speed Slash)
            draw_box(layer, lx + lw - 2, ly - 2, 8, 9, 0xFFFFFF);
            if (s_game.lance_extended) {
                draw_box(layer, lx + lw + 6, ly - 4, 6, 13, 0x38BDF8); // 加力气刃
            }
        }
    }

    // 8. 粒子微粒 (蒸汽气团与剧烈火花)
    for (int i = 0; i < GT_MAX_PARTICLES; i++) {
        if (!s_game.particles[i].active) continue;
        const gt_particle_t *p = &s_game.particles[i];
        int px = (int)p->x;
        int py = (int)p->y;
        if (p->type == PART_STEAM) {
            draw_box(layer, px - 2, py - 2, 5, 5, p->color);
        } else {
            draw_box(layer, px, py, 2, 2, p->color);
        }
    }

    // 9. 狂暴过载全屏电浆光芒
    if (s_game.overdrive_active) {
        draw_box(layer, 0, 0, SCREEN_W, 2, 0x38BDF8);
        draw_box(layer, 0, SCREEN_H - 2, SCREEN_W, 2, 0x38BDF8);
        draw_box(layer, 0, 0, 2, SCREEN_H, 0x38BDF8);
        draw_box(layer, SCREEN_W - 2, 0, 2, SCREEN_H, 0x38BDF8);
    }
}

// 刷新定时器 (每 25ms 推进一帧，40 FPS，零卡顿)
static void geartrooper_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame_tick++;

    // 推进核心逻辑
    geartrooper_step(&s_game, 25);

    // 触发合成音效
    if (s_game.pending_sound != GT_SND_NONE) {
        send_sound(s_game.pending_sound);
        s_game.pending_sound = GT_SND_NONE;
    }

    // 刷新顶部 HUD 标签
    if (s_hud_score) {
        lv_label_set_text_fmt(s_hud_score, "SCR:%ld  x%lu", (long)s_game.score, (unsigned long)(s_game.combo_count > 1 ? s_game.combo_count : 1));
    }
    if (s_hud_hp) {
        char hp_buf[16];
        int hp = s_game.hp;
        if (hp > 5) hp = 5;
        if (hp < 0) hp = 0;
        int idx = 0;
        hp_buf[idx++] = 'H'; hp_buf[idx++] = 'P'; hp_buf[idx++] = ':';
        for (int i = 0; i < 5; i++) {
            hp_buf[idx++] = (i < hp) ? '#' : '.';
        }
        hp_buf[idx] = '\0';
        lv_label_set_text(s_hud_hp, hp_buf);
    }
    if (s_hud_steam) {
        if (s_game.overdrive_active) {
            lv_label_set_text(s_hud_steam, ">>> TURBO SURGE! <<<");
            lv_obj_set_style_text_color(s_hud_steam, lv_color_hex((s_frame_tick % 2 == 0) ? 0x38BDF8 : 0xFFFFFF), 0);
        } else if (s_game.steam_psi >= 60) {
            lv_label_set_text(s_hud_steam, "[OK] OVERDRIVE READY!");
            lv_obj_set_style_text_color(s_hud_steam, lv_color_hex((s_frame_tick % 4 < 2) ? 0xFBBF24 : 0xEF4444), 0);
        } else {
            lv_label_set_text_fmt(s_hud_steam, "STEAM: %d PSI", s_game.steam_psi);
            lv_obj_set_style_text_color(s_hud_steam, lv_color_hex(0xCBD5E1), 0);
        }
    }

    // Game Over 弹窗
    if (s_game.game_over) {
        if (!s_gameover_box && s_scr) {
            s_gameover_box = lv_obj_create(s_scr);
            lv_obj_set_size(s_gameover_box, 200, 110);
            lv_obj_center(s_gameover_box);
            lv_obj_set_style_bg_color(s_gameover_box, lv_color_hex(0x1C1815), 0);
            lv_obj_set_style_border_color(s_gameover_box, lv_color_hex(0xD97706), 0);
            lv_obj_set_style_border_width(s_gameover_box, 2, 0);

            lv_obj_t *title = lv_label_create(s_gameover_box);
            lv_label_set_text(title, "CORE SHUTDOWN");
            lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
            lv_obj_set_style_text_color(title, lv_color_hex(0xEF4444), 0);
            lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 4);

            lv_obj_t *score_lbl = lv_label_create(s_gameover_box);
            lv_label_set_text_fmt(score_lbl, "FINAL SCORE: %ld", (long)s_game.score);
            lv_obj_set_style_text_font(score_lbl, &lv_font_montserrat_14, 0);
            lv_obj_set_style_text_color(score_lbl, lv_color_hex(0xFBBF24), 0);
            lv_obj_align(score_lbl, LV_ALIGN_CENTER, 0, -4);

            lv_obj_t *sub = lv_label_create(s_gameover_box);
            lv_label_set_text(sub, "PRESS [OK] TO RESTART");
            lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
            lv_obj_set_style_text_color(sub, lv_color_hex(0x94A3B8), 0);
            lv_obj_align(sub, LV_ALIGN_BOTTOM_MID, 0, -2);
        }
    } else {
        if (s_gameover_box) {
            lv_obj_delete(s_gameover_box);
            s_gameover_box = NULL;
        }
    }

    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// 进入演示页
void demo_geartrooper_enter(void)
{
    geartrooper_init(&s_game, 0x8899AA);

    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x110E0C), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    // 极简绘图表面
    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_clear_flag(s_playfield, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(s_playfield, on_draw_playfield, LV_EVENT_DRAW_MAIN, NULL);

    // 顶部 HUD
    lv_obj_t *hud_bar = lv_obj_create(s_scr);
    lv_obj_set_size(hud_bar, SCREEN_W, 36);
    lv_obj_set_pos(hud_bar, 0, 0);
    lv_obj_set_style_bg_color(hud_bar, lv_color_hex(0x1C1815), 0);
    lv_obj_set_style_bg_opa(hud_bar, LV_OPA_90, 0);
    lv_obj_set_style_border_color(hud_bar, lv_color_hex(0x78350F), 0);
    lv_obj_set_style_border_width(hud_bar, 1, 0);
    lv_obj_clear_flag(hud_bar, LV_OBJ_FLAG_SCROLLABLE);

    s_hud_score = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_score, "SCR:0  x1");
    lv_obj_set_style_text_font(s_hud_score, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_score, lv_color_hex(0xF59E0B), 0);
    lv_obj_set_pos(s_hud_score, 4, 2);

    s_hud_hp = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_hp, "HP:#####");
    lv_obj_set_style_text_font(s_hud_hp, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hp, lv_color_hex(0x22C55E), 0);
    lv_obj_set_pos(s_hud_hp, 140, 2);

    s_hud_steam = lv_label_create(hud_bar);
    lv_label_set_text(s_hud_steam, "STEAM: 0 PSI");
    lv_obj_set_style_text_font(s_hud_steam, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_steam, lv_color_hex(0x38BDF8), 0);
    lv_obj_set_pos(s_hud_steam, 4, 18);

    // 底部按键提示
    s_hud_hints = lv_label_create(s_scr);
    lv_obj_set_pos(s_hud_hints, 0, 302);
    lv_obj_set_size(s_hud_hints, SCREEN_W, 16);
    lv_obj_set_style_text_align(s_hud_hints, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_hud_hints, "UP:JUMP/2ND  DN:PLUNGE/SLIDE  OK:OVERDRIVE");
    lv_obj_set_style_text_font(s_hud_hints, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_hud_hints, lv_color_hex(0xD97706), 0);

    // 启动低延迟音频任务 (4096 字节安全栈)
    s_audio_running = true;
    s_snd_queue = xQueueCreate(8, sizeof(gt_sound_t));
    xTaskCreate(geartrooper_audio_task, "gt_audio", 4096, NULL, 5, &s_snd_task);

    // 启动 40 FPS 超流畅定时器 (25ms)
    s_game_timer = lv_timer_create(geartrooper_timer_cb, 25, NULL);

    lv_screen_load(s_scr);
}

// 退出演示页
void demo_geartrooper_exit(void)
{
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
        s_hud_score = NULL;
        s_hud_hp = NULL;
        s_hud_steam = NULL;
        s_hud_hints = NULL;
        s_gameover_box = NULL;
    }
}

// 极速硬件按键分发：0ms 触底响应，20ms 防抖，支持爽快连招
void demo_geartrooper_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK || ev == BSP_BTN_LONG) {
        static uint32_t s_last_press_tick = 0;
        uint32_t now = esp_log_timestamp();
        if (now - s_last_press_tick < 20) return; // 极短 20ms 防抖，支持疯狂快切
        s_last_press_tick = now;

        if (btn == BSP_BTN_UP) {
            geartrooper_input_up(&s_game);
        } else if (btn == BSP_BTN_DOWN) {
            geartrooper_input_down(&s_game);
        } else if (btn == BSP_BTN_OK) {
            geartrooper_input_ok(&s_game);
        }

        if (s_game.pending_sound != GT_SND_NONE) {
            send_sound(s_game.pending_sound);
            s_game.pending_sound = GT_SND_NONE;
        }

        if (s_playfield) {
            lv_obj_invalidate(s_playfield);
        }
    }
}
