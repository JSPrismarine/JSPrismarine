/**
 * First-run data provisioning for the single executable.
 *
 * A packaged binary carries no `node_modules`, so none of the fetched data a checkout arranges
 * with `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` is on disk. The loaders all
 * search for `node_modules/.cache/jsprismarine` upward from the working directory, so this
 * module recreates exactly that layout under the working directory, from two sources:
 *
 * - An embedded data bundle, built by `scripts/package-sea.mts` from the packager's cache: the
 *   Java vanilla datapack, the data generator's biome parameter reports, the extracted structure
 *   templates, and this project's overlay packs. All of it is data this repository already
 *   generates and commits captures of, and it never changes for a given build, so it travels
 *   inside the binary.
 * - A first-run download of the Bedrock Dedicated Server zip, pinned by URL and sha256 in the
 *   embedded manifest. Its vanilla behavior pack defines the blocks and entities. Mojang's
 *   license does not allow redistributing the zip, so the binary fetches it from Mojang on the
 *   user's machine instead, with progress, and verifies the digest before unpacking. Only the
 *   `behavior_packs/` entries are written; the rest of the 95 MB zip is server binaries this
 *   project does not run. The pack goes to the user's cache directory rather than the working
 *   directory, so a server started from another folder reuses it, and the server reads it
 *   through `JSP_VANILLA_BEHAVIOR_PACK`.
 *
 * Everything is idempotent: a warm directory provisions nothing, a pack already in the user
 * cache for the pinned version and digest is not downloaded again, and a user-set
 * `JSP_VANILLA_BEHAVIOR_PACK` skips the download outright for offline machines that already hold
 * a copy.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { provideEmbeddedLibrary } from '@jsprismarine/native-network';
import { readZip } from '@jsprismarine/packs';

import { decodeDataBundle } from './dataBundle';
import { EMBEDDED_DATA_BUNDLE, EMBEDDED_DATA_MANIFEST, EMBEDDED_NATIVE_LIBRARY, hasEmbeddedData } from './embeddedData';
import { userCacheDir } from './userCache';

/** The SEA asset keys `scripts/package-sea.mts` writes. */
export const SEA_ASSETS = {
    /** The gzipped data bundle, in the `dataBundle.ts` format. */
    bundle: 'data-bundle',
    /** The JSON manifest describing the bundle and the pinned BDS download. */
    manifest: 'data-manifest',
    /** The native networking library for the executable's platform, when it has a build. */
    nativeLibrary: 'native-network-library'
} as const;

/**
 * Where a packaged build keeps its data, which differs by the packager that built it.
 *
 * Node's single executable answers through `node:sea`; a Bun-compiled binary answers through
 * {@link `./embeddedData.ts`}, because Bun implements no `node:sea` and importing it there
 * throws `No such built-in module` before the server starts. Nothing else is a packaged build.
 */
type PackagedAssets = {
    /** The JSON manifest text the packager embedded. */
    readonly manifest: string;
    /** Reads the gzipped data bundle. Deferred so a warm directory never decodes it. */
    readonly bundle: () => Uint8Array;
    /** Reads the native networking library, or undefined when the executable carries none. */
    readonly nativeLibrary: () => Uint8Array | undefined;
};

/** The assets this build carries, or undefined when it is not a packaged executable. */
const packagedAssets = (): PackagedAssets | undefined => {
    if (hasEmbeddedData()) {
        return {
            manifest: EMBEDDED_DATA_MANIFEST,
            bundle: () => Buffer.from(EMBEDDED_DATA_BUNDLE, 'base64'),
            nativeLibrary: () =>
                EMBEDDED_NATIVE_LIBRARY.length > 0 ? Buffer.from(EMBEDDED_NATIVE_LIBRARY, 'base64') : undefined
        };
    }

    // `node:sea` exists only on Node, and only a single executable answers true; `require` keeps
    // Bun from resolving the specifier at all, which a static import would make it do.
    try {
        const load = createRequire(import.meta.url);
        const sea = load('node:sea') as typeof import('node:sea');
        if (!sea.isSea()) return undefined;
        return {
            manifest: sea.getAsset(SEA_ASSETS.manifest, 'utf8'),
            bundle: () => new Uint8Array(sea.getAsset(SEA_ASSETS.bundle)),
            nativeLibrary: () => {
                try {
                    return new Uint8Array(sea.getAsset(SEA_ASSETS.nativeLibrary));
                } catch {
                    return undefined;
                }
            }
        };
    } catch {
        return undefined;
    }
};

