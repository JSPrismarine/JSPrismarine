/**
 * Flowing water and lava.
 *
 * `FlowingFluid`, `WaterFluid`, `LavaFluid` and `LiquidBlock` from the 26.3
 * jar. The three numbers that decide how far and how fast a fluid travels come
 * straight from there, and they are the only place in this package where the
 * dimension changes an answer.
 *
 * Java models a fluid as a `FluidState` attached to any block, which is why
 * `waterlogged` is a block state there. Bedrock has separate `flowing_water`
 * and `flowing_lava` blocks and no `waterlogged` anywhere in its palette, so
 * this package keeps Java's algorithm over Bedrock's two blocks and encodes the
 * level into Bedrock's own `liquid_depth` state. The README says what that
 * costs.
 */

import { isAir, isFullCube, pushReactionOf } from './blockRules';
import type { NeighborUpdates } from './neighborUpdates';
import type { BlockPosition, BlockRef, Direction, WorldAccess } from './world';
import { AIR, HORIZONTAL_DIRECTIONS, opposite, positionKey, relative } from './world';

/** The two fluids this package moves. */
export type FluidKind = 'water' | 'lava';

/** The Bedrock identifiers of each fluid's source and flowing block. */
export const FLUID_BLOCKS = {
    water: { source: 'minecraft:water', flowing: 'minecraft:flowing_water' },
    lava: { source: 'minecraft:lava', flowing: 'minecraft:flowing_lava' }
} as const satisfies Record<FluidKind, { source: string; flowing: string }>;

/** Bedrock's own fluid level state, 0 for a source through 15. */
export const LIQUID_DEPTH_STATE = 'liquid_depth';

/** A source block's amount, Java's full `FluidState`. */
export const SOURCE_AMOUNT = 8;

/** The amount a falling fluid hands the block below it. */
export const FALLING_AMOUNT = 8;

/** One fluid state: how much, whether it fell, and whether it is a source. */
export interface FluidState {
    readonly kind: FluidKind;
    /** 1 through 8, where 8 is a full block. */
    readonly amount: number;
    readonly falling: boolean;
    readonly source: boolean;
}

/** How a fluid behaves in one dimension, read from `WaterFluid` and `LavaFluid`. */
export interface FluidRates {
    /** How much level one block of travel costs, Java's `getDropOff`. */
    readonly dropOff: number;
    /** How far the hole search looks, Java's `getSlopeFindDistance`. */
    readonly slopeFindDistance: number;
    /** Game ticks between two spread steps, Java's `getTickDelay`. */
    readonly tickDelay: number;
}

/**
 * The rates both fluids use, per dimension.
 *
 * Water is the same everywhere. Lava has two settings, selected by Java's
 * `FAST_LAVA` environment attribute, which the nether sets: the overworld and
 * the end lose 2 levels per block every 30 ticks and look 2 blocks for a hole,
 * and the nether loses 1 every 10 ticks and looks 4. That is why lava reaches
 * 3 blocks in the overworld and 7 in the nether.
 */
export const FLUID_RATES = {
    water: {
        overworld: { dropOff: 1, slopeFindDistance: 4, tickDelay: 5 },
        nether: { dropOff: 1, slopeFindDistance: 4, tickDelay: 5 },
        the_end: { dropOff: 1, slopeFindDistance: 4, tickDelay: 5 }
    },
    lava: {
        overworld: { dropOff: 2, slopeFindDistance: 2, tickDelay: 30 },
        nether: { dropOff: 1, slopeFindDistance: 4, tickDelay: 10 },
        the_end: { dropOff: 2, slopeFindDistance: 2, tickDelay: 30 }
    }
} as const;

/** Whether infinite sources form, Java's two source-conversion game rules. */
export interface FluidSourceRules {
    /** `water_source_conversion`, true in vanilla. */
    readonly water: boolean;
    /** `lava_source_conversion`, false in vanilla outside the nether's own rule. */
    readonly lava: boolean;
}

