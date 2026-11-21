---
title: '@jsprismarine/prismarine world errors'
description: The code, message and meaning of every error in the world catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine world errors

These are the errors in the `world` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.world -->
## `PRISMARINE_ACTOR_IDS_EXHAUSTED`

`Could not allocate a unique actor id after 32 attempts`

Thrown as `PrismarineWorldErrors.ActorIdsExhausted`, which extends `Error`.

The world could not find an unused entity id after many tries, so the world holds far more
entities than it should.

## `PRISMARINE_AIR_NOT_REGISTERED`

`The air block state is not registered`

Thrown as `PrismarineWorldErrors.AirNotRegistered`, which extends `Error`.

The block registry has no air, so it was read before it was built. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_BIOME_ID_OUT_OF_RANGE`

`A biome id is an integer from 0 to {maxBiomeId}, got {biome}`

Thrown as `PrismarineWorldErrors.BiomeIdOutOfRange`, which extends `RangeError`.

Code stored a biome id outside the range Bedrock allows. This is a bug in the server; report
it with the stack trace.

## `PRISMARINE_BIOME_INDEX_OUT_OF_PALETTE`

`Biome palette index {paletteIndex} is out of range`

Thrown as `PrismarineWorldErrors.BiomeIndexOutOfPalette`, which extends `Error`.

A chunk's biome storage points past its palette. This is a bug in the server; report it with
the stack trace.

## `PRISMARINE_BIOME_SECTION_INHERITS_MISSING`

`A biome section inherited from a missing section`

Thrown as `PrismarineWorldErrors.BiomeSectionInheritsMissing`, which extends `Error`.

A chunk's biome section copies a section below it that does not exist. The world on disk is
damaged, or was written by a tool that writes the format differently; open it in the game to
let it repair what it can, or restore a backup.

## `PRISMARINE_BLOCK_OUT_OF_PALETTE`

`Sub chunk block refers to missing palette index {originalIndex}`

Thrown as `PrismarineWorldErrors.BlockOutOfPalette`, which extends `RangeError`.

A sub-chunk's block points past its palette. The world on disk is damaged, or was written by
a tool that writes the format differently; open it in the game to let it repair what it can,
or restore a backup.

## `PRISMARINE_BLOCK_OUTSIDE_HEIGHT_RANGE`

`Cannot place a block at y {y}: {name} spans {minY} to {maxY}`

Thrown as `PrismarineWorldErrors.BlockOutsideHeightRange`, which extends `Error`.

Code placed a block above or below the dimension's height range.

## `PRISMARINE_CHANGE_DURING_REVERT`

`Cannot {action} while a span is being reverted`

Thrown as `PrismarineWorldErrors.ChangeDuringRevert`, which extends `ChangeLogError`.

A change was recorded while another was being undone. The change log was used out of order.
This is a bug in the server; report it with the stack trace.

## `PRISMARINE_CHUNK_LOAD_AFTER_CLOSE`

`Cannot load chunk {x},{z}: world {name} has been closed`

Thrown as `PrismarineWorldErrors.ChunkLoadAfterClose`, which extends `Error`.

A chunk was asked of a world after it closed, such as a task that ran during shutdown.

## `PRISMARINE_COMPLETION_REPLACED`

`A newer completion replaced {key} before it was admitted`

Thrown as `PrismarineWorldErrors.CompletionReplaced`, which extends `Error`.

A chunk finished twice before the world took the first result. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_CONFIG_DIMENSIONS_SHARE_TYPE`

`The {first} and {second} dimensions both bind the dimension type {type}; a type backs one dimension per level`

Thrown as `PrismarineWorldErrors.ConfigDimensionsShareType`, which extends `Error`.

Two dimensions in `config.json` use the same dimension type, and each type backs one
dimension in a world. Give one of them another type.

## `PRISMARINE_CUSTOM_DIMENSION_ID_TOO_LOW`

`{javaId} has no Bedrock dimension overlay and needs a custom id of {firstCustomDimensionId} or more, got {customId}`

Thrown as `PrismarineWorldErrors.CustomDimensionIdTooLow`, which extends `RangeError`.

A custom dimension was given a Bedrock dimension id that belongs to a vanilla dimension. Give
it an id at or above the first custom id.

## `PRISMARINE_DIMENSIONS_SHARE_TYPE`

