import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type { BlockStateValue } from '../../../block/state/BlockState';

/** The states a block needs to be in - a subset; the rest are left at their defaults. */
export type BlockStates = Readonly<Record<string, BlockStateValue>>;

/**
 * The runtime id for a block name and, optionally, some of its properties.
 *
 * Terrain and the scattering passes get by with the generator's flat name-to-id palette, because
 * every block they place is in its default state - stone is stone. A building is not: a roof is
 * stairs facing four different ways, a door is two halves that have to agree on which way they
 * swing and which is the top, and a torch has to know which wall it is on. Those are all the same
 * block name with different properties, and a name-keyed palette cannot tell them apart.
 * @param {string} name - The block's namespace id.
 * @param {BlockStates} [states] - The properties to set; the rest take their defaults.
 * @returns {number | null} The runtime id, or null when this server has no such block or the
 * block does not accept those properties - a structure that cannot find a block leaves that detail
 * out, which costs a window frame; taking world generation down over it would cost the world.
 * @example
 * ```typescript
 * const stairs = blockId('minecraft:oak_stairs', { weirdo_direction: 2, upside_down_bit: 0 });
 * ```
 */
export const blockId = (name: string, states?: BlockStates): number | null =>
    BlockRuntimeIds.tryGetByState(name, states);

/**
 * Which way a block faces, as the four compass directions a building is laid out on.
 *
 * Bedrock encodes facing differently for almost every block family - stairs use
 * `weirdo_direction`, doors and beds use `direction`, torches use a string, and none of the
 * numberings agree. Structures work in this enum and the helpers below translate, so a piece can
 * say "the door faces the road" without knowing which encoding today's block uses.
 */
export enum Facing {
    South = 0,
    West = 1,
    North = 2,
    East = 3
}

/** The unit step, in world coordinates, of a facing. */
export const facingStep = (facing: Facing): readonly [number, number] => {
    switch (facing) {
        case Facing.South:
            return [0, 1];
        case Facing.West:
            return [-1, 0];
        case Facing.North:
            return [0, -1];
        default:
            return [1, 0];
    }
};

/** The facing that points back the way the given one came. */
export const opposite = (facing: Facing): Facing => ((facing + 2) % 4) as Facing;

/**
 * Stairs, facing the given way.
 *
 * `weirdo_direction` earns its name: 0 is east, 1 west, 2 south, 3 north, which lines up with
 * none of the other facing properties.
 */
export const stairsId = (name: string, facing: Facing, upsideDown = false): number | null => {
    const weirdo = { [Facing.East]: 0, [Facing.West]: 1, [Facing.South]: 2, [Facing.North]: 3 }[facing];
    return blockId(name, { weirdo_direction: weirdo, upside_down_bit: upsideDown ? 1 : 0 });
};

/** A torch standing on the ground, or attached to the wall on the given side. */
export const torchId = (name: string, side?: Facing): number | null => {
    if (side === undefined) return blockId(name, { torch_facing_direction: 'top' });

    const wall = { [Facing.South]: 'south', [Facing.West]: 'west', [Facing.North]: 'north', [Facing.East]: 'east' }[
        side
    ];
    return blockId(name, { torch_facing_direction: wall });
};