/** The vanilla defaults of the two source-conversion game rules. */
export const DEFAULT_SOURCE_RULES: FluidSourceRules = { water: true, lava: false };

/** The rates one fluid runs at in the world's dimension. */
export const ratesFor = (world: WorldAccess, kind: FluidKind): FluidRates => FLUID_RATES[kind][world.getDimension()];

/** Which fluid a block is, or undefined for anything else. */
export const fluidKindOf = (block: BlockRef): FluidKind | undefined => {
    if (block.name === FLUID_BLOCKS.water.source || block.name === FLUID_BLOCKS.water.flowing) return 'water';
    if (block.name === FLUID_BLOCKS.lava.source || block.name === FLUID_BLOCKS.lava.flowing) return 'lava';
    return undefined;
};

/**
 * Decode a block into a fluid state.
 *
 * Bedrock's `liquid_depth` is Java's `getLegacyLevel`: 0 is a source, 1 to 7
 * are flowing levels counted down from full, and adding 8 marks a falling
 * fluid.
 */
export const fluidStateOf = (block: BlockRef): FluidState | undefined => {
    const kind = fluidKindOf(block);
    if (kind === undefined) return undefined;
    const raw = block.states[LIQUID_DEPTH_STATE];
    const depth = typeof raw === 'number' ? raw : 0;
    const falling = depth >= 8;
    const level = depth & 7;
    if (block.name === FLUID_BLOCKS[kind].source && !falling && level === 0) {
        return { kind, amount: SOURCE_AMOUNT, falling: false, source: true };
    }
    return { kind, amount: falling && level === 0 ? FALLING_AMOUNT : SOURCE_AMOUNT - level, falling, source: false };
};

/** Encode a fluid state back into a Bedrock block, Java's `createLegacyBlock`. */
export const fluidBlockOf = (state: FluidState): BlockRef => {
    if (state.source) return { name: FLUID_BLOCKS[state.kind].source, states: { [LIQUID_DEPTH_STATE]: 0 } };
    const depth = SOURCE_AMOUNT - Math.min(state.amount, SOURCE_AMOUNT) + (state.falling ? 8 : 0);
    return { name: FLUID_BLOCKS[state.kind].flowing, states: { [LIQUID_DEPTH_STATE]: depth } };
};

const sameState = (a: FluidState | undefined, b: FluidState | undefined): boolean =>
    a?.kind === b?.kind && a?.amount === b?.amount && a?.falling === b?.falling && a?.source === b?.source;

/**
 * Whether a fluid can move between two positions, Java's `canPassThroughWall`.
 *
 * Java merges the two collision shapes and asks whether the shared face is
 * occluded. Collision shapes have no published source, so this answers from the
 * full-cube test instead: a full cube on either side blocks the move, anything
 * else lets it through.
 */
const canPassThroughWall = (world: WorldAccess, from: BlockPosition, to: BlockPosition): boolean =>
    !isFullCube(world.getBlock(from)) && !isFullCube(world.getBlock(to));

/**
 * Whether a fluid may occupy a position at all, Java's `canHoldAnyFluid`.
 *
 * Java asks for a `LiquidBlockContainer` or the `washed_away_by_fluids` tag.
 * This reads the push reaction instead: `popped` is the reaction every block
 * that tag holds carries, because both describe the same set of fragile
 * decorations.
 */
export const canFluidOccupy = (block: BlockRef): boolean =>
    isAir(block) || fluidKindOf(block) !== undefined || pushReactionOf(block) === 'popped';

/** Java's `FluidState.canBeReplacedWith` for the fluid already at a position. */
const canBeReplacedWith = (existing: FluidState | undefined, incoming: FluidKind, direction: Direction): boolean => {
    if (existing === undefined) return true;
    if (existing.kind === 'water') return direction === 'down' && incoming !== 'water';
    // Lava is replaced by water only once it is at least four ninths deep.
    return existing.amount / 9 >= 0.44444445 && incoming === 'water';
};

