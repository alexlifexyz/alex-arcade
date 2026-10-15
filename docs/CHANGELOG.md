<p align="right">
  <a href="CHANGELOG.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

# Changelog

## Unreleased

- Remade the remaining eleven browser titles so all 26 now run on the shared engine: Gear Cavalry (read-the-enemy lance combat, steam overdrive, iron golem boss), Fly Driver (360° tube racer where the world rotates around you), Fly Saber (rhythm slashing to built-in synthesized music, three songs), Wave Walker (one-button surfing with flips and a setting sun), Wind Rider (paper-plane gliding that trades height for speed, rings, thermals, storms), Bubble Needle (bubble shooter with drops and a descending ceiling), Fluffy Huddle (drop-and-merge animals in a hot spring), Smash Frenzy (three-hole whack game mapped to UP/OK/DOWN with fever mode), Shy Fish (shell game with decoys), Sparkler (fireworks timing with a finale meter), and World Clock (time-zone quiz). Pages no longer load the old implementations or the CJK web font, and the render scale is capped for smoother play on high-DPI screens.

- Wind Rider and Wave Walker follow the finger until it lifts. The paper plane dives while OK is held and opens its wings the moment OK is released. UP and DOWN hold the nose up or down. The hillside surf pumps only while DOWN is held and releases immediately, and holding OK through a jump keeps the board level. Holding OK for 1.5 s still returns to the arcade menu from either game, the same as every other title.

- Rebuilt the browser arcade around one game page and one engine. `simulator/play.html` now hosts every title with a fixed 60 Hz loop, 2x-sharp rendering, a title card with controls, READY/GO, pause, a result card with S/A/B/C rank, three missions per game that award stars, and a local top five. `arcade-kit.js` holds the shared engine and `catalog.js` is the only game list. The old pages (`game.html`, `hub.html`, `thunder.html`, `flysaber.html`, `flydriver.html`, `paws-sprint.html`) redirect to it, and high scores saved under the old `ft_hs_` keys are migrated.
- Remade fifteen browser titles with clear goals: Thunder Striker (graze-charged bombs, medal chains, stage bosses), Thunder Racer (pseudo-3D road with curves, checkpoints, near-miss nitro), Tank 1990 (auto-drive tank with buffered turns, three stages, power-ups), Adventure Island (draining energy, fruit, eggs, areas), Pocket Contra (auto-fire run-and-gun, aim up/prone, S/L/M weapons, wall boss), Pixel Flappy (coins, graze bonus, zones, medals), Paws Sprint (four characters, three-race cup against rivals), Neon Gems (falling-column match-three with chains), Fish Hunter (new: eat smaller fish, grow to king), Cyber Runner, Mutant Pong (three opponents, smash timing, mutation blocks), Bouncy Blaster (12 ricochet puzzles), Hydro Splash (60-second gallery), Laser Cat (8 push-box rooms), and Devil Roulette (announced shell counts, five items, three devils).
- Redesigned the `arcade/` lobby: a live attract screen that runs the games, a daily challenge, star progress, a featured rail with hover previews, and a searchable library whose thumbnails are rendered from the games themselves.

- Added Wind Rider: Soaring Breeze, an origami paper plane gliding and soaring game designed for the 3-button (UP/DOWN/OK) AI Passport handheld. Features a crash-proof continuous rolling hill mathematical terrain, fluid aerodynamic lift mechanics (hold OK to dive into slopes, release OK to soar into clouds, UP/DOWN pitch trim and ground take-off lift), soaring wind rings with sonic speed bursts, dandelion and wind crystal collectibles, a 5-phase day-night sky flow cycle, 40 FPS zero-malloc vector rendering, 16kHz wind and chime audio synthesis, 100% host unit test coverage, and an Alex Arcade browser cabinet.

- Added Wave Walker: Lo-Fi Surf, a cute, zero-frustration surfing title designed for the 3-button (UP/DOWN/OK) AI Passport handheld. Features a dual-harmonic continuous sine wave mathematical model, 3-button surfing mechanics (down-slope pump boost, crest launch leap, mid-air 360° stunt flips, and perfect clean entry alignment assist with secondary speed burst), dynamic floating obstacles (crabs, driftwood, and jellyfish), starfish and shell collectibles, 40 FPS zero-malloc vector rendering, 16kHz ocean wave audio synthesis, 100% host unit test coverage, and an Alex Arcade browser cabinet.

