import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const head = process.env.GITHUB_SHA ?? 'HEAD';
const repository = process.env.GITHUB_REPOSITORY ?? 'JSPrismarine/JSPrismarine';
const serverUrl = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/+$/, '');
const runtimePackageDirectories = getRuntimePackageDirectories();

const previousReleaseTag = runGit([
    'describe',
    '--tags',
    '--first-parent',
    '--abbrev=0',
    '--match',
    '@jsprismarine/server@*',
    `${head}^`
]);
const commitLines = runGit(['log', '--no-merges', '--reverse', '--format=%H%x09%s', `${previousReleaseTag}..${head}`]);
const highlights = new Map([
    ['feat', []],
    ['fix', []],
    ['perf', []]
]);

for (const line of commitLines.split('\n').filter(Boolean)) {
    const separatorIndex = line.indexOf('\t');
    const commit = line.slice(0, separatorIndex);
    const subject = line.slice(separatorIndex + 1);
    const match = /^(feat|fix|perf)(?:\([^)]+\))?!?: (.+)$/.exec(subject);
    if (!match || !changesRuntimeSource(commit)) continue;

    const [, type, description] = match;
    const label = description[0].toUpperCase() + description.slice(1);
    const escapedLabel = label.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
    highlights.get(type).push(`- [${escapedLabel}](${serverUrl}/${repository}/commit/${commit})`);
}

const sectionTitles = new Map([
    ['feat', 'Features'],
    ['fix', 'Fixes'],
    ['perf', 'Performance']
]);
const sections = [...highlights]
    .filter(([, entries]) => entries.length > 0)
    .map(([type, entries]) => `### ${sectionTitles.get(type)}\n\n${entries.join('\n')}`);

const body =
    sections.length > 0
        ? `## Highlights\n\n${sections.join('\n\n')}`
        : `## Highlights\n\nNo user-facing changes were detected in runtime source commits since \`${previousReleaseTag}\`.`;
const macOSNotice = `### macOS first launch

The macOS executables are ad-hoc signed and are not notarized. If macOS blocks a downloaded executable, remove its quarantine attribute before running it:

\`\`\`sh
xattr -d com.apple.quarantine ./prismarine-darwin-arm64
\`\`\`

For the app bundle, run this after extracting its ZIP:

\`\`\`sh
xattr -dr com.apple.quarantine JSPrismarine-arm64.app
\`\`\`

Use the \`x64\` asset names on Intel Macs.`;

console.error(
    `Generated ${[...highlights.values()].reduce((total, entries) => total + entries.length, 0)} highlights since ${previousReleaseTag}`
);
process.stdout.write(`${body}\n\n${macOSNotice}\n`);

function runGit(args) {
    return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

function changesRuntimeSource(commit) {
    const files = runGit(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commit]);
    return files.split('\n').some((file) => {
        return (
            [...runtimePackageDirectories].some((directory) => file.startsWith(`${directory}/src/`)) &&
            !/(^|\/)(?:__tests__|tests?)\//i.test(file) &&
            !/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file)
        );
    });
}

function getRuntimePackageDirectories() {
    const packagesByName = new Map();
    for (const group of ['packages', 'tools']) {
        const groupPath = path.join(repositoryRoot, group);
        for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;

            const directory = path.join(group, entry.name);
            const manifestPath = path.join(repositoryRoot, directory, 'package.json');
            let manifest;
            try {
                manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            } catch (error) {
                if (error.code === 'ENOENT') continue;
                throw error;
            }

            if (typeof manifest.name === 'string') {
                packagesByName.set(manifest.name, {
                    directory,
                    dependencies: Object.keys(manifest.dependencies ?? {})
                });
            }
        }
    }

    const serverPackage = packagesByName.get('@jsprismarine/server');
    if (!serverPackage) throw new Error('Could not find the @jsprismarine/server package');

    const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
    const directories = new Set();
    const pending = ['@jsprismarine/server', ...Object.keys(rootManifest.dependencies ?? {})];
    while (pending.length > 0) {
        const packageName = pending.pop();
        const packageInfo = packagesByName.get(packageName);
        if (!packageInfo || directories.has(packageInfo.directory)) continue;

        directories.add(packageInfo.directory);
        pending.push(...packageInfo.dependencies);
    }

    return directories;
}
