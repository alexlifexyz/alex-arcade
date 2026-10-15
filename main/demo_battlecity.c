// main/demo_battlecity.c —— 《经典坦克大战 1990 (Battle City Neo)》
// 零 DRAM 开销原生 LVGL 9.x 矢量绘制，带 16kHz 街机风音频合成、砖块 8x8 半砖瓦解、
// 基地雄鹰保卫、经典道具与 ESP-NOW 无感双机无线联机对战/合作。
#include "demo.h"
#include "battlecity_logic.h"
#include "demo_radio.h"
#include "bsp_display.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_button.h"
#include "lvgl.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "esp_mac.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

static const char *TAG __attribute__((unused)) = "demo_battlecity";

#define SCREEN_W 240
#define SCREEN_H 320

// 声音队列与任务
static QueueHandle_t s_snd_queue = NULL;
static TaskHandle_t  s_snd_task = NULL;
static uint8_t       s_volume = 80;

// 全局游戏逻辑实例
static bc_game_t     s_game;
static lv_obj_t     *s_scr = NULL;
static lv_obj_t     *s_playfield = NULL;
static lv_timer_t   *s_game_timer = NULL;

// 结算弹窗
static lv_obj_t     *s_gameover_box = NULL;
static lv_obj_t     *s_victory_box = NULL;
static bool          s_paused = false;

// 帧统计与动画
static uint32_t      s_frame_tick = 0;
static uint32_t      s_last_up_press_tick = 0;
static uint32_t      s_last_ok_press_tick = 0;
static uint8_t       s_step_ticks = 0; // 单击前进步进缓冲计数 (走满一格 16px)

// ESP-NOW 无线双机互联状态
static bool          s_espnow_ready = false;
static bool          s_is_host = true;        // 默认自选 Host (1P)
static uint8_t       s_peer_mac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static uint8_t       s_self_mac[6] = {0};
static uint32_t      s_last_peer_seen = 0;    // 对端最后心跳帧
static bool          s_peer_online = false;

