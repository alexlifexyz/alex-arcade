#include "fish_logic.h"

#include <math.h>
#include <string.h>

static uint32_t fish_prng(fish_tank_t *g)
{
    uint32_t x = g->rng_state;
    if (x == 0) {
        x = 0xA5A5C3C3u;
    }
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    g->rng_state = x;
    return x;
}

static float fish_randf(fish_tank_t *g)
{
    return (float)(fish_prng(g) & 0x00FFFFFFu) / (float)0x01000000;
}

static float fish_rand_range(fish_tank_t *g, float lo, float hi)
{
    return lo + fish_randf(g) * (hi - lo);
}

static float clampf(float v, float lo, float hi)
{
    if (v < lo) {
        return lo;
    }
    if (v > hi) {
        return hi;
    }
    return v;
}

static void spawn_bubble(fish_tank_t *g, float x, float y, float vy)
{
    for (int i = 0; i < FISH_MAX_BUBBLES; i++) {
        if (!g->bubbles[i].active) {
            g->bubbles[i].x = x;
            g->bubbles[i].y = y;
            g->bubbles[i].vy = vy;
            g->bubbles[i].life = 1.0f;
            g->bubbles[i].active = true;
            g->snd_bubble = true;
            return;
        }
    }
}

static void pick_wander_target(fish_tank_t *g)
{
    g->target_x = fish_rand_range(g, FISH_TANK_LEFT + 8.0f, FISH_TANK_RIGHT - 8.0f);
    g->target_y = fish_rand_range(g, FISH_TANK_TOP + 12.0f, FISH_TANK_BOTTOM - 12.0f);
    g->waypoint_ms = 1600u + (fish_prng(g) % 2200u);
}

static void set_mood(fish_tank_t *g, fish_mood_t mood)
{
    if (g->mood == mood) {
        return;
    }
    g->mood = mood;
    g->mood_ms = 0;
    g->arrived = false;
    g->facing_viewer = false;

    if (mood == FISH_MOOD_HIDING) {
        g->target_x = FISH_HIDE_X;
        g->target_y = FISH_HIDE_Y;
        if (g->attention > 0.22f) {
            g->attention = 0.22f;
        }
        g->snd_hide = true;
        g->vis = FISH_VIS_FULL;
    } else if (mood == FISH_MOOD_PEEKING) {
        g->target_x = FISH_HIDE_X - 18.0f;
        g->target_y = FISH_HIDE_Y - 6.0f;
        g->snd_peek = true;
        g->vis = FISH_VIS_PEEK;
    } else if (mood == FISH_MOOD_ATTENDING) {
        g->target_x = FISH_VIEWER_X;
        g->target_y = FISH_VIEWER_Y;
        g->snd_approach = true;
        g->vis = FISH_VIS_FULL;
    } else if (mood == FISH_MOOD_STARTLED) {
        g->startle_left_ms = FISH_STARTLE_MS;
        g->startle_cool_ms = FISH_STARTLE_COOLDOWN_MS;
        g->target_x = fish_rand_range(g, FISH_TANK_LEFT, FISH_TANK_RIGHT);
        g->target_y = fish_rand_range(g, FISH_TANK_TOP, FISH_TANK_BOTTOM);
        g->snd_startle = true;
        g->vis = FISH_VIS_FULL;
    } else if (mood == FISH_MOOD_SLEEPING) {
        g->target_x = FISH_HIDE_X;
        g->target_y = FISH_HIDE_Y;
        g->vis = FISH_VIS_FULL;
    } else if (mood == FISH_MOOD_CURIOUS) {
        pick_wander_target(g);
        g->vis = FISH_VIS_FULL;
    }
}

static void add_attention(fish_tank_t *g, float delta)
{
    g->attention = clampf(g->attention + delta, 0.0f, 1.0f);
    g->idle_ms = 0;
    g->voice_hold_ms = 0;
}

static void notice_you(fish_tank_t *g, float delta)
{
    add_attention(g, delta);
    if (g->mood == FISH_MOOD_STARTLED) {
        return;
    }
    if (g->mood == FISH_MOOD_HIDING || g->mood == FISH_MOOD_SLEEPING) {
        set_mood(g, FISH_MOOD_PEEKING);
        return;
    }
    if (g->mood == FISH_MOOD_PEEKING) {
        if (g->attention >= FISH_ATTEND_ATTENTION) {
            set_mood(g, FISH_MOOD_ATTENDING);
        } else {
            set_mood(g, FISH_MOOD_CURIOUS);
        }
        return;
    }
    if (g->attention >= FISH_ATTEND_ATTENTION) {
        set_mood(g, FISH_MOOD_ATTENDING);
    }
}

