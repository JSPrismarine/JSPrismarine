/**
 * Redstone dust and the redstone torch.
 *
 * The wire evaluator is `DefaultRedstoneWireEvaluator` from the 26.3 jar, the
 * one vanilla uses. Mojang ships a second one, `ExperimentalRedstoneWireEvaluator`,
 * behind the `redstone_experiments` feature flag whose entire datapack is a
 * `pack.mcmeta`; this package implements the default and not the experiment.
 */

import { isRedstoneConductor } from './blockRules';
import { REDSTONE_TORCH, REDSTONE_WIRE, SIGNAL_STATE, attachmentOf, numberState } from './components';
import type { NeighborUpdates } from './neighborUpdates';
import { SIGNAL_MAX, bestNeighborSignal, hasSignal, wirePowerOf } from './signal';
import type { BlockPosition, WorldAccess } from './world';
import { DIRECTIONS, HORIZONTAL_DIRECTIONS, relative } from './world';

/**
 * `RedstoneWireEvaluator.getIncomingWireSignal`: the strongest power this
 * position picks up from dust around it, already stepped down by one.
 *
 * Dust reads its four horizontal neighbors, climbs onto a conductor when
 * nothing covers this position, and drops down past a non-conductor.
 */
export const incomingWireSignal = (world: WorldAccess, at: BlockPosition): number => {
    let signal = 0;
    const aboveIsConductor = isRedstoneConductor(world.getBlock(relative(at, 'up')));

    for (const direction of HORIZONTAL_DIRECTIONS) {
        const neighborPos = relative(at, direction);
        const neighbor = world.getBlock(neighborPos);
        signal = Math.max(signal, wirePowerOf(neighbor));

        if (isRedstoneConductor(neighbor)) {
            if (!aboveIsConductor) {
                signal = Math.max(signal, wirePowerOf(world.getBlock(relative(neighborPos, 'up'))));
            }
        } else {
            signal = Math.max(signal, wirePowerOf(world.getBlock(relative(neighborPos, 'down'))));
        }
    }

    return Math.max(0, signal - 1);
};

/** `DefaultRedstoneWireEvaluator.calculateTargetStrength`. */
export const wireTargetPower = (world: WorldAccess, at: BlockPosition): number => {
    const blockSignal = bestNeighborSignal(world, at, { suppressWire: true });
    if (blockSignal === SIGNAL_MAX) return SIGNAL_MAX;
    return Math.max(blockSignal, incomingWireSignal(world, at));
};

/**
 * `DefaultRedstoneWireEvaluator.updatePowerStrength`: recompute one wire's
 * power and, when it moved, tell its own position and all six neighbors.
 *
 * Java collects the seven positions into a `HashSet` and iterates it, so the
 * order is whatever the set gives. This walks the position first and then the
 * six directions in `Direction.values()` order, which is deterministic.
 */
export const updateWirePower = (updates: NeighborUpdates, world: WorldAccess, at: BlockPosition): void => {
    const wire = world.getBlock(at);
    if (wire.name !== REDSTONE_WIRE) return;

    const target = wireTargetPower(world, at);
    if (numberState(wire, SIGNAL_STATE) === target) return;

    world.setBlock(at, { name: REDSTONE_WIRE, states: { ...wire.states, [SIGNAL_STATE]: target } }, false);
    updates.updateNeighborsAt(at, REDSTONE_WIRE);
    for (const direction of DIRECTIONS) updates.updateNeighborsAt(relative(at, direction), REDSTONE_WIRE);
};

/**
 * `RedstoneTorchBlock.hasNeighborSignal`: a torch is turned off by power in the
 * block holding it up, and by nothing else.
 */
export const torchIsSuppressed = (world: WorldAccess, at: BlockPosition): boolean => {
    const support = attachmentOf(world.getBlock(at));
    return hasSignal(world, relative(at, support), support);
};

/** Whether the identifier is either redstone torch. */
export const isRedstoneTorch = (name: string): boolean => name === REDSTONE_TORCH.lit || name === REDSTONE_TORCH.unlit;

/** How many toggles in 60 game ticks burn a torch out, Java's `MAX_RECENT_TOGGLES`. */
export const TORCH_MAX_RECENT_TOGGLES = 8;

/** How long a burnt-out torch waits before trying again, Java's `RESTART_DELAY`. */
export const TORCH_RESTART_DELAY = 160;

/** How long a torch waits before acting on a change, Java's `TOGGLE_DELAY`. */
export const TORCH_TOGGLE_DELAY = 2;

/** The window a torch counts its toggles over, from `RedstoneTorchBlock.tick`. */
export const TORCH_TOGGLE_WINDOW = 60;
