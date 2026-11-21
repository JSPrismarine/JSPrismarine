/**
 * Water and lava flow, including the slope search that sends a stream toward
 * the nearest drop instead of spreading evenly across a flat floor.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { bedrockLiquidReactionOf, isWashedAway } from '@jsprismarine/blocks';
import { bedrockBlockStateToJava, javaBlockFluidKindOf } from '@jsprismarine/mapping';

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
        if (!holdsWater(world, offset(lava.position, face))) continue;
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
    if (block === undefined) return undefined;

    if (!isLiquid(block.identifier)) {
        const mapped = bedrockBlockStateToJava(block.identifier, block.states);
        if (mapped.kind !== 'mapped') return undefined;
        const kind = javaBlockFluidKindOf(mapped.java);
        return kind === 'empty' ? undefined : { kind, amount: 8, falling: false, source: true };
    }

    const kind = isLava(block.identifier) ? 'lava' : 'water';
    const depth = stateNumber(block, 'liquid_depth');
    const falling = depth >= 8;
    const level = depth & 7;
    if (isLiquidSource(block.identifier) && !falling && level === 0) {
        return { kind, amount: 8, falling: false, source: true };
    }
    return { kind, amount: falling && level === 0 ? 8 : 8 - level, falling, source: false };
};

/**
 * The fluid at a position, from its block or from the liquid layer behind it.
 *
 * Java's `BlockState.getFluidState` answers for a waterlogged block with a water source, and
 * every rule that asks a neighbor what fluid it holds asks that. Bedrock keeps that water in the
 * position's second layer, so a block whose own state holds no fluid falls back to it.
 */
export const fluidAt = (world: WorldActions, at: BlockPosition): LiquidState | undefined =>
    liquidStateOf(world.getBlock(at)) ?? liquidStateOf(world.getLiquid?.(at));

/**
 * Whether a position holds water that lava reacts to: a water block, or a waterlogged block's
 * water in the liquid layer.
 */
const holdsWater = (world: WorldActions, at: BlockPosition): boolean => {
    const block = world.getBlock(at);
    if (block !== undefined && isWater(block.identifier)) return true;
    return liquidStateOf(world.getLiquid?.(at))?.kind === 'water';
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

/** The face of `from`'s cell that its neighbor `to` is on. */
const faceToward = (from: BlockPosition, to: BlockPosition): BlockFace => {
    if (to.y < from.y) return 'down';
    if (to.y > from.y) return 'up';
    if (to.z < from.z) return 'north';
    if (to.z > from.z) return 'south';
    return to.x < from.x ? 'west' : 'east';
};

/**
 * Whether a fluid can move between two neighboring cells, Java's `FlowingFluid.canPassThroughWall`:
 * neither is a full cube, and their shapes leave the face between them open where the host can
 * tell, so a bottom slab keeps its water from the cell below.
 */
const canPassThroughWall = (world: WorldActions, from: BlockPosition, to: BlockPosition): boolean => {
    const fromBlock = world.getBlock(from);
    const toBlock = world.getBlock(to);
    if (isFullCube(world, fromBlock) || isFullCube(world, toBlock)) return false;
    if (fromBlock === undefined || toBlock === undefined || world.faceOccludes === undefined) return true;
    return !world.faceOccludes(fromBlock, toBlock, faceToward(from, to));
};

/** What a fluid does to a block, by the host's rule when it has one and Bedrock's data otherwise. */
const liquidReaction = (world: WorldActions, block: HookBlock) =>
    world.liquidReactionOf?.(block) ?? bedrockLiquidReactionOf(block.identifier);

/** Whether a fluid is allowed to occupy a block's cell. */
const canFluidOccupy = (world: WorldActions, block: HookBlock | undefined): boolean => {
    if (block === undefined) return false;
    const reaction = liquidReaction(world, block);
    return reaction !== undefined && reaction !== 'blocking';
};

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
        const neighbor = fluidAt(world, neighborAt);
        if (neighbor?.kind !== kind || !canPassThroughWall(world, at, neighborAt)) continue;
        if (neighbor.source) neighborSources++;
        highestNeighbor = Math.max(highestNeighbor, neighbor.amount);
    }

    if (neighborSources >= 2 && sourceConversionEnabled(world, kind)) {
        const belowAt = offset(at, 'down');
        const below = world.getBlock(belowAt);
        if (below !== undefined && (isFullCube(world, below) || isSourceOf(fluidAt(world, belowAt), kind))) {
            return { kind, amount: 8, falling: false, source: true };
        }
    }

    const aboveAt = offset(at, 'up');
    const above = fluidAt(world, aboveAt);
    if (above?.kind === kind && canPassThroughWall(world, at, aboveAt)) {
        return { kind, amount: 8, falling: true, source: false };
    }

    const amount = highestNeighbor - rates.dropOff;
    if (amount <= 0) return undefined;
    return { kind, amount, falling: false, source: false };
};

