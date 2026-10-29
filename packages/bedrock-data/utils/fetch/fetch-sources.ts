/**
 * Fetches the pinned upstream sources listed in `sources.json` into
 * `node_modules/.cache/jsprismarine/<source>/<version>/`, verifying each
 * digest before unpacking, then writes `pack-hashes.json` beside the
 * manifest so a version bump shows which top-level folders changed.
 *
 * Two sources are pinned per Bedrock protocol version. Every pinned
 * CloudburstMC/Data archive is fetched, because they are small and
 * `pack-hashes.json` is worth having for all of them. Only the selected
 * Bedrock Dedicated Server is fetched, because each zip is ~95 MB.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`, with
 * `--protocol <n>` to pick a server version other than the manifest default.
 * `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
 * `JSP_VANILLA_MCDOC_PATH`, `JSP_GEYSER_MAPPINGS_PATH` and
 * `JSP_CLOUDBURST_DATA_PATH` point at local copies for offline work.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cacheRoot, packageDir, parseProtocolArgument } from './cloudburst.ts';
import { fetchSource, hashSourceContent, type SourcePackHashes } from './fetch.ts';
import {
    BDS_SOURCE_NAME,
    bdsDescriptor,
    CLOUDBURST_SOURCE_NAME,
    cloudburstDescriptor,
    loadBdsData,
    loadCloudburstData,
    loadSourceDescriptors
} from './manifest.ts';

const manifestPath = join(packageDir, 'sources.json');
const packHashesPath = join(packageDir, 'pack-hashes.json');
const protocolVersion = parseProtocolArgument(process.argv);

const cloudburst = await loadCloudburstData(manifestPath);
const descriptors = [
    bdsDescriptor(await loadBdsData(manifestPath), protocolVersion),
    ...(await loadSourceDescriptors(manifestPath)),
    ...Object.keys(cloudburst.versions)
        .sort((a, b) => Number(a) - Number(b))
        .map((protocol) => cloudburstDescriptor(cloudburst, Number(protocol)))
];

const readExistingPackHashes = async (): Promise<Record<string, SourcePackHashes>> => {
    try {
        // The file is JSON this script wrote; parse gives it no type.
        return JSON.parse(await readFile(packHashesPath, 'utf8')) as Record<string, SourcePackHashes>;
    } catch {
        return {};
    }
};

// Only one server version is fetched per run, so the others' hashes are kept
// rather than dropped: the file records every version measured so far.
const packHashes = await readExistingPackHashes();

for (const descriptor of descriptors) {
    const fetched = await fetchSource(descriptor, { cacheRoot });
    const state = fetched.fromOverride ? 'override' : fetched.fromCache ? 'cached' : 'downloaded';
    console.log(`${descriptor.name} ${descriptor.version}: ${state} (${fetched.contentPath})`);
    // The per-protocol sources have an entry per version, so the key carries it too.
    const perProtocol = descriptor.name === CLOUDBURST_SOURCE_NAME || descriptor.name === BDS_SOURCE_NAME;
    packHashes[perProtocol ? `${descriptor.name}/${descriptor.version}` : descriptor.name] =
        await hashSourceContent(fetched);
}

const sorted = Object.fromEntries(Object.entries(packHashes).sort(([a], [b]) => (a < b ? -1 : 1)));
await writeFile(packHashesPath, `${JSON.stringify(sorted, undefined, 4)}\n`);
console.log(`Wrote ${packHashesPath}`);