`The {earlier} and {id} stems of level {name} both bind the dimension type {type}; a type backs one dimension per level`

Thrown as `PrismarineWorldErrors.DimensionsShareType`, which extends `Error`.

Two dimensions of the world use the same dimension type, and each type backs one dimension in
a world. Give one of them another type.

## `PRISMARINE_DUPLICATE_GENERATOR_FACTORY`

`A generator factory for {kind} is already registered`

Thrown as `PrismarineWorldErrors.DuplicateGeneratorFactory`, which extends `Error`.

Two world generators were registered under the same kind.

## `PRISMARINE_EMPTY_SINGLE_BLOCK_STORAGE`

`A zero-bit storage needs its runtime id`

Thrown as `PrismarineWorldErrors.EmptySingleBlockStorage`, which extends `RangeError`.

A sub-chunk's single-block storage has no block in its palette. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_GENERATION_STOPPED`

`Chunk {cx},{cz} was not generated: the generator has stopped`

Thrown as `PrismarineWorldErrors.GenerationStopped`, which extends `Error`.

The chunk was not generated because the generator stopped, which happens while the server
shuts down.

## `PRISMARINE_INCOMPLETE_ADDED_DIMENSION`

`dimensions['{id}'] adds a dimension {preset} lacks, so it needs {missing}`

Thrown as `PrismarineWorldErrors.IncompleteAddedDimension`, which extends `Error`.

`config.json` adds a dimension the world's preset does not have, without the fields a new
dimension needs. The message names them.

## `PRISMARINE_INVALID_ACTOR_DIGEST`

`An actor digest is a whole number of 8 byte ids, got {byteLength} bytes`

Thrown as `PrismarineWorldErrors.InvalidActorDigest`, which extends `RangeError`.

A chunk's list of entities is not a whole number of entity ids. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_INVALID_ACTOR_ID`

`An actor id is 8 bytes, got {byteLength}`

Thrown as `PrismarineWorldErrors.InvalidActorId`, which extends `RangeError`.

An entity id written to the world is not 8 bytes. This is a bug in the server; report it with
the stack trace.

## `PRISMARINE_INVALID_ACTOR_MIGRATION`

`Pending actor migration data is not an array`

Thrown as `PrismarineWorldErrors.InvalidActorMigration`, which extends `Error`.

The world's pending entity migration record is damaged. Restore the world from a backup taken
before the error.

## `PRISMARINE_INVALID_BIOME_PALETTE_COUNT`

`Biome palette declares {uniformSize} entries`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteCount`, which extends `Error`.

A chunk's biome data declares an impossible number of biomes. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_INVALID_BIOME_PALETTE_SIZE`

`Invalid biome palette size {paletteSize}`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteSize`, which extends `Error`.

Biome data holds an impossible number of biomes. The world on disk is damaged, or was written
by a tool that writes the format differently; open it in the game to let it repair what it
can, or restore a backup.

## `PRISMARINE_INVALID_BIOME_PALETTE_WIDTH`

`Biome palette declares {bitsPerBlock} bits per block`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteWidth`, which extends `Error`.

A chunk's biome data declares a storage width Bedrock does not use. The world on disk is
damaged, or was written by a tool that writes the format differently; open it in the game to
let it repair what it can, or restore a backup.

## `PRISMARINE_INVALID_LEGACY_WORLD_GEN_SETTINGS`

`worldGenSettings needs a seed string and a dimensions object`

Thrown as `PrismarineWorldErrors.InvalidLegacyWorldGenSettings`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed generation settings. Restore
it from a backup taken before the error.

## `PRISMARINE_INVALID_LEVEL_NAME`

`Invalid level-name`

Thrown as `PrismarineWorldErrors.InvalidLevelName`, which extends `Error`.

`level-name` in `config.json` is empty or names no world in `worlds`. Set it to one of the
worlds.

## `PRISMARINE_INVALID_MINECRAFT_CATALOG_VERSION`

`Invalid Minecraft catalog version: {minecraftVersion}`

Thrown as `PrismarineWorldErrors.InvalidMinecraftCatalogVersion`, which extends `Error`.

The block catalog's Minecraft version is not a version number. The generated block data is
damaged; regenerate it.

## `PRISMARINE_INVALID_REPLAY_SNAPSHOT_ENTRY`

