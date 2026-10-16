// main/demo.h —— 每个演示页实现的统一接口。
// 新增一个演示页 = 实现这三个函数 + 在 main/game_catalog.c 和
// main/game_registry.c 各加一行;菜单表不在 main.c 里了。
#pragma once

#include "bsp_button.h"

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

void demo_roulette_enter(void); void demo_roulette_exit(void);
void demo_roulette_key(bsp_btn_t btn, bsp_btn_ev_t ev);

// flysaber / flydriver 的声明留着，但这两个 .c 暂时不在 main/CMakeLists.txt 里:
// 两个页面各有一块 120000 字节的静态画布，一起放不进 DRAM。原因见
// main/game_catalog.c 的注释。
void demo_flysaber_enter(void); void demo_flysaber_exit(void);
void demo_flysaber_key(bsp_btn_t btn, bsp_btn_ev_t ev);

void demo_flydriver_enter(void); void demo_flydriver_exit(void);
void demo_flydriver_key(bsp_btn_t btn, bsp_btn_ev_t ev);

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


