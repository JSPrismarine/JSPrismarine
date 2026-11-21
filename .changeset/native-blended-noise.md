---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/worldgen': patch
---

`old_blended_noise` samples its three smeared octave stacks in `@jsprismarine/native-worldgen` when the library loads, with the same bits. A layer takes `smearY`, `SmearedPerlinNoise`'s `fudgeYScale`, and `CompileEnvironment.stack` lets a density compiler mirror the octave stacks it builds. A chunk's terrain fill then runs no octave in TypeScript in any vanilla noise setting.
