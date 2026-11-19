/**
 * Writes a native package's `native/manifest.json` from a directory of built artifacts: every
 * `<platform>-<library>` file and the `<platform>.build.json` report beside it, as the native
 * library workflow lays them out. The publish job runs it once the files are attached to the
 * release; the consumer test runs it against a local directory.
 *
 *     node scripts/native/write-manifest.mts <package-id> --artifacts <dir> --base-url <url> [--out <file>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { nativePackage, repoRoot } from './packages.mts';

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { artifacts: { type: 'string' }, 'base-url': { type: 'string' }, out: { type: 'string' } }
});
if (values.artifacts === undefined || values['base-url'] === undefined) {
    throw new Error(
        'Usage: node scripts/native/write-manifest.mts <package-id> --artifacts <dir> --base-url <url> [--out <file>]'
    );
}
const pkg = nativePackage(positionals[0]);
const artifacts = resolve(values.artifacts);
const build = pkg.sourceHash();

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
    // Our own build reports, written by each package's build-native.mts. A build without a
    // static archive for scriptc has no `static`.
    const parsed = JSON.parse(readFileSync(join(artifacts, report), 'utf8')) as {
        platform: string;
        sourceHash: string;
        shared: { file: string };
        static?: { file: string };
    };
    if (!parsed.shared.file.startsWith(pkg.library)) continue;
    if (parsed.sourceHash !== build) {
        throw new Error(`${report} was built from native sources ${parsed.sourceHash}, not ${build}`);
    }
    platforms[parsed.platform] = {
        shared: describe(`${parsed.platform}-${parsed.shared.file}`),
        ...(parsed.static === undefined ? {} : { static: describe(`${parsed.platform}-${parsed.static.file}`) })
    };
}
if (Object.keys(platforms).length === 0) throw new Error(`No ${pkg.library} build reports in ${artifacts}`);

const manifest = {
    $comment:
        "Written by the publish job of the package's native library workflow (scripts/native/write-manifest.mts). `build` is the hash of the native sources the builds were made from (src/nativeHash.ts), and `baseUrl` the GitHub release that holds them.",
    build,
    baseUrl: values['base-url'],
    platforms
};
const out = resolve(values.out ?? join(repoRoot, pkg.dir, 'native', 'manifest.json'));
writeFileSync(out, `${JSON.stringify(manifest, null, 4)}\n`);
console.log(`Wrote ${out} for ${Object.keys(platforms).join(', ')}`);
