# Data-driven dimensions: the chunks

The decision is [ADR 0004](../adr/0004-data-driven-dimensions.md). This file is the execution
order. Each chunk is sized for one agent in its own git worktree, lands as one or a few
Conventional Commits, and leaves the tree typechecking, the tests green and the parity dashboard
free of new red rows. Chunks are grouped into waves. Chunks in one wave touch disjoint packages or
disjoint files and can run concurrently; a chunk may start when every chunk it depends on has
landed on the integration branch.

## Before any chunk

Read ADR 0004, then the research note the chunk cites. The three notes are the specification:

- [data-driven-dimensions.md](../research/data-driven-dimensions.md) (below, "the dimension note"):
  sections 1 and 2 for the data shapes, 4.3 for the proposed types, 4.6 and 4.7 for config.
- [dimension-storage-network-config.md](../research/dimension-storage-network-config.md) ("the
  storage note"): section 1 for disk fields, 2 for the worker pool, 3 for packets, 5 for the test
  order.
- [portals-and-dimension-travel.md](../research/portals-and-dimension-travel.md) ("the portal
  note"): sections 1 and 2 for the rules with Java's constants, 3 for the wire sequence, 6 for the
  design and test plan.

Two corrections to the notes, found while verifying paths for this plan:

- `@jsprismarine/mapping` keeps its data under `packages/mapping/src/tables/` and types them in
  `packages/mapping/src/tables.ts`, not under `src/data/`. The overlay file is
  `packages/mapping/src/tables/dimensions.json`.
- Protocol-gated fields are declared with `gated(SINCE_2225, ...)` from
  `packages/protocol/src/wire/wireGates.ts` in a declarative layout, as `addActor.ts` and
  `animate.ts` do. `DimensionDefinition` is still a hand-written `NetworkStructure` class whose
  `serialize(stream)` has no protocol version, so chunk 4 moves it to a declarative structure.

Warm the Java data cache before any chunk that generates terrain:

```sh
pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen
node scripts/real-data-env.mts
```

## The checks every chunk runs

| Label | Command | What it holds |
| --- | --- | --- |
| **package** | `pnpm --filter <pkg> run test` and `pnpm --filter <pkg> run typecheck` for each package the chunk touches | the chunk's own tests and types |
| **types** | `pnpm run typecheck` | every package, test files included |
| **custom** | `pnpm run lint:custom` after the last edit | American filenames, packet codecs, JSDoc, Unicode escapes |
| **corpus** | `pnpm --filter @jsprismarine/parity run test` then `pnpm --filter @jsprismarine/parity run dashboard` | `worldgen.corpus`, `worldgen.structures`, `worldgen.determinism` stay byte-identical; no row turns red |

Run **corpus** in every chunk that touches `packages/prismarine/src/world/generators/`,
`packages/chunkgen` or `packages/worldgen`. No chunk in this plan changes generated Overworld
blocks; a corpus diff is a defect in the chunk.

Every chunk that changes a published package adds a Changeset with `pnpm changeset`, choosing the
bump from [the versioning policy](../versioning.md): every package here is below 1.0.0, so a
breaking change is `minor` and a feature or fix is `patch`. The Changeset file is part of the
chunk's commit. Where a chunk edits a package README or a `docs/` page, that edit is in the same
commit as the code it describes.

Commit messages follow the repository's Conventional Commits rules
(`type(scope): subject`, imperative, lowercase, 72 characters, identifiers in backticks).

## Open questions an implementer must verify against a real client

Record the answer in `docs/data-driven/dimensions.md` (chunk 23) when found.

1. Does the client accept `ChangeDimension` to a `Dimension ID` of 1000 or more, and does it then
   accept `LevelChunk` with that id? Dragonfly registers such ids; Mojang's payload comment lists
   only 0 to 3. Chunks 17 and 16 send them; test with one custom `dimension_type` before relying
   on it.
2. Does the client keep inventory, effects and attributes across `ChangeDimension`? Geyser
   re-sends attributes and relies on the Java server for effects. Chunk 16 re-sends attributes
   and inventory after `EndLoadingScreen` as the safe default; measure whether it is needed.
3. Does the client honor `StartGame.generator = 3` (Nether) or `4` (End) when the spawn dimension
   is not the Overworld, or must `generator` always describe the Overworld stem? Chunk 17 sends the
   Overworld stem's generator type as the dimension note's section 4.8 says.
4. Does a 2225 client accept a `DimensionDefinition` with `Cloud Height` and `Render Clouds`
   appended, and a 2193 client one without? Chunk 4 round-trips both layouts; only a live client
   proves the field order.
5. How many chunks around the arrival position must arrive before the client closes the loading
   screen? Geyser sends empty chunks in radius 3 when it has none. Chunk 16 sends the real arrival
   chunks first; if the screen hangs on a slow pipeline, fall back to Geyser's empty chunks.

---

## Wave 0: foundations in separate packages

Seven chunks, each in one package, no dependencies on each other.

### Chunk 1: parse `dimension_type`, stems, presets and flat settings in `@jsprismarine/worldgen`

**Goal.** The four parsers from the dimension note's section 4.3, plus the `parseBiomeSource`
dispatch over the four biome source classes that already exist in
`packages/worldgen/src/biome/BiomeSource.ts` (`FixedBiomeSource`, `CheckerboardBiomeSource`,
`MultiNoiseBiomeSource`, `TheEndBiomeSource`).

**Files.** New `packages/worldgen/src/dimension/DimensionType.ts`, `LevelStem.ts`,
`WorldPreset.ts`, `FlatGeneratorSettings.ts`, `parseBiomeSource.ts`, each with a `.test.ts`;
`packages/worldgen/src/index.ts` exports; `packages/worldgen/README.md` gains a section under "What
it implements".

**Public API.**

```ts
export interface DimensionTypeDefinition { /* dimension note 4.3, 26.3 field list from 1.1 */ }
export type BiomeSourceDefinition = /* 4.3 union: multi_noise preset | multi_noise biomes | fixed | checkerboard | the_end */;
export interface FlatGeneratorSettings { layers; biome; lakes; features; structureOverrides? }
export type GeneratorDefinition = /* 4.3 union; unknown kinds keep { type, settings: unknown } */;
export interface LevelStem { readonly type: string; readonly generator: GeneratorDefinition }
export interface WorldPreset { readonly dimensions: ReadonlyMap<string, LevelStem> }
export const parseDimensionType: (json: unknown, path: string) => DimensionTypeDefinition;
export const parseLevelStem: (json: unknown, path: string) => LevelStem;
export const parseWorldPreset: (json: unknown, path: string) => WorldPreset;
export const parseFlatGeneratorSettings: (json: unknown, path: string) => FlatGeneratorSettings;
export const parseBiomeSource: (
    definition: BiomeSourceDefinition,
    parameterLists: ReadonlyMap<string, unknown>
) => BiomeSource;
```

`parseDimensionType` reads the 26.3 shape (`has_fixed_time`, `skybox`, `cardinal_light`,
`attributes`), defaults absent fields as the table in the dimension note's section 1.1 says, and
keeps `attributes` as a `ReadonlyMap<string, unknown>`. `monster_spawn_light_level` is an int or an
int provider; reuse the int provider parser if `packages/worldgen/src/carver/Carver.ts` exposes
one, else parse `{ type: 'minecraft:uniform', min_inclusive, max_inclusive }` and a bare int.
`parseBiomeSource` resolves a `multi_noise` `preset` through `parameterLists`, keyed by the
`multi_noise_biome_source_parameter_list` id, and hands the result to
`MultiNoiseBiomeSource.fromJson`. Follow the error style of `parseNoiseGeneratorSettings` in
`packages/worldgen/src/settings/NoiseGeneratorSettings.ts` (path-qualified messages).

**Tests.** Inline fixtures: the verbatim `normal.json` from the dimension note's section 1.2, the
`the_nether.json` type, a flat preset, and one of each biome source kind. A real-data block gated
with `describe.skipIf(!vanilla)` and `{ tags: ['real-data'] }` as `density/vanilla.test.ts` does,
loading the four types, seven presets, nine flat presets and two parameter lists from the cache and
asserting the tables in sections 1.1, 1.2 and 1.3 (heights, scale, stem kinds per preset, flat
preset layer counts). `parseBiomeSource` on `{ type: 'minecraft:the_end' }` returns a
`TheEndBiomeSource`; on an unknown type it throws naming the type and the path.

**Changeset.** `@jsprismarine/worldgen` patch.

**Verify.** **package** on worldgen, **types**, **custom**, **corpus**.

**Done when** the eleven cache files parse, the README documents the five parsers, and nothing
in `packages/prismarine` has changed.

**Depends on** nothing.

### Chunk 2: route dimension and worldgen registries through `@jsprismarine/packs`

**Goal.** `routeDatapackPath` returns a route for `data/*/dimension_type/**`, `data/*/dimension/**`
and every `data/*/worldgen/<kind>/**` directory that
`packages/prismarine/src/world/generators/datadriven/javaWorldgenData.ts` reads by walking the
cache today, plus `world_preset`, `flat_level_generator_preset` and
`multi_noise_biome_source_parameter_list`, so chunk 10 can read them from `Definitions`.

**Files.** `packages/packs/src/javaRegistries.ts` (`JAVA_REGISTRY_IDS`, `MERGE_MODES`,
`JAVA_REGISTRY_DIRECTORIES`, `routeDatapackPath`), `packages/packs/src/javaRegistries.test.ts`
(the two `toBeUndefined` assertions at lines 65 and 66 flip to concrete routes),
`packages/packs/src/load.ts` if `Definitions` needs a wider key type, `packages/packs/README.md`
registry list.

**Public API.** Add `dimensionTypes` and `dimensions` registry ids. For the worldgen directories,
add one composite registry id `worldgen` whose identifier is `<kind>/<namespace>:<path>`, the same
shape tags already use (`worldgen/biome/minecraft:is_forest`), so `routeDatapackPath('data/minecraft/worldgen/noise_settings/overworld.json')`
returns `{ registry: 'worldgen', identifier: 'noise_settings/minecraft:overworld' }`. All three are
`override` in `MERGE_MODES`. Document the choice in the JSDoc of `JAVA_REGISTRY_IDS`. Check whether
`javaWorldgenData.ts` reads any non-JSON files (structure templates are `.nbt` under
`data/*/structure/`); if it does, leave those on their current loader and say so in the README.

**Tests.** One route assertion per new directory, the `dimension_type` and `dimension` routes,
`world_preset` and `flat_level_generator_preset`, and that `data/minecraft/worldgen/biome/plains.json`
now routes. `vanillaDatapack.test.ts` gains a count that the vanilla datapack yields four
`dimensionTypes` and seven `world_preset` entries, reported through `reportProgress` from
`.test/reportProgress.ts` rather than asserted exactly.

**Changeset.** `@jsprismarine/packs` patch (additive).

**Verify.** **package** on packs, then **package** on `@jsprismarine/mapping` and
`@jsprismarine/blocks` since both consume `Definitions`; **types**; **custom**.

**Done when** the two flipped assertions pass, the identifier report still resolves
`worldgen/world_preset` references, and `packages/mapping/src/packRegistries.ts` still lists
`world_preset` and `flat_level_generator_preset` as server-side (chunk 3 does not remove them).

**Depends on** nothing.

### Chunk 3: the Bedrock dimension overlay in `@jsprismarine/mapping`

**Goal.** Three rows of Java type id to Bedrock id, Bedrock name, client height clamp and
`Generator` enum value, from the dimension note's sections 2.5 and 4.3.

**Files.** New `packages/mapping/src/tables/dimensions.json`, `packages/mapping/src/tables.ts`
(`DimensionsTable` interface and `dimensionsTable` export, following `registriesTable`), new
`packages/mapping/src/dimensionMapping.ts` with its test, `packages/mapping/src/index.ts`,
`docs/data-driven/mapping.md` (one paragraph under the lookup functions).

**Public API.**

```ts
export interface BedrockDimensionOverlay {
    readonly dimensionId: number;      // 0, 1, 2
    readonly bedrockName: string;      // 'minecraft:nether' for 'minecraft:the_nether'
    readonly minY?: number;            // present only where the client differs from Java
    readonly height?: number;
    readonly generatorType: Generator; // @jsprismarine/minecraft enum: OVERWORLD 1, NETHER 3, END 4
}
export const bedrockDimensionOverlay: (javaDimensionTypeId: string) => BedrockDimensionOverlay | undefined;
export const javaDimensionTypeOf: (bedrockName: string) => string | undefined; // the reverse lookup support.ts needs
```

Rows: `minecraft:overworld` to `{ 0, 'minecraft:overworld', generatorType 1 }`,
`minecraft:the_nether` to `{ 1, 'minecraft:nether', minY 0, height 128, generatorType 3 }`,
`minecraft:the_end` to `{ 2, 'minecraft:the_end', generatorType 4 }`.

**Tests.** The three rows match section 2.5; an unknown id returns `undefined`; the reverse lookup
round-trips every row; the JSON validates against the interface at load.

**Changeset.** `@jsprismarine/mapping` patch.

**Verify.** **package** on mapping, **types**, **custom**.

**Done when** `bedrockDimensionOverlay('minecraft:the_nether')?.height === 128` and the mapping
doc names the table.

**Depends on** nothing.

### Chunk 4: `DimensionDefinition` cloud fields at protocol 2225

**Goal.** `DimensionDefinition` carries `Cloud Height` (varint32) and `Render Clouds` (bool) at
2225 and not at 2193, both wire directions, with round-trip coverage. Also correct the two stale
lines in `docs/research/protocol-2225-delta.md` (122 and 219) that say no class exists.

**Files.** New `packages/protocol/src/wire/structures/DimensionDefinition.ts` (declarative,
following `PassengerOfBlock.ts` and `ItemStackRequest.ts`) using
`gated(SINCE_2225, ...)` from `wire/wireGates.ts`; `packages/protocol/src/structure/DimensionDefinition.ts`
becomes a thin class over the layout or is removed if `DimensionDataPacket.ts` can read the layout
directly, keeping the exported name; `packages/protocol/src/packet/DimensionDataPacket.ts` passes
the protocol version through; `DimensionDefinition.test.ts` and `DimensionDataPacket.test.ts`;
`docs/research/protocol-2225-delta.md`.

**Public API.** The `DimensionDefinition` constructor gains `cloudHeight = 0` and
`renderClouds = false` after `defaultBiome`. The packet's data type gains the same two optional
fields.

**Tests.** Encode at 2193, assert the byte length equals six fields; encode at 2225, assert the
two extra fields; decode each back to equal data. A fixture of one custom dimension at both
versions in `packages/protocol/src/packet/DimensionDataPacket.test.ts`. `pnpm run lint:packets`
must stay green; do not touch `scripts/packet-codec-baseline.json`.

**Changeset.** `@jsprismarine/protocol` patch.

**Verify.** **package** on protocol, **types**, **custom** (includes `lint:packets`).

**Done when** both layouts round-trip and the 2225 delta note lists `DimensionDefinition` among
the implemented 2225 changes.

**Depends on** nothing.

### Chunk 5: portal geometry in `@jsprismarine/block-behaviors`

**Goal.** The pure rules from the portal note's sections 1 and 2, and the `portalFamily` hooks
that call them. No travel, no packets.

**Files.** New `packages/block-behaviors/src/rules/portal.ts` with `portal.test.ts`;
`packages/block-behaviors/src/rules/index.ts`; `packages/block-behaviors/src/families/world.ts`
(`portalFamily` at line 83, `PORTAL_DELAY_TICKS` at 80); `packages/block-behaviors/README.md`
(portals leave the out-of-scope list at lines 207 and 247); `packages/blocks/src/families.ts`
(export the portal block list the `jsprismarine:portal` rule at line 77 uses as a named constant,
and import it in block-behaviors, which already depends on `@jsprismarine/blocks`).

**Public API.**

```ts
export const NETHER_PORTAL_FRAME_BLOCKS: readonly string[];   // ['minecraft:obsidian']
export const END_PORTAL_FRAME_BLOCKS: readonly string[];      // ['minecraft:end_portal_frame']
export interface PortalFrame { bottomLeft: Vector3; axis: 'x' | 'z'; width: number; height: number }
export const findEmptyPortalShape: (world: WorldActions, at: Vector3) => PortalFrame | undefined; // Java PortalShape: 2..21 by 3..21, corners unchecked
export const portalInterior: (frame: PortalFrame) => Vector3[];
export const connectedPortalBlocks: (world: WorldActions, at: Vector3) => Vector3[];             // Dragonfly connectedNetherPortal flood fill
export const findEndPortalRing: (world: WorldActions, frameAt: Vector3) => Vector3 | undefined;   // flat twelve-frame ring, returns the 3x3 center
export const portalCreationSite: (world: WorldActions, target: Vector3, axis, bounds: { minY; maxY }) => { at: Vector3; forced: boolean }; // 16 radius, two passes, forced clamp [70, maxY - 10]
export const writeNetherPortal: (world: WorldActions, site, axis, forced: boolean) => void;        // 4x5 frame with corners, six portal blocks, netherrack flanks when forced
export const writeEndPlatform: (world: WorldActions, center: Vector3) => void;                     // 5x5 obsidian at dy -1, air dy 0..2
export const piglinSpawnRoll: (random: () => number, difficultyId: number) => boolean;           // random() * 2000 < difficultyId
```

Hooks in `portalFamily`: `onPlace` for `fire` and `soul_fire` calls `findEmptyPortalShape` and
writes `minecraft:portal` with `portal_axis` into the interior, refusing when the world's dimension
is `minecraft:the_end` (use `BlockWorld.at(dimension)` or the family event's dimension, whichever
the harness exposes). `onNeighborChanged` for `portal` clears `connectedPortalBlocks` when the
changed neighbor is neither portal nor frame on the axis or vertical. `onPlayerInteract` on
`end_portal_frame` (the eye already sets `end_portal_eye_bit`) runs `findEndPortalRing` and fills
the 3x3 with `end_portal`. `onRandomTick` for `portal` rolls `piglinSpawnRoll` and spawns
`minecraft:zombie_pigman` one block east or south of the bottom portal block (Bedrock placement)
only when the dimension is the Overworld. Leave `onStepOn` as it is; chunk 21 owns travel.

**Tests.** Through `packages/block-behaviors/src/harness.ts`: the portal note's section 6 list
(4x5 without corners accepted, 23x23 accepted, 3x5 and 24x23 rejected, missing side block
rejected, fire anywhere inside, both axes, lighting writes the right `portal_axis`, one broken
block clears the whole interior, nothing lights in the End, the ring with one eye missing or one
frame facing outward does not activate, the complete ring writes nine `end_portal`, the piglin roll
per difficulty, forced platform clamp, netherrack flanks, frame with corners and six portal
blocks).

**Changeset.** `@jsprismarine/block-behaviors` patch, `@jsprismarine/blocks` patch.

**Verify.** **package** on block-behaviors and blocks, **types**, **custom**.

**Done when** the harness tests pass and `families.ts` has one list the two packages share.

**Depends on** nothing.

### Chunk 6: shard by dimension in `@jsprismarine/chunkgen`

**Goal.** `GenerationTask` names its dimension and `ShardedGenerationPool.shardFor` includes it
in the shard hash, so two dimensions' chunk (0, 0) do not always share a shard.

**Files.** `packages/chunkgen/src/GenerationPool.ts` (`GenerationTask` at line 86),
`packages/chunkgen/src/ShardedGenerationPool.ts` (`shardFor` at line 166, `shardOf` call at 167),
`ShardedGenerationPool.test.ts`.

**Public API.** `GenerationTask` gains `readonly dimension: number` (the Bedrock id; 0 for every
caller today). `shardFor` hashes `(chunkX >> regionShift, chunkZ >> regionShift, dimension)`.
The `workStealing` path is unchanged.

**Tests.** The same region in dimensions 0 and 1 lands on different shards for at least one of a
set of positions; the shard of a dimension 0 task is unchanged from before (pin the current
mapping in a test so Overworld work distribution does not move).

**Changeset.** `@jsprismarine/chunkgen` patch; the new required field is additive for the one
caller in `@jsprismarine/prismarine`, which this chunk updates in `chunkPipeline.ts` with
`dimension: 0` so **types** passes. Keep that edit to the one line.

**Verify.** **package** on chunkgen and prismarine, **types**, **custom**, **corpus**.

**Done when** both tests pass and the corpus is byte-identical.

**Depends on** nothing.

### Chunk 7: portal cooldown and contact state on `Entity`, persisted

**Goal.** The per-entity timers from the portal note's section 1 ("Travel timer" and "Cooldown
after travel"), the `PortalCooldown` and `DimensionId` NBT fields, with no travel yet.

**Files.** `packages/prismarine/src/entity/Entity.ts` (beside `invulnerableTicks` at line 180 and
its countdown in `update` at 450), new `packages/prismarine/src/entity/PortalContact.ts` with
test, `packages/prismarine/src/entity/EntitySerializer.ts` (`toNBT` at 82, `fromNBT` at 46),
`packages/prismarine/src/world/providers/leveldb/PlayerCodec.ts` (`playerDataToNbt` at 214,
`playerDataFromNbt` at 264), `packages/prismarine/src/config/JsonConfigTypes.ts`
(`WorldPlayerData` gains `portalCooldown?: number`), `pnpm --filter @jsprismarine/prismarine run generate`
for `schemas/player-data.schema.json`.

**Public API.**

```ts
export class PortalContact {              // Java PortalProcessor
    touch(entryPosition: Vector3): void;  // sets insideThisTick
    tick(delayTicks: number): boolean;    // increments while inside, decays by 4 otherwise; true when portalTime reaches delayTicks
    hasExpired(): boolean;
}
// on Entity
public getPortalCooldown(): number;
public setPortalCooldown(ticks = 300): void;   // Player overrides the default to 10
public isOnPortalCooldown(): boolean;
public portalContact(): PortalContact | undefined;
public touchPortal(at: Vector3): void;          // creates the contact when none, refused on cooldown
```

`Entity.update` decrements the cooldown. `EntitySerializer.toNBT` writes `PortalCooldown` (int)
and `DimensionId` (int, from `position.getWorld().getDimension().id`); `fromNBT` reads
`PortalCooldown`. `PlayerCodec` writes `PortalCooldown` beside the Bedrock fields.

**Tests.** `PortalContact.test.ts`: 80 ticks inside reaches the threshold, stepping out decays by
4, zero threshold fires on the first tick, cooldown refuses `touch`. `EntitySerializer` round-trip
and a `PlayerCodec` round-trip assert both tags.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** an entity written and read back keeps its cooldown and a Nether-world entity's NBT
says `DimensionId 1`.

**Depends on** nothing (uses today's `DimensionDefinition.id`; chunk 8 keeps that field).

---

## Wave 1: the prismarine types

Four chunks in `@jsprismarine/prismarine`, disjoint files.

### Chunk 8: `DimensionType` replaces `DimensionDefinition`

**Goal.** The runtime dimension type from the dimension note's section 4.3, built from a
worldgen `DimensionTypeDefinition` plus the mapping overlay, with the old name kept as a
deprecated alias for one release, and the two hard-coded dimension tables replaced.

**Files.** `packages/prismarine/src/world/Dimension.ts` (today `DimensionDefinition`,
`Dimensions`, `dimensionByName`, `minSubChunk`, `subChunkCount`, `maxSubChunk`, `maxY`,
`contains`), new `packages/prismarine/src/world/DimensionType.ts` with test,
`packages/prismarine/src/world/contentAdapter.ts` (`DIMENSION_DEFINITIONS` at 89, `SEA_LEVELS` at
101, `hasSkyLight` at 159), `packages/prismarine/src/command/host/support.ts`
(`JAVA_DIMENSION_IDS` at 73, `dimensionIdOf`, `worldOf`), their tests.

**Public API.**

```ts
export interface DimensionType {
    readonly id: string;           // Java id, 'minecraft:the_nether'
    readonly bedrockId: number;    // 0, 1, 2 or 1000+
    readonly bedrockName: string;  // 'minecraft:nether'
    readonly name: string;         // alias of bedrockName, so today's `.name` readers compile
    readonly minY: number;         // Bedrock-effective
    readonly height: number;
    readonly java: DimensionTypeDefinition;
    readonly custom: boolean;
}
/** @deprecated Use DimensionType. Removed in the next release. */
export type DimensionDefinition = DimensionType;
export const dimensionTypeOf: (definition: DimensionTypeDefinition, javaId: string, customId?: number) => DimensionType;
export const Dimensions: Record<'Overworld' | 'Nether' | 'TheEnd' | 'Legacy', DimensionType>; // built at module load from the vanilla four plus overlay, bounds unchanged
export const dimensionByName: (name: string) => DimensionType | undefined; // accepts both spellings
```

`DimensionDefinition.id` is read as a number today in `Chunk.ts`, `LevelDB.ts`,
`startGameData.ts` and `PlayerSession.ts`. `DimensionType.id` is the Java string and `bedrockId`
the integer, so this chunk updates every numeric `.id` reader to `bedrockId` (grep
`getDimension().id` and `dimension.id`). This is the one mechanical sweep the rename needs; do it
here so later chunks start clean. `contentAdapter.ts` reads `hasSkylight`
from `java` and sea level from the stem's noise settings when chunk 14 lands; until then it reads
`SEA_LEVELS` keyed by `DimensionType.id`, moved into `DimensionType.ts` as a documented interim
table. `support.ts` drops `JAVA_DIMENSION_IDS` and uses `DimensionType.id` and `bedrockName`.

**Tests.** The three vanilla types have the bounds `Dimensions` has today (regression);
`dimensionTypeOf` of a custom type gets `custom: true` and the given id; `dimensionByName`
accepts `minecraft:nether` and `minecraft:the_nether`; `ChunkNetworkPayload.test.ts` and
`DiskFormat.test.ts` still pass unchanged.

**Changeset.** `@jsprismarine/prismarine` minor (`id` changes type on the public interface).

**Verify.** **package** on prismarine, **types**, **custom**, **corpus**.

**Done when** `rg 'getDimension\(\)\.id' packages` finds no numeric reader left and the deprecated
alias has the JSDoc.

**Depends on** chunks 1 and 3.

### Chunk 9: `GeneratorFactories` and the built-in factories

**Goal.** Replace `GeneratorManager` with a registry keyed by generator kind id that builds a
`Generator` from a stem, and give `DataDrivenGenerator` a `BiomeSource` option so the End can be
built.

**Files.** New `packages/prismarine/src/world/GeneratorFactories.ts` with test, new
`packages/prismarine/src/world/generators/factories/{noise,flat,void,debug}.ts` with tests;
`packages/prismarine/src/world/GeneratorManager.ts` (becomes a deprecated wrapper or is deleted
with `WorldManager.getGeneratorManager` pointed at the new class);
`packages/prismarine/src/world/generators/Flat.ts` (rewritten to take `FlatGeneratorSettings`,
honor `biome`, start at the dimension's `minY`, and build `new Chunk(cx, cz, undefined, dimension)`),
`packages/prismarine/src/world/generators/Overworld.ts` and `Generators.ts` (thin aliases that
build through the factories, `@deprecated` JSDoc),
`packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts` (`biomeSource`
field at 537 and its construction at 612; `DataDrivenGeneratorOptions` at 103 gains
`biomeSource?: BiomeSource`), `packages/prismarine/src/world/index.ts` exports.

**Public API.**

```ts
export interface GeneratorBuildContext {
    readonly stem: LevelStem;
    readonly dimension: DimensionType;
    readonly seed: bigint;
    readonly content: () => ServerContent;
    readonly worldgen: () => JavaWorldgenRegistries;   // lazy: flat and void never call it
    readonly logger: GeneratorLogger;
}
export interface GeneratorFactory { readonly kind: string; build(context: GeneratorBuildContext): Generator }
export class GeneratorFactories {
    register(factory: GeneratorFactory): void;          // throws on a duplicate kind
    build(context: GeneratorBuildContext): Generator;   // throws naming the unknown kind and the registered ones
    kinds(): readonly string[];
    stopGenerating(): void;                             // what GeneratorManager.stopGenerating did
}
```

`minecraft:noise` resolves `stem.generator.settings` (id or inline) and `biome_source` through
`parseBiomeSource` with the parameter lists from `worldgen()`, and passes `dimension`,
`noiseSettings` and `biomeSource` to `DataDrivenGenerator`. `minecraft:flat` accepts settings as
an object or a `flat_level_generator_preset` id. `minecraft:debug` registers and `build` throws
`"minecraft:debug is not supported"`. `jsprismarine:void` produces empty chunks of the dimension.

**Tests.** `GeneratorFactories.test.ts`: duplicate kind throws, unknown kind error lists the
known kinds. `flat` test: layers start at `minY` for a Nether-typed dimension, biome honored,
layers above `maxY` dropped. `noise` test gated on real data: the End stem from `normal.json`
builds and one chunk at (0, 0) has `minecraft:the_end` biome cells and end stone at the island
(this is the first End chunk the server generates; compare against the `TheEndBiomeSource` test
in `packages/worldgen/src/biome/biome.test.ts`). The Overworld built through the factory produces
the same chunk digest as `Overworld` did (reuse the sampler golden if cheap, else one chunk
sha256 pinned in the test).

**Changeset.** `@jsprismarine/prismarine` minor (`GeneratorManager` deprecated,
`registerClassGenerator` kept on the alias).

**Verify.** **package** on prismarine, **types**, **custom**, **corpus**.

**Done when** `WorldManager` builds its generators through `GeneratorFactories` with a stem
synthesized from today's `generator` string (the real config arrives in chunk 11), the corpus is
byte-identical, and an End chunk exists in a test.

**Depends on** chunks 1 and 8.

### Chunk 10: `javaWorldgenData.ts` reads from pack `Definitions`

**Goal.** The worldgen registries come from the pack stack instead of a private directory walk,
so a datapack can add a dimension type or a noise setting.

**Files.** `packages/prismarine/src/world/generators/datadriven/javaWorldgenData.ts`
(`findJavaWorldgenSources` at 110, `loadJavaWorldgenRegistries` at 173, `JavaWorldgenRegistries`
at 42), `javaWorldgenData.test.ts`, `packages/prismarine/src/content/ServerContent.ts` and
`ContentOptions.ts` where the vanilla datapack source is assembled,
`packages/prismarine/src/content/README.md` (the worldgen gap at line 246),
`packages/parity/src/references.ts` (imports `findJavaWorldgenSources` at line 9; keep that export
working).

**Public API.** `JavaWorldgenRegistries` gains `dimensionTypes`, `dimensions`, `worldPresets`,
`flatLevelGeneratorPresets` and `multiNoiseParameterLists` maps. New
`loadJavaWorldgenRegistriesFrom(definitions: Definitions, reports: JavaWorldgenSources['reports']): JavaWorldgenRegistries`.
`loadJavaWorldgenRegistries(sources)` stays as a wrapper that builds a one-source pack stack over
the cache directory, so `packages/parity` and the worker tests keep their entry point. The biome
parameter reports (`reports/biome_parameters`) are not datapack files and keep their current
loader.

**Tests.** Both entry points produce equal registries over the cache (gated on real data); a
tiny in-memory datapack adding `data/test/dimension_type/sky.json` appears in `dimensionTypes`.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine and parity, **types**, **custom**, **corpus**.

**Done when** the content README no longer lists worldgen as a gap and the corpus is
byte-identical.

**Depends on** chunk 2.

### Chunk 11: config shape and the migration table

**Goal.** `worlds.<name>` reads as `{ seed, provider, preset?, dimensions? }`, the old keys are
translated once with a deprecation log, the schema regenerates, and the default config writes the
new shape.

**Files.** `packages/prismarine/src/config/JsonConfigTypes.ts` (`WorldData` at 14, `FlatLayer` at
7), `packages/prismarine/src/config/Config.ts` (`defaultWorlds` at 123, the `worlds` comment at
51), new `packages/prismarine/src/config/normalizeWorldData.ts` with test,
`packages/prismarine/utils/generate-schemas.cjs` only if a new type needs listing,
`packages/prismarine/schemas/config.schema.json` (regenerated with
`pnpm --filter @jsprismarine/prismarine run generate`), `JsonSchemas.test.ts`, `docs/running.md`
(section 1.3 "set `generator` to `Flat`" at line 48 and the seed example at 229).

**Public API.**

```ts
export interface DimensionConfig {
    /** Java dimension type id; defaults to the preset's. */ type?: string;
    /** A level stem generator object; defaults to the preset's. */ generator?: GeneratorDefinitionJson;
    /** 'eager' builds the world at startup; 'lazy' (default) on first entry. */ load?: 'eager' | 'lazy';
}
export interface WorldData {
    seed: string | number;
    provider?: string;
    /** @default 'minecraft:normal' */ preset?: string;
    dimensions?: Record<string, DimensionConfig>;
    /** @deprecated Use `preset`. */ generator?: string;
    /** @deprecated Use `dimensions['minecraft:overworld'].generator`. */ layers?: FlatLayer[];
}
export interface NormalizedWorldData { seed; provider; preset: string; dimensions: Record<string, DimensionConfig>; deprecations: readonly string[] }
export const normalizeWorldData: (data: WorldData, knownKinds: readonly string[]) => NormalizedWorldData;
```

The table from the dimension note's section 4.7, row for row: `'Overworld'` or absent becomes
`preset: 'minecraft:normal'`; `'Flat'` with no layers becomes `preset: 'minecraft:flat'`; `'Flat'`
with `layers` becomes `preset: 'minecraft:flat'` plus an Overworld stem override with
`layers.map(l => ({ block, height: l.size }))`, `biome: 'minecraft:plains'`, `lakes: false`,
`features: false`, `structure_overrides: []`; any other string throws naming `knownKinds`. The
default config writes `{ preset: 'minecraft:normal', provider: 'LevelDB', seed }`.

**Tests.** One test per table row, the deprecation list per row, the default config shape, the
schema marks `generator` and `layers` deprecated, `Config` rewrites a loaded old-shape world on
save (follow the existing comment-preserving write tests).

**Changeset.** `@jsprismarine/prismarine` patch (old keys still read).

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** `WorldManager` consumes `NormalizedWorldData` (still loading only `level-name`;
chunk 15 loads the rest) and `docs/running.md` shows the new shape with a sentence on the old
keys.

**Depends on** chunk 1 (the stem JSON types).

---

## Wave 2: pool and provider

Two chunks in `@jsprismarine/prismarine`, disjoint files.

### Chunk 12: one shared worker pool per server

**Goal.** `noiseSettings`, `biomeParameters`, the biome source definition and the dimension move
from `ChunkPipelineSetup` into `ChunkTaskInput`; the worker keys its pipeline by (settings, biome
source, seed); one `DataDrivenGenerator` instance serves every dimension.

**Files.** `packages/prismarine/src/world/generators/datadriven/chunkPipeline.ts`
(`ChunkPipelineSetup` at 38, `ChunkTaskInput` at 53, the setup spread at 150),
`DataDrivenGenerator.ts` (`pipelineFor(seed)` at 1810 and its `pipelines` map; `TerrainTaskInput`
at 285), `packages/chunkgen/src/generationWorker.ts` only if its cache key lives there,
`chunkPipeline.test.ts`, `DataDrivenGenerator.test.ts`, the noise factory from chunk 9 (it now
asks the server's shared generator for a per-stem view rather than constructing one).

**Public API.**

```ts
export interface PipelineKey { noiseSettings: string; biomeSource: BiomeSourceDefinition; dimension: string }
// DataDrivenGenerator
public forStem(key: PipelineKey, dimension: DimensionType): Generator;   // a thin view: generateChunk(cx, cz, seed) tags tasks with the key
private pipelineFor(key: PipelineKey, seed: bigint): SeededPipeline;
```

`ChunkTaskInput` carries the key as plain JSON (the biome source definition is serializable;
`parseBiomeSource` runs in the worker). `GenerationTask.dimension` from chunk 6 is set from
`DimensionType.bedrockId`. The `registryBundle` stays one `SharedArrayBuffer` per server.

**Tests.** A worker pool run with two keys interleaved yields the same chunk digests as two
single-key runs (gated on real data); `chunkPipeline.test.ts` asserts the key travels in the task
and not in `workerData`; `GenerationPool` worker count is `chunkWorkerCount()` once per server,
asserted through a counting stub.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine and chunkgen, **types**, **custom**, **corpus** (the
Overworld key must produce identical bytes).

**Done when** the corpus is byte-identical, an End and an Overworld chunk come out of one pool in
a test, and `Overworld.require()` no longer builds a pool of its own.

**Depends on** chunks 6 and 9.

### Chunk 13: the provider takes a dimension, and the save gains its Bedrock fields

**Goal.** One provider per save folder. The storage note's section 1.4 API, `level.dat`
`Generator`, `FlatWorldLayers`, `NetherScale` and `Time`, Bedrock `DimensionId` and
`SpawnDimension` on player records, and the resolved stems persisted in `jsprismarine:world_data`.

**Files.** `packages/prismarine/src/world/providers/Provider.ts`,
`packages/prismarine/src/world/providers/BaseProvider.ts`,
`packages/prismarine/src/world/providers/leveldb/LevelDB.ts` (`dimension()` at 115 and its
readers at 136, 204, 393, 712, 743 to 745, 757; `buildLevelDat` at 703; `listChunks` at 739;
`readBiomes` at 756), `packages/prismarine/src/world/providers/leveldb/PlayerCodec.ts`,
`packages/prismarine/src/world/WorldPersistence.ts` (`WorldPersistenceData` at 18),
`packages/prismarine/src/world/PlayerRecords.ts` (`lastPlayerRecord` at 32),
`packages/prismarine/src/world/providers/anvil/Anvil.ts` (signature only; chunk 25 implements it),
`LevelDB.test.ts`, `DiskFormat.test.ts`, `PlayerRecords.test.ts`, `WorldPersistence.test.ts`.

**Public API.**

```ts
interface Provider extends Service {
    readChunk(dimension: DimensionType, cx: number, cz: number, seed: bigint, generator: Generator, config?: WorldConfig, options?: ChunkRequestOptions): Promise<Chunk>;
    writeChunk(chunk: Chunk): Promise<void>;                     // reads chunk.getDimension()
    listChunks?(dimension: DimensionType): IterableIterator<{ x: number; z: number }>;
    readWorldData(): Promise<WorldPersistenceData | null>;       // per save
    writeWorldData(data: WorldPersistenceData): Promise<void>;
    saveLevelData?(level: LevelDatInputs): void;                 // spawn, time, generator int, flat layers, nether scale
    readPlayerData?(key: string): Promise<Partial<WorldPlayerData> | null>;
    writePlayerData?(key: string, data: WorldPlayerData): Promise<void>;
}
export interface WorldPersistenceData { /* existing */ worldGenSettings?: { seed: string; dimensions: Record<string, LevelStem> } }
// WorldPlayerData gains `dimension: string` (Java id), written as Bedrock `DimensionId`; `spawn.dimension` also lands in `SpawnDimension`.
// lastPlayerRecord(player, level) reads one record and returns its `dimension`.
```

`BaseProvider.world` stays for the logger, but `writeEntities` takes the chunk's dimension's
entity list through a callback the `World` supplies, not `this.getWorld().getEntities()`.
`buildLevelDat` writes `Generator` 2 when the Overworld stem is flat else 1, `FlatWorldLayers`
from the flat settings in the Bedrock JSON shape (dimension note section 2.2), `NetherScale` from
the Nether type's `coordinate_scale`, and `Time` from the clock. Until chunk 14 supplies a
`Level`, the `World` passes its own values.

**Tests.** The storage note's section 5 list, items 1 to 5: digest and pending-entity key lengths
for dimension 1; Overworld, Nether and End chunks at the same (x, z) in one database with no record
leaking and `listChunks(dimension)` returning only its own; `Data3D` with 8, 16 and 24 biome
sections; a player record with `DimensionId 1` and `SpawnDimension` from the spawn; an actor in a
Nether chunk whose `actorprefix` compound has `DimensionId 1` and sits only in the Nether digest;
`level.dat` with `Generator 1`, `NetherScale 8`, `Time`, and `FlatWorldLayers` only for a flat
Overworld. `VanillaWorld.test.ts` (gated on a real save) still round-trips byte-exact.

**Changeset.** `@jsprismarine/prismarine` minor (provider interface change).

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** `LevelDB.dimension()` is gone and every test above passes.

**Depends on** chunks 8 and 1 (`LevelStem` in the persisted record).

---

## Wave 3: the `Level`

### Chunk 14: `Level` owns the save, `World` forwards to it

**Goal.** The `Level` class from the dimension note's section 4.3 and the ownership table from
the storage note's section 4.3, with `World` staying the per-dimension runtime and forwarding its
save-level getters, so the 102 `getWorld()` call sites do not move.

**Files.** New `packages/prismarine/src/world/Level.ts` with `Level.test.ts`;
`packages/prismarine/src/world/World.ts` (`WorldData` options at 310 to 335: gains `level: Level`
and `stem: LevelStem`, loses `seed`, `provider` and `generator` as required inputs; fields
`gameRuleManager` 396, `currentTick` 397, `players` 370, `spawn` 424, `weather` 471 and
`weatherCycle` 1864 move to or read from the level; getters `getGameRuleManager` 2757, `getTicks`
2761, `getProvider` 2769, `getSeed` 2791 forward), `packages/prismarine/src/world/index.ts`,
`packages/prismarine/src/world/contentAdapter.ts` (sea level from the stem's noise settings via
`NoiseGeneratorSettings.seaLevel`, replacing the interim table from chunk 8),
`packages/prismarine/src/network/startGameData.ts` only where it reads `world.getSeed()` (no
behavior change here; chunk 17 changes the fields).

**Public API.**

```ts
export interface LevelOptions { name: string; path: string; server: Server; provider: BaseProvider; seed: bigint; stems: ReadonlyMap<string, LevelStem>; dimensionTypes: ReadonlyMap<string, DimensionType>; load: ReadonlyMap<string, 'eager' | 'lazy'>; factories: GeneratorFactories }
export class Level {
    readonly name: string;
    readonly seed: bigint;
    getProvider(): BaseProvider;
    getStems(): ReadonlyMap<string, LevelStem>;
    getDimensionTypes(): ReadonlyMap<string, DimensionType>;
    world(dimensionTypeId: string): Promise<World>;       // builds and enables lazily; generator from the factories
    loadedWorld(dimensionTypeId: string): World | undefined;
    worlds(): Iterable<World>;
    getTicks(): number; getGameRuleManager(): GameRuleManager; getWeather(): WorldWeather;
    getSpawn(): Vector3 | null; setSpawn(at: Vector3): void;   // Overworld-only, as Bedrock's SpawnX/Y/Z
    getPlayerData(key): Promise<...>; savePlayerData(key, data): Promise<void>;
    customDimensionDefinitions(): DimensionDefinition[];  // for DimensionDataPacket
    save(): Promise<void>; enable(): Promise<void>; disable(): Promise<void>;
}
// World
public getLevel(): Level;
public getStem(): LevelStem;
public getTicks(): number;                 // forwards
public getGameRuleManager(): GameRuleManager;
public getSeed(): bigint;
public getWeather(): WorldWeather;
```

The tick: `Level.tick()` advances the clock once and calls `World.update(tick)` on each loaded
world. `World.update` keeps its body. The player roster for persistence moves to `Level`; the
per-world `players` map that chunk coverage and broadcasting use stays on `World`. Weather is
per level and `World.isRainingAt` answers false when `java.hasSkylight` is false.

**Tests.** `Level.test.ts` over the LevelDB test harness: `world('minecraft:the_nether')` builds
once and returns the same instance; `load: 'eager'` builds at `enable`; the clock advances once
per tick with two loaded worlds; `getTicks` on both worlds agree; save writes one `level.dat`; a
custom type appears in `customDimensionDefinitions()` with an id from 1000. Every existing
`World*.test.ts` passes with its stub extended by a `level` double; prefer a shared
`fakeLevel()` in `packages/prismarine/src/testing/` to copy-pasted stubs.

**Changeset.** `@jsprismarine/prismarine` minor (`World` constructor options change).

**Verify.** **package** on prismarine, **types**, **custom**, **corpus**.

**Done when** `WorldManager` constructs one `Level` per loaded world (still only `level-name`) and
every `World` reaches its seed, ticks and game rules through it.

**Depends on** chunks 9, 11, 12 and 13.

---

## Wave 4: wiring and the client

Three chunks in `@jsprismarine/prismarine`, disjoint files.

### Chunk 15: `WorldManager` loads every level, resolves stems, honors saved stems

**Goal.** Every `worlds.*` entry becomes a `Level`; stems come from the preset plus
`dimensions.<id>` overrides; a saved `worldGenSettings` record wins over the config with a log
line; `getWorldByDimension` and `Server.worldFor` resolve through the default level.

**Files.** `packages/prismarine/src/world/WorldManager.ts` (`enable` at 64, `loadWorld` 143,
`buildWorld` 161, `worldsByDimension` 44, `getWorldByDimension` 314, `unloadWorld` 261),
new `packages/prismarine/src/world/resolveStems.ts` with test, `packages/prismarine/src/Server.ts`
(`worldFor` at 296, the comment at 295), `packages/prismarine/src/command/host/support.ts`
(`worldOf`, `loadedDimensions`), `packages/prismarine/src/command/host/entities.ts` (the `/tp`
ordering bug at 240 to 271: build the `setPosition` promise after `setWorld` resolves),
`packages/prismarine/src/world/WorldManager.test.ts` (new), `/debug loadWorld` if it exists under
`command/`.

**Public API.**

```ts
export const resolveStems: (normalized: NormalizedWorldData, presets: ReadonlyMap<string, WorldPreset>, saved?: WorldPersistenceData['worldGenSettings'], log?: (line: string) => void) => ReadonlyMap<string, LevelStem>;
// WorldManager
public getLevels(): Level[];
public getLevel(name: string): Level | undefined;
public getDefaultLevel(): Level;
public getWorldByDimension(dimensionTypeId: string): World | undefined;  // default level, loaded worlds only
public async worldFor(dimensionTypeId: string): Promise<World>;          // default level, builds a lazy one
/** @deprecated */ public getWorlds(): World[];                          // every loaded world of every level
```

**Tests.** `resolveStems`: preset only; one override of `generator`; one added dimension; saved
stems differing from config win and the log line names the dimension and both kinds. `WorldManager`
over the LevelDB harness: two `worlds.*` entries both load; `level-name` is the default; a lazy
dimension is not built until `worldFor`; `unloadWorld` closes one level.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** a default config boots three stems with the Overworld eager and the other two lazy,
and `/tp` into another dimension lands at the requested position.

**Depends on** chunk 14.

### Chunk 16: `PlayerSession.changeWorld` and the eight-step sequence

**Goal.** The body of `Player.setWorld` moves to `PlayerSession.changeWorld`, which implements the
portal note's section 3 order, holds a pending change keyed by loading screen id, drops
`PlayerAuthInput` until `EndLoadingScreen`, and re-sends `MovePlayer`, attributes and inventory.

**Files.** `packages/prismarine/src/network/PlayerSession.ts` (`beginLoadingScreen` 1404,
`endLoadingScreen` 1416, `flushQueuedChunks` 480, `clearChunks`), `packages/prismarine/src/Player.ts`
(`setWorld` 517 to 566 becomes `return this.getNetworkSession().changeWorld(world, arrival)`),
`packages/prismarine/src/network/handler/PlayerActionHandler.ts` (`ChangeDimensionAck` at 315),
`packages/prismarine/src/network/handler/ServerboundLoadingScreenHandler.ts`,
`packages/prismarine/src/network/handler/PlayerAuthInputHandler.ts` (`handle` at 130),
`Player.test.ts` (`setWorld` tests at 658 to 720), new `PlayerSessionDimensionChange.test.ts`.

**Public API.**

```ts
export interface Arrival { world: World; position: Vector3; yaw: number; pitch: number; respawn?: boolean }
// PlayerSession
public async changeWorld(arrival: Arrival): Promise<void>;
public pendingDimensionChange(): { loadingScreenId: number; arrival: Arrival } | undefined;
public completeDimensionChange(loadingScreenId: number): Promise<boolean>;   // called by the loading screen handler
```

Order: save the record to the old level with the old dimension, remove from the old world,
`despawnAllTrackedEntities`, `clearChunks`, move the `Position`, add to the new world; then
`ChangeDimension { dimension: target.bedrockId, position, respawn, loadingScreenId }` (the
four-step detour only when the two `bedrockId`s are equal), `StopSound` all,
`NetworkChunkPublisherUpdate`, server-sent `PlayerAction ChangeDimensionAck`, the arrival chunks
through `sendInitialSpawnChunks`, `PlayStatus PlayerSpawn`; on `EndLoadingScreen` with the
expected id, `MovePlayer` teleport, `UpdateAttributes`, inventory, `advancementChangedDimension`.
`PlayerAuthInputHandler.handle` returns early while a change is pending. An `EndLoadingScreen`
with another id is logged and ignored.

**Tests.** Over `fakePlayer()` from `Player.test.ts`: the packet order above by `findIndex` over
`sent`; one `ChangeDimension` for a real dimension change and the detour only for equal ids; the
chunks carry the target `bedrockId`; `PlayerAuthInput` ignored until the right `EndLoadingScreen`;
a wrong id logged; `respawn: true` passes through. Chunk-batch leak: a batch in flight during the
change does not mark old-world hashes loaded (the storage note's observation about
`flushQueuedChunks`).

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**. Then a manual run against a real
client for open questions 2 and 5; record the result in the commit body.

**Done when** `Player.setWorld` is a one-line forwarder and the tests pass.

**Depends on** chunks 8 and 14.

### Chunk 17: the join path speaks the level's dimensions

**Goal.** `StartGame` fields from the `Level`, `DimensionData` for custom types, `SetSpawnPosition`
resent when the spawn is in another dimension.

**Files.** `packages/prismarine/src/network/startGameData.ts` (lines 64 to 80: `dimension` from the
join world's `bedrockId`, `generator` from the Overworld stem's overlay `generatorType`, drop the
`Flat` import at 17), `packages/prismarine/src/network/handler/ResourcePackClientResponseHandler.ts`
(the `SetSpawnPosition` at 272; send `DimensionData` after `StartGame` and before chunks when
`level.customDimensionDefinitions()` is non-empty), `packages/prismarine/src/world/RespawnPoint.ts`
(`StoredSpawnPoint.dimension` already present), their tests.

**Public API.** None new; `startGameData(world, ...)` reads `world.getLevel()`.

**Tests.** `startGameData` test: a flat Overworld stem yields `generator 2`, a noise stem `1`; a
Nether join world yields `dimension 1`. The handler test asserts no `DimensionData` for the
vanilla three and one entry with `dimensionType 1000` for a custom type, and that `SetSpawnPosition`
carries the spawn's dimension id rather than the join world's.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**. Manual check of open questions 1
and 3 with a custom `dimension_type` in a test datapack; note the result in the commit body.

**Done when** `rg 'instanceof Flat' packages/prismarine/src` is empty.

**Depends on** chunks 4 and 14.

---

## Wave 5: terrain, travel rules, respawn

### Chunk 18: Nether and End terrain, and the `worldgen.dimensions` parity family

**Goal.** The default preset's three stems generate through `minecraft:noise`, and a parity row
proves it from data.

**Files.** `packages/parity/src/families.ts` (`worldgenDimensions: 'worldgen.dimensions'`), new
`packages/parity/src/worldgen.dimensions.test.ts`, `packages/parity/src/references.ts` if a new
reference is needed, `docs/data-driven/parity.md` row list; in prismarine only fixes that the
first real Nether and End chunks expose (expected: `javaStructurePlacement.ts` biome filtering now
admits the Nether's and End's structure sets, so `fortress` and `end_city` appear in
`unbuiltTypes()` and must be reported, not thrown).

**Tests.** Under `describeFamily(FAMILIES.worldgenDimensions, [REFERENCES.javaWorldgenData], ...)`:
the seven presets and four types parse through the public parsers and match the dimension note's
tables 1.1, 1.2 and 2.5; one chunk per vanilla dimension at (0, 0) from the resolved stems has
biome ids inside the dimension's biome set and blocks inside the Bedrock bounds; the Nether chunk
has 8 network sub chunks and the End 16; the unbuilt structure types are exactly `fortress` and
`end_city` (an exact count that is a contract until chunks 26 and 27).

**Changeset.** `@jsprismarine/prismarine` patch if anything changes there; parity is private.

**Verify.** **package** on parity, **corpus** (the dashboard gains one row and loses none),
**types**, **custom**.

**Done when** the dashboard shows `worldgen.dimensions` with a measured value.

**Depends on** chunks 12 and 15.

### Chunk 19: `DimensionTravel.resolve`: rules, scaling, index, search, creation, End

**Goal.** The server half of the portal note's section 6, up to but not including moving an
entity: where a trip lands, creating a portal or the End platform when the rules say so.

**Files.** New `packages/prismarine/src/world/portal/rules.ts`, `scale.ts`, `PortalIndex.ts`,
`search.ts`, `create.ts`, `DimensionTravel.ts`, each with a test; `packages/prismarine/src/world/World.ts`
(`writeBlockRuntimeId` and chunk load feed `PortalIndex`; keep the edit to those two call sites).

**Public API.**

```ts
export const DIMENSION_TRAVEL: Readonly<Record<string, { portalSearchRadius: number; allowsNetherPortal: boolean; respawnBlock?: 'bed' | 'respawn_anchor' }>>; // keyed by Java type id; coordinateScale comes from DimensionType.java
export const PORTALS: Readonly<Record<string, { kind: 'nether' | 'end'; frame: readonly string[]; links: Readonly<Record<string, string>>; delayTicks: { survival: number; creative: number } }>>;
export const scalePosition: (from: DimensionType, to: DimensionType, at: Vector3) => Vector3;   // floor(x * from.scale / to.scale), y clamped to [to.minY, to.minY + logical_height - 1]
export class PortalIndex { add(at): void; remove(at): void; closest(to: Vector3, radius: number): Vector3 | undefined; }
export interface PortalBlockRef { world: World; position: Vector3; block: string }
export interface Arrival { world: World; position: Vector3; yaw: number; pitch: number; createdPortal: boolean }
export class DimensionTravel {
    constructor(server: Server);
    resolve(entity: Entity, portal: PortalBlockRef): Promise<Arrival | undefined>;
}
```

The frame and portal block lists import the constant chunk 5 exported from
`packages/blocks/src/families.ts`. Nether resolve: target world through
`level.world(PORTALS[block].links[from.id])`, `scalePosition`, `PortalIndex.closest` within
`portalSearchRadius` (128 both ways), rectangle around the hit and Java's relative-position
mapping, else, for players only, `portalCreationSite` and `writeNetherPortal` from chunk 5. End
resolve: into the End writes the platform and returns (100.5, 49, 0.5, yaw west) for players and
y 50 for others; out of the End returns the player's spawn resolved across dimensions (chunk 20
supplies `resolveOwnSpawn`'s cross-dimension form; until then the Overworld spawn).

**Tests.** The portal note's section 6 list: `scale.test.ts` (negative floor, y clamp into 0..127
and -64..319), `search.test.ts` (Euclidean closest with y, radius edge, tall-portal two-ends),
`create.test.ts` (closest valid spot, forced clamp, flanks, frame and six blocks on the source
axis), `DimensionTravel.test.ts` over two in-memory worlds from the LevelDB harness: resolve lands
in the right world at the scaled position, creates for a player and not for an item, writes the
End platform, and refuses when the source is the End and the portal is a nether portal (returns the
Overworld link per `PORTALS`).

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** every rule in the tests has a Java constant from the portal note beside it in a
comment.

**Depends on** chunks 5, 7, 8 and 15.

### Chunk 20: respawn across dimensions

**Goal.** A player who dies in the Nether with an Overworld bed respawns in the Overworld.

**Files.** `packages/prismarine/src/Player.ts` (`resolveOwnSpawn` at 1023 resolves in
`level.world(spawn.dimension)` instead of refusing), `packages/prismarine/src/network/handler/RespawnHandler.ts`
(calls `changeWorld({ ..., respawn: true })` when the resolved world differs),
`packages/prismarine/src/network/handler/ShowCreditsHandler.ts` (leave the note at line 11; the
End exit credits are out of scope), tests beside each.

**Tests.** `RespawnHandler.test.ts`: same world respawns in place; other world sends one
`ChangeDimension` with `respawn: true` and the spawn position; a missing bed falls back to the
Overworld spawn. `Player.test.ts`: `resolveOwnSpawn` returns a position in the spawn's world.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** both tests pass.

**Depends on** chunk 16.

---

## Wave 6: travel dispatch, parity rows, docs

### Chunk 21: portal contact dispatch, `transfer`, non-player travel, events

**Goal.** Entities and players standing in a portal travel, with the Bedrock rules (no passengers,
player-only creation), and plugins can observe or cancel it.

**Files.** `packages/prismarine/src/world/World.ts` (`update` at 690, after
`this.entityGrid.rebuild(entities)` at 754: for each entity iterate the cells of its box and call
`travel.touch` on the first cell whose block is in `PORTALS`), `packages/prismarine/src/world/portal/DimensionTravel.ts`
(`touch`, `transfer`), `packages/prismarine/src/entity/Entity.ts` (the tick step of
`PortalContact`), new `packages/prismarine/src/events/player/PlayerChangeDimensionEvent.ts` and
`events/entity/EntityPortalEnterEvent.ts` following `PlayerMoveEvent`, `packages/prismarine/src/events/Events.ts`,
`packages/prismarine/src/Server.ts` (one `DimensionTravel` instance, `getDimensionTravel()`),
`DimensionTravel.test.ts`, `WorldTickPhases.test.ts`.

**Public API.**

```ts
// DimensionTravel
touch(entity: Entity, portal: PortalBlockRef): void;          // per tick while overlapping
transfer(entity: Entity, arrival: Arrival): Promise<void>;    // players through session.changeWorld; others removeEntity/addEntity, cooldown 300
// Events
export class EntityPortalEnterEvent extends Event { entity; portal: PortalBlockRef }               // cancelable
export class PlayerChangeDimensionEvent extends Event { player; from: World; to: World; arrival }   // cancelable
```

Delay per `PORTALS[block].delayTicks[gamemode]`; a passenger or a ridden entity never travels;
`setPortalCooldown()` on departure with 300 for entities and 10 for players.

**Tests.** `contact.test.ts` items from the portal note (80 survival, 0 creative, decay, cooldown
blocks re-entry, passenger refused); `DimensionTravel.test.ts`: an item in a lit portal transfers
on the first tick and arrives on cooldown; a player transfers after 80 ticks through the chunk 16
sequence; a canceled event leaves the entity where it is; `World.update` dispatches `touch` for an
entity whose box overlaps a portal block at head height only.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** a bot in a hand-built portal on a two-dimension level ends up in the Nether world
in a unit test.

**Depends on** chunks 16, 19 and 20.

### Chunk 22: `blocks.portals` and `protocol.dimension-change` parity rows

**Goal.** The two families the portal note's section 6 asks for, each with a tested dashboard row.

**Files.** `packages/parity/src/families.ts` (`blocksPortals: 'blocks.portals'`,
`protocolDimensionChange: 'protocol.dimension-change'`), new
`packages/parity/src/blocks.portals.test.ts` and `protocol.dimension-change.test.ts`,
`docs/data-driven/parity.md` row list.

**Tests.** `blocks.portals`: every block `PORTALS` and the frame lists name exists in the Bedrock
palette capture with the states the rules read (`portal_axis` exactly `unknown, x, z`,
`end_portal_eye_bit`, `minecraft:cardinal_direction`). `protocol.dimension-change`: the packet
sequence `changeWorld` emits, captured from a `fakePlayer()` run, encodes and decodes to equal
data through both `Codec2193` and `Codec2225`, and the `DimensionDefinition` with cloud fields
round-trips at 2225 only.

**Verify.** **package** on parity, **corpus** (two new rows), **custom**.

**Done when** both rows show on the dashboard.

**Depends on** chunks 5, 16 and 21 (for the real emitted sequence). Runs concurrently with 21 if
it captures the sequence from chunk 16's `changeWorld` directly; then 21 is not a dependency.

### Chunk 23: documentation

**Goal.** A human-facing page for dimensions, and the running guide and indexes updated.

**Files.** New `docs/data-driven/dimensions.md` (what a dimension type, stem and preset are; the
config shape with the three examples from the dimension note's section 4.6; the migration table;
`load`; which presets work; portals and what the client sequence looks like; the answers to the
open questions above), `docs/data-driven/README.md` reading map entry, `docs/running.md`
(section 5 final form), `packages/prismarine/README.md` if it lists generators,
`packages/worldgen/README.md` and `packages/block-behaviors/README.md` for anything chunks 1 and 5
left for later.

Apply `.agents/skills/human-docs/SKILL.md` and `.agents/skills/unslop/SKILL.md`.

**Verify.** **custom**; `pnpm run lint` for Prettier on the Markdown.

**Done when** every config key in `JsonConfigTypes.ts` for worlds is described on the page and
each open question has an answer or a "not yet verified" note.

**Depends on** chunks 16, 17, 18 and 21 (so it documents what exists).

---

## Wave 7: the long tail

### Chunk 24: the client integration test

**Goal.** The portal note's integration test: a real `Client` logs into a real `Server` with two
dimensions and observes the dimension change on the wire.

**Files.** `packages/client/src/net/` packet registry (codecs for `ChangeDimension`,
`ServerboundLoadingScreen`, `PlayerAction`, `StopSound`, `NetworkChunkPublisherUpdate` on the
client side; `Login.test.ts`'s "reports what it received but has no codec for" test shows how
unknown ids surface), new `packages/client/src/DimensionChange.test.ts` following `Login.test.ts`
(temp `JSP_DIR`, port 19277 pattern with its own port), `packages/client/src/Client.ts` if the
session needs to answer `EndLoadingScreen`.

**Tests.** Boot with a flat Overworld and a flat Nether stem (no Java data needed), log in, write
a lit portal around the player with `World.setBlockByName`, advance 80 ticks, assert
`ChangeDimension` with `dimension 1`, chunks with `dimension 1`, and after the client replies
`EndLoadingScreen` the server's `player.getWorld().getDimension().bedrockId === 1` and a
`MovePlayer` followed. Tag it `integration`; it runs where `Login.test.ts` runs.

**Changeset.** `@jsprismarine/client` patch.

**Verify.** **package** on client, **types**, **custom**.

**Depends on** chunks 21 and 23.

### Chunk 25: Anvil per-dimension directories

**Goal.** The Anvil provider reads and writes `dimensions/<namespace>/<path>/region`, falling back
to `DIM-1` and `DIM1` for pre-26.1 saves. Low priority; keep it small.

**Files.** `packages/prismarine/src/world/providers/anvil/Anvil.ts` (`DEFAULT_FOLDERS` at 10,
`readChunk` 42, `writeChunk` 52), new `Anvil.test.ts`.

**Public API.** `Anvil.regionDirectory(dimension: DimensionType): string`.

**Tests.** The directory per vanilla dimension; the fallback when only `DIM-1/region` exists;
`listChunks(dimension)` over region file names. Reading and writing real `.mca` bodies stays out
of scope unless the provider already parses them.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Depends on** chunk 13.

### Chunk 26: the `fortress` structure builder

**Goal.** Java's nether fortress piece generator, read from the 26.3 jar as the other builders
were, registered in `javaStructureTypes.ts`.

**Files.** New `packages/prismarine/src/world/generators/datadriven/javaStructureFortress.ts`
with test, `javaStructureTypes.ts` (the JSDoc at lines 1 to 8 changes), the
`worldgen.dimensions` parity test from chunk 18 (the unbuilt set shrinks to `end_city`).

**Tests.** Piece counts and bounding boxes for one seed against a `javap` reading of
`NetherFortressPieces`, following `javaStructureStronghold.test.ts`.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**, **corpus** (the Overworld is
unaffected; the Nether has no corpus yet, so capture one chunk digest in the test).

**Depends on** chunk 18.

### Chunk 27: the `end_city` structure builder

As chunk 26 for `EndCityPieces` (template-based; reuses `javaStructureTemplatePiece.ts`). The
parity unbuilt set becomes empty and the exact-count assertion in chunk 18 turns into "no unbuilt
types".

**Depends on** chunk 18.

### Chunk 28: `minecraft:debug`

**Goal.** Replace the "not supported" throw with Java's debug grid (every block state on a grid at
y 70, spaced 2 apart), which is useful for palette and mapping checks.

**Files.** `packages/prismarine/src/world/generators/factories/debug.ts` and its test.

**Changeset.** `@jsprismarine/prismarine` patch.

**Depends on** chunk 9.

---

## Wave 8: the release after

### Chunk 29: remove the deprecated aliases

**Goal.** Delete `DimensionDefinition`, `GeneratorManager`, the `Flat` and `Overworld` exports of
`Generators.ts`, `registerClassGenerator`, and the `generator` and `layers` config keys, one
release after chunks 8, 9 and 11 ship.

**Changeset.** `@jsprismarine/prismarine` minor.

**Depends on** a published release containing chunks 8, 9 and 11.

---

## The order, and what it buys at each point

| After wave | What works |
| --- | --- |
| 0 | Every parser, the overlay, the 2225 structure, portal geometry in the harness, dimension-aware shards, cooldown on disk. Nothing user-visible. |
| 1 | Config reads the new shape; the End builds in a test; `DimensionType` everywhere. Still one Overworld per world. |
| 2 | One worker pool; a save with Nether and End chunks reads and writes correctly. |
| 3 | A `Level` with three worlds ticks on one clock. |
| 4 | `/tp` into the Nether of the same level works on a real client, with the client ending in dimension 1. Custom dimensions announce themselves. |
| 5 | Nether and End have terrain; the parity dashboard says so; portal destinations resolve; respawn crosses dimensions. |
| 6 | Walking into a lit portal moves you. Two more parity rows. The docs describe it. |
| 7 | A real client proves it in CI; Anvil; fortresses; end cities; the debug grid. |

## Risks, worst first

1. **The `World` constructor change in chunk 14 touches every `World*.test.ts`.** There are more
   than thirty. Build `fakeLevel()` first and migrate tests by search and replace; do not weaken
   any assertion to get there.
2. **Open question 1 (ids of 1000 or more).** If the client refuses, custom dimensions still
   load server-side but a player cannot enter one; `changeWorld` must then refuse with a clear
   error rather than hang the client on the loading screen. Decide in chunk 16.
3. **The shared pool in chunk 12 changes `DataDrivenGenerator`'s cache shape.** The corpus is the
   net; a byte difference there is a bug, not a re-capture.
4. **Chunk 2's composite `worldgen` registry id** is a judgment call about `Definitions`' key
   space. If the identifier report or the mcdoc validator in `packages/packs` assume one directory
   per registry, split into one id per kind instead and say why in the commit.
5. **The portal note's Bedrock-only rules** (128 search radius both ways, player-only creation,
   netherrack flanks, no passengers) are in `DIMENSION_TRAVEL` and `PORTALS` as data. Keep them
   there; a condition in code is how the next person loses track of which edition a rule came from.
