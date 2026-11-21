---
'@jsprismarine/worldgen': minor
---

Remove the opt-in volume density evaluator: `ChunkSampler`'s `useVolumeDensity` option, `RandomState.volumeSampler`, `DensityFunctionCompiler.compileVolume`, and the `DensityVolume` and `DensityVolumeEvaluator` types. It was off by default and slower than the scalar evaluator on the measured overworld graph. Sample density with `RandomState.sampler` and walk chunks with `ChunkSampler` as before.
