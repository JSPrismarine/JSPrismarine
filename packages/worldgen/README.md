# @jsprismarine/worldgen

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/worldgen)](https://www.npmjs.com/package/@jsprismarine/worldgen)

Java Edition's terrain stack in TypeScript: the two random sources, the five noise kinds, all 44
density function operators, the noise router, aquifers, ore veins and a chunk-shaped sampler.
Everything is read from Mojang's published `worldgen/*` JSON at load time, and everything is
pinned to Java Edition 26.3.

```ts
import { ChunkSampler, RandomState, WorldgenData } from '@jsprismarine/worldgen';

const data = new WorldgenData({ densityFunctions, noises, noiseSettings });
const settings = data.settings('minecraft:overworld');
const state = new RandomState(data, 1234n, settings);

const sampler = new ChunkSampler(state, { chunkX: 3, chunkZ: -5 });
sampler.blockAt(48, 4, -80); // { state: 'minecraft:water', scheduleFluidUpdate: false }
```

Block states come out as Java identifiers. Translating them to Bedrock is
`@jsprismarine/mapping`'s job, so nothing here names two editions.

## Parity

Every expected value in the test suite comes from Mojang's own classes. `utils/oracle/` compiles a
small Java program against the pinned 26.3 server jar and writes `vectors/<release>/*.json`, one
directory per Java release; the tests read the default release's and compare exactly, not within a tolerance. What matches today:

| Stage | Vectors | Result |
| --- | --- | --- |
| `XoroshiroRandomSource`, `LegacyRandomSource` | 6 seeds, both sources, every method | exact |
| Perlin, simplex, smeared Perlin, normal, old blended noise | 6 positions each | exact |
| All eight noise router slots, all seven dimensions | 6 positions each | exact |
| All six aquifer functions, the three dimensions that have them | 6 positions each | exact |
| Overworld chunk columns with aquifers applied | 9 columns, 384 blocks each | exact |
| World blender over <!-- fact:blending.vectorRecords -->17<!-- /fact --> synthetic old chunks | <!-- fact:blending.vectorRecords -->17<!-- /fact --> records, <!-- fact:blending.vectorCenters -->4<!-- /fact --> chunks of offsets, densities, biomes and carving, and fastutil's map order | exact |

Refresh the vectors with `pnpm --filter @jsprismarine/worldgen run vectors`, adding `-- --java <release>`
for a pinned release other than the default. The command prepares the pinned jar automatically and
needs the JDK the jar's `version.json` declares to compile and run the Java oracle.
The oracle does not compile against the 26.4 snapshots yet, because 26.4 changed
`RandomState.create`, the `NoiseChunk` constructor and `NoiseGeneratorSettings.defaultBlock`. A
26.4 preview therefore has no vectors, and the refresh fails for it, until [#3284](https://github.com/JSPrismarine/JSPrismarine/issues/3284) lands.

26.3 computes the whole density and noise stack in single precision. This package rounds through
`Math.fround` at every point Java narrows a value, which is why the comparisons above are exact
rather than approximate. The coordinate arithmetic inside the noise functions stays double, as it
is in Java.

## Why not deepslate

The plan's decision 6 made `misode/deepslate` the default dependency for density functions, noise,
randoms and biome lookup. deepslate 0.27.2 (MIT, published 2026-09-27) does track 26.3: it reads
the new `base_octave` and `amplitude_modifiers` noise schema, seeds octaves from
`fromHashOf("octave_<index>")`, and knows all 44 density function types plus the `aquifers` block.
The decision was reasonable. Four things measured against the real jar changed it.

- **Precision.** 26.3 computes `Noise.get`, `DensitySampler.sampleValue` and `DensityBuffer` in
  `float`. deepslate's noise and density paths are double throughout, and only its cubic spline
  rounds. Sampling one Perlin octave both ways against Java's own output: the single-precision
  form matched all six golden positions exactly, the double form matched none of them, by up to
  1.4e-7. That is small, and it is still the difference between "the same world" and "nearly the
  same world", which is the whole claim this package exists to support.
- **Two random sources deviate.** `XoroshiroRandom.nextLong` tests `value > 2^63` where Java's
  signed wrap is `>= 2^63`, so the single most negative long comes back positive.
  `LegacyRandom.nextDouble` is `next(30) * 2^-30`; Java's is
  `((next(26) << 27) + next(27)) * 2^-53`. Neither source has `nextGaussian`, and the all-zero
  Xoroshiro state is not substituted. Terrain does not touch `nextGaussian`, but carvers and
  features do.
- **An unknown type evaluates to zero.** `DensityFunction.fromJson` returns `Constant.ZERO` for a
  type it does not recognize, so the next schema change arrives as different terrain rather than
  as an error. This package throws on an unknown type, a missing field and a reference cycle.
- **The import is wide.** `deepslate/worldgen` reaches 118 modules and all three dependencies,
  `gl-matrix`, `md5` and `pako`, because `worldgen` imports `core`, which imports the shared math.

`NormalNoise.createForLegacyNetherBiome` also carries a typo, `amplitudes:` for `amplitude:` in
the second stack, which drops the value factor from the nether's temperature and vegetation
noises.

deepslate stays the reference this implementation was read against, and it is the right thing to
reach for when a 1.21-shaped pack or a browser-side preview is the problem. For 26.3 terrain
intended to match Java block for block, the precision gap alone is disqualifying.

## What it implements

**Randoms.** `XoroshiroRandomSource` and `LegacyRandomSource` with `nextInt`, `nextInt(bound)`,
`nextLong`, `nextBoolean`, `nextFloat`, `nextDouble`, `nextGaussian`, `fork` and `forkPositional`;
`XoroshiroPositionalRandomFactory` and `LegacyPositionalRandomFactory` with `at`, `fromHashOf` and
`fromSeed`; the Stafford seed mixing, Java's position hash and `String.hashCode`.

**Noise.** `PerlinNoise`, `SmearedPerlinNoise`, `SimplexNoise`, the flat `NoiseStack` that replaced
the old octave list, `NormalNoise` over the 26.3 parameter schema, the legacy nether octave chain,
and `old_blended_noise` with its three fractal Brownian motion stacks.

**Density functions**, all 44 types 26.3 registers:

| Group | Types |
| --- | --- |
| Sources | `constant`, `gradient`, `noise`, `shift`, `shift_a`, `shift_b`, `old_blended_noise`, `end_outer_islands`, `distance_to_point` |
| Chunk context | `beardifier`, `blend_alpha`, `blend_offset`, `blend_density` |
| Unary | `abs`, `square`, `cube`, `sqrt`, `half_negative`, `quarter_negative`, `reciprocal`, `negate`, `squeeze`, `log`, `sign` |
| Rounding | `floor`, `round`, `ceil`, `truncate` |
| Binary | `add`, `sub`, `mul`, `div`, `min`, `max`, `pow` |
| Selection | `clamp`, `lerp`, `range_choice`, `interval_select`, `spline` |
| Structural | `cache`, `interpolated`, `slice`, `find_top_surface` |

The vanilla 26.3 data uses 34 of them; the other 10 are available to data packs.

Trees are parsed once, references resolved eagerly, and each tree compiled once. The closure
compiler is the default. `RandomState` also accepts `{ generatedFunctions: true }` as its optional
fourth argument to prototype JavaScript evaluators for supported arithmetic nodes; stateful and
unsupported nodes stay closures, and hosts that reject dynamic code fall back to closures. A
`cache` node gets a memo slot in the `SampleContext`, and an `interpolated` node records its cell
corners there, which is what makes a full overworld chunk 0.63 seconds instead of 16.7.

The prototype stays opt-in because it has no qualifying quiet-host result yet. Run
`pnpm --filter @jsprismarine/worldgen run bench 5` to compare the closure and generated evaluators.
The benchmark uses seed `1234`, four fixed overworld chunks, two warmups, seven timed repetitions
per process, and five interleaved fresh-process rounds. It checks output stability between process
rounds and verifies the block digest across the closure, generated, and cell-skip arms. It reports the
runtime, CPU, memory, load averages, median and range for chunk time, compilation time, retained
heap after garbage collection, generated source size, and closure fallbacks. It marks the run
quiet only when the one-minute load average at both ends is at most one quarter of the logical CPU
count, with a minimum limit of one.

The benchmark fills four overworld chunks; it is not broad-corpus evidence. The density compiler
test compares Float32 output bits for every checked-in density function and every router and
aquifer root across seeded coordinates and interpolation boundaries. Java goldens and the terrain
parity row remain separate checks.

**Settings and the router.** `parseNoiseGeneratorSettings` reads a `worldgen/noise_settings`
document into the eight router slots (`temperature`, `vegetation`, `continents`, `erosion`,
`depth`, `ridges`, `chunk_surface_level`, `final_density`), the six aquifer functions, the vertical
extent, the default block and fluid, the sea level, the material rule reference and the random
source flag.

1.21's router had fifteen slots. In 26.3 the four aquifer entries moved into the `aquifers` block,
the three vein entries moved into the `minecraft:ore_vein` material rule, and
`initial_density_without_jaggedness` became `chunk_surface_level`. Code written against the
fifteen-slot shape does not load 26.3 data.

**Aquifers and ore veins.** `NoiseBasedAquifer` is the jittered 16 by 12 by 16 cell grid with its
barrier pressure, floodedness thresholds and lava rule. `createGlobalFluidPicker` builds the
dimension-wide fluid surface. `compileOreVeinRule` implements the `minecraft:ore_vein` rule with
its three draws in Java's order. Given a cell bound from `RandomState.boundSampler`, it bounds the
vein density once per interpolation cell and skips the cells where it cannot be positive, which
in vanilla is almost all of them; the blocks and draws stay the same.

**Chunk sampling.** `ChunkSampler` evaluates `final_density` and runs the aquifer over the
result, for one block, one column or a whole 16 by 16 chunk. `forEachCellBlock` walks the chunk one
interpolation cell at a time and is what a generator filling a whole chunk should use: it fills
each cell's densities at once through a `CellProgram`, which evaluates the density tree one node at
a time over the cell's 128 blocks rather than one closure chain per block. The program is flat:
one record of 32-bit words per distinct node in `CellProgram.nodes`, its constants in
`CellProgram.constants`, the form a native interpreter will read. Its `interpolated`
nodes fill cells in Java's volume order, the order `doFill` builds terrain in. `density`, `column`
and `fill` sample one block at a time in the order of Java's per-block `sampleValue`. The two
orders differ in the last bits of a float, so they can differ at a block whose density sits within
those bits of zero.

**Dimensions.** Five parsers read the documents that bind a dimension to a generator, all with
path-qualified errors. `parseDimensionType` reads a `dimension_type` file in its 26.3 shape
(`has_fixed_time`, `skybox`, `cardinal_light`, `attributes`), applies the wiki's defaults for the
absent fields and keeps `attributes` as a map of raw JSON. `parseLevelStem` reads a stem's
`type` and `generator`; a `minecraft:noise` generator keeps its `settings` id and parses its
`biome_source`, a `minecraft:flat` generator parses its layers or keeps the
`flat_level_generator_preset` id it names for a generator factory to resolve, `minecraft:debug`
has no fields, and an unknown kind keeps `{ type, settings }` for a generator factory to read.
`parseWorldPreset` reads a `worldgen/world_preset` file into a map of stems and requires
`minecraft:overworld`. `parseFlatGeneratorSettings` reads the `settings` object of a flat
generator or a `flat_level_generator_preset`, with Java's `height` per layer rather than this
server's `size`. `parseBiomeSource` builds a `FixedBiomeSource`, `CheckerboardBiomeSource`,
`MultiNoiseBiomeSource` or `TheEndBiomeSource` from a stem's `biome_source`; a `multi_noise`
`preset` resolves through the parameter lists the caller passes, keyed by
`multi_noise_biome_source_parameter_list` id, because the datapack's two list files only name
the preset and the climate boxes live in the data generator's `reports/biome_parameters`.
Nothing here decides what a dimension type means to a Bedrock client; the
server joins the parsed type with `@jsprismarine/mapping`'s overlay, as
[docs/data-driven/dimensions.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/data-driven/dimensions.md) describes.

## Seams left open

The terrain core is the bottom of the stack. Four stages sit on top of it, and each has an
injection point rather than a stub:

- **The surface pass** reads `NoiseGeneratorSettings.materialRule`, which this package resolves to
  an identifier and does not interpret. It needs `ChunkSampler.sample` for
  `chunk_surface_level`, the compiled `minecraft:ore_vein` placer from `compileOreVeinRule`, and a
  per-column biome getter. Java's `material_rule` and `material_condition` registries are its
  input.
- **The biome source** reads the six climate slots of the router through `RandomState.sampler`.
  Multi-noise lookup, the parameter list and the biome registry belong to it.
- **Features and structures** take `RandomState.randomFactory(name)` for their positional randoms.
  Nothing in this package draws from a sequential stream, so a feature stage can be added without
  disturbing terrain.
- **Carvers** run between the chunk fill and the surface pass. `ChunkSampler.blockAt` and
  `ChunkSampler.column` return plain values rather than writing into a chunk, so a carver can sit
  between them and whatever stores the result.
- **The world blender and the structure beard** are `SampleContext.blendAlpha`,
  `SampleContext.blendOffset`, `SampleContext.blendDensity` and `SampleContext.beardifier`. They
  default to the values Java uses outside a blending region, so terrain is correct without them.
  `Blender.install` fills the first three; [The world blender](#the-world-blender) covers it.

## Noise in the native library

Every `worldgen/noise` entry is an octave stack of Perlin noise, and `old_blended_noise` samples
three stacks of smeared Perlin noise. When
[`@jsprismarine/native-worldgen`](../native-worldgen/README.md)'s library loads on the thread, a
`RandomState` mirrors each of those stacks into it and samples it there. The bits are the same: the
C does each `f32()` as one float operation and is built without fused multiply-adds. A chunk's
terrain fill then runs no octave in TypeScript, in every vanilla noise setting.

The trees under `final_density`'s `interpolated` nodes, which run at each cell's corners, run in
the library too. `DensityFunctionCompiler` lays each one out as a point program that the C
evaluates one corner at a time, with the closures' bits. A sample whose context sets a structure or
blending hook the tree reaches keeps its closure, since those hooks live in TypeScript; a hook the
tree never reaches, such as a structure's beard, which vanilla adds outside the `interpolated`
nodes, leaves it native. So does a tree that reaches `pow`, `log` or the end islands' noise. The aquifer, the surface pass's preliminary surface
and ore veins, and the climate sampler read their trees the same way through
`RandomState.densitySampler`. `RandomState.nativeSampler` gives a tree's native evaluator alone.
The biome climate search runs there too: a climate index registers its flattened tree with the
library on its first lookup and finds the same box, ties and Java's prior-result seed included.
`{ native: false }` on `ClimateParameterList` or `SharedClimateParameterList` keeps the TypeScript
search. `BiomeManager` derives each biome lattice point's jitter there with the same bits, and
`new BiomeManager(resolver, zoomSeed, { native: false })` keeps the TypeScript generator steps.

Without a build for the machine, or under a runtime without an FFI, every noise stays in
TypeScript. `new RandomState(data, seed, settings, { nativeNoise: false })` keeps it there on
purpose, which the `worldgen.terrain` parity family does to hold both paths to Java's vectors. The
two nether noises Java still builds through the pre-1.18 octave chain, and the end islands' simplex
noise, stay in TypeScript for now.

## The world blender

Java keeps the terrain of a chunk an older generator made, and bends the terrain of each new chunk
next to it so the two meet without a cliff. `blending/Blender.ts` and `blending/BlendingData.ts`
port that machinery from <!-- fact:java.version -->26.3<!-- /fact -->.

Which chunks are old is the caller's decision, because only the caller knows how chunks are
stored. Java decides by the chunk's `DataVersion`: anything saved before <!-- fact:blending.oldBelowDataVersion -->4997<!-- /fact -->, the version <!-- fact:java.version -->26.3<!-- /fact -->
registers `BlendingDataFix` at, is old. `blending/generationVersion.ts` exports that boundary, the
version this package generates and `isOldGenerationDataVersion`.

The caller does three things:

1. For each old chunk, it builds a `BlendingData` with `BlendingData.unpack({ minSection, maxSection })`
   and calls `calculate(view, newSidesOf(x, z, isOld))`, which asks whether each of the chunk's
   eight neighbors is old too. The `OldChunkView` answers three questions
   about the stored chunk: whether a block is one of `BLENDING_SURFACE_BLOCKS`, whether it is
   ground in Java's sense (it has a collision shape and is not air, leaves, a log or a mushroom
   block), and which Java biome a quart holds.
2. For the chunk it is generating, it calls `Blender.of(chunkX, chunkZ, lookup)`. The lookup is
   asked about every chunk within <!-- fact:blending.rangeChunks -->7<!-- /fact --> chunks, `HEIGHT_BLENDING_RANGE_CHUNKS`. With no old chunk
   among them, the result is `Blender.EMPTY`, which changes nothing.
3. It calls `blender.install(sampleContext)` before sampling, wraps its noise biome lookup with
   `blender.biomeResolver(...)` when it fills the chunk's biomes, and opens a carved block only
   where `blender.carvingFilter` allows it.

A `BlendingData` crosses a worker boundary as `snapshot()`, a structured-clone-friendly record of
typed arrays, and comes back with `BlendingData.fromSnapshot`.

Two details follow Java exactly even though they look odd:

- The blender walks its old chunks in the order fastutil's `Long2ObjectOpenHashMap.forEach` does.
  That order decides which of two biomes at the same distance wins and the order weighted sums
  add up in. `blending/longHashOrder.ts` replays the map.
- In <!-- fact:java.version -->26.3<!-- /fact --> the carving filter answers true within <!-- fact:blending.carvingDistance -->4<!-- /fact --> blocks of old terrain, and
  `applyCarvingMask` opens a marked block only where it answers true. 1.18 used the same test to
  skip those blocks. The bytecode of both methods confirms the <!-- fact:java.version -->26.3<!-- /fact --> reading, so next to an old
  chunk, caves open only near the old chunk.

## Known gaps

- Density functions are evaluated one block at a time. A typed-array volume evaluator was
  prototyped and removed: it handled only arithmetic nodes, ran slower on the measured overworld
  graph, and is recorded in [#2773](https://github.com/JSPrismarine/JSPrismarine/issues/2773). A
  chunk's fill reads nothing outside itself, so a server can raise throughput by generating several
  chunks at once.
- The random sources use `BigInt` for their 64-bit state. That is exact and slow, and it is the
  reason `PositionalRandomFactory.at` is the most expensive call in the ore vein stage.
- Nothing here reads a data pack. `WorldgenData` takes the three registries as maps of parsed JSON,
  which is what `@jsprismarine/packs` produces.

## The surface pass, the biomes and the carvers

Three stages sit on top of the terrain core. Each reads the seams the section above lists, and
each is verified against Mojang's classes the same way: `utils/oracle/DumpSurfaceVectors.java`
writes `vectors/<release>/surface-*.json` and `vectors/<release>/biome-*.json`, and the tests
compare exactly.

**The surface pass.** `SurfaceSystem.buildSurface` walks a chunk column by column from the top
down, counting how far each solid block sits from the opening above it and the opening below it,
and applies the dimension's material rule tree. All five `material_rule` types and all eleven
`material_condition` types 26.3 registers are implemented:

| Group | Types |
| --- | --- |
| Rules | `block`, `bandlands`, `sequence`, `condition`, `ore_vein` |
| Conditions | `biome`, `noise_threshold`, `vertical_gradient`, `y_above`, `water`, `temperature`, `steep`, `not`, `hole`, `above_preliminary_surface`, `stone_depth` |

A tree is parsed once into `MaterialRuleNode` values and compiled once into closures bound to a
`MaterialRuleContext`. Conditions that depend only on the column cache their answer against a
per-column counter and conditions that depend on the block cache against a per-block counter,
which is what keeps the surface noise at 256 samples per chunk instead of one per block. Eroded
badlands pillars and frozen ocean icebergs are code rather than rules in Java, and they are code
here too.

**The biome sources.** `MultiNoiseBiomeSource` holds the seven-axis climate model: six parameter
ranges plus the tie-breaking offset, quantized by Java's single-precision multiply by 10000.
`ClimateParameterList` builds the same search tree Java builds over the vanilla overworld's 7594
parameter points and answers a nearest-box query through it; `findBruteForce` is the linear scan
the tests check it against. When two boxes are exactly as near, Java keeps the one its thread found
last, so its answer depends on that thread's earlier lookups. `ClimateParameterList` returns the box
that comes first in the tree instead, which is Java's answer for a thread with no earlier lookup.
A biome then depends on the seed and the position only, whatever order chunks generate in.
`FixedBiomeSource`, `CheckerboardBiomeSource` and `TheEndBiomeSource` cover the other three
layouts.

`BiomeManager` is the per-block getter the surface pass needs. A biome source answers per 4 by 4
by 4 cell, and Java does not snap a block to its own cell: it picks whichever of the eight
surrounding cell corners is nearest after a seeded jitter, so a biome edge wanders by a block or
two. Resolving one biome per chunk instead puts the wrong block on every column the chunk's other
biomes own.

**The carvers.** `carveChunk` runs the `cave` and `canyon` carvers over the 289 source chunks
within eight chunks of the target, seeding each from the world seed and the source chunk position,
and records the openings in a `CarvingMask`. Trigonometry goes through Java's 65536-entry sine
table rather than `Math.sin`, because the two differ in the last bits and a tunnel walks a hundred
steps.

`carversFromNoiseBiome` picks a source chunk's carver list from the biome source's cell at
`(chunkX * 4, 0, chunkZ * 4)`, the way Java's `getBiomeGenerationSettingsForCarver` does. It skips
`BiomeManager`, whose jitter moves the biome at a chunk corner in about 1.5% of overworld chunks.

### Parity

| Stage | Vectors | Result |
| --- | --- | --- |
| Surface pass, whole columns | 9 columns in each of overworld, nether and end | exact |
| One synthetic rule per condition type | 15 rules, 9 columns each | exact |
| Climate parameter lookup | 7594 overworld points, 5 nether points, 8 targets each | exact |
| Search tree against a brute-force scan | 8 oracle targets plus a 405-point grid per list | identical |
| Climate ties | 3 overworld cells, a fresh thread and a thread primed with each tied biome | fresh-thread answer, whatever the history |
| Biome zoomer and its seed hash | 6 positions, 6 seeds | exact |
| End biome source | 32 cells over all five end biomes | exact |
| Carvers | `cave` and `canyon`, 5 chunks each, every opened block | exact |
| Carver selection | noise biome at the corner of 2304 chunks, seed 1234 | exact |

Carver paths cannot match Bedrock Edition for the same seed, because Mojang has not described
Bedrock's generator
([cross-edition-worldgen-parity.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/research/cross-edition-worldgen-parity.md) section
2). The tests that look across editions check determinism and distribution instead, and their
names say so. Everything above compares against Java Edition, where exact equality is the point.

### Refreshing these vectors

`utils/oracle/run.mjs` builds the terrain core's vectors. The surface dumper is a second program
beside it, run the same way:

```sh
pnpm --filter @jsprismarine/bedrock-data run ensure:java-server
JAR=node_modules/.cache/jsprismarine/java/26.3/extracted/META-INF/versions/26.3/server-26.3.jar
javac -cp "$JAR:node_modules/.cache/jsprismarine/java/26.3/libraries/*" \
  -d /tmp/surface-dumper packages/worldgen/utils/oracle/DumpSurfaceVectors.java
java -cp "/tmp/surface-dumper:$JAR:node_modules/.cache/jsprismarine/java/26.3/libraries/*" \
  DumpSurfaceVectors "$JAR" packages/worldgen/vectors/26.3
pnpm prettier --write packages/worldgen/vectors/26.3/surface-*.json packages/worldgen/vectors/26.3/biome-*.json
```

Run it from inside `node_modules/.cache/jsprismarine/`: Mojang's logger writes a `logs/` directory
into the working directory.

`utils/oracle/DumpClimateTies.java` writes `vectors/<release>/climate-ties.json` the same way. It runs every
lookup on a new thread, because Java keeps the previous result in a thread-local.

`utils/oracle/DumpCarverBiomes.java` writes `vectors/<release>/carver-biomes.json` and takes one argument,
the output directory. Compile and run it the same way as the surface dumper.

`utils/oracle/DumpBlendingVectors.java` writes `vectors/<release>/blending.json` and also takes only the
output directory. It builds old chunks as `ProtoChunk`s filled with a synthetic terrain that
`blending.test.ts` rebuilds block for block, and reaches the blender's private constructor and
carving filter by reflection, because `Blender.of` needs a running server. It also records the
jar's data version and the lowest one `IOWorker.isOldChunk` does not treat as old, which the test
compares with `blending/generationVersion.ts`.

`surface-registries.json` carries the `material_rule`, `material_condition`, `carver`,
`density_function`, `noise`, `noise_settings` and biome climate documents straight out of the jar,
so the whole suite runs with no jar present. Each document is one compact JSON string, because
Prettier reformats nested JSON into one field per line and that turns the 55 density functions
into 600 KB of whitespace.

### Decisions

- **`biomeClimate` is a required argument of `buildSurface`, not an optional one.** The
  `temperature` condition and the iceberg melt test read a biome's `temperature` and
  `temperature_modifier`. A default would make a rule tree that uses them quietly place the wrong
  block, which is the failure mode this package rejected deepslate over. `parseBiomeClimate` reads
  the two fields out of a `worldgen/biome` document, so supplying it is one line.
- **Quantized climate coordinates are numbers, not `BigInt`.** Java holds them as `long`, but they
  never leave `[-20000, 20000]` and a squared distance over seven axes stays under 2^53, so the
  arithmetic is exact either way and numbers are far cheaper. The single-precision multiply Java
  applies before truncating is kept, because it moves `0.0003` from 2 to 3.
- **`VerticalAnchor` and `WorldGenerationContext` live under `src/surface/`.** Both are shared with
  the carvers' height providers and, later, with feature placement. They sit beside the first stage
  that needed them rather than in a module of their own.
