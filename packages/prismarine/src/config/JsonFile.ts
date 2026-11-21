import fs from 'node:fs';
import path from 'node:path';

import { buildStamp, serverVersion } from '../version';
import { parseConfigDocument } from './ConfigDocument';
import type { ConfigDocument } from './ConfigDocument';

const SCHEMA_FILE_BY_CONFIG = new Map([
    ['config.json', 'config.schema.json'],
    ['permissions.json', 'permissions.schema.json'],
    ['ops.json', 'ops.schema.json'],
    ['banned-players.json', 'banned-players.schema.json']
]);
const ARRAY_SCHEMA_COMMENT = /^[\t ]*\/\/ JSPrismarine schema:.*(?:\r?\n|$)/gm;

const schemaVersion = (): string => {
    // A nightly executable's version is not on npm; an npm snapshot's own version is.
    if (buildStamp() === 'nightly') return 'unstable';
    return serverVersion();
};

const schemaUrlFor = (filePath: string): string | undefined => {
    const normalized = path.normalize(filePath);
    const parts = normalized.split(path.sep);
    const fileName = parts.at(-1);
    let schemaFile: string | undefined;
    if (parts.at(-2) === 'playerdata' && fileName?.endsWith('.json')) {
        schemaFile = 'player-data.schema.json';
    } else if (fileName !== undefined) {
        schemaFile = SCHEMA_FILE_BY_CONFIG.get(fileName);
    }

    return schemaFile === undefined
        ? undefined
        : `https://unpkg.com/@jsprismarine/prismarine@${schemaVersion()}/schemas/${schemaFile}`;
};

const withArraySchemaComment = (text: string, url: string): string =>
    `// JSPrismarine schema: ${url}\n${text.replace(ARRAY_SCHEMA_COMMENT, '')}`;

/**
 * Serializes a JSON config document with its package-versioned schema reference when it is a
 * runtime-owned file.
 * @param filePath - The JSON config's path.
 * @param document - The document to serialize.
 * @returns JSONC text, including the schema reference for recognized runtime files.
 */
export const toJsonFileContents = (filePath: string, document: ConfigDocument): string => {
    const schemaUrl = schemaUrlFor(filePath);
    const root = document.get([]);
    if (schemaUrl !== undefined && !Array.isArray(root) && typeof root === 'object' && root !== null) {
        document.set(['$schema'], schemaUrl);
    }

    const content = document.toString();
    return schemaUrl !== undefined && Array.isArray(root) ? withArraySchemaComment(content, schemaUrl) : content;
};

/**
 * Reads a JSON data file the server owns into a document it can edit in place.
 *
 * For the files beside `config.json` that hold lists or records rather than settings: the
 * ban list, the operators, and player data. They are rewritten by the server, and going
 * through a document keeps whatever a person added to them by hand.
 *
 * @param filePath - Where the file is.
 * @param empty - What a missing file reads as: `[]` for a list, `{}` for a record.
 * @throws ConfigSyntaxError when the file exists but does not parse.
 */
export const readJsonFile = async (filePath: string, empty: '[]' | '{}'): Promise<ConfigDocument> => {
    let text: string;
    try {
        text = await fs.promises.readFile(filePath, 'utf8');
    } catch (error: unknown) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        text = empty;
    }
    return parseConfigDocument(text.trim() === '' ? empty : text);
};

/** Where {@link writeJsonFile} stages a file before it is renamed into place. */
export const temporaryPathOf = (filePath: string): string => `${filePath}.tmp`;

/** The mode a file the server makes gets, the one its other files get under the usual umask. */
export const NEW_FILE_MODE = 0o644;

/** The mode a staged file starts with: readable by the server's user alone until it takes the file's own. */
const STAGING_MODE = 0o600;

/** The permission bits of the file at `filePath`, or those of a new file when there is none. */
const modeToKeep = async (filePath: string): Promise<number> => {
    try {
        return (await fs.promises.stat(filePath)).mode & 0o777;
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return NEW_FILE_MODE;
        throw error;
    }
};

/**
 * Writes a document back to its file, adding its versioned schema reference when it is a
 * runtime-owned JSON file. The text goes to a temporary file beside it, flushed, and is renamed
 * over the file only then, so a crash or a full disk mid-write leaves the file as it was and a
 * reader never sees half of the new text. The temporary file starts readable by the server's
 * user alone and takes the file's own mode before the rename, so a file the owner made private
 * stays private.
 * @returns The text written.
 */
export const writeJsonFile = async (filePath: string, document: ConfigDocument): Promise<string> => {
    const temporary = temporaryPathOf(filePath);
    const text = toJsonFileContents(filePath, document);
    try {
        await fs.promises.writeFile(temporary, text, { encoding: 'utf8', flush: true, mode: STAGING_MODE });
        await fs.promises.chmod(temporary, await modeToKeep(filePath));
        await fs.promises.rename(temporary, filePath);
    } catch (error: unknown) {
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        throw error;
    }
    return text;
};

/** The list a document holds at its root, or none when the root is something else. */
const listOf = (document: ConfigDocument): unknown[] | undefined => {
    const root = document.get([]);
    return Array.isArray(root) ? root : undefined;
};

/**
 * Replaces the first list entry `matches` accepts with `value`, or appends `value` when
 * none does. The rest of the list, comments included, is left as it is.
 *
 * @param comment - Written above the entry when it is appended.
 */
export const upsertListEntry = (
    document: ConfigDocument,
    matches: (entry: unknown) => boolean,
    value: unknown,
    comment?: string
): void => {
    const list = listOf(document) ?? [];
    const index = list.findIndex(matches);
    document.set([index === -1 ? list.length : index], value, comment);
};

/**
 * Removes every list entry `matches` accepts.
 *
 * @returns Whether anything was removed.
 */
export const removeListEntries = (document: ConfigDocument, matches: (entry: unknown) => boolean): boolean => {
    const list = listOf(document) ?? [];
    let removed = false;
    // Back to front, so an earlier removal does not shift the indices still to be visited.
    for (let index = list.length - 1; index >= 0; index--) {
        if (matches(list[index])) removed = document.delete([index]) || removed;
    }
    return removed;
};
