#include <assert.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "worldtime_logic.h"

#define FLOAT_EPSILON 0.001f

static void test_city_database(void)
{
    printf("[TEST 1] Testing City Database...\n");

    int count = worldtime_get_city_count();
    assert(count >= 15);

    // 验证核心主流城市存在并配置正确
    const worldtime_city_t *beijing = worldtime_find_city("Beijing");
    assert(beijing != NULL);
    assert(strcmp(beijing->name_cn, "北京") == 0);
    assert(beijing->offset_min == 480); // UTC+8
    assert(beijing->latitude > 39.0f && beijing->latitude < 41.0f);
    assert(beijing->longitude > 116.0f && beijing->longitude < 117.0f);

    const worldtime_city_t *tokyo = worldtime_find_city("Tokyo");
    assert(tokyo != NULL);
    assert(tokyo->offset_min == 540); // UTC+9

    const worldtime_city_t *london = worldtime_find_city("London");
    assert(london != NULL);
    assert(london->offset_min == 0); // UTC+0

    const worldtime_city_t *paris = worldtime_find_city("Paris");
    assert(paris != NULL);
    assert(paris->offset_min == 60); // UTC+1

    const worldtime_city_t *dubai = worldtime_find_city("Dubai");
    assert(dubai != NULL);
    assert(dubai->offset_min == 240); // UTC+4

    const worldtime_city_t *ny = worldtime_find_city("New York");
    assert(ny != NULL);
    assert(ny->offset_min == -300); // UTC-5

    const worldtime_city_t *sf = worldtime_find_city("San Francisco");
    assert(sf != NULL);
    assert(sf->offset_min == -480); // UTC-8

    const worldtime_city_t *sydney = worldtime_find_city("Sydney");
    assert(sydney != NULL);
    assert(sydney->offset_min == 600); // UTC+10

    // 验证半小时与45分特色时区
    const worldtime_city_t *delhi = worldtime_find_city("New Delhi");
    assert(delhi != NULL);
    assert(delhi->offset_min == 330); // UTC+5:30

    const worldtime_city_t *adelaide = worldtime_find_city("Adelaide");
    assert(adelaide != NULL);
    assert(adelaide->offset_min == 570); // UTC+9:30

    const worldtime_city_t *kathmandu = worldtime_find_city("Kathmandu");
    assert(kathmandu != NULL);
    assert(kathmandu->offset_min == 345); // UTC+5:45

    // 中文名查询
    const worldtime_city_t *cn_query = worldtime_find_city("东京");
    assert(cn_query == tokyo);

    // 边界条件
    assert(worldtime_get_city(-1) == NULL);
    assert(worldtime_get_city(count) == NULL);
    assert(worldtime_find_city("NonExistentCity") == NULL);
    assert(worldtime_find_city(NULL) == NULL);

    printf("  ✓ City Database entries & lookup verified OK\n");
}

static void test_leap_year_and_calendar(void)
{
    printf("[TEST 2] Testing Leap Year & Calendar Arithmetic...\n");

    // 闰年法则验证：4年一闰，百年不闰，400年又闰
    assert(worldtime_is_leap_year(2000) == true);
    assert(worldtime_is_leap_year(2024) == true);
    assert(worldtime_is_leap_year(2028) == true);
    assert(worldtime_is_leap_year(1900) == false);
    assert(worldtime_is_leap_year(2023) == false);
    assert(worldtime_is_leap_year(2025) == false);
    assert(worldtime_is_leap_year(2026) == false);
    assert(worldtime_is_leap_year(2100) == false);

    // 每月天数
    assert(worldtime_days_in_month(2024, 2) == 29); // 闰年2月
    assert(worldtime_days_in_month(2023, 2) == 28); // 平年2月
    assert(worldtime_days_in_month(2026, 1) == 31);
    assert(worldtime_days_in_month(2026, 4) == 30);
    assert(worldtime_days_in_month(2026, 12) == 31);
    assert(worldtime_days_in_month(2026, 0) == 0);
    assert(worldtime_days_in_month(2026, 13) == 0);

    printf("  ✓ Leap Year & Days-in-month rules verified OK\n");
}

