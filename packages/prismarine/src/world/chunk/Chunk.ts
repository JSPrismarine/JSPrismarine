import type { BlockState } from '../../block/state/BlockState';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';

import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import type { Block } from '../../block/Block';
import type { BlockEntity } from '../../blockentity/BlockEntity';
import { Dimensions, maxSubChunk, maxY, minSubChunk, subChunkCount } from '../Dimension';
import type { DimensionDefinition } from '../Dimension';
import type { EntitySpawn } from '../EntitySpawn';
import SubChunk from './SubChunk';

export default class Chunk {
    private x: number;
    private z: number;
    private hasChanged: boolean;
    private readonly dimension: DimensionDefinition;

    private readonly subChunks: Map<number, SubChunk> = new Map();

    /**
     * The chests, signs and furnaces standing in this chunk, keyed by position.
     *
     * Held here rather than in the world so that saving a chunk saves what is in it - a chest and
     * its contents travel together, and a chunk that was never loaded cannot lose them.
     */
    private readonly blockEntities: Map<number, BlockEntity> = new Map();

    /**
     * Mobs world generation put here, waiting for a world to create them in.
     *
     * Not saved and not part of the chunk's contents: it is a handover between the generator, which
     * has no world, and the world, which drains it the first time the chunk is loaded. A chunk read
     * back from disk has none, because by then its villagers are ordinary saved entities.
     */
    private readonly entitySpawns: EntitySpawn[] = [];

    /**
     * The serialised form, kept until a block changes.
     *
     * Ten players standing in the same area used to cost ten identical serialisations of
     * the same chunk, at ~0.3 ms each. The saving grows with the number of players, which
     * is exactly the case that has to hold up.
     */
    private serialized: Buffer | null = null;

    /** What {@link mutationCount} read when {@link serialized} was built. */
    private serializedAt = -1;
    private static readonly EMPTY_SUBCHUNK = new SubChunk();

    public constructor(
        chunkX = 0,
        chunkZ = 0,
        subChunks: Map<number, SubChunk> = new Map(),
        dimension: DimensionDefinition = Dimensions.Overworld
    ) {
        this.x = chunkX;
        this.z = chunkZ;
        this.hasChanged = false;
        this.dimension = dimension;

        // The argument used to be ignored, so every chunk read back from disk came out empty and
        // the provider silently regenerated terrain on each load.
        for (const [index, subChunk] of subChunks) this.subChunks.set(index, subChunk);
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
    }

    public getDimension(): DimensionDefinition {
        return this.dimension;
    }

    public getMinY(): number {
        return this.dimension.minY;
    }

    public getMaxY(): number {
        return maxY(this.dimension);
    }

    public getHeight(): number {
        return this.subChunks.size;
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

        while (topEmpty >= floor && (this.subChunks.get(topEmpty)?.isEmpty() ?? true)) {
            topEmpty--;
        }

        return topEmpty + 1;
    }

    /** How many sub chunks the network payload carries, counting up from the dimension floor. */
    public getSubChunkCount(): number {
        return this.getTopEmpty() - minSubChunk(this.dimension);
    }

    /**
     * Returns the Chunk slice at the given index, which is signed - the Overworld's floor is -4.
     * @param {number} y - The sub chunk index to get.
     */
    public getSubChunk(y: number): SubChunk | null {
        if (y < minSubChunk(this.dimension) || y > maxSubChunk(this.dimension)) {
            throw new Error(`Invalid subchunk height: ${y}`);
        }

        return this.subChunks.get(y) ?? null;
    }

    public getOrCreateSubChunk(y: number): SubChunk {
        const subChunk = new SubChunk();
        this.subChunks.set(y, subChunk);
        return subChunk;
    }

    public getSubChunks(): Map<number, SubChunk> {
        return this.subChunks;
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
        this.blockEntities.set(this.blockEntityIndex(position.getX(), position.getY(), position.getZ()), blockEntity);

        this.hasChanged = true;
    }

    public removeBlockEntity(x: number, y: number, z: number): boolean {
        const removed = this.blockEntities.delete(this.blockEntityIndex(x, y, z));
        if (removed) this.hasChanged = true;

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
        return this.subChunks.get(y >> 4) ?? null;
    }

    /**
     * Sets a block into the chunk by its runtime Id.
     * @param {number} x - block x
     * @param {number} y - block y
     * @param {number} z - block z
     * @param {Block} block - block to set
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids)
     */
    public setBlock(x: number, y: number, z: number, block: Block, layer = 0): void {
        this.setBlockRuntimeId(x, y, z, BlockRuntimeIds.getByName(block.getStateName()), layer);
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
        this.serialized = null;
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
            const subChunk = this.subChunks.get(index) ?? this.getOrCreateSubChunk(index);

            // Stop at whichever comes first: the end of the run, or the sub chunk boundary.
            const spanEnd = Math.min(toY, (index + 1) * 16 - 1);
            for (; y <= spanEnd; y++) {
                subChunk.setBlock(x, y & 0xf, z, runtimeId, layer);
            }
        }