`Invalid LevelDB replay snapshot entry`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotEntry`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

## `PRISMARINE_INVALID_REPLAY_SNAPSHOT_FILES`

`Invalid LevelDB replay snapshot files`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotFiles`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

## `PRISMARINE_INVALID_REPLAY_SNAPSHOT_JSON`

`Invalid LevelDB replay snapshot JSON`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotJson`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

## `PRISMARINE_INVALID_REPLAY_SNAPSHOT_LEVEL_DAT`

`Invalid LevelDB replay snapshot level.dat`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotLevelDat`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

## `PRISMARINE_INVALID_REPLAY_SNAPSHOT_PLAYER_DATA`

`Invalid LevelDB replay snapshot player data`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotPlayerData`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

## `PRISMARINE_INVALID_SUB_CHUNK_PALETTE_SIZE`

`Sub chunk storage declares a palette of {paletteSize} entries`

Thrown as `PrismarineWorldErrors.InvalidSubChunkPaletteSize`, which extends `Error`.

A sub-chunk declares an impossible number of palette entries. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_INVALID_SUB_CHUNK_WIDTH`

`Sub chunk storage declares {bitsPerBlock} bits per block`

Thrown as `PrismarineWorldErrors.InvalidSubChunkWidth`, which extends `Error`.

A sub-chunk declares a storage width Bedrock does not use. The world on disk is damaged, or
was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_INVALID_SUBCHUNK_HEIGHT`

`Invalid subchunk height: {y}`

Thrown as `PrismarineWorldErrors.InvalidSubchunkHeight`, which extends `RangeError`.

Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_INVALID_WORLD_CONFIG`

`Invalid world data`

Thrown as `PrismarineWorldErrors.InvalidWorldConfig`, which extends `Error`.

A world's entry in `config.json` is not an object with the fields a world needs.

## `PRISMARINE_JAVA_DATA_DOWNGRADE`

`the world {level} was saved with Java data version {stored}, newer than Java {release} ({dataVersion}); run that release or a newer one`

Thrown as `PrismarineWorldErrors.JavaDataDowngrade`, which extends `Error`.

The world's `level.dat` records a Java data version newer than the one the server runs, so
an older Java release would read chunks and data written by a newer one. Java has no
downgrade path, and neither does the server. Run the release the world was saved with, by
setting `content-java-version`, or start the server on another world.

## `PRISMARINE_LEGACY_ENTITY_SNAPSHOTS_ARE_INVALID`

`Legacy entity snapshots are invalid`

Thrown as `PrismarineWorldErrors.LegacyEntitySnapshotsAreInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_ENTITY_SNAPSHOTS_CONTAIN_INVALID_ENTRIES`

`Legacy entity snapshots contain invalid entries`

Thrown as `PrismarineWorldErrors.LegacyEntitySnapshotsContainInvalidEntries`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_GAME_RULES_ARE_INVALID`

`Legacy game rules are invalid`

Thrown as `PrismarineWorldErrors.LegacyGameRulesAreInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_GAME_RULES_CONTAIN_INVALID_ENTRIES`

`Legacy game rules contain invalid entries`

Thrown as `PrismarineWorldErrors.LegacyGameRulesContainInvalidEntries`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_SPAWN_POSITION_IS_INVALID`

`Legacy spawn position is invalid`

Thrown as `PrismarineWorldErrors.LegacySpawnPositionIsInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_WEATHER_IS_INVALID`

`Legacy weather is invalid`

Thrown as `PrismarineWorldErrors.LegacyWeatherIsInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEGACY_WORLD_DATA_MUST_BE_OBJECT`

`Legacy world data must be an object`

Thrown as `PrismarineWorldErrors.LegacyWorldDataMustBeObject`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

## `PRISMARINE_LEVEL_DAT_SIZE_MISMATCH`

`level.dat declares {declared} bytes of payload but carries {byteLength}`

Thrown as `PrismarineWorldErrors.LevelDatSizeMismatch`, which extends `Error`.

The world's `level.dat` is shorter or longer than its header says, so it was cut short or
edited. Restore it from `level.dat_old` or a backup.

## `PRISMARINE_LEVEL_DAT_TRUNCATED`

`level.dat is {byteLength} bytes, the header alone is {headerBytes}`

Thrown as `PrismarineWorldErrors.LevelDatTruncated`, which extends `Error`.

The world's `level.dat` is shorter than its header, so it was cut short. Restore it from
`level.dat_old` or a backup.

