/**
 * Pistons: the structure resolver and the two-phase move.
 *
 * `PistonStructureResolver` and `PistonBaseBlock` from the 26.3 jar. The
 * resolver is the interesting half, and it is transcribed line for line: the
 * 12-block limit, the reorder at a collision, the slime and honey rules and the
 * `POPPED` blocks that break instead of moving.
 */

import { hardnessOf, isAir, pushReactionOf } from './blockRules';
import { PISTON, PISTON_ARM, PISTON_EXTENDED_STATE, STICKY_BLOCKS, facingOf, isPiston } from './components';
import type { NeighborUpdates } from './neighborUpdates';
import { hasSignal } from './signal';
import type { BlockPosition, BlockRef, Direction, WorldAccess } from './world';
import { AIR, DIRECTIONS, opposite, positionKey, relative, samePosition } from './world';

/** How many blocks a piston can move, Java's `PistonStructureResolver.MAX_PUSH_DEPTH`. */
export const MAX_PUSH_DEPTH = 12;

/** What a resolve produced: the blocks to move, the blocks to break, and which way. */
export interface PistonStructure {
    /** True when the piston can act at all. */
    readonly resolved: boolean;
    /** The positions to move, in the order Java's resolver built them. */
    readonly toPush: readonly BlockPosition[];
    /** The positions to break, which are the `popped` blocks in the way. */
    readonly toDestroy: readonly BlockPosition[];
    /** Which way the blocks travel. */
    readonly pushDirection: Direction;
}

/** Java's `PistonStructureResolver.isSticky`: slime and honey. */
export const isStickyBlock = (block: BlockRef): boolean =>
    block.name === STICKY_BLOCKS.slime || block.name === STICKY_BLOCKS.honey;

/**
 * Java's `canStickToEachOther`: two sticky blocks drag each other, except that
 * slime and honey refuse to stick to one another.
 */
export const canStickToEachOther = (a: BlockRef, b: BlockRef): boolean => {
    if (a.name === STICKY_BLOCKS.honey && b.name === STICKY_BLOCKS.slime) return false;
    if (a.name === STICKY_BLOCKS.slime && b.name === STICKY_BLOCKS.honey) return false;
    return isStickyBlock(a) || isStickyBlock(b);
};

/**
 * Java's `PistonBaseBlock.isPushable`.
 *
 * The push reaction comes from `@jsprismarine/mapping`, which dumps it from the
 * jar, and the unbreakable check comes first: a destroy time of -1 stops the
 * push before the reaction is read, which is why bedrock does not move.
 *
 * @param allowDestroyable - Whether a `popped` block counts as pushable, which
 *   is true only for the blocks past the first in a line.
 * @param connectionDirection - The direction the block is being dragged from,
 *   which a `push` block only tolerates when it matches the push direction.
 */
export const isPushable = (
    world: WorldAccess,
    at: BlockPosition,
    block: BlockRef,
    direction: Direction,
    allowDestroyable: boolean,
    connectionDirection: Direction
): boolean => {
    if (at.y < world.getMinY() || at.y > world.getMaxY()) return false;
    if (isAir(block)) return true;
    if (direction === 'down' && at.y === world.getMinY()) return false;
    if (direction === 'up' && at.y === world.getMaxY()) return false;

    if (!isPiston(block.name)) {
        if (hardnessOf(block) === -1) return false;
        switch (pushReactionOf(block)) {
            case 'immoveable':
                return false;
            case 'popped':
                return allowDestroyable;
            case 'push':
                return direction === connectionDirection;
            default:
                break;
        }
    } else if (block.states[PISTON_EXTENDED_STATE] === true || block.states[PISTON_EXTENDED_STATE] === 1) {
        return false;
    }

    return true;
};

/**
 * Java's `PistonStructureResolver`: work out which blocks a piston moves.
 *
 * @param world - The world to read.
 * @param pistonPos - Where the piston base is.
 * @param direction - The direction the piston faces.
 * @param extending - True for an extend, false for a sticky retract.
 * @returns The move, with `resolved` false when the piston cannot act.
 */
