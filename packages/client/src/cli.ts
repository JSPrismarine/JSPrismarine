import { run } from './cli/Cli';

/**
 * The `jsp-client` entry point.
 *
 * Deliberately thin, and deliberately here rather than in a package of its own: the command
 * line is a way of driving the client, not a separate product, and a package that only ever
 * has one consumer earns nothing but a build step.
 *
 * The exit code is set rather than the process killed, so anything still draining - a report
 * being written, a disconnect going out - finishes first.
 *
 * Chained rather than awaited at the top level: this package emits CJS alongside ESM, and
 * top-level await cannot be expressed in the former. `packages/server` gets away with it
 * only because it is ESM-only.
 */
/**
 * Something referenced, held for as long as the command runs.
 *
 * Every handle the client owns is `unref`ed on purpose - a library must not keep its host
 * process alive - which in a process whose *only* job is that client leaves nothing at all
 * holding the event loop open. Node then exits between the first await and the answer: the
 * ping printed nothing, the fleet connected nobody, and both returned zero. Invisible under
 * a test runner, which keeps the loop alive by itself.
 */
const keepAlive = setInterval(() => {}, 1 << 30);

void run(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .finally(() => clearInterval(keepAlive));
