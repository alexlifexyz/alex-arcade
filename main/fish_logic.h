#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// 《会躲起来的鱼》：没有饥饿、没有死亡，只有「它还在不在看你」。
// 纯 C11，无 ESP-IDF / LVGL 依赖，供 host 单测与固件共用。

#define FISH_SCREEN_W           240
#define FISH_SCREEN_H           320

#define FISH_TANK_LEFT          28.0f
#define FISH_TANK_RIGHT         196.0f
#define FISH_TANK_TOP           56.0f
#define FISH_TANK_BOTTOM        248.0f

#define FISH_BODY_W             28.0f
#define FISH_BODY_H             16.0f

#define FISH_HIDE_X             208.0f
#define FISH_HIDE_Y             214.0f
#define FISH_VIEWER_X           120.0f
#define FISH_VIEWER_Y           168.0f

#define FISH_MAX_BUBBLES        10

#define FISH_ATTENTION_VOICE    0.35f
#define FISH_ATTENTION_CALL     0.45f
#define FISH_ATTENTION_TAP      0.18f
#define FISH_ATTENTION_DECAY_PER_SEC 0.008f
#define FISH_HIDE_ATTENTION     0.18f
#define FISH_ATTEND_ATTENTION   0.55f

// 本局可玩的害羞阈值：静默 30s 钻进水草。
// 「一整天不理」通过 fish_logic_apply_away_time() 把真实离席映射进来。
#define FISH_HIDE_IDLE_MS       30000u
#define FISH_SLEEP_IDLE_MS      20000u
#define FISH_STARTLE_MS         1400u
#define FISH_VOICE_HOLD_MS      280u
#define FISH_STARTLE_COOLDOWN_MS 700u

#define FISH_AWAY_SHY_SEC       1800
#define FISH_AWAY_HIDE_SEC      14400

#define FISH_HEAR_VOICE         0.12f
#define FISH_HEAR_BLOW          0.55f

#define FISH_SPEED_CURIOUS      22.0f
#define FISH_SPEED_ATTEND       36.0f
#define FISH_SPEED_HIDE         48.0f
#define FISH_SPEED_STARTLE      96.0f
#define FISH_SPEED_PEEK         10.0f

typedef enum {
    FISH_MOOD_CURIOUS = 0,
    FISH_MOOD_ATTENDING,
    FISH_MOOD_HIDING,
    FISH_MOOD_PEEKING,
    FISH_MOOD_STARTLED,
    FISH_MOOD_SLEEPING,
} fish_mood_t;

typedef enum {
    FISH_VIS_FULL = 0,
    FISH_VIS_PEEK = 1,
    FISH_VIS_TAIL = 2,
} fish_vis_t;

typedef struct {
    float x;
    float y;
    float vy;
    float life;
    bool active;
} fish_bubble_t;

typedef struct {
    float x;
    float y;
    float vx;
    float vy;
    float angle;
    float tail_phase;
    float bob_phase;
    float target_x;
    float target_y;
    uint32_t waypoint_ms;
    float attention;
    fish_mood_t mood;
    fish_vis_t vis;
    uint32_t mood_ms;
    uint32_t idle_ms;
    uint32_t total_ms;
    uint32_t startle_left_ms;
    uint32_t startle_cool_ms;
    uint32_t voice_hold_ms;
    bool facing_viewer;
    bool facing_left;
    bool arrived;
    bool night;
    fish_bubble_t bubbles[FISH_MAX_BUBBLES];
    uint32_t bubble_accum_ms;
    uint32_t rng_state;
    bool snd_approach;
    bool snd_hide;
    bool snd_peek;
    bool snd_startle;
    bool snd_bubble;
    bool snd_call;
} fish_tank_t;

void fish_logic_init(fish_tank_t *g);
void fish_logic_update(fish_tank_t *g, uint32_t dt_ms);
void fish_logic_hear(fish_tank_t *g, float rms, uint32_t dt_ms);
void fish_logic_call(fish_tank_t *g);
void fish_logic_tap_glass(fish_tank_t *g);
void fish_logic_set_night(fish_tank_t *g, bool night);
void fish_logic_toggle_night(fish_tank_t *g);
void fish_logic_apply_away_time(fish_tank_t *g, uint32_t away_sec);
void fish_logic_set_seed(fish_tank_t *g, uint32_t seed);
int fish_logic_bubble_count(const fish_tank_t *g);
float fish_logic_speed_for_mood(fish_mood_t mood);
const char *fish_logic_mood_name(fish_mood_t mood);

#ifdef __cplusplus
}
#endif
