/**
 * Makes sure the Bedrock vanilla behavior pack is in the cache, so `pnpm dev` starts a server
 * that has mobs.
 *
 * The pack defines every entity, and the server composes it from the cache rather than
 * shipping it. Without it the server still starts, with a single entity type: nothing spawns,
 * `/summon` refuses every type, and the End has no dragon. A fresh clone and every git worktree
 * begins with an empty cache, so this runs as a prerequisite of `pnpm dev`, next to
 * `ensure:worldgen`.
 *
 * On a warm cache this reads a few directory names and exits. It does not fail the start when
 * the download fails: the server reports the missing pack itself, and somebody working offline
 * may be testing something that needs no mobs.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { cacheRoot, packageDir } from './cloudburst.ts';
import { fetchSource } from './fetch.ts';
import { bdsDescriptor, loadBdsData } from './manifest.ts';

/** The cache folders that hold the vanilla pack, in the layouts the server's pack stack reads. */
const bedrockPackCached = (root: string): boolean => {
    const versions = (directory: string): string[] => (existsSync(directory) ? readdirSync(directory) : []);

    const bds = versions(join(root, 'bds')).some((version) =>
        existsSync(join(root, 'bds', version, 'unpacked', 'behavior_packs'))
    );
    const samples = versions(join(root, 'bedrock-samples')).some((version) =>
        versions(join(root, 'bedrock-samples', version, 'unpacked')).some((checkout) =>
            existsSync(join(root, 'bedrock-samples', version, 'unpacked', checkout, 'behavior_pack', 'entities'))
        )
    );
    return bds || samples;
};

const override = process.env.JSP_VANILLA_BEHAVIOR_PACK;
if (override !== undefined && override !== '') {
    console.log(`The Bedrock vanilla behavior pack comes from JSP_VANILLA_BEHAVIOR_PACK (${override})`);
    process.exit(0);
}

if (bedrockPackCached(cacheRoot)) {
    console.log(`The Bedrock vanilla behavior pack is ready in ${cacheRoot}`);
    process.exit(0);
}

try {
    const descriptor = bdsDescriptor(await loadBdsData(join(packageDir, 'sources.json')));
    console.log(`Downloading the Bedrock Dedicated Server ${descriptor.version} pack; this happens once.`);
    const fetched = await fetchSource(descriptor, { cacheRoot });
    console.log(`The Bedrock vanilla behavior pack is ready in ${fetched.contentPath}`);
} catch (error) {
    console.warn(
        `\nCould not download the Bedrock vanilla behavior pack: ${error instanceof Error ? error.message : String(error)}\n` +
            'The server will start without mobs. Re-run with a network connection, or set JSP_BDS_PATH to a ' +
            'Bedrock Dedicated Server archive or JSP_VANILLA_BEHAVIOR_PACK to an unpacked behavior pack.\n'
    );
}
