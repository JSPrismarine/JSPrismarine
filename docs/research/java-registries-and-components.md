# How much of a game can Java Edition's registries and components describe without code?

Researched 2026-10-24 against the Java Edition 26.3 server jar (sha1 `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`), its data generator, its deobfuscated class files, a live 26.3 server observed over the wire, the 1.20.5 and 1.21.5 jars for dating, Mojang's changelogs on minecraft.net, the piston-meta manifest, minecraft.wiki, and misode/mcmeta's per-version data tags. [java-datapacks.md](java-datapacks.md) covers the pack format, the generator invocation and the Bedrock comparison; this note goes deeper on the registry and component model and does not repeat those. [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) covers terrain, surface rules, features and structure placement against Bedrock; section 5 here only adds what that note lacks.

## Summary

1. 26.3 has 60 datapack element registries plus `function` and `structure`. Mojang's own code splits them three ways: `RegistryDataLoader.WORLD_REGISTRIES` has 51, `DIMENSION_REGISTRIES` has 1 (`dimension`), and `RELOADABLE_REGISTRIES` has 8 (`loot_table`, `predicate`, `item_modifier`, `slot_source`, `context_int_provider`, `context_float_provider`, `advancement`, `recipe`). Only those 8 plus tags and functions respond to `/reload`. The other 52 need a world reload.
2. 32 of the 60 go to the client in the configuration phase. A probe client connected to a real 26.3 server received exactly 32 `minecraft:registry_data` packets, in the same order as the `SYNCHRONIZED_REGISTRIES` field in the jar, plus one `minecraft:update_tags` packet covering 15 tag registries. Replying "I know `minecraft:core` 26.3" to `select_known_packs` cut the registry payload from 157839 bytes to 9975 bytes.
3. Element registry growth is fast. 1.21.5 had 41 element registries, 26.3 has 60. Nineteen arrived in four releases: `dialog` (1.21.6); `timeline` and `zombie_nautilus_variant` (1.21.11); `world_clock`, `villager_trade`, `trade_set` and four sound variants (26.1); `sulfur_cube_archetype` (26.2); `block_transformer`, `context_int_provider`, `context_float_provider`, `decorated_pot_pattern`, `slot_source`, `worldgen/block_state_provider`, `worldgen/material_rule` and `worldgen/material_condition` (26.3).
4. The item component registry went from 56 types in 1.20.5 to 96 in 1.21.5 to 122 in 26.3. 69 of the 122 appear as defaults on at least one of the 1658 items; 13 appear on all 1658. The other 53 exist only on individual stacks. No datapack can add an item or change an item's defaults, so components describe per-stack state and a fixed slice of behavior, not item identity.
5. Items keep 70 behavior classes in code (`net/minecraft/world/item/*Item.class`, which is `Item` plus 69 subclasses). Components cover food, tools, weapons, armor, shields, gliders, totems, spears, fuel, compost and block transformation; buckets, bows, crossbows, compasses, maps, leads, name tags, spyglasses, bone meal and fireworks still need their class.
6. The loot grammar is 42 modifier types, 20 condition types and 9 entry types; vanilla uses 19, 13 and 6 of them across 1447 tables and 1589 pools. 26.3 made every predicate, item modifier, loot table, recipe, advancement, slot source and context provider field accept an inline value, a namespaced id, a list, or a tag, which is the clearest composition rule in the format. Vanilla block loot already uses it: 214 references to `minecraft:tool/can_silk_touch` and `minecraft:tool/can_shear`.
7. Enchantments are 43 files over 31 effect component types (30 used), 6 value effect types, 6 level based value types, 16 location based effect types and 15 entity effect types. Enchantment behavior is not contained in the enchantment file: `fortune.json` has no `effects` at all and works through the 32 `apply_bonus` and 35 `table_bonus` calls in the block loot tables and through 15 functionality tags.
8. Recipes are 2042 files over 22 serializers; 8 of the 22 are `crafting_special_*` stubs whose logic is code. Advancements are 1866 files with 4045 criteria over 54 of the 58 trigger types; 1739 of them exist only to unlock a recipe. Tags are 883 files over 20 registries.
9. Datapack format churn is continuous. The data pack version went 41 (1.20.5), 48 (1.21), 57 (1.21.2), 61 (1.21.4), 71 (1.21.5), 80 (1.21.6), 81 (1.21.7), 88.0 (1.21.9), 94.1 (1.21.11), 101.1 (26.1), 107.1 (26.2), 121.0 (26.3). 1.21 renamed 13 datapack directories at once; 26.3 renamed `functions` to `modifier`, `conditions` to `condition`, `function` to `type`, `condition` to `type`, `surface_rule` to `material_rule`, `configured_feature` to `feature`, `configured_carver` to `carver`, and the block state keys `Name` and `Properties` to `id` and `properties`.
10. The boundary is sharp. No datapack can add a block, an item, an entity type, a fluid, a mob effect, a particle, a block entity, a sound event, an attribute, a game rule, a command or any `*_type` implementation. 95 of the 155 registries in `reports/datapack.json` are `elements: false`. Block properties (hardness, resistance, friction, light, collision) have never appeared in any Mojang report.

## 1. Every datapack-loadable registry in 26.3

### How the list was obtained

`reports/datapack.json` from the data generator lists all 155 registries with `elements`, `tags` and `stable` flags, plus two "others" (`function` as `mcfunction`, `structure` as `structure`). 60 registries have `elements: true` and 95 have `elements: false`. The folder path for each comes from the string constants in `net/minecraft/core/registries/Registries.class` (157 `createRegistryKey` calls). The load class comes from the four static fields of `net/minecraft/resources/RegistryDataLoader.class`, read with `javap -c`:

```
WORLD_REGISTRIES        51 entries
DIMENSION_REGISTRIES     1 entry  (LEVEL_STEM, folder "dimension")
RELOADABLE_REGISTRIES    8 entries
SYNCHRONIZED_REGISTRIES 32 entries
```

`net/minecraft/server/ReloadableServerRegistries.class` reads `RegistryDataLoader.RELOADABLE_REGISTRIES`, and `MinecraftServer.reloadResources` is the method `/reload` calls, so the eight reloadable registries are exactly the ones `/reload` re-reads. The 32 synchronized registries were confirmed independently by connecting a probe client to a running 26.3 server (section 6).

The generator's own provider split agrees. Its `.cache/` directory holds one file per provider whose first line names the provider and whose remaining lines list every file it wrote. `vanilla/Registries for world` wrote 1995 files and `vanilla/Registries for reloadable` wrote 5388.

### The 60 element registries

"Synced" means the registry is in `SYNCHRONIZED_REGISTRIES` and the server sends it in the configuration phase. "Reload" is `/reload` for the eight reloadable registries and "world" for the rest, which need the world to be reloaded. Counts are `*.json` files under `data/minecraft/<folder>/` in the generator output, recursive.

| Folder | Load | Synced | Vanilla files | Data-driven since |
|---|---|---|---|---|
| `advancement` | reloadable | no | 1866 | 1.14 or earlier, as `advancements` |
| `banner_pattern` | world | yes | 43 | 1.20.5 |
| `block_transformer` | world | yes | 3 | 26.3 |
| `cat_sound_variant` | world | yes | 2 | 26.1 |
| `cat_variant` | world | yes | 11 | 1.21.5 |
| `chat_type` | world | yes | 7 | 1.19 |
| `chicken_sound_variant` | world | yes | 2 | 26.1 |
| `chicken_variant` | world | yes | 3 | 1.21.5 |
| `context_float_provider` | reloadable | no | 4 | 26.3 |
| `context_int_provider` | reloadable | no | 26 | 26.3 |
| `cow_sound_variant` | world | yes | 2 | 26.1 |
| `cow_variant` | world | yes | 3 | 1.21.5 |
| `damage_type` | world | yes | 51 | 1.19.4 |
| `decorated_pot_pattern` | world | yes | 23 | 26.3 (registry existed earlier, `elements: false`) |
| `dialog` | world | yes | 3 | 1.21.6 |
| `dimension` | dimension | no | 0 | 1.16.2 |
| `dimension_type` | world | yes | 4 | 1.16.2 |
| `enchantment` | world | yes | 43 | 1.21 |
| `enchantment_provider` | world | no | 7 | 1.21 |
| `frog_variant` | world | yes | 3 | 1.21.5 |
| `instrument` | world | yes | 8 | 1.21.2 |
| `item_modifier` | reloadable | no | 0 | 1.17 (20w46a) |
| `jukebox_song` | world | yes | 22 | 1.21 |
| `loot_table` | reloadable | no | 1447 | 1.14 or earlier, as `loot_tables` |
| `painting_variant` | world | yes | 51 | 1.21 |
| `pig_sound_variant` | world | yes | 3 | 26.1 |
| `pig_variant` | world | yes | 3 | 1.21.5 |
| `predicate` | reloadable | no | 3 | 1.15 (19w38a); first vanilla files in 26.3 |
| `recipe` | reloadable | no | 2042 | 1.14 or earlier, as `recipes` |
| `slot_source` | reloadable | no | 0 | 26.3 |
| `sulfur_cube_archetype` | world | yes | 12 | 26.2 |
| `test_environment` | world | yes | 1 | 1.21.5 |
| `test_instance` | world | yes | 1 | 1.21.5 |
| `timeline` | world | yes | 4 | 1.21.11 |
| `trade_set` | world | no | 68 | 26.1 |
| `trial_spawner` | world | no | 28 | 1.21.2 |
| `trim_material` | world | yes | 11 | 1.20 |
| `trim_pattern` | world | yes | 18 | 1.20 |
| `villager_trade` | world | no | 391 | 26.1 |
| `wolf_sound_variant` | world | yes | 7 | 1.21.5 |
| `wolf_variant` | world | yes | 9 | 1.20.5 |
| `world_clock` | world | yes | 2 | 26.1 |
| `worldgen/biome` | world | yes | 67 | 1.16.2 |
| `worldgen/block_state_provider` | world | yes | 8 | 26.3 |
| `worldgen/carver` | world | no | 4 | 1.16.2 as `configured_carver`, renamed 26.3 |
| `worldgen/density_function` | world | no | 55 | 1.18 |
| `worldgen/feature` | world | no | 240 | 1.16.2 as `configured_feature`, renamed 26.3 |
| `worldgen/flat_level_generator_preset` | world | no | 9 | 1.19 |
| `worldgen/material_condition` | world | no | 8 | 26.3 |
| `worldgen/material_rule` | world | no | 42 | 26.3 |
| `worldgen/multi_noise_biome_source_parameter_list` | world | no | 2 | 1.19.4 |
| `worldgen/noise` | world | no | 64 | 1.18 |
| `worldgen/noise_settings` | world | no | 7 | 1.16.2 |
| `worldgen/placed_feature` | world | no | 273 | 1.18 |
| `worldgen/processor_list` | world | no | 40 | 1.16.2 |
| `worldgen/structure` | world | no | 52 | 1.16.2 as `configured_structure_feature`, renamed 1.19 |
| `worldgen/structure_set` | world | no | 21 | 1.18 |
| `worldgen/template_pool` | world | no | 245 | 1.16.2 |
| `worldgen/world_preset` | world | no | 7 | 1.19 |
| `zombie_nautilus_variant` | world | yes | 2 | 1.21.11 |

