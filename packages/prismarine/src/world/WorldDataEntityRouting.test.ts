import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { DataEntity } from '../entity/data/DataEntity';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { LiveBodies } from '../entity/data/liveBodies';
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

describe('World.addEntity data-runtime routing', () => {
    it('restores a supported entity body into the data-driven runtime', async () => {
        const body = bodyOf('minecraft:cow');
        const restored: Entity[] = [];
        const migrated = stub<DataEntity>({});
        const live = stub<LiveEntityRuntime>({
            bodies: stub<LiveBodies>({ entityIdOf: () => undefined }),
            restoreExisting: (stored) => {
                restored.push(stored);
                return migrated;
            }
        });
        const world = worldOf(live);

        await world.addEntity(body);

        expect(restored).toEqual([body]);
        expect(world.getEntity(body.getRuntimeId())).toBeNull();
    });

    it('keeps an unsupported entity body in the world', async () => {
        const body = bodyOf('test:unknown');
        const live = stub<LiveEntityRuntime>({
            bodies: stub<LiveBodies>({ entityIdOf: () => undefined }),
            restoreExisting: () => undefined
        });
        const world = worldOf(live);

        await world.addEntity(body);

        expect(world.getEntity(body.getRuntimeId())).toBe(body);
    });

    it('does not re-import a body already owned by the data runtime', async () => {
        const body = bodyOf('minecraft:cow');
        const restored: Entity[] = [];
        const live = stub<LiveEntityRuntime>({
            bodies: stub<LiveBodies>({ entityIdOf: () => 42 }),
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
