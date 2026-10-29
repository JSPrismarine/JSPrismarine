import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import type { ConfiguredFeature, FeatureTypeName } from './features/Feature';
import { walkFeatures } from './features/Feature';
import { FeatureLoader } from './features/parse';
import type { PlacementModifierTypeName } from './placement/modifiers';

/**
 * Reads every `worldgen/feature` and `worldgen/placed_feature` document Mojang ships and checks
 * that all of them parse, then reports which types they use.
 *
 * It needs the vanilla datapack on disk, so it is gated:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * JSP_FEATURE_CORPUS=1 pnpm --filter @jsprismarine/features exec vitest run corpus
 * ```
 *
 * `JSP_VANILLA_DATAPACK` points at a local copy instead. Everything it reads is extracted game
 * data and therefore untrusted: it is parsed with `JSON.parse` and never executed.
 */

/** The `worldgen` directory of a datapack root, or undefined when the root holds no features. */
const worldgenIn = (datapack: string): string | undefined => {
    const worldgen = join(datapack, 'data', 'minecraft', 'worldgen');
    return existsSync(join(worldgen, 'feature')) ? worldgen : undefined;
};

/**
 * The nearest existing `node_modules/.cache/jsprismarine` at or above this file.
 *
 * Walked from the file rather than the working directory so the test finds the cache whether
 * Vitest was started in this package or at the repository root.
 */
const cacheRoot = (): string | undefined => {
    let directory = fileURLToPath(new URL('.', import.meta.url));
    for (;;) {
        const candidate = join(directory, 'node_modules', '.cache', 'jsprismarine');
        if (existsSync(candidate)) return candidate;

        const parent = dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
    }
};

/**
 * The fetched datapack's `worldgen` directory.
 *
 * The version directory is whichever one the fetch wrote, newest first, rather than a number
 * written down here that goes stale the next time `sources.json` moves.
 */
const datapackRoot = (): string | undefined => {
    const override = process.env['JSP_VANILLA_DATAPACK'];
    if (override !== undefined && override !== '') return worldgenIn(override);

    const cache = cacheRoot();
    const datapacks = cache === undefined ? undefined : join(cache, 'vanilla-datapack');
    if (datapacks === undefined || !existsSync(datapacks)) return undefined;

    for (const version of readdirSync(datapacks).sort().reverse()) {
        const worldgen = worldgenIn(join(datapacks, version));
        if (worldgen !== undefined) return worldgen;
    }

    return undefined;
};

const listJson = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...listJson(full));
        else if (entry.name.endsWith('.json')) found.push(full);
    }
    return found.sort();
};

const identifierFor = (root: string, path: string): string =>
    `minecraft:${relative(root, path)
        .replaceAll(sep, '/')
        .replace(/\.json$/, '')}`;

/** The documents the tests below share. */
interface Corpus {
    readonly featureSources: ReadonlyMap<string, unknown>;
    readonly placedSources: ReadonlyMap<string, unknown>;
    readonly providerSources: ReadonlyMap<string, unknown>;
    readonly loader: FeatureLoader;
}

const root = datapackRoot();
const enabled = process.env['JSP_FEATURE_CORPUS'] === '1';

let loaded: Corpus | undefined;

/**
 * Reads the corpus once, on first use.
 *
 * Lazily rather than in the suite body because `describe.skipIf` skips the tests it collects and
 * still runs the callback that declares them. Reading there would make a checkout with no
 * datapack fail at collection instead of skipping.
 */
const corpus = (): Corpus => {
    if (loaded !== undefined) return loaded;
    if (root === undefined) throw new Error('the vanilla datapack is not on disk');

    const worldgen = root;
    // Extracted game files are untrusted data: parsed, never executed.
    const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
    const registry = (name: string): Map<string, unknown> => {
        const directory = join(worldgen, name);
        return new Map(listJson(directory).map((path) => [identifierFor(directory, path), read(path)]));
    };

    const featureSources = registry('feature');
    const placedSources = registry('placed_feature');
    const providerSources = registry('block_state_provider');

    loaded = {
        featureSources,
        placedSources,
        providerSources,
        loader: new FeatureLoader({
            feature: (id) => featureSources.get(id),
            placedFeature: (id) => placedSources.get(id),
            blockStateProvider: (id) => providerSources.get(id)
        })
    };

    return loaded;
};

describe.skipIf(!enabled || root === undefined)('the vanilla feature corpus', { tags: ['real-data'] }, () => {
    it('reads every configured feature without errors', () => {
        const { featureSources, loader } = corpus();
        const failures: string[] = [];
        for (const id of featureSources.keys()) {
            try {
                loader.feature(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        reportProgress(`${featureSources.size} configured features were parsed.`);
    });

    it('reads every placed feature without errors', () => {
        const { placedSources, loader } = corpus();
        const failures: string[] = [];
        for (const id of placedSources.keys()) {
            try {
                loader.placedFeatureById(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        reportProgress(`${placedSources.size} placed features were parsed.`);
    });

    it('reports the feature types used by the corpus', () => {
        const { featureSources, loader } = corpus();
        const usage = new Map<FeatureTypeName, number>();
        const roots: ConfiguredFeature[] = [];
        for (const id of featureSources.keys()) roots.push(loader.feature(id));
        for (const root of roots) usage.set(root.type, (usage.get(root.type) ?? 0) + 1);

        const reachable = new Set<string>();
        for (const root of roots) for (const node of walkFeatures(root)) reachable.add(node.type);

        reportProgress(
            `${usage.size} feature types appear at the top level; ${reachable.size} are reachable including nested features.`
        );
    });

    it('parses each declared block state provider', () => {
        const { providerSources, loader } = corpus();
        const failures: string[] = [];

        for (const id of providerSources.keys()) {
            try {
                loader.provider(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        expect(failures).toEqual([]);
        reportProgress(`${providerSources.size} declared block state providers were parsed.`);
    });

    it('reports the placement modifiers used by the corpus', () => {
        const { placedSources, loader } = corpus();
        const usage = new Map<PlacementModifierTypeName, number>();
        for (const id of placedSources.keys()) {
            for (const modifier of loader.placedFeatureById(id).placement) {
                usage.set(modifier.type, (usage.get(modifier.type) ?? 0) + 1);
            }
        }
        reportProgress(`${usage.size} placement modifier types are used by the corpus.`);
    });
});
