import { DiagnosticCollector, isJsonObject, namespaced } from '@jsprismarine/predicates';
import type { ElementRegistry, EntityView, ReferenceRegistry, ReferenceResolver } from '@jsprismarine/predicates';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { AdvancementEngine } from './engine';
import { parseAdvancement } from './model';
import type { ParsedAdvancement } from './model';
import { PlayerAdvancements } from './progress';
import { buildAdvancementTree } from './tree';

/**
 * Parses every advancement in the real Java 26.3 vanilla datapack, asserts the
 * grammar reports nothing, and reports which triggers the datapack uses. The datapack
 * comes out of the server jar that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so the
 * suite only runs with JSP_VANILLA_DATAPACK set.
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
    const marker = join(target, 'data', 'minecraft', 'advancement');
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

const loadFolder = (datapack: string, folder: string): Map<string, unknown> => {
    const root = join(datapack, 'data', 'minecraft', ...folder.split('/'));
    // JSON.parse returns unknown-shaped data; every reader narrows it.
    return new Map(
        jsonFiles(root).map((path) => [idOf(root, path), JSON.parse(readFileSync(path, 'utf8')) as unknown])
    );
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

const TAG_REGISTRIES: readonly ReferenceRegistry[] = [
    'item',
    'block',
    'entity_type',
    'enchantment',
    'fluid',
    'damage_type',
    'mob_effect',
    'worldgen/biome',
    'worldgen/structure',
    'predicate',
    'loot_table',
    'advancement',
    'recipe'
];

const buildResolver = (
    datapack: string
): { readonly resolver: ReferenceResolver; readonly advancements: Map<string, unknown> } => {
    const elements = new Map<ElementRegistry, Map<string, unknown>>();
    for (const registry of Object.keys(ELEMENT_FOLDERS)) {
        const key: ElementRegistry = registry as ElementRegistry;
        elements.set(key, loadFolder(datapack, ELEMENT_FOLDERS[key]));
    }

    const tags = new Map<string, Map<string, unknown>>();
    for (const registry of TAG_REGISTRIES) tags.set(registry, loadFolder(datapack, `tags/${registry}`));

    const resolver: ReferenceResolver = {
        element: (registry, id) => elements.get(registry)?.get(id),
        tag: (registry, id) => {
            const file = tags.get(registry)?.get(id);
            if (!isJsonObject(file) || !Array.isArray(file['values'])) return undefined;
            return file['values'].flatMap((entry: unknown) => {
                if (typeof entry === 'string') return [entry.startsWith('#') ? entry : namespaced(entry)];
                const nested = isJsonObject(entry) ? entry['id'] : undefined;
                return typeof nested === 'string' ? [nested.startsWith('#') ? nested : namespaced(nested)] : [];
            });
        }
    };

    return { resolver, advancements: elements.get('advancement')! };
};

const player: EntityView = { type: 'minecraft:player', position: { x: 0, y: 64, z: 0 } };

describe.skipIf(!enabled)('the vanilla 26.3 advancement corpus', { tags: ['real-data'] }, () => {
    it('parses every advancement without a diagnostic', { timeout: 300_000 }, () => {
        const datapack = extractVanillaDatapack();
        const { resolver, advancements } = buildResolver(datapack);
        const diagnostics = new DiagnosticCollector();

        const parsed: ParsedAdvancement[] = [];
        const triggerCounts = new Map<string, number>();
        let criteria = 0;
        let rewardRecipes = 0;
        let rewardExperience = 0;

        for (const [id, json] of advancements) {
            const { value } = parseAdvancement(id, json, { resolver, diagnostics });
            if (!value) continue;
            parsed.push(value);
            for (const criterion of value.criteria.values()) {
                criteria += 1;
                triggerCounts.set(criterion.trigger, (triggerCounts.get(criterion.trigger) ?? 0) + 1);
            }
            if (value.rewards.recipes.length > 0) rewardRecipes += 1;
            if (value.rewards.experience !== 0) rewardExperience += 1;
        }

        expect(diagnostics.entries).toEqual([]);
        reportProgress(
            `Parsed ${parsed.length} of ${advancements.size} advancements, ${criteria} criteria, ${rewardRecipes} recipe rewards, and ${rewardExperience} experience rewards; ${triggerCounts.size} trigger types are used.`
        );
    });

    it('builds the tree for every parsed advancement without a cycle', { timeout: 300_000 }, () => {
        const datapack = extractVanillaDatapack();
        const { resolver, advancements } = buildResolver(datapack);
        const parsed = [...advancements].flatMap(([id, json]) => {
            const { value } = parseAdvancement(id, json, { resolver });
            return value ? [value] : [];
        });

        const { tree, diagnostics } = buildAdvancementTree(parsed);

        expect(diagnostics).toEqual([]);
        expect(tree.nodes.size).toBe(parsed.length);
        expect(tree.roots.map((node) => node.id).sort()).toEqual([
            'minecraft:adventure/root',
            'minecraft:end/root',
            'minecraft:husbandry/root',
            'minecraft:nether/root',
            'minecraft:recipes/root',
            'minecraft:story/root'
        ]);
    });

    it('dispatches recipe unlocks to the matching advancement', { timeout: 300_000 }, () => {
        const datapack = extractVanillaDatapack();
        const { resolver, advancements } = buildResolver(datapack);
        const parsed = [...advancements].flatMap(([id, json]) => {
            const { value } = parseAdvancement(id, json, { resolver });
            return value ? [value] : [];
        });

        const engine = new AdvancementEngine();
        engine.load(parsed);

        const recipes = parsed.flatMap((advancement) =>
            [...advancement.criteria.values()].flatMap((criterion) =>
                criterion.trigger === 'recipe_unlocked' ? (criterion.keys ?? []) : []
            )
        );
        const progress = new PlayerAdvancements();
        for (const recipe of recipes) engine.raise('recipe_unlocked', { player, recipe }, progress);

        expect(progress.toJSON()).toHaveProperty(['minecraft:recipes/building_blocks/stone_slab']);
        reportProgress(`${recipes.length} recipe unlock events were dispatched through the advancement engine.`);
    });
});
