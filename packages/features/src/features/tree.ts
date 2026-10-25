import type { RandomSource } from '@jsprismarine/worldgen';

import { asArray, asInteger, asNumber, asObject, fail } from '../json';
import { randomBetweenInclusive, randomElement } from '../placement/WorldgenRandom';
import { parseDirection } from '../providers/blockPredicate';
import type { BlockStateProvider } from '../providers/blockStateProvider';

import type { IntProvider } from '../providers/valueProviders';
import { constantInt, parseIntProvider } from '../providers/valueProviders';
import type { BlockSet } from '../registry';
import { parseBlockSet, typeNameOf } from '../registry';
import type { BlockState, Direction } from '../world/BlockState';
import {
    ALL_DIRECTIONS,
    blockState,
    DIRECTION_STEPS,
    HORIZONTAL_DIRECTIONS,
    oppositeDirection,
    withProperty
} from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { offset } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import type { FeatureParsers } from './parseContext';
import { feature } from './Feature';
import { JavaHashSet } from './javaHashSet';
import { above, below, betweenClosed, inBlockSet, mthCos, mthSin, relative, shuffledCopy } from './support';

const f32 = Math.fround;
const LEAVES_TAG = 'minecraft:leaves';
const LOGS_TAG = 'minecraft:logs';
const REPLACEABLE_BY_TREES_TAG = 'minecraft:replaceable_by_trees';

/** Everything a placer needs from the tree it belongs to. */
export interface TreeContext {
    /** The world being built into. */
    readonly world: FeatureWorld;
    /** The stream every draw comes from. */
    readonly random: RandomSource;
    /** The tree's configuration. */
    readonly config: TreeConfig;
    /** Records a log or a root. */
    setTrunk(position: BlockPos, state: BlockState): void;
    /** Records a root. */
    setRoot(position: BlockPos, state: BlockState): void;
    /** Records a leaf. */
    setFoliage(position: BlockPos, state: BlockState): void;
    /** Answers whether a leaf was already placed here by this tree. */
    hasFoliage(position: BlockPos): boolean;
}

/** Where a foliage placer hangs its leaves, Java's `FoliageAttachment`. */
export interface FoliageAttachment {
    /** The block the foliage grows around. */
    readonly pos: BlockPos;
    /** How much wider than the configured radius this attachment's foliage is. */
    readonly radiusOffsetXZ: number;
    /** How much taller than the configured height this attachment's foliage is. */
    readonly foliageHeightOffset: number;
    /** The trunk's x extent at the attachment, 1 for a normal tree and 2 for a giant one. */
    readonly sizeX: number;
    /** The trunk's z extent at the attachment. */
    readonly sizeZ: number;
}

const attachment = (
    pos: BlockPos,
    radiusOffsetXZ: number,
    doubleTrunk: boolean,
    foliageHeightOffset = 0
): FoliageAttachment => ({
    pos,
    radiusOffsetXZ,
    foliageHeightOffset,
    sizeX: doubleTrunk ? 2 : 1,
    sizeZ: doubleTrunk ? 2 : 1
});

const isDoubleTrunk = (entry: FoliageAttachment): boolean => entry.sizeX === 2 && entry.sizeZ === 2;

/** How wide the tree must be free at each height, Java's `FeatureSize`. */
export interface FeatureSize {
    /** The registry name. */
    readonly type: 'two_layers_feature_size' | 'three_layers_feature_size';
    /** The shortest clipped trunk the tree will still accept, when it accepts one. */
    readonly minClippedHeight?: number;
    /** The half-width that must be free at a height above the trunk's base. */
    sizeAtHeight(treeHeight: number, y: number): number;
}

/** Lays out the trunk and reports where the foliage attaches, Java's `TrunkPlacer`. */
export interface TrunkPlacer {
    /** The registry name. */
    readonly type: string;
    /** Draws the tree's total height. */
    treeHeight(random: RandomSource): number;
    /** Builds the trunk and returns the foliage attachments. */
    place(context: TreeContext, treeHeight: number, origin: BlockPos): FoliageAttachment[];
    /** Answers whether a position does not block the trunk, which the free-height scan reads. */
    isFree(world: FeatureWorld, position: BlockPos): boolean;
}

/** Lays out the leaves around an attachment, Java's `FoliagePlacer`. */
export interface FoliagePlacer {
    /** The registry name. */
    readonly type: string;
    /** Draws how tall the foliage is. */
    foliageHeight(random: RandomSource, treeHeight: number): number;
    /** Draws how wide the foliage is. */
    foliageRadius(random: RandomSource, trunkHeight: number): number;
    /** Builds the leaves for one attachment. */
    create(
        context: TreeContext,
        treeHeight: number,
        entry: FoliageAttachment,
        foliageHeight: number,
        leafRadius: number
    ): void;
}

/** Lays out the roots below the trunk, Java's `RootPlacer`. */
export interface RootPlacer {
    /** The registry name. */
    readonly type: 'mangrove_root_placer';
    /** Returns where the trunk starts, which a root placer raises above the origin. */
    trunkOrigin(origin: BlockPos, random: RandomSource): BlockPos;
    /** Builds the roots. Returns false to abandon the whole tree. */
    place(context: TreeContext, origin: BlockPos, trunkOrigin: BlockPos): boolean;
}

/** Adds the hives, vines, mushrooms and ground cover a tree carries, Java's `TreeDecorator`. */
export interface TreeDecorator {
    /** The registry name. */
    readonly type: string;
    /** Runs over the finished tree. */
    place(context: DecoratorContext): void;
}

/** What a decorator sees of the finished tree. */
export interface DecoratorContext {
    /** The world being built into. */
    readonly world: FeatureWorld;
    /** The stream every draw comes from. */
    readonly random: RandomSource;
    /** Every log, sorted by y with ties in Java's hash order. */
    readonly logs: readonly BlockPos[];
    /** Every leaf, sorted the same way. */
    readonly leaves: readonly BlockPos[];
    /** Every root, in Java's hash order. */
    readonly roots: readonly BlockPos[];
    /** Writes a decoration block. */
    setBlock(position: BlockPos, state: BlockState): void;
}

/** A parsed `minecraft:tree` configuration. */
export interface TreeConfig {
    /** The log the trunk is made of. */
    readonly trunkProvider: BlockStateProvider;
    /** The trunk layout. */
    readonly trunkPlacer: TrunkPlacer;
    /** The leaf the foliage is made of. */
    readonly foliageProvider: BlockStateProvider;
    /** The foliage layout. */
    readonly foliagePlacer: FoliagePlacer;
    /** The root layout, when the tree has roots. */
    readonly rootPlacer?: RootPlacer;
    /** How much room the tree needs. */
    readonly minimumSize: FeatureSize;
    /** What is added after the trunk and foliage. */
    readonly decorators: readonly TreeDecorator[];
    /** Whether a vine in the way stops the tree. */
    readonly ignoreVines: boolean;
    /** What the trunk puts into the block it stands on. */
    readonly belowTrunkProvider: BlockStateProvider;
}

const isAirOrLeaves = (world: FeatureWorld, position: BlockPos): boolean => {
    const state = world.getBlock(position);
    return world.blocks.isAir(state) || world.blocks.hasTag(state, LEAVES_TAG);
};

/** Answers Java's `TreeFeature.validTreePos`: air, or a block trees are allowed to grow through. */
export const validTreePos = (world: FeatureWorld, position: BlockPos): boolean => {
    const state = world.getBlock(position);
    return world.blocks.isAir(state) || world.blocks.hasTag(state, REPLACEABLE_BY_TREES_TAG);
};

const isVine = (world: FeatureWorld, position: BlockPos): boolean => world.getBlock(position).name === 'minecraft:vine';

