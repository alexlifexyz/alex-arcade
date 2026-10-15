// main/demo_fish.c —— 《会躲起来的鱼》(Hiding Fish)
// 鱼缸陪伴小品：对它说话会游过来，吹气会吓跑，长时间不理就钻进水草只露尾巴。
// 麦克风与音效共用一条后台任务，避免 ES8311 全双工同时读写把喇叭漏进麦。
#include "demo.h"
#include "fish_logic.h"
#include "demo_radio.h"
#include "bsp_display.h"
#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_button.h"
#include "lvgl.h"
#include "nvs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_timer.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static const char *TAG = "demo_fish";

#define SCREEN_W 240
#define SCREEN_H 320
#define FISH_NVS_NS "hidefish"
#define FISH_NVS_KEY "save"
#define FISH_SAVE_MAGIC 0xF15C0001u
#define FISH_UNIX_SANE 1700000000

typedef enum {
    FISH_SND_NONE = 0,
    FISH_SND_CALL,
    FISH_SND_APPROACH,
    FISH_SND_HIDE,
    FISH_SND_PEEK,
    FISH_SND_STARTLE,
    FISH_SND_BUBBLE,
} fish_snd_t;

typedef struct {
    uint32_t magic;
    float attention;
    uint8_t mood;
    uint8_t night;
    float x;
    float y;
    int64_t last_unix;
} fish_persist_t;

static fish_tank_t s_tank;
static lv_obj_t *s_scr;
static lv_obj_t *s_playfield;
static lv_obj_t *s_mood;
static lv_obj_t *s_battery;
static lv_obj_t *s_hint;
static lv_timer_t *s_timer;

static QueueHandle_t s_snd_queue;
static TaskHandle_t s_audio_task __attribute__((unused));
static volatile bool s_audio_running;
static volatile float s_hear_rms;
static volatile uint32_t s_sfx_guard_ms;
static uint32_t s_frame;
static uint32_t s_last_key_ms;
static bool s_dimmed;
static int s_soc = -1;

static inline void draw_box(lv_layer_t *layer, int x, int y, int w, int h, uint32_t hex)
{
    if (w <= 0 || h <= 0) {
        return;
    }
    if (x >= SCREEN_W || y >= SCREEN_H) {
        return;
    }
    if (x < 0) {
        w += x;
        x = 0;
    }
    if (y < 0) {
        h += y;
        y = 0;
    }
    if (x + w > SCREEN_W) {
        w = SCREEN_W - x;
    }
    if (y + h > SCREEN_H) {
        h = SCREEN_H - y;
    }
    if (w <= 0 || h <= 0) {
        return;
    }
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(hex);
    dsc.bg_opa = LV_OPA_COVER;
    dsc.border_width = 0;
    lv_area_t coords = { .x1 = x, .y1 = y, .x2 = x + w - 1, .y2 = y + h - 1 };
    lv_draw_rect(layer, &dsc, &coords);
}

static void send_sound(fish_snd_t snd)
{
    if (s_snd_queue && snd != FISH_SND_NONE) {
        xQueueSend(s_snd_queue, &snd, 0);
    }
}

static void write_tone(int16_t *buf, int samples, float freq, float amp)
{
    float phase = 0.0f;
    const float step = freq / 16000.0f;
    int filled = 0;
    for (int i = 0; i < samples; i++) {
        phase += step;
        if (phase >= 1.0f) {
            phase -= 1.0f;
        }
        float env = 1.0f - (float)i / (float)samples;
        buf[filled++] = (int16_t)((phase < 0.5f ? amp : -amp) * env);
        if (filled == 256 || i == samples - 1) {
            bsp_audio_write(buf, (size_t)filled * sizeof(int16_t));
            filled = 0;
        }
    }
}

static float pcm_rms(const int16_t *pcm, int n)
{
    float acc = 0.0f;
    for (int i = 0; i < n; i++) {
        float s = (float)pcm[i] / 32768.0f;
        acc += s * s;
    }
    return sqrtf(acc / (float)n);
}