const isSourceOf = (state: FluidState | undefined, kind: FluidKind): boolean =>
    state !== undefined && state.kind === kind && state.source;

/**
 * `FlowingFluid.getNewLiquid`: what a position's fluid should become, given its
 * neighbors.
 *
 * Two sources touching make a third when the game rule allows it, which is
 * where infinite water comes from. A fluid directly above makes this one a
 * full falling block regardless of the sides.
 */
export const newLiquidAt = (
    world: WorldAccess,
    at: BlockPosition,
    kind: FluidKind,
    sourceRules: FluidSourceRules = DEFAULT_SOURCE_RULES
): FluidState | undefined => {
    const rates = ratesFor(world, kind);
    let highestNeighbor = 0;
    let neighborSources = 0;

    for (const direction of HORIZONTAL_DIRECTIONS) {
        const neighborPos = relative(at, direction);
        const neighbor = fluidStateOf(world.getBlock(neighborPos));
        if (neighbor?.kind !== kind) continue;
        if (!canPassThroughWall(world, at, neighborPos)) continue;
        if (neighbor.source) neighborSources++;
        highestNeighbor = Math.max(highestNeighbor, neighbor.amount);
    }

    if (neighborSources >= 2 && sourceRules[kind]) {
        const belowPos = relative(at, 'down');
        const below = world.getBlock(belowPos);
        if (isFullCube(below) || isSourceOf(fluidStateOf(below), kind)) {
            return { kind, amount: SOURCE_AMOUNT, falling: false, source: true };
        }
    }

    const abovePos = relative(at, 'up');
    const above = fluidStateOf(world.getBlock(abovePos));
    if (above?.kind === kind && canPassThroughWall(world, at, abovePos)) {
        return { kind, amount: FALLING_AMOUNT, falling: true, source: false };
    }

    const amount = highestNeighbor - rates.dropOff;
    if (amount <= 0) return undefined;
    return { kind, amount, falling: false, source: false };
};

const canMaybePassThrough = (world: WorldAccess, from: BlockPosition, to: BlockPosition, kind: FluidKind): boolean => {
    const target = world.getBlock(to);
    if (isSourceOf(fluidStateOf(target), kind)) return false;
    if (!canFluidOccupy(target)) return false;
    return canPassThroughWall(world, from, to);
};

/** Java's `isWaterHole`: whether the fluid can fall out of this position. */
const isHole = (world: WorldAccess, at: BlockPosition, kind: FluidKind): boolean => {
    const belowPos = relative(at, 'down');
    if (!canPassThroughWall(world, at, belowPos)) return false;
    const below = world.getBlock(belowPos);
    if (fluidKindOf(below) === kind) return true;
    return canFluidOccupy(below);
};

/**
 * `FlowingFluid.getSlopeDistance`: how many blocks away the nearest hole is,
 * searched breadth-first out to `slopeFindDistance` and never doubling back.
 */
const slopeDistance = (
    world: WorldAccess,
    at: BlockPosition,
    pass: number,
    from: Direction,
    kind: FluidKind,
    limit: number,
    holeCache: Map<string, boolean>
): number => {
    let lowest = 1000;

    for (const direction of HORIZONTAL_DIRECTIONS) {
        if (direction === from) continue;
        const testPos = relative(at, direction);
        if (!canMaybePassThrough(world, at, testPos, kind)) continue;

        const key = positionKey(testPos);
        let hole = holeCache.get(key);
        if (hole === undefined) {
            hole = isHole(world, testPos, kind);
            holeCache.set(key, hole);
        }
        if (hole) return pass;

        if (pass < limit) {
            const found = slopeDistance(world, testPos, pass + 1, opposite(direction), kind, limit, holeCache);
            if (found < lowest) lowest = found;
        }
    }

    return lowest;
};

/**
 * `FlowingFluid.getSpread`: which sides the fluid flows to.
 *
 * Every candidate side is scored by how far it is from a hole, and only the
 * sides tied for the lowest score receive fluid. This is why water on a flat
 * floor spreads evenly but water next to a one-block drop runs straight at it.
 */
