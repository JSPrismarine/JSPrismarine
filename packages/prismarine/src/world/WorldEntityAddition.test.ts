import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { StoreActors } from '../entity/data/storeActors';
import { Entity } from '../entity/Entity';
import { stub, stubOf } from '../testing/stub.test.helper';
import { Dimensions } from './Dimension';
import { inertEntityRuntime } from '../testing/entityServer';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { World } from './World';
import { Position } from './Position';

const bodyOf = (identifier: string, world: World): Entity =>
    stubOf(Entity, {
        getRuntimeId: () => 1n,
        getType: () => identifier,
        getPosition: () => new Position(0.5, 64, 0.5, world),
        persistentNbt: null
    });

const worldOf = (live: LiveEntityRuntime): World => {
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        players: new Map(),
        dimension: Dimensions.Overworld,
        server: stub<Server>({ getEntityRuntime: () => live }),
        markEntityChunkChanged: () => undefined
    });
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    return world;
};

describe('World.addEntity', () => {
    it('keeps the entity it is given in the world, without offering it to the store', async () => {
        // A saved actor reaches the store from its record, never through `addEntity`.
        const offered: unknown[] = [];
        const live = stub<LiveEntityRuntime>({
            actors: stub<StoreActors>({ all: () => [][Symbol.iterator](), actorOf: () => undefined }),
            restoreExisting: (stored) => {
                offered.push(stored);
                return undefined;
            },
            runtime: inertEntityRuntime().runtime
        });
        const world = worldOf(live);
        const body = bodyOf('minecraft:cow', world);

        await world.addEntity(body);

        expect(offered).toEqual([]);
        expect(world.getEntity(body.getRuntimeId())).toBe(body);
    });
});

describe('World.entityRelocated', () => {
    it('initializes the reverse chunk index when a prototype world tracks entity movement', () => {
        const entities = new Map<number, Entity>();
        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            entities,
            entityChunkIndices: new Map(),
            dimension: Dimensions.Overworld,
            server: stub<Server>({ getEntityRuntime: () => inertEntityRuntime() })
        });
        world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
        const entity = stubOf(Entity, {
            getRuntimeId: () => 42n,
            getType: () => 'minecraft:cow',
            getPosition: () => new Position(32, 64, -16, world),
            persistentNbt: null
        });
        entities.set(42, entity);

        world.entityRelocated(entity);
    });
});
