# @jsprismarine/leveldb

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

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
