// main/pawssprint_dx_logic.h —— 《短腿爪爪运动会·进化版》(Paws Sprint DX) 纯 C 状态机算法引擎
// 专为 FoloToy AI Passport (ESP32-C3, 240x320 竖屏, 三键 UP/DOWN/OK) 打造。
// 纯 C11 编写，零动态堆内存分配 (Zero malloc/free)，无 ESP-IDF/FreeRTOS/LVGL 依赖。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// 1. 屏幕与赛道几何布局 (三车道绝对中线对齐，零跑偏)
// ============================================================================
#define PSDX_SCREEN_W                 240
#define PSDX_SCREEN_H                 320

#define PSDX_LANE_COUNT               3
#define PSDX_LANE_0_X                 50.0f     // 左车道中线
#define PSDX_LANE_1_X                 120.0f    // 中车道中线 (屏幕正中)
#define PSDX_LANE_2_X                 190.0f    // 右车道中线

#define PSDX_PLAYER_BASE_Y            250.0f    // 角色常态垂直基准位置 (前瞻视野向上)
#define PSDX_PLAYER_COLLISION_W       32.0f     // 角色横向判定包围盒宽度
#define PSDX_PLAYER_COLLISION_H       32.0f     // 角色纵向判定包围盒高度

// ============================================================================
// 2. 运动学与物理常数
// ============================================================================
#define PSDX_SPEED_NORMAL             160.0f    // 常态奔跑赛道相对速度 (px/s)
#define PSDX_SPEED_TURBO              320.0f    // 涡轮狂蹬双倍极速 (px/s)
#define PSDX_SPEED_SPIN               40.0f     // 踩香蕉皮原地旋转时的慢速惯性 (px/s)
#define PSDX_LANE_SWITCH_SPEED        450.0f    // 变道横向平滑过渡速度 (px/s)
#define PSDX_SNAP_TOLERANCE           1.0f      // 车道强力吸附对齐阈值 (px)

#define PSDX_JUMP_INITIAL_VZ          280.0f    // 起跳垂直初速度 (px/s)
#define PSDX_GRAVITY                  900.0f    // 垂直重力加速度 (px/s^2)
#define PSDX_HURDLE_CLEAR_Z           14.0f     // 成功越过跨栏所需离地高度 (px)

#define PSDX_TURBO_HOLD_MS            250       // 长按 OK 激活涡轮狂蹬的时间阈值 (ms)
#define PSDX_TURBO_DOUBLE_TAP_MS      280       // 双击 OK 激活涡轮狂蹬的最大间隔 (ms)
#define PSDX_TURBO_DURATION_MS        2200      // 涡轮狂蹬持续时间 (ms)

#define PSDX_BANANA_SPIN_MS           800       // 香蕉皮 360° 滑稽旋转舞步持续时间 (ms)
#define PSDX_BANANA_ROTATION_DEG      360.0f    // 旋转总角度 (度)

#define PSDX_BLINK_INTERVAL_MIN_MS    2400      // 萌宠眨眼最小间隔 (ms)
#define PSDX_BLINK_INTERVAL_MAX_MS    3600      // 萌宠眨眼最大间隔 (ms)
#define PSDX_BLINK_DURATION_MS        160       // 眨眼闭合过程总持续时间 (ms)

#define PSDX_DEFAULT_TRACK_LENGTH     3000.0f   // 默认赛道总里程 (px)
#define PSDX_SPAWN_INTERVAL_MIN       140.0f    // 障碍物/道具生成最小里程间距 (px)
#define PSDX_SPAWN_INTERVAL_MAX       240.0f    // 障碍物/道具生成最大里程间距 (px)

// ============================================================================
// 3. 静态对象池容量限制 (严格零动态堆分配)
// ============================================================================
#define PSDX_MAX_TRACK_OBJECTS        32        // 赛道物件池容量
#define PSDX_MAX_PARTICLES            64        // 动态粒子池容量
#define PSDX_MAX_SOUND_QUEUE          16        // 音效事件队列容量