/** A source of one kind, which the incoming fluid cannot overwrite. */
const isSourceBlockOf = (world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): boolean =>
    isSourceOf(fluidAt(world, at), kind);

/** Whether fluid may enter a target cell from one position. */
const canMaybePassThrough = (
    world: WorldActions,
    from: BlockPosition,
    to: BlockPosition,
    kind: LiquidState['kind']
): boolean =>
    !isSourceBlockOf(world, to, kind) &&
    canFluidOccupy(world, world.getBlock(to)) &&
    canPassThroughWall(world, from, to);

/** Whether fluid at this position has an opening to fall through. */
const isHole = (world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): boolean => {
    const belowAt = offset(at, 'down');
    if (!canPassThroughWall(world, at, belowAt)) return false;
    return fluidAt(world, belowAt)?.kind === kind || canFluidOccupy(world, world.getBlock(belowAt));
};

/** What one slope search remembers: whether a cell is a hole, and what a branch found. */
interface SlopeSearch {
    readonly keyOf: (at: BlockPosition) => number | string;
    readonly holes: Map<number | string, boolean>;
    /** Each branch's answer by cell, the face it came from, and its depth; see {@link branchKeyOf}. */
    readonly branches: Map<number | string, number>;
}

/** A branch's key: its cell's key with the face it came from and its depth, a number for a near cell. */
const branchKeyOf = (cell: number | string, from: BlockFace, pass: number): number | string =>
    typeof cell === 'number' ? (cell * 8 + FACE_INDEX[from]) * 16 + pass : `${cell}:${from}:${pass}`;

/** A small number per face, for {@link branchKeyOf}. */
const FACE_INDEX: Readonly<Record<BlockFace, number>> = { north: 0, south: 1, west: 2, east: 3, up: 4, down: 5 };

/** Whether the fluid could fall at a position, answered once per cell of a search. */
const isHoleIn = (search: SlopeSearch, world: WorldActions, at: BlockPosition, kind: LiquidState['kind']): boolean => {
    const key = search.keyOf(at);
    let hole = search.holes.get(key);
    if (hole === undefined) {
        hole = isHole(world, at, kind);
        search.holes.set(key, hole);
    }
    return hole;
};

/**
 * Searches sideways for the nearest hole, without doubling back.
 *
 * Java's `getSlopeDistance` walks every path and answers the shortest. A branch's answer depends
 * only on its cell, the face it came from and its depth, and the search writes nothing, so a
 * branch the walk reaches again by another path answers from the first time.
 */
const slopeDistance = (
    world: WorldActions,
    at: BlockPosition,
    pass: number,
    from: BlockFace,
    kind: LiquidState['kind'],
    limit: number,
    search: SlopeSearch
): number => {
    const branchKey = branchKeyOf(search.keyOf(at), from, pass);
    const known = search.branches.get(branchKey);
    if (known !== undefined) return known;

    let lowest = 1000;
    for (const direction of HORIZONTAL_FACES) {
        if (direction === from) continue;
        const testAt = offset(at, direction);
        if (!canMaybePassThrough(world, at, testAt, kind)) continue;

        if (isHoleIn(search, world, testAt, kind)) {
            lowest = pass;
            break;
        }
        if (pass < limit) {
            const found = slopeDistance(world, testAt, pass + 1, opposite(direction), kind, limit, search);
            if (found < lowest) lowest = found;
        }
    }
    search.branches.set(branchKey, lowest);
    return lowest;
};

/** How far a slope search reaches from its start: a lava or water slope distance of 4, plus a step. */
const SEARCH_REACH = 8;
const SEARCH_SPAN = SEARCH_REACH * 2 + 1;

/**
 * The world with each position's block and liquid read once, for a search that writes nothing.
 *
 * The slope search visits the same few dozen cells many times over, and each visit reads a cell
 * and its neighbors again. Java's `FlowingFluid.getSpread` keeps the same per-search cache of
 * block states. What the host says about a block it read, whether it is a full cube and how fluid
 * reacts to it, is kept beside it, since the host works that out from the block's state each time.
 */
