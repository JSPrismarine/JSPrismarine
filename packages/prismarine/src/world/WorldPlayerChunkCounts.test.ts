import { describe, expect, it, vi } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import { World } from './World';

const PLAYER_COUNT = 16;
const CHUNK_COUNT = 32;

const worldWith = (
    chunkPositions: readonly (readonly [number, number])[],
    unloadable = false,
    writeChunk: (chunk: Chunk) => Promise<void> = async () => {}
): World => {
    const players = new Map<bigint, Player>();
    const chunks = new Map(chunkPositions.map(([x, z]) => [Chunk.packXZ(x, z), new Chunk(x, z)]));

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks,
        players,
        loading: new Map(),
        provider: { supportsChunkUnload: unloadable, writeChunk },
        getPlayers: () => Array.from(players.values()),
        enqueueSave: async (write: () => Promise<void>) => write(),
        getEntities: () => [],
        dataEntities: () => ({ persist: () => {}, unload: () => false }),
        systems: { onChunkUnloaded: () => {} },
        dimension: Dimensions.Overworld,
        server: { invalidateEntityBlockCaches: () => {}, getLogger: () => ({ error: vi.fn() }) }
    });

    return world;
};

const playerAt = (world: World, chunkX: number, chunkZ: number): Player =>
    stub<Player>({
        viewDistance: 10,
        getPosition: () => new Position(chunkX * 16, 64, chunkZ * 16, world)
    });

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
            world['players'].set(BigInt(index), playerAt(world, index * 1000, 0));
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
            world['players'].set(BigInt(index), playerAt(world, index * 1000, 0));
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
        const first = stub<Player>({
            viewDistance: 10,
            getPosition: () => new Position(firstX * 16, 64, 0, world)
        });
        const second = playerAt(world, 0, 0);
        world['players'].set(1n, first);
        world['players'].set(2n, second);

        const chunks = Array.from(world['chunks'].values());
        const checks = chunks.map((chunk) => vi.spyOn(chunk, 'getSubChunks'));

        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([1, 1, 0, 0]);

        firstX = 20;
        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([2, 2, 1, 1]);

        world['players'].delete(2n);
        world.randomTickChunks();
        expect(checks.map(({ mock }) => mock.calls.length)).toEqual([2, 3, 2, 2]);
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
        const player = stub<Player>({
            viewDistance: 12,
            getPosition: () => new Position(playerX * 16, 64, 0, world)
        });
        world['players'].set(1n, player);

        await world['unloadDistantChunks']();
        expect(world.getLoadedChunk(0, 0)).not.toBeNull();
        expect(world.getLoadedChunk(11, 0)).not.toBeNull();
        expect(world.getLoadedChunk(12, 12)).not.toBeNull();
        expect(world.getLoadedChunk(13, 0)).toBeNull();

        playerX = 100;
        player.viewDistance = 4;
        world['chunks'].set(Chunk.packXZ(90, 0), new Chunk(90, 0));
        world['chunks'].set(Chunk.packXZ(89, 0), new Chunk(89, 0));

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
        const player = stub<Player>({
            viewDistance: 10,
            getPosition: () => new Position(playerX * 16, 64, 0, world)
        });
        world['players'].set(1n, player);
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
        world['players'].set(1n, playerAt(world, 0, 0));
        world.getLoadedChunk(20, 0)?.markChanged();

        await world['unloadDistantChunks']();

        expect(world.getLoadedChunk(20, 0)).not.toBeNull();
    });
});
