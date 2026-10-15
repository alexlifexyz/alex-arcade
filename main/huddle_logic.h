// main/huddle_logic.h —— 《柴犬与海豹的午后温泉》(Fluffy Huddle / 萌物抱抱团) 核心游戏算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 设计。
// 纯 C11 编写，零动态内存分配 (Zero malloc/free)，无 ESP-IDF/LVGL/FreeRTOS 依赖。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// =========================================================================
// 屏幕规格与温泉池物理空间布局
// =========================================================================
#define HUDDLE_SCREEN_W                 240
#define HUDDLE_SCREEN_H                 320

// 顶部滑轨投放器配置
#define HUDDLE_RAIL_Y                   36.0f   // 投放轨道垂直高度 (px)
#define HUDDLE_RAIL_MIN_X               28.0f   // 投放导轨左极限
#define HUDDLE_RAIL_MAX_X               212.0f  // 投放导轨右极限
#define HUDDLE_RAIL_STEP                8.0f    // 单次按键移动步长 (px)
#define HUDDLE_RAIL_SPEED               120.0f  // 持续移动平滑速度 (px/s)
#define HUDDLE_DROP_COOLDOWN_MS         320     // 投放后滑轨重新装填动物冷却时间 (ms)

// 温泉池空间几何边界 (Hot Spring Tub)
#define HUDDLE_POOL_LEFT                16.0f   // 温泉池左壁 X
#define HUDDLE_POOL_RIGHT               224.0f  // 温泉池右壁 X (有效净宽 208px)
#define HUDDLE_POOL_BOTTOM              308.0f  // 温泉池底部 Y
#define HUDDLE_WATER_SURFACE_Y          96.0f   // 温泉池水面基准高度 Y
#define HUDDLE_OVERFLOW_Y               90.0f   // 满池溢出危险警戒线 Y (略高于水面)

// 游戏机制与交互时间阈值
#define HUDDLE_LONG_PRESS_MS            380     // 长按判定阈值 (ms)：<380ms为短按投放，>=380ms为温泉抚摸
#define HUDDLE_OVERFLOW_LIMIT_MS        2200    // 堆叠溢出持续警戒超时 (ms)，超时则判定 GameOver
#define HUDDLE_QUOTE_DISPLAY_MS         3500    // 暖心语录保持显示时间 (ms)
#define HUDDLE_ZEN_IDLE_TIMEOUT_MS      5000    // 无按键输入自动进入“沉浸放置模式”时间 (ms)
#define HUDDLE_SHISHI_ODOSHI_PERIOD_MS  4500    // 竹筒添水清脆敲击周期 (ms)
#define HUDDLE_ZEN_BUBBLE_INTERVAL_MS   900     // 放置模式池底温泉微泡喷发间隔 (ms)

// 对象池静态容量配置 (Zero malloc/free)
#define HUDDLE_MAX_ANIMALS              20      // 温泉池内最大动物实体容量
#define HUDDLE_MAX_PARTICLES            48      // 樱花、水花、爱心、微泡粒子容量
#define HUDDLE_MAX_SOUND_QUEUE          16      // 环形音效事件队列深度
#define HUDDLE_MAX_TIERS                4       // 小动物最大进阶等级 (Tier 1 ~ 4)

// 物理学动力常数
#define HUDDLE_GRAVITY_AIR              540.0f  // 空气中重力加速度 (px/s^2)
#define HUDDLE_GRAVITY_WATER            80.0f   // 水下有效重力加速度 (px/s^2)
#define HUDDLE_WATER_BUOYANCY_ACCEL     620.0f  // 水流最大浮力推力 (px/s^2)
#define HUDDLE_WATER_DRAG_X             2.8f    // 水平水流粘滞阻尼系数
#define HUDDLE_WATER_DRAG_Y             3.2f    // 垂直温水粘滞阻尼系数
#define HUDDLE_SPLASH_VELOCITY_DAMP     0.42f   // 冲入水面瞬间垂直冲量衰减系数
#define HUDDLE_SQUISH_STIFFNESS_BASE    20.0f   // Q 弹果冻形变弹簧刚度基准
#define HUDDLE_SQUISH_DAMPING_BASE      4.5f    // Q 弹果冻形变阻尼基准

