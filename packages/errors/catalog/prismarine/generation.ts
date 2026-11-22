import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from '../defineErrors';

/** Raised when a buffer handed to `readRegistryBundle` is not a bundle this build reads. */
export abstract class RegistryBundleFormatError extends JSPrismarineError {
    public override name = 'RegistryBundleFormatError';
}

/** The errors the generation code of `@jsprismarine/prismarine` throws. */
export const PrismarineGenerationErrors = defineErrors('prismarine/generation', {
    /**
     * A generated chunk's biome points past its palette. This is a bug in world generation; report
     * it with the stack trace.
     */
    BiomeCellOutOfPalette: { message: 'Biome cell index {index} is outside its palette', base: RangeError },
    /**
     * A feature pass wrote more distinct block states than its 16-bit write overlay can name. A
     * 3 by 3 chunk area holds a few hundred, so this is a bug in world generation; report it with
     * the stack trace.
     */
    RegionPaletteFull: {
        message: 'A feature view cannot record more than 65534 distinct block states',
        base: RangeError
    },
    /**
     * A generated biome section has a count of biomes other than one or one per block. This is a
     * bug in world generation; report it with the stack trace.
     */
    InvalidBiomeSectionSize: {
        message: 'Biome section {section} must hold one or 4096 IDs, got {length}',
        base: RangeError
    },
    /**
     * A generated region's biome sections do not cover its biome data. This is a bug in world
     * generation; report it with the stack trace.
     */
    BiomeSectionOffsetsMismatch: {
        message: 'Biome section offsets must span the biome ID buffer',
        base: RangeError
    },
    /**
     * A generation worker returned a chunk's blocks in a shape the server does not read. This is a
     * bug in world generation; report it with the stack trace.
     */
    InvalidBlockPassResult: {
        message: 'The block pass for the chunk at {cx}, {cz} came back in an unexpected shape.',
        base: TypeError
    },
    /**
     * Generation tried to join regions of different heights. This is a bug in world generation;
     * report it with the stack trace.
     */
    RegionHeightMismatch: {
        message: 'Cannot combine generation regions with different vertical extents',
        base: RangeError
    },
    /**
     * A generated chunk is missing a section's biomes. This is a bug in world generation; report it
     * with the stack trace.
     */
    MissingSectionBiomes: 'The chunk at {cx}, {cz} has no biome IDs for section {section}',
    /**
     * A terrain tile's biome cells have no biome for a cell of their own chunk, so the chunk's
     * biome sections cannot be packed from them. This is a bug in world generation; report it with
     * the stack trace.
     */
    MissingCellBiome: "The tile's biome cells have no biome for cell {quartX}, {quartY}, {quartZ}",
    /**
     * A chunk finished generating without the data its neighbors merge from. This is a bug in world
     * generation; report it with the stack trace.
     */
    MissingMergeInputs: 'The chunk at {cx}, {cz} reached full without leaving its merge inputs.',
    /**
     * A generated chunk's biome cells do not match its height. This is a bug in world generation;
     * report it with the stack trace.
     */
    BiomeCellCountMismatch: {
        message: 'A chunk of height {height} has {value} biome cells, not {indicesCount}',
        base: RangeError
    },
    /**
     * A generation worker was sent a task missing the inputs it needs. This is a bug in world
     * generation; report it with the stack trace.
     */
    IncompleteChunkTask: {
        message: 'The chunk task at {chunkX}, {chunkZ} carries no seed, pipeline key and valid start plans.',
        base: TypeError
    },
    /**
     * An end city template marker was run without its rotation. This is a bug in world generation;
     * report it with the stack trace.
     */
    EndCityMarkerWithoutRotation: { message: 'The end-city marker action needs a rotation.', base: TypeError },
    /**
     * A generation worker was sent a task missing the inputs it needs. This is a bug in world
     * generation; report it with the stack trace.
     */
    IncompleteFeatureTask: {
        message: 'The feature task at {chunkX}, {chunkZ} carries no terrain view, seed and pipeline key.',
        base: TypeError
    },
    /**
     * A generation worker was sent a task missing the inputs it needs. This is a bug in world
     * generation; report it with the stack trace.
     */
    FeatureTaskTileCountMismatch: {
        message: 'A feature task needs {tileCount} terrain tiles.',
        base: RangeError
    },
    /**
     * A feature step was given the same terrain twice. This is a bug in world generation; report it
     * with the stack trace.
     */
    DuplicateFeatureTiles: { message: 'A feature view needs distinct terrain tiles.', base: RangeError },
    /**
     * A feature step was given a gap in the terrain around its chunk. This is a bug in world
     * generation; report it with the stack trace.
     */
    MissingFeatureTile: {
        message: 'A feature view needs every terrain tile in its three by three window.',
        base: RangeError
    },
    /**
     * A feature step was given the wrong number of neighboring chunks. This is a bug in world
     * generation; report it with the stack trace.
     */
    FeatureViewTileCountMismatch: { message: 'A feature view needs nine terrain tiles.', base: RangeError },
    /**
     * A feature step was given terrain of the wrong size or height. This is a bug in world
     * generation; report it with the stack trace.
     */
    InvalidFeatureTile: {
        message: 'Feature-view terrain tiles must be radius-zero and match its vertical extent.',
        base: RangeError
    },
    /**
     * A feature step was given terrain from outside its neighborhood. This is a bug in world
     * generation; report it with the stack trace.
     */
    FeatureTileOutOfWindow: {
        message: 'Feature-view terrain tiles must fit its three by three window.',
        base: RangeError
    },
    /**
     * A generation worker returned feature writes in a shape the server does not read. This is a
     * bug in world generation; report it with the stack trace.
     */
    InvalidFeaturePatchList: {
        message: 'A feature worker returned an invalid patch list.',
        base: TypeError
    },
    /**
     * A generated region carries half of its biome data. This is a bug in world generation; report
     * it with the stack trace.
     */
    PartialBiomeSections: {
        message: 'A generation region must carry both biome section buffers or neither',
        base: RangeError
    },
    /**
     * A generation worker started without the world generation data it reads. This is a bug in
     * world generation; report it with the stack trace.
     */
    WorkerWithoutRegistryBundle: {
        message: 'A generation worker needs a registry bundle in shared memory.',
        base: TypeError
    },
    /**
     * The Java server jar the structure templates come from does not hold the inner jar it should.
     * The download is damaged or is a different version; fetch the sources again.
     */
    NoInnerServerJar: '{jarPath} holds no inner server jar',
    /**
     * An igloo template action was run without its position. This is a bug in world generation;
     * report it with the stack trace.
     */
    IglooMarkerWithoutPosition: { message: 'The igloo snow-cap action needs an x, y, z position.', base: TypeError },
    /**
     * The debug world lays its block grid at heights outside the dimension. Give the dimension a
     * height range that includes them.
     */
    DebugGridOutOfRange:
        "{debugGeneratorKind} lays its grid at y {debugFloorY} to {debugGridY}, outside the {id} stem's y {minY} to {maxY}",
    /**
     * A generation worker returned a merged chunk in a shape the server does not read. This is a
     * bug in world generation; report it with the stack trace.
     */
    InvalidMergeResult: {
        message: 'The merge for the chunk at {cx}, {cz} came back in an unexpected shape.',
        base: TypeError
    },
    /**
     * Merging a chunk produced a block its translation table does not hold. This is a bug in world
     * generation; report it with the stack trace.
     */
    UntranslatedMergeBlock: {
        message: 'The merge produced {key}, which its translation does not hold',
        base: RangeError
    },
    /**
     * A structure template has a data marker no handler knows. This is a bug in world generation;
     * report it with the stack trace.
     */
    UnknownTemplateMarker: {
        message: 'No template marker handler is registered for {type}.',
        base: TypeError
    },
    /**
     * A structure template asks for a post-placement step no handler knows. This is a bug in world
     * generation; report it with the stack trace.
     */
    UnknownPostPlacementStep: {
        message: 'No template post-placement handler is registered for {type}.',
        base: TypeError
    },
    /**
     * A structure piece has no codec to send it to a worker. This is a bug in world generation;
     * report it with the stack trace.
     */
    NoTransferCodec: { message: 'No transfer codec is registered for {name}.', base: TypeError },
    /**
     * A generation thread was asked about a dimension it did not load. This is a bug in world
     * generation; report it with the stack trace.
     */
    DimensionNotLoadedOnThread: 'No view of {id} was built on this thread, so its chunks have no type',
    /**
     * Noise worlds generate from Mojang's Java world generation data, which is not in the cache.
     * Run the commands in the message, or `pnpm dev`, which fetches it.
     */
    MissingJavaWorldgenData:
        'The noise generator needs Java Edition 26.3 world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, or set {datapack} and {reports}.',
    /**
     * An ocean ruin template marker was run without its size. This is a bug in world generation;
     * report it with the stack trace.
     */
    OceanRuinMarkerWithoutSize: {
        message: 'The ocean-ruin marker action needs its large flag.',
        base: TypeError
    },
    /**
     * Noise settings name an ore vein density function by identifier, which this server does not
     * resolve there. Write the function inline.
     */
    OreVeinDensityReference: {
        message: '{path}: an ore vein rule names a density function by identifier',
        base: TypeError
    },
    /**
     * A packed list of block writes has a different number of positions and blocks. This is a bug
     * in world generation; report it with the stack trace.
     */
    PackedWriteCountMismatch: { message: 'A packed write list has a position per write', base: TypeError },
    /**
     * A packed block write points past its palette. This is a bug in world generation; report it
     * with the stack trace.
     */
    PackedWriteOutOfPalette: {
        message: 'A packed write names a block its palette does not hold',
        base: TypeError
    },
    /**
     * A feature patch holds a block write outside the chunk it belongs to, so the write cannot be
     * packed as a position within that chunk. This is a bug in world generation; report it with
     * the stack trace.
     */
    PackedWriteOutsideChunk: {
        message: 'A packed write at {x} {y} {z} lies outside its chunk',
        base: RangeError
    },
    /**
     * The terrain cache on disk was opened without the fingerprint that keeps old terrain from
     * being reused after the data changes. This is a bug in world generation; report it with the
     * stack trace.
     */
    DiskCacheWithoutRegistryFingerprint: 'Persistent terrain cache has no registry fingerprint',
    /**
     * The terrain cache was given an input it cannot fingerprint. This is a bug in world
     * generation; report it with the stack trace.
     */
    UncacheableInput: {
        message: 'Persistent terrain cache inputs must contain only JSON values and maps',
        base: TypeError
    },
    /**
     * The terrain cache was given an input that is not a finite number. This is a bug in world
     * generation; report it with the stack trace.
     */
    NonFiniteCacheInput: {
        message: 'Persistent terrain cache inputs must use finite numbers',
        base: TypeError
    },
    /**
     * The terrain cache was given an input that is not a plain object. This is a bug in world
     * generation; report it with the stack trace.
     */
    NonPlainCacheInput: {
        message: 'Persistent terrain cache inputs must use plain objects',
        base: TypeError
    },
    /**
     * The terrain cache was given a map with keys that are not text. This is a bug in world
     * generation; report it with the stack trace.
     */
    NonStringCacheKey: {
        message: 'Persistent terrain cache maps must use string keys',
        base: TypeError
    },
    /**
     * The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
     * drop the option.
     */
    DiskCacheWithCustomStructures: {
        message: 'Persistent terrain caching does not support custom structure builders',
        base: TypeError
    },
    /**
     * The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
     * drop the option.
     */
    DiskCacheWithCustomPipeline: {
        message: 'Persistent terrain caching does not support custom worker pipelines',
        base: TypeError
    },
    /**
     * The terrain cache needs a fingerprint of the structure templates it was built with. This is a
     * bug in world generation; report it with the stack trace.
     */
    DiskCacheNeedsTemplateFingerprint: {
        message: 'Persistent terrain caching requires a template source worldgenFingerprint',
        base: TypeError
    },
    /**
     * A structure drew a direction outside the four horizontal ones. This is a bug in world
     * generation; report it with the stack trace.
     */
    InvalidHorizontalDirection: 'The random source drew an index outside the four horizontal directions',
    /**
     * The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
     * drop the option.
     */
    SharedCacheWithCustomStructures: {
        message: 'Shared terrain caching does not support custom structure builders',
        base: TypeError
    },
    /**
     * The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
     * drop the option.
     */
    SharedCacheWithCustomPipeline: {
        message: 'Shared terrain caching does not support custom worker pipelines',
        base: TypeError
    },
    /**
     * The shared terrain cache needs a fingerprint of the structure templates it was built with.
     * This is a bug in world generation; report it with the stack trace.
     */
    SharedCacheNeedsTemplateFingerprint: {
        message: 'Shared terrain caching requires a template source worldgenFingerprint',
        base: TypeError
    },
    /**
     * The shared terrain cache only works with the whole-chunk worker pool. Turn one on, or the
     * cache off.
     */
    SharedCacheWithoutWholeChunkPool: {
        message: 'Shared terrain caching requires the whole-chunk worker pool',
        base: TypeError
    },
    /**
     * A terrain fingerprint was given without the shared cache it belongs to. This is a bug in
     * world generation; report it with the stack trace.
     */
    FingerprintWithoutSharedCache: {
        message: 'A shared terrain registry fingerprint requires a shared terrain tile store',
        base: TypeError
    },
    /**
     * A worker returned terrain in a shape the shared cache does not read. This is a bug in world
     * generation; report it with the stack trace.
     */
    InvalidSharedTile: {
        message: 'A shared terrain tile builder returned an invalid payload',
        base: TypeError
    },
    /**
     * A terrain cache key is not a fingerprint. This is a bug in world generation; report it with
     * the stack trace.
     */
    InvalidSharedTileKey: {
        message: 'Shared terrain tile keys must be SHA-256 hex digests',
        base: TypeError
    },
    /**
     * A worker's thread id does not fit the shared cache's ownership marker. This is a bug in world
     * generation; report it with the stack trace.
     */
    InvalidSharedTileOwner: {
        message: 'Shared terrain tile owner thread IDs must fit a positive Int32 owner token',
        base: RangeError
    },
    /**
     * The shared terrain cache's memory has the wrong size. This is a bug in world generation;
     * report it with the stack trace.
     */
    SharedCacheWrongSize: {
        message: 'Shared terrain tile store buffer has an invalid size',
        base: RangeError
    },
    /**
     * The shared terrain cache's memory was laid out by a different build, so the server and its
     * workers run different versions. Restart the server.
     */
    SharedCacheUnsupportedHeader: {
        message: 'Shared terrain tile store buffer has an unsupported header',
        base: RangeError
    },
    /**
     * The shared terrain cache has no fingerprint of the world generation data. This is a bug in
     * world generation; report it with the stack trace.
     */
    SharedCacheWithoutRegistryFingerprint: 'The shared terrain tile store has no registry fingerprint',
    /**
     * The shared terrain cache has no fingerprint of the structure templates. This is a bug in
     * world generation; report it with the stack trace.
     */
    SharedCacheWithoutTemplateFingerprint: 'The shared terrain tile store has no template fingerprint',
    /** The shared terrain cache was given a size limit that is not a positive whole number. */
    InvalidSharedCacheLimits: {
        message: 'Shared terrain tile store limits must be positive safe integers',
        base: RangeError
    },
    /** The shared terrain cache's size limit is too small for a single chunk. Raise it. */
    SharedCacheTooSmall: {
        message: 'Shared terrain tile store maxBytes cannot hold one tile slot',
        base: RangeError
    },
    /** A flat dimension has no flat world settings. Check its preset or its `dimensions` entry. */
    MissingFlatSettings: {
        message: 'The {id} stem carries no flat generator settings',
        base: TypeError
    },
    /** A noise dimension has no noise settings. Check its preset or its `dimensions` entry. */
    MissingNoiseSettings: {
        message: 'The {id} stem carries no noise generator settings',
        base: TypeError
    },
    /**
     * A dimension names a flat world preset no loaded data defines. Check the name, or load the
     * datapack that defines it.
     */
    UnknownFlatPreset:
        'The {dimensionType} stem names the flat preset {preset}, which no worldgen/flat_level_generator_preset document defines',
    /**
     * A dimension names noise settings no loaded data defines. Check the name, or load the datapack
     * that defines it.
     */
    UnknownNoiseSettings:
        'The {dimensionType} stem names the noise settings {settings}, which no worldgen/noise_settings document defines',
    /**
     * A structure piece was sent to a worker without its fields. This is a bug in world generation;
     * report it with the stack trace.
     */
    PiecePlanWithoutFields: {
        message: 'The {type} structure-piece plan has no field record.',
        base: TypeError
    },
    /** Two codecs were registered for one structure piece type. */
    DuplicatePieceCodec: 'The structure-piece transfer codec {type} is already registered.',
    /**
     * A worker answered a structure start request without a plan it was asked for. This is a bug in
     * world generation; report it with the stack trace.
     */
    StructureStartOmitted: 'The structure-start owner omitted {structureStartKeyOf}.',
    /**
     * A worker returned a structure start for a different chunk than it was asked about. This is a
     * bug in world generation; report it with the stack trace.
     */
    StructureStartMismatch: { message: 'The structure-start plan does not match {key}.', base: TypeError },
    /**
     * A structure start request went unanswered. This is a bug in world generation; report it with
     * the stack trace.
     */
    StructureStartRequestLost: 'The structure-start request lost {key}.',
    /**
     * A generation worker was sent a task missing the inputs it needs. This is a bug in world
     * generation; report it with the stack trace.
     */
    IncompleteStructureStartTask: {
        message: 'The structure-start task at {chunkX}, {chunkZ} carries no candidate list, seed and pipeline key.',
        base: TypeError
    },
    /**
     * A worker returned structure starts in a shape the server does not read. This is a bug in
     * world generation; report it with the stack trace.
     */
    InvalidStructureStartList: {
        message: 'A structure-start worker returned an invalid plan list.',
        base: TypeError
    },
    /** Two handlers were registered for one structure template marker. */
    DuplicateTemplateMarker: 'The template marker handler {type} is already registered.',
    /** Two handlers were registered for one structure template post-placement step. */
    DuplicatePostPlacementStep: 'The template post-placement handler {type} is already registered.',
    /**
     * A template structure piece was sent to a worker in a shape it does not read. This is a bug in
     * world generation; report it with the stack trace.
     */
    InvalidTemplatePiece: { message: 'The template structure-piece plan is invalid.', base: TypeError },
    /**
     * A structure template uses a callback that cannot be sent to a worker. This is a bug in world
     * generation; report it with the stack trace.
     */
    UntransferableTemplateCallback: {
        message: 'Template {template} uses a callback that has no transfer action.',
        base: TypeError
    },
    /**
     * Terrain was named into a region that already holds blocks. This is a bug in world generation;
     * report it with the stack trace.
     */
    TerrainNamesIntoUsedRegion: 'A terrain name writer requires a fresh, untracked region',
    /**
     * The terrain cache was opened without the fingerprints that keep old terrain from being reused
     * after the data changes. This is a bug in world generation; report it with the stack trace.
     */
    TerrainCacheWithoutFingerprints: 'The terrain proto cache has no worldgen fingerprints',
    /** The terrain cache was given a size limit that is not a positive whole number. */
    InvalidTerrainCacheLimit: {
        message: 'Terrain proto cache maxBytes must be a positive safe integer',
        base: RangeError
    },
    /**
     * A generation worker was sent a task missing the inputs it needs. This is a bug in world
     * generation; report it with the stack trace.
     */
    IncompleteTerrainTask: {
        message: 'The terrain task at {chunkX}, {chunkZ} carries no seed and pipeline key.',
        base: TypeError
    },
    /**
     * The terrain statistics buffer has the wrong size. This is a bug in world generation; report
     * it with the stack trace.
     */
    InvalidTerrainStatsBuffer: { message: 'Terrain tile build stats need one Int32 counter', base: RangeError },
    /**
     * A terrain worker started without the world generation data it reads. This is a bug in world
     * generation; report it with the stack trace.
     */
    TerrainWorkerWithoutRegistryBundle: {
        message: 'A terrain worker needs a registry bundle in shared memory.',
        base: TypeError
    },
    /**
     * The world generation data bundle the workers load is damaged or from a different build.
     * Restart the server so it writes the bundle again.
     */
    RegistryBundleTooShort: {
        message: 'This is not a world generation registry bundle this build reads: it is shorter than a header.',
        base: RegistryBundleFormatError
    },
    /**
     * The world generation data bundle the workers load is damaged or from a different build.
     * Restart the server so it writes the bundle again.
     */
    RegistryBundleBadMagic: {
        message: 'This is not a world generation registry bundle this build reads: it does not start with JPRB.',
        base: RegistryBundleFormatError
    },
    /**
     * The world generation data bundle the workers load is damaged or from a different build.
     * Restart the server so it writes the bundle again.
     */
    RegistryBundleVersionMismatch: {
        message:
            'This is not a world generation registry bundle this build reads: it is format version {version} and this build reads {formatVersion}.',
        base: RegistryBundleFormatError
    },
    /**
     * The world generation data bundle the workers load is damaged or from a different build.
     * Restart the server so it writes the bundle again.
     */
    RegistryBundleIndexTruncated: {
        message: 'This is not a world generation registry bundle this build reads: its index runs past the end.',
        base: RegistryBundleFormatError
    },
    /**
     * The world generation data bundle the workers load is damaged or from a different build.
     * Restart the server so it writes the bundle again.
     */
    RegistryBundleDocumentTruncated: {
        message:
            'This is not a world generation registry bundle this build reads: the document {id} runs past the end.',
        base: RegistryBundleFormatError
    },
    /**
     * A structure start names a structure set no loaded data defines. This is a bug in world
     * generation; report it with the stack trace.
     */
    UnknownStructureSet: { message: 'Unknown structure set {set}.', base: TypeError },
    /**
     * A woodland mansion template marker was run without its rotation. This is a bug in world
     * generation; report it with the stack trace.
     */
    MansionMarkerWithoutRotation: {
        message: 'The woodland-mansion marker action needs a rotation.',
        base: TypeError
    },
    /**
     * A generation status read part of a chunk the status before it never wrote, so the statuses
     * ran out of order. This is a bug in world generation; report it with the stack trace.
     */
    MissingGenerationState:
        'The chunk at {chunkX}, {chunkZ} has no {what} at {status}, so a status body ran out of order.',
    /**
     * A generation worker was given a status it has no step for. This is a bug in world generation;
     * report it with the stack trace.
     */
    UnsupportedChunkStatus: 'A generation worker has no body for {status}.',
    /**
     * A terrain-only worker was given a status that needs neighbors or main-thread state. This is a
     * bug in world generation; report it with the stack trace.
     */
    UnsupportedWorkerStatus:
        'A generation worker runs terrain and nothing else, so it cannot run {status}. Every other status either writes into its neighbors or needs state the main thread keeps.'
});
