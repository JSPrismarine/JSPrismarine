import type { ChunkStatus } from './ChunkStatus';
import { isOrAfter } from './ChunkStatus';

/** The four heightmaps a chunk carries once it is past `terrain`, in Java's names. */
export const HEIGHTMAPS = ['WORLD_SURFACE', 'OCEAN_FLOOR', 'MOTION_BLOCKING', 'MOTION_BLOCKING_NO_LEAVES'] as const;

/** One of the four heightmaps, spelled as `@jsprismarine/features` spells it. */
export type HeightmapName = (typeof HEIGHTMAPS)[number];

/** Blocks along one edge of a chunk. */
const CHUNK_WIDTH = 16;

/** Columns in a chunk, which is also the length of one heightmap. */
const COLUMN_COUNT = CHUNK_WIDTH * CHUNK_WIDTH;

/** Blocks along one edge of a biome cell. Java stores biomes per 4 by 4 by 4 quart, not per block. */
const BIOME_CELL = 4;

/** Biome cells along one edge of a chunk. */
const BIOME_CELLS_PER_AXIS = CHUNK_WIDTH / BIOME_CELL;

/** Palette slot 0 of every proto chunk, so a zeroed block buffer reads as an empty chunk. */
const AIR = 'minecraft:air';

/** Biome palette slot 0, matching the biome `ChunkAccess` fills a fresh chunk with. */
const DEFAULT_BIOME = 'minecraft:plains';

/** What a status asked to be attached to a block it placed, at a world block position. */
export interface ProtoBlockEntity {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** The Java block entity type, for example `minecraft:chest`. */
    readonly id: string;
    /** The loot table to roll when the block is first opened, when there is one. */
    readonly lootTable?: string;
    /** The entity a spawner produces, when the block is a spawner. */
    readonly spawnEntity?: string;
    /** Where an end gateway sends a traveler, when the block is one. */
    readonly exitPortal?: { readonly x: number; readonly y: number; readonly z: number };
    /** Whether an end gateway places its own exit platform. */
    readonly exactTeleport?: boolean;
}

/** An entity a status asked for, at the entity coordinates it stands on. */
export interface ProtoEntitySpawn {
    /** The Java entity type, for example `minecraft:end_crystal`. */
    readonly type: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** Which way it faces, in degrees. */
    readonly yaw: number;
    /** The block an end crystal's beam points at, Java's `crystal_beam_target`. */
    readonly beamTarget?: { readonly x: number; readonly y: number; readonly z: number };
    /** Whether an end crystal renders its base plate; absent keeps the client default, true. */
    readonly showBottom?: boolean;
    /** Whether the entity ignores damage, Java's `crystal_invulnerable`. */
    readonly invulnerable?: boolean;
}

/** Where a proto chunk sits and how tall it is. */
export interface ProtoChunkShape {
    readonly chunkX: number;
    readonly chunkZ: number;
    /** The lowest y the dimension generates. */
    readonly minY: number;
    /** How many y levels the dimension generates. */
    readonly height: number;
}

/**
 * A proto chunk flattened into something `postMessage` can move rather than copy.
 *
 * Every field is a number, a string, an `ArrayBuffer` or an array of plain objects. No class
 * instance, no `Map` and no per-block object, because a per-section object graph costs the main
 * thread 298 microseconds per chunk against 20 for this shape.
 */
export interface ProtoChunkPayload extends ProtoChunkShape {
    /** The status the chunk had reached when it was handed over. */
    readonly status: ChunkStatus;
    /** Java state keys. Slot 0 is always `minecraft:air`. */
    readonly blockPalette: readonly string[];
    /** `Uint16Array` indices into {@link ProtoChunkPayload.blockPalette}. */
    readonly blocks: ArrayBuffer;
    /** Biome identifiers. Slot 0 is always `minecraft:plains`. */
    readonly biomePalette: readonly string[];
    /** `Uint16Array` indices into {@link ProtoChunkPayload.biomePalette}, one per 4 by 4 by 4 cell. */
    readonly biomes: ArrayBuffer;
    /** `Int32Array` of the four heightmaps end to end, 256 columns each, in {@link HEIGHTMAPS} order. */
    readonly heightmaps: ArrayBuffer;
    readonly blockEntities: readonly ProtoBlockEntity[];
    readonly entitySpawns: readonly ProtoEntitySpawn[];
}

