import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';

/** One entry of a Java datapack registry. */
interface DatapackEntry {
    /** The registry directory under `data/minecraft`, such as `enchantment` or `villager_trade`. */
    readonly registry: string;
    /** The entry's path inside the registry, without the extension. */
    readonly path: string;
}

/**
 * The registries the server loads, by the content table that holds them and how that table
 * spells an entry. Every other registry is a Java feature the server has no loader for.
 */
const LOADED: Readonly<Record<string, { readonly table: string; readonly key: (entry: DatapackEntry) => string }>> = {
    advancement: { table: 'advancements', key: (entry) => `minecraft:${entry.path}` },
    enchantment: { table: 'enchantments', key: (entry) => `minecraft:${entry.path}` },
    damage_type: { table: 'damageTypes', key: (entry) => `minecraft:${entry.path}` },
    loot_table: { table: 'lootTablesJava', key: (entry) => `minecraft:${entry.path}` },
    recipe: { table: 'recipesJava', key: (entry) => `minecraft:${entry.path}` },
    predicate: { table: 'predicates', key: (entry) => `minecraft:${entry.path}` },
    block_transformer: { table: 'blockTransformers', key: (entry) => `minecraft:${entry.path}` },
    dimension_type: { table: 'dimensionTypes', key: (entry) => `minecraft:${entry.path}` },
    tags: {
        table: 'tags',
        key: (entry) => {
            const parts = entry.path.split('/');
            const depth = parts[0] === 'worldgen' ? 2 : 1;
            return `${parts.slice(0, depth).join('/')}/minecraft:${parts.slice(depth).join('/')}`;
        }
    },
    worldgen: {
        table: 'worldgen',
        key: (entry) => {
            const parts = entry.path.split('/');
            const kind = parts.shift() ?? '';
            return `${kind}/minecraft:${parts.join('/')}`;
        }
    }
};

/** Registries that exist only for Java's own client, tooling or internals, which a Bedrock player never sees. */
const JAVA_ONLY: Readonly<Record<string, string>> = {
    chat_type: "Chat formatting is the Bedrock client's; the server sends chat as Bedrock text packets.",
    dialog: 'Java dialogs are a Java client screen with no Bedrock packet.',
    test_environment: 'Java game tests are a development tool, not gameplay.',
    test_instance: 'Java game tests are a development tool, not gameplay.',
    context_float_provider:
        'A number provider grammar other registries use, loaded through the registries that name it.',
    context_int_provider: 'A number provider grammar other registries use, loaded through the registries that name it.',
    datapacks: 'Built-in pack manifests, which select registry entries rather than defining any.'
};

const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? walk(join(directory, entry.name))
            : entry.name.endsWith('.json')
              ? [join(directory, entry.name)]
              : []
    );

const javaEntries = (): readonly DatapackEntry[] => {
    const root = join(unpackVanillaDatapack(), 'data', 'minecraft');
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((directory) =>
            walk(join(root, directory.name)).map((file) => ({
                registry: directory.name,
                path: relative(join(root, directory.name), file)
                    .replace(/\.json$/, '')
                    .split('\\')
                    .join('/')
            }))
        );
};

const scenarios: readonly BehaviorScenario<DatapackEntry>[] = [
    {
        name: 'registry-entry-loaded',
        java: 'Every entry of a vanilla datapack registry is loaded and used by the server.',
        reference: 'Java 26.3 data/minecraft datapack registries',
        subjects: javaEntries,
        idOf: (entry) => `${entry.registry}/${entry.path}`,
        covers: () => undefined,
        classify: (entry) => {
            const reason = JAVA_ONLY[entry.registry];
            return reason === undefined
                ? {
                      kind: 'deferred',
                      reason: `The server has no loader for the ${entry.registry} registry, so this Java entry does not shape gameplay.`
                  }
                : { kind: 'intentional', reason };
        },
        run: (entry) => {
            const loaded = LOADED[entry.registry];
            if (loaded === undefined) return `the server does not load the ${entry.registry} registry`;
            const table: unknown = Reflect.get(serverContent().definitions, loaded.table);
            if (!(table instanceof Map)) return `the server has no ${loaded.table} table`;
            return table.has(loaded.key(entry))
                ? undefined
                : `the server's ${loaded.table} table has no ${loaded.key(entry)}`;
        }
    }
];

describeFamily(FAMILIES.gameplayDatapack, [REFERENCES.javaWorldgenData, REFERENCES.bedrockBehaviorPack], () => {
    it('loads each vanilla datapack registry entry into the server content', { timeout: 180_000 }, () => {
        const rows = measureScenarios(FAMILIES.gameplayDatapack, import.meta.filename, scenarioGroup(scenarios));

        expect(rows.length).toBeGreaterThan(0);
        expect(
            rows.some((row) => row.id === 'registry-entry-loaded:enchantment/sharpness' && row.difference === undefined)
        ).toBe(true);
    });
});