const waterlogged = (world: FeatureWorld, position: BlockPos, state: BlockState): BlockState =>
    'waterlogged' in state.properties
        ? withProperty(
              state,
              'waterlogged',
              world.blocks.fluid(world.getBlock(position)) === 'water' ? 'true' : 'false'
          )
        : state;

/**
 * Builds a tree, Java's `TreeFeature`.
 *
 * Forty-five of the 240 vanilla configured features are this one type. All of the variety lives
 * in the four composable parts: a trunk placer that returns where foliage should attach, a
 * foliage placer that fills those attachments, an optional root placer, and a list of decorators.
 *
 * The order of the draws is the part worth stating. `tree_height` comes first, then
 * `foliage_height`, then `foliage_radius`, then the root placer's trunk offset, then the whole
 * trunk, then each attachment's foliage in the order the trunk placer returned them, then the
 * decorators in their declared order. Moving any of those moves every block after it.
 */
export const tree = (config: TreeConfig): ConfiguredFeature =>
    feature('tree', (world, random, origin) => {
        const roots = new JavaHashSet();
        const trunks = new JavaHashSet();
        const foliage = new JavaHashSet();
        const decorations = new JavaHashSet();

        const context: TreeContext = {
            world,
            random,
            config,
            setTrunk: (position, state) => {
                trunks.add(position);
                world.setBlock(position, state);
            },
            setRoot: (position, state) => {
                roots.add(position);
                world.setBlock(position, state);
            },
            setFoliage: (position, state) => {
                foliage.add(position);
                world.setBlock(position, state);
            },
            hasFoliage: (position) => foliage.has(position)
        };

        const treeHeight = config.trunkPlacer.treeHeight(random);
        const foliageHeight = config.foliagePlacer.foliageHeight(random, treeHeight);
        const trunkHeight = treeHeight - foliageHeight;
        const leafRadius = config.foliagePlacer.foliageRadius(random, trunkHeight);
        const trunkOrigin = config.rootPlacer?.trunkOrigin(origin, random) ?? origin;

        const minY = Math.min(origin.y, trunkOrigin.y);
        const maxY = Math.max(origin.y, trunkOrigin.y) + treeHeight + 1;
        if (minY < world.minY + 1 || maxY > world.minY + world.height) return false;

        const clippedHeight = maxFreeTreeHeight(context, treeHeight, trunkOrigin);
        const minClipped = config.minimumSize.minClippedHeight;
        if (clippedHeight < treeHeight && !(minClipped !== undefined && clippedHeight >= minClipped)) return false;
        if (config.rootPlacer !== undefined && !config.rootPlacer.place(context, origin, trunkOrigin)) return false;

        const attachments = config.trunkPlacer.place(context, clippedHeight, trunkOrigin);
        for (const entry of attachments) {
            config.foliagePlacer.create(context, clippedHeight, entry, foliageHeight, leafRadius);
        }

        if (trunks.size === 0 && foliage.size === 0) return false;
        if (config.decorators.length === 0) return true;

        const decoratorContext: DecoratorContext = {
            world,
            random,
            logs: trunks.sortedByY(),
            leaves: foliage.sortedByY(),
            roots: roots.toArray(),
            setBlock: (position, state) => {
                decorations.add(position);
                world.setBlock(position, state);
            }
        };
        for (const decorator of config.decorators) decorator.place(decoratorContext);
        return true;
    });

const maxFreeTreeHeight = (context: TreeContext, maxTreeHeight: number, treePos: BlockPos): number => {
    const { world, config } = context;
    for (let y = 0; y <= maxTreeHeight + 1; y++) {
        const radius = config.minimumSize.sizeAtHeight(maxTreeHeight, y);
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                const position = offset(treePos, x, y, z);
                const blocked =
                    !config.trunkPlacer.isFree(world, position) || (!config.ignoreVines && isVine(world, position));
                if (blocked) return y - 2;
            }
        }
    }
    return maxTreeHeight;
};

const placeLog = (
    context: TreeContext,
    position: BlockPos,
    modify: (state: BlockState) => BlockState = (state) => state
): boolean => {
    if (!validTreePos(context.world, position)) return false;
    context.setTrunk(position, modify(context.config.trunkProvider.getState(context.world, context.random, position)));
    return true;
};

const placeBelowTrunkBlock = (context: TreeContext, position: BlockPos): void => {
    const state = context.config.belowTrunkProvider.getOptionalState(context.world, context.random, position);
    if (state !== undefined) context.setTrunk(position, state);
};

const sidewaysAxis = (direction: Direction): ((state: BlockState) => BlockState) => {
    const axis =
        direction === 'up' || direction === 'down' ? 'y' : direction === 'north' || direction === 'south' ? 'z' : 'x';
    return (state) => ('axis' in state.properties ? withProperty(state, 'axis', axis) : state);
};

const randomHorizontal = (random: RandomSource): Direction => randomElement(HORIZONTAL_DIRECTIONS, random);

const trunkBase = (
    type: string,
    baseHeight: number,
    heightRandA: number,
    heightRandB: number,
    place: TrunkPlacer['place'],
    canGrowThrough?: BlockSet
): TrunkPlacer => ({
    type,
    treeHeight: (random) =>
        baseHeight + random.nextIntBounded(heightRandA + 1) + random.nextIntBounded(heightRandB + 1),
    place,
    isFree: (world, position) => {
        if (validTreePos(world, position)) return true;
        const state = world.getBlock(position);
        if (canGrowThrough !== undefined && inBlockSet(world.blocks, state, canGrowThrough)) return true;
        return world.blocks.hasTag(state, LOGS_TAG);
    }
});

// --- Trunk placers -------------------------------------------------------------------------

const straightTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('straight_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        for (let y = 0; y < treeHeight; y++) placeLog(context, above(origin, y));
        return [attachment(above(origin, treeHeight), 0, false)];
    });

const forkingTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('forking_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        const attachments: FoliageAttachment[] = [];
        const leanDirection = randomHorizontal(context.random);
        const leanHeight = treeHeight - context.random.nextIntBounded(4) - 1;
        let leanSteps = 3 - context.random.nextIntBounded(3);

        let x = origin.x;
        let z = origin.z;
        let endY: number | undefined;
        for (let step = 0; step < treeHeight; step++) {
            const y = origin.y + step;
            if (step >= leanHeight && leanSteps > 0) {
                x += DIRECTION_STEPS[leanDirection][0];
                z += DIRECTION_STEPS[leanDirection][2];
                leanSteps--;
            }
            if (placeLog(context, { x, y, z })) endY = y + 1;
        }
        if (endY !== undefined) attachments.push(attachment({ x, y: endY, z }, 1, false));

        x = origin.x;
        z = origin.z;
        const branchDirection = randomHorizontal(context.random);
        if (branchDirection !== leanDirection) {
            const branchStart = leanHeight - context.random.nextIntBounded(2) - 1;
            let branchSteps = 1 + context.random.nextIntBounded(3);
            endY = undefined;
            for (let step = branchStart; step < treeHeight && branchSteps > 0; branchSteps--, step++) {
                if (step < 1) continue;
                const y = origin.y + step;
                x += DIRECTION_STEPS[branchDirection][0];
                z += DIRECTION_STEPS[branchDirection][2];
                if (placeLog(context, { x, y, z })) endY = y + 1;
            }
            if (endY !== undefined) attachments.push(attachment({ x, y: endY, z }, 0, false));
        }
        return attachments;
    });

