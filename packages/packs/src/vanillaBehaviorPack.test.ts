import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readBedrockSchemas } from './bedrockSchemas';
import { bedrockSchemaValidator } from './bedrockSchemaValidator';
import type { Diagnostic } from './diagnostics';
import { parseLenientJson } from './lenientJson';
import { load } from './load';
import type { Definitions } from './load';
import { parseManifest } from './manifest';
import { VANILLA_BEHAVIOR_PACK_UUID } from './sources';
import type { DefinitionValidator } from './validation';
import { composeValidators, structuralValidator } from './validation';

/**
 * Loads the whole real vanilla Bedrock behavior pack, every registry, and
 * checks that it reports no error, with Mojang's own `metadata/json_schemas`
 * in the validator. Mojang's data is the specification the loader answers to,
 * so an error here is a loader defect, not a bad file.
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

/** The `bedrock-samples` checkout, whose folder name carries a commit hash. */
const samplesCheckout = (): string => {
    const root = join(cacheRoot, 'bedrock-samples');
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            if (existsSync(join(unpacked, checkout, 'behavior_pack', 'entities'))) return join(unpacked, checkout);
        }
    }
    throw new Error(`no bedrock-samples checkout under ${root}; run the bedrock-data fetch:sources script`);
};

/**
 * The structural checks plus Mojang's published schemas, built once on first
 * use so a run without the cache still skips rather than throwing. The
 * schemas cover entities, items, blocks, biomes, spawn rules and the
 * crafting catalog; the structural checks cover the rest and report unknown
 * keys, which the schemas leave open.
 */
let cachedValidator: DefinitionValidator | undefined;
const validator = (): DefinitionValidator =>
    (cachedValidator ??= composeValidators(
        structuralValidator,
        bedrockSchemaValidator(readBedrockSchemas(samplesCheckout()))
    ));

/**
 * The BDS `behavior_packs` folder. It holds chemistry, the editor and the
 * experimental packs beside the vanilla layers, which a world only composes
 * when it turns them on, so the source below names the vanilla pack's header
 * UUID and the loader keeps that pack's layers alone.
 */
const bdsBehaviorPacks = (): string => {
    const root = join(cacheRoot, 'bds');
    const version = readdirSync(root).find((name) => existsSync(join(root, name, 'unpacked', 'behavior_packs')));
    if (!version) throw new Error(`no unpacked BDS under ${root}; run the bedrock-data fetch:sources script`);

    return join(root, version, 'unpacked', 'behavior_packs');
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

describe.skipIf(!enabled)('the vanilla Bedrock behavior pack', { tags: ['real-data'] }, () => {
    it('is the one pack in the BDS folder that declares the vanilla header UUID', () => {
        // The criterion the default stack selects by, checked against the
        // shipped folder: if a release ever renames the vanilla pack's
        // identity, or gives a second pack the same one, this fails here
        // rather than silently composing the wrong content.
        const root = bdsBehaviorPacks();
        const byUuid = new Map<string, string[]>();
        for (const folder of readdirSync(root)) {
            const manifest = join(root, folder, 'manifest.json');
            if (!existsSync(manifest)) continue;
            const uuid = parseManifest(parseLenientJson(readFileSync(manifest, 'utf8')), folder).manifest?.header.uuid;
            if (uuid !== undefined) byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), folder]);
        }

        const vanilla = byUuid.get(VANILLA_BEHAVIOR_PACK_UUID);
        expect(vanilla?.every((folder) => folder === 'vanilla' || folder.startsWith('vanilla_'))).toBe(true);
        expect(vanilla?.length).toBeGreaterThan(1);
        expect(readdirSync(root).filter((folder) => folder.startsWith('vanilla'))).toEqual(vanilla);
    });

    it('loads every bedrock-samples registry with no error', { timeout: 60_000 }, () => {
        const { definitions, diagnostics } = load(
            [{ kind: 'directory', path: join(samplesCheckout(), 'behavior_pack') }],
            { validator: validator() }
        );

        expect(errorsOf(diagnostics)).toEqual([]);
        expect(diagnostics.filter((diagnostic) => diagnostic.code.startsWith('definition.schema'))).toEqual([]);
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
        const { definitions, diagnostics } = load(
            [{ kind: 'brarchiveLayers', path: bdsBehaviorPacks(), uuids: [VANILLA_BEHAVIOR_PACK_UUID] }],
            { strict: true, validator: validator() }
        );

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
                message: 'description must be an object; a later pack supersedes this file',
                // Both layers call themselves `vanilla`, so the pair collapses.
                occurrences: 2
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

    it('reports a corrupted copy of a real vanilla entity against the schema', () => {
        // The two tests above pass if the schema layer silently checks
        // nothing, so this one proves the schemas are loaded and biting:
        // a real file, one field changed, checked on its own.
        const path = join(samplesCheckout(), 'behavior_pack', 'entities', 'creeper.json');
        const creeper = parseLenientJson(readFileSync(path, 'utf8'));
        const wrapper = (creeper as Record<string, Record<string, Record<string, unknown>>>)['minecraft:entity']!;
        wrapper.components = { ...wrapper.components, 'minecraft:behavior.melee_attack': { priority: 'highest' } };

        expect(validator()({ registry: 'entities', path: 'entities/creeper.json', data: creeper })).toContainEqual({
            severity: 'error',
            code: 'definition.schema',
            message: '/minecraft:entity/components/minecraft:behavior.melee_attack/priority must be integer'
        });
    });
});
