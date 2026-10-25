import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

import { compareVersions, parseVersion } from './formatVersion';
import type { FormatVersion } from './formatVersion';

/**
 * Reads Mojang's `metadata/json_schemas` tree out of a bedrock-samples
 * checkout. The schemas are JSON Schema draft-07 with Mojang's `x-` extension
 * keywords, organized by area and then by format version, and each one
 * declares its own path as `$id`, so the tree is its own `$ref` namespace.
 *
 * The schemas are read from disk rather than bundled, because
 * `bedrock-samples/LICENSE.md` reserves all rights. This package ships the
 * reader and leaves the files where
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` puts them.
 */

/** Where the schemas live inside a bedrock-samples checkout. */
const SCHEMA_SUBDIRECTORY = join('metadata', 'json_schemas');

/** One schema document, keyed in a {@link BedrockSchemaSet} by its `$id`. */
export type BedrockSchema = Readonly<Record<string, unknown>>;

/** One format-version directory that holds a given document. */
export interface DocumentVersion {
    /** The parsed directory name, such as 1.26.50. */
    version: FormatVersion;
    /** The `$id` of the document in that directory. */
    id: string;
}

/** The schemas read off disk, indexed the two ways the validator needs them. */
export interface BedrockSchemaSet {
    /** Every schema by its `$id`, which is its path under `json_schemas` with spaces percent-encoded. */
    readonly byId: ReadonlyMap<string, BedrockSchema>;
    /**
     * The format-version directories that hold a given document, oldest
     * first. Keyed by the document's path with the version directory removed,
     * such as `server/entity/ActorDocument.json`.
     */
    readonly versionsByDocument: ReadonlyMap<string, readonly DocumentVersion[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every `.json` file under a directory, as paths relative to it, `/`-separated. */
const schemaFilesUnder = (root: string): string[] =>
    readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) =>
            join(entry.parentPath, entry.name)
                .slice(root.length + 1)
                .split(sep)
                .join('/')
        );

/**
 * Mojang's `$id` for a schema path: the path from `json_schemas`, leading
 * slash included, with each segment percent-encoded the way the files
 * themselves write it, so `$ref`s between them resolve.
 */
const idForPath = (path: string): string => `/${path.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Reads every schema under a bedrock-samples checkout.
 *
 * @param root - The checkout root, or the `metadata/json_schemas` directory itself.
 * @returns The schemas indexed by `$id` and by document name per format version.
 * @throws {Error} When the directory holds no schemas.
 */
export const readBedrockSchemas = (root: string): BedrockSchemaSet => {
    const base = statSync(join(root, SCHEMA_SUBDIRECTORY), { throwIfNoEntry: false })?.isDirectory()
        ? join(root, SCHEMA_SUBDIRECTORY)
        : root;

    const byId = new Map<string, BedrockSchema>();
    const versionsByDocument = new Map<string, DocumentVersion[]>();

    for (const path of schemaFilesUnder(base)) {
        // Parsed JSON carries no type, so the record shape is checked here.
        const parsed: unknown = JSON.parse(readFileSync(join(base, ...path.split('/')), 'utf8'));
        if (!isRecord(parsed)) continue;

        // A schema's own `$id` is the base its `$ref`s resolve against, so the
        // path on disk only fills in for a file that omits it.
        const id = typeof parsed.$id === 'string' ? parsed.$id : idForPath(path);
        byId.set(id, parsed);

        // The version directory is the one above the document. `beta` and
        // `legacy` parse as no version and index nothing, which keeps them
        // out of selection while leaving them reachable through `$ref`.
        const segments = path.split('/');
        const version = parseVersion(segments.at(-2));
        if (segments.length < 3 || !version) continue;

        const key = [...segments.slice(0, -2), segments.at(-1)!].join('/');
        const versions = versionsByDocument.get(key) ?? [];
        versions.push({ version, id });
        versionsByDocument.set(key, versions);
    }

    if (byId.size === 0) throw new Error(`no bedrock-samples schemas under ${base}`);

    for (const versions of versionsByDocument.values()) versions.sort((a, b) => compareVersions(a.version, b.version));

    return { byId, versionsByDocument };
};

/**
 * Picks the schema a file's `format_version` selects, by Mojang's own
 * disambiguation rule: the same version, or the closest one that is not
 * greater. A file older than every published schema selects none, because
 * checking it against a newer schema would report fields that did not exist
 * when the file was written.
 *
 * @param document - The document key, such as `server/entity/ActorDocument.json`.
 * @returns The `$id` of the selected document, or undefined when none applies.
 */
export const selectSchema = (
    schemas: BedrockSchemaSet,
    document: string,
    formatVersion: FormatVersion | undefined
): string | undefined => {
    const versions = schemas.versionsByDocument.get(document);
    if (!versions || !formatVersion) return undefined;

    let selected: DocumentVersion | undefined;
    for (const candidate of versions) {
        if (compareVersions(candidate.version, formatVersion) > 0) break;
        selected = candidate;
    }
    return selected?.id;
};
