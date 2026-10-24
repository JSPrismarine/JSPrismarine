# If the internal model is Java shaped, what does it cost to store and send Bedrock?

Researched 2026-10-24 against this repository at `2a4b14af46`, Mojang's protocol documentation and Microsoft Learn, HiveGamesOSS/Chunker at `50aaf6d82e8b68929279161b790d95fdddfe0a40` (2026-10-02), GeyserMC/Geyser at `dd1fab334b5591012e9f41d1e17f50297ec51a69` (2026-10-23), GeyserMC/mappings, df-mc/dragonfly, pmmp/PocketMine-MP, misode/deepslate at `c33b4a65f2`, PrismarineJS/prismarine-chunk at `a08dc2c689`, and minecraft.wiki. Every claim names its source. Measurements in section 6 come from running this repository's own built code; the commands are in [Reproduction](#reproduction).

## Summary

1. This server is already Bedrock shaped end to end. `packages/prismarine/src/world/providers/leveldb/` writes a real Bedrock world: chunk version 41, sub chunk format 9, NBT block palettes, `Data3D` biomes, `level.dat` storage version 10, and a pure TypeScript LevelDB in `packages/leveldb` that speaks Mojang's raw-zlib block compression. Nothing in the repository is Java shaped. A Java shaped internal model would be a new layer, not a replacement for an existing one.
2. The block catalog is a Bedrock dump: 1477 blocks and 22079 states generated from `block-palette.json` for 1.26.51 (`packages/minecraft/src/generated/block-schemas.ts` lines 1 to 8). Runtime ids are the FNV-1a 32 bit hash of each state's little-endian NBT, and `StartGamePacket` sets `BlockNetworkIds Are Hashes` to 1, so the server never needs the client's palette ordering. Chunker computes the same `version` field the repository hardcodes, 18163713 for 1.21.40.1, from `(major << 24) | (minor << 16) | (patch << 8) | sub`.
3. Three things the repository persists today are incomplete. It never writes entities at all (`LevelDB.writeChunk` writes only `SubChunkPrefix`, `Data3D`, `Version`, `FinalizedState` and `BlockEntity`), it stores player data as JSON under `worlds/<name>/playerdata/<xuid>.json` rather than in `player_server_*` LevelDB records, and `LevelDB.saveLevelData` has no caller, so `level.dat` keeps the spawn point it was created with.
4. Three constants are stale or wrong. `CHUNK_VERSION` is 41, which Chunker ties to 1.21.40; 1.21.120 and later write 42. The `ChunkTag` enum in `LevelDBKeys.ts` repeats minecraft.wiki's error: it omits `GenerationSeed` (0x3c) and labels 0x3d, 0x3e and 0x3f as `MetaDataHash`, `GeneratedPreCavesAndCliffsBlending` and `BlendingBiomeHeight`, where Mojang's own enum has them as `GeneratedPreCavesAndCliffsBlending`, `BlendingBiomeHeight` and `MetaDataHash`. The block catalog says 1.26.51 while the on-disk state `version` says 1.21.40.1.
5. Java and Bedrock disagree on every layer of the chunk. Java packs 64 bit longs in YZX order with a 4 bit floor and, before 1.16, entries that straddle word boundaries; Bedrock packs 32 bit words in XZY order with a 1 bit floor and never straddles. Java biomes are 4x4x4 per section; Bedrock biomes are per block, so Geyser copies each Java cell into 64 Bedrock cells. Java stores entities in a separate `entities/` region directory and names block entities `minecraft:chest`; Bedrock stores actors under `actorprefix` plus a `digp` digest and names block entities `Chest`.
6. Chunker is the authoritative public mapping and it is MIT licensed, but the mapping is not a data file. It is roughly 750 `register(BlockMapping...)` calls in `JavaBlockIdentifierResolver.java` and 701 in `BedrockBlockIdentifierResolver.java`, both resolving to a 1292-entry `ChunkerVanillaBlockType` enum and 133 shared `BlockState` constants. The JSON `MappingsFile` format is for user-supplied overrides passed with `-m`, not for the vanilla mapping.
7. Measured on this repository's built code, a 9-sub-chunk column serializes to the network in 0.078 ms and 18922 bytes, and to disk in 0.60 ms and 23130 bytes. The disk form costs about eight times the network form because every palette entry is a full NBT compound rather than a varint. A Geyser style translation of one section, an `Int32Array` lookup plus the YZX to XZY reorder, takes about 4 us, so about 95 us for a 24-section column. That is slightly more than the whole current serialization, so translating at send time would roughly double the per-column cost.
8. Memory is the larger number. `BlockStorage` keeps `blocks` as a JavaScript `number[]`, which costs 8 bytes per block. A 9-sub-chunk column retains 297 KiB; a full 24-section Overworld column would retain about 786 KiB. A `Uint16Array` of palette indices would be 8 KiB per sub chunk, 192 KiB per column, a factor of four smaller. prismarine-chunk already stores the packed `Uint32Array` words directly.
9. Geyser publishes no benchmark. Its build files at `dd1fab33` contain no JMH module and no file named for benchmarking. It caches the Java chunk per session, not the translated Bedrock payload, so ten players in one area pay ten translations. As a plugin on a Java server it skips its own cache entirely (`ChunkCache.java:50`).
10. The recommendation is to keep storing Bedrock shaped and to keep the internal model Bedrock shaped too, because the mapping Java needs is 1451 hand-written rules that this project would have to maintain against two release trains. If a Java shaped model is adopted anyway, translate at the chunk boundary and keep the disk format unchanged, which keeps existing worlds readable and keeps the client contract already proven by the vanilla round-trip test.

## 1. What this repository stores today

### The provider and its files

`packages/prismarine/src/world/providers/leveldb/` holds the whole world format. Seven files, 955 lines of source plus 935 lines of test:

| File | Lines | What it owns |
|---|---|---|
| `LevelDB.ts` | 285 | The provider: read a chunk, write a chunk, create `level.dat` |
| `LevelDBKeys.ts` | 143 | Chunk key encoding and decoding, `digp` and `actorprefix` keys |
| `SubChunkCodec.ts` | 68 | The `SubChunkPrefix` record, versions 1, 8 and 9 |
| `PersistentBlockStorage.ts` | 106 | The paletted bit packing on disk |
| `PersistentPalette.ts` | 94 | One palette entry as `{name, states, version}` NBT |
| `BiomeCodec.ts` | 161 | The `Data3D` heightmap and biome palettes |
| `LevelDat.ts` | 98 | `level.dat`, `level.dat_old`, `levelname.txt` |

The database underneath is `packages/leveldb`, published as `@jsprismarine/leveldb` 0.15.2 and described in its `package.json` as a "LevelDB reader/writer for Minecraft: Bedrock Edition worlds, in pure TypeScript". It implements the log format, table format, memtable, version set, CRC-32C, Snappy decompression and Mojang's two zlib modes. `packages/leveldb/src/compression/Compression.ts` lines 13 to 18 define `None = 0`, `Snappy = 1`, `Zlib = 2`, `ZlibRaw = 4`, with the comment that "`ZlibRaw` is what the game writes: a DEFLATE stream with no zlib header and no trailing Adler-32". Chunker configures the same thing through a different binding: `options.compressionType(CompressionType.ZLIB_RAW)` at `BedrockLevelReader.java:95` and `BedrockLevelWriter.java:100`.

The second provider, `packages/prismarine/src/world/providers/anvil/Anvil.ts`, is a stub. It creates `data`, `entities`, `playerdata` and `region` directories and then regenerates terrain on every read (`readChunk` returns `generator.generateChunk(...)`, line 49) and discards every write (`writeChunk` is `// TODO.`, line 52). There is no Anvil reader in this repository.

### The chunk and sub chunk format it writes

`LevelDB.ts:23` sets `export const CHUNK_VERSION = 41` with the comment "The `Version` byte 1.21 writes". Chunker agrees for 1.21.40 (`v1_21_40/writer/ColumnWriter.java:17-19` returns 41) but writes 42 from 1.21.120 onward (`v1_21_120/writer/ColumnWriter.java:17-19`), and 40 at 1.18.30 (`v1_18_30/writer/ColumnWriter.java:106-108`). PocketMine-MP names the same values `ChunkVersion::v1_18_30 = 40`, `v1_21_40 = 41`, `v1_21_120 = 42`.

`SubChunkCodec.ts` writes format version 9 to disk and reads 1, 8 and 9. Version 9 adds the sub chunk's own y index after the layer count, as a signed byte, which `decodeSubChunk` sign-extends at line 57 with `(stream.readByte() << 24) >> 24`. The repository does not write the `LegacyVersion` (0x76) record that Chunker still writes as 7 alongside the modern one (`v1_18_30/writer/ColumnWriter.java:125`), nor `BlendingData` (0x40).

`PersistentBlockStorage.ts` encodes a storage as a header byte of `bitsPerBlock << 1` with the low bit clear, then `ceil(4096 / floor(32 / bits))` little-endian 32 bit words in XZY order, then an int32 palette count, then that many NBT compounds. It accepts widths 0, 1, 2, 3, 4, 5, 6, 8 and 16 (line 24) and refuses a storage whose low bit is set (line 67), since the runtime form never appears on disk. Chunker's `PaletteUtil.java` reads and writes exactly this shape, with `BITS_PER_ENTRY = {1,2,3,4,5,6,8,16}` at line 22 and the index decomposition `x = (i>>8)&0xF, z = (i>>4)&0xF, y = i&0xF` at lines 84 to 89.

One difference is worth noting. The repository writes `bitsPerBlock = 0` and no word data for a single-entry palette (`PersistentBlockStorage.ts:29-34, 43`). Chunker's writer never emits 0, because `BITS_PER_ENTRY[0]` is 1, so a uniform section costs it 128 words of zeros. Both readers accept both forms.

### Block palette entries

`PersistentPalette.ts` writes `{name, states, version}` in little-endian fixed-width NBT, with `BLOCK_STATE_VERSION = 18163713` (line 16). On the way back in, `runtimeIdOf` resolves the name through `BlockStateSchemas`, drops properties this version does not have, fills in defaults for properties the file omits, and falls back to the block's default state rather than to `minecraft:unknown` when a value is out of range (lines 56 to 94). A name with no schema resolves to `UNKNOWN_RUNTIME_ID` (-2) rather than throwing.

### Biomes

`BiomeCodec.ts` writes the `Data3D` record as 256 unsigned 16 bit heights, then one paletted storage per sub chunk whose entries are raw little-endian int32 biome ids. It understands the inherit marker, a header byte of `0xff` meaning "the same as the sub chunk below" (lines 23 and 76 to 80), and it tolerates a truncated tail because "the game stops writing once the rest would all inherit" (line 144).

`LevelDB.writeChunk` does not derive biomes from the generator. Line 153 reads `// TODO: carry the biomes the generator chose, once it chooses any`, and line 155 writes either whatever was already on disk or a uniform plains column.

### Block entities, entities and player data

Block entities round-trip. `LevelDB.readBlockEntities` (line 177) reads concatenated little-endian NBT compounds with no count in front and stops at the first malformed one rather than losing the chunk. `BlockEntity.ts:25` documents the id convention as "Vanilla's `id` string: `Chest`, `Sign`, `Furnace`. Not a namespaced identifier", which matches Bedrock, and `BlockEntity` keeps every tag it does not model in `extra` so an unknown type round-trips byte for byte.

Entities do not round-trip. `LevelDBKeys.ts` has `encodeDigestKey`, `encodeActorKey`, `encodeDigest` and `decodeDigest` (lines 113 to 143), and `DiskFormat.test.ts` exercises them, but no production code calls them. `LevelDB.writeChunk` writes five record types and none of them is `Entity` (0x32), `digp` or `actorprefix`. A mob on this server dies with the process.

`encodeActorKey` also takes a raw 8 byte id. Chunker derives the key from the actor's `UniqueID` rather than using it directly (`v1_18_30/writer/ColumnWriter.java:30-39`):

```java
// The top 32 bits get flipped, and then 0x100000000 gets added
long storageKey = 0x100000000L + (uniqueEntityID ^ 0xFFFFFFFF00000000L);
ByteBuffer buffer = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN);
```

Player data lives outside the world database entirely. `World.savePlayerData` (`World.ts:1284`) writes `worlds/<name>/playerdata/<xuid or name>.json` holding a uuid, a username, a gamemode name and a position. `World.saveLevelData` (line 1210) writes `worlds/<name>/level.json`. The Bedrock keys `~local_player` and `player_server_<uuid>` are named only in a comment in `LevelDBKeys.ts:87` and in test fixtures.

`LevelDB.saveLevelData` at line 247 would write the spawn point into `level.dat`, and nothing calls it. `level.dat` is created once in `ensureLevelMetadata` (line 216) if absent, with `SpawnY` set to `dimension.minY + 100`, and never updated.

### The key scheme

`encodeChunkKey` (`LevelDBKeys.ts:66`) writes x and z as signed little-endian int32, then the dimension as int32 only when it is not the Overworld, then the one-byte tag, then the signed sub chunk index for `SubChunkPrefix`. `decodeChunkKey` accepts lengths 9, 10, 13 and 14 and rejects a key whose length and tag disagree about whether a sub chunk index should be present. This matches Chunker's `LevelDBKey.key` (lines 117 to 137 and 159 to 178) and its `isColumnKey` length check (line 35).

The `ChunkTag` enum has an error inherited from minecraft.wiki. Mojang's own `LevelChunkTag` enum, reproduced verbatim on [Microsoft Learn's actor storage page](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable), runs `CheckSums, GenerationSeed, GeneratedPreCavesAndCliffsBlending = 61, BlendingBiomeHeight = 62, MetaDataHash, BlendingData, ActorDigestVersion`. The repository has no 0x3c at all, and labels 0x3d `MetaDataHash`, 0x3e `GeneratedPreCavesAndCliffsBlending` and 0x3f `BlendingBiomeHeight`. Chunker's `LevelDBChunkType.java:26-31` and PocketMine's `ChunkDataKey.php` both follow Mojang. Nothing in the repository writes those three tags, so the only present-day effect is that `decodeChunkKey` returns null for a key tagged 0x3c and `listChunks` skips it.

