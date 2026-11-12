/**
 * Installs the packed package from an npm project, the way users do: npm runs its install script,
 * so the build is downloaded and loads. The manifest packed for the test points at the artifacts
 * directory, so nothing is fetched from a release.
 *
 *     node scripts/consumer-test.mts <artifacts-dir>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { platformKey, sharedLibraryName } from '../src/platform.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(process.argv[2] ?? '');
if (!existsSync(artifacts)) throw new Error('Usage: node scripts/consumer-test.mts <artifacts-dir>');
const manifestPath = join(packageDir, 'native', 'manifest.json');
const checkedIn = readFileSync(manifestPath, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'jsp-native-consumer-'));
const key = platformKey();
const installedFile = (project: string) =>
    join(project, 'node_modules', '@jsprismarine', 'native-network', 'prebuilds', key, sharedLibraryName());

const run = (command: string, args: string[], cwd: string): void => {
    console.log(`$ ${command} ${args.join(' ')}   (in ${cwd})`);
    execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};

/** Loads the library from a project and returns what happened. */
const load = (project: string): { ok: boolean; output: string } => {
    const script =
        "import('@jsprismarine/native-network').then(async (m) => { const n = await m.NativeNetwork.load(); console.log('loaded queue', n.queue); n.close(); }).catch((e) => { console.log(e.message); process.exit(3); })";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: project,
        encoding: 'utf8'
    });
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
};

const expect = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    console.log(`ok: ${message}`);
};

const project = (name: string): string => {
    const dir = join(work, name);
    mkdirSync(dir);
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify(
            {
                name: `consumer-${name}`,
                private: true,
                type: 'module',
                dependencies: { '@jsprismarine/native-network': `file:${tarball}` }
            },
            null,
            2
        )
    );
    return dir;
};

let tarball = '';
try {
    run(
        process.execPath,
        [join(packageDir, 'scripts', 'write-manifest.mts'), '--artifacts', artifacts, '--base-url', artifacts],
        packageDir
    );
    run('pnpm', ['run', 'build'], packageDir);
    run('pnpm', ['pack', '--pack-destination', work], packageDir);
    tarball = join(
        work,
        readdirSync(work).find((name) => name.endsWith('.tgz'))!
    );

    const npm = project('npm');
    run('npm', ['install', '--no-audit', '--no-fund'], npm);
    expect(existsSync(installedFile(npm)), 'npm runs the install script and downloads the build');
    const npmLoad = load(npm);
    expect(npmLoad.ok, `the npm project loads the library (${npmLoad.output.trim()})`);
} finally {
    writeFileSync(manifestPath, checkedIn);
    rmSync(work, { recursive: true, force: true });
}
