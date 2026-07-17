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

## Post-spec: Biome wildlife

- [x] Two new passive species — desert striders (tall, sandy) and jungle hoppers (squat, green) — so deserts/jungles are no longer barren
- [x] Pure speciesForBiome selector (desert→strider, jungle→hopper, snowy→woolly, temperate→trundler/woolly mix); all drop meat, all flock with their own kind
- [x] Updated the barren-desert test to the new behaviour; species selector unit-tested across every biome

## Post-spec: Throwing weapon

- [x] Throwing-stone item (craft 4 from 1 cobblestone); right-click to hurl along the view ray, consuming one
- [x] ThrownProjectiles system: light-gravity arc, dies on terrain / after lifetime, sweeps each step for a mob hit (reuses entity ray-pick/hurt; animal kills drop meat to the inventory)
- [x] Lets players answer the ranged spitters at distance; cleared on world/dimension switch; ballistics + strike + lifetime tested

## Post-spec: Water buckets

- [x] Craftable empty bucket (3 iron ingots); right-click a water source to scoop it, right-click an empty cell to pour it back
- [x] Pure useBucketOn scoop/pour decision; the bucket ray stops at water sources (which the normal raycast passes through); buckets are unstackable
- [x] Lets players carry/place water (static, no flow); decision + recipe + unstackability tested

## Post-spec: Torches

- [x] Torch block — accessible early-game light (emits 12), crafted 4 from 1 coal + 1 stick with no furnace, filling the gap before lanterns/charcoal
- [x] Procedural torch tile (stick + flame); reuses the lighting engine's emitter table; recipe + emission tested

## Post-spec: Farming

- [x] Hoe (2 planks + 2 sticks) tills grass/dirt into farmland; seeds (bonus drop from grass) plant crop sprouts on it
- [x] Crops are walk-through cutout blocks whose growth stage IS the block id (persists free with chunk bytes); a random-tick CropGrowth driver samples columns near the player so fields ripen in ~1-2 minutes
- [x] Harvest: immature crops refund a seed; ripe crops yield grain + guaranteed bonus seeds (self-sustaining fields); 3 grain bakes into bread (food 8); crops pop when their support block breaks
- [x] Procedural farmland/crop/seed/grain/bread/hoe tiles; guide entry; rules, growth, drops and recipes tested

## Post-spec: GPU headroom

- [x] Render distance default 8 → 10 chunks; settings slider ceiling 12 → 16

## Post-spec: Biome landmarks

- [x] Sunken desert ruins: brick floor at ground level, hash-rolled broken wall stubs, a buried corner chest
- [x] Snow dome shelters: hollow squashed-hemisphere snow shell, two-tall door gap, lantern set into the ceiling
- [x] Overgrown shrines (jungle/forest): 3x3 cobblestone plinth, two-block pillar crowned with a glowing crystal, creeping leaf corners
- [x] One candidate per chunk (1-in-120, biome-gated at the chunk centre), kept inside the chunk interior, bailing on unfit ground — worldgen stays byte-deterministic; all three planters unit-tested

## Post-spec: Chest loot

- [x] Worldgen chests (outpost huts, desert ruins) seed 2-4 loot stacks on first open — a weighted pool of supplies (coal, sticks, planks, seeds, meat, ingots, throwing stones, torches) with rare gold/gem finds
- [x] Deterministic per (world seed, chest position) via a salted PRNG stream, so reloads and regenerated chunks yield the same haul; player-placed chests register at placement and are never seeded
- [x] Pure rollLoot + first-open seeding contract tested

## Post-spec: Mode integration fixes + creative block picker

- [x] Fixed: the title screen's Survival checkbox was ignored when resuming a saved world (same seed always kept the saved mode — survival features looked "broken" because the mode never actually switched)
- [x] Pause menu gains a live "Switch to survival/creative mode" toggle (persists with the save)
- [x] Creative E opens a block picker: every placeable block (all defs minus air/crop stages) in an atlas-drawn grid; click loads it into the selected hotbar slot — torches, chests, furnaces, beds, riftframes etc. are now reachable in creative
- [x] Hud creative palette is editable per-slot; controls/guide updated; palette pinned by test

