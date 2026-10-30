/**
 * The worker pipeline for this generator's terrain, feature, and legacy whole-chunk tasks.
 *
 * The module `GenerationPool` imports. It builds one `DataDrivenGenerator` per worker and can
 * answer independent `terrain` and `features` status tasks. The legacy `full` task remains for
 * `ShardedGenerationPool` callers.
 *
 * This exists because of where the time goes. Measured over a contiguous block of overworld
 * chunks, `terrain` is 71 of the 239 milliseconds a chunk costs and the decoration pass is most
 * of the rest. Shared status workers keep neighborhood deduplication in the main scheduler
 * while running both expensive status bodies in parallel.
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

import type { PipelineKey, TerrainTaskInput } from './DataDrivenGenerator';
import { DataDrivenGenerator, isPipelineKey } from './DataDrivenGenerator';
import { findJavaTemplateSource } from './javaStructureTemplates';
import { cacheRoot } from './javaWorldgenData';
import { readRegistryBundle } from './registryBundle';
import type { GenerationRegionPayload } from './GenerationRegion';

/**
 * What a worker is handed once, to build its generator from.
 *
 * Nothing here names a dimension or its settings. Those travel with every task as a
 * {@link PipelineKey}, which is what lets one pool serve every dimension of a server.
 */
export interface ChunkPipelineSetup {
    /** The registries as bytes, shared rather than copied to each worker. */
    readonly registryBundle: SharedArrayBuffer;
    /** Whether the carvers run, which is part of Java's `terrain` status. */
    readonly carve?: boolean;
    /** Whether the decoration pass includes structure placement. Defaults to true. */
    readonly structures?: boolean;
    /** Whether to load the standard Java jar templates. Defaults to true for whole chunks. */
    readonly javaTemplates?: boolean;
}

/**
 * What every chunk task carries: the key the worker compiles its pipeline from and the seed, as
 * a string because a bigint does not clone.
 */
export interface ChunkTaskInput extends PipelineKey {
    /** The world seed as a decimal string, because a `bigint` does not survive every clone. */
    readonly seed: string;
}

/** What a `features` task carries besides its key and seed: the nine immutable terrain tiles it reads. */
export interface FeatureTaskInput extends ChunkTaskInput {
    /** Terrain payloads in the feature view's row-major offset order. */
    readonly terrain: readonly GenerationRegionPayload[];
}

/** Raised when the pool hands a worker a task it has no body for. */
export class UnsupportedChunkStatusError extends Error {
    public override name = 'UnsupportedChunkStatusError';

    public constructor(status: string) {
        super(`A generation worker has no body for ${status}.`);
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
    isPipelineKey(value) && 'seed' in value && typeof value.seed === 'string';

/** Whether a task carries structure inputs along with its key and seed. */
const isTerrainInput = (value: unknown): value is TerrainTaskInput =>
    isChunkInput(value) &&
    'beard' in value &&
    Array.isArray(value.beard) &&
    'junctions' in value &&
    Array.isArray(value.junctions);

/** Whether a cloned input has the bytes and collections a region needs to be adopted. */
const isRegionPayload = (value: unknown): value is GenerationRegionPayload =>
    typeof value === 'object' &&
    value !== null &&
    'chunkX' in value &&
    typeof value.chunkX === 'number' &&
    'chunkZ' in value &&
    typeof value.chunkZ === 'number' &&
    'minY' in value &&
    typeof value.minY === 'number' &&
    'height' in value &&
    typeof value.height === 'number' &&
    'radius' in value &&
    typeof value.radius === 'number' &&
    'palette' in value &&
    Array.isArray(value.palette) &&
    'states' in value &&
    value.states instanceof ArrayBuffer &&
    'highest' in value &&
    value.highest instanceof ArrayBuffer &&
    (!('frozenSurface' in value) || value.frozenSurface === undefined || value.frozenSurface instanceof ArrayBuffer) &&
    'blockEntities' in value &&
    Array.isArray(value.blockEntities) &&
    'entitySpawns' in value &&
    Array.isArray(value.entitySpawns);

/** Whether a value carries nine valid terrain tiles along with its key and seed. */
const isFeatureInput = (value: unknown): value is FeatureTaskInput =>
    isChunkInput(value) &&
    'terrain' in value &&
    Array.isArray(value.terrain) &&
    value.terrain.length === 9 &&
    value.terrain.every(isRegionPayload);

/**
 * Builds this worker's generator.
 *
 * Called once per worker. Everything expensive lives here: parsing the shared registries, the
 * density graph and the structure template store. The 7594-entry climate biome source and the
 * noise tables follow with the first task of each key and seed.
 *
 * @param setup - What the pool was built with.
 * @returns The pipeline the pool drives.
 * @throws TypeError when the setup is not a generation pipeline's.
 */
export const createGenerationPipeline = (setup: unknown): WorkerPipeline => {
    if (!isSetup(setup)) throw new TypeError('A generation worker needs a registry bundle in shared memory.');

    const registries = readRegistryBundle(setup.registryBundle);
    const generator = new DataDrivenGenerator({
        registries,
        ...(setup.carve === undefined ? {} : { carve: setup.carve }),
        ...(setup.structures === undefined ? {} : { structures: setup.structures }),
        // Read off disk here rather than carried, because the templates are tens of megabytes
        // of structure NBT and a worker reads them once for the life of the process.
        ...(setup.javaTemplates === false
            ? {}
            : { templates: findJavaTemplateSource(cacheRoot(), registries.processorLists) })
    });

    return {
        async run(task: GenerationTask): Promise<GenerationResult> {
            if (task.status === 'terrain') {
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

            if (task.status === 'features') {
                if (!isFeatureInput(task.input)) {
                    throw new TypeError(
                        `The feature task at ${task.chunkX}, ${task.chunkZ} carries no terrain view, seed and pipeline key.`
                    );
                }

                return {
                    payload: generator.buildFeatureTile(
                        task.chunkX,
                        task.chunkZ,
                        BigInt(task.input.seed),
                        task.input.terrain,
                        task.input
                    ),
                    transferList: []
                };
            }

            if (task.status === 'full') {
                if (!isChunkInput(task.input)) {
                    throw new TypeError(
                        `The chunk task at ${task.chunkX}, ${task.chunkZ} carries no seed and pipeline key.`
                    );
                }

                const tile = await generator.buildFullTile(
                    task.chunkX,
                    task.chunkZ,
                    BigInt(task.input.seed),
                    task.input
                );
                return { payload: tile.payload, transferList: tile.transferList };
            }

            throw new UnsupportedChunkStatusError(task.status);
        }
    };
};
