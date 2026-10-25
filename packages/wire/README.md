# @jsprismarine/wire

The content registries turned into the payloads a Bedrock client needs: the block definitions in
`StartGamePacket`, the item definitions in `ItemRegistryPacket`, the creative menu, and the recipe
lists in `CraftingDataPacket`.

It builds payloads. It does not send them, because the server owns the connection, and it does not
encode them, because `@jsprismarine/protocol` owns the wire format. What it owns is the translation
in between: which NBT key, which tag type, which of several lists, and which number.

```typescript
import { buildBlockProperties, buildCraftingData, buildCreativeContent, buildItemRegistry } from '@jsprismarine/wire';

const { properties } = buildBlockProperties(resolved.types.values());
const { entries } = buildItemRegistry(items.types.values(), { table: item_table });
const creative = buildCreativeContent(itemIdsOf(entries), { groups: creative_groups, entries: creativeitems });
const crafting = buildCraftingData(compiled.recipes, { items: itemIdsOf(entries) });
```

## What the reference is

Three of the four builders are written against a capture of a Bedrock Dedicated Server 1.26.51.1
rather than against documentation, because the documentation does not describe these payloads. The
protocol reference leaves a block definition untyped with the comment "Map of block states. { key
(component name):[label,value] } (Can be left empty.)", and the three third-party servers that build
one by hand all carry comments saying they do not know what parts of it mean.

The captures are in the repository already:

| Reference | Where | Covers |
| --- | --- | --- |
| 98 block definitions | `block_definitions` in `@jsprismarine/bedrock-data` | `buildBlockProperties` |
| 78 item component compounds | `item_components` in `@jsprismarine/bedrock-data` | `buildItemRegistry` |
| The item table | `item_table` in `@jsprismarine/bedrock-data` | item numbers, component flags, versions |
| 1065 block states with their `network_id` | the creative catalog's `block_states` | `blockRuntimeId` |

Measured against them, with the numbers the tests print:

