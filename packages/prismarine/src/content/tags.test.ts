import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildContentTags } from './tags';

const tagFile = (identifier: string, data: unknown, pack = 'vanilla'): readonly [string, Definition] => [
    identifier,
    { identifier, registry: 'tags', pack, path: `data/${identifier}.json`, data }
];

describe('buildContentTags', () => {
    it('splits the loader’s prefixed ids back into one table per tagged registry', () => {
        const tags = buildContentTags(
            new Map([
                tagFile('block/minecraft:logs', { values: ['minecraft:oak_log'] }),
                tagFile('item/minecraft:planks', { values: ['minecraft:oak_planks'] }),
                tagFile('worldgen/biome/minecraft:is_forest', { values: ['minecraft:forest'] })
            ])
        );

        expect(tags.registries).toEqual(['block', 'item', 'worldgen/biome']);
        expect(tags.members('block', 'minecraft:logs')).toEqual(['minecraft:oak_log']);
        expect(tags.members('worldgen/biome', 'minecraft:is_forest')).toEqual(['minecraft:forest']);
        expect(tags.size).toBe(3);
    });

    it('keeps the order the loader already merged the packs into', () => {
        const tags = buildContentTags(
            new Map([
                tagFile(
                    'block/minecraft:logs',
                    { values: ['minecraft:oak_log', 'minecraft:birch_log'] },
                    'vanilla+world'
                )
            ])
        );

        expect(tags.members('block', 'minecraft:logs')).toEqual(['minecraft:oak_log', 'minecraft:birch_log']);
    });

    it('expands a tag reference into the referenced tag’s members', () => {
        const tags = buildContentTags(
            new Map([
                tagFile('block/minecraft:oak', { values: ['minecraft:oak_log'] }),
                tagFile('block/minecraft:logs', { values: ['#minecraft:oak', 'minecraft:birch_log'] })
            ])
        );

        expect(tags.members('block', 'minecraft:logs')).toEqual(['minecraft:oak_log', 'minecraft:birch_log']);
        expect(tags.includes('block', 'minecraft:logs', 'minecraft:oak_log')).toBe(true);
    });

    it('reports a cycle rather than throwing, so one bad pack cannot stop the load', () => {
        const tags = buildContentTags(
            new Map([
                tagFile('block/minecraft:a', { values: ['#minecraft:b'] }),
                tagFile('block/minecraft:b', { values: ['#minecraft:a'] })
            ])
        );

        expect(tags.diagnostics.map((diagnostic) => diagnostic.code)).toContain('tag.cycle');
    });

    it('tells an undefined tag apart from an empty one', () => {
        const tags = buildContentTags(new Map([tagFile('block/minecraft:empty', { values: [] })]));

        expect(tags.has('block', 'minecraft:empty')).toBe(true);
        expect(tags.has('block', 'minecraft:absent')).toBe(false);
        expect(tags.members('block', 'minecraft:absent')).toEqual([]);
    });
});
