import { withBase } from 'vitepress';
import { onMounted, ref } from 'vue';

import type { TrackerData, TrackerFamily } from '../../../../../packages/parity/src/dashboard/tracker.ts';
import { trackerProgressTotal } from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';

/** Passing and tracked counts for one family group, as the parity tracker page shows them. */
export interface GroupProgress {
    id: string;
    label: string;
    passed: number;
    tracked: number;
}

/** Loads the tracker snapshot that `docs:stage` writes into the site's public directory. */
export function useTrackerSnapshot() {
    const tracker = ref<TrackerData | null>(null);
    const loadError = ref(false);
    onMounted(async () => {
        try {
            const response = await fetch(withBase('/parity-tracker.json'));
            if (!response.ok) throw new Error(`Could not load tracker data (${response.status}).`);
            // The site build stages this file from the typed parity tracker generator.
            tracker.value = (await response.json()) as TrackerData;
        } catch {
            loadError.value = true;
        }
    });
    return { tracker, loadError };
}

/**
 * Sums families into their groups, ordered by group name. Tracked counts include deferred work and
 * known defects, so a group with open gaps never reads as complete.
 */
export function groupProgress(families: readonly TrackerFamily[]): GroupProgress[] {
    const totals = new Map<string, { passed: number; checks: number; deferred: number; defects: number }>();
    for (const family of families) {
        const total = totals.get(family.group) ?? { passed: 0, checks: 0, deferred: 0, defects: 0 };
        total.passed += family.passed;
        total.checks += family.checks;
        total.deferred += family.deferred;
        total.defects += family.defects;
        totals.set(family.group, total);
    }
    return [...totals.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([id, total]) => ({
            id,
            label: id === 'other' ? 'Other checks' : id,
            passed: total.passed,
            tracked: trackerProgressTotal(total)
        }));
}
