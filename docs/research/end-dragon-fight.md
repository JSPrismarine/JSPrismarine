# The End dragon fight: mechanics, repo audit, and the Bedrock wire

What it takes to make the game beatable: spike pillars with crystals, the exit portal podium, a
killable ender dragon, the portal opening on its death, the credits, and the four-crystal respawn.
Java mechanics are read with `javap -p -c` (temurin 27) from the pinned unobfuscated 26.3 server
jar at `node_modules/.cache/jsprismarine/java-server/26.3/server.jar` (classes under
`META-INF/versions/26.3/`); each claim names the class and method. Repo claims carry file and line.
Wiki claims are marked as such. The plan that executes this is
[docs/plans/end-dragon-fight.md](../plans/end-dragon-fight.md).

Naming: 26.3 renamed the classes this note was commissioned under. The fight class is
`EnderDragonFight` (not `EndDragonFight`), the respawn enum is `DragonRespawnStage` (not
`DragonRespawnAnimation`), and the pillar feature is `EndSpikeFeature` (`SpikeFeature` is an
unrelated generic feature).

## 1. The fight state and its persistence

`EnderDragonFight` extends `SavedData` with type id `minecraft:ender_dragon_fight`; since 26.x it
is no longer a `DragonFight` compound in `level.dat`. `LegacyDragonFightFix` migrates the old
`level.dat` `DimensionData."1".DragonFight` compound (with the CamelCase tags `DragonKilled`,
`PreviouslyKilled`, `DragonUUID`, `IsRespawning`, `ExitPortalLocation`, `Gateways`,
`NeedsScanning`) into it. The 26.3 codec fields (`EnderDragonFight.lambda$static$0`):

| Field | Type | Default |
| --- | --- | --- |
| `needs_state_scanning` | bool | true |
| `dragon_killed` | bool | false |
| `previously_killed` | bool | false |
| `respawn_stage` | optional enum `start`, `preparing_to_summon_pillars`, `summoning_pillars`, `summoning_dragon`, `end` | absent |
| `respawn_time` | int | 0 |
| `dragon_uuid` | optional UUID int array | absent |
| `exit_portal_location` | optional BlockPos | absent |
| `gateways` | list of int | [] |
| `respawn_crystals` | list of entity references (UUIDs) | [] |

