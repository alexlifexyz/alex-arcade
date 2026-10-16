<p align="right">
  <strong>简体中文</strong> · <a href="new-game-guide.md">English</a>
</p>

# 新增一个游戏

本文是从一个想法走到「掌机上能玩、浏览器里也能玩」的可重复路径，同时也写清了
怎么和小朋友一起走这条路——在这个仓库里，这是一等公民式的使用方式，不是附带说明。

通用的 AI 开发工作流见 [`ai-guide.zh_CN.md`](ai-guide.zh_CN.md)，硬件事实见
[`../hardware-design/AI_HARDWARE_DEVELOPMENT_GUIDE.zh_CN.md`](../hardware-design/AI_HARDWARE_DEVELOPMENT_GUIDE.zh_CN.md)。
本文只讲做游戏这件事。

## 两层法则

仓库里每个游戏都拆成两层，正是这个拆法让游戏可测试、可移植、可以放心反复改：

| 层 | 文件 | 可以用 | 绝对不许 |
| --- | --- | --- | --- |
| 模型层 | `main/<game>_logic.c` / `.h` | C11、`<math.h>`、固定大小数组 | 碰 LVGL、碰 ESP-IDF、调 `malloc`、自己去读时钟 |
| 渲染层 | `main/demo_<game>.c` | LVGL、BSP 音频、模型层的公开 API | 自己存游戏状态、在按键回调里阻塞 |

模型只在渲染层把时间增量交给它时才推进，并且只对外暴露朴素数据供渲染层读取。
正因为如此，30 个主机测试套件可以在一台不接硬件的电脑上跑完，同一套模型也能被
浏览器端驱动。

## 一个游戏会碰到的文件

```text
main/<game>_logic.h       可调数字、状态结构体、公开 API
main/<game>_logic.c       模型层：纯逻辑、确定性、零分配
main/demo_<game>.c        LVGL 页面：绘制、按键映射、退出清理
main/demo.h               页面的三个函数声明
main/CMakeLists.txt       两个新 .c 加进 SRCS
main/game_catalog.c       加一行：id、显示名、分类
main/game_registry.c      同一个下标加一行：enter / exit / key
tests/test_<game>_logic.c 主机测试，门禁会自动发现
simulator/catalog.js      浏览器机柜条目
docs/CHANGELOG.md         一行，因为这是用户可见的变化
```

`tools/validate.sh` 按约定把 `tests/test_<name>.c` 和 `main/<name>.c` 配对，
所以两个文件一出现，新测试就自动进门禁，验证脚本不需要改。

## 流程

### 0. 先写游戏卡

写代码之前先写一张短卡片。卡片就是契约，也是把这件事讲给小朋友或者评审听的东西。

```text
名字：     叫什么
一句话：   玩家到底在干什么，一句话说完
操作：     UP / DOWN / OK 各自干什么，写死
怎么赢：   分数靠什么涨
怎么输：   一局怎么结束，以及到底罚不罚
三个旋钮： 预计要调的三个数字（速度、数量、奖励）
```

三个按键是硬约束。如果卡片需要第四个动作，那就改想法，不是改硬件。

### 1. 复制模板

[`main/game_template_logic.h`](../../main/game_template_logic.h) 和
[`main/game_template_logic.c`](../../main/game_template_logic.c) 是一个完整可玩的
「接水果」模型：三条轨道、一个篮子、掉落的水果、炸弹、心数、等级、带种子的随机数、
固定对象池。模板不进固件菜单，但有
[`tests/test_game_template_logic.c`](../../tests/test_game_template_logic.c) 覆盖，
所以它永远可编译、行为正确，不会烂掉。

把三个文件整套复制，把 `tpl_` 前缀改名，骨架保持不变：头文件顶部一块可调数字、
一个上下文结构体、给测试用的 `_ctx` API、给渲染层用的默认实例 API。

### 2. 先让模型是对的，再让它好看

测试和模型一起写，不要事后补。模板的测试就是范本：直接驱动状态机，手工摆放实体来
做确定性断言，把无聊的情况全覆盖——开局、边界夹紧、计分、失败、游戏结束、最高分
跨局保留、同种子复现同一局、空指针保护。

```bash
cc -std=c11 -Wall -Wextra -Werror -Imain \
  tests/test_mygame_logic.c main/mygame_logic.c -lm -o /tmp/t && /tmp/t
```

