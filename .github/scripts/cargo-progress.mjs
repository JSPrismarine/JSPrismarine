/**
 * Turns Cargo's progress bar into log lines a CI job can show.
 *
 * Cargo draws `Building [=====>    ] 210/560: crate, crate` on one line it rewrites with carriage
 * returns, and only on a terminal; `CARGO_TERM_PROGRESS_WHEN=always` makes it draw the bar into a
 * pipe too. This reads that output on stdin, prints every other line unchanged, and replaces the
 * bar with a line each time another twentieth of the build's units finish:
 *
 * ```
 * [cinnabar] 35% · 196/560 units
 * ```
 *
 * A second build in the same output, such as Cargo's for another package, starts its own count.
 *
 * ```sh
 * CARGO_TERM_PROGRESS_WHEN=always cargo build 2>&1 | node .github/scripts/cargo-progress.mjs cinnabar
 * ```
 */
import { createInterface } from 'node:readline';

/** How many steps a build is reported in, a line per step. */
const STEPS = 20;

const label = process.argv[2] ? `[${process.argv[2]}] ` : '';
const bar = /Building \[[^\]]*\]\s+(\d+)\/(\d+)/;

let total = 0;
let reportedStep = -1;

/**
 * Prints one line of Cargo's output, or the progress it stands for.
 *
 * @param {string} line - One line, carriage returns already split off.
 */
const handle = (line) => {
    const match = bar.exec(line);
    if (!match) {
        if (line.trim() !== '') process.stdout.write(`${line}\n`);
        return;
    }

    const done = Number(match[1]);
    const units = Number(match[2]);
    // Cargo fixes a build's total when it starts, so a different one is the next build.
    if (units !== total) {
        total = units;
        reportedStep = -1;
    }

    const step = units === 0 ? STEPS : Math.floor((done / units) * STEPS);
    if (step <= reportedStep) return;
    reportedStep = step;
    process.stdout.write(`${label}${Math.floor((done / units) * 100)}% · ${done}/${units} units\n`);
};

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
lines.on('line', (line) => {
    for (const part of line.split('\r')) handle(part);
});
