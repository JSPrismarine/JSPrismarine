/**
 * Installs a packed native package from an npm project, the way users do: npm runs its install
 * script, after the project approves it where npm asks for that, so the build is downloaded and
 * loads. The manifest packed for the test points at the artifacts directory, so nothing is fetched
 * from a release. The package's workspace dependencies are packed from the checkout too, so the
 * test installs what this commit would publish rather than older versions from the registry.
 *
 *     node scripts/native/consumer-test.mts <package-id> <artifacts-dir>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { nativePackage, repoRoot, sharedExtension } from './packages.mts';

const pkg = nativePackage(process.argv[2]);
const artifacts = resolve(process.argv[3] ?? '');
if (process.argv[3] === undefined || !existsSync(artifacts)) {
    throw new Error('Usage: node scripts/native/consumer-test.mts <package-id> <artifacts-dir>');
}
const packageDir = join(repoRoot, pkg.dir);
const manifestPath = join(packageDir, 'native', 'manifest.json');
const checkedIn = readFileSync(manifestPath, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'jsp-native-consumer-'));

const run = (command: string, args: string[], cwd: string): void => {
    console.log(`$ ${command} ${args.join(' ')}   (in ${cwd})`);
    execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};

/** A workspace package's manifest; only the fields this script reads. */
interface Manifest {
    name: string;
    dependencies?: Record<string, string>;
}
const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;

/** Every workspace package's directory, by name. */
const workspace = new Map<string, string>();
for (const entry of readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })) {
    const dir = join(repoRoot, 'packages', entry.name);
    if (entry.isDirectory() && existsSync(join(dir, 'package.json'))) workspace.set(readManifest(dir).name, dir);
}

/** The package and every workspace package it depends on at run time, dependencies first. */
const toPack: string[] = [];
const collect = (name: string): void => {
    if (toPack.includes(name)) return;
    const dir = workspace.get(name);
    if (dir === undefined) throw new Error(`${name} is not a workspace package`);
    for (const [dependency, spec] of Object.entries(readManifest(dir).dependencies ?? {})) {
        if (spec.startsWith('workspace:')) collect(dependency);
    }
    toPack.push(name);
};
collect(pkg.name);

/** Loads the library from a project and returns what happened. */
const load = (project: string): { ok: boolean; output: string } => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', pkg.loadScript], {
        cwd: project,
        encoding: 'utf8'
    });
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
};

const expect = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    console.log(`ok: ${message}`);
};

try {
    run(
        process.execPath,
        [
            join(repoRoot, 'scripts', 'native', 'write-manifest.mts'),
            process.argv[2]!,
            '--artifacts',
            artifacts,
            '--base-url',
            artifacts
        ],
        repoRoot
    );
    const tarballs: Record<string, string> = {};
    for (const name of toPack) {
        const dir = workspace.get(name)!;
        const destination = join(work, 'packs', name.replace('/', '-'));
        mkdirSync(destination, { recursive: true });
        run('pnpm', ['run', 'build'], dir);
        run('pnpm', ['pack', '--pack-destination', destination], dir);
        tarballs[name] = `file:${join(
            destination,
            readdirSync(destination).find((file) => file.endsWith('.tgz'))!
        )}`;
    }

    const project = join(work, 'npm');
    mkdirSync(project);
    // The workspace dependencies are direct dependencies and overrides, so npm installs the packed
    // ones and never looks the published versions up.
    writeFileSync(
        join(project, 'package.json'),
        JSON.stringify(
            { name: 'consumer-npm', private: true, type: 'module', dependencies: tarballs, overrides: tarballs },
            null,
            2
        )
    );
    const installed = (): boolean => {
        const prebuilds = join(project, 'node_modules', ...pkg.name.split('/'), 'prebuilds');
        return (
            existsSync(prebuilds) &&
            readdirSync(prebuilds, { recursive: true, encoding: 'utf8' }).some((file) =>
                file.endsWith(`${pkg.library}.${sharedExtension(process.platform)}`)
            )
        );
    };

    run('npm', ['install', '--no-audit', '--no-fund'], project);
    // npm 12 skips a dependency's install script until the project approves it.
    if (!installed()) {
        const blocked = load(project);
        expect(
            !blocked.ok && blocked.output.includes('npm install-scripts approve'),
            `loading before approval says how to approve the install script (${blocked.output.trim()})`
        );
        run('npm', ['install-scripts', 'approve', pkg.name], project);
        run('npm', ['rebuild', pkg.name], project);
    }
    expect(installed(), 'npm runs the install script and downloads the build');
    const loaded = load(project);
    expect(loaded.ok, `the npm project loads the library (${loaded.output.trim()})`);
} finally {
    writeFileSync(manifestPath, checkedIn);
    rmSync(work, { recursive: true, force: true });
}
