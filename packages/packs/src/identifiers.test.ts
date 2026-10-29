import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { IdentifierResolver } from './identifiers';
import { reportIdentifiers, unknownResolver } from './identifiers';
import { load } from './load';

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const writeDatapack = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-identifiers-'));
    temporaryDirs.push(root);
    for (const [path, text] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }
    return root;
};

const MCMETA = JSON.stringify({ pack: { min_format: 121, max_format: 121 } });

const fixturePack = (): string =>
    writeDatapack({
        'pack.mcmeta': MCMETA,
        'data/fixture/loot_table/blocks/ruby_ore.json': JSON.stringify({
            pools: [
                {
                    entries: [
                        { type: 'minecraft:item', name: 'fixture:ruby' },
                        { type: 'minecraft:item', name: 'fixture:ruby' },
                        { type: 'minecraft:tag', items: '#fixture:gems' }
                    ]
                }
            ]
        }),
        'data/fixture/predicate/on_marble.json': JSON.stringify({
            type: 'minecraft:location_check',
            predicate: { blocks: ['fixture:marble', 'polished_marble'] }
        }),
        'data/fixture/tags/item/gems.json': JSON.stringify({
            values: ['fixture:ruby', { id: 'emerald', required: false }, '#minecraft:beacon_payment_items']
        }),
        'data/fixture/tags/worldgen/biome/shiny.json': JSON.stringify({ values: ['fixture:gem_fields'] })
    });

describe('reportIdentifiers', () => {
    it('lists every reference the pack stack does not close under the default resolver', () => {
        const { definitions } = load([{ kind: 'datapack', path: fixturePack() }], { strict: true });
        const report = reportIdentifiers(definitions);

        // `#fixture:gems` is the one the stack closes itself, because the
        // pack carries the tag file. Everything else needs a resolver, and
        // the default one knows nothing.
        expect(
            report.map(({ registry, id, resolution, source, references }) => [
                registry,
                id,
                resolution,
                source,
                references
            ])
        ).toEqual([
            ['block', 'fixture:marble', 'unknown', 'resolver', 1],
            ['block', 'minecraft:polished_marble', 'unknown', 'resolver', 1],
            ['item', '#fixture:gems', 'known', 'pack', 1],
            ['item', '#minecraft:beacon_payment_items', 'unknown', 'resolver', 1],
            ['item', 'fixture:ruby', 'unknown', 'resolver', 3],
            ['worldgen/biome', 'fixture:gem_fields', 'unknown', 'resolver', 1]
        ]);
    });

    it('names the pack and the file the reference came from', () => {
        const { definitions } = load([{ kind: 'datapack', path: fixturePack() }], { strict: true });
        const report = reportIdentifiers(definitions);

        expect(report.find((entry) => entry.id === 'fixture:marble')).toMatchObject({
            path: 'data/fixture/predicate/on_marble.json'
        });
        expect(report.find((entry) => entry.id === 'fixture:gem_fields')).toMatchObject({
            path: 'data/fixture/tags/worldgen/biome/shiny.json'
        });
    });

    it('closes a reference into a registry the stack itself fills', () => {
        const pack = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/loot_table/entry.json': JSON.stringify({
                pools: [{ entries: [{ type: 'minecraft:loot_table', value: 'fixture:nested' }] }],
                functions: [{ function: 'minecraft:reference', name: 'fixture:paint' }]
            }),
            'data/fixture/loot_table/nested.json': JSON.stringify({ pools: [] }),
            'data/fixture/item_modifier/paint.json': JSON.stringify({ function: 'minecraft:set_name' })
        });
        const { definitions } = load([{ kind: 'datapack', path: pack }], { strict: true });

        // `name` under a loot function reads as an item by field name, and
        // `function` points at the item modifier registry the pack fills.
        const byId = new Map(reportIdentifiers(definitions).map((entry) => [entry.id, entry]));
        expect(byId.get('minecraft:reference')).toMatchObject({ registry: 'function', resolution: 'unknown' });
        expect(byId.get('fixture:paint')).toMatchObject({ registry: 'item', resolution: 'unknown' });
    });

    it('reads an id field from the keys beside it rather than always as an item', () => {
        const pack = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/loot_table/mixed.json': JSON.stringify({
                pools: [
                    {
                        entries: [
                            { type: 'minecraft:item', name: 'fixture:bowl', components: { id: 'fixture:plain' } },
                            { type: 'minecraft:dynamic', name: 'minecraft:sherds' }
                        ],
                        conditions: [
                            { predicate: { tags: [{ id: 'fixture:burns', expected: true }] } },
                            { effects: [{ id: 'fixture:dizzy', duration: 20 }] },
                            { modifier: { type: 'minecraft:set_potion', id: 'fixture:murky' } },
                            { state: { id: 'fixture:slab', properties: { type: 'top' } } },
                            { attribute: 'fixture:reach', id: 'fixture:reach_bonus', amount: 1, operation: 'add_value' }
                        ]
                    }
                ]
            })
        });
        const { definitions } = load([{ kind: 'datapack', path: pack }], { strict: true });

        const byId = new Map(reportIdentifiers(definitions).map((entry) => [entry.id, entry.registry]));
        expect(byId.get('fixture:plain')).toBe('item');
        expect(byId.get('fixture:burns')).toBe('damage_type');
        expect(byId.get('fixture:dizzy')).toBe('mob_effect');
        expect(byId.get('fixture:murky')).toBe('potion');
        expect(byId.get('fixture:slab')).toBe('block');
        // An attribute modifier names itself; the dynamic drop names one of
        // the block's own drops. Neither is an entry of any registry.
        expect(byId.has('fixture:reach_bonus')).toBe(false);
        expect(byId.has('minecraft:sherds')).toBe(false);
    });

    it('carries the injected resolver verdict per identifier', () => {
        const { definitions } = load([{ kind: 'datapack', path: fixturePack() }], { strict: true });
        const resolver: IdentifierResolver = {
            resolve: (registry, javaId) => {
                if (registry === 'item' && javaId === 'minecraft:emerald') return 'known';
                if (registry === 'block' && javaId === 'minecraft:polished_marble') return 'loss';
                return 'unknown';
            }
        };

        const report = reportIdentifiers(definitions, resolver);
        const byId = new Map(report.map((entry) => [`${entry.registry} ${entry.id}`, entry.resolution]));
        expect(byId.get('item minecraft:emerald')).toBe('known');
        expect(byId.get('block minecraft:polished_marble')).toBe('loss');
        expect(byId.get('item fixture:ruby')).toBe('unknown');
    });

    it('resolves everything as unknown through unknownResolver', () => {
        expect(unknownResolver.resolve('item', 'minecraft:stone')).toBe('unknown');
    });
});