## `PRISMARINE_LEVEL_HAS_NO_OVERWORLD`

`Level {name} has no {overworldStemId} stem; Bedrock's spawn and clock live there`

Thrown as `PrismarineWorldErrors.LevelHasNoOverworld`, which extends `Error`.

The world has no overworld, where Bedrock keeps the spawn point and the clock. Add one to its
dimensions.

## `PRISMARINE_LEVEL_NOT_OPENED`

`Level {name} is not enabled, so it cannot build {dimensionId}`

Thrown as `PrismarineWorldErrors.LevelNotOpened`, which extends `Error`.

A dimension was built before its world was opened. This is a bug in the server; report it
with the stack trace.

## `PRISMARINE_LEVEL_WITHOUT_OVERWORLD`

`Level {defaultName} built no {overworldStemId} world`

Thrown as `PrismarineWorldErrors.LevelWithoutOverworld`, which extends `Error`.

The world loaded without an overworld, which every world needs. Check its dimensions in
`config.json`.

## `PRISMARINE_LOWEST_BIOME_SECTION_INHERITS`

`The first biome section cannot inherit from below`

Thrown as `PrismarineWorldErrors.LowestBiomeSectionInherits`, which extends `Error`.

A chunk's lowest biome section claims to copy the one below it. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

## `PRISMARINE_MISSING_BIOME_PALETTE_HEADER`

`Expected a network biome palette header, got {header}`

Thrown as `PrismarineWorldErrors.MissingBiomePaletteHeader`, which extends `Error`.

Biome data being read for the network does not start with a palette header. This is a bug in
the server; report it with the stack trace.

## `PRISMARINE_NO_OPEN_TICK`

`Cannot {action} a tick: none is open`

Thrown as `PrismarineWorldErrors.NoOpenTick`, which extends `ChangeLogError`.

A change was recorded outside any tick. The change log was used out of order. This is a bug
in the server; report it with the stack trace.

## `PRISMARINE_NO_WORLD_IN_DIMENSION`

`no {dimension} world is loaded, so it cannot be read or written`

Thrown as `PrismarineWorldErrors.NoWorldInDimension`, which extends `Error`.

Content acted in a dimension that has no loaded world.

## `PRISMARINE_PLAYER_DATA_PATH_ESCAPES`

`Player data for {key} would leave {folder}`

Thrown as `PrismarineWorldErrors.PlayerDataPathEscapes`, which extends `Error`.

A player's data file name would resolve outside the player data folder, so it is refused.

## `PRISMARINE_PLAYER_DATA_PATH_NOT_FOLDER`

`Cannot restore replay player data into a non-directory path`

Thrown as `PrismarineWorldErrors.PlayerDataPathNotFolder`, which extends `Error`.

Restoring a replay found a file where the player data folder belongs. Remove it and run the
replay again.

## `PRISMARINE_PLAYER_DATA_SAVE_AFTER_CLOSE`

`Cannot save replay player data for {key} after level {levelName} closed`

Thrown as `PrismarineWorldErrors.PlayerDataSaveAfterClose`, which extends `Error`.

A player's data was saved after the world closed, such as a player who left during shutdown.

## `PRISMARINE_POSITION_WITHOUT_WORLD`

`A Position requires the world it is in`

Thrown as `PrismarineWorldErrors.PositionWithoutWorld`, which extends `Error`.

A position was created without its world. This is a bug in the server; report it with the
stack trace.

## `PRISMARINE_PROVIDER_CANNOT_CAPTURE_REPLAY`

`Provider '{name}' cannot capture replay snapshots`

Thrown as `PrismarineWorldErrors.ProviderCannotCaptureReplay`, which extends `Error`.

The world storage provider cannot capture the snapshot a replay starts from. Record replays
with a provider that can.

## `PRISMARINE_REPLAY_LEVEL_MISMATCH`

`Replay manifest does not match this level's current initial state`

Thrown as `PrismarineWorldErrors.ReplayLevelMismatch`, which extends `Error`.

A replay was started on a world whose dimensions or settings differ from the recording's.

## `PRISMARINE_RESTORE_INTO_OPEN_WORLD`

`Cannot restore a replay snapshot while the LevelDB provider is enabled`

Thrown as `PrismarineWorldErrors.RestoreIntoOpenWorld`, which extends `Error`.

A replay snapshot was restored into a world that is open. Restore it before the world opens.

