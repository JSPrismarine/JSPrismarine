import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deserialize, serialize } from 'node:v8';
import packsManifest from '../package.json' with { type: 'json' };

import type { Diagnostic } from './diagnostics';
import { JAVA_REGISTRY_IDS } from './javaRegistries';
import type { Definition, Definitions, LoadResult } from './load';
import type { PackStack } from './sources';
import { REGISTRY_IDS } from './registries';
import { isRecord } from './isRecord';

/** Identifies the vanilla source prefix to cache while the rest of the stack stays live. */
export interface PrefixCacheOptions {
    /** File that holds the serialized prefix. The loader replaces it when the key changes. */
    readonly filePath: string;
    /** Number of leading stack sources that make up the immutable prefix. */
    readonly prefixLength: number;
    /** Hash of mutable overlay contents and any other caller-owned cache inputs. */
    readonly fingerprint: string;
    /** Stable identifier for the validator used to build the cached definitions. */
    readonly validatorKey: string;
}

/** Result of reading one composed prefix cache file. */
export type PrefixCacheRead =
    | { readonly status: 'hit'; readonly result: LoadResult }
    | { readonly status: 'miss' }
    | { readonly status: 'corrupt'; readonly error: unknown };

interface PrefixCacheFile {
    readonly formatVersion: number;
    readonly key: string;
    readonly result: LoadResult;
}

const FORMAT_VERSION = 1;
const packageManifest: unknown = packsManifest;

const packageVersion = (): string => {
    if (isRecord(packageManifest) && typeof packageManifest.version === 'string') return packageManifest.version;
    throw new Error('packages/packs/package.json has no string version');
};

const PACKS_VERSION = packageVersion();
const registryIds = [...REGISTRY_IDS, ...JAVA_REGISTRY_IDS];

const isDefinition = (value: unknown, registry: string, identifier: string): value is Definition =>
    isRecord(value) &&
    value.identifier === identifier &&
    value.registry === registry &&
    typeof value.pack === 'string' &&
    typeof value.path === 'string' &&
    'data' in value;

const isDefinitions = (value: unknown): value is Definitions => {
    if (!isRecord(value)) return false;

    return registryIds.every((registry) => {
        const definitions = value[registry];
        if (!(definitions instanceof Map)) return false;
        for (const [identifier, definition] of definitions) {
            if (typeof identifier !== 'string' || !isDefinition(definition, registry, identifier)) return false;
        }
        return true;
    });
};

const isDiagnostic = (value: unknown): value is Diagnostic =>
    isRecord(value) &&
    (value.severity === 'error' || value.severity === 'warning') &&
    typeof value.code === 'string' &&
    typeof value.pack === 'string' &&
    typeof value.message === 'string' &&
    (value.path === undefined || typeof value.path === 'string') &&
    (value.occurrences === undefined || Number.isSafeInteger(value.occurrences)) &&
    (value.paths === undefined ||
        (Array.isArray(value.paths) && value.paths.every((path) => typeof path === 'string')));

const isLoadResult = (value: unknown): value is LoadResult =>
    isRecord(value) &&
    isDefinitions(value.definitions) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isDiagnostic);

const isPrefixCacheFile = (value: unknown): value is PrefixCacheFile =>
    isRecord(value) &&
    Number.isSafeInteger(value.formatVersion) &&
    typeof value.key === 'string' &&
    isLoadResult(value.result);

/**
 * Keys a cache by the package version, the resolved prefix sources, validator, and caller fingerprint.
 *
 * @param packageVersionOverride - A test seam for proving version changes invalidate a cache key.
 */
export const prefixCacheKeyFor = (
    stack: PackStack,
    options: PrefixCacheOptions,
    packageVersionOverride = PACKS_VERSION
): string => {
    if (
        !Number.isSafeInteger(options.prefixLength) ||
        options.prefixLength < 1 ||
        options.prefixLength > stack.length
    ) {
        throw new RangeError(`cache prefix length ${options.prefixLength} is outside the pack stack`);
    }

    const sources = stack.slice(0, options.prefixLength).map((source) => ({ ...source, path: resolve(source.path) }));
    return createHash('sha256')
        .update(
            JSON.stringify({
                formatVersion: FORMAT_VERSION,
                packageVersion: packageVersionOverride,
                sources,
                fingerprint: options.fingerprint,
                validatorKey: options.validatorKey
            })
        )
        .digest('hex');
};

/** Reads a serialized prefix, distinguishing a stale key from a corrupt file. */
export const readPrefixCache = (filePath: string, key: string): PrefixCacheRead => {
    if (!existsSync(filePath)) return { status: 'miss' };

    try {
        const decoded: unknown = deserialize(readFileSync(filePath));
        if (!isPrefixCacheFile(decoded)) return { status: 'corrupt', error: new Error('invalid cache shape') };
        if (decoded.formatVersion !== FORMAT_VERSION || decoded.key !== key) return { status: 'miss' };
        return { status: 'hit', result: decoded.result };
    } catch (error) {
        return existsSync(filePath) ? { status: 'corrupt', error } : { status: 'miss' };
    }
};

/** Atomically replaces the one-file cache so an interrupted write cannot poison the next boot. */
export const writePrefixCache = (filePath: string, key: string, result: LoadResult): void => {
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    mkdirSync(dirname(filePath), { recursive: true });
    try {
        writeFileSync(
            temporaryPath,
            serialize({ formatVersion: FORMAT_VERSION, key, result } satisfies PrefixCacheFile),
            {
                flag: 'wx'
            }
        );
        renameSync(temporaryPath, filePath);
    } finally {
        if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
};
