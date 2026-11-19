import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

import type { GapKind } from './allowlist.ts';
import { checkAllowList } from './allowlist.ts';
import type { Family } from './families.ts';
import { reportParityCases } from './trackerCases.ts';

/** The committed record of every behavior scenario row known to fail, with why. */
export const BEHAVIOR_GAPS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'goldens', 'behavior-gaps.json');

/** One expected failure of a behavior scenario row. */
export interface BehaviorGap {
    readonly kind: GapKind;
    readonly reason: string;
    readonly reference: string;
}

/** Gap rows by family, then by row id. */
export type BehaviorGaps = Readonly<Record<string, Readonly<Record<string, BehaviorGap>>>>;

/** Reads the committed gap baseline. */
export const readBehaviorGaps = (): BehaviorGaps => {
    if (!existsSync(BEHAVIOR_GAPS_PATH)) return {};
    // Parsed JSON boundary; the file is only written by `writeBehaviorGaps`.
    return JSON.parse(readFileSync(BEHAVIOR_GAPS_PATH, 'utf-8')) as BehaviorGaps;
};

/** Replaces one family's rows in the baseline, keeping rows sorted so a diff shows only real changes. */
export const writeBehaviorGaps = (family: Family, gaps: Readonly<Record<string, BehaviorGap>>): void => {
    const current = readBehaviorGaps();
    const sorted = Object.fromEntries(Object.entries(gaps).sort(([left], [right]) => left.localeCompare(right, 'en')));
    const next = { ...current, [family]: sorted };
    const ordered = Object.fromEntries(Object.entries(next).sort(([left], [right]) => left.localeCompare(right, 'en')));
    writeFileSync(BEHAVIOR_GAPS_PATH, `${JSON.stringify(ordered, null, 4)}\n`);
};

/** Whether the run was asked to rewrite the gap baseline from what the scenarios observed. */
export const updatingBehaviorGaps = (): boolean => process.env.PARITY_UPDATE_BEHAVIOR_GAPS === '1';

/** What a scenario row reports: nothing for a pass, or a sentence describing what differed from Java. */
export type ScenarioOutcome = string | undefined;

/** One Java behavior, applied to every Java subject it covers. */
export interface BehaviorScenario<Subject> {
    /** Stable scenario name; row ids are `<name>:<subject id>`. */
    readonly name: string;
    /** What Java does, in one sentence. */
    readonly java: string;
    /** Where the Java rule comes from. */
    readonly reference: string;
    /** The subjects this scenario covers. */
    readonly subjects: () => readonly Subject[];
    /** The subject's Java identifier. */
    readonly idOf: (subject: Subject) => string;
    /**
     * The Java identifier whose behavior this row evidences, when it is not the row's own id.
     * A scenario that checks something about a biome and a mob together evidences neither
     * mob's behavior, and returns undefined.
     */
    readonly covers?: (subject: Subject) => string | undefined;
    /**
     * The behavior aspects of the covered identifier this row compares, such as an entity
     * component (`minecraft:breedable`) or a block's `random-tick`. A row evidences only these
     * aspects, so one passing scenario cannot stand in for an identifier's other behavior.
     * Absent means the scenario's own name.
     */
    readonly aspects?: (subject: Subject) => readonly string[];
    /** Reports a row only when it differs, for a guard that should catch a wrong answer without scoring every right one. */
    readonly guard?: boolean;
    /** Runs the scenario for one subject and returns what differed from Java, if anything. */
    readonly run: (subject: Subject) => ScenarioOutcome;
    /**
     * Sorts a difference into the kind recorded for it, with a replacement reason when the
     * difference is a known edition difference rather than a defect, and the issue or source
     * that tracks it when that is not the scenario's own reference. Absent means a defect, and a
     * scenario that threw is never classified.
     */
    readonly classify?: (
        subject: Subject,
        difference: string
    ) => { readonly kind: GapKind; readonly reason: string; readonly reference?: string } | undefined;
}

/** One observed row. */
export interface ScenarioRow {
    readonly id: string;
    readonly title: string;
    readonly context: string;
    readonly difference: ScenarioOutcome;
    /** The gap recorded for the difference, when there is one. */
    readonly gap: BehaviorGap | undefined;
    /** The Java identifier this row evidences the behavior of, if any. */
    readonly covers: string | undefined;
    /** The aspects of the covered identifier this row compares. */
    readonly aspects: readonly string[];
    /** Whether the row is a guard, which the tracker lists only when it differs. */
    readonly guard: boolean;
}

