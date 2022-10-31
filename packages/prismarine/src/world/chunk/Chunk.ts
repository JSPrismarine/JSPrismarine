import BlockMappings, { LegacyId } from '../../block/BlockMappings';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from '../../block/Block';
import SubChunk from './SubChunk';

const MAX_SUBCHUNKS = 16;

export default class Chunk {
    private x: number;
    private z: number;
    private hasChanged: boolean;

    private subChunks: Map<number, SubChunk> = new Map();

    public constructor(chunkX = 0, chunkZ = 0, subChunks: Map<number, SubChunk> = new Map()) {
        this.x = chunkX;
        this.z = chunkZ;
        this.hasChanged = false;

        // Initialize all empty subchunks
        for (let y = 0; y < MAX_SUBCHUNKS; y++) {
            this.subChunks.set(y, subChunks.get(y) ?? new SubChunk());
        }
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
        let topEmpty = MAX_SUBCHUNKS;
        for (let i = 0; i <= MAX_SUBCHUNKS; i++) {
            const subChunk = this.subChunks.get(i)!;
            if (subChunk?.isEmpty?.()) {
                topEmpty = i;
            } else {
                break;
            }
        }
        return topEmpty;
    }

    /**
     * Returns the Chunk slice at given block height.
     *
     * @param by - block y
     */
    public getSubChunk(by: number): SubChunk {
        const index = by >> 4; // Block to SubChunk index
        if (!this.subChunks.has(index)) {
            throw new Error(`Invalid subchunk height: ${index}, block height: ${by}`);
        }
        return this.subChunks.get(index)!;
    }

    public getSubChunks(): Map<number, SubChunk> {
        return this.subChunks;
    }

    public getHighestBlockAt(x: number, z: number): number {
        return 100;
        // for (let y = this.subChunks.size - 1; y >= 0; y--) {
        //    const height = this.getSubChunk(y).getHighestBlockAt(x, z) | (y << 4);
        //    if (height !== -1) {
        //        return height;
        //    }
        // }
        // return -1;
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
        return this.getSubChunk(by).getBlock(bx, by, bz, layer);
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
        this.getSubChunk(by).setBlock(bx, by, bz, BlockMappings.getRuntimeId(block.getName()), layer);
        this.hasChanged = true;
    }

    public networkSerialize(forceAll = false): Buffer {
        const stream = new BinaryStream();

        // For some reasons we need this hack since 1.18
        // TODO: figure out what is this
        // seems like the client now has some negative space
        for (let y = 0; y < 4; ++y) {
            stream.writeByte(8); // subchunk version 8
            stream.writeByte(0); // 0 layers (all air)
        }

        for (let i = 0; i < (forceAll ? MAX_SUBCHUNKS : this.getTopEmpty()); i++) {
            const subChunk = this.subChunks.get(i)!;
            subChunk.networkSerialize(stream);
        }

        // TODO: 3D biomes
        for (let i = 0; i < 24; i++) {
            stream.writeByte(0); // fake biome palette, non persistent
            stream.writeUnsignedVarInt(1 << 1); // plains
        }

        stream.writeByte(0) // border ?

        // TODO: tiles

        return stream.getBuffer();
    }

    /**
     * Deserialize network stream into chunk
     * useful for client applications and/or our Filesystem impl
     *
     * @param stream the network stream
     */
    public static networkDeserialize(stream: BinaryStream): Chunk {
        stream.read(8); // skip fake subchunks

        const subChunks: Map<number, SubChunk> = new Map();
        for (let i = 0; i < MAX_SUBCHUNKS; i++) {
            subChunks.set(i, SubChunk.networkDeserialize(stream));
        }

        const chunk = new Chunk(undefined, undefined, subChunks);
        return chunk;
    }
}