Total: 7383 JSON files across the 60 element registries. The two non-JSON formats add 1511 `.nbt` files under `data/minecraft/structure/` and zero `.mcfunction` files; vanilla ships no functions. Functions reload with `/reload`: `net/minecraft/server/ReloadableServerResources.class` holds a `ServerFunctionLibrary` field alongside the `RecipeManager`, the `ServerAdvancementManager`, the `ReloadableServerRegistries$Holder` and the postponed tags. Structures load on demand from the resource manager and are listed in `reports/datapack.json` under `others` with `tags: false`.

The "data-driven since" column comes from misode/mcmeta's per-version `-data` tags. Listing `data/minecraft/` at each tag shows the release in which each folder first carried vanilla content. Registries that ship no vanilla files (`dimension`, `item_modifier`, `slot_source`) are dated from the 1.21 directory rename list, the minecraft.wiki history tables, and the 26.3 changelog. `predicate` is a special case: the registry has existed since 1.15 (19w38a, per minecraft.wiki's Predicate history) but vanilla shipped no predicate files until 26.3, whose changelog says "New entries added to the previously empty `minecraft:predicate`".

### Which of these the client needs

Of the 32 synced registries, 19 are mob and object variants (`cat_variant`, `cat_sound_variant`, `chicken_variant`, `chicken_sound_variant`, `cow_variant`, `cow_sound_variant`, `frog_variant`, `pig_variant`, `pig_sound_variant`, `wolf_variant`, `wolf_sound_variant`, `zombie_nautilus_variant`, `sulfur_cube_archetype`, `painting_variant`, `banner_pattern`, `decorated_pot_pattern`, `trim_pattern`, `trim_material`, `jukebox_song`), 5 are presentation (`chat_type`, `dialog`, `instrument`, `timeline`, `world_clock`), and the rest are `worldgen/biome`, `dimension_type`, `damage_type`, `enchantment`, `block_transformer`, `worldgen/block_state_provider`, `test_environment` and `test_instance`.

The 28 registries that stay server-side include all of worldgen except biomes and block state providers, plus `enchantment_provider`, `villager_trade`, `trade_set`, `trial_spawner`, `dimension` and all eight reloadable registries. Recipes and advancements reach the client through play-phase packets instead (`minecraft:update_recipes`, `minecraft:update_advancements` in `reports/packets.json`).

### The 95 registries a datapack can only tag

`reports/datapack.json` marks 95 registries `elements: false`. They are the code-defined content registries (`block` 1286, `item` 1658, `entity_type` 161, `block_entity_type` 49, `fluid` 5, `mob_effect` 40, `potion` 46, `particle_type` 128, `sound_event` 1991, `attribute` 40, `game_rule` 59, `game_event` 61, `point_of_interest_type` 21, `villager_profession` 15, `villager_type` 7, `creative_mode_tab` 14, `menu` 25, `map_decoration_type` 40, `custom_stat` 78, `environment_attribute` 51) plus the AI registries (`activity` 26, `memory_module_type` 115, `sensor_type` 24) plus every `*_type` registry that names an implementation a JSON file may reference. Entry counts are from `reports/registries.json`, which has 95 registries.

20 registries carry vanilla tag files, 883 in total: `block` 300, `item` 236, `worldgen/biome` 86, `villager_trade` 73, `entity_type` 49, `damage_type` 36, `worldgen/structure` 33, `enchantment` 22, `banner_pattern` 11, `fluid` 10, `game_event` 5, `potion` 5, `timeline` 4, `instrument` 3, `point_of_interest_type` 3, `dialog` 2, `worldgen/world_preset` 2, `painting_variant` 1, `worldgen/feature` 1, `worldgen/flat_level_generator_preset` 1.

## 2. The item data component system

### What 1.20.5 changed and what it did not

The 1.20.5 changelog says: "We have made some large changes to how Item Stack-specific properties are stored and represented in this release, replacing the current NBT 'tag' with structured 'components'", "Unstructured NBT data attached to stacks of items (`tag` field) has been replaced with structured 'components'. This data is parsed and validated when the item is loaded", and "Item types (e.g. `minecraft:stick`) hold a set of default components on an item that individual item stacks can override".

The item registry stayed code. `minecraft:item` is `elements: false` in `reports/datapack.json`, and there is no item folder in `data/minecraft/`. A datapack can give an existing item new components through recipes, loot and commands; it cannot create an item id, and it cannot change the defaults an item id carries.

### Growth of the registry

`minecraft:data_component_type` in `reports/registries.json`, same generator command run against three jars:

| Version | Component types | Item ids | Block ids |
|---|---|---|---|
| 1.20.5 (sha1 `79493072f65e17243fd36a699c9a96b4381feb91`) | 56 | 1330 | 1060 |
| 1.21.5 (sha1 `e6ec2f64e6080b9b5d9b471b291c33cc7f509733`) | 96 | 1396 | 1104 |
| 26.3 (sha1 `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`) | 122 | 1658 | 1286 |

The additions per release, from the named changelog on minecraft.net:

- 1.21.2: `consumable`, `use_remainder`, `use_cooldown`, `enchantable`, `repairable`, `equippable`, `glider`, `tooltip_style`, `death_protection`, `item_model`. `food` became "a data container which only holds the food stats" and `fire_resistant` became `damage_resistant` with a `types` field.
- 1.21.5: `weapon`, `blocks_attacks`, `break_sound`, `provides_banner_patterns`, `provides_trim_material`, `tooltip_display`, `potion_duration_scale`.
- 1.21.11: `use_effects`, `minimum_attack_charge`, `attack_range`, `kinetic_weapon`, `piercing_weapon`.
- 26.2: `sulfur_cube_content`.
- 26.3: `cooking_fuel`, `brewing_fuel`, `block_transformer`, `compostable`, `villager_food`, `mob_visibility`, `provides_pottery_pattern`, `sign_text_front`, `sign_text_back`, `waxed`, `cushion/color`, `attack_animation`, `interact_animation`. 26.3 removed `map_color` and split `swing_animation` into `attack_animation` and `interact_animation` (minecraft.wiki Data component format history).

minecraft.wiki's "Data component format" page lists exactly the same 122 ids as the registry, plus the two removed ones.

### Default components per item

`--reports` writes one file per item under `reports/minecraft/components/item/` (1658 files in 26.3). Before 26.1 it wrote a single `reports/items.json`; the 26.1 changelog says "The report generator for item components has been renamed to 'Default Components' and now outputs one file for each element that has default components". The shape also changed: 1.20.5's `items.json` entry for apple is `{"components": [{"type": "minecraft:max_stack_size", "value": 64}, ...]}`, a list of tagged pairs; 26.3's `apple.json` is `{"components": {"minecraft:max_stack_size": 64, ...}}`, a map.

Across the 1658 files, 69 of the 122 component types appear as a default. Thirteen appear on every item: `attack_animation`, `attribute_modifiers`, `break_sound`, `enchantments`, `interact_animation`, `item_model`, `item_name`, `lore`, `max_stack_size`, `rarity`, `repair_cost`, `tooltip_display`, `use_effects`. The next most common are `cooking_fuel` (347 items), `compostable` (122), `entity_data` (88, the spawn eggs), `equippable` and `damage` and `max_damage` (84 each), `enchantable` (77), `repairable` (75), `container` (45), `food` and `weapon` (44 each), `consumable` (43), `tool` (38).

