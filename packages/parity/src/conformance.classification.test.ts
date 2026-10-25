import { describe, expect, it } from 'vitest';

import { AXIS_A, AXIS_B, countBy, coveredRows, loadClassification, readRepoFile } from './classification.ts';
import { FAMILIES } from './families.ts';

/**
 * The first of the two tests plan section 8 asks for: the classification table the claim
 * counts stays in step with the research note, so a row moving from Server to Client is
 * visible in review.
 *
 * The table is parsed, not restated. Every number the published documents give for it is
 * checked against the rows themselves, so changing a row's Axis A without changing the three
 * documents that count it fails here, and so does changing a count without the row.
 */

/** The documents that state the classification's totals, each of which has to agree with it. */
const PUBLISHED = [
    'docs/research/edition-behavior-differences.md',
    'docs/plans/data-driven-vanilla.md',
    'docs/data-driven/parity.md'
] as const;

/** Every whole number a document states, so a count can be looked for without pinning wording. */
const numbersIn = (path: string): Set<number> => new Set((readRepoFile(path).match(/\b\d+\b/g) ?? []).map(Number));

describe(FAMILIES.conformanceClassification, () => {
    const rows = loadClassification();
    const byDecider = countBy(rows, 'decider');
    const byVisibility = countBy(rows, 'visibility');

    it('reads a well formed row for every difference, numbered without a gap', () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.map((row) => row.id)).toEqual(rows.map((_row, index) => index + 1));
        for (const row of rows) {
            expect(AXIS_A).toContain(row.decider);
            expect(AXIS_B).toContain(row.visibility);
            expect(row.area).not.toBe('');
            expect(row.source).not.toBe('');
        }
    });

    it("agrees with the note's own summary of the table it carries", () => {
        const note = readRepoFile('docs/research/edition-behavior-differences.md');

        expect(note).toContain(`${rows.length} rows.`);
        expect(note).toContain(
            `By Axis A: ${byDecider.get('Server')} Server, ${byDecider.get('Client')} Client, ${byDecider.get('Mixed')} Mixed.`
        );
        expect(note).toContain(
            `By Axis B: ${byVisibility.get('Invisible')} Invisible, ${byVisibility.get('Correct')} Correct, ${byVisibility.get('Broken')} Broken, ${byVisibility.get('Desync')} Desync.`
        );
        expect(note).toContain(`The ${coveredRows(rows).length} rows that are Server and either Invisible or Correct`);
    });

    it('agrees with the area counts the note publishes', () => {
        const note = readRepoFile('docs/research/edition-behavior-differences.md');
        const published = note.slice(note.indexOf('By area:'), note.indexOf('By area:') + 200);

        for (const [area, count] of countBy(rows, 'area')) {
            expect(published.toLowerCase(), `${area} is classified on ${count} rows`).toContain(
                `${count} ${area.toLowerCase()}`
            );
        }
    });

    it.each(PUBLISHED)('%s states the table total and the covered total', (path) => {
        const numbers = numbersIn(path);

        expect(numbers, `${path} should state the ${rows.length}-row total`).toContain(rows.length);
        expect(numbers, `${path} should state the ${coveredRows(rows).length} covered rows`).toContain(
            coveredRows(rows).length
        );
    });

    it('counts the rows a server decides the way the plan and the parity page do', () => {
        const server = byDecider.get('Server') ?? 0;

        for (const path of PUBLISHED) {
            expect(numbersIn(path), `${path} should state ${server} server-decided rows`).toContain(server);
        }
    });
});
