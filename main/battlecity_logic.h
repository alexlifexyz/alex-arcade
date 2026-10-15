// main/battlecity_logic.h —— 《经典坦克大战 1990 (Battle City Neo)》核心算法与物理引擎
// 纯 C11 标准实现，无任何 ESP-IDF / LVGL 依赖，支持 Host 平台 100% 单元测试。
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// 地图与网格配置 (针对 240x320 竖屏深度优化)
// ============================================================================
// 战场规格：15 列 x 17 行 (每格 16x16 像素，刚好 15*16=240 宽，17*16=272 高)
// 顶部 HUD 高度 24px (y=0~24)，地图绘制在 y=26~298，底部留 22px (y=298~320) 为状态/按键栏
#define BC_MAP_COLS         15
#define BC_MAP_ROWS         17
#define BC_TILE_SIZE        16
#define BC_PLAYFIELD_W      (BC_MAP_COLS * BC_TILE_SIZE)  // 240
#define BC_PLAYFIELD_H      (BC_MAP_ROWS * BC_TILE_SIZE)  // 272
#define BC_OFFSET_X         0
#define BC_OFFSET_Y         26

// 地形类型定义
typedef enum {
    BC_TILE_EMPTY = 0,      // 空地 / 平原 (黑底，全速通行)
    BC_TILE_BRICK,          // 砖墙 (红砖，可被炮弹 8x8 逐步削减破坏)
    BC_TILE_STEEL,          // 钢板 (银白金属，普通炮弹无效，Tier 4 重炮可摧毁)
    BC_TILE_WATER,          // 水面 (流水波纹，坦克不可通行，炮弹自由飞过)
    BC_TILE_FOREST,         // 灌木 (绿丛，坦克可驶入隐藏，炮弹自由飞过)
    BC_TILE_ICE,            // 冰面 (浅蓝，坦克在上面行驶有打滑惯性)
    BC_TILE_BASE,           // 基地雄鹰 (老家核心，一炮摧毁即宣告失败)
} bc_tile_type_t;

// 子砖块掩码 (每个 16x16 砖墙由 4 个 8x8 组成，原汁原味还原红白机破坏细节)
// Bit 0: 左上 (Top-Left)
// Bit 1: 右上 (Top-Right)
// Bit 2: 左下 (Bottom-Left)
// Bit 3: 右下 (Bottom-Right)
#define BC_SUB_TL           0x01
#define BC_SUB_TR           0x02
#define BC_SUB_BL           0x04
#define BC_SUB_BR           0x08
#define BC_SUB_FULL         0x0F

// 方向枚举
typedef enum {
    BC_DIR_UP = 0,
    BC_DIR_RIGHT = 1,
    BC_DIR_DOWN = 2,
    BC_DIR_LEFT = 3,
} bc_dir_t;

// ============================================================================
// 坦克与实体定义
// ============================================================================
#define BC_TANK_SIZE        14      // 坦克碰撞箱 14x14 像素 (便于在 16px 缝隙中穿行)
#define BC_MAX_BULLETS      24      // 全场最大同屏子弹数 (扩大到 24 发，支持畅快连射)
#define BC_MAX_ENEMIES      6       // 场上最大敌方坦克存活数
#define BC_MAX_ITEMS        3       // 场上最大掉落道具数
#define BC_TOTAL_ENEMIES    16      // 每关敌军坦克总配额

// 坦克阵营与种类
typedef enum {
    BC_TANK_PLAYER_1 = 0,   // 玩家 1 (金色)
    BC_TANK_PLAYER_2,       // 玩家 2 (绿色，联机或合作)
    BC_TANK_BASIC,          // 基础兵坦 (速度慢，弱装甲，50 分)
    BC_TANK_FAST,           // 疾风突击车 (移速极快，积极偷家，100 分)
    BC_TANK_POWER,          // 强力高爆坦 (炮弹高速，高破坏，150 分)
    BC_TANK_ARMOR,          // 重装泰坦 (3~4 格血量，多重变色，200 分)
} bc_tank_type_t;

