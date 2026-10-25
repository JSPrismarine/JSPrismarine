import { describe, expect, it } from 'vitest';

import { Dimensions } from './Dimension';
import { stub } from '../testing/stub.test.helper';
import { World } from './World';
import Chunk from './chunk/Chunk';
import type { Config } from '../config/Config';
import type { Generator } from './Generator';
import type { Logger, LoggerBuilder } from '@jsprismarine/logger';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import type Server from '../Server';

/**
 * `getLoadedChunk` answers from a one entry cache, so the thing worth pinning is that the cache
 * never answers for a chunk the world does not have yet.
 */
const testWorld = () => {
    const logger = stub<LoggerBuilder & Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });

    return new World({
        name: 'loaded-chunk-test',
        server: stub<Server>({
            getLogger: () => logger,
            getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
            getContent: () => undefined,
            getEntityRuntime: () => undefined
        }),
        provider: stub<BaseProvider & Provider>({
            readChunk: async (x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
        }),
        seed: 0,
        generator: stub<Generator>({})
    });
};

describe('world', () => {
    describe('getLoadedChunk', () => {
        it('answers for a chunk that is loaded and not for one that is not', async () => {
            const world = testWorld();
            await world.loadChunk(2, 3);

            // Twice each and interleaved, so a cache that remembered one answer too long shows up.
            for (let repeat = 0; repeat < 2; repeat++) {
                expect(world.getLoadedChunk(2, 3)?.getX()).toBe(2);
                expect(world.getLoadedChunk(9, 9)).toBeNull();
                expect(world.getLoadedChunk(2, 3)?.getZ()).toBe(3);
                expect(world.getLoadedChunk(-2, -3)).toBeNull();
            }
        });

        it('notices a chunk that was not loaded when it was last asked', async () => {
            const world = testWorld();

            expect(world.getLoadedChunk(5, 5)).toBeNull();
            await world.loadChunk(5, 5);

            expect(world.getLoadedChunk(5, 5)?.getX()).toBe(5);
        });

        it('keeps the two axes apart', async () => {
            const world = testWorld();
            await world.loadChunk(1, 0);

            expect(world.getLoadedChunk(1, 0)?.getX()).toBe(1);
            expect(world.getLoadedChunk(0, 1)).toBeNull();
        });
    });
});
