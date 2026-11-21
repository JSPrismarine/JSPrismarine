/**
 * Checks that no package adds code that compiles to a slow path in the AOT executable.
 *
 * `bun build --compile --aot --explain=json` lists every place the compiler could not type: a
 * call it cannot resolve (`unknown-callee`), an object whose shape it does not know
 * (`unknown-object`) and an operator on a value it lost track of (`lost-track`). Each one costs a
 * lookup or a check at run time. `scripts/aot-explain-baseline.json` records two things, both for
 * the repository's own code; dependencies are left out, since an update moves their counts
 * without a change here:
 *
 * - `accessesByName`: how many property accesses the report's summary says are looked up by
 *   name. Bun reports the same total on every compile of the same tree, so this is compared
 *   exactly.
 * - `packages`: how many causes of each kind each workspace package has, which says where a
 *   regression is. Bun 1.4.6 lists causes not quite deterministically (two compiles of the same
 *   tree differed by up to two in one package), so each entry gets a small slack.
 *
 * The check fails when either goes above the baseline, and `--update` lowers what the code has
 * gone below, so the baseline only shrinks. Neither depends on the machine's speed or load,
 * which is what the repository's performance rules ask for. A different Bun build can move them
 * either way; when an update to Bun raises one, delete the baseline and run `--update` to seed
 * it again.
 *
 * Usage:
 *   node scripts/check-aot-explain.mts [--report <file>] [--update]
 *
 * Without `--report`, it compiles `bun-linux-x64` with `.github/scripts/build-aot.mjs`, which needs
 * `bun` on the PATH and a Linux x64 host. The executables workflow passes the report its own
 * build wrote.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { isRecord } from './isRecord.mts';
import type { Counts as RuleCounts, Difference } from './rule-baseline.mts';
import { compareCounts, shrinkCounts } from './rule-baseline.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'aot-explain-baseline.json');

/** The causes `--explain` reports, by their `reason`. */
export const CAUSES = ['unknown-callee', 'unknown-object', 'lost-track'] as const;
type Cause = (typeof CAUSES)[number];

/** How many slow paths of each cause each package has, keyed by its directory. */
export type Counts = RuleCounts<Cause>;

const isCause = (value: unknown): value is Cause => CAUSES.some((cause) => cause === value);

/**
 * How far over its entry a count may go before the check fails: the larger of a few causes and
 * a fraction of the entry, to absorb run-to-run variation in Bun's report.
 */
export const slackFor = (allowed: number): number => Math.max(5, Math.ceil(allowed * 0.002));

/** The counts a package may reach before the check fails: each entry plus its slack. */
const withSlack = (baseline: Counts): Counts =>
    Object.fromEntries(
        Object.entries(baseline).map(([workspace, entry]) => [
            workspace,
            Object.fromEntries(CAUSES.map((cause) => [cause, (entry[cause] ?? 0) + slackFor(entry[cause] ?? 0)]))
        ])
    );

/**
 * Compares counts with a baseline. `added` lists counts above an entry and its slack, which fail
 * the check; a package with no entry gets the slack of an empty one. `removed` lists counts below
 * an entry, which `--update` lowers.
 */
export const compare = (
    found: Counts,
    baseline: Counts
): { added: Difference<Cause>[]; removed: Difference<Cause>[] } => ({
    added: compareCounts(CAUSES, found, withSlack(baseline)).added.filter(
        ({ file, found: count }) => file in baseline || count > slackFor(0)
    ),
    removed: compareCounts(CAUSES, found, baseline).removed
});

const isCounts = (value: unknown): value is Counts =>
    isRecord(value) &&
    Object.values(value).every(
        (entry) =>
            isRecord(entry) &&
            Object.entries(entry).every(
                ([cause, count]) => isCause(cause) && typeof count === 'number' && Number.isInteger(count) && count > 0
            )
    );

/** What the baseline file holds. */
export interface Baseline {
    readonly accessesByName: number;
    readonly packages: Counts;
}

const isBaseline = (value: unknown): value is Baseline =>
    isRecord(value) &&
    typeof value.accessesByName === 'number' &&
    Number.isInteger(value.accessesByName) &&
    isCounts(value.packages);

const total = (counts: Counts): number =>
    Object.values(counts).reduce(
        (sum, entry) => sum + CAUSES.reduce((inEntry, cause) => inEntry + (entry[cause] ?? 0), 0),
        0
    );

const write = ({ accessesByName, packages }: Baseline): void =>
    writeFileSync(
        baselinePath,
        `${JSON.stringify({ accessesByName, packages: shrinkCounts(CAUSES, packages, packages) }, null, 4)}\n`
    );

/**
 * Reads the property accesses of the program's own code that the report's summary line says are
 * looked up by name.
 */
export const accessesByNameOf = (report: string): number => {
    const line = report.split('\n').find((candidate) => candidate.startsWith('{"accesses"'));
    if (line === undefined) throw new Error('The --explain report has no summary line.');
    // Bun writes the report; read only the field this check needs and verify it.
    const summary: unknown = JSON.parse(line);
    if (!isRecord(summary) || !isRecord(summary.accesses) || typeof summary.accesses.byName !== 'number') {
        throw new Error(`The --explain summary has no accesses.byName: ${line.slice(0, 200)}`);
    }
    return summary.accesses.byName;
};

