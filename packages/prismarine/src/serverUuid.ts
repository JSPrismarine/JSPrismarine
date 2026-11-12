import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { withCwd } from './utils/cwd';
import { isUuid } from './utils/isUuid';

/** The file in the server's data directory that holds its UUID. The docs quote it. */
export const SERVER_UUID_FILE = 'server-uuid.txt';

/** The file's text without surrounding whitespace, or undefined when it cannot be read. */
const readText = (file: string): string | undefined => {
    try {
        return fs.readFileSync(file, 'utf8').trim();
    } catch {
        return undefined;
    }
};

/**
 * Reads the server's UUID from `file`, or makes a random one and writes it there. Anything that
 * counts servers, such as bStats, sees this server once by it.
 *
 * The UUID has a file of its own rather than a key in `config.json`, so a config copied from
 * another server or mounted read-only, such as from a Kubernetes ConfigMap, neither shares
 * another server's UUID nor loses its own. A file that holds anything but a UUID gets a fresh one.
 * @param file - The file to read and write. {@link SERVER_UUID_FILE} in the data directory by default.
 * @returns The UUID as the file spells it, or undefined when there was none and the file could
 * not be written, since a UUID that changes on every start would count the server more than once.
 */
export const loadOrCreateServerUuid = (file: string = withCwd(SERVER_UUID_FILE)): string | undefined => {
    const stored = readText(file);
    if (isUuid(stored)) return stored;
    const fresh = randomUUID();
    try {
        fs.writeFileSync(file, `${fresh}\n`);
        return fresh;
    } catch {
        return undefined;
    }
};