/** A payload and the buffers to hand to `postMessage` so they move instead of being copied. */
export interface ProtoChunkTransfer {
    readonly payload: ProtoChunkPayload;
    /** Every `ArrayBuffer` the payload holds. */
    readonly transferList: readonly ArrayBuffer[];
}

/** Raised when a proto chunk is used after {@link ProtoChunk.transfer} gave its buffers away. */
export class ProtoChunkDetachedError extends Error {
    public override name = 'ProtoChunkDetachedError';

    public constructor(chunkX: number, chunkZ: number) {
        super(
            `The proto chunk at ${chunkX}, ${chunkZ} was transferred. Its buffers belong to the ` +
                `receiving thread now, so adopt the payload back before reading it.`
        );
    }
}

/** Raised when a chunk is asked to move to a status at or below the one it already holds. */
export class ChunkStatusRegressionError extends Error {
    public override name = 'ChunkStatusRegressionError';

    public constructor(
        public readonly from: ChunkStatus,
        public readonly to: ChunkStatus
    ) {
        super(`A chunk at ${from} cannot advance to ${to}: a status body runs once and never runs backward.`);
    }
}

/** The pieces a {@link ProtoChunk} owns, which `create` allocates and `adopt` takes over. */
interface ProtoChunkParts {
    readonly blockPalette: string[];
    readonly blocks: Uint16Array<ArrayBuffer>;
    readonly biomePalette: string[];
    readonly biomes: Uint16Array<ArrayBuffer>;
    readonly heights: Int32Array<ArrayBuffer>;
    readonly blockEntities: ProtoBlockEntity[];
    readonly entitySpawns: ProtoEntitySpawn[];
}

/**
 * The chunk every status below `full` works on.
 *
 * Storage is three typed arrays and two string palettes, laid out so the whole chunk crosses a
 * thread boundary in a transfer list. Measured on one 24-section column of 192 KiB: 18
 * microseconds transferred, 76 structured-cloned, and 1370 as a plain `number[]`. The
 * representation is the point of the class rather than a detail of it.
 *
 * Block positions are world coordinates. A position outside this chunk's own 16 by 16 column, or
 * outside the dimension's build height, reads as air and refuses a write, which is what
 * `ProtoChunk.setBlockState` does with a position outside build height.
 *
 * Heightmaps are stored, not computed. Deciding whether a block counts toward `MOTION_BLOCKING`
 * needs block facts this package does not hold, so the status body that writes the blocks writes
 * the heights with them.
 */
export class ProtoChunk {
    public readonly chunkX: number;
    public readonly chunkZ: number;
    /** The lowest y the chunk holds. */
    public readonly minY: number;
    /** How many y levels the chunk holds. */
    public readonly height: number;

    private persistedStatus: ChunkStatus;
    private transferred = false;

    /** How many biome cells the column holds on y. */
    private readonly biomeCellsY: number;
    private readonly blockPalette: string[];
    private readonly blockSlots: Map<string, number>;
    private readonly biomePalette: string[];
    private readonly biomeSlots: Map<string, number>;
    private readonly blocks: Uint16Array<ArrayBuffer>;
    private readonly biomes: Uint16Array<ArrayBuffer>;
    private readonly heights: Int32Array<ArrayBuffer>;
    private readonly blockEntities: ProtoBlockEntity[];
    private readonly entitySpawns: ProtoEntitySpawn[];

    private constructor(shape: ProtoChunkShape, status: ChunkStatus, parts: ProtoChunkParts) {
        this.chunkX = shape.chunkX;
        this.chunkZ = shape.chunkZ;
        this.minY = shape.minY;
        this.height = shape.height;
        this.persistedStatus = status;
        this.biomeCellsY = Math.ceil(shape.height / BIOME_CELL);
        this.blockPalette = parts.blockPalette;
        this.blockSlots = new Map(parts.blockPalette.map((key, slot) => [key, slot]));
        this.biomePalette = parts.biomePalette;
        this.biomeSlots = new Map(parts.biomePalette.map((key, slot) => [key, slot]));
        this.blocks = parts.blocks;
        this.biomes = parts.biomes;
        this.heights = parts.heights;
        this.blockEntities = parts.blockEntities;
        this.entitySpawns = parts.entitySpawns;
    }

