/**
 * Writes `native/manifest.json` from a directory of built artifacts: every
 * `<platform>-<library>` file and the `<platform>.build.json` report beside it, as the Native
 * network workflow lays them out. The publish job runs it once the files are attached to the
 * release; the consumer test runs it against a local directory.
 *
 *     node scripts/write-manifest.mts --artifacts <dir> --base-url <url> [--out <file>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { nativeSourceHash } from '../src/nativeHash.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
    options: { artifacts: { type: 'string' }, 'base-url': { type: 'string' }, out: { type: 'string' } }
});
if (values.artifacts === undefined || values['base-url'] === undefined) {
    throw new Error('Usage: node scripts/write-manifest.mts --artifacts <dir> --base-url <url> [--out <file>]');
}
const artifacts = resolve(values.artifacts);
const build = nativeSourceHash(packageDir);

const describe = (file: string) => ({
    file,
    bytes: statSync(join(artifacts, file)).size,
    sha256: createHash('sha256')
        .update(readFileSync(join(artifacts, file)))
        .digest('hex')
});

const platforms: Record<string, { shared: ReturnType<typeof describe>; static?: ReturnType<typeof describe> }> = {};
for (const report of readdirSync(artifacts)
    .filter((name) => name.endsWith('.build.json'))
    .sort()) {
    // Our own build reports, written by build-native.mts.
    const parsed = JSON.parse(readFileSync(join(artifacts, report), 'utf8')) as {
        platform: string;
        sourceHash: string;
        shared: { file: string };
        static: { file: string };
    };
    if (parsed.sourceHash !== build) {
        throw new Error(`${report} was built from native sources ${parsed.sourceHash}, not ${build}`);
    }
    platforms[parsed.platform] = {
        shared: describe(`${parsed.platform}-${parsed.shared.file}`),
        static: describe(`${parsed.platform}-${parsed.static.file}`)
    };
}
if (Object.keys(platforms).length === 0) throw new Error(`No build reports in ${artifacts}`);

const manifest = {
    $comment:
        "Written by the Native network workflow's publish job. `build` is the hash of the native sources the builds were made from (src/nativeHash.ts), and `baseUrl` the GitHub release that holds them.",
    build,
    baseUrl: values['base-url'],
    platforms
};
const out = resolve(values.out ?? join(packageDir, 'native', 'manifest.json'));
writeFileSync(out, `${JSON.stringify(manifest, null, 4)}\n`);
console.log(`Wrote ${out} for ${Object.keys(platforms).join(', ')}`);
