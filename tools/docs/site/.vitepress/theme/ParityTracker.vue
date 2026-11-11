<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
    behaviorProgress,
    trackerPrimaryProgressPercent,
    trackerProgressPercent,
    trackerProgressTotal
} from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';
import { groupProgress, useTrackerSnapshot } from './parity';
import SiteBreadcrumb from './site-menu/SiteBreadcrumb.vue';

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
/** Families sort by pass rate, lowest first, so the open gaps lead; the toggle switches to A to Z. */
const sortByName = ref(false);
const familyCaseLimits = ref<Record<string, number>>({});
const { tracker, loadError } = useTrackerSnapshot();
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

const behavior = computed(() =>
    tracker.value === null ? { passed: 0, tracked: 0 } : behaviorProgress(tracker.value.families)
);

const groups = computed(() => {
    const snapshot = tracker.value;
    if (snapshot === null) return [{ id: 'all', label: 'All', passed: 0, tracked: 0 }];
    const allChecks = {
        checks: snapshot.checks,
        deferred: snapshot.deferred,
        defects: snapshot.defects
    };
    return [
        { id: 'all', label: 'All', passed: snapshot.passed, tracked: trackerProgressTotal(allChecks) },
        ...groupProgress(snapshot.families)
    ];
});

const sourceRevision = computed(() =>
    tracker.value !== null && /^[0-9a-f]{40}$/i.test(tracker.value.sourceCommit) ? tracker.value.sourceCommit : 'master'
);
const commitUrl = computed(() => `https://github.com/JSPrismarine/JSPrismarine/commit/${sourceRevision.value}`);
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
        )
        .sort((left, right) => {
            if (sortByName.value) return left.id.localeCompare(right.id);
            const rate = (family: (typeof snapshot.families)[number]) =>
                family.passed / Math.max(trackerProgressTotal(family), 1);
            return rate(left) - rate(right) || left.id.localeCompare(right.id);
        });
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
        <!-- A full-width page has no doc chrome, so the tracker places the breadcrumb itself. -->
        <SiteBreadcrumb class="tracker-crumb" />
        <header class="tracker-hero">
            <p class="tracker-eyebrow">
                <i></i>Parity tracker · generated
                <time :datetime="tracker.generatedAt">{{ tracker.generatedAt.slice(0, 10) }}</time> · commit
                <a :href="commitUrl">{{ sourceRevision.slice(0, 7) }}</a>
            </p>
            <h1>How close to vanilla.</h1>
            <div class="overview-score">
                <strong class="score-percent"
                    >{{ trackerPrimaryProgressPercent(behavior.passed, behavior.tracked) }}<span>%</span></strong
                >
                <div class="score-copy">
                    <h2>behavior parity</h2>
                    <span
                        >{{ behavior.passed.toLocaleString() }} of {{ behavior.tracked.toLocaleString() }} tracked
                        behavior comparisons passing. All comparisons, including data tables:
                        {{ trackerPrimaryProgressPercent(tracker.passed, trackerProgressTotal(tracker)) }}% ({{
                            tracker.passed.toLocaleString()
                        }}
                        of {{ trackerProgressTotal(tracker).toLocaleString() }}).</span
                    >
                </div>
            </div>
            <!-- The bar shows the headline figure, gameplay behavior, not the all-comparisons rate under it. -->
            <progress
                class="overall-progress"
                :value="behavior.passed"
                :max="Math.max(behavior.tracked, 1)"
                :aria-label="`${behavior.passed} of ${behavior.tracked} tracked behavior comparisons passing`"
            />
            <!-- The chips count every comparison; the headline counts behavior checks only. -->
            <p class="overview-counts-label">All comparisons, including data tables</p>
            <ul class="overview-counts" aria-label="All comparisons by status">
                <li class="status-count passed">
                    <b>{{ tracker.passed.toLocaleString() }}</b> passing
                </li>
                <li class="status-count failed" :class="{ 'is-zero': tracker.failed === 0 }">
                    <b>{{ tracker.failed.toLocaleString() }}</b> failing
                </li>
                <li class="status-count not-measured">
                    <b>{{ tracker.notMeasured.toLocaleString() }}</b> not measured
                </li>
                <li class="status-count intentional">
                    <b>{{ tracker.intentional.toLocaleString() }}</b> intentional differences
                </li>
                <li class="status-count deferred">
                    <b>{{ tracker.deferred.toLocaleString() }}</b> deferred
                </li>
                <li class="status-count defect">
                    <b>{{ tracker.defects.toLocaleString() }}</b> known defects
                </li>
            </ul>
        </header>

        <details class="tracker-notes">
            <summary>How the tracker counts</summary>
            <p>
                Cases include Java or Bedrock comparisons and explicit not-measured behavior inventories. A passing data
                row does not claim runtime behavior parity. Reviewed differences include clickable references; search by
                game identifier, behavior, family, or source file.
            </p>
            <p>
                The headline counts the families that run the server against Java rules: block, item and entity
                behavior, gameplay, integration and world generation. Data tables are counted in the second figure, so
                twelve thousand registry rows cannot hide a block that does nothing. Each percentage uses listed
                comparisons, including not-measured, deferred, and known-defect rows; intentional differences are
                excluded. A block, item or entity no scenario reached is not measured, not passing.
            </p>
        </details>

        <h2 class="tracker-section-title">Behavior groups</h2>
        <section class="group-picker" aria-label="Filter by family group">
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
                <span v-if="group.id === 'all'" class="group-option-count"
                    >{{ tracker?.cases.length.toLocaleString() ?? 0 }} cases</span
                >
                <!-- The percentage leads and the count follows on its own line, so no tile wraps mid-figure. -->
                <span v-else class="group-option-count">
                    <b :class="{ 'is-gap': group.passed * 2 < group.tracked }"
                        >{{ percentage(group.passed, group.tracked) }}%</b
                    >
                    <span>{{ group.passed }}/{{ group.tracked }}</span>
                </span>
                <progress
                    v-if="group.id !== 'all'"
                    :value="group.passed"
                    :max="Math.max(group.tracked, 1)"
                    aria-hidden="true"
                />
            </button>
        </section>

        <h2 class="tracker-section-title">Cases</h2>
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
                    >{{ displayedCaseCount.toLocaleString() }} of {{ matchingCaseCount.toLocaleString() }} matching
                    cases shown · {{ tracker.cases.length.toLocaleString() }} tracked</span
                >
                <span class="results-actions">
                    <button
                        type="button"
                        class="expand-toggle"
                        :aria-pressed="sortByName"
                        @click="sortByName = !sortByName"
                    >
                        {{ sortByName ? 'Sort: A to Z' : 'Sort: lowest first' }}
                    </button>
                    <button type="button" class="expand-toggle" @click="expanded = !expanded">
                        {{ expanded ? 'Collapse all' : 'Expand all' }}
                    </button>
                </span>
            </div>

            <p v-if="visibleFamilies.length === 0" class="empty-state">No parity cases match these filters.</p>

            <details v-for="family in visibleFamilies" :key="family.id" class="family" :open="expanded">
                <summary>
                    <span class="family-title">
                        <span class="family-name">{{ family.id }}</span>
                        <span class="family-count">{{ family.matchCount.toLocaleString() }} matching cases</span>
                    </span>
                    <span class="family-progress">
                        <span :class="{ 'is-gap': family.passed * 2 < trackerProgressTotal(family) }"
                            >{{ family.passed }}/{{ trackerProgressTotal(family) }} ·
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
    <p v-else-if="loadError" class="tracker tracker-message">
        Could not load the parity tracker data. Refresh to try again.
    </p>
    <p v-else class="tracker tracker-message">Loading parity tracker…</p>