/** What the embedded manifest says, written at package time from `sources.json`. */
export interface SeaDataManifest {
    /** The sha256 of the embedded bundle, which is what marks an extraction as current. */
    bundleSha256: string;
    /** The pinned Bedrock Dedicated Server download the vanilla behavior pack comes from. */
    bds: {
        minecraftVersion: string;
        serverVersion: string;
        url: string;
        sha256: string;
        sizeInBytes: number;
    };
}

const MARKER_FILE = 'sea-data.json';

const writeFileAt = (root: string, relative: string, bytes: Uint8Array): void => {
    const absolute = path.join(root, ...relative.split('/'));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
};

/** Extracts the embedded bundle under `node_modules`, unless the marker says it already is. */
const extractBundle = (
    modulesRoot: string,
    manifest: SeaDataManifest,
    assets: PackagedAssets,
    log: (line: string) => void
): void => {
    const marker = path.join(modulesRoot, '.cache', 'jsprismarine', MARKER_FILE);
    if (existsSync(marker)) {
        try {
            // Our own marker file; a hand-edited one only triggers a re-extraction.
            const recorded: unknown = JSON.parse(readFileSync(marker, 'utf8'));
            if ((recorded as { bundleSha256?: unknown }).bundleSha256 === manifest.bundleSha256) return;
        } catch {
            // An unreadable marker means the extraction state is unknown; extract again.
        }
    }

    const files = decodeDataBundle(assets.bundle());
    log(`Unpacking ${files.size} embedded data files...`);
    for (const [relative, bytes] of files) writeFileAt(modulesRoot, relative, bytes);

    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, `${JSON.stringify({ bundleSha256: manifest.bundleSha256 }, null, 4)}\n`);
};

/** Downloads one pinned zip, logging a line per ~10% and verifying the digest. */
export const downloadVerified = async (
    pin: SeaDataManifest['bds'],
    log: (line: string) => void
): Promise<Map<string, Uint8Array>> => {
    // The CDN resets connections from non-browser user agents.
    const response = await fetch(pin.url, { headers: { 'user-agent': 'Mozilla/5.0 (JSPrismarine)' } });
    if (!response.ok || response.body === null)
        throw new Error(`the download failed with HTTP ${response.status} ${response.statusText}`);

    const total = Number(response.headers.get('content-length')) || pin.sizeInBytes;
    const chunks: Uint8Array[] = [];
    const hash = createHash('sha256');
    let received = 0;
    let nextReport = 0.1;
    const reader = response.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        hash.update(value);
        received += value.byteLength;
        if (total > 0 && received / total >= nextReport) {
            log(`  ${(received / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MiB`);
            nextReport = Math.floor((received / total) * 10) / 10 + 0.1;
        }
    }

    const digest = hash.digest('hex');
    if (digest !== pin.sha256)
        throw new Error(`the download's sha256 ${digest} does not match the pinned ${pin.sha256}`);

    return readZip(Buffer.concat(chunks));
};

/** The environment variable that points at a local BDS `behavior_packs` folder instead. */
const BDS_OVERRIDE = 'JSP_VANILLA_BEHAVIOR_PACK';

/** The file that marks an unpacked pin as complete, holding the digest it came from. */
const PIN_MARKER = 'complete.json';

/** Whether `versionRoot` holds a finished unpack of exactly this pin. */
const holdsPin = (versionRoot: string, pin: SeaDataManifest['bds']): boolean => {
    try {
        const recorded: unknown = JSON.parse(readFileSync(path.join(versionRoot, PIN_MARKER), 'utf8'));
        return (
            typeof recorded === 'object' &&
            recorded !== null &&
            'sha256' in recorded &&
            recorded.sha256 === pin.sha256 &&
            existsSync(path.join(versionRoot, 'behavior_packs'))
        );
    } catch {
        return false;
    }
};

/**
 * Downloads the pin and unpacks its `behavior_packs/` into `versionRoot`.
 *
 * The files go to a sibling directory first and are renamed into place with the marker inside,
 * so an interrupted run leaves no half-written pack that a later start would trust.
 */
