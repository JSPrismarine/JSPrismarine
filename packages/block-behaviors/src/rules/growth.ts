/**
 * Growth on a random tick: crops, saplings, vines and the leaf decay check.
 *
 * Every growing block is the same shape: a counter state, a maximum, and a
 * chance that depends on what the block stands on and how much light reaches
 * it. The counters differ by block, so each family names its own state and
 * these functions move it.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { offset } from '../geometry';
import { bareName, setStates, stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The last `growth` value a crop reaches. */
export const MAX_CROP_GROWTH = 7;

/** The light a crop needs above it to grow at all. */
export const MIN_CROP_LIGHT = 9;

/** Java's `#minecraft:supports_crops`, the ground a crop may stand on. */
export const SUPPORTS_CROPS_TAG = 'minecraft:supports_crops';

/** Java's `#minecraft:grows_crops`, the ground a crop draws its growth rate from. */
export const GROWS_CROPS_TAG = 'minecraft:grows_crops';

/**
 * The blocks a crop accepts under it, for a host that answers no tags.
 *
 * Both crop tags hold farmland and nothing else in vanilla; the tags are the source of truth
 * and this is only reached when the stack declares no such tag.
 */
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
    if (below === undefined) return 0;
    const grows = world.hasBlockTag?.(below, GROWS_CROPS_TAG) ?? FARMLAND_NAMES.has(bareName(below.identifier));
    if (!grows) return 0;
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

/** What a block is to the leaf search: a log holds the canopy up, a leaf passes the search on. */
const enum CanopyKind {
    Other,
    Log,
    Leaves
}

/** The classification of each identifier the search has met, since the same few come up thousands of times a tick. */
const canopyKinds = new Map<string, CanopyKind>();

const canopyKindOf = (identifier: string): CanopyKind => {
    let kind = canopyKinds.get(identifier);
    if (kind === undefined) {
        kind = isLogName(identifier)
            ? CanopyKind.Log
            : bareName(identifier).endsWith('leaves')
              ? CanopyKind.Leaves
              : CanopyKind.Other;
        canopyKinds.set(identifier, kind);
    }
    return kind;
};

/** The six face steps as x, y, z triples; the search is order-independent, so the order is free. */
const NEIGHBOR_STEPS = [0, -1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, -1, 0, 0, 1, 0, 0];

/** Cells per axis of the visited grid: the reach on each side of the leaf, and the leaf itself. */
const GRID_SPAN = 2 * MAX_LEAF_DISTANCE + 1;

const cellOf = (dx: number, dy: number, dz: number): number =>
    ((dx + MAX_LEAF_DISTANCE) * GRID_SPAN + (dy + MAX_LEAF_DISTANCE)) * GRID_SPAN + (dz + MAX_LEAF_DISTANCE);

/** Which search last reached each cell; a cell is visited when it holds the current epoch, so nothing is cleared between searches. */
const visited = new Uint16Array(GRID_SPAN ** 3);
let visitedEpoch = 0;

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
    const { x, y, z } = block.position;
    visitedEpoch += 1;
    if (visitedEpoch === 0xffff) {
        visited.fill(0);
        visitedEpoch = 1;
    }
    visited[cellOf(0, 0, 0)] = visitedEpoch;

    // Offsets from the leaf, three to a cell, so the search allocates no keys and no positions
    // beyond the one `getBlock` is handed.
    let frontier = [0, 0, 0];
    for (let distance = 1; distance <= MAX_LEAF_DISTANCE; distance += 1) {
        const next: number[] = [];
        for (let at = 0; at < frontier.length; at += 3) {
            const fx = frontier[at]!;
            const fy = frontier[at + 1]!;
            const fz = frontier[at + 2]!;
            for (let step = 0; step < NEIGHBOR_STEPS.length; step += 3) {
                const dx = fx + NEIGHBOR_STEPS[step]!;
                const dy = fy + NEIGHBOR_STEPS[step + 1]!;
                const dz = fz + NEIGHBOR_STEPS[step + 2]!;
                const cell = cellOf(dx, dy, dz);
                if (visited[cell] === visitedEpoch) continue;
                visited[cell] = visitedEpoch;

                const neighbor = world.getBlock({ x: x + dx, y: y + dy, z: z + dz });
                if (neighbor === undefined) return true;
                const kind = canopyKindOf(neighbor.identifier);
                if (kind === CanopyKind.Log) return true;
                if (kind === CanopyKind.Leaves) next.push(dx, dy, dz);
            }
        }
        frontier = next;
    }
    return false;
};
