<p align="right">
  <a href="README.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

# Alex Arcade

Public playground for the AI Passport game collection: 26 titles in the browser, all played with the handheld's three buttons (UP, DOWN, OK). Every title was remade in 2026 on one shared engine, each with its own goal, three missions, and S/A/B/C ranks.

## Layout

```text
arcade/                 public homepage (this folder)
  index.html            lobby: live attract mode, daily challenge, featured rail, library
  assets/               hall photos, coin token, passport photo
simulator/              playable pages
  play.html             the single game page (every title opens here: play.html?id=<id>)
  arcade-kit.js         shared engine: fixed 60 Hz loop, input, audio, FX, saves, title/pause/result shell, demo sandbox
  catalog.js            the only game list: names, controls, tips, missions, rank thresholds
  games/*.js            one file per title
  games-engine.js, games-impl.js, games-new-impl.js, games/legacy.js
                        the pre-2026 implementations; no page loads them any more and they can be deleted
  game.html, hub.html, thunder.html, flysaber.html, flydriver.html, paws-sprint.html
                        redirects to play.html so old links keep working
```

Open `arcade/index.html` next to `simulator/` through a static server. The lobby thumbnails and the attract screen are the real games running in a muted sandbox, so there are no screenshot files to keep in sync.

## Adding a game

1. Add an entry to `simulator/catalog.js` (id, title, controls, missions, ranks).
2. Create `simulator/games/<name>.js` that calls `Arcade.define({ id, create(api) { return { update(input), draw(ctx) } } })`. Write live numbers to `api.stats` and call `api.end()` when the run is over; the shell handles the title card, pause, result card, missions, and high scores.
3. Add a `<script>` tag for the file to `simulator/play.html` and `arcade/index.html`.

Scores, stars, the local top five, and the last game played stay in this browser (`localStorage`).

## GitHub Pages and a custom domain

1. Enable GitHub Pages on this repository with the source set to the root of the default branch.
2. The root `index.html` redirects into `arcade/`.
3. To use a domain later, add a `CNAME` file in `arcade/` (or at the repository root if Pages is serving `/`) containing the hostname, then point DNS at GitHub.

No build step. The site is static HTML, CSS, and JavaScript.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/arcade/`.
