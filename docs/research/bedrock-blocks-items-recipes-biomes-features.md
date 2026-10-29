# Bedrock behavior pack formats: blocks, items, recipes, item catalog, biomes, features, structures, shapes

Researched 2026-10-24 against the extracted BDS 1.26.51.1 zip (the 56 vanilla layers composed in version order, plus the server-root `definitions/`), Mojang/bedrock-samples release `v1.26.50.4` "min" asset (sha256 `2bb66778...6b07c2`, `behavior_pack/` and `metadata/`), MicrosoftDocs/minecraft-creator at commit `4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8`, and this repository's `packages/bedrock-data/src/resources/` submodule at `dee8f65b` (2026-10-20). It continues [bedrock-data-extraction.md](bedrock-data-extraction.md) and does not repeat it. Counts come from scripts under `/tmp/bds-research-blocks/tools/` (section "Reproduction"). The doc URL prefix `docs:` below means `https://learn.microsoft.com/en-us/minecraft/creator/reference/content/`.

## Summary

- The block grammar is `format_version`, `minecraft:block.description` (`identifier`, `menu_category`, `states`, `traits`), `components` and `permutations`. Mojang's schema (`block/1.26.20/Components.json`) and the docs agree on 39 public components plus 6 internal ones. Vanilla's 98 block files use 20 of them, no `states`, no `traits`, and only `shelf_mushroom` has `permutations`. Each file carries an undocumented `internal_vanilla_data` with `block_id` (equal to `raw_id` in `mojang-blocks.json`), `material`, and a `block_archetype` (`slab_block` 64, `stair_block` 32, `bush_block` 1, `wall_foliage_block` 1) that selects engine code.
- No Mojang file gives hardness, blast resistance, friction, light, flammability, tint or collision for the other 1365 blocks. The CloudburstMC dump in the submodule does, per state (22091 rows, 1477 names, 19 fields), and its values vary across a block's states only for `geometry` (542 names), `lightEmission` (51), `mapColor` (9) and `lightDampening` (1).
- `mojang-blocks.json` lists 157 state properties (57 bool, 41 int, 59 string) with global domains and 1463 blocks with their property names. Its property sets equal the captured palette's for all 1463 blocks; the palette has 14 more technical blocks. 33 block-property pairs use a subset of the global domain, which is why the per-block capture is still needed. The captured network palette is 22079 states; the dump has 22091.
- Items: 44 documented components. Vanilla's 79 item files use 34 keys: 28 documented components and 6 legacy 1.10 keys outside the current schema (`use_duration`, `seed`, `max_damage`, `foil`, `block`, `camera`), plus `food.effects`. Of the 1623 items in `mojang-items.json`, 982 are block items and 79 have JSON. For the remaining families the documented grammar expresses tools, armor, bows, crossbows, throwables, spawn eggs, boats, minecarts, records, dyeable armor, foods and bundles in full or nearly so; buckets, compasses, clocks, maps, fishing rods, shears on mobs, flint and steel, fire charges, the eye of ender locate, potion effects, shields, elytra flight, totems, tridents, maces, goat horns, brushes, books, banners, dyes, leads, name tags and saddles have no component and need engine behavior.
- Recipes: 1892 files in 7 types (`recipe_shaped` 1064, `recipe_shapeless` 591, `recipe_furnace` 152, `recipe_brewing_mix` 70, `recipe_smithing_transform` 12, `recipe_brewing_container` 2, `recipe_smithing_trim` 1). Station tags: `crafting_table` 1281, `stonecutter` 356, `brewing_stand` 72, `furnace` 134 (62 of them also `blast_furnace`, 9 also `smoker`, `campfire`, `soul_campfire`), `smithing_table` 13, `cartography_table` 2, `deprecated` 34. Ingredients are `{item}`, `{item,data}`, `{tag}`, bare strings or `name:meta` strings; 16 item tags are used; no Molang. `assume_symmetry` is documented and unused.
- The crafting item catalog is 4 categories, 84 named groups and loose groups; its MCB in BDS holds the same group names as the captured creative menu (124 groups, 88 named, 1980 entries), which adds `banner`, `enchantedBook`, `firework`, `fireworkStars` groups the engine fills from data elsewhere.
- Biomes: 15 documented components, 14 used. Surface builder types in vanilla: `overworld` 73, `mesa` 6, `swamp` 3, `capped` 2, `frozen_ocean` 2, `noise_gradient` 1 (sulfur caves), `the_end` 1; `legacy_frozen_ocean` has none. 98 distinct biome tags; feature rules filter on 52 of them, spawn rules on 39, jigsaw structures on `has_structure_*`, `forest`, `oak_forest`.
- Features: 25 documented types, 19 used by the pack's 210 files and 12 by the root's 139. Vanilla feature rules and features reference 87 feature identifiers that have no JSON at all (`minecraft:legacy:*` trees and flowers, `kelp_feature`, `reeds_feature`, `dead_bush_feature`, `cactus_feature`, `coral_*`, `huge_mushroom_feature`, `ice_spike_feature`, `delta_feature`, `basalt_columns_feature` and others); the engine defines them in code. Placement passes in order: `pregeneration`, `first`, `before_underground`, `underground`, `after_underground`, `before_surface`, `surface`, `after_surface`. Molang used: `query.heightmap`, `query.noise`, `query.above_top_solid`, `query.any_tag`, `query.has_biome_tag`, `query.block_state`, `variable.worldx/worldz/originx/originz/is_legacy`, `math.ceil/trunc/clamp/max/random`.
- Structures: the 1285 `.nbt` templates are Java Edition structure NBT (gzip, big endian, `size`, `palette` with Java `Name`/`Properties`, `blocks`, `entities`, `DataVersion` 813 to 5009 or `version: 1`), with 458 distinct Java block names and 73 Java property keys; the 15 `.mcstructure` files are Bedrock's little-endian format with Bedrock states. Only trail ruins and the 18 abandoned camps have jigsaw JSON; 23 of the 25 structure types in `mojang-features.json` are engine code, 16 of them with templates in the zip.
- A component runtime that mirrors Bedrock needs about 25 block components and 30 item components for the data the files carry, plus named behaviors for what no component expresses: roughly 60 block behavior families covering the 1463 blocks (section 9) and roughly 30 item behavior families.

## 1. Block definition grammar

### Document shape

Docs (`docs:blockreference/examples/blockjsonfilestructure`, `.../blockdescription`) and the schema `metadata/json_schemas/server/block/1.26.20/Blocks.json` agree:

```
{ "format_version": "1.26.50",
  "minecraft:block": {
    "description": { "identifier", "menu_category": { "category", "group", "is_hidden_in_commands" }, "states", "traits" },
    "components": { ... },
    "permutations": [ { "condition": "<Molang>", "components": { ... } } ] } }
```

- `identifier`: namespaced; the schema's description says it "can't use the minecraft one" while the docs allow it "unless overriding a Vanilla block". Vanilla's own files use `minecraft:`.
- `menu_category.category` is one of `construction`, `nature`, `equipment`, `items`, `none` (`common/1.26.20/CreativeItemCategory.json`); `group` is a namespaced loc key such as `minecraft:itemGroup.name.stairs`; `is_hidden_in_commands` defaults false.
- `states`: map of state name to an array of values (bool, int, string) or `{"values": {"min", "max"}}`. The docs cap all permutations of all blocks in a world at 65536.
- `traits` (`Traits.json`): `minecraft:placement_direction` with `enabled_states` from {`minecraft:cardinal_direction`, `minecraft:corner_and_cardinal_direction`, `minecraft:facing_direction`, `minecraft:sixteen_way_rotation`}, `y_rotation_offset` (0, 90, 180, 270) and `blocks_to_corner_with`; `minecraft:placement_position` with {`minecraft:block_face`, `minecraft:vertical_half`}; `minecraft:connection` with {`minecraft:cardinal_connections`} (yields `minecraft:connection_north/south/east/west`, 1.21.130, experimental); `minecraft:multi_block` with {`minecraft:multi_block_part`}. The trait states are the same `minecraft:`-prefixed properties that appear in `mojang-blocks.json` (section 2).
- `permutations[].condition` is a Molang expression limited to `query.block_state('name')` per the docs. `Permutation.json` forbids these components inside a permutation: `redstone_consumer`, `block_entity`, `support`, `embedded_visual`, `flower_pottable`, `item_visual`, `breathability`, `unit_cube` and the legacy `on_*`/ticking event components. `Blocks.json` forbids the legacy event components (`on_interact`, `on_fall_on`, `on_placed`, `on_player_destroyed`, `on_player_placing`, `on_step_off`, `on_step_on`, `queued_ticking`, `random_ticking`) everywhere; script custom components replaced them.

### Components

The component list (`docs:blockreference/examples/blockcomponents/blockcomponentslist`, ms.date 02/11/2025) and the 1.26.20 schema give 39 public components and 6 internal or deprecated ones. Parameters from the per-component docs and schema:

| Component | Parameters | Notes |
|---|---|---|
| `minecraft:block_entity` | `container.slot_count` 1..54, `dynamic_properties` | cannot combine with `crafting_table` |
| `minecraft:chest_obstruction` | `obstruction_rule`: `always`, `never`, `shape` | |
| `minecraft:collision_box` | `true`/`false`, or `{origin, size}`, or up to 16 boxes; origin in (-8,0,-8)..(8,24,8) | |
| `minecraft:connection_rule` | `accepts_connections_from`: `all`, `none`, `only_fences`; `enabled_directions` | fences, walls, bars, panes connect to it |
| `minecraft:crafting_table` | `crafting_tags` (max 64), `table_name` | |
| `minecraft:destructible_by_explosion` | `explosion_resistance` or bool | |
| `minecraft:destructible_by_mining` | `seconds_to_destroy` (negative means unbreakable), `item_specific_speeds[] {item descriptor, destroy_speed}` | |
| `minecraft:destruction_particles` | `texture`, `tint_method` (`none`, `default_foliage`, `birch_foliage`, `evergreen_foliage`, `dry_foliage`, `grass`, `water`), `particle_count` 0..255 | |
| `minecraft:display_name` | loc key | |
| `minecraft:embedded_visual` | `geometry`, `material_instances` | render inside a flower pot |
| `minecraft:entity_fall_on` | `min_fall_distance` | fires the script `onEntityFallOn` event |
| `minecraft:flammable` | `catch_chance_modifier`, `destroy_chance_modifier`, `lava_flammable` | |
| `minecraft:flower_pottable` | none | |
| `minecraft:friction` | 0.0..0.9 | |
| `minecraft:geometry` | `identifier`, `bone_visibility`, `culling`, `culling_layer`, `culling_shape` (voxel shape id, experimental), `uv_lock`, `n_way_visual_rotation` | |
| `minecraft:instrument_sound` | `up`, `down` from 17 `note.*` values | |
| `minecraft:item_visual` | `geometry`, `material_instances` | |
| `minecraft:light_dampening` | 0..15 | |
| `minecraft:light_emission` | 0..15 | |
| `minecraft:liquid_detection` | `detection_rules[] {liquid_type: water, can_contain_liquid, on_liquid_touches: blocking/broken/no_reaction/popped, stops_liquid_flowing_from_direction, use_liquid_clipping}` | one rule per liquid |
| `minecraft:loot` | loot table path | |
| `minecraft:map_color` | `#RRGGBB` or `{color, tint_method}` | |
| `minecraft:material_instances` | face or `*` to `{texture, render_method, ambient_occlusion, face_dimming, isotropic, tint_method}` | |
| `minecraft:movable` | `movement_type`: `push_pull`, `push`, `popped`, `immovable`; `sticky`: `none`, `same` | |
| `minecraft:placement_filter` | `conditions[] {allowed_faces, block_filter[]}` | |
| `minecraft:precipitation_interactions` | `precipitation_behavior`: `none`, `obstruct_rain`, `obstruct_rain_accumulate_snow`, `snowlogging` | snowlogging requires collision disabled |
| `minecraft:random_offset` | `x/y/z {range {min,max}, steps}` | visual |
| `minecraft:redstone_conductivity` | `redstone_conductor`, `allows_wire_to_step_down` | |
| `minecraft:redstone_consumer` | `min_power`, `propagates_power` | sends `onRedstoneUpdate` to script; not allowed in permutations |
| `minecraft:redstone_producer` | `power` 0..15, `connected_faces`, `strongly_powered_face`, `transform_relative` | |
| `minecraft:replaceable` | none | |
| `minecraft:selection_box` | bool or `{origin, size}` within (-8,0,-8)..(8,16,8) | |
| `minecraft:support` | `shape`: `fence`, `stair` | support shape for attached blocks; custom stairs need the placement traits |
| `minecraft:tick` | `interval_range [min,max]`, `looping` | fires the script `onTick` |
| `minecraft:transformation` | `rotation` (90 degree steps), `rotation_pivot`, `scale`, `scale_pivot`, `translation` | |
| `minecraft:tags` | array of strings | docs page `minecraftBlock_tag`; vanilla writes `minecraft:tags` |
| legacy: `block_light_absorption`, `block_light_emission`, `destroy_time`, `explosion_resistance` | format_version < 1.19.40 | |
| internal: `bone_visibility`, `breathability`, `custom_components`, `queued_ticking`, `random_ticking`, `unit_cube` | | |