## Post-spec: Game feel — animated mobs, held item, hit feedback, particles

- [x] Creatures rebuilt as lit multi-part bodies (Lambert + scene hemisphere/sun lights tracking the day cycle): four hip-pivoted legs with a diagonal-gait walk swing, beady eyes; stalkers are full humanoids with counter-swinging arms and glowing red/green eyes
- [x] Hit feedback: red hurt-flash (per-entity material clones), directional knockback that decays, and a reddish aim outline around whichever creature is under the crosshair (block outline yields to it)
- [x] First-person held item: camera-attached atlas-textured viewmodel that bobs while walking, swings on right-click and loops while mining; mirrors the hotbar selection in both modes
- [x] Block-break particles: pooled points burst in the broken block's atlas colour with gravity and expiry (one draw call)
- [x] Usage hints: a fading line above the hotbar explains what right-click does with the held item (eat/plant/till/scoop/pour/throw/place/sleep...), pure usageHintFor covered by tests
- [x] HUD polish: selected-slot glow/lift, blurred hotbar backdrop; vendored three.d.ts extended (lights, Lambert, Points, getAttribute/translate)

## Post-spec: Visual overhaul (parallel workstreams)

- [x] Real sky: gradient dome (fjord-azure day / void-indigo night, ember-amber dawn/dusk horizon), additive sun + silver moon orbiting with the clock, 350 seeded stars fading in at night; follows the player, sized to the far plane
- [x] Atlas v2: baked vertical light gradient + edge bevel on every opaque tile; 4-stage crack tiles
- [x] Mining feedback: crack overlay drawn on the block as it breaks (UV-swapped stages by progress)
- [x] Contextual target hints under the crosshair (attack / open chest / sleep / travel / harvest / plant / till) + per-item right-click hints above the hotbar
- [x] Denser wildlife: cap 26, herd spawns of 2-4 same-species, per-individual size variety
- [x] Water shimmer (animated shader bands), camera walk-bob with subtle roll
- [x] HUD/menu restyle: chunky outlined heart/hunger pips with true halves, glass hotbar with slot numbers + amber selection glow, crisp crosshair, pill break-bar, unified navy-glass/amber menus with animated title backdrop
- [x] All slices verified: 296 tests, strict tsc, clean build

## Post-spec: Content batch 2 (parallel workstreams)

- [x] Physical item drops: mined/harvested/kill loot pops out as spinning atlas-textured pickups with gravity, magnet pull and walk-over collection (90s lifetime, cap 80); loot routes through an onDrop hook with inventory fallback
- [x] Quick-place build keys: I/J/K/L place the held block ahead/left/behind/right (yaw snapped to cardinals), U/O ahead-below/ahead-above — fast schematic laying; survival consumes, containers register, place sound + swing
- [x] Fish: three original kinds (dartfin, shadowscale, sunnygill) school in 2-deep water with tail-wag, wall avoidance and depth steering; catchable by punch or thrown stone for meat; flop and die if drained
- [x] Buried dungeons (~1 in 90 chunks): two brick/cobble rooms + corridor carved at y14-34 with emberrock light, a crystal, and a loot chest (auto-seeds on first open)
- [x] Hamlets: the hut roll can upgrade to twin cabins with a cobble-ringed well of water between them
- [x] Ocean reefs: seagrass tufts and rose/teal coral pillars on deep sand floors; teal coral glows faintly at night
- [x] Mob character pass: tails/ears/horns/fleece/necks per species, idle head-bob + walk roll, stalker shoulder spikes and arm claws, spitter hood + venom throat sac, melee lunge tell, shrinking death pop
- [x] Whole batch verified together: 338 tests, strict tsc, clean build

## Post-spec: Per-seed world identity

