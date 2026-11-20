import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TrackerCase } from '../../../packages/parity/src/dashboard/tracker.ts';
import { summarizeTracker, type TrackerSummary } from '../../../packages/parity/src/dashboard/trackerSummary.ts';
import type { TrackerIndex } from './.vitepress/theme/parity.ts';

/**
 * Open gaps each family lists in the page's HTML. The full list arrives with the case chunks; this
 * keeps a snapshot with thousands of failures from rendering every one of them into the page.
 */
const GAPS_PER_FAMILY = 10;

/** Where `docs:stage` writes the tracker index and its case chunks. */
const trackerDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'parity-tracker');

/** What the parity page renders before, and without, its case list: the summary and the chunks to fetch for the rest. */
export interface ParityPageData {
    summary: TrackerSummary;
    /** The case chunk files under `parity-tracker/`, in family order. */
    caseChunks: readonly string[];
}

declare const data: ParityPageData | null;
export { data };

export default {
    watch: ['./public/parity-tracker/index.json'],
    load(): ParityPageData | null {
        const indexFile = path.join(trackerDir, 'index.json');
        if (!existsSync(indexFile)) {
            console.warn('No parity tracker snapshot is staged; run `pnpm run docs:stage` to stage one.');
            return null;
        }
        // `docs:stage` writes these files from the typed parity tracker generator.
        const index = JSON.parse(readFileSync(indexFile, 'utf8')) as TrackerIndex;
        const cases = index.caseChunks.flatMap(
            (name) => JSON.parse(readFileSync(path.join(trackerDir, name), 'utf8')) as TrackerCase[]
        );
        return {
            summary: summarizeTracker({ ...index, cases }, GAPS_PER_FAMILY),
            caseChunks: index.caseChunks
        };
    }
};
