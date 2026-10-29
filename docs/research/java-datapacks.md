# Java Edition datapacks as a format and as a source of vanilla data

Researched 2026-10-24 against Mojang's own files: the Java Edition 26.3 server jar and its data generator (also run for 1.21.11, 26.1 and 26.2 to date one change), the piston-meta version manifest, Mojang's Java changelogs on minecraft.net, the EULA, and two republishers (misode/mcmeta, PrismarineJS/minecraft-data) for their own statements. The Bedrock side comes from [bedrock-data-extraction.md](bedrock-data-extraction.md) and is not repeated.

## Summary

- The current Java release is 26.3 (2026-09-15, data pack version 121.0, Java 25). Its data generator runs in 8 seconds and writes the full vanilla datapack (10038 files, 34 MB) plus reports. Command and hashes are in "Reproduction".
- A datapack can carry 60 element registries plus functions and structures; 95 further registries accept only tags and are defined in code. `reports/datapack.json` is Mojang's own list of both sets.
- `reports/blocks.json` carries no block properties. Stone is `{"states": [{"default": true, "id": 1}]}`. The `definition` field (a class name such as `minecraft:stair` plus constructor arguments) existed from 1.20.5 through 26.2 with an always-empty `properties` object, and 26.3 removed it. No Mojang report has ever listed hardness, blast resistance, friction, light, map color, sound type or tool requirements per block. 26.2's last `definition` dump names 265 block classes for 1196 blocks.
- Default item components are complete: 1658 items, one file each under `reports/minecraft/components/item/`, with `max_stack_size`, `max_damage`, `tool`, `food`, `consumable`, `attribute_modifiers`, `equippable`, `repairable`, `enchantable`, `weapon` and so on, 122 component types in the registry.
- Entities have no data definitions. 161 entity types, 40 attributes, 115 memory modules and 24 sensors are code. Only variants (cat, wolf, pig, cow, chicken, frog, zombie nautilus) and biome spawn lists are data.
- Java worldgen is data in full: 7 noise settings, 55 density functions over 44 operator types (33 used), 64 noises, 67 biomes, 7594 multi-noise parameter points, 240 configured and 273 placed features over 58 feature types (47 used) and 18 placement modifiers (15 used), 4 carvers over 2 types, 52 structures over 16 types, 21 structure sets, 245 template pools, 40 processor lists, 1511 structure NBT files.
- Loot (1447 tables, 42 modifier types), recipes (2042, 22 serializers, brewing since 26.3), tags (883 files in 16 registries), advancements (1866), enchantments (43, with 31 effect component types), damage types (51), villager trades (391 trades, 68 trade sets, since 26.1), timelines and world clocks (26.1), environment attributes (1.21.11) are data.
- Identifiers: 1102 of Java's 1286 block names also exist in the Bedrock 1.26.51 palette (1477 names); 1565 of Java's 1658 item names exist in Bedrock's 2076-entry item table. The differences are systematic (Bedrock `*_double_slab`, `*_standing_sign`, `element_*`, `lit_*`, `light_block_*`; Java `potted_*`, `*_wall_banner`, `*_bed`, `*_wall_sign`).
- Licensing is the same EULA as Bedrock. misode/mcmeta has no license file and says "If Mojang ever has something against this data existing here, the repository will be promptly removed." PrismarineJS/minecraft-data's README says "MIT" and has no LICENSE file at its current master commit.
- For a Bedrock server, Java datapacks are the richer format for terrain, biomes, features, structures, loot, enchantments and item components; Bedrock behavior packs are the richer format for entities (all 130 as JSON), spawn rules and the 98 data-driven blocks. Neither edition defines block behavior or block properties in data.

## 1. The datapack format in 26.3

### Pack metadata

`version.json` inside the server jar (`unzip -p server.jar version.json`):

```json
{"id": "26.3", "name": "26.3", "world_version": 5023, "series_id": "main", "protocol_version": 777,
 "pack_version": {"resource_major": 97, "resource_minor": 1, "data_major": 121, "data_minor": 0},
 "build_time": "2026-09-15T11:20:48+00:00", "java_component": "java-runtime-epsilon", "java_version": 25, "stable": true, "use_editor": false}
```

The data pack version is 121.0. The 1.21.9 changelog (https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-9) describes the current `pack.mcmeta`: "The pack versions for data packs and resource packs now have minor versions. A minor version increment of the game's pack version is backwards-compatible"; "The `supported_formats` field has been removed"; "The `pack_format` field is now optional"; "Added required field `min_format` - specifies the minimum version supported. A full version is specified as a list of two integers, e.g. `[74, 1]`. Specifying a single integer is interpreted as that major version". The three built-in packs in the 26.3 jar use the integer form, for example `data/minecraft/datapacks/trade_rebalance/pack.mcmeta`:

```json
{"features": {"enabled": ["minecraft:trade_rebalance"]},
 "pack": {"description": {"translate": "dataPack.trade_rebalance.description"}, "max_format": 121, "min_format": 121}}
```

The server jar carries no root `pack.mcmeta` for the vanilla pack itself; the three built-in packs (`trade_rebalance`, `redstone_experiments`, `minecart_improvements`) are the only ones. misode/mcmeta's `data` branch writes one as `{"pack": {"description": "The default data for Minecraft", "pack_format": 125, "min_format": [125, 0], "max_format": [125, 0]}}` (for the 26.4 snapshot at its head).

### What a datapack can carry

`reports/datapack.json` lists every registry with `elements` (whether a datapack can add entries), `tags` and `stable`. In 26.3 it has 155 registries: 60 with `elements: true`, 95 with `elements: false`, plus two "others" (`function`, format `mcfunction`, and `structure`, format `structure`). The 60 element registries, with the vanilla file count from `data/minecraft/` and what the JSON parameterizes:

| Folder | Files | What the data decides | What stays Java code |
|---|---|---|---|
| `advancement` | 1866 (1740 under `recipes/`) | criteria from 58 trigger types, rewards, display | the trigger implementations |
| `banner_pattern`, `decorated_pot_pattern`, `trim_pattern`, `trim_material`, `painting_variant`, `jukebox_song`, `instrument` | 43, 23, 18, 11, 51, 22, 8 | asset ids, translation keys, song length, horn range | rendering, playback |
| `block_transformer` (26.3) | 3 | axe strip, shovel path, hoe till as `block_state_provider` rules | the interaction that invokes them |
| `cat_variant`, `wolf_variant`, `pig_variant`, `cow_variant`, `chicken_variant`, `frog_variant`, `zombie_nautilus_variant` and `*_sound_variant` | 11, 9, 3, 3, 3, 3, 2 and 2 to 7 | texture ids and `spawn_conditions` (`structure`, `moon_brightness`, `biome`) | everything else about the mob |
| `chat_type` | 7 | translation key and parameters | |
| `context_int_provider`, `context_float_provider` (26.3) | 26, 4 | named numbers such as brewing uses, compost chances, looked up by loot and recipes | |
| `damage_type` | 51 | `exhaustion`, `message_id`, `scaling`, effects | which code path deals which type |
| `dialog` | 3 | server-driven UI screens | |
| `dimension`, `dimension_type` | 0, 4 | height, light rules, coordinate scale, `attributes`, `timelines`, `default_clock` | |
| `enchantment`, `enchantment_provider` | 43, 7 | cost curves, slots, exclusivity, `effects` over 31 effect component types (30 used) | the effect component implementations |
| `item_modifier`, `predicate` | 0, 3 | loot functions and conditions as standalone files | |
| `loot_table` | 1447 | pools, entries (9 types), 42 modifier types, 20 condition types | the implementations |
| `recipe` | 2042 | 22 serializers including `brewing` (279 files, new in 26.3) | 8 `crafting_special_*` serializers are code with a data stub |
| `slot_source` (26.3) | 0 | slot selection for `/item` | |
| `sulfur_cube_archetype` | 12 | attribute modifiers for the 26.x sulfur cube mob | |
| `test_environment`, `test_instance` | 1, 1 | GameTest setup | the test functions |
| `timeline`, `world_clock` (26.1) | 4, 2 | day cycle markers and attribute tracks | |
| `trade_set`, `villager_trade` (26.1) | 68, 391 | `wants`, `gives`, `max_uses`, `reputation_discount`; sets reference tags | |
| `trial_spawner` | 28 | spawn potentials, counts per player, cooldowns | |
| `worldgen/*` | 1144 | section 4 | the chunk generator, carvers, feature and density function implementations |

