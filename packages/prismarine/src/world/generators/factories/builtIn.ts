/**
 * The generator kinds every server starts with.
 *
 * One file per kind. A kind's factory reads its stem's settings and builds the generator for
 * the dimension in the build context; `GeneratorFactories` dispatches on the kind id.
 */
import type { GeneratorFactory } from '../../GeneratorFactories';
import { debugGeneratorFactory } from './debug';
import { flatGeneratorFactory } from './flat';
import { createNoiseGeneratorFactory } from './noise';
import { voidGeneratorFactory } from './void';

/**
 * The four kinds in the order `GeneratorFactories` registers them.
 *
 * A function rather than a constant because the noise factory keeps the server's one shared
 * generator and worker pool, so each registry gets a fresh one.
 */
export const builtInGeneratorFactories = (): readonly GeneratorFactory[] => [
    createNoiseGeneratorFactory(),
    flatGeneratorFactory,
    voidGeneratorFactory,
    debugGeneratorFactory
];
