/**
 * The palette and packed index words of one mixed biome section, which the disk and the network
 * form share. They differ only in the header bit and in how the palette entries are written.
 */

const BLOCKS_PER_SUBCHUNK = 4096;

/** The widths both forms allow. */
const VALID_BITS_PER_BLOCK = [0, 1, 2, 3, 4, 5, 6, 8, 16];

const bitsFor = (paletteSize: number): number => {
    if (paletteSize <= 1) return 0;

    const needed = Math.ceil(Math.log2(paletteSize));
    return VALID_BITS_PER_BLOCK.find((bits) => bits >= needed) ?? 16;
};

/** A section's distinct biomes in first-seen order, and its indices packed into 32 bit words. */
export interface PackedBiomePalette {
    readonly palette: readonly number[];
    readonly bitsPerBlock: number;
    /** Empty when `bitsPerBlock` is zero. */
    readonly words: Uint32Array;
}

/**
 * Packs one section's 4096 biome ids, in XZY order with y fastest.
 *
 * Neighboring blocks almost always share a biome, so a run of equal ids reuses the previous
 * palette slot instead of looking it up again.
 */
export const packBiomePalette = (biomes: ArrayLike<number>): PackedBiomePalette => {
    const palette: number[] = [];
    const slotOf = new Map<number, number>();
    const indices = new Uint16Array(BLOCKS_PER_SUBCHUNK);
    let previous = Number.NaN;
    let previousSlot = 0;

    for (let position = 0; position < BLOCKS_PER_SUBCHUNK; position++) {
        const biome = biomes[position]!;
        if (biome !== previous) {
            let slot = slotOf.get(biome);
            if (slot === undefined) {
                slot = palette.push(biome) - 1;
                slotOf.set(biome, slot);
            }
            previous = biome;
            previousSlot = slot;
        }
        indices[position] = previousSlot;
    }

    const bitsPerBlock = bitsFor(palette.length);
    if (bitsPerBlock === 0) return { palette, bitsPerBlock, words: new Uint32Array(0) };

    const perWord = Math.floor(32 / bitsPerBlock);
    const words = new Uint32Array(Math.ceil(BLOCKS_PER_SUBCHUNK / perWord));
    let position = 0;
    for (let word = 0; word < words.length; word++) {
        let packed = 0;
        for (let slot = 0; slot < perWord && position < BLOCKS_PER_SUBCHUNK; slot++) {
            packed |= indices[position++]! << (bitsPerBlock * slot);
        }
        words[word] = packed;
    }

    return { palette, bitsPerBlock, words };
};
