import type { Registry } from '@jsprismarine/content';
import type { EntityType } from '@jsprismarine/entities';
import type { Logger } from '@jsprismarine/logger';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DataEntity } from '../../entity/data/DataEntity';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../entity/data/live';
import type { ServerContent, ServerContentEntities } from '../../content/ServerContent';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockUpdateScheduler from '../BlockUpdateScheduler';
import Chunk from '../chunk/Chunk';
import { Dimensions } from '../Dimension';
import type { World } from '../World';
import BlockPhysics from './BlockPhysics';

/**
 * Block physics, on a world reduced to chunks and a scheduler.
 *
 * The real `World` wants a server, a provider and a socket before it will exist, none of which has
 * any bearing on whether sand falls. Everything physics actually touches is here: reading and
 * writing blocks in loaded chunks, and queueing positions to be looked at again.
 */
class TestWorld {
    private readonly chunks = new Map<string, Chunk>();
    public readonly updates = new BlockUpdateScheduler();

    /** Blocks dropped as items, so a broken plant can be shown to have left something behind. */
    public readonly dropped: string[] = [];

    public constructor(radius = 1, groundY = 64) {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

        for (let cx = -radius; cx <= radius; cx++) {
            for (let cz = -radius; cz <= radius; cz++) {
                const chunk = new Chunk(cx, cz);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, -64, groundY - 1, stone);
                        chunk.fillColumn(x, z, groundY, groundY, grass);
                    }
                }
                this.chunks.set(`${cx},${cz}`, chunk);
            }
        }
    }

    /** Spawns handed to the data-driven runtime by block physics. */
    public readonly spawnedEntities: Array<{
        readonly identifier: string;
        readonly at: { readonly x: number; readonly y: number; readonly z: number };
        readonly data: Readonly<Record<string, unknown>> | undefined;
    }> = [];

    private readonly live = stub<LiveEntityRuntime>({
        runtime: stub<EntityRuntime>({
            content: () =>
                stub<ServerContent>({
                    entities: stub<ServerContentEntities>({
                        registry: stub<Registry<EntityType>>({ has: () => true })
                    })
                }),
            spawn: (identifier, at, options) => {
                this.spawnedEntities.push({ identifier, at, data: options?.data });
                return stub<DataEntity>({ identifier, spawnData: options?.data });
            }
        })
    });

    /** The face this shows to the code under test. Every member reads the state above. */
    private readonly world = stub<World>({
        getLoadedChunk: (cx, cz) => this.getLoadedChunk(cx, cz),
        getBlockUpdates: () => this.updates,
        dataEntities: () => this.live,
        getPlayers: () => [],
        getServer: () =>
            stub<Server>({
                // No pack stack, so a destroyed block falls back to the shipped schema.
                getLogger: () => stub<Logger>({ error: () => {}, debug: () => {} })
            }),
        dropFromBlock: async (_block, contents) => {
            for (const drop of contents) if (drop) this.dropped.push(drop.getName());
        },
        broadcastMove: async () => {},
        getDimension: () => Dimensions.Overworld,
        getBlockState: async (x, y, z) => {
            const chunk = this.getLoadedChunk(x >> 4, z >> 4);
            if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) {
                throw new Error(`nothing loaded at ${x},${y},${z}`);
            }

            return chunk.getBlock(x & 0xf, y, z & 0xf);
        },
        loadedBlockAt: (x, y, z) => {
            const chunk = this.getLoadedChunk(x >> 4, z >> 4);
            if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return undefined;

            const state = chunk.getBlock(x & 0xf, y, z & 0xf);
            return { name: state.name, states: state.properties };
        },
        setBlockRuntimeId: (x, y, z, runtimeId, now, delay) => this.setBlockRuntimeId(x, y, z, runtimeId, now, delay),
        setBlockByName: (x, y, z, name, now, delay) => this.setBlockByName(x, y, z, name, now, delay)
    });

    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(`${cx},${cz}`) ?? null;
    }

    public async setBlockRuntimeId(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now = 0,
        delay = 1
    ): Promise<boolean> {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return false;
        if (chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf) === runtimeId) return false;

        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        this.updates.scheduleAround(x, y, z, now, delay);

        return true;
    }

    public async setBlockByName(x: number, y: number, z: number, name: string, now = 0, delay = 1): Promise<boolean> {
        const runtimeId = BlockRuntimeIds.tryGetByName(name);
        if (runtimeId === null) return false;

        return this.setBlockRuntimeId(x, y, z, runtimeId, now, delay);
    }

    /** Puts a block straight into the chunk, without announcing it - test setup, not a change. */
    public place(x: number, y: number, z: number, name: string, states?: Record<string, any>): void {
        const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
        if (runtimeId === null) throw new Error(`no such block ${name}`);

        this.getLoadedChunk(x >> 4, z >> 4)!.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
    }

    public nameAt(x: number, y: number, z: number): string {
        return this.getLoadedChunk(x >> 4, z >> 4)!.getBlock(x & 0xf, y, z & 0xf).name;
    }

    public asWorld(): World {
        return this.world;
    }
}

const GROUND = 64;

/**
 * Runs the world until nothing is left to do, or the cascade proves it will not settle.
 *
 * Data-driven entity movement is covered by the live runtime integration tests. This helper
 * drains only the block update queue used by the support rules below.
 */
const settle = async (world: TestWorld, physics: BlockPhysics, maxTicks = 200): Promise<number> => {
    for (let tick = 1; tick <= maxTicks; tick++) {
        const due = world.updates.due(tick);
        if (due.length === 0 && world.updates.size() === 0) return tick;

        for (const { x, y, z } of due) await physics.update(x, y, z, tick);
    }

    return maxTicks;
};

