import { createHash } from 'node:crypto';

import manifestJson from '../native/manifest.json' with { type: 'json' };
import { isRecord } from './isRecord';
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** One published file: its name in the release, its size and its SHA-256. */
export interface ManifestFile {
    readonly file: string;
    readonly bytes: number;
    readonly sha256: string;
}

/** One platform's build: the shared library `node:ffi` loads. */
export interface ManifestPlatform {
    readonly shared: ManifestFile;
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
        throw new ScriptHostErrors.InvalidNativeManifest();
    }
    const platforms = isRecord(value.platforms) ? value.platforms : {};
    const checked: Record<string, ManifestPlatform> = {};
    for (const [key, platform] of Object.entries(platforms)) {
        if (!isRecord(platform) || !isFile(platform.shared)) {
            throw new ScriptHostErrors.InvalidNativeManifestEntry({ key });
        }
        checked[key] = { shared: platform.shared };
    }
    return { build: value.build, baseUrl: value.baseUrl, platforms: checked };
};

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
