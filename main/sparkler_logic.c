#include "sparkler_logic.h"
#include <math.h>
#include <string.h>

#define TWO_PI 6.283185307179586f

// 轻量且确定性的 xorshift 伪随机数生成器
static uint32_t sparkler_prng(uint32_t *state)
{
    uint32_t x = *state;
    if (x == 0) {
        x = 0x87654321;
    }
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}

static float sparkler_randf(uint32_t *state)
{
    return (float)(sparkler_prng(state) & 0x00FFFFFF) / (float)0x01000000;
}

// 粒子对象池分配：优先空闲槽，满员时置换寿命最老微粒
static sparkler_particle_t *sparkler_alloc_particle(sparkler_state_t *s)
{
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (!s->particles[i].active) {
            return &s->particles[i];
        }
    }

    int oldest_idx = 0;
    float max_age_ratio = -1.0f;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        float ratio = (s->particles[i].max_life_ms > 0) ?
            ((float)s->particles[i].life_ms / (float)s->particles[i].max_life_ms) : 1.0f;
        if (ratio > max_age_ratio) {
            max_age_ratio = ratio;
            oldest_idx = i;
        }
    }
    return &s->particles[oldest_idx];
}

// 仙女棒金黄飞溅火花生成
static void spawn_spark_particle(sparkler_state_t *s)
{
    sparkler_particle_t *p = sparkler_alloc_particle(s);
    if (!p) return;

    float bx, by;
    sparkler_get_burn_point(s, &bx, &by);

    p->x = bx + (sparkler_randf(&s->rng_state) - 0.5f) * 6.0f;
    p->y = by + (sparkler_randf(&s->rng_state) - 0.5f) * 6.0f;

    // 全向放射角
    float angle = sparkler_randf(&s->rng_state) * TWO_PI;
    float base_speed = 35.0f + sparkler_randf(&s->rng_state) * 70.0f;

    // 吹气对火花扩散范围的激荡加成
    float speed = base_speed * (1.0f + 2.5f * s->blow_intensity);
    p->vx = cosf(angle) * speed;
    p->vy = sinf(angle) * speed;

    // 吹气带来的微风扬起偏向
    if (s->blow_intensity > 0.05f) {
        p->vy -= (30.0f + sparkler_randf(&s->rng_state) * 60.0f) * s->blow_intensity;
        p->vx += (sparkler_randf(&s->rng_state) - 0.5f) * 45.0f * s->blow_intensity;
    }

    p->life_ms = 0;
    p->max_life_ms = 220 + (sparkler_prng(&s->rng_state) % 260);
    p->brightness = 1.0f;
    p->type = PARTICLE_SPARK;
    p->active = true;

    // 金黄色渐变
    uint32_t colors[] = {0xFFFFFF, 0xFFE066, 0xFFCC00, 0xFFA500};
    p->color = colors[sparkler_prng(&s->rng_state) % 4];
}

// 里程碑爆发高能烟火微粒生成
static void spawn_milestone_burst(sparkler_state_t *s, int milestone)
{
    float bx, by;
    sparkler_get_burn_point(s, &bx, &by);

    int burst_particles = 24;
    for (int i = 0; i < burst_particles; i++) {
        sparkler_particle_t *p = sparkler_alloc_particle(s);
        if (!p) continue;

        p->x = bx;
        p->y = by;

        float angle = ((float)i / (float)burst_particles) * TWO_PI +
                      (sparkler_randf(&s->rng_state) - 0.5f) * 0.25f;
        float speed = 110.0f + sparkler_randf(&s->rng_state) * 90.0f;

        // 吹气同样影响爆点向外扩张幅度
        speed *= (1.0f + 1.5f * s->blow_intensity);

        p->vx = cosf(angle) * speed;
        p->vy = sinf(angle) * speed;

        p->life_ms = 0;
        p->max_life_ms = 450 + (sparkler_prng(&s->rng_state) % 350);
        p->brightness = 1.0f;
        p->type = PARTICLE_BURST;
        p->active = true;

        // 阶段里程碑特色专属色彩
        if (milestone == 25) {
            // 25% 琥珀流金
            uint32_t c[] = {0xFFD700, 0xFFA500, 0xFFFF66, 0xFF8C00};
            p->color = c[sparkler_prng(&s->rng_state) % 4];
        } else if (milestone == 50) {
            // 50% 极光荧蓝
            uint32_t c[] = {0x00FFFF, 0x00BFFF, 0x33CCFF, 0x7DF9FF};
            p->color = c[sparkler_prng(&s->rng_state) % 4];
        } else if (milestone == 75) {
            // 75% 赛博霓红
            uint32_t c[] = {0xFF007F, 0xBA55D3, 0xFF1493, 0xDA70D6};
            p->color = c[sparkler_prng(&s->rng_state) % 4];
        } else {
            // 100% 盛大华彩彩虹烟火
            uint32_t c[] = {0xFF3333, 0x33FF33, 0x3388FF, 0xFFFF00, 0xFF00FF, 0x00FFFF, 0xFFFFFF};
            p->color = c[sparkler_prng(&s->rng_state) % 7];
        }
    }
}