// =========================================================================
// 核心枚举定义
// =========================================================================

// 游戏运行生命周期状态
typedef enum {
    HUDDLE_STATE_READY = 0,     // 准备开局 (滑轨就绪，温泉氤氲)
    HUDDLE_STATE_PLAYING,       // 欢乐泡汤游玩中
    HUDDLE_STATE_PAUSED,        // 暂停中
    HUDDLE_STATE_GAMEOVER       // 满池溢出结算状态
} huddle_state_t;

// 4 种特色大脸圆滚滚小动物物种
typedef enum {
    HUDDLE_SPECIES_SHIBA = 0,   // 阿柴 (柴犬·忠诚温厚)
    HUDDLE_SPECIES_SEAL,        // 糯米 (海豹·软糯果冻)
    HUDDLE_SPECIES_CAT,         // 团子 (折耳猫·轻盈傲娇)
    HUDDLE_SPECIES_OTTER,       // 皮皮 (水獭·活泼灵动)
    HUDDLE_SPECIES_COUNT        // 物种总数
} huddle_species_t;

// 小动物在世界中的存在状态
typedef enum {
    HUDDLE_ANIMAL_STATE_FREE = 0,   // 对象池空闲未分配
    HUDDLE_ANIMAL_STATE_FALLING,    // 脱离滑轨下落穿空阶段
    HUDDLE_ANIMAL_STATE_IN_WATER,   // 温泉池中浮游/挤压堆叠阶段
    HUDDLE_ANIMAL_STATE_MERGING     // 正在抱团融合过渡状态
} huddle_animal_state_t;

// 动态粒子特效类型
typedef enum {
    HUDDLE_PART_NONE = 0,
    HUDDLE_PART_SAKURA,         // 樱花花瓣 (抱团融合浪漫迸发，粉色轻舞)
    HUDDLE_PART_WATER_SPLASH,   // 温泉水滴飞溅 (入水与激烈碰撞)
    HUDDLE_PART_STEAM_BUBBLE,   // 温泉热气微泡 (悠悠升空破裂)
    HUDDLE_PART_HEART,          // 抚摸治愈爱心 (长按互动触发)
    HUDDLE_PART_RIPPLE          // 水面涟漪光环 (竹筒添水与入水环)
} huddle_particle_type_t;

// 音效事件枚举 (提供给 I2S / ES8311 音频任务消费)
typedef enum {
    HUDDLE_SND_NONE = 0,
    HUDDLE_SND_SPLASH,          // 落水噗通声 (小动物穿过水面入水)
    HUDDLE_SND_SQUISH,          // Q 弹挤压声 (小动物之间果冻碰撞回弹)
    HUDDLE_SND_PURR,            // 舒适呼噜声 (长按温泉抚摸触发舒适呼噜)
    HUDDLE_SND_SHISHI_ODOSHI,   // 竹筒添水脆响敲击声 (鹿威竹筒敲石清脆一响)
    HUDDLE_SND_MERGE_ARPEGGIO,  // 进阶琶音 (两只同级动物抱团融合升阶)
    HUDDLE_SND_PET_HEART,       // 抚摸治愈互动音
    HUDDLE_SND_OVERFLOW_WARN,   // 满池溢出危险告警音
    HUDDLE_SND_GAMEOVER         // 游戏满池溢出结束悲鸣
} huddle_sound_t;

