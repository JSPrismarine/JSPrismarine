import { describe, expect, it } from 'vitest';

import type { BlockPosition, TestWorld } from '@jsprismarine/engine-systems';
import { createTestWorld } from '@jsprismarine/engine-systems';

import { Dimensions } from './Dimension';
import type { SystemBlock, WorldSystemsAccess, WorldSystemsOptions, WorldSystemsView } from './WorldSystems';
import { LIGHT_BUDGET_PER_TICK, WorldSystems } from './WorldSystems';

const AIR: SystemBlock = { name: 'minecraft:air', states: {} };
const STONE: SystemBlock = { name: 'minecraft:stone', states: {} };
const GLOWSTONE: SystemBlock = { name: 'minecraft:glowstone', states: {} };
const WHEAT: SystemBlock = { name: 'minecraft:wheat', states: { growth: 0 } };

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Whether two blocks are the same identifier carrying the same state values. */
const sameBlock = (a: SystemBlock | undefined, b: SystemBlock): boolean =>
    a !== undefined &&
    a.name === b.name &&
    Object.keys(b.states).length === Object.keys(a.states).length &&
    Object.entries(b.states).every(([state, value]) => a.states[state] === value);

/**
 * A world reduced to a block map and a chunk list.
 *
 * The map is the light pass's and the random draw's view of the world; the voxel world from
 * `@jsprismarine/engine-systems` is the engine's, and the two read the same blocks so a
 * circuit the engine writes is a circuit the light engine sees.
 */
const worldOf = (loaded: ReadonlyArray<{ x: number; z: number }> = [{ x: 0, z: 0 }]) => {
    const blocks = new Map<string, SystemBlock>();

    const view: WorldSystemsView = {
        dimension: Dimensions.Overworld,
        blockAt: (x, y, z) => {
            if (!loaded.some((chunk) => chunk.x === x >> 4 && chunk.z === z >> 4)) return undefined;
            return blocks.get(key(x, y, z)) ?? AIR;
        },
        loadedChunks: () => loaded,
        randomTickSpeed: () => 3
    };

    /**
     * The engine's own world, over the same block map.
     *
     * A notifying write runs the updates it causes, exactly as {@link World} does with
     * {@link WorldSystems.updateAround}: that is the wiring under test, and without it a
     * fluid writes a block and nothing downstream ever hears about it.
     */
    let systems: WorldSystems | undefined;
    const written: string[] = [];
    const engineWorld = createTestWorld();
    const world: WorldSystemsAccess = {
        ...engineWorld,
        getBlock: (at) => ({ ...(blocks.get(key(at.x, at.y, at.z)) ?? AIR) }),
        setBlock: (at, to, notifyNeighbors) => {
            // Idempotent, as the real write is: an engine that rewrites the block already
            // there would announce a change nothing made.
            if (sameBlock(blocks.get(key(at.x, at.y, at.z)), to)) return;

            written.push(to.name);
            blocks.set(key(at.x, at.y, at.z), { name: to.name, states: to.states });
            if (notifyNeighbors) systems?.updateAround(at, { name: to.name, states: to.states });
        }
    };

    const systemsOf = (options: Partial<WorldSystemsOptions> = {}): WorldSystems => {
        systems = new WorldSystems({ view, world, ...options });
        return systems;
    };

    return { blocks, view, world, written, engineWorld, systemsOf };
};

/** Runs a run of world ticks, keeping the engine's clock in step with the world's. */
const runTicks = (world: TestWorld, systems: WorldSystems, from: number, to: number): void => {
    for (let tick = from; tick <= to; tick++) {
        world.setGameTime(tick);
        systems.tick(tick);
    }
};