Script custom components (`minecraft:custom_components` lists names bound by `@minecraft/server`) receive these events per `ScriptAPI/minecraft/server/BlockCustomComponent.md`: `beforeOnPlayerPlace`, `onBlockStateChange`, `onBreak`, `onEntity`, `onEntityFallOn`, `onNamedTick`, `onNeighborChanged`, `onPlace`, `onPlayerBreak`, `onPlayerInteract`, `onRandomTick`, `onRedstoneUpdate`, `onStepOff`, `onStepOn`, `onTick`. That list is the full extent of behavior a data pack can attach to a block without the engine.

The docs list 43 vanilla block tags (`docs:blockreference/examples/vanillablocktags`): `acacia birch dark_oak diamond_pick_diggable dirt fertilize_area grass gravel gold_pick_diggable iron_pick_diggable jungle log metal minecraft:crop minecraft:diamond_tier_destructible minecraft:iron_tier_destructible minecraft:is_hatchet_item_destructible minecraft:is_hoe_item_destructible minecraft:is_item_tier_destructible minecraft:is_mace_item_destructible minecraft:is_pickaxe_item_destructible minecraft:is_shears_item_destructible minecraft:is_shovel_item_destructible minecraft:is_sword_item_destructible minecraft:netherite_tier_destructible minecraft:stone_tier_destructible mob_spawner not_feature_replaceable oak one_way_collidable plant pumpkin rail sand snow spruce stone stone_pick_diggable text_sign trapdoors water wood wood_pick_diggable`.

### What the 98 vanilla block files use

All 98 are `format_version 1.26.50` (`blocks/*.block.json`, plus `shelf_mushroom_block.json`). Description keys: `identifier` 98, `internal_vanilla_data` 98, `menu_category` 98 (`construction` 64, `none` 32 for the double slabs with `is_hidden_in_commands: true`, `nature` 2). None declares `states` or `traits`; the stairs carry `minecraft:corner`, `upside_down_bit` and `weirdo_direction` on the wire (section 2) without declaring them, so the archetype supplies the states.

`internal_vanilla_data` (undocumented anywhere in minecraft-creator; grep confirms): `block_id` 98 (1403..1501, equal to `raw_id` in `mojang-blocks.json`), `material` 98 (`solid` 96, `plant` 1, `solid_plant` 1), `block_archetype` 98, `can_dampen_vibrations` 48, `can_occlude_vibrations` 48 (the wool variants), `requires_correct_tool_for_drops` 48 (the concrete variants), `translucency` 32 (0.8, wool slabs and stairs). Archetypes and their parameters:

| Archetype | Files | Parameters |
|---|---|---|
| `slab_block` | 64 | `double_slab_block`, `is_double` |
| `stair_block` | 32 | `base_block` |
| `bush_block` | 1 (`red_shrub`) | `{}` |
| `wall_foliage_block` | 1 (`shelf_mushroom`) | `size_count: 2`, `is_bonemealable`, `bounciness: 0.75`, `fall_damage_multiplier: 0.5` |

Component tally across the 98: `destructible_by_explosion` 98, `destructible_by_mining` 98, `loot` 98, `map_color` 98, `redstone_conductivity` 96, `tags` 96 (`minecraft:is_pickaxe_item_destructible` 48, `minecraft:is_shears_item_destructible` 48), `destruction_particles` 66, `liquid_detection` 66, `flammable` 49, `instrument_sound` 48 (`up: note.bassattack`), `chest_obstruction` 32, `support` 32 (`stair`), `collision_box` 2, `connection_rule` 2, `geometry` 2, `material_instances` 2, `movable` 2, `precipitation_interactions` 2, `selection_box` 2, `replaceable` 1. `shelf_mushroom` has 8 permutations on `query.block_state('growth')` and `query.block_state('minecraft:cardinal_direction')` that swap `loot`, `collision_box`, `selection_box`, `geometry`, `material_instances` and `transformation`; it is the only vanilla use of `query.block_state` (16 occurrences). `red_shrub` sets `collision_box: false`, `replaceable`, `precipitation_behavior: snowlogging`, `movable: popped`, `geometry: minecraft:geometry.cross`.

### The CloudburstMC per-state dump

`packages/bedrock-data/src/resources/blocks.json` (submodule commit `dee8f65b`, "Restructure block geometry data and include native position samples", 2026-10-20): an array of 22091 rows, 1477 distinct `name`s, every row with the same 19 fields: `name`, `blockStateHash`, `translationKey`, `isSolid`, `hardness`, `explosionResistance`, `friction`, `thickness`, `requiresCorrectToolForDrops`, `translucency`, `mapColor`, `tintMethod`, `lightEmission`, `lightDampening`, `burnOdds`, `flameOdds`, `canContainLiquidSource`, `liquidReactionOnTouch`, `geometry`. Example rows (one state each):

| Block | hardness | resist. | friction | solid | light out/damp | burn/flame | liquid reaction | collision | other |
|---|---|---|---|---|---|---|---|---|---|
| `stone` | 1.5 | 6 | 0.6 | true | 0 / 15 | 0 / 0 | BLOCKING | `[[0,0,0,1,1,1]]` | `requiresCorrectToolForDrops: true`, `mapColor #707070ff` |
| `water` (16 states) | 100 | 100 | 0.6 | false | 0 / 1 | 0 / 0 | NOREACTION | `[]` | `tintMethod Water`, `translucency 1` |
| `oak_leaves` (4) | 0.2 | 0.2 | 0.6 | false | 0 / 1 | 60 / 30 | BLOCKING | unit cube | `tintMethod DefaultFoliage`, `canContainLiquidSource true` |
| `redstone_wire` (16) | 0 | 0 | 0.6 | false | 0 / 0 | 0 / 0 | POPPED | `[]` | `thickness 0.07`, `tintMethod RedStoneWire`, outline `[0,0,0,1,0.0625,1]` |
| `oak_stairs` (40) | 2 | 3 | 0.6 | false | 0 / 0 | 20 / 5 | BLOCKING | two boxes, differs per state | `liquidClip [0,0.5,0,0.5,1,1]` |

`minecraft:oak_door` has no rows because the dump, like the palette, names it `minecraft:wooden_door`. `geometry` is `{collision: {space, boxes[]}, outline: {space, box}, visual, ui, liquidClip}`; `space` is `sampled` for 22059 rows and `model_base` for 32. Collision box count per state: 0 boxes 4893 states, 1 box 12751 (1762 of them the unit cube), 2 boxes 2853, 3 boxes 1552, 5 boxes 30, 7 boxes 12. `liquidReactionOnTouch`: BLOCKING 20543, POPPED 856, NOREACTION 653, BROKEN 39. `tintMethod`: None 21847, Stem 96, DefaultFoliage 36, DryFoliage 32, Water 32, Grass 24, RedStoneWire 16, BirchFoliage 4, EvergreenFoliage 4. Across a block's states the value changes only for `geometry` (542 names), `lightEmission` (51), `mapColor` (9), `lightDampening` (1); hardness, resistance, friction, flammability and tool requirement are constant per name.

### `mojang-blocks.json`

1463 `data_items`, each `{name, properties: [{name}], raw_id, serialization_id}`, plus 157 `block_properties`. It carries no physical property. `raw_id` runs 0..1501 without duplicates and equals the submodule's `legacy_block_ids.json` for 1237 of its 1253 names. `serialization_id` is the legacy translation key (`minecraft:acacia_double_slab` to `tile.double_wooden_slab.acacia`, `minecraft:oak_stairs` to `tile.oak_stairs`), which matches `translationKey` in the dump.

### Which block properties come from where

| Property | 98 JSON blocks | All 1477 blocks | Only as engine behavior |
|---|---|---|---|
| state names | wire capture (JSON declares none) | `mojang-blocks.json` and the capture agree | |
| state values per block | capture `domains` | capture (`mojang-blocks` gives global domains only) | |
| mining time, tool tags | `destructible_by_mining`, `tags`, `internal_vanilla_data.requires_correct_tool_for_drops` | dump `hardness`, `requiresCorrectToolForDrops`; tool tier only by block tags that no file lists | item-to-block speed table |
| explosion resistance | `destructible_by_explosion` | dump | |
| friction | default | dump | |
| light emission, dampening | default | dump, per state | |
| flammability | `flammable` (49) | dump `burnOdds`, `flameOdds` | fire spread algorithm |
| map color, tint | `map_color` | dump `mapColor`, `tintMethod` | |
| collision, selection | `collision_box`, `selection_box` (2 files) or archetype | dump `geometry` per state | |
| waterlogging | `liquid_detection` | dump `canContainLiquidSource`, `liquidReactionOnTouch` | |
| drops | `loot` (99 tables in `loot_tables/blocks/`) | none | every other block's drops |
| redstone conductivity | `redstone_conductivity` | none | |
| piston behavior | `movable` (2) | none | |
| translucency, vibration | `internal_vanilla_data` | dump `translucency` | |
| placement, growth, interaction, ticking | archetype | none | all of it |

## 2. Block states and the palette

`block_properties` in `mojang-blocks.json` has 157 entries, `{name, type, values: [{value}]}`: 57 `bool`, 41 `int`, 59 `string`. The largest domains are `books_stored` 0..63 (64), `multi_face_direction_bits` 0..63 (64), `growing_plant_age` and `kelp_age` 0..25 (26), `age`, `block_light_level`, `ground_sign_direction`, `huge_mushroom_bits`, `liquid_depth`, `redstone_signal`, `minecraft:sixteen_way_rotation` (16), `color` (16 strings), `orientation` (12), `flower_type` (11), `rail_direction` (10). The `minecraft:`-prefixed properties are the trait states: `minecraft:block_face` (6), `minecraft:cardinal_direction` (4), `minecraft:connection_{north,south,east,west,up,down}` (bool), `minecraft:corner` (5), `minecraft:facing_direction` (6), `minecraft:multi_block_part` (4), `minecraft:sixteen_way_rotation` (16), `minecraft:vertical_half` (2). The docs duplicate this list with descriptions at `docs:blockreference/examples/blockstateandtraitlistings` and `.../intrinsicblockstateslist`.

Per-block subsets. Each `data_items` entry lists property names only; the value domain is global. The captured palette (`packages/minecraft/datagen/snapshot/v2193/block-palette.json`, 1.26.51) asks the game per block and finds 33 block-property pairs whose domain is a strict subset of the global one, for example `cocoa.age` 3 of 16, `chorus_flower.age` 6 of 16, `activator_rail.rail_direction` 6 of 10, `chest.facing_direction` 4 of 6, `acacia_sapling.sapling_type` 6 of 7, `chiseled_stone_bricks.stone_brick_type` 4 of 5. Those 33 are the only reason the capture beats `mojang-blocks.json` for state enumeration.

