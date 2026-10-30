---
'@jsprismarine/prismarine': patch
---

Read the data-driven generator's Java world generation registries out of the pack stack
`@jsprismarine/packs` composes instead of walking the vanilla datapack directory.
`loadJavaWorldgenRegistriesFrom(definitions, reports)` projects a loaded `Definitions` object
into the generator's registries, `loadJavaWorldgenRegistries(sources)` stays as a wrapper over a
one-member stack of the vanilla datapack, and `JavaWorldgenRegistries` gains `dimensionTypes`,
`dimensions`, `worldPresets`, `flatLevelGeneratorPresets` and `multiNoiseParameterLists`. The
biome parameter reports are not datapack content and keep their own reader. Generated chunks do
not change.
