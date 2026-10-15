// main/huddle_logic.c —— 《柴犬与海豹的午后温泉》(Fluffy Huddle / 萌物抱抱团) 核心游戏算法引擎
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无外部依赖。
#include "huddle_logic.h"
#include <math.h>
#include <string.h>

#define HUDDLE_PI 3.14159265358979323846f

// =========================================================================
// 静态暖心治愈文本语录库 (零堆分配)
// =========================================================================
static const char* const s_quotes[HUDDLE_QUOTE_COUNT] = {
    // 柴犬·阿柴
    [HUDDLE_QUOTE_SHIBA_1] = "小狗永远觉得你是最棒的！",
    [HUDDLE_QUOTE_SHIBA_2] = "今天辛苦啦，泡个热气腾腾的温泉吧~",
    [HUDDLE_QUOTE_SHIBA_3] = "把烦恼都丢到水里，咕噜咕噜冲走啦！",
    [HUDDLE_QUOTE_SHIBA_4] = "你今天笑起来的样子，比温泉还要温暖呢。",
    // 海豹·糯米
    [HUDDLE_QUOTE_SEAL_1]  = "圆滚滚的我，只想软软地抱住你~",
    [HUDDLE_QUOTE_SEAL_2]  = "糯米海豹吐了个小泡泡：啵！",
    [HUDDLE_QUOTE_SEAL_3]  = "躺平也是超厉害的超能力哦！",
    [HUDDLE_QUOTE_SEAL_4]  = "只要心软软的，世界也会变得软绵绵。",
    // 折耳猫·团子
    [HUDDLE_QUOTE_CAT_1]   = "呼噜呼噜……本喵准许你靠着我休息一会儿。",
    [HUDDLE_QUOTE_CAT_2]   = "揉揉耳朵，今天所有不开心都被猫爪没收啦。",
    [HUDDLE_QUOTE_CAT_3]   = "水温刚刚好，猫猫和你的心都化开啦~",
    [HUDDLE_QUOTE_CAT_4]   = "喵呜~ 世界上最惬意的事就是和你一起泡汤。",
    // 水獭·皮皮
    [HUDDLE_QUOTE_OTTER_1] = "皮皮把最圆的鹅卵石送给你当礼物！",
    [HUDDLE_QUOTE_OTTER_2] = "在水里牵着手，我们就永远不会被冲散啦~",
    [HUDDLE_QUOTE_OTTER_3] = "快乐就像水花，扑通一下就满出来啦！",
    [HUDDLE_QUOTE_OTTER_4] = "生活有急流，但我们可以在平静的湾里晒太阳。",
    // 抚摸治愈互动专属
    [HUDDLE_QUOTE_PET_1]   = "温润的泉水包裹着你，疲惫悄悄融化了。",
    [HUDDLE_QUOTE_PET_2]   = "竹筒添水敲出咚的一声，岁月静好，心生欢喜。",
    [HUDDLE_QUOTE_PET_3]   = "慢慢来，深呼吸，你已经做得足够好啦，抱一个！",
    [HUDDLE_QUOTE_PET_4]   = "让这份温暖一直留在心底，今晚一定会做个好梦。"
};

static const char* const s_species_names[HUDDLE_SPECIES_COUNT] = {
    [HUDDLE_SPECIES_SHIBA] = "阿柴",
    [HUDDLE_SPECIES_SEAL]  = "糯米",
    [HUDDLE_SPECIES_CAT]   = "团子",
    [HUDDLE_SPECIES_OTTER] = "皮皮"
};

static const char* const s_tier_titles[HUDDLE_MAX_TIERS] = {
    "幼崽泡汤",
    "温泉毛巾",
    "樱花头饰",
    "温泉霸主"
};

// =========================================================================
// 内部轻量级 PRNG 与数学辅助
// =========================================================================
static inline uint32_t prng_next(uint32_t *state)
{
    uint32_t x = *state;
    if (x == 0) {
        x = 0x853c49e6;
    }
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}

static inline float prng_range_f(uint32_t *state, float min_v, float max_v)
{
    uint32_t r = prng_next(state);
    float norm = (float)(r & 0xFFFF) / 65535.0f;
    return min_v + norm * (max_v - min_v);
}

static inline float clamp_f(float val, float min_v, float max_v)
{
    if (val < min_v) return min_v;
    if (val > max_v) return max_v;
    return val;
}

// =========================================================================
// 物种与形态属性配置表
// =========================================================================
float huddle_get_species_radius(huddle_species_t sp, uint8_t tier)
{
    if (tier < 1) tier = 1;
    if (tier > HUDDLE_MAX_TIERS) tier = HUDDLE_MAX_TIERS;

    // 基础半径梯队 (Tier 1: 14px, Tier 2: 20px, Tier 3: 27px, Tier 4: 35px)
    static const float base_r[HUDDLE_MAX_TIERS] = { 14.0f, 20.0f, 27.0f, 35.0f };
    float r = base_r[tier - 1];

    switch (sp) {
    case HUDDLE_SPECIES_SEAL:
        r += 1.0f; // 海豹更肥美圆滚
        break;
    case HUDDLE_SPECIES_CAT:
        r -= 1.0f; // 猫咪相对精巧玲珑
        break;
    case HUDDLE_SPECIES_SHIBA:
    case HUDDLE_SPECIES_OTTER:
    default:
        break;
    }
    return r;
}

