# @jsprismarine/worldgen

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7efae53`](https://github.com/JSPrismarine/JSPrismarine/commit/7efae5385415852da187f6b3ec1c010592b00d98) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the terrain fill cheaper without moving a block. `ChunkSampler` gains `cellCount` and
  `forEachCellBlock`, which walk a chunk one interpolation cell at a time instead of column by
  column, and `DataDrivenGenerator` fills through them: a column walk left an interpolation cell
  every eight blocks and made the density stack refetch its eight corners 57177 times per chunk
  where the lattice holds 768 cells. An `interpolated` node now keeps its cell state in flat typed
  arrays, takes its lattice index from a shift and its interpolation weight from a table, and its
  corner cache is sized to the 8 by 8 by 64 window a chunk's lattice actually occupies rather than
  four times that.
  
  `SampleContext.interpolationCorners` is now the flat buffer rather than a lookup method, and
  `beginInterpolationCell` is replaced by `interpolationCell`. Both are seams for the compiled
  density closures; nothing outside the density stack called them.
  
  Separately, the structure beardifier indexes its pieces by the columns they reach. It is the
  right operand of the top-level add in the overworld's `final_density`, so it runs on all 98304
  samples of a chunk and used to scan every nearby piece on each one.
  
  Every step is bit-identical, which the six golden chunks, the Java terrain vectors and a new
  block-for-block comparison between the two walks assert.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd6780f`](https://github.com/JSPrismarine/JSPrismarine/commit/bd6780f89c73c69635adb9785a997f3103145fb1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/worldgen`: Java Edition 26.3's terrain stack. It implements
  `XoroshiroRandomSource`, `LegacyRandomSource` and both positional factories; Perlin, smeared
  Perlin, simplex, normal and old blended noise over the 26.3 noise parameter schema; all 44 density
  function operator types, compiled once per tree into closures rather than interpreted per sample;
  the eight-slot noise router and the six aquifer functions parsed from `worldgen/noise_settings`;
  the noise-based aquifer with its fluid picker; the `minecraft:ore_vein` material rule; and a
  chunk-shaped sampler that produces Java block state identifiers for a column or a whole chunk.
  
  Expected values in the test suite come from Mojang's own classes through
  `utils/oracle/DumpWorldgenVectors.java` rather than from a second implementation of the same
  formulas. All 55 vanilla density functions, 64 noises and 7 noise settings parse with no errors,
  and every noise router slot, every aquifer function and nine whole overworld columns match Java
  exactly.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bd65536`](https://github.com/JSPrismarine/JSPrismarine/commit/bd65536e966bab81bbf9af147a0bf5440890cdae) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate overworld chunks at a usable rate.
  
  Preloading 25 chunks of the data-driven overworld took the better part of three minutes, which
  put the default `preload-radius: 10` at roughly fifty. A profile put the time in four places,
  none of them the density function graph the plan expected.
  
  The surface pass asks for the biome of every block it walks, and every ask ran a full
  multi-noise lookup: six density functions, every noise octave under them, then a nearest-box
  search over 7594 climate boxes. A chunk holds 1536 biome cells and 98304 blocks.
  `memoizeBiomeResolver` wraps a `BiomeResolver` so a cell is resolved once, which is what Java
  gets for free by reading the chunk's biome array, and the generator now shares one memoized
  resolver across the surface pass, the structure level and the biome column.
  
  An interpolated density function reads the eight corners of its cell, and a chunk's 16 by 384
  by 16 blocks sit on 1225 of them. `CornerCache` hashed the corner position into 4096 slots, and
  at that load factor collisions evicted corners the walk was still using, so a chunk evaluated
  its 1225 corners 6139 times. Corners lie on a lattice, so the slot is now the cell index masked
  per axis and the count is exactly 1225. `CornerCache.getOrCompute` takes the cell indices
  alongside the position, which is the breaking part of this release.
  
  `BiomeManager` derived the eight jitter offsets around a block from a string-keyed map, nine
  `long` multiplications per lattice point; they now live in a direct-mapped cache on the same
  lattice. And the block oracle handed its cached Bedrock facts back as a fresh record on every
  one of the millions of calls a decoration pass makes, where two flags in a number will do.
  
  Generating 25 chunks at seed 1234 fell from 22.2 to about 8 seconds of CPU, and the terrain is
  unchanged: every generated chunk hashes identically, over the 5 by 5 region at seed 1234 and a
  3 by 3 region at seed 5678.
  
  The terrain fill also handed the event loop back every four columns, 64 times a chunk. A round
  trip through the event loop is a trip through the host's scheduler, so on a busy host a preload
  spent most of its wall clock waiting rather than generating. It now yields on a 4 millisecond
  budget, which is the property the yield was there for.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b79c330`](https://github.com/JSPrismarine/JSPrismarine/commit/b79c33066896e4639b4c5a06b6739add55a3d361) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the material rule again under a cave mouth that took a grass block, so a carved opening is
  left with grass rather than bare dirt.
  
  Two reports, one cause. Dirt sat exposed to the sky where a cave had broken the surface, and
  short grass grew on that dirt. The grass is legal: Java's `#minecraft:dirt` is inside
  `#minecraft:substrate_overworld`, which is inside `#minecraft:supports_vegetation`, and
  `patch_grass_plain` adds no ground predicate. The dirt is what should not have been there.
  
  Java remembers, per carved column, whether the carve has taken a grass block or mycelium out of
  it. Once it has, every plain `minecraft:dirt` the carve then uncovers goes back through the
  material rule, through `MaterialSystem.topMaterial`. This server had no such entry point, so the
  carve wrote its opening and stopped.
  
  `SurfaceSystem.buildSurface` now returns the context and the compiled rule it built as a
  `SurfacePass`, whose `topMaterial` evaluates that rule at one position with both stone depth
  counters pinned to one and the water line one block up. One context serves the whole chunk where
  Java builds a fresh one per call, which computes the same answers: every cached value in the
  context is keyed by the update counters that `updateXZ` and `updateY` bump.
  
  Two neighboring carver deviations go with it. The mask the generator allocated spanned the whole
  dimension, so a carver could open the bottom block and the top seven that Java's `CarvingMask`
  protects; `CarvingMask.forChunk` already had those bounds and nothing called it. The apply loop
  also skipped a cell that already held a fluid, where Java skips only `#minecraft:uncarvable` and
  lets the aquifer decide what replaces the water it removed.
  
  This moves generated worlds. One chunk of the parity corpus changed, `987654321/333,-17`: three
  dirt blocks under a cave mouth became grass blocks, and twenty-eight blocks at y -63 that the old
  mask let a carver flood with lava stayed deepslate.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`3561178`](https://github.com/JSPrismarine/JSPrismarine/commit/3561178664c8a57459f841687f80e6c4be9c2661) Thanks [@filiphsps](https://github.com/filiphsps)! - `parseClimateParameterPoint` accepts a climate axis written as a `[min, max]` list, the shape Mojang's data generator writes into `reports/biome_parameters`, beside the number and `{ min, max }` forms it already read.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5794f0b`](https://github.com/JSPrismarine/JSPrismarine/commit/5794f0bccdc0cc2123b46b71af342ece984e774a) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip repeated float narrowing for Perlin lattice offsets.

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`ef7ed80`](https://github.com/JSPrismarine/JSPrismarine/commit/ef7ed800b96bf9fa0807cf745af1289b627c5770) Thanks [@filiphsps](https://github.com/filiphsps)! - A `minecraft:flat` level stem may name a `worldgen/flat_level_generator_preset` id in place of
  its settings object, as Java's `world_gen_settings` allows. `parseGeneratorDefinition` keeps the
  id as a `FlatPresetGeneratorDefinition`, the `minecraft:flat` factory resolves it through the pack
  stack's preset registry and reads the document's `settings`, and the save writes the stem back
  as the id. `isFlatGenerator` narrows to a stem that carries its layers, so the `level.dat` flat
  layers and the announced biome are written only when the layers are in the stem.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62e14d2`](https://github.com/JSPrismarine/JSPrismarine/commit/62e14d2bf3c19d77897733a422885cdffdf13334) Thanks [@filiphsps](https://github.com/filiphsps)! - Inline Perlin gradient dot products

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`86444b4`](https://github.com/JSPrismarine/JSPrismarine/commit/86444b41bb7281acbd0e556ad9421fe913321af0) Thanks [@filiphsps](https://github.com/filiphsps)! - Inline climate range distance arithmetic in the biome search hot path.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f060520`](https://github.com/JSPrismarine/JSPrismarine/commit/f060520321901b222197f2c65e75d5771c47cdfe) Thanks [@filiphsps](https://github.com/filiphsps)! - Speed up climate biome lookup

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0f9d3c1`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9d3c18e72967d0f4d1ba40221a1076bf24ac42) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache horizontal density interpolation stages

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`258e9d9`](https://github.com/JSPrismarine/JSPrismarine/commit/258e9d915c9d067a86f576ae64f07b992b7c4485) Thanks [@filiphsps](https://github.com/filiphsps)! - Stop a structure's height query at the block it found, with aquifers still on.
  
  `StructureLevel.baseHeight` sampled a whole 384-block column and then scanned it downward for the
  topmost block the heightmap accepts, which paid for every block under the one it returned. Java's
  `NoiseBasedChunkGenerator.iterateNoiseColumn` walks down from the dimension ceiling and returns at
  the first match, so `ChunkSampler.columnTop` does that and `baseHeight` uses it. Heights are
  remembered per column and heightmap, and a column already sampled for `baseBlock` answers without
  sampling anything again.
  
  No generated world moves. The aquifer part is the reason to say so: it is widely assumed that Java
  samples this column with aquifers off, because it used to. 26.3's `iterateNoiseColumn` builds its
  `NoiseChunk` from the dimension's own fluid picker and the settings' `aquifers` block, so an
  underground lake is part of the surface a structure settles onto. Over 11,520 columns and 253
  structure starts across three seeds, turning aquifers off would have moved 28 columns by up to 20
  blocks and dropped a cold ocean ruin 28 blocks through the sea floor.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4cf5c25`](https://github.com/JSPrismarine/JSPrismarine/commit/4cf5c25c105f4d7dbea3d1d877d67cce48006234) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse y-interpolation results within a density cell

- [#2656](https://github.com/JSPrismarine/JSPrismarine/pull/2656) [`2515674`](https://github.com/JSPrismarine/JSPrismarine/commit/2515674ce840cad4dd80739d4042228c5e6172c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `parseDimensionType`, `parseLevelStem`, `parseWorldPreset`, `parseFlatGeneratorSettings` and `parseBiomeSource`, which read Java's `dimension_type`, level stem, `world_preset` and flat generator documents and build a `BiomeSource` from a stem's `biome_source`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c29803c`](https://github.com/JSPrismarine/JSPrismarine/commit/c29803c5f9f502263fa51fe8c29d41a846048019) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the three stages that sit on top of the terrain core: the surface pass, the biome sources and
  the carvers.
  
  `SurfaceSystem` walks a chunk column by column, keeps the stone depth counters above and below
  each solid block, derives the randomized surface depth from a positional random, and applies a
  material rule tree. All five `material_rule` types and all eleven `material_condition` types 26.3
  registers are implemented, including the four no other TypeScript implementation has: `bandlands`,
  `hole`, `steep` and `ore_vein`. The ore vein rule reuses `compileOreVeinRule`, which 1.21 drove
  from three noise router slots and 26.3 moved into the rule tree. Eroded badlands pillars and
  frozen ocean icebergs run here too, as they do in Java.
  
  `MultiNoiseBiomeSource` carries the seven-axis climate parameter model and Java's search tree over
  it, with `ClimateParameterList.findBruteForce` as the independent check. `FixedBiomeSource`,
  `CheckerboardBiomeSource` and `TheEndBiomeSource` cover the other three layouts. `BiomeManager` is
  the per-block getter the surface pass needs: it picks between the eight surrounding biome cells
  with Java's seeded jitter, so a biome-conditioned rule resolves per column rather than per chunk.
  
  `carveChunk` runs the `cave` and `canyon` carvers over the 289 source chunks that can reach one
  chunk, seeded per source chunk from the world seed, and records the result in a `CarvingMask`.
  
  Every expected value comes from Mojang's own classes through
  `utils/oracle/DumpSurfaceVectors.java`. Whole columns of the overworld, the nether and the end
  match Java block for block after the surface pass; one synthetic rule per condition type matches
  over the same chunk; the biome lookup matches over the full 7594-point overworld parameter list and
  the 5-point nether one; and both carvers open exactly the blocks Java opens in five chunks. Carver
  paths cannot match Bedrock Edition for the same seed, because Bedrock's generator is undocumented,
  so the Bedrock-facing tests check determinism and distribution instead and say so in their names.
