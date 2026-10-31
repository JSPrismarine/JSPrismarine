---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

Remove the aliases the dimension work kept for one release. `DimensionDefinition` is gone; use
`DimensionType`. `Dimensions.Legacy`, the 0..255 Overworld, is gone with it. `Generators.Flat`
and `Generators.Overworld`, `GeneratorFactories.registerClassGenerator` and
`WorldManager.getGeneratorManager` are gone; register a generator kind as `{ kind, build(context) }`
through `GeneratorFactories.register`, and build a vanilla Overworld through the `minecraft:noise`
factory with `OVERWORLD_NOISE_STEM`. `FlatGenerator`, `FlatGeneratorOptions` and `FLAT_SEA_LEVEL`
are exported from the generator factories. `WorldManager.getWorlds()` and `loadWorld()` are gone;
walk `getLevels()` and each level's `worlds()`, or call `loadLevel()`.

`WorldData` no longer declares the `generator` and `layers` keys, so `config.schema.json`
describes a world by `seed`, `provider`, `preset` and `dimensions` alone and an editor flags the
old keys. A file that still carries them loads as before: `normalizeWorldData` reads a
`LegacyWorldData`, which carries the two old keys and their `FlatLayer` shape, and the first
start writes the entry back in the new spelling. `World` no longer re-exports `FlatLayer`.

The DevTools `jsprismarine` handle in `@jsprismarine/server` gains `levels()`, and its `worlds()`
walks every loaded level.
