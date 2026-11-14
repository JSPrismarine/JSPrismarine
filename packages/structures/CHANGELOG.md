# @jsprismarine/structures

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6
- Updated dependencies [[`3d07749`](https://github.com/JSPrismarine/JSPrismarine/commit/3d07749f87f00a669397d4720ca6fb28fbe92545), [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`778fb37`](https://github.com/JSPrismarine/JSPrismarine/commit/778fb37670bb087a056e33802ebeef39b1eccc2f)]:
  - @jsprismarine/binaryutils@0.21.0
  - @jsprismarine/mapping@0.21.0
  - @jsprismarine/nbt@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`f030c63`](https://github.com/JSPrismarine/JSPrismarine/commit/f030c63e5c6269288d8dc576bddde160eda3cc74)]:
  - @jsprismarine/binaryutils@0.20.0
  - @jsprismarine/nbt@0.20.0
  - @jsprismarine/mapping@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.19.2
  - @jsprismarine/mapping@0.19.2
  - @jsprismarine/nbt@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies [[`5129bc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5129bc5166f8a781bd3f928e24b687744cdbd8c9)]:
  - @jsprismarine/mapping@0.19.1
  - @jsprismarine/binaryutils@0.19.1
  - @jsprismarine/nbt@0.19.1

## 0.19.0

### Patch Changes

- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/nbt@0.19.0
  - @jsprismarine/mapping@0.19.0
  - @jsprismarine/binaryutils@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/binaryutils@0.18.0
  - @jsprismarine/mapping@0.18.0
  - @jsprismarine/nbt@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`be9d70e`](https://github.com/JSPrismarine/JSPrismarine/commit/be9d70ecdf777806b80868294cf09c53538b9811) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache rotated jigsaw transforms and weighted pools

- [#2664](https://github.com/JSPrismarine/JSPrismarine/pull/2664) [`d731b85`](https://github.com/JSPrismarine/JSPrismarine/commit/d731b85039c2c6ebcc1a5c187813ea06def716ff) Thanks [@filiphsps](https://github.com/filiphsps)! - Turn the block states structure processors introduce with the template they land in. Java turns a template's states after its processors run, so a jigsaw block's `final_state` and a rule's `output_state` face the way the building faces; this server turns the template first, so those states were placed as written and every village house got an east-facing doorstep stair and a pen gate set into the wrong wall. `ProcessorContext` now carries the placement, the jigsaw replacement and rule processors turn the states they name by it, and both template placement paths pass it.
- Updated dependencies [[`d499106`](https://github.com/JSPrismarine/JSPrismarine/commit/d49910658d7aa57fedfe32512977f79aa0023832), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/binaryutils@0.17.0
  - @jsprismarine/nbt@0.17.0
  - @jsprismarine/mapping@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0bc486e`](https://github.com/JSPrismarine/JSPrismarine/commit/0bc486e90372d7ae43425da17c71275a097e9722) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate Java Edition's structures. Nothing generated before: the world generator read none of
  the three registries a structure is built from, and `@jsprismarine/structures` was imported
  nowhere in the server. It now loads `worldgen/structure`, `worldgen/structure_set` and
  `worldgen/template_pool` alongside the eleven registries it already read, decides which chunks a
  structure starts in from the 21 structure sets, lays the structure out against the bare noise
  terrain, and writes its pieces into every chunk it covers. 50 of Java's 52 structures generate;
  the end city and the nether fortress are the two left, and neither has a dimension to generate
  in. [docs/data-driven/structures.md](../docs/data-driven/structures.md) is the inventory.
  
  29 structures ask for terrain adaptation through `terrain_adaptation`, and the field was not
  read at all, so a village landed on whatever the noise happened to make. Java's beardifier
  density function now runs from the structure starts before a chunk's terrain is sampled.
  
  The decoration pass runs Java's own loop: each step's structures, then that step's features,
  sharing one index counter. A step's features are therefore seeded from the structure count
  onward, which is what Java does and what this did not.
  
  `@jsprismarine/structures`' jigsaw assembler changed to match Java's placer. It draws the
  rotation before the start element rather than after, sits a `terrain_matching` element on the
  terrain through the new `JigsawSources.terrainHeight`, settles a projected start onto the
  surface through `JigsawConfig.projectStartToHeightmap`, reserves vertical room under
  `JigsawConfig.useExpansionHack`, and reports the generation point as `JigsawAssembly.origin`. A
  pool element's `processors` may now be an inline list as well as an identifier, which is how
  1439 of the 2287 vanilla pool elements write it. The same seed and pools no longer produce the
  same layout as before, because the draw order and the ground level delta both changed.
  
  `@jsprismarine/bedrock-data` gained `extract:structures`, which lifts the 1511 `.nbt` templates
  out of the pinned server jar into `node_modules/.cache/jsprismarine/java-structures/<version>/`;
  `datagen:java` now runs it too. Reading them from the jar instead meant inflating all 17655 of
  its entries inside the first chunk that placed one.
  
  The generator's hand-written Bedrock biome id table is gone. The ids come from
  `@jsprismarine/mapping`'s generated registry table instead, so they regenerate with the pinned
  version rather than drifting. `BEDROCK_BIOME_IDS` is no longer exported.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`146cd6e`](https://github.com/JSPrismarine/JSPrismarine/commit/146cd6e7d8918f1330b954ff0e00044144655ddb) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a generated structure the block entities and the mobs Java's data declares. Across the
  generation corpus's seven decorated chunks the generator produced one block entity and no entity
  spawns at all, including in the trial chambers chunk. Three faults stacked up.
  
  The jigsaw assembler rejected every connection that pointed back into its own piece. Java gives
  such a connection a free space built from the parent piece's own box, with the parent not cut out
  of it, so a child may overlap the piece it hangs inside; the assembler checked each candidate
  against every placed piece instead. A trial chamber hangs its spawners, its vaults, its dispensers
  and its pots off exactly those connections, so it grew none of them. At seed 1234 the chunk at
  3,-14 goes from 30 pieces to 251.
  
  A template's entity list was never read. That list is how a village gets its villagers, its cats
  and its iron golem, an igloo its two villagers and a bastion its piglins; across the 1511 templates
  Mojang ships it names 288 mobs, and none of them existed. `TemplatePiece` now records them at the
  fractional position they were saved at, with the yaw turned and reflected the way Java turns it.
  `StructureWriter.spawnEntity` takes the entity's own position rather than the block's, so a mob
  saved between blocks stays there.
  
  The Java to Bedrock block entity id table had six rows: chest, trapped chest, barrel, bee nest,
  spawner and end gateway. Everything else was dropped on the floor, which is 422 of the 1124 block
  entities the templates declare. It now covers the whole of Java 26.3's `block_entity_type`
  registry, and a vault's loot table is read out of the `config` compound Java keeps it in rather
  than only from the top level. Over the structure starts within 24 chunks of three seeds' origins,
  108 block entity placements of which 85 survived became 1199 of which all 1199 survive.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c27bc3c`](https://github.com/JSPrismarine/JSPrismarine/commit/c27bc3cdecae4ffd63dcf68af7e1c6d1d17c2b91) Thanks [@filiphsps](https://github.com/filiphsps)! - Check a structure's biome before assembling it, the way Java does.
  
  Over a 102 by 102 chunk area at seed 1234, 319 of 356 candidate starts were fully assembled and
  then discarded by the biome check at their generation point. That check ran after the builder, so
  a village rejected for being in the wrong biome still cost a whole jigsaw expansion.
  
  Java rejects first. `Structure.generate` calls `findValidGenerationPoint`, which filters
  `findGenerationPoint`'s `GenerationStub` on the biome at the stub's position, and the stub carries
  an unrun `Consumer<StructurePiecesBuilder>`; the pieces are built on the line after the filter.
  
  A `StructureLayout` is now that stub: a generation point, and a call that assembles. The structures
  package gains `startJigsaw`, which places a jigsaw structure's start piece and hands back the
  generation point with the breadth-first expansion deferred; `assembleJigsaw` is it with the
  expansion run straight away, so every existing caller is unchanged. `jigsawBlocksOf` is memoized
  per template, because the expansion rescans the same few templates once per parent jigsaw, per
  candidate element and per rotation.
  
  No structure moves. Over that area the 37 kept starts are identical in structure, set, chunk, step,
  terrain adaptation, generation point, bounding box and piece count, and the generation golden corpus
  is unchanged. Candidate layout fell from 20.8 ms to 4.3 ms per chunk, with 47 assemblies where there
  were 356.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6a91053`](https://github.com/JSPrismarine/JSPrismarine/commit/6a910532df85e7109d7a90c85f4e7cdc161e20bf) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/structures`, the structure template layer. It reads both template formats Mojang
  ships (Java's gzip big-endian `.nbt`, under either palette key spelling, and Bedrock's little-endian
  `.mcstructure` with its two block layers), translates a Java palette into Bedrock states through
  `@jsprismarine/mapping` with every loss reported rather than dropped, and places a template under a
  rotation and a mirror. The direction-valued state rules are not written by hand: a dumper compiled
  against the pinned Java 26.3 server jar records what `BlockState.rotate` and `BlockState.mirror`
  return for all 35723 Java states, and the generated table is keyed by Bedrock state, which catches
  asymmetries such as `StairBlock.mirror` swapping a corner shape under one mirror axis and not the
  other. It also implements the eleven structure processor types with their ten rule tests, three
  position tests and four block entity modifiers; jigsaw assembly over template pools with weights,
  joint types, depth limits and bounding-box rejection; and the three structure set placement types
  with the four frequency reduction methods, over a `java.util.Random` reproduction tested against the
  JDK. A gated corpus test reads all 1511 Java templates (100% of 1170664 blocks translate cleanly)
  and all 1311 Bedrock Dedicated Server templates (97.70% of 1137782, the rest naming 47
  pre-flattening identifiers).
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`ef12ef8`](https://github.com/JSPrismarine/JSPrismarine/commit/ef12ef8dee0fb445a80811306d20c44aabeb237d), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/nbt@0.16.0
  - @jsprismarine/binaryutils@0.16.0
