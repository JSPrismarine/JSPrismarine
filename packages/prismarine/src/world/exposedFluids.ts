/**
 * The fluid a freshly loaded chunk holds that has somewhere to run.
 *
 * Java's aquifers and its fluid carvers leave a source above air in places, and every chunk it
 * generates marks those positions for post-processing, which schedules a fluid tick so the water
 * falls or spreads the moment the chunk is first ticked. A chunk this server generates carries no
 * such mark, so the water sat in the air for good: a lake edge or an aquifer hung over an empty
 * cave until somebody disturbed it. Settled terrain has no open fluid, so the scan finds nothing
 * on a chunk that was saved after the water had flowed.
 */
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type Chunk from './chunk/Chunk';

/** One fluid block that borders air, and what it is. */
export interface ExposedFluid {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly name: string;
}

const FLUIDS: ReadonlySet<string> = new Set([
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava'
]);

const AIR: ReadonlySet<string> = new Set(['minecraft:air', 'minecraft:cave_air']);

/** Whether a runtime id names a fluid, remembered because a palette repeats the same few ids. */
const fluidIds = new Map<number, boolean>();
const isFluidId = (runtimeId: number): boolean => {
    let known = fluidIds.get(runtimeId);
    if (known === undefined) {
        known = FLUIDS.has(BlockRuntimeIds.getState(runtimeId)?.name ?? '');
        fluidIds.set(runtimeId, known);
    }
    return known;
};

/** The neighbors a fluid flows into, within the chunk. */
const STEPS: readonly (readonly [number, number, number])[] = [
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1]
];

/**
 * Every fluid block of a chunk that has air below it or beside it.
 *
 * Only sections whose palette names a fluid are read block by block, so a chunk of stone and
 * grass costs a few palette lookups.
 */
export const exposedFluidsOf = (chunk: Chunk): ExposedFluid[] => {
    const found: ExposedFluid[] = [];
    for (const [index, subChunk] of chunk.getSubChunks()) {
        const palette = subChunk.getStorages()[0]?.getPalette();
        if (palette === undefined || !palette.some(isFluidId)) continue;

        const baseY = index * 16;
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let by = 0; by < 16; by++) {
                    const name = subChunk.getBlock(x, by, z).name;
                    if (!FLUIDS.has(name)) continue;

                    const y = baseY + by;
                    const open = STEPS.some(([dx, dy, dz]) => {
                        const nx = x + dx;
                        const nz = z + dz;
                        if (nx < 0 || nx > 15 || nz < 0 || nz > 15) return false;
                        return AIR.has(chunk.getBlock(nx, y + dy, nz).name);
                    });
                    if (open) found.push({ x, y, z, name });
                }
            }
        }
    }
    return found;
};
