# @jsprismarine/raknet

## 0.15.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/binaryutils@0.15.1

## 0.15.0

### Minor Changes

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

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

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`e25f62b`](https://github.com/JSPrismarine/JSPrismarine/commit/e25f62bdba9c0c42193f1f368c69c22cf07e91de) Thanks [@filiphsps](https://github.com/filiphsps)! - Add RakNet's outgoing half, so the library can make connections as well as accept them.
  
  This is the foundation both `@jsprismarine/client` and the planned proxy stand on. The reliability layer is not duplicated for it: ACK/NACK, ordering, fragmentation and retransmission are the exact code paths the server already runs, which is the only way an outgoing connection is worth anything as a test of the incoming one.
  
  - **`RakNetPeer`.** `Session` coupled to `ServerSocket` through four members - `getLogger`, `sendPacket`, `emit`, `removeSession` - and nothing else. Extracting them as an interface is what lets a session be driven from either side. `@jsprismarine/client` used to reach the same end by passing itself as `this as any` in place of a `ServerSocket`, because there was no smaller contract to implement.
  - **`ClientSocket`.** `connect()`, which resolves on a completed handshake and rejects with the server's own reason when it refuses - full, banned, protocol mismatch, already connected - rather than letting all four look like a timeout. Plus `ping()` for a server's MOTD without connecting, several at a time, and a keepalive so a session idle in both directions is not timed out. The offline exchange has no session to retransmit for it, so the socket owns the retry timer and RakNet's three-rung MTU ladder.
  - **`OfflineClientHandler`.** The mirror of `OfflineHandler`, applying the same magic-and-length guard to what a server sends back that we already applied to what a client sends us.
  - **The client role in `Session`.** Sending `ConnectionRequest`, answering `ConnectionRequestAccepted` with `NewIncomingConnection`, and reaching `CONNECTED`. Keyed on an explicit `RakNetRole` rather than on the message id, which would have let a peer talk a listening server through the client half of the handshake and skip `NEW_INCOMING_CONNECTION` entirely.
  
  Three fixes fell out of needing the codecs to work in both directions:
  
  - `NewIncomingConnection.encodePayload` wrote the remote's address twenty one times instead of the address followed by twenty system addresses. The byte count matched, which is why it survived: JSPrismarine was the only thing decoding it and reads those twenty purely to advance past them. A real server does look.
  - `Session` never handled `CONNECTED_PONG`, so the answer to a ping was emitted as `encapsulated` and reached the packet dispatcher as if it were a Minecraft packet.
  - `ConnectedPing`, `ConnectedPong` and `IncompatibleProtocolVersion` each implemented only the direction the server needed. They are now symmetric, like the rest of the handshake packets already were.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`2eda0da`](https://github.com/JSPrismarine/JSPrismarine/commit/2eda0da630ef2d917c6906dc79b1cc1266607dd9) Thanks [@filiphsps](https://github.com/filiphsps)! - `ConnectionRequestAccepted` now exposes the `systemIndex` and the twenty `systemAddresses` it decodes, and writes the internal addresses a caller supplies (loopback plus unassigned slots when none are given). The internal address count both it and `NewIncomingConnection` use is exported as `MAXIMUM_NUMBER_OF_INTERNAL_IDS`. Internal addresses of either IP family are now walked correctly, so a dual stack peer's timestamps decode where they are.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`cb93c6c`](https://github.com/JSPrismarine/JSPrismarine/commit/cb93c6c598798cf7d1d0b489c8c46e6c2e082e23) Thanks [@filiphsps](https://github.com/filiphsps)! - `BitFlags` names the two remaining datagram header bits, `CONTINUOUS_SEND` (0x08) and `NEEDS_B_AND_AS` (0x04), and documents that `FrameSet` accepts and ignores them, as RakNet's sliding window congestion control does. No wire behavior changes.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`218a8a8`](https://github.com/JSPrismarine/JSPrismarine/commit/218a8a856e48d82f02b4c93f976939b900302dc7) Thanks [@filiphsps](https://github.com/filiphsps)! - `Packet.readAddress` and `Packet.writeAddress` now encode and decode IPv6 `SystemAddress` values the way RakNet does (version 6, the Windows `AF_INET6` family, the port, flow info, 16 address bytes, scope id). Before, an IPv6 address decoded as the raw bytes read as UTF-8 text, and writing one produced an IPv4 record of garbage. `InetAddress` now infers version 6 from a colon in the address when no version is given, and `writeAddress` throws on text that is not an address of its version instead of writing junk.

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`8b66629`](https://github.com/JSPrismarine/JSPrismarine/commit/8b666295644f770b2e99c5e4b6839a79f9a0c4ab) Thanks [@filiphsps](https://github.com/filiphsps)! - `UnconnectedPong` now carries the full MOTD line a Bedrock Dedicated Server broadcasts: the
  flag field, the IPv4 and IPv6 ports, and the two trailing fields after them. A client reads
  the ports to connect to a server it found on the local network, so a line that stopped at the
  gamemode appeared in the list but could not be joined from it. `ServerSocket.start` sets the
  port from the socket once it has bound.
  
  `Packet.readAddress` and `Packet.readString` now read their unsigned fields unsigned. Both are
  written with `writeUnsignedShort`, so a port from 32768 up - the range an operating system
  hands a connecting client - decoded as a negative number.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`a10d86a`](https://github.com/JSPrismarine/JSPrismarine/commit/a10d86aad180120f14dcf3fe0e5944c3dc373235) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerName` advertises the last entry of `getIdentifiers().MinecraftVersions` in the MOTD line instead of the first, so a server supporting 1.26.50 and 1.26.51 shows up as 1.26.51, the way a Bedrock Dedicated Server of that version does.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`0f058dd`](https://github.com/JSPrismarine/JSPrismarine/commit/0f058dd7353e522b61ec1c45366c667bab12a389) Thanks [@filiphsps](https://github.com/filiphsps)! - `ServerSocket` no longer warns that online mode is unsupported when constructed with `onlineMode` set. RakNet has no part in Bedrock's online mode: the client never enables RakNet security, and the identity check belongs to the game layer's login. The parameter is kept so existing calls still compile.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`c76286f`](https://github.com/JSPrismarine/JSPrismarine/commit/c76286f0101f6fad70f78023282271801880b394) Thanks [@filiphsps](https://github.com/filiphsps)! - Adds `RAKNET_PROTOCOL_VERSION` (11), the RakNet version byte Bedrock sends in `OpenConnectionRequest1`. `MINECRAFT_PROTOCOL_VERSION` still exports the same value but is deprecated: it named RakNet's version, not Minecraft's network protocol.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`5b57bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/5b57bc3cac03393219507b3cbb700cae8b174d13) Thanks [@filiphsps](https://github.com/filiphsps)! - `UnconnectedPing` now carries the client guid RakNet writes after the offline magic. `ClientSocket.ping` sends its own guid there, and decoding reads it when present (`clientGUID`, 0 for a ping that stops after the magic).

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`b20d325`](https://github.com/JSPrismarine/JSPrismarine/commit/b20d3256b5005a0b594d2a8d1abadc3142ef0503) Thanks [@filiphsps](https://github.com/filiphsps)! - GUIDs and timestamps in the handshake packets are now read and written as unsigned 64 bit values, which is what RakNet's `RakNetGUID` and `RakNet::Time` are, and `ServerSocket`, `ClientSocket` and `LoopbackSocket` generate their guids unsigned. `ServerSocket` also passes its guid to `ServerName.setServerId`, so the seventh field of the MOTD line now carries the same guid as the pong header instead of `0`. A caller that hands a packet a negative bigint now gets a `RangeError` on encode.

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
- Updated dependencies [[`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a)]:
  - @jsprismarine/binaryutils@0.15.0

## 0.14.2

No changes in this release.

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

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

## 0.12.0

### Minor Changes

- [`d761626`](https://github.com/JSPrismarine/JSPrismarine/commit/d761626b51b8a402b13d111e3dd25b560bfdf8fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Close socket upon killing.

## 0.11.1

## 0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

## 0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

## 0.7.0

## 0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

## 0.4.4

### Patch Changes

- [#1334](https://github.com/JSPrismarine/JSPrismarine/pull/1334) [`4f8bf3f`](https://github.com/JSPrismarine/JSPrismarine/commit/4f8bf3f367d42dbd710cf353c075e25bcb5370f7) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix "Take advantage of raknet/src/utils/ServerName.ts." [#1313](https://github.com/JSPrismarine/JSPrismarine/issues/1313).

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

## 0.3.0

## 0.2.0

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

- [`c6a627d`](https://github.com/JSPrismarine/JSPrismarine/commit/c6a627da60bae29bd0e6dfead9d44dddbeb0dafd) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose more of the internals.

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
