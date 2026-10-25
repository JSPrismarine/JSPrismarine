/**
 * The driver that wires the four systems to one world.
 *
 * It owns the three things the systems share: the neighbor updater, the
 * dispatch from a block identifier to the behavior that handles it, and the
 * redstone torch's burnout log. A host hands it a {@link WorldAccess}, drains
 * its own scheduler, and calls {@link Engine.runScheduledTick} for each due
 * tick.
 */

import {
    COMPARATOR,
    LEVER,
    OBSERVER,
    REDSTONE_TORCH,
    REDSTONE_WIRE,
    REPEATER,
    attachmentOf,
    isButton,
    isComparator,
    isPiston,
    isPressurePlate,
    isRepeater
} from './components';
import {
    comparatorTick,
    diodeNeighborChanged,
    observerShapeUpdate,
    observerTick,
    repeaterTick,
    updateDiodeNeighborsInFront
} from './diodes';
import { FIRE, fireTick } from './fire';
import type { FluidSourceRules } from './fluids';
import { DEFAULT_SOURCE_RULES, fluidKindOf, fluidNeighborChanged, fluidTick } from './fluids';
import type { NeighborUpdates } from './neighborUpdates';
import { MAX_CHAINED_NEIGHBOR_UPDATES, createNeighborUpdates } from './neighborUpdates';
import { pistonNeighborChanged } from './pistons';
import type { BlockRandomPositions, SectionOrigin } from './randomTick';
import { DEFAULT_RANDOM_TICK_SPEED, runRandomTicks } from './randomTick';
import {
    TORCH_MAX_RECENT_TOGGLES,
    TORCH_RESTART_DELAY,
    TORCH_TOGGLE_DELAY,
    TORCH_TOGGLE_WINDOW,
    isRedstoneTorch,
    torchIsSuppressed,
    updateWirePower
} from './redstone';
import type { BlockPosition, BlockRef, TickKind, WorldAccess } from './world';
import { DIRECTIONS, positionKey, relative } from './world';

/** How to build an {@link Engine}. */
export interface EngineOptions {
    /** The two source-conversion game rules, defaulting to vanilla. */
    sourceRules?: FluidSourceRules;
    /** The neighbor update chain limit, defaulting to Java's 1000000. */
    maxChainedNeighborUpdates?: number;
    /**
     * What to run when a random tick lands on a block, keyed by identifier.
     *
     * The engine handles the fluids and leaves the rest open, which is the
     * hook `@jsprismarine/block-behaviors` fills with crop growth, ice melting
     * and the rest of the randomly ticking blocks.
     */
    randomTickHandlers?: Readonly<Record<string, (at: BlockPosition) => void>>;
    /**
     * Java's `INCREASED_FIRE_BURNOUT` environment attribute, which the humid
     * biomes set. It takes 50 off every burn-out denominator and halves the
     * spread odds.
     */
    increasedFireBurnout?: (at: BlockPosition) => boolean;
}

/** What a host calls to run the engine. */
export interface Engine {
    /** The update operations, exposed so a host can raise one directly. */
    readonly updates: NeighborUpdates;
    /** Java's `Level.setBlockAndUpdate`: write a block and run every update it causes. */
    setBlockAndUpdate(at: BlockPosition, to: BlockRef): void;
    /** Run one tick the host drained from its scheduler. */
    runScheduledTick(kind: TickKind, at: BlockPosition, type: string): void;
    /**
     * Run one chunk tick's random ticks.
     *
     * @param positions - The draw source, shared across the world.
     * @param sections - The randomly ticking sections of the chunk.
     * @param tickSpeed - `random_tick_speed`, Java's 3 by default.
     * @returns How many positions were ticked.
     */
    runRandomTicks(positions: BlockRandomPositions, sections: readonly SectionOrigin[], tickSpeed?: number): number;
}

interface TorchToggle {
    readonly key: string;
    readonly when: number;
}

/**
 * Build the engine over one world.
 *
 * @param world - The world the systems read and write.
 * @param options - Game rules and the hooks a host fills in.
 * @example
 * ```typescript
 * const world = createTestWorld();
 * const engine = createEngine(world);
 * world.onBlockUpdated((at, to) => engine.updates.updateNeighborsAt(at, to.name));
 * ```
 */
