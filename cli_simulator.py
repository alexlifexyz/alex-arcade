#!/usr/bin/env python3
"""
《恶魔轮盘赌：赛博对决》终端交互式试玩模拟器
直接在当前终端以文本控制台模式试玩。
"""

import os
import sys
import time
import random
import subprocess

def play_sound(sound):
    try:
        path = f"/System/Library/Sounds/{sound}.aiff"
        if os.path.exists(path):
            subprocess.Popen(["afplay", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

class CyberRouletteTerminal:
    def __init__(self):
        self.player_max_hp = 4
        self.player_hp = 4
        self.dealer_max_hp = 4
        self.dealer_hp = 4
        self.round_num = 1
        self.player_items = ["GLASS", "BEER", "SAW"]
        self.dealer_items = ["CIG", "CUFF"]
        self.is_sawed = False
        self.dealer_cuffed = False
        self.player_cuffed = False
        self.peeked_shell = None
        self.load_chamber()

    def load_chamber(self):
        play_sound("Blow")
        live = 1 + (1 if self.round_num > 1 else 0) + random.randint(0, 1)
        blank = 2 + (1 if self.round_num > 2 else 0)
        self.chamber = ["LIVE"] * live + ["BLANK"] * blank
        random.shuffle(self.chamber)
        self.live_count = live
        self.blank_count = blank
        self.is_sawed = False
        self.peeked_shell = None

        all_items = ["BEER", "GLASS", "SAW", "CIG", "CUFF"]
        while len(self.player_items) < 4 and random.random() < 0.7:
            self.player_items.append(random.choice(all_items))
        while len(self.dealer_items) < 4 and random.random() < 0.7:
            self.dealer_items.append(random.choice(all_items))

    def render(self, msg=""):
        os.system("clear")
        print("\033[1;31m" + "=" * 48)
        print("     CYBER BUCKSHOT ROULETTE (AI PASSPORT SIM)")
        print("=" * 48 + "\033[0m")
        print(f"\033[1;36m【ROUND {self.round_num}】\033[0m  弹仓状态: \033[1;31m🔴 实弹: {self.live_count}\033[0m | \033[1;34m⚪ 空包弹: {self.blank_count}\033[0m")
        print("-" * 48)

        # 恶魔
        d_hp = "♥ " * self.dealer_hp + "♡ " * (self.dealer_max_hp - self.dealer_hp)
        print(f"\033[1;31m[恶魔 DEMON]\033[0m HP: {d_hp} ({self.dealer_hp}/{self.dealer_max_hp})")
        print(f"  恶魔道具: {', '.join(f'[{i}]' for i in self.dealer_items) or '空'}")
        print("-" * 48)

        # 枪支
        gun = "== 12-GAUGE SHOTGUN ==" if not self.is_sawed else ">> SHOTGUN (已锯短: 双倍伤害!) <<"
        color = "\033[1;33m" if self.is_sawed else "\033[1;37m"
        print(f"  武器: {color}{gun}\033[0m")
        if msg:
            print(f"\033[1;32m  >>> {msg}\033[0m")
        print("-" * 48)

        # 玩家
        p_hp = "♥ " * self.player_hp + "♡ " * (self.player_max_hp - self.player_hp)
        print(f"\033[1;32m[玩家 YOU]\033[0m   HP: {p_hp} ({self.player_hp}/{self.player_max_hp})")
        print(f"  你的道具: {', '.join(f'[{idx+1}:{i}]' for idx, i in enumerate(self.player_items)) or '空'}")
        print("=" * 48)

    def use_item(self, idx, is_player):
        items = self.player_items if is_player else self.dealer_items
        if idx < 0 or idx >= len(items): return ""
        it = items.pop(idx)
        play_sound("Pop")

        if it == "BEER":
            if self.chamber:
                s = self.chamber.pop(0)
                if s == "LIVE": self.live_count -= 1
                else: self.blank_count -= 1
                return f"退膛弹出: {'🔴 实弹!' if s == 'LIVE' else '⚪ 空包弹!'}"
        elif it == "GLASS":
            if self.chamber:
                self.peeked_shell = self.chamber[0]
                return f"放大镜偷看: 下一发是 {'🔴 实弹!' if self.peeked_shell == 'LIVE' else '⚪ 空包弹!'}"
        elif it == "SAW":
            self.is_sawed = True
            return "手锯切割枪管! 下发命中造成 2 点暴击伤害!"
        elif it == "CIG":
            if is_player:
                if self.player_hp < self.player_max_hp: self.player_hp += 1
            else:
                if self.dealer_hp < self.dealer_max_hp: self.dealer_hp += 1
            return "抽了一口香烟，平静了下来。(+1 HP)"
        elif it == "CUFF":
            if is_player: self.dealer_cuffed = True
            else: self.player_cuffed = True
            return "手铐锁住了对方! 跳过其下一个行动回合!"
        return ""

    def fire(self, target, is_player):
        if not self.chamber:
            self.round_num += 1
            self.load_chamber()
            return True, "弹仓打空，重新装填弹药！"

        shell = self.chamber.pop(0)
        is_live = (shell == "LIVE")
        if is_live: self.live_count -= 1
        else: self.blank_count -= 1

        dmg = 2 if self.is_sawed else 1
        self.is_sawed = False
        self.peeked_shell = None

        if is_live:
            play_sound("Sosumi")
            if is_player:
                if target == "SELF":
                    self.player_hp -= dmg
                    return False, f"砰！！实弹爆膛！你轰中了自己 (-{dmg} HP)"
                else:
                    self.dealer_hp -= dmg
                    return False, f"轰！！实弹命中恶魔面门！(-{dmg} HP)"
            else:
                if target == "SELF":
                    self.dealer_hp -= dmg
                    return False, f"恶魔开枪打自己——轰！实弹重创了它 (-{dmg} HP)"
                else:
                    self.player_hp -= dmg
                    return False, f"恶魔朝你开枪——砰！实弹击中了你 (-{dmg} HP)"
        else:
            play_sound("Tink")
            if target == "SELF":
                return True, "咔哒！空包弹！你的豪赌成功——【额外回合】！"
            else:
                return False, "咔哒…空包弹，一记空响，轮到下一回合。"

    def dealer_turn(self):
        self.render("恶魔回合：恶魔正在审视手牌与概率...")
        time.sleep(1.2)

        # 恶魔用道具
        for idx in range(len(self.dealer_items)):
            it = self.dealer_items[idx]
            if it == "CIG" and self.dealer_hp < self.dealer_max_hp:
                msg = self.use_item(idx, False)
                self.render(f"恶魔使用道具: {msg}")
                time.sleep(1.2)
                break
            elif it == "CUFF" and not self.player_cuffed:
                msg = self.use_item(idx, False)
                self.render(f"恶魔使用道具: {msg}")
                time.sleep(1.2)
                break
            elif it == "GLASS" and not self.peeked_shell and len(self.chamber) > 1:
                msg = self.use_item(idx, False)
                self.render(f"恶魔使用道具: {msg}")
                time.sleep(1.2)
                break
            elif it == "SAW" and not self.is_sawed and self.peeked_shell == "LIVE":
                msg = self.use_item(idx, False)
                self.render(f"恶魔使用道具: {msg}")
                time.sleep(1.2)
                break

        # 恶魔抉择
        if self.peeked_shell:
            target = "OPPONENT" if self.peeked_shell == "LIVE" else "SELF"
        else:
            live_prob = self.live_count / max(len(self.chamber), 1)
            target = "SELF" if live_prob <= 0.35 else "OPPONENT"

        cont, res = self.fire(target, False)
        self.render(f"恶魔行动: {res}")
        time.sleep(1.5)

        if not self.chamber:
            self.round_num += 1
            self.load_chamber()
            self.render("当前弹仓打空，装填新轮次！")
            time.sleep(1.2)
            return

        if cont and self.dealer_hp > 0 and self.player_hp > 0:
            self.dealer_turn()

def main():
    game = CyberRouletteTerminal()
    msg = "欢迎来到恶魔轮盘赌！按数字选择操作。"

    while True:
        game.render(msg)
        msg = ""

        if game.player_hp <= 0:
            play_sound("Basso")
            print("\n\033[1;31m💀 你已阵亡！恶魔收割了你的灵魂。GAME OVER\033[0m")
            break
        if game.dealer_hp <= 0:
            play_sound("Glass")
            print("\n\033[1;32m🏆 恶魔轰然倒地！你赢下了这场生死豪赌！VICTORY\033[0m")
            break

        print("\n请选择你的行动：")
        print("  [1] 对自己开火 (若是空包弹则获得连击)")
        print("  [2] 对恶魔开火 (实弹造成伤害)")
        if game.player_items:
            print("  [3] 使用道具 (1-4 号槽位)")
        print("  [Q] 退出试玩")

        choice = input("\n> 请输入指令: ").strip().lower()
        if choice == "q":
            print("退出试玩。")
            break
        elif choice == "1":
            cont, res = game.fire("SELF", True)
            msg = res
            if not cont and game.player_hp > 0 and game.dealer_hp > 0:
                if game.dealer_cuffed:
                    game.dealer_cuffed = False
                    msg += " (恶魔被手铐锁住，依然是你的回合！)"
                else:
                    game.render(msg)
                    time.sleep(1.0)
                    game.dealer_turn()
        elif choice == "2":
            cont, res = game.fire("OPPONENT", True)
            msg = res
            if game.player_hp > 0 and game.dealer_hp > 0:
                if game.dealer_cuffed:
                    game.dealer_cuffed = False
                    msg += " (恶魔被手铐锁住，依然是你的回合！)"
                else:
                    game.render(msg)
                    time.sleep(1.0)
                    game.dealer_turn()
        elif choice == "3" and game.player_items:
            print("\n你的道具:")
            for i, it in enumerate(game.player_items):
                print(f"  [{i+1}] {it}")
            idx = input("请选择要使用的道具编号 (或按 Enter 取消): ").strip()
            if idx.isdigit() and 1 <= int(idx) <= len(game.player_items):
                desc = game.use_item(int(idx) - 1, True)
                msg = f"使用了道具: {desc}"
        else:
            msg = "无效输入，请重试。"

if __name__ == "__main__":
    main()
