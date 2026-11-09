/** Java's tree decorators, which run over a grown tree's logs, leaves and roots. */

import { randomBetweenInclusive, randomElement } from '../../placement/WorldgenRandom';
import type { BlockStateProvider } from '../../providers/blockStateProvider';
import type { Direction } from '../../world/BlockState';
import { ALL_DIRECTIONS, blockState, HORIZONTAL_DIRECTIONS, oppositeDirection } from '../../world/BlockState';
import type { BlockPos } from '../../world/FeatureWorld';
import { offset } from '../../world/FeatureWorld';
import { above, below, betweenClosed, relative, shuffledCopy } from '../support';

import type { DecoratorContext, TreeDecorator } from './shared';
import { CLOCKWISE, LOGS_TAG, randomHorizontal } from './shared';

// --- Tree decorators -----------------------------------------------------------------------

const lowestTrunkOrRoot = (context: DecoratorContext): BlockPos[] => {
    if (context.roots.length === 0) return [...context.logs];
    if (context.logs.length > 0 && context.roots[0]?.y === context.logs[0]?.y) {
        return [...context.logs, ...context.roots];
    }
    return [...context.roots];
};

/** Java's `AlterGroundDecorator`. */
export const alterGroundDecorator = (provider: BlockStateProvider): TreeDecorator => ({
    type: 'alter_ground',
    place: (context) => {
        const positions = lowestTrunkOrRoot(context);
        const first = positions[0];
        if (first === undefined) return;
        const minY = first.y;

        const placeBlockAt = (position: BlockPos) => {
            for (let dy = 2; dy >= -3; dy--) {
                const cursor = above(position, dy);
                const state = provider.getOptionalState(context.world, context.random, cursor);
                if (state !== undefined) {
                    context.setBlock(cursor, state);
                    break;
                }
                if (!context.world.blocks.isAir(context.world.getBlock(cursor)) && dy < 0) break;
            }
        };
        const placeCircle = (center: BlockPos) => {
            for (let xx = -2; xx <= 2; xx++) {
                for (let zz = -2; zz <= 2; zz++) {
                    if (Math.abs(xx) === 2 && Math.abs(zz) === 2) continue;
                    placeBlockAt(offset(center, xx, 0, zz));
                }
            }
        };

        for (const position of positions) {
            if (position.y !== minY) continue;
            placeCircle(offset(position, -1, 0, -1));
            placeCircle(offset(position, 2, 0, -1));
            placeCircle(offset(position, -1, 0, 2));
            placeCircle(offset(position, 2, 0, 2));
            for (let attempt = 0; attempt < 5; attempt++) {
                const placement = context.random.nextIntBounded(64);
                const xx = placement % 8;
                const zz = Math.trunc(placement / 8);
                if (xx === 0 || xx === 7 || zz === 0 || zz === 7) {
                    placeCircle(offset(position, -3 + xx, 0, -3 + zz));
                }
            }
        }
    }
});

/** Java's `AttachedToLeavesDecorator`. */
export const attachedToLeavesDecorator = (
    probability: number,
    exclusionRadiusXZ: number,
    exclusionRadiusY: number,
    blockProvider: BlockStateProvider,
    requiredEmptyBlocks: number,
    directions: readonly Direction[]
): TreeDecorator => ({
    type: 'attached_to_leaves',
    place: (context) => {
        const blacklist = new Set<string>();
        for (const leafPos of shuffledCopy(context.leaves, context.random)) {
            const direction = randomElement(directions, context.random);
            const placement = relative(leafPos, direction);
            const key = `${placement.x},${placement.y},${placement.z}`;
            if (blacklist.has(key)) continue;
            if (context.random.nextFloat() >= probability) continue;

            let clear = true;
            for (let step = 1; step <= requiredEmptyBlocks; step++) {
                if (!context.world.blocks.isAir(context.world.getBlock(relative(leafPos, direction, step)))) {
                    clear = false;
                    break;
                }
            }
            if (!clear) continue;

            const from = offset(placement, -exclusionRadiusXZ, -exclusionRadiusY, -exclusionRadiusXZ);
            const to = offset(placement, exclusionRadiusXZ, exclusionRadiusY, exclusionRadiusXZ);
            for (const inside of betweenClosed(from, to)) blacklist.add(`${inside.x},${inside.y},${inside.z}`);
            context.setBlock(placement, blockProvider.getState(context.world, context.random, placement));
        }
    }
});

