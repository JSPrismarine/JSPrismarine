import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';

/**
 * The default Java release `packages/bedrock-data/sources.json` pins, such as `26.3`. The cache
 * keeps a directory per release, so a suite that reads the default one reads the data the server
 * runs rather than whichever release the file system lists first.
 */
export const defaultJavaRelease: string = javaServerCacheFolder;

/**
 * The two cache folders a Java server jar lands in. `fetch:sources` writes `java-server/<release>/`
 * and verifies its hash, so it comes first; the Java dump and oracle scripts download their own
 * copy to `java/<release>/`.
 */
const SERVER_JAR_SOURCES = ['java-server', 'java'] as const;

/** A cached Java server jar and the release it belongs to. */
export interface CachedJavaServerJar {
    readonly version: string;
    readonly path: string;
}

const jarIn = (cacheRoot: string, source: string, version: string): CachedJavaServerJar | undefined => {
    const path = join(cacheRoot, source, version, 'server.jar');
    return existsSync(path) ? { version, path } : undefined;
};

/**
 * Finds a cached Java server jar, the default release's first.
 *
 * Both cache folders are searched for the default release before either is searched for another
 * one, so a cache holding a preview in one folder and the default in the other reads the default.
 *
 * @param cacheRoot - The `node_modules/.cache/jsprismarine` directory.
 * @param options.fallback - Whether another release may stand in when the default's jar is not
 *   cached. Defaults to true. A suite whose assertions are written for the default release passes
 *   false, so it fails rather than checking another release's data under the default's name.
 * @throws {Error} When no usable jar is cached.
 */
export const findJavaServerJar = (
    cacheRoot: string,
    { fallback = true }: { readonly fallback?: boolean } = {}
): CachedJavaServerJar => {
    for (const source of SERVER_JAR_SOURCES) {
        const jar = jarIn(cacheRoot, source, defaultJavaRelease);
        if (jar !== undefined) return jar;
    }
    if (fallback) {
        for (const source of SERVER_JAR_SOURCES) {
            const root = join(cacheRoot, source);
            if (!existsSync(root)) continue;
            for (const version of readdirSync(root)) {
                const jar = jarIn(cacheRoot, source, version);
                if (jar !== undefined) return jar;
            }
        }
    }
    throw new Error(
        `no Java ${fallback ? '' : `${defaultJavaRelease} `}server.jar under ${cacheRoot}; run the bedrock-data fetch:sources script`
    );
};
