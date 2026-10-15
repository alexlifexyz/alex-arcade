#include "worldtime_logic.h"

#include <math.h>
#include <string.h>

// 内置主流与特色城市库 (覆盖主流时区、东西半球、半小时/45分等特色时区)
static const worldtime_city_t s_builtin_cities[] = {
    {"Beijing", "北京", "CN", 480, 39.9042f, 116.4074f, "CST"},
    {"Tokyo", "东京", "JP", 540, 35.6762f, 139.6503f, "JST"},
    {"London", "伦敦", "GB", 0, 51.5074f, -0.1278f, "GMT"},
    {"Paris", "巴黎", "FR", 60, 48.8566f, 2.3522f, "CET"},
    {"Dubai", "迪拜", "AE", 240, 25.2048f, 55.2708f, "GST"},
    {"New Delhi", "新德里", "IN", 330, 28.6139f, 77.2090f, "IST"},
    {"Bangkok", "曼谷", "TH", 420, 13.7563f, 100.5018f, "ICT"},
    {"Singapore", "新加坡", "SG", 480, 1.3521f, 103.8198f, "SGT"},
    {"Sydney", "悉尼", "AU", 600, -33.8688f, 151.2093f, "AEST"},
    {"Adelaide", "阿德莱德", "AU", 570, -34.9285f, 138.6007f, "ACST"},
    {"Auckland", "奥克兰", "NZ", 720, -36.8485f, 174.7633f, "NZST"},
    {"Cairo", "开罗", "EG", 120, 30.0444f, 31.2357f, "EET"},
    {"New York", "纽约", "US", -300, 40.7128f, -74.0060f, "EST"},
    {"San Francisco", "旧金山", "US", -480, 37.7749f, -122.4194f, "PST"},
    {"Honolulu", "檀香山", "US", -600, 21.3069f, -157.8583f, "HST"},
    {"Kathmandu", "加德满都", "NP", 345, 27.7172f, 85.3240f, "NPT"},
    {"Sao Paulo", "圣保罗", "BR", -180, -23.5505f, -46.6333f, "BRT"},
};

#define BUILTIN_CITY_COUNT ((int)(sizeof(s_builtin_cities) / sizeof(s_builtin_cities[0])))

int worldtime_get_city_count(void)
{
    return BUILTIN_CITY_COUNT;
}

const worldtime_city_t *worldtime_get_city(int index)
{
    if (index < 0 || index >= BUILTIN_CITY_COUNT) {
        return NULL;
    }
    return &s_builtin_cities[index];
}

const worldtime_city_t *worldtime_find_city(const char *name)
{
    if (!name) return NULL;
    for (int i = 0; i < BUILTIN_CITY_COUNT; i++) {
        if (strcmp(s_builtin_cities[i].name, name) == 0 ||
            strcmp(s_builtin_cities[i].name_cn, name) == 0) {
            return &s_builtin_cities[i];
        }
    }
    return NULL;
}

bool worldtime_is_leap_year(int year)
{
    return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}

int worldtime_days_in_month(int year, int month)
{
    static const int days[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month < 1 || month > 12) {
        return 0;
    }
    if (month == 2 && worldtime_is_leap_year(year)) {
        return 29;
    }
    return days[month - 1];
}