describe('world', () => {
    describe('WorldSystems', () => {
        describe('light', () => {
            it('lights the blocks around a torch once the chunk is known', () => {
                const { blocks, systemsOf } = worldOf();
                const systems = systemsOf();
                systems.onChunkLoaded(0, 0);

                blocks.set(key(8, 40, 8), GLOWSTONE);
                systems.onBlockChanged({ x: 8, y: 40, z: 8 }, AIR, GLOWSTONE);

                // One tick's budget does not finish a glowstone's flood; the rest lands on the
                // ticks after it, which is the whole point of a budget.
                expect(systems.tick(1).light.processed).toBe(LIGHT_BUDGET_PER_TICK);
                for (let tick = 2; tick < 100 && systems.lighting.pending.queued > 0; tick++) systems.tick(tick);

                expect(systems.lighting.pending.queued).toBe(0);
                expect(systems.lighting.getBlockLight(8, 40, 8)).toBe(15);
                expect(systems.lighting.getBlockLight(9, 40, 8)).toBe(14);
                expect(systems.lighting.getBlockLight(12, 40, 8)).toBe(11);
            });

            it('takes the light away again when the source goes', () => {
                const { blocks, systemsOf } = worldOf();
                const systems = systemsOf();
                systems.onChunkLoaded(0, 0);

                blocks.set(key(8, 40, 8), GLOWSTONE);
                systems.onBlockChanged({ x: 8, y: 40, z: 8 }, AIR, GLOWSTONE);
                systems.tick(1);

                blocks.delete(key(8, 40, 8));
                systems.onBlockChanged({ x: 8, y: 40, z: 8 }, GLOWSTONE, AIR);
                systems.tick(2);

                expect(systems.lighting.getBlockLight(8, 40, 8)).toBe(0);
                expect(systems.lighting.getBlockLight(9, 40, 8)).toBe(0);
            });

            it('stops the flood at an opaque block', () => {
                const { blocks, systemsOf } = worldOf();
                const systems = systemsOf();

                blocks.set(key(9, 40, 8), STONE);
                systems.onChunkLoaded(0, 0);

                blocks.set(key(8, 40, 8), GLOWSTONE);
                systems.onBlockChanged({ x: 8, y: 40, z: 8 }, AIR, GLOWSTONE);
                systems.tick(1);

                expect(systems.lighting.getBlockLight(9, 40, 8)).toBe(0);
            });
        });

        describe('scheduled ticks', () => {
            it('runs a redstone torch tick on the game tick it was scheduled for, and not before', () => {
                const { blocks, engineWorld, systemsOf } = worldOf();
                const systems = systemsOf();

                // An unlit torch on a block nothing powers lights itself when its tick comes
                // due, which is `RedstoneTorchBlock.tick`.
                blocks.set(key(1, 2, 3), { name: 'minecraft:stone', states: {} });
                blocks.set(key(1, 3, 3), { name: 'minecraft:unlit_redstone_torch', states: {} });
                systems.ticks.list('block').schedule({ x: 1, y: 3, z: 3 }, 'minecraft:unlit_redstone_torch', 4);

                runTicks(engineWorld, systems, 1, 3);
                expect(blocks.get(key(1, 3, 3))?.name).toBe('minecraft:unlit_redstone_torch');

                runTicks(engineWorld, systems, 4, 4);
                expect(blocks.get(key(1, 3, 3))?.name).toBe('minecraft:redstone_torch');
            });

            it('runs the block list before the fluid list, as ServerLevel.tick does', () => {
                const { blocks, written, systemsOf } = worldOf();
                const systems = systemsOf();

                blocks.set(key(0, 1, 0), { name: 'minecraft:stone', states: {} });
                blocks.set(key(0, 2, 0), { name: 'minecraft:unlit_redstone_torch', states: {} });
                blocks.set(key(8, 8, 8), { name: 'minecraft:water', states: { liquid_depth: 0 } });

                systems.ticks.list('fluid').schedule({ x: 8, y: 8, z: 8 }, 'minecraft:water', 1);
                systems.ticks.list('block').schedule({ x: 0, y: 2, z: 0 }, 'minecraft:unlit_redstone_torch', 1);

                expect(systems.tick(1).scheduled).toBe(2);
                expect(written[0]).toBe('minecraft:redstone_torch');
                expect(written).toContain('minecraft:flowing_water');
                expect(written.indexOf('minecraft:flowing_water')).toBeGreaterThan(0);
            });
        });

        describe('fluids', () => {
            it('spreads a water source across the floor it stands on', () => {
                const { blocks, engineWorld, systemsOf } = worldOf();
                const systems = systemsOf();

                for (let x = 0; x < 5; x++) {
                    for (let z = 0; z < 5; z++) blocks.set(key(x, 63, z), STONE);
                }
                const source: SystemBlock = { name: 'minecraft:water', states: { liquid_depth: 0 } };
                blocks.set(key(2, 64, 2), source);

                // Placing the source is what gives it its first tick, which is
                // `LiquidBlock.onPlace`.
                systems.updateAround({ x: 2, y: 64, z: 2 }, source);
                expect(systems.ticks.list('fluid').count()).toBe(1);

                runTicks(engineWorld, systems, 1, 40);

                // One step thinner than the source, in every direction it can reach.
                expect(blocks.get(key(3, 64, 2))?.name).toBe('minecraft:flowing_water');
                expect(blocks.get(key(3, 64, 2))?.states['liquid_depth']).toBe(1);
                expect(blocks.get(key(1, 64, 2))?.name).toBe('minecraft:flowing_water');
            });
        });

        describe('random ticks', () => {
            it('runs the handler for the block the draw landed on', () => {
                const { blocks, systemsOf } = worldOf();
                const ticked: BlockPosition[] = [];

                // Fill the chunk, so every draw lands on a crop whatever the sequence says.
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                const systems = systemsOf({
                    randomTickHandlers: {
                        // One growth step, which is what `CropBlock.randomTick` does.
                        'minecraft:wheat': (at) => {
                            ticked.push(at);
                            blocks.set(key(at.x, at.y, at.z), { name: 'minecraft:wheat', states: { growth: 1 } });
                        }
                    }
                });

                const report = systems.tick(1);

                expect(report.randomTicked).toBeGreaterThan(0);
                expect(ticked).toHaveLength(report.randomTicked);
                for (const at of ticked) expect(blocks.get(key(at.x, at.y, at.z))?.states['growth']).toBe(1);
            });

            it('leaves a block no handler names alone', () => {
                const { blocks, systemsOf } = worldOf();
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                // Still counted as ticked: the position was drawn and the block takes random
                // ticks. Nothing answered it, which is the state of every family until the
                // content world adapter lands.
                expect(systemsOf().tick(1).randomTicked).toBeGreaterThan(0);
                expect(blocks.get(key(0, 0, 0))?.states['growth']).toBe(0);
            });

            it('ticks only the blocks that take random ticks', () => {
                const { systemsOf } = worldOf();

                // Stone takes no random tick, and an empty chunk is all air.
                expect(systemsOf().tick(1).randomTicked).toBe(0);
            });

            it('draws nothing when the game rule is zero', () => {
                const { view, world } = worldOf();
                const systems = new WorldSystems({ view: { ...view, randomTickSpeed: () => 0 }, world });

                expect(systems.tick(1).randomTicked).toBe(0);
            });

            it('draws the same positions for the same sequence of ticks', () => {
                const draws = () => {
                    const { blocks, systemsOf } = worldOf();
                    for (let y = -64; y < 320; y++) {
                        for (let x = 0; x < 16; x++) {
                            for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                        }
                    }

                    const seen: string[] = [];
                    const systems = systemsOf({
                        randomTickHandlers: {
                            'minecraft:wheat': (at) => seen.push(key(at.x, at.y, at.z))
                        }
                    });
                    systems.tick(1);
                    systems.tick(2);
                    return seen;
                };

                expect(draws()).toEqual(draws());
            });
        });
    });
});
