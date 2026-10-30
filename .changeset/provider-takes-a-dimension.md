---
'@jsprismarine/prismarine': minor
---

Make a world provider serve one save folder and every dimension in it. `Provider.readChunk`
and `listChunks` take the `DimensionType` they address, `writeChunk` reads
`chunk.getDimension()`, and `BaseProvider.setEntitySource` hands the provider the live entities
of the dimension whose chunk it writes, so the LevelDB provider no longer reads the dimension off
one `World`. `level.dat` gains `Generator`, `FlatWorldLayers` for a flat Overworld, `NetherScale`
and `Time` through `saveLevelData(LevelDatInputs)`; player records carry Bedrock's `DimensionId`
and `SpawnDimension` beside the Java ids; the resolved level stems persist in the
`jsprismarine:world_data` record as `worldGenSettings`; and `lastPlayerRecord` reads one record
and picks the world from its `dimension`. An out-of-tree provider has to add the dimension
parameter to `readChunk` and `listChunks`.
