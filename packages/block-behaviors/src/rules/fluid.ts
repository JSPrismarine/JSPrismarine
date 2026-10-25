/**
 * How water and lava spread, and what they make when they meet.
 *
 * `liquid_depth` counts away from the source: 0 is the source and each step
 * out adds the liquid's drop. Water drops 1 and reaches 7 blocks; lava drops
 * 2 in the overworld, which is why it reaches 3, and 1 in the nether.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';

import type { HorizontalFace } from '../geometry';
import { HORIZONTAL_FACES, offset } from '../geometry';
import {
    COBBLESTONE,
    flowingForm,
    isLava,
    isLiquid,
    isLiquidSource,
    isReplaceable,
    isWater,
    OBSIDIAN,
    STONE
} from '../identifiers';
import { stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The largest `liquid_depth` a horizontal spread writes. */
export const MAX_LIQUID_DEPTH = 7;

/** The nether, where lava spreads as far as water does. */
export const NETHER = 'minecraft:nether';

/** Game ticks between one water spread and the next. */
export const WATER_SPREAD_TICKS = 5;

/** Game ticks between one lava spread and the next, in the overworld. */
export const LAVA_SPREAD_TICKS = 30;

/** Game ticks between one lava spread and the next, in the nether. */
export const NETHER_LAVA_SPREAD_TICKS = 10;

/** How much `liquid_depth` one horizontal step adds, for a liquid in a dimension. */
export const depthStep = (identifier: string, dimension: string): number =>
    isLava(identifier) && dimension !== NETHER ? 2 : 1;

/** Game ticks between spreads, for a liquid in a dimension. */
export const spreadTicks = (identifier: string, dimension: string): number => {
    if (!isLava(identifier)) return WATER_SPREAD_TICKS;
    return dimension === NETHER ? NETHER_LAVA_SPREAD_TICKS : LAVA_SPREAD_TICKS;
};

/**
 * What lava turns into when water reaches it.
 *
 * @param fromAbove - True when the water is above the lava, which is the
 *   case that makes stone rather than cobblestone.
 * @returns The block identifier, or undefined when the pair makes nothing.
 */
export const lavaWaterProduct = (lava: HookBlock, fromAbove: boolean): string | undefined => {
    if (!isLava(lava.identifier)) return undefined;
    if (isLiquidSource(lava.identifier)) return OBSIDIAN;
    return fromAbove ? STONE : COBBLESTONE;
};

/**
 * Turns lava to rock where water touches it.
 *
 * @returns The face the water came from, or undefined when no water touches
 *   the lava.
 */
export const applyLavaWaterReaction = (world: WorldActions, lava: HookBlock): BlockFace | undefined => {
    const faces: readonly BlockFace[] = ['up', ...HORIZONTAL_FACES];
    for (const face of faces) {
        const neighbor = world.getBlock(offset(lava.position, face));
        if (neighbor === undefined || !isWater(neighbor.identifier)) continue;
        const product = lavaWaterProduct(lava, face === 'up');
        if (product === undefined) return undefined;
        world.setBlock(lava.position, product);
        world.playSound(lava.position, 'random.fizz');
        world.notifyNeighbors(lava.position);
        return face;
    }
    return undefined;
};

/**
 * Whether a liquid at a depth can flow into a position.
 *
 * A position already holding the same liquid at the same depth or shallower
 * is left alone, which is what stops a pool rewriting itself forever.
 */
export const canFlowInto = (world: WorldActions, position: BlockPosition, liquid: string, depth: number): boolean => {
    const block = world.getBlock(position);
    if (block === undefined || !isReplaceable(block.identifier)) return false;
    const sameLiquid = isLava(liquid) ? isLava(block.identifier) : isWater(block.identifier);
    if (!sameLiquid) return true;
    if (isLiquidSource(block.identifier)) return false;
    return stateNumber(block, 'liquid_depth') > depth;
};

/** Where a liquid spread went. */
export interface SpreadResult {
    /** True when the liquid fell into the position below. */
    readonly down: boolean;
    /** The faces the liquid spread sideways along. */
    readonly sides: readonly HorizontalFace[];
}

/**
 * Spreads a liquid one step.
 *
 * Falling wins: a liquid with a free position below fills it and spreads no
 * further sideways, which is what makes a waterfall a single column.
 */
export const spreadLiquid = (world: WorldActions, liquid: HookBlock): SpreadResult => {
    if (!isLiquid(liquid.identifier)) return { down: false, sides: [] };

    const flowing = flowingForm(liquid.identifier);
    const below = offset(liquid.position, 'down');
    if (canFlowInto(world, below, liquid.identifier, 0)) {
        world.setBlock(below, flowing, { liquid_depth: 0 });
        world.notifyNeighbors(below);
        return { down: true, sides: [] };
    }

    const depth = isLiquidSource(liquid.identifier) ? 0 : stateNumber(liquid, 'liquid_depth');
    const next = depth + depthStep(liquid.identifier, liquid.dimension);
    if (next > MAX_LIQUID_DEPTH) return { down: false, sides: [] };

    const sides: HorizontalFace[] = [];
    for (const face of HORIZONTAL_FACES) {
        const position = offset(liquid.position, face);
        if (!canFlowInto(world, position, liquid.identifier, next)) continue;
        world.setBlock(position, flowing, { liquid_depth: next });
        world.notifyNeighbors(position);
        sides.push(face);
    }
    return { down: false, sides };
};
