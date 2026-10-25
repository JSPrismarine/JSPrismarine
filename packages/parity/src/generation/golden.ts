/**
 * What the generation corpus golden holds, and the format version the rows read it at.
 *
 * The golden is a recording of what the chunk generator produced at one commit, against one
 * version of Java's published world generation data. It is the only reference in this package
 * the server itself produced, which means it proves nothing about Java Edition and everything
 * about change: a rewritten generator that reproduces this file byte for byte did not alter a
 * single block, and one that does not reproduce it says where it diverged.
 *
 * Provenance is part of the file rather than a note beside it. A golden whose commit, Java data
 * version or capture protocol is unknown cannot answer the first question anybody asks of it,
 * which is whether it is stale.
 */

/** The shape of the golden the comparison rows are written against. */
export const GENERATION_CORPUS_FORMAT = 1;

/** Where the golden came from. */
export interface CorpusProvenance {
    /** The commit `HEAD` pointed at when the capture ran. */
    readonly commit: string;
    /** When the capture ran, as an ISO 8601 date. */
    readonly capturedAt: string;
    /**
     * The Java Edition version the datapack and the data generator reports came from, read from
     * `packages/bedrock-data/sources.json`. Bumping it changes generation, so a capture taken
     * against a different version is stale and the rows say so rather than failing on blocks.
     */
    readonly javaVersion: string;
    /** Files that differed from the commit when the capture ran, limited to generation code. */
    readonly uncommitted: readonly string[];
    /** How each chunk was generated, in one sentence, because the answer changes the blocks. */
    readonly protocol: string;
}

/** The digests of one captured chunk. */
export interface ChunkDigests {
    /** Layer 0, the whole column, as a run-length encoding of block state names. */
    readonly blocks: string;
    /** Layer 0 per 16 block section, floor first, so a divergence is located in y. */
    readonly sections: readonly string[];
    /** Layer 1, the liquid layer Bedrock carries beside the block layer. */
    readonly liquids: string;
    /** Every 4 by 4 by 4 biome cell of the chunk. */
    readonly biomes: string;
    /** The `Data3D` heightmap, one value per column. */
    readonly heightmap: string;
    /** Every block entity, by position, identifier and NBT. */
    readonly blockEntities: string;
    /** Every entity spawn the decoration pass requested. */
    readonly entitySpawns: string;
}

/** One chunk of the corpus as the golden records it. */
export interface ChunkDigest {
    /** The plan entry's id, `<seed>/<x>,<z>/<tier>`. */
    readonly id: string;
    readonly seed: number;
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly tier: string;
    readonly digests: ChunkDigests;
    /** How many blocks of each block state the chunk holds on layer 0, air included. */
    readonly census: Readonly<Record<string, number>>;
    readonly blockEntities: number;
    readonly entitySpawns: number;
}

/**
 * One chunk kept block by block.
 *
 * Blocks are run-length encoded over columns, x outermost, then z, then y upward from the
 * dimension floor, as alternating palette index and run length. That is about fifty times
 * smaller than one entry per block and still exact.
 */
export interface WholeChunkSample {
    readonly id: string;
    /** The block state names the run-length indices point into. */
    readonly palette: readonly string[];
    readonly blocks: readonly number[];
    readonly liquids: readonly number[];
    /** The 4 by 4 by 4 biome cells, run-length encoded as alternating biome id and run length. */
    readonly biomes: readonly number[];
    /** One value per column, `x * 16 + z`, measured from the dimension floor. */
    readonly heightmap: readonly number[];
    /** One line per block entity, sorted, as the digest sees them. */
    readonly blockEntities: readonly string[];
    /** One line per entity spawn, sorted, as the digest sees them. */
    readonly entitySpawns: readonly string[];
}

/** One structure start the placement scan found. */
export interface StructurePlacement {
    readonly seed: number;
    readonly structure: string;
    /** The `worldgen/structure_set` that offered the chunk. */
    readonly set: string;
    readonly chunkX: number;
    readonly chunkZ: number;
    /** The decoration step the pieces are written in. */
    readonly step: string;
    /** Java's generation point, which is what `/locate` reports. */
    readonly origin: readonly [number, number, number];
    /** `minX, minY, minZ, maxX, maxY, maxZ` of the union of the pieces. */
    readonly box: readonly [number, number, number, number, number, number];
    readonly pieces: number;
}

/** The committed recording of what the generator produced. */
export interface GenerationCorpusGolden {
    readonly formatVersion: number;
    readonly provenance: CorpusProvenance;
    /** The dimension the chunks were generated in, which fixes the height every digest covers. */
    readonly dimension: { readonly minY: number; readonly height: number };
    readonly chunks: readonly ChunkDigest[];
    readonly samples: readonly WholeChunkSample[];
    readonly structures: readonly StructurePlacement[];
    /** Structure types the server has no builder for, so they place nothing. */
    readonly unbuiltStructureTypes: readonly string[];
    /** Blocks of each state across every decorated chunk, which is the feature and ore census. */
    readonly blockCounts: Readonly<Record<string, number>>;
}
