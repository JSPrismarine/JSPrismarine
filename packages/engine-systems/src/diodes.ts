/**
 * Repeaters, comparators and observers.
 *
 * `DiodeBlock`, `RepeaterBlock`, `ComparatorBlock` and `ObserverBlock` from the
 * 26.3 jar. The numbers come from there: a repeater's delay is its `DELAY`
 * state times 2 game ticks, a comparator's is a flat 2, and an observer's pulse
 * is 2 ticks of 15.
 */

import { isRedstoneConductor } from './blockRules';
import {
    COMPARATOR,
    COMPARATOR_SUBTRACT_STATE,
    OBSERVER,
    OBSERVER_POWERED_STATE,
    REPEATER,
    REPEATER_DELAY_STATE,
    booleanState,
    facingOf,
    isComparator,
    isDiode,
    isRepeater,
    numberState
} from './components';
import type { NeighborUpdates } from './neighborUpdates';
import { TICK_PRIORITIES } from './scheduler';
import { SIGNAL_MAX, SIGNAL_NONE, controlInputSignal, signalAt, wirePowerOf } from './signal';
import type { BlockPosition, BlockRef, Direction, WorldAccess } from './world';
import { clockWise, counterClockWise, opposite, relative } from './world';

/** A comparator's two modes, Java's `ComparatorMode`. */
export type ComparatorMode = 'compare' | 'subtract';

/** An observer's pulse length in game ticks, from `ObserverBlock.tick`. */
export const OBSERVER_PULSE_TICKS = 2;

/** A comparator's delay in game ticks, from `ComparatorBlock.getDelay`. */
export const COMPARATOR_DELAY_TICKS = 2;

const isHorizontal = (direction: Direction): direction is 'north' | 'south' | 'west' | 'east' =>
    direction !== 'up' && direction !== 'down';

/** A repeater's delay in game ticks: `RepeaterBlock.getDelay` is `DELAY * 2`. */
export const repeaterDelayTicks = (block: BlockRef): number => (numberState(block, REPEATER_DELAY_STATE) + 1) * 2;

/** The delay of either diode, in game ticks. */
export const diodeDelayTicks = (block: BlockRef): number =>
    isRepeater(block.name) ? repeaterDelayTicks(block) : COMPARATOR_DELAY_TICKS;

/** A comparator's mode, read from Bedrock's `output_subtract_bit`. */
export const comparatorModeOf = (block: BlockRef): ComparatorMode =>
    booleanState(block, COMPARATOR_SUBTRACT_STATE) ? 'subtract' : 'compare';

/** Whether a diode identifier is the powered one. */
export const diodeIsPowered = (block: BlockRef): boolean =>
    block.name === REPEATER.powered || block.name === COMPARATOR.powered;

const withPower = (block: BlockRef, powered: boolean): BlockRef => {
    const pair = isRepeater(block.name) ? REPEATER : COMPARATOR;
    return { name: powered ? pair.powered : pair.unpowered, states: block.states };
};

/**
 * `DiodeBlock.getInputSignal`: what a diode reads from the block behind it.
 *
 * A diode's facing points at its input, so the back is `facing` and the output
 * is the opposite way.
 */
export const diodeInputSignal = (world: WorldAccess, at: BlockPosition, block: BlockRef): number => {
    const facing = facingOf(block);
    const targetPos = relative(at, facing);
    const input = signalAt(world, targetPos, facing);
    if (input >= SIGNAL_MAX) return input;
    // Dust behind a diode feeds it even when the dust is not pointing at it.
    return Math.max(input, wirePowerOf(world.getBlock(targetPos)));
};

/**
 * `DiodeBlock.getAlternateSignal`: what a diode reads from its two sides.
 *
 * A repeater passes `sideInputDiodesOnly`, so only another diode locks it. A
 * comparator does not, so dust and a block of redstone both count.
 */
export const diodeSideSignal = (world: WorldAccess, at: BlockPosition, block: BlockRef): number => {
    const facing = facingOf(block);
    if (!isHorizontal(facing)) return SIGNAL_NONE;
    const onlyDiodes = isRepeater(block.name);
    const right = clockWise(facing);
    const left = counterClockWise(facing);
    return Math.max(
        controlInputSignal(world, relative(at, right), right, onlyDiodes),
        controlInputSignal(world, relative(at, left), left, onlyDiodes)
    );
};

