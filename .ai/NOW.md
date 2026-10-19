# alex-arcade NOW

更新：2026-10-16
状态：P1 已合入 main，15 款游戏在固件里，但**真机一次都没烧过**

## 目标

把掌机做成能持续加游戏的街机，并且能和七八岁小朋友一起加——他出想法和数值，
代码和门禁由 AI 扛。浏览器街机 26 款是现成的展示面，固件是最终要玩的东西。

## 当前基线（已核对，不是推测）

- `main` = `origin/main` = `dea6fc3`，工作区干净。
- 静态门禁 `./tools/validate.sh --static` → **rc=0**（341 文件 + 31 套主机测试）。
  这条在这台 Mac 上能跑通了（见下面「已修的坑」）。
- 固件 **15 款**：射击 3（Striker / Tank 1990 / Contra）、动作 4（Island /
  Runner / Cavalry / Pac Neon）、竞速 3（Racer / Paws Sprint / Wave Walker）、
  益智 1（Neon Pop）、休闲 4（Wind Rider / Pixel Flappy / Shy Fish /
  Devil Roulette）。
- Flash 实测（CI 构建）：**1,494,896 / 3,145,728 字节 = 47.5%，剩 1612 KiB**。
- 浏览器街机 26 款，`arcade/` + `simulator/`，GitHub Pages 直接能玩。

## 已完成（P0 + P1，4 个提交）

- **P0 打地基**：补了所有文档都链向但其实不存在的 `docs/fork-guide.md` 双语对
  （门禁本来是红的，18 条断链）；`tools/validate.sh` 改成按
  `tests/test_<name>.c` ↔ `main/<name>.c` 自动配对发现主机测试（24→30 套，
  其中 `bouncy / huddle / laser_cat / pawssprint_dx / splasher` 五个测试
  写了却从没跑过）；`tools/verify_firmware.py` 每次构建打印
  `App budget: N / 3145728` 预算行，同时写进 CI job summary。
- **游戏模板**：`main/game_template_logic.c/h`，完整可玩的「接水果」模型
  （三轨道 / 炸弹 / 心数 / 等级 / 带种子随机数 / 固定对象池 / 零分配），
  头文件开头是一块「可以随便改的数字」。13 组主机断言盯着它，不会烂。
- **双语文档**：`docs/development/new-game-guide.md`（从想法到能玩的流程 +
  和小朋友共创的具体做法）、`docs/development/arcade-roadmap.md`
  （现状矩阵 / 体积预算 / 菜单与注册表设计 / P0–P5 分期）。
- **P1**：菜单改成 8 行滚动窗口 + `12/15` 位置指示 + 菜单内长按 OK 跳分类
  （游戏里长按 OK 仍是返回，语义没动）；游戏表从 `main.c` 拆成
  `game_catalog.c`（纯数据，主机测试盯 id 不重复）+ `game_registry.c`
  （函数指针）；接上 Pac Neon / Pixel Flappy / Shy Fish / Devil Roulette。
  **加新游戏现在是改注册表，不是改 `main.c`。**

## 已修的坑（会再踩，记一下）

- `tools/install-actionlint.sh` 原来调 `sha256sum --check`，而新版 macOS 自带的
  `/sbin/sha256sum` 认哈希但不认 `--check` → 完整静态门禁在 Mac 上必然失败。
  改成按值比对（shasum → sha256sum → openssl）。
- `validate.sh` 里用 `trap ... RETURN` 清临时目录会撞 `set -u`（RETURN 时局部
  变量已销毁）→ 改成脚本级变量 + EXIT trap。

## 最重要的一个认知修正

**天花板是 DRAM，不是 Flash。** Flash 还剩 1.6 MB，但 `flysaber` 和 `flydriver`
各自持有一块 `static uint8_t s_canvas_buf[]`（240×250×2 = 120,000 字节，
见 `main/demo_flysaber.c:34`、`main/demo_flydriver.c:33`），两块一起把
`dram0_0_seg` 顶出 129,680 字节，所以这两款虽然渲染层写好了也没能进固件。
ESP32-C3 只有约 320 KiB DRAM，还要分给 LVGL（48 KiB 静态池）、Wi-Fi、NimBLE。
**以后每加一个渲染层都要看 DRAM，不是看 Flash。**

