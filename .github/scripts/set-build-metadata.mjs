import { appendFileSync, readFileSync } from 'node:fs';

const serverPackage = JSON.parse(readFileSync(new URL('../../packages/server/package.json', import.meta.url), 'utf8'));
const buildType = process.env.BUILD_TYPE;

if (buildType !== 'release' && buildType !== 'nightly') {
    throw new Error(`Unsupported BUILD_TYPE: ${buildType ?? '(unset)'}`);
}

const buildGitHash = process.env.GITHUB_SHA;
if (!buildGitHash || !/^[a-f0-9]{40}$/i.test(buildGitHash)) {
    throw new Error('GITHUB_SHA must contain the full 40-character commit hash');
}

const baseVersion = buildType === 'release' ? process.env.RELEASE_VERSION : serverPackage.version;
if (!baseVersion) throw new Error('A base version is required to build JSPrismarine');

let buildVersion = baseVersion;
if (buildType === 'nightly') {
    const runNumber = process.env.GITHUB_RUN_NUMBER;
    if (!runNumber || !/^\d+$/.test(runNumber)) {
        throw new Error('Nightly builds require GITHUB_RUN_NUMBER');
    }

    const startedAt = process.env.GITHUB_RUN_STARTED_AT ?? new Date().toISOString();
    const runDate = new Date(startedAt);
    if (Number.isNaN(runDate.getTime())) throw new Error(`Invalid workflow start time: ${startedAt}`);
    const date = runDate.toISOString().slice(0, 10).replaceAll('-', '');
    buildVersion = process.env.BUILD_VERSION ?? `${baseVersion}-nightly.${date}.${runNumber}`;
}

const metadata = {
    BUILD_TIME: new Date().toISOString(),
    BUILD_GIT_HASH: buildGitHash,
    BUILD_VERSION: buildVersion,
    BUILD_FLAVOR: 'JSPrismarine',
    BUILD_TYPE: buildType
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
