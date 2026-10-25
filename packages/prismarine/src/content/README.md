# The content composition root

Twenty packages each own one content domain and none of them knows the others exist. This directory
is the only place that does. It loads a pack stack, resolves every domain against it, and hands the
server one object, `ServerContent`.

It also owns the other half of that job: the single world interface the four migrating subsystems
implement, out of which the nine world interfaces those packages declare are projected.

Nothing here is on by default. `config.yaml`'s `content-packs` starts at `false`, so the server
boots on the managers it has always used while the subsystems move across one at a time.

## What one build produces

Against the pinned BDS 1.26.51 pack, the `jsprismarine_vanilla` overlay and the Java 26.3 vanilla
datapack, `buildServerContent()` takes about 3.6 seconds and reports no errors:

| Registry | Count |
| --- | --- |
| Blocks, and palette states | 1477, 22079 |
| Items | 1613 |
| Entity types, of which brain mobs | 136, 20 |
| Recipes | 2042 |
| Loot tables | 1447 |
| Enchantments | 43 |
| Spawn rules | 60 |
| Trade tables | 18 |
| Biomes | 89 |
| Features, feature rules | 210, 241 |
| Tags, over 20 tagged registries | 883 |

## Composition order

The order is forced. Each step needs the one before it, and three of the dependencies run backwards,
which is why the code looks the way it does.

1. **Resolve the pack stack.** `resolvePackStack` assembles the composed vanilla Bedrock pack, this
   project's `jsprismarine_vanilla` overlay from `@jsprismarine/blocks`, the Java vanilla datapack,
   then the world's packs and the plugins', in that order. Mojang's two halves are fetched rather
   than published with this server, so a member whose directory is not on disk is reported as a
   `pack.missing` warning and left out. `JSP_VANILLA_BEHAVIOR_PACK` and `JSP_VANILLA_DATAPACK`
   point at local copies, and an override that points at nothing is an omission rather than a
   fallback to the cache.
2. **Load it.** `@jsprismarine/packs` composes the stack into one `Definitions` object, with
   Bedrock definitions replaced whole by a later pack and Java tags merged across packs.
3. **Check the Java identifiers.** `checkIdentifiers` resolves every Java identifier the stack
   references through `@jsprismarine/mapping`. A strict build throws `UnmappedIdentifierError`,
   naming the identifier and the pack; a normal build writes one `identifier.unmapped` error per
   identifier and carries on, so an operator sees exactly what will be missing. It runs here, ahead
   of every resolve, so a strict build stops before any domain builds around the hole.
4. **Build the world views.** `contentWorldViews` projects the nine content world interfaces out of
   the one `ServerWorldAdapter`. It is built before the content, because the behavior families take
   a world at registration time, and it reads the content back through a lookup closure, because a
   behavior reads a block's properties at hook time. That is the first backwards dependency.
5. **Register the block behavior families, then resolve the blocks.** `resolveBlocks` attaches the
   49 families as it resolves, so they have to exist first.
6. **Register the item behavior families, then resolve the items.** The 47 families build item
   stacks through an `ItemFactory` over a registry that does not exist until they are registered,
   so the factory is `deferredItemFactory()` and is bound afterwards. Second backwards dependency.
7. **Build the entity component registry, then load the entities.** `createGoalEntityRegistry`
   registers all 170 goals before `@jsprismarine/entities`'s reference components, because that
   registration skips names already taken and the goals are the implementations the server wants.
   Third backwards dependency.
8. **Merge the tags, then load the recipes.** A `#tag` ingredient parses as accepting nothing
   without a tag lookup.
9. **Parse the rest**: loot, advancements, enchantments, spawn rules, trade tables, biomes,
   features.
10. **Flatten.** `flattenBlockStates` and `flattenItemFacts` precompute the hot columns into typed
   arrays indexed by runtime id, which is what the tick loop, the light engine and the explosion
   code read instead of calling through a type.

A content reload replaces the whole build. Registry ids are positional, so hold a key or a `Holder`
across one, never a number.

## Testing without Mojang's data

`testing.ts` builds the same `ServerContent` out of a handful of definitions and a two-block
palette, through the real loaders and the real families:

```typescript
import { buildServerContent } from './ServerContent';
import { fixtureContentOptions } from './testing';

const content = buildServerContent(fixtureContentOptions({ world: singleDimension(myAdapter) }));
```

