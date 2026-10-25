# Six reported world generation defects, measured

Diagnosed 2026-10-25 against commit `07581ce57a`, seed 1234, the `Overworld` generator the server
actually runs. Scope: for each symptom a player reported, what the mechanism is, whether it comes
from the one-chunk-at-a-time generation architecture or is independent of it, and where the fix
goes. Every number here came from running the real pipeline against Mojang's 26.3 data, not from
reading code. Java's side of each comparison is cited to
[java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md), which was read out of the
pinned unobfuscated server jar.

`Overworld` is the data-driven generator. `packages/prismarine/src/world/generators/Overworld.ts:24`
is a thin wrapper that builds a `DataDrivenGenerator` on the first chunk, and `GeneratorManager`
registers it under the name the config uses (`packages/prismarine/src/world/GeneratorManager.ts:10`).
A server with `generator: Overworld` runs everything described below.

## Verdict

| # | Symptom | Mechanism | Architectural? | Route |
|---|---|---|---|---|
| 1 | Trees on top of ice spikes | Defect A. Both features run in every chunk, and trees run in a later step than spikes | No | Fix now |
| 2 | "Inverted/filled spaghetti caves through the air" | Defect A. 1478 vines and 416 mangrove roots per four chunks, hanging through the canopy. The carvers are not involved | No | Fix now |
| 3 | Pretty much every block filled with a tree | Defect A. 171 placed features run in every chunk regardless of biome | No | Fix now |
| 4 | Trees cut off between chunks | Defect C. A chunk differs by 169 block positions depending on when its neighbors were generated, and the patch-back makes it worse, not better | Yes | Wait for the redesign |
| 5 | 10,000+ items drop during generation | Defect D. Generation drops nothing. Leaf decay on the first random ticks does, with Bedrock's radius-4 rule applied to Java-shaped trees, fuelled by defect A | No | Fix now, independently |
| 6 | Generation so slow the console stops responding | 1572 ms per chunk. Structures 56%, the 3x3 terrain window 43%, feature decoration 1% | Partly | Split: see section 6 |

Two further defects turned up that no symptom named. Both are latent, both are independent of the
redesign, and section 2 records them so they are not lost.

## Summary

- **Defect A, the decoration pass has no biome filter, explains symptoms 1, 2 and 3.** Every chunk
  runs every placed feature of every overworld biome. Measured at exactly 171 `placeFeature` calls
  per chunk in four chunks in four different biomes. One chunk came out holding jungle, mangrove,
  swamp, birch, spruce, dark oak and oak logs at once, plus badlands, savanna, desert and meadow
  grass patches.
- The filter exists and is never wired up. `biomeFilter` in
  `packages/features/src/placement/modifiers.ts:157` reads
  `context.featureBelongsToBiome?.(origin) ?? true`, and the only context the generator builds is
  `{ world: region.featureWorld() }` (`DataDrivenGenerator.ts:512`). `featureBelongsToBiome` has no
  caller anywhere in the repository. The doc comment above it claims "the chunk generator always
  supplies one".
- Java applies two filters where this applies none. The per-chunk candidate set is intersected with
  the biomes actually present in the 3x3 chunk area, and `BiomeFilter` then rejects each position
  whose biome does not list the feature ([java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md),
  summary point 10 and sections 536 and 630).
- **The carvers are not inverted.** Across 24 chunks, generating with and without them opened 9095
  blocks, filled 0, and changed 0 blocks above the uncarved terrain surface. Symptom 2 is vines.
- **Symptom 4 is architectural and the patch-back does not rescue it.** The same chunk generated
  first and generated last differs at 169 block positions. When the neighbors run afterwards their
  patches write 21 positions into the already-generated chunk, and the difference goes *up* to 182.
- **Generation cannot drop an item.** Every `ItemEntity` in the server is built at `World.ts:1678`,
  reachable only through `World.dropContents` (`World.ts:1642`); the generator writes only through
  `Chunk.setBlockRuntimeId` (`DataDrivenGenerator.ts:557` and `:486`). The flood is leaf decay on
  the first random ticks over the new terrain.
- One generated chunk holds 1173 leaf blocks. 59 of them have no log within 4 blocks, which is this
  server's decay rule; only 4 have none within 6, which is Java's. The radius-4 rule condemns 15
  times as many leaves as the trees were built for.
