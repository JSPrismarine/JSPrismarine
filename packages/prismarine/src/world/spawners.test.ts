import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { assert, describe, expect, it } from 'vitest';

import { MobSpawner } from '../blockentity/BlockEntities';
import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../entity/data/live';
import { StoreActor } from '../entity/data/storeActors';
import type { StoreActors } from '../entity/data/storeActors';
import type { DataEntity } from '../entity/data/DataEntity';
import type Server from '../Server';
import { EntityStore } from '../entity/data/EntityStore';
import { sealBlockKinds } from '../testing/sealedBlocks.test.helper';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { stub, stubOf } from '../testing/stub.test.helper';
import type PlayerSession from '../network/PlayerSession';
import { EYE_HEIGHT } from '../entity/playerEyes';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import { World } from './World';
import { tickSpawner } from './spawners';
import type { SpawnerSurroundings } from './spawners';

/** A spawner at (10, 20, 30) with the fields given, over vanilla's defaults for the rest. */
const spawnerWith = (fields: Record<string, number | string> = {}): MobSpawner => {
    const root = new NBTTagCompound('');
    root.addValue('id', new Types.StringVal('MobSpawner'));
    root.addValue('x', new Types.NumberVal(10));
    root.addValue('y', new Types.NumberVal(20));
    root.addValue('z', new Types.NumberVal(30));
    root.addValue('EntityIdentifier', new Types.StringVal('minecraft:zombie'));
    for (const [key, value] of Object.entries(fields)) {
        root.addValue(key, typeof value === 'string' ? new Types.StringVal(value) : new Types.ShortVal(value));
    }
    const spawner = BlockEntityRegistry.fromNBT(root);
    assert(spawner instanceof MobSpawner);
    return spawner;
};

/** Surroundings with a player near, open ground everywhere, nobody around, and a fixed roll. */
const around = (overrides: Partial<SpawnerSurroundings> = {}, roll = 0.5): SpawnerSurroundings => ({
    random: () => roll,
    isPlayerWithin: () => true,
    countNearby: () => 0,
    canSpawnAt: () => true,
    ...overrides
});

