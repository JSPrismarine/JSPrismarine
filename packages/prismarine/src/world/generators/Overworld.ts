import { availableParallelism } from 'node:os';

import BaseGenerator from '../BaseGenerator';
import type { StructureSearchRequest, StructureSearchResult, SurfaceProbe } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { ChunkPoolOptions } from './datadriven/DataDrivenGenerator';
import { DataDrivenGenerator, defaultChunkPipeline } from './datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from './datadriven/javaStructureTemplates';
import {
    JAVA_WORLDGEN_ENV,
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from './datadriven/javaWorldgenData';

/**
 * How many cores to leave for everything that is not chunk generation.
 *
 * The main thread keeps the Bedrock translation and the tick loop, and the server still has a
 * network thread and a disk to serve. A host with fewer than `LEAVE_FREE + 1` cores gets no
 * pool, because one worker costs about 80 MiB of its own and buys nothing over doing the work
 * here.
 */
const LEAVE_FREE = 2;

/**
 * The most workers worth starting.
 *
 * Six on an Apple M1 Pro, where six of the eight cores are performance cores and every worker
 * is a whole V8 isolate with its own garbage collector. Measured over a 24 by 24 block of
 * overworld chunks: 427.8 ms a chunk on one thread, 124.7 with six workers. See
 * [the architecture decision](../../../../../docs/adr/0002-chunk-generation-architecture.md).
 */
const MOST_WORKERS = 6;

/**
 * The overworld, generated from Java Edition's published world generation data.
 *
 * The pipeline is Java's: the density functions and aquifers decide the terrain, the carvers
 * open the caves and canyons, the material rule tree lays the surface, the multi-noise biome
 * source names the biomes, and the 273 placed features decorate. Everything that produces is a
 * Java block state, translated to Bedrock once per chunk.
 *
 * Building that pipeline reads about 1500 JSON documents, so it happens on the first chunk
 * rather than when the server registers its generators: a server configured for a flat world
 * should not pay for data it will not use.
 *
 * Whole chunks are built in a pool of worker threads, sized from the core count, each worker
 * owning a region of the world so the neighbors a chunk reads are ones it has already built.
 * Nothing has to be built for that to work in a dev checkout, because a worker inherits this
 * process's loader. A host that cannot run workers at all generates on this thread and says so
 * once, since a server that boots slowly beats one that does not boot.
 */
export default class Overworld extends BaseGenerator {
    private generator: DataDrivenGenerator | null = null;

    /** Whether the chunk pool is still expected to run, which only the log line reads. */
    private pooled = true;

    /**
     * Generates one chunk.
     *
     * @throws When Mojang's data is not on disk. Both halves are fetched rather than published
     *   with this server, and generating without them would produce a world that is
     *   quietly not Java's.
     */
    public async generateChunk(cx: number, cz: number, seed?: number): Promise<Chunk> {
        return this.require().generateChunk(cx, cz, seed);
    }

    /** @inheritDoc */
    public surfaceAt(x: number, z: number, seed?: number): SurfaceProbe {
        return this.require().surfaceAt(x, z, seed);
    }

    /** @inheritDoc */
    public locate(request: StructureSearchRequest): StructureSearchResult | undefined {
        return this.require().locate(request);
    }

    /** @inheritDoc */
    public stopGenerating(): void {
        // Only if the pipeline was ever built. A server that shuts down before its first chunk
        // has nothing queued to give up, and building one here to tell it to stop would read
        // about 1500 JSON documents on the way out.
        this.generator?.stopGenerating();
    }

    private require(): DataDrivenGenerator {
        if (this.generator) return this.generator;

        const sources = findJavaWorldgenSources();
        if (sources === undefined) {
            throw new Error(
                'The overworld generator needs Java Edition 26.3 world generation data. Run ' +
                    '`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and ' +
                    '`pnpm --filter @jsprismarine/bedrock-data run datagen:java`, or set ' +
                    `${JAVA_WORLDGEN_ENV.datapack} and ${JAVA_WORLDGEN_ENV.reports}.`
            );
        }

        const registries = loadJavaWorldgenRegistries(sources);
        const chunks = this.chunkPool();
        this.generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
            ...(chunks === undefined ? {} : { chunks })
        });
        if (chunks !== undefined && this.pooled) {
            this.getLogger()?.info(`Generating chunks in §b${chunks.workers}§r worker thread(s)`);
        }

        return this.generator;
    }

    /**
     * How whole chunks should be built, or undefined when this host is too small to bother.
     *
     * The pipeline module is resolved rather than configured, and a worker inherits this
     * process's loader, so a checkout run under `tsx` and a published install both work with
     * nothing built first. A single executable keeps its modules in the binary, where no worker
     * thread can import them, so there the generator says so once and builds chunks here.
     */
    private chunkPool(): ChunkPoolOptions | undefined {
        const workers = Math.min(MOST_WORKERS, availableParallelism() - LEAVE_FREE);
        if (workers < 1) return undefined;

        return {
            pipeline: defaultChunkPipeline(),
            workers,
            onUnavailable: (reason) => {
                this.pooled = false;
                this.getLogger()?.warn(`Generating chunks on the server thread, because ${reason}`);
            }
        };
    }
}
