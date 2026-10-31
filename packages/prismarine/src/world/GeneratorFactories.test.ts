import { describe, expect, it } from 'vitest';

import type { LevelStem } from '@jsprismarine/worldgen';

import { testContent } from '../testing/entityServer';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import { GeneratorFactories } from './GeneratorFactories';
import type { GeneratorBuildContext, GeneratorFactory } from './GeneratorFactories';
import { builtInGeneratorFactories } from './generators/factories';

const quiet = { info: () => {}, warn: () => {} };

const contextFor = (stem: LevelStem): GeneratorBuildContext => ({
    stem,
    dimension: Dimensions.Overworld,
    seed: 1n,
    content: testContent,
    worldgen: () => {
        throw new Error('This test never reads the Java registries');
    },
    logger: quiet
});

const stemOf = (kind: string): LevelStem => ({
    type: 'minecraft:overworld',
    generator: { type: kind, settings: undefined }
});

class Stoppable implements Generator {
    public stopped = 0;

    public async generateChunk(): Promise<never> {
        throw new Error('This generator is only here to be stopped');
    }

    public stopGenerating(): void {
        this.stopped++;
    }
}

describe('GeneratorFactories', () => {
    it('starts with the built-in kinds in registration order', () => {
        expect(new GeneratorFactories().kinds()).toEqual(builtInGeneratorFactories().map((factory) => factory.kind));
        expect(new GeneratorFactories().kinds()).toEqual([
            'minecraft:noise',
            'minecraft:flat',
            'jsprismarine:void',
            'minecraft:debug'
        ]);
    });

    it('refuses a second factory for one kind', () => {
        const factories = new GeneratorFactories();
        const duplicate: GeneratorFactory = { kind: 'minecraft:flat', build: () => new Stoppable() };

        expect(() => factories.register(duplicate)).toThrowError('minecraft:flat is already registered');
    });

    it('names the registered kinds when a stem asks for an unknown one', () => {
        const factories = new GeneratorFactories();

        expect(() => factories.build(contextFor(stemOf('plugin:caves')))).toThrowError(
            'Unknown generator kind plugin:caves. Registered kinds: minecraft:noise, minecraft:flat, jsprismarine:void, minecraft:debug'
        );
    });

    it('hands the build context to the factory of the stem kind', () => {
        const factories = new GeneratorFactories([]);
        const seen: GeneratorBuildContext[] = [];
        factories.register({
            kind: 'test:recording',
            build: (context) => {
                seen.push(context);
                return new Stoppable();
            }
        });

        const context = contextFor(stemOf('test:recording'));
        factories.build(context);

        expect(seen).toEqual([context]);
    });

    it('stops every generator it built and nothing it did not', () => {
        const factories = new GeneratorFactories([]);
        const built: Stoppable[] = [];
        factories.register({
            kind: 'test:stoppable',
            build: () => {
                const generator = new Stoppable();
                built.push(generator);
                return generator;
            }
        });
        const loose = new Stoppable();

        factories.build(contextFor(stemOf('test:stoppable')));
        factories.build(contextFor(stemOf('test:stoppable')));
        factories.stopGenerating();

        expect(built.map((generator) => generator.stopped)).toEqual([1, 1]);
        expect(loose.stopped).toBe(0);
    });
});
