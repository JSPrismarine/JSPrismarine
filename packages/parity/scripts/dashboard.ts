/**
 * Renders the parity dashboard and the docs site's tracker.
 *
 * ```
 * node scripts/dashboard.ts                                   # runs the suite, then renders
 * node scripts/dashboard.ts --changed <commit>                # runs what changed since <commit>
 * node scripts/dashboard.ts --update <dir>... [--base <dir>] [--save-inputs <dir>]
 * ```
 *
 * Without options the script runs the parity suite with the Vitest JSON reporter, the way local
 * use does, and keeps its inputs in `dist/inputs`. With `--changed` it runs only the files the
 * changes since `<commit>` reach, overlays them on the inputs `dist/inputs` already holds, which
 * have to be that commit's, and keeps the result there. With `--update` it reads what earlier runs wrote instead (see
 * `src/dashboard/inputs.ts`): each directory holds one CI shard's `report.json`, `progress.jsonl`
 * and `cases/`. `--base` names the base commit's complete inputs, which the shards' files overlay,
 * since a shard runs only the files its changes reach. `--save-inputs` keeps the complete inputs
 * for the runs based on this one.
 *
 * Writes the Markdown table to `dist/dashboard.md`, prints it to stdout, and appends it to
 * `$GITHUB_STEP_SUMMARY` when a CI job provides one. The test run gates test failures separately;
 * this script also fails when a declared dashboard family has no test.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { DashboardInputs } from '../src/dashboard/inputs.ts';
import { mergeInputs, overlayInputs, readInputs, writeInputs } from '../src/dashboard/inputs.ts';
import { familiesWithoutTests, renderDashboard } from '../src/dashboard/render.ts';
import { buildTrackerData } from '../src/dashboard/tracker.ts';

/**
 * Teaches node how the workspace's own packages spell an import.
 *
 * The allow list derives its rows from `@jsprismarine/mapping` and `@jsprismarine/entities`,
 * whose modules import their siblings without a file extension and their vendored tables as
 * bare JSON. Vite and Vitest resolve both; node's type stripping resolves neither, so without
 * this the script dies on the first sibling import rather than printing a dashboard. The hook
 * retries a failed relative specifier with `.ts` and attaches the attribute node wants on a
 * JSON import, and leaves every other specifier to node.
 */
// A bare sibling import fails one of two ways: nothing is at the path, or a directory is,
// because `./tables` sits beside a `tables/` folder of vendored JSON.
const NEEDS_EXTENSION = ['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'];
const needsExtension = (error: unknown): boolean =>
    error instanceof Error && 'code' in error && typeof error.code === 'string' && NEEDS_EXTENSION.includes(error.code);

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.endsWith('.json')) {
            return { ...nextResolve(specifier, context), importAttributes: { type: 'json' } };
        }
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (!specifier.startsWith('.') || !needsExtension(error)) throw error;
            return nextResolve(`${specifier}.ts`, context);
        }
    }
});

// Loaded after the hook is in place: a static import resolves the whole graph before any of
// this file runs, which is too early for the hook to be registered.
const { allowList } = await import('../src/allowlist.ts');

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '..', '..');
const { values } = parseArgs({
    // pnpm forwards the literal `--` it was given, and `parseArgs` reads everything after one as
    // positional, so the separators are dropped first.
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options: {
        base: { type: 'string' },
        changed: { type: 'string' },
        update: { type: 'string', multiple: true },
        'save-inputs': { type: 'string' }
    }
});

mkdirSync(join(packageRoot, 'dist'), { recursive: true });

const inputsDirectory = join(packageRoot, 'dist', 'inputs');

/**
 * Runs the suite, or the files the changes since `changed` reach, and writes its inputs to a fresh
 * `directory` where `readInputs` finds them.
 */
const runSuite = (directory: string, changed?: string): string => {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const progressPath = join(directory, 'progress.jsonl');
    writeFileSync(progressPath, '');
    const reportPath = join(directory, 'report.json');
    const selection = changed === undefined ? [] : [`--changed=${changed}`, '--passWithNoTests'];
    const run = spawnSync(
        'pnpm',
        ['exec', 'vitest', 'run', ...selection, '--reporter=json', `--outputFile=${reportPath}`],
        {
            cwd: packageRoot,
            env: {
                ...process.env,
                PARITY_PROGRESS_FILE: progressPath,
                PARITY_CASES_DIRECTORY: join(directory, 'cases')
            },
            stdio: ['ignore', 'ignore', 'inherit']
        }
    );
    if (!existsSync(reportPath)) {
        console.error(`vitest produced no JSON report at ${reportPath} (exit status ${run.status}).`);
        process.exit(1);
    }
    return directory;
};

const inputs: DashboardInputs = (() => {
    if (values.changed !== undefined) {
        const base = readInputs(inputsDirectory);
        const update = readInputs(runSuite(join(packageRoot, 'dist', 'changed'), values.changed));
        const result = overlayInputs(base, update, (file) => existsSync(join(repositoryRoot, file)));
        writeInputs(inputsDirectory, result);
        console.error(
            `${update.report.testResults.length} files changed since ${values.changed}, over ${base.report.testResults.length} from its run: ${result.report.testResults.length} files.`
        );
        return result;
    }
    if (values.update === undefined) return readInputs(runSuite(inputsDirectory));
    const update = mergeInputs(values.update.map(readInputs));
    if (values.base === undefined) return update;
    const base = readInputs(values.base);
    const result = overlayInputs(base, update, (file) => existsSync(join(repositoryRoot, file)));
    console.error(
        `${update.report.testResults.length} files from this run over ${base.report.testResults.length} from the base: ${result.report.testResults.length} files.`
    );
    return result;
})();
if (values['save-inputs'] !== undefined) writeInputs(values['save-inputs'], inputs);
const { report, measurements, cases: parityCases } = inputs;

const markdown = renderDashboard(report, allowList, measurements);
const missingFamilies = familiesWithoutTests(report);
const tracker = buildTrackerData(
    report,
    allowList,
    repositoryRoot,
    packageRoot,
    { sourceCommit: process.env.GITHUB_SHA ?? 'working tree' },
    parityCases
);

const outputPath = join(packageRoot, 'dist', 'dashboard.md');
writeFileSync(outputPath, markdown);
writeFileSync(join(packageRoot, 'dist', 'tracker.json'), `${JSON.stringify(tracker, null, 2)}\n`);
console.log(markdown);
console.error(`Dashboard written to ${outputPath}`);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);

if (missingFamilies.length > 0) {
    console.error(`Parity dashboard families have no tests: ${missingFamilies.join(', ')}`);
    process.exitCode = 1;
}
