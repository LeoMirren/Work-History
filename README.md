# Voxelheim

An infinite, procedurally generated voxel sandbox that runs entirely in your
browser — no backend, no asset files, no frameworks. Mine a tiered tech tree,
survive hungry nights against ranged and melee mobs, light caves with real
flood-filled lighting, cross biomes from jungle to snow, and step through a
rift into a second dimension. Every texture is painted procedurally at boot;
it all saves locally.

> _Screenshot placeholder — run the game and take one! (F3 overlay shows live
> performance metrics.)_

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

Pick a seed (or keep the random one), hit **Play**, click to capture the
mouse. `npm run build` type-checks and produces a static bundle in `dist/`
(serve with `npm run preview`); `npm test` runs the vitest suite.

## Controls

| Input | Action |
|---|---|
| **W/A/S/D** | move |
| **Space** | jump / swim up / fly up |
| **Shift** | sneak / fly down |
| **Ctrl** (or double-tap **W**) | sprint |
| **F** | toggle fly |
| **Mouse** | look (pointer lock) |
| **Left click** | break block |
| **Right click** | place block |
| **1–9 / wheel** | hotbar selection |
| **Left click** | break / hunt / fight |
| **Right click** | place / eat / plant sapling / use furnace, chest, rift |
| **E** | inventory & crafting (survival) |
| **G** | guide book (controls + every recipe) |
| **Tab** | status panel (health, hunger, biome time, threats) |
| **F3** | debug overlay |
| **Esc** | pause menu |

## What's inside

- **Infinite terrain** from seeded simplex noise: continents, mountains,
  beaches, oceans, snow caps, two cave systems (rooms + winding tunnels),
  trees, and **biomes** — plains, forest, desert, savanna, snowy, and dense
  **jungle**. Same seed → byte-identical world, always.
- **Procedural everything**: every block and item texture is painted at boot
  onto a canvas atlas from a seeded PRNG. Zero asset files, zero downloads.
- **A real voxel light engine**: flood-filled sky light (caves are genuinely
  dark, forest floors dappled, water dims with depth) plus block light from
  lanterns and glowing ore — smoothed per vertex and combined in a tiny
  custom shader with baked face shading and ambient occlusion, so lantern
  light keeps glowing through the night. No scene lights, no normals.
- **A mining tech tree**: coal, iron, copper, gold, and deep gem geodes, each
  gated behind the right pickaxe tier (wood → stone → copper → iron → gold →
  gem). Smelt ore in a furnace (with fuel) into ingots; craft up the ladder.
- **Survival loop**: hearts and a hunger bar, fall damage (water breaks a
  fall), eat hunted meat to refill hunger, natural regen when well-fed,
  starvation when empty, a damage vignette, and a death screen. Renewable
  wood via saplings.
- **Creatures**: two flocking passive species that favour their biomes
  (woollies in the cold, trundlers in the green), plus night mobs — melee
  stalkers that chase you and ranged spitters that lob projectiles, all
  burning off at dawn.
- **Building & storage**: a 36-slot inventory with a click/right-click held
  cursor, stacking and drops, placeable chests with their own inventories,
  furnaces, and lanterns.
- **A second dimension**: craft a **riftframe**, right-click it, and travel to
  the **underworld** — an enclosed ashstone cavern realm lit by emberrock,
  always dark and dangerous, with its own per-dimension save data.
- **Local persistence**: edited chunks (RLE-compressed) plus player and world
  state autosave to IndexedDB every 10s; reload and pick up where you left off.
- **Polish**: day/night with synced sky/fog, drifting clouds, sprint FOV kick,
  an in-game guide (G), a status panel (Tab), and synthesized block sounds.

## Architecture

