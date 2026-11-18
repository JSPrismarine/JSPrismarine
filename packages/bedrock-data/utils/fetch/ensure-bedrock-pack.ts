/**
 * Makes sure the Bedrock vanilla behavior pack is in the cache, so `pnpm dev` starts a server
 * that has mobs and villagers that trade.
 *
 * The pack defines every entity, and the server composes it from the cache rather than
 * shipping it. Without it the server still starts, with a single entity type: nothing spawns,
 * `/summon` refuses every type, and the End has no dragon. A fresh clone and every git worktree
 * begins with an empty cache, so this runs as a prerequisite of `pnpm dev`, next to
 * `ensure:worldgen`.
 *
 * Two downloads make the pack: the Bedrock Dedicated Server, which the server reads first, and
 * `bedrock-samples`, which supplies what the server ships unreadable or leaves out, such as the
 * butcher's, the cleric's and the stone mason's trades.
 *
 * On a warm cache this reads a few directory names and exits. It does not fail the start when
 * the download fails: the server reports the missing pack itself, and somebody working offline
 * may be testing something that needs no mobs.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { bedrockSamplesCacheFolder, defaultBdsCacheFolder } from '../../src/sources.ts';
import { cacheRoot, packageDir } from './paths.ts';
import { fetchSource } from './fetch.ts';
import { bdsDescriptor, loadBdsData, loadSourceDescriptors } from './manifest.ts';

/**
 * Whether the pinned version of each half is cached, in the layouts the server's pack stack
 * reads. Another version in the cache does not count: the server prefers the pinned one, and a
 * checkout that fetched the previous pin would otherwise keep running the previous release.
 */
const bdsCached = (root: string): boolean =>
    existsSync(join(root, 'bds', defaultBdsCacheFolder, 'unpacked', 'behavior_packs'));

const samplesCached = (root: string): boolean => {
    const unpacked = join(root, 'bedrock-samples', bedrockSamplesCacheFolder, 'unpacked');
    return (
        existsSync(unpacked) &&
        readdirSync(unpacked).some((checkout) => existsSync(join(unpacked, checkout, 'behavior_pack', 'entities')))
    );
};

const override = process.env.JSP_VANILLA_BEHAVIOR_PACK;
if (override !== undefined && override !== '') {
    console.log(`The Bedrock vanilla behavior pack comes from JSP_VANILLA_BEHAVIOR_PACK (${override})`);
    process.exit(0);
}

if (bdsCached(cacheRoot) && samplesCached(cacheRoot)) {
    console.log(`The Bedrock vanilla behavior pack is ready in ${cacheRoot}`);
    process.exit(0);
}

try {
    const manifest = join(packageDir, 'sources.json');
    const wanted = [
        ...(bdsCached(cacheRoot) ? [] : [bdsDescriptor(await loadBdsData(manifest))]),
        ...(samplesCached(cacheRoot)
            ? []
            : (await loadSourceDescriptors(manifest)).filter((descriptor) => descriptor.name === 'bedrock-samples'))
    ];
    for (const descriptor of wanted) {
        console.log(`Downloading ${descriptor.name} ${descriptor.version}; this happens once.`);
        const fetched = await fetchSource(descriptor, { cacheRoot });
        console.log(`${descriptor.name} is ready in ${fetched.contentPath}`);
    }
} catch (error) {
    console.warn(
        `\nCould not download the Bedrock vanilla behavior pack: ${error instanceof Error ? error.message : String(error)}\n` +
            'The server will start without all of its content. Re-run with a network connection, or set JSP_BDS_PATH and ' +
            'JSP_BEDROCK_SAMPLES_PATH to local copies, or JSP_VANILLA_BEHAVIOR_PACK to an unpacked behavior pack.\n'
    );
}