The 53 types that are never a default exist only on individual stacks: `additional_trade_cost`, `base_color`, `block_entity_data`, `can_break`, `can_place_on`, `container_loot`, `creative_slot_lock`, `custom_data`, `custom_model_data`, `custom_name`, `dyed_color`, `firework_explosion`, `intangible_projectile`, `lock`, `lodestone_tracker`, `map_id`, `map_post_processing`, `note_block_sound`, `profile`, `sulfur_cube_content`, `tooltip_style`, `trim`, `unbreakable`, `waxed`, `written_book_content`, and 28 entity variant components (`axolotl/variant`, `cat/variant`, `cat/collar`, `cat/sound_variant`, `chicken/sound_variant`, `cow/variant`, `cow/sound_variant`, `fox/variant`, `frog/variant`, `horse/variant`, `llama/variant`, `mooshroom/variant`, `painting/variant`, `parrot/variant`, `pig/variant`, `pig/sound_variant`, `rabbit/variant`, `salmon/size`, `sheep/color`, `shulker/color`, `tropical_fish/base_color`, `tropical_fish/pattern`, `tropical_fish/pattern_color`, `villager/variant`, `wolf/variant`, `wolf/collar`, `wolf/sound_variant`, `zombie_nautilus/variant`).

Two verbatim examples from the report. `diamond_pickaxe.json` carries `attribute_modifiers` (two entries), `damage 0`, `enchantable {value: 10}`, `max_damage 1561`, `max_stack_size 1`, `repairable {items: "#minecraft:diamond_tool_materials"}`, `tool` with two rules, and `weapon {item_damage_per_attack: 2}`. `copper_spear.json` is the only item that exercises `attack_range` (`{hitbox_margin: 0.125, max_creative_reach: 6.5, max_reach: 4.5, min_creative_reach: 2.0, min_reach: 2.0, mob_factor: 0.5}`), `kinetic_weapon`, `piercing_weapon`, `minimum_attack_charge 1.0` and `damage_type "minecraft:spear"` together.

26.3's `cooking_fuel` shows the indirection the format moved toward. `acacia_boat.json` has `{"burn_time": "minecraft:cooking/time_boats", "speed_multiplier": "minecraft:cooking/speed_default"}`, and `context_int_provider/cooking/time_boats.json` is:

```json
{"type": "minecraft:div", "left": 1200,
 "right": {"type": "minecraft:conditional", "condition": "minecraft:block/fast_cooking",
           "on_false": "minecraft:cooking/normal_burn_time_reduction_factor",
           "on_true": "minecraft:cooking/fast_burn_time_reduction_factor"}}
```

`predicate/block/fast_cooking.json` is `{"type": "minecraft:match_block", "blocks": ["minecraft:smoker", "minecraft:blast_furnace"]}`. A fuel value is therefore a tree of three registry lookups, each a separately overridable file.

### Where components are set

Four places, all verified in vanilla data:

- Commands. `reports/commands.json` gives `/give <targets> <item> [count]` where `item` has parser `minecraft:item_stack`. minecraft.wiki's Data component format page documents the syntax as `item_id[component1=value,component2=value]` with SNBT values and `item_id[!component]` to remove a default.
- Recipes. A `result` is `{"id": ..., "count": ..., "components": {...}}`. 296 vanilla recipes use it: 279 `minecraft:brewing` and 17 `minecraft:crafting_shapeless`. `recipe/suspicious_stew_from_blue_orchid.json` sets `minecraft:suspicious_stew_effects`; `recipe/brewing/lingering_potion_awkward_blaze_powder.json` sets `minecraft:potion_contents`.
- Loot. The `minecraft:set_components` and `minecraft:copy_components` modifiers are in `loot_function_type`; vanilla uses `copy_components` 71 times and `set_components` zero times. Component-specific modifiers exist too: `set_potion`, `set_banner_pattern`, `set_instrument`, `set_fireworks`, `set_book_cover`, `set_written_book_pages`, `set_writable_book_pages`, `set_custom_model_data`, `toggle_tooltips`, `set_ominous_bottle_amplifier`.
- Villager trades. `villager_trade/*.json` (391 files) describe `wants` and `gives` as item stacks, so they carry components the same way.

### How much item behavior is data

Components cover the whole of food (`food`, `consumable`, `use_remainder`, `use_cooldown` with five `consume_effect_type`s), tools (`tool` rules against block tags, `repairable`, `enchantable`, `damage`, `max_damage`), melee weapons (`weapon`, `attribute_modifiers`, `damage_type`, `minimum_attack_charge`, `attack_range`, `piercing_weapon`, `kinetic_weapon`), armor (`equippable` with `allowed_entities`, `asset_id`, `can_be_sheared`), shields (`blocks_attacks` with `block_delay_seconds`, `bypassed_by`, `damage_reductions`), gliders (`glider`), totems (`death_protection`), fuel (`cooking_fuel`, `brewing_fuel`), compost (`compostable`), block transformation (`block_transformer`), and villager feeding (`villager_food`).

They do not cover the rest. The jar has 70 classes matching `net/minecraft/world/item/*Item.class`, and minecraft.wiki's "Hardcoded item properties (Java Edition)" page documents them method by method. From the 26.3 report, these items carry no component beyond the thirteen universal ones, so everything they do is their class: `bucket`, `water_bucket`, `spyglass`, `bone_meal`, `lead`, `name_tag`, `snowball`, `compass`, `map`, `ender_eye`, `minecart`, `armor_stand`, `painting`, `item_frame`, `torch`. `bow` adds only `cooking_fuel`, `damage 0`, `enchantable {value: 1}` and `max_damage 384`, and `crossbow` adds the same four plus an empty `charged_projectiles`; the draw, the charge and the projectile are `BowItem` and `CrossbowItem`. `egg` adds only `chicken/variant`.

## 3. Loot, predicates, item modifiers, advancements, recipes, tags

### Complete grammar surface, from `reports/registries.json`

| Registry | Entries | Members |
|---|---|---|
| `loot_function_type` | 42 | `set_count`, `set_item`, `enchant_with_levels`, `enchant_randomly`, `set_enchantments`, `set_custom_data`, `set_components`, `furnace_smelt`, `enchanted_count_increase`, `set_damage`, `set_attributes`, `set_name`, `exploration_map`, `set_stew_effect`, `copy_name`, `set_contents`, `modify_contents`, `filtered`, `limit_count`, `apply_bonus`, `set_loot_table`, `explosion_decay`, `set_lore`, `fill_player_head`, `copy_custom_data`, `copy_state`, `set_banner_pattern`, `set_potion`, `set_random_dyes`, `set_random_potion`, `set_instrument`, `sequence`, `copy_components`, `set_fireworks`, `set_firework_explosion`, `set_book_cover`, `set_written_book_pages`, `set_writable_book_pages`, `toggle_tooltips`, `set_ominous_bottle_amplifier`, `set_custom_model_data`, `discard` |
| `loot_condition_type` | 20 | `inverted`, `any_of`, `all_of`, `random_chance`, `random_chance_with_enchanted_bonus`, `entity_properties`, `killed_by_player`, `entity_scores`, `match_block`, `match_tool`, `table_bonus`, `survives_explosion`, `damage_source_properties`, `location_check`, `weather_check`, `time_check`, `int_value_check`, `float_value_check`, `enchantment_active_check`, `environment_attribute_check` |
| `loot_pool_entry_type` | 9 | `empty`, `item`, `loot_table`, `dynamic`, `tag`, `slots`, `alternatives`, `sequence`, `group` |
| `context_key_set` | 31 | the loot context param sets, including `block`, `entity`, `chest`, `fishing`, `shearing`, `barter`, `vault`, `gift`, `archaeology`, `equipment`, `advancement_reward`, `block_use`, `enchanted_damage`, `container_process`, `command_slot_source` |
| `context_int_provider_type` | 23 | `abs`, `add`, `avg`, `binomial`, `conditional`, `constant`, `div`, `environment_attribute`, `floor_div`, `floor_mod`, `from_float`, `max`, `min`, `mod`, `mul`, `negate`, `number_dispatcher`, `pow`, `score`, `storage`, `sub`, `uniform`, `weighted_list` |
| `context_float_provider_type` | 28 | `abs`, `add`, `avg`, `ceil`, `conditional`, `constant`, `cos`, `div`, `enchantment_level`, `environment_attribute`, `floor`, `from_int`, `length`, `max`, `min`, `mod`, `mul`, `negate`, `number_dispatcher`, `pow`, `round`, `sin`, `sqrt`, `storage`, `sub`, `truncate`, `uniform`, `weighted_list` |
| `loot_nbt_provider_type` | 2 | `storage`, `context` |
| `loot_score_provider_type` | 2 | `fixed`, `context` |
| `slot_source_type` | 6 | `group`, `filtered`, `limit_slots`, `slot_range`, `contents`, `empty` |
| `recipe_serializer` | 22 | `crafting_shaped`, `crafting_shapeless`, `crafting_dye`, `crafting_imbue`, `crafting_transmute`, `crafting_decorated_pot`, `crafting_special_bookcloning`, `crafting_special_mapextending`, `crafting_special_firework_rocket`, `crafting_special_firework_star`, `crafting_special_firework_star_fade`, `crafting_special_bannerduplicate`, `crafting_special_shielddecoration`, `crafting_special_repairitem`, `smelting`, `blasting`, `smoking`, `campfire_cooking`, `stonecutting`, `smithing_transform`, `brewing`, `smithing_trim` |
| `recipe_type` | 8 | `crafting`, `smelting`, `blasting`, `smoking`, `campfire_cooking`, `stonecutting`, `smithing`, `brewing` |
| `trigger_type` | 58 | see below |
| `data_component_predicate_type` | 15 | `damage`, `enchantments`, `stored_enchantments`, `potion_contents`, `custom_data`, `container`, `bundle_contents`, `firework_explosion`, `fireworks`, `writable_book_content`, `written_book_content`, `attribute_modifiers`, `trim`, `jukebox_playable`, `villager/variant` |
| `entity_sub_predicate_type` | 25 | `entity_type`, `location`, `stepping_on`, `movement_affected_by`, `distance`, `movement`, `effects`, `nbt`, `flags`, `equipment`, `periodic_tick`, `vehicle`, `passenger`, `targeted_entity`, `team`, `slots`, `components`, `predicates`, `entity_tags`, and six `type_specific/*` (`lightning`, `fishing_hook`, `player`, `cube_mob`, `raider`, `sheep`) |
| `consume_effect_type` | 5 | `apply_effects`, `remove_effects`, `clear_all_effects`, `teleport_randomly`, `play_sound` |
| `number_format_type` | 3 | `blank`, `styled`, `fixed` |

