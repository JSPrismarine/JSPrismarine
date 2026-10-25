---
'@jsprismarine/features': patch
'@jsprismarine/prismarine': minor
---

Decorate a chunk with the features that belong in it.

`DataDrivenGenerator` ran every placed feature of every overworld biome in every chunk and let
nothing filter them, which is why trees grew on ice spikes and a single chunk could hold seven
species of log. Four fixes, each measured against Java Edition's 26.3 server jar:

- The `minecraft:biome` placement modifier now gets the `featureBelongsToBiome` callback it has
  always asked for, so a position is rejected unless the biome there lists the feature being
  placed. This is Java's `BiomeFilter`.
- A step's candidate features are the union of what the biomes of the surrounding 3 by 3 chunks
  list, not of every biome in the dimension. Java reads the same nine chunks' biome palettes in
  `ChunkGenerator.applyBiomeDecoration`.
- Feature indices no longer start at the step's structure count. In the jar the structure counter
  and `globalIndexOfFeature` both restart at zero within a step and are allowed to overlap, so the
  offset was shifting every feature seed away from vanilla.
- `sortFeaturesPerStep`, new in `@jsprismarine/features`, replaces the first-seen feature order
  with Java's `FeatureSorter`: a depth-first topological sort over every biome's ordering, giving
  one list per step that every biome agrees with. That index is the other half of the feature seed.

Measured over four chunks each deep inside plains, desert, taiga and ice spikes at seed 1234:
feature invocations per chunk fell from 171 everywhere to between 48 and 59, and decoration block
writes from 8256 to 9610 per chunk down to 3461 to 5120. The ice spikes chunk went from 38 logs
and 268 leaves to none, and the desert chunk from 274 logs and 1538 leaves to none. The taiga
chunk keeps its spruce.