- **The time is noise, and the biggest single consumer is structures.** 1572 ms per warm chunk:
  structures 875 ms, the nine terrain tiles of the 3x3 window 681 ms, feature decoration about
  16 ms, carvers nothing measurable. A CPU profile puts about 55% of all samples in density function
  and Perlin noise evaluation inside `@jsprismarine/worldgen`.
- **The tests cannot catch defect A.** The only decoration assertion for this generator is
  `expect(changed).toBeGreaterThan(0)`
  (`packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.test.ts:152`). A chunk
  with one correct oak tree and a chunk with seven species of tree both pass it.

## How this was measured

A throwaway Vitest file beside the generator, driving `DataDrivenGenerator` with the real registries
from `node_modules/.cache/jsprismarine/vanilla-datapack/26.3` and the real data generator reports.
Four probes:

1. A `vi.mock` wrapper around `placeFeature` that counts calls and successes per chunk and labels
   each placed feature by walking `FeatureLoader.placedFeatureById`.
2. A differential: the same chunk generated with `carve: false` and `carve: true`, diffed block by
   block, classified into opened, filled and changed-above-surface.
3. A block census of what the full pipeline leaves above the height the bare terrain reached.
4. `node:inspector`'s sampling profiler around eight warm chunks, plus a wall-clock ladder across
   four combinations of stages.

The file has been deleted. The commands that rebuild it are at the end.

One caveat on reproducibility. Other sessions were rebasing and editing this worktree throughout,
which twice deleted the generator out from under a run and once pruned the workspace symlinks. Every
number below was taken against a tree that matched `07581ce57a` byte for byte in the generator, and
I verified that with `diff` before trusting each run.

## 1. Trees on top of ice spikes

Not a heightmap bug. The feature reads the right heightmap of the right chunk at the right stage.

`minecraft:ice_spike` is listed in decoration step 4, `surface_structures`. The trees are in step 9,
`vegetal_decoration`. `DataDrivenGenerator.decorate` walks `DECORATION_STEPS` in order, so the spike
is built and then the tree is placed on whatever the column now ends in.

The tree's `heightmap` placement modifier calls `GenerationRegion.heightAt`
(`GenerationRegion.ts:538`), which walks down from the column's top and returns the first position
whose state satisfies the heightmap predicate. Packed ice is solid, so it correctly returns the top
of the spike. The modifier did its job.

The defect is that both features ran in a chunk that lists neither. `placed_feature/ice_spike.json`
has four modifiers: `count 3`, `in_square`, `heightmap MOTION_BLOCKING`, `biome`. The last one is
the whole of its biome restriction, and it is a no-op here, so the spike is attempted three times in
every chunk of the world. What stops it most of the time is the feature's own
`can_place_on: minecraft:snow_block` guard, which limits it to columns where the surface rules laid
snow. That is any cold or high column, not just the ice spikes biome. The trees have no such guard,
so wherever snow and a tree feature coincide, the tree lands on the spike.

**Independent of the redesign. Fix with defect A.**

## 2. "Inverted/filled spaghetti caves through the air"

### The carvers are innocent

24 chunks generated twice, once with `carve: false` and once with `carve: true`, diffed position by
position:

```
24 chunks: opened=9095 filled=0 changedAboveSurface=0
```

Not one block went from air to solid, and nothing changed above the height the uncarved terrain
reached. The carvers do not write with inverted sense, and they are not run against terrain that has
not been written yet: `buildTerrain` fills the chunk from the sampler at `DataDrivenGenerator.ts:317`
before calling `carve` at `:336`.

### What the player is seeing

The census of everything the full pipeline leaves above the height the bare terrain reached, over
four chunks and 1024 columns:

```
4 chunks, 1024 columns: 8305 blocks sit above the bare terrain (8.1 per column)
height above bare surface: median 13, p90 19, max 23
   4375  minecraft:mangrove_leaves
   1478  minecraft:vine
    529  minecraft:oak_leaves
    416  minecraft:mangrove_roots
    294  minecraft:mangrove_log
```

1478 vines and 416 mangrove roots in four chunks, hanging in strings through a 13-block-deep canopy.
An ASCII slice through chunks (40,40) and (41,40) at the same z shows them as vertical and winding
runs of blocks standing in air that the bare terrain left completely empty.

`minecraft:vines` and `minecraft:classic_vines_cave_feature` are jungle features and
`minecraft:trees_mangrove` is a swamp feature. All three ran here because of defect A. Symptom 2 is
symptom 3 seen from below.

