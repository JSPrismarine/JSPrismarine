# Extraction routes and parity verification against a real BDS

Scope: the three extraction routes (Script API dump pack, Endstone DevTools, packet capture), reference worlds from BDS, and an automated parity suite for this server against Bedrock Dedicated Server 1.26.51.1. Researched 2026-10-24 against the `@minecraft/*` npm declarations for that version, EndstoneMC/endstone at `bb0475b64744106b328238b3f51d77576ddc6569`, AllayMC/BedrockData at `5d5e8cfe2cdf404aedcd5f95596da01cc0ccda7f`, CloudburstMC/ProxyPass at `4e484c9744548b604f96c71de9ba0d4281be8960`, learn.microsoft.com, the BDS zip unpacked at `/tmp/bds-research/bds/extracted`, and this repository at `2a4b14af46f4e8f162524913edeb6a2d51ed0fea`. It builds on [bedrock-data-extraction.md](bedrock-data-extraction.md) (sections 1, 2, 7 and 9) and does not repeat it.

## Summary

- BDS 1.26.51.1 runs `@minecraft/server` 2.10.0 stable and `2.11.0-beta.1.26.51-stable`; both publish `index.d.ts` on npm. The stable module can enumerate every block, item, entity, biome, effect, enchantment, dimension and potion type, read item components (durability, food, cooldown, enchantable slots, potion, dyeable, compostable, inventory), entity components (health and movement attributes with defaults, scale, type families, breathable, navigation flags, rideable seats, projectile physics, tameable, ageable, healable), block and item tags, block map colors, piston movability, the parsed loot tables with weights and conditions, and the per-block state domains the palette pack already reads.
- The Script API exposes no block hardness, blast resistance, friction, light emission, flammability or collision shape, and no item attack damage, armor value, enchantment value or burn time. Those stay with an out-of-game dump.
- Endstone DevTools (Apache-2.0) dumps exactly those numbers into `block_states.json` (22 fields per permutation) and `items.json`, but it is an ImGui window: no headless flag, no export command, built only on Windows (`conanfile.py` `_with_devtools` returns `self.settings.os == "Windows"`). The AllayMC data for 1.26.50.5 came from a modified "headless" build that is not public. Endstone pins BDS 1.26.52 at HEAD and at `v0.11.14`.
- Script output reaches stdout only with `content-log-console-output-enabled=true`; the binary logs "Content logging to console is disabled" otherwise. The palette README does not say this.
- A BDS sends more engine data than the capture tool records: `VoxelShapesPacket` (collision shapes by name), `CraftingDataPacket` with 210 potion mixes and 2 container mixes, `TrimDataPacket`, `CameraPresetsPacket`, `AvailableCommandsPacket`, `CreativeContentPacket`, and `AddActorPacket` attributes and metadata for every spawned type. The client package can emit raw bytes for all of them but decodes only nine packet types and cannot send a `CommandRequestPacket`.
- BDS assigns recipe net ids in registry order, not file order (net id 1 is `minecraft:black_concrete_slab`, a 1.26.50 recipe), so recipe parity compares by recipe id, not by net id.
- Reference worlds: `level-seed` in `server.properties`, up to 10 command ticking areas of up to 100 chunks each (Microsoft docs), or `TickingAreaManager.createTickingArea`, whose promise "will return when all the chunks in the area are loaded and ticking". `packages/leveldb` opens BDS databases read-only and the provider decodes subchunk versions 1, 8 and 9. No public chunks-per-second figure for BDS exists; the first CI run has to measure it.
- The parity suite splits into a per-PR job that runs Vitest against committed goldens and a version-bump job that boots BDS, regenerates the goldens and opens a pull request with the diff. Goldens are JSON tables plus per-chunk hashes with a few raw sample chunks, which keeps them under a few megabytes per version.
- Pin the zip by sha256 (`ad91d3b824e51ea50b5bb601c295cbd8f543a29b14315c2ad89ff27311e2d860`), cache it with `actions/cache` keyed on that hash (10 GB per repository, evicted after 7 days unused), and keep the derived outputs committed so a pulled version does not break the build.

## 1. The Script API as an extraction tool

### Which declarations apply to 1.26.51.1

`config/default/permissions.json` in the zip allows `@minecraft/server-gametest`, `@minecraft/server`, `@minecraft/server-ui`, `@minecraft/server-admin`, `@minecraft/server-editor` and `@minecraft/debug-utilities`. The BDS packs that depend on `@minecraft/server` (`server_editor_library`, `editor`) pin `"version": "beta"`, so they do not name the number. npm does: `npm view @minecraft/server versions` lists `2.10.0-rc.1.26.50-preview.27` followed by the stable `2.10.0`, then `2.11.0-beta.1.26.50-stable`, `2.11.0-beta.1.26.51-stable` and `2.11.0-beta.1.26.52-stable`. The companion modules at 1.26.51 are `@minecraft/server-gametest@1.0.0-beta.1.26.51-stable`, `@minecraft/server-admin@1.0.0-beta.1.26.51-stable`, `@minecraft/debug-utilities@1.0.0-beta.1.26.51-stable` and `@minecraft/server-ui@2.3.0-beta.1.26.51-stable`. The palette pack's manifest asks for `@minecraft/server` `2.0.0`, which the engine satisfies with any 2.x stable.

Microsoft's versioning page states the rule for beta modules: "In order to use -beta APIs, you must enable the "Beta APIs" experiment within worlds that use these behavior packs" (https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning, updated 2025-07-17). `@minecraft/server-admin` and `@minecraft/server-gametest` exist only as `-beta`, and their module pages say "This module is still in pre-release". A dump pack that stays on `@minecraft/server` 2.10.0 needs no experiment and no edited `level.dat`.

Declarations read: `minecraft-server-2.10.0/package/index.d.ts` (27123 lines, license MIT) and `minecraft-server-2.11.0-beta.1.26.51-stable/package/index.d.ts` (29715 lines), fetched with `npm pack` into `/tmp/bds-research-extract/npm/` and unpacked without installing.

### Read APIs that expose engine data

Every `static getAll()` in 2.10.0: `BiomeTypes`, `BlockStates`, `BlockTypes`, `DimensionTypes`, `EffectTypes`, `EnchantmentTypes`, `EntityTypes`, `ItemTypes`, plus `Potions.getAllDeliveryTypes()` and `Potions.getAllEffectTypes()`. What each yields that no Mojang file contains:

