import BinaryStream from '@jsprismarine/binaryutils';

import { minSubChunk, subChunkCount } from '../Dimension';
import type { DimensionDefinition } from '../Dimension';

/**
 * The biome of every block in one chunk column.
 *
 * Bedrock stores biomes per block rather than per 4x4x4 cell, which is 4096 numbers a sub chunk
 * and 98304 a column. Almost every sub chunk holds one biome, so a section is either a single id
 * or, once something writes a second biome into it, a packed array of ids. A column of one biome
 * therefore costs twenty-four numbers.
 *
 * The on-disk `Data3D` record and the biome half of a `LevelChunkPacket` are both built from
 * this; see `providers/leveldb/BiomeCodec.ts` for the disk form.
 */

/** How many blocks one sub chunk holds. */
const BLOCKS_PER_SUBCHUNK = 4096;

/** The widths a Bedrock paletted storage allows. */
const VALID_BITS_PER_BLOCK = [0, 1, 2, 3, 4, 5, 6, 8, 16];

/**
 * `minecraft:plains`, the biome a column falls back to.
 *
 * The id the client knows the biome by, not a registry position: the numbers are Mojang's and
 * the client resolves grass color, fog and ambient sound from them.
 */
export const PLAINS_BIOME = 1;

/** The widest biome id a packed section can hold. */
const MAX_BIOME_ID = 0xffff;

/** One sub chunk's biomes: a single id while the section is uniform, packed once it is not. */
type BiomeSection = number | Uint16Array;

const bitsFor = (paletteSize: number): number => {
    if (paletteSize <= 1) return 0;

    const needed = Math.ceil(Math.log2(paletteSize));
    return VALID_BITS_PER_BLOCK.find((bits) => bits >= needed) ?? 16;
};

/** XZY with y fastest, the order both the disk and the network form pack. */
const indexOf = (x: number, y: number, z: number): number => ((x & 0xf) << 8) | ((z & 0xf) << 4) | (y & 0xf);

export class ChunkBiomes {
    private readonly dimension: DimensionDefinition;
    private readonly sections: BiomeSection[];

    /**
     * @param dimension - Decides how many sub chunks the column carries: 24, 8 or 16.
     * @param fill - The biome every block starts as.
     */
    public constructor(dimension: DimensionDefinition, fill: number = PLAINS_BIOME) {
        this.dimension = dimension;
        this.sections = Array.from({ length: subChunkCount(dimension) }, () => fill);
    }

    /** The biome at a position, with x and z chunk-local and y in world coordinates. */
    public get(x: number, y: number, z: number): number {
        const section = this.sections[this.sectionIndexOf(y)];
        if (section === undefined) return PLAINS_BIOME;

        return typeof section === 'number' ? section : section[indexOf(x, y, z)]!;
    }

    /** Replaces the biome at a position, with x and z chunk-local and y in world coordinates. */
    public set(x: number, y: number, z: number, biome: number): void {
        this.requireBiomeId(biome);

        const index = this.sectionIndexOf(y);
        const section = this.sections[index];
        if (section === undefined) return;
        if (section === biome) return;

        if (typeof section === 'number') {
            // The first write that disagrees with the section's single biome is what makes it
            // worth 8 KiB; until then the whole section is one number.
            const packed = new Uint16Array(BLOCKS_PER_SUBCHUNK).fill(section);
            packed[indexOf(x, y, z)] = biome;
            this.sections[index] = packed;
            return;
        }

        section[indexOf(x, y, z)] = biome;
    }

    /** Puts one biome through a whole sub chunk, which is how a uniform column is built. */
    public fillSection(sectionIndex: number, biome: number): void {
        this.requireBiomeId(biome);

        const index = sectionIndex - minSubChunk(this.dimension);
        if (index < 0 || index >= this.sections.length) return;

        this.sections[index] = biome;
    }

    /** Puts one biome through a whole column of the chunk, floor to ceiling. */
    public fillColumn(x: number, z: number, biome: number): void {
        this.requireBiomeId(biome);

        for (let section = 0; section < this.sections.length; section++) {
            const y = (minSubChunk(this.dimension) + section) * 16;
            for (let offset = 0; offset < 16; offset++) this.set(x, y + offset, z, biome);
        }
    }

    /** Every biome of one sub chunk, bottom section first, as the disk codec wants them. */
    public sectionIds(index: number): Int32Array {
        const section = this.sections[index];
        if (section === undefined) return new Int32Array(BLOCKS_PER_SUBCHUNK).fill(PLAINS_BIOME);

        return typeof section === 'number'
            ? new Int32Array(BLOCKS_PER_SUBCHUNK).fill(section)
            : Int32Array.from(section);
    }

    /** Every sub chunk's biomes, bottom section first. */
    public toSectionIds(): Int32Array[] {
        return this.sections.map((_, index) => this.sectionIds(index));
    }

    /** Rebuilds the column from the per-section arrays the disk codec reads. */
    public static fromSectionIds(ids: readonly Int32Array[], dimension: DimensionDefinition): ChunkBiomes {
        const biomes = new ChunkBiomes(dimension);

        for (let index = 0; index < biomes.sections.length; index++) {
            const section = ids[index];
            if (section === undefined) continue;

            const first = section[0] ?? PLAINS_BIOME;
            const uniform = section.every((biome) => biome === first);
            biomes.sections[index] = uniform ? first : Uint16Array.from(section, (biome) => biome & MAX_BIOME_ID);
        }

        return biomes;
    }

    /**
     * Writes the biome half of a chunk payload: one paletted storage per sub chunk of the
     * client's column, in the runtime form whose palette entries are biome ids.
     *
     * @param stream - The payload being built.
     * @param sectionCount - How many sections the client expects, which is the client's height
     *   for the dimension id rather than this chunk's own sub chunk count.
     */
    public networkSerialize(stream: BinaryStream, sectionCount: number): void {
        for (let index = 0; index < sectionCount; index++) {
            writeNetworkPalette(this.sectionIds(index), stream);
        }
    }

    private sectionIndexOf(y: number): number {
        return (y >> 4) - minSubChunk(this.dimension);
    }

    private requireBiomeId(biome: number): void {
        if (!Number.isInteger(biome) || biome < 0 || biome > MAX_BIOME_ID) {
            throw new RangeError(`A biome id is an integer from 0 to ${MAX_BIOME_ID}, got ${biome}`);
        }
    }
}

/**
 * One sub chunk's biomes in the network form: a header whose low bit says the palette holds ids
 * rather than NBT, then the packed indices, then the palette as ZigZag varints.
 *
 * A single-biome section writes the header and the one id and no word data, which is what the
 * zero bit width means.
 */
const writeNetworkPalette = (biomes: Int32Array, stream: BinaryStream): void => {
    const palette: number[] = [];
    const index = new Map<number, number>();

    for (const biome of biomes) {
        if (!index.has(biome)) index.set(biome, palette.push(biome) - 1);
    }

    const bitsPerBlock = bitsFor(palette.length);
    stream.writeByte((bitsPerBlock << 1) | 1);

    if (bitsPerBlock === 0) {
        // No word data and no palette count: the single id follows the header on its own.
        stream.writeVarInt(palette[0] ?? PLAINS_BIOME);
        return;
    }

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

    stream.writeVarInt(palette.length);
    for (const biome of palette) stream.writeVarInt(biome);
};
