import fs from 'node:fs';
import path from 'node:path';

import pkg from '../../package.json' with { type: 'json' };
import { parseConfigDocument } from './ConfigDocument';
import type { ConfigDocument } from './ConfigDocument';

const SCHEMA_FILE_BY_CONFIG = new Map([
    ['config.json', 'config.schema.json'],
    ['permissions.json', 'permissions.schema.json'],
    ['ops.json', 'ops.schema.json'],
    ['banned-players.json', 'banned-players.schema.json'],
    ['level.json', 'level.schema.json']
]);
const ARRAY_SCHEMA_COMMENT = /^[\t ]*\/\/ JSPrismarine schema:.*(?:\r?\n|$)/gm;

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
        : `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/${schemaFile}`;
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
 * ban list, the operators, each world's level data. They are rewritten by the server, and
 * going through a document keeps whatever a person added to them by hand.
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
    return parseConfigDocument('json', text.trim() === '' ? empty : text);
};

/**
 * Writes a document back to its file, adding its versioned schema reference when it is a
 * runtime-owned JSON file. The file is flushed so a crash right after does not lose it.
 */
export const writeJsonFile = async (filePath: string, document: ConfigDocument): Promise<void> => {
    await fs.promises.writeFile(filePath, toJsonFileContents(filePath, document), {
        encoding: 'utf8',
        flush: true
    });
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