## 2. The Bedrock LevelDB world format

### Per-chunk tag bytes

From Mojang's `LevelChunkTag` enum on [Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable), cross-checked against Chunker `cli/src/main/java/com/hivemc/chunker/conversion/encoding/bedrock/util/LevelDBChunkType.java` and PocketMine-MP `src/world/format/io/leveldb/ChunkDataKey.php`:

| Dec | Hex | Name | Payload |
|---|---|---|---|
| 43 | 2B | Data3D | 512 byte heightmap (256 int16 LE) then one paletted biome storage per sub chunk |
| 44 | 2C | Version | One byte, the chunk storage version |
| 45 | 2D | Data2D | 512 byte heightmap then 256 biome bytes |
| 46 | 2E | Data2DLegacy | Heightmap then 256 entries of biome id plus RGB. Not written since 1.0.0 |
| 47 | 2F | SubChunkPrefix | Format version byte then version-dependent data |
| 48 | 30 | LegacyTerrain | 16x16x128 blob in XZY order. Not written since 1.0.0 |
| 49 | 31 | BlockEntity | Concatenated little-endian NBT root compounds |
| 50 | 32 | Entity | Concatenated little-endian NBT root compounds. Legacy |
| 51 | 33 | PendingTicks | One little-endian NBT compound |
| 52 | 34 | LegacyBlockExtraData | int32 LE count then 4 byte key and 2 byte value pairs |
| 53 | 35 | BiomeState | Undocumented |
| 54 | 36 | FinalizedState | int32 LE: 0 needs instaticking, 1 needs population, 2 done |
| 55 | 37 | ConversionData | Converter output used for blending |
| 56 | 38 | BorderBlocks | Education Edition |
| 57 | 39 | HardcodedSpawners | Structure spawn bounding boxes, not NBT |
| 58 | 3A | RandomTicks | One little-endian NBT compound |
| 59 | 3B | CheckSums | xxHash of the other records. Not written since 1.18.0 |
| 60 | 3C | GenerationSeed | |
| 61 | 3D | GeneratedPreCavesAndCliffsBlending | Marked "not used, DON'T REMOVE". Chunker still writes one zero byte |
| 62 | 3E | BlendingBiomeHeight | Marked "not used, DON'T REMOVE" |
| 63 | 3F | MetaDataHash | Hash into the world-level `LevelChunkMetaDataDictionary` |
| 64 | 40 | BlendingData | Two bytes, `{0, blendingVersion}` |
| 65 | 41 | ActorDigestVersion | |
| 118 | 76 | LegacyVersion | One byte. The chunk version lived here before 1.16.100 |
| 119 | 77 | AABBVolumes | Structure bounding boxes, not NBT |
| 120 | 78 | JigsawStructureBlueprint | Not NBT. Key carries an 8 byte structure id |