</template>

<style scoped>
.tracker {
    --tracker-good: var(--jsp-accent);
    --tracker-bad: var(--jsp-signal);
    --tracker-intentional: var(--vp-c-yellow-1);
    --tracker-deferred: color-mix(in srgb, var(--jsp-signal) 55%, var(--vp-c-yellow-1));
    --tracker-muted: var(--vp-c-text-3);
    --tracker-border: var(--vp-c-divider);
    --tracker-surface: var(--vp-c-bg-soft);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--jsp-gap);
    max-width: 1200px;
    padding: 10px 16px 64px;
    margin: 0 auto;
    color: var(--vp-c-text-1);
}

.tracker-message {
    padding: 4rem 16px;
    color: var(--vp-c-text-2);
    text-align: center;
}

/* Hero: the score on a forest panel, as on the landing page. */
.tracker-hero {
    padding: clamp(16px, 3vw, 32px);
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.tracker-eyebrow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin: 0;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.tracker-eyebrow i {
    width: 10px;
    height: 10px;
    margin-right: 4px;
    background: var(--jsp-signal);
}

.tracker-eyebrow a {
    color: inherit;
}

.tracker-hero h1 {
    margin: 16px 0 20px;
    font-size: clamp(40px, 8vw, 88px);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.055em;
    color: var(--jsp-cream);
}

.overview-score {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    align-items: center;
}

.score-percent {
    font-size: clamp(56px, 10vw, 104px);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    line-height: 0.85;
    letter-spacing: -0.06em;
    color: var(--jsp-accent);
}

.score-percent span {
    margin-left: 0.04em;
    font-size: 0.45em;
}

.score-copy {
    display: grid;
    gap: 4px;
    max-width: 46ch;
}

.score-copy h2 {
    padding: 0;
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--jsp-cream);
    border: 0;
}