// ============================================================================
// 4. 枚举定义：游戏状态、角色品种、微表情、物件类型、粒子与音效
// ============================================================================

// 游戏全局主状态
typedef enum {
    PSDX_STATE_READY = 0,       // 预备起跑倒计时
    PSDX_STATE_RUNNING,         // 运动会全力奔跑中
    PSDX_STATE_PAUSED,          // 游戏暂停
    PSDX_STATE_VICTORY,         // 终点飞扑大抱枕胜利结算
    PSDX_STATE_GAMEOVER         // 结算结束
} psdx_game_state_t;

// 正面 45° 视角萌宠角色品种
typedef enum {
    PSDX_CHAR_CORGI = 0,        // 大脸柯基 (大脸盘、大耳朵扑棱、小短腿翘臀)
    PSDX_CHAR_SHIBA,            // 微笑柴犬 (治愈眯眼微笑、立耳小卷尾)
    PSDX_CHAR_SEAL,             // 圆滚海豹 (呆萌滑行、小短鳍扑腾)
    PSDX_CHAR_PENGUIN           // 憨憨企鹅 (左右摇摆踱步、小胖翅扇动)
} psdx_char_type_t;

// 萌宠眨眼微表情
typedef enum {
    PSDX_BLINK_OPEN = 0,        // 萌萌大眼全睁
    PSDX_BLINK_HALF,            // 半眯眼过渡态
    PSDX_BLINK_CLOSED           // 欢快闭眼眯成线
} psdx_blink_state_t;

// 萌宠吐舌头表情
typedef enum {
    PSDX_TONGUE_IN = 0,         // 收起舌头
    PSDX_TONGUE_PANT,           // 奔跑欢快吐舌哈气
    PSDX_TONGUE_HAPPY           // 吃到骨头/冲刺极度开怀大吐舌
} psdx_tongue_state_t;

// 赛道物件类型
typedef enum {
    PSDX_OBJ_NONE = 0,
    PSDX_OBJ_HURDLE,            // 跨栏 (滞空起跳越过；地面碰撞绊倒；涡轮撞碎)
    PSDX_OBJ_MUD,               // 泥洼 (滞空起跳越过；地面溅泥减速；涡轮冲碎)
    PSDX_OBJ_BANANA,            // 香蕉皮 (非跳跃踩中触发 360° 滑稽原地旋转舞步)
    PSDX_OBJ_BONE,              // 香脆骨头 (+1分，咔嚓咀嚼，大脸萌宠开怀吐舌)
    PSDX_OBJ_COIN,              // 金光金币 (+5分，清脆金币音，金光四射)
    PSDX_OBJ_CUSHION            // 终点巨型蓬松羽毛大抱枕 (飞扑扑入爆满羽毛胜利结算)
} psdx_object_type_t;

// 动态粒子类型
typedef enum {
    PSDX_PART_NONE = 0,
    PSDX_PART_PAW_PRINT,        // 地面小爪印 (奔跑踏步留下，淡雅渐隐)
    PSDX_PART_DIZZY_STAR,       // 踩香蕉皮头顶环绕旋转的金星
    PSDX_PART_TURBO_SPARK,      // 涡轮狂蹬尾部喷射的彩虹光芒与星火
    PSDX_PART_SPLASH,           // 泥洼水花 / 障碍物碎裂木屑
    PSDX_PART_FEATHER,          // 终点大抱枕漫天飘落的蓬松白羽毛
    PSDX_PART_BONE_SPARKLE      // 吃骨头/金币拾取的星芒闪光
} psdx_part_type_t;

