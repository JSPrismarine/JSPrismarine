import { BlockMappings } from '../../block/BlockMappings';
import type { LegacyId } from '../../block/BlockMappings';

import BinaryStream from '@jsprismarine/jsbinaryutils';
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
     *
     * @param y - layer
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
     * Use world to get the actual block instance (this is to keep code clean)
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param layer - block storage layer (0 for blocks, 1 for liquids)
     */
    public getBlock(bx: number, by: number, bz: number, layer = 0): LegacyId {
        const subChunk = this.getSubChunk(by >> 4);
        if (subChunk === null) {
            return BlockMappings.getLegacyId(BlockMappings.getRuntimeId('minecraft:air'));
        }
        return subChunk.getBlock(bx, by & 0xf, bz, layer);
    }

    /**
     * Sets a block into the chunk by its runtime Id.
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param block - block to set
     * @param layer - block storage layer (0 for blocks, 1 for liquids)
     */
    public setBlock(bx: number, by: number, bz: number, block: Block, layer = 0): void {
        let subChunk = this.getSubChunk(by >> 4);
        if (subChunk === null) {
            if (block.getName() === 'minecraft:air') {
                return;
            }
            subChunk = this.getOrCreateSubChunk(by >> 4);
        }
        subChunk.setBlock(bx, by & 0xf, bz, BlockMappings.getRuntimeId(block.getName()), layer);
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

    public networkSerialize(_forceAll = false): Buffer {
        const stream = new BinaryStream();

        // For some reasons we need this hack since 1.18
        // TODO: figure out what is this
        // seems like the client now has some negative space
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
     *
     * @param stream - the network stream
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
