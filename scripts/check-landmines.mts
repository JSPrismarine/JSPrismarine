/**
 * Checks the `@interfere/landmines` rules that `.oxlintrc.json` enables.
 *
 * Biome cannot load JavaScript lint rules, so Oxlint runs the landmines plugins with every
 * built-in Oxlint rule turned off. The repository broke several of these rules when they were
 * adopted, so `scripts/landmines-baseline.json` records how often each rule fires in each file
 * that broke it, and the check fails when a file fires a rule more often than that. It also fails
 * when a file fires a rule less often, so the baseline shrinks as the code is fixed: run it with
 * `--update` to lower or drop those entries.
 *
 * `package-exports` reports on every source file of a package whose `exports` map exposes all of
 * them. Its findings are counted once against that package's `package.json`, so adding a file to
 * such a package does not fail the check.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from './isRecord.mts';
import type { Counts } from './rule-baseline.mts';
import { runBaselineCheck } from './rule-baseline.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'landmines-baseline.json');

/** The rule that reports a package's `exports` map on each of the package's files. */
const PACKAGE_EXPORTS = 'landmines-structure/package-exports';

/** The rules `.oxlintrc.json` in `cwd` turns on, as `<plugin>/<rule>`. */
export const enabledRules = (cwd: string): string[] => {
    // The configuration is JSON the repository owns, so read only the field this check needs and verify it.
    const config: unknown = JSON.parse(readFileSync(path.join(cwd, '.oxlintrc.json'), 'utf8'));
    if (!isRecord(config) || !isRecord(config.rules)) {
        throw new Error(`${path.join(cwd, '.oxlintrc.json')} has no rules object.`);
    }
    return Object.entries(config.rules)
        .filter(([, setting]) => (Array.isArray(setting) ? setting[0] : setting) !== 'off')
        .map(([rule]) => rule)
        .sort();
};

/** The `package.json` closest to `file`, relative to `cwd`, or `file` when no package holds it. */
const owningManifest = (cwd: string, file: string): string => {
    for (let directory = path.posix.dirname(file); ; directory = path.posix.dirname(directory)) {
        const manifest = path.posix.join(directory, 'package.json');
        if (existsSync(path.join(cwd, manifest))) return manifest;
        if (directory === '.') return file;
    }
};

/**
 * Runs Oxlint over `cwd` with the `.oxlintrc.json` found there and counts the diagnostics per file
 * and rule, with `package-exports` counted against each package's `package.json`.
 */
export const findLandmines = (cwd: string): Counts<string> => {
    const require = createRequire(import.meta.url);
    const oxlint = path.join(path.dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint');
    const result = spawnSync(process.execPath, [oxlint, '--format=json', '.'], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    // Oxlint exits with 1 when it reports an error; the report on stdout is still complete.
    if (result.status !== 0 && result.status !== 1) {
        throw new Error(`Oxlint exited with ${result.status ?? result.signal}: ${result.stderr}`);
    }

    // The JSON reporter's shape is Oxlint's, so read only the fields this check needs and verify each.
    const report: unknown = JSON.parse(result.stdout);
    if (!isRecord(report) || !Array.isArray(report.diagnostics)) {
        throw new Error(`Oxlint's JSON report has no diagnostics list: ${result.stdout.slice(0, 200)}`);
    }

    const counts: Counts<string> = {};
    const packages = new Set<string>();
    for (const diagnostic of report.diagnostics) {
        if (!isRecord(diagnostic) || typeof diagnostic.code !== 'string' || typeof diagnostic.filename !== 'string') {
            throw new Error(`Oxlint reported a diagnostic without a rule or a file: ${JSON.stringify(diagnostic)}`);
        }
        // Oxlint names a plugin rule `plugin(rule)`; the configuration names it `plugin/rule`.
        const rule = diagnostic.code.replace(/^(.+)\((.+)\)$/, '$1/$2');
        let file = diagnostic.filename.split(path.sep).join('/');
        if (rule === PACKAGE_EXPORTS) {
            file = owningManifest(cwd, file);
            if (packages.has(file)) continue;
            packages.add(file);
        }
        const entry = (counts[file] ??= {});
        entry[rule] = (entry[rule] ?? 0) + 1;
    }
    return counts;
};

if (import.meta.main) {
    runBaselineCheck({
        rules: enabledRules(repoRoot),
        found: findLandmines(repoRoot),
        baselinePath,
        update: process.argv.includes('--update'),
        name: 'Landmines',
        updateCommand: 'node scripts/check-landmines.mts --update',
        added: (files) =>
            `${files} files break an \`@interfere/landmines\` rule. Each finding above says what to do instead; the baseline never grows. Run \`pnpm exec oxlint\` for the full messages.`,
        passed: 'No new landmines'
    });
}
