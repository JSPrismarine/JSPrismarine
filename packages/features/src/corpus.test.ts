import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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

const datapackRoot = (): string | undefined => {
    const override = process.env['JSP_VANILLA_DATAPACK'];
    const candidates = [
        ...(override === undefined ? [] : [override]),
        join(process.cwd(), '../../node_modules/.cache/jsprismarine/vanilla-datapack/26.3')
    ];
    for (const candidate of candidates) {
        try {
            const worldgen = join(candidate, 'data/minecraft/worldgen');
            if (statSync(worldgen).isDirectory()) return worldgen;
        } catch {
            // Not this one; try the next candidate.
        }
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

const root = datapackRoot();
const enabled = process.env['JSP_FEATURE_CORPUS'] === '1';

describe.skipIf(!enabled || root === undefined)('the vanilla feature corpus', () => {
    const worldgen = root ?? '';
    const featureFiles = listJson(join(worldgen, 'feature'));
    const placedFiles = listJson(join(worldgen, 'placed_feature'));

    // Extracted game files are untrusted data: parsed, never executed.
    const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
    const featureSources = new Map(
        featureFiles.map((path) => [identifierFor(join(worldgen, 'feature'), path), read(path)])
    );
    const placedSources = new Map(
        placedFiles.map((path) => [identifierFor(join(worldgen, 'placed_feature'), path), read(path)])
    );

    const providerFiles = listJson(join(worldgen, 'block_state_provider'));
    const providerSources = new Map(
        providerFiles.map((path) => [identifierFor(join(worldgen, 'block_state_provider'), path), read(path)])
    );

    const loader = new FeatureLoader({
        feature: (id) => featureSources.get(id),
        placedFeature: (id) => placedSources.get(id),
        blockStateProvider: (id) => providerSources.get(id)
    });

    it('reads all 240 configured features with no errors', () => {
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

    it('reports which of the 18 placement modifier types the corpus uses', () => {
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
