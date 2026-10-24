import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const listFiles = async (dir: string, prefix = ''): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
            files.push(...(await listFiles(join(dir, entry.name), relative)));
        } else if (entry.isFile()) {
            files.push(relative);
        }
    }
    return files;
};

/**
 * Computes a sha256 digest of a directory's contents: every regular file,
 * sorted by its `/`-separated relative path, hashed as the NUL-terminated
 * path followed by the file bytes. The digest changes when any file is
 * added, removed, renamed or edited, and is stable across platforms and
 * directory listing order. Symlinks and other non-regular entries are
 * ignored.
 */
export const hashFolder = async (dir: string): Promise<string> => {
    const files = (await listFiles(dir)).sort();
    const hash = createHash('sha256');
    for (const relative of files) {
        hash.update(relative);
        hash.update('\0');
        for await (const chunk of createReadStream(join(dir, relative))) {
            hash.update(chunk);
        }
    }
    return hash.digest('hex');
};
