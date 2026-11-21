---
title: '@jsprismarine/prismarine generation errors'
description: The code, message and meaning of every error in the generation catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine generation errors

These are the errors in the `generation` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.generation -->
## `PRISMARINE_BIOME_CELL_COUNT_MISMATCH`

`A chunk of height {height} has {value} biome cells, not {indicesCount}`

Thrown as `PrismarineGenerationErrors.BiomeCellCountMismatch`, which extends `RangeError`.

A generated chunk's biome cells do not match its height. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_BIOME_CELL_OUT_OF_PALETTE`

`Biome cell index {index} is outside its palette`

Thrown as `PrismarineGenerationErrors.BiomeCellOutOfPalette`, which extends `RangeError`.

A generated chunk's biome points past its palette. This is a bug in world generation; report
it with the stack trace.

## `PRISMARINE_BIOME_SECTION_OFFSETS_MISMATCH`

`Biome section offsets must span the biome ID buffer`

Thrown as `PrismarineGenerationErrors.BiomeSectionOffsetsMismatch`, which extends `RangeError`.

A generated region's biome sections do not cover its biome data. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_DEBUG_GRID_OUT_OF_RANGE`

`{debugGeneratorKind} lays its grid at y {debugFloorY} to {debugGridY}, outside the {id} stem's y {minY} to {maxY}`

Thrown as `PrismarineGenerationErrors.DebugGridOutOfRange`, which extends `Error`.

The debug world lays its block grid at heights outside the dimension. Give the dimension a
height range that includes them.

## `PRISMARINE_DIMENSION_NOT_LOADED_ON_THREAD`

`No view of {id} was built on this thread, so its chunks have no type`

Thrown as `PrismarineGenerationErrors.DimensionNotLoadedOnThread`, which extends `Error`.

A generation thread was asked about a dimension it did not load. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_DISK_CACHE_NEEDS_TEMPLATE_FINGERPRINT`

`Persistent terrain caching requires a template source worldgenFingerprint`

Thrown as `PrismarineGenerationErrors.DiskCacheNeedsTemplateFingerprint`, which extends `TypeError`.

The terrain cache needs a fingerprint of the structure templates it was built with. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_DISK_CACHE_WITH_CUSTOM_PIPELINE`

`Persistent terrain caching does not support custom worker pipelines`

Thrown as `PrismarineGenerationErrors.DiskCacheWithCustomPipeline`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

## `PRISMARINE_DISK_CACHE_WITH_CUSTOM_STRUCTURES`

`Persistent terrain caching does not support custom structure builders`

Thrown as `PrismarineGenerationErrors.DiskCacheWithCustomStructures`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

## `PRISMARINE_DISK_CACHE_WITHOUT_REGISTRY_FINGERPRINT`

`Persistent terrain cache has no registry fingerprint`

Thrown as `PrismarineGenerationErrors.DiskCacheWithoutRegistryFingerprint`, which extends `Error`.

The terrain cache on disk was opened without the fingerprint that keeps old terrain from
being reused after the data changes. This is a bug in world generation; report it with the
stack trace.

## `PRISMARINE_DUPLICATE_FEATURE_TILES`

`A feature view needs distinct terrain tiles.`

Thrown as `PrismarineGenerationErrors.DuplicateFeatureTiles`, which extends `RangeError`.

A feature step was given the same terrain twice. This is a bug in world generation; report it
with the stack trace.

## `PRISMARINE_DUPLICATE_PIECE_CODEC`

`The structure-piece transfer codec {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicatePieceCodec`, which extends `Error`.

Two codecs were registered for one structure piece type.

## `PRISMARINE_DUPLICATE_POST_PLACEMENT_STEP`

`The template post-placement handler {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicatePostPlacementStep`, which extends `Error`.

Two handlers were registered for one structure template post-placement step.

## `PRISMARINE_DUPLICATE_TEMPLATE_MARKER`

`The template marker handler {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicateTemplateMarker`, which extends `Error`.

Two handlers were registered for one structure template marker.

## `PRISMARINE_END_CITY_MARKER_WITHOUT_ROTATION`

`The end-city marker action needs a rotation.`

Thrown as `PrismarineGenerationErrors.EndCityMarkerWithoutRotation`, which extends `TypeError`.