export const resolvePistonStructure = (
    world: WorldAccess,
    pistonPos: BlockPosition,
    direction: Direction,
    extending: boolean
): PistonStructure => {
    const pushDirection = extending ? direction : opposite(direction);
    const startPos = extending ? relative(pistonPos, direction) : relative(pistonPos, direction, 2);
    const toPush: BlockPosition[] = [];
    const toDestroy: BlockPosition[] = [];
    const pushed = new Set<string>();

    const indexOfPushed = (at: BlockPosition): number => toPush.findIndex((pos) => samePosition(pos, at));

    const addBlockLine = (start: BlockPosition, lineDirection: Direction): boolean => {
        let nextState = world.getBlock(start);
        if (isAir(nextState)) return true;
        if (!isPushable(world, start, nextState, pushDirection, false, lineDirection)) return true;
        if (samePosition(start, pistonPos)) return true;
        if (pushed.has(positionKey(start))) return true;

        let blockCount = 1;
        if (blockCount + toPush.length > MAX_PUSH_DEPTH) return false;

        while (isStickyBlock(nextState)) {
            const pos = relative(start, opposite(pushDirection), blockCount);
            const previousState = nextState;
            nextState = world.getBlock(pos);
            if (
                isAir(nextState) ||
                !canStickToEachOther(previousState, nextState) ||
                !isPushable(world, pos, nextState, pushDirection, false, opposite(pushDirection)) ||
                samePosition(pos, pistonPos)
            ) {
                break;
            }
            blockCount++;
            if (blockCount + toPush.length > MAX_PUSH_DEPTH) return false;
        }

        let blocksAdded = 0;
        for (let i = blockCount - 1; i >= 0; i--) {
            const pos = relative(start, opposite(pushDirection), i);
            toPush.push(pos);
            pushed.add(positionKey(pos));
            blocksAdded++;
        }

        let step = 1;
        for (;;) {
            const aheadPos = relative(start, pushDirection, step);
            const collision = indexOfPushed(aheadPos);
            if (collision > -1) {
                reorderListAtCollision(blocksAdded, collision);
                for (let j = 0; j <= collision + blocksAdded; j++) {
                    const pos = toPush[j]!;
                    if (isStickyBlock(world.getBlock(pos)) && !addBranchingBlocks(pos)) return false;
                }
                return true;
            }

            nextState = world.getBlock(aheadPos);
            if (isAir(nextState)) return true;
            if (
                !isPushable(world, aheadPos, nextState, pushDirection, true, pushDirection) ||
                samePosition(aheadPos, pistonPos)
            ) {
                return false;
            }
            if (pushReactionOf(nextState) === 'popped') {
                toDestroy.push(aheadPos);
                return true;
            }
            if (toPush.length >= MAX_PUSH_DEPTH) return false;

            toPush.push(aheadPos);
            pushed.add(positionKey(aheadPos));
            blocksAdded++;
            step++;
        }
    };

    const reorderListAtCollision = (blocksAdded: number, collision: number): void => {
        const head = toPush.slice(0, collision);
        const lastLineAdded = toPush.slice(toPush.length - blocksAdded);
        const collisionToLine = toPush.slice(collision, toPush.length - blocksAdded);
        toPush.length = 0;
        toPush.push(...head, ...lastLineAdded, ...collisionToLine);
    };

    const addBranchingBlocks = (fromPos: BlockPosition): boolean => {
        const fromState = world.getBlock(fromPos);
        for (const branch of DIRECTIONS) {
            if (axisOf(branch) === axisOf(pushDirection)) continue;
            const neighborPos = relative(fromPos, branch);
            const neighborState = world.getBlock(neighborPos);
            if (canStickToEachOther(neighborState, fromState) && !addBlockLine(neighborPos, branch)) return false;
        }
        return true;
    };

    const startState = world.getBlock(startPos);
    if (!isPushable(world, startPos, startState, pushDirection, false, direction)) {
        if (extending && pushReactionOf(startState) === 'popped') {
            return { resolved: true, toPush: [], toDestroy: [startPos], pushDirection };
        }
        return { resolved: false, toPush: [], toDestroy: [], pushDirection };
    }

    if (!addBlockLine(startPos, pushDirection)) {
        return { resolved: false, toPush: [], toDestroy: [], pushDirection };
    }

    for (let i = 0; i < toPush.length; i++) {
        const pos = toPush[i]!;
        if (isStickyBlock(world.getBlock(pos)) && !addBranchingBlocks(pos)) {
            return { resolved: false, toPush: [], toDestroy: [], pushDirection };
        }
    }

    return { resolved: true, toPush, toDestroy, pushDirection };
};

const axisOf = (direction: Direction): 'x' | 'y' | 'z' => {
    if (direction === 'up' || direction === 'down') return 'y';
    return direction === 'north' || direction === 'south' ? 'z' : 'x';
};

/**
 * `PistonBaseBlock.getNeighborSignal`: what powers a piston.
 *
 * Java reads every direction but the push direction, then the piston's own
 * position from below, then the block above the piston in every direction but
 * down. That last loop is quasi-connectivity, which this package implements
 * because it is implementing Java's rules; the README says so and says what it
 * costs against a Bedrock world.
 */
export const pistonIsPowered = (world: WorldAccess, at: BlockPosition, pushDirection: Direction): boolean => {
    for (const direction of DIRECTIONS) {
        if (direction === pushDirection) continue;
        if (hasSignal(world, relative(at, direction), direction)) return true;
    }
    if (hasSignal(world, at, 'down')) return true;

    const above = relative(at, 'up');
    for (const direction of DIRECTIONS) {
        if (direction === 'down') continue;
        if (hasSignal(world, relative(above, direction), direction)) return true;
    }
    return false;
};