.score-copy > span {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--jsp-mint);
}

progress {
    width: 100%;
    height: 10px;
    appearance: none;
    background: var(--tracker-surface);
    border: 0;
}

progress::-webkit-progress-bar {
    background: var(--tracker-surface);
}

progress::-webkit-progress-value {
    background: var(--tracker-good);
}

progress::-moz-progress-bar {
    background: var(--tracker-good);
}

.tracker-hero progress,
.tracker-hero progress::-webkit-progress-bar {
    background: var(--jsp-track);
}

.overall-progress {
    height: 16px;
    margin: 24px 0 16px;
}

.overview-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.status-count {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 4px 12px 4px 10px;
    margin: 0;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-cream);
    border: 1.5px solid var(--jsp-track);
    border-radius: 99px;
}

.status-count::before {
    width: 8px;
    height: 8px;
    content: '';
    background: currentColor;
    border-radius: 50%;
}

.status-count b {
    font-variant-numeric: tabular-nums;
    color: var(--jsp-cream);
}

.status-count.passed::before {
    background: var(--tracker-good);
}

.status-count.failed::before,
.status-count.defect::before {
    background: var(--tracker-bad);
}

.status-count.not-measured::before {
    background: var(--jsp-term-muted);
}

/* Statuses differ by shape as well as color, and only defects and failures are filled signal. */
.status-count.intentional::before {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--tracker-intentional);
}

.status-count.deferred::before {
    background: transparent;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1.5px var(--jsp-mint);
}

.tracker-notes {
    padding: 0 4px;
    font-size: 16px;
    line-height: 1.6;
    color: var(--vp-c-text-2);
}

.tracker-notes {
    margin-top: 12px;
    border-block: 1px solid var(--vp-c-divider);
}

.tracker-notes summary {
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: var(--jsp-target);
    font-weight: 800;
    color: var(--vp-c-text-1);
    list-style: none;
    cursor: pointer;
}

.tracker-notes summary::-webkit-details-marker {
    display: none;
}

/* The same chevron the menu uses: a turned corner that points down when open. */
.tracker-notes summary::before {
    width: 7px;
    height: 7px;
    content: '';
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 0.12s;
}

.tracker-notes[open] summary::before {
    transform: rotate(45deg);
}

.tracker-notes[open] {
    padding-bottom: 16px;
}

