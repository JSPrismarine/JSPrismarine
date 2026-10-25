/**
 * Growth on a random tick: crops, saplings, vines and the leaf decay check.
 *
 * Every growing block is the same shape: a counter state, a maximum, and a
 * chance that depends on what the block stands on and how much light reaches
 * it. The counters differ by block, so each family names its own state and
 * these functions move it.
 */
import type { HookBlock } from '@jsprismarine/blocks';
import { BLOCK_FACES } from '@jsprismarine/blocks';

import { offset } from '../geometry';
import { bareName, setStates, stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The last `growth` value a crop reaches. */
export const MAX_CROP_GROWTH = 7;

/** The light a crop needs above it to grow at all. */
export const MIN_CROP_LIGHT = 9;

/** The blocks a crop accepts under it. */
export const FARMLAND_NAMES: ReadonlySet<string> = new Set(['farmland']);

/** The blocks a sapling, a flower or a tall plant accepts under it. */
export const SOIL_NAMES: ReadonlySet<string> = new Set([
    'dirt',
    'coarse_dirt',
    'rooted_dirt',
    'grass_block',
    'podzol',
    'mycelium',
    'farmland',
    'moss_block',
    'pale_moss_block',
    'mud',
    'muddy_mangrove_roots'
]);

/**
 * How likely one random tick advances a crop.
 *
 * Java weights this by the farmland's moisture and by whether the rows beside
 * the crop are planted. The moisture half is in the block state, so it is
 * used; the row bonus needs the whole neighborhood and is left out, which
 * makes a crop on dry farmland grow at the documented floor rate.
 */
export const cropGrowthChance = (world: WorldActions, block: HookBlock): number => {
    const below = world.getBlock(offset(block.position, 'down'));
    if (below === undefined || !FARMLAND_NAMES.has(bareName(below.identifier))) return 0;
    if (world.lightLevel(offset(block.position, 'up')) < MIN_CROP_LIGHT) return 0;
    const moisture = stateNumber(below, 'moisturized_amount');
    return moisture > 0 ? 1 / 4 : 1 / 8;
};

/**
 * Advances a counter state by one when the chance comes up.
 *
 * @param state - The state holding the counter, such as `growth`.
 * @param max - The value the counter stops at.
 * @param chance - The chance this tick advances it, 1 for always.
 * @returns True when the counter moved.
 */
export const advanceCounter = (
    world: WorldActions,
    block: HookBlock,
    state: string,
    max: number,
    chance: number
): boolean => {
    const value = stateNumber(block, state);
    if (value >= max) return false;
    if (chance < 1 && world.random() >= chance) return false;
    setStates(world, block, { [state]: value + 1 });
    return true;
};

/** How far a leaf block may be from a log before it decays. */
export const MAX_LEAF_DISTANCE = 4;

/** Whether an identifier names a log, which is what holds leaves up. */
export const isLogName = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name.endsWith('_log') || name.endsWith('_wood') || name.endsWith('_stem') || name.endsWith('_hyphae');
};

/**
 * Whether a log is within {@link MAX_LEAF_DISTANCE} of a leaf block.
 *
 * The search is Bedrock's: breadth first through leaves only, so leaves
 * hanging off a trunk keep each other alive and a floating canopy does not.
 */
export const hasNearbyLog = (world: WorldActions, block: HookBlock): boolean => {
    const seen = new Set<string>([`${block.position.x},${block.position.y},${block.position.z}`]);
    let frontier = [block.position];

    for (let distance = 1; distance <= MAX_LEAF_DISTANCE; distance += 1) {
        const next: typeof frontier = [];
        for (const position of frontier) {
            for (const face of BLOCK_FACES) {
                const neighborPosition = offset(position, face);
                const key = `${neighborPosition.x},${neighborPosition.y},${neighborPosition.z}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const neighbor = world.getBlock(neighborPosition);
                if (neighbor === undefined) continue;
                if (isLogName(neighbor.identifier)) return true;
                if (bareName(neighbor.identifier).endsWith('leaves')) next.push(neighborPosition);
            }
        }
        frontier = next;
    }

    return false;
};