### Two real carver defects, currently latent

Both are worth recording because the next change in this area will trip over them.

**The carvers run before the surface pass; Java runs them after.** `DataDrivenGenerator.buildTerrain`
calls `carve` at `:336`, then `freezeSurfaceHeights` at `:338`, then `buildSurface` at `:339`. Java's
`terrain` status runs the noise fill, then `buildSurface`, then `generateCarvers`
([java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md), section 1, status 4). So
Java's carvers cut through finished surface material, and this server's surface rules run over
terrain that is already full of holes.

**The carvers have no replaceable check.** `DataDrivenGenerator.ts:421` skips a position only when it
holds bedrock or a fluid. Java tests the block against the carver's replaceable set, which excludes
air. `carver/cave.json` runs up to `y: {absolute: 180}`, so a tunnel whose geometry passes above the
terrain writes `minecraft:cave_air` into blocks that are already air.

Those two combine into a third thing that is waiting to go wrong. `GenerationRegion.afterWrite`
(`:358`) and `SurfaceSystem` (`packages/worldgen/src/surface/SurfaceSystem.ts:354`, against
`AIR = 'minecraft:air'` at `packages/worldgen/src/chunk/FluidPicker.ts:4`) both compare against
`minecraft:air` by name, so neither recognizes `minecraft:cave_air` as air. The region raises its
column ceiling to an airborne cave-air block, `freezeSurfaceHeights` captures that, and the surface
pass then starts its column walk in the sky and counts every cave-air block as stone. Today the
material rule declines to write anything there, which is why the differential measured zero. The
block oracle disagrees with both of them: `javaBlockOracle.ts:15` does treat cave air as air, which
is why feature heightmaps are unaffected.

**Independent of the redesign. The visible symptom is defect A. The two carver defects are separate
and small.**

## 3. Pretty much every block filled with a tree

### Defect A

`buildFeaturePlan` (`DataDrivenGenerator.ts:747`) iterates `this.biomeSource.possibleBiomes()`,
which is every biome the overworld can produce, and unions their `features` lists into one plan of
171 entries. `decorate` (`:508`) runs that whole plan for every chunk.

The plan is supposed to be global. Java builds the same global per-step list through
`FeatureSorter.buildFeaturesPerStep(biomeSource.possibleBiomes(), ...)`, because the feature's index
in that list is what seeds it, and the seed must not depend on which chunk you are in. What Java
then does and this does not is filter twice before running anything:

1. It intersects the step's candidate set with the biomes actually present in the 3x3 chunk area,
   read out of the section palettes and then `retainAll(biomeSource.possibleBiomes())`.
2. `BiomeFilter`, the `minecraft:biome` placement modifier that nearly every vanilla placed feature
   ends with, rejects each individual position whose biome's generation settings do not list the
   feature.

Both are cited in [java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md), summary
point 10.

This repository implements the second one and never gives it the information it needs:

```ts
// packages/features/src/placement/modifiers.ts:157
export const biomeFilter = (): PlacementModifier =>
    filter('biome', (context, _random, origin) => context.featureBelongsToBiome?.(origin) ?? true);
```

```ts
// packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts:512
const context = { world: region.featureWorld() };
```

`featureBelongsToBiome` appears three times in the repository: the type declaration, the `??` above,
and one unit test. No production caller sets it, so the modifier accepts every position.

### Measured

Four chunks in four different biomes:

| Chunk | `placeFeature` calls | Features that placed something |
|---|---|---|
| (0,0), ocean | 171 | 42 |
| (40,40) | 171 | 61 |
| (-60,25) | 171 | 58 |
| (120,-80) | 171 | 58 |

The call count is identical because the plan does not depend on the chunk. Chunk (40,40) placed
`trees_birch`, `trees_jungle`, `trees_mangrove`, `trees_swamp`, `trees_taiga`,
`dark_forest_vegetation` and `mushroom_island_vegetation`, and separately `patch_grass_badlands`,
`patch_grass_savanna`, `patch_dry_grass_desert`, `patch_grass_meadow`, `flower_cherry` and
`pale_moss_patch`. Its block census holds seven log species: jungle, mangrove, birch, spruce, oak,
dark oak and mushroom stem, with 1367 leaf blocks.

