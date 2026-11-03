import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');

const runFrom = (cwd: string, runner: string, entry: string): readonly string[] => {
    const output: unknown = JSON.parse(execFileSync(process.execPath, [runner, entry], { cwd, encoding: 'utf8' }));
    if (!isStringArray(output)) throw new Error('Benchmark did not print the resolved overlay paths');
    return output;
};

describe('benchmark runner pack resolution', () => {
    it('loads the same workspace overlays from the repository and package directories', () => {
        const fromRoot = runFrom(
            workspaceRoot,
            'packages/prismarine/benchmarks/run.mjs',
            'packages/prismarine/benchmarks/run.packResolution.fixture.ts'
        );
        const fromPackage = runFrom(packageRoot, 'benchmarks/run.mjs', 'benchmarks/run.packResolution.fixture.ts');

        expect(fromRoot).toEqual(fromPackage);
        expect(fromRoot.every((path) => basename(path) === 'vanilla_overlay')).toBe(true);
    });
});
