import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import manifestJson from '../native/manifest.json' with { type: 'json' };
import { isRecord } from './isRecord';

/** One published file: its name in the release, its size and its SHA-256. */
export interface ManifestFile {
    readonly file: string;
    readonly bytes: number;
    readonly sha256: string;
}

/** One platform's builds: the shared library the runtimes load, and the scriptc archive. */
export interface ManifestPlatform {
    readonly shared: ManifestFile;
    readonly static?: ManifestFile;
}

/** The builds a version of the package downloads, from `native/manifest.json`. */
export interface NativeManifest {
    /** The native sources' hash the builds were made from; empty before the first publish. */
    readonly build: string;
    /** Where the files are: a release's download URL, joined with each file's name. */
    readonly baseUrl: string;
    readonly platforms: Readonly<Record<string, ManifestPlatform>>;
}

const isFile = (value: unknown): value is ManifestFile =>
    isRecord(value) &&
    typeof value.file === 'string' &&
    typeof value.bytes === 'number' &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256);

/**
 * Checks parsed JSON against the manifest's shape.
 * @param value - The parsed file.
 * @returns The manifest.
 * @throws {Error} When a field is missing or of the wrong type.
 */
export const parseManifest = (value: unknown): NativeManifest => {
    if (!isRecord(value) || typeof value.build !== 'string' || typeof value.baseUrl !== 'string') {
        throw new Error('The native manifest needs `build` and `baseUrl` strings');
    }
    const platforms = isRecord(value.platforms) ? value.platforms : {};
    const checked: Record<string, ManifestPlatform> = {};
    for (const [key, platform] of Object.entries(platforms)) {
        if (
            !isRecord(platform) ||
            !isFile(platform.shared) ||
            (platform.static !== undefined && !isFile(platform.static))
        ) {
            throw new Error(`The native manifest's entry for ${key} is malformed`);
        }
        checked[key] = { shared: platform.shared, ...(isFile(platform.static) ? { static: platform.static } : {}) };
    }
    return { build: value.build, baseUrl: value.baseUrl, platforms: checked };
};

/**
 * Reads a package's manifest from disk, as a script that rewrote it does.
 * @param packageDir - The package's directory.
 * @returns The manifest.
 */
export const readManifest = (packageDir: string): NativeManifest =>
    parseManifest(JSON.parse(readFileSync(join(packageDir, 'native', 'manifest.json'), 'utf8')));

/**
 * The manifest this package was built with. It is imported, not read from disk, so a bundled
 * executable carries it.
 */
export const bundledManifest = (): NativeManifest => parseManifest(manifestJson);

/**
 * The SHA-256 of bytes, as lowercase hex.
 * @param bytes - The bytes.
 * @returns The digest.
 */
export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
