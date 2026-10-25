---
'@jsprismarine/features': patch
---

Add `@jsprismarine/features`, Java Edition's decoration pass. It implements all 58 feature types
Java 26.3 registers, the ten block state providers, the eight int, four float and six height
providers, the sixteen block predicates, the ten rule tests, the ten trunk placers, twelve foliage
placers, eleven tree decorators, one root placer and two feature sizes, and all eighteen placement
modifiers. The placement pipeline reproduces Java's depth-first traversal, which decides the order
of the random draws, and `decorateChunk` derives the per-chunk population seed and reseeds before
each feature from its index and decoration step, so the same seed and chunk place the same blocks
and a feature that draws extra numbers does not move the next one. Features write Java block
states through one `FeatureWorld` interface, with a separate `BlockOracle` for the facts that do
not depend on position and a `translatingWorld` adapter where a server attaches
`@jsprismarine/mapping`; `TestFeatureWorld` is a typed in-memory double with computed heightmaps.
The seeding, every provider and the shared biome-info noise are compared exactly against values
dumped from the pinned 26.3 server jar, and a gated corpus test reads all 240 configured and 273
placed features with zero errors, reporting 47 feature types used at the top level and 15
placement modifiers. 26.3 removed `random_patch` in favor of `projected_random_patchy_square` and
renamed the dripstone features to `speleothem` and `speleothem_cluster`, so a loader written
against 1.21 data does not read this corpus.
