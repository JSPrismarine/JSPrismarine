import { EntityIndex } from '../entity/data/entityIndex';
import { EntityStore } from '../entity/data/EntityStore';
import { describe, expect, it, vi } from 'vitest';

import { fakeLevel } from '../testing/level';
import type PlayerSession from '../network/PlayerSession';
import { stub, stubOf } from '../testing/stub.test.helper';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import { Position } from './Position';
import BaseProvider from './providers/BaseProvider';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/**
 * A world over in-memory chunks whose provider lets them be unloaded, built on the real
 * prototype so the unload path and the portal index are the code under test.
 */
const worldWith = (chunks: readonly Chunk[]): World => {
    const players = new Map<bigint, PlayerSession>();
    const world: World = Object.assign(Object.create(World.prototype), {
        // The sink the constructor would have set, which hears each chunk enter and leave.
        changes: NULL_WORLD_CHANGE_SINK,
        chunks: new Map(chunks.map((chunk) => [Chunk.packXZ(chunk.getX(), chunk.getZ()), chunk])),
        players,
        loading: new Map(),
        level: fakeLevel({
            provider: stubOf(BaseProvider, {
                supportsChunkUnload: true,
                writeChunk: async (chunk) => chunk.markSaved()
            })
        }),
        getPlayers: () => Array.from(players.values()),
        getEntities: () => [],
        actors: () => [].values(),
        dataEntities: () => ({
            persist: () => {},
            unload: () => false,
            runtime: { index: new EntityIndex(), store: new EntityStore(), remove: () => {} }
        }),
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
        world['players'].set(
            1,
            stub<PlayerSession>({
                getViewDistance: () => 4,
                getViewPosition: () => new Position(8, 64, 8, world)
            })
        );
        expect(world.getPortalIndex().size).toBe(4);

        await world['unloadDistantChunks']();

        expect(world.getLoadedChunk(100, 0)).toBeNull();
        expect(world.getPortalIndex().has({ x: 1603, y: 70, z: 3 })).toBe(false);
        expect(world.getPortalIndex().has({ x: 3, y: 70, z: 3 })).toBe(true);
        expect(world.getPortalIndex().size).toBe(2);
    });
});
