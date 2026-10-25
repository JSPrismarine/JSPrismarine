import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The classification table the parity claim counts: one row per measured difference between
 * the editions, read out of docs/research/edition-behavior-differences.md section 13.
 *
 * The table is the project's own classification, not a copy of it. Parsing the note rather
 * than restating its numbers is what lets `conformance.classification` catch a row moving from
 * Server to Client: the counts the published documents state are checked against the counts
 * the table actually holds.
 */

// This file is `packages/parity/src/classification.ts`, so the repository root is three up.
const repoRoot = join(import.meta.dirname, '..', '..', '..');

/** Who decides a difference's outcome. */
export const AXIS_A = ['Server', 'Client', 'Mixed'] as const;
/** What a player sees when the server implements Java's rule for a difference. */
export const AXIS_B = ['Invisible', 'Correct', 'Broken', 'Desync'] as const;

/** Who decides one difference's outcome. */
export type Decider = (typeof AXIS_A)[number];
/** What a player sees for one difference. */
export type Visibility = (typeof AXIS_B)[number];

/** One classified difference between the editions. */
export interface ClassificationRow {
    /** The row number the note gives it, 1 through the table's length. */
    readonly id: number;
    /** The area the note files it under, such as `Combat` or `Redstone`. */
    readonly area: string;
    /** The one-line statement of the difference. */
    readonly behavior: string;
    readonly decider: Decider;
    readonly visibility: Visibility;
    /** The note sections and bug keys that back the row. */
    readonly source: string;
}

/** The repository-relative path of the note the table lives in. */
export const CLASSIFICATION_NOTE = 'docs/research/edition-behavior-differences.md';

const isDecider = (value: string): value is Decider => (AXIS_A as readonly string[]).includes(value);
const isVisibility = (value: string): value is Visibility => (AXIS_B as readonly string[]).includes(value);

/**
 * Reads the classification table out of the research note.
 *
 * A row is a Markdown table line whose first cell is a number, which is the shape the note's
 * section 13 uses and no other table in the note does.
 * @throws {RangeError} When a row carries an axis value outside the two declared sets.
 */
export const loadClassification = (): readonly ClassificationRow[] => {
    const note = readFileSync(join(repoRoot, CLASSIFICATION_NOTE), 'utf-8');
    const rows: ClassificationRow[] = [];

    for (const line of note.split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
        if (cells.length !== 6) continue;
        const [id, area, behavior, decider, visibility, source] = cells as [
            string,
            string,
            string,
            string,
            string,
            string
        ];
        if (!/^\d+$/.test(id)) continue;
        if (!isDecider(decider)) throw new RangeError(`row ${id} has an unknown Axis A value: ${decider}`);
        if (!isVisibility(visibility)) throw new RangeError(`row ${id} has an unknown Axis B value: ${visibility}`);
        rows.push({ id: Number(id), area, behavior, decider, visibility, source });
    }

    return rows;
};

/** Counts the rows by one of their fields, as the note's own summary paragraph does. */
export const countBy = <K extends keyof ClassificationRow>(
    rows: readonly ClassificationRow[],
    field: K
): ReadonlyMap<ClassificationRow[K], number> => {
    const counts = new Map<ClassificationRow[K], number>();
    for (const row of rows) counts.set(row[field], (counts.get(row[field]) ?? 0) + 1);
    return counts;
};

/**
 * The rows the parity claim covers: the differences a server decides whose Java behavior a
 * Bedrock player either cannot see or sees correctly. Section 14 of the note calls these the
 * rows the claim is about.
 */
export const coveredRows = (rows: readonly ClassificationRow[]): readonly ClassificationRow[] =>
    rows.filter((row) => row.decider === 'Server' && (row.visibility === 'Invisible' || row.visibility === 'Correct'));

/** Reads a repository file for a document assertion. */
export const readRepoFile = (path: string): string => readFileSync(join(repoRoot, path), 'utf-8');
