# Decisions

Judgment calls that deviate from or fill gaps in the spec, one line each.

- Repo was not empty (Work-History with a stub README) and already a git repo: built the game at the repo root on the assigned branch, skipped `git init`; the stub README will be replaced by the game README at M7.
- Display title: **Voxelheim** (original, no Mojang resemblance); internal package name `voxelgame` per spec.
- Renderer caps devicePixelRatio at 1.5: with nearest-filter voxel art the sharpness loss is negligible and it protects the fill-rate budget on integrated GPUs.
- Atlas tiles each use their own `(seed, tileName)` PRNG stream so tile output is independent of paint order.
- `three` ships no type declarations and `@types/three` is outside the locked dependency list, so a minimal accurate `src/types/three.d.ts` is vendored (the spec's prescribed remedy); it covers exactly the API surface the game uses.
- Spec §4.4 lists a `temp` noise instance but defines no use for it (snow is height-based, biome variety is out of scope): omitted rather than shipping dead code.
- Mesher waits for all 8 XZ neighbors (spec says 4): the §4.6 AO algorithm samples diagonals, so corner AO would otherwise be wrong at chunk corners; cost is one extra ring of gen latency.
- Mesh jobs are fed a padded 18×128×18 snapshot built on the main thread (a ~41KB copy, transferred zero-copy), keeping the mesher pure and worker-friendly instead of sharing chunk maps.
- Mesher treats below-world as bedrock and above-world as air so the y=0 underside is culled and surfaces at y=127 render.
- Tree canopy reading of §4.4: 5×5 minus corners at trunkTop−2 and trunkTop−1, 3×3 at trunkTop, plus-shape at trunkTop+1.
- Job scheduling: gen and mesh queues are both distance-ascending; when both have a candidate, the closer wins and mesh wins ties (visible sooner).
- Added `workers/protocol.ts` + `workers/pool.ts` beyond the spec's file list (message types and pool routing don't belong in worker.ts).
- Chunk map keys are numeric `cx*2^26+cz` (collision-free for |c|<2^25, far beyond float-precision playability) — avoids per-lookup string allocation in hot paths.
- Horizontal movement is direct velocity control (spec defines speeds but no accel/friction model); vertical velocity persists for gravity/jumps. Semi-implicit Euler, giving a discrete jump apex of ~1.19 blocks for v0=9.
- Spec's water rules conflict (vertical clamp ±3 vs swim up at 4): clamp applies to passive motion, Space sets vy=4 exempt from the clamp.
- Collision resolution is flush-exact (strict-inequality overlap) so "lands exactly on block tops" holds literally; the spec's 0.001 epsilon only guards sweep-loop termination.
- Unloaded chunks are solid for collision, and physics is frozen until the chunks under the player AABB have data — both prevent falling through not-yet-generated terrain.
- Fly mode: vertical speed equals the 10.8 horizontal fly speed (spec gives one number); sprint modifier ignored while flying; landing does not auto-exit fly (only F toggles).
- Camera position interpolates between physics steps (smooth on >60Hz displays); mouse look applies directly each frame.
- Edits remesh synchronously on the main thread (edited chunk + bordering neighbors): a few ms once per click beats worker round-trip latency and trivially meets the ~50ms visibility budget.
- Raycast targets solid blocks only (water is swim-through, like creative-mode reach rules); the starting voxel is never reported; break/place are one action per click (no hold-repeat).
- World takes a `JobPool` interface; tests inject a synchronous pool so streaming/edit logic runs headless in node — this is how M2's "flight stabilizes" acceptance is asserted programmatically.
- Chunks between RD and RD+2 keep their meshes (spec only requires disposal beyond RD+2): cheap churn insurance, frustum culling hides them.
- Hotbar icons use the block's side-face tile (grass band and bark read better than plain tops).
- The §4.5 culling formula also culls leaves-against-leaves faces (same id, non-opaque) — followed literally; canopies just read denser.
- Shade × AO is baked uniformly into all three passes, water included (spec §4.5 defines color as shade × AO with no pass exception).
- Water material is DoubleSide so the surface is visible from underneath while swimming (spec accepts minor translucency artifacts; cost is negligible overdraw).
- New worlds start at noon (t=120s) so first impressions aren't pitch black.
- Day/night brightness lerps sky/fog directly by the brightness value (t=0.18 night floor → near-night sky), matching the spec's "by brightness" wording.
- Storage interface named `StorageBackend` (the spec's literal `Storage` collides with the DOM type); IndexedDB at runtime with an in-memory fallback if IDB fails to open.
- Persisted chunk keys are loaded as a Set at session start; only keys in the Set hit IndexedDB on load (everything else goes straight to worker gen, no per-chunk IDB probe latency). Concurrent IDB chunk loads capped at 8.
- Persisted chunks are marked modified after load, so they're retained in memory rather than re-fetched on unload/reload churn (they're few).
- Title-screen Play with the saved world's seed resumes it; entering a different seed starts a fresh world (clears both stores) — the single 'default' world slot per spec.
- Time-of-day pauses with the pause menu (it advances in the fixed update, gated on pointer lock); autosave keeps running while paused.
- Player fly state is persisted alongside position/rotation (cheap QoL beyond spec's letter).
- New World rebuilds in-app: world disposed, atlas/texture rebuilt for the new seed (shared material instances keep their identity, only `.map` swaps), hotbar icons redrawn.
- M7: fps/draw-call numbers could not be machine-measured in the build sandbox (no GPU; headless-browser CDN blocked by network policy) — per the spec's verification rules, budgets are enforced by construction (3 shared materials, ≤2 uploads/frame, ≤6 jobs, disposal-on-unload integration-tested, alloc-free steady-state loops) and exposed live via F3 / `window.__debug` for on-hardware confirmation.
- Greedy meshing not implemented: §5 orders it strictly as a remedy for missed budgets; estimated steady-state load at RD8 (~290 chunk-pass draw calls visible after frustum culling, well under 700; ~0.3–0.7M visible triangles on MeshBasicMaterial) sits inside budget on integrated GPUs, and greedy merging risks AO-seam regressions for an unmeasurable win here.
- Debug overlay text and `__debug` stat refresh run at 4Hz — string building was the render loop's only steady-state heap allocation (§7 zero-alloc rule).
- `padLoneChunk` lives in mesher.ts as a test/dev utility consumed by the vitest suite; it is tree-shaken out of the shipped bundle.
- The session's git proxy denied all pushes (403, read-only token), so the branch content was published through the GitHub API as batched commits: the remote squashes the M0–M7 history. The faithful per-milestone commits and the `v1.0.0` tag exist in the session workspace; `git push --force-with-lease origin claude/nice-thompson-8n68ry && git push origin v1.0.0` from a write-enabled checkout restores them. `package-lock.json` is omitted from the API push (tool payload economics) — installs resolve from the pinned ranges.
- Stretch order honored (§9): all five items shipped. Survival specifics: damage = floor(fall−3) half-hearts, water/flight cancel falls, death respawns at spawn with full HP (no inventory/drops — still out of scope); fly is disabled in survival; pause-menu New World inherits the current mode, the title checkbox sets it for fresh worlds.
- Ore veins use threshold 0.74 at /18 scale (small clustered pockets, roughly MC-iron density); ore is mineable but not in the 9-slot hotbar (spec fixes the hotbar contents).
- Cloud plane is frustumCulled=false (it always spans the view) and excluded from the shared-material assertion by name; its material joins the day/night brightness list.
- User-directed post-spec expansion: Voxelheim grows genre-standard survival systems as original clean-room implementations (own names, recipes, pixel art, data tables) — explicitly not a copy of any Mojang content, per the spec's own hard constraint and IP policy.
- Survival drops auto-collect into the inventory on break (no drop entities yet — simpler and lag-free; entities may come with mobs).
- Crafting is a recipe-book list (click to craft from totals) rather than a placement grid — original interaction, less UI surface.
- Iron pickaxe crafts directly from raw ore for now (no furnace/smelting yet; planned with the next tranche).
- E opens the inventory: pointer lock is released with a flag suppressing the pause menu; E/Esc closes and relocks.

- Biomes added: temperature/moisture noise classify columns into plains/forest/desert/savanna/snowy; each drives surface/subsurface block, tree density and a height bias. A separate mountain noise raises ranges. Original design — not modeled on any specific game's biome tables.

- Hunger model (original numbers): activity-scaled exhaustion drains hunger; hunger >=18 regenerates health at a food cost; empty hunger starves to a 1-hp floor (never lethal, forgiving). Meat now restores hunger rather than healing directly, so the loop is hunt -> eat -> regen.

- Hostile mobs ("stalkers") are original entities sharing the animal AABB physics and ray-pick/hurt interface; night-gated spawning via the day/night brightness value, sun burn-off in daylight, simple seek+hop AI, melee with cooldown. Player damage routed through a public hurt() that only applies in survival.

- Chests store a 27-slot Inventory per world position in a ContainerStore (game layer), serialized into the world save; the Inventory class was generalized to a configurable size. Right-click on a chest opens it; breaking it spills contents to the player. Block place/break notify the store via an interaction hook.

- Lighting engine: two baked channels (sky via top-down fill + BFS, block via emitter BFS; water/leaves cost 2) computed over the full 3x3-chunk snapshot so 15-block light never clips at borders; per-vertex smoothing reuses the AO sample cells. A RawShaderMaterial combines them as max(block, sky*dayBrightness) — the one place the original spec's "no custom shaders" rule is deliberately outgrown (user-directed graphics overhaul); fog and a cheap sqrt gamma encode live in the same shader. Mesh snapshots grew from 18- to 48-wide (transfer ~295KB/job); sync edit remeshes now include the light BFS (~10ms/chunk) and stay within the edit budget.
- Lantern (emission 14) replaces brick in the creative palette (brick remains craftable); recipe: charcoal + 4 sticks -> 4 lanterns.
- Fixed shipped atlas bug: charcoal/ingot tile ids collided with chest side/top, corrupting chest textures.

- Inventory interaction unified on a pure `Cursor` (player/cursor.ts): left = pick-up/drop/merge/swap, right = half/drop-one, shift = quick-move; both InventoryScreen and ChestScreen drive it via mousedown button. Replaces the inventory screen's older select-then-swap model; held items are returned to the inventory on close so nothing is ever lost.

- Ore tiers (original spin): coal/iron/copper/gold as separate vein systems with their own noise + depth band; pickaxe ladder wood<stone<copper<iron<gold with per-ore required tiers (coal=wood, iron/copper=stone, gold=iron) and a wrong-tool ×5 slowdown that also yields no drop. Coal ore drops a coal item (fuel); iron/copper/gold ore blocks drop themselves and smelt to ingots. blockName() humanizes camelCase registry keys for display.

- Wildlife variety: two passive species (trundler, woolly) with their own box dimensions/colours and shared static materials; species picked at spawn via the system rng. Cohesion-only flocking — on a wander decision an animal steers toward the centroid of same-species herd-mates within 9 blocks — gives herding without full boids (no separation/alignment needed at this scale).

- Ranged hostiles: a "spitter" stalker variant (~40% of night spawns) holds a preferred range and fires straight-flight projectiles aimed at the player chest; projectiles damage on AABB intersection and despawn on terrain/lifetime. Projectiles owned by HostileSystem (scene meshes + hitPlayer callback), cleared on setWorld. Melee restricted to non-ranged stalkers.

- Second dimension (part 1): createGenerator(seed, dimension). The underworld is an enclosed realm — bedrock cap/floor, ashstone bulk carved by |3D-noise|<threshold caverns, emberrock veins (light 10) for atmosphere, no water/sky; deterministic via uw:* noise salts. New blocks ashstone/emberrock/riftframe added with their own tiles. Portal activation + dimension switching + per-dimension persistence come next.

- Second dimension (part 2b): riftframe (gold ingot + 4 cobblestone -> 2) is a portal block; right-clicking it swaps dimensions. enterDimension() saves the current realm, builds a World for the target dimension, and teleports the player to a deterministic safe landing (findSafeSpawnY generates the destination column synchronously to find solid+2-air). Chunk persistence is namespaced per dimension (o:/u: key prefixes); WorldMeta stores the active dimension and resumes into it. Underworld uses a fixed dark-ember sky and always-night hostile spawning. KNOWN LIMIT: container (chest) inventories are keyed by world position only, so a chest at the same x,y,z in both dimensions would share contents — acceptable for now (rare), to be namespaced if it bites.

- Underground geodes: a per-chunk hash places at most one hollow crystal pocket (radius 4, y 8-40), carved chunk-local (centre kept >=R+1 from borders) so it never crosses a chunk edge; only solid non-bedrock cells are overwritten so geodes do not float into caverns. Crystal (glow 7) needs a stone-tier pickaxe and drops gems; gems craft a gem pickaxe (tier 6, the apex, speed x12). Sealed geode air is excluded from the ocean-drain cave invariant in tests.

- Damage feedback: a pure HurtIndicator (flash spikes on hp loss, decays ~2.2/s; low-hp vignette below 6 HP) drives a full-screen red radial overlay. Survival only; throttled DOM writes (rounded to 1%). Death still auto-respawns (a full death screen would gate the respawn instead).