An end city template marker was run without its rotation. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_FEATURE_TASK_TILE_COUNT_MISMATCH`

`A feature task needs {tileCount} terrain tiles.`

Thrown as `PrismarineGenerationErrors.FeatureTaskTileCountMismatch`, which extends `RangeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_FEATURE_TILE_OUT_OF_WINDOW`

`Feature-view terrain tiles must fit its three by three window.`

Thrown as `PrismarineGenerationErrors.FeatureTileOutOfWindow`, which extends `RangeError`.

A feature step was given terrain from outside its neighborhood. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_FEATURE_VIEW_TILE_COUNT_MISMATCH`

`A feature view needs nine terrain tiles.`

Thrown as `PrismarineGenerationErrors.FeatureViewTileCountMismatch`, which extends `RangeError`.

A feature step was given the wrong number of neighboring chunks. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_FINGERPRINT_WITHOUT_SHARED_CACHE`

`A shared terrain registry fingerprint requires a shared terrain tile store`

Thrown as `PrismarineGenerationErrors.FingerprintWithoutSharedCache`, which extends `TypeError`.

A terrain fingerprint was given without the shared cache it belongs to. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_IGLOO_MARKER_WITHOUT_POSITION`

`The igloo snow-cap action needs an x, y, z position.`

Thrown as `PrismarineGenerationErrors.IglooMarkerWithoutPosition`, which extends `TypeError`.

An igloo template action was run without its position. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_INCOMPLETE_CHUNK_TASK`

`The chunk task at {chunkX}, {chunkZ} carries no seed, pipeline key and valid start plans.`

Thrown as `PrismarineGenerationErrors.IncompleteChunkTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INCOMPLETE_FEATURE_TASK`

`The feature task at {chunkX}, {chunkZ} carries no terrain view, seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteFeatureTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INCOMPLETE_STRUCTURE_START_TASK`

`The structure-start task at {chunkX}, {chunkZ} carries no candidate list, seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteStructureStartTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INCOMPLETE_TERRAIN_TASK`

`The terrain task at {chunkX}, {chunkZ} carries no seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteTerrainTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INVALID_BIOME_SECTION_SIZE`

`Biome section {section} must hold one or 4096 IDs, got {length}`

Thrown as `PrismarineGenerationErrors.InvalidBiomeSectionSize`, which extends `RangeError`.

A generated biome section has a count of biomes other than one or one per block. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_INVALID_BLOCK_PASS_RESULT`

`The block pass for the chunk at {cx}, {cz} came back in an unexpected shape.`

Thrown as `PrismarineGenerationErrors.InvalidBlockPassResult`, which extends `TypeError`.

A generation worker returned a chunk's blocks in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_INVALID_FEATURE_PATCH_LIST`

`A feature worker returned an invalid patch list.`

Thrown as `PrismarineGenerationErrors.InvalidFeaturePatchList`, which extends `TypeError`.

A generation worker returned feature writes in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_INVALID_FEATURE_TILE`

`Feature-view terrain tiles must be radius-zero and match its vertical extent.`

Thrown as `PrismarineGenerationErrors.InvalidFeatureTile`, which extends `RangeError`.

A feature step was given terrain of the wrong size or height. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INVALID_HORIZONTAL_DIRECTION`

`The random source drew an index outside the four horizontal directions`

Thrown as `PrismarineGenerationErrors.InvalidHorizontalDirection`, which extends `Error`.

A structure drew a direction outside the four horizontal ones. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INVALID_MERGE_RESULT`

`The merge for the chunk at {cx}, {cz} came back in an unexpected shape.`

Thrown as `PrismarineGenerationErrors.InvalidMergeResult`, which extends `TypeError`.

A generation worker returned a merged chunk in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_INVALID_SHARED_CACHE_LIMITS`

`Shared terrain tile store limits must be positive safe integers`

Thrown as `PrismarineGenerationErrors.InvalidSharedCacheLimits`, which extends `RangeError`.

The shared terrain cache was given a size limit that is not a positive whole number.

## `PRISMARINE_INVALID_SHARED_TILE`

`A shared terrain tile builder returned an invalid payload`

Thrown as `PrismarineGenerationErrors.InvalidSharedTile`, which extends `TypeError`.

