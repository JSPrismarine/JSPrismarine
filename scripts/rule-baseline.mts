/**
 * Shrink-only baselines for lint rules the repository adopted while code still broke them.
 *
 * A baseline file maps each file that broke a rule when the rule was adopted to how often it
 * fires there. A check built on this module fails when a file fires a rule more often than its
 * entry allows, and also when it fires less often, so the entry is lowered as the code is fixed.
 * `--update` lowers or drops entries and never raises one or adds a file. It seeds the baseline
 * from the current findings only when the baseline file does not exist.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { isRecord } from './isRecord.mts';

/** How often each rule fires in each file, keyed by the file's path relative to the checked directory. */
export type Counts<Rule extends string> = Record<string, Partial<Record<Rule, number>>>;

/** A file whose count for one rule differs from the baseline. */
export interface Difference<Rule extends string> {
    file: string;
    rule: Rule;
    allowed: number;
    found: number;
}

const isCounts = <Rule extends string>(rules: readonly Rule[], value: unknown): value is Counts<Rule> =>
    isRecord(value) &&
    Object.values(value).every(
        (entry) =>
            isRecord(entry) &&
            Object.entries(entry).every(
                ([rule, count]) =>
                    rules.some((known) => known === rule) &&
                    typeof count === 'number' &&
                    Number.isInteger(count) &&
                    count > 0
            )
    );

/**
 * Compares findings with a baseline. `added` lists counts above the baseline, which fail the
 * check. `removed` lists counts below it, which the next `--update` lowers.
 */
export const compareCounts = <Rule extends string>(
    rules: readonly Rule[],
    found: Counts<Rule>,
    baseline: Counts<Rule>
): { added: Difference<Rule>[]; removed: Difference<Rule>[] } => {
    const added: Difference<Rule>[] = [];
    const removed: Difference<Rule>[] = [];
    const files = [...new Set([...Object.keys(found), ...Object.keys(baseline)])].sort();
    for (const file of files) {
        for (const rule of rules) {
            const difference = { file, rule, allowed: baseline[file]?.[rule] ?? 0, found: found[file]?.[rule] ?? 0 };
            if (difference.found > difference.allowed) added.push(difference);
            else if (difference.found < difference.allowed) removed.push(difference);
        }
    }
    return { added, removed };
};

/** Lowers each baseline entry to what was found, never raising one, and drops empty files. */
export const shrinkCounts = <Rule extends string>(
    rules: readonly Rule[],
    found: Counts<Rule>,
    baseline: Counts<Rule>
): Counts<Rule> => {
    const next: Counts<Rule> = {};
    for (const file of Object.keys(baseline).sort()) {
        const entry: Partial<Record<Rule, number>> = {};
        for (const rule of rules) {
            const count = Math.min(baseline[file]?.[rule] ?? 0, found[file]?.[rule] ?? 0);
            if (count > 0) entry[rule] = count;
        }
        if (Object.keys(entry).length > 0) next[file] = entry;
    }
    return next;
};

/** Orders files by path and each file's rules as `rules` lists them, so updates diff cleanly. */
const sorted = <Rule extends string>(rules: readonly Rule[], counts: Counts<Rule>): Counts<Rule> =>
    shrinkCounts(rules, counts, counts);

const total = <Rule extends string>(rules: readonly Rule[], counts: Counts<Rule>): number =>
    Object.values(counts).reduce(
        (sum, entry) => sum + rules.reduce((inFile, rule) => inFile + (entry[rule] ?? 0), 0),
        0
    );

/** What a baseline check compares, and the words it reports with. */
export interface BaselineCheck<Rule extends string> {
    /** The rules the baseline counts, in the order each entry lists them. */
    rules: readonly Rule[];
    /** The current findings. */
    found: Counts<Rule>;
    /** The baseline file. */
    baselinePath: string;
    /** Whether to lower the baseline instead of failing on entries above the findings. */
    update: boolean;
    /** The baseline's name at the start of a sentence, such as `Barrel`. */
    name: string;
    /** The command that lowers the baseline. */
    updateCommand: string;
    /** Explains a failure from new findings; given how many files added them. */
    added: (files: number) => string;
    /** Describes a passing check, before the baselined totals. */
    passed: string;
}

/**
 * Compares findings with a baseline file, reports the result, and sets `process.exitCode` when
 * the check fails. With `update`, it writes the lowered baseline instead, or creates the file from
 * the findings when it does not exist.
 */
export const runBaselineCheck = <Rule extends string>(check: BaselineCheck<Rule>): void => {
    const { rules, found, baselinePath, update, name } = check;
    const write = (counts: Counts<Rule>): void =>
        writeFileSync(baselinePath, `${JSON.stringify(sorted(rules, counts), null, 4)}\n`);
    const explain = ({ file, rule, allowed, found: count }: Difference<Rule>): string =>
        `${file} ${rule}: ${count} found, ${allowed} allowed`;

    if (!existsSync(baselinePath)) {
        if (!update) throw new Error(`${baselinePath} is missing; run \`${check.updateCommand}\` to create it.`);
        write(found);
        console.log(`${name} baseline created: ${Object.keys(found).length} files, ${total(rules, found)} findings.`);
        return;
    }

    const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (!isCounts(rules, parsed)) {
        throw new Error(`${baselinePath} must map file paths to positive counts for ${rules.join(', ')}.`);
    }
    const { added, removed } = compareCounts(rules, found, parsed);

    if (added.length > 0) {
        for (const difference of added) console.error(explain(difference));
        console.error(`\n${check.added(new Set(added.map(({ file }) => file)).size)}`);
        process.exitCode = 1;
        return;
    }

    if (update) {
        const next = shrinkCounts(rules, found, parsed);
        write(next);
        console.log(
            `${name} baseline updated: ${removed.length} entries lowered or dropped, ${Object.keys(next).length} files and ${total(rules, next)} findings left.`
        );
        return;
    }

    if (removed.length > 0) {
        for (const difference of removed) console.error(explain(difference));
        console.error(
            `\n${removed.length} baseline entries are above what the check finds; run \`${check.updateCommand}\` to shrink the baseline.`
        );
        process.exitCode = 1;
        return;
    }

    console.log(
        `${check.passed} (${Object.keys(parsed).length} files and ${total(rules, parsed)} findings baselined).`
    );
};
