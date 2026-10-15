#!/usr/bin/env python3
"""
《果蝇光剑：神经反射》(FlySaber: 140K Synapse Reflex) 终端实时交互模拟器
按键操作：
  - [W] 或 [上箭头] / [J] : 左刀挥砍 (蓝色光剑 / R7 复眼通路)
  - [S] 或 [下箭头] / [K] : 右刀挥砍 (红色光剑 / R8 复眼通路)
  - [SPACE] 或 [ENTER]   : 双刀合击 / 蓄满100%触发【果蝇子弹时间超频】
  - [Q]                  : 退出模拟器
"""

import os
import sys
import time
import tty
import termios
import select
import random
import subprocess
import math

def play_sound(snd):
    sound_map = {
        "slash_blue": "Pop",
        "slash_red": "Tink",
        "perfect": "Glass",
        "good": "Hero",
        "miss": "Sosumi",
        "overdrive": "Ping",
        "gameover": "Basso"
    }
    name = sound_map.get(snd)
    if name:
        try:
            path = f"/System/Library/Sounds/{name}.aiff"
            if os.path.exists(path):
                subprocess.Popen(["afplay", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

class FlySaberSim:
    def __init__(self):
        self.sync_hp = 100
        self.score = 0
        self.combo = 0
        self.max_combo = 0
        self.overdrive_gauge = 0
        self.is_overdrive = False
        self.overdrive_timer = 0
        self.game_over = False

        self.slash_l = 0
        self.slash_r = 0
        self.slash_dual = 0
        self.hit_msg = ""
        self.hit_msg_timer = 0

        self.blocks = [] # list of dicts: {'lane': 0/1/2, 'type': 'BLUE'/'RED'/'DUAL'/'SPIKE', 'p': float}
        self.tick = 0
        self.spawn_timer = 0

    def spawn(self):
        pattern = [
            (0, 'BLUE'),
            (1, 'RED'),
            (0, 'BLUE'),
            (1, 'RED'),
            (2, 'DUAL'),
            (0, 'SPIKE'),
            (1, 'RED'),
            (0, 'BLUE'),
            (2, 'DUAL'),
        ]
        lane, btype = pattern[self.tick % len(pattern)]
        self.blocks.append({'lane': lane, 'type': btype, 'p': 0.0, 'sliced': False})

    def update(self):
        if self.game_over:
            return

        self.tick += 1
        if self.slash_l > 0: self.slash_l -= 1
        if self.slash_r > 0: self.slash_r -= 1
        if self.slash_dual > 0: self.slash_dual -= 1
        if self.hit_msg_timer > 0: self.hit_msg_timer -= 1

        if self.is_overdrive:
            self.overdrive_timer -= 1
            if self.overdrive_timer <= 0:
                self.is_overdrive = False

        self.spawn_timer += 1
        interval = 12 if not self.is_overdrive else 20
        if self.spawn_timer >= interval:
            self.spawn_timer = 0
            self.spawn()

        spd = 0.06 if not self.is_overdrive else 0.025
        remaining = []
        for b in self.blocks:
            b['p'] += spd
            if b['p'] > 1.1:
                if not b['sliced']:
                    if b['type'] != 'SPIKE':
                        self.combo = 0
                        self.sync_hp -= 15
                        self.hit_msg = ">> SYNAPSE MISS! << (-15% HP)"
                        self.hit_msg_timer = 8
                        play_sound("miss")
                        if self.sync_hp <= 0:
                            self.sync_hp = 0
                            self.game_over = True
                            play_sound("gameover")
                    else:
                        self.score += 20
            else:
                remaining.append(b)
        self.blocks = remaining

    def slash_left(self):
        if self.game_over: return
        self.slash_l = 4
        target = [b for b in self.blocks if b['lane'] == 0 and not b['sliced'] and abs(b['p'] - 0.85) <= 0.2]
        if target:
            b = min(target, key=lambda x: abs(x['p'] - 0.85))
            b['sliced'] = True
            self.blocks.remove(b)
            if b['type'] == 'BLUE':
                diff = abs(b['p'] - 0.85)
                if diff <= 0.09:
                    self.score += 300 if self.is_overdrive else 100
                    self.combo += 1
                    if not self.is_overdrive:
                        self.overdrive_gauge = min(100, self.overdrive_gauge + 10)
                    self.sync_hp = min(100, self.sync_hp + 5)
                    self.hit_msg = f"★ PERFECT SLICE! ★ COMBO x{self.combo}"
                    play_sound("perfect")
                else:
                    self.score += 150 if self.is_overdrive else 50
                    self.combo += 1
                    if not self.is_overdrive:
                        self.overdrive_gauge = min(100, self.overdrive_gauge + 5)
                    self.hit_msg = f"GOOD HIT! COMBO x{self.combo}"
                    play_sound("good")
                self.hit_msg_timer = 8
            elif b['type'] == 'SPIKE':
                self.sync_hp -= 20
                self.combo = 0
                self.hit_msg = "!! HAZARD SPIKE HIT !! (-20% HP)"
                self.hit_msg_timer = 8
                play_sound("miss")
            else:
                self.sync_hp -= 10
                self.combo = 0
                self.hit_msg = "WRONG COLOR! R7/R8 MISMATCH"
                self.hit_msg_timer = 8
                play_sound("miss")
        else:
            play_sound("slash_blue")

    def slash_right(self):
        if self.game_over: return
        self.slash_r = 4
        target = [b for b in self.blocks if b['lane'] == 1 and not b['sliced'] and abs(b['p'] - 0.85) <= 0.2]
        if target:
            b = min(target, key=lambda x: abs(x['p'] - 0.85))
            b['sliced'] = True
            self.blocks.remove(b)
            if b['type'] == 'RED':
                diff = abs(b['p'] - 0.85)
                if diff <= 0.09:
                    self.score += 300 if self.is_overdrive else 100
                    self.combo += 1
                    if not self.is_overdrive:
                        self.overdrive_gauge = min(100, self.overdrive_gauge + 10)
                    self.sync_hp = min(100, self.sync_hp + 5)
                    self.hit_msg = f"★ PERFECT SLICE! ★ COMBO x{self.combo}"
                    play_sound("perfect")
                else:
                    self.score += 150 if self.is_overdrive else 50
                    self.combo += 1
                    if not self.is_overdrive:
                        self.overdrive_gauge = min(100, self.overdrive_gauge + 5)
                    self.hit_msg = f"GOOD HIT! COMBO x{self.combo}"
                    play_sound("good")
                self.hit_msg_timer = 8
            elif b['type'] == 'SPIKE':
                self.sync_hp -= 20
                self.combo = 0
                self.hit_msg = "!! HAZARD SPIKE HIT !! (-20% HP)"
                self.hit_msg_timer = 8
                play_sound("miss")
            else:
                self.sync_hp -= 10
                self.combo = 0
                self.hit_msg = "WRONG COLOR! R7/R8 MISMATCH"
                self.hit_msg_timer = 8
                play_sound("miss")
        else:
            play_sound("slash_red")

    def slash_dual(self):
        if self.game_over:
            self.__init__()
            return

        self.slash_dual = 5
        self.slash_l = 5
        self.slash_r = 5

        if self.overdrive_gauge >= 100:
            self.is_overdrive = True
            self.overdrive_timer = 50
            self.overdrive_gauge = 0
            self.hit_msg = ">>> 30ms NEURO OVERDRIVE (BULLET TIME 3x)! <<<"
            self.hit_msg_timer = 15
            play_sound("overdrive")
            for b in list(self.blocks):
                if b['type'] != 'SPIKE':
                    b['sliced'] = True
                    self.blocks.remove(b)
                    self.score += 300
                    self.combo += 1
            return

        # 检查中轨双色核心或双路判定
        target = [b for b in self.blocks if b['lane'] == 2 and not b['sliced'] and abs(b['p'] - 0.85) <= 0.2]
        if target:
            b = min(target, key=lambda x: abs(x['p'] - 0.85))
            b['sliced'] = True
            self.blocks.remove(b)
            self.score += 250
            self.combo += 1
            self.overdrive_gauge = min(100, self.overdrive_gauge + 15)
            self.hit_msg = f"◆ DUAL CORE SPLIT! ◆ COMBO x{self.combo}"
            self.hit_msg_timer = 8
            play_sound("perfect")
        else:
            play_sound("slash_blue")

    def render(self):
        lines = []
        # Header
        mode_str = "\033[1;33m[★ NEURO OVERDRIVE 3x ★]\033[0m" if self.is_overdrive else "\033[1;36m[SYNAPTIC HIGHWAY]\033[0m"
        lines.append(f"{mode_str}  SCORE: \033[1;37m{self.score:05d}\033[0m  SYNC: \033[1;32m{self.sync_hp}%\033[0m  AP: \033[1;35m{self.overdrive_gauge}%\033[0m")
        lines.append("=" * 54)

        # 3D 隧道视角 (15 行)
        tunnel_h = 14
        vp_col = 27
        strike_row = 11

        grid = [[" " for _ in range(54)] for _ in range(tunnel_h)]

        # 绘制轨道
        for r in range(tunnel_h):
            p = r / (tunnel_h - 1)
            lx = int(vp_col - p * 16)
            rx = int(vp_col + p * 16)
            cx = vp_col
            if 0 <= lx < 54: grid[r][lx] = "\033[34m|\033[0m"
            if 0 <= rx < 54: grid[r][rx] = "\033[31m|\033[0m"
            if 0 <= cx < 54: grid[r][cx] = "\033[35m:\033[0m"

        # 绘制判定线
        for c in range(8, 46):
            if grid[strike_row][c] == " ":
                grid[strike_row][c] = "\033[2m-\033[0m"
        grid[strike_row][int(vp_col - 0.85 * 16)] = "\033[1;36m[U]\033[0m"
        grid[strike_row][int(vp_col + 0.85 * 16)] = "\033[1;31m[D]\033[0m"
        grid[strike_row][vp_col] = "\033[1;33m[K]\033[0m"

        # 绘制方块
        for b in self.blocks:
            if b['sliced']: continue
            r = int(b['p'] * (tunnel_h - 1))
            if 0 <= r < tunnel_h:
                p = b['p']
                if b['lane'] == 0:
                    c = int(vp_col - p * 16)
                    token = "\033[1;44;37m■>\033[0m" if b['type'] == 'BLUE' else "\033[1;43;30m▲!\033[0m"
                elif b['lane'] == 1:
                    c = int(vp_col + p * 16)
                    token = "\033[1;41;37m<■\033[0m" if b['type'] == 'RED' else "\033[1;43;30m!▲\033[0m"
                else:
                    c = vp_col
                    token = "\033[1;45;33m◆◆\033[0m"
                if 0 <= c < 53:
                    grid[r][c] = token

        for r in range(tunnel_h):
            lines.append("".join(grid[r]))

        lines.append("-" * 54)

        # 机械果蝇机甲与刀光渲染
        l_blade = "\033[1;36m/===★\033[0m" if self.slash_l > 0 else "\033[36m/--\033[0m"
        r_blade = "\033[1;31m★===\\\033[0m" if self.slash_r > 0 else "\033[31m--\\\033[0m"
        dual_fx = "\033[1;33m  >> [ DUAL CROSS SLASH ] <<  \033[0m" if self.slash_dual > 0 else ""

        fly_head = "\033[1;36m(o\033[1;37m_FLY_140K_\033[1;31mo)\033[0m"
        lines.append(f"     {l_blade}   {fly_head}   {r_blade}")
        lines.append(f"            [~WINGS~]  {dual_fx}")

        # 反馈消息
        if self.hit_msg_timer > 0:
            lines.append(f"\033[1;33m  >>> {self.hit_msg} <<<\033[0m")
        else:
            lines.append("  [W/UP/J]: 左蓝光剑(R7) | [S/DOWN/K]: 右红光剑(R8) | [SPACE]: 双刀/超频")

        if self.game_over:
            lines.append("\033[1;41;37m       140K 突触神经连接断开! 按 [SPACE] 重新启动       \033[0m")

        # 打印到终端 (清屏刷新)
        sys.stdout.write("\033[H\033[J" + "\n".join(lines) + "\n")
        sys.stdout.flush()

def run_sim():
    game = FlySaberSim()
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    try:
        tty.setcbreak(fd)
        while True:
            # 检查按键
            rlist, _, _ = select.select([sys.stdin], [], [], 0.04)
            if rlist:
                ch = sys.stdin.read(1)
                if ch in ['q', 'Q', '\x03']:
                    break
                elif ch in ['w', 'W', 'j', 'J', 'a', 'A']:
                    game.slash_left()
                elif ch in ['s', 'S', 'k', 'K', 'd', 'D']:
                    game.slash_right()
                elif ch in [' ', '\r', '\n']:
                    game.slash_dual()
                elif ch == '\x1b': # 箭头键
                    seq = sys.stdin.read(2)
                    if seq == '[A': # UP
                        game.slash_left()
                    elif seq == '[B': # DOWN
                        game.slash_right()

            game.update()
            game.render()
            time.sleep(0.035)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        print("\n[FlySaber Simulator Exited]\n")

if __name__ == '__main__':
    run_sim()
