import BinaryStream from '@jsprismarine/binaryutils';

import { subChunkCount } from '../../Dimension';
import type { DimensionDefinition } from '../../Dimension';

/**
 * The `Data3D` record: a heightmap, then one biome palette per sub chunk.
 *
 * The heightmap is 256 unsigned 16 bit values in XZ order, each the height of the column measured
 * from the dimension's floor rather than from y=0 - which is what lets it stay unsigned now that
 * the floor is -64.
 *
 * Biome palettes use the same bit packing as blocks, but the entries are plain little endian int32
 * biome ids rather than NBT. A palette whose header byte is 0xff means "the same as the sub chunk
 * below", which is how a column of one biome costs a byte per slice instead of a full palette.
 */

const COLUMNS = 256;
const BLOCKS_PER_SUBCHUNK = 4096;
export const HEIGHTMAP_BYTES = COLUMNS * 2;

/** The header byte that means this sub chunk reuses the one below it. */
const INHERIT_HEADER = 0xff;

const VALID_BITS_PER_BLOCK = [0, 1, 2, 3, 4, 5, 6, 8, 16];

export const PLAINS_BIOME = 1;

export interface Biomes {
    /** Column heights above the dimension floor, indexed `x * 16 + z`. */
    heightmap: Uint16Array;
    /** One entry per block per sub chunk, bottom sub chunk first. */
    palettes: Int32Array[];
}

const bitsFor = (paletteSize: number): number => {
    if (paletteSize <= 1) return 0;

    const needed = Math.ceil(Math.log2(paletteSize));
    return VALID_BITS_PER_BLOCK.find((bits) => bits >= needed) ?? 16;
};

const writePalette = (biomes: Int32Array, stream: BinaryStream): void => {
    const palette: number[] = [];
    const index = new Map<number, number>();

    for (const biome of biomes) {
        if (!index.has(biome)) {
            index.set(biome, palette.push(biome) - 1);
        }
    }

    const bitsPerBlock = bitsFor(palette.length);
    stream.writeByte(bitsPerBlock << 1);

    if (bitsPerBlock > 0) {
        const perWord = Math.floor(32 / bitsPerBlock);
        const words = Math.ceil(BLOCKS_PER_SUBCHUNK / perWord);

        let position = 0;
        for (let word = 0; word < words; word++) {
            let packed = 0;
            for (let slot = 0; slot < perWord && position < BLOCKS_PER_SUBCHUNK; slot++) {
                packed |= index.get(biomes[position++]!)! << (bitsPerBlock * slot);
            }

            stream.writeIntLE(packed | 0);
        }
    }

    stream.writeIntLE(palette.length);
    for (const biome of palette) stream.writeIntLE(biome);
};

const readPalette = (stream: BinaryStream, below: Int32Array | null): Int32Array | null => {
    const header = stream.readByte();
    if (header === INHERIT_HEADER) {
        // Nothing follows. The caller repeats whatever the previous sub chunk held.
        return below === null ? null : Int32Array.from(below);
    }

    const bitsPerBlock = header >> 1;
    if (!VALID_BITS_PER_BLOCK.includes(bitsPerBlock)) {
        throw new Error(`Biome palette declares ${bitsPerBlock} bits per block`);
    }

    const indices = new Uint16Array(BLOCKS_PER_SUBCHUNK);

    if (bitsPerBlock > 0) {
        const perWord = Math.floor(32 / bitsPerBlock);
        const words = Math.ceil(BLOCKS_PER_SUBCHUNK / perWord);
        const mask = (1 << bitsPerBlock) - 1;

        let position = 0;
        for (let word = 0; word < words; word++) {
            const packed = stream.readIntLE();
            for (let slot = 0; slot < perWord && position < BLOCKS_PER_SUBCHUNK; slot++) {
                indices[position++] = (packed >>> (bitsPerBlock * slot)) & mask;
            }
        }
    }

    const paletteSize = stream.readIntLE();
    if (paletteSize <= 0) throw new Error(`Biome palette declares ${paletteSize} entries`);

    const palette = Array.from({ length: paletteSize }, () => stream.readIntLE());
    const biomes = new Int32Array(BLOCKS_PER_SUBCHUNK);

    for (let i = 0; i < BLOCKS_PER_SUBCHUNK; i++) {
        const paletteIndex = indices[i]!;
        if (paletteIndex >= paletteSize) {
            throw new Error(`Biome ${i} refers to palette entry ${paletteIndex} of ${paletteSize}`);
        }

        biomes[i] = palette[paletteIndex]!;
    }

    return biomes;
};

export const encodeData3D = (biomes: Biomes, dimension: DimensionDefinition): Buffer => {
    const stream = new BinaryStream();

    for (let i = 0; i < COLUMNS; i++) stream.writeUnsignedShortLE(biomes.heightmap[i] ?? 0);

    const expected = subChunkCount(dimension);
    for (let i = 0; i < expected; i++) {
        writePalette(biomes.palettes[i] ?? uniformBiomes(PLAINS_BIOME), stream);
    }

    return stream.getBuffer();
};

export const decodeData3D = (value: Buffer, dimension: DimensionDefinition): Biomes => {
    const stream = new BinaryStream(value);

    const heightmap = new Uint16Array(COLUMNS);
    for (let i = 0; i < COLUMNS; i++) heightmap[i] = stream.readUnsignedShortLE();

    const palettes: Int32Array[] = [];
    const expected = subChunkCount(dimension);

    for (let i = 0; i < expected; i++) {
        // A truncated tail is normal: the game stops writing once the rest would all inherit.
        if (stream.getReadIndex() >= value.byteLength) break;

        const below = palettes.at(-1) ?? null;
        const palette = readPalette(stream, below);
        palettes.push(palette ?? uniformBiomes(PLAINS_BIOME));
    }

    return { heightmap, palettes };
};

export const uniformBiomes = (biome: number): Int32Array => new Int32Array(BLOCKS_PER_SUBCHUNK).fill(biome);

/** A whole chunk of one biome, for a freshly generated chunk that has no biome data yet. */
export const uniformData3D = (biome: number, dimension: DimensionDefinition): Biomes => ({
    heightmap: new Uint16Array(COLUMNS),
    palettes: Array.from({ length: subChunkCount(dimension) }, () => uniformBiomes(biome))
});
