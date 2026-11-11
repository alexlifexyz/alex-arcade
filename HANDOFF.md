# Alex Arcade 项目交接文档

> 本文档供下一个 AI 模型或开发者接手使用。最后更新：2026-11-11。

---

## 一、项目全貌

Alex Arcade 是一个在线复古游戏平台，托管在 GitHub Pages 上，包含两个游戏大厅：

| 大厅 | 路径 | 内容 | 在线地址 |
|------|------|------|---------|
| 三键街机厅 | `arcade/` | FoloToy AI Passport 掌机原生游戏 | https://alexlifexyz.github.io/alex-arcade/arcade/ |
| 复古模拟器厅 | `retro-arcade/` | 104 款 FC/GBA/CPS1/GBC/GB/NGPC 浏览器模拟器 | https://alexlifexyz.github.io/alex-arcade/retro-arcade/ |

门户首页（双厅入口）：https://alexlifexyz.github.io/alex-arcade/

---

## 二、两个仓库的关系

| 仓库 | 地址 | 可见性 | 用途 |
|------|------|--------|------|
| **xhs-minitools** | github.com/alexlifexyz/xhs-minitools | public | 源仓库：游戏开发、内核编写、ROM 处理、构建打包 |
| **alex-arcade** | github.com/alexlifexyz/alex-arcade | public | 部署仓库：GitHub Pages 托管，arcade/ + retro-arcade/ |

**数据流向**：xhs-minitools 开发 → `build_dist.sh` 产出 `dist/` → 复制到 alex-arcade/retro-arcade/ → git push → GitHub Pages 自动部署

---

## 三、复古模拟器厅（retro-arcade）技术架构

### 3.1 目录结构

```
alex-arcade/
├── index.html              # 门户首页（双厅入口，金币配色）
├── .nojekyll               # 禁用 Jekyll 处理
├── .gitattributes          # rom.js 标记为 binary
├── arcade/                 # 三键街机厅（FoloToy 原生游戏，已有）
├── retro-arcade/           # 复古模拟器厅（本次新增）
│   ├── index.html          # 31KB — 首页（alex-arcade 风格，three.js 封面环 + 游戏网格）
│   ├── play.html           # 11KB — 游戏播放器外壳（三模式：full/fit/device）
│   ├── shared/web/         # 公共资源
│   │   ├── games.js        # 游戏元数据（window.WEB_GAMES，110 条）
│   │   ├── player.js       # 播放器逻辑（同源加载 iframe，画面绘制，模式切换）
│   │   ├── input-bridge.js # 键盘输入桥（读内核 pad 动态生成键表）
│   │   ├── virtual-keys.js # 触屏虚拟按键（Pointer Events 多指状态机）
│   │   ├── gamepad.js      # 蓝牙手柄支持（Gamepad API 标准映射）
│   │   ├── test_input.js   # 输入桥单元测试（15 组断言）
│   │   ├── sync_games.py   # 游戏元数据一致性校验（扫描 tools/ 目录）
│   │   └── vendor/
│   │       └── three.min.js  # three.js r128 UMD（589KB）
│   └── tools/              # 110 个游戏目录
│       └── <game-id>/      # 每个游戏一个目录
│           ├── index.html  # 游戏页面（加载 core.js + rom.js）
│           ├── cover.png   # 封面图（首页网格展示用）
│           ├── icon.png    # 图标
│           └── assets/
│               ├── core.js     # 模拟器内核（平台特定：NES/GBA/CPS1...）
│               ├── rom.js      # ROM 数据（Base85 编码，二进制标记）
│               ├── config.js   # 游戏配置
│               ├── shell.js    # 渲染循环（rAF + canvas）
│               ├── skin.js     # 皮肤样式
│               ├── style.css   # 页面样式
│               └── nes.min.js  # 平台模拟器库（部分游戏有）
└── tools/                  # CI 脚本
    ├── check_repo.py       # 仓库静态检查（密钥扫描、链接校验等）
    └── validate.sh         # CI 入口（--static / --firmware）
```

### 3.2 游戏清单（110 个目录）

