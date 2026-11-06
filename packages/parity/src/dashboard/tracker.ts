import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { AllowListEntry } from '../allowlist.ts';
import { ALL_FAMILIES, familyOf } from '../families.ts';
import type { Family } from '../families.ts';
import type { ParityTrackerRecord, TrackerRuntimeSupport } from '../trackerCases.ts';
import type { ReportedTest, VitestJsonReport } from './render.ts';
export { trackerPrimaryProgressPercent, trackerProgressPercent, trackerProgressTotal } from './trackerProgress.ts';

/** The outcome recorded for a comparison or an allow-listed parity gap. */
export type TrackerStatus = 'passed' | 'failed' | 'not measured' | 'intentional' | 'deferred' | 'defect';

/** Plain text or a safe link extracted from an allow-list reference. */
export interface TrackerReferencePart {
    readonly text: string;
    readonly href?: string;
}

/** One named data comparison or expected difference shown in the public parity tracker. */
export interface TrackerCase {
    /** Stable id derived from the family and the compared data record, or the allow-list gap. */
    readonly id: string;
    /** The declared behavior family this check covers. */
    readonly family: string;
    /** Searchable data identifier or allow-list gap id. */
    readonly title: string;
    /** Nested describe titles that place this assertion in context. */
    readonly context: string;
    /** Whether the entry is a data comparison or an allow-listed difference. */
    readonly kind: 'check' | 'gap';
    /** Result of the assertion or the allow-list ruling. */
    readonly status: TrackerStatus;
    /** Repository-relative source path used to link the source file. */
    readonly sourceFile: string;
    /** One-based source line, when the Vitest reporter provides it. */
    readonly line?: number;
    /** Why an allow-listed difference is expected, and where that ruling is recorded. */
    readonly details?: string;
    /** Human-readable reference text, with repository files and URLs made clickable. */
    readonly references?: readonly TrackerReferencePart[];
    /** Runtime entity support, reported separately from behavior parity. */
    readonly runtimeSupport?: TrackerRuntimeSupport;
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
    readonly intentional: number;
    readonly deferred: number;
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
    readonly intentional: number;
    readonly deferred: number;
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

/** A recorded data-level comparison plus its source file. */
export interface ReportedParityCase extends ParityTrackerRecord {
    readonly family: Family;
    readonly sourceFile: string;
}

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

const dataCase = (record: ReportedParityCase, repoRoot: string, parityRoot: string): TrackerCase => ({
    id: `data:${record.family}/${record.id}`,
    family: record.family,
    title: record.title,
    context: record.context ?? '',
    kind: 'check',
    status: record.status,
    sourceFile: sourcePath(record.sourceFile, repoRoot, parityRoot),
    ...(record.details === undefined ? {} : { details: record.details }),
    ...(record.runtimeSupport === undefined ? {} : { runtimeSupport: record.runtimeSupport })
});

const mergedParityCases = (records: readonly ReportedParityCase[]): ReportedParityCase[] => {
    const merged = new Map<string, ReportedParityCase>();

    for (const record of records) {
        const key = `${record.family}\0${record.id}`;
        const current = merged.get(key);
        if (current === undefined) {
            merged.set(key, record);
            continue;
        }

        const hasMeasuredSupport =
            record.runtimeSupport !== undefined && record.runtimeSupport.status !== 'not checked';
        const runtimeSupport = hasMeasuredSupport ? record.runtimeSupport : current.runtimeSupport;
        const sourceFile = hasMeasuredSupport ? record.sourceFile : current.sourceFile;
        merged.set(key, {
            ...current,
            sourceFile,
            ...(runtimeSupport === undefined ? {} : { runtimeSupport })
        });
    }

    return [...merged.values()];
};

const referenceParts = (reference: string, revision: string): readonly TrackerReferencePart[] => {
    const repositoryRevision = /^[0-9a-f]{40}$/i.test(revision) ? revision : 'master';
    const tokens =
        /https?:\/\/[^\s<>()]+|(?:docs|packages|tools|scripts|\.github)\/[\w./@-]+\.(?:md|json|ts|mts|js|yml|yaml|toml|css|vue)|(?:issue|pull request) #\d+/gi;
    const parts: TrackerReferencePart[] = [];
    let offset = 0;

    for (const match of reference.matchAll(tokens)) {
        const start = match.index;
        const raw = match[0];
        if (start === undefined || raw === undefined) continue;
        if (start > offset) parts.push({ text: reference.slice(offset, start) });

        const target = raw.replace(/[.,;:!?]+$/, '');
        const punctuation = raw.slice(target.length);
        const issue = /^(?:issue|pull request) #(\d+)$/i.exec(target);
        const href = target.startsWith('http')
            ? target
            : issue === null
              ? `https://github.com/JSPrismarine/JSPrismarine/blob/${repositoryRevision}/${target}`
              : `https://github.com/JSPrismarine/JSPrismarine/issues/${issue[1]}`;
        parts.push({ text: issue === null ? target : `#${issue[1]}`, href });
        if (punctuation !== '') parts.push({ text: punctuation });
        offset = start + raw.length;
    }

    if (offset < reference.length) parts.push({ text: reference.slice(offset) });
    return parts;
};

const gapCase = (entry: AllowListEntry, revision: string): TrackerCase => ({
    id: `gap:${entry.family}/${entry.id}`,
    family: entry.family,
    title: entry.id,
    context: 'Allow-listed difference',
    kind: 'gap',
    status: entry.kind,
    sourceFile: 'packages/parity/src/allowlist.ts',
    details: entry.reason,
    references: referenceParts(entry.reference, revision)
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
        intentional: cases.filter((entry) => entry.status === 'intentional').length,
        deferred: cases.filter((entry) => entry.status === 'deferred').length,
        defects: cases.filter((entry) => entry.status === 'defect').length
    };
};

/**
 * Builds a data-level tracker from explicit comparison records and the parity allow list.
 *
 * Aggregate Vitest assertions are not counted as separate cases. Each comparison family reports
 * the Java or Bedrock data records it actually checked, and every allow-listed gap appears as a
 * separate entry with its intentional or deferred status. When a required reference is
 * missing, its one `not measured:` marker remains visible.
 *
 * @param report - The assertion results from `vitest run --reporter=json`.
 * @param allowList - Intentional differences, deferred work, and known defects.
 * @param repoRoot - Absolute path to the repository root.
 * @param parityRoot - Absolute path to `packages/parity`.
 * @param metadata - Optional build date and source revision for the rendered snapshot.
 * @param parityCases - Data-level records emitted by parity comparisons.
 */
export const buildTrackerData = (
    report: VitestJsonReport,
    allowList: readonly AllowListEntry[],
    repoRoot: string,
    parityRoot: string,
    metadata: TrackerMetadata = {},
    parityCases: readonly ReportedParityCase[] = []
): TrackerData => {
    const cases: TrackerCase[] = mergedParityCases(parityCases).map((record) => dataCase(record, repoRoot, parityRoot));

    for (const file of report.testResults) {
        const filePath = sourcePath(file.name, repoRoot, parityRoot);
        for (const test of file.assertionResults) {
            const family = familyOf(test.ancestorTitles[0] ?? '');
            if (
                isDeclaredFamily(family) &&
                test.status !== 'passed' &&
                test.title.startsWith('not measured:') &&
                !cases.some((entry) => entry.family === family && entry.status === 'not measured')
            ) {
                cases.push(assertionCase(test, filePath, family));
            }
        }
    }
    const revision = metadata.sourceCommit ?? 'master';
    for (const entry of allowList) cases.push(gapCase(entry, revision));

    const caseMap = new Map<string, TrackerCase[]>();
    for (const family of ALL_FAMILIES) caseMap.set(family, []);
    for (const entry of cases) {
        const familyCases = caseMap.get(entry.family);
        if (familyCases === undefined) caseMap.set(entry.family, [entry]);
        else familyCases.push(entry);
    }

    const families = [...caseMap.entries()]
        .filter(([, entries]) => entries.length > 0)
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
        intentional: cases.filter((entry) => entry.status === 'intentional').length,
        deferred: cases.filter((entry) => entry.status === 'deferred').length,
        defects: cases.filter((entry) => entry.status === 'defect').length
    };
};