// 蜡烛熄灭后的青烟微粒生成
static void spawn_smoke_particle(sparkler_state_t *s)
{
    sparkler_particle_t *p = sparkler_alloc_particle(s);
    if (!p) return;

    float fx, fy;
    sparkler_get_flame_point(s, &fx, &fy);

    p->x = fx + (sparkler_randf(&s->rng_state) - 0.5f) * 4.0f;
    p->y = fy;

    p->vx = (sparkler_randf(&s->rng_state) - 0.5f) * 16.0f;
    p->vy = -20.0f - sparkler_randf(&s->rng_state) * 30.0f;

    // 吹气导致残烟斜飘
    p->vx += s->blow_intensity * 60.0f;

    p->life_ms = 0;
    p->max_life_ms = 600 + (sparkler_prng(&s->rng_state) % 500);
    p->brightness = 0.75f;
    p->type = PARTICLE_SMOKE;
    p->color = 0xD0D0D0;
    p->active = true;
}

void sparkler_init(sparkler_state_t *s, sparkler_mode_t mode)
{
    if (!s) return;
    memset(s, 0, sizeof(*s));

    s->mode = mode;
    s->blow_intensity = 0.0f;
    s->burn_speed_mult = 1.0f;
    s->particle_density = 1.0f;
    s->rng_state = 0xCAFEBABE;
    s->tick_count = 0;
    s->total_time_ms = 0;

    // 初始化仙女棒状态
    s->sparkler.wick_progress = 0.0f;
    s->sparkler.is_lit = true;
    s->sparkler.milestone_mask = 0;
    s->sparkler.last_milestone = 0;
    s->sparkler.milestone_triggered = false;
    s->sparkler.burst_count = 0;
    s->sparkler.spawn_accum = 0.0f;

    // 初始化蜡烛状态
    s->candle.is_lit = true;
    s->candle.is_smoking = false;
    s->candle.smoke_timer_ms = 0;
    s->candle.wax_height = CANDLE_INIT_WAX_HEIGHT;
    s->candle.wax_melt_height = 0.0f;
    s->candle.flicker = 0.1f;
    s->candle.flame_angle = 0.0f;
    s->candle.blow_hold_ms = 0;
    s->candle.smoke_accum_ms = 0;
}

void sparkler_switch_mode(sparkler_state_t *s, sparkler_mode_t mode)
{
    if (!s) return;
    s->mode = mode;

    // 清空当前活跃粒子，避免模式穿透
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        s->particles[i].active = false;
    }
}

void sparkler_reignite(sparkler_state_t *s)
{
    if (!s) return;

    if (s->mode == MODE_CANDLE) {
        s->candle.is_lit = true;
        s->candle.is_smoking = false;
        s->candle.smoke_timer_ms = 0;
        s->candle.blow_hold_ms = 0;
        s->candle.flicker = 0.1f;
        s->candle.flame_angle = 0.0f;
    } else {
        s->sparkler.wick_progress = 0.0f;
        s->sparkler.is_lit = true;
        s->sparkler.milestone_mask = 0;
        s->sparkler.last_milestone = 0;
        s->sparkler.milestone_triggered = false;
        s->sparkler.burst_count = 0;
        s->sparkler.spawn_accum = 0.0f;
    }
}

void sparkler_set_blow(sparkler_state_t *s, float blow_intensity)
{
    if (!s) return;
    if (blow_intensity < 0.0f) blow_intensity = 0.0f;
    if (blow_intensity > 1.0f) blow_intensity = 1.0f;
    s->blow_intensity = blow_intensity;
}

void sparkler_btn_ok(sparkler_state_t *s)
{
    if (!s) return;

    if (s->mode == MODE_CANDLE) {
        if (!s->candle.is_lit) {
            // 蜡烛已熄灭 -> 重新点燃
            sparkler_reignite(s);
        } else {
            // 蜡烛燃烧中 -> 切换到仙女棒模式
            sparkler_switch_mode(s, MODE_SPARKLER);
        }
    } else {
        if (!s->sparkler.is_lit || s->sparkler.wick_progress >= 1.0f) {
            // 仙女棒已燃尽/熄灭 -> 重新点燃新仙女棒
            sparkler_reignite(s);
        } else {
            // 仙女棒燃烧中 -> 切换到蜡烛模式
            sparkler_switch_mode(s, MODE_CANDLE);
        }
    }
}