float huddle_get_species_mass(huddle_species_t sp, uint8_t tier)
{
    float r = huddle_get_species_radius(sp, tier);
    // 质量正比于体积 (在 2D 中近似面积)
    return (r * r) * 0.015f;
}

float huddle_get_species_restitution(huddle_species_t sp, uint8_t tier)
{
    (void)tier;
    switch (sp) {
    case HUDDLE_SPECIES_SEAL:
        return 0.58f; // 海豹极其软糯 Q 弹
    case HUDDLE_SPECIES_CAT:
        return 0.48f; // 折耳猫轻巧活泼
    case HUDDLE_SPECIES_OTTER:
        return 0.44f;
    case HUDDLE_SPECIES_SHIBA:
    default:
        return 0.40f; // 柴犬沉稳憨厚
    }
}

float huddle_get_species_stiffness(huddle_species_t sp, uint8_t tier)
{
    (void)tier;
    switch (sp) {
    case HUDDLE_SPECIES_SEAL:
        return 14.0f; // 软弹低刚度，挤压变形维持时间长
    case HUDDLE_SPECIES_CAT:
        return 26.0f; // 高刚度，快速回弹
    case HUDDLE_SPECIES_OTTER:
        return 18.0f;
    case HUDDLE_SPECIES_SHIBA:
    default:
        return 21.0f;
    }
}

// =========================================================================
// 音效事件内部入队与消费
// =========================================================================
static void sound_enqueue(huddle_game_t *g, huddle_sound_t snd)
{
    if (snd == HUDDLE_SND_NONE) return;

    g->pending_sound = snd;
    g->sound_q.queue[g->sound_q.tail] = snd;
    g->sound_q.tail = (uint8_t)((g->sound_q.tail + 1) % HUDDLE_MAX_SOUND_QUEUE);
    if (g->sound_q.count < HUDDLE_MAX_SOUND_QUEUE) {
        g->sound_q.count++;
    } else {
        // 队列满时覆盖最旧未消费音效，队首前移保持最新事件
        g->sound_q.head = (uint8_t)((g->sound_q.head + 1) % HUDDLE_MAX_SOUND_QUEUE);
    }
}

huddle_sound_t huddle_sound_dequeue(huddle_game_t *g)
{
    if (!g || g->sound_q.count == 0) {
        return HUDDLE_SND_NONE;
    }
    huddle_sound_t s = g->sound_q.queue[g->sound_q.head];
    g->sound_q.head = (uint8_t)((g->sound_q.head + 1) % HUDDLE_MAX_SOUND_QUEUE);
    g->sound_q.count--;
    return s;
}

huddle_sound_t huddle_sound_peek(const huddle_game_t *g)
{
    if (!g || g->sound_q.count == 0) {
        return HUDDLE_SND_NONE;
    }
    return g->sound_q.queue[g->sound_q.head];
}

void huddle_sound_clear(huddle_game_t *g)
{
    if (!g) return;
    g->sound_q.head = 0;
    g->sound_q.tail = 0;
    g->sound_q.count = 0;
    g->pending_sound = HUDDLE_SND_NONE;
}

// =========================================================================
// 暖心语录查询与触发
// =========================================================================
const char* huddle_quote_get_text(huddle_quote_id_t id)
{
    if (id >= HUDDLE_QUOTE_COUNT) {
        return "";
    }
    return s_quotes[id];
}

const char* huddle_quote_get_current(const huddle_game_t *g)
{
    if (!g || !g->quote.active) {
        return NULL;
    }
    return huddle_quote_get_text(g->quote.quote_id);
}

void huddle_quote_trigger(huddle_game_t *g, huddle_quote_id_t id)
{
    if (!g) return;
    if (id >= HUDDLE_QUOTE_COUNT) return;
    g->quote.active = true;
    g->quote.quote_id = id;
    g->quote.timer_ms = HUDDLE_QUOTE_DISPLAY_MS;
}

const char* huddle_species_get_name(huddle_species_t sp)
{
    if (sp >= HUDDLE_SPECIES_COUNT) return "萌物";
    return s_species_names[sp];
}

const char* huddle_tier_get_title(uint8_t tier)
{
    if (tier < 1 || tier > HUDDLE_MAX_TIERS) return "";
    return s_tier_titles[tier - 1];
}