The 95 `elements: false` registries are code, and a datapack may only tag them: `activity`, `attribute`, `block`, `block_entity_type`, `entity_type`, `fluid`, `game_event`, `game_rule`, `item`, `memory_module_type`, `mob_effect`, `particle_type`, `potion`, `sensor_type`, `sound_event`, `villager_profession`, `villager_type`, every `*_type` registry (`feature_type`, `density_function_type`, `loot_function_type`, `data_component_type`, `trigger_type` and so on). Tags ship for 16 registries: `block` 300 files, `item` 236, `worldgen/*` 123, `villager_trade` 73, `entity_type` 49, `damage_type` 36, `enchantment` 22, `banner_pattern` 11, `fluid` 10, `game_event` 5, `potion` 5, `timeline` 4, `instrument` 3, `point_of_interest_type` 3, `dialog` 2, `painting_variant` 1.

Structures are NBT, not JSON: the jar has 1511 files under `data/minecraft/structure/`, and the generator does not re-emit them (its `--all` output has no `structure` folder).

## 2. Running Mojang's data generator

### Finding and fetching the jar

`https://net-secondary.web.minecraft-services.net/api/v1.0/download/links` returns `serverJar` = `https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar`. The launcher manifest `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` has `latest.release` = `26.3` and `latest.snapshot` = `26.4-snapshot-5`; the 26.3 entry points at `https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json`, whose `downloads.server` is the same URL with `sha1 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`, `size 62294556`, and whose `javaVersion` is `{"component": "java-runtime-epsilon", "majorVersion": 25}`. The downloaded file matched: sha1 `33680f5f...`, sha256 `d052f14d7a173734fba553711e5b570162e2f2a313267ee31a21b975a679be64`, 62294556 bytes. Earlier releases resolve the same way (1.21.11 `64bb6d76...`, 26.1 `3872a7f0...`, 26.2 `823e2250...`, all needing Java 21 or 25 per their manifests).

The jar is a bundler (`META-INF/MANIFEST.MF`: `Main-Class: net.minecraft.bundler.Main`, `Bundler-Format: 1.0`; `META-INF/main-class`: `net.minecraft.server.Main`; `META-INF/versions.list`: `26.3/server-26.3.jar`). On first run it unpacks `versions/26.3/server-26.3.jar` and 39 libraries into the working directory.

### Invocation

The machine had Java 21 on `PATH` and Oracle GraalVM 25.0.4 at `/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home`. With Java 25:

```
java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --help
Option             Description
--all              Include all generators
--dev              Include development tools
--help             Show the help menu
--input <String>   Input folder
--output <String>  Output folder (default: generated)
--reports          Include data reports
--server           Include server generators
--validate         Validate inputs
```

`java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --reports --server --all --output <dir>` logged `All providers took: 3997 ms` and `Caching: total files: 10038 ... written: 10038`; wall time 8.0 s including unpacking. Adding `--dev` produced an identical file list. The providers are `vanilla/Block List`, `vanilla/Default Components`, `vanilla/Command Syntax`, `vanilla/Registry Dump`, `vanilla/Packet Report`, `vanilla/Datapack Structure`, `vanilla/Json RPC API schema`, `vanilla/Biome Parameters`, `vanilla/Registries for world`, `vanilla/Registries for reloadable`, 20 `vanilla/Tags for *`, and the pack metadata, registry and tag providers of the three built-in packs. This matches misode/mcmeta's README, which names the same command.

Output: `data/` (34 MB) and `reports/` (18 MB): `blocks.json` 7330564 B, `commands.json` 583592 B, `registries.json` 536272 B, `datapack.json`, `packets.json` (144 clientbound and 69 serverbound play packets), `json-rpc-api-schema.json`, `biome_parameters/minecraft/{overworld,nether}.json`, and `minecraft/components/item/*.json` (1658 files). There is no `reports/items.json` since 26.1: "The report generator for item components has been renamed to "Default Components" and now outputs one file for each element that has default components" (https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1). 1.21.11 still wrote `items.json` with 1505 entries.

### `reports/blocks.json`: states only, no properties

1286 blocks, 35723 states. Each entry has `properties` (name to allowed values) and `states` (each with `id`, `properties`, and `default: true` on one). Verbatim:

```json
"minecraft:stone": {"states": [{"default": true, "id": 1}]}
```

```json
"minecraft:oak_stairs": {
  "properties": {"facing": ["north", "south", "west", "east"], "half": ["top", "bottom"],
                 "shape": ["straight", "inner_left", "inner_right", "outer_left", "outer_right"], "waterlogged": ["true", "false"]},
  "states": [{"id": 5463, "properties": {"facing": "north", "half": "top", "shape": "straight", "waterlogged": "true"}},
             ... 38 more ...
             {"default": true, "id": 5474, "properties": {"facing": "north", "half": "bottom", "shape": "straight", "waterlogged": "false"}},
             ...]}
```

There is no `definition` key in 26.3. The 26.3 changelog (https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3) says: "The `definition` field from the `blocks.json` data generation report has been removed". Running the same generator on 1.21.11, 26.1 and 26.2 shows what it was:

```json
"minecraft:stone":      {"definition": {"type": "minecraft:block", "properties": {}}, "states": [...]}
"minecraft:oak_stairs": {"definition": {"type": "minecraft:stair", "base_state": {"Name": "minecraft:oak_planks"}, "properties": {}}, ...}
"minecraft:oak_door":   {"definition": {"type": "minecraft:door", "block_set_type": "oak", "properties": {}}}
"minecraft:chest":      {"definition": {"type": "minecraft:chest", "close_sound": "minecraft:block.chest.close", "open_sound": "minecraft:block.chest.open", "properties": {}}}
"minecraft:water":      {"definition": {"type": "minecraft:liquid", "fluid": "minecraft:water", "properties": {}}}
"minecraft:sand":       {"definition": {"type": "minecraft:sand", "falling_dust_color": "#00dbd3a0", "properties": {}}}
"minecraft:oak_leaves": {"definition": {"type": "minecraft:tinted_particle_leaves", "leaf_particle_chance": 0.01, "properties": {}}}
```

In all three versions `definition.properties` was `{}` for every one of the 1166 to 1196 blocks. The report never carried hardness, explosion resistance, friction, light emission, map color, sound type or `requires_correct_tool_for_drops`; those are `BlockBehaviour.Properties` in code and no Mojang output lists them. What the `definition` did give was the block class and its constructor arguments: 263 distinct `type` values in 1.21.11, 265 in 26.2. The extra keys per class in 26.2: `color` 112, `block_set_type` 72, `weathering_state` 68, `base_state` 64, `wood_type` 60, `potted` 39, `dead` 20, `candle` 17, `concrete` 16, `experience` 16, `suspicious_stew_effects` 15, `ticks_to_stay_pressed` 14, `leaf_particle_chance` 11, `tree` 9, `close_sound` 9, `open_sound` 9, `kind` 9, `host` 7, `support_blocks` 6, `feature` 6, `particle_options` 6, and 26 rarer ones.

The 265 block classes of 26.2 (count of blocks using each), which is Java's inventory of block behaviors:

