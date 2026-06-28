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

## Post-spec: Lighting engine (graphics overhaul, part 1)

- [x] Real voxel light engine: sky light flood-fill (caves dark for real, dappled forest floors, water attenuation) + block light from emitters — pure BFS over a 48-wide 3x3-chunk snapshot, unit-tested
- [x] Lantern block: crafted from charcoal + sticks, emits light 14, lights sealed rooms and caves; in the creative palette
- [x] Smooth per-vertex light (sampled over the same 4 cells as AO) baked as a second attribute
- [x] Custom chunk shader: final = albedo x tint x max(blockLight, skyLight x dayBrightness) — lanterns keep glowing at night while the sun dims; fog moved into the shader
- [x] Fixed atlas tile collisions (charcoal/ingot were overpainting chest sides/tops)

## Post-spec: Inventory feel (shared held cursor)

- [x] Extracted a pure, unit-tested Cursor (held-stack model) used by both the inventory and chest screens
- [x] Left click: pick up whole / drop / merge (overflow stays in hand) / swap; right click: pick up half / drop one; shift-click: quick-move
- [x] Held items spill back safely on close; "Holding: …" readout; replaced the old select-and-swap inventory interaction

## Post-spec: Ore tiers & metals

- [x] Four ore types in their own depth bands: coal (shallow, common, →fuel), iron (mid), copper (mid), gold (deep, rare) — independent 3D noise, rarer/deeper ores win contested cells
- [x] Procedural ore tiles (coloured speckle) + item tiles (coal lump, copper/gold bars & pickaxes) via painter factories
- [x] Full pickaxe ladder: wood(1) < stone(2) < copper(3) < iron(4) < gold(5); per-ore tool-tier gates and speed multipliers (gold fast but a luxury)
- [x] Coal is furnace fuel; smelt copper/gold ore to ingots; craft copper & gold pickaxes; humanized block display names

## Post-spec: More wildlife (species & flocking)

- [x] Second passive species (woolly) alongside the trundler — distinct size/colour, shared static materials, both drop meat
- [x] Species chosen at spawn (deterministic via the system rng); population cap raised to 12
- [x] Gentle flocking: same-species animals steer toward their herd centroid within range, so herds drift together

## Post-spec: Ranged hostiles (spitters)

- [x] Spitter variant of the night hostile: greenish, holds a preferred distance, lobs projectiles at the player from range
- [x] Projectile system: straight-flight shots that damage on a player AABB hit, die on terrain or after a lifetime; cleared on world reset
- [x] Melee gated to non-ranged stalkers so spitters kite instead of double-attacking

## Post-spec: Second dimension — underworld generator (part 1)

- [x] Dimension param on createGenerator (overworld | underworld), Generator carries its dimension
- [x] Underworld: an enclosed ashstone cavern realm — bedrock floor/ceiling, big 3D-noise caverns, emberrock veins that emit light (no sky light, no water); pure & deterministic, unit-tested
- [x] New blocks: ashstone, emberrock (glow 10), riftframe (portal frame) with procedural tiles
- [ ] Portal block + activation, dimension switching, separate persistence namespace (part 2, next)

## Post-spec: Second dimension — portal & switching (part 2b)

- [x] Riftframe portal block (craft from gold ingot + cobblestone); right-click to travel between overworld and underworld
- [x] Dimension switching in main: save current realm, build the target World, deterministic safe-landing teleport (findSafeSpawnY), keep player inventory/hp/hunger
- [x] Per-dimension persistence: chunk keys namespaced (o:/u:) so realms never collide; meta stores the active dimension and resumes into it
- [x] Underworld atmosphere: dark ember sky/fog, sun never reaches it; hostiles treat it as always-night

## Post-spec: Underground geodes & gems

- [x] Rare hollow crystal geodes deep in the stone — one candidate per chunk (deterministic hash), kept chunk-local, only carving solid cells so they never float
- [x] New blocks: geodeshell, crystal (glow 7); crystal needs a stone+ pickaxe and drops gems
- [x] Gem item + gem pickaxe (apex tier 6, fastest mining), extending the tool ladder

## Post-spec: Damage feedback

- [x] Hurt flash on taking damage (intensity scales with the hit), decaying over ~1s
- [x] Steady red low-health vignette below 6 HP, intensifying as health drops
- [x] Pure HurtIndicator (unit-tested) drives a thin DOM vignette overlay; only updates the DOM on change

## Post-spec: Jungle biome

- [x] Jungle biome (hot + very wet) with dense canopy (1-in-8 tree chance) and tall trunks (7-10 logs)
- [x] Classifier branch + biome def + name; appears across the world, tested for presence and tall trees

## Post-spec: Biome-aware wildlife

- [x] Species follow biome: woollies in the snowy cold, mostly trundlers in temperate green; deserts stay barren
- [x] Animals now also spawn on snow surfaces; biome lookup threaded from the overworld generator (none in the underworld)
- [x] Spawn-gate seam (setSpawning) for deterministic tests

## Post-spec: Death screen

- [x] Death now shows a blocking "You fell…" screen with a Respawn button (instead of silently teleporting)
- [x] Player freezes on death until respawn; pointer lock released; pause menu suppressed while dead
- [x] Controller keeps auto-respawn as the default (no handler) for tests; the game installs an onDeath handler

## Post-spec: Saplings (renewable wood)

- [x] Tree shape extracted to a shared pure forEachTreeBlock (worldgen + in-world planting agree); determinism preserved
- [x] Leaves occasionally drop a sapling (chance-based bonus drop, pure & testable)
- [x] Right-click a sapling on grass to grow a tree (consumes the sapling, only fills air — never destroys builds)

## Post-spec: Cooked food

- [x] Smelt raw meat into cooked meat at a furnace (closes the hunt → cook → better-food loop)
- [x] Food table: cooked meat restores ~10 hunger vs 6 raw; eating generalized to any food item

## Post-spec: Surface structures (outpost huts)

- [x] Deterministic per-chunk outpost huts on flat plains/savanna grass (border-safe, ~1/240 chunks)
- [x] 5x5 cobblestone cabin: plank floor/roof, door gap, glass window, interior lantern (lights up via the light engine), and an empty chest
- [x] Pure `tryPlantHut` (flatness/grass/build-line gated) + tests; worldgen stays byte-deterministic with structures on

## Post-spec: Armor

- [x] Three vest tiers (iron 35% / gold 50% / gem 70% damage reduction), crafted from their metal/gem
- [x] Worn in a dedicated 1-slot armor inventory (reuses Inventory + held Cursor; armor-only guard); persisted with the player
- [x] Mob melee + projectile damage mitigated (always leaves ≥1 on a real hit); creative still immune
- [x] Procedural vest tiles; pure mitigation math + crafting + controller tests

## Post-spec: Beds (sleep + respawn point)

- [x] Bed block (craft from 4 planks + 1 sapling) with procedural quilt/frame tiles
- [x] Right-click a bed to set your respawn point; at night (overworld) it skips to morning, clearing the night's mobs
- [x] Pure isNightTime / nextDay day-cycle helpers (jump strictly forward into a bright morning) + recipe; tested
