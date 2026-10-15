// main/demo.h —— 每个演示页实现的统一接口。
// 新增一个演示页 = 实现这三个函数 + 在 main.c 的 DEMOS[] 里加一行。
#pragma once

#include "bsp_button.h"

typedef struct {
    const char *name;
    void (*enter)(void);                          // 建自己的屏并载入
    void (*exit)(void);                           // 删屏、停定时器、释放资源
    void (*key)(bsp_btn_t btn, bsp_btn_ev_t ev);  // 收按键(长按确定已被 main 拦截)
} demo_entry_t;

// 各演示页(定义在各自的 .c 里)
void demo_display_enter(void); void demo_display_exit(void);
void demo_display_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_button_enter(void);  void demo_button_exit(void);
void demo_button_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_audio_enter(void);   void demo_audio_exit(void);
void demo_audio_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_battery_enter(void); void demo_battery_exit(void);
void demo_battery_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_wifi_enter(void);    void demo_wifi_exit(void);
void demo_wifi_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_ble_enter(void);     void demo_ble_exit(void);
void demo_ble_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_low_power_enter(void); void demo_low_power_exit(void);
void demo_low_power_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_thunder_enter(void); void demo_thunder_exit(void);
void demo_thunder_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_thunderracer_enter(void); void demo_thunderracer_exit(void);
void demo_thunderracer_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_adventure_enter(void); void demo_adventure_exit(void);
void demo_adventure_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_contra_enter(void); void demo_contra_exit(void);
void demo_contra_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_battlecity_enter(void); void demo_battlecity_exit(void);
void demo_battlecity_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_flappy_enter(void); void demo_flappy_exit(void);
void demo_flappy_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_fish_enter(void); void demo_fish_exit(void);
void demo_fish_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_pacman_enter(void); void demo_pacman_exit(void);
void demo_pacman_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_match3_enter(void); void demo_match3_exit(void);
void demo_match3_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_geartrooper_enter(void); void demo_geartrooper_exit(void);
void demo_geartrooper_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_cyber_runner_enter(void); void demo_cyber_runner_exit(void);
void demo_cyber_runner_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_pawssprint_enter(void); void demo_pawssprint_exit(void);
void demo_pawssprint_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_wave_enter(void); void demo_wave_exit(void);
void demo_wave_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_wind_enter(void); void demo_wind_exit(void);
void demo_wind_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void bsp_demo_return_to_menu(void);


