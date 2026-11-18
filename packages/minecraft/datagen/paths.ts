/**
 * Where a datagen input lives, read from `manifest.json` rather than spelled out again.
 *
 * The snapshots sit under a directory per protocol version, and the manifest decides both the
 * version and the file name: `versions.<protocol>.blocks.source` is the path, relative to this
 * directory, that `generate-blocks.js` reads. Anything outside the generators that needs the
 * same capture - the mapping tables and their tests, the parity goldens - asks here, so moving
 * a snapshot is a manifest edit and nothing else.
 *
 * This module is workspace tooling. It is reachable as `@jsprismarine/minecraft/datagen/paths`
 * inside the repository and is deliberately absent from the published package, which ships
 * `dist` without `datagen`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The part of the manifest this module reads. */
interface DatagenManifest {
    defaultProtocolVersion: number;
    versions: Record<string, { blocks?: { source?: string } }>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

// Parsed JSON has no type the compiler can see; this is the shape the manifest documents.
const manifest = JSON.parse(readFileSync(path.join(here, 'manifest.json'), 'utf8')) as DatagenManifest;

/** The protocol version whose generated enums are also re-exported at the unversioned paths. */
export const defaultProtocolVersion = manifest.defaultProtocolVersion;

/**
 * The protocol version whose block catalog is re-exported at the unversioned path.
 *
 * A block palette is a capture of a Bedrock Dedicated Server, so the catalog follows the server
 * `@jsprismarine/bedrock-data` captures by default, which is the newest release, rather than the
 * manifest's `defaultProtocolVersion`. That one names the enums, which are the base layout the
 * protocol package writes older versions in and expresses newer ones as deltas over.
 */
export const blocksProtocolVersion: number =
    // Parsed JSON has no type the compiler can see; this is the one field read here.
    (
        JSON.parse(readFileSync(path.join(here, '../../bedrock-data/sources.json'), 'utf8')) as {
            bds: { defaultProtocolVersion: number };
        }
    ).bds.defaultProtocolVersion;

/**
 * The absolute path of the block palette capture for one protocol version.
 *
 * @param protocol - A protocol version the manifest declares. Defaults to `blocksProtocolVersion`.
 * @throws If the manifest declares no such version, or that version no block palette source.
 */
export const blockPaletteSnapshotPath = (protocol: number = blocksProtocolVersion): string => {
    const source = manifest.versions[String(protocol)]?.blocks?.source;
    if (source === undefined) {
        const declared = Object.keys(manifest.versions)
            .filter((key) => !key.startsWith('$'))
            .join(', ');
        throw new Error(`The datagen manifest has no block palette for protocol ${protocol}; it declares ${declared}.`);
    }

    return path.join(here, source);
};
