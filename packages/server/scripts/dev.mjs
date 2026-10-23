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
 */

import { spawn } from 'node:child_process';
import { readdirSync, watch } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.resolve(serverDir, '..');

/** How long a change is allowed to settle before a restart is triggered. */
const DEBOUNCE_MS = 150;
/** How long a child may take to shut down gracefully before it is killed. */
const FORCE_KILL_MS = 10_000;

/** Paths (relative to a package's `src/`) that never affect the running server. */
const shouldIgnore = (pkg, filename) =>
    filename.includes('.test.') || (pkg === 'bedrock-data' && filename.startsWith('resources'));

const log = (message, color = '33') => console.log(`\x1b[${color}m[dev] ${message}\x1b[0m`);

let child = null;
let restartQueued = false;
let shuttingDown = false;
let forceKillTimer = null;

const start = () => {
    child = spawn(process.execPath, ['--import', 'tsx', './src/Server.ts'], {
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
const restoreTerminal = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
};

const stopChild = () => {
    if (!child) return;
    child.kill('SIGTERM');
    clearTimeout(forceKillTimer);
    forceKillTimer = setTimeout(() => {
        log('graceful shutdown timed out, killing...', '31');
        child?.kill('SIGKILL');
    }, FORCE_KILL_MS);
};

let debounceTimer = null;
const requestRestart = (reason) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        log(`change detected: ${reason}`);
        if (child) {
            restartQueued = true;
            stopChild();
        } else {
            start();
        }
    }, DEBOUNCE_MS);
};

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
// supervisor must survive it and let the child drive the shutdown.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        shuttingDown = true;
        if (child) stopChild();
        else process.exit(0);
    });
}

log(`watching ${packagesDir.replace(`${process.cwd()}/`, '')} for changes`, '36');
start();
