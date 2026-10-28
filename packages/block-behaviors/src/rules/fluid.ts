/**
 * Water and lava flow, including the slope search that sends a stream toward
 * the nearest drop instead of spreading evenly across a flat floor.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { bedrockLiquidReactionOf, isWashedAway } from '@jsprismarine/blocks';

import { HORIZONTAL_FACES, offset, opposite } from '../geometry';
import type { HorizontalFace } from '../geometry';
import {
    AIR,
    COBBLESTONE,
    FLOWING_LAVA,
    FLOWING_WATER,
    isAir,
    isLava,
    isLiquid,
    isLiquidSource,
    isWater,
    LAVA,
    OBSIDIAN,
    STONE,
    WATER
} from '../identifiers';
import { bareName, stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The largest horizontal `liquid_depth` the flowing blocks carry. */
export const MAX_LIQUID_DEPTH = 7;

/** The dimension whose lava uses the faster spread rate. */
export const NETHER = 'minecraft:nether';

/** Game ticks between water spread steps. */
export const WATER_SPREAD_TICKS = 5;

/** Game ticks between lava spread steps outside the nether. */
export const LAVA_SPREAD_TICKS = 30;

/** Game ticks between lava spread steps in the nether. */
export const NETHER_LAVA_SPREAD_TICKS = 10;

/** How much depth one horizontal step costs for the liquid and dimension. */
export const depthStep = (identifier: string, dimension: string): number =>
    ratesFor(isLava(identifier) ? 'lava' : 'water', dimension).dropOff;

/** The scheduled delay for one fluid's next spread step in a dimension. */
export const spreadTicks = (identifier: string, dimension: string): number =>
    ratesFor(isLava(identifier) ? 'lava' : 'water', dimension).tickDelay;

/** What lava turns into when water reaches it. */
export const lavaWaterProduct = (lava: HookBlock, fromAbove: boolean): string | undefined => {
    if (!isLava(lava.identifier)) return undefined;
    if (isLiquidSource(lava.identifier)) return OBSIDIAN;
    return fromAbove ? STONE : COBBLESTONE;
};

/** Turns lava to rock where adjacent water reaches it. */
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

/** A liquid's source and flow state as represented by Bedrock block states. */
export interface LiquidState {
    /** Whether the block contains water or lava. */
    readonly kind: 'water' | 'lava';
    /** The amount carried by the flowing state, from 1 through 8. */
    readonly amount: number;
    /** Whether the liquid is falling from above. */
    readonly falling: boolean;
    /** Whether this is a source block. */
    readonly source: boolean;
}

/** Per dimension rates copied from `WaterFluid` and `LavaFluid`. */
interface FluidRates {
    readonly dropOff: number;
    readonly slopeFindDistance: number;
    readonly tickDelay: number;
}

/** Reads a liquid block's kind, depth, falling state, and source state. */
export const liquidStateOf = (block: Pick<HookBlock, 'identifier' | 'states'> | undefined): LiquidState | undefined => {
    if (block === undefined || !isLiquid(block.identifier)) return undefined;

    const kind = isLava(block.identifier) ? 'lava' : 'water';
    const depth = stateNumber(block, 'liquid_depth');
    const falling = depth >= 8;
    const level = depth & 7;
    if (isLiquidSource(block.identifier) && !falling && level === 0) {
        return { kind, amount: 8, falling: false, source: true };
    }
    return { kind, amount: falling && level === 0 ? 8 : 8 - level, falling, source: false };
};

/** Encodes a Java fluid state as one of Bedrock's source and flowing blocks. */
const fluidBlockOf = (state: LiquidState): { readonly identifier: string; readonly depth: number } => {
    if (state.source) return { identifier: state.kind === 'water' ? WATER : LAVA, depth: 0 };
    const depth = 8 - Math.min(state.amount, 8) + (state.falling ? 8 : 0);
    return {
        identifier: state.kind === 'water' ? FLOWING_WATER : FLOWING_LAVA,
        depth
    };
};

/** Whether two fluid states would write the same block state. */
const sameState = (a: LiquidState | undefined, b: LiquidState | undefined): boolean =>
    a?.kind === b?.kind && a?.amount === b?.amount && a?.falling === b?.falling && a?.source === b?.source;

/** The Java spread depth, hole-search distance, and tick delay in a dimension. */
const ratesFor = (kind: LiquidState['kind'], dimension: string): FluidRates => {
    if (kind === 'water') return { dropOff: 1, slopeFindDistance: 4, tickDelay: WATER_SPREAD_TICKS };
    return dimension === NETHER
        ? { dropOff: 1, slopeFindDistance: 4, tickDelay: NETHER_LAVA_SPREAD_TICKS }
        : { dropOff: 2, slopeFindDistance: 2, tickDelay: LAVA_SPREAD_TICKS };
};