`block` 181, `slab` 64, `stair` 60, `rotated_pillar` 56, `flower_pot` 39, `wall` 32, `candle` 17, `candle_cake` 17, `door` 17, `shulker_box` 17, `trapdoor` 17, `banner` 16, `bed` 16, `concrete_powder` 16, `drop_experience` 16, `glazed_terracotta` 16, `stained_glass` 16, `stained_glass_pane` 16, `wall_banner` 16, `wool_carpet` 16, `button` 14, `flower` 14, `pressure_plate` 14, `fence` 13, `ceiling_hanging_sign` 12, `fence_gate` 12, `shelf` 12, `standing_sign` 12, `wall_hanging_sign` 12, `wall_sign` 12, `weathering_copper_full` 12, `sapling` 8, `infested` 6, `iron_bars` 6, `lantern` 6, `tinted_particle_leaves` 6, `base_coral_fan` 5, `base_coral_plant` 5, `base_coral_wall_fan` 5, `chain` 5, `coral` 5, `coral_fan` 5, `coral_plant` 5, `coral_wall_fan` 5, `skull` 5, `amethyst_cluster` 4, `copper_bulb_block` 4, `copper_chest` 4, `copper_golem_statue` 4, `lightning_rod` 4, `tall_flower` 4, `untinted_particle_leaves` 4, `wall_skull` 4, `waterlogged_transparent` 4, `weathering_copper_bar` 4, `weathering_copper_bulb` 4, `weathering_copper_chain` 4, `weathering_copper_chest` 4, `weathering_copper_door` 4, `weathering_copper_golem_statue` 4, `weathering_copper_grate` 4, `weathering_copper_slab` 4, `weathering_copper_stair` 4, `weathering_copper_trapdoor` 4, `weathering_lantern` 4, `weathering_lightning_rod` 4, `air` 3, `anvil` 3, `command` 3, `double_plant` 3, `huge_mushroom` 3, `torch` 3, `wall_torch` 3, `attached_stem` 2, `azalea` 2, `beehive` 2, `bonemealable_feature_placer` 2, `brushable` 2, `campfire` 2, `eyeblossom` 2, `flower_bed` 2, `jack_o_lantern` 2, `layered_cauldron` 2, `liquid` 2, `mushroom` 2, `nether_fungus` 2, `nether_roots` 2, `nylium` 2, `piston_base` 2, `powered_rail` 2, `redstone_ore` 2, `sand` 2, `stem` 2, `tall_grass` 2, `weighted_pressure_plate` 2, and 162 single-block classes: `amethyst`, `bamboo_sapling`, `bamboo_stalk`, `barrel`, `barrier`, `beacon`, `beetroot`, `bell`, `big_dripleaf`, `big_dripleaf_stem`, `blast_furnace`, `brewing_stand`, `bubble_column`, `budding_amethyst`, `bush`, `cactus`, `cactus_flower`, `cake`, `calibrated_sculk_sensor`, `carpet`, `carrot`, `cartography_table`, `cauldron`, `cave_vines`, `cave_vines_plant`, `chest`, `chiseled_book_shelf`, `chorus_flower`, `chorus_plant`, `cocoa`, `colored_falling`, `comparator`, `composter`, `conduit`, `crafter`, `crafting_table`, `creaking_heart`, `crop`, `crying_obsidian`, `daylight_detector`, `decorated_pot`, `detector_rail`, `dirt_path`, `dispenser`, `dragon_egg`, `dried_ghast`, `dropper`, `dry_vegetation`, `enchantment_table`, `end_gateway`, `end_portal`, `end_portal_frame`, `end_rod`, `ender_chest`, `farmland`, `fire`, `firefly_bush`, `frogspawn`, `frosted_ice`, `furnace`, `glow_lichen`, `grass`, `grindstone`, `half_transparent`, `hanging_moss`, `hanging_roots`, `hay`, `heavy_core`, `honey`, `hopper`, `ice`, `infested_rotated_pillar`, `jigsaw`, `jukebox`, `kelp`, `kelp_plant`, `ladder`, `lava_cauldron`, `leaf_litter`, `lectern`, `lever`, `light`, `lily_pad`, `loom`, `magma`, `mangrove_leaves`, `mangrove_propagule`, `mangrove_roots`, `mossy_carpet`, `moving_piston`, `mud`, `multiface`, `mycelium`, `nether_portal`, `nether_sprouts`, `nether_wart`, `netherrack`, `note`, `observer`, `piglinwallskull`, `piston_head`, `pitcher_crop`, `player_head`, `player_wall_head`, `pointed_dripstone`, `potato`, `potent_sulfur`, `powder_snow`, `powered`, `pumpkin`, `rail`, `redstone_lamp`, `redstone_torch`, `redstone_wall_torch`, `redstone_wire`, `repeater`, `respawn_anchor`, `rooted_dirt`, `scaffolding`, `sculk`, `sculk_catalyst`, `sculk_sensor`, `sculk_shrieker`, `sculk_vein`, `sea_pickle`, `seagrass`, `short_dry_grass`, `slime`, `small_dripleaf`, `smithing_table`, `smoker`, `sniffer_egg`, `snow_layer`, `snowy_dirt`, `soul_fire`, `soul_sand`, `spawner`, `sponge`, `spore_blossom`, `stonecutter`, `structure`, `structure_void`, `sugar_cane`, `sulfur_spike`, `sweet_berry_bush`, `tall_dry_grass`, `tall_seagrass`, `target`, `test`, `test_instance`, `tinted_glass`, `tnt`, `torchflower_crop`, `transparent`, `trapped_chest`, `trial_spawner`, `trip_wire_hook`, `tripwire`, `turtle_egg`, `twisting_vines`, `twisting_vines_plant`, `vault`, `vine`, `web`, `weeping_vines`, `weeping_vines_plant`, `wet_sponge`, `wither_rose`, `wither_skull`, `wither_wall_skull`.

Only 181 of 1196 blocks are the plain `block` class; 1015 blocks use one of 264 specialized classes. Bedrock's `internal_vanilla_data.block_archetype` in its 98 block files (`slab_block`, `stair_block`, `wall_foliage_block`) is the same idea with three public names.

### Default item components: complete

1658 files, one per item in the `minecraft:item` registry (1658 entries). Verbatim, `reports/minecraft/components/item/diamond_pickaxe.json`:

```json
{"components": {
  "minecraft:attack_animation": {},
  "minecraft:attribute_modifiers": [
    {"type": "minecraft:attack_damage", "amount": 4.0, "id": "minecraft:base_attack_damage", "operation": "add_value", "slot": "mainhand"},
    {"type": "minecraft:attack_speed", "amount": -2.799999952316284, "id": "minecraft:base_attack_speed", "operation": "add_value", "slot": "mainhand"}],
  "minecraft:break_sound": "minecraft:entity.item.break",
  "minecraft:damage": 0,
  "minecraft:enchantable": {"value": 10},
  "minecraft:enchantments": {},
  "minecraft:interact_animation": {},
  "minecraft:item_model": "minecraft:diamond_pickaxe",
  "minecraft:item_name": {"translate": "item.minecraft.diamond_pickaxe"},
  "minecraft:lore": [],
  "minecraft:max_damage": 1561,
  "minecraft:max_stack_size": 1,
  "minecraft:rarity": "common",
  "minecraft:repair_cost": 0,
  "minecraft:repairable": {"items": "#minecraft:diamond_tool_materials"},
  "minecraft:tool": {"rules": [
    {"blocks": "#minecraft:incorrect_for_diamond_tool", "correct_for_drops": false},
    {"blocks": "#minecraft:mineable/pickaxe", "correct_for_drops": true, "speed": 8.0}]},
  "minecraft:tooltip_display": {},
  "minecraft:use_effects": {},
  "minecraft:weapon": {"item_damage_per_attack": 2}}}
```

`apple.json`:

```json
{"components": {
  "minecraft:attack_animation": {}, "minecraft:attribute_modifiers": [], "minecraft:break_sound": "minecraft:entity.item.break",
  "minecraft:compostable": {"layers": "minecraft:compostable/medium"},
  "minecraft:consumable": {},
  "minecraft:enchantments": {},
  "minecraft:food": {"nutrition": 4, "saturation": 2.4},
  "minecraft:interact_animation": {}, "minecraft:item_model": "minecraft:apple", "minecraft:item_name": {"translate": "item.minecraft.apple"},
  "minecraft:lore": [], "minecraft:max_stack_size": 64, "minecraft:rarity": "common", "minecraft:repair_cost": 0,
  "minecraft:tooltip_display": {}, "minecraft:use_effects": {}}}
```

The `data_component_type` registry has 122 entries. Thirteen appear on every item (`attack_animation`, `attribute_modifiers`, `break_sound`, `enchantments`, `interact_animation`, `item_model`, `item_name`, `lore`, `max_stack_size`, `rarity`, `repair_cost`, `tooltip_display`, `use_effects`); the rest are present only where they apply. Tool speed is a tag lookup: `tags/block/mineable/pickaxe.json` has 449 values, and `incorrect_for_wooden_tool` is `["#minecraft:needs_diamond_tool", "#minecraft:needs_iron_tool", "#minecraft:needs_stone_tool"]`. Base break time still needs the block's hardness, which is in code (above).

### Everything else in `reports/`

