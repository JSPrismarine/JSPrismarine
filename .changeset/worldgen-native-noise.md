---
'@jsprismarine/worldgen': patch
---

`RandomState` samples every `worldgen/noise` stack in `@jsprismarine/native-worldgen`'s C kernel when its library loads on the thread, with the same bits as the TypeScript. A chunk's terrain fill then runs none of those stacks' Perlin octaves in TypeScript; blended noise's smeared octaves still do. `RandomStateOptions.nativeNoise: false` keeps noise in TypeScript, and so does a machine without a build. `GradientNoise.permutationTable()` returns a copy of a noise's permutation table.