const giantTrunkPlacer = (base: number, randA: number, randB: number, type = 'giant_trunk_placer'): TrunkPlacer =>
    trunkBase(type, base, randA, randB, (context, treeHeight, origin) => {
        const under = below(origin);
        placeBelowTrunkBlock(context, under);
        placeBelowTrunkBlock(context, offset(under, 1, 0, 0));
        placeBelowTrunkBlock(context, offset(under, 0, 0, 1));
        placeBelowTrunkBlock(context, offset(under, 1, 0, 1));

        const placeIfFree = (position: BlockPos) => {
            if (context.config.trunkPlacer.isFree(context.world, position)) placeLog(context, position);
        };
        for (let y = 0; y < treeHeight; y++) {
            placeIfFree(offset(origin, 0, y, 0));
            if (y >= treeHeight - 1) continue;
            placeIfFree(offset(origin, 1, y, 0));
            placeIfFree(offset(origin, 1, y, 1));
            placeIfFree(offset(origin, 0, y, 1));
        }
        return [attachment(above(origin, treeHeight), 0, true)];
    });

const megaJungleTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer => {
    const giant = giantTrunkPlacer(base, randA, randB, 'mega_jungle_trunk_placer');
    return {
        ...giant,
        place: (context, treeHeight, origin) => {
            const attachments = giant.place(context, treeHeight, origin);
            for (
                let branchHeight = treeHeight - 2 - context.random.nextIntBounded(4);
                branchHeight > treeHeight / 2;
                branchHeight -= 2 + context.random.nextIntBounded(4)
            ) {
                const angle = f32(context.random.nextFloat() * f32(Math.PI * 2));
                let bx = 0;
                let bz = 0;
                for (let step = 0; step < 5; step++) {
                    bx = Math.trunc(f32(1.5 + mthCos(angle) * step));
                    bz = Math.trunc(f32(1.5 + mthSin(angle) * step));
                    placeLog(context, offset(origin, bx, branchHeight - 3 + Math.trunc(step / 2), bz));
                }
                attachments.push(attachment(offset(origin, bx, branchHeight, bz), -2, false));
            }
            return attachments;
        }
    };
};

const darkOakTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('dark_oak_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const attachments: FoliageAttachment[] = [];
        const under = below(origin);
        placeBelowTrunkBlock(context, under);
        placeBelowTrunkBlock(context, offset(under, 1, 0, 0));
        placeBelowTrunkBlock(context, offset(under, 0, 0, 1));
        placeBelowTrunkBlock(context, offset(under, 1, 0, 1));

        const leanDirection = randomHorizontal(context.random);
        const leanHeight = treeHeight - context.random.nextIntBounded(4);
        let leanSteps = 2 - context.random.nextIntBounded(3);
        let tx = origin.x;
        let tz = origin.z;
        const topY = origin.y + treeHeight - 1;

        for (let dy = 0; dy < treeHeight; dy++) {
            if (dy >= leanHeight && leanSteps > 0) {
                tx += DIRECTION_STEPS[leanDirection][0];
                tz += DIRECTION_STEPS[leanDirection][2];
                leanSteps--;
            }
            const position = { x: tx, y: origin.y + dy, z: tz };
            if (!isAirOrLeaves(context.world, position)) continue;
            placeLog(context, position);
            placeLog(context, offset(position, 1, 0, 0));
            placeLog(context, offset(position, 0, 0, 1));
            placeLog(context, offset(position, 1, 0, 1));
        }
        attachments.push(attachment({ x: tx, y: topY, z: tz }, 0, true));

        for (let ox = -1; ox <= 2; ox++) {
            for (let oz = -1; oz <= 2; oz++) {
                const outsideTrunk = ox < 0 || ox > 1 || oz < 0 || oz > 1;
                if (!outsideTrunk || context.random.nextIntBounded(3) > 0) continue;
                const length = context.random.nextIntBounded(3) + 2;
                for (let branchY = 0; branchY < length; branchY++) {
                    placeLog(context, { x: origin.x + ox, y: topY - branchY - 1, z: origin.z + oz });
                }
                attachments.push(attachment({ x: origin.x + ox, y: topY, z: origin.z + oz }, 0, false));
            }
        }
        return attachments;
    });

const bendingTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    minHeightForLeaves: number,
    bendLength: IntProvider
): TrunkPlacer =>
    trunkBase('bending_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const direction = randomHorizontal(context.random);
        const logHeight = treeHeight - 1;
        let position = origin;
        placeBelowTrunkBlock(context, below(position));
        const attachments: FoliageAttachment[] = [];

        for (let step = 0; step <= logHeight; step++) {
            if (step + 1 >= logHeight + context.random.nextIntBounded(2)) position = relative(position, direction);
            if (validTreePos(context.world, position)) placeLog(context, position);
            if (step >= minHeightForLeaves) attachments.push(attachment(position, 0, false));
            position = above(position);
        }

        const bend = bendLength.sample(context.random);
        for (let step = 0; step <= bend; step++) {
            if (validTreePos(context.world, position)) placeLog(context, position);
            attachments.push(attachment(position, 0, false));
            position = relative(position, direction);
        }
        return attachments;
    });

const poplarTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    trunkHeightAboveBranches: IntProvider,
    branchAmount: IntProvider
): TrunkPlacer =>
    trunkBase('poplar_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        const trunkToBranches = treeHeight - trunkHeightAboveBranches.sample(context.random);

        for (let y = 0; y < treeHeight; y++) {
            placeLog(context, above(origin, y));
            // Java shuffles all six directions and then drops the vertical pair, so the draws
            // happen whether or not a branch is placed at this height.
            const directions = shuffledCopy(ALL_DIRECTIONS, context.random).filter(
                (direction) => direction !== 'up' && direction !== 'down'
            );
            if (trunkToBranches - 1 !== y) continue;
            const branches = branchAmount.sample(context.random);
            for (let branch = 0; branch < branches; branch++) {
                const direction = directions[branch];
                if (direction === undefined) continue;
                placeLog(context, relative(above(origin, y), direction), sidewaysAxis(direction));
            }
        }
        return [attachment(above(origin, trunkToBranches), 0, false)];
    });

const upwardsBranchingTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    extraBranchSteps: IntProvider,
    placeBranchPerLogProbability: number,
    extraBranchLength: IntProvider,
    canGrowThrough: BlockSet
): TrunkPlacer =>
    trunkBase(
        'upwards_branching_trunk_placer',
        base,
        randA,
        randB,
        (context, treeHeight, origin) => {
            const attachments: FoliageAttachment[] = [];
            for (let step = 0; step < treeHeight; step++) {
                const currentY = origin.y + step;
                const placed = placeLog(context, { x: origin.x, y: currentY, z: origin.z });
                if (placed && step < treeHeight - 1 && context.random.nextFloat() < placeBranchPerLogProbability) {
                    const branchDirection = randomHorizontal(context.random);
                    const branchLength = extraBranchLength.sample(context.random);
                    const branchStart = Math.max(0, branchLength - extraBranchLength.sample(context.random) - 1);
                    const branchSteps = extraBranchSteps.sample(context.random);
                    placeBranch(
                        context,
                        treeHeight,
                        attachments,
                        origin,
                        currentY,
                        branchDirection,
                        branchStart,
                        branchSteps
                    );
                }
                if (step === treeHeight - 1) {
                    attachments.push(attachment({ x: origin.x, y: currentY + 1, z: origin.z }, 0, false));
                }
            }
            return attachments;
        },
        canGrowThrough
    );

