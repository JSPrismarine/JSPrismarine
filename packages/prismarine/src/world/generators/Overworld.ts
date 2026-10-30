import type { ServerContent } from '../../content/ServerContent';
import type { GeneratorLogger } from '../BaseGenerator';
import { Dimensions } from '../Dimension';
import type { Generator, GeneratorPosition, StructureSearchRequest, StructureSearchResult, SurfaceProbe } from '../Generator';
import { GeneratorFactories } from '../GeneratorFactories';
import type Chunk from '../chunk/Chunk';
import { requireJavaWorldgenRegistries } from './datadriven/javaWorldgenData';
import { OVERWORLD_NOISE_STEM } from './factories/noise';

/**
 * The Overworld as `GeneratorManager` built it: Java's `minecraft:normal` preset Overworld
 * stem, built through the `minecraft:noise` factory on the first chunk.
 *
 * Lazy for the reason it always was: the factory reads about 1500 JSON documents, and a server
 * that registers this generator and then shuts down before its first chunk should not pay for
 * them.
 *
 * @deprecated Build through `GeneratorFactories` with a `minecraft:noise` stem; see
 *   `OVERWORLD_NOISE_STEM`. Removed in the next release.
 */
export default class Overworld implements Generator {
    private generator: Generator | null = null;
    private readonly factories = new GeneratorFactories();

    public constructor(
        private readonly contentSource: () => ServerContent,
        private readonly logger?: GeneratorLogger
    ) {}

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
        return this.require().surfaceAt?.(x, z, seed);
    }

    /** @inheritDoc */
    public locate(request: StructureSearchRequest): StructureSearchResult | undefined {
        return this.require().locate?.(request);
    }

    /** @inheritDoc */
    public structureSpawnOverrideAt(identifier: string, at: GeneratorPosition, seed?: bigint): boolean | undefined {
        return this.require().structureSpawnOverrideAt?.(identifier, at, seed);
    }

    /** @inheritDoc */
    public stopGenerating(): void {
        // Only if the pipeline was ever built. A server that shuts down before its first chunk
        // has nothing queued to give up.
        this.generator?.stopGenerating?.();
    }

    private require(): Generator {
        if (this.generator) return this.generator;

        this.generator = this.factories.build({
            stem: OVERWORLD_NOISE_STEM,
            dimension: Dimensions.Overworld,
            // The noise generator is seeded per chunk request, so the context's seed is unread.
            seed: 0n,
            content: this.contentSource,
            worldgen: requireJavaWorldgenRegistries,
            logger: this.logger ?? { info: () => {}, warn: () => {} }
        });
        return this.generator;
    }
}
