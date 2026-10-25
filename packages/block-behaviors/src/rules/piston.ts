/**
 * What a piston can move.
 *
 * Every decision here reads `push_reaction` off the overlay's
 * `jsprismarine:block_properties`, which carries Java's per-block value. A
 * block that says `immovable` stops the piston, one that says `popped` breaks
 * instead of moving, and `push` moves but cannot be pulled back.
 */
import type { BlockFace, BlockPosition } from '@jsprismarine/blocks';

import { offset, opposite } from '../geometry';
import { AIR, isLiquid, isReplaceable } from '../identifiers';
import type { WorldActions } from '../world';
import { breakBlock } from './support';

/** How many blocks one piston moves at once. */
export const PISTON_PUSH_LIMIT = 12;

/** What a push would do, worked out before anything moves. */
export interface PushPlan {
    /** The positions that move, nearest the piston first. */
    readonly moved: readonly BlockPosition[];
    /** The position the line breaks instead of moving, when the run ends on a `popped` block. */
    readonly destroyed: BlockPosition | undefined;
    /** True when nothing moves: an immovable block or more than the limit. */
    readonly blocked: boolean;
}

/**
 * Works out which blocks a piston at `origin` would move.
 *
 * @param face - The direction the piston points, which is where the head goes.
 */
export const planPush = (world: WorldActions, origin: BlockPosition, face: BlockFace): PushPlan => {
    const moved: BlockPosition[] = [];
    let position = offset(origin, face);

    for (let step = 0; step <= PISTON_PUSH_LIMIT; step += 1) {
        const block = world.getBlock(position);
        if (block === undefined) return { moved: [], destroyed: undefined, blocked: true };
        if (isReplaceable(block.identifier) || isLiquid(block.identifier)) {
            return { moved, destroyed: undefined, blocked: false };
        }

        const reaction = world.propertiesOf(block.identifier).pushReaction;
        if (reaction === 'immovable') return { moved: [], destroyed: undefined, blocked: true };
        if (reaction === 'popped') return { moved, destroyed: position, blocked: false };

        moved.push(position);
        if (moved.length > PISTON_PUSH_LIMIT) return { moved: [], destroyed: undefined, blocked: true };
        position = offset(position, face);
    }

    return { moved: [], destroyed: undefined, blocked: true };
};

/**
 * Runs a planned push: the far block moves first, so each one lands in a
 * position the previous move emptied.
 *
 * @returns True when the line moved.
 */
export const performPush = (world: WorldActions, origin: BlockPosition, face: BlockFace): boolean => {
    const plan = planPush(world, origin, face);
    if (plan.blocked) return false;

    if (plan.destroyed !== undefined) {
        const popped = world.getBlock(plan.destroyed);
        if (popped !== undefined) breakBlock(world, popped, [{ identifier: popped.identifier, count: 1 }]);
    }

    for (let index = plan.moved.length - 1; index >= 0; index -= 1) {
        const from = plan.moved[index]!;
        const block = world.getBlock(from);
        if (block === undefined) continue;
        world.setBlock(offset(from, face), block.identifier, block.states);
        world.setBlock(from, AIR);
    }

    world.notifyNeighbors(offset(origin, face));
    return true;
};

/**
 * Pulls the block in front of a retracting sticky piston back one position.
 *
 * A block whose reaction is `push` moves only when something pushes it, so a
 * sticky piston leaves it behind.
 *
 * @returns True when a block came back.
 */
export const performPull = (world: WorldActions, origin: BlockPosition, face: BlockFace): boolean => {
    const source = offset(origin, face, 2);
    const block = world.getBlock(source);
    if (block === undefined || isReplaceable(block.identifier) || isLiquid(block.identifier)) return false;
    if (world.propertiesOf(block.identifier).pushReaction !== 'push_pull') return false;

    world.setBlock(offset(source, opposite(face)), block.identifier, block.states);
    world.setBlock(source, AIR);
    world.notifyNeighbors(source);
    return true;
};