Blocks by property count in `mojang-blocks.json`: 0 properties 551, 1 property 516, 2 properties 110, 3 properties 159, 4 properties 92, 5 properties 34, 8 properties 1. The palette uses 152 of the 157 property names; `minecraft:connection_down`, `minecraft:connection_up`, `minecraft:multi_block_part`, `minecraft:sixteen_way_rotation` and `no_drop_bit` appear in no vanilla block.

Name comparison. The palette has 1477 names, `mojang-blocks.json` 1463. All 1463 are in the palette with identical property sets. The 14 palette-only names are `chalkboard`, `client_request_placeholder_block`, `deprecated_anvil`, `deprecated_purpur_block_1`, `deprecated_purpur_block_2`, `end_gateway`, `glowingobsidian`, `info_update`, `info_update2`, `invisible_bedrock`, `moving_block`, `netherreactor`, `reserved6`, `stonecutter` (the legacy block, distinct from `stonecutter_block`). The CloudburstMC dump has the same 1477 names.

State totals. `generate-blocks.js` multiplies, per block, the domain sizes of the properties the saved world carries and reports 22079 states for 1477 blocks (`block-schemas.ts` header). The dump has 22091 rows. The 17487 figure in `README-palette.md` predates the 1.26.50 connection states and the 98 new blocks. A naive product over everything the Script API reports (its `domains` include legacy flattened properties such as `wall_block_type` on each wall and `wood_type` on each fence) gives 68972, which is the over-count the README warns about. The runtime id is FNV-1a 32 (`0x811c9dc5`, prime `0x01000193`) over the little-endian NBT compound `{name, states}` with states sorted (`packages/prismarine/src/block/state/BlockRuntimeIds.ts`); the capture's `states` entries are those compounds, so hashing them reproduces the network palette without a palette file.

## 3. Item definition grammar and inventory

### Document shape

`metadata/json_schemas/server/item/1.26.30/ItemDocument.json`: `minecraft:item` with required `description` (`identifier`; `menu_category {category: construction|nature|equipment|items|none, group (namespaced, max 256), is_hidden_in_commands}`) and required `components` with at least one key. `Item Components.json` lists 44 components; the docs list the same 44 at `docs:itemreference/examples/itemcomponentlist` plus five internal ones (`chargeable`, `custom_components`, `render_offsets`, `use_duration`, `weapon`). Script item custom components receive `onBeforeDurabilityDamage`, `onCompleteUse`, `onConsume`, `onHitEntity`, `onMineBlock`, `onUse`, `onUseOn`.

| Component | Parameterizes |
|---|---|
| `allow_off_hand` | bool |
| `block_placer` | `block`, `use_on[]` block descriptors, `replace_block_item`, `aligned_placement` |
| `bundle_interaction` | `num_viewable_slots` 1..64 |
| `can_destroy_in_creative` | bool |
| `compostable` | `composting_chance` 1..100 |
| `cooldown` | `category`, `duration` seconds, `type`: `use` or `attack` (1.21.130) |
| `damage` | integer added to attack damage |
| `damage_absorption` | `absorbable_causes[]`; needs an armor slot and `durability` |
| `digger` | `destroy_speeds[] {block or tag query, speed}`, `use_efficiency` |
| `display_name` | loc key |
| `durability` | `max_durability`, `damage_chance {min,max}` |
| `durability_sensor` | `durability_thresholds[] {durability, particle_type, sound_event}` |
| `dyeable` | `default_color` |
| `enchantable` | `slot` from `none all g_armor armor_head armor_torso armor_feet armor_legs sword bow spear crossbow melee_spear g_tool hoe shears flintsteel shield g_digging axe pickaxe shovel fishing_rod carrot_stick elytra cosmetic_head`, `value` |
| `entity_placer` | `entity`, `use_on[]`, `dispense_on[]` |
| `fire_resistant` | bool |
| `food` | `nutrition`, `saturation_modifier` (float; 1.10 files use `poor`/`low`/`normal`/`good`/`supernatural`), `can_always_eat`, `using_converts_to`; `remove_effects` deprecated; `effects` and `on_use_action` are not in the schema |
| `fuel` | `duration` seconds |
| `glint` | bool |
| `hand_equipped` | bool |
| `hover_text_color` | color name |
| `icon` | `textures {default, ...}` |
| `interact_button` | bool or label |
| `kinetic_weapon` | `reach`, `creative_reach`, `delay`, `damage_multiplier`, `damage_modifier`, `hitbox_margin`, `damage_conditions`, `knockback_conditions`, `dismount_conditions` (each `min_speed`, `min_relative_speed`, `max_duration`) |
| `liquid_clipped` | bool (raycast hits liquid) |
| `max_stack_size` | 1..64 |
| `piercing_weapon` | `reach`, `creative_reach`, `hitbox_margin` |
| `projectile` | `projectile_entity`, `minimum_critical_power` |
| `rarity` | `common`, `uncommon`, `rare`, `epic` |
| `record` | `sound_event`, `duration`, `comparator_signal` 1..13 |
| `repairable` | `repair_items[] {items[], repair_amount}`; `repair_amount` may be Molang (`query.max_durability * 0.25`, `context.other->query.remaining_durability`) |
| `shooter` | `ammunition[] {item, use_offhand, search_inventory, use_in_creative}`, `max_draw_duration`, `scale_power_by_draw_duration`, `charge_on_draw` |
| `should_despawn` | bool |
| `stacked_by_data` | bool |
| `storage_item` | `max_slots`, `allow_nested_storage_items`, `allowed_items`, `banned_items` |
| `storage_weight_limit` | `max_weight_limit` |
| `storage_weight_modifier` | `weight_in_storage_item` |
| `swing_duration` | seconds (visual) |
| `swing_sounds` | `attack_hit`, `attack_miss`, `attack_critical_hit` |
| `tags` | `tags[]` |
| `throwable` | `do_swing_animation`, `launch_power_scale`, `max_launch_power`, `min_draw_duration`, `max_draw_duration`, `scale_power_by_draw_duration` |
| `use_animation` | animation name (`eat`, `drink`, `bow`, `brush`, `spyglass`, ...) |
| `use_modifiers` | `use_duration`, `movement_modifier`, `start_sound`, `start_using` (`if_first`, `always`), `emit_vibrations` |
| `wearable` | `slot` (`slot.armor.head/chest/legs/feet/body`, `slot.weapon.mainhand/offhand`), `protection`, `hides_player_location` |

The docs list 98 vanilla item tags (`docs:itemreference/examples/vanilla-item-tags`), among them the tier tags `minecraft:wooden_tier` ... `minecraft:netherite_tier`, `minecraft:copper_tier`, the tool tags `minecraft:is_axe/is_hoe/is_pickaxe/is_shears/is_shovel/is_spear/is_sword/is_tool/is_trident/digger`, `minecraft:is_armor`, `minecraft:horse_armor`, `minecraft:nautilus_armor`, `minecraft:harness`, `minecraft:is_food/is_meat/is_cooked`, `minecraft:piglin_loved/piglin_repellents`, `minecraft:trimmable_armors/trim_materials/trim_templates`, `minecraft:boats`, `minecraft:spawn_egg`, `minecraft:music_disc`, `minecraft:lectern_books`, `minecraft:bookshelf_books`, `minecraft:decorated_pot_sherds`, `minecraft:arrow`, `minecraft:egg`, `minecraft:coals`, `minecraft:planks`, `minecraft:logs`, and 10 `minecraft:sulfur_cube_archetype_*` tags.

### What the 79 vanilla item files use

79 files, 79 identifiers; the BDS composed set and the samples have the same file names, and the six BDS members that are `\x7fMCB` (`breeze_rod`, `ominous_trial_key`, `red_shrub`, `shelf_mushroom`, `trial_key`, `wind_charge`) are plain JSON in the samples. Format versions: `1.10` 45, `1.21.80` 17 (bundles), `1.21.100` 7 (spears), `1.26.30` 5 (`apple`, `breeze_rod`, `trial_key`, `ominous_trial_key`, `wind_charge`), `1.26.50` 2, `1.14`, `1.16`, `1.16.0` one each. Four sample files (`appleEnchanted`, `golden_apple`, `pufferfish`, `wheat_seeds`) contain `//` comments and need a lenient parser.

| Component | Files | Items |
|---|---|---|
| `food` | 40 | all foods; 1.10 files also use `effects` (`chicken`, `rotten_flesh`, `poisonous_potato`, `spider_eye`, `golden_apple`, `appleEnchanted`), `on_use_action: chorus_teleport` with `on_use_range`, `cooldown_type`, `cooldown_time` (`chorus_fruit`), `remove_effects` (`honey_bottle`), `is_meat`, `using_converts_to` (soups, `honey_bottle`) |
| `use_duration` (legacy) | 40 | 32 for foods, 16 `dried_kelp`, 40 `honey_bottle`, 100000 `camera` |
| `icon` | 30 | `apple`, bundles, spears, keys, `breeze_rod`, `wind_charge`, `red_shrub` |
| `max_stack_size` | 29 | 1 for bundles, spears, soups; 16 `honey_bottle` |
| `storage_item`, `storage_weight_limit`, `storage_weight_modifier`, `bundle_interaction` | 17 each | bundles (`max_slots 64`, banned shulker boxes, weight 4, 12 viewable) |
| `display_name` | 14 | |
| `seed` (legacy) | 11 | `crop_result`, `plant_at`, `plant_at_face` for seeds, `carrot`, `potato`, `nether_wart`, `glow_berries`, `sweet_berries`, `pitcher_pod`, `torchflower_seeds` |
| `tags` | 9 | `minecraft:is_food`, `minecraft:<tier>_tier` + `minecraft:is_spear`, `minecraft:mushrooms_for_stew` |
| `hand_equipped` | 9 | spears, `breeze_rod`; `appleEnchanted` sets false |
| `use_modifiers` | 8 | `apple` (1.6 s, 0.35 movement), spears (72000 s, start sound) |
| `stacked_by_data` | 8 | fish, apples |
| `cooldown` | 8 | spears (`spear`, 0.85 s, `attack`), `wind_charge` (0.5 s) |
| `durability`, `repairable`, `enchantable` (`melee_spear`), `swing_duration`, `swing_sounds`, `damage`, `piercing_weapon`, `kinetic_weapon` | 7 each | spears |
| `max_damage` (legacy) | 6 | fish, value 0 |
| `foil` (legacy) | 2 | `appleEnchanted` true, `golden_apple` false |
| `block_placer`, `compostable` | 2 | `red_shrub` (30), `shelf_mushroom` (65) |
| `use_animation` | 1 | `apple: eat` |
| `block`, `camera` (legacy) | 1 | `camera` |
| `fire_resistant` | 1 | `netherite_spear` |
| `projectile`, `throwable` | 1 | `wind_charge` (`wind_charge_projectile`, power 1.5) |
| `fuel` | 1 | `wooden_spear` |

So vanilla exercises 34 keys, 28 of them documented components; the other 16 documented components are used by no vanilla item: `allow_off_hand`, `can_destroy_in_creative`, `damage_absorption`, `digger`, `durability_sensor`, `dyeable`, `entity_placer`, `glint`, `hover_text_color`, `interact_button`, `liquid_clipped`, `rarity`, `record`, `shooter`, `should_despawn`, `wearable`.

### The 1623 items and their families

`mojang-items.json` has 1623 `{command_name, name, raw_id, serialization_id, serialization_name}`; `raw_id` runs -1230..883 with 889 negative ids (block items are negative). `serialization_name` equals `name` for all entries. Grouped by name pattern (script `item-families.mjs`):