export const createEngine = (world: WorldAccess, options: EngineOptions = {}): Engine => {
    const sourceRules = options.sourceRules ?? DEFAULT_SOURCE_RULES;
    const randomTickHandlers = options.randomTickHandlers ?? {};
    const increasedFireBurnout = options.increasedFireBurnout ?? (() => false);
    let torchToggles: TorchToggle[] = [];

    const torchToggledTooOften = (at: BlockPosition, record: boolean): boolean => {
        const key = positionKey(at);
        if (record) torchToggles.push({ key, when: world.getGameTime() });
        let count = 0;
        for (const toggle of torchToggles) {
            if (toggle.key !== key) continue;
            if (++count >= TORCH_MAX_RECENT_TOGGLES) return true;
        }
        return false;
    };

    const updates: NeighborUpdates = createNeighborUpdates(
        {
            onNeighborChanged(at, fromBlock) {
                const block = world.getBlock(at);
                const { name } = block;

                if (name === REDSTONE_WIRE) {
                    updateWirePower(updates, world, at);
                    return;
                }
                if (isRedstoneTorch(name)) {
                    torchNeighborChanged(at, block);
                    return;
                }
                if (isRepeater(name) || isComparator(name)) {
                    diodeNeighborChanged(world, at, block);
                    return;
                }
                if (isPiston(name)) {
                    pistonNeighborChanged(updates, world, at);
                    return;
                }
                if (fluidKindOf(block) !== undefined) {
                    fluidNeighborChanged(world, at);
                    return;
                }
                void fromBlock;
            },
            onShapeUpdate(at, fromDirection) {
                if (world.getBlock(at).name === OBSERVER) observerShapeUpdate(world, at, fromDirection);
            }
        },
        options.maxChainedNeighborUpdates ?? MAX_CHAINED_NEIGHBOR_UPDATES
    );

    const torchNeighborChanged = (at: BlockPosition, block: BlockRef): void => {
        const lit = block.name === REDSTONE_TORCH.lit;
        if (lit !== torchIsSuppressed(world, at)) return;
        if (world.willTickThisTick('block', at, block.name)) return;
        world.scheduleTick('block', at, block.name, TORCH_TOGGLE_DELAY);
    };

    const torchTick = (at: BlockPosition, block: BlockRef): void => {
        const suppressed = torchIsSuppressed(world, at);
        const now = world.getGameTime();
        torchToggles = torchToggles.filter((toggle) => now - toggle.when <= TORCH_TOGGLE_WINDOW);

        if (block.name === REDSTONE_TORCH.lit) {
            if (!suppressed) return;
            setBlockAndUpdate(at, { name: REDSTONE_TORCH.unlit, states: block.states });
            if (torchToggledTooOften(at, true)) {
                world.playSound(at, 'minecraft:random.fizz');
                world.scheduleTick('block', at, REDSTONE_TORCH.unlit, TORCH_RESTART_DELAY);
            }
            return;
        }

        if (!suppressed && !torchToggledTooOften(at, false)) {
            setBlockAndUpdate(at, { name: REDSTONE_TORCH.lit, states: block.states });
        }
    };

    /**
     * The `onPlace` updates the signal sources raise beyond the generic six.
     *
     * A torch tells the neighbors of all six of its own neighbors, which is
     * `RedstoneTorchBlock.notifyNeighbors`. A lever, a button and a pressure
     * plate tell the neighbors of the block holding them up, which is how the
     * block they power finds out. A diode tells the block in front of it.
     */
    const runPlacementUpdates = (at: BlockPosition, to: BlockRef): void => {
        if (isRedstoneTorch(to.name)) {
            for (const direction of DIRECTIONS) updates.updateNeighborsAt(relative(at, direction), to.name);
            return;
        }
        if (to.name === LEVER || isButton(to.name)) {
            updates.updateNeighborsAt(relative(at, attachmentOf(to)), to.name);
            return;
        }
        if (isPressurePlate(to.name)) {
            updates.updateNeighborsAt(relative(at, 'down'), to.name);
            return;
        }
        if (isRepeater(to.name) || isComparator(to.name)) {
            updateDiodeNeighborsInFront(updates, at, to);
            return;
        }
        // `LiquidBlock.onPlace` schedules the new fluid's own first tick.
        if (fluidKindOf(to) !== undefined) fluidNeighborChanged(world, at);
    };

    const setBlockAndUpdate = (at: BlockPosition, to: BlockRef): void => {
        world.setBlock(at, to, false);
        updates.updateNeighborsAt(at, to.name);
        runPlacementUpdates(at, to);
        updates.shapeUpdatesAround(at);
    };

    const runScheduledTick = (kind: TickKind, at: BlockPosition, type: string): void => {
        if (kind === 'fluid') {
            fluidTick(updates, world, at, sourceRules);
            return;
        }

        const block = world.getBlock(at);
        const { name } = block;
        if (isRedstoneTorch(name)) {
            torchTick(at, block);
            return;
        }
        if (isRepeater(name)) {
            repeaterTick(updates, world, at);
            return;
        }
        if (isComparator(name)) {
            comparatorTick(updates, world, at);
            return;
        }
        if (name === OBSERVER) {
            observerTick(updates, world, at);
            return;
        }
        if (name === FIRE) {
            fireTick(updates, world, at, increasedFireBurnout(at));
            return;
        }
        void type;
    };

    return {
        updates,
        setBlockAndUpdate,
        runScheduledTick,
        runRandomTicks(positions, sections, tickSpeed = DEFAULT_RANDOM_TICK_SPEED) {
            return runRandomTicks(
                world,
                positions,
                sections,
                (at) => {
                    const block = world.getBlock(at);
                    const handler = randomTickHandlers[block.name];
                    if (handler !== undefined) handler(at);
                },
                tickSpeed
            );
        }
    };
};

/** The identifiers the engine dispatches a scheduled block tick for. */
export const SCHEDULED_TICK_BLOCKS: readonly string[] = [
    REDSTONE_TORCH.lit,
    REDSTONE_TORCH.unlit,
    REPEATER.powered,
    REPEATER.unpowered,
    COMPARATOR.powered,
    COMPARATOR.unpowered,
    OBSERVER,
    FIRE
];
