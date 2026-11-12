#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 tools/ 下所有能打开的掌机 / 街机工程同步成 shared/web/games.js。

判据：目录下同时有 index.html 与 assets/core.js（即网页播放器能同源载入内核）。
非游戏小工具（smash、盲停、工时换算器、2048 等）与半成品工程会自动排除。

用法：
  python3 shared/web/sync_games.py            # 重新扫描并生成 games.js
  python3 shared/web/sync_games.py --check    # 只校验一致性，不写文件
"""
import json
import os
import re
import sys

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TOOLS = os.path.join(BASE, "tools")
OUT = os.path.join(BASE, "shared", "web", "games.js")


def platform_of(tool_id):
    if tool_id.endswith("-cps1") or tool_id.startswith("klkd"):
        return "CPS1 街机"
    if tool_id.endswith("-ngpc"):
        return "NGPC"
    if tool_id.endswith("-gba"):
        return "GBA"
    if tool_id.endswith("-gbc"):
        return "GBC"
    if tool_id.endswith("-gb"):
        return "GB"
    if tool_id.endswith("-nes"):
        return "FC/NES"
    if tool_id.endswith("-sfc"):
        return "SFC"
    return "经典游戏"


def category_of(tool_id, platform):
    if "街机" in platform or tool_id.startswith("klkd"):
        return "arcade"
    if platform in ("GBA", "GBC", "GB", "NGPC"):
        return "handheld"
    return "console"


def read_title(tool_dir, tool_id):
    cfg = os.path.join(tool_dir, "assets", "config.js")
    if os.path.exists(cfg):
        with open(cfg, encoding="utf-8", errors="ignore") as f:
            text = f.read()
        for key in ("gameName", "title"):
            m = re.search(key + r"\s*:\s*['\"]([^'\"]+)['\"]", text)
            if m:
                return m.group(1).strip()
    with open(os.path.join(tool_dir, "index.html"), encoding="utf-8", errors="ignore") as f:
        text = f.read()
    m = re.search(r"<title>([^<]+)</title>", text)
    if m:
        return m.group(1).strip()
    return tool_id


def scan():
    games = []
    for tool_id in sorted(os.listdir(TOOLS)):
        tool_dir = os.path.join(TOOLS, tool_id)
        if not os.path.isdir(tool_dir):
            continue
        if not (os.path.exists(os.path.join(tool_dir, "index.html"))
                and os.path.exists(os.path.join(tool_dir, "assets", "core.js"))):
            continue
        platform = platform_of(tool_id)
        title = read_title(tool_dir, tool_id)
        games.append({
            "id": tool_id,
            "title": title,
            "platform": platform,
            "category": category_of(tool_id, platform),
            "desc": title + " · " + platform,
        })
    return games


def render(games):
    return (
        "// shared/web/games.js\n"
        "// 网页播放器游戏清单：由 shared/web/sync_games.py 扫描 tools/ 自动生成，请勿手工编辑。\n"
        "// 判据：tools/<id>/ 同时有 index.html 与 assets/core.js；新增或删除工程后重新运行同步脚本。\n"
        "// 共 %d 款。\n" % len(games)
    ) + "window.WEB_GAMES = " + json.dumps(games, ensure_ascii=False, indent=2) + ";\n"


def main():
    games = scan()
    assert len(games) >= 90, "扫描结果异常偏少，只有 %d 款" % len(games)
    content = render(games)
    if "--check" in sys.argv:
        with open(OUT, encoding="utf-8") as f:
            same = f.read() == content
        print("games.js 与 tools/ 一致（%d 款）" % len(games) if same
              else "games.js 已过期，请重新运行 sync_games.py")
        return 0 if same else 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)
    print("已同步 %d 款可玩游戏到 shared/web/games.js" % len(games))
    return 0


if __name__ == "__main__":
    sys.exit(main())