// =========================================================================
// 粒子发射与对象池
// =========================================================================
void huddle_emit_particles(huddle_game_t *g, huddle_particle_type_t type,
                           float x, float y, int count)
{
    if (!g || count <= 0) return;

    for (int i = 0; i < count; i++) {
        // 查找空闲粒子槽
        huddle_particle_t *p = NULL;
        for (int j = 0; j < HUDDLE_MAX_PARTICLES; j++) {
            if (!g->particles[j].active) {
                p = &g->particles[j];
                break;
            }
        }
        if (!p) break; // 粒子池满

        p->active = true;
        p->type = type;
        p->x = x + prng_range_f(&g->rng_state, -4.0f, 4.0f);
        p->y = y + prng_range_f(&g->rng_state, -4.0f, 4.0f);
        p->alpha = 1.0f;

        switch (type) {
        case HUDDLE_PART_SAKURA:
            // 樱花轻盈散开，向下缓缓飘落旋转
            p->vx = prng_range_f(&g->rng_state, -65.0f, 65.0f);
            p->vy = prng_range_f(&g->rng_state, -90.0f, -20.0f);
            p->life_ms = p->max_life_ms = prng_range_f(&g->rng_state, 1200.0f, 2000.0f);
            p->size = prng_range_f(&g->rng_state, 3.5f, 6.0f);
            p->rotation_deg = prng_range_f(&g->rng_state, 0.0f, 360.0f);
            p->rot_speed = prng_range_f(&g->rng_state, -180.0f, 180.0f);
            break;

        case HUDDLE_PART_WATER_SPLASH:
            // 温水水花四溅
            p->vx = prng_range_f(&g->rng_state, -70.0f, 70.0f);
            p->vy = prng_range_f(&g->rng_state, -140.0f, -60.0f);
            p->life_ms = p->max_life_ms = prng_range_f(&g->rng_state, 400.0f, 750.0f);
            p->size = prng_range_f(&g->rng_state, 2.0f, 4.0f);
            p->rotation_deg = 0.0f;
            p->rot_speed = 0.0f;
            break;

        case HUDDLE_PART_STEAM_BUBBLE:
            // 温泉热气微泡，轻柔缓慢向上漂浮
            p->vx = prng_range_f(&g->rng_state, -10.0f, 10.0f);
            p->vy = prng_range_f(&g->rng_state, -35.0f, -18.0f);
            p->life_ms = p->max_life_ms = prng_range_f(&g->rng_state, 1500.0f, 2600.0f);
            p->size = prng_range_f(&g->rng_state, 2.5f, 5.0f);
            p->rotation_deg = 0.0f;
            p->rot_speed = 0.0f;
            break;

        case HUDDLE_PART_HEART:
            // 治愈粉红爱心，向上悠扬升起
            p->vx = prng_range_f(&g->rng_state, -25.0f, 25.0f);
            p->vy = prng_range_f(&g->rng_state, -65.0f, -30.0f);
            p->life_ms = p->max_life_ms = prng_range_f(&g->rng_state, 1000.0f, 1600.0f);
            p->size = prng_range_f(&g->rng_state, 5.0f, 8.0f);
            p->rotation_deg = 0.0f;
            p->rot_speed = 0.0f;
            break;

        case HUDDLE_PART_RIPPLE:
        default:
            p->vx = 0.0f;
            p->vy = 0.0f;
            p->life_ms = p->max_life_ms = 700.0f;
            p->size = 4.0f;
            p->rotation_deg = 0.0f;
            p->rot_speed = 0.0f;
            break;
        }
    }
}

// =========================================================================
// 动物生成与对象池
// =========================================================================
int huddle_spawn_animal(huddle_game_t *g, huddle_species_t sp, uint8_t tier,
                        float x, float y, float vx, float vy)
{
    if (!g) return -1;
    if (tier < 1) tier = 1;
    if (tier > HUDDLE_MAX_TIERS) tier = HUDDLE_MAX_TIERS;
    if (sp >= HUDDLE_SPECIES_COUNT) sp = HUDDLE_SPECIES_SHIBA;

    // 查找空闲槽位
    int slot = -1;
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        if (!g->animals[i].active) {
            slot = i;
            break;
        }
    }
    if (slot < 0) {
        return -1; // 池已满
    }

    huddle_animal_t *a = &g->animals[slot];
    memset(a, 0, sizeof(huddle_animal_t));
    a->active = true;
    a->species = sp;
    a->tier = tier;
    a->x = x;
    a->y = y;
    a->vx = vx;
    a->vy = vy;
    a->radius = huddle_get_species_radius(sp, tier);
    a->mass = huddle_get_species_mass(sp, tier);
    a->restitution = huddle_get_species_restitution(sp, tier);
    a->squish_stiffness = huddle_get_species_stiffness(sp, tier);
    a->squish_damping = HUDDLE_SQUISH_DAMPING_BASE;
    a->squish_x = 1.0f;
    a->squish_y = 1.0f;
    a->squish_vx = 0.0f;
    a->squish_vy = 0.0f;
    a->breath_phase = prng_range_f(&g->rng_state, 0.0f, 6.28f);
    a->breath_scale = 1.0f;
    a->in_water = (y + a->radius >= HUDDLE_WATER_SURFACE_Y);
    a->state = a->in_water ? HUDDLE_ANIMAL_STATE_IN_WATER : HUDDLE_ANIMAL_STATE_FALLING;
    a->settled = false;
    a->age_ms = 0;
    a->merge_lock_ms = 0;

    return slot;
}

int huddle_get_animal_count(const huddle_game_t *g)
{
    if (!g) return 0;
    int count = 0;
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        if (g->animals[i].active) count++;
    }
    return count;
}

int huddle_get_particle_count(const huddle_game_t *g)
{
    if (!g) return 0;
    int count = 0;
    for (int i = 0; i < HUDDLE_MAX_PARTICLES; i++) {
        if (g->particles[i].active) count++;
    }
    return count;
}