## `PRISMARINE_REVERT_CLOSED_SPAN`

`Only an open span can be reverted`

Thrown as `PrismarineWorldErrors.RevertClosedSpan`, which extends `ChangeLogError`.

A change span was undone after it closed. The change log was used out of order. This is a bug
in the server; report it with the stack trace.

## `PRISMARINE_REVERT_PAST_CHUNK_ENTRY`

`Cannot revert a span past the chunk entry at tick {tick}, sequence {sequence}`

Thrown as `PrismarineWorldErrors.RevertPastChunkEntry`, which extends `ChangeLogError`.

A change could not be undone because the chunk it touched was unloaded since. This is a bug
in the server; report it with the stack trace.

## `PRISMARINE_RUNTIME_ID_STORAGE_ON_DISK`

`Sub chunk storage is marked as holding runtime ids, which never appears on disk`

Thrown as `PrismarineWorldErrors.RuntimeIdStorageOnDisk`, which extends `Error`.

A sub-chunk on disk uses the network form of block storage, which the game never saves. The
world on disk is damaged, or was written by a tool that writes the format differently; open
it in the game to let it repair what it can, or restore a backup.

## `PRISMARINE_SAVE_PASS_COMMITTED`

`This save pass has already committed`

Thrown as `PrismarineWorldErrors.SavePassCommitted`, which extends `Error`.

A world save was written to after it finished. This is a bug in the server; report it with
the stack trace.

## `PRISMARINE_SAVED_BIOME_OUT_OF_PALETTE`

`Biome {i} refers to palette entry {paletteIndex} of {paletteSize}`

Thrown as `PrismarineWorldErrors.SavedBiomeOutOfPalette`, which extends `Error`.

A chunk's biome data points past its palette. The world on disk is damaged, or was written by
a tool that writes the format differently; open it in the game to let it repair what it can,
or restore a backup.

## `PRISMARINE_SAVED_BLOCK_OUT_OF_PALETTE`

`Block {index} refers to palette entry {paletteIndex} of {paletteSize}`

Thrown as `PrismarineWorldErrors.SavedBlockOutOfPalette`, which extends `Error`.

A sub-chunk's block data points past its palette. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

## `PRISMARINE_SEAL_WITH_OPEN_SPANS`

`Cannot seal tick {tick}: {spansCount} span(s) still open`

Thrown as `PrismarineWorldErrors.SealWithOpenSpans`, which extends `ChangeLogError`.

A tick ended while some of its changes were still being recorded. The change log was used out
of order. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_SECOND_LAYER_IN_VERSION_ONE`

`Sub chunk version 1 holds a single layer, so a second one would be lost`

Thrown as `PrismarineWorldErrors.SecondLayerInVersionOne`, which extends `Error`.

A sub-chunk with a second block layer, such as waterlogged blocks, was saved in a format that
holds one. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_SPAN_CLOSED_OUT_OF_ORDER`

`Only the innermost open span can be closed`

Thrown as `PrismarineWorldErrors.SpanClosedOutOfOrder`, which extends `ChangeLogError`.

A change span was closed before the spans opened inside it. The change log was used out of
order. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_SPAWN_NOT_FOUND_YET`

`the {dimension} world has not found its spawn point yet`

Thrown as `PrismarineWorldErrors.SpawnNotFoundYet`, which extends `Error`.

Content asked for the spawn point before the world finished finding one, such as right after
it was created.

## `PRISMARINE_SUB_CHUNK_BIOME_COUNT_MISMATCH`

`A sub chunk holds {blocksPerSubchunk} biomes, got {idsCount}`

Thrown as `PrismarineWorldErrors.SubChunkBiomeCountMismatch`, which extends `RangeError`.

A sub-chunk's biomes were set from a list of the wrong length. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_SUB_CHUNK_OUT_OF_RANGE`

`Invalid subchunk height: {y}`

Thrown as `PrismarineWorldErrors.SubChunkOutOfRange`, which extends `Error`.

Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_SUB_CHUNK_PALETTE_FULL`

`A sub chunk palette holds at most {maxPaletteSize} entries`

Thrown as `PrismarineWorldErrors.SubChunkPaletteFull`, which extends `RangeError`.

A sub-chunk would hold more different blocks than one sub-chunk can. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_TICK_IS_STILL_OPEN`

`Tick {tick} is still open`

