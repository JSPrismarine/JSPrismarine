# Bedrock behavior pack formats: entities, spawn rules, loot tables, trade tables

Researched 2026-10-24 against the composed vanilla behavior pack of Bedrock Dedicated Server (BDS) 1.26.51.1, Mojang/bedrock-samples tag `v1.26.50.4` (commit `46ba6ea985fb5a92d79a9419198f10dda14c199d`, "min" release asset, sha256 `2bb667786f4d5bedf97a61cec4ce9613c1e2986224c9deda5fbb108c2d96b07c`), its `metadata/json_schemas/`, and MicrosoftDocs/minecraft-creator at commit `4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8` (2026-10-20). It continues [Getting vanilla Bedrock data from Mojang's own files](bedrock-data-extraction.md) and does not repeat it. Every count below comes from scripts listed under Reproduction; every grammar statement names the schema or docs page that owns it.

## Summary

- The composed vanilla pack has 129 entity definitions, 60 spawn rules, 309 loot tables and 27 trade tables. The trade tables sit in two archives per layer (`trading.brarchive` and `trading/economy_trades.brarchive`); 9 of the 27 are the undocumented `\x7fMCB` binary in BDS, and the 18 text ones parse equal to the bedrock-samples copies, so the samples are a faithful substitute.
- An entity definition is `description` plus `components` plus `component_groups` plus `events`. Spawning runs one spawn event (`minecraft:entity_spawned`, `minecraft:entity_born`, `minecraft:entity_transformed`, or the one named by `/summon`, a spawn rule, `minecraft:transformation` or `minecraft:spawn_entity`); the event adds and removes groups; sensors, timers, goals and triggers fire further events. Mojang's own schema (`ActorDocument.json`) types only the four top-level keys and leaves `description`, `events` and `upgrades` as "Dynamic value".
- Vanilla uses 372 distinct component keys: 192 attribute and behavior components, 170 `minecraft:behavior.*` goals and 10 `minecraft:on_*` triggers. Docs list 204 components plus 1 internal and 181 goals plus 1 internal; every vanilla goal is documented, 12 documented goals are unused, and 8 vanilla components (`air_drag_modifier`, `bounciness`, `can_stand_on_powder_snow`, `freezing_immune`, `freezing_vulnerable`, `not_pickable_from_inside`, `npc`, `uses_uniform_air_drag`) appear in no docs list. The 1.26.50 schema names 406 component keys but omits `minecraft:pushable` (27 vanilla entities) and `minecraft:behavior.follow_target_captain` (2).
- Filters are one grammar shared by entities, spawn rules and trade tables: `{test, subject, operator, domain, value}` nested under `all_of`, `any_of`, `none_of` (and the schema's `AND`, `OR`, `NOT`, `all`, `any` aliases). Vanilla entities use 86 of the 108 documented tests in 1897 instances; `is_family` alone is 526. Twenty-seven entity files written by the 1.26 serializer encode `subject` and `operator` as integers (`1` is `other`, `0` is `==`, `1` is `!=`) and use `AND`/`OR`.
- Spawn rules use 21 of the 24 components in the schema. Population pools in vanilla are `animal` 27, `monster` 24, `water_animal` 5, `pillager` 2, `cat` 1, `ambient` 1. Four rules (blaze, cat, pillager, wither_skeleton) have no conditions at all. Mojang documents pool names and per-component parameters, but no spawn attempt rate, no cap values and no light algorithm; the only numbers published are "~10 per player" style approximations in a tutorial.
- The loot grammar is `pools[] { rolls, bonus_rolls, conditions[], tiers, entries[] { type, name, weight, quality, functions[], conditions[], pools[] } }`. Vanilla uses 23 function spellings (18 functions, 5 of them also in `minecraft:` form) and 15 conditions; `set_count` is 590 of 1140 function instances, and conditions sit on 77 pools, 9 entries and 15 functions (`furnace_smelt` with `entity_properties`).
- Loot tables are reached from entities (110 distinct tables through `minecraft:loot`, `minecraft:equipment`, `minecraft:interact`, `minecraft:barter` and four goals), from the 98 data-driven blocks (`minecraft:loot`), and from other tables (26 nested names). The remaining 80 (54 chests, 5 spawners, 3 dispensers, 1 barrel, 1 pot, 12 under `entities/`, 3 equipment, 1 block) are referenced only by engine code and structures.
- Trade tables are `tiers[] { total_exp_required, groups[] { num_to_select, trades[] { wants[], gives[], trader_exp, max_uses, reward_exp } } }` with `TradeItem { item, quantity, price_multiplier, functions[], filters }` or `{ choice: [TradeItem] }`. Every villager_v2 profession points at `trading/economy_trades/*.json` through `minecraft:economy_trade_table`; the 13 legacy `trading/*.json` tables are referenced only by the legacy `minecraft:villager`. Demand, discounts and restock are engine behavior parameterized by `economy_trade_table` fields and `minecraft:trade_resupply`.
- Sizing: implementing the 20 most used goals covers all goals of 52 of 129 entities (15 of the 92 that have goals); 40 covers 74 (37); 60 covers 86 (49); 80 covers 94 (57); all 170 covers 129. The 20 most used non-goal components cover 5 entities, 60 cover 30, 100 cover 59, 140 cover 88, all 202 cover 129. The zombie, villager_v2, creeper, enderman, iron golem, wolf and cow together need 55 goals and 76 non-goal components, and that set also fully covers husk, mooshroom and 9 non-mob entities.
- 91 of the 170 goals and 58 of the 192 components are used by exactly one entity type, so the long tail is where most of the implementation count sits, and the head is where most entities are.

## 1. Entity definition grammar

### Files and format versions

An entity file is `{"format_version": "<semver>", "minecraft:entity": {...}}`. Docs: "The `format_version` at the top of an entity JSON file selects the schema that the game uses to parse that document: which fields are valid, how they're interpreted, and what defaults are applied. Files written against an older `format_version` will continue to work" (`Documents/entity-versioning.md`). The composed vanilla files use `1.26.50` (56 files), `1.26.0` (34), `1.26.30` (19), `1.26.20` (10), `1.26.10` (8), `1.26.40` (1) and `1.21.90` (1, `agent.json`). Version gates that the docs state: root-level event `filters` need `1.19.20` (`Documents/EntityEvents.md`); `queue_command` needs `1.20.60`, `emit_particle` and `play_sound` need `1.21.50` (`EventActions/*.md`); `entity_version` and the `upgrades` section need `1.26.20` plus the "Upcoming Creator Features" experiment (`entity-versioning.md`); `minecraft:interact` entries default `swing` to `true` from `1.26.0` (`minecraftComponent_interact.md`). The bedrock-samples schemas are versioned per key: `server/entity/<version>/` holds 407 files across 13 versions (`1.21.80` to `1.26.50` plus `beta`), each component body appearing in the version that last changed it, so a reader has to pick, per component, the newest schema at or below the file's `format_version`.

### The top level

`ActorDocument.json` (1.26.50) declares five properties: `description` (required, "Dynamic value"), `components` (ref `Entity component definitions.json`), `component_groups` (object of the same), `events` ("Dynamic value") and `upgrades` ("Dynamic value"). `Entity component definitions.json` names 406 keys and types every one of them as "Dynamic value"; the real bodies are the 229 `minecraft_*.json` files (173 goals, 56 components) spread over the version folders. So the schema is a key list, not a validator, for the remaining 177 keys.

### `description`

Vanilla usage over 129 files: `identifier` 129, `is_spawnable` 129 (true 91), `is_summonable` 129 (true 110), `spawn_category` 108 (`monster` 44, `creature` 33, `misc` 21, `water_ambient` 4, `water_creature` 3, `axolotls` 1, `ambient` 1, `underground_water_creature` 1), `is_experimental` 31 (true once, `agent`), `properties` 18. `runtime_identifier`, `animations`, `scripts` and `entity_version` appear in no vanilla file. Docs (`Documents/EntityBehaviorIntroduction.md`): `is_spawnable` "If true, a spawn egg for the entity is added to the creative inventory"; `is_summonable` "If true, the entity can be summoned using the `/summon` command"; `runtime_identifier` "can be used to inherit custom mechanics from Vanilla entities that are not yet available as a component"; `animations` "A list of behavior animations or behavior animation controllers ... used to run commands or events on the entity"; `scripts` "can be used to play behavior animations"; `spawn_category` "Currently not fully implemented, so we recommend that creators do not set a value for this property ... Available values include `monster`, `creature`, `ambient`, `axolotls`, `underground_water_creature`, `water_creature`, `water_ambient` and `misc`." Mojang's generated `Entities.html` (bedrock-samples `documentation/`) says of `spawn_category`: "This entity will spawn with the rest of this Spawn Category type."

### Entity properties

`description.properties` maps a namespaced name to `{type, default, range | values, client_sync}`. Docs (`Documents/IntroductionToEntityProperties.md`): four types `int`, `float`, `enum`, `bool`; `int` and `float` take `range: [min, max]` and clamp silently; `enum` takes `values` (at most 16 entries, each 1 to 32 characters, starting with a letter); at most 32 properties per entity type; `client_sync: true` sends the value to clients for render and animation controllers; values persist in saved entities and are keyed by name, so a rename discards the data. `default` is a literal or a Molang expression; a default expression "cannot assign or read Molang variables" and may only call `query.had_component_group`, which exists to migrate saved component-group state. Events change properties through `set_property`, whose value may be a literal or a Molang expression that may read `query.property` and `query.has_property` but no other query. Filters read them through `int_property`, `float_property`, `bool_property`, `enum_property` (with `domain` naming the property) and `has_property`. Vanilla has 29 properties on 18 entities: `enum` 15, `bool` 13, `int` 1 (`minecraft:creaking_swaying_ticks`); `client_sync` true 19, false 8, absent 2; defaults are 15 strings, 12 booleans, 1 int and one Molang expression (`minecraft:has_nectar` on the bee, `query.had_component_group('has_nectar')`).

### `components` and `component_groups`

`components` is the always-active set; `component_groups` is a map of group name to component map, inactive until an event adds it. Docs (`Documents/EntityBehaviorIntroduction.md`, repeated in `EventActions/add_component_group.md`): "As entities can only have one component of each type active, any components in a group that is being added will replace previously added components. Additionally, adding a component group that is already active will cause those components to be re-initialized ... an already-added `minecraft:timer` that is added again will start its timing logic over." On removal: "removing a component won't make it go back to the previous state of that component ... the component will be removed completely and reset to its default values." Vanilla has 827 component groups across the 129 files (villager_v2 has 54, wolf 18, zombie 13, cow 2, creeper 5, enderman 4, iron_golem 2). Component bodies carry 33 distinct Molang strings in vanilla; the hosts are `minecraft:experience_reward.on_death` (85, for example `query.last_hit_by_player ? Math.Random(1,3) : 0`), `experience_reward.on_bred` (29), `ambient_sound_interval.condition` (20), `rideable.rotate_rider_by` (9), `behavior.pickup_items.tags` (5) and eight single uses. A runtime therefore needs a Molang evaluator for a dozen queries (`query.last_hit_by_player`, `query.equipment_count`, `query.is_baby`, `query.head_is_in_water`, `query.has_any_family`, `Math.Random`) to run vanilla, not a full one.

### `events`

An event is a node; a node may contain `add` and `remove` (`{"component_groups": [...]}`), `trigger` (event name string, or `{event, target}`), `filters`, `set_property`, `sequence` (array of nodes run in order), `randomize` (array of nodes with `weight`, one chosen), and the actions in `EventActions.md`: `queue_command`, `emit_vibration` (`entity_interact`, `entity_act`, `entity_die`), `emit_particle`, `play_sound`, `reset_target`. Trigger `target` choices are `self`, `other`, `player`, `target`, `baby`, `parent` (`EventActions/trigger.md`). Nodes nest "indefinitely" (`Documents/EntityEvents.md`). Execution: "the effects of that event are determined immediately, but those changes are not applied to the entity until the entity ticks on the server side ... filters in later entries in a `sequence` array won't see changes from earlier in that array" (`EntityEvents.md`, repeated in the generated `Entity Events.html`). Vanilla's 850 events use `add` 1163, `remove` 437, `weight` 437, `filters` 315, `trigger` 176 (174 strings, 2 `{event, target}` objects), `sequence` 123, `randomize` 116, `set_property` 105, `play_sound` 23 (11 entities), `set_home_position` 17 (nautilus, zombie_nautilus, happy_ghast), `first_valid` 11 (9 entities; an array of filtered nodes of which the first passing one runs), `emit_vibration` 9, `drop_item` 2 (`{"slot": "slot.weapon.mainhand"}`, copper_golem and sulfur_cube), `execute_event_on_home_block` 2 (creaking), `emit_particle` 1, `reset_target` 1, `stop_movement` 1 (happy_ghast), `queue_command` 0. `first_valid`, `set_home_position`, `drop_item`, `execute_event_on_home_block` and `stop_movement` appear in no docs page and in neither generated HTML, so five of the event actions vanilla relies on are undocumented. The generated `Entity Events.html` documents only `sequence`, `randomize`, `trigger`, `add`, `remove`, `set_property` and `queue_command`.

### How a definition becomes a running entity

1. Construction. The entity starts with `components`. The engine then runs one spawn event: `minecraft:entity_spawned` for natural spawns, spawn eggs and spawners; `minecraft:entity_born` when `minecraft:behavior.breed` or `minecraft:spawn_entity` (default `spawn_event` `minecraft:entity_born`) creates it; `minecraft:entity_transformed` when `minecraft:transformation` creates it; `minecraft:on_prime` when a TNT minecart is primed; or the event named in `/summon`, in a spawn rule's `minecraft:herd.event`, `initial_event` or `minecraft:spawn_event`, in `permute_type.entity_type` (`minecraft:pillager<minecraft:spawn_as_patrol_follower>`) or in `transformation.into` (`minecraft:drowned<minecraft:as_adult>`). Docs: "You can think of it as a `constructor` ... The entity starts with the default-included components list ... Then it also gets the effects of its spawn event" and "`minecraft:entity_spawned` ... won't run if you manually `/summon` it" because `/summon` substitutes its own spawn event (`EntityEvents.md`). Vanilla defines `minecraft:entity_spawned` on 82 entities, `minecraft:entity_born` on 43, `minecraft:entity_transformed` on 8 and `minecraft:on_prime` on 1. The zombie's spawn event is `sequence[ randomize[ as_adult 9500, as_baby 425, as_baby_jockey 75 ], randomize[ add can_break_doors 10, nothing 90 ] ]`; the cow's is `sequence[ randomize[ spawn_adult 95, add cow_baby 5 ], first_valid[ biome tag warm, biome tag cold, default ] set_property minecraft:climate_variant ]`.
2. Group changes. Each `add`/`remove` replaces or deletes components by key, and the engine re-initializes re-added ones. Zombie events swap `minecraft:zombie_adult` for `minecraft:zombie_baby` (which carries its own `minecraft:scale`, `collision_box`, `movement`, `experience_reward` and a different `type_family`).
3. Sensors and timers. `minecraft:environment_sensor` is a list of `{filters, event, target}` triggers evaluated against the world each tick (zombie: `is_underwater` fires `minecraft:start_transforming_into_drowned`); `minecraft:timer` fires `time_down_event` after `time` seconds or a weighted `random_time_choices` pick, optionally `looping`; `minecraft:damage_sensor` fires `on_damage` per damage cause and can set `deals_damage` to `yes`, `no`, `no_but_side_effects_apply` or `no_but_entity_effects_apply`; `minecraft:target_nearby_sensor`, `minecraft:entity_sensor`, `minecraft:block_sensor`, `minecraft:rail_sensor` and `minecraft:inside_block_notifier` are the other polling sensors. `minecraft:interact` is a list of `interactions[] { on_interact {filters, event, target}, use_item, transform_to_item, hurt_item, swing, play_sounds, interact_text, add_items {table}, spawn_items {table}, equip_item_slot, drop_item_slot, health_amount, cooldown, give_item, admire, barter }`; the cow's bucket interaction is `filters all_of[is_family other player, has_equipment other hand bucket:0]` with `transform_to_item: bucket:1`, and the creeper's flint-and-steel interaction fires `minecraft:start_exploding_forced`.
4. Triggers. The ten `minecraft:on_*` components are `{event, target, filters}` bodies the engine fires at fixed points: `on_target_acquired` (22 entities), `on_target_escape` (10), `on_friendly_anger` (3), `on_hurt` (3), `on_hurt_by_player` (2), `on_death`, `on_equipment_changed`, `on_start_landing`, `on_start_takeoff`, `on_wake_with_owner` (1 each). `on_ignite` is documented but unused.
5. Goals. Each `minecraft:behavior.*` has `priority` ("0 is the highest priority ... If the entity is busy doing a low priority behavior and a high priority behavior comes up, the entity will immediately switch", `EntityBehaviorIntroduction.md`) and `control_flags` (`move`, `look`, `jump` per the goal schemas), and many take event hooks (`on_attack`, `on_kill`, `on_tempt_end`, `on_celebration_end_event`, `on_escape_event`).
6. Transformation. `minecraft:transformation { into, delay {value | block_assist_chance, block_chance, block_max, block_radius, block_types, range_min, range_max}, add {component_groups}, keep_level, keep_owner, preserve_equipment, drop_equipment, drop_inventory, begin_transform_sound, transformation_sound }` replaces the entity with a new definition and runs `minecraft:entity_transformed` on it, where filters with `subject: other` read the old entity (zombie_pigman example in `EntityEvents/minecraftEvents_entity_transformed.md`). The zombie's `minecraft:convert_to_drowned` group pairs `minecraft:is_shaking` with `transformation { delay 15, preserve_equipment, into "minecraft:drowned<minecraft:as_adult>" }`.
7. Variant state. `minecraft:variant`, `minecraft:mark_variant` and `minecraft:skin_id` each hold one integer `value`; the docs call them components that "can store an integer value" for animations and render controllers (`EntityBehaviorIntroduction.md`). Filters `is_variant`, `is_mark_variant`, `is_skin_id` read them; loot conditions `has_variant` and `has_mark_variant` read the first two; trade item filters read `is_mark_variant`. Vanilla sets `variant` in 29 entities (wolf coat groups `minecraft:wolf_pale` are `{"minecraft:variant": {"value": 0}}`), `mark_variant` in 8, `skin_id` in 3. On the wire they travel as the actor data fields `VARIANT`, `MARK_VARIANT` and `SKIN_ID` in `SetActorDataPacket` and `AddActorPacket` (Mojang/bedrock-protocol-docs lists these metadata ids; the entity JSON itself does not mention the network), and `is_baby`, `is_tamed`, `is_sheared`, `is_saddled`, `is_charged`, `is_ignited`, `is_illager_captain`, `is_stackable` and the rest of the `is_*` flag components are the sources of the corresponding actor flags.
8. Despawn. `minecraft:despawn` applies "standard despawn rules" (`despawn_from_distance {min_distance 32, max_distance 128}`, `despawn_from_chance` with `min_range_random_chance 800`, `despawn_from_inactivity` with `min_range_inactivity_timer 30`, `despawn_from_simulation_edge`) or, if `filters` is set, despawns when they pass (`minecraftComponent_despawn.md`). `minecraft:persistent` opts out; `minecraft:instant_despawn` removes immediately. 76 vanilla entities carry `despawn`, 67 of them as the empty-object default.
9. Versioned upgrades. `description.entity_version.upgrades[] {upgrade_to, name}` plus a top-level `upgrades` map of event-shaped handlers run once when a saved entity loads at a lower version (`entity-versioning.md`). Vanilla does not use it yet; the zombie horse still uses the older pattern of a `minecraft:was_upgraded_to_1_21_130` property plus an `environment_sensor` trigger.

## 2. Component inventory from vanilla

Counts are over the 129 composed files. "Entities" is the number of entity files whose base `components` or any component group use the key; "Instances" counts every occurrence, so a key present in three groups of one entity counts three.

### Cross-check against the docs

- Docs `ComponentList.md` lists 204 components plus one in "Internal/Deprecated Components" (`scaffolding_climber`). `AIGoalList.md` lists 181 goals plus one internal (`behavior.move_to_lava`). `TriggerList.md` lists 11 triggers. `FilterList.md` lists 108 tests.
- All 170 vanilla goals are in the docs list. The 12 documented goals vanilla does not use: `break_door`, `door_interact`, `enderman_leave_block`, `enderman_take_block`, `follow_target_leader`, `hover`, `move_to_poi`, `move_towards_restriction`, `restrict_sun`, `vex_copy_owner_target`, `vex_random_move`, and the internal `move_to_lava`. The enderman now uses the generic `take_block` and `place_block` ("like Endermen placing their carried block or snow golems leaving snow trails", `AIGoalList.md`).
- Vanilla non-goal components absent from `ComponentList.md` under any name: `minecraft:air_drag_modifier`, `minecraft:bounciness`, `minecraft:can_stand_on_powder_snow`, `minecraft:freezing_immune`, `minecraft:freezing_vulnerable`, `minecraft:not_pickable_from_inside`, `minecraft:npc`, `minecraft:uses_uniform_air_drag`. All eight are in the 1.26.50 schema key list. `minecraft:health`, `minecraft:trust` and `minecraft:balloonable` are listed under the bare titles "Health", "Trust", "Balloonable".
- Documented components vanilla does not use (20): `apply_knockback_rules_instance`, `body_rotation_axis_aligned`, `body_rotation_locked_to_vehicle`, `dash`, `default_look_angle`, `entity_armor_equipment_slot_mapping`, `floats_in_liquid`, `ground_offset`, `ignore_cannot_be_attacked`, `input_air_controlled`, `navigation.swim`, `push_through`, `remove_in_peaceful`, `scale_by_age`, `sound_volume`, `spawn_on_death`, `walk_animation_speed`, `wants_jockey`, `wither_target_highest_damage`, `scaffolding_climber`.
- Restrictions the docs state in descriptions: `behavior.move_through_village` "Can only be used by Villagers"; `on_start_landing` and `on_start_takeoff` "Only usable by the Ender Dragon"; `melee_attack` and `melee_box_attack` `melee_fov` is "used by the hard-coded sensing component"; `variable_max_auto_step` is "Incompatible with `runtime_identifier: minecraft:horse`" (generated `Entities.html`).

### (a) Attribute and non-goal components (192)

| Component | Entities | Instances | In base components | In component groups |
|---|---|---|---|---|
| `minecraft:physics` | 126 | 126 | 126 | 0 |
| `minecraft:collision_box` | 125 | 168 | 119 | 49 |
| `minecraft:type_family` | 124 | 195 | 115 | 80 |
| `minecraft:conditional_bandwidth_optimization` | 117 | 117 | 117 | 0 |
| `minecraft:health` | 94 | 104 | 89 | 15 |
| `minecraft:nameable` | 94 | 94 | 94 | 0 |
| `minecraft:movement` | 93 | 116 | 78 | 38 |
| `minecraft:is_hidden_when_invisible` | 92 | 92 | 92 | 0 |
| `minecraft:pushable_by_block` | 91 | 97 | 86 | 11 |
| `minecraft:hurt_on_condition` | 87 | 88 | 86 | 2 |
| `minecraft:pushable_by_entity` | 85 | 100 | 79 | 21 |
| `minecraft:breathable` | 84 | 86 | 82 | 4 |
| `minecraft:experience_reward` | 80 | 87 | 42 | 45 |
| `minecraft:jump.static` | 79 | 79 | 78 | 1 |
| `minecraft:loot` | 78 | 94 | 49 | 45 |
| `minecraft:despawn` | 76 | 76 | 74 | 2 |
| `minecraft:navigation.walk` | 66 | 70 | 64 | 6 |
| `minecraft:movement.basic` | 65 | 65 | 65 | 0 |
| `minecraft:can_climb` | 57 | 57 | 56 | 1 |
| `minecraft:attack` | 48 | 61 | 30 | 31 |
| `minecraft:scale` | 48 | 54 | 6 | 48 |
| `minecraft:is_baby` | 44 | 44 | 1 | 43 |
| `minecraft:leashable` | 43 | 43 | 37 | 6 |
| `minecraft:offspring` | 43 | 43 | 43 | 0 |
| `minecraft:spawn_egg_interaction` | 43 | 43 | 43 | 0 |
| `minecraft:leashable_to` | 42 | 42 | 8 | 34 |
| `minecraft:damage_sensor` | 40 | 43 | 35 | 8 |
| `minecraft:balloonable` | 39 | 39 | 39 | 0 |
| `minecraft:rideable` | 36 | 68 | 10 | 58 |
| `minecraft:ageable` | 35 | 35 | 1 | 34 |
| `minecraft:ambient_sound_interval` | 32 | 38 | 22 | 16 |
| `minecraft:interact` | 32 | 41 | 11 | 30 |
| `minecraft:environment_sensor` | 29 | 68 | 12 | 56 |
| `minecraft:variant` | 29 | 185 | 5 | 180 |
| `minecraft:follow_range` | 27 | 27 | 27 | 0 |
| `minecraft:pushable` | 27 | 27 | 26 | 1 |
| `minecraft:breedable` | 26 | 26 | 1 | 25 |
| `minecraft:angry` | 20 | 25 | 0 | 25 |
| `minecraft:inventory` | 20 | 20 | 11 | 9 |
| `minecraft:shareables` | 19 | 22 | 16 | 6 |
| `minecraft:timer` | 19 | 27 | 1 | 26 |
| `minecraft:equipment` | 18 | 28 | 13 | 15 |
| `minecraft:persistent` | 18 | 19 | 13 | 6 |
| `minecraft:projectile` | 18 | 23 | 18 | 5 |
| `minecraft:equip_item` | 17 | 17 | 16 | 1 |
| `minecraft:fire_immune` | 16 | 16 | 15 | 1 |
| `minecraft:is_tamed` | 16 | 16 | 4 | 12 |
| `minecraft:shooter` | 15 | 21 | 8 | 13 |
| `minecraft:underwater_movement` | 15 | 21 | 12 | 9 |
| `minecraft:healable` | 14 | 14 | 12 | 2 |
| `minecraft:navigation.generic` | 14 | 20 | 14 | 6 |
| `minecraft:transformation` | 14 | 20 | 0 | 20 |
| `minecraft:knockback_resistance` | 13 | 27 | 10 | 17 |
| `minecraft:burns_in_daylight` | 11 | 11 | 11 | 0 |
| `minecraft:dimension_bound` | 10 | 10 | 9 | 1 |
| `minecraft:equippable` | 10 | 10 | 1 | 9 |
| `minecraft:explode` | 10 | 16 | 3 | 13 |
| `minecraft:home` | 10 | 16 | 8 | 8 |
| `minecraft:is_saddled` | 10 | 10 | 0 | 10 |
| `minecraft:uses_legacy_friction` | 10 | 10 | 10 | 0 |
| `minecraft:input_ground_controlled` | 9 | 9 | 1 | 8 |
| `minecraft:is_shaking` | 9 | 11 | 0 | 11 |
| `minecraft:movement.sway` | 9 | 9 | 9 | 0 |
| `minecraft:buoyant` | 8 | 18 | 7 | 11 |
| `minecraft:dweller` | 8 | 21 | 2 | 19 |
| `minecraft:freezing_immune` | 8 | 8 | 7 | 1 |
| `minecraft:game_event_movement_tracking` | 8 | 8 | 8 | 0 |
| `minecraft:mark_variant` | 8 | 64 | 4 | 60 |
| `minecraft:renders_when_invisible` | 8 | 8 | 8 | 0 |
| `minecraft:can_fly` | 7 | 7 | 7 | 0 |
| `minecraft:spawn_entity` | 7 | 7 | 1 | 6 |
| `minecraft:addrider` | 6 | 20 | 0 | 20 |
| `minecraft:annotation.break_door` | 6 | 6 | 0 | 6 |
| `minecraft:is_stackable` | 6 | 6 | 6 | 0 |
| `minecraft:mob_effect_immunity` | 6 | 6 | 5 | 1 |
| `minecraft:tamemount` | 6 | 6 | 0 | 6 |
| `minecraft:annotation.open_door` | 5 | 5 | 5 | 0 |
| `minecraft:block_climber` | 5 | 5 | 5 | 0 |
| `minecraft:can_join_raid` | 5 | 5 | 5 | 0 |
| `minecraft:can_power_jump` | 5 | 5 | 1 | 4 |
| `minecraft:flocking` | 5 | 5 | 5 | 0 |
| `minecraft:horse.jump_strength` | 5 | 5 | 5 | 0 |
| `minecraft:rail_movement` | 5 | 5 | 5 | 0 |
| `minecraft:tameable` | 5 | 5 | 0 | 5 |
| `minecraft:variable_max_auto_step` | 5 | 6 | 4 | 2 |
| `minecraft:apply_knockback_rules` | 4 | 4 | 4 | 0 |
| `minecraft:area_attack` | 4 | 7 | 0 | 7 |
| `minecraft:attack_cooldown` | 4 | 4 | 0 | 4 |
| `minecraft:can_stand_on_powder_snow` | 4 | 4 | 4 | 0 |
| `minecraft:color` | 4 | 51 | 0 | 51 |
| `minecraft:dash_action` | 4 | 6 | 0 | 6 |
| `minecraft:entity_sensor` | 4 | 7 | 1 | 6 |
| `minecraft:flying_speed` | 4 | 6 | 3 | 3 |
| `minecraft:is_chested` | 4 | 4 | 0 | 4 |
| `minecraft:is_collidable` | 4 | 4 | 3 | 1 |
| `minecraft:mob_effect` | 4 | 4 | 1 | 3 |
| `minecraft:rail_sensor` | 4 | 8 | 1 | 7 |
| `minecraft:rotation_locked_to_vehicle` | 4 | 4 | 4 | 0 |
| `minecraft:sittable` | 4 | 4 | 0 | 4 |
| `minecraft:spell_effects` | 4 | 6 | 0 | 6 |
| `minecraft:target_nearby_sensor` | 4 | 7 | 2 | 5 |
| `minecraft:body_rotation_blocked` | 3 | 3 | 0 | 3 |
| `minecraft:damage_over_time` | 3 | 3 | 0 | 3 |
| `minecraft:free_camera_controlled` | 3 | 3 | 0 | 3 |
| `minecraft:freezing_vulnerable` | 3 | 3 | 3 | 0 |
| `minecraft:is_dyeable` | 3 | 3 | 0 | 3 |
| `minecraft:is_sheared` | 3 | 3 | 0 | 3 |
| `minecraft:movement.amphibious` | 3 | 3 | 3 | 0 |
| `minecraft:movement.hover` | 3 | 3 | 2 | 1 |
| `minecraft:movement.jump` | 3 | 8 | 2 | 6 |
| `minecraft:navigation.float` | 3 | 3 | 2 | 1 |
| `minecraft:navigation.hover` | 3 | 3 | 2 | 1 |
| `minecraft:preferred_path` | 3 | 4 | 2 | 2 |
| `minecraft:water_movement` | 3 | 3 | 3 | 0 |
| `minecraft:attack_damage` | 2 | 2 | 2 | 0 |
| `minecraft:block_movement_slowdown_immunity` | 2 | 2 | 2 | 0 |
| `minecraft:block_sensor` | 2 | 2 | 1 | 1 |
| `minecraft:boostable` | 2 | 2 | 0 | 2 |
| `minecraft:boss` | 2 | 2 | 2 | 0 |
| `minecraft:custom_hit_test` | 2 | 4 | 0 | 4 |
| `minecraft:drying_out_timer` | 2 | 2 | 0 | 2 |
| `minecraft:economy_trade_table` | 2 | 15 | 1 | 14 |
| `minecraft:genetics` | 2 | 2 | 2 | 0 |
| `minecraft:group_size` | 2 | 2 | 0 | 2 |
| `minecraft:inside_block_notifier` | 2 | 2 | 2 | 0 |
| `minecraft:instant_despawn` | 2 | 2 | 0 | 2 |
| `minecraft:is_illager_captain` | 2 | 4 | 0 | 4 |
| `minecraft:item_controllable` | 2 | 2 | 0 | 2 |
| `minecraft:looked_at` | 2 | 3 | 1 | 2 |
| `minecraft:movement_sound_distance_offset` | 2 | 2 | 2 | 0 |
| `minecraft:navigation.climb` | 2 | 2 | 2 | 0 |
| `minecraft:not_pickable_from_inside` | 2 | 2 | 0 | 2 |
| `minecraft:out_of_control` | 2 | 4 | 0 | 4 |
| `minecraft:rotation_axis_aligned` | 2 | 2 | 0 | 2 |
| `minecraft:scheduler` | 2 | 8 | 1 | 7 |
| `minecraft:skin_id` | 2 | 12 | 0 | 12 |
| `minecraft:strength` | 2 | 10 | 0 | 10 |
| `minecraft:underwater_mount_breathing` | 2 | 2 | 0 | 2 |
| `minecraft:vibration_listener` | 2 | 2 | 2 | 0 |
| `minecraft:admire_item` | 1 | 1 | 1 | 0 |
| `minecraft:air_drag_modifier` | 1 | 13 | 0 | 13 |
| `minecraft:anger_level` | 1 | 1 | 1 | 0 |
| `minecraft:barter` | 1 | 1 | 0 | 1 |
| `minecraft:body_rotation_always_follows_head` | 1 | 1 | 1 | 0 |
| `minecraft:bounciness` | 1 | 13 | 0 | 13 |
| `minecraft:break_blocks` | 1 | 1 | 1 | 0 |
| `minecraft:bribeable` | 1 | 1 | 0 | 1 |
| `minecraft:cannot_be_attacked` | 1 | 1 | 1 | 0 |
| `minecraft:celebrate_hunt` | 1 | 1 | 0 | 1 |
| `minecraft:color2` | 1 | 37 | 0 | 37 |
| `minecraft:combat_regeneration` | 1 | 1 | 1 | 0 |
| `minecraft:exhaustion_values` | 1 | 1 | 1 | 0 |
| `minecraft:friction_modifier` | 1 | 13 | 0 | 13 |
| `minecraft:giveable` | 1 | 1 | 1 | 0 |
| `minecraft:grows_crop` | 1 | 1 | 0 | 1 |
| `minecraft:heartbeat` | 1 | 1 | 1 | 0 |
| `minecraft:hide` | 1 | 1 | 1 | 0 |
| `minecraft:insomnia` | 1 | 1 | 1 | 0 |
| `minecraft:is_charged` | 1 | 1 | 0 | 1 |
| `minecraft:is_ignited` | 1 | 2 | 0 | 2 |
| `minecraft:is_pregnant` | 1 | 1 | 0 | 1 |
| `minecraft:is_stunned` | 1 | 1 | 0 | 1 |
| `minecraft:item_hopper` | 1 | 1 | 0 | 1 |
| `minecraft:jump.dynamic` | 1 | 1 | 1 | 0 |
| `minecraft:lava_movement` | 1 | 1 | 1 | 0 |
| `minecraft:managed_wandering_trader` | 1 | 1 | 0 | 1 |
| `minecraft:movement.fly` | 1 | 1 | 1 | 0 |
| `minecraft:movement.generic` | 1 | 1 | 1 | 0 |
| `minecraft:movement.glide` | 1 | 1 | 1 | 0 |
| `minecraft:movement.skip` | 1 | 1 | 1 | 0 |
| `minecraft:navigation.fly` | 1 | 1 | 1 | 0 |
| `minecraft:npc` | 1 | 1 | 1 | 0 |
| `minecraft:peek` | 1 | 1 | 1 | 0 |
| `minecraft:player.exhaustion` | 1 | 1 | 1 | 0 |
| `minecraft:player.experience` | 1 | 1 | 1 | 0 |
| `minecraft:player.level` | 1 | 1 | 1 | 0 |
| `minecraft:player.saturation` | 1 | 1 | 1 | 0 |
| `minecraft:raid_trigger` | 1 | 1 | 0 | 1 |
| `minecraft:ravager_blocked` | 1 | 1 | 1 | 0 |
| `minecraft:reflect_projectiles` | 1 | 1 | 1 | 0 |
| `minecraft:suspect_tracking` | 1 | 1 | 1 | 0 |
| `minecraft:teleport` | 1 | 2 | 1 | 1 |
| `minecraft:tick_world` | 1 | 1 | 1 | 0 |
| `minecraft:trade_resupply` | 1 | 1 | 0 | 1 |
| `minecraft:trade_table` | 1 | 12 | 0 | 12 |
| `minecraft:trail` | 1 | 1 | 1 | 0 |
| `minecraft:transient` | 1 | 1 | 1 | 0 |
| `minecraft:trust` | 1 | 1 | 0 | 1 |
| `minecraft:trusting` | 1 | 1 | 0 | 1 |
| `minecraft:uses_uniform_air_drag` | 1 | 1 | 0 | 1 |
| `minecraft:vertical_movement_action` | 1 | 1 | 0 | 1 |
| `minecraft:vibration_damper` | 1 | 1 | 1 | 0 |

### (b) Goals (170)

| Goal | Entities | Instances | In base components | In component groups |
|---|---|---|---|---|
| `minecraft:behavior.look_at_player` | 69 | 69 | 65 | 4 |
| `minecraft:behavior.random_stroll` | 64 | 65 | 59 | 6 |
| `minecraft:behavior.random_look_around` | 55 | 55 | 54 | 1 |
| `minecraft:behavior.float` | 49 | 49 | 48 | 1 |
| `minecraft:behavior.nearest_attackable_target` | 49 | 55 | 37 | 18 |
| `minecraft:behavior.hurt_by_target` | 42 | 43 | 38 | 5 |
| `minecraft:behavior.panic` | 37 | 43 | 30 | 13 |
| `minecraft:behavior.melee_box_attack` | 32 | 36 | 13 | 23 |
| `minecraft:behavior.tempt` | 31 | 37 | 23 | 14 |
| `minecraft:behavior.avoid_mob_type` | 28 | 28 | 23 | 5 |
| `minecraft:behavior.breed` | 26 | 29 | 4 | 25 |
| `minecraft:behavior.mount_pathing` | 26 | 27 | 16 | 11 |
| `minecraft:behavior.follow_parent` | 24 | 27 | 3 | 24 |
| `minecraft:behavior.pickup_items` | 20 | 20 | 18 | 2 |
| `minecraft:behavior.equip_item` | 17 | 17 | 16 | 1 |
| `minecraft:behavior.ranged_attack` | 14 | 23 | 6 | 17 |
| `minecraft:behavior.random_swim` | 12 | 12 | 12 | 0 |
| `minecraft:behavior.player_ride_tamed` | 10 | 10 | 1 | 9 |
| `minecraft:behavior.find_mount` | 8 | 8 | 0 | 8 |
| `minecraft:behavior.flee_sun` | 7 | 7 | 5 | 2 |
| `minecraft:behavior.run_around_like_crazy` | 6 | 6 | 2 | 4 |
| `minecraft:behavior.stomp_turtle_egg` | 6 | 6 | 6 | 0 |
| `minecraft:behavior.swim_idle` | 6 | 6 | 6 | 0 |
| `minecraft:behavior.swim_wander` | 6 | 6 | 6 | 0 |
| `minecraft:behavior.celebrate` | 5 | 5 | 0 | 5 |
| `minecraft:behavior.follow_owner` | 5 | 5 | 1 | 4 |
| `minecraft:behavior.leap_at_target` | 5 | 6 | 3 | 3 |
| `minecraft:behavior.move_to_village` | 5 | 5 | 0 | 5 |
| `minecraft:behavior.use_kinetic_weapon` | 5 | 7 | 2 | 5 |
| `minecraft:behavior.look_at_entity` | 4 | 4 | 3 | 1 |
| `minecraft:behavior.move_to_water` | 4 | 5 | 3 | 2 |
| `minecraft:behavior.move_towards_home_restriction` | 4 | 4 | 4 | 0 |
| `minecraft:behavior.stay_while_sitting` | 4 | 4 | 1 | 3 |
| `minecraft:behavior.teleport_to_owner` | 4 | 4 | 0 | 4 |
| `minecraft:behavior.timer_flag_1` | 4 | 6 | 1 | 5 |
| `minecraft:behavior.float_wander` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.go_home` | 3 | 3 | 0 | 3 |
| `minecraft:behavior.look_at_trading_player` | 3 | 3 | 3 | 0 |
| `minecraft:behavior.move_towards_dwelling_restriction` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.nearest_prioritized_attackable_target` | 3 | 4 | 1 | 3 |
| `minecraft:behavior.random_hover` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.random_look_around_and_sit` | 3 | 3 | 3 | 0 |
| `minecraft:behavior.slime_float` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.slime_keep_on_jumping` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.slime_random_direction` | 3 | 3 | 2 | 1 |
| `minecraft:behavior.take_flower` | 3 | 3 | 1 | 2 |
| `minecraft:behavior.trade_with_player` | 3 | 3 | 3 | 0 |
| `minecraft:behavior.aquatic_charge_attack` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.avoid_block` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.celebrate_survive` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.charge_held_item` | 2 | 2 | 1 | 1 |
| `minecraft:behavior.controlled_by_player` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.drink_potion` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.follow_caravan` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.follow_mob` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.follow_target_captain` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.guardian_attack` | 2 | 3 | 2 | 1 |
| `minecraft:behavior.harvest_farm_block` | 2 | 3 | 0 | 3 |
| `minecraft:behavior.jump_to_block` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.lay_egg` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.make_love` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.move_indoors` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.move_outdoors` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.move_to_land` | 2 | 2 | 1 | 1 |
| `minecraft:behavior.move_to_random_block` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.ocelot_sit_on_block` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.ocelotattack` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.place_block` | 2 | 2 | 1 | 1 |
| `minecraft:behavior.play` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.raid_garden` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.receive_love` | 2 | 2 | 0 | 2 |
| `minecraft:behavior.share_items` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.slime_attack` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.squid_dive` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.squid_flee` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.squid_idle` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.squid_move_away_from_ground` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.squid_out_of_water` | 2 | 2 | 2 | 0 |
| `minecraft:behavior.trade_interest` | 2 | 15 | 1 | 14 |
| `minecraft:behavior.admire_item` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.barter` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.beg` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.charge_attack` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.circle_around_anchor` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.croak` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.defend_trusted_target` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.defend_village_target` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.delayed_attack` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dig` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.dragonchargeplayer` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragondeath` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragonflaming` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragonholdingpattern` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragonlanding` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragonscanning` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragonstrafeplayer` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.dragontakeoff` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.drink_milk` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.drop_item_for` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.eat_block` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.eat_carried_item` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.eat_mob` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.emerge` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.explore_outskirts` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.fertilize_farm_block` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.find_cover` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.find_underwater_treasure` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.fire_at_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.float_tempt` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.go_and_give_items_to_noteblock` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.go_and_give_items_to_owner` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.hide` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.hold_ground` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.inspect_bookshelf` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.investigate_suspicious_location` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.jump_around_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.knockback_roar` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.lay_down` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.look_at_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.melee_attack` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.mingle` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.move_around_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.move_through_village` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.move_to_block` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.move_to_liquid` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.move_towards_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.nap` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.offer_flower` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.open_door` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.owner_hurt_by_target` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.owner_hurt_target` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.pet_sleep_with_owner` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.play_dead` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.ram_attack` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.random_breach` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.random_fly` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.random_search_and_dig` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.random_sitting` | 1 | 2 | 1 | 1 |
| `minecraft:behavior.restrict_open_door` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.rise_to_liquid_level` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.roar` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.roll` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.scared` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.send_event` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.silverfish_merge_with_stone` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.silverfish_wake_up_friends` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.skeleton_horse_trap` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.sleep` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.snacking` | 1 | 2 | 1 | 1 |
| `minecraft:behavior.sneeze` | 1 | 2 | 0 | 2 |
| `minecraft:behavior.sniff` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.sonic_boom` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.stalk_and_pounce_on_target` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.stay_near_noteblock` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.stomp_attack` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.stroll_towards_village` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.summon_entity` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.swell` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.swim_up_for_breath` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.swim_with_entity` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.swoop_attack` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.take_block` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.target_when_pushed` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.timer_flag_2` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.timer_flag_3` | 1 | 1 | 0 | 1 |
| `minecraft:behavior.transport_items` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.wither_random_attack_pos_goal` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.wither_target_highest_damage` | 1 | 1 | 1 | 0 |
| `minecraft:behavior.work` | 1 | 4 | 0 | 4 |
| `minecraft:behavior.work_composter` | 1 | 2 | 0 | 2 |

### (c) Triggers (10)

| Trigger | Entities | Instances |
|---|---|---|
| `minecraft:on_target_acquired` | 22 | 28 |
| `minecraft:on_target_escape` | 10 | 13 |
| `minecraft:on_friendly_anger` | 3 | 3 |
| `minecraft:on_hurt` | 3 | 5 |
| `minecraft:on_hurt_by_player` | 2 | 4 |
| `minecraft:on_death` | 1 | 1 |
| `minecraft:on_equipment_changed` | 1 | 1 |
| `minecraft:on_start_landing` | 1 | 1 |
| `minecraft:on_start_takeoff` | 1 | 1 |
| `minecraft:on_wake_with_owner` | 1 | 1 |

### Parameters vanilla sets on the 30 most used non-goal components

Format: `parameter (instances; most common values with counts)`. `dict[n]` and `list[n]` are objects and arrays with n members.

- `minecraft:physics` [126]: has_gravity (9; false x9); has_collision (4; false x4); push_towards_closest_space (1; true x1)
- `minecraft:collision_box` [125]: width (110; 0.6 x42, 0.98 x15, 1.4 x12); height (76; 1.9 x27, 0.25 x10, 0.7 x9)
- `minecraft:type_family` [124]: family (195; list[2] x59, list[3] x45, list[4] x43)
- `minecraft:conditional_bandwidth_optimization` [117]: default_values (32; dict[3] x32); conditional_values (7; list[1] x7)
- `minecraft:health` [94]: value (68; 20 x22, 10 x14, 16 x6); max (64; 20 x21, 10 x13, 16 x6)
- `minecraft:nameable` [94]: allow_name_tag_renaming (4; false x4); always_show (3; true x2, false x1); default_trigger (1; dict[2] x1); name_actions (1; list[1] x1)
- `minecraft:movement` [93]: value (78; 0.25 x19, 0.3 x16, 0.1 x9); max (2; 1 x1, 0.0 x1)
- `minecraft:is_hidden_when_invisible` [92]: (empty object)
- `minecraft:pushable_by_block` [91]: (empty object)
- `minecraft:hurt_on_condition` [87]: damage_conditions (88; list[1] x86, list[2] x1, list[3] x1)
- `minecraft:pushable_by_entity` [85]: presets (33; list[1] x30, list[2] x3)
- `minecraft:breathable` [84]: total_supply (82; 15 x78, 5 x2, 240 x1); suffocate_time (82; 0 x81, -1 x1); breathes_water (36; true x33, false x3); breathes_air (19; true x11, false x8); generates_bubbles (6; false x6); breathes_lava (4; true x2, false x2); suffocateTime (2; 0 x1, -1 x1); totalSupply (2; 15 x1, 0 x1); inhale_time (1; 3.75 x1)
- `minecraft:experience_reward` [80]: on_death (77; "query.last_hit_by_player ? Math.Random(1,3) : 0" x37, "query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0" x14, "query.last_hit_by_player ? 5 : 0" x9); on_bred (29; "Math.Random(1,7)" x29)
- `minecraft:jump.static` [79]: jump_power (1; 0.6 x1)
- `minecraft:loot` [78]: table (23; "loot_tables/entities/zombie.json" x5, "loot_tables/entities/pillager_captain.json" x4, "loot_tables/entities/horse.json" x3)
- `minecraft:despawn` [76]: despawn_from_distance (73; dict[0] x67, dict[2] x6); filters (3; dict[1] x3); remove_child_entities (1; true x1)
- `minecraft:navigation.walk` [66]: can_path_over_water (50; true x47, false x3); avoid_water (42; true x41, false x1); avoid_damage_blocks (31; true x30, false x1); using_door_annotation (29; true x29); is_amphibious (15; true x15); can_pass_doors (13; true x13); can_open_doors (10; true x9, false x1); avoid_sun (9; true x7, false x2); can_path_over_lava (6; true x5, false x1); can_break_doors (5; true x5); can_sink (4; false x4); blocks_to_avoid (2; list[1] x2); can_float (2; true x2); avoid_portals (2; false x1, true x1); can_walk (2; true x2); can_walk_in_lava (1; true x1)
- `minecraft:movement.basic` [65]: max_turn (1; 180.0 x1)
- `minecraft:can_climb` [57]: (empty object)
- `minecraft:attack` [48]: damage (51; 3 x17, 2 x16, 5 x4); effect_name (8; "poison" x5, "hunger" x1, "slowness" x1); effect_duration (8; 10 x3, 18 x1, 0 x1)
- `minecraft:scale` [48]: value (49; 0.5 x34, 0.4 x3, 1 x3)
- `minecraft:is_baby` [44]: (empty object)
- `minecraft:leashable` [43]: presets (14; list[1] x11, list[2] x3); unleash_on_removal (9; false x9); on_unleash (8; dict[2] x8); on_leash (4; dict[2] x4)
- `minecraft:offspring` [43]: offspring_pairs (43; dict[1] x40, dict[2] x3); mutation_factor (5; dict[1] x4, dict[2] x1); inherit_tamed (5; false x5); combine_parent_colors (3; true x3); property_inheritance (3; dict[1] x3); parent_centric_attribute_blending (3; list[1] x2, list[3] x1); blend_attributes (2; false x2); mutation_strategy (1; "random" x1); random_variant_mutation_interval (1; list[2] x1); random_extra_variant_mutation_interval (1; list[2] x1); deny_parents_variant (1; dict[3] x1)
- `minecraft:spawn_egg_interaction` [43]: (empty object)
- `minecraft:leashable_to` [42]: unleash_on_removal (8; false x8)
- `minecraft:damage_sensor` [40]: triggers (42; dict[2] x20, dict[3] x8, list[2] x7)
- `minecraft:balloonable` [39]: mass (14; 0.5 x5, 0.6 x2, 0.4 x2)
- `minecraft:rideable` [36]: seats (67; dict[1] x50, dict[2] x6, list[3] x4); seat_count (67; 1 x59, 2 x6, 4 x1); family_types (59; list[1] x50, list[3] x5, list[2] x4); interact_text (30; "action.interact.ride.horse" x14, "action.interact.ride.boat" x6, "action.interact.mount" x6); crouching_skip_interact (12; true x12); pull_in_entities (10; true x10); passenger_max_width (6; 1.375 x6); on_rider_enter_event (4; "minecraft:on_passenger_mount" x1, "minecraft:on_mount" x1, "minecraft:on_player_mount" x1); on_rider_exit_event (4; "minecraft:on_passenger_dismount" x1, "minecraft:on_dismount" x1, "minecraft:on_player_dismount" x1); dismount_mode (2; "on_top_center" x2)
- `minecraft:ageable` [35]: duration (35; 1200 x34, 2400 x1); grow_up (35; dict[2] x35); pause_growth_items (33; list[1] x33); reset_growth_items (33; list[1] x33); feed_items (26; list[1] x8, list[2] x6, "wheat" x4); interact_filters (1; dict[3] x1); drop_items (1; list[1] x1)

Observations: `minecraft:health` and `minecraft:movement` are one number each; `minecraft:navigation.walk` is 16 booleans; `minecraft:breathable` still carries the camelCase `suffocateTime` and `totalSupply` in two files, so a reader must accept both spellings; `minecraft:despawn` is almost always `{"despawn_from_distance": {}}`, that is, the engine defaults; `minecraft:rideable.seats` is a single object in 50 instances and an array in 17; `minecraft:interact.interactions` and `environment_sensor.triggers` and `damage_sensor.triggers` are each a single object or an array.

### Parameters vanilla sets on the 30 most used goals

- `minecraft:behavior.look_at_player` [69]: priority (64; 7 x21, 8 x19, 9 x8); look_distance (52; 6.0 x24, 6 x21, 16 x2); probability (30; 0.02 x25, 0.01 x2, 1 x2); look_time (21; dict[2] x21); angle_of_view_horizontal (1; 45 x1)
- `minecraft:behavior.random_stroll` [64]: priority (62; 6 x24, 7 x14, 9 x7); speed_multiplier (59; 1 x19, 0.8 x10, 1.0 x9); xz_dist (3; 3 x1, 16 x1, 2 x1); interval (2; 100 x2); y_dist (1; 1 x1)
- `minecraft:behavior.random_look_around` [55]: priority (53; 8 x19, 9 x17, 7 x6); look_distance (1; 8 x1)
- `minecraft:behavior.float` [49]: priority (49; 0 x40, 1 x6, 7 x1); chance_per_tick_to_float (6; 0.0 x4, 1.0 x1, 1 x1); time_under_water_to_dismount_passengers (6; 2.0 x5, 2 x1)
- `minecraft:behavior.nearest_attackable_target` [49]: priority (55; 2 x25, 1 x9, 3 x8); entity_types (55; list[1] x31, list[2] x12, list[3] x10); must_see (46; true x43, false x3); within_radius (19; 16 x5, 16.0 x4, 12 x3); reselect_targets (18; true x18); attack_interval (12; dict[2] x8, dict[1] x4); must_see_forget_duration (8; 17 x3, 17.0 x2, 40 x2); must_reach (3; true x3); persist_time (2; 0.5 x1, 0.0 x1); target_acquisition_probability (2; 0.5 x2); scan_interval (1; 20 x1); target_search_height (1; 80 x1)
- `minecraft:behavior.hurt_by_target` [42]: priority (43; 1 x31, 2 x9, 3 x2); entity_types (17; list[1] x9, dict[2] x4, dict[1] x4); hurt_owner (2; true x2)
- `minecraft:behavior.panic` [37]: priority (43; 1 x32, 2 x4, 3 x4); speed_multiplier (39; 1.25 x17, 1.2 x6, 2.0 x5); ignore_mob_damage (4; true x4); damage_sources (3; list[9] x3); force (2; true x2); panic_sound (1; "panic" x1); sound_interval (1; dict[2] x1); prefer_water (1; true x1)
- `minecraft:behavior.melee_box_attack` [32]: priority (35; 4 x15, 3 x7, 2 x6); track_target (22; true x22); speed_multiplier (12; 1.25 x5, 1 x2, 1.4 x1); can_spread_on_fire (5; true x5); cooldown_time (3; 2 x2, 0.75 x1); require_complete_path (3; true x3); on_attack (2; dict[1] x1, dict[2] x1); attack_once (2; true x2); random_stop_interval (1; 100 x1); melee_fov (1; 360 x1)
- `minecraft:behavior.tempt` [31]: priority (37; 4 x13, 5 x12, 3 x7); items (37; list[1] x19, list[2] x8, list[3] x4); speed_multiplier (33; 1.25 x10, 1.2 x8, 0.5 x5); can_tempt_vertically (9; true x9); within_radius (9; 16 x6, 8 x3); on_tempt_end (8; dict[1] x8); can_get_scared (3; true x3); tempt_sound (2; "tempt" x2); sound_interval (2; list[2] x1, dict[2] x1); on_tempt_start (2; dict[1] x2); can_tempt_while_ridden (1; true x1)
- `minecraft:behavior.avoid_mob_type` [28]: entity_types (28; list[1] x25, list[3] x2, list[2] x1); priority (27; 4 x6, 1 x6, 2 x5); max_dist (3; 16 x2, 6 x1); probability_per_strength (2; 0.14 x2); remove_target (2; true x2); avoid_mob_sound (2; "retreat" x2); sound_interval (2; dict[2] x2); max_flee (1; 20 x1); ignore_visibility (1; true x1); on_escape_event (1; dict[2] x1)
- `minecraft:behavior.breed` [26]: priority (29; 3 x15, 2 x7, 4 x6); speed_multiplier (28; 1.0 x25, 0.6 x2, 0.75 x1)
- `minecraft:behavior.mount_pathing` [26]: priority (27; 2 x13, 1 x6, 5 x6); target_dist (27; 0.0 x16, 0 x9, 4.0 x1); speed_multiplier (27; 1.25 x14, 1.5 x11, 4 x1); track_target (27; true x27)
- `minecraft:behavior.follow_parent` [24]: priority (27; 5 x9, 6 x8, 4 x7); speed_multiplier (27; 1.1 x15, 1.0 x7, 1.25 x2)
- `minecraft:behavior.pickup_items` [20]: goal_radius (20; 2 x19, 2.2 x1); max_dist (20; 3 x17, 32 x1, 10 x1); priority (19; 6 x5, 5 x4, 7 x4); speed_multiplier (19; 1 x8, 1.0 x6, 0.5 x3); pickup_based_on_chance (13; true x10, false x3); can_pickup_any_item (12; true x10, false x2); excluded_items (9; list[1] x8, list[2] x1); can_pickup_to_hand_or_equipment (3; false x3); search_height (1; 32 x1); pickup_same_items_as_in_hand (1; true x1); cooldown_after_being_attacked (1; 20 x1); on_pickup_item_start (1; dict[1] x1); on_pickup_item_end (1; dict[1] x1); stop_if_holding_item (1; true x1)
- `minecraft:behavior.equip_item` [17]: priority (17; 3 x11, 2 x4, 4 x1)
- `minecraft:behavior.ranged_attack` [14]: priority (22; 0 x8, 2 x6, 1 x4); attack_radius (14; 64 x6, 15.0 x4, 8 x2); attack_interval (13; dict[2] x9, 3.5 x2, 2.5 x2); attack_range (9; dict[2] x9); charge_shoot_trigger (7; 2 x6, 4.0 x1); charge_charged_trigger (6; 1 x6); attack_interval_min (4; 1 x3, 3 x1); attack_interval_max (4; 1 x2, 3 x2); speed_multiplier (3; 1.0 x1, 1.25 x1, 1 x1); burst_interval (1; 0.3 x1); burst_shots (1; 3 x1); swing (1; true x1); attack_radius_min (1; 4 x1); target_in_sight_time (1; 0.1 x1)
- `minecraft:behavior.random_swim` [12]: priority (12; 3 x4, 7 x3, 8 x1); interval (11; 0 x9, 80 x1, 100 x1); xz_dist (9; 16 x6, 30 x2, 20 x1); y_dist (8; 4 x6, 15 x2); speed_multiplier (8; 1 x4, 1.5 x2, 0.5 x1); avoid_surface (2; false x2)
- `minecraft:behavior.player_ride_tamed` [10]: priority (4; 1 x2, 0 x2)
- `minecraft:behavior.find_mount` [8]: priority (8; 1 x6, 0 x1, 4 x1); within_radius (8; 16 x8); start_delay (5; 15 x4, 100 x1); max_failed_attempts (4; 20 x4); avoid_water (1; true x1); mount_distance (1; 2.0 x1); target_needed (1; false x1)
- `minecraft:behavior.flee_sun` [7]: priority (7; 2 x4, 4 x2, 3 x1); speed_multiplier (7; 1 x7)
- `minecraft:behavior.run_around_like_crazy` [6]: priority (6; 1 x6); speed_multiplier (6; 1.2 x6)
- `minecraft:behavior.stomp_turtle_egg` [6]: goal_radius (6; 1.14 x6); priority (6; 4 x3, 5 x2, 6 x1); search_height (6; 2 x6); interval (6; 20 x6); search_range (6; 10 x6); speed_multiplier (6; 1 x6)
- `minecraft:behavior.swim_idle` [6]: priority (6; 5 x3, 7 x1, 8 x1); idle_time (2; 5.0 x1, 5 x1); success_rate (2; 0.05 x1, 0.1 x1)
- `minecraft:behavior.swim_wander` [6]: interval (6; 0.1 x2, 10 x2, 1 x1); priority (6; 4 x3, 5 x2, 7 x1); look_ahead (5; 2 x4, 2.0 x1); speed_multiplier (3; 1.5 x2, 0.014 x1); wander_time (1; 5.0 x1)
- `minecraft:behavior.celebrate` [5]: celebration_sound (5; "celebrate" x5); duration (5; 30 x4, 30.0 x1); jump_interval (5; dict[2] x5); on_celebration_end_event (5; dict[2] x5); priority (5; 5 x5); sound_interval (5; dict[2] x5)
- `minecraft:behavior.follow_owner` [5]: priority (5; 6 x2, 4 x2, 3 x1); speed_multiplier (5; 1.0 x4, 8 x1); start_distance (5; 10 x3, 16 x1, 5 x1); stop_distance (5; 2 x3, 4 x1, 1 x1); ignore_vibration (3; true x2, false x1); post_teleport_distance (2; -1 x2); can_teleport (1; false x1)
- `minecraft:behavior.leap_at_target` [5]: priority (6; 4 x4, 3 x2); yd (4; 0.4 x4); must_be_on_ground (3; false x3); target_dist (1; 0.3 x1)
- `minecraft:behavior.move_to_village` [5]: priority (5; 5 x2, 6 x1, 4 x1); speed_multiplier (5; 1 x2, 0.7 x1, 1.0 x1); goal_radius (4; 2 x3, 2.0 x1)
- `minecraft:behavior.use_kinetic_weapon` [5]: approach_distance (7; 10 x4, 12 x2, 10.0 x1); reposition_distance (7; dict[2] x7); cooldown_distance (7; dict[2] x7); weapon_reach_multiplier (7; 0.5 x7); weapon_min_speed_multiplier (7; 0.2 x7); hijack_mount_navigation (7; true x7); track_target (7; true x7); priority (7; 3 x4, 8 x1, 4 x1); cooldown_speed_multiplier (3; 4 x1, 1.4 x1, 1.5 x1); speed_multiplier (3; 4 x1, 1.4 x1, 1.5 x1); reposition_speed_multiplier (2; 4 x1, 1.4 x1)
- `minecraft:behavior.look_at_entity` [4]: priority (4; 10 x2, 2 x1, 9 x1); look_time (3; dict[2] x3); look_distance (3; 6 x2, 8 x1); angle_of_view_horizontal (2; 170 x1, 45 x1); angle_of_view_vertical (1; 135 x1); probability (1; 1 x1); filters (1; dict[3] x1)

Observations: every goal has `priority`; `speed_multiplier` is the second most common field; `nearest_attackable_target`, `hurt_by_target`, `avoid_mob_type` and the other targeting goals take `entity_types[] { filters, max_dist, must_see, must_see_forget_duration, sprint_speed_multiplier, walk_speed_multiplier, cooldown }` (`Definitions/NestedTables/entity_types.md`); `attack_interval` is both a number and a `{min, max}` object; the docs' `nearest_attackable_target` page lists 20 parameters of which vanilla sets 12.

## 3. Filters

### Grammar

`Filter Group.json` (client_server/common/1.21.20): a filter is one `Filter Test`, an array of filter groups, or a `Filter Group Map` with keys `all_of`, `any_of`, `none_of` and the aliases `all`, `AND`, `any`, `OR`, `NOT`, each holding a filter group; groups nest without limit. `Filter Test.json`: `test` (required string), `subject`, `operator`, `domain`, `value`, each of the last four typed as boolean, integer, number or string. `FilterSubject.json` (1.21.120): `self`, `other`, `player`, `target`, `parent`, `baby`, `block`, `damager`, `holder`, `item`, backed by `int16`, which is why the 1.26 serializer writes `"subject": 1` for `other` and `0` for `self`. Operators per `Definitions/NestedTables/operator.md`: `!=`, `<`, `<=`, `<>`, `=`, `==`, `>`, `>=`, `equals`, `not`; vanilla also writes `0` for `==` and `1` for `!=` (checked against the vindicator: `has_component ... operator 1 value minecraft:is_baby` where the text form is `!=`). Defaults per `Documents/EntityEvents.md`: subject `self`, operator `==`; `value` is required except for `bool_property` (assumes `true`) and `has_property` (assumes `==`), per `IntroductionToEntityProperties.md`. `domain` is "only used by a few tests to provide additional context, such as the inventory slot to test in for the `has_equipment` test"; in vanilla it holds equipment slots (`hand` 130, `main_hand` 37, `inventory` 36, `armor` 3, `head` 3, `torso`, `leg`, `feet` 1 each), property names (`minecraft:sulfur_cube_archetype` 36, `minecraft:armadillo_state` 19, `minecraft:creaking_state` 13 and 14 others) and game rule names for `is_game_rule` (`tntexplodes` 8, `domobspawning` 1). Values are strings 1208 times, booleans 353, integers 221, floats 7, and absent 108 times.

Where filters live: component bodies 655 instances (`entity_types[].filters`, `environment_sensor.triggers[].filters`, `damage_sensor`, `interact.on_interact.filters`, `despawn.filters`, `spawn_entity.filters`, `look_at_entity.filters`), component groups 801, event nodes 441. Combinators: `all_of` 361, `any_of` 131, `none_of` 9, `AND` 50, `OR` 21, `NOT`/`all`/`any` 0; the deepest nesting is 4. The 27 files with the integer encoding and `AND`/`OR` are blaze, breeze, cod, creeper, elder_guardian, endermite, evocation_illager, ghast, guardian, iron_golem, magma_cube, phantom, piglin_brute, pillager, pufferfish, salmon, shulker, silverfish, slime, tropicalfish, vex, villager, vindicator, wandering_trader, wither, wither_skeleton, zombie_villager (18 of the 34 `1.26.0` files, 8 of the 56 `1.26.50` files, 1 `1.26.20` file).

Spawn rules use the same grammar in `minecraft:biome_filter` (`has_biome_tag` 185, `is_snow_covered` 1) and trade tables in `TradeItem.filters` (`in_overworld` and `is_mark_variant` with `operator: "="`, cartographer and fisherman economy tables). `in_overworld` is used nowhere else, so the runtime needs 87 tests for vanilla: the 86 below plus `in_overworld`. The 21 documented tests no vanilla file uses: `any_slot_empty`, `clock_time`, `float_property`, `has_equipment_block_tag`, `has_item_with_component`, `has_property`, `has_tag`, `in_clouds`, `is_altitude`, `is_climbing`, `is_humid`, `is_immobile`, `is_in_same_vehicle`, `is_target`, `is_temperature_type`, `is_weather` (marked DEPRECATED), `light_level`, `moon_intensity`, `moon_phase`, `on_ladder`, `surface_mob`.

### Tests used in vanilla entity files

"Operators seen" and "Subjects seen" use the literal spellings, with `default` for an absent key.

| Test | Instances | Entities | Operators seen | Subjects seen |
|---|---|---|---|---|
| `is_family` | 526 | 86 | default 384, != 30, 0 86, == 5, not 17, 1 4 | other 421, self 3, default 6, 1 90, damager 1, target 5 |
| `has_equipment` | 160 | 35 | not 20, default 140 | other 130, self 28, default 2 |
| `has_biome_tag` | 141 | 12 | default 116, != 14, not 11 | default 141 |
| `has_component` | 108 | 37 | default 22, not 13, != 65, 1 4, == 3, equals 1 | default 58, self 22, 1 4, other 20, target 4 |
| `in_lava` | 91 | 86 | default 37, == 54 | self 74, default 15, other 2 |
| `enum_property` | 83 | 26 | default 55, not 28 | default 45, other 35, self 3 |
| `hourly_clock_time` | 70 | 3 | > 1, <= 1, >= 34, < 34 | default 70 |
| `has_equipment_tag` | 50 | 6 | default 46, not 4 | other 26, self 6, player 4, default 14 |
| `in_water` | 49 | 26 | default 27, == 7, != 13, 1 2 | default 24, other 19, self 4, 1 2 |
| `is_sneak_held` | 42 | 15 | default 42 | other 42 |
| `is_difficulty` | 42 | 11 | default 25, != 14, 1 3 | default 39, 0 3 |
| `rider_count` | 35 | 13 | equals 23, default 4, > 5, == 3 | self 33, default 2 |
| `bool_property` | 32 | 9 | != 7, default 24, == 1 | default 32 |
| `is_controlling_passenger_family` | 30 | 18 | default 30 | self 18, other 12 |
| `is_daytime` | 27 | 10 | default 26, 0 1 | default 26, 0 1 |
| `is_variant` | 26 | 6 | != 2, == 24 | default 2, self 22, other 2 |
| `is_mark_variant` | 25 | 3 | != 13, default 12 | self 13, other 12 |
| `is_underwater` | 23 | 10 | == 7, default 15, != 1 | self 8, other 2, default 13 |
| `has_ability` | 19 | 3 | not 3, default 16 | other 19 |
| `has_ranged_weapon` | 18 | 4 | == 8, default 10 | self 8, default 10 |
| `is_riding` | 16 | 6 | default 8, == 3, != 1, equals 4 | default 7, other 2, self 7 |
| `is_vehicle_family` | 14 | 3 | not 8, default 6 | other 2, default 12 |
| `actor_health` | 13 | 4 | > 8, default 3, <= 1, >= 1 | self 5, other 3, target 3, default 2 |
| `on_ground` | 12 | 8 | default 8, == 4 | default 9, self 3 |
| `is_skin_id` | 12 | 2 | default 12 | other 12 |
| `has_nametag` | 11 | 6 | default 11 | default 11 |
| `has_target` | 10 | 7 | default 8, == 2 | self 3, default 5, other 2 |
| `is_underground` | 10 | 4 | default 9, == 1 | default 9, self 1 |
| `y_rotation` | 10 | 1 | >= 5, < 5 | default 10 |
| `is_game_rule` | 9 | 3 | default 6, == 3 | default 9 |
| `is_panicking` | 7 | 5 | default 7 | default 7 |
| `is_block` | 7 | 2 | default 4, != 2, == 1 | block 7 |
| `is_moving` | 7 | 7 | default 3, == 4 | self 7 |
| `is_baby` | 7 | 4 | default 6, == 1 | default 5, other 2 |
| `is_sneaking` | 7 | 3 | default 5, != 1, == 1 | other 7 |
| `distance_to_nearest_player` | 7 | 4 | > 6, <= 1 | default 7 |
| `has_mob_effect` | 7 | 2 | default 7 | self 4, other 3 |
| `target_distance` | 6 | 3 | <= 2, > 2, >= 2 | self 4, default 2 |
| `is_snow_covered` | 6 | 4 | default 6 | default 6 |
| `in_nether` | 6 | 3 | == 4, default 2 | self 4, default 2 |
| `on_fire` | 5 | 3 | default 5 | default 3, damager 1, self 1 |
| `is_leashed` | 5 | 2 | default 5 | default 3, self 2 |
| `is_sitting` | 5 | 3 | default 5 | self 5 |
| `owner_distance` | 5 | 4 | > 5 | default 5 |
| `is_sleeping` | 5 | 4 | default 5 | default 5 |
| `weather_at_position` | 5 | 1 | != 3, default 2 | default 4, self 1 |
| `in_block` | 5 | 1 | default 4, not 1 | self 4, default 1 |
| `is_owner` | 4 | 2 | default 4 | other 4 |
| `all_slots_empty` | 4 | 2 | not 3, default 1 | other 2, self 1, default 1 |
| `in_contact_with_water` | 4 | 4 | default 3, == 1 | default 4 |
| `is_tamed` | 4 | 2 | default 4 | default 4 |
| `is_brightness` | 4 | 2 | > 2, < 2 | default 4 |
| `is_persistent` | 4 | 2 | default 4 | default 4 |
| `is_raider` | 4 | 1 | default 4 | other 3, self 1 |
| `int_property` | 3 | 1 | > 2, <= 1 | default 3 |
| `is_biome` | 3 | 2 | default 3 | default 3 |
| `random_chance` | 3 | 3 | default 3 | default 3 |
| `is_visible` | 3 | 1 | 0 1, default 2 | 0 1, self 2 |
| `is_avoiding_mobs` | 3 | 1 | 0 1, default 2 | 0 1, self 2 |
| `was_last_hurt_by` | 2 | 1 | default 2 | other 2 |
| `is_sprinting` | 2 | 1 | default 2 | other 2 |
| `in_water_or_rain` | 2 | 2 | != 2 | default 2 |
| `weather` | 2 | 1 | == 2 | default 2 |
| `trusts` | 2 | 1 | != 1, == 1 | other 2 |
| `is_missing_health` | 2 | 2 | default 2 | default 1, self 1 |
| `in_caravan` | 2 | 2 | default 2 | default 2 |
| `is_riding_self` | 2 | 2 | default 2 | other 2 |
| `inactivity_timer` | 2 | 2 | default 2 | self 2 |
| `is_temperature_value` | 2 | 1 | > 1, < 1 | default 2 |
| `has_damage` | 2 | 2 | default 2 | default 2 |
| `has_silk_touch` | 1 | 1 | default 1 | other 1 |
| `is_waterlogged` | 1 | 1 | == 1 | block 1 |
| `is_navigating` | 1 | 1 | default 1 | default 1 |
| `home_distance` | 1 | 1 | > 1 | default 1 |
| `is_bound_to_creaking_heart` | 1 | 1 | default 1 | default 1 |
| `is_color` | 1 | 1 | default 1 | other 1 |
| `has_container_open` | 1 | 1 | default 1 | other 1 |
| `is_in_village` | 1 | 1 | default 1 | self 1 |
| `redstone_strength_at_position` | 1 | 1 | > 1 | default 1 |
| `has_same_equipment_in_slot_as` | 1 | 1 | default 1 | other 1 |
| `actor_has_item_with_enchantment_in_slot` | 1 | 1 | not 1 | other 1 |
| `has_trade_supply` | 1 | 1 | default 1 | self 1 |
| `is_leashed_to` | 1 | 1 | default 1 | other 1 |
| `on_hot_block` | 1 | 1 | default 1 | self 1 |
| `taking_fire_damage` | 1 | 1 | default 1 | self 1 |
| `has_damaged_equipment` | 1 | 1 | default 1 | self 1 |

## 4. Spawn rules

### Grammar

`Spawn Rules.json` (server/spawn/1.21.50): `description {identifier (required), population_control}` and `conditions[]`, each condition a `Spawn BiomeConditions` object with these keys (the schema's full list; defaults from the schema, descriptions from the docs pages under `Definitions/NestedTables/`):

| Component | Schema body | Vanilla files | Instances | Vanilla values |
|---|---|---|---|---|
| `minecraft:weight` | `default` (required int), `rarity` (int, 0) | 54 | 99 | default 10 x14, 8 x14, 1 x9, 5 x9, 100 x8; rarity 2 x2, 3 x1 |
| `minecraft:biome_filter` | filter group | 54 | 101 | `has_biome_tag` 185 (`==` 61, `!=` 7, `not` 1), `is_snow_covered` 1; `all_of` 24, `any_of` 16, `none_of` 1; 21 instances are bare arrays |
| `minecraft:herd` | `min_size` 1, `max_size` 1, `initial_event`, `initial_event_count` 0, `event`, `event_skip_count` 0; object or array | 49 | 94 | min 3 x71, 2 x51, 1 x32, 4 x14, 8 x1; max 5 x76, 4 x30, 2 x18, 6 x18; `event` 6 `minecraft:entity_born` plus tropicalfish color events; `initial_event` `minecraft:promote_to_patrol_captain` and `minecraft:as_rider` |
| `minecraft:spawns_on_surface` | empty object | 45 | 84 | |
| `minecraft:brightness_filter` | `min` 0, `max` 15 (0 to 15), `adjust_for_weather` false | 38 | 73 | min 7 x42, 0 x30, 9 x1; max 15 x43, 7 x27, 11 x2, 4 x1; adjust_for_weather true 27 |
| `minecraft:difficulty_filter` | `min` peaceful, `max` hard; enum `peaceful`, `easy`, `normal`, `hard` | 25 | 41 | min easy 31, peaceful 7; max hard 38 |
| `minecraft:spawns_on_block_filter` | string or array of block descriptors | 21 | 41 | string 25, array 16 (`grass_block` 26, `coarse_dirt`, `sand`, `red_sand`, `clay`, `ice`, terracottas) |
| `minecraft:spawns_underground` | empty object | 21 | 31 | |
| `minecraft:density_limit` | `surface` -1, `underground` -1 | 14 | 26 | surface 5 x9, 20 x4, 3 x3, 2 x2, 4 x2; underground 5, 20, 0, 2 |
| `minecraft:spawns_underwater` | empty object | 11 | 22 | |
| `minecraft:height_filter` | `min` 24, `max` 128 (schema defaults) | 9 | 14 | min 0 x7, 38, 50, 60, -64; max 64 x9, 58, 30, 66, 67 |
| `minecraft:distance_filter` | `min` 24, `max` 128 | 5 | 13 | min 12 x10, 24 x3; max 32 x10, 48 x3 |
| `minecraft:spawns_on_block_prevented_filter` | string or array | 5 | 9 | arrays of 2 |
| `minecraft:permute_type` | array of `{weight (required), entity_type, min_guaranteed}`; docs call the third `guaranteed_count` | 2 | 5 | zombie 95/5 `minecraft:zombie_villager_v2`; pillager_patrol 100 `minecraft:pillager<minecraft:spawn_as_patrol_follower>` |
| `minecraft:disallow_spawns_in_bubble` | empty object | 1 | 1 | axolotl |
| `minecraft:delay_filter` | `min` 0, `max` 0, `identifier`, `spawn_chance` 100 | 1 | 3 | pillager_patrol: 600 to 660, chance 20, per difficulty identifier |
| `minecraft:player_in_village_filter` | `distance` (required), `village_border_tolerance` 10 | 1 | 3 | 48, 32 |
| `minecraft:world_age_filter` | `min` 0, `max` -1 | 1 | 3 | min 6000 |
| `minecraft:mob_event_filter` | `event` (`minecraft:pillager_patrols_event`, `minecraft:wandering_trader_event`, `minecraft:ender_dragon_event`) | 1 | 3 | pillager_patrol |
| `minecraft:spawn_event` | `event` | 1 | 2 | stray `change_to_skeleton` |
| `minecraft:spawns_lava` | empty object | 1 | 1 | strider |
| `minecraft:spawns_above_block_filter` | `blocks`, `distance` 1 | 0 | 0 | schema only; absent from the docs list |
| `minecraft:is_persistent` | empty object | 0 | 0 | schema only |
| `minecraft:is_experimental` | empty object | 0 | 0 | schema only |

There is no `is_baby` or `spawn_category` key in the spawn rule schema; baby spawns come from the entity's own spawn event, and `spawn_category` is an entity description field. `format_version` is `1.8.0` in 58 files, `1.11.0` and `1.17.0` once each. The identifier must match the entity (`DataDrivenSpawning.md`); `minecraft:pillager_patrol` is the one rule without an entity of that name, and 59 of the 129 entities have a rule. Files with 1 condition 30, 2 conditions 17, 3 conditions 4, 4 (drowned, enderman) 2, 5 (rabbit, tropicalfish) 2, 9 (wolf, one per coat biome) 1. Four files (blaze, cat, pillager, wither_skeleton) have a description and no `conditions`, which registers the pool and leaves placement to engine code (fortress spawns, village cats, patrols).

### Population pools and what the docs say about the algorithm

`population_control` values in vanilla: `animal` 27, `monster` 24, `water_animal` 5, `pillager` 2 (pillager, pillager_patrol), `cat` 1, `ambient` 1 (bat). `DataDrivenSpawning.md`: "There are four pools that entities can be assigned to (animal, water_animal, monster, and cat), and each has its own spawn limit. By assigning an entity to a pool, it will spawn as long as that pool hasn't reached the spawn limit." Then: "The 'cat' pool functions differently than the other 3 population pools. Cat spawn rules and limits are based upon the amount within a village." and "There are 2 more pools located within the game files, `Villager` and `Pillager`. However, these are not currently used by any entities." The generated `Entities.html` still says "There are 3 pools"; neither mentions `ambient`, which bat uses. `EntitySpawningDeepDive.md` gives "Typical Cap" values hedged with tildes: `animal` "~10 per player", `monster` "~70 in loaded chunks", `water_animal` "~5 per water body", `water_ambient` "~20 per water body", `ambient` "~15 in caves", `pillager` "Limited by patrols"; it lists `water_ambient` as a type although no vanilla rule uses it. The same page: "Higher weight = more common. Total weights in a biome determine relative spawn rates. A weight of 100 in a biome with total weight 1000 = 10% chance." `density_limit` "allows players to specify the amount of mobs to spawn in certain locations" with separate surface and underground caps; `spawns_on_surface` and `spawns_underground` select the pass; `brightness_filter` is "the light level range that causes the mob to spawn", with `adjust_for_weather` "Allowing hostile mobs to spawn during the day when it rains"; `distance_filter` defaults to 24 to 128 blocks from the player. The spawn cycle diagram names six steps: "check spawn conditions, find valid spawn locations, check population caps, evaluate spawn weight, spawn entity, and run spawn event".

Undocumented: the number of spawn attempts per chunk per tick, how a chunk or player is chosen, the actual cap numbers and whether they scale with players or loaded chunks, how "surface" versus "underground" is decided for a position, which light value (block, sky, or combined) `brightness_filter` compares, how `rarity` in `minecraft:weight` works, how herd members are placed around the first spawn, and the despawn policy beyond the `minecraft:despawn` component fields in section 1. Nothing in the docs or the samples states these.

## 5. Loot tables

### Grammar

No JSON schema for loot tables exists in bedrock-samples (`json_schemas/` has only `AppendLoot.json`, a worldgen processor). The grammar comes from `Reference/Content/LootTableReference/Examples/LootTableComponents/*.md` and `Documents/IntroductionToLootTables.md`, `LootAndTradeTableFunctions.md`, `LootTableConditions.md`:

- Table: `{ "pools": [...] }`. Six village chest tables also carry `"type": "minecraft:chest"`, which no docs page mentions.
- Pool: `rolls` (integer, default 1, or `{min, max}`), `bonus_rolls` ("Additional rolls added based on luck attribute. Can be fixed or range", default 0), `conditions[]`, `entries[]`, `tiers { initial_range, bonus_rolls, bonus_chance }` ("Tiered entry selection configuration"; the docs give no further semantics).
- Entry: `type` (`item`, `loot_table`, `empty`), `name` (item id or table path), `weight` (default 1), `quality`, `functions[]`, `conditions[]`, `pools[]` ("Nested pools for type 'loot_table'. Allows inline loot table definition"). `quality` is listed in vanilla but has no docs text at all.
- Condition: `{condition, ...}` with per-condition fields `chance`, `looting_multiplier`, `default_chance`/`peaceful`/`easy`/`normal`/`hard`, `max_chance`, `value`, `entity_type`, `entity` (`this`, `attacker`, `attacking_player`) plus `properties {on_fire, on_ground}`, `match_tool {item, count, durability, enchantments[] {enchantment, levels {range_min, range_max}}, minecraft:match_tool_filter_any|all|none}`, `tag` and `operator` (used by `biome_has_tag` in vanilla, undocumented). Conditions attach to pools, entries and functions; "each condition runs one at a time. If any one condition in the list fails, the remaining conditions in the list will be ignored" (`LootTableConditions.md`).
- Function: `{function, ...}`. Documented functions and their parameters (`LootAndTradeTableFunctions.md` and the `loot_function.md` table): `set_count {count}`, `set_damage {damage}` (fraction of durability remaining), `set_data {data}`, `set_data_from_color_index`, `set_actor_id {id}`, `set_banner_details {type, base_color, patterns[] {color, pattern}}`, `set_book_contents {author, title, pages}`, `set_lore {lore[]}`, `set_name {name}`, `set_potion {id}`, `set_stew_effect {effects[] {id}}`, `set_ominous_bottle_amplifier {amplifier}`, `set_armor_trim {material, pattern}`, `looting_enchant {count}` ("loot table only ... only works with loot tables that are called by the death of an entity"), `random_aux_value {values}`, `random_block_state`, `random_dye`, `enchant_randomly {treasure}`, `enchant_with_levels {levels, treasure}`, `enchant_random_gear {chance}`, `enchant_book_for_trading {base_cost, base_random_cost, per_level_random_cost, per_level_cost}` ("trade table only"), `specific_enchants {enchants[]}`, `explosion_decay` ("a flat chance (equal to 1/explosion radius) for each dropped item to be destroyed"), `exploration_map {destination}` (12 destinations listed), `fill_container {loot_table}`, `furnace_smelt` ("loot table only ... will not work in villager trades or with chests"), `trader_material_type`. The `loot_function.md` table also names `set_nbt`. "Max enchantment levels are hard-coded and can't be overwritten." "A loot table cannot refer to itself in any way. If a roll results in a recursive loot table, nothing will be returned" (`CreateLootTable.md`).

### Vanilla usage

309 tables: `entities` 122, `blocks` 99, `chests` 61, `gameplay` 9, `equipment` 7, `spawners` 5, `dispensers` 3, `barrels` 1, `pots` 1, `empty.json` 1. 299 have `pools`; 10 are `{}` or `{"pools": []}` (`empty.json`, `goat`, `ocelot`, `wolf`, `bat`, `giant`, `endermite`, `silverfish`, `clownfish`, `empty_brushable_block`). 468 pools and 1459 entries. `rolls` is an integer 390 times, a `{min, max}` range 71 times and absent 7 times; `bonus_rolls` appears on 11 pools, always `0`; `tiers` on 5 pools (`zombie_equipment`, `zombie_rider_equipment`, `skeleton_gear`, `piglin_gear_melee`, `piglin_gear_ranged`), with `initial_range` on all 5 and `bonus_rolls` and `bonus_chance` on 3. Entries: `item` 1379, `loot_table` 53, `empty` 27; `weight` on 1217, `functions` on 903, `quality` on 6 (the two fishing tables), `conditions` on 9 (two chest tables), inline `pools` on 6 (the `armor_set_*` tables), and a bare `count` key on 26 entries in 4 tables (`abandoned_camp_barrel`, two abandoned camp chests, `snow_golem_shear`), which no docs page defines. Conditions: 100 on pools, 9 on entries, 15 on functions. All 1140 function instances are on entries. Twenty-six distinct nested table names; one, `loot_tables/gameplay/fishing/fish` (no `.json`) in a fishing table, does not resolve.

| Function | Instances | Tables | Parameters vanilla sets |
|---|---|---|---|
| `set_count` | 590 | 154 | `count` range 468, integer 122 (`1`, `2`, `1.0`); `add: false` 56 (undocumented) |
| `looting_enchant` | 104 | 67 | `count` range 104; `limit` 3 (undocumented) |
| `explosion_decay` | 96 | 96 | none |
| `minecraft:set_count` | 66 | 11 | `count` range 65, `10.0` once |
| `enchant_randomly` | 43 | 16 | `treasure: true` once |
| `set_potion` | 35 | 11 | `id` (`poison`, `swiftness`, `slowness`, `regeneration`, ...) |
| `enchant_with_levels` | 35 | 10 | `levels` range 27 or `30`; `treasure: true` 35 |
| `enchant_random_gear` | 29 | 18 | `chance` 0.25 x15, 0.5 x8, 0.1 x6 |
| `set_data` | 27 | 14 | `data` integer |
| `set_damage` | 27 | 10 | `damage` range; `add: false` once |
| `exploration_map` | 18 | 5 | `destination` `buriedtreasure` 3 and 15 `abandoned_camp_*` biome variants not in the documented list |
| `specific_enchants` | 15 | 8 | `enchants` list of 1 or 3 |
| `furnace_smelt` | 15 | 14 | `conditions: [entity_properties this on_fire]` on every instance |
| `minecraft:set_damage` | 11 | 4 | `damage` range |
| `minecraft:set_data_from_color_index` | 6 | 5 | none |
| `set_armor_trim` | 6 | 3 | `material: copper`, `pattern` `flow` or `bolt` |
| `enchant_book_for_trading` | 5 | 2 | `enchantments` list (undocumented parameter; the documented four cost fields appear only in trade tables) |
| `set_ominous_bottle_amplifier` | 3 | 3 | `amplifier` range |
| `minecraft:set_potion` | 3 | 3 | `id` |
| `random_aux_value` | 2 | 2 | `values` range |
| `set_banner_details` | 2 | 2 | `type: 1` |
| `minecraft:set_stew_effect` | 1 | 1 | `effects` list of 2 |
| `minecraft:enchant_randomly` | 1 | 1 | none |

Documented functions with no vanilla loot use: `set_actor_id`, `set_book_contents`, `set_lore`, `set_name`, `set_nbt`, `random_block_state`, `random_dye` (trade only), `fill_container`, `trader_material_type` (no file at all). Five functions appear both bare and with the `minecraft:` prefix, so the reader must strip the namespace.

| Condition | Instances | Tables | Parameters vanilla sets |
|---|---|---|---|
| `random_chance` | 16 | 12 | `chance` 0.5, 0.2, 0.08, 0.25 |
| `killed_by_player` | 15 | 13 | none |
| `random_chance_with_looting` | 15 | 15 | `chance` 0.025 x7, 0.25 x5; `looting_multiplier` 0.01 x12 |
| `has_mark_variant` | 14 | 1 | `value` -1 to 12 (mooshroom stew) |
| `killed_by_player_or_pets` | 10 | 8 | none |
| `biome_has_tag` | 9 | 2 | `tag`, `operator: "!="` 8 (undocumented condition) |
| `random_difficulty_chance` | 6 | 6 | `default_chance`, `peaceful: 0`, `easy: 0`, `hard` |
| `random_regional_difficulty_chance` | 6 | 5 | `max_chance` 0.15 x5, 0.05 |
| `killed_by_entity` | 5 | 2 | `entity_type` skeleton, stray, bogged, parched |
| `entity_killed` | 4 | 1 | `entity_type` magma_cube, slime (frog table) |
| `has_variant` | 3 | 1 | `value` 0, 1, 2 |
| `passenger_of_entity` | 2 | 2 | `entity_type: minecraft:chicken` (undocumented) |
| `is_baby` | 2 | 2 | none (undocumented) |
| `bool_property` | 1 | 1 | `domain: minecraft:has_flower`, `value: true` (undocumented as a loot condition) |
| `damaged_by_entity` | 1 | 1 | `entity_type: minecraft:fireball` (undocumented) |
| `entity_properties` | 15 | 14 | only as a function condition on `furnace_smelt` |

`match_tool` is documented and unused in vanilla.

### Contexts and references

- Entity death: `minecraft:loot {table}` (78 entities, 94 instances because groups swap tables; the zombie's `zombie_default`, `zombie_jockey` and `zombie_rider` groups each set one). Two referenced tables do not exist in the pack: `loot_tables/entities/fox.json` and `loot_tables/entities/piglin.json`.
- Equipment at spawn: `minecraft:equipment {table, slot_drop_chance[] {slot, drop_chance}}` (18 entities, 25 instances) points at `loot_tables/entities/*_equipment.json`, `*_gear.json` and `armor_set_*.json`; the four tiered tables are equipment tables. The `equipment/` folder's `trial_chamber*.json` tables are referenced by the trial spawner data, not by entities, and `low_tier_items.json` by nothing in the pack.
- Interaction: `minecraft:interact.interactions[].add_items {table}` and `spawn_items {table}` (9 entities, 10 instances; sheep shearing, mooshroom milking `gameplay/entities/mooshroom_milking.json`, sniffer `gameplay/entities/sniffer_seeds.json`).
- Goals: `behavior.sneeze.loot_table` (panda, 2), `behavior.random_search_and_dig.item_table` (sniffer), `behavior.drop_item_for` (cat gifts), `behavior.eat_mob.loot_table` (frog), and `minecraft:barter.barter_table` (piglin).
- Blocks: 98 of the 99 `blocks/` tables are the `minecraft:loot` of a data-driven block file; `shelf_mushroom_growth_1.json` is referenced by no block.
- Fishing: `gameplay/fishing.json` and `gameplay/jungle_fishing.json` are referenced by `minecraft:fishing_hook`'s components in the composed entity file (the only `gameplay/` tables an entity names), and they nest `gameplay/fishing/{fish,junk,treasure}.json` with `quality`. No goal handles fishing; the hook entity and the rod item are engine code.
- Engine-only: the 54 unreferenced `chests/` tables (structure chests), 5 `spawners/` (trial spawners), 3 `dispensers/`, `barrels/abandoned_camp_barrel.json`, `pots/decorated_pot.json`, and the 7 `entities/*_brushable_block*.json` tables for archaeology are named only in structure NBT, worldgen JSON or the binary. Docs: "Loot tables for chests are generated at the time of opening or breaking" (`LootAndTradeTableFunctions.md`, under `fill_container`).
- Commands: `/loot spawn|replace block|replace entity`, `/kill` and `/mine` evaluate tables with a tool context (`Documents/LootOverloads.md`).

## 6. Trade tables

### Grammar

Schemas in `client_server/entity/1.21.30/`: `Trade Table.json` is an array of `TradeTier`; `TradeTier { groups[] (required), total_exp_required (required, uint32), trades[] }` (the docs add `trades` directly under a tier, which the 13 legacy vanilla tables use; the schema requires `groups`); `TradeGroup { num_to_select (int, default 0), trades[] (required) }`; `Trade { wants[] (required), gives[] (required), trader_exp (uint32, default 1), max_uses (int, default 7), reward_exp (bool, default true), weight (int, default 1) }`; `TradeItemList` is a `TradeItem` or `{ choice: [TradeItem] }`; `TradeItem { item (required), quantity (int >= 1 or {min, max}, default 1), functions[], filters (filter group), price_multiplier (float, default 0) }`. The docs pages (`TradeTableComponents/*.md`) give different defaults: `max_uses` 12, `price_multiplier` 0.05, `num_to_select` 1, and describe `total_exp_required` as "typically 0 ... Higher tiers require more XP (e.g., 10, 70, 150, 250)". `Documents/CreateTradeTable.md`: "Tiers are unlocked by the trading experience of the villager, not the player. The first tier in a list of trade tiers is always available"; "`num_to_select` ... the number of trades from the `trades` array to make available when you trade with a given villager"; "once the trading system hits a tier that requires more experience points than the trader has, subsequent tiers won't be checked"; `reward_exp` decides "whether the player gets experience"; `price_multiplier` "sets how much the item's price can increase due to supply and demand changes"; `max_uses` is "how many times the trade can be made before the trader needs to restock". The vanilla file layout has no `format_version` in 17 of 27 files; 10 carry one (`1.18.10` fisherman, `1.26.10` butcher, cleric, stone_mason economy tables, and six legacy).

### The 27 vanilla files

BDS 1.26.51.1 ships them only in the base `vanilla` layer, 13 in `__brarchive/trading.brarchive` and 14 in `__brarchive/trading/economy_trades.brarchive`; the later layers' `trading/` folders are empty directories. Nine are `\x7fMCB`: `trading/{butcher,cleric,farmer,fletcher,shepherd,stone_mason}_trades.json` and `trading/economy_trades/{butcher,cleric,stone_mason}_trades.json`. The 18 text files parse to JSON equal to the bedrock-samples files (the two librarian tables contain `//` comments and trailing commas, so the reader has to be lenient), so the samples stand in for the binary ones. Docs: "the tables in the parent `trading/` folder aren't used" (`CreateTradeTable.md`); vanilla agrees, since only the legacy `minecraft:villager` references them.

Economy tables (14): every profession table has 5 tiers at `total_exp_required` 0, 10, 70, 150, 250 with 1 to 3 groups per tier; `wandering_trader_trades.json` has one tier of 3 groups selecting 2 of 6, 2 of 16 and 5 of 78 trades. Across the 14 files: 282 trades, 130 groups; `num_to_select` 1 x97, 2 x7, -1 x5 (all of the group), 5 x1, absent 1; `max_uses` 12 x159, 16 x42, 8 x20, 3 x17, 4 x17, 5 x11, 2 x8, 6 x4, 7 x2, 1 x2; `trader_exp` absent 102, 30 x34, 15 x32, 10 x31, 5 x28, 1 x21, 2 x19, 20 x15; `reward_exp` true 152, absent 130; `price_multiplier` absent 472, 0.05 x163, 0.2 x49; `wants` has one item 358 times and two 26 times, `gives` always one; `choice` lists 206 items (dyes, wools, fish, flowers); `quantity` integer 509, range 44, absent 241. Legacy tables (13): 46 trades, 25 tiers with `trades` directly under the tier, and `groups` in 6 files.

Functions in trade tables (samples, all 27 files): `enchant_with_levels` 26 instances in 11 files (always `treasure: false`, `levels {min 5, max 19}`), `random_dye` 7 (leather worker), `enchant_book_for_trading` 7 in 2 files (`base_cost 2, base_random_cost 5, per_level_random_cost 10, per_level_cost 3`), `exploration_map` 5 in 2 files (`monument`, `mansion`, `trial_chambers`), `random_aux_value` 2. `trader_material_type`, `set_banner_details` and `set_count` do not appear in any trade table. `filters` on items appear 31 times in the cartographer and fisherman economy tables (`in_overworld` and `is_mark_variant` on `self`, selecting biome-specific maps and fish).

### How entities reference them and what the engine does

`minecraft:economy_trade_table {table, display_name, new_screen, persist_trades, convert_trades_economy, show_trade_screen, cured_discount {min, max} (default -25 to -20), max_cured_discount, nearby_cured_discount (-20), max_nearby_cured_discount (-200), hero_demand_discount (-4), use_legacy_price_formula}` (`minecraftComponent_economy_trade_table.md`). Vanilla `villager_v2` sets it in 13 profession groups as `{table, display_name, new_screen: true, persist_trades: true, cured_discount: [-25, -20], max_cured_discount: [-25, -20]}` (ranges written as two-element arrays, not `{min, max}`), plus an empty `{}` in the `trade_components` group, and `minecraft:trade_resupply {}` in `trade_resupply_component_group`, added by the `minecraft:resupply_trades` event that the villager's `minecraft:scheduler` fires. `wandering_trader` sets `{table, display_name, new_screen: true}`. The legacy `minecraft:villager` uses `minecraft:trade_table {table, display_name, convert_trades_economy: true}`, and the docs explain the conversion: "When the trades are converted, the mob will generate a new trade list with their new trade table, but then it will t[ry to keep the same trades]" (`minecraftComponent_trade_table.md`). The goals around trading are `behavior.trade_with_player` (3 entities), `behavior.trade_interest` (2), `behavior.look_at_trading_player` (3). The docs state the engine effects only as these field names: demand raises prices by `price_multiplier` per use, `max_uses` locks a trade until restock, curing applies `cured_discount` and `nearby_cured_discount`, Hero of the Village applies `hero_demand_discount`, `trade_resupply` "Resupplies an entity's trade", and `use_legacy_price_formula` switches to "legacy price calculations". The formulas, the restock schedule, the gossip system and how `trader_exp` maps to villager levels are not written down anywhere public.

## 7. What this implies for a component runtime

### The seven target entities

Union over zombie, villager_v2, creeper, enderman, iron_golem, wolf and cow: 55 goals and 76 non-goal keys (74 components plus `on_target_acquired` and `on_target_escape`). Per entity: zombie 12 goals, 35 others, 13 groups, 11 events; villager_v2 27 goals, 38 others, 54 groups, 38 events; creeper 9, 24, 5, 4; enderman 9, 27, 4, 5; iron_golem 12, 28, 2, 2; wolf 17, 42, 18, 25; cow 9, 30, 2, 6. Implementing exactly this union also fully covers husk and mooshroom and 9 non-mob entities (area_effect_cloud, armor_stand, cushion, eye_of_ender_signal, fireworks_rocket, lightning_bolt, ominous_item_spawner, tnt, tripod_camera), 18 entities in all.

Goals in the union: avoid_mob_type, beg, breed, celebrate_survive, defend_village_target, equip_item, explore_outskirts, fertilize_farm_block, find_mount, float, follow_owner, follow_parent, harvest_farm_block, hide, hurt_by_target, inspect_bookshelf, leap_at_target, look_at_player, look_at_trading_player, make_love, melee_attack, melee_box_attack, mingle, mount_pathing, move_indoors, move_outdoors, move_through_village, move_towards_dwelling_restriction, move_towards_target, nearest_attackable_target, offer_flower, owner_hurt_by_target, owner_hurt_target, panic, pickup_items, place_block, play, random_look_around, random_stroll, receive_love, share_items, sleep, stay_while_sitting, stomp_turtle_egg, swell, take_block, take_flower, target_when_pushed, teleport_to_owner, tempt, trade_interest, trade_with_player, use_kinetic_weapon, work, work_composter. Twenty-one of these are villager-only in the union (village, schedule, work and trade goals), so the zombie, creeper, enderman, iron golem, wolf and cow together need 34.

Non-goal keys in the union: ageable, ambient_sound_interval, angry, annotation.break_door, annotation.open_door, apply_knockback_rules, attack, balloonable, breathable, breedable, burns_in_daylight, can_climb, collision_box, color, conditional_bandwidth_optimization, damage_sensor, despawn, dweller, economy_trade_table, environment_sensor, equip_item, equipment, experience_reward, explode, follow_range, healable, health, hide, hurt_on_condition, interact, inventory, is_baby, is_charged, is_dyeable, is_hidden_when_invisible, is_shaking, is_tamed, jump.static, knockback_resistance, leashable, leashable_to, looked_at, loot, mark_variant, movement, movement.basic, nameable, navigation.walk, offspring, on_target_acquired, on_target_escape, persistent, physics, preferred_path, pushable, pushable_by_block, pushable_by_entity, renders_when_invisible, rideable, rotation_locked_to_vehicle, scale, scheduler, shareables, sittable, skin_id, spawn_egg_interaction, tameable, target_nearby_sensor, teleport, timer, trade_resupply, transformation, type_family, uses_legacy_friction, variable_max_auto_step, variant.

### Coverage by implementation count

"Covered" means every goal (or every non-goal component and trigger) the entity's base components and all its groups reference is implemented, taking keys in descending order of how many entity files use them (ties by name). 37 of the 129 entities have no goals (projectiles, minecarts, boats, player, tnt, xp_orb and so on), so they count as goal-covered from N = 0.

| Goals implemented (top N by use) | Entities with all goals covered (of 129) | Of the 92 entities that have goals |
|---|---|---|
| 20 | 52 | 15 |
| 40 | 74 | 37 |
| 60 | 86 | 49 |
| 80 | 94 | 57 |
| 100 | 99 | 62 |
| 120 | 103 | 66 |
| 140 | 112 | 75 |
| 160 | 122 | 85 |
| 170 (all) | 129 | 92 |

| Non-goal keys implemented (top N of 202, triggers included) | Entities with all non-goal keys covered |
|---|---|
| 20 | 5 |
| 40 | 10 |
| 60 | 30 |
| 80 | 38 |
| 100 | 59 |
| 120 | 74 |
| 140 | 88 |
| 160 | 101 |
| 180 | 112 |
| 202 (all) | 129 |

Joint coverage (both lists): 20 goals and 60 components cover 27 entities; 40 and 100 cover 50; 60 and 120 cover 60; 80 and 140 cover 75; 100 and 160 cover 85.

The order to implement, by entities unlocked: goals `look_at_player` 69, `random_stroll` 64, `random_look_around` 55, `float` 49, `nearest_attackable_target` 49, `hurt_by_target` 42, `panic` 37, `melee_box_attack` 32, `tempt` 31, `avoid_mob_type` 28, `breed` 26, `mount_pathing` 26, `follow_parent` 24, `pickup_items` 20, `equip_item` 17, `ranged_attack` 14, `random_swim` 12, `player_ride_tamed` 10, `find_mount` 8, `flee_sun` 7, then a tail where 91 goals belong to one entity each and 123 to at most two. Components: `physics` 126, `collision_box` 125, `type_family` 124, `conditional_bandwidth_optimization` 117, `health` 94, `nameable` 94, `movement` 93, `is_hidden_when_invisible` 92, `pushable_by_block` 91, `hurt_on_condition` 87, `pushable_by_entity` 85, `breathable` 84, `experience_reward` 80, `jump.static` 79, `loot` 78, `despawn` 76, `navigation.walk` 66, `movement.basic` 65, `can_climb` 57, `attack` 48, `scale` 48, `is_baby` 44, `leashable` 43, `offspring` 43, `spawn_egg_interaction` 43, `leashable_to` 42, `damage_sensor` 40, `balloonable` 39, `rideable` 36, `ageable` 35, `ambient_sound_interval` 32, `interact` 32, `environment_sensor` 29, `variant` 29, `follow_range` 27, `pushable` 27, `breedable` 26, `on_target_acquired` 22, `angry` 20, `inventory` 20, `shareables` 19, `timer` 19, `equipment` 18, `persistent` 18, `projectile` 18, `equip_item` 17, then 58 single-entity components. The non-goal curve is flatter than the goal curve because most entities carry 25 to 40 distinct components, so a mob is not runnable until about 100 components exist; the goal curve is steep because the top 20 goals are the whole AI of the farm animals and the plain hostiles.

### Minimal engine, in order

1. Loader: layer composition, `format_version` dispatch, the five top-level keys, `description` fields, properties with types, ranges, clamping and `client_sync`, lenient JSON (comments and trailing commas appear in trade tables), namespace stripping for loot functions, and the integer `subject`/`operator` encoding plus `AND`/`OR` aliases in filters.
2. Event engine: `add`, `remove`, `sequence`, `randomize` with `weight`, `trigger` (string and object, six targets), `filters`, `set_property` (literal and Molang with `query.property`), `first_valid`, `play_sound`, `emit_vibration`, `emit_particle`, `set_home_position`, `reset_target`, `drop_item`, `stop_movement`, `execute_event_on_home_block`, `queue_command`; deferred application until the entity's next tick; built-in spawn events and `/summon` spawn event names in `type<event>` form.
3. Filters: the 87 tests in section 3 with `subject` resolution for `self`, `other`, `target`, `player`, `block`, `damager`, `parent`, `baby`, and the 10 operators.
4. Components in use order from the table above, with `environment_sensor`, `damage_sensor`, `timer`, `interact`, `transformation`, `despawn`, `loot`, `equipment` as the ones that drive events and tables.
5. Goals in use order; a goal scheduler with `priority` and `control_flags`; the `entity_types` matcher shared by the targeting goals.
6. A Molang subset for `experience_reward`, `ambient_sound_interval.condition`, property defaults and `set_property`.
7. Loot evaluator: pools, integer and range rolls, `bonus_rolls`, `tiers`, weights, `quality`, nested and inline tables, the 18 functions and 16 conditions in section 5 with the kill context (killer, looting level, on fire, difficulty, regional difficulty, biome tag, variant).
8. Spawn rules: the 21 components in section 4, the six pools with caps this project chooses, surface and underground passes, herd placement with `event`, `initial_event` and `event_skip_count`, `permute_type`, `spawn_event`, and the `pillager_patrol` pseudo-entity.
9. Trading: the schema in section 6 over the 14 economy tables, `num_to_select`, tier unlock by `trader_exp` against `total_exp_required`, `max_uses` plus `trade_resupply`, `price_multiplier` demand, cured and hero discounts, item `filters`, and the five trade functions.

## Open questions

- Spawn attempt rates, pool cap values, the surface versus underground classification and the light value used by `brightness_filter` are not documented; they have to be measured against a running BDS or taken from community wikis, which are not primary sources.
- Trade price, demand and restock formulas, the mapping from `trader_exp` to villager level, and the `rarity` field of `minecraft:weight` have no public specification.
- `first_valid`, `set_home_position`, `drop_item`, `stop_movement` and `execute_event_on_home_block` event actions; the `count` entry key, `add` and `limit` function parameters, `type: "minecraft:chest"`, `quality` and `tiers` semantics in loot tables; and the loot conditions `biome_has_tag`, `passenger_of_entity`, `is_baby`, `bool_property`, `damaged_by_entity` are used by vanilla and documented nowhere.
- The 1.26 serializer's integer `subject` and `operator` values are inferred from one comparison each (`1` is `other`, `0` is `==`, `1` is `!=`); the full operator numbering beyond 0 and 1 is unknown.
- Two `minecraft:loot` targets (`entities/fox.json`, `entities/piglin.json`) and one nested name (`gameplay/fishing/fish`) do not exist in the pack; whether the engine treats a missing table as empty or falls back is not documented.
- `minecraft:spawns_above_block_filter`, `minecraft:is_persistent` and `minecraft:is_experimental` exist in the spawn schema with empty or minimal bodies and no vanilla use; their semantics are unknown.
- The schema's `Trade` defaults (`max_uses` 7, `price_multiplier` 0) and the docs' (`12`, `0.05`) disagree; vanilla sets `max_uses` explicitly on every economy trade, so the discrepancy only matters for custom packs.
- bedrock-samples ships 128 entity files; BDS composes 129 (`agent.json`, format 1.21.90, `is_experimental: true`). The previous note's count of 130 identifiers was taken across all layers before composition.

## Reproduction

All scripts live in `/tmp/bds-research-entities/tools/` and take paths as arguments; downloads sit in their own directories under `/tmp/bds-research-entities/`.

```
# Compose the vanilla layers (base `vanilla`, then vanilla_<version> ascending; later file names win;
# reads __brarchive/<folder>.brarchive and __brarchive/<folder>/<sub>.brarchive and loose folders)
node /tmp/bds-research-entities/tools/compose.mjs /tmp/bds-research/bds/extracted/behavior_packs \
  /tmp/bds-research-entities/composed entities spawn_rules loot_tables trading
# -> entities: 129 files, spawn_rules: 60, loot_tables: 309, trading: 27; provenance.json lists the layer per file

# bedrock-samples v1.26.50.4 "min" asset (text only) and the docs source at a pinned commit
cd /tmp/bds-research-entities/samples && curl -sS -L -o min.zip \
  https://github.com/Mojang/bedrock-samples/releases/download/v1.26.50.4/bedrock-samples-v1.26.50.4-min.zip
shasum -a 256 min.zip   # 2bb667786f4d5bedf97a61cec4ce9613c1e2986224c9deda5fbb108c2d96b07c
unzip -q -o min.zip -d unpacked
cd /tmp/bds-research-entities/docs && git clone -q --depth 1 --filter=blob:none --sparse \
  https://github.com/MicrosoftDocs/minecraft-creator.git repo && cd repo && git sparse-checkout set \
  creator/Reference/Content/EntityReference creator/Reference/Content/LootTableReference \
  creator/Reference/Content/TradeTableReference creator/Documents && git rev-parse HEAD
# -> 4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8

# Tallies (python3 -I; the composed tree and the samples are untrusted input)
python3 -I /tmp/bds-research-entities/tools/entities.py   /tmp/bds-research-entities/composed /tmp/bds-research-entities/out/entities.json
python3 -I /tmp/bds-research-entities/tools/spawn_loot.py /tmp/bds-research-entities/composed /tmp/bds-research-entities/out/spawn_loot.json
python3 -I /tmp/bds-research-entities/tools/trades.py     /tmp/bds-research-entities/samples/unpacked/behavior_pack
# entities.json holds components (entities, instances, base, group), params, filters, event keys,
# goal_order/other_order and the coverage dictionaries quoted in section 7.

# Docs lists for the cross-check
grep -oE '^\| \[[^]]+\]' creator/Reference/Content/EntityReference/Examples/ComponentList.md | wc -l   # 205 rows
grep -oE '^\| \[[^]]+\]' creator/Reference/Content/EntityReference/Examples/AIGoalList.md    | wc -l   # 182 rows
grep -oE '^\| \[[^]]+\]' creator/Reference/Content/EntityReference/Examples/FilterList.md    | wc -l   # 108 rows

# Which BDS trade files are binary
for f in /tmp/bds-research-entities/composed/trading/*.json /tmp/bds-research-entities/composed/trading/economy_trades/*.json; do
  printf '%s ' "$f"; head -c 4 "$f" | xxd -p; done   # 7f4d4342 is \x7fMCB
```
