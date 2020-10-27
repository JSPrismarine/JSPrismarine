
const Sizes = {
    BlockSize: 16 * 16 * 16,
    Metadata: (16 * 16 * 16) / 2
};
class SubChunk {
    ids = Buffer.alloc(Sizes.BlockSize).fill(0x00)
    metadata = Buffer.alloc(Sizes.Metadata).fill(0x00)

    static getIndex(x, y, z) {
        // Handle negative values
        if (x <= -1)
            x += 16;
        if (z <= -1)
            z += 16;
        return ((Math.abs(x) << 8) + (Math.abs(z) << 4) + y);
    }

    /**
     * Sets a block in the subchunk block ids
     * 
     * @param {number} x - block position x 
     * @param {number} y - block position y
     * @param {number} z - block position z
     * @param {number} id - block id
     */
    setBlockId(x, y, z, id) {
        this.ids[SubChunk.getIndex(x, y, z)] = id;
        return true;
    }
    setBlockMetadata(x, y, z, metadata) {
        this.metadata[SubChunk.getIndex(x, y, z)] = metadata;
        return true;
    }

    setBlock(x, y, z, block) {
        const index = SubChunk.getIndex(x, y, z);
        this.ids[index] = block.getId();
        this.metadata[index] = block.meta; // TODO: fix metadata index
        return true;
    }

    /**
     * Returns the block ID in the given position
     * 
     * @param {number} x - block position x 
     * @param {number} y - block position y
     * @param {number} z - block position z
     */
    getBlockId(x, y, z) {
        return this.ids[SubChunk.getIndex(x, y, z)];
    }
    getBlockMetadata(x, y, z) {
        return this.metadata[SubChunk.getIndex(x, y, z)]; // TODO: fix metadata index
    }

    getHighestBlockAt(x, z) {
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
        buffer.writeUInt8(0);  // SubChunk version
        return Buffer.concat([buffer, this.ids, this.metadata]);
    }
}
module.exports = SubChunk;
