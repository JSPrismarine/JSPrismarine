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
 */

import { hasSturdyTopFace, isRedstoneConductor } from './blockRules';
import type { BlockPosition, BlockRef, Direction, WorldAccess } from './world';
import { DIRECTIONS, opposite, relative } from './world';

const BUTTON_PRESSED_STATE = 'button_pressed_bit';
const LEVER_OPEN_STATE = 'open_bit';
const OBSERVER_POWERED_STATE = 'powered_bit';
const SIGNAL_STATE = 'redstone_signal';
const FACING_STATE = 'facing_direction';
const ATTACHMENT_STATE = 'attachment_face';
const REDSTONE_WIRE = 'minecraft:redstone_wire';
const REDSTONE_BLOCK = 'minecraft:redstone_block';
const REDSTONE_TORCH = { lit: 'minecraft:redstone_torch', unlit: 'minecraft:unlit_redstone_torch' } as const;
const REPEATER = { powered: 'minecraft:powered_repeater', unpowered: 'minecraft:unpowered_repeater' } as const;
const COMPARATOR = { powered: 'minecraft:powered_comparator', unpowered: 'minecraft:unpowered_comparator' } as const;
const OBSERVER = 'minecraft:observer';
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
const attachmentOf = (block: BlockRef): Direction => directionState(block, ATTACHMENT_STATE, 'down');
const connectedDirectionOf = (block: BlockRef): Direction => opposite(attachmentOf(block));
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
    if (name === REPEATER.powered) return SIGNAL_MAX;
    if (name === COMPARATOR.powered) return world.getBlockEntityData(at)?.comparatorOutput ?? SIGNAL_NONE;
    return SIGNAL_NONE;
};

/** Java's `BlockState.isSignalSource`. */
export const isSignalSource = (block: BlockRef): boolean => {
    const { name } = block;
    if (name === REDSTONE_WIRE || name === REDSTONE_BLOCK || name === OBSERVER || name === LEVER) return true;
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

/** Java's `BlockState.getSignal`: the weak power a block gives one neighbor. */
export const weakSignalOf = (world: WorldAccess, at: BlockPosition, direction: Direction): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) {
        if (direction === 'down') return SIGNAL_NONE;
        const power = numberState(block, SIGNAL_STATE);
        if (power === 0) return SIGNAL_NONE;
        if (direction === 'up') return power;
        return wireConnectsOnSide(world, at, opposite(direction)) ? power : SIGNAL_NONE;
    }

    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        return direction === opposite(attachmentOf(block)) ? SIGNAL_NONE : ownSignalOf(world, at, block);
    }

    if (isDiode(name) || name === OBSERVER) {
        return facingOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    }

    return ownSignalOf(world, at, block);
};

/** Java's `BlockState.getDirectSignal`: the strong power a block gives one neighbor. */
export const strongSignalOf = (world: WorldAccess, at: BlockPosition, direction: Direction): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) return weakSignalOf(world, at, direction);
    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        return direction === 'down' ? weakSignalOf(world, at, direction) : SIGNAL_NONE;
    }
    if (name === LEVER || isButton(name)) {
        return connectedDirectionOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    }
    if (isPressurePlate(name)) return direction === 'up' ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    if (isDiode(name) || name === OBSERVER) return weakSignalOf(world, at, direction);
    return SIGNAL_NONE;
};

/** Java's `SignalGetter.getDirectSignalTo`: the strongest strong power at a position. */
export const directSignalTo = (world: WorldAccess, at: BlockPosition): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        best = Math.max(best, strongSignalOf(world, relative(at, direction), direction));
        if (best >= SIGNAL_MAX) return SIGNAL_MAX;
    }
    return best;
};

/** The power a block gives its neighbor, including power re-emitted by a conductor. */
export const signalAt = (world: WorldAccess, at: BlockPosition, direction: Direction): number => {
    const signal = weakSignalOf(world, at, direction);
    if (!isRedstoneConductor(world.getBlock(at))) return signal;
    return Math.max(signal, directSignalTo(world, at));
};

/** Java's `SignalGetter.getBestNeighborSignal`: the strongest power reaching a position. */
export const bestNeighborSignal = (world: WorldAccess, at: BlockPosition): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        const signal = signalAt(world, relative(at, direction), direction);
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

/** Whether a wire connects along one horizontal side. */
export const wireConnectsOnSide = (world: WorldAccess, at: BlockPosition, side: Direction): boolean => {
    if (side === 'up' || side === 'down') return false;
    const canConnectUp = !isRedstoneConductor(world.getBlock(relative(at, 'up')));
    const neighborPos = relative(at, side);
    const neighbor = world.getBlock(neighborPos);

    if (canConnectUp && hasSturdyTopFace(neighbor)) {
        if (connectsToWire(world.getBlock(relative(neighborPos, 'up')), undefined)) return true;
    }
    if (connectsToWire(neighbor, side)) return true;
    if (isRedstoneConductor(neighbor)) return false;
    return connectsToWire(world.getBlock(relative(neighborPos, 'down')), undefined);
};