| API | Declaration (2.10.0) | Engine-defined value it yields |
|---|---|---|
| `BlockTypes.getAll()` | `BlockType { id, localizationKey }` | the internal block list (1477 at 1.26.51 per the palette README) and the localization key per block |
| `BlockPermutation.resolve(name, states)`, `getAllStates()` | `Record<string, boolean \| number \| string>` | the per-block state domain, which `datagen/palette-pack/scripts/domains.js` already captures by resolving every candidate value |
| `BlockStates.getAll()` | `BlockStateType { id, validValues }` | the game-wide value list per property (`age` is `0..15` game wide; cocoa takes `0..2`) |
| `BlockPermutation.getTags()`, `hasTag()` | `string[]` | block tags (`minecraft:is_pickaxe_item_destructible`, `minecraft:wood`, ...), which the 98 block JSON files carry but the other 1365 blocks do not |
| `BlockPermutation.getItemStack(amount)` | `ItemStack \| undefined` | the block-to-item mapping, including blocks with no item |
| `BlockPermutation.canContainLiquid`, `isLiquidBlocking`, `canBeDestroyedByLiquidSpread`, `liquidSpreadCausesSpawn` | `(liquidType: LiquidType) => boolean`, `LiquidType.Water` only | the water interaction rules per permutation (waterlogging, flow blocking, pop on flow) |
| `Block.getComponent('minecraft:map_color')` | `BlockMapColorComponent { color: RGBA, tintedColor, tintMethod }` | the map color per placed block |
| `Block.getComponent('minecraft:movable')` | `{ movementType: MovementType, stickyType: StickyType }` | piston push, pull and break rules |
| `Block.getComponent('minecraft:precipitation_interactions')` | `accumulatesSnow()`, `isSnowLoggable()`, `obstructsRain()` | snow and rain rules |
| `Block.getComponent('minecraft:redstone_producer')`, `Block.getRedstonePower()` | `{ power, getConnectedFaces(), getStronglyPoweredFace() }` | redstone output of a placed block |
| `BlockComponentTypes` | `DynamicProperties, FluidContainer, Instrument, Inventory, MapColor, Movable, Piston, PrecipitationInteractions, RecordPlayer, RedstoneProducer, Sign` | which blocks have a container, an instrument sound, a fluid container (cauldron), a record player, a sign; `BlockInventoryComponent.container?.size` gives the slot count |
| `ItemTypes.getAll()` | `ItemType { id, localizationKey }` | the internal item list (1623 at 1.26.51 per the item table) |
| `new ItemStack(type)` then `maxAmount`, `isStackable`, `weight`, `getTags()` | `ItemStack` | stack size, bundle weight and item tags for every item; only 74 items have JSON |
| `ItemStack.getComponent('minecraft:durability')` | `{ maxDurability, damage, unbreakable, getDamageChance(unbreakingLevel), getDamageChanceRange() }` | tool and armor durability and the unbreaking chance curve |
| `minecraft:food` | `{ nutrition, saturationModifier, canAlwaysEat, usingConvertsTo }` | food values for every edible item |
| `minecraft:cooldown` | `{ cooldownCategory, cooldownTicks }` | ender pearl, chorus fruit, shield, goat horn, wind charge cooldowns |
| `minecraft:enchantable` | `{ slots: EnchantmentSlot[] }` plus `canAddEnchantment(enchantment)` | which enchantment slot each item belongs to; the 20 `EnchantmentSlot` members are the engine's slot list |
| `minecraft:potion`, `minecraft:dyeable`, `minecraft:compostable`, `minecraft:inventory`, `minecraft:book` | `ItemComponentTypes` has these ten members | potion effect and delivery per potion item, default dye color, `compostingChance`, bundle `container.size` |
| `EntityTypes.getAll()` | `EntityType { id, localizationKey }` | the spawnable entity list |
| `dimension.spawnEntity(type, location)` then `getComponents()` | `EntityComponentTypes` has 69 members | the engine's view of each entity's components after component groups resolve |
| `minecraft:health`, `minecraft:movement`, `minecraft:underwater_movement`, `minecraft:lava_movement` | `EntityAttributeComponent { currentValue, defaultValue, effectiveMax, effectiveMin }` | max health and movement speed defaults, which `entity/MobStats.ts` hand-codes for 71 mobs |
| `minecraft:scale`, `minecraft:variant`, `minecraft:mark_variant`, `minecraft:skin_id`, `minecraft:color`, `minecraft:color2` | `{ value: number }` | the defaults the client renders from |
| `minecraft:type_family` | `getTypeFamilies(): string[]` | families (`monster`, `undead`, `arthropod`) that targeting and smite use |
| `minecraft:breathable` | `{ totalSupply, suffocateTime, inhaleTime, breathesAir, breathesWater, breathesLava, breathesSolids, generatesBubbles, getBreatheBlocks(), getNonBreatheBlocks() }` | drowning and air supply |
| `minecraft:navigation.*` | `EntityNavigationComponent` with 19 `can*`/`avoid*` booleans | pathfinding capabilities |
| `minecraft:movement.*` | `EntityBaseMovementComponent { maxTurn }` | turn rate per movement type |
| `minecraft:rideable` | `{ seatCount, controllingSeat, interactText, passengerMaxWidth, pullInEntities, riderCanInteract, crouchingSkipInteract, getSeats(): Seat[] (position, minRiderCount, maxRiderCount, lockRiderRotation, seatRotation), getFamilyTypes() }` | seat geometry |
| `minecraft:projectile` | `{ gravity, airInertia, liquidInertia, onFireTime, stopOnHit, shouldBounceOnHit, destroyOnProjectileHurt, hitEntitySound, hitGroundSound, hitParticle, ... }` | projectile physics the JSON expresses partly and the engine completes |
| `minecraft:tameable`, `minecraft:ageable`, `minecraft:healable`, `minecraft:leashable`, `minecraft:strength`, `minecraft:inventory`, `minecraft:equippable`, `minecraft:tamemount`, `minecraft:push_through`, `minecraft:friction_modifier`, `minecraft:flying_speed`, `minecraft:onfire`, `is_*` flags | see the declaration | tame items and probability, growth duration and feed items, heal items with effects, leash distances, strength max, inventory size and container type, armor totals, which flags each type carries |
| `Entity.getAABB()` | `AABB` | the collision box, which `entity/EntitySize.ts` hand-codes for 114 types |
| `Entity.getDynamicProperty`, `getProperty`, `getTags` | | per-entity script and definition properties (`minecraft:has_increased_max_health`, `minecraft:climate_variant`) |
| `EffectTypes.getAll()` | `EffectType { getName() }` | the effect name list; no numeric id, no duration or amplifier semantics |
| `EnchantmentTypes.getAll()` | `EnchantmentType { id, maxLevel }` | max level per enchantment, which no file carries |
| `Potions.getAllEffectTypes()`, `getAllDeliveryTypes()`, `resolve(effect, delivery)` | `PotionEffectType { id, durationTicks? }`, `PotionDeliveryType { id }`, returns `ItemStack` | the potion matrix and base durations |
| `BiomeTypes.getAll()` | `BiomeType { id, getTags(), hasTags() }` | biome string ids and tags; numeric ids come only from `BiomeDefinitionListPacket` |
| `Dimension.getBiome(location)` | `BiomeType` | the biome at any loaded position, which is the handle on BDS biome placement for a given seed |
| `Dimension.calculateClosestBiomeFromSeed(pos, biome)`, `containsBiomes(volume, filter, isSuperset)` | | biome search from the seed without loading chunks |
| `Dimension.getBlock`, `getTopmostBlock(xz, minHeight)`, `getBlocks(volume, options, allowUnloadedChunks)`, `heightRange` | throws `LocationInUnloadedChunkError` or `UnloadedChunksError` when the chunk is not loaded | blocks and heightmap of a generated reference world; `Dimension.isChunkLoaded(location)` says when a read is safe |
| `Dimension.placeFeature(name, location)`, `placeFeatureRule(name, location)` | `boolean` | runs one vanilla feature or rule on demand, which lets a test compare one tree or one ore blob in isolation |
| `world.gameRules` | `GameRules` with 37 typed fields, `GameRule` enum | the default game rule values of a fresh world |
| `world.getDifficulty()`, `world.seed`, `world.getDefaultSpawnLocation()`, `world.getAbsoluteTime()` | | world defaults; `seed` is a string |
| `world.structureManager` | `getPackStructureIds()`, `getWorldStructureIds()`, `get(id): Structure { size, getBlockPermutation(location), getIsWaterlogged() }`, `createFromWorld`, `place`, `placeJigsaw(pool, targetJigsaw, maxDepth, ...)`, `placeJigsawStructure(identifier, ...)` | a block-by-block reader for structure templates. Whether `getPackStructureIds()` lists the 1311 vanilla `.nbt` templates is not verified here; the vanilla behavior pack is a pack, so the first dump run should print the list |
| `world.getLootTableManager()` | `getLootTable(path): LootTable { pools: LootPool[] { rolls, bonusRolls, conditions, entries: LootPoolEntry { weight, quality }, tiers } }`, `LootItem { name, conditions, functions }`, condition and function classes (`KilledByPlayerCondition`, `RandomChanceWithLootingCondition`, `SetItemCountFunction`, `LootingEnchantFunction`, ...), `generateLootFromEntityType(type, tool)`, `generateLootFromBlockPermutation(permutation, tool)`, `generateLootFromTable(table, tool)` | the engine's parsed loot tables, and a sampler that runs the engine's own evaluator as many times as the watchdog allows |
| `world.tickingAreaManager` | `maxChunkCount`, `createTickingArea(id, {dimension, from, to}): Promise<void>`, `TickingArea.isFullyLoaded` | the pack's own chunk budget and a loaded signal (section 4) |
| `system.serverSystemInfo`, `system.currentTick`, `system.runJob(generator)`, `system.run`, `runTimeout`, `waitTicks` | | scheduling; `runJob` spreads work over ticks |
| `BlockVolume`, `ListBlockVolume` | `getBlockLocationIterator()`, `getCapacity()`, `getMin()`, `getMax()` | iteration helpers for `getBlocks` and `fillBlocks` |