/** `RepeaterBlock.isLocked`: a repeater with a diode powering either side. */
export const repeaterIsLocked = (world: WorldAccess, at: BlockPosition, block: BlockRef): boolean =>
    isRepeater(block.name) && diodeSideSignal(world, at, block) > 0;

/** `ComparatorBlock.getInputSignal`: the back signal, or a container's fill. */
export const comparatorInputSignal = (world: WorldAccess, at: BlockPosition, block: BlockRef): number => {
    let signal = diodeInputSignal(world, at, block);
    const facing = facingOf(block);
    let targetPos = relative(at, facing);
    let analog = world.getBlockEntityData(targetPos)?.analogOutput;
    if (analog !== undefined) return analog;

    if (signal < SIGNAL_MAX && isRedstoneConductor(world.getBlock(targetPos))) {
        // A comparator reads a container one block further through a conductor.
        targetPos = relative(targetPos, facing);
        analog = world.getBlockEntityData(targetPos)?.analogOutput;
        if (analog !== undefined) signal = analog;
    }

    return signal;
};

/** `ComparatorBlock.calculateOutputSignal`: compare passes through, subtract takes away. */
export const comparatorOutputSignal = (world: WorldAccess, at: BlockPosition, block: BlockRef): number => {
    const input = comparatorInputSignal(world, at, block);
    if (input === 0) return 0;
    const side = diodeSideSignal(world, at, block);
    if (side > input) return 0;
    return comparatorModeOf(block) === 'subtract' ? input - side : input;
};

/** `DiodeBlock.shouldTurnOn`, overridden by `ComparatorBlock`. */
export const diodeShouldTurnOn = (world: WorldAccess, at: BlockPosition, block: BlockRef): boolean => {
    if (!isComparator(block.name)) return diodeInputSignal(world, at, block) > 0;
    const input = comparatorInputSignal(world, at, block);
    if (input === 0) return false;
    const side = diodeSideSignal(world, at, block);
    if (input > side) return true;
    return input === side && comparatorModeOf(block) === 'compare';
};

/**
 * `DiodeBlock.shouldPrioritize`: a diode whose output runs into the back or
 * side of another diode ticks first, which is where tick priority comes from.
 */
export const diodeShouldPrioritize = (world: WorldAccess, at: BlockPosition, block: BlockRef): boolean => {
    const outputDirection = opposite(facingOf(block));
    const inFront = world.getBlock(relative(at, outputDirection));
    return isDiode(inFront.name) && facingOf(inFront) !== outputDirection;
};

/** The power a powered diode hands out, which a comparator computes. */
export const diodeOutputSignal = (world: WorldAccess, at: BlockPosition, block: BlockRef): number =>
    isComparator(block.name) ? (world.getBlockEntityData(at)?.comparatorOutput ?? 0) : SIGNAL_MAX;

/** `DiodeBlock.updateNeighborsInFront`: the output side and everything around it. */
export const updateDiodeNeighborsInFront = (updates: NeighborUpdates, at: BlockPosition, block: BlockRef): void => {
    const facing = facingOf(block);
    const frontPos = relative(at, opposite(facing));
    updates.neighborChanged(frontPos, block.name);
    updates.updateNeighborsAtExceptFromFacing(frontPos, block.name, facing);
};

/**
 * `DiodeBlock.checkTickOnNeighbor`, and `ComparatorBlock`'s override.
 *
 * The three repeater priorities are Java's: `EXTREMELY_HIGH` when the repeater
 * faces the back or side of another diode, `VERY_HIGH` when it is turning off,
 * and `HIGH` otherwise. A comparator uses `HIGH` when prioritized and `NORMAL`
 * otherwise.
 */
export const diodeNeighborChanged = (world: WorldAccess, at: BlockPosition, block: BlockRef): void => {
    if (isComparator(block.name)) {
        if (world.willTickThisTick('block', at, block.name)) return;
        const output = comparatorOutputSignal(world, at, block);
        const stored = world.getBlockEntityData(at)?.comparatorOutput ?? 0;
        if (output !== stored || diodeIsPowered(block) !== diodeShouldTurnOn(world, at, block)) {
            const priority = diodeShouldPrioritize(world, at, block) ? TICK_PRIORITIES.HIGH : TICK_PRIORITIES.NORMAL;
            world.scheduleTick('block', at, block.name, COMPARATOR_DELAY_TICKS, priority);
        }
        return;
    }

    if (repeaterIsLocked(world, at, block)) return;
    const on = diodeIsPowered(block);
    const shouldTurnOn = diodeShouldTurnOn(world, at, block);
    if (on === shouldTurnOn || world.willTickThisTick('block', at, block.name)) return;

    let priority: number = TICK_PRIORITIES.HIGH;
    if (diodeShouldPrioritize(world, at, block)) priority = TICK_PRIORITIES.EXTREMELY_HIGH;
    else if (on) priority = TICK_PRIORITIES.VERY_HIGH;

    world.scheduleTick('block', at, block.name, repeaterDelayTicks(block), priority);
};

