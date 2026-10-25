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

/**
 * How far a leaf block may be from a log, through other leaves, before it decays.
 *
 * Java's number, read out of `LeavesBlock` in the pinned 26.3 server jar.
 * `DECAY_DISTANCE` is 7 there and `decaying` removes a leaf whose `distance`
 * state has reached it, so 6 is the last distance that survives. Java carries
 * `distance` as a block state and propagates it: `updateDistance` sets it to
 * one more than the smallest of the six neighbors', counting a block in
 * `#minecraft:prevents_nearby_leaf_decay` as 0 and anything that is not a leaf
 * as 7. That tag resolves to `#minecraft:logs`, which is every `_log`, `_wood`,
 * `_stem` and `_hyphae` and their stripped forms. The fixed point of the
 * propagation is the breadth-first distance from the nearest log through
 * leaves, so the search below computes the same answer without a state to
 * store.
 *
 * It was 4, which is Bedrock's. The trees here are built from Java's
 * `worldgen/feature` data, and Java's `TreeFeature.updateLeaves` writes
 * distances out to 6 from the trunk, so 4 condemned the outer rings of every
 * canopy the generator placed.
 */
export const MAX_LEAF_DISTANCE = 6;

/**
 * Whether an identifier names a log, which is what holds leaves up.
 *
 * Java asks `#minecraft:prevents_nearby_leaf_decay`, which is `#minecraft:logs`
 * and expands to every `_log`, `_wood`, `_stem` and `_hyphae`, stripped forms
 * included. `mushroom_stem` carries the suffix and is not in the tag, so it is
 * named out.
 */
export const isLogName = (identifier: string): boolean => {
    const name = bareName(identifier);
    if (name === 'mushroom_stem') return false;
    return name.endsWith('_log') || name.endsWith('_wood') || name.endsWith('_stem') || name.endsWith('_hyphae');
};

/**
 * Whether a log near enough to hold a leaf block up is within
 * {@link MAX_LEAF_DISTANCE} of it.
 *
 * Breadth first through leaves only, so leaves hanging off a trunk keep each
 * other alive and a floating canopy does not. A position the server cannot
 * read counts as holding the leaf up, which is the answer in
 * {@link MAX_LEAF_DISTANCE}'s terms: the search cannot prove the canopy is
 * orphaned without the chunk next door, and Java never has to decide, because
 * `LevelAccessor.getBlockState` loads it. Guessing the other way strips the
 * canopy off every tree on the edge of the loaded world. `BlockPhysics` makes
 * the same assumption about ground it cannot read.
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
                if (neighbor === undefined) return true;
                if (isLogName(neighbor.identifier)) return true;
                if (bareName(neighbor.identifier).endsWith('leaves')) next.push(neighborPosition);
            }
        }
        frontier = next;
    }

    return false;
};