// ============================================================================
// 声音合成系统 (16kHz 16-bit 经典红白机 NES 方波与白噪音)
// ============================================================================
static void send_sound(bc_event_sound_t snd) {
    if (s_snd_queue && snd != BC_EVT_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

static void battlecity_audio_task(void *arg) {
    (void)arg;
    bc_event_sound_t snd;
    int16_t buf[256];

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(s_volume);

    while (1) {
        if (xQueueReceive(s_snd_queue, &snd, portMAX_DELAY) == pdTRUE) {
            if (snd == BC_EVT_NONE) continue;

            if (snd == BC_EVT_FIRE) {
                // 坦克开火：尖锐下潜方波 (580Hz -> 160Hz)
                const int total = 650;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 580.0f - t * 420.0f;
                    phase += (freq / 16000.0f);
                    if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 6000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == BC_EVT_HIT_BRICK) {
                // 击碎砖石：沙哑白噪音 (快速包络衰减)
                const int total = 750;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float amp = (1.0f - t) * 4500.0f;
                    int16_t noise = (int16_t)((rand() % 2000) - 1000);
                    buf[i % 256] = (int16_t)(noise * amp / 1000.0f);
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == BC_EVT_HIT_STEEL) {
                // 命中钢板：金属反弹尖鸣 (1320Hz 高频方波带泛音)
                const int total = 900;
                float phase1 = 0.0f, phase2 = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    phase1 += (1320.0f / 16000.0f); if (phase1 >= 1.0f) phase1 -= 1.0f;
                    phase2 += (1980.0f / 16000.0f); if (phase2 >= 1.0f) phase2 -= 1.0f;
                    float amp = (1.0f - t * t) * 5500.0f;
                    int16_t s = (phase1 < 0.5f ? 1 : -1) + (phase2 < 0.5f ? 1 : -1);
                    buf[i % 256] = (int16_t)(s * (amp / 2.0f));
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == BC_EVT_EXPLODE) {
                // 坦克大爆炸：低频重轰鸣 + 白噪音衰减
                const int total = 2200;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 130.0f - t * 80.0f;
                    phase += (freq / 16000.0f); if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7500.0f;
                    int16_t sub = (phase < 0.5f) ? (int16_t)(amp * 0.6f) : -(int16_t)(amp * 0.6f);
                    int16_t noise = (int16_t)(((rand() % 2000) - 1000) * (amp / 2000.0f));
                    buf[i % 256] = sub + noise;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == BC_EVT_POWERUP) {
                // 拾取道具：经典 4 级升调和弦 (A4 -> C#5 -> E5 -> A5)
                const float freqs[] = { 440.0f, 554.0f, 659.0f, 880.0f };
                for (int n = 0; n < 4; n++) {
                    float phase = 0.0f;
                    int note_len = 450;
                    for (int i = 0; i < note_len; i++) {
                        phase += (freqs[n] / 16000.0f); if (phase >= 1.0f) phase -= 1.0f;
                        float amp = 6000.0f * (1.0f - (float)i / (float)note_len);
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == note_len - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            } else if (snd == BC_EVT_BASE_HIT) {
                // 基地被毁：悲凉警报声 (360Hz -> 140Hz 剧烈下坠)
                const int total = 2800;
                float phase = 0.0f;
                for (int i = 0; i < total; i++) {
                    float t = (float)i / (float)total;
                    float freq = 360.0f - t * 220.0f;
                    phase += (freq / 16000.0f); if (phase >= 1.0f) phase -= 1.0f;
                    float amp = (1.0f - t) * 7000.0f;
                    buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                    if ((i % 256) == 255 || i == total - 1) {
                        bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                    }
                }
            } else if (snd == BC_EVT_START) {
                // 开场 1990 经典三和弦主题前奏旋律
                const float melody[] = { 261.6f, 329.6f, 392.0f, 523.2f, 440.0f, 523.2f };
                const int lens[]     = { 500,    500,    500,    650,    400,    900    };
                for (size_t m = 0; m < sizeof(melody)/sizeof(melody[0]); m++) {
                    float phase = 0.0f;
                    for (int i = 0; i < lens[m]; i++) {
                        phase += (melody[m] / 16000.0f); if (phase >= 1.0f) phase -= 1.0f;
                        float amp = 5500.0f * (1.0f - (float)i / (float)lens[m]);
                        buf[i % 256] = (phase < 0.5f) ? (int16_t)amp : -(int16_t)amp;
                        if ((i % 256) == 255 || i == lens[m] - 1) {
                            bsp_audio_write(buf, ((i % 256) + 1) * sizeof(int16_t));
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// ESP-NOW 无感双机通信系统
// ============================================================================
static void espnow_recv_cb(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
    if (!data || len < (int)sizeof(bc_net_packet_t)) return;
    const bc_net_packet_t *pkt = (const bc_net_packet_t *)data;
    if (pkt->magic != BC_NET_MAGIC || pkt->version != BC_NET_VER) return;

    s_last_peer_seen = s_frame_tick;
    s_peer_online = true;

    if (pkt->pkt_type == BC_PKT_BEACON) {
        // 比较两机 MAC 地址，较小者为主机 (Host/1P)，较大者为客机 (Client/2P)
        if (memcmp(info->src_addr, s_self_mac, 6) < 0) {
            s_is_host = false;
        } else {
            s_is_host = true;
        }
        memcpy(s_peer_mac, info->src_addr, 6);
        s_game.p2_active = true;
        s_game.p2.active = true;
    } else if (pkt->pkt_type == BC_PKT_CLIENT_INPUT && s_is_host) {
        // 1P 主机收到 2P 客机输入的操控动作
        bc_player_turn(&s_game, 2, (bc_dir_t)pkt->payload.input.dir);
        bc_player_move(&s_game, 2, pkt->payload.input.moving != 0);
        if (pkt->payload.input.fire) {
            bc_player_fire(&s_game, 2);
        }
    } else if (pkt->pkt_type == BC_PKT_SYNC_STATE && !s_is_host) {
        // 2P 客机接收 1P 主机的全局物理快照
        bc_unpack_sync(&s_game, pkt);
    }
}

static void init_espnow_network(void) {
    demo_radio_nvs_prepare();
    demo_radio_network_prepare();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    if (esp_wifi_init(&cfg) != ESP_OK) return;
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_start();
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE); // 固定在信道 1 无缝互联

    esp_read_mac(s_self_mac, ESP_MAC_WIFI_STA);

    if (esp_now_init() != ESP_OK) return;
    esp_now_register_recv_cb(espnow_recv_cb);

    // 添加全广播对等端
    esp_now_peer_info_t peer = {0};
    memset(peer.peer_addr, 0xFF, 6);
    peer.channel = 1;
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = false;
    esp_now_add_peer(&peer);

    s_espnow_ready = true;
}

static void send_espnow_broadcast(void) {
    if (!s_espnow_ready) return;
    bc_net_packet_t pkt;
    if (s_is_host) {
        // 主机发送全局状态同步
        bc_pack_sync(&pkt, &s_game);
    } else {
        // 探测心跳
        bc_pack_beacon(&pkt, s_self_mac, s_game.stage, 2);
    }
    uint8_t broadcast_mac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    esp_now_send(broadcast_mac, (uint8_t *)&pkt, sizeof(pkt));
}

// ============================================================================
// 零 DRAM 矩形快速绘制与像素图标
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

// 绘制 8x8 单个红砖子块 (极简单矩形，零 CPU 光栅化开销)
static inline void draw_sub_brick(lv_layer_t *layer, int x, int y) {
    draw_box(layer, x, y, 7, 7, 0xDC2626);
}

// 绘制 16x16 钢板 (双矩形极速渲染)
static void draw_steel_tile(lv_layer_t *layer, int x, int y) {
    draw_box(layer, x, y, 15, 15, 0x64748B);       // 钢板深灰基座
    draw_box(layer, x + 2, y + 2, 11, 11, 0xCBD5E1); // 浅银灰装甲板
}

// 绘制基地雄鹰
static void draw_base_eagle(lv_layer_t *layer, int x, int y, bool alive) {
    if (alive) {
        // 展翅金鹰雕像 (简明轮廓)
        draw_box(layer, x + 2, y + 4, 12, 8, 0xD97706); // 黄金羽翼
        draw_box(layer, x + 5, y + 2, 6, 6, 0xFDE047);  // 鹰首金黄
        draw_box(layer, x + 4, y + 12, 8, 3, 0x78350F); // 坚固基座
    } else {
        // 破损废墟
        draw_box(layer, x + 2, y + 6, 12, 8, 0x334155);
        draw_box(layer, x + 5, y + 8, 6, 4, 0x0F172A);
    }
}

// 绘制一辆坦克 (轻量化 4-box 高速光栅化，彻底释放 CPU)
static void draw_tank(lv_layer_t *layer, const bc_tank_t *t, uint32_t main_col, uint32_t track_col) {
    if (!t->active) return;
    int tx = t->x;
    int ty = BC_OFFSET_Y + t->y;

    // 1. 无敌金钟罩护盾力场 (闪烁细框)
    if (t->invincible_time > 0) {
        uint32_t shield_col = ((s_frame_tick / 3) % 2 == 0) ? 0x00E5FF : 0xFACC15;
        draw_box(layer, tx - 1, ty - 1, 16, 1, shield_col);
        draw_box(layer, tx - 1, ty + 14, 16, 1, shield_col);
        draw_box(layer, tx - 1, ty, 1, 14, shield_col);
        draw_box(layer, tx + 14, ty, 1, 14, shield_col);
    }

    // 2. 履带、车体与炮管
    if (t->dir == BC_DIR_UP || t->dir == BC_DIR_DOWN) {
        // 左右两条履带
        draw_box(layer, tx, ty, 3, 14, track_col);
        draw_box(layer, tx + 11, ty, 3, 14, track_col);
        // 主车厢中枢
        draw_box(layer, tx + 3, ty + 2, 8, 10, main_col);
        // 炮管
        if (t->dir == BC_DIR_UP) {
            draw_box(layer, tx + 6, ty - 3, 2, 6, 0xF8FAFC);
        } else {
            draw_box(layer, tx + 6, ty + 11, 2, 6, 0xF8FAFC);
        }
    } else {
        // 上下两条履带
        draw_box(layer, tx, ty, 14, 3, track_col);
        draw_box(layer, tx, ty + 11, 14, 3, track_col);
        // 主车厢中枢
        draw_box(layer, tx + 2, ty + 3, 10, 8, main_col);
        // 炮管
        if (t->dir == BC_DIR_LEFT) {
            draw_box(layer, tx - 3, ty + 6, 6, 2, 0xF8FAFC);
        } else {
            draw_box(layer, tx + 11, ty + 6, 6, 2, 0xF8FAFC);
        }
    }
}

// 绘制道具图标 (⭐️, 💣, ⏰, 🛡️, 铲, 🔫, 💓)
static void draw_item(lv_layer_t *layer, const bc_item_t *item) {
    if (!item->active || item->blink) return;
    int ix = item->x;
    int iy = BC_OFFSET_Y + item->y;

    // 经典闪烁白金外框
    uint32_t border_col = ((s_frame_tick / 4) % 2 == 0) ? 0xFBBF24 : 0xFFFFFF;
    draw_box(layer, ix, iy, 16, 16, border_col);
    draw_box(layer, ix + 1, iy + 1, 14, 14, 0x0F172A);

    switch (item->type) {
        case BC_ITEM_STAR: // ⭐️ 五角星
            draw_box(layer, ix + 7, iy + 3, 2, 10, 0xFACC15);
            draw_box(layer, ix + 3, iy + 6, 10, 2, 0xFACC15);
            draw_box(layer, ix + 5, iy + 5, 6, 4, 0xFACC15);
            break;
        case BC_ITEM_BOMB: // 💣 核弹
            draw_box(layer, ix + 4, iy + 5, 8, 8, 0xEF4444);
            draw_box(layer, ix + 6, iy + 3, 4, 2, 0x1E293B);
            draw_box(layer, ix + 9, iy + 2, 2, 2, 0xF59E0B);
            break;
        case BC_ITEM_CLOCK: // ⏰ 定时钟
            draw_box(layer, ix + 4, iy + 4, 8, 8, 0x38BDF8);
            draw_box(layer, ix + 7, iy + 5, 2, 4, 0x0F172A);
            draw_box(layer, ix + 7, iy + 7, 3, 2, 0x0F172A);
            break;
        case BC_ITEM_HELMET: // 🛡️ 钢盔
            draw_box(layer, ix + 4, iy + 4, 8, 6, 0x10B981);
            draw_box(layer, ix + 3, iy + 9, 10, 3, 0x059669);
            break;
        case BC_ITEM_SHOVEL: // 铲 铁铲
            draw_box(layer, ix + 5, iy + 3, 6, 6, 0xE2E8F0);
            draw_box(layer, ix + 7, iy + 9, 2, 5, 0xB45309);
            break;
        case BC_ITEM_GUN: // 🔫 破甲手枪
            draw_box(layer, ix + 4, iy + 6, 8, 3, 0xA855F7);
            draw_box(layer, ix + 8, iy + 8, 3, 4, 0x9333EA);
            break;
        case BC_ITEM_LIFE: // 💓 奖命小坦克
            draw_box(layer, ix + 4, iy + 4, 8, 8, 0xEC4899);
            draw_box(layer, ix + 7, iy + 2, 2, 4, 0xF472B6);
            break;
        default:
            break;
    }
}

// 绘制底部车头方向指示罗盘
static void draw_dir_indicator(lv_layer_t *layer, int x, int y, bc_dir_t dir) {
    draw_box(layer, x, y, 16, 16, 0x1E293B);
    draw_box(layer, x + 1, y + 1, 14, 14, 0x0F172A);

    uint32_t col = 0xFACC15; // 明黄色箭头
    if (dir == BC_DIR_UP) {
        draw_box(layer, x + 7, y + 3, 2, 10, col);
        draw_box(layer, x + 5, y + 5, 6, 2, col);
        draw_box(layer, x + 6, y + 4, 4, 2, col);
    } else if (dir == BC_DIR_RIGHT) {
        draw_box(layer, x + 3, y + 7, 10, 2, col);
        draw_box(layer, x + 9, y + 5, 2, 6, col);
        draw_box(layer, x + 10, y + 6, 2, 4, col);
    } else if (dir == BC_DIR_DOWN) {
        draw_box(layer, x + 7, y + 3, 2, 10, col);
        draw_box(layer, x + 5, y + 9, 6, 2, col);
        draw_box(layer, x + 6, y + 10, 4, 2, col);
    } else if (dir == BC_DIR_LEFT) {
        draw_box(layer, x + 3, y + 7, 10, 2, col);
        draw_box(layer, x + 5, y + 5, 2, 6, col);
        draw_box(layer, x + 4, y + 6, 2, 4, col);
    }
}

// 绘制主战场画布 (LVGL 9.x 回调)
static void battlecity_draw_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_DRAW_MAIN) return;

    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) return;

    // 1. 顶部 HUD 栏 (0 ~ 24px)
    draw_box(layer, 0, 0, SCREEN_W, 24, 0x0F172A);
    draw_box(layer, 0, 24, SCREEN_W, 2, 0x334155); // 分隔线

    // 1P 信息 (左侧)
    draw_box(layer, 4, 6, 8, 8, 0xF59E0B);
    draw_box(layer, 7, 3, 2, 4, 0xFDE047); // 1P 金坦微缩图标
    // 1P 命数点阵
    for (int l = 0; l < s_game.p1_lives && l < 5; l++) {
        draw_box(layer, 16 + l * 6, 8, 4, 6, 0xEF4444);
    }
    // 1P 星级星号
    for (int s = 0; s < s_game.p1.tier && s < 4; s++) {
        draw_box(layer, 50 + s * 5, 8, 3, 5, 0xFACC15);
    }

    // 2P 状态 (中间)
    if (s_peer_online) {
        // 绿灯闪烁 2P ONLINE
        uint32_t link_col = ((s_frame_tick / 6) % 2 == 0) ? 0x10B981 : 0x059669;
        draw_box(layer, 85, 8, 6, 6, link_col);
        // 2P 命数
        for (int l = 0; l < s_game.p2_lives && l < 5; l++) {
            draw_box(layer, 95 + l * 6, 8, 4, 6, 0x34D399);
        }
    } else {
        // 灰色 SOLO 单人态
        draw_box(layer, 85, 9, 4, 4, 0x64748B);
    }

    // 敌军待刷余量 (右侧小坦克点阵矩阵，最多 16 只)
    for (int i = 0; i < BC_TOTAL_ENEMIES; i++) {
        int ex = 140 + (i % 8) * 8;
        int ey = 4 + (i / 8) * 8;
        uint32_t col = (i < s_game.enemies_left_in_stage) ? 0x94A3B8 : 0x334155;
        draw_box(layer, ex, ey, 5, 5, col);
    }

    // 2. 主战场底色 (深黑)
    draw_box(layer, 0, BC_OFFSET_Y, SCREEN_W, BC_PLAYFIELD_H, 0x000000);

    // 3. 地图地貌渲染 (仅渲染存在的砖块与钢板、基地)
    for (int r = 0; r < BC_MAP_ROWS; r++) {
        for (int c = 0; c < BC_MAP_COLS; c++) {
            uint8_t t = s_game.map_tiles[r][c];
            if (t == BC_TILE_EMPTY) continue;

            int px = c * BC_TILE_SIZE;
            int py = BC_OFFSET_Y + r * BC_TILE_SIZE;

            if (t == BC_TILE_BRICK) {
                uint8_t sub = s_game.sub_bricks[r][c];
                if (sub == BC_SUB_FULL) {
                    draw_box(layer, px, py, 15, 15, 0xDC2626);
                } else {
                    if (sub & BC_SUB_TL) draw_sub_brick(layer, px, py);
                    if (sub & BC_SUB_TR) draw_sub_brick(layer, px + 8, py);
                    if (sub & BC_SUB_BL) draw_sub_brick(layer, px, py + 8);
                    if (sub & BC_SUB_BR) draw_sub_brick(layer, px + 8, py + 8);
                }
            } else if (t == BC_TILE_STEEL) {
                draw_steel_tile(layer, px, py);
            } else if (t == BC_TILE_BASE) {
                draw_base_eagle(layer, px, py, s_game.base_alive);
            }
        }
    }

    // 4. 道具掉落渲染
    for (int i = 0; i < BC_MAX_ITEMS; i++) {
        draw_item(layer, &s_game.items[i]);
    }

    // 5. 敌军坦克渲染
    for (int i = 0; i < BC_MAX_ENEMIES; i++) {
        const bc_tank_t *e = &s_game.enemies[i];
        if (!e->active) continue;

        uint32_t main_col = 0x64748B; // 默认灰绿
        uint32_t track_col = 0x1E293B;

        if (e->flashing) {
            // 红闪高光发光怪
            main_col = ((s_frame_tick / 3) % 2 == 0) ? 0xDC2626 : 0xFEF08A;
        } else if (e->type == BC_TANK_FAST) {
            main_col = 0xEF4444; // 疾风突击车红
        } else if (e->type == BC_TANK_POWER) {
            main_col = 0x0284C7; // 强力高爆坦蓝
        } else if (e->type == BC_TANK_ARMOR) {
            // 重装甲根据残余血量变色
            main_col = (e->tier >= 3) ? 0x15803D : (e->tier == 2 ? 0xEAB308 : 0xE2E8F0);
        }

        draw_tank(layer, e, main_col, track_col);
    }

    // 6. 玩家 1 坦克 (金色战车)
    draw_tank(layer, &s_game.p1, 0xF59E0B, 0x78350F);

    // 7. 玩家 2 坦克 (翠绿战车，双机联机时)
    if (s_game.p2.active) {
        draw_tank(layer, &s_game.p2, 0x10B981, 0x064E3B);
    }

    // 8. 炮弹飞行渲染 (极速飞弹)
    for (int i = 0; i < BC_MAX_BULLETS; i++) {
        const bc_bullet_t *b = &s_game.bullets[i];
        if (!b->active) continue;
        int bx = b->x;
        int by = BC_OFFSET_Y + b->y;

        uint32_t b_col = b->from_player ? (b->pierce_steel ? 0x00E5FF : 0xFBBF24) : 0xEF4444;
        draw_box(layer, bx - 1, by - 1, 3, 3, b_col);
        draw_box(layer, bx, by, 1, 1, 0xFFFFFF); // 亮白核心
    }

    // 10. 底部状态与操作栏 (298 ~ 320px)
    draw_box(layer, 0, 298, SCREEN_W, 2, 0x334155);
    draw_box(layer, 0, 300, SCREEN_W, 20, 0x0F172A);

    // 道具状态提示条
    int bar_x = 6;
    if (s_game.p1.invincible_time > 0) {
        draw_box(layer, bar_x, 304, 34, 12, 0x0284C7);
        bar_x += 38;
    }
    if (s_game.shovel_timer > 0) {
        draw_box(layer, bar_x, 304, 34, 12, 0x475569);
        bar_x += 38;
    }
    if (s_game.freeze_timer > 0) {
        draw_box(layer, bar_x, 304, 34, 12, 0x06B6D4);
        bar_x += 38;
    }
    if (s_game.auto_fire_p1) {
        draw_box(layer, bar_x, 304, 38, 12, 0xD97706);
    }

    // 右下角常驻高亮绘制车头朝向罗盘 (↑ → ↓ ← 极其显眼)
    draw_dir_indicator(layer, 218, 302, s_game.p1.dir);
}

// ============================================================================
// 游戏主刷新定时器 (40 FPS 丝滑更新)
// ============================================================================
static void battlecity_timer_cb(lv_timer_t *timer) {
    (void)timer;
    if (s_paused) return;

    s_frame_tick++;

    // 实时读取 ADC 电压，检测 DOWN 键 (按住持续全速狂飙冲刺)
    int mv = bsp_button_read_mv();
    if (mv >= 120 && mv <= 500) {
        // DOWN 键处于持续按住状态：充能保持，一路全速狂飙！
        s_step_ticks = 6;
        bc_player_move(&s_game, 1, true);
    } else if (s_step_ticks > 0) {
        // 单击触发的剩余步进 (6 帧 @6px = 36 像素，大步迈进！)
        s_step_ticks--;
        bc_player_move(&s_game, 1, true);
    } else {
        // 步进完成且未按住：原地制动刹车
        bc_player_move(&s_game, 1, false);
    }

    // 推进核心物理世界
    bc_tick(&s_game);

    // 音效分发
    if (s_game.last_sound != BC_EVT_NONE) {
        send_sound(s_game.last_sound);
    }

    // ESP-NOW 周期广播同步 (每 3 帧发一次，约 13Hz)
    if (s_espnow_ready && (s_frame_tick % 3 == 0)) {
        send_espnow_broadcast();
    }

    // 掉线检测 (超过 90 帧未见对端心跳则判定离线)
    if (s_peer_online && (s_frame_tick - s_last_peer_seen > 90)) {
        s_peer_online = false;
        s_game.p2_active = false;
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
        lv_label_set_text(lbl, "GAME OVER\nBASE DESTROYED!\n[OK] RESTART");
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
        lv_label_set_text(lbl, "STAGE CLEARED!\nVICTORY!\n[OK] NEXT STAGE");
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xFDE047), 0);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(lbl);
    }

    // 触发局部重绘
    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

// ============================================================================
// 按键交互逻辑
// UP 键: 单击 = 顺时针旋转 90° (专一方向切换，严格单动防窜)
// DOWN 键: 按住/单击 = 沿当前车头方向全速向前推进 (单击大步，按住冲刺)
// OK 键: 单击 = 极速开火(支持零冷却多连发); 双击 = 切换自动连射
// ============================================================================
void demo_battlecity_key(bsp_btn_t btn, bsp_btn_ev_t ev) {
    if (s_game.game_over || s_game.victory) {
        if (btn == BSP_BTN_OK && (ev == BSP_BTN_CLICK || ev == BSP_BTN_PRESS)) {
            if (s_gameover_box) { lv_obj_delete(s_gameover_box); s_gameover_box = NULL; }
            if (s_victory_box) { lv_obj_delete(s_victory_box); s_victory_box = NULL; }
            uint8_t next_st = s_game.victory ? (s_game.stage + 1) : 1;
            bc_init_game(&s_game, next_st);
            send_sound(BC_EVT_START);
        }
        return;
    }

    if (btn == BSP_BTN_UP) {
        // UP 键：只响应按下瞬间 PRESS，严格每次旋转 90 度！绝不响应双击，彻底消除乱窜
        if (ev == BSP_BTN_PRESS) {
            if (s_frame_tick - s_last_up_press_tick < 8) return; // 200ms 防抖
            s_last_up_press_tick = s_frame_tick;
            bc_player_turn_clockwise(&s_game, 1);
        }
    } else if (btn == BSP_BTN_DOWN) {
        // DOWN 键：按下或单击即刻赋予 6 帧步进充能 (36 像素大步流星！按住持续全速狂飙)
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK || ev == BSP_BTN_LONG) {
            s_step_ticks = 6;
            bc_player_move(&s_game, 1, true);
        }
    } else if (btn == BSP_BTN_OK) {
        // OK 键：支持高速连按发射，按一次必出一发，零装填冷却倾泻火力
        if (ev == BSP_BTN_PRESS || ev == BSP_BTN_CLICK) {
            if (s_frame_tick - s_last_ok_press_tick >= 2) {
                s_last_ok_press_tick = s_frame_tick;
                bc_player_fire(&s_game, 1);
            }
        } else if (ev == BSP_BTN_DOUBLE) {
            // 双击切换全自动持续狂轰
            bc_player_toggle_autofire(&s_game, 1);
        }
    }
}

// ============================================================================
// 生命周期与演示入口 (demo_enter & demo_exit)
// ============================================================================
void demo_battlecity_enter(void) {
    s_scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x000000), 0);

    // 1. 初始化游戏世界与第 1 关
    bc_init_game(&s_game, 1);
    s_paused = false;
    s_frame_tick = 0;
    s_last_up_press_tick = 0;
    s_last_ok_press_tick = 0;
    s_step_ticks = 0;
    s_gameover_box = NULL;
    s_victory_box = NULL;

    // 2. 创建主渲染全屏画布
    s_playfield = lv_obj_create(s_scr);
    lv_obj_remove_style_all(s_playfield);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(s_playfield, 0, 0);
    lv_obj_add_event_cb(s_playfield, battlecity_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 3. 创建音频队列与后台合成任务
    if (!s_snd_queue) {
        s_snd_queue = xQueueCreate(16, sizeof(bc_event_sound_t));
    }
    if (!s_snd_task) {
        xTaskCreate(battlecity_audio_task, "bc_audio", 4096, NULL, 5, &s_snd_task);
    }
    send_sound(BC_EVT_START);

    // 4. 尝试启动 ESP-NOW 无线双机互联
    init_espnow_network();

    // 5. 启动 40 FPS 游戏定时器 (25ms，操作跟手零延迟)
    s_game_timer = lv_timer_create(battlecity_timer_cb, 25, NULL);

    // 6. 载入屏幕
    lv_screen_load(s_scr);
}

void demo_battlecity_exit(void) {
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

    if (s_espnow_ready) {
        esp_now_deinit();
        s_espnow_ready = false;
    }

    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
        s_gameover_box = NULL;
        s_victory_box = NULL;
    }
}
