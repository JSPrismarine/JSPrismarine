---
'@jsprismarine/prismarine': minor
---

Build a world's generator from its level stem through `GeneratorFactories`, which replaces
`GeneratorManager`. A factory is `{ kind, build(context) }` keyed by the stem's generator kind
id, and the context carries the stem, the `DimensionType`, the seed, the content, a lazy loader
for Java's worldgen registries and a logger. The built-in kinds are `minecraft:noise` over
`DataDrivenGenerator`, `minecraft:flat`, `jsprismarine:void` and `minecraft:debug`, which is
registered so a preset naming it parses and refuses to build.

`DataDrivenGenerator` takes a `biomeSource` definition in place of the `biomeParameters` preset
id, so the End's `the_end` source and a `fixed` or `checkerboard` source can be generated.
`FlatGenerator` reads `FlatGeneratorSettings`, honors the biome and stacks its layers from the
dimension's floor. `WorldManager.getGeneratorManager` is deprecated in favor of
`getGeneratorFactories`, and the `Flat` and `Overworld` classes stay for one release as
deprecated aliases that build through the factories.
