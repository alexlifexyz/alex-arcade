<p align="right">
  <a href="new-game-guide.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

# Adding a Game

This document is the repeatable path from an idea to a title that runs on the
device and in the browser arcade. It also describes how to run that path
together with a child, which is a first-class use case for this repository
rather than an afterthought.

Read [`ai-guide.md`](ai-guide.md) for the general AI development workflow and
[`../hardware-design/AI_HARDWARE_DEVELOPMENT_GUIDE.md`](../hardware-design/AI_HARDWARE_DEVELOPMENT_GUIDE.md)
for the hardware facts. This document only covers the game-shaped work.

## The two-layer rule

Every title in this repository is split in two, and the split is what makes the
games testable, portable, and safe to iterate on:

| Layer | File | May use | Must never |
| --- | --- | --- | --- |
| Model | `main/<game>_logic.c` / `.h` | C11, `<math.h>`, fixed-size arrays | Touch LVGL, touch ESP-IDF, call `malloc`, read the clock itself |
| View | `main/demo_<game>.c` | LVGL, BSP audio, the model's public API | Keep game state of its own, block in a button callback |

The model advances only when the view hands it a time delta, and it exposes
plain data the view reads. That is why 30 host test suites run on a laptop with
no hardware attached, and why the same model can be driven by a browser build.

## The files one game touches

```text
main/<game>_logic.h       Tuning constants, the state struct, the public API
main/<game>_logic.c       The model: pure, deterministic, zero allocation
main/demo_<game>.c        The LVGL page: draw, input mapping, teardown
main/demo.h               Three declarations for the page
main/CMakeLists.txt       Both new .c files added to SRCS
main/game_catalog.c       One row: id, display name, category
main/game_registry.c      One row at the same index: enter / exit / key
tests/test_<game>_logic.c Host test, auto-discovered by the gate
simulator/catalog.js      The browser cabinet entry
docs/CHANGELOG.md         One line, because this is a user-visible change
```

`tools/validate.sh` pairs `tests/test_<name>.c` with `main/<name>.c` by
convention, so a new test joins the gate the moment both files exist. Nothing in
the validation script needs editing.

## The path

### 0. Write the spec card first

One short card, before any code. The card is the contract; it is also what makes
the work explainable to a child or a reviewer.

```text
Name:        what it is called
One line:    what the player does, in one sentence
Controls:    UP / DOWN / OK — exactly what each button does
Win:         what makes the score go up
Lose:        what ends the round, and whether anything is punished
Three dials: the three numbers we expect to tune (speed, count, reward)
```

Three buttons is the hard constraint. If the card needs a fourth action, the
idea has to change, not the hardware.

### 1. Copy the template

[`main/game_template_logic.h`](../../main/game_template_logic.h) and
[`main/game_template_logic.c`](../../main/game_template_logic.c) are a complete,
playable fruit-catch model: three lanes, a basket, falling fruit, bombs, lives,
levels, a seeded RNG, and a fixed object pool. The template is not registered in
the firmware menu, but it is covered by
[`tests/test_game_template_logic.c`](../../tests/test_game_template_logic.c), so
it stays compilable and correct and never rots.

Copy all three files, rename the `tpl_` prefix, and keep the shape: a tuning
block at the top of the header, a context struct, a `_ctx` API for tests, and a
default-instance API for the view.

### 2. Make the model true before making it pretty

Write the test alongside the model, not after. The template's test is the model
to follow: drive the state machine directly, place entities by hand for
deterministic assertions, and cover the boring cases — start, boundary clamping,
scoring, losing, game over, high-score retention, the same seed replaying the
same round, and NULL guards.

```bash
cc -std=c11 -Wall -Wextra -Werror -Imain \
  tests/test_mygame_logic.c main/mygame_logic.c -lm -o /tmp/t && /tmp/t
```

### 3. Write the view

Copy the nearest existing page. `main/demo_match3.c` is a compact grid page,
`main/demo_flappy.c` a compact side-scroller, `main/demo_battlecity.c` a larger
one. Rules the device enforces:

- Draw with immediate-mode vector calls, do not allocate per frame.
- Keep the button callback non-blocking: translate the key and return.
- Hold `bsp_lvgl_lock()` for any LVGL access from outside the LVGL task.
- On exit, stop every task, timer, and callback that can reach the UI *before*
  deleting the screen.
- Read the model's one-shot effect counters for sound and particles, then clear
  them.

### 4. Register it

Add both sources to `main/CMakeLists.txt` and declare the three page functions
in `main/demo.h`. Then add one row to `main/game_catalog.c` — id (the same id
the browser cabinet uses), the display name (at most `GAME_NAME_MAX_CHARS`
characters, which the host test enforces), and the category — and one row at the
same index of `main/game_registry.c` with `enter` / `exit` / `key`. The catalog
is grouped by category, because an `OK` long-press in the menu jumps to the next
category; put the new row inside its category's block.

`main/main.c` holds menu behavior only. It never holds the game list, so there
is nothing to edit there.

### 5. Add the browser cabinet

Add one entry to [`simulator/catalog.js`](../../simulator/catalog.js) with the
pitch, the control legend, three missions, and the rank thresholds. The browser
arcade is the fastest way to let someone play the idea before a device is
flashed.

### 6. Run the gate

```bash
./tools/validate.sh --static
```

The firmware half of the gate needs an activated ESP-IDF 5.5.3 environment. When
there is none, push the branch and let the firmware workflow build it, then
report the build and the device checks separately, as
[`AGENTS.md`](../../AGENTS.md) requires.

## Creating together with a child

The repository is a good fit for a seven- or eight-year-old collaborator because
the model layer is pure arithmetic with named numbers, and the browser arcade
gives a result in seconds. The structure below is what keeps a session fun
rather than frustrating.

**Their job and your job.** The child owns the spec card, the three dials, and
the verdict ("too fast", "too boring", "the bomb is mean"). You own the code,
the tests, and the gate. Never hand over the keyboard for the parts that fail
loudly; hand over the parts where a wrong answer is still interesting.

**One dial at a time.** Every game header starts with a block of tuning
constants in plain language. Change exactly one, rerun, play, decide. Two
changes at once teaches nothing because the result cannot be attributed.

**Keep the frustration at zero.** This repository already leans that way and a
child's game should lean harder: missing a pickup costs nothing, only an actual
mistake costs a life, the round is short, restarting is one button, and the
score never goes down. The template follows these rules on purpose.

**Finish something every session.** A session that ends with a playable change
is worth more than a session that ends with better architecture. Target one of:
a new dial value that feels better, one new pickup, one new sound, one new
colour, or one new mission in the browser cabinet.

**Let them name it.** The name, the mascot, and the three missions are the parts
a child will remember and show other people. Put their name in the changelog
entry.

## Checklist

- [ ] Spec card written, and three buttons are enough
- [ ] Model has no LVGL, no ESP-IDF, no allocation, no clock of its own
- [ ] Host test covers start, boundaries, scoring, game over, replay, NULL
- [ ] View stops every task and timer before deleting its screen
- [ ] Both sources in `main/CMakeLists.txt`, one row each in
      `main/game_catalog.c` and `main/game_registry.c`, at the same index
- [ ] Browser cabinet entry added
- [ ] `./tools/validate.sh --static` passes
- [ ] One changelog line in `docs/CHANGELOG.md`