@media (prefers-reduced-motion: reduce) {
    .tracker-notes summary::before {
        transition: none;
    }
}

.tracker-notes p {
    max-width: 70ch;
    margin: 8px 0 0;
}

.tracker-section-title {
    padding: 0;
    margin: 24px 4px 4px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border: 0;
}

/* Groups: solid tiles that filter the case list. */
.group-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: var(--jsp-gap);
}

.group-option {
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 6px;
    min-width: 0;
    padding: 14px;
    color: var(--vp-c-text-1);
    text-align: left;
    cursor: pointer;
    background: var(--tracker-surface);
    border: 2px solid transparent;
    border-radius: var(--jsp-radius-control);
}

.group-option:hover {
    border-color: var(--jsp-accent);
}

.group-option.active {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
}

.group-option-name {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.02em;
}

.group-option-count {
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    font-variant-numeric: tabular-nums;
    color: var(--vp-c-text-2);
}

.group-option-count b {
    display: block;
    font: 800 18px var(--vp-font-family-base);
    letter-spacing: -0.02em;
    color: var(--vp-c-text-1);
}

/* A group under half passing carries a signal square: the open gaps stand out from the finished groups. */
.family-progress .is-gap::before,
.group-option-count b.is-gap::before {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 6px;
    vertical-align: 2px;
    content: '';
    background: var(--jsp-signal);
}

.group-option.active .group-option-count b {
    color: inherit;
}

.group-option.active .group-option-count {
    color: inherit;
}

.group-option progress {
    /* The bar sits on the tile's bottom edge, so bars line up across a row even when a count wraps. */
    align-self: end;
    height: 6px;
}

.group-option.active progress,
.group-option.active progress::-webkit-progress-bar {
    background: color-mix(in srgb, var(--jsp-forest) 25%, transparent);
}

.group-option.active progress::-webkit-progress-value {
    background: var(--jsp-forest);
}

.group-option.active progress::-moz-progress-bar {
    background: var(--jsp-forest);
}

/* Filters and search. */
.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 8px;
}

.status-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.status-filters button,
.expand-toggle,
.case-more button {
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 700;
    color: var(--vp-c-text-1);
    cursor: pointer;
    background: transparent;
    border: 2px solid var(--tracker-border);
    border-radius: 99px;
}

.status-filters button:hover,
.expand-toggle:hover,
.case-more button:hover {
    border-color: var(--jsp-accent);
}

.status-filters button.active {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

.search-field {
    flex: 1 1 260px;
    max-width: 360px;
}

.search-field input {
    width: 100%;
    padding: 10px 14px;
    font: 15px var(--vp-font-family-base);
    color: var(--vp-c-text-1);
    background: var(--tracker-surface);
    border: 2px solid var(--tracker-border);
    border-radius: var(--jsp-radius-control);
}

.search-field input:focus-visible {
    border-color: var(--jsp-accent);
    outline: none;
}

.results-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 10px;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--tracker-muted);
}

.empty-state {
    padding: 2rem 0;
    color: var(--tracker-muted);
    text-align: center;
}

/* Families: flat cards, one per family. */
.case-list {
    display: grid;
    gap: 6px;
}

.family {
    background: var(--tracker-surface);
    border-radius: var(--jsp-radius-control);
}

.family > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 16px;
    align-items: center;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
}

.family > summary::-webkit-details-marker {
    display: none;
}

.family-title {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    align-items: baseline;
    min-width: 0;
}

.family-title::before {
    width: 0;
    height: 0;
    margin-right: 2px;
    content: '';
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid var(--jsp-accent);
    transition: transform 0.15s;
}

.family[open] > summary .family-title::before {
    transform: rotate(90deg);
}

.family-name {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
}

.family-count {
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--tracker-muted);
}

.family-progress {
    display: grid;
    gap: 6px;
    justify-items: end;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    font-variant-numeric: tabular-nums;
    color: var(--tracker-muted);
}

