import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bedrockServerPath } from '../../bedrock-data/utils/fetch/bds.ts';
import { cacheRoot } from '../../bedrock-data/utils/fetch/cloudburst.ts';
import { sourceCachePath } from '../../bedrock-data/utils/fetch/fetch.ts';
import { bdsDescriptor, loadBdsData } from '../../bedrock-data/utils/fetch/manifest.ts';

import { bedrockServerCachePath } from './bedrock-server.ts';
import { defaultProtocolVersion } from './paths.ts';

const sourcesPath = join(import.meta.dirname, '../../bedrock-data/sources.json');

describe('bedrockServerCachePath', () => {
    // The generators once spelled the cache layout out themselves, so when `fetch:sources`
    // started keying the directory by protocol version instead of by server build, the
    // recipe generator kept looking in the old place and the command its own error message
    // told you to run could not fix it. Both sides are derived here, from the fetch, rather
    // than compared against a literal that would have to be edited twice.
    it('is where fetch:sources unpacks the default protocol version', async () => {
        const data = await loadBdsData(sourcesPath);
        const unpacked = sourceCachePath(bdsDescriptor(data, defaultProtocolVersion), cacheRoot);
        await expect(bedrockServerCachePath(undefined, {})).resolves.toBe(unpacked);
        await expect(bedrockServerPath(defaultProtocolVersion, {})).resolves.toBe(unpacked);
    });

    it('follows --protocol to the other pinned version', async () => {
        const data = await loadBdsData(sourcesPath);
        for (const protocol of Object.keys(data.versions).map(Number)) {
            await expect(bedrockServerCachePath(protocol, {})).resolves.toBe(
                sourceCachePath(bdsDescriptor(data, protocol), cacheRoot)
            );
        }
    });

    it('names the pinned versions when asked for one no server is pinned for', async () => {
        await expect(bedrockServerCachePath(1, {})).rejects.toThrow(/pins no Bedrock Dedicated Server for protocol 1/);
    });
});