The 58 trigger types: `impossible`, `player_killed_entity`, `entity_killed_player`, `enter_block`, `inventory_changed`, `recipe_unlocked`, `player_hurt_entity`, `entity_hurt_player`, `enchanted_item`, `filled_bucket`, `brewed_potion`, `construct_beacon`, `used_ender_eye`, `summoned_entity`, `bred_animals`, `location`, `slept_in_bed`, `cured_zombie_villager`, `villager_trade`, `item_durability_changed`, `levitation`, `changed_dimension`, `tick`, `tame_animal`, `placed_block`, `consume_item`, `effects_changed`, `used_totem`, `nether_travel`, `fishing_rod_hooked`, `channeled_lightning`, `shot_crossbow`, `spear_mobs`, `killed_by_arrow`, `hero_of_the_village`, `voluntary_exile`, `slide_down_block`, `bee_nest_destroyed`, `target_hit`, `item_used_on_block`, `default_block_use`, `any_block_use`, `player_generates_container_loot`, `thrown_item_picked_up_by_entity`, `thrown_item_picked_up_by_player`, `player_interacted_with_entity`, `player_sheared_equipment`, `started_riding`, `lightning_strike`, `using_item`, `fall_from_height`, `ride_entity_in_lava`, `kill_mob_near_sculk_catalyst`, `allay_drop_item_on_block`, `avoid_vibration`, `recipe_crafted`, `crafter_recipe_crafted`, `fall_after_explosion`.

### What vanilla actually uses

Loot: 1447 tables, 1589 pools. Context types used: `block` 1201, `entity` 115, `chest` 68, `shearing` 22, `gift` 21, `archaeology` 6, `block_interact` 5, `fishing` 4, `equipment` 3, `entity_interact` 1, `barter` 1. Entry types used, 6 of 9: `item` 2556, `alternatives` 87, `loot_table` 57, `empty` 39, `dynamic` 1, `tag` 1. Modifier types used, 19 of 42: `set_count` 947, `explosion_decay` 190, `enchanted_count_increase` 80, `copy_components` 71, `set_potion` 52, `enchant_randomly` 52, `enchant_with_levels` 34, `apply_bonus` 32, `set_damage` 28, `furnace_smelt` 19, `exploration_map` 18, `filtered` 18, `copy_state` 10, `set_name` 8, `limit_count` 6, `set_enchantments` 5, `set_stew_effect` 3, `set_ominous_bottle_amplifier` 3, `set_instrument` 1. Condition types used, 13 of 20: `survives_explosion` 914, `match_block` 295, `entity_properties` 90, `any_of` 57, `all_of` 42, `table_bonus` 35, `inverted` 26, `killed_by_player` 24, `location_check` 14, `random_chance` 13, `random_chance_with_enchanted_bonus` 11, `damage_source_properties` 8, `match_tool` 1.

Recipes: 2042 files. `crafting_shaped` 827, `crafting_shapeless` 375, `stonecutting` 351, `brewing` 279, `smelting` 73, `crafting_transmute` 33, `blasting` 25, `smithing_trim` 18, `crafting_special_bannerduplicate` 16, `smithing_transform` 12, `campfire_cooking` 9, `smoking` 9, `crafting_dye` 6, and one each of `crafting_decorated_pot`, `crafting_imbue`, `crafting_special_bookcloning`, `crafting_special_firework_rocket`, `crafting_special_firework_star`, `crafting_special_firework_star_fade`, `crafting_special_mapextending`, `crafting_special_repairitem`, `crafting_special_shielddecoration`. 192 recipes reference at least one item tag.

Advancements: 1866 files, 4045 criteria, 54 of the 58 triggers used. 1740 of the files live under `advancement/recipes/` and exist only to grant a recipe, which is why `inventory_changed` (1914 criteria) and `recipe_unlocked` (1739) dominate and `rewards.recipes` appears 1739 times against 23 uses of `rewards.experience`. The remaining 126 are the hand-written tree: `adventure` 47, `husbandry` 31, `nether` 23, `story` 16, `end` 9. 30 of the 54 triggers are used exactly once.

Tags: 883 files over 20 registries (counts in section 1). Tag references by folder: `recipe` 236, `advancement` 144, `loot_table` 120, `worldgen` 93, `enchantment` 92, `trade_set` 68, `villager_trade` 36, `dimension_type` 8.

### The predicate and item modifier reuse model

A `predicate` file is one loot condition stored alone; an `item_modifier` file is one loot function stored alone. Before 26.3 you referenced them with the `minecraft:reference` condition or function. 26.3 removed those and made the reference a bare string anywhere the field expects the type. The changelog says: "Loot table types that have a dedicated registry now support registry element and tag references. This means that the majority of fields of such types that previously accepted single elements will now accept either a namespaced ID or an inline value, while fields that previously accepted lists can now accept an inline value, a single namespaced ID, a list of namespaced IDs, a list of inline values, or a hash-prefixed tag ID". The eight affected types are `minecraft:advancement`, `minecraft:item_modifier`, `minecraft:loot_table`, `minecraft:context_int_provider`, `minecraft:context_float_provider`, `minecraft:predicate`, `minecraft:recipe`, `minecraft:slot_source`. It also says "Existing reference types for predicates, item modifiers, and slot sources are now obsolete and have been removed" and "The codec for element lists/tags now allows mixing inline values and references. For example, item modifiers like `[{type:set_count, ...}, "minecraft:some_modifier"]` are now allowed".

Vanilla put this to work immediately: "Multiple block loot tables now reference predicates for checking if a tool has Silk Touch and is Shears instead of inlining a copy of those checks". The three vanilla predicates are `tool/can_silk_touch`, `tool/can_shear` and `block/fast_cooking`, and the first two are referenced 162 and 52 times across the loot tables. `loot_table/blocks/coal_ore.json` in full:

```json
{"type": "minecraft:block",
 "pools": [{"entries": [{"type": "minecraft:alternatives", "children": [
   {"type": "minecraft:item", "condition": "minecraft:tool/can_silk_touch", "name": "minecraft:coal_ore"},
   {"type": "minecraft:item",
    "modifier": [{"type": "minecraft:apply_bonus", "enchantment": "minecraft:fortune", "formula": "minecraft:ore_drops"},
                 {"type": "minecraft:explosion_decay"}],
    "name": "minecraft:coal"}]}],
   "rolls": 1}],
 "random_sequence": "minecraft:blocks/coal_ore"}
```

`loot_table/blocks/oak_leaves.json` composes the same two predicates with `any_of` and `inverted` across three pools without naming shears or Silk Touch anywhere.

The same reference rule now reaches advancements. The 26.3 changelog lists per-trigger changes such as "The `player` field, available on all triggers except `minecraft:impossible`, now accepts an inline value or a namespaced ID of a `minecraft:predicate` type" and "The `loot_table` field has been renamed to `loot_tables` and now accepts a single namespaced ID, a list of namespaced IDs, a list of inline values, or a hash-prefixed tag ID of a `minecraft:loot_table` type".

Cross-registry references in vanilla: 57 loot entries of type `loot_table` point at other tables; 1739 advancements point at recipes; 214 loot conditions point at predicates; `context_int_provider/cooking/time_boats.json` points at a predicate and two other context providers. The composition graph is real, not hypothetical.

## 4. Enchantments as data

43 enchantment files in 26.3. The 1.21 changelog says: "Enchantments are now set through data. An Enchantment is a set of core properties like level ranges and cost together with some effects. Most effect types also support a set of conditions, making it possible to apply them only when certain criteria are met."

### File shape

Every one of the 43 has `anvil_cost`, `description`, `max_cost`, `max_level`, `min_cost`, `slots`, `supported_items`, `weight`. 42 have `effects`, 18 have `exclusive_set`, 5 have `primary_items`. Slot values used: `mainhand` 25, `armor` 6, `any` 4, `feet` 3, `head` 2, `hand` 2, `offhand` 1, `legs` 1.

`enchantment/sharpness.json` verbatim:

```json
{"anvil_cost": 1, "description": {"translate": "enchantment.minecraft.sharpness"},
 "effects": {"minecraft:damage": [{"effect": {"type": "minecraft:add",
    "value": {"type": "minecraft:linear", "base": 1.0, "per_level_above_first": 0.5}}}]},
 "exclusive_set": "#minecraft:exclusive_set/damage",
 "max_cost": {"base": 21, "per_level_above_first": 11},
 "max_level": 5, "min_cost": {"base": 1, "per_level_above_first": 11},
 "primary_items": "#minecraft:enchantable/melee_weapon", "slots": ["mainhand"],
 "supported_items": "#minecraft:enchantable/sharp_weapon", "weight": 10}
```

