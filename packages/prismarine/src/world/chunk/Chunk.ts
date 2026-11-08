import type { BlockState } from '../../block/state/BlockState';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';

import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import SubChunkHeightmapData, { HeightMapDataType } from '@jsprismarine/protocol/structure/SubChunkHeightmapData';
import type { Block } from '../../block/Block';
import type { BlockEntity } from '../../blockentity/BlockEntity';
import { Furnace, MobSpawner } from '../../blockentity/BlockEntities';
import { Dimensions, maxSubChunk, maxY, minSubChunk, subChunkCount } from '../Dimension';
import type { DimensionType } from '../Dimension';
import type { EntitySpawn } from '../EntitySpawn';
import { ChunkBiomes } from './ChunkBiomes';
import BlockStorage from './BlockStorage';
import SubChunk from './SubChunk';
import { sectionTakesRandomTicks } from '../randomTickSections';

/**
 * The vertical range the client gives a dimension id, which is the range a chunk payload has to
 * cover whatever shape the server's own definition has. A vanilla type shallower than the
 * client's range, such as the 0..255 Overworld the server once had, owes it padding below; the
 * Nether and the End are not padded and carry 8 and 16 biome sections rather than the
 * Overworld's 24. A custom type has no
 * built-in range: `DimensionData` told the client the type's own bounds, so those are the range.
 */
const clientRangeOf = (dimension: DimensionType): DimensionType => {
    if (dimension.custom) return dimension;
    return (
        [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd].find(
            (candidate) => candidate.bedrockId === dimension.bedrockId
        ) ?? Dimensions.Overworld
    );
};

/** How many bits of each chunk axis a packed key carries. See {@link Chunk.packXZ}. */
const CHUNK_KEY_BITS = 22;
const CHUNK_KEY_MASK = (1 << CHUNK_KEY_BITS) - 1;
const CHUNK_KEY_STRIDE = 1 << CHUNK_KEY_BITS;

/** Reads one packed axis back as the signed coordinate it was. */
const signExtendChunkAxis = (axis: number): number => (axis << (32 - CHUNK_KEY_BITS)) >> (32 - CHUNK_KEY_BITS);

/** The persisted parts a chunk write needs to update. */
export interface ChunkPersistenceChanges {
    /** This chunk has never been written to its provider. */
    readonly initial: boolean;
    /** Changed sub chunks, with whether the corresponding database key should exist. */
    readonly subChunks: readonly {
        readonly index: number;
        readonly subChunk: SubChunk | null;
        readonly stored: boolean;
    }[];
    /** Whether heightmap or biome data changed. */
    readonly data3D: boolean;
    /** Whether the chunk's block-entity record changed. */
    readonly blockEntities: boolean;
    /** Whether tracked actor membership or location changed. */
    readonly entities: boolean;
}

/** The serialized bytes and source revision for one chunk blob. */
export interface ChunkNetworkBlobPart {
    /** The sub chunk whose network revision identifies these bytes. */
    readonly subChunk: SubChunk;
    /** Revision sampled when the bytes were written. */
    readonly revision: number;
    /** The exact byte range written into an uncached LevelChunk payload. */
    readonly bytes: Buffer;
}

/** A chunk payload split into the client-cache blobs and the uncached packet tail. */
export interface ChunkNetworkBlobs {
    /** Chunk revision sampled when all payload bytes were written. */
    readonly revision: number;
    /** The ordinary, uncached LevelChunk payload. */
    readonly payload: Buffer;
    /** Border blocks and block entities, which remain in a cached LevelChunk payload. */
    readonly cachedPayload: Buffer;
    /** Serialized sub chunks in the order they appear in `payload`. */
    readonly subChunks: readonly ChunkNetworkBlobPart[];
    /** The biome palette and section revisions used by the final blob. */
    readonly biomes: {
        readonly identity: ChunkBiomes;
        readonly revision: number;
        readonly bytes: Buffer;
    };
}

export default class Chunk {
    private x: number;
    private z: number;
    private hasChanged: boolean;
    private readonly dimension: DimensionType;
    private readonly minSubChunkY: number;
    private readonly subChunks: Array<SubChunk | undefined>;
    private readonly subChunkOrder: number[] = [];
    private storedSubChunkCount = 0;
    /** The block revision and the write epoch and layout it was summed under. */
    private readonly blockRevisionCache = { epoch: -1, layout: -1, total: 0 };
    private subChunkLayoutRevision = 0;
    private cachedRandomTickLayoutRevision = -1;
    private cachedRandomTickSectionRevision = -1;
    /** The process-wide write count at the last check, which no write has moved since if it still matches. */
    private cachedRandomTickEpoch = -1;
    private cachedRandomTickSections: readonly number[] = [];

    /**
     * The chests, signs and furnaces standing in this chunk, keyed by position.
     *
     * Held here rather than in the world so that saving a chunk saves what is in it - a chest and
     * its contents travel together, and a chunk that was never loaded cannot lose them.
     */
    private readonly blockEntities: Map<number, BlockEntity> = new Map();
    /** Stable insertion positions keep filtered tick indexes in the Map's iteration order. */
    private readonly blockEntityOrder = new Map<number, number>();
    private nextBlockEntityOrder = 0;
    private readonly furnaces: Array<{ readonly index: number; readonly order: number; readonly entity: Furnace }> = [];
    private readonly mobSpawners: Array<{
        readonly index: number;
        readonly order: number;
        readonly entity: MobSpawner;
    }> = [];
    private cachedFurnaces: readonly Furnace[] | undefined;
    private cachedMobSpawners: readonly MobSpawner[] | undefined;
    private blockEntityRevision = 0;

    /** Actor changes are separate from block state, so moving one never dirties its block records. */
    private entityRevision = 0;

