/**
 * What a piston can move.
 *
 * Every decision here reads `push_reaction` off the overlay's
 * `jsprismarine:block_properties`, which carries Java's per-block value. A
 * block that says `immovable` stops the piston, one that says `popped` breaks
 * instead of moving, and `push` moves but cannot be pulled back.
 */
import { BLOCK_FACES } from '@jsprismarine/blocks';
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';

import { faceOfFacingDirection, offset, opposite, samePosition } from '../geometry';
import { AIR, isLiquid, isReplaceable } from '../identifiers';
import { bareName, stateNumber } from '../state';
import type { WorldActions } from '../world';
import { popBlock } from './support';

/** How many blocks one piston moves at once. */
export const PISTON_PUSH_LIMIT = 12;

/** What a push would do, worked out before anything moves. */
export interface PushPlan {
    /** The positions that move, nearest the piston first. */
    readonly moved: readonly BlockPosition[];
    /** The first position broken instead of moved, kept for callers that need one result. */
    readonly destroyed: BlockPosition | undefined;
    /** Every position broken instead of moved, including sticky branches. */
    readonly destroyedBlocks: readonly BlockPosition[];
    /** True when nothing moves: an immovable block or more than the limit. */
    readonly blocked: boolean;
}

/** The coordinate key used while resolving a piston structure. */
const positionKey = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

/** The movement axis a face belongs to. */
const axisOf = (face: BlockFace): 'x' | 'y' | 'z' => {
    if (face === 'up' || face === 'down') return 'y';
    return face === 'north' || face === 'south' ? 'z' : 'x';
};

/** Whether the block is a slime block or a honey block. */
const isStickyBlock = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'slime' || name === 'honey_block';
};

/** Sticky blocks adhere to every block except each other across slime and honey. */
const canStickToEachOther = (a: string, b: string): boolean => {
    const aName = bareName(a);
    const bName = bareName(b);
    if ((aName === 'honey_block' && bName === 'slime') || (aName === 'slime' && bName === 'honey_block')) {
        return false;
    }
    return isStickyBlock(a) || isStickyBlock(b);
};

/** Whether a piston head marks the base as already extended. */
const isExtendedPiston = (world: WorldActions, block: HookBlock): boolean => {
    const name = bareName(block.identifier);
    if (name !== 'piston' && name !== 'sticky_piston') return false;
    const facing = faceOfFacingDirection(stateNumber(block, 'facing_direction'));
    if (facing === undefined) return false;
    const head = world.getBlock(offset(block.position, facing));
    return head !== undefined && bareName(head.identifier).endsWith('piston_arm_collision');
};

/** Whether one block can move in a direction as part of a resolved structure. */
const isPushable = (
    world: WorldActions,
    block: HookBlock | undefined,
    at: BlockPosition,
    piston: BlockPosition,
    direction: BlockFace,
    allowDestroyable: boolean,
    connectionDirection: BlockFace
): boolean => {
    if (block === undefined) return false;
    if (samePosition(at, piston)) return false;
    if (isReplaceable(block.identifier) || isLiquid(block.identifier)) return true;
    if (isExtendedPiston(world, block)) return false;

    switch (world.propertiesOf(block.identifier).pushReaction) {
        case 'immovable':
            return false;
        case 'popped':
            return allowDestroyable;
        case 'push':
            return direction === connectionDirection;
        default:
            return true;
    }
};

/**
 * Works out which blocks a piston at `origin` would move.
 *
 * @param face - The direction the piston points, which is where the head goes.
 */
