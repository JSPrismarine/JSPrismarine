import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installedLibraryPath } from './install';
import { isRecord } from './isRecord';
import { bundledManifest, sha256 } from './manifest';
import type { NativeManifest } from './manifest';
import { hasNativeSources } from './nativeHash';
import { platformKey } from './platform';

/** The environment variable that names a library file to load in place of the installed build. */
export const LIBRARY_ENV = 'JSP_NATIVE_NETWORK_LIBRARY';

/** The npm package's name, as the messages below tell a user to approve it. */
export const PACKAGE_NAME = '@jsprismarine/native-network';

/** The package's root: one level above this file in both `src/` and `dist/`. */
export const packageRoot = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Why the library cannot be loaded, with the platform and what to do about it in the message. */
export class NativeLibraryError extends Error {
    public override readonly name = 'NativeLibraryError';
}

/** How {@link locateLibrary} looks; tests replace each part. */
export interface LocateOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly packageDir?: string;
    readonly platform?: string;
    readonly manifest?: NativeManifest;
}

/**
 * What to tell a user whose install did not fetch the library: the package managers that hold
 * install scripts back, how to let this one run, and the way around it.
 * @param platform - The platform key.
 * @returns The advice, as sentences.
 */
export const approvalAdvice = (platform: string): string =>
    `${PACKAGE_NAME} downloads the build for ${platform} in its install script, which has not run. ` +
    `Under npm, run \`npm rebuild ${PACKAGE_NAME}\` with install scripts enabled. ` +
    `Under pnpm, run \`pnpm approve-builds\` or add \`allowBuilds: { '${PACKAGE_NAME}': true }\` to pnpm-workspace.yaml, then reinstall. ` +
    `Under Bun, add "${PACKAGE_NAME}" to "trustedDependencies" in package.json, then reinstall. ` +
    `Or set ${LIBRARY_ENV} to a build of the library.`;

/** The digest a local build recorded in the `build.json` beside it, which `build:native` writes. */
const localBuildDigest = (path: string): string | undefined => {
    const report = join(dirname(path), 'build.json');
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
 * Checks a library file against the digest the manifest publishes for the platform, or the one a
 * local `build:native` recorded beside it.
 * @param path - The file.
 * @param platform - The platform key.
 * @param manifest - The package's manifest.
 * @throws {NativeLibraryError} When neither digest matches.
 */
export const verifyLibrary = (path: string, platform: string, manifest: NativeManifest): void => {
    const digest = sha256(readFileSync(path));
    const published = manifest.platforms[platform]?.shared.sha256;
    if (digest === published || digest === localBuildDigest(path)) return;
    throw new NativeLibraryError(
        published === undefined
            ? `${path} has SHA-256 ${digest}, and ${PACKAGE_NAME} publishes no build for ${platform} to check it against`
            : `${path} has SHA-256 ${digest}, not the ${published} ${PACKAGE_NAME} publishes for ${platform}`
    );
};

/**
 * Where the library for this machine is, checked against its published digest: the file
 * `JSP_NATIVE_NETWORK_LIBRARY` names, or the build the install script put in the package.
 * Finding it downloads nothing.
 * @param options - The environment, package, platform and manifest; the defaults are this process's.
 * @returns The file's path.
 * @throws {NativeLibraryError} When there is no file, or it is not the published build.
 */
export const locateLibrary = (options: LocateOptions = {}): string => {
    const env = options.env ?? process.env;
    const packageDir = options.packageDir ?? packageRoot();
    const platform = options.platform ?? platformKey();
    const manifest = options.manifest ?? bundledManifest();

    const override = env[LIBRARY_ENV];
    if (override !== undefined && override !== '') {
        if (!existsSync(override)) {
            throw new NativeLibraryError(`${LIBRARY_ENV} names ${override}, which does not exist`);
        }
        verifyLibrary(resolve(override), platform, manifest);
        return resolve(override);
    }

    const installed = installedLibraryPath(packageDir, platform);
    if (existsSync(installed)) {
        verifyLibrary(installed, platform, manifest);
        return installed;
    }
    if (manifest.build !== '' && manifest.platforms[platform] === undefined) {
        throw new NativeLibraryError(`${PACKAGE_NAME} publishes no build for ${platform}.`);
    }
    const advice = hasNativeSources(packageDir)
        ? `In a checkout, \`pnpm --filter ${PACKAGE_NAME} run build:native\` builds it, or \`pnpm install\` downloads the published one when the native sources match it.`
        : approvalAdvice(platform);
    throw new NativeLibraryError(`${PACKAGE_NAME} has no build for ${platform} at ${installed}. ${advice}`);
};
