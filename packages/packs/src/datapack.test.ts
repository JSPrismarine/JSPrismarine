import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { textFiles, writeZip } from '../fixtures/writers';
import { PackLoadError, load } from './load';

const temporaryDirs: string[] = [];
const temporaryDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-datapack-'));
    temporaryDirs.push(dir);
    return dir;
};
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const MCMETA = JSON.stringify({ pack: { description: 'fixture', min_format: 121, max_format: 121 } });
const RECIPE = JSON.stringify({ type: 'minecraft:crafting_shapeless', ingredients: [], result: {} });

/** Writes a datapack folder from path-to-JSON-text entries. */
const writeDatapack = (files: Record<string, string>): string => {
    const root = temporaryDir();
    for (const [path, text] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }
    return root;
};

describe('datapack sources', () => {
    it('loads a directory datapack into the Java registries', () => {
        const pack = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/recipe/ruby_sword.json': RECIPE,
            'data/fixture/loot_table/blocks/ruby_ore.json': JSON.stringify({ pools: [] }),
            'data/fixture/tags/item/gems.json': JSON.stringify({ values: ['fixture:ruby'] }),
            'data/fixture/damage_type/laser.json': JSON.stringify({
                message_id: 'laser',
                scaling: 'never',
                exhaustion: 0.1
            })
        });

        const { definitions, diagnostics } = load([{ kind: 'datapack', path: pack }], { strict: true });
        expect(diagnostics).toEqual([]);
        expect(definitions.recipesJava.get('fixture:ruby_sword')).toMatchObject({
            path: 'data/fixture/recipe/ruby_sword.json'
        });
        expect(definitions.lootTablesJava.get('fixture:blocks/ruby_ore')).toBeDefined();
        expect(definitions.tags.get('item/fixture:gems')?.data).toEqual({ replace: false, values: ['fixture:ruby'] });
        expect(definitions.damageTypes.get('fixture:laser')).toBeDefined();
    });

    it('loads a zip datapack and drops traversal-shaped entries', () => {
        const zip = join(temporaryDir(), 'pack.zip');
        writeFileSync(
            zip,
            writeZip(
                textFiles({
                    'pack.mcmeta': MCMETA,
                    'data/fixture/recipe/ruby_sword.json': RECIPE,
                    '../escape/data/fixture/recipe/evil.json': RECIPE
                })
            )
        );

        const { definitions } = load([{ kind: 'datapack', path: zip }]);
        expect(definitions.recipesJava.size).toBe(1);
        expect(definitions.recipesJava.get('fixture:ruby_sword')).toBeDefined();
    });

    it('reports a format range that misses 121.0 but loads the pack anyway', () => {
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({ pack: { pack_format: 61 } }),
            'data/fixture/recipe/old.json': RECIPE
        });

        const { definitions, diagnostics } = load([{ kind: 'datapack', path: pack }]);
        expect(diagnostics).toMatchObject([{ severity: 'error', code: 'mcmeta.format-mismatch' }]);
        expect(definitions.recipesJava.get('fixture:old')).toBeDefined();

        expect(() => load([{ kind: 'datapack', path: pack }], { strict: true })).toThrow(PackLoadError);
    });

    it('reports a missing pack.mcmeta and still loads the files', () => {
        const pack = writeDatapack({ 'data/fixture/recipe/bare.json': RECIPE });

        const { definitions, diagnostics } = load([{ kind: 'datapack', path: pack }]);
        expect(diagnostics).toMatchObject([{ severity: 'error', code: 'mcmeta.missing' }]);
        expect(definitions.recipesJava.get('fixture:bare')).toBeDefined();
    });

    it('applies only the overlays whose range covers 121.0, later entries winning', () => {
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({
                pack: { min_format: 107, max_format: 121 },
                overlays: {
                    entries: [
                        { directory: 'first', min_format: 121, max_format: 121 },
                        { directory: 'second', min_format: 121, max_format: 121 },
                        { directory: 'older', min_format: 107, max_format: 107 }
                    ]
                }
            }),
            'data/fixture/recipe/base_only.json': RECIPE,
            'data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:base' }),
            'first/data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:first' }),
            'second/data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:second' }),
            'older/data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:older' }),
            'older/data/fixture/recipe/older_only.json': RECIPE
        });

        const { definitions, diagnostics } = load([{ kind: 'datapack', path: pack }], { strict: true });
        expect(diagnostics).toEqual([]);
        expect(definitions.recipesJava.get('fixture:contested')?.data).toEqual({ type: 'fixture:second' });
        expect(definitions.recipesJava.get('fixture:base_only')).toBeDefined();
        expect(definitions.recipesJava.get('fixture:older_only')).toBeUndefined();
    });

    it('keeps a declared overlay directory out of the base view even when its range misses 121.0', () => {
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({
                pack: { min_format: 107, max_format: 121 },
                overlays: { entries: [{ directory: 'older', min_format: 107, max_format: 107 }] }
            }),
            'data/fixture/recipe/base.json': RECIPE,
            'older/data/fixture/recipe/older_only.json': RECIPE
        });

        const { definitions } = load([{ kind: 'datapack', path: pack }]);
        expect(definitions.recipesJava.get('fixture:base')).toBeDefined();
        expect(definitions.recipesJava.size).toBe(1);
    });

    it('warns about a declared overlay directory the pack does not carry', () => {
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({
                pack: { min_format: 121, max_format: 121 },
                overlays: { entries: [{ directory: 'typod', min_format: 121, max_format: 121 }] }
            }),
            'data/fixture/recipe/base.json': RECIPE
        });

        const { diagnostics } = load([{ kind: 'datapack', path: pack }]);
        expect(diagnostics).toMatchObject([
            {
                severity: 'warning',
                code: 'mcmeta.empty-overlay',
                message: 'the overlay directory typod holds no files'
            }
        ]);
    });

    it('lets an overlay replace a base tag file outright rather than merging it', () => {
        // Merging is between packs. Within one pack the overlay is the same
        // pack's file at a higher priority, so the base copy is not read.
        const pack = writeDatapack({
            'pack.mcmeta': JSON.stringify({
                pack: { min_format: 121, max_format: 121 },
                overlays: { entries: [{ directory: 'patch', min_format: 121, max_format: 121 }] }
            }),
            'data/fixture/tags/item/gems.json': JSON.stringify({ values: ['fixture:ruby'] }),
            'patch/data/fixture/tags/item/gems.json': JSON.stringify({ values: ['fixture:sapphire'] })
        });

        const { definitions } = load([{ kind: 'datapack', path: pack }], { strict: true });
        expect(definitions.tags.get('item/fixture:gems')?.data).toEqual({
            replace: false,
            values: ['fixture:sapphire']
        });
    });

    it('merges tag values across packs and lets replace discard earlier ones', () => {
        const first = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/tags/item/gems.json': JSON.stringify({ values: ['fixture:ruby'] }),
            'data/fixture/tags/item/ores.json': JSON.stringify({ values: ['fixture:ruby_ore'] })
        });
        const second = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/tags/item/gems.json': JSON.stringify({
                values: [{ id: 'fixture:sapphire', required: false }]
            }),
            'data/fixture/tags/item/ores.json': JSON.stringify({ replace: true, values: ['fixture:sapphire_ore'] })
        });

        const { definitions } = load([
            { kind: 'datapack', path: first },
            { kind: 'datapack', path: second }
        ]);
        expect(definitions.tags.get('item/fixture:gems')?.data).toEqual({
            replace: false,
            values: ['fixture:ruby', { id: 'fixture:sapphire', required: false }]
        });
        expect(definitions.tags.get('item/fixture:ores')?.data).toEqual({
            replace: true,
            values: ['fixture:sapphire_ore']
        });
    });

    it('lets a later pack win per file for every registry but tags', () => {
        const first = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:first' })
        });
        const second = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/recipe/contested.json': JSON.stringify({ type: 'fixture:second' })
        });

        const { definitions } = load([
            { kind: 'datapack', path: first },
            { kind: 'datapack', path: second }
        ]);
        expect(definitions.recipesJava.get('fixture:contested')?.data).toEqual({ type: 'fixture:second' });
    });

    it('reports an unreadable source without hiding the rest of the stack', () => {
        const good = writeDatapack({
            'pack.mcmeta': MCMETA,
            'data/fixture/recipe/fine.json': RECIPE
        });

        const { definitions, diagnostics } = load([
            { kind: 'datapack', path: join(good, 'missing') },
            { kind: 'datapack', path: good }
        ]);
        expect(diagnostics).toMatchObject([{ severity: 'error', code: 'source.unreadable' }]);
        expect(definitions.recipesJava.get('fixture:fine')).toBeDefined();
    });
});
