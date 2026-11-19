/**
 * Fails when the manifest a release would publish does not match a package's native sources, or
 * lacks a platform the package publishes, so no published version points at builds of other
 * sources. The root `release` script runs it for every native package before `changeset publish`;
 * each package's native library workflow publishes the builds and opens a pull request for the
 * manifest when a push to master leaves it behind.
 *
 *     node scripts/native/check-manifest.mts [<package-id>...]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NATIVE_PACKAGES, nativePackage, repoRoot } from './packages.mts';

const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(NATIVE_PACKAGES);
let failed = false;
for (const id of ids) {
    const pkg = nativePackage(id);
    const path = join(pkg.dir, 'native', 'manifest.json');
    // Our own manifest; the package's src/manifest.ts checks its full shape where it loads it.
    const manifest = JSON.parse(readFileSync(join(repoRoot, path), 'utf8')) as {
        build: string;
        platforms: Record<string, unknown>;
    };
    const sources = pkg.sourceHash();
    const problems: string[] = [];
    if (manifest.build !== sources) {
        problems.push(`${path} names builds of native sources "${manifest.build}", but the sources are ${sources}`);
    }
    for (const platform of pkg.platforms) {
        if (manifest.platforms[platform] === undefined) problems.push(`${path} has no build for ${platform}`);
    }
    if (problems.length > 0) {
        failed = true;
        for (const problem of problems) console.error(problem);
        console.error(
            `Run the ${pkg.name} native library workflow with \`publish\` on this branch to build and record them.`
        );
    } else {
        console.log(`${path} covers every platform, built from native sources ${sources}`);
    }
}
if (failed) process.exit(1);
