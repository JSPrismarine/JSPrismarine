/**
 * Builds the API reference one package at a time. TypeDoc's `packages` strategy converts every
 * package in turn, then merges the projects. This script converts each package in its own process,
 * several at once, keeps each package's project as JSON, and converts again only the packages whose
 * files, or whose workspace dependencies' files, changed since. TypeDoc's `merge` strategy then
 * merges the JSON and renders the site, as the `packages` strategy would have.
 *
 * Run from `tools/docs`. The JSON lives under the site's VitePress cache, which CI restores.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import path from 'node:path';

import { isRecord } from '../../scripts/isRecord.mts';
import { hashFiles } from './build-cache.mts';
import { repoRoot } from './project.mts';

const docsDir = path.join(repoRoot, 'tools', 'docs');
const cacheDir = path.join(docsDir, 'site', '.vitepress', 'cache', 'api');

/** What every package's conversion reads besides the packages: TypeScript, TypeDoc and their configs. */
const sharedInputs = [
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig*.json',
    'tools/docs/package.json',
    'tools/docs/typedoc.json',
    'tools/docs/api-package.mts'
];

// The largest package's conversion holds about 2 GB at its peak.
const bytesPerConversion = 3 * 1024 ** 3;
const parallelism = Math.max(1, Math.min(availableParallelism(), Math.floor(totalmem() / bytesPerConversion)));

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];

interface Package {
    /** The package's folder under `packages/`, which also names its JSON. */
    folder: string;
    /** The package's directory relative to `tools/docs`, as TypeDoc's entry points name it. */
    entryPoint: string;
}

/** The packages TypeDoc's `packages` strategy would convert, read from `typedoc.json`. */
function listPackages(): Package[] {
    const config = readJson(path.join(docsDir, 'typedoc.json'));
    if (!isRecord(config)) throw new Error('tools/docs/typedoc.json is not an object.');
    const excluded = stringList(config.exclude);
    const directories = stringList(config.entryPoints)
        .flatMap((pattern) => globSync(pattern, { cwd: docsDir }))
        .filter((entryPoint) => !excluded.some((pattern) => path.matchesGlob(entryPoint, pattern)))
        .filter((entryPoint) => existsSync(path.join(docsDir, entryPoint, 'package.json')))
        .sort();
    return directories.map((entryPoint) => ({ folder: path.basename(entryPoint), entryPoint }));
}

interface Workspace {
    /** Each package's folder under `packages/`, by package name. */
    folders: Map<string, string>;
    /** The names of the packages each folder's manifest depends on. */
    dependencies: Map<string, string[]>;
}

function readWorkspace(): Workspace {
    const workspace: Workspace = { folders: new Map(), dependencies: new Map() };
    for (const manifestPath of globSync('packages/*/package.json', { cwd: repoRoot })) {
        const manifest = readJson(path.join(repoRoot, manifestPath));
        if (!isRecord(manifest) || typeof manifest.name !== 'string') continue;
        const folder = path.basename(path.dirname(manifestPath));
        workspace.folders.set(manifest.name, folder);
        workspace.dependencies.set(
            folder,
            ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((field) => {
                const entries = manifest[field];
                return isRecord(entries) ? Object.keys(entries) : [];
            })
        );
    }
    return workspace;
}

/**
 * The hash of what a package's conversion reads: its own files and those of every workspace package
 * it depends on, directly or not, since its pages show their types.
 */
function packageHash(pkg: Package, { folders, dependencies }: Workspace): string {
    const seen = new Set<string>([pkg.folder]);
    const queue = [...(dependencies.get(pkg.folder) ?? [])];
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
        const folder = folders.get(name);
        if (folder === undefined || seen.has(folder)) continue;
        seen.add(folder);
        queue.push(...(dependencies.get(folder) ?? []));
    }
    return hashFiles([...sharedInputs, ...[...seen].map((folder) => `packages/${folder}/**`)]);
}

function convert(pkg: Package, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('node', ['--import', 'tsx', 'api-package.mts', pkg.entryPoint, output], {
            cwd: docsDir,
            stdio: 'inherit'
        });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`Converting ${pkg.folder} exited with code ${code}.`))
        );
    });
}

async function inPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const worker = async () => {
        for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const packages = listPackages();
const workspace = readWorkspace();
mkdirSync(cacheDir, { recursive: true });

const stale: { pkg: Package; hash: string }[] = [];
for (const pkg of packages) {
    const hash = packageHash(pkg, workspace);
    const stamp = path.join(cacheDir, `${pkg.folder}.inputs`);
    const json = path.join(cacheDir, `${pkg.folder}.json`);
    if (existsSync(json) && existsSync(stamp) && readFileSync(stamp, 'utf8') === hash) continue;
    rmSync(stamp, { force: true });
    stale.push({ pkg, hash });
}
console.error(
    `Converting ${stale.length} of ${packages.length} packages, ${parallelism} at a time; the rest are unchanged.`
);
await inPool(stale, parallelism, async ({ pkg, hash }) => {
    await convert(pkg, path.join(cacheDir, `${pkg.folder}.json`));
    writeFileSync(path.join(cacheDir, `${pkg.folder}.inputs`), hash);
});

execFileSync(
    'pnpm',
    [
        'exec',
        'typedoc',
        '--entryPointStrategy',
        'merge',
        ...packages.map((pkg) => path.relative(docsDir, path.join(cacheDir, `${pkg.folder}.json`)))
    ],
    { cwd: docsDir, stdio: 'inherit' }
);