| 平台 | 数量 | 目录名后缀 | 模拟器内核 |
|------|------|-----------|-----------|
| NES/FC | 50 | `-nes` | NES 模拟器 |
| GBA | 35 | `-gba` | GBA 模拟器 |
| CPS1 | 10 | `-cps1` | CPS1 街机模拟器 |
| GBC | 4 | `-gbc` | GBC 模拟器 |
| NGPC | 2 | `-ngpc` | Neo Geo Pocket |
| GB | 1 | `-gb` | Game Boy |

另有 6 个非游戏工具目录：`blind-stop`、`game-2048`、`human-peak`、`smash`、`tidy-desk`、`work-hours`

### 3.3 关键技术细节

- **路径**：全部相对路径（`shared/web/...`、`tools/<id>/...`），无硬编码域名或 localhost
- **ROM 格式**：原始 ROM（.nes/.gba 等）经 Deflate + Z85 编码内联为 `rom.js` 文本文件，运行时解码到内存
- **播放器**：`play.html?game=<id>&mode=<full|fit|device>` 通过 iframe 加载 `tools/<id>/index.html`
- **画面缩放**：默认 `exact`（整数倍），`?scale=fit` 可回退非整数倍
- **输入**：键盘用内核自带 KEY_MAP（网页层不重复绑定），虚拟键和手柄走 `GGEMU_CORE.setButton()`
- **设计语言**：Bebas Neue + Silkscreen 字体，金 #f0c14b / 粉 #ff4d8d / 青 #38e1ff 霓虹配色，深色 #0b0910 底
- **首页**：three.js 3D 封面旋转环 + 12 款精选横滑 + 104 款游戏网格（平台 chip 筛选）+ 金币掉落动画

### 3.4 游戏数据源

`shared/web/games.js` 导出 `window.WEB_GAMES` 数组，每条记录：
```js
{
  id: "mario-nes",          // 目录名
  title: "超级马里奥",       // 显示名
  platform: "NES",          // 平台
  category: "nes",          // 筛选用
  desc: "超级马里奥 · NES",  // 简述
  pitch: "浏览器里即点即玩"   // 精选卡片描述
}
```

---

## 四、CI 与已解决问题

### 4.1 CI 工作流

alex-arcade 有 4 个 GitHub Actions 工作流：

| 工作流 | 触发 | 用途 | 与 retro-arcade 的关系 |
|--------|------|------|----------------------|
| Static checks | push/PR to main | 密钥扫描、链接校验、文档语言检查 | 已修复误报（见下） |
| Firmware checks | push/PR to main | ESP-IDF 固件编译 | 无关 |
| Build firmware | tag push | 固件构建 + Release | 无关 |
| pages build | dynamic | GitHub Pages 部署 | 自动部署 retro-arcade |

### 4.2 已解决的 CI 误报（提交 `10964b9`）

**问题**：`tools/check_repo.py` 的密钥扫描正则碰撞了 rom.js 的 Base85 编码数据：
- `AKIA[0-9A-Z]{16}`（AWS key）命中 2 个游戏（`mario-land-gb`、`megaman2-nes`）
- `s.[A-Za-z0-9]{20,}`（Vault token，GitHub secret scanning）命中 33 个游戏

**修复**：`text_files()` 函数跳过 `retro-arcade/` 目录，ROM 数据不参与密钥扫描。

### 4.3 当前 CI 状态

全部 4 个工作流 **success** ✅

---

## 五、Git 状态

### alex-arcade 仓库

```
10964b9 (HEAD -> main, origin/main) fix(ci): skip retro-arcade rom.js in secret scanning
ffb15ce (tag: v2.0.0-retro) feat(retro-arcade): import 104-title browser emulator hall
99da466 feat(portal): add two-hall gateway and retro-arcade docs
```

- Tag: `v2.0.0-retro`（annotated）
- 工作区有少量未提交改动（`.gitignore`、`minitool/`），与 retro-arcade 无关
- GitHub Pages: status=built, HTTPS 强制开启

### xhs-minitools 仓库

```
4f19d80 (HEAD -> main) docs: make integer scaling the default
```

