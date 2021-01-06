import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from '../../block/Block';
import Server from '../../Server';
import SubChunk from './SubChunk';

const MAX_SUBCHUNKS = 16;

export default class Chunk {
    private x: number;
    private z: number;

    private subChunks: Map<number, SubChunk> = new Map();

    public constructor(
        chunkX = 0,
        chunkZ = 0,
        subChunks: Map<number, SubChunk> = new Map()
    ) {
        this.x = chunkX;
        this.z = chunkZ;

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
            if (subChunk.isEmpty()) {
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
        by >>= 4; // Block to SubChunk index
        if (!this.subChunks.has(by)) {
            throw new Error(`Invalid subchunk height: ${by}`);
        }
        return this.subChunks.get(by)!;
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
     * Returns a block legacy id in the corresponding sub chunk.
     *
     * @param bx - block x
     * @param by - block y
     * @param bz - block z
     * @param layer - block storage layer (0 for blocks, 1 for liquids)
     */
    public getBlockId(bx: number, by: number, bz: number, layer = 0): number {
        return this.getSubChunk(by).getBlockId(bx, by, bz, layer);
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
    public setBlock(
        bx: number,
        by: number,
        bz: number,
        block: Block,
        layer = 0
    ): void {
        const runtimeId = Server.instance
            .getBlockManager()
            .getRuntime(block.getId(), block.getMeta()); 
        this.getSubChunk(by).setBlock(bx, by, bz, runtimeId, layer);
    }

    public networkSerialize(): Buffer {
        const stream = new BinaryStream();
        // Encode sub chunks
        for (let i = 0; i < this.getTopEmpty(); i++) {
            const subChunk = this.subChunks.get(i)!;
            stream.append(subChunk.networkSerialize());
        }

        // TODO: biomes
        const biomeIds = Buffer.alloc(256).fill(0x00);
        stream.writeUnsignedVarInt(biomeIds.byteLength);
        stream.append(biomeIds);
        stream.writeByte(0); // extra data (MIT)
        return stream.getBuffer();
    }
}
