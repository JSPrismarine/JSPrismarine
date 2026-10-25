/**
 * What a generation worker runs when the whole ladder is pooled: one world's chunks, start to
 * finish.
 *
 * The module `ShardedGenerationPool` imports. It builds one `DataDrivenGenerator` per worker
 * and answers a task by climbing to `full` - the noise fill, the carvers, the surface rules,
 * the structure layout and the decoration pass - then hands the merged region back.
 *
 * This exists because of where the time goes. Measured over a contiguous block of overworld
 * chunks, `terrain` is 71 of the 239 milliseconds a chunk costs and the decoration pass is most
 * of the rest, so a pool that runs only `terrain` leaves 70% of the work on the server thread
 * and cannot be worth more than 1.33 times however many workers it has. Running the whole
 * ladder here is what makes the other 161 milliseconds parallel.
 *
 * It works because the decoration pass in this server is already pure. Java writes a feature
 * through into its neighbors, which is why Java keeps `features` on one executor; here it runs
 * over a private view and returns patches, so two of them cannot race and a chunk's contents
 * are a function of the seed and the position alone. That is also what lets the pool route by
 * region without the answer depending on which worker a chunk landed on.
 *
 * What stays on the main thread is the Bedrock translation, which reads this server's
 * Java-to-Bedrock tables. It is a palette lookup and a reindex rather than a per-block walk,
 * and keeping it in one place is what keeps one set of tables.
 *
 * The registries arrive as one `SharedArrayBuffer` of UTF-8 JSON, which gets eight workers to
 * parsed registries in 75 ms against 540 reading the 1514 files each.
 */
import type { GenerationResult, GenerationTask, WorkerPipeline } from '@jsprismarine/chunkgen';

import type { DimensionDefinition } from '../../Dimension';
import { Dimensions } from '../../Dimension';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaTemplateSource } from './javaStructureTemplates';
import { cacheRoot } from './javaWorldgenData';
import { readRegistryBundle } from './registryBundle';

/** What a worker is handed once, to build its generator from. */
export interface ChunkPipelineSetup {
    /** The registries as bytes, shared rather than copied to each worker. */
    readonly registryBundle: SharedArrayBuffer;
    readonly dimension?: DimensionDefinition;
    readonly noiseSettings?: string;
    readonly biomeParameters?: string;
    /** Whether the carvers run, which is part of Java's `terrain` status. */
    readonly carve?: boolean;
}

/** What a chunk task carries: the seed, as a string because a bigint does not clone. */
export interface ChunkTaskInput {
    readonly seed: string;
}

/** Raised when the pool hands a worker a task it has no body for. */
export class UnsupportedChunkStatusError extends Error {
    public override name = 'UnsupportedChunkStatusError';

    public constructor(status: string) {
        super(`A chunk worker builds a chunk to full and nothing else, so it cannot run ${status}.`);
    }
}

/** Whether a value is the setup the pool was built with, checked at the thread boundary. */
const isSetup = (value: unknown): value is ChunkPipelineSetup =>
    typeof value === 'object' &&
    value !== null &&
    'registryBundle' in value &&
    value.registryBundle instanceof SharedArrayBuffer;

/** Whether a task's input is a chunk task's, checked at the same boundary. */
const isChunkInput = (value: unknown): value is ChunkTaskInput =>
    typeof value === 'object' && value !== null && 'seed' in value && typeof value.seed === 'string';

/**
 * Builds this worker's generator.
 *
 * Called once per worker. Everything expensive lives here: parsing the shared registries, the
 * density graph, the 7594-entry climate biome source, the structure template store and then the
 * noise tables the first chunk builds.
 *
 * @param setup - What the pool was built with.
 * @returns The pipeline the pool drives.
 * @throws TypeError when the setup is not a chunk pipeline's.
 */
export const createGenerationPipeline = (setup: unknown): WorkerPipeline => {
    if (!isSetup(setup)) throw new TypeError('A chunk worker needs a registry bundle in shared memory.');

    const registries = readRegistryBundle(setup.registryBundle);
    const generator = new DataDrivenGenerator({
        registries,
        dimension: setup.dimension ?? Dimensions.Overworld,
        ...(setup.noiseSettings === undefined ? {} : { noiseSettings: setup.noiseSettings }),
        ...(setup.biomeParameters === undefined ? {} : { biomeParameters: setup.biomeParameters }),
        ...(setup.carve === undefined ? {} : { carve: setup.carve }),
        // Read off disk here rather than carried, because the templates are tens of megabytes
        // of structure NBT and a worker reads them once for the life of the process.
        templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
    });

    return {
        async run(task: GenerationTask): Promise<GenerationResult> {
            if (task.status !== 'full') throw new UnsupportedChunkStatusError(task.status);
            if (!isChunkInput(task.input)) {
                throw new TypeError(`The chunk task at ${task.chunkX}, ${task.chunkZ} carries no seed.`);
            }

            const tile = await generator.buildFullTile(task.chunkX, task.chunkZ, BigInt(task.input.seed));
            return { payload: tile.payload, transferList: tile.transferList };
        }
    };
};
