import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { reportIdentifiers } from './identifiers';
import { load } from './load';
import { readZip } from './zip';

/**
 * Loads the real 26.3 vanilla datapack out of the fetched Java server jar and
 * checks the counts against the research notes. Needs the cache that
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

describe.skipIf(!enabled)('the vanilla 26.3 datapack', () => {
    it('loads with the counts from the research notes', { timeout: 120_000 }, () => {
        const { definitions, diagnostics } = load([{ kind: 'datapack', path: extractVanillaDatapack() }]);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        expect(definitions.lootTablesJava.size).toBe(1447);
        expect(definitions.recipesJava.size).toBe(2042);
        expect(definitions.advancements.size).toBe(1866);
        expect(definitions.tags.size).toBe(883);
        expect(definitions.enchantments.size).toBe(43);
        expect(definitions.damageTypes.size).toBe(51);
        expect(definitions.predicates.size).toBe(3);

        const report = reportIdentifiers(definitions);
        expect(report.length).toBeGreaterThan(1000);
        expect(report.every((entry) => entry.resolution === 'unknown')).toBe(true);
        expect(report.some((entry) => entry.registry === 'item' && entry.id === 'minecraft:diamond')).toBe(true);
    });
});
