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
small Java program against the pinned 26.3 server jar and writes `vectors/*.json`; the tests read
those and compare exactly, not within a tolerance. What matches today:

| Stage | Vectors | Result |
| --- | --- | --- |
| `XoroshiroRandomSource`, `LegacyRandomSource` | 6 seeds, both sources, every method | exact |
| Perlin, simplex, smeared Perlin, normal, old blended noise | 6 positions each | exact |
| All eight noise router slots, all seven dimensions | 6 positions each | exact |
| All six aquifer functions, the three dimensions that have them | 6 positions each | exact |
| Overworld chunk columns with aquifers applied | 9 columns, 384 blocks each | exact |

Refresh the vectors with `pnpm --filter @jsprismarine/worldgen run vectors`. The command prepares
the pinned jar automatically and needs a JDK 25 or newer to compile and run the Java oracle.

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
its three draws in Java's order.

**Chunk sampling.** `ChunkSampler` samples `final_density` per block and runs the aquifer over the
result, for one block, one column or a whole 16 by 16 chunk. `column` and `fill` go top-down;
`forEachCellBlock` walks the chunk one interpolation cell at a time, which is what a generator
filling a whole chunk should use. A sample answers the same in either order, so the choice is
only about how long an `interpolated` node can hold its eight cell corners: a column walk leaves
a cell every eight blocks, a cell walk every 128.

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

## Known gaps

- The scalar sampler remains the default. The opt-in volume evaluator and its current measurements
  are described in [Volume density prototype](#volume-density-prototype); it is slower on the
  measured overworld graph and only handles a subset of node types. A chunk's fill reads nothing
  outside itself, so a server can also raise throughput by generating several chunks at once.
- The random sources use `BigInt` for their 64-bit state. That is exact and slow, and it is the
  reason `PositionalRandomFactory.at` is the most expensive call in the ore vein stage.
- Nothing here reads a data pack. `WorldgenData` takes the three registries as maps of parsed JSON,
  which is what `@jsprismarine/packs` produces.

## Volume density prototype

`ChunkSampler` can evaluate final density into typed arrays one interpolation cell at a time:

```ts
const sampler = new ChunkSampler(state, {
    chunkX: 3,
    chunkZ: -5,
    useVolumeDensity: true
});
```

The option affects `forEachCellBlock`, which is the chunk-fill path. It defaults to `false`, so
`fill`, `column` and other callers keep using the scalar evaluator. The volume evaluator writes
`Float64Array` results in x-fastest, then z, then y order. A sampler reuses its output and
intermediate buffers across cells.

The volume compiler evaluates constants, unary arithmetic, `add`, `sub`, `min`, `max`, and
`clamp` over arrays. It also handles `mul` and `div` when either operand is constant. All other
node types, including noise, gradient, cache, interpolation, spline, rounding, `pow`, `slice`,
and selection nodes, use the existing scalar compiler. Dynamic-by-dynamic `mul` and `div` also
stay scalar because they can skip their right operand when the left value is zero.

`RandomState` caches each compiled volume plan for that state. Every call to `volumeSampler`, and
every `ChunkSampler` using `useVolumeDensity`, gets its own mutable workspace. Keep each evaluator
and `SampleContext` exclusive to one active chunk at a time. The scalar `SampleContext` caches
remain per chunk; the volume workspace stores intermediate values for one cell and retains its
largest capacity until that sampler is discarded. Cells larger than 4,096 blocks use the scalar
path to cap per-evaluator memory.

Run `pnpm --filter @jsprismarine/worldgen run bench:density-volume` to compare the overworld
`final_density` graph and a whole chunk fill. It checks scalar and volume digests, then runs the
complete checked-in Java chunk corpus through `forEachCellBlock`: one overworld chunk with nine
captured columns, each 384 blocks tall. Every captured state is compared with the Java vector, and
the full 98,304-block digest is compared between scalar and volume evaluation. It repeats that
chunk independently with 0, 1, 2, and 4 worker threads and fails if any digest changes. The worker
runs check evaluator isolation and deterministic output; they do not measure chunk-pool throughput.
The report includes the 1-, 5-, and 15-minute load averages at the start and end, and marks the run
quiet only when the 1-minute load at both points is at most one quarter of the logical CPU count,
with a minimum limit of one. On Windows, where Node does not report load averages, both the
availability and quiet flags are false.

Both chunk-fill arms disable proven-cell skipping so every density and aquifer call is exercised.
The allocation pass runs five fresh child processes per arm with `--expose-gc`. It warms the
sampler, forces collection before the baseline, samples V8 heap allocations at 1,024-byte
intervals for one fill, then records `process.memoryUsage()` before and after a forced collection
while the sampler remains live. The V8 heap figure is a sampled allocation estimate, not an exact
allocation count. The post-GC ArrayBuffer delta measures backing storage retained by one live
sampler; the post-fill snapshot may also include temporary buffers not yet collected.

On Node 26.12.1, Darwin arm64, the latest run reported `host.quiet: false`: the 1-minute load
average was 10.43 at the start and 9.84 at the end, above the limit of 2 for this 8-CPU host.
Treat these timings and allocation samples as exploratory, and rerun the command when it reports
`host.quiet: true`. The best-of-three density timings were 18.43 ms scalar and 23.45 ms volume for
98,304 samples, or 5.33 million versus 4.19 million samples per second. Full chunk fills took
24.88 ms scalar and 31.18 ms volume. The volume plan used six instructions, three scalar fallbacks,
one workspace growth, 6,144 bytes of retained intermediate arrays, and a 1,024-byte cell output
buffer. Both arms produced full-chunk digest `7c1ff94d`; all nine Java columns matched, with corpus
digest `2be57e2e`, at worker counts 0, 1, 2, and 4.

Across five memory runs, sampled JavaScript heap allocation had a median of 200,912 bytes for
scalar (range 189,840–208,816) and 199,040 bytes for volume (range 174,656–207,744). Live
ArrayBuffer growth after collection was 690,407 bytes scalar and 697,575 bytes volume, including
the volume evaluator's additional 7,168 retained bytes. Heap used after collection grew by
113,400 bytes scalar and 103,136 bytes volume. The noisy run does not establish a performance or
allocation advantage; the volume path remains opt-in, and the scalar sampler remains the default.
The checked-in Java chunk corpus is limited to one chunk; the six additional full-chunk goldens
extend scalar-volume digest coverage but are not additional Java captures.

## The surface pass, the biomes and the carvers

Three stages sit on top of the terrain core. Each reads the seams the section above lists, and
each is verified against Mojang's classes the same way: `utils/oracle/DumpSurfaceVectors.java`
writes `vectors/surface-*.json` and `vectors/biome-*.json`, and the tests compare exactly.

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
  DumpSurfaceVectors "$JAR" packages/worldgen/vectors
pnpm prettier --write packages/worldgen/vectors/surface-*.json packages/worldgen/vectors/biome-*.json
```

Run it from inside `node_modules/.cache/jsprismarine/`: Mojang's logger writes a `logs/` directory
into the working directory.

`utils/oracle/DumpClimateTies.java` writes `vectors/climate-ties.json` the same way. It runs every
lookup on a new thread, because Java keeps the previous result in a thread-local.

`utils/oracle/DumpCarverBiomes.java` writes `vectors/carver-biomes.json` and takes one argument,
the output directory. Compile and run it the same way as the surface dumper.

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
