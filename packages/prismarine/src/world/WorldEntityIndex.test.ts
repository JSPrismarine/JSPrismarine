import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol/packet/MovePlayerPacket';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { LiveBodies } from '../entity/data/liveBodies';
import type { Entity } from '../entity/Entity';
import { GenericEntity } from '../entity/GenericEntity';
import { EyeOfEnderSignal } from '../entity/other/EyeOfEnderSignal';
import type { DataEntity } from '../entity/data/DataEntity';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import { ItemActorBody } from '../entity/data/itemBodies';
import type { ItemBodies } from '../entity/data/itemBodies';
import { Item as ItemStack } from '../item/Item';
import { testEntityServer } from '../testing/entityServer';
import { stub, stubOf } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/** A world over a real entity runtime, whose index is the one under test. */
const indexedWorld = () => {
    const fixture = entityFixture();
    /** The data entity each body stands for, which `World.addEntity` asks about. */
    const bodies = new Map<Entity, number>();
    const live = stub<LiveEntityRuntime>({
        runtime: fixture.runtime,
        bodies: stub<LiveBodies>({ entityIdOf: (entity) => bodies.get(entity) }),
        itemBodies: stub<ItemBodies>({ entityIdOf: (entity) => bodies.get(entity) }),
        removeBody: () => false,
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
    return { world, bodies, entityChunkIndices, index: fixture.runtime.index, runtime: fixture.runtime };
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

/** A dropped stack of the store and the body the world holds for it. */
const droppedItem = (
    world: World,
    runtime: EntityRuntime,
    bodies: Map<Entity, number>,
    x: number,
    z: number
): { entity: DataEntity; body: ItemActorBody } => {
    const entity = runtime.droppedItems.spawn({ x, y: Y, z }, { stack: { name: 'minecraft:dirt', count: 1 } });
    if (entity === undefined) throw new Error('the fixture declares no dropped item');
    const body = new ItemActorBody(entity, runtime.droppedItems, world);
    bodies.set(body, entity.id);
    return { entity, body };
};

const eyeOfEnder = (world: World, x: number, z: number): EyeOfEnderSignal =>
    new EyeOfEnderSignal({
        position: new Position(x, Y, z, world),
        item: new ItemStack({ runtimeId: 0, name: 'minecraft:ender_eye' }),
        random: () => 0.5,
        runtimeId: nextLegacyId++
    });

/** A player with no connection, which is all a position write needs. */
const playerAt = async (world: World, x: number, z: number): Promise<Player> => {
    const runtimeId = nextLegacyId++;
    const player = stubOf(Player, {
        getRuntimeId: () => runtimeId,
        getType: () => 'minecraft:player',
        isOnline: () => true
    });
    await player.setPlayerPosition({ position: new Position(x, Y, z, world), type: PositionMode.Teleport }, false);
    return player;
};

/** Whether a legacy query at a point finds this entity. */
const finds = (world: World, entity: Entity, x: number, z: number): boolean =>
    world.getEntityIndex().legacyWithin(x, z, 1).includes(entity);

describe('the entity index over a world', () => {
    it('sees a dropped stack where the store moved it, before its body catches up', async () => {
        const { world, runtime, bodies } = indexedWorld();
        const { entity, body } = droppedItem(world, runtime, bodies, 0.5, 0.5);
        await world.addEntity(body);
        expect(finds(world, body, 0.5, 0.5)).toBe(true);

        entity.position = { x: 40.5, y: Y, z: 0.5 };
        expect(finds(world, body, 0.5, 0.5)).toBe(false);
        expect(finds(world, body, 40.5, 0.5)).toBe(true);
        expect(world.getEntityIndex().itemsWithin(40.5, 0.5, 0.5)).toEqual([entity]);

        // Gone from the store, so no query finds it as a stack any more.
        runtime.remove(entity.id, 'merged');
        expect(world.getEntityIndex().itemsWithin(40.5, 0.5, 0.5)).toEqual([]);
    });

    it('sees an eye of ender and a player where their last write put them', async () => {
        const { world } = indexedWorld();
        const eye = eyeOfEnder(world, 0.5, 0.5);
        const player = await playerAt(world, 0.5, 0.5);
        await world.addEntity(eye);
        await world.addEntity(player);

        await eye.setPosition({ position: new Vector3(20.5, Y, 20.5) });
        // The write a movement handler makes for a client-owned move.
        await player.setPlayerPosition({ position: new Vector3(-30.5, Y, 4.5) }, false);

        expect(finds(world, eye, 20.5, 20.5)).toBe(true);
        expect(finds(world, player, -30.5, 4.5)).toBe(true);
        expect(finds(world, player, 0.5, 0.5)).toBe(false);
    });

    it('answers a legacy query with data entities and legacy entities in ascending runtime id order', async () => {
        const { world, bodies, runtime } = indexedWorld();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: Y, z: 0.5 });
        if (cow === undefined) throw new Error('the fixture declares no cow');
        const body = stubOf(GenericEntity, {
            getRuntimeId: () => BigInt(cow.id),
            getType: () => 'minecraft:cow',
            getPosition: () => new Position(0.5, Y, 0.5, world),
            persistentNbt: null
        });
        bodies.set(body, cow.id);
        const item = droppedItem(world, runtime, bodies, 1.5, 0.5).body;
        const player = await playerAt(world, 2.5, 0.5);

        // Filed highest id first, so the answer's order cannot be the order things arrived in.
        await world.addEntity(player);
        await world.addEntity(item);
        await world.addEntity(body);

        const found = world.getEntityIndex().legacyWithin(1, 0.5, 4);
        expect(found).toEqual([body, item, player]);
        // The body is the data entity's, so it is one entry, not two.
        expect(found.filter((entity) => entity === body)).toHaveLength(1);
    });

    it('leaves nothing behind once everything it filed is removed', async () => {
        const { world, index } = indexedWorld();
        const item = legacyEntity(world, 0.5, 0.5);
        const eye = eyeOfEnder(world, 17.5, 0.5);
        const player = await playerAt(world, -17.5, 0.5);
        for (const entity of [item, eye, player]) await world.addEntity(entity);
        await item.setPosition({ position: new Vector3(33.5, Y, 0.5) });
        expect(index.size).toBe(3);

        for (const entity of [item, eye, player]) await world.removeEntity(entity);

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