A worker returned terrain in a shape the shared cache does not read. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INVALID_SHARED_TILE_KEY`

`Shared terrain tile keys must be SHA-256 hex digests`

Thrown as `PrismarineGenerationErrors.InvalidSharedTileKey`, which extends `TypeError`.

A terrain cache key is not a fingerprint. This is a bug in world generation; report it with
the stack trace.

## `PRISMARINE_INVALID_SHARED_TILE_OWNER`

`Shared terrain tile owner thread IDs must fit a positive Int32 owner token`

Thrown as `PrismarineGenerationErrors.InvalidSharedTileOwner`, which extends `RangeError`.

A worker's thread id does not fit the shared cache's ownership marker. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_INVALID_STRUCTURE_START_LIST`

`A structure-start worker returned an invalid plan list.`

Thrown as `PrismarineGenerationErrors.InvalidStructureStartList`, which extends `TypeError`.

A worker returned structure starts in a shape the server does not read. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_INVALID_TEMPLATE_PIECE`

`The template structure-piece plan is invalid.`

Thrown as `PrismarineGenerationErrors.InvalidTemplatePiece`, which extends `TypeError`.

A template structure piece was sent to a worker in a shape it does not read. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_INVALID_TERRAIN_CACHE_LIMIT`

`Terrain proto cache maxBytes must be a positive safe integer`

Thrown as `PrismarineGenerationErrors.InvalidTerrainCacheLimit`, which extends `RangeError`.

The terrain cache was given a size limit that is not a positive whole number.

## `PRISMARINE_INVALID_TERRAIN_STATS_BUFFER`

`Terrain tile build stats need one Int32 counter`

Thrown as `PrismarineGenerationErrors.InvalidTerrainStatsBuffer`, which extends `RangeError`.

The terrain statistics buffer has the wrong size. This is a bug in world generation; report
it with the stack trace.

## `PRISMARINE_MANSION_MARKER_WITHOUT_ROTATION`

`The woodland-mansion marker action needs a rotation.`

Thrown as `PrismarineGenerationErrors.MansionMarkerWithoutRotation`, which extends `TypeError`.

A woodland mansion template marker was run without its rotation. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_MISSING_CELL_BIOME`

`The tile's biome cells have no biome for cell {quartX}, {quartY}, {quartZ}`

Thrown as `PrismarineGenerationErrors.MissingCellBiome`, which extends `Error`.

A terrain tile's biome cells have no biome for a cell of their own chunk, so the chunk's
biome sections cannot be packed from them. This is a bug in world generation; report it with
the stack trace.

## `PRISMARINE_MISSING_FEATURE_TILE`

`A feature view needs every terrain tile in its three by three window.`

Thrown as `PrismarineGenerationErrors.MissingFeatureTile`, which extends `RangeError`.

A feature step was given a gap in the terrain around its chunk. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_MISSING_FLAT_SETTINGS`

`The {id} stem carries no flat generator settings`

Thrown as `PrismarineGenerationErrors.MissingFlatSettings`, which extends `TypeError`.

A flat dimension has no flat world settings. Check its preset or its `dimensions` entry.

## `PRISMARINE_MISSING_GENERATION_STATE`

`The chunk at {chunkX}, {chunkZ} has no {what} at {status}, so a status body ran out of order.`

Thrown as `PrismarineGenerationErrors.MissingGenerationState`, which extends `Error`.

A generation status read part of a chunk the status before it never wrote, so the statuses
ran out of order. This is a bug in world generation; report it with the stack trace.

## `PRISMARINE_MISSING_JAVA_WORLDGEN_DATA`

`` The noise generator needs Java Edition 26.3 world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, or set {datapack} and {reports}. ``

Thrown as `PrismarineGenerationErrors.MissingJavaWorldgenData`, which extends `Error`.

Noise worlds generate from Mojang's Java world generation data, which is not in the cache.
Run the commands in the message, or `pnpm dev`, which fetches it.

## `PRISMARINE_MISSING_MERGE_INPUTS`

`The chunk at {cx}, {cz} reached full without leaving its merge inputs.`

Thrown as `PrismarineGenerationErrors.MissingMergeInputs`, which extends `Error`.

A chunk finished generating without the data its neighbors merge from. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_MISSING_NOISE_SETTINGS`

`The {id} stem carries no noise generator settings`

Thrown as `PrismarineGenerationErrors.MissingNoiseSettings`, which extends `TypeError`.

A noise dimension has no noise settings. Check its preset or its `dimensions` entry.

## `PRISMARINE_MISSING_SECTION_BIOMES`

`The chunk at {cx}, {cz} has no biome IDs for section {section}`

Thrown as `PrismarineGenerationErrors.MissingSectionBiomes`, which extends `Error`.

