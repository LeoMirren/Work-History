# Voxelheim — Current State

An original, browser-local voxel sandbox (TypeScript + Three.js + Vite, vitest, zero backend).
Everything below exists, is tested (450+ unit tests), and ships in `npm run build`.

**Standing content policy:** Voxelheim implements *genre-equivalent* systems with
entirely original names, art (procedural), stats, and data. It does not reproduce
Mojang or mod-pack content. External packs are treated as *scale references only*.

## Systems

| System | Where | State |
| --- | --- | --- |
| Renderer | `engine/renderer.ts`, `engine/materials.ts` | Three.js; 3 shared RawShaderMaterials (opaque/cutout/water); fog blended to live sky horizon; water shimmer + time uniform |
| Chunks | `world/world.ts`, `world/chunk.ts` | 16×128×16; async worker gen+mesh (transferables); distance-sorted queues; unload ring; single-flight bookkeeping |
| Meshing | `world/mesher.ts` | Face culling + AO (§4.6); per-vertex sky/block light; warm/cool face grade; per-column hue jitter; per-biome foliage/water tint |
| Lighting | `world/lighting.ts` | Flood-fill sky+block channels over 48×128×48 snapshot; emitters via `LIGHT_EMIT` |
| Worldgen | `world/worldgen.ts` | Seeded, deterministic, climate-zoned biomes ×6; per-seed world shape (mountains/hills/trees/climate lean); caves; ores by depth; geodes; reefs; underworld dimension |
| Structures | `world/worldgen.ts` | Region-seeded villages (5×5 chunks: plaza, well, huts, long houses, farms, lamp posts, roads), hamlets, lone huts, desert ruins, snow domes, shrines, buried dungeons |
| Sky | `engine/sky.ts` | Gradient dome, orbiting sun/moon, seeded stars; palette drives fog |
| Weather | `engine/weather.ts` | Deterministic wet/clear spells; rain/snow particle field; sky dimming |
| Ambience | `engine/ambience.ts` | Fireflies (night) / pollen (day) / embers (underworld) |
| Particles | `engine/particles.ts` | Block-break bursts in block colour |
| Entities | `entities/*` | Animals (herds, biome species), fish (3 kinds, water-bound), hostiles (melee + ranged, night), dungeon guardians, village wardens (professions via trades), thrown projectiles, floating item drops (magnet pickup) |
| Player | `player/*` | AABB physics, swim, sprint+FOV kick, fall damage, hp/hunger/armor, camera bob, viewmodel (3D block cube / item sprite, swing) |
| Interaction | `player/interaction.ts` | Raycast target + outline, entity aim outline, hold-to-break with crack overlay, drops routing, farm/bed/bucket/throw/eat/trade branches, contextual hints + click-failure feedback |
| Build aids | `player/buildkeys.ts` | I/J/K/L/U/O quick-place relative to facing |
| Inventory | `player/inventory.ts`, `ui/*Screen.ts` | 36-slot inventory + armor slot, cursor drag semantics, chest containers (world-keyed), crafting/smelting book with fuel + furnace gating, barter screen |
| Crafting | `world/crafting.ts` | Recipe registry (craft/smelt), fuel selection, atomicity |
| Farming | `world/farming.ts` | Till/plant/random-tick growth (stage = block id), harvest economy |
| Goals | `world/goals.ts`, `ui/goalToast.ts` | 14 original achievements, event-driven, persisted, toast UI |
| Persistence | `persist/*` | IndexedDB; RLE chunks (dimension-namespaced), world meta (player, settings, time, containers, goals) |
| UI | `ui/*` | Title/pause menus (mode toggle, sliders), HUD (hearts/hunger/hotbar/hints), minimap, info panel, guide book (auto-generated from data), death screen, damage vignette |
| Input | `engine/input.ts` | Pointer lock, click queues, trackpad aliases (R = use/place, C = mine/attack) |
| Audio | `engine/audio.ts` | Procedural block-tap sounds (place/break) |

## Data model
- Blocks: `world/blocks.ts` — const enum-style registry compiled into flat typed-array
  tables (`SOLID/OPAQUE/PASS/BREAKABLE/BREAK_TIME/LIGHT_EMIT/FACE_TILES`). 40+ blocks.
- Items: `world/items.ts` — ids ≥100; drop tables, tool tiers/speeds, food, armor,
  stack limits, usage hints. ~30 items.
- Art: `engine/atlas.ts` — 256×256 procedural atlas, seeded per world; painter per tile;
  auto bevel/gradient pass on opaque tiles.

## Performance shape
- Worker pool = cores−1 for gen/mesh; ≤2 mesh uploads/frame; three draw-call classes
  plus entities/particles (pooled `Points`, one call each).
- Dev-mode asserts: shared-material invariant sweep every 5 s.
- Fixed-step update decoupled from render (`engine/loop.ts`).

## Known gaps (tracked in GAP_ANALYSIS.md)
No mouse rebinding UI, no commands/chat, no third-person camera, single armor slot
(not 4-piece), no enchant/potion layer yet, no boss yet, flat block models only
(no stairs/slabs), no positional audio.