export const fluidSpreadDirections = (
    world: WorldAccess,
    at: BlockPosition,
    kind: FluidKind,
    sourceRules: FluidSourceRules = DEFAULT_SOURCE_RULES
): Map<Direction, FluidState> => {
    const rates = ratesFor(world, kind);
    const result = new Map<Direction, FluidState>();
    const holeCache = new Map<string, boolean>();
    let lowest = 1000;

    for (const direction of HORIZONTAL_DIRECTIONS) {
        const testPos = relative(at, direction);
        if (!canMaybePassThrough(world, at, testPos, kind)) continue;

        const newFluid = newLiquidAt(world, testPos, kind, sourceRules);
        if (newFluid === undefined) continue;

        const key = positionKey(testPos);
        let hole = holeCache.get(key);
        if (hole === undefined) {
            hole = isHole(world, testPos, kind);
            holeCache.set(key, hole);
        }

        const distance = hole
            ? 0
            : slopeDistance(world, testPos, 1, opposite(direction), kind, rates.slopeFindDistance, holeCache);

        if (distance < lowest) result.clear();
        if (distance <= lowest) {
            const existing = fluidStateOf(world.getBlock(testPos));
            if (canBeReplacedWith(existing, kind, direction)) result.set(direction, newFluid);
            lowest = distance;
        }
    }

    return result;
};

/**
 * `LiquidBlock.shouldSpreadLiquid`: the three blocks lava makes when it meets
 * something.
 *
 * Lava touching water becomes obsidian when it is a source and cobblestone
 * when it is flowing. Lava over soul soil touching blue ice becomes basalt.
 * Java checks the five directions in `POSSIBLE_FLOW_DIRECTIONS` order, reading
 * the block opposite each one.
 *
 * @returns True when the lava stayed lava, which is what lets it keep flowing.
 */
export const applyLavaReactions = (world: WorldAccess, at: BlockPosition): boolean => {
    const state = fluidStateOf(world.getBlock(at));
    if (state?.kind !== 'lava') return true;

    const overSoulSoil = world.getBlock(relative(at, 'down')).name === 'minecraft:soul_soil';
    // Java's `POSSIBLE_FLOW_DIRECTIONS`, read opposite as `LiquidBlock` does.
    for (const direction of ['down', 'south', 'north', 'east', 'west'] as const) {
        const neighborPos = relative(at, opposite(direction));
        if (fluidKindOf(world.getBlock(neighborPos)) === 'water') {
            const becomes = state.source ? 'minecraft:obsidian' : 'minecraft:cobblestone';
            world.setBlock(at, { name: becomes, states: {} }, true);
            world.playSound(at, 'minecraft:random.fizz');
            return false;
        }
        if (overSoulSoil && world.getBlock(neighborPos).name === 'minecraft:blue_ice') {
            world.setBlock(at, { name: 'minecraft:basalt', states: {} }, true);
            world.playSound(at, 'minecraft:random.fizz');
            return false;
        }
    }

    return true;
};

/**
 * `FlowingFluid.spreadTo`, plus the tick `LiquidBlock.onPlace` schedules for
 * the block that just arrived. Without that tick the stream would stop one
 * block from its source.
 */
const spreadTo = (world: WorldAccess, at: BlockPosition, direction: Direction, target: FluidState): void => {
    const existing = world.getBlock(at);
    if (target.kind === 'lava' && direction === 'down' && fluidKindOf(existing) === 'water') {
        world.setBlock(at, { name: 'minecraft:stone', states: {} }, true);
        world.playSound(at, 'minecraft:random.fizz');
        return;
    }
    // Java's `beforeDestroyingBlock`: the block the stream reached is destroyed rather than
    // overwritten, so it yields what its loot table says and a chest spills what it held.
    if (!isAir(existing) && fluidKindOf(existing) === undefined) {
        world.destroyBlock(at, { drops: true, replacement: fluidBlockOf(target), notifyNeighbors: true });
    } else {
        world.setBlock(at, fluidBlockOf(target), true);
    }
    if (applyLavaReactions(world, at)) {
        world.scheduleTick('fluid', at, FLUID_BLOCKS[target.kind].flowing, ratesFor(world, target.kind).tickDelay);
    }
};

