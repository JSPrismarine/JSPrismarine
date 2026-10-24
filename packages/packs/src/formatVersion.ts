/**
 * A parsed `format_version`, normalized to three numeric parts. Bedrock files
 * write it as a dotted string such as `"1.26.50"` or `"1.10"`, and manifests
 * write versions as `[1, 26, 50]` arrays.
 */
export type FormatVersion = readonly [number, number, number];

/**
 * Parses a version from the three shapes pack files use: a dotted string, an
 * array of numbers, or a bare number. Missing parts read as zero.
 *
 * @returns The normalized version, or undefined when the value has no version shape.
 */
export const parseVersion = (value: unknown): FormatVersion | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return [value, 0, 0];

    if (typeof value === 'string') {
        const parts = value.split('.').map(Number);
        if (parts.length === 0 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0))
            return undefined;
        return [parts[0]!, parts[1] ?? 0, parts[2] ?? 0];
    }

    if (Array.isArray(value) && value.length >= 1 && value.length <= 3) {
        const parts = value.filter((part): part is number => typeof part === 'number');
        if (parts.length !== value.length || parts.some((part) => !Number.isInteger(part) || part < 0))
            return undefined;
        return [parts[0]!, parts[1] ?? 0, parts[2] ?? 0];
    }

    return undefined;
};

/** Compares two versions; negative when `a` is older than `b`, zero when equal. */
export const compareVersions = (a: FormatVersion, b: FormatVersion): number =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Chooses which schema applies to a file: the newest known schema at or below
 * the file's `format_version`. A file older than every known schema reads
 * with the oldest one, which is how the engine treats ancient files.
 *
 * @param known - Schema versions in any order; each must parse with {@link parseVersion}.
 * @returns The chosen entry of `known`.
 */
export const selectSchemaVersion = <Version extends string>(
    known: readonly Version[],
    fileVersion: FormatVersion
): Version => {
    const sorted = [...known].sort((a, b) => compareVersions(parseVersion(a)!, parseVersion(b)!));
    let chosen = sorted[0]!;
    for (const candidate of sorted) {
        if (compareVersions(parseVersion(candidate)!, fileVersion) <= 0) chosen = candidate;
    }
    return chosen;
};
