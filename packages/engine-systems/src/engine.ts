/**
 * The driver that wires the engine systems to one world.
 *
 * It owns the three things the systems share: the neighbor updater, the
 * dispatch from a block identifier to the behavior that handles it, and the
 * redstone torch's burnout log. A host hands it a {@link WorldAccess}, drains
 * its own scheduler, and calls {@link Engine.runScheduledTick} for each due
 * tick.
 */

import {
    LEVER,
    OBSERVER,
    REDSTONE_TORCH,
    REDSTONE_WIRE,
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
import type { NeighborUpdates } from './neighborUpdates';
import { MAX_CHAINED_NEIGHBOR_UPDATES, createNeighborUpdates } from './neighborUpdates';
import { pistonNeighborChanged } from './pistons';
import type { BlockRandomPositions, SectionOrigin } from './randomTick';
import { DEFAULT_RANDOM_TICK_SPEED, runRandomTicks } from './randomTick';
import { bestNeighborSignal } from './signal';
import {
    TORCH_MAX_RECENT_TOGGLES,
    TORCH_RESTART_DELAY,
    TORCH_TOGGLE_DELAY,
    TORCH_TOGGLE_WINDOW,
    isRedstoneTorch,
    torchIsSuppressed,
    updateWirePower
} from './redstone';
import type { BlockPosition, BlockRef, WorldAccess } from './world';
import { DIRECTIONS, positionKey, relative } from './world';

/** How to build an {@link Engine}. */
export interface EngineOptions {
    /** The neighbor update chain limit, defaulting to Java's 1000000. */
    maxChainedNeighborUpdates?: number;
    /**
     * What to run when a random tick lands on a block, keyed by identifier.
     *
     * The engine supplies the draws; the handler owns the block behavior.
     *
     * The block is passed along with the position because the engine has just
     * read it to find the handler, and reading it again is a chunk lookup and
     * a block-state construction per tick in the hottest loop the world has.
     */
    randomTickHandlers?: Readonly<Record<string, (at: BlockPosition, block: BlockRef) => void>>;
    /**
     * What to run when a neighbor update changes a block's power. Return true
     * when a content hook owns the block's response so the engine skips its
     * legacy handler.
     */
    onRedstoneUpdate?: (at: BlockPosition, block: BlockRef, power: number) => boolean;
}

/** What a host calls to run the engine. */
export interface Engine {
    /** The update operations, exposed so a host can raise one directly. */
    readonly updates: NeighborUpdates;
    /** Java's `Level.setBlockAndUpdate`: write a block and run every update it causes. */
    setBlockAndUpdate(at: BlockPosition, to: BlockRef): void;
    /** Run a scheduled tick for an engine-owned block behavior. */
    runScheduledTick(at: BlockPosition, type: string): void;
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
 * world.onBlockUpdated((at, to) => engine.setBlockAndUpdate(at, to));
 * ```
 *
 * Route the host's block writes through {@link Engine.setBlockAndUpdate}, not through
 * `engine.updates.updateNeighborsAt`. A host that raises only the neighbor updates leaves out
 * the new block's own `onPlace`, so dust placed beside a live lever stays dark and a piston
 * placed into a powered position never extends. Data-driven block placement and its `onPlace`
 * hooks belong to the block content adapter.
 */
export const createEngine = (world: WorldAccess, options: EngineOptions = {}): Engine => {
    const randomTickHandlers = options.randomTickHandlers ?? {};
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

                if (options.onRedstoneUpdate?.(at, block, bestNeighborSignal(world, at))) return;

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
     * Each block's own `onPlace`, beyond the generic six neighbor updates.
     *
     * The generic six tell the neighbors about the new block. What they do not
     * do is tell the new block about its neighbors, so everything that reads
     * the world it landed in has to be run here: dust works out its own power
     * and a piston that landed already powered extends. A system whose tick
     * handler is right and whose first tick is never booked looks exactly like
     * one that does not work at all.
     *
     * The rest are the signal sources reaching further than six. A torch tells
     * the neighbors of all six of its own neighbors, which is
     * `RedstoneTorchBlock.notifyNeighbors`. A lever, a button and a pressure
     * plate tell the neighbors of the block holding them up, which is how the
     * block they power finds out. A diode tells the block in front of it.
     */
    const runPlacementUpdates = (at: BlockPosition, to: BlockRef): void => {
        if (isRedstoneTorch(to.name)) {
            for (const direction of DIRECTIONS) updates.updateNeighborsAt(relative(at, direction), to.name);
            return;
        }
        if (to.name === REDSTONE_WIRE) {
            // `RedstoneWireBlock.onPlace` runs the evaluator over the new dust. Java then
            // tells the two vertical neighbors as well; `updateWirePower` tells all six
            // whenever the power moved, which is every case where they have anything to
            // hear about.
            updateWirePower(updates, world, at);
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
        if (isPiston(to.name)) {
            // `PistonBaseBlock.onPlace` runs `checkIfExtend`, so a piston placed into a
            // position something already powers extends there and then.
            pistonNeighborChanged(updates, world, at);
            return;
        }
    };

    const setBlockAndUpdate = (at: BlockPosition, to: BlockRef): void => {
        world.setBlock(at, to, false);
        updates.updateNeighborsAt(at, to.name);
        runPlacementUpdates(at, to);
        if (options.onRedstoneUpdate !== undefined) {
            options.onRedstoneUpdate(at, world.getBlock(at), bestNeighborSignal(world, at));
        }
        updates.shapeUpdatesAround(at);
    };

    const runScheduledTick = (at: BlockPosition, type: string): void => {
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
                    if (handler !== undefined) handler(at, block);
                },
                tickSpeed
            );
        }
    };
};

/** Identifiers whose scheduled block ticks remain reserved for engine handling. */
export const SCHEDULED_TICK_BLOCKS: readonly string[] = [];
