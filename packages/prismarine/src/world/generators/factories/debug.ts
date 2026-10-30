import type { GeneratorFactory } from '../../GeneratorFactories';

/** The kind id of Java's debug world, the grid of every block state. */
export const DEBUG_GENERATOR_KIND = 'minecraft:debug';

/**
 * The `minecraft:debug` kind, registered so a preset naming it parses and loads.
 *
 * Building one is refused: nothing lays the block state grid out yet, and a world of air
 * pretending to be the debug world would be worse than a clear refusal.
 */
export const debugGeneratorFactory: GeneratorFactory = {
    kind: DEBUG_GENERATOR_KIND,
    build(context) {
        throw new Error(`${DEBUG_GENERATOR_KIND} is not supported (requested by the ${context.dimension.id} stem)`);
    }
};
