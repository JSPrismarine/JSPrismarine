import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { Diagnostic } from './diagnostics';
import type { DiagnosticCollector } from './diagnostics';
import { MERGE_MODES, routeDatapackPath } from './javaRegistries';
import type { MergeMode } from './javaRegistries';
import type { DefinitionRegistries } from './load';
import { DATA_PACK_FORMAT, coversFormat, formatToString, parseMcmeta } from './mcmeta';
import type { PackMcmeta } from './mcmeta';
import type { DefinitionValidator } from './validation';
import { isZip, readZip } from './zip';

/**
 * The Java half of the pack stack: reads one datapack from a directory or a
 * zip, applies `pack.mcmeta` overlays, gates on the pack format range, and
 * loads definitions into the shared registries. Datapack data is untrusted:
 * paths with traversal segments are dropped, and a format mismatch is a
 * diagnostic rather than a refusal, so a pack written for a neighboring
 * version still loads outside strict mode.
 */

const decoder = new TextDecoder();

/** A tag file's shape after merging across the stack. */
export interface TagData {
    /** Whether any contributing pack set `replace`, discarding earlier values. */
    replace: boolean;
    /** The merged entries in pack order: plain ids or `{ id, required }` objects. */
    values: unknown[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a pack-relative path is safe to use: relative, `/`-separated, no traversal. */
const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/** Reads a datapack folder or zip into file bytes by pack-relative path. */
const readDatapackFiles = (path: string): Map<string, Uint8Array> => {
    if (statSync(path).isDirectory()) {
        const files = new Map<string, Uint8Array>();
        for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const absolute = join(entry.parentPath, entry.name);
            files.set(relative(path, absolute).split(sep).join('/'), readFileSync(absolute));
        }
        return files;
    }

    const bytes = readFileSync(path);
    if (!isZip(bytes)) throw new Error(`${path} is neither a directory nor a zip archive`);
    const files = new Map<string, Uint8Array>();
    for (const [name, data] of readZip(bytes)) {
        if (isSafePath(name)) files.set(name, data);
    }
    return files;
};

/** Parses `pack.mcmeta` and reports the format gate; the pack loads either way. */
const readMcmeta = (
    files: Map<string, Uint8Array>,
    pack: string,
    collector: DiagnosticCollector
): PackMcmeta | undefined => {
    const bytes = files.get('pack.mcmeta');
    if (!bytes) {
        collector.add({
            severity: 'error',
            code: 'mcmeta.missing',
            pack,
            message: 'the datapack has no pack.mcmeta'
        });
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(decoder.decode(bytes));
    } catch (error) {
        collector.add({
            severity: 'error',
            code: 'mcmeta.invalid',
            pack,
            path: 'pack.mcmeta',
            message: error instanceof Error ? error.message : String(error)
        });
        return undefined;
    }

    const { mcmeta, diagnostics } = parseMcmeta(parsed, pack);
    for (const diagnostic of diagnostics) collector.add(diagnostic);
    if (!mcmeta) return undefined;

    if (mcmeta.formats && !coversFormat(mcmeta.formats, DATA_PACK_FORMAT)) {
        collector.add({
            severity: 'error',
            code: 'mcmeta.format-mismatch',
            pack,
            path: 'pack.mcmeta',
            message:
                `the pack supports formats ${formatToString(mcmeta.formats.min)} to ` +
                `${formatToString(mcmeta.formats.max)}, which does not cover ${formatToString(DATA_PACK_FORMAT)}`
        });
    }

    return mcmeta;
};

/**
 * Resolves the pack's overlay directories into one view of its files.
 *
 * A declared overlay directory is never content on its own: it is dropped
 * from the base view whether or not its range applies, which is how the
 * engine reads it. The overlays whose range covers 121.0 then apply in
 * declaration order, each overriding whole files, so a later entry wins over
 * an earlier one and every entry wins over the base. Within one pack an
 * overlay replaces the base file outright, tags included; merging is what
 * happens between packs, not between a pack and its own overlay.
 *
 * A declared overlay with no files is reported: it is dead weight at best and
 * a misspelled directory name at worst, and either way it silently does
 * nothing.
 */
const applyOverlays = (
    files: Map<string, Uint8Array>,
    mcmeta: PackMcmeta | undefined,
    pack: string,
    collector: DiagnosticCollector
): Map<string, Uint8Array> => {
    const overlays = mcmeta?.overlays ?? [];
    if (overlays.length === 0) return files;

    const directories = new Set(overlays.map((overlay) => overlay.directory));
    const effective = new Map<string, Uint8Array>();
    for (const [path, bytes] of files) {
        if (!directories.has(path.split('/')[0]!)) effective.set(path, bytes);
    }

    for (const overlay of overlays) {
        const prefix = `${overlay.directory}/`;
        const applies = coversFormat(overlay.formats, DATA_PACK_FORMAT);
        let found = 0;
        for (const [path, bytes] of files) {
            if (!path.startsWith(prefix)) continue;
            found += 1;
            if (applies) effective.set(path.slice(prefix.length), bytes);
        }
        if (found === 0) {
            collector.add({
                severity: 'warning',
                code: 'mcmeta.empty-overlay',
                pack,
                path: 'pack.mcmeta',
                message: `the overlay directory ${overlay.directory} holds no files`
            });
        }
    }
    return effective;
};

/** Merges one tag file over what earlier packs accumulated for the same id. */
const mergeTag = (previous: Record<string, unknown> | undefined, data: Record<string, unknown>): TagData => {
    const replaces = data.replace === true;
    const previousValues = Array.isArray(previous?.values) ? previous.values : [];
    const values = Array.isArray(data.values) ? data.values : [];
    return {
        replace: replaces || previous?.replace === true,
        values: replaces ? [...values] : [...previousValues, ...values]
    };
};

/**
 * Composes one file over what earlier packs in the stack left for the same
 * id, by the registry's merge mode.
 *
 * @param previous - What earlier packs left, or undefined for the first one.
 * @returns The composed definition data.
 */
export const mergeJavaDefinition = (mode: MergeMode, previous: unknown, data: unknown): unknown => {
    if (mode === 'override' || !isRecord(data)) return data;

    const earlier = isRecord(previous) ? previous : undefined;
    if (mode === 'assign') return { ...earlier, ...data };
    return mergeTag(earlier, data);
};

/**
 * Loads one datapack from a directory or zip into the shared registries.
 * Within the Java half a later pack wins per file, except tags, which merge:
 * values concatenate across packs and a pack that sets `replace` discards the
 * earlier ones, which is vanilla's rule.
 */
export const loadDatapack = (
    path: string,
    registries: DefinitionRegistries,
    validator: DefinitionValidator,
    collector: DiagnosticCollector
): void => {
    const pack = basename(path);

    let files: Map<string, Uint8Array>;
    try {
        files = readDatapackFiles(path);
    } catch (error) {
        collector.add({
            severity: 'error',
            code: 'source.unreadable',
            pack: path,
            message: error instanceof Error ? error.message : String(error)
        });
        return;
    }

    const mcmeta = readMcmeta(files, pack, collector);

    for (const [filePath, bytes] of applyOverlays(files, mcmeta, pack, collector)) {
        const route = routeDatapackPath(filePath);
        if (!route) continue;

        let data: unknown;
        try {
            data = JSON.parse(decoder.decode(bytes));
        } catch (error) {
            collector.add({
                severity: 'error',
                code: 'definition.invalid-json',
                pack,
                path: filePath,
                message: error instanceof Error ? error.message : String(error)
            });
            continue;
        }

        let failed = false;
        for (const finding of validator({ registry: route.registry, path: filePath, data })) {
            collector.add({ ...finding, pack, path: filePath } satisfies Diagnostic);
            failed ||= finding.severity === 'error';
        }
        if (failed) continue;

        const registry = registries[route.registry];
        const merged = mergeJavaDefinition(MERGE_MODES[route.registry], registry.get(route.identifier)?.data, data);
        registry.set(route.identifier, {
            identifier: route.identifier,
            registry: route.registry,
            pack,
            path: filePath,
            data: merged
        });
    }
};