const placeBranch = (
    context: TreeContext,
    treeHeight: number,
    attachments: FoliageAttachment[],
    origin: BlockPos,
    currentHeight: number,
    branchDirection: Direction,
    branchStart: number,
    branchSteps: number
): void => {
    let heightAlongBranch = currentHeight + branchStart;
    let logX = origin.x;
    let logZ = origin.z;
    let index = branchStart;
    let remaining = branchSteps;

    while (index < treeHeight && remaining > 0) {
        if (index >= 1) {
            const placementHeight = currentHeight + index;
            logX += DIRECTION_STEPS[branchDirection][0];
            logZ += DIRECTION_STEPS[branchDirection][2];
            heightAlongBranch = placementHeight;
            if (placeLog(context, { x: logX, y: placementHeight, z: logZ })) heightAlongBranch = placementHeight + 1;
            attachments.push(attachment({ x: logX, y: placementHeight, z: logZ }, 0, false));
        }
        index++;
        remaining--;
    }

    if (heightAlongBranch - currentHeight > 1) {
        const foliagePos = { x: logX, y: heightAlongBranch, z: logZ };
        attachments.push(attachment(foliagePos, 0, false));
        attachments.push(attachment(below(foliagePos, 2), 0, false));
    }
};

const cherryTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    branchCount: IntProvider,
    branchHorizontalLength: IntProvider,
    branchStartMin: number,
    branchStartMax: number,
    branchEndOffsetFromTop: IntProvider
): TrunkPlacer =>
    trunkBase('cherry_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const { random } = context;
        placeBelowTrunkBlock(context, below(origin));
        const firstBranch = Math.max(
            0,
            treeHeight - 1 + randomBetweenInclusive(random, branchStartMin, branchStartMax)
        );
        let secondBranch = Math.max(
            0,
            treeHeight - 1 + randomBetweenInclusive(random, branchStartMin, branchStartMax - 1)
        );
        if (secondBranch >= firstBranch) secondBranch++;

        const branches = branchCount.sample(random);
        const hasMiddleBranch = branches === 3;
        const hasBothSides = branches >= 2;
        const trunkHeight = hasMiddleBranch
            ? treeHeight
            : hasBothSides
              ? Math.max(firstBranch, secondBranch) + 1
              : firstBranch + 1;

        for (let y = 0; y < trunkHeight; y++) placeLog(context, above(origin, y));

        const attachments: FoliageAttachment[] = [];
        if (hasMiddleBranch) attachments.push(attachment(above(origin, trunkHeight), 0, false));

        const treeDirection = randomHorizontal(random);
        const modifier = sidewaysAxis(treeDirection);
        attachments.push(
            generateCherryBranch(
                context,
                treeHeight,
                origin,
                modifier,
                treeDirection,
                firstBranch,
                firstBranch < trunkHeight - 1,
                branchHorizontalLength,
                branchEndOffsetFromTop
            )
        );
        if (hasBothSides) {
            attachments.push(
                generateCherryBranch(
                    context,
                    treeHeight,
                    origin,
                    sidewaysAxis(oppositeDirection(treeDirection)),
                    oppositeDirection(treeDirection),
                    secondBranch,
                    secondBranch < trunkHeight - 1,
                    branchHorizontalLength,
                    branchEndOffsetFromTop
                )
            );
        }
        return attachments;
    });

const generateCherryBranch = (
    context: TreeContext,
    treeHeight: number,
    origin: BlockPos,
    modifier: (state: BlockState) => BlockState,
    branchDirection: Direction,
    offsetFromOrigin: number,
    middleContinuesUpwards: boolean,
    branchHorizontalLength: IntProvider,
    branchEndOffsetFromTop: IntProvider
): FoliageAttachment => {
    const { random } = context;
    let logPos = above(origin, offsetFromOrigin);
    const branchEndOffset = treeHeight - 1 + branchEndOffsetFromTop.sample(random);
    const extendAway = middleContinuesUpwards || branchEndOffset < offsetFromOrigin;
    const distance = branchHorizontalLength.sample(random) + (extendAway ? 1 : 0);
    const branchEnd = above(relative(origin, branchDirection, distance), branchEndOffset);
    const horizontalSteps = extendAway ? 2 : 1;

    for (let step = 0; step < horizontalSteps; step++) {
        logPos = relative(logPos, branchDirection);
        placeLog(context, logPos, modifier);
    }

    const verticalDirection: Direction = branchEnd.y > logPos.y ? 'up' : 'down';
    for (;;) {
        const remaining =
            Math.abs(logPos.x - branchEnd.x) + Math.abs(logPos.y - branchEnd.y) + Math.abs(logPos.z - branchEnd.z);
        if (remaining === 0) return attachment(above(branchEnd), 0, false);
        const chance = Math.abs(branchEnd.y - logPos.y) / remaining;
        const growVertically = random.nextFloat() < chance;
        logPos = relative(logPos, growVertically ? verticalDirection : branchDirection);
        placeLog(context, logPos, growVertically ? (state) => state : modifier);
    }
};

const fancyTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('fancy_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const { random } = context;
        const height = treeHeight + 2;
        const trunkHeight = Math.floor(height * 0.618);
        placeBelowTrunkBlock(context, below(origin));
        // Java's `Math.min(1, ...)` here reads as a bug for `max`, and it means exactly one
        // cluster per layer at every tree size. Reproduced because the shape depends on it.
        const clustersPerY = Math.min(1, Math.floor(1.382 + (height / 13) ** 2));
        const trunkTop = origin.y + trunkHeight;

        const coords: { attachment: FoliageAttachment; branchBase: number }[] = [
            { attachment: attachment(above(origin, height - 5), 0, false), branchBase: trunkTop }
        ];

        for (let relativeY = height - 5; relativeY >= 0; relativeY--) {
            const shape = fancyTreeShape(height, relativeY);
            if (shape < 0) continue;
            for (let cluster = 0; cluster < clustersPerY; cluster++) {
                const radius = shape * (random.nextFloat() + 0.328);
                const angle = random.nextFloat() * 2 * Math.PI;
                const dx = radius * Math.sin(angle) + 0.5;
                const dz = radius * Math.cos(angle) + 0.5;
                const checkStart = offset(origin, Math.floor(dx), relativeY - 1, Math.floor(dz));
                const checkEnd = above(checkStart, 5);
                if (!makeLimb(context, checkStart, checkEnd, false)) continue;

                const deltaX = origin.x - checkStart.x;
                const deltaZ = origin.z - checkStart.z;
                const branchHeight = checkStart.y - Math.sqrt(deltaX * deltaX + deltaZ * deltaZ) * 0.381;
                const branchTop = branchHeight > trunkTop ? trunkTop : Math.trunc(branchHeight);
                const branchBase = { x: origin.x, y: branchTop, z: origin.z };
                if (makeLimb(context, branchBase, checkStart, false)) {
                    coords.push({ attachment: attachment(checkStart, 0, false), branchBase: branchTop });
                }
            }
        }

        makeLimb(context, origin, above(origin, trunkHeight), true);
        for (const coord of coords) {
            const base = { x: origin.x, y: coord.branchBase, z: origin.z };
            const samePlace =
                base.x === coord.attachment.pos.x &&
                base.y === coord.attachment.pos.y &&
                base.z === coord.attachment.pos.z;
            if (!samePlace && coord.branchBase - origin.y >= height * 0.2) {
                makeLimb(context, base, coord.attachment.pos, true);
            }
        }

        return coords.filter((coord) => coord.branchBase - origin.y >= height * 0.2).map((coord) => coord.attachment);
    });

const fancyTreeShape = (height: number, y: number): number => {
    if (y < f32(height * 0.3)) return -1;
    const radius = f32(height / 2);
    const adjacent = f32(radius - y);
    let distance = f32(Math.sqrt(f32(radius * radius - adjacent * adjacent)));
    if (adjacent === 0) distance = radius;
    else if (Math.abs(adjacent) >= radius) return 0;
    return f32(distance * 0.5);
};