// 坦克结构体
typedef struct {
    bool           active;          // 是否存活在场
    bc_tank_type_t type;            // 坦克种类
    int16_t        x;               // 像素坐标 X (0 ~ 239)
    int16_t        y;               // 像素坐标 Y (0 ~ 271)
    bc_dir_t       dir;             // 当前朝向
    uint8_t        tier;            // 等级 (玩家 1~4 级；敌人装甲 1~4 点生命)
    uint8_t        speed;           // 移速 (像素/帧)
    bool           moving;          // 当前帧是否在推进移动
    uint16_t       invincible_time; // 无敌金钟罩倒计时 (以帧为单位，30fps)
    uint16_t       slide_time;      // 冰面滑行残余帧
    bool           flashing;        // 是否是发光红闪道具怪 (击杀必爆道具)
    uint8_t        shoot_cooldown;  // 装弹冷却
    uint8_t        anim_frame;      // 履带滚动交替帧 (0/1)
} bc_tank_t;

// 炮弹结构体
typedef struct {
    bool     active;                // 是否飞在空中
    bool     from_player;           // 来源：true=玩家，false=敌军
    uint8_t  owner_id;              // 归属 (1=P1, 2=P2, 3+=Enemy)
    int16_t  x;                     // 炮弹中心像素 X
    int16_t  y;                     // 炮弹中心像素 Y
    bc_dir_t dir;                   // 飞行方向
    uint8_t  speed;                 // 飞行速度 (4 ~ 8 px/frame)
    bool     pierce_steel;          // 是否能击穿钢板 (Tier 4 超级重炮)
} bc_bullet_t;

// 经典红白机道具枚举
typedef enum {
    BC_ITEM_NONE = 0,
    BC_ITEM_STAR,           // ⭐️ 星星：玩家火力升级 (+1 Tier)
    BC_ITEM_BOMB,           // 💣 核弹：引爆当前全屏存活的敌方坦克
    BC_ITEM_CLOCK,          // ⏰ 定时钟：冻结敌方坦克行动 10 秒
    BC_ITEM_HELMET,         // 🛡️ 钢盔：获得 10 秒绝对防御无敌护盾
    BC_ITEM_SHOVEL,         // 铲 铁铲：老家雄鹰四周筑起坚固钢板防线 (持续 15 秒)
    BC_ITEM_GUN,            // 🔫 终极枪：瞬间升至满级 Tier 4 星光破甲坦克
    BC_ITEM_LIFE,           // 💓 奖命：玩家生命数 +1
} bc_item_type_t;

// 掉落道具结构体
typedef struct {
    bool           active;
    bc_item_type_t type;
    int16_t        x;               // 像素 X
    int16_t        y;               // 像素 Y
    uint16_t       lifetime;        // 存活寿命倒计时 (超时消失)
    bool           blink;           // 闪烁渲染标记
} bc_item_t;

// 音效事件触发枚举
typedef enum {
    BC_EVT_NONE = 0,
    BC_EVT_START,           // 开场 8-bit 主题旋律
    BC_EVT_FIRE,            // 坦克开火
    BC_EVT_HIT_BRICK,       // 炮弹击碎砖墙
    BC_EVT_HIT_STEEL,       // 炮弹命中钢板弹飞
    BC_EVT_EXPLODE,         // 坦克被摧毁巨响
    BC_EVT_POWERUP,         // 拾取道具四连升音
    BC_EVT_BASE_HIT,        // 基地被毁终局警报
    BC_EVT_BONUS_LIFE,      // 获得额外生命
} bc_event_sound_t;

// ============================================================================
// ESP-NOW 无感双机极简互联协议数据包 (紧凑对齐，广播通信)
// ============================================================================
#define BC_NET_MAGIC        0x4243  // "BC" (Battle City)
#define BC_NET_VER          1

typedef enum {
    BC_PKT_BEACON = 1,      // 广播探测与握手包
    BC_PKT_SYNC_STATE,      // 1P(Host) 向 2P 广播全场同步数据
    BC_PKT_CLIENT_INPUT,    // 2P 向 1P 上报操控按键
} bc_pkt_type_t;

