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
