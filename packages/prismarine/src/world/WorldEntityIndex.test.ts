import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { StoreActors } from '../entity/data/storeActors';
import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { moveStorePlayer } from '../entity/data/storePlayers';
import { enteredStorePlayer } from '../testing/storePlayer.test.helper';
import { Dimensions } from './DimensionType';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/** A world over a real entity runtime, whose index is the one under test. */
const indexedWorld = () => {
    const fixture = entityFixture();
    const live = stub<LiveEntityRuntime>({
        runtime: fixture.runtime,
        actors: stub<StoreActors>({ all: () => [][Symbol.iterator](), actorOf: () => undefined }),
        restoreExisting: () => undefined
    });
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        players: new Map(),
        dimension: Dimensions.Overworld,
        server: testEntityServer({ entityRuntime: live })
    });
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    return { world, index: fixture.runtime.index, runtime: fixture.runtime };
};

const Y = FLOOR_Y + 1;

describe('the entity index over a world', () => {
    it('sees a dropped stack where the store moved it, and only as a stack', () => {
        const { world, runtime } = indexedWorld();
        const entity = runtime.droppedItems.spawn(
            { x: 0.5, y: Y, z: 0.5 },
            { stack: { name: 'minecraft:dirt', count: 1 } }
        );
        if (entity === undefined) throw new Error('the fixture declares no dropped item');
        expect(world.getEntityIndex().itemsWithin(0.5, 0.5, 0.5)).toEqual([entity]);

        entity.position = { x: 40.5, y: Y, z: 0.5 };
        expect(world.getEntityIndex().itemsWithin(0.5, 0.5, 0.5)).toEqual([]);
        expect(world.getEntityIndex().itemsWithin(40.5, 0.5, 0.5)).toEqual([entity]);
        expect(world.getEntityIndex().storeWithin(40.5, 0.5, 1)).toEqual([]);

        // Gone from the store, so no query finds it as a stack any more.
        runtime.remove(entity.id, 'merged');
        expect(world.getEntityIndex().itemsWithin(40.5, 0.5, 0.5)).toEqual([]);
    });

    it('sees a store player where its last write put it', () => {
        const { world, runtime } = indexedWorld();
        const { player, entity } = enteredStorePlayer({ runtime });

        // The write the input step makes for a client-owned move.
        moveStorePlayer(runtime, player, {
            position: { x: -30.5, y: Y, z: 4.5 },
            yaw: 0,
            pitch: 0,
            onGround: true,
            headYaw: 0
        });

        expect(world.getEntityIndex().storeWithin(-30.5, 4.5, 1)).toEqual([entity]);
        expect(world.getEntityIndex().storeWithin(0.5, 0.5, 1)).toEqual([]);
    });

    it('leaves nothing behind once everything it filed is removed', () => {
        const { index, runtime } = indexedWorld();
        const cow = runtime.spawn('minecraft:cow', { x: 17.5, y: Y, z: 0.5 });
        const item = runtime.droppedItems.spawn(
            { x: 0.5, y: Y, z: 0.5 },
            { stack: { name: 'minecraft:dirt', count: 1 } }
        );
        if (cow === undefined || item === undefined) throw new Error('the fixture declares no cow or dropped item');
        item.position = { x: 33.5, y: Y, z: 0.5 };
        expect(index.size).toBe(2);

        for (const entity of [cow, item]) runtime.remove(entity.id, 'test');

        expect(index.size).toBe(0);
        expect(index.occupiedCells).toBe(0);
    });
});