- [x] worldShapeOf(seed): every seed rolls its own terrain personality — landmass breadth (continent scale 400-640), mountain drama (34-64), hill roll (10-18), tree richness (×0.7-1.5) and a climate lean (temperature/moisture bias) — deterministic, range-tested, and fed through heightAt/biomeAt/tree placement
- [x] Worlds stay byte-deterministic per seed while different seeds now diverge structurally, not just positionally; 342 tests green

## Post-spec: Graphics & villages round

- [x] Real region-seeded villages: ~45% of 6x6-chunk regions host a 3x3-chunk village — well/hut/lamp centre, ring chunks roll huts, plank long houses (lantern + chest), farm plots (farmland rows, water channel, growing crops) and lamp-post pairs; buildings ride uneven ground on cobblestone plinths (the old flat-site requirement was why settlements never appeared); villageCenterFor exported for future NPCs
- [x] Terrain color grading in the mesher: warm-lit tops vs cool sides, deeper crevice AO, per-column organic hue jitter (meadow patchiness, water variation, faint mineral speckle) — baked at mesh time, deterministic
- [x] Ambient motes: flickering fireflies at night, drifting pollen by day, rising embers in the underworld (one additive draw call)
- [x] Horizon-blended distance fog (terrain fades into the live sky colour), soft screen vignette + light canvas grade
- [x] Per-seed spawn points: each world lands you somewhere new on dry land (deterministic per seed)
- [x] Round verified: 376 tests, strict tsc, clean build

## Post-spec: Village wardens, barter & bigger towns

- [x] Village wardens: hooded per-village NPCs (5-dye tunics, walk/idle animation, day wander + night huddle, leashed to their village); right-click to barter, punch only startles them (flee, no drops)
- [x] Barter: deterministic 3-offer book per warden (grain/coal/gems/gold economy), atomic trades, dedicated Barter screen wired to the aim outline + hint
- [x] Bigger villages: region 6->8 chunks, members Chebyshev<=2 (5x5 chunks ≈ 80 blocks); centre plaza + heart, dense inner ring (2 rolls/chunk), farmland outskirts, and 2-wide cobblestone roads chaining every member to the heart (surface-replacement paving, steepness-safe)
- [x] Fixes found via a headless Playwright probe (console clean, screenshots): snowfield face-contrast bump, fish were inert (missing fixedUpdate/setWorld wiring), controls-panel key wrapping
- [x] Round verified: 398 tests, strict tsc, clean build

## Post-spec: Guardians, biomes, weather, goals, minimap

- [x] Dungeon guardians: vault-brute mobs (violet eye slits, stone-knuckle fists) haunt buried dungeons — leashed, drop gems/gold; wired into melee + thrown-stone combat
- [x] Biome-tinted foliage: grass/leaves/water take a per-biome hue baked in the mesher (jungle deep green, savanna olive-gold, snowy pale), matched across worker + sync mesh paths
- [x] Underworld flora: glowing teal glowmoss (light 8) carpets cavern floors, ash spires rise with ember caps
- [x] Weather: deterministic wet/clear spells per day-quarter, rain or snow (by biome), storms dim the sky/light; overworld only
- [x] Goals: 14 original achievements (First Timber → Vault Breaker) with slide-in completion toasts; persisted per world; fired from break/harvest/craft/smelt/trade/sleep/depth/dimension/kill/catch
- [x] Minimap: north-up terrain overview bottom-left with a rotating player arrow, 8-block redraw gating
- [x] Held blocks render as a real mini 3D cube (per-face tiles + shading); trackpad controls (R = place/use, C = mine/attack)
- [x] Round verified: 468 tests, strict tsc, clean build

## Post-spec: The Sunken King (first great boss)

