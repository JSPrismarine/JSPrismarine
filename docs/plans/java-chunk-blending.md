# Java chunk blending

When a save holds chunks that an older generator made, Java keeps them as they are and bends the
terrain of every new chunk generated next to them so the two meet without a cliff. This plan
brings that behavior to the server: the blender itself, the rule that decides which stored chunks
are old, and the extra steps Java takes at the seam and under pre-1.18 chunks.

The target is Java 26.3's behavior, value for value where the generator already matches Java. The
reference is the decompiled 26.3 jar: `levelgen/blending/Blender`, `BlendingData`,
`BelowZeroRetrogen`, `ChunkStatusTasks`, `NoiseBasedChunkGenerator`, `IOWorker.isOldChunk` and
the `BlendingDataFix` and `ChunkHeightAndBiomeFix` data fixers.

## How Java decides a chunk is old

Java stamps every saved chunk with its `DataVersion`. When a release changes terrain generation,
Mojang registers `BlendingDataFix` at that release's data version. On load, every overworld chunk
saved before that version, and generated past the `biomes` status, gets a `blending_data` record.
The record is what makes the chunk old from then on: Java rewrites `DataVersion` on every save, but
`blending_data` stays. 26.3 registers the fix at data version 4997, so every overworld chunk saved
before 26.3 counts as old. The jar's own data version is 5023.

A pre-1.18 chunk gets more. `ChunkHeightAndBiomeFix` sets `below_zero_retrogen` on it when its
y = 0 layer holds bedrock, resets its status to `empty`, and records which columns had no bedrock.
The chunk then runs through generation again, but only for y -64 to -1, with its own blending
record covering y 0 to 255.

Bedrock does the same thing with its own stamp. Record 0x40 (`BlendingData`) holds
`{0, blendingVersion}`, and Chunker writes a higher `blendingVersion` for most releases (3 at 1.19,
10 at 1.26.40), with the comment that a wrongly versioned chunk "will cause the map to generate
badly made edges". No Mojang document gives the exact rule. Neither edition treats a chunk without
a stamp as current.

## Progress

Branch `feat/java-chunk-blending`, 2026-11-14.