[minecraft.wiki's key type table](https://minecraft.wiki/w/Bedrock_Edition_level_format) disagrees on four rows. It omits 60 and shifts 61 to 63 up by one, and it flags the conflict with Microsoft's documentation while resolving it the wrong way. Mojang, Chunker and PocketMine agree against it.

### Key layout

A chunk key is `int32 LE x`, `int32 LE z`, an optional `int32 LE dimension` present only for the Nether (1) and the End (2), then the one-byte tag, then a signed one-byte sub chunk y for `SubChunkPrefix` or an 8 byte id for `JigsawStructureBlueprint`. Valid lengths are 9, 10, 13, 14 and 21 (minecraft.wiki, "Chunk key format"; Chunker `LevelDBKey.java:117-137`). Microsoft Learn writes the key as `<Chunk Position><DimensionID>` and so implies the dimension is always present. It is not.

The sub chunk y byte is signed and covers the full range. Chunker scans `for (byte y = -64; y < 64; y++)` at `BedrockColumnReader.java:279`, and minecraft.wiki warns readers "must not assume every dimension has only 16 subchunks".

### Sub chunk format versions

Version 1 (1.2.13) holds exactly one storage with no layer count byte. Version 8 (1.4) adds the layer count, which is what made waterlogging possible: layer 0 is the block, layer 1 is the fluid around it. Version 9 (1.17.30) adds a signed sub chunk y after the layer count, duplicating the byte already in the key. dragonfly's `server/world/chunk/decode.go` lines 116 to 122 states it plainly: "The index as written here isn't the actual index of the sub-chunk within the chunk. Rather, it is the Y value of the sub-chunk." dragonfly declares 9 current in `encode.go:11`.

Chunker's base reader rejects anything but 8 (`base/reader/BedrockChunkReader.java:74-80`); version 9 support lives in the 1.17.30 and later subclasses. The repository handles all three in one function.

Mojang's own description of the paletted form is [Tommaso Checchi's 1.2.13 gist](https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37), which minecraft.wiki cites and which `BlockStorage.ts:93` cites too.

### Paletted storage

One storage is a header byte of `(bitsPerIndex << 1) | isRuntime`, then `ceil(4096 / floor(32 / bits))` little-endian 32 bit words, then an int32 palette count, then that many entries. Bit widths 3, 5 and 6 leave two unused high bits in each word, and no index straddles a word. The order is XZY with y fastest: index `(x * 16 + z) * 16 + y`.

A header with `bitsPerIndex == 0` means a uniform storage: no words and no palette count field, with an implied count of 1. Chunker reads it as `int size = bitsPerEntry == 0 ? 1 : buffer.getInt()` (`PaletteUtil.java:58`); dragonfly does the same at `encoding.go:139-145`.

On disk the low bit is 0 and each entry is an NBT compound. On the network the low bit is 1, the palette count is a varint and each entry is a varint runtime id (dragonfly `encoding.go:164-192`).

### Biome palettes

`Data3D` opens with 512 bytes of heightmap, 256 int16 LE values iterated z then x (Chunker `BedrockColumnReader.java:123-133`). What follows is one paletted storage per sub chunk, bit-packed exactly like blocks, with raw int32 LE biome ids instead of NBT entries (Chunker writer `v1_17_30/writer/ColumnWriter.java:100`; dragonfly `encoding.go:42-48`).

The section count is per-dimension, not always 24. Chunker's `Dimension.java:12-14` gives 24 for the Overworld, 8 for the Nether and 16 for the End, and its writer emits `i < dimension.getBiomeHeight()` sections. The repository derives the same counts from `subChunkCount(dimension)`.

A header byte whose bit width field is 127 means "reuse the storage below", with no words and no palette following. dragonfly decodes it at `decode.go:170-174` and encodes it at `encode.go:98-101` as `0x7f << 1 | network()`, so `0xFE` on disk and `0xFF` on the network. Chunker passes `runtimeEncoding = true` for biome palettes and so writes `0xFF` on disk (`v1_17_30/writer/ColumnWriter.java:98`). Readers mask the low bit away, so both forms round-trip. Chunker does not implement inheritance at all: `PaletteUtil.readChunkPalette` returns an empty palette for width 127 and `ChunkerPaletteBasedBiomes` resolves that to a fallback biome rather than copying downward, so a vanilla world with mid-column inherit markers loses biome data through Chunker's reader. minecraft.wiki marks this area `{{info needed}}`.

### Block entities and the newer actor storage

`BlockEntity` (0x31) and the legacy `Entity` (0x32) are both a bare sequence of concatenated little-endian NBT root compounds with no count prefix, read until the buffer runs out. Chunker loops `while (fileInputStream.available() > 0)` at `BedrockColumnReader.java:191-205` and `:235-249`.

Modern actor storage splits entities out of the chunk, documented on [Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable). Two new key spaces:

- `digp` plus the chunk key, 12 bytes for the Overworld and 16 with a dimension. The value is a concatenation of 8 byte actor storage keys with no count. Microsoft's rationale: the prefix "forces all digests to be contiguous on disk and increases the size of all digest keys such that they are placed ahead of the non-actor chunk data".
- `actorprefix` plus an 8 byte id, 19 bytes. The value is one little-endian NBT root compound.

Chunker places the switchover at 1.18.30, the version whose writer first emits `digp` and `actorprefix` and whose chunk version is 40. Microsoft's page contradicts itself between adjacent paragraphs, saying "the upgrade ... in 1.18.20" and then "Before version 1.18.30, actor data was stored per chunk as a blob". A reader must handle both: Chunker falls back to the 0x32 record when no `digp` key exists (`v1_18_30/reader/ColumnReader.java:30-34`). Block entities were never moved.

### level.dat and the other world keys

`level.dat` is a file, not a LevelDB record. It is an 8 byte header, an int32 LE storage version and an int32 LE payload length, followed by one named little-endian NBT root compound with an empty name (Chunker `nbt/tags/Tag.java:52-64` for the write and `:244-257` for the read; `LevelDat.ts:33-64` here). Storage version 10 is current, and Chunker's `BedrockDataVersion.java:49-57` places the move from 9 to 10 at 1.19.40. The sibling files are `level.dat_old`, the write-temp `level.dat_new`, `levelname.txt` and `world_icon.jpeg`.

