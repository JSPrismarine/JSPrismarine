# Describe a dimension as a Java level stem, and keep one `World` per dimension

Status: accepted

Every world this server loads is the Overworld. `WorldManager.buildWorld` never sets the
`dimension` option, `GeneratorManager` builds one instance of each class in `Generators.ts` and
cannot configure it per dimension, `DataDrivenGenerator` is typed to `MultiNoiseBiomeSource` so the
End cannot be built, the LevelDB provider is bound to one `World` per `db/` where Bedrock writes
three dimensions into one, and `Player.setWorld` sends a fixed Overworld, Nether, Nether, Overworld
sequence so the client always ends in dimension 0. We adopt Java's model as the internal one: a
`DimensionType` loaded from `dimension_type` JSON with a three-row Bedrock overlay, a `LevelStem`
per dimension taken from a `world_preset` and overridable in config, a `GeneratorFactories`
registry keyed by generator kind id, and one `Level` per `worlds.<name>` entry that owns the seed,
the LevelDB directory and one `World` per stem. `World` stays the per-dimension runtime. Portals
and the client's dimension change sequence are built on those types.

The research is in [data-driven-dimensions.md](../research/data-driven-dimensions.md),
[dimension-storage-network-config.md](../research/dimension-storage-network-config.md) and
[portals-and-dimension-travel.md](../research/portals-and-dimension-travel.md). The
implementation is sliced in
[docs/plans/data-driven-dimensions.md](../plans/data-driven-dimensions.md).

## What we build

**Java's three data objects, parsed in `@jsprismarine/worldgen`.** A `dimension_type` is the
physics of a dimension: `min_y`, `height`, `logical_height`, `coordinate_scale`, light, skybox,
clock and the `attributes` map that 1.21.11 moved the old booleans into. A level stem binds a type
to a generator. A generator is a tagged union on `type`: `minecraft:noise` with `settings` and a
`biome_source`, `minecraft:flat` with layers, `minecraft:debug`. The vanilla datapack ships its
three stems only inside the seven `worldgen/world_preset` files, so `parseWorldPreset` is the entry
point and `parseBiomeSource` is the missing dispatch over the four biome source classes the package
already has. `@jsprismarine/packs` routes `dimension_type`, `dimension` and the `worldgen/*`
registries into `Definitions`, which is what lets a user datapack add a dimension, and what retires
the private cache walker in `javaWorldgenData.ts`.

**A Bedrock overlay of three rows in `@jsprismarine/mapping`.** Java id to Bedrock id, Bedrock
name (`minecraft:nether` for `minecraft:the_nether`), the client height clamp, and the `Generator`
enum value for `StartGame`. The Nether row carries `height 128`: Java's type says 256 with
`logical_height 128`, the Bedrock client discards or crashes on sub chunks above 128, and writing
the clamp as data is safer than deriving it from `logical_height`. A type with no row is custom,
gets an id from 1000 up in stem order, and is announced through `DimensionDataPacket`.

**`DimensionType`, `GeneratorFactories` and `Level` in `@jsprismarine/prismarine`.**
`DimensionType` replaces `DimensionDefinition` and carries the Java definition, the Bedrock id and
name, the Bedrock-effective bounds and a `custom` flag. `GeneratorFactories` replaces
`GeneratorManager`: a factory is `{ kind, build(context) }` where the context is the stem, the
dimension type, the seed, the content and the worldgen registries, and the built-in kinds are
`minecraft:noise` over `DataDrivenGenerator`, `minecraft:flat` rewritten to honor its settings and
the dimension's `minY`, `jsprismarine:void`, and `minecraft:debug` registered so the preset parses
and throwing "not supported" at build time. A `Level` is one `worlds.<name>` entry: name, seed,
provider handle, resolved stems, the clock, game rules, weather and the player roster. It builds
one `World` per stem, lazily by default and eagerly when the config says `load: 'eager'`.

