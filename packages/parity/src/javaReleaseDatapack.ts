import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { parseAdvancement } from '@jsprismarine/advancements';
import { readGeneratedJavaVersion } from '@jsprismarine/bedrock-data/sources';
import { FeatureLoader } from '@jsprismarine/features';
import type { Definitions } from '@jsprismarine/packs';
import { load, PackLoadError, routeDatapackPath } from '@jsprismarine/packs';
import type { JavaDataTarget } from '@jsprismarine/packs/javaDataTarget';
import { buildContentTags, contentResolver } from '@jsprismarine/prismarine/content/tags';
import { loadRecipes } from '@jsprismarine/recipes';
import { parseDensityFunction } from '@jsprismarine/worldgen';

import type { BehaviorScenario, ScenarioGroup } from './behaviorScenarios.ts';
import { scenarioGroup } from './behaviorScenarios.ts';
import { isRecord } from './isRecord.ts';
import type { ReferenceSource } from './references.ts';
import { FETCH_CACHE } from './references.ts';

/**
 * One pinned Java release's vanilla datapack, read through the public loader with the release's
 * own target and checked against the release's own data generator reports.
 *
 * Each `datapack.<release>` family runs these scenarios for its release, so the dashboard shows
 * the default release and the preview side by side. The datapack and the reports are what
 * `pnpm --filter @jsprismarine/bedrock-data run datagen:java --java <release>` writes into the
 * fetch cache; both are extracted game data, parsed and never executed.
 */

/** Where `datagen:java` writes one release's datapack and reports. */
const releasePaths = (release: string): { readonly datapack: string; readonly reports: string } => ({
    datapack: join(FETCH_CACHE, 'vanilla-datapack', release),
    reports: join(FETCH_CACHE, 'java-reports', release, 'generated', 'reports')
});

/**
 * The reference source a release's datapack family stands on: its generated datapack, with the
 * `version.json` that names its target, and its registry report.
 *
 * @param release - A Java release id `sources.json` pins, such as `26.3`.
 */
export const javaReleaseData = (release: string): ReferenceSource => ({
    id: `java-release-data-${release}`,
    kind: 'fetched',
    holds: `Java ${release}'s generated vanilla datapack and data generator reports`,
    howToGet:
        `run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java ${release}\` and ` +
        `\`pnpm --filter @jsprismarine/bedrock-data run datagen:java --java ${release}\``,
    locate: () => {
        const { datapack, reports } = releasePaths(release);
        return existsSync(join(datapack, 'version.json')) && existsSync(join(reports, 'registries.json'))
            ? datapack
            : undefined;
    }
});

/**
 * The vanilla datapack registries that exist only for Java's own client, tooling or internals,
 * which a Bedrock player never sees, by their directory under `data/minecraft/`, each with why
 * the server loads none of it.
 */
export const JAVA_ONLY_REGISTRIES: Readonly<Record<string, string>> = {
    chat_type: "Chat formatting is the Bedrock client's; the server sends chat as Bedrock text packets.",
    dialog: 'Java dialogs are a Java client screen with no Bedrock packet.',
    test_environment: 'Java game tests are a development tool, not gameplay.',
    test_instance: 'Java game tests are a development tool, not gameplay.',
    context_float_provider:
        'A number provider grammar other registries use, loaded through the registries that name it.',
    context_int_provider: 'A number provider grammar other registries use, loaded through the registries that name it.',
    datapacks: 'Built-in pack manifests, which select registry entries rather than defining any.'
};

/**
 * A reviewed gap in what the release registers, with its issue: a type this server does not read
 * yet, or a whole datapack registry its loader does not load yet.
 */
export interface DeferredType {
    /** The registry, such as `minecraft:worldgen/feature_type`. */
    readonly registry: string;
    /**
     * The entry, such as `minecraft:crevasse`, for a `type-has-reader` row. Left out, the gap is
     * the whole registry, for its `registry-entry-count` row.
     */
    readonly id?: string;
    /** Why it is not read yet. */
    readonly reason: string;
    /** Where the gap is tracked, such as `issue #3279`. */
    readonly reference: string;
}

