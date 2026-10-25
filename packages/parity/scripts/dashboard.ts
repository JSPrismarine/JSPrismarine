/**
 * Runs the parity suite with the Vitest JSON reporter and renders the dashboard.
 *
 * Writes the Markdown table to `dist/dashboard.md`, prints it to stdout, and appends it to
 * `$GITHUB_STEP_SUMMARY` when a CI job provides one. Exits 0 even when tests fail - the
 * dashboard's job is to report the failures, and the test run itself gates CI separately.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { VitestJsonReport } from '../src/dashboard/render.ts';
import { renderDashboard } from '../src/dashboard/render.ts';

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

mkdirSync(join(packageRoot, 'dist'), { recursive: true });

const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: packageRoot,
    stdio: ['ignore', 'ignore', 'inherit']
});

if (!existsSync(reportPath)) {
    console.error(`vitest produced no JSON report at ${reportPath} (exit status ${run.status}).`);
    process.exit(1);
}

// Parsed JSON boundary; VitestJsonReport documents the fields the renderer reads.
const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as VitestJsonReport;
const markdown = renderDashboard(report, allowList);

const outputPath = join(packageRoot, 'dist', 'dashboard.md');
writeFileSync(outputPath, markdown);
console.log(markdown);
console.error(`Dashboard written to ${outputPath}`);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
