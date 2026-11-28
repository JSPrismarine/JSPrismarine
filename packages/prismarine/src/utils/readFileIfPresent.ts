import { readFile } from 'node:fs/promises';

import { hasErrorCode } from './hasErrorCode';

/**
 * A file's bytes, or undefined when the file does not exist. Any other failure to read it throws.
 * @param file - The file's path.
 */
export const readFileIfPresent = async (file: string): Promise<Uint8Array | undefined> => {
    try {
        return new Uint8Array(await readFile(file));
    } catch (error: unknown) {
        if (hasErrorCode(error, 'ENOENT')) return undefined;
        throw error;
    }
};
