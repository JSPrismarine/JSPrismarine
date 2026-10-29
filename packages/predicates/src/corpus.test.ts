import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';
import { LOOT_CONDITION_TYPES, parsePredicate } from './conditions';
import { DiagnosticCollector } from './diagnostics';
import { isJsonObject, namespaced } from './json';
import { parseItemModifier } from './modifiers';
import { parseFloatProvider, parseIntProvider } from './providers';
import type { ElementRegistry, ReferenceRegistry, ReferenceResolver } from './reference';

/**
 * Parses every predicate, every loot table condition and function, and every
 * context provider in the real Java 26.3 vanilla datapack, and asserts the
 * grammar produces no parse errors. The datapack comes out of the server jar
 * that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches,
 * so the suite only runs with JSP_VANILLA_DATAPACK set.
 */

const enabled = !!process.env['JSP_VANILLA_DATAPACK'];

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const readZip = (bytes: Buffer): Map<string, Buffer> => {
    const signature = 0x06054b50;
    let end = bytes.length - 22;
    while (end >= 0 && bytes.readUInt32LE(end) !== signature) end -= 1;
    if (end < 0) throw new Error('no end of central directory record');

    const count = bytes.readUInt16LE(end + 10);
    let cursor = bytes.readUInt32LE(end + 16);
    const entries = new Map<string, Buffer>();

    for (let index = 0; index < count; index += 1) {
        const method = bytes.readUInt16LE(cursor + 10);
        const compressed = bytes.readUInt32LE(cursor + 20);
        const nameLength = bytes.readUInt16LE(cursor + 28);
        const extraLength = bytes.readUInt16LE(cursor + 30);
        const commentLength = bytes.readUInt16LE(cursor + 32);
        const localOffset = bytes.readUInt32LE(cursor + 42);
        const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);

        const localNameLength = bytes.readUInt16LE(localOffset + 26);
        const localExtraLength = bytes.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const raw = bytes.subarray(start, start + compressed);
        if (!name.endsWith('/')) entries.set(name, method === 0 ? raw : inflateRawSync(raw));

        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
};

const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/** Finds the cached Java server jar, whichever of the two source names holds it. */
const findServerJar = (): { readonly version: string; readonly path: string } => {
    for (const source of ['java-server', 'java']) {
        const root = join(cacheRoot, source);
        if (!existsSync(root)) continue;
        const version = readdirSync(root).find((name) => existsSync(join(root, name, 'server.jar')));
        if (version) return { version, path: join(root, version, 'server.jar') };
    }
    throw new Error(`no server.jar under ${cacheRoot}; run the bedrock-data fetch:sources script`);
};

