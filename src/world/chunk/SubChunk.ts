import Block from '../../block/Block';

const Sizes = {
    BlockSize: 16 * 16 * 16,
    Metadata: (16 * 16 * 16) / 2
};

export default class SubChunk {
    ids = Buffer.alloc(Sizes.BlockSize).fill(0x00);
    metadata = Buffer.alloc(Sizes.Metadata).fill(0x00);

    static getIndex(x: number, y: number, z: number) {
        return ((x & 0x0f) << 8) + ((z & 0x0f) << 4) + y;
    }

    /**
     * Sets a block in the subchunk block ids
     */
    setBlockId(x: number, y: number, z: number, id: number) {
        this.ids[SubChunk.getIndex(x, y, z)] = id;
        return true;
    }
    setBlockMetadata(x: number, y: number, z: number, metadata: number) {
        this.metadata[SubChunk.getIndex(x, y, z)] = metadata;
        return true;
    }

    setBlock(x: number, y: number, z: number, block: Block) {
        const index = SubChunk.getIndex(x, y, z);
        this.ids[index] = block.getId();
        this.metadata[index] = block.meta; // TODO: fix metadata index
        return true;
    }

    /**
     * Returns the block ID in the given position
     */
    getBlockId(x: number, y: number, z: number) {
        return this.ids[SubChunk.getIndex(x, y, z)];
    }
    getBlockMetadata(x: number, y: number, z: number) {
        return 0;
        //return this.metadata[SubChunk.getIndex(x, y, z)]; // TODO: fix metadata index
    }

    getHighestBlockAt(x: number, z: number) {
        let low = (x << 8) | (z << 4);
        let i = low | 0x0f;
        for (; i >= low; --i) {
            if (this.ids[i] !== 0x00) {
                return i & 0x0f;
            }
        }

        return -1;
    }

    toBinary() {
        let buffer = Buffer.alloc(1);
        buffer.writeUInt8(0); // SubChunk version
        return Buffer.concat([buffer, this.ids, this.metadata]);
    }
}
