import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const MAX_RELEASE_BODY_CHARACTERS = 120_000;
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const serverUrl = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/+$/, '');
const apiUrl = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run');
const execFileAsync = promisify(execFile);

if (!repository || (!dryRun && !token)) {
    throw new Error('GITHUB_REPOSITORY is required, and GITHUB_TOKEN is required outside dry-run mode');
}

const publishedPackages = JSON.parse(process.env.PUBLISHED_PACKAGES ?? '[]');
if (
    !Array.isArray(publishedPackages) ||
    publishedPackages.some((pkg) => typeof pkg?.name !== 'string' || typeof pkg?.version !== 'string')
) {
    throw new Error('PUBLISHED_PACKAGES must be a JSON array of package names and versions');
}

const { stdout: workspacePackagesJson } = await execFileAsync(
    'pnpm',
    ['list', '--recursive', '--depth', '-1', '--json'],
    { cwd: repositoryRoot }
);
const workspacePackages = JSON.parse(workspacePackagesJson);
const packagesByName = new Map();
for (const workspacePackage of workspacePackages) {
    if (
        typeof workspacePackage.name !== 'string' ||
        typeof workspacePackage.version !== 'string' ||
        typeof workspacePackage.path !== 'string'
    ) {
        continue;
    }

    packagesByName.set(workspacePackage.name, {
        directory: workspacePackage.path,
        version: workspacePackage.version
    });
}

for (const publishedPackage of publishedPackages) {
    const packageInfo = packagesByName.get(publishedPackage.name);
    if (!packageInfo || packageInfo.version !== publishedPackage.version) {
        throw new Error(`Could not find ${publishedPackage.name}@${publishedPackage.version} in the pnpm workspace`);
    }

    const changelogPath = path.join(packageInfo.directory, 'CHANGELOG.md');
    let changelog;
    try {
        changelog = await readFile(changelogPath, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.info(`Skipping ${publishedPackage.name}: no CHANGELOG.md`);
            continue;
        }
        throw error;
    }

    const body = getChangelogEntry(changelog, publishedPackage.version);
    if (body === undefined) {
        throw new Error(`Could not find changelog entry for ${publishedPackage.name}@${publishedPackage.version}`);
    }

    const tagName = `${publishedPackage.name}@${publishedPackage.version}`;
    const relativeChangelogPath = path.relative(repositoryRoot, changelogPath).split(path.sep).join('/');
    const commitSha = process.env.GITHUB_SHA ?? 'master';
    const changelogUrl = `${serverUrl}/${repository}/blob/${commitSha}/${relativeChangelogPath}`;
    const releaseBody = limitReleaseBody(body, changelogUrl);

    if (dryRun) {
        console.info(`Dry run: ${tagName} release body is ${Array.from(releaseBody).length} characters`);
    } else {
        await createRelease({
            apiUrl,
            repository,
            token,
            tagName,
            body: releaseBody,
            prerelease: publishedPackage.version.includes('-')
        });
    }
}

function getChangelogEntry(changelog, version) {
    let headingDepth;
    let startIndex;
    let endIndex;

    const headingRegex = /^(#{1,6})\s(.*)$|^(`{3,})/gm;
    let match;
    while ((match = headingRegex.exec(changelog)) !== null) {
        if (match[3]) {
            const closingFenceRegex = new RegExp(`^${match[3]}`, 'gm');
            closingFenceRegex.lastIndex = headingRegex.lastIndex;
            const closingFence = closingFenceRegex.exec(changelog);
            if (!closingFence) {
                break;
            }
            headingRegex.lastIndex = closingFenceRegex.lastIndex;
            continue;
        }

        const depth = match[1].length;
        const heading = match[2].trim();
        if (heading === version) {
            headingDepth = depth;
            startIndex = headingRegex.lastIndex;
            continue;
        }

        if (headingDepth !== undefined && depth === headingDepth) {
            endIndex = match.index;
            break;
        }
    }

    if (startIndex === undefined) {
        return undefined;
    }

    return changelog.slice(startIndex, endIndex).trim();
}

function limitReleaseBody(body, changelogUrl) {
    const marker =
        `\n\n---\n\nRelease notes were shortened to fit GitHub's release body limit. ` +
        `See the full [CHANGELOG.md](${changelogUrl}).`;
    const bodyCharacters = Array.from(body);
    if (bodyCharacters.length <= MAX_RELEASE_BODY_CHARACTERS) {
        return body;
    }

    const markerLength = Array.from(marker).length;
    const availableLength = MAX_RELEASE_BODY_CHARACTERS - markerLength;
    const truncatedCharacters = bodyCharacters.slice(0, availableLength);
    const paragraphBreak = findLastSequence(truncatedCharacters, ['\n', '\n']);
    let endIndex = paragraphBreak;
    if (endIndex < availableLength * 0.75) {
        endIndex = findLastSequence(truncatedCharacters, ['\n']);
    }
    if (endIndex < availableLength * 0.9) {
        endIndex = truncatedCharacters.length;
    }

    const truncatedBody = truncatedCharacters.slice(0, endIndex).join('').trimEnd();
    const limitedBody = `${truncatedBody}${marker}`;
    if (Array.from(limitedBody).length > MAX_RELEASE_BODY_CHARACTERS) {
        throw new Error('Truncated release body exceeds its character limit');
    }

    console.info(
        `Shortened release notes from ${bodyCharacters.length} to ${Array.from(limitedBody).length} characters`
    );
    return limitedBody;
}

function findLastSequence(characters, sequence) {
    for (let index = characters.length - sequence.length; index >= 0; index--) {
        if (sequence.every((character, offset) => characters[index + offset] === character)) {
            return index;
        }
    }
    return -1;
}

async function createRelease({ apiUrl, repository, token, tagName, body, prerelease }) {
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    const releasesUrl = `${apiUrl}/repos/${repository}/releases`;
    const existingResponse = await fetch(`${releasesUrl}/tags/${encodeURIComponent(tagName)}`, { headers });

    if (existingResponse.ok) {
        console.info(`Skipping ${tagName}: GitHub release already exists`);
        return;
    }
    if (existingResponse.status !== 404) {
        throw await getApiError('Could not check for an existing GitHub release', existingResponse);
    }

    const response = await fetch(releasesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: tagName,
            tag_name: tagName,
            body,
            prerelease
        })
    });
    if (!response.ok) {
        throw await getApiError(`Could not create GitHub release ${tagName}`, response);
    }

    console.info(`Created GitHub release ${tagName}`);
}

async function getApiError(message, response) {
    const responseBody = await response.text();
    return new Error(`${message} (${response.status}): ${responseBody}`);
}