- [x] Boss framework: BossSystem drives one great boss at a time with a top-screen boss bar (name + draining violet health), reusable by future bosses
- [x] The Sunken King — a ~3.2-block crowned brute summoned deep underground (y<30) by a crafted Sovereign Totem (6 gem + 3 gold + 1 crystal); three escalating phases (chase & ground-slam → summons stalker adds → enraged faster/harder), telegraphed slam, knockback-resistant, dramatic shrinking death
- [x] Weapon-scaled melee: the King's greataxe (kingsplitter) hits for 14, tools 6, fists 3; boss is melee- and thrown-stone-hittable with the aim outline
- [x] Loot fountain on death: the sunken crown trophy + the kingsplitter apex greataxe (tier-7 mining) + a burst of 6-10 gems and 8-13 gold
- [x] Original tiles for totem/greataxe/crown; recipe; usage hints; unstackable specials; pure phase/loot logic unit-tested
- [x] Round verified: 477 tests, strict tsc, clean build, boots error-free in survival

## Post-spec: CHAOS update — walking bosses, cave pressure, loot bursts, firelight

- [x] Elite stalkers ("walking bosses"): ~10% of night spawns and a lone daylight prowler every ~9s are 1.7x giants with a gold brow band — 24 HP, damage 4, sunproof, knockback-resistant, see-what-you-hit scaled hitboxes; death showers a loot burst (gems, gold, ingots, torches, rare iron vest)
- [x] Caves are never safe: below y=50 the full hostile spawn cadence runs at any hour (cave-band floor scan around the player's depth)
- [x] Massive loot: worldgen chests now roll 3-6 stacks (was 2-4)
- [x] Warm firelight: the chunk shader tints block-lit areas toward golden torchlight where they beat the sky light — caves and nights get glowing amber pools instead of flat grey
- [x] 482 tests green, clean build

## Post-spec: v0.10 FACES — expressive mobs, coat variants, living projectiles

- [x] Face pass: every animal gets two-layer eyes (white + pupil), a species-toned muzzle with nose tip and a mouth line — children of the head so grazing/tilting carries the whole face; puffles wear an oversized face right on the torso
- [x] Individual disparity: every animal rolls its own coat shade (±15%) and ~5% are rare ghost-pale or shadow-dark variants — no two herd-mates look alike (on top of the patch markings and size variety)
- [x] Living projectiles: thrown stones are chipped two-tone rocks that tumble in flight and shed a dust wake; spitter venom bolts spin with a bright core inside a translucent green shell and trail a venom wake (new pooled puff emitter)
- [x] Snappier keyboard turning (3.0 rad/s)
- [x] 482 tests, clean build; BUILD_TAG bumped to v0.10 FACES for stale-client verification

## Post-spec: v0.11 EVERYONE HAS A FACE — hostile jaws, warden faces, auto-run

- [x] Hostile faces: melee stalkers and spitters get big glowing eyes under angled dark brows, a jutting jaw slab and three bone-white teeth (spitters get venom-green fangs) — the menace finally reads from the front, elites included at 1.7x scale
- [x] Villager face upgrade: two-layer warm-white + pupil eyes, a skin-toned nose and a mouth line replace the old dot eyes — traders look at you like people now
- [x] Guardian faces: wide burning eye slits under a heavy stone brow, plus a dark maw gash — dungeon wardens loom instead of staring blankly
- [x] Auto-run (T): press T to latch hands-free forward movement (S or a second T cancels) — steer freely with mouse/trackpad/arrow keys while moving, the trackpad answer to "can't turn while running"
- [x] Controls panel documents the new T binding
- [x] 483 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.11 EVERYONE HAS A FACE

## Post-spec: v0.12 TITANS ROAM — the Stone Colossus walks the wilds

- [x] Boss framework generalized: a spec table (name/hp/hitbox/speed/slam/loot) drives one shared three-phase fight engine, so every future great boss is a data entry plus a mesh
- [x] The Stone Colossus — a ~4.2-block weathered granite titan with burning amber eyes, moss-capped crown and pauldrons, and boulder fists; 240 HP, 8-damage slams, phase-2 add summons, enrage under a third health
- [x] Titans roam the surface: ~45% of 320-block regions host a deterministic per-seed anchor (pure titanAnchorFor, same contract as villages) — walk within 40 blocks of a living titan and the fight simply begins, no totem needed; slain titans stay down for the session
- [x] The hoard: titan heart trophy + the earthshaker maul (heaviest melee in the game at 16, apex tier-7 mining) + a landslide of iron, gems and crystal
- [x] Boss bar, aim outline and melee scaling all read the live boss's spec (the Colossus' taller hitbox highlights correctly)
- [x] 490 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.12 TITANS ROAM

