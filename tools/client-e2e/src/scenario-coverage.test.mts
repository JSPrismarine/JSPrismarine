import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './cinnabar.mts';
import type { ScenarioWindow } from './scenario-coverage.mts';
import { buildScenarioCoverageMap, newestCoverageFile, parseCoverageFileName } from './scenario-coverage.mts';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coverage-exit.mjs');

/** A stand-in server: boots by calling `boot`, then runs the function each input line names. */
const MODULE = `export function boot(): number {
    return 1;
}

export function alpha(): number {
    return 2;
}

export function beta(): number {
    return 3;
}

export function gamma(): number {
    return 4;
}
`;
const MAIN = `import { createInterface } from 'node:readline';
import * as mod from './mod.ts';

mod.boot();
console.log('ready');
createInterface({ input: process.stdin }).on('line', (line) => {
    if (line === 'exit') process.exit(0);
    (mod as Record<string, () => number>)[line]?.();
    console.log('done');
});
`;

let root: string | undefined;
afterEach(() => {
    if (root !== undefined) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
});

describe('parseCoverageFileName', () => {
    it('reads the process, time and sequence', () => {
        expect(parseCoverageFileName('coverage-12-1795212677739-3.json')).toEqual({
            pid: 12,
            timestamp: 1795212677739,
            sequence: 3
        });
        expect(parseCoverageFileName('report.json')).toBeUndefined();
    });

    it('orders by time, then sequence', () => {
        expect(newestCoverageFile(['coverage-1-20-0.json', 'coverage-1-30-0.json', 'coverage-1-30-1.json'])).toBe(
            'coverage-1-30-1.json'
        );
    });
});

describe('buildScenarioCoverageMap', () => {
    it('gives a scenario the functions it ran, and everything else to always', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-scenario-coverage-'));
        const source = path.join(root, 'packages', 'demo', 'src');
        const coverage = path.join(root, 'coverage');
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(coverage);
        fs.writeFileSync(path.join(source, 'mod.ts'), MODULE);
        fs.writeFileSync(path.join(source, 'main.ts'), MAIN);

        const child = spawn(process.execPath, ['--import', 'tsx', '--import', hook, path.join(source, 'main.ts')], {
            cwd: repoRoot,
            env: { ...process.env, NODE_V8_COVERAGE: coverage },
            stdio: ['pipe', 'pipe', 'inherit']
        });
        const lines = createInterface({ input: child.stdout });
        const nextLine = (): Promise<string> => new Promise((resolve) => lines.once('line', resolve));
        const exited = new Promise((resolve) => child.once('exit', resolve));
        const pid = child.pid ?? 0;
        const snapshot = async (): Promise<string> => {
            const ours = (): string[] => fs.readdirSync(coverage).filter((name) => name.startsWith(`coverage-${pid}-`));
            const before = new Set(ours());
            child.kill('SIGUSR2');
            for (;;) {
                const newest = newestCoverageFile(ours().filter((name) => !before.has(name)));
                if (newest !== undefined) return newest;
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        };
        const run = async (name: string): Promise<void> => {
            const done = nextLine();
            child.stdin.write(`${name}\n`);
            await done;
        };

        expect(await nextLine()).toBe('ready');
        const start = await snapshot();
        await run('alpha');
        const end = await snapshot();
        await run('beta');
        child.stdin.write('exit\n');
        await exited;

        const windows: ScenarioWindow[] = [{ scenario: 'alpha-scenario', start, end }];
        const map = buildScenarioCoverageMap(coverage, windows, root);
        const file = map.files['packages/demo/src/mod.ts'];
        // Matched on both ends: the transpiler's export getters map to the export lines too.
        const ownersOf = (start: number, end: number): number[] | undefined =>
            file?.functions.find(([from, to]) => from === start && to === end)?.slice(2);

        expect(map.scenarios).toEqual(['alpha-scenario']);
        expect(file?.module).toEqual([-1]);
        expect(ownersOf(5, 7)).toEqual([0]);
        expect(ownersOf(1, 3)).toEqual([-1]);
        expect(ownersOf(9, 11)).toEqual([-1]);
        expect(ownersOf(13, 15)).toEqual([]);
    });
});
