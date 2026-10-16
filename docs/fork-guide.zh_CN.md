<p align="right">
  <strong>简体中文</strong> · <a href="fork-guide.md">English</a>
</p>

# Fork 工作流

本文说明从上游 FoloToy AI Passport 基线 fork 出来之后适用的约定。普通上游开发
不需要读；当你拥有一个 fork、要从 fork 发布固件，或者需要判断某个改动该回上游还是
留在本地时，再看这里。

## 分支职责

| 分支 | 职责 |
| --- | --- |
| `main` | 跟随上游基线，并承载 fork 自己的产品层。必须始终可构建，必须保持受保护的 Flash 布局不变。 |
| `feature/*` | 一个应用或一条完整功能一个分支，新工作在这里开发，然后再落地。 |
| `play/*` | 已发布的应用在发布后留作参考的分支。 |

只交付单一产品的 fork（例如一份街机固件）可以把自己的产品改动直接落在 `main`，
因为 `main` 就是它发布的东西。这个例外成立的前提是每次改动仍然跑通完整验证门禁，
不是跳过检查的理由。

## 根 README 的归属

上游有意把仓库根目录的 README 留给 fork 所有者，自己的产品概览放在
[`docs/README.zh_CN.md`](README.zh_CN.md)。GitHub 优先渲染根 README 而不是
`docs/README.md`，因此 fork 可以在根目录介绍自己的产品，而不必改动上游文档。
没有真正拥有产品的 fork 不要新建根 README，也不要把上游内容从 `docs/` 搬走。

## 什么回上游、什么留本地

- 可复用的工程经验、驱动修复、文档勘误应作为 pull request 回到上游。经验条目的
  记录与分流方式见 [`docs/reference/README.zh_CN.md`](reference/README.zh_CN.md)。
- fork 专有的产品内容、品牌、私有业务规则与 fork 专用素材留在本地。fork 专用的
  文档素材放在 `docs/assets/`。
- 发布与收尾动作清单见
  [`project-completion.zh_CN.md`](development/release/project-completion.zh_CN.md)。

## 上游同步

让 `main` 贴近上游，可以让以后的合并保持很小。同步工作流及其预期见
[`CI-sync-main.zh_CN.md`](development/ci/CI-sync-main.zh_CN.md)。fork 必须显式启用
GitHub Actions：fork 出来的仓库默认关闭 workflow，不手动打开的话验证门禁与固件
构建都不会运行。

## 在 fork 里依然生效的约定

- 提交与 PR 格式遵循
  [`commit-and-pr.zh_CN.md`](contribution/commit-and-pr.zh_CN.md)。
- 文档保持英文默认 `.md` 与配对的 `.zh_CN.md`，见
  [`doc-conventions.zh_CN.md`](contribution/doc-conventions.zh_CN.md)。
- 受保护的 Flash 布局、3 MB 应用上限、`cardid` 分区都是模板契约，fork 不得移动或
  覆盖。
- AI 参与的开发仍然从 [`AGENTS.zh_CN.md`](../AGENTS.zh_CN.md) 开始。
