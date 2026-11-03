import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { AllowListEntry } from '../allowlist.ts';
import { ALL_FAMILIES, familyOf } from '../families.ts';
import type { Family } from '../families.ts';
import type { ReportedTest, VitestJsonReport } from './render.ts';

/** The outcome recorded for a comparison or an allow-listed parity gap. */
export type TrackerStatus = 'passed' | 'failed' | 'not measured' | 'accepted' | 'defect';

/** One assertion or expected difference shown in the public parity tracker. */
export interface TrackerCase {
    /** Stable id derived from the case's family, file, and title. */
    readonly id: string;
    /** The declared behavior family this check covers. */
    readonly family: string;
    /** Human-readable assertion title or allow-list id. */
    readonly title: string;
    /** Nested describe titles that place this assertion in context. */
    readonly context: string;
    /** Whether the entry is a test assertion or an allow-listed difference. */
    readonly kind: 'check' | 'gap';
    /** Result of the assertion or the allow-list ruling. */
    readonly status: TrackerStatus;
    /** Repository-relative source path used to link the source file. */
    readonly sourceFile: string;
    /** One-based source line, when the Vitest reporter provides it. */
    readonly line?: number;
    /** Why an allow-listed difference is expected, and where that ruling is recorded. */
    readonly details?: string;
}

/** The case counts and entries for one behavior family. */
export interface TrackerFamily {
    readonly id: string;
    readonly group: string;
    readonly cases: readonly TrackerCase[];
    readonly checks: number;
    readonly passed: number;
    readonly failed: number;
    readonly notMeasured: number;
    readonly accepted: number;
    readonly defects: number;
}

/** The complete tracker snapshot rendered by the documentation site. */
export interface TrackerData {
    readonly generatedAt: string;
    readonly sourceCommit: string;
    readonly families: readonly TrackerFamily[];
    readonly cases: readonly TrackerCase[];
    readonly checks: number;
    readonly passed: number;
    readonly failed: number;
    readonly notMeasured: number;
    readonly accepted: number;
    readonly defects: number;
}

/** Metadata that identifies the checkout used to produce a tracker snapshot. */
export interface TrackerMetadata {
    readonly generatedAt?: string;
    readonly sourceCommit?: string;
}

const REPORT_STATUS: Readonly<Record<string, TrackerStatus>> = {
    passed: 'passed',
    failed: 'failed'
};

const isDeclaredFamily = (family: string | undefined): family is Family =>
    family !== undefined && ALL_FAMILIES.some((declared) => declared === family);

const sourcePath = (name: string, repoRoot: string, parityRoot: string): string => {
    const absolutePath = isAbsolute(name)
        ? name
        : name.startsWith(`packages/parity${sep}`)
          ? resolve(repoRoot, name)
          : resolve(parityRoot, name);
    const repositoryPath = relative(repoRoot, absolutePath);
    if (repositoryPath === '' || repositoryPath === '..' || repositoryPath.startsWith(`..${sep}`)) {
        throw new Error(`Parity report path is outside the repository: ${name}`);
    }
    return repositoryPath.split(sep).join('/');
};

const assertionCase = (test: ReportedTest, filePath: string, family: Family): TrackerCase => {
    const context = test.ancestorTitles.slice(1).join(' › ');
    const title = test.title;
    const stableTitle = [...test.ancestorTitles, title].join(' › ');
    const line = test.location?.line;

    return {
        id: `${filePath}::${stableTitle}`,
        family,
        title,
        context,
        kind: 'check',
        status: REPORT_STATUS[test.status] ?? 'not measured',
        sourceFile: filePath,
        ...(line === undefined ? {} : { line })
    };
};

const gapCase = (entry: AllowListEntry): TrackerCase => ({
    id: `gap:${entry.family}/${entry.id}`,
    family: entry.family,
    title: entry.id,
    context: 'Allow-listed difference',
    kind: 'gap',
    status: entry.kind,
    sourceFile: 'packages/parity/src/allowlist.ts',
    details: `${entry.reason} Reference: ${entry.reference}`
});

const emptyFamily = (id: string, cases: TrackerCase[]): TrackerFamily => {
    const checks = cases.filter((entry) => entry.kind === 'check');
    return {
        id,
        group: id.split('.')[0] ?? id,
        cases,
        checks: checks.length,
        passed: checks.filter((entry) => entry.status === 'passed').length,
        failed: checks.filter((entry) => entry.status === 'failed').length,
        notMeasured: checks.filter((entry) => entry.status === 'not measured').length,
        accepted: cases.filter((entry) => entry.status === 'accepted').length,
        defects: cases.filter((entry) => entry.status === 'defect').length
    };
};

/**
 * Builds a full case-level tracker from a Vitest report and the parity allow list.
 *
 * Every assertion under a declared family is kept, and every allow-listed gap appears as a
 * separate entry so the page reflects known differences too. Suite utility tests outside those
 * families are left out of compatibility progress.
 *
 * @param report - The assertion results from `vitest run --reporter=json`.
 * @param allowList - Reviewed accepted differences and known defects.
 * @param repoRoot - Absolute path to the repository root.
 * @param parityRoot - Absolute path to `packages/parity`.
 * @param metadata - Optional build date and source revision for the rendered snapshot.
 */
export const buildTrackerData = (
    report: VitestJsonReport,
    allowList: readonly AllowListEntry[],
    repoRoot: string,
    parityRoot: string,
    metadata: TrackerMetadata = {}
): TrackerData => {
    const cases: TrackerCase[] = [];

    for (const file of report.testResults) {
        const filePath = sourcePath(file.name, repoRoot, parityRoot);
        for (const test of file.assertionResults) {
            const family = familyOf(test.ancestorTitles[0] ?? '');
            if (isDeclaredFamily(family)) cases.push(assertionCase(test, filePath, family));
        }
    }
    for (const entry of allowList) cases.push(gapCase(entry));

    const caseMap = new Map<string, TrackerCase[]>();
    for (const family of ALL_FAMILIES) caseMap.set(family, []);
    for (const entry of cases) {
        const familyCases = caseMap.get(entry.family);
        if (familyCases === undefined) caseMap.set(entry.family, [entry]);
        else familyCases.push(entry);
    }

    const families = [...caseMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([id, entries]) =>
            emptyFamily(
                id,
                entries.toSorted((left, right) =>
                    `${left.kind}/${left.title}`.localeCompare(`${right.kind}/${right.title}`, 'en')
                )
            )
        );
    const checks = cases.filter((entry) => entry.kind === 'check');

    return {
        generatedAt: metadata.generatedAt ?? new Date().toISOString(),
        sourceCommit: metadata.sourceCommit ?? 'working tree',
        families,
        cases,
        checks: checks.length,
        passed: checks.filter((entry) => entry.status === 'passed').length,
        failed: checks.filter((entry) => entry.status === 'failed').length,
        notMeasured: checks.filter((entry) => entry.status === 'not measured').length,
        accepted: cases.filter((entry) => entry.status === 'accepted').length,
        defects: cases.filter((entry) => entry.status === 'defect').length
    };
};
