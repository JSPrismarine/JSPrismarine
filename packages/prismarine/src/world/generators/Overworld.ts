import { availableParallelism } from 'node:os';

import BaseGenerator from '../BaseGenerator';
import type { StructureSearchRequest, StructureSearchResult, SurfaceProbe } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { TerrainPoolOptions } from './datadriven/DataDrivenGenerator';
import { DataDrivenGenerator, defaultTerrainPipeline } from './datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from './datadriven/javaStructureTemplates';
import {
    JAVA_WORLDGEN_ENV,
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from './datadriven/javaWorldgenData';

/**
 * How many cores to leave for everything that is not terrain.
 *
 * The main thread keeps the holders, the feature pass, the Bedrock translation and the tick
 * loop, and the server still has a network thread and a disk to serve. A host with fewer than
 * `LEAVE_FREE + 1` cores gets no pool, because one worker was measured at 1.15 times inline and
 * costs about 80 MiB of its own.
 */
const LEAVE_FREE = 2;

/**
 * The most workers worth starting.
 *
 * Aggregate throughput peaks at 4.7 times one thread at five or six on an Apple M1 Pro and
 * declines past six, because six of its eight cores are performance cores and every worker is a
 * whole V8 isolate with its own garbage collector. Measured twice; see
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
 * The `terrain` status runs in a pool of worker threads, sized from the core count. Nothing has
 * to be built for that to work in a dev checkout, because a worker inherits this process's
 * loader. A host that cannot run workers at all generates terrain on this thread and says so
 * once, since a server that boots slowly beats one that does not boot.
 */
export default class Overworld extends BaseGenerator {
    private generator: DataDrivenGenerator | null = null;

    /** Whether the terrain pool is still expected to run, which only the log line reads. */
    private pooled = true;

    /**
     * Generates one chunk.
     *
     * @throws When Mojang's data is not on disk. Both halves are fetched rather than published
     *   with this server, and generating terrain without them would produce a world that is
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
        const terrain = this.terrainPool();
        this.generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
            ...(terrain === undefined ? {} : { terrain })
        });
        if (terrain !== undefined && this.pooled) {
            this.getLogger()?.info(`Generating terrain in §b${terrain.workers}§r worker thread(s)`);
        }

        return this.generator;
    }

    /**
     * How the `terrain` bodies should run, or undefined when this host is too small to bother.
     *
     * The pipeline module is resolved rather than configured, and a worker inherits this
     * process's loader, so a checkout run under `tsx` and a published install both work with
     * nothing built first. A single executable keeps its modules in the binary, where no worker
     * thread can import them, so there the generator says so once and runs terrain here.
     */
    private terrainPool(): TerrainPoolOptions | undefined {
        const workers = Math.min(MOST_WORKERS, availableParallelism() - LEAVE_FREE);
        if (workers < 1) return undefined;

        return {
            pipeline: defaultTerrainPipeline(),
            workers,
            onUnavailable: (reason) => {
                this.pooled = false;
                this.getLogger()?.warn(`Generating terrain on the server thread, because ${reason}`);
            }
        };
    }
}
