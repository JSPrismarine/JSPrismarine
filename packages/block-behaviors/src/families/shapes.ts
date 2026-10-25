/**
 * The families whose work is a shape: slabs merging into double slabs,
 * stairs taking a corner, and the three thin blocks that connect to their
 * neighbors.
 */
import type { BlockStateValue, HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { WEIRDO_DIRECTIONS } from '../geometry';
import { connectionStates, wallStates } from '../rules/connection';
import { placedHalf, placementFacing } from '../rules/placement';
import { stairCorner } from '../rules/stairShape';
import { bareName, hasState, setStates, sibling, stateString } from '../state';
import type { WorldActions } from '../world';
import { dropSelf, waxOrScrapeHandler, weatherOnRandomTick } from './shared';

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

/** The state a slab writes its half into. */
const VERTICAL_HALF = 'minecraft:vertical_half';

/**
 * Half blocks.
 *
 * The click position picks the half: a click in the upper half of a side
 * face, or on the underside of a block, puts the slab on top. Placing one on
 * the free half of the same slab makes the double block instead, which is the
 * case where `BlockPlaceEvent.previous` is that slab in the other half.
 */
export const slabFamily = defineFamily(
    'jsprismarine:slab',
    'Takes its half from where the click landed, merges with the slab it replaced into the double block, and oxidizes when it is copper.',
    {
        onPlace: (event, world) => {
            const half = placedHalf(event) ?? stateString(event.block, VERTICAL_HALF, 'bottom');
            const previous = event.previous;

            if (previous !== undefined && previous.identifier === event.block.identifier) {
                if (stateString(previous, VERTICAL_HALF) === half) return;
                world.setBlock(event.block.position, doubleSlabName(event.block.identifier), {
                    [VERTICAL_HALF]: 'bottom'
                });
                world.playSound(event.block.position, 'use.stone');
                return;
            }

            if (!hasState(event.block, VERTICAL_HALF)) return;
            if (stateString(event.block, VERTICAL_HALF) === half) return;
            setStates(world, event.block, { [VERTICAL_HALF]: half });
        },
        onPlayerInteract: waxOrScrapeHandler,
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
    'Drops two of the slab it is made of, waxes and scrapes, and oxidizes when it is copper.',
    {
        onPlayerInteract: waxOrScrapeHandler,
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

/**
 * Stairs: the placer's look direction turns them, the click position flips
 * them, and the stairs in front and behind give them a corner.
 */
export const stairsFamily = defineFamily(
    'jsprismarine:stairs',
    'Turns to the placer, flips upside down for a click in the upper half, recomputes minecraft:corner on placement and on every neighbor change, and oxidizes when it is copper.',
    {
        onPlace: (event, world) => {
            const facing = placementFacing(event);
            const half = placedHalf(event);
            const patch: Record<string, BlockStateValue> = {};

            if (facing !== undefined && hasState(event.block, 'weirdo_direction')) {
                patch['weirdo_direction'] = WEIRDO_DIRECTIONS.indexOf(facing);
            }
            if (half !== undefined && hasState(event.block, 'upside_down_bit')) {
                patch['upside_down_bit'] = half === 'top';
            }
            if (Object.keys(patch).length > 0) setStates(world, event.block, patch);

            applyCorner(world, world.getBlock(event.block.position) ?? event.block);
        },
        onPlayerInteract: waxOrScrapeHandler,
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
    'Recomputes the four minecraft:connection states, and waxes, scrapes and oxidizes when it is copper. Iron bars follow the pane rule, which refuses fences.',
    {
        onPlace: (event, world) => {
            const kind = bareName(event.block.identifier) === 'iron_bars' ? 'pane' : 'fence';
            setStates(world, event.block, connectionStates(world, kind, event.block));
        },
        onNeighborChanged: (event, world) => {
            const kind = bareName(event.block.identifier) === 'iron_bars' ? 'pane' : 'fence';
            setStates(world, event.block, connectionStates(world, kind, event.block));
        },
        onPlayerInteract: waxOrScrapeHandler,
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