/** The workspace directory a reported file belongs to, or undefined for a dependency. */
const workspaceOf = (file: string): string | undefined => /^(packages|addons|tools)\/[^/]+(?=\/)/.exec(file)?.[0];

/**
 * Counts the causes in an `--explain=json` report. Each cause is one JSON line with a `rank`;
 * the summary line and Bun's progress lines, which share the output, are skipped.
 */
export const countCauses = (report: string): Counts => {
    const counts: Counts = {};
    for (const line of report.split('\n')) {
        if (!line.startsWith('{"rank"')) continue;
        // Bun writes the report; read only the fields this check needs and verify each.
        const cause: unknown = JSON.parse(line);
        if (!isRecord(cause) || typeof cause.file !== 'string') {
            throw new Error(`An --explain cause has no file: ${line.slice(0, 200)}`);
        }
        if (cause.inDependency === true) continue;
        const workspace = workspaceOf(cause.file);
        if (workspace === undefined) continue;
        if (!isCause(cause.reason)) {
            throw new Error(
                `--explain reported a cause this check does not count, ${String(cause.reason)}; add it to CAUSES in scripts/check-aot-explain.mts.`
            );
        }
        const entry = (counts[workspace] ??= {});
        entry[cause.reason] = (entry[cause.reason] ?? 0) + 1;
    }
    return counts;
};

/** Compiles the Linux x64 executable with its explain report and returns the report. */
const buildReport = (): string => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'jsp-aot-explain-'));
    const reportPath = path.join(directory, 'explain.jsonl');
    try {
        const result = spawnSync(
            process.execPath,
            ['.github/scripts/build-aot.mjs', 'bun-linux-x64', path.join(directory, 'prismarine')],
            {
                cwd: repoRoot,
                stdio: 'inherit',
                env: {
                    BUILD_TIME: '0',
                    BUILD_GIT_HASH: 'explain',
                    BUILD_VERSION: '0.0.0',
                    BUILD_FLAVOR: 'explain',
                    BUILD_TYPE: 'nightly',
                    ...process.env,
                    AOT_EXPLAIN_REPORT: reportPath
                }
            }
        );
        if (result.status !== 0) throw new Error(`build-aot.mjs exited with ${result.status ?? result.signal}`);
        return readFileSync(reportPath, 'utf8');
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
};

if (import.meta.main) {
    const reportIndex = process.argv.indexOf('--report');
    const reportPath = reportIndex === -1 ? undefined : process.argv[reportIndex + 1];
    if (reportIndex !== -1 && reportPath === undefined) throw new Error('--report needs a file');
    const update = process.argv.includes('--update');
    const report = reportPath === undefined ? buildReport() : readFileSync(reportPath, 'utf8');
    const found: Baseline = { accessesByName: accessesByNameOf(report), packages: countCauses(report) };

    if (!existsSync(baselinePath)) {
        if (!update) {
            throw new Error(
                `${baselinePath} is missing; run \`node scripts/check-aot-explain.mts --update\` to create it.`
            );
        }
        write(found);
        console.log(
            `AOT slow-path baseline created: ${found.accessesByName} accesses by name, ${total(found.packages)} causes.`
        );
        process.exit(0);
    }

    const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!isBaseline(parsed)) {
        throw new Error(`${baselinePath} must hold accessesByName and positive cause counts for each package.`);
    }
    const { added, removed } = compare(found.packages, parsed.packages);
    for (const { file, rule, allowed, found: count } of added) {
        console.error(`${file} ${rule}: ${count} found, ${allowed} allowed`);
    }
    const byNameGrew = found.accessesByName > parsed.accessesByName;
    if (byNameGrew) {
        console.error(`Accesses looked up by name: ${found.accessesByName} found, ${parsed.accessesByName} allowed`);
    }
    if (added.length > 0 || byNameGrew) {
        console.error(
            "\nThe change adds code the AOT compiler cannot type. Run `bun build --compile --aot --explain` and follow each entry's fix; the baseline never grows."
        );
        process.exit(1);
    }
    if (update) {
        const next = {
            accessesByName: found.accessesByName,
            packages: shrinkCounts(CAUSES, found.packages, parsed.packages)
        };
        write(next);
        console.log(
            `AOT slow-path baseline updated: ${next.accessesByName} accesses by name, ${total(next.packages)} causes.`
        );
    } else {
        for (const { file, rule, allowed, found: count } of removed) {
            console.log(`${file} ${rule}: ${count} found, ${allowed} allowed; \`--update\` lowers it`);
        }
        if (found.accessesByName < parsed.accessesByName) {
            console.log(
                `Accesses looked up by name: ${found.accessesByName} found, ${parsed.accessesByName} allowed; \`--update\` lowers it`
            );
        }
        console.log(
            `No new AOT slow paths (${found.accessesByName} accesses by name, ${total(found.packages)} causes).`
        );
    }
}