static void test_unix_timestamp_to_civil_date(void)
{
    printf("[TEST 3] Testing Unix Timestamp to Civil Date Conversion...\n");

    worldtime_datetime_t dt;

    // 1. Unix Epoch 起点: 1970-01-01 00:00:00 UTC (星期四)
    worldtime_unix_to_datetime(0, 0, &dt);
    assert(dt.year == 1970);
    assert(dt.month == 1);
    assert(dt.day == 1);
    assert(dt.hour == 0);
    assert(dt.minute == 0);
    assert(dt.second == 0);
    assert(dt.day_of_week == WORLDTIME_THURSDAY);
    assert(dt.day_of_year == 1);

    // 2. 闰年平年跨日计算 (2024 闰年 2月28 -> 2月29 -> 3月1日)
    // 2024-02-28 23:59:59 UTC
    worldtime_datetime_t ref_dt = {
        .year = 2024, .month = 2, .day = 28,
        .hour = 23, .minute = 59, .second = 59,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t ts = worldtime_datetime_to_unix(&ref_dt, 0);
    worldtime_unix_to_datetime(ts, 0, &dt);
    assert(dt.year == 2024 && dt.month == 2 && dt.day == 28);
    assert(dt.hour == 23 && dt.minute == 59 && dt.second == 59);

    // +1 秒 -> 2024-02-29 00:00:00 UTC (进入闰日)
    worldtime_unix_to_datetime(ts + 1, 0, &dt);
    assert(dt.year == 2024 && dt.month == 2 && dt.day == 29);
    assert(dt.hour == 0 && dt.minute == 0 && dt.second == 0);
    assert(dt.day_of_year == 60); // 31 + 29

    // +86400 秒 -> 2024-03-01 00:00:00 UTC (跨入3月)
    worldtime_unix_to_datetime(ts + 1 + 86400, 0, &dt);
    assert(dt.year == 2024 && dt.month == 3 && dt.day == 1);
    assert(dt.hour == 0 && dt.minute == 0 && dt.second == 0);
    assert(dt.day_of_year == 61);

    // 3. 平年 2023 2月跨月 (无2月29日，直接跨到3月1日)
    worldtime_datetime_t nonleap_dt = {
        .year = 2023, .month = 2, .day = 28,
        .hour = 23, .minute = 59, .second = 59,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t ts_nonleap = worldtime_datetime_to_unix(&nonleap_dt, 0);
    worldtime_unix_to_datetime(ts_nonleap + 1, 0, &dt);
    assert(dt.year == 2023 && dt.month == 3 && dt.day == 1);
    assert(dt.hour == 0 && dt.minute == 0 && dt.second == 0);

    // 4. 跨年计算 (2025-12-31 23:59:59 -> 2026-01-01 00:00:00)
    worldtime_datetime_t year_end = {
        .year = 2025, .month = 12, .day = 31,
        .hour = 23, .minute = 59, .second = 59,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t ts_nye = worldtime_datetime_to_unix(&year_end, 0);
    worldtime_unix_to_datetime(ts_nye + 1, 0, &dt);
    assert(dt.year == 2026 && dt.month == 1 && dt.day == 1);
    assert(dt.hour == 0 && dt.minute == 0 && dt.second == 0);
    assert(dt.day_of_week == WORLDTIME_THURSDAY); // 2026-01-01 是周四
    assert(dt.day_of_year == 1);

    // 5. 双向往返转换测试 (Roundtrip)
    static const int test_years[] = {1970, 1980, 2000, 2024, 2026, 2038, 2099};
    for (size_t i = 0; i < sizeof(test_years) / sizeof(test_years[0]); i++) {
        int y = test_years[i];
        worldtime_datetime_t orig = {
            .year = y, .month = 6, .day = 15,
            .hour = 14, .minute = 30, .second = 45,
            .day_of_week = 0, .day_of_year = 0
        };
        int64_t t = worldtime_datetime_to_unix(&orig, 0);
        worldtime_datetime_t restored;
        worldtime_unix_to_datetime(t, 0, &restored);
        assert(restored.year == orig.year);
        assert(restored.month == orig.month);
        assert(restored.day == orig.day);
        assert(restored.hour == orig.hour);
        assert(restored.minute == orig.minute);
        assert(restored.second == orig.second);
    }

    printf("  ✓ Timestamp to Civil Date, Leap/Normal year transitions verified OK\n");
}

static void test_timezone_offsets_and_day_crossing(void)
{
    printf("[TEST 4] Testing Timezone Offsets (Positive, Negative, Half-Hour)...\n");

    // 给定 UTC 时间点：2026-05-01 18:30:00
    worldtime_datetime_t utc_ref = {
        .year = 2026, .month = 5, .day = 1,
        .hour = 18, .minute = 30, .second = 0,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t utc_ts = worldtime_datetime_to_unix(&utc_ref, 0);

    // 1. 正时区跨日: 北京 (UTC+8, +480 min) -> 应当跨越到次日 2026-05-02 02:30:00
    const worldtime_city_t *beijing = worldtime_find_city("Beijing");
    worldtime_datetime_t bj_dt;
    worldtime_calc_city_time(utc_ts, beijing, &bj_dt);
    assert(bj_dt.year == 2026);
    assert(bj_dt.month == 5);
    assert(bj_dt.day == 2); // 次日
    assert(bj_dt.hour == 2);
    assert(bj_dt.minute == 30);
    assert(bj_dt.second == 0);

    // 2. 负时区跨月跨日: 给定 UTC 2026-05-01 02:15:00
    worldtime_datetime_t utc_early = {
        .year = 2026, .month = 5, .day = 1,
        .hour = 2, .minute = 15, .second = 0,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t utc_early_ts = worldtime_datetime_to_unix(&utc_early, 0);

    // 纽约 (UTC-5, -300 min) -> 倒退至前一个月前一日 2026-04-30 21:15:00
    const worldtime_city_t *ny = worldtime_find_city("New York");
    worldtime_datetime_t ny_dt;
    worldtime_calc_city_time(utc_early_ts, ny, &ny_dt);
    assert(ny_dt.year == 2026);
    assert(ny_dt.month == 4); // 4月
    assert(ny_dt.day == 30);  // 30日
    assert(ny_dt.hour == 21);
    assert(ny_dt.minute == 15);

    // 旧金山 (UTC-8, -480 min) -> 2026-04-30 18:15:00
    const worldtime_city_t *sf = worldtime_find_city("San Francisco");
    worldtime_datetime_t sf_dt;
    worldtime_calc_city_time(utc_early_ts, sf, &sf_dt);
    assert(sf_dt.year == 2026);
    assert(sf_dt.month == 4);
    assert(sf_dt.day == 30);
    assert(sf_dt.hour == 18);
    assert(sf_dt.minute == 15);

    // 3. 半小时时区: 新德里 (UTC+5:30, +330 min)
    // UTC 12:15:00 -> 新德里 17:45:00
    worldtime_datetime_t utc_noon = {
        .year = 2026, .month = 7, .day = 10,
        .hour = 12, .minute = 15, .second = 0,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t noon_ts = worldtime_datetime_to_unix(&utc_noon, 0);
    const worldtime_city_t *delhi = worldtime_find_city("New Delhi");
    worldtime_datetime_t delhi_dt;
    worldtime_calc_city_time(noon_ts, delhi, &delhi_dt);
    assert(delhi_dt.hour == 17);
    assert(delhi_dt.minute == 45);

    // 阿德莱德 (UTC+9:30, +570 min)
    // UTC 12:15:00 -> 阿德莱德 21:45:00
    const worldtime_city_t *adelaide = worldtime_find_city("Adelaide");
    worldtime_datetime_t adelaide_dt;
    worldtime_calc_city_time(noon_ts, adelaide, &adelaide_dt);
    assert(adelaide_dt.hour == 21);
    assert(adelaide_dt.minute == 45);

    // 4. 45分特色时区: 加德满都 (UTC+5:45, +345 min)
    // UTC 12:15:00 -> 加德满都 18:00:00
    const worldtime_city_t *kathmandu = worldtime_find_city("Kathmandu");
    worldtime_datetime_t ktm_dt;
    worldtime_calc_city_time(noon_ts, kathmandu, &ktm_dt);
    assert(ktm_dt.hour == 18);
    assert(ktm_dt.minute == 0);

    // 5. 跨年时区边界:
    // UTC 2025-12-31 20:00:00 -> 北京 2026-01-01 04:00:00 (跨新年)
    worldtime_datetime_t nye_utc = {
        .year = 2025, .month = 12, .day = 31,
        .hour = 20, .minute = 0, .second = 0,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t nye_ts = worldtime_datetime_to_unix(&nye_utc, 0);
    worldtime_calc_city_time(nye_ts, beijing, &bj_dt);
    assert(bj_dt.year == 2026 && bj_dt.month == 1 && bj_dt.day == 1);

    // UTC 2026-01-01 04:00:00 -> 旧金山 2025-12-31 20:00:00 (退回前一年)
    worldtime_datetime_t ny_utc = {
        .year = 2026, .month = 1, .day = 1,
        .hour = 4, .minute = 0, .second = 0,
        .day_of_week = 0, .day_of_year = 0
    };
    int64_t ny_ts = worldtime_datetime_to_unix(&ny_utc, 0);
    worldtime_calc_city_time(ny_ts, sf, &sf_dt);
    assert(sf_dt.year == 2025 && sf_dt.month == 12 && sf_dt.day == 31);
    assert(sf_dt.hour == 20 && sf_dt.minute == 0);

    printf("  ✓ Positive, Negative, Half-Hour (+5:30/+9:30), 45-min (+5:45) offsets OK\n");
}

static void test_solar_day_night_and_progress(void)
{
    printf("[TEST 5] Testing Solar Day/Night & Progress Calculation...\n");

    // 1. 经线对齐标准城市的日夜推演 (如 London 经度约 0°，时区 0)
    const worldtime_city_t *london = worldtime_find_city("London");
    float progress = 0.0f;
    worldtime_solar_info_t info;

    // 06:00 -> 白昼起点 (DAY)，进度 0.0
    worldtime_solar_state_t st6 = worldtime_calc_solar(london, 6, 0, &progress);
    assert(st6 == WORLDTIME_SOLAR_DAY);
    assert(fabsf(progress - 0.0f) < 0.02f);

    // 12:00 -> 正午 (DAY)，进度约 0.50，高度角达峰
    worldtime_calc_solar_info(london, 12, 0, &info);
    assert(info.state == WORLDTIME_SOLAR_DAY);
    assert(fabsf(info.solar_progress - 0.5f) < 0.02f);
    assert(info.solar_elevation > 0.99f);

    // 15:00 -> 下午 (DAY)，进度约 0.75
    worldtime_calc_solar_info(london, 15, 0, &info);
    assert(info.state == WORLDTIME_SOLAR_DAY);
    assert(fabsf(info.solar_progress - 0.75f) < 0.02f);

    // 18:30 -> 黄昏 (DUSK)
    worldtime_solar_state_t st_dusk = worldtime_calc_solar(london, 18, 30, &progress);
    assert(st_dusk == WORLDTIME_SOLAR_DUSK);
    assert(fabsf(progress - 1.0f) < FLOAT_EPSILON);
    assert(strcmp(worldtime_solar_state_name(st_dusk), "DUSK") == 0);

    // 22:00 -> 黑夜 (NIGHT)，进度 0.0
    worldtime_solar_state_t st_night = worldtime_calc_solar(london, 22, 0, &progress);
    assert(st_night == WORLDTIME_SOLAR_NIGHT);
    assert(fabsf(progress - 0.0f) < FLOAT_EPSILON);
    assert(strcmp(worldtime_solar_state_name(st_night), "NIGHT") == 0);

    // 02:00 -> 凌晨黑夜 (NIGHT)
    worldtime_solar_state_t st_midnight = worldtime_calc_solar(london, 2, 0, &progress);
    assert(st_midnight == WORLDTIME_SOLAR_NIGHT);

    // 2. 经度时间差修正验证 (真太阳时偏差)
    // 北京: 时区 UTC+8 (中央经线 120°E)，当地实际经度 116.4074°E
    // 经度差 = 116.4074 - 120 = -3.5926°
    // 太阳时修正 = -3.5926 * 4 分钟 = -14.37 分钟
    float bj_solar_hour = worldtime_calc_solar_hour(12, 0, 116.4074f, 480);
    // 当地 12:00 时，北京真太阳时约为 11:45.6 = 11.76 小时
    assert(fabsf(bj_solar_hour - 11.76f) < 0.05f);

    // 城市传入 NULL 时的默认推算
    worldtime_solar_state_t st_null = worldtime_calc_solar(NULL, 12, 0, &progress);
    assert(st_null == WORLDTIME_SOLAR_DAY);
    assert(fabsf(progress - 0.5f) < FLOAT_EPSILON);

    printf("  ✓ Solar Day/Night (06:00~18:00, Dusk, Night) & Progress (0.0~1.0) OK\n");
}

static void test_meeting_alignment_matrix(void)
{
    printf("[TEST 6] Testing Cross-Timezone Meeting Alignment Matrix...\n");

    const worldtime_city_t *beijing = worldtime_find_city("Beijing");
    const worldtime_city_t *tokyo = worldtime_find_city("Tokyo");
    const worldtime_city_t *london = worldtime_find_city("London");
    const worldtime_city_t *ny = worldtime_find_city("New York");
    const worldtime_city_t *sf = worldtime_find_city("San Francisco");
    const worldtime_city_t *delhi = worldtime_find_city("New Delhi");

    const worldtime_city_t *selected_cities[] = {
        tokyo, london, ny, sf, delhi
    };

    worldtime_meeting_matrix_t matrix;

    // 设基准城市为北京，会议时间定于当地 15:00
    int ret = worldtime_build_meeting_matrix(beijing, 15, 0, selected_cities, 5, &matrix);
    assert(ret == 5);
    assert(matrix.base_city == beijing);
    assert(matrix.base_hour == 15);
    assert(matrix.base_minute == 0);

    // 1. 东京 (UTC+9, 比北京快1小时) -> 16:00，当日，工作时间
    assert(matrix.items[0].city == tokyo);
    assert(matrix.items[0].local_hour == 16);
    assert(matrix.items[0].local_minute == 0);
    assert(matrix.items[0].day_offset == 0);
    assert(matrix.items[0].is_business_hour == true);

    // 2. 伦敦 (UTC+0, 比北京慢8小时) -> 07:00，当日，非工作时间 (9点前)
    assert(matrix.items[1].city == london);
    assert(matrix.items[1].local_hour == 7);
    assert(matrix.items[1].local_minute == 0);
    assert(matrix.items[1].day_offset == 0);
    assert(matrix.items[1].is_business_hour == false);

    // 3. 纽约 (UTC-5, 比北京慢13小时) -> 02:00，当日，夜间非工作时间
    assert(matrix.items[2].city == ny);
    assert(matrix.items[2].local_hour == 2);
    assert(matrix.items[2].local_minute == 0);
    assert(matrix.items[2].day_offset == 0);
    assert(matrix.items[2].is_business_hour == false);

    // 4. 旧金山 (UTC-8, 比北京慢16小时) -> 15 - 16 = -1 -> 前一天 23:00 (day_offset = -1)
    assert(matrix.items[3].city == sf);
    assert(matrix.items[3].local_hour == 23);
    assert(matrix.items[3].local_minute == 0);
    assert(matrix.items[3].day_offset == -1); // 跨日前一天
    assert(matrix.items[3].is_business_hour == false);

    // 5. 新德里 (UTC+5:30, 比北京慢2.5小时) -> 15:00 - 2:30 = 12:30，工作时间
    assert(matrix.items[4].city == delhi);
    assert(matrix.items[4].local_hour == 12);
    assert(matrix.items[4].local_minute == 30);
    assert(matrix.items[4].day_offset == 0);
    assert(matrix.items[4].is_business_hour == true);

    // 6. 验证全量城市矩阵生成
    worldtime_meeting_matrix_t all_matrix;
    int all_count = worldtime_align_meeting_all(beijing, 9, 0, &all_matrix);
    assert(all_count == worldtime_get_city_count());
    assert(all_matrix.count == all_count);

    // 7. 伦敦基准 22:00 时对齐东京 -> 跨入次日 (day_offset = +1)
    worldtime_meeting_matrix_t lon_matrix;
    const worldtime_city_t *tokyo_arr[] = { tokyo };
    worldtime_build_meeting_matrix(london, 22, 0, tokyo_arr, 1, &lon_matrix);
    assert(lon_matrix.items[0].local_hour == 7);
    assert(lon_matrix.items[0].day_offset == 1);

    printf("  ✓ Cross-Timezone Alignment Matrix (day offsets, half-hours, business hours) OK\n");
}

static void test_companion_state_and_key_interaction(void)
{
    printf("[TEST 7] Testing Companion State & Key Interaction (UP/DOWN/OK)...\n");

    worldtime_companion_t comp;
    int total = worldtime_get_city_count();
    worldtime_init(&comp, total);

    // 初始状态检查
    assert(comp.view_mode == WORLDTIME_VIEW_CARD);
    assert(comp.selected_city_idx == 0);
    assert(comp.matrix_base_hour == 9);
    assert(comp.total_cities == total);
    assert(worldtime_get_selected_city(&comp) == worldtime_get_city(0));

    // 按 UP：向前循环环绕至最后一个城市
    worldtime_handle_key(&comp, WORLDTIME_KEY_UP);
    assert(comp.selected_city_idx == total - 1);

    // 按 DOWN：向后循环环绕回到第 0 个城市
    worldtime_handle_key(&comp, WORLDTIME_KEY_DOWN);
    assert(comp.selected_city_idx == 0);

    // 再按 DOWN：下一个城市 (1)
    worldtime_handle_key(&comp, WORLDTIME_KEY_DOWN);
    assert(comp.selected_city_idx == 1);
    assert(worldtime_get_selected_city(&comp) == worldtime_get_city(1));

    // 按 OK：切换视图模式 (卡片 -> 矩阵)
    worldtime_handle_key(&comp, WORLDTIME_KEY_OK);
    assert(comp.view_mode == WORLDTIME_VIEW_MATRIX);

    // 再次按 OK：切换回卡片视图
    worldtime_handle_key(&comp, WORLDTIME_KEY_OK);
    assert(comp.view_mode == WORLDTIME_VIEW_CARD);

    // 时间戳更新与矩阵基准时间设置
    worldtime_set_timestamp(&comp, 1767225600);
    assert(comp.current_timestamp == 1767225600);

    worldtime_set_matrix_base_time(&comp, 14, 30);
    assert(comp.matrix_base_hour == 14);
    assert(comp.matrix_base_minute == 30);

    worldtime_set_selected_city(&comp, 3);
    assert(comp.selected_city_idx == 3);

    printf("  ✓ Companion State Machine & Key Handling (UP/DOWN/OK) verified OK\n");
}

static void test_clock_angles_and_overlap(void)
{
    printf("[TEST 8] Analog Clock Angles & Best Meeting Overlap...\n");

    float h = -1.0f, m = -1.0f, s = -1.0f;
    worldtime_clock_angles(0, 0, 0, &h, &m, &s);
    assert(fabsf(h) < FLOAT_EPSILON);
    assert(fabsf(m) < FLOAT_EPSILON);
    assert(fabsf(s) < FLOAT_EPSILON);

    worldtime_clock_angles(3, 0, 0, &h, &m, &s);
    assert(fabsf(h - 90.0f) < FLOAT_EPSILON);
    assert(fabsf(m) < FLOAT_EPSILON);

    worldtime_clock_angles(15, 30, 0, &h, &m, &s);
    assert(fabsf(h - 105.0f) < FLOAT_EPSILON); // 3:30 -> 90 + 15
    assert(fabsf(m - 180.0f) < FLOAT_EPSILON);

    worldtime_clock_angles(6, 0, 30, &h, &m, &s);
    assert(fabsf(s - 180.0f) < FLOAT_EPSILON);
    assert(fabsf(m - 3.0f) < FLOAT_EPSILON);

    const worldtime_city_t *beijing = worldtime_find_city("Beijing");
    assert(beijing != NULL);

    int overlap = 0;
    int best = worldtime_find_best_overlap_hour(beijing, &overlap);
    assert(best >= 0 && best < 24);
    assert(overlap > 0);

    worldtime_meeting_matrix_t matrix;
    worldtime_align_meeting_all(beijing, best, 0, &matrix);
    assert(worldtime_count_business_hours(&matrix) == overlap);

    assert(worldtime_find_best_overlap_hour(NULL, &overlap) == -1);
    assert(overlap == 0);
    assert(worldtime_count_business_hours(NULL) == 0);

    printf("  ✓ Analog clock hands & global overlap finder OK\n");
}

int main(void)
{
    printf("=================================================================\n");
    printf("  FoloToy AI Passport: World Timezone Companion Logic Test Suite\n");
    printf("=================================================================\n");

    test_city_database();
    test_leap_year_and_calendar();
    test_unix_timestamp_to_civil_date();
    test_timezone_offsets_and_day_crossing();
    test_solar_day_night_and_progress();
    test_meeting_alignment_matrix();
    test_companion_state_and_key_interaction();
    test_clock_angles_and_overlap();

    printf("\n>>> ALL WORLD TIMEZONE LOGIC HOST TESTS PASSED! <<<\n");
    return 0;
}
