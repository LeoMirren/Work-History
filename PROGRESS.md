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

- [ ] Full worldgen (§4.4: heights, beaches, water, snow, caves, trees)
- [ ] Worker pool
- [ ] Chunk streaming with load/unload + distance-ordered queue
- [ ] Fog
- [ ] ✅ Determinism test: same seed → identical chunk checksums; different seed differs
- [ ] ✅ Straight-line flight: loaded-chunk count stabilizes (logged), zero gen/mesh on main thread, no unbounded memory growth

## M3 — Physics & controls

- [ ] §4.7 in full: gravity, jump, sprint, sneak, fly toggle, water movement, per-axis AABB resolution
- [ ] ✅ Collision tests: lands exactly on block tops; wall slide preserves tangent velocity; no tunneling at terminal velocity; jump apex ≈ 1.25 blocks

## M4 — Interaction

- [ ] DDA raycast
- [ ] Break/place
- [ ] Block outline
- [ ] Hotbar + icons + selection
- [ ] ✅ Raycast unit tests (hits, miss, face normals)
- [ ] ✅ Placement-rejection-inside-player test
- [ ] ✅ Edits trigger neighbor remesh when on a border

## M5 — Visual pass

- [ ] Vertex AO + quad-flip (§4.6)
- [ ] Face shading
- [ ] Cutout + translucent passes (leaves/glass/water)
- [ ] Day/night cycle with fog/sky sync
- [ ] ✅ AO unit tests against hand-computed cases
- [ ] ✅ Three shared materials total — assert via renderer.info and scene traversal

## M6 — Persistence & menus

- [ ] Pause menu, settings (persisted), title screen with seed input
- [ ] RLE codec
- [ ] Autosave
- [ ] World reload restores edits + player state
- [ ] ✅ RLE round-trip tests
- [ ] ✅ Integration test against in-memory storage: edit → save → reload → edits present

## M7 — Performance & ship

- [ ] Measure against §7 budgets at RD8 (debug overlay)
- [ ] Optimizations as needed (upload throttling → alloc audit → greedy meshing)
- [ ] README (title, screenshot placeholder, controls, architecture, run/build/test)
- [ ] Final QA sweep of every acceptance item
- [ ] Tag v1.0.0
- [ ] ✅ Budgets met or gap documented in DECISIONS.md
- [ ] ✅ Full test suite green, clean `npm run build`