const makeLimb = (context: TreeContext, startPos: BlockPos, endPos: BlockPos, doPlace: boolean): boolean => {
    if (!doPlace && startPos.x === endPos.x && startPos.y === endPos.y && startPos.z === endPos.z) return true;
    const delta = { x: endPos.x - startPos.x, y: endPos.y - startPos.y, z: endPos.z - startPos.z };
    const steps = Math.max(Math.abs(delta.x), Math.max(Math.abs(delta.y), Math.abs(delta.z)));
    if (steps === 0) {
        if (doPlace) placeLog(context, startPos, logAxis(startPos, startPos));
        return true;
    }
    const stepX = f32(delta.x / steps);
    const stepY = f32(delta.y / steps);
    const stepZ = f32(delta.z / steps);

    for (let step = 0; step <= steps; step++) {
        const position = offset(
            startPos,
            Math.floor(f32(0.5 + step * stepX)),
            Math.floor(f32(0.5 + step * stepY)),
            Math.floor(f32(0.5 + step * stepZ))
        );
        if (doPlace) placeLog(context, position, logAxis(startPos, position));
        else if (!context.config.trunkPlacer.isFree(context.world, position)) return false;
    }
    return true;
};

const logAxis = (startPos: BlockPos, position: BlockPos): ((state: BlockState) => BlockState) => {
    const dx = Math.abs(position.x - startPos.x);
    const dz = Math.abs(position.z - startPos.z);
    const maximum = Math.max(dx, dz);
    const axis = maximum > 0 ? (dx === maximum ? 'x' : 'z') : 'y';
    return (state) => ('axis' in state.properties ? withProperty(state, 'axis', axis) : state);
};

// --- Foliage placers -----------------------------------------------------------------------

const tryPlaceLeaf = (context: TreeContext, position: BlockPos): boolean => {
    const existing = context.world.getBlock(position);
    if (existing.properties['persistent'] === 'true') return false;
    if (!validTreePos(context.world, position)) return false;
    const state = context.config.foliageProvider.getState(context.world, context.random, position);
    context.setFoliage(position, waterlogged(context.world, position, state));
    return true;
};

type SkipTest = (
    random: RandomSource,
    dx: number,
    y: number,
    dz: number,
    currentRadius: number,
    doubleTrunk: boolean
) => boolean;

const placeLeavesRow = (
    context: TreeContext,
    origin: BlockPos,
    currentRadius: number,
    y: number,
    doubleTrunk: boolean,
    shouldSkip: SkipTest
): void => {
    const extra = doubleTrunk ? 1 : 0;
    for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
        for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
            const minDx = doubleTrunk ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
            const minDz = doubleTrunk ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
            if (shouldSkip(context.random, minDx, y, minDz, currentRadius, doubleTrunk)) continue;
            tryPlaceLeaf(context, offset(origin, dx, y, dz));
        }
    }
};

const foliageBase = (
    type: string,
    radius: IntProvider,
    offsetProvider: IntProvider,
    heightOf: (random: RandomSource, treeHeight: number) => number,
    create: (
        context: TreeContext,
        treeHeight: number,
        entry: FoliageAttachment,
        foliageHeight: number,
        leafRadius: number,
        placerOffset: number
    ) => void,
    radiusOf?: (random: RandomSource, trunkHeight: number) => number
): FoliagePlacer => ({
    type,
    foliageHeight: heightOf,
    foliageRadius: radiusOf ?? ((random) => radius.sample(random)),
    create: (context, treeHeight, entry, foliageHeight, leafRadius) => {
        create(context, treeHeight, entry, foliageHeight, leafRadius, offsetProvider.sample(context.random));
    }
});

const blobSkip: SkipTest = (random, dx, y, dz, currentRadius) =>
    dx === currentRadius && dz === currentRadius && (random.nextIntBounded(2) === 0 || y === 0);

const blobFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'blob_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                const currentRadius = Math.max(leafRadius + entry.radiusOffsetXZ - 1 - Math.trunc(yo / 2), 0);
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), blobSkip);
            }
        }
    );

const bushFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'bush_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const total = foliageHeight + entry.foliageHeightOffset;
            const skip: SkipTest = (random, dx, _y, dz, currentRadius) =>
                dx === currentRadius && dz === currentRadius && random.nextIntBounded(2) === 0;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                placeLeavesRow(
                    context,
                    entry.pos,
                    leafRadius + entry.radiusOffsetXZ - 1 - yo,
                    yo,
                    isDoubleTrunk(entry),
                    skip
                );
            }
        }
    );

const fancyFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'fancy_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                f32(dx + 0.5) ** 2 + f32(dz + 0.5) ** 2 > currentRadius * currentRadius;
            for (let yo = placerOffset; yo >= placerOffset - foliageHeight; yo--) {
                const currentRadius = leafRadius + (yo !== placerOffset && yo !== placerOffset - foliageHeight ? 1 : 0);
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), skip);
            }
        }
    );

const edgeSkip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
    dx === currentRadius && dz === currentRadius && currentRadius > 0;

const spruceFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    trunkHeight: IntProvider
): FoliagePlacer =>
    foliageBase(
        'spruce_foliage_placer',
        radius,
        offsetProvider,
        (random, treeHeight) => Math.max(4, treeHeight - trunkHeight.sample(random)),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            let currentRadius = context.random.nextIntBounded(2);
            let maxRadius = 1;
            let minRadius = 0;
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= -total; yo--) {
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), edgeSkip);
                if (currentRadius >= maxRadius) {
                    currentRadius = minRadius;
                    minRadius = 1;
                    maxRadius = Math.min(maxRadius + 1, leafRadius + entry.radiusOffsetXZ);
                } else {
                    currentRadius++;
                }
            }
        }
    );

const pineFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: IntProvider): FoliagePlacer =>
    foliageBase(
        'pine_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            let currentRadius = 0;
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), edgeSkip);
                if (currentRadius >= 1 && yo === placerOffset - total + 1) currentRadius--;
                else if (currentRadius < leafRadius + entry.radiusOffsetXZ) currentRadius++;
            }
        },
        (random, trunkHeight) => radius.sample(random) + random.nextIntBounded(Math.max(trunkHeight + 1, 1))
    );

const acaciaFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider): FoliagePlacer =>
    foliageBase(
        'acacia_foliage_placer',
        radius,
        offsetProvider,
        () => 0,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, y, dz, currentRadius) =>
                y === 0
                    ? (dx > 1 || dz > 1) && dx !== 0 && dz !== 0
                    : dx === currentRadius && dz === currentRadius && currentRadius > 0;
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const total = foliageHeight + entry.foliageHeightOffset;
            placeLeavesRow(context, foliagePos, leafRadius + entry.radiusOffsetXZ, -1 - total, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, leafRadius - 1, -total, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, leafRadius + entry.radiusOffsetXZ - 1, 0, doubleTrunk, skip);
        }
    );

const darkOakFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider): FoliagePlacer =>
    foliageBase(
        'dark_oak_foliage_placer',
        radius,
        offsetProvider,
        () => 4,
        (context, _treeHeight, entry, _foliageHeight, leafRadius, placerOffset) => {
            const doubleTrunk = isDoubleTrunk(entry);
            const pos = above(entry.pos, placerOffset);
            const skip: SkipTest = (_random, dx, y, dz, currentRadius, isDouble) => {
                if (y === -1 && !isDouble) return dx === currentRadius && dz === currentRadius;
                return y === 1 ? dx + dz > currentRadius * 2 - 2 : false;
            };
            const rowWithCorners = (currentRadius: number, y: number): void => {
                const extra = doubleTrunk ? 1 : 0;
                for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
                    for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
                        // Dark oak drops the four outer corners of its widest row.
                        const cutCorner =
                            y === 0 &&
                            doubleTrunk &&
                            (dx === -currentRadius || dx >= currentRadius) &&
                            (dz === -currentRadius || dz >= currentRadius);
                        if (cutCorner) continue;
                        const minDx = doubleTrunk ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
                        const minDz = doubleTrunk ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
                        if (skip(context.random, minDx, y, minDz, currentRadius, doubleTrunk)) continue;
                        tryPlaceLeaf(context, offset(pos, dx, y, dz));
                    }
                }
            };

            if (doubleTrunk) {
                rowWithCorners(leafRadius + 2, -1);
                rowWithCorners(leafRadius + 3, 0);
                rowWithCorners(leafRadius + 2, 1);
                if (context.random.nextBoolean()) rowWithCorners(leafRadius, 2);
            } else {
                rowWithCorners(leafRadius + 2, -1);
                rowWithCorners(leafRadius + 1, 0);
            }
        }
    );

const megaJungleFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'jungle_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                dx + dz >= 7 ? true : dx * dx + dz * dz > currentRadius * currentRadius;
            const doubleTrunk = isDoubleTrunk(entry);
            const leafHeight =
                (doubleTrunk ? foliageHeight : 1 + context.random.nextIntBounded(2)) + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - leafHeight; yo--) {
                placeLeavesRow(context, entry.pos, leafRadius + entry.radiusOffsetXZ + 1 - yo, yo, doubleTrunk, skip);
            }
        }
    );

const megaPineFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    crownHeight: IntProvider
): FoliagePlacer =>
    foliageBase(
        'mega_pine_foliage_placer',
        radius,
        offsetProvider,
        (random) => crownHeight.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                dx + dz >= 7 ? true : dx * dx + dz * dz > currentRadius * currentRadius;
            const doubleTrunk = isDoubleTrunk(entry);
            const total = foliageHeight + entry.foliageHeightOffset;
            let previousRadius = 0;
            for (let y = entry.pos.y - total + placerOffset; y <= entry.pos.y + placerOffset; y++) {
                const yo = entry.pos.y - y;
                const smoothRadius = leafRadius + entry.radiusOffsetXZ + Math.floor(f32((yo / total) * 3.5));
                const jaggedRadius =
                    yo > 0 && smoothRadius === previousRadius && (y & 1) === 0 ? smoothRadius + 1 : smoothRadius;
                placeLeavesRow(context, { x: entry.pos.x, y, z: entry.pos.z }, jaggedRadius, 0, doubleTrunk, skip);
                previousRadius = smoothRadius;
            }
        }
    );

const cherryFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: IntProvider,
    wideBottomLayerHoleChance: number,
    cornerHoleChance: number,
    hangingLeavesChance: number,
    hangingLeavesExtensionChance: number
): FoliagePlacer =>
    foliageBase(
        'cherry_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (random, dx, y, dz, currentRadius) => {
                if (
                    y === -1 &&
                    (dx === currentRadius || dz === currentRadius) &&
                    random.nextFloat() < wideBottomLayerHoleChance
                ) {
                    return true;
                }
                const corner = dx === currentRadius && dz === currentRadius;
                return currentRadius > 2
                    ? corner || (dx + dz > currentRadius * 2 - 2 && random.nextFloat() < cornerHoleChance)
                    : corner && random.nextFloat() < cornerHoleChance;
            };
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const currentRadius = leafRadius + entry.radiusOffsetXZ - 1;
            const total = foliageHeight + entry.foliageHeightOffset;

            placeLeavesRow(context, foliagePos, currentRadius - 2, total - 3, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, currentRadius - 1, total - 4, doubleTrunk, skip);
            for (let y = total - 5; y >= 0; y--)
                placeLeavesRow(context, foliagePos, currentRadius, y, doubleTrunk, skip);
            placeHangingRow(
                context,
                foliagePos,
                currentRadius,
                -1,
                doubleTrunk,
                skip,
                hangingLeavesChance,
                hangingLeavesExtensionChance
            );
            placeHangingRow(
                context,
                foliagePos,
                currentRadius - 1,
                -2,
                doubleTrunk,
                skip,
                hangingLeavesChance,
                hangingLeavesExtensionChance
            );
        }
    );

const CLOCKWISE: Readonly<Record<Direction, Direction>> = {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north',
    up: 'up',
    down: 'down'
};

const placeHangingRow = (
    context: TreeContext,
    origin: BlockPos,
    currentRadius: number,
    y: number,
    doubleTrunk: boolean,
    shouldSkip: SkipTest,
    hangingLeavesChance: number,
    hangingLeavesExtensionChance: number
): void => {
    placeLeavesRow(context, origin, currentRadius, y, doubleTrunk, shouldSkip);
    const extra = doubleTrunk ? 1 : 0;
    const logPos = below(origin);

    for (const alongEdge of HORIZONTAL_DIRECTIONS) {
        const toEdge = CLOCKWISE[alongEdge];
        const positive = toEdge === 'south' || toEdge === 'east' || toEdge === 'up';
        const offsetToEdge = positive ? currentRadius + extra : currentRadius;
        let position = relative(relative(offset(origin, 0, y, 0), toEdge, offsetToEdge), alongEdge, -currentRadius);

        for (let step = -currentRadius; step < currentRadius + extra; step++) {
            const leavesAbove = context.hasFoliage(above(position));
            if (leavesAbove && tryPlaceExtension(context, hangingLeavesChance, logPos, below(position))) {
                tryPlaceExtension(context, hangingLeavesExtensionChance, logPos, below(position, 2));
            }
            position = relative(position, alongEdge);
        }
    }
};

const tryPlaceExtension = (context: TreeContext, chance: number, logPos: BlockPos, position: BlockPos): boolean => {
    const distance =
        Math.abs(position.x - logPos.x) + Math.abs(position.y - logPos.y) + Math.abs(position.z - logPos.z);
    if (distance >= 7) return false;
    if (context.random.nextFloat() > chance) return false;
    return tryPlaceLeaf(context, position);
};

const randomSpreadFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    foliageHeightProvider: IntProvider,
    leafPlacementAttempts: number
): FoliagePlacer =>
    foliageBase(
        'random_spread_foliage_placer',
        radius,
        offsetProvider,
        (random) => foliageHeightProvider.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius) => {
            for (let attempt = 0; attempt < leafPlacementAttempts; attempt++) {
                const position = offset(
                    entry.pos,
                    context.random.nextIntBounded(leafRadius) - context.random.nextIntBounded(leafRadius),
                    context.random.nextIntBounded(foliageHeight) - context.random.nextIntBounded(foliageHeight),
                    context.random.nextIntBounded(leafRadius) - context.random.nextIntBounded(leafRadius)
                );
                tryPlaceLeaf(context, position);
            }
        }
    );

/**
 * The poplar crown, which is a rhombus with a log spine rather than a blob.
 *
 * Java threads the foliage height and a flip flag through its own row placer rather than the
 * shared one, because the shape of a row depends on where it sits in the crown.
 */
const poplarFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: IntProvider,
    sideHoleChance: number
): FoliagePlacer =>
    foliageBase(
        'poplar_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const currentRadius = leafRadius + entry.radiusOffsetXZ - 1;
            const flip = context.random.nextBoolean();
            const total = foliageHeight + entry.foliageHeightOffset;

            const partialRow = (y: number) => total - 1 === y || total - 2 === y;
            const cornersToCut = (dx: number, dz: number, rowRadius: number, partial: boolean) => {
                const small = flip
                    ? (dx > 0 && dz > 0) || (dz < 0 && dx < 0)
                    : (dx > 0 && dz < 0) || (dz > 0 && dx < 0);
                return small ? rowRadius - 1 : partial ? rowRadius + 1 : rowRadius;
            };
            const withinRhombus = (rowRadius: number, absDx: number, absDz: number, cut: number, extra: number) =>
                absDx + absDz <= rowRadius * 2 - (cut + extra);

            const row = (rowRadius: number, y: number) => {
                const extra = doubleTrunk ? 1 : 0;
                for (let dx = -rowRadius; dx <= rowRadius + extra; dx++) {
                    for (let dz = -rowRadius; dz <= rowRadius + extra; dz++) {
                        const partial = partialRow(y);
                        const cut = cornersToCut(dx, dz, rowRadius, partial);
                        const absDx = Math.abs(dx);
                        const absDz = Math.abs(dz);
                        const onEdge = absDx === rowRadius || absDz === rowRadius;
                        if (partial && onEdge) continue;
                        const extraRemoval = context.random.nextFloat() <= sideHoleChance ? 1 : 0;
                        if (!withinRhombus(rowRadius, absDx, absDz, cut, extraRemoval)) continue;
                        tryPlaceLeaf(context, offset(foliagePos, dx, y, dz));
                    }
                }
            };

            row(currentRadius - 2, total - 1);
            row(currentRadius - 1, total - 2);
            row(currentRadius - 1, total - 3);
            for (let y = total - 4; y >= 1; y--) row(currentRadius, y);

            // The spine: four log arms replacing leaves along the rhombus axes.
            const spineY = total - 4;
            const extra = doubleTrunk ? 1 : 0;
            for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
                for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
                    const absDx = Math.abs(dx);
                    const absDz = Math.abs(dz);
                    const cut = cornersToCut(dx, dz, currentRadius, partialRow(spineY));
                    const alongAxis =
                        (absDz === 0 && currentRadius - absDx >= 4) || (absDx === 0 && currentRadius - absDz >= 4);
                    if (!withinRhombus(currentRadius, absDx, absDz, cut, 2) || !alongAxis) continue;
                    const position = offset(foliagePos, dx, spineY, dz);
                    const expected = context.config.foliageProvider.getState(context.world, context.random, position);
                    if (context.world.getBlock(position).name !== expected.name) continue;
                    const axis = absDz === 0 ? 'x' : 'z';
                    const log = context.config.trunkProvider.getState(context.world, context.random, position);
                    context.setFoliage(position, 'axis' in log.properties ? withProperty(log, 'axis', axis) : log);
                }
            }

            row(currentRadius - 1, 0);
            row(Math.min(Math.max(currentRadius - 2, 1), 2), -1);
        }
    );

// --- Root placer ---------------------------------------------------------------------------

const mangroveRootPlacer = (
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

// --- Tree decorators -----------------------------------------------------------------------

const lowestTrunkOrRoot = (context: DecoratorContext): BlockPos[] => {
    if (context.roots.length === 0) return [...context.logs];
    if (context.logs.length > 0 && context.roots[0]?.y === context.logs[0]?.y) {
        return [...context.logs, ...context.roots];
    }
    return [...context.roots];
};

const alterGroundDecorator = (provider: BlockStateProvider): TreeDecorator => ({
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

const attachedToLeavesDecorator = (
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

const attachedToLogsDecorator = (
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

const beehiveDecorator = (probability: number): TreeDecorator => ({
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

const cocoaDecorator = (probability: number): TreeDecorator => ({
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

const creakingHeartDecorator = (probability: number): TreeDecorator => ({
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

const leaveVineDecorator = (probability: number): TreeDecorator => ({
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

const trunkVineDecorator = (): TreeDecorator => ({
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

const paleMossDecorator = (
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

const placeOnGroundDecorator = (
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

const shelfMushroomDecorator = (probability: number): TreeDecorator => ({
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

// --- Parsing -------------------------------------------------------------------------------

const parseFeatureSize = (source: unknown, path: string): FeatureSize => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const minClipped = raw['min_clipped_height'];
    const minClippedHeight = minClipped === undefined ? undefined : asInteger(minClipped, `${path}.min_clipped_height`);
    if (type === 'two_layers_feature_size') {
        const limit = asInteger(raw['limit'], `${path}.limit`, 1);
        const lowerSize = asInteger(raw['lower_size'], `${path}.lower_size`, 0);
        const upperSize = asInteger(raw['upper_size'], `${path}.upper_size`, 1);
        return {
            type: 'two_layers_feature_size',
            ...(minClippedHeight === undefined ? {} : { minClippedHeight }),
            sizeAtHeight: (_treeHeight, y) => (y < limit ? lowerSize : upperSize)
        };
    }
    if (type === 'three_layers_feature_size') {
        const limit = asInteger(raw['limit'], `${path}.limit`, 1);
        const upperLimit = asInteger(raw['upper_limit'], `${path}.upper_limit`, 1);
        const lowerSize = asInteger(raw['lower_size'], `${path}.lower_size`, 0);
        const middleSize = asInteger(raw['middle_size'], `${path}.middle_size`, 1);
        const upperSize = asInteger(raw['upper_size'], `${path}.upper_size`, 1);
        return {
            type: 'three_layers_feature_size',
            ...(minClippedHeight === undefined ? {} : { minClippedHeight }),
            sizeAtHeight: (treeHeight, y) =>
                y < limit ? lowerSize : y >= treeHeight - upperLimit ? upperSize : middleSize
        };
    }
    return fail(path, `unknown feature size type ${JSON.stringify(type)}`);
};

const parseTrunkPlacer = (source: unknown, path: string): TrunkPlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const base = asInteger(raw['base_height'], `${path}.base_height`);
    const randA = asInteger(raw['height_rand_a'], `${path}.height_rand_a`);
    const randB = asInteger(raw['height_rand_b'], `${path}.height_rand_b`);
    switch (type) {
        case 'straight_trunk_placer':
            return straightTrunkPlacer(base, randA, randB);
        case 'forking_trunk_placer':
            return forkingTrunkPlacer(base, randA, randB);
        case 'giant_trunk_placer':
            return giantTrunkPlacer(base, randA, randB);
        case 'mega_jungle_trunk_placer':
            return megaJungleTrunkPlacer(base, randA, randB);
        case 'dark_oak_trunk_placer':
            return darkOakTrunkPlacer(base, randA, randB);
        case 'fancy_trunk_placer':
            return fancyTrunkPlacer(base, randA, randB);
        case 'bending_trunk_placer':
            return bendingTrunkPlacer(
                base,
                randA,
                randB,
                asInteger(raw['min_height_for_leaves'], `${path}.min_height_for_leaves`, 1),
                parseIntProvider(raw['bend_length'], `${path}.bend_length`)
            );
        case 'poplar_trunk_placer':
            return poplarTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['trunk_height_above_branches'], `${path}.trunk_height_above_branches`),
                parseIntProvider(raw['branch_amount'], `${path}.branch_amount`)
            );
        case 'upwards_branching_trunk_placer':
            return upwardsBranchingTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['extra_branch_steps'], `${path}.extra_branch_steps`),
                asNumber(raw['place_branch_per_log_probability'], `${path}.place_branch_per_log_probability`),
                parseIntProvider(raw['extra_branch_length'], `${path}.extra_branch_length`),
                parseBlockSet(raw['can_grow_through'], `${path}.can_grow_through`)
            );
        case 'cherry_trunk_placer': {
            const start = asObject(raw['branch_start_offset_from_top'], `${path}.branch_start_offset_from_top`);
            return cherryTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['branch_count'], `${path}.branch_count`),
                parseIntProvider(raw['branch_horizontal_length'], `${path}.branch_horizontal_length`),
                asInteger(start['min_inclusive'], `${path}.branch_start_offset_from_top.min_inclusive`),
                asInteger(start['max_inclusive'], `${path}.branch_start_offset_from_top.max_inclusive`),
                parseIntProvider(raw['branch_end_offset_from_top'], `${path}.branch_end_offset_from_top`)
            );
        }
        default:
            return fail(path, `unknown trunk placer type ${JSON.stringify(type)}`);
    }
};

const parseFoliagePlacer = (source: unknown, path: string): FoliagePlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const radius = parseIntProvider(raw['radius'], `${path}.radius`);
    const placerOffset = parseIntProvider(raw['offset'], `${path}.offset`);
    switch (type) {
        case 'blob_foliage_placer':
            return blobFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'bush_foliage_placer':
            return bushFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'fancy_foliage_placer':
            return fancyFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'spruce_foliage_placer':
            return spruceFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['trunk_height'], `${path}.trunk_height`)
            );
        case 'pine_foliage_placer':
            return pineFoliagePlacer(radius, placerOffset, parseIntProvider(raw['height'], `${path}.height`));
        case 'acacia_foliage_placer':
            return acaciaFoliagePlacer(radius, placerOffset);
        case 'dark_oak_foliage_placer':
            return darkOakFoliagePlacer(radius, placerOffset);
        case 'jungle_foliage_placer':
            return megaJungleFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'mega_pine_foliage_placer':
            return megaPineFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['crown_height'], `${path}.crown_height`)
            );
        case 'random_spread_foliage_placer':
            return randomSpreadFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['foliage_height'], `${path}.foliage_height`),
                asInteger(raw['leaf_placement_attempts'], `${path}.leaf_placement_attempts`)
            );
        case 'cherry_foliage_placer':
            return cherryFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['height'], `${path}.height`),
                asNumber(raw['wide_bottom_layer_hole_chance'], `${path}.wide_bottom_layer_hole_chance`),
                asNumber(raw['corner_hole_chance'], `${path}.corner_hole_chance`),
                asNumber(raw['hanging_leaves_chance'], `${path}.hanging_leaves_chance`),
                asNumber(raw['hanging_leaves_extension_chance'], `${path}.hanging_leaves_extension_chance`)
            );
        case 'poplar_foliage_placer':
            return poplarFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['height'], `${path}.height`),
                asNumber(raw['side_hole_chance'], `${path}.side_hole_chance`)
            );
        default:
            return fail(path, `unknown foliage placer type ${JSON.stringify(type)}`);
    }
};

