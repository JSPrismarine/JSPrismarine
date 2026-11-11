import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Publishes the packages a release just put on npm to GitHub Packages as well. It runs only for a
// release: the unstable and nightly builds stay on npm. GitHub Packages takes scoped names whose
// scope is the owner of the repository, which every `@jsprismarine/*` package is.
const registry = 'https://npm.pkg.github.com';
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const token = process.env.GITHUB_PACKAGES_TOKEN;
const dryRun = process.argv.includes('--dry-run');
const execFileAsync = promisify(execFile);

if (!dryRun && !token) {
    throw new Error('GITHUB_PACKAGES_TOKEN is required outside dry-run mode');
}

const publishedPackages = JSON.parse(process.env.PUBLISHED_PACKAGES ?? '[]');
if (
    !Array.isArray(publishedPackages) ||
    publishedPackages.some((pkg) => typeof pkg?.name !== 'string' || typeof pkg?.version !== 'string')
) {
    throw new Error('PUBLISHED_PACKAGES must be a JSON array of package names and versions');
}

// The release job's `.npmrc` holds the npm token and nothing for this registry, so pnpm gets its own
// user config. The token stays a placeholder in the file, which pnpm fills in from the environment.
const configDirectory = await mkdtemp(path.join(tmpdir(), 'github-packages-'));
const userConfig = path.join(configDirectory, '.npmrc');
await writeFile(userConfig, `//${new URL(registry).host}/:_authToken=\${GITHUB_PACKAGES_TOKEN}\n`);

const environment = {
    ...process.env,
    NPM_CONFIG_USERCONFIG: userConfig,
    // Provenance is signed for npm; GitHub Packages rejects it.
    NPM_CONFIG_PROVENANCE: 'false'
};

/** Whether this version is already on GitHub Packages, which a rerun of a half-finished release hits. */
async function isPublished({ name, version }) {
    try {
        const { stdout } = await execFileAsync(
            'pnpm',
            ['view', `${name}@${version}`, 'version', '--registry', registry],
            {
                cwd: repositoryRoot,
                env: environment
            }
        );
        return stdout.trim() === version;
    } catch {
        // A missing version is a 404; any other failure surfaces when the publish below fails.
        return false;
    }
}

const failures = [];
try {
    for (const publishedPackage of publishedPackages) {
        const label = `${publishedPackage.name}@${publishedPackage.version}`;
        if (dryRun) {
            console.log(`Would publish ${label} to ${registry}`);
            continue;
        }
        if (await isPublished(publishedPackage)) {
            console.log(`${label} is already on GitHub Packages`);
            continue;
        }
        try {
            await execFileAsync(
                'pnpm',
                ['--filter', publishedPackage.name, 'publish', '--registry', registry, '--no-git-checks'],
                { cwd: repositoryRoot, env: environment }
            );
            console.log(`Published ${label} to GitHub Packages`);
        } catch (error) {
            // Keep going: one package's failure should not leave the rest of the release off the registry.
            failures.push(label);
            console.error(`::error::Could not publish ${label} to GitHub Packages: ${error.stderr ?? error.message}`);
        }
    }
} finally {
    await rm(configDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
    throw new Error(`${failures.length} package(s) did not reach GitHub Packages: ${failures.join(', ')}`);
}
