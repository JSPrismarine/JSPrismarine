import type { LegacyId } from '../../block/BlockMappings';
import { BlockMappings } from '../../block/BlockMappings';

import type BinaryStream from '@jsprismarine/jsbinaryutils';

interface BlockStorageData {
    blocks?: number[];
    palette?: number[];
}

export default class BlockStorage {
    private blocks: number[];
    private palette: number[];

    public constructor({ blocks, palette }: BlockStorageData) {
        this.palette = palette ?? [BlockMappings.getRuntimeId('minecraft:air')];
        this.blocks = blocks ?? Array.from<number>({ length: 4096 }).fill(0);
    }

    private static getIndex(bx: number, by: number, bz: number): number {
        bx = bx & 0x0f;
        bz = bz & 0x0f;
        by = by & 0x0f;
        return ((bx << 8) + (bz << 4)) | by;
    }

    public getBlock(bx: number, by: number, bz: number): LegacyId {
        const paletteIndex = this.blocks[BlockStorage.getIndex(bx, by, bz)]!;
        const runtimeId = this.palette[paletteIndex]!;
        return BlockMappings.getLegacyId(runtimeId);
    }

    public setBlock(bx: number, by: number, bz: number, runtimeId: number): void {
        if (!this.palette.includes(runtimeId)) {
            this.palette.push(runtimeId);
        }
        this.blocks[BlockStorage.getIndex(bx, by, bz)] = this.palette.indexOf(runtimeId);
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
        let position = 0;
        for (let w = 0; w < wordsPerChunk; w++) {
            let word = 0;
            for (let block = 0; block < blocksPerWord; block++) {
                const state = this.blocks[position++]!;
                word |= state << (bitsPerBlock * block);
            }
            stream.writeIntLE(word);
        }

        // Write palette entries as runtime ids
        stream.writeVarInt(this.palette.length);
        for (const val of this.palette) {
            stream.writeVarInt(val);
        }
    }

    public static networkDeserialize(stream: BinaryStream): BlockStorage {
        const bitsPerBlock = stream.readByte() >> 1;
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordsPerChunk = Math.ceil(4096 / blocksPerWord);

        const words: number[] = new Array(wordsPerChunk);
        for (let w = 0; w < wordsPerChunk; w++) {
            words[w] = stream.readIntLE();
        }

        const paletteCount = stream.readVarInt();
        const palette: number[] = new Array(paletteCount);
        for (let i = 0; i < paletteCount; i++) {
            palette[i] = stream.readVarInt();
        }

        // Encoding example
        // https://github.com/kennyvv/Alex/blob/dcca0d697bbb25637a8bcfa93830f8a762c463af/src/Alex/Worlds/Multiplayer/Bedrock/ChunkProcessor.cs#L367

        let positon = 0;
        const storage = new BlockStorage({ palette });
        for (let w = 0; w < wordsPerChunk; w++) {
            const word = words[w]!;
            for (let block = 0; block < blocksPerWord; block++) {
                const state = (word >> ((positon % blocksPerWord) * bitsPerBlock)) & ((1 << bitsPerBlock) - 1);

                const x = (positon >> 8) & 0xf;
                const y = positon & 0xf;
                const z = (positon >> 4) & 0xf;

                const translated = palette[state]!;
                storage.setBlock(x, y, z, translated);
                positon++;
            }
        }
        return storage;
    }

    public isEmpty(): boolean {
        return this.palette.length === 1;
    }
}
