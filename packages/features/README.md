# @jsprismarine/features

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/features)](https://www.npmjs.com/package/@jsprismarine/features)

Java Edition's decoration pass in TypeScript: all 58 feature types, the ten block state providers
and the value providers they are built from, all 18 placement modifiers, and the seeded pipeline
that runs them. Everything is read from Mojang's published `worldgen/*` JSON at load time and
pinned to Java Edition 26.3.

```ts
import { decorateChunk, FeatureLoader, TestFeatureWorld } from '@jsprismarine/features';

const loader = new FeatureLoader({
    feature: (id) => featureDocuments.get(id),
    placedFeature: (id) => placedDocuments.get(id),
    blockStateProvider: (id) => providerDocuments.get(id)
});

const world = new TestFeatureWorld();
decorateChunk(
    [{ feature: loader.placedFeatureById('minecraft:ore_diamond'), step: 'underground_ores', index: 0 }],
    { world },
    1234n,
    3,
    -5
);
```

Block states come out as Java identifiers, because that is what the data names.
`translatingWorld` is where a server attaches `@jsprismarine/mapping`, so nothing here knows that
two editions exist.

## Coverage

Measured against the pinned 26.3 data rather than quoted, by the gated corpus test in
`src/corpus.test.ts`.

| Registry | Registered | Implemented | Used by vanilla |
| --- | --- | --- | --- |
| `worldgen/feature_type` | 58 | 58 | 47 at the top level, 56 reachable through nesting |
| `worldgen/placement_modifier_type` | 18 | 18 | 15 |
| `worldgen/block_state_provider_type` | 10 | 10 | 9, counting `simple` in its shorthand form |
| `int_provider_type` | 8 | 8 | 8, counting `constant` as a bare number |
| `float_provider_type` | 4 | 4 | 4, same |
| `height_provider_type` | 6 | 6 | 6, counting `constant` as a bare anchor |
| `block_predicate_type` | 16 | 16 | 14 |
| `rule_test` | 10 | 10 | 7 |
| `worldgen/trunk_placer_type` | 10 | 10 | 10 |
| `worldgen/foliage_placer_type` | 12 | 12 | 12 |
| `worldgen/tree_decorator_type` | 11 | 11 | 10 |
| `worldgen/root_placer_type` | 1 | 1 | 1 |
| `worldgen/feature_size_type` | 2 | 2 | 2 |

All 240 configured features and all 273 placed features parse with zero errors. The top of the
usage table is `tree` 45, `simple_block` 37, `ore` 30, `random_selector` 21, `overlay` 10,
`weighted_random_selector` 8, and `block_column`, `fallen_tree`, `spring_feature` and
`vegetation_patch` at 6 each.

Two things changed in 26.3 that a loader written against 1.21 data gets wrong. `random_patch` is
gone, replaced by `projected_random_patchy_square`, which thins toward the corners of its square
instead of scattering uniformly. And `pointed_dripstone` and `dripstone_cluster` became
`speleothem` and `speleothem_cluster` with their two blocks configurable, which is what lets the
nether's sulfur spikes reuse them.

## The pipeline and its seeding

A placed feature is a configured feature plus a list of modifiers. `placeFeature` runs the list
and builds the feature at every position it yields.

The traversal is depth first, not stage by stage. The first position a modifier emits runs all
the way to the end of the chain before the second one starts. That decides the order of the
random draws, so a breadth-first version with the same modifiers produces a different world from
the same seed. `src/placement/pipeline.ts` reproduces Java's stack.

`decorateChunk` runs a whole chunk. It derives the population seed once from the world seed and
the chunk's corner, then reseeds the stream before each feature from that seed, the feature's
index in the flattened per-step list, and the step's ordinal. Three properties follow, and the
suite checks all three: the same seed and chunk produce the same blocks, a feature that draws
fifty extra numbers does not move the next one, and running a subset of the plan leaves the rest
where it was.

The eleven decoration steps run in Java's order: raw generation, lakes, local modifications,
underground structures, surface structures, strongholds, underground ores, underground
decoration, fluid springs, vegetal decoration, top layer modification. `orderDecoration` sorts a
plan into that order, by step and then by index within the step.

`WorldgenRandom` is not one of `@jsprismarine/worldgen`'s two sources. Java's class extends
`LegacyRandomSource` and overrides only `next(bits)`, so every derived draw uses
`java.util.Random`'s formulas over a Xoroshiro bit stream. Handing a feature a plain
`XoroshiroRandomSource` produces different numbers from the first float onward.

## The `FeatureWorld` seam

Features never see a chunk, a section, a palette or a Bedrock identifier. They read and write
Java block states through one interface.

```ts
interface FeatureWorld {
    readonly minY: number;
    readonly height: number;
    readonly seaLevel: number;
    readonly seed: bigint;
    readonly blocks: BlockOracle;
    getBlock(position: BlockPos): BlockState;
    setBlock(position: BlockPos, state: BlockState): boolean;
    getHeight(heightmap: HeightmapType, x: number, z: number): number;
    getBiome(position: BlockPos): string;
}
```

`BlockOracle` is a second, smaller interface for the facts about a block state that do not depend
on where it sits: `isAir`, `isSolid`, `isSturdy`, `isReplaceable`, `fluid`, `hasTag` and
`canSurvive`. It is separate because the answers are pure and shared. A server builds one oracle
from its block registry and tag tables and reuses it for every chunk, while a world adapter
exists for one decorated region. A feature still takes one object, because the oracle hangs off
the world.

Five optional members cover what a feature needs and world generation does not own:
`isColdEnoughToSnow` for `freeze_top_layer` and the lake's ice, `setBlockEntity` for the two
chests and the spawner, `placeTemplate` for `template` and `fossil`, `spawnEntity` for the end
spike's crystal, and `tagMembers` for the one state provider that enumerates a tag rather than
testing it. When one is absent the feature does the visible part and skips the rest rather than
failing.

`TestFeatureWorld` is the in-memory adapter the tests use. It records every write in order,
computes heightmaps from the stored blocks so a feature that reads a heightmap after writing sees
its own work, and takes its block facts from `createTestOracle`, which builds an oracle from
plain tables of air, fluid, replaceable and tagged identifiers.

`translatingWorld(target, mapper, blocks)` wraps a world that stores some other state type. That
is where `@jsprismarine/mapping`'s Java-to-Bedrock function goes, applied once at the seam rather
than inside every feature.

## Parity

Two layers, verified two different ways.

The layer below the features is checked against Java itself. `utils/oracle/DumpFeatureVectors.java`
compiles against the pinned 26.3 server jar and writes `vectors/features.json`, and the tests
compare exactly, not within a tolerance.

| Stage | Vectors | Result |
| --- | --- | --- |
| `setDecorationSeed` | 6 world seeds times 6 chunks | exact |
| `setFeatureSeed` and the first three draws | 36 chunks times 11 steps times 3 indices | exact |
| All 11 int providers | 24 draws each | exact |
| All 4 float providers | 24 draws each | exact |
| All 7 height provider shapes | 24 draws each | exact |
| `WeightedList.getRandomOrThrow` | 64 draws | exact |
| `Biome.BIOME_INFO_NOISE` | 5 positions | exact |
| `Mth.randomBetweenInclusive`, `nextInt`, `randomBetween`, `normal` | 16 rounds each | exact |

Refresh the vectors with `pnpm --filter @jsprismarine/features run vectors`, which needs the
pinned jar (`pnpm --filter @jsprismarine/bedrock-data run dump:java`) and a JDK 25 or newer.

The features and the placement modifiers themselves are checked by behavior and distribution
instead. A Java feature takes a `WorldGenLevel`, which cannot be stood up outside a running
server, so there is no cheap way to ask Java what blocks `minecraft:oak` puts where. The tests
assert shape, extent, draw counts and rates: an ore vein stays inside its bounding box across
twenty seeds, a geode's four shells nest, a lake's fluid sits below its air, an oak's trunk is a
contiguous run of four to six logs with leaves only above it, and the patchy square thins toward
its corners.

Against Bedrock the positions cannot match at all, and this is not a gap that effort closes.
Bedrock's generator uses an undocumented random source, so the same world seed picks different
positions even where the rules agree.
[cross-edition-worldgen-parity.md](../../docs/research/cross-edition-worldgen-parity.md) section 4
measures where the rules do agree: coal ore's counts, heights, sizes, discard chances and
distributions are identical in the two editions, the amethyst geode agrees on chance, height
range, block layers and layer probabilities, and the plains flower patch agrees on its 64 tries
and its plus or minus 6 by 2 spread while disagreeing on the rate. Test distributions, not
equality.

## Precision

Java computes much of this in `float`, and the places where it does are reproduced with
`Math.fround` rather than left as doubles. Two cases are worth naming because they are easy to
miss.

`Mth.sin` and `Mth.cos` read a 65536-entry `float` table rather than calling `Math.sin`. The two
differ by up to about 5e-5, which is enough to move an ore vein's sphere radii across a block
boundary. `support.ts` has the table; the worldgen code that calls `Mth.sin` uses it, and the
code that calls `java.lang.Math.sin` uses `Math.sin`.

A tree collects its logs, leaves and roots into `HashSet`s, and the decorators then walk them.
Java's iteration order is the hash table's bucket order, so which log gets the beehive and which
leaf grows a vine depend on `BlockPos.hashCode` and on how far the table has grown.
`JavaHashSet` reproduces that order.

## What a server still has to supply

Seven behaviors live outside world generation in Java too, and they stay outside here. Each one
places its visible part and leaves the rest to the caller, so none of them fails silently.

- **The sculk spreader.** `sculk_patch` places the seed block. Java runs `SculkSpreader`, the same
  charge-and-cursor simulation the sculk catalyst uses at runtime.
- **The chorus plant.** `chorus_plant` places the flower. `ChorusFlowerBlock.generatePlant` grows
  it.
- **The multiface spreader.** `multiface_growth` attaches the first face and draws the roll that
  decides whether the block's own spreader continues.
- **Double plants and mossy carpet.** `simple_block` has two branches in Java for blocks that
  place more than one block, which need the block registry.
- **The pale moss patch.** The `pale_moss` tree decorator runs `minecraft:pale_moss_patch` from
  the feature registry, which the decorator context does not hold.
- **Structure templates.** `template` and `fossil` name a template and a processor list and hand
  them to `FeatureWorld.placeTemplate`, which is where `@jsprismarine/structures` attaches.
- **Loot, spawners, gateways and the end crystal.** `monster_room`, `bonus_chest`, `end_gateway`
  and `end_spike` place their blocks and report what belongs in them through `setBlockEntity` and
  `spawnEntity`.

## Known gaps

- `fossil` scans the origin's own column for the lowest surface, where Java scans the template's
  whole footprint. The two agree for the four vanilla fossils, which arrive from a heightmap
  already, and will differ for a datapack fossil wider than one block on sloped ground.
- The `matching_biomes` block predicate matches biomes by name. A `#tag` reference matches
  nothing, because this package holds no biome registry. No vanilla feature uses the predicate.
- `random_block` needs `BlockOracle.tagMembers` to enumerate a tag. Without it the provider
  yields nothing and the caller keeps the existing block, which is Java's behavior for an empty
  holder set.
- Block states are compared by identifier and property values, not by a palette index, so a
  `blockstate_match` rule test compares text. That is the same answer for every vanilla rule and
  cheaper than carrying a palette.

## Running the corpus test

It reads the vanilla datapack from disk, so it is gated:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
JSP_FEATURE_CORPUS=1 pnpm --filter @jsprismarine/features exec vitest run corpus
```

`JSP_VANILLA_DATAPACK` points at a local copy instead. Everything it reads is extracted game data
and therefore untrusted: it is parsed with `JSON.parse` and never executed.