Other keys in the database, from [minecraft.wiki](https://minecraft.wiki/w/Bedrock_Edition_level_format) and its [Other data format](https://minecraft.wiki/w/Bedrock_Edition_level_format/Other_data_format) page, with payloads where a primary source gives one: `~local_player` (one NBT compound, player y carries a 1.62001 eye-height offset per Chunker `BedrockLevelReader.java:46, 422`), `player_server_<uuid>` and `legacy_console_player_` (one NBT compound each; the `Players` record is an index mapping an identity to one of these, not the data itself), `AutonomousEntities`, `BiomeData`, `Overworld`, `Nether`, `TheEnd`, `scoreboard`, `portals`, `map_<decimal id>` (Chunker builds the key as `("map_" + id).getBytes(UTF_8)`, `BedrockLevelWriter.java:348`), `structuretemplate_<name>`, `tickingarea`, `schedulerWT`, `mobevents`, `DynamicProperties`, `LevelChunkMetaDataDictionary`, `DimensionNameIdTable`, `BiomeIdsTable`, `VILLAGE_<dimension>_<uuid>_{DWELLERS,INFO,POI,PLAYERS}`, and `game_flatworldlayers`, which is not NBT but ASCII text such as `"[7,3,3,2]"`.

LevelDB options in practice: Chunker opens with `ZLIB_RAW`, a 160 KB block size, a bloom filter of 10 bits and a 400 MB write buffer (`BedrockLevelWriter.java:99-103`). PocketMine uses `LEVELDB_ZLIB_RAW_COMPRESSION` with a 64 KB block size and hard-fails without raw zlib support. Block size is a tuning choice; raw zlib is a format requirement, which is why a stock LevelDB binding cannot open a Bedrock world.

## 3. Java Anvil, and where the two formats disagree

### The Anvil region file

A `.mca` file opens with an 8 KiB header: 4096 bytes of location entries, each a 3 byte sector offset and a 1 byte sector count, then 4096 bytes of modification timestamps. Data lives in 4096 byte sectors. Each chunk starts with an int32 length and a compression byte: 1 gzip, 2 zlib, 3 uncompressed, 4 LZ4 (added in 1.20.5). Setting the high bit of the compression byte means the chunk lives in an external `c.<x>.<z>.mcc` file. Chunker implements all of this in `cli/src/main/java/com/hivemc/chunker/conversion/encoding/java/base/reader/util/MCAReader.java`, lines 47 to 67 for the header and 78 to 131 for the chunk.

A Java world directory splits data three ways per dimension: `region/` for terrain, `entities/` for entities (since 1.17), and `poi/` for points of interest. Chunker resolves all three in `JavaLevelDirectoryResolver.java` lines 81, 101 and 142. Java merges `entities/` back into the column NBT on read (`v1_17/reader/WorldReader.java:41-49`) and splits it out again on write.

### The mismatches

| Concern | Java | Bedrock |
|---|---|---|
| Height | Dimension-driven, Overworld -64 to 319 as `min_y` and `height` in the dimension type | Hardcoded per dimension id in the client: Overworld -64 to 319, Nether 0 to 127, End 0 to 255 |
| Section indexing | `yPos` per section, signed | Signed sub chunk y in the key, and again in the record at format 9 |
| Block index order | YZX. `x = i & 15`, `z = (i >> 4) & 15`, `y = (i >> 8) & 15` (Chunker `java/util/PaletteUtil.java:68-71`) | XZY. `x = (i >> 8) & 15`, `z = (i >> 4) & 15`, `y = i & 15` (Chunker `bedrock/util/PaletteUtil.java:84-87`) |
| Word size | 64 bit longs | 32 bit words |
| Minimum bits | 4 for blocks, 1 for biomes (`MINIMUM_BITS_PER_ENTRY_BLOCKS = 4`, `MINIMUM_BITS_PER_ENTRY_BIOMES = 1`) | 1 for both, and 0 for a uniform storage |
| Straddling | 1.13 format splits an entry across two longs; 1.16 and later do not (Chunker has separate `writePaletteValues1_13` and `writePaletteValues1_16`) | Never straddles, at any version |
| Palette entry | `{Name: "minecraft:oak_stairs", Properties: {facing: "north", ...}}`, all values strings; since 26.3 a bare string for the default state (Chunker `v1_18/reader/ChunkReader.java:78-87`) | `{name, states, version}`, state values typed as byte, int or string |
| Biome granularity | 4x4x4 per section, 64 cells, read with `dimensionSize = 4` (`v1_18/reader/ColumnReader.java:67`) | Per block, 4096 cells |
| Biome identity | Namespaced string through the biome registry | Numeric id, raw int32 in the palette |
| Entities | Separate `entities/` region files | `actorprefix` records plus a `digp` digest, or the legacy 0x32 record |
| Block entity id | `minecraft:chest` (Chunker `JavaBlockEntityResolver.java:48`) | `Chest`, `TrappedChest`, `EnchantTable` (Chunker `BedrockBlockEntityResolver.java:48-55`) |
| Block entity list | `block_entities` in the column NBT since 1.18, `Level.TileEntities` before | Concatenated NBT under tag 0x31 |
| Waterlogging | A `waterlogged` boolean property on the block state | A second storage layer holding water |
| Compression | gzip, zlib, raw or LZ4 per chunk inside `.mca` | Raw zlib per LevelDB table block |

Two of these are not mechanical. Waterlogging is a modeling difference, not an encoding one: Chunker carries it as a synthetic `waterlogged` state on every Bedrock block and reconstitutes the second layer on write (`BedrockBlockIdentifierResolver.java:43-49` and `BedrockChunkReader.java:92-124`). Block entity identity is worse, because Bedrock has block entities Java does not: pistons, flower pots and cauldrons. Geyser synthesizes them during chunk translation, which forces a second pass over all 4096 cells whenever a section's palette contains one (`JavaLevelChunkWithLightTranslator.java:205-219`).

The counts also differ. Chunker's dump for Java 1.21.11 has 1166 blocks and 29671 states; its dump for Bedrock 1.26.60 has 23960 states. This repository's catalog has 1477 blocks and 22079 states.

## 4. Block state identity and the Bedrock palette

### How this server assigns runtime ids

`packages/prismarine/src/block/state/BlockRuntimeIds.ts` computes a runtime id as the FNV-1a 32 bit hash of a state's `{name, states}` compound serialized as fixed-width little-endian NBT (lines 19 to 28 for the hash, 59 to 73 for the serialization, 172 to 182 for the id). `StartGamePacket.ts:274` sets the `BlockNetworkIds Are Hashes` field to 1, and the comment there states the trade directly: the alternative, an id that is a position in the client's canonical list, "would mean shipping and maintaining that exact ordered list for every client version, and would make every plugin block shift the ids of vanilla ones".

Because the hash is one-way, reading a block back needs a reverse index. `getState` builds one over every state the catalog can produce, deferred until something reads a block and rebuilt when a plugin changes the catalog (lines 157 to 170). Measured, that build takes 84 to 91 ms over 22079 states.

`StartGamePacket` writes `Server Block Type Registry Checksum` as `0n` (line 262). The repository sends a zero checksum, so the client does not validate the palette against a server-declared hash. The custom block declarations that precede it use network NBT with varint lengths, which is a different encoding from the one the hash is taken over, and `StartGamePacket.ts:236-237` says so.

### How Geyser assigns them

Geyser does the opposite and uses indexed ids. `BlockRegistryPopulator.java:196-197` comments "New since 1.16.100 - find the block runtime ID by the order given to us in the block palette, as we no longer send a block palette", and then assigns `new GeyserBedrockBlock(i, tag)` for each entry of a shipped `bedrock/block_palette.<version>.nbt`. When custom blocks are added it re-sorts the whole palette by the FNV1 64 bit hash of the block name (line 190), which is the ordering the client itself uses.

The translation table is a plain array indexed by Java state id: `GeyserBedrockBlock[] javaToBedrockBlocks` in `BlockMappings.java:54`, read by `getBedrockBlock(int javaState)` at line 88 with an out-of-range fallback to air.

### Chunker as the authoritative public mapping

Chunker is Mojang's officially documented converter: its README links to [Microsoft's Chunker overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/chunkeroverview?view=minecraft-bedrock-stable). It supports Java 1.8.8 through 26.3 and Bedrock 1.12.0 through 1.26.60. The repository is MIT licensed, "Copyright (c) 2024 Hive Games".

The mapping has three parts and only the third is data:

1. A neutral vocabulary. `ChunkerVanillaBlockType` is an enum of 1292 entries, each carrying a map color, a solidity flag, its state set and its block entity class. `VanillaBlockStates` declares 133 `BlockState` constants shared across block types. `ChunkerBlockIdentifier` is a type plus a `Map<BlockState<?>, BlockStateValue>`.
2. Two hand-written resolvers. `JavaBlockIdentifierResolver.java` is 1825 lines with roughly 750 `register(BlockMapping...)` calls; `BedrockBlockIdentifierResolver.java` is 3234 lines with roughly 701. The rules are not one-to-one: `BlockMapping.flatten` splits one legacy Bedrock name across several Chunker types by a state value, `BlockMapping.group` does the reverse, `registerDuplicateInput` and `registerDuplicateOutput` handle many-to-one in each direction. Version-specific subclasses under `v1_13` through `v1_26_60` override individual rules.
3. Generated version dumps in `cli/data/`, 51 Java versions and 58 Bedrock versions. Bedrock dumps are `block_states.json` (`{"blocks": [{"name", "states": [{"name", "type", "value"}]}]}`, 23960 entries and 14 MB for 1.26.60) and `item_names.json`. Java dumps are `blocks.json` (keyed by identifier, each with a `definition`, a `properties` map of name to allowed values, and a `states` list of `{id, properties}`), `items.json` and `version.json`, produced by running Mojang's own server data generator from `cli/data/generate_java.py`. That script's README says "By using this script you agree to any EULAs present when downloading copies of the Minecraft Java server software", which is the same licensing position GeyserMC takes: "GeyserMC does not relicense Minecraft, its data, or any other material owned by Mojang or Microsoft" (GeyserMC/mappings README; the repository is MIT).