// 暖心治愈系语录索引 (融合或长按抚摸时触发)
typedef enum {
    // 柴犬·阿柴语录
    HUDDLE_QUOTE_SHIBA_1 = 0,   // "小狗永远觉得你是最棒的！"
    HUDDLE_QUOTE_SHIBA_2,       // "今天辛苦啦，泡个热气腾腾的温泉吧~"
    HUDDLE_QUOTE_SHIBA_3,       // "把烦恼都丢到水里，咕噜咕噜冲走啦！"
    HUDDLE_QUOTE_SHIBA_4,       // "你今天笑起来的样子，比温泉还要温暖呢。"
    // 海豹·糯米语录
    HUDDLE_QUOTE_SEAL_1,        // "圆滚滚的我，只想软软地抱住你~"
    HUDDLE_QUOTE_SEAL_2,        // "糯米海豹吐了个小泡泡：啵！"
    HUDDLE_QUOTE_SEAL_3,        // "躺平也是超厉害的超能力哦！"
    HUDDLE_QUOTE_SEAL_4,        // "只要心软软的，世界也会变得软绵绵。"
    // 折耳猫·团子语录
    HUDDLE_QUOTE_CAT_1,         // "呼噜呼噜……本喵准许你靠着我休息一会儿。"
    HUDDLE_QUOTE_CAT_2,         // "揉揉耳朵，今天所有不开心都被猫爪没收啦。"
    HUDDLE_QUOTE_CAT_3,         // "水温刚刚好，猫猫和你的心都化开啦~"
    HUDDLE_QUOTE_CAT_4,         // "喵呜~ 世界上最惬意的事就是和你一起泡汤。"
    // 水獭·皮皮语录
    HUDDLE_QUOTE_OTTER_1,       // "皮皮把最圆的鹅卵石送给你当礼物！"
    HUDDLE_QUOTE_OTTER_2,       // "在水里牵着手，我们就永远不会被冲散啦~"
    HUDDLE_QUOTE_OTTER_3,       // "快乐就像水花，扑通一下就满出来啦！"
    HUDDLE_QUOTE_OTTER_4,       // "生活有急流，但我们可以在平静的湾里晒太阳。"
    // 互动抚摸专属通用治愈语录
    HUDDLE_QUOTE_PET_1,         // "温润的泉水包裹着你，疲惫悄悄融化了。"
    HUDDLE_QUOTE_PET_2,         // "竹筒添水敲出咚的一声，岁月静好，心生欢喜。"
    HUDDLE_QUOTE_PET_3,         // "慢慢来，深呼吸，你已经做得足够好啦，抱一个！"
    HUDDLE_QUOTE_PET_4,         // "让这份温暖一直留在心底，今晚一定会做个好梦。"
    HUDDLE_QUOTE_COUNT
} huddle_quote_id_t;

// =========================================================================
// 实体结构体与对象池定义
// =========================================================================

// 小动物实体结构体
typedef struct {
    bool active;                    // 对象池有效占用标志
    huddle_animal_state_t state;    // 运动/状态
    huddle_species_t species;       // 动物物种 (柴犬/海豹/折耳猫/水獭)
    uint8_t tier;                   // 进阶等级 (1:幼崽, 2:毛巾, 3:樱花, 4:霸主)
    float x;                        // 中心水平位置 (px)
    float y;                        // 中心垂直位置 (px)
    float vx;                       // 水平速度 (px/s)
    float vy;                       // 垂直速度 (px/s)
    float radius;                   // 当前半径 (px)
    float mass;                     // 物理质量 (与体积等级关联)
    float restitution;              // 弹性碰撞恢复系数
    // Q 弹果冻形变模型 (动态弹簧振子缩放)
    float squish_x;                 // X 轴果冻形变缩放 (静止基准为 1.0f)
    float squish_y;                 // Y 轴果冻形变缩放 (静止基准为 1.0f)
    float squish_vx;                // X 轴形变回复震荡速度
    float squish_vy;                // Y 轴形变回复震荡速度
    float squish_stiffness;         // 专属 Q 弹刚度
    float squish_damping;           // 专属回复阻尼
    // 沉浸微动与呼吸
    float breath_phase;             // 呼吸微动相位 (rad)
    float breath_scale;             // 当前呼吸引起的瞬时缩放偏移
    // 物理标志与计时
    bool in_water;                  // 是否已入水
    bool settled;                   // 是否相对静止
    uint32_t age_ms;                // 存活时长 (ms)
    uint32_t merge_lock_ms;         // 刚融合后的短暂判定锁，防止连环瞬发冲突
} huddle_animal_t;

// 动态粒子实体
typedef struct {
    bool active;
    huddle_particle_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float life_ms;
    float max_life_ms;
    float size;
    float alpha;                    // 0.0f ~ 1.0f
    float rotation_deg;
    float rot_speed;
} huddle_particle_t;