void worldtime_unix_to_datetime(int64_t unix_sec, int16_t offset_min, worldtime_datetime_t *out_dt)
{
    if (!out_dt) return;

    int64_t local_sec = unix_sec + (int64_t)offset_min * 60;
    int64_t days = local_sec / 86400;
    int rem_sec = (int)(local_sec % 86400);
    if (rem_sec < 0) {
        rem_sec += 86400;
        days -= 1;
    }

    out_dt->hour = rem_sec / 3600;
    int rem_min = rem_sec % 3600;
    out_dt->minute = rem_min / 60;
    out_dt->second = rem_min % 60;

    int dow = (int)((days + 4) % 7);
    if (dow < 0) dow += 7;
    out_dt->day_of_week = dow;

    int64_t z = days + 719468;
    int64_t era = (z >= 0 ? z : z - 146096) / 146097;
    unsigned doe = (unsigned)(z - era * 146097);
    unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    int64_t y = (int64_t)yoe + era * 400;
    unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    unsigned mp = (5 * doy + 2) / 153;
    unsigned d = doy - (153 * mp + 2) / 5 + 1;
    unsigned m = mp < 10 ? mp + 3 : mp - 9;
    y += (m <= 2);

    out_dt->year = (int)y;
    out_dt->month = (int)m;
    out_dt->day = (int)d;

    static const int s_days_before_month[2][13] = {
        {0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334},
        {0, 0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335}
    };
    bool leap = worldtime_is_leap_year(out_dt->year);
    out_dt->day_of_year = s_days_before_month[leap ? 1 : 0][out_dt->month] + out_dt->day;
}

int64_t worldtime_datetime_to_unix(const worldtime_datetime_t *dt, int16_t offset_min)
{
    if (!dt) return 0;
    int64_t y = dt->year - (dt->month <= 2 ? 1 : 0);
    int64_t era = (y >= 0 ? y : y - 399) / 400;
    unsigned yoe = (unsigned)(y - era * 400);
    unsigned m = (unsigned)(dt->month > 2 ? dt->month - 3 : dt->month + 9);
    unsigned doy = (153 * m + 2) / 5 + (unsigned)dt->day - 1;
    unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    int64_t days = era * 146097 + (int64_t)doe - 719468;
    int64_t local_sec = days * 86400 + dt->hour * 3600 + dt->minute * 60 + dt->second;
    return local_sec - (int64_t)offset_min * 60;
}

void worldtime_calc_city_time(int64_t unix_sec, const worldtime_city_t *city, worldtime_datetime_t *out_dt)
{
    int16_t offset = city ? city->offset_min : 0;
    worldtime_unix_to_datetime(unix_sec, offset, out_dt);
}

float worldtime_calc_solar_hour(int hour, int minute, float longitude, int16_t offset_min)
{
    float standard_meridian = ((float)offset_min / 60.0f) * 15.0f;
    float delta_lon = longitude - standard_meridian;
    float solar_min = (float)(hour * 60 + minute) + delta_lon * 4.0f;
    while (solar_min < 0.0f) {
        solar_min += 1440.0f;
    }
    while (solar_min >= 1440.0f) {
        solar_min -= 1440.0f;
    }
    return solar_min / 60.0f;
}

void worldtime_calc_solar_info(const worldtime_city_t *city, int hour, int minute, worldtime_solar_info_t *out_info)
{
    if (!out_info) return;

    float local_time = (float)hour + (float)minute / 60.0f;
    while (local_time < 0.0f) local_time += 24.0f;
    while (local_time >= 24.0f) local_time -= 24.0f;

    float solar_hour;
    if (city) {
        solar_hour = worldtime_calc_solar_hour(hour, minute, city->longitude, city->offset_min);
    } else {
        solar_hour = local_time;
    }

    out_info->solar_hour = solar_hour;
    out_info->day_cycle_progress = solar_hour / 24.0f;

    // 白昼判定 (当地时间 06:00 ~ 18:00)
    if (local_time >= 6.0f && local_time < 18.0f) {
        out_info->state = WORLDTIME_SOLAR_DAY;
        float prog = (solar_hour - 6.0f) / 12.0f;
        if (prog < 0.0f) prog = 0.0f;
        if (prog > 1.0f) prog = 1.0f;
        out_info->solar_progress = prog;
        float theta = (solar_hour - 6.0f) * 3.14159265f / 12.0f;
        if (theta < 0.0f) theta = 0.0f;
        if (theta > 3.14159265f) theta = 3.14159265f;
        out_info->solar_elevation = sinf(theta);
    } else if (local_time >= 18.0f && local_time < 19.5f) {
        // 黄昏 (18:00 ~ 19:30)
        out_info->state = WORLDTIME_SOLAR_DUSK;
        out_info->solar_progress = 1.0f;
        out_info->solar_elevation = 0.0f;
    } else {
        // 黑夜
        out_info->state = WORLDTIME_SOLAR_NIGHT;
        out_info->solar_progress = 0.0f;
        out_info->solar_elevation = 0.0f;
    }
}