static void startle(fish_tank_t *g)
{
    g->idle_ms = 0;
    g->voice_hold_ms = 0;
    g->attention = clampf(g->attention * 0.70f, 0.0f, 1.0f);
    set_mood(g, FISH_MOOD_STARTLED);
    spawn_bubble(g, g->x, g->y - 4.0f, -28.0f);
    spawn_bubble(g, g->x + 6.0f, g->y, -22.0f);
}

static void update_bubbles(fish_tank_t *g, float dt_sec)
{
    for (int i = 0; i < FISH_MAX_BUBBLES; i++) {
        fish_bubble_t *b = &g->bubbles[i];
        if (!b->active) {
            continue;
        }
        b->y += b->vy * dt_sec;
        b->x += sinf(b->life * 8.0f) * 6.0f * dt_sec;
        b->life -= dt_sec * 0.35f;
        if (b->life <= 0.0f || b->y < 28.0f) {
            b->active = false;
        }
    }
}

static void swim_toward(fish_tank_t *g, float dt_sec, float speed)
{
    float dx = g->target_x - g->x;
    float dy = g->target_y - g->y;
    float d2 = dx * dx + dy * dy;
    if (d2 < 9.0f) {
        g->vx = 0.0f;
        g->vy = 0.0f;
        g->arrived = true;
        return;
    }
    float dist = sqrtf(d2);
    float nx = dx / dist;
    float ny = dy / dist;
    g->vx = nx * speed;
    g->vy = ny * speed;
    g->x += g->vx * dt_sec;
    g->y += g->vy * dt_sec;
    g->angle = atan2f(g->vy, g->vx);
    g->facing_left = (g->vx < -1.0f) || (g->facing_left && g->vx < 4.0f && dx < 0.0f);
    g->arrived = false;
}

static void keep_in_tank(fish_tank_t *g)
{
    float right = (g->mood == FISH_MOOD_HIDING || g->mood == FISH_MOOD_SLEEPING)
        ? (FISH_HIDE_X + 4.0f)
        : FISH_TANK_RIGHT;
    float left = FISH_TANK_LEFT;
    if (g->mood == FISH_MOOD_PEEKING) {
        right = FISH_HIDE_X;
    }
    g->x = clampf(g->x, left, right);
    g->y = clampf(g->y, FISH_TANK_TOP, FISH_TANK_BOTTOM);
}