| Family | Count | Family | Count |
|---|---|---|---|
| block items (name also a block) | 982 | spawn eggs | 88 |
| raw materials, ingots, nuggets, gems, misc craft items | 115 | foods | 37 |
| seeds and crops | 28 | signs and hanging signs | 26 |
| pottery sherds | 23 | boats and rafts | 22 |
| doors | 22 | music discs | 22 |
| smithing templates | 19 | bundles | 17 |
| candles | 17 | harnesses and wolf armor | 17 |
| dyes | 16 | cushions (26.x entity items) | 16 |
| buckets | 12 | banners and banner patterns | 11 |
| helmets | 8 | chestplates, leggings, boots | 7 each |
| swords, pickaxes, axes, shovels, hoes, spears | 7 each | heads and skulls | 7 |
| horse armor | 6 | nautilus armor | 5 |
| minecarts | 5 | compass, clock, recovery and lodestone compass | 4 |
| books | 3 | potions (potion, splash, lingering) | 3 |
| saddle, name tag, lead | 3 | bows and crossbows | 2 |
| maps | 2 | ender pearl, eye of ender | 2 |
| flint and steel, fire charge | 2 | singletons: arrow, brush, elytra, fishing rod, goat horn, mace, shears, shield, totem, trident, straw bed, armor stand, painting, snowball, spyglass, repeater, comparator, popped chorus fruit | 18 |

79 have JSON (foods 40, bundles 17, spears 7, seeds 11, keys, `wind_charge`, `breeze_rod`, `camera`, `red_shrub`, `shelf_mushroom`), 1544 do not. Potions and tipped arrows are single items whose aux value selects one of the 47 `mojang-potion-effects.json` names; `mojang-cooldown-category.json` lists the 6 vanilla cooldown categories (`chorusfruit`, `ender_pearl`, `goat_horn`, ...).

### Could the project author Bedrock JSON for the engine items?

| Family | Components that express it | No component (engine behavior) |
|---|---|---|
| swords, axes, pickaxes, shovels, hoes (35) | `damage`, `durability`, `repairable`, `enchantable` (slot `sword`/`axe`/...), `digger` (speeds by block tag), `hand_equipped`, `tags` (tier and `is_*`), `fuel` for wooden | sweep attack, axe disabling shields, stripping logs and tilling (`onUseOn` exists only in script), harvest tier is block-side |
| mace (1) | `damage`, `durability`, `enchantable`, `repairable` | smash attack, fall-distance damage |
| armor (29 + turtle helmet) | `wearable {slot, protection}`, `durability`, `repairable`, `enchantable` (`armor_*`), `dyeable` (leather), `damage_absorption`, `tags minecraft:is_armor` | armor toughness, knockback resistance, netherite fire immunity is `fire_resistant` for the drop only, turtle helmet water breathing, trims are smithing recipes plus client rendering |
| horse armor, harnesses, wolf armor, nautilus armor (28) | `tags`, `durability`, `dyeable` | equipping on the mob (entity side `minecraft:equippable` exists in entity JSON) |
| bows, crossbows (2) | `shooter {ammunition arrow, max_draw_duration 1, scale_power_by_draw_duration}`, crossbow `charge_on_draw`, `durability`, `enchantable bow/crossbow`, `use_animation bow` | multishot, piercing, quick charge, firework ammunition |
| trident (1) | `damage`, `durability`, `throwable` + `projectile` (`thrown_trident` entity), `enchantable spear` | loyalty return, riptide, channeling |
| shield (1) | `durability`, `enchantable shield`, `allow_off_hand`, `repairable` | blocking, banner pattern |
| elytra (1) | `wearable slot.armor.chest`, `durability`, `repairable`, `enchantable elytra`, `damage_absorption` | gliding, firework boost |
| totem (1) | `max_stack_size 1`, `allow_off_hand` | death save |
| buckets (12) | `max_stack_size` (1 or 16), `liquid_clipped` for empty buckets | fill and pour, entity capture, milk clearing effects (`food.remove_effects` is deprecated) |
| compass, clock, recovery compass, lodestone compass (4) | `max_stack_size`, `rarity` | needle and dial (client animation from the resource pack `atlas`), lodestone binding |
| maps (2) | `max_stack_size` | map rendering, exploration, locking |
| fishing rod (1) | `durability`, `enchantable fishing_rod`, `repairable` | bobber entity, fishing loot (`loot_tables/gameplay/fishing.json` exists) |
| shears (1) | `durability`, `digger` (wool, leaves, cobweb), `enchantable shears` | shearing mobs, pumpkins, beehives, disarming tripwire |
| flint and steel, fire charge (2) | `durability`, `enchantable flintsteel`, `fire_charge` as `projectile` for dispensers | igniting blocks, TNT, portals, creepers |
| ender pearl, eye of ender (2) | `throwable`, `projectile` (`ender_pearl`, `eye_of_ender_signal` entities, whose JSON defines teleport and flight), `cooldown ender_pearl`, `max_stack_size 16` | stronghold locating, end portal frame fill |
| snowball, egg (2) | `throwable`, `projectile` (`snowball`, `egg`; chick spawning is in the egg entity JSON), `max_stack_size 16` | none |
| potions, splash, lingering, tipped arrows (4 items, 47 effects each) | `stacked_by_data`, `use_animation drink`, `use_duration`, `throwable` + `projectile` for splash and lingering, `glint` | effect application by aux value, brewing stand UI, arrow effect transfer |
| spawn eggs (88) | `entity_placer {entity, use_on, dispense_on}`, `tags minecraft:spawn_egg` | spawner retargeting, baby by sneaking |
| boats, rafts, chest boats (22) | `entity_placer` with `use_on` water, `tags minecraft:boats` | none beyond the entity |
| minecarts (5) | `entity_placer` with `use_on` rails, `tags minecraft:is_minecart` | none beyond the entity |
| saddle, name tag, lead (3) | `max_stack_size` | entity interactions (`minecraft:rideable`, `nameable`, `leashable` are entity components, but the item side is engine) |
| books (3) | `enchantable`, `tags lectern_books`, `glint` for enchanted | writing UI, enchanting table UI |
| banners, patterns (11) | `max_stack_size 16`, `tags minecraft:banner` | loom UI, pattern NBT |
| dyes (16) | `tags` | dyeing sheep, wolf collars, signs, water in cauldrons, crafting is recipes |
| music discs (22) | `record {sound_event, duration, comparator_signal}`, `rarity rare`, `max_stack_size 1` | none |
| goat horn (1) | `cooldown goat_horn`, `use_animation`, `use_modifiers` | sound selection by aux |
| brush (1) | `durability`, `use_animation brush`, `use_modifiers` | archaeology (suspicious block progress) |
| bundles (17) | already JSON | none |
| spyglass (1) | `use_animation spyglass`, `use_modifiers` | zoom (client) |
| armor stand, painting (2) | `entity_placer` | none beyond the entity |
| signs, doors, beds, candles, heads, straw bed, cushions | block items: `block_placer` or implicit block item | the block behavior |
| raw materials, sherds, templates, nuggets, ingots (157) | `max_stack_size`, `rarity`, `fuel` (coal, blaze rod, sticks), `compostable` (plant matter), `tags` (`coals`, `trim_materials`, `trim_templates`, `piglin_loved`) | none |
| foods without JSON (`milk_bucket`, `cake` item, eggs) | `food` | milk's effect clearing |

Reading: 10 of the 36 families (about 240 items counting spawn eggs, boats, minecarts, discs, materials) are fully expressible; tools and armor are expressible for their numbers but not their special actions; about 30 item behaviors (bucket, compass, clock, map, rod, shears-on-mob, igniter, locate, potion effects, shield, glide, totem, trident return, mace smash, horn, brush, book UIs, banner, dyeing, lead, name tag, saddle, mob armor, spyglass, sweep, strip-and-till, milk, firework, end crystal, experience bottle) need named behavior classes keyed by item or tag.

## 4. Recipes and the item catalog

### Recipe grammar

Docs: `docs:recipereference/examples/recipedefinitions/recipe_shaped` and siblings. Seven recipe types occur in the 1892 composed files:

| Type | Files | Keys (count) | Station tags |
|---|---|---|---|
| `minecraft:recipe_shaped` | 1064 | `description.identifier`, `pattern[]` (rows, space = empty), `key {char: descriptor}`, `result`, `tags`, `unlock` 880, `group` 297, `priority` 258; documented but unused: `assume_symmetry` (1.20.80) | `crafting_table` 1049, `deprecated` 15 |
| `minecraft:recipe_shapeless` | 591 | `ingredients[]` (descriptor with optional `count`), `result`, `tags`, `unlock` 587, `priority` 423, `group` 102 | `stonecutter` 356, `crafting_table` 232, `cartography_table` 2, `deprecated` 1 |
| `minecraft:recipe_furnace` | 152 | `input`, `output`, `tags`, `priority` 134, `unlock` 134 | `furnace` 134 of which 62 also `blast_furnace` and 9 also `smoker`, `campfire`, `soul_campfire`; `deprecated` 18 |
| `minecraft:recipe_brewing_mix` | 70 | `input`, `reagent`, `output` as `minecraft:potion_type:<effect>` strings | `brewing_stand` 70 |
| `minecraft:recipe_brewing_container` | 2 | `input: minecraft:potion`, `reagent` (`gunpowder`, `dragon_breath`), `output` (`splash_potion`, `lingering_potion`) | `brewing_stand` |
| `minecraft:recipe_smithing_transform` | 12 | `template`, `base`, `addition`, `result` as strings | `smithing_table` |
| `minecraft:recipe_smithing_trim` | 1 | `template {tag: minecraft:trim_templates}`, `base {tag: minecraft:trimmable_armors}`, `addition {tag: minecraft:trim_materials}` | `smithing_table` |

Tag combinations as written: `["crafting_table"]` 1281, `["stonecutter"]` 356, `["brewing_stand"]` 72, `["furnace"]` 63, `["furnace","blast_furnace"]` 62, `["deprecated"]` 34, `["smithing_table"]` 13, `["furnace","smoker","campfire","soul_campfire"]` 9, `["cartography_table"]` 2. Format versions: `1.20.10` 1330, `1.26.50` 154, `1.16` 139, `1.26.0` 70, `1.12` 68, `1.21.80` 60, `1.21.50` 24, `1.20.30` 19, `1.21.110` 14, others under 4 each.

Item descriptors (ingredient forms across all types): `{item}` 2260, `{item, data}` 312, `{tag}` 93, bare string 238, `name:meta` string 90 (furnace inputs like `minecraft:coal:1` and the potion types), `{item, count}` 3. Results: `{item, count}` 1093, `{item}` 371, `{item, data, count}` 115, `{item, data}` 79, strings 133, `name:meta` 103. Eight shaped or shapeless recipes have an array `result`. The docs mark `data` "Deprecated - no longer in use ... after format versions of at least 1.20.0", yet 294 recipes still carry it (269 at `1.20.10`, 17 at `1.26.50`); `generate-recipes.js` already resolves those through its alias table. No recipe uses Molang. The 16 tags in use: `minecraft:mushrooms_for_stew` 37, `minecraft:planks` 26, `minecraft:stone_tool_materials` 12, `minecraft:wooden_slabs` 9, `minecraft:coals` 6, `minecraft:soul_fire_base_blocks` 4, `minecraft:stone_crafting_materials` 3, `minecraft:logs` 3, `minecraft:egg` 3, `minecraft:metal_nuggets` 2, `minecraft:logs_that_burn` 2, `minecraft:wool`, `minecraft:trimmable_armors`, `minecraft:trim_templates`, `minecraft:trim_materials`, `minecraft:is_pickaxe` 1 each. `unlock` is an array of descriptors (1367 recipes with `{item}` entries, 145 `{item,data}`, 14 `{tag}`) or `{context}` with `PlayerInWater` 11, `AlwaysUnlocked` 2, `None` 18, `PlayerHasManyItems` 1. `priority` values run -1 to 610; 229 recipes use 0, 208 use 2, 168 use 1. `group` appears in 399 recipes (`planks` 50, `carpet` 35, `stained_glass_pane` 32, `wood` 26, `sign` 26).

### Crafting item catalog

