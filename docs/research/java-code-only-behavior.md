# What part of Java Edition is code rather than data, and does Bedrock publish a data equivalent?

Researched 2026-10-24. The primary source is Mojang's own Java Edition 26.3 server jar, which since release 26.1 ships with original class, field and method names and no obfuscation map. Every count below comes from that jar: the registry reports its data generator writes, the class files, the `LineNumberTable` attributes that give source file lengths, and two short Java programs run against the jar that dump block properties and entity attributes. Other measurements come from shallow clones of seven reimplementations. The Bedrock column cross-references [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) and [bedrock-entities-spawning-loot-trading.md](bedrock-entities-spawning-loot-trading.md); the behavior list a Bedrock server must cover is in [engine-behavior-inventory.md](engine-behavior-inventory.md) and the Java datapack format is in [java-datapacks.md](java-datapacks.md). None of those is repeated here. Claims taken from minecraft.wiki are marked "(wiki)" and are secondary. Commands are in "Reproduction".

## Summary

1. Mojang removed obfuscation from Java Edition in 26.1. The article "Removing obfuscation in Java Edition" says "Starting with the first snapshot following the complete Mounts of Mayhem launch, we will no longer obfuscate Minecraft: Java Edition" and "No more obfuscation maps in version .jsons". The 26.3 version manifest entry carries only `client` and `server`; 1.21.11 and every earlier version also carry `client_mappings` and `server_mappings`. Reading Java's code-only behavior no longer needs a community mapping.
2. Mojang's 26.3 server is 5027 source files and at least 520352 source lines, measured from the line tables in the jar. The block package is 474 files and 54426 lines, the entity package 727 files and 109836 lines, worldgen 458 files and 45295 lines.
3. No Mojang report lists a block's hardness, blast resistance, friction, speed factor, jump factor, bounce, light emission, light dampening, map color, sound type, push reaction, instrument or flammability. A 93-line Java program compiled against the unobfuscated jar dumps all of them for all 1286 blocks. Totals: 35723 states, 131 `SoundType` constants, 27 note block instruments, 62 map colors, 4 push reactions, 470 blocks requiring the correct tool, 110 randomly ticking blocks, 56 light emitters, 254 blocks with fire ignite or burn odds, and only 24 blocks that deviate from the default friction, speed, jump or bounce.
4. Tool, tier and harvest requirement are the exception: Java expresses them as data. Block tags (`mineable/axe`, `mineable/hoe`, `mineable/pickaxe`, `mineable/shovel`, three `needs_*_tool`, seven `incorrect_for_*_tool`) plus each tool item's `minecraft:tool` default component carry the whole rule set.
5. Java once named its block behavior classes in data and stopped. 26.1's `reports/registries.json` has a `minecraft:block_type` registry with 263 entries for 1168 blocks, and `reports/blocks.json` tags every block with one; 26.3 removed the registry and the field. The jar itself has 330 classes in the block package, 305 of them named `*Block`.
6. Java has 49 block entity types and 86 source files for them, 11036 lines in the package root. Bedrock expresses the whole category with one component, `minecraft:block_entity`, whose only parameters are `container.slot_count` and `dynamic_properties`.
7. Java runs two unrelated mob AI systems. The goal system is 68 classes and 5520 lines; the brain system is 116 classes and 8905 lines plus 24 sensors, 115 memory modules and 26 activities. 55 classes reference `registerGoals`; 20 mob classes build a brain (allay, armadillo, axolotl, breeze, camel, copper golem, creaking, frog, goat, happy ghast, hoglin, nautilus, piglin, piglin brute, sniffer, tadpole, villager, warden, zoglin, zombie nautilus). Camel and happy ghast use both.
8. Bedrock's 170 data-driven goals are the same vocabulary. 30 of the 67 concrete Java goal class names match a Bedrock `minecraft:behavior.*` name exactly after converting to snake case, including `melee_attack`, `nearest_attackable_target`, `hurt_by_target`, `panic`, `tempt`, `breed`, `follow_parent`, `swell` and `trade_with_player`. The brain mobs are where the two editions diverge, because Bedrock expresses piglin bartering, villager work schedules and warden anger as goals and components rather than as memories and activities.
9. Entity stats are code with no report. The 40-entry `minecraft:attribute` registry is `elements: false`, 93 of the 161 entity types have a default attribute supplier, and those suppliers hold 2619 attribute values. The same short program dumps all of them with dimensions, category and tracking range.
10. The engine systems are small in line count and large in behavior. Redstone is 10 classes and 908 lines, fluids 12 classes and 1475 lines, lighting 15 classes and 2398 lines, the explosion 402 lines, fire spread 511 lines, natural spawning 726 lines. The two largest files in the whole server are `Entity.java` (4601 lines) and `LivingEntity.java` (4318 lines), which hold movement, collision, damage and knockback.
11. Java ships two of its own behavior variants as feature flags with no data. `data/minecraft/datapacks/redstone_experiments` and `minecart_improvements` each contain exactly one file, `pack.mcmeta`, and the alternative algorithms are Java classes (`ExperimentalRedstoneWireEvaluator`, 233 lines). A datapack can switch them on and cannot describe them.
12. Reimplementation cost, measured by cloning: Pumpkin needs 33425 lines for 217 block behavior files, 14129 for block entities, 22513 for AI, 8131 for redstone, 62799 for worldgen. Cuberite needs 12489 lines of block handlers and 2813 for its redstone simulator. Minestom implements no vanilla block behavior at all in 3521 lines of block code. Paper carries 946 per-file patches against 26.3 plus 150147 lines of its own Java.
13. The fill-in table in section 9 rates 34 pieces. Bedrock data covers the block property set, the piston reaction, the instrument, flammability values, block drops, mob stats, mob AI, spawn conditions, loot and trade offers. Bedrock data partly covers block interaction (15 script hooks), block entities, crafting and villager economy. Redstone, fluid flow, explosions, fire spread, light, the spawning algorithm, random ticking, movement, combat, raids, gossip, advancement triggers and the tick loop have no data form in either edition and must be written as code.

## 1. Where Java keeps block properties, and who republishes them

### Mojang stopped obfuscating in 26.1