A generated chunk is missing a section's biomes. This is a bug in world generation; report it
with the stack trace.

## `PRISMARINE_NO_INNER_SERVER_JAR`

`{jarPath} holds no inner server jar`

Thrown as `PrismarineGenerationErrors.NoInnerServerJar`, which extends `Error`.

The Java server jar the structure templates come from does not hold the inner jar it should.
The download is damaged or is a different version; fetch the sources again.

## `PRISMARINE_NO_TRANSFER_CODEC`

`No transfer codec is registered for {name}.`

Thrown as `PrismarineGenerationErrors.NoTransferCodec`, which extends `TypeError`.

A structure piece has no codec to send it to a worker. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_NON_FINITE_CACHE_INPUT`

`Persistent terrain cache inputs must use finite numbers`

Thrown as `PrismarineGenerationErrors.NonFiniteCacheInput`, which extends `TypeError`.

The terrain cache was given an input that is not a finite number. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_NON_PLAIN_CACHE_INPUT`

`Persistent terrain cache inputs must use plain objects`

Thrown as `PrismarineGenerationErrors.NonPlainCacheInput`, which extends `TypeError`.

The terrain cache was given an input that is not a plain object. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_NON_STRING_CACHE_KEY`

`Persistent terrain cache maps must use string keys`

Thrown as `PrismarineGenerationErrors.NonStringCacheKey`, which extends `TypeError`.

The terrain cache was given a map with keys that are not text. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_OCEAN_RUIN_MARKER_WITHOUT_SIZE`

`The ocean-ruin marker action needs its large flag.`

Thrown as `PrismarineGenerationErrors.OceanRuinMarkerWithoutSize`, which extends `TypeError`.

An ocean ruin template marker was run without its size. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_ORE_VEIN_DENSITY_REFERENCE`

`{path}: an ore vein rule names a density function by identifier`

Thrown as `PrismarineGenerationErrors.OreVeinDensityReference`, which extends `TypeError`.

Noise settings name an ore vein density function by identifier, which this server does not
resolve there. Write the function inline.

## `PRISMARINE_PACKED_WRITE_COUNT_MISMATCH`

`A packed write list has a position per write`

Thrown as `PrismarineGenerationErrors.PackedWriteCountMismatch`, which extends `TypeError`.

A packed list of block writes has a different number of positions and blocks. This is a bug
in world generation; report it with the stack trace.

## `PRISMARINE_PACKED_WRITE_OUT_OF_PALETTE`

`A packed write names a block its palette does not hold`

Thrown as `PrismarineGenerationErrors.PackedWriteOutOfPalette`, which extends `TypeError`.

A packed block write points past its palette. This is a bug in world generation; report it
with the stack trace.

## `PRISMARINE_PACKED_WRITE_OUTSIDE_CHUNK`

`A packed write at {x} {y} {z} lies outside its chunk`

Thrown as `PrismarineGenerationErrors.PackedWriteOutsideChunk`, which extends `RangeError`.

A feature patch holds a block write outside the chunk it belongs to, so the write cannot be
packed as a position within that chunk. This is a bug in world generation; report it with
the stack trace.

## `PRISMARINE_PARTIAL_BIOME_SECTIONS`

`A generation region must carry both biome section buffers or neither`

Thrown as `PrismarineGenerationErrors.PartialBiomeSections`, which extends `RangeError`.

A generated region carries half of its biome data. This is a bug in world generation; report
it with the stack trace.

## `PRISMARINE_PIECE_PLAN_WITHOUT_FIELDS`

`The {type} structure-piece plan has no field record.`

Thrown as `PrismarineGenerationErrors.PiecePlanWithoutFields`, which extends `TypeError`.

A structure piece was sent to a worker without its fields. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_REGION_HEIGHT_MISMATCH`

`Cannot combine generation regions with different vertical extents`

Thrown as `PrismarineGenerationErrors.RegionHeightMismatch`, which extends `RangeError`.

