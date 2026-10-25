/**
 * Standing on something, and what happens when that something goes.
 *
 * Whether a block can hold another one up is a solidity question, and the
 * overlay publishes no solidity column yet. The nearest fact it does publish
 * is `push_reaction`: the blocks a piston destroys rather than moves are the
 * ones a torch cannot hang on. So solidity reads as "not air, not a liquid,
 * not a block a piston pops", which is data-driven and right for every case
 * a family asks about.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';

import { offset } from '../geometry';
import { AIR, isLiquid, isReplaceable } from '../identifiers';
import type { ItemDrop, WorldActions } from '../world';

/** Whether a block at a position can hold another block up. */
export const isSolidSupport = (world: WorldActions, position: BlockPosition): boolean => {
    const block = world.getBlock(position);
    if (block === undefined) return false;
    if (isReplaceable(block.identifier) || isLiquid(block.identifier)) return false;
    return world.propertiesOf(block.identifier).pushReaction !== 'popped';
};

/** Removes a block, drops what it leaves behind and tells its neighbors. */
export const breakBlock = (world: WorldActions, block: HookBlock, drops: readonly ItemDrop[] = []): void => {
    world.setBlock(block.position, AIR);
    for (const drop of drops) world.dropItem(block.position, drop);
    world.notifyNeighbors(block.position);
};

/** Removes a block and drops one of itself, which is what losing support does. */
export const popBlock = (world: WorldActions, block: HookBlock): void => {
    breakBlock(world, block, [{ identifier: block.identifier, count: 1 }]);
};

/**
 * Breaks a block that lost the face it was attached to.
 *
 * @param face - Where the support is, `down` for a block standing on another.
 * @returns True when the block popped.
 */
export const popWithoutSupport = (world: WorldActions, block: HookBlock, face: BlockFace = 'down'): boolean => {
    if (isSolidSupport(world, offset(block.position, face))) return false;
    popBlock(world, block);
    return true;
};

/**
 * Breaks a block unless the block it stands on is one of the named ones.
 *
 * @param names - Bare names, such as `farmland`, that the block accepts below it.
 * @returns True when the block popped.
 */
export const popWithoutGround = (world: WorldActions, block: HookBlock, names: ReadonlySet<string>): boolean => {
    const below = world.getBlock(offset(block.position, 'down'));
    if (below !== undefined && names.has(below.identifier.replace(/^[^:]*:/, ''))) return false;
    popBlock(world, block);
    return true;
};