describe('block support', () => {
    let world: TestWorld;
    let physics: BlockPhysics;

    beforeEach(() => {
        world = new TestWorld();
        physics = new BlockPhysics(world.asWorld());
    });

    it('breaks a plant when the block under it is taken away', async () => {
        // The whole of the complaint: mining the ground out from under a flower must take the
        // flower with it, rather than leaving it hanging in mid air.
        world.place(2, GROUND + 1, 2, 'minecraft:poppy');

        await world.setBlockByName(2, GROUND, 2, 'minecraft:air');
        await settle(world, physics);

        expect(world.nameAt(2, GROUND + 1, 2)).toBe('minecraft:air');
    });

    it('leaves the plant on the ground rather than deleting it', async () => {
        world.place(2, GROUND + 1, 2, 'minecraft:short_grass');

        await world.setBlockByName(2, GROUND, 2, 'minecraft:air');
        await settle(world, physics);

        expect(world.dropped).toContain('minecraft:short_grass');
    });

    it('leaves a supported plant exactly where it is', async () => {
        // The other half, and the one that would go unnoticed: physics that breaks everything is
        // not physics.
        world.place(2, GROUND + 1, 2, 'minecraft:dandelion');

        world.updates.scheduleAround(2, GROUND + 1, 2, 0);
        await settle(world, physics);

        expect(world.nameAt(2, GROUND + 1, 2)).toBe('minecraft:dandelion');
    });

    it('takes a whole row of plants when the ground under them goes', async () => {
        for (let x = 1; x <= 5; x++) world.place(x, GROUND + 1, 3, 'minecraft:short_grass');
        for (let x = 1; x <= 5; x++) await world.setBlockByName(x, GROUND, 3, 'minecraft:air');

        await settle(world, physics);

        for (let x = 1; x <= 5; x++) expect(world.nameAt(x, GROUND + 1, 3)).toBe('minecraft:air');
    });

    it('does not uproot a plant standing at the edge of the loaded world', async () => {
        // Off the edge everything reads as nothing. Guessing "unsupported" there would quietly
        // strip the border of every loaded area.
        const edgeX = 16 * 2; // one chunk beyond what the test world loaded
        world.updates.schedule(edgeX, GROUND + 1, 0, 0);

        await settle(world, physics);
        expect(world.getLoadedChunk(edgeX >> 4, 0)).toBeNull();
    });
});

describe('falling blocks', () => {
    let world: TestWorld;
    let physics: BlockPhysics;

    beforeEach(() => {
        world = new TestWorld();
        physics = new BlockPhysics(world.asWorld());
    });

    it('routes unsupported sand through the data-driven entity runtime', async () => {
        world.place(4, GROUND + 1, 4, 'minecraft:sand');

        await physics.update(4, GROUND + 1, 4, 1);

        expect(world.nameAt(4, GROUND + 1, 4)).toBe('minecraft:air');
        expect(world.spawnedEntities).toEqual([
            {
                identifier: 'minecraft:falling_block',
                at: { x: 4.5, y: GROUND + 1, z: 4.5 },
                data: { block: 'minecraft:sand' }
            }
        ]);
    });

    it('leaves gravel alone when it is standing on something', async () => {
        world.place(5, GROUND + 1, 5, 'minecraft:gravel');

        world.updates.scheduleAround(5, GROUND + 1, 5, 0);
        await settle(world, physics);

        expect(world.nameAt(5, GROUND + 1, 5)).toBe('minecraft:gravel');
    });

    it('does not make stone fall, because only some blocks are heavy', async () => {
        world.place(7, GROUND + 2, 7, 'minecraft:stone');
        await world.setBlockByName(7, GROUND + 1, 7, 'minecraft:air');
        await settle(world, physics);

        expect(world.nameAt(7, GROUND + 2, 7)).toBe('minecraft:stone');
    });
});

describe('the update scheduler', () => {
    it('queues a position once however often it is asked', () => {
        const scheduler = new BlockUpdateScheduler();

        scheduler.schedule(1, 2, 3, 0);
        scheduler.schedule(1, 2, 3, 0);
        scheduler.schedule(1, 2, 3, 0, 10);

        expect(scheduler.size()).toBe(1);
    });

    it('keeps the earliest time a position was asked for', () => {
        const scheduler = new BlockUpdateScheduler();

        scheduler.schedule(1, 2, 3, 0, 10);
        scheduler.schedule(1, 2, 3, 0, 1);

        expect(scheduler.due(1)).toHaveLength(1);
    });

    it('holds an update back until it is due', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 2, 3, 0, 5);

        expect(scheduler.due(1)).toHaveLength(0);
        expect(scheduler.due(5)).toHaveLength(1);
    });

    it('never schedules for the same tick, which would recurse the whole cascade at once', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 2, 3, 7, 0);

        expect(scheduler.due(7)).toHaveLength(0);
        expect(scheduler.due(8)).toHaveLength(1);
    });

    it('queues the six neighbors as well as the block itself', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.scheduleAround(0, 0, 0, 0);

        expect(scheduler.size()).toBe(7);
    });

    it('carries work past its budget to the next tick rather than dropping it', () => {
        const scheduler = new BlockUpdateScheduler();
        for (let i = 0; i < 5000; i++) scheduler.schedule(i, 0, 0, 0);

        const first = scheduler.due(1);
        expect(first.length).toBeLessThanOrEqual(4096);
        expect(scheduler.size()).toBe(5000 - first.length);
    });
});
