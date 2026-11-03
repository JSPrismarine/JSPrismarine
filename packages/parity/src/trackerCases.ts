import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { Family } from './families.ts';

/** One data record compared by a parity family. */
export interface ParityTrackerRecord {
    /** Stable identifier from the Java or Bedrock data being compared. */
    readonly id: string;
    /** Searchable name shown in the tracker. */
    readonly title: string;
    /** Outcome of this record's comparison. */
    readonly status: 'passed' | 'failed' | 'not measured';
    /** Optional searchable behavior, registry, or data context. */
    readonly context?: string;
    /** Specific mismatch details, when the comparison found one. */
    readonly details?: string;
}

/** Builds a searchable parity record from the result of one data comparison. */
export const parityCase = (id: string, title: string, context: string, matched: boolean): ParityTrackerRecord => ({
    id,
    title,
    context,
    status: matched ? 'passed' : 'failed'
});

interface StoredParityTrackerRecord extends ParityTrackerRecord {
    readonly family: Family;
    readonly sourceFile: string;
}

/**
 * Writes the individual data records covered by an aggregate parity assertion.
 *
 * Vitest's JSON report only has one result for a test that loops over hundreds of Java values.
 * This sidecar lets the dashboard retain each real comparison without adding hundreds of
 * artificial Vitest tests. It is a no-op during ordinary test runs.
 * @param family - The declared family for these comparison records.
 * @param sourceFile - The absolute path to the test file that performs the comparisons.
 * @param records - Data records and the outcomes of their comparisons.
 */
export const reportParityCases = (
    family: Family,
    sourceFile: string,
    records: readonly ParityTrackerRecord[]
): void => {
    const directory = process.env.PARITY_CASES_DIRECTORY;
    if (directory === undefined || records.length === 0) return;

    mkdirSync(directory, { recursive: true });
    const key = `${family}-${basename(sourceFile).replaceAll(/[^a-zA-Z0-9._-]/g, '_')}.jsonl`;
    const path = join(directory, key);
    const stored = records.map((record): StoredParityTrackerRecord => ({ ...record, family, sourceFile }));
    appendFileSync(path, `${stored.map((record) => JSON.stringify(record)).join('\n')}\n`);
};
