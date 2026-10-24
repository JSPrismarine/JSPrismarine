/**
 * Development supervisor for the JSPrismarine server.
 *
 * Replaces `node --watch`, which leaves stdin dead after its first restart
 * (nodejs/node#35536): the restarted child never receives raw-mode input again,
 * so the interactive console stops working. `tsx watch` is no better - its
 * watcher consumes stdin itself and treats any Return key as a restart request
 * (privatenumber/tsx#163).
 *
 * This runner keeps the console alive by never touching stdin: the server is
 * spawned with fully inherited stdio, so every generation of the child process
 * owns the real TTY and can manage raw mode itself. On a source change the
 * child is asked to shut down gracefully (SIGTERM -> world save) and a fresh
 * one is spawned only after the previous one has fully exited, which avoids
 * racing two processes over the terminal state.
 *
 * Runs directly under Node's type stripping, so it stays free of enums,
 * namespaces and parameter properties.
 */

import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, watch } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ensureSubmodules } from '../../../scripts/ensure-submodules.mts';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.resolve(serverDir, '..');

/** How long a change is allowed to settle before a restart is triggered. */
const DEBOUNCE_MS = 150;
/** How long a child may take to shut down gracefully before it is killed. */
const FORCE_KILL_MS = 10_000;

type AnsiColor = '31' | '32' | '33' | '36';

/**
 * Paths (relative to a package's `src/`) that must not restart the server:
 * tests, the resources submodule (a generator input, handled by the generate
 * watcher) and the generator's own output (a regeneration already requests one
 * restart for the whole batch).
 */
const shouldIgnore = (pkg: string, filename: string): boolean =>
    filename.includes('.test.') ||
    (pkg === 'bedrock-data' && (filename.startsWith('resources') || filename.startsWith('generated')));

const log = (message: string, color: AnsiColor = '33'): void => console.log(`\x1b[${color}m[dev] ${message}\x1b[0m`);

let child: ChildProcess | null = null;
let restartQueued = false;
let shuttingDown = false;
let forceKillTimer: NodeJS.Timeout | undefined;
const serverArgs = process.argv.slice(2);
if (serverArgs[0] === '--') serverArgs.shift();

const start = (): void => {
    if (child) return;
    child = spawn(process.execPath, ['--import', 'tsx', './src/Server.ts', ...serverArgs], {
        cwd: serverDir,
        stdio: 'inherit'
    });

    child.on('exit', (code) => {
        child = null;
        clearTimeout(forceKillTimer);
        restoreTerminal();

        if (restartQueued) {
            restartQueued = false;
            log('restarting...', '32');
            start();
            return;
        }
        if (shuttingDown || code === 0 || code === null) {
            process.exit(code ?? 0);
        }
        // A crash (usually a half-finished edit) should not end the session.
        log(`server exited with code ${code}, waiting for changes...`, '31');
    });
};

/**
 * Drops raw mode in case the child was killed before it could clean up, so the
 * next child (and ultimately the user's shell) starts from a sane terminal.
 */
const restoreTerminal = (): void => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
};

const stopChild = (): void => {
    if (!child) return;
    child.kill('SIGTERM');
    clearTimeout(forceKillTimer);
    forceKillTimer = setTimeout(() => {
        log('graceful shutdown timed out, killing...', '31');
        child?.kill('SIGKILL');
    }, FORCE_KILL_MS);
};

let debounceTimer: NodeJS.Timeout | undefined;
const requestRestart = (reason: string): void => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (generating) return;
        log(`change detected: ${reason}`);
        if (child) {
            restartQueued = true;
            stopChild();
        } else {
            start();
        }
    }, DEBOUNCE_MS);
};

const bedrockDataDir = path.join(packagesDir, 'bedrock-data');
let generating = false;

/**
 * Regenerates the bedrock-data JSON, then requests the one restart that picks
 * the fresh data up. Restarts are held back while the generator runs.
 */
const generateBedrockData = ({ restart = true }: { restart?: boolean } = {}): void => {
    generating = true;
    log('generating bedrock-data...', '36');
    const result = spawnSync('pnpm', ['run', 'generate'], { cwd: bedrockDataDir, stdio: 'inherit' });
    generating = false;
    if (result.status !== 0) log('bedrock-data generation failed', '31');
    if (restart) requestRestart(path.join('packages', 'bedrock-data', 'src', 'generated'));
};

let generateTimer: NodeJS.Timeout | undefined;
const requestGenerate = (): void => {
    clearTimeout(generateTimer);
    generateTimer = setTimeout(() => generateBedrockData(), DEBOUNCE_MS);
};

// A fresh clone without --recursive has an empty resources submodule; fetch it
// before anything tries to generate from it.
ensureSubmodules();

// The generator's inputs live outside the restart watchers: the resources
// submodule and the generator script itself.
for (const dir of [path.join(bedrockDataDir, 'src', 'resources'), path.join(bedrockDataDir, 'utils')]) {
    try {
        watch(dir, { recursive: true }, () => requestGenerate());
    } catch {
        // The directory is optional; nothing to watch there.
    }
}

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(packagesDir, entry.name, 'src');
    try {
        watch(src, { recursive: true }, (_event, filename) => {
            if (!filename || !/\.(ts|json)$/.test(filename)) return;
            if (shouldIgnore(entry.name, filename)) return;
            requestRestart(path.join('packages', entry.name, 'src', filename));
        });
    } catch {
        // Not every package has a src directory; nothing to watch there.
    }
}

// While the console has the terminal in raw mode, Ctrl+C reaches the child as a
// keypress and the server shuts itself down. Outside raw mode (during boot or a
// restart gap) the signal hits the whole foreground process group, so the
// supervisor must survive it and let the child drive the shutdown. SIGHUP is
// included because the PTY can hang up (or emit a stray one mid-restart), and
// unhandled it would kill the supervisor silently while the child lives on.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        shuttingDown = true;
        if (child) stopChild();
        else process.exit(0);
    });
}

if (!existsSync(path.join(bedrockDataDir, 'src', 'generated'))) {
    generateBedrockData({ restart: false });
}

log(`watching ${packagesDir.replace(`${process.cwd()}/`, '')} for changes`, '36');
start();