/** Java's `AttachedToLogsDecorator`. */
export const attachedToLogsDecorator = (
    probability: number,
    blockProvider: BlockStateProvider,
    directions: readonly Direction[]
): TreeDecorator => ({
    type: 'attached_to_logs',
    place: (context) => {
        for (const logPos of shuffledCopy(context.logs, context.random)) {
            const direction = randomElement(directions, context.random);
            const placement = relative(logPos, direction);
            if (context.random.nextFloat() > probability) continue;
            if (!context.world.blocks.isAir(context.world.getBlock(placement))) continue;
            context.setBlock(placement, blockProvider.getState(context.world, context.random, placement));
        }
    }
});

const BEEHIVE_FACING: Direction = 'south';

/** Java's `BeehiveDecorator`. */
export const beehiveDecorator = (probability: number): TreeDecorator => ({
    type: 'beehive',
    place: (context) => {
        const logs = context.logs;
        const firstLog = logs[0];
        const lastLog = logs[logs.length - 1];
        if (firstLog === undefined || lastLog === undefined) return;
        if (context.random.nextFloat() >= probability) return;

        const firstLeaf = context.leaves[0];
        const hiveY =
            firstLeaf !== undefined
                ? Math.max(firstLeaf.y - 1, firstLog.y + 1)
                : Math.min(firstLog.y + 1 + context.random.nextIntBounded(3), lastLog.y);

        const spawnDirections = HORIZONTAL_DIRECTIONS.filter(
            (direction) => direction !== oppositeDirection(BEEHIVE_FACING)
        );
        const candidates: BlockPos[] = [];
        for (const log of logs) {
            if (log.y !== hiveY) continue;
            for (const direction of spawnDirections) candidates.push(relative(log, direction));
        }
        if (candidates.length === 0) return;

        const shuffled = shuffledCopy(candidates, context.random);
        const isAir = (position: BlockPos) => context.world.blocks.isAir(context.world.getBlock(position));
        const hivePos = shuffled.find((position) => isAir(position) && isAir(relative(position, BEEHIVE_FACING)));
        if (hivePos === undefined) return;

        context.setBlock(hivePos, blockState('minecraft:bee_nest', { facing: BEEHIVE_FACING, honey_level: '0' }));
        // Java then stores two or three bees in the block entity, drawing one int each.
        const bees = 2 + context.random.nextIntBounded(2);
        for (let bee = 0; bee < bees; bee++) context.random.nextIntBounded(599);
        context.world.setBlockEntity?.(hivePos, { id: 'minecraft:beehive' });
    }
});

/** Java's `CocoaDecorator`. */
export const cocoaDecorator = (probability: number): TreeDecorator => ({
    type: 'cocoa',
    place: (context) => {
        if (context.random.nextFloat() >= probability) return;
        const firstLog = context.logs[0];
        if (firstLog === undefined) return;

        for (const log of context.logs) {
            if (log.y - firstLog.y > 2) continue;
            for (const direction of HORIZONTAL_DIRECTIONS) {
                if (context.random.nextFloat() > 0.25) continue;
                const cocoaPos = relative(log, oppositeDirection(direction));
                if (!context.world.blocks.isAir(context.world.getBlock(cocoaPos))) continue;
                context.setBlock(
                    cocoaPos,
                    blockState('minecraft:cocoa', { age: String(context.random.nextIntBounded(3)), facing: direction })
                );
            }
        }
    }
});

