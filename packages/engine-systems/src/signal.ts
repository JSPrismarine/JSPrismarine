/**
 * The redstone power model: who emits what, and how it reaches a position.
 *
 * Transcribed from `net.minecraft.world.level.SignalGetter` and the per-block
 * `getSignal`, `getDirectSignal`, `ownSignal` and `shouldRedstoneWireConnectTo`
 * overrides in the 26.3 server jar. Power runs 0 to 15, and every function here
 * is a pure read: nothing in this file writes a block.
 *
 * The direction argument throughout is Java's: a query about the block at
 * `target.relative(d)` passes `d`, so `d` points from the block being powered
 * toward the block doing the powering.
 *
 * The `wiresSignal` argument is Java's `RedstoneWireBlock.shouldSignal`. A wire
 * working out its own strength turns it off, so that no wire, and no block a
 * wire powers, counts toward it; a wire only takes power from another wire
 * through the one-less rule in `RedstoneWireEvaluator.getIncomingWireSignal`.
 */

import { hasSturdyTopFace, isFullCube, isRedstoneConductor } from './blockRules';
import type { BlockPosition, BlockRef, Direction, HorizontalDirection, WorldAccess } from './world';
import { DIRECTIONS, clockWise, counterClockWise, opposite, relative } from './world';

const BUTTON_PRESSED_STATE = 'button_pressed_bit';
const LEVER_OPEN_STATE = 'open_bit';
const LEVER_DIRECTION_STATE = 'lever_direction';
const OBSERVER_POWERED_STATE = 'powered_bit';
const SIGNAL_STATE = 'redstone_signal';
const FACING_STATE = 'facing_direction';
const TORCH_FACING_STATE = 'torch_facing_direction';
const REDSTONE_WIRE = 'minecraft:redstone_wire';
const REDSTONE_BLOCK = 'minecraft:redstone_block';
const REDSTONE_TORCH = { lit: 'minecraft:redstone_torch', unlit: 'minecraft:unlit_redstone_torch' } as const;
const REPEATER = { powered: 'minecraft:powered_repeater', unpowered: 'minecraft:unpowered_repeater' } as const;
const COMPARATOR = { powered: 'minecraft:powered_comparator', unpowered: 'minecraft:unpowered_comparator' } as const;
const OBSERVER = 'minecraft:observer';
/** Java's `DetectorRailBlock`, which keeps its `POWERED` in Bedrock's `rail_data_bit`. */
const DETECTOR_RAIL = 'minecraft:detector_rail';
const RAIL_POWERED_STATE = 'rail_data_bit';
const LEVER = 'minecraft:lever';
const DIRECTIONS_BY_NAME: Readonly<Record<string, Direction | undefined>> = {
    down: 'down',
    up: 'up',
    north: 'north',
    south: 'south',
    west: 'west',
    east: 'east'
};

const numberState = (block: BlockRef, state: string): number => {
    const value = block.states[state];
    return typeof value === 'number' ? value : 0;
};

const booleanState = (block: BlockRef, state: string): boolean => {
    const value = block.states[state];
    return value === true || value === 1;
};

const directionState = (block: BlockRef, state: string, fallback: Direction): Direction => {
    const value = block.states[state];
    const direction = typeof value === 'string' ? DIRECTIONS_BY_NAME[value] : undefined;
    return direction ?? fallback;
};

const facingOf = (block: BlockRef): Direction => directionState(block, FACING_STATE, 'north');

/**
 * Bedrock's `facing_direction` values, in its order: 0 is down and 5 is east. A button's names the
 * face it points out of, away from the block it is mounted on.
 */
const FACING_DIRECTION_VALUES: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east'];

/**
 * The direction from a redstone torch to the block it stands on or hangs from.
 *
 * Bedrock's `torch_facing_direction` names that direction itself for a wall torch, the opposite of
 * Java's `facing`, which is why the generated state vocabulary swaps north with south and west with
 * east. A torch on the floor says `top`, or `unknown` before it is placed, and rests on the block
 * below.
 */
