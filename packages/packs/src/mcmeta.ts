import type { Diagnostic } from './diagnostics';

/**
 * `pack.mcmeta` for a Java datapack. 26.3 declares a `min_format` and
 * `max_format` pair (a major integer or a `[major, minor]` array), while packs
 * written before 1.21.9 declare a single `pack_format` integer. Both forms
 * parse here, following mc-datapack-loader's model.
 */

/** A Java data pack format: major and minor. The 26.3 data format is 121.0. */
export type PackFormat = readonly [number, number];

/** The data pack format this loader targets: 121.0, from the 26.3 `version.json`. */
export const DATA_PACK_FORMAT: PackFormat = [121, 0];

/** An inclusive range of pack formats a pack or overlay supports. */
export interface PackFormatRange {
    min: PackFormat;
    /**
     * The newest supported format. A `max_format` declared as a bare major
     * reads as that whole major, so the minor here is `Number.MAX_SAFE_INTEGER`.
     */
    max: PackFormat;
}

/** One overlay directory with the format range it applies to. */
export interface PackOverlay {
    directory: string;
    formats: PackFormatRange;
}

/** A parsed `pack.mcmeta`. */
export interface PackMcmeta {
    description?: unknown;
    /** The supported format range, when the pack declares one. */
    formats?: PackFormatRange;
    /** Overlay entries in declaration order; a later entry wins over an earlier one. */
    overlays: PackOverlay[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses one format value: a bare major integer or a `[major, minor]` array.
 * A bare major reads with the given minor, so a `max_format` of `121` covers
 * every 121.x when parsed with `Number.MAX_SAFE_INTEGER`.
 */
const parseFormat = (value: unknown, minorForBareMajor: number): PackFormat | undefined => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return [value, minorForBareMajor];
    if (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 0)
    ) {
        return [value[0], value[1]];
    }
    return undefined;
};

/** Compares two formats; negative when `a` is older than `b`, zero when equal. */
export const comparePackFormats = (a: PackFormat, b: PackFormat): number => a[0] - b[0] || a[1] - b[1];

/** Whether the range covers the format, inclusive on both ends. */
export const coversFormat = (range: PackFormatRange, format: PackFormat): boolean =>
    comparePackFormats(range.min, format) <= 0 && comparePackFormats(format, range.max) <= 0;

/** Renders a format as `major.minor` for diagnostics; an open minor renders as `major.x`. */
export const formatToString = (format: PackFormat): string =>
    format[1] === Number.MAX_SAFE_INTEGER ? `${format[0]}.x` : `${format[0]}.${format[1]}`;

/**
 * Reads the supported range from a metadata object: `min_format`/`max_format`
 * when present, otherwise the legacy single `pack_format`.
 */
const parseRange = (meta: Record<string, unknown>): PackFormatRange | undefined => {
    const min = parseFormat(meta.min_format, 0);
    const max = parseFormat(meta.max_format, Number.MAX_SAFE_INTEGER);
    if (min || max) return { min: min ?? max!, max: max ?? min! };

    const packFormat = parseFormat(meta.pack_format, 0);
    if (packFormat) return { min: packFormat, max: [packFormat[0], Number.MAX_SAFE_INTEGER] };

    return undefined;
};

/**
 * Reads one overlay entry's range: `min_format`/`max_format` in the current
 * form, or the legacy `formats` as a bare major, a `[min, max]` major pair, or
 * a `{min_inclusive, max_inclusive}` object.
 */
const parseOverlayRange = (entry: Record<string, unknown>): PackFormatRange | undefined => {
    const current = parseRange(entry);
    if (current) return current;

    const formats = entry.formats;
    if (typeof formats === 'number') return parseRange({ pack_format: formats });
    if (Array.isArray(formats) && formats.length === 2) {
        const range = parseFormat(formats, 0);
        if (range) return { min: [range[0], 0], max: [range[1], Number.MAX_SAFE_INTEGER] };
    }
    if (isRecord(formats)) {
        const min = parseFormat(formats.min_inclusive, 0);
        const max = parseFormat(formats.max_inclusive, Number.MAX_SAFE_INTEGER);
        if (min && max) return { min, max };
    }
    return undefined;
};

/** What {@link parseMcmeta} returns; `mcmeta` is undefined when the file is unusable. */
export interface McmetaParseResult {
    mcmeta?: PackMcmeta;
    diagnostics: Diagnostic[];
}

/**
 * Parses a decoded `pack.mcmeta`. A missing or malformed `pack` block fails
 * the parse; a pack that declares no format at all parses with `formats`
 * undefined and a diagnostic, so the loader can gate it explicitly.
 */
export const parseMcmeta = (data: unknown, pack: string): McmetaParseResult => {
    const diagnostics: Diagnostic[] = [];

    if (!isRecord(data) || !isRecord(data.pack)) {
        return {
            diagnostics: [
                {
                    severity: 'error',
                    code: 'mcmeta.invalid',
                    pack,
                    path: 'pack.mcmeta',
                    message: 'pack.mcmeta must be an object with a pack block'
                }
            ]
        };
    }

    const formats = parseRange(data.pack);
    if (!formats) {
        diagnostics.push({
            severity: 'error',
            code: 'mcmeta.missing-format',
            pack,
            path: 'pack.mcmeta',
            message: 'the pack declares neither min_format/max_format nor pack_format'
        });
    }

    const overlays: PackOverlay[] = [];
    const entries = isRecord(data.overlays) ? data.overlays.entries : undefined;
    if (entries !== undefined) {
        if (!Array.isArray(entries)) {
            diagnostics.push({
                severity: 'error',
                code: 'mcmeta.invalid-overlays',
                pack,
                path: 'pack.mcmeta',
                message: 'overlays.entries must be an array'
            });
        } else {
            for (const entry of entries) {
                const directory = isRecord(entry) ? entry.directory : undefined;
                const range = isRecord(entry) ? parseOverlayRange(entry) : undefined;
                if (typeof directory !== 'string' || !/^[a-z0-9_.-]+$/.test(directory) || !range) {
                    diagnostics.push({
                        severity: 'error',
                        code: 'mcmeta.invalid-overlays',
                        pack,
                        path: 'pack.mcmeta',
                        message: 'each overlay entry needs a plain directory name and a format range'
                    });
                    continue;
                }
                overlays.push({ directory, formats: range });
            }
        }
    }

    return { mcmeta: { description: data.pack.description, formats, overlays }, diagnostics };
};
