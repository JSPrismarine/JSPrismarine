import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ConfiguredFeature, FeatureTypeName } from './features/Feature';
import { FEATURE_TYPES, walkFeatures } from './features/Feature';
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

describe.skipIf(!enabled || root === undefined)('the vanilla feature corpus', () => {
    it('reads all 240 configured features with no errors', () => {
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
        expect(featureSources.size).toBe(240);
    });

    it('reads all 273 placed features with no errors', () => {
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
        expect(placedSources.size).toBe(273);
    });

    it('reports which of the 58 feature types the corpus uses', () => {
        const { featureSources, loader } = corpus();
        const usage = new Map<FeatureTypeName, number>();
        const roots: ConfiguredFeature[] = [];
        for (const id of featureSources.keys()) roots.push(loader.feature(id));
        for (const root of roots) usage.set(root.type, (usage.get(root.type) ?? 0) + 1);

        const reachable = new Set<string>();
        for (const root of roots) for (const node of walkFeatures(root)) reachable.add(node.type);

        const ranked = [...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        process.stdout.write(
            `feature types: ${usage.size} of ${FEATURE_TYPES.length} used at the top level, ` +
                `${reachable.size} reachable including nested features\n` +
                `${ranked.map(([type, count]) => `  ${String(count).padStart(3)} ${type}`).join('\n')}\n`
        );

        expect(usage.size).toBe(47);
        expect(FEATURE_TYPES).toHaveLength(58);
    });

    it('reports which of the nested registries the corpus uses', () => {
        const { featureSources, placedSources, providerSources } = corpus();
        const registries: Record<string, readonly string[]> = {
            block_state_provider_type: [
                'copy_properties',
                'dual_noise',
                'noise',
                'noise_threshold',
                'random_block',
                'randomized_int',
                'rotated',
                'rule_based',
                'simple',
                'weighted'
            ],
            block_predicate_type: [
                'all_of',
                'any_of',
                'has_sturdy_face',
                'height_range',
                'inside_world_bounds',
                'matching_biomes',
                'matching_block_tag',
                'matching_blocks',
                'matching_fluids',
                'not',
                'replaceable',
                'solid',
                'true',
                'unobstructed',
                'volume_match',
                'would_survive'
            ],
            rule_test: [
                'all_of',
                'always_true',
                'any_of',
                'block_match',
                'blockstate_match',
                'height_match',
                'not',
                'random_block_match',
                'random_blockstate_match',
                'tag_match'
            ],
            trunk_placer_type: [
                'bending_trunk_placer',
                'cherry_trunk_placer',
                'dark_oak_trunk_placer',
                'fancy_trunk_placer',
                'forking_trunk_placer',
                'giant_trunk_placer',
                'mega_jungle_trunk_placer',
                'poplar_trunk_placer',
                'straight_trunk_placer',
                'upwards_branching_trunk_placer'
            ],
            foliage_placer_type: [
                'acacia_foliage_placer',
                'blob_foliage_placer',
                'bush_foliage_placer',
                'cherry_foliage_placer',
                'dark_oak_foliage_placer',
                'fancy_foliage_placer',
                'jungle_foliage_placer',
                'mega_pine_foliage_placer',
                'pine_foliage_placer',
                'poplar_foliage_placer',
                'random_spread_foliage_placer',
                'spruce_foliage_placer'
            ],
            tree_decorator_type: [
                'alter_ground',
                'attached_to_leaves',
                'attached_to_logs',
                'beehive',
                'cocoa',
                'creaking_heart',
                'leave_vine',
                'pale_moss',
                'place_on_ground',
                'shelf_mushroom',
                'trunk_vine'
            ]
        };

        // Every `type`, `predicate_type` and `processor_type` value anywhere in the documents.
        const named = new Set<string>();
        const walk = (node: unknown): void => {
            if (Array.isArray(node)) {
                for (const entry of node) walk(entry);
                return;
            }
            if (typeof node !== 'object' || node === null) return;
            const record: Record<string, unknown> = node as Record<string, unknown>;
            for (const key of ['type', 'predicate_type', 'processor_type']) {
                const value = record[key];
                if (typeof value === 'string') named.add(value.replace('minecraft:', ''));
            }
            for (const value of Object.values(record)) walk(value);
        };
        for (const document of [...featureSources.values(), ...placedSources.values(), ...providerSources.values()]) {
            walk(document);
        }

        const lines = Object.entries(registries).map(([registry, names]) => {
            const used = names.filter((name) => named.has(name));
            return `  ${registry}: ${used.length} of ${names.length} named explicitly`;
        });
        process.stdout.write(`nested registries\n${lines.join('\n')}\n`);

        // `simple` and `constant` never appear with an explicit type, because a bare block state
        // and a bare number are their shorthand forms.
        expect(registries['block_state_provider_type']?.filter((name) => named.has(name))).toHaveLength(8);
        expect(registries['block_predicate_type']?.filter((name) => named.has(name))).toHaveLength(14);
        expect(registries['rule_test']?.filter((name) => named.has(name))).toHaveLength(7);
        expect(registries['trunk_placer_type']?.filter((name) => named.has(name))).toHaveLength(10);
        expect(registries['foliage_placer_type']?.filter((name) => named.has(name))).toHaveLength(12);
        expect(registries['tree_decorator_type']?.filter((name) => named.has(name))).toHaveLength(11);
    });

    it('reports which of the 18 placement modifier types the corpus uses', () => {
        const { placedSources, loader } = corpus();
        const usage = new Map<PlacementModifierTypeName, number>();
        for (const id of placedSources.keys()) {
            for (const modifier of loader.placedFeatureById(id).placement) {
                usage.set(modifier.type, (usage.get(modifier.type) ?? 0) + 1);
            }
        }
        const ranked = [...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        process.stdout.write(
            `placement modifiers: ${usage.size} of 18 used\n` +
                `${ranked.map(([type, count]) => `  ${String(count).padStart(3)} ${type}`).join('\n')}\n`
        );
        expect(usage.size).toBe(15);
    });
});
