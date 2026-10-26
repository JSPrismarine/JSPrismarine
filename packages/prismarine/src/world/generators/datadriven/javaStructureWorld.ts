/**
 * The seams a structure is laid out against and placed through.
 *
 * Java splits structure generation in two, and the split is what makes it work at all. Deciding
 * where a structure sits and what pieces it has happens against the bare noise terrain, with no
 * chunk loaded, so the answer is the same whichever chunk asks; writing the pieces happens once
 * per chunk, clipped to that chunk, so a village that spans nine chunks is laid out once and
 * written nine times.
 *
 * {@link StructureLevel} is the first half and {@link StructureWriter} is the second.
 * A {@link StructurePiece} is the join: it is built from a level and it writes into a writer.
 */
import type { BlockEntityRequest, BlockState, HeightmapType } from '@jsprismarine/features';
import type { BedrockBlockState, BoundingBox, JigsawJunction, RandomSource } from '@jsprismarine/structures';

/** What laying a structure out needs to know about the world, before any chunk exists. */
export interface StructureLevel {
    /** The lowest y the dimension generates. */
    readonly minY: number;
    /** How many y levels the dimension generates. */
    readonly height: number;
    readonly seaLevel: number;
    /**
     * Java's `ChunkGenerator.getBaseHeight`: the first y above the topmost block of the bare
     * noise terrain that matches the heightmap, with nothing decorated and no surface rule run.
     */
    baseHeight(x: number, z: number, heightmap: HeightmapType): number;
    /** Java's `ChunkGenerator.getBaseColumn`, read one block at a time. */
    baseBlock(x: number, y: number, z: number): BlockState;
    /**
     * The biome source's own answer at a quart position, which is the 4-block cell Java stores
     * biomes in. The structure biome check reads this rather than the fuzzed per-block lookup.
     */
    noiseBiome(quartX: number, quartY: number, quartZ: number): string;
    /**
     * Java's `Biome.coldEnoughToSnow(pos)`, which the ruined portal reads to decide whether its
     * lava is lava. Optional, because it needs the biome registry rather than the noise; a level
     * that cannot answer is treated as warm, which is the common case.
     */
    coldEnoughToSnow?(x: number, y: number, z: number): boolean;
}

/** Where a piece writes the blocks it decided on. Writes outside the chunk are dropped. */
export interface StructureWriter {
    /** The level the structure was laid out against, for a piece that settles as it writes. */
    readonly level: StructureLevel;
    /** The state already at a position. */
    blockAt(x: number, y: number, z: number): BlockState;
    /** Writes a Java state. Returns whether it landed. */
    setBlock(x: number, y: number, z: number, state: BlockState): boolean;
    /** Writes a Bedrock state, which is what a structure template resolves to. */
    setBedrockBlock(x: number, y: number, z: number, state: BedrockBlockState): boolean;
    /** Attaches block entity data to the block at a position. */
    setBlockEntity(x: number, y: number, z: number, request: BlockEntityRequest): void;
    /**
     * Records an entity a piece builds around, such as an igloo's villager.
     *
     * The position is the entity's own, not the block's: a mob stands in the middle of its
     * block and a structure template saves fractional coordinates, so a caller naming a block
     * passes its center.
     */
    spawnEntity(type: string, x: number, y: number, z: number, yaw: number): void;
    /** The current surface of a column, which is the chunk's heightmap inside it. */
    heightAt(heightmap: HeightmapType, x: number, z: number): number;
    /** Whether a block identifier is in a Java block tag. */
    hasTag(identifier: string, tag: string): boolean;
}

/** One part of a structure: a box and the blocks it writes inside it. */
export interface StructurePiece {
    /** Where the piece sits, which decides the chunks it is written into. */
    readonly boundingBox: BoundingBox;
    /**
     * How far above the piece's floor its ground sits, Java's `getGroundLevelDelta`.
     *
     * Only a jigsaw pool piece has one, and only the terrain adaptation reads it. Absent is 0,
     * which is what Java answers for every other kind of piece.
     */
    readonly groundLevelDelta?: number;
    /**
     * Whether the terrain adaptation leaves this piece alone.
     *
     * Java beards only the `rigid` pool elements of a jigsaw structure, because a
     * `terrain_matching` one is already following the ground it stands on.
     */
    readonly ignoresTerrainAdaptation?: boolean;
    /** The source positions Java's beardifier reads from this jigsaw piece's junctions. */
    readonly junctions?: readonly JigsawJunction[];
    /**
     * Writes the piece.
     *
     * @param random - The chunk's structure random, reseeded per chunk the way Java reseeds it,
     *   so a piece that spans two chunks draws two streams exactly as Java does.
     */
    place(writer: StructureWriter, random: RandomSource): void;
}

/** A box holding nothing, which an empty piece list collapses to. */
export const EMPTY_BOX: BoundingBox = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: -1,
    maxY: -1,
    maxZ: -1
};

/** The smallest box holding every piece, or {@link EMPTY_BOX} for no pieces. */
export const unionOf = (pieces: readonly StructurePiece[]): BoundingBox => {
    const first = pieces[0];
    if (first === undefined) return EMPTY_BOX;

    let box = first.boundingBox;
    for (const piece of pieces.slice(1)) {
        box = {
            minX: Math.min(box.minX, piece.boundingBox.minX),
            minY: Math.min(box.minY, piece.boundingBox.minY),
            minZ: Math.min(box.minZ, piece.boundingBox.minZ),
            maxX: Math.max(box.maxX, piece.boundingBox.maxX),
            maxY: Math.max(box.maxY, piece.boundingBox.maxY),
            maxZ: Math.max(box.maxZ, piece.boundingBox.maxZ)
        };
    }

    return box;
};

/** Whether a box covers any block of a chunk, ignoring y. */
export const boxTouchesChunk = (box: BoundingBox, chunkX: number, chunkZ: number): boolean =>
    box.minX <= chunkX * 16 + 15 && box.maxX >= chunkX * 16 && box.minZ <= chunkZ * 16 + 15 && box.maxZ >= chunkZ * 16;

/** A box grown outward by the same amount on every horizontal side. */
export const inflated = (box: BoundingBox, amount: number): BoundingBox => ({
    minX: box.minX - amount,
    minY: box.minY,
    minZ: box.minZ - amount,
    maxX: box.maxX + amount,
    maxY: box.maxY,
    maxZ: box.maxZ + amount
});

/** A box from a corner and an extent. */
export const boxFromSize = (
    x: number,
    y: number,
    z: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number
): BoundingBox => ({
    minX: x,
    minY: y,
    minZ: z,
    maxX: x + sizeX - 1,
    maxY: y + sizeY - 1,
    maxZ: z + sizeZ - 1
});

/** Whether a position sits inside an inclusive box. */
export const boxContains = (box: BoundingBox, x: number, y: number, z: number): boolean =>
    x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ;

/** A box moved by a delta. */
export const movedBox = (box: BoundingBox, dx: number, dy: number, dz: number): BoundingBox => ({
    minX: box.minX + dx,
    minY: box.minY + dy,
    minZ: box.minZ + dz,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
    maxZ: box.maxZ + dz
});
