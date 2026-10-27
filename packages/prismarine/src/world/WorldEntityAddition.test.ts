import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from './Dimension';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { World } from './World';

const bodyOf = (identifier: string): Entity =>
    stub<Entity>({
        getRuntimeId: () => 1n,
        getType: () => identifier,
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
    it('adds the body without importing it into the data-driven runtime', async () => {
        const body = bodyOf('minecraft:cow');
        const restored: Entity[] = [];
        const live = stub<LiveEntityRuntime>({
            restoreExisting: (stored) => {
                restored.push(stored);
                return undefined;
            }
        });
        const world = worldOf(live);

        await world.addEntity(body);

        expect(restored).toEqual([]);
        expect(world.getEntity(body.getRuntimeId())).toBe(body);
    });
});