Chunker's JSON `MappingsFile` format is a separate thing. `MappingsFile.java:19-53` describes it as user-supplied overrides passed with `-m`, built from `identifiers`, `state_lists` and `types`. It is not where the vanilla mapping lives.

### What a Java shaped server would have to produce

The whole block palette, per sub chunk, every time terrain is written or sent. For each distinct Java state in the section, produce the Bedrock `name`, the typed `states` compound and the right `version` int. The version is derivable rather than a table: Chunker computes `stateVersion = (major << 24) | (minor << 16) | (patch << 8) | statePatchSubVersion` (`BedrockDataVersion.java:116`), which for 1.21.40 sub-version 1 gives 18163713, the exact constant in `PersistentPalette.ts:16`. The rest is the 1451 hand-written rules.

## 5. The network path

### LevelChunkPacket

Mojang's [LevelChunkPacket page for 1.26.51, protocol 2193](https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-chunk-packet/) gives the wire order as `Chunk Position` (two varint32), `Dimension Id` (varint32), `Sub-chunks Count` (varuint32), `Client Request SubChunk Limit` (optional varint32, "Present only in request mode"), `Cache Enabled` (boolean), `Cache Metadata` (array of uint64 `Blob Id`, "populated only when Cache Enabled is set"), and `Serialized Chunk Data` (length-prefixed string). `packages/protocol/src/packet/LevelChunkPacket.ts:59-80` and `packages/prismarine/src/network/packet/LevelChunkPacket.ts:46-80` both implement exactly that, and both document that before protocol 2168 the count doubled as a mode flag.

The payload itself, built by `Chunk.networkSerialize` (`Chunk.ts:389-451`), is: one sub chunk record per section from the client's floor up to the highest non-empty one, then one biome storage per section of the client's full column for that dimension id (24, 8 or 16), then a border block count byte, then block entity compounds in network NBT to the end of the payload with no count. Nothing says where the payload ends except the length prefix, so a server that miscounts sections desynchronizes the client's reader.

Two details in that function are load-bearing and easy to get wrong. The padding loop at lines 406 to 408 exists because the client's floor for a dimension id is fixed regardless of what the server thinks, so a shallower dimension owes empty sections below. And the biome header at lines 430 to 431 writes `0x01` then a varint, which the comment explains: with the network flag set and zero bits per block there is no word data and no palette count, and the single value follows as a zigzag varint, so writing it unsigned would send plains as -1 and name no biome at all.

The repository's biome output is a known gap. `Chunk.ts:426-428`: "the biome is plains in every section. Real 3D biomes need the generator to decide a biome per column, which it does not do. A Bedrock Dedicated Server 1.26.51 puts 12, 30 and 182 to 190 on the wire here."

### Sub chunk requests

Mojang's [SubChunk Request System for v1.18.10](https://github.com/Mojang/bedrock-protocol-docs/blob/main/additional_docs/SubChunk%20Request%20System%20v1.18.10.md) is the primary source. The motivation is stated there: world height went from 0 to 255 up to -64 to 319, and "the terrain changes cause this approach to nearly double out network needs".

A server opts in per column by setting the sub chunk count to `0xFFFFFFFF`, or to `0xFFFFFFFF - 1` followed by a uint16 index of the highest sub chunk worth requesting, so the client never asks for known-air sections. Modern protocol encodes that as the explicit optional `Client Request SubChunk Limit`. The client then asks for sub chunks in two cases: everything within about four chunks of its own position, and anything it can see. Mojang notes requests "are non-binding"; a server may send sub chunks in its own order.

Three constraints matter for anyone building the payload. A skeleton `LevelChunkPacket` must carry no block entities, because "that data goes into the SubChunks themselves" and a mismatch between a block and its block actor causes "unexpected behavior". Each response carries a heightmap byte with 0 no data, 1 has data followed by 256 signed bytes in `[z][x]` order, 2 all too high, 3 all too low. And blob ids differ from the ones the same terrain would have in a `LevelChunkPacket`, because the sub chunk blob covers the block entities too.

The result enum is `0 Undefined, 1 Success, 2 LevelChunkDoesntExist, 3 WrongDimension, 4 PlayerDoesntExist, 5 IndexOutOfBounds, 6 SuccessAllAir`, matching `packages/protocol/src/packet/SubChunkPacket.ts:18-33`.

This server implements neither side of it. `PlayerSession.ts:445` sets `clientSubChunkRequestsEnabled = false` for every chunk, `SubChunkRequestHandler` logs and drops an incoming request, and `ClientCacheStatusHandler` notes the client's blob cache offer and declines it by never using it. `packages/protocol` has full `SubChunkPacket` and `SubChunkRequestPacket` codecs for client-side use.

### The biome definition packet

`BiomeDefinitionListPacket.ts:14-16` states the dependency: "A chunk's biome section is indices into this list, and a client that reaches the world-generation screen with an empty one cannot build the world and disconnects." The server replays a captured vanilla payload, 89 biomes over a 187-entry string list, recorded from a Bedrock Dedicated Server 1.26.51.1 by `packages/client/tools/capture-server-data.mjs` and stored as `packages/bedrock-data/src/generated/biome_definitions_network.json`. Mojang documents the packet at [biome-definition-list-packet](https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/biome-definition-list-packet/).

A Java shaped server inherits a mapping problem here. Java's biome registry is network-synced and dynamic; Bedrock's is a fixed list the client renders from. Geyser handles it with `Registries.BIOME_IDENTIFIERS` and a per-dimension fallback when a Java biome has no Bedrock equivalent, choosing `minecraft:nether_wastes`, `minecraft:the_end` or `minecraft:ocean` by dimension rather than always defaulting to ocean (`BiomeTranslator.java:76-92`).

### Translating at send time versus storing Bedrock shaped

Storing Bedrock shaped lets the send path be a memcpy of a cached buffer. `Chunk.networkSerialize` caches its output and invalidates it on a mutation counter summed from the sub chunks' revisions (`Chunk.ts:382-396`). The comment at lines 50 to 57 gives the reason: "Ten players standing in the same area used to cost ten identical serialisations of the same chunk, at ~0.3 ms each."

Translating at send time breaks that cache unless the translated form is cached separately, which is the same thing as storing Bedrock shaped, only in memory and without durability. Geyser does not cache the translated form at all; it caches the Java `DataPalette[]` per session (`ChunkCache.addToCache`) and translates once per chunk per session.

## 6. Performance and memory

All numbers below come from running this repository's built `dist` output on Node 26.12.1, darwin arm64, three times. The ranges are the spread across those three runs. The test column is 16x16 columns from y -64 to about y 72, eight block types, 9 non-empty sub chunks, 1477-block catalog loaded.

| Operation | Measured |
|---|---|
| `Chunk.networkSerialize`, cache busted | 0.075 to 0.081 ms, 18922 byte payload |
| `Chunk.networkSerialize`, cache hit | 0.21 to 0.23 us |
| `encodeSubChunk` for the whole column, disk form | 0.59 to 0.61 ms, 23130 bytes |
| `Chunk.setBlockRuntimeId`, about 19000 calls | 1.1 ms per chunk, about 58 ns per block |
| `BlockRuntimeIds.get`, memo cleared each call | 0.83 to 0.90 us |
| `BlockRuntimeIds.get`, memoised | 0.023 to 0.033 us |
| `BlockRuntimeIds.getState` first call, reverse index build | 84 to 91 ms over 22079 states |
| Retained heap per chunk, 200 chunks held | 297.3 KiB |
| Per-cell translation of one section (`Int32Array` lookup plus YZX to XZY reorder) | 3.8 to 4.0 us, 92 to 97 us per 24-section column |
| Palette-level translation of one section (16 entries) plus the same reorder | 3.6 to 5.0 us |

Four things follow.

The disk form costs about eight times the network form for the same terrain, 0.60 ms against 0.078 ms, because every palette entry is an NBT compound written through `NBTWriter` rather than a varint. That cost is paid on save, not on send.

A translation layer costs about 4 us per section, so about 95 us per 24-section column, slightly more than the 78 us the whole current serialization takes. The per-cell and palette-level variants measure the same within noise, because the YZX to XZY reorder dominates and both pay it. Geyser still prefers the palette-level path, because the thing it avoids is not the reorder but the mapping call: it does 16 lookups per section instead of 4096, and the mapping call in a real implementation is a hash or an array index plus a branch, not the single `Int32Array` read measured here. It falls back to per-cell only for the global palette (`JavaLevelChunkWithLightTranslator.java:138-161`) or when a section contains a Bedrock-only block entity.

