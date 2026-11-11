import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { Difficulty } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { replicaSink } from '../testing/sealedBlocks.test.helper';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import { worldBlockEntities } from './contentAdapter';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import { World } from './World';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';

/**
 * A block entity change leaving the world through its change log, which its change sink reads.
 *
 * The write path is driven whole, over a real world and a real chunk, because the bug this
 * covers was that nothing downstream of the chunk write was ever told. A double over the
 * chunk would have passed while the server still said nothing.
 */

const GROUND = 63;

const stoneId = (): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState('minecraft:stone', {});
    if (runtimeId === null) throw new Error('no minecraft:stone in the block catalog');
    return runtimeId;
};

const chestId = (): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState('minecraft:chest', {
        'minecraft:cardinal_direction': 'north'
    });
    if (runtimeId === null) throw new Error('no minecraft:chest in the block catalog');
    return runtimeId;
};

const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    for (let bx = 0; bx < 16; bx++) {
        for (let bz = 0; bz < 16; bz++) chunk.fillColumn(bx, bz, -64, GROUND, stoneId());
    }
    return chunk;
};

const testServer = (): Server => {
    const runtime = inertEntityRuntime();
    return stub<Server>({
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => runtime,
        hasEntityRuntime: () => true
    });
};

/**
 * A world with one flat chunk in memory and a tick of its change log open, and what a replicator
 * would send of each block entity change: `reported` seals the tick, opens the next, and answers
 * every block entity the sealed tick changed with the compound folded for it.
 */
const flatWorld = async () => {
    const server = testServer();
    const world = new World({
        name: 'block-entity-replication-test',
        path: path.join(os.tmpdir(), 'block-entity-replication-test'),
        server,
        level: fakeLevel({
            server,
            provider: stub<BaseProvider>({ readChunk: async (_dimension, x, z) => flatChunk(x, z) })
        }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });

    const { sink, replica, sealed } = replicaSink();
    world.attachChangeSink(sink);
    await world.loadChunk(0, 0);
    world.beginChangeTick();
    const reported = (): { at: { x: number; y: number; z: number }; tags: NBTTagCompound | null }[] => {
        world.sealChangeTick();
        world.beginChangeTick();
        const positions = new Map<string, { x: number; y: number; z: number }>();
        for (const entry of sealed.at(-1)?.entries ?? [])
            if (entry.kind === 'field' && entry.field === 'block-entity') {
                const { x, y, z } = entry.address;
                positions.set(`${x},${y},${z}`, { x, y, z });
            }
        return [...positions.values()].map((at) => ({ at, tags: replica.compound(at) }));
    };

    return { world, reported };
};

describe('world', () => {
    describe('block entity replication', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-blockentity-'));
        const previousDirectory = process.env['JSP_DIR'];

        beforeAll(() => {
            process.env['JSP_DIR'] = directory;
        });

        afterAll(() => {
            if (previousDirectory === undefined) delete process.env['JSP_DIR'];
            else process.env['JSP_DIR'] = previousDirectory;
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('reports a container whose contents changed', async () => {
            const { world, reported } = await flatWorld();
            const at = { x: 4, y: GROUND + 1, z: 4 };
            world.getLoadedChunk(0, 0)!.setBlockRuntimeId(at.x, at.y, at.z, chestId());

            const store = worldBlockEntities(() => world);
            store.put(at, { items: [undefined], capacity: 27 });

            const sent = reported();
            expect(sent).toHaveLength(1);
            expect(sent[0]!.at).toEqual(at);
            expect(sent[0]!.tags?.getString('id', '')).toBe('Chest');
        });

        it('says nothing when the write leaves the block entity exactly as it was', async () => {
            const { world, reported } = await flatWorld();
            const at = { x: 4, y: GROUND + 1, z: 4 };
            world.getLoadedChunk(0, 0)!.setBlockRuntimeId(at.x, at.y, at.z, chestId());

            const store = worldBlockEntities(() => world);
            store.put(at, { items: [undefined], capacity: 27 });
            expect(reported()).toHaveLength(1);

            // What an unconditional per-tick writer does: a comparator rewriting the signal it
            // already held, a beacon recounting the same pyramid. None of it is news.
            for (let tick = 0; tick < 20; tick++) store.put(at, { items: [undefined], capacity: 27 });

            expect(reported()).toEqual([]);
        });
    });
});
