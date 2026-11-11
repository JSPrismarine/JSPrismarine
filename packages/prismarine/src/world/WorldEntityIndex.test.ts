import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol/packet/MovePlayerPacket';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { StoreActors } from '../entity/data/storeActors';
import type { Entity } from '../entity/Entity';
import { GenericEntity } from '../testing/genericEntity.test.helper';
import { testEntityServer } from '../testing/entityServer';
import { stub, stubOf } from '../testing/stub.test.helper';
import { withPlayerComponents } from '../testing/playerDouble.test.helper';
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

/** A player with no connection, which is all a position write needs. */
const playerAt = async (world: World, x: number, z: number): Promise<Player> => {
    const runtimeId = nextLegacyId++;
    const player = withPlayerComponents(
        stubOf(Player, {
            getRuntimeId: () => runtimeId,
            getType: () => 'minecraft:player',
            isOnline: () => true
        })
    );
    await player.setPlayerPosition({ position: new Position(x, Y, z, world), type: PositionMode.Teleport }, false);
    return player;
};

/** Whether a legacy query at a point finds this entity. */
const finds = (world: World, entity: Entity, x: number, z: number): boolean =>
    world.getEntityIndex().legacyWithin(x, z, 1).includes(entity);

describe('the entity index over a world', () => {
    it('sees a dropped stack where the store moved it, and never as a legacy entity', () => {
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
        expect(world.getEntityIndex().legacyWithin(40.5, 0.5, 1)).toEqual([]);

        // Gone from the store, so no query finds it as a stack any more.
        runtime.remove(entity.id, 'merged');
        expect(world.getEntityIndex().itemsWithin(40.5, 0.5, 0.5)).toEqual([]);
    });

    it('sees a legacy entity and a player where their last write put them', async () => {
        const { world } = indexedWorld();
        const stand = legacyEntity(world, 0.5, 0.5);
        const player = await playerAt(world, 0.5, 0.5);
        await world.addEntity(stand);
        await world.addPlayer(player);

        await stand.setPosition({ position: new Vector3(20.5, Y, 20.5) });
        // The write a movement handler makes for a client-owned move.
        await player.setPlayerPosition({ position: new Vector3(-30.5, Y, 4.5) }, false);

        expect(finds(world, stand, 20.5, 20.5)).toBe(true);
        expect(finds(world, player, -30.5, 4.5)).toBe(true);
        expect(finds(world, player, 0.5, 0.5)).toBe(false);
    });

    it('answers a legacy query with the legacy entities only, in ascending runtime id order', async () => {
        const { world, runtime } = indexedWorld();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        const stand = legacyEntity(world, 1.5, 0.5);
        const player = await playerAt(world, 2.5, 0.5);

        // Filed highest id first, so the answer's order cannot be the order things arrived in.
        await world.addPlayer(player);
        await world.addEntity(stand);

        // A store entity is found through `storeWithin`, as its actor.
        expect(world.getEntityIndex().legacyWithin(1, 0.5, 4)).toEqual([stand, player]);
        expect(world.getEntityIndex().storeWithin(1, 0.5, 4)).toEqual([cow]);
    });

    it('leaves nothing behind once everything it filed is removed', async () => {
        const { world, index } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);
        const stand = legacyEntity(world, 17.5, 0.5);
        const player = await playerAt(world, -17.5, 0.5);
        for (const entity of [item, stand, player]) await world.addEntity(entity);
        await item.setPosition({ position: new Vector3(33.5, Y, 0.5) });
        expect(index.size).toBe(3);

        for (const entity of [item, stand, player]) await world.removeEntity(entity);

        expect(index.size).toBe(0);
        expect(index.occupiedCells).toBe(0);
    });

    it('moves an entity out of one world index and into the next on a dimension change', async () => {
        const from = indexedWorld();
        const to = indexedWorld();
        const item = legacyEntity(from.world, 0.5, 0.5);
        await from.world.addEntity(item);

        // The order `DimensionTravel` uses: out of the old world, moved, into the new one.
        await from.world.removeEntity(item);
        await item.setPosition({ position: new Position(8.5, Y, 8.5, to.world), teleport: true });
        await to.world.addEntity(item);

        expect(from.index.size).toBe(0);
        expect(from.index.occupiedCells).toBe(0);
        expect(to.world.getEntityIndex().legacyWithin(8.5, 8.5, 0.5)).toEqual([item]);
    });

    it('moves chunk membership with the same write that refiles the index', async () => {
        const { world, entityChunkIndices } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);
        await world.addEntity(item);
        const id = Number(item.getRuntimeId());
        expect(entityChunkIndices.get(id)).toBe(Chunk.packXZ(0, 0));

        // Suppressed, which used to leave the chunk a save would write the item into behind.
        await item.setX(40.5, true);
        expect(entityChunkIndices.get(id)).toBe(Chunk.packXZ(2, 0));
        expect(world.getEntityIndex().legacyWithin(40.5, 0.5, 0.5)).toEqual([item]);

        await world.removeEntity(item);
        expect(entityChunkIndices.has(id)).toBe(false);
    });

    it('does not file an entity a world does not hold, even when its position names that world', async () => {
        const { world, index } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);

        await item.setPosition({ position: new Vector3(8.5, Y, 0.5) });

        expect(index.size).toBe(0);
    });
});
