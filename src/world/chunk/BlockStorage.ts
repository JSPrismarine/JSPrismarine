import BinaryStream from '@jsprismarine/jsbinaryutils';
import Palette from './Palette';
import Server from '../../Server';

export enum StorageType {
    Paletted1 = 1, // 32 blocks per word
    Paletted2, // 16 blocks per word
    Paletted3, // 10 blocks and 2 bits of padding per word
    Paletted4, // 8 blocks per word
    Paletted5, // 6 blocks and 2 bits of padding per word
    Paletted6, // 5 blocks and 2 bits of padding per word
    Paletted8, // 4 blocks per word
    Paletted16 // 2 blocks per word
}

// Maybe semplified with 32 / StorageTypeId
export function getStorageBlocks(type: StorageType): number {
    switch (type) {
        case StorageType.Paletted1:
            return 32;
        case StorageType.Paletted2:
            return 16;
        case StorageType.Paletted3:
            return 10;
        case StorageType.Paletted4:
            return 8;
        case StorageType.Paletted5:
            return 6;
        case StorageType.Paletted6:
            return 5;
        case StorageType.Paletted8:
            return 4;
        case StorageType.Paletted16:
            return 2;
        default:
            throw new Error(`Unknown storage type id: ${type}`);
    }
}

export default class BlockStorage {
    private words: Array<number>;
    private palette = new Palette();
    private readonly AIR_RUNTIME_ID: number;

    public constructor(words?: Array<number>) {
        const blockManager = Server.instance.getBlockManager();
        this.AIR_RUNTIME_ID = blockManager.getRuntimeWithId(0);
        this.words = words ?? new Array(4096).fill(this.AIR_RUNTIME_ID);
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
        const paletteIndex = this.words[BlockStorage.getIndex(bx, by, bz)];
        const runtimeId = this.palette.getRuntime(paletteIndex);
        
        const block = Server.instance
            .getBlockManager()
            .getBlockByRuntimeId(runtimeId);
        
        return block ? block.getId() : this.AIR_RUNTIME_ID;
    }

    public setBlock(bx: number, by: number, bz: number, runtimeId: number): void {
        const runtimeIndex = this.palette.getRuntimeIndex(runtimeId);
        this.words[BlockStorage.getIndex(bx, by, bz)] = runtimeIndex;
    }
        
    public getStorageId(): number {
        // Returns the bits needed to store blocks
        return Math.ceil(Math.log2(this.palette.size()));
    }

    public networkSerialize(): Buffer {
        const stream = new BinaryStream();
        // https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37
        // 7 bit: storage type, 1 bit (shift to end): network format (always 1)
        stream.writeByte((this.getStorageId() << 1) | 1);

        const blocksPerWord = getStorageBlocks(this.getStorageId());

        const i = Math.floor(32 / this.getStorageId());
        console.log(i, blocksPerWord);

        const wordsPerChunk = Math.ceil(4096 / blocksPerWord);

        // Encoding example
        // https://github.com/NiclasOlofsson/MiNET/blob/4acbccb6dedae066547f8486a2ace1c9d6db0084/src/MiNET/MiNET/Worlds/SubChunk.cs#L294
        const indexes: number[] = new Array(wordsPerChunk);
        let position = 0;
        for (let w = 0; w < wordsPerChunk; w++) {
            let word = 0;
            for (let block = 0; block < blocksPerWord; block++) {
                if (position > 4096) continue;

                const state = this.words[position];
                word |= state << (this.getStorageId() * block);

                position++;
            }
            indexes[w] = word;
        }
        stream.append(Buffer.from(indexes));

        // Write palette entries as runtime ids
        stream.writeInt(this.palette.size());
        for (const val of this.palette.getValues()) {
             stream.writeInt(val);
        }

        return stream.getBuffer();
    }
}