/** Whether a block's collision shape fills the cell, with conservative host fallbacks. */
const isFullCube = (world: WorldActions, block: HookBlock | undefined): boolean => {
    if (block === undefined) return true;
    if (isAir(block.identifier) || isLiquid(block.identifier)) return false;
    if (world.isFullCube !== undefined) return world.isFullCube(block);
    if (world.hasSturdyTopFace !== undefined) return !isWashedAway(block.identifier) && world.hasSturdyTopFace(block);
    return !isWashedAway(block.identifier);
};

/** Whether a fluid can move between two cells without a full cube in the way. */
const canPassThroughWall = (world: WorldActions, from: BlockPosition, to: BlockPosition): boolean =>
    !isFullCube(world, world.getBlock(from)) && !isFullCube(world, world.getBlock(to));

/** Whether a fluid is allowed to occupy a block's cell. */
const canFluidOccupy = (block: HookBlock | undefined): boolean => block !== undefined && isWashedAway(block.identifier);

/** Whether the fluid already at a position can be replaced from this direction. */
const canBeReplacedWith = (
    existing: LiquidState | undefined,
    incoming: LiquidState['kind'],
    direction: BlockFace
): boolean => {
    if (existing === undefined) return true;
    if (existing.kind === 'water') return direction === 'down' && incoming !== 'water';
    return existing.amount / 9 >= 0.44444445 && incoming === 'water';
};

/** Whether a fluid state is a source of the requested kind. */
const isSourceOf = (state: LiquidState | undefined, kind: LiquidState['kind']): boolean =>
    state?.kind === kind && state.source;

/** Whether Java's source conversion rule lets two sources create another. */
const sourceConversionEnabled = (world: WorldActions, kind: LiquidState['kind']): boolean =>
    world.fluidSourceConversion?.(kind) ?? kind === 'water';

/** Recomputes the fluid that belongs at a position from its current neighbors. */
const newLiquidAt = (
    world: WorldActions,
    at: BlockPosition,
    kind: LiquidState['kind'],
    dimension: string
): LiquidState | undefined => {
    const rates = ratesFor(kind, dimension);
    let highestNeighbor = 0;
    let neighborSources = 0;

    for (const direction of HORIZONTAL_FACES) {
        const neighborAt = offset(at, direction);
        const neighbor = liquidStateOf(world.getBlock(neighborAt));
        if (neighbor?.kind !== kind || !canPassThroughWall(world, at, neighborAt)) continue;
        if (neighbor.source) neighborSources++;
        highestNeighbor = Math.max(highestNeighbor, neighbor.amount);
    }

    if (neighborSources >= 2 && sourceConversionEnabled(world, kind)) {
        const belowAt = offset(at, 'down');
        const below = world.getBlock(belowAt);
        if (below !== undefined && (isFullCube(world, below) || isSourceOf(liquidStateOf(below), kind))) {
            return { kind, amount: 8, falling: false, source: true };
        }
    }

    const aboveAt = offset(at, 'up');
    const above = liquidStateOf(world.getBlock(aboveAt));
    if (above?.kind === kind && canPassThroughWall(world, at, aboveAt)) {
        return { kind, amount: 8, falling: true, source: false };
    }

    const amount = highestNeighbor - rates.dropOff;
    if (amount <= 0) return undefined;
    return { kind, amount, falling: false, source: false };
};

/** A source of one kind, which the incoming fluid cannot overwrite. */
const isSourceBlockOf = (world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): boolean =>
    isSourceOf(liquidStateOf(world.getBlock(at)), kind);

/** Whether fluid may enter a target cell from one position. */
const canMaybePassThrough = (
    world: WorldActions,
    from: BlockPosition,
    to: BlockPosition,
    kind: LiquidState['kind']
): boolean =>
    !isSourceBlockOf(world, to, kind) && canFluidOccupy(world.getBlock(to)) && canPassThroughWall(world, from, to);

/** Whether fluid at this position has an opening to fall through. */
const isHole = (world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): boolean => {
    const belowAt = offset(at, 'down');
    if (!canPassThroughWall(world, at, belowAt)) return false;
    const below = world.getBlock(belowAt);
    return liquidStateOf(below)?.kind === kind || canFluidOccupy(below);
};

