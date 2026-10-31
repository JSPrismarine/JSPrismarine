/**
 * What a world does when several callers want the same chunk at once.
 *
 * Worth its own file because the answer used to be "generate it once per caller". A chunk is
 * asked for from the preload, from every player whose view distance reaches it, and from the
 * engine systems, and those arrive in the same turn far more often than not.
 */
import type { GenerationPriority } from '@jsprismarine/chunkgen';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import type { DimensionType } from './Dimension';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';
import { TEST_OVERWORLD_STEM, fakeLevel } from '../testing/level';

/** A world whose provider counts its reads and answers only when the test lets it. */
const testWorld = (readChunk: BaseProvider['readChunk'], generator: Generator = stub<Generator>({})) => {
    const logger = stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });

    const server = stub<Server>({
        getLogger: () => logger,
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });

    return new World({
        name: 'chunk-request-test',
        path: 'chunk-request-test',
        server,
        level: fakeLevel({ server, provider: stub<BaseProvider & Provider>({ readChunk }) }),
        stem: TEST_OVERWORLD_STEM,
        generator
    });
};

/** A promise with its resolver, so a test decides when the provider answers. */
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });

    return { promise, resolve };
};

describe('world chunk requests', () => {
    it('generates a chunk once when several callers ask for it in the same turn', async () => {
        const gate = deferred<void>();
        const readChunk = vi.fn(async (_dimension: DimensionType, x: number, z: number) => {
            await gate.promise;
            return new Chunk(x, z, new Map(), Dimensions.Overworld);
        });
        const world = testWorld(readChunk);

        const asked = Promise.all([world.getChunk(4, 4), world.getChunk(4, 4), world.getChunk(4, 4)]);
        gate.resolve();
        const chunks = await asked;

        expect(readChunk).toHaveBeenCalledTimes(1);
        // The same instance, not three that happen to hold the same blocks: a caller that
        // writes a block into one has to be writing into the one everybody else is reading.
        expect(chunks[1]).toBe(chunks[0]);
        expect(chunks[2]).toBe(chunks[0]);
    });

    it('keeps different chunks apart while both are in flight', async () => {
        const gate = deferred<void>();
        const readChunk = vi.fn(async (_dimension: DimensionType, x: number, z: number) => {
            await gate.promise;
            return new Chunk(x, z, new Map(), Dimensions.Overworld);
        });
        const world = testWorld(readChunk);

        const asked = Promise.all([world.getChunk(1, 1), world.getChunk(2, 2)]);
        gate.resolve();
        const [first, second] = await asked;

        expect(readChunk).toHaveBeenCalledTimes(2);
        expect([first!.getX(), second!.getX()]).toEqual([1, 2]);
    });

    it('answers from memory once the chunk has arrived, without asking again', async () => {
        const readChunk = vi.fn(
            async (_dimension: DimensionType, x: number, z: number) => new Chunk(x, z, new Map(), Dimensions.Overworld)
        );
        const world = testWorld(readChunk);

        const first = await world.getChunk(7, 7);
        const second = await world.getChunk(7, 7);

        expect(readChunk).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);
    });

    it('passes the urgency a caller asked with down to the provider', async () => {
        const seen: Array<GenerationPriority | undefined> = [];
        const readChunk: BaseProvider['readChunk'] = async (_dimension, x, z, _seed, _generator, _config, options) => {
            seen.push(options?.urgency);
            return new Chunk(x, z, new Map(), Dimensions.Overworld);
        };
        const world = testWorld(readChunk);

        await world.getChunk(0, 0, { urgency: 'idle' });
        await world.getChunk(1, 0, { urgency: 'soon' });
        await world.getChunk(2, 0);

        expect(seen).toEqual(['idle', 'soon', undefined]);
    });

    it('moves a chunk already in flight up when a caller wants it more', async () => {
        const gate = deferred<void>();
        const raised: Array<[number, number, GenerationPriority]> = [];
        const generator = stub<Generator>({
            raiseUrgency: (cx, cz, urgency) => void raised.push([cx, cz, urgency])
        });
        const world = testWorld(async (_dimension, x, z) => {
            await gate.promise;
            return new Chunk(x, z, new Map(), Dimensions.Overworld);
        }, generator);

        const slow = world.getChunk(5, 6, { urgency: 'idle' });
        // The second caller joins the load the first started, so the only way it can be
        // served sooner is for that load to change bands.
        const urgent = world.getChunk(5, 6, { urgency: 'immediate' });
        gate.resolve();
        await Promise.all([slow, urgent]);

        expect(raised).toEqual([[5, 6, 'immediate']]);
    });

    it('lets a later caller try again after a request failed', async () => {
        let attempt = 0;
        const readChunk = vi.fn(async (_dimension: DimensionType, x: number, z: number) => {
            attempt++;
            if (attempt === 1) throw new Error('the disk said no');
            return new Chunk(x, z, new Map(), Dimensions.Overworld);
        });
        const world = testWorld(readChunk);

        // Both callers see the one failure, rather than the second waiting on a promise that
        // is never going to be replaced.
        const [first, second] = await Promise.allSettled([world.getChunk(3, 9), world.getChunk(3, 9)]);
        expect(first!.status).toBe('rejected');
        expect(second!.status).toBe('rejected');
        expect(readChunk).toHaveBeenCalledTimes(1);

        await expect(world.getChunk(3, 9)).resolves.toBeInstanceOf(Chunk);
        expect(readChunk).toHaveBeenCalledTimes(2);
    });
});
