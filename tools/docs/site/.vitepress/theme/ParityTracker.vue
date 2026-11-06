<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { TrackerData } from '../../../../../packages/parity/src/dashboard/tracker.ts';
import {
    trackerPrimaryProgressPercent,
    trackerProgressPercent,
    trackerProgressTotal
} from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';

const statuses = [
    { id: 'all', label: 'Any status' },
    { id: 'passed', label: 'Passing' },
    { id: 'failed', label: 'Failing' },
    { id: 'not measured', label: 'Not measured' },
    { id: 'intentional', label: 'Intentional differences' },
    { id: 'deferred', label: 'Deferred' },
    { id: 'defect', label: 'Known defects' }
] as const;
const CASES_PER_FAMILY_PAGE = 20;
const activeGroup = ref('all');
const activeStatus = ref<(typeof statuses)[number]['id']>('all');
const query = ref('');
const search = ref('');
const expanded = ref(false);
const familyCaseLimits = ref<Record<string, number>>({});
const tracker = ref<TrackerData | null>(null);
const loadError = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(query, (value) => {
    if (searchTimer !== undefined) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        search.value = value;
        familyCaseLimits.value = {};
    }, 120);
});

watch([activeGroup, activeStatus], () => {
    familyCaseLimits.value = {};
});

onBeforeUnmount(() => {
    if (searchTimer !== undefined) clearTimeout(searchTimer);
});

const groups = computed(() => {
    const snapshot = tracker.value;
    if (snapshot === null) return [{ id: 'all', label: 'All', passed: 0, tracked: 0 }];
    const totals = new Map<string, { passed: number; checks: number; deferred: number; defects: number }>();
    for (const family of snapshot.families) {
        const total = totals.get(family.group) ?? { passed: 0, checks: 0, deferred: 0, defects: 0 };
        total.passed += family.passed;
        total.checks += family.checks;
        total.deferred += family.deferred;
        total.defects += family.defects;
        totals.set(family.group, total);
    }

    const allChecks = {
        checks: snapshot.checks,
        deferred: snapshot.deferred,
        defects: snapshot.defects
    };
    return [
        { id: 'all', label: 'All', passed: snapshot.passed, tracked: trackerProgressTotal(allChecks) },
        ...[...totals.entries()]
            .sort(([left], [right]) => left.localeCompare(right, 'en'))
            .map(([id, total]) => ({
                id,
                label: id === 'other' ? 'Other checks' : id,
                passed: total.passed,
                tracked: trackerProgressTotal(total)
            }))
    ];
});

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

const sourceRevision = computed(() =>
    tracker.value !== null && /^[0-9a-f]{40}$/i.test(tracker.value.sourceCommit) ? tracker.value.sourceCommit : 'master'
);
const sourceUrl = (file: string, line?: number): string =>
    `https://github.com/JSPrismarine/JSPrismarine/blob/${sourceRevision.value}/${file}${line === undefined ? '' : `#L${line}`}`;