static void fish_audio_task(void *arg)
{
    (void)arg;
    int16_t buf[256];
    fish_snd_t snd;
    float noise = 0.03f;

    bsp_audio_set_format(16000, 16, 1);
    bsp_audio_set_volume(72);

    while (s_audio_running) {
        if (s_snd_queue && xQueueReceive(s_snd_queue, &snd, 0) == pdTRUE) {
            s_sfx_guard_ms = 380;
            if (snd == FISH_SND_CALL) {
                write_tone(buf, 420, 660.0f, 5200.0f);
                write_tone(buf, 520, 880.0f, 4800.0f);
            } else if (snd == FISH_SND_APPROACH) {
                write_tone(buf, 380, 520.0f, 4000.0f);
                write_tone(buf, 520, 740.0f, 3600.0f);
            } else if (snd == FISH_SND_HIDE) {
                write_tone(buf, 700, 240.0f, 2800.0f);
            } else if (snd == FISH_SND_PEEK) {
                write_tone(buf, 280, 980.0f, 3000.0f);
            } else if (snd == FISH_SND_STARTLE) {
                write_tone(buf, 180, 1400.0f, 6200.0f);
                write_tone(buf, 220, 900.0f, 5000.0f);
                write_tone(buf, 260, 500.0f, 3800.0f);
            } else if (snd == FISH_SND_BUBBLE) {
                write_tone(buf, 140, 1180.0f, 2200.0f);
            }
            continue;
        }

        if (bsp_audio_read(buf, sizeof(buf)) != ESP_OK) {
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        float rms = pcm_rms(buf, 256);
        if (rms < noise * 1.15f) {
            noise = noise * 0.98f + rms * 0.02f;
            if (noise < 0.008f) {
                noise = 0.008f;
            }
        }
        float norm = (rms - noise) / 0.35f;
        if (norm < 0.0f) {
            norm = 0.0f;
        }
        if (norm > 1.0f) {
            norm = 1.0f;
        }
        s_hear_rms = (s_sfx_guard_ms > 0) ? 0.0f : norm;
    }
    vTaskDelete(NULL);
}

static void draw_weeds(lv_layer_t *layer, bool right, bool night, uint32_t tick)
{
    int base = right ? 198 : 4;
    int stalks = right ? 8 : 5;
    uint32_t dark = night ? 0x14532D : 0x166534;
    uint32_t mid = night ? 0x22C55E : 0x4ADE80;
    uint32_t lite = night ? 0x86EFAC : 0xBBF7D0;
    for (int i = 0; i < stalks; i++) {
        int x = base + i * 5;
        int h = 70 + ((i * 17) % 40);
        if (right) {
            h += 18;
        }
        int sway = (int)(sinf((float)tick * 0.07f + (float)i) * 3.0f);
        int y0 = 292 - h;
        draw_box(layer, x + sway, y0, 3, h, (i & 1) ? dark : mid);
        draw_box(layer, x + sway + 1, y0 + 4, 2, h / 3, lite);
        draw_box(layer, x + sway - 3, y0 + 10, 5, 3, mid);
        draw_box(layer, x + sway + 2, y0 + 22, 5, 3, dark);
        draw_box(layer, x + sway - 2, y0 + 36, 4, 3, lite);
    }
}

static void draw_fish_side(lv_layer_t *layer, int cx, int cy, bool left, uint32_t tick)
{
    int dir = left ? -1 : 1;
    int tail = (int)((tick / 4) % 3);
    int tx = cx - dir * 12;
    int ty = cy;
    int tw = 6 + tail;
    draw_box(layer, tx - (left ? tw : 0), ty - 4 - tail, tw, 4, 0xF59E0B);
    draw_box(layer, tx - (left ? tw : 0), ty + 1, tw, 4, 0xD97706);
    draw_box(layer, tx - dir * 2, ty - 2, 5, 5, 0xFBBF24);
    int bx = cx - 8;
    draw_box(layer, bx, cy - 6, 18, 13, 0xEA580C);
    draw_box(layer, bx + 2, cy - 7, 14, 15, 0xF97316);
    draw_box(layer, bx + 3, cy + 1, 11, 6, 0xFFEDD5);
    draw_box(layer, cx - 2, cy - 10, 7, 4, 0xC2410C);
    int ex = cx + dir * 6;
    draw_box(layer, ex - 2, cy - 4, 5, 5, 0xFFFFFF);
    draw_box(layer, ex - (left ? 1 : 0), cy - 3, 3, 3, 0x0F172A);
    draw_box(layer, ex + (left ? -1 : 1), cy - 3, 1, 1, 0xFFFFFF);
    draw_box(layer, cx + dir * 9, cy + 1, 3, 2, 0x9F1239);
}

static void draw_fish_front(lv_layer_t *layer, int cx, int cy, uint32_t tick)
{
    int bob = (int)(sinf((float)tick * 0.15f) * 1.0f);
    cy += bob;
    draw_box(layer, cx - 10, cy - 6, 20, 14, 0xEA580C);
    draw_box(layer, cx - 8, cy - 8, 16, 16, 0xF97316);
    draw_box(layer, cx - 6, cy + 2, 12, 6, 0xFFEDD5);
    draw_box(layer, cx - 7, cy - 5, 6, 6, 0xFFFFFF);
    draw_box(layer, cx + 1, cy - 5, 6, 6, 0xFFFFFF);
    draw_box(layer, cx - 5, cy - 3, 3, 3, 0x0F172A);
    draw_box(layer, cx + 3, cy - 3, 3, 3, 0x0F172A);
    draw_box(layer, cx - 4, cy - 3, 1, 1, 0xFFFFFF);
    draw_box(layer, cx + 4, cy - 3, 1, 1, 0xFFFFFF);
    draw_box(layer, cx - 2, cy + 5, 4, 2, 0x9F1239);
    int fin = ((tick / 5) % 2) ? 3 : 1;
    draw_box(layer, cx - 13, cy + 1, 4, 3 + fin, 0xC2410C);
    draw_box(layer, cx + 9, cy + 1, 4, 3 + fin, 0xC2410C);
}

static void draw_fish_tail_only(lv_layer_t *layer, int cx, int cy, uint32_t tick)
{
    int wag = (int)(sinf((float)tick * 0.25f) * 3.0f);
    draw_box(layer, cx - 14, cy - 3 + wag, 10, 4, 0xF59E0B);
    draw_box(layer, cx - 12, cy + 1 - wag, 8, 4, 0xD97706);
    draw_box(layer, cx - 6, cy - 1, 5, 5, 0xEA580C);
}

static void draw_fish_peek(lv_layer_t *layer, int cx, int cy, uint32_t tick)
{
    (void)tick;
    draw_box(layer, cx - 6, cy - 4, 8, 10, 0xF97316);
    draw_box(layer, cx - 4, cy + 2, 6, 4, 0xFFEDD5);
    draw_box(layer, cx - 5, cy - 3, 5, 5, 0xFFFFFF);
    draw_box(layer, cx - 3, cy - 2, 3, 3, 0x0F172A);
    draw_box(layer, cx - 2, cy - 2, 1, 1, 0xFFFFFF);
}

static void playfield_draw_cb(lv_event_t *e)
{
    lv_layer_t *layer = lv_event_get_layer(e);
    if (!layer) {
        return;
    }
    bool night = s_tank.night;
    uint32_t tick = s_frame;

    uint32_t bands_day[] = { 0x082F49, 0x0C4A6E, 0x0369A1, 0x0284C7, 0x0EA5E9 };
    uint32_t bands_night[] = { 0x020617, 0x0B1326, 0x1E3A5F, 0x164E63, 0x155E75 };
    uint32_t *bands = night ? bands_night : bands_day;
    for (int i = 0; i < 5; i++) {
        draw_box(layer, 0, i * 52, SCREEN_W, 52, bands[i]);
    }

    draw_box(layer, 0, 18, SCREEN_W, 3, night ? 0x1E293B : 0x7DD3FC);
    if (!night) {
        int shaft = (int)(sinf((float)tick * 0.03f) * 8.0f);
        draw_box(layer, 70 + shaft, 22, 6, 90, 0x38BDF8);
        draw_box(layer, 148 - shaft, 22, 5, 70, 0x7DD3FC);
    } else {
        draw_box(layer, 188, 8, 14, 14, 0xFEF9C3);
        draw_box(layer, 184, 6, 10, 16, 0x020617);
    }

    draw_box(layer, 0, 292, SCREEN_W, 28, night ? 0x44403C : 0xA16207);
    draw_box(layer, 0, 288, SCREEN_W, 4, night ? 0x57534E : 0xCA8A04);
    for (int i = 0; i < 12; i++) {
        int px = 8 + i * 19;
        int py = 296 + (i % 3);
        draw_box(layer, px, py, 6 + (i % 3), 4, (i & 1) ? 0x78716C : 0xD6D3D1);
    }

    draw_box(layer, 96, 268, 28, 20, 0x57534E);
    draw_box(layer, 102, 262, 16, 10, 0xA8A29E);
    draw_box(layer, 52, 276, 18, 14, 0x44403C);

    draw_weeds(layer, false, night, tick);

    int fx = (int)s_tank.x;
    int fy = (int)s_tank.y;
    if (s_tank.mood == FISH_MOOD_STARTLED && ((tick / 2) % 2) == 0) {
        fx += ((int)tick % 5) - 2;
        fy += ((int)(tick / 3) % 5) - 2;
    }

    if (s_tank.vis == FISH_VIS_TAIL) {
        draw_fish_tail_only(layer, fx, fy, tick);
    } else if (s_tank.vis == FISH_VIS_PEEK) {
        draw_fish_peek(layer, fx, fy, tick);
    } else if (s_tank.facing_viewer) {
        draw_fish_front(layer, fx, fy, tick);
    } else {
        draw_fish_side(layer, fx, fy, s_tank.facing_left, tick);
    }

    draw_weeds(layer, true, night, tick);

    for (int i = 0; i < FISH_MAX_BUBBLES; i++) {
        if (!s_tank.bubbles[i].active) {
            continue;
        }
        int bx = (int)s_tank.bubbles[i].x;
        int by = (int)s_tank.bubbles[i].y;
        int s = (s_tank.bubbles[i].life > 0.5f) ? 3 : 2;
        draw_box(layer, bx, by, s, s, 0xE0F2FE);
        draw_box(layer, bx, by, 1, 1, 0xFFFFFF);
    }

    draw_box(layer, 0, 0, SCREEN_W, 6, 0x0F172A);
    draw_box(layer, 0, 314, SCREEN_W, 6, 0x0F172A);
    draw_box(layer, 0, 0, 4, SCREEN_H, 0x0F172A);
    draw_box(layer, 236, 0, 4, SCREEN_H, 0x0F172A);
}

static int64_t wall_unix(void)
{
    time_t now = time(NULL);
    if (now < (time_t)FISH_UNIX_SANE) {
        return 0;
    }
    return (int64_t)now;
}

static void fish_save(void)
{
    if (demo_radio_nvs_prepare() != ESP_OK) {
        return;
    }
    nvs_handle_t h;
    if (nvs_open(FISH_NVS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return;
    }
    fish_persist_t p = {
        .magic = FISH_SAVE_MAGIC,
        .attention = s_tank.attention,
        .mood = (uint8_t)s_tank.mood,
        .night = s_tank.night ? 1 : 0,
        .x = s_tank.x,
        .y = s_tank.y,
        .last_unix = wall_unix(),
    };
    nvs_set_blob(h, FISH_NVS_KEY, &p, sizeof(p));
    nvs_commit(h);
    nvs_close(h);
}

static void fish_load(void)
{
    if (demo_radio_nvs_prepare() != ESP_OK) {
        return;
    }
    nvs_handle_t h;
    if (nvs_open(FISH_NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        return;
    }
    fish_persist_t p;
    size_t sz = sizeof(p);
    esp_err_t err = nvs_get_blob(h, FISH_NVS_KEY, &p, &sz);
    nvs_close(h);
    if (err != ESP_OK || sz != sizeof(p) || p.magic != FISH_SAVE_MAGIC) {
        return;
    }
    s_tank.attention = p.attention;
    s_tank.night = p.night != 0;
    s_tank.x = p.x;
    s_tank.y = p.y;
    int64_t now = wall_unix();
    if (now > 0 && p.last_unix > 0 && now > p.last_unix) {
        uint32_t away = (uint32_t)(now - p.last_unix);
        fish_logic_apply_away_time(&s_tank, away);
        ESP_LOGI(TAG, "away %u s, mood=%s", (unsigned)away, fish_logic_mood_name(s_tank.mood));
    } else if (p.mood == (uint8_t)FISH_MOOD_HIDING || p.mood == (uint8_t)FISH_MOOD_SLEEPING) {
        s_tank.mood = (fish_mood_t)p.mood;
        s_tank.vis = FISH_VIS_TAIL;
        s_tank.arrived = true;
        s_tank.x = FISH_HIDE_X;
        s_tank.y = FISH_HIDE_Y;
    }
}

static void refresh_hud(void)
{
    if (s_mood) {
        lv_label_set_text(s_mood, fish_logic_mood_name(s_tank.mood));
    }
    if (s_battery) {
        if (s_soc < 0) {
            lv_label_set_text(s_battery, "--%");
        } else {
            lv_label_set_text_fmt(s_battery, "%d%%", s_soc);
        }
        lv_obj_set_style_text_color(s_battery,
            (s_soc >= 0 && s_soc < 20) ? lv_color_hex(0xFCA5A5) : lv_color_hex(0xFDE68A), 0);
    }
    if (s_hint) {
        lv_label_set_text(s_hint, s_tank.night ? "OK CALL  UP TAP  DN DAY" : "OK CALL  UP TAP  DN NIGHT");
    }
}

static void game_timer_cb(lv_timer_t *timer)
{
    (void)timer;
    s_frame++;
    const uint32_t dt = 40;

    if (s_sfx_guard_ms > dt) {
        s_sfx_guard_ms -= dt;
    } else {
        s_sfx_guard_ms = 0;
    }

    fish_logic_hear(&s_tank, s_hear_rms, dt);
    fish_logic_update(&s_tank, dt);

    if (s_tank.snd_call) {
        send_sound(FISH_SND_CALL);
        s_tank.snd_call = false;
    }
    if (s_tank.snd_approach) {
        send_sound(FISH_SND_APPROACH);
        s_tank.snd_approach = false;
    }
    if (s_tank.snd_hide) {
        send_sound(FISH_SND_HIDE);
        s_tank.snd_hide = false;
    }
    if (s_tank.snd_peek) {
        send_sound(FISH_SND_PEEK);
        s_tank.snd_peek = false;
    }
    if (s_tank.snd_startle) {
        send_sound(FISH_SND_STARTLE);
        s_tank.snd_startle = false;
    }
    if (s_tank.snd_bubble && (s_frame % 4u) == 0u) {
        send_sound(FISH_SND_BUBBLE);
        s_tank.snd_bubble = false;
    } else {
        s_tank.snd_bubble = false;
    }

    if ((s_frame % 25u) == 0u) {
        s_soc = bsp_battery_soc();
        refresh_hud();
    }

    uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000);
    bool quiet = (now_ms - s_last_key_ms) > 90000u && s_tank.idle_ms > 90000u;
    if (quiet && !s_dimmed) {
        bsp_display_backlight(18);
        s_dimmed = true;
    } else if (!quiet && s_dimmed) {
        bsp_display_backlight(100);
        s_dimmed = false;
    }

    if (s_playfield) {
        lv_obj_invalidate(s_playfield);
    }
}

static lv_obj_t *make_hud_label(lv_obj_t *parent, int x, int y, uint32_t color)
{
    lv_obj_t *lb = lv_label_create(parent);
    lv_obj_set_pos(lb, x, y);
    lv_obj_set_style_text_font(lb, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(lb, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(lb, LV_OPA_TRANSP, 0);
    return lb;
}

void demo_fish_enter(void)
{
    ESP_LOGI(TAG, "start hiding fish");
    fish_logic_init(&s_tank);
    fish_load();
    s_frame = 0;
    s_hear_rms = 0.0f;
    s_sfx_guard_ms = 0;
    s_dimmed = false;
    s_last_key_ms = (uint32_t)(esp_timer_get_time() / 1000);
    s_soc = bsp_battery_soc();
    bsp_display_backlight(100);

    s_scr = lv_obj_create(NULL);
    lv_obj_set_size(s_scr, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(0x082F49), 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);
    lv_obj_set_style_border_width(s_scr, 0, 0);

    s_playfield = lv_obj_create(s_scr);
    lv_obj_set_size(s_playfield, SCREEN_W, SCREEN_H);
    lv_obj_set_style_pad_all(s_playfield, 0, 0);
    lv_obj_set_style_border_width(s_playfield, 0, 0);
    lv_obj_set_style_bg_opa(s_playfield, LV_OPA_TRANSP, 0);
    lv_obj_add_event_cb(s_playfield, playfield_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    s_mood = make_hud_label(s_scr, 8, 6, 0xFDE68A);
    s_battery = make_hud_label(s_scr, 186, 6, 0xFDE68A);
    s_hint = make_hud_label(s_scr, 8, 300, 0xBAE6FD);
    lv_obj_set_width(s_hint, 224);
    refresh_hud();

    s_audio_running = true;
    s_snd_queue = xQueueCreate(8, sizeof(fish_snd_t));
    xTaskCreate(fish_audio_task, "fish_audio", 4096, NULL, 5, &s_audio_task);

    s_timer = lv_timer_create(game_timer_cb, 40, NULL);
    lv_screen_load(s_scr);
}

void demo_fish_exit(void)
{
    ESP_LOGI(TAG, "exit hiding fish");
    fish_save();

    if (s_timer) {
        lv_timer_delete(s_timer);
        s_timer = NULL;
    }
    s_audio_running = false;
    if (s_snd_queue) {
        fish_snd_t none = FISH_SND_NONE;
        xQueueSend(s_snd_queue, &none, 0);
        vTaskDelay(pdMS_TO_TICKS(80));
        vQueueDelete(s_snd_queue);
        s_snd_queue = NULL;
    }
    s_audio_task = NULL;
    if (s_dimmed) {
        bsp_display_backlight(100);
        s_dimmed = false;
    }
    if (s_scr) {
        lv_obj_delete(s_scr);
        s_scr = NULL;
        s_playfield = NULL;
        s_mood = NULL;
        s_battery = NULL;
        s_hint = NULL;
    }
}

void demo_fish_key(bsp_btn_t btn, bsp_btn_ev_t ev)
{
    if (ev != BSP_BTN_PRESS && ev != BSP_BTN_CLICK) {
        return;
    }
    static uint32_t s_last = 0;
    uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    if (now - s_last < 160u) {
        return;
    }
    s_last = now;
    s_last_key_ms = now;
    if (s_dimmed) {
        bsp_display_backlight(100);
        s_dimmed = false;
    }

    if (btn == BSP_BTN_OK) {
        fish_logic_call(&s_tank);
    } else if (btn == BSP_BTN_UP) {
        fish_logic_tap_glass(&s_tank);
    } else if (btn == BSP_BTN_DOWN) {
        fish_logic_toggle_night(&s_tank);
        refresh_hud();
    }
}
