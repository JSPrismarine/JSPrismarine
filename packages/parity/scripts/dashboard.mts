/**
 * Runs the parity suite with the Vitest JSON reporter and renders the dashboard.
 *
 * Writes the Markdown table to `dist/dashboard.md`, prints it to stdout, and appends it to
 * `$GITHUB_STEP_SUMMARY` when a CI job provides one. Exits 0 even when tests fail - the
 * dashboard's job is to report the failures, and the test run itself gates CI separately.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allowList } from '../src/allowlist.ts';
import type { VitestJsonReport } from '../src/dashboard/render.ts';
import { renderDashboard } from '../src/dashboard/render.ts';

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
