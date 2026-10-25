import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator, SurfaceProbe } from './Generator';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';
import { World } from './World';

/**
 * What the spawn search is allowed to cost.
 *
 * The search widens in 8-block rings to a radius of 256, so a world whose origin is open ocean
 * walks thousands of candidates before it reaches a shore - at seed 1234 it was 3602 of them.
 * While each candidate was a `getChunkAt`, that was thousands of fully generated chunks, and a
 * boot spent minutes there without reaching the preload that prints the progress. The count
 * below is the signal: a generator that can answer from its terrain must be asked, and the
 * search must not generate a single chunk.
 */

/** The one column of dry land in the test world, far enough out that the search has to widen. */
const LAND = { x: 0, z: -16, y: 71 } as const;

/** The sea floor, which is what every other column's probe reports under its water. */
const SEA_SURFACE = 62;

const testLogger = (): Logger =>
    stub<Logger>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        verbose: () => {}
    });

interface CountingGenerator extends Generator {
    /** How many chunks the world asked this generator to generate. */
    readonly generated: number;
}

/**
 * An ocean with one island, which answers either from its terrain or only from its chunks.
 *
 * @param probing - Whether the generator offers {@link Generator.surfaceAt}. False is the
 *   fallback a generator with no cheaper answer than its own chunks takes.
 */
const oceanWithOneIsland = (probing: boolean): CountingGenerator => {
    let generated = 0;

    const surfaceAt = (x: number, z: number): SurfaceProbe =>
        x === LAND.x && z === LAND.z
            ? { y: LAND.y, name: 'minecraft:stone' }
            : { y: SEA_SURFACE, name: 'minecraft:water' };

    return {
        get generated() {
            return generated;
        },
        generateChunk: async (cx: number, cz: number) => {
            generated++;

            const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);
            // Air everywhere, so the fallback path keeps widening and the test does not depend
            // on the block catalog. The spawn it settles on is the origin fallback.
            return chunk;
        },
        ...(probing ? { surfaceAt } : {})
    };
};

const testWorld = (generator: Generator) =>
    new World({
        name: 'spawn-search-test',
        path: 'spawn-search-test',
        server: stub<Server>({
            getLogger: () => testLogger(),
            getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
            getContent: () => testContent(),
            getEntityRuntime: () => inertEntityRuntime()
        }),
        provider: stub<BaseProvider & Provider>({
            readChunk: async (x, z, _seed, chunkGenerator) => chunkGenerator.generateChunk(x, z)
        }),
        seed: 1234n,
        generator
    });

describe('the spawn search', () => {
    it('finds the one dry column without generating a chunk', async () => {
        const generator = oceanWithOneIsland(true);
        const spawn = await testWorld(generator).getSpawnPosition();

        expect({ x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() }).toEqual(LAND);
        expect(generator.generated).toBe(0);
    });

    it('still generates chunks for a generator that cannot answer from its terrain', async () => {
        const generator = oceanWithOneIsland(false);
        await testWorld(generator).getSpawnPosition();

        expect(generator.generated).toBeGreaterThan(0);
    });
});
