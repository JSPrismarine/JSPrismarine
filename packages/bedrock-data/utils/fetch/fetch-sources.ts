/**
 * Fetches the pinned upstream sources listed in `sources.json` into
 * `node_modules/.cache/jsprismarine/<source>/<version>/`, verifying each
 * digest before unpacking, then writes `pack-hashes.json` beside the
 * manifest so a version bump shows which top-level folders changed.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`.
 * `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
 * `JSP_VANILLA_MCDOC_PATH` and `JSP_GEYSER_MAPPINGS_PATH` point at local
 * copies for offline work.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchSource, hashSourceContent, type SourcePackHashes } from './fetch.ts';
import { loadSourceDescriptors } from './manifest.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');

const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
const packHashes: Record<string, SourcePackHashes> = {};

for (const descriptor of descriptors) {
    const fetched = await fetchSource(descriptor, { cacheRoot });
    const state = fetched.fromOverride ? 'override' : fetched.fromCache ? 'cached' : 'downloaded';
    console.log(`${descriptor.name} ${descriptor.version}: ${state} (${fetched.contentPath})`);
    packHashes[descriptor.name] = await hashSourceContent(fetched);
}

await writeFile(join(packageDir, 'pack-hashes.json'), `${JSON.stringify(packHashes, undefined, 4)}\n`);
console.log(`Wrote ${join(packageDir, 'pack-hashes.json')}`);