/** Whether a piston identifier is the sticky one. */
export const isStickyPiston = (name: string): boolean => name === PISTON.sticky;

/** The arm block a piston of this kind extends. */
export const pistonArmFor = (name: string): string => (isStickyPiston(name) ? PISTON_ARM.sticky : PISTON_ARM.plain);

/**
 * `PistonBaseBlock.moveBlocks`: apply a resolved structure.
 *
 * Java puts every moved block into a `minecraft:moving_block` with a block
 * entity for two game ticks and lands it at the end. This writes the blocks
 * straight into their new positions in one step, because the flight is a block
 * entity concern; the README lists it as the one piston behavior left out.
 *
 * @returns True when the move happened.
 */
export const applyPistonMove = (
    updates: NeighborUpdates,
    world: WorldAccess,
    pistonPos: BlockPosition,
    direction: Direction,
    extending: boolean
): boolean => {
    const piston = world.getBlock(pistonPos);
    const armPos = relative(pistonPos, direction);
    // `moveBlocks` clears the arm before resolving, or the immovable arm would
    // block the very pull the retract is about to make.
    if (!extending && world.getBlock(armPos).name === pistonArmFor(piston.name)) {
        world.setBlock(armPos, AIR, false);
    }

    const structure = resolvePistonStructure(world, pistonPos, direction, extending);
    if (!structure.resolved) return false;

    for (let i = structure.toDestroy.length - 1; i >= 0; i--) {
        world.destroyBlock(structure.toDestroy[i]!, { drops: true, notifyNeighbors: false });
    }

    // Farthest from the piston first, which is Java's order in `moveBlocks` and the order
    // that lets each block land in a position the one ahead of it has already left. Moves
    // rather than writes, so a pushed chest arrives with what it was holding.
    const moved = structure.toPush;
    for (let i = moved.length - 1; i >= 0; i--) {
        const pos = moved[i]!;
        world.moveBlock(pos, relative(pos, structure.pushDirection));
    }

    if (extending) {
        world.setBlock(
            pistonPos,
            { name: piston.name, states: { ...piston.states, [PISTON_EXTENDED_STATE]: true } },
            false
        );
        world.setBlock(armPos, { name: pistonArmFor(piston.name), states: { facing_direction: direction } }, false);
        world.playSound(pistonPos, 'minecraft:piston.out');
    } else {
        world.setBlock(
            pistonPos,
            { name: piston.name, states: { ...piston.states, [PISTON_EXTENDED_STATE]: false } },
            false
        );
        if (world.getBlock(armPos).name === pistonArmFor(piston.name)) world.setBlock(armPos, AIR, false);
        world.playSound(pistonPos, 'minecraft:piston.in');
    }

    updates.updateNeighborsAt(pistonPos, piston.name);
    updates.updateNeighborsAt(armPos, piston.name);
    for (const pos of moved) {
        updates.updateNeighborsAt(pos, piston.name);
        updates.updateNeighborsAt(relative(pos, structure.pushDirection), piston.name);
    }
    for (const pos of structure.toDestroy) updates.updateNeighborsAt(pos, piston.name);

    return true;
};

/**
 * `PistonBaseBlock.checkIfExtend`: react to a change next to a piston.
 *
 * Java defers the move to a block event, which runs later in the same game
 * tick. This runs it in place, which is the same game tick with no observable
 * difference inside this package.
 */
export const pistonNeighborChanged = (updates: NeighborUpdates, world: WorldAccess, at: BlockPosition): void => {
    const piston = world.getBlock(at);
    if (!isPiston(piston.name)) return;

    const direction = facingOf(piston);
    const powered = pistonIsPowered(world, at, direction);
    const extended = piston.states[PISTON_EXTENDED_STATE] === true || piston.states[PISTON_EXTENDED_STATE] === 1;

    if (powered && !extended) {
        if (resolvePistonStructure(world, at, direction, true).resolved) {
            applyPistonMove(updates, world, at, direction, true);
        }
        return;
    }

    if (!powered && extended) {
        if (isStickyPiston(piston.name)) applyPistonMove(updates, world, at, direction, false);
        else {
            world.setBlock(
                at,
                { name: piston.name, states: { ...piston.states, [PISTON_EXTENDED_STATE]: false } },
                false
            );
            const armPos = relative(at, direction);
            if (world.getBlock(armPos).name === pistonArmFor(piston.name)) world.setBlock(armPos, AIR, false);
            world.playSound(at, 'minecraft:piston.in');
            updates.updateNeighborsAt(at, piston.name);
            updates.updateNeighborsAt(armPos, piston.name);
        }
    }
};
