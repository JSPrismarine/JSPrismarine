import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { BlockPosition } from '@jsprismarine/engine-systems';
import { createTestWorld } from '@jsprismarine/engine-systems';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import Chunk from './chunk/Chunk';
import { Dimensions, maxY } from './Dimension';
import type { SystemBlock, WorldSystemsAccess, WorldSystemsOptions, WorldSystemsView } from './WorldSystems';
import { LIGHT_BUDGET_PER_TICK, WorldSystems } from './WorldSystems';

const AIR: SystemBlock = { name: 'minecraft:air', states: {}, runtimeId: BlockRuntimeIds.getByName('minecraft:air') };
const STONE: SystemBlock = {
    name: 'minecraft:stone',
    states: {},
    runtimeId: BlockRuntimeIds.getByName('minecraft:stone')
};
const GLOWSTONE: SystemBlock = {
    name: 'minecraft:glowstone',
    states: {},
    runtimeId: BlockRuntimeIds.getByName('minecraft:glowstone')
};
const WHEAT: SystemBlock = {
    name: 'minecraft:wheat',
    states: { growth: 0 },
    runtimeId: BlockRuntimeIds.getByName('minecraft:wheat')
};
const GLASS: SystemBlock = {
    name: 'minecraft:glass',
    states: {},
    runtimeId: BlockRuntimeIds.getByName('minecraft:glass')
};

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Whether two blocks are the same identifier carrying the same state values. */
const sameBlock = (a: SystemBlock | undefined, b: SystemBlock): boolean =>
    a !== undefined &&
    a.name === b.name &&
    Object.keys(b.states).length === Object.keys(a.states).length &&
    Object.entries(b.states).every(([state, value]) => a.states[state] === value);

/** Hashes both light layers at every block in one chunk, including all dimension heights. */
const lightDigest = (systems: WorldSystems, chunkX: number, chunkZ: number): string => {
    const digest = createHash('sha256');
    const values = Buffer.alloc(16 * 16 * Dimensions.Overworld.height * 2);
    let offset = 0;
    for (let x = chunkX * 16; x < chunkX * 16 + 16; x++) {
        for (let z = chunkZ * 16; z < chunkZ * 16 + 16; z++) {
            for (let y = Dimensions.Overworld.minY; y <= maxY(Dimensions.Overworld); y++) {
                values[offset++] = systems.lighting.getBlockLight(x, y, z);
                values[offset++] = systems.lighting.getSkyLight(x, y, z);
            }
        }
    }
    return digest.update(values).digest('hex');
};

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