测试本身也要待在 ISO C 里，不只是模型。`M_PI` 这类宏不属于 ISO C：Apple libc 在
`-std=c11` 下声明它，glibc 不声明，所以用了它的测试在 Mac 上能过、到 CI 就挂。
照模型层的写法加 `#ifndef M_PI` 守卫。在 macOS 上用 `-D_ANSI_SOURCE` 能复现更严格的
头文件行为，推之前就能抓到这一类问题（它同时会隐藏 `snprintf` 这类 C99 函数，
所以只把宏相关的报错当真）：

```bash
cc -std=c11 -D_ANSI_SOURCE -Wall -Wextra -Werror -Imain \
  tests/test_mygame_logic.c main/mygame_logic.c -lm -o /tmp/t
```

### 3. 再写渲染层

就近抄一个现成页面：`main/demo_match3.c` 是紧凑的网格页，`main/demo_flappy.c` 是
紧凑的横版页，`main/demo_battlecity.c` 是较大的那种。设备强制的规矩：

- 用即时模式矢量绘制，不要每帧分配内存。
- 按键回调不许阻塞：翻译完按键就返回。
- 从 LVGL 任务之外访问 LVGL 对象，必须持 `bsp_lvgl_lock()`。
- 退出时，在删除屏幕**之前**，停掉所有可能碰到 UI 的任务、定时器和回调。
- 读模型的一次性事件计数器来放音效和粒子，读完清零。

### 4. 接进菜单

两个源文件加进 `main/CMakeLists.txt`，三个页面函数声明进 `main/demo.h`。
然后在 `main/game_catalog.c` 加一行——id（和浏览器机柜用同一个 id）、显示名
（不超过 `GAME_NAME_MAX_CHARS`，主机测试会盯着这条）、分类——再在
`main/game_registry.c` 的同一个下标加一行 `enter` / `exit` / `key`。目录表按
分类分组，因为菜单里长按 OK 要跳到下一个分类，新行要放进它所属分类那一段里。

`main/main.c` 只管菜单行为，不再持有游戏列表，所以那边没有要改的。

### 5. 加浏览器机柜

在 [`simulator/catalog.js`](../../simulator/catalog.js) 里加一条，带上一句话卖点、
操作说明、三个任务、评级分数线。浏览器街机是在刷机之前让人先玩到这个想法的最快
路径。

### 6. 跑门禁

```bash
./tools/validate.sh --static
```

门禁的固件那一半需要激活好的 ESP-IDF 5.5.3 环境。本机没有的话，把分支推上去让
固件 workflow 构建，然后按 [`AGENTS.zh_CN.md`](../../AGENTS.zh_CN.md) 的要求，
把构建结果和设备验证分开报告。

## 和小朋友一起创作

这个仓库适合七八岁的小伙伴一起玩，因为模型层就是一堆起了名字的数字在做算术，
而浏览器街机几秒钟就能给出结果。下面这套结构，是让一次创作变得好玩而不是憋气的
关键。

**他的活和你的活。** 小朋友拥有游戏卡、三个旋钮，以及最终判决（「太快了」
「太无聊了」「这个炸弹好坏」）。你拥有代码、测试和门禁。会「大声报错」的部分不要
交给他；把答错了也依然有意思的部分交给他。

**一次只调一个旋钮。** 每个游戏头文件开头都有一块用大白话写的可调数字。一次只改
一个，重跑，玩，下判断。一次改两个什么也学不到，因为结果归因不了。

**把挫败感压到零。** 仓库本来就偏这个方向，小朋友的游戏要更偏：漏掉东西不罚，
只有真的犯错才扣心，一局要短，重开只要一个键，分数永远不往下掉。模板是照这几条
刻意写的。

**每次都要做完一件事。** 以一个「能玩的变化」收尾的一次创作，比以「架构更好了」
收尾的一次更值钱。每次锁定其中一个目标：一个手感更好的数值、一种新的拾取物、
一个新音效、一种新颜色，或者浏览器机柜里一个新任务。

**让他起名字。** 名字、吉祥物、三个任务，是小朋友会记住并且拿去给别人看的部分。
changelog 那一行里写上他的名字。

## 检查清单

- [ ] 游戏卡写了，而且三个键够用
- [ ] 模型层没有 LVGL、没有 ESP-IDF、没有分配、没有自己的时钟
- [ ] 主机测试覆盖开局、边界、计分、结束、复现、空指针
- [ ] 渲染层在删屏幕前停掉了所有任务和定时器
- [ ] 两个源文件进了 `main/CMakeLists.txt`，`main/game_catalog.c` 和
      `main/game_registry.c` 在同一个下标各加了一行
- [ ] 浏览器机柜条目加了
- [ ] `./tools/validate.sh --static` 通过
- [ ] `docs/CHANGELOG.md` 加了一行