const torchSupportOf = (block: BlockRef): Direction => directionState(block, TORCH_FACING_STATE, 'down');
/**
 * The direction from a lever's support block to the lever, which is the one way it powers that
 * block strongly. Bedrock names it in `lever_direction`: a wall lever by the way it faces, and a
 * floor or ceiling lever by the axis it swings on.
 */
const leverConnectedDirection = (block: BlockRef): Direction => {
    const value = block.states[LEVER_DIRECTION_STATE];
    if (typeof value !== 'string') return 'up';
    if (value.startsWith('up_')) return 'up';
    if (value.startsWith('down_')) return 'down';
    return DIRECTIONS_BY_NAME[value] ?? 'up';
};

/**
 * The direction from a button's support block to the button, which is the one way it powers that
 * block strongly. A floor button faces up and a ceiling button down, as Java's connected direction
 * does; a wall button faces the way it points out of its wall.
 */
const buttonConnectedDirection = (block: BlockRef): Direction => {
    const value = block.states[FACING_STATE];
    return (typeof value === 'number' ? FACING_DIRECTION_VALUES[value] : undefined) ?? 'up';
};

const connectedDirectionOf = (block: BlockRef): Direction =>
    block.name === LEVER ? leverConnectedDirection(block) : buttonConnectedDirection(block);
const isButton = (name: string): boolean => name.endsWith('_button');
const isPressurePlate = (name: string): boolean => name.endsWith('_pressure_plate');
const isDaylightDetector = (name: string): boolean =>
    name === 'minecraft:daylight_detector' || name === 'minecraft:daylight_detector_inverted';
const isRepeater = (name: string): boolean => name === REPEATER.powered || name === REPEATER.unpowered;
const isComparator = (name: string): boolean => name === COMPARATOR.powered || name === COMPARATOR.unpowered;
const isDiode = (name: string): boolean => isRepeater(name) || isComparator(name);

/** The strongest signal redstone carries, which is Java's `Redstone.SIGNAL_MAX`. */
export const SIGNAL_MAX = 15;

/** No signal, which is Java's `Redstone.SIGNAL_NONE`. */
export const SIGNAL_NONE = 0;

/** Java's `BlockState.getOwnSignal`: the power a block emits before direction is considered. */
export const ownSignalOf = (world: WorldAccess, at: BlockPosition, block: BlockRef): number => {
    const { name } = block;
    if (name === REDSTONE_WIRE) return numberState(block, SIGNAL_STATE);
    if (name === REDSTONE_BLOCK) return SIGNAL_MAX;
    if (name === REDSTONE_TORCH.lit) return SIGNAL_MAX;
    if (name === REDSTONE_TORCH.unlit) return SIGNAL_NONE;
    if (name === LEVER) return booleanState(block, LEVER_OPEN_STATE) ? SIGNAL_MAX : SIGNAL_NONE;
    if (isButton(name)) return booleanState(block, BUTTON_PRESSED_STATE) ? SIGNAL_MAX : SIGNAL_NONE;
    if (isPressurePlate(name) || isDaylightDetector(name)) return numberState(block, SIGNAL_STATE);
    if (name === OBSERVER) return booleanState(block, OBSERVER_POWERED_STATE) ? SIGNAL_MAX : SIGNAL_NONE;
    if (name === DETECTOR_RAIL) return booleanState(block, RAIL_POWERED_STATE) ? SIGNAL_MAX : SIGNAL_NONE;
    if (name === REPEATER.powered) return SIGNAL_MAX;
    if (name === COMPARATOR.powered) return world.getBlockEntityData(at)?.comparatorOutput ?? SIGNAL_NONE;
    return SIGNAL_NONE;
};

