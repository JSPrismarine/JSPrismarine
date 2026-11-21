import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { NativeLibraryError } from '@jsprismarine/errors/native-library';

import { sha256 } from './manifest';
import type { NativeManifest } from './manifest';
import { NativeLibrary } from './NativeLibrary';
import type { LocateOptions } from './NativeLibrary';

const PLATFORM = 'linux-x64-gnu';
const OTHER = 'win32-arm64';
const build = Buffer.from('a build of the library for linux-x64-gnu');
const otherBuild = Buffer.from('a build for win32-arm64');

const manifest: NativeManifest = {
    build: 'abcdef0123456789',
    baseUrl: 'https://example.invalid/releases/download/example-build-abcdef0123456789',
    platforms: {
        [PLATFORM]: {
            shared: { file: `${PLATFORM}-libjsp_example.so`, bytes: build.byteLength, sha256: sha256(build) }
        },
        [OTHER]: {
            shared: {
                file: `${OTHER}-libjsp_example.dll`,
                bytes: otherBuild.byteLength,
                sha256: sha256(otherBuild)
            }
        }
    }
};

const library = new NativeLibrary({
    packageName: '@jsprismarine/example',
    library: 'libjsp_example',
    envPrefix: 'JSP_EXAMPLE',
    packageDir: tmpdir(),
    manifest,
    buildScripts: []
});
const { baseUrlEnv: BASE_URL_ENV, libraryEnv: LIBRARY_ENV, skipDownloadEnv: SKIP_DOWNLOAD_ENV } = library;
const installBuild = library.install.bind(library);
const installedLibraryPath = library.installedLibraryPath.bind(library);
const locateLibrary = (options: LocateOptions) => library.locate(options);