const searchView = (
    world: WorldActions,
    origin: BlockPosition
): { readonly view: WorldActions; readonly keyOf: (at: BlockPosition) => number | string } => {
    const blocks = new Map<number | string, HookBlock | undefined>();
    const liquids = new Map<number | string, HookBlock | undefined>();
    // The search stays a few blocks from where it started, so a cell's key is its small offset
    // from there, which is a number rather than a string to build and hash. Anything further
    // out, which a host's own reads might reach, keeps a string key.
    const keyOf = (at: BlockPosition): number | string => {
        const dx = at.x - origin.x + SEARCH_REACH;
        const dy = at.y - origin.y + 2;
        const dz = at.z - origin.z + SEARCH_REACH;
        if (dx < 0 || dx >= SEARCH_SPAN || dz < 0 || dz >= SEARCH_SPAN || dy < 0 || dy > 4) {
            return `${at.x},${at.y},${at.z}`;
        }
        return (dx * SEARCH_SPAN + dz) * 5 + dy;
    };
    const remembered = (
        cache: Map<number | string, HookBlock | undefined>,
        at: BlockPosition,
        read: (at: BlockPosition) => HookBlock | undefined
    ): HookBlock | undefined => {
        const key = keyOf(at);
        const cached = cache.get(key);
        if (cached !== undefined || cache.has(key)) return cached;
        const block = read(at);
        cache.set(key, block);
        return block;
    };
    /** One answer per block object, which the caches above hand out once per cell. */
    const perBlock = <T>(answer: (block: HookBlock) => T): ((block: HookBlock) => T) => {
        const answers = new Map<HookBlock, T>();
        return (block) => {
            if (answers.has(block)) return answers.get(block) as T;
            const value = answer(block);
            answers.set(block, value);
            return value;
        };
    };
    const getLiquid = world.getLiquid;
    const isFullCubeOf = world.isFullCube;
    const reactionOf = world.liquidReactionOf;
    // The prototype keeps every other action the host's world answers, bound to the host as before.
    const view: WorldActions = Object.create(world);
    view.getBlock = (at) => remembered(blocks, at, (position) => world.getBlock(position));
    if (getLiquid !== undefined)
        view.getLiquid = (at) => remembered(liquids, at, (position) => getLiquid.call(world, position));
    if (isFullCubeOf !== undefined) view.isFullCube = perBlock((block) => isFullCubeOf.call(world, block));
    if (reactionOf !== undefined) view.liquidReactionOf = perBlock((block) => reactionOf.call(world, block));
    return { view, keyOf };
};

/** Finds the lowest-scoring horizontal routes toward holes below the fluid. */
const fluidSpreadDirections = (
    host: WorldActions,
    at: BlockPosition,
    kind: LiquidState['kind'],
    dimension: string
): Map<Extract<BlockFace, 'north' | 'south' | 'east' | 'west'>, LiquidState> => {
    const { view: world, keyOf } = searchView(host, at);
    const rates = ratesFor(kind, dimension);
    const result = new Map<Extract<BlockFace, 'north' | 'south' | 'east' | 'west'>, LiquidState>();
    const search: SlopeSearch = { keyOf, holes: new Map(), branches: new Map() };
    let lowest = 1000;

    for (const direction of HORIZONTAL_FACES) {
        const testAt = offset(at, direction);
        if (!canMaybePassThrough(world, at, testAt, kind)) continue;
        const next = newLiquidAt(world, testAt, kind, dimension);
        if (next === undefined) continue;

        const distance = isHoleIn(search, world, testAt, kind)
            ? 0
            : slopeDistance(world, testAt, 1, opposite(direction), kind, rates.slopeFindDistance, search);
        if (distance < lowest) result.clear();
        if (distance <= lowest) {
            if (canBeReplacedWith(fluidAt(world, testAt), kind, direction)) {
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
        if (holdsWater(world, neighborAt)) {
            const becomes = state.source ? OBSIDIAN : direction === 'down' ? STONE : COBBLESTONE;
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
        const reaction = liquidReaction(world, existing);
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
        if (isSourceOf(fluidAt(world, offset(at, direction)), kind)) count++;
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
        if (canBeReplacedWith(fluidAt(world, belowAt), state.kind, 'down')) {
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
    if (block === undefined || !canFluidOccupy(world, block)) return false;
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