## 已知未做

**13 个 logic 模块还没进固件：**

- 渲染层写好了、DRAM 装不下：`flysaber`、`flydriver`
- 只有逻辑、缺 LVGL 渲染层：`pong`、`worldtime`、`sparkler`、`smash`、
  `bubble`、`huddle`、`splasher`、`laser_cat`、`bouncy`、`pawssprint_dx`
- `game_template` 是模板，故意不进

**真机零验证。** 滚动菜单、分类跳转、新接的 4 款，全部只是「CI 编译通过」。

**一块空间储备没动：** `demo_wifi / demo_ble / demo_low_power / demo_display /
demo_button / demo_audio / demo_battery` 七个参考页面编进了固件但菜单里摸不到，
`demo_ble.c` 是 NimBLE 整个栈被链接的唯一原因。Wi-Fi 必须留——
`demo_battlecity.c` 用 ESP-NOW 做双机联机。这是路线图 P5，现在不缺空间，别动。

## 下一步（顺序别乱）

1. **先烧一次机验 15 款**（只能 Alex 做，见下面步骤）。别在真机过关之前继续叠
   P1b 和 P2——真机上一旦菜单手感或退出清理有问题，叠得越多越难定位。
2. **P1b**：把那两块 120 KB 静态画布改成进页面申请、退页面释放，或者改小成
   分块绘制 → 17 款。两个文件的事，性价比最高。
3. **P2**：10 个缺失渲染层，每批两三个，从最简单的 `pong` / `worldtime` /
   `sparkler` 开始 → 27 款。每批都要看 DRAM 数字。
4. **P3**：NVS 记住上次玩的 + 每个游戏最高分。`nvs` 分区在 `0x9000`，不在受保护
   布局里。设备上的最高分是最可能让小朋友玩第二次的功能。
5. **P4**：菜单顶部固定一个「我的游戏」位放模板副本，小朋友的半成品永远只差
   一次短按。

## 烧机步骤（Alex 自己做）

1. GitHub Actions → `firmware-checks.yml` 最新一次运行 → 底部 Artifacts
   下载 `firmware-*.zip`，解出 `FoloToy-AI-Passport-full.bin`。
2. USB-C 连掌机，Chrome 打开 <https://espressif.github.io/esptool-js/>，
   Connect 选 `usbmodem` 那个口。
3. 地址填 **`0x0`**，Program。
4. **绝对不要 `esptool.py erase_flash`** —— 出厂激活凭证 `cardid` 在
   `0x356000`，擦了就没了。合并固件只写到约 3.1 MB，碰不到它，所以安全。

验完回来说三件事：菜单滚动和分类跳转手感如何、4 款新游戏能不能正常进出、
长按 OK 退出有没有卡死或花屏。

## 悬而未决（等 Alex 定）

- **本机要不要装 ESP-IDF 5.5.3？** 这轮的 DRAM 溢出就是例子：本地能编译几十秒
  就报出来，走 CI 要等一整轮。P2 是十个渲染层，每个都可能撞同类内存问题，
  没有本地编译会很磨人。不装就一直走「推分支 → CI → 网页烧录」。
- P1b 是发给那个已有 worktree 的会话，还是新起一个。

## 不做

- 不在真机验证通过前继续加游戏
- 不动受保护 Flash 布局：`factory@0x10000` 上限 3 MB、`cardid@0x356000`
- 不为省空间删 `demo_wifi / demo_ble / demo_low_power` 等参考页面（P5 才考虑，
  且要先有预算行逼到那一步 + 前后测量）
- 不删 `main/` 下任何现有游戏
- 不把游戏逻辑写进渲染层——模型层必须保持零 malloc、不碰 LVGL/ESP-IDF、有主机测试