// 刷新滑轨小动物：由下一个填充当前，并生成新的下一个
static void dropper_roll_next(huddle_game_t *g)
{
    g->dropper.cur_species = g->dropper.next_species;
    g->dropper.cur_tier = g->dropper.next_tier;

    // 下一只小动物：随机物种，绝大多数为 Tier 1 (85%)，少量 Tier 2 (15%)
    g->dropper.next_species = (huddle_species_t)(prng_next(&g->rng_state) % HUDDLE_SPECIES_COUNT);
    uint32_t tier_roll = prng_next(&g->rng_state) % 100;
    g->dropper.next_tier = (tier_roll < 15) ? 2 : 1;

    g->dropper.ready = true;
    g->dropper.reload_timer_ms = 0;
}

// =========================================================================
// 核心生命周期 API 实现
// =========================================================================
void huddle_game_init(huddle_game_t *g, uint32_t seed)
{
    if (!g) return;
    memset(g, 0, sizeof(huddle_game_t));

    g->rng_state = (seed != 0) ? seed : 0x20260919;
    g->state = HUDDLE_STATE_PLAYING;
    g->game_time_ms = 0;

    // 滑轨初始化在居中位置
    g->dropper.x = (HUDDLE_RAIL_MIN_X + HUDDLE_RAIL_MAX_X) * 0.5f;
    g->dropper.cur_species = (huddle_species_t)(prng_next(&g->rng_state) % HUDDLE_SPECIES_COUNT);
    g->dropper.cur_tier = 1;
    g->dropper.next_species = (huddle_species_t)(prng_next(&g->rng_state) % HUDDLE_SPECIES_COUNT);
    g->dropper.next_tier = 1;
    g->dropper.ready = true;
    g->dropper.reload_timer_ms = 0;

    g->score = 0;
    g->merge_count = 0;
    g->drop_count = 0;
    g->pet_count = 0;
    g->combo_streak = 0;
    g->combo_timer_ms = 0;

    g->overflow_danger = false;
    g->overflow_timer_ms = 0;

    g->zen_mode = false;
    g->idle_timer_ms = 0;
    g->shishi_odoshi_timer_ms = 0;
    g->zen_bubble_timer_ms = 0;
    g->water_wave_phase = 0.0f;

    g->quote.active = false;
    g->quote.timer_ms = 0;
    g->quote.quote_id = HUDDLE_QUOTE_SHIBA_1;

    huddle_sound_clear(g);
}

void huddle_game_reset(huddle_game_t *g)
{
    if (!g) return;
    uint32_t seed = g->rng_state;
    huddle_game_init(g, seed);
}

void huddle_game_pause(huddle_game_t *g)
{
    if (!g) return;
    if (g->state == HUDDLE_STATE_PLAYING) {
        g->state = HUDDLE_STATE_PAUSED;
    }
}

void huddle_game_resume(huddle_game_t *g)
{
    if (!g) return;
    if (g->state == HUDDLE_STATE_PAUSED) {
        g->state = HUDDLE_STATE_PLAYING;
    }
}

bool huddle_game_is_game_over(const huddle_game_t *g)
{
    return g && (g->state == HUDDLE_STATE_GAMEOVER);
}

bool huddle_game_is_paused(const huddle_game_t *g)
{
    return g && (g->state == HUDDLE_STATE_PAUSED);
}

void huddle_set_zen_mode(huddle_game_t *g, bool zen)
{
    if (!g) return;
    g->zen_mode = zen;
    if (!zen) {
        g->idle_timer_ms = 0;
    }
}

// =========================================================================
// 用户交互与按键输入
// =========================================================================
void huddle_input_up(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return;
    g->idle_timer_ms = 0;
    g->zen_mode = false;

    float cur_r = huddle_get_species_radius(g->dropper.cur_species, g->dropper.cur_tier);
    float min_x = HUDDLE_POOL_LEFT + cur_r + 2.0f;
    if (min_x < HUDDLE_RAIL_MIN_X) min_x = HUDDLE_RAIL_MIN_X;

    g->dropper.x -= HUDDLE_RAIL_STEP;
    if (g->dropper.x < min_x) {
        g->dropper.x = min_x;
    }
}

void huddle_input_down(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return;
    g->idle_timer_ms = 0;
    g->zen_mode = false;

    float cur_r = huddle_get_species_radius(g->dropper.cur_species, g->dropper.cur_tier);
    float max_x = HUDDLE_POOL_RIGHT - cur_r - 2.0f;
    if (max_x > HUDDLE_RAIL_MAX_X) max_x = HUDDLE_RAIL_MAX_X;

    g->dropper.x += HUDDLE_RAIL_STEP;
    if (g->dropper.x > max_x) {
        g->dropper.x = max_x;
    }
}

void huddle_input_set_rail_x(huddle_game_t *g, float x)
{
    if (!g) return;
    float cur_r = huddle_get_species_radius(g->dropper.cur_species, g->dropper.cur_tier);
    float min_x = HUDDLE_POOL_LEFT + cur_r + 2.0f;
    float max_x = HUDDLE_POOL_RIGHT - cur_r - 2.0f;
    if (min_x < HUDDLE_RAIL_MIN_X) min_x = HUDDLE_RAIL_MIN_X;
    if (max_x > HUDDLE_RAIL_MAX_X) max_x = HUDDLE_RAIL_MAX_X;

    g->dropper.x = clamp_f(x, min_x, max_x);
}

