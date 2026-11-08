import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GapKind } from './allowlist.ts';
import type { Family } from './families.ts';

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
    /** Runs the scenario for one subject and returns what differed from Java, if anything. */
    readonly run: (subject: Subject) => ScenarioOutcome;
    /** The kind recorded for a row that differs. */
    readonly gapKind?: GapKind;
}

/** One observed row. */
export interface ScenarioRow {
    readonly id: string;
    readonly title: string;
    readonly context: string;
    readonly difference: ScenarioOutcome;
}

const crash = (error: unknown): string =>
    `scenario threw: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;

/** Runs scenarios and returns one row per subject. A thrown error is a difference, not a crashed suite. */
export const runScenarios = <Subject>(scenarios: readonly BehaviorScenario<Subject>[]): ScenarioRow[] =>
    scenarios.flatMap((scenario) =>
        scenario.subjects().map((subject): ScenarioRow => {
            let difference: ScenarioOutcome;
            try {
                difference = scenario.run(subject);
            } catch (error) {
                difference = crash(error);
            }
            return {
                id: `${scenario.name}:${scenario.idOf(subject)}`,
                title: scenario.idOf(subject),
                context: `${scenario.name}: ${scenario.java}`,
                difference
            };
        })
    );