/**
 * `DiodeBlock.tick` for a repeater.
 *
 * Turning on is what schedules the follow-up tick: a repeater that turns on
 * while its input has already gone away schedules its own turn-off, which is
 * how a pulse shorter than the delay still comes out at full length.
 */
export const repeaterTick = (updates: NeighborUpdates, world: WorldAccess, at: BlockPosition): void => {
    const block = world.getBlock(at);
    if (!isRepeater(block.name) || repeaterIsLocked(world, at, block)) return;

    const on = diodeIsPowered(block);
    const shouldTurnOn = diodeShouldTurnOn(world, at, block);
    if (on && !shouldTurnOn) {
        world.setBlock(at, withPower(block, false), false);
        updateDiodeNeighborsInFront(updates, at, block);
    } else if (!on) {
        world.setBlock(at, withPower(block, true), false);
        updateDiodeNeighborsInFront(updates, at, block);
        if (!shouldTurnOn) {
            world.scheduleTick('block', at, REPEATER.powered, repeaterDelayTicks(block), TICK_PRIORITIES.VERY_HIGH);
        }
    }
};

/** `ComparatorBlock.refreshOutputState`, which is its whole tick. */
export const comparatorTick = (updates: NeighborUpdates, world: WorldAccess, at: BlockPosition): void => {
    const block = world.getBlock(at);
    if (!isComparator(block.name)) return;

    const output = comparatorOutputSignal(world, at, block);
    const data = world.getBlockEntityData(at);
    const stored = data?.comparatorOutput ?? 0;
    world.setBlockEntityData(at, { ...data, comparatorOutput: output });

    if (stored === output && comparatorModeOf(block) !== 'compare') return;

    const shouldTurnOn = diodeShouldTurnOn(world, at, block);
    const isOn = diodeIsPowered(block);
    if (isOn !== shouldTurnOn) world.setBlock(at, withPower(block, shouldTurnOn), false);
    updateDiodeNeighborsInFront(updates, at, block);
};

/** `ObserverBlock.updateNeighborsInFront`: an observer powers out of its back. */
export const updateObserverNeighborsInFront = (updates: NeighborUpdates, at: BlockPosition, block: BlockRef): void => {
    const facing = facingOf(block);
    const backPos = relative(at, opposite(facing));
    updates.neighborChanged(backPos, OBSERVER);
    updates.updateNeighborsAtExceptFromFacing(backPos, OBSERVER, facing);
};

/**
 * `ObserverBlock.updateShape`: the block an observer watches changed, so it
 * schedules its pulse. A second change while the pulse is pending is dropped,
 * which is what `hasScheduledTick` guards.
 */
export const observerShapeUpdate = (world: WorldAccess, at: BlockPosition, fromDirection: Direction): void => {
    const block = world.getBlock(at);
    if (block.name !== OBSERVER) return;
    if (facingOf(block) !== fromDirection) return;
    if (booleanState(block, OBSERVER_POWERED_STATE)) return;
    if (world.hasScheduledTick('block', at, OBSERVER)) return;
    world.scheduleTick('block', at, OBSERVER, OBSERVER_PULSE_TICKS);
};

/**
 * `ObserverBlock.tick`: turn on and schedule the turn-off two ticks later, or
 * turn off. Either way the block behind the observer is told.
 */
export const observerTick = (updates: NeighborUpdates, world: WorldAccess, at: BlockPosition): void => {
    const block = world.getBlock(at);
    if (block.name !== OBSERVER) return;

    const powered = booleanState(block, OBSERVER_POWERED_STATE);
    const next: BlockRef = { name: OBSERVER, states: { ...block.states, [OBSERVER_POWERED_STATE]: !powered } };
    world.setBlock(at, next, false);
    if (!powered) world.scheduleTick('block', at, OBSERVER, OBSERVER_PULSE_TICKS);
    updateObserverNeighborsInFront(updates, at, next);
};