Generation tried to join regions of different heights. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_REGISTRY_BUNDLE_BAD_MAGIC`

`This is not a world generation registry bundle this build reads: it does not start with JPRB.`

Thrown as `PrismarineGenerationErrors.RegistryBundleBadMagic`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

## `PRISMARINE_REGISTRY_BUNDLE_DOCUMENT_TRUNCATED`

`This is not a world generation registry bundle this build reads: the document {id} runs past the end.`

Thrown as `PrismarineGenerationErrors.RegistryBundleDocumentTruncated`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

## `PRISMARINE_REGISTRY_BUNDLE_INDEX_TRUNCATED`

`This is not a world generation registry bundle this build reads: its index runs past the end.`

Thrown as `PrismarineGenerationErrors.RegistryBundleIndexTruncated`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

## `PRISMARINE_REGISTRY_BUNDLE_TOO_SHORT`

`This is not a world generation registry bundle this build reads: it is shorter than a header.`

Thrown as `PrismarineGenerationErrors.RegistryBundleTooShort`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

## `PRISMARINE_REGISTRY_BUNDLE_VERSION_MISMATCH`

`This is not a world generation registry bundle this build reads: it is format version {version} and this build reads {formatVersion}.`

Thrown as `PrismarineGenerationErrors.RegistryBundleVersionMismatch`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

## `PRISMARINE_SHARED_CACHE_NEEDS_TEMPLATE_FINGERPRINT`

`Shared terrain caching requires a template source worldgenFingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheNeedsTemplateFingerprint`, which extends `TypeError`.

The shared terrain cache needs a fingerprint of the structure templates it was built with.
This is a bug in world generation; report it with the stack trace.

## `PRISMARINE_SHARED_CACHE_TOO_SMALL`

`Shared terrain tile store maxBytes cannot hold one tile slot`

Thrown as `PrismarineGenerationErrors.SharedCacheTooSmall`, which extends `RangeError`.

The shared terrain cache's size limit is too small for a single chunk. Raise it.

## `PRISMARINE_SHARED_CACHE_UNSUPPORTED_HEADER`

`Shared terrain tile store buffer has an unsupported header`

Thrown as `PrismarineGenerationErrors.SharedCacheUnsupportedHeader`, which extends `RangeError`.

The shared terrain cache's memory was laid out by a different build, so the server and its
workers run different versions. Restart the server.

## `PRISMARINE_SHARED_CACHE_WITH_CUSTOM_PIPELINE`

`Shared terrain caching does not support custom worker pipelines`

Thrown as `PrismarineGenerationErrors.SharedCacheWithCustomPipeline`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

## `PRISMARINE_SHARED_CACHE_WITH_CUSTOM_STRUCTURES`

`Shared terrain caching does not support custom structure builders`

Thrown as `PrismarineGenerationErrors.SharedCacheWithCustomStructures`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

## `PRISMARINE_SHARED_CACHE_WITHOUT_REGISTRY_FINGERPRINT`

`The shared terrain tile store has no registry fingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutRegistryFingerprint`, which extends `Error`.

The shared terrain cache has no fingerprint of the world generation data. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_SHARED_CACHE_WITHOUT_TEMPLATE_FINGERPRINT`

`The shared terrain tile store has no template fingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutTemplateFingerprint`, which extends `Error`.

The shared terrain cache has no fingerprint of the structure templates. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_SHARED_CACHE_WITHOUT_WHOLE_CHUNK_POOL`

`Shared terrain caching requires the whole-chunk worker pool`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutWholeChunkPool`, which extends `TypeError`.

The shared terrain cache only works with the whole-chunk worker pool. Turn one on, or the
cache off.

## `PRISMARINE_SHARED_CACHE_WRONG_SIZE`

`Shared terrain tile store buffer has an invalid size`

Thrown as `PrismarineGenerationErrors.SharedCacheWrongSize`, which extends `RangeError`.

The shared terrain cache's memory has the wrong size. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_STRUCTURE_START_MISMATCH`

`The structure-start plan does not match {key}.`

Thrown as `PrismarineGenerationErrors.StructureStartMismatch`, which extends `TypeError`.

A worker returned a structure start for a different chunk than it was asked about. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_STRUCTURE_START_OMITTED`

`The structure-start owner omitted {structureStartKeyOf}.`

Thrown as `PrismarineGenerationErrors.StructureStartOmitted`, which extends `Error`.

A worker answered a structure start request without a plan it was asked for. This is a bug in
world generation; report it with the stack trace.

## `PRISMARINE_STRUCTURE_START_REQUEST_LOST`

`The structure-start request lost {key}.`

Thrown as `PrismarineGenerationErrors.StructureStartRequestLost`, which extends `Error`.

A structure start request went unanswered. This is a bug in world generation; report it with
the stack trace.

## `PRISMARINE_TERRAIN_CACHE_WITHOUT_FINGERPRINTS`

`The terrain proto cache has no worldgen fingerprints`

Thrown as `PrismarineGenerationErrors.TerrainCacheWithoutFingerprints`, which extends `Error`.

The terrain cache was opened without the fingerprints that keep old terrain from being reused
after the data changes. This is a bug in world generation; report it with the stack trace.

## `PRISMARINE_TERRAIN_NAMES_INTO_USED_REGION`

`A terrain name writer requires a fresh, untracked region`

Thrown as `PrismarineGenerationErrors.TerrainNamesIntoUsedRegion`, which extends `Error`.

Terrain was named into a region that already holds blocks. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_TERRAIN_WORKER_WITHOUT_REGISTRY_BUNDLE`

