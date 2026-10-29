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
 *   project does not run.
 *
 * Everything is idempotent: a warm directory provisions nothing, and `JSP_VANILLA_BEHAVIOR_PACK`
 * skips the download outright for offline machines that already hold a copy.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getAsset, isSea } from 'node:sea';

import { readZip } from '@jsprismarine/packs';

import { decodeDataBundle } from './dataBundle';

/** The SEA asset keys `scripts/package-sea.mts` writes. */
export const SEA_ASSETS = {
    /** The gzipped data bundle, in the `dataBundle.ts` format. */
    bundle: 'data-bundle',
    /** The JSON manifest describing the bundle and the pinned BDS download. */
    manifest: 'data-manifest'
} as const;

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
const extractBundle = (modulesRoot: string, manifest: SeaDataManifest, log: (line: string) => void): void => {
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

    const files = decodeDataBundle(new Uint8Array(getAsset(SEA_ASSETS.bundle)));
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

/**
 * Downloads and unpacks the vanilla Bedrock behavior pack, unless it is already on disk or
 * {@link BDS_OVERRIDE} points somewhere else.
 *
 * @throws With the URL and the remedy when the download cannot complete, because a server
 *   without the pack defines no blocks and cannot generate or serve a world.
 */
const provisionBehaviorPacks = async (
    modulesRoot: string,
    manifest: SeaDataManifest,
    log: (line: string) => void
): Promise<void> => {
    if (process.env[BDS_OVERRIDE]) return;

    const pin = manifest.bds;
    const root = path.join(modulesRoot, '.cache', 'jsprismarine', 'bds', pin.serverVersion, 'unpacked');
    if (existsSync(path.join(root, 'behavior_packs'))) return;

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

    let written = 0;
    for (const [name, bytes] of entries) {
        if (!name.startsWith('behavior_packs/')) continue;
        writeFileAt(root, name, bytes);
        written += 1;
    }

    if (written === 0) throw new Error(`the Bedrock Dedicated Server zip at ${pin.url} holds no behavior_packs/`);
    log(`Unpacked ${written} behavior pack files.`);
};

/**
 * Arranges the data a packaged server reads at runtime, under the working directory.
 *
 * A no-op outside a single executable, so every other way of running the server is untouched.
 */
export const provisionSeaData = async (
    log: (line: string) => void = (line) => process.stdout.write(`${line}\n`)
): Promise<void> => {
    if (!isSea()) return;

    // Parsed JSON the packaging script wrote into this same binary, so the shape is this build's.
    const manifest: SeaDataManifest = JSON.parse(getAsset(SEA_ASSETS.manifest, 'utf8'));
    const modulesRoot = path.resolve(process.cwd(), 'node_modules');

    extractBundle(modulesRoot, manifest, log);
    await provisionBehaviorPacks(modulesRoot, manifest, log);
};