/** Searches sideways for the nearest hole, without doubling back. */
const slopeDistance = (
    world: WorldActions,
    at: BlockPosition,
    pass: number,
    from: BlockFace,
    kind: LiquidState['kind'],
    dimension: string,
    limit: number,
    holeCache: Map<string, boolean>
): number => {
    let lowest = 1000;
    for (const direction of HORIZONTAL_FACES) {
        if (direction === from) continue;
        const testAt = offset(at, direction);
        if (!canMaybePassThrough(world, at, testAt, kind)) continue;

        const key = `${testAt.x},${testAt.y},${testAt.z}`;
        let hole = holeCache.get(key);
        if (hole === undefined) {
            hole = isHole(world, testAt, kind);
            holeCache.set(key, hole);
        }
        if (hole) return pass;
        if (pass < limit) {
            const found = slopeDistance(
                world,
                testAt,
                pass + 1,
                opposite(direction),
                kind,
                dimension,
                limit,
                holeCache
            );
            if (found < lowest) lowest = found;
        }
    }
    return lowest;
};

/** Finds the lowest-scoring horizontal routes toward holes below the fluid. */
const fluidSpreadDirections = (
    world: WorldActions,
    at: BlockPosition,
    kind: LiquidState['kind'],
    dimension: string
): Map<Extract<BlockFace, 'north' | 'south' | 'east' | 'west'>, LiquidState> => {
    const rates = ratesFor(kind, dimension);
    const result = new Map<Extract<BlockFace, 'north' | 'south' | 'east' | 'west'>, LiquidState>();
    const holeCache = new Map<string, boolean>();
    let lowest = 1000;

    for (const direction of HORIZONTAL_FACES) {
        const testAt = offset(at, direction);
        if (!canMaybePassThrough(world, at, testAt, kind)) continue;
        const next = newLiquidAt(world, testAt, kind, dimension);
        if (next === undefined) continue;

        const key = `${testAt.x},${testAt.y},${testAt.z}`;
        let hole = holeCache.get(key);
        if (hole === undefined) {
            hole = isHole(world, testAt, kind);
            holeCache.set(key, hole);
        }
        const distance = hole
            ? 0
            : slopeDistance(world, testAt, 1, opposite(direction), kind, dimension, rates.slopeFindDistance, holeCache);
        if (distance < lowest) result.clear();
        if (distance <= lowest) {
            if (canBeReplacedWith(liquidStateOf(world.getBlock(testAt)), kind, direction)) {
                result.set(direction, next);
            }
            lowest = distance;
        }
    }
    return result;
};

/** Changes lava to obsidian, cobblestone, stone, or basalt when water reaches it. */
export const applyLavaReactions = (world: WorldActions, at: BlockPosition): boolean => {
    const lava = world.getBlock(at);
    const state = liquidStateOf(lava);
    if (lava === undefined || state?.kind !== 'lava') return true;

    const overSoulSoil = bareName(world.getBlock(offset(at, 'down'))?.identifier ?? AIR) === 'soul_soil';
    for (const direction of ['down', 'south', 'north', 'east', 'west'] as const) {
        const neighborAt = offset(at, opposite(direction));
        const neighbor = world.getBlock(neighborAt);
        if (neighbor !== undefined && isWater(neighbor.identifier)) {
            const becomes = state.source ? OBSIDIAN : COBBLESTONE;
            world.setBlock(at, becomes);
            world.playSound(at, 'random.fizz');
            world.notifyNeighbors(at);
            return false;
        }
        if (overSoulSoil && bareName(neighbor?.identifier ?? AIR) === 'blue_ice') {
            world.setBlock(at, 'minecraft:basalt');
            world.playSound(at, 'random.fizz');
            world.notifyNeighbors(at);
            return false;
        }
    }
    return true;
};

/** Writes a new fluid state and asks the host to roll the displaced block's loot. */
const spreadTo = (
    world: WorldActions,
    at: BlockPosition,
    direction: BlockFace,
    target: LiquidState,
    dimension: string
): void => {
    const existing = world.getBlock(at);
    if (target.kind === 'lava' && direction === 'down' && existing !== undefined && isWater(existing.identifier)) {
        world.setBlock(at, STONE);
        world.playSound(at, 'random.fizz');
        return;
    }

    if (existing !== undefined && !isAir(existing.identifier) && !isLiquid(existing.identifier)) {
        const reaction = bedrockLiquidReactionOf(existing.identifier);
        const rolled = world.destroyBlock?.(at, { drops: reaction !== 'broken' }) ?? false;
        if (reaction === 'popped' && !rolled) world.dropItem(at, { identifier: existing.identifier, count: 1 });
    }

    const encoded = fluidBlockOf(target);
    world.setBlock(at, encoded.identifier, { liquid_depth: encoded.depth });
    world.notifyNeighbors(at);
    if (applyLavaReactions(world, at)) {
        world.scheduleTick(at, spreadTicks(encoded.identifier, dimension), 'fluid');
    }
};