const downloadBehaviorPacks = async (
    versionRoot: string,
    pin: SeaDataManifest['bds'],
    log: (line: string) => void
): Promise<void> => {
    log(`Downloading the vanilla Bedrock behavior pack (Bedrock Dedicated Server ${pin.serverVersion}, ~95 MiB)...`);
    let entries: Map<string, Uint8Array>;
    try {
        entries = await downloadVerified(pin, log);
    } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Could not fetch the vanilla Bedrock behavior pack from ${pin.url}: ${cause}. ` +
                `The server needs it to define blocks and entities. Check the network and retry, or set ` +
                `${BDS_OVERRIDE} to a local Bedrock Dedicated Server behavior_packs folder.`,
            { cause: error }
        );
    }

    const staging = `${versionRoot}.partial-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    let written = 0;
    for (const [name, bytes] of entries) {
        if (!name.startsWith('behavior_packs/')) continue;
        writeFileAt(staging, name, bytes);
        written += 1;
    }

    if (written === 0) {
        rmSync(staging, { recursive: true, force: true });
        throw new Error(`the Bedrock Dedicated Server zip at ${pin.url} holds no behavior_packs/`);
    }
    writeFileSync(path.join(staging, PIN_MARKER), `${JSON.stringify({ sha256: pin.sha256 }, null, 4)}\n`);

    // A leftover without a marker is an older interrupted unpack; a complete one means another
    // server finished the same download first, and its copy is as good as this one.
    if (existsSync(versionRoot) && !holdsPin(versionRoot, pin)) rmSync(versionRoot, { recursive: true, force: true });
    try {
        renameSync(staging, versionRoot);
    } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        if (!holdsPin(versionRoot, pin)) throw error;
    }
    log(`Unpacked ${written} behavior pack files.`);
};

/**
 * Finds or downloads the vanilla Bedrock behavior pack and points {@link BDS_OVERRIDE} at it,
 * unless the user already set that variable.
 *
 * The download lands in {@link userCacheDir} under the pinned server version, and is reused
 * while its marker records the pinned digest, so a new pin downloads once and an unchanged one
 * never again, whichever folder the server starts in. A pack an older build unpacked into the
 * working directory is used where it is, and when the user cache cannot be created the download
 * falls back to the working directory.
 *
 * @param cacheDir - The user cache directory; a parameter so tests can use a temporary one.
 * @throws With the URL and the remedy when the download cannot complete, because a server
 *   without the pack defines no blocks and cannot generate or serve a world.
 */
export const provisionBehaviorPacks = async (
    modulesRoot: string,
    pin: SeaDataManifest['bds'],
    log: (line: string) => void,
    cacheDir: string = userCacheDir()
): Promise<void> => {
    if (process.env[BDS_OVERRIDE]) return;

    const local = path.join(modulesRoot, '.cache', 'jsprismarine', 'bds', pin.serverVersion, 'unpacked');
    const shared = path.join(cacheDir, 'bds', pin.serverVersion);
    const use = (versionRoot: string): void => {
        // Inherited by the server and generation host processes this one starts.
        process.env[BDS_OVERRIDE] = path.join(versionRoot, 'behavior_packs');
    };

    if (holdsPin(shared, pin)) {
        use(shared);
        return;
    }
    if (existsSync(path.join(local, 'behavior_packs'))) {
        use(local);
        return;
    }

    let target = shared;
    try {
        mkdirSync(path.dirname(shared), { recursive: true });
    } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        log(`Could not create the cache directory ${path.dirname(shared)} (${cause}); using ${local}.`);
        target = local;
        mkdirSync(path.dirname(local), { recursive: true });
    }

    await downloadBehaviorPacks(target, pin, log);
    use(target);
};

/**
 * Arranges the data a packaged server reads at runtime, under the working directory.
 *
 * A no-op outside a single executable, so every other way of running the server is untouched.
 */
export const provisionPackagedData = async (
    log: (line: string) => void = (line) => process.stdout.write(`${line}\n`)
): Promise<void> => {
    const assets = packagedAssets();
    if (assets === undefined) return;

    // Parsed JSON the packaging script wrote into this same binary, so the shape is this build's.
    const manifest: SeaDataManifest = JSON.parse(assets.manifest);
    const modulesRoot = path.resolve(process.cwd(), 'node_modules');

    extractBundle(modulesRoot, manifest, assets, log);
    await provisionBehaviorPacks(modulesRoot, manifest.bds, log);
    const nativeLibrary = assets.nativeLibrary();
    if (nativeLibrary !== undefined) {
        provideEmbeddedLibrary(nativeLibrary, path.join(modulesRoot, '.cache', 'jsprismarine'));
    }
};
