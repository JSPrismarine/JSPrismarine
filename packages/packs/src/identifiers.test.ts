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
    it('lists every referenced identifier as unknown under the default resolver', () => {
        const { definitions } = load([{ kind: 'datapack', path: fixturePack() }], { strict: true });
        const report = reportIdentifiers(definitions);

        expect(report).toEqual([
            { registry: 'block', id: 'fixture:marble', resolution: 'unknown', references: 1 },
            { registry: 'block', id: 'minecraft:polished_marble', resolution: 'unknown', references: 1 },
            { registry: 'item', id: '#fixture:gems', resolution: 'unknown', references: 1 },
            { registry: 'item', id: '#minecraft:beacon_payment_items', resolution: 'unknown', references: 1 },
            { registry: 'item', id: 'fixture:ruby', resolution: 'unknown', references: 3 },
            { registry: 'item', id: 'minecraft:emerald', resolution: 'unknown', references: 1 },
            { registry: 'worldgen/biome', id: 'fixture:gem_fields', resolution: 'unknown', references: 1 }
        ]);
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