## Post-spec: v0.13 DEEPHOLDS — buried mob villages

- [x] Deepholds: ~1 chunk in 130 buries an abandoned underfolk village at y 16-30 — a great hall (8-wide mossstone-floored interior with a plank long-table and hanging lanterns) flanked by north/south chambers and an east annex, doorways punched through every shared wall
- [x] The mobs own them: deepholds sit inside the under-y-50 anytime-spawn band, and dungeon guardians now post up in deephold halls too (one composed locator — dungeon or deephold, first in the chunk wins)
- [x] Triple hoards: three loot chests per hold (hall, north chamber, annex) plus a crystal and glowmoss/emberrock mood lighting
- [x] Same burial invariants as dungeons: dry land only, 8+ blocks of cover, caves open into the halls naturally, bedrock survives
- [x] Pure deepholdFor locator (village/dungeon contract) + carver unit tests; 494 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.13 DEEPHOLDS

## Post-spec: v0.14 DEEP METALS — silver, dusksteel, ember ore

- [x] Three new ores: silver (y<=22, copper-pick gate, between copper and gold in rarity), dusk ore (y<=10, gem-pick gate, the rarest overworld seam) and ember ore (the white-hot heart of underworld ember seams, drops ember shards directly)
- [x] Smith chains: smelt silver/dusksteel ingots; craft the silver vest (60% reduction, between gold and gem), the dusksteel vest (78%, the best armor in the game) and the duskblade (12 damage — the sharpest craftable blade; boss weapons still hit harder); ember shards craft 6-packs of torches
- [x] Ore priority chain in the vein carver now dusk > gold > silver > copper > iron > coal; 9 new atlas tiles (ores, ingots, shard, vests, blade)
- [x] New ore census tests (vein presence in generated terrain, tier gates, armor ladder, recipes); 499 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.14 DEEP METALS

## Post-spec: v0.15 SHRINES OF THE TYRANT — altar bosses & heartstone boosts

- [x] Tyrant shrines: ~1 chunk in 110 buries a vaulted 5x5 shrine (y 8-24) — mossstone dais, two ember braziers, and a rune-lit ALTAR block (light 10, a violet beacon in the deep dark)
- [x] Use (U) the altar and the Hollow Tyrant rises on the spot — the fastest great boss (2.6/4.0 speed, 210 HP, 7-damage strikes), a gaunt shade with a bone circlet, pale unblinking eyes and bone claws; the altar goes dark after one summon
- [x] Boost loot: the tyrant eye trophy + 2-3 HEARTSTONES — U a heartstone to gain +1 max heart PERMANENTLY (stacks to +10 hearts, persisted in the save, HUD/regen/respawn all follow) — plus dusksteel and gems
- [x] Third entry in the boss spec table; new altar/heartstone/tyrant tests; 504 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.15 SHRINES OF THE TYRANT

## Post-spec: v0.16 THE ASHEN MONARCH — the underworld endgame

