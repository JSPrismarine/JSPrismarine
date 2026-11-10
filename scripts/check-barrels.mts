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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'barrel-baseline.json');

/** The Biome rules ADR 0010 enforces, by their name in the `performance` group. */
export const RULES = ['noBarrelFile', 'noReExportAll'] as const;
type Rule = (typeof RULES)[number];

/** How often each rule fires in each file, keyed by the path relative to the checked directory. */
export type Counts = Record<string, Partial<Record<Rule, number>>>;

/** A file whose count for one rule differs from the baseline. */
export interface Difference {
    file: string;
    rule: Rule;
    allowed: number;
    found: number;
}

const isRule = (value: unknown): value is Rule => RULES.some((rule) => rule === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCounts = (value: unknown): value is Counts =>
    isRecord(value) &&
    Object.values(value).every(
        (entry) =>
            isRecord(entry) &&
            Object.entries(entry).every(
                ([rule, count]) => isRule(rule) && typeof count === 'number' && Number.isInteger(count) && count > 0
            )
    );

/**
 * Runs Biome's barrel rules over `cwd` with the Biome configuration found there and counts the
 * diagnostics per file and rule.
 */
export const findBarrels = (cwd: string): Counts => {
    const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
    const result = spawnSync(
        process.execPath,
        [
            biome,
            'lint',
            ...RULES.map((rule) => `--only=performance/${rule}`),
            '--reporter=json',
            '--max-diagnostics=none',
            '.'
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

/**
 * Compares findings with a baseline. `added` lists counts above the baseline, which fail the
 * check. `removed` lists counts below it, which the next `--update` lowers.
 */
export const compare = (found: Counts, baseline: Counts): { added: Difference[]; removed: Difference[] } => {
    const added: Difference[] = [];
    const removed: Difference[] = [];
    const files = [...new Set([...Object.keys(found), ...Object.keys(baseline)])].sort();
    for (const file of files) {
        for (const rule of RULES) {
            const difference = { file, rule, allowed: baseline[file]?.[rule] ?? 0, found: found[file]?.[rule] ?? 0 };
            if (difference.found > difference.allowed) added.push(difference);
            else if (difference.found < difference.allowed) removed.push(difference);
        }
    }
    return { added, removed };
};

/** Lowers each baseline entry to what was found, never raising one, and drops empty files. */
export const shrink = (found: Counts, baseline: Counts): Counts => {
    const next: Counts = {};
    for (const file of Object.keys(baseline).sort()) {
        const entry: Partial<Record<Rule, number>> = {};
        for (const rule of RULES) {
            const count = Math.min(baseline[file]?.[rule] ?? 0, found[file]?.[rule] ?? 0);
            if (count > 0) entry[rule] = count;
        }
        if (Object.keys(entry).length > 0) next[file] = entry;
    }
    return next;
};

/** Orders files by path and each file's rules as `RULES` lists them, so updates diff cleanly. */
const sorted = (counts: Counts): Counts =>
    Object.fromEntries(
        Object.keys(counts)
            .sort()
            .map((file) => [
                file,
                Object.fromEntries(RULES.flatMap((rule) => (counts[file]?.[rule] ? [[rule, counts[file][rule]]] : [])))
            ])
    );

const explain = ({ file, rule, allowed, found }: Difference): string =>
    `${file} ${rule}: ${found} found, ${allowed} allowed`;

const total = (counts: Counts): number =>
    Object.values(counts).reduce((sum, entry) => sum + RULES.reduce((rules, rule) => rules + (entry[rule] ?? 0), 0), 0);

const write = (counts: Counts): void => writeFileSync(baselinePath, `${JSON.stringify(sorted(counts), null, 4)}\n`);

const main = (): void => {
    const found = findBarrels(repoRoot);
    const update = process.argv.includes('--update');

    if (!existsSync(baselinePath)) {
        if (!update) throw new Error(`${baselinePath} is missing; run with --update to create it.`);
        write(found);
        console.log(`Barrel baseline created: ${Object.keys(found).length} files, ${total(found)} findings.`);
        return;
    }

    const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!isCounts(parsed)) {
        throw new Error(`${baselinePath} must map file paths to positive counts for ${RULES.join(' and ')}.`);
    }
    const { added, removed } = compare(found, parsed);

    if (added.length > 0) {
        for (const difference of added) console.error(explain(difference));
        console.error(
            `\n${new Set(added.map(({ file }) => file)).size} files add a barrel or an \`export *\`. Import and export the defining modules instead (docs/adr/0010-no-barrel-files.md); the baseline never grows.`
        );
        process.exitCode = 1;
        return;
    }

    if (update) {
        const next = shrink(found, parsed);
        write(next);
        console.log(
            `Barrel baseline updated: ${removed.length} entries lowered or dropped, ${Object.keys(next).length} files and ${total(next)} findings left.`
        );
        return;
    }

    if (removed.length > 0) {
        for (const difference of removed) console.error(explain(difference));
        console.error(
            `\n${removed.length} baseline entries are above what Biome finds; run \`node scripts/check-barrels.mts --update\` to shrink the baseline.`
        );
        process.exitCode = 1;
        return;
    }

    console.log(
        `No new barrels or \`export *\` (${Object.keys(parsed).length} files and ${total(parsed)} findings baselined).`
    );
};

if (import.meta.main) main();
