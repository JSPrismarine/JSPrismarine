/**
 * Runs the parity suite with the Vitest JSON reporter and renders the dashboard.
 *
 * Writes the Markdown table to `dist/dashboard.md`, prints it to stdout, and appends it to
 * `$GITHUB_STEP_SUMMARY` when a CI job provides one. The test run gates test failures separately;
 * this script also fails when a declared dashboard family has no test.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { VitestJsonReport } from '../src/dashboard/render.ts';
import type { ParityMeasurement } from '../src/progress.ts';
import { ALL_FAMILIES } from '../src/families.ts';
import { familiesWithoutTests, renderDashboard } from '../src/dashboard/render.ts';

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
const reportPath = join(packageRoot, 'dist', 'parity-report.json');
const progressPath = join(packageRoot, 'dist', 'parity-progress.jsonl');

mkdirSync(join(packageRoot, 'dist'), { recursive: true });
writeFileSync(progressPath, '');

const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: packageRoot,
    env: { ...process.env, PARITY_PROGRESS_FILE: progressPath },
    stdio: ['ignore', 'ignore', 'inherit']
});

if (!existsSync(reportPath)) {
    console.error(`vitest produced no JSON report at ${reportPath} (exit status ${run.status}).`);
    process.exit(1);
}

// Parsed JSON boundary; VitestJsonReport documents the fields the renderer reads.
const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as VitestJsonReport;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFamily = (value: string): value is (typeof ALL_FAMILIES)[number] =>
    ALL_FAMILIES.some((family) => family === value);
const isParityMeasurement = (value: unknown): value is ParityMeasurement =>
    isRecord(value) &&
    typeof value.family === 'string' &&
    isFamily(value.family) &&
    typeof value.name === 'string' &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value);
const measurements = readFileSync(progressPath, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line): ParityMeasurement => {
        const value: unknown = JSON.parse(line);
        if (!isParityMeasurement(value)) throw new Error(`Invalid parity measurement: ${line}`);
        return value;
    });
const markdown = renderDashboard(report, allowList, measurements);
const missingFamilies = familiesWithoutTests(report);

const outputPath = join(packageRoot, 'dist', 'dashboard.md');
writeFileSync(outputPath, markdown);
console.log(markdown);
console.error(`Dashboard written to ${outputPath}`);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);

if (missingFamilies.length > 0) {
    console.error(`Parity dashboard families have no tests: ${missingFamilies.join(', ')}`);
    process.exitCode = 1;
}
