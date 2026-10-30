---
'@jsprismarine/prismarine': patch
---

Run one chunk generation worker pool per server instead of one per dimension. The dimension, the
`worldgen/noise_settings` id and the biome source move out of the pool's `workerData` and into
every task as a `PipelineKey`; a worker compiles its pipeline per key and seed on the first task
that names them. `DataDrivenGenerator.forStem(key)` returns a `Generator` for another stem over
the same instance, registries, caches and pool, and the `minecraft:noise` factory hands every
stem it builds a view of one shared generator, so three dimensions share `min(6, cores - 2)`
workers rather than starting three times that many. `builtInGeneratorFactories()` replaces the
`BUILT_IN_GENERATOR_FACTORIES` constant and `createNoiseGeneratorFactory()` replaces
`noiseGeneratorFactory`, because the noise factory now holds that shared generator and each
`GeneratorFactories` registry needs its own. Overworld chunks are byte for byte what they were.