describe('world', () => {
    describe('tickSpawner', () => {
        it('does nothing for a spawner with no mob', () => {
            const spawner = spawnerWith({ EntityIdentifier: '' });

            expect(tickSpawner(spawner, around())).toBeUndefined();
        });

        it('does nothing, not even the countdown, with nobody in range', () => {
            const spawner = spawnerWith({ Delay: 5 });
            let asked: number | undefined;

            const ticked = tickSpawner(
                spawner,
                around({
                    isPlayerWithin: (range) => {
                        asked = range;
                        return false;
                    }
                })
            );

            expect(ticked).toBeUndefined();
            expect(asked).toBe(16);
        });

        it('counts the delay down by one while a player is near', () => {
            const spawner = spawnerWith({ Delay: 5 });

            const ticked = tickSpawner(spawner, around());

            expect(ticked?.spawns).toEqual([]);
            expect(ticked?.tags.getShort('Delay', -1)).toBe(4);
        });

        it('spawns SpawnCount mobs around the block at zero and draws the next delay', () => {
            const spawner = spawnerWith({ Delay: 0, MinSpawnDelay: 200, MaxSpawnDelay: 800 });

            // A fixed half: every offset lands on the block's center column, the row roll picks
            // the spawner's own row, and the delay lands halfway between the bounds.
            const ticked = tickSpawner(spawner, around({}, 0.5));

            expect(ticked?.spawns).toHaveLength(4);
            expect(ticked?.spawns[0]).toEqual({ x: 10.5, y: 20, z: 30.5 });
            expect(ticked?.tags.getShort('Delay', -1)).toBe(500);
        });

        it('lands spawns inside the range and one row above or below', () => {
            const spawner = spawnerWith({ Delay: 0, SpawnCount: 1 });

            // Rolls read in order: x offset twice, the row, z offset twice.
            const rolls = [1 - Number.EPSILON, 0, 0.99, 0, 1 - Number.EPSILON];
            const ticked = tickSpawner(spawner, around({ random: () => rolls.shift() ?? 0 }));

            const [spawn] = ticked?.spawns ?? [];
            expect(spawn?.x).toBeCloseTo(10.5 + 4, 5);
            expect(spawn?.y).toBe(21);
            expect(spawn?.z).toBeCloseTo(30.5 - 4, 5);
        });

        it('skips a position nothing can stand in and tries again next tick', () => {
            const spawner = spawnerWith({ Delay: 0 });

            const ticked = tickSpawner(spawner, around({ canSpawnAt: () => false }));

            expect(ticked?.spawns).toEqual([]);
            // Nothing spawned and the area was not full, so the delay stays at zero: Java
            // retries every tick until a spot opens.
            expect(ticked?.tags.getShort('Delay', -1)).toBe(0);
        });

        it('waits instead when MaxNearbyEntities of the mob already stand there', () => {
            const spawner = spawnerWith({ Delay: 0, MaxNearbyEntities: 6, MinSpawnDelay: 100, MaxSpawnDelay: 100 });
            const counted: [string, number][] = [];

            const ticked = tickSpawner(
                spawner,
                around({
                    countNearby: (identifier, range) => {
                        counted.push([identifier, range]);
                        return 6;
                    }
                })
            );

            expect(ticked?.spawns).toEqual([]);
            expect(ticked?.tags.getShort('Delay', -1)).toBe(100);
            expect(counted).toEqual([['minecraft:zombie', 4]]);
        });

        it('counts what it spawned this cycle toward the crowd', () => {
            const spawner = spawnerWith({ Delay: 0, MaxNearbyEntities: 2, SpawnCount: 4 });

            const ticked = tickSpawner(spawner, around({ countNearby: () => 0 }));

            expect(ticked?.spawns).toHaveLength(2);
        });

        it('uses the lower bound alone when the bounds meet', () => {
            const spawner = spawnerWith({ Delay: 0, MinSpawnDelay: 300, MaxSpawnDelay: 300 });

            const ticked = tickSpawner(spawner, around({}, 0.9));

            expect(ticked?.tags.getShort('Delay', -1)).toBe(300);
        });
    });
});

/** The runtime id of a block state with no properties. */
const idOf = (identifier: string): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, {});
    if (runtimeId === null) throw new Error(`no ${identifier} in this server's catalog`);
    return runtimeId;
};

/**
 * A world built on the real prototype around one chunk: a stone floor at 63, a spawner block at
 * (5, 64, 5) carrying a zombie spawner ready to fire, and a recording data runtime.
 */
