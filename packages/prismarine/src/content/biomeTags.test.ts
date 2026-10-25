import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { parseBiomeTags } from './biomeTags';

const biomeFile = (identifier: string, data: unknown): readonly [string, Definition] => [
    identifier,
    { identifier, registry: 'biomes', pack: 'vanilla', path: `biomes/${identifier}.biome.json`, data }
];

/** The shape Mojang's own `biomes/plains.biome.json` has, trimmed to what this reads. */
const plains = biomeFile('minecraft:plains', {
    format_version: '1.26.0',
    'minecraft:biome': {
        description: { identifier: 'minecraft:plains' },
        components: {
            'minecraft:climate': { temperature: 0.8 },
            'minecraft:tags': { tags: ['animal', 'monster', 'overworld', 'plains', 'bee_habitat'] }
        }
    }
});

describe('parseBiomeTags', () => {
    it('reads the tags component of a Bedrock biome definition', () => {
        expect(parseBiomeTags([plains]).get('minecraft:plains')).toEqual([
            'animal',
            'monster',
            'overworld',
            'plains',
            'bee_habitat'
        ]);
    });

    it('indexes every biome in the registry, tagged or not', () => {
        const index = parseBiomeTags([
            plains,
            biomeFile('minecraft:the_end', {
                'minecraft:biome': { description: { identifier: 'minecraft:the_end' }, components: {} }
            })
        ]);

        expect([...index.keys()]).toEqual(['minecraft:plains', 'minecraft:the_end']);
        expect(index.get('minecraft:the_end')).toEqual([]);
    });

    it('has no tags for a definition it cannot read, rather than a guessed default', () => {
        const index = parseBiomeTags([
            biomeFile('minecraft:a', {
                'minecraft:biome': { components: { 'minecraft:tags': { tags: 'overworld' } } }
            }),
            biomeFile('minecraft:b', { 'minecraft:biome': 'not a biome' }),
            biomeFile('minecraft:c', null)
        ]);

        for (const identifier of ['minecraft:a', 'minecraft:b', 'minecraft:c']) {
            expect(index.get(identifier), identifier).toEqual([]);
        }
    });

    it('drops a non-string entry out of an otherwise readable tag list', () => {
        const index = parseBiomeTags([
            biomeFile('minecraft:a', {
                'minecraft:biome': { components: { 'minecraft:tags': { tags: ['overworld', 7, null, 'plains'] } } }
            })
        ]);

        expect(index.get('minecraft:a')).toEqual(['overworld', 'plains']);
    });
});
