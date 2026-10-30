import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { reportIdentifiers } from './identifiers';
import { load } from './load';
import { createMcdocValidator } from './mcdocValidator';
import { composeValidators, structuralValidator } from './validation';
import { readZip } from './zip';

/**
 * Loads the real 26.3 vanilla datapack out of the fetched Java server jar and
 * reports its current inventory. Needs the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so
 * it only runs with JSP_VANILLA_DATAPACK set.
 */

const enabled = !!process.env.JSP_VANILLA_DATAPACK;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/**
 * Finds the cached Java server jar. `fetch:sources` writes it to
 * `java-server/<version>/`, and the Java dump and oracle scripts download
 * their own copy to `java/<version>/`, so a checkout can hold either or both.
 * The fetched one comes first because its hash is verified.
 */
const findServerJar = (): { readonly version: string; readonly path: string } => {
    for (const source of ['java-server', 'java']) {
        const root = join(cacheRoot, source);
        if (!existsSync(root)) continue;
        const version = readdirSync(root).find((name) => existsSync(join(root, name, 'server.jar')));
        if (version) return { version, path: join(root, version, 'server.jar') };
    }
    throw new Error(`no server.jar under ${cacheRoot}; run the bedrock-data fetch:sources script`);
};

/**
 * Extracts the vanilla datapack JSON out of the bundler jar's inner server jar
 * into the cache, once, and writes the pack.mcmeta the jar itself does not
 * carry. Returns the datapack directory.
 */
