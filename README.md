# Voxelheim

An infinite, procedurally generated voxel sandbox that runs entirely in your
browser — no backend, no assets, no frameworks. Walk an endless world, dig
caves, build with nine block types, and it all saves locally.

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
| **E** | inventory & crafting (survival) |
| **F3** | debug overlay |
| **Esc** | pause menu |

## What's inside

- **Infinite terrain** from seeded simplex noise: continents, hills, beaches,
  oceans, snow caps, 3D-noise caves and trees. Same seed → byte-identical
  world, always.
- **Procedural everything**: all 15 block textures are painted at boot onto a
  256×256 canvas atlas from a seeded PRNG. Zero asset files.
- **Creative-lite gameplay**: instant break, infinite blocks, fly mode, water
  swimming, AABB physics with exact-contact collision.
- **Lighting on the cheap**: per-vertex baked face shading and ambient
  occlusion (with the classic quad-flip anisotropy fix), one global
  day/night brightness multiplier and synced sky/fog colors. No scene
  lights, no normals.
- **Local persistence**: edited chunks (RLE-compressed) and the player state
  autosave to IndexedDB every 10s; reload and pick up where you left off.
- **Stretch extras**: sprint FOV kick, drifting blocky clouds, an optional
  survival mode (hearts, hunger, fall damage, timed breaking — tick the box
  on the title screen), ore veins to mine, hostile mobs after dark, and
  synthesized block-tap sounds.
- **Survival depth**: a 36-slot inventory with drops and stacking, a crafting
  recipe book (logs → planks → sticks → pickaxe tiers that mine faster and
  unlock ore), placement that consumes items, and furnace smelting, hunger, hostile night mobs, chests for storage, and
  two-system caves (rooms + winding tunnels). Punch a tree and work your way up.

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
`mesh` jobs turn an 18×128×18 padded snapshot (chunk + 1-block neighbor
border) into indexed geometry for up to three render passes (opaque / cutout
/ translucent water). Every buffer crosses the thread boundary as a
transferable — zero copies. Block edits skip the workers entirely and remesh
the affected chunks synchronously for same-frame feedback.

**Streaming.** Chunk data is kept for Chebyshev radius RD+1, meshes for RD,
everything past RD+2 unloads (geometry disposed; unmodified data discarded —
regeneration is cheap, edited chunks are persisted). Jobs dispatch closest
first, ≤6 in flight; at most 2 new geometries upload per frame.

**Why it's fast.** Three shared `MeshBasicMaterial`s for the whole world (the
texture atlas + vertex colors carry everything), no lights or normals,
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

- `npm test` — 88 tests over the pure core: chunk index math, worldgen
  determinism (checksummed), mesher culling/AO/winding, raycast DDA, AABB
  physics, RLE codec, placement rules, survival fall damage and break times,
  plus headless streaming/persistence integration through a synchronous
  worker-pool stand-in.
- `DECISIONS.md` logs every judgment call made against the spec;
  `PROGRESS.md` tracks the milestone acceptance checklist.
- Dependencies are deliberately minimal: `three` + `simplex-noise` at
  runtime; TypeScript strict mode throughout; no frameworks.