/** The release's datapack and reports, read once per family by {@link readJavaRelease}. */
export interface JavaReleaseData {
    readonly target: JavaDataTarget;
    readonly definitions: Definitions | undefined;
    /** The error diagnostics of a strict load, or the error that stopped it. */
    readonly loadErrors: readonly string[];
    readonly registries: ReadonlyMap<string, readonly string[]>;
    /**
     * The release's datapack registries, from `reports/datapack.json`: each registry a datapack
     * adds elements to, with the element files the release's own datapack holds for it, as
     * paths relative to the datapack root.
     */
    readonly datapackRegistries: ReadonlyMap<string, readonly string[]>;
}

/** Every `.json` file under a directory, as a `/`-separated path relative to `root`. */
const jsonFilesUnder = (root: string, directory: string): string[] =>
    existsSync(directory)
        ? readdirSync(directory, { recursive: true, withFileTypes: true })
              .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
              .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
              .sort()
        : [];

/**
 * The registries `reports/datapack.json` marks as taking elements from a datapack, each with the
 * element files the release's datapack holds under `data/minecraft/<registry path>/`.
 */
const readDatapackRegistries = (datapack: string, reports: string): Map<string, readonly string[]> => {
    const registries = new Map<string, readonly string[]>();
    const path = join(reports, 'datapack.json');
    if (!existsSync(path)) return registries;
    // Mojang's data generator report; only which registries take elements is read.
    const report: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(report) || !isRecord(report['registries'])) return registries;
    for (const [name, entry] of Object.entries(report['registries'])) {
        if (!isRecord(entry) || entry['elements'] !== true || !name.startsWith('minecraft:')) continue;
        const files = jsonFilesUnder(datapack, join(datapack, 'data', 'minecraft', name.slice('minecraft:'.length)));
        if (files.length > 0) registries.set(name, files);
    }
    return registries;
};

/**
 * Reads a release's datapack through the strict loader, and its registry report. Slow: a test
 * calls it in `beforeAll` and hands the result to {@link javaReleaseDatapackScenarios}.
 *
 * @param release - A Java release id `sources.json` pins, such as `26.3`.
 */
export const readJavaRelease = (release: string): JavaReleaseData => {
    const { datapack, reports } = releasePaths(release);
    const record = readGeneratedJavaVersion(datapack);
    if (record === undefined) throw new TypeError(`${datapack} has no version.json`);
    const target: JavaDataTarget = { release, format: record.dataPackFormat, dataVersion: record.dataVersion };

    // Mojang's data generator report; only the entry names of each registry are read.
    const report: unknown = JSON.parse(readFileSync(join(reports, 'registries.json'), 'utf8'));
    const registries = new Map<string, readonly string[]>();
    if (isRecord(report)) {
        for (const [name, registry] of Object.entries(report)) {
            if (isRecord(registry) && isRecord(registry['entries'])) {
                registries.set(name, Object.keys(registry['entries']));
            }
        }
    }

    const datapackRegistries = readDatapackRegistries(datapack, reports);
    try {
        const { definitions } = load([{ kind: 'datapack', path: datapack }], { strict: true, java: target });
        return { target, definitions, loadErrors: [], registries, datapackRegistries };
    } catch (error) {
        const loadErrors =
            error instanceof PackLoadError
                ? error.diagnostics
                      .filter((diagnostic) => diagnostic.severity === 'error')
                      .map((diagnostic) => `${diagnostic.code} ${diagnostic.path ?? ''}`)
                : [error instanceof Error ? error.message : String(error)];
        return { target, definitions: undefined, loadErrors, registries, datapackRegistries };
    }
};

/** The tagged registries whose tag values name entries of a registry the report lists. */
const TAGGED_REGISTRIES = ['block', 'item', 'entity_type', 'fluid', 'game_event'] as const;

/** The plain ids a tag lists, leaving out `#tag` references and optional entries' wrappers. */
const tagValues = (data: unknown): string[] => {
    if (!isRecord(data) || !Array.isArray(data['values'])) return [];
    return data['values']
        .map((value: unknown) => (isRecord(value) ? value['id'] : value))
        .filter((value): value is string => typeof value === 'string' && !value.startsWith('#'));
};

/** Whether a parse failed on the type itself, which every package's unknown-type error code says. */
const isUnknownTypeError = (error: unknown): boolean =>
    isRecord(error) && typeof error['code'] === 'string' && error['code'].includes('UNKNOWN');

/** Whether a parser recognizes a type: a probe naming only the type fails on a field, not the type. */
const recognizes = (parse: () => unknown): boolean => {
    try {
        parse();
        return true;
    } catch (error) {
        return !isUnknownTypeError(error);
    }
};