void sparkler_btn_up(sparkler_state_t *s)
{
    if (!s) return;
    s->burn_speed_mult += 0.25f;
    if (s->burn_speed_mult > 3.0f) {
        s->burn_speed_mult = 3.0f;
    }
    s->particle_density += 0.25f;
    if (s->particle_density > 3.0f) {
        s->particle_density = 3.0f;
    }
}

void sparkler_btn_down(sparkler_state_t *s)
{
    if (!s) return;
    s->burn_speed_mult -= 0.25f;
    if (s->burn_speed_mult < 0.25f) {
        s->burn_speed_mult = 0.25f;
    }
    s->particle_density -= 0.25f;
    if (s->particle_density < 0.25f) {
        s->particle_density = 0.25f;
    }
}

void sparkler_set_burn_speed(sparkler_state_t *s, float speed_mult)
{
    if (!s) return;
    if (speed_mult < 0.1f) speed_mult = 0.1f;
    if (speed_mult > 5.0f) speed_mult = 5.0f;
    s->burn_speed_mult = speed_mult;
}

void sparkler_set_particle_density(sparkler_state_t *s, float density_mult)
{
    if (!s) return;
    if (density_mult < 0.1f) density_mult = 0.1f;
    if (density_mult > 5.0f) density_mult = 5.0f;
    s->particle_density = density_mult;
}

int sparkler_active_particle_count(const sparkler_state_t *s)
{
    if (!s) return 0;
    int count = 0;
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        if (s->particles[i].active) {
            count++;
        }
    }
    return count;
}

void sparkler_get_burn_point(const sparkler_state_t *s, float *out_x, float *out_y)
{
    if (!s) return;
    if (out_x) *out_x = SPARKLER_STICK_X;
    if (out_y) {
        *out_y = SPARKLER_WICK_TOP + s->sparkler.wick_progress * (SPARKLER_WICK_BOTTOM - SPARKLER_WICK_TOP);
    }
}

void sparkler_get_flame_point(const sparkler_state_t *s, float *out_x, float *out_y)
{
    if (!s) return;
    if (out_x) *out_x = CANDLE_BASE_X;
    if (out_y) {
        *out_y = CANDLE_BASE_Y - s->candle.wax_height;
    }
}