Memory is the number that should drive the decision. 297 KiB for 9 sub chunks is about 33 KiB per sub chunk, which is 4096 JavaScript doubles: `BlockStorage.ts:7` declares `blocks` as `number[]`. A full 24-section Overworld column would retain about 786 KiB. A view distance of 12 is 625 columns, so about 480 MB of block indices per loaded region before anything else. Replacing `number[]` with `Uint16Array` would make it 8 KiB per sub chunk and 192 KiB per column, a factor of four, without touching the format. That change is available today and is independent of the Java question.

The first timed iteration of any of these is far slower than the steady state, by a factor of ten to twenty, because V8 has not yet optimized the code. An early version of this benchmark that timed the fill loop before any warmup reported 22 ms per chunk instead of 1.1 ms. Anyone repeating this should warm up and should distrust a single run.

### What Geyser measures

Nothing published. Geyser at `dd1fab33` has no JMH module, no `*Benchmark*` file and no `jmh` string in any `.kts` or `.toml`. What its code does show:

- It translates per chunk per session. `ChunkCache` stores `GeyserChunk.from(DataPalette[])`, the Java form, keyed by chunk position inside the session (`ChunkCache.java:30-41`). There is no cross-session translated payload.
- Run as a plugin on a Java server, it skips its own cache: `this.cache = !session.getGeyser().getWorldManager().hasOwnChunkCache()` with the comment "To prevent Spigot from initializing" (`ChunkCache.java:50`).
- It avoids the 4096-cell loop when it can: a `SingletonPalette` section becomes a `SingletonBitArray` with a one-entry palette and no per-cell work at all (`JavaLevelChunkWithLightTranslator.java:164-177`), and the biome translator has a fast path that checks whether all 64 Java biome cells share a palette index before building a 4096-entry `BitArray` (`BiomeTranslator.java:110-122`).
- When it cannot, the cost is real: biomes always expand 64 Java cells into 4096 Bedrock ones, four cubed each, in `multiplyIdToStorage` (`BiomeTranslator.java:170-178`).
- Its own comment on the Bedrock-only block entity scan reads `// TODO this needs a performance check when my head is clearer` (`JavaLevelChunkWithLightTranslator.java:198`).

### Typed array layouts in other JavaScript implementations

prismarine-chunk stores the packed Bedrock words directly. `src/bedrock/common/PalettedStorage.js` keeps a `Uint32Array` of `ceil(4096 / floor(32 / bitsPerBlock))` words and reads a block with two shifts and a mask (lines 15 to 72). Its `read` wraps the incoming buffer's `ArrayBuffer` with no copy (line 27), and `write` hands `Buffer.from(this.array.buffer)` straight back (line 30). It keeps the Bedrock index order, `(x << 8) | (z << 4) | y`. It supports the 1.18 3D biome format (`src/bedrock/1.18/BiomeSection.js`), the blob cache (`networkEncodeBlobs`, `ChunkColumn.js:103`) and the sub chunk request protocol (`networkEncodeSubChunkNoCache`, line 225).

deepslate does the opposite. `src/core/PalettedContainer.ts` is a plain `number[]` of size 4096 with an array palette and a linear `findIndex` on every write (lines 2 to 28), indexed `(x << 8) + (y << 4) + z`. It is a renderer and worldgen library, not a protocol one, and it never produces wire bytes.

bedrock-protocol leaves `level_chunk` payloads as bytes and leaves decoding to prismarine-chunk. This repository's `packages/protocol/src/packet/LevelChunkPacket.ts:26-32` takes the same position and says why: "a bot that is measuring a server does not need to know what is in the terrain, and the parsing is the expensive half".

### Caching strategies in use

This repository caches one serialized buffer per chunk, invalidated by a monotonically increasing mutation count summed over the sub chunks' revisions (`Chunk.ts:374-396`). The design note there is worth keeping in mind for any new cache: `getSubChunk` hands out the real mutable sub chunk, so a flag set by the two mutating methods on `Chunk` is not enough, because the cave carver writes through the sub chunk directly.

The blob cache is the protocol's own answer to the same problem and is unused here. `ClientCacheStatusHandler` records the client's offer and declines it. Adopting it would move repeated chunk bytes off the wire entirely for returning players, at the cost of implementing `ClientCacheMissResponsePacket` and keeping a blob store.

## 7. Migration

### What happens to existing worlds

Nothing, as long as the disk format stays the same. The internal model and the disk format are already separate: `PersistentPalette.runtimeIdOf` turns a palette compound into whatever the internal id scheme is, and `encodePaletteEntry` turns it back. A Java shaped internal model changes the two functions, not the bytes.

If the disk format did change, there is no upgrade path in the repository. `LevelDB.readChunk` reads any chunk whose `Version` or `LegacyVersion` record exists and makes no attempt to upgrade it, and the comment at `VanillaWorld.test.ts:30-33` records what already fails: against a 1.16 world "the packed block data matches exactly and only the palette differs: `version` is rewritten, a property that version no longer has is dropped, and a block since renamed (`minecraft:grass`, now `minecraft:grass_block`) does not resolve at all. Reading worlds older than the shipped block states needs an upgrade table, which is not implemented."

Two existing gaps would become migration problems if anything started writing them. Entities are not persisted, so there is nothing to migrate but also nothing to lose. Player data is JSON outside the database, so adopting `player_server_*` records means writing an importer or abandoning existing player state.

Three constants should be corrected before any larger change, since each one changes bytes on disk: `CHUNK_VERSION` 41 against Chunker's 42 for 1.21.120 and later, the `ChunkTag` values for 0x3c through 0x3f, and the disagreement between the catalog's declared 1.26.51 and the palette's declared 1.21.40.1.

### Converting Java worlds for testing

Chunker does this and is the only tool that does it well. Its CLI takes `-i <input> -o <output> -f <EDITION_X_Y_Z>`, for example `java -jar chunker-cli-VERSION.jar -i "my_world" -f BEDROCK_1_20_80 -o output`, needs Java 17 or higher, and accepts `-m` for custom block mappings and `-s` for world settings. Prebuilt jars are in the GitHub releases. It converts in both directions across 51 Java versions and 58 Bedrock versions.

Two caveats for test fixtures made this way. Chunker does not implement the `Data3D` copy-previous-section encoding, so a converted world's biomes are materialized per section rather than inherited, and a vanilla world read through Chunker can lose mid-column biome data. And Chunker writes biome palette headers with the runtime bit set (`0xFF` for the inherit marker, low bit set for ordinary palettes), where dragonfly writes them with the bit clear, which is what this repository also does. Readers mask the bit away, so this is a byte-exactness hazard for a round-trip test rather than a correctness one.

This repository's own round-trip test, `VanillaWorld.test.ts`, needs a fixture the repository does not ship: a 1.21.40 world at `.test/worlds/vanilla-1.21.40/` or pointed at by `JSP_VANILLA_WORLD`. Without one the whole suite skips. That is the single highest-value missing artifact for any of this work, because it is what would answer the open questions in the next section.

## 8. Recommendation

Keep storing Bedrock shaped, and keep the internal model Bedrock shaped.

| | Store Bedrock shaped (today) | Store Java shaped | Store a neutral format |
|---|---|---|---|
| What the disk holds | `SubChunkPrefix` with NBT palettes, `Data3D`, `level.dat`. A world the game opens | Anvil `.mca` region files, or Bedrock keys holding Java palettes. Neither is a world either game opens | A third encoding nothing else reads |
| Read path | Decode palette NBT, resolve through the schema. Already written, 955 lines | Decode Java palette, then map every state to Bedrock before anything can be sent | Decode, then map to Bedrock |
| Write path | 0.60 ms per 9-section column, measured | Same plus the Bedrock-to-Java direction of the mapping | Same plus two mapping directions to maintain |
| Send path | A cached buffer. 0.22 us per repeat send | About 4 us per section to translate, about 95 us per column, unless a second Bedrock-shaped cache is kept, which is the first option with extra steps | Same as Java shaped |
| Mapping to maintain | None. The catalog is a Bedrock dump, regenerated by a script | About 1451 hand-written rules in Chunker's shape, against two release trains | Same, plus a third vocabulary of 1292 types and 133 states |
| What breaks on a Minecraft release | Regenerate `block-schemas.ts`, bump `CHUNK_VERSION` and the state `version` | Both of those, plus every rule the release touches on either side | Both, plus both rule sets |
| Inspectability | Open the world in Minecraft, or in Chunker, or in any Bedrock tool | Nothing reads it | Nothing reads it |
| Existing worlds | Keep working | Need a converter nobody has written | Need a converter nobody has written |
| Proof it is right | `VanillaWorld.test.ts` re-encodes a real world's bytes and compares, once a fixture exists | No such test is possible | No such test is possible |

