<p align="right">
  <a href="fork-guide.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

# Fork Workflow

This document describes the conventions that apply to a downstream fork of the
upstream FoloToy AI Passport baseline. Ordinary upstream development does not
need it; read it when you own a fork, publish firmware from one, or decide
whether a change belongs upstream or stays local.

## Branch roles

| Branch | Role |
| --- | --- |
| `main` | Tracks the upstream baseline plus the fork's own product layer. It must stay buildable and must keep the protected flash layout intact. |
| `feature/*` | One application or one coherent feature per branch. This is where new work is developed before it lands. |
| `play/*` | A published application kept for reference after release. |

A fork that ships a single product (for example an arcade firmware) may land its
own product work directly on `main`, because `main` is the thing it releases.
That exception is only acceptable while every change still passes the complete
validation gate; it is not a licence to skip checks.

## Root README ownership

Upstream deliberately leaves the repository root README to the fork owner and
keeps its own product overview in [`docs/README.md`](README.md). GitHub renders
the root README in preference to `docs/README.md`, so a fork can introduce its
own product at the root without touching upstream documentation. Do not create a
root README in a fork that does not actually own a product, and do not move
upstream content out of `docs/`.

## What goes upstream and what stays local

- Reusable engineering experience, driver fixes, and documentation corrections
  belong upstream as a pull request. See
  [`docs/reference/README.md`](reference/README.md) for how experience entries
  are recorded and triaged.
- Fork-specific product content, branding, private business rules, and
  fork-only assets stay local. Fork-only documentation assets live in
  `docs/assets/`.
- Release and completion actions are listed in
  [`project-completion.md`](development/release/project-completion.md).

## Upstream synchronization

Keeping `main` close to upstream keeps future merges small. The synchronization
workflow and its expectations are described in
[`CI-sync-main.md`](development/ci/CI-sync-main.md). A fork must enable GitHub
Actions explicitly: workflows are disabled by default on a forked repository, so
the validation and firmware gates do not run until they are turned on.

## Conventions that still apply in a fork

- Commit and pull-request format follows
  [`commit-and-pr.md`](contribution/commit-and-pr.md).
- Documentation keeps an English default `.md` and a paired `.zh_CN.md`, as
  required by [`doc-conventions.md`](contribution/doc-conventions.md).
- The protected flash layout, the 3 MB application limit, and the `cardid`
  partition are template contracts. A fork may not move or overwrite them.
- AI-assisted work still starts from [`AGENTS.md`](../AGENTS.md).
