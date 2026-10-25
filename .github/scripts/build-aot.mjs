import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const [target, outputPath] = process.argv.slice(2);
const supportedTargets = new Set([
    'bun-linux-x64',
    'bun-linux-arm64',
    'bun-linux-x64-musl',
    'bun-linux-arm64-musl',
    'bun-darwin-x64',
    'bun-darwin-arm64',
    'bun-windows-x64',
    'bun-windows-arm64'
]);

if (!supportedTargets.has(target) || !outputPath) {
    throw new Error('Usage: node .github/scripts/build-aot.mjs <bun-target> <output-path>');
}

if (
    target.startsWith('bun-windows-') &&
    (process.platform !== 'win32' || process.arch !== target.slice('bun-windows-'.length))
) {
    throw new Error(
        `Windows icons require a native ${target} build; Bun ignores Windows metadata when cross-compiling`
    );
}

const buildMetadata = ['BUILD_TIME', 'BUILD_GIT_HASH', 'BUILD_VERSION', 'BUILD_FLAVOR', 'BUILD_TYPE'];
const args = [
    'build',
    './packages/server/src/Server.ts',
    '--compile',
    '--sourcemap',
    `--target=${target}`,
    `--outfile=${outputPath}`,
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig'
];

for (const name of buildMetadata) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set before building an executable`);
    args.push('--define', `${name}=${JSON.stringify(value)}`);
}

if (target.startsWith('bun-windows-')) {
    args.push('--windows-icon=.github/assets/icon.ico');
}

const bunExecutable = process.platform === 'win32' ? 'bun.exe' : 'bun';
execFileSync(bunExecutable, args, { cwd: repositoryRoot, stdio: 'inherit' });