- Added Paws Sprint: Fluffy Runner, a zero-frustration healing pet obstacle runner designed for the 3-button (UP/DOWN/OK) AI Passport handheld. Features 4 selectable fluffy companions (Corgi, Shiba, Seal, Penguin), 3-lane smooth switching, jump physics, zero-penalty comic banana peel 360° pirouette spins, Roomba bumps, bone and heart pickups, a 500m cushion dive with feather explosion, healing fortune cards, 40 FPS zero-malloc vector rendering, 16kHz pet sound effect synthesis, and 100% host unit test coverage.

- Added Cyber Courier: Phantom Dash, a high-mobility cyberpunk infinite rooftop action runner designed for the 3-button (UP/DOWN/OK) AI Passport handheld. Features multi-tier rooftop abyss generation, mid-air Phantom Blink with zero-gravity phase-shift invulnerability and afterimages, double jump jet boost, ground slide under low obstacles, dive slam, pulse laser grids, security drone annihilation, fragile glass skylights, superconductor boost vents, and trailing dynamic neon scarf physics. Delivered with 40 FPS zero-malloc vector rendering, 16kHz cyberpunk synth audio, 100% host unit test coverage, and an Alex Arcade browser cabinet.

- Added Gear Cavalry: Steam Overdrive, a fast-paced steampunk horizontal action runner for the 3-button (UP/DOWN/OK) AI Passport handheld. Features rotating ground gear physics, 3-button multi-action state machine (Jump, Plunge, Slide, and Lance Thrust), 100 PSI steam pressure overdrive invincible charge, zero-malloc entity/particle pools, 40 FPS immediate-mode vector graphics, 16kHz retro steampunk audio synthesis, and an Alex Arcade browser cabinet.

- Added Cyber Match-3: Neon Pop, a high-performance tile-matching arcade title designed for the 3-button (UP/DOWN/OK) AI Passport handheld. Features zero-malloc deterministic state machine, 2-step directional neighbor swap, line laser and rainbow core syntheses, cascading gravity refills, and automatic deadlock reshuffling. Delivered with 40 FPS zero-DRAM immediate-mode vector rendering, 16kHz 8-bit retro audio synthesis, complete host unit tests, and an Alex Arcade browser cabinet.

- Rebuilt the Alex Arcade lobby: thirteen floor cabinets plus the world-clock lounge, pixel attract stills, a nightly/continue pick, keyboard coin-in, and cabinet high scores. Cabinets open the HD hub and standalone tables (`hub.html`, `thunder.html`, `flysaber.html`, `flydriver.html`); Fish, Roulette, and Match-3 stay on `game.html`.

- Added Hiding Fish, a pocket aquarium companion: talk or press OK and it swims up to look at you, tap the glass to peek it out of the weeds, blow into the microphone to startle it, and ignore it for a while (or leave it for hours) and it hides with only its tail showing. No hunger, no death. Firmware, host tests, and an Alex Arcade cabinet.

- Added Battle City Neo (1990 classic tank combat) with 8x8 sub-tile destructible brick physics, steel penetration at tier 4, eagle base protection, 7 bonus powerups, 16kHz retro chiptune audio synthesis, zero-config ESP-NOW wireless dual-device co-op, and browser simulator integration in `simulator/game.html` and `arcade/`.
- Added the Alex Arcade public lobby under `arcade/`: a cabinet-wall homepage for the playable titles plus the world-clock lounge, with GitHub Pages redirects from the repository root and `simulator/index.html`.
- Thunder Racer firmware HUD now shows near-miss combo streaks and switches the track palette at night.

- Added the supplied 80-byte CW2017 profile for the specified 520 mAh cell, including content/update-flag checks, verified writes, the required restart sequence, and bounded SOC-readiness polling.

- Expanded the environment bootstrap document: added Espressif's Git service mirror (`git.espressif.com.cn`) as the preferred mainland-China route for ESP-IDF v5.5.3 and its submodules, documented submodule long-wait/timeout handling, in-place repair, and the pinned-commit shallow fetch for large submodules such as `esp32-wifi-lib`, warned about stale per-repository Jihulab `insteadOf` residue, and added the official offline release archive as a last-resort fallback (learned from `esp-mosaico/esp-mosaico-vibe`).

- Reorganized the documentation by function area with a dual entry point: the root `AGENTS.md` is now a thin router (hard constraints + task routing only) and the detailed AI workflow lives in `docs/development/ai-guide.md`; `agent-guide.md` was folded in. `docs/development/` gained a second level (`engineering/`, `ci/`, `release/`), and the `plays/` application archive and `experiences/` moved into a `docs/reference/` area with a dedicated README. Removed `docs/software-design/` (empty scaffold); folded the three `assets/{fonts,images,music}/README` leaves into the `assets/` README; flattened the six `project-completion` sub-documents into a single file; and unified each directory to a single README, eliminating every `INDEX` file and a duplicated experience index. All cross-references and bibliographic links were updated; no content was dropped.

