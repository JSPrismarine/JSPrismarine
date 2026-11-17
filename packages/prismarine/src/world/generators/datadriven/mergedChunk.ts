/**
 * A chunk's `full` merge and block pass, run together in a generation worker.
 *
 * The merge lays a chunk's own feature writes and its eight neighbors' patches over its terrain
 * tile, and the block pass turns the result into Bedrock sections. On the server thread the
 * merge cost a copy of the tile and a walk of every patch for each chunk, and the merged slots,
 * about 196 KB, then crossed to a worker for the block pass anyway. A worker that already holds
 * the tile does both and sends back the sections.
 *
 * The one thing a worker lacks is this server's Java-to-Bedrock tables. A merge can only produce
 * the blocks its tile and its patches hold, so the server thread translates those entries
 * before the task leaves, and the worker looks each merged palette entry up by its key.
 */
import { isRecord } from '../../../utils/isRecord';
import type { BedrockSection } from './bedrockSections';
import { isBedrockSections } from './bedrockSections';
import type { RegionBlock, RegionBlockEntity, RegionEntitySpawn, RegionFluidTick } from './GenerationRegion';
import { isOptionalFluidTickList, paletteKeyOf } from './GenerationRegion';

/** The Bedrock form of every palette entry a merge can produce, keyed by {@link paletteKeyOf}. */
export interface PaletteTranslation {
    /** The entries' palette keys. */
    readonly keys: readonly string[];
    /** The Bedrock runtime id of each key, already air where this server maps nothing. */
    readonly runtimeIds: Int32Array<ArrayBuffer>;
    /** 1 where the entry is a waterlogged Java state, which Bedrock keeps in storage layer 1. */
    readonly water: Uint8Array<ArrayBuffer>;
    /** Air's runtime id. */
    readonly air: number;
}

/** What a merged chunk task hands back: everything the server thread builds the chunk from. */
export interface MergedChunkParts {
    /** The non-empty Bedrock sections. */
    readonly sections: readonly BedrockSection[];
    /** The block entities the merge left in the chunk. */
    readonly blockEntities: readonly RegionBlockEntity[];
    /** The entities features asked for inside the chunk, in the order they asked. */
    readonly entitySpawns: readonly RegionEntitySpawn[];
    /** The fluid ticks and post-processing marks asked for inside the chunk, in the order they were asked for. */
    readonly fluidTicks: readonly RegionFluidTick[];
}

/**
 * Builds the table for a set of palette entries, each translated once.
 * @param blocks - The entries a merge can produce, repeats allowed.
 * @param translate - The server thread's mapping of one entry.
 */
export const translatePalette = (
    blocks: Iterable<RegionBlock>,
    translate: (block: RegionBlock) => { readonly runtimeId: number; readonly water: boolean },
    air: number
): PaletteTranslation => {
    const keys: string[] = [];
    const runtimeIds: number[] = [];
    const water: number[] = [];
    const seen = new Set<string>();
    for (const block of blocks) {
        const key = paletteKeyOf(block);
        if (seen.has(key)) continue;
        seen.add(key);
        const translated = translate(block);
        keys.push(key);
        runtimeIds.push(translated.runtimeId);
        water.push(translated.water ? 1 : 0);
    }
    return { keys, runtimeIds: Int32Array.from(runtimeIds), water: Uint8Array.from(water), air };
};

/**
 * Looks up each merged palette entry in the table, slot by slot.
 * @throws RangeError when an entry is missing, which means the table was built from other blocks
 *   than the merge read: a chunk built with it would hold air where the block belongs.
 */
export const translateSlots = (
    palette: readonly RegionBlock[],
    translation: PaletteTranslation
): { readonly runtimeIds: Int32Array; readonly waterSlots: Uint8Array } => {
    const indexOf = new Map(translation.keys.map((key, index) => [key, index]));
    const runtimeIds = new Int32Array(palette.length);
    const waterSlots = new Uint8Array(palette.length);
    for (const [slot, block] of palette.entries()) {
        const key = paletteKeyOf(block);
        const index = indexOf.get(key);
        if (index === undefined) throw new RangeError(`The merge produced ${key}, which its translation does not hold`);
        runtimeIds[slot] = translation.runtimeIds[index]!;
        waterSlots[slot] = translation.water[index]!;
    }
    return { runtimeIds, waterSlots };
};

/** Whether a value that crossed a thread or process boundary is a translation table. */
export const isPaletteTranslation = (value: unknown): value is PaletteTranslation =>
    isRecord(value) &&
    Array.isArray(value.keys) &&
    value.keys.every((key) => typeof key === 'string') &&
    value.runtimeIds instanceof Int32Array &&
    value.water instanceof Uint8Array &&
    value.runtimeIds.length === value.keys.length &&
    value.water.length === value.keys.length &&
    typeof value.air === 'number';

/** Whether a worker's answer to a merged chunk task has the parts a chunk is built from. */
export const isMergedChunkParts = (value: unknown): value is MergedChunkParts =>
    isRecord(value) &&
    isBedrockSections(value.sections) &&
    Array.isArray(value.blockEntities) &&
    Array.isArray(value.entitySpawns) &&
    isOptionalFluidTickList(value.fluidTicks) &&
    Array.isArray(value.fluidTicks);
