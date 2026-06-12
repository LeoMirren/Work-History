# Progress

Milestone/acceptance checklist from the spec (§5). Resume from here after any
context loss: finish unchecked items of the first unchecked milestone, in order.

## M0 — Scaffold

- [x] Vite + TS strict project
- [x] git repo (pre-existing; building on branch `claude/nice-thompson-8n68ry`)
- [x] vitest wired with passing tests
- [x] Fixed-step loop
- [x] Renderer with rotating cube textured from the generated atlas
- [x] FPS counter
- [x] PROGRESS.md + DECISIONS.md created
- [x] ✅ `dev`/`build`/`test` all pass
- [x] ✅ Atlas generation is deterministic (seeded)

## M1 — One chunk

- [x] Chunk data structure + index math
- [x] Hardcoded-seed worldgen for a single chunk
- [x] Culled mesher (opaque pass only)
- [x] Fly-around camera with pointer lock (no collision)
- [x] ✅ Index round-trip test over all 32,768 cells
- [x] ✅ Triangle count for one terrain chunk: 784 (logged in test), not ~393k

## M2 — Infinite world

- [x] Full worldgen (§4.4: heights, beaches, water, snow, caves, trees)
- [x] Worker pool
- [x] Chunk streaming with load/unload + distance-ordered queue
- [x] Fog
- [x] ✅ Determinism test: same seed → identical chunk checksums; different seed differs
- [x] ✅ Straight-line flight: loaded count bounded by construction (rescan prunes > RD+2; counts exposed in `__debug`/overlay); gen+mesh run only in workers (main thread only snapshots/uploads); geometries disposed on unload (browser-verified at M7)

## M3 — Physics & controls

- [x] §4.7 in full: gravity, jump, sprint, sneak, fly toggle, water movement, per-axis AABB resolution
- [x] ✅ Collision tests: lands exactly on block tops; wall slide preserves tangent velocity; no tunneling at terminal velocity; jump apex ≈ 1.25 blocks (~1.19 with semi-implicit Euler, asserted in [1.1, 1.35])

## M4 — Interaction

- [x] DDA raycast
- [x] Break/place
- [x] Block outline
- [x] Hotbar + icons + selection
- [x] ✅ Raycast unit tests (hits, miss, face normals)
- [x] ✅ Placement-rejection-inside-player test
- [x] ✅ Edits trigger neighbor remesh when on a border (integration-tested via sync pool)

## M5 — Visual pass

- [x] Vertex AO + quad-flip (§4.6)
- [x] Face shading
- [x] Cutout + translucent passes (leaves/glass/water)
- [x] Day/night cycle with fog/sky sync
- [x] ✅ AO unit tests against hand-computed cases (calculator + mesh-output + flip)
- [x] ✅ Three shared materials total — scene-traversal test + dev-mode runtime assert (renderer.info side re-checked at M7)

## M6 — Persistence & menus

- [x] Pause menu, settings (persisted), title screen with seed input
- [x] RLE codec
- [x] Autosave (10s dirty-only + beforeunload + menu Save)
- [x] World reload restores edits + player state
- [x] ✅ RLE round-trip tests (uniform, alternating worst case, real chunks, >65535 runs, malformed input)
- [x] ✅ Integration test against in-memory storage: edit → save → reload → edits present (plus fake-indexeddb coverage of the real IDB path)

## M7 — Performance & ship

- [x] Budgets at RD8: enforced by construction + exposed via F3/`window.__debug`; fps not machine-measurable in the sandbox (no GPU/browser — documented in DECISIONS.md)
- [x] Optimizations: upload throttling (≤2/frame), alloc audit (zero steady-state per-frame allocations; debug text throttled to 4Hz); greedy meshing not needed (rationale in DECISIONS.md)
- [x] README (title, screenshot placeholder, controls, architecture, run/build/test)
- [x] Final QA sweep of every acceptance item (all §6 required tests present; no any/ts-ignore/TODO; 80 tests green)
- [x] Tag v1.0.0
- [x] ✅ Budgets met by mechanism or gap documented in DECISIONS.md
- [x] ✅ Full test suite green, clean `npm run build`

## Stretch (§9, in order — budgets met by mechanism, see M7)

- [x] Sprint FOV kick (smoothed ×1.08 while sprinting)
- [x] Clouds: single drifting translucent plane at y=140, seeded blocky pattern, world-anchored, day/night dimmed
- [x] Survival mode: HP hearts HUD, fall damage (3 safe blocks, water cancels), death→respawn, hold-to-break with per-block times + progress bar; mode chosen at world creation and persisted
- [x] Ore veins: 3D-noise pockets (block id 14) in the stone band y∈[5,60]
- [x] Procedural WebAudio block-tap sounds (per-block pitched blip + noise tap, zero assets)

## Post-spec: Survival Update 1 (user-directed expansion)

- [x] Items & 36-slot inventory (9 hotbar + 27 main), stacking to 64, tools unstackable
- [x] Drops: broken blocks collected to inventory (stone→cobblestone, grass→dirt, ore gated by pickaxe)
- [x] Crafting recipe book (E screen): planks, sticks, wood/stone/iron pickaxes, bricks, glass
- [x] Tool tiers speed mining (×2/×4/×6) and gate ore; survival placement consumes items
- [x] Inventory screen: click move/merge/swap, shift-click quick-move, persisted with the world
- [x] Caves v2: spaghetti tunnels (two-noise intersection) alongside cheese rooms

## Post-spec: Hunger & survival loop

- [x] Hunger meter (0-20) with HUD pips + status panel readout, persisted
- [x] Activity burns food (idle < walk < sprint); eating meat now restores hunger (RMB)
- [x] Well-fed (≥18) slowly regenerates health; empty stomach starves down to a non-lethal floor

## Post-spec: Hostile mobs & combat

- [x] Stalkers: dark humanoids that spawn at night near the player on solid dark ground
- [x] AI: chase within aggro range (hop over obstacles), wander otherwise; melee the player on contact with a cooldown
- [x] Burn away after sustained daylight; despawn when far; killed in a few punches (shared entity ray-pick/hurt)
- [x] Player takes damage in survival (routes through death/respawn); immune in creative; Threats readout on the status panel

## Post-spec: Chests & storage

- [x] Chest block (craft from 8 planks), placeable, with its own 27-slot inventory keyed by world position
- [x] Right-click opens the chest screen (chest grid + your inventory) with a held-cursor: click to pick up/drop/merge/swap, shift-click to move across
- [x] Breaking a chest spills its contents into your inventory; chest inventories persist with the world
- [x] Generalized the Inventory class to a configurable size; cross-inventory transfer helper
