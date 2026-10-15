#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define WORLDTIME_MAX_CITIES   32
#define WORLDTIME_MAX_NAME_LEN 32

// 昼夜状态 (Solar Day / Night)
typedef enum {
    WORLDTIME_SOLAR_NIGHT = 0, // 黑夜
    WORLDTIME_SOLAR_DAY   = 1, // 白昼 (06:00 ~ 18:00)
    WORLDTIME_SOLAR_DUSK  = 2, // 黄昏 (18:00 ~ 19:30)
} worldtime_solar_state_t;

// 视图模式
typedef enum {
    WORLDTIME_VIEW_CARD   = 0, // 卡片时钟模式
    WORLDTIME_VIEW_MATRIX = 1, // 矩阵换算模式
} worldtime_view_mode_t;

// 按键输入类型
typedef enum {
    WORLDTIME_KEY_UP   = 0, // 上一切换
    WORLDTIME_KEY_DOWN = 1, // 下一切换
    WORLDTIME_KEY_OK   = 2, // 切换视图
} worldtime_key_t;

// 星期枚举 (0=周日, 1=周一, ...)
typedef enum {
    WORLDTIME_SUNDAY    = 0,
    WORLDTIME_MONDAY    = 1,
    WORLDTIME_TUESDAY   = 2,
    WORLDTIME_WEDNESDAY = 3,
    WORLDTIME_THURSDAY  = 4,
    WORLDTIME_FRIDAY    = 5,
    WORLDTIME_SATURDAY  = 6,
} worldtime_weekday_t;

// 城市与时区数据结构
typedef struct {
    char name[WORLDTIME_MAX_NAME_LEN];    // 城市英文名称 (如 "Beijing", "Tokyo")
    char name_cn[WORLDTIME_MAX_NAME_LEN]; // 城市中文名称 (如 "北京", "东京")
    char country[WORLDTIME_MAX_NAME_LEN]; // 国家/地区代码或名称 (如 "CN", "JP")
    int16_t offset_min;                   // 相对 UTC 的时区偏差 (分钟)，兼容半小时/45分
    float latitude;                       // 纬度 (北纬正，南纬负)
    float longitude;                      // 经度 (东经正，西经负)
    const char *tz_abbr;                  // 时区缩写 (如 "CST", "JST", "GMT", "EST")
} worldtime_city_t;

// 公历日期时间结构体
typedef struct {
    int year;        // 年份 (如 2026)
    int month;       // 月份 (1 ~ 12)
    int day;         // 日期 (1 ~ 31)
    int hour;        // 小时 (0 ~ 23)
    int minute;      // 分钟 (0 ~ 59)
    int second;      // 秒数 (0 ~ 59)
    int day_of_week; // 星期 (0=周日, 1=周一, ..., 6=周六)
    int day_of_year; // 一年中的第几天 (1 ~ 366)
} worldtime_datetime_t;

// 昼夜与太阳位置详细信息
typedef struct {
    worldtime_solar_state_t state; // 当前昼夜状态 (DAY / DUSK / NIGHT)
    float solar_progress;         // 太阳在天空中运行进度 (0.0 ~ 1.0，白昼 06:00=0.0, 12:00=0.5, 18:00=1.0)
    float day_cycle_progress;     // 24小时全天循环进度 (0.0 ~ 1.0)
    float solar_hour;             // 经度修正后的真太阳时小时数 (0.0 ~ 24.0)
    float solar_elevation;        // 太阳高度角模拟归一化因子 (正午=1.0, 晨昏=0.0, 夜间=0.0)
} worldtime_solar_info_t;

// 跨时区会议对齐矩阵单项
typedef struct {
    const worldtime_city_t *city; // 目标城市
    int local_hour;               // 当地小时 (0 ~ 23)
    int local_minute;             // 当地分钟 (0 ~ 59)
    int day_offset;               // 跨日偏移 (-1: 昨日, 0: 当日, +1: 次日)
    bool is_business_hour;        // 是否处于工作时间 (09:00 ~ 18:00)
    worldtime_solar_state_t solar_state; // 当地昼夜状态
    float solar_progress;         // 太阳位置进度
} worldtime_matrix_item_t;

