import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { LiveBodies } from '../entity/data/liveBodies';
import type { LiveEntityRuntime } from '../entity/data/live';
import type Server from '../Server';
import { testContent } from '../testing/entityServer';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import { World } from './World';
import { Position } from './Position';
import { GenericEntity } from '../entity/GenericEntity';

/** A world whose dimension's entity runtime is the real one the entity fixture builds. */
const worldWithStore = () => {
    const fixture = entityFixture();
    const errors: unknown[] = [];
    const live = stub<LiveEntityRuntime>({
        runtime: fixture.runtime,
        bodies: stub<LiveBodies>({ entityIdOf: () => undefined }),
        tick: async (tick) => fixture.runtime.tick(tick),
        persist: () => {},
        onEntityRemoved: () => () => false,
        isInRide: () => false,
        restoreExisting: () => undefined
    });
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: (...message) => void errors.push(message[0]),
        debug: () => {},
        verbose: () => {}
    });
    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => live,
        hasEntityRuntime: () => true
    });
    const provider = stub<BaseProvider>({
        readChunk: async (_dimension, x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
    });
    const world = new World({
        name: 'world-change-tick-test',
        path: 'world-change-tick-test',
        server,
        level: fakeLevel({ server, provider }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });
    return { world, runtime: fixture.runtime, errors };
};

describe('a world tick and its change log', () => {
    it('logs an input applied at the input step in the tick it belongs to', async () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');

        // What the ticker does: open the tick, apply the inputs, then update the world.
        world.beginChangeTick();
        await world.runInput(async () => {
            cow.body.nameTag = 'Daisy';
        });
        expect(world.lastChangeTick()).toBeUndefined();
        // The close phase; a full update needs a server this double does not stand in for.
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toContainEqual({
            kind: 'field',
            field: 'entity',
            address: { entity: BigInt(cow.id), field: 'nameTag' },
            before: null,
            after: 'Daisy'
        });
    });

    it('undoes an input that throws and passes the error on', async () => {
        const { world, runtime } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        const before = runtime.savedFormOf(cow);

        world.beginChangeTick();
        await expect(
            world.runInput(async () => {
                cow.instance.attributes.set('health', 1);
                throw new Error('the handler failed');
            })
        ).rejects.toThrow('the handler failed');

        expect(runtime.savedFormOf(cow)).toEqual(before);
        world.sealChangeTick();
        expect(world.lastChangeTick()?.entries).toEqual([]);
    });

    it('names a chunk that enters the world in the tick that admitted it', async () => {
        const { world } = worldWithStore();
        world.beginChangeTick();
        await world.loadChunk(2, 3);
        world.sealChangeTick();

        expect(world.lastChangeTick()?.entries).toContainEqual({ kind: 'chunk', change: 'enter', x: 2, z: 3 });
    });

    it('stops ticking once its store could not undo a unit, and says so once', async () => {
        const { world, runtime, errors } = worldWithStore();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        cow.body.loveTicks = 100;
        world.beginChangeTick();
        runtime.store.unit(() => {
            runtime.store.written(cow, 'not-a-field', 1, 2);
            throw new Error('planned');
        });
        runtime.store.sealTick();

        await world.update(1);
        await world.update(2);

        expect(cow.body.loveTicks).toBe(100);
        expect(errors.filter((line) => String(line).includes('stopped ticking'))).toHaveLength(1);
    });

    it("logs a legacy entity's position and health through the adapter, and undoes them", async () => {
        const { world } = worldWithStore();
        const body = new GenericEntity({
            identifier: 'minecraft:armor_stand',
            position: new Position(1, 64, 1, world)
        });
        await world.addEntity(body);
        const health = body.getHealth();
        const store = world.getEntityStore();
        world.beginChangeTick();

        const outcome = await store.unitAsync(async () => {
            body.restorePosition(new Position(4, 64, 2, world));
            await body.setHealth(health - 1);
            throw new Error('planned');
        });

        expect(outcome.failed).toBe(true);
        expect([body.getPosition().getX(), body.getPosition().getZ(), body.getHealth()]).toEqual([1, 1, health]);

        body.restorePosition(new Position(4, 64, 2, world));
        await body.setHealth(health - 1);
        world.sealChangeTick();
        const id = body.getRuntimeId();
        expect(world.lastChangeTick()?.entries).toEqual([
            {
                kind: 'field',
                field: 'entity',
                address: { entity: id, field: 'position' },
                before: { x: 1, y: 64, z: 1 },
                after: { x: 4, y: 64, z: 2 }
            },
            {
                kind: 'field',
                field: 'entity',
                address: { entity: id, field: 'health' },
                before: health,
                after: health - 1
            }
        ]);
    });
});