    /** An empty chunk at `empty`: every block air, every biome plains, every height at `minY`. */
    public static create(shape: ProtoChunkShape): ProtoChunk {
        const cellsY = Math.ceil(shape.height / BIOME_CELL);
        return new ProtoChunk(shape, 'empty', {
            blockPalette: [AIR],
            blocks: new Uint16Array(COLUMN_COUNT * shape.height),
            biomePalette: [DEFAULT_BIOME],
            biomes: new Uint16Array(BIOME_CELLS_PER_AXIS * BIOME_CELLS_PER_AXIS * cellsY),
            heights: new Int32Array(HEIGHTMAPS.length * COLUMN_COUNT).fill(shape.minY),
            blockEntities: [],
            entitySpawns: []
        });
    }

    /**
     * Rebuilds a chunk from a payload that arrived on this thread, without copying a buffer.
     *
     * The typed arrays are views onto the payload's buffers, so the payload is spent once this
     * returns and the chunk owns the bytes.
     */
    public static adopt(payload: ProtoChunkPayload): ProtoChunk {
        return new ProtoChunk(payload, payload.status, {
            blockPalette: [...payload.blockPalette],
            blocks: new Uint16Array(payload.blocks),
            biomePalette: [...payload.biomePalette],
            biomes: new Uint16Array(payload.biomes),
            heights: new Int32Array(payload.heightmaps),
            blockEntities: [...payload.blockEntities],
            entitySpawns: [...payload.entitySpawns]
        });
    }

    /** The status this chunk has reached. */
    public get status(): ChunkStatus {
        return this.persistedStatus;
    }

    /** The highest y the chunk holds. */
    public get maxY(): number {
        return this.minY + this.height - 1;
    }

    /** How many bytes the three typed arrays hold, which is what a transfer moves. */
    public get byteLength(): number {
        this.requireAttached();
        return this.blocks.byteLength + this.biomes.byteLength + this.heights.byteLength;
    }

    /** The block entities recorded so far, in the order they were recorded. */
    public get recordedBlockEntities(): readonly ProtoBlockEntity[] {
        return this.blockEntities;
    }

    /** The entity spawns recorded so far, in the order they were recorded. */
    public get recordedEntitySpawns(): readonly ProtoEntitySpawn[] {
        return this.entitySpawns;
    }

    /**
     * Records that the chunk has reached a higher status.
     *
     * @throws ChunkStatusRegressionError when the target is not above the current status. Each
     * (chunk, status) body runs exactly once, so a chunk that reached `terrain` twice means two
     * bodies ran on it, which is the bug this refuses to hide.
     */
    public advanceTo(status: ChunkStatus): void {
        if (isOrAfter(this.persistedStatus, status)) throw new ChunkStatusRegressionError(this.persistedStatus, status);
        this.persistedStatus = status;
    }

    /** The Java state key at a world position, or `minecraft:air` outside the chunk. */
    public blockAt(x: number, y: number, z: number): string {
        this.requireAttached();
        const index = this.blockIndexOf(x, y, z);
        return index === -1 ? AIR : (this.blockPalette[this.blocks[index] ?? 0] ?? AIR);
    }

    /**
     * Writes a Java state key, growing the palette when the key is new.
     *
     * @returns Whether the position was inside the chunk, so the write landed.
     */
    public setBlock(x: number, y: number, z: number, key: string): boolean {
        this.requireAttached();
        const index = this.blockIndexOf(x, y, z);
        if (index === -1) return false;
        this.blocks[index] = slotFor(key, this.blockPalette, this.blockSlots);
        return true;
    }

    /** The biome identifier covering a world position, which Java resolves per 4 by 4 by 4 cell. */
    public biomeAt(x: number, y: number, z: number): string {
        this.requireAttached();
        const index = this.biomeIndexOf(x, y, z);
        return index === -1 ? DEFAULT_BIOME : (this.biomePalette[this.biomes[index] ?? 0] ?? DEFAULT_BIOME);
    }

    /**
     * Writes the biome of the 4 by 4 by 4 cell a world position falls in.
     *
     * @returns Whether the position was inside the chunk, so the write landed.
     */
    public setBiome(x: number, y: number, z: number, biome: string): boolean {
        this.requireAttached();
        const index = this.biomeIndexOf(x, y, z);
        if (index === -1) return false;
        this.biomes[index] = slotFor(biome, this.biomePalette, this.biomeSlots);
        return true;
    }

