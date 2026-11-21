import { EntityIndex } from '../entity/data/entityIndex';
import { EntityStore } from '../entity/data/EntityStore';
import { TickScheduler } from '@jsprismarine/engine-systems';
import { describe, expect, it, vi } from 'vitest';

import type PlayerSession from '../network/PlayerSession';
import { stub, stubOf } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import { Position } from './Position';
import { ChunkAdmissions } from './ChunkAdmissions';
import { World } from './World';
import { LIGHT_CHUNKS_PER_TICK } from './WorldSystems';
import type { Config } from '../config/Config';
import type { Generator } from './Generator';
import type { Logger } from '@jsprismarine/logger';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';
import BaseProvider from './providers/BaseProvider';
import type { ChunkSaveContext } from './providers/ChunkSaveContext';
import type { DataEntity } from '../entity/data/DataEntity';
import type { StoreActor } from '../entity/data/storeActors';

const PLAYER_COUNT = 16;
const CHUNK_COUNT = 32;

const worldWith = (
    chunkPositions: readonly (readonly [number, number])[],
    unloadable = false,
    writeChunk: (chunk: Chunk, context?: ChunkSaveContext) => Promise<void> = async () => {}
): World => {
    const players = new Map<number, PlayerSession>();
    const chunks = new Map(chunkPositions.map(([x, z]) => [Chunk.packXZ(x, z), new Chunk(x, z)]));

    const world: World = Object.assign(Object.create(World.prototype), {
        // The sink the constructor would have set, which hears each chunk enter and leave.
        changes: NULL_WORLD_CHANGE_SINK,
        chunks,
        loadedChunksRevision: 0,
        players,
        loading: new Map(),
        level: fakeLevel({ provider: stubOf(BaseProvider, { supportsChunkUnload: unloadable, writeChunk }) }),
        getPlayers: () => Array.from(players.values()),
        getEntities: () => [],
        actors: () => [].values(),
        dataEntities: () => ({
            persist: () => {},
            unload: () => false,
            runtime: { index: new EntityIndex(), store: new EntityStore(), remove: () => {} }
        }),
        systems: { onChunkUnloaded: () => {}, isLightReady: () => true, ticks: new TickScheduler() },
        dimension: Dimensions.Overworld,
        server: { invalidateEntityBlockCaches: () => {}, getLogger: () => ({ error: vi.fn() }) }
    });

    return world;
};

/** A player double whose session answers the view distance `radius` reads. */
const playerViewing = (position: () => Position, radius: () => number): PlayerSession =>
    stub<PlayerSession>({
        getViewPosition: position,
        getViewDistance: radius
    });

const playerAt = (world: World, chunkX: number, chunkZ: number): PlayerSession =>
    playerViewing(
        () => new Position(chunkX * 16, 64, chunkZ * 16, world),
        () => 10
    );

const loadedPositions = (centerX: number, centerZ: number): [number, number][] =>
    Array.from({ length: CHUNK_COUNT }, (_entry, index) => [
        centerX + (index % 8) - 4,
        centerZ + Math.floor(index / 8) - 2
    ]);