static void step_once(fish_tank_t *g, uint32_t dt_ms)
{
    float dt_sec = (float)dt_ms / 1000.0f;

    g->total_ms += dt_ms;
    g->mood_ms += dt_ms;
    g->idle_ms += dt_ms;
    g->tail_phase += dt_sec * (2.4f + fish_logic_speed_for_mood(g->mood) * 0.04f);
    g->bob_phase += dt_sec * 2.1f;
    if (g->startle_cool_ms > dt_ms) {
        g->startle_cool_ms -= dt_ms;
    } else {
        g->startle_cool_ms = 0;
    }

    g->attention = clampf(
        g->attention - FISH_ATTENTION_DECAY_PER_SEC * dt_sec, 0.0f, 1.0f);

    if (g->mood == FISH_MOOD_STARTLED) {
        if (g->startle_left_ms > dt_ms) {
            g->startle_left_ms -= dt_ms;
        } else {
            g->startle_left_ms = 0;
            if (g->attention < FISH_HIDE_ATTENTION) {
                set_mood(g, FISH_MOOD_HIDING);
            } else {
                set_mood(g, FISH_MOOD_CURIOUS);
            }
        }
        if ((g->mood_ms % 180u) < dt_ms) {
            g->target_x = fish_rand_range(g, FISH_TANK_LEFT, FISH_TANK_RIGHT);
            g->target_y = fish_rand_range(g, FISH_TANK_TOP, FISH_TANK_BOTTOM);
            g->arrived = false;
        }
    } else if (g->mood != FISH_MOOD_HIDING
               && g->mood != FISH_MOOD_PEEKING
               && g->mood != FISH_MOOD_SLEEPING
               && g->mood != FISH_MOOD_STARTLED) {
        if (g->idle_ms >= FISH_HIDE_IDLE_MS) {
            set_mood(g, FISH_MOOD_HIDING);
        } else if (g->night && g->idle_ms >= FISH_SLEEP_IDLE_MS) {
            set_mood(g, FISH_MOOD_SLEEPING);
        } else if (g->mood == FISH_MOOD_ATTENDING
                   && g->attention < FISH_ATTEND_ATTENTION) {
            set_mood(g, FISH_MOOD_CURIOUS);
        }
    }

    float speed = fish_logic_speed_for_mood(g->mood);
    if (g->mood == FISH_MOOD_CURIOUS) {
        if (g->waypoint_ms > dt_ms) {
            g->waypoint_ms -= dt_ms;
        } else {
            pick_wander_target(g);
        }
        swim_toward(g, dt_sec, speed);
        g->vis = FISH_VIS_FULL;
        g->facing_viewer = false;
    } else if (g->mood == FISH_MOOD_ATTENDING) {
        swim_toward(g, dt_sec, speed);
        if (g->arrived) {
            g->facing_viewer = true;
            g->y = g->target_y + sinf(g->bob_phase) * 3.0f;
        }
        g->vis = FISH_VIS_FULL;
    } else if (g->mood == FISH_MOOD_HIDING || g->mood == FISH_MOOD_SLEEPING) {
        swim_toward(g, dt_sec, speed);
        if (g->arrived) {
            g->vis = FISH_VIS_TAIL;
            g->facing_left = true;
            g->y = g->target_y + sinf(g->bob_phase * 0.6f) * 2.0f;
        } else {
            g->vis = FISH_VIS_FULL;
        }
    } else if (g->mood == FISH_MOOD_PEEKING) {
        swim_toward(g, dt_sec, speed);
        g->vis = FISH_VIS_PEEK;
        g->facing_left = true;
        g->facing_viewer = g->arrived;
    } else if (g->mood == FISH_MOOD_STARTLED) {
        swim_toward(g, dt_sec, speed);
        g->vis = FISH_VIS_FULL;
        g->facing_viewer = false;
    }

    keep_in_tank(g);

    g->bubble_accum_ms += dt_ms;
    uint32_t bubble_every = (g->mood == FISH_MOOD_ATTENDING) ? 900u : 2200u;
    if (g->mood == FISH_MOOD_SLEEPING) {
        bubble_every = 5000u;
    }
    if (g->bubble_accum_ms >= bubble_every) {
        g->bubble_accum_ms = 0;
        float bx = (g->vis == FISH_VIS_FULL) ? g->x : (FISH_HIDE_X - 12.0f);
        float by = g->y + 4.0f;
        if (g->mood == FISH_MOOD_CURIOUS || g->mood == FISH_MOOD_ATTENDING) {
            spawn_bubble(g, bx, by, -18.0f - fish_randf(g) * 10.0f);
        } else if ((fish_prng(g) & 3u) == 0u) {
            spawn_bubble(g, 40.0f + fish_randf(g) * 160.0f, FISH_TANK_BOTTOM, -14.0f);
        }
    }

    update_bubbles(g, dt_sec);
}

void fish_logic_init(fish_tank_t *g)
{
    if (!g) {
        return;
    }
    memset(g, 0, sizeof(*g));
    g->rng_state = 0xC0FFEEu;
    g->x = 110.0f;
    g->y = 150.0f;
    g->target_x = 140.0f;
    g->target_y = 160.0f;
    g->attention = 0.72f;
    g->mood = FISH_MOOD_CURIOUS;
    g->vis = FISH_VIS_FULL;
    g->angle = 0.0f;
    pick_wander_target(g);
}

void fish_logic_update(fish_tank_t *g, uint32_t dt_ms)
{
    if (!g || dt_ms == 0) {
        return;
    }
    while (dt_ms > 0) {
        uint32_t step = (dt_ms > 50u) ? 50u : dt_ms;
        step_once(g, step);
        dt_ms -= step;
    }
}