export const planPush = (world: WorldActions, origin: BlockPosition, face: BlockFace): PushPlan => {
    const pushDirection = face;
    const start = offset(origin, face);
    const moved: BlockPosition[] = [];
    const destroyedBlocks: BlockPosition[] = [];
    const pushed = new Set<string>();
    const blocked = (): PushPlan => ({ moved: [], destroyed: undefined, destroyedBlocks: [], blocked: true });
    const indexOfPushed = (position: BlockPosition): number =>
        moved.findIndex((candidate) => samePosition(candidate, position));

    const reorderListAtCollision = (blocksAdded: number, collision: number): void => {
        const before = moved.slice(0, collision);
        const line = moved.slice(moved.length - blocksAdded);
        const collisionToLine = moved.slice(collision, moved.length - blocksAdded);
        moved.length = 0;
        moved.push(...before, ...line, ...collisionToLine);
    };

    const addBranchingBlocks = (from: BlockPosition): boolean => {
        const fromBlock = world.getBlock(from);
        if (fromBlock === undefined) return false;
        for (const branch of BLOCK_FACES) {
            if (axisOf(branch) === axisOf(pushDirection)) continue;
            const neighborPosition = offset(from, branch);
            const neighbor = world.getBlock(neighborPosition);
            if (
                neighbor !== undefined &&
                canStickToEachOther(neighbor.identifier, fromBlock.identifier) &&
                !addBlockLine(neighborPosition, branch)
            ) {
                return false;
            }
        }
        return true;
    };

    const addBlockLine = (lineStart: BlockPosition, lineDirection: BlockFace): boolean => {
        let next = world.getBlock(lineStart);
        if (next === undefined || isReplaceable(next.identifier) || isLiquid(next.identifier)) return true;
        if (!isPushable(world, next, lineStart, origin, pushDirection, false, lineDirection)) return true;
        if (pushed.has(positionKey(lineStart))) return true;

        let blockCount = 1;
        if (blockCount + moved.length > PISTON_PUSH_LIMIT) return false;

        while (isStickyBlock(next.identifier)) {
            const behind = offset(lineStart, opposite(pushDirection), blockCount);
            const previous = next;
            const behindBlock = world.getBlock(behind);
            if (
                behindBlock === undefined ||
                isReplaceable(behindBlock.identifier) ||
                isLiquid(behindBlock.identifier) ||
                !canStickToEachOther(previous.identifier, behindBlock.identifier) ||
                !isPushable(world, behindBlock, behind, origin, pushDirection, false, opposite(pushDirection))
            ) {
                break;
            }
            next = behindBlock;
            blockCount += 1;
            if (blockCount + moved.length > PISTON_PUSH_LIMIT) return false;
        }

        let blocksAdded = 0;
        for (let index = blockCount - 1; index >= 0; index -= 1) {
            const position = offset(lineStart, opposite(pushDirection), index);
            moved.push(position);
            pushed.add(positionKey(position));
            blocksAdded += 1;
        }

        let step = 1;
        for (;;) {
            const ahead = offset(lineStart, pushDirection, step);
            const collision = indexOfPushed(ahead);
            if (collision > -1) {
                reorderListAtCollision(blocksAdded, collision);
                for (let index = 0; index <= collision + blocksAdded; index += 1) {
                    const position = moved[index]!;
                    const block = world.getBlock(position);
                    if (block !== undefined && isStickyBlock(block.identifier) && !addBranchingBlocks(position)) {
                        return false;
                    }
                }
                return true;
            }

            next = world.getBlock(ahead);
            if (next === undefined) return false;
            if (isReplaceable(next.identifier) || isLiquid(next.identifier)) return true;
            if (!isPushable(world, next, ahead, origin, pushDirection, true, pushDirection)) return false;
            if (world.propertiesOf(next.identifier).pushReaction === 'popped') {
                destroyedBlocks.push(ahead);
                return true;
            }
            if (moved.length >= PISTON_PUSH_LIMIT) return false;

            moved.push(ahead);
            pushed.add(positionKey(ahead));
            blocksAdded += 1;
            step += 1;
        }
    };

    const startBlock = world.getBlock(start);
    if (!isPushable(world, startBlock, start, origin, pushDirection, false, face)) {
        if (startBlock !== undefined && world.propertiesOf(startBlock.identifier).pushReaction === 'popped') {
            return { moved, destroyed: start, destroyedBlocks: [start], blocked: false };
        }
        return blocked();
    }

    if (!addBlockLine(start, pushDirection)) return blocked();
    for (let index = 0; index < moved.length; index += 1) {
        const position = moved[index]!;
        const block = world.getBlock(position);
        if (block !== undefined && isStickyBlock(block.identifier) && !addBranchingBlocks(position)) return blocked();
    }

    return {
        moved,
        destroyed: destroyedBlocks[0],
        destroyedBlocks,
        blocked: false
    };
};

/**
 * Moves one block and everything attached to it by one position.
 *
 * A push is a move rather than a break and a place. A block write clears the
 * block entity at the position, so writing the two blocks separately leaves
 * the chest's contents behind and the chest arrives empty; the record is read
 * before the write that would clear it and written again at the new position.
 */
const carry = (world: WorldActions, from: BlockPosition, to: BlockPosition): void => {
    const block = world.getBlock(from);
    if (block === undefined) return;

    if (world.moveBlock !== undefined) {
        world.moveBlock(from, to);
        return;
    }

    const carried = world.getBlockData(from);
    world.setBlock(to, block.identifier, block.states, false);
    if (carried !== undefined) world.setBlockData(to, carried);
    world.setBlock(from, AIR, undefined, false);
};

/**
 * Runs a planned push: the far block moves first, so each one lands in a
 * position the previous move emptied.
 *
 * @returns True when the line moved.
 */
export const performPush = (
    world: WorldActions,
    origin: BlockPosition,
    face: BlockFace,
    notifyNeighbors = true
): boolean => {
    const plan = planPush(world, origin, face);
    if (plan.blocked) return false;

    for (let index = plan.destroyedBlocks.length - 1; index >= 0; index -= 1) {
        const position = plan.destroyedBlocks[index]!;
        const popped = world.getBlock(position);
        if (popped !== undefined) popBlock(world, popped, false);
    }

    for (let index = plan.moved.length - 1; index >= 0; index -= 1) {
        carry(world, plan.moved[index]!, offset(plan.moved[index]!, face));
    }

    if (notifyNeighbors) {
        world.notifyNeighbors(origin);
        world.notifyNeighbors(offset(origin, face));
        for (const position of plan.moved) {
            world.notifyNeighbors(position);
            world.notifyNeighbors(offset(position, face));
        }
        for (const position of plan.destroyedBlocks) world.notifyNeighbors(position);
    }
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
export const performPull = (
    world: WorldActions,
    origin: BlockPosition,
    face: BlockFace,
    notifyNeighbors = true
): boolean => {
    const source = offset(origin, face, 2);
    const block = world.getBlock(source);
    if (block === undefined || isReplaceable(block.identifier) || isLiquid(block.identifier)) return false;
    if (world.propertiesOf(block.identifier).pushReaction !== 'push_pull') return false;

    carry(world, source, offset(source, opposite(face)));
    if (notifyNeighbors) {
        world.notifyNeighbors(origin);
        world.notifyNeighbors(offset(origin, face));
        world.notifyNeighbors(source);
    }
    return true;
};
