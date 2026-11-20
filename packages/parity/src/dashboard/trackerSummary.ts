import type { TrackerCase, TrackerData, TrackerFamily, TrackerStatus } from './tracker.ts';

/** One family's counts without its case list, plus the open gaps the summary keeps. */
export interface TrackerSummaryFamily extends Omit<TrackerFamily, 'cases'> {
    /** Every case the family lists, whatever its status. */
    readonly caseCount: number;
    /** Failing checks, then known defects, then deferred work, cut to the summary's per-family limit. */
    readonly openGaps: readonly TrackerCase[];
}

/**
 * A tracker snapshot small enough to render into the parity page's HTML: every total and family
 * count, and the open gaps, but not the tens of thousands of passing and not-measured cases.
 */
export interface TrackerSummary extends Omit<TrackerData, 'families' | 'cases'> {
    /** Every case in the snapshot, whatever its status. */
    readonly caseCount: number;
    readonly families: readonly TrackerSummaryFamily[];
}

/** The statuses that leave work open, most severe first. */
const OPEN_GAP_STATUSES: readonly TrackerStatus[] = ['failed', 'defect', 'deferred'];

const openGapRank = (entry: TrackerCase): number => OPEN_GAP_STATUSES.indexOf(entry.status);

/**
 * Summarizes a tracker snapshot for a page that has to read without its case list.
 *
 * It reads the cases from the snapshot's top-level list, which holds every family's cases, so it
 * also accepts the staged index, whose families carry none, once its case chunks are joined into
 * that list.
 *
 * @param data - The snapshot, with every case in its top-level `cases`.
 * @param gapsPerFamily - The most open gaps kept for one family; its counts still cover them all.
 */
export const summarizeTracker = (data: TrackerData, gapsPerFamily: number): TrackerSummary => {
    const { families, cases, ...totals } = data;
    const byFamily = Map.groupBy(cases, (entry) => entry.family);
    return {
        ...totals,
        caseCount: cases.length,
        families: families.map(({ cases: _cases, ...family }) => {
            const familyCases = byFamily.get(family.id) ?? [];
            const openGaps = familyCases
                .filter((entry) => openGapRank(entry) >= 0)
                .toSorted(
                    (left, right) =>
                        openGapRank(left) - openGapRank(right) ||
                        left.title.localeCompare(right.title, 'en') ||
                        left.id.localeCompare(right.id, 'en')
                );
            return { ...family, caseCount: familyCases.length, openGaps: openGaps.slice(0, gapsPerFamily) };
        })
    };
};