The rarity filters are implemented and are being applied. `rarity_filter` is at `modifiers.ts:108`
and `random_chance` at `:112`, both drawing from the reseeded stream. They are not the gap; the
biome check is.

### The fix

Give the context a `featureBelongsToBiome` that answers whether the placed feature being run is
listed for the biome at that position, and intersect the per-step plan with the biomes present in
the region before running it. Both pieces of data are already in the generator: `pipeline.biomes`
answers the biome and `registries.biomes` holds the feature lists. The index that seeds each feature
must stay global, so the filter has to skip the feature without changing its index, which is exactly
what Java does.

**Independent of the redesign. This is the single highest-value fix on the list, and it fixes three
of the six symptoms.**

## 4. Trees cut off between chunks

The one-chunk-at-a-time architecture, confirmed, and worse than expected.

`generateChunk` (`:206`) builds a 3x3 `GenerationRegion`, decorates only the center, and hands the
writes that landed outside the center to `applyFeaturePatch` (`:453`). Those patches go into
`pipeline.featurePatches` for a terrain tile that has not been built yet, and into
`applyPatchToChunk` (`:474`) for a chunk already handed out.

Generating one chunk first, then its eight neighbors, versus generating the eight neighbors first
and the chunk last:

```
positions differing, generated-first vs generated-last:          169
positions the neighbors later patched into the first chunk:       21
after patching, still differing from generated-last:             182
```

The patch-back applied 21 writes and left the chunk further from the correct answer than it started.
It is a partial, order-dependent overwrite, not a repair. A tree that straddles a border therefore
keeps whichever half the generation order happened to produce.

Three things make it worse in a running server, none of which the in-memory test above exercises:

- `applyPatchToChunk` writes straight into the `Chunk` object with `setBlockRuntimeId`. It never
  goes through `World.writeBlockRuntimeId` (`World.ts:1380`), which is the only path that records a
  block change for the client. A chunk already sent to a player keeps the old blocks until the
  player reconnects.
- Nothing marks the patched chunk dirty, so a chunk saved before the patch arrives loses it.
- `GENERATION_CACHE_SIZE = 128` (`:138`) bounds both `generatedChunks` and `featurePatches`. Past
  128 chunks the patch target has been evicted and the write is dropped entirely. The config in
  this repository has `preload-radius: 5`, which is 121 chunks, right at the edge.

**Architectural. Wait for the redesign.** Java gets this right by construction: `features` is the
only status allowed to write outside its own chunk, and it runs on a single-threaded executor with
every neighbor guaranteed to have reached `terrain` first
([java-chunk-generation-pipeline.md](java-chunk-generation-pipeline.md), summary points 3 and 7). A
patch-back onto a finished chunk is the wrong shape for the problem and no amount of care inside
`applyFeaturePatch` will fix it.

## 5. 10,000+ items dropping during generation

### Generation drops nothing

The hypothesis that generation writes route through the break path is wrong, and the whole chain was
checked rather than assumed.

Every `ItemEntity` in the server is constructed at one place, `World.ts:1678`, inside the private
`dropItem`, reachable only from `World.dropContents` (`World.ts:1642`). The generator never touches
a `World` writer. Its only block writes are `Chunk.setBlockRuntimeId` at `DataDrivenGenerator.ts:557`
(`toChunk`) and `:486` (`applyPatchToChunk`), which do not fire `onBreak`, `onPlace`,
`onNeighborChanged`, or schedule a block update.

`World.loadChunk` (`World.ts:798`) does not change that. `systems.onChunkLoaded` only primes
lighting, and nothing iterates the new chunk calling a per-block update or neighbor update.
Generated chests are written with their loot table unrolled on purpose
(`javaGeneratedContent.ts:80`), and structure template entities are never spawned at all.

### What actually drops

Leaf decay on the first random ticks over the new terrain, through
`leavesFamily.onRandomTick` (`packages/block-behaviors/src/families/plants.ts:192`):

```ts
if (stateBoolean(event.block, 'persistent_bit')) return;
if (hasNearbyLog(world, event.block)) return;
const drops = world.random() < SAPLING_DROP_CHANCE ? [ ... ] : [];
breakBlock(world, event.block, drops);
```

`hasNearbyLog` (`packages/block-behaviors/src/rules/growth.ts:92`) is a breadth-first search through
leaves only, bounded by `MAX_LEAF_DISTANCE = 4` (`growth.ts:79`). That is Bedrock's rule, and the
comment says so. The trees it is applied to are Java's, generated from Java's
`worldgen/feature/*.json`, and Java keeps leaves alive out to 6.