Every source is injectable. `ContentOptions.load` replaces the pack loader, `blockPalette` replaces
the captured 22079-state palette with one that matches the fixture, and `itemDefinitions` replaces
Java's committed item table. A test that genuinely needs the fetched data gates itself behind
`JSP_CONTENT_VANILLA`; see the last `describe` in `packStack.test.ts`.

A tiny stack needs a tiny palette. Flattening fails on a runtime id no definition covered, which is
the point of it, so loading two blocks against the vanilla palette fails by design.

## The adapter surface

`ServerWorldAdapter` in [`world/adapter.ts`](world/adapter.ts) is the one interface the following
subsystems implement. `contentWorldViews` turns it into the nine the content packages declare:

| Package | Interface it declares | Where it comes from |
| --- | --- | --- |
| `block-behaviors` | `BlockWorld` and its `WorldActions` | `level`, `blocks`, `entities`, `effects`, `ticks`, `random`, plus `jsprismarine:block_properties` out of the resolved block types |
| `item-behaviors` | `WorldActions`, a different interface of the same name | `blocks` and `random` for two members, the optional `items` group for the other seven |
| `lighting` | `BlockLightView` | `level` and `blocks`, with the two per-state numbers read out of the flattened block table |
| `engine-systems` | `WorldAccess` | the six core groups, renamed; nothing optional |
| `spawning` | `SpawnWorld` | the core groups, plus the optional `spawning` group for `site`, `poolCount` and `mobEventActive` |
| `entity-goals` | `GoalWorld` | the optional `ai` group, per entity |
| `entities` | `EntityActuator` | the optional `ai` group, per entity |
| `entity-brains` | `BrainWorld` | the optional `ai` group |
| `features` | `FeatureWorld` | the optional `generation` group, per decorated chunk |
| `commands` | `CommandHost` | the optional `commands` group, once `@jsprismarine/commands` is a dependency |

Six groups are required and five are optional. A projection that needs an absent group throws
`NotWiredError`, which names the member and the subsystem that owes it. Nothing returns a value it
guessed: a spawn rule reading light level 0 everywhere looks like a dark world rather than like
missing code, and that is the failure this rule exists to prevent.

`unwiredWorld()` is an adapter whose every member throws. It is what `buildServerContent` falls
back on when `ContentOptions.world` is absent, so a test builds content with no world at all and
the first hook that touches the world says what is missing.

A running server passes `serverWorldSource` from `src/content/world/serverSource.ts` instead. It
spreads the subsystems' groups into one adapter per dimension over the loaded `World`, and resolves
that world per call, because the content is built before the first world loads.

## What each of the four subsystems implements

Each owns part of one object. Build it per dimension and hand a `ServerWorldSource` to
`ContentOptions.world`.

### Blocks and items (`src/block/`, `src/item/`)

- `blocks.get`, `blocks.set`, `blocks.data`, `blocks.setData`, `blocks.notifyNeighbors`,
  `blocks.power`, over chunk storage and the block entity index.
- The optional `items` group: `stateOf`, `environment`, `targetOf`, `includes`, `transform`,
  `effectsOf` and `perform`. `perform` takes one `ItemWorldAction`, a tagged union of 28 variants,
  so adding an effect is a new case rather than a new adapter method.
- The per-state block properties already come from `ServerContent`; nothing to do there.

### World (`src/world/`)

- `level`: the dimension identifier, its bounds, its sea level, the seed, the clock, the difficulty
  and the weather.
- `blocks.light`, `blocks.isLoaded`, `blocks.surfaceY`, `blocks.biome`, `blocks.biomeTags`. A chunk
  stores the numeric Bedrock biome id, so `blocks.biome` reads it back through
  `bedrockBiomeToJava` in `@jsprismarine/mapping` and `blocks.biomeTags` looks the resulting
  identifier up in [`content/biomeTags.ts`](biomeTags.ts), which indexes the `minecraft:tags`
  component of the pack stack's biome definitions.
- `ticks`: the two scheduled tick lists, with Java's dedupe rule and `willTickThisTick`.
- `random`: the world's own `RandomSource`, so a seeded world is reproducible.
- The optional `generation` group: `featureWorld(chunkX, chunkZ)`. This one is generation time
  rather than live world. The states are Java states, the chunk is still being built and the region
  is gone once decoration finishes, which is why it is a factory rather than a member.