void sparkler_step(sparkler_state_t *s, uint32_t dt_ms)
{
    if (!s || dt_ms == 0) return;

    s->tick_count++;
    s->total_time_ms += dt_ms;
    float dt_sec = (float)dt_ms / 1000.0f;

    // 1. 全局粒子物理更新 (速度、重力、空气阻力、浮力、寿命与亮度衰减)
    for (int i = 0; i < SPARKLER_MAX_PARTICLES; i++) {
        sparkler_particle_t *p = &s->particles[i];
        if (!p->active) continue;

        p->life_ms += dt_ms;
        if (p->life_ms >= p->max_life_ms) {
            p->active = false;
            continue;
        }

        // 坐标推进
        p->x += p->vx * dt_sec;
        p->y += p->vy * dt_sec;

        if (p->type == PARTICLE_SMOKE) {
            // 烟雾粒子具有热浮力向上漂浮并受空气阻力减速
            p->vy -= 35.0f * dt_sec;
            p->vx *= 0.95f;
            p->vy *= 0.96f;
        } else {
            // 火花与碎屑受重力下坠与阻力
            p->vy += 85.0f * dt_sec;
            p->vx *= 0.98f;
            p->vy *= 0.98f;
        }

        // 线性衰减至透明
        p->brightness = 1.0f - ((float)p->life_ms / (float)p->max_life_ms);
        if (p->brightness < 0.0f) {
            p->brightness = 0.0f;
        }
    }

    // 2. 模式特定逻辑
    if (s->mode == MODE_SPARKLER) {
        // 单帧脉冲重置
        s->sparkler.milestone_triggered = false;

        if (s->sparkler.is_lit) {
            // 燃烧进度推进
            float burn_rate = SPARKLER_BASE_BURN_RATE * s->burn_speed_mult;
            // 吹气对仙女棒助燃稍加提速 (1.0x ~ 1.35x)
            burn_rate *= (1.0f + 0.35f * s->blow_intensity);
            s->sparkler.wick_progress += burn_rate * dt_sec;
            if (s->sparkler.wick_progress > 1.0f) {
                s->sparkler.wick_progress = 1.0f;
            }

            // 里程碑检测: 25%, 50%, 75%, 100%
            if (s->sparkler.wick_progress >= 0.25f && !(s->sparkler.milestone_mask & 0x01)) {
                s->sparkler.milestone_mask |= 0x01;
                s->sparkler.last_milestone = 25;
                s->sparkler.milestone_triggered = true;
                s->sparkler.burst_count++;
                spawn_milestone_burst(s, 25);
            }
            if (s->sparkler.wick_progress >= 0.50f && !(s->sparkler.milestone_mask & 0x02)) {
                s->sparkler.milestone_mask |= 0x02;
                s->sparkler.last_milestone = 50;
                s->sparkler.milestone_triggered = true;
                s->sparkler.burst_count++;
                spawn_milestone_burst(s, 50);
            }
            if (s->sparkler.wick_progress >= 0.75f && !(s->sparkler.milestone_mask & 0x04)) {
                s->sparkler.milestone_mask |= 0x04;
                s->sparkler.last_milestone = 75;
                s->sparkler.milestone_triggered = true;
                s->sparkler.burst_count++;
                spawn_milestone_burst(s, 75);
            }
            if (s->sparkler.wick_progress >= 1.00f && !(s->sparkler.milestone_mask & 0x08)) {
                s->sparkler.milestone_mask |= 0x08;
                s->sparkler.last_milestone = 100;
                s->sparkler.milestone_triggered = true;
                s->sparkler.burst_count++;
                spawn_milestone_burst(s, 100);
                s->sparkler.is_lit = false; // 燃尽熄灭
            }

            // 火花生成：吹气时发射频率大幅增加 (激荡效果)
            if (s->sparkler.is_lit) {
                float spawn_rate = 35.0f * s->particle_density * (1.0f + 3.0f * s->blow_intensity);
                s->sparkler.spawn_accum += spawn_rate * dt_sec;
                while (s->sparkler.spawn_accum >= 1.0f) {
                    spawn_spark_particle(s);
                    s->sparkler.spawn_accum -= 1.0f;
                }
            }
        }
    } else if (s->mode == MODE_CANDLE) {
        if (s->candle.is_lit) {
            // 蜡油融化高度递增、剩余蜡身降低
            float melt = CANDLE_MELT_RATE * s->burn_speed_mult * dt_sec;
            s->candle.wax_melt_height += melt;
            s->candle.wax_height -= melt;
            if (s->candle.wax_height < CANDLE_MIN_WAX_HEIGHT) {
                s->candle.wax_height = CANDLE_MIN_WAX_HEIGHT;
            }

            // 火苗晃动幅度 (flicker) 与倾斜角 (flame_angle)
            float t = (float)s->total_time_ms * 0.007f;
            float natural_flicker = 0.08f + 0.04f * sinf(t * 3.1f) + 0.03f * sinf(t * 7.7f);
            // 吹气时火焰剧烈摇曳
            float blow_flicker = s->blow_intensity * 0.85f;
            s->candle.flicker = natural_flicker + blow_flicker;
            if (s->candle.flicker > 1.0f) {
                s->candle.flicker = 1.0f;
            }

            s->candle.flame_angle = s->blow_intensity * 45.0f * (1.0f + 0.2f * sinf(t * 13.0f));

            // 吹气熄灭判定：猛吹 (intensity > 0.7) 持续 200ms
            if (s->blow_intensity > CANDLE_BLOW_EXTINGUISH_THRESHOLD) {
                s->candle.blow_hold_ms += dt_ms;
                if (s->candle.blow_hold_ms >= CANDLE_BLOW_EXTINGUISH_HOLD_MS) {
                    s->candle.is_lit = false;
                    s->candle.is_smoking = true;
                    s->candle.smoke_timer_ms = CANDLE_SMOKE_DURATION_MS;
                    s->candle.flicker = 0.0f;
                    s->candle.flame_angle = 0.0f;
                    s->candle.blow_hold_ms = 0;

                    // 熄灭瞬间爆发一簇青烟
                    for (int i = 0; i < 8; i++) {
                        spawn_smoke_particle(s);
                    }
                }
            } else {
                // 未达持续阈值，重置计时器
                s->candle.blow_hold_ms = 0;
            }
        } else {
            // 熄灭后的冒烟状态
            if (s->candle.is_smoking) {
                if (dt_ms >= s->candle.smoke_timer_ms) {
                    s->candle.smoke_timer_ms = 0;
                    s->candle.is_smoking = false;
                } else {
                    s->candle.smoke_timer_ms -= dt_ms;
                    s->candle.smoke_accum_ms += dt_ms;
                    if (s->candle.smoke_accum_ms >= 60) {
                        s->candle.smoke_accum_ms = 0;
                        spawn_smoke_particle(s);
                    }
                }
            }
        }
    }
}
