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
 * Extracts the vanilla datapack JSON out of the bundler jar's inner server jar
 * into the cache, once, and writes the pack.mcmeta the jar itself does not
 * carry. Returns the datapack directory.
 */
const extractVanillaDatapack = (): string => {
    const jarRoot = join(cacheRoot, 'java-server');
    const version = readdirSync(jarRoot).find((name) => existsSync(join(jarRoot, name, 'server.jar')));
    if (!version) throw new Error(`no server.jar under ${jarRoot}; run the bedrock-data fetch:sources script`);

    const target = join(cacheRoot, 'vanilla-datapack', version);
    const mcmetaPath = join(target, 'pack.mcmeta');
    if (existsSync(mcmetaPath)) return target;

    const outer = readZip(readFileSync(join(jarRoot, version, 'server.jar')));
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
