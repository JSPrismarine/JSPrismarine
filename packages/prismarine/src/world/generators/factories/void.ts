import type { LevelStem } from '@jsprismarine/worldgen';

import { bedrockBiomeIdIn } from '../../../content/packBiomes';
import { isRecord } from '../../../utils/isRecord';
import Chunk from '../../chunk/Chunk';
import { ChunkBiomes } from '../../chunk/ChunkBiomes';
import type { GeneratorFactory } from '../../GeneratorFactories';

/** The kind id of a dimension with nothing in it. */
export const VOID_GENERATOR_KIND = 'jsprismarine:void';

/** What a `jsprismarine:void` stem's settings may give: the biome every block is in. */
export interface VoidGeneratorSettings {
    /** A Bedrock biome identifier, vanilla or from a pack. Left out, the chunks keep the default. */
    readonly biome?: string;
}

/**
 * A stem for an empty dimension of the given type.
 *
 * A Bedrock add-on dimension, whose only generator is `void`, becomes one of these, with the
 * document's default biome.
 */
export const voidStem = (dimensionType: string, biome?: string): LevelStem => ({
    type: dimensionType,
    generator: { type: VOID_GENERATOR_KIND, settings: biome === undefined ? undefined : { biome } }
});

/** The biome a void stem names, or undefined. */
export const voidBiomeOf = (stem: LevelStem): string | undefined => {
    if (stem.generator.type !== VOID_GENERATOR_KIND || !('settings' in stem.generator)) return undefined;
    const { settings } = stem.generator;
    return isRecord(settings) && typeof settings.biome === 'string' ? settings.biome : undefined;
};

/**
 * The `jsprismarine:void` kind: every chunk is empty air with the dimension's bounds, and in the
 * stem's biome when it names one, as BDS fills a pack dimension's chunks with its default biome.
 *
 * Nothing is queued and nothing is cached, so the generator has no `stopGenerating` to offer.
 */
export const voidGeneratorFactory: GeneratorFactory = {
    kind: VOID_GENERATOR_KIND,
    build(context) {
        const dimension = context.dimension;
        const name = voidBiomeOf(context.stem);
        const biome = name === undefined ? undefined : bedrockBiomeIdIn(context.content().biomes, name);
        if (name !== undefined && biome === undefined)
            context.logger.warn(
                `${dimension.id}'s biome ${name} is neither vanilla nor in a pack; its chunks keep the default`
            );
        return {
            generateChunk: async (cx, cz) => {
                const chunk = new Chunk(cx, cz, undefined, dimension);
                if (biome !== undefined) chunk.setBiomes(new ChunkBiomes(dimension, biome));
                return chunk;
            },
            generatesInline: true,
            // An empty dimension has a surface nowhere, which is what undefined says.
            surfaceAt: () => undefined
        };
    }
};
