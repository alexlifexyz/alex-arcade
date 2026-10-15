#include "pong_logic.h"
#include <math.h>
#include <string.h>

static uint32_t pong_rand(pong_game_t *g)
{
    g->rng_state = g->rng_state * 1103515245U + 12345U;
    return (g->rng_state >> 16) & 0x7FFF;
}

static void pong_clamp_paddles(pong_game_t *g)
{
    float half_pw = g->player_paddle_w / 2.0f;
    if (g->player_paddle_x < half_pw) {
        g->player_paddle_x = half_pw;
    } else if (g->player_paddle_x > (float)PONG_SCREEN_W - half_pw) {
        g->player_paddle_x = (float)PONG_SCREEN_W - half_pw;
    }

    float half_ai = g->ai_paddle_w / 2.0f;
    if (g->ai_paddle_x < half_ai) {
        g->ai_paddle_x = half_ai;
    } else if (g->ai_paddle_x > (float)PONG_SCREEN_W - half_ai) {
        g->ai_paddle_x = (float)PONG_SCREEN_W - half_ai;
    }
}

void pong_move_paddle_left(pong_game_t *g, float dt_sec)
{
    if (!g || g->state == PONG_STATE_GAME_OVER) return;
    float step = (dt_sec > 0.0f) ? (g->player_speed * dt_sec) : 6.0f;
    g->player_paddle_x -= step;
    pong_clamp_paddles(g);
}

void pong_move_paddle_right(pong_game_t *g, float dt_sec)
{
    if (!g || g->state == PONG_STATE_GAME_OVER) return;
    float step = (dt_sec > 0.0f) ? (g->player_speed * dt_sec) : 6.0f;
    g->player_paddle_x += step;
    pong_clamp_paddles(g);
}

const char *pong_mutation_name(pong_mutation_t mutation)
{
    switch (mutation) {
        case PONG_MUTATION_NORMAL:      return "NORMAL";
        case PONG_MUTATION_MEGA_BALL:   return "MEGA_BALL";
        case PONG_MUTATION_HYPER_SPEED: return "HYPER_SPEED";
        case PONG_MUTATION_CURVE_BALL:  return "CURVE_BALL";
        case PONG_MUTATION_DUAL_BALL:   return "DUAL_BALL";
        default:                        return "UNKNOWN";
    }
}

void pong_logic_init(pong_game_t *g)
{
    if (!g) return;

    uint32_t seed = (g->rng_state != 0) ? g->rng_state : 0x12345678U;
    memset(g, 0, sizeof(*g));
    g->rng_state = seed;

    g->player_paddle_w = PONG_PADDLE_W;
    g->player_paddle_h = PONG_PADDLE_H;
    g->player_paddle_x = (float)PONG_SCREEN_W / 2.0f;
    g->player_paddle_y = PONG_PLAYER_PADDLE_Y;
    g->player_speed = PONG_PLAYER_SPEED;

    g->ai_paddle_w = PONG_PADDLE_W;
    g->ai_paddle_h = PONG_PADDLE_H;
    g->ai_paddle_x = (float)PONG_SCREEN_W / 2.0f;
    g->ai_paddle_y = PONG_AI_PADDLE_Y;
    g->ai_speed = PONG_AI_DEFAULT_SPEED;
    g->ai_target_x = (float)PONG_SCREEN_W / 2.0f;
    g->ai_reaction_delay_ms = PONG_AI_REACTION_DELAY_MS;
    g->ai_reaction_timer_ms = 0;

    g->player_score = 0;
    g->ai_score = 0;
    g->state = PONG_STATE_SERVE;
    g->winner = PONG_WINNER_NONE;
    g->serve_owner = PONG_SIDE_PLAYER;
    g->last_scorer = PONG_SIDE_PLAYER;
    g->serve_timer_ms = 0;

    g->mutation_threshold = PONG_DEFAULT_RALLY_MUTATION;
    g->rally_hits = 0;
    g->total_hits = 0;

    g->slice_timer_ms = 0;
    g->slice_hit_count = 0;
    g->last_slice_hit = false;

    // Reset balls
    for (int i = 0; i < PONG_MAX_BALLS; i++) {
        g->balls[i].active = false;
        g->balls[i].mutation = PONG_MUTATION_NORMAL;
        g->balls[i].radius = PONG_BALL_DEFAULT_RADIUS;
        g->balls[i].vx = 0.0f;
        g->balls[i].vy = 0.0f;
        g->balls[i].curve_accel = 0.0f;
        g->balls[i].curve_dir = 0.0f;
        g->balls[i].curve_timer = 0.0f;
    }

    g->balls[0].active = true;
    g->balls[0].x = g->player_paddle_x;
    g->balls[0].y = g->player_paddle_y - g->player_paddle_h / 2.0f - g->balls[0].radius - 1.0f;
}

