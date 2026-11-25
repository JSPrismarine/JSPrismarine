import { appendFileSync, readFileSync } from 'node:fs';

import { defaultUpdateSourceOf, UPSTREAM_REPOSITORY } from '../../packages/prismarine/src/updates/feed.ts';

const serverPackage = JSON.parse(readFileSync(new URL('../../packages/server/package.json', import.meta.url), 'utf8'));
const buildType = process.env.BUILD_TYPE;

if (buildType !== 'release' && buildType !== 'nightly') {
    throw new Error(`Unsupported BUILD_TYPE: ${buildType ?? '(unset)'}`);
}

const buildGitHash = process.env.GITHUB_SHA;
if (!buildGitHash || !/^[a-f0-9]{40}$/i.test(buildGitHash)) {
    throw new Error('GITHUB_SHA must contain the full 40-character commit hash');
}

/**
 * The version the next release gives the server: its entry in the release plan that
 * `changeset status --output` wrote to `RELEASE_PLAN`, or a patch bump when no pending changeset
 * touches it. A nightly is a prerelease of that version, so it sorts above the release it was built
 * after and meets an addon's `minServer` for the release it leads up to.
 */
const nextServerVersion = () => {
    const planPath = process.env.RELEASE_PLAN;
    if (!planPath) throw new Error('Nightly builds require RELEASE_PLAN, the output of `changeset status --output`');
    // Parsed JSON: changesets' release plan, `{ releases: [{ name, newVersion }] }`.
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    const planned = plan.releases?.find((release) => release.name === serverPackage.name)?.newVersion;
    if (planned) return planned;
    const [major, minor, patch] = serverPackage.version.split('-')[0].split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
};

let buildVersion = process.env.RELEASE_VERSION;
if (buildType === 'release' && !buildVersion) throw new Error('Release builds require RELEASE_VERSION');
if (buildType === 'nightly') {
    const runNumber = process.env.GITHUB_RUN_NUMBER;
    if (!runNumber || !/^\d+$/.test(runNumber)) {
        throw new Error('Nightly builds require GITHUB_RUN_NUMBER');
    }

    const startedAt = process.env.GITHUB_RUN_STARTED_AT ?? new Date().toISOString();
    const runDate = new Date(startedAt);
    if (Number.isNaN(runDate.getTime())) throw new Error(`Invalid workflow start time: ${startedAt}`);
    const date = runDate.toISOString().slice(0, 10).replaceAll('-', '');
    buildVersion = process.env.BUILD_VERSION || `${nextServerVersion()}-nightly.${date}.${runNumber}`;
}

const metadata = {
    BUILD_TIME: new Date().toISOString(),
    BUILD_GIT_HASH: buildGitHash,
    BUILD_VERSION: buildVersion,
    BUILD_FLAVOR: 'JSPrismarine',
    BUILD_TYPE: buildType,
    // A fork's builds read the feed its own workflows publish, not JSPrismarine's.
    BUILD_UPDATE_SOURCE: defaultUpdateSourceOf(process.env.GITHUB_REPOSITORY ?? UPSTREAM_REPOSITORY)
};
const lines = Object.entries(metadata).map(([name, value]) => `${name}=${value}`);

if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `${lines.join('\n')}\n`);
} else {
    process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `BUILD_VERSION=${buildVersion}\n`);
}