```
src/
  main.ts                 bootstrap & orchestration: title → session, pause, autosave
  engine/loop.ts          fixed-step accumulator (60Hz physics, rAF render)
  engine/renderer.ts      three.js scene/camera/fog wrapper (no lights)
  engine/atlas.ts         seeded procedural texture atlas (pure pixels + canvas blit)
  engine/daynight.ts      480s cycle → brightness, sky/fog lerp
  engine/input.ts         pointer lock, key state, drained edge events
  engine/debug.ts         window.__debug metrics + fps counter
  world/blocks.ts         block registry → flat lookup tables
  world/chunk.ts          16×128×16 chunks, index math i = x + (z<<4) + (y<<8)
  world/worldgen.ts       pure (seed, cx, cz) → Uint8Array
  world/mesher.ts         pure padded-snapshot → 3-pass geometry with AO
  world/world.ts          chunk map, streaming, edits, getBlock/setBlock
  world/raycast.ts        Amanatides–Woo voxel DDA
  world/noise.ts          cyrb128 + mulberry32 + seeded simplex
  player/physics.ts       pure AABB integration & per-axis resolution
  player/controller.ts    input → intent → integration
  player/interaction.ts   targeting, break/place, outline
  workers/worker.ts       gen + mesh jobs (all buffers transferred)
  workers/pool.ts         worker pool behind a JobPool interface
  persist/rle.ts          chunk RLE codec
  persist/store.ts        IndexedDB / in-memory storage backends
  ui/hud.ts               crosshair, hotbar, debug overlay
  ui/menu.ts              title + pause menus, settings
tests/                    vitest — all pure modules, no DOM/WebGL needed
```

**Data flow.** The main thread owns chunk data and the scene. Workers do the
heavy lifting: `gen` jobs turn `(seed, cx, cz)` into a 32KB block array;
`mesh` jobs take a 48×128×48 snapshot (the chunk centered in its 3×3
neighborhood), flood-fill both light channels over it, and emit indexed
geometry for up to three render passes (opaque / cutout / translucent
water). Every buffer crosses the thread boundary as a
transferable — zero copies. Block edits skip the workers entirely and remesh
the affected chunks synchronously for same-frame feedback.

**Streaming.** Chunk data is kept for Chebyshev radius RD+1, meshes for RD,
everything past RD+2 unloads (geometry disposed; unmodified data discarded —
regeneration is cheap, edited chunks are persisted). Jobs dispatch closest
first, ≤6 in flight; at most 2 new geometries upload per frame.

**Why it's fast.** Three shared chunk shader materials for the whole world
(the texture atlas + two baked vertex channels carry everything), no scene
lights or normals,
numeric chunk-map keys, preallocated hot-path objects (zero steady-state
allocations per frame), and one draw call per chunk-pass with per-mesh
frustum culling. The F3 overlay (also `window.__debug`) reports fps,
position, chunk counts, queue depths, draw calls, triangles and live
geometry count so you can watch the budgets hold.

## Performance budgets (spec §7, at render distance 8)

| Budget | How it's enforced / verified |
|---|---|
| ≥55fps sustained, ≤8ms script/frame | no lights, 3 shared materials, alloc-free loops — verify live via F3 |
| ≤700 draw calls | ≈1–3 passes per chunk × ~289 chunks, frustum-culled |
| ≤2 geometry uploads/frame | upload queue throttle (`world.ts`) |
| ≤6 worker jobs in flight | dispatch gate (`world.ts`) |
| Spawn interactive <3s at RD4 | distance-ordered queues, workers saturate cores |
| Geometries plateau on long flights | disposal on unload, integration-tested |

## Persistence model

IndexedDB database `voxelgame`, store `worlds` (key `default`: seed, player
position/rotation, settings, time of day) and store `chunks`
(`"cx,cz"` → RLE bytes). Only modified chunks are ever written; persisted
chunks override generation on load. Autosave every 10s (dirty chunks only),
on `beforeunload`, and via the pause menu's Save.

## Development notes

- `npm test` — 200+ tests over the pure core: chunk index math, worldgen
  determinism (checksummed), mesher culling/AO/winding, raycast DDA, AABB
  physics, RLE codec, placement rules, survival fall damage and break times,
  plus headless streaming/persistence integration through a synchronous
  worker-pool stand-in.
- `DECISIONS.md` logs every judgment call made against the spec;
  `PROGRESS.md` tracks the milestone acceptance checklist.
- Dependencies are deliberately minimal: `three` + `simplex-noise` at
  runtime; TypeScript strict mode throughout; no frameworks.
