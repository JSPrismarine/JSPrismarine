/**
 * Blocks that fall.
 *
 * Bedrock turns a falling block into an entity and lets physics carry it
 * down. This package has no entity model, so a fall is a scheduled tick that
 * moves the block one position at a time. The observable result is the same,
 * and every rule that depends on the trip (concrete powder meeting water, an
 * anvil hurting what it lands on) can run per step.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { offset } from '../geometry';
import { AIR, isLiquid, isReplaceable } from '../identifiers';
import type { WorldActions } from '../world';
import { breakBlock } from './support';

/** Game ticks between a falling block's check and its first move, as Bedrock schedules it. */
export const FALL_DELAY = 2;

/**
 * The blocks that fall.
 *
 * Java decides this by class and publishes no list, so the rule is written
 * out: the two loose ground blocks, the sixteen concrete powders, the three
 * anvils, the dragon egg and the two suspicious blocks the brush uses.
 */
export const isFallingBlock = (identifier: string): boolean => {
    const name = identifier.replace(/^[^:]*:/, '');
    return (
        name === 'sand' ||
        name === 'red_sand' ||
        name === 'gravel' ||
        name === 'dragon_egg' ||
        name.endsWith('concrete_powder') ||
        name.endsWith('anvil') ||
        name.startsWith('suspicious_')
    );
};

/** Whether a falling block can move into a position rather than landing on it. */
export const isFallThrough = (world: WorldActions, block: HookBlock): boolean => {
    const identifier = block.identifier;
    if (isReplaceable(identifier) || isLiquid(identifier)) return true;
    return world.propertiesOf(identifier).pushReaction === 'popped';
};

/**
 * Asks for the tick that moves a block down, when the space below is free.
 *
 * @returns True when a fall was scheduled.
 */
export const scheduleFall = (world: WorldActions, block: HookBlock): boolean => {
    const below = world.getBlock(offset(block.position, 'down'));
    if (below === undefined || !isFallThrough(world, below)) return false;
    world.scheduleTick(block.position, FALL_DELAY);
    return true;
};

/** What one tick of a fall did. */
export type FallStep =
    /** The block moved down one position and another tick is scheduled. */
    | 'fell'
    /** The block stayed where it is because the position below holds it up. */
    | 'landed';

/**
 * Moves a falling block down one position, or reports that it landed.
 *
 * A block the falling one passes through is destroyed and drops itself,
 * which is how a falling anvil clears a torch out of its way.
 */
export const fallOneStep = (world: WorldActions, block: HookBlock): FallStep => {
    const target = offset(block.position, 'down');
    const below = world.getBlock(target);
    if (below === undefined || !isFallThrough(world, below)) return 'landed';

    if (!isReplaceable(below.identifier) && !isLiquid(below.identifier)) {
        breakBlock(world, below, [{ identifier: below.identifier, count: 1 }]);
    }

    world.setBlock(target, block.identifier, block.states);
    world.setBlock(block.position, AIR);
    world.notifyNeighbors(block.position);
    world.scheduleTick(target, FALL_DELAY);
    return 'fell';
};