**One provider per `Level`.** `readChunk(dimension, cx, cz, ...)` and `listChunks(dimension)`
take the dimension; `writeChunk` reads `chunk.getDimension()`. `level.dat` gains `Generator`,
`FlatWorldLayers`, `NetherScale` and `Time`; player records gain Bedrock's `DimensionId` and
`SpawnDimension`; entity NBT gains `DimensionId` and `PortalCooldown`. The resolved stems persist
in the existing `jsprismarine:world_data` record in the `world_gen_settings` shape, and on a
mismatch with the config the saved stems win and the server logs the difference, because a world
keeps the terrain it was generated with.

**One worker pool per server.** `noiseSettings`, `biomeParameters` and the biome source move from
pool setup into task input, the worker keys its compiled pipeline by settings and seed instead of
seed alone, and `ShardedGenerationPool.shardFor` hashes the dimension id so two dimensions' chunk
(0, 0) do not always share a shard. Three eager pools of six workers would cost three times the
roughly 500 MiB ADR 0002 budgets for one.

**Config as preset plus overrides.** `worlds.<name>` becomes
`{ seed, provider, preset?, dimensions?: { '<id>': { type?, generator?, load? } } }`. `preset`
defaults to `minecraft:normal`. The old `generator: 'Overworld' | 'Flat'` and `layers` keys are
translated once, logged as deprecated, and rewritten on the next save.

**The client sequence Dragonfly, Geyser and Nukkit agree on.** One `ChangeDimension` with the real
target id, `StopSound`, `NetworkChunkPublisherUpdate`, a server-sent `PlayerAction
ChangeDimensionAck`, the arrival chunks, `PlayStatus PlayerSpawn`, then wait for
`ServerboundLoadingScreen EndLoadingScreen` with the id the server chose before accepting
`PlayerAuthInput` again. The four-step detour survives only for a swap between two worlds of the
same Bedrock id, which the client otherwise never closes.

**Portals in two layers.** Geometry (frame scan, ring match, creation footprint, End platform) is
pure functions in `packages/block-behaviors/src/rules/portal.ts` with `portalFamily` hooks for
lighting, collapse, end ring activation and the piglin random tick. Travel is a `DimensionTravel`
service in `packages/prismarine/src/world/portal/` with a rules table, per-entity contact timers
and cooldown, a `PortalIndex` per world, scaling by `coordinate_scale` from the two types, and the
wire sequence above.

## Alternatives rejected

**A, a per-world generator string plus a `dimension` field.** `WorldData.dimension?: 'overworld'
| 'nether' | 'the_end'`, `Nether` and `TheEnd` generator classes, `WorldManager` loading every
`worlds.*` entry. Three config entries make a three-dimension server and nothing new is parsed.
This is Cloudburst's shape, and it fails the goal in four places. Each dimension is its own folder
with its own `level.dat`, so a vanilla Bedrock save cannot be imported or exported as one world.
Generator settings hide in class names, so `large_biomes`, `amplified`, a custom noise setting or a
flat preset each need a new class. A datapack still cannot add a dimension. A plugin generator
still cannot receive settings. The storage note's section 4.2 and the portal note's chunk 1 both
started from this shape; the dimension note's section 4.2 is why the orchestrator chose B over it,
and this ADR records that choice so the smaller shape is not reintroduced slice by slice.

**C, Bedrock's add-on `dimension/*.json` as the primary model.** Preview 26.50.25 added
`minecraft:dimension_height`, `minecraft:default_biome` and `minecraft:generation`, whose only
generator is `void`, and the same release stopped packs from redefining vanilla dimensions. It can
describe a custom void dimension's bounds and nothing about terrain, and it cannot describe the
three dimensions every server has. It stays open as an input format layered on B: a pack dimension
becomes a stem `{ type: <synthesized from dimension_height>, generator: { type: 'jsprismarine:void' } }`.