### The 31 effect components

`minecraft:enchantment_effect_component_type` in `reports/registries.json`: `damage_protection`, `damage_immunity`, `damage`, `smash_damage_per_fallen_block`, `knockback`, `armor_effectiveness`, `post_attack`, `post_piercing_attack`, `hit_block`, `item_damage`, `equipment_drops`, `location_changed`, `tick`, `ammo_use`, `projectile_piercing`, `projectile_spawned`, `projectile_spread`, `projectile_count`, `trident_return_acceleration`, `fishing_time_reduction`, `fishing_luck_bonus`, `block_experience`, `mob_experience`, `repair_with_xp`, `attributes`, `crossbow_charge_time`, `crossbow_charging_sounds`, `trident_sound`, `prevent_equipment_drop`, `prevent_armor_change`, `trident_spin_attack_strength`.

The 1.21 changelog documents what each one takes. Most are lists whose entries have an `effect` and an optional `requirements` condition, evaluated against a documented context:

- Value effect on a number, with damage context: `armor_effectiveness`, `damage`, `damage_protection`, `equipment_drops`, `knockback`, `smash_damage_per_fallen_block` (named `smash_damage_per_block_fallen` in 1.21).
- Value effect with item context (the tool is the ammunition or the item being changed): `ammo_use`, `block_experience`, `item_damage`, `projectile_piercing`, `repair_with_xp`.
- Value effect with entity context: `fishing_luck_bonus`, `fishing_time_reduction`, `mob_experience`, `projectile_count`, `projectile_spread`, `trident_return_acceleration`.
- Unconditional single value effect: `crossbow_charge_time`, `trident_spin_attack_strength`.
- Entity effect: `hit_block`, `post_attack` (with `enchanted` and `affected` fields over `attacker`, `damaging_entity`, `victim`), `post_piercing_attack` (added 1.21.11), `projectile_spawned`, `tick`.
- Location based effect: `location_changed`.
- Sound banks: `crossbow_charging_sounds` (named `crossbow_charge_sounds` in 1.21), `trident_sound`.
- Attribute effects: `attributes`.
- Marker, matched entry is enough: `damage_immunity`, `prevent_armor_change`, `prevent_equipment_drop`.

### Value, level and effect type registries

`enchantment_value_effect_type` has 6: `add`, `all_of`, `multiply`, `remove_binomial`, `exponential`, `set`. `enchantment_level_based_value_type` has 6: `clamped`, `fraction`, `levels_squared`, `linear`, `exponent`, `lookup`. `enchantment_entity_effect_type` has 15: `all_of`, `apply_mob_effect`, `change_item_damage`, `damage_entity`, `explode`, `ignite`, `apply_impulse`, `apply_exhaustion`, `play_sound`, `replace_block`, `replace_disk`, `run_function`, `set_block_properties`, `spawn_particles`, `summon_entity`. `enchantment_location_based_effect_type` has the same 15 plus `attribute`. `enchantment_provider_type` has 3: `by_cost`, `by_cost_with_difficulty`, `single`.

Vanilla's 43 files use 30 of the 31 effect components (`mob_experience` is the unused one), 5 of the 6 value effect types (`exponential` unused), 5 of the 6 level based value types (`exponent` unused), and 13 of the 16 location or entity effect types.

### How much enchantment behavior is expressible

Less than the file list suggests. `enchantment/fortune.json` has no `effects` key at all:

```json
{"anvil_cost": 4, "description": {"translate": "enchantment.minecraft.fortune"},
 "exclusive_set": "#minecraft:exclusive_set/mining",
 "max_cost": {"base": 65, "per_level_above_first": 9}, "max_level": 3,
 "min_cost": {"base": 15, "per_level_above_first": 9}, "slots": ["mainhand"],
 "supported_items": "#minecraft:enchantable/mining_loot", "weight": 2}
```

Fortune works entirely through `apply_bonus` and `table_bonus` in the block loot tables, which name `minecraft:fortune` directly. Silk Touch works through the `predicate/tool/can_silk_touch` file that 162 loot entries reference. Fifteen `tags/enchantment/*.json` files carry the rest of the behavior switches: `curse`, `double_trade_price`, `in_enchanting_table`, `non_treasure`, `on_mob_spawn_equipment`, `on_random_loot`, `on_traded_equipment`, `prevents_bee_spawns_when_mining`, `prevents_decorated_pot_shattering`, `prevents_ice_melting`, `prevents_infested_spawns`, `smelts_loot`, `tooltip_order`, `tradeable`, `treasure`, plus 7 `exclusive_set/*` files.

So an enchantment is four coordinated pieces: the enchantment file, the tags that put it in loot and trades and the enchanting table, the loot tables that read it, and the 31 effect component implementations in code. A custom enchantment can only do what the 31 components already do. There is no way to express, for example, a new interaction with a block entity or a new inventory action.

## 5. Worldgen registries beyond the existing note

[cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) covers the noise router, density functions, surface and material rules, biome parameters, carvers, feature-by-feature comparison and every structure set's salt, spacing and separation. [java-datapacks.md](java-datapacks.md) section 4 lists the 58 feature types, 44 density function types and 18 placement modifier types. This section adds only the jigsaw and placement machinery those two do not spell out.

All 17 worldgen element registries are in `WORLD_REGISTRIES`, so none of them respond to `/reload`. Only `worldgen/biome` and `worldgen/block_state_provider` are synced to the client.

### Structures

52 structure files over 16 `structure_type` entries: `jigsaw` 28, `ruined_portal` 7, `mineshaft` 2, `ocean_ruin` 2, `shipwreck` 2, and one each of `buried_treasure`, `desert_pyramid`, `end_city`, `fortress`, `igloo`, `jungle_temple`, `nether_fossil`, `ocean_monument`, `stronghold`, `swamp_hut`, `woodland_mansion`. Every file has `type`, `biomes`, `spawn_overrides` and `step`. `terrain_adaptation` appears on 29 files with four values: `beard_thin` 25, `beard_box` 1, `bury` 2, `encapsulate` 1.

The 28 jigsaw files share `max_distance_from_center`, `size`, `start_height`, `start_pool`, `use_expansion_hack`, and 25 of them have `project_start_to_heightmap`. Four optional fields appear once each: `start_jigsaw_name`, `dimension_padding`, `liquid_settings`, `pool_aliases`. The 24 non-jigsaw files carry a handful of type-specific fields (`mineshaft_type`, `biome_temp`, `cluster_probability`, `large_probability`, `setups`, `is_beached`, `height`) and otherwise push everything into `worldgen/structure_piece`, a code registry with 56 entries.

### Template pools

245 pool files holding 2281 elements over 5 of the 5 `structure_pool_element` types: `legacy_single_pool_element` 1663, `single_pool_element` 527, `feature_pool_element` 57, `empty_pool_element` 31, `list_pool_element` 3. Projection is `rigid` for 2067 elements and `terrain_matching` for 183. `worldgen/pool_alias_binding` has 3 types and is used by one structure.

### Processor lists

40 files using 4 of the 11 `structure_processor` types: `rule` 35, `protected_blocks` 7, `block_rot` 6, `capped` 4. Unused: `blackstone_replace`, `block_age`, `block_ignore`, `gravity`, `jigsaw_replacement`, `lava_submerged_block`, `nop`. Inside the rules, 5 of the 10 `rule_test` types appear (`always_true` 155, `random_block_match` 123, `block_match` 33, `tag_match` 9, `blockstate_match` 8), 1 of the 3 `pos_rule_test` types (`axis_aligned_linear_pos`, once), and 1 of the 4 `rule_block_entity_modifier` types (`append_loot`, four times).

### Structure sets

21 files. Placement types used: `random_spread` 20, `concentric_rings` 1 (`dimension_origin` unused). Fields seen across the 21: `type` 21, `salt` 21, `spacing` 20, `separation` 20, `frequency` 3, `frequency_reduction_method` 3, `spread_type` 3, `locate_offset` 1, `exclusion_zone` 1, plus `count`, `distance`, `spread` and `preferred_biomes` on the single `concentric_rings` entry.

### Placement modifiers

273 placed feature files make 1170 modifier calls using 15 of the 18 types: `biome` 211, `count` 201, `in_square` 198, `block_predicate_filter` 155, `heightmap` 111, `offset` 93, `height_range` 86, `rarity_filter` 55, `surface_water_depth_filter` 26, `environment_scan` 12, `count_on_every_layer` 8, `noise_threshold_count` 6, `noise_based_count` 4, `surface_relative_threshold_filter` 3, `fixed_placement` 1. Unused in vanilla: `random_chance`, `cuboid`, `randomly_selected`. The supporting type registries are `block_predicate_type` 16, `height_provider_type` 6, `int_provider_type` 8, `float_provider_type` 4, `worldgen/block_state_provider_type` 10.

### What 26.3 moved

26.3 made block state providers a referenceable registry. Its changelog: "Block State Providers can now be defined as stand-alone types in the `worldgen/block_state_provider` registry and referenced by using a namespaced string for a field that expects a Block State Provider." The same release introduced `worldgen/material_rule` and `worldgen/material_condition` as registries ("A new data-driven registry has been introduced, loaded from `data/<namespace>/worldgen/material_rule/<id>.json`", "Material Rules can now be specified either inline (as previously), or as an ID reference"), renamed `worldgen/configured_feature` to `worldgen/feature` with the config inlined ("configuration is now done inline in the root object rather than separated into a `config` field"), and renamed `worldgen/configured_carver` to `worldgen/carver`.

