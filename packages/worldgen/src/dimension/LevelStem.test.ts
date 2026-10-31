import { describe, expect, it } from 'vitest';

import { parseGeneratorDefinition, parseLevelStem } from './LevelStem';

/** The overworld stem of `world_preset/normal.json`, verbatim. */
const NORMAL_OVERWORLD = {
    type: 'minecraft:overworld',
    generator: {
        type: 'minecraft:noise',
        biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
        settings: 'minecraft:overworld'
    }
};

describe('parseLevelStem', () => {
    it('reads a noise stem with a multi_noise preset', () => {
        expect(parseLevelStem(NORMAL_OVERWORLD)).toEqual({
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
            }
        });
    });

    it('reads a flat stem into flat settings', () => {
        const stem = parseLevelStem({
            type: 'minecraft:the_nether',
            generator: {
                type: 'minecraft:flat',
                settings: {
                    biome: 'minecraft:basalt_deltas',
                    layers: [
                        { block: 'minecraft:bedrock', height: 1 },
                        { block: 'minecraft:basalt', height: 3 }
                    ]
                }
            }
        });
        expect(stem.type).toBe('minecraft:the_nether');
        expect(stem.generator).toEqual({
            type: 'minecraft:flat',
            settings: {
                layers: [
                    { block: 'minecraft:bedrock', height: 1 },
                    { block: 'minecraft:basalt', height: 3 }
                ],
                biome: 'minecraft:basalt_deltas',
                lakes: false,
                features: false
            }
        });
    });

    it('keeps a flat_level_generator_preset id for the generator factory to resolve', () => {
        // Java's `world_gen_settings` allows the id in place of the settings object; the
        // registry that resolves it belongs to the server, so the parser passes it on.
        expect(parseGeneratorDefinition({ type: 'minecraft:flat', settings: 'classic_flat' })).toEqual({
            type: 'minecraft:flat',
            settings: 'minecraft:classic_flat'
        });
    });

    it('reads the debug generator and expands a bare type', () => {
        expect(parseLevelStem({ type: 'overworld', generator: { type: 'debug' } })).toEqual({
            type: 'minecraft:overworld',
            generator: { type: 'minecraft:debug' }
        });
    });

    it('keeps an inline noise settings document as JSON', () => {
        const inline = { noise: { min_y: 0, height: 128 } };
        const generator = parseGeneratorDefinition({
            type: 'minecraft:noise',
            settings: inline,
            biome_source: { type: 'minecraft:the_end' }
        });
        expect(generator).toEqual({
            type: 'minecraft:noise',
            settings: inline,
            biomeSource: { type: 'minecraft:the_end' }
        });
    });

    it('keeps an unknown generator kind with its settings for a factory', () => {
        expect(parseGeneratorDefinition({ type: 'jsprismarine:void', settings: { fill: 'air' } })).toEqual({
            type: 'jsprismarine:void',
            settings: { fill: 'air' }
        });
        expect(parseGeneratorDefinition({ type: 'jsprismarine:void' })).toEqual({
            type: 'jsprismarine:void',
            settings: undefined
        });
    });

    it('names the path of a malformed field', () => {
        expect(() => parseLevelStem({ type: 'minecraft:overworld' }, 'dimensions["minecraft:overworld"]')).toThrow(
            'dimensions["minecraft:overworld"].generator: expected an object'
        );
        expect(() =>
            parseLevelStem(
                { type: 'minecraft:overworld', generator: { type: 'minecraft:noise', settings: 'x' } },
                'stem'
            )
        ).toThrow('stem.generator.biome_source: expected an object');
        expect(() => parseLevelStem({ generator: { type: 'minecraft:debug' } })).toThrow(
            'Expected a registry identifier'
        );
    });
});
