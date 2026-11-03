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

import type { StructureTemplateStore } from './javaStructureTemplatePiece';

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
     * The executable piece is rebuilt on the destination worker from a cloneable layout plan.
     * Each destination chunk gives it a different writer and structure random, so neither belongs
     * in that plan.
     *
     * @param random - The chunk's structure random, reseeded per chunk the way Java reseeds it,
     *   so a piece that spans two chunks draws two streams exactly as Java does.
     */
    place(writer: StructureWriter, random: RandomSource): void;
}

/** Worker-local resources needed to rebuild executable pieces from a shared layout plan. */
export interface StructurePieceTransferContext {
    /** A receiving worker's own template store. */
    readonly templates: StructureTemplateStore;
}

/** Cloneable layout data for one piece; executable methods and destination state stay local. */
export interface StructurePiecePlan {
    /** Stable codec name registered by the module that owns the piece class. */
    readonly type: string;
    /** Cloneable fields captured when the structure was laid out. */
    readonly data: unknown;
}

interface StructurePieceTransferCodec<T extends StructurePiece> {
    readonly type: string;
    readonly prototype: object;
    readonly encode: (piece: T) => unknown;
    readonly decode: (data: unknown, context: StructurePieceTransferContext) => T;
}

interface RegisteredStructurePieceTransferCodec {
    readonly type: string;
    readonly prototype: object;
    readonly encode: (piece: StructurePiece) => unknown;
    readonly decode: (data: unknown, context: StructurePieceTransferContext) => StructurePiece;
}

const pieceCodecsByType = new Map<string, RegisteredStructurePieceTransferCodec>();
const pieceCodecsByPrototype = new Map<object, RegisteredStructurePieceTransferCodec>();

/**
 * Freezes cloneable plan records so the broker cannot accidentally cache placement mutations.
 * @param value - The cloneable plan value to freeze recursively.
 */
export const freezeStructurePlanData = (value: unknown): void => {
    const seen = new WeakSet<object>();
    const freeze = (current: unknown): void => {
        if (typeof current !== 'object' || current === null || seen.has(current)) return;
        if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) return;
        seen.add(current);
        for (const child of Object.values(current)) freeze(child);
        Object.freeze(current);
    };
    freeze(value);
};

/**
 * Registers the data codec for one piece implementation.
 *
 * Each worker has its own class prototype and template store. Only encoded fields cross the
 * boundary, then the receiver rebuilds a local piece that gets its writer and random stream only
 * when {@link StructurePiece.place} runs for a destination chunk.
 * @param codec - The stable type, exact prototype, and plain-data encoder and decoder.
 */
export const registerStructurePieceTransferCodec = <T extends StructurePiece>(
    codec: StructurePieceTransferCodec<T>
): void => {
    if (pieceCodecsByType.has(codec.type) || pieceCodecsByPrototype.has(codec.prototype)) {
        throw new Error(`The structure-piece transfer codec ${codec.type} is already registered.`);
    }

    // Each codec is selected by its exact prototype, then held in one erased registry for lookup.
    // These wrappers are the type boundary that connects that runtime identity back to T.
    const registered: RegisteredStructurePieceTransferCodec = {
        type: codec.type,
        prototype: codec.prototype,
        encode: (piece) => codec.encode(piece as T),
        decode: (data, context) => codec.decode(data, context)
    };
    pieceCodecsByType.set(codec.type, registered);
    pieceCodecsByPrototype.set(codec.prototype, registered);
};

/**
 * Registers the codec used by pieces whose own fields are all cloneable layout data.
 * @param type - Stable piece codec name.
 * @param prototype - Exact runtime prototype used to select the codec.
 */
export const registerStructurePieceFieldsCodec = <T extends StructurePiece>(type: string, prototype: object): void => {
    registerStructurePieceTransferCodec<T>({
        type,
        prototype,
        encode: (piece) => Object.fromEntries(Object.entries(piece)),
        decode: (data) => {
            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                throw new TypeError(`The ${type} structure-piece plan has no field record.`);
            }

            // The decoder restores a registered prototype over the cloneable fields. This is the
            // only class boundary in the plan: constructors are deliberately not run, because
            // they draw layout randomness and would shift Java's stream a second time.
            return Object.assign(Object.create(prototype), data);
        }
    });
};

/**
 * Copies one executable piece into its immutable, structured-clone-safe layout form.
 * @param piece - The piece built during structure layout.
 * @returns A cloneable plan that contains no writer or random state.
 */
export const structurePiecePlanOf = (piece: StructurePiece): StructurePiecePlan => {
    const prototype = Object.getPrototypeOf(piece) as object | null;
    const codec = prototype === null ? undefined : pieceCodecsByPrototype.get(prototype);
    if (codec === undefined) throw new TypeError(`No transfer codec is registered for ${piece.constructor.name}.`);

    // The codec registry is keyed by the exact runtime prototype, so this cast only restores the
    // generic type erased by that registry. Any non-cloneable state fails here before a worker
    // task is queued instead of disappearing silently in structured clone.
    const data = structuredClone(codec.encode(piece));
    freezeStructurePlanData(data);
    return Object.freeze({ type: codec.type, data });
};

/**
 * Rebuilds a piece with the receiving worker's class code and world-local template store.
 * @param plan - The cloneable layout data for the piece.
 * @param context - Worker-local resources needed by the piece.
 * @returns An executable piece with no destination writer or random stream attached.
 */
export const structurePieceFromPlan = (
    plan: StructurePiecePlan,
    context: StructurePieceTransferContext
): StructurePiece => {
    const codec = pieceCodecsByType.get(plan.type);
    if (codec === undefined) throw new TypeError(`No transfer codec is registered for ${plan.type}.`);
    return codec.decode(plan.data, context);
};

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