const visibleFamilies = computed(() => {
    const snapshot = tracker.value;
    if (snapshot === null) return [];
    const searchTerm = search.value.trim().toLocaleLowerCase();

    return snapshot.families
        .filter((family) => activeGroup.value === 'all' || family.group === activeGroup.value)
        .map((family) => {
            const matchingCases = family.cases.filter((entry) => {
                const matchesStatus = activeStatus.value === 'all' || entry.status === activeStatus.value;
                const searchable = [
                    family.id,
                    entry.title,
                    entry.context,
                    entry.details,
                    entry.references?.map((part) => part.text).join(' '),
                    entry.runtimeSupport?.status,
                    entry.runtimeSupport?.details,
                    entry.sourceFile
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase();
                return matchesStatus && (searchTerm === '' || searchable.includes(searchTerm));
            });
            const limit = familyCaseLimits.value[family.id] ?? CASES_PER_FAMILY_PAGE;
            return {
                ...family,
                matchCount: matchingCases.length,
                visibleCases: matchingCases.slice(0, limit)
            };
        })
        .filter(
            (family) =>
                family.matchCount > 0 ||
                (searchTerm === '' && activeStatus.value === 'all' && family.cases.length === 0)
        );
});

const displayedCaseCount = computed(() =>
    visibleFamilies.value.reduce((total, family) => total + family.visibleCases.length, 0)
);
const matchingCaseCount = computed(() => visibleFamilies.value.reduce((total, family) => total + family.matchCount, 0));

const loadMoreCases = (familyId: string): void => {
    const currentLimit = familyCaseLimits.value[familyId] ?? CASES_PER_FAMILY_PAGE;
    familyCaseLimits.value = { ...familyCaseLimits.value, [familyId]: currentLimit + CASES_PER_FAMILY_PAGE };
};

const selectedGroup = (id: string): void => {
    activeGroup.value = id;
};

const percentage = trackerProgressPercent;
</script>

<template>
    <main v-if="tracker" class="tracker">
        <p class="tracker-intro">
            Cases include Java or Bedrock comparisons and explicit not-measured behavior inventories. A passing data row
            does not claim runtime behavior parity. Reviewed differences include clickable references; search by game
            identifier, behavior, family, or source file.
        </p>

        <section class="tracker-overview" aria-label="Tracked parity case status">
            <div class="overview-heading">
                <div class="overview-score">
                    <strong class="score-percent"
                        >{{ trackerPrimaryProgressPercent(tracker.passed, trackerProgressTotal(tracker))
                        }}<span>%</span></strong
                    >
                    <div class="score-copy">
                        <h2>tracked comparison pass rate</h2>
                        <span
                            >{{ tracker.passed.toLocaleString() }} of
                            {{ trackerProgressTotal(tracker).toLocaleString() }} tracked comparisons passing</span
                        >
                    </div>
                </div>
                <p class="snapshot-date">
                    Generated <time :datetime="tracker.generatedAt">{{ tracker.generatedAt.slice(0, 10) }}</time>
                    <br />
                    Commit <code>{{ sourceRevision.slice(0, 7) }}</code>
                </p>
            </div>
            <progress
                class="overall-progress"
                :value="tracker.passed"
                :max="Math.max(trackerProgressTotal(tracker), 1)"
                :aria-label="`${tracker.passed} of ${trackerProgressTotal(tracker)} tracked comparisons passing`"
            />
            <div class="overview-counts">
                <span class="status-count passed"
                    ><b>{{ tracker.passed }}</b> passing</span
                >
                <span class="status-count failed"
                    ><b>{{ tracker.failed }}</b> failing</span
                >
                <span class="status-count not-measured"
                    ><b>{{ tracker.notMeasured }}</b> not measured</span
                >
                <span class="status-count intentional"
                    ><b>{{ tracker.intentional }}</b> intentional differences</span
                >
                <span class="status-count deferred"
                    ><b>{{ tracker.deferred }}</b> deferred</span
                >
                <span class="status-count defect"
                    ><b>{{ tracker.defects }}</b> known defects</span
                >
            </div>
            <p class="coverage-note">
                The percentage uses listed comparisons, including not-measured, deferred, and known-defect rows. It is
                not a score for all Java behavior; intentional differences are excluded. Entity runtime support is
                listed separately from behavior parity.
            </p>
        </section>

        <section class="group-picker" aria-label="Filter by family group">
            <h2>Behavior groups</h2>
            <button
                v-for="group in groups"
                :key="group.id"
                type="button"
                class="group-option"
                :class="{ active: activeGroup === group.id }"
                :aria-pressed="activeGroup === group.id"
                @click="selectedGroup(group.id)"
            >
                <span class="group-option-name">{{ group.label }}</span>
                <span class="group-option-count">{{
                    group.id === 'all'
                        ? `${tracker?.cases.length.toLocaleString() ?? 0} cases`
                        : `${group.passed}/${group.tracked} · ${percentage(group.passed, group.tracked)}%`
                }}</span>
                <progress
                    v-if="group.id !== 'all'"
                    :value="group.passed"
                    :max="Math.max(group.tracked, 1)"
                    aria-hidden="true"
                />
            </button>
        </section>

        <section class="case-list" aria-label="Parity cases">
            <div class="controls">
                <div class="status-filters" role="group" aria-label="Filter by status">
                    <button
                        v-for="status in statuses"
                        :key="status.id"
                        type="button"
                        :class="{ active: activeStatus === status.id }"
                        :aria-pressed="activeStatus === status.id"
                        @click="activeStatus = status.id"
                    >
                        {{ status.label }}
                    </button>
                </div>
                <label class="search-field">
                    <span class="visually-hidden">Search parity cases</span>
                    <input v-model="query" type="search" placeholder="Search cases, families, or files…" />
                </label>
            </div>

            <div class="results-heading">
                <span
                    >Showing {{ displayedCaseCount }} of {{ matchingCaseCount }} matching cases ·
                    {{ tracker.cases.length }} tracked total</span
                >
                <button type="button" class="expand-toggle" @click="expanded = !expanded">
                    {{ expanded ? 'Collapse all' : 'Expand all' }}
                </button>
            </div>

            <p v-if="visibleFamilies.length === 0" class="empty-state">No parity cases match these filters.</p>

            <details v-for="family in visibleFamilies" :key="family.id" class="family" :open="expanded">
                <summary>
                    <span class="family-title">
                        <span class="family-name">{{ family.id }}</span>
                        <span class="family-count">{{ family.matchCount }} matching cases</span>
                    </span>
                    <span class="family-progress">
                        <span
                            >{{ family.passed }}/{{ trackerProgressTotal(family) }} tracked passing ·
                            {{ percentage(family.passed, trackerProgressTotal(family)) }}%</span
                        >
                        <progress
                            :value="family.passed"
                            :max="Math.max(trackerProgressTotal(family), 1)"
                            :aria-label="`${family.passed} of ${trackerProgressTotal(family)} tracked checks passing`"
                        />
                    </span>
                </summary>
                <ul class="cases">
                    <li v-for="entry in family.visibleCases" :key="entry.id" class="case">
                        <span
                            class="status-mark"
                            :class="`status-${entry.status.replaceAll(' ', '-')}`"
                            aria-hidden="true"
                        />
                        <div class="case-copy">
                            <span class="case-title">{{ entry.title }}</span>
                            <span v-if="entry.context" class="case-context">{{ entry.context }}</span>
                            <span v-if="entry.details" class="case-details">{{ entry.details }}</span>
                            <span
                                v-if="entry.runtimeSupport"
                                class="runtime-support"
                                :class="`runtime-support-${entry.runtimeSupport.status.replaceAll(' ', '-')}`"
                            >
                                <strong>Runtime {{ entry.runtimeSupport.status }}</strong>
                                <span>{{ entry.runtimeSupport.details }}</span>
                            </span>
                            <span v-if="entry.references?.length" class="case-details">
                                Reference:
                                <template v-for="(part, index) in entry.references" :key="`${entry.id}-ref-${index}`">
                                    <a
                                        v-if="part.href"
                                        class="reference-link"
                                        :href="part.href"
                                        target="_blank"
                                        rel="noreferrer"
                                        >{{ part.text }}</a
                                    ><span v-else>{{ part.text }}</span>
                                </template>
                            </span>
                        </div>
                        <span class="status-badge" :class="`status-${entry.status.replaceAll(' ', '-')}`">
                            {{ entry.status }}
                        </span>
                        <a
                            class="file-link"
                            :href="sourceUrl(entry.sourceFile, entry.line)"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {{ entry.sourceFile.split('/').at(-1) }}
                        </a>
                    </li>
                    <li v-if="family.visibleCases.length < family.matchCount" class="case-more">
                        <button type="button" @click="loadMoreCases(family.id)">
                            Load next
                            {{ Math.min(CASES_PER_FAMILY_PAGE, family.matchCount - family.visibleCases.length) }}
                            cases · {{ family.matchCount - family.visibleCases.length }} remaining
                        </button>
                    </li>
                </ul>
            </details>
        </section>
    </main>
    <p v-else-if="loadError" class="tracker-message">Could not load the parity tracker data. Refresh to try again.</p>
    <p v-else class="tracker-message">Loading parity tracker…</p>
</template>

<style scoped>
.tracker {
    --tracker-good: var(--vp-c-brand-1);
    --tracker-bad: var(--vp-c-red-1);
    --tracker-intentional: var(--vp-c-yellow-1);
    --tracker-deferred: var(--vp-c-orange-1);
    --tracker-muted: var(--vp-c-text-3);
    --tracker-border: var(--vp-c-divider);
    --tracker-surface: var(--vp-c-bg-soft);
    color: var(--vp-c-text-1);
}

.tracker-intro {
    max-width: 760px;
    margin: 0 0 1.5rem;
    color: var(--vp-c-text-2);
    font-size: 1rem;
    line-height: 1.65;
}

.tracker-message {
    padding: 2.5rem 0;
    color: var(--vp-c-text-2);
    text-align: center;
}

.tracker-overview {
    padding: 1.15rem 0 1.25rem;
    border-top: 1px solid var(--tracker-border);
    border-bottom: 1px solid var(--tracker-border);
}

.overview-heading,
.overview-score,
.overview-counts,
.family-title,
.family-progress,
.results-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.overview-score {
    justify-content: flex-start;
    gap: 0.85rem;
}

.score-percent {
    color: var(--vp-c-brand-1);
    font-size: 3.3rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -0.07em;
    line-height: 1;
}
.score-percent span {
    margin-left: 0.08em;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
}
.score-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.overview-heading h2 {
    margin: 0;
    border: 0;
    font-size: 1rem;
}
.score-copy > span {
    color: var(--vp-c-text-2);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
}
.snapshot-date {
    margin: 0;
    color: var(--tracker-muted);
    font-size: 0.72rem;
    line-height: 1.8;
    text-align: right;
}
.snapshot-date code {
    color: var(--vp-c-text-2);
    font-size: 0.68rem;
}

progress {
    width: 100%;
    height: 0.42rem;
    overflow: hidden;
    border: 0;
    border-radius: 2px;
    background: var(--vp-c-bg-alt);
    accent-color: var(--tracker-good);
}

progress::-webkit-progress-bar {
    border-radius: 2px;
    background: var(--vp-c-bg-alt);
}

progress::-webkit-progress-value {
    border-radius: 2px;
    background: var(--tracker-good);
}

.overall-progress {
    margin: 1rem 0 0.65rem;
    height: 0.55rem;
}

.overview-counts {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    color: var(--vp-c-text-2);
    font-size: 0.72rem;
}

.status-count b {
    margin-right: 0.2rem;
    font-variant-numeric: tabular-nums;
}
.coverage-note {
    max-width: 780px;
    margin: 0.65rem 0 0;
    color: var(--tracker-muted);
    font-size: 0.7rem;
    line-height: 1.5;
}

.passed {
    color: var(--tracker-good);
}
.failed,
.defect {
    color: var(--tracker-bad);
}
.not-measured {
    color: var(--tracker-muted);
}
.intentional {
    color: var(--tracker-intentional);
}
.deferred {
    color: var(--tracker-deferred);
}

.group-picker {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.4rem 1rem;
    margin: 1.4rem 0 1.15rem;
}
.group-picker h2 {
    flex-basis: 100%;
    margin: 0 0 0.25rem;
    border: 0;
    font-size: 0.82rem;
    font-weight: 600;
}

.group-option {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 95px;
    padding: 0.4rem 0.1rem 0.5rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--vp-c-text-2);
    cursor: pointer;
    text-align: left;
}
.group-option:hover {
    color: var(--vp-c-brand-1);
}
.group-option.active {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-text-1);
}
.group-option-name {
    font-size: 0.76rem;
    font-weight: 600;
}
.group-option-count {
    color: var(--tracker-muted);
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
}
.group-option progress {
    height: 0.22rem;
}