Docs: `creator/Documents/CraftingItemCatalogDocumentation.md`; schema `crafting_catalog/1.26.50/Crafting Catalog Document.json` referencing the 1.21.60 types. Grammar:

```
{ "format_version": "1.21.60",
  "minecraft:crafting_items_catalog": { "categories": [
    { "category_name": "construction|nature|equipment|items",
      "groups": [ { "group_identifier": { "name": "namespace:loc_key", "icon": "item or block" }, "items": [ "ns:item", { "name": "ns:item:aux" } ] },
                  { "items": [ ... ] } ] } ] } }
```

A group with `group_identifier` is collapsible and merges with an existing group of the same name; a group without one is loose items. Categories cannot be added or reordered; additions append. "The creative inventory and recipe book both share the same list of items."

The vanilla file is `\x7fMCB` in BDS (52275 bytes) and absent from the samples. Its string table, walked as length-prefixed strings, yields in order: `minecraft:crafting_items_catalog`, then `construction` with 20 named groups and about 583 item strings, `nature` 18 and 457, `equipment` 22 and 389, `items` 24 and 436 (item counts are approximate because a length byte that happens to be printable merges two names), 84 distinct `minecraft:itemGroup.name.*` names in total. The captured creative menu in `packages/bedrock-data/src/resources/creative_items.json` (and `src/generated/creativeitems.ts`, built from it) has 124 groups (88 named, 36 anonymous) and 1980 entries (1590 distinct item names, 1020 carrying a block state): `items` 607, `construction` 567, `nature` 439, `equipment` 367; 1671 entries sit in named groups and 309 are loose. All 84 catalog group names appear in the capture; the capture's four extra named groups are `banner`, `enchantedBook`, `firework`, `fireworkStars`, which the engine populates from enchantments, firework NBT and banner patterns rather than from the catalog. So the catalog file is the order and grouping of the creative menu, and the per-entry block states and the four generated groups come from the engine; `creativeitems.ts` is the complete network form.

## 5. Biomes

### Grammar

Docs `docs:biomesreference/examples/componentlist` and schema `biome/1.26.30/Biome Components.json`. A file is `minecraft:biome {description {identifier}, components}`. Fifteen components are documented; `minecraft:replace_biomes` (1.26.0: `replacements[] {dimension, targets[], amount, noise_frequency_scale}`) is documented and unused by vanilla, the other 14 are used:

| Component | Files | Parameters | Vanilla values |
|---|---|---|---|
| `minecraft:climate` | 89 | `temperature`, `downfall`, `snow_accumulation [min,max]` (multiples of 0.125) | temperature -0.7 (frozen and jagged peaks) to 2.0 (desert, mesa, savanna mutated, nether); downfall 0 to 1; snow accumulation `[0,0.125]` for most, `[0.125,0.25]` cold, `[0.25,1]` ice plains, `[0.375,1.5]` ice mountains, `[0.5,1.5]` ice spikes; 7 files omit it (cherry grove, deep dark, dripstone caves, lush caves, meadow, stony peaks, sulfur caves) |
| `minecraft:tags` | 89 | `tags[]` | 108 distinct tags (below) |
| `minecraft:surface_builder` | 88 | `builder {type, ...}` | types below |
| `minecraft:overworld_height` | 76 | `noise_type`, or the legacy `noise_params [depth, scale]` | `noise_type` in 67 files: `default` 15, `mountains` 11, `ocean` 6, `default_mutated` 5, `deep_ocean` 5, `lowlands` 5, `extreme` 4, `beach` 3, `taiga` 3, `highlands` 3, `river` 2, `swamp` 2, `less_extreme`, `mushroom`, `stone_beach` 1 each; `noise_params` in 9; docs: "only affects map item rendering" |
| `minecraft:overworld_generation_rules` | 31 | `hills_transformation`, `mutate_transformation`, `river_transformation`, `shore_transformation`, `generate_for_climates [[climate, weight]]` | plains: hills forest_hills 1 / forest 2, mutate sunflower_plains, climates medium 3 warm 1 cold 1; docs: pre Caves and Cliffs, unused for custom biomes |
| `minecraft:multinoise_generation_rules` | 18 | `target_temperature`, `target_humidity`, `target_altitude`, `target_weirdness`, `weight` | nether biomes only, for example crimson forest 0.4/0/0/0 weight 0 |
| `minecraft:surface_material_adjustments` | 18 | `adjustments[] {materials {top/mid/foundation/sea/sea_floor_material}, noise_range [min,max], noise_frequency_scale, height_range}` | extreme hills: stone top and mid for noise 0.121..1 at scale 0.0625; crimson forest: netherrack 0.4..1 and nether wart block -0.75..-0.5; frozen peaks 4 adjustments |
| `minecraft:map_tints` | 10 | `grass {type: tint|noise, tint}`, `foliage` | cherry grove `#b6db61` |
| `minecraft:village_type` | 10 | `type`: `default`, `desert`, `ice`, `savanna`, `taiga` | |
| `minecraft:mountain_parameters` | 7 | `steep_material_adjustment {material, north/south/east/west_slopes}`, `top_slide {enabled}` | frozen peaks packed ice on north and east slopes; jagged, snowy, stony peaks stone; cherry grove, grove, meadow `top_slide.enabled: false` |
| `minecraft:creature_spawn_probability` | 5 | `probability` 0..0.75 | ice plains 0.07 |
| `minecraft:humidity` | 2 | `is_humid` | roofed forest, jungle |
| `minecraft:partially_frozen` | 2 | `{}` | deep frozen ocean, frozen ocean |
| `minecraft:subsurface_builder` | 1 | `builder` | sulfur caves, same `noise_gradient` as its surface builder |

Surface builder `type` values in the schema `SurfaceBuilderType.json`: `minecraft:overworld`, `mesa`, `swamp`, `capped`, `frozen_ocean`, `the_end`, `noise_gradient` (1.26.30). Vanilla: `overworld` 73, `mesa` 6 (plus `bryce_pillars`, `clay_material`, `hard_clay_material`, `has_forest`), `swamp` 3 (plus `max_puddle_depth_below_sea_level`), `capped` 2 (`floor_materials[]`, `ceiling_materials[]`, `sea_material`, `foundation_material`, `beach_material`; basalt deltas and soulsand valley), `frozen_ocean` 2, `the_end` 1 (no materials), `noise_gradient` 1 (`noise_descriptor {name, first_octave, amplitudes[]}`, `noise_block_specifiers[] {block, range|threshold}`, `non_replaceable_blocks[]`; sulfur caves places cinnabar and sulfur by noise band). `legacy_frozen_ocean` has no surface builder. The `overworld` parameters are `top_material`, `mid_material`, `foundation_material`, `sea_material`, `sea_floor_material`, `sea_floor_depth`. The per-biome values: 51 biomes use grass block / dirt / stone / water / gravel / 7; beaches, deserts and their hills use sand / sand; mesa family red sand / hardened clay; snowy peaks snow / snow or stone with ice or stone floors; grove snow / dirt; mushroom islands mycelium; stone beach and stony peaks stone / stone; warm, lukewarm and deep lukewarm oceans sand floors with depth 3 (7 for deep lukewarm); mangrove swamp mud / mud / stone / water / mud; crimson and warped forests nylium / netherrack / netherrack / lava / nylium / 1; hell netherrack throughout; dripstone caves stone / dirt. There is no `nether` or `mountain` builder type; nether biomes use `overworld` or `capped`, mountains use `overworld` plus `mountain_parameters`. Wherever a block is given as an object it is `{name, states}`.

### Tags

98 distinct tags across the 89 files. Frequency: `monster` 75, `overworld` 73, `animal` 46, `spawns_cold_variant_farm_animals` 33, `spawns_warm_variant_farm_animals` 31, `forest` 21, `mutated` 21, `has_structure_abandoned_camp` 18, `spawns_cold_variant_frogs` 14, `fast_fishing` 11, `high_seas` 11, `ocean` 11, `spawns_white_rabbits` 11, `bee_habitat` 10, `frozen` 10, `hills` 10, `overworld_generation` 10, `taiga` 10, `spawns_snow_foxes` 9, `cold` 7, `jungle` 7, `mountains` 7, `has_structure_trail_ruins` 6, `mesa` 6, `plateau` 6, `spawns_jungle_mobs` 6, `spawns_mesa_mobs` 6, `surface_mineshaft` 6, `deep` 5, `extreme_hills` 5, `nether` 5, `birch` 4, `caves` 4, `mega` 4, `rare` 4, `savanna` 4, `spawns_savanna_mobs` 4, `temperate_ocean` 4, then `beach`, `desert`, `edge`, `mountain`, `slime`, `spawn_endermen`, `spawn_ghast`, `spawns_gold_rabbits`, `spawns_polar_bears_on_alternate_blocks`, `spawns_slimes_on_surface`, `spawns_warm_variant_frogs`, `stone`, `warm` at 3, and 47 tags on one or two biomes (`bamboo`, `ice`, `ice_plains`, `lukewarm`, `mooshroom_island`, `netherwart_forest`, `plains`, `river`, `roofed`, `spawns_river_mobs`, `spawns_without_patrols`, `swamp`, `swamp_water_huge_mushroom`, one tag per named biome such as `cherry_grove`, `deep_dark`, `lush_caves`, `pale_garden`, `sulfur_caves`, `the_end`, `legacy`, `no_legacy_worldgen`, `spawn_few_piglins`, `spawn_magma_cubes`, `spawns_more_frequent_drowned`, `spawns_tropical_fish_at_any_height`, ...).

Who filters on them. All 358 feature rules with a `minecraft:biome_filter` use only `has_biome_tag` (661 tests; operators `==` 527, `!=` 76, `not` 58) across 52 tags, most often `overworld` 67, `overworld_generation` 67, `deprecated` 54 (a tag no biome has, which disables a rule), `taiga` 38, `swamp` 30, `mutated` 29, `jungle` 25, `mega` 25, `ocean` 23, `forest` 18, `extreme_hills` 17, `warm` 16, `mesa` 16, `savanna` 16, `plains` 14. 54 of 60 spawn rules filter on 39 tags (`has_biome_tag` 96 tests plus one `is_snow_covered`): `monster` 10, `ocean` 10, `sulfur_caves` 7, `desert` 5, `warm` 5, `frozen` 5, `plains` 4, `animal` 4, and the `spawn_*` tags on nether biomes. The two jigsaw structure families filter on `has_structure_trail_ruins` and `has_structure_abandoned_camp` plus `forest`, `oak_forest` and similar. Root features use `query.has_biome_tag` 9 times (beehive placement). Tags with no JSON consumer that the docs say the engine reads directly include `bee_habitat`, `fast_fishing`, `high_seas`, `surface_mineshaft`, `spawns_*_variant_*`, `spawns_without_patrols`, `village_type` related tags, `slime`, `the_end`, `nether`.

### The network form

`packages/bedrock-data/src/resources/biome_definitions.json` (CloudburstMC capture of `BiomeDefinitionListPacket`) is a map of 89 names to `{id: null, temperature, downfall, redSporeDensity, blueSporeDensity, ashDensity, whiteAshDensity, foliageSnow, depth, scale, mapWaterColor {a,r,g,b}, rain, tags[], chunkGenData}`. `chunkGenData` carries the JSON above in binary-friendly form: `climate` (with `snowAccumulationMin/Max`), `surfaceBuilderData.surfaceMaterials` (`topBlock`, `midBlock`, ... as base64 little-endian NBT block states), `surfaceMaterialAdjustment`, `mountainParams`, `villageType` (`DEFAULT`), `hasDefaultOverworldSurface`, `hasFrozenOceanSurface`, `hasSwampSurface`, `hasTheEndSurface`, `cappedSurface`, `mesaSurface`, `subsurfaceBuilderData`, `overworldGenRules` (`hillsTransformations`, `mutateTransformations`, ...), `multinoiseGenRules`, `legacyWorldGenRules`, `biomeReplacements`, and `consolidatedFeatures`: every feature rule that applies to the biome, flattened (`scatter.coordinates[] {minValue, maxValue, distribution UNIFORM|SINGLE_VALUED|..., gridOffset, gridStepSize}`, `evalOrder`, `chancePercent`, `iterations` as Molang text, `feature`, `identifier`, `pass`, `internalUse`). Across the 89 biomes there are 4319 consolidated entries (`underground_pass` 2612, `after_surface_pass` 924, `surface_pass` 406, `pregeneration_pass` 171, `after_underground_pass` 84, `before_underground_pass` 83, `first_pass` 27, `before_surface_pass` 12), plains alone 51. The `id` field is null in this capture; numeric biome ids come from `mojang-biomes.json` (89 entries, `ocean` 0, `plains` 1, `desert` 2, ... `hell` 8, `the_end` 9, ..., `pale_garden` 193, `sulfur_caves` 194, `dappled_forest` 195). `src/generated/biome_definitions_network.json` is the raw 7667-byte packet payload this server replays. `stripped_biome_definitions.json` is the same map without `chunkGenData`.