const extractVanillaDatapack = (): string => {
    const jar = findServerJar();

    const target = join(cacheRoot, 'vanilla-datapack', jar.version);
    const mcmetaPath = join(target, 'pack.mcmeta');
    if (existsSync(mcmetaPath)) return target;

    const outer = readZip(readFileSync(jar.path));
    const innerName = [...outer.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (!innerName) throw new Error('the server jar has no META-INF/versions inner jar');

    for (const [name, bytes] of readZip(outer.get(innerName)!)) {
        if (!name.startsWith('data/') || !name.endsWith('.json') || !isSafePath(name)) continue;
        const absolute = join(target, ...name.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, bytes);
    }

    writeFileSync(
        mcmetaPath,
        JSON.stringify({ pack: { description: 'vanilla 26.3', min_format: [121, 0], max_format: [121, 0] } })
    );
    return target;
};

/** The `vanilla-mcdoc` checkout, whose folder name carries a commit hash. */
const mcdocCheckout = (): string => {
    const root = join(cacheRoot, 'vanilla-mcdoc');
    for (const commit of readdirSync(root)) {
        const unpacked = join(root, commit, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            if (existsSync(join(unpacked, checkout, 'java'))) return join(unpacked, checkout);
        }
    }
    throw new Error(`no vanilla-mcdoc checkout under ${root}; run the bedrock-data fetch:sources script`);
};

describe.skipIf(!enabled)('the vanilla 26.3 datapack', { tags: ['real-data'] }, () => {
    it('loads the datapack and resolves its references', { timeout: 120_000 }, () => {
        const { definitions, diagnostics } = load([{ kind: 'datapack', path: extractVanillaDatapack() }]);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        expect(definitions.lootTablesJava.size).toBeGreaterThan(0);
        expect(definitions.recipesJava.size).toBeGreaterThan(0);
        expect(definitions.advancements.size).toBeGreaterThan(0);
        expect(definitions.tags.size).toBeGreaterThan(0);
        expect(definitions.enchantments.size).toBeGreaterThan(0);
        expect(definitions.damageTypes.size).toBeGreaterThan(0);
        expect(definitions.predicates.size).toBeGreaterThan(0);
        expect(definitions.dimensionTypes.has('minecraft:the_nether')).toBe(true);
        expect(definitions.worldgen.has('world_preset/minecraft:normal')).toBe(true);
        expect(definitions.worldgen.has('noise_settings/minecraft:overworld')).toBe(true);
        // Vanilla ships its stems only inside the presets.
        expect(definitions.dimensions.size).toBe(0);

        const worldPresets = [...definitions.worldgen.keys()].filter((id) => id.startsWith('world_preset/'));

        // The report with no resolver is what this package can answer alone:
        // the references the stack closes itself, and the rest left for the
        // Bedrock side. Whether those reach Bedrock is `@jsprismarine/mapping`'s
        // question, and src/vanillaIdentifiers.test.ts there is where Phase 0's
        // exit criterion is measured.
        const report = reportIdentifiers(definitions);
        expect(report.length).toBeGreaterThan(0);
        expect(report.some((entry) => entry.registry === 'item' && entry.id === 'minecraft:diamond')).toBe(true);

        // 43 more than the mapping resolver closes, because the datapack
        // defines its own enchantments: with a resolver that knows them they
        // answer against Bedrock, and with none they answer here.
        const closed = report.filter((entry) => entry.resolution === 'known');
        expect(closed.every((entry) => entry.source === 'pack')).toBe(true);
        expect(
            report.filter((entry) => entry.resolution === 'unknown').every((entry) => entry.source === 'resolver')
        ).toBe(true);
        reportProgress(
            [
                `${definitions.lootTablesJava.size} loot tables`,
                `${definitions.recipesJava.size} recipes`,
                `${definitions.advancements.size} advancements`,
                `${definitions.tags.size} tags`,
                `${definitions.enchantments.size} enchantments`,
                `${definitions.damageTypes.size} damage types`,
                `${definitions.predicates.size} predicates`,
                `${definitions.dimensionTypes.size} dimension types`,
                `${worldPresets.length} world presets`,
                `${definitions.worldgen.size} worldgen definitions`,
                `${report.length} identifier references`,
                `${closed.length} references closed by the pack`
            ].join('; ')
        );
    });

    it('validates every definition against vanilla-mcdoc', { timeout: 600_000 }, async () => {
        // Vanilla-mcdoc reports this malformed result as a warning, so the
        // parser should keep the recipe available after validation.
        const validator = composeValidators(structuralValidator, await createMcdocValidator({ root: mcdocCheckout() }));
        const { definitions, diagnostics } = load([{ kind: 'datapack', path: extractVanillaDatapack() }], {
            validator
        });

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        expect(diagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                code: 'definition.schema',
                path: 'data/minecraft/recipe/map_extending.json',
                message: expect.stringContaining('/result Missing key')
            })
        ]);
        expect(definitions.recipesJava.has('minecraft:map_extending')).toBe(true);
        expect(definitions.lootTablesJava.has('minecraft:blocks/stone')).toBe(true);
    });

    it('names the file, the field and the reason for a corrupted definition', { timeout: 600_000 }, async () => {
        // The run above passes if the checker silently checks nothing, so
        // this one plants two faults in a real vanilla loot table: a value
        // outside the allowed set, and a key the schema does not know.
        const mcdoc = await createMcdocValidator({ root: mcdocCheckout() });
        const path = 'data/minecraft/loot_table/blocks/stone.json';
        // Vanilla data is parsed JSON, which the compiler cannot see the
        // shape of; the two fields touched below are asserted on.
        const stone: { type: string; pools: { entries: Record<string, unknown>[] }[] } = JSON.parse(
            readFileSync(join(extractVanillaDatapack(), ...path.split('/')), 'utf8')
        );
        stone.type = 'minecraft:blok';
        stone.pools[0]!.entries[0]!.quantity = 3;

        expect(mcdoc({ registry: 'lootTablesJava', path, data: stone })).toEqual([
            {
                severity: 'warning',
                code: 'definition.schema',
                message: expect.stringMatching(/^\/type Expected .*block/u)
            },
            {
                severity: 'warning',
                code: 'definition.schema',
                message: expect.stringContaining('/pools/0/entries/0/quantity Unknown key')
            }
        ]);
    });
});
