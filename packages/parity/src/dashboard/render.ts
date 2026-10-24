import type { AllowListEntry } from '../allowlist.ts';
import { familyOf } from '../families.ts';

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

/** The counts one dashboard row carries. */
interface FamilyCounts {
    passed: number;
    failed: number;
    allowListed: number;
}

/**
 * Renders the parity dashboard: one Markdown table with a row per family, counting passed and
 * failed tests from the Vitest JSON report and allow-listed gaps from the allow list. A test
 * whose top-level describe is not a family id is filed under `(other)`.
 *
 * Pure: feed it a report and a list, get Markdown. The CI job pipes the result into the step
 * summary; the weekly job writes it to a file.
 */
export const renderDashboard = (report: VitestJsonReport, allowList: readonly AllowListEntry[]): string => {
    const rows = new Map<string, FamilyCounts>();

    const row = (family: string): FamilyCounts => {
        const existing = rows.get(family);
        if (existing) return existing;
        const created = { passed: 0, failed: 0, allowListed: 0 };
        rows.set(family, created);
        return created;
    };

    for (const file of report.testResults) {
        for (const test of file.assertionResults) {
            const family = familyOf(test.ancestorTitles[0] ?? '') ?? '(other)';
            const counts = row(family);
            if (test.status === 'passed') counts.passed += 1;
            else if (test.status === 'failed') counts.failed += 1;
        }
    }

    for (const entry of allowList) row(entry.family).allowListed += 1;

    const families = [...rows.keys()].sort();
    const total = { passed: 0, failed: 0, allowListed: 0 };
    for (const counts of rows.values()) {
        total.passed += counts.passed;
        total.failed += counts.failed;
        total.allowListed += counts.allowListed;
    }

    const lines = [
        '# Parity dashboard',
        '',
        '| Family | Passed | Failed | Allow-listed |',
        '| --- | ---: | ---: | ---: |',
        ...families.map((family) => {
            const counts = rows.get(family)!;
            return `| ${family} | ${counts.passed} | ${counts.failed} | ${counts.allowListed} |`;
        }),
        `| **total** | ${total.passed} | ${total.failed} | ${total.allowListed} |`,
        ''
    ];

    return lines.join('\n');
};
