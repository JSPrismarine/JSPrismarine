import { describe, expect, it } from 'vitest';

import {
    diffBlocks,
    diffDirectories,
    diffJavaData,
    diffKeys,
    diffRegistries,
    keyPaths,
    renderJavaDataDelta,
    type JavaGeneratedTree
} from './datapack-diff.ts';

const json = (value: unknown): string => JSON.stringify(value);

/** A tree whose datapack files are under `data/minecraft/` unless they name `version.json`. */
const tree = (
    release: string,
    files: Record<string, unknown>,
    reports: Record<string, unknown> = {}
): JavaGeneratedTree => ({
    release,
    datapack: new Map(
        Object.entries(files).map(([path, value]) => [
            path === 'version.json' ? path : `data/minecraft/${path}`,
            json(value)
        ])
    ),
    reports: new Map(Object.entries(reports).map(([path, value]) => [path, json(value)]))
});

const registries = (entries: Record<string, string[]>): unknown =>
    Object.fromEntries(
        Object.entries(entries).map(([registry, ids]) => [
            registry,
            { entries: Object.fromEntries(ids.map((id, index) => [id, { protocol_id: index }])) }
        ])
    );

describe('diffDirectories', () => {
    it('reports a moved directory as a rename, once, at its topmost directory', () => {
        const from = tree('a', {
            'worldgen/configured_carver/cave.json': {},
            'worldgen/configured_carver/deep/canyon.json': {},
            'loot_table/blocks/stone.json': {}
        });
        const to = tree('b', {
            'worldgen/carver/cave.json': {},
            'worldgen/carver/deep/canyon.json': {},
            'loot_table/blocks/stone.json': {}
        });

        expect(diffDirectories(from, to)).toEqual({
            added: [],
            removed: [],
            renamed: [{ from: 'worldgen/configured_carver', to: 'worldgen/carver', overlap: 1 }]
        });
    });

    it('keeps a removed and an added directory apart when their files differ', () => {
        const from = tree('a', { 'old_thing/x.json': {}, 'old_thing/y.json': {} });
        const to = tree('b', { 'new_thing/z.json': {} });

        expect(diffDirectories(from, to)).toEqual({ added: ['new_thing'], removed: ['old_thing'], renamed: [] });
    });
});

describe('diffRegistries', () => {
    it('lists added and removed registries and entries', () => {
        const from = tree(
            'a',
            {},
            { 'registries.json': registries({ 'minecraft:item': ['minecraft:stone'], 'minecraft:gone': [] }) }
        );
        const to = tree(
            'b',
            {},
            {
                'registries.json': registries({
                    'minecraft:item': ['minecraft:stone', 'minecraft:copper_golem_statue'],
                    'minecraft:feature_type': ['minecraft:new_feature']
                })
            }
        );

        expect(diffRegistries(from, to)).toEqual({
            registries: { added: ['minecraft:feature_type'], removed: ['minecraft:gone'] },
            entries: [
                { registry: 'minecraft:feature_type', added: ['minecraft:new_feature'], removed: [] },
                { registry: 'minecraft:item', added: ['minecraft:copper_golem_statue'], removed: [] }
            ]
        });
    });
});

describe('keyPaths', () => {
    it('walks through arrays and stops at three object levels', () => {
        expect([...keyPaths({ pools: [{ entries: [{ type: 'item', deep: { deeper: 1 } }] }] })].sort()).toEqual([
            'pools',
            'pools[].entries',
            'pools[].entries[].deep',
            'pools[].entries[].type'
        ]);
    });
});

describe('diffKeys', () => {
    it('counts each key path over every file of a registry directory', () => {
        const from = tree('a', {
            'loot_table/blocks/a.json': { pools: [{ functions: [] }] },
            'loot_table/blocks/b.json': { pools: [{ functions: [] }] },
            'worldgen/biome/plains.json': { temperature: 1 }
        });
        const to = tree('b', {
            'loot_table/blocks/a.json': { pools: [{ modifier: [] }] },
            'loot_table/blocks/b.json': { pools: [{ modifier: [] }] },
            'worldgen/biome/plains.json': { temperature: 1 }
        });

        expect(diffKeys(from, to)).toEqual([
            {
                directory: 'loot_table',
                added: [{ path: 'pools[].modifier', files: 2 }],
                removed: [{ path: 'pools[].functions', files: 2 }]
            }
        ]);
    });
});

describe('diffBlocks', () => {
    it('reports new blocks with their state count and reshaped blocks', () => {
        const from = tree(
            'a',
            {},
            { 'blocks.json': { 'minecraft:stone': { states: [{}] }, 'minecraft:old': { states: [{}] } } }
        );
        const to = tree(
            'b',
            {},
            { 'blocks.json': { 'minecraft:stone': { states: [{}, {}] }, 'minecraft:shelf': { states: [{}, {}, {}] } } }
        );

        expect(diffBlocks(from, to)).toEqual({
            added: [{ id: 'minecraft:shelf', states: 3 }],
            removed: ['minecraft:old'],
            stateCountChanged: [{ id: 'minecraft:stone', from: 1, to: 2 }]
        });
    });
});

describe('diffJavaData', () => {
    const release = tree(
        '26.3',
        {
            'version.json': { release: '26.3', dataPackFormat: [121, 0] },
            'recipe/stick.json': { type: 'minecraft:crafting_shaped' }
        },
        {
            'registries.json': registries({
                'minecraft:item': ['minecraft:stick'],
                'minecraft:entity_type': ['minecraft:pig']
            }),
            'blocks.json': { 'minecraft:stone': { states: [{}] } }
        }
    );

    it('finds nothing between a release and itself', () => {
        const report = renderJavaDataDelta(diffJavaData(release, release));

        expect(report).toContain('# Java 26.3 to 26.3 data delta');
        expect(report).toContain('| dataPackFormat | [121,0] | [121,0] |');
        expect(report).not.toMatch(/^- /m);
    });

    it('names new items and entity types in their own sections', () => {
        const next = tree(
            '26.4',
            { 'version.json': { release: '26.4', dataPackFormat: [122, 0] }, 'recipe/stick.json': {} },
            {
                'registries.json': registries({
                    'minecraft:item': ['minecraft:stick', 'minecraft:sulfur'],
                    'minecraft:entity_type': ['minecraft:pig', 'minecraft:sulfur_cube']
                }),
                'blocks.json': { 'minecraft:stone': { states: [{}] } }
            }
        );
        const delta = diffJavaData(release, next);

        expect(delta.items).toEqual({ added: ['minecraft:sulfur'], removed: [] });
        expect(delta.entityTypes).toEqual({ added: ['minecraft:sulfur_cube'], removed: [] });
        expect(delta.version.to).toEqual({ release: '26.4', dataPackFormat: '[122,0]' });
        expect(renderJavaDataDelta(delta)).toContain('- removed `type` (1 files)');
    });
});
