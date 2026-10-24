# @jsprismarine/client

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/auth@0.15.2
  - @jsprismarine/logger@0.15.2
  - @jsprismarine/minecraft@0.15.2
  - @jsprismarine/protocol@0.15.2
  - @jsprismarine/raknet@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies [[`24e9693`](https://github.com/JSPrismarine/JSPrismarine/commit/24e9693285faea53a54264af5233f1c54724aa46)]:
  - @jsprismarine/auth@0.15.1
  - @jsprismarine/logger@0.15.1
  - @jsprismarine/minecraft@0.15.1
  - @jsprismarine/protocol@0.15.1
  - @jsprismarine/raknet@0.15.1

## 0.15.0

### Minor Changes

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - `Event.isCanceled`, `BlockEntityRegistry.isModeled`, and `EntitySerializer.isModeled` replace their British spellings. Update imports and calls to the American names. `vanillaRecipes` also uses American spellings in its two generated recipe IDs; callers that store those IDs must update them.

- [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c) Thanks [@filiphsps](https://github.com/filiphsps)! - The client package now exports `Behavior`, `BehaviorContext`, `BreakBehavior`, `ChatBehavior`, `LookBehavior`, `WalkBehavior`, `BEHAVIORS`, `BEHAVIOR_NAMES`, and `createBehaviors`. `BotOptions` and `FleetOptions` now use `behaviors`, and the CLI accepts `--behavior`. Update imports, options, and CLI invocations to these names.
  
  The Minecraft package renames `BlockSchemaCatalog` and its source module. Update direct subpath imports to the new module and type name.

### Patch Changes

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

- [#2589](https://github.com/JSPrismarine/JSPrismarine/pull/2589) [`733c0e1`](https://github.com/JSPrismarine/JSPrismarine/commit/733c0e1ed7bca0a47a4a1be9b13821413916a420) Thanks [@filiphsps](https://github.com/filiphsps)! - Add shared Yargs-based command-line parsing and shell completion to the server and client. The server accepts `--port`, and the development launcher forwards command-line arguments to it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9) Thanks [@filiphsps](https://github.com/filiphsps)! - The client can log in. `@jsprismarine/client` connects to a Bedrock server, completes the handshake and stands in the world - proved by a test that boots a real `Server` in-process and joins it with nothing mocked in between.
  
  **`@jsprismarine/auth`, new.** The login identity: the JWT chain, the client data blob, and the P-384 key both are signed with. A package of its own because the proxy shares it - it needs to *verify* an incoming chain when acting as a server in online mode, which a client never does. A provider is chosen at the edge of the application, so which one is in play is a deployment decision rather than a build-time one. `OfflineAuthProvider` signs the single self-signed chain link a real client sends when it is not signed in, and generates its key per instance, because the key *is* the identity: five hundred bots under one name still need five hundred of them.
  
  The default skin is generated from flat color blocks laid over the regions the classic humanoid geometry samples. Mojang's textures cannot be redistributed and a client that refused to log in without one would be useless. It is also not optional in the way it looks: the server builds a `Skin` out of the client data and dereferences eighteen fields without checking any of them, so a client that omits one crashes the login handler rather than being refused.
  
  **Ten packets migrated to `NetworkPacket<T>`** - the ones a join cannot do without. `Login` is among them, and is encodable for the first time: `LoginPacket.encodePayload` had been a commented-out block with a hardcoded chain in it since it was written. `StartGame` is deliberately partial, reading the fields a client cannot function without and stopping; the rest is positional and would have to be modeled in full before any of it could be read. Stopping early is safe because a batch length-delimits each packet.
  
  **`@jsprismarine/client`, rebuilt.** It was a 230-line proof of concept that could not finish a handshake - it hardcoded RakNet protocol 10 against this repository's own 11, drove a *server* session by passing itself as `this as any`, and sent a Login that encoded nothing. It is now a transport seam, a packet registry with no `Server` in the signature, a batching session and a login state machine, and it depends on `@jsprismarine/protocol` rather than on the server.
  
  Three bugs found by pointing it at a real server:
  
  - **Inbound batches were dispatched out of order.** Decoding is asynchronous because inflating runs on libuv's thread pool, so a batch takes as long as its *size* says, and a large one was overtaken by every small one that arrived while it was still inflating. A 37 KiB `StartGame` surfacing after the `PlayStatus` that was meant to follow it is not a slow `StartGame`, it is a missing one - the login failed with "the server spawned us without ever sending StartGame" while the packet was still inflating. Inbound is now a chain, the receiving mirror of the one `MinecraftSession` already kept on the way out.
  - **`ResourcePackResponsePacket.encodePayload` could not be read by its own `decodePayload`**: a spare `writeUnsignedShortLE(0)` sat in front of the count. Latent while only the server handled this packet, which decodes and never writes one.
  - **`World.getPlayerData` raised "Player has no XUID"** for every unauthenticated player - a case `LoginHandler` explicitly permits, `savePlayerData` has always written a file for, and the very next line already had a fallback for. It logged as an error on every offline join. Reader and writer now share one key.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2597](https://github.com/JSPrismarine/JSPrismarine/pull/2597) [`0dcba03`](https://github.com/JSPrismarine/JSPrismarine/commit/0dcba03a699f559fba5e70b3fe17892dda613b59) Thanks [@filiphsps](https://github.com/filiphsps)! - Update yargs to 18.2.0

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
- Updated dependencies [[`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`74722e8`](https://github.com/JSPrismarine/JSPrismarine/commit/74722e8b07e5865ca42b04ff81503f2a0559bd0b), [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`5cd4d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/5cd4d0aaf1b101135135157e9f11c55c4c73a5f9), [`07dcd6b`](https://github.com/JSPrismarine/JSPrismarine/commit/07dcd6b97fe3f18b7e4359890f08b2497633c70c), [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184), [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7), [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b), [`b176610`](https://github.com/JSPrismarine/JSPrismarine/commit/b176610cbad718b946e0144aec3fbe118a329eeb), [`44eacb3`](https://github.com/JSPrismarine/JSPrismarine/commit/44eacb30f3c214dbe3ac6179d0ad18df49d7ce36), [`513ded0`](https://github.com/JSPrismarine/JSPrismarine/commit/513ded056f2857f2206c9c12fe8b86923fa9ea56), [`d158cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/d158cd1a9e9daabf3fc0f7c4d229ec1783fc1a1a), [`69c8c8b`](https://github.com/JSPrismarine/JSPrismarine/commit/69c8c8be34bea5b6b86e34e76702f82e912d09b5), [`45e2180`](https://github.com/JSPrismarine/JSPrismarine/commit/45e21809b6517e710b6d675375b35a1015d5d6dc), [`b60eb24`](https://github.com/JSPrismarine/JSPrismarine/commit/b60eb241bf2cb4efa47f802f67244644d079b290), [`252710e`](https://github.com/JSPrismarine/JSPrismarine/commit/252710ecac704f75053a3ab2998da56f6a74e5d3), [`ee36e67`](https://github.com/JSPrismarine/JSPrismarine/commit/ee36e67f668a141c8fea4e25c68acc67aab318f3), [`dc254e3`](https://github.com/JSPrismarine/JSPrismarine/commit/dc254e3444729fcec772e269741496ad24d0a4c2), [`36cce55`](https://github.com/JSPrismarine/JSPrismarine/commit/36cce5505a3b9498b12d6d6d676199d224559090), [`c6ae6ee`](https://github.com/JSPrismarine/JSPrismarine/commit/c6ae6ee9c4fba9ef58124d3d96b3c62713c51658), [`f7c3678`](https://github.com/JSPrismarine/JSPrismarine/commit/f7c3678c0ce868a4240a1c41e68ab2c9e06fa670), [`8f80b82`](https://github.com/JSPrismarine/JSPrismarine/commit/8f80b82f2d9f3e5ed58b3c72f9fbdd46be53f6dc), [`3d1383d`](https://github.com/JSPrismarine/JSPrismarine/commit/3d1383d3be610562d340519258d24c3792483f56), [`cebaebc`](https://github.com/JSPrismarine/JSPrismarine/commit/cebaebcb4d05adb428e749ab3492ae8c2b490eb3), [`8b69964`](https://github.com/JSPrismarine/JSPrismarine/commit/8b69964a6aa92258025e8a63df11d15e7c574b57), [`5803605`](https://github.com/JSPrismarine/JSPrismarine/commit/5803605491d65c38f335e7b32cb16503334b2af1), [`02be069`](https://github.com/JSPrismarine/JSPrismarine/commit/02be069794557206af5ede656b0ccba4894a9a75), [`242cd92`](https://github.com/JSPrismarine/JSPrismarine/commit/242cd92e03b3a7efb106bc9678c3d3677e6da889), [`1574fdb`](https://github.com/JSPrismarine/JSPrismarine/commit/1574fdb63320fc99e02cf2a4c80b8b12226a29e0), [`567faa0`](https://github.com/JSPrismarine/JSPrismarine/commit/567faa09375d9c9632ac893a7cb62ddca2d71b12), [`8535455`](https://github.com/JSPrismarine/JSPrismarine/commit/85354556a17db4908eccbf4d7aa6662324bd3b39), [`8eded3f`](https://github.com/JSPrismarine/JSPrismarine/commit/8eded3f230c4b8b707cb15047ac596fcfe264a65), [`fadb03d`](https://github.com/JSPrismarine/JSPrismarine/commit/fadb03d2b763c427686e926cc86eeb71ffbf8b9f), [`25bfb44`](https://github.com/JSPrismarine/JSPrismarine/commit/25bfb44acf70c2d3f1d7ab79c5c821ee355b78cb), [`377749c`](https://github.com/JSPrismarine/JSPrismarine/commit/377749cf41e27510fd2d2dd28311e2745ad11936), [`ebf5ed5`](https://github.com/JSPrismarine/JSPrismarine/commit/ebf5ed5475c44b1ddf41065acae664f8d1d5c8a9), [`601c5f8`](https://github.com/JSPrismarine/JSPrismarine/commit/601c5f8f3814455400c06b3bfd6392960ce1b203), [`576437e`](https://github.com/JSPrismarine/JSPrismarine/commit/576437ecff1a00d451b79a7d98f3553ccf222600), [`9d1b862`](https://github.com/JSPrismarine/JSPrismarine/commit/9d1b8623bcfe95396ae65b64b840fa7b25ac4ffc), [`2420ef3`](https://github.com/JSPrismarine/JSPrismarine/commit/2420ef3d6aa588ec09d635e4de06d2e65dd313fc), [`a844cb3`](https://github.com/JSPrismarine/JSPrismarine/commit/a844cb3e402095e24deece5e9c1e16ca3edf98a6), [`f74b8e1`](https://github.com/JSPrismarine/JSPrismarine/commit/f74b8e11788d3ef9eed1be2de8056f09bc28420e), [`277da2e`](https://github.com/JSPrismarine/JSPrismarine/commit/277da2ed6c76cb85b500863cd5243ebf935e5ba0), [`b78d24b`](https://github.com/JSPrismarine/JSPrismarine/commit/b78d24be2d037d03bad94c3bd5941f83c3eb2850), [`78f79e3`](https://github.com/JSPrismarine/JSPrismarine/commit/78f79e367d1affbf6da3593cd4e5c4b58892a61c), [`8ef0331`](https://github.com/JSPrismarine/JSPrismarine/commit/8ef0331839c6d0d4f25fbb5268e6249474474da3), [`de5a310`](https://github.com/JSPrismarine/JSPrismarine/commit/de5a310503c3050a4c39f489a7ee8dd02b881102), [`988e073`](https://github.com/JSPrismarine/JSPrismarine/commit/988e073a443a69d815549645889f638c973b37f1), [`35948e3`](https://github.com/JSPrismarine/JSPrismarine/commit/35948e3f020af2db2cf4de827e8b67defb0144b6), [`fbc2fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/fbc2fdd0a2c1acd0a85e2c6d9da713f07fcc4ad9), [`cda08a0`](https://github.com/JSPrismarine/JSPrismarine/commit/cda08a0343ab6b072945b289c3e891ef698b9e9b), [`8c3d052`](https://github.com/JSPrismarine/JSPrismarine/commit/8c3d052c043b6d54c8d443a94fc13410a4d7ebe5), [`93b0c1a`](https://github.com/JSPrismarine/JSPrismarine/commit/93b0c1aae5ef1198187fd05ba4388bf4646cb40e), [`4905238`](https://github.com/JSPrismarine/JSPrismarine/commit/49052388894748c9d1acdf19f3927111678eb119), [`6c69430`](https://github.com/JSPrismarine/JSPrismarine/commit/6c6943009b0a483c9274c122e1f84ea5b8aba912), [`a8561c8`](https://github.com/JSPrismarine/JSPrismarine/commit/a8561c8014907284fcab23c24c5b1f1b7305d97e), [`a848770`](https://github.com/JSPrismarine/JSPrismarine/commit/a8487700bb0534a0a3b7415671a69edbb8628e3a), [`1cbf13d`](https://github.com/JSPrismarine/JSPrismarine/commit/1cbf13d6fbf30be2e747057cbe2805d286e8f6a6), [`fed1f50`](https://github.com/JSPrismarine/JSPrismarine/commit/fed1f50db5800ef6b8dea15e5a66263039c5c25d), [`688119a`](https://github.com/JSPrismarine/JSPrismarine/commit/688119aa7fde987dc8430003fc4975dc5a431b0b), [`e05ae9d`](https://github.com/JSPrismarine/JSPrismarine/commit/e05ae9d01e1ef72f3b77b22a45341205f9d118e0), [`f4f55c1`](https://github.com/JSPrismarine/JSPrismarine/commit/f4f55c1664bdff45e0d35c90f400b4bc3b3f6691), [`67883b8`](https://github.com/JSPrismarine/JSPrismarine/commit/67883b85f3524614cc257d0c80f7bc86fb1677c6), [`ab1c7b5`](https://github.com/JSPrismarine/JSPrismarine/commit/ab1c7b556dda4b6c1f6bb33b10f5339e5aab415a), [`743ff36`](https://github.com/JSPrismarine/JSPrismarine/commit/743ff360ae20b8f61f299ecfb5de66004aae694d), [`bb82cdb`](https://github.com/JSPrismarine/JSPrismarine/commit/bb82cdba221175a5e83592536b16d474902f9fb1), [`6b77308`](https://github.com/JSPrismarine/JSPrismarine/commit/6b773085d0cd87fd285949908efa68facce446fd), [`ebbe3f9`](https://github.com/JSPrismarine/JSPrismarine/commit/ebbe3f9476dde4f3282ff6ec5c6f9c24282e8571), [`a4fa498`](https://github.com/JSPrismarine/JSPrismarine/commit/a4fa498f84cf78da063928af6ab658a9c5993c22), [`fbe7f4b`](https://github.com/JSPrismarine/JSPrismarine/commit/fbe7f4b42c880929ad15f35c420f825e4d722e15), [`d85faf3`](https://github.com/JSPrismarine/JSPrismarine/commit/d85faf37fd9be0295931458c58c86f40750c7abb), [`d9b1496`](https://github.com/JSPrismarine/JSPrismarine/commit/d9b1496ad2144ec3d9ed0cf3f48e7f14005f5901), [`655dbd0`](https://github.com/JSPrismarine/JSPrismarine/commit/655dbd0f5c721a9325ad3144c1e245ce068ec423), [`78a5a6c`](https://github.com/JSPrismarine/JSPrismarine/commit/78a5a6c10d10a4f3bf27098d6093a9988736df40), [`f60310c`](https://github.com/JSPrismarine/JSPrismarine/commit/f60310c669ad1b212ff4ec1b3905f34c29d1083d), [`8b37263`](https://github.com/JSPrismarine/JSPrismarine/commit/8b37263e758c8f64a2328dc4f26103d0998990e9), [`a2d820c`](https://github.com/JSPrismarine/JSPrismarine/commit/a2d820c16b89fbfd81e272cd7a43c9a0d71e63e9), [`5fd1c5e`](https://github.com/JSPrismarine/JSPrismarine/commit/5fd1c5ed275a800446ee803e6145b26a626928ef), [`64e1df3`](https://github.com/JSPrismarine/JSPrismarine/commit/64e1df3061e97ef1e45932a830960825e276d1f9), [`0fcc990`](https://github.com/JSPrismarine/JSPrismarine/commit/0fcc9902098c8f825f95a8737b158e1a23d88250), [`5b96d5a`](https://github.com/JSPrismarine/JSPrismarine/commit/5b96d5ac59cfbc754a3977aeaaa57e9991a1404a), [`5940943`](https://github.com/JSPrismarine/JSPrismarine/commit/59409430950ae131ce1cdc5e15220bac176b4b62), [`52e4907`](https://github.com/JSPrismarine/JSPrismarine/commit/52e490722eb7c0d76c6342d3ac7ddc6fe88d91a2), [`650d0bf`](https://github.com/JSPrismarine/JSPrismarine/commit/650d0bf72f637e0972c287095eb74145ec8ed638), [`64cc66e`](https://github.com/JSPrismarine/JSPrismarine/commit/64cc66e90d5c29aa03016d66e6e393daec1f5063), [`1f304c1`](https://github.com/JSPrismarine/JSPrismarine/commit/1f304c13099487c5381a676929c8c7671bf4d560), [`09fa244`](https://github.com/JSPrismarine/JSPrismarine/commit/09fa2442ab5677d0ea64547b7260d386deb149f5), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a), [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de), [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9), [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23), [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7), [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab), [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235), [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389), [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394), [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13), [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503), [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029)]:
  - @jsprismarine/minecraft@0.15.0
  - @jsprismarine/protocol@0.15.0
  - @jsprismarine/raknet@0.15.0
  - @jsprismarine/auth@0.15.0
  - @jsprismarine/logger@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies [[`6b15f32`](https://github.com/JSPrismarine/JSPrismarine/commit/6b15f32341e8131b1c498013f2f951b774adff64)]:
  - @jsprismarine/prismarine@0.14.2
  - @jsprismarine/logger@0.14.2
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
    - @jsprismarine/logger@0.14.1
    - @jsprismarine/prismarine@0.14.1
    - @jsprismarine/raknet@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a), [`c572c06`](https://github.com/JSPrismarine/JSPrismarine/commit/c572c06c61f668cd7cfababb05e7adbc219876ca), [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095)]:
    - @jsprismarine/logger@0.14.0
    - @jsprismarine/prismarine@0.14.0
    - @jsprismarine/raknet@0.14.0

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`f8dddf8`](https://github.com/JSPrismarine/JSPrismarine/commit/f8dddf8bbd7e444248d82fa4179eacf538485100), [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/prismarine@0.13.5
    - @jsprismarine/logger@0.13.5
    - @jsprismarine/raknet@0.13.5

## 0.13.2

### Patch Changes

- Updated dependencies [[`ab719cb`](https://github.com/JSPrismarine/JSPrismarine/commit/ab719cb2a58f3b099a3017694ce4ce610bf5cf54)]:
    - @jsprismarine/prismarine@0.13.2
    - @jsprismarine/logger@0.13.2
    - @jsprismarine/raknet@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/logger@0.13.1
    - @jsprismarine/prismarine@0.13.1
    - @jsprismarine/raknet@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [[`ea1948a`](https://github.com/JSPrismarine/JSPrismarine/commit/ea1948a494893e0cb03774c5530971d20e7bfdaf)]:
    - @jsprismarine/prismarine@0.13.0
    - @jsprismarine/logger@0.13.0
    - @jsprismarine/raknet@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72), [`6bf4e8d`](https://github.com/JSPrismarine/JSPrismarine/commit/6bf4e8dcfb07d45c1c1a6ff32b4993b0f8f4f96e)]:
    - @jsprismarine/prismarine@0.12.1
    - @jsprismarine/logger@0.12.1
    - @jsprismarine/raknet@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies [[`0a8f8d7`](https://github.com/JSPrismarine/JSPrismarine/commit/0a8f8d7f2d8638f3da68abdbf65ba3c48dcda038), [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0), [`98ec1c5`](https://github.com/JSPrismarine/JSPrismarine/commit/98ec1c58363e95f04fec9c6118e637e21ad5fc1e), [`b025e15`](https://github.com/JSPrismarine/JSPrismarine/commit/b025e153f6777aaae672d8331926b2ac91e7e2e0), [`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe)]:
    - @jsprismarine/prismarine@0.12.0
    - @jsprismarine/raknet@0.12.0
    - @jsprismarine/logger@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`a79d837`](https://github.com/JSPrismarine/JSPrismarine/commit/a79d837e132bd2fbf1a91452b680341dafa76fe2)]:
    - @jsprismarine/prismarine@0.11.1
    - @jsprismarine/logger@0.11.1
    - @jsprismarine/raknet@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies [[`e962b51`](https://github.com/JSPrismarine/JSPrismarine/commit/e962b514e196511111877e9ad856a00291216c6e), [`3303be8`](https://github.com/JSPrismarine/JSPrismarine/commit/3303be822a8aff09142172e0796e66473dc2fef2), [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3), [`ad0e562`](https://github.com/JSPrismarine/JSPrismarine/commit/ad0e5623a34f0424bd520b68131b56e92dec1cea), [`51ba84e`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba84e1fe3b7ad99a9fb07039048c9cab2075b6), [`4b7f94d`](https://github.com/JSPrismarine/JSPrismarine/commit/4b7f94d805480a171728bc82829874c3d0258fc3)]:
    - @jsprismarine/prismarine@0.11.0
    - @jsprismarine/logger@0.11.0
    - @jsprismarine/raknet@0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`99566e3`](https://github.com/JSPrismarine/JSPrismarine/commit/99566e363f4a726de5180f998e7fd2fd36cc5bf7), [`ef1e604`](https://github.com/JSPrismarine/JSPrismarine/commit/ef1e604cdcddc73ea8b23b545142592a90b34884), [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a), [`306495d`](https://github.com/JSPrismarine/JSPrismarine/commit/306495dff6d34e8a1dca1187bf5e9a285325ec8f)]:
    - @jsprismarine/prismarine@0.10.0
    - @jsprismarine/logger@0.10.0
    - @jsprismarine/raknet@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/prismarine@0.9.0
    - @jsprismarine/logger@0.9.0
    - @jsprismarine/raknet@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`40af4b2`](https://github.com/JSPrismarine/JSPrismarine/commit/40af4b23802f74b2eecd34a4f05e90044d51fd56), [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/prismarine@0.8.0
    - @jsprismarine/logger@0.8.0
    - @jsprismarine/raknet@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6), [`1e013a6`](https://github.com/JSPrismarine/JSPrismarine/commit/1e013a60b9987929b53b2cc1d333daf8b5d45196)]:
    - @jsprismarine/prismarine@0.7.0
    - @jsprismarine/logger@0.7.0
    - @jsprismarine/raknet@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/logger@0.6.0
    - @jsprismarine/prismarine@0.6.0
    - @jsprismarine/raknet@0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- Updated dependencies [[`c8d976f`](https://github.com/JSPrismarine/JSPrismarine/commit/c8d976f627ef96deb9b2213561848f84214c07a1), [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53), [`3a00892`](https://github.com/JSPrismarine/JSPrismarine/commit/3a00892ab6d8e0647c94da96bb85553f08a8484b)]:
    - @jsprismarine/prismarine@0.5.0
    - @jsprismarine/logger@0.5.0
    - @jsprismarine/raknet@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`2d32a17`](https://github.com/JSPrismarine/JSPrismarine/commit/2d32a17c994a3cbd3d98d94dd0f33280a863c81a), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/prismarine@0.4.5
    - @jsprismarine/logger@0.4.5
    - @jsprismarine/raknet@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies [[`adffd12`](https://github.com/JSPrismarine/JSPrismarine/commit/adffd12b09d07dc878a2e01cd795c3056317946a), [`2b5bc2f`](https://github.com/JSPrismarine/JSPrismarine/commit/2b5bc2fbffe777c329fd5684e342050cd2e13c43), [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a), [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7), [`07bc6d0`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc6d0920e48b2fa593b346ac73949517c0fb7a)]:
    - @jsprismarine/prismarine@0.4.4
    - @jsprismarine/raknet@0.4.4
    - @jsprismarine/logger@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies [[`b0a232b`](https://github.com/JSPrismarine/JSPrismarine/commit/b0a232b9be5d6456c33d5300582a0c7e33d76a6e)]:
    - @jsprismarine/prismarine@0.4.3
    - @jsprismarine/logger@0.4.3
    - @jsprismarine/raknet@0.4.3

## 0.4.2

### Patch Changes

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies [[`384f571`](https://github.com/JSPrismarine/JSPrismarine/commit/384f5716d593f2f3bac4a9521578d32107e671a8), [`7d7283b`](https://github.com/JSPrismarine/JSPrismarine/commit/7d7283ba87e6fc030d25be8a2a542745a5c94745), [`a66c1b9`](https://github.com/JSPrismarine/JSPrismarine/commit/a66c1b981698fa26570bb0fd9ebf667240a172b7), [`b54350e`](https://github.com/JSPrismarine/JSPrismarine/commit/b54350eb6341fc487b05781b149c148bae3a5f55), [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4)]:
    - @jsprismarine/prismarine@0.4.2
    - @jsprismarine/logger@0.4.2
    - @jsprismarine/raknet@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`44c25e1`](https://github.com/JSPrismarine/JSPrismarine/commit/44c25e132b55174a1e57aee9152e6fbb73c90cf6), [`8bc4525`](https://github.com/JSPrismarine/JSPrismarine/commit/8bc452534b5048b71a08e509d2823203bf07a407), [`e1ba6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/e1ba6e71a2757cd6bba00c95d15d0d672c8cf476), [`69dae84`](https://github.com/JSPrismarine/JSPrismarine/commit/69dae84d2fde2bb754442f58a85dc4a865e28966)]:
    - @jsprismarine/prismarine@0.4.1
    - @jsprismarine/raknet@0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

- Updated dependencies [[`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5), [`fad26e2`](https://github.com/JSPrismarine/JSPrismarine/commit/fad26e2affc095a94cfaed417891bbc9605af589), [`91b556d`](https://github.com/JSPrismarine/JSPrismarine/commit/91b556de0064b8e670ea46b61f0c51817ea7b425), [`c7965d4`](https://github.com/JSPrismarine/JSPrismarine/commit/c7965d446ce591b29e71a75bfed0ae6ca5ef91cb)]:
    - @jsprismarine/prismarine@0.4.0
    - @jsprismarine/raknet@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/prismarine@0.3.0
    - @jsprismarine/raknet@0.3.0

## 0.2.0

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

- Updated dependencies [[`f7e0fc4`](https://github.com/JSPrismarine/JSPrismarine/commit/f7e0fc414117553581aa246eedd3861b2122eadf), [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1), [`6477e70`](https://github.com/JSPrismarine/JSPrismarine/commit/6477e7079ef9f8eca981f4ab539b7045ee514e2f), [`6001709`](https://github.com/JSPrismarine/JSPrismarine/commit/6001709dcfddb12e6ddf0c8fe919cabacb5d6122)]:
    - @jsprismarine/prismarine@0.2.0
    - @jsprismarine/raknet@0.2.0

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- Updated dependencies [[`323a666`](https://github.com/JSPrismarine/JSPrismarine/commit/323a666b2d4b82e399ff21711ff8cc7ca6f520dd), [`491b688`](https://github.com/JSPrismarine/JSPrismarine/commit/491b688adc0c38426b767646b6cc748b8e774e30), [`20a8ea4`](https://github.com/JSPrismarine/JSPrismarine/commit/20a8ea47c25eaf21548f1994bf915c4c22a0f395), [`7073f41`](https://github.com/JSPrismarine/JSPrismarine/commit/7073f414487b7403765686b05d04f99c6878d88a), [`cdecbaa`](https://github.com/JSPrismarine/JSPrismarine/commit/cdecbaaf823a6f2db15e1793b50da9925deb3716), [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5), [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd)]:
    - @jsprismarine/prismarine@0.1.1
    - @jsprismarine/raknet@0.1.1

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
- Updated dependencies [[`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5)]:
    - @jsprismarine/prismarine@0.1.0
    - @jsprismarine/raknet@0.1.0
