/**
 * What a generation worker runs: one world's `terrain` bodies, and nothing else.
 *
 * The module `@jsprismarine/chunkgen`'s pool imports. It builds one `DataDrivenGenerator` per
 * worker, with decoration and structures off, and answers a task by calling the same
 * `buildTerrainTile` the main thread calls. One implementation of the noise fill, not two: a
 * second one would be a second world, and only a digest comparison would say which.
 *
 * What the worker is not given is as important as what it is. It does not lay structures out,
 * because that work is shared between neighbors through one cache and repeating it in six
 * workers would cost more than the fill; the pieces that push a chunk's terrain around travel
 * with the task. It does not decorate, because `features` writes into its neighbors and two
 * concurrent feature passes would race. It has no templates, because nothing a `terrain` body
 * does stamps one.
 *
 * It does not read the registries off disk either. Those arrive as one `SharedArrayBuffer` of
 * UTF-8 JSON, which gets eight workers to parsed registries in 75 ms against 540 reading the
 * 1514 files each.
 */
import type { GenerationResult, GenerationTask, WorkerPipeline } from '@jsprismarine/chunkgen';

import type { TerrainTaskInput } from './DataDrivenGenerator';
import { DataDrivenGenerator, isPipelineKey } from './DataDrivenGenerator';
import { readRegistryBundle } from './registryBundle';

/**
 * What a worker is handed once, to build its terrain pipeline from.
 *
 * The dimension and its settings travel with every task as a `PipelineKey` instead, so one
 * pool serves every dimension of a server.
 */
export interface TerrainPipelineSetup {
    /** The registries as bytes, shared rather than copied to each worker. */
    readonly registryBundle: SharedArrayBuffer;
    /** Whether the carvers run, which is part of Java's `terrain` status. */
    readonly carve: boolean;
}

/** Raised when the pool hands a worker a task it has no body for. */
export class UnsupportedWorkerStatusError extends Error {
    public override name = 'UnsupportedWorkerStatusError';

    public constructor(status: string) {
        super(
            `A generation worker runs terrain and nothing else, so it cannot run ${status}. ` +
                'Every other status either writes into its neighbors or needs state the main thread keeps.'
        );
    }
}

/** Whether a value is the setup the pool was built with, checked at the thread boundary. */
const isSetup = (value: unknown): value is TerrainPipelineSetup =>
    typeof value === 'object' &&
    value !== null &&
    'registryBundle' in value &&
    value.registryBundle instanceof SharedArrayBuffer;

/** Whether a task's input is a terrain task's, checked at the same boundary. */
const isTerrainInput = (value: unknown): value is TerrainTaskInput =>
    isPipelineKey(value) &&
    'seed' in value &&
    typeof value.seed === 'string' &&
    'beard' in value &&
    Array.isArray(value.beard) &&
    'junctions' in value &&
    Array.isArray(value.junctions);

/**
 * Builds this worker's terrain pipeline.
 *
 * Called once per worker. Everything expensive lives here: parsing the shared registries, the
 * density graph, the 7594-entry climate biome source, and then the noise tables the first chunk
 * builds. About 200 to 400 ms, paid once and off the main thread.
 *
 * @param setup - What {@link DataDrivenGenerator} put in the pool's `setup`.
 * @returns The pipeline the pool drives.
 * @throws TypeError when the setup is not a terrain pipeline's.
 */
export const createGenerationPipeline = (setup: unknown): WorkerPipeline => {
    if (!isSetup(setup)) throw new TypeError('A terrain worker needs a registry bundle in shared memory.');

    const generator = new DataDrivenGenerator({
        registries: readRegistryBundle(setup.registryBundle),
        carve: setup.carve,
        // Nothing above `terrain` runs here, and a worker that laid structures out would repeat
        // work the main thread has already done and cached.
        decorate: false,
        structures: false
    });

    return {
        async run(task: GenerationTask): Promise<GenerationResult> {
            if (task.status !== 'terrain') throw new UnsupportedWorkerStatusError(task.status);
            if (!isTerrainInput(task.input)) {
                throw new TypeError(
                    `The terrain task at ${task.chunkX}, ${task.chunkZ} carries no seed and pipeline key.`
                );
            }

            const tile = await generator.buildTerrainTile(
                task.chunkX,
                task.chunkZ,
                BigInt(task.input.seed),
                task.input.beard,
                task.input.junctions,
                task.input
            );
            return { payload: tile.payload, transferList: tile.transferList };
        }
    };
};