`ServerLevel.<init>` creates the fight with `init(level, seed, BlockPos.ZERO)` only when the
dimension type has `hasEnderDragonFight()` (the End's type does; the repo already parses that flag
at `packages/worldgen/src/dimension/DimensionType.ts:33` and
`packages/prismarine/src/world/vanillaDimensionTypes.ts:162`). `init` fills an empty `gateways`
with 0..19 shuffled by `Util.shuffle` over `RandomSource.createThreadLocalInstance(worldSeed)`
(Java's 48-bit LCG; shuffle swaps `[i-1]` with `[nextInt(i)]` for i from size down to 2).

Constants (`EnderDragonFight`, `javap -constants`): `MAX_TICKS_BEFORE_DRAGON_RESPAWN` 1200,
`TIME_BETWEEN_CRYSTAL_SCANS` 100, `TIME_BETWEEN_PLAYER_SCANS` 20, `ARENA_SIZE_CHUNKS` 8,
`ARENA_TICKET_LEVEL` 9, `GATEWAY_COUNT` 20, `GATEWAY_DISTANCE` 96, `DRAGON_SPAWN_Y` 128,
`END_PODIUM_LOCATION` = (0, 0, 0), so the podium column is x 0, z 0.

Bedrock stores the same fight per level in the LevelDB key `TheEnd`, whose payload the wiki's
Bedrock level format page leaves undocumented (https://minecraft.wiki/w/Bedrock_Edition_level_format;
the repo's storage note agrees at `docs/research/storage-and-chunk-translation.md:372`). A real
dump published at github.com/tutinoko2048/ScriptAPI-tests (`files/leveldb_keys/TheEnd.json`) has
the shape `{ data: { DragonFight: { DragonFightVersion (byte), DragonKilled, DragonSpawned,
DragonUUID (long, -1), Gateways (20 ints), IsRespawning, PreviouslyKilled }, LimboEntities: [] } }`,
and PowerNukkitX reads and writes an `ExitPortalLocation` int list in the same compound
(`EndDragonFight.java:105-122`). Treat the exact shape as third-party evidence, not verified
against a vanilla save here.

## 2. Tick, scan and the exit portal

`EnderDragonFight.tick`: the boss bar is visible while `!dragonKilled`; every 20 ticks
`updatePlayers` adds players matching `validPlayer` (alive and within 192.0 of
(0, 128, 0)) and removes the rest. While the bar has players it keeps a chunk ticket at (0, 0)
radius 9 and returns unless the arena chunks are loaded. Then: run `scanState()` once when
`needs_state_scanning`; while a respawn stage is set, resolve `respawn_crystals`, abort if none
are alive, else `stage.tick(level, this, crystals, respawnTime++)`; while `!dragonKilled`, call
`findOrCreateDragon` when the UUID is null or the dragon has not been seen for 1200 ticks, and run
`updateCrystalCount` every 100 ticks.

`scanState` (EnderDragonFight.scanState): `hasActiveExitPortal` scans chunks within 8 of the
origin for any `TheEndPortalBlockEntity`; found means `previouslyKilled = true`, otherwise
`previouslyKilled = false` and when `findExitPortal()` is also null it calls
`spawnExitPortal(false)` (inactive podium). Then `level.getDragons()`: none means
`dragonKilled = true`, else it adopts the first dragon's UUID. Finally, when `!previouslyKilled`
and no dragon exists, `dragonKilled` flips back to false, so `tick` spawns the first dragon
through `createNewDragon`: spawn reason EVENT, phase HOLDING_PATTERN, `snapTo(0, 128, 0,
yaw = random * 360, 0)` (EnderDragonFight.createNewDragon).

`findExitPortal` matches a `BlockPattern` of bedrock built in the constructor: 5 aisles of 7x7
with the center column in aisles 0..2, the open ring (`  ###  `, ` #   # `, `#     #`,
`#  #  #`, `#     #`, ` #   # `, `  ###  `) in aisle 3, and the filled ring in aisle 4; the
portal location is the pattern's block (3, 3, 3). It tries the pattern at every end portal block
entity within 8 chunks, then scans (0, y, 0) from the MOTION_BLOCKING heightmap down to the
floor. `spawnExitPortal(active)` resolves a missing location from the MOTION_BLOCKING_NO_LEAVES
heightmap at (0, 0) `.below()`, steps down through bedrock while y > 63, clamps to minY + 1, and
places `END_PODIUM_ACTIVE` or `END_PODIUM_INACTIVE` there.

`EndPodiumFeature.place` (constants PODIUM_RADIUS 4, PODIUM_PILLAR_HEIGHT 4, RIM_RADIUS 1,
CORNER_ROUNDING 0.5) loops the box (ox - 4, oy - 1, oz - 4) to (ox + 4, oy + 32, oz + 4) and only
touches positions with squared distance under 12.25 from the origin (closerThan 3.5). Below the
origin layer (y = oy - 1): bedrock inside squared distance 6.25 (closerThan 2.5), end stone on the
ring outside it. Above: air. On the origin layer: the ring outside 2.5 is bedrock (the 16 rim
cells) and the inside is `END_PORTAL` when active and `AIR` when inactive (20 portal cells once
the center is replaced). Then a bedrock pillar at origin.above(0..3) and a wall torch facing each
cardinal at origin.above(2).relative(dir). Active placement destroys replaced blocks with drops
(EndPodiumFeature.place, `dropPreviousAndSetBlock`). The repo's `end_podium` feature at
`packages/features/src/features/structural.ts:983-1010` implements a podium with an `active` flag;
an implementer must verify it against this exact shape.

## 3. Killing the dragon

`EnderDragon.createAttributes`: MAX_HEALTH 200.0. The hitbox is 16 x 8; parts are head 1x1, neck
3x3, body 5x3, three 2x2 tail segments and two 4x2 wings (`EnderDragonPart`, `EnderDragon`
part setup). `EnderDragonPart.hurtServer` forwards to `EnderDragon.hurt(part, source, amount)`:
the DYING phase ignores damage; a part that is not head or neck takes `amount / 4 + min(amount, 1)`;
damage below 0.01 is dropped; and damage counts only when the attacker is a player or the source
is in `#always_hurts_ender_dragons` (= `#is_explosion`), so an arrow counts only when a player
shot it. `addEffect` and `canRide` return false and `canUsePortal` is false.

`tickDeath` (EnderDragon.tickDeath): death time counts to 200 while the body rises 0.1 per tick;
at death tick 1 a global level event 1028 plays; XP is 12000 on the first kill and 500 after
(`sipush 12000` / `sipush 500`, gated on `fight.hasPreviouslyKilledDragon()`); from tick 155 to
200 every 5th tick awards `floor(xp * 0.08)` (ten payments) and tick 200 awards
`floor(xp * 0.2)`, totalling 9600 + 2400 = 12000, then calls `fight.setDragonKilled` and removes
the dragon. `checkCrystals` heals the dragon 1 HP every 10 ticks while a `nearestCrystal` within
32 blocks is alive, re-picked at random.

`setDragonKilled` (EnderDragonFight.setDragonKilled), in order: boss bar progress 0 and hidden;
`spawnExitPortal(true)`; `spawnNewGateway()`; when `!previouslyKilled`, place `DRAGON_EGG` at the
MOTION_BLOCKING heightmap position above (0, 0), which is the top of the podium's bedrock pillar;
then `previouslyKilled = true`, `dragonKilled = true`.

`spawnNewGateway` pops the last index i from the shuffled list and places
`EndFeatures.END_GATEWAY_DELAYED` at `(floor(96 * cos(2 * (-PI + 0.15707963267948966 * i))), 75,
floor(96 * sin(...)))` after level event 3000. Gateway teleporting lives in
`TheEndGatewayBlockEntity` (spawn time 200, cooldown 40, exit search up to 1024 blocks out in
16-block steps, places an island and a return gateway). This note recommends deferring gateway
teleports: the game is beatable without them, the block entity logic is self-contained, and the
fight only needs the gateway blocks placed so a later slice can animate them.

## 4. End crystals

`EndCrystal` (net.minecraft.world.entity.boss.enderdragon.EndCrystal): fire immune, 2.0 x 2.0,
no loot table. Synced data: `DATA_BEAM_TARGET` (optional BlockPos, default empty) and
`DATA_SHOW_BOTTOM` (bool, default true); NBT tags `beam_target` and `ShowBottom`. Each tick in a
dimension with a dragon fight it sets fire in its own block when that block is air
(EndCrystal.tick). `hurtServer`: invulnerable crystals and hits from the dragon are ignored;
any other damage removes the crystal and, unless the source is already in `#is_explosion`,
explodes at power 6.0 with no fire (EndCrystal.hurtServer, `ldc 6.0f`), then `onDestroyedBy`
forwards to `EnderDragonFight.onCrystalDestroyed`: a respawn crystal aborts the respawn
(`abortRespawnSequence`: stage null, `resetSpikeCrystals`, `spawnExitPortal(true)`), anything
else updates the crystal count and calls `EnderDragon.onCrystalDestroyed`, which hurts the
dragon's head for 10.0 when its `nearestCrystal` died.

## 5. The ten spike pillars

`EndSpikeFeature.getSpikesForLevel`: the cache key is
`RandomSource.createThreadLocalInstance(worldSeed).nextLong() & 65535`; a Guava cache holds the
result for 5 minutes. `SpikeCacheLoader.load`: shuffle 0..9 with a random seeded by that key; for
i in 0..9 the center is `(floor(42 * cos(2 * (-PI + 0.3141592653589793 * i))),
floor(42 * sin(...)))`, giving (42,0), (33,24), (12,39), (-13,39), (-34,24), (-42,-1),
(-34,-25), (-13,-40), (12,-40), (33,-25); with n = shuffled[i], radius = 2 + n/3,
height = 76 + 3n, guarded when n is 1 or 2. `placeSpike`: obsidian where
dx^2 + dz^2 <= r^2 + 1 below the height, air above y 65 up to height + 10; guarded spikes get an
iron-bar cage for dx, dz in -2..2 and dy in 0..3 at the top where |dx| == 2, |dz| == 2 or
dy == 3; then an END_CRYSTAL spawns at (cx + 0.5, height + 1, cz + 0.5) with
`beam = crystalBeamTarget` and `invulnerable = crystalInvulnerable` from the configuration,
bedrock is set at the crystal's block below (y = height) and fire at the crystal's block.
The vanilla configured feature `end_spike.json` carries `"spikes": []`; an empty list means
"derive from the seed" (EndSpikeFeature.place calling getSpikesForLevel). Worldgen placement uses
`crystalInvulnerable = false`; only the respawn animation re-places spikes with invulnerable
crystals.

## 6. The respawn sequence

`EndCrystalItem.useOn` places a crystal only on obsidian or bedrock whose block above is empty
and with no entities inside (x..x+1, y+1..y+3, z..z+1); it spawns at (x + 0.5, y + 1, z + 0.5)
with `setShowBottom(false)`, then calls `tryRespawn` when the level has a dragon fight. On
Bedrock the wiki adds that the four crystals may sit one block further out and must be centered
on each side, and that the whole sequence lasts 604 ticks and deletes a dragon egg still on the
podium (wiki claims: https://minecraft.wiki/w/Ender_Dragon, https://minecraft.wiki/w/End_Crystal).
PowerNukkitX checks the four cells at portal offsets (0, 3), (-3, 0), (0, -3), (3, 0)
(`EndDragonFight.java:218-222`).

`tryRespawn` (EnderDragonFight.tryRespawn): requires `dragonKilled` and no stage. With
`p = exitPortalLocation.above(1)`, for each horizontal direction it collects `EndCrystal`
entities in the 1x1x1 cell `AABB(p.relative(dir, 3))`, so the four cells are (+-3, py + 1, 0)
and (0, py + 1, +-3) relative to the portal location; any empty cell returns early.
`respawnDragon(list)` then rewrites every bedrock or end portal block inside each pattern match
to end stone (wiping the old podium), sets stage START with `respawn_time` 0, rebuilds the
inactive podium with `spawnExitPortal(false)`, and stores the crystals as `respawn_crystals`.

`DragonRespawnStage` stages (classes `$1`..`$5`; t = respawnTime, reset to 0 per stage):

| Stage | Length | What it does |
| --- | --- | --- |
| `START` | 1 tick | sets every respawn crystal's beam to (0, 128, 0), advances |
| `PREPARING_TO_SUMMON_PILLARS` | 100 ticks | level event 3001 (dragon summon roar) at t 0, 50, 51, 52 and >= 95 |
| `SUMMONING_PILLARS` | 400 ticks (40 per pillar) | per spike from `getSpikesForLevel` order: at t%40 == 0 beams target (cx, height + 1, cz); at t%40 == 39 the box (cx +-10, height +-10, cz +-10) is cleared, an explosion of power 5.0 fires at the top, and `EndSpikeFeature` re-places that one spike with `crystalInvulnerable = true` and beam target (0, 128, 0) |
| `SUMMONING_DRAGON` | 100 ticks | at t 0 beams point at (0, 128, 0); level event 3001 at t 1..4 and 80..99; at t 100: stage END, which runs `createNewDragon`, `resetSpikeCrystals` (pillar crystals become vulnerable, beams cleared), then each respawn crystal's beam clears, it explodes at power 6.0 (no block damage) and is discarded |
| `END` | terminal | nothing; `setRespawnStage(END)` nulls the stage and clears `dragonKilled` |

Removing any respawn crystal before END aborts (section 4). The wiki describes the same
four-crystal placement and sequence for Bedrock (https://minecraft.wiki/w/Ender_Dragon#Respawning,
wiki claim); whether Bedrock accepts the crystals with portal blocks absent is unverified.

## 7. Credits and the End exit

`EndPortalBlock.entityInside`: in the End, a `ServerPlayer` with `!seenCredits` gets
`showEndCredits()`; everyone else travels. `ServerPlayer.showEndCredits`: dismount, remove the
player from the level, and when `!wonGame` set `wonGame = true`, send
`ClientboundGameEventPacket(WIN_GAME, 0.0f)` (type id 4, param always 0; the skip-if-seen check
lives in `EndPortalBlock`, not in the param), and set `seenCredits = true` (persisted as the
`seenCredits` NBT tag, copied by `restoreFrom`). When the client finishes the credits it sends
`ServerboundClientCommandPacket PERFORM_RESPAWN`; `ServerGamePacketListenerImpl.handleClientCommand`
sees `wonGame`, clears it and calls `PlayerList.respawn(player, true, CHANGED_DIMENSION)`. The
End-exit destination for a player is `findRespawnPositionAndUseSpawnBlock(false, DO_NOTHING)`,
the respawn point without spending an anchor charge; other entities go to the level's shared
respawn position (`EndPortalBlock.getPortalDestination`). On Bedrock, entering the exit portal
plays skippable credits and respawns the player at their spawn point; later entries skip them,
and the Bedrock player NBT stores `HasSeenCredits`
(wiki claims: https://minecraft.wiki/w/End_Podium,
https://minecraft.wiki/w/Bedrock_Edition_level_format/Entity_format). XP matches Java on Bedrock
(12000 first, 500 after; wiki: https://minecraft.wiki/w/Experience; PowerNukkitX uses
`isRevived() ? 500 : 12000`). Two Bedrock quirks (wiki claims): the dragon egg appears on the
first and second kills (MCPE-51345, https://minecraft.wiki/w/Dragon_Egg), and the podium
regenerates five seconds after all its portal blocks break
(https://minecraft.wiki/w/End_Podium).

## 8. Repo audit

Paths relative to the repo root; all read from source, not docs.

**End terrain generates, but with no pillars and no crystals today.** `end_spike` is registered
(`packages/features/src/features/index.ts:118`) and implemented
(`packages/features/src/features/structural.ts:1041-1099`: obsidian disc, cage, crystal spawn at
height + 1, bedrock cap, fire), and the End biome's step 4 lists it
(vanilla datapack `data/minecraft/worldgen/biome/the_end.json`). But the parser
(`structural.ts:1636-1661`) reads `raw['spikes'] ?? []` and nothing implements Java's
empty-list-means-seed rule, so the feature places nothing. It also discards
`crystal_invulnerable` and `crystal_beam_target` via `void` (`structural.ts:1093-1094`), and
`FeatureWorld.spawnEntity?(type, position, yaw)`
(`packages/features/src/world/FeatureWorld.ts:147`) carries no beam, bottom or invulnerable
options. No test asserts pillars: `DataDrivenGenerator.test.ts:71-96` (seed 1234, chunk 0,0)
checks end stone only, and `packages/parity/src/worldgen.dimensions.test.ts:427-508` checks
bounds, biomes and builders. `end_platform` (the obsidian entry platform at (100, 49, 0)) is
placed by worldgen (`packages/features/src/features/simple.ts:256-268`). `end_podium` is
implemented (`structural.ts:983-1010`) but nothing calls it, matching Java, where the fight and
not the biome places it. `end_gateway` is implemented (`structural.ts:1012-1039`) with an
`EndGateway` block entity carrying `exitPortal`/`exactTeleport`
(`packages/chunkgen/src/ProtoChunk.ts:40`,
`packages/prismarine/src/world/generators/datadriven/javaGeneratedContent.ts:76-98`), and the
`jsprismarine:portal` family claims the block without any hook
(`packages/blocks/src/families.ts:49`, `packages/block-behaviors/src/families/world.ts:92-173`).

**Generated entity spawns already travel end to end.** The generator's `FeatureWorld` adapter is
`GenerationRegion.featureWorld()` (`packages/prismarine/src/world/generators/datadriven/GenerationRegion.ts:589-610`,
spawnEntity at 601, recorded at 709-726), carried as `ProtoEntitySpawn`
(`packages/chunkgen/src/ProtoChunk.ts:46-54`), mapped Java-to-Bedrock
(`javaGeneratedContent.ts:106-111`; `minecraft:end_crystal` to `minecraft:ender_crystal` in
`packages/mapping/src/tables/entities.json:57`), stored on the chunk
(`packages/prismarine/src/world/chunk/Chunk.ts:309-321`) and spawned on load by
`World.createGeneratedEntities` (`packages/prismarine/src/world/World.ts:1173-1194`) through
`EntityRuntime.spawn(identifier, at, options)`
(`packages/prismarine/src/entity/data/EntityRuntime.ts:523`; options at
`packages/prismarine/src/entity/data/scene.ts:25-45` have no invulnerable or metadata entries).

**The data-driven crystal and dragon exist but misbehave.** The vanilla pack defines both:
`ender_crystal.json` (health 1/1, 2x2 box, fire immune, `on_hurt` triggers an explode group of
power 6, fuse 0; bedrock-samples 1.26.51.1) and `ender_dragon.json` (health 200, 13x4 box,
`minecraft:boss` with hud_range 125, no gravity, the seven `dragon*` flight goals and
`dragondeath`). Damage reaches a data-driven entity through
`InventoryTransactionHandler` ATTACK, `meleeAttack` (`packages/prismarine/src/entity/Combat.ts:133-179`),
the body, and `EntityRuntime.hurt` (`EntityRuntime.ts:1407-1436`). Two defects: a hit crystal is
killed before its explode fuse ever ticks (`EntityRuntime.ts:916-941`), so it vanishes without
exploding; and `kill` drops loot but never XP, and the `dragondeath` goal removes the dragon
after 200 ticks with reason `death_behavior` and no drop at all
(`packages/entity-goals/src/goals/specials.ts:85-106`,
`packages/prismarine/src/entity/data/goalWorld.ts:220`). No mob death awards XP anywhere;
`xp_orb` spawns only from block breaks (`packages/block-behaviors/src/families/simple.ts:118`)
and `addExperiencePoints` exists (`packages/prismarine/src/entity/Experience.ts:47`). The dragon
goals are placeholders that hold control flags, which satisfies "hover minimally". The
`minecraft:boss` component is data-only (`packages/entities/src/components/index.ts:120`).

**Wire pieces exist and are unused.** `ShowCreditsPacket` (id 0x4b,
`packages/protocol/src/packet/ShowCreditsPacket.ts`; `CreditsStatus.StartCredits = 0`,
`EndCredits = 1`, both directions) is only ever logged by `ShowCreditsHandler`
(`packages/prismarine/src/network/handler/ShowCreditsHandler.ts:10-16`). `BossEventPacket`
(id 0x4a, `packages/protocol/src/packet/BossEventPacket.ts`; `BossEventUpdateType` Add 0,
PlayerAdded 1, Remove 2, PlayerRemoved 3, UpdatePercent 4, UpdateName 5, UpdateProperties 6,
UpdateStyle 7, Query 8; fields targetActorId, eventType, name, filteredName, healthPercent,
color, overlay in `packages/protocol/src/wire/definitions/bossEvent.ts:19-34`) is sent by
nothing in prismarine.

**Travel and persistence seams.** The End exit today: `World.touchPortals`
(`World.ts:2487-2499`) to `DimensionTravel.touch`, delay 0, `leaveEnd`
(`packages/prismarine/src/world/portal/DimensionTravel.ts:329-352`): a player goes to their
respawn point, others one block above the Overworld spawn, no credits.
`PlayerSession.changeWorld(arrival)` (`packages/prismarine/src/network/PlayerSession.ts:1504`)
holds one pending change and refuses a second (1509-1518). `END_SPAWN_POINT` (100, 50, 0) and
the platform writer exist (`DimensionTravel.ts:61`,
`packages/block-behaviors/src/rules/portal.ts:547-560`). `WorldPersistenceData`
(`packages/prismarine/src/world/WorldPersistence.ts:43-51`) is the save's
`jsprismarine:world_data` record; the parser drops unknown fields (62-78) and
`LevelDB.writeWorldData` whitelists them (`packages/prismarine/src/world/providers/leveldb/LevelDB.ts:186-196`),
so a new `dragonFight` field touches interface, parser and whitelist. Service precedents: the
lazy per-world `PortalIndex` (`World.ts:1915`) and the per-server `DimensionTravel`
(`packages/prismarine/src/Server.ts:114`). `World.update` ticks portals at 751 and data entities
at 770; `Level.update` ticks worlds in stem order (`packages/prismarine/src/world/Level.ts:644-650`).
The client harness for an integration test is `packages/client/src/DimensionChange.test.ts`
(real server, temp `JSP_DIR`, packet capture) with the responder in
`packages/client/src/DimensionChange.ts:44-124`; the client has no ShowCredits handling yet.

**The end crystal item.** `minecraft:end_crystal` exists (runtime id 851 at protocol 2193 and
852 at 2225, `packages/bedrock-data/src/jsp/v2193/required_item_list.json` and `v2225`; the
entities carry Bedrock legacy ids 71 for `minecraft:ender_crystal` and 53 for
`minecraft:ender_dragon` in `packages/bedrock-data/src/generated/entity_identifiers.json`) and
already places its entity
through `entityPlacementBehavior` (`packages/item-behaviors/src/behaviors/placement.ts:112-130`,
override table at 41-46), but with no obsidian-or-bedrock base check, no free-space check, no
centering on the block and no respawn hook.

## 9. The Bedrock wire mapping

- **Dragon and crystal actors.** `AddActor` with type `minecraft:ender_dragon` / `minecraft:ender_crystal`
  (`packages/protocol/src/wire/structures/addActor.ts`, both directions). The runtime already
  builds bodies for data-driven entities (`packages/prismarine/src/entity/data/liveBodies.ts:194-235`).
- **Crystal beam.** The beam target travels as actor data `ActorDataID.BLOCK_TARGET = 47`
  (`packages/minecraft/src/generated/unversioned/ActorDataID.ts:67`, from Mojang's
  bedrock-protocol-docs enums), written as a block position: `FlagType.POSITION = 6`, three
  ZigZag varints (`packages/protocol/src/wire/structures/Metadata.ts:319-327`, set through
  `setPropertyValue`). The base plate is actor flag `ActorFlags.SHOW_BOTTOM = 38`
  (`packages/minecraft/src/generated/unversioned/ActorFlags.ts:58`); the vanilla render
  controller drives the base off `query.show_bottom`
  (bedrock-samples `resource_pack/render_controllers/ender_crystal.render_controllers.json`).
  Bedrock saves the target as `BlockTargetX/Y/Z` actor NBT (wiki claim, Entity format page).
  PowerNukkitX writes both the same way (`EntityEnderCrystal.java:147-167`). The repo's
  data-driven projection is `actorMetadataProjection` in
  `packages/prismarine/src/entity/data/actorMetadata.ts:62`, applied on spawn and on change in
  `packages/prismarine/src/entity/data/liveBodies.ts:227-228` and `308-311`; its property kinds
  are byte, float, int, long and string only (`actorMetadata.ts:25-30`), so a position kind must
  be added, and the hand-kept `MetadataFlag` subset
  (`packages/protocol/src/wire/structures/Metadata.ts:22-61`) has neither key 47 nor flag 38.
- **The dragon health bar.** `BossEventPacket` carries the same seven fields for every event
  type since 2193 (`packages/protocol/src/wire/definitions/bossEvent.ts:19-34`): Add with the
  dragon's actor id, UpdatePercent as health changes, Remove on death or when the player leaves
  the 192-block radius. The bar binds to an actor the client tracks
  (`docs/research/commands-functions-and-datapack-execution.md:848`); PowerNukkitX sends Add per
  player from the dragon entity and uses an invisible scale-0 creeper moved along with the
  player for bars with no real actor (`utils/DummyBossBar.java`), so whether the bar survives
  the dragon leaving tracking range is unverified. `minecraft:boss.hud_range` is 125 in the
  vanilla pack.
- **Credits.** Send `ShowCredits` with `StartCredits`; the client replies with `EndCredits`
  when the player finishes or skips. The repo's handler shape already receives the reply.
- **Visual events** (verified in `packages/minecraft/src/generated/`): `LevelEvent`
  `PARTICLES_EXPLOSION = 2025` and `PARTICLES_DRAGON_EGG = 2010` (`unversioned/LevelEvent.ts`),
  `LevelSoundEvent.EXPLODE = 48` (`v2225/LevelSoundEvent.ts:66`), `ActorEvent`
  `DRAGON_START_DEATH_ANIM = 37` (`v2193/ActorEvent.ts:45`). Java's level events 3001 (summon
  roar), 3000 (gateway spawn) and 1028 (dragon death global sound) have no verified Bedrock
  equivalents; candidates must be tested against a real client.

## 10. Recommendation on gateways

Defer gateway teleports. The fight only needs `spawnNewGateway` to place the gateway blocks
(the repo's `end_gateway` feature already writes the block and its block entity), which makes a
later teleport slice purely additive. The teleport itself needs the block entity's cooldown and
exit search (`TheEndGatewayBlockEntity`, section 3) and an island placement path, none of which
gates beating the game.

## Reproduce

```sh
unzip -o node_modules/.cache/jsprismarine/java-server/26.3/server.jar 'META-INF/versions/26.3/*' -d /tmp/jar
/Library/Java/JavaVirtualMachines/temurin-27.jdk/Contents/Home/bin/javap -p -c \
  -classpath /tmp/jar/META-INF/versions/26.3 \
  net.minecraft.world.level.dimension.end.EnderDragonFight
```
