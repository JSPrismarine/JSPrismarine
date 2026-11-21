import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** A change log was used out of order, such as appending to a tick that is already sealed. */
export abstract class ChangeLogError extends JSPrismarineError {
    public override name = 'ChangeLogError';
}

/** The errors the world code of `@jsprismarine/prismarine` throws. */
export const PrismarineWorldErrors = defineErrors('prismarine/world', {
    /**
     * A chunk's list of entities is not a whole number of entity ids. The world on disk is damaged,
     * or was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    InvalidActorDigest: {
        message: 'An actor digest is a whole number of 8 byte ids, got {byteLength} bytes',
        base: RangeError
    },
    /**
     * An entity id written to the world is not 8 bytes. This is a bug in the server; report it with
     * the stack trace.
     */
    InvalidActorId: { message: 'An actor id is 8 bytes, got {byteLength}', base: RangeError },
    /**
     * The block registry has no air, so it was read before it was built. This is a bug in the
     * server; report it with the stack trace.
     */
    AirNotRegistered: 'The air block state is not registered',
    /**
     * Two dimensions in `config.json` use the same dimension type, and each type backs one
     * dimension in a world. Give one of them another type.
     */
    ConfigDimensionsShareType:
        'The {first} and {second} dimensions both bind the dimension type {type}; a type backs one dimension per level',
    /**
     * Two dimensions of the world use the same dimension type, and each type backs one dimension in
     * a world. Give one of them another type.
     */
    DimensionsShareType:
        'The {earlier} and {id} stems of level {name} both bind the dimension type {type}; a type backs one dimension per level',
    /**
     * Code stored a biome id outside the range Bedrock allows. This is a bug in the server; report
     * it with the stack trace.
     */
    BiomeIdOutOfRange: {
        message: 'A biome id is an integer from 0 to {maxBiomeId}, got {biome}',
        base: RangeError
    },
    /**
     * A chunk's biome data declares a storage width Bedrock does not use. The world on disk is
     * damaged, or was written by a tool that writes the format differently; open it in the game to
     * let it repair what it can, or restore a backup.
     */
    InvalidBiomePaletteWidth: 'Biome palette declares {bitsPerBlock} bits per block',
    /**
     * A chunk's biome data declares an impossible number of biomes. The world on disk is damaged,
     * or was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    InvalidBiomePaletteCount: 'Biome palette declares {uniformSize} entries',
    /**
     * A chunk's biome storage points past its palette. This is a bug in the server; report it with
     * the stack trace.
     */
    BiomeIndexOutOfPalette: 'Biome palette index {paletteIndex} is out of range',
    /**
     * A chunk's biome data points past its palette. The world on disk is damaged, or was written by
     * a tool that writes the format differently; open it in the game to let it repair what it can,
     * or restore a backup.
     */
    SavedBiomeOutOfPalette: 'Biome {i} refers to palette entry {paletteIndex} of {paletteSize}',
    /**
     * A chunk's biome section copies a section below it that does not exist. The world on disk is
     * damaged, or was written by a tool that writes the format differently; open it in the game to
     * let it repair what it can, or restore a backup.
     */
    BiomeSectionInheritsMissing: 'A biome section inherited from a missing section',
    /**
     * A sub-chunk's block data points past its palette. The world on disk is damaged, or was
     * written by a tool that writes the format differently; open it in the game to let it repair
     * what it can, or restore a backup.
     */
    SavedBlockOutOfPalette: 'Block {index} refers to palette entry {paletteIndex} of {paletteSize}',
    /**
     * The player data folder holds a file the replay snapshot cannot capture, such as a folder or a
     * link. Remove it before recording.
     */
    UncapturablePlayerDataEntry: "Cannot capture unsupported replay player data entry '{name}'",
    /** A chunk was asked of a world after it closed, such as a task that ran during shutdown. */
    ChunkLoadAfterClose: 'Cannot load chunk {x},{z}: world {name} has been closed',
    /** Code placed a block above or below the dimension's height range. */
    BlockOutsideHeightRange: 'Cannot place a block at y {y}: {name} spans {minY} to {maxY}',
    /**
     * Restoring a replay found a file where the player data folder belongs. Remove it and run the
     * replay again.
     */
    PlayerDataPathNotFolder: 'Cannot restore replay player data into a non-directory path',
    /**
     * A replay snapshot was restored into a world that is open. Restore it before the world opens.
     */
    RestoreIntoOpenWorld: 'Cannot restore a replay snapshot while the LevelDB provider is enabled',
    /**
     * A change could not be undone because the chunk it touched was unloaded since. This is a bug
     * in the server; report it with the stack trace.
     */
    RevertPastChunkEntry: {
        message: 'Cannot revert a span past the chunk entry at tick {tick}, sequence {sequence}',
        base: ChangeLogError
    },
    /**
     * A player's data was saved after the world closed, such as a player who left during shutdown.
     */
    PlayerDataSaveAfterClose: 'Cannot save replay player data for {key} after level {levelName} closed',
    /**
     * A tick ended while some of its changes were still being recorded. The change log was used out
     * of order. This is a bug in the server; report it with the stack trace.
     */
    SealWithOpenSpans: {
        message: 'Cannot seal tick {tick}: {spansCount} span(s) still open',
        base: ChangeLogError
    },
    /**
     * A change was recorded into a tick that had already ended. The change log was used out of
     * order. This is a bug in the server; report it with the stack trace.
     */
    TickSealed: { message: 'Cannot {action} tick {lastBegun}: it is sealed', base: ChangeLogError },
    /**
     * A change was recorded outside any tick. The change log was used out of order. This is a bug
     * in the server; report it with the stack trace.
     */
    NoOpenTick: { message: 'Cannot {action} a tick: none is open', base: ChangeLogError },
    /**
     * A change could not be undone because its chunk was unloaded since. This is a bug in the
     * server; report it with the stack trace.
     */
    UndoInUnloadedChunk: 'Cannot undo the {field} at {x}, {y}, {z}: its chunk left',
    /**
     * A change was recorded while another was being undone. The change log was used out of order.
     * This is a bug in the server; report it with the stack trace.
     */
    ChangeDuringRevert: { message: 'Cannot {action} while a span is being reverted', base: ChangeLogError },
    /**
     * A chunk holds a block id no registered block has, so it cannot be saved. This is a bug in the
     * server; report it with the stack trace.
     */
    UnsavableRuntimeId: 'Cannot write runtime id {runtimeId}: no registered block produces it',
    /**
     * A loaded chunk holds a block id no registered block has. This is a bug in the server; report
     * it with the stack trace.
     */
    UnknownRuntimeId: 'Chunk holds runtime id {runtimeId}, which no registered block produces',
    /**
     * The world could not find an unused entity id after many tries, so the world holds far more
     * entities than it should.
     */
    ActorIdsExhausted: 'Could not allocate a unique actor id after 32 attempts',
    /**
     * A dimension in `config.json` names a dimension type no loaded pack defines. Check the name,
     * or load the datapack that defines it.
     */
    UnknownConfigDimensionType: 'The {id} dimension names the dimension type {type}, which no pack defines',
    /**
     * `config.json` adds a dimension the world's preset does not have, without the fields a new
     * dimension needs. The message names them.
     */
    IncompleteAddedDimension: "dimensions['{id}'] adds a dimension {preset} lacks, so it needs {missing}",
    /**
     * Biome data being read for the network does not start with a palette header. This is a bug in
     * the server; report it with the stack trace.
     */
    MissingBiomePaletteHeader: 'Expected a network biome palette header, got {header}',
    /**
     * A chunk's lowest biome section claims to copy the one below it. The world on disk is damaged,
     * or was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    LowestBiomeSectionInherits: 'The first biome section cannot inherit from below',
    /** Two world generators were registered under the same kind. */
    DuplicateGeneratorFactory: 'A generator factory for {kind} is already registered',
    /**
     * A custom dimension was given a Bedrock dimension id that belongs to a vanilla dimension. Give
     * it an id at or above the first custom id.
     */
    CustomDimensionIdTooLow: {
        message:
            '{javaId} has no Bedrock dimension overlay and needs a custom id of {firstCustomDimensionId} or more, got {customId}',
        base: RangeError
    },
    /**
     * Biome data holds an impossible number of biomes. The world on disk is damaged, or was written
     * by a tool that writes the format differently; open it in the game to let it repair what it
     * can, or restore a backup.
     */
    InvalidBiomePaletteSize: 'Invalid biome palette size {paletteSize}',
    /**
     * A world generator placed a block the server's content does not define. Check the generator's
     * settings and the loaded packs.
     */
    UnknownGeneratedBlock: 'invalid block with id {name}',
    /**
     * `level-name` in `config.json` is empty or names no world in `worlds`. Set it to one of the
     * worlds.
     */
    InvalidLevelName: 'Invalid level-name',
    /**
     * A replay's world snapshot does not have the shape the server writes, so the replay is
     * damaged.
     */
    InvalidReplaySnapshotEntry: { message: 'Invalid LevelDB replay snapshot entry', base: TypeError },
    /**
     * A replay's world snapshot does not have the shape the server writes, so the replay is
     * damaged.
     */
    InvalidReplaySnapshotFiles: { message: 'Invalid LevelDB replay snapshot files', base: TypeError },
    /**
     * A replay's world snapshot does not have the shape the server writes, so the replay is
     * damaged.
     */
    InvalidReplaySnapshotJson: { message: 'Invalid LevelDB replay snapshot JSON', base: TypeError },
    /**
     * A replay's world snapshot does not have the shape the server writes, so the replay is
     * damaged.
     */
    InvalidReplaySnapshotLevelDat: { message: 'Invalid LevelDB replay snapshot level.dat', base: TypeError },
    /**
     * A replay's world snapshot does not have the shape the server writes, so the replay is
     * damaged.
     */
    InvalidReplaySnapshotPlayerData: { message: 'Invalid LevelDB replay snapshot player data', base: TypeError },
    /**
     * The block catalog's Minecraft version is not a version number. The generated block data is
     * damaged; regenerate it.
     */
    InvalidMinecraftCatalogVersion: 'Invalid Minecraft catalog version: {minecraftVersion}',
    /**
     * Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
     * report it with the stack trace.
     */
    InvalidSubchunkHeight: { message: 'Invalid subchunk height: {y}', base: RangeError },
    /**
     * Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
     * report it with the stack trace.
     */
    SubChunkOutOfRange: 'Invalid subchunk height: {y}',
    /** A world's entry in `config.json` is not an object with the fields a world needs. */
    InvalidWorldConfig: 'Invalid world data',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyEntitySnapshotsAreInvalid: 'Legacy entity snapshots are invalid',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyEntitySnapshotsContainInvalidEntries: 'Legacy entity snapshots contain invalid entries',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyGameRulesAreInvalid: 'Legacy game rules are invalid',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyGameRulesContainInvalidEntries: 'Legacy game rules contain invalid entries',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacySpawnPositionIsInvalid: 'Legacy spawn position is invalid',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyWeatherIsInvalid: 'Legacy weather is invalid',
    /**
     * A world saved by an older version of JSPrismarine has malformed data the server cannot
     * migrate. Restore the world from a backup taken before the error.
     */
    LegacyWorldDataMustBeObject: 'Legacy world data must be an object',
    /**
     * The level players join first, the one `level-name` names, cannot be detached while the
     * server runs. Name another level in `level-name` and restart the server first.
     */
    EntryLevelCannotDetach: 'Level {name} is the level players join first, so it cannot be detached',
    /** No attached level has that name or UUID. `/world list` shows the attached levels. */
    LevelNotAttached: 'No attached level is named {name}',
    /**
     * A level the config's `worlds` declares is attached for as long as the config names it. To
     * detach it, remove its entry from `config.json` and restart the server.
     */
    ConfigLevelCannotDetach:
        'Level {name} is declared in config.json; remove it from `worlds` and restart the server to detach it',
    /**
     * A level's name is 1 to 64 letters, digits, underscores and hyphens, since it also names the
     * level's folder under `worlds/`. Choose a name of those characters.
     */
    InvalidNewLevelName: '{name} is not a level name: use 1 to 64 letters, digits, underscores and hyphens',
    /**
     * Two attached levels cannot share a name, and a new level cannot take the name of one the
     * config declares. Choose another name, or detach the level that has it.
     */
    LevelNameTaken: 'A level named {name} is attached or declared in config.json already',
    /** No detached level in `levels.json` has that name or UUID. `/world list` shows them. */
    LevelNotRegistered: 'No detached level is named {name}',
    /**
     * More than one detached level has that name, which detached levels may share. Name the one
     * to attach by its UUID, which `/world list` shows.
     */
    AmbiguousLevelName: 'More than one detached level is named {name}: {ids}',
    /**
     * The world loaded without an overworld, which every world needs. Check its dimensions in
     * `config.json`.
     */
    LevelWithoutOverworld: 'Level {defaultName} built no {overworldStemId} world',
    /**
     * The world's `level.dat` is shorter or longer than its header says, so it was cut short or
     * edited. Restore it from `level.dat_old` or a backup.
     */
    LevelDatSizeMismatch: 'level.dat declares {declared} bytes of payload but carries {byteLength}',
    /**
     * The world's `level.dat` is shorter than its header, so it was cut short. Restore it from
     * `level.dat_old` or a backup.
     */
    LevelDatTruncated: 'level.dat is {byteLength} bytes, the header alone is {headerBytes}',
    /** Code asked for a dimension the world does not have. The message lists the ones it has. */
    UnknownLevelDimension: 'Level {name} has no {dimensionId} dimension. It has: {stems}',
    /**
     * The world has no overworld, where Bedrock keeps the spawn point and the clock. Add one to its
     * dimensions.
     */
    LevelHasNoOverworld: "Level {name} has no {overworldStemId} stem; Bedrock's spawn and clock live there",
    /**
     * A dimension was built before its world was opened. This is a bug in the server; report it
     * with the stack trace.
     */
    LevelNotOpened: 'Level {name} is not enabled, so it cannot build {dimensionId}',
    /**
     * A chunk finished twice before the world took the first result. This is a bug in the server;
     * report it with the stack trace.
     */
    CompletionReplaced: 'A newer completion replaced {key} before it was admitted',
    /**
     * The world holds a block the server's content does not define, usually one a plugin or pack
     * added that is no longer loaded. Load it again, or remove the block.
     */
    UnknownSavedBlock: 'No block named {name}, held at {x} {y} {z} in world {name2}',
    /** Code set a block in a state the block registry does not have. */
    UnknownBlockState: 'No block state registered for {name} with {states}',
    /**
     * Code asked for the states of a block the registry does not have, usually a block a plugin or
     * pack added that is no longer loaded.
     */
    UnknownBlock: 'No block state schema registered for {name}',
    /** Content acted in a dimension that has no loaded world. */
    NoWorldInDimension: 'no {dimension} world is loaded, so it cannot be read or written',
    /**
     * A change span was closed before the spans opened inside it. The change log was used out of
     * order. This is a bug in the server; report it with the stack trace.
     */
    SpanClosedOutOfOrder: { message: 'Only the innermost open span can be closed', base: ChangeLogError },
    /**
     * A change span was undone after it closed. The change log was used out of order. This is a bug
     * in the server; report it with the stack trace.
     */
    RevertClosedSpan: { message: 'Only an open span can be reverted', base: ChangeLogError },
    /**
     * A sub-chunk's palette has a block without a name. The world on disk is damaged, or was
     * written by a tool that writes the format differently; open it in the game to let it repair
     * what it can, or restore a backup.
     */
    UnnamedPaletteEntry: 'Palette entry has no name',
    /**
     * The world's pending entity migration record is damaged. Restore the world from a backup taken
     * before the error.
     */
    InvalidActorMigration: 'Pending actor migration data is not an array',
    /** A player's data file name would resolve outside the player data folder, so it is refused. */
    PlayerDataPathEscapes: 'Player data for {key} would leave {folder}',
    /**
     * A position was created without its world. This is a bug in the server; report it with the
     * stack trace.
     */
    PositionWithoutWorld: 'A Position requires the world it is in',
    /**
     * The world storage provider cannot capture the snapshot a replay starts from. Record replays
     * with a provider that can.
     */
    ProviderCannotCaptureReplay: "Provider '{name}' cannot capture replay snapshots",
    /** A replay was started on a world whose dimensions or settings differ from the recording's. */
    ReplayLevelMismatch: "Replay manifest does not match this level's current initial state",
    /**
     * A dimension was built before its dimension type was loaded. This is a bug in the server;
     * report it with the stack trace.
     */
    UnresolvedDimensionType: 'The {dimensionId} stem of level {name} has no resolved type',
    /**
     * A dimension names a dimension type no loaded pack defines. Check the name, or load the
     * datapack that defines it.
     */
    UnknownDimensionType: 'The {id} stem of level {name} names the dimension type {type}, which is not loaded',
    /**
     * A sub-chunk's block points past its palette. The world on disk is damaged, or was written by
     * a tool that writes the format differently; open it in the game to let it repair what it can,
     * or restore a backup.
     */
    BlockOutOfPalette: {
        message: 'Sub chunk block refers to missing palette index {originalIndex}',
        base: RangeError
    },
    /**
     * A sub-chunk's biomes were set from a list of the wrong length. This is a bug in the server;
     * report it with the stack trace.
     */
    SubChunkBiomeCountMismatch: {
        message: 'A sub chunk holds {blocksPerSubchunk} biomes, got {idsCount}',
        base: RangeError
    },
    /**
     * A sub-chunk would hold more different blocks than one sub-chunk can. This is a bug in the
     * server; report it with the stack trace.
     */
    SubChunkPaletteFull: {
        message: 'A sub chunk palette holds at most {maxPaletteSize} entries',
        base: RangeError
    },
    /**
     * A sub-chunk declares a storage width Bedrock does not use. The world on disk is damaged, or
     * was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    InvalidSubChunkWidth: 'Sub chunk storage declares {bitsPerBlock} bits per block',
    /**
     * A sub-chunk declares an impossible number of palette entries. The world on disk is damaged,
     * or was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    InvalidSubChunkPaletteSize: 'Sub chunk storage declares a palette of {paletteSize} entries',
    /**
     * A sub-chunk on disk uses the network form of block storage, which the game never saves. The
     * world on disk is damaged, or was written by a tool that writes the format differently; open
     * it in the game to let it repair what it can, or restore a backup.
     */
    RuntimeIdStorageOnDisk: 'Sub chunk storage is marked as holding runtime ids, which never appears on disk',
    /**
     * A sub-chunk with a second block layer, such as waterlogged blocks, was saved in a format that
     * holds one. This is a bug in the server; report it with the stack trace.
     */
    SecondLayerInVersionOne: 'Sub chunk version 1 holds a single layer, so a second one would be lost',
    /**
     * A world save was written to after it finished. This is a bug in the server; report it with
     * the stack trace.
     */
    SavePassCommitted: 'This save pass has already committed',
    /**
     * Content tried to move a block, such as with a piston, that the block catalog cannot represent
     * as moving.
     */
    UnmovableBlock: "this server's block catalog cannot move {name} at {x}, {y}, {z}",
    /**
     * Content placed a block in a state the server's block catalog does not have, usually a pack
     * that names a state of a newer Minecraft.
     */
    UnknownCatalogBlock: "this server's block catalog has no {identifier} in state {states}",
    /**
     * A tick began that is not the one after the last. The change log was used out of order. This
     * is a bug in the server; report it with the stack trace.
     */
    TickOutOfSequence: { message: 'Tick {tick} does not follow tick {lastBegun}', base: ChangeLogError },
    /**
     * A tick began while the previous one was still open. The change log was used out of order.
     * This is a bug in the server; report it with the stack trace.
     */
    TickIsStillOpen: { message: 'Tick {tick} is still open', base: ChangeLogError },
    /** A world names a generator nothing registered. The message lists the ones that are. */
    UnknownGeneratorKind: 'Unknown generator kind {kind}. Registered kinds: {kinds}',
    /**
     * A world in `config.json` names a preset that does not exist. The message lists the ones that
     * do.
     */
    UnknownWorldPreset: 'Unknown world preset {preset}. Known presets: {presets}',
    /**
     * A world in `config.json` names a storage provider that does not exist. The message lists the
     * ones that do.
     */
    UnknownWorldProvider:
        "Unknown world provider '{provider}' for world '{folderName}'. Available providers: {providers}.",
    /**
     * Biome data uses a storage width Bedrock does not use. The world on disk is damaged, or was
     * written by a tool that writes the format differently; open it in the game to let it repair
     * what it can, or restore a backup.
     */
    UnsupportedBiomePaletteWidth: 'Unsupported biome palette width {bitsPerBlock}',
    /**
     * A replay's world snapshot was written by a different version of the server, or is damaged.
     */
    UnsupportedReplaySnapshot: {
        message: 'Unsupported or invalid LevelDB replay snapshot',
        base: TypeError
    },
    /**
     * A sub-chunk uses a format version this server does not read, such as one from a much older or
     * newer game.
     */
    UnsupportedSubChunkVersion: 'Unsupported sub chunk version {version}',
    /** A world was loaded twice. */
    WorldAlreadyLoaded: 'World {folderName} has already been loaded',
    /**
     * Content asked for the spawn point before the world finished finding one, such as right after
     * it was created.
     */
    SpawnNotFoundYet: 'the {dimension} world has not found its spawn point yet',
    /**
     * Messages between parts of the world kept producing more, so a tick never settled. This is a
     * bug in the server; report it with the stack trace.
     */
    WorldMessagesUnsettled: '{pendingCount} world message(s) were still being filed after {drainPasses} passes',
    /** The world's storage was used before it opened or after it closed. */
    WorldStorageClosed: 'The world provider is not enabled',
    /**
     * A world saved by an older version of JSPrismarine has malformed generation settings. Restore
     * it from a backup taken before the error.
     */
    InvalidLegacyWorldGenSettings: 'worldGenSettings needs a seed string and a dimensions object',
    /**
     * A sub-chunk's single-block storage has no block in its palette. The world on disk is damaged,
     * or was written by a tool that writes the format differently; open it in the game to let it
     * repair what it can, or restore a backup.
     */
    EmptySingleBlockStorage: { message: 'A zero-bit storage needs its runtime id', base: RangeError },
    /**
     * The chunk was not generated because the generator stopped, which happens while the server
     * shuts down.
     */
    GenerationStopped: 'Chunk {cx},{cz} was not generated: the generator has stopped',
    /**
     * The world's `level.dat` records a Java data version newer than the one the server runs, so
     * an older Java release would read chunks and data written by a newer one. Java has no
     * downgrade path, and neither does the server. Run the release the world was saved with, by
     * setting `content-java-version`, or start the server on another world.
     */
    JavaDataDowngrade:
        'the world {level} was saved with Java data version {stored}, newer than Java {release} ({dataVersion}); run that release or a newer one',
    /**
     * Code asked the scoreboard for a participant by an id the scoreboard never gave out, or one it
     * has since removed. Look a participant up by its entity or fake player name instead, or check
     * that the id came from this world's scoreboard.
     */
    UnknownScoreboardParticipant: {
        message: 'No scoreboard participant has the id {participant}',
        base: RangeError
    },
    /**
     * A command named a command storage by an id that is not a resource location, such as one with
     * an uppercase letter or a space. Write the id as `namespace:path`, with the namespace in
     * lowercase letters, digits, `_`, `.` and `-`, and the path in those and `/`. Without a
     * namespace the id is in `minecraft`.
     */
    InvalidStorageId: {
        message: 'Invalid storage id {id}: expected a resource location such as mypack:state',
        base: RangeError
    }
});
