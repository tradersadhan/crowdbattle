# Crowd Battle 3D

A complete 3D mobile crowd-runner game for portrait phones. Grow your **blue army** through **+1 / +10 / +99 / ×2 / ×3 gates**, shoot the **red crowd**, blow up barrels and defeat **giant bosses**.
Built with **HTML5 + CSS + JavaScript + Three.js** and the **Web Audio API**. No login, no internet needed to play, progress is saved on the device.

Developer: **TK Sadhan**

## Features

- **1000 levels**, 5 themes, a **giant boss at the end of EVERY level** (each with its own colours)
- Long levels (~85-105 seconds of running + the boss fight): the road is packed with **three red hordes after every gate**, so you always see red enemies on the road
- Your crowd stands still: swipe left / right to move, it shoots automatically (keyboard A/D or arrows on desktop)
- The road scrolls towards you and **red hordes fill the whole road width** and march at your crowd; a horde follows every gate
- Giant **boss with a hammer**: he raises it, smashes the ground and the shockwave **flings your soldiers into the air**
- Nothing (enemies, crowd, boss, flying soldiers) ever leaves the road
- Gates (+1, +10, +99, ×2 … ×5, and bad −5/−10/÷2 gates), enemy crowds, explosive barrels, coins
- Clean boss entrance: nothing hangs over the end of the road, the boss walks in from far away
- After a win the crowd stands still (no jumping)
- Shop with 5 upgrades (fire rate, damage, start crowd, multishot, coin bonus), stars, score, best score
- Main menu, level select, pause / resume / restart, result screen
- Instanced 3D soldiers (a whole crowd = one draw call), adaptive resolution and a 30 FPS battery-saver for low-end Android
- Dark road + cool backgrounds, shiny gold coins (no shadow under them)
- Installable (PWA) and works offline after the first load

## Audio

All sounds are **real audio files** in `assets/audio/` (16-bit mono WAV, 22.05 kHz, ~2.8 MB total), synthesized by `tools/gen_audio.py`. They are original, generated from scratch, so they are royalty-free and need no attribution.

| Need | File(s) |
|---|---|
| Gameplay music | `bgm_game.wav` (loop) |
| Boss battle music | `bgm_boss.wav` (loop, starts when the boss appears) |
| Menu music | `bgm_menu.wav` |
| Running footsteps | `footstep.wav` |
| Gun shooting | `shoot.wav`, `shoot_heavy.wav` (big crowds) |
| Bullet impact / enemy hit | `hit.wav`, `enemy_hit.wav` |
| Crowd joining (+1 / +10 / +99) | `join_small.wav`, `join_medium.wav`, `join_large.wav` |
| Gate activation | `gate.wav`, `gate_bad.wav` |
| Enemy attack | `enemy_attack.wav`, `boss_roar.wav` |
| Explosions / destruction | `explosion.wav`, `explosion_big.wav`, `destroy.wav` |
| Coin | `coin.wav` |
| Victory / game over | `victory.wav`, `gameover.wav` |
| Buttons and menus | `click.wav`, `menu.wav`, `back.wav`, `upgrade.wav`, `error.wav`, `countdown.wav`, `go.wav` |

**Settings → Music / Sound Effects:** separate volume sliders and separate mute buttons (also available on the pause screen). Values are saved in `localStorage`.

**Android compatibility:** the `AudioContext` is created and resumed on the first touch (browser autoplay rule), resumed again when the app returns to the foreground, uses a legacy-callback `decodeAudioData` fallback for old WebViews, and rate-limits spammy sounds. Music and SFX run on two separate gain buses behind a soft limiter, so they never clip.

To change or regenerate the sounds: edit `tools/gen_audio.py` and run `python3 tools/gen_audio.py` (needs `numpy`). You can also drop in your own `.wav` files with the same names.

## Run it

Three.js is loaded from `lib/three.min.js`. If that file is missing the game falls back to a CDN (needs internet on the first load, then it is cached for offline play).

```bash
sh tools/fetch-three.sh          # one time: downloads Three.js r128 into lib/
python3 -m http.server 8080      # then open http://localhost:8080 on the PC or phone (same Wi-Fi)
```

(Opening `index.html` directly from disk will not load the audio files; use a local server.)

## Deploy to GitHub Pages

1. Create a new GitHub repository and upload every file in this folder (keep the folder structure, including `.github/` and `.nojekyll`).
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The workflow `.github/workflows/pages.yml` downloads Three.js into `lib/` and publishes the site.
4. Open `https://<your-user>.github.io/<repo>/` on your Android phone. Chrome menu → **Add to Home screen** to install it fullscreen.

## Test

```bash
node tools/headless-test.js       # plays a spread of levels 1..1000 with an auto-pilot (logic only, no browser)
node tools/browser-test.js        # real Chromium: audio decode/unlock, mute + volume, save/reload, pause, results
```

## Project layout

```
index.html            screens + HUD markup
css/style.css         UI styling
js/storage.js         local save (coins, upgrades, stars, progress)
js/audio.js           Web Audio manager (music/SFX buses, mute, volume, unlock)
js/levels.js          level data and themes
js/gfx.js             procedural 3D models, textures, scenery
js/game.js            game loop, crowd, gates, combat, boss, camera
js/ui.js              menus, shop, settings, flow
assets/audio/         28 generated sound files
sw.js, manifest.json  offline / installable app
tools/                audio generator, tests, Three.js fetch script
```

## How to play

Drag left/right to move your crowd (it never runs forward, the road comes to you). It shoots automatically. Pick the better gate (green ×, blue/yellow +; avoid red −), shoot the red hordes before they reach you, shoot barrels next to enemies, grab the coins, and empty the boss's health bar before his hammer smashes your army. Spend coins in the shop.

## Updating an installed copy

After uploading the new files to GitHub and the Pages deploy finishes, open the game once with internet and fully close/reopen it (the cache version in `sw.js` is bumped on every update). If an old version still shows, clear the site data in Chrome or reinstall the home-screen app.
