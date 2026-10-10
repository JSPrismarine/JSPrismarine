import type BinaryStream from '@jsprismarine/binaryutils';

import BlockStorage from '../../chunk/BlockStorage';
import { decodePaletteEntry, encodePaletteEntry } from './PersistentPalette';

/**
 * A sub chunk's 4096 blocks, in the form a Bedrock world stores them.
 *
 * The bit packing is the same as the network form - a header byte, then 32 bit words each holding
 * as many palette indices as fit whole, in XZY order - but two things differ, and both are the
 * kind of difference that produces a file the game opens and then rejects:
 *
 * - the header's low bit is 0, meaning the palette is persistent rather than runtime ids;
 * - the palette count is a fixed width little endian int32, not a varint, and each entry is an
 *   NBT compound rather than a number.
 *
 * A `bitsPerBlock` of 0 is also legal here and means the whole sub chunk is one block, with no
 * word data at all - the network form has no such case.
 */

const BLOCKS_PER_SUBCHUNK = 4096;

/** The widths the format allows. Anything else is a corrupt header. */
const VALID_BITS_PER_BLOCK = [0, 1, 2, 3, 4, 5, 6, 8, 16];

/** XZY, x major and y minor - the same order {@link BlockStorage} uses internally. */
const positionOf = (index: number): [number, number, number] => [(index >> 8) & 0xf, index & 0xf, (index >> 4) & 0xf];

const bitsFor = (paletteSize: number): number => {
    if (paletteSize <= 1) return 0;

    const needed = Math.ceil(Math.log2(paletteSize));
    return VALID_BITS_PER_BLOCK.find((bits) => bits >= needed) ?? 16;
};

export const encodePersistentStorage = (storage: BlockStorage, stream: BinaryStream): void => {
    const palette = storage.getPalette();
    const bitsPerBlock = bitsFor(palette.length);

    // Low bit 0: this palette is NBT, not runtime ids.
    stream.writeByte(bitsPerBlock << 1);

    if (bitsPerBlock > 0) {
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordCount = Math.ceil(BLOCKS_PER_SUBCHUNK / blocksPerWord);

        let position = 0;
        for (let word = 0; word < wordCount; word++) {
            let packed = 0;
            for (let slot = 0; slot < blocksPerWord && position < BLOCKS_PER_SUBCHUNK; slot++) {
                const [x, y, z] = positionOf(position++);
                packed |= storage.getPaletteIndexAt(x, y, z) << (bitsPerBlock * slot);
            }

            stream.writeIntLE(packed | 0);
        }
    }

    // Fixed width, unlike the network form's varint.
    stream.writeIntLE(palette.length);
    for (const runtimeId of palette) encodePaletteEntry(runtimeId, stream);
};

export const decodePersistentStorage = (stream: BinaryStream): BlockStorage => {
    const header = stream.readByte();
    if ((header & 1) !== 0) {
        throw new Error('Sub chunk storage is marked as holding runtime ids, which never appears on disk');
    }

    const bitsPerBlock = header >> 1;
    if (!VALID_BITS_PER_BLOCK.includes(bitsPerBlock)) {
        throw new Error(`Sub chunk storage declares ${bitsPerBlock} bits per block`);
    }

    const indices = new Uint16Array(BLOCKS_PER_SUBCHUNK);

    if (bitsPerBlock > 0) {
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordCount = Math.ceil(BLOCKS_PER_SUBCHUNK / blocksPerWord);
        const mask = (1 << bitsPerBlock) - 1;

        let position = 0;
        for (let word = 0; word < wordCount; word++) {
            const packed = stream.readIntLE();
            for (let slot = 0; slot < blocksPerWord && position < BLOCKS_PER_SUBCHUNK; slot++) {
                indices[position++] = (packed >>> (bitsPerBlock * slot)) & mask;
            }
        }
    }

    const paletteSize = stream.readIntLE();
    if (paletteSize <= 0) throw new Error(`Sub chunk storage declares a palette of ${paletteSize} entries`);

    const palette = Array.from({ length: paletteSize }, () => decodePaletteEntry(stream));

    const blocks = Array.from({ length: BLOCKS_PER_SUBCHUNK }, (_, index) => {
        const paletteIndex = indices[index]!;
        if (paletteIndex >= paletteSize) {
            throw new Error(`Block ${index} refers to palette entry ${paletteIndex} of ${paletteSize}`);
        }

        return paletteIndex;
    });

    return new BlockStorage({ blocks, palette });
};
