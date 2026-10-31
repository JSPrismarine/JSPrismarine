import { describe, expect, it, vi } from 'vitest';

import type Player from '../Player';
import { fakeLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';

/**
 * A world over in-memory chunks whose provider lets them be unloaded, built on the real
 * prototype so the unload path and the portal index are the code under test.
 */
const worldWith = (chunks: readonly Chunk[]): World => {
    const players = new Map<bigint, Player>();
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(chunks.map((chunk) => [Chunk.packXZ(chunk.getX(), chunk.getZ()), chunk])),
        players,
        loading: new Map(),
        level: fakeLevel({
            provider: stub<BaseProvider & Provider>({
                supportsChunkUnload: true,
                writeChunk: async (chunk) => chunk.markSaved()
            })
        }),
        getPlayers: () => Array.from(players.values()),
        enqueueSave: async (write: () => Promise<void>) => write(),
        getEntities: () => [],
        dataEntities: () => ({ persist: () => {}, unload: () => false }),
        systems: { onChunkUnloaded: () => {} },
        dimension: Dimensions.Overworld,
        server: { invalidateEntityBlockCaches: () => {}, getLogger: () => ({ error: vi.fn() }) }
    });
    for (const chunk of chunks) world.getPortalIndex().chunkLoaded(chunk);
    return world;
};

const portalChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
    const portal = BlockRuntimeIds.tryGetByState('minecraft:portal', { portal_axis: 'x' });
    if (portal === null) throw new Error('the palette has no minecraft:portal');
    chunk.setBlockRuntimeId(3, 70, 3, portal);
    chunk.setBlockRuntimeId(3, 71, 3, portal);
    return chunk;
};

describe('world portal index', () => {
    it('forgets the portal blocks of a chunk it unloads, and keeps those of chunks a player still holds', async () => {
        const near = portalChunk(0, 0);
        const far = portalChunk(100, 0);
        const world = worldWith([near, far]);
        world['players'].set(1n, stub<Player>({ viewDistance: 4, getPosition: () => new Position(8, 64, 8, world) }));
        expect(world.getPortalIndex().size).toBe(4);

        await world['unloadDistantChunks']();

        expect(world.getLoadedChunk(100, 0)).toBeNull();
        expect(world.getPortalIndex().has({ x: 1603, y: 70, z: 3 })).toBe(false);
        expect(world.getPortalIndex().has({ x: 3, y: 70, z: 3 })).toBe(true);
        expect(world.getPortalIndex().size).toBe(2);
    });
});