Also present: `ItemStack.getRawLore()`, `getCanDestroy()`, `getCanPlaceOn()`, `getDynamicPropertyIds()`; `world.getPackSettings()`; `world.soundDefinitionRegistry`; `world.getAimAssist()`; `Dimension.getLightLevel(location)` and `getSkyLightLevel(location)` (world light at a position, not block emission). The 2.11.0 beta adds `EntityNpcComponent`, `PoiBlockManager` with `PoiBlockType { id, name, tickets, usableRange }` (the villager point-of-interest table), `BannerPattern`, `WorldClock` and chat events; `grep -nE 'hardness|friction|lightEmission|explosionResist|attackDamage|burnOdds'` on the beta finds only the friction modifier entity component.

### What the Script API cannot yield

- Block properties per state: hardness, blast resistance, friction, light emission, light dampening, burn and flame odds, translucency, collision, outline and visual shapes. `Block.getLightLevel()` is the light at the position, not the block's emission.
- Item properties: attack damage, armor value, toughness, enchantment value (enchantability), furnace burn duration, mining speed and tool tier. `ItemComponentTypes` has ten members and none of these.
- Entity properties: `minecraft:attack` damage, knockback resistance, follow range, the loot table path per type (readable from the entity JSON instead), and the AI goal list. `EntityComponentTypes` has no `Attack` or `CollisionBox` member; `getAABB()` covers the box.
- Numeric ids for entities, biomes and effects. Those come from `AvailableActorIdentifiersPacket` and `BiomeDefinitionListPacket` (section 3).
- The network block palette, for the reason the palette README gives: the Script API reports 56957 internal states against 17487 on the wire.

### Dump pack specification

A development behavior pack, `packages/minecraft/datagen/dump-pack/`, in the shape of `palette-pack/`: `manifest.json` (dependency `@minecraft/server` `2.10.0`, `min_engine_version [1, 21, 0]`), one entry script, and JSON lines on the content log with a fixed prefix. It stays on the stable module so the world needs no experiment.

Startup. Work starts in `world.afterEvents.worldLoad`, the first event after the world exists (`system.beforeEvents.startup` is for registering custom components and commands; its `StartupEvent` exposes only registries). The block and entity passes need a loaded chunk: the script creates one ticking area with `world.tickingAreaManager.createTickingArea('dump', { dimension, from, to })` and awaits the promise, which "will return when all the chunks in the area are loaded and ticking" (TickingAreaManager page, updated 2026-03-10). This replaces the 200-tick guess in `place.js`.

Scheduling. Every pass is a generator passed to `system.runJob`, yielding after each type, because `script-watchdog-hang-threshold=10000` (ms) is the default single-tick limit in `server.properties` and `domains.js` runs 1477 types times every candidate value inside one `system.run` callback.

Output channel. `console.warn('DUMP <table> <json>')`, one line per row, as `place.js` and `domains.js` do with `PALETTE`. The binary says "Content logging to console is disabled. Enable it with content-log-console-output-enabled=true in server.properties", and the shipped default is `content-log-console-output-enabled=false` with `content-log-file-enabled=false` and `content-log-level=info`. The job sets `content-log-console-output-enabled=true` and `content-log-file-enabled=true` (the file survives a crash; its location is whatever the server chooses, which the first run records) and filters lines by prefix. `README-palette.md` omits this property; whoever captured 1.26.51 had it on.

Passes and output tables, each a JSONL file after `grep 'DUMP <table>' | sed`:

