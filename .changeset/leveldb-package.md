---
'@jsprismarine/leveldb': minor
---

Add `@jsprismarine/leveldb`, a LevelDB implementation in pure TypeScript that reads and writes the databases Minecraft: Bedrock Edition keeps its worlds in.

Bedrock does not use stock LevelDB. Mojang's fork adds the `Zlib` (2) and `ZlibRaw` (4) block compression types and writes with the latter, which upstream rejects outright — so every off-the-shelf binding fails on a real world, and the ones that do not are native modules. This has no dependencies at all: `node:zlib` supplies raw DEFLATE, and CRC32C, the table and log formats, the manifest and Snappy decompression are implemented here.

Covers the table format (footer, index, prefix-compressed blocks with restart points, per-block CRC32C), the record log used for both the write-ahead log and the manifest, write batches, memtable flushes to level 0, and level 0 to level 1 compaction. Reads compression types 0, 1, 2 and 4; writes 4. Takes the `LOCK` file, so opening a world the game already has open fails loudly instead of corrupting it.
