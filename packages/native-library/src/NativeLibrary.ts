import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { NativeLibraryErrors } from '@jsprismarine/errors/native-library';

import { isRecord } from './isRecord';
import { parseManifest, sha256 } from './manifest';
import type { NativeManifest } from './manifest';
import { hasNativeSources, nativeSourceHash } from './nativeHash';
import { installedLibraryFile, namingAnswers, platformKey, sharedLibraryFile, staticLibraryFile } from './platform';

/** What a package that ships a native library tells {@link NativeLibrary} about it. */
export interface NativeLibraryOptions {
    /** The npm name, as the messages tell a user to approve or build it. */
    readonly packageName: string;
    /** The library's file name without its extension, such as `libjsp_native_network`. */
    readonly library: string;
    /**
     * The prefix of the package's environment variables, such as `JSP_NATIVE_NETWORK`: `_LIBRARY`
     * names a library to load, `_SKIP_DOWNLOAD` skips the install's download, and `_BASE_URL`
     * downloads from a mirror.
     */
    readonly envPrefix: string;
    /** The package's root, which holds `native/` in a checkout and `prebuilds/` once installed. */
    readonly packageDir: string;
    /**
     * The package's `native/manifest.json`, as imported JSON. It is imported rather than read from
     * disk, so a bundled executable carries it.
     */
    readonly manifest: unknown;
    /** The files outside `native/` the package's build reads, which its source hash covers. */
    readonly buildScripts: readonly string[];
}

/** How {@link NativeLibrary.locate} looks; tests replace each part. */
export interface LocateOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly packageDir?: string;
    readonly platform?: string;
    readonly manifest?: NativeManifest;
}

/** What an install did. */
export type InstallOutcome =
    | { readonly kind: 'installed'; readonly path: string; readonly bytes: number }
    | { readonly kind: 'present'; readonly path: string }
    | { readonly kind: 'no-build'; readonly platform: string }
    | { readonly kind: 'skipped' }
    | { readonly kind: 'local-sources'; readonly sourceHash: string };

/** How {@link NativeLibrary.install} finds and fetches the build; tests replace the network and the platform. */
export interface InstallOptions {
    readonly packageDir: string;
    readonly platform?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetch?: (url: string) => Promise<Response>;
    readonly manifest?: NativeManifest;
}

/** The report `build:native` writes beside a local build, which records the build's digest. */
const buildReportOf = (path: string): string => join(dirname(path), 'build.json');

/**
 * The digest a local build recorded in the `build.json` beside it, which `build:native` writes.
 * @param path - The library file.
 * @returns The digest, or undefined when there is no readable record.
 */