void pong_serve(pong_game_t *g)
{
    if (!g || g->state != PONG_STATE_SERVE) return;

    g->state = PONG_STATE_PLAYING;
    g->snd_serve = true;

    g->balls[0].active = true;
    g->balls[0].mutation = PONG_MUTATION_NORMAL;
    g->balls[0].radius = PONG_BALL_DEFAULT_RADIUS;
    g->balls[0].curve_accel = 0.0f;
    g->balls[0].curve_dir = 0.0f;
    g->balls[0].curve_timer = 0.0f;
    g->balls[1].active = false;

    float angle_dev = ((float)(pong_rand(g) % 81) - 40.0f); // -40 ~ +40 px/s
    g->balls[0].vx = angle_dev;

    if (g->serve_owner == PONG_SIDE_PLAYER) {
        g->balls[0].x = g->player_paddle_x;
        g->balls[0].y = g->player_paddle_y - g->player_paddle_h / 2.0f - g->balls[0].radius - 1.0f;
        g->balls[0].vy = -PONG_BASE_SPEED_Y;
    } else {
        g->balls[0].x = g->ai_paddle_x;
        g->balls[0].y = g->ai_paddle_y + g->ai_paddle_h / 2.0f + g->balls[0].radius + 1.0f;
        g->balls[0].vy = PONG_BASE_SPEED_Y;
    }
}

void pong_trigger_mutation(pong_game_t *g, pong_mutation_t mutation)
{
    if (!g || g->state != PONG_STATE_PLAYING) return;

    for (int i = 0; i < PONG_MAX_BALLS; i++) {
        if (!g->balls[i].active) continue;
        pong_ball_t *ball = &g->balls[i];
        ball->mutation = mutation;

        switch (mutation) {
            case PONG_MUTATION_NORMAL:
                ball->radius = PONG_BALL_DEFAULT_RADIUS;
                ball->curve_accel = 0.0f;
                ball->curve_dir = 0.0f;
                break;
            case PONG_MUTATION_MEGA_BALL:
                ball->radius = PONG_BALL_MEGA_RADIUS;
                ball->vx *= 0.65f;
                ball->vy *= 0.65f;
                ball->curve_accel = 0.0f;
                break;
            case PONG_MUTATION_HYPER_SPEED:
                ball->radius = PONG_BALL_HYPER_RADIUS;
                ball->vx *= 1.85f;
                ball->vy *= 1.85f;
                ball->curve_accel = 0.0f;
                break;
            case PONG_MUTATION_CURVE_BALL:
                ball->radius = PONG_BALL_DEFAULT_RADIUS;
                ball->curve_dir = (ball->vx >= 0.0f) ? 1.0f : -1.0f;
                ball->curve_accel = ball->curve_dir * 250.0f;
                ball->curve_timer = 0.0f;
                break;
            case PONG_MUTATION_DUAL_BALL:
                ball->radius = PONG_BALL_DEFAULT_RADIUS;
                ball->curve_accel = 0.0f;
                break;
            default:
                break;
        }
    }

    if (mutation == PONG_MUTATION_DUAL_BALL) {
        if (!g->balls[1].active && g->balls[0].active) {
            g->balls[1].active = true;
            g->balls[1].mutation = PONG_MUTATION_DUAL_BALL;
            g->balls[1].radius = PONG_BALL_DEFAULT_RADIUS;
            g->balls[1].x = g->balls[0].x;
            g->balls[1].y = g->balls[0].y;
            g->balls[1].vx = -g->balls[0].vx;
            if (fabsf(g->balls[1].vx) < 30.0f) {
                g->balls[0].vx = 80.0f;
                g->balls[1].vx = -80.0f;
            }
            g->balls[1].vy = g->balls[0].vy * 0.95f;
            g->balls[1].curve_accel = 0.0f;
            g->balls[1].curve_dir = 0.0f;
            g->balls[1].curve_timer = 0.0f;
        }
    } else {
        g->balls[1].active = false;
    }

    g->snd_mutation = true;
}

