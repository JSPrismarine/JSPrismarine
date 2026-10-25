import BaseGenerator from '../BaseGenerator';
import type { SurfaceProbe } from '../Generator';
import type Chunk from '../chunk/Chunk';
import { DataDrivenGenerator } from './datadriven/DataDrivenGenerator';
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
 */
export default class Overworld extends BaseGenerator {
    private generator: DataDrivenGenerator | null = null;

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
        this.generator = new DataDrivenGenerator({
            registries,
            templates: findJavaTemplateSource(cacheRoot(), registries.processorLists)
        });
        return this.generator;
    }
}