/** A published package: no native sources beside the manifest. */
const packages: string[] = [];
const publishedPackage = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-native-install-'));
    packages.push(dir);
    return dir;
};
afterEach(() => {
    for (const dir of packages.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A network that serves the two builds and counts what it was asked for. */
const network = () => {
    const requests: string[] = [];
    const files = new Map([
        [manifest.platforms[PLATFORM]!.shared.file, build],
        [manifest.platforms[OTHER]!.shared.file, otherBuild]
    ]);
    const fetchImpl = async (url: string): Promise<Response> => {
        requests.push(url);
        const body = files.get(decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)));
        return body === undefined ? new Response(null, { status: 404 }) : new Response(body);
    };
    return { requests, fetchImpl, files };
};

describe('installing the native library', () => {
    it('downloads exactly the build for its platform, checks it, and stores it in the package', async () => {
        const packageDir = publishedPackage();
        const { requests, fetchImpl } = network();

        const outcome = await installBuild({ packageDir, platform: PLATFORM, manifest, env: {}, fetch: fetchImpl });

        expect(outcome).toMatchObject({ kind: 'installed', bytes: build.byteLength });
        expect(requests).toStrictEqual([`${manifest.baseUrl}/${manifest.platforms[PLATFORM]!.shared.file}`]);
        expect(readFileSync(installedLibraryPath(packageDir, PLATFORM))).toStrictEqual(build);
    });

    it('downloads nothing when the right build is already there', async () => {
        const packageDir = publishedPackage();
        const { requests, fetchImpl } = network();
        await installBuild({ packageDir, platform: PLATFORM, manifest, env: {}, fetch: fetchImpl });

        const again = await installBuild({ packageDir, platform: PLATFORM, manifest, env: {}, fetch: fetchImpl });

        expect(again.kind).toBe('present');
        expect(requests).toHaveLength(1);
    });

    it('refuses a download whose digest differs from the manifest, and stores nothing', async () => {
        const packageDir = publishedPackage();
        const { fetchImpl, files } = network();
        files.set(manifest.platforms[PLATFORM]!.shared.file, Buffer.from('a tampered build of the same length!!!!!'));

        await expect(
            installBuild({ packageDir, platform: PLATFORM, manifest, env: {}, fetch: fetchImpl })
        ).rejects.toThrow(`the manifest expects ${sha256(build)}`);
        expect(() => readFileSync(installedLibraryPath(packageDir, PLATFORM))).toThrow();
    });

    it('reports a platform with no published build without downloading', async () => {
        const { requests, fetchImpl } = network();

        const outcome = await installBuild({
            packageDir: publishedPackage(),
            platform: 'freebsd-x64',
            manifest,
            env: {},
            fetch: fetchImpl
        });

        expect(outcome).toStrictEqual({ kind: 'no-build', platform: 'freebsd-x64' });
        expect(requests).toHaveLength(0);
    });

    it('joins a base URL that ends in slashes to the file name with one', async () => {
        const { requests, fetchImpl } = network();

        await installBuild({
            packageDir: publishedPackage(),
            platform: PLATFORM,
            manifest: { ...manifest, baseUrl: `${manifest.baseUrl}${'/'.repeat(10_000)}` },
            env: {},
            fetch: fetchImpl
        });

        expect(requests).toStrictEqual([`${manifest.baseUrl}/${manifest.platforms[PLATFORM]!.shared.file}`]);
    });

    it('reads from a directory a mirror or a test names, and skips when told to', async () => {
        const packageDir = publishedPackage();
        const mirror = publishedPackage();
        writeFileSync(join(mirror, manifest.platforms[PLATFORM]!.shared.file), build);

        const fromMirror = await installBuild({
            packageDir,
            platform: PLATFORM,
            manifest,
            env: { [BASE_URL_ENV]: mirror }
        });
        const skipped = await installBuild({
            packageDir,
            platform: PLATFORM,
            manifest,
            env: { [SKIP_DOWNLOAD_ENV]: '1' }
        });

        expect(fromMirror.kind).toBe('installed');
        expect(skipped.kind).toBe('skipped');
    });
});

describe('loading the native library', () => {
    it('finds the installed build and checks it, downloading nothing', () => {
        const packageDir = publishedPackage();
        const path = installedLibraryPath(packageDir, PLATFORM);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, build);

        // No fetch is reachable from here: locating is synchronous and reads only the disk.
        expect(locateLibrary({ packageDir, platform: PLATFORM, manifest, env: {} })).toBe(path);
    });

    it('fails without a build with how to approve the install script under npm, pnpm and Bun', () => {
        const attempt = () => locateLibrary({ packageDir: publishedPackage(), platform: PLATFORM, manifest, env: {} });

        expect(attempt).toThrow(NativeLibraryError);
        expect(attempt).toThrow('npm install-scripts approve @jsprismarine/example');
        expect(attempt).toThrow('npm rebuild @jsprismarine/example');
        expect(attempt).toThrow('pnpm approve-builds');
        expect(attempt).toThrow('"trustedDependencies"');
        expect(attempt).toThrow(LIBRARY_ENV);
    });

    it('refuses an installed file that is not the published build', () => {
        const packageDir = publishedPackage();
        const path = installedLibraryPath(packageDir, PLATFORM);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, Buffer.from('something else'));

        expect(() => locateLibrary({ packageDir, platform: PLATFORM, manifest, env: {} })).toThrow(
            `not the ${sha256(build)} @jsprismarine/example publishes for ${PLATFORM}`
        );
    });

    it('uses the file the environment variable names, and checks it too', () => {
        const packageDir = publishedPackage();
        const good = join(packageDir, 'good.so');
        const bad = join(packageDir, 'bad.so');
        writeFileSync(good, build);
        writeFileSync(bad, otherBuild);

        expect(locateLibrary({ packageDir, platform: PLATFORM, manifest, env: { [LIBRARY_ENV]: good } })).toBe(good);
        expect(() => locateLibrary({ packageDir, platform: PLATFORM, manifest, env: { [LIBRARY_ENV]: bad } })).toThrow(
            NativeLibraryError
        );
        expect(() =>
            locateLibrary({
                packageDir,
                platform: PLATFORM,
                manifest,
                env: { [LIBRARY_ENV]: join(packageDir, 'missing.so') }
            })
        ).toThrow('which does not exist');
    });

    it('accepts a local build:native output by the digest it recorded beside it', () => {
        const packageDir = publishedPackage();
        const local = Buffer.from('a local build');
        const path = installedLibraryPath(packageDir, PLATFORM);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, local);
        writeFileSync(join(path, '..', 'build.json'), JSON.stringify({ shared: { sha256: sha256(local) } }));

        expect(locateLibrary({ packageDir, platform: PLATFORM, manifest, env: {} })).toBe(path);
    });
});

describe('a published package without a build for the machine', () => {
    it('says no build is published for it', () => {
        expect(() =>
            locateLibrary({ packageDir: publishedPackage(), platform: 'freebsd-x64', manifest, env: {} })
        ).toThrow('@jsprismarine/example publishes no build for freebsd-x64');
    });
});

describe('the library a packager embeds', () => {
    it('replaces a stale installed file with the published build', async () => {
        const packageDir = publishedPackage();
        const mirror = publishedPackage();
        writeFileSync(join(mirror, manifest.platforms[PLATFORM]!.shared.file), build);
        const packager = new NativeLibrary({
            packageName: '@jsprismarine/example',
            library: 'libjsp_example',
            envPrefix: 'JSP_EXAMPLE',
            packageDir,
            manifest: { ...manifest, baseUrl: mirror },
            buildScripts: []
        });
        const path = packager.installedLibraryPath(packageDir, PLATFORM);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, Buffer.from('left by an older version'));

        expect(await packager.forPlatform(PLATFORM)).toStrictEqual(build);
        expect(readFileSync(path)).toStrictEqual(build);
    });
});
