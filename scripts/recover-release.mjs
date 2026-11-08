/**
 * Recovers a release whose packages were published but whose standalone executables were not.
 *
 * The Release workflow publishes to npm first and builds the Bun executables after, so a failure
 * in a build job leaves a version on npm with a GitHub release that has no downloads. Running the
 * workflow again would try to publish the packages a second time. This starts it in its recovery
 * mode instead, which skips the publish and builds the tag's source with the build scripts of the
 * branch it is started from.
 *
 * Usage: node scripts/recover-release.mjs [version] [--run]
 *
 * Without a version it takes the newest stable `@jsprismarine/server@*` tag. Without `--run` it only reports
 * what is published, what the release holds and what is missing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const run = args.includes('--run');
const requested = args.find((arg) => !arg.startsWith('--'));

const tool = (command, commandArgs, options = {}) =>
    execFileSync(command, commandArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();

tool('git', ['fetch', '--tags', '--quiet']);
// The newest stable server tag: changesets tags each published package `<name>@<version>`, and
// the nightly snapshots carry a prerelease suffix and publish no executables.
const sourceTag = (version) => `@jsprismarine/server@${version}`;
const version =
    requested ??
    tool('git', ['tag', '--list', '@jsprismarine/server@*', '--sort=-v:refname'])
        .split('\n')
        .map((name) => name.replace('@jsprismarine/server@', ''))
        .find((name) => /^\d+\.\d+\.\d+$/.test(name));
if (!version) throw new Error('No stable @jsprismarine/server@* tag found; pass the version to recover');

const releaseTag = `jsprismarine@${version}`;
try {
    tool('git', ['rev-parse', '--verify', `refs/tags/${sourceTag(version)}`]);
} catch {
    throw new Error(
        `${sourceTag(version)} is not a tag; the release job never got as far as tagging, so there is nothing to recover`
    );
}

// Recovery builds executables for what is already on npm. A version that never published is a
// release that has to be run, not recovered.
try {
    tool('npm', ['view', `@jsprismarine/server@${version}`, 'version']);
} catch {
    throw new Error(`@jsprismarine/server@${version} is not on npm; rerun the Release workflow instead`);
}

// The targets come from the workflow, so this list cannot drift from what the build makes.
const targets = [
    ...new Set(readFileSync('.github/workflows/release.yml', 'utf8').match(/bun-(?:linux|darwin|windows)-[a-z0-9-]+/g))
];
let assets = [];
try {
    assets = JSON.parse(tool('gh', ['release', 'view', releaseTag, '--json', 'assets'])).assets.map(({ name }) => name);
} catch {
    console.log(`${releaseTag}: no GitHub release yet`);
}
const missing = targets.filter((target) => !assets.some((name) => name.startsWith(`prismarine-${target.slice(4)}`)));

console.log(
    `${releaseTag}: on npm, ${assets.length} release assets, ${missing.length} of ${targets.length} executables missing`
);
for (const target of missing) console.log(`  missing ${target}`);

if (missing.length === 0) {
    console.log('Nothing to recover.');
} else if (!run) {
    console.log(`\nRun again with --run to start the recovery of ${version}.`);
} else {
    const ref = tool('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    execFileSync('gh', ['workflow', 'run', 'release.yml', '--ref', ref, '-f', `recover-version=${version}`], {
        stdio: 'inherit'
    });
    console.log(`Started the recovery of ${version} from ${ref}; watch it with: gh run list --workflow release.yml`);
}