const worldWithSpawner = ({ playerAt, delay = 0 }: { playerAt: Vector3; delay?: number }) => {
    const chunk = new Chunk(0, 0);
    for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++) chunk.setBlockRuntimeId(x, 63, z, idOf('minecraft:stone'));
    chunk.setBlockRuntimeId(5, 64, 5, idOf('minecraft:mob_spawner'));

    const root = new NBTTagCompound('');
    root.addValue('id', new Types.StringVal('MobSpawner'));
    root.addValue('x', new Types.NumberVal(5));
    root.addValue('y', new Types.NumberVal(64));
    root.addValue('z', new Types.NumberVal(5));
    root.addValue('EntityIdentifier', new Types.StringVal('minecraft:zombie'));
    root.addValue('Delay', new Types.ShortVal(delay));
    chunk.setBlockEntity(BlockEntityRegistry.fromNBT(root));

    const spawned: { identifier: string; x: number; y: number; z: number }[] = [];
    /** The store entities already standing in the world, through their actors. */
    const crowd: StoreActor[] = [];
    // A real store, so the spawner's writes are logged as a tick logs them.
    const store = new EntityStore();
    store.beginTick();
    const runtime = stub<EntityRuntime>({
        store,
        content: () => ({ entities: { registry: { has: () => true } } }) as never,
        spawn: (identifier, at) => {
            spawned.push({ identifier, ...at });
            return undefined;
        }
    });
    // Five rolls per attempt: two for x, one for the row, two for z. Three quarters less a
    // quarter puts every spawn two blocks east of the block, in its own row, on its own z, so
    // the spot is open air over the stone floor rather than the spawner block itself. The
    // delay draw that follows reads the first roll again.
    const rolls = [0.75, 0.25, 0.5, 0.5, 0.5];
    let draws = 0;
    const server = stub<Server>({
        getRandom: () => () => rolls[draws++ % rolls.length] ?? 0.5,
        getEntityRuntime: () =>
            stub<LiveEntityRuntime>({
                runtime,
                actors: stub<StoreActors>({ all: () => crowd[Symbol.iterator]() })
            }),
        getLogger: () => ({ debug: () => {} }) as never,
        hasEntityRuntime: () => true
    });

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        players: new Map(),
        dimension: Dimensions.Overworld,
        systems: {},
        server
    });
    const eyes = () => new Position(playerAt.getX(), playerAt.getY() + EYE_HEIGHT, playerAt.getZ(), world);
    // The spawner measures from where the player's client sees the world from, its eyes.
    const player = stub<PlayerSession>({ isConnected: () => true, getViewPosition: eyes });
    world['players'].set(1, player);

    // The sink the constructor would have set, which reads the sealed ticks too.
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    /** What the open tick changed in the blocks, which seals it and opens the next. */
    const written = (): string[] => sealBlockKinds(store);

    /** One spawner pass over every chunk, the way the tick runs it. */
    const references = { getRevision: () => 0, simulates: () => true };
    const tick = () => world['tickSpawners'](references as never);

    return { world, chunk, spawned, written, tick, crowd };
};

describe('World', () => {
    describe('spawners in a ticking world', () => {
        it('spawns the mob through the data runtime on open ground around the block', () => {
            const { spawned, chunk, written, tick } = worldWithSpawner({ playerAt: new Vector3(8, 64, 8) });

            tick();

            // Four attempts, each landing two blocks east with its feet in the spawner's row,
            // which is open above the stone floor.
            expect(spawned).toHaveLength(4);
            expect(spawned[0]).toEqual({ identifier: 'minecraft:zombie', x: 7.5, y: 64, z: 5.5 });
            // The delay is written back where the clients and the save read it: 200 plus
            // three quarters of the 600 between the bounds.
            const standing = chunk.getBlockEntity(5, 64, 5);
            assert(standing instanceof MobSpawner);
            expect(standing.getDelay()).toBe(650);
            expect(written()).toEqual(['block-entity']);
        });

        it('leaves the spawner alone with no player within sixteen blocks', () => {
            const { spawned, written, tick } = worldWithSpawner({ playerAt: new Vector3(30, 64, 5) });

            tick();

            expect(spawned).toEqual([]);
            expect(written()).toEqual([]);
        });

        it('counts the delay down for a player in range', () => {
            const { chunk, spawned, tick } = worldWithSpawner({ playerAt: new Vector3(8, 64, 8), delay: 3 });

            tick();

            expect(spawned).toEqual([]);
            const standing = chunk.getBlockEntity(5, 64, 5);
            assert(standing instanceof MobSpawner);
            expect(standing.getDelay()).toBe(2);
        });

        it('holds back when six of the mob already crowd the spawner', () => {
            const { spawned, chunk, tick, crowd } = worldWithSpawner({ playerAt: new Vector3(8, 64, 8) });
            // Stand-ins for the zombies already there, inside the box the block inflates to.
            for (let index = 0; index < 6; index++) {
                const position = new Vector3(6 + index * 0.1, 64, 6);
                crowd.push(
                    stubOf(StoreActor, {
                        entity: stub<DataEntity>({
                            identifier: 'minecraft:zombie',
                            position: { x: position.getX(), y: position.getY(), z: position.getZ() }
                        })
                    })
                );
            }

            tick();

            expect(spawned).toEqual([]);
            // Full counts as a cycle: the delay is drawn afresh rather than left at zero.
            const standing = chunk.getBlockEntity(5, 64, 5);
            assert(standing instanceof MobSpawner);
            expect(standing.getDelay()).toBe(650);
        });
    });
});