describe('world player chunk counts', () => {
    it('does not compare every player with every loaded chunk when selecting random tick chunks', () => {
        const positions = Array.from({ length: CHUNK_COUNT }, (_entry, index) => [100_000 + index, 100_000] as const);
        const world = worldWith(positions);

        for (let index = 0; index < PLAYER_COUNT; index++) {
            world['players'].set(index, playerAt(world, index * 1000, 0));
        }

        const absoluteValue = vi.spyOn(Math, 'abs');
        world.randomTickChunks();
        const comparisons = absoluteValue.mock.calls.length;
        absoluteValue.mockRestore();

        expect(comparisons).toBeLessThan(PLAYER_COUNT * CHUNK_COUNT);
    });

    it('does not compare every player with every loaded chunk while unloading', async () => {
        const centerX = (PLAYER_COUNT - 1) * 1000;
        const world = worldWith(loadedPositions(centerX, 0), true);

        for (let index = 0; index < PLAYER_COUNT; index++) {
            world['players'].set(index, playerAt(world, index * 1000, 0));
        }

        const absoluteValue = vi.spyOn(Math, 'abs');
        await world['unloadDistantChunks']();
        const comparisons = absoluteValue.mock.calls.length;
        absoluteValue.mockRestore();

        expect(comparisons).toBeLessThan(PLAYER_COUNT * CHUNK_COUNT);
    });

    describe('the light pass', () => {
        /** A row of loaded chunks along x, loaded far side first, so load order and distance disagree. */
        const ROW = Array.from({ length: 12 }, (_entry, index) => 11 - index);

        /** A world built by its constructor, whose chunks load through its provider. */
        const constructedWorld = async (): Promise<World> => {
            const logger = stub<Logger>({
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
                verbose: () => {}
            });
            const server = stub<Server>({
                getLogger: () => logger,
                getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
                getContent: () => testContent(),
                getEntityRuntime: () => inertEntityRuntime()
            });
            const world = new World({
                name: 'light-order-test',
                path: 'light-order-test',
                server,
                level: fakeLevel({
                    server,
                    provider: stubOf(BaseProvider, {
                        readChunk: async (_dimension, x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
                    })
                }),
                stem: TEST_OVERWORLD_STEM,
                generator: stub<Generator>({})
            });
            for (const x of ROW) await world.loadChunk(x, 0);
            return world;
        };

        /** The row's chunks the light model holds after one light pass, in ascending x. */
        const takenInByOnePass = (world: World): number[] => {
            const systems = world.getSystems();
            systems.prepareLighting();
            return ROW.filter((x) => systems.lighting.hasChunk(x, 0)).sort((a, b) => a - b);
        };

        /** The first pass's share of a nearest-first order, in ascending x. */
        const firstShare = (nearestFirst: readonly number[]): number[] =>
            nearestFirst.slice(0, LIGHT_CHUNKS_PER_TICK).sort((a, b) => a - b);

        it('takes the chunks nearest a player into the light model first', async () => {
            expect(ROW.length).toBeGreaterThan(LIGHT_CHUNKS_PER_TICK);
            const world = await constructedWorld();
            world['players'].set(1, playerAt(world, 0, 0));

            expect(takenInByOnePass(world)).toEqual(firstShare([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
        });

        it('counts each chunk from whichever player is nearer', async () => {
            const world = await constructedWorld();
            world['players'].set(1, playerAt(world, 0, 0));
            world['players'].set(2, playerAt(world, 11, 0));

            expect(takenInByOnePass(world)).toEqual(firstShare([0, 11, 1, 10, 2, 9, 3, 8, 4, 7, 5, 6]));
        });
    });

    it('keeps overlapping simulation coverage correct as players move and leave', () => {
        const world = worldWith([
            [0, 0],
            [10, 0],
            [11, 0],
            [20, 0]
        ]);
        let firstX = 0;
        const first = playerViewing(
            () => new Position(firstX * 16, 64, 0, world),
            () => 10
        );
        const second = playerAt(world, 0, 0);
        world['players'].set(1, first);
        world['players'].set(2, second);

        const chunks = Array.from(world['chunks'].values());
        const checks = chunks.map((chunk) => vi.spyOn(chunk, 'getRandomTickSections'));

        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([1, 1, 0, 0]);

        firstX = 20;
        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([2, 2, 1, 1]);

        world['players'].delete(2);
        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([2, 3, 2, 2]);
    });

    it('matches a full coverage recount across randomized moves, radius changes, joins, and leaves', () => {
        const world = worldWith([]);
        const players = world['players'];
        const states = new Map<number, { x: number; z: number; viewDistance: number }>();
        let randomState = 0x4d595df4;
        const random = (): number => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
            return randomState / 0x1_0000_0000;
        };
        const randomCoordinate = (): number => Math.floor(random() * 37) - 18;
        const randomViewDistance = (): number => Math.floor(random() * 17);
        const makePlayer = (state: { x: number; z: number; viewDistance: number }): PlayerSession =>
            playerViewing(
                () => new Position(state.x * 16, 64, state.z * 16, world),
                () => state.viewDistance
            );
        const references = world['getPlayerChunkRefCounts']();
        const addExpectedArea = (
            counts: Map<number, [number, number, number]>,
            x: number,
            z: number,
            radius: number,
            index: 0 | 1 | 2
        ) => {
            for (let chunkX = x - radius; chunkX <= x + radius; chunkX++) {
                for (let chunkZ = z - radius; chunkZ <= z + radius; chunkZ++) {
                    const key = Chunk.packXZ(chunkX, chunkZ);
                    const coverage: [number, number, number] = counts.get(key) ?? [0, 0, 0];
                    coverage[index]++;
                    counts.set(key, coverage);
                }
            }
        };

        for (let step = 0; step < 100; step++) {
            const runtimeId = Math.floor(random() * 12);
            const state = states.get(runtimeId);
            const action = random();

            if (state !== undefined && action < 0.15) {
                players.delete(runtimeId);
                states.delete(runtimeId);
            } else if (state === undefined && action < 0.55) {
                const joined = { x: randomCoordinate(), z: randomCoordinate(), viewDistance: randomViewDistance() };
                states.set(runtimeId, joined);
                players.set(runtimeId, makePlayer(joined));
            } else if (state !== undefined) {
                state.x = randomCoordinate();
                state.z = randomCoordinate();
                state.viewDistance = randomViewDistance();
            }

            references.synchronize(players);
            const expectedCounts = new Map<number, [number, number, number]>();
            for (const current of states.values()) {
                addExpectedArea(expectedCounts, current.x, current.z, 10, 0);
                addExpectedArea(expectedCounts, current.x, current.z, Math.max(10, current.viewDistance), 1);
                addExpectedArea(expectedCounts, current.x, current.z, 11, 2);
            }

            const mismatches: string[] = [];
            for (let x = -36; x <= 36; x++) {
                for (let z = -36; z <= 36; z++) {
                    const expected = expectedCounts.get(Chunk.packXZ(x, z)) ?? [0, 0, 0];
                    if (
                        references.simulates(x, z) !== expected[0] > 0 ||
                        references.retains(x, z) !== expected[1] > 0 ||
                        references.lights(x, z) !== expected[2] > 0
                    )
                        mismatches.push(`${x},${z}`);
                }
            }
            expect(mismatches).toEqual([]);
        }
    });

    it('does not revisit loaded chunks for tick work while player coverage is stable', () => {
        const positions = Array.from(
            { length: 4_225 },
            (_entry, index) => [(index % 65) - 32, Math.floor(index / 65) - 32] as const
        );
        const world = worldWith(positions);
        world['players'].set(1, playerAt(world, 0, 0));
        world['getPlayerChunkRefCounts']();
        const distant = world.getLoadedChunk(32, 32)!;
        const getX = vi.spyOn(distant, 'getX');

        world.randomTickChunks();
        const firstTickReads = getX.mock.calls.length;
        world.randomTickChunks();

        expect(firstTickReads).toBe(1);
        expect(getX).toHaveBeenCalledTimes(1);
    });

    it('uses view distance for retention while tracking player movement and radius changes', async () => {
        const world = worldWith(
            [
                [0, 0],
                [11, 0],
                [12, 12],
                [13, 0]
            ],
            true
        );
        let playerX = 0;
        let radius = 12;
        const player = playerViewing(
            () => new Position(playerX * 16, 64, 0, world),
            () => radius
        );
        world['players'].set(1, player);

        await world['unloadDistantChunks']();
        expect(world.getLoadedChunk(0, 0)).not.toBeNull();
        expect(world.getLoadedChunk(11, 0)).not.toBeNull();
        expect(world.getLoadedChunk(12, 12)).not.toBeNull();
        expect(world.getLoadedChunk(13, 0)).toBeNull();

        playerX = 100;
        radius = 4;
        for (const x of [90, 89]) {
            const chunk = new Chunk(x, 0);
            world['chunks'].set(Chunk.packXZ(x, 0), chunk);
            world['loadedChunksRevision']++;
            world['getPlayerChunkRefCounts']()['chunkLoaded'](chunk);
        }

        await world['unloadDistantChunks']();
        expect(world.getLoadedChunk(90, 0)).not.toBeNull();
        expect(world.getLoadedChunk(89, 0)).toBeNull();
    });

    it('rechecks player coverage after an asynchronous chunk save', async () => {
        let writeStarted = (): void => {};
        let finishWrite = (): void => {};
        const started = new Promise<void>((resolve) => {
            writeStarted = resolve;
        });
        const writeGate = new Promise<void>((resolve) => {
            finishWrite = resolve;
        });
        const world = worldWith([[20, 0]], true, async (chunk) => {
            writeStarted();
            await writeGate;
            chunk.markSaved();
        });
        let playerX = 0;
        const player = playerViewing(
            () => new Position(playerX * 16, 64, 0, world),
            () => 10
        );
        world['players'].set(1, player);
        world.getLoadedChunk(20, 0)?.markChanged();

        const unloading = world['unloadDistantChunks']();
        await started;
        playerX = 20;
        finishWrite();
        await unloading;

        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
    });

    it('saves at most four distant chunks a tick, all before the tick hands back the event loop', async () => {
        const saved: number[] = [];
        const positions = [20, 21, 22, 23, 24, 25].map((x) => [x, 0] as const);
        const world = worldWith(positions, true, async (chunk) => {
            saved.push(chunk.getX());
            chunk.markSaved();
        });
        world['players'].set(1, playerAt(world, 0, 0));
        for (const [x] of positions) world.getLoadedChunk(x, 0)?.markChanged();
        Object.assign(world, { closing: false, unloading: null });

        world['beginDistantChunkUnloads']();
        // Microtasks only: a host of any speed has saved the batch before a timer could run a tick.
        for (let step = 0; step < 50; step++) await Promise.resolve();
        expect(saved).toHaveLength(4);

        await world['unloading'];
        world['beginDistantChunkUnloads']();
        await world['unloading'];
        expect(saved).toHaveLength(6);
    });

    it('takes a fresh save context for a chunk saved after a tick passed', async () => {
        let finishFirst!: () => void;
        const firstGate = new Promise<void>((resolve) => {
            finishFirst = resolve;
        });
        const contextTicks: (number | undefined)[] = [];
        const world = worldWith(
            [
                [20, 0],
                [21, 0]
            ],
            true,
            async (chunk, context) => {
                contextTicks.push(context?.pendingTicks?.currentTick);
                if (chunk.getX() === 20) await firstGate;
                chunk.markSaved();
            }
        );
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();
        world.getLoadedChunk(21, 0)?.markChanged();

        const unloading = world['unloadDistantChunks']();
        await Promise.resolve();
        // The first save waits on the database while the server ticks on.
        world.getLevel().setTicks(world.getTicks() + 1);
        finishFirst();
        await unloading;

        expect(contextTicks).toEqual([0, 1]);
    });

    it('saves an unchanged chunk whose stored record still holds fluid ticks before it leaves', async () => {
        const saved: number[] = [];
        const world = worldWith([[20, 0]], true, async (chunk) => {
            saved.push(chunk.getX());
            chunk.setStoredTicks(false);
        });
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.setStoredTicks(true);

        await world['unloadDistantChunks']();

        expect(saved).toEqual([20]);
        expect(world.getLoadedChunk(20, 0)).toBeNull();
    });

    it('keeps a chunk a ticket holds, and unloads it once the ticket is released', async () => {
        const world = worldWith(
            [
                [20, 0],
                [21, 0]
            ],
            true
        );
        world['players'].set(1, playerAt(world, 0, 0));
        // Loaded, so the request starts no load.
        expect(world.chunkTickets().request('fight', [{ x: 20, z: 0 }])).toBe(true);

        await world['unloadDistantChunks']();
        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
        expect(world.getLoadedChunk(21, 0)).toBeNull();

        world.chunkTickets().release('fight');
        await world['unloadDistantChunks']();
        expect(world.getLoadedChunk(20, 0)).toBeNull();
    });

    it('keeps a chunk an entity entered after its save, and saves the entity with it next pass', async () => {
        const admissions = new ChunkAdmissions();
        admissions.activate();
        const index = Chunk.packXZ(20, 0);
        const written: number[][] = [];
        let saved!: () => void;
        const world = worldWith([[20, 0]], true, async (chunk, context) => {
            written.push((context?.entitiesByChunk.get(index) ?? []).map((actor) => Number(actor.getRuntimeId())));
            chunk.markSaved();
            saved();
        });
        const inChunk: DataEntity[] = [];
        let actors: StoreActor[] = [];
        const removed: number[] = [];
        Object.assign(world, {
            completionQueue: { admissions },
            actors: () => actors.values(),
            dataEntities: () => ({
                persist: () => {},
                unload: () => false,
                runtime: {
                    index: stubOf(EntityIndex, { storeInChunk: () => inChunk, itemsInChunk: () => [] }),
                    store: new EntityStore(),
                    remove: (id: number) => void removed.push(id)
                }
            })
        });
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();

        const pass = async (tick: number) => {
            const writing = new Promise<void>((resolve) => {
                saved = resolve;
            });
            const unloading = world['unloadDistantChunks']();
            await writing;
            await new Promise<void>((resolve) => setImmediate(resolve));
            return { unloading, admit: () => admissions.admit(tick) };
        };

        // The cow walks in after the save wrote the chunk empty, before the input step takes it out.
        const first = await pass(1);
        inChunk.push(stub<DataEntity>({ id: 7, identifier: 'minecraft:cow' }));
        first.admit();
        await first.unloading;
        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
        expect(removed).toEqual([]);

        actors = [
            stub<StoreActor>({
                getType: () => 'minecraft:cow',
                getRuntimeId: () => 7n,
                getPosition: () => new Position(20 * 16 + 8, 64, 8, world),
                shouldPersist: () => true
            })
        ];
        const second = await pass(2);
        second.admit();
        await second.unloading;
        expect(written).toEqual([[], [7]]);
        expect(removed).toEqual([7]);
        expect(world.getLoadedChunk(20, 0)).toBeNull();
    });

    it('keeps a chunk loaded when saving it fails', async () => {
        const world = worldWith([[20, 0]], true, async () => {
            throw new Error('chunk write failed');
        });
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();

        await world['unloadDistantChunks']();

        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
    });

    it("logs a chunk whose leave fails while a later chunk's save waits, and unloads the rest", async () => {
        const admissions = new ChunkAdmissions();
        admissions.activate();
        let secondSaving!: () => void;
        const secondStarted = new Promise<void>((resolve) => {
            secondSaving = resolve;
        });
        let finishSecond!: () => void;
        const secondGate = new Promise<void>((resolve) => {
            finishSecond = resolve;
        });
        const world = worldWith(
            [
                [20, 0],
                [21, 0]
            ],
            true,
            async (chunk) => {
                if (chunk.getX() === 21) {
                    secondSaving();
                    await secondGate;
                }
                chunk.markSaved();
            }
        );
        const errors: unknown[] = [];
        const failure = new Error('the leave broke');
        Object.assign(world, {
            completionQueue: { admissions },
            systems: {
                onChunkUnloaded: (x: number) => {
                    if (x === 20) throw failure;
                },
                ticks: new TickScheduler()
            },
            server: {
                invalidateEntityBlockCaches: () => {},
                getLogger: () => ({ error: (message: unknown) => void errors.push(message) })
            }
        });
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();
        world.getLoadedChunk(21, 0)?.markChanged();
        const unhandled: unknown[] = [];
        const listener = (reason: unknown) => void unhandled.push(reason);
        process.on('unhandledRejection', listener);

        try {
            const unloading = world['unloadDistantChunks']();
            await secondStarted;
            // The input step takes the first chunk out while the second is still saving.
            expect(admissions.admit(1)).toBe(1);
            // A turn of the event loop, which is when Node reports a rejection nothing handles.
            await new Promise<void>((resolve) => setImmediate(resolve));
            finishSecond();
            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(admissions.admit(2)).toBe(1);
            await unloading;
        } finally {
            process.off('unhandledRejection', listener);
        }

        expect(unhandled).toEqual([]);
        expect(errors).toEqual([expect.stringContaining('Failed to unload chunk 20,0'), failure]);
        expect(world.getLoadedChunk(21, 0)).toBeNull();
    });
});