`registries.json` has 95 registries with `protocol_id` per entry; `minecraft:block` 1286, `minecraft:item` 1658, `minecraft:entity_type` 161, `minecraft:block_entity_type` 49, `minecraft:sound_event` 1991, `minecraft:particle_type` 128, `minecraft:mob_effect` 40, `minecraft:potion` 46, `minecraft:attribute` 40, `minecraft:game_rule` 59. `commands.json` is the Brigadier tree with 94 root commands. `biome_parameters/minecraft/overworld.json` expands the `minecraft:overworld` multi-noise preset into 7594 parameter points over 56 biomes; `nether.json` has 5 points over 5 biomes.

### misode/mcmeta as a fallback

Not needed here, but checked. `git ls-remote https://github.com/misode/mcmeta` on 2026-10-24: `data` = `991b9973a3a2930b5240dba6a39b1f2eb1f11eca`, `summary` = `f41a317b67b4e08155bf8b2ac3e853516d1fd889`, `registries` = `0fdeca63f4a6350d84bafc9b7e00f13109f32f4e`; per-version tags `26.3-data` = `538b2b167248c648b2198f2c0d56eced10dfc0cf`, `26.3-summary` = `d96c75fec200c4580dd75e033a76341521165461`, `26.3-registries` = `2240df2376509bfaf12becbb36e156e29f8ecb4d`. The `summary` head's `version.json` is `26.4-snapshot-5` with `data_pack_version 125`. Its README "Sources": "Version manifest ... client and server jars by following links", "Data generator using the following commands (depending on version): `java -cp server.jar net.minecraft.data.Main --reports`, `java -DbundlerMainClass=net.minecraft.data.Main -jar server.jar --reports`", and "Slicedlime's examples repo for worldgen changes before 1.18-pre1". Its `summary/blocks/data.json` is a condensed state table and its `summary/item_components/data.json` is "The default item components added in 1.20.5"; neither adds anything the generator does not emit.

## 3. What is not data-driven in Java

### Blocks

Block identity (the registry), block states (property names, values, order, numeric ids), and block properties (hardness, resistance, friction, light, map color, sound, tool requirement, collision shape) are code. The datapack cannot add, remove or alter a block; `minecraft:block` is `elements: false` in `datapack.json`. What data touches blocks: loot tables (1201 `loot_table/blocks/*.json`), tags (300 files, including `mineable/*`, `needs_*_tool`), `block_transformer` (3 files for axe, shovel, hoe), and worldgen. The client-side `assets/minecraft/blockstates/*.json` maps states to models and is rendering, not behavior.

### Entities

`minecraft:entity_type` is `elements: false`. There is no entity folder in `data/minecraft/`. The AI registries are code: `attribute` 40 (`max_health`, `movement_speed`, `attack_damage`, `follow_range`, `scale`, ...), `memory_module_type` 115, `sensor_type` 24, `activity` 26, `entity_sub_predicate_type` 25. The data-side entity surface is: variant registries with `spawn_conditions` (for example `cat_variant/all_black.json` spawns at `moon_brightness` 0.9 or in `#minecraft:cats_spawn_as_black` structures), `sulfur_cube_archetype` (attribute modifiers for one mob), `trial_spawner`, biome `attributes.minecraft:gameplay/natural_mob_spawns` (weights, group sizes, spawn costs), and loot (109 `loot_table/entities/*.json`). Entity dimensions, drops-by-code (experience), goals and brains are Java.

### Items

