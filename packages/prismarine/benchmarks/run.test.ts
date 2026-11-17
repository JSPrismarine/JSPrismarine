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

describe('benchmark runner bundle', () => {
    // The benchmark imports jsonc-parser through the config module and saves through LevelDB,
    // whose table builder runs on a worker thread. A dependency left unbundled or a worker entry
    // missing beside the bundle fails the run, and execFileSync throws on its exit code.
    // Bundling the server and running it takes long enough on a loaded host to pass the default limit.
    it('builds and runs a benchmark that loads jsonc-parser and starts a LevelDB worker', { timeout: 300_000 }, () => {
        const output = execFileSync(process.execPath, ['benchmarks/run.mjs', 'benchmarks/entityOnlyChunkSave.ts'], {
            cwd: packageRoot,
            encoding: 'utf8'
        });

        expect(JSON.parse(output)).toMatchObject({
            benchmark: 'entity-only-world-autosave',
            actorMoved: true,
            blockEdits: 0,
            blockSubChunksWritten: 0
        });
    });
});