`A terrain worker needs a registry bundle in shared memory.`

Thrown as `PrismarineGenerationErrors.TerrainWorkerWithoutRegistryBundle`, which extends `TypeError`.

A terrain worker started without the world generation data it reads. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_UNCACHEABLE_INPUT`

`Persistent terrain cache inputs must contain only JSON values and maps`

Thrown as `PrismarineGenerationErrors.UncacheableInput`, which extends `TypeError`.

The terrain cache was given an input it cannot fingerprint. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_UNKNOWN_FLAT_PRESET`

`The {dimensionType} stem names the flat preset {preset}, which no worldgen/flat_level_generator_preset document defines`

Thrown as `PrismarineGenerationErrors.UnknownFlatPreset`, which extends `Error`.

A dimension names a flat world preset no loaded data defines. Check the name, or load the
datapack that defines it.

## `PRISMARINE_UNKNOWN_NOISE_SETTINGS`

`The {dimensionType} stem names the noise settings {settings}, which no worldgen/noise_settings document defines`

Thrown as `PrismarineGenerationErrors.UnknownNoiseSettings`, which extends `Error`.

A dimension names noise settings no loaded data defines. Check the name, or load the datapack
that defines it.

## `PRISMARINE_UNKNOWN_POST_PLACEMENT_STEP`

`No template post-placement handler is registered for {type}.`

Thrown as `PrismarineGenerationErrors.UnknownPostPlacementStep`, which extends `TypeError`.

A structure template asks for a post-placement step no handler knows. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_UNKNOWN_STRUCTURE_SET`

`Unknown structure set {set}.`

Thrown as `PrismarineGenerationErrors.UnknownStructureSet`, which extends `TypeError`.

A structure start names a structure set no loaded data defines. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_UNKNOWN_TEMPLATE_MARKER`

`No template marker handler is registered for {type}.`

Thrown as `PrismarineGenerationErrors.UnknownTemplateMarker`, which extends `TypeError`.

A structure template has a data marker no handler knows. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_UNSUPPORTED_CHUNK_STATUS`

`A generation worker has no body for {status}.`

Thrown as `PrismarineGenerationErrors.UnsupportedChunkStatus`, which extends `Error`.

A generation worker was given a status it has no step for. This is a bug in world generation;
report it with the stack trace.

## `PRISMARINE_UNSUPPORTED_WORKER_STATUS`

`A generation worker runs terrain and nothing else, so it cannot run {status}. Every other status either writes into its neighbors or needs state the main thread keeps.`

Thrown as `PrismarineGenerationErrors.UnsupportedWorkerStatus`, which extends `Error`.

A terrain-only worker was given a status that needs neighbors or main-thread state. This is a
bug in world generation; report it with the stack trace.

## `PRISMARINE_UNTRANSFERABLE_TEMPLATE_CALLBACK`

`Template {template} uses a callback that has no transfer action.`

Thrown as `PrismarineGenerationErrors.UntransferableTemplateCallback`, which extends `TypeError`.

A structure template uses a callback that cannot be sent to a worker. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_UNTRANSLATED_MERGE_BLOCK`

`The merge produced {key}, which its translation does not hold`

Thrown as `PrismarineGenerationErrors.UntranslatedMergeBlock`, which extends `RangeError`.

Merging a chunk produced a block its translation table does not hold. This is a bug in world
generation; report it with the stack trace.

## `PRISMARINE_WORKER_WITHOUT_REGISTRY_BUNDLE`

`A generation worker needs a registry bundle in shared memory.`

Thrown as `PrismarineGenerationErrors.WorkerWithoutRegistryBundle`, which extends `TypeError`.

A generation worker started without the world generation data it reads. This is a bug in
world generation; report it with the stack trace.
<!-- /fact -->