const parseRootPlacer = (source: unknown, path: string, parsers: FeatureParsers): RootPlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    if (type !== 'mangrove_root_placer') return fail(path, `unknown root placer type ${JSON.stringify(type)}`);
    const aboveRoot = raw['above_root_placement'];
    const above = aboveRoot === undefined ? undefined : asObject(aboveRoot, `${path}.above_root_placement`);
    const mangrove = asObject(raw['mangrove_root_placement'], `${path}.mangrove_root_placement`);
    return mangroveRootPlacer(
        parseIntProvider(raw['trunk_offset_y'], `${path}.trunk_offset_y`),
        parsers.blockStateProvider(raw['root_provider'], `${path}.root_provider`),
        above === undefined
            ? undefined
            : parsers.blockStateProvider(
                  above['above_root_provider'],
                  `${path}.above_root_placement.above_root_provider`
              ),
        above === undefined
            ? 0
            : asNumber(
                  above['above_root_placement_chance'],
                  `${path}.above_root_placement.above_root_placement_chance`
              ),
        parseBlockSet(mangrove['can_grow_through'], `${path}.mangrove_root_placement.can_grow_through`),
        parseBlockSet(mangrove['muddy_roots_in'], `${path}.mangrove_root_placement.muddy_roots_in`),
        parsers.blockStateProvider(
            mangrove['muddy_roots_provider'],
            `${path}.mangrove_root_placement.muddy_roots_provider`
        ),
        asInteger(mangrove['max_root_width'], `${path}.mangrove_root_placement.max_root_width`),
        asInteger(mangrove['max_root_length'], `${path}.mangrove_root_placement.max_root_length`),
        asNumber(mangrove['random_skew_chance'], `${path}.mangrove_root_placement.random_skew_chance`)
    );
};

const parseDirections = (source: unknown, path: string): Direction[] =>
    asArray(source, path).map((entry, index) => parseDirection(entry, `${path}[${index}]`));

const parseTreeDecorator = (source: unknown, path: string, parsers: FeatureParsers): TreeDecorator => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'trunk_vine':
            return trunkVineDecorator();
        case 'leave_vine':
            return leaveVineDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'cocoa':
            return cocoaDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'beehive':
            return beehiveDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'creaking_heart':
            return creakingHeartDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'shelf_mushroom':
            return shelfMushroomDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'alter_ground':
            return alterGroundDecorator(parsers.blockStateProvider(raw['provider'], `${path}.provider`));
        case 'attached_to_leaves':
            return attachedToLeavesDecorator(
                asNumber(raw['probability'], `${path}.probability`),
                asInteger(raw['exclusion_radius_xz'], `${path}.exclusion_radius_xz`),
                asInteger(raw['exclusion_radius_y'], `${path}.exclusion_radius_y`),
                parsers.blockStateProvider(raw['block_provider'], `${path}.block_provider`),
                asInteger(raw['required_empty_blocks'], `${path}.required_empty_blocks`),
                parseDirections(raw['directions'], `${path}.directions`)
            );
        case 'attached_to_logs':
            return attachedToLogsDecorator(
                asNumber(raw['probability'], `${path}.probability`),
                parsers.blockStateProvider(raw['block_provider'], `${path}.block_provider`),
                parseDirections(raw['directions'], `${path}.directions`)
            );
        case 'pale_moss':
            return paleMossDecorator(
                asNumber(raw['leaves_probability'], `${path}.leaves_probability`),
                asNumber(raw['trunk_probability'], `${path}.trunk_probability`),
                asNumber(raw['ground_probability'], `${path}.ground_probability`)
            );
        case 'place_on_ground':
            return placeOnGroundDecorator(
                asInteger(raw['tries'], `${path}.tries`, 128),
                asInteger(raw['radius'], `${path}.radius`, 2),
                asInteger(raw['height'], `${path}.height`, 1),
                parsers.blockStateProvider(raw['block_state_provider'], `${path}.block_state_provider`)
            );
        default:
            return fail(path, `unknown tree decorator type ${JSON.stringify(type)}`);
    }
};

/** Reads a `minecraft:tree` configuration. */
export const parseTreeConfig = (raw: Record<string, unknown>, path: string, parsers: FeatureParsers): TreeConfig => {
    const rootPlacer = raw['root_placer'];
    return {
        trunkProvider: parsers.blockStateProvider(raw['trunk_provider'], `${path}.trunk_provider`),
        trunkPlacer: parseTrunkPlacer(raw['trunk_placer'], `${path}.trunk_placer`),
        foliageProvider: parsers.blockStateProvider(raw['foliage_provider'], `${path}.foliage_provider`),
        foliagePlacer: parseFoliagePlacer(raw['foliage_placer'], `${path}.foliage_placer`),
        ...(rootPlacer === undefined
            ? {}
            : { rootPlacer: parseRootPlacer(rootPlacer, `${path}.root_placer`, parsers) }),
        minimumSize: parseFeatureSize(raw['minimum_size'], `${path}.minimum_size`),
        decorators: asArray(raw['decorators'], `${path}.decorators`).map((entry, index) =>
            parseTreeDecorator(entry, `${path}.decorators[${index}]`, parsers)
        ),
        ignoreVines: raw['ignore_vines'] === true,
        belowTrunkProvider:
            raw['below_trunk_provider'] === undefined
                ? parsers.blockStateProvider({ id: 'minecraft:dirt' }, `${path}.below_trunk_provider`)
                : parsers.blockStateProvider(raw['below_trunk_provider'], `${path}.below_trunk_provider`)
    };
};

/** Reads the `tree` feature type. */
export const parseTreeFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => (type === 'tree' ? tree(parseTreeConfig(raw, path, parsers)) : undefined);

/** Exposed for the sibling `fallen_tree` feature, which reuses the trunk and decorator parsers. */
export const treeInternals = {
    parseTrunkPlacer,
    parseTreeDecorator,
    placeLog,
    validTreePos,
    constantInt
};