    /** The recorded height of one column, which is the y above the highest matching block. */
    public heightAt(map: HeightmapName, x: number, z: number): number {
        this.requireAttached();
        const index = this.heightIndexOf(map, x, z);
        return index === -1 ? this.minY : (this.heights[index] ?? this.minY);
    }

    /**
     * Records the height of one column.
     *
     * @returns Whether the column was inside the chunk, so the write landed.
     */
    public setHeight(map: HeightmapName, x: number, z: number, y: number): boolean {
        this.requireAttached();
        const index = this.heightIndexOf(map, x, z);
        if (index === -1) return false;
        this.heights[index] = y;
        return true;
    }

    /** Records a block entity for the server to build once the chunk is promoted. */
    public addBlockEntity(entity: ProtoBlockEntity): void {
        this.requireAttached();
        this.blockEntities.push(entity);
    }

    /** Records an entity spawn request for the server to act on once the chunk is promoted. */
    public addEntitySpawn(spawn: ProtoEntitySpawn): void {
        this.requireAttached();
        this.entitySpawns.push(spawn);
    }

    /**
     * Packs the chunk for `postMessage` and gives its buffers up.
     *
     * The chunk is spent once this returns, whether or not the caller posts the payload, because
     * the buffers are already promised to the other side. Using it again raises
     * {@link ProtoChunkDetachedError} rather than reading the zeros a detached buffer reads as.
     *
     * @returns The payload and the three `ArrayBuffer`s to pass as the transfer list.
     */
    public transfer(): ProtoChunkTransfer {
        this.requireAttached();
        const payload: ProtoChunkPayload = {
            chunkX: this.chunkX,
            chunkZ: this.chunkZ,
            minY: this.minY,
            height: this.height,
            status: this.persistedStatus,
            blockPalette: this.blockPalette,
            blocks: this.blocks.buffer,
            biomePalette: this.biomePalette,
            biomes: this.biomes.buffer,
            heightmaps: this.heights.buffer,
            blockEntities: this.blockEntities,
            entitySpawns: this.entitySpawns
        };
        this.transferred = true;
        return { payload, transferList: [this.blocks.buffer, this.biomes.buffer, this.heights.buffer] };
    }

    /**
     * Index into the flat block buffer, or -1 outside the chunk.
     *
     * The order is `GenerationRegion`'s: x slowest, then z, then y fastest within a column.
     */
    private blockIndexOf(x: number, y: number, z: number): number {
        if (y < this.minY || y > this.maxY) return -1;
        const column = this.columnIndexOf(x, z);
        return column === -1 ? -1 : column * this.height + (y - this.minY);
    }

    private biomeIndexOf(x: number, y: number, z: number): number {
        if (y < this.minY || y > this.maxY) return -1;
        const column = this.columnIndexOf(x, z);
        if (column === -1) return -1;

        const localX = Math.trunc(column / CHUNK_WIDTH);
        const localZ = column % CHUNK_WIDTH;
        const cell = (localX >> 2) * BIOME_CELLS_PER_AXIS + (localZ >> 2);
        return cell * this.biomeCellsY + ((y - this.minY) >> 2);
    }

    private heightIndexOf(map: HeightmapName, x: number, z: number): number {
        const column = this.columnIndexOf(x, z);
        return column === -1 ? -1 : HEIGHTMAPS.indexOf(map) * COLUMN_COUNT + column;
    }

    private columnIndexOf(x: number, z: number): number {
        const localX = x - this.chunkX * CHUNK_WIDTH;
        const localZ = z - this.chunkZ * CHUNK_WIDTH;
        if (localX < 0 || localX >= CHUNK_WIDTH || localZ < 0 || localZ >= CHUNK_WIDTH) return -1;
        return localX * CHUNK_WIDTH + localZ;
    }

    private requireAttached(): void {
        if (this.transferred) throw new ProtoChunkDetachedError(this.chunkX, this.chunkZ);
    }
}

/** Appends to a palette on first sight and returns the slot, which is the only write path into one. */
const slotFor = (key: string, palette: string[], slots: Map<string, number>): number => {
    const existing = slots.get(key);
    if (existing !== undefined) return existing;

    const slot = palette.push(key) - 1;
    slots.set(key, slot);
    return slot;
};
