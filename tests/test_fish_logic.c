#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "fish_logic.h"

static void assert_in_tankish(const fish_tank_t *g)
{
    assert(g->x >= FISH_TANK_LEFT - 0.5f);
    assert(g->x <= FISH_HIDE_X + 5.0f);
    assert(g->y >= FISH_TANK_TOP - 0.5f);
    assert(g->y <= FISH_TANK_BOTTOM + 0.5f);
}

int main(void)
{
    printf("[TEST] Hiding Fish companion logic\n");

    fish_tank_t g;
    fish_logic_init(&g);
    assert(g.mood == FISH_MOOD_CURIOUS);
    assert(g.vis == FISH_VIS_FULL);
    assert(g.attention > 0.6f && g.attention <= 1.0f);
    assert(!g.night);
    assert(g.idle_ms == 0);
    assert_in_tankish(&g);
    printf("  1. init curious in the tank\n");

    fish_logic_init(&g);
    fish_logic_set_seed(&g, 42);
    fish_logic_update(&g, 500);
    assert(g.total_ms == 500);
    assert(g.idle_ms == 500);
    assert(g.attention < 0.72f);
    assert_in_tankish(&g);
    printf("  2. idle decay and swim stay in bounds\n");

    fish_logic_init(&g);
    fish_logic_set_seed(&g, 7);
    fish_logic_update(&g, FISH_HIDE_IDLE_MS + 200);
    assert(g.mood == FISH_MOOD_HIDING);
    assert(g.attention <= 0.22f + 0.001f);
    fish_logic_update(&g, 4000);
    assert(g.mood == FISH_MOOD_HIDING);
    assert(g.arrived);
    assert(g.vis == FISH_VIS_TAIL);
    assert(g.x > 180.0f);
    printf("  3. 30s ignore -> hide, tail only\n");

    fish_logic_call(&g);
    assert(g.snd_call);
    assert(g.mood == FISH_MOOD_PEEKING);
    assert(g.vis == FISH_VIS_PEEK);
    assert(g.idle_ms == 0);
    printf("  4. first call while hiding -> peek\n");

    g.snd_call = false;
    fish_logic_call(&g);
    assert(g.mood == FISH_MOOD_ATTENDING || g.mood == FISH_MOOD_CURIOUS);
    assert(g.vis == FISH_VIS_FULL);
    printf("  5. second call while peeking -> come out\n");

    fish_logic_update(&g, 5000);
    assert(g.mood == FISH_MOOD_ATTENDING);
    assert(g.arrived);
    assert(g.facing_viewer);
    float dx = g.x - FISH_VIEWER_X;
    float dy = g.y - FISH_VIEWER_Y;
    assert(dx * dx + dy * dy < 80.0f);
    printf("  6. attending arrives in front of the viewer\n");

    fish_logic_init(&g);
    fish_logic_hear(&g, 0.80f, 30);
    assert(g.mood == FISH_MOOD_STARTLED);
    assert(g.snd_startle);
    assert(g.vis == FISH_VIS_FULL);
    assert(g.startle_cool_ms > 0);
    g.snd_startle = false;
    fish_logic_hear(&g, 0.90f, 30);
    assert(g.mood == FISH_MOOD_STARTLED);
    assert(!g.snd_startle);
    fish_logic_update(&g, FISH_STARTLE_MS + 100);
    assert(g.mood != FISH_MOOD_STARTLED);
    printf("  7. blow startles, cooldown, then recovers\n");

    fish_logic_init(&g);
    fish_logic_hear(&g, 0.20f, 50);
    assert(g.mood == FISH_MOOD_CURIOUS);
    assert(g.voice_hold_ms == 50);
    fish_logic_hear(&g, 0.20f, FISH_VOICE_HOLD_MS);
    assert(g.idle_ms == 0);
    assert(g.mood == FISH_MOOD_ATTENDING);
    printf("  8. sustained voice (not a puff) -> come over\n");

    fish_logic_init(&g);
    fish_logic_hear(&g, 0.02f, 100);
    assert(g.mood == FISH_MOOD_CURIOUS);
    assert(g.voice_hold_ms == 0);
    printf("  9. quiet rms is ignored\n");

    fish_logic_init(&g);
    g.attention = 0.9f;
    fish_logic_apply_away_time(&g, 5 * 3600);
    assert(g.mood == FISH_MOOD_HIDING);
    assert(g.vis == FISH_VIS_TAIL);
    assert(g.arrived);
    assert(g.attention <= 0.10f + 0.0001f);
    printf("  10. four+ hours away starts hidden\n");

    fish_logic_init(&g);
    g.attention = 0.9f;
    fish_logic_apply_away_time(&g, 40 * 60);
    assert(g.mood == FISH_MOOD_CURIOUS);
    assert(g.attention <= 0.28f + 0.0001f);
    assert(g.x < FISH_HIDE_X);
    printf("  11. 40 min away is shy but not hiding\n");

    fish_logic_init(&g);
    fish_logic_apply_away_time(&g, 60);
    assert(g.mood == FISH_MOOD_CURIOUS);
    printf("  12. one minute away does not force hide\n");

    fish_logic_init(&g);
    fish_logic_set_night(&g, true);
    assert(g.night);
    fish_logic_update(&g, FISH_SLEEP_IDLE_MS + 100);
    assert(g.mood == FISH_MOOD_SLEEPING);
    fish_logic_tap_glass(&g);
    assert(g.mood == FISH_MOOD_PEEKING);
    printf("  13. night idle -> sleep; tap glass peeks\n");

    fish_logic_init(&g);
    fish_logic_toggle_night(&g);
    assert(g.night);
    fish_logic_toggle_night(&g);
    assert(!g.night);
    printf("  14. night toggle\n");

    fish_logic_init(&g);
    assert(fish_logic_bubble_count(&g) == 0);
    fish_logic_call(&g);
    fish_logic_update(&g, 1000);
    assert(fish_logic_bubble_count(&g) >= 1);
    printf("  15. attending spawns bubbles\n");

    fish_logic_init(&g);
    assert(fish_logic_mood_name(g.mood)[0] != '\0');
    assert(strcmp(fish_logic_mood_name(FISH_MOOD_HIDING), "HIDING") == 0);
    assert(fish_logic_speed_for_mood(FISH_MOOD_STARTLED) >
           fish_logic_speed_for_mood(FISH_MOOD_CURIOUS));
    printf("  16. mood names and speeds\n");

    fish_logic_hear(NULL, 1.0f, 30);
    fish_logic_call(NULL);
    fish_logic_tap_glass(NULL);
    fish_logic_update(NULL, 30);
    fish_logic_apply_away_time(NULL, 100);
    fish_logic_init(NULL);
    assert(fish_logic_bubble_count(NULL) == 0);
    printf("  17. null inputs are safe\n");

    fish_tank_t a, b;
    fish_logic_init(&a);
    fish_logic_init(&b);
    fish_logic_set_seed(&a, 99);
    fish_logic_set_seed(&b, 99);
    fish_logic_update(&a, 800);
    fish_logic_update(&b, 800);
    assert(fabsf(a.x - b.x) < 0.01f);
    assert(fabsf(a.y - b.y) < 0.01f);
    printf("  18. seeded wander is deterministic\n");

    printf("[TEST] hiding fish logic PASS\n");
    return 0;
}