/** The registries of types the server reads, each with its parser probe. */
const TYPE_READERS: ReadonlyArray<{
    readonly registry: string;
    readonly reads: (id: string, format: number) => boolean;
}> = [
    {
        registry: 'minecraft:worldgen/feature_type',
        reads: (id) =>
            recognizes(() =>
                new FeatureLoader({
                    feature: () => undefined,
                    placedFeature: () => undefined,
                    blockStateProvider: () => undefined
                }).readFeature({ type: id }, 'probe')
            )
    },
    {
        registry: 'minecraft:worldgen/density_function_type',
        reads: (id, format) =>
            recognizes(() =>
                parseDensityFunction(
                    { type: id },
                    (reference) => {
                        throw new TypeError(`the probe names no reference, got ${reference}`);
                    },
                    'probe',
                    format
                )
            )
    }
];

/**
 * The scenarios of one release's `datapack.<release>` family.
 *
 * @param data - The release's datapack and reports, from {@link readJavaRelease}.
 * @param deferred - The types the release registers that are reviewed gaps, each a `deferred`
 *   row with its issue rather than a defect.
 */
export const javaReleaseDatapackScenarios = (
    data: JavaReleaseData,
    deferred: readonly DeferredType[]
): ScenarioGroup[] => {
    const { release } = data.target;
    const releaseData = (): JavaReleaseData => data;
    const reference = `Java ${release} vanilla datapack and reports/registries.json from datagen:java`;
    const deferredById = new Map(
        deferred.map((entry) => [entry.id === undefined ? entry.registry : `${entry.registry} ${entry.id}`, entry])
    );

    const strictLoad: BehaviorScenario<string> = {
        name: 'strict-load',
        java: `The vanilla datapack loads under its own data pack format with no error diagnostic.`,
        reference,
        subjects: () => [release],
        idOf: (subject) => subject,
        covers: () => undefined,
        run: () => {
            const errors = releaseData().loadErrors;
            return errors.length === 0 ? undefined : `${errors.length} errors, first ${errors[0]}`;
        }
    };

    const tagEntries: BehaviorScenario<(typeof TAGGED_REGISTRIES)[number]> = {
        name: 'tag-entries-registered',
        java: 'Every plain id a vanilla tag lists is an entry of the registry the tag is for.',
        reference,
        subjects: () => TAGGED_REGISTRIES,
        idOf: (registry) => `minecraft:${registry}`,
        covers: () => undefined,
        run: (registry) => {
            const { definitions, registries } = releaseData();
            if (definitions === undefined) return 'the datapack did not load';
            const entries = new Set(registries.get(`minecraft:${registry}`) ?? []);
            const prefix = `${registry}/`;
            let tags = 0;
            const unknown: string[] = [];
            for (const [identifier, definition] of definitions.tags) {
                if (!identifier.startsWith(prefix)) continue;
                tags++;
                for (const value of tagValues(definition.data)) {
                    const id = value.includes(':') ? value : `minecraft:${value}`;
                    if (!entries.has(id)) unknown.push(id);
                }
            }
            if (tags === 0) return `no ${registry} tags loaded`;
            return unknown.length === 0 ? undefined : `${unknown.length} ids not in the registry, first ${unknown[0]}`;
        }
    };

    const blockLoot: BehaviorScenario<string> = {
        name: 'block-loot-names-block',
        java: 'Every vanilla `loot_table/blocks/<name>` table is named for a block the registry lists.',
        reference,
        subjects: () => [release],
        idOf: () => 'minecraft:block',
        covers: () => undefined,
        run: () => {
            const { definitions, registries } = releaseData();
            if (definitions === undefined) return 'the datapack did not load';
            const blocks = new Set(registries.get('minecraft:block') ?? []);
            const tables = [...definitions.lootTablesJava.keys()].filter((id) => id.startsWith('minecraft:blocks/'));
            const unknown = tables.filter((id) => !blocks.has(`minecraft:${id.slice('minecraft:blocks/'.length)}`));
            if (tables.length === 0) return 'no block loot tables loaded';
            return unknown.length === 0 ? undefined : `${unknown.length} tables name no block, first ${unknown[0]}`;
        }
    };

    const typeReaders: BehaviorScenario<{ readonly registry: string; readonly id: string }> = {
        name: 'type-has-reader',
        java: 'Every type the release registers in a registry the server reads has a reader.',
        reference,
        subjects: () =>
            TYPE_READERS.flatMap(({ registry }) =>
                (releaseData().registries.get(registry) ?? []).map((id) => ({ registry, id }))
            ),
        idOf: ({ registry, id }) => `${registry} ${id}`,
        covers: () => undefined,
        run: ({ registry, id }) => {
            const reader = TYPE_READERS.find((entry) => entry.registry === registry);
            const format = releaseData().target.format[0];
            return reader?.reads(id, format) === true ? undefined : `no reader for ${id}`;
        },
        classify: ({ registry, id }) => {
            const entry = deferredById.get(`${registry} ${id}`);
            return entry === undefined
                ? undefined
                : { kind: 'deferred', reason: entry.reason, reference: entry.reference };
        }
    };

    const registryCounts: BehaviorScenario<string> = {
        name: 'registry-entry-count',
        java: 'The loader holds one entry for every element file the release ships in each datapack registry.',
        reference: `${reference}, with reports/datapack.json naming the registries`,
        subjects: () => [...releaseData().datapackRegistries.keys()],
        idOf: (registry) => registry,
        covers: () => undefined,
        run: (registry) => {
            const { definitions, datapackRegistries } = releaseData();
            if (definitions === undefined) return 'the datapack did not load';
            const files = datapackRegistries.get(registry) ?? [];
            const loaded = files.filter((file) => {
                const route = routeDatapackPath(file);
                return route !== undefined && definitions[route.registry].has(route.identifier);
            });
            return loaded.length === files.length
                ? undefined
                : `the loader holds ${loaded.length} of the ${files.length} elements the release ships`;
        },
        classify: (registry) => {
            const javaOnly = JAVA_ONLY_REGISTRIES[registry.slice('minecraft:'.length)];
            if (javaOnly !== undefined) return { kind: 'intentional', reason: javaOnly, reference: 'issue #2912' };
            const entry = deferredById.get(registry);
            return entry === undefined
                ? undefined
                : { kind: 'deferred', reason: entry.reason, reference: entry.reference };
        }
    };

    const recipeCorpus: BehaviorScenario<string> = {
        name: 'recipe-corpus-loads',
        java: 'Every vanilla recipe reads through `loadRecipes` with no error.',
        reference,
        subjects: () => [release],
        idOf: () => 'minecraft:recipe',
        covers: () => undefined,
        run: () => {
            const { definitions } = releaseData();
            if (definitions === undefined) return 'the datapack did not load';
            if (definitions.recipesJava.size === 0) return 'no recipes loaded';
            const tags = buildContentTags(definitions.tags);
            const { diagnostics, failed } = loadRecipes(
                [...definitions.recipesJava].map(([id, definition]) => [id, definition.data] as const),
                { tags: (registry, tag) => (tags.has(registry, tag) ? tags.members(registry, tag) : undefined) }
            );
            const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
            if (failed.length === 0 && errors.length === 0) return undefined;
            const first = errors[0];
            return `${failed.length} recipes failed, ${errors.length} errors${first === undefined ? '' : `, first ${first.recipeId} ${first.path}: ${first.message}`}`;
        }
    };

    const advancementCorpus: BehaviorScenario<string> = {
        name: 'advancement-corpus-loads',
        java: 'Every vanilla advancement reads through `parseAdvancement` with no diagnostic.',
        reference,
        subjects: () => [release],
        idOf: () => 'minecraft:advancement',
        covers: () => undefined,
        run: () => {
            const { definitions } = releaseData();
            if (definitions === undefined) return 'the datapack did not load';
            if (definitions.advancements.size === 0) return 'no advancements loaded';
            const resolver = contentResolver(definitions, buildContentTags(definitions.tags));
            let failed = 0;
            const reported: string[] = [];
            for (const [id, definition] of definitions.advancements) {
                const { value, diagnostics } = parseAdvancement(id, definition.data, { resolver });
                if (value === undefined) failed++;
                reported.push(...diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`));
            }
            if (failed === 0 && reported.length === 0) return undefined;
            return `${failed} advancements failed, ${reported.length} diagnostics${reported[0] === undefined ? '' : `, first ${reported[0]}`}`;
        }
    };

    return [
        scenarioGroup([strictLoad, blockLoot]),
        scenarioGroup([tagEntries]),
        scenarioGroup([typeReaders]),
        scenarioGroup([registryCounts]),
        scenarioGroup([recipeCorpus, advancementCorpus])
    ];
};