/** Extracts `data/minecraft` out of the bundler jar's inner server jar, once. */
const extractVanillaDatapack = (): string => {
    const jar = findServerJar();
    const target = join(cacheRoot, 'vanilla-datapack', jar.version);
    const marker = join(target, 'data', 'minecraft', 'loot_table');
    if (existsSync(marker)) return target;

    const outer = readZip(readFileSync(jar.path));
    const innerName = [...outer.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (!innerName) throw new Error('the server jar has no META-INF/versions inner jar');

    for (const [name, bytes] of readZip(outer.get(innerName)!)) {
        if (!name.startsWith('data/') || !name.endsWith('.json') || !isSafePath(name)) continue;
        const absolute = join(target, ...name.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, bytes);
    }
    return target;
};

const jsonFiles = (root: string): readonly string[] => {
    if (!existsSync(root)) return [];
    return readdirSync(root).flatMap((name) => {
        const path = join(root, name);
        if (statSync(path).isDirectory()) return jsonFiles(path);
        return name.endsWith('.json') ? [path] : [];
    });
};

const idOf = (root: string, path: string): string =>
    `minecraft:${relative(root, path)
        .split(sep)
        .join('/')
        .replace(/\.json$/, '')}`;

/** Reads parsed JSON out of an extracted datapack folder, keyed by namespaced id. */
const loadFolder = (datapack: string, folder: string): Map<string, unknown> => {
    const root = join(datapack, 'data', 'minecraft', ...folder.split('/'));
    // JSON.parse returns unknown-shaped data; every reader in this package narrows it.
    return new Map(
        jsonFiles(root).map((path) => [idOf(root, path), JSON.parse(readFileSync(path, 'utf8')) as unknown])
    );
};

const TAG_FOLDERS: Readonly<Record<string, string>> = {
    item: 'tags/item',
    block: 'tags/block',
    entity_type: 'tags/entity_type',
    enchantment: 'tags/enchantment',
    fluid: 'tags/fluid',
    damage_type: 'tags/damage_type',
    mob_effect: 'tags/mob_effect',
    'worldgen/biome': 'tags/worldgen/biome',
    'worldgen/structure': 'tags/worldgen/structure',
    predicate: 'tags/predicate',
    item_modifier: 'tags/item_modifier',
    loot_table: 'tags/loot_table',
    context_int_provider: 'tags/context_int_provider',
    context_float_provider: 'tags/context_float_provider',
    advancement: 'tags/advancement',
    recipe: 'tags/recipe',
    slot_source: 'tags/slot_source'
};

const ELEMENT_FOLDERS: Readonly<Record<ElementRegistry, string>> = {
    predicate: 'predicate',
    item_modifier: 'item_modifier',
    loot_table: 'loot_table',
    context_int_provider: 'context_int_provider',
    context_float_provider: 'context_float_provider',
    advancement: 'advancement',
    recipe: 'recipe',
    slot_source: 'slot_source'
};

const buildResolver = (
    datapack: string
): { readonly resolver: ReferenceResolver; readonly elements: Map<ElementRegistry, Map<string, unknown>> } => {
    const elements = new Map<ElementRegistry, Map<string, unknown>>();
    for (const [registry, folder] of Object.entries(ELEMENT_FOLDERS)) {
        if (registry in ELEMENT_FOLDERS) elements.set(registry as ElementRegistry, loadFolder(datapack, folder));
    }

    const tags = new Map<string, Map<string, unknown>>();
    for (const [registry, folder] of Object.entries(TAG_FOLDERS)) tags.set(registry, loadFolder(datapack, folder));

    const resolver: ReferenceResolver = {
        element: (registry, id) => elements.get(registry)?.get(id),
        tag: (registry: ReferenceRegistry, id) => {
            const file = tags.get(registry)?.get(id);
            if (!isJsonObject(file) || !Array.isArray(file['values'])) return undefined;
            return file['values'].flatMap((entry: unknown) => {
                if (typeof entry === 'string') return [entry.startsWith('#') ? entry : namespaced(entry)];
                const nested = isJsonObject(entry) ? entry['id'] : undefined;
                return typeof nested === 'string' ? [nested.startsWith('#') ? nested : namespaced(nested)] : [];
            });
        }
    };

    return { resolver, elements };
};

interface Counts {
    conditions: number;
    modifiers: number;
}

const isLootCondition = (value: unknown): boolean => {
    if (!isJsonObject(value)) return false;
    const declared = value['type'];
    if (typeof declared !== 'string') return false;
    const name = namespaced(declared).slice('minecraft:'.length);
    return LOOT_CONDITION_TYPES.some((known) => known === name);
};

/** Parses every loot condition an advancement criterion carries. */
const parseAdvancement = (
    advancement: unknown,
    path: string,
    diagnostics: DiagnosticCollector,
    resolver: ReferenceResolver
): number => {
    const criteria = isJsonObject(advancement) ? advancement['criteria'] : undefined;
    if (!isJsonObject(criteria)) return 0;

    let parsed = 0;
    for (const [name, criterion] of Object.entries(criteria)) {
        const conditions = isJsonObject(criterion) ? criterion['conditions'] : undefined;
        if (!isJsonObject(conditions)) continue;
        for (const [field, value] of Object.entries(conditions)) {
            const terms = Array.isArray(value) ? value : [value];
            if (!terms.every(isLootCondition)) continue;
            parsed += 1;
            parsePredicate(value, { resolver, diagnostics, path: `${path}#${name}.${field}` });
        }
    }
    return parsed;
};

/**
 * Walks a loot table and parses every condition and function it carries,
 * without descending into a subtree the grammar already parsed.
 */
const parseLootTable = (
    table: unknown,
    path: string,
    diagnostics: DiagnosticCollector,
    resolver: ReferenceResolver,
    counts: Counts
): void => {
    const visit = (value: unknown, pointer: string): void => {
        if (Array.isArray(value)) {
            value.forEach((entry, index) => visit(entry, `${pointer}[${index}]`));
            return;
        }
        if (!isJsonObject(value)) return;

        for (const [key, nested] of Object.entries(value)) {
            if (key === 'condition') {
                counts.conditions += 1;
                parsePredicate(nested, { resolver, diagnostics, path: `${path}#${pointer}.${key}` });
                continue;
            }
            if (key === 'modifier' || key === 'functions') {
                counts.modifiers += 1;
                parseItemModifier(nested, { resolver, diagnostics, path: `${path}#${pointer}.${key}` });
                continue;
            }
            visit(nested, `${pointer}.${key}`);
        }
    };

    visit(table, '');
};

describe.skipIf(!enabled)('the vanilla 26.3 grammar corpus', { tags: ['real-data'] }, () => {
    it(
        'parses every predicate, loot condition, loot function and provider without an error',
        { timeout: 300_000 },
        () => {
            const datapack = extractVanillaDatapack();
            const { resolver, elements } = buildResolver(datapack);
            const diagnostics = new DiagnosticCollector();

            const predicates = elements.get('predicate')!;
            for (const [id, json] of predicates) parsePredicate(json, { resolver, diagnostics, path: id });

            const intProviders = elements.get('context_int_provider')!;
            for (const [id, json] of intProviders) parseIntProvider(json, { resolver, diagnostics, path: id });

            const floatProviders = elements.get('context_float_provider')!;
            for (const [id, json] of floatProviders) parseFloatProvider(json, { resolver, diagnostics, path: id });

            const modifiers = elements.get('item_modifier')!;
            for (const [id, json] of modifiers) parseItemModifier(json, { resolver, diagnostics, path: id });

            const tables = elements.get('loot_table')!;
            const counts: Counts = { conditions: 0, modifiers: 0 };
            for (const [id, json] of tables) parseLootTable(json, id, diagnostics, resolver, counts);

            const advancements = elements.get('advancement')!;
            let advancementConditions = 0;
            for (const [id, json] of advancements) {
                advancementConditions += parseAdvancement(json, id, diagnostics, resolver);
            }

            expect(predicates.size).toBeGreaterThan(0);
            expect(intProviders.size).toBeGreaterThan(0);
            expect(floatProviders.size).toBeGreaterThan(0);
            expect(tables.size).toBeGreaterThan(0);
            expect(advancements.size).toBeGreaterThan(0);
            expect(counts.conditions + counts.modifiers).toBeGreaterThan(0);
            expect(advancementConditions).toBeGreaterThan(0);
            reportProgress(
                `Java grammar corpus: ${predicates.size} predicates, ${modifiers.size} item modifiers, ${intProviders.size} integer providers, ${floatProviders.size} float providers, ${tables.size} loot tables, ${advancements.size} advancements, ${counts.conditions} loot conditions, ${counts.modifiers} loot modifiers, and ${advancementConditions} advancement conditions.`
            );
            expect(diagnostics.entries).toEqual([]);
        }
    );
});
