<p align="right">
  <strong>简体中文</strong> · <a href="CHANGELOG.md">English</a>
</p>

# Changelog

## Unreleased

- 重制剩下的 11 款，26 款全部跑在统一引擎上：齿轮骑兵（看敌人出招的骑枪战斗、蒸汽过载、铁巨人 BOSS）、果蝇超跑（世界绕着你旋转的 360° 管道竞速）、果蝇光剑（跟着内置合成音乐砍方块，三首曲子）、浪涌漫游者（一键冲浪、空翻、日落计时）、风与纸翼（高度换速度的纸飞机滑翔、风环、上升气流、雷云）、飞针破泡（泡泡射手、整片掉落、天花板下压）、午后温泉（萌物投放合成）、万物皆可敲（三洞对应 UP/OK/DOWN 的打地鼠、狂热模式）、会躲起来的鱼（贝壳换位猜鱼、冒充红鱼）、仙女棒（烟花时机、压轴大烟花）、世界时钟（时差问答）。页面不再加载旧实现和中文网页字体，并限制渲染倍率，高分屏更流畅。

- 《风与纸翼》和《浪涌漫游者》的按住操作跟手指走。纸飞机按住 OK 就俯冲，松开的瞬间展翼。UP / DOWN 按住才持续改机头。海獭沿坡滑行时，DOWN 按住才压板加速，松开立刻收力；起跳时按住 OK，板面会跟着浪面。两款和其它游戏一样，长按右下角的 OK 约 1.5 秒回街机菜单。

- 浏览器街机改为一个游戏页加一套引擎：`simulator/play.html` 承载全部游戏，60Hz 固定帧、2 倍清晰画面、带操作说明的标题页、READY/GO、暂停、带 S/A/B/C 评级的结算卡、每款三个可拿星的任务和本机前五名。`arcade-kit.js` 是共用引擎，`catalog.js` 是唯一的游戏目录。旧页面（`game.html`、`hub.html`、`thunder.html`、`flysaber.html`、`flydriver.html`、`paws-sprint.html`）改为跳转，旧 `ft_hs_` 前缀的最高分会自动迁移。
- 重制 15 款浏览器游戏并给出明确目标：雷霆战机（擦弹充能炸弹、金币连锁、关底 BOSS）、雷霆飞车（伪 3D 弯道、检查点、擦车攒氮气）、坦克大战（自动前进、提前转向、三关与道具）、冒险岛（体力持续下降、水果、蛋、分区）、口袋魂斗罗（自动开火跑射、抬枪卧倒、S/L/M 武器、炮台墙 BOSS）、像素飞鸟（金币、擦边分、场景、奖牌）、短腿爪爪（四个角色、三场杯赛）、霓虹宝石（掉落式三消与连锁）、大鱼吃小鱼（新增：吃小躲大长成鱼王）、赛博信使、变异乒乓（三个对手、扣杀时机、变异方块）、几何弹射（12 关反弹谜题）、水枪狂欢节（60 秒射击馆）、猫猫激光笔（8 个推箱房间）、恶魔轮盘（公布弹数、五种道具、三个恶魔）。
- 重做 `arcade/` 大厅：实时运行的吸引画面、今日挑战、星星进度、悬停即演示的重制精选，以及缩略图由游戏实时渲染、可搜索的游戏库。

- 新增《风与纸翼：乘风翱翔 (Wind Rider: Soaring Breeze)》：专为 AI Passport 三键（UP/DOWN/OK）打造的永不坠毁治愈系纸飞机飞行游戏。具备纯数学平滑山丘连绵起伏地形、真实流体空气动力学升力模型（按住 OK 顺坡俯冲蓄势、松开 OK 展翼冲云飞天、UP/DOWN 俯仰角微调与草地迎风起飞）、上升气流风之光环与极速音爆冲刺、蒲公英与风之水晶收集品、五阶段日夜晨昏天色心流流转、40 FPS 零堆内存即时矢量合批绘制、16kHz 破风与风铃拟音合成器与 100% Host 自动化单测覆盖。

