<p align="right">
  <a href="README.zh_CN.md">简体中文</a> · <strong>English</strong>
</p>

#  Alex Arcade Game Hub for FoloToy AI Passport

> A vibrant collection of retro arcade classics and delightful pet runner games built for **FoloToy AI Passport**! Every game features a **dedicated landing page** and clean 3-button arcade controls.

![Arcade Hall](arcade/assets/hall.jpg)

---

##  Game Index (Dedicated Shareable URLs)

Every game has its own dedicated directory and page. Share any link below directly with friends:

| Game | Folder / Slug | Genre | Direct Link |
| :--- | :--- | :--- | :--- |
| [ **Paws Sprint: Fluffy Runner**](games/paws-sprint/README.md) | `paws-sprint` | Pet Runner / Reflex Arcade | [ Play Online (Pending)](https://ai-passport.folotoy.cn/play/community-3133e9da) |
| [ **Cyber Courier: Phantom Dash**](games/cyber-runner/README.md) | `cyber-runner` | Rooftop Action Runner | [ Details](games/cyber-runner/README.md) |
| [ **Gear Cavalry: Steam Overdrive**](games/gear-cavalry/README.md) | `gear-cavalry` | Steampunk Action Runner | [ Details](games/gear-cavalry/README.md) |
| [ **Neon Pop: Cyber Match-3**](games/neon-pop/README.md) | `neon-pop` | Neon Match-3 Puzzle | [ Details](games/neon-pop/README.md) |
| [ **Battle City 1990**](games/battle-city/README.md) | `battle-city` | Tactical Tank Combat | [ Details](games/battle-city/README.md) |
| [ **Adventure Island**](games/adventure-island/README.md) | `adventure-island` | Classic Platformer | [ Details](games/adventure-island/README.md) |
| [ **Contra**](games/contra/README.md) | `contra` | Run and Gun Shooter | [ Details](games/contra/README.md) |
| [ **Thunder Racer**](games/thunder-racer/README.md) | `thunder-racer` | Highway Speed Racer | [ Details](games/thunder-racer/README.md) |
| [ **Thunder Striker**](games/thunder-striker/README.md) | `thunder-striker` | Vertical Shmup / Bullet Hell | [ Details](games/thunder-striker/README.md) |
| [🟡 **PAC-MAN Neo-Neon**](games/pacman/README.md) | `pacman` | Maze Action Arcade | [ Details](games/pacman/README.md) |
| [ **Flappy Bird HD**](games/flappy-bird/README.md) | `flappy-bird` | Precision Tap Arcade | [ Details](games/flappy-bird/README.md) |
| [ **Fish Hunter: Ocean Survival**](games/fish-hunter/README.md) | `fish-hunter` | Ocean Survival | [ Details](games/fish-hunter/README.md) |
| [ **Cyber Roulette**](games/cyber-roulette/README.md) | `cyber-roulette` | Party Game / Decision Wheel | [ Details](games/cyber-roulette/README.md) |
| [ **Tetris Retro**](games/tetris/README.md) | `tetris` | Falling Blocks Puzzle | [ Details](games/tetris/README.md) |
| [ **Tamagezi Virtual Pet**](games/tamagezi/README.md) | `tamagezi` | Virtual Pet Simulation | [ Details](games/tamagezi/README.md) |
| [🪵 **ColorOS Wooden Fish**](games/coloros-muyu/README.md) | `coloros-muyu` | Zen Meditation / Cyber Muyu | [ Details](games/coloros-muyu/README.md) |
| [ **White Rabbit Mascot**](games/white-rabbit/README.md) | `white-rabbit` | Desktop Mascot Pet | [ Details](games/white-rabbit/README.md) |

---

##  Multi-Cart Arcade Firmware

This branch provides a unified **9-in-1 Arcade Launcher** firmware:

1. **Boot into Arcade Menu**: Browse games using **UP** / **DOWN** keys.
2. **Short press OK**: Launch the highlighted game.
3. **Long press OK (1.5s)**: Exit the current game and return safely to the arcade launcher anytime.
4. **Fully Offline**: 100% local execution—zero Wi-Fi setup needed.

---

##  Build & Flash Locally

```bash
# 1. Activate ESP-IDF 5.5.3 environment
. $HOME/esp/esp-idf/export.sh

# 2. Build complete merged image
./tools/validate.sh --firmware

# 3. Flash to connected device
esptool.py --chip esp32c3 -b 460800 write_flash 0x0 build/FoloToy-AI-Passport-full.bin
```

---

##  License

Licensed under Apache-2.0. For underlying BSP details and hardware documentation, see [docs/README.md](docs/README.md).
