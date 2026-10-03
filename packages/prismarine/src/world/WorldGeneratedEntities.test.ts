import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { Mob } from '../entity/Mob';
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

/** A world reduced to what loading a chunk touches: no disk, no network, no generator. */
const worldLoading = (chunk: Chunk) => {
    const added: Entity[] = [];

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        seed: 1,
        generator: {},
        config: {},
        provider: { readChunk: async () => chunk },
        addEntity: async (entity: Entity) => void added.push(entity),
        server: { getLogger: () => ({ debug: () => {}, warn: () => {} }) }
    });

    return { world, added };
};

describe('mobs left by world generation', () => {
    it('become real entities when the chunk is loaded', async () => {
        const chunk = new Chunk(0, 0);
        chunk
            .getEntitySpawns()
            .push(
                { type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5, yaw: 90 },
                { type: 'minecraft:iron_golem', x: 4.5, y: 70, z: 4.5 }
            );

        const { world, added } = worldLoading(chunk);
        await world.loadChunk(0, 0);

        expect(added.map((entity) => entity.getType())).toEqual(['minecraft:villager_v2', 'minecraft:iron_golem']);

        // At the coordinates generation asked for, facing the way it asked.
        expect(added[0]!.getPosition().getX()).toBe(8.5);
        expect(added[0]!.getPosition().getY()).toBe(70);
        expect(added[0]!.yaw).toBe(90);
    });

    it('are created once however often the chunk is loaded', async () => {
        // Chunks are loaded and dropped constantly as players move. If loading a chunk read its
        // spawn list rather than draining it, walking away from a village and back would double
        // its population every time.
        const chunk = new Chunk(0, 0);
        chunk.getEntitySpawns().push({ type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5 });

        const { world, added } = worldLoading(chunk);
        await world.loadChunk(0, 0);
        await world.loadChunk(0, 0);
        await world.loadChunk(0, 0);

        expect(added).toHaveLength(1);
    });

    it('are marked as belonging where they were put', async () => {
        // The spawner removes mobs nobody is near. A village that emptied itself the first time you
        // walked away would be worse than no village at all.
        const chunk = new Chunk(0, 0);
        chunk.getEntitySpawns().push({ type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5 });

        const { world, added } = worldLoading(chunk);
        await world.loadChunk(0, 0);

        expect(added[0]).toBeInstanceOf(Mob);
        expect((added[0] as Mob).isPersistent()).toBe(true);
    });

    it('skips a mob this server has no class for, and keeps the rest', async () => {
        const chunk = new Chunk(0, 0);
        chunk
            .getEntitySpawns()
            .push(
                { type: 'minecraft:nonexistent_mob', x: 1.5, y: 70, z: 1.5 },
                { type: 'minecraft:villager_v2', x: 8.5, y: 70, z: 8.5 }
            );

        const { world, added } = worldLoading(chunk);
        await world.loadChunk(0, 0);

        expect(added.map((entity) => entity.getType())).toEqual(['minecraft:villager_v2']);
    });

    it('costs nothing for the overwhelming majority of chunks, which have none', async () => {
        const { world, added } = worldLoading(new Chunk(0, 0));
        await world.loadChunk(0, 0);

        expect(added).toHaveLength(0);
    });
});
