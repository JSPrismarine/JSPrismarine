import type { AllowListEntry } from '../allowlist.ts';
import { ALL_FAMILIES, FAMILIES, familyOf } from '../families.ts';
import type { ParityMeasurement } from '../progress.ts';

/** One test as the Vitest JSON reporter records it. */
export interface ReportedTest {
    /** The describe titles enclosing the test, outermost first. The first one names the family. */
    ancestorTitles: string[];
    status: string;
    title: string;
}

/** One test file in the Vitest JSON report. */
export interface ReportedFile {
    assertionResults: ReportedTest[];
}

/** The part of a `vitest run --reporter=json` report the dashboard reads. */
export interface VitestJsonReport {
    testResults: ReportedFile[];
}

/** Returns declared dashboard rows that have no Vitest assertion under their family describe. */
export const familiesWithoutTests = (report: VitestJsonReport): readonly string[] => {
    const covered = new Set<string>();

    for (const file of report.testResults) {
        for (const test of file.assertionResults) {
            const title = familyOf(test.ancestorTitles[0] ?? '');
            if (title !== undefined && ALL_FAMILIES.some((family) => family === title)) covered.add(title);
        }
    }

    return ALL_FAMILIES.filter((family) => !covered.has(family));
};

/** What one family's row claims. */
export type FamilyStatus =
    /** Every test compared real data and passed. */
    | 'green'
    /** A comparison reported a gap nothing accounts for. */
    | 'red'
    /** Every test passed, but the allow list carries a defect this suite found and nobody fixed. */
    | 'defects'
    /** A comparison had no reference data to stand on, so nothing was compared. */
    | 'not measured'
    /** The family is declared but no test claims it yet. */
    | 'no tests';

/** The counts one dashboard row carries. */
export interface FamilyCounts {
    passed: number;
    failed: number;
    /** Tests skipped for want of reference data, which the dashboard does not count as a pass. */
    notMeasured: number;
    /** Allow-listed gaps the project accepts as correct behavior. */
    accepted: number;
    /** Allow-listed gaps the project records as unfixed defects. */
    defects: number;
}

/** The status a row's counts add up to. */
export const statusOf = (counts: FamilyCounts): FamilyStatus => {
    if (counts.failed > 0) return 'red';
    if (counts.notMeasured > 0) return 'not measured';
    if (counts.passed === 0) return 'no tests';
    if (counts.defects > 0) return 'defects';
    return 'green';
};

const emptyCounts = (): FamilyCounts => ({ passed: 0, failed: 0, notMeasured: 0, accepted: 0, defects: 0 });

const entityDetailMeasurement = (measurement: ParityMeasurement): boolean =>
    measurement.family === FAMILIES.integrationEntityCoverage && measurement.name.startsWith('entity:');

const measurementRow = ({ family, name, value }: ParityMeasurement): string => `| ${family} | ${name} | ${value} |`;

/**
 * Renders the parity dashboard: one Markdown table with a row per family, counting passed,
 * failed and not-measured tests from the Vitest JSON report, and allow-listed gaps from the
 * allow list.
 *
 * Every declared family gets a row whether or not a test claimed it, so a family nobody wrote a
 * comparison for reads "no tests" instead of vanishing. A test whose top-level describe is not
 * a family id is filed under `(other)`.
 *
 * Pure: feed it a report and a list, get Markdown. The CI job pipes the result into the step
 * summary; the weekly job writes it to a file.
 */
export const renderDashboard = (
    report: VitestJsonReport,
    allowList: readonly AllowListEntry[],
    measurements: readonly ParityMeasurement[] = []
): string => {
    const rows = new Map<string, FamilyCounts>();

    const row = (family: string): FamilyCounts => {
        const existing = rows.get(family);
        if (existing) return existing;
        const created = emptyCounts();
        rows.set(family, created);
        return created;
    };

    for (const family of ALL_FAMILIES) row(family);

    for (const file of report.testResults) {
        for (const test of file.assertionResults) {
            const family = familyOf(test.ancestorTitles[0] ?? '') ?? '(other)';
            const counts = row(family);
            if (test.status === 'passed') counts.passed += 1;
            else if (test.status === 'failed') counts.failed += 1;
            // Vitest reports a skipped test as `skipped` or `pending` depending on how it was
            // skipped; both mean the comparison never ran.
            else counts.notMeasured += 1;
        }
    }

    for (const entry of allowList) {
        const counts = row(entry.family);
        if (entry.kind === 'defect') counts.defects += 1;
        else counts.accepted += 1;
    }

    const families = [...rows.keys()].sort();
    const total = emptyCounts();
    for (const counts of rows.values()) {
        total.passed += counts.passed;
        total.failed += counts.failed;
        total.notMeasured += counts.notMeasured;
        total.accepted += counts.accepted;
        total.defects += counts.defects;
    }

    const sortedMeasurements = measurements.toSorted((left, right) =>
        `${left.family}/${left.name}`.localeCompare(`${right.family}/${right.name}`, 'en')
    );
    const summaryMeasurements = sortedMeasurements.filter((measurement) => !entityDetailMeasurement(measurement));
    const entityMeasurements = sortedMeasurements.filter(entityDetailMeasurement);

    const lines = [
        '# Parity dashboard',
        '',
        '| Family | Status | Passed | Failed | Not measured | Accepted gaps | Known defects |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
        ...families.map((family) => {
            const counts = rows.get(family)!;
            return `| ${family} | ${statusOf(counts)} | ${counts.passed} | ${counts.failed} | ${counts.notMeasured} | ${counts.accepted} | ${counts.defects} |`;
        }),
        `| **total** | ${statusOf(total)} | ${total.passed} | ${total.failed} | ${total.notMeasured} | ${total.accepted} | ${total.defects} |`,
        '',
        'A row is green only when every one of its tests compared real reference data and passed.',
        '`not measured` means a comparison found no reference data to stand on, so it compared',
        'nothing; the skipped test names what is missing. `defects` means the comparison passes',
        'only because the allow list records a gap as an unfixed defect.',
        '',
        '## Coverage measurements',
        '',
        '| Family | Measurement | Current |',
        '| --- | --- | ---: |',
        ...summaryMeasurements.map(measurementRow)
    ];

    if (entityMeasurements.length > 0) {
        lines.push(
            '',
            `<details><summary>Entity-level details (${entityMeasurements.length} measurements)</summary>`,
            '',
            '| Family | Measurement | Current |',
            '| --- | --- | ---: |',
            ...entityMeasurements.map(measurementRow),
            '',
            '</details>'
        );
    }

    lines.push('');

    return lines.join('\n');
};