// 顶部滑轨投放器状态
typedef struct {
    float x;                        // 当前滑轨滑块 X 坐标 (px)
    huddle_species_t cur_species;   // 当前待投放小动物种类
    uint8_t cur_tier;               // 当前待投放等级 (通常 Tier 1，低概率 Tier 2)
    huddle_species_t next_species;  // 下一只预告展示小动物
    uint8_t next_tier;              // 下一只预告等级
    bool ready;                     // 是否装填完毕可投放
    uint32_t reload_timer_ms;       // 装填动画冷却倒计时 (ms)
} huddle_dropper_t;

// 音效环形队列 (零锁，单向消费)
typedef struct {
    huddle_sound_t queue[HUDDLE_MAX_SOUND_QUEUE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
} huddle_sound_queue_t;

// 暖心语录显示状态
typedef struct {
    bool active;                    // 是否有语录正在前台显示
    huddle_quote_id_t quote_id;     // 当前语录索引
    uint32_t timer_ms;              // 剩余显示时间 (ms)
} huddle_quote_state_t;

// 游戏全局核心状态机 (零堆动态分配，纯静态结构体)
typedef struct {
    huddle_state_t state;           // 游戏生命周期状态
    uint32_t rng_state;             // 确定性随机数发生器内部状态 (LCG/Xorshift)
    uint32_t game_time_ms;          // 游戏运行累计毫秒数

    // 投放滑轨与按键状态
    huddle_dropper_t dropper;
    bool ok_key_down;               // OK 键是否处于按下保持状态
    uint32_t ok_press_duration_ms;  // OK 键按下持续时长 (ms)
    bool pet_triggered_this_press;  // 本次长按是否已经触发了抚摸

    // 局内数据与积分
    uint32_t score;                 // 累计温泉陪伴温暖值 (得分)
    uint32_t merge_count;           // 成功抱团融合累计次数
    uint32_t drop_count;            // 投放小动物总数
    uint32_t pet_count;             // 温泉抚摸互动次数
    uint32_t combo_streak;          // 连续合成连击计数
    uint32_t combo_timer_ms;        // 连击保持时间窗口 (ms)

    // 溢出警戒与结算
    bool overflow_danger;           // 当前是否处于满池溢出危险状态
    uint32_t overflow_timer_ms;     // 危险持续计时器 (超出上限 GameOver)

    // 沉浸放置模式 (Zen Mode)
    bool zen_mode;                  // 是否进入沉浸放置挂机模式
    uint32_t idle_timer_ms;         // 无玩家操作空闲累计时间 (ms)
    uint32_t shishi_odoshi_timer_ms;// 竹筒添水注水计时 (ms)
    uint32_t zen_bubble_timer_ms;   // 池底温泉微泡发射计时 (ms)
    float water_wave_phase;         // 水面微波荡漾动画相位 (rad)

    // 暖心语录系统
    huddle_quote_state_t quote;

    // 音效通知
    huddle_sound_t pending_sound;   // 单音快速轮询兼容
    huddle_sound_queue_t sound_q;   // 完整多事件环形队列

    // 静态对象池
    huddle_animal_t animals[HUDDLE_MAX_ANIMALS];
    huddle_particle_t particles[HUDDLE_MAX_PARTICLES];
} huddle_game_t;

// =========================================================================
// 核心生命周期 API
// =========================================================================

/**
 * @brief 初始化温泉游戏状态机与所有对象池
 * @param g 游戏实例指针
 * @param seed 随机种子
 */
void huddle_game_init(huddle_game_t *g, uint32_t seed);

/**
 * @brief 重置游戏到初始就绪状态 (清空所有实体与积分)
 */
void huddle_game_reset(huddle_game_t *g);

/**
 * @brief 暂停游戏
 */
void huddle_game_pause(huddle_game_t *g);

/**
 * @brief 恢复游戏
 */
void huddle_game_resume(huddle_game_t *g);

/**
 * @brief 主逻辑步进更新 (物理碰撞、果冻弹性、浮力积分、粒子与语录更新)
 * @param g 游戏实例指针
 * @param dt_ms 帧间隔时间 (建议 16ms ~ 33ms)
 */
void huddle_game_step(huddle_game_t *g, uint32_t dt_ms);

/**
 * @brief 查询游戏是否已结束 (满池溢出)
 */
bool huddle_game_is_game_over(const huddle_game_t *g);

/**
 * @brief 查询游戏是否暂停中
 */
bool huddle_game_is_paused(const huddle_game_t *g);

// =========================================================================
// 用户交互与按键输入 API
// =========================================================================

/**
 * @brief UP 按键：滑轨向左平移步进
 */
void huddle_input_up(huddle_game_t *g);

/**
 * @brief DOWN 按键：滑轨向右平移步进
 */
void huddle_input_down(huddle_game_t *g);

/**
 * @brief 显式设置滑轨横向位置 (自动安全限制在边界之内)
 */
void huddle_input_set_rail_x(huddle_game_t *g, float x);

/**
 * @brief OK 按键按下：开始记录按下时长，开启长按抚摸判定
 */
void huddle_input_ok_press(huddle_game_t *g);

/**
 * @brief OK 按键释放：区分短按投放小动物与长按抚摸结束
 */
void huddle_input_ok_release(huddle_game_t *g);

/**
 * @brief 立即从滑轨投放当前小动物 (如未冷却完成返回 false)
 */
bool huddle_drop_current(huddle_game_t *g);

/**
 * @brief 手动或长按触发“温泉抚摸互动”
 * 抚摸最近或全池动物，触发舒适呼噜声与爱心粒子
 */
void huddle_trigger_pet(huddle_game_t *g);

/**
 * @brief 手动开启或退出“沉浸放置模式”
 */
void huddle_set_zen_mode(huddle_game_t *g, bool zen);

// =========================================================================
// 音效事件处理 API
// =========================================================================

/**
 * @brief 出队并消费一个音效事件
 */
huddle_sound_t huddle_sound_dequeue(huddle_game_t *g);

/**
 * @brief 查看当前待播放音效 (不移出队列)
 */
huddle_sound_t huddle_sound_peek(const huddle_game_t *g);

/**
 * @brief 清空音效队列
 */
void huddle_sound_clear(huddle_game_t *g);

// =========================================================================
// 暖心语录与静态文本库 API
// =========================================================================

/**
 * @brief 获取指定 ID 的暖心治愈文本字符串
 */
const char* huddle_quote_get_text(huddle_quote_id_t id);

/**
 * @brief 获取当前正在显示的治愈短语 (若无显示或超时则返回 NULL)
 */
const char* huddle_quote_get_current(const huddle_game_t *g);

/**
 * @brief 手动触发一条指定语录
 */
void huddle_quote_trigger(huddle_game_t *g, huddle_quote_id_t id);

/**
 * @brief 根据动物物种与 Tier 获取物种名称
 */
const char* huddle_species_get_name(huddle_species_t sp);

/**
 * @brief 根据 Tier 获取形态头衔 (如 "幼崽泡汤", "温泉毛巾", "樱花头饰", "温泉霸主")
 */
const char* huddle_tier_get_title(uint8_t tier);

// =========================================================================
// 实体与对象池管理 API (供单测与外部渲染/关卡编排查询)
// =========================================================================

/**
 * @brief 手动在指定位置生成小动物 (直接放入池中，常用于物理单测)
 * @return 成功返回对象池槽位索引 (>=0)，池满返回 -1
 */
int huddle_spawn_animal(huddle_game_t *g, huddle_species_t sp, uint8_t tier,
                        float x, float y, float vx, float vy);

/**
 * @brief 获取指定物种与等级的基础物理半径
 */
float huddle_get_species_radius(huddle_species_t sp, uint8_t tier);

/**
 * @brief 获取指定物种与等级的物理质量
 */
float huddle_get_species_mass(huddle_species_t sp, uint8_t tier);

/**
 * @brief 获取指定物种与等级的弹性系数
 */
float huddle_get_species_restitution(huddle_species_t sp, uint8_t tier);

/**
 * @brief 获取指定物种与等级的 Q 弹形变刚度
 */
float huddle_get_species_stiffness(huddle_species_t sp, uint8_t tier);

/**
 * @brief 获取当前池中小动物存活总数
 */
int huddle_get_animal_count(const huddle_game_t *g);

/**
 * @brief 获取当前活跃粒子总数
 */
int huddle_get_particle_count(const huddle_game_t *g);

/**
 * @brief 生成一组粒子 (樱花/水花/爱心/微泡)
 */
void huddle_emit_particles(huddle_game_t *g, huddle_particle_type_t type,
                           float x, float y, int count);

#ifdef __cplusplus
}
#endif