Components were introduced in snapshot 24w09a and release 1.20.5: "We are making some large changes to how Item Stack-specific properties are stored and represented in this snapshot, replacing the current NBT 'tag' with structured components" and "Default component values for items are now listed in `items.json` generated in `reports`" (https://www.minecraft.net/en-us/article/minecraft-snapshot-24w09a and https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-5). Later additions, each from the named release article on minecraft.net:

- 1.21.2 (`.../minecraft-java-edition-1-21-2`), "New Item Components": `consumable`, `use_remainder`, `use_cooldown`, `enchantable`, `repairable`, `equippable`, `glider`, `tooltip_style`, `death_protection`, `item_model`; `food` "has been changed to become a data container which only holds the food stats"; `fire_resistant` became `damage_resistant` with a `types` field.
- 1.21.5 (`.../minecraft-java-edition-1-21-5`): `weapon` ("When present, the "Item Used" statistic will be incremented for each attack with the item" and `item_damage_per_attack`), `blocks_attacks` ("this item can be used like a Shield"), `break_sound`, `provides_banner_patterns`, `provides_trim_material`, `tooltip_display`, `potion_duration_scale`; `tool` gained `can_destroy_blocks_in_creative`.
- 1.21.11 (`.../minecraft-java-edition-1-21-11`): `use_effects`, `minimum_attack_charge`, `attack_range`, `kinetic_weapon` ("a charge-type attack when using the item (primarily for Spears)"), `piercing_weapon`.
- 26.3 (`.../minecraft-java-edition-26-3`): `cooking_fuel`, `block_transformer`, `compostable`, `villager_food`, `mob_visibility`.

Items whose components describe nothing beyond stack size and durability, so their behavior is Java code (from the 26.3 report, listing only components outside the thirteen common ones):

| Item | Components beyond the common set |
|---|---|
| `bucket`, `water_bucket`, `spyglass`, `bone_meal`, `lead`, `name_tag`, `snowball`, `compass`, `map`, `ender_eye`, `minecart`, `armor_stand`, `painting`, `item_frame`, `torch` | none |
| `bow` | `cooking_fuel`, `damage`, `enchantable {value: 1}`, `max_damage 384` |
| `crossbow` | as bow plus `charged_projectiles []`, `max_damage 465` |
| `fishing_rod` | `cooking_fuel`, `damage`, `enchantable`, `max_damage 64` |
| `flint_and_steel`, `brush`, `carrot_on_a_stick` | `damage`, `max_damage` |
| `ender_pearl` | `use_cooldown {seconds: 1.0}` |
| `wind_charge` | `use_cooldown {seconds: 0.5}` |
| `egg` | `chicken/variant` |
| `splash_potion` | `potion_contents {}` |
| `filled_map` | `map_decorations {}` |

Items whose behavior components do describe them: `shield` (`blocks_attacks` with `block_delay_seconds`, `bypassed_by`, `item_damage`), `elytra` (`equippable` slot chest plus `glider`), `totem_of_undying` (`death_protection` with effects), `golden_apple`, `honey_bottle`, `milk_bucket` (`consumable` with `on_consume_effects`, `use_remainder`), `chorus_fruit` (`teleport_randomly` consume effect), `copper_spear` (`attack_range`, `kinetic_weapon`, `piercing_weapon`, `damage_type: minecraft:spear`), `iron_shovel` and `iron_hoe` (`block_transformer`), `saddle` and `wolf_armor` (`equippable` with `allowed_entities`), `goat_horn` (`instrument`), music discs (`jukebox_playable`). The 8 `crafting_special_*` recipe serializers (firework, banner duplication, shield decoration, book cloning, map extending, repair) are code behind a one-line JSON stub.

### Other code

Fluids (5 entries, `elements: false`), potions and effects (46, 40), game events, particles, block entities (49), creative tabs (14), villager professions and types, commands and their argument types, the `*_type` registries that name every implementation a JSON file can reference.

## 4. Java worldgen as data

Everything below is in `data/minecraft/worldgen/` (1144 files) plus `dimension_type/` (4 files). `world_preset/normal.json` is the entry point:

```json
{"dimensions": {
  "minecraft:overworld":  {"type": "minecraft:overworld",  "generator": {"type": "minecraft:noise", "biome_source": {"type": "minecraft:multi_noise", "preset": "minecraft:overworld"}, "settings": "minecraft:overworld"}},
  "minecraft:the_end":    {"type": "minecraft:the_end",    "generator": {"type": "minecraft:noise", "biome_source": {"type": "minecraft:the_end"}, "settings": "minecraft:end"}},
  "minecraft:the_nether": {"type": "minecraft:the_nether", "generator": {"type": "minecraft:noise", "biome_source": {"type": "minecraft:multi_noise", "preset": "minecraft:nether"}, "settings": "minecraft:nether"}}}}
```

Chunk generators: `noise`, `flat`, `debug`. Biome sources: `fixed`, `multi_noise`, `checkerboard`, `the_end`. 7 world presets, 9 flat presets.

### `noise_settings` (7 files: overworld, amplified, large_biomes, caves, floating_islands, nether, end)

`overworld.json` top-level keys in 26.3: `aquifers`, `debug_functions`, `default_block` (`minecraft:stone`), `default_fluid` (`minecraft:water`), `disable_mob_generation` (false), `legacy_random_source` (false), `material_rule` (`"minecraft:overworld"`, a reference), `noise` (`{"height": 384, "min_y": -64}`), `noise_router`, `sea_level` (63), `spawn_target`. 26.3 renamed and restructured this file; the changelog says "The `surface_rule` field has been renamed to `material_rule`. Format: inline Material Rule or Material Rule ID reference", "The `final_density` field no longer has the `beardifier` Density Function implicitly added to the final result", "Renamed `preliminary_surface_level` to `chunk_surface_level`. This Density Function is no longer implicitly interpolated across the entire chunk", and "The `aquifers_enabled` field has been replaced by an optional `aquifers` object: If not present, no aquifers will be generated". `ore_veins_enabled` is gone; ore veins are now a `material_rule` type (`ore_vein`) fed by the `overworld/ore_vein/*` density functions.

- `noise_router` has eight entries, all references: `chunk_surface_level`, `continents`, `depth`, `erosion`, `final_density`, `ridges`, `temperature`, `vegetation`, each `minecraft:overworld/<name>`.
- `aquifers` has `barrier`, `exclusion`, `fluid_level_floodedness`, `fluid_level_spread`, `lava`, `surface_level`, each a density function (`barrier` is `{"type": "minecraft:noise", "noise": "minecraft:aquifer_barrier", "xz_scale": 1.0, "y_scale": 0.5}`).
- `spawn_target` is a list of two parameter boxes over `continents`, `erosion`, `ridges`, `temperature`, `vegetation` (for example `ridges [-1.0, -0.16]` and `[0.16, 1.0]`).
- `debug_functions` labels functions for the F3 screen.
- The material rule for the overworld is `worldgen/material_rule/overworld.json` (388 bytes): a `sequence` with a `condition` on `above_preliminary_surface` that references the `overworld/` subfolder. 42 `material_rule` files and 8 `material_condition` files exist because 26.3 made both referenceable registries. Rule types: `block`, `bandlands`, `sequence`, `condition`, `ore_vein`. Condition types (11): `biome`, `noise_threshold`, `vertical_gradient`, `y_above`, `water`, `temperature`, `steep`, `not`, `hole`, `above_preliminary_surface`, `stone_depth`.

### Density functions

55 files: `overworld/` 27 (`base_3d_noise`, `caves/{entrances,noodle,pillars,spaghetti_2d,spaghetti_2d_thickness_modulator,spaghetti_roughness_function}`, `chunk_surface_level`, `continents`, `depth`, `erosion`, `factor`, `final_density`, `jaggedness`, `offset`, `ore_vein/{copper_density,gap,iron_density,mask,richness,toggle}`, `preliminary_surface_level`, `ridges`, `ridges_folded`, `sloped_cheese`, `temperature`, `vegetation`), `overworld_amplified/` 8, `overworld_large_biomes/` 12, `nether/` 1, `end/` 3, root 4 (`shift_x`, `shift_z`, `y`, `zero`). 64 `noise/` files supply the octave definitions they reference.

The `density_function_type` registry has 44 operators: `constant`, `blend_alpha`, `blend_offset`, `beardifier`, `noise`, `end_outer_islands`, `distance_to_point`, `gradient`, `shift_a`, `shift_b`, `shift`, `abs`, `square`, `cube`, `sqrt`, `half_negative`, `quarter_negative`, `reciprocal`, `negate`, `squeeze`, `log`, `sign`, `floor`, `round`, `ceil`, `truncate`, `add`, `sub`, `mul`, `div`, `min`, `max`, `pow`, `spline`, `lerp`, `clamp`, `range_choice`, `interval_select`, `cache`, `blend_density`, `interpolated`, `slice`, `find_top_surface`, `old_blended_noise`. Vanilla uses 33 of them (counts across all files: `add` 70, `noise` 65, `mul` 64, `cache` 32, `gradient` 29, `lerp` 29, `range_choice` 21, `sub` 19, `min` 18, `clamp` 18, `interpolated` 17, `abs` 12, `max` 11, `blend_alpha` 9, `spline` 9, `squeeze` 7, `blend_density` 7, `beardifier` 7, `quarter_negative` 6, `square` 3, `find_top_surface` 3, `div` 3, `blend_offset` 3, `half_negative` 3, `old_blended_noise` 3, `interval_select` 3, `cube` 2, `shift_a`, `shift_b`, `negate`, `slice`, `distance_to_point`, `end_outer_islands` 1 each). `spline` carries the terrain shape as cubic splines over `continents`, `erosion`, `ridges_folded`; `old_blended_noise` is the 3D terrain noise. 26.2 added `interval_select` and removed `weird_scaled_sampler`; 1.21.9 added `find_top_surface` and made the surface level a 2D function.

### Biomes and the multi-noise source

67 biome files. `plains.json` keys: `attributes`, `carvers`, `downfall`, `effects`, `features`, `has_precipitation`, `temperature`. `carvers` is `["minecraft:cave", "minecraft:cave_extra_underground", "minecraft:canyon"]`; `features` is 11 lists, one per decoration step (plains: 0, 2, 1, 2, 0, 0, 29, 0, 2, 11, 1 placed features); `effects` is `{"water_color": "#3f76e4"}`. Mob spawns moved in 26.3 from `spawners`/`spawn_costs` to `attributes["minecraft:gameplay/natural_mob_spawns"]` (changelog: "Removed the `spawners`, `spawn_costs`, and `creature_spawn_probability` fields. These values have been moved to the new Environment Attributes"). Plains spawns, verbatim shape: `{"argument": {"spawn_costs": {}, "spawns_by_category": {"ambient": [{"type": "minecraft:bat", "count": 8, "weight": 10}], "creature": [{"type": "minecraft:sheep", "count": 4, "weight": 12}, ...], "monster": [...], "underground_water_creature": [...]}}, "modifier": "overlay"}`. Attribute keys used across the 67 biomes: `gameplay/natural_mob_spawns` 67, `visual/sky_color` 57, `audio/background_music` 43, `visual/water_fog_color` 9, `visual/fog_color` 9, `gameplay/increased_fire_burnout` 8, `gameplay/snow_golem_melts` 7, `gameplay/creature_world_gen_spawn_probability` 5, `audio/ambient_sounds` 5, `visual/ambient_particles` 4, and three rarer. The `environment_attribute` registry has 51 attributes (1.21.11: "Environment Attributes provide a data-driven way to control a variety of visual and gameplay systems").

`multi_noise_biome_source_parameter_list/overworld.json` is `{"preset": "minecraft:overworld"}`; the preset is code, and `reports/biome_parameters/minecraft/overworld.json` expands it to 7594 entries of the form `{"biome": "minecraft:mushroom_fields", "parameters": {"continentalness": [-1.2, -1.05], "depth": 0.0, "erosion": [-1.0, 1.0], "humidity": [-1.0, 1.0], "offset": 0.0, "temperature": [-1.0, 1.0], "weirdness": [-1.0, 1.0]}}`. A datapack may supply an inline `biomes` list in the same shape. `dimension_type/overworld.json` has `ambient_light`, `attributes` (11 keys), `coordinate_scale`, `default_clock`, `has_ceiling`, `has_ender_dragon_fight`, `has_skylight`, `height`, `infiniburn`, `logical_height`, `min_y`, `monster_spawn_block_light_limit`, `monster_spawn_light_level`, `timelines`.

### Carvers

Registry: `cave`, `canyon`. Vanilla files: `cave.json`, `cave_extra_underground.json`, `nether_cave.json` (type `cave`), `canyon.json`. `cave.json`: `probability 0.15`, `y`, `yScale`, `lava_level`, `horizontal_radius_multiplier`, `vertical_radius_multiplier`, `floor_level`, `thickness`, `weird_thickness_bias`, `room_vertical_radius_multiplier`, `count` (`very_biased_to_bottom` 0 to 14). The parameters are data; the tunnel walk is code.

### Features and placement

`feature_type` registry, 58 entries: `bamboo`, `block_blob`, `block_column`, `block_pile`, `blue_ice`, `bonus_chest`, `chorus_plant`, `coral_claw`, `coral_tree`, `delta_feature`, `disk`, `end_gateway`, `end_island`, `end_platform`, `end_podium`, `end_spike`, `fallen_tree`, `fill_layer`, `fossil`, `freeze_top_layer`, `geode`, `huge_brown_mushroom`, `huge_fungus`, `huge_red_mushroom`, `iceberg`, `lake`, `large_dripstone`, `monster_room`, `multiface_growth`, `netherrack_replace_blobs`, `no_op`, `ore`, `overlay`, `projected_random_patchy_square`, `random_boolean_selector`, `random_neighbor_spread`, `random_selector`, `replace_single_block`, `root_system`, `scattered_ore`, `sculk_patch`, `sequence`, `simple_block`, `simple_random_selector`, `single_block_pillar`, `speleothem`, `speleothem_cluster`, `spike`, `spring_feature`, `stepped_column_cluster`, `template`, `tree`, `underwater_magma`, `vegetation_patch`, `vines`, `void_start_platform`, `waterlogged_vegetation_patch`, `weighted_random_selector`. The 240 vanilla `feature/` files use 47 of them (`tree` 45, `simple_block` 37, `ore` 30, `random_selector` 21, `overlay` 10, `weighted_random_selector` 8, ...). Trees compose 10 trunk placers, 12 foliage placers, 11 tree decorators, 1 root placer and 2 feature sizes; block choice uses 10 `block_state_provider` types; ore targets use 10 `rule_test` types.

`placement_modifier_type` registry, 18 entries: `block_predicate_filter`, `rarity_filter`, `random_chance`, `surface_relative_threshold_filter`, `surface_water_depth_filter`, `biome`, `count`, `noise_based_count`, `noise_threshold_count`, `count_on_every_layer`, `cuboid`, `environment_scan`, `heightmap`, `height_range`, `in_square`, `offset`, `randomly_selected`, `fixed_placement`. The 273 `placed_feature/` files use 15 (`biome` 211, `count` 201, `in_square` 198, `block_predicate_filter` 155, `heightmap` 111, `offset` 93, `height_range` 86, `rarity_filter` 55, `surface_water_depth_filter` 26, `environment_scan` 12, `count_on_every_layer` 8, `noise_threshold_count` 6, `noise_based_count` 4, `surface_relative_threshold_filter` 3, `fixed_placement` 1), with 16 `block_predicate_type`s, 6 height providers, 8 int providers and 4 float providers. `placed_feature/ore_diamond.json`, verbatim:

```json
{"feature": "minecraft:ore_diamond_small", "placement": [
  {"type": "minecraft:count", "count": 7}, {"type": "minecraft:in_square"},
  {"type": "minecraft:height_range", "height": {"type": "minecraft:trapezoid", "max_inclusive": {"above_bottom": 80}, "min_inclusive": {"above_bottom": -80}}},
  {"type": "minecraft:biome"}]}
```

### Structures

`structure_type` registry, 16 entries: `buried_treasure`, `desert_pyramid`, `end_city`, `fortress`, `igloo`, `jigsaw`, `jungle_temple`, `mineshaft`, `nether_fossil`, `ocean_monument`, `ocean_ruin`, `ruined_portal`, `shipwreck`, `stronghold`, `swamp_hut`, `woodland_mansion`. The 52 `structure/` files: `jigsaw` 28 (villages, bastions, pillager outposts, ancient city, trail ruins, trial chambers, abandoned camp), `ruined_portal` 7, `mineshaft` 2, `ocean_ruin` 2, `shipwreck` 2, one each of the rest. `village_plains.json`: `{"type": "minecraft:jigsaw", "biomes": "#minecraft:has_structure/village_plains", "max_distance_from_center": 80, "project_start_to_heightmap": "WORLD_SURFACE_WG", "size": 6, "spawn_overrides": {}, "start_height": {"absolute": 0}, "start_pool": "minecraft:village/plains/town_centers", "step": "surface_structures", "terrain_adaptation": "beard_thin", "use_expansion_hack": true}`. The 15 non-jigsaw types are code with a biome tag and a few fields each; `worldgen/structure_piece` has 56 code-defined piece types.

21 `structure_set/` files; `structure_placement` types `concentric_rings` (strongholds), `dimension_origin`, `random_spread` (the other 20). `villages.json`: `{"placement": {"type": "minecraft:random_spread", "salt": 10387312, "separation": 8, "spacing": 34}, "structures": [{"structure": "minecraft:village_plains", "weight": 1}, ...]}`.

245 `template_pool/` files with 2281 elements: `legacy_single_pool_element` 1663, `single_pool_element` 527, `feature_pool_element` 57, `empty_pool_element` 31, `list_pool_element` 3. 40 `processor_list/` files using 4 of the 11 `structure_processor` types (`rule` 35, `protected_blocks` 7, `block_rot` 6, `capped` 4; unused: `blackstone_replace`, `block_age`, `block_ignore`, `gravity`, `jigsaw_replacement`, `lava_submerged_block`, `nop`), with 10 `rule_test`, 3 `pos_rule_test` and 4 `rule_block_entity_modifier` types. 3 `pool_alias_binding` types.

### What a server must implement to run this

The noise chunk generator (cell interpolation, the `noise_router` contract, aquifers, the material rule evaluator, `beardifier` and `blend_*` against structures and legacy chunks), the 44 density function operators including splines and `old_blended_noise`, the multi-noise lookup, the two carver algorithms, the 58 feature algorithms with their placers and decorators, the 18 placement modifiers, 16 structure algorithms plus jigsaw assembly with 5 element types and 11 processors, 3 structure placement algorithms, and the height, int, float, block-state-provider and block-predicate providers. Vanilla exercises 33 density operators, 47 features, 15 modifiers, 2 carvers, 16 structure types, 4 processors. Mojang publishes no specification of any of these beyond the JSON schema implied by the files and the changelog prose; the reference is the decompiled client.

## 5. Licensing of the Java data

Not legal advice. Texts as published.

EULA (https://www.minecraft.net/en-us/eula): "When you buy our games, that means you can download, install, and play them. For the server version of Minecraft: Java Edition, you can install it on a server and host online play. However, you must not distribute anything we've made unless we specifically agree to it. By "distribute anything we've made" what we mean is: give copies of our game software or content to anyone else; make commercial use of anything we've made; ..." and "In order to ensure the integrity of our games, we need all game downloads and updates to come from a source that we authorize." The Bedrock note already quotes the "USING mods" section and the Usage Guidelines; the same texts govern the Java jar and its generated output.

misode/mcmeta (https://github.com/misode/mcmeta): no `LICENSE` file on `master`, `summary` or `data` (raw fetch returns 404). README "Disclaimer", verbatim: "mcmeta is not an official Minecraft product, and is not endorsed by or associated with Mojang Studios. All data and assets were obtained through Mojang's internal data generator and public API. If Mojang ever has something against this data existing here, the repository will be promptly removed."

PrismarineJS/minecraft-data (https://github.com/PrismarineJS/minecraft-data, `master` = `5e063fa99cfe8ded065ec6788b66696b7e4ef143`): README section "License", verbatim: "MIT. Some of the data was extracted manually or automatically from wiki.vg and minecraft.gamepedia.com. If required by one of the sources the license might change to something more appropriate." No `LICENSE`, `LICENSE.md`, `LICENCE` or `LICENSE.txt` exists at that commit's root (all 404 on raw.githubusercontent.com). Its README credits "burger with burger-extractor ... minecraft server jar ... used to provide items, blocks, biomes and recipes", the "Minecraft data generator" for commands, and "minecraft-data-generator ... minecraft client" (a Fabric mod) for "biomes, block collision shapes, blocks, effects, enchantments, entities, foods, items, particles, tints". The CC0 republishers named in the Bedrock note (pmmp/BedrockData, AllayMC/BedrockData) are Bedrock projects; minecraft-data is MIT by its own statement.

## 6. Fit for a Bedrock server

Bedrock column from [bedrock-data-extraction.md](bedrock-data-extraction.md) sections 2 to 4 (BDS 1.26.51.1, bedrock-samples v1.26.50.4).

| Category | Java datapack (26.3) | Bedrock behavior pack (1.26.51) | Richer |
|---|---|---|---|
| Blocks | none; 1286 blocks are code, properties never reported | 98 of 1463 as JSON with mining time, resistance, map color, loot, archetype; the rest code | Bedrock, slightly |
| Block states | `reports/blocks.json`: names, values, ids for 35723 states (generated, read-only) | `mojang-blocks.json` names and global domains; per-block domains only from a saved world | Java (complete per-block domains) |
| Items | 1658 default-component files, 122 component types, behavior for food, tools, armor, weapons, shields, elytra, totems, spears | 74 items as JSON (foods, bundles, spears, seeds); 46 documented components; tools, armor, bows, shields, buckets, elytra are code | Java |
| Entities | none; 161 types, attributes, brains, sensors are code; variants and spawn lists are data | 130 entities as JSON: 379 component keys, 174 `behavior.*` goals, component groups, events | Bedrock |
| Loot | 1447 tables, 9 entry types, 42 modifiers, 20 conditions, predicates and item modifiers as files; block loot for all 1201 drop-bearing blocks | 309 tables; block loot only for the 98 data-driven blocks | Java |
| Recipes | 2042, 22 serializers, brewing as data since 26.3 | 1892, 6 types including `recipe_brewing_mix` | Java |
| Tags | 883 files over 16 registries, referenced by tools, loot, worldgen, trades | tags inside entity, item and block files plus `query.any_tag` in Molang; no tag files | Java |
| Biomes | 67 files: climate, effects, carvers, 11 feature steps, spawns, attributes | 89 files: climate, surface builder, tags, nether multinoise weights; overworld placement components marked unused | Java |
| Terrain | noise settings, density functions, splines, aquifers, material rules, multi-noise parameters | engine code, no parameters ("The terrain generation pass doesn't offer much customization") | Java |
| Carvers | 4 configured carvers over 2 types | 3 carver feature definitions under `definitions/features/`, algorithm engine | Java |
| Features | 240 configured + 273 placed over 58 types and 18 modifiers | 210 features + 241 feature rules over 25 types, Molang distributions | Java (more types, modifiers as a stack); Bedrock has Molang |
| Structures | 52 structures over 16 types, 21 sets, 245 pools, 40 processor lists, 1511 NBT | 1311 NBT pieces, jigsaw JSON for trail ruins and abandoned camps only; other assembly engine | Java |
| Spawning | per-biome weights, counts, costs under `natural_mob_spawns`; caps and light rules in code and `dimension_type` | 60 spawn rules with brightness, difficulty, herds, biome filters; pool caps engine | Bedrock (per-mob conditions), Java (per-biome lists) |
| Trading | 391 trades, 68 trade sets, tags, since 26.1 | 27 trade tables | Java |
| Enchantments | 43 with cost curves and 31 effect component types | 42 names in `mojang-enchantments.json`, no definitions ("Max enchantment levels are hard-coded") | Java |
| Damage types | 51 files with scaling and exhaustion, tags | none as files (damage causes are enum values in entity JSON) | Java |
| Advancements | 1866 with 58 triggers | none (achievements are code) | Java |

### Identifier differences

Checked Java's `minecraft:block` and `minecraft:item` registries against this repository's Bedrock captures: `packages/minecraft/datagen/snapshot/v2193/block-palette.json` (`states`, 1477 block names from BDS 1.26.51.1) and `packages/bedrock-data/src/jsp/required_item_list.json` (2076 item names from `ItemRegistryPacket`). `packages/bedrock-data/src/jsp/block_id_map.json` (553 names such as `minecraft:wool`, `minecraft:concrete`, `minecraft:stonebrick`) is the legacy table and should not be used for name matching.

Blocks: 1102 of 1286 Java names exist in the Bedrock palette; 184 are Java-only and 375 Bedrock-only. The Java-only names are one block in Java where Bedrock has none or has several: 16 `*_bed` (Bedrock `bed`), 32 `*_banner` and `*_wall_banner` (Bedrock `standing_banner`, `wall_banner`), 39 `potted_*` (Bedrock `flower_pot` with a block entity), 13 `*_sign` and 13 `*_wall_hanging_sign` (Bedrock `*_standing_sign`), `oak_wall_sign` and `dark_oak_wall_sign` (Bedrock `wall_sign`, `darkoak_wall_sign`), 7 `*_wall_head` and `*_wall_skull`, `wall_torch`, `redstone_wall_torch`, `soul_wall_torch`, `comparator`, `repeater`, `piston_head`, `moving_piston`, `cave_air`, `void_air`, `water_cauldron`, `lava_cauldron`, `powder_snow_cauldron`, `kelp_plant`, `cave_vines_plant`, `twisting_vines_plant`, `weeping_vines_plant`, `tall_seagrass`, plus renamed singles. Bedrock-only names are 93 `*_double_slab`, 120 `element_*`, 16 `light_block_*`, 34 `hard_*glass*`, 13 `*standing_sign`, `lit_furnace`, `lit_blast_furnace`, `lit_smoker`, `lit_redstone_ore`, `lit_deepslate_redstone_ore`, `lit_redstone_lamp`, `lit_pumpkin`, `unlit_redstone_torch`, `powered_repeater`, `unpowered_repeater`, `powered_comparator`, `unpowered_comparator`, `flowing_water`, `flowing_lava`, `daylight_detector_inverted`, `piston_arm_collision`, `sticky_piston_arm_collision`, `moving_block`, `invisible_bedrock`, `allow`, `deny`, `border_block`, `camera`, `chalkboard`, `portal`, `info_update`, `reserved6`, `unknown`, and the education chemistry blocks.

Renames between the two, found in that pass: Java `cobweb` / Bedrock `web`; `dead_bush` / `deadbush`; `dirt_path` / `grass_path`; `lily_pad` / `waterlily`; `magma_block` / `magma`; `slime_block` / `slime`; `spawner` / `mob_spawner`; `note_block` / `noteblock`; `melon` / `melon_block`; `bricks` / `brick_block`; `nether_bricks` / `nether_brick`; `red_nether_bricks` / `red_nether_brick`; `end_stone_bricks` / `end_bricks`; `end_stone_brick_stairs` / `end_brick_stairs`; `prismarine_brick_stairs` / `prismarine_bricks_stairs`; `nether_quartz_ore` / `quartz_ore`; `nether_portal` / `portal`; `powered_rail` / `golden_rail`; `sugar_cane` / `reeds`; `snow_block` / `snow` and `snow` / `snow_layer`; `stone_slab` / `normal_stone_slab`; `cobblestone_stairs` / `stone_stairs`; `jack_o_lantern` / `lit_pumpkin`; `terracotta` / `hardened_clay`; `light_gray_glazed_terracotta` / `silver_glazed_terracotta`; `rooted_dirt` / `dirt_with_roots`; `small_dripleaf` / `small_dripleaf_block`; `frogspawn` / `frog_spawn`; `flowering_azalea_leaves` / `azalea_leaves_flowered`; `shulker_box` / `undyed_shulker_box`; `waxed_copper_block` / `waxed_copper`; `tripwire` / `trip_wire`; `oak_door` / `wooden_door`; `oak_trapdoor` / `trapdoor`; `oak_fence_gate` / `fence_gate`; `oak_button` / `wooden_button`; `oak_pressure_plate` / `wooden_pressure_plate`; `beetroots` / `beetroot`; `light` / `light_block_<n>`; `oak_sign` + `oak_wall_sign` / `standing_sign` + `wall_sign`; `dark_oak_*` signs / `darkoak_*`. Names that match on both sides include `grass_block`, `short_grass`, `tall_grass`, `oak_log`, `oak_stairs`, `oak_slab`, `white_wool`, `white_concrete`, `white_carpet`, `oak_leaves`, `oak_fence`, `stone_bricks`, `cobblestone_wall`, `red_sandstone_wall`, `dandelion`, `poppy`, `wheat`, `carrots`, `potatoes`, `furnace`, `redstone_torch`, `water`, `smooth_stone_slab`, `cave_vines` (Bedrock adds `cave_vines_body_with_berries` and `cave_vines_head_with_berries`). State axes differ even where names match: Java `oak_log` has `axis`, `oak_stairs` has `facing`, `half`, `shape`, `waterlogged`, and `oak_slab` has `type`, `waterlogged`; in the Bedrock palette `oak_log` has `pillar_axis`, `oak_stairs` has `minecraft:corner`, `upside_down_bit`, `weirdo_direction`, and `oak_slab` has `minecraft:vertical_half`. No Bedrock block in the palette has a `waterlogged` state (water is a separate layer). So a shared identifier does not give a shared state space, and the double-slab, lit, powered and flowing families mean one Java block often maps to two Bedrock blocks.

Items: 1565 of 1658 Java item names exist in the Bedrock table. The 93 Java-only are the 16 `*_bed` and 16 `*_banner` items (Bedrock `bed`, `banner`), `map` and 16 `*_map` explorer maps (Bedrock uses `empty_map` and `filled_map` with data), block items named differently (`bricks`, `cobweb`, `dirt_path`, `lily_pad`, `magma_block`, `melon`, `nether_bricks`, `note_block`, `oak_door`, `powered_rail`, `slime_block`, `snow_block`, `spawner`, `stone_slab`, `terracotta`, `waxed_copper_block`), `spectral_arrow`, `tipped_arrow` (Bedrock `arrow` with data), `knowledge_book`, `debug_stick`, `glow_item_frame` and `item_frame` (Bedrock `frame`, `glow_frame`), `furnace_minecart`, `zombified_piglin_spawn_egg` (Bedrock `zombie_pigman_spawn_egg`), `test_block`, `test_instance_block`. The 511 Bedrock-only are 120 `element_*`, 93 `*_double_slab`, 24 sign block items, 18 `item.*` aliases, 16 `*_candle_cake`, 16 `light_block_*`, 10 `*coral_wall_fan`, education items (`balloon`, `bleach`, `compound`, `ice_bomb`, `glow_stick`), legacy flattened names (`banner`, `bed`, `boat`, `carpet`, `concrete`, `concrete_powder`, `coral`, `coral_block`, `coral_fan`, `dye`, `fence`, `double_plant`, `empty_map`), and technical blocks exposed as items (`bubble_column`, `fire`, `flowing_water`, `end_gateway`, `end_portal`, `frosted_ice`).

### What this means for the format question

Java datapacks are a complete, Mojang-maintained, generator-verifiable description of vanilla terrain, decoration, structures, loot, recipes, tags, enchantments, trades and item components, and the only one of the two editions with any of the first three in data. They say nothing about blocks (the one place where Bedrock's 98 files and `block_archetype` say a little more) and nothing about entities (where Bedrock's 130 files say almost everything). A server that wants vanilla Bedrock parity from data would take entities, spawn rules and the block archetype idea from Bedrock's format, and could take loot, recipe, tag, enchantment and worldgen structure from Java's, with a name and state mapping between the two palettes for every block reference inside worldgen and loot files. The mapping has 184 plus 375 exceptions on the block side and differing state axes on all stairs, logs, slabs and waterloggable blocks, so it is a table the project must own, not a rename rule. Loading Java files unmodified at runtime would also import 26.3-specific renames (`material_rule`, `modifier`, `condition`, `natural_mob_spawns`) that change every few releases; the Java changelogs show one breaking datapack rename per release through 1.21.9, 1.21.11, 26.1, 26.2 and 26.3.

## Open questions

- Why 26.3 removed `definition` from `blocks.json` and whether anything will replace it is not stated in the changelog beyond the one sentence quoted. 26.2's dump is the last public list of Java block classes.
- Bedrock's `mojang-blocks.json` was not re-read here; the per-block state axis comparison relies on the Bedrock note's examples and should be run over all 1102 shared names before any mapping table is built.
- Java's multi-noise preset (`minecraft:overworld`) is code; the 7594-point expansion in `reports/biome_parameters/` is complete for lookup, but the spline and parameter semantics (for example the `offset` field) are not documented anywhere by Mojang.
- The `--dev` flag produced no additional files in 26.3; whether `--validate` or `--input` can be used to run Mojang's own validation on a third-party pack was not tried.
- Whether misode/mcmeta's `data` branch is byte-identical to the generator output for 26.3 was not diffed; its README claims it is the generator output.
- The GitHub REST API rate-limited unauthenticated requests during this pass; branch heads were taken from `git ls-remote` instead, which is equally authoritative.

## Reproduction

```
# Where the current Java server jar is
curl -sS https://net-secondary.web.minecraft-services.net/api/v1.0/download/links | python3 -I -m json.tool
curl -sS https://piston-meta.mojang.com/mc/game/version_manifest_v2.json -o version_manifest_v2.json
curl -sS https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json -o 26.3.json

# Download into an empty directory and verify
mkdir -p /tmp/bds-research-java/jar /tmp/bds-research-java/out /tmp/bds-research-java/tools
cd /tmp/bds-research-java/jar
curl -sS -L -o server.jar https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar
shasum -a 1 server.jar      # 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c
shasum -a 256 server.jar    # d052f14d7a173734fba553711e5b570162e2f2a313267ee31a21b975a679be64
unzip -p server.jar version.json

# Run the data generator (needs Java 25; macOS: /usr/libexec/java_home -V)
JAVA=/Library/Java/JavaVirtualMachines/graalvm-25.jdk/Contents/Home/bin/java
cd /tmp/bds-research-java/out
$JAVA -DbundlerMainClass=net.minecraft.data.Main -jar /tmp/bds-research-java/jar/server.jar --help
$JAVA -DbundlerMainClass=net.minecraft.data.Main -jar /tmp/bds-research-java/jar/server.jar \
  --reports --server --all --output /tmp/bds-research-java/out/generated

# Counts used above
cd /tmp/bds-research-java/out/generated
for d in data/minecraft/*/ data/minecraft/worldgen/*/ data/minecraft/tags/*/; do printf "%s\t%s\n" "$(find "$d" -type f | wc -l)" "$d"; done
ls reports; ls reports/minecraft/components/item | wc -l
python3 -I -c 'import json;b=json.load(open("reports/blocks.json"));print(len(b),sum(len(v["states"]) for v in b.values()));print(json.dumps(b["minecraft:stone"]))'
python3 -I -c 'import json;r=json.load(open("reports/registries.json"));[print(len(v["entries"]),k) for k,v in sorted(r.items())]'
python3 -I -c 'import json;d=json.load(open("reports/datapack.json"));print(sum(v["elements"] for v in d["registries"].values()),len(d["registries"]))'
cat reports/minecraft/components/item/diamond_pickaxe.json reports/minecraft/components/item/apple.json
unzip -l /tmp/bds-research-java/out/versions/26.3/server-26.3.jar | grep -c 'data/minecraft/structure/.*\.nbt$'
unzip -p /tmp/bds-research-java/out/versions/26.3/server-26.3.jar data/minecraft/datapacks/trade_rebalance/pack.mcmeta

# Dating the removal of blocks.json "definition": same command with the 1.21.11, 26.1 and 26.2 jars
# (sha1 64bb6d763bed0a9f1d632ec347938594144943ed, 3872a7f07a1a595e651aef8b058dfc2bb3772f46, 823e2250d24b3ddac457a60c92a6a941943fcd6a)
# each in its own /tmp/bds-research-java/jar-<v>/ and /tmp/bds-research-java/out-<v>/, with --reports only.

# Republishers
git ls-remote https://github.com/misode/mcmeta refs/heads/summary refs/heads/data refs/heads/registries
git ls-remote --tags https://github.com/misode/mcmeta | grep 'refs/tags/26.3-'
curl -sS -L https://raw.githubusercontent.com/misode/mcmeta/master/README.md
curl -sS -L https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/README.md | sed -n '/## License/,/## Related/p'

# Changelogs (served as HTML; strip tags and grep)
for a in minecraft-snapshot-24w09a minecraft-java-edition-1-20-5 minecraft-java-edition-1-21-2 minecraft-java-edition-1-21-5 \
         minecraft-java-edition-1-21-9 minecraft-java-edition-1-21-11 minecraft-java-edition-26-1 minecraft-java-edition-26-2 minecraft-java-edition-26-3; do
  curl -sS -L -A "Mozilla/5.0" -o "$a.html" "https://www.minecraft.net/en-us/article/$a"; done

# Identifier comparison against this repository's Bedrock captures
# packages/minecraft/datagen/snapshot/v2193/block-palette.json ("states" keys) and packages/bedrock-data/src/jsp/required_item_list.json (keys)
# versus reports/registries.json "minecraft:block" and "minecraft:item" entries.
```
