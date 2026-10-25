/**
 * Packages the server as a Node single executable application.
 *
 * Three steps: bundle the server and all of its workspace dependencies into one
 * CommonJS file with rolldown, build the executable with `node --build-sea`,
 * and on macOS give the result the ad-hoc signature the kernel requires before
 * it will start the binary.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { yargsCjsImportMetaPlugin } from './yargs-cjs-import-meta.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major! < 25 || (major === 25 && minor! < 5)) {
    console.error(`Node ${process.versions.node} has no --build-sea; packaging needs Node 25.5 or newer.`);
    process.exit(1);
}
const seaDir = path.join(repoRoot, 'dist', 'sea');
const executable = path.join(repoRoot, 'dist', process.platform === 'win32' ? 'prismarine.exe' : 'prismarine');

mkdirSync(seaDir, { recursive: true });

console.log('Bundling the server...');
const bundle = await rolldown({
    input: path.join(repoRoot, 'packages', 'server', 'src', 'Server.ts'),
    platform: 'node',
    plugins: [yargsCjsImportMetaPlugin]
});
await bundle.write({
    file: path.join(seaDir, 'server.cjs'),
    format: 'cjs',
    inlineDynamicImports: true
});
await bundle.close();

console.log('Building the single executable...');
const seaConfig = path.join(seaDir, 'sea-config.json');
writeFileSync(
    seaConfig,
    `${JSON.stringify(
        {
            main: path.join(seaDir, 'server.cjs'),
            output: executable,
            disableExperimentalSEAWarning: true
        },
        null,
        4
    )}\n`
);
execFileSync(process.execPath, [`--build-sea=${seaConfig}`], { cwd: repoRoot, stdio: 'inherit' });

if (process.platform === 'darwin') {
    // An unsigned binary is killed by the kernel before it runs; an ad-hoc
    // signature is enough for a locally built executable.
    execFileSync('codesign', ['--sign', '-', '--force', executable], { stdio: 'inherit' });
}

const size = statSync(executable).size;
console.log(`Packaged ${path.relative(repoRoot, executable)} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