    /**
     * Which biome each block is in.
     *
     * Part of the chunk rather than of the generator's output, because it has to survive a save
     * and a reload: the client colors grass, tints the sky and picks ambient sound from it, and
     * the spawn rules read it through `has_biome_tag`.
     */
    private biomes: ChunkBiomes;
    private biomesEpoch = 0;

    /** Entity NBT read from disk, waiting for the world to restore it. */
    private readonly storedEntities: NBTTagCompound[] = [];

    /**
     * Mobs world generation put here, waiting for a world to create them in.
     *
     * Not saved and not part of the chunk's contents: it is a handover between the generator, which
     * has no world, and the world, which drains it the first time the chunk is loaded. A chunk read
     * back from disk has none, because by then its villagers are ordinary saved entities.
     */
    private readonly entitySpawns: EntitySpawn[] = [];

    /**
     * The serialized form, kept until blocks, block entities, or biomes change.
     *
     * Ten players standing in the same area used to cost ten identical serialisations of
     * the same chunk, at ~0.3 ms each. The saving grows with the number of players, which
     * is exactly the case that has to hold up.
     */
    private serialized: Buffer | null = null;

    /** What {@link getNetworkRevision} read when {@link serialized} was built. */
    private serializedAt = -1;
    /** The same network revision split into client-cache blobs when a client asks for them. */
    private serializedNetworkBlobs: ChunkNetworkBlobs | null = null;
    private serializedRequestSkeleton: Buffer | null = null;
    private serializedRequestSkeletonAt = -1;
    private readonly serializedRequestSubChunks = new Map<
        number,
        { readonly revision: number; readonly bytes: Buffer }
    >();
    private networkHeightmap: { readonly revision: number; readonly values: Uint16Array } | null = null;
    private networkRevision = 0;
    private observedSubChunkRevisions: number[] = [];
    private observedStoredSubChunkCount = -1;
    private observedBiomesEpoch = -1;
    private observedBiomeRevision = -1;
    private observedBlockEntityRevision = -1;
    private persistenceInitialized = false;
    private persistedSubChunkRevisions = new Map<number, number>();
    private persistedSubChunkKeys = new Set<number>();
    private persistedBiomeEpoch = -1;
    private persistedBiomeRevision = -1;
    private persistedBlockEntityRevision = -1;
    private persistedEntityRevision = -1;
    private persistedBlockEntitiesPresent = false;
    private static readonly EMPTY_SUBCHUNK = new SubChunk();

    public constructor(
        chunkX = 0,
        chunkZ = 0,
        subChunks: Map<number, SubChunk> = new Map(),
        dimension: DimensionType = Dimensions.Overworld
    ) {
        this.x = chunkX;
        this.z = chunkZ;
        this.hasChanged = false;
        this.dimension = dimension;
        this.minSubChunkY = minSubChunk(dimension);
        this.subChunks = new Array(subChunkCount(dimension));
        this.biomes = new ChunkBiomes(dimension);

        // The argument used to be ignored, so every chunk read back from disk came out empty and
        // the provider silently regenerated terrain on each load.
        for (const [index, subChunk] of subChunks) this.setSubChunk(index, subChunk);
    }

    /** The biome of every block in this chunk, live, for a generator or a provider to write. */
    public getBiomes(): ChunkBiomes {
        return this.biomes;
    }

    /**
     * Replaces the whole biome column, which is what reading one back from disk does.
     *
     * The payload revision tracks the palette itself, while the epoch distinguishes replacing a
     * palette with another instance at the same revision.
     */
    public setBiomes(biomes: ChunkBiomes): void {
        this.biomes = biomes;
        this.biomesEpoch++;
        this.invalidateNetworkSerialization();
    }

    /** The biome at a position, with x and z in world coordinates. */
    public getBiome(x: number, y: number, z: number): number {
        return this.biomes.get(x & 0xf, y, z & 0xf);
    }

    /**
     * The `Data3D` heightmap: one past the highest non-air block of each column, measured from
     * the dimension floor so it stays unsigned, indexed `x * 16 + z`.
     */
    public heightmap(): Uint16Array {
        return new Uint16Array(this.heightmapForNetwork());
    }

    /** Writes the biome-and-border tail required by a request-mode LevelChunk. */
    public networkSerializeRequestSkeleton(): Buffer {
        const revision = this.getNetworkRevision();
        if (this.serializedRequestSkeleton !== null && this.serializedRequestSkeletonAt === revision) {
            return this.serializedRequestSkeleton;
        }

        const stream = new BinaryStream();
        const client = clientRangeOf(this.dimension);
        this.biomes.networkSerialize(stream, subChunkCount(client), minSubChunk(client));

        // Request-mode LevelChunk packets carry no block entities; each one travels with its
        // requested sub chunk so the client never sees an actor beside an unreceived block.
        stream.writeByte(0);

        this.serializedRequestSkeleton = stream.getBuffer();
        this.serializedRequestSkeletonAt = revision;
        return this.serializedRequestSkeleton;
    }

    /**
     * Serializes one requested sub chunk and only the block entities that belong to it.
     * @param y - Absolute subchunk index, including client padding for a shallow vanilla dimension.
     */
    public networkSerializeRequestSubChunk(y: number): Buffer {
        const client = clientRangeOf(this.dimension);
        if (!Number.isInteger(y) || y < minSubChunk(client) || y > maxSubChunk(client)) {
            throw new RangeError(`Invalid subchunk height: ${y}`);
        }

        const revision = this.getNetworkRevision();
        const cached = this.serializedRequestSubChunks.get(y);
        if (cached?.revision === revision) return cached.bytes;

        const stream = new BinaryStream();
        (this.subChunkAtIndex(y) ?? Chunk.EMPTY_SUBCHUNK).networkSerialize(stream);

        if (this.blockEntities.size > 0) {
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            for (const blockEntity of this.blockEntities.values()) {
                if (blockEntity.getPosition().getY() >> 4 === y) writer.writeCompound(blockEntity.toNBT());
            }
        }

        const bytes = stream.getBuffer();
        this.serializedRequestSubChunks.set(y, { revision, bytes });
        return bytes;
    }

