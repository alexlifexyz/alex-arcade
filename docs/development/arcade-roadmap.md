<p align="right">
  <a href="arcade-roadmap.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

# Arcade Roadmap

This document records where the arcade stands, what actually blocks putting
every title on the device, and the order in which to do the remaining work. It
is a planning document: it states measurements and designs, and it does not
replace [`AGENTS.md`](../../AGENTS.md) or the validation gate.

For the repeatable process of adding one game, see
[`new-game-guide.md`](new-game-guide.md).

## Where things stand

The repository holds 27 game models in C and 26 browser cabinets. Of the 27
models, 15 are reachable on the device.

| Group | Count | State | What is missing |
| --- | --- | --- | --- |
| On the device | 15 | Model, view, build entry, catalog and registry row | Nothing |
| View written, out of DRAM | 2 | Model and view both exist | Internal RAM — see below |
| Model only | 10 | Model and host test exist | The LVGL view layer |

- **On the device (15):** Striker, Tank 1990, Contra, Island, Runner, Cavalry,
  Pac Neon, Racer, Paws Sprint, Wave Walker, Neon Pop, Wind Rider, Pixel
  Flappy, Shy Fish, Devil Roulette — listed in menu order, which is the
  catalog's category grouping.
- **View written, out of DRAM (2):** `flysaber` and `flydriver`. Both pages are
  finished, but `demo_flysaber.c` and `demo_flydriver.c` each hold a static
  240x250x2 = 120,000 byte canvas in `.bss`. Linking both pushes
  `dram0_0_seg` over by 129,680 bytes, so dropping only one is not enough.
  Their canvases have to become enter-time allocations released on exit, or get
  smaller, before they can come back. They are excluded from
  `main/CMakeLists.txt`, the catalog, and the registry; their `demo.h`
  declarations are kept.
- **Model only (10):** `pong`, `worldtime`, `sparkler`, `smash`, `bubble`,
  `huddle`, `splasher`, `laser_cat`, `bouncy`, `pawssprint_dx`. These are
  playable in the browser arcade, where the view lives in JavaScript.

All 27 models plus the template pass their host tests, so the gap is entirely in
the view layer and the menu, not in game correctness.

## What actually blocks 27 titles on the device

**It is not flash.** Every `*_logic.c` compiled at `-Os` for the host totals
about 271 KiB of text and data for all 27 models together, the largest single
model being about 17 KiB. The 17 existing view layers are roughly 11.5k lines
and the 10 missing ones would add roughly 6k lines, which puts the whole
27-title application layer in the region of half a megabyte against a 3 MiB
application partition. These are host-measured proxies, not a firmware
measurement; the authoritative number is the budget line that
`tools/verify_firmware.py` now prints on every build:

```text
Protected firmware layout: PASS (App budget: N / 3145728 bytes (X% used, Y KiB free))
```

Read that line before assuming there is or is not room. At 15 titles it reads
`1494896 / 3145728 bytes (47.5% used, 1612 KiB free)`, so flash has room for
roughly as much application again as the arcade currently is.

**The menu was the first real blocker, and it is cleared.** `main/main.c` used
to render every entry as a fixed card and shrink the card height as the count
grew; at 11 entries the cards were already 19 px tall on a 320 px screen. It is
now a fixed eight-row scrolling window with 24 px cards, so the card height no
longer depends on how many titles exist and the list scales to any count.

**Internal RAM, not flash, is the wall.** Registering six ready titles at once
overflowed `dram0_0_seg` by 129,680 bytes, measured by the CI firmware build.
The cause was two view layers holding a full-screen canvas in `.bss`, 120,000
bytes each. The models themselves are blameless: all 27 `*_logic.c` compile to
zero `.bss` on the host, because state lives in a struct the view owns. So the
question to ask of every new view layer is not "does it fit in flash" — it does
— but "what does it put in `.bss`". A full-screen 16-bit canvas does not fit on
a board with no PSRAM and roughly 320 KiB of SRAM shared with LVGL, Wi-Fi, and
NimBLE. Draw immediate-mode into the LVGL layer instead, the way
`demo_pacman.c` does with a `LV_EVENT_DRAW_MAIN` callback, or allocate the
canvas on entry and free it on exit.

**The remaining blocker is ten missing view layers.** Each is a self-contained
piece of work of roughly 400 to 900 lines, with no dependency on the others.