#pragma pack(push, 1)
typedef struct {
    uint16_t magic;         // BC_NET_MAGIC
    uint8_t  version;       // BC_NET_VER
    uint8_t  pkt_type;      // bc_pkt_type_t
    uint32_t seq;           // 包序列号
    union {
        struct {
            uint8_t mac[6]; // 发送方物理 MAC 地址
            uint8_t stage;  // 当前关卡
            uint8_t role;   // 0=Seek, 1=Host(1P), 2=Client(2P)
        } beacon;
        struct {
            uint8_t dir;    // 2P 方向
            uint8_t moving; // 2P 移动状态
            uint8_t fire;   // 2P 开火动作
        } input;
        struct {
            int16_t p1_x, p1_y;
            uint8_t p1_dir, p1_tier, p1_lives;
            int16_t p2_x, p2_y;
            uint8_t p2_dir, p2_tier, p2_lives;
            uint8_t base_alive;
            uint16_t score;
            uint8_t remaining_enemies;
        } sync;
    } payload;
} bc_net_packet_t;
#pragma pack(pop)

// ============================================================================
// 完整游戏全局世界状态
// ============================================================================
typedef struct {
    // 地图与瓦片状态
    uint8_t     map_tiles[BC_MAP_ROWS][BC_MAP_COLS];     // bc_tile_type_t
    uint8_t     sub_bricks[BC_MAP_ROWS][BC_MAP_COLS];    // 砖块 4-bit 掩码

    // 基地老家状态
    bool        base_alive;         // 雄鹰是否存活
    uint16_t    shovel_timer;       // 铲子钢板防线剩余倒计时 (0=砖墙, >0=钢墙)

    // 玩家坦克
    bc_tank_t   p1;                 // 玩家 1 (金色)
    bc_tank_t   p2;                 // 玩家 2 (绿色)
    uint8_t     p1_lives;           // P1 命数
    uint8_t     p2_lives;           // P2 命数
    bool        p2_active;          // 是否启用了 2P (单人/双人联机)

    // 敌方军团
    bc_tank_t   enemies[BC_MAX_ENEMIES];
    uint8_t     enemies_left_in_stage;  // 当前关卡待刷出的敌军总余量
    uint16_t    spawn_timer;            // 敌人生成倒计时
    uint16_t    freeze_timer;           // 定时钟冰冻敌人剩余时间

    // 炮弹与道具池
    bc_bullet_t bullets[BC_MAX_BULLETS];
    bc_item_t   items[BC_MAX_ITEMS];

    // 得分与关卡进程
    uint32_t    score;              // 当前累计得分
    uint8_t     stage;              // 当前关卡 (1..35)
    bool        game_over;          // 是否失败
    bool        victory;            // 是否通关
    bool        paused;             // 是否暂停
    bool        auto_fire_p1;       // P1 是否开启自动射击

    // 帧统计与事件声音通知
    uint32_t    ticks;              // 游戏总推进刻 (30fps)
    bc_event_sound_t last_sound;    // 最新触发的待播音效
} bc_game_t;

// ============================================================================
// 核心外部 API 函数声明
// ============================================================================

// 初始化新游戏与指定关卡地图
void bc_init_game(bc_game_t *game, uint8_t stage);

// 单帧物理世界推进更新 (建议以 30Hz ~ 50Hz 周期调用)
void bc_tick(bc_game_t *game);

// 玩家按键控制指令注入
void bc_player_turn(bc_game_t *game, uint8_t player_id, bc_dir_t dir);
void bc_player_turn_clockwise(bc_game_t *game, uint8_t player_id);
void bc_player_move(bc_game_t *game, uint8_t player_id, bool moving);
void bc_player_fire(bc_game_t *game, uint8_t player_id);
void bc_player_toggle_autofire(bc_game_t *game, uint8_t player_id);

// 地图瓦片查询与局部物理瓦解
bc_tile_type_t bc_get_tile(const bc_game_t *game, int col, int row);
bool bc_destroy_sub_brick(bc_game_t *game, int col, int row, int pixel_x, int pixel_y, bc_dir_t bullet_dir);

// 道具触发与老家修护
void bc_apply_item(bc_game_t *game, bc_item_type_t type, uint8_t player_id);

// 网络数据包封包与解包接口
size_t bc_pack_beacon(bc_net_packet_t *pkt, const uint8_t mac[6], uint8_t stage, uint8_t role);
size_t bc_pack_sync(bc_net_packet_t *pkt, const bc_game_t *game);
size_t bc_pack_input(bc_net_packet_t *pkt, uint8_t dir, uint8_t moving, uint8_t fire);
bool   bc_unpack_sync(bc_game_t *game, const bc_net_packet_t *pkt);

#ifdef __cplusplus
}
#endif
