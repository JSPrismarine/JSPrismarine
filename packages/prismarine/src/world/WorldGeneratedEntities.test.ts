import { Registry } from '@jsprismarine/content';
import type { EntityPosition, EntityType } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import type { ServerContent } from '../content/ServerContent';
import type { EntityRuntime } from '../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../entity/data/live';
import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { World } from './World';

/**
 * The seam between world generation and the world.
 *
 * The generator has no world to add entities to, so it records what should be there and the world
 * creates them when the chunk is first loaded. Everything either side of that handover is tested
 * elsewhere - this is the handover itself, which is where a village's inhabitants either appear
 * once, appear a dozen times, or never appear at all.
 */

/** A registry that carries the named types and nothing else. */
const registryOf = (identifiers: readonly string[]): Registry<EntityType> => {
    const registry = new Registry<EntityType>('entities');
    registry.rebuild(identifiers.map((identifier) => [identifier, stub<EntityType>({ identifier })]));
    return registry;
};

/** One spawn the world asked the data-driven runtime for. */
interface Asked {
    readonly identifier: string;
    readonly at: EntityPosition;
    readonly yaw: number | undefined;
}

/** A world reduced to what loading a chunk touches: no disk, no network, no generator. */
const worldLoading = (
    chunk: Chunk,
    declared: readonly string[] = ['minecraft:villager_v2', 'minecraft:iron_golem']
) => {
    const added: Entity[] = [];
    const asked: Asked[] = [];

    const content = stub<ServerContent>({ entities: { registry: registryOf(declared) } as ServerContent['entities'] });
    const live = stub<LiveEntityRuntime>({
        runtime: stub<EntityRuntime>({
            content: () => content,
            spawn: (identifier, at, options) => {
                asked.push({ identifier, at, yaw: options?.yaw });
                return undefined;
            }
        })
    });

    const world: World = Object.assign(Object.create(World.prototype), {
        entities: new Map(),
        entityChunkIndices: new Map(),
        chunks: new Map(),
        // `loadChunk` joins a load already in flight through this, and a world built on the
        // prototype never ran the constructor that would have made it.
        loading: new Map(),
        seed: 1,
        generator: {},
        config: {},
        provider: { readChunk: async () => chunk },
        systems: { onChunkLoaded: () => {} },
        addEntity: async (entity: Entity) => void added.push(entity),
        dataEntities: () => live,
        server: { getLogger: () => ({ debug: () => {}, warn: () => {} }), getContent: () => content }
    });

    return { world, added, asked };
};

describe('mobs left by world generation', () => {
    it('are spawned into the data-driven runtime when the chunk is loaded', async () => {
        // The runtime and not a body, because a village's villager wants its components, its
        // brain and its trades, and only the runtime gives it them.
        const chunk = new Chunk(0, 0);
        chunk
            .getEntitySpawns()
            .push(
                { type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5, yaw: 90 },
                { type: 'minecraft:iron_golem', x: 4.5, y: 70, z: 4.5 }
            );

        const { world, asked } = worldLoading(chunk);
        await world.loadChunk(0, 0);

        expect(asked.map((spawn) => spawn.identifier)).toEqual(['minecraft:villager_v2', 'minecraft:iron_golem']);

        // At the coordinates generation asked for, facing the way it asked.
        expect(asked[0]!.at).toEqual({ x: 8.5, y: 70, z: 8.5 });
        expect(asked[0]!.yaw).toBe(90);
    });

    it('are created once however often the chunk is loaded', async () => {
        // Chunks are loaded and dropped constantly as players move. If loading a chunk read its
        // spawn list rather than draining it, walking away from a village and back would double
        // its population every time.
        const chunk = new Chunk(0, 0);
        chunk.getEntitySpawns().push({ type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5 });

        const { world, asked } = worldLoading(chunk);
        await world.loadChunk(0, 0);
        await world.loadChunk(0, 0);
        await world.loadChunk(0, 0);

        expect(asked).toHaveLength(1);
    });

    it('does not build a legacy class when the runtime does not declare the type', async () => {
        const chunk = new Chunk(0, 0);
        chunk.getEntitySpawns().push({ type: 'minecraft:tnt', x: 1.5, y: 70, z: 1.5 });

        const { world, added, asked } = worldLoading(chunk, []);
        await world.loadChunk(0, 0);

        expect(asked).toEqual([]);
        expect(added).toEqual([]);
    });

    it('skips a type nothing can build, and keeps the rest', async () => {
        const chunk = new Chunk(0, 0);
        chunk
            .getEntitySpawns()
            .push(
                { type: 'minecraft:nonexistent_mob', x: 1.5, y: 70, z: 1.5 },
                { type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5 }
            );

        const { world, asked } = worldLoading(chunk);
        await world.loadChunk(0, 0);

        expect(asked.map((spawn) => spawn.identifier)).toEqual(['minecraft:villager_v2']);
    });

    it('costs nothing for the overwhelming majority of chunks, which have none', async () => {
        const { world, added, asked } = worldLoading(new Chunk(0, 0));
        await world.loadChunk(0, 0);

        expect(added).toHaveLength(0);
        expect(asked).toHaveLength(0);
    });
});
