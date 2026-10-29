/**
 * Collects the data a packaged executable carries, for either packager.
 *
 * Both the Node single executable (`package-sea.mts`) and the Bun executables the release
 * workflow compiles (`.github/scripts/build-aot.mjs`) ship the same payload and differ only in
 * how they carry it, so the decision about what goes in lives here rather than in each of them.
 *
 * What travels inside the binary is data this repository generates and already commits captures
 * of: the Java vanilla datapack, the biome parameter reports the world generator reads, the
 * extracted structure templates, and this project's overlay packs. The Bedrock Dedicated Server
 * zip does not travel with it — Mojang's license does not allow redistributing it, so only its
 * pin goes in the manifest and the binary fetches it on first run.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { encodeDataBundle } from '../packages/server/src/packaged/dataBundle.ts';

/** The pinned Bedrock Dedicated Server a packaged binary downloads on first run. */
export interface BdsPin {
    minecraftVersion: string;
    serverVersion: string;
    url: string;
    sha256: string;
    sizeInBytes: number;
}

/** What a packager needs to embed: the bundle bytes and the manifest describing them. */
export interface PackagedData {
    /** The gzipped bundle, in the `dataBundle.ts` format. */
    bundle: Uint8Array;
    /** The manifest text, as the runtime parses it. */
    manifest: string;
    /** How many files the bundle holds, for the packager's log line. */
    fileCount: number;
}

/** Every file under a directory, as bundle entries with `/` separators. */
const collect = (files: Map<string, Uint8Array>, root: string, prefix: string): void => {
    for (const entry of readdirSync(root).sort()) {
        const absolute = path.join(root, entry);
        if (statSync(absolute).isDirectory()) collect(files, absolute, `${prefix}${entry}/`);
        else files.set(`${prefix}${entry}`, readFileSync(absolute));
    }
};

/** The newest version directory under a cache folder that holds `marker`. */
const newestVersionWith = (root: string, marker: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    for (const entry of readdirSync(root).sort().reverse()) {
        if (existsSync(path.join(root, entry, marker))) return path.join(root, entry);
    }
    return undefined;
};

/** What a checkout must run before either packager can build. */
export const COLD_CACHE_MESSAGE =
    'The packaged binary carries the Java worldgen data, and this checkout has not fetched it. Run ' +
    '`pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen` and ' +
    '`pnpm --filter @jsprismarine/bedrock-data run extract:structures` first.';

/**
 * Builds the payload a packaged executable carries.
 *
 * @param repoRoot - The repository root, whose `node_modules/.cache` holds the fetched data.
 * @throws When the cache is cold, naming the commands that fill it.
 */
export const buildPackagedData = (repoRoot: string): PackagedData => {
    const cacheRoot = path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine');
    const datapack = newestVersionWith(path.join(cacheRoot, 'vanilla-datapack'), 'pack.mcmeta');
    const reports = newestVersionWith(path.join(cacheRoot, 'java-reports'), path.join('generated', 'reports'));
    const structures = newestVersionWith(path.join(cacheRoot, 'java-structures'), 'empty.nbt');
    if (datapack === undefined || reports === undefined || structures === undefined) {
        throw new Error(COLD_CACHE_MESSAGE);
    }

    const files = new Map<string, Uint8Array>();
    const cachePrefix = '.cache/jsprismarine';
    collect(files, datapack, `${cachePrefix}/vanilla-datapack/${path.basename(datapack)}/`);
    collect(
        files,
        path.join(reports, 'generated', 'reports', 'biome_parameters'),
        `${cachePrefix}/java-reports/${path.basename(reports)}/generated/reports/biome_parameters/`
    );
    collect(files, structures, `${cachePrefix}/java-structures/${path.basename(structures)}/`);
    collect(
        files,
        path.join(repoRoot, 'packages', 'blocks', 'vanilla_overlay'),
        '@jsprismarine/blocks/vanilla_overlay/'
    );
    collect(
        files,
        path.join(repoRoot, 'packages', 'entities', 'vanilla_overlay'),
        '@jsprismarine/entities/vanilla_overlay/'
    );

    const bundle = encodeDataBundle(files);

    // Parsed JSON pinned in this repository, cross-checked by the bedrock-data fetch tests.
    const sources: { bds: { defaultProtocolVersion: number; versions: Record<string, BdsPin> } } = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const pin = sources.bds.versions[String(sources.bds.defaultProtocolVersion)];
    if (pin === undefined)
        throw new Error('sources.json pins no Bedrock Dedicated Server for its default protocol version.');

    const manifest = `${JSON.stringify(
        { bundleSha256: createHash('sha256').update(bundle).digest('hex'), bds: pin },
        null,
        4
    )}\n`;

    return { bundle, manifest, fileCount: files.size };
};
