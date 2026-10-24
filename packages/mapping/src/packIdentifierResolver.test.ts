import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { load, reportIdentifiers } from '@jsprismarine/packs';
import { createPackIdentifierResolver } from './packIdentifierResolver';

const resolver = createPackIdentifierResolver();

describe('createPackIdentifierResolver', () => {
    it('resolves a mapped item as known', () => {
        expect(resolver.resolve('item', 'minecraft:stone')).toBe('known');
    });

    it('resolves a reviewed loss as loss', () => {
        expect(resolver.resolve('item', 'minecraft:spectral_arrow')).toBe('loss');
    });

    it('resolves an identifier the pinned Java version does not have as unknown', () => {
        expect(resolver.resolve('item', 'minecraft:not_an_item')).toBe('unknown');
    });

    it('resolves a non-minecraft namespace as known through passthrough', () => {
        expect(resolver.resolve('item', 'fixture:ruby')).toBe('known');
    });

    it('resolves a registry the tables do not cover as unknown', () => {
        expect(resolver.resolve('fluid', 'minecraft:water')).toBe('unknown');
    });

    it('routes each covered registry to its lookup', () => {
        expect(resolver.resolve('block', 'minecraft:oak_log')).toBe('known');
        expect(resolver.resolve('entity_type', 'minecraft:zombified_piglin')).toBe('known');
        expect(resolver.resolve('entity_type', 'minecraft:spectral_arrow')).toBe('loss');
        expect(resolver.resolve('worldgen/biome', 'minecraft:plains')).toBe('known');
        expect(resolver.resolve('enchantment', 'minecraft:infinity')).toBe('known');
    });

    it('resolves tag references as unknown', () => {
        expect(resolver.resolve('item', '#minecraft:planks')).toBe('unknown');
    });
});

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const writeDatapack = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-mapping-resolver-'));
    temporaryDirs.push(root);
    for (const [path, text] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }
    return root;
};

describe('reportIdentifiers with the mapping resolver', () => {
    it('reports each referenced identifier with the mapping tables verdict', () => {
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({ pack: { min_format: 121, max_format: 121 } }),
            'data/fixture/loot_table/arrows.json': JSON.stringify({
                pools: [
                    {
                        entries: [
                            { type: 'minecraft:item', name: 'minecraft:stone' },
                            { type: 'minecraft:item', name: 'minecraft:spectral_arrow' },
                            { type: 'minecraft:item', name: 'minecraft:not_an_item' },
                            { type: 'minecraft:item', name: 'fixture:ruby' }
                        ]
                    }
                ]
            }),
            'data/fixture/predicate/in_water.json': JSON.stringify({
                type: 'minecraft:location_check',
                predicate: { fluid: 'minecraft:water' }
            })
        });

        const { definitions } = load([{ kind: 'datapack', path: pack }], { strict: true });
        const report = reportIdentifiers(definitions, createPackIdentifierResolver());

        const byResolution = new Map<string, number>();
        for (const entry of report) {
            byResolution.set(entry.resolution, (byResolution.get(entry.resolution) ?? 0) + 1);
        }
        // Known: minecraft:stone and fixture:ruby. Loss: minecraft:spectral_arrow.
        // Unknown: minecraft:not_an_item and the uncovered fluid registry's minecraft:water.
        expect(byResolution.get('known')).toBe(2);
        expect(byResolution.get('loss')).toBe(1);
        expect(byResolution.get('unknown')).toBe(2);
    });
});
