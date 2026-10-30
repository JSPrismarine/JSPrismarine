import type { LevelStem } from '@jsprismarine/worldgen';

import Chunk from '../../chunk/Chunk';
import type { GeneratorFactory } from '../../GeneratorFactories';

/** The kind id of a dimension with nothing in it. */
export const VOID_GENERATOR_KIND = 'jsprismarine:void';

/**
 * A stem for an empty dimension of the given type.
 *
 * A Bedrock add-on dimension whose only generator is `void` becomes one of these.
 */
export const voidStem = (dimensionType: string): LevelStem => ({
    type: dimensionType,
    generator: { type: VOID_GENERATOR_KIND, settings: undefined }
});

/**
 * The `jsprismarine:void` kind: every chunk is empty air with the dimension's bounds.
 *
 * Nothing is queued and nothing is cached, so the generator has no `stopGenerating` to offer.
 */
export const voidGeneratorFactory: GeneratorFactory = {
    kind: VOID_GENERATOR_KIND,
    build(context) {
        const dimension = context.dimension;
        return {
            generateChunk: async (cx, cz) => new Chunk(cx, cz, undefined, dimension),
            // An empty dimension has a surface nowhere, which is what undefined says.
            surfaceAt: () => undefined
        };
    }
};