The new `block_transformer` registry reuses block state providers for axe stripping, shovel pathing and hoe tilling. `block_transformer/axe.json` is a list of entries whose `block_state_provider` is `{"type": "minecraft:rule_based", "rules": [{"if_true": {"type": "minecraft:matching_blocks", "blocks": "minecraft:oak_wood"}, "then": {"type": "minecraft:copy_properties", "source": {"id": "minecraft:stripped_oak_wood", "properties": {"axis": "y"}}}}, ...]}`. The interaction that triggers it stays in code; the mapping is data.

## 6. How the server sends registries to the client

### The handshake, observed

A probe client of about 150 lines of Python, described step by step in "Reproduction", connected to a 26.3 server on protocol 777 with `online-mode=false`. Sequence:

1. Handshake with intent 2, then login hello. The server sent `minecraft:login_compression`, then `minecraft:login_finished`. The client sent `minecraft:login_acknowledged` and entered the configuration phase.
2. The server sent `minecraft:update_enabled_features` with `["minecraft:vanilla"]`.
3. The server sent `minecraft:select_known_packs` (clientbound id 15) with one entry: `("minecraft", "core", "26.3")`.
4. The client replied `minecraft:select_known_packs` (serverbound id 7) with a count of 0, meaning it knows nothing.
5. The server sent 32 `minecraft:registry_data` packets (id 7), then one `minecraft:update_tags` (id 14), then `minecraft:finish_configuration` (id 3).

The 32 registries, in the order received, with entry counts:

```
worldgen/biome 67, chat_type 7, trim_pattern 18, trim_material 11, wolf_variant 9,
wolf_sound_variant 7, pig_variant 3, pig_sound_variant 3, frog_variant 3, cat_variant 11,
cat_sound_variant 2, cow_sound_variant 2, cow_variant 3, chicken_sound_variant 2,
chicken_variant 3, zombie_nautilus_variant 2, painting_variant 51, sulfur_cube_archetype 12,
dimension_type 4, damage_type 51, banner_pattern 43, enchantment 43, jukebox_song 22,
instrument 8, test_environment 1, test_instance 1, dialog 3, world_clock 2, timeline 4,
decorated_pot_pattern 23, block_transformer 3, worldgen/block_state_provider 8
```

This is the same order as `RegistryDataLoader.SYNCHRONIZED_REGISTRIES` in the jar, so the wire order is the field order.

The `update_tags` packet carried 15 tag registries: `worldgen/biome` 86, `potion` 5, `item` 236, `instrument` 3, `timeline` 4, `enchantment` 22, `banner_pattern` 11, `painting_variant` 1, `point_of_interest_type` 3, `game_event` 5, `fluid` 10, `dialog` 2, `entity_type` 49, `block` 300, `damage_type` 36. That is 773 of the 883 vanilla tag files. The 110 that are not sent are `villager_trade` 73, `worldgen/structure` 33, `worldgen/world_preset` 2, `worldgen/feature` 1 and `worldgen/flat_level_generator_preset` 1. `TagNetworkSerialization` calls `RegistrySynchronization.networkSafeRegistries` and skips empty payloads, which is why built-in registries such as `block` and `item` are included and non-synced dynamic registries such as `villager_trade` are not.

### The known-packs optimization

Running the same probe with the known-packs reply echoing `("minecraft", "core", "26.3")` back produced the same 32 packets with the same entry counts, but the total `registry_data` payload dropped from 157839 bytes to 9975 bytes. When the client admits it already has the pack, the server sends ids only and the client fills the data from its own copy of the vanilla pack. A server with a modified vanilla pack must not claim the `minecraft:core` pack, or clients will render stale data.

### On `/reload`

`MinecraftServer.reloadResources` re-reads only the 8 reloadable registries, then calls `PlayerList.reloadResources`, whose body references exactly two packet classes, `ClientboundUpdateTagsPacket` and `ClientboundUpdateRecipesPacket`, plus `PlayerAdvancements`. Nothing re-sends `registry_data`. Biomes, damage types, enchantments and dimension types therefore cannot change without a world reload, which is also a reconnect for every client.

### What this implies for a Bedrock server

Bedrock has no configuration phase and no generic registry sync. The equivalent data arrives in named packets with fixed layouts, which this repository already implements: `packages/prismarine/src/network/packet/StartGamePacket.ts`, `ItemRegistryPacket.ts`, `BiomeDefinitionListPacket.ts`, `AvailableActorIdentifiersPacket.ts` and `CraftingDataPacket.ts`. Four consequences for a project that wants to adopt the Java registry model:

1. The split is not portable. Java's "synced or not" flag is per registry and uniform; Bedrock's is per packet, and several Java registries (`chat_type`, `damage_type`, `dialog`, `timeline`, `world_clock`, `decorated_pot_pattern`, `trim_pattern`, `trim_material`, `jukebox_song`, the 12 variant registries) have no Bedrock packet at all. Their content either becomes server-side only or has to be pushed through a behavior pack the client downloads.
2. Numeric ids matter on the Bedrock side and not on the Java side. Each `registry_data` entry the probe read is a namespaced identifier followed by an optional NBT payload, with no numeric id anywhere in the packet, so the index in the list is the id. Bedrock's `ItemRegistryPacket` carries explicit numeric ids per entry. A registry layer modeled on Java's must therefore still own a stable id assignment of its own.
3. The 157839-to-9975 byte difference shows Java's design assumption: the client already has the vanilla data, and the wire carries only the delta. Bedrock's equivalent is the resource and behavior pack download, which is a much heavier mechanism with a user-visible prompt.
4. Reload semantics differ in the same way. Java can hot-reload 8 registries and resends two packets. A Bedrock server has no `/reload` equivalent for registries, so anything a project wants reloadable must be in the server-side 8-registry class (loot, recipes, predicates, item modifiers, advancements, providers) rather than the world class.

## 7. Version churn

### Pack version history

From `version.json` in each release's jar, republished by misode/mcmeta's `<version>-summary` tags:

| Release | Data pack version | Protocol | Data version |
|---|---|---|---|
| 1.15 | 5 | 573 | 2225 |
| 1.16.2 | 6 | 751 | 2578 |
| 1.17 | 7 | 755 | 2724 |
| 1.18 | 8 | 757 | 2860 |
| 1.18.2 | 9 | 758 | 2975 |
| 1.19 | 10 | 759 | 3105 |
| 1.19.4 | 12 | 762 | 3337 |
| 1.20 | 15 | 763 | 3463 |
| 1.20.2 | 18 | 764 | 3578 |
| 1.20.3 | 26 | 765 | 3698 |
| 1.20.5 | 41 | 766 | 3837 |
| 1.21 | 48 | 767 | 3953 |
| 1.21.2 | 57 | 768 | 4080 |
| 1.21.4 | 61 | 769 | 4189 |
| 1.21.5 | 71 | 770 | 4325 |
| 1.21.6 | 80 | 771 | 4435 |
| 1.21.7 | 81 | 772 | 4438 |
| 1.21.9 | 88.0 | 773 | 4554 |
| 1.21.11 | 94.1 | 774 | 4671 |
| 26.1 | 101.1 | 775 | 4786 |
| 26.2 | 107.1 | 776 | 4903 |
| 26.3 | 121.0 | 777 | 5023 |

The format number is not a counter of releases. It jumped 15 to 18 to 26 to 41 across 1.20, 1.20.2, 1.20.3 and 1.20.5, and 107 to 121 between 26.2 and 26.3. Each increment marks one breaking datapack change, and Mojang bumps it per snapshot.

1.21.9 changed the declaration itself. Its changelog: "The `supported_formats` field has been removed", "The `pack_format` field is now optional", "Added required field `min_format` - specifies the minimum version supported. A full version is specified as a list of two integers, e.g. `[74, 1]`", "Added required field `max_format`". From 1.21.9 on, pack versions have a minor component, and a minor bump is backward compatible.

### Concrete renames

- 1.19.4 added damage types as a registry: "Added data-driven damage types". The same release removed eight fields from damage type predicates (`is_projectile`, `is_explosion`, `bypasses_armor`, `bypasses_invulnerability`, `bypasses_magic`, `is_fire`, `is_magic`, `is_lightning`) in favor of tags.
- 1.20.5 replaced item NBT `tag` with components, and changed the generated report shape for default components from a list of `{type, value}` pairs to a map.
- 1.21 renamed 13 directories at once, verbatim from the changelog: `structures -> structure`, `advancements -> advancement`, `recipes -> recipe`, `loot_tables -> loot_table`, `predicates -> predicate`, `item_modifiers -> item_modifier`, `functions -> function`, `tags/functions -> tags/function`, `tags/items -> tags/item`, `tags/blocks -> tags/block`, `tags/entity_types -> tags/entity_type`, `tags/fluids -> tags/fluid`, `tags/game_events -> tags/game_event`. The same release renamed the registry `decorated_pot_patterns` to `decorated_pot_pattern`, the loot condition `random_chance_with_looting` to `random_chance_with_enchanted_bonus`, the loot function `looting_enchant` to `enchanted_count_increase`, the loot context sources `killer` to `attacking_entity` and `killer_player` to `last_damage_player`, and the attribute modifier fields `Name`, `Base`, `Amount`, `Operation`, `UUID` to `id`, `base`, `amount`, `operation` with named operation constants.
- Two enchantment effect components that the 1.21 changelog documents as `crossbow_charge_sounds` and `smash_damage_per_block_fallen` appear in the 26.3 registry as `crossbow_charging_sounds` and `smash_damage_per_fallen_block`. The release that renamed them was not identified here.
- 26.3 rewrote loot syntax. "The `conditions` field in loot pool entries has been renamed to `condition`", "The `functions` field in loot pool entries has been renamed to `modifier`", "The `function` field (describing the function type) has been renamed to `type`", "The `condition` field (describing the predicate type) has been renamed to `type`", `name` became `items` in the `tag` entry, `name` became `loot_table_id` in `set_loot_table`, and the `block` field on many advancement triggers became `blocks`, `recipe_id` became `recipes`, `loot_table` became `loot_tables`.
- 26.3 split `minecraft:number_provider` and `minecraft:number_provider_type` into `context_int_provider`, `context_int_provider_type`, `context_float_provider` and `context_float_provider_type`.
- 26.3 renamed the block state keys everywhere: "`Name` is now `id`", "`Properties` is now `properties`", and added a compact form where a block id alone means its default state.
- 26.3 worldgen renames are in section 5: `surface_rule` to `material_rule`, `configured_feature` to `feature`, `configured_carver` to `carver`.