| Slice | State |
| --- | --- |
| 1. Blender in `@jsprismarine/worldgen` | Done. Matches Java exactly on `vectors/blending.json`. |
| 2. Which stored chunks are old | Done. LevelDB record, Java's load rule, Bedrock 0x40. |
| 3. Blending in the generator | Done. Terrain, biomes, surface, features, carvers; caches and the whole-chunk worker path step aside. |
| 4. Border ticks | Folded into slice 5. Java's `generateBorderTicks` only acts on old chunks, which means upgrading ones; the world's exposed-fluid ticks cover the fluids, and leaf updates wait on [#3078](https://github.com/JSPrismarine/JSPrismarine/issues/3078). |
| 5. Below-zero retrogen | Done, with `Data2D` biomes. |
| 6. Verification and documentation | Parity row `worldgen.blending` and the dimensions guide done. No client e2e scenario: the suite has no way to seed a save with old chunks yet. |

Follow-ups: [#3077](https://github.com/JSPrismarine/JSPrismarine/issues/3077) (legacy biome ids),
[#3078](https://github.com/JSPrismarine/JSPrismarine/issues/3078) (post-processing marks),
[#3079](https://github.com/JSPrismarine/JSPrismarine/issues/3079) (persisted edge heights).

## Decisions

1. **Mirror Java's rule.** A stored overworld chunk is old when its JSPrismarine record carries
   `blending_data`, or when it has no record or a `DataVersion` below 4997. A pre-1.18 Bedrock
   chunk (`Version` below 33) is old with an area of sections 0 to 16; any other old chunk covers
   the dimension's full height. Existing saves without a record blend once at the edges of what
   they already hold, as Java 26.3 does with pre-26.3 worlds. Chosen with the user on 2026-11-14.
2. **Stamp chunks the way Java does.** Every chunk the server writes gets a JSPrismarine record
   with the generator's data version, plus the blending area once the chunk is old, so a chunk
   stays old after it is saved again. The record lives under the project's own key prefix,
   beside `jsprismarine:pending_entities:`, so BDS ignores it.
3. **Write Bedrock's 0x40 as well,** with the `blendingVersion` of the pinned Bedrock release, so
   BDS opening the save treats the server's chunks as current rather than blending against them.
4. **The data versions come from the jar.** `@jsprismarine/worldgen` exports 5023 and 4997, and a
   test compares them with what the oracle reads out of the pinned jar, so a Java bump that moves
   either fails CI.
5. **Port Java's 26.3 behavior even where it looks wrong.** 26.3's carving filter opens carved
   blocks only within four blocks of old terrain, the reverse of 1.18. The port follows the 26.3
   bytecode.
6. **Old-chunk data travels with the task.** The generator's chunk contents stop being a function
   of the seed and position alone near old chunks. A terrain task carries the blending records of
   the old chunks within eight chunks of it, and the terrain caches are skipped for such tiles, so
   a cached tile is still a pure function of its key.

## Slices

Each slice is one or a few commits that leave the tree green.

### 1. The blender in `@jsprismarine/worldgen`

`blending/Blender.ts`, `blending/BlendingData.ts`, `blending/longHashOrder.ts`,
`blending/generationVersion.ts` and `NormalNoise.parity`. `utils/oracle/DumpBlendingVectors.java`
drives Java's own classes over 17 synthetic old chunks; `blending.test.ts` matches every height,
density, biome, offset, blended density, blended biome and carving answer exactly. Commit
`feat(worldgen): port Java's world blender`.

### 2. Which stored chunks are old

In `packages/prismarine/src/world/providers/leveldb/`:

- A JSPrismarine chunk record (`jsprismarine:chunk_generation:` plus x, z and dimension) holding
  `DataVersion` and an optional packed blending record (`min_section`, `max_section`, `heights`).
- `Chunk` carries its generation stamp, so a save rewrites the record without losing the area.
- Reading a chunk applies Java's rule to decide whether it is old and with which area.
- Writing a chunk writes the record and the 0x40 stamp.
- A lookup the generator can ask "is the chunk at x, z old, and what are its blocks", answered
  from storage without loading the chunk into the world.

### 3. Blending in the generator

In `packages/prismarine/src/world/generators/datadriven/`:

- An optional `Generator.setBlendingSource`, which the world sets once its provider is enabled.
- Turning a stored Bedrock chunk into an `OldChunkView`: surface blocks and ground through
  `@jsprismarine/mapping` and the Java block tags, collision through `BlockShapes`, biomes through
  `bedrockBiomeToJava`. Each old chunk's record is calculated once and cached.
- Terrain tasks carry the records within eight chunks. `buildTerrain` installs the blender before
  sampling, the surface pass and the stored biome palette use the blended biomes, and the carver
  pass applies the carving filter.
- Feature tasks carry the records around their 3 by 3 view, so a feature's biome check sees the
  same blended biomes the chunk stores.
- The whole-chunk worker path and both terrain caches step aside for chunks with old chunks
  nearby.

### 4. Border ticks

Java's `Blender.generateBorderTicks` marks leaves and fluids along the seam between old and new
chunks for post-processing, so water flows and leaves update across it. The server's equivalent
is scheduling fluid ticks and leaf updates for those positions when the new chunk enters the
world.

### 5. Below-zero retrogen

For a pre-1.18 overworld chunk whose y = 0 layer holds bedrock: generate y -64 to -1 with the new
generator and the chunk's own blending record, keep the cave biomes from the biome source and take
the old y = 0 biome elsewhere, turn bedrock at y 0 to 4 into deepslate, clear the columns that had
no bedrock at y = 0, and skip structures that do not fit below y = 0. Features write only between
y -63 and -1. Reading such a chunk also needs the pre-1.18 `Data2D` biomes, which the provider does
not decode today.

### 6. Verification and documentation

- A parity test under a declared `packages/parity` family that generates new chunks next to old
  ones and checks the seam.
- A client e2e scenario that loads a save with old chunks and walks across a seam.
- The data-driven docs page on worlds and a Changeset per package.

## Known gaps

- Legacy Bedrock biomes (the 27 `BEDROCK_BIOME_LOSSES`, such as `taiga_hills`) have no Java id, and
  Java's 1.18 upgrade maps each to a current biome. Until `@jsprismarine/mapping` carries that
  mapping, the blender reads them as the current biome source's biome
  ([#3077](https://github.com/JSPrismarine/JSPrismarine/issues/3077)).
- Java freezes an old chunk's edge heights the first time it computes them. The server recomputes
  them from the stored blocks, so an edit on an old chunk's edge moves the blend
  ([#3079](https://github.com/JSPrismarine/JSPrismarine/issues/3079)).
- The terrain tile's surface pass and the feature pass give each quart the blender of its own
  chunk, built from the old chunks the task carried. A quart in a neighbor chunk near the edge of
  that set can miss an old chunk Java's neighbor blender would see.
- During the below-zero upgrade the surface pass under y = 0 reads the blended biomes rather than
  the upgrade's biomes, and structure starts that cross y = 0 are not skipped as Java skips them.
