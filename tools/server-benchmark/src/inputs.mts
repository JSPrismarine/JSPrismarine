/**
 * What a benchmark measured, as one fingerprint: a hash of every committed file that can move a
 * figure. Two runs with the same fingerprint measured the same servers with the same harness, so
 * the second adds no point to the history. The workflow asks {@link inputsChanged} before it
 * spends an hour measuring.
 *
 * Run `node tools/server-benchmark/src/inputs.mts <benchmarks dir>` to print `changed=true` or
 * `changed=false`, comparing HEAD with the newest results file under that directory.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { isRecord } from './isRecord.mts';
import { readResultsFiles } from './resultsFiles.mts';

/**
 * The files that can move a figure, as `on.push.paths` globs: the servers' packages and the pins
 * of the other two servers in them, the harness, the lockfile, the Node.js version and the
 * workflow. `.github/workflows/benchmark.yml` lists the same globs, and a test keeps them equal.
 */
export const INPUT_GLOBS = [
    'packages/**',
    '!packages/**/*.md',
    '!packages/**/*.test.ts',
    'tools/server-benchmark/**',
    '.github/scripts/build-aot.mjs',
    'scripts/data-bundle.mts',
    'scripts/native/**',
    'pnpm-lock.yaml',
    '.nvmrc',
    '.github/workflows/benchmark.yml',
    '.github/workflows/executables.yml'
] as const;

/** A glob as GitHub reads one: `**` crosses directories, `*` does not. */
const globPattern = (glob: string) => {
    const escaped = glob.replaceAll(/[.+?^$()|[\]\\{}]/g, '\\$&');
    return new RegExp(`^${escaped.replaceAll('**', '\0').replaceAll('*', '[^/]*').replaceAll('\0', '.*')}$`);
};

const INCLUDE = INPUT_GLOBS.filter((glob) => !glob.startsWith('!')).map(globPattern);
const EXCLUDE = INPUT_GLOBS.filter((glob) => glob.startsWith('!')).map((glob) => globPattern(glob.slice(1)));

/** Whether a change to `file`, relative to the repository root, can move a figure. */
export const isInput = (file: string): boolean =>
    INCLUDE.some((pattern) => pattern.test(file)) && !EXCLUDE.some((pattern) => pattern.test(file));

/** The fingerprint of the input files in `git ls-tree -r` output: their paths and blob hashes. */
export const fingerprint = (lsTree: string): string => {
    const hash = createHash('sha256');
    for (const line of lsTree.split('\n')) {
        const file = line.slice(line.indexOf('\t') + 1);
        if (line !== '' && isInput(file)) hash.update(`${line}\n`);
    }
    return hash.digest('hex');
};

/** The top-level paths the globs reach, so `git` lists only those. */
const PATHSPECS = [
    ...new Set(INPUT_GLOBS.filter((glob) => !glob.startsWith('!')).map((glob) => glob.split('/**')[0]!))
];

/**
 * The fingerprint of HEAD's inputs in the repository at `repo`, or null when an input file has
 * uncommitted changes, since the hash would then not describe what ran.
 */
export const readInputs = (repo: string): string | null => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    const changed = git('status', '--porcelain', '--', ...PATHSPECS)
        .split('\n')
        .some((line) => line !== '' && isInput(line.slice(3)));
    return changed ? null : fingerprint(git('ls-tree', '-r', 'HEAD', '--', ...PATHSPECS));
};

/**
 * Whether `current` differs from the fingerprint the newest results file in `benchmarksDir`
 * recorded, by the time the runs started. A missing file, or one written before fingerprints were recorded, counts as changed.
 */
export const inputsChanged = (current: string | null, benchmarksDir: string): boolean => {
    const newest = readResultsFiles(benchmarksDir).at(-1);
    if (current === null || newest === undefined) return true;
    return !isRecord(newest.results) || newest.results.inputs !== current;
};

if (import.meta.main) {
    const [benchmarksDir = 'docs/research/benchmarks'] = process.argv.slice(2);
    const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    console.log(`changed=${inputsChanged(readInputs(repo), path.resolve(benchmarksDir))}`);
}
