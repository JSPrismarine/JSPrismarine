import { FULL_BLOCK, PASSABLE, bedrockCollisionTopOf } from '@jsprismarine/blocks';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { BlockStateValue } from '../../block/state/BlockState';

/**
 * How tall each block is to something walking on it.
 *
 * One number per block state: the height of its collision surface above the bottom of its own
 * cell. `0` is a block you walk straight through, `1` an ordinary cube, `0.5` a slab, `1.5` a
 * fence. That single number is the whole model, and it is enough for everything a mob does with
 * the world: whether it fits, what it is standing on, whether the thing in front is a step it can
 * walk up, a wall it must jump, or a fence it cannot pass at all.
 *
 * The numbers come from `@jsprismarine/blocks`, which publishes a Bedrock Dedicated Server's own
 * collision boxes for all 22091 palette states. They used to be a hand-written name list, which
 * knew eighty of the twelve hundred blocks the client does and read every other one as a full
 * cube - so a candle was a wall, a cauldron had no floor to stand in, and `double_cut_copper_slab`
 * was half a block because its name ends in `_slab`.
 */

/**
 * The blocks this reads as open against what the client draws, and why.
 *
 * Collision is one number per cell, and a door's is a thin panel at one edge rather than a slab
 * across the whole of it - so the capture's `1` is right about the door and wrong about the
 * doorway. Villagers are supposed to use their own doors, and a village whose mobs are all shut
 * in their houses is worse than one where they wander.
 */
const isDoorway = (name: string): boolean => name.endsWith('_door') && !name.endsWith('_trapdoor');

/**
 * How high a mob standing in this block's cell would be held up, in blocks.
 *
 * The shape depends on the state and not only on the name for exactly the blocks you would
 * expect: which half a slab fills, how deep the snow is, whether the gate is open. The runtime id
 * is how a state is named to the capture, and resolving one is memoised, so asking twice about
 * the same block costs a map lookup.
 * @param {string} name - The block's state name.
 * @param {Readonly<Record<string, BlockStateValue>>} [properties] - Its state properties.
 * @returns {number} `0` for something walked through, up to 1.5 for a fence. A block outside the
 * capture is a full cube, which is the safe way to be wrong: a wall rather than a hole.
 */
export const collisionTopOf = (name: string, properties: Readonly<Record<string, BlockStateValue>> = {}): number => {
    if (isDoorway(name)) return PASSABLE;

    const runtimeId = BlockRuntimeIds.tryGetByState(name, properties);
    return bedrockCollisionTopOf(name, runtimeId ?? undefined) ?? FULL_BLOCK;
};

export default collisionTopOf;