- Removed the obsolete app/test partition at `0x700000` and its related
  bootloader, validation, and documentation requirements. The fixed protected
  `cardid` partition and its CI checks remain unchanged.
- Documented a release-title convention for multi-app releases: name tags as `v<version>-<app-name>` (e.g. `v0.1.0-voice-keychain`) so the release title carries the version and the app, and confirm the title after the release is published so a release list is scannable by app.
- Added a post-release follow-up workflow: an `issue-suggestions` skill for filing user feedback as issues against the upstream project, an `experience-pr` skill for submitting reusable development experience as a documentation PR, a `docs/experiences/` directory for per-entry experience files, and supporting `project-completion`, `file-issues`, and experience-index documents.
- Simplified the tracked repository root: moved GitHub-recognized community documents into `.github/`, moved the changelog into `docs/`, updated every reference, and added a root-document allowlist to repository checks.
- Repository-wide language policy: every maintained Markdown default `.md` file is English, Simplified Chinese uses a paired `.zh_CN.md`, and both provide language switches. Static checks reject missing peers, missing switches, and Chinese prose in English defaults.
- Phase one of the AI development workflow: streamlined task-based context routing, unified local/CI validation, added PR checks and a template, and committed the dependency lock for reproducible builds.
- PR review fixes: pinned GitHub Actions to full commit SHAs, split build/release jobs by least privilege, disabled persisted sync checkout credentials, added Feature Request and Usage Question forms, clarified private security-report fallback, and corrected stale README, CI-trigger, and branch descriptions.
- Changed commit titles, PR titles, and PR bodies from Chinese-default to English; updated the Chinese punctuation rule so it no longer applies to PR descriptions.
- Reworked `build-firmware.yml` to pass `SDKCONFIG_DEFAULTS=sdkconfig.defaults`, enable `partitions.csv`, preserve the 8 MB image header, merge a flashable `FoloToy-AI-Passport-full.bin`, publish only that artifact, and use Actions cache v5.
- Integrated upstream PR #6 to resolve PR #4 conflicts: Wi-Fi, Bluetooth LE, radio lifecycle, and low-power demos; a 3 MB factory partition; build/menu/configuration updates; hardware-guide coverage; and bilingual capability tables.
- Defined English imperative Conventional Commit formatting for both commits and PR titles.
- Removed stale sync-workflow template comments and generalized an irrelevant Redis TTL rule to cache components.
- Added Chinese punctuation, credential safety, and recoverable file-deletion conventions.
- Expanded source-comment requirements for functions, state, ownership, concurrency, timing, registers, and magic values.
- Removed AI execution instructions from product READMEs so they remain human-facing product and repository overviews.
- Added `docs/development/agent-guide.md` as the focused AI workflow guide.
- Updated `AGENTS.md`, `docs/INDEX.md`, and the development index for the agent guide.
- Documented why the root README path is reserved for fork owners and how GitHub README precedence supports it.
- Created `main-update` from the upstream-aligned baseline and combined the repository-structure, firmware-CI, and upstream-sync work.
- Corrected the merged documentation index, workflow path, project tree, and CI references.
- Moved CI documentation from software design to `docs/development/`.
- Moved fork-only documentation assets from `assets/docs/` to `docs/assets/`.
- Moved the upstream English/Chinese project READMEs under `docs/` and renamed the documentation catalog to `docs/INDEX.md`.
- Initialized `AGENTS.md`, `CLAUDE.md`, and `CHANGELOG.md`.
- Standardized the initial project README language filenames.
- Added the `docs/`, `assets/`, and `skills/` directory structure.
- Moved the upstream hardware guide into `docs/hardware-design/`.
- Standardized subdirectory README capitalization and introduced fork conventions.
- Allowed fork-owned root README and supplemental documentation content on fork `main`.
- Added and documented the fork-only supplemental-document directory.
- Moved the build CI document to its dedicated CI branch before consolidation.
- Documented clean-`main` reasons, the direct-development exception, and Actions enablement for forks.
- Split the original agent rules into contribution, development, and fork documents with a compact root index.
- Updated software-design and project README references for the new documentation structure.
- Added the documentation catalog and task-triggered routing based on the earlier repository model.
- Added bilingual contribution, code-of-conduct, security, and support documents tailored to this ESP-IDF and fork workflow.
