import { describe, expect, it } from 'vitest';

import { findVanillaDatapack } from '../../vectors/javaDatapack';
import { parseFlatGeneratorSettings } from './FlatGeneratorSettings';

/** The overworld stem's settings in `world_preset/flat.json`. */
const FLAT_PRESET_SETTINGS = {
    biome: 'minecraft:plains',
    features: false,
    lakes: false,
    layers: [
        { block: 'minecraft:bedrock', height: 1 },
        { block: 'minecraft:dirt', height: 2 },
        { block: 'minecraft:grass_block', height: 1 }
    ],
    structure_overrides: ['minecraft:strongholds', 'minecraft:villages']
};

describe('parseFlatGeneratorSettings', () => {
    it('reads the flat preset layers bottom up', () => {
        expect(parseFlatGeneratorSettings(FLAT_PRESET_SETTINGS)).toEqual({
            layers: [
                { block: 'minecraft:bedrock', height: 1 },
                { block: 'minecraft:dirt', height: 2 },
                { block: 'minecraft:grass_block', height: 1 }
            ],
            biome: 'minecraft:plains',
            lakes: false,
            features: false,
            structureOverrides: ['minecraft:strongholds', 'minecraft:villages']
        });
    });

    it('defaults biome, lakes and features and leaves structure overrides absent', () => {
        const settings = parseFlatGeneratorSettings({ layers: [] });
        expect(settings).toEqual({ layers: [], biome: 'minecraft:plains', lakes: false, features: false });
        expect('structureOverrides' in settings).toBe(false);
    });

    it('keeps a single structure override string and expands bare identifiers', () => {
        const settings = parseFlatGeneratorSettings({
            layers: [{ block: 'stone', height: 4 }],
            biome: 'desert',
            structure_overrides: 'minecraft:villages'
        });
        expect(settings.layers[0]?.block).toBe('minecraft:stone');
        expect(settings.biome).toBe('minecraft:desert');
        expect(settings.structureOverrides).toBe('minecraft:villages');
    });

    it('names the layer that is malformed', () => {
        expect(() => parseFlatGeneratorSettings({ layers: [{ block: 'minecraft:stone' }] }, 'flat')).toThrow(
            'flat.layers[0].height: expected an integer'
        );
        expect(() =>
            parseFlatGeneratorSettings({ layers: [{ block: 'minecraft:stone', height: 5000 }] }, 'flat')
        ).toThrow('flat.layers[0].height has to be between 0 and 4064');
        expect(() => parseFlatGeneratorSettings({}, 'flat')).toThrow('flat.layers: expected an array');
    });
});

const vanilla = findVanillaDatapack();

describe.skipIf(!vanilla)('the real vanilla flat presets', { tags: ['real-data'] }, () => {
    if (!vanilla) return;

    it('parses the nine 26.3 flat level generator presets with the layer counts from the datapack', () => {
        const ids = vanilla.listData('worldgen/flat_level_generator_preset');
        expect(ids).toEqual([
            'bottomless_pit',
            'classic_flat',
            'desert',
            'overworld',
            'redstone_ready',
            'snowy_kingdom',
            'the_void',
            'tunnelers_dream',
            'water_world'
        ]);

        const summaries = ids.map((id) => {
            const document = vanilla.readData(`worldgen/flat_level_generator_preset/${id}.json`);
            if (typeof document !== 'object' || document === null || !('settings' in document)) {
                throw new Error(`${id} has no settings`);
            }
            const settings = parseFlatGeneratorSettings(document.settings, `${id}.settings`);
            return [id, settings.layers.length, settings.biome] as const;
        });
        expect(summaries).toEqual([
            ['bottomless_pit', 3, 'minecraft:plains'],
            ['classic_flat', 3, 'minecraft:plains'],
            ['desert', 4, 'minecraft:desert'],
            ['overworld', 4, 'minecraft:plains'],
            ['redstone_ready', 3, 'minecraft:desert'],
            ['snowy_kingdom', 5, 'minecraft:snowy_plains'],
            ['the_void', 1, 'minecraft:the_void'],
            ['tunnelers_dream', 4, 'minecraft:windswept_hills'],
            ['water_world', 6, 'minecraft:deep_ocean']
        ]);
    });
});