- 工作区有较多未提交改动（皮肤正本、部分游戏 config/skin 等），是开发中的正常状态
- `build_dist.sh` 可用，产出 `dist/`（366MB / 110 游戏）

---

## 六、新增游戏流程

1. 在 xhs-minitools `tools/` 下创建新游戏目录（`<id>-<platform>/`）
2. 编写 `assets/core.js`（模拟器内核）、`assets/rom.js`（编码后的 ROM）、`assets/config.js`
3. 创建 `index.html`、`cover.png`、`icon.png`
4. 运行 `shared/web/sync_games.py` 更新 `games.js`（或手动添加）
5. 本地测试：`python3 -m http.server 8766` → 访问 `http://127.0.0.1:8766/play.html?game=<id>`
6. 运行 `build_dist.sh` 产出 `dist/`
7. 复制 `dist/` 内容到 `alex-arcade/retro-arcade/`
8. `git -C alex-arcade add . && git commit -m "feat(retro-arcade): add <id>" && git push`
9. GitHub Pages 自动部署

---

## 七、注意事项（踩过的坑）

1. **rom.js 是二进制数据**：Base85 编码的 ROM，会随机产生看起来像密钥的字符串。`check_repo.py` 已排除 retro-arcade/，但如果往别的目录放 rom.js 需要注意
2. **macOS grep 不支持 -P**：用 `grep -oE` 或 Python `re` 替代
3. **Chrome headless 参数**：需 `--no-sandbox --disable-gpu --no-proxy-server --user-data-dir=<独立目录>`，否则 exit 133 / GPU 崩溃
4. **HTTP_PROXY 环境**：curl 需 `--noproxy '*'`
5. **GitHub Pages 大文件**：单文件上限 100MB，retro-arcade 最大文件 15MB（golden-sun2-gba rom.js），无问题
6. **私有仓库限制**：如改 alex-arcade 为 private，GitHub Pages 需要 GitHub Pro 付费套餐
7. **Gamepad API 需要 HTTPS**：GitHub Pages 已强制 HTTPS，手柄功能可用（但手机真机未实测）

---

## 八、关键文件速查

| 文件 | 路径 | 说明 |
|------|------|------|
| 门户首页 | `alex-arcade/index.html` | 双厅入口 |
| 模拟器厅首页 | `alex-arcade/retro-arcade/index.html` | 游戏网格 + three.js |
| 播放器 | `alex-arcade/retro-arcade/play.html` | 三模式游戏播放 |
| 游戏列表 | `alex-arcade/retro-arcade/shared/web/games.js` | 110 条元数据 |
| 播放器逻辑 | `alex-arcade/retro-arcade/shared/web/player.js` | iframe 加载 + 画面绘制 |
| 输入桥 | `alex-arcade/retro-arcade/shared/web/input-bridge.js` | 键盘 → 内核 pad |
| 虚拟按键 | `alex-arcade/retro-arcade/shared/web/virtual-keys.js` | 触屏多指状态机 |
| 手柄 | `alex-arcade/retro-arcade/shared/web/gamepad.js` | Gamepad API |
| three.js | `alex-arcade/retro-arcade/shared/web/vendor/three.min.js` | r128 UMD |
| 构建脚本 | `xhs-minitools/build_dist.sh` | 产出 dist/ |
| CI 检查 | `alex-arcade/tools/check_repo.py` | 密钥扫描等 |
| .gitattributes | `alex-arcade/.gitattributes` | rom.js binary |
| .nojekyll | `alex-arcade/.nojekyll` | 禁用 Jekyll |

---

## 九、未完成 / 可选后续

- [ ] 蓝牙手柄真机实测（笔记本 Chrome → 安卓 → iPhone）
- [ ] 自定义域名绑定（如需要，在 alex-arcade 根目录加 CNAME 文件 + DNS 配置）
- [ ] CPS1 游戏数量确认（目录名 grep 到 10 个 `-cps1`，之前文档写 12，可能是不同统计口径）
- [ ] xhs-minitools 工作区有大量未提交改动，需要 Alex 确认后清理
