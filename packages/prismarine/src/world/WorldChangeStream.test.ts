import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { Difficulty } from '@jsprismarine/minecraft';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Config } from '../config/Config';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';
import type { WorldChange } from './WorldChange';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/**
 * The world-change stream: everything that rewrites what the world holds leaves it as one
 * {@link WorldChange} through the sink's `worldChanged`, which is what the network replicator
 * subscribes to. The subscriber here is a plain recorder, which is the point - the stream is
 * readable without a network anywhere near it.
 */

const GROUND = 63;

const runtimeIdOf = (name: string, states: Record<string, string | number | boolean> = {}): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
    if (runtimeId === null) throw new Error(`no ${name} in the block catalog`);
    return runtimeId;
};

const flatChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z);
    for (let bx = 0; bx < 16; bx++) {
        for (let bz = 0; bz < 16; bz++) chunk.fillColumn(bx, bz, -64, GROUND, runtimeIdOf('minecraft:stone'));
    }
    return chunk;
};

const testServer = (): Server =>
    stub<Server>({
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });

/** A world with one flat chunk in memory and a recorder subscribed to its change stream. */
const flatWorld = async () => {
    const world = new World({
        name: 'world-change-stream-test',
        path: path.join(os.tmpdir(), 'world-change-stream-test'),
        server: testServer(),
        provider: stub<BaseProvider & Provider>({ readChunk: async (x, z) => flatChunk(x, z) }),
        seed: 0n,
        generator: stub<Generator>({})
    });

    await world.loadChunk(0, 0);

    const changes: WorldChange[] = [];
    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        worldChanged: (change) => void changes.push(change)
    });

    return { world, changes };
};

describe('world', () => {
    describe('change stream', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-worldchange-'));
        const previousDirectory = process.env['JSP_DIR'];

        beforeAll(() => {
            process.env['JSP_DIR'] = directory;
        });

        afterAll(() => {
            if (previousDirectory === undefined) delete process.env['JSP_DIR'];
            else process.env['JSP_DIR'] = previousDirectory;
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('emits a block-set for a block write', async () => {
            const { world, changes } = await flatWorld();
            const glowstone = runtimeIdOf('minecraft:glowstone');

            const written = world.setLoadedBlockState(
                4,
                GROUND + 1,
                4,
                { name: 'minecraft:glowstone', states: {} },
                false
            );

            expect(written).toBe(true);
            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({ kind: 'block-set', blockRuntimeId: glowstone });
            if (changes[0]!.kind !== 'block-set') throw new Error('expected a block-set');
            expect(changes[0]!.position.getX()).toBe(4);
            expect(changes[0]!.position.getY()).toBe(GROUND + 1);
            expect(changes[0]!.position.getZ()).toBe(4);
        });

        it('says nothing for a write that leaves the block as it was', async () => {
            const { world, changes } = await flatWorld();

            const written = world.setLoadedBlockState(4, GROUND, 4, { name: 'minecraft:stone', states: {} }, false);

            expect(written).toBe(false);
            expect(changes).toEqual([]);
        });

        it('emits a block-set restating the block for a resend', async () => {
            const { world, changes } = await flatWorld();

            world.resendBlock(4, GROUND, 4);

            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({ kind: 'block-set', blockRuntimeId: runtimeIdOf('minecraft:stone') });
        });
    });
});