The argument against a Java shaped store is not performance. About 95 us per column is survivable, and Geyser survives a larger version of the same cost in production. It is maintenance. Chunker needs 1451 hand-written mapping rules plus version-specific overrides across 27 Bedrock and 20 Java version packages to keep the two editions in step. GeyserMC maintains a parallel set in `GeyserMC/mappings`, generated by a separate `mappings-generator` project. Taking on a Java shaped model means taking on a third copy of that work and keeping it correct against two release cadences, in exchange for an internal representation that no tool can inspect and no test can validate against ground truth.

The argument against a neutral format is the same argument, doubled, plus the loss of the one property that makes the current design testable: a world this server writes opens in Minecraft, and a world Minecraft writes opens here.

If a Java shaped model is adopted anyway, for instance to reuse Java worldgen or Java datapack data, the shape of the compromise is clear from Geyser. Keep the disk format exactly as it is. Put the boundary at the sub chunk palette, not at the block, so a section costs one mapping call per distinct state plus one reorder pass. Keep a per-chunk cache of the Bedrock-shaped result and key it on the same mutation counter `Chunk.networkSerialize` already uses. Expect a Bedrock-only block entity pass for pistons, flower pots and cauldrons, and expect to expand every Java biome cell into 64 Bedrock cells.

Three changes are worth making regardless of which way this goes, because none of them depends on the answer:

1. Replace `BlockStorage.blocks: number[]` with a `Uint16Array`, cutting retained chunk memory by a factor of four, from 297 KiB to about 75 KiB for the measured column.
2. Persist entities. `encodeActorKey`, `encodeDigest` and `encodeDigestKey` already exist and are tested; `writeChunk` does not call them, and `encodeActorKey` needs Chunker's `0x100000000L + (uniqueID ^ 0xFFFFFFFF00000000L)` derivation rather than a raw id.
3. Fix `CHUNK_VERSION`, the `ChunkTag` values for 0x3c to 0x3f, and the catalog-versus-palette version disagreement, and obtain the 1.21.40 world fixture so `VanillaWorld.test.ts` runs.

## Open questions

- Does vanilla set the runtime bit in a `Data3D` biome palette header on disk? Chunker writes it set, dragonfly writes it clear, this repository writes it clear. Readers mask it, so only a byte-exact comparison against a world the game wrote settles it. `VanillaWorld.test.ts` would answer this in one run with a fixture present.
- Does vanilla write `bitsPerBlock = 0` for a uniform block storage, or 1 with 128 words of zeros? The repository writes 0, Chunker writes 1. Same fixture, same test.
- Did modern actor storage ship in 1.18.20 or 1.18.30? Microsoft Learn says both in adjacent paragraphs. Chunker and PocketMine both tie it to chunk version 40, which is 1.18.30.
- Are Data2D biomes 8 bit or 16 bit after 1.21.40.23? minecraft.wiki claims 16 bit little-endian; Chunker still reads single bytes with no version override. This only matters for worlds created before 1.18.
- What is in `LevelChunkMetaDataDictionary`, and what exactly do the `Overworld`, `Nether` and `TheEnd` records hold? No primary source documents either payload. The limbo-entity reading of the dimension records is community reverse engineering.
- Does a Bedrock client reject a non-zero `Server Block Type Registry Checksum` mismatch, and does sending 0 cost anything? The repository sends 0 and works, but no source here states what the field validates.

## Reproduction

Every command below was run on 2026-10-24 from the repository root, `/Users/filiphsandstrom/.cache/claude-hfi/-Users-filiphsandstrom-JSPrismarine/oak`, on Node 26.12.1, darwin arm64.

### Read this repository's world code

```bash
wc -l packages/prismarine/src/world/providers/leveldb/*.ts \
      packages/prismarine/src/world/chunk/*.ts \
      packages/leveldb/src/*.ts
rg -n 'ChunkTag\.' packages/prismarine/src --type ts | rg -v test
rg -n 'encodeActorKey|encodeDigest|ACTOR_PREFIX' packages/prismarine/src --type ts
rg -n 'saveLevelData|playerdata|LEVEL_DATA_FILE_NAME' packages/prismarine/src --type ts
node -e "const m=require('./packages/minecraft/dist/generated/block-schemas.cjs.cjs');
const b=(m.blockSchemas||m.default.blockSchemas).blocks;
const n=Object.keys(b);let s=0;for(const k of n){let c=1;for(const p of Object.values(b[k].properties))c*=p.values.length;s+=c;}
console.log(n.length,'blocks',s,'states');"
```

### Clone the external sources

Each into its own new empty directory, read only, with no build tools run inside them.

```bash
mkdir -p /tmp/chunker-clone && cd /tmp/chunker-clone && \
  git clone --depth 1 https://github.com/HiveGamesOSS/Chunker.git
mkdir -p /tmp/jsp-ext/geyser /tmp/jsp-ext/gmappings /tmp/jsp-ext/deepslate /tmp/jsp-ext/pchunk
cd /tmp/jsp-ext/geyser    && git clone --depth 1 https://github.com/GeyserMC/Geyser.git .
cd /tmp/jsp-ext/gmappings && git clone --depth 1 https://github.com/GeyserMC/mappings.git .
cd /tmp/jsp-ext/deepslate && git clone --depth 1 https://github.com/misode/deepslate.git .
cd /tmp/jsp-ext/pchunk    && git clone --depth 1 https://github.com/PrismarineJS/prismarine-chunk.git .
```

Commits as of 2026-10-24: Chunker `50aaf6d82e8b68929279161b790d95fdddfe0a40`, Geyser `dd1fab334b5591012e9f41d1e17f50297ec51a69`, deepslate `c33b4a65f2ad474b14aab71061fbd7766b675fad`, prismarine-chunk `a08dc2c689005c9630335c289d5c34175916f21a`.

### Read Chunker

```bash
cd /tmp/chunker-clone/Chunker/cli/src/main/java/com/hivemc/chunker
cat conversion/encoding/bedrock/util/LevelDBChunkType.java
cat conversion/encoding/bedrock/util/LevelDBKey.java
sed -n 1,200p conversion/encoding/bedrock/util/PaletteUtil.java
sed -n 1,135p conversion/encoding/java/base/reader/util/MCAReader.java
sed -n 1,100p conversion/encoding/java/util/PaletteUtil.java
sed -n 1,120p conversion/encoding/bedrock/v1_18_30/writer/ColumnWriter.java
cat conversion/encoding/bedrock/v1_21_40/writer/ColumnWriter.java
cat conversion/encoding/bedrock/v1_21_120/writer/ColumnWriter.java
grep -c 'register(BlockMapping' \
  conversion/encoding/java/base/resolver/identifier/JavaBlockIdentifierResolver.java \
  conversion/encoding/bedrock/base/resolver/identifier/BedrockBlockIdentifierResolver.java
grep -n 'stateVersion =' conversion/encoding/bedrock/BedrockDataVersion.java

cd /tmp/chunker-clone/Chunker
python3 -I -c "
import json, os
b = json.load(open('cli/data/bedrock/1.26.60.0/block_states.json'))
print('bedrock 1.26.60 states', len(b['blocks']))
j = json.load(open('cli/data/java/1.21.11/blocks.json'))
print('java 1.21.11 blocks', len(j), 'states', sum(len(v['states']) for v in j.values()))
print('java versions', len(os.listdir('cli/data/java')), 'bedrock versions', len(os.listdir('cli/data/bedrock')))
"
```

### Read Geyser

```bash
cd /tmp/jsp-ext/geyser
sed -n 85,300p core/src/main/java/org/geysermc/geyser/translator/protocol/java/level/JavaLevelChunkWithLightTranslator.java
sed -n 40,180p core/src/main/java/org/geysermc/geyser/translator/level/BiomeTranslator.java
sed -n 120,250p core/src/main/java/org/geysermc/geyser/registry/populator/BlockRegistryPopulator.java
sed -n 40,110p core/src/main/java/org/geysermc/geyser/registry/type/BlockMappings.java
cat .gitmodules
grep -rin 'jmh\|benchmark' $(find . -name '*.kts' -o -name '*.toml')   # no output
```

