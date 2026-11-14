# @jsprismarine/features

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c)]:
  - @jsprismarine/worldgen@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/worldgen@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/worldgen@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5), [`13dd1a1`](https://github.com/JSPrismarine/JSPrismarine/commit/13dd1a15e5e2c7db2ee5072db28a0b327a8a5e26), [`8d90227`](https://github.com/JSPrismarine/JSPrismarine/commit/8d90227f749c3b016bf066b770adc6ce15814c6d)]:
  - @jsprismarine/worldgen@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515) Thanks [@filiphsps](https://github.com/filiphsps)! - Add serializable random states and a versioned replay initial-state manifest.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`e5c9812`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c98121aac113c02f7684752b26e228a86c57b8) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace hot random BigInt math with exact number-lane operations.
- Updated dependencies [[`9bbe11b`](https://github.com/JSPrismarine/JSPrismarine/commit/9bbe11b9563745852c71506dc22c911fde0114fa), [`f1a2771`](https://github.com/JSPrismarine/JSPrismarine/commit/f1a2771104f57bbe927d330b4b162bc3673edc9d), [`ab7daa1`](https://github.com/JSPrismarine/JSPrismarine/commit/ab7daa106d8c35b07cf64e5c8166f361644b8360), [`52e899b`](https://github.com/JSPrismarine/JSPrismarine/commit/52e899b729f1b77452d638107628764771303093), [`318a038`](https://github.com/JSPrismarine/JSPrismarine/commit/318a0386c1322b77799192cd90d1c1c44a13b5b4), [`8bdc3d4`](https://github.com/JSPrismarine/JSPrismarine/commit/8bdc3d447250cfa6589155c5a7ebfdd6a9d3ab6e), [`4196b67`](https://github.com/JSPrismarine/JSPrismarine/commit/4196b676e0d0b35e1c81e85e48fa74176dbba17b), [`0a8ae9a`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8ae9a0c378e3b5e59366d52cb52a898d647d9a), [`9406146`](https://github.com/JSPrismarine/JSPrismarine/commit/94061468716fef624e21ca3b76fb18938a979f7c), [`b1ebfe6`](https://github.com/JSPrismarine/JSPrismarine/commit/b1ebfe6071afaeaf5b6795ec215a75b92753b1fb), [`98dea94`](https://github.com/JSPrismarine/JSPrismarine/commit/98dea94c94ce084f2cbce6170d826a808a63384a), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`99a59f0`](https://github.com/JSPrismarine/JSPrismarine/commit/99a59f0604675678339b39b764a56267413b9687), [`05d61f9`](https://github.com/JSPrismarine/JSPrismarine/commit/05d61f9c6cb7000d1b81908ca94dc1af7bd8fec8), [`3000120`](https://github.com/JSPrismarine/JSPrismarine/commit/3000120a653848f2fc8596d7cdccb55d8f21f064), [`d049765`](https://github.com/JSPrismarine/JSPrismarine/commit/d04976541aee27f8e3fc198e703173e56740b515), [`e5c9812`](https://github.com/JSPrismarine/JSPrismarine/commit/e5c98121aac113c02f7684752b26e228a86c57b8), [`ffa08fb`](https://github.com/JSPrismarine/JSPrismarine/commit/ffa08fb0ebcaff9b5edbc68fcbc4cb2632fc8f18), [`c6b0b49`](https://github.com/JSPrismarine/JSPrismarine/commit/c6b0b49e4b59e03b9b7dd0366f280ff7832c77b2)]:
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
