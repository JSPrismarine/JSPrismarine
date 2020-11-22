import Block from '../../block/Block';

const Sizes = {
    BlockSize: 16 * 16 * 16,
    Metadata: (16 * 16 * 16) / 2
};

export default class SubChunk {
    ids = Buffer.alloc(Sizes.BlockSize).fill(0x00);
    metadata = Buffer.alloc(Sizes.Metadata).fill(0x00);

    public static getIndex(x: number, y: number, z: number) {
        const bx = x & 0x0f,
            by = y & 0x0f,
            bz = z & 0x0f;
        return ((bx << 8) + (bz << 4)) | by;
    }

    /**
     * Sets a block in the subchunk block ids
     */
    public setBlockId(x: number, y: number, z: number, id: number): boolean {
        this.ids[SubChunk.getIndex(x, y, z)] = id;
        return true;
    }

    public setBlockMetadata(
        x: number,
        y: number,
        z: number,
        metadata: number
    ): boolean {
        const bx = x & 0x0f,
            by = y & 0x0f,
            bz = z & 0x0f;
        const index = (bx << 7) | (bz << 3) | (by >> 1);
        const shift = (by & 1) << 2;
        const byte = this.metadata[index];
        this.metadata[index] =
            (byte & ~(0xf << shift)) | ((metadata & 0xf) << shift);
        return true;
    }

    public setBlock(x: number, y: number, z: number, block: Block): boolean {
        this.setBlockId(x, y, z, block.getId());
        this.setBlockMetadata(x, y, z, block.getMeta());
        return true;
    }

    public getFullBlock(x: number, y: number, z: number): number {
        const index = SubChunk.getIndex(x, y, z);
        return (
            (this.ids[index] << 4) |
            ((this.metadata[index >> 4] >> ((y & 1) << 2)) & 0x0f)
        );
    }

    /**
     * Returns the block ID in the given position
     */
    public getBlockId(x: number, y: number, z: number) {
        return this.ids[SubChunk.getIndex(x, y, z)];
    }

    public getBlockMetadata(x: number, y: number, z: number) {
        const bx = x & 0x0f,
            by = y & 0x0f,
            bz = z & 0x0f;
        return (
            (this.metadata[(bx << 7) | (bz << 3) | (by >> 1)] >>
                ((by & 1) << 2)) &
            0xf
        );
    }

    public getHighestBlockAt(x: number, z: number) {
        let low = (x << 8) | (z << 4);
        let i = low | 0x0f;
        for (; i >= low; --i) {
            if (this.ids[i] !== 0x00) {
                return i & 0x0f;
            }
        }

        return -1;
    }

    public toBinary() {
        let buffer = Buffer.alloc(1);
        buffer.writeUInt8(0); // SubChunk version
        return Buffer.concat([buffer, this.ids, this.metadata]);
    }
}
