/**
 * The power model the redstone family and everything a signal reaches share.
 *
 * The world answers how much power reaches a position; this module turns
 * that into the decisions a block makes: whether it is on, what a wire's own
 * signal becomes, and how long a pulse lasts.
 */
import type { BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { BLOCK_FACES } from '@jsprismarine/blocks';

import { HORIZONTAL_FACES, offset } from '../geometry';
import { bareName, stateNumber } from '../state';
import type { WorldActions } from '../world';

/** The strongest signal redstone carries. */
export const MAX_POWER = 15;

/** Game ticks in one redstone tick, which is what a repeater delay counts. */
export const REDSTONE_TICK = 2;

/** How long a button stays pressed, by material, in game ticks. */
export const BUTTON_PRESS_TICKS: Readonly<Record<'wooden' | 'stone', number>> = { wooden: 30, stone: 20 };

/** How long a pressure plate waits before it checks for an empty plate again. */
export const PRESSURE_PLATE_RELEASE_TICKS = 20;

/** How long an observer holds its pulse, in game ticks. */
export const OBSERVER_PULSE_TICKS = 2;

/** The strongest power reaching a position from itself or any of its six faces. */
export const incomingPower = (world: WorldActions, position: BlockPosition): number => {
    let power = world.redstonePower(position);
    for (const face of BLOCK_FACES) power = Math.max(power, world.redstonePower(offset(position, face)));
    return power;
};

/** Whether any power reaches a position. */
export const isPowered = (world: WorldActions, position: BlockPosition): boolean => incomingPower(world, position) > 0;

const REDSTONE_WIRE = 'redstone_wire';

/** A wire's own signal, or nothing for any other block. */
const wireStrengthAt = (world: WorldActions, position: BlockPosition): number => {
    const block = world.getBlock(position);
    return block !== undefined && bareName(block.identifier) === REDSTONE_WIRE
        ? stateNumber(block, 'redstone_signal')
        : 0;
};

/**
 * The strongest wire a wire connects to, less one.
 *
 * A wire reaches the wires beside it, the wire on top of a conductor beside it unless a conductor
 * sits on top of it and cuts that step off, and the wire below a block beside it that does not
 * conduct.
 *
 * @javaSource RedstoneWireEvaluator.getIncomingWireSignal
 */
const incomingWireSignal = (world: WorldActions, position: BlockPosition): number => {
    const conducts = (at: BlockPosition): boolean => world.redstoneConductor?.(at) ?? false;
    const coveredAbove = conducts(offset(position, 'up'));
    let signal = 0;
    for (const face of HORIZONTAL_FACES) {
        const side = offset(position, face);
        signal = Math.max(signal, wireStrengthAt(world, side));
        if (conducts(side)) {
            if (!coveredAbove) signal = Math.max(signal, wireStrengthAt(world, offset(side, 'up')));
        } else {
            signal = Math.max(signal, wireStrengthAt(world, offset(side, 'down')));
        }
    }
    return Math.max(0, signal - 1);
};

/**
 * The signal a wire takes from its surroundings: the power other blocks give it, or the strongest
 * wire it connects to less one, whichever is more, so a run fades over fifteen blocks.
 *
 * The block power leaves every wire out ({@link WorldActions.redstonePowerToWire}). Counting a
 * wire there at its full strength would let two wires keep each other lit after their source went.
 *
 * @javaSource DefaultRedstoneWireEvaluator.calculateTargetStrength
 */
export const wireSignal = (world: WorldActions, block: HookBlock): number => {
    const blockSignal = world.redstonePowerToWire?.(block.position) ?? world.redstonePower(block.position);
    if (blockSignal >= MAX_POWER) return MAX_POWER;
    return Math.max(blockSignal, incomingWireSignal(world, block.position));
};

/**
 * The analog signal a weighted pressure plate puts out.
 *
 * @param entities - How many entities stand on the plate.
 * @param perSignal - Entities per step: 1 for the light plate, 10 for the heavy one.
 */
export const weightedPlateSignal = (entities: number, perSignal: number): number =>
    Math.min(MAX_POWER, Math.ceil(entities / perSignal));