    /**
     * Describes how this sub chunk contributes to the regular and render heightmaps.
     * @param y - Absolute subchunk index.
     */
    public networkSubChunkHeightmaps(y: number): SubChunkHeightmapData {
        const client = clientRangeOf(this.dimension);
        if (!Number.isInteger(y) || y < minSubChunk(client) || y > maxSubChunk(client)) {
            throw new RangeError(`Invalid subchunk height: ${y}`);
        }

        const baseY = y * 16;
        const heightmap: number[][] = Array.from({ length: 16 }, () => new Array<number>(16));
        let allTooHigh = true;
        let allTooLow = true;
        const values = this.heightmapForNetwork();

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const relativeTop = values[x * 16 + z]!;
                const highestY = relativeTop === 0 ? null : this.dimension.minY + relativeTop - 1;
                if (highestY === null || highestY < baseY) {
                    allTooHigh = false;
                    heightmap[z]![x] = -1;
                } else if (highestY >= baseY + 16) {
                    allTooLow = false;
                    heightmap[z]![x] = 16;
                } else {
                    allTooHigh = false;
                    allTooLow = false;
                    heightmap[z]![x] = highestY - baseY;
                }
            }
        }

        const heightMapType = allTooHigh
            ? HeightMapDataType.ALL_TOO_HIGH
            : allTooLow
              ? HeightMapDataType.ALL_TOO_LOW
              : HeightMapDataType.HAS_DATA;
        const heightMap = heightMapType === HeightMapDataType.HAS_DATA ? heightmap : undefined;

        return new SubChunkHeightmapData(heightMapType, heightMap, HeightMapDataType.ALL_COPIED);
    }

    /**
     * How many sub chunks, counted up from the bottom of the client range, a client in request
     * mode may fetch with `SubChunkRequestPacket`.
     *
     * A count and not the index of the last one, which is how a 2225 client reads it: a column
     * that only fills its lowest sub chunk, like a flat world, must say 1, as an index it is 0
     * and that client requests nothing, so it never gets the floor under it and falls out of the
     * world. A 2193 client is still sent the index; `PlayerSession` makes that adjustment per client.
     */
    public getNetworkSubChunkRequestLimit(): number {
        return this.getNetworkSubChunkCount();
    }

    private heightmapForNetwork(): Uint16Array {
        const revision = this.getNetworkRevision();
        if (this.networkHeightmap?.revision === revision) return this.networkHeightmap.values;

        const heights = new Uint16Array(256);

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const highest = this.getHighestBlockAt(x, z);
                heights[x * 16 + z] = highest === null ? 0 : highest + 1 - this.dimension.minY;
            }
        }

        this.networkHeightmap = { revision, values: heights };
        return heights;
    }

    public getX(): number {
        return this.x;
    }

    public getZ(): number {
        return this.z;
    }

    public getHasChanged(): boolean {
        return this.hasChanged;
    }

    /**
     * Records that this chunk now matches what is on disk.
     *
     * Without it `hasChanged` only ever goes true, so every chunk a player has walked through is
     * rewritten on every save for the rest of the session - and a chunk that was only *read* from
     * disk would be written straight back out.
     */
    public markSaved(): void {
        this.hasChanged = false;
        const subChunkKeys = new Set<number>();
        for (const index of this.subChunkOrder) {
            const subChunk = this.subChunkAtIndex(index);
            if (
                subChunk !== null &&
                (!subChunk.isEmpty() ||
                    (this.persistedSubChunkKeys.has(index) &&
                        this.persistedSubChunkRevisions.get(index) === subChunk.getRevision()))
            ) {
                subChunkKeys.add(index);
            }
        }
        const blockEntitiesPresent =
            this.blockEntities.size > 0 ||
            (this.persistedBlockEntitiesPresent && this.persistedBlockEntityRevision === this.blockEntityRevision);
        this.recordPersistedState(subChunkKeys, blockEntitiesPresent);
    }

    /** Marks this chunk dirty when a non-block change needs to be written. */
    public markChanged(): void {
        this.hasChanged = true;
    }

    /** Marks an actor-only edit, without marking block, biome, or block-entity data dirty. */
    public markEntitiesChanged(): void {
        this.hasChanged = true;
        this.entityRevision++;
    }

    /** Records the exact sub chunk keys found when a provider loads this chunk. */
    public markLoadedFromDisk(subChunkKeys: Iterable<number>, blockEntitiesPresent: boolean): void {
        this.recordPersistedState(subChunkKeys, blockEntitiesPresent);
        this.hasChanged = false;
    }

    /** The provider's section-level write plan, derived from the last successful save. */
    public getPersistenceChanges(): ChunkPersistenceChanges {
        const initial = !this.persistenceInitialized;
        const indices = new Set([...this.persistedSubChunkRevisions.keys(), ...this.subChunkOrder]);
        const subChunks: Array<{ index: number; subChunk: SubChunk | null; stored: boolean }> = [];

        for (const index of indices) {
            const subChunk = this.subChunkAtIndex(index);
            const revision = subChunk?.getRevision() ?? -1;
            const wasStored = this.persistedSubChunkKeys.has(index);
            const wasChanged = initial || this.persistedSubChunkRevisions.get(index) !== revision;
            const shouldBeStored = subChunk === null ? false : wasChanged ? !subChunk.isEmpty() : wasStored;
            if (wasChanged || shouldBeStored !== wasStored) {
                if (shouldBeStored || wasStored) subChunks.push({ index, subChunk, stored: shouldBeStored });
            }
        }

        const biomeRevision = this.biomes.getRevision();
        const data3D =
            initial || this.persistedBiomeEpoch !== this.biomesEpoch || this.persistedBiomeRevision !== biomeRevision;
        const blockEntities =
            initial ||
            this.persistedBlockEntityRevision !== this.blockEntityRevision ||
            this.persistedBlockEntitiesPresent !== this.blockEntities.size > 0;
        const entities = initial || this.persistedEntityRevision !== this.entityRevision;

        return { initial, subChunks, data3D: data3D || subChunks.length > 0, blockEntities, entities };
    }

    private recordPersistedState(
        subChunkKeys: Iterable<number>,
        blockEntitiesPresent = this.blockEntities.size > 0
    ): void {
        this.persistenceInitialized = true;
        this.persistedSubChunkRevisions = new Map(
            this.subChunkOrder.map((index) => [index, this.subChunkAtIndex(index)?.getRevision() ?? -1])
        );
        this.persistedSubChunkKeys = new Set(subChunkKeys);
        this.persistedBiomeEpoch = this.biomesEpoch;
        this.persistedBiomeRevision = this.biomes.getRevision();
        this.persistedBlockEntityRevision = this.blockEntityRevision;
        this.persistedEntityRevision = this.entityRevision;
        this.persistedBlockEntitiesPresent = blockEntitiesPresent;
    }

    /** Holds an actor read from disk until the world can create it. */
    public addStoredEntity(entity: NBTTagCompound): void {
        this.storedEntities.push(entity);
    }

    /** Hands off actors read from disk and forgets them. */
    public takeStoredEntities(): NBTTagCompound[] {
        return this.storedEntities.splice(0, this.storedEntities.length);
    }

    public getDimension(): DimensionType {
        return this.dimension;
    }

    public getMinY(): number {
        return this.dimension.minY;
    }

    public getMaxY(): number {
        return maxY(this.dimension);
    }

    public getHeight(): number {
        return this.storedSubChunkCount;
    }

    /**
     * The index one above the highest sub chunk holding anything, so empty ones off the top are
     * not sent.
     *
     * Absolute, and so negative for a column that is empty above the floor - callers wanting a
     * count want {@link getSubChunkCount}.
     */
    public getTopEmpty(): number {
        const floor = minSubChunk(this.dimension);
        let topEmpty = maxSubChunk(this.dimension);

        while (topEmpty >= floor && (this.subChunkAtIndex(topEmpty)?.isEmpty() ?? true)) {
            topEmpty--;
        }

        return topEmpty + 1;
    }

    /** How many sub chunks the network payload carries, counting up from the dimension floor. */
    public getSubChunkCount(): number {
        return this.getTopEmpty() - minSubChunk(this.dimension);
    }

    /**
     * One past the highest y this chunk stores a block for.
     *
     * Everything above it is air, because {@link getBlock} answers with air for a y no sub chunk
     * covers. The light engine reads it to start a fresh chunk's column scan below the open sky
     * rather than at the world ceiling, which is most of the blocks it would otherwise read.
     *
     * Sub chunk resolution rather than per column, and deliberately not {@link getTopEmpty}: a
     * sub chunk that exists is counted whether or not it holds anything, because "its palette has
     * one entry" is not the same statement as "it is all air", and this answer has to be an upper
     * bound that no block sits above.
     * @returns {number} One past the highest stored y, or the dimension floor for a chunk that
     * holds no sub chunk at all.
     */
    public getTopStoredY(): number {
        let top = this.dimension.minY;
        for (const index of this.subChunkOrder) {
            const above = (index + 1) * 16;
            if (above > top) top = above;
        }

        return top;
    }

    /**
     * Returns the Chunk slice at the given index, which is signed - the Overworld's floor is -4.
     * @param {number} y - The sub chunk index to get.
     */
    public getSubChunk(y: number): SubChunk | null {
        if (y < minSubChunk(this.dimension) || y > maxSubChunk(this.dimension)) {
            throw new Error(`Invalid subchunk height: ${y}`);
        }

        return this.subChunkAtIndex(y);
    }

    /**
     * Packs section indices after generation or loading completes.
     *
     * @internal The world calls this once the provider has finished every write to the chunk.
     */
    public packBlockStorage(): void {
        for (const [, subChunk] of this.getSubChunkEntries()) {
            for (const storage of subChunk.getStorages()) storage.pack();
        }
        this.invalidateNetworkSerialization();
    }

    public getOrCreateSubChunk(y: number): SubChunk {
        const subChunk = new SubChunk();
        this.setSubChunk(y, subChunk);
        return subChunk;
    }

    /** Iterates stored sub chunks in insertion order without allocating a Map view. */
    public *getSubChunkEntries(): IterableIterator<[number, SubChunk]> {
        for (const index of this.subChunkOrder) {
            yield [index, this.subChunks[index - this.minSubChunkY]!];
        }
    }

    /** Returns a Map snapshot of stored sub chunks in insertion order. */
    public getSubChunks(): Map<number, SubChunk> {
        return new Map(this.getSubChunkEntries());
    }

    private subChunkAtIndex(index: number): SubChunk | null {
        const offset = index - this.minSubChunkY;
        if (offset < 0 || offset >= this.subChunks.length) return null;
        return this.subChunks[offset] ?? null;
    }

    private setSubChunk(index: number, subChunk: SubChunk): void {
        const offset = index - this.minSubChunkY;
        if (offset < 0 || offset >= this.subChunks.length) {
            throw new Error(`Invalid subchunk height: ${index}`);
        }

        if (this.subChunks[offset] === undefined) {
            this.subChunkOrder.push(index);
            this.storedSubChunkCount++;
        }
        if (this.subChunks[offset] !== subChunk) this.subChunkLayoutRevision++;
        this.subChunks[offset] = subChunk;
    }

    /** Sections that can draw random-tick positions, cached until their stored blocks change. */
    public getRandomTickSections(): readonly number[] {
        // No block was written anywhere since the last check, so there is nothing to sum.
        if (
            this.cachedRandomTickEpoch === BlockStorage.writeEpoch &&
            this.cachedRandomTickLayoutRevision === this.subChunkLayoutRevision
        )
            return this.cachedRandomTickSections;

        // SubChunk revisions only increase, so their sum changes on every block write. The
        // separate layout revision catches replacing a section with another at a lower revision.
        const epoch = BlockStorage.writeEpoch;
        let sectionRevision = 0;
        for (const index of this.subChunkOrder)
            sectionRevision += this.subChunks[index - this.minSubChunkY]!.getRevision();

        if (
            this.cachedRandomTickLayoutRevision === this.subChunkLayoutRevision &&
            this.cachedRandomTickSectionRevision === sectionRevision
        ) {
            this.cachedRandomTickEpoch = epoch;
            return this.cachedRandomTickSections;
        }

        const sections: number[] = [];
        for (const index of this.subChunkOrder) {
            if (sectionTakesRandomTicks(this.subChunks[index - this.minSubChunkY]!)) sections.push(index);
        }

        this.cachedRandomTickLayoutRevision = this.subChunkLayoutRevision;
        this.cachedRandomTickSectionRevision = sectionRevision;
        this.cachedRandomTickEpoch = epoch;
        this.cachedRandomTickSections = sections;
        return sections;
    }

    /**
     * The index a block entity is filed under.
     *
     * The y offset is taken from the dimension floor so the whole 384 block range is a positive
     * number, which keeps the key a plain integer rather than something that has to encode a sign.
     */
    private blockEntityIndex(x: number, y: number, z: number): number {
        return (((y - this.dimension.minY) & 0x1ff) << 8) | ((x & 0xf) << 4) | (z & 0xf);
    }

    public getBlockEntity(x: number, y: number, z: number): BlockEntity | null {
        return this.blockEntities.get(this.blockEntityIndex(x, y, z)) ?? null;
    }

    /** Files a block entity at its own position, which it carries in world coordinates. */
    public setBlockEntity(blockEntity: BlockEntity): void {
        const position = blockEntity.getPosition();
        const index = this.blockEntityIndex(position.getX(), position.getY(), position.getZ());
        const previous = this.blockEntities.get(index);
        let order = this.blockEntityOrder.get(index);
        if (order === undefined) {
            order = this.nextBlockEntityOrder++;
            this.blockEntityOrder.set(index, order);
        } else if (previous instanceof Furnace) {
            this.removeIndexedBlockEntity(this.furnaces, index);
        } else if (previous instanceof MobSpawner) {
            this.removeIndexedBlockEntity(this.mobSpawners, index);
        }

        if (previous instanceof Furnace || blockEntity instanceof Furnace) this.cachedFurnaces = undefined;
        if (previous instanceof MobSpawner || blockEntity instanceof MobSpawner) this.cachedMobSpawners = undefined;
        this.blockEntities.set(index, blockEntity);
        if (blockEntity instanceof Furnace)
            this.insertIndexedBlockEntity(this.furnaces, { index, order, entity: blockEntity });
        else if (blockEntity instanceof MobSpawner)
            this.insertIndexedBlockEntity(this.mobSpawners, { index, order, entity: blockEntity });

        this.hasChanged = true;
        this.blockEntityRevision++;
        this.invalidateNetworkSerialization();
    }

    public removeBlockEntity(x: number, y: number, z: number): boolean {
        const index = this.blockEntityIndex(x, y, z);
        const removedEntity = this.blockEntities.get(index);
        const removed = this.blockEntities.delete(index);
        if (removed) {
            this.blockEntityOrder.delete(index);
            if (removedEntity instanceof Furnace) {
                this.removeIndexedBlockEntity(this.furnaces, index);
                this.cachedFurnaces = undefined;
            } else if (removedEntity instanceof MobSpawner) {
                this.removeIndexedBlockEntity(this.mobSpawners, index);
                this.cachedMobSpawners = undefined;
            }
            this.hasChanged = true;
            this.blockEntityRevision++;
            this.invalidateNetworkSerialization();
        }

        return removed;
    }

    /**
     * The mob spawn list, live, for a generation pass to append to.
     * @returns {EntitySpawn[]} The list itself, not a copy.
     */
    public getEntitySpawns(): EntitySpawn[] {
        return this.entitySpawns;
    }

    /**
     * Hands over the mobs generation left here and forgets them.
     *
     * Draining rather than reading is what makes this safe to call on every load: a chunk that has
     * already had its villagers created has nothing left to hand over, so unloading and reloading
     * the area cannot breed a second village worth of them.
     * @returns {EntitySpawn[]} What was waiting, which may be nothing.
     */
    public takeEntitySpawns(): EntitySpawn[] {
        return this.entitySpawns.splice(0, this.entitySpawns.length);
    }

    public getBlockEntities(): IterableIterator<BlockEntity> {
        return this.blockEntities.values();
    }

    /** Furnaces in their original insertion order, without scanning unrelated entities. */
    public getFurnaces(): IterableIterator<Furnace> {
        const snapshot = (this.cachedFurnaces ??= this.furnaces.map(({ entity }) => entity));
        return snapshot[Symbol.iterator]();
    }

    /** Spawners in their original insertion order, without scanning unrelated entities. */
    public getMobSpawners(): IterableIterator<MobSpawner> {
        const snapshot = (this.cachedMobSpawners ??= this.mobSpawners.map(({ entity }) => entity));
        return snapshot[Symbol.iterator]();
    }

    /** Number of block entities with a per-tick update. */
    public getTickableBlockEntityCount(): number {
        return this.furnaces.length + this.mobSpawners.length;
    }

    private insertIndexedBlockEntity<T extends BlockEntity>(
        entries: Array<{ readonly index: number; readonly order: number; readonly entity: T }>,
        entry: { readonly index: number; readonly order: number; readonly entity: T }
    ): void {
        let low = 0;
        let high = entries.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (entries[middle]!.order < entry.order) low = middle + 1;
            else high = middle;
        }
        entries.splice(low, 0, entry);
    }

    private removeIndexedBlockEntity<T extends BlockEntity>(
        entries: Array<{ readonly index: number; readonly order: number; readonly entity: T }>,
        index: number
    ): void {
        const entryIndex = entries.findIndex((entry) => entry.index === index);
        if (entryIndex !== -1) entries.splice(entryIndex, 1);
    }

    /**
     * The height of the topmost block that is not air, or null for an empty column.
     *
     * Used to find ground to stand on. It walks down from the highest sub chunk that holds
     * anything rather than from the world ceiling, so an ordinary column costs a handful of
     * reads instead of the full height.
     *
     * Null rather than -1: with a floor below zero, -1 is a real height a real block can sit at.
     */
    public getHighestBlockAt(x: number, z: number): number | null {
        const air = BlockRuntimeIds.getByName('minecraft:air');

        for (let y = this.getTopEmpty() * 16 - 1; y >= this.dimension.minY; y--) {
            if (this.getBlockRuntimeId(x & 0xf, y, z & 0xf) !== air) return y;
        }

        return null;
    }

    /**
     * Returns block legacy id (DATA) in the corresponding sub chunk.
     * Use world to get the actual block instance (this is to keep code clean).
     * @param {Vector3 | number} x - block x.
     * @param {number} [y=0] - block y.
     * @param {number} [z=0] - block z.
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids).
     */
    public getBlock(x: Vector3 | number, y: number = 0, z: number = 0, layer = 0): BlockState {
        if (x instanceof Vector3) {
            return this.getBlock(x.getX(), x.getY(), x.getZ(), layer);
        }

        const subChunk = this.subChunkAt(y);
        if (!subChunk) return BlockStateSchemas.get('minecraft:air')!.getDefaultState();
        return subChunk.getBlock(x, y & 0xf, z, layer);
    }

    /**
     * The sub chunk holding `y`, or null when there is none - including when `y` is outside the
     * dimension entirely. Reading past the floor or the ceiling is air, not an error; only the
     * structural {@link getSubChunk} is strict about its index.
     */
    private subChunkAt(y: number): SubChunk | null {
        if (y < this.dimension.minY || y > maxY(this.dimension)) return null;

        // `>> 4` floors towards negative infinity, which is what a floor below zero needs.
        // The y guard also guarantees this offset is inside the dimension-sized array.
        return this.subChunks[(y >> 4) - this.minSubChunkY] ?? null;
    }

    /**
     * Sets a block into the chunk, in the state the block carries.
     * @param {number} x - block x
     * @param {number} y - block y
     * @param {number} z - block z
     * @param {Block} block - block to set
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids)
     * @throws when this server has no such block, or the block carries a state its schema rejects.
     */
    public setBlock(x: number, y: number, z: number, block: Block, layer = 0): void {
        const name = block.getStateName();
        const runtimeId = BlockRuntimeIds.tryGetByState(name, block.states);
        if (runtimeId === null) {
            throw new Error(`No block state registered for ${name} with ${JSON.stringify(block.states)}`);
        }

        this.setBlockRuntimeId(x, y, z, runtimeId, layer);
    }

    /**
     * The runtime id at a position, or air's where no sub chunk has been created.
     *
     * The counterpart to {@link setBlockRuntimeId}, for decoration passes that only need
     * to know what is already there.
     */
    public getBlockRuntimeId(x: number, y: number, z: number, layer = 0): number {
        const subChunk = this.subChunkAt(y);
        if (!subChunk) return BlockRuntimeIds.getByName('minecraft:air');

        return subChunk.getBlockRuntimeId(x, y & 0xf, z, layer);
    }

    /**
     * Places an already resolved runtime id.
     *
     * World generation uses a handful of blocks for tens of thousands of placements, so
     * resolving the id once and calling this is much cheaper than handing {@link setBlock}
     * a `Block` and having it resolve the same id every time.
     */
    public setBlockRuntimeId(x: number, y: number, z: number, runtimeId: number, layer = 0): void {
        // Strict on the way in: a write outside the dimension is a caller bug, and silently
        // dropping it would show up much later as a hole in the terrain.
        const subChunk = this.subChunkAt(y) ?? this.getOrCreateSubChunk(this.requireSubChunkIndex(y));
        subChunk.setBlock(x, y & 0xf, z, runtimeId, layer);

        // Whatever block entity stood here belonged to the block that just went away. Leaving it
        // behind would write an orphan tile the game complains about, at a position where there
        // is no longer anything to own it.
        if (layer === 0 && this.blockEntities.size > 0) this.removeBlockEntity(x, y, z);

        this.hasChanged = true;
        this.invalidateNetworkSerialization();
    }

    private requireSubChunkIndex(y: number): number {
        if (y < this.dimension.minY || y > maxY(this.dimension)) {
            throw new Error(
                `Cannot place a block at y ${y}: ${this.dimension.name} spans ${this.dimension.minY} to ${maxY(this.dimension)}`
            );
        }

        return y >> 4;
    }

    /**
     * Fills a vertical run of one block, inclusive at both ends.
     *
     * Terrain is built in columns, and a column is a few long runs of the same material.
     * Going through {@link setBlockRuntimeId} per block would look the sub chunk up for
     * every one of them; this looks it up once per 16 block span instead.
     */
    public fillColumn(x: number, z: number, fromY: number, toY: number, runtimeId: number, layer = 0): void {
        if (toY < fromY) return;

        for (let y = fromY; y <= toY;) {
            const index = this.requireSubChunkIndex(y);
            const subChunk = this.subChunkAtIndex(index) ?? this.getOrCreateSubChunk(index);

            // Stop at whichever comes first: the end of the run, or the sub chunk boundary.
            const spanEnd = Math.min(toY, (index + 1) * 16 - 1);
            for (; y <= spanEnd; y++) {
                subChunk.setBlock(x, y & 0xf, z, runtimeId, layer);
            }
        }

        this.hasChanged = true;
        this.invalidateNetworkSerialization();
    }

    /**
     * Both chunk coordinates as one number, which is how a map of loaded chunks is keyed.
     *
     * Twenty-two bits an axis, so a key is at most 2^44 and stays an exact integer in a double.
     * That covers chunks from -2097152 to 2097151 on each axis, against a world border at
     * 30000000 blocks - 1875000 chunks - so every coordinate the game can reach has its own key.
     *
     * A number rather than the 64 bit `bigint` this used to return. The light engine asks the
     * world for a block's chunk once per block it scans, and a BigInt key allocates on every
     * call and hashes slower; packing and looking up a chunk is about twice as fast this way,
     * which was 37% of the self time of a start region preload.
     * @param {number} chunkX - Target Chunk X coordinate.
     * @param {number} chunkZ - Target Chunk Z coordinate.
     * @returns {number} An exact integer holding both coordinates.
     */
    public static packXZ(chunkX: number, chunkZ: number): number {
        return (chunkX & CHUNK_KEY_MASK) * CHUNK_KEY_STRIDE + (chunkZ & CHUNK_KEY_MASK);
    }

    /**
     * The two chunk coordinates a key was packed from.
     * @param {number} packed - Target Chunk coordinate hash.
     * @returns {number[]} An array containing decoded Chunk X and Z coordinates.
     */
    public static unpackXZ(packed: number): number[] {
        const x = Math.floor(packed / CHUNK_KEY_STRIDE);
        return [signExtendChunkAxis(x), signExtendChunkAxis(packed - x * CHUNK_KEY_STRIDE)];
    }

    /**
     * Revision of everything included in a LevelChunk payload.
     *
     * Sub chunks and biomes are mutable through live objects, so their revisions are sampled here
     * instead of relying on the chunk's block-write methods to invalidate a network cache. The
     * sampled values are retained in place so checking them does not allocate on each send.
     * @returns A per-chunk revision that changes when the serialized contents change.
     */
    public getNetworkRevision(): number {
        let changed =
            this.storedSubChunkCount !== this.observedStoredSubChunkCount ||
            this.biomesEpoch !== this.observedBiomesEpoch ||
            this.biomes.getRevision() !== this.observedBiomeRevision ||
            this.blockEntityRevision !== this.observedBlockEntityRevision ||
            this.subChunkOrder.length !== this.observedSubChunkRevisions.length;
        for (let index = 0; index < this.subChunkOrder.length; index++) {
            const revision = this.subChunkAtIndex(this.subChunkOrder[index]!)!.getRevision();
            if (revision !== this.observedSubChunkRevisions[index]) changed = true;
            this.observedSubChunkRevisions[index] = revision;
        }

        if (changed) {
            this.observedStoredSubChunkCount = this.storedSubChunkCount;
            this.observedBiomesEpoch = this.biomesEpoch;
            this.observedBiomeRevision = this.biomes.getRevision();
            this.observedBlockEntityRevision = this.blockEntityRevision;
            this.networkRevision++;
        }

        return this.networkRevision;
    }

    /**
     * The block-state revision used to keep per-chunk navigation reads valid.
     * Subchunk revisions also cover direct {@link SubChunk.setBlock} writes and column fills.
     */
    public getBlockRevision(): number {
        const cache = this.blockRevisionCache;
        if (cache.epoch === BlockStorage.writeEpoch && cache.layout === this.subChunkLayoutRevision) return cache.total;

        let total = this.storedSubChunkCount;
        for (const index of this.subChunkOrder) total += this.subChunkAtIndex(index)!.getRevision();
        cache.epoch = BlockStorage.writeEpoch;
        cache.layout = this.subChunkLayoutRevision;
        cache.total = total;
        return total;
    }

    public networkSerialize(): Buffer {
        // Asking the sub chunks rather than trusting a flag set by the two methods here that
        // happen to remember to. `getSubChunk` hands out the real, mutable sub chunk - the
        // cave carver writes through it - so a chunk could be serialized, changed, and
        // serialised again to the same stale bytes, while reads showed the new block. The
        // terrain the client got was simply wrong, with nothing to suggest it.
        const mutations = this.getNetworkRevision();
        if (this.serialized && this.serializedAt === mutations) return this.serialized;
        this.serializedNetworkBlobs = null;

        const stream = new BinaryStream();
        const floor = minSubChunk(this.dimension);
        const client = clientRangeOf(this.dimension);

        // The client's floor for this dimension id is fixed, -64 in the Overworld whatever we
        // think, so a dimension whose floor is above it has to make up the difference in empty sub
        // chunks. For the real Overworld, the Nether and the End the loop below is the whole story
        // and this writes nothing.
        for (let y = minSubChunk(client); y < floor; ++y) {
            Chunk.EMPTY_SUBCHUNK.networkSerialize(stream);
        }

        for (let y = floor; y < this.getTopEmpty(); ++y) {
            (this.subChunkAtIndex(y) ?? Chunk.EMPTY_SUBCHUNK).networkSerialize(stream);
        }

        // One biome section per sub chunk of the client's column, which is the client's full
        // height for this dimension id rather than the sub chunk count written above - 24 for the
        // Overworld, 8 for the Nether, 16 for the End, the same range the padding loop pads to.
        this.biomes.networkSerialize(stream, subChunkCount(client), minSubChunk(client));

        // Border Blocks: a byte count, then one packed position per border block. Only Education
        // Edition sets any, so the count is always zero.
        stream.writeByte(0);

        // Block entities: one network NBT compound each, little endian with varint lengths, from
        // here to the end of the payload with no count in front. The compound is the one a world
        // file holds, `id`, `x`, `y`, `z` and the rest, which is also what `BlockActorDataPacket`
        // carries for a single block.
        if (this.blockEntities.size > 0) {
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            for (const blockEntity of this.blockEntities.values()) writer.writeCompound(blockEntity.toNBT());
        }

        this.serialized = stream.getBuffer();
        this.serializedAt = mutations;
        return this.serialized;
    }

    /**
     * Serializes the LevelChunk payload with byte ranges for each sub chunk and the biome blob.
     *
     * The ranges point into the same payload buffer, so an uncached packet and a cache-enabled
     * packet reconstruct the same bytes without serializing each section a second time.
     */
    public networkSerializeBlobs(): ChunkNetworkBlobs {
        const revision = this.getNetworkRevision();
        if (this.serializedNetworkBlobs?.revision === revision) return this.serializedNetworkBlobs;

        const stream = new BinaryStream();
        const floor = minSubChunk(this.dimension);
        const client = clientRangeOf(this.dimension);
        const subChunkRanges: Array<{ subChunk: SubChunk; revision: number; start: number; end: number }> = [];
        let currentOffset = 0;
        const writeSubChunk = (subChunk: SubChunk): void => {
            subChunk.networkSerialize(stream);
            const end = stream.getWriteBuffer().byteLength;
            subChunkRanges.push({
                subChunk,
                revision: subChunk.getRevision(),
                start: currentOffset,
                end
            });
            currentOffset = end;
        };

        for (let y = minSubChunk(client); y < floor; ++y) writeSubChunk(Chunk.EMPTY_SUBCHUNK);

        for (let y = floor; y < this.getTopEmpty(); ++y) {
            writeSubChunk(this.subChunkAtIndex(y) ?? Chunk.EMPTY_SUBCHUNK);
        }

        const biomeIdentity = this.biomes;
        const biomeRevision = biomeIdentity.getRevision();
        const biomeStart = currentOffset;
        biomeIdentity.networkSerialize(stream, subChunkCount(client), minSubChunk(client));
        const biomeEnd = stream.getWriteBuffer().byteLength;

        // The client keeps this border-and-actor tail in LevelChunk even while terrain and
        // biome bytes are supplied as separate cache blobs.
        stream.writeByte(0);
        if (this.blockEntities.size > 0) {
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            for (const blockEntity of this.blockEntities.values()) writer.writeCompound(blockEntity.toNBT());
        }

        const payload = stream.getWriteBuffer();
        const result: ChunkNetworkBlobs = {
            revision,
            payload,
            cachedPayload: payload.subarray(biomeEnd),
            subChunks: subChunkRanges.map(({ subChunk, revision: subChunkRevision, start, end }) => ({
                subChunk,
                revision: subChunkRevision,
                bytes: payload.subarray(start, end)
            })),
            biomes: {
                identity: biomeIdentity,
                revision: biomeRevision,
                bytes: payload.subarray(biomeStart, biomeEnd)
            }
        };

        this.serialized = payload;
        this.serializedAt = revision;
        this.serializedNetworkBlobs = result;
        return result;
    }

    private invalidateNetworkSerialization(): void {
        this.serialized = null;
        this.serializedNetworkBlobs = null;
    }

    /**
     * How many sub chunks {@link networkSerialize} writes, which is what `LevelChunkPacket` has to
     * declare. Counts from the client's floor for this dimension id rather than the dimension's,
     * so it includes the padding sub chunks a shallow dimension needs.
     */
    public getNetworkSubChunkCount(): number {
        return this.getTopEmpty() - minSubChunk(clientRangeOf(this.dimension));
    }

    /**
     * Deserialize network stream into chunk
     * useful for client applications reading what the server put on the wire
     * @param {BinaryStream} stream - the network stream
     * @param {number} [x] - the chunk x coordinate
     * @param {number} [z] - the chunk z coordinate
     * @param {number} [subChunkCountSent] - how many sub chunks the payload carries
     * @param {DimensionType} [dimension] - the dimension the chunk belongs to
     */
    public static networkDeserialize(
        stream: BinaryStream,
        x?: number,
        z?: number,
        subChunkCountSent?: number,
        dimension: DimensionType = Dimensions.Overworld
    ): Chunk {
        const clientFloor = minSubChunk(clientRangeOf(dimension));
        const floor = minSubChunk(dimension);
        const sent = subChunkCountSent ?? maxSubChunk(dimension) + 1 - clientFloor;

        const subChunks: Map<number, SubChunk> = new Map();
        for (let i = 0; i < sent; i++) {
            const index = clientFloor + i;
            const subChunk = SubChunk.networkDeserialize(stream);

            // The padding sub chunks below a shallow dimension's floor are read to keep the cursor
            // in step, then dropped - they hold nothing and have no index to live at.
            if (index >= floor) subChunks.set(index, subChunk);
        }

        return new Chunk(x, z, subChunks, dimension);
    }
}
