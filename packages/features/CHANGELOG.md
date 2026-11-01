# @jsprismarine/features

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/worldgen@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2bc83d4`](https://github.com/JSPrismarine/JSPrismarine/commit/2bc83d4e6b2cca1e29a091753300862fa84006ab) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a template a feature placed its block entities, and keep the processors a feature writes
  inline, so a desert well's suspicious sand holds the loot a brush turns up. Two misses on the
  same path. `placeJavaTemplate` wrote the template's blocks and never asked for the block entities
  saved on them, so every compound a feature-placed template carried was dropped. The feature
  parser kept a `processors` field only when it was a string, so a feature writing its rules where
  it stands had them thrown away. Java's processor list codec takes an identifier, a bare list or
  an object holding one, and `TemplateRequest.processors` now carries whichever arrived.
  
  The desert well is where both land. In a generated world at seed 1234, its four nearest wells, in
  chunks -691,-239, -687,-18, -649,-130 and -647,-38, each placed two suspicious sand and no block
  entity at all. Each now places the same two sand, carrying
  `loot_tables/archaeology/desert_well.json`.
  
  Java 26.3 places a template nine times across its 240 feature documents: two `minecraft:fossil`
  features that name their processor lists by identifier, and seven `minecraft:template` features
  nested inside the desert well and the sulfur spring, which is why neither shows up as a feature
  document of that type. Two of the seven carry processors, both written inline, and both are the
  desert well's archaeology rule. That rule and the three trail ruins processor lists are the only
  four `append_loot` in the game data.
  
  `append_loot` adds the loot table to the compound it is handed, and the template source keeps
  each decoded template for the life of the world, so a chain run over a template's own compounds
  would bake one placement's table into every later placement of it. The placement copies the
  compounds it hands to the chain, and indexes each copy under the Java block the original sat in,
  which is where a banner keeps its color.
  
  The desert pyramid still leaves its corridor suspicious sand out, for a different reason than the
  one recorded beside it. The seam carries a brushable block entity and `archaeology/desert_pyramid`
  is in the loot data. The positions are what is missing: they live in Java's `DesertPyramidPiece`
  rather than in data, and the pyramid's interior here is a reconstruction.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`a8b30b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a8b30b91030d5b8f9b4ab1c5f3f89acf9978424f) Thanks [@filiphsps](https://github.com/filiphsps)! - Derive the End's ten spike pillars from the world seed when the `end_spike` configuration lists none, as vanilla's `"spikes": []` asks. `FeatureWorld.spawnEntity` now takes an options object carrying the yaw and the crystal's beam target, base plate and invulnerability instead of a bare yaw, which is a breaking signature change for worlds that implement it; the generator's region adapter records the yaw as before.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9f5dcbe`](https://github.com/JSPrismarine/JSPrismarine/commit/9f5dcbeff3a03f2061efb3d6179def3ef176c62b) Thanks [@filiphsps](https://github.com/filiphsps)! - Decorate a chunk with the features that belong in it.
  
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`485ac0b`](https://github.com/JSPrismarine/JSPrismarine/commit/485ac0b0b901a9495c733dc668ff53b4061e03c0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/features`, Java Edition's decoration pass. It implements all 58 feature types
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

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e648da4`](https://github.com/JSPrismarine/JSPrismarine/commit/e648da4bbd2bfa55fe80d603e7c8e9f0fea39dfc) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry a structure template's saved block entity into the generated chunk, so the contents
  translation reaches a world. The translation covers 149 of the 1124 block entities Java 26.3's
  templates declare and nothing called it: the generation path read the type, the loot table and the
  spawner's mob off the saved compound and dropped the rest, so a generated decorated pot had no
  sherds and a generated vault had no key.
  
  `BlockEntityRequest` gains `saved` and `javaBlock`. `saved` is typed `unknown` because
  `@jsprismarine/features` models no NBT and depends on no library that does, and the server narrows
  it before reading it. `javaBlock` is the Java block the block entity sat in, which is the one thing
  the saved compound does not carry: Java keeps a banner's color in the block, Bedrock keeps it in
  the block entity and has a single banner block where Java has sixteen, so the color is
  unrecoverable once the translation drops the Java palette.
  
  The template store indexes the Java block of each saved compound as it reads a template, keyed on
  the compound itself. That works because the compounds travel by reference: `translateJavaTemplate`,
  `transformTemplate` and `applyProcessors` each carry `nbt` through untouched, and the one processor
  that writes to a block entity, a rule's `append_loot` modifier, adds to the compound it was handed
  rather than replacing it.
  
  In a generated world at seed 1234, across the 25 chunks around the trial chamber at chunk 3,-14,
  all 16 decorated pots carry their four sherds, all 13 vaults carry their reward table and their
  key, and the one dispenser carries its water bucket. The 13 trial spawners there still carry
  nothing. That is the listed loss: every trial spawner in the templates writes its configuration as
  a reference into Java's own registry, and nothing is wired to resolve one.
  
  A vault no longer gets a top-level `LootTable`. Reading one level down into `config` for it was how
  its reward reached a chunk before the contents translation existed. Bedrock's vault reads
  `config.loot_table`, which the translation now writes, and a vault is not a container, so
  `fillContainerLoot` never rolled the top-level copy either.
  
  One worldgen corpus digest moves, the block entities of `1234/3,-14/full`, which holds the single
  vault the 22 corpus chunks record. Blocks, biomes, heightmaps, counts, structures and entity spawns
  are unchanged, and so is the ocean ruin chest in `1234/-12,0/full`, which a data marker places with
  no saved compound behind it.
- Updated dependencies [[`b79c330`](https://github.com/JSPrismarine/JSPrismarine/commit/b79c33066896e4639b4c5a06b6739add55a3d361), [`3561178`](https://github.com/JSPrismarine/JSPrismarine/commit/3561178664c8a57459f841687f80e6c4be9c2661), [`5794f0b`](https://github.com/JSPrismarine/JSPrismarine/commit/5794f0bccdc0cc2123b46b71af342ece984e774a), [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770), [`62e14d2`](https://github.com/JSPrismarine/JSPrismarine/commit/62e14d2bf3c19d77897733a422885cdffdf13334), [`86444b4`](https://github.com/JSPrismarine/JSPrismarine/commit/86444b41bb7281acbd0e556ad9421fe913321af0), [`f060520`](https://github.com/JSPrismarine/JSPrismarine/commit/f060520321901b222197f2c65e75d5771c47cdfe), [`0f9d3c1`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9d3c18e72967d0f4d1ba40221a1076bf24ac42), [`258e9d9`](https://github.com/JSPrismarine/JSPrismarine/commit/258e9d915c9d067a86f576ae64f07b992b7c4485), [`4cf5c25`](https://github.com/JSPrismarine/JSPrismarine/commit/4cf5c25c105f4d7dbea3d1d877d67cce48006234), [`7efae53`](https://github.com/JSPrismarine/JSPrismarine/commit/7efae5385415852da187f6b3ec1c010592b00d98), [`bd6780f`](https://github.com/JSPrismarine/JSPrismarine/commit/bd6780f89c73c69635adb9785a997f3103145fb1), [`2515674`](https://github.com/JSPrismarine/JSPrismarine/commit/2515674ce840cad4dd80739d4042228c5e6172c4), [`bd65536`](https://github.com/JSPrismarine/JSPrismarine/commit/bd65536e966bab81bbf9af147a0bf5440890cdae), [`c29803c`](https://github.com/JSPrismarine/JSPrismarine/commit/c29803c5f9f502263fa51fe8c29d41a846048019)]:
  - @jsprismarine/worldgen@0.16.0