bool huddle_drop_current(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return false;
    if (!g->dropper.ready) return false;

    // 从滑轨投放当前小动物
    float drop_x = g->dropper.x;
    float drop_y = HUDDLE_RAIL_Y + 12.0f;
    float initial_vy = 50.0f; // 初始轻微向下初速

    int slot = huddle_spawn_animal(g, g->dropper.cur_species, g->dropper.cur_tier,
                                   drop_x, drop_y, 0.0f, initial_vy);
    if (slot < 0) {
        // 池子已满，无法投放
        return false;
    }

    g->drop_count++;
    g->dropper.ready = false;
    g->dropper.reload_timer_ms = HUDDLE_DROP_COOLDOWN_MS;

    // 播放竹筒添水敲击声 (鹿威敲击脆响)
    sound_enqueue(g, HUDDLE_SND_SHISHI_ODOSHI);

    return true;
}

void huddle_trigger_pet(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return;

    g->pet_count++;
    g->score += 15; // 抚摸抚慰温暖值奖励

    // 触发舒适呼噜声与爱心音效
    sound_enqueue(g, HUDDLE_SND_PURR);
    sound_enqueue(g, HUDDLE_SND_PET_HEART);

    // 随机挑选一句抚摸治愈语录
    uint32_t quote_offset = prng_next(&g->rng_state) % 4;
    huddle_quote_trigger(g, (huddle_quote_id_t)(HUDDLE_QUOTE_PET_1 + quote_offset));

    // 寻找离滑轨最近的小动物，或在滑轨附近产生爱心
    float pet_x = g->dropper.x;
    float pet_y = HUDDLE_WATER_SURFACE_Y + 30.0f;

    float min_dist_sq = 1e9f;
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        if (!g->animals[i].active) continue;
        float dx = g->animals[i].x - g->dropper.x;
        float dy = g->animals[i].y - HUDDLE_WATER_SURFACE_Y;
        float d2 = dx * dx + dy * dy;
        if (d2 < min_dist_sq) {
            min_dist_sq = d2;
            pet_x = g->animals[i].x;
            pet_y = g->animals[i].y;
        }
        // 全池动物因抚摸感到舒适，产生 Q 弹轻柔膨胀
        g->animals[i].squish_y = 1.15f;
        g->animals[i].squish_x = 0.92f;
    }

    // 迸发治愈爱心粒子
    huddle_emit_particles(g, HUDDLE_PART_HEART, pet_x, pet_y - 10.0f, 6);
}

void huddle_input_ok_press(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return;
    g->idle_timer_ms = 0;
    g->zen_mode = false;
    g->ok_key_down = true;
    g->ok_press_duration_ms = 0;
    g->pet_triggered_this_press = false;
}

void huddle_input_ok_release(huddle_game_t *g)
{
    if (!g || g->state != HUDDLE_STATE_PLAYING) return;
    g->idle_timer_ms = 0;
    g->zen_mode = false;

    if (!g->pet_triggered_this_press) {
        // 短按：投放动物
        huddle_drop_current(g);
    }

    g->ok_key_down = false;
    g->ok_press_duration_ms = 0;
    g->pet_triggered_this_press = false;
}

// =========================================================================
// 物理引擎：果冻弹性、碰撞与融合逻辑
// =========================================================================

// 更新果冻弹簧阻尼形变振动
static void update_jelly_squish(huddle_animal_t *a, float dt)
{
    // X 轴弹簧阻尼系统
    float k_x = a->squish_stiffness;
    float d_x = a->squish_damping;
    float disp_x = a->squish_x - 1.0f;
    float acc_x = -k_x * disp_x - d_x * a->squish_vx;
    a->squish_vx += acc_x * dt;
    a->squish_x += a->squish_vx * dt;

    // Y 轴弹簧阻尼系统
    float k_y = a->squish_stiffness;
    float d_y = a->squish_damping;
    float disp_y = a->squish_y - 1.0f;
    float acc_y = -k_y * disp_y - d_y * a->squish_vy;
    a->squish_vy += acc_y * dt;
    a->squish_y += a->squish_vy * dt;

    // 限制在安全生理范围内
    a->squish_x = clamp_f(a->squish_x, 0.60f, 1.50f);
    a->squish_y = clamp_f(a->squish_y, 0.60f, 1.50f);
}

