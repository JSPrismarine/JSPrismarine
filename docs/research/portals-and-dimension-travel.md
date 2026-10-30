# Portals and dimension travel

Research note, 2026-10-30. Question: what does a Bedrock server have to do so that nether portals and end portals work, and players and entities travel between the Overworld, the Nether and the End, and how much of it does this repository already have.

Sources, in order of trust. Mojang's Java Edition 26.3 server jar, which ships unobfuscated (the cached copy at `node_modules/.cache/jsprismarine/java-server/26.3/server.jar`, read with `javap`), is the only first-party source for the rules themselves; Bedrock Dedicated Server is closed, so where Bedrock differs the claim comes from [minecraft.wiki](https://minecraft.wiki) and is marked "(wiki)". Mojang's [bedrock-protocol-docs](https://github.com/Mojang/bedrock-protocol-docs) schemas (`x-minecraft-version` 1.26.60-beta.0, protocol 2225) are first-party for the wire. [gophertunnel](https://github.com/Sandertv/gophertunnel), [CloudburstMC/Protocol](https://github.com/CloudburstMC/Protocol/tree/3.0), [Dragonfly](https://github.com/df-mc/dragonfly), [Geyser](https://github.com/GeyserMC/Geyser) and [Nukkit](https://github.com/CloudburstMC/Nukkit) are reimplementations whose code encodes what a real Bedrock client accepts; they are cited for the packet sequence, where they agree. Commands that reproduce every reading are in "Reproduction". Two notes written the same day cover the neighboring ground and are not repeated here: [data-driven-dimensions.md](data-driven-dimensions.md) on describing dimensions and generators as data, and [dimension-storage-network-config.md](dimension-storage-network-config.md) on storage keys, the chunk pipeline, the dimension fields of every packet, and the config shape.

## Summary

1. A nether portal is a vertical obsidian rectangle with an interior 2 to 21 wide and 3 to 21 high (`PortalShape.MIN_WIDTH = 2`, `MAX_WIDTH = 21`, `MIN_HEIGHT = 3`, `MAX_HEIGHT = 21`), lit by fire placed inside it. Corners are not checked. Bedrock's block is `minecraft:portal` with one state, `portal_axis` in `unknown`, `x`, `z`; the repository's palette at `packages/minecraft/src/generated/v2193/block-schemas.ts:15429` carries exactly that.
2. Coordinates scale 8:1 horizontally (`DimensionType.coordinateScale` is 8.0 for the Nether, 1.0 elsewhere); Java floors, Dragonfly shifts right by 3, which is the same thing. Y is clamped, not scaled. Java searches 128 blocks in the Overworld and 16 in the Nether (`PortalForcer.OVERWORLD_PORTAL_RADIUS = 128`, `NETHER_PORTAL_RADIUS = 16`); Bedrock searches 128 in both (wiki, and Dragonfly's `portalSearchRadius = 128` comment).
3. A player stands in a portal for 80 ticks in survival and 0 in creative (Java gamerules `players_nether_portal_default_delay = 80`, `players_nether_portal_creative_delay = 0`; the wiki says 1 tick on Bedrock). The timer decays by 4 per tick when the player steps out. Non-player entities travel instantly. After travel, the cooldown is 300 ticks for entities, 10 for players and vehicles (`Entity.getDimensionChangingDelay` returns 300, `Player` and `VehicleEntity` return 10); Bedrock stores it as `PortalCooldown` on the entity, starting at 300 (wiki, level format).
4. An end portal is twelve `end_portal_frame` blocks around an open 3x3, every frame with `end_portal_eye_bit` set and `minecraft:cardinal_direction` facing inward. Completing it fills the 3x3 with `end_portal`. Entering the End regenerates a 5x5 obsidian platform under (100, 49, 0) and places players at (100, 49, 0) facing west, other entities at (100, 50, 0) (`ServerLevel.END_SPAWN_POINT = (100, 50, 0)`, players get `y - 1`). Entering an end portal in the End returns a player to their respawn point and anything else to world spawn; respawn anchors are not discharged.
5. The dimension change on the wire is `ChangeDimensionPacket { dimension, position, respawn, loadingScreenId }`, then the chunks, then `PlayStatus PlayerSpawn`. Since Bedrock 1.19.50 the server has to send a `PlayerAction ChangeDimensionAck` to the client; the client also sends one back, and since 1.21.20 (protocol 712) it reports the loading screen edges through `ServerboundLoadingScreenPacket` with the id the server chose. The client never leaves the loading screen when the dimension id equals the one it is already in, so a same-dimension world switch needs a detour through another id. The repository already has all of these packets with both wire directions, and `Player.setWorld` already does a four-step detour.
6. The repository has the dimension definitions (`packages/prismarine/src/world/Dimension.ts`), per-dimension LevelDB keys, per-dimension chunk shapes, a `WorldManager.getWorldByDimension`, a `BlockWorld.at(dimension)` seam built for portals, a `portalFamily` that schedules an 80 tick countdown, fire placement from flint and steel, and an eye of ender that sets the frame bit. It has no frame detection, no portal creation, no cross-world destination, no end platform, no portal cooldown, no entity-in-block dispatch for players (`onStepOn` is never called by the server), no Nether or End generator, and `WorldManager.buildWorld` never passes a dimension, so every world is an Overworld.

## 1. Nether portals

### Frame and interior

Java's `PortalShape` (`net/minecraft/world/level/portal/PortalShape.class`) defines the structure. Constants read from the class: `MIN_WIDTH = 2`, `MAX_WIDTH = 21`, `MIN_HEIGHT = 3`, `MAX_HEIGHT = 21`. These count the interior, so the smallest portal is a 4 by 5 frame and the largest a 23 by 23 frame, matching the wiki's "4x5 minimum, 23x23 maximum" and "corners are not required". The `FRAME` predicate is a static block state predicate (obsidian; the wiki adds that crying obsidian does not count). The scan is `calculateBottomLeft` (walk down, then toward the negative side of the axis while the block is empty), `calculateWidth` (walk along the positive side counting empty blocks until a frame block), `calculateHeight` (each column up until a frame block, and `hasTopFrame` across the whole width). `isEmpty` accepts air, fire and existing portal blocks, which is why re-lighting a frame with a stray fire inside works. `isValid()` requires the measured width and height inside the limits; `isComplete()` is `isValid()` and every interior block already a portal block.

Dragonfly's `server/world/portal/scan.go` is the same algorithm in Go for the Bedrock block set: it scans the Z axis first, then X, and takes X only when the Z scan is below the minimum area. Its `matchesNetherPortalInterior` accepts air and fire as interior, and `isFrame` is `minecraft:obsidian`.

The portal cannot be lit in the End (wiki). Dragonfly enforces this with `tx.World().Dimension() == world.End` returning false at the start of every portal routine; Java's `BaseFireBlock.onPlace` calls `PortalShape.findEmptyPortalShape` only when `inPortalDimension` (Overworld or Nether).

### Lighting

A fire block appearing inside a valid frame creates the portal. Java does it in `BaseFireBlock.onPlace`. If the dimension allows portals it tries `PortalShape.findEmptyPortalShape(level, pos, Axis.X)` (it tries X then Z internally), and if found call `createPortalBlocks`. The source of the fire is irrelevant: flint and steel, a fire charge, a fireball, lightning, or fire spread (wiki). The frame must be complete before the fire appears; closing the last gap in a frame that already has a fire in it does nothing (wiki).

`createPortalBlocks` writes `nether_portal[axis=<axis>]` to every interior position. On Bedrock the block is `minecraft:portal` and the state is `portal_axis`: `x` means the long edge runs east to west, `z` north to south, and `unknown` is a placed-by-command state whose direction follows adjacent portals (wiki, block states table; the repository palette lists the three values in that order with `unknown` as default).

### Breaking and ticking

A portal block checks its neighbors on every block update. Java's `NetherPortalBlock.updateShape` handles it. If the updated face is on the portal's axis or vertical, and the neighbor is neither a portal block nor a frame block, the portal block becomes air. Because the neighbors then update, the whole interior collapses in a chain (wiki: "If any portal block is destroyed, the whole portal is deactivated as adjacent portal blocks are updated"). Dragonfly's `Portal.NeighbourUpdateTick` instead re-runs the scan from the updated block and, if the portal is no longer framed and complete, flood-fills the connected portal blocks and clears them in one go (`connectedNetherPortal`), which is simpler to reason about on a server that batches updates.

Portal blocks cannot be mined in survival, are destroyed by explosions, and are replaced by placed water or lava (wiki). Light level 11 (wiki; `packages/blocks/vanilla_overlay/blocks/portal.block.json` already carries `light_emission` 11).

Random ticks spawn zombified piglins. Java's `NetherPortalBlock.randomTick` (bytecode): only when monsters spawn, difficulty is not peaceful and the `NETHER_PORTAL_SPAWNS_PIGLINS` environment attribute is on (this is how 26.x restricts it to the Overworld); roll `random.nextInt(2000) < difficulty.getId()` (so 1 in 2000 on easy, 2 in 2000 on normal, 3 in 2000 on hard, matching the wiki's 0.05 / 0.1 / 0.15 percent); require a player close enough for spawning; walk down through portal blocks to the bottom one; check `isValidSpawn` for a zombified piglin; spawn it one block above and call `setPortalCooldown()` on it and its vehicle so it does not walk straight back. Bedrock spawns them one block east or south of the portal rather than inside it, ticks every portal block once on activation, and spawns none below y 0 (wiki, Zombified Piglin page, MCPE-98020). The overlay `portal.block.json` already sets `random_tick: true`, and `portalFamily` has no `onRandomTick` yet.

### Travel timer

Java tracks portal contact per entity in `PortalProcessor` (`portalTime`, `insidePortalThisTick`, `entryPosition`). Every tick `Entity.handlePortal` runs `processPortalCooldown` (decrement `portalCooldown` while above zero), then `processPortalTeleportation(level, entity, canUsePortal(false))`:

- If the entity was inside this tick, clear the flag, and if allowed, increment `portalTime` and return true when it reaches `portal.getPortalTransitionTime(level, entity)`.
- Otherwise `decayTick()`: `portalTime = max(portalTime - 4, 0)`. `hasExpired()` is `portalTime <= 0`, which drops the processor.

`NetherPortalBlock.getPortalTransitionTime` returns 0 for non-players, and for players `max(0, gamerule)` where the gamerule is `players_nether_portal_creative_delay` when `abilities.invulnerable` (creative) and `players_nether_portal_default_delay` otherwise. `GameRules` sets the defaults to 0 and 80. The wiki's "1 tick in creative" on Bedrock describes the same thing, a transfer on the first contact tick.

`Entity.canUsePortal(allowPassengers)` is "alive, and not a passenger unless allowed". `EnderDragon.canUsePortal` and `WitherBoss.canUsePortal` return false; `Creaking.canUsePortal` is false while heart-bound. Bedrock lets withers use end portals (wiki). Bedrock refuses to teleport a player with a parrot on their shoulder (wiki, MCPE-27950) and does not teleport entities with passengers (wiki, MCPE-47288), where Java carries vehicle and passengers together.

Nukkit's player logic (`cn/nukkit/Player.java`, `checkBlockCollision`) is a Bedrock-only server's reading of the same rule. It counts `inPortalTicks` while any collision block is `NETHER_PORTAL`, reset to 0 when none is; at tick 40 (1 in creative) precompute the mirror position and pre-generate the destination chunks; at tick 80 (1 in creative) search, create if needed, teleport.

### Cooldown after travel

`Entity.setPortalCooldown()` stores `getDimensionChangingDelay()` in `portalCooldown`. The bytecode of `Entity.getDimensionChangingDelay` is: if the first passenger is a `ServerPlayer`, return the passenger's delay, else 300. `Player.getDimensionChangingDelay` returns 10, and `VehicleEntity.getDimensionChangingDelay` (boats and minecarts) returns 10. So a mob waits 15 seconds, a player half a second, and a boat with a player in it half a second; the wiki's "entity ridden by a player has no cooldown" is this delegation. `handlePortal` skips an entity whose `isOnPortalCooldown()` is true, and `Entity.handlePortal` calls `setPortalCooldown()` on the entity when a teleport starts, so an entity cannot be bounced back by the destination portal it arrives in.

Bedrock persists this as `PortalCooldown` (int) on every entity, "initially starts at 300 ticks (15 seconds) after teleportation and counts down to 0" (wiki, Bedrock Edition level format, Entity format). The Java tag is `PortalCooldown` too (`Entity.TAG_PORTAL_COOLDOWN`).

### Coordinate scaling

`DimensionType` has a `coordinateScale` field and a static `getTeleportationScale(from, to)` that returns `from.coordinateScale / to.coordinateScale`. The vanilla dimension types read from `DimensionTypes.class` are: Overworld `minY -64, height 384, logicalHeight 384, coordinateScale 1.0`; Nether `minY 0, height 256, logicalHeight 128, coordinateScale 8.0`; End `minY 0, height 256, logicalHeight 256, coordinateScale 1.0`. `NetherPortalBlock.getPortalDestination` multiplies the entity's x and z by that scale, clamps through `WorldBorder.clampToBounds`, and clamps y into the destination's height (`Mth.clamp(y, minY, minY + logicalHeight - 1)`). Floor division is what makes the Overworld to Nether direction round toward negative infinity (wiki, "Java floor() method"). Dragonfly's `translatePortalPosition` is `x >> 3, z >> 3` one way and `x * 8, z * 8` the other, with y clamped to the target range, which gives the same integers.

For this server the only data needed is the scale per dimension (1, 8, 1) and the height range (`Dimensions.Overworld` -64..320, `Nether` 0..128, `TheEnd` 0..256 in `packages/prismarine/src/world/Dimension.ts`). On Bedrock the Nether is 128 tall and the bedrock ceiling is at 127; Geyser's `BedrockDimension.THE_NETHER` is `(0, 128)` and it has a workaround that tells the client it is in the End to allow building above 128, because the client refuses blocks above the Nether's height.

### Portal search

`PortalForcer.findClosestPortalPosition(pos, isNether, border)` (bytecode shows `bipush 16` and `sipush 128` selected by the boolean) asks the POI manager for `nether_portal` points of interest within that radius of the scaled position, filters to loaded chunks inside the border, and picks the minimum by squared distance, with a tiebreak on y. The found position is the lowest-left portal block; `NetherPortalBlock.getExitPortal` then calls `BlockUtil.getLargestRectangleAround(pos, axis, 21, Direction.Axis.Y, 21, isPortal)` to recover the whole rectangle and `createDimensionTransition` places the entity with `PortalShape.getRelativePosition` (the offset inside the source portal, as a fraction of the portal's width and height minus the entity's size, applied to the destination rectangle) and `findCollisionFreePosition`. If the destination axis is rotated, yaw rotates by 90 degrees (`bipush 90` in `createDimensionTransition`).

Bedrock searches a 128 block radius in both dimensions (wiki, "In Bedrock Edition, the point of interest can be within a 256x256 square block area (128-block radius) in both the Overworld and Nether"). Dragonfly's `FindNetherPortal` iterates every block in the cube, validates each candidate through `NetherPortalFromPos`, requires it framed and activated, and keeps the closest portal block by Euclidean distance. Nukkit only searches 16 blocks horizontally over the full height. A server without a POI index should keep a portal index per world (see section 5) instead of scanning 256 x 256 x 128 blocks per trip.

### Portal creation

`PortalForcer.createPortal(pos, axis)` searches a 16 block radius horizontally (`bipush 16` in the loop) over the whole world height for the best spot, in two passes: first a 3 wide by 4 tall footprint with the frame, air above and solid below (`canHostFrame` with the `FRAME_BOX` 3 constants), then with the depth reduced to 1 (the two-pass structure described on the wiki). It picks the closest valid spot by 3D distance. If nothing is found it forces the portal at the target with y clamped to `[70, maxY - 10]` (`bipush 70` and the `-10` reading in the bytecode, and the wiki: "between 70 and 10 less than the world height", 118 in the Nether and 310 in the Overworld), writing a 2x3 obsidian platform (`FRAME_BOX_START = -1 .. FRAME_BOX_END = 2`, `FRAME_WIDTH_START = -1 .. FRAME_WIDTH_END = 3`) with air three high above it. Then it writes a 4 by 5 frame including corners (`FRAME_WIDTH_START -1 .. FRAME_WIDTH_END 3`, `FRAME_HEIGHT_START -1 .. FRAME_HEIGHT_END 4`) and the six portal blocks, overwriting whatever is there. The axis matches the source portal.

Bedrock differs in two places (wiki): only a player triggers creation ("The incoming entity can be ... only a player in Bedrock Edition"), and a forced platform gets four netherrack blocks flanking the obsidian on each side. Dragonfly's `CreateNetherPortal` ports Java's search (random starting direction, four directions then two, the forced floating platform), and Dragonfly's `PortalTravelComputer.CreatePortal` is false for everything but players. Nukkit's `spawnPortal` writes a fixed 4x5 frame plus a cleared 5x3x4 air box and nothing else.

### Linking

Neither edition stores a link between two portals; the link is the search result each time (wiki, "If a portal is deactivated, and the matching portal in the other dimension is used before it is re-activated, a new portal may be created"). Java's only cache is the POI index of portal blocks and the chunk ticket `TeleportTransition.PLACE_PORTAL_TICKET` places on arrival (`PortalForcer.TICKET_RADIUS = 3`; the wiki gives its lifetime as 15 seconds, refreshed on each use).

A destination portal taller than 18 blocks spans more than one 8:1 cell, so its two ends can link to two different Overworld portals (wiki). This falls out of the algorithm and needs no special code.

### Sounds

Bedrock sound ids: `portal.portal` (ambient, random), `portal.trigger` (when a player enters), `portal.travel` (after teleport) (wiki, Bedrock sound table). Geyser and Dragonfly both send `StopSound` with "stop all" during the change so the trigger sound does not keep looping.

## 2. End portals, the End platform, the podium and gateways

### Frame ring

`end_portal_frame` has, on Bedrock, `end_portal_eye_bit` (0 or 1) and `minecraft:cardinal_direction` (`south`, `west`, `north`, `east`, default `south`) (wiki block states; repository palette line 7173). The direction is the opposite of where the player faced when placing. Using an eye of ender on an empty frame sets the bit (wiki). The frame is unbreakable in survival (wiki).

Java's `EndPortalFrameBlock.getOrCreatePortalShape()` builds a `BlockPattern` with aisles `?vvv?`, `>???<`, `>???<`, `>???<`, `?^^^?`, where each letter is an `end_portal_frame` with `HAS_EYE = true` and the matching `FACING` (south for `v`, east for `>`, west for `<`, north for `^`); `?` matches anything. The eye of ender item, after setting the bit, checks `getOrCreatePortalShape().find(level, pos)` and, on a match, writes `end_portal` to the 3x3 interior (wiki describes this as "destroys any blocks located in the center 3x3 square, including bedrock"). The pattern is searched in rotations, which is the source of the wiki's "24 possible configurations in Java"; Bedrock only accepts the flat ring (wiki). Dragonfly's `ActivateEndPortal` implements the flat case directly. From the used frame it step inward twice, try the three candidate centers, and require all twelve `(position, facing)` pairs from `expectedEndRingFrames` to hold an eye and face the center.

The `end_portal` block does not depend on the frame to exist (wiki, MC-1174); Dragonfly chooses to remove the interior when the ring breaks anyway (`EndPortalRingIntact`), which is a server policy, not vanilla. Light level 15 (wiki).

### Into the End

`EndPortalBlock.getPortalDestination` (bytecode): if the current level is the End, the target is the level and position from `ServerLevel.getRespawnData()` (the world's respawn data, which is the Overworld spawn), else the target is `Level.END` and `ServerLevel.END_SPAWN_POINT`, which the static initializer sets to `new BlockPos(100, 50, 0)`. When going to the End it calls `EndPlatformFeature.createEndPlatform(level, BlockPos.containing(bottomCenter).below(), true)`, sets yaw to `Direction.WEST.toYRot()` and pitch 0, and for a `ServerPlayer` subtracts `(0, 1, 0)` from the position. So players arrive at (100.5, 49, 0.5) facing west, everything else at (100.5, 50, 0.5), which matches the wiki's "(100, 49, 0, facing west)" and "other entities ... (100.5, 50, 0.5)". Dragonfly's `EndSpawnPosition(player bool)` does the same.

`EndPlatformFeature.createEndPlatform(level, center, dropBlocks)` (bytecode): for dx -2..2, dz -2..2, dy -1..2 (the loop is `-1 <= dy < 3`), the wanted block is obsidian at dy -1 and air otherwise; if the current block differs it is `destroyBlock(pos, true)` when `dropBlocks` is set, then `setBlockAndUpdate`. The platform is regenerated on every entry (wiki, "Whenever a new entity enters the End, the platform is regenerated"). On Bedrock the platform only generates when an entity uses an end portal, not when teleporting by command (wiki, End Platform page).

Entering an end portal is immediate; there is no countdown (wiki; `EndPortalBlock` inherits `Portal.getPortalTransitionTime`'s default of 0 and only `NetherPortalBlock` overrides it). The portal cooldown applies afterwards the same as for nether portals.

### Out of the End

From the End, a `ServerPlayer` goes through `findRespawnPositionAndUseSpawnBlock(false, DO_NOTHING)`, which reads the player's `RespawnConfig`, resolves the bed or anchor through `findRespawnAndUseSpawnBlock(level, config, useCharge = false)`, and falls back to `TeleportTransition.missingRespawnBlock` (world spawn with the "missing or obstructed" flag). The `false` is why a respawn anchor keeps its charge when leaving the End (wiki, "Returning through an End portal is not considered a respawn, and does not use any charges"). Non-players go to `adjustSpawnLocation(level, respawnPos)` at the Overworld spawn.

Bedrock also shows the credits on first exit and stores `HasSeenCredits` on the player (wiki, Entity format). The repository's `ShowCreditsHandler.ts:11` notes that leaving the End is not modeled.

The podium (exit portal) at (0, y, 0) in the End activates on each dragon death; its portal blocks sit at the height of the highest block at 0,0 (wiki, End Podium page). It is a world generation feature plus a dragon fight state, out of scope for portal travel itself, but its `end_portal` blocks go through the same return path.

### End gateways

`TheEndGatewayBlockEntity` constants: `SPAWN_TIME = 200` (creation beam), `COOLDOWN_TIME = 40` (teleport beam and lockout), `ATTENTION_INTERVAL = 2400`, `GATEWAY_HEIGHT_ABOVE_SURFACE = 10`, fields `age`, `teleportCooldown`, `exitPortal`, `exactTeleport`. The twenty central gateways sit at y 75 on a radius of 96 from (0, 0) at `floor(96 cos(pi k / 10)), floor(96 sin(pi k / 10))` (wiki). On first use, `findExitPortalXZPosTentative` walks a 1024 block line out from the origin in 16 block steps, `findOrCreateValidTeleportPos` picks an end stone block at or above y 30 (`bipush 30`) or generates an island, and the return gateway is built 10 blocks above. Bedrock stores `ExitPortal` and `Age` on the `EndGateway` block entity (wiki, Block entity format); a gateway placed by a player in the End teleports to (0, 0, 0) and does nothing outside the End (wiki). The block is intradimensional, so it is a teleport, not a dimension change, and needs no `ChangeDimensionPacket`. The repository maps `end_gateway` to `jsprismarine:portal`, though no portal hook handles it yet.

## 3. The Bedrock wire sequence

### Packets

All fields below are read from Mojang's 2225 schemas and cross-checked with gophertunnel and CloudburstMC/Protocol. The repository's layouts in `packages/protocol/src/wire/definitions/worldStatus.ts` match every one.

| Packet | Id | Fields | Repository |
| --- | --- | --- | --- |
| `ChangeDimensionPacket` | 0x3d | `Dimension ID` (varint32, "0 Overworld, 1 Nether, 2 The End, 3 Undefined"), `Position` (vec3), `Respawn` (bool), `Loading Screen Id` (optional uint32 LE, "Leave empty if there is no loading screen expected on the client. This id needs to be unique and not conflict with any other active loading screens") | `worldStatus.ts:63-72`, optional since protocol 712 per Cloudburst's `ChangeDimensionSerializer_v712` |
| `PlayerActionPacket` | 0x24 | runtime id, `action` varint32, block position, result position, face | `PlayerActionPacket.ts:96-112`; `ChangeDimensionAck = 14`, `CreativeDestroyBlock = 13` |
| `ServerboundLoadingScreenPacket` | 0x138 | `Loading Screen Packet Type` (varint32, `StartLoadingScreen = 1`, `EndLoadingScreen = 2`), `Loading Screen Id` (optional uint32, "This will be set if the server gives us a value. If the server doesn't expect this value, then the client will get disconnected") | `ServerboundLoadingScreenPacket.ts`, handler logs and calls `session.endLoadingScreen(id)` |
| `RespawnPacket` | 0x2d | `Position` vec3, `State` uint8 (`SearchingForSpawn = 0`, `ReadyToSpawn = 1`, `ClientReadyToSpawn = 2`), runtime id | `worldStatus.ts:47-54` |
| `DimensionDataPacket` | 0xb4 | map of id to `DimensionDefinition { Minimum Y, Height Range, Generator Type, Dimension Type, Pack Id, Default Biome, Cloud Height (2225), Render Clouds (2225) }` | `DimensionDataPacket.ts`, `DimensionDefinition.ts`; the two 2225 fields are not carried |
| `NetworkChunkPublisherUpdatePacket` | 0x79 | block position, radius in blocks (varuint32), saved chunks | `worldStatus.ts:85-92` |
| `ChunkRadiusUpdatedPacket` | 0x46 | radius (varint32) | `ChunkRadiusUpdatedPacket.ts` |
| `SetSpawnPositionPacket` | 0x2b | type, block position, `Dimension type`, spawn block position | `worldStatus.ts:35-44` |
| `LevelChunkPacket` | 0x3a | chunk x, z, `dimension` varint32, ... | `levelChunk.ts:61-62`, filled from `chunk.getDimension().id` |
| `StartGamePacket` | | `dimension` varint32 in spawn settings | `startGame.ts:254`, filled from `world.getDimension().id` |

Mojang's `PlayerActionType` description for `ChangeDimensionAck` reads "Sent in Player Action, this is the one case of the server sending an action to the client to start a dimension change", and for `CreativeDestroyBlock` "Used to be a ChangeDimension action". Cloudburst still names them `DIMENSION_CHANGE_REQUEST_OR_CREATIVE_DESTROY_BLOCK` (13) and `DIMENSION_CHANGE_SUCCESS` (14); gophertunnel names 14 `PlayerActionDimensionChangeDone`. The repository's enum has `CreativeDestroyBlock` and `ChangeDimensionAck`, the Mojang names.

The `Dimension` enum lives at `packages/minecraft/src/Dimension.ts` (`OVERWORLD = 0, NETHER = 1, END = 2, UNDEFINED = 3`). The repository speaks protocols 2193 (1.26.50 and 1.26.51, the default) and 2225 (1.26.60) through `Codec2193` and `Codec2225` (`packages/protocol/src/wire/versions/`); none of the packets above changes layout between the two.

### What the client expects, and in what order

The three reimplementations agree on the shape. Dragonfly's `Session.changeDimension` (`server/session/session.go`):

1. Set `changingDimension`, allocate a new loading screen id and remember it as expected.
2. `ChangeDimension { Dimension, Position (eye position), LoadingScreenID }`.
3. `StopSound { StopAll }`.
4. `PlayStatus { PlayerSpawn }`.
5. `PlayerAction { ActionType: DimensionChangeDone }` to the client, with the comment "As of v1.19.50, the dimension ack that is meant to be sent by the client is now sent by the server. The client still sends the ack, but after the server has sent it."
6. The chunk loader switches world and streams chunks (`handleWorldSwitch`); `ViewEntityTeleport` moves the player.
7. `ServerBoundLoadingScreenHandler` clears `changingDimension` when the client reports `EndLoadingScreen` with the expected id, and errors on any other id.

Geyser's `DimensionUtils.switchDimension` does the same thing with the Java server as the source of truth. It clears chunk, entity and block caches; `ChunkRadiusUpdated` capped at 32 when needed ("The client locks up when switching dimensions, expecting more chunks than it's getting"); `ChangeDimension { dimension, respawn = true, position = (0, 32767, 0) }`; remove all effects (the Java server re-sends them); reset weather; `StopSound` all; `PlayerAction DIMENSION_CHANGE_SUCCESS` to the client "prior to the client acknowledgement ... send this before chunks are sent"; then `sendEmptyChunks(radius 3)` because "The client wants sections sent to it before it can successfully respawn". When the client's own `DIMENSION_CHANGE_SUCCESS` arrives, `BedrockPlayerActionTranslator` sends `PlayStatus PLAYER_SPAWN` again ("Sometimes the client doesn't feel like loading") and re-sends attributes.

Nukkit's `Player.setDimension` sends `ChangeDimension { dimension, position, respawn = !isAlive() }`, then `NetworkChunkPublisherUpdate` at the player with `chunkRadius << 4`, and arms `dimensionFix560`; the first `sendChunk` after that sends the server-side `DIMENSION_CHANGE_ACK`; the client's ack resets the player's position with `MovePlayer MODE_RESET`.

Gophertunnel's `ChangeDimension` comment carries the one rule every implementer trips on: "Dimension MUST be a different dimension than the one that the player is currently in. Sending a ChangeDimension packet with a Dimension that the player is currently in will result in a never-ending dimension change screen." Geyser's `getTemporaryDimension` and `JavaRespawnTranslator` do a `fastSwitchDimension` through a fake dimension when the Java world changes but the Bedrock id does not, and `Player.setWorld` in this repository does a four step Overworld, Nether, Nether, Overworld detour for the same reason. A real portal trip always changes the id, so the detour is only needed for same-dimension world swaps (`/tp` between two Overworld worlds, or a respawn into the same dimension's other world).

The order that satisfies all three sources, and that the repository should adopt:

1. Server-side: remove the player from the source world, despawn tracked entities on the client (`RemoveActor` for each), stop mining, clear the chunk bookkeeping (`PlayerSession.clearChunks`), and move the player's `Position` to the destination world.
2. `ChangeDimensionPacket { dimension: target.id, position: arrival eye position, respawn: false (true when this is a death respawn in another dimension), loadingScreenId: session.beginLoadingScreen() }`.
3. `StopSoundPacket` stopping all sounds.
4. `NetworkChunkPublisherUpdatePacket` at the arrival position with `viewDistance << 4`.
5. `PlayerActionPacket { runtimeEntityId: player, action: ChangeDimensionAck }` to the client.
6. `LevelChunkPacket`s for the arrival area, each with `dimension: target.id`. The client needs at least the chunks around the arrival position before it will close the screen; Geyser sends empty chunks in a radius of 3 when it has none yet.
7. `PlayStatusPacket { PlayerSpawn }` after the first batch (Dragonfly sends it right after the ack; Geyser sends it when the client's ack arrives; both work, sending both is harmless).
8. Wait for the client: it sends `ServerboundLoadingScreenPacket { StartLoadingScreen, id }` when the screen opens, `PlayerActionPacket ChangeDimensionAck` and `ServerboundLoadingScreenPacket { EndLoadingScreen, id }` when it closes. Treat `EndLoadingScreen` with the expected id as the end of the transfer: resume movement processing, send a `MovePlayer` teleport to the exact arrival position (Nukkit's `MODE_RESET`), re-send attributes and effects if they were not kept, and raise the server-side "changed dimension" hooks (the repository has `advancementChangedDimension`).

During the change the server should drop the client's `PlayerAuthInput` positions, which are still in the old world's coordinates until the client acknowledges (the same rule Mojang's docs state for `HandledTeleport`).

### Dimension ids and heights

The id in `ChangeDimension`, `LevelChunk`, `SubChunk`, `SetSpawnPosition` and `StartGame` must agree with the dimension's client-side height. The client has three built-in heights: Overworld -64..320, Nether 0..128, End 0..256 (Geyser's `BedrockDimension`, Dragonfly's `dimension.go`, and the repository's `Dimension.ts` all state these). A world that wants a different height has to register a data-driven dimension through `DimensionDataPacket` before `StartGame`; Dragonfly's `RegisterDimension` requires custom ids from 1000 up, sub-chunk aligned ranges within int16, and the Mojang description says the packet is a "Map of dimension identifier to dimension definition" with `Dimension Type` being the "Dimension runtime ID". Nothing in this research needs a custom dimension; the vanilla three cover portals.

`Chunk.clientRangeOf` in the repository already pads a shallow dimension's sub chunks to what the client expects for the dimension id, so sending Nether chunks with `dimension: 1` works once a Nether world exists.

## 4. Entity and player state across the transfer

What Java keeps and drops, from `ServerPlayer.teleport(TeleportTransition)` and `Entity.teleport`, cross-checked with the wiki and Geyser:

- The entity is removed from the source level with `RemovalReason.CHANGED_DIMENSION` and a fresh copy is added to the destination; its UUID and NBT (inventory, effects, health, hunger, experience, tags) are copied. Geyser removes and re-adds effects only because the Java server re-sends them; on a single Bedrock server the client keeps its own view of inventory and effects across `ChangeDimension`, and the repository's `setWorld` comment says "Whether the client keeps them across the change is unverified". Re-sending attributes (Geyser) and inventory contents after the ack is the safe default.
- `portalCooldown` is set on departure (`setPortalCooldown()` in `handlePortal`), so arrival inside the destination portal does not trigger a return trip. The `PortalProcessor` is dropped; the countdown starts fresh next time.
- Vehicles: Java teleports the vehicle with `transitionAsPassenger` for each passenger and skips passengers whose `canUsePortal(false)` is false; Bedrock does not teleport anything with passengers (wiki, MCPE-47288). The simplest Bedrock-faithful rule is to refuse travel for any entity that has or is a passenger.
- Items and other entities travel instantly through nether and end portals and are placed by the same algorithm; the wiki's exceptions are the wither and ender dragon (Java), ridden entities (Bedrock), and the creaking bound to a heart.
- Spawn points: a bed sets the spawn only in the Overworld and explodes elsewhere; a respawn anchor only in the Nether and explodes elsewhere (wiki, Dimension page and Respawn Anchor page). Bedrock stores `SpawnX/Y/Z` and `SpawnDimension` (int) on the player (wiki, Entity format). `ServerPlayer.findRespawnPositionAndUseSpawnBlock` looks up the level by `RespawnConfig.getDimensionOrDefault` and resolves there, so a player who dies in the Nether with an Overworld bed respawns in the Overworld. That is a dimension change on respawn. Dragonfly's `spawnLocation` returns `(pos, world, spawnBlockBroken, previousDimension)` and `handleWorldSwitch` sends a `ChangeDimension` when the world differs, with `Respawn` meaningful here. gophertunnel: "The client will send a PlayerAction packet with PlayerActionDimensionChangeRequest if it dies in another dimension, indicating that it needs a DimensionChange packet with Respawn set to true."
- The 15 second ticket Java places on the arrival chunk (`PLACE_PORTAL_TICKET`) is Java only (wiki marks chunk loading as Java exclusive); a Bedrock server only needs the arrival chunks loaded long enough to place the entity and send them.
- Death position and `enteredNetherPosition` are advancement bookkeeping; the repository's `advancementChangedDimension(player, from, to)` is the equivalent hook.

## 5. What the repository has today

Paths are relative to the repository root.

Dimensions and worlds.
- `packages/prismarine/src/world/Dimension.ts` defines `Overworld { id 0, minY -64, height 384 }`, `Nether { id 1, minY 0, height 128 }`, `TheEnd { id 2, minY 0, height 256 }` with helpers and `dimensionByName`.
- `World` takes `dimension?: DimensionDefinition` (`World.ts:320`, default Overworld at `:507`); `getDimension()` at `:2802` says the Nether and the End "need portals and their own generators". LevelDB keys include `dimension.id` (`providers/leveldb/LevelDB.ts:115-116, 204-207, 256-283`). `Chunk` is built per dimension and pads to the client range when serialized (`chunk/Chunk.ts:23, 507-552`).
- `WorldManager` keeps `worldsByDimension` and `getWorldByDimension(dimension)` (`WorldManager.ts:43-44, 314`), but `buildWorld` (`:161-244`) never passes `dimension`, and `WorldData` in `config/JsonConfigTypes.ts:14-28` has no dimension field. Only `level-name` is loaded at startup; `/debug loadWorld` is the only other caller of `loadWorld`.
- Generators: `Flat` and `Overworld` only (`world/generators/Generators.ts`). `DataDrivenGenerator` already accepts `dimension` and `noiseSettings` (`datadriven/DataDrivenGenerator.ts:106-109`), and `packages/worldgen` has Nether noise and a Nether biome source (`RandomState.ts:13-16`, `BiomeSource.ts:118`). No End generator.

The player's world change.
- `Player.setWorld` (`Player.ts:517-565`): stops mining, removes from the old world, despawns tracked entities, moves the position, adds to the new world, then sends four `ChangeDimension`s (Overworld, Nether, Nether, Overworld, each with `PlayStatus PlayerSpawn`), `sendInitialSpawnChunks`, `clearChunks`, `needNewChunks`, another `PlayerSpawn`, then `advancementChangedDimension`. The dimension ids are hard-coded rather than taken from the target world, the position is the old position, no `StopSound`, no server-side `ChangeDimensionAck`, and nothing waits for the client. The loading screen ids come from `PlayerSession.beginLoadingScreen` / `endLoadingScreen` (`PlayerSession.ts:1404-1418`), which the tests in `Player.test.ts:658-720` check for uniqueness.
- `PlayerActionHandler.ts:315` accepts `ChangeDimensionAck` and does nothing; `ServerboundLoadingScreenHandler.ts` logs and closes the id. `RespawnHandler.ts` handles `ClientReadyToSpawn` within one world.
- `/tp` across dimensions (`command/host/entities.ts:240-271`) calls `entity.setWorld(destination)` for players only, and builds the `setPosition` promise before `setWorld` runs, so the move applies to the old world.
- `Player.resolveOwnSpawn` (`Player.ts:1023-1053`) ignores a spawn point whose dimension differs from the world the player died in, so a Nether death with an Overworld bed respawns at the Nether world spawn. `StoredSpawnPoint` already carries `dimension` (`world/RespawnPoint.ts:25-38`).
- Player records are per world with no dimension field (`World.savePlayerData`, `world/PlayerRecords.ts`); `Player.enable` picks the newest record across loaded worlds. The LevelDB `PlayerCodec` writes `JSPrismarine.spawnDimension` as a string, not Bedrock's numeric `DimensionId` or `SpawnDimension`. There is no `PortalCooldown`.
- `PlayerSession` tracks `loadedChunks`, `loadingChunks`, the `ChunkSender` queue and `lastChunkX/Z`; `clearChunks()` (`:745-755`) resets them; `flushQueuedChunks` (`:480-536`) sends a publisher update then chunks and marks them loaded after the send, so a batch in flight during a world switch can leak old-world hashes back into `loadedChunks`. `requestChunk` reads `this.player.getWorld()` at delivery time.
- Events (`events/Events.ts`): no teleport or dimension change event.

Blocks and behaviors.
- Block states for every relevant block are in `packages/minecraft/src/generated/v2193/block-schemas.ts`: `minecraft:portal` (`portal_axis`), `end_portal` (none), `end_portal_frame` (`end_portal_eye_bit`, `minecraft:cardinal_direction`), `end_gateway` (none), `obsidian`, `fire` (`age`), `soul_fire` (`age`).
- Overlay files in `packages/blocks/vanilla_overlay/blocks/`: `portal.block.json` (no collision, light 11, `random_tick: true`, behavior `jsprismarine:portal`), `end_portal.block.json` (16x4x16 box, behavior `jsprismarine:portal`), `end_portal_frame.block.json` (eye permutation), `fire` and `soul_fire` (behavior `jsprismarine:portal`), `end_gateway.block.json` (`jsprismarine:portal`), `obsidian` (`jsprismarine:plain_block`). Family assignment rules are in `packages/blocks/src/families.ts:70-80`.
- `packages/block-behaviors/src/families/world.ts:79-134` `portalFamily`: `onPlace` schedules fire ticks; `onStepOn` schedules a tick after `PORTAL_DELAY_TICKS = 80` (1 for `end_portal`); `onTick` only spawns `minecraft:portal_particle`; `onNeighborChanged` handles fire survival only; `onPlayerInteract` sets `end_portal_eye_bit`. Its summary says "The destination search across dimensions is left to the server, which owns the dimension list." `packages/block-behaviors/README.md:207, 247` lists portals as out of scope for the same reason.
- The hook set a family can implement is in `packages/block-behaviors/src/family.ts:44-64` (`onPlace`, `onBreak`, `onNeighborChanged`, `onRandomTick`, `onTick`, `onPlayerInteract`, `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate`, `onBlockStateChange`); `WorldActions` (`src/world.ts:151-269`) gives `getBlock`, `setBlock`, `entitiesAt`, `scheduleTick`, `spawnParticle`, `playSound`, `notifyNeighbors`, `random`; `BlockWorld.at(dimension)` (`src/world.ts:278-281`) exists "so a portal can look at the other side".
- The server dispatches `onPlace`, `onBlockStateChange`, `onNeighborChanged`, `onTick`, `onRandomTick`, `onPlayerInteract` and `onEntity` (`packages/prismarine/src/block/contentAdapter.ts`), but never `onStepOn` or `onEntityFallOn`, so the portal countdown cannot start on a running server. `entitiesAt` matches the feet cell only (`entity/worldContentAdapter.ts:72-79`). The one per-tick box-against-blocks check is the data-driven `minecraft:inside_block_notifier` (`packages/entities/src/components/vanilla.ts:2714-2779`).
- Fire placement works end to end: `fireStarterBehavior` (`packages/item-behaviors/src/behaviors/interaction.ts:171-192`) emits `ignite`, `packages/prismarine/src/item/contentAdapter.ts:188-196` writes `minecraft:fire` through `blocks.set`, which dispatches `onPlace`. The eye of ender sets the frame bit (`item-behaviors/src/behaviors/navigation.ts:115-130`).
- Scheduled ticks (`engine-systems` `TickScheduler`, dispatched by `world/blockTicks.ts` only if the block identifier is unchanged) and random ticks (`world/randomTicks.ts`) both exist.

Tests and harnesses.
- `packages/prismarine/src/Player.test.ts` `fakePlayer()` builds a real `Player` over stubbed `Server`, `World` and `ClientConnection` whose `sendDataPacket` pushes into `sent`, and the `setWorld` tests assert packet order by `findIndex` over `sent`.
- `packages/prismarine/src/network/PlayerSessionChunks.test.ts` builds a `PlayerSession` over a stub connection and inspects `session.sender`.
- `packages/prismarine/src/network/handler/PlayerActionHandler.test.ts` has `fakeSession(gametype)`.
- `packages/block-behaviors/src/harness.ts` runs families against an in-memory world and is the only place `onStepOn` is called today.
- `packages/client/src/Login.test.ts` boots a real `Server` on 127.0.0.1:19277 with a temp `JSP_DIR` and logs in with the real `Client`; `client.getSession()` is a `ClientSession` emitting `packet` and `packet:<id>`.
- `packages/parity` declares families in `src/families.ts`; CI fails when a declared family has no test. There is a `protocol.*` group (`negotiation`, `wire-roundtrip`) and an `integration.*` group.

## 6. Proposed design

### Where it lives

Two layers, matching the package boundary the repository already drew for portals ("the server owns the dimension list").

Portal geometry and rules go in `packages/block-behaviors`, which already owns `portalFamily`, has a `BlockWorld.at(dimension)` seam and a test harness with an in-memory world. A new `src/rules/portal.ts` (frame scan, ring match, creation footprint search, platform writer) keeps the pure functions beside `rules/fire.ts`, and `portalFamily` grows the hooks that call them. Nothing in this layer knows about packets or `World`.

Travel goes in `packages/prismarine/src/world/portal/` as a `DimensionTravel` service owned by the server (one instance, reached from `Server`), because it needs `WorldManager`, `Player`, `PlayerSession` and the entity runtime. It is the only code that sends `ChangeDimensionPacket`. A new package is not warranted: the logic depends on `World` and `PlayerSession`, which are prismarine's, and the deep-module guidance in `.agents/skills/codebase-design` argues for a small public interface over a new boundary.

### Data-driven parts

The rules can be stated as data per dimension and per portal block, read from one table rather than branches:

```ts
// packages/prismarine/src/world/portal/rules.ts
export const DIMENSION_TRAVEL = {
    'minecraft:overworld': { coordinateScale: 1, portalSearchRadius: 128, allowsNetherPortal: true, respawnBlock: 'bed' },
    'minecraft:nether':    { coordinateScale: 8, portalSearchRadius: 128, allowsNetherPortal: true, respawnBlock: 'respawn_anchor' },
    'minecraft:the_end':   { coordinateScale: 1, portalSearchRadius: 0,   allowsNetherPortal: false, respawnBlock: undefined }
} as const;

export const PORTALS = {
    'minecraft:portal':     { kind: 'nether', frame: ['minecraft:obsidian'], links: { 'minecraft:overworld': 'minecraft:nether', 'minecraft:nether': 'minecraft:overworld', 'minecraft:the_end': 'minecraft:overworld' }, delayTicks: { survival: 80, creative: 0 } },
    'minecraft:end_portal': { kind: 'end',    frame: ['minecraft:end_portal_frame'], links: { 'minecraft:overworld': 'minecraft:the_end', 'minecraft:nether': 'minecraft:the_end', 'minecraft:the_end': 'minecraft:overworld' }, delayTicks: { survival: 0, creative: 0 } }
} as const;
```

The height range comes from `Dimensions` (already data). The Bedrock-specific choices (128 in both directions, player-only creation, netherrack flanks, no passengers, `the_end` nether portal leads to the Overworld) are entries in this table rather than conditions, and a test can assert the table against the wiki values. The frame block list and the portal block list are what `packages/blocks/src/families.ts` already uses to assign `jsprismarine:portal`, so the two should derive from one source.

Cooldown values (300 for entities, 10 for players and vehicles) belong on the entity side as a `portalCooldown` field with the Bedrock NBT name `PortalCooldown`, saved by `PlayerCodec` and the entity codec.

### Block layer

`portalFamily` gains:

- `onPlace` for `fire` and `soul_fire`: after scheduling the fire tick, call `tryLightNetherPortal(world, pos)`. It scans both axes with Java's `PortalShape` algorithm over the frame list, and on a valid frame writes `minecraft:portal` with the right `portal_axis` to every interior block. Refuse in `the_end`.
- `onNeighborChanged` for `portal`: if the changed face is vertical or on the portal's axis and the neighbor is neither portal nor frame, flood-fill the connected portal blocks of that axis and set them to air (Dragonfly's `connectedNetherPortal`). Chaining through neighbor updates like Java also works but relies on `notifyNeighbors` ordering.
- `onRandomTick` for `portal` in `minecraft:overworld`: the piglin roll `random() * 2000 < difficultyId`, spawn one block east or south of the bottom portal block (Bedrock placement), set its `PortalCooldown` to 300.
- `onPlayerInteract` and the eye of ender item: after setting `end_portal_eye_bit`, run `tryActivateEndPortal(world, pos)` with the flat twelve-frame ring match; on success write `end_portal` to the 3x3 and play `block.end_portal.spawn` (Dragonfly maps `sound.EndPortalCreated` to `SoundEventEndPortalCreated`).
- `onBreak` for `end_portal_frame` in creative: optional ring re-check; vanilla leaves `end_portal` blocks standing (wiki, MC-1174), so the default is to leave them.

Travel is not started from the family. The server dispatches a per-tick "entity inside portal block" signal (below) and the family's job ends at geometry.

### Server layer

```ts
// packages/prismarine/src/world/portal/DimensionTravel.ts
export interface Arrival { world: World; position: Vector3; yaw: number; pitch: number; createdPortal: boolean }

export class DimensionTravel {
    /** Called every tick for every entity whose box overlaps a portal block. */
    touch(entity: Entity, portal: PortalBlockRef): void;
    /** Resolves where a trip from `from` through `portal` lands, creating a portal or the End platform when the rules say so. */
    resolve(entity: Entity, from: World, portal: PortalBlockRef): Promise<Arrival | undefined>;
    /** Moves the entity, players through the wire sequence in section 3. */
    transfer(entity: Entity, arrival: Arrival): Promise<void>;
}
```

- A `PortalContact` per entity (`portalTime`, `insideThisTick`, `entryPosition`, `cooldown`) mirrors Java's `PortalProcessor` plus `portalCooldown`: `touch` sets `insideThisTick`; the tick step increments or decays by 4; at `delayTicks[gamemode]` it calls `resolve` then `transfer`; `cooldown` blocks `touch` and counts down. The entity's `Entity.update` already counts `invulnerableTicks`, which is the place to add the two counters.
- The per-tick signal: `World.update` already rebuilds the entity grid; after that, for each entity, iterate the cells of its box (as `inside_block_notifier` does) and, for the first cell whose block is in `PORTALS`, call `touch`. Players need this too, so it belongs in `World`, not in the data-driven runtime. Dispatching `onStepOn` for players as well would also wake the existing family countdown, but the countdown is better owned by the entity than by a block tick.
- `resolve` for a nether portal: `target = WorldManager.getWorldByDimension(PORTALS[block].links[from.dimension])`; scale the entry block position by `from.scale / to.scale` with `Math.floor`, clamp y to the target range; query the target's `PortalIndex` (below) within `portalSearchRadius`; if found, take the rectangle around the closest portal block and apply Java's relative-position mapping; else, players only, run the creation search (16 block radius, two passes, forced platform clamp `[70, maxY - 10]`, netherrack flanks) and write the 4x5 portal with the source axis. Arrival position is the bottom center of the portal block, yaw rotated 90 degrees when the axis differs.
- `resolve` for an end portal: entering the End writes the 5x5 platform under (100, 49, 0) and returns (100.5, 49, 0.5, yaw west) for players, y 50 for others; leaving the End returns the player's resolved spawn point across dimensions (section 4) or the Overworld spawn.
- `transfer` for players: the eight steps of section 3, implemented in `PlayerSession.changeWorld(world, arrival)` which replaces the body of `Player.setWorld`. Keep the detour only when `from.dimension.id === to.dimension.id`. Hold a `pendingDimensionChange` on the session so `PlayerAuthInput` is ignored until `EndLoadingScreen` with the expected id arrives, then send the teleport `MovePlayer`, attributes and inventory. Save the player record to the old world before the move, and write `DimensionId` into the record.
- `transfer` for other entities: `from.removeEntity`, `to.addEntity` at the arrival position, `cooldown = 300`.
- `PortalIndex`: a per-world set of portal block positions maintained from the block write path (`World.writeBlockRuntimeId`) and from chunk load, so the search is a distance scan over an index rather than a block scan. Java's POI index is this; Dragonfly scans blocks and is slow for 128.
- Respawn: `Player.resolveOwnSpawn` resolves the spawn in `WorldManager.getWorldByDimension(spawn.dimension)` instead of refusing, and `RespawnHandler` calls `transfer` with `respawn: true` when the resolved world differs.
- Config: `WorldData.dimension?: 'overworld' | 'nether' | 'the_end'`, passed through `buildWorld` to `new World({ dimension })`. Startup loads every configured world, not only `level-name`, or the service loads the destination lazily on first use. A `Nether` generator built on `DataDrivenGenerator` with `noiseSettings: 'minecraft:nether'` and the worldgen package's Nether biome source, and an `End` generator (end islands noise is in Java's datapack as `minecraft:end` noise settings), are prerequisites for a trip to land on terrain; a `Flat` Nether is enough to develop and test the travel itself.

### Events

Add `PlayerChangeDimensionEvent` (cancelable, with `from`, `to`, `arrival`) and `EntityPortalEnterEvent` to `events/Events.ts`, following `PlayerMoveEvent`. Dragonfly exposes `HandlePortalActivate`, `HandlePortalCreate` and `HandlePortalTravel`; the second is what lets a plugin stop a portal from being carved into a build.

### Test plan

Unit tests, beside the code.

- `packages/block-behaviors/src/rules/portal.test.ts` through `harness.ts`: frame scan accepts 4x5 without corners, 23x23, fire anywhere inside; rejects 3x5, 24x23, a missing side block, crying obsidian; axis detection for both orientations; lighting writes the right `portal_axis`; a frame broken at one block clears the whole interior; a fire placed in the End lights nothing; the twelve-frame ring with one frame facing outward or missing an eye does not activate, the complete ring writes nine `end_portal`; the piglin roll per difficulty.
- `packages/prismarine/src/world/portal/scale.test.ts`: `floor(x / 8)` for negative coordinates (-29.9 to -4), `x * 8` back, y clamp into 0..127 and -64..319, world border clamp.
- `search.test.ts` over an in-memory `PortalIndex`: closest by Euclidean distance including y, radius 128 in both dimensions, a portal just outside the radius ignored, the two-ends-of-a-tall-portal case.
- `create.test.ts`: the two-pass footprint search picks the closest valid spot, the forced platform is clamped to `[70, maxY - 10]`, includes netherrack flanks, and the written frame is 4x5 with corners and six portal blocks on the source axis.
- `contact.test.ts`: 80 ticks in survival, 0 in creative, decay by 4 when stepping out, cooldown 300 for a mob and 10 for a player blocks re-entry, a passenger never travels.
- `DimensionTravel.test.ts` using `fakePlayer()` from `Player.test.ts`: the packet order (RemoveActor before ChangeDimension; ChangeDimension carries the target id and the arrival position; StopSound, NetworkChunkPublisherUpdate, server PlayerAction ChangeDimensionAck, LevelChunk with the target dimension id, PlayStatus PlayerSpawn); a single ChangeDimension for a real dimension change and the detour only for a same-dimension world swap; PlayerAuthInput ignored until the client's EndLoadingScreen with the expected id; a wrong id logged and ignored; respawn across dimensions sends `respawn: true`.

Integration, through the real client (`packages/client/src/Login.test.ts` pattern): boot a server with two Flat worlds configured as `overworld` and `nether`, log in, place the player in a hand-written lit portal (set blocks through `World.setBlockByName`), advance 80 ticks, and assert on `client.getSession()` events that `ChangeDimensionPacket` arrived with `dimension 1`, chunks arrived with `dimension 1`, and that after the client replies `ServerboundLoadingScreen EndLoadingScreen` the server's `Player.getWorld()` is the Nether world and a `MovePlayer` teleport followed. The client package needs codecs for `ChangeDimension`, `ServerboundLoadingScreen` and `PlayerAction` on its side; `ClientPacketRegistry` reports unknown ids, so the test can assert they are known.

Parity (`packages/parity`): this is a data-driven compatibility behavior, so a `blocks.portals` row (every block the `PORTALS` and frame tables name exists in the Bedrock palette with the states the rules read, and the Bedrock `portal_axis` values are exactly `unknown, x, z`) and a `protocol.dimension-change` row (the sequence from `DimensionTravel.transfer` round-trips through `Codec2193` and `Codec2225` and decodes to the same fields) keep the families represented.

## 7. Implementation chunks

Each chunk is a reviewable commit or two, in dependency order.

1. Dimension-aware worlds. `WorldData.dimension`, `buildWorld` passes it, startup loads every configured world, `WorldManager.getWorldByDimension` becomes the lookup travel uses, `Chunk` and LevelDB already follow. A `Flat` Nether proves it. Fix the `/tp` ordering bug while there.
2. Portal geometry in `block-behaviors`: `rules/portal.ts` with the frame scan, ring match, creation footprint and platform writer, plus `portalFamily` hooks for lighting, collapse, end portal activation and the piglin random tick. Harness tests. Overlay unchanged; `end_gateway` already carries `jsprismarine:portal`.
3. Entity portal contact: `portalCooldown` and `PortalContact` on `Entity`, the per-tick box-overlap dispatch in `World.update`, `PortalCooldown` persisted by both codecs. Unit tests for the timers.
4. `DimensionTravel.resolve`: the rules table, scaling, `PortalIndex`, search, creation, End platform and End exit. Unit tests against the Java constants in this note.
5. The wire sequence: `PlayerSession.changeWorld` replacing `Player.setWorld`'s body, the pending-change state keyed by loading screen id, `PlayerActionHandler` and `ServerboundLoadingScreenHandler` completing it, input dropped during the change, attributes and inventory re-sent after. `fakePlayer()` packet-order tests, and the client integration test.
6. Respawn across dimensions: `resolveOwnSpawn` resolving in the spawn's world, `RespawnHandler` transferring with `respawn: true`, bed and anchor dimension checks with the explosion left for later.
7. Non-player travel: items and mobs through `transfer`, Bedrock's no-passenger rule, and the `PlayerChangeDimensionEvent` and `EntityPortalEnterEvent`.
8. Terrain: a `Nether` generator over the existing Nether noise and biome source, then an `End` generator; the podium, dragon fight and gateways are a separate effort.
9. Parity rows `blocks.portals` and `protocol.dimension-change`, a Changeset for `@jsprismarine/block-behaviors`, `@jsprismarine/blocks` (if `families.ts` changes), `@jsprismarine/entities` and `@jsprismarine/prismarine`, and an entry for this note in `docs/research/README.md`.

## Reproduction

```sh
# Wiki pages as wikitext
for p in Nether_portal "Nether_portal_(block)" End_portal End_portal_frame "End_Portal_(block)" \
         "End_gateway_(block)" End_gateway Exit_portal Obsidian_platform The_End The_Nether \
         Respawn_anchor Bed Dimension Zombified_Piglin \
         "Bedrock_Edition_level_format/Entity_format" "Bedrock_Edition_level_format/Block_entity_format"; do
  curl -sL "https://minecraft.wiki/api.php?action=parse&page=$p&prop=wikitext&format=json&formatversion=2&redirects=1" -o "/tmp/portal-research/$(echo "$p" | tr '/' '_').json"
done

# Java 26.3 server jar, already cached by `pnpm dev` (ensure:worldgen)
cd /tmp/portal-research/jar
cp node_modules/.cache/jsprismarine/java-server/26.3/server.jar bundler.jar
unzip -o -q bundler.jar 'META-INF/versions/*/server-*.jar' && cp META-INF/versions/*/server-*.jar inner.jar
J=/Library/Java/JavaVirtualMachines/temurin-27.jdk/Contents/Home/bin/javap
$J -p -constants -classpath inner.jar net/minecraft/world/level/portal/PortalShape
$J -p -constants -classpath inner.jar net/minecraft/world/level/portal/PortalForcer
$J -p -c -constants -classpath inner.jar net/minecraft/world/entity/Entity | sed -n '/public int getDimensionChangingDelay/,/^$/p'
$J -p -c -constants -classpath inner.jar net/minecraft/world/entity/player/Player | sed -n '/public int getDimensionChangingDelay/,/^$/p'
$J -p -c -constants -classpath inner.jar net/minecraft/world/entity/vehicle/VehicleEntity | sed -n '/public int getDimensionChangingDelay/,/^$/p'
$J -p -c -constants -classpath inner.jar net/minecraft/world/entity/PortalProcessor
$J -p -c -constants -classpath inner.jar net/minecraft/world/level/block/NetherPortalBlock
$J -p -c -constants -classpath inner.jar net/minecraft/world/level/block/EndPortalBlock
$J -p -c -constants -classpath inner.jar net/minecraft/world/level/block/EndPortalFrameBlock | grep -E 'ldc|HAS_EYE'
$J -p -c -constants -classpath inner.jar net/minecraft/world/level/levelgen/feature/EndPlatformFeature
$J -p -c -constants -classpath inner.jar net/minecraft/server/level/ServerLevel | grep -B3 -A3 END_SPAWN_POINT
$J -p -c -constants -classpath inner.jar net/minecraft/world/level/gamerules/GameRules | grep -A6 nether_portal
$J -p -c -constants -classpath inner.jar net/minecraft/data/worldgen/DimensionTypes | grep -E 'ldc2_w|sipush|bipush'
$J -p -constants -classpath inner.jar net/minecraft/world/level/block/entity/TheEndGatewayBlockEntity

# Mojang protocol schemas (main branch, 1.26.60-beta.0 / 2225)
for f in ChangeDimensionPacketPayload PlayerActionType ServerboundLoadingScreenPacketPayload RespawnPacketPayload \
         DimensionDefinition DimensionDataPacketPayload SetSpawnPositionPacketPayload NetworkChunkPublisherUpdatePacketPayload; do
  curl -sL "https://raw.githubusercontent.com/Mojang/bedrock-protocol-docs/main/json/$f.json"
done

# Reimplementations
curl -sL https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/packet/change_dimension.go
curl -sL https://raw.githubusercontent.com/CloudburstMC/Protocol/3.0/bedrock-codec/src/main/java/org/cloudburstmc/protocol/bedrock/codec/v712/serializer/ChangeDimensionSerializer_v712.java
curl -sL https://raw.githubusercontent.com/df-mc/dragonfly/master/server/session/session.go | sed -n '/func (s \*Session) handleWorldSwitch/,/^func (s \*Session) ChunkRadius/p'
curl -sL https://raw.githubusercontent.com/df-mc/dragonfly/master/server/world/portal/nether.go
curl -sL https://raw.githubusercontent.com/df-mc/dragonfly/master/server/world/portal/end.go
curl -sL https://raw.githubusercontent.com/df-mc/dragonfly/master/server/entity/travel.go
curl -sL https://raw.githubusercontent.com/GeyserMC/Geyser/master/core/src/main/java/org/geysermc/geyser/util/DimensionUtils.java
curl -sL https://raw.githubusercontent.com/GeyserMC/Geyser/master/core/src/main/java/org/geysermc/geyser/translator/protocol/bedrock/entity/player/BedrockPlayerActionTranslator.java
curl -sL https://raw.githubusercontent.com/CloudburstMC/Nukkit/master/src/main/java/cn/nukkit/Player.java | sed -n '/public void setDimension/,/^    }/p'

# This repository
rg -n "portal|ChangeDimension|loadingScreen|getDimension\(\)" packages/prismarine/src packages/block-behaviors/src packages/protocol/src --glob '!*.test.ts' | head -100
sed -n 15429,15431p packages/minecraft/src/generated/v2193/block-schemas.ts
sed -n 7173,7176p packages/minecraft/src/generated/v2193/block-schemas.ts
```
