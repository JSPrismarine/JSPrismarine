/**
 * That legacy whole-chunk workers and shared-status workers build the same chunks as this thread.
 *
 * This is the safety argument for worker generation. Task routing and concurrent roots depend
 * on worker count and queue timing, so output cannot depend on which worker ran a status.
 *
 * The comparison runs in a child process, not here. A worker thread resolves the pipeline module
 * through Node's own loader rather than through vitest's, and a dev checkout's imports have no
 * extensions, so the child is started with `--import tsx` and the workers inherit it. See
 * `test/chunkParity.ts`, which is where the two generators are actually compared.
 *
 * Gated, because it reads the Java vanilla datapack and the data generator reports:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { GenerationPool, workerExecArgv } from '@jsprismarine/chunkgen';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { Dimensions } from '../../Dimension';
import type { ChunkPipelineSetup, ChunkTaskInput } from './chunkPipeline';
import { createGenerationPipeline } from './chunkPipeline';
import { defaultChunkPipeline, isPipelineKey, pipelineDimensionOf } from './DataDrivenGenerator';
import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { findJavaWorldgenSources } from './javaWorldgenData';
import { shareRegistryBundle } from './registryBundle';

const enabled = findJavaWorldgenSources() !== undefined;

/** Building five chunks twice, one of those times behind worker startup, is not fast. */
const TIMEOUT = 900_000;

const CHECKER = fileURLToPath(new URL('../../../../test/chunkParity.ts', import.meta.url));

/** Registries with nothing in them, enough to build a worker's generator and refuse a task. */
const emptyRegistries = (): JavaWorldgenRegistries => ({
    densityFunctions: new Map(),
    noises: new Map(),
    noiseSettings: new Map(),
    materialRules: new Map(),
    materialConditions: new Map(),
    carvers: new Map(),
    biomes: new Map(),
    features: new Map(),
    placedFeatures: new Map(),
    blockStateProviders: new Map(),
    processorLists: new Map(),
    structures: new Map(),
    structureSets: new Map(),
    templatePools: new Map(),
    dimensionTypes: new Map(),
    dimensions: new Map(),
    worldPresets: new Map(),
    flatLevelGeneratorPresets: new Map(),
    multiNoiseParameterLists: new Map(),
    blockTags: new Map(),
    biomeTags: new Map(),
    structureTags: new Map(),
    biomeParameters: new Map()
});

describe('what a worker is handed', () => {
    it('reads the dimension and its settings from the task, not from the pool setup', () => {
        // The setup is cloned once per pool. A pool shared between dimensions cannot carry one
        // dimension there, so the key lives in every task instead.
        expectTypeOf<ChunkPipelineSetup>().not.toHaveProperty('dimension');
        expectTypeOf<ChunkPipelineSetup>().not.toHaveProperty('noiseSettings');
        expectTypeOf<ChunkPipelineSetup>().not.toHaveProperty('biomeSource');
        expectTypeOf<ChunkTaskInput>().toHaveProperty('dimension');
        expectTypeOf<ChunkTaskInput>().toHaveProperty('noiseSettings');
        expectTypeOf<ChunkTaskInput>().toHaveProperty('biomeSource');
    });

    it('carries the dimension as its bounds and ids, not the whole type', () => {
        // Every task is structured-cloned into a worker. The Java definition behind a type,
        // its attributes map included, is nothing a worker reads and would ride along per chunk.
        expectTypeOf<ChunkTaskInput['dimension']>().not.toHaveProperty('java');
        expectTypeOf<ChunkTaskInput['dimension']>().not.toHaveProperty('custom');

        const slim = pipelineDimensionOf(Dimensions.Nether);
        expect(slim).toEqual({ id: 'minecraft:the_nether', bedrockId: 1, minY: 0, height: 128 });
        expect(
            isPipelineKey({
                noiseSettings: 'minecraft:nether',
                biomeSource: { type: 'minecraft:fixed' },
                dimension: slim
            })
        ).toBe(true);
    });

    it('refuses a task that names a seed but no pipeline key', async () => {
        const pipeline = createGenerationPipeline({
            registryBundle: shareRegistryBundle(emptyRegistries()),
            javaTemplates: false
        } satisfies ChunkPipelineSetup);

        await expect(
            Promise.resolve(pipeline.run({ status: 'full', chunkX: 3, chunkZ: -4, dimension: 0, input: { seed: '1' } }))
        ).rejects.toThrowError('The chunk task at 3, -4 carries no seed and pipeline key.');
        await expect(
            Promise.resolve(
                pipeline.run({
                    status: 'terrain',
                    chunkX: 0,
                    chunkZ: 0,
                    dimension: 1,
                    input: { seed: '1', beard: [], junctions: [] }
                })
            )
        ).rejects.toThrowError('carries no seed and pipeline key');
    });

    it('accepts a task whose key names a dimension the setup never heard of', async () => {
        const pipeline = createGenerationPipeline({
            registryBundle: shareRegistryBundle(emptyRegistries()),
            javaTemplates: false
        } satisfies ChunkPipelineSetup);
        const input: ChunkTaskInput = {
            seed: '1',
            noiseSettings: 'minecraft:end',
            biomeSource: { type: 'minecraft:the_end' },
            dimension: pipelineDimensionOf(Dimensions.TheEnd)
        };

        // Past the boundary check and into the generator, which with empty registries fails on
        // the settings the key names rather than on the key.
        await expect(
            Promise.resolve(pipeline.run({ status: 'full', chunkX: 0, chunkZ: 0, dimension: 2, input }))
        ).rejects.toThrowError('No noise settings are registered as minecraft:end');
    });
});

describe('the pipeline module in a worker thread', () => {
    /**
     * The seam the Fleet suite failed at. A server booted under vitest builds its pool from
     * `defaultChunkPipeline()`, which names this directory's `.ts`, and the worker reads it
     * through Node's loader rather than Vite's. Without a loader of its own the worker stopped
     * at the first extensionless relative import with `ERR_MODULE_NOT_FOUND`. The refusal
     * asserted here comes from inside the generator, which is the proof the module and
     * everything it imports loaded.
     */
    it('imports the real module outside Vite and runs its factory', async () => {
        const pipeline = defaultChunkPipeline();
        const flags = workerExecArgv({ pipeline });
        expect(flags?.at(-2)).toBe('--import');
        expect(flags?.at(-1)).toMatch(/^file:.*\/tsx\//);

        const pool = new GenerationPool({
            pipeline,
            workers: 1,
            setup: {
                registryBundle: shareRegistryBundle(emptyRegistries()),
                javaTemplates: false
            } satisfies ChunkPipelineSetup
        });
        const input: ChunkTaskInput = {
            seed: '1',
            noiseSettings: 'minecraft:end',
            biomeSource: { type: 'minecraft:the_end' },
            dimension: pipelineDimensionOf(Dimensions.TheEnd)
        };

        try {
            await expect(pool.run({ status: 'full', chunkX: 0, chunkZ: 0, dimension: 2, input })).rejects.toThrowError(
                'No noise settings are registered as minecraft:end'
            );
        } finally {
            await pool.destroy();
        }
    }, 120_000);
});

describe.runIf(enabled)('a chunk built by workers', { tags: ['real-data'] }, () => {
    it(
        'matches inline generation through both worker paths',
        () => {
            const output = execFileSync(process.execPath, ['--import', 'tsx', CHECKER], {
                encoding: 'utf8',
                cwd: fileURLToPath(new URL('../../../../', import.meta.url))
            });

            expect(output.trim()).toBe('ok');
        },
        TIMEOUT
    );
});