// 音效触发事件 (供 I2S 音频任务无锁轮询消费)
typedef enum {
    PSDX_SND_NONE = 0,
    PSDX_SND_STEP,              // 小肉垫踏步声 (哒哒哒)
    PSDX_SND_JUMP,              // 起跳轻盈弹簧音 (Boing~)
    PSDX_SND_LAND,              // 落地轻柔肉垫着地声
    PSDX_SND_TURBO_START,       // 涡轮狂蹬启动高能音
    PSDX_SND_TURBO_SMASH,       // 无敌冲撞碎裂音 (撞碎跨栏/泥洼)
    PSDX_SND_BANANA_SPIN,       // 踩香蕉皮滑稽 360° 旋转哨音 (咻噜噜~)
    PSDX_SND_BONE_CRUNCH,       // 吃骨头清脆咔嚓声
    PSDX_SND_COIN,              // 吃金币清脆叮当声
    PSDX_SND_CUSHION_POOF,      // 飞扑大抱枕沉闷 POOF 声
    PSDX_SND_LANE_SWITCH,       // 变道轻快唰唰声
    PSDX_SND_CHEER              // 终点冲线欢呼喝彩声
} psdx_sound_t;

// ============================================================================
// 5. 核心结构体定义
// ============================================================================

// 赛道物件结构体
typedef struct {
    bool active;
    psdx_object_type_t type;
    int lane;                   // 所属车道 (0, 1, 2)
    float x;                    // 屏幕世界 X 坐标 (中心)
    float y;                    // 屏幕世界 Y 坐标 (中心)
    float w;                    // 碰撞宽度
    float h;                    // 碰撞高度
    bool collected;             // 是否已被拾取
    bool smashed;               // 是否已被涡轮撞碎
} psdx_object_t;

// 动态粒子结构体
typedef struct {
    bool active;
    psdx_part_type_t type;
    float x;
    float y;
    float vx;
    float vy;
    float size;
    float rotation_deg;
    float rot_speed;
    uint32_t life_ms;
    uint32_t max_life_ms;
} psdx_particle_t;

