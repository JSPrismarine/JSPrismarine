# @jsprismarine/protocol

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.2
  - @jsprismarine/minecraft@0.15.2
  - @jsprismarine/nbt@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.1
  - @jsprismarine/minecraft@0.15.1
  - @jsprismarine/nbt@0.15.1

## 0.15.0

### Minor Changes

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`277da2e`](https://github.com/JSPrismarine/JSPrismarine/commit/277da2ed6c76cb85b500863cd5243ebf935e5ba0) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `SocialGamePublishSettings` enum in `structure/LevelSettings` to `GamePublishSetting`, the docs' name. Members and values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayStatus` members now carry the docs' names: `LoginFailedClient` is `LoginFailed_ClientOld`, `LoginFailedServer` is `LoginFailed_ServerOld`, `LoginFailedInvalidTenant` is `LoginFailed_InvalidTenant`, `LoginFailedVanillaEdu` and `LoginFailedEduVanilla` are `LoginFailed_EditionMismatchEduToVanilla` and `LoginFailed_EditionMismatchVanillaToEdu`, `LoginFailedServerFull` is `LoginFailed_ServerFullSubClient`, and `LoginFailedEditorVanilla` and `LoginFailedVanillaEditor` are `LoginFailed_EditorMismatchEditorToVanilla` and `LoginFailed_EditorMismatchVanillaToEditor`. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6) Thanks [@filiphsps](https://github.com/filiphsps)! - `PlayerActionType` members now carry the docs' names in PascalCase: `START_BREAK` is `StartDestroyBlock`, `JUMP` is `StartJump`, `BUILD_DENIED` is `DenyDestroyBlock`, `CREATIVE_PLAYER_DESTROY_BLOCK` is `CreativeDestroyBlock`, `DIMENSION_CHANGE_ACK` is `ChangeDimensionAck`, `START_SPRINT` is `StartSprinting`, and so on for every member. Values are unchanged.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `MovementType` enum to `PositionMode`, the name the Bedrock docs give the Position Mode byte of `MovePlayerPacket`. Its members `Reset` and `Pitch` are now `Respawn` and `OnlyHeadRot`, matching the docs. Values are unchanged.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`5fd1c5e`](https://github.com/JSPrismarine/JSPrismarine/commit/5fd1c5ed275a800446ee803e6145b26a626928ef) Thanks [@filiphsps](https://github.com/filiphsps)! - The shared wire structures in `@jsprismarine/protocol` now encode what protocol 2193 specifies, checked against hand-built byte vectors.
  
  `DataItem` wrote one type byte where the docs have a one-of selector (varuint32) followed by the variant's own type byte, wrote a `Byte` value unsigned and an `Int64` value as a fixed eight bytes instead of a varint64. `ActorLink` gains the sixth field, `Vehicle Angular Velocity`. `PropertySyncData` never wrote its `Float Entries List` and could not deserialize. `ItemInstanceUserData` wrote a version byte and a compound even when it had none, used varint string lengths where the lists carry int16 lengths, and had no way to carry a shield's blocking tick; the marker is now derived from whether a compound is present, and `deserialize` takes a `shield` flag because nothing on the wire says a tick follows. `NetworkItemStackDescriptor` dropped a supplied `userDataBuffer`. `UUID` threw a `RangeError` for any half at or above 2^63, which is half of all random UUIDs. `ItemData` wrote `Item Id` as a varuint, which cannot carry a block item's negative id, and omitted `Item Version` and `Item Component Data`; the new `ItemVersion` enum names the version values.
  
  Constructor signatures changed: `ActorLink` takes `vehicleAngularVelocity`, `ItemData` takes `version` and an optional `componentData`, and `ItemInstanceUserData` takes the compound (or null) first with the lists and blocking tick in its config.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a) Thanks [@filiphsps](https://github.com/filiphsps)! - Rename the `TextType` enum to `TextPacketType`, the docs' name for the Message Type of `TextPacket`. Members now use the docs' names: `Translation` is `Translate`, `System` is `SystemMessage`, and `JsonWhisper`, `Json`, `JsonAnnouncement` are `TextObjectWhisper`, `TextObject`, `TextObjectAnnouncement`. Values are unchanged.

### Patch Changes

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the batch layer to `@jsprismarine/protocol`, and a socketless RakNet pair to `@jsprismarine/raknet`.
  
  **`BatchCodec` and `CompressionCodec`.** The outermost Minecraft layer - `0xFE`, an optional algorithm byte, then length-prefixed packets - as something both sides of a connection can use, and which knows nothing about what a packet *is*. A batch is a list of opaque buffers, which is what lets it serve a client, a server and a proxy alike.
  
  The distinction it draws that the server's `BatchPacket` does not: the algorithm byte is present if and only if compression has been *negotiated*, which is not the same as this batch being compressed. `RequestNetworkSettings` and `NetworkSettings` carry no prefix; from the next packet onward every batch carries one, and a peer may set it to `0xff` whenever compressing would not pay. Those are two codecs - `BatchCodec.uncompressed()` and `BatchCodec.compressed()` - rather than one boolean.
  
  Three things fall out of writing it as a codec rather than a packet:
  
  - **A compression threshold**, so a small payload goes out uncompressed and says so, instead of deflate reliably making it larger. Mojang's threshold of 0 means "never compress"; read as a plain `byteLength >= threshold` it would have meant the exact opposite.
  - **Bounded inflation.** A batch arrives inside one RakNet message, so the compressed bytes are bounded at roughly 2.8 MiB by reassembly - what they *expand* to was bounded by nothing, and both a client and a server read compressed bytes from a peer they have not authenticated. zlib now enforces a ceiling itself.
  - **Strict splitting.** Every declared length is checked against what actually remains, and the error says at which offset the batch went wrong. An empty batch yields no packets: the `do/while` this replaces always ran once and read a varint out of nothing.
  
  `BatchCodecInterop.test.ts` in `@jsprismarine/prismarine` pins the two implementations together, byte for byte in both directions. They will not be swapped for one another in a single commit - the client is built on the codec while the server still runs `BatchPacket` - so for as long as both exist, a disagreement between them is a client that cannot talk to this server.
  
  **`LoopbackSocket`.** A connected RakNet pair with no sockets under it, for running a server in the same process as its client. The server keeps talking to a `RakNetSession` and cannot tell it is not on a wire.
  
  Framing, ordering, acknowledgment, reassembly and the connected handshake are the ordinary `Session`, unmodified - the alternative, handing frames across directly, would have meant reimplementing `Session.handlePacket`, and single player would then run *similar* code to multiplayer rather than the same code. What is skipped is the offline exchange, which exists only to discover a path MTU and a guid across a network that is not there.
  
  Two details it has to get right: delivery goes through a microtask, so a packet answered inline does not nest a second delivery inside the first; and the MTU is 8 KiB rather than "as large as possible", because `Frame` writes its content length *in bits* into an unsigned 16 bit field and anything past 8191 bytes silently wraps it. That is still five and a half times what a real connection negotiates, so a chunk batch that fragments seventeen ways on the wire fragments three ways here.
  
  `Loopback.test.ts` runs the same five scenarios twice, once over real sockets and once in memory, and asserts the two agree.

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

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - A load-testing harness: N synthetic players against a server, and the numbers they produce.
  
  `Fleet` connects a fleet at a configured rate, ticks each bot's behaviors at the server's own twenty per second, and reports what happened - login latency percentiles, RakNet round trip, bytes and packets per direction, how many of the requested bots actually got in, and what each refusal was. A bot that fails to connect is recorded and left out rather than aborting the run, because "how many of five hundred got in" is usually the question being asked.
  
  Everything random comes from one seed, derived per bot rather than shared. `Math.random` cannot be seeded, and a run that cannot be repeated is not a measurement: two runs against the same server have to differ because the *server* behaved differently. A single generator handed to five hundred bots would have them take turns drawing from one sequence, so what each did would depend on how the others were scheduled - which is the non-determinism the seed exists to remove.
  
  Four behaviors, deliberately separable, because a load test is a question and the question is usually about one kind of traffic: `walk` (chunk streaming and entity tracking), `look` (the broadcast path, without touching streaming), `chat` (fan-out - two hundred bots speaking once each is forty thousand deliveries), and `break` (the three-step action sequence a real client sends).
  
  It lives in `packages/client/src/bot/` rather than in a package of its own: it is under a thousand lines, it depends only on the client, and nothing will ever depend on it.
  
  **A command line, `jsp-client`**, in the same package and for the same reason - the command line is a way of driving the client, not a separate product.
  
  ```
  jsp-client bot   --host <address> --count <n> [--behavior walk,chat,break]
                   [--duration 10m] [--ramp 5/s] [--seed 1234] [--view-distance 4]
                   [--report report.json]
  jsp-client connect --host <address> [--name Steve]
  jsp-client ping    --host <address>
  ```
  
  Built on `node:util.parseArgs` rather than a dependency: the repository has no argument library anywhere, Node 21 is already the engine requirement, and a binary that has to stay `bun build --compile`-able has every reason not to grow a dependency tree for five flags. A bare `--duration 60` means sixty *seconds*, because the alternative reading wastes an afternoon. It exits 2 for a command line it cannot read and 1 when any bot failed to get in, so it works as a CI gate and not only as something to read.
  
  **Five more packets migrated to `NetworkPacket<T>`** - `MovePlayer`, `PlayerAction`, `RequestChunkRadius`, `ChunkRadiusUpdated` and `LevelChunk` - each pinned against the server's own class byte for byte. Two carry traps worth naming: `MovePlayer`'s length depends on one of its own bytes, since the teleport fields exist only for a teleport, and `PlayerAction` writes its block positions with an *unsigned* y, so writing all three signed encodes every height above 63 one byte differently and the reader takes the block face out of the middle of a coordinate. `LevelChunk` reads its envelope and hands the terrain over unparsed, which is what lets a bot skip the expensive half of the packet that makes up most of a server's output.
  
  Two more bugs the real binary found that the tests could not:
  
  - **Nothing kept the process alive.** Every handle the client owns is `unref`ed so a library never holds its host process open, which in a process whose only job *is* that client leaves nothing holding the event loop. Node exited between the first await and the answer: `ping` printed nothing, the fleet connected nobody, and both returned zero. Invisible under a test runner, which keeps the loop alive by itself.
  - **The report's round-trip time was always `-`.** A report is produced after the run ends, and the RTT lived only on a session that had already been torn down, so the number no report ever saw was the one the harness existed to measure. The transport keeps the last live measurement now.
  
  **`ClientSocket.kill` closed its socket one tick too early.** `disconnect` queues a DISCONNECTION_NOTIFICATION and `dgram.send` is asynchronous however immediate the priority was, so closing the handle in the same tick dropped the datagram and the goodbye was never sent. The server then held the session until it timed out - ten seconds counting against the player limit - and a fleet that reconnected found the server full of clients that had already left. Found by the harness itself, on the fifth fleet of a test run.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - The client can log in. `@jsprismarine/client` connects to a Bedrock server, completes the handshake and stands in the world - proved by a test that boots a real `Server` in-process and joins it with nothing mocked in between.
  
  **`@jsprismarine/auth`, new.** The login identity: the JWT chain, the client data blob, and the P-384 key both are signed with. A package of its own because the proxy shares it - it needs to *verify* an incoming chain when acting as a server in online mode, which a client never does. A provider is chosen at the edge of the application, so which one is in play is a deployment decision rather than a build-time one. `OfflineAuthProvider` signs the single self-signed chain link a real client sends when it is not signed in, and generates its key per instance, because the key *is* the identity: five hundred bots under one name still need five hundred of them.
  
  The default skin is generated from flat color blocks laid over the regions the classic humanoid geometry samples. Mojang's textures cannot be redistributed and a client that refused to log in without one would be useless. It is also not optional in the way it looks: the server builds a `Skin` out of the client data and dereferences eighteen fields without checking any of them, so a client that omits one crashes the login handler rather than being refused.
  
  **Ten packets migrated to `NetworkPacket<T>`** - the ones a join cannot do without. `Login` is among them, and is encodable for the first time: `LoginPacket.encodePayload` had been a commented-out block with a hardcoded chain in it since it was written. `StartGame` is deliberately partial, reading the fields a client cannot function without and stopping; the rest is positional and would have to be modeled in full before any of it could be read. Stopping early is safe because a batch length-delimits each packet.
  
  **`@jsprismarine/client`, rebuilt.** It was a 230-line proof of concept that could not finish a handshake - it hardcoded RakNet protocol 10 against this repository's own 11, drove a *server* session by passing itself as `this as any`, and sent a Login that encoded nothing. It is now a transport seam, a packet registry with no `Server` in the signature, a batching session and a login state machine, and it depends on `@jsprismarine/protocol` rather than on the server.
  
  Three bugs found by pointing it at a real server:
  
  - **Inbound batches were dispatched out of order.** Decoding is asynchronous because inflating runs on libuv's thread pool, so a batch takes as long as its *size* says, and a large one was overtaken by every small one that arrived while it was still inflating. A 37 KiB `StartGame` surfacing after the `PlayStatus` that was meant to follow it is not a slow `StartGame`, it is a missing one - the login failed with "the server spawned us without ever sending StartGame" while the packet was still inflating. Inbound is now a chain, the receiving mirror of the one `MinecraftSession` already kept on the way out.
  - **`ResourcePackResponsePacket.encodePayload` could not be read by its own `decodePayload`**: a spare `writeUnsignedShortLE(0)` sat in front of the count. Latent while only the server handled this packet, which decodes and never writes one.
  - **`World.getPlayerData` raised "Player has no XUID"** for every unauthenticated player - a case `LoginHandler` explicitly permits, `savePlayerData` has always written a file for, and the very next line already had a fallback for. It logged as an error on every offline join. Reader and writer now share one key.

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

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b176610`](https://github.com/JSPrismarine/JSPrismarine/commit/b176610cbad718b946e0144aec3fbe118a329eeb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `AddVolumeEntityPacket` (id 166), which carries a volume entity's network id, its components as network NBT, its JSON identifier and instance name, its min and max bounds, its dimension, and the engine version it was written for.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`44eacb3`](https://github.com/JSPrismarine/JSPrismarine/commit/44eacb30f3c214dbe3ac6179d0ad18df49d7ce36) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `AgentActionEventPacket` (id 181) with its `AgentActionType` enum, numbered from 1 as the client writes it.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`513ded0`](https://github.com/JSPrismarine/JSPrismarine/commit/513ded056f2857f2206c9c12fe8b86923fa9ea56) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `AgentAnimationPacket` (id 304) with its `AgentAnimation` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d158cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/d158cd1a9e9daabf3fc0f7c4d229ec1783fc1a1a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `AwardAchievementPacket` (id 309) with an `AchievementId` enum carrying the wire values of `MinecraftEventing::AchievementIds`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`69c8c8b`](https://github.com/JSPrismarine/JSPrismarine/commit/69c8c8be34bea5b6b86e34e76702f82e912d09b5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraAimAssistActorPriorityPacket` (id 339): a list of `AimAssistActorPriorityData` entries, each four little-endian int32s (`Preset Index`, `Category Index`, `Actor Index`, `Priority Value`), as protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`45e2180`](https://github.com/JSPrismarine/JSPrismarine/commit/45e21809b6517e710b6d675375b35a1015d5d6dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraAimAssistPacket` (id 316): `Preset Id`, `View Angle`, `Distance`, `Target Mode`, `Action`, and `Show Debug Render`, in the order protocol 2193 defines, with the `CameraAimAssistTargetMode` and `CameraAimAssistAction` enums.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b60eb24`](https://github.com/JSPrismarine/JSPrismarine/commit/b60eb241bf2cb4efa47f802f67244644d079b290) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraAimAssistPresetsPacket` (id 320) and the structures it lists: `CameraAimAssistCategoryDefinition`, `CameraAimAssistCategoryPriorities`, and `CameraAimAssistPresetDefinition`. Categories come first, then presets, then the `Operation` byte, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`252710e`](https://github.com/JSPrismarine/JSPrismarine/commit/252710ecac704f75053a3ab2998da56f6a74e5d3) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraInstructionPacket` (id 300) with a `CameraInstruction` structure covering the set, clear, fade, target, remove target, field of view, spline, attach to entity and detach from entity parts, plus the `EasingType` enum and the `EasingFunction` string names.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ee36e67`](https://github.com/JSPrismarine/JSPrismarine/commit/ee36e67f668a141c8fea4e25c68acc67aab318f3) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraPresetsPacket` (id 198) with a `CameraPreset` structure and the `CameraAudioListener`, `AimAssistTargetMode` and `ControlScheme` enums. `NetworkBinaryStream` gains `readOptional` and `writeOptional` for fields Cereal binds as `brstd::optional<T>`: a presence byte, then the value.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`dc254e3`](https://github.com/JSPrismarine/JSPrismarine/commit/dc254e3444729fcec772e269741496ad24d0a4c2) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CameraSplinePacket` (id 338) and the `CameraSplineDefinition` structure with the `CameraSplineType` enum: named camera paths from behavior packs, each with an optional spline type, control points and progress and rotation key frames whose easing is optional.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`36cce55`](https://github.com/JSPrismarine/JSPrismarine/commit/36cce5505a3b9498b12d6d6d676199d224559090) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ChangeMobPropertyPacket` (id 182), which sets one data-driven property on a mob.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c6ae6ee`](https://github.com/JSPrismarine/JSPrismarine/commit/c6ae6ee9c4fba9ef58124d3d96b3c62713c51658) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientCameraAimAssistPacket` (id 321): `Camera Preset Id`, `Action`, and `Allow aim assist`, in the order protocol 2193 defines, with the `ClientCameraAimAssistAction` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f7c3678`](https://github.com/JSPrismarine/JSPrismarine/commit/f7c3678c0ce868a4240a1c41e68ab2c9e06fa670) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundAttributeLayerSyncPacket` (id 345) with its `Data` tagged variant (`UpdateAttributeLayersData`, `UpdateAttributeLayerSettingsData`, `UpdateEnvironmentAttributesData`, `RemoveEnvironmentAttributesData`) as a discriminated union on `AttributeLayerSyncDataType`, plus the `AttributeLayerData`, `AttributeLayerSettings`, `EnvironmentAttributeData` and `NoiseAlignment` structures and the `BoolAttributeOperation`, `FloatAttributeOperation` and `ColorAttributeOperation` enums.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8f80b82`](https://github.com/JSPrismarine/JSPrismarine/commit/8f80b82f2d9f3e5ed58b3c72f9fbdd46be53f6dc) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundCloseFormPacket` (id 310), the empty packet a server sends to close every server form on the client.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`3d1383d`](https://github.com/JSPrismarine/JSPrismarine/commit/3d1383d3be610562d340519258d24c3792483f56) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundControlSchemeSetPacket` (id 327), which carries a `ControlScheme` (the enum `CameraPreset` uses) as one byte, numbered as protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cebaebc`](https://github.com/JSPrismarine/JSPrismarine/commit/cebaebcb4d05adb428e749ab3492ae8c2b490eb3) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundDataStorePacket` (id 330) and the `DataStoreUpdate` structure it shares with `ServerboundDataStorePacket`. Each `Updates` entry is a tagged variant over `Data Store Update`, `Data Store Change`, and `Data Store Removal`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8b69964`](https://github.com/JSPrismarine/JSPrismarine/commit/8b69964a6aa92258025e8a63df11d15e7c574b57) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundTextureShiftPacket` (id 336) with the `TextureShiftAction` enum: an action byte, the collection and step names, the step list, two varuint64 tick lengths and an enabled flag.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5803605`](https://github.com/JSPrismarine/JSPrismarine/commit/5803605491d65c38f335e7b32cb16503334b2af1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundUpdateSoundDataPacket` (id 348): `Server Sound Handle` as a little-endian uint64, then seven update slots, each a varuint32 alternative index (`Stop`, `SetVolume`, `SetPitch`, `Fade`, `SeekTo`, `Pause`, `Resume`) followed by that alternative's float32 fields.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`02be069`](https://github.com/JSPrismarine/JSPrismarine/commit/02be069794557206af5ede656b0ccba4894a9a75) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CodeBuilderSourcePacket` (id 178) with the `CodeBuilderOperation`, `CodeBuilderCategory`, and `CodeBuilderCodeStatus` enums, each written as one byte in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`242cd92`](https://github.com/JSPrismarine/JSPrismarine/commit/242cd92e03b3a7efb106bc9678c3d3677e6da889) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ContainerRegistryCleanupPacket` (id 317) and the `FullContainerName` structure it lists: a `ContainerUiId` byte, then an optional `Dynamic ID` written as a presence byte and a little-endian uint32.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1574fdb`](https://github.com/JSPrismarine/JSPrismarine/commit/1574fdb63320fc99e02cf2a4c80b8b12226a29e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CreatePhotoPacket` (id 171), the Education Edition request to turn a portfolio photo into a photo item: `Raw ID` as a little-endian uint64, then the `Photo Name` and `Photo Item Name` strings.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`567faa0`](https://github.com/JSPrismarine/JSPrismarine/commit/567faa09375d9c9632ac893a7cb62ddca2d71b12) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `CurrentStructureFeaturePacket` (id 314): the `Current Structure Feature` identifier string, empty when the player is outside every structure.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8535455`](https://github.com/JSPrismarine/JSPrismarine/commit/85354556a17db4908eccbf4d7aa6662324bd3b39) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ServerboundDataDrivenScreenClosedPacket` (id 343) and its `DataDrivenScreenClosedReason` enum: `FormId`, then the close reason as the lowercase member name string protocol 2193 puts on the wire.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8eded3f`](https://github.com/JSPrismarine/JSPrismarine/commit/8eded3f230c4b8b707cb15047ac596fcfe264a65) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundDataDrivenUICloseScreenPacket` (id 334): an optional `FormId` whose absence closes every data-driven screen, as protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fadb03d`](https://github.com/JSPrismarine/JSPrismarine/commit/fadb03d2b763c427686e926cc86eeb71ffbf8b9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundDataDrivenUIReloadPacket` (id 335), which carries no payload.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`25bfb44`](https://github.com/JSPrismarine/JSPrismarine/commit/25bfb44acf70c2d3f1d7ab79c5c821ee355b78cb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ClientboundDataDrivenUIShowScreenPacket` (id 333): `ScreenId`, `FormId`, and the optional `DataInstanceId`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`377749c`](https://github.com/JSPrismarine/JSPrismarine/commit/377749cf41e27510fd2d2dd28311e2745ad11936) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `DeathInfoPacket` (id 189), which carries the death message key and its parameters a server sends when a player dies.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ebf5ed5`](https://github.com/JSPrismarine/JSPrismarine/commit/ebf5ed5475c44b1ddf41065acae664f8d1d5c8a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `DimensionDataPacket` (id 180) and the `DimensionDefinition` structure it lists: identifier, `Minimum Y`, `Height Range`, `Generator Type`, `Dimension Type`, `Pack Id`, and `Default Biome`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`601c5f8`](https://github.com/JSPrismarine/JSPrismarine/commit/601c5f8f3814455400c06b3bfd6392960ce1b203) Thanks [@filiphsps](https://github.com/filiphsps)! - `DisconnectPacket` now reads and writes `Skip Message` as the one bool byte the client uses. It was a varuint compared against 1, which agreed with the client for 0 and 1 but took any other byte as "strings follow" and read past the packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`576437e`](https://github.com/JSPrismarine/JSPrismarine/commit/576437ecff1a00d451b79a7d98f3553ccf222600) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `EditorNetworkPacket` (id 190), which carries an opaque Bedrock Editor payload.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`9d1b862`](https://github.com/JSPrismarine/JSPrismarine/commit/9d1b8623bcfe95396ae65b64b840fa7b25ac4ffc) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the `EduSharedUriResource` structure, the `Button Name` and `Link Uri` string pair that `EduUriResourcePacket` and `LevelSettings` carry, with the `EduSharedUriResourceData` type for its fields. `LevelSettings` now takes that type for `eduSharedUriResource` instead of its own private copy.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2420ef3`](https://github.com/JSPrismarine/JSPrismarine/commit/2420ef3d6aa588ec09d635e4de06d2e65dd313fc) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `EduUriResourcePacket` (id 170), which carries one `EduSharedUriResource` so a server can update the shared Education Edition link for players already in the world.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a844cb3`](https://github.com/JSPrismarine/JSPrismarine/commit/a844cb3e402095e24deece5e9c1e16ca3edf98a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Export every packet the 1.26.51 (protocol 2193) documentation lists from the package root. The package now carries a class, data interface and tests for all 231 packets.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f74b8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/f74b8e11788d3ef9eed1be2de8056f09bc28420e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `FeatureRegistryPacket` (id 191): a list of `Feature Name` and `Binary Json Output` string pairs, as protocol 2193 lays it out.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b78d24b`](https://github.com/JSPrismarine/JSPrismarine/commit/b78d24be2d037d03bad94c3bd5941f83c3eb2850) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `GameTestRequestPacket` (id 194) with the `Rotation` enum, written in the order protocol 2193 defines: two ZigZag varint32 counts, the rotation byte, the stop flag, a `BlockPos`, the tests-per-row count, then the test name.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`78f79e3`](https://github.com/JSPrismarine/JSPrismarine/commit/78f79e367d1affbf6da3593cd4e5c4b58892a61c) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `GameTestResultsPacket` (id 195): the `Succeeded` byte, then the `Error` and `TestName` strings, as protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8ef0331`](https://github.com/JSPrismarine/JSPrismarine/commit/8ef0331839c6d0d4f25fbb5268e6249474474da3) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `GraphicsOverrideParameterPacket` (id 331) with the `GraphicsOverrideParameterType` enum: `Parameter Keyframe Values`, optional `Float Value` and `Vec3 Value`, `Biome Identifier`, optional `Player Identifier`, `Identifier for Parameter`, and `Reset Parameter`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`de5a310`](https://github.com/JSPrismarine/JSPrismarine/commit/de5a310503c3050a4c39f489a7ee8dd02b881102) Thanks [@filiphsps](https://github.com/filiphsps)! - `ItemRegistryPacket` serializes as well as deserializes, through the `ItemData` structure, and each `ItemRegistryEntry` carries its `Item Component Data` compound. It used to throw on serialize and drop the compound on read.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`988e073`](https://github.com/JSPrismarine/JSPrismarine/commit/988e073a443a69d815549645889f638c973b37f1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `LessonProgressPacket` (id 183) and its `LessonAction` enum, which report an Education Edition lesson starting, completing or restarting.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`35948e3`](https://github.com/JSPrismarine/JSPrismarine/commit/35948e3f020af2db2cf4de827e8b67defb0144b6) Thanks [@filiphsps](https://github.com/filiphsps)! - `LevelChunkPacket` carries `Cache Metadata`. `LevelChunk` gains an optional `blobHashes` list that is written after `Cache Enabled` and filled in on read, where the packet used to write an empty list whatever the cache flag said and drop the hashes it read. The class documents the protocol 2193 wire layout, and `ChunkRadiusUpdatedPacket` and `ChunkPos` gain byte-level tests.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fbc2fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/fbc2fdd0a2c1acd0a85e2c6d9da713f07fcc4ad9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `LocatorBarPacket` (id 341) with the `LocatorBarWaypointPayload` and `ServerWaypointPayload` structures and the `ServerWaypointGroupAction` enum: a `GroupHandle` uuid, the `UpdateFlag` and seven optional waypoint fields, then the `ActionFlag`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cda08a0`](https://github.com/JSPrismarine/JSPrismarine/commit/cda08a0343ab6b072945b289c3e891ef698b9e9b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `MovementEffectPacket` (id 318) with the `MovementEffectType` enum: `Target Runtime ID` and `Tick` as varuint64, `Effect ID` and `Effect Duration` as ZigZag varint32, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8c3d052`](https://github.com/JSPrismarine/JSPrismarine/commit/8c3d052c043b6d54c8d443a94fc13410a4d7ebe5) Thanks [@filiphsps](https://github.com/filiphsps)! - `NetworkSettings.compressionAlgorithm` is typed as `PacketCompressionAlgorithm` instead of `number`, and `NetworkSettingsPacket` and `RequestNetworkSettingsPacket` document their protocol 2193 wire layout and ship byte-level tests.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`93b0c1a`](https://github.com/JSPrismarine/JSPrismarine/commit/93b0c1aae5ef1198187fd05ba4388bf4646cb40e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `NpcDialoguePacket` (id 169) with its `NpcDialogueActionType` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4905238`](https://github.com/JSPrismarine/JSPrismarine/commit/49052388894748c9d1acdf19f3927111678eb119) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `OpenSignPacket` (id 303): `Pos` as a `BlockPos`, then `Is Front Side`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`6c69430`](https://github.com/JSPrismarine/JSPrismarine/commit/6c6943009b0a483c9274c122e1f84ea5b8aba912) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PartyChangedPacket` (id 342) and the `PlayerPartyInfo` structure it carries: `party_id` then `is_party_leader`, with no presence byte at protocol 2193.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a8561c8`](https://github.com/JSPrismarine/JSPrismarine/commit/a8561c8014907284fcab23c24c5b1f1b7305d97e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PartyDestinationCookieResponsePacket` (id 350): `cookie` as a string, then `accepted` as one byte.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fed1f50`](https://github.com/JSPrismarine/JSPrismarine/commit/fed1f50db5800ef6b8dea15e5a66263039c5c25d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PlayerStartItemCooldownPacket` (id 176): `Item Category` as a string, then `Duration Ticks` as a ZigZag varint32. The server sends it when a player uses an item with a cooldown, and the client greys out that category's slots for the duration.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`688119a`](https://github.com/JSPrismarine/JSPrismarine/commit/688119aa7fde987dc8430003fc4975dc5a431b0b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PlayerUpdateEntityOverridesPacket` (id 325) with its `Update` tagged variant (`ClearOverrides`, `RemoveOverride`, `SetIntOverride`, `SetFloatOverride`) in the layout protocol 2193 defines: a varuint32 selector, the alternative's type string, then the int32 or float value.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`e05ae9d`](https://github.com/JSPrismarine/JSPrismarine/commit/e05ae9d01e1ef72f3b77b22a45341205f9d118e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PlayerVideoCapturePacket` (id 324) with the `PlayerVideoCaptureAction` enum: a start or stop byte, then for a start the `FrameRate` as a little-endian uint32 and the `FilePrefix` string.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`67883b8`](https://github.com/JSPrismarine/JSPrismarine/commit/67883b85f3524614cc257d0c80f7bc86fb1677c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `PrimitiveShapesPacket` (id 328) and the `PrimitiveShapeData` structure it lists, with the `PrimitiveShapeType` and `PrimitiveShapeExtraDataType` enums and the ten `Extra Shape Data` alternatives, in the layout protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ab1c7b5`](https://github.com/JSPrismarine/JSPrismarine/commit/ab1c7b556dda4b6c1f6bb33b10f5339e5aab415a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `RecordStartedPacket` (id 352): `Block Position` as a `BlockPos`, then `Server Sound Handle` as a little-endian uint64.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`743ff36`](https://github.com/JSPrismarine/JSPrismarine/commit/743ff360ae20b8f61f299ecfb5de66004aae694d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `RefreshEntitlementsPacket` (id 305), the empty packet a client sends to have its entitlements re-read.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`bb82cdb`](https://github.com/JSPrismarine/JSPrismarine/commit/bb82cdba221175a5e83592536b16d474902f9fb1) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `RemoveVolumeEntityPacket` (id 167), which names the volume entity to drop by its network id and dimension.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`6b77308`](https://github.com/JSPrismarine/JSPrismarine/commit/6b773085d0cd87fd285949908efa68facce446fd) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ResourcePacksReadyForValidationPacket` (id 340), the empty packet a client sends once it has loaded every resource pack.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`ebbe3f9`](https://github.com/JSPrismarine/JSPrismarine/commit/ebbe3f9476dde4f3282ff6ec5c6f9c24282e8571) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ScriptMessagePacket` (id 177): `Message Id` then `Message Value`, both strings. It carries a Script API script event in either direction.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a4fa498`](https://github.com/JSPrismarine/JSPrismarine/commit/a4fa498f84cf78da063928af6ab658a9c5993c22) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SendPartyDestinationCookiePacket` (id 349): `cookie`, `intent` as the `PartyDestinationCookieIntent` member name string, then `destination_name`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`fbe7f4b`](https://github.com/JSPrismarine/JSPrismarine/commit/fbe7f4b42c880929ad15f35c420f825e4d722e15) Thanks [@filiphsps](https://github.com/filiphsps)! - `SerializedAbilitiesData` reads and writes "Player Permissions" as the signed byte the 1.26.51 docs specify, and `SerializedAbilityLayer` documents how the two bitsets and the three speed floats relate.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d85faf3`](https://github.com/JSPrismarine/JSPrismarine/commit/d85faf37fd9be0295931458c58c86f40750c7abb) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ServerPresenceInfoPacket` (id 347) and the `PresenceConfig` structure it carries: an optional `richPresenceId`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`d9b1496`](https://github.com/JSPrismarine/JSPrismarine/commit/d9b1496ad2144ec3d9ed0cf3f48e7f14005f5901) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ServerStatsPacket` (id 192): `ServerTime` then `NetworkTime` as little-endian floats, as protocol 2193 lays it out.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`655dbd0`](https://github.com/JSPrismarine/JSPrismarine/commit/655dbd0f5c721a9325ad3144c1e245ce068ec423) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ServerStoreInfoPacket` (id 346) and the `ClientStoreEntryPointConfig` structure it carries: `storeId` then `storeName`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`78a5a6c`](https://github.com/JSPrismarine/JSPrismarine/commit/78a5a6c10d10a4f3bf27098d6093a9988736df40) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ServerboundDataStorePacket` (id 332), whose payload is a single `DataStoreUpdate`: `Data Store Name`, `Property`, `Path`, the `Data` one-of, `Property Update Count`, and `Path Update Count`, in the order protocol 2193 defines.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`f60310c`](https://github.com/JSPrismarine/JSPrismarine/commit/f60310c669ad1b212ff4ec1b3905f34c29d1083d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SetHudPacket` (id 308) with the `HudElement` and `HudVisibility` enums, which hides or restores HUD elements on the client.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`8b37263`](https://github.com/JSPrismarine/JSPrismarine/commit/8b37263e758c8f64a2328dc4f26103d0998990e9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SetPlayerFurnaceOptionsPacket` (id 351): `FurnaceType` as one byte, then `Furnace Options` as `Left Furnace Tab` (ZigZag varint32), `Filtering` (one byte) and `Layout` (ZigZag varint32).

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a2d820c`](https://github.com/JSPrismarine/JSPrismarine/commit/a2d820c16b89fbfd81e272cd7a43c9a0d71e63e9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SimulationTypePacket` (id 168) with its `SimulationType` enum.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`64e1df3`](https://github.com/JSPrismarine/JSPrismarine/commit/64e1df3061e97ef1e45932a830960825e276d1f9) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SubChunkPacket` (id 174), the server's answer to `SubChunkRequestPacket`, at the protocol 2193 layout: a cache flag, the dimension, a center `SubChunkPos`, then one entry per sub chunk with its `SubChunkPosOffset`, result, optional serialized sub chunk, `SubChunkHeightmapData`, and optional blob id. The three structures are new and exported from `structure/`. The optionals carry presence bytes and each heightmap row a length prefix, as Mojang's Cereal migration at protocol 2168 defines; the serialized sub chunk stays an unparsed buffer, like `LevelChunkPacket`'s payload.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0fcc990`](https://github.com/JSPrismarine/JSPrismarine/commit/0fcc9902098c8f825f95a8737b158e1a23d88250) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `SyncWorldClocksPacket` (id 344) with its `Data` tagged variant: `SyncStateData`, `InitializeRegistryData`, `AddTimeMarkerData` and `RemoveTimeMarkerData`, exposed as a discriminated union on `SyncWorldClocksDataType`.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5940943`](https://github.com/JSPrismarine/JSPrismarine/commit/59409430950ae131ce1cdc5e15220bac176b4b62) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `ToastRequestPacket` (id 186), which asks the client to show a toast with a title and content.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`52e4907`](https://github.com/JSPrismarine/JSPrismarine/commit/52e490722eb7c0d76c6342d3ac7ddc6fe88d91a2) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `TrimDataPacket` (id 302), which carries the armor trim pattern and material lists a server sends during the join.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`650d0bf`](https://github.com/JSPrismarine/JSPrismarine/commit/650d0bf72f637e0972c287095eb74145ec8ed638) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `UnlockedRecipesPacket` (id 199) with the `UnlockedRecipesType` enum, so a server can send the recipes a player has unlocked.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`64cc66e`](https://github.com/JSPrismarine/JSPrismarine/commit/64cc66e90d5c29aa03016d66e6e393daec1f5063) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `UpdateClientInputLocksPacket` (id 196) with the `ClientInputLock` bit flags. The payload is one varuint32 bitmask, as the protocol 2193 schema and gophertunnel master define it.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`1f304c1`](https://github.com/JSPrismarine/JSPrismarine/commit/1f304c13099487c5381a676929c8c7671bf4d560) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `UpdateSubChunkBlocksPacket` (id 172) and the `UpdateSubChunkNetworkBlockInfo` structure it carries, so a sub chunk's block changes for one tick can be read and written as one packet.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`09fa244`](https://github.com/JSPrismarine/JSPrismarine/commit/09fa2442ab5677d0ea64547b7260d386deb149f5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `VoxelShapesPacket` (id 337) and the `SerializableVoxelShape` structure: the block collision shape registry a server sends before `StartGamePacket`, as a shape list, a name-to-handle map and a custom shape count.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.
- Updated dependencies [[`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`60e9e6f`](https://github.com/JSPrismarine/JSPrismarine/commit/60e9e6f981cce46edf2bb2ee0b7b1eea3b7360ee), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a)]:
  - @jsprismarine/minecraft@0.15.0
  - @jsprismarine/binaryutils@0.15.0
  - @jsprismarine/nbt@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/minecraft@0.14.2
  - @jsprismarine/nbt@0.14.2

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
    - @jsprismarine/minecraft@0.14.1
    - @jsprismarine/nbt@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a)]:
    - @jsprismarine/minecraft@0.14.0
    - @jsprismarine/nbt@0.14.0

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/minecraft@0.13.5
    - @jsprismarine/nbt@0.13.5

## 0.13.2

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.13.2
    - @jsprismarine/nbt@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.13.1
    - @jsprismarine/nbt@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.13.0
    - @jsprismarine/nbt@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72)]:
    - @jsprismarine/minecraft@0.12.1
    - @jsprismarine/nbt@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.12.0
    - @jsprismarine/nbt@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.11.1
    - @jsprismarine/nbt@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.11.0
    - @jsprismarine/nbt@0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a)]:
    - @jsprismarine/minecraft@0.10.0
    - @jsprismarine/nbt@0.10.0

## 0.9.0

### Minor Changes

- [`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30) Thanks [@filiphsps](https://github.com/filiphsps)! - - Use correct file extension for commonjs modules (`cjs`).

### Patch Changes

- Updated dependencies [[`9963470`](https://github.com/JSPrismarine/JSPrismarine/commit/996347038b55d4d08b08b1efdc451e89d7265b30)]:
    - @jsprismarine/minecraft@0.9.0
    - @jsprismarine/nbt@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/minecraft@0.8.0
    - @jsprismarine/nbt@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.7.0
    - @jsprismarine/nbt@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/minecraft@0.6.0
    - @jsprismarine/nbt@0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1)]:
    - @jsprismarine/minecraft@0.5.0
    - @jsprismarine/nbt@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/minecraft@0.4.5
    - @jsprismarine/nbt@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a)]:
    - @jsprismarine/minecraft@0.4.4
    - @jsprismarine/nbt@0.4.4
