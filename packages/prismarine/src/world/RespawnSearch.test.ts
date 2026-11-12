import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import type { Block } from '../block/Block';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { EntityIndex } from '../entity/data/entityIndex';
import { EntityStore } from '../entity/data/EntityStore';
import { EYE_HEIGHT } from '../entity/playerEyes';
import type PlayerSession from '../network/PlayerSession';
import { fakeLevel } from '../testing/level';
import { stub, stubOf } from '../testing/stub.test.helper';
import { Dimensions } from './DimensionType';
import type { DimensionType } from './DimensionType';
import Chunk from './chunk/Chunk';
import { ChunkTickets } from './ChunkTickets';
import { Position } from './Position';
import BaseProvider from './providers/BaseProvider';
import { RespawnSearch } from './RespawnSearch';
import type { RespawnAttempt, RespawnRequest } from './RespawnSearch';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

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

/**
 * An Overworld on the real prototype, with no chunk in memory and a provider that lets chunks
 * unload, so the chunk tickets and the unload pass are the real ones. A ticket's load is only
 * recorded; `admit` puts the recorded chunks in, as an input step would, with `blocks` placed.
 * One player stands far away, because the unload pass does nothing in a world nobody is in.
 */
const unloadingWorld = (blocks: Record<string, string>) => {
    const players = new Map<number, PlayerSession>();
    const chunks = new Map<number, Chunk>();
    const requested: string[] = [];
    let due: [number, number][] = [];
    const world: World = Object.assign(Object.create(World.prototype), {
        // The sink the constructor would have set, which hears each chunk enter and leave.
        changes: NULL_WORLD_CHANGE_SINK,
        chunks,
        loadedChunksRevision: 0,
        players,
        loading: new Map(),
        level: fakeLevel({
            provider: stubOf(BaseProvider, {
                supportsChunkUnload: true,
                writeChunk: async (chunk) => chunk.markSaved()
            })
        }),
        getPlayers: () => Array.from(players.values()),
        getEntities: () => [],
        actors: () => [].values(),
        dataEntities: () => ({
            persist: () => {},
            unload: () => false,
            runtime: { index: new EntityIndex(), store: new EntityStore(), remove: () => {} }
        }),
        systems: { onChunkUnloaded: () => {} },
        dimension: Dimensions.Overworld,
        server: {
            // No content, so a block resolves from the full palette's schemas: the fixture
            // content has stone but no air or bed.
            getContent: () => undefined,
            invalidateEntityBlockCaches: () => {},
            getLogger: () => ({ error: vi.fn() })
        },
        loadTicketedChunk: (x: number, z: number) => {
            requested.push(`${x},${z}`);
            due.push([x, z]);
            return true;
        }
    });
    players.set(
        1,
        stub<PlayerSession>({
            getViewDistance: () => 4,
            getViewPosition: () => new Position(100 * 16, 64, 0, world)
        })
    );

    const admit = (): void => {
        for (const [x, z] of due) {
            const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
            for (const [at, name] of Object.entries(blocks)) {
                const [bx = 0, by = 0, bz = 0] = at.split(',').map(Number);
                if (bx >> 4 !== x || bz >> 4 !== z) continue;
                const runtimeId = BlockRuntimeIds.tryGetByState(name);
                if (runtimeId === null) throw new Error(`the palette has no ${name}`);
                chunk.setBlockRuntimeId(bx, by, bz, runtimeId);
            }
            chunk.markSaved();
            // What registering an admitted chunk does to the state the search and the unload read.
            chunks.set(Chunk.packXZ(x, z), chunk);
            world['loadedChunksRevision'] += 1;
            world['getPlayerChunkRefCounts']().chunkLoaded(chunk);
            world['lastChunkIndex'] = -1;
        }
        due = [];
    };
    const unload = (): Promise<void> => world['unloadDistantChunks']();
    return { world, requested, admit, unload };
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

        it('keeps every chunk it asked for until it answers, so an unload between attempts undoes none', async () => {
            // A bed on the east edge of chunk (0, 0), walled north and south, so the player
            // stands east of it in chunk (1, 0): the second attempt needs a chunk the first
            // did not know about.
            const { world, requested, admit, unload } = unloadingWorld({
                '15,64,8': 'minecraft:bed',
                '15,64,9': 'minecraft:stone',
                '15,64,7': 'minecraft:stone'
            });
            const { search } = searchOver({ overworld: world });
            const tickets = world.chunkTickets();
            const asked = request({ x: 15, y: 64, z: 8, dimension: Dimensions.Overworld.id });

            // Each attempt is followed by the input step that admits what it asked for and an
            // unload pass, which takes every chunk neither a player nor a ticket keeps.
            const kinds: string[] = [];
            let attempt = search.attempt(asked);
            kinds.push(attempt.kind);
            while (attempt.kind === 'waiting' && kinds.length < 6) {
                admit();
                await unload();
                attempt = search.attempt(asked);
                kinds.push(attempt.kind);
            }

            expect(kinds).toEqual(['waiting', 'waiting', 'answer']);
            expect(attempt).toMatchObject({ kind: 'answer', answer: { spawn: 'own', block: { x: 16, y: 64, z: 8 } } });
            expect(requested).toEqual(['0,0', '1,0']);
            expect([tickets.holds(0, 0), tickets.holds(1, 0)]).toEqual([false, false]);

            await unload();
            expect([world.getLoadedChunk(0, 0), world.getLoadedChunk(1, 0)]).toEqual([null, null]);
        });

        it('lets go of the chunks it asked for when the search throws', () => {
            const unloaded = new Set(['2,2']);
            const overworld = worldOf(
                Dimensions.Overworld,
                { '40,64,40': 'minecraft:red_bed' },
                new Vector3(0, 64, 0),
                unloaded
            );
            const { search } = searchOver({ overworld });
            const tickets = overworld.chunkTickets();
            const asked = request({ x: 40, y: 64, z: 40, dimension: Dimensions.Overworld.id });

            expect(search.attempt(asked)).toEqual({ kind: 'waiting' });
            expect(tickets.holds(2, 2)).toBe(true);

            // The chunk is in, and a block beside the bed has no declared type.
            unloaded.delete('2,2');
            Object.assign(overworld, {
                loadedBlock: () => {
                    throw new Error('No block named minecraft:unknown');
                }
            });
            expect(() => search.attempt(asked)).toThrow('No block named minecraft:unknown');
            expect(tickets.holds(2, 2)).toBe(false);
        });

        it('hands a failed world spawn search to the next attempt once, and searches again', async () => {
            const overworld = worldOf(Dimensions.Overworld);
            let searches = 0;
            Object.assign(overworld, {
                getKnownSpawnPosition: () => null,
                getSpawnPosition: async () => {
                    searches += 1;
                    throw new Error('the spawn chunk failed to generate');
                }
            });
            const { search } = searchOver({ overworld });
            const failuresOf = (attempt: RespawnAttempt): string[] | undefined =>
                attempt.kind === 'waiting' ? attempt.failed?.map(String) : undefined;

            expect(search.attempt(request())).toEqual({ kind: 'waiting' });
            expect(search.attempt(request())).toEqual({ kind: 'waiting' });
            expect(searches).toBe(1);
            await new Promise<void>((resolve) => setImmediate(resolve));

            // The request is not dropped: the attempt says what failed and has searched again.
            expect(failuresOf(search.attempt(request()))).toEqual(['Error: the spawn chunk failed to generate']);
            expect(searches).toBe(2);
            await new Promise<void>((resolve) => setImmediate(resolve));

            // The same failure a second time is not handed over again.
            expect(search.attempt(request())).toEqual({ kind: 'waiting' });
            expect(searches).toBe(3);
        });

        it('answers once a world spawn search that failed works', async () => {
            const overworld = worldOf(Dimensions.Overworld);
            let known: Vector3 | null = null;
            let searches = 0;
            Object.assign(overworld, {
                getKnownSpawnPosition: () => known,
                getSpawnPosition: async () => {
                    searches += 1;
                    if (searches === 1) throw new Error('the spawn chunk failed to generate');
                    known = new Vector3(0, 64, 0);
                    return known;
                }
            });
            const { search } = searchOver({ overworld });

            const answer = await answerOf(search, request());

            expect(answer.spawn).toBe('world');
            expect(answer.block).toEqual({ x: 0, y: 64, z: 0 });
            expect(searches).toBe(2);
        });

        it('lets go of every chunk it asked for when the caller stops asking', () => {
            const { world, admit } = unloadingWorld({
                '15,64,8': 'minecraft:bed',
                '15,64,9': 'minecraft:stone',
                '15,64,7': 'minecraft:stone'
            });
            const { search } = searchOver({ overworld: world });
            const tickets = world.chunkTickets();
            const asked = request({ x: 15, y: 64, z: 8, dimension: Dimensions.Overworld.id });

            expect(search.attempt(asked)).toEqual({ kind: 'waiting' });
            admit();
            expect(search.attempt(asked)).toEqual({ kind: 'waiting' });
            expect([tickets.holds(0, 0), tickets.holds(1, 0)]).toEqual([true, true]);

            search.release(asked.player);
            expect([tickets.holds(0, 0), tickets.holds(1, 0)]).toEqual([false, false]);
            expect(tickets.has(`respawn:${asked.player}`)).toBe(false);
            // Nothing is left to give up a second time.
            search.release(asked.player);
        });
    });
});