/** Java's `BlockState.isSignalSource`. */
export const isSignalSource = (block: BlockRef): boolean => {
    const { name } = block;
    if (name === REDSTONE_WIRE || name === REDSTONE_BLOCK || name === OBSERVER || name === LEVER) return true;
    if (name === DETECTOR_RAIL) return true;
    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) return true;
    return isButton(name) || isPressurePlate(name) || isDaylightDetector(name) || isDiode(name);
};

/** Whether a wire next to a block connects to it, Java's `shouldRedstoneWireConnectTo`. */
export const connectsToWire = (block: BlockRef, direction: Direction | undefined): boolean => {
    if (block.name === REDSTONE_WIRE) return true;
    if (isRepeater(block.name)) {
        const facing = facingOf(block);
        return facing === direction || opposite(facing) === direction;
    }
    if (block.name === OBSERVER) return direction === facingOf(block);
    return isSignalSource(block) && direction !== undefined;
};

/**
 * Java's `BlockState.getSignal`: the weak power a block gives one neighbor.
 *
 * @javaSee RedstoneWireBlock.getSignal
 * @param wiresSignal - False while a wire works out its own strength, which silences every wire.
 */
export const weakSignalOf = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    wiresSignal = true
): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) {
        if (!wiresSignal || direction === 'down') return SIGNAL_NONE;
        const power = numberState(block, SIGNAL_STATE);
        if (power === 0) return SIGNAL_NONE;
        if (direction === 'up') return power;
        // Read from the neighbors rather than from the wire's stored shape, so a wire saved before
        // the shape was written, or by a host that never writes it, still powers what it points into.
        const side = opposite(direction);
        if (side === 'up' || side === 'down') return SIGNAL_NONE;
        return wireShapeOf(world, at)[side] === 'none' ? SIGNAL_NONE : power;
    }

    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        return direction === opposite(torchSupportOf(block)) ? SIGNAL_NONE : ownSignalOf(world, at, block);
    }

    if (isDiode(name) || name === OBSERVER) {
        return facingOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    }

    return ownSignalOf(world, at, block);
};

/** Java's `BlockState.getDirectSignal`: the strong power a block gives one neighbor. */
export const strongSignalOf = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    wiresSignal = true
): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) return weakSignalOf(world, at, direction, wiresSignal);
    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        return direction === 'down' ? weakSignalOf(world, at, direction) : SIGNAL_NONE;
    }
    if (name === LEVER || isButton(name)) {
        return connectedDirectionOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    }
    // Both power the block they rest on strongly, `getDirectSignal` with `Direction.UP`.
    if (isPressurePlate(name) || name === DETECTOR_RAIL)
        return direction === 'up' ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    if (isDiode(name) || name === OBSERVER) return weakSignalOf(world, at, direction);
    return SIGNAL_NONE;
};

/** Java's `SignalGetter.getDirectSignalTo`: the strongest strong power at a position. */
export const directSignalTo = (world: WorldAccess, at: BlockPosition, wiresSignal = true): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        best = Math.max(best, strongSignalOf(world, relative(at, direction), direction, wiresSignal));
        if (best >= SIGNAL_MAX) return SIGNAL_MAX;
    }
    return best;
};

/** The power a block gives its neighbor, including power re-emitted by a conductor. */
export const signalAt = (world: WorldAccess, at: BlockPosition, direction: Direction, wiresSignal = true): number => {
    const signal = weakSignalOf(world, at, direction, wiresSignal);
    if (!isRedstoneConductor(world.getBlock(at))) return signal;
    return Math.max(signal, directSignalTo(world, at, wiresSignal));
};

/** Java's `SignalGetter.getBestNeighborSignal`: the strongest power reaching a position. */
export const bestNeighborSignal = (world: WorldAccess, at: BlockPosition, wiresSignal = true): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        const signal = signalAt(world, relative(at, direction), direction, wiresSignal);
        if (signal >= SIGNAL_MAX) return SIGNAL_MAX;
        if (signal > best) best = signal;
    }
    return best;
};