/* The track is a flat forest tint, the brand's own track color, so a partial bar reads against the row. */
.family-progress progress {
    width: 160px;
    height: 6px;
    background: color-mix(in srgb, var(--jsp-forest) 18%, transparent);
}

.family-progress progress::-webkit-progress-bar {
    background: color-mix(in srgb, var(--jsp-forest) 18%, transparent);
}

.dark .family-progress progress,
.dark .family-progress progress::-webkit-progress-bar {
    background: color-mix(in srgb, var(--jsp-mint) 18%, transparent);
}

.cases {
    padding: 0 16px 8px;
    margin: 0;
    list-style: none;
}

.case {
    display: grid;
    grid-template-columns: 0.5rem minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
    padding: 10px 0;
    margin: 0;
    border-top: 1px solid var(--tracker-border);
}

.case-more {
    padding: 10px 0 6px;
    margin: 0;
    list-style: none;
}

.status-mark {
    width: 0.5rem;
    height: 0.5rem;
    background: var(--tracker-muted);
    border-radius: 50%;
}

.status-mark.status-passed {
    background: var(--tracker-good);
}

.status-mark.status-failed,
.status-mark.status-defect {
    background: var(--tracker-bad);
}

.status-mark.status-intentional {
    background: var(--tracker-intentional);
}

.status-mark.status-deferred {
    background: var(--tracker-deferred);
}

.case-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.case-title {
    font-size: 14px;
    font-weight: 700;
    overflow-wrap: anywhere;
}

.case-context,
.case-details {
    max-width: 70ch;
    font-size: 13px;
    line-height: 1.5;
    color: var(--vp-c-text-2);
    overflow-wrap: anywhere;
}

.runtime-support {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--vp-c-text-2);
}

.runtime-support strong {
    font-weight: 700;
    color: var(--vp-c-text-1);
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

.status-badge {
    padding: 3px 10px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    border: 1.5px solid var(--tracker-border);
    border-radius: 99px;
}

.status-badge.status-passed {
    color: var(--jsp-forest);
    background: var(--tracker-good);
    border-color: var(--tracker-good);
}

.status-badge.status-failed,
.status-badge.status-defect {
    color: var(--jsp-ink);
    background: var(--tracker-bad);
    border-color: var(--tracker-bad);
}

.status-badge.status-intentional {
    color: var(--tracker-intentional);
    border-color: var(--tracker-intentional);
}

.status-badge.status-deferred {
    color: var(--tracker-deferred);
    border-color: var(--tracker-deferred);
}

.reference-link {
    color: var(--vp-c-brand-1);
    text-decoration: underline;
    text-underline-offset: 2px;
}

.file-link {
    max-width: 170px;
    overflow: hidden;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-brand-1);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-link:hover {
    text-decoration: underline;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

@media (max-width: 640px) {
    .family > summary {
        grid-template-columns: minmax(0, 1fr);
    }

    .family-progress {
        justify-items: start;
    }

    .family-progress progress {
        width: 100%;
    }

    .case {
        grid-template-columns: 0.5rem minmax(0, 1fr) auto;
    }

    .file-link {
        grid-column: 2 / -1;
        max-width: 100%;
    }
}

@media (prefers-reduced-motion: reduce) {
    .family-title::before {
        transition: none;
    }
}

@media (max-width: 640px) {
    .status-filters button,
    .expand-toggle,
    .case-more button {
        min-height: var(--jsp-target);
    }
}
.tracker-crumb {
    margin: 4px 4px 10px;
}

.results-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.overview-counts-label {
    margin: 14px 0 6px;
    font-size: 14px;
    font-weight: 700;
    color: var(--jsp-mint);
}

/* A zero count is good news, so its dot is a neutral mint ring rather than signal; ink would vanish on forest. */
.status-count.is-zero::before {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--jsp-mint);
}

/* Section labels open on the short solid bar doc pages give their sections. */
.tracker-section-title::before {
    display: block;
    width: 40px;
    height: 5px;
    margin-bottom: 14px;
    content: '';
    background: var(--vp-c-brand-1);
}
</style>
