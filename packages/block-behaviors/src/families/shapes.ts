/**
 * The families whose work is a shape: slabs merging into double slabs,
 * stairs taking a corner, and the three thin blocks that connect to their
 * neighbors.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { connectionStates, wallStates } from '../rules/connection';
import { stairCorner } from '../rules/stairShape';
import { bareName, hasState, setStates, sibling, stateString } from '../state';
import type { WorldActions } from '../world';
import { dropSelf, weatherOnRandomTick } from './shared';

/** The double slab a slab merges into, by the slab's bare name. */
export const doubleSlabName = (identifier: string): string => {
    const name = bareName(identifier);
    if (name === 'stone_block_slab') return sibling(identifier, 'double_stone_block_slab');
    if (name === 'wooden_slab') return sibling(identifier, 'double_wooden_slab');
    return sibling(identifier, `${name.replace(/_slab$/, '')}_double_slab`);
};

/** The slab a double slab is made of, which is what breaking one gives back. */
export const singleSlabName = (identifier: string): string => {
    const name = bareName(identifier);
    if (name === 'double_stone_block_slab') return sibling(identifier, 'stone_block_slab');
    if (name === 'double_wooden_slab') return sibling(identifier, 'wooden_slab');
    return sibling(identifier, name.replace(/_double_slab$/, '_slab'));
};

/**
 * Half blocks.
 *
 * Placing a slab on the free half of the same slab makes the double block.
 * `BlockPlaceEvent.previous` is what the placement overwrote, so a merge is
 * the case where that was the same slab in the other half.
 */
export const slabFamily = defineFamily(
    'jsprismarine:slab',
    'Merges with the slab it replaced into the double block, and oxidizes when it is copper.',
    {
        onPlace: (event, world) => {
            const previous = event.previous;
            if (previous === undefined || previous.identifier !== event.block.identifier) return;
            if (
                stateString(previous, 'minecraft:vertical_half') === stateString(event.block, 'minecraft:vertical_half')
            ) {
                return;
            }
            world.setBlock(event.block.position, doubleSlabName(event.block.identifier), {
                'minecraft:vertical_half': 'bottom'
            });
            world.playSound(event.block.position, 'use.stone');
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Full cubes made of two slabs, which is what they give back. */
export const doubleSlabFamily = defineFamily(
    'jsprismarine:double_slab',
    'Drops two of the slab it is made of and oxidizes when it is copper.',
    {
        onBreak: (event, world, context) => {
            if (context.properties.requiresCorrectTool) return;
            world.dropItem(event.brokenBlock.position, {
                identifier: singleSlabName(event.brokenBlock.identifier),
                count: 2
            });
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        }
    }
);

const applyCorner = (world: WorldActions, block: HookBlock): void => {
    if (!hasState(block, 'minecraft:corner')) return;
    const corner = stairCorner(world, block);
    if (stateString(block, 'minecraft:corner') === corner) return;
    setStates(world, block, { 'minecraft:corner': corner });
};

/** Stairs, whose corner comes from the stairs in front of and behind them. */
export const stairsFamily = defineFamily(
    'jsprismarine:stairs',
    'Recomputes minecraft:corner on placement and on every neighbor change, and oxidizes when it is copper.',
    {
        onPlace: (event, world) => {
            applyCorner(world, event.block);
        },
        onNeighborChanged: (event, world) => {
            applyCorner(world, event.block);
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Walls, which take a height per side and a post. */
export const wallFamily = defineFamily(
    'jsprismarine:wall',
    'Recomputes the four wall_connection_type states and wall_post_bit from its neighbors and what sits on it.',
    {
        onPlace: (event, world) => {
            setStates(world, event.block, wallStates(world, event.block));
        },
        onNeighborChanged: (event, world) => {
            setStates(world, event.block, wallStates(world, event.block));
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Fences, which join their own group and refuse the other one. */
export const fenceFamily = defineFamily(
    'jsprismarine:fence',
    'Recomputes the four minecraft:connection states. Iron bars follow the pane rule, which refuses fences.',
    {
        onPlace: (event, world) => {
            const kind = bareName(event.block.identifier) === 'iron_bars' ? 'pane' : 'fence';
            setStates(world, event.block, connectionStates(world, kind, event.block));
        },
        onNeighborChanged: (event, world) => {
            const kind = bareName(event.block.identifier) === 'iron_bars' ? 'pane' : 'fence';
            setStates(world, event.block, connectionStates(world, kind, event.block));
        },
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/**
 * Panes and bars.
 *
 * No vanilla block reaches this family: the identifier rules send every
 * `_pane` to `jsprismarine:glass` and `iron_bars` to `jsprismarine:fence`
 * first. It stays registered because the rule exists and a pack can name it,
 * and because the pane connection rule is what a custom thin block wants.
 */
export const paneFamily = defineFamily(
    'jsprismarine:pane',
    'The pane connection rule, which joins panes, bars, walls and solid blocks but not fences.',
    {
        onPlace: (event, world) => {
            setStates(world, event.block, connectionStates(world, 'pane', event.block));
        },
        onNeighborChanged: (event, world) => {
            setStates(world, event.block, connectionStates(world, 'pane', event.block));
        }
    }
);