### What pinning to one version buys and costs

A project that pins to 26.3 gets 60 element registries, 122 component types and 7383 vanilla JSON files that are internally consistent and verifiable by rerunning one command. It also signs up for a change every release. Each of the last five releases changed something a loader must handle: 1.21.9 the pack metadata fields, 1.21.11 three new element registries and five new components, 26.1 the default-component report layout, 26.2 one new registry and one new component, 26.3 the loot and predicate syntax plus three worldgen folder renames plus the block state key rename. Renames land without a deprecation window, and the data pack version bumps with them, so a pack written for the previous spelling declares a format outside the new `min_format` to `max_format` range.

Upgrading a hand-written loader across one release is therefore a known, bounded job rather than a surprise, provided the project treats the vanilla data as an input it regenerates rather than a snapshot it hand-edits. The generated output is deterministic: `--reports --server --all` writes 10038 files in 26.3 and reported `written: 10038, removed stale: 0` on a clean run, so a diff between two versions' outputs is the complete change list.

## 8. What a datapack still cannot express

### Registries you cannot extend

The 95 `elements: false` registries in `reports/datapack.json`. The ones that bite hardest:

- `block` (1286 entries). No datapack can add, remove or alter a block. Block states (the property names, their allowed values and the numeric state ids) are code and appear in `reports/blocks.json` as read-only output. Block properties have never been in any Mojang report: hardness, blast resistance, friction, light emission, map color, sound type, collision shape and `requires_correct_tool_for_drops` are `BlockBehaviour.Properties` in code, which [java-datapacks.md](java-datapacks.md) section 2 establishes by diffing the report across four releases. 26.3 removed even the `definition` field that named the block's class; its changelog says "The `definition` field from the `blocks.json` data generation report has been removed". The jar has 305 classes matching `net/minecraft/world/level/block/*Block.class` and 474 class files under that package.
- `item` (1658 entries). Components cover a defined slice; the rest is one of 70 `net/minecraft/world/item/*Item.class` classes. minecraft.wiki's "Hardcoded item properties (Java Edition)" page enumerates them method by method (`use`, `useOn`, `onUseTick`, `finishUsingItem`, `releaseUsing`, `hurtEnemy`, `mineBlock`, `interactLivingEntity`, `inventoryTick`, `getUseAnimation`, `overrideStackedOnOther` and others), and opens with the statement that these are "aspects of items which are tied to the IDs and cannot be customized fully via the use of commands or data packs".
- `entity_type` (161 entries). There is no entity folder in `data/minecraft/`. The jar has 727 class files under `net/minecraft/world/entity/`, 62 goal classes under `ai/goal/` and 119 behavior classes under `ai/behavior/`. The AI registries are all code: `attribute` 40, `memory_module_type` 115, `sensor_type` 24, `activity` 26. What data touches entities is variants with `spawn_conditions` (3 `spawn_condition_type`s: `structure`, `moon_brightness`, `biome`), `sulfur_cube_archetype` attribute modifiers, trial spawners, biome spawn lists through environment attributes, villager trades, equipment loot and entity loot (115 tables).
- `fluid` (5), `mob_effect` (40), `potion` (46), `particle_type` (128), `block_entity_type` (49), `sound_event` (1991), `attribute` (40), `game_rule` (59), `creative_mode_tab` (14), `menu` (25), `villager_profession` (15), `point_of_interest_type` (21), `map_decoration_type` (40), `custom_stat` (78), `environment_attribute` (51).
- Every `*_type` registry. A datapack can write a `{"type": "minecraft:add", ...}` density function but cannot define a new density function operator; the same holds for the 42 loot functions, 20 loot conditions, 58 triggers, 58 feature types, 18 placement modifiers, 16 structure types, 11 structure processors, 31 enchantment effect components, 5 consume effects, 9 dialog actions and 62 command argument types.

### Behavior that has no data expression at all

- Block interaction and ticking. Redstone, pistons, hoppers, fluid flow, crop growth, fire spread, farmland trampling, note blocks, and the 49 block entity types behind 86 class files under `net/minecraft/world/level/block/entity/`.
- Mob AI. There is no file anywhere in the datapack that describes a goal, a brain, a schedule or a targeting rule.
- Combat, movement and physics. Attack cooldowns, knockback resolution, fall damage, swimming, elytra flight, sprint and the collision system.
- Chunk generation itself. The datapack parameterizes the noise router, the material rules, the features and the structure placement, but the cell interpolation, the aquifer algorithm, the jigsaw assembler, the carver walk and every one of the 58 feature algorithms are code. The same is true of the 56 `worldgen/structure_piece` types used by the 24 non-jigsaw structures.
- Inventory and GUI behavior beyond `dialog`. The 25 `menu` types and their slot logic are code. `dialog` can draw a server-driven screen from 5 dialog types, 2 body types and 9 action types, which is a narrow surface compared with a real UI.
- The eight `crafting_special_*` serializers: `bookcloning`, `mapextending`, `firework_rocket`, `firework_star`, `firework_star_fade`, `bannerduplicate`, `shielddecoration`, `repairitem`. Each is code behind a JSON stub. `recipe/repair_item.json` is `{"type": "minecraft:crafting_special_repairitem"}` and nothing else.
- Networking and protocol. 144 clientbound and 69 serverbound play packets in `reports/packets.json`, none of them extensible.

### The practical boundary for a parity project

Mojang's data describes what exists and with what parameters. It does not describe what anything does. Every registry that is `elements: true` is a parameter table for an algorithm that is `elements: false`. The useful reading for a server project is that the 60 element registries tell you exactly how many algorithm families you must implement and what each one's input shape is, and the 95 code registries plus the 1524 class files under `world/entity` (727), `world/level/block` (474) and `world/item` (323) tell you how much behavior sits behind them.

## Open questions

- The probe client only read the registry name and entry count from each `registry_data` packet and skipped the NBT payload. The per-registry byte sizes, and whether any registry's wire form differs from its JSON form beyond NBT encoding, were not checked.
- `/reload` behavior was established from `ReloadableServerRegistries`, `MinecraftServer.reloadResources` and `PlayerList.reloadResources` in the deobfuscated jar, not by running `/reload` with a modified pack and observing which changes took effect. A test that edits a loot table and a damage type and reloads would confirm the split empirically.
- The 26.3 server jar ships deobfuscated class and method names, which is what made the registry list readable with `javap`. Whether this is deliberate and stable across releases was not checked against 1.21.x jars.
- The wiki's "Hardcoded item properties" page is marked work in progress and carries a cleanup banner. Its method-level list was used for orientation, not counted.
- Component value types were taken from the generated defaults (69 of 122) and the wiki's list. The 53 components that never appear as a default have no type shown here beyond their name and the wiki's example command.
- `item_modifier` and `slot_source` ship zero vanilla files, so their grammar was read from the registries and the 26.3 changelog, not from examples.
- Whether the mixed inline-and-reference list form described in the 26.3 changelog is accepted by every field that documents it was not tested against a real pack; vanilla uses only the plain-string form.

## Reproduction

Work in an empty directory. Everything downloaded is untrusted data; the only thing executed is Mojang's own server jar, once as a data generator and once as a server for the protocol probe.