// 执行两只动物之间的碰撞与抱团融合
static void resolve_animal_pair(huddle_game_t *g, int i, int j)
{
    huddle_animal_t *a1 = &g->animals[i];
    huddle_animal_t *a2 = &g->animals[j];

    if (!a1->active || !a2->active) return;

    float dx = a2->x - a1->x;
    float dy = a2->y - a1->y;
    float dist_sq = dx * dx + dy * dy;
    float r_sum = a1->radius + a2->radius;

    if (dist_sq >= r_sum * r_sum) {
        return; // 无接触
    }

    float dist = sqrtf(dist_sq);
    float nx = 0.0f;
    float ny = -1.0f;
    if (dist > 0.0001f) {
        nx = dx / dist;
        ny = dy / dist;
    } else {
        dist = 0.0001f;
    }

    float overlap = r_sum - dist;

    // ---------------------------------------------------------------------
    // 判定是否满足【果冻抱团融合进阶】条件
    // ---------------------------------------------------------------------
    bool can_merge = (a1->species == a2->species) &&
                     (a1->tier == a2->tier) &&
                     (a1->tier < HUDDLE_MAX_TIERS) &&
                     (a1->merge_lock_ms == 0) &&
                     (a2->merge_lock_ms == 0);

    if (can_merge) {
        // 触发进阶融合！
        uint8_t new_tier = (uint8_t)(a1->tier + 1);
        huddle_species_t sp = a1->species;

        // 质心与动量守恒位置
        float m1 = a1->mass;
        float m2 = a2->mass;
        float total_m = m1 + m2;
        float center_x = (a1->x * m1 + a2->x * m2) / total_m;
        float center_y = (a1->y * m1 + a2->y * m2) / total_m;
        float center_vx = (a1->vx * m1 + a2->vx * m2) / total_m;
        float center_vy = (a1->vy * m1 + a2->vy * m2) / total_m - 20.0f; // 惬意微跃

        // 将 a1 升级并重新设置物理属性
        a1->tier = new_tier;
        a1->x = center_x;
        a1->y = center_y;
        a1->vx = center_vx;
        a1->vy = center_vy;
        a1->radius = huddle_get_species_radius(sp, new_tier);
        a1->mass = huddle_get_species_mass(sp, new_tier);
        a1->restitution = huddle_get_species_restitution(sp, new_tier);
        a1->squish_stiffness = huddle_get_species_stiffness(sp, new_tier);
        // 激发剧烈 Q 弹果冻膨胀爆发感
        a1->squish_x = 1.38f;
        a1->squish_y = 1.38f;
        a1->squish_vx = 0.0f;
        a1->squish_vy = 0.0f;
        a1->merge_lock_ms = 400; // 400ms 融合防连击锁定

        // 回收 a2 到对象池
        a2->active = false;

        // 得分计算与连击
        uint32_t base_score = 0;
        if (new_tier == 2) base_score = 20;
        else if (new_tier == 3) base_score = 60;
        else if (new_tier == 4) base_score = 150;

        g->combo_streak++;
        g->combo_timer_ms = 2200;
        uint32_t total_gain = base_score + (g->combo_streak > 1 ? (g->combo_streak * 10) : 0);
        g->score += total_gain;
        g->merge_count++;

        // 迸发樱花温水粒子与水滴
        huddle_emit_particles(g, HUDDLE_PART_SAKURA, center_x, center_y, 12);
        huddle_emit_particles(g, HUDDLE_PART_WATER_SPLASH, center_x, center_y, 6);

        // 播放进阶琶音
        sound_enqueue(g, HUDDLE_SND_MERGE_ARPEGGIO);

        // 触发对应的物种治愈语录
        uint32_t base_quote = 0;
        switch (sp) {
        case HUDDLE_SPECIES_SHIBA: base_quote = HUDDLE_QUOTE_SHIBA_1; break;
        case HUDDLE_SPECIES_SEAL:  base_quote = HUDDLE_QUOTE_SEAL_1;  break;
        case HUDDLE_SPECIES_CAT:   base_quote = HUDDLE_QUOTE_CAT_1;   break;
        case HUDDLE_SPECIES_OTTER: base_quote = HUDDLE_QUOTE_OTTER_1; break;
        default: break;
        }
        uint32_t offset = (new_tier - 2) % 4; // 针对不同 Tier 触发语录
        huddle_quote_trigger(g, (huddle_quote_id_t)(base_quote + offset));

        return;
    }

    // ---------------------------------------------------------------------
    // 普通果冻弹性碰撞解析 (位置分离 + 冲量反弹 + Q弹挤压)
    // ---------------------------------------------------------------------
    float m1 = a1->mass;
    float m2 = a2->mass;
    float total_m = m1 + m2;

    // 位置投影分离，避免穿透
    a1->x -= nx * overlap * (m2 / total_m);
    a1->y -= ny * overlap * (m2 / total_m);
    a2->x += nx * overlap * (m1 / total_m);
    a2->y += ny * overlap * (m1 / total_m);

    // 相对法向速度 (nx, ny 方向从 a1 指向 a2)
    float rel_vx = a2->vx - a1->vx;
    float rel_vy = a2->vy - a1->vy;
    float rel_vn = rel_vx * nx + rel_vy * ny;

    if (rel_vn < 0.0f) {
        // 两物体正在接近，计算弹性恢复冲量 (impulse > 0)
        float e = (a1->restitution + a2->restitution) * 0.5f;
        float impulse = -(1.0f + e) * rel_vn / (1.0f / m1 + 1.0f / m2);

        // a1 沿 -n 受反冲，a2 沿 +n 受反冲
        a1->vx -= (impulse / m1) * nx;
        a1->vy -= (impulse / m1) * ny;
        a2->vx += (impulse / m2) * nx;
        a2->vy += (impulse / m2) * ny;

        // 产生法向压缩与切向拉伸果冻形变 (保持体积守恒感受)
        float imp_f = clamp_f(fabsf(rel_vn) * 0.005f, 0.06f, 0.35f);
        float sq_x_effect = (fabsf(nx) - fabsf(ny) * 0.6f) * imp_f;
        float sq_y_effect = (fabsf(ny) - fabsf(nx) * 0.6f) * imp_f;

        a1->squish_x -= sq_x_effect;
        a1->squish_y -= sq_y_effect;
        a2->squish_x -= sq_x_effect;
        a2->squish_y -= sq_y_effect;

        // 碰撞强度大于阈值时，播放 Q 弹挤压声
        if (fabsf(rel_vn) > 18.0f) {
            sound_enqueue(g, HUDDLE_SND_SQUISH);
        }
    }
}