### Entities (`src/entity/`)

- `entities`: `at`, `near`, `players`, `spawn`, `remove`, `drop`, `countOfType`. `spawn` puts a
  body into the live world rather than an `EntityInstance` into the data-driven index, because the
  live world is what clients are sent and what a save writes. The content entity registry decides
  which identifiers are spawnable, a written class is used where one adds behavior, and everything
  else is a `GenericEntity` carrying the identifier, which the client draws from the identifier
  anyway.
- The optional `spawning` group: `site`, `poolCount`, `mobEventActive` and the optional
  `villageBorderDistance`.
- The optional `ai` group: `goalWorld(entity)`, `actuator(entity)` and `brainWorld()`. `GoalWorld`
  has 44 optional members, and a goal whose world cannot answer one refuses to start rather than
  throwing, so this can come up a member at a time.

A player's right click goes through [`item/interaction.ts`](../item/interaction.ts) before it
reaches `World.useItemOn`. The block the player clicked gets `onPlayerInteract`, unless the player
is sneaking with something in hand; then the item gets `onUseOn`; and only when both decline does
the item place the block it names, through the adapter, so `onPlace` runs and a container gets its
record. The path declines whenever `content-packs` is off, and `World.useItemOn` runs as it always
has.

### Network (`src/network/`)

- `effects`: `playSound`, `spawnParticle`, `emitGameEvent`.
- The optional `commands` group, once `@jsprismarine/commands` is a dependency. It is typed here as
  `ContentCommandHostSlot`, that package's five groups with their bodies left open, so the real
  `CommandHost` is assignable without this package depending on it yet. Replace the type with the
  real import when you take the dependency.
- `@jsprismarine/wire` needs no adapter. It reads `ServerContent.blocks.palette`,
  `ServerContent.items.registry` and `ServerContent.recipes` to write `StartGamePacket`'s block
  properties, `ItemRegistryPacket`, `CreativeContentPacket` and `CraftingDataPacket`.

## What a running server still refuses

`serverWorldSource` wires most of the adapter. These members stay throwing, each naming the
subsystem that owes it, and each for a reason rather than for want of plumbing.

| Member | Why |
| --- | --- |
| `effects.emitGameEvent` | Java's game event system. Nothing listens, and Bedrock puts nothing on the wire for one. |
| The `spawning`, `ai` and `generation` groups | Left absent rather than filled with throwing members, which is what makes the projection in `views.ts` report the owner. |

`items.stateOf`, `items.targetOf` and `items.perform` no longer throw.
[`item/actorPort.ts`](../item/actorPort.ts) answers both queries off the live player and performs
the eight variants this server has a system for: eating, a blow, a stack into the inventory,
durability, armor, a name tag, a random teleport and an item cooldown. The other fourteen are
reported once per kind, naming the system that is missing, and do nothing. `perform` returns
nothing, so none of them reports a success it did not have.

Block entity records are the chunks' own block entities, so a container filled through a behavior
is saved with its chunk and sent to every client that loads it.
[`blockentity/contentRecord.ts`](../blockentity/contentRecord.ts) states the mapping: a container's
`items` becomes Bedrock's `Items` list, and every other field of the record is JSON under one
`jsprismarine:data` tag, because Bedrock has no schema for them. Tags the record does not describe
stay where they were found. A new record is filed under the vanilla id when the server models that
type and under a `jsprismarine:` id when it does not, rather than under a vanilla name guessed from
the block.

## Known gaps

- `ServerContent.structures` is an empty registry. `@jsprismarine/packs` routes no structure
  registry, because the templates are NBT rather than JSON. The registry is declared so the seam
  does not move once it does route them.
- `SpawnWorld.biome` is deliberately not projected. It returns a `string` where the adapter returns
  `string | undefined` for an unloaded chunk, and the interface declares it optional precisely so a
  world that cannot always answer leaves it out. A spawn rule's `is_biome` then refuses rather than
  matching a biome the server guessed.
- Worldgen's `WorldgenData` is not built here. Java's `density_function`, `noise` and
  `noise_settings` registries are not among the ones `@jsprismarine/packs` loads, so the world
  subsystem reads them itself for now.