## 6. Features and feature rules

### Feature types

The docs (`docs:featuresreference/examples/featurelist`) list 25 types plus 5 internal (`beards_and_shavers`, `conditional_list`, `rect_layout`, `scan_surface`, `sculk_patch_feature`). Each file is `{format_version, "minecraft:<type>": {description {identifier}, ...}}`. Vanilla usage (pack `features` 210 files; root `definitions/features` 139 files, 80 of them not shadowed by a pack file):

| Type | Pack | Root | Parameters used by vanilla (documented ones in the per-type docs) |
|---|---|---|---|
| `scatter_feature` | 47 | 44 | `places_feature`, `iterations`, `x`/`y`/`z` (number, Molang, or `{distribution, extent}`), `coordinate_eval_order`, `scatter_chance`, `project_input_to_floor`; the 1.21.20 `distribution` object form (3 files) |
| `tree_feature` | 35 | 24 | `base_block`, `base_cluster`, `may_grow_on`, `may_grow_through`, `may_replace`, and one trunk and one canopy from `trunk`, `acacia_trunk`, `fancy_trunk`, `mega_trunk`, `fallen_trunk`, `cherry_trunk`, `mangrove_trunk`, `poplar_trunk`, `canopy`, `acacia_canopy`, `fancy_canopy`, `mega_canopy`, `mega_pine_canopy`, `pine_canopy`, `spruce_canopy`, `roofed_canopy`, `cherry_canopy`, `mangrove_canopy`, `mangrove_roots`, `poplar_canopy`, `random_spread_canopy`; the canopy objects carry `canopy_offset`, `variation_chance`, `leaf_block`, decorations |
| `aggregate_feature` | 26 | 29 | `features[]`, `early_out` |
| `ore_feature` | 24 | 14 | `count`, `replace_rules[] {places_block, may_replace[]}`, `discard_chance_on_air_exposure` |
| `single_block_feature` | 15 | 17 | `places_block`, `enforce_placement_rules`, `enforce_survivability_rules`, `may_attach_to {top, bottom, sides, all, diagonal, min_sides_must_attach, auto_rotate}`, `may_not_attach_to`, `may_replace`, `randomize_rotation` |
| `snap_to_surface_feature` | 12 | 0 | `feature_to_snap`, `vertical_search_range`, `surface` (`floor`, `ceiling`, `random_horizontal`, `wall`), `allowed_surface_blocks`, `allow_air_placement`, `allow_underwater_placement`, `embed_in_surface` (1.26.20) |
| `weighted_random_feature` | 11 | 5 | `features [[name, weight]]` |
| `structure_template_feature` | 10 | 0 | `structure_name`, `adjustment_radius`, `ground_level`, `rotate_around_center`, `constraints {grounded, unburied, block_intersection, leveled {max_steepness}}`; `facing_direction` is documented and unused; the 10 sulfur spring `.mcstructure` files |
| `growing_plant_feature` | 7 | 0 | `height_distribution`, `growth_direction` (UP, DOWN), `body_blocks`, `head_blocks`, `allow_water`, `age` |
| `vegetation_patch_feature` | 7 | 0 | `replaceable_blocks`, `ground_block`, `vegetation_feature`, `surface`, `depth`, `vertical_range`, `vegetation_chance`, `horizontal_radius`, `extra_deep_block_chance`, `extra_edge_column_chance`, `waterlogged` |
| `search_feature` | 4 | 1 | `places_feature`, `search_volume {min, max}`, `search_axis`, `required_successes` |
| `cave_carver_feature` | 2 | 1 | `fill_with`, `width_modifier` (Molang), `skip_carve_chance`, `y_scale`, `height_limit`, `horizontal_radius_multiplier`, `vertical_radius_multiplier`, `floor_level` |
| `multiface_feature` | 2 | 0 | `places_block`, `search_range`, `can_place_on_floor/ceiling/wall`, `chance_of_spreading`, `can_place_on` |
| `sculk_patch_feature` | 2 | 0 | `can_place_sculk_patch_on`, `central_block`, `central_block_placement_chance`, `cursor_count`, `charge_amount`, `spread_attempts`, `growth_rounds`, `spread_rounds`, `extra_growth_chance` |
| `surface_relative_threshold_feature` | 2 | 0 | `feature_to_place`, `minimum_distance_below_surface` |
| `fossil_feature` | 1 | 1 | `ore_block`, `max_empty_corners` |
| `geode_feature` | 1 | 0 | `filler`, `inner_layer`, `alternate_inner_layer`, `middle_layer`, `outer_layer`, `inner_placements`, `min/max_outer_wall_distance`, `min/max_distribution_points`, `min/max_point_offset`, `max_radius`, `crack_point_offset`, `generate_crack_chance`, `base_crack_size`, `noise_multiplier`, `use_potential_placements_chance`, `use_alternate_layer0_chance`, `placements_require_layer0_alternate`, `invalid_blocks_threshold` |
| `horizontal_tree_decoration_feature` | 1 | 0 | `places_block`, `bark_side_only`, `allow_adjacent` |
| `partially_exposed_blob_feature` | 1 | 0 | `places_block`, `placement_radius_around_floor`, `placement_probability_per_valid_position`, `exposed_face` |
| `nether_cave_carver_feature` | 0 | 1 | as `cave_carver_feature` |
| `underwater_cave_carver_feature` | 0 | 1 | as `cave_carver_feature` plus `replace_air_with` |
| `sequence_feature` | 0 | 1 | `features[]` (output position chains) |
| `multi_block_feature` (1.26.50), `multipart_block_column_feature`, `height_difference_filter_feature` | 0 | 0 | documented, unused |

Distribution objects inside features: `triangle` 111, `gaussian` 51, `fixed_grid` 4, `uniform` 4. The docs name `uniform`, `gaussian`, `inverse_gaussian`, `fixed_grid`, `jittered_grid`, `triangle` for `distribution`, with `extent`, `grid_offset`, `step_size` for the grid kinds. Block references in features are strings or `{name, states}` or `{tags: "query.any_tag('dirt')"}`; the tags used are `dirt` (33) and `minecraft:leaves` (11).

Features the JSON refers to but never defines. Resolving every `places_feature`, `feature_to_snap`, `feature_to_place`, `vegetation_feature`, `features[]` and `feature` reference across pack and root rules and features gives 342 distinct feature identifiers; 290 have a definition and 87 do not (49 of them referenced from pack rules). They are engine features: the whole `minecraft:legacy:*` family (28 names: `plains_tree_feature`, `forest_flower_feature`, `small_mushrooms_feature`, `springs_feature`, `ice_feature`, ...), `kelp_feature` (7 refs), `reeds_feature` (12), `dead_bush_feature` (14), `cactus_feature` (6), `seagrass_feature`, `shorter/shortest/taller_seagrass_feature`, `melon_feature`, `pumpkin_feature`, `bamboo_feature`, `brown_mushroom_feature`, `red_mushroom_feature`, `huge_mushroom_feature`, `sweet_berry_bush_feature`, `coral_feature`, `coral_hang_feature`, `coral_crust_feature`, `pickle_feature`, `sea_anemone_feature`, `sand_feature`, `gravel_feature`, `clay_feature`, `desert_well_feature`, `nether_fossil_feature`, `ice_patch_feature`, `ice_spike_feature`, `delta_feature`, `basalt_columns_feature`, `_basalt_pillar_feature`, `_huge_crimson_fungus_feature`, `_huge_warped_fungus_feature`, `_twisting_vines_cluster_feature`, `_weeping_vines_cluster_feature`, `vines_feature`, `vines_single_face_feature`, `waterlily_feature`, `podzol_area_feature`, `grass_disc_feature`, `dripleaf_feature`, `pointed_dripstone_feature`, `large_dripstone_feature`, `dripstone_cluster_feature`, `azalea_root_system_feature`, `moss_vegetation_feature`, `pale_moss_vegetation_feature`, `leaf_litter_feature`, `wildflowers_feature`, `pink_petals_feature`, `eyeblossom_feature`, `meadow_flower_feature`, `firefly_bush_cluster_feature`, `firefly_bush_water_cluster_feature`, `sulfur_spike_feature`, `sulfur_spike_cluster_feature`, `sulfur_pool`, `sulfur_spring_trail_to_surface_feature`. The 88 pack and root features that no rule reaches are the sapling, bone meal and fallen tree variants (`*_from_sapling`, `*_bonemeal_feature`, `optional_fallen_*`, `cocoa_age_*`, `big_dripleaf_*`) that the engine invokes from block behavior.

### Feature rules

`{format_version, "minecraft:feature_rules": {description {identifier, places_feature}, conditions {placement_pass, "minecraft:biome_filter"}, distribution {iterations, coordinate_eval_order, x, y, z, scatter_chance}}}` (`docs:featuresreference/examples/features/feature_rule_definition`, `.../feature_rule_conditions`). 241 pack rules (205 at `1.13.0`, 17 `1.16.0`, 12 `1.26.50`, 4 `1.21.60`, 2 `1.16.100`, 1 `1.26.10`) and 120 root rules (26 not shadowed). 238 of 241 pack rules have a biome filter; 185 have a `distribution` (the 56 without place the feature once at the chunk origin, as the cave carvers and some trees do).

Placement passes in execution order (docs list; vanilla counts pack + root): `pregeneration_pass` 2 + 3 (carvers), `first_pass` 9 + 11, `before_underground_pass` 1 + 0, `underground_pass` 36 + 13, `after_underground_pass` 2 + 0, `before_surface_pass` 5 + 1, `surface_pass` 90 + 77, `after_surface_pass` 96 + 14. The docs: "Earlier passes in the list are guaranteed to occur before later passes. Order is not guaranteed within each pass."

Distribution grammar in use: `iterations` is a number (273 rules), a Molang string (28), or a numeric string (1); `scatter_chance` is `{numerator, denominator}` (63) or Molang (24); each of `x`, `y`, `z` is `{distribution, extent}` (592 axes: `uniform` 580, `triangle` 12), a Molang string (131, almost all `y: "query.heightmap(variable.worldx, variable.worldz)"`), or a number (183); `coordinate_eval_order` is set on 66 pack rules (`zxy` 33, `zyx` 30, `xyz` 2, `xzy` 1; default `xzy`). Example: bamboo uses `iterations: "math.ceil((query.noise(variable.originx / 80.0, variable.originz / 80.0) + 0.3) * 160.0)"`.

### What the root `definitions/` adds