### Fetch the Mojang documentation

```bash
mkdir -p /tmp/mojangdocs
curl -sSL -o /tmp/mojangdocs/subchunk.md \
  "https://raw.githubusercontent.com/Mojang/bedrock-protocol-docs/main/additional_docs/SubChunk%20Request%20System%20v1.18.10.md"
curl -sS -A 'Mozilla/5.0' \
  "https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-chunk-packet/"
```

The protocol pages also exist for `sub-chunk-packet`, `sub-chunk-request-packet` and `biome-definition-list-packet` under the same `1.26.51` path; all four returned 200.

### Measure this repository

The benchmark imports the already built `packages/*/dist` output, because Node 26's type stripping rejects the `enum` declarations in `packages/nbt`. A resolver hook maps `@jsprismarine/<pkg>` to that package's `dist/*.es.js`. Both scratch files live outside the repository.

```bash
mkdir -p /tmp/jsp-bench
cat > /tmp/jsp-bench/distresolve.mjs <<'EOF'
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = '/Users/filiphsandstrom/.cache/claude-hfi/-Users-filiphsandstrom-JSPrismarine/oak/packages/';
export async function resolve(specifier, context, next) {
  const m = /^@jsprismarine\/([^/]+)(?:\/(.*))?$/.exec(specifier);
  if (m) {
    const file = `${ROOT}${m[1]}/dist/${m[2] ?? 'index'}.es.js`;
    if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true, format: 'module' };
  }
  try { return await next(specifier, context); } catch (error) {
    if (!specifier.startsWith('.')) throw error;
    const base = new URL(specifier, context.parentURL);
    for (const suffix of ['.es.js', '/index.es.js', '.js']) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true, format: 'module' };
    }
    throw error;
  }
}
EOF
cat > /tmp/jsp-bench/distregister.mjs <<'EOF'
import { register } from 'node:module';
register('./distresolve.mjs', import.meta.url);
EOF
```

The benchmark builds one 16x16 column from y -64 to about y 72 out of eight block types, then times each operation after a warmup.

```bash
cat > /tmp/jsp-bench/bench.mjs <<'EOF'
const R = '/Users/filiphsandstrom/.cache/claude-hfi/-Users-filiphsandstrom-JSPrismarine/oak/packages/prismarine/dist';
const { default: Chunk } = await import(R + '/world/chunk/Chunk.es.js');
const { BlockRuntimeIds } = await import(R + '/block/state/BlockRuntimeIds.es.js');
const { encodeSubChunk } = await import(R + '/world/providers/leveldb/SubChunkCodec.es.js');
const { Dimensions } = await import(R + '/world/Dimension.es.js');

const names = ['minecraft:stone','minecraft:dirt','minecraft:grass_block','minecraft:gravel',
               'minecraft:deepslate','minecraft:water','minecraft:sand','minecraft:andesite'];
const ids = names.map((n) => BlockRuntimeIds.getByName(n));

const build = () => {
  const c = new Chunk(0, 0, new Map(), Dimensions.Overworld);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const h = 60 + ((x * 7 + z * 13) % 12);
    for (let y = -64; y <= h; y++) c.setBlockRuntimeId(x, y, z, ids[(x + y + z) & 7], 0);
  }
  return c;
};

for (let i = 0; i < 20; i++) build();                      // warm up
let t = process.hrtime.bigint();
for (let i = 0; i < 20; i++) build();
console.log(`fill: ${(Number(process.hrtime.bigint() - t) / 20 / 1e6).toFixed(2)} ms per chunk`);

const chunk = build();
const bust = () => { chunk.serialized = null; chunk.serializedAt = -1; };
for (let i = 0; i < 50; i++) { bust(); chunk.networkSerialize(); }

const N = 300;
t = process.hrtime.bigint();
for (let i = 0; i < N; i++) { bust(); chunk.networkSerialize(); }
const cold = Number(process.hrtime.bigint() - t) / N / 1e6;
bust();
const payload = chunk.networkSerialize();
console.log(`networkSerialize cold: ${cold.toFixed(3)} ms; ${payload.byteLength} bytes; ${chunk.getNetworkSubChunkCount()} sub chunks`);

t = process.hrtime.bigint();
for (let i = 0; i < N; i++) chunk.networkSerialize();
console.log(`networkSerialize cached: ${(Number(process.hrtime.bigint() - t) / N / 1e3).toFixed(2)} us`);

const subs = [...chunk.getSubChunks().entries()];
t = process.hrtime.bigint();
let bytes = 0;
for (let i = 0; i < N; i++) { bytes = 0; for (const [i2, sc] of subs) bytes += encodeSubChunk(sc, i2, 9).byteLength; }
console.log(`encodeSubChunk column: ${(Number(process.hrtime.bigint() - t) / N / 1e6).toFixed(3)} ms; ${bytes} bytes over ${subs.length} sub chunks`);

const state = BlockRuntimeIds.getState(ids[0]);
const M = 200000;
t = process.hrtime.bigint();
for (let i = 0; i < M; i++) { BlockRuntimeIds.cache.clear(); BlockRuntimeIds.get(state); }
console.log(`uncached get: ${(Number(process.hrtime.bigint() - t) / M / 1e3).toFixed(3)} us`);
t = process.hrtime.bigint();
for (let i = 0; i < M; i++) BlockRuntimeIds.get(state);
console.log(`memoised get: ${(Number(process.hrtime.bigint() - t) / M / 1e3).toFixed(4)} us`);

BlockRuntimeIds.reverseIndex = null; BlockRuntimeIds.indexedRevision = -1;
t = process.hrtime.bigint();
BlockRuntimeIds.getState(ids[0]);
console.log(`reverse index: ${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1)} ms over ${BlockRuntimeIds.reverseIndex.size} states`);

globalThis.gc?.();
const before = process.memoryUsage().heapUsed;
const kept = []; for (let i = 0; i < 200; i++) kept.push(build());
globalThis.gc?.();
console.log(`retained: ${((process.memoryUsage().heapUsed - before) / 200 / 1024).toFixed(1)} KiB per chunk (${kept[0].getSubChunks().size} sub chunks)`);

const table = new Int32Array(30000); for (let i = 0; i < table.length; i++) table[i] = (i * 2654435761) | 0;
const javaIds = new Uint16Array(4096); for (let i = 0; i < 4096; i++) javaIds[i] = i % 30;
const out = new Int32Array(4096);
const idx = (yzx) => (yzx >> 8) | (yzx & 0x0f0) | ((yzx & 0x00f) << 8);
const K = 20000;
for (let r = 0; r < 200; r++) for (let i = 0; i < 4096; i++) out[idx(i)] = table[javaIds[i]];
t = process.hrtime.bigint();
for (let r = 0; r < K; r++) for (let i = 0; i < 4096; i++) out[idx(i)] = table[javaIds[i]];
const per = Number(process.hrtime.bigint() - t) / K / 1e3;
console.log(`per-cell translate + reorder: ${per.toFixed(2)} us per section (x24 = ${(per * 24).toFixed(1)} us)`);
t = process.hrtime.bigint();
for (let r = 0; r < K; r++) { const p = new Int32Array(16); for (let i = 0; i < 16; i++) p[i] = table[i];
  for (let i = 0; i < 4096; i++) out[idx(i)] = javaIds[i]; }
console.log(`palette-level translate + reorder: ${(Number(process.hrtime.bigint() - t) / K / 1e3).toFixed(2)} us per section`);
EOF

pnpm run build   # only if packages/*/dist is stale
for i in 1 2 3; do node --expose-gc --import /tmp/jsp-bench/distregister.mjs /tmp/jsp-bench/bench.mjs; done
```

Results from three runs on 2026-10-24 are in the table in section 6.

### Run the repository's own format tests

```bash
pnpm --filter @jsprismarine/prismarine exec vitest run src/world/providers/leveldb
JSP_VANILLA_WORLD=/path/to/a/1.21.40/world \
  pnpm --filter @jsprismarine/prismarine exec vitest run src/world/providers/leveldb/VanillaWorld.test.ts
```

Without `JSP_VANILLA_WORLD` or a fixture at `.test/worlds/vanilla-1.21.40/`, `VanillaWorld.test.ts` skips every case.
