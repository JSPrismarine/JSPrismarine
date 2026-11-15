/** Where this package and the shared fetch cache are on disk. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The bedrock-data package directory. */
export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the pinned downloads are cached, one directory per source. */
export const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');
