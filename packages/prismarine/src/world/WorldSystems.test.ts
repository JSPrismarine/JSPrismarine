import { describe, expect, it } from 'vitest';

import { Dimensions } from './Dimension';
import type { SystemBlock, WorldSystemsView } from './WorldSystems';
import { LIGHT_BUDGET_PER_TICK, WorldSystems } from './WorldSystems';

const AIR: SystemBlock = { name: 'minecraft:air', states: {} };
const STONE: SystemBlock = { name: 'minecraft:stone', states: {} };
const GLOWSTONE: SystemBlock = { name: 'minecraft:glowstone', states: {} };
const WHEAT: SystemBlock = { name: 'minecraft:wheat', states: { growth: 0 } };

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** A world reduced to a block map and a chunk list, which is all the systems read. */
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

    return { blocks, view };
};

describe('world', () => {
    describe('WorldSystems', () => {
        describe('light', () => {
            it('lights the blocks around a torch once the chunk is known', () => {
                const { blocks, view } = worldOf();
                const systems = new WorldSystems(view, { scheduledTick: () => {} });
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
                const { blocks, view } = worldOf();
                const systems = new WorldSystems(view, { scheduledTick: () => {} });
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
                const { blocks, view } = worldOf();
                const systems = new WorldSystems(view, { scheduledTick: () => {} });

                blocks.set(key(9, 40, 8), STONE);
                systems.onChunkLoaded(0, 0);

                blocks.set(key(8, 40, 8), GLOWSTONE);
                systems.onBlockChanged({ x: 8, y: 40, z: 8 }, AIR, GLOWSTONE);
                systems.tick(1);

                expect(systems.lighting.getBlockLight(9, 40, 8)).toBe(0);
            });
        });

        describe('scheduled ticks', () => {
            it('runs a tick on the game tick it was scheduled for, and not before', () => {
                const { view } = worldOf();
                const ran: Array<[string, number]> = [];
                const systems = new WorldSystems(view, {
                    scheduledTick: (_kind, at, type) => ran.push([type, at.y])
                });

                systems.ticks.list('block').schedule({ x: 1, y: 2, z: 3 }, 'minecraft:repeater', 4);

                systems.tick(3);
                expect(ran).toEqual([]);

                systems.tick(4);
                expect(ran).toEqual([['minecraft:repeater', 2]]);
            });

            it('runs the block list before the fluid list, as ServerLevel.tick does', () => {
                const { view } = worldOf();
                const order: string[] = [];
                const systems = new WorldSystems(view, { scheduledTick: (kind) => order.push(kind) });

                systems.ticks.list('fluid').schedule({ x: 0, y: 0, z: 0 }, 'minecraft:water', 1);
                systems.ticks.list('block').schedule({ x: 0, y: 0, z: 0 }, 'minecraft:sand', 1);

                expect(systems.tick(1).scheduled).toBe(2);
                expect(order).toEqual(['block', 'fluid']);
            });
        });

        describe('random ticks', () => {
            it('ticks only the blocks that take random ticks', () => {
                const { blocks, view } = worldOf();
                const ticked: string[] = [];
                const systems = new WorldSystems(view, {
                    scheduledTick: () => {},
                    randomTick: (at) => ticked.push(key(at.x, at.y, at.z))
                });

                // Stone takes no random tick; wheat does. A world of stone reports nothing.
                const report = systems.tick(1);
                expect(report.randomTicked).toBe(0);
                expect(ticked).toEqual([]);

                // Fill the column the draw will land on, so every draw hits a crop.
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                expect(systems.tick(2).randomTicked).toBeGreaterThan(0);
            });

            it('draws nothing when the game rule is zero', () => {
                const { view } = worldOf();
                const systems = new WorldSystems({ ...view, randomTickSpeed: () => 0 }, { scheduledTick: () => {} });

                expect(systems.tick(1).randomTicked).toBe(0);
            });

            it('draws the same positions for the same sequence of ticks', () => {
                const draws = () => {
                    const { blocks, view } = worldOf();
                    for (let y = -64; y < 320; y++) {
                        for (let x = 0; x < 16; x++) {
                            for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                        }
                    }

                    const seen: string[] = [];
                    const systems = new WorldSystems(view, {
                        scheduledTick: () => {},
                        randomTick: (at) => seen.push(key(at.x, at.y, at.z))
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
