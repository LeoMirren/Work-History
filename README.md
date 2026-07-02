# WORKSONG

*the ballad of Tristan — a Hollow Knight–style metroidvania where the kingdom is your career.*

A one-of-one, fully hand-built action platformer in pure HTML5 canvas and vanilla
JavaScript. No engine, no assets, no dependencies, no build step. Every sprite is
drawn in code, every sound is synthesized live in WebAudio, and every word of lore
is about the long, strange business of building things for a living.

## ▶ How to play

**Option 1 — just open it:** download/clone this repo and double-click `index.html`.
It runs straight from disk in any modern browser (Chrome/Edge/Firefox/Safari).

**Option 2 — local server (recommended):**

```bash
git clone -b claude/hollow-knight-stat-format-otqq33 https://github.com/LeoMirren/Work-History.git worksong
cd worksong
npx serve .        # or: python3 -m http.server 8000
# open http://localhost:3000 (or :8000)
```

## ⌨ Controls

| Action | Keys |
|---|---|
| Move | ← → or A / D |
| Jump (hold = higher) | Z or Space |
| Strike (aim with ↑ / ↓) | X or J |
| Dash | C or Shift |
| Cast spell (tap) / Focus & heal (hold) | V or K |
| Talk · Read · Rest · Shop | ↑ or W (when prompted) |
| Pause · Trinkets · Map | Esc or P |
| Mute | M |

Down-strike in midair to **pogo** off enemies and spikes — it refreshes your dash
and double jump. Striking foes builds **SOUL**; hold V while standing still to
channel it into healing, or tap V to hurl a Vengeful Query once you've found it.

## 🗺 The Kingdom

Descend through six regions of your working life — **The Foyer**, **The Archives**,
**The Foundry**, **The Deep Stacks**, and **The Overclock**, until you reach
**The Quiet Dawn**:

- **4 relics** gate your progress, metroidvania-style: the Momentum Cloak (dash),
  the Grip of Iteration (wall jump), the Second Wind (double jump), and the
  Vengeful Query (spell).
- **5 trinkets (charms)** with a 3-notch cord — choose your build at any time
  from the pause screen.
- **2 bosses**: **THE IMPOSTER, echo of doubt** — an optional duel against a dark
  mirror of yourself beneath the Deep Stacks — and **BURNOUT, the Consuming
  Flame** at the bottom of everything.
- **The Mentor** waits along the way with staged dialogue; **The Recruiter** sells
  upgrades for geo (mask shards, a soul vessel, a trinket).
- Mask shards, a survival arena, lore tablets, benches that save your progress,
  and a **shade** that keeps your geo where you died — go win it back.
- An auto-mapping **kingdom map** on the pause screen.

Saves live in your browser (localStorage). "Continue" resumes at your last bench.

## ✍ Personalize it

Everything with a name, a color, or a line of lore lives in **`js/content.js`** —
area names and palettes, every lore tablet, the Mentor's dialogue, boss names,
charm flavor, the ending. Rename the areas after your real jobs, rewrite the
tablets with your own history, and the game becomes *your* work-song. Room
layouts are plain ASCII maps at the top of `js/world.js` — edit them with a text
editor, refresh the browser, and walk your new halls.

## 🛠 Architecture

| File | What it owns |
|---|---|
| `js/config.js` | every physics/tuning constant |
| `js/content.js` | **the personalization layer** — all names, lore, palettes |
| `js/input.js` | keyboard state with edge detection |
| `js/audio.js` | WebAudio synth SFX + generative ambient score |
| `js/world.js` | ASCII room maps, tile collision, parallax rendering |
| `js/entities.js` | enemies, bosses, NPCs, pickups, particles, projectiles |
| `js/player.js` | the knight: movement feel, nail combat, focus, damage |
| `js/ui.js` | HUD, title, pause/map, shop, dialogue, ending |
| `js/game.js` | game states, camera, rooms, encounters, saves |

Built barebones-up: raw canvas loop → platforming physics (coyote time, jump
buffering, jump cuts) → nail combat with hitstop and pogo → soul/focus →
ability-gated world → bosses, NPCs, economy → juice (particles, rings, screen
shake, ghosts, generative audio).
