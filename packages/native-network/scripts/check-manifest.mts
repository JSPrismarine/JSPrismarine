/**
 * Fails when the manifest a release would publish does not match the native sources, or lacks a
 * platform the package supports, so no published version points at builds of other sources.
 * The root `release` script runs it before `changeset publish`; the Native network workflow
 * publishes the builds and opens a pull request for the manifest when a push to master leaves
 * it behind.
 *
 *     node scripts/check-manifest.mts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nativeSourceHash } from '../src/nativeHash.ts';

/** Every platform a release ships a build for; Android is a stretch goal and not required. */
export const SUPPORTED_PLATFORMS = [
    'darwin-arm64',
    'linux-arm64-gnu',
    'linux-arm64-musl',
    'linux-x64-gnu',
    'linux-x64-musl',
    'win32-x64'
] as const;

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Our own manifest; src/manifest.ts checks its full shape where the package loads it.
const manifest = JSON.parse(readFileSync(join(packageDir, 'native', 'manifest.json'), 'utf8')) as {
    build: string;
    platforms: Record<string, unknown>;
};
const sources = nativeSourceHash(packageDir);
const problems: string[] = [];
if (manifest.build !== sources) {
    problems.push(
        `native/manifest.json names builds of native sources "${manifest.build}", but the sources are ${sources}`
    );
}
for (const platform of SUPPORTED_PLATFORMS) {
    if (manifest.platforms[platform] === undefined) problems.push(`native/manifest.json has no build for ${platform}`);
}
if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error('Run the Native network workflow with `publish` on this branch to build and record them.');
    process.exit(1);
}
console.log(`native/manifest.json covers every platform, built from native sources ${sources}`);
