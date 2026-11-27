/**
 * Checks that no file adds a barrel or an `export *`.
 *
 * ADR 0010 bans barrel files and `export *` with Biome's `noBarrelFile` and `noReExportAll`
 * rules. The repository had both when the ban started, so `scripts/barrel-baseline.json` records
 * how many times each rule fires in each file that had them. This check runs Biome with only
 * those two rules, using the repository's `biome.json` for the files it covers, and fails when a
 * file fires a rule more often than the baseline allows. It also fails when a file fires a rule
 * less often than its entry says, so the baseline shrinks as barrels go: run it with `--update`
 * to lower or drop those entries. `--update` never raises an entry or adds a file. It seeds the
 * baseline from the current findings only when the baseline file does not exist.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gateScope } from './gate-scope.mts';
import { isRecord } from './isRecord.mts';
import type { Counts as RuleCounts, Difference } from './rule-baseline.mts';
import { compareCounts, runBaselineCheck, shrinkCounts } from './rule-baseline.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'barrel-baseline.json');

/** The Biome rules ADR 0010 enforces, by their name in the `performance` group. */
export const RULES = ['noBarrelFile', 'noReExportAll'] as const;
type Rule = (typeof RULES)[number];

/** How often each rule fires in each file, keyed by the path relative to the checked directory. */
export type Counts = RuleCounts<Rule>;

const isRule = (value: unknown): value is Rule => RULES.some((rule) => rule === value);

/** Changes that can move a finding in a file that did not change: Biome's configuration or version, the baseline and this script. */
const isFullInput = (file: string): boolean =>
    ['biome.json', 'pnpm-lock.yaml', 'scripts/barrel-baseline.json', 'scripts/check-barrels.mts'].includes(file);

/**
 * Runs Biome's barrel rules over `cwd` with the Biome configuration found there and counts the
 * diagnostics per file and rule.
 *
 * @param paths - What to lint, relative to `cwd`; the whole directory by default.
 */
export const findBarrels = (cwd: string, paths: readonly string[] = ['.']): Counts => {
    if (paths.length === 0) return {};
    const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
    const result = spawnSync(
        process.execPath,
        [
            biome,
            'lint',
            ...RULES.map((rule) => `--only=performance/${rule}`),
            '--reporter=json',
            '--max-diagnostics=none',
            '--no-errors-on-unmatched',
            '--files-ignore-unknown=true',
            ...paths
        ],
        { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    // Biome exits with 1 when a diagnostic is an error; the report on stdout is still complete.
    if (result.status !== 0 && result.status !== 1) {
        throw new Error(`Biome exited with ${result.status ?? result.signal}: ${result.stderr}`);
    }

    // The JSON reporter's shape is Biome's, so read only the fields this check needs and verify each.
    const report: unknown = JSON.parse(result.stdout);
    if (!isRecord(report) || !Array.isArray(report.diagnostics)) {
        throw new Error(`Biome's JSON report has no diagnostics list: ${result.stdout.slice(0, 200)}`);
    }

    const counts: Counts = {};
    for (const diagnostic of report.diagnostics) {
        if (!isRecord(diagnostic) || typeof diagnostic.category !== 'string') continue;
        const rule = diagnostic.category.replace('lint/performance/', '');
        if (!isRule(rule)) continue;
        const location = diagnostic.location;
        if (!isRecord(location) || typeof location.path !== 'string') {
            throw new Error(`Biome reported ${rule} without a file path.`);
        }
        const file = location.path.split(path.sep).join('/');
        const entry = (counts[file] ??= {});
        entry[rule] = (entry[rule] ?? 0) + 1;
    }
    return counts;
};

/** Compares findings with a baseline; see `compareCounts`. */
export const compare = (found: Counts, baseline: Counts): { added: Difference<Rule>[]; removed: Difference<Rule>[] } =>
    compareCounts(RULES, found, baseline);

/** Lowers each baseline entry to what was found; see `shrinkCounts`. */
export const shrink = (found: Counts, baseline: Counts): Counts => shrinkCounts(RULES, found, baseline);

if (import.meta.main) {
    const update = process.argv.includes('--update');
    // `--update` lowers entries the scan no longer finds, so it needs every file.
    const changed = update ? undefined : gateScope(repoRoot, isFullInput);
    const scanned = changed?.filter((file) => existsSync(path.join(repoRoot, file)));
    runBaselineCheck({
        rules: RULES,
        found: findBarrels(repoRoot, scanned),
        scope: changed === undefined ? undefined : new Set(changed),
        baselinePath,
        update,
        name: 'Barrel',
        updateCommand: 'node scripts/check-barrels.mts --update',
        added: (files) =>
            `${files} files add a barrel or an \`export *\`. Import and export the defining modules instead (docs/adr/0010-no-barrel-files.md); the baseline never grows.`,
        passed: 'No new barrels or `export *`'
    });
}
