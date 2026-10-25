import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { Diagnostic } from './diagnostics';
import { load } from './load';
import type { Definitions } from './load';

/**
 * Loads the whole real vanilla Bedrock behavior pack, every registry, and
 * checks that it reports no error. Mojang's data is the specification the
 * loader answers to, so an error here is a loader defect, not a bad file.
 *
 * Two corpora, because they cover different code: `bedrock-samples` is the
 * loose-folder publication of the 1.26.50 pack, and the BDS `vanilla` layers
 * are the shipped form, where every folder is a `.brarchive` and later layers
 * override earlier ones. Both need the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so
 * they only run with JSP_VANILLA_BEHAVIOR_PACK set.
 */

const enabled = !!process.env.JSP_VANILLA_BEHAVIOR_PACK;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

/** The `bedrock-samples` behavior pack directory, whose folder name carries a commit hash. */
const samplesBehaviorPack = (): string => {
    const root = join(cacheRoot, 'bedrock-samples');
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'entities'))) return pack;
        }
    }
    throw new Error(`no bedrock-samples behavior pack under ${root}; run the bedrock-data fetch:sources script`);
};

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The BDS vanilla layers, linked into a directory of their own. BDS keeps
 * them in `behavior_packs` beside chemistry, the editor and the experimental
 * packs, which a world only loads when it turns them on, so the composed
 * vanilla pack is the `vanilla` and `vanilla_<version>` folders alone.
 */
const bdsVanillaLayers = (): string => {
    const root = join(cacheRoot, 'bds');
    const version = readdirSync(root).find((name) => existsSync(join(root, name, 'unpacked', 'behavior_packs')));
    if (!version) throw new Error(`no unpacked BDS under ${root}; run the bedrock-data fetch:sources script`);

    const source = join(root, version, 'unpacked', 'behavior_packs');
    const layers = mkdtempSync(join(tmpdir(), 'jsp-vanilla-layers-'));
    temporaryDirs.push(layers);
    for (const name of readdirSync(source)) {
        if (name === 'vanilla' || name.startsWith('vanilla_')) symlinkSync(join(source, name), join(layers, name));
    }
    return layers;
};

const errorsOf = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] =>
    diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

/** The loaded count per registry, printed so a run reports what it covered. */
const sizes = (corpus: string, definitions: Definitions): Record<string, number> => {
    const counted = Object.fromEntries(
        Object.entries(definitions).map(([registry, loaded]) => [registry, loaded.size])
    );
    console.debug(
        `${corpus}, definitions per registry:\n${Object.entries(counted)
            .filter(([, size]) => size > 0)
            .map(([registry, size]) => `  ${registry} ${size}`)
            .join('\n')}`
    );
    return counted;
};

describe.skipIf(!enabled)('the vanilla Bedrock behavior pack', () => {
    it('loads every bedrock-samples registry with no error', { timeout: 60_000 }, () => {
        const { definitions, diagnostics } = load([{ kind: 'directory', path: samplesBehaviorPack() }]);

        expect(errorsOf(diagnostics)).toEqual([]);
        // The 1.26.50.4 publication. bedrock-samples ships no features,
        // feature rules or item catalog, which the BDS layers below cover.
        expect(sizes('bedrock-samples', definitions)).toMatchObject({
            blocks: 98,
            items: 79,
            entities: 128,
            lootTables: 309,
            tradeTables: 27,
            spawnRules: 60,
            recipes: 1881,
            biomes: 89
        });
    });

    it('loads every registry of the composed BDS vanilla layers', { timeout: 60_000 }, () => {
        // A strict load of the shipped vanilla stack has to succeed: this is
        // the headline stack the package exists to read.
        const { definitions, diagnostics } = load([{ kind: 'brarchiveLayers', path: bdsVanillaLayers() }], {
            strict: true
        });

        expect(errorsOf(diagnostics)).toEqual([]);
        // The only two files in the whole of BDS that carry a wrapper with no
        // description: `entities/npc.json` in the vanilla_1.16.100 and
        // vanilla_1.17.20 layers, each a bare component map at format_version
        // 1.13.0. They patch a saved pack through the engine's own upgrade
        // path rather than defining an entity, and the vanilla_1.20.80 layer
        // carries the real npc, so the composed result is right and these two
        // are superseded, which makes them warnings.
        const npc = diagnostics.filter((diagnostic) => diagnostic.path === 'entities/npc.json');
        expect(npc).toEqual([
            expect.objectContaining({
                severity: 'warning',
                code: 'definition.missing-key',
                message: 'description must be an object; a later pack supersedes this file'
            })
        ]);
        // 129 entities, 60 spawn rules, 309 loot tables and 27 trade tables
        // are the counts the research note records for the composed pack. 9
        // of the trade tables ship as the undocumented binary MCB in BDS; the
        // loader warns and skips those, which leaves 18 readable ones.
        expect(sizes('BDS vanilla layers', definitions)).toMatchObject({
            blocks: 98,
            items: 74,
            entities: 129,
            lootTables: 309,
            tradeTables: 18,
            spawnRules: 60,
            recipes: 1881,
            biomes: 89,
            features: 210,
            featureRules: 241
        });
        expect(diagnostics.filter((diagnostic) => diagnostic.code === 'definition.mcb')).not.toEqual([]);
        expect(definitions.entities.get('minecraft:creeper')?.path).toBe('entities/creeper.json');
        expect(definitions.lootTables.get('loot_tables/entities/creeper.json')).toBeDefined();
    });
});