export const localBuildDigest = (path: string): string | undefined => {
    const report = buildReportOf(path);
    if (!existsSync(report)) return undefined;
    try {
        const parsed: unknown = JSON.parse(readFileSync(report, 'utf8'));
        const shared = isRecord(parsed) && isRecord(parsed.shared) ? parsed.shared : undefined;
        return typeof shared?.sha256 === 'string' ? shared.sha256 : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Records a library's digest in a `build.json` beside it, as `build:native` does, so that
 * {@link NativeLibrary.verify} accepts the file. Only for bytes that were checked before they were
 * written there, such as a library an executable embedded.
 * @param path - The library file.
 * @param digest - Its SHA-256.
 */
export const recordLocalBuild = (path: string, digest: string): void => {
    writeFileSync(buildReportOf(path), `${JSON.stringify({ shared: { sha256: digest } }, null, 4)}\n`);
};

/** Writes bytes beside the target and renames them over it, so a failure never leaves half a library. */
const writeWhole = (path: string, bytes: Uint8Array): void => {
    mkdirSync(dirname(path), { recursive: true });
    const partial = `${path}.${process.pid}.part`;
    try {
        writeFileSync(partial, bytes);
        renameSync(partial, path);
    } finally {
        rmSync(partial, { force: true });
    }
};

/** A URL without the slashes it ends in, trimmed by index: a regular expression would backtrack on a long run of them. */
const withoutTrailingSlashes = (url: string): string => {
    let end = url.length;
    while (end > 0 && url[end - 1] === '/') end--;
    return url.slice(0, end);
};

const readSource = async (
    base: string,
    file: string,
    fetchImpl: (url: string) => Promise<Response>
): Promise<Uint8Array> => {
    // A base that is not a URL is a directory, as a test or an offline mirror gives.
    if (!/^[a-z]+:\/\//i.test(base)) return readFileSync(join(base, file));
    const url = `${withoutTrailingSlashes(base)}/${encodeURIComponent(file)}`;
    const response = await fetchImpl(url);
    if (!response.ok) throw new NativeLibraryErrors.DownloadFailed({ url, status: response.status });
    return new Uint8Array(await response.arrayBuffer());
};

/**
 * One package's prebuilt native library: where it is installed, how a release publishes it, and
 * how it is found and checked before a runtime loads it.
 *
 * A release attaches a build for each platform to a GitHub release, and the package's
 * `native/manifest.json` records each file's SHA-256. The package's install script downloads the
 * build for the machine; loading only finds the file and checks its digest, and never downloads.
 */
export class NativeLibrary {
    /** The npm name. */
    public readonly packageName: string;
    /** The library's file name without its extension. */
    public readonly library: string;
    /** The package's root. */
    public readonly packageDir: string;
    /** Names a library file to load in place of the installed build. */
    public readonly libraryEnv: string;
    /** Skips the install's download, for an install that brings its own library. */
    public readonly skipDownloadEnv: string;
    /** Downloads from another release host or a directory, such as a mirror or a test's fixtures. */
    public readonly baseUrlEnv: string;

    private readonly manifestJson: unknown;
    private readonly buildScripts: readonly string[];
    private manifest: NativeManifest | undefined;

    public constructor(options: NativeLibraryOptions) {
        this.packageName = options.packageName;
        this.library = options.library;
        this.packageDir = options.packageDir;
        this.libraryEnv = `${options.envPrefix}_LIBRARY`;
        this.skipDownloadEnv = `${options.envPrefix}_SKIP_DOWNLOAD`;
        this.baseUrlEnv = `${options.envPrefix}_BASE_URL`;
        this.manifestJson = options.manifest;
        this.buildScripts = options.buildScripts;
    }

    /**
     * The manifest the package was built with.
     * @returns The manifest, parsed once.
     */
    public bundledManifest(): NativeManifest {
        this.manifest ??= parseManifest(this.manifestJson);
        return this.manifest;
    }

    /**
     * The file name of the shared library on an operating system.
     * @param platform - The operating system, as `process.platform` names it.
     * @returns The file name.
     */
    public sharedLibraryName(platform: NodeJS.Platform = process.platform): string {
        return sharedLibraryFile(this.library, platform);
    }

    /**
     * The file name of the static archive the scriptc build links.
     * @param platform - The operating system, as `process.platform` names it.
     * @returns The file name.
     */
    public staticLibraryName(platform: NodeJS.Platform = process.platform): string {
        return staticLibraryFile(this.library, platform);
    }

    /**
     * Where a platform's library goes in the package, whether `build:native` built it or the
     * install script downloaded it.
     * @param packageDir - The package's directory.
     * @param platform - The platform key; this machine's by default.
     * @returns `prebuilds/<platform>/<library>` under it.
     */
    public installedLibraryPath(packageDir: string, platform: string = platformKey()): string {
        return installedLibraryFile(packageDir, platform, this.library);
    }

    /**
     * The hash of the package's native sources in a checkout, which names a release of builds.
     * @param packageDir - The package's directory, holding `native/`.
     * @returns The first 16 hex digits of the SHA-256 over the build's inputs.
     */
    public sourceHash(packageDir: string = this.packageDir): string {
        return nativeSourceHash(packageDir, this.buildScripts, namingAnswers());
    }

    /**
     * What to tell a user whose install did not fetch the library: the package managers that hold
     * install scripts back, how to let this one run, and the way around it.
     * @param platform - The platform key.
     * @returns The advice, as sentences.
     */
    public approvalAdvice(platform: string): string {
        const name = this.packageName;
        return (
            `${name} downloads the build for ${platform} in its install script, which has not run. ` +
            `Under npm, run \`npm install-scripts approve ${name}\`, then \`npm rebuild ${name}\`. ` +
            `Under pnpm, run \`pnpm approve-builds\` or add \`allowBuilds: { '${name}': true }\` to pnpm-workspace.yaml, then reinstall. ` +
            `Under Bun, add "${name}" to "trustedDependencies" in package.json, then reinstall. ` +
            `Or set ${this.libraryEnv} to a build of the library.`
        );
    }

    /**
     * Checks a library file against the digest the manifest publishes for the platform, or the one
     * a local `build:native` recorded beside it.
     * @param path - The file.
     * @param platform - The platform key.
     * @param manifest - The package's manifest.
     * @throws {NativeLibraryError} When neither digest matches.
     */
    public verify(path: string, platform: string, manifest: NativeManifest): void {
        if (this.verifies(path, platform, manifest)) return;
        const digest = sha256(readFileSync(path));
        const published = manifest.platforms[platform]?.shared.sha256;
        const packageName = this.packageName;
        throw published === undefined
            ? new NativeLibraryErrors.NoPublishedBuildToCheck({ path, digest, packageName, platform })
            : new NativeLibraryErrors.DigestDoesNotMatchPublishedBuild({
                  path,
                  digest,
                  published,
                  packageName,
                  platform
              });
    }

    /** Whether {@link verify} accepts a file. */
    private verifies(path: string, platform: string, manifest: NativeManifest): boolean {
        const digest = sha256(readFileSync(path));
        return digest === manifest.platforms[platform]?.shared.sha256 || digest === localBuildDigest(path);
    }

    /**
     * Where the library for this machine is, checked against its published digest: the file the
     * `_LIBRARY` variable names, or the build the install script or `build:native` put in the
     * package. Finding it builds and downloads nothing.
     * @param options - The environment, package, platform and manifest; the defaults are this process's.
     * @returns The file's path.
     * @throws {NativeLibraryError} When there is no file, or it is neither the published build nor a local one.
     */
    public locate(options: LocateOptions = {}): string {
        const env = options.env ?? process.env;
        const packageDir = options.packageDir ?? this.packageDir;
        const platform = options.platform ?? platformKey();
        const manifest = options.manifest ?? this.bundledManifest();
        const packageName = this.packageName;

        const override = env[this.libraryEnv];
        if (override !== undefined && override !== '') {
            if (!existsSync(override)) {
                throw new NativeLibraryErrors.LibraryOverrideMissing({ libraryEnv: this.libraryEnv, override });
            }
            this.verify(resolve(override), platform, manifest);
            return resolve(override);
        }

        const installed = this.installedLibraryPath(packageDir, platform);
        if (existsSync(installed)) {
            this.verify(installed, platform, manifest);
            return installed;
        }
        // A checkout builds its own on any platform, so it gets the build advice below.
        const checkout = hasNativeSources(packageDir);
        if (manifest.build !== '' && manifest.platforms[platform] === undefined && !checkout) {
            throw new NativeLibraryErrors.NoBuildForPlatform({ packageName, platform });
        }
        const advice = checkout
            ? `In a checkout, \`pnpm --filter ${packageName} run build:native\` builds it, or \`pnpm install\` downloads the published one when the native sources match it.`
            : this.approvalAdvice(platform);
        throw new NativeLibraryErrors.LibraryNotInstalled({ packageName, platform, installed, advice });
    }

    /**
     * Downloads the build for this machine into the package, once, and checks its SHA-256 against
     * the manifest. It is what the package's `postinstall` runs; loading the library never downloads.
     * @param options - The package and, for tests, the platform, environment and network.
     * @returns What it did.
     * @throws {NativeLibraryErrors.DownloadFailed} When the download fails.
     * @throws {NativeLibraryErrors.DownloadDigestMismatch} When its digest or size differ from the manifest's.
     */
    public async install(options: InstallOptions): Promise<InstallOutcome> {
        const env = options.env ?? process.env;
        if (env[this.skipDownloadEnv] === '1') return { kind: 'skipped' };
        const packageDir = resolve(options.packageDir);
        const manifest = options.manifest ?? this.bundledManifest();
        const platform = options.platform ?? platformKey();

        // A checkout whose native sources changed since the published builds builds its own.
        if (hasNativeSources(packageDir)) {
            const sourceHash = this.sourceHash(packageDir);
            if (sourceHash !== manifest.build) return { kind: 'local-sources', sourceHash };
        }

        const entry = manifest.platforms[platform];
        if (entry === undefined) return { kind: 'no-build', platform };

        const path = this.installedLibraryPath(packageDir, platform);
        if (existsSync(path) && sha256(readFileSync(path)) === entry.shared.sha256) return { kind: 'present', path };

        const bytes = await readSource(
            env[this.baseUrlEnv] || manifest.baseUrl,
            entry.shared.file,
            options.fetch ?? fetch
        );
        const digest = sha256(bytes);
        if (digest !== entry.shared.sha256 || bytes.byteLength !== entry.shared.bytes) {
            throw new NativeLibraryErrors.DownloadDigestMismatch({
                file: entry.shared.file,
                digest,
                byteLength: bytes.byteLength,
                sha256: entry.shared.sha256,
                bytes: entry.shared.bytes
            });
        }
        writeWhole(path, bytes);
        return { kind: 'installed', path, bytes: bytes.byteLength };
    }

    /**
     * The bytes of a platform's library, for a packager to embed in an executable: the build in the
     * package if it is the published one or a local `build:native`, else the published build,
     * downloaded and checked.
     * @param platform - The platform key the executable is for.
     * @returns The library, or undefined when there is no build for that platform.
     */
    public async forPlatform(platform: string): Promise<Uint8Array | undefined> {
        const packageDir = this.packageDir;
        const manifest = this.bundledManifest();
        const path = this.installedLibraryPath(packageDir, platform);
        // A file that is neither the published build nor a recorded local one, such as one left by
        // an older version, is replaced by the published build when there is one.
        if (!existsSync(path) || !this.verifies(path, platform, manifest)) {
            await this.install({ packageDir, platform, manifest });
        }
        if (!existsSync(path)) return undefined;
        this.verify(path, platform, manifest);
        return readFileSync(path);
    }

    /**
     * Writes an embedded library to a cache directory under its digest, and points the `_LIBRARY`
     * variable at it, unless the user already set it. An operating system loads a shared library
     * only from a file, so an executable has to write it once; a copy already there with the right
     * digest is used as it is.
     *
     * The digest is recorded beside the file as a local build's is, because {@link forPlatform}
     * checked the bytes when they were embedded. A library built from native sources the manifest
     * does not publish yet would otherwise be refused by the executable it was embedded in.
     * @param library - The embedded bytes.
     * @param cacheDir - A writable directory.
     * @param env - The environment to set the variable in.
     * @returns The file's path.
     */
    public provideEmbedded(library: Uint8Array, cacheDir: string, env: NodeJS.ProcessEnv = process.env): string {
        const digest = sha256(library);
        const unscoped = this.packageName.slice(this.packageName.lastIndexOf('/') + 1);
        const path = join(cacheDir, unscoped, digest, this.sharedLibraryName());
        if (!existsSync(path) || sha256(readFileSync(path)) !== digest) writeWhole(path, library);
        if (localBuildDigest(path) !== digest) recordLocalBuild(path, digest);
        const current = env[this.libraryEnv];
        if (current === undefined || current === '') env[this.libraryEnv] = path;
        return path;
    }
}