The 26.1 changelog on minecraft.net lists under Technical Changes: "Game executables are no longer obfuscated - see this Minecraft.net article for more details" (https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1). The linked article (https://www.minecraft.net/en-us/article/removing-obfuscation-in-java-edition) says "Minecraft: Java Edition has been obfuscated since its release", "we're removing obfuscation altogether", "this build (and all future builds) will have all of our original names* - now with variable names and other names - included by default", and lists the consequences as "No more obfuscation maps in version .jsons - as they're no longer needed", "The client and server .jar files won't be obfuscated" and "Each .jar now includes a new LICENSE file". It adds "these changes don't affect our Minecraft End User License Agreement and Minecraft Usage Guidelines".

Checked against the version manifest (`https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`, 920 versions, latest release 26.3 from 2026-09-15, latest snapshot 26.4-snapshot-5 from 2026-10-20): the `downloads` object of 26.1, 26.2, 26.3 and 26.4-snapshot-5 has exactly `client` and `server`; 1.21.11, 1.21.9, 1.21.4, 1.20.5 and 1.14.4 each also have `client_mappings` and `server_mappings`. The `META-INF/LICENSE` file inside the 26.3 server jar reads, verbatim and in full:

```
Use of the contents of this archive is subject to the Minecraft End-User License Agreement (EULA) and the Microsoft Services Agreement.

Minecraft EULA: https://aka.ms/MinecraftEULA
Microsoft Services Agreement: https://www.microsoft.com/msa
```

The 26.3 server jar (sha1 `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`, 62294556 bytes) is a bundler holding `META-INF/versions/26.3/server-26.3.jar` (26652008 bytes, 7762 class files) and 39 library jars. Class names read as `net/minecraft/world/level/block/FireBlock.class`, and `javap` prints `Compiled from "FireBlock.java"` with every field name intact, down to `protected final float jumpFactor` and `private final NoteBlockInstrument instrument`.

### What the reports do and do not carry

`reports/blocks.json` in 26.3 gives each block two keys, `properties` (the state property domains) and `states` (each state with its numeric id and the default flag), 1286 blocks and 35723 states. There is no third key. The property values themselves are not reported in any file; `java-datapacks.md` section 3 establishes that no Mojang report has ever carried them.

Tool and tier are the one exception, and they are fully data. The block side is tags: `data/minecraft/tags/block/` has 300 files, including `mineable/axe`, `mineable/hoe`, `mineable/pickaxe`, `mineable/shovel`, `needs_stone_tool`, `needs_iron_tool`, `needs_diamond_tool`, seven `incorrect_for_*_tool` files, `sword_efficient` and `sword_instantly_mines`. The item side is the `minecraft:tool` default component; `reports/minecraft/components/item/diamond_pickaxe.json` carries, verbatim:

```json
"minecraft:tool": {"rules": [
  {"blocks": "#minecraft:incorrect_for_diamond_tool", "correct_for_drops": false},
  {"blocks": "#minecraft:mineable/pickaxe", "correct_for_drops": true, "speed": 8.0}]}
```

### Reading the properties straight out of the jar

Because the jar is unobfuscated, a consumer can put it on the classpath, call `Bootstrap.bootStrap()` and read the fields. `/tmp/jcob/tools/javasrc/Extract.java` (93 lines) does this and writes one row per block. Results over 1286 blocks:

| Property | Where it lives in 26.3 | Measured |
|---|---|---|
| hardness | `BlockBehaviour$BlockStateBase.destroySpeed`, per state | stone 1.5, 736 blocks constant across their states |
| blast resistance | `BlockBehaviour.explosionResistance`, per block | stone 6.0 |
| friction | `BlockBehaviour.friction` | 0.6 for 1281 blocks; ice, packed ice and frosted ice 0.98; blue ice 0.989; slime block 0.8 |
| speed factor | `BlockBehaviour.speedFactor` | 1.0 except soul sand and honey block at 0.4 |
| jump factor | `BlockBehaviour.jumpFactor` | 1.0 except honey block at 0.5 |
| bounce and fall reduction | `bounceRestitution`, `fallDistanceReduction` (26.x) | 18 blocks: slime block 1.0/0.0, the 16 beds and shelf mushroom 0.75/0.5 |
| light emission | `BlockStateBase.lightEmission`, per state | 56 blocks emit light; 38 vary the value across their states |
| light filter | `BlockStateBase.lightDampening`, per state | 461 blocks vary it across their states, the single biggest per-state variation |
| map color | `BlockStateBase.mapColor`, per state | 62 distinct colors; 28 blocks vary it per state |
| sound type | `BlockBehaviour.soundType` | 131 `SoundType` constants exist, 128 are used |
| push reaction | `BlockStateBase.pushReaction` | `PUSH_PULL` 886, `POPPED` 367, `IMMOVEABLE` 17, `PUSH` 16 |
| instrument | `BlockStateBase.instrument` | 27 values; `HARP` 490, `BASEDRUM` 354, `BASS` 277, `GUITAR` 48, `HAT` 38 |
| harvest requirement | `BlockStateBase.requiresCorrectToolForDrops` | 470 blocks |
| flammability | `FireBlock.igniteOdds` and `burnOdds`, populated in `FireBlock.bootStrap()` | 254 blocks |
| random ticking | `BlockStateBase.isRandomlyTicking` | 110 blocks |

### The community dumps

| Dump | What it is | License as published | Java coverage on 2026-10-24 | Block fields |
|---|---|---|---|---|
| PrismarineJS/minecraft-data | committed JSON per version | README says "MIT", no `LICENSE` file at master (`java-datapacks.md` section 5) | 72 `pc` versions, newest with game data is 26.1; no 26.2 or 26.3 | 1168 blocks, exactly the 26.1 registry, with `hardness`, `resistance`, `emitLight`, `filterLight`, `material`, `harvestTools` (411 blocks), `drops`, `boundingBox`. No friction, speed factor, jump factor, sound type, push reaction, instrument or map color. `material` conflates the mineable and `incorrect_for_*` tags into 25 composite strings |
| misode/mcmeta | generated branches and tags | no `LICENSE`; README disclaimer quoted in `java-datapacks.md` section 5 | 10 branches, 4213 tags, 468 of them `*-summary`; `summary` tracks 26.4-snapshot-5 | `block_definitions/data.min.json` on the current `summary` branch is `{}`. The `1.21.11-summary` tag still has the 124685-byte file. mcmeta republishes Mojang's reports, so it inherits their gaps |
| Pumpkin-MC/Extractor | Fabric mod that writes JSON from a running game | MIT (`LICENSE`, "Copyright (c) 2024 Pumpkin MC") | README badge "current_version 26.3" | `Blocks.kt` is 353 of the mod's 4695 Kotlin lines and writes `slipperiness`, `velocity_multiplier`, `jump_velocity_multiplier`, `bounce_restitution`, `fall_distance_reduction`, `hardness`, `blast_resistance`, `map_color`, `loot_table`, flammable `spread_chance` and `burn_chance`, and per state `instrument`, `luminance`, `piston_behavior`, `hardness`, `opacity`, collision and outline shapes. No sound type |
| Minestom/MinestomDataGenerator | Gradle project that runs Mojang's generator and reflects over the registries | MIT (`LICENSE`, "Copyright (c) 2021 Minestom") | `libs.versions.toml` pins `minecraft = "26.3"`; the published artifact `net.minestom:data` that Minestom itself consumes is `26.2-rv3` | `BlockGenerator.java` writes `explosionResistance`, `friction`, `speedFactor`, `jumpFactor`, `hardness`, `lightEmission`, `pushReaction`, `mapColorId`, `occludes`, `requiresTool`, a boolean `flammable`, `soundType`, five voxel shapes, `redstoneConductor` and `signalSource`. No instrument, no ignite or burn odds. Its `generateData` task refuses to run without `eula=true` and prints "It is unclear if the data from the data generator also adhere to the Minecraft EULA" |
| valence-rs/valence | committed extractor output | repository MIT; no attribution on the JSON (`prior-art-data-driven-servers.md` section 1.3) | `crates/valence_generated/extracted/` targets 1.21.1 | identity and state ids only |

Two conclusions for this project. The per-version lag is real: on 2026-10-24 the newest Java release is 26.3 and minecraft-data's newest Java game data is 26.1, so a consumer that pins a dump is one or two releases behind. And the lag no longer matters much, because the extraction step that used to need a Fabric mod and a mapping file is now a plain classpath program against the published jar.

## 2. Java's block behavior classes

The 26.3 server jar has 330 classes directly in `net/minecraft/world/level/block/`, 305 of them named `*Block`, with 35210 source lines. Counting the subpackages (`entity` 13581 lines, `state` 3900, `piston` 1353, `grower` 209, `sounds` 173) the block tree is 474 source files and 54426 lines. 16 of the `*Block` names start with `Abstract` or `Base` and are shared bases.

Older reports named the classes. 26.1's `reports/registries.json` has `minecraft:block_type` with 263 entries, and every entry in `reports/blocks.json` carries `"definition": {"type": "minecraft:<name>", "properties": {}}`, with the `properties` object empty for all 1168 blocks. The distribution over 26.1's blocks: `minecraft:block` 173, `slab` 58, `rotated_pillar` 56, `stair` 54, `flower_pot` 39, `wall` 26, then `door`, `trapdoor`, `candle`, `candle_cake` and `shulker_box` at 17 each, `banner`, `bed`, `wool_carpet` and `concrete_powder` at 16 each. 168 of the 263 types cover exactly one block. 26.3 removed the registry and the field; `misode/mcmeta`'s `summary` branch now publishes `block_definitions/data.min.json` as `{}`, so the 1.21.11 tag is the last public copy of the taxonomy, which is also what [engine-behavior-inventory.md](engine-behavior-inventory.md) section 1 used.

The work behind a type is placement, breaking, neighbor updates, ticking and interaction, in the five pipelines `BlockBehaviour` declares: `getStateForPlacement` and `canSurvive` and `onPlace`, `getDrops` and `affectNeighborsAfterRemoval`, `neighborChanged` and `updateShape`, `tick` and `randomTick`, and `useWithoutItem` and `useItemOn`. The classes in the package root average 107 lines, and the tail is much longer than that: `FireBlock` 511 lines, `RedstoneWireBlock` 488, `SculkSpreader` 401, `PistonBaseBlock` 406, `ComparatorBlock` 214, `DiodeBlock` 211.

Bedrock's data form is narrower and newer. Its block grammar has 39 public components and 6 internal ones, of which vanilla's 98 JSON blocks use 20, and an undocumented `internal_vanilla_data.block_archetype` with four observed values (`slab_block` 64, `stair_block` 32, `bush_block` 1, `wall_foliage_block` 1) that selects engine code the same way Java's `block_type` did ([bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 1). The behavior a pack can attach without the engine is the 15 `BlockCustomComponent` script hooks. So Bedrock data names the properties well and names the behavior families barely, which is the same position Java is in after 26.3 removed `block_type`.

One grammar mismatch deserves a note before the plan picks a property model. Bedrock's `minecraft:friction` is documented as 0.0 to 0.9, and Java's ice is 0.98 and blue ice 0.989, so a property store that mirrors the Bedrock component range cannot hold Java's ice values.

## 3. Java's block entities

`minecraft:block_entity_type` has 49 entries in 26.3 and is `elements: false`, so a datapack can only tag it. The package is 86 source files and 13581 lines, 72 of them in the package root and 53 named `*BlockEntity`. The 49 types:

- Containers with an inventory and a lid or open count: `chest`, `trapped_chest`, `ender_chest`, `barrel`, `shulker_box`, `hopper`, `dispenser`, `dropper`, `crafter`, `shelf`, `decorated_pot`, `chiseled_bookshelf`, `lectern`. `HopperBlockEntity` is 463 lines on its own because it carries item transfer between containers and entities.
- Processing machines on a tick: `furnace`, `blast_furnace`, `smoker`, `campfire`, `brewing_stand`. `AbstractFurnaceBlockEntity` is 446 lines, `BrewingStandBlockEntity` 335.
- Stored text and ownership: `sign`, `hanging_sign`, `skull`, `banner`, `command_block`, `structure_block`, `jigsaw`, `test_block`, `test_instance_block`.
- Area effects that need per-block state: `beacon`, `conduit`, `bell`, `beehive`, `jukebox`, `enchanting_table`, `end_gateway`, `end_portal`, `daylight_detector`, `comparator`.
- Spawners and loot: `mob_spawner`, `trial_spawner` (443 lines), `vault`, `brushable_block`.
- The sculk family and 1.21 to 1.26 additions: `sculk_sensor`, `calibrated_sculk_sensor`, `sculk_shrieker`, `sculk_catalyst`, `creaking_heart`, `copper_golem_statue`, `potent_sulfur`, `piston`.

Bedrock exposes the whole category as one block component, `minecraft:block_entity`, with `container.slot_count` from 1 to 54 and `dynamic_properties`, and it cannot be used inside a permutation. Everything a Java block entity does beyond holding slots (smelting progress, beacon pyramid scans, bell resonance, hopper transfer, sculk charge spreading) is Bedrock engine code with no component.

## 4. Java's two mob AI systems

### Sizes

| System | Classes | Source lines | Registry |
|---|---|---|---|
| Goals (`world/entity/ai/goal`) | 73 files, 68 of them `*Goal` implementations, 11 under `goal/target` | 5520 | none; goals are plain classes with an int priority |
| Brain behaviors (`world/entity/ai/behavior`) | 119 files, about 100 of them behaviors, the rest infrastructure (`Behavior`, `BehaviorControl`, `BehaviorUtils`, `GateBehavior`, `OneShot`, `TriggerGate`, `ShufflingList`, `declarative/*`) | 8905 | none |
| Sensors (`world/entity/ai/sensing`) | 27 files | 1295 | `minecraft:sensor_type`, 24 entries |
| Memory modules (`world/entity/ai/memory`) | 8 files (the types are constants) | 519 | `minecraft:memory_module_type`, 115 entries |
| Activities | part of `ai/` | | `minecraft:activity`, 26 entries |
| Navigation (`world/entity/ai/navigation`) | 7 files | 940 | none |
| Movement and look control (`world/entity/ai/control`) | 9 files | 557 | none |
| Pathfinder (`world/level/pathfinder`, outside the `ai` tree) | 15 files | 2126 | none |
| Whole `world/entity/ai` tree | 277 files | 20835 | |

`Brain.java` itself is 514 lines, and the sensor, memory, navigation and control packages add 3311 lines on top of the two behavior systems. The 26 activities are `admire_item`, `avoid`, `celebrate`, `core`, `dig`, `emerge`, `fight`, `hide`, `idle`, `investigate`, `lay_spawn`, `long_jump`, `meet`, `panic`, `play`, `play_dead`, `pre_raid`, `raid`, `ram`, `rest`, `ride`, `roar`, `sniff`, `swim`, `tongue`, `work`.

### Which mobs use which

Scanning the constant pool of every top-level class under `net/minecraft/world/entity/`: 55 classes reference `registerGoals`, and 21 reference `brainProvider` or `makeBrain`. One of the 21 is `LivingEntity`, which holds the base. The 20 mob classes with a brain are `Allay`, `Armadillo`, `Axolotl`, `Breeze`, `Camel`, `CopperGolem`, `Creaking`, `Frog`, `Tadpole`, `Goat`, `HappyGhast`, `Hoglin`, `Nautilus`, `ZombieNautilus`, `Piglin`, `PiglinBrute`, `Sniffer`, `Villager`, `Warden`, `Zoglin`. `Camel` and `HappyGhast` carry both systems. Everything else, including every zombie, skeleton, farm animal, slime, guardian and the ender dragon, is goals only. Counting both lists, 73 classes carry AI and 20 of them use brains, so a server that implements only the goal system still runs most of the mob roster.

Community projects enumerate the two systems by reimplementing them rather than by reading a list, because no list is published. Pumpkin has 59 goal source files (8739 lines) and 34 brain files (5407 lines) and its `CONTRIBUTING.md` requires "Mob AI uses goals, selectors, navigation and movement controls, or the Brain's sensors, memories and behaviors". Minestom has 17 files and 1317 lines with seven generic goals and no vanilla mob. Glowstone has 9 files and 666 lines. minecraft-data publishes no AI data for any edition; its `entities.json` is identity, size and category.

### Can Bedrock's entity JSON reproduce it

Bedrock describes all 129 vanilla entities as JSON with 372 component keys, of which 170 are `minecraft:behavior.*` goals and 202 are other components, plus 827 component groups and 850 events ([bedrock-entities-spawning-loot-trading.md](bedrock-entities-spawning-loot-trading.md) sections 1 and 2). That is more AI vocabulary than Java's goal system has, and the vocabularies overlap heavily. Converting Java's 67 goal class names to snake case and intersecting with the 170 Bedrock goal names gives 30 exact matches: `beg`, `breed`, `defend_village_target`, `eat_block`, `flee_sun`, `float`, `follow_mob`, `follow_owner`, `follow_parent`, `hurt_by_target`, `leap_at_target`, `look_at_player`, `look_at_trading_player`, `melee_attack`, `move_through_village`, `move_to_block`, `move_towards_target`, `nearest_attackable_target`, `offer_flower`, `open_door`, `owner_hurt_by_target`, `owner_hurt_target`, `panic`, `random_look_around`, `random_stroll`, `ranged_attack`, `run_around_like_crazy`, `swell`, `tempt`, `trade_with_player`. A further seven Java brain behavior names match Bedrock goal names (`charge_attack`, `croak`, `melee_attack`, `random_look_around`, `random_stroll`, `roar`, `sonic_boom`).

So for the 53 Java classes that use goals only, Bedrock's JSON expresses the same shape of AI with the same priority and control-flag model, and the per-mob definitions already exist. For the 20 brain mobs the two editions genuinely differ.

- Java's villager runs a schedule of activities over memories and points of interest, assembled by `VillagerGoalPackages` from behaviors such as `AcquirePoi`, `YieldJobSite`, `WorkAtPoi`, `StrollToPoi`, `SocializeAtBell` and `UpdateActivityFromSchedule`. Bedrock's `villager_v2.json` reaches the same outcomes with 27 goals, 54 component groups and `minecraft:scheduler`, which is a different scheduler with different tie-breaking.
- Java's piglin keeps bartering, admiring and hunting in `PiglinAi` plus six dedicated behavior classes (`StartAdmiringItemIfSeen`, `StopAdmiringIfItemTooFarAway`, `StopAdmiringIfTiredOfTryingToReachItem`, `StopHoldingItemIfNoLongerAdmiring`, `StartHuntingHoglin`, `RememberIfHoglinWasKilled`). Bedrock has `minecraft:barter`, `minecraft:admire_item` and `behavior.barter` as components.
- The warden keeps anger in `AngerManagement` and `AngerLevel` beside `WardenAi`. Bedrock has `minecraft:anger_level` and `minecraft:vibration_listener` as components.
- Bedrock has no memory, sensor or activity registry at all, so a Bedrock-shaped runtime cannot hold the per-mob state Java's brains hold without inventing storage the format does not describe.

Bedrock data therefore covers goal-system mobs and partly covers brain mobs, because the observable behavior is expressible and the state model is not the same one.

## 5. Entity attributes and mob stats

`minecraft:attribute` has 40 entries in 26.3 and is `elements: false`: `air_drag_modifier`, `armor`, `armor_toughness`, `attack_damage`, `attack_knockback`, `attack_speed`, `below_name_distance`, `block_break_speed`, `block_interaction_range`, `bounciness`, `burning_time`, `camera_distance`, `entity_interaction_range`, `explosion_knockback_resistance`, `fall_damage_multiplier`, `flying_speed`, `follow_range`, `friction_modifier`, `gravity`, `jump_strength`, `knockback_resistance`, `luck`, `max_absorption`, `max_health`, `mining_efficiency`, `movement_efficiency`, `movement_speed`, `name_tag_distance`, `oxygen_bonus`, `safe_fall_distance`, `scale`, `sneaking_speed`, `spawn_reinforcements`, `step_height`, `submerged_mining_speed`, `sweeping_damage_ratio`, `tempt_range`, `water_movement_efficiency`, `waypoint_receive_range`, `waypoint_transmit_range`.

No report lists a mob's values. `DefaultAttributes.SUPPLIERS` is a private static map built in a static initializer. Reading it with the same classpath program gives 93 of 161 entity types with a supplier and 2619 attribute values in total. The zombie's row, abbreviated: `armor=2.0, attack_damage=3.0, follow_range=35.0, max_health=20.0, movement_speed=0.23, spawn_reinforcements=0.0`, with dimensions 0.6 by 1.95, category `monster`, client tracking range 8. The cow's: `max_health=10.0, movement_speed=0.2, follow_range=16.0`, 0.9 by 1.4, category `creature`.

Bedrock publishes the equivalent as entity JSON. `minecraft:health`, `minecraft:attack`, `minecraft:movement`, `minecraft:follow_range`, `minecraft:knockback_resistance`, `minecraft:collision_box` and `minecraft:experience_reward` are components on the entity file, and the Script API exposes seven of them as `EntityAttributeComponent` ([prior-art-data-driven-servers.md](prior-art-data-driven-servers.md) section 1.11). Bedrock has no `attack_speed`, no `sweeping_damage_ratio` and no `mining_efficiency`, because the combat model those serve does not exist there. Bedrock data covers mob stats for a Bedrock server, and does not cover the Java-only attributes.

## 6. The engine systems

Each subsection gives the Java classes and source lines, then the difference that makes "Java parity" a specific claim rather than a general one.

### Redstone

Java keeps the propagation in `world/level/redstone`, which is 10 classes and 908 lines (`Redstone`, `NeighborUpdater`, `CollectingNeighborUpdater` 193 lines, `InstantNeighborUpdater`, `Orientation` 259 lines, `RedstoneWireEvaluator`, `DefaultRedstoneWireEvaluator` 46 lines, `ExperimentalRedstoneWireEvaluator` 233 lines, `ExperimentalRedstoneUtils`). The components themselves are block classes: `RedstoneWireBlock` 488 lines, `ComparatorBlock` 214, `DiodeBlock` 211, `ObserverBlock` 129, plus `PistonBaseBlock` 406 and `PistonStructureResolver` 228.

Mojang ships two wire algorithms and selects between them with a feature flag, not with data: `data/minecraft/datapacks/redstone_experiments/` contains one file, `pack.mcmeta`, whose entire payload is `{"features": {"enabled": ["minecraft:redstone_experiments"]}, "pack": {...}}`.

The editions differ over quasi-connectivity and over piston timing. The wiki's `Piston` page marks its "Quasi-Connectivity" section `{{exclusive|java}}` ("Pistons can be powered from one block above compared to most redstone components") and its "Soft inversion" section `{{exclusive|bedrock}}`, and it states that in Bedrock "the start delay is fixed at 2 game ticks" and "Pistons can only activate on the input/consumer redstone tick" (wiki). Bedrock's data form is three components, `minecraft:redstone_conductivity`, `minecraft:redstone_producer` and `minecraft:redstone_consumer`, which describe conduction, output power and which faces respond, and describe no propagation rule.

### Fluids

Java keeps fluids in `world/level/material`, which is 12 classes and 1475 lines (`Fluid`, `FlowingFluid` 546, `WaterFluid` 147, `LavaFluid` 255, `EmptyFluid`, `FluidState`, `Fluids`, `MapColor`, `PushReaction`, `FogType`, `FluidIds`). `minecraft:fluid` has 5 registry entries and is `elements: false`. Two game rules, `water_source_conversion` and `lava_source_conversion`, gate infinite sources.

The editions differ in the state model. Java models a flowing fluid as a `FluidState` attached to any block, which is why `waterlogged` is a block state. Bedrock has separate `flowing_water` and `flowing_lava` blocks and no `waterlogged` state anywhere in its palette, and expresses the interaction with `minecraft:liquid_detection` (`can_contain_liquid`, `on_liquid_touches` of `blocking`, `broken`, `no_reaction` or `popped`, `stops_liquid_flowing_from_direction`). A server that says "Java parity" for fluids is claiming the Java spread algorithm over a Bedrock two-layer world, and the two state models do not line up block for block.

### Explosions

Java resolves a blast in `ServerExplosion` (347 lines) plus `Explosion` (55), with three game rules for drop decay (`block_explosion_drop_decay`, `mob_explosion_drop_decay`, `tnt_explosion_drop_decay`) and `explosion_knockback_resistance` as an attribute.

The editions differ in the knockback formula. The wiki gives Bedrock's magnitude as `(1 - (distance - width/2)/(2*power)) * exposure * knockbackMultiplier` with distance measured to the entity's feet, and documents it separately from the Java formula (minecraft.wiki `Explosion`, wiki). Bedrock's data side is the `minecraft:explode` entity component (`power`, `fuse_length`, `causes_fire`, `breaks_blocks`, `max_resistance`, `knockback_scaling`, `damage_scaling`), which parameterizes who explodes and how hard, not how the blast resolves.

### Fire spread

Java keeps fire spread in `FireBlock`, 511 lines, including the ignite and burn odds tables its `bootStrap()` fills for 254 blocks. 26.x added the game rule `fire_spread_radius_around_player`, default 128.

Bedrock publishes the odds as `minecraft:flammable` (`catch_chance_modifier`, `destroy_chance_modifier`, `lava_flammable`) on 49 of its 98 JSON blocks and as `burnOdds` and `flameOdds` for all 1477 blocks in the CloudburstMC per-state dump the repository already pins. So the numbers are data on both sides, and the spread algorithm is code on both sides.

### Light

Java keeps the light engine in `world/level/lighting`, which is 15 classes and 2398 lines (`LevelLightEngine` 188, `LightEngine` 337, `SkyLightEngine` 388, `BlockLightEngine` 133, the two section storages, `DynamicGraphMinFixedPoint`, `LeveledPriorityQueue`, `SpatialLongSet`, `ChunkSkyLightSources`).

The editions differ over which light value drives plant growth. The wiki's light chart is written for Java and says the main Bedrock differences are that "All plants and mushrooms in the chart are affected in Bedrock by internal light instead of client light" and that mycelium is the other way round (minecraft.wiki `Light`, wiki). The per-block inputs, emission and dampening, are data on the Bedrock side (`minecraft:light_emission` 0 to 15 and `minecraft:light_dampening` 0 to 15, plus the per-state dump), and the propagation engine is code.

### Mob spawning

Java spawns mobs from `NaturalSpawner` (549 lines) and `SpawnPlacements` (177), driven from `ServerChunkCache.tickChunks` in this order, read from the bytecode: `DistanceManager.getNaturalSpawnChunkCount`, construct `LocalMobCapCalculator`, `NaturalSpawner.createState`, read the `spawn_mobs` and `random_tick_speed` game rules, `NaturalSpawner.getFilteredSpawningCategories`, `ChunkMap.collectSpawningChunks`, shuffle, `tickSpawningChunk` per chunk, `ChunkMap.forEachBlockTickingChunk`, `ServerLevel.tickCustomSpawners`. The per-biome spawn lists are data (`natural_mob_spawns` environment attribute in 26.3); the caps, the shell geometry and the placement checks are code.

The editions differ in the search volume and the cap model. The wiki states Bedrock spawns "within a spherical shell 24-44 blocks away from the player on simulation distance 4" and "a quasi-spherical shell 24-128 blocks away" at simulation distance 6 and higher (minecraft.wiki `Mob_spawning`, wiki), and Bedrock's caps are per pool in a 9 by 9 chunk area rather than Java's per-category per-loaded-chunk budget. Bedrock's data side is 60 spawn rule files using 21 components (`brightness_filter`, `biome_filter`, `density_limit`, `herd`, `population_control`, `difficulty_filter` and the rest), which is a richer per-mob condition language than Java's biome lists; Java's data side is the richer per-biome weight table. Neither edition publishes the attempt rate or the cap numbers.

### Random ticking

Java runs the loop in `ServerLevel.tickChunk`, whose bytecode order is pick a random position, `tickPrecipitation`, then for each `LevelChunkSection` where `isRandomlyTicking`, draw `random_tick_speed` positions and call `BlockState.randomTick` and `FluidState.randomTick`. `minecraft:random_tick_speed` defaults to 3, read from the registry at runtime. 110 of 1286 blocks are randomly ticking.

The editions differ in what the game rule means. The wiki says that in Java "the number of blocks chosen from each subchunk is specified by `gamerule random_tick_speed` (defaults to 3), and one block can be chosen multiple times in one chunk tick", and that in Bedrock the rule "specifies only relative speed instead of the exact number" and defaults to 1 (minecraft.wiki `Tick`, wiki). A server claiming Java parity for crop growth is claiming Java's absolute three draws per subchunk.

### Player movement and combat

Java keeps movement and combat in `Entity.java` (4601 lines) and `LivingEntity.java` (4318 lines), which are the two largest files in the server and hold movement, collision resolution, fluid pushing, fall damage, knockback and damage application. `Player.java` is 2134, `ServerPlayer.java` 2489, `ServerGamePacketListenerImpl.java` 2487 (the move and interaction packet validation), `ServerPlayerGameMode.java` 451 (block breaking progress). Two game rules exist specifically for validation, `player_movement_check` and `elytra_movement_check`.

The sharpest difference in the whole comparison is Java's attack cooldown. The wiki marks the section `{{exclusive|Java}}` and says "Attack speed is controlled by the `attack_speed` attribute. The default value is 4" with damage scaled by `0.2 + ((t + 0.5) / T) ^ 2 * 0.8` where `T = 20 / attack_speed`, and that critical hits need 84.8 percent charge (minecraft.wiki `Melee_attack`, wiki). Bedrock has no `attack_speed` attribute and no cooldown meter; its melee damage is the sum of base attack, item damage and enchantment damage. Sweep attacks are in the same Java-only bucket. Any statement of "1-1 Java parity" has to decide explicitly whether player combat follows Java's cooldown model or Bedrock's, because clients will behave according to their own edition.

## 7. Stations, trading, raids, advancements and the tick loop

### Crafting and stations

Java keeps recipe matching in `world/item/crafting`, 70 files and 4958 lines, `world/inventory` 64 files and 6711 lines. `minecraft:recipe_serializer` has 22 entries, 8 of which are `crafting_special_*` serializers whose logic is code behind a short JSON stub (`bannerduplicate`, `bookcloning`, `firework_rocket`, `firework_star`, `firework_star_fade`, `mapextending`, `repairitem`, `shielddecoration`). The station behavior lives in block entities: `AbstractFurnaceBlockEntity` 446 lines, `BrewingStandBlockEntity` 335, `CrafterBlockEntity`, `CampfireBlockEntity`, plus 61 menu classes. `RecipeManager` is 268 lines.

Bedrock has 1892 recipe files in 7 types and `minecraft:crafting_table` as a block component with `crafting_tags`, which names the station and says nothing about how it processes. The recipe set is data on both sides and the station tick is code on both sides, so Bedrock data partly covers this area.

### Villager trading and gossip

`VillagerTrades.java` is 2501 lines, the largest single-mechanic file outside `Entity` and `LivingEntity`, even though 26.1 moved the offers themselves into data (391 `villager_trade` files and 68 `trade_set` files, plus a `trade_rebalance` built-in pack of 104 files). What stays in the file is the item modifier logic each offer type applies. Gossip is `world/entity/ai/gossip`, 3 classes and 279 lines, with `GossipContainer` at 240; `minecraft:villager_profession` has 15 entries and `minecraft:point_of_interest_type` 21, both `elements: false`.

Bedrock expresses the offers as 27 trade tables with `tiers`, `groups`, `num_to_select`, `wants`, `gives`, `trader_exp`, `max_uses` and five trade functions, and expresses the economy as fields on `minecraft:economy_trade_table` (`cured_discount` -25 to -20, `hero_demand_discount` -4, `nearby_cured_discount` -20, `max_nearby_cured_discount` -200). Bedrock has no gossip container, and the reputation model is engine state behind those discount fields, so Bedrock data partly covers this area.

### Raids

Java keeps raids in `world/entity/raid`, 4 classes and 1675 lines, `Raid.java` 892 and `Raids.java` 194, with the `raids` game rule and `pre_raid` and `raid` activities in the brain system. Bedrock's data side is 7 wave files under `definitions/spawn_groups/`, the `minecraft:can_join_raid` component on 5 entities and `minecraft:raid_trigger` on the player. The wave composition is data on both sides, and the raid state machine, the omen conversion and the victory and defeat conditions are code on both sides, so this must be authored as code.

### Advancement triggers

In Java, `minecraft:trigger_type` has 58 entries and is `elements: false`; `advancements/` is 115 source files and 7474 lines, with 49 trigger classes (95 class files counting inner classes) and 53 class files under `advancements/predicates`. The 1866 advancement JSON files reference those triggers; `PlayerAdvancements` is 351 lines and `Advancement` 195.

Bedrock has no advancement format at all, and achievements are engine code ([java-datapacks.md](java-datapacks.md) section 6), so this must be authored as code. The trigger implementations are the same instrumentation points a Bedrock server needs anyway for its own statistics.

### Tick loop ordering

Read from the bytecode of 26.3, the server tick is `MinecraftServer.tickServer`, which calls `autoSave`, `tickConnection`, `ServerTickRateManager.tick`, then `tickChildren`, then `buildServerStatus` and `logTickMethodTime`. `tickChildren` calls, in order: each player's per-tick work, `ServerFunctionManager.tick`, `ServerClockManager.tick`, `updateEffectiveRespawnData`, then `ServerLevel.tick` for every level, then `tickConnection`, `PlayerList.tick`, `ServerDebugSubscribers.tick`, `GameTestTicker.tick`, the pending task list, `PlayerChunkSender.sendNextChunks` and `resumeFlushing` per player, and `ServerActivityMonitor.tick`.

`ServerLevel.tick` calls, in order: `EnvironmentAttributeSystem.invalidateTickCache`, `WorldBorder.tick`, `advanceWeatherCycle`, the sleep checks and clock marker, `updateSkyBrightness`, `tickTime`, `LevelTicks.tick` (scheduled block and fluid ticks), `Raids.tick`, `ServerChunkCache.tick` (which runs chunk loading, spawning and random ticks), `runBlockEvents`, `EnderDragonFight.tick`, `EntityTickList.forEach` (entity ticks), `tickBlockEntities`, `PersistentEntitySectionManager.tick`, and the debug synchronizers.

Three orderings in that list are observable and worth pinning in tests: scheduled ticks run before chunk ticks and entity ticks; spawning happens inside the chunk pass, before entities move; block entities tick after entities. Bedrock publishes no equivalent statement, and [engine-behavior-inventory.md](engine-behavior-inventory.md) section 4 lists the Bedrock tick facts that are available (simulation distance, relative random tick speed, spawning near players only), so this must be authored as code.

## 8. What the same work cost other projects

Line counts from shallow clones taken 2026-10-24, counting source files only, excluding generated output where it is in its own directory. Commit hashes are in "Reproduction".

| Area | Mojang 26.3 (source lines in the jar) | Pumpkin (Rust, GPL-3.0, targets 26.3) | Minestom (Java, Apache-2.0, data 26.2) | Glowstone (Java, targets 1.19) | Cuberite (C++, Apache-2.0) |
|---|---|---|---|---|---|
| Block behavior | 35210 in 330 classes | 33425 in 217 files | 3521 in 26 files, no vanilla behavior | 10047 in 106 `blocktype` files | 12489 in 112 files |
| Block entities | 11036 in 72 classes | 14129 in 55 files | included above | 2656 in 32 files | 6082 in 44 files |
| Mob AI | 5520 goals plus 8905 behaviors plus 3311 sensors, memory, navigation and control | 8739 goals plus 5407 brain, 22513 for the whole `ai` tree | 1317, seven generic goals | 666 | 9210 for all of `Mobs` including the mobs themselves |
| Entities overall | 109836 | 93855 | 20651 | 23000 | 15348 |
| Redstone | 908 plus the component blocks | 8131 in 33 files | none | none | 2813 in its incremental simulator |
| Fluids | 1475 | 1217 in 6 files | none | none | 417 floody plus 158 vanilla plus the shared simulator |
| Explosions | 402 | 598 | none | 407 (`Explosion.java`) | not a separate file |
| Lighting | 2398 | 1720 in 4 files | none | none | 630 (`LightingThread.cpp`) |
| Natural spawning | 726 | 1183 | none | none | 555 (`MobSpawner.cpp`) |
| Fire spread | 511 | inside the block files | none | none | 440 (`FireSimulator.cpp`) |
| Loot | 10426 | 1620 plus 501 plus 865 in the parser | none; its generator emits the tables with the comment "only included for legacy reasons, Minestom doesn't use them" | none | none; drops are `ConvertToPickups` overrides |
| Crafting and menus | 4958 plus 6711 | 11254 in `pumpkin-inventory` | none | 7607 | 1148 (`CraftingRecipes.cpp`) |
| Raids | 1675 | 751 | none | none | none |
| Worldgen | 45295 | 62799 in 232 files | none, `Generator` is a callback | none vanilla | 26187, not a vanilla port |
| Whole server | 520352 in 5027 files | 1555813 in `pumpkin-data` is generated; the hand-written crates are the rows above | 113917 | 114248 | 307745 including 81k lines of generated palettes |

Three readings of that table. First, the reimplementations that aim at vanilla behavior land within a factor of two of Mojang's line count per area, and sometimes above it: Pumpkin's redstone is 8131 lines against Mojang's 908 plus component blocks, because Pumpkin reimplements each component separately rather than sharing a block class hierarchy. Second, the projects that skip vanilla behavior are not cheaper versions of the same thing. Minestom is 113917 lines and valence 50277, and neither implements a single vanilla block rule. Third, forking is also expensive: PaperMC/Paper at 26.3 carries 946 per-file source patches, 35 feature patches totalling 86191 lines, and 150147 lines of its own Java in `paper-server/src`.

For the Bedrock side, [prior-art-data-driven-servers.md](prior-art-data-driven-servers.md) section 1.6 gives Allay's shape (1477 block types covered by 366 behavior classes and 173 base component implementations, 1035 assigned by hand) and section 1.9 gives CloudburstMC/Server's (65 component keys bound by 379 `.set(...)` calls in a 1057-line registry). Those are the two closest precedents for the pattern this project is choosing.

## 9. Fill-in ratings

The rating answers one question: if this project writes a Bedrock behavior pack plus an engine, can the behavior pack carry this piece, or must the engine carry it? Bedrock grammar references are to [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) (blocks, items, recipes) and [bedrock-entities-spawning-loot-trading.md](bedrock-entities-spawning-loot-trading.md) (entities, spawning, loot, trading).

| # | Piece | Where Java keeps it | Size | Bedrock data equivalent | Rating |
|---|---|---|---|---|---|
| 1 | Block hardness | `BlockStateBase.destroySpeed`, no report | 1286 values | `minecraft:destructible_by_mining.seconds_to_destroy` plus `item_specific_speeds`; per-state dump for all 1477 | Bedrock data covers it |
| 2 | Blast resistance | `BlockBehaviour.explosionResistance` | 1286 values | `minecraft:destructible_by_explosion.explosion_resistance` | Bedrock data covers it |
| 3 | Tool, tier, harvest requirement | block tags plus the item `minecraft:tool` component (data in Java) | 4 mineable, 3 needs, 7 incorrect_for tags; 470 blocks need the correct tool | block tags such as `minecraft:is_pickaxe_item_destructible` and `minecraft:diamond_tier_destructible` | Bedrock data covers it |
| 4 | Friction | `BlockBehaviour.friction` | 5 non-default blocks | `minecraft:friction`, documented range 0.0 to 0.9, below Java's ice at 0.98 | Bedrock data partly covers it |
| 5 | Speed factor and jump factor | `speedFactor`, `jumpFactor` | soul sand, honey block | no component | must be authored as code |
| 6 | Bounce and fall reduction | `bounceRestitution`, `fallDistanceReduction` | 18 blocks | `block_archetype` parameters `bounciness` and `fall_damage_multiplier` on `wall_foliage_block`, same 0.75 and 0.5 values as Java's shelf mushroom | Bedrock data partly covers it |
| 7 | Light emission | `BlockStateBase.lightEmission` | 56 emitters | `minecraft:light_emission` 0 to 15 | Bedrock data covers it |
| 8 | Light filter | `BlockStateBase.lightDampening` | 461 blocks vary per state | `minecraft:light_dampening` 0 to 15, per-state dump | Bedrock data covers it |
| 9 | Map color | `BlockStateBase.mapColor` | 62 colors | `minecraft:map_color` with `tint_method` | Bedrock data covers it |
| 10 | Sound type | `BlockBehaviour.soundType` | 131 constants | no block component; resource pack `sounds.json` plus engine sound events | must be authored as code |
| 11 | Flammability values | `FireBlock.igniteOdds`, `burnOdds` | 254 blocks | `minecraft:flammable` plus `burnOdds` and `flameOdds` in the per-state dump | Bedrock data covers it |
| 12 | Fire spread algorithm | `FireBlock` | 511 lines | none | must be authored as code |
| 13 | Push reaction | `BlockStateBase.pushReaction` | 4 values over 1286 blocks | `minecraft:movable.movement_type` with the same four outcomes plus `sticky` | Bedrock data covers it |
| 14 | Instrument | `BlockStateBase.instrument` | 27 values | `minecraft:instrument_sound` with 17 `note.*` values | Bedrock data partly covers it |
| 15 | Block behavior class | 305 `*Block` classes; `block_type` registry removed in 26.3 | 35210 lines | `block_archetype` (4 observed values) plus 39 components plus 15 script hooks | must be authored as code |
| 16 | Block placement rules | `getStateForPlacement`, `canSurvive` | inside the block classes | `minecraft:placement_filter`, the four placement traits, `minecraft:connection_rule`, `minecraft:support` | Bedrock data partly covers it |
| 17 | Block drops | `getDrops` plus 1201 loot tables | data in Java | `minecraft:loot` on the 98 JSON blocks only | Bedrock data partly covers it |
| 18 | Block entities | 49 types | 13581 lines | `minecraft:block_entity` with `container.slot_count` and `dynamic_properties` | must be authored as code |
| 19 | Mob AI, goal system | 68 goal classes | 5520 lines | 170 `minecraft:behavior.*` goals with `priority` and `control_flags`; 30 names match exactly | Bedrock data covers it |
| 20 | Mob AI, brain system | 116 behavior classes, 24 sensors, 115 memories, 26 activities | 8905 lines plus 1814 | goals and components for the same 20 mobs; no memory, sensor or activity registry | Bedrock data partly covers it |
| 21 | Mob stats | `DefaultAttributes`, 40 attributes, 93 suppliers, 2619 values | 894 lines | `minecraft:health`, `attack`, `movement`, `follow_range`, `collision_box`, `knockback_resistance`, `experience_reward` | Bedrock data covers it |
| 22 | Java-only attributes (`attack_speed`, `sweeping_damage_ratio`, `mining_efficiency`) | registry plus `LivingEntity` | | none | must be authored as code |
| 23 | Redstone propagation | `world/level/redstone` plus the component blocks | 908 plus about 1500 | `redstone_conductivity`, `redstone_producer`, `redstone_consumer` describe conduction and output only | must be authored as code |
| 24 | Fluid flow | `FlowingFluid`, `WaterFluid`, `LavaFluid` | 1475 lines | `minecraft:liquid_detection` describes reactions only; Bedrock has no `waterlogged` state | must be authored as code |
| 25 | Explosions | `ServerExplosion` | 402 lines | `minecraft:explode` parameterizes the source, not the blast | must be authored as code |
| 26 | Light engine | `world/level/lighting` | 2398 lines | emission and dampening are data; propagation is not | must be authored as code |
| 27 | Mob spawning algorithm | `NaturalSpawner`, `SpawnPlacements`, `ServerChunkCache.tickChunks` | 726 lines plus the caller | 60 spawn rules with 21 condition components; caps and shell geometry undocumented | Bedrock data partly covers it |
| 28 | Random ticking | `ServerLevel.tickChunk` | inside a 1930-line file | nothing; Bedrock's `randomTickSpeed` is relative and defaults to 1 against Java's absolute 3 | must be authored as code |
| 29 | Player movement and collision | `Entity`, `LivingEntity`, `ServerGamePacketListenerImpl` | 4601 plus 4318 plus 2487 | none | must be authored as code |
| 30 | Combat | `LivingEntity`, `Player`, the `attack_speed` attribute | inside the files above | `minecraft:attack`, `damage_sensor`, `hurt_on_condition`, `apply_knockback_rules` cover the per-mob numbers | Bedrock data partly covers it |
| 31 | Crafting and station behavior | `world/item/crafting`, `world/inventory`, the processing block entities | 4958 plus 6711 plus 781 | 1892 recipe files; `minecraft:crafting_table` names the station only | Bedrock data partly covers it |
| 32 | Villager trading and gossip | `VillagerTrades`, `GossipContainer` | 2501 plus 279 | 27 trade tables plus `minecraft:economy_trade_table` discount fields | Bedrock data partly covers it |
| 33 | Raids | `world/entity/raid` | 1675 lines | 7 wave files, `can_join_raid`, `raid_trigger` | must be authored as code |
| 34 | Advancement triggers and the tick loop | `advancements/` (58 trigger types), `MinecraftServer.tickServer`, `ServerLevel.tick` | 7474 plus 2282 plus 1930 | nothing in either case | must be authored as code |

## Open questions

- The line counts come from `LineNumberTable` attributes and are a lower bound: they give the highest source line that carries bytecode, so trailing comments, imports after the last statement and files with no executable code are undercounted or missing. A decompile would give exact figures and was not run.
- 26.2 was not downloaded. [java-datapacks.md](java-datapacks.md) dates the `definition` field's removal to 26.3 and gives 265 types for 26.2; this note verified 263 types for 26.1 and the absence of the `minecraft:block_type` registry in 26.3, leaving the 26.2 figure unverified here.
- `DefaultAttributes` covers 93 of 161 entity types. The other 68 are non-living entities (projectiles, vehicles, markers) whose stats are constructor arguments inside their classes and were not enumerated.
- The scan for brain mobs matched on the strings `brainProvider` and `makeBrain` in the constant pool. A mob that builds a brain through an inherited method without naming either would be missed; none was found by inspection, but the method is heuristic.
- Bedrock's `minecraft:friction` range of 0.0 to 0.9 is from the creator docs. Whether the engine clamps a higher value or accepts it was not tested against a running BDS, so the ice mismatch in row 4 is a documentation mismatch and not yet a measured one.
- No measurement was taken of how closely a Bedrock goal with a matching name behaves like the Java goal of that name. The 30 exact name matches are a vocabulary result, not a semantics result.
- Mojang's deobfuscation article says the EULA and Usage Guidelines are unchanged. Nothing here is legal advice, and whether values extracted from the jar may be committed to a repository is the same open question [bedrock-data-extraction.md](bedrock-data-extraction.md) section 5 and [java-datapacks.md](java-datapacks.md) section 5 already record for both editions.

## Reproduction

All downloads sit in their own empty directories under `/tmp/jcob/`; the scripts live in `/tmp/jcob/tools/` and take paths as arguments. Python is run with `-I`.

```sh
mkdir -p /tmp/jcob/{meta,tools,repos,dumps,wiki}

# Version manifest, 26.3 metadata, and the mappings check
curl -sS -o /tmp/jcob/meta/manifest.json https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
curl -sS -o /tmp/jcob/meta/26.3.json \
  https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json
# downloads keys per version: 26.4-snapshot-5, 26.3, 26.2, 26.1 have client+server only;
# 1.21.11, 1.21.9, 1.21.4, 1.20.5, 1.14.4 also have client_mappings+server_mappings

# Changelogs and the deobfuscation article (HTML; strip tags before grepping)
curl -sS -A "Mozilla/5.0 (research)" -o /tmp/jcob/meta/art-26-1.html \
  https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1
curl -sS -A "Mozilla/5.0 (research)" -o /tmp/jcob/meta/art-deobf.html \
  https://www.minecraft.net/en-us/article/removing-obfuscation-in-java-edition

# Server jars (26.3 sha1 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c, 26.1 sha1 3872a7f07a1a595e651aef8b058dfc2bb3772f46)
mkdir -p /tmp/jcob/dumps/jar263 /tmp/jcob/dumps/jar261
curl -sS -o /tmp/jcob/dumps/jar263/server.jar \
  https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar
curl -sS -o /tmp/jcob/dumps/jar261/server.jar \
  https://piston-data.mojang.com/v1/objects/3872a7f07a1a595e651aef8b058dfc2bb3772f46/server.jar
cd /tmp/jcob/dumps/jar263 && unzip -o -q server.jar 'META-INF/versions/*' -d extracted
JAR=/tmp/jcob/dumps/jar263/extracted/META-INF/versions/26.3/server-26.3.jar
unzip -l "$JAR" | grep -c '\.class$'          # 7762

# Reports (Java 25 required; /usr/libexec/java_home -v 25)
JH=$(/usr/libexec/java_home -v 25)
cd /tmp/jcob/dumps/jar263 && "$JH/bin/java" -DbundlerMainClass=net.minecraft.data.Main \
  -jar server.jar --reports --output /tmp/jcob/dumps/gen
cd /tmp/jcob/dumps/jar261 && "$JH/bin/java" -DbundlerMainClass=net.minecraft.data.Main \
  -jar server.jar --reports --output /tmp/jcob/dumps/gen261
# registries.json gives block 1286, item 1658, entity_type 161, block_entity_type 49, attribute 40,
# memory_module_type 115, sensor_type 24, activity 26, fluid 5, game_rule 59, trigger_type 58.
# gen261 has minecraft:block_type with 263 entries; gen (26.3) does not have the registry.

# Class and source-line counts (tools/pkgcount.py, tools/listpkg.py, tools/srclines.py, tools/srcfile.py)
python3 -I /tmp/jcob/tools/pkgcount.py "$JAR" net/minecraft/world/level/block/ net/minecraft/world/entity/ai/goal/ ...
python3 -I /tmp/jcob/tools/srclines.py "$JAR" net/minecraft/ net/minecraft/world/level/block/ ...
python3 -I /tmp/jcob/tools/srcfile.py "$JAR" FireBlock.java RedstoneWireBlock.java Entity.java ...
# srclines.py reads LineNumberTable attributes; cross-checked against
# "$JH/bin/javap" -c -l -p -classpath "$JAR" net.minecraft.world.level.block.FireBlock  -> max line 511

# Goal versus brain mobs: scan the constant pool of every class under world/entity for
# "registerGoals" (55 classes) and "brainProvider"/"makeBrain" (21, one of them LivingEntity).

# Tick order, straight from the bytecode
"$JH/bin/javap" -c -p -classpath "$JAR" net.minecraft.server.MinecraftServer   > /tmp/jcob/dumps/ms.txt
"$JH/bin/javap" -c -p -classpath "$JAR" net.minecraft.server.level.ServerLevel > /tmp/jcob/dumps/sl.txt
"$JH/bin/javap" -c -p -classpath "$JAR" net.minecraft.server.level.ServerChunkCache > /tmp/jcob/dumps/scc.txt
# then list the invoke* targets of tickServer, tickChildren, tick, tickChunk, tickChunks in order

# Block properties and entity attributes, compiled against the unobfuscated jar
# (the bundler writes /tmp/jcob/dumps/jar263/libraries on the first run above)
CP="$JAR:$(find /tmp/jcob/dumps/jar263/libraries -name '*.jar' | tr '\n' ':')"
"$JH/bin/javac" -nowarn -cp "$CP" -d /tmp/jcob/tools/javaout /tmp/jcob/tools/javasrc/Extract*.java
"$JH/bin/java" -cp "/tmp/jcob/tools/javaout:$CP" Extract /tmp/jcob/dumps/java-block-properties.tsv
# -> blocks=1286 varyingPerState=550 flammable=254 soundTypes=131
"$JH/bin/java" -cp "/tmp/jcob/tools/javaout:$CP" Extract2 /tmp/jcob/dumps/java-entity-attributes.tsv
# -> entityTypes=161 withDefaultAttributes=93 attributeRows=2619
"$JH/bin/java" -cp "/tmp/jcob/tools/javaout:$CP" Extract3   # 59 game rules; random_tick_speed = 3

# Republishers
curl -sS -o /tmp/jcob/dumps/mcdata/dataPaths.json \
  https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/dataPaths.json
curl -sS -o /tmp/jcob/dumps/mcdata/pc-26.1-blocks.json \
  https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/26.1/blocks.json
curl -sS https://raw.githubusercontent.com/misode/mcmeta/summary/block_definitions/data.min.json   # {}
curl -sS https://raw.githubusercontent.com/misode/mcmeta/summary/version.json                      # 26.4-snapshot-5
git ls-remote --tags https://github.com/misode/mcmeta.git | wc -l                                  # 4213

# Reimplementations (shallow clones, read only, nothing built)
cd /tmp/jcob/repos
git clone -q --depth 1 https://github.com/Pumpkin-MC/Pumpkin.git            # cd9e98c9, 2026-10-24
git clone -q --depth 1 https://github.com/Pumpkin-MC/Extractor.git          # 3972c199, 2026-10-24
git clone -q --depth 1 https://github.com/Minestom/Minestom.git             # 704be783, 2026-10-17
git clone -q --depth 1 https://github.com/Minestom/MinestomDataGenerator.git # 1d9d4723, 2026-09-15
git clone -q --depth 1 https://github.com/valence-rs/valence.git            # c4177cab, 2026-06-15
git clone -q --depth 1 https://github.com/GlowstoneMC/Glowstone.git         # e9aeaa46, 2026-05-18
git clone -q --depth 1 https://github.com/cuberite/cuberite.git             # 7fd3fa5c, 2025-12-16
git clone -q --depth 1 https://github.com/PaperMC/Paper.git                 # e3ba7b1d, 2026-10-24
# counts: find <dir> -name '*.rs' -o -name '*.java' -o \( -name '*.cpp' -o -name '*.h' \) | wc -l
#         find <dir> ... -exec cat {} + | wc -l

# Wiki, secondary, raw wikitext
for p in Tick Mob_spawning Light Explosion Melee_attack Piston; do
  curl -sS -A "Mozilla/5.0 (research)" -o /tmp/jcob/wiki/$p.txt "https://minecraft.wiki/w/$p?action=raw"
done
```
