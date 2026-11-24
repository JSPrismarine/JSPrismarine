import { describe, expect, it } from 'vitest';

import { parseNoiseGeneratorSettings, SINCE_MATERIAL_RULE_PLACES_SOLID } from './NoiseGeneratorSettings';

const noReferences = (id: string): never => {
    throw new TypeError(`no reference expected, got ${id}`);
};

/** The format before the change: 26.3's. */
const BEFORE = SINCE_MATERIAL_RULE_PLACES_SOLID - 7;

const ROUTER_SLOTS = [
    'temperature',
    'vegetation',
    'continents',
    'erosion',
    'depth',
    'ridges',
    'chunk_surface_level',
    'final_density'
];

/** A minimal `noise_settings` document, with or without `default_block`. */
const settings = (defaultBlock?: string): Record<string, unknown> => ({
    noise: { min_y: -64, height: 384 },
    ...(defaultBlock === undefined ? {} : { default_block: { Name: defaultBlock } }),
    default_fluid: { Name: 'minecraft:water' },
    noise_router: Object.fromEntries(ROUTER_SLOTS.map((slot) => [slot, 0])),
    material_rule: 'minecraft:overworld',
    sea_level: 63,
    disable_mob_generation: false,
    legacy_random_source: false
});

describe('the default_block gate', () => {
    it('reads default_block before the change and requires it', () => {
        expect(
            parseNoiseGeneratorSettings(settings('minecraft:deepslate'), noReferences, 's', BEFORE).defaultBlock
        ).toBe('minecraft:deepslate');
        expect(
            parseNoiseGeneratorSettings(settings('minecraft:deepslate'), noReferences, 's', BEFORE)
        ).not.toHaveProperty('materialRulePlacesSolid');
        expect(() => parseNoiseGeneratorSettings(settings(), noReferences, 's', BEFORE)).toThrow();
    });

    it('fills solid density with stone for the material rule to replace from the change on', () => {
        const parsed = parseNoiseGeneratorSettings(settings(), noReferences, 's', SINCE_MATERIAL_RULE_PLACES_SOLID);
        expect(parsed.defaultBlock).toBe('minecraft:stone');
        expect(parsed.materialRulePlacesSolid).toBe(true);
        expect(
            parseNoiseGeneratorSettings(
                settings('minecraft:deepslate'),
                noReferences,
                's',
                SINCE_MATERIAL_RULE_PLACES_SOLID
            ).defaultBlock
        ).toBe('minecraft:stone');
    });
});