Measured on one generated chunk:

```
one chunk: 1173 leaf blocks, 0 with persistent_bit set
  no log within 4 (this server's rule): 59 (5%)
  no log within 6 (Java's rule):         4 (0%)
```

The radius-4 rule condemns 15 times as many leaves as the trees were built to keep. That is the
independent half of the defect.

Three things then multiply it:

- **Defect A supplies the fuel.** 1173 leaf blocks in one chunk is roughly three times a vanilla
  forest chunk, because five to seven tree species grow in every chunk instead of one or two.
- **The decay cascades.** `hasNearbyLog` floods through leaves only, so removing one leaf lengthens
  the path for the leaves behind it and the canopy unravels over successive random ticks.
- **Each removal schedules a physics update.** `breakBlock` calls `world.setBlock(AIR)`, which
  reaches `World.writeBlockRuntimeId` and runs `blockUpdates.scheduleAround` (`World.ts:1406`)
  unconditionally, whatever the `notifyNeighbors` flag says. The next tick that runs
  `BlockPhysics.breakUnsupported` (`BlockPhysics.ts:92`) reaches `destroyBlock`
  (`blockDestroy.ts:118`), which does roll the Java loot table and does drop. Everything resting on
  the removed leaf goes with it.

At `SIMULATION_DISTANCE` 10 the server admits 441 chunks to random ticks. 59 condemned leaves per
chunk is about 26,000 leaf blocks destroyed on the first pass alone, before any cascade, which at a
1-in-20 sapling chance is about 1300 items, and the cascade and the physics chain multiply that.

I did not reproduce the flood end to end on a running server, so the final count is an estimate from
the measured per-chunk numbers rather than an observation. Everything upstream of the item count is
measured or traced.

### The fix

Three separate changes, all independent of the redesign and of each other:

1. `growth.ts:79` is applying a Bedrock constant to Java-shaped trees. Either raise it to 6 or give
   the generator a Bedrock-shaped tree set. Also, `growth.ts` treats an unreadable neighbor as "not
   a log", so canopy at a chunk edge decays; `BlockPhysics.isSupported` already takes the opposite
   and safer position.
2. There is no ceiling anywhere on item entity count. `World.dropContents` (`World.ts:1642`) is the
   one place to put a cap or a merge.
3. Defect A, which removes most of the fuel.

**Independent of the redesign.**

## 6. Where the per-chunk time goes

Eight warm chunks per configuration, walking along a row so the 3x3 window reuses two of its three
terrain columns:

| Configuration | ms per chunk |
|---|---|
| Terrain only | 227 |
| Terrain plus carvers | 222 |
| Terrain, carvers and feature decoration, structures off | 697 |
| Everything, which is what the server runs | 1572 |

Reading the ladder. Walking along a row, each new chunk needs three new terrain tiles for its 3x3
window, so 3 x 227 = 681 ms of that 697 ms row is terrain. Feature decoration itself costs about
16 ms per chunk, even though it runs all 171 placed features. Structures add 875 ms on top.

Ranked, per 1572 ms chunk:

| Rank | Stage | ms | Share |
|---|---|---|---|
| 1 | Structures: starts laid out against the noise level, plus piece placement | 875 | 56% |
| 2 | Terrain for the 3x3 window | 681 | 43% |
| 2a | of which the chunk's own tile | 227 | 14% |
| 2b | of which the two neighboring columns | 454 | 29% |
| 3 | Feature decoration, all 171 of them | ~16 | 1% |
| 4 | Carvers | ~0 | 0% |

A sampling CPU profile over eight warm full chunks agrees about where the work is, and says it is
all the same work:

| Share | Function |
|---|---|
| 16.1% | `gradDot`, `packages/worldgen/src/noise/GradientNoise.ts:133` |
| 11.4% | `sampleAndLerp`, `packages/worldgen/src/noise/PerlinNoise.ts:43` |
| 7.7% | compiled density node, `packages/worldgen/src/density/compile.ts:247` |
| 6.3% | `get3`, `packages/worldgen/src/noise/PerlinNoise.ts:20` |
| 2.2% | `distance`, `packages/worldgen/src/biome/Climate.ts:108` |
| 1.5% | `computeSubstance`, `packages/worldgen/src/chunk/Aquifer.ts:125` |

