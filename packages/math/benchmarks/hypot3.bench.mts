/**
 * Times `hypot3` against `Math.hypot` and the inexact `Math.sqrt` form: `pnpm bench`.
 *
 * Each variant runs in its own process. Sharing one timing loop makes the call site megamorphic
 * and measures the dispatch, not the function.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { hypot3 } from '../src/hypot3.ts';

const SAMPLES = 4096;
const ROUNDS = 4000;
const data = Float64Array.from({ length: SAMPLES * 3 }, (_, index) => ((index * 2654435761) % 2000) / 10 - 100);

const variants = {
    'Math.hypot': (x: number, y: number, z: number) => Math.hypot(x, y, z),
    hypot3,
    'sqrt (inexact)': (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
};

const name = process.argv[2] as keyof typeof variants | undefined;

if (name === undefined) {
    for (const variant of Object.keys(variants)) {
        process.stdout.write(
            execFileSync(process.execPath, [fileURLToPath(import.meta.url), variant], { encoding: 'utf8' })
        );
    }
} else {
    const distance = variants[name];
    let total = 0;
    const pass = (): void => {
        for (let i = 0; i < SAMPLES; i++) total += distance(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!);
    };

    for (let warmup = 0; warmup < 200; warmup++) pass();
    const started = performance.now();
    for (let round = 0; round < ROUNDS; round++) pass();
    const nanoseconds = ((performance.now() - started) * 1e6) / (ROUNDS * SAMPLES);
    console.log(`${name.padEnd(15)} ${nanoseconds.toFixed(2)} ns/call (checksum ${total.toExponential(3)})`);
}