// 音效事件环形队列
typedef struct {
    psdx_sound_t events[PSDX_MAX_SOUND_QUEUE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
} psdx_sound_queue_t;

// 萌宠选手结构体 (正面 45° 视角萌宠状态与物理)
typedef struct {
    psdx_char_type_t char_type; // 角色品种
    int current_lane;           // 当前稳定所在车道 (0, 1, 2)
    int target_lane;            // 目标变道车道 (0, 1, 2)
    float x;                    // 角色横向精确坐标 (绝对中线吸附 50, 120, 190)
    float y;                    // 角色垂直固定基准坐标 (250)
    bool is_switching_lane;     // 是否正在横向变道平移过渡中

    // 跳跃 Z 轴物理
    float jump_z;               // 当前跳跃高度 (px, 地面为 0)
    float jump_vz;              // 垂直速度 (px/s)
    bool is_jumping;            // 是否处于空中滞空状态

    // 涡轮狂蹬 Turbo Paw Dash
    bool is_turbo;              // 是否处于小短腿涡轮双倍极速无敌状态
    uint32_t turbo_timer_ms;    // 涡轮剩余时间 (ms)
    uint32_t ok_press_duration; // OK 键按下持续时间 (ms)
    uint32_t last_ok_press_time;// 上次按下 OK 键的时间戳 (双击判定)
    bool ok_is_down;            // OK 键当前是否处于按下状态

    // 0 挫败搞笑机关：踩香蕉皮 360° 滑稽原地旋转舞步
    bool is_spinning;           // 是否正处于旋转舞步状态
    uint32_t spin_timer_ms;     // 旋转舞步剩余时间 (ms)
    float spin_angle_deg;       // 当前旋转角度 (0° ~ 360°)

    // 正面 45° 视角微表情与动态
    psdx_blink_state_t blink_state;
    uint32_t blink_timer_ms;    // 眨眼计时器
    psdx_tongue_state_t tongue_state;
    float tongue_offset_x;      // 吐舌头左右微摆位移
    float ear_bounce_y;         // 小耳朵起伏弹跳位移
    float paw_phase;            // 肉垫步伐交替相位 (0 ~ 2*PI)
    int paw_step_count;         // 踏步总数

    // 终点飞扑巨型蓬松羽毛大抱枕 (Cushion Dive)
    bool is_cushion_diving;     // 是否正处于大抱枕飞扑动作中
    float cushion_dive_scale;   // 飞扑身体缩放与扑入深度
} psdx_player_t;

// 游戏全局引擎上下文结构体
typedef struct {
    psdx_game_state_t state;
    psdx_player_t player;

    float current_speed;        // 当前赛道移速 (px/s)
    float distance_traveled;    // 已奔跑距离里程 (px)
    float track_length;         // 赛道总里程 (px)
    uint32_t game_time_ms;      // 关卡流逝时间 (ms)

    // 统计结算
    uint32_t score;             // 总得分
    uint32_t bones_collected;   // 骨头收集数 (+1分/个)
    uint32_t coins_collected;   // 金币收集数 (+5分/个)
    uint32_t obstacles_cleared; // 越过或撞碎障碍数
    uint32_t bananas_slipped;   // 踩香蕉皮旋转滑稽次数 (0挫败搞笑统计)

    // 静态对象池
    psdx_object_t objects[PSDX_MAX_TRACK_OBJECTS];
    psdx_particle_t particles[PSDX_MAX_PARTICLES];
    psdx_sound_queue_t sound_queue;

    // 伪随机数种子 (自举 LCG 算法，无外部依赖)
    uint32_t rng_state;

    // 赛道程序化生成控制
    float next_spawn_distance;  // 下一次生成物件的里程标
    bool cushion_spawned;       // 终点抱枕是否已在赛道上生成
} psdx_game_t;

// ============================================================================
// 6. 函数 API 接口声明
// ============================================================================

// 游戏初始化与控制
void psdx_game_init(psdx_game_t *g, uint32_t seed);
void psdx_game_reset(psdx_game_t *g);
void psdx_game_set_character(psdx_game_t *g, psdx_char_type_t char_type);
void psdx_game_set_track_length(psdx_game_t *g, float length_px);
void psdx_game_pause(psdx_game_t *g);
void psdx_game_resume(psdx_game_t *g);
bool psdx_game_is_running(const psdx_game_t *g);
bool psdx_game_is_victory(const psdx_game_t *g);

// 输入接口 (精准 3 键)
void psdx_input_up(psdx_game_t *g);               // UP 键：向上/左切一条车道 (Lane 1->0, 2->1)
void psdx_input_down(psdx_game_t *g);             // DOWN 键：向下/右切一条车道 (Lane 0->1, 1->2)
void psdx_input_ok_down(psdx_game_t *g);          // OK 键按下 (启动计时 / 双击检测)
void psdx_input_ok_up(psdx_game_t *g);            // OK 键松开 (短按触发跳跃)
void psdx_input_set_lane(psdx_game_t *g, int lane);// 直接设置目标车道 (带钳制 [0, 2])
void psdx_trigger_jump(psdx_game_t *g);           // 显式触发轻盈跳跃
void psdx_trigger_turbo(psdx_game_t *g);          // 显式触发小短腿涡轮狂蹬

// 游戏主逻辑步进更新 (以毫秒推进)
void psdx_game_step(psdx_game_t *g, uint32_t dt_ms);

// 赛道物件池管理
psdx_object_t *psdx_spawn_object(psdx_game_t *g, psdx_object_type_t type, int lane, float y);
void psdx_clear_all_objects(psdx_game_t *g);
int psdx_get_active_object_count(const psdx_game_t *g);

// 粒子池管理
psdx_particle_t *psdx_spawn_particle(psdx_game_t *g, psdx_part_type_t type,
                                     float x, float y, float vx, float vy,
                                     float size, uint32_t life_ms);
void psdx_clear_all_particles(psdx_game_t *g);
int psdx_get_active_particle_count(const psdx_game_t *g);

// 音效队列管理 (供音频任务无锁轮询消费)
void psdx_sound_push(psdx_game_t *g, psdx_sound_t snd);
psdx_sound_t psdx_sound_pop(psdx_game_t *g);
bool psdx_sound_has_events(const psdx_game_t *g);

// 车道几何工具
float psdx_get_lane_center_x(int lane);

#ifdef __cplusplus
}
#endif
