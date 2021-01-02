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

    public getSubChunk(by: number): SubChunk {
        // From block y to sub chunk index
        by >>= 4;
        if (by < 0 || by >= this.subChunks.size) {
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

    public getBlockId(bx: number, by: number, bz: number, layer = 0): number {
        return this.getSubChunk(by).getStorage(layer).getBlockId(bx, by, bz);
    }

    public setBlock(
        bx: number,
        by: number,
        bz: number,
        block: Block,
        layer = 0
    ): void {
        const runtimeId = Server.instance
            .getBlockManager()
            .getRuntimeWithMeta(block.getId(), block.getMeta());
        this.getSubChunk(by).getStorage(layer).setBlock(bx, by, bz, runtimeId);
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