/** Java's `CreakingHeartDecorator`. */
export const creakingHeartDecorator = (probability: number): TreeDecorator => ({
    type: 'creaking_heart',
    place: (context) => {
        if (context.logs.length === 0) return;
        if (context.random.nextFloat() >= probability) return;
        const shuffled = shuffledCopy(context.logs, context.random);
        const surrounded = shuffled.find((position) =>
            ALL_DIRECTIONS.every((direction) =>
                context.world.blocks.hasTag(context.world.getBlock(relative(position, direction)), LOGS_TAG)
            )
        );
        if (surrounded === undefined) return;
        context.setBlock(
            surrounded,
            blockState('minecraft:creaking_heart', { creaking_heart_state: 'dormant', natural: 'true', axis: 'y' })
        );
    }
});

const VINE_OPPOSITE_FACE: Readonly<Record<'west' | 'east' | 'north' | 'south', Direction>> = {
    west: 'east',
    east: 'west',
    north: 'south',
    south: 'north'
};

/** Java's `LeaveVineDecorator`. */
export const leaveVineDecorator = (probability: number): TreeDecorator => ({
    type: 'leave_vine',
    place: (context) => {
        const placeVine = (position: BlockPos, face: Direction) =>
            context.setBlock(position, blockState('minecraft:vine', { [face]: 'true' }));
        const addHanging = (start: BlockPos, face: Direction) => {
            placeVine(start, face);
            let position = below(start);
            for (
                let remaining = 4;
                remaining > 0 && context.world.blocks.isAir(context.world.getBlock(position));
                remaining--
            ) {
                placeVine(position, face);
                position = below(position);
            }
        };

        for (const leaf of context.leaves) {
            for (const side of ['west', 'east', 'north', 'south'] as const) {
                if (context.random.nextFloat() >= probability) continue;
                const position = relative(leaf, side);
                if (!context.world.blocks.isAir(context.world.getBlock(position))) continue;
                addHanging(position, VINE_OPPOSITE_FACE[side]);
            }
        }
    }
});

/** Java's `TrunkVineDecorator`. */
export const trunkVineDecorator = (): TreeDecorator => ({
    type: 'trunk_vine',
    place: (context) => {
        for (const log of context.logs) {
            for (const side of ['west', 'east', 'north', 'south'] as const) {
                if (context.random.nextIntBounded(3) <= 0) continue;
                const position = relative(log, side);
                if (!context.world.blocks.isAir(context.world.getBlock(position))) continue;
                context.setBlock(position, blockState('minecraft:vine', { [VINE_OPPOSITE_FACE[side]]: 'true' }));
            }
        }
    }
});

/** Java's `PaleMossDecorator`. */
export const paleMossDecorator = (
    leavesProbability: number,
    trunkProbability: number,
    groundProbability: number
): TreeDecorator => ({
    type: 'pale_moss',
    place: (context) => {
        if (context.logs.length === 0) return;
        // Java looks up and runs `minecraft:pale_moss_patch` here, which needs the feature
        // registry. The draw is kept so the stream stays aligned and the patch is left to the
        // caller, which is recorded in the README.
        context.random.nextFloat();
        void groundProbability;

        const addHanger = (start: BlockPos) => {
            let position = start;
            while (
                context.world.blocks.isAir(context.world.getBlock(below(position))) &&
                !(context.random.nextFloat() < 0.5)
            ) {
                context.setBlock(position, blockState('minecraft:pale_hanging_moss', { tip: 'false' }));
                position = below(position);
            }
            context.setBlock(position, blockState('minecraft:pale_hanging_moss', { tip: 'true' }));
        };

        for (const log of context.logs) {
            if (context.random.nextFloat() >= trunkProbability) continue;
            const under = below(log);
            if (context.world.blocks.isAir(context.world.getBlock(under))) addHanger(under);
        }
        for (const leaf of context.leaves) {
            if (context.random.nextFloat() >= leavesProbability) continue;
            const under = below(leaf);
            if (context.world.blocks.isAir(context.world.getBlock(under))) addHanger(under);
        }
    }
});

