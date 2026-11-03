/**
 * Runs the terrain fill benchmark, one process per arm per round, interleaved.
 *
 * Wall clock on a busy host swings by several times, so the only honest shape is the best of
 * many runs with each arm in a fresh process and the arms alternating. A load spike then lands
 * on every arm rather than on whichever one happened to go first.
 *
 * Run `pnpm --filter @jsprismarine/worldgen run bench`. Pass a round count as the first
 * argument; the default is 5.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const ARMS = ['fill', 'router', 'density', 'generated'] as const;

interface ArmResult {
    readonly arm: string;
    readonly millisecondsPerChunk: number;
    readonly checksum: number;
    readonly digest: string;
    readonly octaveSamplesPerChunk: number;
    readonly cellsPerChunk: number;
    readonly compileMilliseconds: number;
    readonly compileHeapBytes: number;
    readonly generatedFunctionCount: number;
    readonly generatedFunctionBytes: number;
    readonly closureFallbackCount: number;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const rounds = Number.parseInt(process.argv[2] ?? '5', 10);
const work = mkdtempSync(path.join(tmpdir(), 'jsp-worldgen-bench-'));

try {
    const bundle = await rolldown({ input: path.join(here, 'chunkFill.ts'), platform: 'node' });
    const entry = path.join(work, 'chunkFill.mjs');
    await bundle.write({ file: entry, format: 'esm', inlineDynamicImports: true });
    await bundle.close();

    const best = new Map<string, ArmResult>();
    for (let round = 0; round < rounds; round++) {
        for (let offset = 0; offset < ARMS.length; offset++) {
            const arm = ARMS[(round + offset) % ARMS.length];
            if (arm === undefined) throw new Error(`No benchmark arm at offset ${offset}`);
            const output = execFileSync(process.execPath, ['--expose-gc', entry, arm], { encoding: 'utf8' });
            const result: ArmResult = JSON.parse(output);
            const previous = best.get(arm);
            if (!previous || result.millisecondsPerChunk < previous.millisecondsPerChunk) best.set(arm, result);
            process.stderr.write(`round ${round + 1} ${arm}: ${result.millisecondsPerChunk.toFixed(2)} ms/chunk\n`);
        }
    }

    process.stdout.write(`\n${rounds} rounds, best of each arm, milliseconds per chunk\n`);
    for (const arm of ARMS) {
        const result = best.get(arm);
        if (!result) continue;
        process.stdout.write(
            `  ${arm.padEnd(10)} ${result.millisecondsPerChunk.toFixed(2).padStart(8)} ms/chunk, ` +
                `${result.cellsPerChunk} cells/chunk, ` +
                `${result.octaveSamplesPerChunk} octave samples/chunk, digest ${result.digest}\n`
        );
        if (arm !== 'density') {
            process.stdout.write(
                `  compile ${result.compileMilliseconds.toFixed(2)} ms, ` +
                    `${result.compileHeapBytes} heap bytes, ` +
                    `${result.generatedFunctionCount} functions, ` +
                    `${result.generatedFunctionBytes} source bytes, ` +
                    `${result.closureFallbackCount} closure fallbacks\n`
            );
        }
    }

    // An arm counts the same blocks every round, so a checksum that moves between rounds means
    // the fill is not deterministic.
    const checksums = ARMS.map((arm) => `${arm} ${best.get(arm)?.checksum ?? Number.NaN}`).join(', ');
    process.stdout.write(`\nchecksums: ${checksums}\n`);
} finally {
    rmSync(work, { recursive: true, force: true });
}
