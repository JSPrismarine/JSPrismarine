import { describe, expect, it } from 'vitest';

import { Dimensions } from './Dimension';
import { stub } from '../testing/stub.test.helper';
import { World } from './World';
import { worldSeedOf } from '../utils/Seed';
import Chunk from './chunk/Chunk';
import type { Config } from '../config/Config';
import type { Generator } from './Generator';
import type { Logger } from '@jsprismarine/logger';
import type { WorldData } from '../config/JsonConfigTypes';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';

/**
 * A nineteen digit Java seed. As a `number` it rounds to 8475011743740319744, which is 277
 * away and a different world, so this is the value the whole bigint chain exists for.
 */
const CONFIGURED: WorldData = { seed: '8475011743740320021', generator: 'Overworld' };
const EXPECTED = 8475011743740320021n;

/** Builds a world the way `WorldManager` does, from a config entry. */
const testWorld = (config: WorldData) => {
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });

    const seeds: bigint[] = [];
    const world = new World({
        name: 'seed-test',
        path: 'seed-test',
        server: stub<Server>({
            getLogger: () => logger,
            getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
            getContent: () => testContent(),
            getEntityRuntime: () => inertEntityRuntime()
        }),
        provider: stub<BaseProvider & Provider>({
            readChunk: async (_dimension, x, z, seed) => {
                seeds.push(seed);
                return new Chunk(x, z, new Map(), Dimensions.Overworld);
            }
        }),
        seed: worldSeedOf(config.seed),
        generator: stub<Generator>({}),
        config
    });

    return { world, seeds };
};

describe('world', () => {
    describe('the seed', () => {
        it('keeps every bit of a nineteen digit configured seed', () => {
            expect(testWorld(CONFIGURED).world.getSeed()).toBe(EXPECTED);

            // What the seed used to be, when it went through a `number` on the way here.
            expect(BigInt(Math.trunc(Number(CONFIGURED.seed)))).toBe(8475011743740319744n);
        });

        it('hands the provider the seed it was configured with', async () => {
            const { world, seeds } = testWorld(CONFIGURED);
            await world.loadChunk(1, -2);

            expect(seeds).toEqual([EXPECTED]);
        });

        it('still reads a small seed written as a number', () => {
            expect(testWorld({ seed: 1234 }).world.getSeed()).toBe(1234n);
        });
    });
});
