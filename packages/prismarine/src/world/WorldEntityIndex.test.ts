import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { StoreActors } from '../entity/data/storeActors';
import { GenericEntity } from '../testing/genericEntity.test.helper';
import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { moveStorePlayer } from '../entity/data/storePlayers';
import { enteredStorePlayer } from '../testing/storePlayer.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
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
    /** The chunk each non-player entity is filed under, which chunk save and unload read. */
    const entityChunkIndices = new Map<number, number>();
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        entities: new Map(),
        entityChunkIndices,
        players: new Map(),
        dimension: Dimensions.Overworld,
        server: testEntityServer({ entityRuntime: live })
    });
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    return { world, entityChunkIndices, index: fixture.runtime.index, runtime: fixture.runtime };
};

const Y = FLOOR_Y + 1;

/**
 * Legacy runtime ids, kept clear of the fixture runtime's, which counts from one. A live server
 * draws both from one counter; the fixture does not, so a test picks ids that cannot collide.
 */
let nextLegacyId = 1_000n;

/** A legacy entity the world holds with no store entity behind it. */
const legacyEntity = (world: World, x: number, z: number): GenericEntity =>
    new GenericEntity({
        identifier: 'minecraft:armor_stand',
        position: new Position(x, Y, z, world),
        runtimeId: nextLegacyId++
    });

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

    it("moves a legacy entity's chunk membership with its position write", async () => {
        const { world, entityChunkIndices } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);
        await world.addEntity(item);
        const id = Number(item.getRuntimeId());
        expect(entityChunkIndices.get(id)).toBe(Chunk.packXZ(0, 0));

        // Suppressed, which used to leave the chunk a save would write the item into behind.
        await item.setX(40.5, true);
        expect(entityChunkIndices.get(id)).toBe(Chunk.packXZ(2, 0));

        await world.removeEntity(item);
        expect(entityChunkIndices.has(id)).toBe(false);
    });

    it('does not file an entity a world does not hold, even when its position names that world', async () => {
        const { world, entityChunkIndices } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);

        await item.setPosition({ position: new Vector3(8.5, Y, 0.5) });

        expect(entityChunkIndices.size).toBe(0);
    });
});
