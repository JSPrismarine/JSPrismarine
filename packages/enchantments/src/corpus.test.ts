import { DiagnosticCollector, isJsonObject, namespaced } from '@jsprismarine/predicates';
import type { ReferenceRegistry, ReferenceResolver } from '@jsprismarine/predicates';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { declarationOf, isEffectComponentType } from './components';
import { parseEnchantment } from './definition';
import { ENTITY_EFFECT_TYPES, LOCATION_EFFECT_TYPES } from './effects';
import { EnchantmentRegistry } from './registry';
import { VALUE_EFFECT_TYPES } from './values';

/**
 * Parses the real Java 26.3 enchantment files and tags, asserts the grammar
 * reports nothing, and measures which effect types vanilla
 * actually uses. The files come out of the server jar that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so the
 * suite only runs with JSP_VANILLA_DATAPACK set and skips without the cache.
 */

const enabled = !!process.env['JSP_VANILLA_DATAPACK'];

const valueEffectTypes: ReadonlySet<string> = new Set(VALUE_EFFECT_TYPES);
const entityEffectTypes: ReadonlySet<string> = new Set(ENTITY_EFFECT_TYPES);
const locationEffectTypes: ReadonlySet<string> = new Set(LOCATION_EFFECT_TYPES);

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

const extractVanillaDatapack = (): string => {
    const jar = findServerJar();
    const target = join(cacheRoot, 'vanilla-datapack', jar.version);
    const marker = join(target, 'data', 'minecraft', 'enchantment');
    if (existsSync(marker)) return target;

    const outer = readZip(readFileSync(jar.path));
    const innerName = [...outer.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (!innerName) throw new Error('the server jar has no META-INF/versions inner jar');

    const inner = outer.get(innerName);
    if (inner === undefined) throw new Error('the inner server jar is missing');

    for (const [name, bytes] of readZip(inner)) {
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
    // Extracted game files are untrusted input; every reader in this package narrows what it reads.
    return new Map(
        jsonFiles(root).map((path) => [idOf(root, path), JSON.parse(readFileSync(path, 'utf8')) as unknown])
    );
};

const tagValues = (file: unknown): readonly string[] => {
    const values = isJsonObject(file) ? file['values'] : undefined;
    if (!Array.isArray(values)) return [];
    return values.flatMap((entry: unknown) => {
        if (typeof entry === 'string') return [entry.startsWith('#') ? entry : namespaced(entry)];
        const nested = isJsonObject(entry) ? entry['id'] : undefined;
        return typeof nested === 'string' ? [nested.startsWith('#') ? nested : namespaced(nested)] : [];
    });
};

const short = (value: unknown): string | undefined =>
    typeof value === 'string' ? namespaced(value).slice('minecraft:'.length) : undefined;

/** Which level based fields each value effect and each world effect carries. */
const VALUE_LEVEL_FIELDS: Readonly<Record<string, readonly string[]>> = {
    add: ['value'],
    multiply: ['factor'],
    set: ['value'],
    exponential: ['base', 'exponent'],
    remove_binomial: ['chance']
};

const LEVEL_NESTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
    clamped: ['value'],
    fraction: ['numerator', 'denominator'],
    exponent: ['base', 'power'],
    lookup: ['fallback']
};

const EFFECT_LEVEL_FIELDS: Readonly<Record<string, readonly string[]>> = {
    apply_exhaustion: ['amount'],
    change_item_damage: ['amount'],
    apply_impulse: ['magnitude'],
    apply_mob_effect: ['min_duration', 'max_duration', 'min_amplifier', 'max_amplifier'],
    damage_entity: ['min_damage', 'max_damage'],
    explode: ['radius', 'knockback_multiplier'],
    ignite: ['duration'],
    replace_disk: ['radius', 'height'],
    attribute: ['amount']
};

interface Coverage {
    readonly components: Set<string>;
    readonly valueEffects: Set<string>;
    readonly levelValues: Set<string>;
    readonly worldEffects: Set<string>;
}

const walkLevel = (value: unknown, seen: Coverage): void => {
    const name = isJsonObject(value) ? short(value['type']) : undefined;
    if (name === undefined || !isJsonObject(value)) return;

    seen.levelValues.add(name);
    for (const field of LEVEL_NESTED_FIELDS[name] ?? []) walkLevel(value[field], seen);
};

const walkValue = (value: unknown, seen: Coverage): void => {
    const name = isJsonObject(value) ? short(value['type']) : undefined;
    if (name === undefined || !isJsonObject(value)) return;

    seen.valueEffects.add(name);
    if (name === 'all_of') {
        for (const nested of Array.isArray(value['effects']) ? value['effects'] : []) walkValue(nested, seen);
        return;
    }
    for (const field of VALUE_LEVEL_FIELDS[name] ?? []) walkLevel(value[field], seen);
};

const walkEffect = (value: unknown, seen: Coverage): void => {
    const name = isJsonObject(value) ? short(value['type']) : undefined;
    if (name === undefined || !isJsonObject(value)) return;

    seen.worldEffects.add(name);
    if (name === 'all_of') {
        for (const nested of Array.isArray(value['effects']) ? value['effects'] : []) walkEffect(nested, seen);
        return;
    }
    for (const field of EFFECT_LEVEL_FIELDS[name] ?? []) walkLevel(value[field], seen);
};

/** Records which effect types one enchantment file reaches for. */
const measure = (file: unknown, seen: Coverage): void => {
    const effects = isJsonObject(file) ? file['effects'] : undefined;
    if (!isJsonObject(effects)) return;

    for (const [key, body] of Object.entries(effects)) {
        const name = short(key);
        if (name === undefined || !isEffectComponentType(name)) continue;

        seen.components.add(name);
        const entries = Array.isArray(body) ? body : [body];
        switch (declarationOf(name).kind) {
            case 'value':
            case 'targeted_value':
                for (const entry of entries) walkValue(isJsonObject(entry) ? entry['effect'] : undefined, seen);
                break;
            case 'unconditional_value':
                walkValue(body, seen);
                break;
            case 'entity_effect':
            case 'targeted_entity_effect':
            case 'location_effect':
                for (const entry of entries) walkEffect(isJsonObject(entry) ? entry['effect'] : undefined, seen);
                break;
            case 'attributes':
                for (const entry of entries) {
                    walkEffect({ ...(isJsonObject(entry) ? entry : {}), type: 'minecraft:attribute' }, seen);
                }
                break;
            default:
                break;
        }
    }
};

describe.skipIf(!enabled)('the vanilla 26.3 enchantment corpus', { tags: ['real-data'] }, () => {
    it('parses every enchantment file without a diagnostic', { timeout: 120_000 }, () => {
        const datapack = extractVanillaDatapack();
        const files = loadFolder(datapack, 'enchantment');
        const tagFiles = loadFolder(datapack, 'tags/enchantment');
        const itemTags = loadFolder(datapack, 'tags/item');

        const resolver: ReferenceResolver = {
            tag: (registry: ReferenceRegistry, id) => {
                if (registry === 'enchantment') return tagValues(tagFiles.get(id));
                if (registry === 'item') return tagValues(itemTags.get(id));
                return undefined;
            }
        };

        const diagnostics = new DiagnosticCollector();
        const definitions = [...files].map(([id, json]) => {
            const { value } = parseEnchantment(id, json, { resolver, diagnostics, path: id });
            return value;
        });

        expect(diagnostics.entries.filter((entry) => entry.severity === 'error')).toEqual([]);

        // No warnings either. `lunge.json` reaches for the `food` member of the
        // player sub-predicate, which `@jsprismarine/predicates` now implements.
        // Asserting the exact list keeps a new gap from slipping in unnoticed.
        expect(diagnostics.entries.map((entry) => entry.message)).toEqual([]);

        // Every definition goes into a registry, which expands the tags the
        // files name and proves the exclusive sets resolve.
        const registry = new EnchantmentRegistry({
            definitions,
            tags: new Map([...tagFiles].map(([id, json]) => [id, tagValues(json)]))
        });
        expect([...registry.ids].sort()).toEqual([...files.keys()].sort());
        expect(registry.membersOf('minecraft:in_enchanting_table')).toContain('minecraft:sharpness');
        expect(registry.areCompatible('minecraft:sharpness', 'minecraft:smite')).toBe(false);

        const seen: Coverage = {
            components: new Set(),
            valueEffects: new Set(),
            levelValues: new Set(),
            worldEffects: new Set()
        };
        for (const json of files.values()) measure(json, seen);

        expect([...seen.components].every(isEffectComponentType)).toBe(true);
        expect([...seen.valueEffects].every((type) => valueEffectTypes.has(type))).toBe(true);
        expect([...seen.worldEffects].every((type) => locationEffectTypes.has(type))).toBe(true);
        expect([...seen.worldEffects].every((type) => entityEffectTypes.has(type) || type === 'attribute')).toBe(true);

        reportProgress(
            `Parsed ${files.size} enchantments and ${tagFiles.size} tags; the corpus uses ${seen.components.size} effect components, ${seen.valueEffects.size} value effects, ${seen.levelValues.size} level values, and ${seen.worldEffects.size} world effects.`
        );
    });
});
