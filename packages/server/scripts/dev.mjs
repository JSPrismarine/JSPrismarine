/**
 * Runs the dev server and the watch build side by side, and ends with the server's own exit.
 *
 * Both children share this process's terminal group, so a Ctrl-C reaches each of them once.
 * `concurrently` also forwarded it, which was a second interrupt to the server: it printed
 * "interrupt again to exit immediately", skipped saving the world and ended non-zero, and pnpm
 * reported the stop as a failed command. Here a signal is left to the group, and a signal
 * that arrives some other way (`kill`) is passed on once.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import path from 'node:path';

const buildLog = path.resolve('../../node_modules/.cache/jsprismarine-dev-build.log');
mkdirSync(path.dirname(buildLog), { recursive: true });
const log = openSync(buildLog, 'w');

const build = spawn(
    'turbo',
    ['run', 'build:watch', '--filter=@jsprismarine/server...', '--concurrency', '64', '--ui', 'stream'],
    { stdio: ['ignore', log, log] }
);
const server = spawn(
    process.execPath,
    ['--conditions=jsprismarine:dist', '--unhandled-rejections=strict', './dist/Server.es.js', '--watch'],
    { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }
);

let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
        // The terminal already sent a Ctrl-C to both children; a second one would be the
        // server's "exit immediately".
        if (signal !== 'SIGINT' && !stopping) server.kill(signal);
        stopping = true;
    });
}

/** What a stopped child counts as: a signal that ended it is a stop, not a failure. */
const codeOf = (code, signal) => code ?? (signal === null ? 1 : 0);

server.on('exit', (code, signal) => {
    stopping = true;
    build.kill('SIGTERM');
    process.exit(codeOf(code, signal));
});

build.on('exit', (code, signal) => {
    if (stopping) return;
    // The watch build ending by itself leaves a server nobody rebuilds; end it with the failure.
    stopping = true;
    server.kill('SIGTERM');
    process.exitCode = codeOf(code, signal) || 1;
});
