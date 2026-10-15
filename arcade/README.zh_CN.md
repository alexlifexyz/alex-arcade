<p align="right">
  <strong>简体中文</strong> · <a href="README.md">English</a>
</p>

# Alex Arcade

AI Passport 游戏合集的公开游乐场：26 款游戏在浏览器里直接玩，全部沿用掌机的三颗键 UP、DOWN、OK。所有游戏都在 2026 年基于同一套引擎重制，每款都有明确目标、三个任务和 S/A/B/C 评级。

## 目录

```text
arcade/                 对外主页（本目录）
  index.html            大厅：实时吸引画面、今日挑战、重制精选、游戏库
  assets/               厅堂照片、金币、掌机照片
simulator/              可玩页面
  play.html             唯一的游戏页（所有游戏都从这里打开：play.html?id=<id>）
  arcade-kit.js         共用引擎：60Hz 固定帧、输入、音效、特效、存档、标题/暂停/结算壳层、演示沙盒
  catalog.js            唯一的游戏目录：名称、操作、技巧、任务、评级门槛
  games/*.js            每款游戏一个文件
  games-engine.js、games-impl.js、games-new-impl.js、games/legacy.js
                        2026 年以前的旧实现，已经没有页面加载，可以删除
  game.html、hub.html、thunder.html、flysaber.html、flydriver.html、paws-sprint.html
                        跳转到 play.html，旧链接继续可用
```

把 `arcade/index.html` 和旁边的 `simulator/` 一起用静态服务打开。大厅的缩略图和吸引画面都是游戏本身在静音沙盒里实时运行，不需要维护截图文件。

## 加一款游戏

1. 在 `simulator/catalog.js` 里加一条（id、名称、操作、任务、评级）。
2. 新建 `simulator/games/<名字>.js`，调用 `Arcade.define({ id, create(api) { return { update(input), draw(ctx) } } })`。实时数据写进 `api.stats`，一局结束时调用 `api.end()`；标题页、暂停、结算卡、任务和最高分都由壳层处理。
3. 在 `simulator/play.html` 和 `arcade/index.html` 里各加一行 `<script>`。

分数、星星、本机前五名和上次玩的游戏都存在这台浏览器里（`localStorage`）。

## GitHub Pages 与域名

1. 在本仓库打开 GitHub Pages，源选默认分支的根目录。
2. 根目录的 `index.html` 会跳进 `arcade/`。
3. 以后有域名时，在 `arcade/`（若 Pages 发布的是 `/` 则放仓库根）放一个内容为域名的 `CNAME`，再把 DNS 指到 GitHub。

没有构建步骤。站点是静态 HTML、CSS 和 JavaScript。

## 本地预览

```bash
python3 -m http.server 8080
```

然后打开 `http://127.0.0.1:8080/arcade/`。