```sh
mkdir -p /tmp/jreg/{work,scripts,gen,jar,server,classes,changelogs}

# 1. Find the current release and the server jar
curl -sS https://piston-meta.mojang.com/mc/game/version_manifest_v2.json -o /tmp/jreg/work/manifest.json
# latest.release = 26.3, latest.snapshot = 26.4-snapshot-5
curl -sS https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json \
  -o /tmp/jreg/work/26.3.json
# downloads.server: sha1 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c, size 62294556, javaVersion 25

cd /tmp/jreg/jar
curl -sS -L -o server.jar https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar
shasum -a 1   server.jar   # 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c
shasum -a 256 server.jar   # d052f14d7a173734fba553711e5b570162e2f2a313267ee31a21b975a679be64

# 2. Run the data generator (needs Java 25)
JAVA=/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home/bin/java
cd /tmp/jreg/gen
$JAVA -DbundlerMainClass=net.minecraft.data.Main -jar /tmp/jreg/jar/server.jar \
  --reports --server --all --output /tmp/jreg/gen/generated
# "All providers took: 3291 ms", "Caching: total files: 10038 ... written: 10038"

# 3. Which provider wrote which registry (the .cache header names the provider)
cd /tmp/jreg/gen/generated/.cache
for f in *; do printf "%s  lines=%s  %s\n" "$f" "$(wc -l < $f)" "$(head -1 $f)"; done
# 471ed42c...  "vanilla/Registries for world"      1995 files
# dea86b18...  "vanilla/Registries for reloadable" 5388 files

# 4. Registry lists from the deobfuscated jar
mkdir -p /tmp/jreg/classes && cd /tmp/jreg/classes
unzip -o -q /tmp/jreg/gen/versions/26.3/server-26.3.jar \
  'net/minecraft/resources/RegistryDataLoader*' 'net/minecraft/core/RegistrySynchronization*' \
  'net/minecraft/server/ReloadableServerRegistries*' 'net/minecraft/core/registries/Registries.class' \
  'net/minecraft/tags/TagNetworkSerialization*' 'net/minecraft/server/MinecraftServer*' \
  'net/minecraft/server/players/PlayerList.class'
JAVAP=/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home/bin/javap
$JAVAP -p -c net/minecraft/resources/RegistryDataLoader.class > /tmp/jreg/work/rdl.txt
$JAVAP -p -c net/minecraft/core/registries/Registries.class   > /tmp/jreg/work/regs.txt
# Parse <clinit>: getstatic Registries.X runs accumulate until putstatic WORLD_REGISTRIES /
# DIMENSION_REGISTRIES / RELOADABLE_REGISTRIES / SYNCHRONIZED_REGISTRIES.
# In Registries.<clinit>, pair each "ldc|ldc_w // String <path>" with the following
# "putstatic // Field <NAME>" to get field -> folder (157 pairs).
$JAVAP -p -c net/minecraft/server/players/PlayerList.class | \
  sed -n '/public void reloadResources();/,/^  public [a-z]/p'
# references only ClientboundUpdateTagsPacket, ClientboundUpdateRecipesPacket, PlayerAdvancements

# 5. Counts used in sections 1 to 5 (run from /tmp/jreg/gen/generated)
python3 -I -c 'import json;d=json.load(open("reports/datapack.json"));r=d["registries"];print(len(r),sum(v["elements"] for v in r.values()),d["others"])'
python3 -I -c 'import json;r=json.load(open("reports/registries.json"));[print(len(v["entries"]),k) for k,v in sorted(r.items())]'
for d in data/minecraft/*/ data/minecraft/worldgen/*/ data/minecraft/tags/*/; do
  printf "%s\t%s\n" "$(find "$d" -name '*.json' | wc -l)" "$d"; done
ls reports/minecraft/components/item | wc -l            # 1658
unzip -l /tmp/jreg/gen/versions/26.3/server-26.3.jar | grep -c 'data/minecraft/structure/.*\.nbt$'   # 1511
unzip -l /tmp/jreg/gen/versions/26.3/server-26.3.jar | grep -c '\.mcfunction$'                       # 0
# Loot, recipe, advancement, enchantment, worldgen histograms: walk the JSON and count
# "type" values under pools/entries/children (entry), "modifier" (function), "condition"
# (predicate, string = reference), recipe "type", advancement criteria "trigger",
# enchantment "effects" keys, placed_feature "placement" types, template_pool
# "element.element_type", processor_list "processors[].processor_type",
# structure_set "placement.type".

# 6. Class counts for section 8
unzip -l /tmp/jreg/gen/versions/26.3/server-26.3.jar | awk '{print $4}' | grep '\.class$' > /tmp/jreg/work/jarlist.txt
grep -c '^net/minecraft/world/item/[A-Za-z]*Item\.class$'                    /tmp/jreg/work/jarlist.txt  # 70
grep -c '^net/minecraft/world/level/block/[A-Za-z]*Block\.class$'            /tmp/jreg/work/jarlist.txt  # 305
grep '^net/minecraft/world/entity/'            /tmp/jreg/work/jarlist.txt | grep -vc '\$'  # 727
grep '^net/minecraft/world/level/block/'       /tmp/jreg/work/jarlist.txt | grep -vc '\$'  # 474
grep '^net/minecraft/world/item/'              /tmp/jreg/work/jarlist.txt | grep -vc '\$'  # 323
grep '^net/minecraft/world/entity/ai/goal/'    /tmp/jreg/work/jarlist.txt | grep -vc '\$'  # 62
grep '^net/minecraft/world/entity/ai/behavior/' /tmp/jreg/work/jarlist.txt | grep -vc '\$' # 119

# 7. Protocol probe (section 6). Start the server, then run the probe.
cd /tmp/jreg/server && cp /tmp/jreg/jar/server.jar .
printf 'eula=true\n' > eula.txt
printf 'online-mode=false\nwhite-list=false\nenforce-secure-profile=false\nserver-port=25599\nview-distance=2\nsimulation-distance=2\n' > server.properties
$JAVA -Xmx2G -jar server.jar nogui > console.log 2>&1 &
# NOTE: 26.3 defaults white-list=true, so a fresh server.properties must set it false.
python3 -I /tmp/jreg/scripts/mcclient.py            # 32 registry_data packets, 157839 bytes
ACK_PACKS=1 python3 -I /tmp/jreg/scripts/mcclient.py  # same 32 packets, 9975 bytes
```

The probe is a plain socket client. Packet ids come from `reports/packets.json` (`configuration.clientbound`: `registry_data` 7, `update_tags` 14, `select_known_packs` 15, `finish_configuration` 3; `configuration.serverbound`: `select_known_packs` 7; `login.clientbound`: `login_compression` 3, `login_finished` 2; `login.serverbound`: `login_acknowledged` 3). Its loop is: send handshake (protocol 777, intent 2) and login hello with a 16-byte zero UUID; on `login_compression` record the threshold and switch to the compressed frame format (length, data length, zlib payload, with data length 0 meaning uncompressed); on `login_finished` send `login_acknowledged`; on `select_known_packs` reply with either a count of 0 or the echoed pack list; for each `registry_data` packet read the registry identifier and the VarInt entry count and discard the rest of the frame, which avoids parsing NBT; parse `update_tags` fully since it is all VarInts and identifiers; stop at `finish_configuration`.

```sh
# 8. Dating: run the same generator against older jars
#   1.20.5 server sha1 79493072f65e17243fd36a699c9a96b4381feb91
#   1.21.5 server sha1 e6ec2f64e6080b9b5d9b471b291c33cc7f509733
# each in its own /tmp/jreg/jar-<v>/ and /tmp/jreg/gen-<v>/, same --reports --server --all.
# reports/registries.json "minecraft:data_component_type": 56 (1.20.5), 96 (1.21.5), 122 (26.3)
# reports/datapack.json elements:true: absent (1.20.5), 41 (1.21.5), 60 (26.3)

# 9. Which release each registry folder first carried vanilla content
git ls-remote --tags https://github.com/misode/mcmeta | grep -- '-data$'
for v in 1.14 1.15 1.16 1.16.2 1.17 1.18 1.18.2 1.19 1.19.3 1.19.4 1.20 1.20.2 1.20.3 1.20.4 \
         1.20.5 1.20.6 1.21 1.21.1 1.21.2 1.21.3 1.21.4 1.21.5 1.21.6 1.21.9 1.21.10 1.21.11 \
         26.1 26.2 26.3; do
  gh api "repos/misode/mcmeta/contents/data/minecraft?ref=${v}-data" \
    --jq '[.[] | select(.type=="dir") | .name] | join(" ")'
  gh api "repos/misode/mcmeta/contents/data/minecraft/worldgen?ref=${v}-data" \
    --jq '[.[] | select(.type=="dir") | .name] | join(" ")'
done

# 10. Pack versions
for v in 1.15 1.16.2 1.17 1.18 1.18.2 1.19 1.19.3 1.19.4 1.20 1.20.2 1.20.3 1.20.5 1.21 1.21.1 \
         1.21.2 1.21.3 1.21.4 1.21.5 1.21.6 1.21.7 1.21.8 1.21.9 1.21.10 1.21.11 26.1 26.2 26.3; do
  curl -sS "https://raw.githubusercontent.com/misode/mcmeta/${v}-summary/version.json"; done

# 11. Changelogs (HTML with a browser check; send a User-Agent, then strip tags)
for a in minecraft-java-edition-1-19-4 minecraft-java-edition-1-20-5 minecraft-java-edition-1-21 \
         minecraft-java-edition-1-21-2 minecraft-java-edition-1-21-5 minecraft-java-edition-1-21-6 \
         minecraft-java-edition-1-21-9 minecraft-java-edition-1-21-11 minecraft-java-edition-26-1 \
         minecraft-java-edition-26-2 minecraft-java-edition-26-3; do
  curl -sS -L -A "Mozilla/5.0" -o "$a.html" "https://www.minecraft.net/en-us/article/$a"; done

# 12. Wiki pages (API returns wikitext, no scraping needed)
curl -sS "https://minecraft.wiki/api.php?action=parse&page=Data_component_format&prop=wikitext&format=json&formatversion=2"
curl -sS "https://minecraft.wiki/api.php?action=parse&page=Java_Edition_hardcoded_item_properties&prop=wikitext&format=json&formatversion=2&redirects=1"
curl -sS "https://minecraft.wiki/api.php?action=parse&page=Predicate&prop=wikitext&format=json&formatversion=2"
curl -sS "https://minecraft.wiki/api.php?action=parse&page=Item_modifier&prop=wikitext&format=json&formatversion=2"
```
