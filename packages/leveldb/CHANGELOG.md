# @jsprismarine/leveldb

## 0.19.1

No changes in this release.

## 0.19.0

### Patch Changes

- [`a8cc6ff`](https://github.com/JSPrismarine/JSPrismarine/commit/a8cc6ff8eb12c9cdfd71507a88ded2197ea12b0f) Thanks [@filiphsps](https://github.com/filiphsps)! - The Bun-compiled executables no longer exit on start. The generation pool, the RakNet socket and LevelDB's table builder each start a worker the compile did not embed: the pool handed its worker to piscina, whose own `dist/worker.js` was a path on the build machine, and the other two looked for their worker beside a bundled module that is not there. The executable now embeds all three, the generation pool runs a compiled binary's worker through its own runner as the Node single executable does, and the release and nightly builds start each executable and stop it again before publishing it.

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

- [#2923](https://github.com/JSPrismarine/JSPrismarine/pull/2923) [`6cd28a8`](https://github.com/JSPrismarine/JSPrismarine/commit/6cd28a83eae9c18f59132935992639f3afd98a04) Thanks [@enricoangelon](https://github.com/enricoangelon)! - A `LOCK` file that names the current process, but that the process does not hold, is now treated as stale and taken over. Inside a container the server always runs as pid 1, so a server killed before it released the lock left `1 <hostname>` behind, and every later start on the same host refused with `DatabaseLockedError`.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`021acfb`](https://github.com/JSPrismarine/JSPrismarine/commit/021acfb1b4f361e01b555ba0f51062b05c386256) Thanks [@filiphsps](https://github.com/filiphsps)! - Bound the shared decompressed block cache by bytes and keep table index blocks pinned.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`29ad03a`](https://github.com/JSPrismarine/JSPrismarine/commit/29ad03ac2692758023d27728d649407c41cc22a3) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep deletion markers while deeper table levels may contain older values.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`796ca0b`](https://github.com/JSPrismarine/JSPrismarine/commit/796ca0b433725f814f7ce1c730911b0e6091329d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add compatible Bloom filters and reduce point-lookup allocations.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`c9462f2`](https://github.com/JSPrismarine/JSPrismarine/commit/c9462f23a25592472260072973fe3e76f651c7d1) Thanks [@filiphsps](https://github.com/filiphsps)! - Move table flush and compaction off-thread with leveled size budgets

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`26cc9bf`](https://github.com/JSPrismarine/JSPrismarine/commit/26cc9bf7a48edbad36911d663fdc1e84018b33c2) Thanks [@filiphsps](https://github.com/filiphsps)! - Embed self-contained server and LevelDB workers for single-executable startup.

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3d3a422`](https://github.com/JSPrismarine/JSPrismarine/commit/3d3a422dff9605ff66b7e1fb336440996c0a3330) Thanks [@filiphsps](https://github.com/filiphsps)! - Delete the write-ahead logs an open leaves behind. Recovery replays the old logs, flushes
  whatever they held into a table and starts a fresh log, but never removed the ones it had
  finished with - so every open leaked a file. A world a developer restarts all day had 132 empty
  logs in it, which recovery then reads past on each open. Stale manifests were already cleaned up
  this way; logs now are too.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5051888`](https://github.com/JSPrismarine/JSPrismarine/commit/505188860d3c261bdce0cb97562f4e71e7055554) Thanks [@filiphsps](https://github.com/filiphsps)! - Make a LevelDB point lookup a point lookup. `TableReader.seekFrom` found the right data block by
  binary search and then threw the answer away: it re-scanned the index block entry by entry to find
  the block again, and read that block from its first entry rather than from the target. Every
  `Database.get` therefore decoded, and allocated a key and a value Buffer for, every index entry in
  the table plus half a data block.
  
  On a 441 chunk world - two tables, 3 MiB - one lookup cost 700 microseconds. A chunk read asks for
  about 29 records, so loading a saved world spent most of its time here, and reading a chunk back
  was slower than generating it from scratch.
  
  `TableReader.seek` is the new point lookup: one index entry, one data block, and the block's own
  restart-point binary search inside it. `seekFrom` keeps its range semantics and now seeks within
  the first block instead of replaying it. Measured over the same world, best of five interleaved
  rounds in one process: 700 microseconds per lookup before, 16.8 after, 41.8 times faster.

## 0.15.2

No changes in this release.

## 0.15.1

No changes in this release.

## 0.15.0

### Patch Changes

- [#2585](https://github.com/JSPrismarine/JSPrismarine/pull/2585) [`6bac604`](https://github.com/JSPrismarine/JSPrismarine/commit/6bac604599b909ba32f93fc855de11e88455d184) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace `as` type assertions with inferred types, type guards and narrower parameter types across the packages.
  
  Most of the change is internal, but a few public signatures moved so the compiler can carry the type instead of a cast:
  
  - **brigadier.** `ArgumentType.parse` receives an `ArgumentParseContext<S>` (the dispatcher's context builder, which is what it always got at runtime) instead of a `CommandContext`. `ParseResults.getExceptions()` holds `Error` values, since argument parsers throw plain errors. `CommandContext.getLastChild()` no longer claims it can return `null`. `ArgumentType` and `ArgumentParseContext` are exported from the package root.
  - **protocol.** `DataItem` is built from one `DataItemEntry` whose `type` tag decides the type of `value`, and exposes `getId`, `getType` and `getValue`. `NetworkStructure.deserialize` now returns a real instance: it used to copy the prototype with `Object.assign`, which copies nothing, so a decoded `BlockPos` or `Vec3` had no `serialize` method and failed `instanceof`.
  - **raknet.** `ServerName` takes a `ServerNameSource` naming the two methods it reads instead of `any`.
  - **client.** `ClientPacketRegistry` exports an `isPacket(packet, id)` guard that narrows `DecodedPacket.data` by id. The handshake rejects a JWT claim that is present but not a string with the existing clear error instead of a later `TypeError`.
  - **minecraft.** `BlockSchemaProperty.type` is the union of the three NBT tags the palette uses, so a palette with a new tag fails type-checking instead of slipping through as a string.
  - **prismarine.** The command dispatcher is typed over `CommandExecutor`, with typed `literal`/`argument` builders and runtime-checked argument accessors; selectors and relative coordinates from the console fail with a clear error instead of a `TypeError`, and relative `~` coordinates, which threw on every use, now work. `Metadata` stores typed entries so a value that does not match its `FlagType` is a compile error. Several managers take the narrow slice of `Server` they use (`BanManager`, `BlockManager`, `PacketRegistry`, `RecipeManager`, `CreativeInventory`), so tests build plain doubles. A shorthand ambient module had typed every import from `@jsprismarine/bedrock-data` as `any` inside the package; it is gone, so the generated types reach the compiler.
  - **logger, nbt, leveldb.** No signature changes. `Logger.getNamespace` returns an empty string instead of throwing when `Error.stack` is undefined, and `NBTTagCompound` getters return the default for a tag of the wrong kind instead of throwing.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/leveldb`, a LevelDB implementation in pure TypeScript that reads and writes the databases Minecraft: Bedrock Edition keeps its worlds in.
  
  Bedrock does not use stock LevelDB. Mojang's fork adds the `Zlib` (2) and `ZlibRaw` (4) block compression types and writes with the latter, which upstream rejects outright — so every off-the-shelf binding fails on a real world, and the ones that do not are native modules. This has no dependencies at all: `node:zlib` supplies raw DEFLATE, and CRC32C, the table and log formats, the manifest and Snappy decompression are implemented here.
  
  Covers the table format (footer, index, prefix-compressed blocks with restart points, per-block CRC32C), the record log used for both the write-ahead log and the manifest, write batches, memtable flushes to level 0, and level 0 to level 1 compaction. Reads compression types 0, 1, 2 and 4; writes 4. Takes the `LOCK` file, so opening a world the game already has open fails loudly instead of corrupting it.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`e6dc892`](https://github.com/JSPrismarine/JSPrismarine/commit/e6dc892304b478bc4e0dfe47d33ebdbd12a13310) Thanks [@filiphsps](https://github.com/filiphsps)! - Take over a lock whose owner is gone, instead of refusing to start.
  
  A server killed with no chance to close left its `LOCK` file behind, and every restart after that failed with `DatabaseLockedError` until someone deleted it by hand. Worse in the other direction: LevelDB locks that file with `fcntl` and never writes to it, so a zero-byte `LOCK` is the *normal* state of any world Minecraft has ever opened — treating its presence as "in use" meant refusing to open exactly the worlds this package exists to read.
  
  The lock now records the process that took it, and is only honored while that process is still running. A lock naming a process that has exited, or holding nothing that identifies one, is stale and gets taken over. Locks held by another server on the same machine, by a second `Database` inside this process, or by a process on another host across shared storage are all still refused — and so is a world the game has open on Windows, where the file cannot be opened at all rather than merely existing.
  
  Verified by killing a child process holding a lock with `SIGKILL` and reopening: the database comes back, along with everything that had reached the write-ahead log.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.
