import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Block } from '../block/Block';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from './DimensionType';
import type { DimensionType } from './DimensionType';
import type Chunk from './chunk/Chunk';
import { ChunkTickets } from './ChunkTickets';
import { RespawnSearch } from './RespawnSearch';
import type { RespawnRequest } from './RespawnSearch';
import type { World } from './World';

/**
 * A world of air with the named blocks placed, keyed by `x,y,z`. The chunks named in `unloaded`,
 * keyed by `x,z` in chunk coordinates, are not in memory until something loads them.
 */
const worldOf = (
    dimension: DimensionType,
    blocks: Record<string, string> = {},
    spawn = new Vector3(0, 64, 0),
    unloaded = new Set<string>()
) => {
    const nameAt = (x: number, y: number, z: number): string => blocks[`${x},${y},${z}`] ?? 'minecraft:air';
    const isLoaded = (x: number, z: number): boolean => !unloaded.has(`${x},${z}`);
    const loads: string[] = [];
    const tickets = new ChunkTickets({
        isLoaded,
        load: (x, z) => {
            if (loads.includes(`${x},${z}`)) return false;
            loads.push(`${x},${z}`);
            return true;
        }
    });
    return stub<World>({
        getDimension: () => dimension,
        getKnownSpawnPosition: () => spawn,
        getSpawnPosition: async () => spawn,
        chunkTickets: () => tickets,
        getChunk: async (x, z) => {
            unloaded.delete(`${x},${z}`);
            return stub<Chunk>({});
        },
        loadedBlockAt: (x, y, z) => (isLoaded(x >> 4, z >> 4) ? { name: nameAt(x, y, z), states: {} } : undefined),
        loadedBlock: (x, y, z) =>
            isLoaded(x >> 4, z >> 4) ? stub<Block>({ isSolid: () => nameAt(x, y, z) !== 'minecraft:air' }) : undefined
    });
};

/** A search over an Overworld and a Nether, which records each world it is asked to build. */
const searchOver = ({ overworld = worldOf(Dimensions.Overworld), nether = worldOf(Dimensions.Nether) } = {}) => {
    const built: string[] = [];
    const worlds = new Map([
        [Dimensions.Overworld.id, overworld],
        [Dimensions.Nether.id, nether]
    ]);
    // The Overworld is the default world, which is always built.
    const ready = new Set<string>([Dimensions.Overworld.id]);
    const search = new RespawnSearch({
        hasStem: (stemId) => worlds.has(stemId),
        world: async (stemId) => {
            built.push(stemId);
            const world = worlds.get(stemId);
            if (world === undefined) throw new Error(`no ${stemId}`);
            // A build finishes on a later turn, never inside the call that starts it.
            await Promise.resolve();
            ready.add(stemId);
            return world;
        },
        built: (stemId) => (ready.has(stemId) ? worlds.get(stemId) : undefined),
        worldSpawn: () => overworld
    });
    return { search, built };
};

const request = (spawnPoint?: RespawnRequest['spawnPoint']): RespawnRequest => ({
    player: 'Steve',
    spawnPoint,
    body: { width: 0.6, height: 1.8, eyeHeight: EYE_HEIGHT }
});

/**
 * Asks until the search answers, letting the builds it starts finish between attempts, as the
 * input steps of later ticks would.
 */
