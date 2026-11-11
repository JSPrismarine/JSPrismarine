import { EntityIndex } from '../entity/data/entityIndex';
import { EntityStore } from '../entity/data/EntityStore';
import { describe, expect, it, vi } from 'vitest';

import type PlayerSession from '../network/PlayerSession';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { fakeLevel } from '../testing/level';
import type BaseProvider from './providers/BaseProvider';

const PLAYER_COUNT = 16;
const CHUNK_COUNT = 32;

const worldWith = (
    chunkPositions: readonly (readonly [number, number])[],
    unloadable = false,
    writeChunk: (chunk: Chunk) => Promise<void> = async () => {}
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
        level: fakeLevel({ provider: stub<BaseProvider>({ supportsChunkUnload: unloadable, writeChunk }) }),
        getPlayers: () => Array.from(players.values()),
        enqueueSave: async (write: () => Promise<void>) => write(),
        getEntities: () => [],
        actors: () => [].values(),
        dataEntities: () => ({
            persist: () => {},
            unload: () => false,
            runtime: { index: new EntityIndex(), store: new EntityStore(), remove: () => {} }
        }),
        systems: { onChunkUnloaded: () => {} },
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

    it('keeps a chunk loaded when saving it fails', async () => {
        const world = worldWith([[20, 0]], true, async () => {
            throw new Error('chunk write failed');
        });
        world['players'].set(1, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();

        await world['unloadDistantChunks']();

        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
    });
});
