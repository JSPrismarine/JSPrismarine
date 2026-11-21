/**
 * The native library an executable embeds, for `scripts/package-sea.mts` and
 * `.github/scripts/build-aot.mjs`. A platform the manifest publishes no build for gets none, which
 * the packager reports. A platform it does publish one for always gets a library: a checkout whose
 * native sources differ from the published builds has none to download, and packaging without it
 * would ship an executable without NetherNet or behavior pack scripts (#3524).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

import { nativePackage, repoRoot } from './packages.mts';

/** The part of a package's `native/manifest.json` this reads. */
interface Manifest {
    readonly build: string;
    readonly platforms: Readonly<Record<string, unknown>>;
}

/**
 * The library to embed for a package and platform.
 * @param id - The package id in `packages.mts`, such as `script-host`.
 * @param platform - The platform key the executable is for.
 * @returns The library, or undefined when the manifest publishes no build for the platform.
 * @throws {Error} When the manifest publishes a build for the platform but there is none to embed,
 *   because the checkout's native sources changed and no local build exists.
 */
export const embeddableLibrary = async (id: string, platform: string): Promise<Uint8Array | undefined> => {
    const pkg = nativePackage(id);
    // tsImport returns an untyped module; this is the export this script calls.
    const { libraryForPlatform } = (await tsImport(
        pathToFileURL(join(repoRoot, pkg.dir, 'src', 'embed.ts')).href,
        import.meta.url
    )) as { libraryForPlatform: (platform: string) => Promise<Uint8Array | undefined> };
    const library = await libraryForPlatform(platform);
    if (library !== undefined) return library;

    // Our own manifest, which each package's src/manifest.ts checks where it loads it.
    const manifest = JSON.parse(readFileSync(join(repoRoot, pkg.dir, 'native', 'manifest.json'), 'utf8')) as Manifest;
    if (manifest.platforms[platform] === undefined) return undefined;
    throw new Error(
        `${pkg.name} publishes a build for ${platform}, but this checkout's native sources (${pkg.sourceHash()}) ` +
            `differ from the published builds (${manifest.build}) and there is no local build to embed. ` +
            `Run \`pnpm --filter ${pkg.name} run build:native\`, then package again.`
    );
};