worldtime_solar_state_t worldtime_calc_solar(const worldtime_city_t *city, int hour, int minute, float *out_progress)
{
    worldtime_solar_info_t info;
    worldtime_calc_solar_info(city, hour, minute, &info);
    if (out_progress) {
        *out_progress = info.solar_progress;
    }
    return info.state;
}

const char *worldtime_solar_state_name(worldtime_solar_state_t state)
{
    switch (state) {
    case WORLDTIME_SOLAR_DAY:   return "DAY";
    case WORLDTIME_SOLAR_DUSK:  return "DUSK";
    case WORLDTIME_SOLAR_NIGHT: return "NIGHT";
    default:                    return "UNKNOWN";
    }
}

void worldtime_clock_angles(int hour, int minute, int second,
                            float *out_hour_deg, float *out_min_deg, float *out_sec_deg)
{
    if (hour < 0) {
        hour = 0;
    }
    hour %= 12;
    if (minute < 0) {
        minute = 0;
    } else if (minute > 59) {
        minute = 59;
    }
    if (second < 0) {
        second = 0;
    } else if (second > 59) {
        second = 59;
    }

    if (out_sec_deg) {
        *out_sec_deg = (float)second * 6.0f;
    }
    if (out_min_deg) {
        *out_min_deg = (float)minute * 6.0f + (float)second * 0.1f;
    }
    if (out_hour_deg) {
        *out_hour_deg = (float)hour * 30.0f + (float)minute * 0.5f + (float)second * (0.5f / 60.0f);
    }
}

int worldtime_count_business_hours(const worldtime_meeting_matrix_t *matrix)
{
    if (!matrix) {
        return 0;
    }
    int n = 0;
    for (int i = 0; i < matrix->count; i++) {
        if (matrix->items[i].is_business_hour) {
            n++;
        }
    }
    return n;
}

int worldtime_find_best_overlap_hour(const worldtime_city_t *base_city, int *out_count)
{
    if (!base_city) {
        if (out_count) {
            *out_count = 0;
        }
        return -1;
    }

    int best_hour = 9;
    int best_count = -1;
    for (int hour = 0; hour < 24; hour++) {
        worldtime_meeting_matrix_t matrix;
        memset(&matrix, 0, sizeof(matrix));
        worldtime_align_meeting_all(base_city, hour, 0, &matrix);
        int n = worldtime_count_business_hours(&matrix);
        if (n > best_count) {
            best_count = n;
            best_hour = hour;
        }
    }

    if (out_count) {
        *out_count = best_count < 0 ? 0 : best_count;
    }
    return best_hour;
}

int worldtime_build_meeting_matrix(const worldtime_city_t *base_city,
                                  int base_hour,
                                  int base_minute,
                                  const worldtime_city_t *cities[],
                                  int city_count,
                                  worldtime_meeting_matrix_t *out_matrix)
{
    if (!out_matrix || !base_city || !cities || city_count <= 0) {
        return 0;
    }

    if (city_count > WORLDTIME_MAX_CITIES) {
        city_count = WORLDTIME_MAX_CITIES;
    }

    out_matrix->base_city = base_city;
    out_matrix->base_hour = base_hour;
    out_matrix->base_minute = base_minute;
    out_matrix->count = city_count;

    for (int i = 0; i < city_count; i++) {
        const worldtime_city_t *tgt = cities[i];
        worldtime_matrix_item_t *item = &out_matrix->items[i];
        item->city = tgt;

        if (!tgt) {
            item->local_hour = 0;
            item->local_minute = 0;
            item->day_offset = 0;
            item->is_business_hour = false;
            item->solar_state = WORLDTIME_SOLAR_NIGHT;
            item->solar_progress = 0.0f;
            continue;
        }

        int time_diff_min = tgt->offset_min - base_city->offset_min;
        int total_min = base_hour * 60 + base_minute + time_diff_min;

        int day_offset = 0;
        while (total_min < 0) {
            total_min += 1440;
            day_offset--;
        }
        while (total_min >= 1440) {
            total_min -= 1440;
            day_offset++;
        }

        item->local_hour = total_min / 60;
        item->local_minute = total_min % 60;
        item->day_offset = day_offset;

        // 商务办公时间 (09:00 ~ 18:00)
        item->is_business_hour = (item->local_hour >= 9 && item->local_hour < 18);

        float prog = 0.0f;
        item->solar_state = worldtime_calc_solar(tgt, item->local_hour, item->local_minute, &prog);
        item->solar_progress = prog;
    }

    return city_count;
}

