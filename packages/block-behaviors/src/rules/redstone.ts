/**
 * The power model the redstone family and everything a signal reaches share.
 *
 * The world answers how much power reaches a position; this module turns
 * that into the decisions a block makes: whether it is on, what a wire's own
 * signal becomes, and how long a pulse lasts.
 */
import type { BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { BLOCK_FACES } from '@jsprismarine/blocks';

import { offset } from '../geometry';
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

/**
 * The signal a wire takes from its surroundings.
 *
 * A wire one block from a source carries one less than the source, so a run
 * fades over fifteen blocks. A neighboring wire contributes its own signal
 * minus one; a power source contributes its full strength.
 */
export const wireSignal = (world: WorldActions, block: HookBlock): number => {
    let signal = world.redstonePower(block.position);
    for (const face of BLOCK_FACES) {
        const position = offset(block.position, face);
        const neighbor = world.getBlock(position);
        if (neighbor !== undefined && bareName(neighbor.identifier) === 'redstone_wire') {
            signal = Math.max(signal, stateNumber(neighbor, 'redstone_signal') - 1);
            continue;
        }
        signal = Math.max(signal, world.redstonePower(position) - 1);
    }
    return Math.min(Math.max(signal, 0), MAX_POWER);
};

/**
 * The analog signal a weighted pressure plate puts out.
 *
 * @param entities - How many entities stand on the plate.
 * @param perSignal - Entities per step: 1 for the light plate, 10 for the heavy one.
 */
export const weightedPlateSignal = (entities: number, perSignal: number): number =>
    Math.min(MAX_POWER, Math.ceil(entities / perSignal));
