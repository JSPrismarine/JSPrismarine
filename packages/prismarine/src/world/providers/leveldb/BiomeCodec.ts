import BinaryStream from '@jsprismarine/binaryutils';

import type { PackedBiomePalette } from '../../chunk/biomePalette';
import { packBiomePalette } from '../../chunk/biomePalette';
import { PLAINS_BIOME } from '../../chunk/ChunkBiomes';
import type { BiomeSection } from '../../chunk/ChunkBiomes';
import { subChunkCount } from '../../Dimension';
import type { DimensionType } from '../../DimensionType';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

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

/**
 * The header's low bit, which the game sets on every biome section it writes: the palette holds
 * plain ids. A uniform section with it set is the header and the one id, nothing between them.
 */
const RUNTIME_FLAG = 1;

export interface Biomes {
    /** Column heights above the dimension floor, indexed `x * 16 + z`. */
    heightmap: Uint16Array;
    /**
     * One entry per sub chunk, bottom sub chunk first: a single biome id for a uniform section,
     * or one id per block for a mixed one.
     */
    palettes: BiomeSection[];
}

const writePalette = (biomes: number | ArrayLike<number> | PackedBiomePalette, stream: BinaryStream): void => {
    const { palette, bitsPerBlock, words } =
        typeof biomes === 'number'
            ? { palette: [biomes], bitsPerBlock: 0, words: [] }
            : 'words' in biomes
              ? biomes
              : packBiomePalette(biomes);
    if (bitsPerBlock === 0) {
        // Zero bits per block: no word data and no palette size, only the one id.
        stream.writeByte(RUNTIME_FLAG);
        stream.writeIntLE(palette[0] ?? PLAINS_BIOME);
        return;
    }

    stream.writeByte((bitsPerBlock << 1) | RUNTIME_FLAG);
    for (const word of words) stream.writeIntLE(word | 0);
    stream.writeIntLE(palette.length);
    for (const biome of palette) stream.writeIntLE(biome);
};

const readPalette = (stream: BinaryStream, below: BiomeSection | null): BiomeSection | null => {
    const header = stream.readByte();
    if (header === INHERIT_HEADER) {
        // Nothing follows. The caller repeats whatever the previous sub chunk held.
        if (below === null) return null;

        return typeof below === 'number' ? below : new Int32Array(below);
    }

    const bitsPerBlock = header >> 1;
    if (!VALID_BITS_PER_BLOCK.includes(bitsPerBlock)) {
        throw new PrismarineWorldErrors.InvalidBiomePaletteWidth({ bitsPerBlock });
    }

    // Zero bits per block is a whole sub chunk of one biome, and no index data at all. Five out
    // of six sections of a real world are this, so it never spells 4096 copies of one number out.
    if (bitsPerBlock === 0) {
        if ((header & RUNTIME_FLAG) !== 0) return stream.readIntLE();

        // Without the flag, this server's own writer before it matched the game: a palette size,
        // always 1, ahead of the id. Worlds it saved still hold sections written that way.
        const uniformSize = stream.readIntLE();
        if (uniformSize <= 0) throw new PrismarineWorldErrors.InvalidBiomePaletteCount({ uniformSize });

        const first = stream.readIntLE();
        for (let i = 1; i < uniformSize; i++) stream.readIntLE();

        return first;
    }

    const indices = new Uint16Array(BLOCKS_PER_SUBCHUNK);
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

    const paletteSize = stream.readIntLE();
    if (paletteSize <= 0) throw new PrismarineWorldErrors.InvalidBiomePaletteCount({ uniformSize: paletteSize });

    const palette = Array.from({ length: paletteSize }, () => stream.readIntLE());
    const biomes = new Int32Array(BLOCKS_PER_SUBCHUNK);

    for (let i = 0; i < BLOCKS_PER_SUBCHUNK; i++) {
        const paletteIndex = indices[i]!;
        if (paletteIndex >= paletteSize) {
            throw new PrismarineWorldErrors.SavedBiomeOutOfPalette({ i, paletteIndex, paletteSize });
        }

        biomes[i] = palette[paletteIndex]!;
    }

    return biomes;
};

/**
 * Encodes a `Data3D` record.
 * @param biomes - The heightmap and one section per sub chunk, each an id, its ids or a section
 *   `ChunkBiomes.sectionsToEncode` already packed.
 */
export const encodeData3D = (
    biomes: {
        readonly heightmap: ArrayLike<number>;
        readonly palettes: readonly (number | ArrayLike<number> | PackedBiomePalette)[];
    },
    dimension: DimensionType
): Buffer => {
    const stream = new BinaryStream();

    for (let i = 0; i < COLUMNS; i++) stream.writeUnsignedShortLE(biomes.heightmap[i] ?? 0);

    const expected = subChunkCount(dimension);
    for (let i = 0; i < expected; i++) {
        writePalette(biomes.palettes[i] ?? PLAINS_BIOME, stream);
    }

    return stream.getBuffer();
};

export const decodeData3D = (value: Buffer, dimension: DimensionType): Biomes => {
    const stream = new BinaryStream(value);

    const heightmap = new Uint16Array(COLUMNS);
    for (let i = 0; i < COLUMNS; i++) heightmap[i] = stream.readUnsignedShortLE();

    const palettes: BiomeSection[] = [];
    const expected = subChunkCount(dimension);

    for (let i = 0; i < expected; i++) {
        // A truncated tail is normal: the game stops writing once the rest would all inherit.
        if (stream.getReadIndex() >= value.byteLength) break;

        const below = palettes.at(-1) ?? null;
        const palette = readPalette(stream, below);
        palettes.push(palette ?? PLAINS_BIOME);
    }

    return { heightmap, palettes };
};

/**
 * Reads a pre-1.18 `Data2D` record: a 512 byte heightmap this server does not need, then one
 * biome id byte per column.
 *
 * The bytes run z-major, index `(z << 4) | x`, which is how PocketMine-MP's
 * `ChunkUtils::extrapolate3DBiomes` reads them. A record too short to hold the biomes reads as
 * undefined.
 *
 * @returns The biome of each column, indexed `x * 16 + z` like the `Data3D` heightmap.
 */
export const decodeData2D = (value: Buffer): Uint8Array | undefined => {
    if (value.byteLength < HEIGHTMAP_BYTES + COLUMNS) return undefined;
    const biomes = new Uint8Array(COLUMNS);
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) biomes[x * 16 + z] = value[HEIGHTMAP_BYTES + ((z << 4) | x)]!;
    }
    return biomes;
};

/**
 * One sub chunk's biomes with every block spelled out, for a caller that is about to write
 * different biomes into some of them.
 */
export const uniformBiomes = (biome: number): Int32Array => new Int32Array(BLOCKS_PER_SUBCHUNK).fill(biome);

/** A whole chunk of one biome, for a freshly generated chunk that has no biome data yet. */
export const uniformData3D = (biome: number, dimension: DimensionType): Biomes => ({
    heightmap: new Uint16Array(COLUMNS),
    palettes: Array.from({ length: subChunkCount(dimension) }, () => biome)
});