- 新增《浪涌漫游者：海獭冲浪 (Wave Walker: Lo-Fi Surf)》：专为 AI Passport 三键（UP/DOWN/OK）打造的超萌治愈系海浪冲浪游戏。具备平滑双谐波连续正弦海浪数学模型、经典三键精妙冲浪微操（顺坡压板推力加速、浪尖借冲力跃浪腾空、空中 360° 滑稽大翻滚特技、触水前板面自动校正对齐辅助与完美切水二次喷射）、动态水面漂浮物与障碍（调皮小螃蟹、漂流木、浮游荧光水母）、五角海星与珍珠贝壳收集品、40 FPS 零堆内存即时矢量合批绘制、16kHz 海浪拟音合成器与 100% Host 自动化单测覆盖。

- 新增《短腿爪爪运动会：萌宠滑稽冲刺 (Paws Sprint: Fluffy Runner)》：专为 AI Passport 三键（UP/DOWN/OK）定制的 0 挫败治愈系萌宠跑酷游戏。具备 4 只特色可爱萌宠随心切换（柯基·球球、柴犬·阿柴、海豹·糯米、企鹅·波波）、平滑三车道变道、跳跃重力物理、踩香蕉皮华丽 360° 滑稽原地旋转舞步（绝无撞毁挫败惩罚）、扫地机器人变道碰撞、骨头与爱心收集、500 米终点慢动作飞扑蓬松巨型大抱枕（Cushion Dive）炸裂彩色羽毛粒子、温馨治愈寄语签抽取、40 FPS 零堆内存即时矢量合批绘制、16kHz 萌宠拟音合成器与 100% Host 自动化单测覆盖。

- 新增《霓虹疾行：影刃闪现 (Cyber Courier: Phantom Dash)》：专为 AI Passport 三键（UP/DOWN/OK）定制的高机动赛博朋克大厦屋顶疾跑跑酷游戏。具备多层建筑断崖流式生成、空中幽灵闪现（零重力滞空瞬移、相位虚化无敌与霓虹残影）、二段喷气跳跃、贴地低姿态滑铲、空中急降俯冲、脉冲激光光网、巡逻无人机穿爆、全息易碎天窗、超导排风强力弹射与动态物理流光围巾。包含 40 FPS 零堆内存即时矢量渲染、16kHz 赛博合成器音效、100% Host 自动化单测覆盖与 Alex Arcade Web 仿真柜机。

- 新增《齿轮骑兵：蒸汽过载 (Gear Cavalry: Steam Overdrive)》：专为 AI Passport 三键（UP/DOWN/OK）打造的高速蒸汽朋克动作跑酷游戏。具备地表高速啮合旋转大齿轮物理、三键多姿态状态机（腾空跃马、重骑枪空中下刺、贴地俯冲滑铲与螺旋长矛突刺）、100 PSI 蒸汽超压激活狂暴过载无敌冲撞机制、纯静态零堆分配敌兵与粒子对象池、40 FPS 即时矢量渲染、16kHz 蒸汽工坊合成音效与 Alex Arcade Web 街机仿真柜机。

- 新增《赛博晶核消消乐：极速连击 (Cyber Match-3: Neon Pop)》：专为 AI Passport 三键（UP/DOWN/OK）打造的高性能消除游戏。采用零堆分配状态机、双步式定向邻居轮换交换算法、4/5连激光射线与彩虹星核合成、重力掉落下落级联与死局自动洗牌。配备 40 FPS 零显存开销即时矢量渲染、16kHz 8-bit 复古合成音效、完整的 Host 自动化单测与 Alex Arcade Web 街机仿真柜机。

- 重做 Alex Arcade 大厅：十三台柜机加世界钟休息室、像素吸引画面、今晚主打/继续游戏、键盘投币、本机高分。柜机打开 HD 桌面（`hub.html`、`thunder.html`、`flysaber.html`、`flydriver.html`）；鱼、轮盘与消消乐走 `game.html`。

- 新增《会躲起来的鱼》：口袋鱼缸陪伴小品。对它说话或按 OK 会游到面前看着你，轻敲缸壁能从水草里探头，对着麦克风吹气会吓得乱窜，长时间不理（或离开数小时）就钻进草里只露尾巴。没有饥饿，不会死亡。含固件、host 测试与 Alex Arcade 柜机。