/** Java's `SignalGetter.hasNeighborSignal`: whether any neighbor powers a position. */
export const hasNeighborSignal = (world: WorldAccess, at: BlockPosition): boolean => {
    for (const direction of DIRECTIONS) {
        if (signalAt(world, relative(at, direction), direction) > 0) return true;
    }
    return false;
};

/** Java's `SignalGetter.hasSignal` for one direction. */
export const hasSignal = (world: WorldAccess, at: BlockPosition, direction: Direction): boolean =>
    signalAt(world, at, direction) > 0;

/**
 * The power reaching a wire from everything but other wires, Java's `RedstoneWireBlock.getBlockSignal`.
 *
 * @javaSee RedstoneWireBlock.getBlockSignal
 */
export const blockSignalToWire = (world: WorldAccess, at: BlockPosition): number =>
    bestNeighborSignal(world, at, false);

/**
 * How a wire meets one horizontal side, Java's `RedstoneSide`: not at all, along the ground, or
 * up the face of the block beside it to a wire on top. Bedrock's `redstone_<side>` states take the
 * same three values.
 */
export type WireSide = 'none' | 'side' | 'up';

/** A wire's shape: how it meets each of its four horizontal sides. */
export type WireShape = Readonly<Record<HorizontalDirection, WireSide>>;

/**
 * How a wire connects along one horizontal side before its shape fills in where a run ends.
 *
 * Java's `isFaceSturdy` on the face toward the wire is read as a full cube, which is what turns a
 * climb into `up`; a slab or stair beside the wire draws `side` there instead.
 *
 * @javaSee RedstoneWireBlock.getConnectingSide
 */
export const wireConnectingSide = (world: WorldAccess, at: BlockPosition, side: HorizontalDirection): WireSide => {
    const canConnectUp = !isRedstoneConductor(world.getBlock(relative(at, 'up')));
    const neighborPos = relative(at, side);
    const neighbor = world.getBlock(neighborPos);

    if (canConnectUp && hasSturdyTopFace(neighbor)) {
        if (connectsToWire(world.getBlock(relative(neighborPos, 'up')), undefined))
            return isFullCube(neighbor) ? 'up' : 'side';
    }
    if (connectsToWire(neighbor, side)) return 'side';
    if (isRedstoneConductor(neighbor)) return 'none';
    return connectsToWire(world.getBlock(relative(neighborPos, 'down')), undefined) ? 'side' : 'none';
};

/**
 * A wire's shape, which is also the sides it powers.
 *
 * A wire meets each side it connects to, and also points along any side whose two perpendicular
 * sides both connect to nothing: a lone wire is a cross that powers all four sides, and a wire
 * connected on one side also points out of the opposite one, where a run ends. Java's player can
 * click a lone wire into a dot that powers nothing beside it; Bedrock has no such toggle, so a
 * wire here is always the cross Java places.
 *
 * @javaSee RedstoneWireBlock.getConnectionState
 */
export const wireShapeOf = (world: WorldAccess, at: BlockPosition): WireShape => {
    const connected = {
        north: wireConnectingSide(world, at, 'north'),
        south: wireConnectingSide(world, at, 'south'),
        west: wireConnectingSide(world, at, 'west'),
        east: wireConnectingSide(world, at, 'east')
    };
    const points = (side: HorizontalDirection): WireSide => {
        if (connected[side] !== 'none') return connected[side];
        const crossAxisFree = connected[clockWise(side)] === 'none' && connected[counterClockWise(side)] === 'none';
        return crossAxisFree ? 'side' : 'none';
    };
    return { north: points('north'), south: points('south'), west: points('west'), east: points('east') };
};

/** Whether a wire connects along one horizontal side. */
export const wireConnectsOnSide = (world: WorldAccess, at: BlockPosition, side: Direction): boolean =>
    side !== 'up' && side !== 'down' && wireConnectingSide(world, at, side) !== 'none';