const sourceNeighborCount = (world: WorldAccess, at: BlockPosition, kind: FluidKind): number => {
    let count = 0;
    for (const direction of HORIZONTAL_DIRECTIONS) {
        if (isSourceOf(fluidStateOf(world.getBlock(relative(at, direction))), kind)) count++;
    }
    return count;
};

/** `FlowingFluid.spreadToSides`. */
const spreadToSides = (
    world: WorldAccess,
    at: BlockPosition,
    state: FluidState,
    sourceRules: FluidSourceRules
): void => {
    const rates = ratesFor(world, state.kind);
    const neighborAmount = state.falling ? 7 : state.amount - rates.dropOff;
    if (neighborAmount <= 0) return;

    for (const [direction, newFluid] of fluidSpreadDirections(world, at, state.kind, sourceRules)) {
        spreadTo(world, relative(at, direction), direction, newFluid);
    }
};

/** `FlowingFluid.spread`: down first, then sideways. */
export const spreadFluid = (
    world: WorldAccess,
    at: BlockPosition,
    state: FluidState,
    sourceRules: FluidSourceRules = DEFAULT_SOURCE_RULES
): void => {
    const belowPos = relative(at, 'down');
    if (canMaybePassThrough(world, at, belowPos, state.kind)) {
        const newBelow = newLiquidAt(world, belowPos, state.kind, sourceRules) ?? {
            kind: state.kind,
            amount: FALLING_AMOUNT,
            falling: true,
            source: false
        };
        const belowExisting = fluidStateOf(world.getBlock(belowPos));
        if (canBeReplacedWith(belowExisting, state.kind, 'down')) {
            spreadTo(world, belowPos, 'down', { ...newBelow, falling: true });
            if (sourceNeighborCount(world, at, state.kind) >= 3) {
                spreadToSides(world, at, state, sourceRules);
            }
            return;
        }
    }

    if (state.source || !isHole(world, at, state.kind)) {
        spreadToSides(world, at, state, sourceRules);
    }
};

/**
 * `FlowingFluid.tick`: recompute a flowing fluid's level, write it back when it
 * changed, and spread.
 *
 * A source never recomputes; it only spreads. A flowing block whose new level
 * is empty disappears, which is how a broken source drains its stream.
 */
export const fluidTick = (
    updates: NeighborUpdates,
    world: WorldAccess,
    at: BlockPosition,
    sourceRules: FluidSourceRules = DEFAULT_SOURCE_RULES
): void => {
    const block = world.getBlock(at);
    let state = fluidStateOf(block);
    if (state === undefined) return;

    if (!state.source) {
        const next = newLiquidAt(world, at, state.kind, sourceRules);
        if (next === undefined) {
            world.setBlock(at, AIR, true);
            updates.updateNeighborsAt(at, block.name);
            return;
        }
        if (!sameState(next, state)) {
            state = next;
            world.setBlock(at, fluidBlockOf(next), true);
            updates.updateNeighborsAt(at, block.name);
            world.scheduleTick('fluid', at, FLUID_BLOCKS[next.kind].flowing, ratesFor(world, next.kind).tickDelay);
        }
    }

    spreadFluid(world, at, state, sourceRules);
};

/**
 * `LiquidBlock.neighborChanged` and `onPlace`: a fluid reschedules itself when
 * anything around it moves, after the lava reactions get their chance.
 */
export const fluidNeighborChanged = (world: WorldAccess, at: BlockPosition): void => {
    const kind = fluidKindOf(world.getBlock(at));
    if (kind === undefined) return;
    if (!applyLavaReactions(world, at)) return;
    world.scheduleTick('fluid', at, FLUID_BLOCKS[kind].flowing, ratesFor(world, kind).tickDelay);
};