void pong_logic_input(pong_game_t *g, pong_key_t key, bool pressed)
{
    if (!g) return;

    switch (key) {
        case PONG_KEY_UP:
            g->key_up = pressed;
            if (pressed) {
                pong_move_paddle_left(g, 0.0f);
            }
            break;
        case PONG_KEY_DOWN:
            g->key_down = pressed;
            if (pressed) {
                pong_move_paddle_right(g, 0.0f);
            }
            break;
        case PONG_KEY_OK:
            g->key_ok = pressed;
            if (pressed) {
                if (g->state == PONG_STATE_SERVE) {
                    pong_serve(g);
                } else if (g->state == PONG_STATE_PLAYING) {
                    g->slice_timer_ms = PONG_SLICE_WINDOW_MS;
                } else if (g->state == PONG_STATE_GAME_OVER) {
                    pong_logic_init(g);
                }
            }
            break;
        default:
            break;
    }
}

void pong_logic_update(pong_game_t *g, int dt_ms)
{
    if (!g) return;

    // Reset transient audio / event triggers
    g->snd_hit_paddle = false;
    g->snd_hit_wall = false;
    g->snd_score = false;
    g->snd_slice = false;
    g->snd_mutation = false;
    g->snd_serve = false;
    g->snd_gameover = false;
    g->snd_power = false;
    g->last_slice_hit = false;
    g->last_sweet_spot = false;

    if (dt_ms <= 0) return;
    if (dt_ms > 100) dt_ms = 100;
    float dt_sec = (float)dt_ms / 1000.0f;

    // Key hold continuous paddle movement
    if (g->key_up) {
        g->player_paddle_x -= g->player_speed * dt_sec;
    }
    if (g->key_down) {
        g->player_paddle_x += g->player_speed * dt_sec;
    }
    pong_clamp_paddles(g);

    // Slice window decay
    if (g->slice_timer_ms > 0) {
        g->slice_timer_ms -= dt_ms;
        if (g->slice_timer_ms < 0) g->slice_timer_ms = 0;
    }

    if (g->state == PONG_STATE_GAME_OVER) {
        return;
    }

    if (g->state == PONG_STATE_SERVE) {
        if (g->serve_owner == PONG_SIDE_PLAYER) {
            g->balls[0].x = g->player_paddle_x;
            g->balls[0].y = g->player_paddle_y - g->player_paddle_h / 2.0f - g->balls[0].radius - 1.0f;
        } else {
            g->balls[0].x = g->ai_paddle_x;
            g->balls[0].y = g->ai_paddle_y + g->ai_paddle_h / 2.0f + g->balls[0].radius + 1.0f;
            g->serve_timer_ms -= dt_ms;
            if (g->serve_timer_ms <= 0) {
                pong_serve(g);
            }
        }
        return;
    }

    // AI tracking with reaction delay
    pong_ball_t *target_ball = NULL;
    float best_y = (float)PONG_SCREEN_H + 100.0f;
    for (int i = 0; i < PONG_MAX_BALLS; i++) {
        if (g->balls[i].active) {
            if (g->balls[i].vy < 0.0f && g->balls[i].y < best_y) {
                best_y = g->balls[i].y;
                target_ball = &g->balls[i];
            }
        }
    }
    if (!target_ball) {
        for (int i = 0; i < PONG_MAX_BALLS; i++) {
            if (g->balls[i].active && g->balls[i].y < best_y) {
                best_y = g->balls[i].y;
                target_ball = &g->balls[i];
            }
        }
    }

    g->ai_reaction_timer_ms += dt_ms;
    if (g->ai_reaction_timer_ms >= g->ai_reaction_delay_ms) {
        g->ai_reaction_timer_ms = 0;
        if (target_ball) {
            g->ai_target_x = target_ball->x;
        } else {
            g->ai_target_x = (float)PONG_SCREEN_W / 2.0f;
        }
    }

    float ai_diff = g->ai_target_x - g->ai_paddle_x;
    float max_ai_step = g->ai_speed * dt_sec;
    if (fabsf(ai_diff) <= max_ai_step) {
        g->ai_paddle_x = g->ai_target_x;
    } else if (ai_diff > 0.0f) {
        g->ai_paddle_x += max_ai_step;
    } else {
        g->ai_paddle_x -= max_ai_step;
    }
    pong_clamp_paddles(g);

    // Ball physics & collisions
    for (int b = 0; b < PONG_MAX_BALLS; b++) {
        pong_ball_t *ball = &g->balls[b];
        if (!ball->active) continue;

        // Curvature / spin effect
        if (ball->mutation == PONG_MUTATION_CURVE_BALL) {
            ball->curve_timer += dt_sec;
            ball->vx += ball->curve_accel * dt_sec;
            if (ball->vx > 180.0f) {
                ball->vx = 180.0f;
                ball->curve_accel = -250.0f;
            } else if (ball->vx < -180.0f) {
                ball->vx = -180.0f;
                ball->curve_accel = 250.0f;
            }
        } else if (fabsf(ball->curve_accel) > 1.0f) {
            ball->vx += ball->curve_accel * dt_sec;
            ball->curve_accel *= 0.96f;
        }

        float prev_y = ball->y;
        ball->x += ball->vx * dt_sec;
        ball->y += ball->vy * dt_sec;

        // Left / right screen boundary bounce
        if (ball->x - ball->radius <= 0.0f) {
            ball->x = ball->radius;
            ball->vx = fabsf(ball->vx);
            g->snd_hit_wall = true;
        } else if (ball->x + ball->radius >= (float)PONG_SCREEN_W) {
            ball->x = (float)PONG_SCREEN_W - ball->radius;
            ball->vx = -fabsf(ball->vx);
            g->snd_hit_wall = true;
        }

        // Paddle collisions
        // 1. Player paddle (bottom)
        if (ball->vy > 0.0f) {
            float p_top = g->player_paddle_y - g->player_paddle_h / 2.0f;
            float p_bottom = g->player_paddle_y + g->player_paddle_h / 2.0f;
            float p_left = g->player_paddle_x - g->player_paddle_w / 2.0f;
            float p_right = g->player_paddle_x + g->player_paddle_w / 2.0f;

            if (ball->y + ball->radius >= p_top && prev_y + ball->radius <= p_bottom + 6.0f) {
                if (ball->x + ball->radius >= p_left && ball->x - ball->radius <= p_right) {
                    ball->y = p_top - ball->radius;
                    float offset = (ball->x - g->player_paddle_x) / (g->player_paddle_w / 2.0f);
                    if (offset < -1.0f) offset = -1.0f;
                    if (offset > 1.0f) offset = 1.0f;

                    float spd = sqrtf(ball->vx * ball->vx + ball->vy * ball->vy) * 1.03f;
                    if (spd < 160.0f) spd = 160.0f;
                    if (fabsf(offset) < 0.18f && g->slice_timer_ms <= 0) {
                        spd *= 1.12f;
                        g->last_sweet_spot = true;
                        g->snd_power = true;
                    }
                    float angle = offset * 1.05f; // ~60 deg max angle

                    ball->vx = spd * sinf(angle);
                    ball->vy = -spd * cosf(angle);

                    // Slicing / spin logic
                    if (g->slice_timer_ms > 0) {
                        g->slice_hit_count++;
                        g->last_slice_hit = true;
                        g->snd_slice = true;
                        g->slice_timer_ms = 0;

                        if (g->key_up) {
                            // Active leftward chop: strong negative horizontal speed & spin
                            ball->vx = -fabsf(spd * 0.65f) - 50.0f;
                            ball->curve_accel = -300.0f;
                        } else if (g->key_down) {
                            // Active rightward chop: strong positive horizontal speed & spin
                            ball->vx = fabsf(spd * 0.65f) + 50.0f;
                            ball->curve_accel = 300.0f;
                        } else {
                            float sdir = (offset >= 0.0f) ? 1.0f : -1.0f;
                            ball->vx += sdir * 80.0f;
                            ball->curve_accel = sdir * 260.0f;
                        }
                        ball->vy = -fabsf(spd * 0.85f);
                    }

                    g->rally_hits++;
                    g->total_hits++;
                    g->snd_hit_paddle = true;

                    if (g->rally_hits >= g->mutation_threshold && ball->mutation == PONG_MUTATION_NORMAL) {
                        pong_mutation_t nxt = (pong_rand(g) % (PONG_MUTATION_COUNT - 1)) + 1;
                        pong_trigger_mutation(g, nxt);
                    }
                }
            }
        }

        // 2. AI paddle (top)
        if (ball->vy < 0.0f) {
            float ai_top = g->ai_paddle_y - g->ai_paddle_h / 2.0f;
            float ai_bottom = g->ai_paddle_y + g->ai_paddle_h / 2.0f;
            float ai_left = g->ai_paddle_x - g->ai_paddle_w / 2.0f;
            float ai_right = g->ai_paddle_x + g->ai_paddle_w / 2.0f;

            if (ball->y - ball->radius <= ai_bottom && prev_y - ball->radius >= ai_top - 6.0f) {
                if (ball->x + ball->radius >= ai_left && ball->x - ball->radius <= ai_right) {
                    ball->y = ai_bottom + ball->radius;
                    float offset = (ball->x - g->ai_paddle_x) / (g->ai_paddle_w / 2.0f);
                    if (offset < -1.0f) offset = -1.0f;
                    if (offset > 1.0f) offset = 1.0f;

                    float spd = sqrtf(ball->vx * ball->vx + ball->vy * ball->vy) * 1.03f;
                    if (spd < 160.0f) spd = 160.0f;
                    float angle = offset * 1.05f;

                    ball->vx = spd * sinf(angle);
                    ball->vy = spd * cosf(angle);

                    g->rally_hits++;
                    g->total_hits++;
                    g->snd_hit_paddle = true;

                    if (g->rally_hits >= g->mutation_threshold && ball->mutation == PONG_MUTATION_NORMAL) {
                        pong_mutation_t nxt = (pong_rand(g) % (PONG_MUTATION_COUNT - 1)) + 1;
                        pong_trigger_mutation(g, nxt);
                    }
                }
            }
        }

        // Goal / Out of bounds checks
        // Top goal: Player scores
        if (ball->y + ball->radius < 0.0f) {
            ball->active = false;
            g->player_score++;
            g->last_scorer = PONG_SIDE_PLAYER;
            g->snd_score = true;
            if (g->player_score >= PONG_WINNING_SCORE) {
                g->state = PONG_STATE_GAME_OVER;
                g->winner = PONG_WINNER_PLAYER;
                g->snd_gameover = true;
            }
        }
        // Bottom goal: AI scores
        else if (ball->y - ball->radius > (float)PONG_SCREEN_H) {
            ball->active = false;
            g->ai_score++;
            g->last_scorer = PONG_SIDE_AI;
            g->snd_score = true;
            if (g->ai_score >= PONG_WINNING_SCORE) {
                g->state = PONG_STATE_GAME_OVER;
                g->winner = PONG_WINNER_AI;
                g->snd_gameover = true;
            }
        }
    }

    // Active ball count check
    int active_balls = 0;
    for (int i = 0; i < PONG_MAX_BALLS; i++) {
        if (g->balls[i].active) active_balls++;
    }

    if (active_balls == 0 && g->state != PONG_STATE_GAME_OVER) {
        g->state = PONG_STATE_SERVE;
        g->rally_hits = 0;
        g->serve_owner = g->last_scorer;
        g->serve_timer_ms = 800;

        g->balls[0].active = true;
        g->balls[0].mutation = PONG_MUTATION_NORMAL;
        g->balls[0].radius = PONG_BALL_DEFAULT_RADIUS;
        g->balls[0].vx = 0.0f;
        g->balls[0].vy = 0.0f;
        g->balls[0].curve_accel = 0.0f;
        g->balls[0].curve_dir = 0.0f;
        g->balls[0].curve_timer = 0.0f;
        g->balls[1].active = false;

        if (g->serve_owner == PONG_SIDE_PLAYER) {
            g->balls[0].x = g->player_paddle_x;
            g->balls[0].y = g->player_paddle_y - g->player_paddle_h / 2.0f - g->balls[0].radius - 1.0f;
        } else {
            g->balls[0].x = g->ai_paddle_x;
            g->balls[0].y = g->ai_paddle_y + g->ai_paddle_h / 2.0f + g->balls[0].radius + 1.0f;
        }
    }
}
