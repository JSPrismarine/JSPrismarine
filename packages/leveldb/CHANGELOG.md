# @jsprismarine/leveldb

## 0.23.1

### Patch Changes

- [#3481](https://github.com/JSPrismarine/JSPrismarine/pull/3481) [`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Export the types the public API already uses, so a consumer can name what a function takes or returns. Each package's entry point now exports the interfaces, type aliases and classes its exported signatures reference, and `@jsprismarine/prismarine` and `@jsprismarine/script-host` publish the modules that define them.
  
  `@jsprismarine/protocol` exports five wire types under new names, because the packet API already uses the plain names for other types: `ActorLinkFields`, `AbilityLayerFields`, `SerializedAbilitiesDataFields`, `GameRuleFields` and `UUIDValue`.
- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0

## 0.22.0

### Minor Changes

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`7b4199d`](https://github.com/JSPrismarine/JSPrismarine/commit/7b4199d627d52ac5734de1e333e8d37dbb515cc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Opening a database whose log is damaged now skips the damage the way Bedrock does instead of refusing the whole world. A bad checksum or an impossible record length drops the rest of its 32 KiB log block, a fragment out of sequence is dropped on its own, and a damaged batch applies the operations before the damage. Each skipped stretch goes to the new `onCorruption` option, which defaults to `console.warn`. A damaged manifest is still refused, as upstream LevelDB refuses it. `MemTable.maxSequence`, which nothing called once replay counts sequences from each batch's header, is removed from the `@jsprismarine/leveldb/db/MemTable` module.

### Patch Changes

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`af3a319`](https://github.com/JSPrismarine/JSPrismarine/commit/af3a319424b630629679b1b6f41b6c015f5036a5) Thanks [@filiphsps](https://github.com/filiphsps)! - A point read no longer misses a key longer than 24 bytes that shares a prefix with the key before it in its block. When a block's first lookup reached such a key, the reader grew its key buffer without keeping the shared prefix, compared a damaged key and reported the key missing. Player records (`player_server_<uuid>`) and ticking areas (`tickingarea_<uuid>`) have this shape, so a returning player could load as new.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`df74b86`](https://github.com/JSPrismarine/JSPrismarine/commit/df74b869c87f542441f0186fc03cbe7dc15ad022) Thanks [@filiphsps](https://github.com/filiphsps)! - Compacting a level now takes every neighboring file that holds more of the picked file's last key. LevelDB before 1.23 could split one key's versions across two files of a level, newest first, so a world saved by the game can contain such a split. Compacting only the first file moved the newest version below an older one, and reads of that key returned the older value from then on.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`722761b`](https://github.com/JSPrismarine/JSPrismarine/commit/722761b6ee14608bb1475dd9da01eb61a22a2cf4) Thanks [@filiphsps](https://github.com/filiphsps)! - Compaction builds each output table once. It used to finish a table past the file size cap and then search for a prefix that fit, building and compressing the same entries four to six times over. It now cuts a table before the entry that could take it past the cap, using an upper bound on the finished size, so every output still fits the cap.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`1592004`](https://github.com/JSPrismarine/JSPrismarine/commit/1592004f7c39c936df339e0a53ecf44d9a1e024d) Thanks [@filiphsps](https://github.com/filiphsps)! - A table saved under the `.sst` name LevelDB used before 1.14 now opens when no `.ldb` file has its number, as it does in upstream LevelDB. The name was recognized but never opened, so a database holding one failed with `ENOENT` on the first read that reached it.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`91eaf8c`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaf8c4029af709cb2d57a05b828d2e69c32ecb) Thanks [@filiphsps](https://github.com/filiphsps)! - Each flush and compaction appends one edit to the open manifest and syncs it once, as upstream LevelDB and Bedrock do. It used to write a whole new manifest and replace `CURRENT` each time, which took three syncs and rewrote every file's entry. A fresh manifest is still written when the database opens and once the open one passes 2 MiB. If an append fails, a fresh manifest of the version before it replaces the one it went to, and if that fails too the database keeps the edit's tables and refuses further writes and flushes.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`6049776`](https://github.com/JSPrismarine/JSPrismarine/commit/60497763d870e7ce23d1bbcc59c94700586f05ce) Thanks [@filiphsps](https://github.com/filiphsps)! - Opening a database for writing deletes the table files its manifest does not name, as upstream LevelDB does. A crash between writing a table and recording it, or during a compaction, left such a file behind for good. A read-only open still deletes nothing.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`32dd2d9`](https://github.com/JSPrismarine/JSPrismarine/commit/32dd2d910476fe23521fc92c01999b67c061d9ca) Thanks [@filiphsps](https://github.com/filiphsps)! - `Database.entries` and `Database.keys` read the database as it was at their first entry. A compaction that finished during a scan closed the tables the scan was still reading, and the scan then failed with `EBADF`; replaced tables now stay open and on disk until the last running scan ends. A write made during a scan could shift the memtable under it, so the scan would show some later writes and skip or repeat entries. A scan also opens one table per sorted level at a time instead of every table at once, and a range scan seeks to its start instead of reading every key before it.

- [#3089](https://github.com/JSPrismarine/JSPrismarine/pull/3089) [`5c244f6`](https://github.com/JSPrismarine/JSPrismarine/commit/5c244f643e48d5fdcf01aff1f76c46f680524714) Thanks [@filiphsps](https://github.com/filiphsps)! - New tables cut their data blocks at 160 KiB, the size Bedrock writes, instead of 4 KiB. On a world Bedrock Dedicated Server generated, tables come out 19% smaller and loading a chunk reads 1.1 blocks on average instead of 4.4, while a chunk loaded with a cold cache decompresses more bytes. Existing tables stay readable at whatever block size they were written with and take the new one when a compaction rewrites them. Pass `blockSize` to keep the old size.

## 0.21.0

### Minor Changes

- [#2988](https://github.com/JSPrismarine/JSPrismarine/pull/2988) [`d36a05a`](https://github.com/JSPrismarine/JSPrismarine/commit/d36a05a3209f83ffb6eb6e12db370774d59febe8) Thanks [@filiphsps](https://github.com/filiphsps)! - `CompressionType` is now a constant object and a union type of its values instead of an enum. `CompressionType.Snappy` and the other members still work as values and `CompressionType` as a type, but a member can no longer be used as a type of its own. From source in a checkout, the table builder worker now runs on Node's built-in type stripping instead of `tsx`, so `tsx` is no longer a development dependency.

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`19686c5`](https://github.com/JSPrismarine/JSPrismarine/commit/19686c5ad3964370f4d3ca0bf7f93d91872a3f9b) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `Database.commit`, which applies a batch at once and appends its log record on libuv's thread pool, and a per-call `sync` option for `write` and `commit`. Commits append in the order they were made, and `write` refuses to overtake one still appending. A commit whose append fails fails the commits queued behind it too, which were framed for an offset past the failed record, and the database then refuses every later write. A log record is now framed as headers over views of the encoded batch, so appending a batch no longer copies it a second time. `replaceFileAtomically`, which writes a file the way the database rewrites `CURRENT`, is exported for the files a save keeps beside its database.

- [#2988](https://github.com/JSPrismarine/JSPrismarine/pull/2988) [`493f32a`](https://github.com/JSPrismarine/JSPrismarine/commit/493f32ae5e8d74bdda52bfe20a113d1a8875c0ce) Thanks [@filiphsps](https://github.com/filiphsps)! - An executable compiled with Bun's `--aot` saves its world again. Its modules keep their `.ts` paths, so the table builder worker asked for the `tsx` loader, which an executable does not carry. The embedded worker now starts without it.

- [#3017](https://github.com/JSPrismarine/JSPrismarine/pull/3017) [`22f1a95`](https://github.com/JSPrismarine/JSPrismarine/commit/22f1a956d851557acfd0ad6ff7ed8004edc88d9f) Thanks [@filiphsps](https://github.com/filiphsps)! - The database no longer writes through a symbolic link planted in its directory. A new manifest, table or temporary file removes whatever entry already holds its name and is created exclusively, and a log is opened for appending with `O_NOFOLLOW` and must be a regular file. A link at one of those names used to be followed, which truncated or appended to a file outside the database directory.

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

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
