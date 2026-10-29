/**
 * Fetches the pinned upstream sources listed in `sources.json` into
 * `node_modules/.cache/jsprismarine/<source>/<version>/`, verifying each
 * digest before unpacking, then writes `pack-hashes.json` beside the
 * manifest so a version bump shows which top-level folders changed.
 *
 * CloudburstMC/Data is pinned per Bedrock protocol version; every pinned
 * version is fetched so `pack-hashes.json` covers all of them.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`.
 * `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
 * `JSP_VANILLA_MCDOC_PATH`, `JSP_GEYSER_MAPPINGS_PATH` and
 * `JSP_CLOUDBURST_DATA_PATH` point at local copies for offline work.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cacheRoot, packageDir } from './cloudburst.ts';
import { fetchSource, hashSourceContent, type SourcePackHashes } from './fetch.ts';
import { CLOUDBURST_SOURCE_NAME, cloudburstDescriptor, loadCloudburstData, loadSourceDescriptors } from './manifest.ts';

const manifestPath = join(packageDir, 'sources.json');
const cloudburst = await loadCloudburstData(manifestPath);
const descriptors = [
    ...(await loadSourceDescriptors(manifestPath)),
    ...Object.keys(cloudburst.versions)
        .sort((a, b) => Number(a) - Number(b))
        .map((protocol) => cloudburstDescriptor(cloudburst, Number(protocol)))
];
const packHashes: Record<string, SourcePackHashes> = {};

for (const descriptor of descriptors) {
    const fetched = await fetchSource(descriptor, { cacheRoot });
    const state = fetched.fromOverride ? 'override' : fetched.fromCache ? 'cached' : 'downloaded';
    console.log(`${descriptor.name} ${descriptor.version}: ${state} (${fetched.contentPath})`);
    // One source has an entry per version, so the key carries the version too.
    const key =
        descriptor.name === CLOUDBURST_SOURCE_NAME ? `${descriptor.name}/${descriptor.version}` : descriptor.name;
    packHashes[key] = await hashSourceContent(fetched);
}

await writeFile(join(packageDir, 'pack-hashes.json'), `${JSON.stringify(packHashes, undefined, 4)}\n`);
console.log(`Wrote ${join(packageDir, 'pack-hashes.json')}`);