const crash = (error: unknown): string =>
    `scenario threw: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;

/** Runs scenarios and returns one row per subject. A thrown error is a difference, not a crashed suite. */
export const runScenarios = <Subject>(scenarios: readonly BehaviorScenario<Subject>[]): ScenarioRow[] =>
    scenarios.flatMap((scenario) =>
        scenario.subjects().map((subject): ScenarioRow => {
            let difference: ScenarioOutcome;
            let threw = false;
            try {
                difference = scenario.run(subject);
            } catch (error) {
                difference = crash(error);
                threw = true;
            }
            // A scenario that threw found a defect of its own, whatever its classifier says about the
            // difference it was written to observe.
            const classified = difference === undefined || threw ? undefined : scenario.classify?.(subject, difference);
            return {
                id: `${scenario.name}:${scenario.idOf(subject)}`,
                title: scenario.idOf(subject),
                context: `${scenario.name}: ${scenario.java}`,
                difference,
                covers: scenario.covers === undefined ? scenario.idOf(subject) : scenario.covers(subject),
                aspects: scenario.aspects?.(subject) ?? [scenario.name],
                guard: scenario.guard === true,
                gap:
                    difference === undefined
                        ? undefined
                        : {
                              kind: classified?.kind ?? 'defect',
                              reason: classified?.reason ?? `${scenario.java} Observed: ${difference}.`,
                              reference: classified?.reference ?? scenario.reference
                          }
            };
        })
    );

/** An intentional difference is the project's own decision, so it reads as a pass beside its gap row. */
const trackerStatusOf = (row: ScenarioRow): 'passed' | 'defect' | 'deferred' =>
    row.gap === undefined || row.gap.kind === 'intentional' ? 'passed' : row.gap.kind;

/** Scenarios over one kind of subject, erased to the rows they produce so a family can mix kinds. */
export type ScenarioGroup = () => ScenarioRow[];

/** Wraps scenarios over one subject type so {@link measureScenarios} can run them with others. */
export const scenarioGroup =
    <Subject>(scenarios: readonly BehaviorScenario<Subject>[]): ScenarioGroup =>
    () =>
        runScenarios(scenarios);

/**
 * Runs a family's scenarios, records their rows for the tracker and checks the gaps against the
 * allow list. With `PARITY_UPDATE_BEHAVIOR_GAPS=1` it rewrites the family's baseline instead.
 * @param family - The family the scenarios belong to.
 * @param sourceFile - The test file running them, for the tracker's source link.
 * @param groups - The scenario groups to run, each wrapped with {@link scenarioGroup}.
 * @returns The rows, for assertions the caller adds on top.
 */
export const measureScenarios = (
    family: Family,
    sourceFile: string,
    ...groups: readonly ScenarioGroup[]
): readonly ScenarioRow[] => measureScenarioScope(family, sourceFile, undefined, groups);

/**
 * {@link measureScenarios} over part of a family: only the scenarios named in `scope` run, the
 * allow list is checked for their rows alone, and an update rewrites their rows and keeps every
 * other row of the family's baseline. A family whose scenarios are too costly to run whole while
 * one part of it changes runs that part this way.
 * @param family - The family the scenarios belong to.
 * @param sourceFile - The test file running them, for the tracker's source link.
 * @param scope - The names of the scenarios that run, or undefined for the whole family.
 * @param groups - The scenario groups to run, each wrapped with {@link scenarioGroup}.
 * @returns The rows, for assertions the caller adds on top.
 */
export const measureScenarioScope = (
    family: Family,
    sourceFile: string,
    scope: ReadonlySet<string> | undefined,
    groups: readonly ScenarioGroup[]
): readonly ScenarioRow[] => {
    const rows = groups.flatMap((group) => group());
    const inScope = (id: string): boolean => scope === undefined || scope.has(id.slice(0, id.indexOf(':')));

    if (updatingBehaviorGaps()) {
        const gaps: Record<string, BehaviorGap> = Object.fromEntries(
            Object.entries(readBehaviorGaps()[family] ?? {}).filter(([id]) => scope !== undefined && !inScope(id))
        );
        for (const row of rows) if (row.gap !== undefined) gaps[row.id] = row.gap;
        writeBehaviorGaps(family, gaps);
    } else {
        const verdict = checkAllowList(
            family,
            rows.filter((row) => row.difference !== undefined).map((row) => row.id)
        );
        expect(verdict.unexpected).toEqual([]);
        expect(verdict.stale.filter(inScope)).toEqual([]);
    }

    // A row that evidences one Java identifier is rolled into that identifier's single row by
    // `reportCoverage`; only the rows that evidence none are reported one by one.
    reportParityCases(
        family,
        sourceFile,
        rows
            .filter((row) => row.covers === undefined && !(row.guard && row.difference === undefined))
            .map((row) => ({
                id: row.id,
                title: row.title,
                context: row.context,
                status: trackerStatusOf(row),
                ...(row.difference === undefined ? {} : { details: row.difference })
            }))
    );
    return rows;
};

/** One behavior an identifier has that full parity has to compare with Java. */
export interface BehaviorAspect {
    /** Stable aspect id, such as `minecraft:breedable` or `random-tick`. */
    readonly id: string;
    /** What comparing this aspect with Java means, for the tracker row's context. */
    readonly description: string;
}

/**
 * Reports one row per behavior aspect of each Java identifier: measured when a scenario compares
 * that aspect, not measured when none does.
 *
 * An identifier's aspects come from data (the components an entity declares, the Java components
 * an item carries, whether a block random-ticks), so an identifier is complete only when every
 * one of its behaviors has been compared. A scenario that passes for one aspect says nothing about
 * the others, which stay not measured and keep the identifier out of the passing count. A row
 * that compares an aspect the data did not list adds that aspect rather than vanishing.
 *
 * An identifier with no listed aspects and no scenario reads as one not-measured row, so it stays
 * in the tracker's denominator until something compares it.
 * @param family - The family the identifiers belong to.
 * @param sourceFile - The test file, for the tracker's source link.
 * @param universe - Every Java identifier whose behavior the family should account for.
 * @param rows - The scenario rows already run for the family.
 * @param context - What full parity would mean for one of these identifiers.
 * @param aspectsOf - The behavior aspects one identifier has. Absent reports one row per
 *   identifier, keyed by the identifier alone.
 * @returns How many aspect rows no scenario reached.
 */
export const reportCoverage = (
    family: Family,
    sourceFile: string,
    universe: readonly string[],
    rows: readonly ScenarioRow[],
    context: string | ((identifier: string) => string),
    aspectsOf?: (identifier: string) => readonly BehaviorAspect[]
): number => {
    const byIdentifier = new Map<string, ScenarioRow[]>();
    for (const row of rows) {
        if (row.covers === undefined) continue;
        byIdentifier.set(row.covers, [...(byIdentifier.get(row.covers) ?? []), row]);
    }

    let uncovered = 0;
    const record = (id: string, identifier: string, rowContext: string, covering: readonly ScenarioRow[]) => {
        const base = { id, title: identifier, context: rowContext };
        if (covering.length === 0) {
            uncovered += 1;
            return { ...base, status: 'not measured' as const };
        }
        const failed = covering.filter((row) => trackerStatusOf(row) !== 'passed');
        const evidence = `${covering.length} scenario${covering.length === 1 ? '' : 's'}: ${[...new Set(covering.map((row) => row.id.split(':')[0]))].join(', ')}`;
        return failed.length === 0
            ? { ...base, status: 'passed' as const, details: evidence }
            : {
                  ...base,
                  // One defect makes the aspect a defect; it is only deferred when every difference is.
                  status: failed.some((row) => trackerStatusOf(row) === 'defect')
                      ? ('defect' as const)
                      : ('deferred' as const),
                  details: failed.map((row) => `${row.id.split(':')[0]}: ${row.difference}`).join('; ')
              };
    };

    reportParityCases(
        family,
        sourceFile,
        universe.flatMap((identifier) => {
            const covering = byIdentifier.get(identifier) ?? [];
            const whole = typeof context === 'string' ? context : context(identifier);
            if (aspectsOf === undefined) return [record(`runtime-behavior:${identifier}`, identifier, whole, covering)];

            const aspects = new Map(aspectsOf(identifier).map((aspect) => [aspect.id, aspect.description]));
            for (const row of covering) {
                for (const aspect of row.aspects) if (!aspects.has(aspect)) aspects.set(aspect, row.context);
            }
            if (aspects.size === 0) return [record(`runtime-behavior:${identifier}`, identifier, whole, covering)];
            return [...aspects].map(([aspect, description]) =>
                record(
                    `runtime-behavior:${identifier}/${aspect}`,
                    identifier,
                    `${aspect}: ${description}`,
                    covering.filter((row) => row.aspects.includes(aspect))
                )
            );
        })
    );
    return uncovered;
};
