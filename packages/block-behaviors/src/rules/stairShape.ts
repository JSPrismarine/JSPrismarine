/**
 * The corner a stair takes from the stairs around it.
 *
 * The rule is Java's: look at the stair in front, then the one behind, and
 * take a corner from whichever runs across this one. Bedrock spells the
 * answer `minecraft:corner`, with left and right read from the facing
 * direction.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import type { HorizontalFace } from '../geometry';
import { offset, opposite, rotateCounterClockwise, WEIRDO_DIRECTIONS } from '../geometry';
import { bareName, stateBoolean, stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The five values `minecraft:corner` takes. */
export const STAIR_CORNERS = ['none', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] as const;

/** One of {@link STAIR_CORNERS}. */
export type StairCorner = (typeof STAIR_CORNERS)[number];

/** Whether an identifier names a stair block. */
export const isStairs = (identifier: string): boolean => bareName(identifier).endsWith('_stairs');

/** The direction a stair's `weirdo_direction` names. */
export const stairFacing = (block: HookBlock): HorizontalFace =>
    WEIRDO_DIRECTIONS[stateNumber(block, 'weirdo_direction')] ?? 'east';

/** Whether two stairs sit in the same half of their blocks, which a corner needs. */
const sameHalf = (a: HookBlock, b: HookBlock): boolean =>
    stateBoolean(a, 'upside_down_bit') === stateBoolean(b, 'upside_down_bit');

const stairAt = (world: WorldActions, block: HookBlock, face: HorizontalFace): HookBlock | undefined => {
    const neighbor = world.getBlock(offset(block.position, face));
    if (neighbor === undefined || !isStairs(neighbor.identifier) || !sameHalf(block, neighbor)) return undefined;
    return neighbor;
};

/**
 * Whether a stair may take a corner toward a face.
 *
 * It may not when the block on that face is a stair running the same way,
 * because then the two are a straight run and a corner would cut it.
 */
const canTakeShape = (world: WorldActions, block: HookBlock, face: HorizontalFace): boolean => {
    const neighbor = stairAt(world, block, face);
    return neighbor === undefined || stairFacing(neighbor) !== stairFacing(block);
};

const perpendicular = (a: HorizontalFace, b: HorizontalFace): boolean =>
    (a === 'north' || a === 'south') !== (b === 'north' || b === 'south');

/** The corner a stair takes from its neighbors. */
export const stairCorner = (world: WorldActions, block: HookBlock): StairCorner => {
    const facing = stairFacing(block);

    const front = stairAt(world, block, facing);
    if (front !== undefined) {
        const frontFacing = stairFacing(front);
        if (perpendicular(frontFacing, facing) && canTakeShape(world, block, opposite(frontFacing))) {
            return frontFacing === rotateCounterClockwise(facing) ? 'outer_left' : 'outer_right';
        }
    }

    const back = stairAt(world, block, opposite(facing));
    if (back !== undefined) {
        const backFacing = stairFacing(back);
        if (perpendicular(backFacing, facing) && canTakeShape(world, block, backFacing)) {
            return backFacing === rotateCounterClockwise(facing) ? 'inner_left' : 'inner_right';
        }
    }

    return 'none';
};