describe('world', () => {
    describe('WorldSystems', () => {
        it('exposes the shared random tick state without changing its draw sequence', () => {
            const systems = new WorldSystems({
                view: {
                    dimension: Dimensions.Overworld,
                    blockAt: () => AIR,
                    loadedChunks: () => [],
                    shouldInitializeLight: () => false,
                    randomTickSpeed: () => 1,
                    randomTickChunks: () => [{ x: 0, z: 0, sections: [0] }]
                },
                world: createTestWorld()
            });

            expect(systems.getRandomTickState()).toBe(0);
            systems.tick(1);
            expect(systems.getRandomTickState()).toBe(1013904223);
        });

        it('restores the shared random tick state at a replay boundary', () => {
            const systems = new WorldSystems({
                view: { dimension: Dimensions.Overworld, blockAt: () => undefined, loadedChunks: () => [] },
                world: createTestWorld()
            });

            systems.restoreRandomTickState(1_013_904_223);

            expect(systems.getRandomTickState()).toBe(1_013_904_223);
        });

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

            it('lights the same world through the runtime id and the column top as without them', () => {
                // Both shortcuts are optional, so the two paths have to agree block for block.
                // A floor with a glowstone on it, a pane of glass above and nothing higher.
                const scene = (view: WorldSystemsView, blocks: Map<string, SystemBlock>): WorldSystems => {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, 40, z), STONE);
                    }
                    blocks.set(key(8, 41, 8), GLOWSTONE);
                    blocks.set(key(4, 44, 4), GLASS);

                    const systems = new WorldSystems({ view, world: createTestWorld() });
                    systems.onChunkLoaded(0, 0);
                    systems.lighting.flush();
                    return systems;
                };

                /** Every level of both layers over the chunk, so one block's difference shows. */
                const levels = (systems: WorldSystems): number[] => {
                    const out: number[] = [];
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) {
                            for (let y = 30; y <= 60; y++) {
                                out.push(systems.lighting.getBlockLight(x, y, z));
                                out.push(systems.lighting.getSkyLight(x, y, z));
                            }
                        }
                    }
                    return out;
                };

                const plain = worldOf();
                const shortcut = worldOf();
                const shortcutView: WorldSystemsView = {
                    ...shortcut.view,
                    blockRuntimeIdAt: (x, y, z) => {
                        const block = shortcut.view.blockAt(x, y, z);
                        return block === undefined
                            ? undefined
                            : (BlockRuntimeIds.tryGetByState(block.name, block.states) ?? undefined);
                    },
                    // One past the scene's highest block, rounded up to the sub chunk the real
                    // world answers with.
                    topOfColumn: () => 48
                };

                expect(levels(scene(shortcutView, shortcut.blocks))).toEqual(levels(scene(plain.view, plain.blocks)));
            });

            it('matches eager lighting in the simulation chunk and readies guard chunks on demand', () => {
                const coordinates = Array.from({ length: 25 }, (_unused, index) => ({
                    x: (index % 5) - 2,
                    z: Math.floor(index / 5) - 2
                }));
                const chunks = new Map(
                    coordinates.map(({ x, z }) => [
                        Chunk.packXZ(x, z),
                        new Chunk(x, z, new Map(), Dimensions.Overworld)
                    ])
                );
                const chunkAt = (x: number, z: number): Chunk => {
                    const chunk = chunks.get(Chunk.packXZ(x, z));
                    if (chunk === undefined) throw new Error(`Missing chunk ${x},${z}`);
                    return chunk;
                };
                const stone = BlockRuntimeIds.getByName('minecraft:stone');
                for (const chunk of chunks.values()) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) {
                            const height = 39 + ((chunk.getX() * 13 + chunk.getZ() * 7 + x + z) & 3);
                            chunk.fillColumn(x, z, 36, height, stone);
                        }
                    }
                }
                chunkAt(1, 0).setBlockRuntimeId(0, 42, 8, BlockRuntimeIds.getByName('minecraft:glowstone'));
                chunkAt(0, 0).setBlockRuntimeId(15, 43, 8, BlockRuntimeIds.getByName('minecraft:glass'));
                chunkAt(0, 0).setBlockRuntimeId(15, 42, 9, BlockRuntimeIds.getByName('minecraft:water'));
                const makeSystems = (deferred: boolean) => {
                    let centerX = 0;
                    const view: WorldSystemsView = {
                        dimension: Dimensions.Overworld,
                        blockAt: (x, y, z) => {
                            const chunk = chunks.get(Chunk.packXZ(x >> 4, z >> 4));
                            if (chunk === undefined) return undefined;
                            const block = chunk.getBlock(x & 0xf, y, z & 0xf);
                            return { name: block.name, states: block.properties };
                        },
                        topOfColumn: (x, z) =>
                            (chunks.get(Chunk.packXZ(x >> 4, z >> 4))?.getHighestBlockAt(x & 0xf, z & 0xf) ??
                                maxY(Dimensions.Overworld)) + 1,
                        loadedChunks: () => coordinates,
                        ...(deferred && {
                            shouldInitializeLight: (x: number, z: number) =>
                                Math.abs(x - centerX) <= 1 && Math.abs(z) <= 1,
                            lightChunks: function* () {
                                for (const { x, z } of coordinates) {
                                    if (Math.abs(x - centerX) <= 1 && Math.abs(z) <= 1) yield { x, z };
                                }
                            }
                        })
                    };
                    const systems = new WorldSystems({ view, world: createTestWorld() });
                    for (const { x, z } of coordinates) systems.onChunkLoaded(x, z);
                    if (deferred) systems.prepareLighting();
                    systems.lighting.flush();
                    return { systems, moveCenter: (x: number) => (centerX = x) };
                };

                const eager = makeSystems(false).systems;
                const deferred = makeSystems(true);
                expect(deferred.systems.lighting.hasChunk(2, 2)).toBe(false);
                expect(lightDigest(deferred.systems, 0, 0)).toBe(lightDigest(eager, 0, 0));

                deferred.moveCenter(1);
                deferred.systems.prepareLighting();
                deferred.systems.lighting.flush();
                expect(deferred.systems.lighting.hasChunk(-1, 0)).toBe(false);
                expect(deferred.systems.lighting.hasChunk(2, 0)).toBe(true);
                expect(lightDigest(deferred.systems, 1, 0)).toBe(lightDigest(eager, 1, 0));

                deferred.systems.getSkyLight(32, 40, 32);
                expect(deferred.systems.lighting.hasChunk(2, 2)).toBe(true);
            });

            it('matches full light digests with revision-cached palette hints', () => {
                const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
                const stone = BlockRuntimeIds.getByName('minecraft:stone');
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) chunk.fillColumn(x, z, 36, 40, stone);
                }
                chunk.setBlockRuntimeId(8, 41, 8, BlockRuntimeIds.getByName('minecraft:glowstone'));
                chunk.setBlockRuntimeId(4, 44, 4, BlockRuntimeIds.getByName('minecraft:glass'));
                chunk.setBlockRuntimeId(8, 42, 8, BlockRuntimeIds.getByName('minecraft:water'));

                const build = (hints: boolean) => {
                    let paletteScans = 0;
                    const view: WorldSystemsView = {
                        dimension: Dimensions.Overworld,
                        blockAt: (x, y, z) => {
                            const block = chunk.getBlock(x & 0xf, y, z & 0xf);
                            return { name: block.name, states: block.properties };
                        },
                        topOfColumn: (x, z) =>
                            (chunk.getHighestBlockAt(x & 0xf, z & 0xf) ?? maxY(Dimensions.Overworld)) + 1,
                        loadedChunks: () => [{ x: 0, z: 0 }],
                        ...(hints && {
                            lightSectionAt: (_chunkX: number, sectionY: number, _chunkZ: number) => {
                                const subChunk = chunk.getSubChunk(sectionY);
                                const storage = subChunk?.getStorages()[0];
                                return {
                                    revision: subChunk?.getRevision() ?? -1,
                                    runtimeIds: (function* () {
                                        paletteScans++;
                                        yield* storage?.getPalette() ?? [];
                                    })()
                                };
                            }
                        })
                    };
                    return {
                        systems: new WorldSystems({ view, world: createTestWorld() }),
                        paletteScans: () => paletteScans
                    };
                };

                const plain = build(false).systems;
                const hinted = build(true);
                plain.onChunkLoaded(0, 0);
                hinted.systems.onChunkLoaded(0, 0);
                plain.lighting.flush();
                hinted.systems.lighting.flush();
                expect(lightDigest(hinted.systems, 0, 0)).toBe(lightDigest(plain, 0, 0));

                const scansBeforeRefresh = hinted.paletteScans();
                hinted.systems.onChunkLoaded(0, 0);
                hinted.systems.lighting.flush();
                expect(hinted.paletteScans()).toBe(scansBeforeRefresh);

                const torch = BlockRuntimeIds.getByName('minecraft:torch');
                chunk.setBlockRuntimeId(10, 45, 10, torch);
                plain.onChunkLoaded(0, 0);
                hinted.systems.onChunkLoaded(0, 0);
                plain.lighting.flush();
                hinted.systems.lighting.flush();
                expect(hinted.paletteScans()).toBeGreaterThan(scansBeforeRefresh);
                expect(lightDigest(hinted.systems, 0, 0)).toBe(lightDigest(plain, 0, 0));
            });

            it('does not reuse section palette hints after a chunk unload', () => {
                let runtimeId: number | undefined;
                let blockReads = 0;
                const systems = new WorldSystems({
                    view: {
                        dimension: Dimensions.Overworld,
                        blockAt: (_x, y, _z) => {
                            if (y < 32 || y >= 48) return AIR;
                            blockReads++;
                            return STONE;
                        },
                        lightSectionAt: () => ({
                            revision: 0,
                            runtimeIds: runtimeId === undefined ? [] : [runtimeId]
                        }),
                        topOfColumn: () => 48,
                        loadedChunks: () => [{ x: 0, z: 0 }]
                    },
                    world: createTestWorld()
                });

                systems.onChunkLoaded(0, 0);
                expect(blockReads).toBe(0);

                systems.onChunkUnloaded(0, 0);
                runtimeId = BlockRuntimeIds.getByName('minecraft:stone');
                systems.onChunkLoaded(0, 0);

                expect(blockReads).toBeGreaterThan(0);
            });

            it('waits for light to settle before drawing random ticks', () => {
                const { blocks, view, world } = worldOf();
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) blocks.set(key(x, 40, z), STONE);
                }
                let randomTickReads = 0;
                const systems = new WorldSystems({
                    view: {
                        ...view,
                        lightChunks: () => [{ x: 0, z: 0 }],
                        shouldInitializeLight: () => true,
                        randomTickSpeed: () => 1,
                        randomTickChunks: () => {
                            randomTickReads++;
                            return [];
                        }
                    },
                    world
                });

                let tick = 1;
                systems.tick(tick++);
                expect(randomTickReads).toBe(0);
                while (!systems.isLightingSettled && tick < 100) systems.tick(tick++);
                expect(systems.isLightingSettled).toBe(true);
                expect(randomTickReads).toBe(0);

                systems.tick(tick);
                expect(randomTickReads).toBe(1);
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

        describe('redstone cache', () => {
            it('invalidates a changed block and its unloaded chunk through the world lifecycle', () => {
                const forgottenPositions: BlockPosition[] = [];
                const forgottenChunks: { readonly x: number; readonly z: number }[] = [];
                const { systemsOf } = worldOf();
                const systems = systemsOf({
                    redstoneUpdateHandlers: {
                        dispatch: () => {},
                        forgetPosition: (at) => forgottenPositions.push(at),
                        forgetChunk: (x, z) => forgottenChunks.push({ x, z })
                    }
                });
                const at = { x: -1, y: 64, z: -1 };

                systems.onBlockChanged(
                    at,
                    { name: 'minecraft:stone', states: {} },
                    { name: 'minecraft:dirt', states: {} }
                );
                systems.onChunkUnloaded(-1, -1);

                expect(forgottenPositions).toEqual([at]);
                expect(forgottenChunks).toEqual([{ x: -1, z: -1 }]);
            });
        });

        describe('content block ticks', () => {
            it('does not run a duplicate fluid tick after the block list advances the same liquid', () => {
                const at = { x: 0, y: 1, z: 0 };
                const { systemsOf } = worldOf();
                let systems: WorldSystems | undefined;
                let handled = 0;
                systems = systemsOf({
                    blockTickHandlers: {
                        'minecraft:water': (position) => {
                            handled++;
                            systems?.ticks.list('block').schedule(position, 'minecraft:water', 2);
                        }
                    }
                });
                systems.ticks.list('block').schedule(at, 'minecraft:water', 1);
                systems.ticks.list('fluid').schedule(at, 'minecraft:water', 1);

                systems.tick(1);

                expect(handled).toBe(1);
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

            it('hands the handler the block it already read, rather than making it read again', () => {
                const { blocks, systemsOf } = worldOf();
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                const seen: SystemBlock[] = [];
                systemsOf({ randomTickHandlers: { 'minecraft:wheat': (_at, block) => void seen.push(block) } }).tick(1);

                expect(seen.length).toBeGreaterThan(0);
                for (const block of seen) expect(block).toEqual(WHEAT);
            });

            it('visits only the chunks and sections the world says to', () => {
                const { blocks, view, world } = worldOf([
                    { x: 0, z: 0 },
                    { x: 1, z: 0 }
                ]);
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 32; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                // Java's two halves: one chunk is held by a player ticket, and one section of it
                // holds anything. The other chunk is loaded and still.
                const systems = new WorldSystems({
                    view: { ...view, randomTickChunks: () => [{ x: 0, z: 0, sections: [4] }] },
                    world,
                    randomTickHandlers: { 'minecraft:wheat': () => {} }
                });

                // Three draws in one section rather than three in each of 24 sections of two
                // chunks, and all of them inside the section the world named.
                expect(systems.tick(1).randomTicked).toBe(3);
            });

            it('draws nothing at all when the world names no chunks, which is an empty server', () => {
                const { blocks, view, world } = worldOf();
                for (let y = -64; y < 320; y++) {
                    for (let x = 0; x < 16; x++) {
                        for (let z = 0; z < 16; z++) blocks.set(key(x, y, z), WHEAT);
                    }
                }

                const systems = new WorldSystems({ view: { ...view, randomTickChunks: () => [] }, world });

                expect(systems.tick(1).randomTicked).toBe(0);
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