The root features hold the three carver types and `sequence_feature`, which no pack file uses, and 80 names the pack lacks (the `fixup_*_position_feature`, `select_*`, `optional_*`, beehive and cocoa helpers, `bamboo_then_podzol`, `fern_double_plant_*`, `sunflower_double_plant_*`, `taiga_tall_grass`, `warped_roots`, `crimson_roots`, `nether_sprouts`, `dirt_feature`, `fossil_feature`). The 26 root-only rules are the nether (`basalt_columns`, `basalt_pillar`, `crimson_*`, `warped_*`, `huge_*_fungus`, `delta`, `nether_cave_carver`, `nether_soul_sand_underground`, `nether_sprouts`, `netherwart_forest_trees`, `twisting/weeping_vines_cluster`), `overworld_cave_carver`, `overworld_surface_clay`, `overworld_surface_springs`, `ice_plains_spikes_first_ice_*`, `mushroom_island_surface_huge_mushroom`, `desert_or_swamp_after_surface_fossil`, `roofed_forest_surface_roofed_tree`, `warm_ocean_after_surface_sea_anemone`. Eighteen root feature files and one root rule contain `//` comments. The root files are at `1.13.0` or `1.16.100` and their rules place engine features more often than the pack's do, which suggests they are the live definitions for the parts of generation Mojang never moved into the layered pack rather than leftovers.

### Molang used by features and rules

For the Molang agent, every query and variable found in the composed pack and root features and rules, blocks and items: `query.any_tag` (111, block descriptors in features), `query.heightmap(variable.worldx, variable.worldz)` (162), `query.noise(x, z)` (15), `query.above_top_solid(x, z)` (14), `query.has_biome_tag` (9, root features), `query.block_state` (16, block permutations), `query.max_durability` and `context.other->query.remaining_durability` (item `repairable`); variables `variable.worldx`, `variable.worldz` (176 each), `variable.originx`, `variable.originz` (15 each), `variable.is_legacy` (28, `"variable.is_legacy == 0.0 ? 1 : 0"` in the 1.13 rules); `math.ceil` (4), `math.trunc` (3), `math.random` (2), `math.max` (1), `math.clamp` (1). Recipes and biomes use none. The 1.21.20 `scatter_feature.distribution` and the cave carver `width_modifier` are the other documented Molang slots.

## 7. Structures

### Template formats

BDS keeps the templates as loose files under each layer's `structures/` directory (the matching `__brarchive/structures/*.brarchive` members are all zero bytes, which the earlier pass counted as 1311; the composed set is 1285 `.nbt` and 15 `.mcstructure`). Per folder: `abandoned_camp` 297, `village` 289, `trial_chambers` 171, `bastion` 163 (+5 `.mcstructure` mob markers), `trail_ruins` 84, `mansion` 74, `ancient_city` 58, `ruin` 49, `endcity` 21, `shipwreck` 20, `nether_fossils` 14, `ruined_portal` 13, `coralcrust` 11, `pillageroutpost` 9, `fossils` 8, `igloo` 4, `minecraft/` 10 `.mcstructure` (the sulfur springs placed by `structure_template_feature`).

Every `.nbt` is gzip-compressed big-endian NBT in the Java Edition structure template format: root compound with `size [x,y,z]`, `palette [{Name, Properties}]`, `blocks [{state, pos, nbt?}]`, `entities [{pos, blockPos, nbt}]`, and either `DataVersion` or (igloo, end city) `version: 1` with `author: "Searge"`. DataVersion histogram: 5005 (295 files, abandoned camps), 2531 (162, bastions), 3937 (147, trial chambers), `version 1` (100), 1935 (90), 3442 (84, trail ruins), 1931 (68), 3093 (56), 1469 (48), 1927 (42), 1343 (31), 1932 (30), 1930 (22), 1910 (16), 4062 (14), 2524 (13), 2300 (11), 4055 (8), and 20 more values down to 813. The palettes name blocks with Java identifiers and Java properties: 458 distinct `Name`s and 73 property keys (`facing` 6093, `waterlogged` 4927, `half` 3672, `shape` 2787, `east/south/north/west` 1821 each, `orientation` 1583, `open` 772, `axis` 714, `powered` 693, `type` 618, `part` 574, `occupied` 574, `hinge` 379, `lit` 337, `variant` 332, `snowy` 268, ...), and 28 names are pre-flattening 1.12 Java names (`stonebrick` with `variant`, `planks`, `log2`, `leaves2`, `wooden_slab`, `double_stone_slab`, `wooden_door`, `stained_glass`, `end_bricks`, `grass`, `wool`, `carpet`, `fence`, `sapling`, ...). 5443 blocks carry block entity NBT: `minecraft:jigsaw` 3522, `minecraft:structure_block` 584, `minecraft:chest` 375 (+78 `Chest`, with `LootTable` paths such as `minecraft:chests/abandoned_camp_secret_chest`), `minecraft:barrel` 239, `minecraft:bed` 162, `minecraft:campfire` 126, `minecraft:banner` 72, `minecraft:hopper`, `furnace`, `comparator`, `bell`, `trial_spawner` 14, `lectern`, `sculk_sensor`, `copper_golem_statue` 9, `brewing_stand`, `decorated_pot`, `vault` 2, `creaking_heart`, `mob_spawner`, and old-format ids (`Chest`, `Banner`, `FlowerPot`, `Skull`, `Cauldron`, `EnderChest`, `MobSpawner`, `Structure`). Entities: 238 (`minecraft:cushion` 224 in abandoned camps, `minecraft:villager` 14). Jigsaw block NBT is the Java form (`name`, `target`, `pool`, `final_state`, `joint`, `placement_priority`, `selection_priority`). The 15 `.mcstructure` files are Bedrock's own format: uncompressed little-endian NBT with `format_version 1`, `size`, `structure {block_indices [[...],[...]] (two layers), entities, palette {default {block_palette [{name, states, version}], block_position_data {index: {block_entity_data, tick_queue_data}}}}}`, `structure_world_origin`, using Bedrock names and states (`minecraft:sulfur_spike {dripstone_thickness, hanging}`, block state `version` 18168865 = 1.21.90.1; the bastion markers use 17825804 = 1.16.0.12 with `JigsawBlock` entities). A server that places these templates therefore needs a Java name and property to Bedrock state translation for 458 names, including the 1.12 ones, before it can use 1285 of the 1300 files.

### Jigsaw JSON (1.26.50 grammar)

Docs `docs:worldgenreference/examples/jigsawjigsawstructures`, `.../jigsawstructuresets`, `.../jigsawtemplatepools`, `.../jigsawprocessors`; schemas under `world/1.21.20/`. The BDS files sit in nested archives `__brarchive/worldgen/structure_sets.brarchive`, `__brarchive/worldgen/template_pools/<name>.brarchive` and so on; composed they are `worldgen/structures/` 19 files, `worldgen/structure_sets/` 2, `worldgen/template_pools/` 47, `worldgen/processors/` 3, plus `worldgen/metadata/jigsawstructure_metadata_registry.dat`, a 1 MB binary registry of jigsaw block metadata for the legacy structures (its strings are pool names such as `minecraft:village/plains/streets`, `minecraft:bastion/...`, `minecraft:trial_chambers/...`, `minecraft:ancient_city/...`).

- `minecraft:jigsaw` (`format_version` 1.21.20 or 1.26.50): `description.identifier`, `biome_filters[] {test: has_biome_tag, operator, value}`, `step` (one of 11 ordered steps: `raw_generation`, `lakes`, `local_modifications`, `underground_structures`, `surface_structures`, `strongholds`, `underground_ores`, `underground_decoration`, `fluid_springs`, `vegetal_decoration`, `top_layer_modification`), `terrain_adaptation` (`none`, `bury`, `beard_thin`, `beard_box`, `encapsulate`), `start_pool`, `start_jigsaw_name`, `max_depth`, `start_height {type: constant|uniform, value {absolute|above_bottom|below_top}}`, `heightmap_projection` (`world_surface`, ...), `dimension_padding`, `max_distance_from_center {horizontal 1..128, vertical}`, `pool_aliases`, `liquid_settings` (`apply_waterlogging`, `ignore_waterlogging`). Vanilla: `trail_ruins` (`underground_structures`, `bury`, depth 7, 80/80, start -15 absolute on `world_surface`) and 18 `abandoned_camp_<biome>` (`surface_structures`, `beard_thin`, depth 3, 116/116, start 0, `dimension_padding 10`).
- `minecraft:structure_set`: `placement {type: minecraft:random_spread|minecraft:concentric_rings, salt, separation, spacing, spread_type: linear|triangular}`, `structures [{structure, weight}]`. Vanilla: `trail_ruins` salt 83469867, separation 8, spacing 34; `abandoned_camp` salt 91231127, separation 8, spacing 37 with 18 weight-1 entries.
- `minecraft:template_pool`: `elements [{element {element_type, location, processors, projection: rigid|terrain_matching, feature, elements}, weight}]`, `fallback`. Element types: `single_pool_element`, `legacy_single_pool_element`, `feature_pool_element`, `list_pool_element`, `empty_pool_element`. Vanilla: 7 trail ruins pools, 18 camp pools, 18 tent pools, 22 `abandoned_camp/trees/*` pools that are `feature_pool_element`s pointing at tree features (`minecraft:oak_tree_feature`, ...).
- `minecraft:processor_list`: `processors [{processor_type: minecraft:rule|block_ignore|protected_blocks|capped, rules [{input_predicate, location_predicate, position_predicate, output_state, block_entity_modifier {type: passthrough|append_loot|clear, loot_table}}], blocks, value, limit, delegate}]`; predicates `always_true`, `block_match`, `blockstate_match`, `random_block_match`, `random_blockstate_match`, `tag_match`, `axis_aligned_linear_pos`. Vanilla: the three trail ruins archaeology lists (`capped` limit 2 or more over a `rule` that turns `gravel` into `suspicious_gravel` with `append_loot`).

The docs: "Currently only Trail Ruins can be modified via JSON with the Data-Driven Jigsaw Structure Experimental Toggle turned on. Other Jigsaw Structures such as Villages and Bastions use a legacy version of the Jigsaw Structure System and cannot be modified via JSON." `mojang-features.json` lists the 25 locatable structures: the 8 abandoned camp variants, `ancient_city`, `bastion_remnant`, `buried_treasure`, `end_city`, `fortress`, `mansion`, `mineshaft`, `monument`, `pillager_outpost`, `ruined_portal`, `ruins`, `shipwreck`, `stronghold`, `temple` (desert temple, jungle temple, witch hut and igloo share this id), `trail_ruins`, `trial_chambers`, `village`.

| Structure | JSON | Templates in zip | Assembly |
|---|---|---|---|
| trail ruins, abandoned camps | jigsaw JSON | 84, 297 | data-driven jigsaw |
| village, bastion, ancient city, trial chambers, pillager outpost | none | 289, 163, 58, 171, 9 | legacy jigsaw, engine, metadata in the `.dat` |
| mansion, end city, shipwreck, underwater ruins, ruined portal, igloo, fossils, nether fossils, coral crust | none | 74, 21, 20, 49, 13, 4, 8, 14, 11 | engine piece assembly over templates |
| stronghold, mineshaft, monument, fortress, desert temple, jungle temple, witch hut, buried treasure, geodes (a feature), dungeons | none | none | procedural engine code |

## 8. Voxel shapes

Grammar (`docs:voxelshapesreference/examples/voxelshapescomponents/voxel_shape_document`, schema `voxel_shapes/1.21.110/`): `{"format_version": "1.21.110", "minecraft:voxel_shape": {"description": {"identifier"}, "shape": {"boxes": [{"min": [x,y,z], "max": [x,y,z]}]}}}` in sixteenths of a block. The 218 files (MCB in BDS, JSON in the samples) are: 162 `wall_*` combinations (`wall_east_<low|tall>_north_..._up_...`), 19 `box_16x<h>x16` slabs of height 1 to 15, 7 `cake_bites_*`, 8 `composter*`, 4 `bell_attachment_*`, 4 `piglin_wall_head_facing_*`, 4 `shelf_facing_*`, 3 `big_dripleaf*`, 2 `fence_gate*_occlusion`, and `anvil`, `cactus`, `candle_cake`, `chest_type_single`, `end_portal_frame_eye`, `fence`, `grindstone`, `heavy_core`, `lectern`, `slab_type_top`. Only one component references them: `minecraft:geometry.culling_shape` ("Currently only available with the VoxelShape experiment on", default `minecraft:empty`), and the BDS pack `experimental_vanilla_shapes` ("Experimental Vanilla Voxel Shapes", `min_engine_version 1.21.0`) contains only a manifest. So the shapes folder is the face-culling shape library for the client, not a collision source.