.case-list {
    border-top: 1px solid var(--tracker-border);
}

.controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 0;
}

.status-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}
.status-filters button,
.expand-toggle {
    padding: 0.4rem 0.68rem;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--vp-c-text-2);
    cursor: pointer;
    font-size: 0.72rem;
}

.status-filters button:hover,
.expand-toggle:hover {
    color: var(--vp-c-brand-1);
}
.status-filters button.active {
    border-color: var(--tracker-border);
    background: var(--tracker-surface);
    color: var(--vp-c-brand-1);
}

.search-field {
    flex: 0 1 290px;
}
.search-field input {
    width: 100%;
    padding: 0.56rem 0.75rem;
    border: 1px solid var(--tracker-border);
    border-radius: 6px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    font: inherit;
    font-size: 0.8rem;
}

.results-heading {
    padding: 0.15rem 0 0.7rem;
    color: var(--tracker-muted);
    font-size: 0.72rem;
}

.expand-toggle {
    color: var(--vp-c-brand-1);
}
.empty-state {
    padding: 2rem 0;
    color: var(--tracker-muted);
    text-align: center;
}

.family {
    border-top: 1px solid var(--tracker-border);
}
.family:last-child {
    border-bottom: 1px solid var(--tracker-border);
}
.family > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 0.25rem;
    cursor: pointer;
    list-style-position: inside;
}
.family > summary::marker {
    color: var(--vp-c-brand-1);
}

