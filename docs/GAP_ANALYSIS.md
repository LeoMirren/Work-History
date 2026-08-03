# Gap Analysis — build spec vs Voxelheim

Mapping of the "Minecraft + Crazy Craft parity" spec onto the existing game.
Policy note applied throughout: parity of *depth*, not copies — every feature lands
with original names/art/values. Effort: S (<half day-equivalent), M, L.

## Phase snapshot

| Spec phase | Status | Notes / remaining |
| --- | --- | --- |
| 0 Audit | ✅ this doc + CURRENT_STATE.md | — |
| 1 Architecture | ✅ mostly | Registries are code-side const tables (typed, testable) rather than JSON — deliberate; JSON loading is an M if modability is ever wanted. Namespacing unnecessary until external content exists. Tick system: fixed-step + random-tick (crops) exist; scheduled fluid ticks L. |
| 2 Controls | ◐ | Have: sprint+FOV, swim, fall damage, fly, sensitivity/FOV sliders, debug overlay, trackpad aliases, quick-place keys. Missing: sneak (M), rebindable keymap UI (M), third-person camera (M), pick-block (S), drop-item key (S), auto-jump (S). |
| 3 Inventory/containers | ◐ | Have: cursor semantics (pick/place/swap/half), chests, furnace-gated smelting book, barter. Missing: shift-quick-move (S), drag-split (M), double-click collect (S), hover-swap number keys (S), tooltips (S), 4-piece armor (M), offhand (M), hoppers/automation (L), anvil/enchant/brew stations (L, see 6). |
| 4 Graphics | ◐→✅ | Have: 2-channel flood light + AO + smooth lighting, day/night sky w/ sun/moon/stars, weather, biome tint, water shimmer, particles, vignette, break cracks. Missing: animated texture frames (M), non-cube models — slabs/stairs/fences/doors (L, mesher shapes), third light channel none. 60fps target holds on GPU hardware (software-render probe ≠ target). |
| 5 Catalog | ◐ | ~40 blocks/~30 items vs spec's hundreds. Strategy: grow by system (each new system brings its set). Wood species variety (M), stone variants (S), wool/dyes (M), TNT (M), rails/boats (L). |
| 6 Progression | ◐ | Have: hp/hunger/armor-reduction, tool tiers ×6, food, goals. Missing: XP + levels (M), enchant-equivalent = **infusion** (L, planned next), potions = **brews** (L, planned), status-effect framework (M, prerequisite of both). |
| 7 Mobs/AI | ◐ | Have: goal-ish steering (flee/leash/waypoints/aggro/kite), herds, panic, 6 passive species + fish ×3 + 2 hostiles + guardians + wardens w/ barter. Missing: A* pathfinding (L), breeding (M), taming/pets (L, Crazy layer), boss framework + ≥1 boss (L, **next batch**). |
| 8 World/persistence | ✅ mostly | Have: seeded biome stack + per-seed shape, caves + cave biomes, dungeons/villages/etc., underworld dimension, IndexedDB saves, autosave. Missing: flowing fluids (L), multiple world slots (M), third dimension (L). |
| 9 Crazy layer | ◔ | Have: guardians w/ loot, loot chests, OP-ish gem tier. Missing (all original-flavored): post-gem gear tiers (M), giant boss ×3 w/ boss bar (L, **next**), loot fountains (S — drops system ready), meteor events (M), loot towers (M), capture-orb pets (L). |
| 10 Polish | ◐ | Have: title/pause/settings, HUD suite, minimap, goals, guide. Missing: command bar `/give …` (M — valuable for testing), world-slot select (M), volume sliders (S — audio is minimal), spectator (S). |

## Recommended order (impact-first)
1. **Boss framework + first boss** (underworld tyrant; boss bar UI) — Crazy centerpiece. [L]
2. **Status effects + brews + infusion** (one framework feeds both). [L]
3. **Combat depth**: blades, sling, loot fountains on boss death. [M]
4. **Inventory QoL batch**: shift-move, tooltips, drop key, pick-block. [M]
5. **Command bar** for `/give`-style testing. [M]
6. **Non-cube models** (slabs/stairs/doors) — biggest remaining visual/build gap. [L]
7. **Pets (capture orbs)** + breeding. [L]
8. Fluids, rails/boats, third dimension. [L each]
