import BaseGenerator from '../BaseGenerator';
import type { GeneratorPosition, StructureSearchRequest, StructureSearchResult, SurfaceProbe } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { StagePoolOptions } from './datadriven/DataDrivenGenerator';
import { DataDrivenGenerator, defaultChunkPipeline } from './datadriven/DataDrivenGenerator';
import { chunkWorkerCount } from './chunkConcurrency';
import { findJavaTemplateSource } from './datadriven/javaStructureTemplates';
import {
    JAVA_WORLDGEN_ENV,
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from './datadriven/javaWorldgenData';

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
 * Terrain and feature status bodies run in a pool of worker threads, sized from the core count.
 * The scheduler stays here, so overlapping requests share the same neighborhood work. Nothing
 * has to be built for that to work in a dev checkout, because a worker inherits this process's
 * loader. A host that cannot run workers still generates on this thread and says so once.
 */
export default class Overworld extends BaseGenerator {
    private generator: DataDrivenGenerator | null = null;

    /** Whether the worker pool is still expected to run, which only the log line reads. */
    private pooled = true;

    /**
     * Generates one chunk.
     *
     * @throws When Mojang's data is not on disk. Both halves are fetched rather than published
     *   with this server, and generating without them would produce a world that is
     *   quietly not Java's.
     */
    public async generateChunk(cx: number, cz: number, seed?: bigint): Promise<Chunk> {
        return this.require().generateChunk(cx, cz, seed);
    }

    /** @inheritDoc */
    public surfaceAt(x: number, z: number, seed?: bigint): SurfaceProbe {
        return this.require().surfaceAt(x, z, seed);
    }

    /** @inheritDoc */
    public locate(request: StructureSearchRequest): StructureSearchResult | undefined {
        return this.require().locate(request);
    }

    /** @inheritDoc */
    public structureSpawnOverrideAt(identifier: string, at: GeneratorPosition, seed?: bigint): boolean | undefined {
        return this.require().structureSpawnOverrideAt(identifier, at, seed);
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
        const stages = this.stagePool();
        this.generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
            ...(stages === undefined ? {} : { stages })
        });
        if (stages !== undefined && this.pooled) {
            this.getLogger()?.info(`Generating terrain and features in §b${stages.workers}§r worker thread(s)`);
        }

        return this.generator;
    }

    /**
     * How terrain and feature status bodies should run, or undefined when this host is too small.
     *
     * The pipeline module is resolved rather than configured, and a worker inherits this
     * process's loader, so a checkout run under `tsx` and a published install both work with
     * nothing built first. A single executable keeps its modules in the binary, where no worker
     * thread can import them, so there the generator says so once and builds chunks here.
     */
    private stagePool(): StagePoolOptions | undefined {
        const workers = chunkWorkerCount();
        if (workers < 1) return undefined;

        return {
            pipeline: defaultChunkPipeline(),
            workers,
            javaTemplates: true,
            onUnavailable: (reason) => {
                this.pooled = false;
                this.getLogger()?.warn(`Generating terrain and features on the server thread, because ${reason}`);
            }
        };
    }
}