/** Java's `PlaceOnGroundDecorator`. */
export const placeOnGroundDecorator = (
    tries: number,
    radius: number,
    height: number,
    blockStateProvider: BlockStateProvider
): TreeDecorator => ({
    type: 'place_on_ground',
    place: (context) => {
        const positions = lowestTrunkOrRoot(context);
        const first = positions[0];
        if (first === undefined) return;

        const minY = first.y;
        let minX = first.x;
        let maxX = first.x;
        let minZ = first.z;
        let maxZ = first.z;
        for (const position of positions) {
            if (position.y !== minY) continue;
            minX = Math.min(minX, position.x);
            maxX = Math.max(maxX, position.x);
            minZ = Math.min(minZ, position.z);
            maxZ = Math.max(maxZ, position.z);
        }

        const box = {
            minX: minX - radius,
            maxX: maxX + radius,
            minY: minY - height,
            maxY: minY + height,
            minZ: minZ - radius,
            maxZ: maxZ + radius
        };

        for (let attempt = 0; attempt < tries; attempt++) {
            const position = {
                x: randomBetweenInclusive(context.random, box.minX, box.maxX),
                y: randomBetweenInclusive(context.random, box.minY, box.maxY),
                z: randomBetweenInclusive(context.random, box.minZ, box.maxZ)
            };
            const over = above(position);
            const overState = context.world.getBlock(over);
            const clearAbove = context.world.blocks.isAir(overState) || overState.name === 'minecraft:vine';
            if (!clearAbove) continue;
            if (!context.world.blocks.isSolid(context.world.getBlock(position))) continue;
            if (context.world.getHeight('MOTION_BLOCKING_NO_LEAVES', position.x, position.z) > over.y) continue;
            context.setBlock(over, blockStateProvider.getState(context.world, context.random, over));
        }
    }
});

/** Java's `ShelfMushroomDecorator`. */
export const shelfMushroomDecorator = (probability: number): TreeDecorator => ({
    type: 'shelf_mushroom',
    place: (context) => {
        if (context.random.nextFloat() >= probability) return;
        const logs = context.logs;
        const first = logs[0];
        const last = logs[logs.length - 1];
        if (first === undefined || last === undefined) return;

        const isReplaceable = (position: BlockPos) =>
            context.world.blocks.isReplaceable(context.world.getBlock(position)) &&
            context.world.blocks.fluid(context.world.getBlock(position)) !== 'water';
        const hasMushroom = (position: BlockPos) =>
            context.world.getBlock(position).name === 'minecraft:shelf_mushroom';
        const hasAdjacentMushroom = (position: BlockPos) =>
            HORIZONTAL_DIRECTIONS.some((direction) => hasMushroom(relative(position, direction)));
        const place = (position: BlockPos, facing: Direction) =>
            context.setBlock(
                position,
                blockState('minecraft:shelf_mushroom', {
                    age: String(context.random.nextIntBounded(2)),
                    facing
                })
            );

        const fallen = first.y === last.y;
        if (fallen) {
            const axisX = first.x !== last.x;
            const directions: Direction[] = axisX ? ['north', 'south'] : ['east', 'west'];
            for (const log of logs) {
                for (const facing of directions) {
                    if (context.random.nextFloat() > 0.25) continue;
                    const position = relative(log, facing);
                    if (!isReplaceable(position)) continue;
                    if (hasAdjacentMushroom(position) || hasAdjacentMushroom(log)) continue;
                    place(position, facing);
                }
            }
            return;
        }

        const firstDirection = randomHorizontal(context.random);
        const directions = [firstDirection, CLOCKWISE[firstDirection]];
        for (const log of logs) {
            const dy = log.y - first.y;
            if (dy < 1 || dy > 4) continue;
            for (const facing of directions) {
                if (context.random.nextFloat() > 0.25) continue;
                const position = relative(log, facing);
                if (!isReplaceable(position)) continue;
                if (hasMushroom(below(position))) continue;
                place(position, facing);
                break;
            }
        }
    }
});
