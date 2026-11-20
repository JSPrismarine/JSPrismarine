import { withBase } from 'vitepress';
import { onMounted, ref, shallowRef } from 'vue';

import type { TrackerCase, TrackerData, TrackerFamily } from '../../../../../packages/parity/src/dashboard/tracker.ts';
import { trackerProgressTotal } from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';

/** Passing and tracked counts for one family group, as the parity tracker page shows them. */
export interface GroupProgress {
    id: string;
    label: string;
    passed: number;
    tracked: number;
}

/**
 * The staged tracker index. Its families and top-level list carry no cases; `caseChunks` names the
 * files under `parity-tracker/` that hold them, in family order.
 */
export interface TrackerIndex extends TrackerData {
    readonly caseChunks: readonly string[];
}

/** Loads the tracker snapshot that `docs:stage` writes into the site's public directory. */
export function useTrackerSnapshot() {
    const tracker = ref<TrackerData | null>(null);
    const loadError = ref(false);
    onMounted(async () => {
        try {
            const index = await fetchJson<TrackerIndex>('index.json');
            const cases = await fetchCases(index.caseChunks);
            tracker.value = { ...index, cases, families: withCases(index.families, cases) };
        } catch {
            loadError.value = true;
        }
    });
    return { tracker, loadError };
}

/**
 * Loads the case chunks once the page has mounted. Until then, and if they fail to load, `cases` is
 * null, so the page renders what it rendered on the server.
 */
export function useTrackerCases(caseChunks: readonly string[]) {
    // A shallow ref: tens of thousands of cases never change once loaded, so nothing needs to track them.
    const cases = shallowRef<readonly TrackerCase[] | null>(null);
    const loadError = ref(false);
    onMounted(async () => {
        try {
            cases.value = await fetchCases(caseChunks);
        } catch {
            loadError.value = true;
        }
    });
    return { cases, loadError };
}

/** Gives each family the cases the chunks hold for it, in chunk order. */
export function withCases<Family extends { readonly id: string }>(
    families: readonly Family[],
    cases: readonly TrackerCase[]
) {
    const byFamily = Map.groupBy(cases, (entry) => entry.family);
    return families.map((family) => ({ ...family, cases: byFamily.get(family.id) ?? [] }));
}

async function fetchCases(caseChunks: readonly string[]): Promise<TrackerCase[]> {
    const chunks = await Promise.all(caseChunks.map((name) => fetchJson<TrackerCase[]>(name)));
    return chunks.flat();
}

async function fetchJson<T>(name: string): Promise<T> {
    const response = await fetch(withBase(`/parity-tracker/${name}`));
    if (!response.ok) throw new Error(`Could not load tracker data (${response.status}).`);
    // The site build stages these files from the typed parity tracker generator.
    return (await response.json()) as T;
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