// 跨时区会议对齐矩阵结果
typedef struct {
    const worldtime_city_t *base_city; // 基准城市
    int base_hour;                     // 基准小时
    int base_minute;                   // 基准分钟
    int count;                         // 矩阵包含的城市数
    worldtime_matrix_item_t items[WORLDTIME_MAX_CITIES];
} worldtime_meeting_matrix_t;

// 伴侣主控状态模型 (纯 C11 状态机，无平台依赖)
typedef struct {
    worldtime_view_mode_t view_mode; // 当前视图模式 (卡片 / 矩阵)
    int selected_city_idx;           // 当前选中城市索引
    int matrix_base_hour;            // 矩阵换算的基准小时 (0 ~ 23)
    int matrix_base_minute;          // 矩阵换算的基准分钟 (0 ~ 59)
    int total_cities;                // 城市列表总数
    int64_t current_timestamp;       // 当前 UTC Unix 时间戳
} worldtime_companion_t;

// 1. 城市数据库查询接口
int worldtime_get_city_count(void);
const worldtime_city_t *worldtime_get_city(int index);
const worldtime_city_t *worldtime_find_city(const char *name);

// 2. 日历与闰年工具函数
bool worldtime_is_leap_year(int year);
int worldtime_days_in_month(int year, int month);

// 3. 时间转换接口
void worldtime_unix_to_datetime(int64_t unix_sec, int16_t offset_min, worldtime_datetime_t *out_dt);
int64_t worldtime_datetime_to_unix(const worldtime_datetime_t *dt, int16_t offset_min);
void worldtime_calc_city_time(int64_t unix_sec, const worldtime_city_t *city, worldtime_datetime_t *out_dt);

// 4. 昼夜状态与太阳位置计算
float worldtime_calc_solar_hour(int hour, int minute, float longitude, int16_t offset_min);
worldtime_solar_state_t worldtime_calc_solar(const worldtime_city_t *city, int hour, int minute, float *out_progress);
void worldtime_calc_solar_info(const worldtime_city_t *city, int hour, int minute, worldtime_solar_info_t *out_info);
const char *worldtime_solar_state_name(worldtime_solar_state_t state);

// 模拟时钟指针角度 (0 度 = 12 点方向，顺时针)
void worldtime_clock_angles(int hour, int minute, int second,
                            float *out_hour_deg, float *out_min_deg, float *out_sec_deg);

// 统计矩阵中处于工作时间的城市数
int worldtime_count_business_hours(const worldtime_meeting_matrix_t *matrix);

// 以基准城市寻找全球工作时间重叠最多的整点 (返回 0~23，失败返回 -1)
int worldtime_find_best_overlap_hour(const worldtime_city_t *base_city, int *out_count);

// 5. 跨时区会议对齐矩阵
int worldtime_build_meeting_matrix(const worldtime_city_t *base_city,
                                  int base_hour,
                                  int base_minute,
                                  const worldtime_city_t *cities[],
                                  int city_count,
                                  worldtime_meeting_matrix_t *out_matrix);
int worldtime_align_meeting(const worldtime_city_t *base_city,
                            int base_hour,
                            int base_minute,
                            const worldtime_city_t cities[],
                            int city_count,
                            worldtime_meeting_matrix_t *out_matrix);
int worldtime_align_meeting_all(const worldtime_city_t *base_city,
                                int base_hour,
                                int base_minute,
                                worldtime_meeting_matrix_t *out_matrix);

// 6. 伴侣主控状态机与按键交互
void worldtime_init(worldtime_companion_t *comp, int total_cities);
void worldtime_handle_key(worldtime_companion_t *comp, worldtime_key_t key);
void worldtime_set_timestamp(worldtime_companion_t *comp, int64_t unix_sec);
void worldtime_set_selected_city(worldtime_companion_t *comp, int index);
void worldtime_set_matrix_base_time(worldtime_companion_t *comp, int hour, int minute);
const worldtime_city_t *worldtime_get_selected_city(const worldtime_companion_t *comp);

#ifdef __cplusplus
}
#endif