- 新增《经典坦克大战 1990 (Battle City Neo)》：包含 8x8 子砖局部瓦解物理、4 星超级穿甲重坦摧毁钢板、基地雄鹰保卫战、7 大经典宝箱道具、16kHz 复古 chiptune 拟音、基于 ESP-NOW 的无感双机无线联机对战/合作，以及 `simulator/game.html` 与 `arcade/` 的 Web 街机模拟器集成。
- 新增 `arcade/` 对外大厅：柜机墙加世界钟休息室，仓库根目录与 `simulator/index.html` 会跳到这里，方便以后挂 GitHub Pages。
- 雷霆飞车固件 HUD 会显示擦车连击，并在夜间切换赛道配色。

- 加入厂家为优特利 520mAh 电芯生成的 80 字节 CW2017 profile，并实现内容与更新标志检查、写入后校验、规定的重启时序以及有上限的 SOC 就绪等待。

- 扩充环境引导文档：新增乐鑫 Git 服务镜像（`git.espressif.com.cn`）作为中国大陆首选线路，覆盖 ESP-IDF v5.5.3 及其子模块；补充子模块长等待/超时处理、原地修复，以及 `esp32-wifi-lib` 等大仓的按钉死 commit 浅取；提示按仓库残留的 Jihulab `insteadOf` 旧配置；并把官方离线 release 压缩包加入兜底方案（经验来自 `esp-mosaico/esp-mosaico-vibe`）。

- 按功能域整理文档并采用双入口：根目录 `AGENTS.md` 变为薄路由（只保留硬约束与任务路由），详细的 AI 开发工作流下沉到 `docs/development/ai-guide.md`，`agent-guide.md` 并入其中。为 `docs/development/` 增加二级分区（`engineering/`、`ci/`、`release/`），把 `plays/` 应用档案与 `experiences/` 移入带专属 README 的 `docs/reference/` 参考区；删除 `docs/software-design/`（空脚手架）；把 `assets/{fonts,images,music}/README` 三个叶子 README 并入 `assets/` README；把 `project-completion` 的六个子文档压平为单文件；并把每个目录统一为单一 README，消除所有 `INDEX` 文件与一处重复经验索引。所有交叉引用与文献链接已更新；未丢弃任何内容。

- 删除位于 `0x700000` 的旧 app/test 分区，以及相关的 bootloader、校验和
  文档要求；固定的 `cardid` 保护分区及其 CI 校验保持不变。
