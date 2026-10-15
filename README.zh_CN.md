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

## 掌机按键交互机制

固件内置了街机大厅启动器与统一按键响应：

1. **浏览与移动**：在主菜单使用 **UP** / **DOWN** 键上下切换游戏卡片。
2. **进入游戏**：短按 **OK** 键进入当前选中的游戏。
3. **安全返回**：在任何游戏进行中，**长按 OK 键（1.5 秒）** 随时退出并安全退回街机大厅。
4. **全本地运行**：无需配置 Wi-Fi，开机插上即玩。

---

## 硬件固件获取与刷机指南（免配本机环境）

本项目采用 **Web 模拟器与硬件原生 C 驱动双端同构设计**：
- **Web 端**（`arcade/` 与 `simulator/`）：纯 HTML5/Canvas 模拟器，在浏览器里随时调试体验。
- **固件端**（`main/` 与 `components/bsp/`）：纯 C 语言原生驱动与逻辑，编译后刷入 ESP32-C3 掌机。

### 方式一：云端全自动构建获取（推荐，本机零配置）

你的电脑**完全不需要安装任何 ESP-IDF 或 Python 开发环境**，通过 GitHub 自动化即可直接获得固件：

1. **直接从 Release 下载**：
   前往仓库 [Releases 页面](https://github.com/alexlifexyz/alex-arcade/releases)，下载最新发布的 `FoloToy-AI-Passport-full.bin` 固件。
2. **从 GitHub Actions 构件下载**：
   进入仓库的 [Actions 页面](https://github.com/alexlifexyz/alex-arcade/actions/workflows/build-firmware.yml)，找到最新一次 `Build firmware` 的运行记录，在页面底部的 **Artifacts** 区域即可直接下载固件压缩包（如 `passport-main.zip`）。

### 方式二：网页端在线一键刷机（无需命令行）

使用 Chrome 或 Edge 浏览器即可直接完成烧录：

1. 使用 USB-C 数据线将 AI Passport 掌机连接到电脑；
2. 打开乐鑫官方在线刷机网页：[ESP Web Flasher (esptool-js)](https://espressif.github.io/esptool-js/)；
3. 点击 **Connect** 按钮，在弹出的系统串口列表中选择设备（通常带有 `usbmodem` 或 `CP210x`）；
4. 在烧录文件列表中添加下载解压出来的 `FoloToy-AI-Passport-full.bin`，烧录地址填写 **`0x0`**；
5. 点击 **Program** 开始刷机，进度条走完后重启掌机即可。

### 方式三：开发者本地编译与命令行烧录

如果你在本机安装了 ESP-IDF 5.5.3，也可以在本地调试并编译：

```bash
# 1. 激活 ESP-IDF 5.5.3 环境
source $HOME/esp/esp-idf/export.sh

# 2. 编译并校验固件
./tools/validate.sh --firmware

# 3. 烧录到设备 (例如 /dev/cu.usbmodem14101)
idf.py -p /dev/cu.usbmodem14101 flash monitor
```

---

## 重要：硬件保护区避坑提醒

- **严禁全盘擦除**：切勿使用 `esptool.py erase_flash`，掌机出厂时在 Flash 地址 **`0x356000`** 存放了设备的唯一激活凭证（`cardid`），擦除后将丢失出厂卡密。
- **推荐刷机方式**：日常使用建议仅写入 App 分区或使用通过校验的安全整合固件包。

---

## 开源许可

本项目遵循 Apache-2.0 开源协议。底层硬件驱动详见 [components/bsp/](components/bsp/)。
