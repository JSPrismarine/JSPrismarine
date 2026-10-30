import { describe, expect, it } from 'vitest';

import { testContent } from '../../../testing/entityServer';
import { Dimensions } from '../../Dimension';
import { GeneratorFactories } from '../../GeneratorFactories';
import { DEBUG_GENERATOR_KIND } from './debug';

describe('the minecraft:debug factory', () => {
    it('is registered so a preset naming it loads, and refuses to build', () => {
        const factories = new GeneratorFactories();
        expect(factories.kinds()).toContain(DEBUG_GENERATOR_KIND);

        expect(() =>
            factories.build({
                stem: { type: Dimensions.Overworld.id, generator: { type: DEBUG_GENERATOR_KIND } },
                dimension: Dimensions.Overworld,
                seed: 1n,
                content: testContent,
                worldgen: () => {
                    throw new Error('The debug world never reads the Java registries');
                },
                logger: { info: () => {}, warn: () => {} }
            })
        ).toThrowError('minecraft:debug is not supported');
    });
});
