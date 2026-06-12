# Decisions

Judgment calls that deviate from or fill gaps in the spec, one line each.

- Repo was not empty (Work-History with a stub README) and already a git repo: built the game at the repo root on the assigned branch, skipped `git init`; the stub README will be replaced by the game README at M7.
- Display title: **Voxelheim** (original, no Mojang resemblance); internal package name `voxelgame` per spec.
- Renderer caps devicePixelRatio at 1.5: with nearest-filter voxel art the sharpness loss is negligible and it protects the fill-rate budget on integrated GPUs.
- Atlas tiles each use their own `(seed, tileName)` PRNG stream so tile output is independent of paint order.
- `three` ships no type declarations and `@types/three` is outside the locked dependency list, so a minimal accurate `src/types/three.d.ts` is vendored (the spec's prescribed remedy); it covers exactly the API surface the game uses.