/** Counts same-kind source blocks beside one position. */
const sourceNeighborCount = (world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): number => {
    let count = 0;
    for (const direction of HORIZONTAL_FACES) {
        if (isSourceOf(liquidStateOf(world.getBlock(offset(at, direction))), kind)) count++;
    }
    return count;
};

/** Spreads a fluid to the sides selected by the slope search. */
const spreadToSides = (
    world: WorldActions,
    at: BlockPosition,
    state: LiquidState,
    dimension: string
): HorizontalFace[] => {
    const neighborAmount = state.falling ? 7 : state.amount - ratesFor(state.kind, dimension).dropOff;
    if (neighborAmount <= 0) return [];

    const directions: HorizontalFace[] = [];
    for (const [direction, next] of fluidSpreadDirections(world, at, state.kind, dimension)) {
        spreadTo(world, offset(at, direction), direction, next, dimension);
        directions.push(direction);
    }
    return directions;
};

/** Runs `FlowingFluid.spread`: down first, then toward the lowest sideways holes. */
const spreadFluid = (world: WorldActions, at: BlockPosition, state: LiquidState, dimension: string): SpreadResult => {
    const belowAt = offset(at, 'down');
    if (canMaybePassThrough(world, at, belowAt, state.kind)) {
        const nextBelow = newLiquidAt(world, belowAt, state.kind, dimension) ?? {
            kind: state.kind,
            amount: 8,
            falling: true,
            source: false
        };
        if (canBeReplacedWith(liquidStateOf(world.getBlock(belowAt)), state.kind, 'down')) {
            spreadTo(world, belowAt, 'down', { ...nextBelow, falling: true }, dimension);
            const sides =
                sourceNeighborCount(world, at, state.kind) >= 3 ? spreadToSides(world, at, state, dimension) : [];
            return { down: true, sides };
        }
    }

    if (state.source || !isHole(world, at, state.kind)) {
        return { down: false, sides: spreadToSides(world, at, state, dimension) };
    }
    return { down: false, sides: [] };
};

/** The sides and direction a flow step took. */
export interface SpreadResult {
    /** Whether this step flowed downward. */
    readonly down: boolean;
    /** The horizontal faces this step flowed along. */
    readonly sides: readonly HorizontalFace[];
}

/** Whether a fluid can replace a block at a new depth. */
export const canFlowInto = (world: WorldActions, position: BlockPosition, liquid: string, depth: number): boolean => {
    const block = world.getBlock(position);
    if (!canFluidOccupy(block) || block === undefined) return false;
    const existing = liquidStateOf(block);
    if (existing === undefined) return true;
    if (isLava(liquid) !== (existing.kind === 'lava')) return true;
    if (existing.source) return false;
    return stateNumber(block, 'liquid_depth') > depth;
};

/** Recomputes a flowing block's depth, removes it when empty, and spreads it. */
export const fluidTick = (world: WorldActions, block: HookBlock): SpreadResult => {
    let state = liquidStateOf(block);
    if (state === undefined || !applyLavaReactions(world, block.position)) return { down: false, sides: [] };

    if (!state.source) {
        const next = newLiquidAt(world, block.position, state.kind, block.dimension);
        if (next === undefined) {
            world.setBlock(block.position, AIR);
            world.notifyNeighbors(block.position);
            return { down: false, sides: [] };
        }
        if (!sameState(next, state)) {
            state = next;
            const encoded = fluidBlockOf(next);
            world.setBlock(block.position, encoded.identifier, { liquid_depth: encoded.depth });
            world.notifyNeighbors(block.position);
            world.scheduleTick(block.position, spreadTicks(encoded.identifier, block.dimension), 'fluid');
        }
    }
    return spreadFluid(world, block.position, state, block.dimension);
};

/** Schedules a fluid after a neighboring block changed, unless lava already reacted. */
export const fluidNeighborChanged = (world: WorldActions, block: HookBlock): void => {
    if (!applyLavaReactions(world, block.position)) return;
    world.scheduleTick(block.position, spreadTicks(block.identifier, block.dimension), 'fluid');
};

/** Runs one fluid's flow step, returning the directions that received fluid. */
export const spreadLiquid = (world: WorldActions, block: HookBlock): SpreadResult => fluidTick(world, block);
