/**
 * Loads `@jsprismarine/leveldb`, the one workspace package the capture job needs at runtime.
 *
 * Workspace consumers get that package's TypeScript sources, and those sources import each
 * other without file extensions. A bundler resolves that and plain Node does not, so the
 * capture job cannot load the package the way Vitest does. This module tries the package
 * first, which is what happens under Vitest, and falls back to the built bundle, which is what
 * happens when `node utils/bedrock-dump/run.ts` runs the job after `pnpm run build`.
 *
 * The NBT reading the save needs is in `reader.ts` rather than `@jsprismarine/nbt` for the same
 * reason, with no fallback available: that package reaches `@jsprismarine/binaryutils` through
 * a bare specifier, which no built bundle resolves either.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type * as LevelDb from '@jsprismarine/leveldb';

const require = createRequire(import.meta.url);

const load = async (): Promise<typeof LevelDb> => {
    try {
        return await import('@jsprismarine/leveldb');
    } catch {
        const bundle = join(dirname(require.resolve('@jsprismarine/leveldb/package.json')), 'dist', 'index.es.js');
        if (!existsSync(bundle)) {
            throw new Error(
                '@jsprismarine/leveldb is not built and plain Node cannot load its sources. ' +
                    'Run `pnpm run build` first.'
            );
        }
        // Loaded by path, so the compiler cannot see this is the module the type import describes.
        return (await import(pathToFileURL(bundle).href)) as typeof LevelDb;
    }
};

/** The LevelDB reader a saved Bedrock world is opened with. */
export const Database = (await load()).Database;
