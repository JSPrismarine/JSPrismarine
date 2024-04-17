import type { LegacyId } from '../../block/BlockMappings';
import { BlockMappings } from '../../block/BlockMappings';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import { Vector3 } from '@jsprismarine/math';
import type { Block } from '../../block/Block';
import SubChunk from './SubChunk';

const MAX_SUBCHUNKS = 16;

export default class Chunk {
    private x: number;
    private z: number;
    private hasChanged: boolean;

    private subChunks: Map<number, SubChunk> = new Map();
    private static readonly EMPTY_SUBCHUNK = new SubChunk();

    public constructor(chunkX = 0, chunkZ = 0, _subChunks: Map<number, SubChunk> = new Map()) {
        this.x = chunkX;
        this.z = chunkZ;
        this.hasChanged = false;
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

    public getHeight(): number {
        return this.subChunks.size;
    }

    /**
     * Returns the highest empty sub chunk (so we don't send empty sub chunks).
     * @returns {number} The highest empty sub chunk.
     */
    public getTopEmpty(): number {
        let topEmpty = MAX_SUBCHUNKS - 1;
        while (
            (topEmpty >= 0 && !this.subChunks.has(topEmpty)) ||
            (this.subChunks.has(topEmpty) && this.subChunks.get(topEmpty)!.isEmpty())
        ) {
            topEmpty--;
        }
        return ++topEmpty;
    }

    /**
     * Returns the Chunk slice at the given layer.
     * @param {number} y - The layer to get.
     */
    public getSubChunk(y: number): SubChunk | null {
        if (y < 0 || y > MAX_SUBCHUNKS) {
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

    public getHighestBlockAt(_x: number, _z: number): number {
        return 100;
    }

    /**
     * Returns block legacy id (DATA) in the corresponding sub chunk.
     * Use world to get the actual block instance (this is to keep code clean).
     * @param {Vector3 | number} x - block x.
     * @param {number} [y=0] - block y.
     * @param {number} [z=0] - block z.
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids).
     */
    public getBlock(x: Vector3 | number, y: number = 0, z: number = 0, layer = 0): LegacyId {
        if (x instanceof Vector3) {
            return this.getBlock(x.getX(), x.getY(), x.getZ(), layer);
        }

        const subChunk = this.getSubChunk(Math.floor(y / 16));
        if (!subChunk) return BlockMappings.getLegacyId(BlockMappings.getRuntimeId('minecraft:air'));
        return subChunk.getBlock(x, y & 0xf, z, layer);
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
        let subChunk = this.getSubChunk(Math.floor(y / 16));
        if (!subChunk) subChunk = this.getOrCreateSubChunk(y >> 4);
        subChunk.setBlock(x, y & 0xf, z, BlockMappings.getRuntimeId(block.getName()), layer);

        this.hasChanged = true;
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

    public networkSerialize(): Buffer {
        const stream = new BinaryStream();

        // For some reasons we need this hack since 1.18,
        // seems like the client now has some negative space.
        // TODO: figure out what is this
        for (let y = 0; y < 4; ++y) {
            stream.writeByte(8); // subchunk version 8
            stream.writeByte(0); // 0 layers (all air)
        }

        for (let y = 0; y < this.getTopEmpty(); ++y) {
            (this.subChunks.get(y) ?? Chunk.EMPTY_SUBCHUNK).networkSerialize(stream);
        }

        // TODO: 3D biomes
        for (let i = 0; i < 24; i++) {
            stream.writeByte(0); // fake biome palette, non persistent
            stream.writeUnsignedVarInt(1 << 1); // plains
        }

        stream.writeByte(0); // border ?

        // TODO: tiles
        return stream.getBuffer();
    }

    /**
     * Deserialize network stream into chunk
     * useful for client applications and/or our Filesystem impl
     * @param {BinaryStream} stream - the network stream
     * @param {number} [x] - the chunk x coordinate
     * @param {number} [z] - the chunk z coordinate
     */
    public static networkDeserialize(stream: BinaryStream, x?: number, z?: number): Chunk {
        stream.read(8); // skip fake subchunks

        const subChunks: Map<number, SubChunk> = new Map();
        for (let i = 0; i < MAX_SUBCHUNKS; i++) {
            subChunks.set(i, SubChunk.networkDeserialize(stream));
        }

        const chunk = new Chunk(x, z, subChunks);
        return chunk;
    }
}
