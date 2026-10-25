import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildServerContent } from './ServerContent';
import { fixtureBlockPalette } from './testing';
import { UnmappedIdentifierError } from './unmappedIdentifiers';

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Writes a datapack on disk, so the check runs through the real loader. */
const writeDatapack = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-unmapped-'));
    temporaryDirs.push(root);
    writeFileSync(join(root, 'pack.mcmeta'), JSON.stringify({ pack: { min_format: 121, max_format: 121 } }));
    for (const [path, text] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }
    return root;
};

const lootTable = (item: string): string =>
    JSON.stringify({ pools: [{ entries: [{ type: 'minecraft:item', name: item }] }] });

/** A content build over one datapack and nothing else. */
const buildOver = (path: string, strict: boolean) =>
    buildServerContent({
        stack: [{ kind: 'datapack', path }],
        strict,
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: []
    });

describe('the Java identifier check', () => {
    it('refuses a strict build, naming the identifier and the pack', () => {
        const path = writeDatapack({ 'data/fixture/loot_table/bogus.json': lootTable('minecraft:ruby_ore') });

        expect(() => buildOver(path, true)).toThrow(UnmappedIdentifierError);
        try {
            buildOver(path, true);
            expect.unreachable('the strict build should have refused');
        } catch (error) {
            expect(error).toBeInstanceOf(UnmappedIdentifierError);
            if (!(error instanceof UnmappedIdentifierError)) return;
            expect(error.message).toContain('minecraft:ruby_ore');
            expect(error.message).toContain(basename(path));
            expect(error.unmapped).toEqual([
                expect.objectContaining({
                    registry: 'item',
                    id: 'minecraft:ruby_ore',
                    resolution: 'unknown',
                    path: 'data/fixture/loot_table/bogus.json'
                })
            ]);
        }
    });

    it('builds anyway without strict, and reports the identifier in the content report', () => {
        const path = writeDatapack({ 'data/fixture/loot_table/bogus.json': lootTable('minecraft:ruby_ore') });

        const content = buildOver(path, false);

        expect(content.diagnostics.filter((entry) => entry.code === 'identifier.unmapped')).toEqual([
            {
                severity: 'error',
                code: 'identifier.unmapped',
                pack: basename(path),
                path: 'data/fixture/loot_table/bogus.json',
                message: expect.stringContaining('minecraft:ruby_ore is a Java item identifier with no Bedrock mapping')
            }
        ]);
    });

    it('says nothing about a pack whose references all resolve', () => {
        const path = writeDatapack({
            'data/fixture/loot_table/real.json': lootTable('minecraft:diamond'),
            // A tag the pack ships, a reviewed loss, and an identifier of a
            // registry the server evaluates in Java's own shape.
            'data/fixture/tags/item/gems.json': JSON.stringify({ values: ['minecraft:diamond'] }),
            'data/fixture/loot_table/tagged.json': JSON.stringify({
                pools: [{ entries: [{ type: 'minecraft:tag', items: '#fixture:gems' }] }]
            }),
            'data/fixture/loot_table/lossy.json': lootTable('minecraft:spectral_arrow'),
            'data/fixture/predicate/wet.json': JSON.stringify({
                type: 'minecraft:location_check',
                predicate: { fluid: 'minecraft:flowing_water' }
            })
        });

        const content = buildOver(path, true);

        expect(content.diagnostics.filter((entry) => entry.code === 'identifier.unmapped')).toEqual([]);
    });
});
