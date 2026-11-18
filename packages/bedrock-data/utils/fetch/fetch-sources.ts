/**
 * Fetches the pinned upstream sources listed in `sources.json` into
 * `node_modules/.cache/jsprismarine/<source>/<version>/`, verifying each
 * digest before unpacking, then writes `pack-hashes.json` beside the
 * manifest so a version bump shows which top-level folders changed.
 *
 * The Bedrock Dedicated Server is pinned per Bedrock protocol version and the
 * Java Edition server jar per release, and only the selected one of each is
 * fetched, because each is tens of megabytes.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`, with
 * `--protocol <n>` to pick a server version other than the manifest default
 * and `--java <release>` to pick a Java release other than `defaultVersion`.
 * `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
 * `JSP_VANILLA_MCDOC_PATH` and `JSP_GEYSER_MAPPINGS_PATH` point at local
 * copies for offline work.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fetchSource, hashSourceContent, type SourcePackHashes } from './fetch.ts';
import { hashFile } from './hash.ts';
import {
    BDS_SOURCE_NAME,
    bdsDescriptor,
    JAVA_SOURCE_NAME,
    javaServerDescriptor,
    loadBdsData,
    loadJavaServerData,
    loadSourceDescriptors,
    parseJavaArgument,
    parseProtocolArgument
} from './manifest.ts';
import { cacheRoot, packageDir } from './paths.ts';

const manifestPath = join(packageDir, 'sources.json');
const packHashesPath = join(packageDir, 'pack-hashes.json');
const protocolVersion = parseProtocolArgument(process.argv);
const javaRelease = parseJavaArgument(process.argv);

const descriptors = [
    bdsDescriptor(await loadBdsData(manifestPath), protocolVersion),
    javaServerDescriptor(await loadJavaServerData(manifestPath), javaRelease),
    ...(await loadSourceDescriptors(manifestPath))
];

const readExistingPackHashes = async (): Promise<Record<string, SourcePackHashes>> => {
    try {
        // The file is JSON this script wrote; parse gives it no type.
        return JSON.parse(await readFile(packHashesPath, 'utf8')) as Record<string, SourcePackHashes>;
    } catch {
        return {};
    }
};

// Only one version of each server is fetched per run, so the others' hashes are kept
// rather than dropped: the file records every version measured so far.
const packHashes = await readExistingPackHashes();

for (const descriptor of descriptors) {
    const fetched = await fetchSource(descriptor, { cacheRoot });
    const state = fetched.fromOverride ? 'override' : fetched.fromCache ? 'cached' : 'downloaded';
    console.log(`${descriptor.name} ${descriptor.version}: ${state} (${fetched.contentPath})`);
    // An override jar is taken on its path alone, and `--java` keys its entry. A jar for another
    // release would record that release's bytes under this one, so only a jar matching the pinned
    // digest is recorded.
    if (fetched.fromOverride && descriptor.name === JAVA_SOURCE_NAME) {
        const digest = await hashFile(fetched.contentPath, descriptor.hash.algorithm);
        if (digest !== descriptor.hash.value) {
            console.warn(
                `${descriptor.envOverride} has ${descriptor.hash.algorithm} ${digest}, but sources.json pins ` +
                    `${descriptor.hash.value} for Java ${descriptor.version}; not recording its hashes.`
            );
            continue;
        }
    }
    // The servers have an entry per version, so their keys carry the version too.
    const versioned = descriptor.name === BDS_SOURCE_NAME || descriptor.name === JAVA_SOURCE_NAME;
    packHashes[versioned ? `${descriptor.name}/${descriptor.version}` : descriptor.name] =
        await hashSourceContent(fetched);
}

const sorted = Object.fromEntries(Object.entries(packHashes).sort(([a], [b]) => (a < b ? -1 : 1)));
await writeFile(packHashesPath, `${JSON.stringify(sorted, undefined, 4)}\n`);
console.log(`Wrote ${packHashesPath}`);
