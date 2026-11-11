import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { bundledManifest, sha256 } from './manifest';
import type { NativeManifest } from './manifest';
import { hasNativeSources, nativeSourceHash } from './nativeHash';
import { operatingSystemOf, platformKey, sharedLibraryName } from './platform';

/** Skips the download, for an install that brings its own library through `JSP_NATIVE_NETWORK_LIBRARY`. */
export const SKIP_DOWNLOAD_ENV = 'JSP_NATIVE_NETWORK_SKIP_DOWNLOAD';
/** Downloads from another release host or a directory, such as a mirror or a test's fixtures. */
export const BASE_URL_ENV = 'JSP_NATIVE_NETWORK_BASE_URL';

/** What an install did. */
export type InstallOutcome =
    | { readonly kind: 'installed'; readonly path: string; readonly bytes: number }
    | { readonly kind: 'present'; readonly path: string }
    | { readonly kind: 'no-build'; readonly platform: string }
    | { readonly kind: 'skipped' }
    | { readonly kind: 'local-sources'; readonly sourceHash: string };

/** How {@link installBuild} finds and fetches the build; tests replace the network and the platform. */
export interface InstallOptions {
    readonly packageDir: string;
    readonly platform?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetch?: (url: string) => Promise<Response>;
    readonly manifest?: NativeManifest;
}

/**
 * Where the build for a platform is installed in the package.
 * @param packageDir - The package's directory.
 * @param platform - The platform key.
 * @returns The library's path.
 */
export const installedLibraryPath = (packageDir: string, platform: string): string =>
    join(packageDir, 'prebuilds', platform, sharedLibraryName(operatingSystemOf(platform)));

const readSource = async (
    base: string,
    file: string,
    fetchImpl: (url: string) => Promise<Response>
): Promise<Uint8Array> => {
    // A base that is not a URL is a directory, as a test or an offline mirror gives.
    if (!/^[a-z]+:\/\//i.test(base)) return readFileSync(join(base, file));
    const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(file)}`;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
};

/**
 * Downloads the build for this machine into the package, once, and checks its SHA-256 against
 * the manifest. It is what the package's `postinstall` runs; loading the library never downloads.
 * @param options - The package and, for tests, the platform, environment and network.
 * @returns What it did.
 * @throws {Error} When the download fails or its digest or size differ from the manifest's.
 */
export const installBuild = async (options: InstallOptions): Promise<InstallOutcome> => {
    const env = options.env ?? process.env;
    if (env[SKIP_DOWNLOAD_ENV] === '1') return { kind: 'skipped' };
    const packageDir = resolve(options.packageDir);
    const manifest = options.manifest ?? bundledManifest();
    const platform = options.platform ?? platformKey();

    // A checkout whose native sources changed since the published builds builds its own.
    if (hasNativeSources(packageDir)) {
        const sourceHash = nativeSourceHash(packageDir);
        if (sourceHash !== manifest.build) return { kind: 'local-sources', sourceHash };
    }

    const entry = manifest.platforms[platform];
    if (entry === undefined) return { kind: 'no-build', platform };

    const path = installedLibraryPath(packageDir, platform);
    if (existsSync(path) && sha256(readFileSync(path)) === entry.shared.sha256) return { kind: 'present', path };

    const bytes = await readSource(env[BASE_URL_ENV] || manifest.baseUrl, entry.shared.file, options.fetch ?? fetch);
    const digest = sha256(bytes);
    if (digest !== entry.shared.sha256 || bytes.byteLength !== entry.shared.bytes) {
        throw new Error(
            `${entry.shared.file} has SHA-256 ${digest} and ${bytes.byteLength} bytes; the manifest expects ${entry.shared.sha256} and ${entry.shared.bytes}`
        );
    }
    mkdirSync(dirname(path), { recursive: true });
    // Written beside the target and renamed, so a failed install never leaves half a library.
    const partial = `${path}.${process.pid}.part`;
    try {
        writeFileSync(partial, bytes);
        renameSync(partial, path);
    } finally {
        rmSync(partial, { force: true });
    }
    return { kind: 'installed', path, bytes: bytes.byteLength };
};
