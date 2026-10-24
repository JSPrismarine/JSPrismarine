import fs from 'node:fs';

import { parseConfigDocument } from './ConfigDocument';
import type { ConfigDocument } from './ConfigDocument';

/**
 * Reads a JSON data file the server owns into a document it can edit in place.
 *
 * For the files beside `config.yaml` that hold lists or records rather than settings: the
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
 * Writes a document back to its file, flushed, so a crash right after does not lose it.
 */
export const writeJsonFile = async (filePath: string, document: ConfigDocument): Promise<void> => {
    await fs.promises.writeFile(filePath, document.toString(), { encoding: 'utf8', flush: true });
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
