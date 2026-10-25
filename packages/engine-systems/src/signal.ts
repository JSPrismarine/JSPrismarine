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
import {
    BUTTON_PRESSED_STATE,
    COMPARATOR,
    LEVER,
    LEVER_OPEN_STATE,
    OBSERVER,
    OBSERVER_POWERED_STATE,
    REDSTONE_BLOCK,
    REDSTONE_TORCH,
    REDSTONE_WIRE,
    REPEATER,
    SIGNAL_STATE,
    attachmentOf,
    booleanState,
    connectedDirectionOf,
    facingOf,
    isButton,
    isDaylightDetector,
    isDiode,
    isPressurePlate,
    isRepeater,
    numberState
} from './components';
import type { BlockPosition, BlockRef, Direction, WorldAccess } from './world';
import { DIRECTIONS, opposite, relative } from './world';

/** The strongest signal redstone carries, which is Java's `Redstone.SIGNAL_MAX`. */
export const SIGNAL_MAX = 15;

/** No signal, which is Java's `Redstone.SIGNAL_NONE`. */
export const SIGNAL_NONE = 0;

/**
 * How a read of the power model is scoped.
 *
 * `suppressWire` reproduces the `shouldSignal` flag `RedstoneWireBlock` flips
 * off around `getBestNeighborSignal` so that a wire computing its own power
 * does not count the power of the wire next to it as a block signal. Without
 * it every wire would read 15 from its neighbor and dust would never fall off.
 */
export interface SignalOptions {
    readonly suppressWire?: boolean;
}

/** The dust power a wire carries, or 0 for anything that is not wire. */
export const wirePowerOf = (block: BlockRef): number =>
    block.name === REDSTONE_WIRE ? numberState(block, SIGNAL_STATE) : 0;

/**
 * Java's `BlockState.getOwnSignal`: the power a block emits before any
 * direction is taken into account.
 */
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
    if (isButton(name) || isPressurePlate(name) || isDaylightDetector(name) || isDiode(name)) return true;
    return false;
};

/**
 * Whether a wire next to this block connects to it, Java's
 * `shouldRedstoneWireConnectTo`.
 *
 * @param block - The block the wire is looking at.
 * @param direction - The direction from the wire toward the block.
 */
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
 * Java's `BlockState.getSignal`: the weak power one block hands the neighbor
 * on the far side of `direction`.
 */
export const weakSignalOf = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    options: SignalOptions = {}
): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) {
        // `RedstoneWireBlock.getSignal` returns nothing while `shouldSignal` is off.
        if (options.suppressWire === true || direction === 'down') return SIGNAL_NONE;
        const power = numberState(block, SIGNAL_STATE);
        if (power === 0) return SIGNAL_NONE;
        if (direction === 'up') return power;
        return wireConnectsOnSide(world, at, opposite(direction)) ? power : SIGNAL_NONE;
    }

    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        // A torch powers everything but the block holding it up.
        return direction === opposite(attachmentOf(block)) ? SIGNAL_NONE : ownSignalOf(world, at, block);
    }

    if (isDiode(name)) return facingOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    if (name === OBSERVER) return facingOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;

    return ownSignalOf(world, at, block);
};

/**
 * Java's `BlockState.getDirectSignal`: the strong power one block hands the
 * neighbor on the far side of `direction`, which a conductor then re-emits.
 */
export const strongSignalOf = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    options: SignalOptions = {}
): number => {
    const block = world.getBlock(at);
    const { name } = block;

    if (name === REDSTONE_WIRE) {
        return options.suppressWire === true ? SIGNAL_NONE : weakSignalOf(world, at, direction, options);
    }
    if (name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit) {
        // A torch strongly powers only the block above it.
        return direction === 'down' ? weakSignalOf(world, at, direction, options) : SIGNAL_NONE;
    }
    if (name === LEVER || isButton(name)) {
        return connectedDirectionOf(block) === direction ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    }
    if (isPressurePlate(name)) return direction === 'up' ? ownSignalOf(world, at, block) : SIGNAL_NONE;
    if (isDiode(name) || name === OBSERVER) return weakSignalOf(world, at, direction, options);

    return SIGNAL_NONE;
};