- **Block properties.** All 2250 fields of all 98 data-driven vanilla blocks match, and all 98
  definitions are byte-for-byte identical to what the server sent. Run it with
  `JSP_VANILLA_BLOCKS=1`, which needs the cache
  `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates.
- **Item properties.** 326 of 341 `item_properties` values match over the 31 items both sides
  describe, excluding the seven keys no Java component decides. The 15 that differ are the six
  spears, whose Bedrock attack damage is one higher than Java's and whose `use_duration` the capture
  sets to 1440000, and the breeze rod, which Bedrock holds out in front and Java does not.
- **Runtime ids.** All 1065 captured `network_id` values are reproduced from the state compound.
- **Round trip.** All 98 captured definitions read and rewrite byte for byte.

## buildBlockProperties

One `{name, definition}` entry per block, with the definition as network NBT. The caller chooses
which blocks: from 1.26.50 every block Mojang defines in the vanilla behavior pack has to be
declared, and so does every block a pack adds, but a block the client already has built in does not.

A definition carries `components`, `menu_category`, `molangVersion` and `vanilla_block_data` always,
plus `blockTags`, `properties`, `permutations` and `traits` when the block has any. A permutation
whose components are all server-side is dropped rather than sent empty, which is what the captured
server does with the two permutations of `minecraft:shelf_mushroom` that only pick a loot table.

### The JSON to NBT component table

The network names are not the JSON names, and the differences do not follow a rule. `capture` means
the shape is read off the 98 captured definitions; `inferred` means no vanilla data-driven block
declares the component, so the shape comes from the research note's reading of Allay's and Geyser's
encoders.

| JSON component | NBT key and shape | Source |
| --- | --- | --- |
| `minecraft:tags: ["a"]` | top-level `blockTags: ["a"]`, a list of strings outside `components` | capture |
| `minecraft:destructible_by_mining: {seconds_to_destroy}` | `{value: float}` | capture |
| `minecraft:destruction_particles` | `{particle_count: int, texture: string, tint_method: string}`, all three always | capture |
| `minecraft:liquid_detection.detection_rules[]` | `detectionRules[]` of `{canContainLiquid: byte, liquidType, onLiquidTouches, stopsLiquidFromDirection: byte, use_liquid_clipping: byte}` | capture |
| `minecraft:redstone_conductivity` | `{allowsWireToStepDown: byte, redstoneConductor: byte}` | capture |
| `minecraft:collision_box: {origin, size}` | `{enabled: byte, boxes: [{minX..maxZ: float}]}`, in sixteenths with the horizontal origin shifted by 8 | capture |
| `minecraft:collision_box: false` | `{enabled: byte 0, boxes: []}` | capture |
| `minecraft:selection_box: {origin, size}` | `{enabled: byte, origin: [float], size: [float]}`, origin and size kept | capture |
| `minecraft:geometry: "id"` or `{identifier, culling}` | `{identifier, bone_visibility, culling, culling_layer, culling_shape, ignoreGeometryForIsSolid, isV1Fullblock, needsLegacyTopRotation, useBlockTypeLightAbsorption, uv_lock}` | capture |
| `minecraft:material_instances: {"<face>": {...}}` | `{mappings: {face: instance name}, materials: {name: {ambient_occlusion: float, packed_bools: byte, render_method, texture, tint_method}}}` | capture |
| `minecraft:connection_rule` | `{accepts_connections_from, enabled_directions: [string]}` | capture |
| `minecraft:precipitation_interactions` | `{precipitation_behavior}` | capture |
| `minecraft:support: {shape}` | `{shape}` | capture |
| `minecraft:replaceable: {}` | `{}` | capture |
| `minecraft:transformation: {rotation: [0,270,0]}` | `{RX, RY, RZ: int quarter turns, RXP..SZP, TX..TZ: float, hasJsonVersionBeforeValidation: byte}` | capture |
| `description.internal_vanilla_data` | `vanilla_block_data`, with `block_archetype: {<key>: {...}}` flattened to `{type: "<key>", ...}` | capture |
| `description.menu_category` | `{category, group, is_hidden_in_commands: byte}` | capture |
| `minecraft:light_emission: 9` | `{emission: byte}` | inferred |
| `minecraft:light_dampening: 3` | `{lightLevel: byte}` | inferred |
| `minecraft:friction: 0.5` | `{value: float}` | inferred |
| `minecraft:display_name: "A"` | `{value: string}` | inferred |
| `minecraft:placement_filter` | `{conditions: [{allowed_faces: byte mask, block_filter: [{name}]}]}` | inferred |
| `description.states` | `properties: [{name, enum: [byte or int or string]}]` | inferred |
| `description.traits` | `traits: [{name, enabled_states: {<state>: byte}, ...parameters}]` | inferred |
| `minecraft:destroy_time`, `minecraft:block_light_emission`, `minecraft:block_light_absorption` | their 1.19.40 successors above; the old light emission is a 0..1 fraction and is scaled by 15 | inferred |

Nineteen more components a vanilla block file declares never reach the client at all.
`BLOCK_SERVER_ONLY_COMPONENTS` lists them with a reason each, every one checked against the capture:
the block that declares it has no matching key in the NBT the server sent. A component in neither
table is reported in `untranslated` rather than dropped, so a pack's own component is visible instead
of silently missing.

### What is verified and what is not

Verified against the capture, field by field:

- `molangVersion` is **13**, not the 1 Geyser and Allay send or the 9 PowerNukkitX sends. 13 is
  `Latest` in the docs' `MolangVersion` enum and is what the captured server writes on all 98 blocks.
- `vanilla_block_data.material` is a real value - `solid`, `plant`, `solid_plant` - and is present on
  all 98. PowerNukkitX's comment that it writes `"dirt"` because "no one knows what it's for" is
  about a field that does have a meaning; Allay omits it and reports no trouble, so this package
  writes it only when the block's own `internal_vanilla_data` has one.
- `vanilla_block_data` also carries `block_archetype`, `can_dampen_vibrations`,
  `can_occlude_vibrations`, `requires_correct_tool_for_drops` and `translucency`, none of which the
  research note mentions and all of which come straight from `internal_vanilla_data`.
- Tags travel as a top-level `blockTags` list of strings. The `tag:<name>` empty compounds inside
  `components` that Geyser, Allay and PowerNukkitX all write appear nowhere in the capture. Both can
  be sent: `tagComponents: true` adds the compounds, and the list is written either way.

Inferred, with nothing in the capture to check against:

- `properties` and `traits`. `minecraft:shelf_mushroom` has a `growth` state and a
  `minecraft:placement_direction` trait, and the captured server declares neither - the client
  already has the states of a vanilla block in its own palette. A pack's block does need them, so
  both are written, in the shape the research note records. The trait's `enabled_states` is a
  compound of flags with the `minecraft:` prefix dropped, and a state in the `minecraft:` namespace
  is left out of `properties` because the trait already describes it.
- `packed_bools` bit 2. Bit 0 is face dimming and bit 1 is the isotropic flag; bit 2 is set in both
  of the capture's two material instances, and nothing in either block's JSON would turn it off.
  Allay names it texture variation and Geyser writes only bit 0 with a TODO beside it. It is written
  as set, which reproduces the capture's `packed_bools: 5`.
- `block_id` for a block that declares none. Allocated from 10000 upward, which is what Geyser and
  PowerNukkitX do; the highest vanilla id in the capture is 1489.
- Every `inferred` row of the table above.

Nobody has documented, and this package does not know:

- What `molangVersion` changes in the client's parse. Three implementations send three values and all
  three report working blocks.
- What the remaining five bits of `packed_bools` are.
- What `isV1Fullblock`, `needsLegacyTopRotation`, `ignoreGeometryForIsSolid` and
  `useBlockTypeLightAbsorption` do. All four are 0 on both captured geometries and are written as 0.
- Whether `enabled_states` really is a compound of flags, since no capture carries one.
- Whether the client reads the `tag:<name>` component form, the `blockTags` list, or both.

## buildItemRegistry

One entry per item: the name, the number, `Is Component Based`, `Item Version`, and the component
compound. The compound is a single `components` key holding `item_properties` plus the named
components, which is what the capture and all three third-party implementations agree on.

The component values come from `projectItemToBedrock` in `@jsprismarine/items`, which deliberately
leaves out anything Java cannot decide. This package supplies the rest:

- The seven keys `BEDROCK_ONLY_ITEM_PROPERTIES` names. `creative_group`, `frame_count`,
  `hidden_in_commands`, `liquid_clipped`, `should_despawn` and `stacked_by_data` take the value the
  capture shows on every item - note that `hidden_in_commands` is a byte holding **2**, not a flag.
  `creative_category` is per item and comes from the creative catalog through
  `creativeItemProperties`.
- The tag type of every value, which the projection has no way to express. Two are worth naming:
  `minecraft:max_stack_size.value` is a **byte** while `item_properties.max_stack_size` is an int,
  and `minecraft:use_modifiers.use_duration` is seconds as a float while
  `item_properties.use_duration` is ticks as an int.
- `minecraft:icon`, present with an empty `textures` compound. The texture name is a resource pack
  fact, so guessing one would only replace a missing icon with a wrong one.

An item the captured table does not name is treated as one this server invented: component based,
`Item Version` `DataDriven`, and an id allocated from 10000. Those are listed in `allocated`.

Entries come out sorted by identifier, so the array is a pure function of the registry's contents.
By default only the items the table marks component based carry a compound, which is what the
captured server does; `components: 'all'` sends the projection for every item.

### Seven names the pack and the capture disagree on

Mojang's vanilla behavior pack still files seven items under the identifiers Bedrock used before it
flattened them: `minecraft:appleEnchanted`, `minecraft:clownfish`, `minecraft:cooked_fish`,
`minecraft:fish`, `minecraft:melon`, `minecraft:muttonCooked` and `minecraft:muttonRaw`. A Bedrock
Dedicated Server renames each to `minecraft:enchanted_golden_apple`, `minecraft:tropical_fish`,
`minecraft:cooked_cod`, `minecraft:cod`, `minecraft:melon_slice`, `minecraft:cooked_mutton` and
`minecraft:mutton` before it writes the table, and this package does not: it takes the identifier it
is given, finds no row, and allocates an id.

A caller that builds from the vanilla stack therefore sends seven entries a client cannot draw. All
seven modern names are in the registry too, from Java's side of the item set, so nothing a player
can be handed is missing. Renaming them belongs wherever the pack's identifiers are resolved, not
here, because this package's contract is that the identifier it is given is the identifier it
sends.

## buildCreativeContent

The headings and the entries, built from a catalog in the shape `@jsprismarine/bedrock-data`
publishes, so `creative_groups` and `creativeitems` pass straight through. An entry whose item the
item registry cannot resolve is dropped and named in `unknown`, because the client resolves a
creative entry through that registry and an unresolvable entry is at best a blank slot.

Two orders are load-bearing and neither is this package's to choose: a group is referred to by its
index into the list, and a creative pick comes back as the entry's one-based network id.

The category enum differs between the two sides. The catalog writes `construction`, `nature`,
`equipment`, `items` and `none`; the wire numbers them 1 through 5 with `ItemCommandOnly` where the
catalog says `none`. `creativeCategoryOf` is that translation.

## buildCraftingData

At protocol 2193 `CraftingDataPacket` is eleven arrays and a flag, and a recipe's type is the array
it sits in. The builder returns one named list per array it can fill, and reports everything else.

| Java serializer | Where it goes |
| --- | --- |
| `crafting_shaped` | `shaped` |
| `crafting_shapeless` | `shapeless` |
| `stonecutting` | `shapeless`, with the station `stonecutter`, which is how the vanilla Bedrock pack writes its own 354 |
| `smithing_transform` | `smithingTransform` |
| `smithing_trim` | `smithingTrim` |
| `brewing` | `potionMixes`, which carries numeric item ids rather than names |
| `smelting`, `blasting`, `smoking`, `campfire_cooking` | `furnace`, one entry per station tag |
| the twelve in `RECIPES_WITHOUT_A_BEDROCK_FORM` | `omitted`, with a reason each |

The twelve with no form are Bedrock multi recipes: a bare UUID plus a network id, with the behavior
compiled into the client and the UUID matched against a list it already has. Reproducing one means
knowing that UUID, and no capture of `CraftingDataPacket` is in this repository to read it from. A
made-up UUID would be a recipe the client silently ignores, so they are reported instead.

`furnace` is produced and cannot be sent at protocol 2193: the format has no list for a cooking
recipe, because smelting became client-side data. The server still smelts with its own recipes.

Network ids come from `@jsprismarine/recipes`, which sorts by namespace and then path and numbers
from 1 because Bedrock reserves 0 for "no recipe". Nothing here renumbers them.

Two facts the wire wants and Java does not have are injected rather than guessed. `priority`, which
decides which of two matching recipes wins, is 0 unless `priorityOf` says otherwise. `symmetric`,
which lets the client match a shaped pattern mirrored, is false by default: Java's own matcher does
try the mirror, but no vanilla Bedrock recipe file carries the field and its exact effect is
unverified.

An ingredient is the other lossy edge. A compiled ingredient accepts a set of items, because a Java
tag expands into one, and a wire slot has room for a single item or a single Bedrock item tag. A
caller that can name a tag covering the set passes `bedrockTagFor` and keeps it; otherwise the slot
is narrowed to the first item and the loss is reported in `widened`.

## The palette check

`StartGamePacket.BlockNetworkIds Are Hashes` is true on this server, so a block state's runtime id is
the FNV-1a 32 hash of its own `{name, states}` compound written as fixed-width little endian NBT with
the states sorted. That is what makes a data-driven block registry possible at all: neither side
needs the other's ordering, and adding a block renumbers nothing. The alternative, an index into a
palette both sides sort by the FNV-1 64 hash of the block name, renumbers every vanilla block the
moment a pack adds one.

`@jsprismarine/protocol` owns that hash, since the chunk and inventory encoders need it too.
`fnv1a32`, `blockStateCompound`, `writeBlockStateNbt`, `blockRuntimeId`, `UNKNOWN_BLOCK_NAME` and
`UNKNOWN_RUNTIME_ID` are re-exported here so a caller building block payloads has them in one import.

One subtlety decides whether the hash is right: a flag is a byte and a number is an int, and the two
hash differently. A state has to arrive as a boolean to be written as a byte, which is the shape
`BlockStateModel` normalizes to, and which is why `readCapturedBlockState` turns a captured byte back
into a boolean.

`verifyBlockRuntimeIds` recomputes a captured `network_id` and reports the ones that disagree; all
1065 in the creative catalog agree. `assertBlockPaletteAgrees` throws `BlockPaletteError`, listing
every disagreement, when a generated definition names a vanilla block the captured palette does not
have or declares a state the palette disagrees with. It is a build-time guard on purpose: a client
told about a block registry that disagrees with its own does not complain, it draws the wrong block.

## What is left

- **The creative and crafting payloads have no packet to match.** `CreativeContentPacket` and
  `CraftingDataPacket` live in `@jsprismarine/prismarine` and take the server's own `Item` and
  `Recipe` classes, so the shapes here are named after the wire's fields and a caller adapts. Moving
  those two packets into `@jsprismarine/protocol` would let this package be checked against them the
  way the other two are.
- **Item tags.** `item_tags` is written present and empty, because Bedrock item tags are their own
  registry and `@jsprismarine/items` will not translate a Java tag into one.

## Tests

```sh
pnpm --filter @jsprismarine/wire exec vitest run
```

One file is gated. `blockProperties.vanilla.test.ts` generates all 98 definitions from Mojang's own
block files and compares them to the capture, which needs the `bedrock-samples` checkout that
`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` puts in the cache:

```sh
JSP_VANILLA_BLOCKS=1 pnpm --filter @jsprismarine/wire exec vitest run
```