Thrown as `PrismarineWorldErrors.TickIsStillOpen`, which extends `ChangeLogError`.

A tick began while the previous one was still open. The change log was used out of order.
This is a bug in the server; report it with the stack trace.

## `PRISMARINE_TICK_OUT_OF_SEQUENCE`

`Tick {tick} does not follow tick {lastBegun}`

Thrown as `PrismarineWorldErrors.TickOutOfSequence`, which extends `ChangeLogError`.

A tick began that is not the one after the last. The change log was used out of order. This
is a bug in the server; report it with the stack trace.

## `PRISMARINE_TICK_SEALED`

`Cannot {action} tick {lastBegun}: it is sealed`

Thrown as `PrismarineWorldErrors.TickSealed`, which extends `ChangeLogError`.

A change was recorded into a tick that had already ended. The change log was used out of
order. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_UNCAPTURABLE_PLAYER_DATA_ENTRY`

`Cannot capture unsupported replay player data entry '{name}'`

Thrown as `PrismarineWorldErrors.UncapturablePlayerDataEntry`, which extends `Error`.

The player data folder holds a file the replay snapshot cannot capture, such as a folder or a
link. Remove it before recording.

## `PRISMARINE_UNDO_IN_UNLOADED_CHUNK`

`Cannot undo the {field} at {x}, {y}, {z}: its chunk left`

Thrown as `PrismarineWorldErrors.UndoInUnloadedChunk`, which extends `Error`.

A change could not be undone because its chunk was unloaded since. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_UNKNOWN_BLOCK`

`No block state schema registered for {name}`

Thrown as `PrismarineWorldErrors.UnknownBlock`, which extends `Error`.

Code asked for the states of a block the registry does not have, usually a block a plugin or
pack added that is no longer loaded.

## `PRISMARINE_UNKNOWN_BLOCK_STATE`

`No block state registered for {name} with {states}`

Thrown as `PrismarineWorldErrors.UnknownBlockState`, which extends `Error`.

Code set a block in a state the block registry does not have.

## `PRISMARINE_UNKNOWN_CATALOG_BLOCK`

`this server's block catalog has no {identifier} in state {states}`

Thrown as `PrismarineWorldErrors.UnknownCatalogBlock`, which extends `Error`.

Content placed a block in a state the server's block catalog does not have, usually a pack
that names a state of a newer Minecraft.

## `PRISMARINE_UNKNOWN_CONFIG_DIMENSION_TYPE`

`The {id} dimension names the dimension type {type}, which no pack defines`

Thrown as `PrismarineWorldErrors.UnknownConfigDimensionType`, which extends `Error`.

A dimension in `config.json` names a dimension type no loaded pack defines. Check the name,
or load the datapack that defines it.

## `PRISMARINE_UNKNOWN_DIMENSION_TYPE`

`The {id} stem of level {name} names the dimension type {type}, which is not loaded`

Thrown as `PrismarineWorldErrors.UnknownDimensionType`, which extends `Error`.

A dimension names a dimension type no loaded pack defines. Check the name, or load the
datapack that defines it.

## `PRISMARINE_UNKNOWN_GENERATED_BLOCK`

`invalid block with id {name}`

Thrown as `PrismarineWorldErrors.UnknownGeneratedBlock`, which extends `Error`.

A world generator placed a block the server's content does not define. Check the generator's
settings and the loaded packs.

## `PRISMARINE_UNKNOWN_GENERATOR_KIND`

`Unknown generator kind {kind}. Registered kinds: {kinds}`

Thrown as `PrismarineWorldErrors.UnknownGeneratorKind`, which extends `Error`.

A world names a generator nothing registered. The message lists the ones that are.

## `PRISMARINE_UNKNOWN_LEVEL_DIMENSION`

`Level {name} has no {dimensionId} dimension. It has: {stems}`

Thrown as `PrismarineWorldErrors.UnknownLevelDimension`, which extends `Error`.

Code asked for a dimension the world does not have. The message lists the ones it has.

## `PRISMARINE_UNKNOWN_RUNTIME_ID`

`Chunk holds runtime id {runtimeId}, which no registered block produces`

Thrown as `PrismarineWorldErrors.UnknownRuntimeId`, which extends `Error`.

A loaded chunk holds a block id no registered block has. This is a bug in the server; report
it with the stack trace.

## `PRISMARINE_UNKNOWN_SAVED_BLOCK`