**A reserve of space exists if it is ever needed.** `demo_display.c`,
`demo_button.c`, `demo_audio.c`, `demo_battery.c`, `demo_wifi.c`, `demo_ble.c`,
and `demo_low_power.c` are compiled into the firmware but are not reachable from
the menu table, and `demo_ble.c` is the only reason the NimBLE host is linked.
Dropping the unreachable pages, and `bt` with them, would free a meaningful part
of the budget. Wi-Fi must stay: `demo_battlecity.c` uses ESP-NOW for its
two-device co-op. Do not remove anything on this basis until the budget line
shows the space is actually needed, and record the before and after numbers when
doing it.

## Design: split the game table in two (shipped)

The menu table used to be a literal array in `main/main.c`, which made `main.c`
the place a game was registered and left no way to check the firmware list
against the browser list.

It is now split:

```text
main/game_catalog.c / .h    Pure data: id, display name, category, flags
main/game_registry.c / .h   Function pointers: enter / exit / key per id
```

The catalog holds no ESP-IDF or LVGL types, so
[`tests/test_game_catalog.c`](../../tests/test_game_catalog.c) compiles it and
asserts that identifiers are unique and lowercase alphanumeric, that names are
unique and fit `GAME_NAME_MAX_CHARS`, that categories are valid, that the table
is grouped by category, and that the category jump lands on a category's first
entry and cycles. The registry stays firmware-only and is the single place a new
page is wired in, and `game_registry_validate()` logs any catalog/registry
mismatch at startup. `main.c` is back to menu behaviour only.

One assertion from this design is **not** in place yet: that every catalog
identifier also exists in
[`simulator/catalog.js`](../../simulator/catalog.js). `pacman` has no browser
cabinet, so the check would fail today, and a C host test cannot parse
JavaScript in any case. Adding a browser cabinet for `pacman` and then a Python
gate check that reads both tables belongs with P2.

## Design: a menu that holds 27 or more entries

The three buttons already had a free gesture. Inside a game, a long press on OK
returns to the menu; in the menu itself it used to do nothing.

- **Scrolling window (shipped).** Eight rows of 24 px cards at `y` 52 to 272,
  the selection kept inside the window, the window scrolling when the selection
  reaches an edge, wrapping at both ends, a `12/15` position badge beside the
  title plate, and the selected entry's category in the grass strip. The mascot
  sits at `y` 280, below the list rather than under it.
- **Category jump on long press OK (shipped).** The six categories the browser
  catalog defines, with the selection jumping to the first entry of the next
  category. Inside a game a long press on OK still returns to the menu; the two
  meanings never apply at the same time.
- **Remember the last choice.** The `nvs` partition at `0x9000` is available and
  untouched by the protected layout. Storing the last selected identifier, and
  later a per-game high score, makes the device feel like a console rather than
  a list. High scores on the device are the single feature most likely to make a
  child play twice.

## Phases

Each phase is independently shippable and ends with a green gate.

| Phase | Work | Result | Verification |
| --- | --- | --- | --- |
| P0 | Gate repaired, host tests auto-discovered, app budget line, game template with tests, this documentation | Groundwork | `./tools/validate.sh --static` |
| P1 | Scrolling menu, catalog/registry split, register the ready titles | 15 titles on the device | Firmware build plus the budget line, then one device pass |
| P1b | Shrink or heap-allocate the `flysaber` and `flydriver` canvases | 17 titles on the device | Firmware build plus the DRAM figure, then one device pass |
| P2 | The 10 missing view layers, in batches of two or three, simplest first (`pong`, `worldtime`, `sparkler`, then `smash`, `bubble`, `huddle`, `splasher`, `laser_cat`, `bouncy`, `pawssprint_dx`) | 27 titles on the device | Per batch: host tests, firmware build, device pass |
| P3 | NVS last-played and per-game high scores, category jump | Console feel | Host tests for the storage model, device pass for persistence across power loss |
| P4 | A permanent "my game" slot at the top of the menu holding the current template copy, so a child's work in progress is always one short press away | Co-creation loop | Device pass |
| P5 | Only if the budget line demands it: drop the unreachable reference pages and NimBLE, recording before and after sizes | Headroom | Budget line before and after |

P0 and P1 have shipped. P1b and P2 are next.

## Rules this roadmap does not relax

- The protected flash layout, the 3 MiB application limit, and `cardid` at
  `0x356000` stay exactly as they are.
- A successful build is never reported as hardware validation. Build, host
  tests, and device tests are reported separately.
- Every title keeps the model and view split and keeps its host test, including
  anything created with a child.
