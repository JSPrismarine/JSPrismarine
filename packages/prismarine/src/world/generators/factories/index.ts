/**
 * The generator kinds every server starts with.
 *
 * One file per kind. A kind's factory reads its stem's settings and builds the generator for
 * the dimension in the build context; `GeneratorFactories` dispatches on the kind id.
 */
import type { GeneratorFactory } from '../../GeneratorFactories';
import { debugGeneratorFactory } from './debug';
import { flatGeneratorFactory } from './flat';
import { noiseGeneratorFactory } from './noise';
import { voidGeneratorFactory } from './void';

export { DEBUG_GENERATOR_KIND, debugGeneratorFactory } from './debug';
export { DEFAULT_FLAT_SETTINGS, FLAT_GENERATOR_KIND, flatGeneratorFactory, flatStem } from './flat';
export { NOISE_GENERATOR_KIND, OVERWORLD_NOISE_STEM, noiseGeneratorFactory } from './noise';
export { VOID_GENERATOR_KIND, voidGeneratorFactory, voidStem } from './void';

/** The four kinds in the order `GeneratorFactories` registers them. */
export const BUILT_IN_GENERATOR_FACTORIES: readonly GeneratorFactory[] = [
    noiseGeneratorFactory,
    flatGeneratorFactory,
    voidGeneratorFactory,
    debugGeneratorFactory
];
