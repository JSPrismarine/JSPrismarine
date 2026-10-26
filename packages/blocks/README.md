# @jsprismarine/blocks

The block half of the content runtime: the Bedrock block definition grammar, the components that
grammar names, the per-state model behind the palette, and the `jsprismarine_vanilla` overlay pack
that declares all 1477 palette blocks.

It knows nothing about behavior. A block's components say what it is; a behavior says what it does.
The behavior families live in their own package and plug in through `BlockHooks` and
`BehaviorRegistry`, described under [the behavior seam](#the-behavior-seam).

## The grammar

One block file is `format_version`, `minecraft:block.description`, `components` and `permutations`:

```json
{
    "format_version": "1.26.50",
    "minecraft:block": {
        "description": {
            "identifier": "minecraft:shelf_mushroom",
            "menu_category": { "category": "nature" },
            "states": { "growth": [0, 1] },
            "traits": { "minecraft:placement_direction": { "enabled_states": ["minecraft:cardinal_direction"] } }
        },
        "components": { "minecraft:loot": "loot_tables/blocks/shelf_mushroom_growth_0.json" },
        "permutations": [
            {
                "condition": "query.block_state('growth') == 1",
                "components": { "minecraft:loot": "loot_tables/blocks/shelf_mushroom_growth_1.json" }
            }
        ]
    }
}
```

`parseBlockDefinition` reads one file into a `BlockDefinitionDocument`. Bad data comes back as a
`Diagnostic` with the same shape `@jsprismarine/packs` and `@jsprismarine/content` use, never as a
throw, so one broken file cannot stop a load. A `BlockError` means a mistake against this package's
own interface instead: a state the block does not carry, a runtime id outside the palette.

The parser also reads `internal_vanilla_data`, the undocumented key all 98 of Mojang's own
data-driven block files carry. Its `block_archetype` is how Mojang attaches engine code to a
data-driven block, and this package reads it as a behavior name for exactly that reason.

### Schema versions

`format_version` picks the newest known schema at or below the file's version, through
`selectSchemaVersion` from `@jsprismarine/packs`. Three versions are known, and each difference
comes from a file in the repository's pinned sources.

| Version | What changes |
| --- | --- |
| `1.16.100` | The oldest the runtime reads. Mining time, blast resistance, light output and light dampening are written as `minecraft:destroy_time`, `minecraft:explosion_resistance`, `minecraft:block_light_emission` and `minecraft:block_light_absorption`. |
| `1.19.40` | Those four are replaced by `minecraft:destructible_by_mining`, `minecraft:destructible_by_explosion`, `minecraft:light_emission` and `minecraft:light_dampening`. |
| `1.26.20` | `description.traits` exists. `Blocks.json` forbids the nine legacy `on_*` and ticking components plus `minecraft:breathability` and `minecraft:unit_cube` at the top level, and `Permutation.json` forbids a longer list inside a permutation. |

A file that uses a component its version does not have loads with the rest of its components and a
`block.component-version` warning. A file that uses a forbidden one gets a
`block.component-forbidden` error for that component only.

## Components

`createBlockComponentRegistry()` returns a `ComponentRegistry<BlockHooks>` holding 57 factories: the
49 names in Mojang's `metadata/json_schemas/server/block/1.26.20/Components.json`, the four property
components Mojang renamed at 1.19.40, `minecraft:custom_components`, and this package's three
overlay components. Mojang component schemas follow the corresponding schema files, including the
defaults they declare; project components follow their documented shapes.

Measured against the real data: Mojang's 98 vanilla block files in `bedrock-samples` v1.26.50.4 use
20 distinct components under `components`, plus `minecraft:transformation` which appears only inside
`shelf_mushroom`'s permutations, for 21 in all. That matches the count of 20 in
[the research note](../../docs/research/bedrock-blocks-items-recipes-biomes-features.md), which
counted the base lists. The note's "8 permutations" for `shelf_mushroom` is one short; the file has
nine. `src/vanillaBlocks.test.ts` checks both numbers and prints the tally.

### The three components this project adds

These project components carry metadata the Bedrock block schema does not provide, so the overlay
writes them under this project's namespace:

- `jsprismarine:block_properties` carries `friction` at Java's precision, `random_tick`,
  `requires_correct_tool`, `push_reaction` and whether the row came from Java or from the fallback.
  Mojang's `minecraft:friction` caps at 0.9 and Java's blue ice is 0.989;
  `minecraft:random_ticking` is an internal component `Blocks.json` forbids at the top level of a
  current file.
- `jsprismarine:behavior` names the behavior family. It is the same idea as
  `minecraft:custom_components`, which stays registered so a pack that writes the Mojang key keeps
  working, and sits beside it because Mojang marked that hook deprecated while its version 2 still
  needs two experimental toggles.
- `jsprismarine:container_open_sound` names the sound the server plays after opening this block's
  container screen. For example, `"jsprismarine:container_open_sound": "random.chestopen"`.

### No component binds a handler

Every factory returns `{}`. A component's `hooks` list is the upper bound of what its parameters
let a block reach, which is how the server finds the blocks that can ever see `onTick`,
`onRandomTick`, `onEntityFallOn` or `onRedstoneUpdate` without running anything. `onEntity` is
raised by an entity executing a named event on its home block:

```typescript
registry.hooksOf('minecraft:tick'); // Set { 'onTick' }
registry.hooksOf('minecraft:friction'); // Set {}
```

## States and the palette

A `BlockStateModel` holds one block's states and the dense index of each combination. The canonical
order is the states sorted by name, which is the order the block's NBT compound is written in before
it is hashed into a network runtime id, so an index here and the wire agree on which state is which.
Within that order the first state is the most significant digit, so incrementing an index walks the
last state's values first. A bit reads as a boolean however the capture wrote it.

A `BlockPalette` assigns a dense runtime id per state by walking blocks in identifier order and each
block's states in index order. Those ids are the array indices the flattened tables and chunk
storage read, not the FNV-1a hashes the network carries. `vanillaBlockPalette()` builds one from
`@jsprismarine/minecraft`'s captured catalog: 1477 blocks over 22079 states.

```typescript
const palette = vanillaBlockPalette();
palette.runtimeId('minecraft:cocoa', { age: 2, direction: 1 });
palette.stateOf(1234); // { entry, values }
```

## Resolving

`resolveBlocks(definitions)` turns `@jsprismarine/packs` definitions into a `BlockType` per
identifier and a `BlockState` per palette state.

A block takes its states from its own `description.states` and traits when it declares any, and
otherwise from the palette, which is what every vanilla file needs: none of the 98 declares a state,
and the archetype supplies them. A trait's `enabled_states` expand through `TRAIT_STATES`, with each
state's value domain read off the palette rather than written down, so there is one source of truth.
A trait state no captured block declares, such as `minecraft:sixteen_way_rotation`, is reported
rather than guessed.

Permutations are evaluated per state. Each condition compiles once through `@jsprismarine/molang`
and runs against a scope whose only member is `block.blockState`, which is the whole of what the
docs allow in a condition. The components of every matching permutation apply over the base list in
declaration order with the later entry winning, which is Mojang's rule, and each one carries
`override` so `HookTable` replaces rather than appends. States that match the same permutations
share one resolved content type, so a block with no permutations costs one resolve however many
states it has.

```typescript
const resolved = resolveBlocks(definitions.blocks.values());
const stairs = resolved.types.get('minecraft:oak_stairs')!;
stairs.state({ weirdo_direction: 2 }).content.params(destructibleByMining);
stairs.state().content.hooks.dispatch('onPlace', event);
```

## The behavior seam

A behavior package registers one `Behavior<BlockHooks>` per family and attaches it to the
identifiers that family covers, then passes the registry to `resolveBlocks`:

```typescript
import { BehaviorRegistry } from '@jsprismarine/content';
import { type BlockHooks, resolveBlocks } from '@jsprismarine/blocks';

const behaviors = new BehaviorRegistry<BlockHooks>();
behaviors.register({
    name: 'jsprismarine:crop',
    hooks: ['onRandomTick'],
    create: ({ identifier }) => ({ onRandomTick: (event) => grow(identifier, event) })
});
behaviors.attach('jsprismarine:crop', (identifier) => behaviorFor(identifier) === 'jsprismarine:crop');

resolveBlocks(definitions.blocks.values(), { behaviors });
```

The hook names copy Mojang's `BlockCustomComponent` so a future script host can forward a hook
straight to a pack's JavaScript without a translation table:

| Hook | Event | Returns |
| --- | --- | --- |
| `onPlace` | `BlockPlaceEvent` | `void` |
| `onBreak` | `BlockBreakEvent` | `void` |
| `onNeighborChanged` | `BlockNeighborChangedEvent` | `void` |
| `onRandomTick` | `BlockTickEvent` | `void` |
| `onTick` | `BlockTickEvent` | `void` |
| `onPlayerInteract` | `BlockPlayerInteractEvent` | `boolean \| undefined` |
| `onStepOn` | `BlockStepOnEvent` | `void` |
| `onEntityFallOn` | `BlockEntityFallOnEvent` | `void` |
| `onEntity` | `BlockEntityEvent` | `void` |
| `onRedstoneUpdate` | `BlockRedstoneUpdateEvent` | `void` |
| `onBlockStateChange` | `BlockStateChangeEvent` | `void` |

Every event carries `block: HookBlock`, which is the identifier, the position, the dimension and
the state values. `onPlayerInteract` is the one hook with a return value: `true` means the handler
consumed the interaction, which stops the later handlers under `dispatchFirst`. The event types are
structural and name only what a handler reads, so the server's own `Player` and `Entity` classes are
assignable to `HookActor` without this package depending on the server.

### The held item and the clicked face

Three events carry the item in the hand, under Mojang's own field name `itemStack`:
`BlockPlaceEvent`, `BlockBreakEvent` and `BlockPlayerInteractEvent`. Each one is
`HookItem | undefined`, and undefined means a bare hand or an action the world performed rather than
a player. Without it a block behavior cannot decide honeycomb waxing, axe scraping, silk touch,
shears, or which bucket filled a cauldron, because every one of those is a fact about the item and
not about the block.

`HookItem` is two members, an `identifier` and a `get(name)` component reader:

```typescript
const waxing = event.itemStack?.identifier === 'minecraft:honeycomb';
const silkTouch = event.itemStack?.get('minecraft:enchantments');
```

It is a structural interface here rather than a dependency on `@jsprismarine/items`, which is what
keeps the block half and the item half of the content runtime independent. `ItemStack` satisfies it
as written: its `identifier` getter and its `get(name): unknown` component reader are the same two
declarations, so a server passes a stack straight into a block event with no adapter, and neither
package imports the other. `hooks.test.ts` checks the assignment against a stand-in with those
declarations.

`BlockPlaceEvent` also carries `face` and `faceLocation`, the same pair `BlockPlayerInteractEvent`
has and the same pair Mojang's `PlayerPlaceBlockBeforeEvent` carries. `face` is the face of the
block the new one went against, which is what a pillar's `pillar_axis` comes from; the placer's look
direction is right only for a horizontal placement. `faceLocation` is a `FaceLocation`, each
component in [0, 1] measured from the face's lower north-west corner, which is what picks a slab's
half and a stair's `upside_down_bit`. `FaceLocation` is a separate type from `BlockPosition` because
its components are fractions of a block rather than world coordinates.

`behaviorFor(identifier, archetype?)` gives the family name. An archetype wins when the block's own
definition declares one, because Mojang already decided the family there; otherwise the identifier
picks a rule from `BLOCK_FAMILIES`. The two agree by construction: `slab_block` lands in
`jsprismarine:slab` and `stair_block` in `jsprismarine:stairs`. Over the palette the rules produce
48 families, the largest being `plain_block` 218, `inert` 203, `slab` 109, `stairs` 97,
`double_slab` 93 and `copper` 84. `vanilla_overlay/report.json` has the full tally.

## Flattening

`flattenBlockStates(resolved)` precomputes the columns the tick loop, the lighting engine and the
explosion code read, as one typed array per column indexed by the dense runtime id:

| Column | Array | Source |
| --- | --- | --- |
| `solid` | `Uint8Array` | `minecraft:collision_box`, absent means solid |
| `lightEmission` | `Uint8Array` | `minecraft:light_emission` |
| `lightFilter` | `Uint8Array` | `minecraft:light_dampening` |
| `blastResistance` | `Float32Array` | `minecraft:destructible_by_explosion` |
| `hardness` | `Float32Array` | `minecraft:destructible_by_mining` |
| `friction` | `Float32Array` | `jsprismarine:block_properties`, then `minecraft:friction` |
| `randomTick` | `Uint8Array` | `jsprismarine:block_properties`, or any behavior implementing `onRandomTick` |

An id with no value falls back to the column's default and then to a reviewed exception; an id with
neither fails the build, and so does an exception that matched nothing.

Two values Bedrock's grammar has no number for get a Java-sized one: `destructible_by_explosion:
false` stores 3600000, which is Java's own bedrock, and `destructible_by_mining: false` stores -1.

## The overlay pack

`vanilla_overlay/` is a real Bedrock behavior pack with a `manifest.json` and one
`blocks/<name>.block.json` per palette block. It is generated and committed, so a palette or
property-table bump is a reviewable diff rather than a silent change at load.

```
pnpm --filter @jsprismarine/blocks run generate:overlay
```

The script builds the package and then runs `utils/generate-overlay.mjs` over `dist/`. It is plain
JavaScript on purpose: a generator that imported `src/` would have to spell its specifiers the way
`node`'s resolver wants, and nothing under `src/` should be shaped by a build script. A dependent
package needs no `allowImportingTsExtensions` to typecheck against this one.

Each file carries the Bedrock-expressible properties as real Bedrock components, filled from
`bedrockBlockPropertiesOf` in `@jsprismarine/mapping`, plus `jsprismarine:behavior` and
`jsprismarine:block_properties`. Container blocks also carry `jsprismarine:container_open_sound`,
configured in `src/tables/containerOpenSounds.json`. The generator writes Prettier-shaped JSON so
the committed pack passes `prettier --check` with no second pass, and `src/overlay.test.ts` compares
the committed files to a fresh run so the two cannot drift.

Four blocks have a Java friction Mojang's component cannot hold, so `minecraft:friction` is clamped
to 0.9 and `jsprismarine:block_properties.friction` keeps the real value: blue ice 0.989, and ice,
packed ice and frosted ice at 0.98. `vanilla_overlay/report.json` lists them.

The 182 blocks on `@jsprismarine/mapping`'s Bedrock-only list get `BEDROCK_ONLY_FALLBACK` and
`source: "fallback"`, and every one of them appears in `vanilla_overlay/exceptions.json` with a
reason: 164 Education Edition chemistry blocks, 9 deprecated palette entries, 5 world-editing
blocks, 2 that are entities in Java Edition, and 2 engine-internal markers. The test asserts the
list is exactly those 182 and that no entry falls through to a generic reason.

## What is left

- **Solidity and collision shapes.** `@jsprismarine/mapping` publishes no solidity column and no
  per-state collision geometry, so the overlay writes `minecraft:collision_box: false` only for a
  reviewed list of 22 states nothing can stand in (air, the structure void, both portals, the moving
  block, the placeholder block and the 16 light blocks), listed with reasons in
  `vanilla_overlay/report.json`. Everything else is solid by default. The per-state `geometry`
  column of the CloudburstMC dump is the source that would fix this, and it belongs in the mapping
  package.
- **Trait state domains the palette does not carry.** `minecraft:sixteen_way_rotation`,
  `minecraft:corner_and_cardinal_direction` and `minecraft:multi_block_part` appear in no vanilla
  block, so a custom block enabling one is reported instead of resolved. `mojang-blocks.json` has
  their global domains and is not in the repository.
- **Loot, display names and menu categories.** The overlay writes none of them. Loot comes from
  Java's 1447 tables in a later phase, and the creative menu is written from the item registry.