/** Java's `SignalGetter.getDirectSignalTo`: the strongest strong power at a position. */
export const directSignalTo = (world: WorldAccess, at: BlockPosition, options: SignalOptions = {}): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        best = Math.max(best, strongSignalOf(world, relative(at, direction), direction, options));
        if (best >= SIGNAL_MAX) return SIGNAL_MAX;
    }
    return best;
};

/**
 * Java's `SignalGetter.getSignal`: the power the block at `at` hands its
 * neighbor across `direction`, including the strong power it picked up from
 * elsewhere when it is a conductor.
 */
export const signalAt = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    options: SignalOptions = {}
): number => {
    const signal = weakSignalOf(world, at, direction, options);
    if (!isRedstoneConductor(world.getBlock(at))) return signal;
    return Math.max(signal, directSignalTo(world, at, options));
};

/**
 * Java's `SignalGetter.getBestNeighborSignal`: the strongest power reaching a
 * position from any of its six neighbors.
 *
 * The scan stops at the first 15, which is why the direction order matters.
 */
export const bestNeighborSignal = (world: WorldAccess, at: BlockPosition, options: SignalOptions = {}): number => {
    let best = SIGNAL_NONE;
    for (const direction of DIRECTIONS) {
        const signal = signalAt(world, relative(at, direction), direction, options);
        if (signal >= SIGNAL_MAX) return SIGNAL_MAX;
        if (signal > best) best = signal;
    }
    return best;
};

/** Java's `SignalGetter.hasNeighborSignal`: whether any neighbor powers a position. */
export const hasNeighborSignal = (world: WorldAccess, at: BlockPosition, options: SignalOptions = {}): boolean => {
    for (const direction of DIRECTIONS) {
        if (signalAt(world, relative(at, direction), direction, options) > 0) return true;
    }
    return false;
};

/** Java's `SignalGetter.hasSignal` for one direction. */
export const hasSignal = (world: WorldAccess, at: BlockPosition, direction: Direction): boolean =>
    signalAt(world, at, direction) > 0;

/**
 * Java's `SignalGetter.getControlInputSignal`: what a diode reads from its two
 * sides.
 *
 * A repeater passes `onlyDiodes`, so only another repeater or comparator can
 * lock it. A comparator does not, so a block of redstone and dust both count on
 * its sides, which is the Java-only side-input rule the README lists.
 */
export const controlInputSignal = (
    world: WorldAccess,
    at: BlockPosition,
    direction: Direction,
    onlyDiodes: boolean
): number => {
    const block = world.getBlock(at);
    if (onlyDiodes) return isDiode(block.name) ? strongSignalOf(world, at, direction) : SIGNAL_NONE;
    if (block.name === REDSTONE_BLOCK) return SIGNAL_MAX;
    if (block.name === REDSTONE_WIRE) return numberState(block, SIGNAL_STATE);
    return isSignalSource(block) ? strongSignalOf(world, at, direction) : SIGNAL_NONE;
};

/**
 * Whether a wire at `at` connects on one of its four sides, which decides who
 * it hands its power to.
 *
 * Java keeps the answer in the wire's `north`, `east`, `south` and `west`
 * states and recomputes it in `getConnectionState`. This package recomputes it
 * on every read instead of storing it, because the four states exist for the
 * client's model and the Bedrock client draws its own.
 */
export const wireConnectsOnSide = (world: WorldAccess, at: BlockPosition, side: Direction): boolean => {
    if (side === 'up' || side === 'down') return false;
    const canConnectUp = !isRedstoneConductor(world.getBlock(relative(at, 'up')));
    const neighborPos = relative(at, side);
    const neighbor = world.getBlock(neighborPos);

    if (canConnectUp && hasSturdyTopFace(neighbor)) {
        // `getConnectingSide`: dust climbs a block when nothing covers this one.
        if (connectsToWire(world.getBlock(relative(neighborPos, 'up')), undefined)) return true;
    }
    if (connectsToWire(neighbor, side)) return true;
    if (isRedstoneConductor(neighbor)) return false;
    return connectsToWire(world.getBlock(relative(neighborPos, 'down')), undefined);
};