int worldtime_align_meeting(const worldtime_city_t *base_city,
                            int base_hour,
                            int base_minute,
                            const worldtime_city_t cities[],
                            int city_count,
                            worldtime_meeting_matrix_t *out_matrix)
{
    if (!out_matrix || !base_city || !cities || city_count <= 0) {
        return 0;
    }

    const worldtime_city_t *ptr_array[WORLDTIME_MAX_CITIES];
    int count = city_count > WORLDTIME_MAX_CITIES ? WORLDTIME_MAX_CITIES : city_count;
    for (int i = 0; i < count; i++) {
        ptr_array[i] = &cities[i];
    }
    return worldtime_build_meeting_matrix(base_city, base_hour, base_minute, ptr_array, count, out_matrix);
}

int worldtime_align_meeting_all(const worldtime_city_t *base_city,
                                int base_hour,
                                int base_minute,
                                worldtime_meeting_matrix_t *out_matrix)
{
    return worldtime_align_meeting(base_city, base_hour, base_minute, s_builtin_cities, BUILTIN_CITY_COUNT, out_matrix);
}

void worldtime_init(worldtime_companion_t *comp, int total_cities)
{
    if (!comp) return;
    comp->view_mode = WORLDTIME_VIEW_CARD;
    comp->selected_city_idx = 0;
    comp->matrix_base_hour = 9;
    comp->matrix_base_minute = 0;
    comp->total_cities = total_cities > 0 ? total_cities : worldtime_get_city_count();
    comp->current_timestamp = 0;
}

void worldtime_handle_key(worldtime_companion_t *comp, worldtime_key_t key)
{
    if (!comp || comp->total_cities <= 0) return;

    switch (key) {
    case WORLDTIME_KEY_UP:
        comp->selected_city_idx = (comp->selected_city_idx - 1 + comp->total_cities) % comp->total_cities;
        break;
    case WORLDTIME_KEY_DOWN:
        comp->selected_city_idx = (comp->selected_city_idx + 1) % comp->total_cities;
        break;
    case WORLDTIME_KEY_OK:
        comp->view_mode = (comp->view_mode == WORLDTIME_VIEW_CARD)
                              ? WORLDTIME_VIEW_MATRIX
                              : WORLDTIME_VIEW_CARD;
        break;
    default:
        break;
    }
}

void worldtime_set_timestamp(worldtime_companion_t *comp, int64_t unix_sec)
{
    if (comp) {
        comp->current_timestamp = unix_sec;
    }
}

void worldtime_set_selected_city(worldtime_companion_t *comp, int index)
{
    if (comp && comp->total_cities > 0) {
        if (index >= 0 && index < comp->total_cities) {
            comp->selected_city_idx = index;
        }
    }
}

void worldtime_set_matrix_base_time(worldtime_companion_t *comp, int hour, int minute)
{
    if (comp) {
        if (hour >= 0 && hour < 24) comp->matrix_base_hour = hour;
        if (minute >= 0 && minute < 60) comp->matrix_base_minute = minute;
    }
}

const worldtime_city_t *worldtime_get_selected_city(const worldtime_companion_t *comp)
{
    if (!comp || comp->selected_city_idx < 0 || comp->selected_city_idx >= comp->total_cities) {
        return NULL;
    }
    return worldtime_get_city(comp->selected_city_idx);
}
