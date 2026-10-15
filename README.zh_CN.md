<p align="right">
  <strong>简体中文</strong> · <a href="README.md">English</a>
</p>

#  Alex Arcade 掌机游戏中心 (Game Hub)

> 为 **FoloToy AI Passport** 打造的复古街机与治愈萌宠游戏合集！每款游戏均配备**独立专属页面**与**开机即玩**的单机体验。

![Arcade Hall](arcade/assets/hall.jpg)

---

##  游戏专页目录 (独立分享链接)

发给朋友时，可直接发送下方任意游戏的独立目录 URL。点开即见专属海报、操作指南与安装方式：

| 游戏名称 | 独立目录 / Slug | 游戏类型 | 快速链接 |
| :--- | :--- | :--- | :--- |
| [ **短腿爪爪运动会**](games/paws-sprint/README.zh_CN.md) | `paws-sprint` | 萌宠跑酷 / 竞速避障 | [ 在线体验 (待过审)](https://ai-passport.folotoy.cn/play/community-3133e9da) |
| [ **赛博信使·幻影疾跑**](games/cyber-runner/README.zh_CN.md) | `cyber-runner` | 屋脊跑酷 / 动作跳跃 | [ 查看详情](games/cyber-runner/README.zh_CN.md) |
| [ **齿轮骑兵·蒸汽过载**](games/gear-cavalry/README.zh_CN.md) | `gear-cavalry` | 蒸汽朋克 / 横版冲锋 | [ 查看详情](games/gear-cavalry/README.zh_CN.md) |
| [ **赛博消消乐**](games/neon-pop/README.zh_CN.md) | `neon-pop` | 霓虹三消 / 益智消除 | [ 查看详情](games/neon-pop/README.zh_CN.md) |
| [ **经典坦克大战 1990**](games/battle-city/README.zh_CN.md) | `battle-city` | FC 经典复刻 / 战术保卫 | [ 查看详情](games/battle-city/README.zh_CN.md) |
| [ **高桥名人的冒险岛**](games/adventure-island/README.zh_CN.md) | `adventure-island` | 横版跳跃 / 动作闯关 | [ 查看详情](games/adventure-island/README.zh_CN.md) |
| [ **魂斗罗**](games/contra/README.zh_CN.md) | `contra` | 动作射击 / 经典街机 | [ 查看详情](games/contra/README.zh_CN.md) |
| [ **雷霆赛车**](games/thunder-racer/README.zh_CN.md) | `thunder-racer` | 极速竞速 / 超车闪避 | [ 查看详情](games/thunder-racer/README.zh_CN.md) |
| [ **雷霆战机**](games/thunder-striker/README.zh_CN.md) | `thunder-striker` | 飞行射击 / 弹幕街机 | [ 查看详情](games/thunder-striker/README.zh_CN.md) |
| [🟡 **吃豆人**](games/pacman/README.zh_CN.md) | `pacman` | 经典迷宫 / 敏捷吞食 | [ 查看详情](games/pacman/README.zh_CN.md) |
| [ **像素小鸟**](games/flappy-bird/README.zh_CN.md) | `flappy-bird` | 极简单键 / 反应挑战 | [ 查看详情](games/flappy-bird/README.zh_CN.md) |
| [ **大鱼吃小鱼**](games/fish-hunter/README.zh_CN.md) | `fish-hunter` | 海底吞噬 / 生存成长 | [ 查看详情](games/fish-hunter/README.zh_CN.md) |
| [ **赛博幸运轮盘**](games/cyber-roulette/README.zh_CN.md) | `cyber-roulette` | 聚会派对 / 趣味抽签 | [ 查看详情](games/cyber-roulette/README.zh_CN.md) |
| [ **俄罗斯方块**](games/tetris/README.zh_CN.md) | `tetris` | 经典方块 / 益智下落 | [ 查看详情](games/tetris/README.zh_CN.md) |
| [ **拓麻歌子电子宠物**](games/tamagezi/README.zh_CN.md) | `tamagezi` | 虚拟宠物 / 治愈养成 | [ 查看详情](games/tamagezi/README.zh_CN.md) |
| [🪵 **ColorOS 电子木鱼**](games/coloros-muyu/README.zh_CN.md) | `coloros-muyu` | 赛博修禅 / 功德解压 | [ 查看详情](games/coloros-muyu/README.zh_CN.md) |
| [ **大白兔桌面宠物**](games/white-rabbit/README.zh_CN.md) | `white-rabbit` | 桌面萌物 / 趣味伴侣 | [ 查看详情](games/white-rabbit/README.zh_CN.md) |

---

##  全家桶固件使用方法

本分支提供了内置 **9 合 1 街机大厅启动器** 的整合版全量固件：

1. **开机直接进入 ARCADE 街机菜单**：使用 **UP** / **DOWN** 键浏览游戏卡片。
2. **短按 OK**：进入当前选中的游戏畅玩。
3. **长按 OK (1.5秒)**：在任何游戏中随时退出并安全返回街机大厅。
4. **全本地运行**：无需配置 Wi-Fi，开机插上即玩。

---

##  本地编译与刷机

```bash
# 1. 激活 ESP-IDF 5.5.3 环境
. $HOME/esp/esp-idf/export.sh

# 2. 完整构建整合版固件
./tools/validate.sh --firmware

# 3. 刷入连接的设备 (如 /dev/cu.usbmodem14101)
esptool.py --chip esp32c3 -b 460800 write_flash 0x0 build/FoloToy-AI-Passport-full.bin
```

---

##  开源许可

本项目遵循 Apache-2.0 开源协议。底层硬件驱动与官方文档详见 [docs/README.zh_CN.md](docs/README.zh_CN.md)。
