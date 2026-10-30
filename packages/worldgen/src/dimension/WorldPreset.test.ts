import { describe, expect, it } from 'vitest';

import { findVanillaDatapack } from '../../vectors/javaDatapack';
import type { GeneratorDefinition } from './LevelStem';
import { parseWorldPreset } from './WorldPreset';

/** `worldgen/world_preset/normal.json` from the 26.3 datapack, verbatim. */
const NORMAL = {
    dimensions: {
        'minecraft:overworld': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
                settings: 'minecraft:overworld'
            }
        },
        'minecraft:the_end': {
            type: 'minecraft:the_end',
            generator: {
                type: 'minecraft:noise',
                biome_source: { type: 'minecraft:the_end' },
                settings: 'minecraft:end'
            }
        },
        'minecraft:the_nether': {
            type: 'minecraft:the_nether',
            generator: {
                type: 'minecraft:noise',
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
                settings: 'minecraft:nether'
            }
        }
    }
};

/** The overworld stem of `world_preset/flat.json`. */
const FLAT = {
    dimensions: {
        'minecraft:overworld': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:flat',
                settings: {
                    biome: 'minecraft:plains',
                    features: false,
                    lakes: false,
                    layers: [
                        { block: 'minecraft:bedrock', height: 1 },
                        { block: 'minecraft:dirt', height: 2 },
                        { block: 'minecraft:grass_block', height: 1 }
                    ],
                    structure_overrides: ['minecraft:strongholds', 'minecraft:villages']
                }
            }
        },
        'minecraft:the_end': NORMAL.dimensions['minecraft:the_end'],
        'minecraft:the_nether': NORMAL.dimensions['minecraft:the_nether']
    }
};

/** Summarizes a stem's generator as the research table does: kind, then settings or biome source. */
const describeGenerator = (generator: GeneratorDefinition): string => {
    if (generator.type === 'minecraft:noise' && 'biomeSource' in generator) {
        const source = generator.biomeSource;
        const biomes =
            source.type === 'minecraft:multi_noise' && 'preset' in source
                ? `multi_noise ${source.preset}`
                : source.type === 'minecraft:fixed'
                  ? `fixed ${source.biome}`
                  : source.type;
        return `noise ${String(generator.settings)} (${biomes})`;
    }
    if (generator.type === 'minecraft:flat' && 'settings' in generator && typeof generator.settings === 'object') {
        const settings = generator.settings;
        return `flat ${settings !== null && 'biome' in settings ? String(settings.biome) : '?'}`;
    }
    return generator.type;
};

describe('parseWorldPreset', () => {
    it('reads the normal preset into three stems', () => {
        const preset = parseWorldPreset(NORMAL);
        expect([...preset.dimensions.keys()]).toEqual([
            'minecraft:overworld',
            'minecraft:the_end',
            'minecraft:the_nether'
        ]);
        expect(preset.dimensions.get('minecraft:the_nether')).toEqual({
            type: 'minecraft:the_nether',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:nether',
                biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' }
            }
        });
        expect(preset.dimensions.get('minecraft:the_end')?.generator).toEqual({
            type: 'minecraft:noise',
            settings: 'minecraft:end',
            biomeSource: { type: 'minecraft:the_end' }
        });
    });

    it('reads the flat preset with a flat overworld and noise nether and end', () => {
        const preset = parseWorldPreset(FLAT);
        expect([...preset.dimensions.values()].map((stem) => describeGenerator(stem.generator))).toEqual([
            'flat minecraft:plains',
            'noise minecraft:end (minecraft:the_end)',
            'noise minecraft:nether (multi_noise minecraft:nether)'
        ]);
    });

    it('expands bare stem ids', () => {
        const preset = parseWorldPreset({ dimensions: { overworld: NORMAL.dimensions['minecraft:overworld'] } });
        expect([...preset.dimensions.keys()]).toEqual(['minecraft:overworld']);
    });

    it('requires minecraft:overworld', () => {
        expect(() =>
            parseWorldPreset({ dimensions: { 'minecraft:the_end': NORMAL.dimensions['minecraft:the_end'] } }, 'custom')
        ).toThrow('custom.dimensions: a world preset has to define "minecraft:overworld"');
    });

    it('rejects the same stem spelled two ways', () => {
        expect(() =>
            parseWorldPreset({
                dimensions: {
                    overworld: NORMAL.dimensions['minecraft:overworld'],
                    'minecraft:overworld': NORMAL.dimensions['minecraft:overworld']
                }
            })
        ).toThrow('"minecraft:overworld" is defined twice');
    });

    it('names the stem whose generator is malformed', () => {
        expect(() =>
            parseWorldPreset(
                { dimensions: { 'minecraft:overworld': { type: 'minecraft:overworld', generator: 7 } } },
                'p'
            )
        ).toThrow('p.dimensions["minecraft:overworld"].generator: expected an object');
        expect(() => parseWorldPreset({}, 'p')).toThrow('p.dimensions: expected an object');
    });
});

const vanilla = findVanillaDatapack();

describe.skipIf(!vanilla)('the real vanilla world presets', { tags: ['real-data'] }, () => {
    if (!vanilla) return;

    it('parses the seven 26.3 presets with the stem kinds from the research table', () => {
        const ids = vanilla.listData('worldgen/world_preset');
        expect(ids).toEqual([
            'amplified',
            'debug_all_block_states',
            'flat',
            'flat_all_dimensions',
            'large_biomes',
            'normal',
            'single_biome_surface'
        ]);

        const presets = new Map(
            ids.map((id) => [id, parseWorldPreset(vanilla.readData(`worldgen/world_preset/${id}.json`), id)])
        );
        const overworld = (id: string): string => {
            const stem = presets.get(id)?.dimensions.get('minecraft:overworld');
            if (!stem) throw new Error(`${id} has no overworld stem`);
            return describeGenerator(stem.generator);
        };

        expect(overworld('normal')).toBe('noise minecraft:overworld (multi_noise minecraft:overworld)');
        expect(overworld('large_biomes')).toBe('noise minecraft:large_biomes (multi_noise minecraft:overworld)');
        expect(overworld('amplified')).toBe('noise minecraft:amplified (multi_noise minecraft:overworld)');
        expect(overworld('single_biome_surface')).toBe('noise minecraft:overworld (fixed minecraft:plains)');
        expect(overworld('flat')).toBe('flat minecraft:plains');
        expect(overworld('debug_all_block_states')).toBe('minecraft:debug');
        expect(overworld('flat_all_dimensions')).toBe('flat minecraft:desert');

        // Every preset but flat_all_dimensions keeps normal's nether and end stems.
        const normal = presets.get('normal');
        for (const [id, preset] of presets) {
            if (id === 'flat_all_dimensions') continue;
            expect([...preset.dimensions.keys()].sort()).toEqual([
                'minecraft:overworld',
                'minecraft:the_end',
                'minecraft:the_nether'
            ]);
            expect(preset.dimensions.get('minecraft:the_nether')).toEqual(
                normal?.dimensions.get('minecraft:the_nether')
            );
            expect(preset.dimensions.get('minecraft:the_end')).toEqual(normal?.dimensions.get('minecraft:the_end'));
        }

        const allFlat = presets.get('flat_all_dimensions');
        expect([...(allFlat?.dimensions.values() ?? [])].map((stem) => describeGenerator(stem.generator))).toEqual([
            'flat minecraft:desert',
            'flat minecraft:the_end',
            'flat minecraft:basalt_deltas'
        ]);
    });
});