| Table | Source calls | Row | Rows | Size estimate |
|---|---|---|---|---|
| `block-types` | `BlockTypes.getAll()`, `BlockPermutation.resolve(id)`, `getTags()`, `getItemStack()`, the four liquid methods, `localizationKey` | `{ id, tags, item, localizationKey, water: {contain, blocking, destroyed, spawns} }` | 1477 | 250 KB (Allay's `block_tags.json` is 55 KB for the same tags) |
| `block-domains` | as `domains.js` | `{ name, props: { [p]: { values, default } } }` | 1477 | 331 KB, the size of `snapshot/v2193/block-palette.json` |
| `block-placed` | place each default permutation on stone inside the ticking area, read `getComponents()`, `map_color`, `movable`, `precipitation_interactions`, `inventory?.container?.size`, `getRedstonePower()` | `{ id, components, mapColor, tintMethod, movementType, stickyType, snow, rain, inventorySize }` | 1477 | 300 KB |
| `block-states` | `BlockStates.getAll()` | `{ id, validValues }` | about 200 | 20 KB |
| `items` | `ItemTypes.getAll()`, `new ItemStack(id)`, `maxAmount`, `isStackable`, `weight`, `getTags()`, each of the ten components | `{ id, maxAmount, stackable, tags, durability?, food?, cooldown?, enchantable?, potion?, dyeable?, compostable?, inventorySize? }` | 1623 | 500 KB (Allay's `items.json` is 486 KB for ten numeric fields per item) |
| `enchantments` | `EnchantmentTypes.getAll()` | `{ id, maxLevel }` | about 40 | 2 KB |
| `effects`, `biomes`, `dimensions`, `potions` | the `getAll()` calls, `BiomeType.getTags()`, `Potions.*` | | 89 biomes, about 30 effects | 20 KB |
| `entities` | `EntityTypes.getAll()`, `dimension.spawnEntity(id, center)`, `getComponents()` with every readable field, `getAABB()`, `getTags()`, then `entity.remove()` | `{ id, aabb, components: { [componentId]: fields } }` | 130 types, one row per type plus one per `spawnEvent` variant worth sampling (baby, charged) | 400 KB |
| `loot-tables` | `getLootTableManager().getLootTable(path)` for every path under the composed pack's `loot_tables/` (the paths come from the zip, not the API) | the pool tree with weights, rolls, conditions and function class names | 309 | 600 KB |
| `loot-samples` | `generateLootFromEntityType`, `generateLootFromBlockPermutation` N times per table | `{ table, tool, n, counts: { [item]: [count histogram] } }` | 309 tables times a few tools | 300 KB at N = 2000 |
| `world` | `world.gameRules`, `getDifficulty()`, `seed`, `getDefaultSpawnLocation()`, `structureManager.getPackStructureIds()`, `tickingAreaManager.maxChunkCount` | one row | 50 KB (the structure id list) |

About 3 MB of JSONL per version, 1 MB gzipped. The two existing passes stay as they are: `place.js` writes a world and `extract-block-palette.mjs` reads it; `domains.js` becomes the `block-domains` table of the dump pack.

Entities that refuse to spawn (`EntitySpawnError`) or need a spawn event, and items whose `ItemStack` constructor throws, go into an `errors` table rather than failing the run; the merge step counts them and refuses to publish when the count rises between versions, the way `merge-block-palette.mjs` refuses unknown names.

Durations. `README-palette.md` records no timings. Both existing scripts do their work in one tick after a fixed delay (`BEFORE_PLACING = 200` ticks, 10 s), so each pass costs one boot (2 to 3 s on `ubuntu-24.04` per section 7 of the earlier note) plus 10 s plus the clean `stop`. The go-test-bds run that booted BDS twice and joined a bot took 69 s in total. The dump pack with `runJob` will take longer than one tick; a budget of two minutes per pass is safe until the first CI run records real numbers.

Shutdown. `@minecraft/server-admin` has `dedicatedServer.stopServer()` and `levelStorage.saveHold()/saveQuery()/saveResume()`, but it is `-beta` and therefore behind the Beta APIs experiment. The job keeps the console FIFO and sends `stop` after the `DUMP END` line, as the palette README does.

## 2. Endstone DevTools as an extraction tool

Clone at `/tmp/bds-research-extract/endstone/`, HEAD `bb0475b64744106b328238b3f51d77576ddc6569` (2026-10-12), newest tag `v0.11.14` at `03f4189b1535af0870861748fc569f6deac0ad65`, one commit behind HEAD. `LICENSE` is "Apache License, Version 2.0, January 2004"; `pyproject.toml` classifies it "License :: OSI Approved :: Apache Software License".

### What it dumps

The code lives in `src/endstone/core/devtools/` (`devtools.cpp`, `devtools_command.cpp`, `vanilla_data.cpp`, ImGui and GLFW glue). `exportAll` in `devtools.cpp:629-676` writes eleven files into `<cwd>/data`: `block_types.json`, `block_states.json`, `block_tags.json`, `items.json`, `item_tags.json`, `creative_groups.json`, `biomes.json`, `item_components.nbt`, `block_palette.nbt`, `creative_items.nbt`, `recipes.json`. NBT files are big-endian and gzip-compressed through `zstr::ofstream`. There is no `shapes` or `materials` file at HEAD; CHANGELOG line 853 says "Removed deprecated material from DevTools".

Contents, from `vanilla_data.cpp`:

- `block_types.json` (lines 76-79): `{ name: { "defaultBlockStateHash": <runtimeId>, "tags": [...] } }`.
- `block_states.json` (lines 81-120): one object per permutation, 22 fields. The emitting code reads `block.getDestroySpeed()` for `hardness`, `block.getExplosionResistance()`, `block.getFriction()`, `block.getBurnOdds()`, `block.getFlameOdds()`, `block.getLight()` for `lightDampening`, `block.getLightEmission()`, `block.getThickness()`, `block.getTranslucency()`, `block.isSolid()`, `block.requiresCorrectToolForDrops()`, the water detection rule, the map color at `{0, 10, 0}`, the tint method, and five shapes: `addCollisionShapes` (a list of boxes), `getOutline`, `getVisualShape`, `getUIShape`, `getLiquidClipVolume`, each box as six truncated doubles. Shapes are sampled at `{0, 0, 0}` with a null entity, so context-dependent shapes carry that one context. A row from AllayMC's 1.26.50.5 export:

```json
{"blockStateHash":973836165,"burnOdds":0,"canContainLiquidSource":false,"collisionShape":[[0.0,0.0,0.0,1.0,1.0,1.0]],"explosionResistance":1.25,"flameOdds":0,"friction":0.6,"hardness":1.25,"isSolid":true,"lightDampening":15,"lightEmission":0,"liquidClipShape":[0.0,0.0,0.0,0.0,0.0,0.0],"liquidReactionOnTouch":"BLOCKING","mapColor":"#575c5cff","name":"minecraft:cyan_terracotta","outlineShape":[0.0,0.0,0.0,1.0,1.0,1.0],"requiresCorrectToolForDrops":true,"thickness":0.0,"tintMethod":"None","translucency":0.0,"uiShape":[0.0,0.0,0.0,1.0,1.0,1.0],"visualShape":[0.0,0.0,0.0,1.0,1.0,1.0]}
```

- `items.json` (lines 142-151): `{ name: { id, attackDamage, armorValue, enchantValue, toughnessValue, maxDamage, isDamageable, maxStackSize, furnaceBurnDuration, furnaceXPMultiplier, tags? } }`. This is the item half the Script API lacks.
- `item_components.nbt`: per item `{ components, isComponentBased, version }`, the same tag `ItemRegistryPacket` carries.
- `block_palette.nbt`: `block.getSerializationId()` per permutation, the network palette.
- `creative_items.nbt`, `creative_groups.json`: the creative menu with group index and category.
- `biomes.json` (lines 371-376): `{ name: { "id": <int> } }`, nothing else.
- `recipes.json`: built from `CraftingDataPacketPayload::fromRecipes(level.getRecipes(), false)` (line 223), so it is the packet's content with `netId` per recipe, plus `potionMixes`, `containerMixes` and `materialReducer`.

The commit that produced the AllayMC data notes that upstream declares the five AABBs without initialization (`vanilla_data.cpp:83-86`), so `liquidClipShape` reads uninitialized memory for blocks without a liquid clip volume.

### Headless

No. Every path to `exportAll` is an ImGui menu item inside the GLFW render loop (`devtools.cpp:273-276`):

```cpp
ImGui::SeparatorText("Export");
if (ImGui::MenuItem("Export All")) {
    exportAll(data_dir, data);
}
```

`/devtools` only opens the window (`devtools_command.cpp:21-42`: `setDescription("Opens the DevTools.")`, console only, `devtools::show()`). `render()` calls `glfwInit()`, `glfwGetPrimaryMonitor()` and `glfwCreateWindow(...)` (`devtools.cpp:158-184`) and gives up with "DevTools is currently unavailable." when they fail. There is no environment variable, no `export` subcommand and no Python binding (`grep -rni devtools endstone/ include/` is empty). The dump itself (`VanillaData::get`, `vanilla_data.cpp:380-410`) does not touch the window; it schedules `dumpBlockData`, `dumpItemData`, `dumpRecipes` and `dumpBiomes` on the server thread. Only the file writers are GUI-bound.

Build gating: `CMakeLists.txt:45` `option(ENDSTONE_ENABLE_DEVTOOLS "Build Endstone with DevTools enabled." OFF)`; `conanfile.py:39-41`:

```python
@property
def _with_devtools(self):
    return self.settings.os == "Windows"
```

so Linux wheels never contain DevTools, and CI (`ci.yml`, `ubuntu-22.04` and `windows-2022`) never sets the option. CHANGELOG 0.4.9: "A DevTools to help community projects get necessary data from BDS (currently only available on Windows)." The only 2026 entry is 0.11.14, "Fixed the hidden DevTools window using CPU on Windows."

A Linux CI job therefore needs a fork that enables the option on Linux, adds a non-GUI trigger around `exportAll` (a command, a flag, or a startup export), and either drops the glfw link for that path or runs under Xvfb with Mesa. The dump functions are already window-independent, so the patch is small. The headless build behind AllayMC/BedrockData PR #241 ("Generated with Endstone DevTools "Export All" (headless) against BDS 1.26.40.8 and 1.26.50.5", merged 2026-09-23) is not public: the author's GitHub account has no endstone fork, and `search/issues?q=repo:EndstoneMC/endstone+devtools+headless` returns nothing.

### Install and version pin

`pip install endstone` (`requires-python = ">=3.11"`, wheels for cp311 to cp315, Linux x86_64 only, `manylinux_2_31` so glibc 2.31 or newer; `ubuntu-22.04` and `ubuntu-24.04` runners qualify). The CLI (`endstone/cli/__init__.py:47-75`) takes `-s/--server-folder` (default `bedrock_server`), `-y/--no-confirm/--yes` ("Assume yes as answer to all prompts"), `-r/--remote` (default `https://raw.githubusercontent.com/EndstoneMC/bedrock-server-data/v2`) and `--interactive/--no-interactive`. `base.py:107-174` fetches `<remote>/<release|preview>/<version>/metadata.json`, downloads `binary.linux.url` with a Chrome User-Agent and raises `SHA256 mismatch` on a bad hash. There is no EULA prompt anywhere (`grep -rni eula` is empty); `-y` only skips the download confirmation. On Linux it starts `bedrock_server` with `LD_PRELOAD=libmimalloc.so:libendstone_runtime.so` from the wheel.

The BDS version is a compile-time constant, `src/bedrock/shared_constants.h:31-33`: `MajorVersion = 1; MinorVersion = 26; PatchVersion = 52;`, identical at `v0.11.14`; `scripts/configs/linux.toml:1` says `version = "1.26.52"`. 1.26.51 appears only as a previous version in comments. Endstone follows BDS releases, so a pin to 1.26.51.1 cannot use Endstone HEAD; the job would pin the Endstone release that matched (0.11.x for 1.26.51 per `linux.toml:753`), or move the whole manifest to 1.26.52.

### AllayMC/BedrockData

`README.md` is seven lines: "We use Endstone DevTools to generate the data we need since 1.21.1.03. Check their github repo for details". No scripts, no workflows; 32 version folders from `1.19.81` to `1.26.50.5` under CC0. The newest folder holds the eleven Export All files plus Allay's own `block_property_types.json`; `block_states.json` is 13.5 MB, `recipes.json` 1.4 MB, `items.json` 486 KB. Allay's PR body is the only process record: it names a headless build and two fixes to the dumper. Their `1.26.51.1` statement ("1.26.51.1 [produces identical data] to 1.26.50.5") is useful: the engine data did not change between the two, which matches the empty `vanilla_1.26.51` layer.

## 3. Packet capture

### What a BDS sends that a server must replay or derive

ProxyPass (AGPL-3.0, Java, codec `Bedrock_v2193`, supports `transport: nethernet` and `raknet`) writes these from `DownstreamPacketHandler.java` and `RecipeUtils.java`: `entity_identifiers` (NBT from `AvailableEntityIdentifiersPacket`), `biome_definitions.json` and `stripped_biome_definitions.json`, `data_driven_blocks` (NBT from StartGame block properties), `voxel_shapes.json` (`VoxelShapesPacket`: `names` and `shapes`), `jigsaw_structure_data`, `entity_properties` (`SyncEntityPropertyPacket`), `runtime_item_states.json` and `item_components` (`ItemComponentPacket`), `recipes.json` (`CraftingDataPacket`, including smithing trim data), `creative_items.json`, and `runtime_block_states.mojangson` plus `block_traits.json`. `TestUtils.java:27` excludes `AvailableCommandsPacket` from round-trip testing: "We do too much processing on this packet to make it serialise the same."

The repository's `packages/client/tools/capture-server-data.mjs` records four of these: `ItemRegistryPacket` to `required_item_list.json`, StartGame block properties to `block_definitions.json`, and the raw payloads of `JigsawStructureDataPacket` and `BiomeDefinitionListPacket`. `dump-packets.mjs` writes every packet as `<seq>-0x<id>.bin` with an `index.json`, which is the general tool.

Packets whose payload is data to replay or derive, and the repository's ability to decode them (from `packages/protocol/src/packet/`, the client-side codec, and `packages/prismarine/src/network/packet/`, the server-side one whose `DataPacket.decodePayload()` is a no-op unless overridden):

| Packet | Payload | Client decoder | Server decoder |
|---|---|---|---|
| `ItemRegistryPacket` | item names, runtime ids, component NBT | yes | no |
| `AvailableActorIdentifiersPacket` | entity ids and numeric ids, NBT | no | `readRemaining()` |
| `BiomeDefinitionListPacket` | biome ids, climate, tags | no | `readRemaining()` |
| `JigsawStructureDataPacket` | jigsaw rules, NBT | no | `readRemaining()` |
| `VoxelShapesPacket` | collision shapes and a name-to-shape map (`VoxelShapes { shapes, nameMap, customShapeCount }`) | encoder and test exist, no decoder registered | not sent by this server |
| `CraftingDataPacket` | shaped, shapeless, multi, user-data shapeless, chemistry, smithing transform and trim recipes with net ids; 210 potion mixes; 2 container mixes; material reducers | no | encode only; writes empty lists for mixes and reducers (`CraftingDataPacket.ts:88-98`) |
| `CreativeContentPacket` | creative groups and items with NBT | no | yes |
| `StartGamePacket` | block properties, item table (legacy), experiments, game rules, seed, spawn, movement settings, `serverVersion`, dimension, generator | yes (fixture `__fixtures__/start-game-bds-1.26.51.1.bin`, 73883 bytes) | no |
| `AvailableCommandsPacket` | enum values, chained subcommands, command overloads with parameter types | no | encode only (235 lines) |
| `TrimDataPacket` | armor trim patterns and materials | yes | missing |
| `CameraPresetsPacket` | camera presets | yes | missing |
| `LevelChunkPacket`, `SubChunkPacket` | chunk payloads | yes, payload kept opaque | encode only / missing |
| `UpdateAbilitiesPacket` | default ability layers | no | yes |
| `SetTimePacket`, `GameRulesChangedPacket` | time, rule values | no | yes |
| `ResourcePacksInfoPacket` | pack list (vanilla sends none) | yes | yes |
| `PlayerListPacket` | skins, xuids | no | encode only |
| `AddActorPacket` | `type`, `attributes: Attribute[]`, `metadata: Metadata`, `links` | no | encode only |
| `SetActorDataPacket`, `UpdateAttributesPacket` | metadata and attribute changes | no | encode only / yes |
| `InventoryContentPacket` | item stacks with NBT | no | encode only |
| `UpdateBlockPacket`, `BlockActorDataPacket` | runtime id and layer, block entity NBT | no | yes |
| `CommandRequestPacket`, `CommandOutputPacket` | what the capture client sends and receives | missing / missing | yes / yes |
| `TextPacket` | chat | yes | yes |

The client (`packages/client/src/Client.ts`) registers nine packet classes (`NetworkSettings`, `PlayStatus`, `ServerToClientHandshake`, `Disconnect`, `ItemRegistry`, `ResourcePacksInfo`, `ResourcePackStack`, `StartGame`, `Text`); everything else is reachable as bytes through `client.getSession().on('raw', ({ id, buffer }) => ...)`. Sending goes through `client.getSession().send(packet)`; there is no `CommandRequestPacket` class in `packages/protocol`, so the client cannot run a command today. After `StartGame` it requests a chunk radius of 8 and sends `SetLocalPlayerAsInitialized` on `PlayerSpawn` (`login/LoginSequence.ts`).

### The extended capture

One job, one BDS boot, one client:

1. Server properties: `online-mode=false`, `allow-list=false`, `transport=raknet`, `default-player-permission-level=operator`. The how-to says `permissions.json` keys players by XUID and "online-mode needs to be enabled for this feature to work since xuid requires online verification", so an offline capture client cannot be listed there; the default level, or `op <name>` on the console FIFO, or a dump-pack line `player.commandPermissionLevel = CommandPermissionLevel.Admin` (the property is writable in 2.10.0, `Player` line 17135) are the three routes. `allow-cheats=false` is the shipped default and must become `true` for `/summon`, `/give` and `/setblock` to run.
2. Record every raw packet from login to disconnect, as `dump-packets.mjs` does, and additionally decode the table above where a decoder exists.
3. From the join, record `AvailableActorIdentifiersPacket`, `BiomeDefinitionListPacket`, `JigsawStructureDataPacket`, `VoxelShapesPacket`, `ItemRegistryPacket`, `StartGamePacket`, `CraftingDataPacket`, `CreativeContentPacket`, `AvailableCommandsPacket`, `TrimDataPacket`, `CameraPresetsPacket`, `UpdateAbilitiesPacket`, `SetTimePacket`, `GameRulesChangedPacket`, `PlayerListPacket`, and the first `LevelChunkPacket`s around spawn.
4. Entities: for each id in `entity_identifiers`, send `CommandRequestPacket` `/summon <id> ~ ~1 ~` and record the `AddActorPacket` (`type`, `attributes`, `metadata`, `links`) and any `SetActorDataPacket` or `UpdateAttributesPacket` within the next tick, then `/kill @e[type=<id>]`. The server's `AddActorPacket` encoder already names the fields. Spawning from the dump pack with `dimension.spawnEntity` instead of `/summon` removes the need for the client to send commands, but the client still has to be within view distance to receive the packet.
5. Items: for each name in the item table, `/give @s <name>` and record `InventoryContentPacket` (the stack's NBT, which carries the engine's default tag for the item), then `/clear`.
6. Blocks: for each name in the palette, `/setblock ~ ~2 ~ <name>` and record `UpdateBlockPacket` (the runtime id the server picked, which should equal the FNV-1a hash of the default state) and `BlockActorDataPacket` for blocks with block entities, which is the block-to-block-entity mapping that `blockentity/BlockEntities.ts` lacks today.

Needed code: a `CommandRequestPacket` encoder and `CommandOutputPacket` decoder in `packages/protocol`, decoders for `AddActorPacket`, `SetActorDataPacket`, `UpdateAttributesPacket`, `InventoryContentPacket`, `UpdateBlockPacket`, `BlockActorDataPacket`, `CraftingDataPacket`, `CreativeContentPacket`, `AvailableCommandsPacket`, `AvailableActorIdentifiersPacket`, `BiomeDefinitionListPacket` and `VoxelShapesPacket`, each with a test against the captured bytes as `StartGamePacket.test.ts` does. The raw `.bin` files are the goldens the decoders are tested against, so decoding can land after capturing.

## 4. Reference worlds from BDS

### Deterministic generation

`server.properties` has `level-name=Bedrock level`, `level-seed=` (empty means random), `view-distance=32`, `tick-distance=4` (range `[4, 12]`), `max-threads=8`, `client-side-chunk-generation-enabled=true`. There is no `level-type` key in the 1.26.51.1 file; a flat world needs a prepared `level.dat`, which `packages/prismarine/src/world/providers/leveldb/LevelDat.ts` can write (`encodeLevelDat`, storage version 10, little-endian NBT). The job sets `level-seed` to a fixed value and `client-side-chunk-generation-enabled=false` so the server generates and saves every chunk it loads.

Loading chunks without a player:

- Console: `tickingarea add <from> <to> <name> [preload]` through the FIFO after `Server started.`. Microsoft's limits: "You can have up to 10 ticking areas in one world" and a circle has "a maximum radius of 4 chunks" (https://learn.microsoft.com/en-us/minecraft/creator/documents/tickingareacommand, updated 2025-09-23); "A world can have up to 10 separate ticking areas, each area containing up to 100 chunks" (https://learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide, updated 2025-09-23). The server's `en_US.lang` confirms the failure texts with runtime numbers: `commands.tickingarea-add.failure=Max number of ticking areas (%1$d) has already been reached` and `commands.tickingarea-add.chunkfailure=Ticking area contains more than %1$d chunks`. So the command route gives at most 1000 chunks per world, in ten 10 by 10 chunk squares.
- Script: `world.tickingAreaManager.createTickingArea(id, { dimension, from, to })`. The manager page says these "are limited by a fixed amount of ticking chunks per pack independent of the command limits", `maxChunkCount` is "The maximum number of allowed ticking chunks", and `hasCapacity` "Will also return false if the length or width exceeds the 255 chunk limit". The value of `maxChunkCount` is not documented; the dump pack's `world` table prints it.
- Entities with `minecraft:tick_world` are the third route and have no documented count limit; a `tickingarea.entitycount` message exists for them.

Knowing when a chunk is generated:

- `createTickingArea` returns a promise that resolves "when all the chunks in the area are loaded and ticking", and `TickingArea.isFullyLoaded` is readable at any time.
- `Dimension.isChunkLoaded(location)` answers per position; `getBlock` throws `LocationInUnloadedChunkError` before that, and `getBlocks(volume, options, allowUnloadedChunks)` throws `UnloadedChunksError` unless told to skip.
- Commands: `/schedule on_area_loaded add tickingarea <name> <function>` runs a function "to make the game wait for chunks and entities to be loaded" (same page). The function can print a marker with `/say` or `/scriptevent`, which the Script API receives as `system.afterEvents.scriptEventReceive`.
- On disk, the `FinalizedState` record (tag `0x36`) is `2` for a chunk the generator has finished; the repository's provider writes that value itself (`LevelDB.ts`, `FinalizedState` set to 2).

After the marker, send `stop` through the FIFO and wait for the process to exit; the palette README's warning stands: "type `stop`, do not kill it, or the world is never written."

### Reading the world

`packages/leveldb` is pure TypeScript, reads compression types 0, 1, 2 and 4 and writes 4 ("what the game itself writes" per its README), handles `.ldb` and `.sst` tables, `MANIFEST-*` and `CURRENT`, and opens with `Database.open(dir, { readOnly: true })`. The provider in `packages/prismarine/src/world/providers/leveldb/` builds keys as `x int32 LE, z int32 LE, [dimension int32 LE], tag byte, [subchunk int8]` (`LevelDBKeys.ts:66-84`) with `Data3D = 0x2b`, `Version = 0x2c`, `SubChunkPrefix = 0x2f`, `BlockEntity = 0x31`, `FinalizedState = 0x36`; decodes subchunk versions 1, 8 and 9 (`SubChunkCodec.ts`, version 9 carries the signed y index byte); reads persistent palettes as little-endian NBT `{ name, states, version }` with `BLOCK_STATE_VERSION = 18163713`; and has `BiomeCodec.ts` for the 3D biome palettes in `Data3D`, which also holds the 512-byte heightmap. `VanillaWorld.test.ts` runs against a real game world when one is present at `.test/worlds/vanilla-1.21.40/` or `JSP_VANILLA_WORLD`, and is skipped otherwise; a BDS 1.26.51.1 reference world is the fixture that test has been missing.

`packages/minecraft/datagen/extract-block-palette.mjs` reads the same subchunks and needs two fixes before the reference-world reader reuses it: it `break`s when `bitsPerBlock === 0`, so a uniform storage's single palette entry is skipped, and it opens the database without `readOnly`, so it takes the lock and may write.

### Budget

No public measurement of BDS chunk generation throughput exists. The closest data is EndstoneMC/bedrock-bench and Endstone's `BENCHMARK.md`: vanilla BDS 1.26.52 on Linux (Docker on WSL2, Intel i7-14700F performance cores) with 100 players at view distance 10 and client-side generation on reached a median "view load time" of 194 s at 9.46 TPS, where "the other servers do not support client-side chunk generation, so they send about 450 chunks to each player, where Endstone sends about 100". That is a loaded server on a desktop CPU, not a generation rate. The go-test-bds run on `ubuntu-24.04` observed a bot join 15 s after the first `Server started`, which includes generating the spawn area at the default view distance. A planning assumption for a 4-vCPU hosted runner is 10 to 50 chunks per second, so a 1000-chunk reference world takes 20 s to 2 min; the first run prints `createTickingArea` resolution times per area and replaces the assumption.

## 5. The parity test suite

Two layers. The reference layer boots BDS and writes goldens (sections 1, 3 and 4). The test layer is Vitest in this repository and reads only the goldens, so it runs on every pull request on every OS without a BDS. The existing precedents are `packages/protocol/src/packet/StartGamePacket.test.ts` (a raw capture as fixture) and `packages/prismarine/src/block/state/VanillaCatalog.test.ts` (the only `toMatchSnapshot` in the repository).

### Comparisons

(a) Registries. Every entity, item, block, biome, effect and enchantment name in the goldens exists in ours with the same numeric id and tags: entities from `entity_identifiers` (name, numeric id) and the dump pack `entities` table (tags, families); items from `required_item_list.json` and the `items` table (`maxAmount`, tags); blocks from `block-palette.json` and `block-types` (tags, item, water rules); biomes from the `BiomeDefinitionListPacket` payload (numeric id) and the `biomes` table (tags); effects and enchantments from their tables. One test per registry, reporting missing names, extra names and mismatches as three lists, so a PR that adds a block shows up as one fewer missing name.

(b) Block properties. Hardness, blast resistance, friction, light emission and dampening, burn and flame odds, `isSolid`, `requiresCorrectToolForDrops`, map color and the five shapes per state, against `block_states.json` from the out-of-game dump (CloudburstMC's `blocks.json` in the submodule today, Endstone's when a headless build exists). Keyed by `blockStateHash`, which equals our FNV-1a runtime id, so a mismatch names the exact state. Float fields compare with a tolerance of `1e-6` because the dumper truncates to six decimals. `VoxelShapesPacket` from the capture cross-checks the collision shapes once its decoder lands.

(c) Items. Durability, stack size, components, enchantability and food values against the `items` table (Script API) and `items.json` (dump) where the two sources overlap; the test asserts the two sources agree with each other first, which catches a dump taken from the wrong version.

(d) Recipes. BDS's `recipes.json` from the capture (Endstone's `recipes.json` is the same packet) carries net ids that are not file order: in the 1.26.50.5 data net id 1 is `minecraft:black_concrete_slab` and the shapeless list starts at 1300, with 4768 unique ids across six lists (2068 shapeless, 1217 shaped, 1456 user-data shapeless, 14 multi, 12 smithing transform, 1 smithing trim). The order follows the engine's recipe registry, which no file reproduces, and net ids only have to be unique within one session, so the comparison is by recipe id: same set of ids per list, same ingredients, pattern and result per id, same 210 potion mixes and 2 container mixes. Ours has 1967 recipes and writes the mix lists empty, so this test starts red for the user-data shapeless list and the mixes, which is the point of a parity dashboard.

(e) Loot. BDS RNG is not reproducible, so there is no byte comparison. Two tests instead: the structural one compares our parsed loot table (pools, rolls, weights, condition and function names) with the `loot-tables` table the Script API returned, which is what the engine parsed from the same JSON; the distributional one runs our evaluator N times with a fixed seed and compares item frequencies with the `loot-samples` table from `generateLootFromEntityType` run N times in BDS, with a chi-squared test at a fixed significance and N large enough (2000 per table in the estimate above) that a wrong weight fails and sampling noise passes.

(f) Entities. Spawn each type in both servers and compare the `AddActorPacket`: attribute names, `min`, `max`, `default` and `current` values, metadata keys and values with the engine defaults, and the `AABB` from the dump against our `EntitySize`. Volatile fields (runtime ids, positions, the spawn tick) are masked before comparison. Each entity is one test case, so the dashboard reads per family.

(g) World generation. Another note covers the generator itself; the suite compares the same seed in both worlds through LevelDB keys, not packets: per chunk, the `Data3D` heightmap and biome palettes, the `SubChunkPrefix` palettes and block arrays, the `FinalizedState`, and the `BlockEntity` list. The golden stores per chunk a sha256 of the canonical subchunk bytes, a sha256 of the biome array, the heightmap, and the palette as a sorted name list; raw chunks are kept for a 4 by 4 sample. Tolerances are per pass: biome ids exact; heightmap within a configured delta per column with a maximum fraction of differing columns; palette as set containment (ours must not contain a block the reference chunk lacks, with a per-pass allow list for decoration that depends on RNG); block arrays compared only for terrain passes the generator claims to match. `Dimension.getBiome` from the dump pack gives the same biome grid without decoding `Data3D`, which doubles as a check on `BiomeCodec.ts`.

(h) Command grammar. Decode the captured `AvailableCommandsPacket` and ours into the same model (enums with sorted values, commands with overloads and parameter types) and diff the models, not the bytes, for the reason ProxyPass excludes this packet from byte round trips. The first version of the test asserts only the set of command names and the enum values; overload equality follows when the server's grammar is data-driven.

### Running in CI

- Per pull request: a Vitest project (`packages/parity/` or a `vitest.config.ts` beside the goldens) that runs in the existing `test.yml` matrix. It reads goldens from the repository and from `packages/bedrock-data/src/jsp/`, needs no network and no BDS, and finishes in seconds. A failing comparison is a failing test; expected gaps are declared in an allow list file beside the test with a reason per entry, so the dashboard can count them.
- On version bump, and weekly: a Linux job that downloads the pinned zip (section 6), runs the dump pack, the extended capture and the reference world, writes the goldens, and opens a pull request when anything changed. The weekly run catches Mojang re-uploading a version or pulling it. The job is not a turbo task; it is a workflow with a script in `packages/minecraft/datagen/` so that it runs the same way locally with `JSP_BDS_PATH`.
- Golden storage: JSON tables under `packages/bedrock-data/src/jsp/` and `packages/minecraft/datagen/snapshot/` as today, about 3 MB for the dump pack, 1 to 2 MB for the decoded packet tables, and the raw `.bin` captures only for the packets that have decoder tests. The out-of-game `block_states.json` is 13.5 MB because every permutation repeats five shapes; storing shapes once in a shape table and referencing them by index brings it under 3 MB. World goldens are hashes plus a sample, about 200 KB for 1000 chunks. GitHub warns above 50 MiB per file and blocks above 100 MiB, so no golden approaches that.
- Dashboard: the Vitest JSON reporter (`vitest run --reporter=json`) feeds a script that groups tests by family (`registry.entities`, `blocks.hardness`, `recipes.shaped`, `entities.zombie`) and writes a Markdown table of passed, failed and allow-listed counts per family to `$GITHUB_STEP_SUMMARY` on every run and to `docs/parity.md` from the weekly job. The test names carry the family as a prefix so the grouping is a string split, not a mapping file.

## 6. Caching and reproducibility

- Manifest. Extend `packages/minecraft/datagen/manifest.json`, which already pins the protocol docs by release and sha256, with a `bedrockServer` object: `version`, `url`, `sha256` (`ad91d3b824e51ea50b5bb601c295cbd8f543a29b14315c2ad89ff27311e2d860` for the Linux 1.26.51.1 zip), the Bedrock-OSS `sha1` as a cross-check, and the `@minecraft/server` version the dump pack declares. The fetch script refuses a hash mismatch, as Endstone's `base.py` does.
- Cache. `actions/cache` keyed `bds-${version}-${sha256}`, path `node_modules/.cache/jsprismarine/bds/<version>/` (the extracted tree, not the zip, so the unzip step is cached too). GitHub's limits: "GitHub will remove any cache entries that have not been accessed in over 7 days" and "the total size of all caches in a repository is limited. By default, the limit is 10 GB per repository". A 95 MB zip extracted to about 330 MB fits; the weekly run keeps it warm. The pnpm store cache in `.github/common/install/action.yml` uses the same action and key style.
- When Mojang pulls a version. The earlier note found versions back to 1.18 still download with no retention promise. The derived outputs are committed, so a missing zip only blocks regeneration, never the build or the tests. The fetch script prints the links API's current version next to the pinned one so the failure message says what to bump to. Mirroring the zip is not an option under the EULA, so the recovery is a pin forward plus a golden refresh, which is what the version-bump job does anyway.
- Detecting that a new release changed data. Hash the composed behavior pack per folder (`entities`, `items`, `blocks`, `biomes`, `recipes`, `loot_tables`, `features`, `feature_rules`, `structures`, `trading`, `spawn_rules`) after layer composition, and write `pack-hashes.json` next to the goldens. On a bump, a changed folder hash tells which generators must rerun and which goldens to expect to move; an unchanged hash with changed goldens points at the engine, as the empty `vanilla_1.26.51` layer with identical AllayMC data did. The dump pack's and capture's own outputs are hashed the same way.
- turbo. `turbo.json` caches `build` with outputs `**/dist/**`, `**/docs/**` and `**/src/generated/**`; `inputs` is unset, so turbo hashes all tracked files. A generator task that reads the BDS tree must declare `inputs: ["$TURBO_DEFAULT$", "datagen/manifest.json", "datagen/dump-pack/**"]` so that a manifest change invalidates it, and must not list the BDS tree, which lives outside the package in `node_modules/.cache/` (turbo's `inputs` are "file glob patterns relative to the package's package.json"). The fetch itself is a separate task with `cache: false`, like `clean`, since its output is outside the tree and turbo's `cacheDir` (default `.turbo/cache`) only stores declared outputs. The weekly job runs it with `--force`; the per-PR job never runs it.

## Open questions

- `TickingAreaManager.maxChunkCount` and the per-area chunk limit the command enforces are runtime numbers; the docs give 10 areas and 100 chunks, and the first CI run should log both.
- Whether `StructureManager.getPackStructureIds()` lists the 1311 vanilla templates on a BDS, and whether `Structure.getBlockPermutation` works for them, is not verified.
- Whether `EntityTypes.getAll()` includes `minecraft:player` and the non-spawnable types in `entity_identifiers` (it would change the registry test's expected set).
- `VoxelShapesPacket`'s `nameMap` keys: block names, shape names, or both. A decoded capture answers it.
- How long the dump pack's `runJob` passes take under the watchdog defaults, and whether `script-watchdog-slow-threshold=10` warnings become errors with `script-watchdog-enable-shutdown=true`.
- Whether the `@minecraft/server-admin` module (always `-beta`) really needs the Beta APIs experiment on a BDS, or whether `permissions.json`'s allow list is enough. The versioning page says experiment; nothing BDS-specific contradicts it. The FIFO `stop` avoids the question.
- How to enable an experiment in a BDS world without a client: the repository's `LevelDat.ts` has no `experiments` field yet, and BDS has no property for it.
- The BDS `FinalizedState` value for a fully generated and decorated chunk at 1.26.51.1 (the provider writes 2; whether BDS uses the same value for its own chunks needs one reference world).
- Whether a public headless Endstone DevTools build will appear, or whether this project maintains the patch.

## Reproduction

```
# Script API declarations for BDS 1.26.51.1 (read, do not install)
mkdir -p /tmp/bds-research-extract/npm && cd /tmp/bds-research-extract/npm
npm view @minecraft/server versions --json | python3 -I -c "import json,sys; v=json.load(sys.stdin); print([x for x in v if '1.26.5' in x][-6:])"
npm pack @minecraft/server@2.10.0 @minecraft/server@2.11.0-beta.1.26.51-stable \
  @minecraft/server-gametest@1.0.0-beta.1.26.51-stable @minecraft/server-admin@1.0.0-beta.1.26.51-stable \
  @minecraft/debug-utilities@1.0.0-beta.1.26.51-stable
for t in *.tgz; do mkdir -p "${t%.tgz}" && tar -xzf "$t" -C "${t%.tgz}"; done
grep -nE 'static (getAll|resolve)\(' minecraft-server-2.10.0/package/index.d.ts
grep -nE 'hardness|friction|lightEmission|explosionResist|attackDamage' minecraft-server-2.11.0-beta.1.26.51-stable/package/index.d.ts

# BDS facts used above
cat /tmp/bds-research/bds/extracted/config/default/permissions.json
grep -nE '^(content-log-[a-z-]+|level-seed|allow-cheats|default-player-permission-level|client-side-chunk-generation-enabled)=' /tmp/bds-research/bds/extracted/server.properties
strings -n 8 /tmp/bds-research/bds/extracted/bedrock_server | grep -E 'Content logging to console'
grep -E 'commands\.tickingarea-add\.(failure|chunkfailure)' /tmp/bds-research/bds/extracted/resource_packs/vanilla/texts/en_US.lang

# Endstone DevTools
git clone -q --filter=blob:none https://github.com/EndstoneMC/endstone /tmp/bds-research-extract/endstone
git -C /tmp/bds-research-extract/endstone rev-parse HEAD
sed -n 629,676p /tmp/bds-research-extract/endstone/src/endstone/core/devtools/devtools.cpp
sed -n 81,120p /tmp/bds-research-extract/endstone/src/endstone/core/devtools/vanilla_data.cpp
grep -n '_with_devtools' -A2 /tmp/bds-research-extract/endstone/conanfile.py
sed -n 31,33p /tmp/bds-research-extract/endstone/src/bedrock/shared_constants.h

# AllayMC data and BDS recipe net id order
git clone -q --depth 1 https://github.com/AllayMC/BedrockData /tmp/bds-research-extract/allay
head -c 1500 /tmp/bds-research-extract/allay/1.26.50.5/block_states.json
python3 -I -c "import json; d=json.load(open('/tmp/bds-research-extract/allay/1.26.50.5/recipes.json')); print(sorted((r['netId'], r['id']) for r in d['shaped'])[:3], len(d['potionMixes']), len(d['containerMixes']))"
gh api repos/AllayMC/BedrockData/pulls/241 --jq '.body'

# ProxyPass dumps
git clone -q --depth 1 https://github.com/CloudburstMC/ProxyPass /tmp/bds-research-extract/proxypass
grep -rn 'saveJson\|saveNBT\|saveCompressedNBT' /tmp/bds-research-extract/proxypass/src/main/java | grep -oE '"[a-z_]+(\.json|\.nbt)?"' | sort -u

# Microsoft docs quoted
curl -sS -L -A "Mozilla/5.0" https://learn.microsoft.com/en-us/minecraft/creator/documents/tickingareacommand | grep -oE 'up to 10 ticking areas[^.]*\.'
curl -sS -L -A "Mozilla/5.0" https://learn.microsoft.com/en-us/minecraft/creator/documents/simulationrenderdistanceguide | grep -oE 'each area containing up to 100 chunks'
curl -sS -L -A "Mozilla/5.0" https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/tickingareamanager | grep -oE 'Promise will return when[^.]*\.'
curl -sS -L -A "Mozilla/5.0" https://learn.microsoft.com/en-us/minecraft/creator/documents/scriptversioning | grep -oE 'In order to use -beta APIs[^.]*\.'
```