- 规定多应用发布的 Release 标题约定：tag 按 `v<版本>-<应用名>`（如 `v0.1.0-voice-keychain`）命名，让 Release 标题同时带版本与应用名；发布成功后核对标题，保证一眼扫 Release 列表就能区分是哪个应用。
- 新增发布后收尾流程：`issue-suggestions` skill 用于把用户反馈作为 issue 提交到上游项目；`experience-pr` skill 用于把可复用的开发经验作为文档 PR 提交；新增 `docs/experiences/` 目录保存单条经验文件；并配套 `project-completion`、`file-issues` 与经验索引文档。
- 精简仓库根目录：将 GitHub 可识别的社区治理文档迁入 `.github/`，将变更记录迁入 `docs/`，同步全部引用，并在仓库检查中加入根目录文档白名单。
- 全仓库文档语言规范：所有维护中的 Markdown 默认 `.md` 文件使用英文，简体中文使用配对的 `.zh_CN.md`，双方提供语言切换；静态检查会阻止缺失配对、缺失切换链接或英文默认页混入中文正文。
- AI 开发流程一期：精简按任务加载的上下文入口，统一本地/CI 验证脚本，新增 PR 自动构建与模板，并提交依赖锁文件以提高构建可复现性。
- PR 审查修复：GitHub Actions 固定到完整 commit SHA，构建与发布 job 按最小权限拆分，同步 checkout 关闭凭证持久化；补充 Feature Request / Usage Question issue 表单；启用并修正私密安全报告兜底说明；清理 README 路径、CI 触发条件与历史分支描述漂移。
- 语言规范变更：commit 标题、PR 标题与 body 由"默认中文"改为**使用英文**（`docs/contribution/commit-and-pr.md` 更新）；中文写作规范（全角标点）适用范围剔除 PR/MR 描述（`doc-conventions.md` 更新）。
- CI 构建改造：`build-firmware.yml` 显式传入 `SDKCONFIG_DEFAULTS=sdkconfig.defaults` 再 `idf.py build`，由 defaults 启用自定义分区表（`CONFIG_PARTITION_TABLE_CUSTOM=y`，文件名为 `partitions.csv`）；`CONFIG_ESPTOOLPY_HEADER_FLASHSIZE_UPDATE` 改为 `n`，再用 `idf.py merge-bin -o build/FoloToy-AI-Passport-full.bin` 合并可直刷完整固件；产物精简为仅 full.bin；`actions/cache` 升级到 v5 以消除 GitHub Actions Node.js 20 弃用警告；CI 文档同步更新。
- 合并上游 PR #6（wireless-low-power-demos）以解决 PR #4 冲突：引入无线/低功耗 demo（`main/demo_wifi.c`、`demo_ble.c`、`demo_radio.c`、`demo_low_power.c`）、`partitions.csv`（NVS/PHY/3 MB factory-app 分区）、`main/CMakeLists.txt`/`main.c`/`demo.h`/`sdkconfig.defaults` 更新；同步硬件指南的 Wi-Fi/BLE/低功耗章节；README 能力契约表补充 Wi-Fi/Bluetooth LE/Low power 三项（中英双语）。
- 提交规范补充：`docs/contribution/commit-and-pr.md` 明确 PR 标题与 commit 标题使用相同的 Conventional Commit 格式和英文祈使句，不用名词短语当标题。
- CI 与文档清理：`sync-main.yml` 移除 `test_mode` 残留模板注释；`docs/development/coding-conventions.md` 将「Redis TTL」条目泛化为「缓存组件」条目（当前固件无 TTL 约束需求，消除从模板带入的无关约定）。
- 补充通用规范（借鉴 Shinku）：`docs/contribution/doc-conventions.md` 新增中文全角标点规范（正文 `，`；`（`）`，代码/命令/路径保留英文原样）、凭证不入仓规范（token/密钥/私钥绝不入仓，提交前 git diff 扫描敏感前缀）、文件删除安全规范（删除走系统回收站，不用 rm -rf/git clean -fd）。
- 代码注释规范强化：`docs/development/coding-conventions.md` 补充完善注释要求——函数说明（用途/参数/返回值/副作用/线程上下文/内存所有权/初始化顺序）、变量说明（语义/取值范围/生命周期/同步要求）、逻辑注释（状态机/时序/寄存器/魔数依据），覆盖范围宁多勿少，中文注释保留英文技术术语。
- 文档去 AI 化：`docs/README.md` / `docs/README.zh_CN.md` 移除 AI 专属章节（Entry point、Source-of-truth、提需求格式、BSP 边界、Runtime invariants、验收交付格式、构建命令），README 只保留给人看的项目介绍、硬件能力契约、demo 案例与项目结构；构建命令章节删除（与 `docs/development/build-and-test.md` 重复）。
- 新增 `docs/development/agent-guide.md`：集中承载"AI 如何在本仓库工作"（上下文建立顺序、事实来源优先级、提需求格式、BSP 边界、运行时规则、交付格式），并链接 build-and-test 与硬件指南，不重复构建命令与验收矩阵。
- 同步更新索引：`AGENTS.md` 规则索引新增 agent-guide 条目；`docs/INDEX.md` 与 `docs/development/README.md` 新增 agent-guide 索引行。
- 文档补充：`docs/fork-guide.md` 说明「为什么根目录不放置 README」——根目录 README 预留给 fork 开发者自行放置（上游留空），fork 后可将自己的内容写入根目录 `README.md` 介绍 fork 后的项目；GitHub 显示优先级（根 README > docs/README.md）契合该预留意图。
- 分支合并：创建 `main-update` 分支（基于与上游一致的 main），将 `feature/repo-structure`、`ci/build-firmware`、`ci/sync-main` 三个分支合并进来，统一 docs 结构（CI 文档归入 `docs/development/`，workflow 文件随 ci 分支引入 `.github/workflows/`）；解决 development/software-design README 的 add/add 冲突。
- 合并后审查修复：`docs/INDEX.md` 补充 CI 文档索引；`docs/fork-guide.md` 修正 workflow 引用为 `.github/workflows/sync-main.yml`；`docs/README` 双语项目结构块补充 `.github/workflows/` 与 CI 文档说明。
- ci 分支 CI 文档路径调整：`ci/build-firmware` 的 `docs/software-design/CI-build-and-release.md` 与 `ci/sync-main` 的 `docs/software-design/CI-sync-main.md` 均移入各分支的 `docs/development/`（CI 属工程规范）；`docs/software-design/README.md` 保留为软件设计索引；feature 分支的 software-design 索引同步更新引用。
- fork 补充文档目录迁移：`assets/docs/` 移至 `docs/assets/`（文档素材归入 docs/ 更合理），新增 `docs/assets/.gitkeep` 空目录占位；同步更新 AGENTS.md / INDEX / doc-conventions / fork-guide 的路径引用。
- 文档结构调整：根目录不再放 README——上游英文 README 移入 `docs/README.md`、中文移入 `docs/README.zh_CN.md`（GitHub 从 docs/ 识别主 README）；原 `docs/README.md` 根总索引更名为 `docs/INDEX.md`；同步更新 AGENTS.md / CONTRIBUTING / SUPPORT / fork-guide / doc-conventions 的路径引用。
- 初始化项目文档：新增 `AGENTS.md`、`CLAUDE.md` 和 `CHANGELOG.md`。
- 仓库结构规整：上游英文 `README.md` 更名为 `README.en_US.md`，保留 `README.zh_CN.md`。
- 新增目录骨架：`docs/`（software-design / hardware-design）、`assets/`（fonts / images / music，各含 `README.md`）、`skills/`。
- 将上游硬件开发指南归位到 `docs/hardware-design/AI_HARDWARE_DEVELOPMENT_GUIDE.md`。
- 文档规范：子目录 readme 统一为大写 `README.md`；补充 fork 用户约定（main 只动根 README）。
- 扩展 fork 用户约定：`main` 分支允许修改根目录 `README.md` 和 `assets/docs/`（README 不足以说明项目时存放补充文档与素材）。
- 新增 `assets/docs/` 目录约定：上游 main 只保留空目录 `.gitkeep`，内容文件仅存在于 fork；使用方法规范写入 AGENTS.md「给 fork 用户」约定。
- CI 文档迁移：`docs/software-design/CI.md` 从本分支移除，迁至 `ci/build-firmware` 分支并改名为 `docs/software-design/CI-build-and-release.md`。
- 补充 `main` 分支策略说明：解释 `main` 保持干净的两大原因（与上游同步无冲突 + 多小项目按分支整理）；例外——执意 main 开发需停用 CI 自动同步；提醒 fork 用户默认 action 关闭需手动启用（此条为整个 CI 的通用要求，统一写入 AGENTS.md）。
- 文档拆分：将 `AGENTS.md` 按主题拆为公共文档——新增 `docs/contribution/`（doc-conventions.md、commit-and-pr.md）与 `docs/development/`（build-and-test.md、coding-conventions.md），新增 `docs/fork-guide.md`；`AGENTS.md` 精简为简介 + 项目概述 + 必读文档索引。
- 同步更新索引：`docs/software-design/README.md`、`README.en_US.md` / `README.zh_CN.md` 的 `docs/` 目录说明。
- 参考 cindy 仓库文档组织完善索引：新增 `docs/README.md` 根总索引；AGENTS.md 规则索引按触发场景改写（附触发条件）；`docs/contribution/` 与 `docs/development/` 的 README 补充收录标准。
- 引入社区治理文档（参照 cindy 改写，放仓库根目录）：新增 `CONTRIBUTING.md` / `.zh_CN.md`（贡献指南，针对 ESP-IDF/AI agent/fork 场景改写）、`CODE_OF_CONDUCT.md` / `.zh_CN.md`（贡献者公约）、`SECURITY.md` / `.zh_CN.md`（安全报告流程）、`SUPPORT.md` / `.zh_CN.md`（支持渠道）；AGENTS.md 与 docs/README.md 同步引用。
