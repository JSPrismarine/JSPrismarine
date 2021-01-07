import BinaryStream from '@jsprismarine/jsbinaryutils';
import BlockMappings from '../../block/BlockMappings';

export default class BlockStorage {
    private blocks: number[];
    private palette: number[] = [BlockMappings.getRuntimeId(0, 0)];

    public constructor(blocks?: number[]) {
        // this.palette = palette ?? [];
        this.blocks = blocks ?? new Array(4096).fill(this.palette[0]);
    }

    private static getIndex(bx: number, by: number, bz: number): number {
        bx &= 0x0f;
        by &= 0x0f;
        bz &= 0x0f;
        return ((bx << 8) + (bz << 4)) | by;
    }

    // Returns the block id, not runtime
    // Move to return the block instead of Id
    public getBlockId(bx: number, by: number, bz: number): number {
        const paletteIndex = this.blocks[BlockStorage.getIndex(bx, by, bz)];
        const runtimeId = this.palette[paletteIndex];
        return BlockMappings.getLegacyId(runtimeId).id;
    }

    public setBlock(
        bx: number,
        by: number,
        bz: number,
        runtimeId: number
    ): void {
        if (!this.palette.includes(runtimeId)) {
            this.palette.push(runtimeId);
        }
        this.blocks[BlockStorage.getIndex(bx, by, bz)] = this.palette.indexOf(
            runtimeId
        );
    }

    public networkSerialize(stream: BinaryStream): void {
        // https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37
        let bitsPerBlock = Math.ceil(Math.log2(this.palette.length));

        switch (bitsPerBlock) {
            case 0:
                bitsPerBlock = 1;
                break;
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                break;
            case 7:
            case 8:
                bitsPerBlock = 8;
                break;
            default:
                bitsPerBlock = 16;
                break;
        }

        // 7 bit: storage type, 1 bit (shift to end): network format (always 1)
        stream.writeByte((bitsPerBlock << 1) | 1);
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordsPerChunk = Math.ceil(4096 / blocksPerWord);

        // Encoding example
        // https://github.com/NiclasOlofsson/MiNET/blob/4acbccb6dedae066547f8486a2ace1c9d6db0084/src/MiNET/MiNET/Worlds/SubChunk.cs#L294
        const indexes: number[] = new Array(wordsPerChunk);
        let position = 0;
        for (let w = 0; w < wordsPerChunk; w++) {
            let word = 0;
            for (let block = 0; block < blocksPerWord; block++) {
                const state = this.blocks[position];
                word |= state << (bitsPerBlock * block);

                position++;
            }
            indexes[w] = word;
        }

        for (const index of indexes) {
            stream.writeLInt(index);
        }

        // Write palette entries as runtime ids
        stream.writeVarInt(this.palette.length);
        for (const val of this.palette) {
            stream.writeVarInt(val);
        }
    }
}