**A `Dimension` object inside `World`, with `World` as the save.** The storage note's section 4.3
drew this split: `World` keeps provider, seed, clock, game rules, weather and the roster, and N
`Dimension` objects own chunks, generator, entities, systems and the change sink, introduced behind
forwarders. We reject it for three reasons. First, the numbers point the other way: measured by
regex over non-test source, `getWorld()` appears 102 times in 38 files and the per-dimension
methods dominate (`setBlock` 32, `getBlock` 29, `getPlayers` 28, `getLoadedChunk` 26, `getEntities`
20, `getEntity` 20) against the save-level ones (`getGameRuleManager` 14, `getTicks` 12,
`getGameRule` 11, `weatherCycle` 6, `getSeed` 4). Forwarding the few save-level getters from a
per-dimension `World` to its `Level` is a handful of one-line methods; forwarding the many
per-dimension methods from a save-level `World` to "the dimension of the position it is handed, or
the Overworld when a caller passes none" turns every `setBlock` into a lookup and makes a missing
position silently mean the Overworld. Second, `Position` carries a `World` and `Entity` reaches its
server through `position.getWorld()`, so the object a position names must be the one that holds the
entity's chunks. Third, everything already keyed per dimension (`Chunk`, the LevelDB keys,
`WorldChangeSink`, the content runtime's `worldFor(dimension)`, `Server.getEntityRuntime(dimension)`)
is keyed to `World` today and keeps working unchanged. Every Bedrock peer surveyed (Dragonfly,
PowerNukkitX, Cloudburst, Allay) also has one world object per dimension. What is new is the
`Level` above it, which is small and which nothing addresses by position.

**A new `packages/dimensions` package.** The parsing half has the same inputs and style as
`@jsprismarine/worldgen`, the runtime half needs prismarine's `Chunk` and `ServerContent`, and
the overlay is three rows that belong with the rest of mapping. A separate package would hold
types only and add a boundary every other package crosses.

**Three eager worker pools, one per dimension.** The pool is the largest memory consumer in the
process. Keying the worker's pipeline cache by (settings, seed) instead of seed is the smaller
change and keeps the worker count at `min(6, cores - 2)` for the whole server.

## Consequences

`Generator.generateChunk(cx, cz, seed, config)` keeps its signature, as ADR 0002 requires, so the
chunk pipeline, the scheduler and the chunk tests are unaffected by who builds the generator.

`DimensionDefinition` becomes a deprecated alias of `DimensionType` for one release, and
`Flat` and `Overworld` stay as exports of `Generators.ts` for one release as thin wrappers that
build through the factories, so `registerClassGenerator` callers keep compiling. Both go in the
release after.

`World` gains a `Level` and forwards `getTicks`, `getGameRuleManager`, `getGameRule`, weather and
`getSeed` to it. The 102 `getWorld()` call sites do not move. Code that iterated
`WorldManager.getWorlds()` to find "the Nether" now asks a `Level` for `world('minecraft:the_nether')`.

The provider interface changes shape. `readChunk` and `listChunks` take a dimension, which is a
breaking change for any out-of-tree provider; `@jsprismarine/prismarine` is below 1.0.0, so the
Changeset bump is `minor`.

A LevelDB folder written by this server before the change needs no conversion: Overworld keys
carry no dimension integer, exactly as before, and the stems are written on first load from the
translated config.

The config file converges on the new keys. A config with `generator: 'Flat'` and `layers` reads as
`preset: 'minecraft:flat'` with an Overworld stem override; any other generator string is an error
naming the registered kinds, as today.

The worker pool is shared, so a Nether chunk and an Overworld chunk compete for the same six
workers. Lazy `load` means the first portal trip pays the destination's pipeline build
(`RandomState` costs 55 to 134 ms per settings and seed); `load: 'eager'` moves that to startup.

Whether a Bedrock client accepts `ChangeDimension` to an id of 1000 or more, and whether it keeps
inventory and effects across a dimension change, have not been verified. The plan marks the slices
that must test both against a real client before relying on them.
