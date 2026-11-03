/**
 * Bounded user-land startup snapshot experiment over the real content builder's fixtures.
 *
 * The snapshot stores composed input definitions and seed-zero digests. A restored process
 * always builds fresh runtime registries for its seed and world, so the cached loot registry or
 * world views are never shared between runs. This measures input restoration and late binding;
 * it does not claim that sharing the live `ServerContent` object is safe.
 */
import { performance } from 'node:perf_hooks';
import { startupSnapshot } from 'node:v8';

import type { Definitions } from '@jsprismarine/packs';

import { definitionOf } from '../src/content/ContentOptions';
import { buildServerContent } from '../src/content/ServerContent';
import {
    fixtureBlockPalette,
    fixtureContentOptions,
    fixtureDefinitions,
    fixtureItemDefinitions
} from '../src/content/testing';

const SNAPSHOT_SCHEMA = 1;

interface SnapshotManifest {
    readonly schema: number;
    readonly nodeVersion: string;
    readonly v8Version: string;
    readonly definitionsFingerprint: string;
    readonly seedZeroStaticDigest: string;
    readonly seedZeroContentDigest: string;
    readonly buildMs: number;
    readonly activeResources: readonly string[];
    readonly forbiddenResources: readonly string[];
}

/** Fingerprints input maps in registry and pack order so a changed file invalidates the cache. */
const definitionsFingerprint = (definitions: Definitions): string => {
    const normalized = Object.fromEntries(
        Object.entries(definitions)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([registry, entries]) => [
                registry,
                [...entries.entries()].map(([identifier, definition]) => [
                    identifier,
                    definition.pack,
                    definition.path,
                    definition.data
                ])
            ])
    );
    return JSON.stringify(normalized);
};

/** A deterministic digest for the public registry values exercised by the prototype. */
const contentDigest = (content: ReturnType<typeof buildServerContent>, includeLoot: boolean): string => {
    const stoneRuntimeId = content.blocks.palette.runtimeId('minecraft:stone');
    const pickaxeId = content.items.registry.idOf('minecraft:diamond_pickaxe');
    const summary = {
        blocks: {
            types: [...content.blocks.types],
            states: content.blocks.states.map((state) => ({
                identifier: state.type.identifier,
                index: state.index,
                runtimeId: state.runtimeId,
                values: state.values,
                permutations: state.permutations,
                tags: state.tags,
                javaTags: state.javaTags
            })),
            table: content.blocks.table
        },
        items: {
            registry: [...content.items.registry],
            tags: content.items.tags,
            facts: content.items.facts
        },
        entities: {
            registry: [...content.entities.registry],
            components: content.entities.components
        },
        recipes: { recipes: content.recipes.recipes, netIds: content.recipes.netIds },
        lootTables: content.loot.ids,
        enchantments: content.enchantments,
        advancements: content.advancements,
        spawnRules: content.spawnRules,
        tradeTables: [...content.tradeTables],
        biomes: [...content.biomes],
        features: [...content.features],
        featureRules: [...content.featureRules],
        structures: [...content.structures],
        tags: content.tags,
        diagnostics: content.diagnostics,
        stoneHardness: content.blocks.table.hardness[stoneRuntimeId],
        pickaxeMaxDamage: pickaxeId === undefined ? undefined : content.items.facts.maxDamage[pickaxeId],
        loot: includeLoot
            ? Array.from({ length: 24 }, () =>
                  content.loot.roll('prototype:seeded').map((stack) => [stack.id, stack.count])
              )
            : undefined
    };
    return hash(JSON.stringify(stableData(summary)) ?? '');
};

/** Converts registry objects into deterministic JSON data without invoking their methods. */
const stableData = (value: unknown, ancestors = new WeakSet<object>()): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return '[function]';
    if (typeof value !== 'object') return String(value);
    if (ancestors.has(value)) return `[cycle:${value.constructor.name}]`;

    ancestors.add(value);
    let normalized: unknown;
    if (Array.isArray(value)) {
        normalized = value.map((entry) => stableData(entry, ancestors));
    } else if (value instanceof Map) {
        normalized = {
            type: 'Map',
            entries: [...value].map(([key, entry]) => [stableData(key, ancestors), stableData(entry, ancestors)])
        };
    } else if (value instanceof Set) {
        normalized = { type: 'Set', entries: [...value].map((entry) => stableData(entry, ancestors)) };
    } else {
        const type = Object.getPrototypeOf(value)?.constructor?.name ?? 'Object';
        const fields = Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => {
                    const descriptor = Object.getOwnPropertyDescriptor(value, key);
                    return [
                        key,
                        descriptor !== undefined && 'value' in descriptor
                            ? stableData(descriptor.value, ancestors)
                            : '[accessor]'
                    ];
                })
        );
        normalized = { type, fields };
    }
    ancestors.delete(value);
    return normalized;
};

/** Produces a stable 64-bit digest without loading a native hashing module into the snapshot. */
const hash = (value: string): string => {
    let result = 14_695_981_039_346_656_037n;
    for (let index = 0; index < value.length; index++) {
        result = BigInt.asUintN(64, (result ^ BigInt(value.charCodeAt(index))) * 1_099_511_628_211n);
    }
    return result.toString(16).padStart(16, '0');
};

/** Adds one input definition to represent a custom pack or an edited vanilla file. */
const withCustomPack = (definitions: Definitions): Definitions => {
    const biomes = new Map(definitions.biomes);
    biomes.set(
        'prototype:custom',
        definitionOf(
            'biomes',
            'prototype:custom',
            {
                format_version: '1.13.0',
                'minecraft:biome': { description: { identifier: 'prototype:custom' }, components: {} }
            },
            'custom-pack'
        )
    );
    return { ...definitions, biomes };
};