`No block named {name}, held at {x} {y} {z} in world {name2}`

Thrown as `PrismarineWorldErrors.UnknownSavedBlock`, which extends `Error`.

The world holds a block the server's content does not define, usually one a plugin or pack
added that is no longer loaded. Load it again, or remove the block.

## `PRISMARINE_UNKNOWN_SCOREBOARD_PARTICIPANT`

`No scoreboard participant has the id {participant}`

Thrown as `PrismarineWorldErrors.UnknownScoreboardParticipant`, which extends `RangeError`.

Code asked the scoreboard for a participant by an id the scoreboard never gave out, or one it
has since removed. Look a participant up by its entity or fake player name instead, or check
that the id came from this world's scoreboard.

## `PRISMARINE_UNKNOWN_WORLD_PRESET`

`Unknown world preset {preset}. Known presets: {presets}`

Thrown as `PrismarineWorldErrors.UnknownWorldPreset`, which extends `Error`.

A world in `config.json` names a preset that does not exist. The message lists the ones that
do.

## `PRISMARINE_UNKNOWN_WORLD_PROVIDER`

`Unknown world provider '{provider}' for world '{folderName}'. Available providers: {providers}.`

Thrown as `PrismarineWorldErrors.UnknownWorldProvider`, which extends `Error`.

A world in `config.json` names a storage provider that does not exist. The message lists the
ones that do.

## `PRISMARINE_UNMOVABLE_BLOCK`

`this server's block catalog cannot move {name} at {x}, {y}, {z}`

Thrown as `PrismarineWorldErrors.UnmovableBlock`, which extends `Error`.

Content tried to move a block, such as with a piston, that the block catalog cannot represent
as moving.

## `PRISMARINE_UNNAMED_PALETTE_ENTRY`

`Palette entry has no name`

Thrown as `PrismarineWorldErrors.UnnamedPaletteEntry`, which extends `Error`.

A sub-chunk's palette has a block without a name. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

## `PRISMARINE_UNRESOLVED_DIMENSION_TYPE`

`The {dimensionId} stem of level {name} has no resolved type`

Thrown as `PrismarineWorldErrors.UnresolvedDimensionType`, which extends `Error`.

A dimension was built before its dimension type was loaded. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_UNSAVABLE_RUNTIME_ID`

`Cannot write runtime id {runtimeId}: no registered block produces it`

Thrown as `PrismarineWorldErrors.UnsavableRuntimeId`, which extends `Error`.

A chunk holds a block id no registered block has, so it cannot be saved. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_UNSUPPORTED_BIOME_PALETTE_WIDTH`

`Unsupported biome palette width {bitsPerBlock}`

Thrown as `PrismarineWorldErrors.UnsupportedBiomePaletteWidth`, which extends `Error`.

Biome data uses a storage width Bedrock does not use. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

## `PRISMARINE_UNSUPPORTED_REPLAY_SNAPSHOT`

`Unsupported or invalid LevelDB replay snapshot`

Thrown as `PrismarineWorldErrors.UnsupportedReplaySnapshot`, which extends `TypeError`.

A replay's world snapshot was written by a different version of the server, or is damaged.

## `PRISMARINE_UNSUPPORTED_SUB_CHUNK_VERSION`

`Unsupported sub chunk version {version}`

Thrown as `PrismarineWorldErrors.UnsupportedSubChunkVersion`, which extends `Error`.

A sub-chunk uses a format version this server does not read, such as one from a much older or
newer game.

## `PRISMARINE_WORLD_ALREADY_LOADED`

`World {folderName} has already been loaded`

Thrown as `PrismarineWorldErrors.WorldAlreadyLoaded`, which extends `Error`.

A world was loaded twice.

## `PRISMARINE_WORLD_MESSAGES_UNSETTLED`

`{pendingCount} world message(s) were still being filed after {drainPasses} passes`

Thrown as `PrismarineWorldErrors.WorldMessagesUnsettled`, which extends `Error`.

Messages between parts of the world kept producing more, so a tick never settled. This is a
bug in the server; report it with the stack trace.

## `PRISMARINE_WORLD_STORAGE_CLOSED`

`The world provider is not enabled`

Thrown as `PrismarineWorldErrors.WorldStorageClosed`, which extends `Error`.

The world's storage was used before it opened or after it closed.
<!-- /fact -->
