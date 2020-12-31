import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from '../../block/Block';
import Server from '../../Server';
import SubChunk from './SubChunk';

const MAX_SUBCHUNKS = 16;

export default class Chunk {
    private x = 0;
    private z = 0;

    private subChunks: Map<number, SubChunk> = new Map();

    public constructor(
        chunkX: number,
        chunkZ: number,
        subChunks: Map<number, SubChunk> = new Map()
    ) {
        this.x = chunkX;
        this.z = chunkZ;

        // Initialize all empty subchunks
        for (let i = 0; i < MAX_SUBCHUNKS; i++) {
            this.subChunks.set(i, subChunks.get(i) ?? new SubChunk());
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

    public getSubChunk(y: number): SubChunk {
        if (y < 0 || y >= this.subChunks.size) {
            throw new Error(`Invalid subchunk height: ${y}`);
        }
        return this.subChunks.get(y >> 4) as SubChunk;
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

    public getBlockId(bx: number, by: number, bz: number): number {
        return this.getSubChunk(by)
            .getStorage(0)
            .getBlockId(bx, by, bz);
    }

    public setBlock(
        x: number,
        y: number,
        z: number,
        block: Block,
        layer = 0
    ): void {
        const runtimeId = Server.instance
            .getBlockManager()
            .getRuntimeWithMeta(block.getId(), block.getMeta());
        this.getSubChunk(y).getStorage(layer).setBlock(x, y, z, runtimeId);
    }

    public networkSerialize(): Buffer {
        const stream = new BinaryStream();
        // Encode subchunks
        stream.writeByte(this.getSubChunks().size);
        for (const subChunk of this.getSubChunks().values()) {
            stream.append(subChunk.networkSerialize());
        }
        // TODO: biomes
        const biomeIds = Buffer.alloc(256).fill(0x00);
        stream.writeUnsignedVarInt(biomeIds.byteLength);
        stream.append(biomeIds);
        stream.writeUnsignedVarInt(0); // extra data
        return stream.getBuffer();
    }
}