/** Builds the public content graph from one input snapshot and binds fresh seed and world views. */
const buildContent = (definitions: Definitions, seed: bigint): ReturnType<typeof buildServerContent> =>
    buildServerContent(
        fixtureContentOptions({
            seed,
            load: () => ({ definitions, diagnostics: [] }),
            blockPalette: fixtureBlockPalette(),
            itemDefinitions: fixtureItemDefinitions()
        })
    );

/** Adds a seeded loot table so the experiment can detect a seed leaking through restoration. */
const withSeededLoot = (definitions: Definitions): Definitions => {
    const lootTablesJava = new Map(definitions.lootTablesJava);
    lootTablesJava.set(
        'prototype:seeded',
        definitionOf(
            'lootTablesJava',
            'prototype:seeded',
            {
                type: 'minecraft:chest',
                random_sequence: 'prototype:seeded',
                pools: [
                    {
                        rolls: 1,
                        entries: [
                            { type: 'minecraft:item', name: 'minecraft:stone', weight: 1 },
                            { type: 'minecraft:item', name: 'minecraft:redstone_lamp', weight: 1 }
                        ]
                    }
                ]
            },
            'snapshot-fixture'
        )
    );
    return { ...definitions, lootTablesJava };
};

const snapshotDefinitions = withSeededLoot(fixtureDefinitions());

const createSnapshotManifest = (): SnapshotManifest => {
    const startedAt = performance.now();
    const seedZeroContent = buildContent(snapshotDefinitions, 0n);
    const activeResources = process.getActiveResourcesInfo();
    // PipeWrap is the benchmark process's stdout/stderr; every other active resource is unexpected.
    const forbiddenResources = activeResources.filter((resource) => resource !== 'PipeWrap');
    return {
        schema: SNAPSHOT_SCHEMA,
        nodeVersion: process.versions.node,
        v8Version: process.versions.v8,
        definitionsFingerprint: definitionsFingerprint(snapshotDefinitions),
        seedZeroStaticDigest: contentDigest(seedZeroContent, false),
        seedZeroContentDigest: contentDigest(seedZeroContent, true),
        buildMs: performance.now() - startedAt,
        activeResources,
        forbiddenResources
    };
};

if (startupSnapshot.isBuildingSnapshot()) {
    const manifest = createSnapshotManifest();
    startupSnapshot.setDeserializeMainFunction(() => {
        const nodeStartedAtMs = process.uptime() * 1000;
        const seed = BigInt(process.env.JSP_CONTENT_SNAPSHOT_SEED ?? '0');
        const currentDefinitions =
            process.env.JSP_CONTENT_SNAPSHOT_CUSTOM === '1' ? withCustomPack(snapshotDefinitions) : snapshotDefinitions;
        const matches =
            manifest.schema === SNAPSHOT_SCHEMA &&
            manifest.nodeVersion === process.versions.node &&
            manifest.v8Version === process.versions.v8 &&
            manifest.definitionsFingerprint === definitionsFingerprint(currentDefinitions);
        const definitions = matches ? snapshotDefinitions : currentDefinitions;
        const lateBoundStartedAt = performance.now();
        const restored = buildContent(definitions, seed);
        const lateBoundBuildMs = performance.now() - lateBoundStartedAt;
        const fresh = buildContent(currentDefinitions, seed);
        const restoredStaticDigest = contentDigest(restored, false);
        const restoredContentDigest = contentDigest(restored, true);
        const freshStaticDigest = contentDigest(fresh, false);
        const freshContentDigest = contentDigest(fresh, true);
        const sameStaticDigest = restoredStaticDigest === freshStaticDigest;
        const sameContentDigest = restoredContentDigest === freshContentDigest;
        const snapshotSeedZeroMatches =
            seed !== 0n || !matches || restoredContentDigest === manifest.seedZeroContentDigest;
        const result = {
            mode: 'snapshot-restore',
            seed: seed.toString(),
            cacheHit: matches,
            snapshotRestoreToCallbackMs: nodeStartedAtMs,
            lateBoundBuildMs,
            cachedSeedZeroStaticDigest: manifest.seedZeroStaticDigest,
            cachedSeedZeroContentDigest: manifest.seedZeroContentDigest,
            restoredStaticDigest,
            restoredContentDigest,
            contentDigest: restoredContentDigest,
            sameStaticDigest,
            sameContentDigest,
            snapshotSeedZeroMatches,
            snapshotBuildMs: manifest.buildMs,
            snapshotGenerationActiveResources: manifest.activeResources,
            snapshotGenerationOpenedNoHandlesOrWorkers: manifest.forbiddenResources.length === 0
        };
        process.stdout.write(`${JSON.stringify(result)}\n`);
        if (!sameStaticDigest || !sameContentDigest || !snapshotSeedZeroMatches) process.exitCode = 1;
    });
} else {
    const seed = BigInt(process.env.JSP_CONTENT_SNAPSHOT_SEED ?? '0');
    const definitions =
        process.env.JSP_CONTENT_SNAPSHOT_CUSTOM === '1' ? withCustomPack(snapshotDefinitions) : snapshotDefinitions;
    const startedAt = performance.now();
    const content = buildContent(definitions, seed);
    process.stdout.write(
        `${JSON.stringify({
            mode: 'fresh-build',
            seed: seed.toString(),
            processStartupMs: process.uptime() * 1000,
            contentBuildMs: performance.now() - startedAt,
            staticDigest: contentDigest(content, false),
            contentDigest: contentDigest(content, true)
        })}\n`
    );
}