void fish_logic_hear(fish_tank_t *g, float rms, uint32_t dt_ms)
{
    if (!g) {
        return;
    }
    if (rms < 0.0f) {
        rms = 0.0f;
    }
    if (rms > 1.0f) {
        rms = 1.0f;
    }

    if (rms >= FISH_HEAR_BLOW) {
        if (g->startle_cool_ms == 0) {
            startle(g);
        }
        g->voice_hold_ms = 0;
        return;
    }

    if (rms >= FISH_HEAR_VOICE) {
        g->voice_hold_ms += dt_ms;
        if (g->voice_hold_ms >= FISH_VOICE_HOLD_MS) {
            notice_you(g, FISH_ATTENTION_VOICE);
        }
        return;
    }

    if (g->voice_hold_ms > dt_ms) {
        g->voice_hold_ms -= dt_ms;
    } else {
        g->voice_hold_ms = 0;
    }
}

void fish_logic_call(fish_tank_t *g)
{
    if (!g) {
        return;
    }
    g->snd_call = true;
    notice_you(g, FISH_ATTENTION_CALL);
}

void fish_logic_tap_glass(fish_tank_t *g)
{
    if (!g) {
        return;
    }
    notice_you(g, FISH_ATTENTION_TAP);
}

void fish_logic_set_night(fish_tank_t *g, bool night)
{
    if (!g) {
        return;
    }
    g->night = night;
}

void fish_logic_toggle_night(fish_tank_t *g)
{
    if (!g) {
        return;
    }
    g->night = !g->night;
}

void fish_logic_apply_away_time(fish_tank_t *g, uint32_t away_sec)
{
    if (!g) {
        return;
    }
    float hours = (float)away_sec / 3600.0f;
    g->idle_ms = g->idle_ms + away_sec * 1000u;
    if (g->idle_ms > 86400000u) {
        g->idle_ms = 86400000u;
    }
    g->attention = clampf(g->attention - hours * 0.22f, 0.0f, 1.0f);

    if (away_sec >= (uint32_t)FISH_AWAY_HIDE_SEC) {
        g->attention = clampf(g->attention, 0.0f, 0.10f);
        g->x = FISH_HIDE_X;
        g->y = FISH_HIDE_Y;
        g->target_x = FISH_HIDE_X;
        g->target_y = FISH_HIDE_Y;
        g->mood = FISH_MOOD_HIDING;
        g->vis = FISH_VIS_TAIL;
        g->arrived = true;
        g->facing_left = true;
        g->facing_viewer = false;
        g->mood_ms = 0;
    } else if (away_sec >= (uint32_t)FISH_AWAY_SHY_SEC) {
        g->attention = clampf(g->attention, 0.0f, 0.28f);
        g->x = FISH_HIDE_X - 36.0f;
        g->y = FISH_HIDE_Y - 10.0f;
        g->mood = FISH_MOOD_CURIOUS;
        g->vis = FISH_VIS_FULL;
        g->arrived = false;
        pick_wander_target(g);
    }
}

void fish_logic_set_seed(fish_tank_t *g, uint32_t seed)
{
    if (!g) {
        return;
    }
    g->rng_state = seed ? seed : 1u;
}

int fish_logic_bubble_count(const fish_tank_t *g)
{
    if (!g) {
        return 0;
    }
    int n = 0;
    for (int i = 0; i < FISH_MAX_BUBBLES; i++) {
        if (g->bubbles[i].active) {
            n++;
        }
    }
    return n;
}

float fish_logic_speed_for_mood(fish_mood_t mood)
{
    switch (mood) {
    case FISH_MOOD_ATTENDING: return FISH_SPEED_ATTEND;
    case FISH_MOOD_HIDING:    return FISH_SPEED_HIDE;
    case FISH_MOOD_STARTLED:  return FISH_SPEED_STARTLE;
    case FISH_MOOD_PEEKING:   return FISH_SPEED_PEEK;
    case FISH_MOOD_SLEEPING:  return FISH_SPEED_HIDE;
    case FISH_MOOD_CURIOUS:
    default:                  return FISH_SPEED_CURIOUS;
    }
}

const char *fish_logic_mood_name(fish_mood_t mood)
{
    switch (mood) {
    case FISH_MOOD_ATTENDING: return "HELLO";
    case FISH_MOOD_HIDING:    return "HIDING";
    case FISH_MOOD_PEEKING:   return "PEEK";
    case FISH_MOOD_STARTLED:  return "!!!";
    case FISH_MOOD_SLEEPING:  return "ZZZ";
    case FISH_MOOD_CURIOUS:
    default:                  return "SWIM";
    }
}