// =========================================================================
// 主步进循环
// =========================================================================
void huddle_game_step(huddle_game_t *g, uint32_t dt_ms)
{
    if (!g || g->state == HUDDLE_STATE_PAUSED || g->state == HUDDLE_STATE_GAMEOVER) {
        return;
    }

    float dt = (float)dt_ms / 1000.0f;
    if (dt > 0.05f) dt = 0.05f; // 防止长帧步进穿模

    g->game_time_ms += dt_ms;

    // 1. 滑轨重新装填冷却计时
    if (!g->dropper.ready) {
        if (g->dropper.reload_timer_ms <= dt_ms) {
            dropper_roll_next(g);
        } else {
            g->dropper.reload_timer_ms -= dt_ms;
        }
    }

    // 2. 长按抚摸计时与判定
    if (g->ok_key_down) {
        g->ok_press_duration_ms += dt_ms;
        if (!g->pet_triggered_this_press && g->ok_press_duration_ms >= HUDDLE_LONG_PRESS_MS) {
            huddle_trigger_pet(g);
            g->pet_triggered_this_press = true;
        }
    }

    // 3. 空闲与沉浸放置模式 (Zen Mode)
    g->idle_timer_ms += dt_ms;
    if (!g->zen_mode && g->idle_timer_ms >= HUDDLE_ZEN_IDLE_TIMEOUT_MS) {
        g->zen_mode = true;
    }

    // 沉浸放置模式下：竹筒添水敲击、池底微泡喷发、水面波澜
    g->water_wave_phase += dt * 1.8f;
    if (g->water_wave_phase > 2.0f * HUDDLE_PI) {
        g->water_wave_phase -= 2.0f * HUDDLE_PI;
    }

    if (g->zen_mode) {
        // 竹筒添水敲击循环
        g->shishi_odoshi_timer_ms += dt_ms;
        if (g->shishi_odoshi_timer_ms >= HUDDLE_SHISHI_ODOSHI_PERIOD_MS) {
            g->shishi_odoshi_timer_ms = 0;
            sound_enqueue(g, HUDDLE_SND_SHISHI_ODOSHI);
            huddle_emit_particles(g, HUDDLE_PART_RIPPLE, HUDDLE_POOL_LEFT + 20.0f, HUDDLE_WATER_SURFACE_Y, 2);
        }

        // 池底温泉热气微泡发射
        g->zen_bubble_timer_ms += dt_ms;
        if (g->zen_bubble_timer_ms >= HUDDLE_ZEN_BUBBLE_INTERVAL_MS) {
            g->zen_bubble_timer_ms = 0;
            float bubble_x = prng_range_f(&g->rng_state, HUDDLE_POOL_LEFT + 25.0f, HUDDLE_POOL_RIGHT - 25.0f);
            huddle_emit_particles(g, HUDDLE_PART_STEAM_BUBBLE, bubble_x, HUDDLE_POOL_BOTTOM - 8.0f, 2);
        }
    }

    // 4. 暖心语录显示计时
    if (g->quote.active) {
        if (g->quote.timer_ms <= dt_ms) {
            g->quote.active = false;
            g->quote.timer_ms = 0;
        } else {
            g->quote.timer_ms -= dt_ms;
        }
    }

    // 5. 连击窗口倒计时
    if (g->combo_timer_ms > 0) {
        if (g->combo_timer_ms <= dt_ms) {
            g->combo_timer_ms = 0;
            g->combo_streak = 0;
        } else {
            g->combo_timer_ms -= dt_ms;
        }
    }

    // 6. 物理积分更新 (每个动物个体)
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        huddle_animal_t *a = &g->animals[i];
        if (!a->active) continue;

        a->age_ms += dt_ms;
        if (a->merge_lock_ms > 0) {
            if (a->merge_lock_ms <= dt_ms) a->merge_lock_ms = 0;
            else a->merge_lock_ms -= dt_ms;
        }

        // 呼吸微动相位
        a->breath_phase += dt * 2.2f;
        if (a->breath_phase > 2.0f * HUDDLE_PI) a->breath_phase -= 2.0f * HUDDLE_PI;
        a->breath_scale = 1.0f + 0.04f * sinf(a->breath_phase);

        // 果冻弹簧振动
        update_jelly_squish(a, dt);

        // 判断是否位于水中
        float bottom_edge = a->y + a->radius;
        if (bottom_edge < HUDDLE_WATER_SURFACE_Y) {
            // 空气中：无阻尼自由下落
            a->vy += HUDDLE_GRAVITY_AIR * dt;
            a->vx *= (1.0f - 0.2f * dt);
            a->in_water = false;
            a->state = HUDDLE_ANIMAL_STATE_FALLING;
        } else {
            // 刚刚入水瞬间判定
            if (!a->in_water) {
                a->in_water = true;
                a->state = HUDDLE_ANIMAL_STATE_IN_WATER;
                // 冲刷阻尼衰减与噗通音效
                a->vy *= HUDDLE_SPLASH_VELOCITY_DAMP;
                sound_enqueue(g, HUDDLE_SND_SPLASH);
                // 激起水花与水面涟漪粒子
                huddle_emit_particles(g, HUDDLE_PART_WATER_SPLASH, a->x, HUDDLE_WATER_SURFACE_Y, 8);
                huddle_emit_particles(g, HUDDLE_PART_RIPPLE, a->x, HUDDLE_WATER_SURFACE_Y, 2);
            }

            // 水中动力学：计算浸没率与有效浮力
            float submerged = (bottom_edge - HUDDLE_WATER_SURFACE_Y) / (2.0f * a->radius);
            submerged = clamp_f(submerged, 0.0f, 1.0f);

            float buoyancy_force = submerged * HUDDLE_WATER_BUOYANCY_ACCEL;
            float net_acc_y = HUDDLE_GRAVITY_WATER - buoyancy_force;
            a->vy += net_acc_y * dt;

            // 水流粘滞阻尼
            float drag_x = 1.0f - HUDDLE_WATER_DRAG_X * dt;
            float drag_y = 1.0f - HUDDLE_WATER_DRAG_Y * dt;
            if (drag_x < 0.0f) drag_x = 0.0f;
            if (drag_y < 0.0f) drag_y = 0.0f;
            a->vx *= drag_x;
            a->vy *= drag_y;

            // 放置模式下温泉微流正弦漂移
            float flow = sinf(g->water_wave_phase + a->x * 0.04f) * 4.5f;
            a->vx += flow * dt;
        }

        // 位置推进
        a->x += a->vx * dt;
        a->y += a->vy * dt;

        // 温泉池左壁碰撞
        if (a->x - a->radius < HUDDLE_POOL_LEFT) {
            a->x = HUDDLE_POOL_LEFT + a->radius;
            a->vx = -a->vx * a->restitution;
            a->squish_x = 0.85f;
        }
        // 温泉池右壁碰撞
        if (a->x + a->radius > HUDDLE_POOL_RIGHT) {
            a->x = HUDDLE_POOL_RIGHT - a->radius;
            a->vx = -a->vx * a->restitution;
            a->squish_x = 0.85f;
        }
        // 温泉池底碰撞
        if (a->y + a->radius > HUDDLE_POOL_BOTTOM) {
            a->y = HUDDLE_POOL_BOTTOM - a->radius;
            a->vy = -a->vy * (a->restitution * 0.4f);
            a->squish_y = 0.85f;
            if (fabsf(a->vy) < 10.0f) {
                a->vy = 0.0f;
            }
        }

        // 静止沉淀判定
        if (a->in_water && fabsf(a->vx) < 3.0f && fabsf(a->vy) < 3.0f) {
            a->settled = true;
        } else {
            a->settled = false;
        }
    }

    // 7. 小动物两两弹性碰撞与抱团融合
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        if (!g->animals[i].active) continue;
        for (int j = i + 1; j < HUDDLE_MAX_ANIMALS; j++) {
            if (!g->animals[j].active) continue;
            resolve_animal_pair(g, i, j);
        }
    }

    // 8. 粒子系统更新
    for (int i = 0; i < HUDDLE_MAX_PARTICLES; i++) {
        huddle_particle_t *p = &g->particles[i];
        if (!p->active) continue;

        if (p->life_ms <= (float)dt_ms) {
            p->active = false;
            continue;
        }
        p->life_ms -= (float)dt_ms;
        p->alpha = p->life_ms / p->max_life_ms;

        p->x += p->vx * dt;
        p->y += p->vy * dt;
        p->rotation_deg += p->rot_speed * dt;

        // 樱花重力与微风飘散
        if (p->type == HUDDLE_PART_SAKURA) {
            p->vy += 35.0f * dt; // 柔和下落
            p->vx += sinf(g->water_wave_phase * 2.0f + p->y * 0.1f) * 8.0f * dt;
        } else if (p->type == HUDDLE_PART_WATER_SPLASH) {
            p->vy += HUDDLE_GRAVITY_AIR * 0.8f * dt; // 重力飞溅
        }
    }

    // 9. 满池溢出告警与 GameOver 判定
    bool has_overflow = false;
    for (int i = 0; i < HUDDLE_MAX_ANIMALS; i++) {
        const huddle_animal_t *a = &g->animals[i];
        if (!a->active) continue;

        // 判定条件：动物存活已久 (已脱离滑轨投放期)，垂直速度平稳堆积，且顶部越过警戒线
        if (a->age_ms > 600) {
            float top_edge = a->y - a->radius;
            if (top_edge < HUDDLE_OVERFLOW_Y && fabsf(a->vy) < 40.0f) {
                has_overflow = true;
                break;
            }
        }
    }

    if (has_overflow) {
        if (!g->overflow_danger) {
            g->overflow_danger = true;
            sound_enqueue(g, HUDDLE_SND_OVERFLOW_WARN);
        }
        g->overflow_timer_ms += dt_ms;
        if (g->overflow_timer_ms >= HUDDLE_OVERFLOW_LIMIT_MS) {
            g->state = HUDDLE_STATE_GAMEOVER;
            sound_enqueue(g, HUDDLE_SND_GAMEOVER);
        }
    } else {
        g->overflow_danger = false;
        g->overflow_timer_ms = 0;
    }
}
