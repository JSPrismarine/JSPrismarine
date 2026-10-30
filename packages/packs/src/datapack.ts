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

/** What a datapack holds: every path in it, and the bytes of the ones this loader reads. */
interface DatapackContents {
    /** Every pack-relative path the pack carries, read or not. */
    readonly paths: readonly string[];
    /** The bytes of the files {@link readable} kept, by pack-relative path. */
    readonly files: Map<string, Uint8Array>;
}

/**
 * Whether a datapack file is one this loader reads.
 *
 * `pack.mcmeta` names the overlays, a path {@link routeDatapackPath} routes is a definition, and
 * a path that routes once its leading directory is dropped is an overlay's copy of one. Nothing
 * else reaches the registries, and a vanilla 26.3 datapack is 8373 files of which 7483 route.
 * The rest are the villager trade, variant and nested built-in pack registries this loader does
 * not consume, and opening each of them costs a syscall pair for bytes that go straight back out.
 *
 * Overlay directories are matched by shape rather than by name because the names are in
 * `pack.mcmeta`, which this answers about too. Keeping a file of a directory that turns out not
 * to be an overlay only costs the read.
 */
const readable = (path: string): boolean => {
    if (path === 'pack.mcmeta' || routeDatapackPath(path) !== undefined) return true;

    const separator = path.indexOf('/');
    return separator > 0 && routeDatapackPath(path.slice(separator + 1)) !== undefined;
};

/** Reads a datapack folder or zip: every path in it, and the bytes of the readable ones. */
const readDatapackFiles = (path: string): DatapackContents => {
    const paths: string[] = [];
    const files = new Map<string, Uint8Array>();

    if (statSync(path).isDirectory()) {
        for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const absolute = join(entry.parentPath, entry.name);
            const packPath = relative(path, absolute).split(sep).join('/');
            paths.push(packPath);
            if (readable(packPath)) files.set(packPath, readFileSync(absolute));
        }
        return { paths, files };
    }

    const bytes = readFileSync(path);
    if (!isZip(bytes)) throw new Error(`${path} is neither a directory nor a zip archive`);
    for (const [name, data] of readZip(bytes)) {
        if (!isSafePath(name)) continue;
        paths.push(name);
        if (readable(name)) files.set(name, data);
    }
    return { paths, files };
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
    contents: DatapackContents,
    mcmeta: PackMcmeta | undefined,
    pack: string,
    collector: DiagnosticCollector
): Map<string, Uint8Array> => {
    const { files, paths } = contents;
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
        // Counted over every path rather than over the files that were read, so an overlay of
        // registries this loader skips is still an overlay that holds something.
        let found = 0;
        for (const path of paths) {
            if (!path.startsWith(prefix)) continue;
            found += 1;

            const bytes = files.get(path);
            if (applies && bytes !== undefined) effective.set(path.slice(prefix.length), bytes);
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

    let contents: DatapackContents;
    try {
        contents = readDatapackFiles(path);
    } catch (error) {
        collector.add({
            severity: 'error',
            code: 'source.unreadable',
            pack: path,
            message: error instanceof Error ? error.message : String(error)
        });
        return;
    }

    const mcmeta = readMcmeta(contents.files, pack, collector);

    for (const [filePath, bytes] of applyOverlays(contents, mcmeta, pack, collector)) {
        const route = routeDatapackPath(filePath);
        if (!route) continue;

        // An mcfunction is the one datapack file that is not JSON. Its text is
        // the definition, parsed by `@jsprismarine/mcfunction` rather than
        // here, and there is no structural shape for a validator to check.
        if (route.registry === 'functions') {
            registries.functions.set(route.identifier, {
                identifier: route.identifier,
                registry: 'functions',
                pack,
                path: filePath,
                data: decoder.decode(bytes)
            });
            continue;
        }

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