const answerOf = async (search: RespawnSearch, asked: RespawnRequest) => {
    for (let attempts = 0; attempts < 10; attempts += 1) {
        const attempt = search.attempt(asked);
        if (attempt.kind === 'answer') return attempt.answer;
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('The search never answered');
};

describe('RespawnSearch', () => {
    it('answers the world spawn for a player with no point of their own', async () => {
        const { search, built } = searchOver();

        const answer = await answerOf(search, request());

        expect(answer).toEqual({
            player: 'Steve',
            spawn: 'world',
            dimension: Dimensions.Overworld.id,
            announced: { x: 0.5, y: 64 + EYE_HEIGHT, z: 0.5 },
            block: { x: 0, y: 64, z: 0 },
            eyes: { x: 0, y: 64 + EYE_HEIGHT, z: 0 },
            spawnPointLost: false
        });
        expect(built).toEqual([]);
    });

    it('raises the world spawn out of the blocks the body overlaps', async () => {
        const overworld = worldOf(Dimensions.Overworld, { '0,64,0': 'minecraft:stone', '-1,65,0': 'minecraft:stone' });
        const { search } = searchOver({ overworld });

        const answer = await answerOf(search, request());

        expect(answer.block).toEqual({ x: 0, y: 66, z: 0 });
    });

    it('stands the player beside a bed in another dimension of the level', async () => {
        const nether = worldOf(Dimensions.Nether, { '10,40,10': 'minecraft:red_bed' });
        const { search, built } = searchOver({ nether });

        const answer = await answerOf(search, request({ x: 10, y: 40, z: 10, dimension: 'minecraft:nether' }));

        expect(answer).toMatchObject({
            spawn: 'own',
            dimension: Dimensions.Nether.id,
            block: { x: 10, y: 40, z: 11 },
            spawnPointLost: false
        });
        expect(built).toEqual([Dimensions.Nether.id]);
    });

    it('uses a point `/spawnpoint` set whatever stands there', async () => {
        const overworld = worldOf(Dimensions.Overworld, { '5,70,5': 'minecraft:stone' });
        const { search } = searchOver({ overworld });

        const answer = await answerOf(
            search,
            request({ x: 5, y: 70, z: 5, dimension: Dimensions.Overworld.id, forced: true })
        );

        expect(answer).toMatchObject({ spawn: 'own', block: { x: 5, y: 70, z: 5 } });
    });

    it('reports a bed that is gone as lost and answers the world spawn', async () => {
        const { search } = searchOver();
        const spawnPoint = { x: 10, y: 64, z: 10, dimension: Dimensions.Overworld.id };
        const asked = request(spawnPoint);

        const answer = await answerOf(search, asked);

        expect(answer).toMatchObject({ spawn: 'world', block: { x: 0, y: 64, z: 0 }, spawnPointLost: true });
        // The search writes nothing: the player clears its own point once it has the answer.
        expect(asked.spawnPoint).toBe(spawnPoint);
    });

    it('builds no world for a point in a dimension the level has no stem for', async () => {
        const { search, built } = searchOver();

        const answer = await answerOf(search, request({ x: 0, y: 64, z: 0, dimension: 'custom:nowhere' }));

        expect(answer).toMatchObject({ spawn: 'world', spawnPointLost: true });
        expect(built).toEqual([]);
    });

    it('asks and answers in plain data, which a structured clone keeps whole', async () => {
        const nether = worldOf(Dimensions.Nether, { '10,40,10': 'minecraft:red_bed' });
        const { search } = searchOver({ nether });
        const asked = request({ x: 10, y: 40, z: 10, dimension: Dimensions.Nether.id });

        const answer = await answerOf(search, structuredClone(asked));

        expect(structuredClone(answer)).toEqual(answer);
        expect(await answerOf(search, asked)).toEqual(answer);
    });
    describe('an attempt, which never waits', () => {
        it('waits for a chunk it lacks with one ticket, and answers once the chunk is in', async () => {
            const unloaded = new Set(['0,0']);
            const overworld = worldOf(Dimensions.Overworld, {}, new Vector3(0, 64, 0), unloaded);
            const { search } = searchOver({ overworld });
            const tickets = overworld.chunkTickets();

            expect(search.attempt(request())).toEqual({ kind: 'waiting' });
            expect(search.attempt(request())).toEqual({ kind: 'waiting' });
            expect(tickets.loadsStarted).toBe(1);
            expect(tickets.holds(0, 0)).toBe(true);

            unloaded.delete('0,0');
            const attempt = search.attempt(request());
            expect(attempt).toEqual({ kind: 'answer', answer: await answerOf(search, request()) });
            expect(tickets.holds(0, 0)).toBe(false);
            expect(tickets.loadsStarted).toBe(1);
        });

        it('waits for a bed in a dimension not built yet, building it once', async () => {
            const nether = worldOf(Dimensions.Nether, { '10,40,10': 'minecraft:red_bed' });
            const { search, built } = searchOver({ nether });
            const asked = request({ x: 10, y: 40, z: 10, dimension: Dimensions.Nether.id });

            expect(search.attempt(asked)).toEqual({ kind: 'waiting' });
            expect(search.attempt(asked)).toEqual({ kind: 'waiting' });
            expect(built).toEqual([Dimensions.Nether.id]);

            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(search.attempt(asked)).toMatchObject({ kind: 'answer', answer: { spawn: 'own' } });
        });

        it('asks for nothing at the world spawn while the bed it names is not loaded', () => {
            const unloaded = new Set(['0,0', '2,2']);
            const overworld = worldOf(Dimensions.Overworld, {}, new Vector3(0, 64, 0), unloaded);
            const { search } = searchOver({ overworld });

            expect(search.attempt(request({ x: 40, y: 64, z: 40, dimension: Dimensions.Overworld.id }))).toEqual({
                kind: 'waiting'
            });
            expect(overworld.chunkTickets().holds(2, 2)).toBe(true);
            expect(overworld.chunkTickets().holds(0, 0)).toBe(false);
        });
    });
});