        this.hasChanged = true;
        this.serialized = null;
    }

    /**
     * Helper method used to hash into a single 64 bits integer
     * both Chunk X and Z coordinates.
     * @param {number} chunkX - Target Chunk X coordinate.
     * @param {number} chunkZ - Target Chunk Z coordinate.
     * @returns {bigint} A 64 bit intger containing a hash of X and Z.
     */
    public static packXZ(chunkX: number, chunkZ: number): bigint {
        return ((BigInt(chunkX) & 0xffffffffn) << 32n) | (BigInt(chunkZ) & 0xffffffffn);
    }

    /**
     * Helper method used to decode a 64 bit hash containing
     * both Chunk X and Z coordinates.
     * @param {bigint} packed - Target Chunk coordinate hash.
     * @returns {number[]} An array containing decoded Chunk X and Z coordinates.
     */
    public static unpackXZ(packed: bigint): number[] {
        return [Number(BigInt.asIntN(32, packed >> 32n)), Number(BigInt.asIntN(32, packed & 0xffffffffn))];
    }

    /**
     * How much has been written into this chunk, ever.
     *
     * Sub chunk revisions only go up, one write at a time, and sub chunks are only ever
     * added - so this number strictly increases with every change and a mutation can never
     * leave it where it was. That is the whole requirement: it is not a hash, so there is
     * nothing to collide.
     */
    private mutationCount(): number {
        let total = this.subChunks.size;
        for (const subChunk of this.subChunks.values()) total += subChunk.getRevision();

        return total;
    }

    public networkSerialize(): Buffer {
        // Asking the sub chunks rather than trusting a flag set by the two methods here that
        // happen to remember to. `getSubChunk` hands out the real, mutable sub chunk - the
        // cave carver writes through it - so a chunk could be serialised, changed, and
        // serialised again to the same stale bytes, while reads showed the new block. The
        // terrain the client got was simply wrong, with nothing to suggest it.
        const mutations = this.mutationCount();
        if (this.serialized && this.serializedAt === mutations) return this.serialized;

        const stream = new BinaryStream();
        const floor = minSubChunk(this.dimension);

        // The client's world starts at -64 whatever we think, so a dimension whose floor is above
        // that has to make up the difference in empty sub chunks. For the Overworld the loop below
        // is the whole story and this writes nothing.
        for (let y = Dimensions.Overworld.minY >> 4; y < floor; ++y) {
            Chunk.EMPTY_SUBCHUNK.networkSerialize(stream);
        }

        for (let y = floor; y < this.getTopEmpty(); ++y) {
            (this.subChunks.get(y) ?? Chunk.EMPTY_SUBCHUNK).networkSerialize(stream);
        }

        // One biome sub chunk per sub chunk of the column, each a single-value palette of plains.
        //
        // The header is `(bitsPerBlock << 1) | 1`, and the `| 1` is the whole point: it is the
        // *network* runtime flag. With `bitsPerBlock` zero it comes out as 1 - one value, no
        // word data, the value straight after. Writing 0 instead, as this did, clears the flag
        // and tells the client the palette is the *persistent* on-disk kind, whose entries are
        // NBT compounds; it then reads the varint that follows as the start of a tag and the
        // whole chunk decodes to nonsense. A real client rejects that and drops the join at the
        // world-generation screen, which is exactly where it sat - the server's own client never
        // parsed the terrain, so nothing here was ever checked against one that does.
        //
        // TODO: real 3D biomes. Plains everywhere is what a flat world looks like anyway.
        // The value is a *signed* varint, exactly like a block palette entry - the whole paletted
        // store is one format and biomes are not an exception to it. Written unsigned, as this did,
        // plains (1) goes out as the byte `01`, which zig-zag decodes to **-1**: no such biome, so
        // the client throws the chunk away and drops the connection. It only bites once the client
        // actually parses terrain, which it does not do until it has asked for a chunk radius and
        // been answered - which is why this looked like a chunk-ordering problem first. Bedrock
        // Dedicated Server 1.26.51 puts 12, 30 and 182-190 on the wire here, all zig-zagged.
        for (let i = 0; i < subChunkCount(Dimensions.Overworld); i++) {
            stream.writeByte(1); // bitsPerBlock 0, network runtime flag set
            stream.writeVarInt(1); // The single value (plains); no palette count for bitsPerBlock 0.
        }

        stream.writeByte(0); // border ?

        // TODO: tiles
        this.serialized = stream.getBuffer();
        this.serializedAt = mutations;
        return this.serialized;
    }

    /**
     * How many sub chunks {@link networkSerialize} writes, which is what `LevelChunkPacket` has to
     * declare. Counts from the client's floor rather than the dimension's, so it includes the
     * padding sub chunks a shallow dimension needs.
     */
    public getNetworkSubChunkCount(): number {
        return this.getTopEmpty() - (Dimensions.Overworld.minY >> 4);
    }

    /**
     * Deserialize network stream into chunk
     * useful for client applications reading what the server put on the wire
     * @param {BinaryStream} stream - the network stream
     * @param {number} [x] - the chunk x coordinate
     * @param {number} [z] - the chunk z coordinate
     * @param {number} [subChunkCountSent] - how many sub chunks the payload carries
     * @param {DimensionDefinition} [dimension] - the dimension the chunk belongs to
     */
    public static networkDeserialize(
        stream: BinaryStream,
        x?: number,
        z?: number,
        subChunkCountSent?: number,
        dimension: DimensionDefinition = Dimensions.Overworld
    ): Chunk {
        const clientFloor = Dimensions.Overworld.minY >> 4;
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
