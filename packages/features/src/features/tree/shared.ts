/** The tree feature's shared types, tags and block placement helpers. */

import type { RandomSource } from '@jsprismarine/worldgen';
import { randomElement } from '../../placement/WorldgenRandom';
import type { BlockStateProvider } from '../../providers/blockStateProvider';
import type { BlockState, Direction } from '../../world/BlockState';
import { HORIZONTAL_DIRECTIONS, withProperty } from '../../world/BlockState';
import type { BlockPos, FeatureWorld } from '../../world/FeatureWorld';

/** Rounds to single precision, where Java does its tree math in `float`. */
export const f32 = Math.fround;
const LEAVES_TAG = 'minecraft:leaves';
/** The block tag a trunk counts as. */
export const LOGS_TAG = 'minecraft:logs';
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

/** Builds a {@link FoliageAttachment}, Java's `FoliagePlacer.FoliageAttachment`. */
export const attachment = (
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

/** Whether an attachment sits on a two-by-two trunk. */
export const isDoubleTrunk = (entry: FoliageAttachment): boolean => entry.sizeX === 2 && entry.sizeZ === 2;

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

/** Whether a position holds air or leaves, Java's `TreeFeature.isAirOrLeaves`. */
export const isAirOrLeaves = (world: FeatureWorld, position: BlockPos): boolean => {
    const state = world.getBlock(position);
    return world.blocks.isAir(state) || world.blocks.hasTag(state, LEAVES_TAG);
};

/** Answers Java's `TreeFeature.validTreePos`: air, or a block trees are allowed to grow through. */
export const validTreePos = (world: FeatureWorld, position: BlockPos): boolean => {
    const state = world.getBlock(position);
    return world.blocks.isAir(state) || world.blocks.hasTag(state, REPLACEABLE_BY_TREES_TAG);
};

/** Whether a position holds a vine. */
export const isVine = (world: FeatureWorld, position: BlockPos): boolean =>
    world.getBlock(position).name === 'minecraft:vine';

/** Sets a state's `waterlogged` property from the fluid already at the position. */
export const waterlogged = (world: FeatureWorld, position: BlockPos, state: BlockState): BlockState =>
    'waterlogged' in state.properties
        ? withProperty(
              state,
              'waterlogged',
              world.blocks.fluid(world.getBlock(position)) === 'water' ? 'true' : 'false'
          )
        : state;

/** Places a trunk block from the trunk provider where the tree may grow; returns whether it did. */
export const placeLog = (
    context: TreeContext,
    position: BlockPos,
    modify: (state: BlockState) => BlockState = (state) => state
): boolean => {
    if (!validTreePos(context.world, position)) return false;
    context.setTrunk(position, modify(context.config.trunkProvider.getState(context.world, context.random, position)));
    return true;
};

/** Places the below-trunk provider's block, usually dirt, under the trunk. */
export const placeBelowTrunkBlock = (context: TreeContext, position: BlockPos): void => {
    const state = context.config.belowTrunkProvider.getOptionalState(context.world, context.random, position);
    if (state !== undefined) context.setTrunk(position, state);
};

/** Turns a log's `axis` to follow a branch growing in `direction`. */
export const sidewaysAxis = (direction: Direction): ((state: BlockState) => BlockState) => {
    const axis =
        direction === 'up' || direction === 'down' ? 'y' : direction === 'north' || direction === 'south' ? 'z' : 'x';
    return (state) => ('axis' in state.properties ? withProperty(state, 'axis', axis) : state);
};

/** Draws one of the four horizontal directions. */
export const randomHorizontal = (random: RandomSource): Direction => randomElement(HORIZONTAL_DIRECTIONS, random);

/** Each horizontal direction turned a quarter clockwise, Java's `Direction.getClockWise`. */
export const CLOCKWISE: Readonly<Record<Direction, Direction>> = {
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north',
    up: 'up',
    down: 'down'
};
