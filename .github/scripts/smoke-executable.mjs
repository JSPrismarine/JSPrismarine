import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Starts a compiled executable in an empty directory and stops it again, failing on any error.
 *
 * Every worker the server runs is a separate module the compile has to embed, and a missing one
 * fails only when the binary first starts it: the generation pool while the start region is
 * prepared, the RakNet socket when the server listens, and LevelDB's table builder when `stop`
 * saves the world. Reaching "now listening" and then stopping cleanly exercises all three.
 *
 * Usage: node .github/scripts/smoke-executable.mjs <bun-target> <binary>
 * A target this host cannot run, which release builds cross-compile, is skipped.
 */
const [target, binary] = process.argv.slice(2);
if (!target || !binary) throw new Error('Usage: node .github/scripts/smoke-executable.mjs <bun-target> <binary>');

const hostPlatform = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
const [, platform, arch, libc] = target.split('-');
if (platform !== hostPlatform || arch !== process.arch || libc !== undefined) {
    console.log(`Skipping the ${target} smoke run on this ${process.platform}-${process.arch} host`);
    process.exit(0);
}

const executable = process.platform === 'win32' && !binary.toLowerCase().endsWith('.exe') ? `${binary}.exe` : binary;
/** Long enough for a cold runner to provision its data and prepare the start region. */
const BUDGET_MS = 600_000;

const directory = mkdtempSync(path.join(os.tmpdir(), 'jsp-smoke-'));
const child = spawn(path.resolve(executable), ['--no-tui'], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });

const errors = [];
let listening = false;
let buffered = '';
const onOutput = (chunk) => {
    process.stdout.write(chunk);
    buffered += chunk.toString();
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
        const line = buffered.slice(0, newline).replace(/\u001b\[[0-9;]*m/g, '');
        buffered = buffered.slice(newline + 1);
        if (/\bERROR\b|^error:|Cannot find module|ModuleNotFound/.test(line)) errors.push(line);
        if (!listening && /now listening on port/.test(line)) {
            listening = true;
            child.stdin.write('stop\n');
        }
    }
};
child.stdout.on('data', onOutput);
child.stderr.on('data', onOutput);

const deadline = setTimeout(() => {
    errors.push(`the executable did not ${listening ? 'stop' : 'start listening'} within ${BUDGET_MS} ms`);
    child.kill('SIGKILL');
}, BUDGET_MS);

const code = await new Promise((resolve) => child.once('exit', (exitCode) => resolve(exitCode)));
clearTimeout(deadline);
rmSync(directory, { recursive: true, force: true });

if (!listening) errors.push('the executable exited before it started listening');
if (code !== 0) errors.push(`the executable exited with code ${code}`);
if (errors.length > 0) {
    console.error(`\n${executable} failed its smoke run:\n${errors.map((line) => `  ${line}`).join('\n')}`);
    process.exit(1);
}
console.log(`\n${executable} started, listened and stopped cleanly`);
