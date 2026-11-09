/** Java's root placers; vanilla ships only `mangrove_root_placer`. */

import type { RandomSource } from '@jsprismarine/worldgen';
import type { BlockStateProvider } from '../../providers/blockStateProvider';
import type { IntProvider } from '../../providers/valueProviders';
import type { BlockSet } from '../../registry';
import type { Direction } from '../../world/BlockState';
import { HORIZONTAL_DIRECTIONS } from '../../world/BlockState';
import type { BlockPos, FeatureWorld } from '../../world/FeatureWorld';
import { above, below, inBlockSet, relative } from '../support';

import type { RootPlacer, TreeContext } from './shared';
import { validTreePos, waterlogged } from './shared';

// --- Root placer ---------------------------------------------------------------------------

/** Java's `MangroveRootPlacer`. */
export const mangroveRootPlacer = (
    trunkOffsetY: IntProvider,
    rootProvider: BlockStateProvider,
    aboveRootProvider: BlockStateProvider | undefined,
    aboveRootPlacementChance: number,
    canGrowThrough: BlockSet,
    muddyRootsIn: BlockSet,
    muddyRootsProvider: BlockStateProvider,
    maxRootWidth: number,
    maxRootLength: number,
    randomSkewChance: number
): RootPlacer => {
    const canPlaceRoot = (world: FeatureWorld, position: BlockPos): boolean =>
        validTreePos(world, position) || inBlockSet(world.blocks, world.getBlock(position), canGrowThrough);

    const potentialPositions = (
        position: BlockPos,
        previous: Direction,
        random: RandomSource,
        rootOrigin: BlockPos
    ): BlockPos[] => {
        const under = below(position);
        const nextTo = relative(position, previous);
        const width =
            Math.abs(position.x - rootOrigin.x) +
            Math.abs(position.y - rootOrigin.y) +
            Math.abs(position.z - rootOrigin.z);
        if (width > maxRootWidth - 3 && width <= maxRootWidth) {
            return random.nextFloat() < randomSkewChance ? [under, below(nextTo)] : [under];
        }
        if (width > maxRootWidth) return [under];
        if (random.nextFloat() < randomSkewChance) return [under];
        return random.nextBoolean() ? [nextTo] : [under];
    };

    const simulate = (
        context: TreeContext,
        rootPos: BlockPos,
        direction: Direction,
        rootOrigin: BlockPos,
        found: BlockPos[],
        layer: number
    ): boolean => {
        if (layer === maxRootLength || found.length > maxRootLength) return false;
        for (const candidate of potentialPositions(rootPos, direction, context.random, rootOrigin)) {
            if (!canPlaceRoot(context.world, candidate)) continue;
            found.push(candidate);
            if (!simulate(context, candidate, direction, rootOrigin, found, layer + 1)) return false;
        }
        return true;
    };

    const placeRoot = (context: TreeContext, position: BlockPos): void => {
        if (!canPlaceRoot(context.world, position)) return;
        const muddy = inBlockSet(context.world.blocks, context.world.getBlock(position), muddyRootsIn);
        const provider = muddy ? muddyRootsProvider : rootProvider;
        const state = provider.getState(context.world, context.random, position);
        context.setRoot(position, waterlogged(context.world, position, state));
        if (muddy || aboveRootProvider === undefined) return;
        const over = above(position);
        if (context.random.nextFloat() >= aboveRootPlacementChance) return;
        if (!context.world.blocks.isAir(context.world.getBlock(over))) return;
        const aboveState = aboveRootProvider.getState(context.world, context.random, over);
        context.setRoot(over, waterlogged(context.world, over, aboveState));
    };

    return {
        type: 'mangrove_root_placer',
        trunkOrigin: (origin, random) => above(origin, trunkOffsetY.sample(random)),
        place: (context, origin, trunkOrigin) => {
            const found: BlockPos[] = [];
            for (let y = origin.y; y < trunkOrigin.y; y++) {
                if (!canPlaceRoot(context.world, { x: origin.x, y, z: origin.z })) return false;
            }
            found.push(below(trunkOrigin));
            for (const direction of HORIZONTAL_DIRECTIONS) {
                const start = relative(trunkOrigin, direction);
                const inDirection: BlockPos[] = [];
                if (!simulate(context, start, direction, trunkOrigin, inDirection, 0)) return false;
                found.push(...inDirection, start);
            }
            for (const position of found) placeRoot(context, position);
            return true;
        }
    };
};