`packages/bedrock-data/src/resources/voxel_shapes.json` is CloudburstMC's capture of the engine's shape registry: `names` maps 220 identifiers (the 218 plus `minecraft:empty` 0 and `minecraft:unit_cube` 1) to indices into `shapes`, a 287-entry list of voxelized cells (`{cells {xSize, ySize, zSize, storage[]}, xCoordinates[], yCoordinates[], zCoordinates[]}`); 67 shapes are unnamed. The dump's per-state `geometry.collision.boxes` is independent of this registry and already expanded to boxes, so collision for every one of the 22091 states is available from `blocks.json` alone, and the shapes are only needed if the server wants vanilla's culling identifiers.

## 9. Implications for a block and item component runtime

### Components the runtime must implement

Blocks, to load the 98 vanilla files and author definitions for the rest: `destructible_by_mining` (with `item_specific_speeds`), `destructible_by_explosion`, `loot`, `map_color`, `redstone_conductivity`, `tags`, `destruction_particles` (pass-through), `liquid_detection`, `flammable`, `instrument_sound`, `chest_obstruction`, `support`, `collision_box`, `selection_box`, `connection_rule`, `geometry` and `material_instances` (pass-through to the client), `movable`, `precipitation_interactions`, `replaceable`, `friction`, `light_emission`, `light_dampening`, `placement_filter`, `transformation`, `tick`, `entity_fall_on`, `block_entity`, `redstone_producer`, `redstone_consumer`, `crafting_table`, `display_name`, plus the four traits and `permutations` with `query.block_state`. That is 31 components, of which 12 are per-state numbers the dump supplies for every block. Items: the 44 documented components, of which the engine-defined families above need about 30 (`damage`, `durability`, `repairable`, `enchantable`, `digger`, `wearable`, `damage_absorption`, `dyeable`, `shooter`, `projectile`, `throwable`, `entity_placer`, `block_placer`, `food`, `use_modifiers`, `use_animation`, `cooldown`, `fuel`, `compostable`, `record`, `tags`, `max_stack_size`, `stacked_by_data`, `rarity`, `glint`, `hand_equipped`, `allow_off_hand`, `liquid_clipped`, `fire_resistant`, `storage_item` family, `bundle_interaction`, `kinetic_weapon`, `piercing_weapon`), plus the legacy `use_duration`, `seed`, `max_damage`, `foil` keys the 1.10 files carry.

### Behaviors no component expresses

Each line is one named behavior class the runtime would key by archetype, tag or name. The count beside each family is the number of `mojang-blocks.json` names it covers (script `block-families.mjs`; 1463 total).

| Behavior family | Blocks | Notes |
|---|---|---|
| plain full cubes (no behavior beyond the components) | 131 default bucket + 97 wool, carpet, concrete, terracotta, glazed + 36 glass and panes + 51 logs, wood, stems, hyphae + 14 planks + 21 ores and raw blocks + 2 huge mushroom blocks = 352 | panes and bars need the connection behavior; concrete powder falls and hydrates; logs strip; glazed terracotta is immovable |
| slabs | 202 | archetype `slab_block` (64 in JSON) |
| stairs | 97 | archetype `stair_block` (32 in JSON) |
| walls | 32 | connection states |
| fences | 14 | connection states |
| fence gates | 13 | |
| doors | 22 | two-block, hinge, redstone |
| trapdoors | 22 | |
| buttons | 15 | timed signal |
| levers | 1 | |
| pressure plates | 17 | weighted and plain |
| redstone wire | 1 | |
| repeaters and comparators | 4 | |
| pistons and arm collision | 4 | |
| observer, dropper, dispenser | 3 | |
| rails | 4 | |
| redstone machines (note block, jukebox, hopper, crafter, target, daylight detectors, tripwire and hook, sculk sensors, lightning rods, copper bulbs, bell, lectern, trapped chest, TNT, copper golem statues, copper torch, redstone torch and block and lamp) | 29 | each a distinct class |
| crops and stems (wheat, carrots, potatoes, beetroot, melon and pumpkin stems, cocoa, nether wart, sweet berry bush, cave vines, torchflower crop, pitcher crop and plant) | 15 | |
| saplings, azalea, propagule, bamboo sapling | 13 | sapling growth invokes the unreachable `*_from_sapling` features |
| leaves | 14 | decay, persistence |
| flowers, mushrooms, fungi, roots, grass, ferns, petals, lily pad, eyeblossoms, red shrub, shelf mushroom | 35 | placement filter plus bone meal and spread |
| liquids | 4 | flow, mixing |
| fire, soul fire, portals, end portal and frame | 5 | |
| beds, straw bed | 2 | |
| chests, ender chest, barrel, shulker boxes, copper chests | 28 | container block entities |
| furnaces, smoker, blast furnace, campfires, brewing stand | 9 | |
| signs (standing, wall, hanging) | 39 | |
| banners | 2 | |
| heads and skulls | 7 | |
| cauldron | 1 | fill levels and liquids |
| composter | 1 | |
| candles and candle cakes, cake | 17 + 18 | |
| flower pot | 1 | |
| vines, climbing and spreading (vine, weeping and twisting vines, ladder, scaffolding, chains, glow lichen, sculk vein, resin clump, hanging roots, pale hanging moss, leaf litter, wildflowers) | 13 | |
| lanterns and torches | 14 | |
| snow layer, snow, ice family, powder snow | 7 | |
| soils (farmland, grass block, dirt path, dirts, podzol, mycelium, mud, moss, nylium, soul sand and soil, clay, gravel, sand, suspicious blocks) | 22 | gravity, spread, trampling, brushing |
| sculk, catalyst, shrieker | 3 | |
| copper oxidation (blocks, cut, grates, bulbs, doors, trapdoors, bars, chains, chests, lanterns, golem statues, lightning rods, waxed variants) | 58 | shared oxidation plus the member's own behavior |
| bamboo, chorus, kelp, seagrass, coral, sea pickle | 46 | |
| turtle egg, sniffer egg, dragon egg, frogspawn | 4 | |
| dripstone and amethyst | 8 | |
| spore blossom, big dripleaf, moss carpets | 4 | |
| utility blocks (anvils, grindstone, enchanting table, crafting and job site tables, loom, stonecutter, beacon, conduit, respawn anchor, lodestone, end rod, decorated pot, trial spawner, vault, mob spawner, heavy core, bee nest and hive, sponge, creaking heart, shelves, honey, slime, magma, cactus and cactus flower, bushes, dry grass, item frames) | 50 | roughly 30 distinct classes |
| air, barrier, light, command and structure blocks, bedrock, moving block, chemistry (120 elements, 34 hard glass, 4 colored torches), deprecated | 192 | mostly inert |

That is about 60 behavior families for blocks, around 100 distinct classes once the machine and utility buckets are split, over 1463 names; 352 names need no class, and the archetype mechanism Mojang already uses for 98 of them (`slab_block`, `stair_block`, `bush_block`, `wall_foliage_block`) is the pattern to extend. For items the equivalent list is the 30 behaviors in section 3. The 26.x additions visible in `mojang-blocks.json` (263 names matched by pattern: the 98 wool and concrete stairs and slabs, 50 copper family members with bars, chains, chests, lanterns, golem statues, lightning rods and their waxed and oxidized forms, 14 shelves, sulfur and cinnabar sets with `potent_sulfur` and `sulfur_spike`, poplar and pale oak wood sets, `straw_bed`, `red_shrub`, `shelf_mushroom`, `golden_dandelion`, `dried_ghast`, `creaking_heart`, `resin_*`, `firefly_bush`, `cactus_flower`, `leaf_litter`, `wildflowers`, `short_dry_grass`, `tall_dry_grass`, `bush`, eyeblossoms) fall into the families above except `potent_sulfur` (a ticking block entity) and the copper golem statue.

## Open questions

- `internal_vanilla_data` and `block_archetype` remain undocumented; the engine's parameters for `wall_foliage_block` (`size_count`, `bounciness`, `fall_damage_multiplier`) and the item tags `minecraft:sulfur_cube_archetype_*` hint at more archetypes than the four in the files.
- The 1.10 item keys `food.effects`, `food.on_use_action`, `seed`, `foil`, `max_damage`, `use_duration` are absent from the 1.26.30 schema; whether current BDS still honors them for custom items is not verified, and vanilla keeps them only in files that have not been rewritten.
- The captured palette has 22079 states and the CloudburstMC dump 22091; which 12 states differ was not determined.
- The `\x7fMCB` layout is still undecoded; the catalog's category and group counts above come from a string walk and the per-category item counts are approximate.
- The 87 engine-only feature identifiers and the 88 unreachable sapling and bone meal features define the surface of vanilla decoration the JSON cannot reproduce; whether BDS lets a pack override an engine feature by name (the docs say the highest pack wins by identifier) was not tested.
- Whether the engine still reads the root `definitions/feature_rules` when a pack rule of the same identifier exists (94 of 120 are shadowed) was not tested; the 26 root-only rules include the nether and the overworld cave carver, so at least those are live.
- The Java-to-Bedrock block translation the engine applies to 458 Java names in the templates, including 1.12 `variant` properties, is engine code with no published table.
- The `experimental_vanilla_shapes` pack is empty in the server zip; the client's copy may carry the block files that reference `culling_shape`.

## Reproduction

```
# Compose layers (loose files and __brarchive members, later layers win) and the nested worldgen archives
node /tmp/bds-research-blocks/tools/compose.mjs /tmp/bds-research/bds/extracted/behavior_packs /tmp/bds-research-blocks/composed \
  blocks items recipes biomes features feature_rules structures worldgen shapes item_catalog spawn_rules
node /tmp/bds-research-blocks/tools/compose-nested.mjs /tmp/bds-research/bds/extracted/behavior_packs /tmp/bds-research-blocks/composed worldgen
cp -R /tmp/bds-research/bds/extracted/definitions/{features,feature_rules} /tmp/bds-research-blocks/composed/definitions/
# Samples and docs
curl -sS -L -A "Mozilla/5.0" -o bedrock-samples-v1.26.50.4-min.zip \
  https://github.com/Mojang/bedrock-samples/releases/download/v1.26.50.4/bedrock-samples-v1.26.50.4-min.zip
unzip -q bedrock-samples-v1.26.50.4-min.zip -d /tmp/bds-research-blocks/samples/unpacked
git clone --depth 1 https://github.com/MicrosoftDocs/minecraft-creator /tmp/bds-research-blocks/docs/minecraft-creator   # 4432fb62
# Tallies (tally.mjs strips // comments and trailing commas)
node tally.mjs components <dir>; node tally.mjs "path:minecraft:block.description.internal_vanilla_data.block_archetype" composed/blocks
node feature-params.mjs composed/features composed/definitions/features      # per-type keys and Molang
node biome-filters.mjs composed/feature_rules composed/definitions/feature_rules; node biome-filters.mjs composed/spawn_rules
node biome-table.mjs composed/biomes; node recipe-shapes.mjs composed/recipes; node distribution-forms.mjs composed/feature_rules
node palette-compare2.mjs samples/.../mojang-blocks.json packages/minecraft/datagen/snapshot/v2193/block-palette.json
node cloudburst.mjs packages/bedrock-data/src/resources/blocks.json minecraft:stone minecraft:water minecraft:oak_leaves minecraft:redstone_wire
node item-families.mjs mojang-items.json mojang-blocks.json samples/behavior_pack/items; node item-usage.mjs samples/behavior_pack/items
node block-families.mjs mojang-blocks.json
node nbt-palette.mjs composed/structures/igloo/igloo_middle.nbt; node nbt-palette.mjs composed/structures/minecraft/sulfur_spring_small_1.mcstructure little
node template-stats.mjs composed/structures; node mcb-strings.mjs composed/item_catalog/crafting_item_catalog.json
```
