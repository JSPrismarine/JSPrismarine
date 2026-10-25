/**
 * A world and an engine wired to each other, which is the shape every test and
 * every host needs.
 *
 * The wiring is the one thing a host has to get right: a notifying `setBlock`
 * must go back through {@link Engine.setBlockAndUpdate}, because that is what
 * turns a block change into a redstone update, what lets an observer see the
 * block it watches change, and what runs each block's own `onPlace`. The write
 * has already happened by then and the engine makes it again, which costs a
 * read and changes nothing.
 */

import type { EngineOptions, Engine } from './engine';
import { createEngine } from './engine';
import type { TestWorld, TestWorldOptions } from './testWorld';
import { createTestWorld } from './testWorld';

/** A wired world, its engine, and a way to advance the clock. */
export interface TestEngine {
    readonly world: TestWorld;
    readonly engine: Engine;
    /**
     * Advance the clock and run every tick that falls due.
     *
     * @param ticks - How many game ticks to run, one by default.
     * @returns How many scheduled ticks ran in total.
     */
    runGameTicks(ticks?: number): number;
}

/**
 * Build a world and an engine already wired together.
 *
 * @param options - World options and engine options, both optional.
 * @example
 * ```typescript
 * const { world, runGameTicks } = createTestEngine();
 * world.place({ x: 0, y: 0, z: 0 }, block('minecraft:stone'));
 * runGameTicks(4);
 * ```
 */
export const createTestEngine = (options: TestWorldOptions & { engine?: EngineOptions } = {}): TestEngine => {
    const { engine: engineOptions, ...worldOptions } = options;
    const world = createTestWorld(worldOptions);
    const engine = createEngine(world, engineOptions);

    world.onBlockUpdated((at, to) => engine.setBlockAndUpdate(at, to));

    return {
        world,
        engine,
        runGameTicks(ticks = 1) {
            let ran = 0;
            for (let i = 0; i < ticks; i++) {
                ran += world.runGameTick((kind, at, type) => engine.runScheduledTick(kind, at, type));
            }
            return ran;
        }
    };
};
