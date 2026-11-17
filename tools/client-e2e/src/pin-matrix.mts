/**
 * CLI for the client e2e workflow: prints the cinnabar builds CI runs as a JSON array of
 * `{ protocol, transport, commit, name, build, cacheKey }`, one per pin of a served protocol.
 * `build` and `cacheKey` are what the pin's caches go by, so the workflow takes its cache keys
 * from them instead of rebuilding the naming. `--latest-only` keeps the newest served protocol's
 * pins. `--pinned-keys` instead prints the cache key of every commit `cinnabar.json` pins, the
 * entries that pruning keeps.
 */
import { parseArgs } from 'node:util';

import { buildCacheKey, pinMatrix, readManifest } from './cinnabar.mts';

const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options: {
        'latest-only': { type: 'boolean', default: false },
        'pinned-keys': { type: 'boolean', default: false }
    }
});

console.log(
    JSON.stringify(
        values['pinned-keys']
            ? [...new Set(readManifest().versions.map((version) => buildCacheKey(version.commit)))]
            : pinMatrix(values['latest-only'])
    )
);