- [x] The other realm lives: ash-born wildlife spawns only there — soot-dark CINDERPUPS with ember-orange markings and low bone-pale ASHCRAWLERS roam the ashstone cavern floors (full face/coat-variant treatment like every species)
- [x] Ashblooms: crimson faintly-glowing flowers scattered between the teal glowmoss — the underworld floor now glitters in two colours
- [x] THE FINAL BOSS: ~1 chunk in 140 raises the Monarch's throne hall (emberrock-rimmed platform, four pillars, the blazing EMBERTHRONE at light 12) — U the throne and THE ASHEN MONARCH rises: a 5.4-block obsidian emperor with molten core, furnace eyes, swept horns and ember gauntlets; 400 HP, 10-damage slams, the biggest fight in the game
- [x] The prize: THE NIGHTSEVER — 100 damage, one-shots everything that walks (and mines at the apex tier) — plus the ash crown trophy, 2 heartstones and a king's ransom of dusksteel/gems/gold
- [x] 15th goal: "Realm Sovereign — fell the Ashen Monarch on its own throne" (fires from the boss's own onSlain hook)
- [x] 510 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.16 THE ASHEN MONARCH

## Post-spec: v0.17 THE GREAT DEEPENING — a 192-tall world with an abyss

- [x] World height raised 128 -> 192: all surface terrain shifted +64 (sea level 116, snow line 160), and the reclaimed 64 blocks below are the ABYSS
- [x] Grand caverns: a new large-wavelength carver opens huge smooth halls below y=58 — the deep dark finally feels vast instead of spaghetti-thin
- [x] The abyss has its own face: glowmoss pinpricks and dusk-violet duskbells on every cave floor below the cinder band, no zone gating
- [x] Everything re-banded: ores (+64, dusk ore now an abyss-exclusive band to y 40), cave biomes, geodes (12-104), dungeons (78-98), deepholds (80-94), altars reach the abyss (40-88), spawn/snow/height clamps, hostile cave-band, boss summon depth, titan scans
- [x] Save format v2: pre-Deepening worlds regenerate on their seed (old saves would resume inside the shifted terrain); chunk/lighting/mesher/worker code needed zero changes (all derived from CHUNK_HEIGHT)
- [x] CAVE VILLAGES: every deephold hall now houses 2 UNDERFOLK TRADERS — full barter books (same deterministic offers contract as surface wardens), standing by the long-table under the lanterns; the halls are worth fighting the guardians for
- [x] Fixed a latent spawn-scan cap that would have kept villagers off high terrain
- [x] 511 tests green (12 files retuned for the new bands), strict tsc, clean build, headless boot verified at y=119; BUILD_TAG bumped to v0.17 THE GREAT DEEPENING

## Post-spec: v0.18 SHARPENED — the audit-driven polish pass

- [x] Weapons finally matter against EVERYTHING: melee damage threads into hostiles, guardians and animals (scaled so bare fists keep the old baselines) — the duskblade cleaves, the earthshaker crushes, and the Nightsever one-shots every stalker, elite and guardian in the game
- [x] Species drops: bramblehorn stags feed a family (2-3 meat), the weird trio (thornback/puffle/stiltback) sometimes carries a gem, cinderpups bleed ember shards
- [x] Skittish wildlife: stags, dustpuffs and stiltbacks bolt when the player closes within 5 blocks — no more walking up and standing on a deer
- [x] Visible sunburn: stalkers smoulder orange, ramping to a blaze, before the dawn takes them (no more silent pop-out)
- [x] Boss stride fix: limb swing now integrates a walk phase (no more frozen legs on diagonal approaches)
- [x] Living light: emissive blocks (lanterns, torches, glowmoss, altars, the emberthrone) now glow at their own brightness instead of borrowing their neighbour's dimmer light; water shimmer re-anchored to mesh space so waves travel instead of stamping one stripe per face; the held item dims with the night instead of glowing like a flashlight
- [x] Hit feedback: red flecks burst at the exact impact point of every landed melee strike
- [x] Economy threads: the silversmith trades silver<->gems, ember curios and dusk-metal-for-gemVest offers; chests can hold silver ingots and ember shards; hearty stew (14) and golden loaf (16) top the food chain
- [x] Boss ledger: King Slayer, Titan Feller, Tyrant Ender and Realm Sovereign goals — 18 goals total, each great boss now counts
- [x] 519 tests green, strict tsc, clean build, headless boot verified; BUILD_TAG bumped to v0.18 SHARPENED

## Post-spec: v0.19 WILD FACES — unmissable faces, a wilder world

- [x] FACES v2 on every creature: eyes ~45% bigger with dark outline sockets behind the sclera (readable on pale AND dark coats at real gameplay distance), eyes scale with head size per species, bigger muzzles/noses/mouths; hostiles get eye sockets + thicker scowl brows + wider jaws and fangs; guardians get socketed burning slits and a heavier brow; villagers get trade-distance faces
- [x] Wildlife surge: cap raised 48 -> 64, spawn cadence 0.8s -> 0.65s
- [x] Three new species: TUSKBEAST (a hulking shaggy bruiser with bone tusks and a shoulder hump — plains/savanna, drops a 3-4 meat feast), MOSSHARE (a quick long-eared bounder with a puff tail — forest/jungle, skittish), GLIMMERBACK (weird: dusk-grey with a glittering crystal saddle you spot from afar, 50% gem drop)
- [x] 13 species total; richer biome mixes (savanna herds now 4 species deep)
- [x] 519 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.19 WILD FACES

## Post-spec: v0.20 DISCOVERY — you can finally SEE the world's content

- [x] Minimap structure markers: amber = villages, red = roaming Stone Colossi, steel-blue = buried dungeons, teal = deephold cave-villages, violet = Tyrant shrines — every dot outlined so it pops on any terrain (pure locators, zero worldgen cost)
- [x] Surface discovery cairns: a cobble stack with a glowing crown now stands over every buried hall — crystal = dungeon, lantern = deephold, emberrock = shrine. Dig beside one.
- [x] Cave wildlife: below y 100 the overworld's caves live — thornbacks, treasure-saddled glimmerbacks and mossharen pick across stone floors near your depth
- [x] Citadel arrivals: rifting into the underworld now routes you STRAIGHT to the nearest Monarch throne citadel (thrones always build in their chunk now; underworld spawn scan is floor-seeking, never a ceiling ledge)
- [x] STEER MODE (Y): A/D turn instead of strafing — turning while running on pure keyboard, immune to any trackpad palm-rejection the OS does while W is held
- [x] World guide chapter: how to read the map, follow cairns, reach the abyss, the deepholds, all four great bosses and the endgame
- [x] TRUE WORLD RESET: save format v3 — every world regenerates on its seed with all of the above present; fixed the minimap painting everything as rock/snow since the Deepening
- [x] 522 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.20 DISCOVERY

## Post-spec: v0.21 THE ARMORY — full armor sets

- [x] Three worn-armor slots: vest, helm, boots — each gated to its own piece type in the inventory screen
- [x] Ten new armor pieces: iron/gold/silver/gem/dusksteel helms (4 ingots) and boots (3 ingots), all craftable, all with procedural tiles
- [x] Protection stacks across worn pieces with a hard 85% ceiling (a full dusk set: 78+40+27 raw -> capped) — the death of one-shot cave deaths, not invincibility
- [x] 525 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.21 THE ARMORY

## Post-spec: v0.22 OLD STONES — landmarks and atmosphere

- [x] Ruined watchtowers: 9-12 block cobble shafts with hash-crumbled ragged tops, a door, spiralling inner steps, and a lantern-lit lookout deck holding a loot chest — plains/savanna landmarks you steer toward from far away
- [x] Ancient stone circles: eight monoliths (2-4 tall) ringing a mossstone plinth with a glowing crystal heart
- [x] Blob shadows under EVERY creature (animals, hostiles, villagers, guardians, all four bosses) — the single biggest "floating cardboard" fix; soft radial gradient, sized per rig
- [x] Underwater murk: submerge the camera and the world drowns in close blue-green fog (4-26 block wall) — swimming finally looks like swimming
- [x] Storm fog: heavy weather pulls the fog wall in by up to 45%, so rain feels like weather instead of a screen effect
- [x] 528 tests green, strict tsc, clean build; BUILD_TAG bumped to v0.22 OLD STONES