By file: `PerlinNoise.ts` 17.6%, `GradientNoise.ts` 17.2%, `density/compile.ts` 15.4%, `math.ts`
6.9%. About 55% of every sample is density function and noise evaluation. `GenerationRegion.ts` is
3.6%, `DataDrivenGenerator.ts` is 1.6%, and `packages/features` does not reach 2% in total.

Structures are noise-bound for the same reason terrain is: `StructureStartSource` lays every start
out against `createNoiseStructureLevel` (`DataDrivenGenerator.ts:652`), which samples the same
density functions to find a surface height.

What that means for the split between algorithmic work and parallelism:

- **Algorithmic, and available now.** 29% of the chunk is terrain for the two neighboring columns
  that exist only to give the decoration pass something to read. Any design that decorates a chunk
  once rather than rebuilding its neighborhood removes that outright.
- **Algorithmic, and the largest item.** 875 ms of structure work per chunk is 56%. Nothing here
  measures how that splits between laying out starts and placing pieces; that is the next thing to
  profile, and it is the one with the most room in it.
- **Not worth touching.** Feature decoration is 1%. Making the decoration pass faster is not a
  performance fix, even though fixing defect A will reduce it anyway.
- **Parallelism.** 55% of the CPU is pure numeric noise evaluation with no shared state, which is
  the best possible shape for moving off the main thread. It is also the part that no algorithmic
  change will remove, because it is what Java's generator is.

The yield behavior is already tuned: `TERRAIN_YIELD_BUDGET_MS = 4` (`:141`) bounds how long the
terrain fill holds the event loop, and the comment at `:326` records that the previous fixed yield
every four columns cost most of a preload in scheduling latency. At 1572 ms per chunk, a
preload-radius of 5 is 121 chunks and a little over three minutes of near-solid CPU, which is why
the console stops answering.

**Partly architectural.** The 29% from the 3x3 window goes with the redesign. The 56% in structures
and the parallelism question are independent of it.

## What the tests fail to catch, and why

The gated suite is 142 tests across 14 files. Every one of them can pass while a chunk holds seven
species of tree, because not one asserts anything about how much is placed or whether it belongs.

The only decoration assertion for this generator is the whole of its test:

```ts
// packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.test.ts:152
expect(changed).toBeGreaterThan(0);
```

`javaStructures.test.ts` is thorough about structures, and it is orthogonal: it asserts that a
village, a shipwreck, a stronghold and nine others land in the chunk the seeded placement chose.
None of that is affected by the biome filter.

Three assertions would have caught these defects on the day they were introduced, and all three are
cheap:

1. The number of `placeFeature` calls per chunk varies between a plains chunk and a desert chunk. It
   is 171 in both today.
2. No chunk holds logs of more than two species. A vanilla chunk holds one or two.
3. A chunk generated first and the same chunk generated last are byte-identical. They differ at 169
   positions today.

(The third would fail until the redesign lands, so it belongs with the redesign rather than now.)

## Reproducing this

The vanilla data has to be on disk first:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run datagen:java
```

Then the gated suite, which covers the generator as it stands:

```sh
pnpm vitest run packages/prismarine/src/world/generators
```

The measurements above came from a scratch Vitest file placed at
`packages/prismarine/src/world/generators/datadriven/` and run the same way. The four probes it ran:

- Count features per chunk. `vi.mock('@jsprismarine/features')`, wrap `placeFeature` to count calls
  and successes, and subclass `FeatureLoader` so `placedFeatureById` records each identifier in a
  `WeakMap` keyed by the object it returns. Then generate chunks at (0,0), (40,40), (-60,25) and
  (120,-80) with `new DataDrivenGenerator({ registries })`.
- Carver differential. Build two generators, `{ decorate: false, carve: false }` and
  `{ decorate: false, carve: true }`, generate the same 24 chunks from both, and classify each
  differing position as opened, filled, or above the uncarved surface height of its column.
- What decoration adds. For each column, find the highest non-air block in the uncarved chunk, then
  count and name every non-air block above it in the full chunk.
- Timing and profile. Generate one chunk to warm the seeded pipeline, then time eight more.
  `new Session()` from `node:inspector/promises` with `Profiler.setSamplingInterval({interval: 250})`
  around the same eight gives the self-time table.
