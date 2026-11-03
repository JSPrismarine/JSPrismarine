import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const ARMS = ['legacy-bigint', 'legacy-lanes', 'xoroshiro-bigint', 'xoroshiro-lanes', 'worldgen'] as const;
const here = path.dirname(fileURLToPath(import.meta.url));
const rounds = Number.parseInt(process.argv[2] ?? '3', 10);
const work = mkdtempSync(path.join(tmpdir(), 'jsp-random-bench-'));

try {
    const bundle = await rolldown({ input: path.join(here, 'randomDraws.ts'), platform: 'node' });
    const entry = path.join(work, 'randomDraws.mjs');
    await bundle.write({ file: entry, format: 'esm', inlineDynamicImports: true });
    await bundle.close();
    const best = new Map<
        string,
        {
            readonly arm: string;
            readonly draws: number;
            readonly milliseconds: number;
            readonly checksum: string;
            readonly runtimeGcEvents: number;
        }
    >();
    for (let round = 0; round < rounds; round++) {
        const orderedArms = round % 2 === 0 ? ARMS : [...ARMS].reverse();
        for (const arm of orderedArms) {
            // The child writes a fixed JSON result; this boundary types the serialized benchmark record.
            const result = JSON.parse(
                execFileSync(process.execPath, ['--expose-gc', entry, arm], { encoding: 'utf8' })
            ) as {
                readonly arm: string;
                readonly draws: number;
                readonly milliseconds: number;
                readonly checksum: string;
                readonly runtimeGcEvents: number;
            };
            const previous = best.get(arm);
            if (!previous || result.milliseconds < previous.milliseconds) best.set(arm, result);
            process.stderr.write(`round ${round + 1} ${arm}: ${result.milliseconds.toFixed(2)} ms\n`);
        }
    }
    process.stdout.write(`${rounds} rounds, best draw time per arm\n`);
    for (const arm of ARMS) {
        const result = best.get(arm);
        if (!result) continue;
        process.stdout.write(
            `${result.arm.padEnd(18)} ${result.milliseconds.toFixed(2).padStart(8)} ms, ` +
                `${result.draws.toLocaleString()} iterations, ${result.runtimeGcEvents} GC events, ` +
                `checksum ${result.checksum}\n`
        );
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
