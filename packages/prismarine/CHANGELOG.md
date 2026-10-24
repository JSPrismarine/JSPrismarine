# @jsprismarine/prismarine

## 0.15.0

### Minor Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - `Event.isCanceled`, `BlockEntityRegistry.isModeled`, and `EntitySerializer.isModeled` replace their British spellings. Update imports and calls to the American names. `vanillaRecipes` also uses American spellings in its two generated recipe IDs; callers that store those IDs must update them.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`f7d2297`](https://github.com/JSPrismarine/JSPrismarine/commit/f7d2297ce7176489a19a141ab4b071eb7a2461a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Read the game data from CloudburstMC/Data at 1.26.50, because pmmp/BedrockData is gone.
  
  The `resources` submodule pointed at pmmp/BedrockData, pinned to 1.21.40. That repository was archived in July 2026 at 1.26.30 and will never carry the version this server targets, so the submodule now points at [CloudburstMC/Data](https://github.com/CloudburstMC/Data) at commit `659ce1e`, which is the 1.26.50 drop. The pin is a commit rather than a branch on purpose: the branch head carries 1.26.60, whose item runtime ids disagree with protocol 2193. Its item table was checked against this project's own capture of a 1.26.51 server and agrees on all 2076 items, ids and component flags included.
  
  **21 vanilla recipes come back.** `item_tags` stopped at 1.21.40 and had never heard of `minecraft:egg`, `minecraft:metal_nuggets` or `minecraft:mushrooms_for_stew`, so every recipe asking for one was dropped as unsatisfiable - correctly, for the wrong reason. The table is now dragonfly's, at 1.26.50 and 77 tags, vendored under `src/vendor` with its MIT notice.
  
  **The creative menu gains its headings and 62 entries.** The old list had 1919 entries, 1918 of which the item table could name, and no group data at all, so `CreativeContentPacket` filed everything under one anonymous group. The new one has 1980 entries and 124 groups across the four tabs. `CreativeContentPacket.items` becomes `entries`, each an item and the group it sits under, and `CreativeInventory` gains `getEntries` and `getGroups`.
  
  Removed, none of which had a consumer: `banner_patterns`, `biome_id_map`, `entity_id_map`, `block_id_map`, `biome_definitions` (superseded by `biome_definitions_network`), `canonical_block_states` and `r12_to_current_block_map`. `item_tags` is now typed by the question a caller asks - a tag name is a string, not one of the 77 keys the file happens to hold. The published `dist` drops from 22 MB to 5.3 MB, because the submodule's raw files are inputs to the generator and were never meant to be bundles.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop dependencies and constructs that block ahead-of-time compilation with scriptc.
  
  - `@jsprismarine/logger` no longer wraps winston. The `Logger` API is unchanged; transports now implement the package's own `LogTransport` interface, and a `FileTransport` replaces winston's file transport.
  - `@jsprismarine/color-parser` declares its ANSI sequences directly instead of reading them out of chalk-cjs. The emitted escapes are identical; the chalk-specific exports are gone.
  - `@jsprismarine/prismarine` decodes login JWTs with plain base64url instead of fast-jwt, parses config files with json5 and js-yaml instead of confbox, and drops the debug-only `Symbol.toStringTag` accessors on `Entity`, `Block` and `BlockState`.
  - `@jsprismarine/brigadier` merges the exception classes into one module to remove an import cycle; the old module paths re-export from it.
  - `@jsprismarine/math` widens `Vector3.equals` to accept `Vector2` (returning `false`), matching the base signature.
  - `@jsprismarine/server` reads env files with `process.loadEnvFile` instead of dotenv.

- [#2592](https://github.com/JSPrismarine/JSPrismarine/pull/2592) [`5a94fc5`](https://github.com/JSPrismarine/JSPrismarine/commit/5a94fc5b9ffab382f86092dea42cbe768f7b9acc) Thanks [@filiphsps](https://github.com/filiphsps)! - Require lowercase command literals and correct the gamerule command name.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9d3de40`](https://github.com/JSPrismarine/JSPrismarine/commit/9d3de4018f18712d426d0cc4246849d7dfbc4c3b) Thanks [@filiphsps](https://github.com/filiphsps)! - `Packets.AdventureSettingsPacket` is gone. The class is exported as `Packets.UpdateAdventureSettingsPacket`, its real name; update imports that used the alias.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5c8d0aa`](https://github.com/JSPrismarine/JSPrismarine/commit/5c8d0aa8e9481714f17eb3a6568b79fcf8d7a2fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Every entity now spawns under an actor type the client was told about in `AvailableActorIdentifiersPacket`. `EvokerIllager` uses `minecraft:evocation_illager` instead of the unknown `minecraft:evoker_illager`. The `Chalkboard`, `MovingBlock` and `Shield` entity classes are removed from `Entities`: their types are not in the 1.26.51 identifier list, so a client could never draw them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`5939ba5`](https://github.com/JSPrismarine/JSPrismarine/commit/5939ba5a647da3c987e05f3753e5dc829955bad3) Thanks [@filiphsps](https://github.com/filiphsps)! - `ConfigBuilder` keeps the comments and blank lines in a config file when it writes a key, and a key it writes for the first time can carry a comment: `get(key, defaults, comment)` and `set(key, value, comment)`. Reading goes through the new `ConfigDocument` layer (exported too), built on `yaml` and `jsonc-parser`, which edit the file text in place rather than dumping a value over it. A `.json` config may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. A file that does not parse now raises an error naming the file instead of being treated as empty and overwritten with defaults.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`06dd676`](https://github.com/JSPrismarine/JSPrismarine/commit/06dd676cc007df4aa616b858767c358477a72410) Thanks [@filiphsps](https://github.com/filiphsps)! - `InputMode.MotionController` in `network/packet/PlayerAuthInputPacket` is now `InputMode.MotionController_Deprecated`, the name Mojang's datagen snapshot gives member 4. The 1.26.51 docs' member list drops it, but the value is still below `Count` (5), so the member stays. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9a1abc3`](https://github.com/JSPrismarine/JSPrismarine/commit/9a1abc305179d8c5d573d353971a23475daf8c4d) Thanks [@filiphsps](https://github.com/filiphsps)! - The enums exported from `network/packet/InventoryTransactionPacket` now carry the docs' names: `UseItemAction` is `ItemUseActionType` with members `PLACE`, `USE`, `DESTROY` and `USE_AS_ATTACK` (formerly `CLICK_BLOCK`, `CLICK_AIR`, `BREAK_BLOCK`), `UseItemOnEntityAction` is `ItemUseOnActorActionType`, `ReleaseItemAction` is `ItemReleaseActionType`, and `ActionSource` is `InventorySourceType`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`047d691`](https://github.com/JSPrismarine/JSPrismarine/commit/047d6911d8423575826102154a49ca1911261bb8) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename four enums under `network/packet/` to the docs' names: `CreativeCategory` is now `CreativeItemCategory`, `ResourcePackType` is `PackType`, `LoadingScreenPacketType` is `ServerboundLoadingScreenPacketType`, and `PlayerLocationType` is `PlayerLocationPacketType`. Members and values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`651a963`](https://github.com/JSPrismarine/JSPrismarine/commit/651a963921bfcb9bd72ab40323acecd8e3dd91d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Enum members under `network/` now carry the docs' names. `RespawnState` is `PlayerRespawnState` with members `SearchingForSpawn`, `ReadyToSpawn` and `ClientReadyToSpawn`; `SpawnType` is `SpawnPositionType` with `PlayerRespawn` and `WorldSpawn`; `CreditsState.End` is `Finished`; `InteractAction.LeaveVehicle`, `MouseOver` and `OpenNPC` are `StopRiding`, `InteractUpdate` and `NpcOpen`; `CommandBlockMode.Impulse` is `Normal`; `CommandOriginType.Block` and `MinecartBlock` are `CommandBlock` and `MinecartCommandBlock`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `PlayStatusType` enum to `PlayStatus`, the docs' name, and move it from `network/type/PlayStatusType` to `network/type/PlayStatus`. Its members now carry the docs' names: `LoginFailedClient` is `LoginFailed_ClientOld`, `LoginFailedServer` is `LoginFailed_ServerOld`, `LoginFailedInvalidTenant` is `LoginFailed_InvalidTenant`, `LoginFailedVanillaEdu` and `LoginFailedEduVanilla` are `LoginFailed_EditionMismatchEduToVanilla` and `LoginFailed_EditionMismatchVanillaToEdu`, `LoginFailedServerFull` is `LoginFailed_ServerFullSubClient`, and `LoginFailedEditorVanilla` and `LoginFailedVanillaEditor` are `LoginFailed_EditorMismatchEditorToVanilla` and `LoginFailed_EditorMismatchVanillaToEditor`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `PlayerAction` enum exported from `network/packet/PlayerActionPacket` to `PlayerActionType`, the docs' name. Members now carry the docs' names in PascalCase: `START_BREAK` is `StartDestroyBlock`, `JUMP` is `StartJump`, `BUILD_DENIED` is `DenyDestroyBlock`, `CREATIVE_PLAYER_DESTROY_BLOCK` is `CreativeDestroyBlock`, `DIMENSION_CHANGE_ACK` is `ChangeDimensionAck`, `START_SPRINT` is `StartSprinting`, and so on for every member. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`efd7572`](https://github.com/JSPrismarine/JSPrismarine/commit/efd757225cfc82132c928c25996b69ee0e43e780) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerLocationPacketType` in `network/packet/PlayerLocationPacket` uses the docs' member names: `Coordinates` is now `PLAYER_LOCATION_COORDINATES` and `Hide` is `PLAYER_LOCATION_HIDE`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `MovementType` enum to `PositionMode`, the name the Bedrock docs give the Position Mode byte of `MovePlayerPacket`. Its members `Reset` and `Pitch` are now `Respawn` and `OnlyHeadRot`, matching the docs. Values are unchanged. The import path moves from `network/type/MovementType` to `network/type/PositionMode`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fcc8ebf`](https://github.com/JSPrismarine/JSPrismarine/commit/fcc8ebffa6b7b4f56da20211c251780b303219b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `network/type/AnimateActionType` and `network/type/ViolationType`, and the `Types.AnimateActionType` export. Both duplicated enums that the packet files already define with the docs' names: use `AnimateAction` from `network/packet/AnimatePacket` and `PacketViolationSeverity` from `network/packet/PacketViolationWarningPacket`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c7e1818`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e18181643ebdec5efadcc2d00e0bcf36626882) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackStackPacket` now writes the full protocol 2193 stack. Each `texturePackList` entry is a `PackInstanceId` with `packId`, `version` and `subPackName`, the `baseGameVersion` string and `includeEditorPacks` flag are fields instead of hardcoded values, and `experiments` is an `Experiment` array written with the uint32 little-endian count the docs specify. The packet also decodes. The unused `addonList` field is gone and `experiments` is no longer a `Map`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`800f815`](https://github.com/JSPrismarine/JSPrismarine/commit/800f81543aa7fce7a7d1ca0e93318f430a100cbb) Thanks [@filiphsps](https://github.com/filiphsps)! - `StructureSettings` and its `Rotation`, `Mirror` and `AnimationMode` enums now live in `network/type/StructureSettings`, together with `defaultStructureSettings`, `readStructureSettings` and `writeStructureSettings`. `StructureBlockUpdatePacket` and `StructureTemplateDataRequestPacket` share them instead of each exporting its own copy; the `Structure*`-prefixed enums are gone, and `Rotation` carries the docs' `Clockwise90`, `Clockwise180` and `CounterClockwise90` aliases for 1, 2 and 3. Field names follow the docs: `shouldIgnoreEntities`, `shouldIgnoreBlocks`, `shouldAllowNonTickingPlayerAndTickingAreaChunks` on `StructureSettings` and `shouldIncludePlayers`, `shouldShowBoundingBox` on `StructureEditorData`. Wire bytes are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `TextType` enum to `TextPacketType`, the docs' name for the Message Type of `TextPacket`, and move it from `network/type/TextType` to `network/type/TextPacketType`. `Types.TextType` is now `Types.TextPacketType`. Members now use the docs' names: `Translation` is `Translate`, `System` is `SystemMessage`, and `JsonWhisper`, `Json`, `JsonAnnouncement` are `TextObjectWhisper`, `TextObject`, `TextObjectAnnouncement`. Values are unchanged.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Send positional packets only to the players near them, and stop sending several of them to the entire server.
  
  Nothing filtered by distance. Two players ten thousand blocks apart still received each other's movement, each other's block updates and each other's sounds, and each other's arm swings. The code knew: `World.sendWorldEvent` and `World.sendActorEvent` both carried a `// TODO: Limit distance`, the second of them reading "as with every other broadcast here".
  
  Several of those broadcasts were worse than world-wide. Block placement, the animate handler, the disconnect despawn loop, the pairwise spawn at join and `Player.sendSettings` all went through `SessionManager.getAllPlayers()`, so they reached every player on the server regardless of which world they were in. Latent while only one world is loaded, and a wall in front of any multi-world work.
  
  Recipients are now chosen in one place. `World.getViewers(position, options)` answers "who should be told about this", and `World.broadcast` and `World.broadcastAround` are the two ways to reach them; `Server.broadcastPacket` stays as the genuinely global channel for the player list, the command tree and shutdown. Chat, the time of day and the command tree are unchanged.
  
  The test is done in chunk space against the recipient's own negotiated view distance, not against a fixed radius and not against the set of chunks the server believes it has sent. That last option is nominally the most accurate and is the wrong trade: `loadedChunks` is only marked once a batch has finished compressing and is never marked if that compression fails, so building entity visibility on it makes a compression failure show up as permanently invisible mobs. Being slightly too generous costs a packet the client discards on its own; being too stingy costs an entity that is never drawn. The chunk test is circular rather than square because `needNewChunks` loads terrain on `dx² + dz² > viewDistance²` — what a client holds is a disc, so a square test would send updates for four corners it has no ground for. Both cost the same arithmetic.
  
  Entity visibility follows vanilla in being per type rather than one radius for everything. `Entity.getTrackingRange` and `getTrackingInterval` default to 8 chunks and 3 ticks; players override to 32 chunks — past any view distance, so the viewer's own radius decides — and dropped items to 6 chunks and 20 ticks. Items are the reason this matters: they are the most numerous entity in any world and the least worth seeing at a distance, and one mob farm at the generic radius streams thousands of them to everybody nearby.
  
  Each session now tracks which entities its client actually holds, reconciled when the player crosses a chunk boundary and every few ticks otherwise, with hysteresis between the radius at which an entity appears and the one at which it goes away — with a single radius a player standing on the boundary produces an `AddActor` and a `RemoveActor` for everything out there on alternating passes. Entities are recorded as tracked only after their spawn has reached the wire, so a failed spawn is retried rather than being remembered as delivered and never sent again. Movement is gated on that tracked set rather than on distance: a `MoveActorAbsolutePacket` for a runtime id a client was never given is discarded at the other end anyway, which makes tracking both the correct gate and a set lookup instead of arithmetic on the hottest path in the server.
  
  `proximity-broadcast: false` turns the filtering off. It restores world-wide delivery, not the server-wide fan-out, which was a bug rather than a behavior. `entity-tracking-hysteresis` and `entity-tracking-interval` tune the rest.
  
  Three bugs came out of the audit that had nothing to do with distance:
  
  `Player.sendSettings` sent one player's `UpdateAdventureSettingsPacket` to every other client. That packet has no target actor field at all — it describes the client receiving it — so a single spectator set `worldImmutable`, `noAttackingPlayers` and `noAttackingMobs` on everybody else on the server. `PlayerSession.sendSpawn` had the same defect the other way round, pushing the *viewer's* settings onto the player being spawned on every spawn. Adventure settings now go to their own client only; `UpdateAbilitiesPacket`, which does carry `targetActorUniqueId`, still reaches everyone who can see the player.
  
  The chat listener was never unregistered. It was registered with `this.chatHandler.bind(this)` and removed by passing the naked method, which is a different function object, so every disconnected player stayed subscribed to chat for the life of the process.
  
  `CoordinateUtils.fromBlockToChunk` was `v >> 4`, and `>>` converts through `ToInt32`, which truncates towards zero. Entity positions are floats, so anything standing between -1 and 0 was placed in chunk 0 rather than chunk -1.
  
  Performance, alongside the reduction in recipients:
  
  Broadcasts compress once. `Server.broadcastPacket` was a serial `await` in a loop that built a fresh `BatchPacket` per recipient, so one `UpdateBlockPacket` going to twenty players was twenty runs of zlib over identical bytes, each waiting on the one before it. `MinecraftSession.sendSharedBatch` frames bytes somebody else encoded, through the same ordering chain so it cannot overtake a chunk batch still compressing.
  
  `needNewChunks` no longer runs every tick. It rebuilt a heap of a few hundred candidates twenty times a second per player, for a player who had not moved a block; it now runs when the player changes chunk, which is the same signal that drives entity visibility.
  
  A tick's movement is deduplicated per entity. `Entity.setX`, `setY` and `setZ` each announce a move of their own, so a single diagonal step queued three identical packets naming the same destination.
  
  `SetTimePacket` goes out once a second instead of twenty times a second. The client runs its own day cycle in between, which is why the packet is in the default `log-excluded-packets` in the first place.
  
  Dead code removed: `Player.chunkSendQueue`, a `Set<Chunk>` never read or written that shadowed the real queue on `PlayerSession` by name; `PlayerSession.sendChunk`, which had no callers and was superseded by `flushChunkBatch`; and `DataPacket.getAllowBatching`, which read a field nothing ever set. `PlayerSession.send` now returns its send instead of dropping the promise, so awaiting a broadcast means something and framing errors are no longer swallowed. `PlayerSession.broadcastMove` is renamed `sendMove`, since it sends to one session and the fan-out of that name lives on `World`. `SessionManager.getAllPlayers` now filters on `isOnline()` as `World.getPlayers` already did, so a connection still in the login handshake is no longer among the recipients of every broadcast.
  
  `Vector3` gains `distanceTo` and `distanceSquaredTo`. There were five hand-rolled copies of that arithmetic across the server using three different metrics.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`2b474b7`](https://github.com/JSPrismarine/JSPrismarine/commit/2b474b739ec7420dea21d02751fbb66f3a7f6a04) Thanks [@filiphsps](https://github.com/filiphsps)! - Give worlds their real vertical range. The Overworld is now -64 to 319 across 24 sub chunks, as it has been in vanilla since 1.18, instead of 0 to 255 across 16.
  
  A new `Dimension` describes where a world's floor sits and how tall it is, and every vertical bound - sub chunk indices, the serialiser's loops, generator and decorator depth bands - derives from it rather than from a constant. Sub chunk indices are signed, so index -4 is the Overworld's bottom sub chunk, which is also exactly how a Bedrock world stores it.
  
  `Chunk.networkSerialize` no longer prepends four hardcoded empty sub chunks to fake the space below y=0; that space is real now, and a dimension whose floor is above the client's still gets the padding it needs, derived rather than hardcoded.
  
  Fixes four defects in the chunk stack that this uncovered, all of which broke reading a chunk back:
  
  - `Chunk`'s constructor ignored the sub chunks it was handed, so every chunk read from disk came out empty and the Filesystem provider silently regenerated the terrain instead.
  - `SubChunk.networkDeserialize` skipped the version byte and read its value, 8, as the layer count.
  - `Chunk.networkDeserialize` always read a fixed 16 sub chunks however many were written, and never consumed the biome and border trailer.
  - `getSubChunk` accepted an index one past the top of the world.
  
  `Chunk.getHighestBlockAt` now returns `null` for an empty column rather than `-1`, which is a height a real block can occupy once the floor is below zero.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the `Filesystem` world provider. `LevelDB` is the only default.
  
  It wrote each chunk as its own file containing the network payload — the bytes the server puts on the wire, which is a format nothing else reads, not the game and not any other server. It never wrote block entities, entities or level metadata, so anything the world held beyond terrain was gone on the next load; and because a chunk that failed to read fell through to `generator.generateChunk`, a world that had silently stopped saving looked exactly like a world that was working.
  
  `LevelDB` was already the default for a world with no `provider:` line. It is now the only one alongside `Anvil`.
  
  A config still naming `Filesystem` is refused at startup rather than quietly switched. The two keep their chunks in different places, so loading one as the other would present an empty world where a populated one used to be, which is the one failure mode worth being loud about. The error names the providers that do exist.
  
  `LevelDB` already warned when it found a `chunks` directory and no `db` beside it; it still does, and still touches nothing, but no longer suggests setting `provider: Filesystem` to get the old world back. There is nothing to convert those files into.
  
  `Server.test.ts` now gives each of its two servers a world of its own. Both stub `shutdown`, so the first server is left holding its world, and LevelDB takes a directory lock — two writers on one world delete each other's files rather than racing for a stale read. Sharing a folder was invisible under a provider with no locking and is a correct refusal under this one.

### Patch Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - Give players somewhere to put armor, so the armor they already had starts working.
  
  Both ends of this were finished long before the middle was. Twenty-four armor items have declared their defense points since they were written, and the damage formula has known what to do with them since the pipeline was laid - but `HumanInventory` was `super(36)` and nothing else, so there was nowhere to read from and every blow landed as though the player were naked.
  
  **The armor is a container of its own**, not four more slots on the end of the main one. The client addresses it that way - `ContainerUiId.ARMOR_CONTAINER`, window 120 - and anything walking the inventory looking for space would otherwise offer to put a pickaxe on your head. An off-hand slot comes with it, since the protocol carries the two together.
  
  Equipping works through the drag machinery that was already there: `ItemStackRequestHandler` learned to read and write the armor container alongside the cursor and the crafting grid, so the same code path that moves a stack between two inventory slots moves a helmet onto a head. The slot id is range-checked, because a request naming slot nine would otherwise write past the end of a four-slot container.
  
  **`MobArmorEquipmentPacket`** is what lets anybody else see it. `AddPlayerPacket` carries the held item and nothing more, so armor has to follow a player into view as a packet of its own - exactly as the skeleton's bow does. It is positional and always all five pieces, empty ones sent as air: a client that was handed three would read the next packet's bytes as the fourth.
  
  The `firedamage`-style rules already knew that drowning and starving ignore armor, so a chestplate now takes the edge off a sword and does nothing at all against a lungful of water. Toughness does what it was written to do - iron protects less and less as a blow gets harder, and diamond holds up.
  
  Durability is still not decremented, on armor or on weapons. It needs a slot to be told to the client as it changes, which is now possible, and it is the next thing rather than a thing left out.

- [#2600](https://github.com/JSPrismarine/JSPrismarine/pull/2600) [`f320277`](https://github.com/JSPrismarine/JSPrismarine/commit/f320277d45ccd2ed2242f07f3818264605b2e9b8) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Place a player who has no saved position the way a Bedrock Dedicated Server does. The feet go one block above the stored spawn height, centered on the block. A spot inside solid blocks moves up to the first free space, and a spot above leaves moves to a random column up to 15 blocks away. The join now sends BDS's `StartGame` position for that player and the three `Respawn` packets BDS sends after the inventory. New worlds store the surface block itself as the spawn height, which is how Bedrock worlds store it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the codec for Minecraft: Bedrock Edition's on-disk chunk format, so a world folder can be read and written exactly as the game writes it.
  
  - **Keys.** Chunk records are addressed by x and z as signed little endian int32s, the dimension only when it is not the Overworld, a tag byte, and for a sub chunk a *signed* index byte - 0xfc is -4, the Overworld's bottom slice. Non-chunk keys such as `~local_player` and `portals` are recognized as not being chunk records rather than mis-parsed.
  - **Sub chunks.** Versions 1, 8 and 9, including the second storage layer that water-logging uses. The version a sub chunk was read at is kept, so writing it back does not silently upgrade it.
  - **Block storage.** The same bit packing as the network form, but with the persistent flag clear, a fixed width palette count, and each palette entry an NBT compound of `{name, states, version}`. Palette entries go through the existing `BlockRuntimeIds`, which already hashes exactly that compound - so there is no second mapping table to keep in step. A block this version does not know resolves to the unknown id, and a known block with an unknown property value falls back to its default state, rather than either making a whole world unreadable.
  - **Biomes.** The `Data3D` record: a 512 byte heightmap measured from the world floor, then one palette per sub chunk with little endian int32 biome ids, including the header byte that means "the same as the sub chunk below" and the truncated tail the game leaves when the rest would all inherit.
  - **level.dat.** The 8 byte header and little endian NBT payload, plus `levelname.txt`, keeping the previous file as `level.dat_old` the way the game does.
  
  `BlockStorage` gains `getPalette` and `getPaletteIndexAt`, which the disk codec needs to write the packed indices directly instead of round-tripping every block through the palette. `@jsprismarine/bedrock-data` now exports `biome_id_map`.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Move JSBinaryUtils into the monorepo as `@jsprismarine/binaryutils`.
  
  It was developed in its own repository and consumed here as a pinned npm dependency, which meant a
  change to the binary stream needed a release there before it could be used here. It now lives in
  `packages/binaryutils` and every consumer resolves it through the workspace, so it builds, typechecks
  and tests together with the packages that use it.
  
  The published name changes: `@jsprismarine/jsbinaryutils` is deprecated on npm and its last release
  re-exports this package, so existing installs keep working. The API is unchanged.
  
  Two things came along with the jump from the pinned 5.5.3 to current: `write()` accepted a
  `Uint8Array` in its signature but called `Buffer#copy` on it, so anything not already a `Buffer`
  threw at runtime — it now uses `set`. And the single internal `buffer` field is split into a read and
  a write buffer, so code reaching past the public API to assign `.buffer` no longer populates the read
  side; use `setReadBuffer()`.
  
  `@jsprismarine/protocol` also gained the dependency in its manifest — it imported the package while
  relying on it being hoisted into the root `node_modules`.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`30008ec`](https://github.com/JSPrismarine/JSPrismarine/commit/30008ec028477ee99d2fa503e421c21de4207787) Thanks [@filiphsps](https://github.com/filiphsps)! - Model block entities, and give entities a form they can be stored in.
  
  `packages/prismarine/src/blockentity/` is new: a `BlockEntity` base, a registry that mirrors `entity/Entities.ts`, and classes for chests, barrels, shulker boxes, hoppers, furnaces, signs, skulls, beds, banners, item frames and mob spawners. `Chunk` holds them, keyed by position, and drops one when the block it belonged to is replaced, so a broken chest cannot leave an orphan tile behind. `EntitySerializer` and `GenericEntity` do the same job for actors.
  
  Both follow one rule, and it is the whole design: reading keeps the *entire* source compound, a class lifts out only the fields it models, and writing starts from what is left and puts those fields back. A type nobody has modeled becomes the generic form, whose remainder is everything, and round-trips byte for byte.
  
  That is not tidiness. A world is full of blocks and mobs written by versions and behavior packs this server knows nothing about, and a provider that wrote back only the fields it understood would erase a player's chests one save at a time with nothing to say it had happened. For actors it is stricter still: vanilla NBT carries a `definitions` list naming the component groups the actor was assembled from, and one saved without it comes back broken.
  
  A sign is read in both the flat pre-1.19.80 shape and the current front-and-back-face one.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`2423ed0`](https://github.com/JSPrismarine/JSPrismarine/commit/2423ed0c8b5ada9b59c6441f1c2bbcd70df8c554) Thanks [@filiphsps](https://github.com/filiphsps)! - Give blocks physics, and players fall damage.
  
  Four behaviors were asked for - plants breaking when their support goes, sand and gravel falling, water running into holes, and fall damage - and the first three are the same problem wearing different hats: something changed *there*, so something may now have to happen *here*. So the work is one mechanism and three rules rather than three features.
  
  **`World.setBlockRuntimeId` is now the only way a block changes.** It writes the block, tells every client, and queues the block and its six neighbors to look at themselves. `breakBlock` and block placement both go through it, which is what makes breaking or placing anything have consequences; a caller that writes into a chunk directly changes the world without anything noticing, and the sand above stays in mid air.
  
  **`BlockUpdateScheduler`** holds the queue. It deduplicates by position, because a cascade queues the same places repeatedly and would otherwise grow faster than it drains; it supports delays, because water spreads on a timer and a falling block descends a block at a time; and it has a per-tick budget, so a lake breached into a cavern is spread over several ticks rather than taking one down.
  
  **The rules** live in `world/physics/`, keyed by block state name. Deliberately not by the registered `Block` classes: those cover eighty of the twelve hundred blocks the client knows and `getBlock` returns air for the rest, so a rule that consulted them would silently do nothing for most of what world generation actually places - which is the worst way for physics to fail, since it looks implemented.
  
  - Plants, crops and torches break and drop when what holds them up is removed. A block at the edge of the loaded world is assumed supported rather than guessed at, so borders do not strip themselves.
  - Sand and gravel are handed to a `FallingBlock` entity, which accelerates under vanilla's figures and turns back into a block where it lands - or drops as an item if the place it came to rest will not take one. It has to be an entity: a block is only ever in one place or another, so stepping it down through the world could only ever move it at a fixed rate, and sand would drift rather than drop. The client draws it from the block runtime id in its `VARIANT` metadata, which is also why `Metadata` gained a `setInt` - a short would truncate the hash to nonsense.
  - Water spreads outward losing a level each block and falls at full strength, so it goes *down* a hole rather than across the floor, and a waterfall does not thin out on the way. Flowing water with nothing feeding it dries up, so breaking a source takes the stream with it.
  
  **Fall damage** is a half-heart per block past the third, canceled by water and by the other things that break a fall, and never charged to a creative or flying player. Movement is client authoritative here, so the server cannot simulate the fall and instead adds up the positions it is told about - which means rising has to reset the distance, or every jump would be measured from the floor it started on.

- [#2589](https://github.com/JSPrismarine/JSPrismarine/pull/2589) [`733c0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/733c0e1ed7bca0a47a4a1be9b13821413916a420) Thanks [@filiphsps](https://github.com/filiphsps)! - Add shared Yargs-based command-line parsing and shell completion to the server and client. The server accepts `--port`, and the development launcher forwards command-line arguments to it.

- [#2593](https://github.com/JSPrismarine/JSPrismarine/pull/2593) [`b4ec81c`](https://github.com/JSPrismarine/JSPrismarine/commit/b4ec81c119bf3a4d95660541c438d07d8fca58cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Log the configured server port when starting without an explicit bootstrap port.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`d4e1796`](https://github.com/JSPrismarine/JSPrismarine/commit/d4e1796deb7b4132021b362ef3561df3f958de72) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode the client cache status packet instead of warning about it on every join.
  
  The client sends `ClientCacheStatusPacket` (0x81) once after login to say whether it can keep a blob cache. The server had no class for it, so every join logged `Packet 0x81 isn't implemented`. It now decodes the flag and records it at debug level. Chunks still go out with the cache off, so nothing on the wire changes ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - The client can log in. `@jsprismarine/client` connects to a Bedrock server, completes the handshake and stands in the world - proved by a test that boots a real `Server` in-process and joins it with nothing mocked in between.
  
  **`@jsprismarine/auth`, new.** The login identity: the JWT chain, the client data blob, and the P-384 key both are signed with. A package of its own because the proxy shares it - it needs to *verify* an incoming chain when acting as a server in online mode, which a client never does. A provider is chosen at the edge of the application, so which one is in play is a deployment decision rather than a build-time one. `OfflineAuthProvider` signs the single self-signed chain link a real client sends when it is not signed in, and generates its key per instance, because the key *is* the identity: five hundred bots under one name still need five hundred of them.
  
  The default skin is generated from flat color blocks laid over the regions the classic humanoid geometry samples. Mojang's textures cannot be redistributed and a client that refused to log in without one would be useless. It is also not optional in the way it looks: the server builds a `Skin` out of the client data and dereferences eighteen fields without checking any of them, so a client that omits one crashes the login handler rather than being refused.
  
  **Ten packets migrated to `NetworkPacket<T>`** - the ones a join cannot do without. `Login` is among them, and is encodable for the first time: `LoginPacket.encodePayload` had been a commented-out block with a hardcoded chain in it since it was written. `StartGame` is deliberately partial, reading the fields a client cannot function without and stopping; the rest is positional and would have to be modeled in full before any of it could be read. Stopping early is safe because a batch length-delimits each packet.
  
  **`@jsprismarine/client`, rebuilt.** It was a 230-line proof of concept that could not finish a handshake - it hardcoded RakNet protocol 10 against this repository's own 11, drove a *server* session by passing itself as `this as any`, and sent a Login that encoded nothing. It is now a transport seam, a packet registry with no `Server` in the signature, a batching session and a login state machine, and it depends on `@jsprismarine/protocol` rather than on the server.
  
  Three bugs found by pointing it at a real server:
  
  - **Inbound batches were dispatched out of order.** Decoding is asynchronous because inflating runs on libuv's thread pool, so a batch takes as long as its *size* says, and a large one was overtaken by every small one that arrived while it was still inflating. A 37 KiB `StartGame` surfacing after the `PlayStatus` that was meant to follow it is not a slow `StartGame`, it is a missing one - the login failed with "the server spawned us without ever sending StartGame" while the packet was still inflating. Inbound is now a chain, the receiving mirror of the one `MinecraftSession` already kept on the way out.
  - **`ResourcePackResponsePacket.encodePayload` could not be read by its own `decodePayload`**: a spare `writeUnsignedShortLE(0)` sat in front of the count. Latent while only the server handled this packet, which decodes and never writes one.
  - **`World.getPlayerData` raised "Player has no XUID"** for every unauthenticated player - a case `LoginHandler` explicitly permits, `savePlayerData` has always written a file for, and the very next line already had a fallback for. It logged as an error on every offline join. Reader and writer now share one key.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`98a5594`](https://github.com/JSPrismarine/JSPrismarine/commit/98a55948a7e966fc1e46ca13707a8212dedba6fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode the packets a 1.26.51 client sends during play instead of warning `Packet 0x.. isn't implemented` and dropping them.
  
  Twenty-three client-to-server packets gain a class, a handler, and a registry entry: `ServerboundLoadingScreenPacket`, `ServerboundDiagnosticsPacket`, `NetworkStackLatencyPacket`, `UpdateClientOptionsPacket`, `ClientCacheBlobStatusPacket`, `ResourcePackChunkRequestPacket`, `RequestAbilityPacket`, `RequestPermissionsPacket`, `ClientMovementPredictionSyncPacket`, `PlayerLocationPacket`, `EmotePacket`, `SetDifficultyPacket`, `ModalFormResponsePacket`, `BookEditPacket`, `LecternUpdatePacket`, `CommandBlockUpdatePacket`, `ServerboundPackSettingChangePacket`, `PlayerToggleCrafterSlotRequestPacket`, `BlockPickRequestPacket`, `ActorPickRequestPacket`, `MapInfoRequestPacket`, `AnvilDamagePacket`, and `SubChunkRequestPacket`. Each decodes the full protocol 2193 layout and logs at debug level. `EmotePacket` is also relayed to the other online players under the sender's runtime id with the server-side flag set; the rest change no server state yet, and each handler names the gap it leaves. `Identifiers` gains the ten ids that were missing.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031) Thanks [@filiphsps](https://github.com/filiphsps)! - Give damage an attacker, a grace period and a way of reaching the client.
  
  There was already a working health system - health is an attribute, `damage` takes it off, `onDeath` fires once on the transition - and falling, drowning and starving all used it. What it could not express was somebody doing it to somebody else, which is every interesting kind of damage there is. This lays the pipeline that the rest of combat is built on; nothing yet swings a weapon.
  
  **`DamageSource`** replaces the bare cause at the point where it matters. It carries who is answerable for a hit, what actually made contact when that is not the same thing, and how much extra shove the blow is worth. `damage()` takes either form - `DamageSource.of` normalizes - so every existing call site that only ever had a cause was left exactly as it was. `DamageCause` moved into a file of its own, re-exported from `Entity`, because `DamageSource` names both it and `Entity` and leaving it where it was would have closed a runtime import cycle. It gained the causes the rest of the work needs: lava, contact, suffocation, explosion, projectile, magic, wither and thorns.
  
  **The reduction formulas** are in `entity/Damage.ts` as pure functions, checked against numbers a player can look up: a ten point blow is six through full iron and three through diamond. Armor first, then the Protection enchantments on it, then Resistance - the order is load-bearing, since each takes a percentage of what the last one left. Armor points and armor *enchantments* are bypassed by separate lists, which is not fussiness: a fall ignores the points but is still reduced by Feather Falling, and folding the two together makes the best boots in the game do nothing.
  
  **Invulnerability frames.** Ten ticks after a hit lands, and the vanilla rule rather than the obvious one: a *harder* blow still gets through, for the difference, so swinging a better weapon at a freshly-hit target is worth doing. The flash, the shove and the timer belong to the hit that opened the period; a follow-up that only lands the difference is not a second hit to look at. Without any of this a mob standing in a cactus would die in a fifth of a second.
  
  **Knockback** is worked out in one place - direction from the source, strength from the blow, scaled by the knockback resistance attribute - and handed to an `applyKnockback` the two kinds of entity implement completely differently. A `Mob` queues it and spends it in `applyPhysics` alongside the shove from its neighbors, for the reason the comment there already gives: a blow is something happening *to* the mob, and putting it through the acceleration model would absorb two thirds of it. A `Player` cannot be moved by the server at all - their position is their own client's - so they are sent a velocity and asked to do it themselves, which is what `SetActorMotionPacket` is for.
  
  **A mob's health can now reach the client at all.** It could not before: the only code that sent attributes had the local player's runtime id written into it, so a mob's health changed on the server and no client was ever told. Attributes reached a client exactly once, inside the packet that spawned the entity - which is why the bar over a hurt zombie never moved and it appeared to die in one hit from full. `WorldChangeSink` gained `entityAttributesChanged`, the world drains each entity's dirty set once per tick next to where it flushes movement, and the replicator turns that into `UpdateAttributesPacket` for whoever is tracking the entity.
  
  **Death messages** moved out of `Player` into `entity/DeathMessages.ts` and learned who did it, so a death can be announced as somebody's work - and vanilla's distinction between being slain by a person and by a mob is kept. `World.getEntity(runtimeId)` exposes the map that was already there, because everything arriving from a client names an entity by runtime id and resolving that by walking every entity in the world is a linear scan for something a map answers in one step.
  
  `EntityDamageEvent` is cancellable and its amount writable, so a plugin can make a region safe or a mob tougher in one place rather than intercepting every source separately. `EntityDeathEvent` is not - by the time it runs the health is gone and the client has been told.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`d7ddc4f`](https://github.com/JSPrismarine/JSPrismarine/commit/d7ddc4fb1c0cd3493b22af3edc4274d529441d7b) Thanks [@filiphsps](https://github.com/filiphsps)! - Send command parameter types a 1.26.50 client understands ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).
  
  `CommandParameterType` still carried the argument type ids of a much older protocol (`Target` 7, `String` 0x20, `Position` 0x29), while `AvailableCommandsPacket` kept its own copy with newer numbers, so a `/tp` target went out typed as a comparison operator (id 7 in 2193) and every string as id 32, a selector argument value. Both now read from one table in `CommandParameter.ts` that matches gophertunnel's `command.go` at protocol 2193 (`Target` 8, `String` 56, `Position` 65, `Message` 67, `RawText` 70, `Json` 74, `Command` 87); the packet's unused `ARG_*` fields are gone. A soft enum parameter's type word also pointed at the hard enum table instead of the soft one, and a soft enum that only a parameter named was never written at all; the packet writes the collected soft enum list and indexes into it.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`9300913`](https://github.com/JSPrismarine/JSPrismarine/commit/93009135c3977ea4d43b5ab5de3460f674a698c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Print join, leave and death announcements on the console in English instead of as raw translation keys.
  
  These chats are sent to players as a `%`-prefixed key and parameters, which each client renders in its own language. The console has no client and logged `%multiplayer.player.joined` with the name dropped. It now fills the English text for the keys the server sends; an unknown key is printed with its parameters in brackets. The packets players receive are unchanged.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Make creepers explode, and align knockback with vanilla's.
  
  **`entity/Explosion.ts`** is a blast given a power rather than a creeper's method, because everything that explodes explodes the same way and differs only in how hard: TNT is 4, a creeper 3, a charged one 6. The damage curve is vanilla's - `((impact² + impact) / 2) × 7 × diameter + 1` - and it is steep on purpose, so a creeper at point blank does forty-three half-hearts and kills an unarmored player outright while one at four blocks costs a couple.
  
  Cover works. A ray is walked from the blast to the middle of each body and anything solid on the way stops it, so a wall between you and a creeper protects you. Deliberately all-or-nothing where vanilla grades a corner by sampling a grid of rays through the whole box - cheaper, and it gets the case that matters right. One thing that is *not* treated as cover is an unloaded chunk: `BlockView.isSolid` answers "yes" for anything not in memory, which is the correct conservative answer for a pathfinder and exactly the wrong one here, since it would have made a blast at the edge of the loaded world silently harmless.
  
  Blocks are removed as a sphere, gated on `mobGriefing`, and checked by *name* against a blast-proof list rather than through the block registry - the registry knows a fifth of the blocks the client does and returns air for the rest, so a blast-resistance check through it would quietly decide most of the world was air and blow up the lot.
  
  **`SwellGoal`** is the fuse. It is a goal and not an argument to `MeleeAttackGoal` because a creeper's attack is a *timer*: it stops, hisses, and is interruptible for a second and a half, none of which a swing has any concept of. Backing away puts it out, which is the point of the mob - a creeper is something you beat by moving rather than something that simply costs you health. It escapes at a wider range than it ignites at, so a target circling the boundary does not light and snuff it every other tick.
  
  **Mob metadata can now reach a client at all**, which the fuse needed and which had exactly the same shape as the attribute gap fixed earlier: everything that sent metadata had the local player's runtime id baked in, so it arrived once, inside the packet that spawned the entity. A creeper could light its fuse and a mob could catch fire with nobody ever seeing either. `WorldChangeSink` gained `entityMetadataChanged`.
  
  **Knockback now matches vanilla, and was too strong.** Vanilla shoves *twice* for a sprint hit - once from being hurt and once from the attack - and each shove halves whatever the last one left before adding its own. Modeling that as one combined impulse of `0.4 + 0.5` is not the same thing and is noticeably harder: it sent a sheep half again as far as vanilla does. The composition is now exact, so a sprint hit both throws less far and cancels more of the run the target was making. A plain hit is unchanged.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`58ef8d6`](https://github.com/JSPrismarine/JSPrismarine/commit/58ef8d68e9e96a7031c74d864af8e449ee440a2d) Thanks [@filiphsps](https://github.com/filiphsps)! - Despawn the old world's entities when a player changes world.
  
  The server used to forget what the client was showing and send nothing, on the assumption that a dimension change made the client drop every entity. It does not, so mobs from the world a player left stayed on screen in the new one. `Player.setWorld` now sends a `RemoveActor` for every entity the client held before the dimension change goes out.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`cc3a371`](https://github.com/JSPrismarine/JSPrismarine/commit/cc3a37165fe66ea44bc72fd48f8d59c0f2359031) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the world dangerous to everything in it, not just to players.
  
  Falling, drowning and burning were all implemented, and all of them applied to exactly one kind of entity. A player drowned; a zombie stood in lava indefinitely, at full health, for as long as the chunk stayed loaded.
  
  **`entity/Environment.ts`** holds the rules and nothing else - which blocks break a fall, how far is free, how often a burn hurts. Deliberately constants and small functions rather than a base class, because the two things that need them could hardly be less alike: a player's fall is *reported* by their own client and has to be added up from position packets, while a mob's is simulated here and falls straight out of its velocity. Only the rules are shared; the bookkeeping cannot be.
  
  **`BlockView` learned what a hazard actually does.** It already knew which blocks a mob would rather walk round, as a flat set - enough for the pathfinder, which only asks "would this hurt". The damage code needs to know *how*: burning to death and being pricked by a cactus are different deaths, and armor helps with one and not the other. The set became a map to a `DamageCause`, and the same lookup now also answers which blocks break a fall, so the whole of what a mob needs to know about where it is standing comes through the one synchronous reader the pathfinder already uses. Awaiting a chunk load per mob per tick would cost more than the mobs do.
  
  Mobs now take fall damage, burn in fire and lava and keep burning for eight seconds after getting out, are pricked by cacti, suffocate inside blocks, drown, and die in the void. The burn outlasting the fire is what makes walking *through* one worse than walking past it, and what makes water worth running to.
  
  **Which things breathe water is stated, not inferred.** The obvious proxy - a swim speed above a walk speed - reads correctly in vanilla and not here, because every mob currently gets the same movement attributes; it would have answered "no" for every fish in the game and drowned the lot of them. `MobStats` carries an `aquatic` flag instead. Dolphins and turtles are deliberately not aquatic: they breathe air, and in vanilla they drown.
  
  **The gamerules do something.** `falldamage`, `firedamage`, `drowningdamage` and `naturalregeneration` have been registered and defaulted since long before anything read one of them; they are now honored, for players as well as mobs. `GameRules.DrowingDamage` is spelled correctly at last - the *value* was always right, so the rule worked, but the constant's name was missing an `n` and anything reaching for the correctly-spelled one silently looked up a gamerule called "undefined".
  
  The player's own duplicated copies of the fall and water tables are gone; there is one of each now, and both kinds of entity read the same one.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`b390249`](https://github.com/JSPrismarine/JSPrismarine/commit/b39024922c3f95f7823f52aeef41ae00c46273af) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `/gamerule` under the name its id gives it.
  
  The command's id is `minecraft:gamerule` but its root literal was spelled `gameRule`. The command list sent to the client matches literals against the id suffix case-sensitively, so the server logged `Can't find corresponding command class for "gameRule"` on every join, left the command out of the client's list, and neither `/gamerule` nor `/gameRule` ran. The literal is now `gamerule`, and a test checks that every registered command is reachable under its id suffix.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`7f7431c`](https://github.com/JSPrismarine/JSPrismarine/commit/7f7431cb36545eaac5942df60ce3da8915391914) Thanks [@filiphsps](https://github.com/filiphsps)! - Send the login-to-spawn packets in the order a 1.26.51 client accepts.
  
  A retail client at protocol 2193 dropped the connection with `InitialConnection-90` (bad packet) the moment the server logged the join. Four things were wrong with the sequence, none of them visible with the server's own client, which tolerated all of them.
  
  `Player.enable` sent the gamemode, adventure settings, abilities and a `MovePlayer` per player from inside `LoginHandler`, before `PlayStatus(LoginSuccess)`. Nothing but PlayStatus and ResourcePacksInfo leaves the server during login now; the settings go out from the join burst after StartGame, and the MovePlayer is gone because `AddPlayer` already carries each player's position.
  
  The join burst sent three `Respawn` packets, one of them `CLIENT_READY_TO_SPAWN`, a state only a client sends. No vanilla server sends a Respawn at login, so none goes out. `sendRespawn` is unchanged for deaths.
  
  `PlayerList` and `SetTime` went out before `StartGame`. StartGame and the registries come first now, then the player list, time and spawn position, then the local player's settings, attributes, metadata and inventory, then the join message. `JigsawStructureData` stays ahead of StartGame, since a client that reaches StartGame without it disconnects with `MissingStructureData`.
  
  `Player.completeSpawn` ran twice, from the join burst and again when the client reported itself initialized, so the inventory and settings were sent twice. It runs once now, from `SetLocalPlayerAsInitializedHandler`, where the client has rebuilt its local player and needs them again.
  
  `ActorEvent` and `PlayerSkin` were registered packets with no handler, so every one a client sent was logged as a handler error. Both have handlers that accept the packet and log at debug level. Skin changes are still not applied.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `LevelDB` the default world provider, so a new install stores its world in the format Minecraft: Bedrock Edition uses rather than in one only this server understands.
  
  Existing installs are untouched. `ConfigBuilder` writes resolved defaults back into `config.yaml` the first time it reads them, so any world that has already run carries an explicit `provider:` line and keeps whatever it had. To move one over, change that line — and note that the two formats do not share a directory layout, so the old `chunks` folder is left alone rather than converted.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `LevelDB` world provider, which stores a world the way Minecraft: Bedrock Edition does — a `db` directory of LevelDB files, a `level.dat` and a `levelname.txt` beside it. A world written by the server opens in the game, and a world made in the game opens on the server.
  
  It reads and writes sub chunks across the whole −64 to 319 range, the `Data3D` biome record, the chunk version and finalized state, and block entities. An all-air sub chunk is stored by not being stored, which is what the game does too. A chunk with no version record is one that was never generated, so the generator is asked for it; anything else is a chunk that exists and is read as best it can be rather than being overwritten with fresh terrain.
  
  Two things it refuses to do quietly. Opening a folder that already holds a Filesystem world logs what it found and starts a fresh database beside the old `chunks` directory instead of over it. And opening a world the game already has open fails outright, because two writers on one LevelDB do not produce a stale read — they rewrite each other's files and the world does not survive it.
  
  `Chunk` gains `markSaved`, without which `hasChanged` only ever went true: every chunk a player had walked through was rewritten on every save for the rest of the session, and a chunk merely *read* from disk was written straight back out. `World` gains `getDimension`. The dangling `@types/level` module declaration, which described a package nothing imported, is gone.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`e319eb5`](https://github.com/JSPrismarine/JSPrismarine/commit/e319eb53013b17a99a2e0e8c4647747fbc0bdb3f) Thanks [@filiphsps](https://github.com/filiphsps)! - Log why a client disconnected, including one that gave up during the join.
  
  A `DisconnectPacket` from the client used to hit "Invalid handler with id 5" and the reason it carried was lost. The server now logs the reason and message at info level and hangs up on RakNet; the RakNet close that follows releases the player as before. A RakNet close for a connection that has not logged in, or whose player has not been added to a world yet, is also logged at info instead of debug, so a client that drops out between login and spawn leaves a line in the console ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Let players actually hit things.
  
  Every attack a client has ever sent this server was decoded in full and then thrown away. `InventoryTransactionHandler` had a branch that logged `Unhandled inventory transaction type` and returned, and that branch was where melee arrives - not `InteractPacket`, which despite the name carries mounting, dismounting and opening a villager's trades. One missing case was the whole reason nothing could be killed.
  
  **`entity/Combat.ts`** holds the swing: free functions rather than a method, because both sides of a fight need the same code and they live in different hierarchies - a `Player` is a `Human`, a zombie is a `Mob`, and their only common ancestor is `Entity`, which has no business knowing what a weapon is. It deliberately imports neither `Player` nor `Mob`: a goal will call this in the next change, goals are reached from `Mob`, and `Mob` would then import it back. Anything species-specific is passed in by whoever knows it, which is why the reach and the critical are options rather than being worked out here.
  
  **Reach is measured to the body, not between two positions**, and that distinction is the whole difficulty. A player's position is their *eyes* and every other entity's is its *feet*, so a straight point-to-point distance compares two things that are not the same kind of thing - it is the same trap that once made a player able to shove a villager and nothing else. Measured to the box, a player standing on a cow and one standing beside it are both within reach. Survival gets three blocks and creative six.
  
  **Weapon damage** is one table on `TieredTool`, not a method in each of thirty item files, and it can be one because a tiered tool already knows both things the answer depends on: the tier from there and the tool type from the item itself. The tier index is the *harvest* order, where gold sits between wood and stone - gold mines what stone mines but hits like wood, so the rows are not ascending runs and a table that assumed they were would have made golden swords wrong. Anything that is not a weapon does one point, which is vanilla's rule rather than a placeholder: a fist does one, and so does a torch.
  
  **Criticals** need the player to be *descending*, not merely off the ground - `Player.getFallDistance` is now readable for exactly this, because a player rising through a jump is airborne too and vanilla does not let them crit on the way up. A critical is half again as much and throws stars around what was hit.
  
  Sprinting is worth one knockback level, the same as one level of the enchantment, which is what makes a sprint-hit send somebody flying where a standing one nudges them. A swing that connects costs 0.1 exhaustion; a miss is free, which is why it is charged after the fact rather than before the attempt. Every swing makes a noise, including one that does nothing - the alternative is a swing that produces no sign at all and reads as the server having dropped the packet.
  
  `SetActorMotionPacket` and the PvP gamerule both do something for the first time: knockback on a *player* has to be a request rather than a move, since their position is their own client's, and `canHarm` is the one place the rules about who may hit whom are stated.
  
  Weapon durability is not decremented yet. It is left with the armor work, where the machinery for telling a client that a held item has changed lives - decrementing it here would drift the server's number away from the one the client is drawing, which is worse than not doing it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Teach mobs to fight, and let them fight each other.
  
  A zombie already walked up to you and then stood there. The pursuit was all there; what was missing was a target it could act on and anything that swung.
  
  **A target belongs to the mob, not to a goal.** Several goals need the same answer - one picks somebody, another walks to them, a third hits them - and a target private to whichever goal found it would have to be rediscovered by each of the others, which is how they drift apart the moment one changes its mind. The mob also does the forgetting: a target that dies, leaves the world, or spends five seconds out of range is dropped once, centrally, rather than by each goal separately. That forgetting runs before the loaded-chunk check, because a mob holding a reference to a corpse until somebody walks back into the area is both a leak and a fight it would resume with a dead thing.
  
  **Four new goals, and the interesting thing is that three of them claim no lanes.** Vanilla has a separate "target selector" running beside its goal selector; here that falls out of the lane system already present - a goal with no lanes blocks nothing and is blocked by nothing, so choosing who to fight runs alongside whatever is currently walking the mob, which is exactly right because deciding is not something that competes with moving.
  
  - `NearestAttackableTargetGoal` finds somebody, filtered. It reads the entity grid rather than the whole world, and stands down while the mob already has a target - re-picking every tick makes a mob swap between two equidistant players and reach neither.
  - `HurtByTargetGoal` turns on whoever hit it. **This is the whole of mob-versus-mob, and nothing in it knows that mobs can fight each other**: a skeleton's stray arrow hits a zombie, the zombie asks who hurt it, and every goal downstream carries on as it would against a player. It has to remember which blow it has already answered, because `getLastDamageSource` keeps its answer indefinitely and the mob could otherwise never be distracted again.
  - `MeleeAttackGoal` swings, on a one-second cooldown, and sends the arm-swing event - vanilla calls it `StartAttacking` - so the target is not hurt by something that visibly never moved.
  - `PanicGoal` is what an animal does instead of fighting back. Before it, being hit did nothing at all and a herd stood placidly while it was slaughtered.
  
  **`ApproachPlayerGoal` became `ApproachTargetGoal`** and stopped hunting for its own target. That one change is what lets a zombie chasing a person and a golem chasing a zombie share every line of pursuit code; the three fighting brains now differ from each other in exactly one argument - which filter they hand the targeting goal. A fourth, `neutralBrain`, is the hostile one with that goal simply left out, so a wild wolf wanders until somebody hits it.
  
  An iron golem is a guardian rather than a villager now, and hunts the monsters a village needs driving off - not creepers, for vanilla's reason: a golem that charged one would set it off inside the village it is guarding.
  
  **Difficulty exists.** `StartGamePacket` wrote a hardcoded zero, which is *peaceful*, so however a server was configured every client was told monsters could not hurt anybody. It is now a config option named in words rather than numbered, it reaches the client, mob damage is scaled by Mojang's documented multipliers - a zombie's three becomes two on easy and five on hard - and peaceful stops monsters spawning at all rather than spawning harmless ones that would still crowd the caps.
  
  Only mob attacks scale. A player's sword does what the sword says whatever the world is set to, and so does falling and drowning: the setting is about how dangerous the monsters are, not how dangerous the world is.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Give mobs their own vitals, and let them die.
  
  Two gaps, and the second was the more visible: every mob shared the base attribute defaults, so a chicken and an iron golem both had twenty health and one point of attack; and `Entity.onDeath` was an empty hook that only `Player` overrode, so a mob whose health reached zero simply stood there for ever.
  
  **`MobStats`** is a table of health, attack, knockback resistance and follow range keyed by entity identifier, and `Mob` builds its attributes from it. A table for the reason `EntitySize` is one: every mob shares a single class and differs only in what it is made of, so the alternative was an override in each of a hundred four-line files - a hundred places for a number to be wrong and nowhere to read the game's own figures against. A test asserts every class that extends `Mob` appears in it, which caught `minecraft:zombie_villager_v2` the first time it ran.
  
  The health *maximum* moves with the value, not just the value: a golem given a hundred health with the ceiling left at twenty would have been clamped straight back down and been no tougher than a zombie.
  
  Speed is deliberately not in the table. A mob's pace is `ai/Speed` and `Mob.walkSpeed`, which is what the server actually walks it at; `minecraft:movement` is only what the client is told. A second number here would let the two disagree, which is the failure `EntitySize` was written to end.
  
  **Dying** now takes a second, because the client's death animation does. A mob that ran out of health used to be nothing at all; if it had been removed the moment its health hit zero it would have been deleted mid-roll and appeared to vanish. So it stops its goals, plays the animation and the sound, stands still for twenty ticks, drops what it was carrying and is then taken out of the world. The death bookkeeping runs before `update`'s loaded-chunk check, or a mob that died in a chunk that then unloaded would never reach the end of it.
  
  **Loot** is rolled through the very same `DropTable` a block's drops go through - they are the same problem stated twice, and the table already existed, was already tested, and already takes its chance source as an argument so a roll can be made to repeat. Every item name in it is checked against `required_item_list.json`, which is the authority on what the client can be told about. The `doMobLoot` gamerule is honored, which is the first time any of the gamerules that were registered and defaulted has actually been read.
  
  **Sounds.** `WorldChangeSink` gained `actorSound`, separate from `blockSound` because the wire format differs in a way that matters: a mob's sound carries which mob is making it, so a client picks the zombie's grunt over the skeleton's rattle, where a block's carries the block's runtime id instead. Being hurt is now audible - the red flash is the client's own animation and makes no noise, so until now every hit landed silently.
  
  **Death messages** learned who did it. They moved out of `Player` into `entity/DeathMessages.ts`, gained the attacker-aware keys, and keep vanilla's distinction between being slain by a person and by a mob. A mob killer with no nametag is named after its type rather than left blank.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`b7c7ff9`](https://github.com/JSPrismarine/JSPrismarine/commit/b7c7ff9deea743b61f96ce3b173327e13dea6d11) Thanks [@filiphsps](https://github.com/filiphsps)! - Tell a client on the wrong protocol version why it was refused ([#1586](https://github.com/JSPrismarine/JSPrismarine/issues/1586)).
  
  The version check happens on the first packet a client sends, before login, and a mismatch used to end in a disconnect with the reason hidden. The player saw "Disconnected from Server" and nothing else. The server now sends the client the same failed play status the login step would have, which the client shows as "Outdated client" or "Outdated server", and the disconnect that follows names the version to use. The refusal is also logged with both protocol numbers.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`3942a02`](https://github.com/JSPrismarine/JSPrismarine/commit/3942a02618a86c57fecbdd8eb710ba88db71ac16) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix a 1.26.51 client with a character-creator skin being dropped right after joining with `InitialConnection-90` ([#2582](https://github.com/JSPrismarine/JSPrismarine/issues/2582)).
  
  The player list carries every player's skin, and a persona skin's pieces and tints were still written in a layout the client stopped reading long ago. The piece type and pack id went out as strings and the tint colours as a counted list of strings. Protocol 2193 reads the piece type as a 32-bit id, the pack id as a 16-byte UUID, and each tint as a short name followed by exactly four 4-byte colours. Every field after the skin was read from the wrong offset, so the join failed for anyone whose skin came out of the character creator. Classic skins were not affected. The skin colour now goes out in the byte order the client reads, and a `#rrggbb` skin colour is read as opaque.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`5ff5249`](https://github.com/JSPrismarine/JSPrismarine/commit/5ff5249c6ae85f22c78c824b19aec4f25944cdc5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSkinPacket` now decodes and encodes the full protocol 2193 layout (`UUID`, `SerializedSkin`, the two localized skin names) through the new `Skin.networkDeserialize`, and the handler stores the new skin on the player and forwards the packet to every other online player. The packet's `trusted` field is gone; the flag lives inside the skin as `Skin.isTrusted`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f41832a`](https://github.com/JSPrismarine/JSPrismarine/commit/f41832a37db074e0a50daaea73d586281cf83505) Thanks [@filiphsps](https://github.com/filiphsps)! - `ActorEventHandler` accepts only the events a vanilla client sends (`FEED`) and only about the sender's own player, then relays them to the players tracking it. Events naming another actor or a server-only event are dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4f9f167`](https://github.com/JSPrismarine/JSPrismarine/commit/4f9f1674ffad59abf28f373841d4c9e94948c1d3) Thanks [@filiphsps](https://github.com/filiphsps)! - `AnimatePacket` exports an `AnimateAction` enum with the numbers a protocol 2193 client sends (Swing 1, WakeUp 3, CriticalHit 4, MagicCriticalHit 5). `AnimateHandler` relays only those actions and only when the packet names the sender's own runtime id; anything else is logged at debug level and dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`bccb4ab`](https://github.com/JSPrismarine/JSPrismarine/commit/bccb4abebd93c636ceb8f9f7e2030edfb873423c) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendInventory` now sends the armor window (container id 120) with the `ArmorContainer` container name instead of `CombinedHotbarAndInventoryContainer`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d05b02d`](https://github.com/JSPrismarine/JSPrismarine/commit/d05b02d7899de717176e66b9bc01bcc7ab1ae5c9) Thanks [@filiphsps](https://github.com/filiphsps)! - Write `AvailableCommandsPacket` fields at the widths the protocol 2193 docs give: `Flags` as an unsigned 16 bit integer and a constraint's `Enum Value Symbol` and `Enum Symbol` as unsigned 32 bit integers. An `Enum Data` entry now writes the number of indices it actually contains, and an enum that only a constraint names is added to the enum table so the constraint's symbols point at an entry that exists.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f2ec14a`](https://github.com/JSPrismarine/JSPrismarine/commit/f2ec14ab4fa633683af6ca54e8e5fd116115e6e7) Thanks [@filiphsps](https://github.com/filiphsps)! - Describe brigadier arguments and permission levels in `AvailableCommandsPacket`. Commands built on brigadier's `string()`, `greedyString()` and `integer()` (`/say`, `/me`, `/time`, the reason of `/ban` and `/kick`) went out with empty overloads because those types were checked after the prismarine-argument guard had returned; they are now sent under their node names as `Message`, `String` and `Int` parameters. Overloads two branches spell the same way are folded into one. Every command also reported permission level `any`; a command the default permissions allow is `any` and anything else `gamedirectors`, capped at the recipient's own level so the client never hides a command the server would run for them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`b31c809`](https://github.com/JSPrismarine/JSPrismarine/commit/b31c80982ec3bd2b2c773e38e383370de7d4ab49) Thanks [@filiphsps](https://github.com/filiphsps)! - `/ban` and `/pardon` change only the affected player's line in `banned-players.json`, so comments and formatting in the file survive. The file may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. An entry without a `name` is skipped instead of banning `undefined`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c40174e`](https://github.com/JSPrismarine/JSPrismarine/commit/c40174e64c7358a8763fb56ed49915765e087f9d) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendAbilities` names all twenty abilities in its base layer, including `VerticalFlySpeed` and `PrivilegedBuilder`, so the client applies the vertical fly speed the packet already carried. `AbilityLayerType` gains `LOADING_SCREEN`, and `UpdateAbilitiesPacket` is exported from the packet registry.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2594d19`](https://github.com/JSPrismarine/JSPrismarine/commit/2594d1902fc6569998f57053531b08968c37951c) Thanks [@filiphsps](https://github.com/filiphsps)! - Log the packets inside an asynchronously compressed batch at `silly` level. Chunk batches went out through `MinecraftSession.sendBatchAsync` with no traffic line, so a packet trace of a join showed the `NetworkChunkPublisherUpdate` packets with a gap where each `LevelChunkPacket` was sent. `BatchPacket.getPacketNames()` reports what a batch holds, and `PacketLogFilter.shouldLogName()` applies `log-excluded-packets` by name.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a5eda59`](https://github.com/JSPrismarine/JSPrismarine/commit/a5eda5987311bc6506c4cb044a2a16a35cd2ab3c) Thanks [@filiphsps](https://github.com/filiphsps)! - `BlockActorDataPacket` writes its compound under an empty root name, as the client expects,
  even when the `NBTTagCompound` it was given carries a name of its own.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7d27c72`](https://github.com/JSPrismarine/JSPrismarine/commit/7d27c72514d37772b6e1ef2d3ba37123cf087705) Thanks [@filiphsps](https://github.com/filiphsps)! - A player's chat now reaches other clients the way a dedicated server sends it: a `Chat` text whose author is the sender's name and whose XUID is the sender's, with the message as typed. The server used to put `<name>` into the message and leave the author blank, which the client draws as its own empty `<>`. The console prints the same `<name> message` line. `TextHandler` drops a text whose type is not `Chat`, the only type a client sends, and `Chat` defaults to `RAW`, so a line the server formatted itself is shown as written.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`72e5d6d`](https://github.com/JSPrismarine/JSPrismarine/commit/72e5d6d53c7d6bff54395d93bcc0ae6d7e13ba98) Thanks [@filiphsps](https://github.com/filiphsps)! - A chunk's block entities now travel with the chunk. `Chunk.networkSerialize` appends one network NBT compound per block entity after the border block byte, the way a Bedrock server does, so a chest or sign loaded from a world reaches the client with the terrain it stands in instead of never being sent. Adding or removing a block entity also drops the chunk's cached payload.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1e37459`](https://github.com/JSPrismarine/JSPrismarine/commit/1e37459b0af59d87deb445ea63b5f6563dfcd07e) Thanks [@filiphsps](https://github.com/filiphsps)! - Shape a chunk's network payload for the dimension it belongs to. The padding below a shallow dimension and the number of biome sections now follow the range the client gives the chunk's dimension id, so a Nether chunk goes out with no padding and 8 biome sections and an End chunk with 16, where both used to get the Overworld's four padding sub chunks and 24 sections.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b752e88`](https://github.com/JSPrismarine/JSPrismarine/commit/b752e881aa60db17479ea6225d71e6fc443bc808) Thanks [@filiphsps](https://github.com/filiphsps)! - `RequestChunkRadiusHandler` logs each radius request and the radius it granted at debug level, so a join that stalls shows whether the client ever asked for terrain.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5ad6f00`](https://github.com/JSPrismarine/JSPrismarine/commit/5ad6f001ae52e6c156d02919d7f47e68bfc7d1c7) Thanks [@filiphsps](https://github.com/filiphsps)! - `CommandEnumConstraint` now reports the offending offset in its "Invalid enum value offset" error instead of the literal text `$valueOffset`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4a89177`](https://github.com/JSPrismarine/JSPrismarine/commit/4a89177a12ea1473d930b6a96548e7e9991edeb0) Thanks [@filiphsps](https://github.com/filiphsps)! - `CommandRequestHandler` drops a request whose origin is not `Player`, since a client has no
  business claiming a command block or automation origin, and answers each dispatched command
  with a `CommandOutputPacket` that echoes the request's origin and reports whether the command
  ran as its success count. `CommandManager.dispatchCommand` resolves to that boolean instead of
  `void`. `CommandRequestPacket` gains `encodePayload`, and its `commandOriginData` is always set
  rather than possibly `null`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ccf3672`](https://github.com/JSPrismarine/JSPrismarine/commit/ccf36723ef0fd8eb8415d44bf670fd93dbc5072d) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession` now remembers the container windows it opens, and `ContainerCloseHandler` closes the window on the server before answering. The answer always carries `Server Initiated Close` false, as the docs ask for a close the player made, instead of echoing whatever the client sent. A close for a window the session never opened is logged at debug level and still answered. `PlayerSession.closeWindow` is new.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c1d755e`](https://github.com/JSPrismarine/JSPrismarine/commit/c1d755e07898685e11382f36674bdd0863e4b5ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `CraftingDataPacket` numbers recipes from one when no `netIdOf` function is given, instead of sending every recipe as net id 0. The packet's ingredient and result layouts are documented and pinned by byte-exact tests for smithing transform recipes and tag ingredients.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`90f8798`](https://github.com/JSPrismarine/JSPrismarine/commit/90f87988dc6f2498dc62e18735047870117d93ad) Thanks [@filiphsps](https://github.com/filiphsps)! - The creative menu sends every block entry and group icon with the block runtime id vanilla records for it. Pistons, dispensers, droppers and glow lichen showed their default state instead of the one the menu draws, and the item form of doors, beds and hanging signs carried a block id where vanilla sends none. `Item` takes an optional `blockRuntimeId` and exposes `getBlockRuntimeId()`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1b7a41f`](https://github.com/JSPrismarine/JSPrismarine/commit/1b7a41f982a379becefc4b1716042eb9c33c3375) Thanks [@filiphsps](https://github.com/filiphsps)! - Send `DeathInfoPacket` (id 189) to a player who dies, after the `Respawn` packet, so the client's death screen shows the cause. It carries the same translation key and parameters as the chat announcement from `DeathMessages`, with the key's leading `%` removed, since the death screen takes the bare key. The packet class is new and registered.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`3813ce9`](https://github.com/JSPrismarine/JSPrismarine/commit/3813ce9501db9cd859fcc0e3bdf3aeb0712cadcd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add two debugging aids for a join that fails without a `Disconnect` or `PacketViolationWarning`: `JSP_DEBUG_DROP_PACKETS` names clientbound packet classes the server withholds, and `JSP_DEBUG_DUMP_PACKETS` names packets whose encoded bytes are written to files under `JSP_DEBUG_DUMP_DIR`. Each withheld or dumped packet logs a warning.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0aefdfa`](https://github.com/JSPrismarine/JSPrismarine/commit/0aefdfae1a68f61d66581e8836718ff37e127ec9) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDefaultGameTypeHandler` refuses a value the config cannot hold (such as `Default`,
  `WorldDefault`, or a number that is no game type) instead of throwing from
  `Config.setGamemode`, and answers a refused request with the default the server has so the
  client's world settings screen shows it again. An accepted change is also sent back to every
  client, as the protocol docs describe.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b6e5ccb`](https://github.com/JSPrismarine/JSPrismarine/commit/b6e5ccbdfe29d972699a7fe92c27cc5084798cef) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDifficultyHandler` sends the configured difficulty back when a client asks for a
  different one, so the client's settings menu no longer shows a difficulty the server does
  not have. A value that is no difficulty is answered the same way and nothing is thrown.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4072778`](https://github.com/JSPrismarine/JSPrismarine/commit/407277842093c7f82f5584b4c477963b7a42321d) Thanks [@filiphsps](https://github.com/filiphsps)! - Every `ChangeDimensionPacket` the server sends now carries a `Loading Screen Id`, handed out by the new `PlayerSession.beginLoadingScreen()`, and `ServerboundLoadingScreenHandler` checks a closed screen off with `PlayerSession.endLoadingScreen(id)`. `ChangeDimensionPacket.dimension` is typed as the `Dimension` enum from `@jsprismarine/minecraft`; plain numbers still assign to it.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ece6eac`](https://github.com/JSPrismarine/JSPrismarine/commit/ece6eacc885e4e24359d95655002289bc33cc812) Thanks [@filiphsps](https://github.com/filiphsps)! - When a client sends `DisconnectPacket`, the log line now names the `DisconnectReason` next to its number, for example `reason 3 (UNRECOVERABLE_ERROR)`. A number the enum does not list is logged bare.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`698f891`](https://github.com/JSPrismarine/JSPrismarine/commit/698f891b8fc43f38fd616a979ca6a0d58a48bfa1) Thanks [@filiphsps](https://github.com/filiphsps)! - The server's `DisconnectPacket` now reads and writes `Skip Message` as the one bool byte the client uses, and `skipMessage` defaults to false. It was a varuint compared against 1, which agreed with the client for 0 and 1 but took any other byte as "strings follow" and read past the packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2f78483`](https://github.com/JSPrismarine/JSPrismarine/commit/2f78483cb75978a304c2da8bc7144536cf9a07aa) Thanks [@filiphsps](https://github.com/filiphsps)! - `EmoteHandler` now drops an emote that names another player's runtime id or whose emote id is not a uuid string, and `EmoteListHandler` drops a list for another runtime id. Both log the drop at debug level.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f0e7cd3`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e7cd3482f6575aa4004e765723fd9602042cae) Thanks [@filiphsps](https://github.com/filiphsps)! - Send an empty `FeatureRegistryPacket` (id 191) to every joining client, after `BiomeDefinitionList` in the registry group of the join burst, as a Bedrock Dedicated Server does for a world with no custom features. The packet class is new and registered.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`82db23a`](https://github.com/JSPrismarine/JSPrismarine/commit/82db23a22169fd09e027051b3b6f3f7f56981ee5) Thanks [@filiphsps](https://github.com/filiphsps)! - `NpcRequestPacket`, `PurchaseReceiptPacket` and `ShowCreditsPacket` and their handlers are registered, so a client sending one no longer logs an unimplemented packet warning. `ModalFormRequestPacket`, `SetTitlePacket` and `ShowStoreOfferPacket` are registered as well.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`436f4af`](https://github.com/JSPrismarine/JSPrismarine/commit/436f4afdaf1f3a91cbb642dfbed19250e443ff71) Thanks [@filiphsps](https://github.com/filiphsps)! - `ModalFormResponseHandler` drops a form response whose text does not parse as JSON and logs it at warn, instead of recording it as a submitted form.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e00c31d`](https://github.com/JSPrismarine/JSPrismarine/commit/e00c31de32f4cf67f55253d83df1a65caad1b4b7) Thanks [@filiphsps](https://github.com/filiphsps)! - A game rule changed through `/gamerule` or `GameRuleManager.setGameRule` is now sent to every
  player in the world as `GameRulesChangedPacket`. Before, a client only learned the rules once,
  in `StartGamePacket`, and kept showing coordinates or running the day cycle however it had
  been told at login.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`37afa90`](https://github.com/JSPrismarine/JSPrismarine/commit/37afa9046fd2dddb31e34f4f66e3b2b004769096) Thanks [@filiphsps](https://github.com/filiphsps)! - Game rules now reach the client under the names it knows. `StartGamePacket` and
  `GameRulesChangedPacket` wrote every rule name in lowercase (`showcoordinates`,
  `dodaylightcycle`), and the client, which matches a rule by exact string, had no rule by
  those names. The names are now spelled as a Bedrock Dedicated Server spells them
  (`showCoordinates`, `doDayLightCycle`). Lookups through `GameRuleManager` ignore case, so
  level files written by an older server still load, and the `GameRules` constants carry the
  new spelling. An integer rule is written as a signed int32, so a negative value no longer
  throws while the join packets are being encoded.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8a5570c`](https://github.com/JSPrismarine/JSPrismarine/commit/8a5570cf072483d412a7a591a6da83105b9b3993) Thanks [@filiphsps](https://github.com/filiphsps)! - A player's game type change is followed by `UpdatePlayerGameTypePacket` to every client in
  the world, which the protocol docs ask for so each client's cached game type and permission
  flags for that player stay current. The packet carries the receiving client's last input tick
  when the player is its own, and zero for anyone else.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1d14d17`](https://github.com/JSPrismarine/JSPrismarine/commit/1d14d17dcce52599ecb729afb38e61fe97029b51) Thanks [@filiphsps](https://github.com/filiphsps)! - `SessionManager.getPlayerById` returns `null` for an unknown runtime id instead of throwing an assertion error.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`f1cad6a`](https://github.com/JSPrismarine/JSPrismarine/commit/f1cad6a43599ff3e39528a9a0039d254738ad665) Thanks [@filiphsps](https://github.com/filiphsps)! - Packet handlers no longer act on client-supplied positions without checking them.
  `PlayerActionHandler` refuses a block action further than a player can reach, which stopped a
  client from breaking blocks it cannot see and from driving terrain generation anywhere on the
  map one packet per chunk; it also refuses a creative break from a player who is not in
  creative, and any block action from a spectator. `LevelSoundEventHandler` drops a sound
  reported from somewhere the sender is not.
  
  `EmoteHandler` relays within the sender's world to the clients that have the sender on screen,
  and signs the emote with the server's record of the sender's XUID rather than the one the
  client sent. `TextHandler` strips formatting codes and control characters from a chat message
  and cuts it to 512 characters, so a message can no longer draw a line that looks like another
  player said it.
  
  `SetLocalPlayerAsInitializedHandler` drops a repeat notice, which used to re-announce the
  player to everyone who can see it and resend its whole state, and reads the player's own
  world rather than the default one.
  
  `ServerSettingsRequestHandler` no longer answers with `UpdateAdventureSettingsPacket`, which
  was unrelated to the request. `NetworkStackLatencyHandler` now echoes a ping that asks for an
  answer, with the request flag cleared.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7b82d53`](https://github.com/JSPrismarine/JSPrismarine/commit/7b82d537de1732ca6f5c7f6e19e7a4efdeb3ab56) Thanks [@filiphsps](https://github.com/filiphsps)! - `InteractHandler` now checks what a client names before acting. An `OpenInventory` whose target is not the sender's own runtime id is dropped, an `NpcOpen` is dropped unless the actor is one the client has been shown and is within reach, and an action no client sends is logged instead of silently falling through.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`85e04c8`](https://github.com/JSPrismarine/JSPrismarine/commit/85e04c8246593f9252f0364174941bdd016d2ab9) Thanks [@filiphsps](https://github.com/filiphsps)! - `InventoryTransactionPacket` keeps a transaction type it does not know instead of throwing from `decodePayload`, so the handler can drop the packet at debug level rather than the server logging an error for it. The packet refuses an Actions list longer than the 100 the docs allow before allocating it. `ActionSource.INVALID`, a `-1` that was never a wire value, is gone; `NON_IMPLEMENTED_TODO` stays `99999`, the value the client sends. `ReleaseItemAction` names the docs' `ItemReleaseActionType` (`RELEASE` 0, `USE` 1).

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`22dbd48`](https://github.com/JSPrismarine/JSPrismarine/commit/22dbd4869341ed3d6c43edc45eb7f37d95eee226) Thanks [@filiphsps](https://github.com/filiphsps)! - `InventoryTransactionHandler` checks every field of an item use, a use on an entity and a release before acting on it. A transaction whose type, action source, action type, hand, hotbar slot, face or position is not one the docs allow is dropped at debug level. One whose hotbar slot is not the slot the server has selected, or whose block is further than a creative reach from where the server has the player, is dropped at verbose level. A clicked block is placed with the item the server holds in the player's hand, not the item the client named, and a swing at a runtime id the world does not track is dropped. The handler no longer throws on anything a client can send.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b856cf6`](https://github.com/JSPrismarine/JSPrismarine/commit/b856cf6f362943185236cbfe6ca7b896d3b7ef64) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemRegistryPacket` sends each item with the `Item Version` and `Item Component Data` a Bedrock Dedicated Server 1.26.51 sends, instead of `DataDriven` and an empty compound for all 2076 items. The 31 data-driven vanilla items (bundles, spears, trial keys, the apple) now reach the client with the components it builds them from.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8227f46`](https://github.com/JSPrismarine/JSPrismarine/commit/8227f469b15c36222af11f3161b72687db72c56a) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackRequestPacket` reading follows the 1.26.51 docs more closely. A deprecated crafting result's `Stack size` is read as a uint16 and its item descriptor accepts all four descriptor kinds; an auto craft keeps its `Recipe Net Id`; a `Dynamic ID` is read unsigned; and a packet or request naming more than the documented 100 requests or actions is refused with a `RangeError` instead of being allocated for.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e414269`](https://github.com/JSPrismarine/JSPrismarine/commit/e414269e9f12ed33aec044ee15169e4f7373a6ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackRequestHandler` refuses a request whose id is not a negative odd client request id, one with no actions, and one whose amount is outside 1 to 64, answering each with an `Error` under the same id. A step that throws is now rolled back and answered as a refusal instead of leaving the request unanswered. A successful response names only the containers whose slots changed.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0f387a9`](https://github.com/JSPrismarine/JSPrismarine/commit/0f387a9e70e2868a93f1f5c461ecd7290e32a2ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemStackResponsePacket` writes its two optionals the way the 1.26.51 docs define them. `Containers` is present exactly when the result is `Success`, so an accepted request that changed nothing now carries an empty list instead of an absent one; before, the client read a success in the shape of a refusal. A slot's `Item Stack Net Id` is present exactly when `Amount` is above zero rather than when the id is positive. A container's `Dynamic ID` is written as an unsigned 32-bit integer, and a `Durability Correction` outside the int16 range is refused with a `RangeError` instead of being sent.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a3ea9cf`](https://github.com/JSPrismarine/JSPrismarine/commit/a3ea9cf44dc9ccb74b12dbfbe7703b3403390ffd) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemUseMethod` gains `Unknown = -1`, the value Mojang's enum snapshot lists ahead of `EquipArmor`, so a `CompletedUsingItemPacket` carrying it decodes to a named member.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8ce9329`](https://github.com/JSPrismarine/JSPrismarine/commit/8ce9329b1f92a5c18f492e4e8b5735037d7e8354) Thanks [@filiphsps](https://github.com/filiphsps)! - `LevelSoundEventPacket` now carries `Fire At Position` through a decode and encode as `fireAtPosition` instead of reading it and dropping it, and resolves a sound name through a prebuilt map rather than scanning the enum. `LevelSoundEventHandler` drops a client sound attributed to an actor other than the sender, in addition to one reported out of the sender's reach.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`10944b8`](https://github.com/JSPrismarine/JSPrismarine/commit/10944b82e83d11d18cd05004d83623c559f0f684) Thanks [@filiphsps](https://github.com/filiphsps)! - Refuse a login the way the client expects.
  
  `LoginPacket` now reads only `Client Network Version` and the connection request framing when the version is not the server's. It used to parse the certificate chain and client data regardless, and a client of another version whose blobs did not have the 2193 shape failed to decode, which dropped the packet before `LoginHandler` could answer with `PlayStatus(LoginFailed_ClientOld)` or `PlayStatus(LoginFailed_ServerOld)`. The player saw a timeout instead of "outdated client".
  
  Each refusal `LoginHandler` sends as a `Disconnect` now carries the `DisconnectReason` the client shows on its disconnect screen: `INVALID_PLAYER` for a login with no username or no identity, `NOT_AUTHENTICATED` for an unauthenticated login on a server in online mode, `NOT_ALLOWED` for a banned player, and `LOGGED_IN_OTHER_LOCATION` for the player a new login replaces. All of them used to go out as `DISCONNECTED`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`60ba0b6`](https://github.com/JSPrismarine/JSPrismarine/commit/60ba0b6e04eba800d2e66be0ed66f3719784ef41) Thanks [@filiphsps](https://github.com/filiphsps)! - `MapInfoRequestPacket` rejects a `Client Pixels List` count above the 16384 pixels the docs allow before reading any entry, and exports that limit as `MAX_CLIENT_PIXELS`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cf75135`](https://github.com/JSPrismarine/JSPrismarine/commit/cf75135eb27fd9bb08137673bf0c8c50dd7e29ec) Thanks [@filiphsps](https://github.com/filiphsps)! - `ClientboundMapItemDataPacket` now writes a decoration's `Color` and each `Pixels` entry as a little-endian int32 of the packed ARGB value, the byte order the client reads. They were written big-endian, which swapped the alpha and blue channels with the red and green ones.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1412a24`](https://github.com/JSPrismarine/JSPrismarine/commit/1412a24f7bd59941afa6b36256ff140f4deb1eb6) Thanks [@filiphsps](https://github.com/filiphsps)! - `MapCreateLockedCopyPacket`, `PositionTrackingDBClientRequestPacket` and their handlers are registered, along with `ClientboundMapItemDataPacket` and `PositionTrackingDBServerBroadcastPacket`. Locking a map at a cartography table or holding a lodestone compass no longer makes the server warn that packet 0x83 or 0x9a is not implemented.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4732653`](https://github.com/JSPrismarine/JSPrismarine/commit/4732653db60cd2c389e5deffc16be34c43dbc9ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Write a `CompoundTag` entity data item as network NBT. `Metadata.networkSerialize` threw for a `FlagType.ITEM` entry; it now writes the compound in little-endian NBT with varint lengths, as the `DataItemCompoundTagPayload` docs ask for. The entry layout is unchanged: id, the one-of selector as a varuint, the same type as a byte, then the value.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1bbc264`](https://github.com/JSPrismarine/JSPrismarine/commit/1bbc264ffb76061b8d1854736b2cc0388a9b9cc8) Thanks [@filiphsps](https://github.com/filiphsps)! - `MobArmorEquipmentPacket` can be decoded as well as encoded, and both equipment packets have
  tests that pin the protocol 2193 byte layout: the runtime id, then one full
  `NetworkItemStackDescriptor` per slot with an empty slot written as eight zero bytes.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`7a9e9c9`](https://github.com/JSPrismarine/JSPrismarine/commit/7a9e9c9e9abe96e1d30e1fe7fa7a528337908418) Thanks [@filiphsps](https://github.com/filiphsps)! - `MobEquipmentHandler` checks what a client reports before acting on it. A packet naming a
  container other than the player inventory or the offhand is dropped, and so is one whose slot or
  selected slot lies outside the nine hotbar slots. An offhand report is accepted and ignored,
  since the off hand is kept through item stack requests. A valid hotbar change now reaches the
  other players in the sender's world that have the sender on screen, as a `MobEquipmentPacket`
  carrying the server's copy of the stack in that slot rather than the one the client claimed.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c5d8aa2`](https://github.com/JSPrismarine/JSPrismarine/commit/c5d8aa2ddf44f1e8e083a3e40084a60344a67dde) Thanks [@filiphsps](https://github.com/filiphsps)! - `MoveActorAbsolutePacket` names all four `Header` bits (`FLAG_FORCE_MOVE_LOCAL_ENTITY` and `FLAG_FORCE_COMPLETION` join on ground and teleport) and can decode a packet as well as encode one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`dd2df4b`](https://github.com/JSPrismarine/JSPrismarine/commit/dd2df4b765a500b25ce5e529d0a64e1f4107c9f0) Thanks [@filiphsps](https://github.com/filiphsps)! - `MovePlayerPacket` and `SetActorMotionPacket` now carry the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` when the packet is about the receiving player, and zero when it shows them another player. Both used to send the server's tick counter, which the client cannot match against its prediction history. The server also reads a server-bound `MovePlayerPacket`, which at protocol 2193 only the bot harness sends, on the docs' terms: it must name the sender's own runtime id in Normal or OnlyHeadRot mode, and anything else is dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`47aa6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/47aa6e16f289451963ef552d5f146cfd5d7ac5d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Send each command to the client once. `CommandManager.getCommandsList()` returned one entry per top-level argument branch, so `AvailableCommandsPacket` carried `tp` four times and `execute`, `ban`, `kick`, `gamemode`, `time`, `debug` and `gamerule` two or three times each, and the client kept whichever copy it read last. Each command is now one entry whose overloads cover every branch, with an empty overload for a command that also runs without arguments.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9b950dd`](https://github.com/JSPrismarine/JSPrismarine/commit/9b950dd857fbd6a1a4a6d8daa8667612432a4f4f) Thanks [@filiphsps](https://github.com/filiphsps)! - Log a client's `PacketViolationWarningPacket` at warning level with the rejected packet's name, the violation type and severity by name, and the client's context string. `PacketViolationWarningPacket` now exports `PacketViolationType` and `PacketViolationSeverity`, numbered from -1 as the client sends them.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`ebc42a1`](https://github.com/JSPrismarine/JSPrismarine/commit/ebc42a102a7128ddb8c538cb1d379c54f18f709e) Thanks [@filiphsps](https://github.com/filiphsps)! - `/op` and `/deop` change only the affected player's line in `ops.json`, and a fresh `permissions.json` is written with a comment above each key explaining it. Both files may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. Entries without a `name`, and permission lists that are not lists of strings, are skipped instead of being taken as they are. `PermissionManager` now takes a `PermissionManagerServer`, the part of the server it uses.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`399f05d`](https://github.com/JSPrismarine/JSPrismarine/commit/399f05daa9879d6a30dce1d57e51fced9c64d718) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix a 1.26.51 client with a character-creator skin being unable to join: a persona tint's piece type now travels as the lower-case `persona::PieceType` member name (`facialhair`, `high_pants`), not the client data's `facial_hair`. A client given the old spelling treated `PlayerListPacket` as malformed and closed the connection about a second after `StartGame`, with no `Disconnect` or `PacketViolationWarning`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4efbc9e`](https://github.com/JSPrismarine/JSPrismarine/commit/4efbc9e63f551fe62d6fd080e0ce2985f1392e33) Thanks [@filiphsps](https://github.com/filiphsps)! - `PhotoTransferPacket` and `PhotoTransferHandler` are registered. A photo an Education Edition
  client sends is decoded and logged at debug level instead of being dropped with a "packet 0x63
  isn't implemented" warning.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c2dbce4`](https://github.com/JSPrismarine/JSPrismarine/commit/c2dbce4145b325e9363cad8c802f6a3e1190c784) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerActionHandler` drops a `PlayerActionPacket` whose `Player Runtime ID` is not the sender's, ignores the block-breaking actions that a 1.26.51 client only sends inside `PlayerAuthInputPacket`, toggles flight for `StartFlying` and `StopFlying`, and accepts the dimension change ack and the swimming, gliding, crawling, sleeping and spin attack actions without logging them as unhandled.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c7e634e`](https://github.com/JSPrismarine/JSPrismarine/commit/c7e634e23aa8165680e01e4f9ec0617fa81e18ae) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputPacket` documents the protocol 2193 wire layout with the docs' field names, derives its input flag bound from `PlayerAuthInputData` instead of a hand-kept constant, refuses more than the docs' 100 block actions before allocating for them, and exports the `InputMode`, `ClientPlayMode` and `NewInteractionModel` enums with the numbering the 1.26.60 docs corrected.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`3f05143`](https://github.com/JSPrismarine/JSPrismarine/commit/3f05143f8641a5c6339e0378516bb9536a02d2cc) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputHandler` drops, at debug level and without throwing, an input whose flags, input mode, play mode, interaction model, position, rotation or block actions hold a value the docs do not allow, and acts on the item use, item stack request and block action sections only when the `Input Data` flag the docs gate each on is set.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e9010e6`](https://github.com/JSPrismarine/JSPrismarine/commit/e9010e68975bfc21aeb6edb913afef3d4ff02ec5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSkinHandler` relays a skin change as a packet the server writes itself instead of forwarding the bytes the client sent, so a client's `TrustedSkinFlag` claim no longer reaches other players. It also replaces the sender's player list entry, so a player who joins later receives the new skin, and it drops a skin whose image bytes do not fill its size, whose image is more than 4096 pixels a side, or whose geometry is not JSON. `PlayerListEntry.withSkin` returns a copy of an entry carrying another skin.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`62c2ee8`](https://github.com/JSPrismarine/JSPrismarine/commit/62c2ee83247e10e45ccac5d3476e288b7c0e32c5) Thanks [@filiphsps](https://github.com/filiphsps)! - `PositionTrackingDBClientRequestHandler` drops a request whose `Action` is not `Query`, the only action the docs list, with a debug log line instead of reading it as a query.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`73e3455`](https://github.com/JSPrismarine/JSPrismarine/commit/73e3455ab183e92e48994c696e5940d1b47899e2) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerAuthInputHandler` records each input's `Tick` on the session before doing anything else, so the packets the server sends back about that player carry it as their `PlayerInputTick`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f345277`](https://github.com/JSPrismarine/JSPrismarine/commit/f345277ad0ee92353b71ff29bc9562575f8e8c17) Thanks [@filiphsps](https://github.com/filiphsps)! - A refused login now ends the way the protocol docs describe. A client on the wrong protocol gets the `LoginFailed_ClientOld` or `LoginFailed_ServerOld` play status and then a disconnect carrying `OutdatedClient` or `OutdatedServer`, from both `RequestNetworkSettingsHandler` and `LoginHandler`. A full server sends `LoginFailed_ServerFullSubClient` and then a disconnect carrying `ServerFull`. `LoginHandler` used to send the status and leave the connection open, and `RequestNetworkSettingsHandler` sent the generic `Disconnected` code. `PlayerSession.sendPlayStatus` now takes a `PlayStatusType` instead of any number.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0cb1faa`](https://github.com/JSPrismarine/JSPrismarine/commit/0cb1faa002e22c9bfb423092b9baf00c6a2e73fc) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the fifty packets and three handlers that had implementations but were missing from `Packets.ts` and `Handlers.ts`, so the server no longer drops them as unimplemented. A test now checks that every packet and handler file is exported, that ids are distinct and match `Identifiers`, and that `Identifiers` matches `@jsprismarine/protocol`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d692152`](https://github.com/JSPrismarine/JSPrismarine/commit/d692152ea08791fe408f2093a58fc2a3dadf5c74) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `SimpleEventPacket`, `MultiplayerSettingsPacket`, `DebugInfoPacket`, `LegacyTelemetryEventPacket` and `ClientboundDebugRendererPacket` with the packet registry, and `SimpleEventHandler` and `MultiplayerSettingsHandler` with the handler registry. A client flipping the commands switch or asking for an Education Edition join code is now decoded and logged at debug level instead of being reported as an unimplemented packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2f8caed`](https://github.com/JSPrismarine/JSPrismarine/commit/2f8caed2eecf581b0f6e47e4b2e6cfdeb80dedc3) Thanks [@filiphsps](https://github.com/filiphsps)! - `RequestAbilityHandler` applies the client's flight toggle through `Player.setFlying` and answers every other request, or a refused one, by resending the player's abilities, so the client no longer waits for an `UpdateAbilitiesPacket` that never comes. `RequestPermissionsHandler` lets an operator add or remove another player from the op list through the player list's permission dropdown and resends the current abilities for a `Custom` level or a non-operator requester.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cab994b`](https://github.com/JSPrismarine/JSPrismarine/commit/cab994bb54ccec937e7a6280a0a2ec29734b8290) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackChunkRequestHandler` now disconnects a client that asks for a resource pack chunk,
  with the resource pack disconnect reason, instead of logging the request and leaving the client
  on its download screen. The server serves no packs, so no requested chunk exists.
  `ResourcePackType` gains the `Invalid = 0` member from Mojang's `PackType` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2dbbcbf`](https://github.com/JSPrismarine/JSPrismarine/commit/2dbbcbffdba35f64824bf1d018e1431cc2fd2dee) Thanks [@filiphsps](https://github.com/filiphsps)! - `ResourcePackClientResponseHandler` answers every status a client can send. A player that
  refuses the packs, or asks the server to send packs it never offered, is disconnected with
  the resource pack reason instead of being left on the loading screen until the connection
  times out. A repeated `Completed` no longer starts the join again, which used to announce
  the player to everyone a second time, and a repeated `HaveAllPacks` after the join started
  no longer sends a second pack stack. A status outside the four is logged and dropped.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5fa2f55`](https://github.com/JSPrismarine/JSPrismarine/commit/5fa2f555ffac50d5f3c2315a499af172edad1f64) Thanks [@filiphsps](https://github.com/filiphsps)! - `RespawnHandler` drops a `RespawnPacket` that names another player's runtime id, and answers `ClientReadyToSpawn` with the world spawn while the player is still dead instead of the position they died at.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c19ffdf`](https://github.com/JSPrismarine/JSPrismarine/commit/c19ffdf5636a495013995042960cd30a38377b74) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetDisplayObjectivePacket` exports an `ObjectiveSortOrder` enum (`Ascending` = 0, `Descending` = 1) and types its `sortOrder` field with it. The JSDoc of `SetScorePacket` and `SetScoreboardIdentityPacket` now records why the pre-2193 type-byte layouts no longer apply, and the scoreboard packets link to the 1.26.51 docs.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c5e40b4`](https://github.com/JSPrismarine/JSPrismarine/commit/c5e40b4f2e3dc6eadfb46d89affb990ab00861e3) Thanks [@filiphsps](https://github.com/filiphsps)! - The handlers for `StructureBlockUpdate`, `StructureTemplateDataRequest`, `LecternUpdate`, `LabTable`, `AnvilDamage` and `PlayerToggleCrafterSlotRequest` drop a packet whose position is out of reach, in a chunk that is not loaded, or not the block the screen belongs to, and log the reason at verbose level. `BookEditHandler` drops an edit whose slot holds no book and quill or whose page number a book cannot have. None of these blocks are stored yet; the checks keep a crafted packet from being taken at its word or from loading terrain.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`dfb64e9`](https://github.com/JSPrismarine/JSPrismarine/commit/dfb64e9af7853e51cbe04e50dd01487ced986054) Thanks [@filiphsps](https://github.com/filiphsps)! - Decode `ResourcePacksReadyForValidationPacket` (id 340), `PartyChangedPacket` (id 342) and `SetPlayerFurnaceOptionsPacket` (id 351) instead of warning `Packet 0x.. isn't implemented` when a 1.26.51 client sends them. Each gains a class, a handler and a registry entry. The resource pack report has no fields and needs no reply; the party change is logged with its id and leader flag, and an id over the schema's 49 characters is dropped; the furnace options are logged, and a furnace type, tab or layout outside its enum is dropped. `FurnaceType`, `FurnaceLeftTabIndex` and `FurnaceLayout` are exported from the furnace packet module. None of the three changes server state yet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e1b44b2`](https://github.com/JSPrismarine/JSPrismarine/commit/e1b44b272cd941c6106039b4b21329c45abd06bb) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetActorDataPacket` carries the receiving player's last input tick for its own entity and zero for any other entity, instead of the server tick.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fd4bbc4`](https://github.com/JSPrismarine/JSPrismarine/commit/fd4bbc482770f43d8378b39773109f3e688016bd) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetActorLinkPacket`, `AddPaintingPacket` and `SetActorLinkHandler` are registered, so a client mounting something no longer logs an unimplemented packet warning. The handler drops a link that does not have the sender at either end.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`eb3fd44`](https://github.com/JSPrismarine/JSPrismarine/commit/eb3fd44b6ff60a6adc0597402cfd1d4018a4cff2) Thanks [@filiphsps](https://github.com/filiphsps)! - `SetLocalPlayerAsInitializedPacket` now encodes as well as decodes, so a client built on the package can send it. Its JSDoc lists the protocol 2193 layout: `Player ID` as one varuint64.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f74ff2f`](https://github.com/JSPrismarine/JSPrismarine/commit/f74ff2f7e77619af2d10da78bc6cd9743ce72bdb) Thanks [@filiphsps](https://github.com/filiphsps)! - The join sequence floors a fractional world spawn before writing it into `SetSpawnPositionPacket`, so a spawn at `-0.5` names block `-1` instead of block `0`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`761a713`](https://github.com/JSPrismarine/JSPrismarine/commit/761a71380bade91ace18a3df0ebf565443d9ca86) Thanks [@filiphsps](https://github.com/filiphsps)! - `SettingsCommandPacket` and `SettingsCommandHandler` are registered, so a world setting toggled
  from the client's settings screen (for example `/gamerule showcoordinates true`) reaches the
  command manager instead of being logged as an unimplemented packet and dropped.
  `CommandOutputPacket` and `ServerSettingsResponsePacket` are exported from `Protocol.Packets`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`062aa3b`](https://github.com/JSPrismarine/JSPrismarine/commit/062aa3b75a4d2aa55bad733dfb9e00eeb5b58647) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGamePacket` now fills its fixed level and join fields with the values a Bedrock Dedicated Server 1.26.51 sends: the spawn biome name is `minecraft:plains`, Nether Type is false, Limited World Width and Depth are 16, Server Version is the newest version the server speaks, and Server Configuration Join Info is present and empty rather than absent.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`856ec37`](https://github.com/JSPrismarine/JSPrismarine/commit/856ec374b2feb8da6df03563c9f7b09a8d181de8) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGamePacket` now carries the world's generator type and dimension instead of a fixed Overworld generator in dimension 0. A flat world is announced as `Flat`, which is what a Bedrock Dedicated Server sends for one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e59720d`](https://github.com/JSPrismarine/JSPrismarine/commit/e59720d1524333e38579ff2eea26ef7bacccf88d) Thanks [@filiphsps](https://github.com/filiphsps)! - `StructureBlockUpdatePacket` reads and writes `Redstone Save Mode` as a ZigZag varint32, the compressed integer the 1.26.51 docs describe, instead of a plain byte. A client that picks `SavesToDisk` sends the byte 0x02, which used to decode as 2 rather than 1.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2a803b4`](https://github.com/JSPrismarine/JSPrismarine/commit/2a803b4b31084924ce86dacd5cb9daa9fcf80068) Thanks [@filiphsps](https://github.com/filiphsps)! - `SubChunk.networkDeserialize` reads version 9 and version 1 records correctly. It skipped the signed index byte a version 9 sub chunk carries after its layer count, so the first layer's header was read one byte early, and it read a layer-count byte from a version 1 record, which has none.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f21e70a`](https://github.com/JSPrismarine/JSPrismarine/commit/f21e70a71a65729844f85b7dea051febc4e589ac) Thanks [@filiphsps](https://github.com/filiphsps)! - Register `SubClientLoginPacket` (id 94) and its handler. Both existed but neither was exported from the packet and handler registries, so a split-screen player's login was logged as an unimplemented packet. The handler still only logs the attempt at debug level; the server binds one player per connection and has nowhere to put a second one.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f0d1719`](https://github.com/JSPrismarine/JSPrismarine/commit/f0d17195a6daa6eb0502b5bd0f54f45084352f1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Fill the `EntityType` command enum from the server's spawnable entity registry, so `/summon` offers the entities it can build instead of an empty list.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e80abed`](https://github.com/JSPrismarine/JSPrismarine/commit/e80abed43a45f30eeee69e153c5e96d50b4544ff) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerSession.sendMessage` sends an empty `Filtered Message` in `TextPacket` instead of repeating the message.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`09b66b9`](https://github.com/JSPrismarine/JSPrismarine/commit/09b66b9d71f61549e4173e4efaf3a981e0d70566) Thanks [@filiphsps](https://github.com/filiphsps)! - `UpdateAttributesPacket` now carries the `PlayerInputTick` the protocol docs ask for: the tick of the client's last handled `PlayerAuthInputPacket` for its own attributes, and zero for other entities. It used to send the server's tick counter. `PlayerSession.recordInputTick` stores the client's tick.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a5cbae7`](https://github.com/JSPrismarine/JSPrismarine/commit/a5cbae769bf072ba88b8b76cea3dc23b75c2d876) Thanks [@filiphsps](https://github.com/filiphsps)! - Block changes broadcast to clients now carry the `Network` flag in `UpdateBlockPacket`, as a
  Bedrock Dedicated Server does, instead of no flags. `UpdateBlockPacket.flags` and `.layer`
  default to `None` and `Normal` rather than being left undefined.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b294f3f`](https://github.com/JSPrismarine/JSPrismarine/commit/b294f3faf684a9810ee38e4cf6fa3b97e16c3d68) Thanks [@filiphsps](https://github.com/filiphsps)! - `UUID` accepts unsigned 32-bit words in its constructor. A word above `2^31 - 1`, such as `0x8899aabb`, used to throw a `RangeError` when the uuid was serialized or printed; it is now wrapped to the signed form `fromString` and `fromBinary` produce, so such a uuid equals, prints, and serializes the same either way.

- [#2604](https://github.com/JSPrismarine/JSPrismarine/pull/2604) [`8bbdd64`](https://github.com/JSPrismarine/JSPrismarine/commit/8bbdd646984bf5894b8061d125e4c34083a9b819) Thanks [@filiphsps](https://github.com/filiphsps)! - A world's `level.json` and player data files are written key by key, so a comment left in them survives the next save. They may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`bf3d6d7`](https://github.com/JSPrismarine/JSPrismarine/commit/bf3d6d7786b7cc36237336674f3a7a0909f0559a) Thanks [@filiphsps](https://github.com/filiphsps)! - Give skeletons bows, and arrows something to hit.
  
  **`Projectile`** is not a mob with the thinking removed. It has no goals, no pathfinding and no business being shoved by its neighbors, and it needs one thing a mob does not: to notice what it passes *through* rather than only what it ends up inside. An arrow crossing three blocks in a tick steps clean over anybody standing between the two positions, so a check at the destination alone finds nothing at all. Hence the sweep - the flight is walked in quarter-block samples, entities before blocks, so somebody standing in a doorway is hit rather than the wall behind them.
  
  The shooter is immune for the first few ticks, because an arrow starts inside the bow that fired it and nothing would ever leave the string otherwise. An arrow that cannot hurt what it meets - a creative player, something inside its grace period - carries on through rather than stopping dead in mid-air against them.
  
  Arrows stick where they land and stay there, which needs the flight to stop entirely: ticking a stuck arrow would send it through the floor it just hit. Damage comes from *speed*, which is what makes drawing a bow fully worth doing - a skeleton's shot and a player's are the same arrow launched at different speeds. Snowballs and eggs hurt nothing and shove everything; that cannot go through `Entity.damage`, which refuses a blow of zero and would take the knockback with it.
  
  **Drawing a bow is measured, not reported.** Bedrock says "started" in one transaction and "released" in another, and the gap between them is the charge - so `RELASE_ITEM`, which until now was logged and dropped, closes a clock that `CLICK_AIR` opens. The power curve is vanilla's rather than a straight fraction of the time, and the difference is the point: it is slow at first and fast at the end, so the last few ticks of a draw are worth far more than the first few, which is what makes half-drawing feel weak rather than merely weaker. A full draw crits.
  
  Aiming uses Minecraft's own angle convention, where yaw runs clockwise from south - the x term is a negative sine and the z term a positive cosine. Getting that wrong sends every arrow off at ninety degrees to where the player was pointing, which looks like a physics bug rather than a sign error.
  
  **Skeletons and strays got a brain of their own.** `rangedBrain` is the hostile one with the swing swapped for a bow, and unlike the melee goal the ranged one claims the *movement* lane - keeping its distance is half of how an archer fights. It outranks the approach, so a skeleton that has got within bow range stops closing and starts shooting, and backs off if you walk into it. That is what makes a bow dangerous rather than a worse sword.
  
  **They visibly hold the bow, and visibly draw it**, and neither of those was possible before. `AddActorPacket` has no room for equipment, so a mob's weapon has to follow it as a packet of its own - without which a skeleton fires arrows out of an empty fist.
  
  The pose took three goes to get right, and the first two were reasonable and wrong. Metadata could not reach a client at all for anything but the local player, so `entityMetadataChanged` had to exist first. Then the bow was being lowered for the single tick of each loose, which is worse than it sounds: a client that plays its release animation when the flag goes false shows *only* that - a twitch once a shot, and never a draw.
  
  **The thing that actually poses the mob is `query.has_target`.** Mojang's own skeleton animation controller transitions into its attack state on `query.has_target && !query.facing_target_to_range_attack` and never looks at `is_using_item` at all, so what the client needed was not a flag but the *target's runtime id*, in the `TARGET_ENTITY_ID` metadata field. `Mob.setTarget` now publishes it - and clears it again when the mob gives up, or the skeleton would keep aiming at nothing. `USINGITEM` and `CHARGING` are still set, since the humanoid bow animations do read them.
  
  @see https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/animation_controllers/skeleton.animation_controllers.json
  
  Arrows are not taken out of the quiver and the bow is not worn down. Both need the same thing - telling a client that a slot has changed - and both are left with the armor work where that machinery lives, because a server that silently disagrees with the client about what is in a player's hand is worse than one that has not got round to the accounting.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol 2193: Minecraft 1.26.50 and 1.26.51.
  
  Everything that was captured for 1.26.40 was captured again from a Bedrock Dedicated Server 1.26.51.1 - the item table (2076 items), the block palette (1477 blocks, 22079 states: 98 new wool and concrete stairs and slabs, a `minecraft:corner` on every stair, four connection states on every fence, pane and bar) and the recipes (1967) - and three things a 2193 client will not get into the world without were captured for the first time: the jigsaw structure rules, sent as `JigsawStructureDataPacket` before `StartGame` because the client disconnects with `MissingStructureData` otherwise; the definitions of the ninety-eight vanilla blocks that 1.26.50 defines in data, which `StartGamePacket` now declares the way a real server does; and the biome definitions, whose packet stopped being two loose lists and became a map of biome data plus a shared string table - a client reaches the world-generation screen with an empty one and gives up, so the real payload is now replayed. `packages/client/tools/capture-server-data.mjs` records all of them in one login.
  
  This was found the only way it could be: a retail 1.26.51 client reaching the world-generation screen and stalling. The same client also confirmed that, faced with a server that answers NetherNet's `GET /v1/join` signaling probe with a 404, it falls back to a direct RakNet connection - which is the transport this server speaks.
  
  The `LevelChunkPacket` payload wrote its biome sections with the wrong palette header. Each biome sub chunk is a paletted store like the block ones, and its header is `(bitsPerBlock << 1) | networkFlag`; the server wrote `bitsPerBlock 0` but left the network flag clear (`0` instead of `1`), which tells the client the palette is the *persistent* on-disk kind whose entries are NBT compounds. The client then reads the biome value varint as the start of a tag, the whole column decodes to nonsense, and it drops the join at world generation - the last thing standing between a real client and spawning. The section is now `01` (single value, network flag set) plus the biome value per sub chunk, one sub chunk for every one of the client's twenty-four, then the border byte, checked by decoding the packet the server sends and confirming it is consumed to the last byte. This too was invisible to the server's own client, which never deserialized terrain.
  
  **The packets the client actually sends were wrong at 2168, and are right now.** The 2168 work was checked with this repository's own client, which reads `StartGame` partially, moves with `MovePlayerPacket` and never touches an inventory - so nothing exercised the paths a real client takes, and several of those had drifted years earlier:
  
  - `StartGamePacket` still wrote a movement mode in front of the movement settings. That field left the protocol at 1.21.90, when client authoritative movement was retired, and every field after it went out one byte late. The full layout is now modeled in `@jsprismarine/protocol` and checked by decoding the packet BDS 1.26.51 sends and writing it back byte for byte.
  - A real client moves with `PlayerAuthInputPacket`, every tick, and has since 1.21.80; the server had no decoder for it, so a real player could not move, and neither could they break a block, because a survival break rides in that packet's block actions. Both are read now and go through the same code as `MovePlayer` and `PlayerAction` do.
  - `InventoryTransactionPacket` was read in its 748 layout: no presence byte before the legacy slot list, window ids and flags inferred rather than read, and no `Hand`, which 2193 added. `ItemStackRequestPacket` likewise: an action's selector, the four fixed bytes of a stack net id, the client's own descriptor form for auto-craft ingredients. `ItemStackResponsePacket` wrote none of its three optionals. All three follow gophertunnel's 2193 encoding now, with tests that write the bytes by hand.
  - Block positions in `PlayerActionPacket` were read with an unsigned y, the layout up to 1.26.0; a block below sea level came out in the billions.
  
  `PlaySoundPacket` gained the loop count, the range bypass and the two optionals 1.26.50 added, and can be encoded at all. `BuildPlatform` lost its retired members, `UWP` among them: BDS validates a login against the list now and refuses the value the client used to report, so it reports `WIN32`.
  
  **The datagen reads Mojang's new publications.** `enums.html` is gone; a release is a `metadata.zip` of JSON schemas attached to a GitHub release, and the schemas list an enum's members without their values. `import-schemas.js` pins two releases - the target for the members, the first later preview whose schemas carry `x-enum-binary-value` for the numbers - into `snapshot/enums.json`, which `generate-enums.js` prefers over the old HTML dump wherever the schemas describe an enum. `DisconnectReason` and `PlayerAuthInputData` are generated from them. The recipe generator reads the `.brarchive` files a 1.26.50 server packs its behavior packs into, and the palette capture places every block in four settings so that none pops before the save.
  
  One thing this release cannot fix: BDS 1.26.51 defaults to `transport=nethernet` and prints that RakNet is no longer a supported transport for players. This server speaks RakNet only. Whether a 1.26.51 client still connects to a RakNet server by address is not something this repository can test.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`ecf472e`](https://github.com/JSPrismarine/JSPrismarine/commit/ecf472ebcd2a7f87d38b7b7ecdbe52f03a7d043f) Thanks [@filiphsps](https://github.com/filiphsps)! - `StartGame` now tells the client the server has not enabled client-side chunk generation, so a 1.26.51 client no longer generates vanilla terrain for chunks the server has not sent. The off-hand item goes out in a `MobEquipment` packet for the offhand container instead of `MobArmorEquipment`'s body armor slot. `ClientConnection.disconnect` takes a `DisconnectReason` code, defaulting to `DISCONNECTED`; `Player.kick` sends `KICKED` and the server shutdown sends `SHUTDOWN`. `AddPlayer` carries the player's build platform, permission levels, and platform chat id.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the server tick at a steady twenty ticks a second, and stop measuring time with a clock that can move underneath us.
  
  The tick loop corrected the same lateness twice. `executionTime` was measured from the _end_ of the previous tick, so it already contained that tick's sleep, and `MINECRAFT_TICK_TIME_MS - executionTime` was therefore a complete drift correction on its own. The comparison of `elapsedTime` against `expectedElapsedTime` that followed applied a second one, against the accumulated total. Two corrections for one error is a loop gain of two, and the loop oscillated exactly as that predicts: it alternated a near-zero gap with a near-hundred-millisecond one, averaging a perfectly correct twenty ticks a second while never actually holding fifty milliseconds. Measured against real timers, the interval had a standard deviation of 47 ms around a 50 ms target. Everything that leaves a tick as a batch — entity movement, chunk sends — went out in pairs separated by silence, which is not what a client interpolating between updates expects to receive.
  
  Each tick's deadline is now derived from one fixed origin, and the correction happens once. The same measurement gives a standard deviation of zero.
  
  Lateness beyond two seconds is now written off with a `Can't keep up!` warning rather than repaid in full. A ten second stall used to be owed back as two hundred consecutive zero-delay ticks, running the world at maximum speed and starving the event loop precisely when it was already in trouble. Shorter hitches are still made up, so a brief stall does not leave the world permanently running late.
  
  TPS is measured over a sliding one-second window instead of one that reset its own baseline whenever it crossed a second — the first reading after each reset covered a single tick and was noise reported as a rate. It is also no longer clamped to twenty: a loop making up lost time genuinely runs faster than that, and the clamp meant the one metric that should expose the fault reported perfect health throughout.
  
  The `tick` event is awaited. A plugin's tick handler now runs inside the tick like every other piece of tick work, instead of having its continuation land in the middle of some later tick and its rejection escape as an unhandled rejection.
  
  In RakNet, every deadline a session keeps — the retransmission timeout, the split reassembly timeout, the session timeout — and every round trip sample now comes from a monotonic clock. On `Date.now()` a forward step from an NTP correction or a suspend/resume expired all of them at once and folded a step-sized round trip into the RTT estimate; a backward step put them out of reach and stopped retransmission until real time caught up. Timestamps that travel on the wire still use `Date.now()`: they are values the peer echoes back, not durations we measure.
  
  `Session.update()` now takes that reading itself when given no argument, because a caller mixing the two clocks does not get a slightly wrong answer, it gets epoch milliseconds compared against process-relative ones — every deadline expired at once and the session timed out on its first idle pass. An argument is still accepted, for updating several sessions against one instant and for driving time forward in a test.
  
  The RakNet tick loop no longer stops when a session update throws. It scheduled its own next call as the last statement of the callback, so a single session raising an exception took acknowledgments, retransmissions and timeouts down permanently for every connection on the server. Each session is now isolated from the next and the loop reschedules from `finally`. It also subtracts the work it just did from the interval, so the polling rate no longer falls away as sessions are added — with three milliseconds of work per pass it had dropped from ~98 Hz to ~80 Hz.
  
  World auto-save ran once. `currentTick / 20 === 120` is true for exactly one value of the counter, so a world was saved two minutes after startup and then never again for the life of the process; it is a remainder now. `World.save` also handed an async callback to `forEach`, which discards the returned promise, so player writes were still in flight — and their failures unobserved — after `save` had resolved. A shutdown save could report success before a single player had reached disk.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`4b93318`](https://github.com/JSPrismarine/JSPrismarine/commit/4b933182ab382f78dd4d660dd91c2cb86b85c851) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `/tp @s @s` and `/tp <you> <you>` sending the player to NaN, which the client showed as -2147483648 ([#460](https://github.com/JSPrismarine/JSPrismarine/issues/460)).
  
  A position argument now refuses anything that is not three finite numbers, so a selector or a player name can no longer be read as coordinates. `/tp 1 2 3` works again as well; the numbers used to be tried as a player name first. An entity also refuses to move to a position with a NaN or infinite coordinate, and whole coordinates in `/tp` land in the middle of the named block (`10` becomes `10.5`) instead of half a block short of it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b) Thanks [@filiphsps](https://github.com/filiphsps)! - Read a batch the client chose not to compress, instead of dropping the login.
  
  The compression algorithm travels at two widths that do not agree. `NetworkSettingsPacket` negotiates it in a two byte field, where "none" is `0xffff`; every batch afterwards repeats it in a *single* byte, where none is `0xff`. Reading that byte straight into `PacketCompressionAlgorithm` matched neither ZLIB, SNAPPY nor NONE, fell through to the unsupported branch and threw.
  
  It showed up as `Failed to inflate batched content` a few packets into a login that had otherwise completed - the big packets are compressed and decoded fine, so the first small one the client sent uncompressed was the first to fail, and the client then sat until it timed out.
  
  `CompressionProvider.fromBatchPrefix` now widens the byte to the negotiated form, and `BatchPacket` goes through it on both decode paths. The encode side already wrote `ZLIB` as a byte, which is 0 either way.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`ef1fd47`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1fd47b9d28a22b006d21ab497103367f081085) Thanks [@filiphsps](https://github.com/filiphsps)! - Set the undead alight in the morning.
  
  Night ended and nothing happened to the things that came out in it, so a zombie that wandered into the open at dawn stood there all day. It is one of the loudest signals in the game that time is passing, and its absence made a world feel static however much else was moving.
  
  **Which mobs burn is stated per species rather than guessed.** "Is it undead" and "does it burn" are different questions with different answers: a husk's entire reason to exist is that it is the zombie that survives the desert sun, and a wither skeleton comes from a dimension with no sky. Zombies, zombie villagers, drowned, skeletons, strays and phantoms burn; husks, wither skeletons, zombie pigmen and zoglins do not.
  
  Water saves you - which is why a drowned is safe in its river and alight the moment it climbs out - and the head is what counts, since a zombie in a one-deep pool has its feet under water and its skull in the sun. A helmet would save you too in vanilla; there are no armor slots yet, so that is not modeled.
  
  Burning shares its timer with standing in a fire, so a zombie that walks out of one into daylight goes on burning rather than starting afresh, and one that reaches shade keeps burning for the usual eight seconds. `firedamage` is honored.
  
  **The sky check is on an interval, not every tick.** Working out whether anything stands between a mob and the sky means walking the column above it, which is cheap once and not cheap for every zombie on the server twenty times a second. It only runs for species that can burn at all, so nothing pays for it that would not catch fire anyway.
  
  **`world/DayCycle.ts`** now holds the clock. The spawner had its own private copy of the day length and the dusk and dawn ticks, and two things now care what time it is - monsters may only spawn at night, and the undead burn in the morning. Two copies of those numbers would let a zombie spawn into a world that was about to set it on fire. `BlockView.seesSky` likewise replaces the spawner's own private version, so everything a mob is told about the world above it comes through the same reader as everything else.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`0a792e7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a792e773989dc75658f46609f0acfeddc1dc3a5) Thanks [@filiphsps](https://github.com/filiphsps)! - Put villages and wildlife into the overworld, and give mobs an AI that moves them smoothly.
  
  **Structures.** `world/generators/structure/` is new. A structure is a pure function of its origin: the world is cut into a grid of regions, each region's origin is arithmetic on the world seed, and any chunk can work out on its own which structures reach it, plan each one in full, and draw the slice it owns through a canvas that discards everything outside its sixteen blocks. Each of the dozen chunks a village covers does the same work and keeps a different part of it, and the parts fit because they came from the same plan. No chunk needs a neighbor to have been generated, and generating one twice gives the same result - which is what makes a structure larger than a chunk possible at all when chunks are generated alone and in no particular order.
  
  Villages are the first: a well, streets running out from it, and houses, fields and lamp posts along them. Buildings level the ground they stand on - foundations below, headroom cleared above - and are held within a few blocks of the village's own level, so a village drapes over a rise rather than being quarried into it. Sites that are underwater or too rugged are refused, which puts a village roughly every four to five hundred blocks.
  
  **Mobs.** `entity/Mob.ts` and `entity/ai/` are new, and the mobs that spawn now derive from `Mob`. Behavior is a list of small goals - float, approach, stroll, watch, look around - claiming *lanes* rather than one state machine per species, so a mob can walk somewhere and watch you at the same time. Routes come from A\* over the block grid, and are then straightened by string-pulling and followed by aiming at a point some way *along* the route rather than at the next corner.
  
  Movement is deliberately physical: velocity integrated per tick, chasing a desired velocity rather than being assigned it, with a limited turn rate taking the short way round the circle. A server that decides "the mob is now one block north" produces stuttering no client can hide, so the smoothness is on the server, where it has to be.
  
  The timings and speeds are taken from the vanilla Bedrock behavior packs rather than invented, and `entity/ai/Speed.ts` holds them in blocks per *second* so they can be judged against a player's 4.317. The one that matters most is `random_stroll`'s `interval: 120` - a one in a hundred and twenty chance *per tick* of setting off, which makes the wait geometric with a long tail. A fixed or uniform pause instead makes a whole field of animals visibly pulse, and each one plainly on a timer. `look_at_player` likewise runs on a 2% roll rather than whenever somebody is in range.
  
  **Movement on the wire.** Three separate faults, none visible in the movement model:
  
  - Rotation was never sent, so every mob faced north whatever it was doing.
  - The three rotations were written as pitch, *head* yaw, body yaw. The packet's order is pitch, body yaw, head yaw, so an entity's head was set from its body and its body from its head - a head stuck at an angle that never turned.
  - Every move was sent as its own compressed batch and its own RakNet frame, *and* `sendDataPacket` queues behind any chunk still compressing. So while a walking player streamed terrain, every mob's movement waited behind it and arrived in a burst: mobs froze and jumped in the rhythm the chunks were arriving in. A tick's movement now goes out as one batch per player.
  
  Pathfinding was also costing milliseconds a route on the tick thread - the open set was re-sorted on every expansion, the expansion budget did not scale with the distance, and ties were not broken - and a late tick is visible as stuttering however smooth the model underneath is.
  
  `MobSpawner` puts animals on grass by day and monsters in the dark, in groups, around players, and takes away again the ones nobody is near. Village inhabitants and anything restored from the save file are marked persistent and are never tidied away.
- Updated dependencies [[`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b), [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7), [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310), [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310), [`60e9e6f`](https://github.com/JSPrismarine/JSPrismarine/commit/60e9e6f981cce46edf2bb2ee0b7b1eea3b7360ee), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`b176610`](https://github.com/JSPrismarine/JSPrismarine/commit/b176610cbad718b946e0144aec3fbe118a329eeb), [`44eacb3`](https://github.com/JSPrismarine/JSPrismarine/commit/44eacb30f3c214dbe3ac6179d0ad18df49d7ce36), [`513ded0`](https://github.com/JSPrismarine/JSPrismarine/commit/513ded056f2857f2206c9c12fe8b86923fa9ea56), [`d158cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/d158cd1a9e9daabf3fc0f7c4d229ec1783fc1a1a), [`69c8c8b`](https://github.com/JSPrismarine/JSPrismarine/commit/69c8c8be34bea5b6b86e34e76702f82e912d09b5), [`45e2180`](https://github.com/JSPrismarine/JSPrismarine/commit/45e21809b6517e710b6d675375b35a1015d5d6dc), [`b60eb24`](https://github.com/JSPrismarine/JSPrismarine/commit/b60eb241bf2cb4efa47f802f67244644d079b290), [`252710e`](https://github.com/JSPrismarine/JSPrismarine/commit/252710ecac704f75053a3ab2998da56f6a74e5d3), [`ee36e67`](https://github.com/JSPrismarine/JSPrismarine/commit/ee36e67f668a141c8fea4e25c68acc67aab318f3), [`dc254e3`](https://github.com/JSPrismarine/JSPrismarine/commit/dc254e3444729fcec772e269741496ad24d0a4c2), [`36cce55`](https://github.com/JSPrismarine/JSPrismarine/commit/36cce5505a3b9498b12d6d6d676199d224559090), [`c6ae6ee`](https://github.com/JSPrismarine/JSPrismarine/commit/c6ae6ee9c4fba9ef58124d3d96b3c62713c51658), [`f7c3678`](https://github.com/JSPrismarine/JSPrismarine/commit/f7c3678c0ce868a4240a1c41e68ab2c9e06fa670), [`8f80b82`](https://github.com/JSPrismarine/JSPrismarine/commit/8f80b82f2d9f3e5ed58b3c72f9fbdd46be53f6dc), [`3d1383d`](https://github.com/JSPrismarine/JSPrismarine/commit/3d1383d3be610562d340519258d24c3792483f56), [`cebaebc`](https://github.com/JSPrismarine/JSPrismarine/commit/cebaebcb4d05adb428e749ab3492ae8c2b490eb3), [`8b69964`](https://github.com/JSPrismarine/JSPrismarine/commit/8b69964a6aa92258025e8a63df11d15e7c574b57), [`5803605`](https://github.com/JSPrismarine/JSPrismarine/commit/5803605491d65c38f335e7b32cb16503334b2af1), [`02be069`](https://github.com/JSPrismarine/JSPrismarine/commit/02be069794557206af5ede656b0ccba4894a9a75), [`242cd92`](https://github.com/JSPrismarine/JSPrismarine/commit/242cd92e03b3a7efb106bc9678c3d3677e6da889), [`1574fdb`](https://github.com/JSPrismarine/JSPrismarine/commit/1574fdb63320fc99e02cf2a4c80b8b12226a29e0), [`567faa0`](https://github.com/JSPrismarine/JSPrismarine/commit/567faa09375d9c9632ac893a7cb62ddca2d71b12), [`8535455`](https://github.com/JSPrismarine/JSPrismarine/commit/85354556a17db4908eccbf4d7aa6662324bd3b39), [`8eded3f`](https://github.com/JSPrismarine/JSPrismarine/commit/8eded3f230c4b8b707cb15047ac596fcfe264a65), [`fadb03d`](https://github.com/JSPrismarine/JSPrismarine/commit/fadb03d2b763c427686e926cc86eeb71ffbf8b9f), [`25bfb44`](https://github.com/JSPrismarine/JSPrismarine/commit/25bfb44acf70c2d3f1d7ab79c5c821ee355b78cb), [`377749c`](https://github.com/JSPrismarine/JSPrismarine/commit/377749cf41e27510fd2d2dd28311e2745ad11936), [`ebf5ed5`](https://github.com/JSPrismarine/JSPrismarine/commit/ebf5ed5475c44b1ddf41065acae664f8d1d5c8a9), [`601c5f8`](https://github.com/JSPrismarine/JSPrismarine/commit/601c5f8f3814455400c06b3bfd6392960ce1b203), [`576437e`](https://github.com/JSPrismarine/JSPrismarine/commit/576437ecff1a00d451b79a7d98f3553ccf222600), [`9d1b862`](https://github.com/JSPrismarine/JSPrismarine/commit/9d1b8623bcfe95396ae65b64b840fa7b25ac4ffc), [`2420ef3`](https://github.com/JSPrismarine/JSPrismarine/commit/2420ef3d6aa588ec09d635e4de06d2e65dd313fc), [`a844cb3`](https://github.com/JSPrismarine/JSPrismarine/commit/a844cb3e402095e24deece5e9c1e16ca3edf98a6), [`f74b8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/f74b8e11788d3ef9eed1be2de8056f09bc28420e), [`277da2e`](https://github.com/JSPrismarine/JSPrismarine/commit/277da2ed6c76cb85b500863cd5243ebf935e5ba0), [`b78d24b`](https://github.com/JSPrismarine/JSPrismarine/commit/b78d24be2d037d03bad94c3bd5941f83c3eb2850), [`78f79e3`](https://github.com/JSPrismarine/JSPrismarine/commit/78f79e367d1affbf6da3593cd4e5c4b58892a61c), [`8ef0331`](https://github.com/JSPrismarine/JSPrismarine/commit/8ef0331839c6d0d4f25fbb5268e6249474474da3), [`de5a310`](https://github.com/JSPrismarine/JSPrismarine/commit/de5a310503c3050a4c39f489a7ee8dd02b881102), [`988e073`](https://github.com/JSPrismarine/JSPrismarine/commit/988e073a443a69d815549645889f638c973b37f1), [`35948e3`](https://github.com/JSPrismarine/JSPrismarine/commit/35948e3f020af2db2cf4de827e8b67defb0144b6), [`fbc2fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/fbc2fdd0a2c1acd0a85e2c6d9da713f07fcc4ad9), [`cda08a0`](https://github.com/JSPrismarine/JSPrismarine/commit/cda08a0343ab6b072945b289c3e891ef698b9e9b), [`8c3d052`](https://github.com/JSPrismarine/JSPrismarine/commit/8c3d052c043b6d54c8d443a94fc13410a4d7ebe5), [`93b0c1a`](https://github.com/JSPrismarine/JSPrismarine/commit/93b0c1aae5ef1198187fd05ba4388bf4646cb40e), [`4905238`](https://github.com/JSPrismarine/JSPrismarine/commit/49052388894748c9d1acdf19f3927111678eb119), [`6c69430`](https://github.com/JSPrismarine/JSPrismarine/commit/6c6943009b0a483c9274c122e1f84ea5b8aba912), [`a8561c8`](https://github.com/JSPrismarine/JSPrismarine/commit/a8561c8014907284fcab23c24c5b1f1b7305d97e), [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a), [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6), [`fed1f50`](https://github.com/JSPrismarine/JSPrismarine/commit/fed1f50db5800ef6b8dea15e5a66263039c5c25d), [`688119a`](https://github.com/JSPrismarine/JSPrismarine/commit/688119aa7fde987dc8430003fc4975dc5a431b0b), [`e05ae9d`](https://github.com/JSPrismarine/JSPrismarine/commit/e05ae9d01e1ef72f3b77b22a45341205f9d118e0), [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691), [`67883b8`](https://github.com/JSPrismarine/JSPrismarine/commit/67883b85f3524614cc257d0c80f7bc86fb1677c6), [`ab1c7b5`](https://github.com/JSPrismarine/JSPrismarine/commit/ab1c7b556dda4b6c1f6bb33b10f5339e5aab415a), [`743ff36`](https://github.com/JSPrismarine/JSPrismarine/commit/743ff360ae20b8f61f299ecfb5de66004aae694d), [`bb82cdb`](https://github.com/JSPrismarine/JSPrismarine/commit/bb82cdba221175a5e83592536b16d474902f9fb1), [`6b77308`](https://github.com/JSPrismarine/JSPrismarine/commit/6b773085d0cd87fd285949908efa68facce446fd), [`ebbe3f9`](https://github.com/JSPrismarine/JSPrismarine/commit/ebbe3f9476dde4f3282ff6ec5c6f9c24282e8571), [`a4fa498`](https://github.com/JSPrismarine/JSPrismarine/commit/a4fa498f84cf78da063928af6ab658a9c5993c22), [`fbe7f4b`](https://github.com/JSPrismarine/JSPrismarine/commit/fbe7f4b42c880929ad15f35c420f825e4d722e15), [`d85faf3`](https://github.com/JSPrismarine/JSPrismarine/commit/d85faf37fd9be0295931458c58c86f40750c7abb), [`d9b1496`](https://github.com/JSPrismarine/JSPrismarine/commit/d9b1496ad2144ec3d9ed0cf3f48e7f14005f5901), [`655dbd0`](https://github.com/JSPrismarine/JSPrismarine/commit/655dbd0f5c721a9325ad3144c1e245ce068ec423), [`78a5a6c`](https://github.com/JSPrismarine/JSPrismarine/commit/78a5a6c10d10a4f3bf27098d6093a9988736df40), [`f60310c`](https://github.com/JSPrismarine/JSPrismarine/commit/f60310c669ad1b212ff4ec1b3905f34c29d1083d), [`8b37263`](https://github.com/JSPrismarine/JSPrismarine/commit/8b37263e758c8f64a2328dc4f26103d0998990e9), [`a2d820c`](https://github.com/JSPrismarine/JSPrismarine/commit/a2d820c16b89fbfd81e272cd7a43c9a0d71e63e9), [`5fd1c5e`](https://github.com/JSPrismarine/JSPrismarine/commit/5fd1c5ed275a800446ee803e6145b26a626928ef), [`64e1df3`](https://github.com/JSPrismarine/JSPrismarine/commit/64e1df3061e97ef1e45932a830960825e276d1f9), [`0fcc990`](https://github.com/JSPrismarine/JSPrismarine/commit/0fcc9902098c8f825f95a8737b158e1a23d88250), [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a), [`5940943`](https://github.com/JSPrismarine/JSPrismarine/commit/59409430950ae131ce1cdc5e15220bac176b4b62), [`52e4907`](https://github.com/JSPrismarine/JSPrismarine/commit/52e490722eb7c0d76c6342d3ac7ddc6fe88d91a2), [`650d0bf`](https://github.com/JSPrismarine/JSPrismarine/commit/650d0bf72f637e0972c287095eb74145ec8ed638), [`64cc66e`](https://github.com/JSPrismarine/JSPrismarine/commit/64cc66e90d5c29aa03016d66e6e393daec1f5063), [`1f304c1`](https://github.com/JSPrismarine/JSPrismarine/commit/1f304c13099487c5381a676929c8c7671bf4d560), [`09fa244`](https://github.com/JSPrismarine/JSPrismarine/commit/09fa2442ab5677d0ea64547b7260d386deb149f5), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a), [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de), [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9), [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23), [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7), [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab), [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235), [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389), [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394), [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13), [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029)]:
  - @jsprismarine/minecraft@0.15.0
  - @jsprismarine/protocol@0.15.0
  - @jsprismarine/raknet@0.15.0
  - @jsprismarine/binaryutils@0.15.0
  - @jsprismarine/math@0.15.0
  - @jsprismarine/nbt@0.15.0
  - @jsprismarine/color-parser@0.15.0
  - @jsprismarine/errors@0.15.0
  - @jsprismarine/leveldb@0.15.0
  - @jsprismarine/logger@0.15.0

## 0.14.2

### Patch Changes

- [`6b15f32`](https://github.com/JSPrismarine/JSPrismarine/commit/6b15f32341e8131b1c498013f2f951b774adff64) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix several long standing bugs and issues.
- Updated dependencies []:
  - @jsprismarine/color-parser@0.14.2
  - @jsprismarine/errors@0.14.2
  - @jsprismarine/logger@0.14.2
  - @jsprismarine/math@0.14.2
  - @jsprismarine/minecraft@0.14.2
  - @jsprismarine/nbt@0.14.2
  - @jsprismarine/protocol@0.14.2
  - @jsprismarine/raknet@0.14.2

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favor of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

- Updated dependencies [[`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2)]:
    - @jsprismarine/color-parser@0.14.1
    - @jsprismarine/errors@0.14.1
    - @jsprismarine/logger@0.14.1
    - @jsprismarine/math@0.14.1
    - @jsprismarine/minecraft@0.14.1
    - @jsprismarine/nbt@0.14.1
    - @jsprismarine/protocol@0.14.1
    - @jsprismarine/raknet@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- [`c572c06`](https://github.com/JSPrismarine/JSPrismarine/commit/c572c06c61f668cd7cfababb05e7adbc219876ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Bogus change to test changeset PR creation with `MACHINE_USER`.

- [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump TypeScript to 6.0.3 and drop deprecated `downlevelIteration`/`baseUrl` from tsconfigs.

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a), [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095)]:
    - @jsprismarine/color-parser@0.14.0
    - @jsprismarine/errors@0.14.0
    - @jsprismarine/logger@0.14.0
    - @jsprismarine/math@0.14.0
    - @jsprismarine/minecraft@0.14.0
    - @jsprismarine/nbt@0.14.0
    - @jsprismarine/protocol@0.14.0
    - @jsprismarine/raknet@0.14.0

## 0.13.5

### Patch Changes

- [`f8dddf8`](https://github.com/JSPrismarine/JSPrismarine/commit/f8dddf8bbd7e444248d82fa4179eacf538485100) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices.

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/color-parser@0.13.5
    - @jsprismarine/errors@0.13.5
    - @jsprismarine/logger@0.13.5
    - @jsprismarine/math@0.13.5
    - @jsprismarine/minecraft@0.13.5
    - @jsprismarine/nbt@0.13.5
    - @jsprismarine/protocol@0.13.5
    - @jsprismarine/raknet@0.13.5

## 0.13.2

### Patch Changes

- [`ab719cb`](https://github.com/JSPrismarine/JSPrismarine/commit/ab719cb2a58f3b099a3017694ce4ce610bf5cf54) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices (including vulnerable dependencies).

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.2
    - @jsprismarine/errors@0.13.2
    - @jsprismarine/logger@0.13.2
    - @jsprismarine/math@0.13.2
    - @jsprismarine/minecraft@0.13.2
    - @jsprismarine/nbt@0.13.2
    - @jsprismarine/protocol@0.13.2
    - @jsprismarine/raknet@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.1
    - @jsprismarine/errors@0.13.1
    - @jsprismarine/logger@0.13.1
    - @jsprismarine/math@0.13.1
    - @jsprismarine/minecraft@0.13.1
    - @jsprismarine/nbt@0.13.1
    - @jsprismarine/protocol@0.13.1
    - @jsprismarine/raknet@0.13.1

## 0.13.0

### Patch Changes

- [`ea1948a`](https://github.com/JSPrismarine/JSPrismarine/commit/ea1948a494893e0cb03774c5530971d20e7bfdaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Update dependenices.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.0
    - @jsprismarine/errors@0.13.0
    - @jsprismarine/logger@0.13.0
    - @jsprismarine/math@0.13.0
    - @jsprismarine/minecraft@0.13.0
    - @jsprismarine/nbt@0.13.0
    - @jsprismarine/protocol@0.13.0
    - @jsprismarine/raknet@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- [`6bf4e8d`](https://github.com/JSPrismarine/JSPrismarine/commit/6bf4e8dcfb07d45c1c1a6ff32b4993b0f8f4f96e) Thanks [@filiphsps](https://github.com/filiphsps)! - Throw when trying to get player data for a player with XUID.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72)]:
    - @jsprismarine/color-parser@0.12.1
    - @jsprismarine/minecraft@0.12.1
    - @jsprismarine/protocol@0.12.1
    - @jsprismarine/errors@0.12.1
    - @jsprismarine/logger@0.12.1
    - @jsprismarine/raknet@0.12.1
    - @jsprismarine/math@0.12.1
    - @jsprismarine/nbt@0.12.1

## 0.12.0

### Minor Changes

- [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Change config option `enable-title` to `enable-process-title`.

### Patch Changes

- [`0a8f8d7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8f8d7f2d8638f3da68abdbf65ba3c48dcda038) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve reloading stability.

- [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve ticking.

- [`98ec1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/98ec1c58363e95f04fec9c6118e637e21ad5fc1e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix world loading order and simplify getter.

- Updated dependencies [[`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe)]:
    - @jsprismarine/raknet@0.12.0
    - @jsprismarine/color-parser@0.12.0
    - @jsprismarine/errors@0.12.0
    - @jsprismarine/logger@0.12.0
    - @jsprismarine/math@0.12.0
    - @jsprismarine/minecraft@0.12.0
    - @jsprismarine/nbt@0.12.0
    - @jsprismarine/protocol@0.12.0

## 0.11.1

### Patch Changes

- [`a79d837`](https://github.com/JSPrismarine/JSPrismarine/commit/a79d837e132bd2fbf1a91452b680341dafa76fe2) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix shutting down the server sometimes leaving socket open.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.11.1
    - @jsprismarine/errors@0.11.1
    - @jsprismarine/logger@0.11.1
    - @jsprismarine/math@0.11.1
    - @jsprismarine/minecraft@0.11.1
    - @jsprismarine/nbt@0.11.1
    - @jsprismarine/protocol@0.11.1
    - @jsprismarine/raknet@0.11.1

## 0.11.0

### Minor Changes

- [`e962b51`](https://github.com/JSPrismarine/JSPrismarine/commit/e962b514e196511111877e9ad856a00291216c6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `enable-title` and `enable-ticking`.

- [`3303be8`](https://github.com/JSPrismarine/JSPrismarine/commit/3303be822a8aff09142172e0796e66473dc2fef2) Thanks [@filiphsps](https://github.com/filiphsps)! - Simplify console enable/disable.

- [`ad0e562`](https://github.com/JSPrismarine/JSPrismarine/commit/ad0e5623a34f0424bd520b68131b56e92dec1cea) Thanks [@filiphsps](https://github.com/filiphsps)! - Add config option to enable/disable the query.

- [`51ba84e`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba84e1fe3b7ad99a9fb07039048c9cab2075b6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add headless mode (running without console).

### Patch Changes

- [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3) Thanks [@filiphsps](https://github.com/filiphsps)! - Allow for shutting dowing without killing the parent process.

- Updated dependencies [[`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3)]:
    - @jsprismarine/logger@0.11.0
    - @jsprismarine/color-parser@0.11.0
    - @jsprismarine/errors@0.11.0
    - @jsprismarine/math@0.11.0
    - @jsprismarine/minecraft@0.11.0
    - @jsprismarine/nbt@0.11.0
    - @jsprismarine/protocol@0.11.0
    - @jsprismarine/raknet@0.11.0

## 0.10.0

### Minor Changes

- [`ef1e604`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1e604cdcddc73ea8b23b545142592a90b34884) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve server stopping.
  Fix incorrect order of actions in `world.addEntity``.
  Improve the console.

- [#1695](https://github.com/JSPrismarine/JSPrismarine/pull/1695) [`306495d`](https://github.com/JSPrismarine/JSPrismarine/commit/306495dff6d34e8a1dca1187bf5e9a285325ec8f) Thanks [@filiphsps](https://github.com/filiphsps)! - Simplify `json` and `yaml` handling.
    > We now properly handle parsing those files with comments, though they're not preserved when writing to the file.

### Patch Changes

- [`99566e3`](https://github.com/JSPrismarine/JSPrismarine/commit/99566e363f4a726de5180f998e7fd2fd36cc5bf7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix onw case of an export not being marked as a type export.

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a), [`a7f7e16`](https://github.com/JSPrismarine/JSPrismarine/commit/a7f7e16c3b5ee8415a9561b8eb388d81bd23fd9c)]:
    - @jsprismarine/color-parser@0.10.0
    - @jsprismarine/minecraft@0.10.0
    - @jsprismarine/protocol@0.10.0
    - @jsprismarine/errors@0.10.0
    - @jsprismarine/logger@0.10.0
    - @jsprismarine/raknet@0.10.0
    - @jsprismarine/math@0.10.0
    - @jsprismarine/nbt@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [[`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30)]:
    - @jsprismarine/minecraft@0.9.0
    - @jsprismarine/protocol@0.9.0
    - @jsprismarine/color-parser@0.9.0
    - @jsprismarine/errors@0.9.0
    - @jsprismarine/logger@0.9.0
    - @jsprismarine/math@0.9.0
    - @jsprismarine/nbt@0.9.0
    - @jsprismarine/raknet@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [#1685](https://github.com/JSPrismarine/JSPrismarine/pull/1685) [`40af4b2`](https://github.com/JSPrismarine/JSPrismarine/commit/40af4b23802f74b2eecd34a4f05e90044d51fd56) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrate `@jsprismarine/bedrock-data` to monorepo.

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/color-parser@0.8.0
    - @jsprismarine/minecraft@0.8.0
    - @jsprismarine/protocol@0.8.0
    - @jsprismarine/errors@0.8.0
    - @jsprismarine/logger@0.8.0
    - @jsprismarine/raknet@0.8.0
    - @jsprismarine/math@0.8.0
    - @jsprismarine/nbt@0.8.0

## 0.7.0

### Minor Changes

- [#1520](https://github.com/JSPrismarine/JSPrismarine/pull/1520) [`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Properly implement Position, Vector2 & Vector3

- [#1517](https://github.com/JSPrismarine/JSPrismarine/pull/1517) [`1e013a6`](https://github.com/JSPrismarine/JSPrismarine/commit/1e013a60b9987929b53b2cc1d333daf8b5d45196) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Bump to bedrock protocol 686

### Patch Changes

- Updated dependencies [[`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6)]:
    - @jsprismarine/math@0.7.0
    - @jsprismarine/color-parser@0.7.0
    - @jsprismarine/errors@0.7.0
    - @jsprismarine/logger@0.7.0
    - @jsprismarine/minecraft@0.7.0
    - @jsprismarine/nbt@0.7.0
    - @jsprismarine/protocol@0.7.0
    - @jsprismarine/raknet@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.6.0
    - @jsprismarine/errors@0.6.0
    - @jsprismarine/logger@0.6.0
    - @jsprismarine/math@0.6.0
    - @jsprismarine/minecraft@0.6.0
    - @jsprismarine/nbt@0.6.0
    - @jsprismarine/protocol@0.6.0
    - @jsprismarine/raknet@0.6.0

## 0.5.0

### Minor Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `GameType` to `Gametype` (parity fix).

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- [`3a00892`](https://github.com/JSPrismarine/JSPrismarine/commit/3a00892ab6d8e0647c94da96bb85553f08a8484b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol changes.

- Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1)]:
    - @jsprismarine/color-parser@0.5.0
    - @jsprismarine/minecraft@0.5.0
    - @jsprismarine/protocol@0.5.0
    - @jsprismarine/errors@0.5.0
    - @jsprismarine/logger@0.5.0
    - @jsprismarine/raknet@0.5.0
    - @jsprismarine/math@0.5.0
    - @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [#1458](https://github.com/JSPrismarine/JSPrismarine/pull/1458) [`2d32a17`](https://github.com/JSPrismarine/JSPrismarine/commit/2d32a17c994a3cbd3d98d94dd0f33280a863c81a) Thanks [@filiphsps](https://github.com/filiphsps)! - As a parity change with Java and BDS the console will no longer require
  you to type a `/` (slash) before running a command. As a consequence of
  this change the chat functionality of the console has been removed, to
  send chat messages now you will need to use one of the many commands
  like `/say`, `/me`, `/tellraw`, and more.

    All on `enable` and `disable` hooks have now been documented with JSDoc
    and also given proper return types.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/color-parser@0.4.5
    - @jsprismarine/minecraft@0.4.5
    - @jsprismarine/protocol@0.4.5
    - @jsprismarine/errors@0.4.5
    - @jsprismarine/logger@0.4.5
    - @jsprismarine/raknet@0.4.5
    - @jsprismarine/math@0.4.5
    - @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

- [`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a) Thanks [@filiphsps](https://github.com/filiphsps)! - Migrate to @jsprismarine/Minecraft's `gametype`.

- [`2b5bc2f`](https://github.com/JSPrismarine/JSPrismarine/commit/2b5bc2fbffe777c329fd5684e342050cd2e13c43) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Blocks in negative coordinates don't behave correctly." [#1328](https://github.com/JSPrismarine/JSPrismarine/issues/1328).

- [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Move `pitch`, `yaw` and `headYaw` to `Entity`.

- [#1334](https://github.com/JSPrismarine/JSPrismarine/pull/1334) [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Take advantage of raknet/src/utils/ServerName.ts." [#1313](https://github.com/JSPrismarine/JSPrismarine/issues/1313).

- [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix spawn location.
  Send entity metadata to clients.
  Slightly Simplify working with positions.
- Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a), [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7)]:
    - @jsprismarine/minecraft@0.4.4
    - @jsprismarine/raknet@0.4.4
    - @jsprismarine/protocol@0.4.4
    - @jsprismarine/color-parser@0.4.4
    - @jsprismarine/errors@0.4.4
    - @jsprismarine/logger@0.4.4
    - @jsprismarine/math@0.4.4
    - @jsprismarine/nbt@0.4.4

## 0.4.3

### Patch Changes

- [`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump version due to previous publishing failure.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.3
    - @jsprismarine/errors@0.4.3
    - @jsprismarine/logger@0.4.3
    - @jsprismarine/nbt@0.4.3
    - @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

- [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8) Thanks [@filiphsps](https://github.com/filiphsps)! - CommandManager: Remove legacy `execute` function.

- [#1303](https://github.com/JSPrismarine/JSPrismarine/pull/1303) [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename `onEnable` and `onDisable` to `enable` and `disable`.

- [#1312](https://github.com/JSPrismarine/JSPrismarine/pull/1312) [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7) Thanks [@filiphsps](https://github.com/filiphsps)! - Entity: Refactor Metadata to be more user-friendly.

- [#1299](https://github.com/JSPrismarine/JSPrismarine/pull/1299) [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55) Thanks [@filiphsps](https://github.com/filiphsps)! - World: Simplify `LevelData` handling.
  WorldManager: Improve `isWorldLoaded` check.
  Entities: Simplify.
  Player: Move UUID handling to `Entity`.

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies [[`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
    - @jsprismarine/logger@0.4.2
    - @jsprismarine/color-parser@0.4.2
    - @jsprismarine/errors@0.4.2
    - @jsprismarine/nbt@0.4.2
    - @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix stdin on Windows.
  Add input history.
  Improve exit reliability.

- [#1292](https://github.com/JSPrismarine/JSPrismarine/pull/1292) [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor `Server` to extend our custom `EventEmitter`.
  So, instead of using the `getEventManager()` function to get something emittable;
  you now just do a simple `server.emit('id', event);`.

- [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476) Thanks [@filiphsps](https://github.com/filiphsps)! - Refactor Chat constructor.

- [#1296](https://github.com/JSPrismarine/JSPrismarine/pull/1296) [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966) Thanks [@filiphsps](https://github.com/filiphsps)! - Add basic tab-completion support.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.1
    - @jsprismarine/errors@0.4.1
    - @jsprismarine/nbt@0.4.1
    - @jsprismarine/raknet@0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `Server.instance`.
    - Remove passing of version from `@jsprismarine/server` to `@jsprismarine/prismarine`.

- [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve `js/insecure-randomness`.

- [#1280](https://github.com/JSPrismarine/JSPrismarine/pull/1280) [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix bug resulting in config sometimes being null.
  Fix cases where stdin would continue being held by the process.
  Fix `isConsole` util function on `Entity`.
  Improve console logging.
- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`52a041c`](https://github.com/JSPrismarine/JSPrismarine/commit/52a041cfa567842ea77196c10434eb42aa9f791b)]:
    - @jsprismarine/color-parser@0.4.0
    - @jsprismarine/errors@0.4.0
    - @jsprismarine/raknet@0.4.0
    - @jsprismarine/nbt@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.3.0
    - @jsprismarine/errors@0.3.0
    - @jsprismarine/nbt@0.3.0
    - @jsprismarine/raknet@0.3.0

## 0.2.0

### Minor Changes

- [#1251](https://github.com/JSPrismarine/JSPrismarine/pull/1251) [`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove `experimental-flags`.

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- [#1249](https://github.com/JSPrismarine/JSPrismarine/pull/1249) [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `@jsprismarine/updater`.
    - We don't need an updater at the moment, in the future that job should probably be up to npm/jsr/etc.

- [#1252](https://github.com/JSPrismarine/JSPrismarine/pull/1252) [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix running a command using it's full ID (`/minecraft:help`).

- Updated dependencies [[`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1)]:
    - @jsprismarine/color-parser@0.2.0
    - @jsprismarine/errors@0.2.0
    - @jsprismarine/nbt@0.2.0
    - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add safety checks and fix invalid logic.

- [#1231](https://github.com/JSPrismarine/JSPrismarine/pull/1231) [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Remove `EvalCommand`.
    - It was potentially if not already a security risk.
    - We could potentially add something similar running under a virtual environment in the future, but not a priority at the moment.
    - Fix and substantially improve stdin/tty.
        - There are still ways to go, but it's a lot better now.

- [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix `level.json` loading.

- [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix issue with some commands failing due to a `getParameters()` call.

- [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly improve circular-dep hell.

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    - @jsprismarine/color-parser@0.1.1
    - @jsprismarine/raknet@0.1.1
    - @jsprismarine/nbt@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    - @jsprismarine/color-parser@0.1.0
    - @jsprismarine/raknet@0.1.0
    - @jsprismarine/nbt@0.1.0