.family-name {
    font-weight: 700;
}
.family-count {
    color: var(--tracker-muted);
    font-size: 0.75rem;
}
.family-progress {
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
    min-width: 155px;
    color: var(--tracker-muted);
    font-size: 0.7rem;
}
.family-progress progress {
    width: 125px;
    height: 0.38rem;
}

.cases {
    margin: 0;
    padding: 0 0 0.3rem 1.2rem;
    list-style: none;
}
.case {
    display: grid;
    grid-template-columns: 0.5rem minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.2rem;
    border-top: 1px solid color-mix(in srgb, var(--tracker-border) 65%, transparent);
}
.case-more {
    grid-column: 2 / -1;
    padding: 0.3rem 0 0.65rem;
    list-style: none;
}
.case-more button {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--tracker-border);
    border-radius: 6px;
    background: var(--tracker-surface);
    color: var(--vp-c-brand-1);
    cursor: pointer;
    font-size: 0.68rem;
}
.case-more button:hover {
    border-color: var(--vp-c-brand-1);
}

.status-mark {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--tracker-muted);
}
.status-passed {
    background: var(--tracker-good);
}
.status-failed,
.status-defect {
    background: var(--tracker-bad);
}
.status-intentional {
    background: var(--tracker-intentional);
}
.status-deferred {
    background: var(--tracker-deferred);
}
.status-not-measured {
    background: var(--tracker-muted);
}
.case-copy {
    display: flex;
    flex-direction: column;
    gap: 0.16rem;
    min-width: 0;
}
.case-title {
    overflow-wrap: anywhere;
    font-size: 0.82rem;
    font-weight: 600;
}
.case-context,
.case-details {
    color: var(--tracker-muted);
    font-size: 0.72rem;
    line-height: 1.45;
}
.runtime-support {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.45rem;
    color: var(--tracker-muted);
    font-size: 0.7rem;
    line-height: 1.45;
}
.runtime-support strong {
    color: var(--vp-c-text-2);
    font-weight: 600;
}
.runtime-support-spawnable strong {
    color: var(--tracker-good);
}
.runtime-support-partial strong {
    color: var(--tracker-deferred);
}
.runtime-support-missing strong,
.runtime-support-unrepresentable strong {
    color: var(--tracker-bad);
}
.runtime-support-substitute strong,
.runtime-support-block-backed strong {
    color: var(--tracker-intentional);
}
.case-details {
    max-width: 65ch;
}
.status-badge {
    padding: 0.22rem 0.45rem;
    border-radius: 5px;
    background: var(--tracker-surface);
    color: var(--vp-c-text-2);
    font-size: 0.65rem;
    white-space: nowrap;
}
.status-badge.status-passed {
    background: color-mix(in srgb, var(--tracker-good) 12%, transparent);
    color: var(--tracker-good);
}
.status-badge.status-failed,
.status-badge.status-defect {
    background: color-mix(in srgb, var(--tracker-bad) 12%, transparent);
    color: var(--tracker-bad);
}
.status-badge.status-intentional {
    background: color-mix(in srgb, var(--tracker-intentional) 12%, transparent);
    color: var(--tracker-intentional);
}
.status-badge.status-deferred {
    background: color-mix(in srgb, var(--tracker-deferred) 12%, transparent);
    color: var(--tracker-deferred);
}
.reference-link {
    color: var(--vp-c-brand-1);
    text-decoration: underline;
    text-underline-offset: 2px;
}
.file-link {
    color: var(--vp-c-brand-1);
    font-size: 0.7rem;
    text-decoration: none;
}
.file-link {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.file-link:hover {
    text-decoration: underline;
}
button:focus-visible,
input:focus-visible,
.family > summary:focus-visible,
.file-link:focus-visible,
.reference-link:focus-visible {
    outline: 2px solid var(--vp-c-brand-1);
    outline-offset: 3px;
}
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

@media (max-width: 760px) {
    .overview-heading,
    .controls {
        align-items: stretch;
        flex-direction: column;
    }
    .snapshot-date {
        text-align: left;
    }
    .overview-heading {
        align-items: flex-start;
        flex-direction: column;
        gap: 0.7rem;
    }
    .search-field {
        flex-basis: auto;
    }
    .family > summary {
        align-items: flex-start;
    }
    .family-progress {
        min-width: 90px;
    }
    .family-progress progress {
        width: 80px;
    }
    .case {
        grid-template-columns: 0.5rem minmax(0, 1fr) auto;
    }
    .file-link {
        grid-column: 2 / -1;
    }
}

@media (max-width: 460px) {
    .overview-score {
        gap: 0.65rem;
    }
    .score-percent {
        font-size: 2.8rem;
    }
    .group-option {
        min-width: 75px;
    }
    .family > summary {
        gap: 0.5rem;
    }
    .family-title {
        align-items: flex-start;
        flex-direction: column;
        gap: 0.2rem;
    }
}
</style>
